// Server functions for the tracker UI. Each one is a thin wrapper over an
// operation in ops.server.ts, which the REST API (/api/v1) shares. Start
// replaces these handlers with RPC stubs in the client bundle, so the static
// imports of *.server.ts modules below never reach the browser.
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './middleware'
import * as ops from './ops.server'
import { cancelRun as cancelActiveRun, startRun } from './runs.server'
import { AGENT_MODEL, missingRunConfig } from './sandbox.server'

/** Runs an operation, turning a missing record into the route's not-found page. */
async function orNotFound<T>(op: () => Promise<T>) {
  try {
    return await op()
  } catch (error) {
    if (error instanceof ops.NotFoundError) throw notFound()
    throw error
  }
}

const priority = z.enum(['urgent', 'high', 'medium', 'low'])
const status = z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done'])

// ————— projects —————

export const listProjects = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(() => ops.listProjectsOp())

export const createProject = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ name: z.string().min(1).max(60) }))
  .handler(({ data }) => ops.createProjectOp(data.name))

export const updateProject = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(60).optional(),
      color: z.string().max(20).optional(),
    }),
  )
  .handler(({ data }) => orNotFound(() => ops.updateProjectOp(data)))

export const deleteProject = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => orNotFound(() => ops.deleteProjectOp(data.id)))

// ————— tasks —————

export const listAllTasks = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(() => ops.listAllTasksOp())

export const listTasks = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(z.object({ projectId: z.string() }))
  .handler(({ data }) => orNotFound(() => ops.listTasksOp(data.projectId)))

export const getTask = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .validator(z.object({ taskId: z.string() }))
  .handler(({ data }) => orNotFound(() => ops.getTaskOp(data.taskId)))

export const createTask = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(
    z.object({
      projectId: z.string(),
      title: z.string().min(1).max(300),
      priority: priority.default('medium'),
      description: z.string().max(20_000).default(''),
    }),
  )
  .handler(({ data }) => orNotFound(() => ops.createTaskOp(data)))

export const updateTask = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(
    z.object({
      taskId: z.string(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(20_000).optional(),
      status: status.optional(),
      priority: priority.optional(),
    }),
  )
  .handler(({ data }) => orNotFound(() => ops.updateTaskOp(data)))

export const deleteTask = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ taskId: z.string() }))
  .handler(({ data }) => orNotFound(() => ops.deleteTaskOp(data.taskId)))

export const duplicateTask = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ taskId: z.string() }))
  .handler(({ data }) => orNotFound(() => ops.duplicateTaskOp(data.taskId)))

export const wipeAllData = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ confirmation: z.literal('delete all data') }))
  .handler(() => ops.wipeAllDataOp())

// ————— runs —————

export const runTask = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ taskId: z.string() }))
  .handler(({ data }) => orNotFound(() => startRun(data.taskId)))

export const cancelRun = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ runId: z.string() }))
  .handler(({ data }) => cancelActiveRun(data.runId))

/** Public: which run settings are missing, by name only. The landing page uses it. */
export const getRunReadiness = createServerFn({ method: 'GET' }).handler(() => ({
  missing: missingRunConfig().map((m) => m.split(' ')[0]),
}))

/** Signed-in: the run configuration and where to fix it, for Settings. */
export const getRunConfig = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(() => {
    const projectId = process.env.RAILWAY_PROJECT_ID
    return {
      missing: missingRunConfig(),
      model: AGENT_MODEL(),
      environmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
      // Where a project token for this environment is created.
      tokensUrl: projectId ? `https://railway.com/project/${projectId}/settings/tokens` : null,
    }
  })

// ————— webhooks —————

export const listWebhooks = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(() => ops.listWebhooksOp())

export const createWebhook = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ url: z.string().url().max(2000), topics: z.array(z.string()).min(1) }))
  .handler(({ data }) => ops.createWebhookOp(data))

export const updateWebhook = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(
    z.object({ id: z.string(), enabled: z.boolean().optional(), topics: z.array(z.string()).optional() }),
  )
  .handler(({ data }) => orNotFound(() => ops.updateWebhookOp(data)))

export const deleteWebhook = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => ops.deleteWebhookOp(data.id))
