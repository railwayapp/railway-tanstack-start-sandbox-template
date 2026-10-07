import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const createBody = z.object({ name: z.string().min(1).max(60) })

export const Route = createFileRoute('/api/v1/projects')({
  server: {
    handlers: {
      GET: async () => {
        const ops = await import('@/lib/ops.server')
        return Response.json(await ops.listProjectsOp())
      },
      POST: async ({ request }) => {
        const ops = await import('@/lib/ops.server')
        const body = await request.json().catch(() => null)
        const parsed = createBody.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: 'body must be {"name": string}' }, { status: 400 })
        }
        return Response.json(await ops.createProjectOp(parsed.data.name), { status: 201 })
      },
    },
  },
})
