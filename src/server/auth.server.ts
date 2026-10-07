// Server-only: the access password gate. Dispatch has one shared password,
// DISPATCH_PASSWORD (the template generates it). The browser signs in once and
// keeps an encrypted session cookie; API clients send the same password as a
// bearer token.
import { createHash, timingSafeEqual } from 'node:crypto'
import { getRequestHeader, useSession } from '@tanstack/react-start/server'

const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-0123456789'
const isProduction = process.env.NODE_ENV === 'production'

type AuthSession = { signedIn?: boolean }

/** True when no password is configured outside production: local dev runs open. */
export function authDisabled() {
  return !process.env.DISPATCH_PASSWORD && !isProduction
}

export function passwordMatches(candidate: string) {
  const password = process.env.DISPATCH_PASSWORD
  if (!password) return false
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(candidate).digest()
  const b = createHash('sha256').update(password).digest()
  return timingSafeEqual(a, b)
}

export function useAuthSession() {
  const password = process.env.SESSION_SECRET ?? DEV_SESSION_SECRET
  if (password === DEV_SESSION_SECRET && isProduction) {
    console.warn('SESSION_SECRET is not set; using an insecure default.')
  }
  return useSession<AuthSession>({
    name: 'dispatch-session',
    password,
    cookie: {
      secure: isProduction,
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  })
}

/** Whether the current request is signed in, by session cookie or bearer token. */
export async function isAuthenticated() {
  if (authDisabled()) return true
  const header = getRequestHeader('authorization')
  if (header?.startsWith('Bearer ') && passwordMatches(header.slice(7))) return true
  const session = await useAuthSession()
  return session.data.signedIn === true
}
