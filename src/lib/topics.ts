// Client-safe constants shared by the webhooks UI and the server emitters.

export const WEBHOOK_TOPICS = [
  { id: 'project.created', label: 'Project created' },
  { id: 'project.updated', label: 'Project updated' },
  { id: 'project.deleted', label: 'Project deleted' },
  { id: 'task.created', label: 'Task created' },
  { id: 'task.updated', label: 'Task updated' },
  { id: 'task.status_changed', label: 'Task status changed' },
  { id: 'task.deleted', label: 'Task deleted' },
  { id: 'run.started', label: 'Sandbox run started' },
  { id: 'run.finished', label: 'Sandbox run finished' },
  { id: 'run.failed', label: 'Sandbox run failed' },
] as const

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number]['id']
