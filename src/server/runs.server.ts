// Server-only: the run engine. A run hands a task to Claude Code running in a
// fresh Railway sandbox (see sandbox.server.ts) and records what the agent does
// as the task's activity feed.
import { RUN_CANCEL_REASON, chat } from '@tanstack/ai'
import type { ChatStream } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { and, eq, lt } from 'drizzle-orm'
import { activities, db, runs, tasks } from './db.server'
import type { ActivityKind, ActivityPayload } from './schema'
import { emitWebhook } from './ops.server'
import { AGENT_MODEL, missingRunConfig, sandboxForRun, sandboxProvider } from './sandbox.server'

type RunChunk = ChatStream extends AsyncIterable<infer C> ? C : never

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
  'Finish with one short plain-text paragraph starting with "SUMMARY:" that says what you did and where any output lives.',
].join('\n')

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
  const feed = new FeedRecorder(task.id, runId)

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
      abortController: abort,
      middleware: [withSandbox(sandbox)],
    })

    for await (const chunk of stream) await feed.handle(chunk)
    await feed.flush()
    // An aborted chat() ends its stream quietly instead of throwing.
    if (abort.signal.aborted) throw new Error('aborted')
    if (feed.error) throw new Error(feed.error)

    const summary = feed.summary()
    await db
      .update(runs)
      .set({ status: 'succeeded', summary, finishedAt: new Date() })
      .where(eq(runs.id, runId))
    await db.update(tasks).set({ status: 'in_review', updatedAt: new Date() }).where(eq(tasks.id, task.id))
    await feed.recordFiles()
    await record(task.id, runId, 'run_finished', { summary })
    await record(task.id, runId, 'status_change', { from: 'in_progress', to: 'in_review' })
    void emitWebhook('run.finished', { taskId: task.id, runId, summary })
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

async function record(taskId: string, runId: string, kind: ActivityKind, payload: ActivityPayload) {
  const [row] = await db.insert(activities).values({ taskId, runId, kind, payload }).returning()
  return row
}

const clip = (s: string, max = 6000) => (s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s)

/** Files the harness itself writes into /workspace to launch Claude Code. */
const isHarnessFile = (path: string) => /\/(\.tanstack-|tanstack-claude-)/.test(path)

/** A one-line description of a Claude Code tool call for the feed. */
function describeToolCall(name: string, input: unknown) {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (typeof args.command === 'string') return args.command
  if (typeof args.file_path === 'string') return `${name} ${args.file_path}`
  if (typeof args.pattern === 'string') return `${name} ${args.pattern}`
  if (typeof args.url === 'string') return `${name} ${args.url}`
  const json = JSON.stringify(args)
  return json === '{}' ? name : `${name} ${json.slice(0, 200)}`
}

/**
 * Turns the AG-UI chunk stream into activity rows: one row per finished
 * message, one per tool call (updated when its result arrives), and the list
 * of files the agent changed.
 */
class FeedRecorder {
  error: string | null = null
  private text = ''
  private allText = ''
  private toolRows = new Map<string, { id: string; name: string }>()
  private files = new Set<string>()

  constructor(
    private taskId: string,
    private runId: string,
  ) {}

  async handle(chunk: RunChunk) {
    switch (chunk.type) {
      case 'TEXT_MESSAGE_CONTENT':
        this.text += chunk.delta
        this.allText += chunk.delta
        break
      case 'TEXT_MESSAGE_END':
        await this.flush()
        break
      case 'TOOL_CALL_START': {
        await this.flush()
        const name = chunk.toolCallName
        const row = await record(this.taskId, this.runId, 'tool_call', {
          tool: name,
          call: name,
          running: true,
        })
        this.toolRows.set(chunk.toolCallId, { id: row.id, name })
        break
      }
      case 'TOOL_CALL_END': {
        const row = this.toolRows.get(chunk.toolCallId)
        if (row)
          await this.updateTool(row.id, {
            tool: row.name,
            call: describeToolCall(row.name, chunk.input),
            running: true,
          })
        break
      }
      case 'TOOL_CALL_RESULT': {
        const row = this.toolRows.get(chunk.toolCallId)
        if (!row) break
        const [current] = await db.select().from(activities).where(eq(activities.id, row.id))
        await this.updateTool(row.id, {
          ...current?.payload,
          output: clip(String(chunk.content ?? '')),
          running: false,
        })
        break
      }
      case 'CUSTOM':
        if (chunk.name === 'sandbox.file') {
          const path = chunk.value.path
          if (path && !isHarnessFile(path)) this.files.add(path)
        }
        break
      case 'RUN_ERROR':
        this.error = chunk.error?.message ?? chunk.message ?? 'The agent run failed.'
        break
    }
  }

  async flush() {
    const text = this.text.trim()
    this.text = ''
    if (text) await record(this.taskId, this.runId, 'agent_text', { text })
  }

  async recordFiles() {
    if (this.files.size > 0) {
      await record(this.taskId, this.runId, 'files_changed', { files: [...this.files].sort() })
    }
  }

  summary() {
    const match = this.allText.match(/SUMMARY:\s*([\s\S]{0,800})/)
    return (match?.[1] ?? this.allText.slice(-400)).trim() || 'Run completed.'
  }

  private async updateTool(id: string, payload: ActivityPayload) {
    await db.update(activities).set({ payload }).where(eq(activities.id, id))
  }
}
