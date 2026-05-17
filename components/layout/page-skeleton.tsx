/**
 * Generic page-loading skeleton used by the dashboard route group's
 * loading.tsx files. Renders a quiet, shape-matching placeholder so the
 * shell + nav stay interactive while the actual page chunk + data load.
 *
 * Kept intentionally light — heavy skeleton work belongs in the page itself
 * once it mounts; this is just for the navigation transition window.
 */
import { cn } from '@/lib/utils'

interface PageSkeletonProps {
  /** Number of card placeholders to render in the content grid. */
  cards?: number
  /** Show a wider title block (e.g. for pages with a hero header). */
  wideTitle?: boolean
}

export function PageSkeleton({ cards = 6, wideTitle = false }: PageSkeletonProps) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl mx-auto space-y-4 animate-pulse">
      {/* Header row: title + range/filter chip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className={cn('h-7 bg-muted rounded-xl', wideTitle ? 'w-64' : 'w-48')} />
        <div className="h-8 bg-muted rounded-xl w-44" />
      </div>

      {/* A summary card */}
      <div className="h-20 bg-muted rounded-2xl" />

      {/* Content grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
