// Query options shared by route loaders (which prefetch them during SSR) and
// components (which read them with useSuspenseQuery).
import { queryOptions } from '@tanstack/react-query'
import {
  getRunConfig,
  getRunReadiness,
  getTask,
  listAllTasks,
  listProjects,
  listTasks,
  listWebhooks,
} from '~/server/tracker.functions'

/** Poll while an agent is working; stop when nothing is running. */
const whileRunning = (running: boolean, ms: number) => (running ? ms : false)

export const projectsQuery = queryOptions({
  queryKey: ['projects'],
  queryFn: () => listProjects(),
})

export const allTasksQuery = queryOptions({
  queryKey: ['all-tasks'],
  queryFn: () => listAllTasks(),
  refetchInterval: (q) => whileRunning(!!q.state.data?.runningIds.length, 1500),
})

export const tasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ['tasks', projectId],
    queryFn: () => listTasks({ data: { projectId } }),
    refetchInterval: (q) => whileRunning(!!q.state.data?.runningIds.length, 1500),
  })

export const taskQuery = (taskId: string) =>
  queryOptions({
    queryKey: ['task', taskId],
    queryFn: () => getTask({ data: { taskId } }),
    // The activity feed updates while a sandbox run is active.
    refetchInterval: (q) => whileRunning(!!q.state.data?.activeRun, 1200),
  })

export const webhooksQuery = queryOptions({
  queryKey: ['webhooks'],
  queryFn: () => listWebhooks(),
})

export const runReadinessQuery = queryOptions({
  queryKey: ['run-readiness'],
  queryFn: () => getRunReadiness(),
  staleTime: 30_000,
})

export const runConfigQuery = queryOptions({
  queryKey: ['run-config'],
  queryFn: () => getRunConfig(),
  staleTime: 30_000,
})
