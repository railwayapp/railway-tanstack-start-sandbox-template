// Server-only: a chat middleware that records what the agent does as the
// task's activity feed. It sees every AG-UI chunk the run produces (text, tool
// calls and their results) and every file the agent creates or changes in the
// sandbox, and writes them to Postgres as they happen.
import { defineChatMiddleware } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { eq } from 'drizzle-orm'
import { activities, db } from './db.server'
import type { ActivityKind, ActivityPayload } from './schema'

export async function recordActivity(
  taskId: string,
  runId: string,
  kind: ActivityKind,
  payload: ActivityPayload,
) {
  const [row] = await db.insert(activities).values({ taskId, runId, kind, payload }).returning()
  return row
}

const clip = (s: string, max = 6000) => (s.length > max ? `${s.slice(0, max)}\n…(truncated)` : s)

/** Files the Claude Code harness writes into /workspace to launch the agent. */
const isHarnessFile = (path: string) => /\/(\.tanstack-|tanstack-(claude|output-schema)-)/.test(path)

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
 * The activity feed for one run. Pass `middleware` to `chat()`; after the
 * stream ends, `flush()` writes any trailing text and `files` lists what the
 * agent changed.
 */
export function activityFeed(taskId: string, runId: string) {
  let text = ''
  let lastMessage = ''
  let lastMessageRowId: string | null = null
  let error: string | null = null
  const toolRows = new Map<string, { id: string; name: string; call: string }>()
  const files = new Set<string>()

  const flush = async () => {
    const message = text.trim()
    text = ''
    if (!message) return
    lastMessage = message
    lastMessageRowId = (await recordActivity(taskId, runId, 'agent_text', { text: message })).id
  }

  const updateTool = (id: string, payload: ActivityPayload) =>
    db.update(activities).set({ payload }).where(eq(activities.id, id))

  const onChunk = async (chunk: StreamChunk) => {
    switch (chunk.type) {
      case 'TEXT_MESSAGE_CONTENT':
        text += chunk.delta
        break
      case 'TEXT_MESSAGE_END':
        await flush()
        break
      case 'TOOL_CALL_START': {
        await flush()
        const name = chunk.toolCallName
        const row = await recordActivity(taskId, runId, 'tool_call', {
          tool: name,
          call: name,
          running: true,
        })
        toolRows.set(chunk.toolCallId, { id: row.id, name, call: name })
        break
      }
      case 'TOOL_CALL_END': {
        const row = toolRows.get(chunk.toolCallId)
        if (!row) break
        row.call = describeToolCall(row.name, chunk.input)
        await updateTool(row.id, { tool: row.name, call: row.call, running: true })
        break
      }
      case 'TOOL_CALL_RESULT': {
        const row = toolRows.get(chunk.toolCallId)
        if (!row) break
        await updateTool(row.id, {
          tool: row.name,
          call: row.call,
          output: clip(String(chunk.content ?? '')),
          running: false,
        })
        break
      }
      case 'CUSTOM':
        // Claude Code's last message carries the typed report as raw JSON.
        // The report is shown on its own, so drop that message from the feed.
        if (chunk.name === 'structured-output.complete' && lastMessageRowId) {
          const raw = (chunk.value as { raw?: string } | undefined)?.raw?.trim()
          if (raw && raw === lastMessage) {
            await db.delete(activities).where(eq(activities.id, lastMessageRowId))
            lastMessage = ''
          }
        }
        break
      case 'RUN_ERROR':
        // A missing structured result isn't fatal: the run falls back to the
        // agent's last message for its summary.
        if (chunk.error?.code !== 'structured-output-missing-result') {
          error = chunk.error?.message ?? chunk.message ?? 'The agent run failed.'
        }
        break
    }
  }

  return {
    middleware: defineChatMiddleware({
      name: 'dispatch-activity-feed',
      onChunk: (_ctx, chunk) => onChunk(chunk),
      // Run-scoped sandbox file hooks (see TanStack AI's sandbox observability docs).
      sandbox: {
        onFileCreate: (_ctx, event) => {
          if (!isHarnessFile(event.path)) files.add(event.path)
        },
        onFileChange: (_ctx, event) => {
          if (!isHarnessFile(event.path)) files.add(event.path)
        },
      },
    }),
    flush,
    /** The run's error, if the agent reported one. */
    error: () => error,
    /** The agent's last message, the summary fallback when there's no structured result. */
    lastMessage: () => lastMessage,
    /** Files the agent created or changed, sorted. */
    files: () => [...files].sort(),
  }
}
