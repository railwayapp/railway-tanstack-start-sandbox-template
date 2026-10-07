import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteTask, duplicateTask, updateTask } from '@/lib/tracker'
import { Menu } from '@/components/Menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'

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
  const [confirming, setConfirming] = useState(false)
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
    ])

  const duplicate = useMutation({ mutationFn: () => duplicateTask({ data: { taskId } }), onSuccess: refresh })
  const markDone = useMutation({
    mutationFn: () => updateTask({ data: { taskId, status: 'done' } }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: () => deleteTask({ data: { taskId } }), onSuccess: refresh })

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
