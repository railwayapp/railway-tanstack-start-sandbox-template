import { createMiddleware } from '@tanstack/react-start'
import { setResponseHeader, setResponseStatus } from '@tanstack/react-start/server'
import { isAuthenticated } from './auth.server'

// Function middleware on every server function that touches tracker data.
// SSR loaders and browser RPC calls both pass through it.
export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  if (!(await isAuthenticated())) {
    setResponseStatus(401)
    throw new Error('Unauthorized: sign in first.')
  }
  // Signed-in responses are private to this visitor.
  setResponseHeader('Cache-Control', 'private, no-store')
  return next()
})
