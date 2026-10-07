import { useState } from 'react'
import { createFileRoute, redirect, useHydrated, useRouter } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getAuthState, signIn } from '~/server/auth.functions'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    const auth = await getAuthState()
    if (auth.signedIn) throw redirect({ href: safeRedirect(search.redirect) })
    return { passwordConfigured: auth.passwordConfigured }
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'Sign in · Dispatch' }] }),
  component: Login,
})

// Only same-site paths: never redirect to another origin after sign-in.
function safeRedirect(to: string | undefined) {
  return to?.startsWith('/') && !to.startsWith('//') ? to : '/app/all'
}

function Login() {
  const { passwordConfigured } = Route.useRouteContext()
  const search = Route.useSearch()
  const router = useRouter()
  const hydrated = useHydrated()
  const signInFn = useServerFn(signIn)
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => signInFn({ data: { password } }),
    onSuccess: async (result) => {
      if (!result.ok) return
      await router.invalidate()
      router.history.push(safeRedirect(search.redirect))
    },
  })

  return (
    <div className="fallback-page">
      <h1>Sign in to Dispatch</h1>
      {passwordConfigured ? (
        <form
          method="post"
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (password) login.mutate()
          }}
        >
          {/* Disabled until hydrated, so a click before JS loads can't post the form. */}
          <fieldset disabled={!hydrated || login.isPending}>
            <p>
              Enter the access password. It's the <code className="mono">DISPATCH_PASSWORD</code> variable on
              this service in Railway.
            </p>
            <input
              autoFocus
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Access password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {login.data?.ok === false && <span className="login-error">That password isn't right.</span>}
            <button className="btn primary" disabled={!password}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </fieldset>
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
