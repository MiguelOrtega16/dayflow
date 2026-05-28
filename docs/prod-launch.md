# Production Launch Checklist

End-to-end environment + config switches for taking DayFlow from testing-track to public Play Store release.

Companion to [billing-setup.md](billing-setup.md), which covers initial Stripe / Play / RevenueCat account creation. This doc is about **flipping a working setup from test to live.**

---

## 0. Where each kind of value lives

| Surface | Used by | How prod values are set |
|---|---|---|
| **Vercel → Settings → Environment Variables** | All Next.js server code (webhooks, cron, API routes, server components) AND every `NEXT_PUBLIC_*` baked into the client bundle the Capacitor WebView loads from `day-flow.co` | Edit in dashboard → redeploy. Native app picks them up automatically because the WebView URL points at the live site. |
| **`.env.local`** | Local `npm run dev` only | Not for prod; never committed |
| **Build-time env on `npm run build:prod`** | `NEXT_PUBLIC_ENV`, `CAPACITOR_BUILD` | Vercel runs build with `NEXT_PUBLIC_ENV=production`. For a Capacitor AAB you also set this locally before `npx cap sync` if you ever ship a static-bundle build. |
| **`AndroidManifest.xml` `<meta-data>`** | AdMob `APPLICATION_ID` — read by SDK at init, not runtime-overridable | Edit, commit, rebuild AAB |
| **`android/app/build.gradle`** | `versionCode` / `versionName` — used by force-update gate + Play tracks | Bump before each release; commit |
| **Capacitor build env** | `CAPACITOR_ENV` toggles `capacitor.config.ts` server URL between `localhost:3000` and `day-flow.co` | `npm run cap:prod` sets it to `production` |

> **Key insight:** the Android app loads its WebView from `day-flow.co` in prod, so virtually all `NEXT_PUBLIC_*` vars are fetched from Vercel's deployed bundle at runtime — **not** baked into the APK. Flipping a `NEXT_PUBLIC_*` on Vercel + redeploy is enough. **Exceptions:** anything read by native Android code (AdMob `APPLICATION_ID`, the `AD_ID` permission, `versionCode`) is build-time and requires a new AAB.

---

## 1. Supabase

