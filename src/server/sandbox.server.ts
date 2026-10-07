// Server-only: how Dispatch gets a sandbox. This is the whole integration with
// TanStack AI sandboxes: a Railway provider, a workspace, and a lifecycle.
// `withSandbox(definition)` (see runs.server.ts) creates the sandbox, runs the
// workspace setup, and hands it to the Claude Code harness.
import { createSecrets, defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { railwaySandbox } from '@tanstack/ai-sandbox-railway'

// Railway's sandbox image ships the `claude` CLI. Install it only if a custom
// image lacks it; `--include=optional` pulls the platform-native binary.
const CLAUDE_CLI_SETUP =
  'command -v claude >/dev/null 2>&1 && claude --version || npm install -g @anthropic-ai/claude-code --include=optional'

/** The model Claude Code runs. Aliases like `sonnet` resolve to the latest version. */
export const AGENT_MODEL = process.env.DISPATCH_MODEL || 'sonnet'

/** Environment variables a run needs that aren't set, with what each is for. */
export function missingRunConfig(): string[] {
  const missing: string[] = []
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY (Claude Code runs on it)')
  if (!process.env.RAILWAY_API_TOKEN && !process.env.RAILWAY_TOKEN) {
    missing.push('RAILWAY_API_TOKEN (creates the sandboxes)')
  }
  if (!process.env.RAILWAY_ENVIRONMENT_ID) {
    missing.push('RAILWAY_ENVIRONMENT_ID (Railway sets it on deployments; set it yourself locally)')
  }
  return missing
}

/** One disposable sandbox per run, destroyed when the run ends. */
export function sandboxForRun(runId: string, onReady: (sandboxId: string) => void) {
  return defineSandbox({
    id: `dispatch-${runId}`,
    // Reads RAILWAY_API_TOKEN (or a RAILWAY_TOKEN project token) and
    // RAILWAY_ENVIRONMENT_ID, so sandboxes land in this app's own environment.
    // The idle timeout stays at the plan default (Trial and Free allow at most
    // 5 minutes); a running Claude Code session keeps the sandbox alive anyway.
    provider: railwaySandbox(),
    workspace: defineWorkspace({
      source: { type: 'none' },
      setup: ({ serial }) => serial(CLAUDE_CLI_SETUP),
      // Injected into the sandbox at create time; never stored or logged.
      secrets: createSecrets({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' }),
    }),
    lifecycle: {
      reuse: 'none',
      // Railway checkpoints count against a plan quota and aren't pruned
      // automatically, so skip the default after-setup snapshot.
      snapshot: 'none',
      destroyOnComplete: true,
    },
    hooks: { onReady: (handle) => onReady(handle.id) },
  })
}
