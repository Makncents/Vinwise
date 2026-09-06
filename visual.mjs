/* Visual QA — screenshots at Galaxy S24 FE viewport (360×780, DPR 3). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('python3', ['-m', 'http.server', '8899', '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://127.0.0.1:8899/index.html', { waitUntil: 'load' });

// 1. landing
await page.screenshot({ path: 'test/shot-1-landing.png' });

// 2. live NHTSA decode (real API call from this sandbox)
await page.fill('#vin-input', '1HGCM82633A004352');
await page.click('#vin-submit');
await page.waitForTimeout(3500);
await page.screenshot({ path: 'test/shot-2-decoded.png', fullPage: false });

// 3. mileage → teaser with masked comps
await page.fill('#miles-input', '128000');
await page.click('#miles-go');
await page.waitForTimeout(900);
await page.screenshot({ path: 'test/shot-3-teaser.png' });

// 4. paywall sheet
await page.click('#sticky-btn');
await page.waitForTimeout(450);
await page.screenshot({ path: 'test/shot-4-paywall.png' });

// 5. demo unlock → full report + share card
await page.click('#pay-demo');
await page.waitForTimeout(600);
await page.screenshot({ path: 'test/shot-5-unlocked.png' });

// 6. share card section
await page.locator('#share-section').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: 'test/shot-6-sharecard.png' });

const fmv = await page.textContent('#fmv-num');
const rows = await page.locator('#comps-body .comp-row').count();
const title = await page.textContent('#r-title');
const src = await page.textContent('#r-source');
console.log(JSON.stringify({ title, src, fmv, compRows: rows }));
await browser.close();
server.kill();
