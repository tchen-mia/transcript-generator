// @ts-check
//
// Discount resolver Worker.
// - Accepts POST /submit (JSON: { answers }) from the static discount page.
// - Resolves the discount offer SERVER-SIDE so the codes/pricing/thresholds stay
//   out of the browser and out of this public repo.
// - Stores NOTHING and sends NO email. The page collects no name/email; the
//   eligibility answers are used only to pick the offer, then discarded.
//
// Vars (wrangler.jsonc): ALLOWED_ORIGIN
//
// Discount codes + pricing come from offers.config.js (gitignored, bundled at
// deploy) — kept out of this public repo. See offers.config.example.js.

import OFFERS_CONFIG from '../offers.config.js';

const MAX_BODY_BYTES = 8 * 1024;     // 8 KB — generous for a tiny payload
const MAX_ANSWERS_JSON = 4096;       // cap on the answers object

/* ════════════════════════════════════════════════════════════════════════
   DISCOUNT RESOLUTION  (codes, pricing, thresholds from offers.config.js;
   never shipped to the browser or this repo).
   Priority cascade ("best rate"), first match wins:
     1. Income-based  (applied AND income ≤ threshold)
     2. Military      (1 student, not income-qualified)
     3. Siblings      (2+ students, not income-qualified)
     4. Single        (1 student, no other discount)
   ════════════════════════════════════════════════════════════════════════ */
function getConfig() {
  const c = OFFERS_CONFIG;
  return (c && c.codes && c.offers && c.income) ? c : null;
}

const SITE_SCOPE = { k8: 'K-8 sites', '7-12': 'MiaPrep site', both: 'K-8 & MiaPrep sites' };

function buildOffer(offerKey, gradeGroup, cfg) {
  const code = cfg.codes[offerKey];
  const o = cfg.offers[offerKey];
  const g = ['k8', '7-12', 'both'].includes(gradeGroup) ? gradeGroup : 'both';
  const variant = o.variants[g] || o.variants.both
    || { sites: Object.values(o.variants).flatMap((v) => v.sites) };
  const extraNote = variant.extraNoteTemplate
    ? variant.extraNoteTemplate.replace('{SINGLE}', cfg.codes.single || '')
    : (variant.extraNote || '');
  return {
    code,
    headline: `Use your code ${code} to enjoy the following discounted pricing on our ${SITE_SCOPE[g] || 'K-8 & MiaPrep sites'}!`,
    sites: variant.sites,
    extraNote,
    warnings: cfg.warnings || [],
    validityNote: cfg.validity || '',
  };
}

function incomeThreshold(size, loc, cfg) {
  const b = cfg.income.base[loc] ?? cfg.income.base['48'];
  const d = cfg.income.per[loc] ?? cfg.income.per['48'];
  return b + (Number(size) - 2) * d;
}
function incomeQualifies(income, size, loc, cfg) {
  const inc = Number(income);
  return Number.isFinite(inc) && inc <= incomeThreshold(size, loc, cfg);
}

function resolveOffer(answers, cfg) {
  const grade = answers.gradeGroup;
  const multi = answers.numStudents !== '1'; // 2+ students

  if (answers.incomeBased === true &&
      incomeQualifies(answers.householdIncome, answers.householdSize, answers.location, cfg)) {
    return { code: cfg.codes.lowincome, offer: buildOffer('lowincome', grade, cfg) };
  }
  if (answers.military === true) {
    return { code: cfg.codes.military, offer: buildOffer('military', grade, cfg) };
  }
  if (multi) {
    return { code: cfg.codes.siblings, offer: buildOffer('siblings', grade, cfg) };
  }
  return { code: cfg.codes.single, offer: buildOffer('single', grade, cfg) };
}

/* ──────────────────────────── CORS ──────────────────────────── */
function allowedOrigins(env) {
  return new Set([env.ALLOWED_ORIGIN, 'http://localhost:8000', 'http://127.0.0.1:8000']);
}
function corsHeaders(origin, env) {
  const allow = allowedOrigins(env).has(origin) ? origin : env.ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(status, obj, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/* ──────────────────────────── handler ──────────────────────────── */
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/submit') return json(404, { ok: false, error: 'not_found' }, cors);
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, { ...cors, Allow: 'POST, OPTIONS' });

    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json(413, { ok: false, error: 'payload_too_large' }, cors);

    let raw;
    try { raw = await request.text(); } catch { return json(400, { ok: false, error: 'invalid_json' }, cors); }
    if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'payload_too_large' }, cors);

    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'invalid_json' }, cors); }

    const answers = body && body.answers;
    if (typeof answers !== 'object' || answers === null || Array.isArray(answers)
        || JSON.stringify(answers).length > MAX_ANSWERS_JSON) {
      return json(400, { ok: false, error: 'invalid_answers' }, cors);
    }

    const cfg = getConfig();
    if (!cfg) {
      console.error('config_missing_or_invalid'); // offers.config.js missing/malformed at deploy
      return json(500, { ok: false, error: 'server_misconfigured' }, cors);
    }

    const { code, offer } = resolveOffer(answers, cfg);
    return json(200, { ok: true, code, offer }, cors);
  },
};