| Var | Where used | Risk if wrong |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Every Supabase client ([lib/supabase/client.ts:5](../lib/supabase/client.ts#L5), server, middleware, cron) | Whole app reads/writes the wrong DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server-with-cookies code | Auth + RLS broken |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — webhooks, cron, `/api/delete-account`, billing upserts ([lib/billing/supabase-admin.ts:7](../lib/billing/supabase-admin.ts#L7), [lib/billing/entitlement-server.ts:9](../lib/billing/entitlement-server.ts#L9), [app/api/cron/activity-reminders/route.ts:50](../app/api/cron/activity-reminders/route.ts#L50)) | If leaked: full DB compromise. **Never** mark as `NEXT_PUBLIC_*` |

**Verify on the prod Supabase project:**
- [ ] `schema.sql` re-run end-to-end (RLS, `handle_new_user` trigger, per-share notification mute trigger, all indexes)
- [ ] Realtime publication includes `shared_calendars`, `notifications`, `activity_comments` (idempotent in schema, worth confirming)
- [ ] Auth providers configured: Google OAuth client IDs, redirect URL `https://day-flow.co/auth/callback`
- [ ] Storage bucket `activity-evidence` exists with correct policies (used by [lib/api.ts:882](../lib/api.ts#L882))
- [ ] Email templates point at `day-flow.co`, not localhost

---

## 2. Stripe (web subscriptions)

| Var | Surface | Test → Prod |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server — [`/api/billing/checkout`](../app/api/billing/checkout/route.ts#L14), [`/api/billing/portal`](../app/api/billing/portal/route.ts#L14) | `sk_test_...` → `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Server — [`/api/webhooks/stripe`](../app/api/webhooks/stripe/route.ts#L76) | `whsec_...` test-endpoint → `whsec_...` from a **live-mode** endpoint (different value!) |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` | Client — [products.ts:24](../lib/billing/products.ts#L24) | Test `price_...` → live `price_...` (different IDs per mode) |
| `NEXT_PUBLIC_STRIPE_PRICE_ANNUAL` | Client | same |
| `NEXT_PUBLIC_STRIPE_PRICE_LIFETIME` | Client | same |

**Stripe dashboard actions (not env vars — easy to forget):**
1. **Flip Stripe to Live mode** (top-right toggle). Test and live are fully separate worlds — products, prices, customers, webhooks all duplicated.
2. **Re-create the three Products** in Live mode (Test Clone helps) and swap the price IDs in Vercel.
3. **Create the live webhook endpoint** → `https://day-flow.co/api/webhooks/stripe`, same events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
4. Copy the **live** signing secret to `STRIPE_WEBHOOK_SECRET` in Vercel.
5. **Enable the live Customer Portal** (Settings → Billing → Customer portal — separate from test-mode config).
6. **Adaptive pricing + manual MXN/COP overrides** need re-applying per-product in Live mode.
7. **Bank account / Payouts** verified (1–3 days during initial setup; worth re-confirming).
8. **Stripe Tax** (if enabled in test, enable in live too).
9. **Final smoke test:** real $0.50 charge with your own card on a hidden test SKU before announcing, then refund. Confirm webhook fires → entitlement upserts → portal opens.

---

## 3. RevenueCat (Android via Play Billing)

| Var | Surface | Test → Prod |
|---|---|---|
| `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` | Client — [revenuecat.ts:51](../lib/billing/revenuecat.ts#L51) | Usually same `goog_...` key — RC uses one project for both Play sandbox + production (distinguished by Play's `purchaseToken`). Only swap if you maintain separate dev / prod RC projects. |
| `REVENUECAT_WEBHOOK_SECRET` | Server — [`/api/webhooks/revenuecat`](../app/api/webhooks/revenuecat/route.ts#L50) | Same value if reusing project; new value if separate prod project |

**RevenueCat dashboard:**
- [ ] Webhook URL points at `https://day-flow.co/api/webhooks/revenuecat` (not Vercel preview)
- [ ] Authorization header is **literally** `Bearer <REVENUECAT_WEBHOOK_SECRET>` — handler does constant-time compare, any stray whitespace = 401
- [ ] Entitlement ID `pro` exists (must match `RC_ENTITLEMENT_ID` in [products.ts](../lib/billing/products.ts))
- [ ] Offering `default` is marked as **Current**, with packages `$rc_monthly`, `$rc_annual`, `lifetime` mapped to the right Play SKUs
- [ ] Send test event → confirm 200 response

**Play Console must agree:**
- [ ] SKUs `dayflow_pro_monthly`, `dayflow_pro_annual`, one-time `dayflow_pro_lifetime` are **Activated**
- [ ] `revenuecat` service account has "Manage orders and subscriptions" (24h to propagate if just granted)
- [ ] App is on the **Production** track, not Closed/Open testing

---

## 4. AdMob

The wiring lives in [lib/admob.ts](../lib/admob.ts) and [components/ads/ad-banner.tsx](../components/ads/ad-banner.tsx), mounted on 7 pages (overview, stats, people, settings root, appearance, datetime, notifications). Gated by `NEXT_PUBLIC_ENABLE_ADS`.

| Var | Surface | Test → Prod |
|---|---|---|
| `NEXT_PUBLIC_ENABLE_ADS` | Client — [admob.ts:31](../lib/admob.ts#L31), [ad-banner.tsx:17](../components/ads/ad-banner.tsx#L17) | unset (default off) → `1` |
| `NEXT_PUBLIC_ADMOB_BANNER_AD_ID` | Client — [admob.ts:88](../lib/admob.ts#L88) | unset (falls back to Google's universal test banner) → real `ca-app-pub-.../...` unit ID |
| `NEXT_PUBLIC_ENV` | Multiple — controls AdMob `isTesting` flag, Sentry env tag, PostHog debug | `development` → `production` |
| `AndroidManifest.xml` `APPLICATION_ID` `<meta-data>` | Build-time (read by AdMob SDK at startup) | Already real `ca-app-pub-.../~...` — confirm before final AAB build |
| `AndroidManifest.xml` `AD_ID` permission | Build-time | Already declared (per Play Console pre-launch report fix) |

**Pre-flip requirements (Play policy):**
- [ ] Data-safety form in Play Console mentions AdMob's data collection
- [ ] Privacy policy URL says you serve ads
- Both must be **live before** flipping `NEXT_PUBLIC_ENABLE_ADS=1` — Play policy requires disclosure to precede activation

---

## 5. Firebase Cloud Messaging (push)

| Var | Surface | Test → Prod |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Server — [firebase-admin.ts:5](../lib/firebase-admin.ts#L5) — used by cron + webhook routes to send push | Dev project JSON → prod project JSON (or same if one Firebase project) |
| `android/app/google-services.json` | Build-time, picked up by Gradle | Confirm `project_id` matches prod Firebase project before AAB build |

**Critical verification:**
- [ ] Firebase project's SHA-1 fingerprints list includes both your **upload key** and Play's **app signing key**. Play re-signs your AAB; without Play's signing-key SHA-1 in Firebase, push tokens silently fail in production.
- [ ] Notification channels (`reminders`, `daily_summary`, etc. — see [DailySummaryNotifier.kt](../android/app/src/main/java/com/chanclastudio/dayflow/summary/DailySummaryNotifier.kt)) are created at first launch
- [ ] If you ever sent test pushes from a dev project, scrub the FCM tokens from the prod DB so old test devices don't get stale notifications

---

## 6. Web push (VAPID) — only if you serve push to web

| Var | Surface | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Server — [firebase-admin.ts:28-30](../lib/firebase-admin.ts#L28) | Generate one pair (e.g. via `web-push generate-vapid-keys`), share across envs. Never rotate without coordinating with subscribed devices. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client — [push-notifications.ts:29](../lib/push-notifications.ts#L29) | Same public key as above, exposed to client |

If you're shipping Android-only and the web is "thin" (billing + auth surfaces only), you can skip these — web push will silently disable.

---

## 7. PostHog (product analytics)

| Var | Surface | Test → Prod |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Client + server captures — [posthog.ts:33](../lib/analytics/posthog.ts#L33), [posthog-server.ts:11](../lib/analytics/posthog-server.ts#L11) | Use a **separate prod project** so dev events don't pollute funnels. Cost is per-event, matters once usage scales. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Both | `https://us.i.posthog.com` or `https://eu.i.posthog.com` depending on region |

`NEXT_PUBLIC_ENV` toggles a PostHog debug flag ([posthog.ts:58](../lib/analytics/posthog.ts#L58)) — already wired correctly.

---

## 8. Sentry (error tracking)

| Var | Surface | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client + server fallback — [instrumentation-client.ts:16](../instrumentation-client.ts#L16), [sentry.server.config.ts:7](../sentry.server.config.ts#L7) | Public DSN, safe to expose. One Sentry project for prod, optionally a separate one for dev/preview. |
| `SENTRY_DSN` | Server only (overrides client DSN at server runtime) | Usually leave unset — the public DSN suffices |
| `SENTRY_AUTH_TOKEN` | Build-time only — `next.config.js` `withSentryConfig` for source-map upload | Required for prod build if you want symbolicated stack traces. Vercel env, never client. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build-time | Required alongside `SENTRY_AUTH_TOKEN` |

`environment` tag is driven by `NEXT_PUBLIC_ENV` ([sentry.server.config.ts:9](../sentry.server.config.ts#L9)), so production / development separation in the Sentry UI is automatic.

---

## 9. Resend (email) — currently disabled

| Var | Surface | Notes |
|---|---|---|
| `RESEND_API_KEY` | Server — [`/api/notify-email`](../app/api/notify-email/route.ts#L5) | Currently unset → email notifications silently no-op. To enable: get prod key from Resend + verify a custom sending domain (DNS records). |
| `RESEND_FROM_EMAIL` | Server — line 26 | Default `DayFlow <onboarding@resend.dev>` (Resend's shared sandbox sender, mediocre deliverability) → swap to `DayFlow <notifications@day-flow.co>` once domain is verified |

If you're not enabling email yet, leave both unset; the route early-returns silently.

---

## 10. Vercel Cron

| Var | Surface | Notes |
|---|---|---|
| `CRON_SECRET` | Server — [`/api/cron/activity-reminders`](../app/api/cron/activity-reminders/route.ts#L8), [`/api/cron/activity-30min-reminders`](../app/api/cron/activity-30min-reminders/route.ts#L22) | Vercel injects this into its scheduled-cron requests. Set in Vercel → Settings → Environment Variables to any strong random string. **If unset, anyone can hit the cron route** and trigger reminder spam. |
| `APP_TIMEZONE` | Server cron — [route.ts:45](../app/api/cron/activity-reminders/route.ts#L45) | Defaults to `'UTC'`. Determines what "morning reminders" mean server-side. Recommend leaving at UTC and computing per-user TZ in the handler. |

`vercel.json` already schedules both crons. Verify they show as "Active" in Vercel → Settings → Cron Jobs after the prod deploy.

---

## 11. App URL & environment label

| Var | Surface | Dev | Prod |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | CTA link builder in email notifications — [api.ts:699](../lib/api.ts#L699), [api.ts:833](../lib/api.ts#L833) | `http://localhost:3000` | `https://day-flow.co` |
| `NEXT_PUBLIC_ENV` | AdMob testing flag, Sentry env, PostHog debug, [lib/env.ts](../lib/env.ts) helper | `development` | `production` |
| `CAPACITOR_ENV` | [capacitor.config.ts](../capacitor.config.ts) — picks dev vs prod WebView URL | `development` | `production` (set via `npm run cap:prod`) |

---

## 12. Android build-time

| Where | What to verify before final AAB |
|---|---|
| [`android/app/build.gradle`](../android/app/build.gradle) | `versionCode` bumped (force-update gate keys off this — see `NEXT_PUBLIC_MIN_SUPPORTED_ANDROID_VERSION_CODE` in [version-check.ts:16](../lib/version-check.ts#L16)), `versionName` set, release `signingConfig` points at upload keystore |
| [`android/app/src/main/AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml) | AdMob `APPLICATION_ID`, BILLING permission (line 142), AD_ID permission (line 150), package name `com.chanclastudio.dayflow` |
| `android/app/google-services.json` | Prod Firebase project (`project_id` field) |
| Upload key + Play App Signing | Confirm SHA-1 fingerprints registered with Firebase + (if used) Google Sign-In OAuth client |

---

## 13. Cleanup before public launch

Not env vars, but should ship together:

| Item | Where | Action |
|---|---|---|
| `BillingDebugButton` + `/api/debug/billing/set-state` | [components/billing-debug-button.tsx](../components/billing-debug-button.tsx), [app/api/debug/billing/set-state/route.ts](../app/api/debug/billing/set-state/route.ts) | Delete (per launch TODO at the top of the file). Route is gated by `BILLING_DEBUG_ENABLED`/`NODE_ENV=development` so it's not actively unsafe, but it's listed as launch-time cleanup. |
| Sentry source-map upload | `next.config.js` | Confirm wiring (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel) so prod stack traces are readable |
| PostHog session recording | PostHog dashboard | If enabled, confirm masking rules for sensitive fields (emails, names) |
| Signup-grace 3-day Pro trial | Not yet built | Tracked in memory — separate work item, post-launch decision |

---

## Recommended switch order on launch day

1. **Supabase prod project ready** — schema run, OAuth configured, email templates updated.
2. **Stripe live mode** — products, webhook, portal, prices, adaptive pricing.
3. **RevenueCat** — webhook URL on `day-flow.co`, entitlement `pro`, offering `default` Current.
4. **Vercel env vars** — paste all the above. Set `NEXT_PUBLIC_ENV=production`. **Do NOT** set `NEXT_PUBLIC_ENABLE_ADS=1` yet.
5. **Deploy** Vercel. Smoke-test web: auth + real Stripe checkout + Customer Portal in incognito.
6. **Bump `versionCode`** in build.gradle. AAB build with prod `google-services.json`, real AdMob `APPLICATION_ID` in manifest. Upload to Play **Production** track.
7. **Play production review** — hours to days. While waiting, finish updating Play Console **data-safety form** + **privacy policy** to disclose AdMob.
8. **Once Play approves + the build is rolling out:** flip `NEXT_PUBLIC_ENABLE_ADS=1` in Vercel, redeploy. Ads light up on the already-live builds (no new AAB needed — the toggle is read from Vercel's served bundle).
9. **Post-launch:** monitor Sentry, PostHog conversion funnel, Stripe + RC webhooks for 24h before celebrating.
