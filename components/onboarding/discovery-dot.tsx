import { cn } from '@/lib/utils'

/**
 * Small red badge overlay used to draw first-run attention to nav entry
 * points (Menu icon, People row, Settings row). Render the icon inside —
 * the dot is positioned absolutely at the icon's top-right corner.
 *
 * The `ring-card` class blends the dot's outline into whatever surface
 * the icon sits on (sidebar = bg-card, bottom nav = bg-card), so the dot
 * keeps its shape against dark backgrounds.
 */
export function DiscoveryDot({
  show,
  children,
  className,
}: {
  show: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {children}
      {show && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-card"
        />
      )}
    </span>
  )
}
