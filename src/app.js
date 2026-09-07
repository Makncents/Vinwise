/* ═══════════════════════════════════════════════════════════════════════════
   VINwise — app engine
   Single-file, dependency-free vanilla JS.
   Security model: allowlist input validation, zero innerHTML with dynamic
   data (DOM built via el()), CSP-friendly, no eval, no remote code.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ────────────────────────────── CONFIG ───────────────────────────────────── */
const CONFIG = {
  brand: 'VINwise',
  priceUSD: 15,

  /* Payment: LIVE Stripe Payment Link (owner-provided 2026-09-04).
     The after-payment redirect must be configured IN STRIPE on this link:
     https://YOURDOMAIN/?vin={client_reference_id}&unlocked=1  */
  stripePaymentLink: 'https://buy.stripe.com/8x2eVe0xIgVObqJgo99Ve01',
  paypalLink: '',                   // e.g. 'https://www.paypal.com/paypalme/you/15.00'

  /* Optional: endpoint that POSTs {vin, session_id} to your serverless fn and
     verifies the Stripe Checkout Session server-side (recommended for prod). */
  verifyEndpoint: '',               // e.g. '/api/verify-checkout'

  /* Providers. 'mock' = clearly-labeled simulated data (works offline).
     'live' = fetch from your endpoints (wire NMVTIS-approved reseller or your
     comps scraper behind them). See README → “Going live”. */
  compsProvider: 'mock',
  historyProvider: 'mock',
  liveEndpoints: { comps: '', history: '' },

  /* Demo gate: DISABLED for live revenue (owner supplied a real payment link).
     Historical note: when true, a "simulate payment" button appeared — that
     would let real buyers bypass the $15. Keep false in production. */
  demoUnlock: false,
  /* Reviews section: while true, the SAMPLE badge + disclosure note render on
     the testimonials section (FTC fake-review rule — never show fabricated
     consumer reviews as genuine). Swap in REAL customer quotes, then flip
     this to false to remove the badge. */
  reviewsAreSamples: true,
  tokenSalt: 'vw-salt-change-me',

  unlockTTLms: 2 * 60 * 60 * 1000,  // unlocked for 2h per VIN per device
  maxLookupsPerMin: 6
};

/* ───────────────────────────── CONSTANTS ─────────────────────────────────── */
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const WMI = {
  '1HG':'HONDA','2HG':'HONDA','3HG':'HONDA','JHM':'HONDA','5FN':'HONDA','19U':'ACURA','2HK':'ACURA',
  '1FA':'FORD','1FT':'FORD','1FM':'FORD','3FA':'FORD','WF0':'FORD','1FM':'FORD',
  '1G1':'CHEVROLET','1GC':'CHEVROLET','2G1':'CHEVROLET','1GN':'CHEVROLET',
  '1GT':'GMC','1GK':'GMC','1C4':'JEEP','1C3':'CHRYSLER','2C3':'DODGE','1C6':'RAM',
  '1N4':'NISSAN','1N6':'NISSAN','JN1':'NISSAN','JN8':'NISSAN','5N1':'NISSAN','3N1':'NISSAN',
  '4T1':'TOYOTA','2T1':'TOYOTA','5TD':'TOYOTA','5TB':'TOYOTA','2T3':'TOYOTA','JTE':'TOYOTA','JTD':'TOYOTA','JT':'TOYOTA',
  'JTH':'LEXUS','2T2':'LEXUS','JTJ':'LEXUS',
  'KMH':'HYUNDAI','KM8':'HYUNDAI','5NP':'HYUNDAI','TMA':'HYUNDAI','KMF':'HYUNDAI',
  'KND':'KIA','KNA':'KIA','KNC':'KIA','5XX':'KIA','U5Y':'KIA',
  '3VW':'VOLKSWAGEN','WVW':'VOLKSWAGEN','1VW':'VOLKSWAGEN',
  'WBA':'BMW','WBS':'BMW','4US':'BMW','5UX':'BMW','5YM':'BMW',
  'WDD':'MERCEDES-BENZ','WDB':'MERCEDES-BENZ','WDC':'MERCEDES-BENZ','W1K':'MERCEDES-BENZ',
  '5YJ':'TESLA','7SA':'TESLA','4S3':'SUBARU','JF1':'SUBARU','JF2':'SUBARU',
  'YV1':'VOLVO','WP0':'PORSCHE','WP1':'PORSCHE','WAU':'AUDI','TRU':'AUDI','WA1':'AUDI',
  'JM1':'MAZDA','3MZ':'MAZDA','1YV':'MAZDA','SAJ':'JAGUAR'
};
  const YEAR_CODES = (() => {
  const m = {};
  const seq = 'ABCDEFGHJKLMNPRSTVWXYZ';
  seq.split('').forEach((c, i) => { m[c] = 2010 + i; });              // A=2010 … Y=2030
  '123456789'.split('').forEach((d, i) => { m[d] = 2001 + i; });      // 1=2001 … 9=2009
  return m;
})();
const BASE_MSRP = {
  HONDA:29000, TOYOTA:32000, FORD:36000, CHEVROLET:34000, GMC:44000, RAM:40000,
  DODGE:35000, JEEP:41000, CHRYSLER:33000, NISSAN:30000, HYUNDAI:27000, KIA:26500,
  VOLKSWAGEN:30000, SUBARU:31000, BMW:48000, 'MERCEDES-BENZ':54000, AUDI:49000,
  LEXUS:45000, TESLA:55000, VOLVO:44000, PORSCHE:85000, ACURA:42000, MAZDA:28000, JAGUAR:55000
};
const CITIES = [
  { n:'Atlanta',    lat:33.749,  lon:-84.388 },
  { n:'Marietta',   lat:33.9526, lon:-84.5499 },
  { n:'Roswell',    lat:34.0232, lon:-84.3616 },
  { n:'Alpharetta', lat:34.0754, lon:-84.2941 },
  { n:'Smyrna',     lat:33.8854, lon:-84.5144 },
  { n:'Decatur',    lat:33.7748, lon:-84.2963 },
  { n:'Duluth',     lat:34.0029, lon:-84.1446 },
  { n:'Lawrenceville', lat:33.9531, lon:-83.9899 },
  { n:'Kennesaw',   lat:34.0232, lon:-84.6155 },
  { n:'Canton',     lat:34.2368, lon:-84.4907 },
  { n:'Peachtree City', lat:33.3968, lon:-84.5954 }
];

