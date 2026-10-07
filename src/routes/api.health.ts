import { createFileRoute } from '@tanstack/react-router'

// Railway's health check (see .railway/railway.ts). A new deployment only
// receives traffic once this returns a 2xx, so a deploy that can't reach its
// database never replaces a working one.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db } = await import('@/db')
          const { sql } = await import('drizzle-orm')
          await db.execute(sql`select 1`)
          return Response.json({ ok: true })
        } catch (err) {
          console.error('[health] database check failed', err)
          return Response.json({ ok: false, database: 'unreachable' }, { status: 503 })
        }
      },
    },
  },
})
