import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error('DefaultCatchBoundary Error:', error)

  return (
    <div className="fallback-page">
      <h1>Something broke</h1>
      <div className="fallback-error">
        <ErrorComponent error={error} />
      </div>
      <div className="fallback-actions">
        <button type="button" className="btn primary" onClick={() => router.invalidate()}>
          Try again
        </button>
        {isRoot ? (
          <Link to="/" className="btn">
            Home
          </Link>
        ) : (
          <button type="button" className="btn" onClick={() => window.history.back()}>
            Go back
          </button>
        )}
      </div>
    </div>
  )
}
