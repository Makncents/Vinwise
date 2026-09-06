# VINwise — Local Car Value & History Insights ($15)

A single-file, mobile-first web app that undercuts CarFax ($44.99) and AutoCheck
($29.99) for peer-to-peer car sellers: free NHTSA vPIC decode + recalls,
a 6-comparable **Local Valuation Matrix** (the competitive moat), a $15
one-time Stripe/PayPal unlock (positioned as “the same core data as a $44.99 CarFax — 67% less”), and a 1-tap 1080×1350 **Marketplace Proof Card**
sellers can post straight to Facebook Marketplace / eBay / OfferUp.

Built for the Galaxy S24 FE viewport (360–400 CSS px, DPR 3) and every screen above it.

---

## 1 · Architecture

```
vinwise/
├── index.html          ← BUILT single-file app (deploy THIS — 112 KB, zero external deps)
├── src/
│   ├── index.html      ← markup template ({{INLINE_CSS}} / {{INLINE_JS}} markers)
│   ├── input.css       ← Tailwind source + component layer (compiled, then inlined)
│   └── app.js          ← the whole engine (validation, NHTSA client, comps, paywall, canvas)
├── tailwind.config.js  ← navy/electric-sky fintech theme (accent token = Tailwind sky palette)
├── build.mjs           ← compiles Tailwind + inlines everything into ./index.html
├── netlify.toml / vercel.json / .nojekyll   ← free-tier deploy configs + security headers
└── test/
    ├── smoke.mjs       ← jsdom full-funnel test (validation → decode → comps → unlock)
    ├── layout-audit.mjs← Playwright layout/tap-target/overflow audit @360×780
    └── visual.mjs      ← Playwright screenshots @ DPR 3
```

**Why compiled-and-inlined Tailwind instead of the CDN:** no render-blocking
request, works offline/in sandboxed previews, better Lighthouse/CWV on mobile.
The markup stays idiomatic Tailwind; `npm run build` inlines the minified CSS.

```bash
npm install
npm run build        # → index.html (single file)
npm run serve        # local preview on :8080
npm i -D jsdom && node test/smoke.mjs        # full-funnel test
```

## 2 · Deploy (free tiers)

| Host | How |
|---|---|
| **GitHub Pages** | Push the repo (or upload the folder). The included GitHub Action (`.github/workflows/deploy.yml`) builds, tests, and deploys automatically — just set Settings → Pages → Source: **GitHub Actions** once. |
| **Netlify** | `netlify deploy --prod --dir .` (or drag-drop). `netlify.toml` adds HSTS + security headers. |
| **Vercel** | `vercel --prod`. `vercel.json` adds the same headers. |
| Any static host / S3 | Copy `index.html`. That's the whole app. |

HTTPS is required (Geolocation API + share/canvas + PCI posture).

## 3 · Turn on payments (5 minutes)

1. **Stripe → Payment Links → New.** One-time price **$15.00**, product
   "VINwise Full Report".
2. In the link's **After payment → redirect customers to your website**, set:

   `https://YOURDOMAIN/?vin={client_reference_id}&unlocked=1`

   The app already appends `?client_reference_id=<VIN>.<token>` when opening
   your link, so the VIN rides through Stripe and back. *(Stripe forwards
   the raw `client_reference_id`; the app also accepts `&vin=` alone.)*
3. Paste the link into `CONFIG.stripePaymentLink` in `src/app.js`, rebuild.
4. Optional PayPal fallback: a PayPal Me / checkout link in `CONFIG.paypalLink`.

### Making the unlock server-verified (recommended before real traffic)

Client-side gating is a **UX gate, not a security gate** — anyone can edit
localStorage. For production, verify the Checkout Session server-side:

```js
// api/verify-checkout.js  (Vercel/Netlify function, Node runtime)
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
export default async (req, res) => {
  const { session_id, vin } = JSON.parse(req.body);
  const s = await stripe.checkout.sessions.retrieve(session_id);
  const ok = s.payment_status === 'paid' &&
             s.client_reference_id?.startsWith(vin + '.');
  res.json({ ok, vin: ok ? vin : null });
};
```

Set `CONFIG.verifyEndpoint = '/api/verify-checkout'` and add
`&session_id={CHECKOUT_SESSION_ID}` to your Stripe redirect URL. The app then
only unlocks on a server-confirmed payment. Disable the demo path with
`CONFIG.demoUnlock = false`.

## 4 · Going live with data

Everything mock is **clearly badged “DEMO DATA”** in the UI and switches on one flag:

```js
CONFIG.compsProvider   = 'live';  CONFIG.liveEndpoints.comps   = 'https://your-api/comps?vin={vin}&zip={zip}&miles={miles}';
CONFIG.historyProvider = 'live';  CONFIG.liveEndpoints.history = 'https://your-api/history?vin={vin}';
```

