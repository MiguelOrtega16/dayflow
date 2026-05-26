'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Settings, RefreshCcw, Crown, Lock, Info } from 'lucide-react'
import { WidgetBridge, isWidgetSupported, type WidgetKind } from '@/lib/widget-bridge'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { useBackButtonRoute } from '@/lib/back-button'
import { createClient } from '@/lib/supabase/client'
import { SystemSettings } from '@/lib/system-settings'

interface WidgetCardConfig {
  kind:           WidgetKind
  pro:            boolean
  name:           string
  size:           string
  bullets:        string[]
  Preview:        React.ComponentType
}

export default function WidgetsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { entitlement } = useEntitlement(userId)
  const { open: openPaywall } = usePaywall()
  const [installedByKind, setInstalledByKind] = useState<Record<WidgetKind, number[]>>({ today: [], streak: [], nextup: [], day: [], agenda: [] })
  const [pinningKind, setPinningKind] = useState<WidgetKind | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ title: string; body: string } | null>(null)
  const supported = isWidgetSupported()

  // Hardware back returns to the main settings page instead of the
  // quit-app confirm.
  useBackButtonRoute(() => router.push('/dashboard/settings'))

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const toast = ({ title, description }: { title: string; description?: string }) =>
    setStatusMsg({ title, body: description ?? '' })

  const refreshIds = async () => {
    const [today, streak, nextup, day, agenda] = await Promise.all([
      WidgetBridge.listWidgetIds('today'),
      WidgetBridge.listWidgetIds('streak'),
      WidgetBridge.listWidgetIds('nextup'),
      WidgetBridge.listWidgetIds('day'),
      WidgetBridge.listWidgetIds('agenda'),
    ])
    setInstalledByKind({ today, streak, nextup, day, agenda })
  }

  useEffect(() => { refreshIds() }, [])

  const handleAdd = async (cfg: WidgetCardConfig) => {
    if (cfg.pro && !entitlement.isPro) {
      openPaywall('locked_widget')
      return
    }
    if (!supported) {
      toast({ title: t('widgets.mobileOnlyTitle'), description: t('widgets.mobileOnlyBody') })
      return
    }
    setPinningKind(cfg.kind)
    try {
      const res = await WidgetBridge.requestPin(cfg.kind)
      if (!res.supported) {
        toast({ title: t('widgets.addLauncherTitle'), description: t('widgets.addLauncherBody') })
      } else if (!res.requested) {
        toast({ title: t('widgets.cantStartTitle'), description: t('widgets.cantStartBody') })
      } else {
        toast({ title: t('widgets.doneTitle'), description: t('widgets.doneBody') })
        setTimeout(refreshIds, 1500)
      }
    } finally {
      setPinningKind(null)
    }
  }

  const widgetBullets = [
    t('widgets.bullets.todaysTasks'),
    t('widgets.bullets.completedToday'),
    t('widgets.bullets.markDone'),
    t('widgets.bullets.refresh'),
  ]

  const cards: WidgetCardConfig[] = [
    {
      kind: 'today',
      pro: false,
      name: t('widgets.todayName'),
      size: `${t('widgets.sizeLabel')} 4 × 3`,
      bullets: widgetBullets,
      Preview: TodayPreview,
    },
    {
      kind: 'streak',
      pro: false,
      name: t('widgets.streakName'),
      size: `${t('widgets.sizeLabel')} 2 × 1`,
      bullets: [t('widgets.streakSubtitle')],
      Preview: StreakPreview,
    },
    {
      kind: 'nextup',
      pro: false,
      name: t('widgets.nextupName'),
      size: `${t('widgets.sizeLabel')} 4 × 1`,
      bullets: [t('widgets.nextupSubtitle')],
      Preview: NextUpPreview,
    },
    {
      kind: 'day',
      pro: false,
      name: t('widgets.dayName'),
      size: `${t('widgets.sizeLabel')} 4 × 2`,
      bullets: [
        t('widgets.bullets.dayBigDate'),
        t('widgets.bullets.dayEventList'),
        t('widgets.bullets.dayOpensDayView'),
      ],
      Preview: DayPreview,
    },
    {
      kind: 'agenda',
      pro: false,
      name: t('widgets.agendaName'),
      size: `${t('widgets.sizeLabel')} 4 × 4`,
      bullets: [
        t('widgets.bullets.agendaThreeDays'),
        t('widgets.bullets.agendaTimeLine'),
        t('widgets.bullets.agendaOpensDayView'),
      ],
      Preview: AgendaPreview,
    },
  ]

  const bannerText = t('widgets.banner', { add: t('widgets.bannerAddBold') })
  const bannerParts = bannerText.split(t('widgets.bannerAddBold'))

  // Flat list of all installed widget ids (across kinds) for the "Active" section.
  const activeEntries: Array<{ id: number; kind: WidgetKind }> = [
    ...installedByKind.today.map(id => ({ id, kind: 'today' as const })),
    ...installedByKind.streak.map(id => ({ id, kind: 'streak' as const })),
    ...installedByKind.nextup.map(id => ({ id, kind: 'nextup' as const })),
    ...installedByKind.day.map(id => ({ id, kind: 'day' as const })),
    ...installedByKind.agenda.map(id => ({ id, kind: 'agenda' as const })),
  ]

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('widgets.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('widgets.title')}</h1>
      </header>

      <div className="mx-3 mt-3 rounded-xl bg-primary/10 text-foreground/80 text-sm px-4 py-3">
        {bannerParts[0]}
        <span className="font-semibold">{t('widgets.bannerAddBold')}</span>
        {bannerParts[1] ?? ''}
      </div>

      {/* Troubleshoot row — mirrors the notifications page so users have a
          discoverable place to fix the "widget shows stale data" case, which
          is the same OS-sleep restriction that breaks reminder delivery. */}
      {supported && (
        <div className="mx-3 mt-3 rounded-2xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => { SystemSettings.openAutoStartSettings().catch(() => {}) }}
            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{t('widgets.troubleshoot.rowLabel')}</span>
              <span className="block text-xs text-muted-foreground">{t('widgets.troubleshoot.rowSub')}</span>
            </span>
            <Info className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="mx-3 mt-3 rounded-xl bg-card border border-border text-sm px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{statusMsg.title}</p>
            {statusMsg.body && <p className="text-xs text-muted-foreground mt-0.5">{statusMsg.body}</p>}
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      <div className="p-3 space-y-3">
        {cards.map(cfg => {
          const locked = cfg.pro && !entitlement.isPro
          return (
            <div key={cfg.kind} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-semibold">{cfg.name}</h2>
                    {cfg.pro && <Crown className="w-4 h-4 text-indigo-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{cfg.size}</p>
                </div>
                <button
                  onClick={() => handleAdd(cfg)}
                  disabled={pinningKind === cfg.kind}
                  className={`shrink-0 px-4 py-1.5 rounded-full border-2 text-sm font-bold tracking-wider transition-colors disabled:opacity-50 ${
                    locked
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white'
                      : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                  }`}
                >
                  {pinningKind === cfg.kind
                    ? '...'
                    : locked
                      ? <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> PRO</span>
                      : t('widgets.addBtn')}
                </button>
              </div>

              <div className={locked ? 'relative opacity-70' : 'relative'}>
                <cfg.Preview />
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/60 backdrop-blur-[1px]">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                      <Crown className="w-3.5 h-3.5" /> {t('widgets.proLockedTitle')}
                    </div>
                  </div>
                )}
              </div>

              <ul className="mt-3 space-y-1.5">
                {cfg.bullets.map(b => (
                  <li key={b} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {activeEntries.length > 0 && (
        <div className="px-3 pb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
            {t('widgets.activeHeading')}
          </h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {activeEntries.map(({ id, kind }) => {
              const kindLabel =
                kind === 'streak' ? t('widgets.streakName') :
                kind === 'nextup' ? t('widgets.nextupName') :
                kind === 'day'    ? t('widgets.dayName')    :
                kind === 'agenda' ? t('widgets.agendaName') :
                                    t('widgets.todayName')
              // Soft-revert: a Pro widget installed during an active
              // subscription stays on the home screen after downgrade
              // (native widgets can't be uninstalled remotely), but the
              // in-app configure entry is gated so the user can't change
              // its color/opacity without re-subscribing.
              const isProWidget = kind === 'streak' || kind === 'nextup'
              const locked = isProWidget && !entitlement.isPro
              return (
                <button
                  key={`${kind}-${id}`}
                  onClick={() => locked ? openPaywall('locked_widget') : router.push(`/dashboard/widget/${id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {locked && <Crown className="w-4 h-4 text-indigo-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{kindLabel}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {locked ? t('widgets.proLockedTitle') : t('widgets.customizeShort')}
                      </p>
                    </div>
                  </div>
                  {locked
                    ? <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <Settings className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!supported && (
        <p className="text-xs text-muted-foreground text-center px-6 py-4">
          {t('widgets.androidOnly')}
        </p>
      )}
    </div>
  )
}

// ─── Today widget preview ────────────────────────────────────────────────────
function TodayPreview() {
  const { t } = useI18n()
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-background shadow-sm">
      <div className="bg-primary text-primary-foreground px-3 h-9 flex items-center justify-between text-xs font-bold">
        <span>{t('widgets.title')}</span>
        <div className="flex items-center gap-1.5 opacity-90">
          <Plus className="w-3.5 h-3.5" />
          <RefreshCcw className="w-3.5 h-3.5" />
          <Settings className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-1.5 text-xs">
        <p className="text-[10px] font-bold text-muted-foreground">{t('widgets.preview.today')}</p>
        <PreviewRow label={t('widgets.preview.sample1')} time="9:00 AM" />
        <PreviewRow label={t('widgets.preview.sample2')} time="11:30 AM" />
        <p className="text-[10px] font-bold text-muted-foreground pt-1">{t('widgets.preview.future')}</p>
        <PreviewRow label={t('widgets.preview.sample3')} time="20-05" />
        <p className="text-[10px] font-bold text-muted-foreground pt-1">{t('widgets.preview.completed')}</p>
        <PreviewRow label={t('widgets.preview.sample4')} time="8:00 AM" done />
      </div>
    </div>
  )
}

function PreviewRow({ label, time, done }: { label: string; time: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3.5 h-3.5 rounded-full border ${done ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40'}`} />
      <span className={`flex-1 truncate ${done ? 'line-through text-muted-foreground' : ''}`}>{label}</span>
      <span className="text-[10px] text-muted-foreground">{time}</span>
    </div>
  )
}

// ─── Streak widget preview ──────────────────────────────────────────────────
function StreakPreview() {
  const { t } = useI18n()
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-primary text-primary-foreground shadow-sm flex items-center gap-3 px-4 py-3 max-w-[280px] mx-auto">
      <div className="flex items-center gap-1 shrink-0">
        <div className="text-3xl font-bold leading-none">5</div>
        <span className="text-xl leading-none">🔥</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold tracking-widest truncate">{t('widgets.previewLabels.streakDays')}</div>
        <div className="text-xs opacity-80 mt-0.5 truncate">{t('widgets.previewLabels.todayShort', { done: 3, total: 7 })}</div>
      </div>
    </div>
  )
}

// ─── NextUp widget preview ──────────────────────────────────────────────────
function NextUpPreview() {
  const { t } = useI18n()
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-primary text-primary-foreground shadow-sm px-4 py-3">
      <div className="text-[10px] font-bold tracking-widest opacity-80">{t('widgets.previewLabels.nextupKicker')}</div>
      <div className="text-base font-bold mt-1 truncate">📅 {t('widgets.previewLabels.nextupSample')}</div>
      <div className="text-xs opacity-80 mt-0.5">{t('widgets.previewLabels.nextupCountdown')}</div>
    </div>
  )
}

// ─── Day widget preview ─────────────────────────────────────────────────────
// Mirrors the native 4×2 layout (see layout/day_widget.xml + DayWidgetProvider
// .kt): big date cluster on the left tinted with the user's app accent (the
// `bg-primary` class), neutral dark body on the right hosting up to 3-4
// activities with a coloured bullet, title and a small time/sublabel.
function DayPreview() {
  const { t } = useI18n()
  // Body uses bg-background + the default foreground text color so the
  // preview adapts to the app's light/dark theme exactly like the Today
  // preview above. Hardcoding #FAFAFA / #1A1A1A made the card feel like
  // an out-of-place patch in dark mode and the inner body looked like
  // its corners weren't rounded (they were — but a light body inside a
  // dark page makes the boundary visually pop). The on-device widget
  // body color is independently customizable via the widget settings
  // page; this preview only ever needs to look correct in-app.
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-background shadow-sm flex items-stretch">
      <div className="flex flex-col items-center justify-center w-16 shrink-0 bg-primary text-primary-foreground px-2 py-3">
        <div className="text-3xl font-bold leading-none">{t('widgets.previewLabels.dayBigDay')}</div>
        <div className="text-[10px] mt-1 opacity-90">{t('widgets.previewLabels.dayBigMonth')}</div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5 py-2.5 pl-3 pr-3">
        <DayPreviewRow color="#22c55e" title={t('widgets.previewLabels.daySample1')} sub={t('widgets.previewLabels.daySample1Sub')} />
        <DayPreviewRow color="#f59e0b" title={t('widgets.previewLabels.daySample2')} sub={t('widgets.previewLabels.daySample2Sub')} />
        <DayPreviewRow color="#a855f7" title={t('widgets.previewLabels.daySample3')} sub={t('widgets.previewLabels.daySample3Sub')} />
      </div>
    </div>
  )
}

function DayPreviewRow({ color, title, sub }: { color: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <div className="text-xs font-semibold truncate leading-tight">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  )
}

// ─── Agenda widget preview ──────────────────────────────────────────────────
// Mirrors the native 4×4 layout (see layout/agenda_widget.xml + the provider):
// an accent-coloured top header bar with the month, then a neutral dark body
// with today + next 2 days as date columns with colour-coded event blocks
// beside them. Block alpha (~55) matches the Kotlin-side withAlpha(color,
// 0x55) so the preview tracks the on-device look.
function AgendaPreview() {
  const { t } = useI18n()
  // bg-background + default text colors → adapts to the app's dark/light
  // theme just like the Today preview. See DayPreview note above for the
  // rationale; same fix applies here.
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-background shadow-sm">
      <div className="bg-primary text-primary-foreground px-4 h-10 flex items-center text-sm font-semibold">
        {t('widgets.previewLabels.agendaMonth')}
      </div>
      <div className="px-4 py-2.5">
        <AgendaPreviewDay
          dayLabel={t('widgets.previewLabels.agendaThu')}
          dayNum={7}
          events={[
            { color: '#22c55e', title: t('widgets.previewLabels.agendaSample1'), time: t('widgets.previewLabels.agendaSample1Time') },
            { color: '#0ea5e9', title: t('widgets.previewLabels.agendaSample2'), time: t('widgets.previewLabels.agendaSample2Time') },
          ]}
        />
        <AgendaPreviewDay
          dayLabel={t('widgets.previewLabels.agendaFri')}
          dayNum={8}
          events={[
            { color: '#f59e0b', title: t('widgets.previewLabels.agendaSample3'), time: t('widgets.previewLabels.agendaSample3Time') },
          ]}
        />
      </div>
    </div>
  )
}

function AgendaPreviewDay({
  dayLabel, dayNum, events,
}: {
  dayLabel: string
  dayNum: number
  events: Array<{ color: string; title: string; time: string }>
}) {
  // On the device the Agenda renderer paints the date column with the
  // first event-of-the-day's accent (see AgendaWidgetService.kt's
  // setTextColor on agenda_row_dow / agenda_row_dom). The preview needs
  // to mirror that or users see a colour scheme on the settings card
  // that doesn't appear after pinning.
  const dateAccent = events[0]?.color ?? '#666666'
  return (
    <div className="flex items-stretch gap-3 py-1.5">
      <div className="w-9 shrink-0 text-center">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: dateAccent }}>{dayLabel}</div>
        <div className="text-lg font-bold leading-tight" style={{ color: dateAccent }}>{dayNum}</div>
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {events.map((e, i) => (
          <div
            key={i}
            className="rounded-md px-2 py-1"
            style={{ backgroundColor: e.color + '55' }}
          >
            <div className="text-xs font-semibold truncate leading-tight">{e.title}</div>
            <div className="text-[10px] truncate text-muted-foreground">{e.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
