'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import NextError from 'next/error'

// App Router's global error boundary — fires when an error escapes the root
// layout (the regular error.tsx files can't catch those). We forward the
// error to Sentry so unrecoverable crashes don't slip through, then render
// Next's built-in error page since our own UI may itself be the cause.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
