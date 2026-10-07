import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

type MiniTask = {
  id: number
  num: number
  title: string
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
  priority: 'urgent' | 'high' | 'medium' | 'low'
}

const CYCLE: MiniTask['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done']

const SAMPLE: MiniTask[] = [
  { id: 1, num: 1, title: 'Fetch top 5 HN stories → JSON', status: 'todo', priority: 'high' },
  { id: 2, num: 2, title: 'Scaffold a healthcheck endpoint', status: 'todo', priority: 'medium' },
  { id: 3, num: 3, title: 'Benchmark JSON.parse on 10MB', status: 'backlog', priority: 'low' },
]

const RUN_SCRIPT: Record<number, string[]> = {
  1: [
    '$ node fetch-hn.mjs',
    'fetched 5 stories in 412ms',
    '$ cat hn-top5.json | jq length',
    '5',
    'SUMMARY: saved top 5 stories to hn-top5.json',
  ],
  2: [
    '$ node server.mjs &',
    'listening on :3000',
    '$ curl -s localhost:3000/health',
    '{"ok":true}',
    'SUMMARY: healthcheck endpoint responding on :3000',
  ],
  3: [
    '$ node bench.mjs',
    'generated 10.2MB payload',
    'parse × 10 … avg 61ms',
    'SUMMARY: JSON.parse averages 61ms per 10MB parse',
  ],
}

const FALLBACK_SCRIPT = [
  '$ sandbox boot',
  'sandbox ready in 2.1s',
  '$ echo "working the task…"',
  'working the task…',
  'SUMMARY: task executed in the sandbox',
]

export function MiniDispatch({ missing }: { missing: string[] }) {
  const ready = missing.length === 0
  const [view, setView] = useState<'board' | 'run'>('board')
  const [tasks, setTasks] = useState<MiniTask[]>(SAMPLE)
  const [title, setTitle] = useState('')
  const [activeTask, setActiveTask] = useState<MiniTask | null>(null)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextId = useRef(SAMPLE.length + 1)

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    [],
  )

  const cycleStatus = (id: number) => {
    if (runningId != null) return
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id ? { ...t, status: CYCLE[(CYCLE.indexOf(t.status) + 1) % CYCLE.length] } : t,
      ),
    )
  }

  const run = (task: MiniTask) => {
    setActiveTask(task)
    setView('run')
    if (!ready || runningId != null) return
    const script = RUN_SCRIPT[task.id] ?? FALLBACK_SCRIPT
    setRunningId(task.id)
    const header = `▸ sandbox started for ${keyOf(task)}`
    setLines([header])
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status: 'in_progress' } : t)))
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setLines([header, ...script])
      finish(task.id)
      return
    }
    let n = 0
    timer.current = setInterval(() => {
      n += 1
      const shown = Math.min(n, script.length)
      setLines([header, ...script.slice(0, shown)])
      if (shown >= script.length) {
        if (timer.current) clearInterval(timer.current)
        finish(task.id)
      }
    }, 550)
  }

  const finish = (id: number) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'in_review' } : t)))
    setRunningId(null)
  }

  const addTask = () => {
    const t = title.trim()
    if (!t) return
    setTasks((ts) => [
      { id: nextId.current, num: nextId.current, title: t, status: 'todo', priority: 'medium' },
      ...ts,
    ])
    nextId.current += 1
    setTitle('')
  }

  return (
    <div className="mini" aria-label="Interactive preview of Dispatch with sample data">
      <div className="mini-views" data-view={view}>
        {/* board view */}
        <div className="mini-view">
          <div className="mini-bar">
            <span className="mini-title">
              <span className="swatch" style={{ background: 'var(--accent)' }} />
              Dispatch
            </span>
          </div>
          <form
            className="mini-add"
            onSubmit={(e) => {
              e.preventDefault()
              addTask()
            }}
          >
            <input
              type="text"
              placeholder="Add a task…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Add a preview task"
            />
          </form>
          <div className="mini-rows">
            {tasks.map((t) => (
              <div className="mini-row" key={t.id}>
                <button
                  className="mini-dot-btn"
                  title="Click to cycle status"
                  onClick={() => cycleStatus(t.id)}
                >
                  <span className="status-dot" data-st={t.status} />
                </button>
                <span className="mini-id">{keyOf(t)}</span>
                <span className="mini-t">{t.title}</span>
                {runningId === t.id ? (
                  <span className="chip-running">
                    <span className="pulse" /> running
                  </span>
                ) : (
                  t.status !== 'done' && (
                    <button className="mini-run" onClick={() => run(t)} disabled={runningId != null}>
                      run
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* run view */}
        <div className="mini-view">
          <div className="mini-bar">
            <button className="mini-back" onClick={() => setView('board')}>
              ← Back
            </button>
            {activeTask && (
              <span className="mini-run-label">
                <span className="mini-id">{keyOf(activeTask)}</span>
                <span className="mini-t">{activeTask.title}</span>
              </span>
            )}
            {runningId != null && (
              <span className="chip-running">
                <span className="pulse" /> running
              </span>
            )}
          </div>
          {!ready ? (
            <div className="mini-gate">
              <p>
                Before tasks can run, set these variables on the service in Railway:{' '}
                {missing.map((m) => m.split(' ')[0]).join(', ')}.
              </p>
              <Link to="/app/settings" className="btn primary">
                See Settings
              </Link>
            </div>
          ) : (
            <div className="term mini-term">
              {lines.map((l, i) =>
                l?.startsWith('$') ? (
                  <div className="cmd" key={i}>
                    {l.slice(2)}
                  </div>
                ) : (
                  <div className="out" key={i}>
                    {l}
                  </div>
                ),
              )}
              {runningId == null && lines.length > 0 && (
                <div className="out mini-done">task moved to In Review ✓</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function keyOf(t: MiniTask) {
  return `DIS-${t.num}`
}
