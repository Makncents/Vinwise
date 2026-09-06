/* Headless smoke test — loads the BUILT single-file index.html in jsdom.
   Covers: validation → decode (offline fallback) → mileage → teaser masking →
   paywall → LIVE return-URL unlock flow (valid + forged token).
   Demo unlock is disabled in live mode, so the Stripe redirect path IS the
   unlock path. Run: node test/smoke.mjs */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const SALT = 'vw-salt-change-me';
const djb2 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
const tokenFor = vin => djb2('tok|' + vin + '|' + SALT).toString(36);

const errors = [];
async function makeDom(url = 'https://vinwise.test/') {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url,
    pretendToBeVisual: true,
    beforeParse(window) {
      const noop = () => {};
      const ret = () => ({ addColorStop: noop, width: 100 });
      window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 100 }) : ret) });
      window.HTMLCanvasElement.prototype.toBlob = (cb) => cb({ size: 1, type: 'image/png' });
      window.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
    }
  });
  await sleep(150); // DOMContentLoaded + init
  return dom;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const assert = (cond, name) => { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + name); if (!cond) failed = 1; };

/* ══════ INSTANCE 1 · search, teaser, paywall ══════ */
{
  console.log('— boot —');
  const dom = await makeDom();
  const { window } = dom; const { document } = window;
  const $ = s => document.querySelector(s);
  assert(!!$('#vin-form'), 'hero form present');
  assert($('#vin-count').textContent === '0', 'VIN counter starts 0');

  console.log('— validation —');
  $('#vin-input').value = '1HGCM82633A0043"52><script>';
  $('#vin-input').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert($('#vin-input').value === '1HGCM82633A004352', 'XSS/SQLi payload stripped: ' + $('#vin-input').value);
  $('#vin-input').value = 'abc123';
  $('#vin-input').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#vin-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert(!$('#vin-error').classList.contains('hidden'), 'invalid VIN rejected: ' + $('#vin-error').textContent.slice(0, 40));

  console.log('— decode + teaser (locked) —');
  $('#vin-input').value = '1HGCM82633A004352';
  $('#vin-input').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#vin-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1000);
  assert(!$('#report').classList.contains('hidden'), 'report view shown');
  assert($('#r-title').textContent.includes('HONDA'), 'decoded: ' + $('#r-title').textContent);
  $('#miles-input').value = '128000';
  $('#miles-input').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#miles-go').click();
  await sleep(500);
  assert(document.querySelectorAll('#comps-body .comp-row').length === 6, '6 comps rendered');
  assert($('#fmv-num').textContent.includes('•'), 'FMV masked');
  assert(!$('#sticky-cta').classList.contains('hidden'), 'sticky CTA visible while locked');
  assert(!$('#free-preview').classList.contains('hidden'), 'free-preview banner visible while locked');
  assert($('#history-body').classList.contains('lock-blur'), 'history blurred while locked');

  console.log('— paywall (live mode) —');
  $('#sticky-btn').click();
  assert(!$('#paywall').classList.contains('hidden'), 'paywall opens');
  const href = $('#pay-stripe').href;
  assert(href.startsWith('https://buy.stripe.com/cNifZigwG492cuNgo99Ve00'), 'LIVE Stripe link wired: ' + href.slice(0, 48) + '…');
  assert(href.includes('client_reference_id=1HGCM82633A004352.'), 'VIN + token ride along in client_reference_id');
  assert($('#pay-demo').classList.contains('hidden'), 'demo/simulate button HIDDEN in live mode');
  window.close();
}

/* ══════ INSTANCE 2 · Stripe return URL with VALID token → auto-unlock ══════ */
{
  console.log('— return URL · valid token (real payment path) —');
  const vin = '1HGCM82633A004352';
  const dom = await makeDom(`https://vinwise.test/?vin=${vin}.${tokenFor(vin)}&unlocked=1`);
  const { document } = dom.window;
  const $ = s => document.querySelector(s);
  await sleep(1200);
  assert(!$('#report').classList.contains('hidden'), 'report re-opened from return URL');
  assert($('#sticky-cta').classList.contains('hidden'), 'auto-unlocked: sticky CTA gone');
  assert(!$('#history-body').classList.contains('lock-blur'), 'auto-unlocked: history revealed');
  assert($('#free-preview').classList.contains('hidden'), 'free-preview banner removed');
  $('#miles-input').value = '128000';
  $('#miles-input').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  $('#miles-go').click();
  await sleep(500);
  assert(/^\$\d/.test($('#fmv-num').textContent), 'FMV revealed: ' + $('#fmv-num').textContent);
  assert(!document.querySelector('#comps-body .comp-row').textContent.includes('$•'), 'comps revealed');
  dom.window.close();
}

/* ══════ INSTANCE 3 · forged token → stays locked ══════ */
{
  console.log('— return URL · forged token (security) —');
  const dom = await makeDom('https://vinwise.test/?vin=1HGCM82633A004352.deadb33f&unlocked=1');
  const { document } = dom.window;
  await sleep(1200);
  assert(!document.querySelector('#sticky-cta').classList.contains('hidden'), 'forged token does NOT unlock');
  assert(document.querySelector('#history-body').classList.contains('lock-blur'), 'history stays blurred');
  dom.window.close();
}

if (errors.length) { console.log('\nwindow errors:'); errors.forEach(e => console.log('  ' + e)); failed = 1; }
else if (!failed) console.log('\nALL GREEN ✔');
process.exit(failed ? 1 : 0);
