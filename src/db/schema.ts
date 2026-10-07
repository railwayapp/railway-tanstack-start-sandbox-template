import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const projects = pgTable('projects', {
  id: id(),
  name: text('name').notNull(),
  key: text('key').notNull(),
  color: text('color').notNull().default('#d3481b'),
  nextNumber: integer('next_number').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export const tasks = pgTable('tasks', {
  id: id(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<TaskStatus>().notNull().default('backlog'),
  priority: text('priority').$type<TaskPriority>().notNull().default('medium'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

export const runs = pgTable('runs', {
  id: id(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  sandboxId: text('sandbox_id'),
  status: text('status').$type<RunStatus>().notNull().default('running'),
  summary: text('summary'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  // Bumped while the server is driving the run. A running run whose heartbeat
  // goes stale belonged to a server that stopped (a redeploy, a crash) and is
  // marked failed instead of spinning forever.
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export type ActivityKind =
  | 'status_change'
  | 'agent_text'
  | 'tool_call'
  | 'files_changed'
  | 'run_started'
  | 'run_finished'
  | 'run_error'

// JSON-safe payload type: TanStack Start serializes loader data, and
// `Record<string, unknown>` isn't provably serializable.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
export type ActivityPayload = { [key: string]: Json }

export const activities = pgTable('activities', {
  id: id(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  runId: text('run_id'),
  kind: text('kind').$type<ActivityKind>().notNull(),
  payload: jsonb('payload').$type<ActivityPayload>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const webhooks = pgTable('webhooks', {
  id: id(),
  url: text('url').notNull(),
  topics: jsonb('topics').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
