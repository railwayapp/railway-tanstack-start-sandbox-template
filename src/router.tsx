import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, retry: 1 } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Required when React Query owns the cache: without this, Router's own
    // 30s preload cache overrides Query's staleTime on link hover.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
