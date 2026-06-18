# Discount resolver Worker

Resolves the discount offer for `discount.html` (on `resources.miacademy.co`) and
returns it. **Stores nothing and sends no email** — it exists only so the codes,
pricing, and income thresholds stay **server-side** (out of the browser and this
public repo).

- All discount content lives in `offers.config.js` — **gitignored** and **bundled
  into the Worker at deploy**. `src/index.js` holds only logic. See
  `offers.config.example.js` for the shape.
- No secrets required.

## Setup

1. `ALLOWED_ORIGIN` in `wrangler.jsonc` is set to `https://resources.miacademy.co`.
2. Copy `offers.config.example.js` → `offers.config.js` (gitignored) and fill in the
   real codes + pricing.

## Deploy

```sh
cd worker
npm i -g wrangler          # if not installed
wrangler deploy            # bundles offers.config.js; prints the *.workers.dev URL
```

**Whenever codes or pricing change**, edit `offers.config.js` and re-run `wrangler deploy`.

The deployed host must match the page's `SUBMIT_ENDPOINT` and CSP `connect-src`
(`<host>/submit`). Don't route on `resources.miacademy.co` (that's the Pages site).

## Verify

```sh
HOST=https://discount-form-worker.<acct>.workers.dev   # or http://localhost:8787 with `wrangler dev`

# Success (expect 200 {ok:true, code, offer})
curl -i -X POST "$HOST/submit" -H "Content-Type: application/json" \
  -H "Origin: https://resources.miacademy.co" \
  -d '{"answers":{"gradeGroup":"k8","numStudents":"1","incomeBased":false,"military":true}}'

# Negative cases
curl -i -X GET  "$HOST/submit"   # 405
curl -i -X POST "$HOST/nope"     # 404
curl -i -X POST "$HOST/submit" -H "Content-Type: application/json" -d '{bad'   # 400
```
