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

let configured = false
let configuredFor: string | null = null

// Maps our internal product IDs to the RevenueCat package identifiers we
// created in offering 'default' (C4 in docs/billing-setup.md).
const PACKAGE_IDENTIFIER: Record<BillingProductId, string> = {
  pro_monthly: '$rc_monthly',
  pro_annual: '$rc_annual',
  pro_lifetime: 'lifetime',
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

function findPackage(offering: PurchasesOffering, productId: BillingProductId): PurchasesPackage | null {
  const id = PACKAGE_IDENTIFIER[productId]
  return offering.availablePackages.find((p) => p.identifier === id) ?? null
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
