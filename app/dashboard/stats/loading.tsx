import { PageSkeleton } from '@/components/layout/page-skeleton'

// Estadísticas — 4 KPI tiles + 3 main analytics cards.
export default function StatsLoading() {
  return <PageSkeleton cards={4} />
}
