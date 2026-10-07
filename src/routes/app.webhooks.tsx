import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createWebhook, deleteWebhook, updateWebhook, webhooksQuery } from '@/lib/tracker'
import { WEBHOOK_TOPICS } from '@/lib/topics'

export const Route = createFileRoute('/app/webhooks')({
  loader: ({ context }) => context.queryClient.ensureQueryData(webhooksQuery),
  component: WebhooksPage,
})

function WebhooksPage() {
  const { data: hooks } = useSuspenseQuery(webhooksQuery)
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] })

  const [url, setUrl] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createWebhook({ data: { url: url.trim(), topics } }),
    onSuccess: () => {
      setUrl('')
      setTopics([])
      setError(null)
      invalidate()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'failed to create webhook'),
  })
  const toggle = useMutation({
    mutationFn: (h: { id: string; enabled: boolean }) =>
      updateWebhook({ data: { id: h.id, enabled: !h.enabled } }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteWebhook({ data: { id } }),
    onSuccess: invalidate,
  })

  const flipTopic = (t: string) =>
    setTopics((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))

  return (
    <div className="task-page">
      <h1 className="page-title">Webhooks</h1>
      <p className="page-lede">
        Dispatch POSTs a JSON payload — <code className="mono">{'{topic, timestamp, data}'}</code> with an{' '}
        <code className="mono">x-dispatch-topic</code> header — to each destination subscribed to a topic.
      </p>

      <form
        className="hook-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim() && topics.length > 0) create.mutate()
        }}
      >
        <input
          type="url"
          placeholder="https://example.com/hooks/dispatch"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="topics">
          {WEBHOOK_TOPICS.map((t) => (
            <label key={t.id} className="topic-check" data-on={topics.includes(t.id) || undefined}>
              <input type="checkbox" checked={topics.includes(t.id)} onChange={() => flipTopic(t.id)} />
              {t.label}
            </label>
          ))}
        </div>
        <div>
          <button
            className="btn primary"
            type="submit"
            disabled={!url.trim() || topics.length === 0 || create.isPending}
          >
            Add destination
          </button>
          {error && <span className="hook-error">{error}</span>}
        </div>
      </form>

      <div className="hook-list">
        {hooks.length === 0 && <div className="empty">No destinations yet.</div>}
        {hooks.map((h) => (
          <div className="hook-row" key={h.id} data-disabled={!h.enabled || undefined}>
            <div className="hook-main">
              <span className="hook-url mono">{h.url}</span>
              <div className="hook-topics">
                {h.topics.map((t) => (
                  <span className="stack-chip" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="hook-actions">
              <button className="btn" onClick={() => toggle.mutate(h)}>
                {h.enabled ? 'Disable' : 'Enable'}
              </button>
              <button className="btn danger" onClick={() => remove.mutate(h.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