- **Comps endpoint** returns `[{title, miles, dist, city, seller, price}, … ×6]`.
  Wire it to your marketplace-aggregation job (Facebook Marketplace/Craigslist/
  Autotrader scraping has ToS + copyright considerations — licensed listing
  feeds or a partner API are the durable route; the seeded model ships as the
  instant-on fallback).
- **History endpoint** returns `{records:[{k,v,note,s}, …]}`. Use an
  **NMVTIS-approved reseller** (the list of approved data providers is on the
  DOJ/NMVTIS site) — selling title-brand history to consumers legally requires
  NMVTIS-sourced data, and NMVTIS rules govern required disclaimers (already
  baked into this UI: “not all states report; absence of a record is not a
  guarantee; verify independently”).

## 5 · Security model

| Layer | Implementation |
|---|---|
| Input | Allowlist sanitizer (`[^A-Z0-9]` stripped, I/O/Q dropped, `^[A-HJ-NPR-Z0-9]{17}$`, maxlength) — injection payloads can't enter state; VIN check-digit (pos 9) verified with the full transliteration/weights algorithm |
| Rendering | Zero `innerHTML` with dynamic data — DOM built via `el()` + `textContent` only (XSS-safe by construction) |
| Transport | CSP `connect-src` limited to NHTSA; `default-src 'self'`; `object-src 'none'`; payments are top-level redirects to Stripe/PayPal (`rel="noopener noreferrer"`) — card data never touches your origin → **PCI-DSS SAQ-A** |
| Headers | HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy: geolocation=(self)` (netlify.toml / vercel.json) |
| Abuse | Client rate-limit (6 lookups/min); add edge/server limits (Netlify rate-limiting, Vercel WAF) at scale |
| Payments | Handled entirely by Stripe/PayPal hosted pages; server verify endpoint pattern included |

## 6 · Compliance guardrails (already in the UI)

- Marketed as a **“Comprehensive Public & Market Value Insights Report”** — never as CARFAX/AutoCheck data; explicit non-affiliation + trademark disclaimers in pricing table and footer.
- NMVTIS-aligned disclosure language (source coverage caveats, “not a guarantee”, independent-inspection advice) in the history card, landing compliance block, and footer.
- Valuations labeled **estimates**, demo data badged **SAMPLE/DEMO** — no fabricated “purchased facts”.
- Competitor prices cited as “as of Sep 2026, may change.”
- ⚠️ Before real revenue: swap the placeholder 4.9★ social proof for real numbers (FTC truth-in-advertising), add ToS/Privacy Policy pages, and register your NMVTIS data source if selling history.


## 6b · Positioning & claims (read before scaling)

- **Price:** $15 one-time. Discount math used across the UI: **$15 vs $44.99 CarFax = save $29.99 = 67%** (66.7% precisely) and $15 vs $29.99 AutoCheck = 50%. Never round up to “77%” — an inflated discount claim is low-hanging fruit for an FTC or state-AG action.
- **“Same data as CarFax”:** the app says “same *core* data / same report on the records that decide a purchase” — grounded in 49 U.S.C. §32705 (consumer history providers must include NMVTIS data) and NHTSA public feeds. It does **not** claim to sell CARFAX’s proprietary report; the non-affiliation disclaimer stays everywhere the comparison appears. Keep it that way.
- **Statistics on the landing page** (73% more leads — Lemonfree×CarFax 5M-listing study; 5× more likely to submit a lead — Dataium; 71% will seek a report — AYTM n=1,000; 36% more likely to buy with detailed history — Ally/Harris Poll n=2,012) are real, sourced, and labeled “measured reports generally, not VINwise.” Re-verify before paid ad campaigns, since platforms (and the FTC) hold advertisers to substantiation.

## 7 · Feature map

| Requirement | Where |
|---|---|
| VIN decode + recalls (free, live) | `decodeVehicle()` / `fetchRecalls()` → NHTSA vPIC + recalls API, with offline structural fallback (WMI table, year code, check digit) |
| 6-comp Local Valuation Matrix | `fetchComps()` — deterministic seeded engine (xmur3+mulberry32), depreciation + mileage-delta model, P25–P75 fair band, dealer/private mix, ZIP rebuild, GPS nearest-market |
| Teaser → $4.99 unlock | Masked-in-DOM teaser (values never shipped to the client until unlock), sticky CTA, bottom-sheet paywall, Stripe Payment Link w/ `client_reference_id`, server-verify hook, demo unlock |
| Marketplace image card | `drawShareCard()` — 1080×1350 canvas, download PNG + Web Share API (files) for native share on Android |
| Mobile-first UX | 360px-locked hero, 56px CTAs, 44px tap targets (audited), safe-area insets, haptics, skeleton shimmer, zero horizontal overflow (audited) |

---

**Test results:** jsdom full-funnel ✔ · Playwright layout audit @360×780 ✔ · live NHTSA decode ✔ · 0 page errors ✔
