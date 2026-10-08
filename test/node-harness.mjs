// Banc de test du nœud Kraken : simule le contexte n8n, intercepte fetch,
// et vérifie le comportement réel du code sans jamais toucher l'API Kraken.
import { Kraken } from './n8n-nodes-kraken/nodes/Kraken.node.ts';
import { createHash, createHmac } from 'node:crypto';

const FAKE_KEY = 'AK1234567890TESTKEY';
const FAKE_SECRET_PLAIN = 'my-test-secret-plain-bytes';
const FAKE_SECRET = Buffer.from(FAKE_SECRET_PLAIN, 'utf8').toString('base64');

const captured = [];
globalThis.fetch = async (url, init) => {
  captured.push({ url: String(url), init });
  return {
    ok: true,
    status: 200,
    json: async () => ({ error: [], result: { ok: true } }),
    text: async () => '{}',
  };
};

function makeCtx(params, items = [{ json: {} }]) {
  return {
    getInputData: () => items,
    getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
    getCredentials: async () => ({ apiKey: FAKE_KEY, apiSecret: FAKE_SECRET }),
  };
}

// Référence indépendante de l'algo de signature documenté par Kraken
function referenceSign(uriPath, bodyStr, secretB64) {
  const nonce = new URLSearchParams(bodyStr).get('nonce');
  const sha256 = createHash('sha256').update(nonce + bodyStr).digest();
  return createHmac('sha512', Buffer.from(secretB64, 'base64'))
    .update(uriPath)
    .update(sha256)
    .digest('base64');
}

const results = [];
function check(name, cond, detail = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

// ---- Test 1 : endpoint public, construction de l'URL GET
captured.length = 0;
const kraken = new Kraken();
await kraken.execute.call(makeCtx({ resource: 'public', operation: 'getTicker', pair: 'XBTUSD,ETHUSD' }));
check('T1 URL publique', captured[0].url === 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD%2CETHUSD', captured[0].url);
check('T1 méthode GET', captured[0].init.method === 'GET');
check('T1 pas de header API-Key en public', !('API-Key' in captured[0].init.headers));

// ---- Test 2 : endpoint privé, signature et en-têtes
captured.length = 0;
await kraken.execute.call(makeCtx({ resource: 'private', operation: 'getBalance' }));
const req = captured[0];
const uriPath = new URL(req.url).pathname;
check('T2 URL privée', req.url === 'https://api.kraken.com/0/private/Balance', req.url);
check('T2 méthode POST', req.init.method === 'POST');
check('T2 header API-Key', req.init.headers['API-Key'] === FAKE_KEY);
check('T2 Content-Type form-urlencoded', req.init.headers['Content-Type'] === 'application/x-www-form-urlencoded');
check('T2 body nonce présent', new URLSearchParams(req.init.body).has('nonce'));
check('T2 signature = référence indépendante', req.init.headers['API-Sign'] === referenceSign(uriPath, req.init.body, FAKE_SECRET),
  `node=${req.init.headers['API-Sign']?.slice(0, 20)}... ref=${referenceSign(uriPath, req.init.body, FAKE_SECRET)?.slice(0, 20)}...`);

// ---- Test 3 : nonces strictement croissants sur 2 exécutions dans la même ms
captured.length = 0;
await kraken.execute.call(makeCtx({ resource: 'private', operation: 'getBalance' }, [{ json: {} }, { json: {} }]));
const nonces = captured.map((c) => BigInt(new URLSearchParams(c.init.body).get('nonce')));
check('T3 deux requêtes pour deux items', captured.length === 2);
check('T3 nonce item1 < nonce item2', nonces[0] < nonces[1], `${nonces[0]} < ${nonces[1]}`);
check('T3 signatures distinctes', captured[0].init.headers['API-Sign'] !== captured[1].init.headers['API-Sign']);

// ---- Test 4 : opération avec paramètres (AddOrder) — flags booléens et chaînes
captured.length = 0;
await kraken.execute.call(makeCtx({
  resource: 'private', operation: 'addOrder',
  pair: 'XBTUSD', type: 'buy', ordertype: 'limit', volume: '0.001', price: '50000',
  validate: true, leverage: '', oflags: 'post',
}));
const addBody = new URLSearchParams(captured[0].init.body);
check('T4 body AddOrder contient pair/type/ordertype/volume/price',
  addBody.get('pair') === 'XBTUSD' && addBody.get('type') === 'buy' &&
  addBody.get('ordertype') === 'limit' && addBody.get('volume') === '0.001' && addBody.get('price') === '50000');
check('T4 validate=true envoyé', addBody.get('validate') === 'true');
check('T4 leverage vide non envoyé', !addBody.has('leverage'));

// ---- Test 5 : erreur Kraken (error[]) transformée en exception n8n
captured.length = 0;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ error: ['EAPI:Invalid nonce'], result: null }), text: async () => '{}' });
let threw = '';
try { await kraken.execute.call(makeCtx({ resource: 'private', operation: 'getBalance' })); }
catch (e) { threw = e.message; }
check('T5 erreur API -> exception avec message', threw.includes('EAPI:Invalid nonce'), threw);

// ---- Test 6 : HTTP non-200 -> exception
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => 'Service unavailable' });
threw = '';
try { await kraken.execute.call(makeCtx({ resource: 'public', operation: 'getServerTime' })); }
catch (e) { threw = e.message; }
check('T6 HTTP 503 -> exception', threw.includes('503'), threw);

console.log(results.join('\n'));
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} PASS${fails ? ', ' + fails + ' FAIL' : ''}`);
process.exit(fails ? 1 : 0);
