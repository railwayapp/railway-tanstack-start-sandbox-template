import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const patchBody = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().max(20).optional(),
})

export const Route = createFileRoute('/api/v1/projects/$projectId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ops = await import('@/lib/ops.server')
        const body = await request.json().catch(() => null)
        const parsed = patchBody.safeParse(body)
        if (!parsed.success || Object.keys(parsed.data).length === 0) {
          return Response.json({ error: 'body must set name and/or color' }, { status: 400 })
        }
        try {
          return Response.json(await ops.updateProjectOp({ id: params.projectId, ...parsed.data }))
        } catch (err) {
          if (err instanceof ops.NotFoundError) return Response.json({ error: err.message }, { status: 404 })
          throw err
        }
      },
      DELETE: async ({ params }) => {
        const ops = await import('@/lib/ops.server')
        try {
          return Response.json(await ops.deleteProjectOp(params.projectId))
        } catch (err) {
          if (err instanceof ops.NotFoundError) return Response.json({ error: err.message }, { status: 404 })
          throw err
        }
      },
    },
  },
})
