import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function NotFound({ children }: { children?: ReactNode }) {
  return (
    <div className="fallback-page">
      <h1>Not found</h1>
      <p>{children ?? "That page, project or task doesn't exist (anymore)."}</p>
      <div className="fallback-actions">
        <Link to="/app/all" className="btn primary">
          Back to the board
        </Link>
        <Link to="/" className="btn">
          Home
        </Link>
      </div>
    </div>
  )
}
