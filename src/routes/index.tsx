import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { MiniDispatch } from '@/components/MiniDispatch'
import { runnerStatusQuery } from '@/lib/tracker'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(runnerStatusQuery),
  component: Home,
})

const BENEFITS = [
  {
    k: '01 · DEPLOY',
    t: 'Zero-config deploys',
    d: 'Push a TanStack Start repo and Railway builds it. Railpack figures out Start, Vite, and your package manager on its own, so you never write a Dockerfile.',
  },
  {
    k: '02 · DATA',
    t: 'Postgres in one click',
    d: 'The tracker stores everything in a Railway Postgres that lives next to the app and talks to it over private networking. Redis, MySQL, and Mongo work the same way.',
  },
  {
    k: '03 · COMPUTE',
    t: 'Sandboxes as a primitive',
    d: 'When you run a task, Dispatch asks TanStack AI for a sandbox, and the Railway provider boots one in a few seconds. Claude Code works inside it, and the sandbox is destroyed when the run ends.',
  },
  {
    k: '04 · SHIP',
    t: 'Environments per PR',
    d: 'Open a pull request and Railway clones the whole project into a preview environment, database included. Every branch is a working copy of the tracker.',
  },
]

const STACK = [
  '@tanstack/react-start',
  '@tanstack/react-router',
  '@tanstack/react-query',
  '@tanstack/ai',
  '@tanstack/ai-sandbox',
  '@tanstack/ai-sandbox-railway',
  '@tanstack/ai-claude-code',
  'drizzle-orm',
  'postgres',
]

function Home() {
  const { data: runner } = useSuspenseQuery(runnerStatusQuery)
  return (
    <div className="home">
      <nav className="home-nav">
        <span className="wordmark">
          <span className="dot" />
          Dispatch
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/app" className="btn primary">
            Open Dispatch
          </Link>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A Railway template for TanStack</p>
          <h1>
            Run TanStack on <em>Railway.</em>
          </h1>
          <p className="sub">
            Dispatch is a work tracker built on <strong>TanStack Start</strong>, <strong>TanStack AI</strong>,
            and <strong>Postgres</strong>. Every task has a run button. Press it and a{' '}
            <strong>Railway sandbox</strong> boots, <strong>Claude Code</strong> works the task inside it, and
            every step lands in the task's activity feed.
          </p>
          <div className="hero-actions">
            <Link to="/app" className="btn primary">
              Open Dispatch →
            </Link>
            <a
              className="btn"
              href="https://github.com/railwayapp/railway-tanstack-start-sandbox-template"
              target="_blank"
              rel="noreferrer"
            >
              View the source
            </a>
          </div>
        </div>
        <MiniDispatch missing={runner.missing} />
      </header>

      <section className="section stack-section">
        <h2>The stack</h2>
        <div className="stack-row">
          {STACK.map((s) => (
            <span className="stack-chip" key={s}>
              {s}
            </span>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>What Railway gives a TanStack app</h2>
        <p className="lede">
          Nothing here is special-cased for the demo. The template runs on the same pieces you get in any
          Railway project.
        </p>
        <div className="benefits">
          {BENEFITS.map((b) => (
            <div className="benefit" key={b.k}>
              <span className="k">{b.k}</span>
              <h3>{b.t}</h3>
              <p>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>How Dispatch is wired</h2>
        <p className="lede">One Start app, one database, and sandboxes created on demand.</p>
        <div className="arch">
          <div className="arch-node">
            <div className="t">TanStack Start</div>
            <div className="d">SSR + server functions</div>
          </div>
          <span className="arch-link">drizzle →</span>
          <div className="arch-node">
            <div className="t">Railway Postgres</div>
            <div className="d">projects · tasks · runs</div>
          </div>
          <span className="arch-link">← activity feed</span>
          <div className="arch-node">
            <div className="t">Sandbox VMs</div>
            <div className="d">Claude Code via TanStack AI</div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>There's an API too</h2>
        <p className="lede">
          The UI and the REST API share one set of operations, so anything you can do with a click you can
          also do from a script or an agent.
        </p>
        <div className="term api-term">
          <div className="cmd">export AUTH="authorization: Bearer $DISPATCH_PASSWORD"</div>
          <div className="cmd">curl -s -H "$AUTH" $APP_URL/api/v1/projects</div>
          <div className="out">
            [{'{'} "id": "…", "name": "Platform", "key": "PLA", … {'}'}]
          </div>
          <div className="cmd">
            curl -s -X POST -H "$AUTH" $APP_URL/api/v1/projects/&lt;id&gt;/tasks -H 'content-type:
            application/json' -d '{'{'}"title": "Fetch top HN stories"{'}'}'
          </div>
          <div className="out">
            {'{'} "id": "…", "number": 4, "status": "todo", … {'}'}
          </div>
          <div className="cmd">curl -s -X POST -H "$AUTH" $APP_URL/api/v1/tasks/&lt;id&gt;/run</div>
          <div className="out">
            {'{'} "runId": "…" {'}'} — a sandbox picks the task up
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="inner">
          <span>Fork it, point it at your own Railway project, and make it yours.</span>
          <div className="brand-logos">
            <img src="/brand/tanstack.png" alt="TanStack" />
            <img src="/brand/railway-light.svg" alt="Railway" className="logo-light" />
            <img src="/brand/railway-dark.svg" alt="Railway" className="logo-dark" />
          </div>
        </div>
      </footer>
    </div>
  )
}
