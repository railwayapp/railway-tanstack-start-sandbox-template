import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const createBody = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20_000).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']).optional(),
})

export const Route = createFileRoute('/api/v1/projects/$projectId/tasks')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const ops = await import('@/lib/ops.server')
        return Response.json(await ops.listTasksOp(params.projectId))
      },
      POST: async ({ request, params }) => {
        const ops = await import('@/lib/ops.server')
        const body = await request.json().catch(() => null)
        const parsed = createBody.safeParse(body)
        if (!parsed.success) {
          return Response.json(
            { error: 'body must be {"title": string, description?, priority?, status?}' },
            { status: 400 },
          )
        }
        try {
          const task = await ops.createTaskOp({ projectId: params.projectId, ...parsed.data })
          return Response.json(task, { status: 201 })
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
