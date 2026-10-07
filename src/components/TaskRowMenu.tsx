import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { allTasksQuery, taskQuery, tasksQuery } from '~/lib/queries'
import { deleteTask, duplicateTask, updateTask } from '~/server/tracker.functions'
import { Menu } from '~/components/Menu'
import { ConfirmDialog } from '~/components/ConfirmDialog'

export function TaskRowMenu({
  taskId,
  projectId,
  title,
}: {
  taskId: string
  projectId: string
  title: string
}) {
  const queryClient = useQueryClient()
  const updateTaskFn = useServerFn(updateTask)
  const duplicateTaskFn = useServerFn(duplicateTask)
  const deleteTaskFn = useServerFn(deleteTask)
  const [confirming, setConfirming] = useState(false)
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tasksQuery(projectId).queryKey }),
      queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: taskQuery(taskId).queryKey }),
    ])

  const duplicate = useMutation({
    mutationFn: () => duplicateTaskFn({ data: { taskId } }),
    onSuccess: refresh,
  })
  const markDone = useMutation({
    mutationFn: () => updateTaskFn({ data: { taskId, status: 'done' } }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: () => deleteTaskFn({ data: { taskId } }), onSuccess: refresh })

  return (
    <>
      <Menu
        label={`Actions for ${title}`}
        items={[
          { label: 'Duplicate', onSelect: () => duplicate.mutate() },
          { label: 'Mark done', onSelect: () => markDone.mutate() },
          {
            label: 'Copy link',
            onSelect: () => {
              void navigator.clipboard?.writeText(`${window.location.origin}/app/task/${taskId}`)
            },
          },
          { label: 'Delete task', danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete "${title}"?`}
        body="This permanently removes the task, its runs, and its activity history."
        confirmLabel="Delete task"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          remove.mutate()
        }}
      />
    </>
  )
}
