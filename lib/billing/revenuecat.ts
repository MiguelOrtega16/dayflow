'use client'

import { Capacitor } from '@capacitor/core'
import {
  LOG_LEVEL,
  Purchases,
  type PurchasesOffering,
  type PurchasesPackage,
} from '@revenuecat/purchases-capacitor'
import { env } from '@/lib/env'
import type { BillingProductId } from '@/types'
import { PLAY_PRODUCT_IDS } from './products'

export type OfferingPriceEntry = {
  priceString: string | null
  available: boolean
}
export type OfferingPriceMap = Record<BillingProductId, OfferingPriceEntry>

let configured = false
let configuredFor: string | null = null

// Maps our internal product IDs to the RevenueCat package identifiers we
// created in offering 'default' (C4 in docs/billing-setup.md).
const PACKAGE_IDENTIFIER: Record<BillingProductId, string> = {
  pro_monthly: '$rc_monthly',
  pro_annual: '$rc_annual',
  pro_lifetime: '$rc_lifetime',
}

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

// Initialise the RC SDK and bind it to the signed-in Supabase user. Idempotent
// — safe to call on every dashboard mount. On web we no-op (RC handles only the
// native side; Stripe Checkout drives the web purchase flow).
export async function initRevenueCat(userId: string): Promise<void> {
  if (!isNative()) return
  if (!userId) return

  if (configured) {
    if (configuredFor !== userId) {
      await Purchases.logIn({ appUserID: userId })
      configuredFor = userId
    }
    return
  }

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY
  if (!apiKey) {
    console.warn('[revenuecat] NEXT_PUBLIC_REVENUECAT_ANDROID_KEY not set — purchases disabled')
    return
  }

  if (env.isDev) {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG })
  }

  await Purchases.configure({ apiKey, appUserID: userId })
  configured = true
  configuredFor = userId
}

export async function logOutRevenueCat(): Promise<void> {
  if (!isNative() || !configured) return
  await Purchases.logOut()
  configuredFor = null
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isNative()) return null
  const result = await Purchases.getOfferings()
  return result.current ?? null
}

// Resolve an RC package for one of our internal product IDs. We try the
// configured RC package identifier first (the conventional shape we set up
// in offering 'default'), then fall back to matching by the underlying Play
// Store SKU. The SKU fallback means we still find the right package even if
// someone in the RC dashboard named the package differently — e.g. used the
// built-in 'Lifetime' type ($rc_lifetime) instead of our custom 'lifetime'.
function findPackage(offering: PurchasesOffering, productId: BillingProductId): PurchasesPackage | null {
  const id = PACKAGE_IDENTIFIER[productId]
  const byIdentifier = offering.availablePackages.find((p) => p.identifier === id)
  if (byIdentifier) return byIdentifier

  const sku = PLAY_PRODUCT_IDS[productId]
  if (!sku) return null
  // Play subscription SKUs come through as `{product_id}:{base_plan_id}` on
  // the product side too, but the prefix before `:` always matches.
  return offering.availablePackages.find((p) => {
    const productSku = p.product.identifier
    return productSku === sku || productSku.split(':')[0] === sku
  }) ?? null
}

// Trigger a native purchase. Resolves when the receipt has been validated by
// RevenueCat — by the time this returns, the RC webhook has likely already
// fired and updated our `subscriptions` table. The useEntitlement() hook will
// pick up the change via Supabase realtime.
export async function purchaseProduct(productId: BillingProductId): Promise<void> {
  if (!isNative()) {
    throw new Error('purchaseProduct can only be called on native platforms — use Stripe Checkout on web')
  }
  const offering = await getCurrentOffering()
  if (!offering) throw new Error('No RevenueCat offering available')

  const pkg = findPackage(offering, productId)
  if (!pkg) throw new Error(`Package ${PACKAGE_IDENTIFIER[productId]} not found in offering`)

  await Purchases.purchasePackage({ aPackage: pkg })
}

export async function restorePurchases(): Promise<void> {
  if (!isNative()) return
  await Purchases.restorePurchases()
}

// Returns localized prices + availability for every Pro plan. Used by the
// paywall to show Play Store-formatted prices in the user's local currency
// instead of the USD anchor, and to hide plans (e.g. Lifetime) that the RC
// dashboard hasn't published in the current offering on this device.
export async function getOfferingPrices(): Promise<OfferingPriceMap | null> {
  if (!isNative()) return null
  const offering = await getCurrentOffering()
  if (!offering) return null

  const result = {} as OfferingPriceMap
  for (const productId of Object.keys(PACKAGE_IDENTIFIER) as BillingProductId[]) {
    const pkg = findPackage(offering, productId)
    result[productId] = {
      priceString: pkg?.product.priceString ?? null,
      available: !!pkg,
    }
  }
  return result
}

// True when the user dismissed the Play Store / App Store purchase sheet
// without confirming. We treat this as a soft cancel, not a destructive error.
// RC's PURCHASES_ERROR_CODE enum isn't exported as a runtime value by the
// Capacitor wrapper, so we match the documented code ("1" → PURCHASE_CANCELLED_ERROR)
// directly along with the legacy userCancelled boolean and a message fallback.
export function isPurchaseCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { code?: unknown; userCancelled?: unknown; message?: unknown }
  if (anyErr.userCancelled === true) return true
  if (String(anyErr.code) === '1') return true
  if (typeof anyErr.message === 'string' && /cancell?ed/i.test(anyErr.message)) return true
  return false
}