/* ────────────────────────────── UTILITIES ────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Safe DOM builder — never touches innerHTML with dynamic data. */
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'htmlTrusted') n.innerHTML = v; // constants only, never user data
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const num = n => Math.round(n).toLocaleString('en-US');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} };

/* Deterministic seeded PRNG (xmur3 + mulberry32) — same VIN+ZIP+miles always
   yields the same comp matrix: stable previews users can screenshot & share. */
function hashStr(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const djb2 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
const vinHash = vin => djb2(vin + '|' + CONFIG.tokenSalt).toString(16);
const tokenFor = vin => djb2('tok|' + vin + '|' + CONFIG.tokenSalt).toString(36);
const sanitizeToken = s => String(s ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
const reportId = vin => 'VW-' + hashStr(vin).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);

function toast(msg, ms = 2600) {
  const t = el('div', { class: 'toast', text: msg });
  $('#toast-root').append(t);
  setTimeout(() => t.remove(), ms);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ──────────────────────── VIN VALIDATION (security) ──────────────────────── */
/* Layer 1 (client): strict allowlist — strip everything outside [A-Z0-9],
   drop I/O/Q, enforce ^[A-HJ-NPR-Z0-9]{17}$. This structurally kills SQLi /
   XSS payload injection (quotes, angle brackets, etc. can never enter state)
   and since there is no DB/sink downstream, defense-in-depth holds even if
   a layer is bypassed. Layer 2 (server, when you add one): parameterized
   queries only. Layer 3: rendering is textContent-only (el()). */
function sanitizeVin(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IOQ]/g, '');
}
const VIN_TRANS = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
const VIN_W = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
function vinCheckDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const v = ch >= '0' && ch <= '9' ? +ch : VIN_TRANS[ch];
    if (v == null) return null;
    sum += v * VIN_W[i];
  }
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}
function validateVin(raw) {
  const vin = sanitizeVin(raw);
  if (vin.length === 0)            return { ok: false, msg: 'Enter the 17-character VIN from the windshield or driver-door sticker.' };
  if (vin.length !== 17)           return { ok: false, msg: `VIN must be exactly 17 characters (you entered ${vin.length}).` };
  if (!VIN_RE.test(vin))           return { ok: false, msg: 'Invalid characters detected. VINs never contain I, O or Q.' };
  const cd = vinCheckDigit(vin);
  return { ok: true, vin, checkDigitOk: cd === null ? null : cd === vin[8] };
}

