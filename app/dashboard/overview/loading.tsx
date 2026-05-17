import { PageSkeleton } from '@/components/layout/page-skeleton'

// Tareas page — 3 status columns on desktop.
export default function OverviewLoading() {
  return <PageSkeleton cards={3} />
}
