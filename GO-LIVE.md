# 💰 GO-LIVE CHECKLIST — from this folder to your first $15

> **STATUS (2026-09-04):** ✅ Your live Stripe link is wired into the app
> (`src/app.js` → `CONFIG.stripePaymentLink`), ✅ the demo "simulate payment"
> backdoor is removed, ✅ the paid-return auto-unlock flow is tested.
> **Still required, in order:** STEP 3 (deploy + domain) → then the redirect URL
> in STEP 1 (needs that domain). Until the redirect is set in Stripe, paying
> customers won't auto-unlock — everything else works.

Follow these steps in order. Total time: ~30 minutes. No servers, no DevOps.

---

## STEP 1 — Create your Stripe Payment Link (5 min)

1. Sign up / log in at **dashboard.stripe.com** (activate your account for live
   payments when ready — you can test everything in test mode first).
2. **Payment Links → + New** (left sidebar).
3. Product:
   - Name: `VINwise Full Vehicle Report`
   - Price: **$15.00 USD · One time**
4. Click **After payment → Change → "Redirect customers to your website"** and enter:

   ```
   https://YOURDOMAIN.com/?vin={client_reference_id}&unlocked=1
   ```

   Replace `YOURDOMAIN.com` with your real domain (from Step 3). The app
   automatically puts the VIN into Stripe's `client_reference_id` field when a
   buyer clicks *Unlock*, so Stripe hands it back and the report re-opens paid.
5. Save → **copy the link** (looks like `https://buy.stripe.com/xxxxxx`).

> Optional PayPal fallback: your PayPal.Me link (`paypal.me/yourname/15.00`).

## STEP 2 — Paste your link into the app (2 min)

Open `src/app.js` — the CONFIG block at the very top:

```js
stripePaymentLink: 'https://buy.stripe.com/YOUR_LINK_HERE',   // ← paste
paypalLink: '',                                              // ← optional
demoUnlock: false,        // ← set to false BEFORE going live (kills the "simulate payment" button)
```

Then rebuild the single file:

```bash
npm install
npm run build     # → index.html (deploy this file)
```

## STEP 3 — Deploy free (pick one, 5 min)

| Host | Steps |
|---|---|
| **Netlify (easiest)** | app.netlify.com → *Add new site → Deploy manually* → drag this folder → done. Then *Domain settings → Add custom domain*. |
| **Vercel** | `npm i -g vercel` → `vercel --prod` in this folder. |
| **GitHub Pages** | Push to a repo → Settings → Pages → Deploy from branch → root. |

Buy a domain (~$10/yr, e.g. `getvinwise.com`) at Namecheap/Cloudflare and point
it at the host per their DNS instructions. **You need the custom domain before
Step 1's redirect URL will work**, so: deploy first → domain second → then
finish the Stripe redirect URL → redeploy nothing (the URL lives in Stripe).

## STEP 4 — Test the money flow (5 min)

> ⚠️ Your wired link (`buy.stripe.com/cNif…`) is a **live-mode** link — Stripe's
> test card 4242… will NOT work on it. To test end-to-end, either create a
> separate **test-mode** payment link and swap it into CONFIG temporarily, or
> run one real $15 purchase and refund it in the Stripe dashboard.

1. In Stripe, toggle **Test mode** and create a test payment link the same way
   (or test live with a real $15 and refund yourself).
2. Put the test link in CONFIG, deploy, run a VIN, click *Unlock*.
3. Pay with Stripe's test card: **4242 4242 4242 4242**, any future expiry, any CVC.
4. After redirect you should land back on the report → fully unlocked.

## STEP 5 — Lock the gate for real revenue (recommended, 15 min)

Out of the box the unlock is stored on the buyer's device (fine for launch —
the blurred data literally isn't in the page until unlock). For server-verified
unlocks, add one serverless function:

**Vercel** → create `api/verify-checkout.js`:
```js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
export default async (req, res) => {
  const { session_id, vin } = JSON.parse(req.body);
  const s = await stripe.checkout.sessions.retrieve(session_id);
  const ok = s.payment_status === 'paid' && s.client_reference_id?.startsWith(vin + '.');
  res.json({ ok, vin: ok ? vin : null });
};
```
(`npm i stripe` in the folder, then `vercel --prod`. Netlify: same file under
`netlify/functions/` with `exports.handler` wrapper.)

Then in Stripe's redirect URL append `&session_id={CHECKOUT_SESSION_ID}` and in
`src/app.js` set `verifyEndpoint: '/api/verify-checkout'`. Now unlock only
happens on a Stripe-confirmed payment.

## STEP 6 — Your numbers

- Price **$15.00** → Stripe fee 2.9% + 30¢ → **you keep ~$14.26 per report**.
- vs CarFax $44.99: you market **"save 67%"** (66.7% exact — never print 77%).
- Break-even at typical $5–10/day ad spend: ~1–2 report sales/day.

## STEP 7 — Before you scale ad spend (compliance)

- [ ] Wire a real history source: set `historyProvider:'live'` with an
      **NMVTIS-approved data provider** (see README §4) — the DEMO badge stays on
      until then. Selling "history" with sample data = refund/chargeback risk.
- [ ] Add real ToS + Privacy Policy pages (free generators are fine to start).
- [ ] Reviews section ships with a **SAMPLE** badge + disclosure note (`CONFIG.reviewsAreSamples: true`). Collect real reviews (e.g., a post-purchase email asking buyers to reply with a quote), paste them into the testimonials in `src/index.html` (`#reviews` section), update the 4.9/128 numbers to the real aggregate, then set `reviewsAreSamples: false` and rebuild. Never display fabricated reviews as genuine — FTC rule 16 CFR Part 465, ~$51k per violation.
- [ ] Keep the source attributions under the statistics exactly as shipped.

---

**The one-file rule:** after any edit to `src/`, run `npm run build`, and
re-deploy `index.html`. That file *is* the entire product.
