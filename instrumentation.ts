import * as Sentry from '@sentry/nextjs'

// Sentry's required hook for App Router server/edge runtimes. Next.js calls
// register() once per server start. We branch on NEXT_RUNTIME so each runtime
// pulls its own config — keeps the edge bundle small and avoids Node-only
// integrations leaking into the edge environment.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Capture errors thrown in server components / route handlers so they reach
// Sentry. Without this, App Router errors only show up in logs.
export const onRequestError = Sentry.captureRequestError
