import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const patchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
})

export const Route = createFileRoute('/api/v1/tasks/$taskId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const ops = await import('@/lib/ops.server')
        try {
          return Response.json(await ops.getTaskOp(params.taskId))
        } catch (err) {
          if (err instanceof ops.NotFoundError) {
            return Response.json({ error: err.message }, { status: 404 })
          }
          throw err
        }
      },
      DELETE: async ({ params }) => {
        const ops = await import('@/lib/ops.server')
        try {
          return Response.json(await ops.deleteTaskOp(params.taskId))
        } catch (err) {
          if (err instanceof ops.NotFoundError) return Response.json({ error: err.message }, { status: 404 })
          throw err
        }
      },
      PATCH: async ({ request, params }) => {
        const ops = await import('@/lib/ops.server')
        const body = await request.json().catch(() => null)
        const parsed = patchBody.safeParse(body)
        if (!parsed.success || Object.keys(parsed.data).length === 0) {
          return Response.json(
            { error: 'body must set at least one of title, description, status, priority' },
            { status: 400 },
          )
        }
        try {
          return Response.json(await ops.updateTaskOp({ taskId: params.taskId, ...parsed.data }))
        } catch (err) {
          if (err instanceof ops.NotFoundError) {
            return Response.json({ error: err.message }, { status: 404 })
          }
          throw err
        }
      },
    },
  },
})
