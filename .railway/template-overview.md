# Deploy and Host TanStack Start with AI Sandboxes on Railway

Dispatch is a work tracker built on [TanStack Start](https://tanstack.com/start) and [TanStack AI](https://tanstack.com/ai). Every task has a Run button: press it and a Railway sandbox boots, Claude Code works the task inside it, and each step lands in the task's activity feed.

## About Hosting TanStack Start with AI Sandboxes

This template deploys a TanStack Start app and a Postgres database. Runs use TanStack AI's sandbox primitives: `defineSandbox` describes a disposable sandbox, the `@tanstack/ai-sandbox-railway` provider creates it on Railway in a few seconds, and `withSandbox` hands it to the Claude Code harness through `chat()`. The sandbox is destroyed when the run ends.

Railway builds the app with Railpack and runs the Nitro output. Before each deploy, a pre-deploy command applies the Drizzle migrations and seeds a starter project. The app is behind an access password the template generates, and the same password works as a bearer token for the REST API.

## Common Use Cases

- A starting point for apps where an AI agent does real work in an isolated VM
- Handing routine tasks to Claude Code from a tracker, a script, or a webhook
- A working reference for TanStack AI sandboxes, harnesses and the Railway provider

## Dependencies for TanStack Start with AI Sandboxes Hosting

- PostgreSQL (provisioned by this template)
- An Anthropic API key, for Claude Code
- A Railway project token for the deployed environment, for creating sandboxes

### Deployment Dependencies

- [TanStack AI sandbox docs](https://tanstack.com/ai/latest)
- [Source repository](https://github.com/railwayapp/railway-tanstack-start-sandbox-template)
- [Anthropic Console](https://console.anthropic.com) for an API key
- [Railway project tokens](https://docs.railway.com/integrations/api#choosing-a-token-type)

### Implementation Details

The deploy form asks for `ANTHROPIC_API_KEY`. The template also sets these variables on the `Dispatch-Web` service:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
DISPATCH_PASSWORD=${{secret(24)}}   # sign in with this
SESSION_SECRET=${{secret(32)}}
```

After deploying, create a project token for the environment (project Settings → Tokens) and add it to the `Dispatch-Web` service as `RAILWAY_TOKEN`. A project token can only reach this environment, so the app never holds an account-wide credential.

## Why Deploy TanStack Start with AI Sandboxes on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying TanStack Start with AI Sandboxes on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
