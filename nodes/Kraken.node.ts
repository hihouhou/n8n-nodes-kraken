import { createHash, createHmac } from 'crypto';
import type {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeProperties,
  IHttpRequestMethods,
  INodeExecutionData,
  IDataObject,
} from 'n8n-workflow';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const BASE_URL = 'https://api.kraken.com';

const PUBLIC_OPERATIONS: Record<string, { path: string; label: string; fields: INodeProperties[] }> = {
  getSystemStatus: {
    path: '/0/public/SystemStatus',
    label: 'Get System Status',
    fields: [],
  },
  getAssets: {
    path: '/0/public/Assets',
    label: 'Get Assets',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        default: '',
        description: 'Comma-separated list of assets to retrieve info about (optional). e.g. XBT,ETH',
      },
    ],
  },
  getAssetPairs: {
    path: '/0/public/AssetPairs',
    label: 'Get Asset Pairs',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        default: '',
        description: 'Comma-separated list of asset pairs (optional). e.g. XBTUSD,ETHUSD',
      },
    ],
  },
  getTicker: {
    path: '/0/public/Ticker',
    label: 'Get Ticker',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        required: true,
        default: '',
        description: 'Comma-separated list of asset pairs. e.g. XBTUSD,ETHUSD',
      },
    ],
  },
  getOhlc: {
    path: '/0/public/OHLC',
    label: 'Get OHLC',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        required: true,
        default: '',
        description: 'Asset pair. e.g. XBTUSD',
      },
      {
        displayName: 'Interval (minutes)',
        name: 'interval',
        type: 'options',
        options: [
          { name: '1', value: 1 },
          { name: '5', value: 5 },
          { name: '15', value: 15 },
          { name: '30', value: 30 },
          { name: '60', value: 60 },
          { name: '240', value: 240 },
          { name: '1440', value: 1440 },
          { name: '10080', value: 10080 },
          { name: '21600', value: 21600 },
        ],
        default: 1,
      },
      {
        displayName: 'Since',
        name: 'since',
        type: 'string',
        default: '',
        description: 'Return committed OHLC data since given unix timestamp (optional)',
      },
    ],
  },
  getOrderBook: {
    path: '/0/public/Depth',
    label: 'Get Order Book',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        required: true,
        default: '',
        description: 'Asset pair. e.g. XBTUSD',
      },
      {
        displayName: 'Count',
        name: 'count',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 500 },
        default: 10,
        description: 'Maximum number of asks/bids (max 500)',
      },
    ],
  },
  getRecentTrades: {
    path: '/0/public/Trades',
    label: 'Get Recent Trades',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        required: true,
        default: '',
        description: 'Asset pair. e.g. XBTUSD',
      },
      {
        displayName: 'Since',
        name: 'since',
        type: 'string',
        default: '',
        description: 'Return trade data since given unix timestamp (optional)',
      },
    ],
  },
  getServerTime: {
    path: '/0/public/Time',
    label: 'Get Server Time',
    fields: [],
  },
};