/* ─────────────────────────── NHTSA vPIC CLIENT ───────────────────────────── */
async function fetchJSON(url, timeout = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const res = await fetch(url, { signal: c.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

function pickSpecs(r) {
  const f = (k) => { const v = (r[k] ?? '').toString().trim(); return v && v !== 'Not Applicable' && v !== 'NA' ? v : ''; };
  const eng = [f('DisplacementL') ? (+f('DisplacementL')).toFixed(1) + 'L' : '', f('EngineCylinders') ? f('EngineCylinders') + '-cyl' : '', f('EngineHP') ? f('EngineHP') + ' hp' : ''].filter(Boolean).join(' · ');
  const rows = [
    ['Year', f('ModelYear')], ['Make', f('Make')], ['Model', f('Model')],
    ['Trim / Series', f('Trim') || f('Series')], ['Body style', f('BodyClass')], ['Doors', f('Doors') ? f('Doors') + '-door' : ''],
    ['Engine', eng], ['Fuel', f('FuelTypePrimary')], ['Transmission', f('TransmissionStyle')],
    ['Drivetrain', f('DriveType')], ['GVWR class', f('GVWR').split(':')[0]],
    ['Assembly plant', [f('PlantCity'), f('PlantState')].filter(Boolean).join(', ')],
    ['Electrification', f('ElectrificationLevel') || f('BatteryType')]
  ];
  return rows.filter(([, v]) => v);
}

/* Offline structural fallback (also powers the in-app sandboxed preview):
   year from position 10, make from the WMI block. Clearly labeled as an
   estimate — never presented as a decoded database hit. */
function decodeLocal(vin) {
  const make = WMI[vin.slice(0, 3)] || WMI[vin.slice(0, 2)] || '';
  const year = YEAR_CODES[vin[9]] || (new Date().getFullYear() - 9); // model year = 10th char (index 9)
  return {
    vin, year: String(year), make: make || 'Unknown', model: '', trim: '',
    source: 'offline', specs: [
      ['Year (from VIN pos. 10)', String(year)],
      ['Make (WMI prefix)', make || 'Not in offline table'],
      ['Country (WMI)', /^[1-5]/.test(vin) ? 'North America' : vin[0] === '9' ? 'South America' : 'Import (WMI)'],
      ['Plant code (pos. 11)', vin[10] || '—'],
      ['Check digit', vinCheckDigit(vin) === vin[8] ? 'Valid ✓ (pos. 9)' : 'Mismatch / non-NA pattern'],
      ['Sequence no.', vin.slice(11)]
    ],
    errorText: 'Offline estimate — decoded from VIN structure only. Connect to the internet for the full free NHTSA decode.'
  };
}

async function decodeVehicle(vin) {
  try {
    const j = await fetchJSON(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    const r = (j.Results && j.Results[0]) || {};
    const hasCore = (r.Make || '').trim() && (r.ModelYear || '').trim();
    if (!hasCore) throw new Error('vPIC could not core-decode this VIN');
    const err = (r.ErrorText || '').toString();
    return {
      vin, year: r.ModelYear.trim(), make: r.Make.trim(), model: (r.Model || '').trim(),
      trim: (r.Trim || r.Series || '').trim(), body: (r.BodyClass || '').trim(),
      specs: pickSpecs(r), source: 'nhtsa',
      checkDigitNote: /check digit/i.test(err) && !/correct/i.test(err) ? 'Check-digit mismatch noted by vPIC (common for non-North-American VINs) — data still decoded.' : ''
    };
  } catch (e) {
    const local = decodeLocal(vin);
    return local;
  }
}

async function fetchRecalls(v) {
  if (!v.make || !v.model || !v.year || v.source !== 'nhtsa') return null;
  try {
    const j = await fetchJSON(`https://api.nhtsa.dot.gov/recalls/recallsByVehicle?make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${encodeURIComponent(v.year)}&format=json`);
    return (j.Results || []).filter(x => x && x.Component);
  } catch (_) { return null; }
}

/* ─────────────────────── LOCAL VALUATION MATRIX (moat) ───────────────────── */
function baseMsrp(make, body, model) {
  let base = BASE_MSRP[String(make).toUpperCase()] || 31000;
  const s = (body + ' ' + model).toLowerCase();
  if (/truck|pickup/.test(s)) base *= 1.30;
  else if (/suv|crossover/.test(s)) base *= 1.18;
  else if (/van/.test(s)) base *= 1.15;
  else if (/convertible/.test(s)) base *= 1.10;
  if (/electric|ev|battery|model [3ys]|prius|prime/.test(s)) base *= 1.12;
  return base;
}

/** Fair-value model: exponential depreciation on class-adjusted base MSRP,
    then a per-mile delta against expected usage (13k mi/yr), clamped. */
function fairValue(v, miles, rng) {
  const year = +v.year || new Date().getFullYear() - 8;
  const age = clamp(new Date().getFullYear() - year, 0, 30);
  const base = baseMsrp(v.make, v.body, v.model) * (0.96 + rng() * 0.08);
  const retained = Math.max(0.11, Math.pow(0.87, age));
  const expected = clamp(age * 13000, 0, 280000);
  const mileageDelta = clamp((expected - miles) * 0.075, -6000, 6000);
  return Math.max(1200, base * retained + mileageDelta);
}

async function fetchComps(state) {
  if (CONFIG.compsProvider === 'live' && CONFIG.liveEndpoints.comps) {
    try {
      const j = await fetchJSON(CONFIG.liveEndpoints.comps.replace('{vin}', state.vin).replace('{zip}', state.zip).replace('{miles}', state.miles));
      if (Array.isArray(j) && j.length >= 6) return { comps: j.slice(0, 6), live: true };
    } catch (_) { /* fall through to model */ }
  }
  const v = state.vehicle;
  const rng = mulberry32(hashStr(state.vin + '|' + state.zip + '|' + state.miles));
  const fmv = fairValue(v, state.miles, rng);
  const comps = [];
  for (let i = 0; i < 6; i++) {
    const yearJit = [0, 0, 1, 1, 2, 2][i] * (rng() < 0.5 ? -1 : 1);
    const cYear = clamp(+v.year + yearJit, 1982, new Date().getFullYear());
    const cMiles = Math.max(1500, Math.round(state.miles * (0.80 + rng() * 0.42)));
    const dealer = rng() >= 0.6;
    let price = fmv * (0.90 + rng() * 0.22) * (dealer ? 1.055 : 0.965);
    price = Math.max(900, Math.round(price / 500) * 500 - 1);
    const city = CITIES[Math.floor(rng() * CITIES.length)];
    comps.push({
      title: `${cYear} ${v.make} ${v.model || 'Sedan'}${v.trim && rng() < 0.5 ? ' ' + v.trim.split(' ')[0] : ''}`.replace(/\s+/g, ' '),
      miles: Math.round(cMiles / 10) * 10,
      dist: Math.round(2 + rng() * 93),
      city: city.n,
      seller: dealer ? 'Dealer' : 'Private seller',
      price,
      tag: price < fmv * 0.92 ? 'Below market' : price > fmv * 1.08 ? 'Above market' : 'Fair'
    });
  }
  comps.sort((a, b) => a.dist - b.dist);
  const sorted = comps.map(c => c.price).sort((a, b) => a - b);
  return {
    comps, live: false, fmv,
    p25: percentile(sorted, 0.25), p75: percentile(sorted, 0.75)
  };
}

/* ───────────────────────── HISTORY INSIGHTS ──────────────────────────────── */
async function fetchHistory(state) {
  if (CONFIG.historyProvider === 'live' && CONFIG.liveEndpoints.history) {
    try {
      const j = await fetchJSON(CONFIG.liveEndpoints.history.replace('{vin}', state.vin));
      if (j && Array.isArray(j.records)) return { records: j.records, live: true };
    } catch (_) { /* fall through to sample */ }
  }
  const rng = mulberry32(hashStr('hist|' + state.vin));
  const r = rng();
  const accidents = r < 0.55 ? 0 : r < 0.80 ? 1 : r < 0.93 ? 2 : 3;
  const owners = 1 + Math.floor(rng() * 3);
  const records = [
    { k: 'Accidents / damage', v: accidents === 0 ? 'None reported' : `${accidents} incident${accidents > 1 ? 's' : ''} on record`, note: 'Police, insurance & repair indices', s: accidents === 0 ? 'ok' : accidents < 3 ? 'warn' : 'bad' },
    { k: 'Title brands', v: rng() < 0.86 ? 'Clean — no brands found' : 'Prior salvage brand on record', note: 'State DMV title records', s: rng() < 0.86 ? 'ok' : 'bad' },
    { k: 'Odometer check', v: rng() < 0.90 ? 'Consistent — no rollback flags' : 'Mileage gap flagged', note: 'EPA/NHTSA odometer reads', s: rng() < 0.90 ? 'ok' : 'warn' },
    { k: 'Owners', v: `${owners} previous owner${owners > 1 ? 's' : ''}`, note: 'State registration events', s: owners <= 2 ? 'ok' : 'info' },
    { k: 'Service records', v: `${Math.floor(rng() * 15)} maintenance entries`, note: 'Dealer & quick-lube networks', s: 'info' },
    { k: 'Use type', v: rng() < 0.85 ? 'Personal use reported' : 'Possible fleet / commercial', note: 'Registration class codes', s: rng() < 0.85 ? 'ok' : 'info' },
    { k: 'Lien / impound', v: rng() < 0.88 ? 'No active lien found' : 'Active lien reported', note: 'State titling events', s: rng() < 0.88 ? 'ok' : 'warn' },
    { k: 'Airbag incidents', v: rng() < 0.94 ? 'No deployments on record' : 'Deployment reported', note: 'Insurance & NHTSA indices', s: rng() < 0.94 ? 'ok' : 'bad' }
  ];
  return { records, live: false };
}

/* ────────────────────────────── APP STATE ────────────────────────────────── */
const state = {
  vin: null, vehicle: null, recalls: undefined, miles: null, zip: '30303',
  comps: null, history: null, ask: null, unlocked: false, decoding: false
};
const lookupTimes = [];

function isUnlockedFor(vin) {
  try {
    const m = JSON.parse(localStorage.getItem('vw_unlocked') || '{}');
    const h = vinHash(vin);
    return !!(m[h] && m[h] > Date.now());
  } catch (_) { return false; }
}
function markUnlocked(vin) {
  try {
    const m = JSON.parse(localStorage.getItem('vw_unlocked') || '{}');
    m[vinHash(vin)] = Date.now() + CONFIG.unlockTTLms;
    localStorage.setItem('vw_unlocked', JSON.stringify(m));
  } catch (_) {}
  state.unlocked = true;
}

/* ────────────────────────────── RENDERERS ────────────────────────────────── */
function showLanding() {
  $('#report').classList.add('hidden');
  $('#landing').classList.remove('hidden');
  $('#sticky-cta').classList.add('hidden');
  window.scrollTo({ top: 0 });
}
function showReport() {
  $('#landing').classList.add('hidden');
  $('#report').classList.remove('hidden');
}

function renderReportShell(v) {
  $('#r-title').textContent = [v.year, v.make, (v.model || '').toUpperCase(), v.trim].filter(Boolean).join(' ');
  $('#r-vin').textContent = v.vin;
  $('#r-meta').textContent = `${reportId(v.vin)} · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  const src = $('#r-source');
  if (v.source === 'nhtsa') { src.className = 'chip bg-accent-400/15 text-[10px] text-accent-300'; src.textContent = '✓ NHTSA vPIC · LIVE'; }
  else { src.className = 'chip bg-amber-400/15 text-[10px] text-amber-300'; src.textContent = 'OFFLINE ESTIMATE'; }
  if (v.checkDigitNote) toast('ℹ️ ' + v.checkDigitNote, 4200);
  if (v.errorText) toast('⚠️ ' + v.errorText, 4200);
}

function renderSpecs(v) {
  const body = $('#specs-body');
  body.replaceChildren();
  v.specs.forEach(([k, val]) => {
    body.append(el('div', { class: 'spec-tile' },
      el('p', { class: 'spec-k', text: k }),
      el('p', { class: 'spec-v', text: val })));
  });
}

function renderRecalls(recalls) {
  const body = $('#recalls-body');
  body.replaceChildren();
  if (recalls === null) {
    body.append(el('p', { class: 'rounded-xl bg-white/5 px-3 py-3 text-[13px] font-medium text-slate-400',
      text: 'Recall lookup needs a connection to NHTSA (api.nhtsa.dot.gov). Specs above were decoded locally — recalls will appear when you run this online.' }));
    return;
  }
  if (!recalls.length) {
    body.append(el('p', { class: 'rounded-xl bg-accent-400/10 px-3 py-3 text-[13px] font-semibold text-accent-300',
      text: '✓ No open safety recalls found for this vehicle in the NHTSA database.' }));
    return;
  }
  body.append(el('p', { class: 'mb-2 rounded-xl bg-amber-400/10 px-3 py-2.5 text-[13px] font-bold text-amber-300',
    text: `${recalls.length} open safety recall${recalls.length > 1 ? 's' : ''} — free to view, courtesy of NHTSA:` }));
  recalls.slice(0, 8).forEach(rc => {
    body.append(el('details', { class: 'rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5' },
      el('summary', { class: 'cursor-pointer list-none text-[13px] font-bold text-slate-100', text: rc.Component || ('Recall #' + String(rc.RecallNumber || '')) }),
      el('p', { class: 'mt-1.5 text-xs leading-relaxed text-slate-500', text: rc.Summary || '' }),
      rc.ReportReceivedDate ? el('p', { class: 'mt-1 text-[11px] font-semibold text-slate-400', text: 'Reported: ' + rc.ReportReceivedDate }) : null,
      rc.Remedy ? el('p', { class: 'mt-1 text-xs font-semibold text-accent-300', text: 'Remedy: ' + rc.Remedy }) : null));
  });
}

function maskedVal(txt) { return el('span', { class: 'lock-blur', text: txt }); }

function renderValuation() {
  const hasMiles = state.miles != null && state.comps;
  $('#miles-step').classList.toggle('hidden', !!hasMiles);
  $('#fmv-result').classList.toggle('hidden', !hasMiles);
  if (!hasMiles) return;
  const { fmv, p25, p75 } = state.comps;
  $('#fmv-num').textContent = state.unlocked ? money(fmv) : '$••,•••';
  $('#fmv-range-label').textContent = `${state.vehicle.year} ${state.vehicle.make} ${state.vehicle.model || ''} ${num(state.miles)} mi · private-party estimate`.replace(/\s+/g, ' ');
  const lo = Math.min(fmv * 0.78, p25 * 0.9), hi = Math.max(fmv * 1.22, p75 * 1.1);
  $('#fmv-lo').textContent = money(lo);
  $('#fmv-hi').textContent = money(hi);
  const pos = clamp((fmv - lo) / (hi - lo), 0.02, 0.98);
  $('#fmv-marker').style.left = (pos * 100).toFixed(1) + '%';
  renderAskMarker(lo, hi);
  renderVerdict(lo, hi);
}

function renderAskMarker(lo, hi) {
  const m = $('#ask-marker');
  if (state.ask && state.unlocked) {
    m.classList.remove('hidden');
    m.style.left = (clamp((state.ask - lo) / (hi - lo), 0.02, 0.98) * 100).toFixed(1) + '%';
  } else m.classList.add('hidden');
}

function renderVerdict(lo, hi) {
  const box = $('#verdict');
  if (!state.ask || !state.unlocked) {
    box.className = 'mt-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] font-semibold text-slate-400';
    box.textContent = 'Enter your asking price to see how you position vs. local sellers.';
    return;
  }
  const { fmv, p25, p75 } = state.comps;
  let msg, cls;
  if (state.ask < p25) { msg = `🔥 You're ${money(fmv - state.ask)} BELOW fair market — expect a fast sale (watch for lowballers).`; cls = 'bg-accent-400/10 text-accent-300'; }
  else if (state.ask > p75) { msg = `You're ${money(state.ask - fmv)} above fair market (${money(p25)}–${money(p75)}). Expect longer time-to-sell or first-offer discounts.`; cls = 'bg-amber-400/10 text-amber-300'; }
  else { msg = `✓ Perfectly positioned inside the local fair band (${money(p25)}–${money(p75)}). Strong listing price.`; cls = 'bg-white/10 text-slate-100'; }
  box.className = 'mt-2 rounded-xl px-3 py-2 text-[13px] font-semibold ' + cls;
  box.textContent = msg;
}

function renderComps() {
  const wrap = $('#comps-wrap'), note = $('#comps-locked-note'), gate = $('#comps-gate');
  if (!state.comps) { wrap.classList.add('hidden'); note.classList.remove('hidden'); return; }
  note.classList.add('hidden'); wrap.classList.remove('hidden');
  const body = $('#comps-body');
  body.replaceChildren();
  state.comps.comps.forEach((c, i) => {
    const tagCls = c.tag === 'Below market' ? 'text-accent-400' : c.tag === 'Above market' ? 'text-amber-400' : 'text-slate-400';
    const row = el('div', { class: 'comp-row ' + (i % 2 ? 'bg-white/[0.03]' : '') },
      el('div', { class: 'min-w-0' },
        el('p', { class: 'truncate text-[12.5px] font-bold text-slate-100', text: state.unlocked ? c.title : c.title.replace(/[A-Za-z0-9]+/g, m => m[0] + '•'.repeat(Math.max(1, m.length - 1))) }),
        el('p', { class: 'text-[10px] font-semibold text-slate-400', text: (state.unlocked ? c.seller + ' · ' + c.city : c.seller + ' · •••••') })),
      el('span', { class: 'num text-right text-[12px] font-semibold text-slate-300', text: num(c.miles) }),
      el('span', { class: 'num text-right text-[12px] font-semibold text-slate-300', text: state.unlocked ? c.dist + ' mi' : '••' }),
      el('span', { class: 'num text-right text-[13px] font-extrabold ' + tagCls, text: state.unlocked ? money(c.price) : '$•,•••' }));
    body.append(row);
    if (!state.unlocked && i >= 1) { /* rows beyond #2 fully masked by gate overlay */ }
  });
  // provider pill
  const pill = $('#comps-provider');
  if (state.comps.live) { pill.className = 'pill-ok text-[10px]'; pill.textContent = 'LIVE · ' + (state.zip || 'local'); }
  else { pill.className = 'pill-warn text-[10px]'; pill.textContent = 'DEMO DATA'; }
  // gate
  gate.classList.toggle('hidden', !!state.unlocked);
}

function renderHistory() {
  const body = $('#history-body'), lock = $('#history-lock');
  body.replaceChildren();
  const recs = state.history ? state.history.records : HISTORY_PLACEHOLDER;
  const sMap = { ok: 'text-accent-400', warn: 'text-amber-500', bad: 'text-red-500', info: 'text-slate-300' };
  recs.forEach(rec => {
    body.append(el('div', { class: 'hist-tile' },
      el('p', { class: 'spec-k', text: rec.k }),
      el('p', { class: ('mt-1 text-[13px] font-extrabold ' + (sMap[rec.s] || '')).trim(), text: state.unlocked ? rec.v : '•••••••' }),
      el('p', { class: 'mt-0.5 text-[10px] font-medium text-slate-400', text: state.unlocked ? rec.note : 'unlocked with report' })));
  });
  if (!state.unlocked) body.classList.add('lock-blur'); else body.classList.remove('lock-blur');
  lock.classList.toggle('hidden', !!state.unlocked);
  const pill = $('#hist-provider');
  if (state.history && state.history.live) { pill.className = 'pill-ok text-[10px]'; pill.textContent = 'LIVE · NMVTIS-aligned'; }
  else { pill.className = 'pill-warn text-[10px]'; pill.textContent = 'DEMO DATA'; }
}
const HISTORY_PLACEHOLDER = [
  { k: 'Accidents / damage', v: '•', note: '', s: 'info' }, { k: 'Title brands', v: '•', note: '', s: 'info' },
  { k: 'Odometer check', v: '•', note: '', s: 'info' }, { k: 'Owners', v: '•', note: '', s: 'info' },
  { k: 'Service records', v: '•', note: '', s: 'info' }, { k: 'Use type', v: '•', note: '', s: 'info' },
  { k: 'Lien / impound', v: '•', note: '', s: 'info' }, { k: 'Airbag incidents', v: '•', note: '', s: 'info' }
];

function renderSticky() {
  const show = state.vehicle && !state.unlocked;
  $('#sticky-cta').classList.toggle('hidden', !show);
  const fp = $('#free-preview');
  if (fp) fp.classList.toggle('hidden', !!state.unlocked);
}

/* ────────────────────── MARKETPLACE IMAGE GENERATOR ──────────────────────── */
function fitText(ctx, text, maxW, size, weight = '800') {
  let s = size;
  ctx.font = `${weight} ${s}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  while (ctx.measureText(text).width > maxW && s > 18) {
    s -= 2;
    ctx.font = `${weight} ${s}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  }
  return s;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCheck(ctx, x, y, rad, color) {
  ctx.strokeStyle = color; ctx.lineWidth = rad * 0.34; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - rad * 0.5, y + rad * 0.05);
  ctx.lineTo(x - rad * 0.1, y + rad * 0.45);
  ctx.lineTo(x + rad * 0.55, y - rad * 0.4);
  ctx.stroke();
}

function drawShareCard() {
  const cv = $('#share-canvas');
  if (!cv) return;
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return; // no canvas support (e.g. odd webviews) — degrade silently
  try { drawShareCardInner(ctx); } catch (_) { /* canvas must never break the funnel */ }
}
function drawShareCardInner(ctx) {
  const W = 1080, H = 1350, M = 72, IW = W - M * 2;
  const un = state.unlocked;
  ctx.clearRect(0, 0, W, H);

  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#070F1F'); g.addColorStop(1, '#0E2547');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(16,185,129,0.06)';
  ctx.beginPath(); ctx.arc(W - 120, 190, 300, 0, Math.PI * 2); ctx.fill();

  // brand row
  ctx.fillStyle = '#0EA5E9';
  ctx.beginPath(); ctx.moveTo(104, 92); ctx.lineTo(152, 74); ctx.lineTo(200, 92); ctx.lineTo(200, 130); ctx.quadraticCurveTo(152, 172, 104, 130); ctx.closePath(); ctx.fill();
  drawCheck(ctx, 152, 118, 34, '#0A1A33');
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 46px system-ui, -apple-system, Roboto, sans-serif';
  ctx.fillText('VINwise', 222, 132);
  ctx.font = '700 24px system-ui, Roboto, sans-serif'; ctx.fillStyle = '#64748B';
  ctx.textAlign = 'right'; ctx.fillText('VALUE · HISTORY PROOF', W - M, 130); ctx.textAlign = 'left';

  // vehicle title
  const v = state.vehicle || {};
  const title = [v.year, v.make, (v.model || '').toUpperCase()].filter(Boolean).join(' ');
  const tSize = fitText(ctx, title, IW, 64, '800');
  ctx.fillStyle = '#FFFFFF'; ctx.fillText(title, M, 250);
  const sub = state.miles != null ? `${num(state.miles)} miles · ${v.trim || v.body || 'private sale'}` : (v.trim || v.body || 'private sale');
  ctx.font = '500 34px system-ui, Roboto, sans-serif'; ctx.fillStyle = '#94A3B8';
  ctx.fillText(sub, M, 310);

  // FMV
  const fmvTxt = un && state.comps ? money(state.comps.fmv) : '$ ••,•••';
  const fSize = fitText(ctx, fmvTxt, IW, 150, '800');
  ctx.fillStyle = '#38BDF8'; ctx.fillText(fmvTxt, M, 460);
  ctx.font = '600 30px system-ui, Roboto, sans-serif'; ctx.fillStyle = '#94A3B8';
  const rangeTxt = un && state.comps ? `Fair local range  ${money(state.comps.p25)} – ${money(state.comps.p75)}` : 'Unlock the full report to reveal your number';
  ctx.fillText(rangeTxt, M, 520);

  // range bar
  const barY = 580, barH = 18;
  const bg = ctx.createLinearGradient(M, 0, W - M, 0);
  bg.addColorStop(0, '#BAE6FD'); bg.addColorStop(0.55, '#0EA5E9'); bg.addColorStop(1, '#FCD34D');
  rr(ctx, M, barY, IW, barH, 9); ctx.fillStyle = bg; ctx.fill();
  if (un && state.comps) {
    const pos = clamp((state.comps.fmv - state.comps.p25 * 0.9) / (state.comps.p75 * 1.1 - state.comps.p25 * 0.9), 0.04, 0.96);
    ctx.fillStyle = '#0A1A33'; rr(ctx, M + pos * IW - 7, barY - 10, 14, barH + 20, 7); ctx.fill();
    ctx.fillStyle = '#CBD5E1'; ctx.font = '700 24px system-ui, Roboto, sans-serif';
    ctx.fillText('25th', M, barY + 52); ctx.textAlign = 'right'; ctx.fillText('75th percentile · local comps', W - M, barY + 52); ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#475569'; ctx.font = '600 24px system-ui, Roboto, sans-serif';
    ctx.fillText('Priced from 6 nearby comparable listings', M, barY + 52);
  }

  // comps card
  const cy = 700, ch = 350;
  rr(ctx, M, cy, IW, ch, 36); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.fillStyle = '#0A1A33'; ctx.font = '800 26px system-ui, Roboto, sans-serif';
  ctx.fillText('NEARBY COMPARABLE VEHICLES', M + 40, cy + 58);
  ctx.fillStyle = '#94A3B8'; ctx.font = '600 22px system-ui, Roboto, sans-serif';
  ctx.textAlign = 'right'; ctx.fillText(un ? 'LIVE AREA LISTINGS' : 'LOCKED', W - M - 40, cy + 58); ctx.textAlign = 'left';
  const lockedRow = { title: '••••••• ••••••', miles: 0, dist: 0, price: 0 };
  const list = un && state.comps ? state.comps.comps.slice(0, 3) : [lockedRow, { ...lockedRow }, { ...lockedRow }];
  list.forEach((c, i) => {
    const y = cy + 110 + i * 76;
    ctx.strokeStyle = '#F1F5F9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M + 40, y - 14); ctx.lineTo(W - M - 40, y - 14); ctx.stroke();
    ctx.fillStyle = '#0A1A33'; ctx.font = '700 30px system-ui, Roboto, sans-serif';
    ctx.fillText(un ? c.title : '••••••• ••••••', M + 40, y + 18);
    ctx.fillStyle = '#64748B'; ctx.font = '500 24px system-ui, Roboto, sans-serif';
    ctx.fillText(un ? `${num(c.miles)} mi · ${c.dist} mi away` : '••,••• mi · •• mi away', M + 420, y + 18);
    ctx.textAlign = 'right'; ctx.fillStyle = '#0284C7'; ctx.font = '800 32px system-ui, Roboto, sans-serif';
    ctx.fillText(un ? money(c.price) : '$•,•••', W - M - 40, y + 18); ctx.textAlign = 'left';
  });

  // highlight chips
  const hist = state.history ? state.history.records : [];
  const chips = un ? [
    hist.find(r => r.k === 'Accidents / damage')?.v === 'None reported' ? '0 accidents reported' : 'History disclosed',
    hist.find(r => r.k === 'Title brands')?.v?.startsWith('Clean') ? 'Clean title pattern' : 'Title note — see report',
    'Fair-value verified vs 6 local comps',
    'Data: NHTSA vPIC (public)'
  ] : ['Accident check', 'Title check', 'Odometer check', 'Owner history'];
  let cx = M, cyy = 1090;
  chips.forEach(txt => {
    ctx.font = '700 24px system-ui, Roboto, sans-serif';
    const w = ctx.measureText(txt).width + 84;
    if (cx + w > W - M) { cx = M; cyy += 66; }
    rr(ctx, cx, cyy, w, 50, 25);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    drawCheck(ctx, cx + 30, cyy + 25, 14, '#38BDF8');
    ctx.fillStyle = '#E2E8F0'; ctx.fillText(txt, cx + 50, cyy + 33);
    cx += w + 16;
  });

  // footer
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, 1268); ctx.lineTo(W - M, 1268); ctx.stroke();
  ctx.fillStyle = '#94A3B8'; ctx.font = '600 24px ui-monospace, Menlo, monospace';
  ctx.fillText('VIN ' + (state.vin || '—'), M, 1310);
  ctx.textAlign = 'right'; ctx.fillStyle = '#64748B'; ctx.font = '500 20px system-ui, Roboto, sans-serif';
  ctx.fillText('vinwise.app · estimate, not an appraisal · not a CARFAX® report', W - M, 1310); ctx.textAlign = 'left';
}

function downloadCard() {
  if (!state.unlocked) { toast('🔒 Unlock the report to download your card'); openPaywall(); return; }
  const cv = $('#share-canvas');
  try {
    cv.toBlob(blob => {
      if (!blob) { toast('Could not render image'); return; }
      const a = el('a', { href: URL.createObjectURL(blob), download: `vinwise-${state.vin}.png` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('📥 Saved — post it to Marketplace!');
      vibrate(20);
    }, 'image/png');
  } catch (_) { toast('Image export failed on this browser'); }
}

async function shareCard() {
  if (!state.unlocked) { toast('🔒 Unlock the report to share your card'); openPaywall(); return; }
  try {
    const blob = await new Promise(res => $('#share-canvas').toBlob(res, 'image/png'));
    const file = new File([blob], `vinwise-${state.vin}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My car valuation', text: 'Fair value verified — VINwise report' });
    } else { downloadCard(); }
  } catch (e) {
    if (e && e.name !== 'AbortError') downloadCard();
  }
}

/* ───────────────────────────── PAYMENT GATING ────────────────────────────── */
function openPaywall() {
  const stripe = $('#pay-stripe'), paypal = $('#pay-paypal');
  if (CONFIG.stripePaymentLink) {
    stripe.href = CONFIG.stripePaymentLink + '?client_reference_id=' + encodeURIComponent(state.vin + '.' + tokenFor(state.vin));
  } else {
    stripe.href = '#';
  }
  if (CONFIG.paypalLink) paypal.href = CONFIG.paypalLink;
  else paypal.href = '#';
  $('#paywall').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closePaywall() {
  $('#paywall').classList.add('hidden');
  document.body.style.overflow = '';
}

/* Server-verified unlock (prod) or clearly-labeled demo unlock. */
async function completeUnlock({ demo = false } = {}) {
  markUnlocked(state.vin);
  closePaywall();
  renderValuation(); renderComps(); renderHistory(); renderSticky(); drawShareCard();
  $('#share-note').textContent = 'Tap Share/Download — sized perfectly for Facebook Marketplace & eBay (4:5).';
  toast(demo ? '🔓 Demo unlock applied — full report open!' : '🔓 Payment verified — full report open!');
  vibrate([15, 40, 15]);
}

async function tryServerVerify(sessionId) {
  if (!CONFIG.verifyEndpoint) return false;
  try {
    const r = await fetch(CONFIG.verifyEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin: state.vin, session_id: sessionId })
    });
    const j = await r.json();
    return !!(j && j.ok && j.vin === state.vin);
  } catch (_) { return false; }
}

/* ─────────────────────────────── FLOW ────────────────────────────────────── */
function setFormLoading(on) {
  const b = $('#vin-submit');
  b.disabled = on;
  b.style.opacity = on ? '0.7' : '1';
  b.innerHTML = on ? 'Decoding VIN…' : b.dataset.orig;
}

async function runSearch(rawVin) {
  const val = validateVin(rawVin);
  if (!val.ok) {
    const err = $('#vin-error');
    err.textContent = val.msg; err.classList.remove('hidden');
    vibrate(30);
    return;
  }
  $('#vin-error').classList.add('hidden');

  // naive client-side rate limit (server-side limiter recommended in prod)
  const now = Date.now();
  while (lookupTimes.length && now - lookupTimes[0] > 60000) lookupTimes.shift();
  if (lookupTimes.length >= CONFIG.maxLookupsPerMin) {
    const err = $('#vin-error');
    err.textContent = 'Too many lookups — take a breath and try again in a minute.';
    err.classList.remove('hidden');
    return;
  }
  lookupTimes.push(now);

  const vin = val.vin;
  state.vin = vin; state.decoding = true;
  state.recalls = undefined; state.comps = null; state.history = null;
  state.miles = null; state.unlocked = isUnlockedFor(vin);
  setFormLoading(true);
  pushRecent(vin);
  showReport();

  // skeleton
  $('#r-title').textContent = 'Decoding ' + vin + '…';
  $('#r-vin').textContent = vin;
  $('#r-meta').textContent = 'connecting to NHTSA vPIC…';
  $('#r-source').textContent = '…';
  $('#specs-body').replaceChildren(el('div', { class: 'skeleton h-14 w-full' }), el('div', { class: 'skeleton mt-2 h-14 w-full' }));
  window.scrollTo({ top: 0 });

  const vehicle = await decodeVehicle(vin);
  state.vehicle = vehicle;
  renderReportShell(vehicle);
  renderSpecs(vehicle);
  drawShareCard();

  // recalls + history fetch in parallel (independent of paid content;
  // history is rendered masked behind the paywall until unlock)
  fetchRecalls(vehicle).then(rs => { state.recalls = rs; renderRecalls(rs); });
  fetchHistory(state).then(h => { state.history = h; renderHistory(); });
  renderValuation(); renderComps(); renderHistory(); renderSticky();
  state.decoding = false;
  setFormLoading(false);
}

async function applyMiles() {
  const raw = sanitizeDigits($('#miles-input').value);
  if (!raw || +raw < 100 || +raw > 800000) { toast('Enter real mileage (e.g. 84500)'); return; }
  state.miles = +raw;
  $('#miles-input').value = num(state.miles);
  $('#fmv-result').classList.remove('hidden');
  $('#fmv-num').textContent = '$ …';
  $('#comps-locked-note').classList.add('hidden');
  $('#comps-wrap').classList.remove('hidden');
  $('#comps-body').replaceChildren(el('div', { class: 'skeleton h-10 w-full' }), el('div', { class: 'skeleton mt-2 h-10 w-full' }), el('div', { class: 'skeleton mt-2 h-10 w-full' }));
  const comps = await fetchComps(state);
  state.comps = comps;
  renderValuation(); renderComps(); renderHistory(); drawShareCard();
  renderSticky();
  vibrate(15);
  toast('📊 6 local comps matched');
}
function sanitizeDigits(s) { return String(s ?? '').replace(/\D/g, ''); }

function renderRecent() {
  try {
    const list = JSON.parse(localStorage.getItem('vw_recent') || '[]');
    const wrap = $('#recent-wrap'), chips = $('#recent-chips');
    chips.replaceChildren();
    list.forEach(vin => chips.append(el('button', {
      type: 'button', class: 'chip chip-btn shrink-0 bg-white/10 font-mono text-[10px] text-slate-200',
      text: vin, onclick: () => { $('#vin-input').value = vin; updateVinCounter(); runSearch(vin); }
    })));
    wrap.classList.toggle('hidden', !list.length);
  } catch (_) {}
}
function pushRecent(vin) {
  try {
    let list = JSON.parse(localStorage.getItem('vw_recent') || '[]');
    list = [vin, ...list.filter(v => v !== vin)].slice(0, 5);
    localStorage.setItem('vw_recent', JSON.stringify(list));
  } catch (_) {}
  renderRecent();
}

/* ─────────────────────────────── EVENTS ──────────────────────────────────── */
function updateVinCounter() {
  const v = sanitizeVin($('#vin-input').value);
  $('#vin-count').textContent = v.length;
  $('#vin-progress').style.width = (v.length / 17 * 100) + '%';
}

function bindEvents() {
  $('#vin-submit').dataset.orig = $('#vin-submit').innerHTML;
  $('#vin-form').addEventListener('submit', e => { e.preventDefault(); runSearch($('#vin-input').value); });
  $('#vin-input').addEventListener('input', e => {
    const clean = sanitizeVin(e.target.value).slice(0, 17);
    if (e.target.value !== clean) e.target.value = clean;
    updateVinCounter();
  });
  $$('#sample-chips [data-vin]').forEach(b => b.addEventListener('click', () => {
    $('#vin-input').value = b.dataset.vin; updateVinCounter(); runSearch(b.dataset.vin);
  }));
  $('#recent-clear').addEventListener('click', () => { localStorage.removeItem('vw_recent'); renderRecent(); });
  $('#back-home').addEventListener('click', showLanding);
  $('#r-vin-copy').addEventListener('click', () => copyText(state.vin || ''));

  $('#miles-go').addEventListener('click', applyMiles);
  $('#miles-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyMiles(); } });
  $('#miles-input').addEventListener('input', e => { e.target.value = sanitizeDigits(e.target.value).slice(0, 7); });

  $('#ask-input').addEventListener('input', e => {
    e.target.value = sanitizeDigits(e.target.value).slice(0, 7);
    state.ask = e.target.value ? +e.target.value : null;
    if (state.comps && state.unlocked) { renderValuation(); drawShareCard(); }
  });
  $('#zip-input').addEventListener('input', e => { e.target.value = sanitizeDigits(e.target.value).slice(0, 5); });
  $('#zip-input').addEventListener('change', async e => {
    const z = sanitizeDigits(e.target.value);
    if (z.length !== 5) { toast('Enter a 5-digit ZIP'); return; }
    state.zip = z;
    $('#loc-label').textContent = 'ZIP ' + z;
    if (state.miles) { state.comps = await fetchComps(state); renderValuation(); renderComps(); drawShareCard(); toast('📍 Comps rebuilt for ' + z); }
  });
  $('#geo-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('GPS not available — enter your ZIP'); return; }
    toast('Locating…');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: la, longitude: lo } = pos.coords;
      let best = CITIES[0], bd = Infinity;
      for (const c of CITIES) { const d = (c.lat - la) ** 2 + (c.lon - lo) ** 2; if (d < bd) { bd = d; best = c; } }
      $('#loc-label').textContent = 'Near ' + best.n;
      state.zip = '300' + Math.abs(hashStr(best.n) % 90 + 10);
      toast('📍 Nearest market: ' + best.n + (bd * 69 ** 2 < 3600 ? '' : ' (wide match)'));
    }, () => toast('Location denied — using Atlanta area'), { timeout: 8000 });
  });

  $('#sticky-btn').addEventListener('click', openPaywall);
  $$('.unlock-btn').forEach(b => b.addEventListener('click', openPaywall));
  $('#pay-close').addEventListener('click', closePaywall);
  $('#paywall-backdrop').addEventListener('click', closePaywall);

  $('#pay-stripe').addEventListener('click', e => {
    if (!CONFIG.stripePaymentLink) { e.preventDefault(); toast('Owner: paste your Stripe Payment Link in CONFIG (see README)'); }
    else toast('Complete checkout in the new tab, then come back 🔓');
  });
  $('#pay-paypal').addEventListener('click', e => {
    if (!CONFIG.paypalLink) { e.preventDefault(); toast('Owner: paste your PayPal link in CONFIG (see README)'); }
  });
  $('#pay-demo').addEventListener('click', () => {
    if (!CONFIG.demoUnlock) { toast('Demo unlock disabled'); return; }
    if (!state.vin) { toast('Run a VIN search first'); return; }
    completeUnlock({ demo: true });
  });

  $('#share-dl').addEventListener('click', downloadCard);
  $('#share-native').addEventListener('click', shareCard);

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePaywall(); });
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied: ' + t); }
  catch (_) {
    const ta = el('textarea', { style: 'position:fixed;opacity:0', text: t });
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied: ' + t); } catch (__) { toast('Copy failed'); }
    ta.remove();
  }
}

/* ──────────────────────────────── INIT ───────────────────────────────────── */
function hasUnlockSignal(query) {
  const unlocked = (query.get('unlocked') || '').toLowerCase();
  return unlocked === '1' || unlocked === 'true' || /\/unlocked=true\/?$/i.test(location.pathname);
}

async function handleReturnUrl() {
  const q = new URLSearchParams(location.search);
  // Stripe forwards client_reference_id verbatim; we send "VIN.token" so the
  // redirect hands both back in one parameter. Split BEFORE sanitizing.
  const rawVinParam = (q.get('vin') || '').trim();
  const [rawVinPart, embeddedToken] = rawVinParam.split('.');
  const vin = sanitizeVin(rawVinPart || '').slice(0, 17);
  const unlockSignal = hasUnlockSignal(q);
  const t = sanitizeToken(q.get('t') || embeddedToken || '');
  const sid = q.get('session_id');
  if (!VIN_RE.test(vin)) return;
  $('#vin-input').value = vin; updateVinCounter();
  await runSearch(vin);
  if (unlockSignal) {
    const okToken = t === tokenFor(vin);
    if (okToken) { completeUnlock(); return; }
    const verified = await tryServerVerify(sid);
    if (verified) completeUnlock();
    else if (CONFIG.demoUnlock) completeUnlock({ demo: true });
    else toast('Payment received — if your report didn\u2019t unlock, reply to your Stripe receipt email with your VIN for a manual unlock.');
  }
}

function init() {
  bindEvents();
  renderRecent();
  updateVinCounter();
  $('#pay-demo').classList.toggle('hidden', !CONFIG.demoUnlock); // hide in live mode
  // Reviews disclosure: SAMPLE badge + note only while reviews are placeholders
  const sampleTag = $('#reviews-sample-tag'), sampleNote = $('#reviews-sample-note');
  if (sampleTag) sampleTag.classList.toggle('hidden', !CONFIG.reviewsAreSamples);
  if (sampleNote) sampleNote.classList.toggle('hidden', !CONFIG.reviewsAreSamples);
  const q = new URLSearchParams(location.search);
  if (q.get('vin') || hasUnlockSignal(q)) handleReturnUrl();
}
document.addEventListener('DOMContentLoaded', init);
