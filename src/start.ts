import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

// Exporting a startInstance replaces Start's default CSRF middleware for
// server functions, so it's registered explicitly.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

// The public REST API (/api/v1) requires the access password, as a bearer
// token or a signed-in browser session. Pages are gated by the /app route's
// beforeLoad, and server functions by the requireAuth middleware.
const apiAuthMiddleware = createMiddleware().server(async ({ next, pathname }) => {
  if (pathname.startsWith('/api/v1')) {
    const { isAuthenticated } = await import('./server/auth.server')
    if (!(await isAuthenticated())) {
      return Response.json(
        { error: 'Unauthorized. Send the access password as `Authorization: Bearer <DISPATCH_PASSWORD>`.' },
        { status: 401, headers: { 'www-authenticate': 'Bearer' } },
      )
    }
  }
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, apiAuthMiddleware],
}))
