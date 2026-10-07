import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { allTasksQuery, createTask, projectsQuery } from '@/lib/tracker'
import { TaskListRow } from '@/components/TaskListRow'
import type { TaskPriority, TaskStatus } from '@/db/schema'

export const Route = createFileRoute('/app/all')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(allTasksQuery),
      context.queryClient.ensureQueryData(projectsQuery),
    ])
  },
  component: AllProjects,
})

const STATUS_ORDER: { id: TaskStatus; label: string }[] = [
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'todo', label: 'Todo' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'done', label: 'Done' },
]

function AllProjects() {
  const { data } = useSuspenseQuery(allTasksQuery)
  const { rows, runningIds, lastActions } = data
  const { data: projects } = useSuspenseQuery(projectsQuery)
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const targetProject = projectId || projects[0]?.id || ''

  const create = useMutation({
    mutationFn: () => createTask({ data: { projectId: targetProject, title: title.trim(), priority } }),
    onSuccess: () => {
      setTitle('')
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', targetProject] })
    },
  })

  return (
    <div>
      <div className="board-head">
        <h1>
          All Projects{' '}
          <span className="count">
            {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
          </span>
        </h1>
      </div>

      {projects.length > 0 && (
        <form
          className="new-task"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && targetProject) create.mutate()
          }}
        >
          <input
            type="text"
            placeholder="New task — describe work a sandbox could do…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select value={targetProject} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
      )}

      {STATUS_ORDER.map(({ id, label }) => {
        const group = rows.filter((r) => r.task.status === id)
        if (group.length === 0) return null
        return (
          <section className="status-group" key={id}>
            <div className="g-head">
              <span className="status-dot" data-st={id} />
              {label} <span className="n">{group.length}</span>
            </div>
            {group.map(({ task, project }) => (
              <TaskListRow
                key={task.id}
                task={task}
                projectKey={project.key}
                projectChip={{ key: project.key, color: project.color }}
                running={runningIds.includes(task.id)}
                lastAction={lastActions[task.id]}
              />
            ))}
          </section>
        )
      })}
      {rows.length === 0 && (
        <div className="empty" style={{ padding: '4px 28px' }}>
          No tasks anywhere yet.
        </div>
      )}
    </div>
  )
}
