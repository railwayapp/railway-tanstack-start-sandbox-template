import { createFileRoute } from '@tanstack/react-router'
import { getTaskOp } from '~/server/ops.server'
import { RunConflictError, cancelRun, startRun } from '~/server/runs.server'

// POST /api/v1/tasks/:taskId/run starts a sandbox run and returns 202 with its
// id. Follow progress with GET /api/v1/tasks/:taskId. DELETE cancels the
// task's active run.
export const Route = createFileRoute('/api/v1/tasks/$taskId/run')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { runId } = await startRun(params.taskId)
          return Response.json({ runId }, { status: 202 })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const status = err instanceof RunConflictError ? 409 : message.includes('not found') ? 404 : 500
          return Response.json({ error: message }, { status })
        }
      },
      DELETE: async ({ params }) => {
        const { activeRun } = await getTaskOp(params.taskId)
        if (!activeRun) return Response.json({ error: 'No active run.' }, { status: 409 })
        return Response.json(cancelRun(activeRun.id))
      },
    },
  },
})
