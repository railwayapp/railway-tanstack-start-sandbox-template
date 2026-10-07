import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { tasksQuery } from '~/lib/queries'
import { NotFound } from '~/components/NotFound'
import { createTask } from '~/server/tracker.functions'
import { TaskListRow } from '~/components/TaskListRow'
import type { TaskPriority, TaskStatus } from '~/server/schema'

export const Route = createFileRoute('/app/$projectId')({
  // A missing project makes the server function throw notFound().
  loader: async ({ context, params }) => {
    const { project } = await context.queryClient.query(tasksQuery(params.projectId))
    return { title: project.name }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.title ?? 'Project'} · Dispatch` }] }),
  // Rendered inside the /app layout, so the sidebar stays.
  notFoundComponent: () => <NotFound />,
  component: Board,
})

const STATUS_ORDER: { id: TaskStatus; label: string }[] = [
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'todo', label: 'Todo' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'done', label: 'Done' },
]

function Board() {
  const { projectId } = Route.useParams()
  const { data } = useSuspenseQuery(tasksQuery(projectId))
  const { project, tasks, runningIds, lastActions } = data
  const queryClient = useQueryClient()
  const createTaskFn = useServerFn(createTask)

  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')

  const create = useMutation({
    mutationFn: (data: { title: string; priority: TaskPriority }) =>
      createTaskFn({ data: { projectId, ...data } }),
    onSuccess: () => {
      setTitle('')
      return queryClient.invalidateQueries({ queryKey: tasksQuery(projectId).queryKey })
    },
  })

  return (
    <div>
      <div className="board-head">
        <h1>
          {project.name}{' '}
          <span className="count">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </h1>
      </div>

      <form
        className="new-task"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) create.mutate({ title: title.trim(), priority })
        }}
      >
        <input
          type="text"
          placeholder="New task — describe work a sandbox could do…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className="btn primary" type="submit" disabled={create.isPending || !title.trim()}>
          Add
        </button>
      </form>

      {STATUS_ORDER.map(({ id, label }) => {
        const group = tasks.filter((t) => t.status === id)
        if (group.length === 0) return null
        return (
          <section className="status-group" key={id}>
            <div className="g-head">
              <span className="status-dot" data-st={id} />
              {label} <span className="n">{group.length}</span>
            </div>
            {group.map((t) => (
              <TaskListRow
                key={t.id}
                task={t}
                projectKey={project.key}
                running={runningIds.includes(t.id)}
                lastAction={lastActions[t.id]}
              />
            ))}
          </section>
        )
      })}
      {tasks.length === 0 && (
        <div className="empty" style={{ padding: '4px 28px' }}>
          No tasks yet.
        </div>
      )}
    </div>
  )
}
