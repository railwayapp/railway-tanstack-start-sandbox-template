// Server-only: the run engine. A run hands a task to Claude Code running in a
// fresh Railway sandbox (see sandbox.server.ts) and records what the agent does
// as the task's activity feed.
import { RUN_CANCEL_REASON, chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { and, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { activityFeed, recordActivity as record } from './activity-feed.server'
import { db, runs, tasks } from './db.server'
import { emitWebhook } from './ops.server'
import { AGENT_MODEL, missingRunConfig, sandboxForRun, sandboxProvider } from './sandbox.server'

const HEARTBEAT_MS = 10_000
const STALE_AFTER_MS = 60_000
const RUN_TIMEOUT_MS = 15 * 60_000
// Abort reasons. RUN_CANCEL_REASON is TanStack AI's marker for an explicit
// cancel; anything else is a failure.
const TIMEOUT_REASON = 'dispatch:timeout'
const SHUTDOWN_REASON = 'dispatch:shutdown'

const SYSTEM_PROMPT = [
  'You are the Dispatch task agent. You work inside a fresh, disposable Railway sandbox.',
  'Your working directory is /workspace; keep files you create there.',
  'Do the task, check that it worked, and stop. Never ask questions: decide and act.',
].join('\n')

// What every run reports back, as a typed object rather than text to parse.
// Claude Code returns it in the same turn (`chat({ outputSchema })`).
const RunReport = z.object({
  summary: z.string().describe('One short paragraph: what you did and whether it worked.'),
  outputs: z
    .array(z.string())
    .describe('Files you created or changed, as /workspace paths, plus any URLs. Empty if none.'),
})

/** Runs this server process is driving, so they can be cancelled. */
const activeRuns = new Map<string, { controller: AbortController; done: Promise<void> }>()

// On a redeploy Railway stops the old deployment with SIGTERM. Abort its runs
// so withSandbox destroys their sandboxes instead of leaving agents working,
// give them a few seconds to finish, then exit. (A SIGTERM listener replaces
// Node's default exit, so the exit has to be explicit.)
process.once('SIGTERM', async () => {
  const runs = [...activeRuns.values()]
  for (const run of runs) run.controller.abort(SHUTDOWN_REASON)
  await Promise.race([
    Promise.allSettled(runs.map((run) => run.done)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  process.exit(0)
})

export class RunConflictError extends Error {}

export async function startRun(taskId: string) {
  const missing = missingRunConfig()
  if (missing.length > 0) {
    throw new RunConflictError(`Runs aren't configured. Set ${missing.join(', ')}.`)
  }
  await failStaleRuns()
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!task) throw new Error('task not found')
  if (task.status === 'in_progress') throw new RunConflictError('This task is already running.')

  const [run] = await db.insert(runs).values({ taskId }).returning()
  await db.update(tasks).set({ status: 'in_progress', updatedAt: new Date() }).where(eq(tasks.id, taskId))
  await record(taskId, run.id, 'status_change', { from: task.status, to: 'in_progress' })

  // The run continues after this request returns. The UI follows it through
  // the activity feed.
  const controller = new AbortController()
  const done = driveRun(run.id, task, controller).catch((err) => console.error(`[run ${run.id}]`, err))
  activeRuns.set(run.id, { controller, done })
  return { runId: run.id }
}

export function cancelRun(runId: string) {
  const run = activeRuns.get(runId)
  run?.controller.abort(RUN_CANCEL_REASON)
  return { cancelled: !!run }
}

/**
 * Marks runs whose server stopped driving them (a crash, or a redeploy that
 * didn't finish cleanly) as failed, puts their tasks back in To do, and
 * destroys their sandboxes so the agent stops working.
 */
export async function failStaleRuns() {
  const stale = await db
    .update(runs)
    .set({ status: 'failed', summary: 'The server running this task stopped.', finishedAt: new Date() })
    .where(and(eq(runs.status, 'running'), lt(runs.heartbeatAt, new Date(Date.now() - STALE_AFTER_MS))))
    .returning()
  for (const run of stale) {
    await db.update(tasks).set({ status: 'todo', updatedAt: new Date() }).where(eq(tasks.id, run.taskId))
    await record(run.taskId, run.id, 'run_error', { error: run.summary })
    if (run.sandboxId)
      await sandboxProvider()
        .destroy({ id: run.sandboxId })
        .catch(() => {})
  }
}

async function driveRun(runId: string, task: typeof tasks.$inferSelect, abort: AbortController) {
  const timeout = setTimeout(() => abort.abort(TIMEOUT_REASON), RUN_TIMEOUT_MS)
  const heartbeat = setInterval(() => {
    void db
      .update(runs)
      .set({ heartbeatAt: new Date() })
      .where(eq(runs.id, runId))
      .catch(() => {})
  }, HEARTBEAT_MS)
  const feed = activityFeed(task.id, runId)

  try {
    const sandbox = sandboxForRun(runId, (sandboxId) => {
      void db
        .update(runs)
        .set({ sandboxId })
        .where(eq(runs.id, runId))
        .catch(() => {})
      void record(task.id, runId, 'run_started', { sandboxId })
      void emitWebhook('run.started', { taskId: task.id, runId, sandboxId, title: task.title })
    })

    const stream = chat({
      // Claude Code may run commands without asking (the default in a
      // sandbox). /workspace isn't a git repo, so skip the end-of-run diff.
      adapter: claudeCodeText(AGENT_MODEL(), { permissionMode: 'bypassPermissions', emitDiff: false }),
      // A task is the conversation; each run is one execution of it.
      threadId: task.id,
      runId,
      systemPrompts: [SYSTEM_PROMPT],
      messages: [
        {
          role: 'user',
          content: `Task: ${task.title}\n\n${task.description || '(no further description)'}`,
        },
      ],
      outputSchema: RunReport,
      stream: true,
      abortController: abort,
      middleware: [withSandbox(sandbox), feed.middleware],
    })

    // The feed middleware records each step; this loop only picks out the
    // typed report, which arrives as the final event.
    let report: z.infer<typeof RunReport> | null = null
    for await (const chunk of stream) {
      if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') report = chunk.value.object
    }
    await feed.flush()
    // An aborted chat() ends its stream quietly instead of throwing.
    if (abort.signal.aborted) throw new Error('aborted')
    const error = feed.error()
    if (error) throw new Error(error)

    const summary = report?.summary || feed.lastMessage() || 'Run completed.'
    const outputs = report?.outputs ?? []
    await db
      .update(runs)
      .set({ status: 'succeeded', summary, finishedAt: new Date() })
      .where(eq(runs.id, runId))
    await db.update(tasks).set({ status: 'in_review', updatedAt: new Date() }).where(eq(tasks.id, task.id))
    const files = feed.files()
    if (files.length > 0) await record(task.id, runId, 'files_changed', { files })
    await record(task.id, runId, 'run_finished', { summary, outputs })
    await record(task.id, runId, 'status_change', { from: 'in_progress', to: 'in_review' })
    void emitWebhook('run.finished', { taskId: task.id, runId, summary, outputs })
  } catch (err) {
    await feed.flush().catch(() => {})
    const reason: unknown = abort.signal.aborted ? abort.signal.reason : undefined
    const cancelled = reason === RUN_CANCEL_REASON
    const message =
      reason === RUN_CANCEL_REASON
        ? 'Cancelled.'
        : reason === TIMEOUT_REASON
          ? 'The run hit its 15 minute limit.'
          : reason === SHUTDOWN_REASON
            ? 'The server restarted during the run.'
            : err instanceof Error
              ? err.message
              : String(err)
    await db
      .update(runs)
      .set({ status: cancelled ? 'cancelled' : 'failed', summary: message, finishedAt: new Date() })
      .where(eq(runs.id, runId))
    await db.update(tasks).set({ status: 'todo', updatedAt: new Date() }).where(eq(tasks.id, task.id))
    await record(task.id, runId, 'run_error', { error: message })
    void emitWebhook('run.failed', { taskId: task.id, runId, error: message })
  } finally {
    clearTimeout(timeout)
    clearInterval(heartbeat)
    activeRuns.delete(runId)
  }
}
