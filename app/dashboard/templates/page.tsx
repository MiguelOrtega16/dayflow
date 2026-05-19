'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Flame } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useBackButtonRoute } from '@/lib/back-button'
import {
  TEMPLATE_CATEGORIES, templatesByCategory,
  type TemplateCategory,
} from '@/lib/activity-templates'

export default function TemplatesPage() {
  const { t } = useI18n()
  const router = useRouter()

  // Hardware back returns to the main dashboard, not the quit-app confirm.
  useBackButtonRoute(() => router.push('/dashboard'))

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('templatesPage.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('templatesPage.title')}</h1>
      </header>

      <div className="p-4 max-w-lg mx-auto w-full space-y-6">
        {TEMPLATE_CATEGORIES.map(cat => (
          <CategorySection key={cat} category={cat} />
        ))}
      </div>
    </div>
  )
}

function CategorySection({ category }: { category: TemplateCategory }) {
  const { t } = useI18n()
  const router = useRouter()
  const items = templatesByCategory(category)

  if (items.length === 0) return null

  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
        {t(`templatesPage.categories.${category}`)}
      </h2>
      <div className="space-y-2">
        {items.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => router.push(`/dashboard/templates/${tpl.id}`)}
            className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 hover:border-foreground/30 transition-colors text-left"
          >
            <span className="text-2xl shrink-0 w-8 text-center" aria-hidden>{tpl.emoji}</span>
            <span className="flex-1 min-w-0 text-sm font-medium truncate">
              {t(`templates.${tpl.id}.name`)}
            </span>
            {tpl.popular && (
              <Flame className="w-4 h-4 text-amber-500 shrink-0" aria-label={t('templatesPage.popular')} />
            )}
            {tpl.isNew && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-rose-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
                {t('templatesPage.isNew')}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </section>
  )
}
