import { useState } from 'react'
import { Link, Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { allTasksQuery, projectsQuery } from '~/lib/queries'
import { createProject, deleteProject, updateProject } from '~/server/tracker.functions'
import { Menu } from '~/components/Menu'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { getAuthState } from '~/server/auth.functions'

export const Route = createFileRoute('/app')({
  // Everything under /app needs the access password.
  beforeLoad: async ({ location }) => {
    const auth = await getAuthState()
    if (!auth.signedIn) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  // Signed-in pages are private to this visitor.
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: ({ context }) => context.queryClient.query(projectsQuery),
  component: AppShell,
})

function AppShell() {
  const { data: projects } = useSuspenseQuery(projectsQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const updateProjectFn = useServerFn(updateProject)
  const deleteProjectFn = useServerFn(deleteProject)

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) => updateProjectFn({ data: input }),
    onSuccess: () => {
      setRenamingId(null)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      ])
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteProjectFn({ data: { id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: allTasksQuery.queryKey }),
      ])
      await navigate({ to: '/app/all' })
    },
  })

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="home-link">
          <span
            className="dot"
            style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent)' }}
          />
          Dispatch
        </Link>
        <span className="label">Projects</span>
        <Link to="/app/all" className="proj-link">
          <GridIcon />
          All Projects
        </Link>
        {projects.map((p) =>
          renamingId === p.id ? (
            <form
              key={p.id}
              className="new-proj"
              onSubmit={(e) => {
                e.preventDefault()
                if (renameValue.trim()) rename.mutate({ id: p.id, name: renameValue.trim() })
              }}
            >
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                onBlur={() => setRenamingId(null)}
              />
            </form>
          ) : (
            <div className="proj-row" key={p.id}>
              <Link to="/app/$projectId" params={{ projectId: p.id }} className="proj-link">
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
                <span className="key">{p.key}</span>
              </Link>
              <Menu
                label={`Actions for ${p.name}`}
                items={[
                  {
                    label: 'Rename…',
                    onSelect: () => {
                      setRenameValue(p.name)
                      setRenamingId(p.id)
                    },
                  },
                  {
                    label: 'Delete project',
                    danger: true,
                    onSelect: () => setDeleting({ id: p.id, name: p.name }),
                  },
                ]}
              />
            </div>
          ),
        )}
        <NewProject />
        <span className="label" style={{ marginTop: 14 }}>
          Workspace
        </span>
        <Link to="/app/webhooks" className="proj-link">
          <HookIcon />
          Webhooks
        </Link>
        <div className="sidebar-bottom">
          <Link to="/app/settings" className="proj-link">
            <GearIcon />
            Settings
          </Link>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <ConfirmDialog
        open={deleting != null}
        title={`Delete "${deleting?.name}"?`}
        body="This permanently removes the project and every task in it."
        confirmLabel="Delete project"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}

function GridIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function HookIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

function NewProject() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const createProjectFn = useServerFn(createProject)

  const create = useMutation({
    mutationFn: (n: string) => createProjectFn({ data: { name: n } }),
    onSuccess: async (project) => {
      setName('')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey })
      navigate({ to: '/app/$projectId', params: { projectId: project.id } })
    },
  })

  if (!open) {
    return (
      <button className="new-proj-btn" onClick={() => setOpen(true)}>
        + New project
      </button>
    )
  }
  return (
    <form
      className="new-proj"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) create.mutate(name.trim())
      }}
    >
      <input
        autoFocus
        type="text"
        placeholder="Project name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => !name.trim() && setOpen(false)}
      />
    </form>
  )
}
