// Server-only: the one implementation of tracker operations, shared by the
// server functions (tracker.functions.ts) and the REST API (src/routes/api.v1.*).
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { activities, db, projects, runs, tasks, webhooks } from './db.server'
import type { TaskPriority, TaskStatus } from './schema'
import type { WebhookTopic } from '~/lib/topics'
import { seedDefaults } from './seed.server'

export class NotFoundError extends Error {}

// Runs whose server stopped mid-run are marked failed whenever the board is
// read. Imported lazily because runs.server imports this module.
async function sweepStaleRuns() {
  const { failStaleRuns } = await import('./runs.server')
  await failStaleRuns()
}

// ————— webhooks —————

export async function emitWebhook(topic: WebhookTopic, data: Record<string, unknown>) {
  try {
    const hooks = await db.select().from(webhooks).where(eq(webhooks.enabled, true))
    const body = JSON.stringify({ topic, timestamp: new Date().toISOString(), data })
    for (const hook of hooks) {
      if (!hook.topics.includes(topic)) continue
      void fetch(hook.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dispatch-topic': topic },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {})
    }
  } catch {
    // webhook delivery must never break the operation that triggered it
  }
}

export async function listWebhooksOp() {
  return db.select().from(webhooks).orderBy(webhooks.createdAt)
}

export async function createWebhookOp(input: { url: string; topics: string[] }) {
  const [hook] = await db.insert(webhooks).values(input).returning()
  return hook
}

export async function updateWebhookOp(input: { id: string; enabled?: boolean; topics?: string[] }) {
  const { id, ...patch } = input
  const [hook] = await db.update(webhooks).set(patch).where(eq(webhooks.id, id)).returning()
  if (!hook) throw new NotFoundError('webhook not found')
  return hook
}

export async function deleteWebhookOp(id: string) {
  await db.delete(webhooks).where(eq(webhooks.id, id))
  return { ok: true }
}

export async function listProjectsOp() {
  return db.select().from(projects).orderBy(projects.createdAt)
}

export async function createProjectOp(name: string) {
  const existing = await db.select({ key: projects.key }).from(projects)
  const taken = new Set(existing.map((p) => p.key))
  const base =
    name
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'PRJ'
  let key = base
  let i = 2
  while (taken.has(key)) key = `${base.slice(0, 2)}${i++}`
  const palette = ['#d3481b', '#5b7d9e', '#4a7d4f', '#c08a1f', '#7d5ba6']
  const [project] = await db
    .insert(projects)
    .values({ name, key, color: palette[existing.length % palette.length] })
    .returning()
  void emitWebhook('project.created', { project })
  return project
}

export async function updateProjectOp(input: { id: string; name?: string; color?: string }) {
  const { id, ...patch } = input
  const [project] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning()
  if (!project) throw new NotFoundError('project not found')
  void emitWebhook('project.updated', { project })
  return project
}

export async function deleteProjectOp(id: string) {
  const [project] = await db.delete(projects).where(eq(projects.id, id)).returning()
  if (!project) throw new NotFoundError('project not found')
  void emitWebhook('project.deleted', { project })
  return { ok: true }
}

function firstLine(s: unknown): string {
  if (typeof s !== 'string') return ''
  const line = s.split('\n').find((x) => x.trim())
  return (line ?? '').trim().slice(0, 140)
}

function lastNonEmptyLine(s: unknown): string {
  if (typeof s !== 'string') return ''
  const lines = s.split('\n').filter((x) => x.trim())
  return (lines[lines.length - 1] ?? '').trim().slice(0, 140)
}

function summarizeActivity(kind: string, p: Record<string, unknown>): string {
  switch (kind) {
    case 'tool_call':
      return p.running === true
        ? `… ${firstLine(p.call) || 'running'}`
        : `$ ${firstLine(p.call)}${p.output ? ` → ${lastNonEmptyLine(p.output)}` : ''}`
    case 'files_changed':
      return Array.isArray(p.files) ? `changed ${p.files.length} file${p.files.length === 1 ? '' : 's'}` : ''
    case 'agent_text':
      return firstLine(p.text)
    case 'run_started':
      return '▸ sandbox started'
    case 'run_finished':
      return `✓ ${firstLine(p.summary) || 'run finished'}`
    case 'run_error':
      return `✗ ${firstLine(p.error) || 'run failed'}`
    case 'status_change':
      return `status → ${p.to}`
    default:
      return ''
  }
}

/** Latest activity per task, condensed to a one-line summary for list rows. */
async function lastActionsFor(taskIds: string[]): Promise<Record<string, string>> {
  if (taskIds.length === 0) return {}
  const rows = await db
    .selectDistinctOn([activities.taskId], {
      taskId: activities.taskId,
      kind: activities.kind,
      payload: activities.payload,
    })
    .from(activities)
    .where(inArray(activities.taskId, taskIds))
    .orderBy(activities.taskId, desc(activities.createdAt))
  const out: Record<string, string> = {}
  for (const row of rows) {
    const line = summarizeActivity(row.kind, row.payload ?? {})
    if (line) out[row.taskId] = line
  }
  return out
}

export async function wipeAllDataOp() {
  await db.delete(activities)
  await db.delete(runs)
  await db.delete(tasks)
  await db.delete(projects)
  await db.delete(webhooks)
  // Restore the Default starter project so the workspace is immediately
  // usable for revalidation after a wipe.
  await seedDefaults(db)
  return { ok: true }
}

export async function listAllTasksOp() {
  await sweepStaleRuns()
  const rows = await db
    .select({
      task: tasks,
      project: { id: projects.id, name: projects.name, key: projects.key, color: projects.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .orderBy(desc(tasks.updatedAt))
  const ids = rows.map((r) => r.task.id)
  const runningIds =
    ids.length === 0
      ? []
      : (
          await db
            .select({ taskId: runs.taskId })
            .from(runs)
            .where(and(eq(runs.status, 'running'), inArray(runs.taskId, ids)))
        ).map((r) => r.taskId)
  const lastActions = await lastActionsFor(ids)
  return { rows, runningIds, lastActions }
}

export async function listTasksOp(projectId: string) {
  await sweepStaleRuns()
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  if (!project) throw new NotFoundError('project not found')
  const rows = await db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(desc(tasks.number))
  const runningIds =
    rows.length === 0
      ? []
      : (
          await db
            .select({ taskId: runs.taskId })
            .from(runs)
            .where(
              and(
                eq(runs.status, 'running'),
                inArray(
                  runs.taskId,
                  rows.map((r) => r.id),
                ),
              ),
            )
        ).map((r) => r.taskId)
  const lastActions = await lastActionsFor(rows.map((r) => r.id))
  return { project, tasks: rows, runningIds, lastActions }
}

export async function getTaskOp(taskId: string) {
  await sweepStaleRuns()
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!task) throw new NotFoundError('task not found')
  const [project] = await db.select().from(projects).where(eq(projects.id, task.projectId))
  const feed = await db
    .select()
    .from(activities)
    .where(eq(activities.taskId, task.id))
    .orderBy(asc(activities.createdAt))
  const [activeRun] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.taskId, task.id), eq(runs.status, 'running')))
    .limit(1)
  const [lastRun] = await db
    .select()
    .from(runs)
    .where(eq(runs.taskId, task.id))
    .orderBy(desc(runs.startedAt))
    .limit(1)
  return { task, project, feed, activeRun: activeRun ?? null, lastRun: lastRun ?? null }
}

