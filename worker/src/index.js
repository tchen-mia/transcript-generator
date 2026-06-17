// @ts-check
//
// Discount-form intake Worker.
// - Accepts POST /submit (JSON) from the static discount page.
// - Validates strictly, resolves the discount code SERVER-SIDE (the answer→code
//   mapping never ships to the browser), writes the submission to Airtable, and
//   returns the resolved code to the page.
//
// Secrets (wrangler secret put): AIRTABLE_TOKEN, [TURNSTILE_SECRET]
// Vars (wrangler.jsonc): AIRTABLE_BASE_ID, AIRTABLE_TABLE, ALLOWED_ORIGIN, TURNSTILE_ENABLED
//
// Discount codes + pricing come from offers.config.js (gitignored, bundled at
// deploy) — kept out of this public repo. See offers.config.example.js.

import OFFERS_CONFIG from '../offers.config.js';

'use strict';

const MAX_BODY_BYTES = 8 * 1024; // 8 KB — generous for a small form
const LIMITS = {
  name: 120,
  email: 254,
  submissionId: 64,
  formVersion: 32,
  consentVersion: 32,
  answersJson: 4096,
};

/* ════════════════════════════════════════════════════════════════════════
   DISCOUNT RESOLUTION  (server-side — codes, pricing, and thresholds come from
   offers.config.js and never ship to the browser or this public repo).
   `resolveOffer(answers, cfg)` returns { code, offer }, where `offer` is the
   full display payload the page renders (headline, per-site pricing, warnings).

   Priority cascade ("best rate"), first match wins:
     1. Income-based  (applied AND income ≤ threshold)
     2. Military      (1 student, not income-qualified)
     3. Siblings      (2+ students, not income-qualified)
     4. Single        (1 student, no other discount)
   (Each tier's code + pricing is looked up from the config by key.)
   ════════════════════════════════════════════════════════════════════════ */

/* All discount content — codes, pricing tables, income thresholds, and copy —
   lives in offers.config.js (gitignored, bundled into the Worker at deploy), so
   it stays out of this public repo. This file holds only logic. The shape is
   documented in offers.config.example.js. */
function getConfig() {
  const c = OFFERS_CONFIG;
  return (c && c.codes && c.offers && c.income) ? c : null;
}

const SITE_SCOPE = { k8: 'K-8 sites', '7-12': 'MiaPrep site', both: 'K-8 & MiaPrep sites' };

function buildOffer(offerKey, gradeGroup, cfg) {
  const code = cfg.codes[offerKey];
  const o = cfg.offers[offerKey];
  const g = ['k8', '7-12', 'both'].includes(gradeGroup) ? gradeGroup : 'both';
  // Fall back to 'both' (then to whatever exists) if a specific grade variant is absent.
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

/* Income qualification — thresholds come from the config (kept out of the repo).
   The published table is linear: threshold = base(size 2) + (size − 2) × per-person. */
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

  // 1. Income-based (only if they applied AND their income qualifies).
  if (answers.incomeBased === true &&
      incomeQualifies(answers.householdIncome, answers.householdSize, answers.location, cfg)) {
    return { code: cfg.codes.lowincome, offer: buildOffer('lowincome', grade, cfg) };
  }
  // 2. Military (asked only when 1 student).
  if (answers.military === true) {
    return { code: cfg.codes.military, offer: buildOffer('military', grade, cfg) };
  }
  // 3. Siblings (2+ students).
  if (multi) {
    return { code: cfg.codes.siblings, offer: buildOffer('siblings', grade, cfg) };
  }
  // 4. Single homeschool.
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

/* ──────────────────────── validation ──────────────────────── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body) {
  const errors = [];
  const out = {};
  const str = (k, max, required = true) => {
    const v = typeof body[k] === 'string' ? body[k].trim() : '';
    if (!v) { if (required) errors.push(k); return ''; }
    if (v.length > max) { errors.push(k); return ''; }
    out[k] = v;
    return v;
  };

  str('name', LIMITS.name);
  const email = str('email', LIMITS.email);
  if (email && !EMAIL_RE.test(email)) errors.push('email');
  str('submissionId', LIMITS.submissionId);
  str('formVersion', LIMITS.formVersion);
  str('consentVersion', LIMITS.consentVersion, false);

  if (body.consent !== true) errors.push('consent');
  else out.consent = true;

  out.emailCode = body.emailCode === true; // optional email opt-in flag

  if (typeof body.answers !== 'object' || body.answers === null || Array.isArray(body.answers)) {
    errors.push('answers');
  } else if (JSON.stringify(body.answers).length > LIMITS.answersJson) {
    errors.push('answers');
  } else {
    out.answers = body.answers;
  }

  // Optional client timestamp (server stamps its own authoritative time regardless).
  if (typeof body.timestamp === 'string' && !Number.isNaN(Date.parse(body.timestamp))) {
    out.timestamp = body.timestamp;
  }
  return { value: out, errors };
}

/* ──────────────────────── Turnstile (optional) ──────────────────────── */
async function verifyTurnstile(token, request, env) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return false;
  const form = new URLSearchParams();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip); // used transiently for verification only; never stored
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const out = await r.json().catch(() => ({ success: false }));
    return out.success === true;
  } catch {
    return false;
  }
}

