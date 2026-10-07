import type { ReactNode } from 'react'
import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '../styles/app.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Dispatch — a work tracker where the work gets done' },
      {
        name: 'description',
        content:
          'A work tracker built with TanStack Start, TanStack AI, and Postgres — where Railway sandboxes execute your tasks.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="fallback-page">
      <h1>Something broke</h1>
      <p>{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
      <Link to="/app/all" className="btn primary">
        Back to the board
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="fallback-page">
      <h1>Not found</h1>
      <p>That page or task doesn't exist (anymore).</p>
      <Link to="/app/all" className="btn primary">
        Back to the board
      </Link>
    </div>
  ),
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
