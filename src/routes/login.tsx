import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { getAuthState, signIn } from '@/server/auth'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState()
    if (auth.signedIn) throw redirect({ href: safeNext(search.next) })
    return { passwordConfigured: auth.passwordConfigured }
  },
  head: () => ({ meta: [{ title: 'Sign in · Dispatch' }] }),
  component: Login,
})

// Only same-site paths: never redirect to another origin after sign-in.
function safeNext(next: string | undefined) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/app/all'
}

function Login() {
  const { passwordConfigured } = Route.useRouteContext()
  const { next } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => signIn({ data: { password } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      await router.invalidate()
      router.history.push(safeNext(next))
    },
  })

  return (
    <div className="fallback-page">
      <h1>Sign in to Dispatch</h1>
      {passwordConfigured ? (
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (password) login.mutate()
          }}
        >
          <p>
            Enter the access password. It's the <code className="mono">DISPATCH_PASSWORD</code> variable on
            this service in Railway.
          </p>
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            placeholder="Access password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {login.data?.ok === false && <span className="login-error">That password isn't right.</span>}
          <button className="btn primary" disabled={!password || login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <p>
          No access password is set. Add a <code className="mono">DISPATCH_PASSWORD</code> variable to this
          service in Railway, then redeploy.
        </p>
      )}
    </div>
  )
}
