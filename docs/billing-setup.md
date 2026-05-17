# Billing Setup

Click-by-click setup for the three billing providers DayFlow uses. Order matters: **Stripe → Play Console → RevenueCat**. RevenueCat requires Play products to exist first.

Code references: SKU IDs live in [lib/billing/products.ts](../lib/billing/products.ts) and must match what you configure here.

---

## A. Stripe (web subscriptions)

### A1. Account & keys
1. Sign up at [dashboard.stripe.com](https://dashboard.stripe.com); activate the account (business details + bank).
2. Toggle **Test mode** in the top-right while building.
3. **Developers → API keys** → copy:
   - **Secret key** → `.env.local` as `STRIPE_SECRET_KEY`
   - **Publishable key** (saved for paywall later)

### A2. Create the three Products
**Products → + Create product** — three times:

| Name | Pricing model | Price | Billing | Notes |
|---|---|---|---|---|
| DayFlow Pro Monthly | Recurring | $1.99 | Monthly | — |
| DayFlow Pro Annual | Recurring | $12.99 | Yearly | Enable **Free trial → 3 days** |
| DayFlow Pro Lifetime | One-time | $27.99 | — | — |

Open each product → click its price → copy the **Price ID** (`price_...`) into `.env.local`:
- `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY`
- `NEXT_PUBLIC_STRIPE_PRICE_ANNUAL`
- `NEXT_PUBLIC_STRIPE_PRICE_LIFETIME`

### A3. Regional pricing
**Settings → Payments → Adaptive pricing → Enable.** Stripe auto-converts from USD to the buyer's local currency.

Manual overrides for top markets — on each product → **Add another price**:
- **MXN:** MX$39 (monthly), MX$249 (annual), MX$549 (lifetime)
- **COP:** 7,900 / 49,900 / 109,900

### A4. Customer Portal
**Settings → Billing → Customer portal:**
- Enable.
- Turn on **Cancel subscriptions** + **Switch plans** (Monthly ↔ Annual).
- Cancellation: **At end of billing period**.

### A5. Webhook endpoint
**Developers → Webhooks → + Add endpoint:**
- **URL:** `https://<your-vercel-url>/api/webhooks/stripe`
- Or local dev via Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- **Events to send:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `checkout.session.completed`
- Save → reveal **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

> When creating Checkout Sessions in code, set `client_reference_id` AND `subscription_data.metadata.user_id` to the Supabase user.id (subs), or `metadata: { user_id, product_id: 'pro_lifetime' }` (lifetime). The webhook handler bails if missing.

---

## B. Google Play Console

### B1. App prerequisites
1. **Play Console → All apps → Create app** (if not done).
2. **Setup → Monetization setup** → accept distribution agreement.
3. **Payments profile** → set up merchant account (legal + bank). Verification takes ~1–3 days.

### B2. Upload required before SKU creation
Play does **not** let you create in-app products until at least one AAB is uploaded to a release track.

1. **Test and release → Testing → Internal testing** (or Closed) → **Create new release**.
2. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
3. Save (or roll out). Wait ~5 min for processing.

The app's manifest must declare `com.android.vending.BILLING` — already added in [AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml#L76). If you've changed it, bump `versionCode` in [build.gradle](../android/app/build.gradle#L11) and re-upload.

### B3. Subscription products
**Monetize → Subscriptions → + Create subscription** — twice:

**Subscription #1 — `dayflow_pro_monthly`**
- Product ID: `dayflow_pro_monthly` (must match `PLAY_PRODUCT_IDS` in products.ts)
- Base plan:
  - ID: `monthly`
  - Period: **1 month**
  - Renewal: **Auto-renewing**
  - Price: **$1.99 USD** → set MX$39, COP $7,900; auto-convert the rest
- **Activate** the base plan

**Subscription #2 — `dayflow_pro_annual`**
- Product ID: `dayflow_pro_annual`
- Base plan: period **1 year**, price **$12.99 USD** (MX$249, COP $49,900)
- **Offers → + Add offer:**
  - Offer ID: `freetrial`
  - Eligibility: **New customer acquisition**
  - Phase 1: **Free trial**, duration **3 days**
- Activate offer

### B4. One-time product (lifetime)
**Monetize → Products → One-time products → + Create product:**
- Product ID: `dayflow_pro_lifetime`
- Name: DayFlow Pro Lifetime
- Price: **$27.99** (MX$549, COP $109,900)
- **Activate**

### B5. Service account for RevenueCat

> **API access is account-level, not app-level.** Go to Play Console → top-left dropdown → **All apps** to exit the app context, then in the account sidebar open **Setup → API access**. (If you can't find Setup, use the gear icon top-right → **Developer account → API access**.)

1. **Setup → API access → Linked Google Cloud project** → **Link existing project** (or **Create new project**).
2. Open [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) (make sure the linked project is selected in the GCP top bar).
3. **+ Create service account** → name `revenuecat` → **Create and continue** → **Done** (skip the optional GCP role grants step).
4. Click the new service account row → **Keys** tab → **Add key → Create new key → JSON** → download.
5. Back in Play Console → refresh **Setup → API access**; the `revenuecat` row now appears under **Service accounts**. Click **Grant access** → check:
   - **View financial data, orders, and cancellation survey responses**
   - **Manage orders and subscriptions**
   - (Optional) **App permissions** tab → add DayFlow to scope the account to this app only.
6. Click **Invite user**. Wait ~24 hours for permissions to propagate before RevenueCat will succeed (until then it returns 403 silently).

---

## C. RevenueCat

> RevenueCat's dashboard was redesigned in 2025. The legacy "Project settings → Apps" tab is gone — apps now live under **Apps & providers** in the left sidebar, and product objects under **Product catalog**.

### C1. Project + Android app
1. Sign up at [app.revenuecat.com](https://app.revenuecat.com).
2. **Create new project** → `DayFlow`.
3. Left sidebar → **Apps & providers** (expand) → **Configurations** → click the **New app configuration** tile (Apple/Amazon/Android icons). On the next screen pick **Google Play Store**.
4. Fill in:
   - App name: `DayFlow Android`
   - Package name: `com.chanclastudio.dayflow`
   - Service Account Credentials: paste the full JSON downloaded in B5.
5. Save (RC validates the JSON on save — a 403 usually means Play's 24h permission grant hasn't propagated yet).

> Ignore the **API key for testing** (`test_...`) shown on the empty-state page. That's RC's sandbox/Test Store key, not what our app uses. The real `goog_...` key appears in **Apps & providers → API keys** after step C1 saves successfully.

### C2. Entitlement
1. Left sidebar → **Product catalog → Entitlements → + New entitlement**.
2. Identifier: **`pro`** (must match `RC_ENTITLEMENT_ID` in [products.ts](../lib/billing/products.ts#L18)).

### C3. Products
**Product catalog → Products → + New product** — three times:

| Identifier (must match Play SKU) | Type |
|---|---|
| `dayflow_pro_monthly` | Subscription |
| `dayflow_pro_annual` | Subscription |
| `dayflow_pro_lifetime` | Non-consumable |

For each: pick the **DayFlow Android** app, choose the matching Play SKU from the dropdown, and attach to entitlement **`pro`**. If the SKU dropdown is empty, the service account can't see Play products yet — wait out the 24h propagation.

### C4. Offerings
1. **Product catalog → Offerings → + New offering** → ID: `default`.
2. **Add packages:**
   - `$rc_monthly` → `dayflow_pro_monthly`
   - `$rc_annual` → `dayflow_pro_annual`
   - `lifetime` → `dayflow_pro_lifetime`
3. Mark this offering as **Current**.

### C5. Webhook
1. Left sidebar → **Integrations → Webhooks → + Add webhook**.
2. URL: `https://<your-vercel-url>/api/webhooks/revenuecat`
3. **Authorization header value:** generate a strong random string (e.g. `openssl rand -hex 32`). Save the same value in `.env.local` as `REVENUECAT_WEBHOOK_SECRET` — the handler does a constant-time compare against `Bearer <value>`.
4. Leave all event types selected.
5. Save → **Send test event** → confirm 200 response.

### C6. SDK key (for Android)
**Apps & providers → API keys** (sub-item in the sidebar) → find the row for the Google Play Store configuration → copy the public SDK key (`goog_...`) → `.env.local` as `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`.

The Capacitor SDK call later will be `Purchases.configure({ apiKey, appUserID: supabaseUserId })` — that links RevenueCat's `app_user_id` to our `subscriptions.user_id`.

---

## Pre-Phase-1 checklist

- [ ] `.env.local` has all 8 billing vars (4 server: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`; 4 public: 3× `NEXT_PUBLIC_STRIPE_PRICE_*`, `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY`)
- [ ] Stripe webhook test event → `/api/webhooks/stripe` → 200
- [ ] RevenueCat webhook test event → `/api/webhooks/revenuecat` → 200
- [ ] Play merchant account verified
- [ ] Updated [schema.sql](../schema.sql) has been re-run on dev Supabase
- [ ] AAB with BILLING permission + bumped versionCode is approved on Play

---

## References

- Plan & rationale: `Desktop/monetization.md`
- Schema: [schema.sql](../schema.sql)
- SKU config: [lib/billing/products.ts](../lib/billing/products.ts)
- Webhook handlers: [app/api/webhooks/](../app/api/webhooks/)
