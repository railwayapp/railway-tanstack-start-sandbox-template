// Server-only. Reach it through dynamic imports inside server functions and
// server routes so the Postgres driver never lands in the client bundle.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL ?? '', { max: 10, onnotice: () => {} })

export const db = drizzle(client, { schema })
export * from './schema'