/* ──────────────────────── Airtable write ──────────────────────── */
// Human-readable labels so the Airtable rows read like the form.
const GRADE_LABEL = { k8: 'Kindergarten - 8th', '7-12': '7th - 12th', both: 'Both grade groups' };
const STUDENTS_LABEL = { '1': '1', '2': '2', '3': '3', '4': '4', '5plus': 'More than 4' };
const STATE_LABEL = { AK: 'Alaska', HI: "Hawai'i", '48': 'Other / Lower 48' };
const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');

async function writeToAirtable(value, code, env) {
  const endpoint = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(env.AIRTABLE_TABLE)}`;
  const a = value.answers || {};
  // Column names must match the Airtable table exactly.
  const fields = {
    'Date': new Date().toISOString(),
    'First Name': a.firstName || '',
    'Last Name': a.lastName || '',
    'Email': value.email,
    'Grade': GRADE_LABEL[a.gradeGroup] || a.gradeGroup || '',
    'Students': STUDENTS_LABEL[a.numStudents] || a.numStudents || '',
    'Military': yesNo(a.military),
    'Income-Based': yesNo(a.incomeBased),
    'State': STATE_LABEL[a.location] || a.location || '',
    'Declaration': value.consent === true ? 'I accept' : '',
    'Discount Code': code,
    'Send Code': value.emailCode === true ? 'Yes' : 'No', // email opt-in flag (drives the automation)
  };
  // Only set the Number columns when a number is present (income-based path),
  // so an empty value is never sent to a Number field.
  if (typeof a.householdIncome === 'number') fields['Income'] = a.householdIncome;
  if (typeof a.householdSize === 'number') fields['Household'] = a.householdSize;

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    });
    if (!res.ok) {
      console.error('airtable_write_failed', res.status); // status only — no PII
      return { ok: false, status: res.status };
    }
    const data = await res.json();
    return { ok: true, recordId: data.records?.[0]?.id ?? null };
  } catch (e) {
    console.error('airtable_write_exception', e?.name); // name only — no PII
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

/* ──────────────────────── handler ──────────────────────── */
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/submit') return json(404, { ok: false, error: 'not_found' }, cors);
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, { ...cors, Allow: 'POST, OPTIONS' });

    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json(413, { ok: false, error: 'payload_too_large' }, cors);

    let raw;
    try {
      raw = await request.text();
    } catch {
      return json(400, { ok: false, error: 'invalid_json' }, cors);
    }
    if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'payload_too_large' }, cors);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: 'invalid_json' }, cors);
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return json(400, { ok: false, error: 'invalid_json' }, cors);
    }

    // Honeypot — `company` must be empty/absent. Silent success decoy for bots.
    if (typeof body.company === 'string' && body.company.trim() !== '') {
      return json(200, { ok: true, id: null, stored: false }, cors);
    }

    // Turnstile (only when enabled).
    if (env.TURNSTILE_ENABLED === 'true') {
      const ok = await verifyTurnstile(body.turnstileToken, request, env);
      if (!ok) return json(403, { ok: false, error: 'forbidden' }, cors);
    }

    const { value, errors } = validate(body);
    if (errors.length) return json(400, { ok: false, error: 'validation_failed', fields: errors }, cors);

    // Resolve the discount offer server-side (codes/pricing/rules never leave the Worker).
    const cfg = getConfig();
    if (!cfg) {
      console.error('config_missing_or_invalid'); // offers.config.js missing/malformed at deploy
      return json(500, { ok: false, error: 'server_misconfigured' }, cors);
    }
    const { code, offer } = resolveOffer(value.answers, cfg);

    const result = await writeToAirtable(value, code, env);
    if (!result.ok) {
      // Degrade gracefully: the offer is already resolved, so still return it so the
      // user isn't blocked by a storage hiccup; flag stored:false for follow-up.
      return json(200, { ok: true, code, offer, id: null, stored: false }, cors);
    }
    return json(200, { ok: true, code, offer, id: result.recordId }, cors);
  },
};
