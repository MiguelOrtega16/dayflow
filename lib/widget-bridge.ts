import { Capacitor, registerPlugin } from '@capacitor/core'

export interface WidgetAuthPayload {
  supabaseUrl: string
  anonKey:     string
  accessToken: string
  refreshToken: string
  expiresAt:   number   // epoch seconds
  userId:      string
}

export interface WidgetConfig {
  color:   string   // hex like "#7C6FE3"
  opacity: number   // 0–100
}

interface WidgetBridgePlugin {
  writeSnapshot(opts: { json: string }): Promise<void>
  writeAuth(opts: WidgetAuthPayload): Promise<void>
  clearAuth(): Promise<void>
  writeConfig(opts: { widgetId: number; color: string; opacity: number }): Promise<void>
  readConfig(opts: { widgetId: number }): Promise<WidgetConfig>
  listWidgetIds(): Promise<{ ids: number[] }>
  requestPin(): Promise<{ supported: boolean; requested: boolean }>
}

// Capacitor's registerPlugin returns a proxy that throws on web. We wrap each
// method in a guard so callers can fire-and-forget without checking platform.
const native = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

export function isWidgetSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export const WidgetBridge = {
  writeSnapshot: (json: string) =>
    isWidgetSupported() ? native.writeSnapshot({ json }) : Promise.resolve(),

  writeAuth: (auth: WidgetAuthPayload) =>
    isWidgetSupported() ? native.writeAuth(auth) : Promise.resolve(),

  clearAuth: () =>
    isWidgetSupported() ? native.clearAuth() : Promise.resolve(),

  writeConfig: (widgetId: number, cfg: WidgetConfig) =>
    isWidgetSupported()
      ? native.writeConfig({ widgetId, color: cfg.color, opacity: cfg.opacity })
      : Promise.resolve(),

  readConfig: (widgetId: number): Promise<WidgetConfig> =>
    isWidgetSupported()
      ? native.readConfig({ widgetId })
      : Promise.resolve({ color: '#7C6FE3', opacity: 95 }),

  listWidgetIds: (): Promise<number[]> =>
    isWidgetSupported()
      ? native.listWidgetIds().then(r => r.ids)
      : Promise.resolve([]),

  requestPin: () =>
    isWidgetSupported()
      ? native.requestPin()
      : Promise.resolve({ supported: false, requested: false }),
}
