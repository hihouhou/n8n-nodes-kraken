# n8n-nodes-kraken

Node n8n custom pour l'API Kraken avec **credential natif** (clé + secret chiffrés par n8n) et **signature HMAC-SHA512 automatique** (module `crypto` natif Node, **zéro dépendance supplémentaire**). Pas besoin de nœud Code ni de variables d'environnement.

## Contenu

- **Credential `Kraken API`** : API Key + API Secret (secret masqué, chiffré avec `N8N_ENCRYPTION_KEY`)
- **Nœud `Kraken`** avec deux ressources :
  - **Public** (sans credentials) : System Status, Assets, Asset Pairs, Ticker, OHLC, Order Book, Recent Trades, Server Time
  - **Private** (credentials requis) :
    - *Comptes* : Balance, Trade Balance
    - *Ordres* : AddOrder, EditOrder, CancelOrder, CancelAllOrders, CancelAllOrdersAfter (dead man's switch), OpenOrders, ClosedOrders, QueryOrders
    - *Positions & trades* : OpenPositions, TradesHistory, QueryTrades, TradeVolume
    - *Ledger* : Ledgers, QueryLedgers
    - *Dépôts* : DepositMethods, DepositAddresses, DepositStatus
    - *Retraits* : WithdrawInfo, Withdraw, WithdrawStatus, WithdrawCancel
    - *Sous-comptes* : ListSubaccounts
    - *Rapports* : AddExport, ExportStatus, RetrieveExport, RemoveExport

## Build

```bash
npm install
npm run build
```

Génère `dist/nodes/Kraken.node.js`, `dist/credentials/KrakenApi.credentials.js`, leurs `.d.ts` et copie l'icône `kraken.svg` dans `dist/nodes/` (requis pour l'affichage du nœud dans n8n).

> ⚠️ Ne compilez **pas** avec `outDir: "."` : TypeScript exclut automatiquement le dossier de sortie, et comme il est aussi le dossier des sources, vous obtiendriez l'erreur `TS18003: No inputs were found`. C'est pour cela que la sortie est dans `dist/`.

## Installation (n8n auto-hébergé)

### Docker (recommandé)

1. Copiez le dossier `n8n-nodes-kraken` (compilé) dans un dossier monté, ex. `./custom-nodes/n8n-nodes-kraken`.

2. Dans votre `docker-compose.yml` :

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom
    volumes:
      - ./custom-nodes:/home/node/.n8n/custom
```

3. `docker compose restart n8n`

### npm global

```bash
npm install -g /chemin/vers/n8n-nodes-kraken
# puis démarrer n8n avec NODE_PATH pointant vers les modules globaux
export NODE_PATH=$(npm root -g)
n8n start
```

### n8n CLI (nouvelles versions)

```bash
n8n add:node /chemin/vers/n8n-nodes-kraken
```

## Utilisation

1. Dans n8n : **Credentials → Add credential → Kraken API**
2. Collez votre **API Key** et votre **API Secret** (générés sur Kraken : Sécurité → API)
3. Créez un nœud **Kraken** dans un workflow :
   - **Resource = Public** : aucune credential nécessaire (ex. Ticker sur XBTUSD)
   - **Resource = Private** : sélectionnez votre credential (ex. Get Balance)
4. Exécutez

## Détails techniques

- Signature : `API-Sign = base64(HMAC-SHA512(uriPath + SHA256(nonce + postData), base64decode(secret)))`
- Nonce en **nanosecondes** (`Date.now() * 1000`) : strictement croissant entre deux requêtes rapprochées
- Les erreurs Kraken (`{"error": [...]}`) sont converties en erreur n8n explicite
- Champs vides/optionnels non envoyés (conformité avec l'API)

## ⚠️ Limites

- **n8n Cloud** : impossible d'installer des packages custom → utilisez l'approche nœud Code + HTTP Request, ou publiez le package sur npm et proposez-le au [programme de nodes communautaires n8n](https://docs.n8n.io/integrations/community-nodes/submit-community-node/)
- Vérifiez les **permissions** de votre clé API sur Kraken (ex. Funds pour Balance, Withdraw Funds pour Withdraw) : une action sans permission retournera `EGeneral:Permission denied`

## Licence

MIT

## Tests (hors-ligne, sans clé API)

Le dossier `test/` contient un banc de test qui simule le contexte n8n et intercepte `fetch` : il vérifie la construction des URL, les en-têtes, la conformité de la signature `API-Sign` avec l'algorithme documenté par Kraken, la stricte croissance des nonces, et la remontée des erreurs. Aucun appel réseau réel, aucune clé requise.

```bash
node --experimental-strip-types test/node-harness.mjs
# 17/17 PASS attendu
```
