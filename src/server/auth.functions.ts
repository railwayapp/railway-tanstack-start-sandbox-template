import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { authDisabled, isAuthenticated, passwordMatches, useAuthSession } from './auth.server'

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return {
    signedIn: await isAuthenticated(),
    passwordConfigured: !!process.env.DISPATCH_PASSWORD,
    authDisabled: authDisabled(),
  }
})

export const signIn = createServerFn({ method: 'POST' })
  .validator(z.object({ password: z.string().min(1).max(500) }))
  .handler(async ({ data }) => {
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
  const session = await useAuthSession()
  await session.clear()
  return { ok: true }
})
