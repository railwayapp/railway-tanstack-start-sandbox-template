// Railway's pre-deploy command (see .railway/railway.ts): runs before each new
// deployment receives traffic. Applies pending migrations, then seeds a
// Default project with starter tasks on a fresh database.
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

try {
  process.loadEnvFile?.()
} catch {}

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} })

// On a brand-new project Postgres may still be starting. Railway doesn't retry
// a failed pre-deploy command, so wait for it here.
for (let attempt = 1; ; attempt++) {
  try {
    await sql`select 1`
    break
  } catch (error) {
    if (attempt >= 20) throw error
    console.log(`waiting for Postgres (attempt ${attempt}): ${error.message}`)
    await new Promise((r) => setTimeout(r, 3000))
  }
}

await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
console.log('✓ migrations applied')

const [{ count }] = await sql`select count(*)::int as count from projects`
if (count === 0) {
  const seed = JSON.parse(readFileSync(new URL('../src/lib/seed-tasks.json', import.meta.url), 'utf8'))
  await sql.begin(async (tx) => {
    const [project] = await tx`
      insert into projects (id, name, key, color, next_number)
      values (${crypto.randomUUID()}, 'Default', 'DEF', '#d3481b', ${seed.length + 1})
      returning id`
    let number = 1
    for (const t of seed) {
      await tx`
        insert into tasks (id, project_id, number, title, description, status, priority)
        values (${crypto.randomUUID()}, ${project.id}, ${number++}, ${t.title}, ${t.description}, 'todo', ${t.priority})`
    }
  })
  console.log(`✓ seeded the Default project with ${seed.length} tasks`)
}

await sql.end()
