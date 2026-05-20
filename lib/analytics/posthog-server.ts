import { PostHog } from 'posthog-node'

type ServerEvent =
  | 'subscription_started'
  | 'subscription_cancelled'
  | 'subscription_renewed'
  | 'subscription_refunded'

type EventProps = Record<string, string | number | boolean | null | undefined>

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

let client: PostHog | null = null

function getClient(): PostHog | null {
  if (!KEY) return null
  if (client) return client
  client = new PostHog(KEY, {
    host: HOST,
    flushAt: 1,
    flushInterval: 0,
  })
  return client
}

export async function trackServer(
  userId: string,
  event: ServerEvent,
  props?: EventProps,
) {
  const ph = getClient()
  if (!ph) return
  ph.capture({ distinctId: userId, event, properties: props })
  await ph.flush()
}
