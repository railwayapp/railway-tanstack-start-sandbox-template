import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { runnerStatusQuery, wipeAllData } from '@/lib/tracker'
import { signOut } from '@/server/auth'

export const Route = createFileRoute('/app/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runnerStatusQuery),
  component: SettingsPage,
})

// Credentials live in Railway service variables, never in the app's database.
const RUN_SETTINGS = [
  { name: 'ANTHROPIC_API_KEY', hint: 'Claude Code runs on this key inside each sandbox.' },
  { name: 'RAILWAY_API_TOKEN', hint: 'Creates the sandboxes. An account or workspace token.' },
  { name: 'RAILWAY_ENVIRONMENT_ID', hint: 'Where sandboxes are created. Railway sets it automatically.' },
]

function SettingsPage() {
  const { data: runner } = useSuspenseQuery(runnerStatusQuery)
  const router = useRouter()
  const logout = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => router.navigate({ to: '/login' }),
  })

  return (
    <div className="task-page">
      <h1 className="page-title">Settings</h1>
      <p className="page-lede">
        Runs use the service variables below. Set them on this service in Railway, and the app picks them up
        on the next deploy. Values are never shown here.
      </p>
      <div className="settings-list">
        {RUN_SETTINGS.map((s) => {
          const missing = runner.missing.some((m) => m.startsWith(s.name))
          return (
            <div className="setting-row" key={s.name}>
              <div className="setting-info">
                <label className="mono">{s.name}</label>
                <span className="setting-hint">{s.hint}</span>
              </div>
              <span className="setting-badge" data-missing={missing || undefined}>
                {missing ? 'not set' : 'set'}
              </span>
            </div>
          )
        })}
        <div className="setting-row">
          <div className="setting-info">
            <label className="mono">DISPATCH_MODEL</label>
            <span className="setting-hint">Optional. The model Claude Code uses.</span>
          </div>
          <span className="setting-badge mono">{runner.model}</span>
        </div>
      </div>
      <div className="settings-actions">
        <button className="btn" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </button>
      </div>

      <DangerZone />
    </div>
  )
}

const WIPE_PHRASE = 'delete all data'

function DangerZone() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [wiped, setWiped] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const wipe = useMutation({
    mutationFn: () => wipeAllData({ data: { confirmation: WIPE_PHRASE } }),
    onSuccess: () => {
      setOpen(false)
      setPhrase('')
      setWiped(true)
      queryClient.invalidateQueries()
    },
  })

  return (
    <div className="danger-zone">
      <h2>Danger zone</h2>
      <div className="danger-row">
        <div>
          <strong>Delete all data</strong>
          <p>
            Permanently removes every project, task, run, activity, and webhook destination, then restores the
            Default starter project.
          </p>
        </div>
        <button
          className="btn danger"
          onClick={() => {
            setPhrase('')
            setOpen(true)
          }}
        >
          Delete All Data
        </button>
      </div>
      {wiped && <span className="saved-note">All data deleted.</span>}
      {open &&
        createPortal(
          <div className="dlg-overlay" onClick={() => setOpen(false)}>
            <div
              className="dlg"
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete all data"
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Delete all data?</h3>
              <p>
                This wipes every project, task, run, activity, and webhook, then restores the Default starter
                project. There is no undo. Type <code className="mono">{WIPE_PHRASE}</code> to confirm.
              </p>
              <input
                autoFocus
                type="text"
                className="wipe-input mono"
                placeholder={WIPE_PHRASE}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
              <div className="dlg-actions">
                <button className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn danger-solid"
                  disabled={phrase.trim() !== WIPE_PHRASE || wipe.isPending}
                  onClick={() => wipe.mutate()}
                >
                  {wipe.isPending ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
