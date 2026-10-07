// Server-only: restores the Default starter project after "Delete all data".
// Fresh databases are seeded by scripts/migrate.mjs from the same task list.
import { projects, tasks } from '@/db/schema'
import type { TaskPriority } from '@/db/schema'
import type { db as Db } from '@/db'
import seedTasks from './seed-tasks.json'

export async function seedDefaults(db: typeof Db) {
  const [project] = await db
    .insert(projects)
    .values({ name: 'Default', key: 'DEF', color: '#d3481b', nextNumber: seedTasks.length + 1 })
    .returning()
  await db.insert(tasks).values(
    seedTasks.map((t, i) => ({
      projectId: project.id,
      number: i + 1,
      title: t.title,
      description: t.description,
      status: 'todo' as const,
      priority: t.priority as TaskPriority,
    })),
  )
  return project
}
