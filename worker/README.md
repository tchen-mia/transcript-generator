# Discount-form intake Worker

Receives submissions from `discount.html` (on `resources.miacademy.co`), resolves the
discount offer **server-side**, and writes each submission to Airtable.

- **All discount content — codes, pricing, and income thresholds — lives in the
  `DISCOUNT_CONFIG` secret, NOT in this repo.** `src/index.js` contains only logic.
  The real values are kept in a gitignored `offers.config.json` (your local editing
  source) and pushed to Cloudflare as a secret.
- The Airtable token is also a **Worker secret**, never in code or the page.

## One-time setup

1. **Configure non-secret vars** in `wrangler.jsonc` (already set):
   - `AIRTABLE_BASE_ID` — `appUBBjmWQs4lJr7q`
   - `AIRTABLE_TABLE` — `Discount`
   - `ALLOWED_ORIGIN` — `https://resources.miacademy.co`
2. **Create the `Discount` table** with these columns:
   `Email`, `Name`, `Discount Code`, `Form Version`,
   `Submission ID` (mark **unique**), `Consent` (checkbox), `Consent Version`,
   `Client Time` (date-time), `Received At` (date-time), `Answers JSON` (long text).
3. **Create a least-privilege Airtable PAT** scoped to just this base with `data.records:write`.
4. **Build the discount config**: copy `offers.config.example.json` to
   `offers.config.json` (gitignored) and fill in the real codes + pricing.

## Deploy

```sh
cd worker
npm i -g wrangler          # if not installed
wrangler deploy            # prints the *.workers.dev URL
wrangler secret put AIRTABLE_TOKEN                 # paste the PAT (NOT committed)
wrangler secret put DISCOUNT_CONFIG < offers.config.json   # push codes+pricing as a secret
```

Re-run the `DISCOUNT_CONFIG` command whenever you change codes or pricing.

Note the deployed URL (e.g. `https://discount-form-worker.<acct>.workers.dev`). The page's
`SUBMIT_ENDPOINT` and CSP `connect-src` must use `<that-host>/submit`. Do **not** route the Worker
on `resources.miacademy.co` (that's the Pages site) — use `*.workers.dev` or a subdomain like `api.`.

## Local dev

```sh
cp .dev.vars.example .dev.vars   # add your AIRTABLE_TOKEN
wrangler dev                     # serves on http://localhost:8787
# serve the static site too: (from repo root) python3 -m http.server 8000
```
`http://localhost:8000` is allowlisted for CORS in dev.

## Verify

```sh
HOST=https://discount-form-worker.<acct>.workers.dev   # or http://localhost:8787

# Success (expect 200 {ok:true,code,message,id} + Access-Control-Allow-Origin header)
curl -i -X POST "$HOST/submit" \
  -H "Content-Type: application/json" \
  -H "Origin: https://resources.miacademy.co" \
  -d '{"submissionId":"11111111-1111-4111-8111-111111111111","formVersion":"discount-v1",
       "timestamp":"2026-06-17T12:00:00.000Z","name":"Test User","email":"test@example.com",
       "consent":true,"consentVersion":"v1","answers":{"currentlySubscribed":true,"plan":"annual"},"company":""}'

# Preflight (expect 204 + CORS headers)
curl -i -X OPTIONS "$HOST/submit" -H "Origin: https://resources.miacademy.co" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"

# Negative cases
curl -i -X GET  "$HOST/submit"   # 405
curl -i -X POST "$HOST/nope"     # 404
curl -i -X POST "$HOST/submit" -H "Content-Type: application/json" -d '{bad'   # 400 invalid_json
```

Then confirm a row appears in Airtable with the expected columns populated.

## Turnstile (optional, before wide promotion)

1. Add the Turnstile widget to `discount.html` and send its token as `turnstileToken`.
2. `wrangler secret put TURNSTILE_SECRET`
3. Set `TURNSTILE_ENABLED` to `"true"` in `wrangler.jsonc` and redeploy.
4. Add `https://challenges.cloudflare.com` to the page's CSP `script-src` and `frame-src`.
