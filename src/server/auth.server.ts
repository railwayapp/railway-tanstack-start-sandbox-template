// Server-only: the access password gate. Dispatch has one shared password,
// DISPATCH_PASSWORD (the template generates it). The browser signs in once and
// keeps an encrypted session cookie; REST API clients send the same password
// as a bearer token.
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

function sessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  // The dev default is public, so a production cookie sealed with it could be
  // forged. Fail loudly instead.
  if (isProduction) throw new Error('SESSION_SECRET must be set to at least 32 characters.')
  return DEV_SESSION_SECRET
}

export function useAuthSession() {
  const password = sessionSecret()
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

/** Whether the browser's session cookie is signed in. */
export async function isAuthenticated() {
  if (authDisabled()) return true
  const session = await useAuthSession()
  return session.data.signedIn === true
}

/**
 * Whether an API request carries the access password as a bearer token. The
 * REST API accepts only this, not the session cookie, so a cross-site form
 * can't make writes with a signed-in visitor's cookie.
 */
export function hasApiToken() {
  if (authDisabled()) return true
  const header = getRequestHeader('authorization')
  return !!header?.startsWith('Bearer ') && passwordMatches(header.slice(7))
}
