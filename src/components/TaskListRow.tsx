import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { TaskRowMenu } from '~/components/TaskRowMenu'
import { allTasksQuery, taskQuery, tasksQuery } from '~/lib/queries'
import { runTask } from '~/server/tracker.functions'
import type { TaskPriority, TaskStatus } from '~/server/schema'

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
  const runTaskFn = useServerFn(runTask)
  const assign = useMutation({
    mutationFn: () => runTaskFn({ data: { taskId: task.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tasksQuery(task.projectId).queryKey })
      queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey })
      queryClient.invalidateQueries({ queryKey: taskQuery(task.id).queryKey })
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
        {assign.error ? (
          <span className="last-action row-error">{assign.error.message}</span>
        ) : (
          lastAction && <span className="last-action mono">{lastAction}</span>
        )}
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