export async function createTaskOp(input: {
  projectId: string
  title: string
  priority?: TaskPriority
  description?: string
  status?: TaskStatus
}) {
  const [proj] = await db
    .update(projects)
    .set({ nextNumber: sql`${projects.nextNumber} + 1` })
    .where(eq(projects.id, input.projectId))
    .returning()
  if (!proj) throw new NotFoundError('project not found')
  const [task] = await db
    .insert(tasks)
    .values({
      projectId: input.projectId,
      number: proj.nextNumber - 1,
      title: input.title,
      description: input.description ?? '',
      priority: input.priority ?? 'medium',
      status: input.status ?? 'todo',
    })
    .returning()
  void emitWebhook('task.created', { task })
  return task
}

export async function updateTaskOp(input: {
  taskId: string
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
}) {
  const { taskId, ...patch } = input
  const [before] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!before) throw new NotFoundError('task not found')
  const [task] = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning()
  if (patch.status && patch.status !== before.status) {
    await db.insert(activities).values({
      taskId,
      kind: 'status_change',
      payload: { from: before.status, to: patch.status },
    })
    void emitWebhook('task.status_changed', { task, from: before.status, to: patch.status })
  }
  void emitWebhook('task.updated', { task, changed: Object.keys(patch) })
  return task
}

export async function deleteTaskOp(id: string) {
  const [task] = await db.delete(tasks).where(eq(tasks.id, id)).returning()
  if (!task) throw new NotFoundError('task not found')
  void emitWebhook('task.deleted', { task })
  return { ok: true, projectId: task.projectId }
}

export async function duplicateTaskOp(id: string) {
  const [orig] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!orig) throw new NotFoundError('task not found')
  return createTaskOp({
    projectId: orig.projectId,
    title: `${orig.title} (copy)`,
    description: orig.description,
    priority: orig.priority,
    status: 'todo',
  })
}
