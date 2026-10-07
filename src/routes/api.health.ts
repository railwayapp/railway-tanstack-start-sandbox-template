import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { db } from '~/server/db.server'

// Railway's health check (see .railway/railway.ts). A new deployment only
// receives traffic once this returns a 2xx, so a deploy that can't reach its
// database never replaces a working one.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.execute(sql`select 1`)
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        } catch (err) {
          console.error('[health] database check failed', err)
          return Response.json(
            { ok: false, database: 'unreachable' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          )
        }
      },
    },
  },
})
