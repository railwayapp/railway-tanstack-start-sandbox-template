import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { allTasksQuery, taskQuery, tasksQuery } from '~/lib/queries'
import { NotFound } from '~/components/NotFound'
import { cancelRun, deleteTask, duplicateTask, runTask, updateTask } from '~/server/tracker.functions'
import { Menu } from '~/components/Menu'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import type { ActivityPayload, TaskPriority, TaskStatus } from '~/server/schema'

export const Route = createFileRoute('/app/task/$taskId')({
  // A missing task makes the server function throw notFound().
  loader: async ({ context, params }) => {
    const { task } = await context.queryClient.query(taskQuery(params.taskId))
    return { title: task.title }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? 'Task'} · Dispatch` }] }),
  // Rendered inside the /app layout, so the sidebar stays.
  notFoundComponent: () => <NotFound />,
  component: TaskDetail,
})

function TaskDetail() {
  const { taskId } = Route.useParams()
  const { data } = useSuspenseQuery(taskQuery(taskId))
  const { task, project, feed, activeRun, lastRun } = data
  const queryClient = useQueryClient()
  const updateTaskFn = useServerFn(updateTask)
  const runTaskFn = useServerFn(runTask)
  const cancelRunFn = useServerFn(cancelRun)
  const duplicateTaskFn = useServerFn(duplicateTask)
  const deleteTaskFn = useServerFn(deleteTask)
  const running = activeRun != null

  // The final agent message of the last successful run — the "closed loop".
  const agentResult =
    !running && lastRun?.status === 'succeeded'
      ? (
          (
            feed.filter((a) => a.runId === lastRun.id && a.kind === 'agent_text').at(-1)?.payload as
              | { text?: string }
              | undefined
          )?.text ??
          lastRun.summary ??
          ''
        ).replace(/^SUMMARY:\s*/i, '') || null
      : null

  // Polling while a run is active is handled declaratively by taskQuery's
  // refetchInterval (see src/lib/queries.ts).

  const [desc, setDesc] = useState(task.description)
  useEffect(() => setDesc(task.description), [task.id, task.description])

  const patch = useMutation({
    mutationFn: (
      data: Partial<{ status: TaskStatus; priority: TaskPriority; description: string; title: string }>,
    ) => updateTaskFn({ data: { taskId, ...data } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQuery(taskId).queryKey }),
        queryClient.invalidateQueries({ queryKey: tasksQuery(task.projectId).queryKey }),
        queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      ]),
  })

  const refreshTask = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskQuery(taskId).queryKey }),
      queryClient.invalidateQueries({ queryKey: tasksQuery(task.projectId).queryKey }),
      queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
    ])
  const run = useMutation({ mutationFn: () => runTaskFn({ data: { taskId } }), onSuccess: refreshTask })
  const cancel = useMutation({
    mutationFn: (runId: string) => cancelRunFn({ data: { runId } }),
    onSuccess: refreshTask,
  })

  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(task.title)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const duplicate = useMutation({
    mutationFn: () => duplicateTaskFn({ data: { taskId } }),
    onSuccess: async (copy) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tasksQuery(task.projectId).queryKey }),
        queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      ])
      navigate({ to: '/app/task/$taskId', params: { taskId: copy.id } })
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteTaskFn({ data: { taskId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tasksQuery(task.projectId).queryKey }),
        queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      ])
      navigate({ to: '/app/$projectId', params: { projectId: task.projectId } })
    },
  })

  return (
    <div className="task-page">
      <Link to="/app/$projectId" params={{ projectId: task.projectId }} className="back">
        ← {project.name}
      </Link>

      <div className="task-head">
        {renaming ? (
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (renameValue.trim()) {
                patch.mutate({ title: renameValue.trim() } as never)
                setRenaming(false)
              }
            }}
          >
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
              onBlur={() => setRenaming(false)}
            />
          </form>
        ) : (
          <h1>{task.title}</h1>
        )}
        <button className="btn primary" onClick={() => run.mutate()} disabled={running || run.isPending}>
          {running ? 'Sandbox running…' : 'Run in Agent Sandbox'}
        </button>
        {activeRun && (
          <button className="btn" onClick={() => cancel.mutate(activeRun.id)} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
        <Menu
          label="Task actions"
          items={[
            {
              label: 'Rename…',
              onSelect: () => {
                setRenameValue(task.title)
                setRenaming(true)
              },
            },
            { label: 'Duplicate', onSelect: () => duplicate.mutate() },
            {
              label: 'Copy link',
              onSelect: () => {
                void navigator.clipboard?.writeText(window.location.href)
              },
            },
            {
              label: 'Delete task',
              danger: true,
              onSelect: () => setConfirmingDelete(true),
            },
          ]}
        />
        <ConfirmDialog
          open={confirmingDelete}
          title={`Delete "${task.title}"?`}
          body="This permanently removes the task, its runs, and its activity history."
          confirmLabel="Delete task"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            remove.mutate()
          }}
        />
      </div>

      <div className="task-meta">
        <span className="tid">
          {project.key}-{task.number}
        </span>
        <select value={task.status} onChange={(e) => patch.mutate({ status: e.target.value as TaskStatus })}>
          <option value="backlog">Backlog</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
        </select>
        <select
          value={task.priority}
          onChange={(e) => patch.mutate({ priority: e.target.value as TaskPriority })}
        >
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {run.error && <div className="run-error">{run.error.message}</div>}

      {activeRun && (
        <div className="run-banner">
          <span className="pulse" />
          Claude Code working in sandbox{' '}
          <span className="mono">{String(activeRun.sandboxId ?? '').slice(0, 8) || 'booting…'}</span> ·
          started {new Date(activeRun.startedAt).toLocaleTimeString()}
        </div>
      )}

      <textarea
        className="task-desc"
        placeholder="Describe the work. The sandbox agent gets this verbatim."
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== task.description && patch.mutate({ description: desc })}
      />

      {agentResult && (
        <div className="results-card">
          <h2>
            <CheckIcon /> Agent Results
          </h2>
          <div className="results-body">{agentResult}</div>
          {lastRun?.finishedAt && (
            <div className="results-meta mono">
              sandbox {String(lastRun.sandboxId ?? '').slice(0, 8)} · finished{' '}
              {new Date(lastRun.finishedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      <div className="feed">
        <h2>
          Activity
          {running && (
            <span className="chip-running">
              <span className="pulse" /> live
            </span>
          )}
        </h2>
        {feed.length === 0 && (
          <div className="empty">Nothing yet — run the task to see a sandbox work it.</div>
        )}
        {feed.map((a) => (
          <FeedItem key={a.id} a={a} />
        ))}
        {running && !feedIsStreaming(feed) && (
          <div className="feed-item">
            <div className="sys thinking">
              <span className="pulse-inline" /> agent is thinking…
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function feedIsStreaming(feed: Array<{ kind: string; payload: ActivityPayload }>) {
  const last = feed[feed.length - 1]
  return last?.kind === 'tool_call' && last.payload.running === true
}

function FeedItem({
  a,
}: {
  a: { id: string; kind: string; payload: ActivityPayload; createdAt: string | Date }
}) {
  const p = a.payload
  const str = (v: unknown) => (v == null ? '' : String(v))
  const when = new Date(a.createdAt).toLocaleTimeString()
  return (
    <div className="feed-item">
      {a.kind === 'run_started' && (
        <div className="sys">
          <strong>Sandbox started</strong>{' '}
          {p.sandboxId && <span className="mono">({str(p.sandboxId).slice(0, 8)})</span>}{' '}
          <span className="when">{when}</span>
        </div>
      )}
      {a.kind === 'run_finished' && (
        <div className="sys">
          <strong>Run finished</strong> <span className="when">{when}</span>
        </div>
      )}
      {a.kind === 'run_error' && (
        <div className="sys" style={{ color: 'var(--accent)' }}>
          <strong>Run failed</strong>: {str(p.error)} <span className="when">{when}</span>
        </div>
      )}
      {a.kind === 'status_change' && (
        <div className="sys">
          Status <strong>{str(p.from)}</strong> → <strong>{str(p.to)}</strong>{' '}
          <span className="when">{when}</span>
        </div>
      )}
      {a.kind === 'agent_text' && <div className="feed-text">{str(p.text)}</div>}
      {a.kind === 'tool_call' && (
        <div className="term">
          <div className="cmd">
            <span className="tool-name">{str(p.tool)}</span> {str(p.call) !== str(p.tool) && str(p.call)}
          </div>
          {p.output ? <div className="out">{str(p.output)}</div> : null}
          {p.running === true && (
            <div className="out running-line">
              <span className="pulse-inline" /> running…
            </div>
          )}
        </div>
      )}
      {a.kind === 'files_changed' && Array.isArray(p.files) && (
        <div className="sys">
          <strong>Files changed</strong>{' '}
          {p.files.map((f) => (
            <span key={str(f)} className="mono file-chip">
              {str(f).replace(/^\/workspace\//, '')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