const PRIVATE_OPERATIONS: Record<string, { path: string; label: string; fields: INodeProperties[] }> = {
  // --- Account / balances ---
  getBalance: {
    path: '/0/private/Balance',
    label: 'Get Balance',
    fields: [],
  },
  getTradeBalance: {
    path: '/0/private/TradeBalance',
    label: 'Get Trade Balance',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        default: '',
        description: 'Base asset used to determine balance. e.g. ZUSD (optional)',
      },
    ],
  },

  // --- Orders ---
  addOrder: {
    path: '/0/private/AddOrder',
    label: 'Add Order',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        required: true,
        default: '',
        description: 'Asset pair. e.g. XBTUSD',
      },
      {
        displayName: 'Type',
        name: 'type',
        type: 'options',
        options: [
          { name: 'Buy', value: 'buy' },
          { name: 'Sell', value: 'sell' },
        ],
        required: true,
        default: 'buy',
      },
      {
        displayName: 'Order Type',
        name: 'ordertype',
        type: 'options',
        options: [
          { name: 'Market', value: 'market' },
          { name: 'Limit', value: 'limit' },
          { name: 'Stop-Loss', value: 'stop-loss' },
          { name: 'Take-Profit', value: 'take-profit' },
          { name: 'Stop-Loss-Limit', value: 'stop-loss-limit' },
          { name: 'Take-Profit-Limit', value: 'take-profit-limit' },
          { name: 'Settle-Position', value: 'settle-position' },
        ],
        required: true,
        default: 'limit',
      },
      {
        displayName: 'Volume',
        name: 'volume',
        type: 'string',
        required: true,
        default: '',
        description: 'Order quantity in terms of the base asset',
      },
      {
        displayName: 'Price',
        name: 'price',
        type: 'string',
        default: '',
        description: 'Price (limit/stop/take-profit orders)',
      },
      {
        displayName: 'Price2',
        name: 'price2',
        type: 'string',
        default: '',
        description: 'Secondary price (stop-loss-limit, take-profit-limit)',
      },
      {
        displayName: 'Leverage',
        name: 'leverage',
        type: 'string',
        default: '',
        description: 'Amount of leverage desired (optional)',
      },
      {
        displayName: 'Order Flags',
        name: 'oflags',
        type: 'string',
        default: '',
        description: 'Comma-separated list of order flags: viqc, fcib, fciq, nompp, post (optional)',
      },
      {
        displayName: 'Start Timestamp (RFC3339)',
        name: 'starttm',
        type: 'string',
        default: '',
        description: 'Scheduled start time (optional)',
      },
      {
        displayName: 'Expire Timestamp (RFC3339)',
        name: 'expiretm',
        type: 'string',
        default: '',
        description: 'Expiration time (optional)',
      },
      {
        displayName: 'Validate Only',
        name: 'validate',
        type: 'boolean',
        default: false,
        description: 'Validate inputs only, do not submit the order',
      },
      {
        displayName: 'Client Order ID',
        name: 'cl_ord_id',
        type: 'string',
        default: '',
        description: 'User-defined id for order (max 32 chars, optional)',
      },
    ],
  },
  editOrder: {
    path: '/0/private/EditOrder',
    label: 'Edit Order',
    fields: [
      {
        displayName: 'Transaction ID (txid)',
        name: 'txid',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Volume',
        name: 'volume',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        default: '',
        description: 'Required if not already known (optional)',
      },
      {
        displayName: 'Price',
        name: 'price',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Price2',
        name: 'price2',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Validate Only',
        name: 'validate',
        type: 'boolean',
        default: false,
      },
    ],
  },
  cancelOrder: {
    path: '/0/private/CancelOrder',
    label: 'Cancel Order',
    fields: [
      {
        displayName: 'Transaction ID (txid)',
        name: 'txid',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },
  cancelAllOrders: {
    path: '/0/private/CancelAllOrders',
    label: 'Cancel All Orders',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        default: '',
        description: 'Cancel only orders for this pair (optional)',
      },
    ],
  },
  cancelAllOrdersAfter: {
    path: '/0/private/CancelAllOrdersAfter',
    label: 'Cancel All Orders After (Dead Man Switch)',
    fields: [
      {
        displayName: 'Timeout (seconds)',
        name: 'timeout',
        type: 'number',
        required: true,
        typeOptions: { minValue: 0 },
        default: 0,
        description: '0 disables the dead-man switch',
      },
    ],
  },
  getOpenOrders: {
    path: '/0/private/OpenOrders',
    label: 'Get Open Orders',
    fields: [
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
        description: 'Include trades related to position in output',
      },
      {
        displayName: 'User Reference',
        name: 'userref',
        type: 'string',
        default: '',
        description: 'Restrict results to a user reference (optional)',
      },
    ],
  },
  getClosedOrders: {
    path: '/0/private/ClosedOrders',
    label: 'Get Closed Orders',
    fields: [
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'User Reference',
        name: 'userref',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Start Timestamp',
        name: 'start',
        type: 'string',
        default: '',
        description: 'Unix timestamp or ledger id (optional)',
      },
      {
        displayName: 'End Timestamp',
        name: 'end',
        type: 'string',
        default: '',
        description: 'Unix timestamp or ledger id (optional)',
      },
      {
        displayName: 'Offset',
        name: 'ofs',
        type: 'number',
        default: 0,
        description: 'Result offset for pagination',
      },
      {
        displayName: 'Close Time Filter',
        name: 'closetime',
        type: 'options',
        options: [
          { name: 'Open', value: 'open' },
          { name: 'Close', value: 'close' },
          { name: 'Both', value: 'both' },
        ],
        default: 'both',
      },
    ],
  },
  queryOrders: {
    path: '/0/private/QueryOrders',
    label: 'Query Orders',
    fields: [
      {
        displayName: 'Transaction IDs (txid)',
        name: 'txid',
        type: 'string',
        required: true,
        default: '',
        description: 'Comma-separated list of transaction ids',
      },
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'User Reference',
        name: 'userref',
        type: 'string',
        default: '',
      },
    ],
  },

  // --- Positions / trades ---
  getOpenPositions: {
    path: '/0/private/OpenPositions',
    label: 'Get Open Positions',
    fields: [
      {
        displayName: 'Transaction IDs (txid)',
        name: 'txid',
        type: 'string',
        default: '',
        description: 'Comma-separated list of txids (optional)',
      },
      {
        displayName: 'Consolidation',
        name: 'consolidation',
        type: 'options',
        options: [
          { name: 'Market', value: 'market' },
          { name: 'None', value: 'none' },
        ],
        default: 'market',
      },
    ],
  },
  getTradesHistory: {
    path: '/0/private/TradesHistory',
    label: 'Get Trades History',
    fields: [
      {
        displayName: 'Type',
        name: 'type',
        type: 'options',
        options: [
          { name: 'All', value: 'all' },
          { name: 'Any Position', value: 'any position' },
          { name: 'Closed Position', value: 'closed position' },
          { name: 'Closing Position', value: 'closing position' },
          { name: 'No Position', value: 'no position' },
        ],
        default: 'all',
      },
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
      },
      {
        displayName: 'Start Timestamp',
        name: 'start',
        type: 'string',
        default: '',
      },
      {
        displayName: 'End Timestamp',
        name: 'end',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Offset',
        name: 'ofs',
        type: 'number',
        default: 0,
      },
    ],
  },
  queryTrades: {
    path: '/0/private/QueryTrades',
    label: 'Query Trades',
    fields: [
      {
        displayName: 'Transaction IDs (txid)',
        name: 'txid',
        type: 'string',
        required: true,
        default: '',
        description: 'Comma-separated list of txids',
      },
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
      },
    ],
  },
  getTradeVolume: {
    path: '/0/private/TradeVolume',
    label: 'Get Trade Volume',
    fields: [
      {
        displayName: 'Pair',
        name: 'pair',
        type: 'string',
        default: '',
        description: 'Comma-separated list of asset pairs (optional)',
      },
      {
        displayName: 'Fee Info',
        name: 'fee_info',
        type: 'boolean',
        default: true,
      },
    ],
  },

  // --- Ledger ---
  getLedgers: {
    path: '/0/private/Ledgers',
    label: 'Get Ledgers',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        default: '',
        description: 'Comma-separated list of assets (optional)',
      },
      {
        displayName: 'Ledger Type',
        name: 'type',
        type: 'options',
        options: [
          { name: 'All', value: 'all' },
          { name: 'Deposit', value: 'deposit' },
          { name: 'Withdrawal', value: 'withdrawal' },
          { name: 'Trade', value: 'trade' },
          { name: 'Margin', value: 'margin' },
        ],
        default: 'all',
      },
      {
        displayName: 'Start Timestamp',
        name: 'start',
        type: 'string',
        default: '',
      },
      {
        displayName: 'End Timestamp',
        name: 'end',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Offset',
        name: 'ofs',
        type: 'number',
        default: 0,
      },
    ],
  },
  queryLedgers: {
    path: '/0/private/QueryLedgers',
    label: 'Query Ledgers',
    fields: [
      {
        displayName: 'Ledger IDs',
        name: 'id',
        type: 'string',
        required: true,
        default: '',
        description: 'Comma-separated list of ledger ids',
      },
      {
        displayName: 'Trades',
        name: 'trades',
        type: 'boolean',
        default: false,
      },
    ],
  },

  // --- Deposits ---
  getDepositMethods: {
    path: '/0/private/DepositMethods',
    label: 'Get Deposit Methods',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },
  getDepositAddresses: {
    path: '/0/private/DepositAddresses',
    label: 'Get Deposit Addresses',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'New',
        name: 'new',
        type: 'boolean',
        default: false,
        description: 'Generate a new address if none exists',
      },
    ],
  },
  getDepositStatus: {
    path: '/0/private/DepositStatus',
    label: 'Get Deposit Status',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'string',
        default: '',
      },
    ],
  },

  // --- Withdrawals ---
  getWithdrawalInfo: {
    path: '/0/private/WithdrawInfo',
    label: 'Get Withdrawal Info',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        required: true,
        default: '',
        description: 'Withdrawal key name, as set up in your Kraken account',
      },
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },
  withdraw: {
    path: '/0/private/Withdraw',
    label: 'Withdraw Funds',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Key',
        name: 'key',
        type: 'string',
        required: true,
        default: '',
        description: 'Withdrawal key name, as set up in your Kraken account',
      },
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },
  getWithdrawalStatus: {
    path: '/0/private/WithdrawStatus',
    label: 'Get Withdrawal Status',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        default: '',
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'string',
        default: '',
      },
    ],
  },
  cancelWithdrawal: {
    path: '/0/private/WithdrawCancel',
    label: 'Cancel Withdrawal',
    fields: [
      {
        displayName: 'Asset',
        name: 'asset',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Reference ID',
        name: 'refid',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },

  // --- Subaccounts ---
  getSubaccounts: {
    path: '/0/private/ListSubaccounts',
    label: 'Get Subaccounts',
    fields: [
      {
        displayName: 'Include Names',
        name: 'names',
        type: 'boolean',
        default: true,
      },
    ],
  },

  // --- Reports / exports ---
  createReport: {
    path: '/0/private/AddExport',
    label: 'Create Report (Export)',
    fields: [
      {
        displayName: 'Report',
        name: 'report',
        type: 'options',
        options: [
          { name: 'Trades', value: 'trades' },
          { name: 'Ledgers', value: 'ledgers' },
        ],
        required: true,
        default: 'trades',
      },
      {
        displayName: 'Format',
        name: 'format',
        type: 'options',
        options: [
          { name: 'CSV', value: 'CSV' },
          { name: 'TSV', value: 'TSV' },
        ],
        default: 'CSV',
      },
      {
        displayName: 'Fields',
        name: 'fields',
        type: 'string',
        default: '',
        description: 'Comma-separated list of fields to include (optional)',
      },
    ],
  },
  getReportStatus: {
    path: '/0/private/ExportStatus',
    label: 'Get Report Status',
    fields: [],
  },
  retrieveReport: {
    path: '/0/private/RetrieveExport',
    label: 'Retrieve Report Data',
    fields: [
      {
        displayName: 'Report ID',
        name: 'id',
        type: 'string',
        required: true,
        default: '',
      },
    ],
  },
  deleteReport: {
    path: '/0/private/RemoveExport',
    label: 'Delete Report',
    fields: [
      {
        displayName: 'Report ID',
        name: 'id',
        type: 'string',
        required: true,
        default: '',
      },
      {
        displayName: 'Delete Files',
        name: 'files',
        type: 'boolean',
        default: true,
      },
    ],
  },
};

function toOptions(map: Record<string, { label: string }>): Array<{ name: string; value: string }> {
  return Object.entries(map).map(([value, v]) => ({ name: v.label, value }));
}

/* ------------------------------------------------------------------ */
/* Node                                                                */
/* ------------------------------------------------------------------ */

// Module-level monotonic nonce: guarantees a strictly increasing nonce even when
// several items are processed within the same millisecond (Kraken rejects any
// nonce <= the highest one ever used with the API key: EAPI:Invalid nonce).
let lastNonce = 0;

export class Kraken implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Kraken',
    name: 'kraken',
    icon: 'file:kraken.svg',
    group: ['transform'],
    version: 2,
    description: 'Interact with the Kraken crypto exchange API (public + private, auto-signed)',
    defaults: { name: 'Kraken' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'krakenApi',
        required: false,
        displayOptions: {
          show: {
            resource: ['private'],
          },
        },
      },
    ],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Private (requires credentials)', value: 'private' },
          { name: 'Public (no credentials)', value: 'public' },
        ],
        default: 'public',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        required: true,
        displayOptions: { show: { resource: ['public'] } },
        options: toOptions(PUBLIC_OPERATIONS),
        default: 'getTicker',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        required: true,
        displayOptions: { show: { resource: ['private'] } },
        options: toOptions(PRIVATE_OPERATIONS),
        default: 'getBalance',
      },
      // Public operation fields
      ...Object.entries(PUBLIC_OPERATIONS).flatMap(([opKey, op]) =>
        op.fields.map((field) => ({
          ...field,
          displayOptions: {
            show: {
              resource: ['public'],
              operation: [opKey],
            },
          },
        })),
      ),
      // Private operation fields
      ...Object.entries(PRIVATE_OPERATIONS).flatMap(([opKey, op]) =>
        op.fields.map((field) => ({
          ...field,
          displayOptions: {
            show: {
              resource: ['private'],
              operation: [opKey],
            },
          },
        })),
      ),
    ],
  };

  async execute(this: IExecuteFunctions) {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter('operation', i) as string;

      const ops = resource === 'public' ? PUBLIC_OPERATIONS : PRIVATE_OPERATIONS;
      const opDef = ops[operation];
      if (!opDef) {
        throw new Error(`Unknown ${resource} operation: ${operation}`);
      }

      // Collect parameters for this operation
      const params: Record<string, string | boolean | number> = {};
      for (const field of opDef.fields) {
        const value = this.getNodeParameter(field.name, i, field.default ?? '');
        if (value !== '' && value !== null && value !== undefined) {
          if (field.type === 'boolean' && value === false) continue;
          params[field.name] = value as string | boolean | number;
        }
      }

      let url = `${BASE_URL}${opDef.path}`;
      let method: IHttpRequestMethods = 'GET';
      let bodyStr = '';
      const headers: Record<string, string> = {
        'User-Agent': 'n8n-nodes-kraken/1.1.2',
      };

      if (resource === 'public') {
        const qs = new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        );
        if (qs.toString()) {
          url += `?${qs.toString()}`;
        }
      } else {
        // Private: signature required
        const creds = (await this.getCredentials('krakenApi')) as {
          apiKey: string;
          apiSecret: string;
        };

        method = 'POST';
        const nonce = Math.max(Date.now() * 1000, lastNonce + 1); // µs timestamp, strictly increasing even for rapid consecutive calls
        lastNonce = nonce;
        const body = new URLSearchParams({ nonce: String(nonce) });
        for (const [k, v] of Object.entries(params)) {
          body.append(k, String(v));
        }
        bodyStr = body.toString();

        const uriPath = opDef.path;
        // API-Sign = base64(HMAC-SHA512(uriPath + SHA256_raw(nonce + postData), base64decode(secret)))
        // NOTE: the SHA256 digest is concatenated as RAW BYTES (not hex), per Kraken spec.
        const sha256 = createHash('sha256').update(String(nonce) + bodyStr).digest();
        const secret = Buffer.from(creds.apiSecret, 'base64');
        const signature = createHmac('sha512', secret)
          .update(uriPath)
          .update(sha256)
          .digest('base64');

        headers['API-Key'] = creds.apiKey;
        headers['API-Sign'] = signature;
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Kraken API HTTP ${response.status} on ${opDef.path}: ${text.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as Record<string, unknown>;

      if (Array.isArray(json.error) && (json.error as string[]).length > 0) {
        throw new Error(`Kraken API error on ${opDef.path}: ${(json.error as string[]).join('; ')}`);
      }

      returnData.push({ json: json.result as IDataObject });
    }

    return [returnData];
  }
}
