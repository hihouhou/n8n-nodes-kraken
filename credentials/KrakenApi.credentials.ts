import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class KrakenApi implements ICredentialType {
  name = 'krakenApi'; // doit correspondre à `credentials[].name` de Kraken.node.ts
  displayName = 'Kraken API';
  documentationUrl = 'https://docs.kraken.com/api/docs/rest-api';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      required: true,
      default: '',
    },
    {
      displayName: 'API Secret',
      name: 'apiSecret',
      type: 'string',
      required: true,
      default: '',
      typeOptions: { password: true },
    },
  ];
}
