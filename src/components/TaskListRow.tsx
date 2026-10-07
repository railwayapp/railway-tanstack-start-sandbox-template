import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TaskRowMenu } from '@/components/TaskRowMenu'
import type { TaskPriority, TaskStatus } from '@/db/schema'

type RowTask = {
  id: string
  projectId: string
  number: number
  title: string
  status: TaskStatus
  priority: TaskPriority
}

export function TaskListRow({
  task,
  projectKey,
  projectChip,
  running,
  lastAction,
}: {
  task: RowTask
  projectKey: string
  projectChip?: { key: string; color: string }
  running: boolean
  lastAction?: string
}) {
  const queryClient = useQueryClient()
  const assign = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/tasks/${task.id}/run`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.projectId] })
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', task.id] })
    },
  })

  return (
    <Link to="/app/task/$taskId" params={{ taskId: task.id }} className="task-row">
      <span className="status-dot" data-st={task.status} />
      {projectChip && (
        <span
          className="proj-chip"
          style={{
            color: projectChip.color,
            borderColor: `color-mix(in srgb, ${projectChip.color} 45%, var(--line))`,
          }}
        >
          {projectChip.key}
        </span>
      )}
      <span className="tid">
        {projectKey}-{task.number}
      </span>
      <span className="t-col">
        <span className="title">{task.title}</span>
        {lastAction && <span className="last-action mono">{lastAction}</span>}
      </span>
      <button
        className="assign-btn"
        disabled={running || assign.isPending}
        data-running={running || undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          assign.mutate()
        }}
      >
        {running ? (
          <>
            <span className="pulse" /> Agent running
          </>
        ) : assign.isPending ? (
          'Assigning…'
        ) : (
          'Assign Agent'
        )}
      </button>
      <span className="prio" data-p={task.priority}>
        {task.priority}
      </span>
      <TaskRowMenu taskId={task.id} projectId={task.projectId} title={task.title} />
    </Link>
  )
}
