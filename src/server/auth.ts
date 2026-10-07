import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'
import { z } from 'zod'

// Function middleware for every server function that touches tracker data.
// SSR loaders and browser RPC calls both pass through it.
export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { isAuthenticated } = await import('./auth.server')
  if (!(await isAuthenticated())) {
    setResponseStatus(401)
    throw new Error('Unauthorized: sign in first.')
  }
  return next()
})

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  const { authDisabled, isAuthenticated } = await import('./auth.server')
  return {
    signedIn: await isAuthenticated(),
    passwordConfigured: !!process.env.DISPATCH_PASSWORD,
    authDisabled: authDisabled(),
  }
})

export const signIn = createServerFn({ method: 'POST' })
  .validator(z.object({ password: z.string().min(1).max(500) }))
  .handler(async ({ data }) => {
    const { passwordMatches, useAuthSession } = await import('./auth.server')
    if (!passwordMatches(data.password)) {
      // A little friction against guessing.
      await new Promise((r) => setTimeout(r, 400))
      return { ok: false as const }
    }
    const session = await useAuthSession()
    await session.update({ signedIn: true })
    return { ok: true as const }
  })

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const { useAuthSession } = await import('./auth.server')
  const session = await useAuthSession()
  await session.clear()
  return { ok: true }
})
