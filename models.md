# Model Providers And Models

This file is the source of truth for the OpenCode provider and model options
BuddyPie exposes in the dashboard. Keep it aligned with
`src/lib/opencode/presets.ts`, `README.md`, and `AGENTS.md`.

## Current Provider And Model Options

### OpenRouter

- Provider id: `openrouter`
- Required env: `OPENROUTER_API_KEY`
- Current model option: `minimax/minimax-m2.7`
- Dashboard model option id: `openrouter-minimax-m2.7`

### Venice AI

- Provider id: `venice`
- Required env: `VENICE_API_KEY`
- Current model options:
  - `openai-gpt-53-codex`
  - `claude-sonnet-4-6`
  - `zai-org-glm-5`
- Dashboard model option ids:
  - `venice-gpt-5.3-codex`
  - `venice-claude-sonnet-4.6`
  - `venice-glm-5`

The selected provider/model controls which OpenCode provider and model BuddyPie
starts inside the sandbox at runtime.

## Workflow Presets

Workflow presets are separate from provider/model selection. BuddyPie currently
ships these presets:

- `general-engineer`
- `frontend-builder`
- `docs-writer`

Current preset defaults:

- `general-engineer` -> OpenRouter `minimax/minimax-m2.7`
- `frontend-builder` -> OpenRouter `minimax/minimax-m2.7`
- `docs-writer` -> Venice `zai-org-glm-5`

The selected workflow preset controls instructions, skills, workspace
bootstrap, and kickoff behavior.

## Kickoff Default Behavior

- Leaving the dashboard kickoff field blank uses the preset's built-in
  `starterPrompt`.
- Every shipping preset is expected to keep a non-empty `starterPrompt` so
  BuddyPie can always seed the first OpenCode session with a meaningful task.

## Delivery Workflow Default Behavior

- Every shipping preset appends shared delivery requirements to the managed
  agent prompt and instructions.
- Those requirements tell the agent to use Bun for Node and TypeScript repo
  commands.
- BuddyPie checks out a dedicated `codex/...` working branch before the session
  starts, and the agent is expected to stay on that branch unless the user
  explicitly asks to switch away from it.
- Before handoff, the agent should run the relevant build command plus a
  dedicated typecheck command, or the closest validation command that covers
  types when no standalone typecheck exists.
- When GitHub auth is available in the sandbox, the agent should commit and
  push the current branch so a PR can be opened from that branch.

## Where To Change Provider Or Model Options

Change the supported provider/model catalog in
`src/lib/opencode/presets.ts`.

This currently drives:

- the dashboard launch selector
- launch-time validation in `src/lib/sandboxes.ts`
- Daytona/OpenCode runtime setup in `src/lib/server/daytona.ts`
- restart behavior through the stored Convex sandbox record

## Convex Persistence

BuddyPie stores the selected runtime values in the `sandboxes` table:

- `agentPresetId`
- `agentLabel`
- `agentProvider`
- `agentModel`

These fields are defined in `convex/schema.ts` and written through
`convex/sandboxes.ts`.

## Every Time We Change Providers Or Models

When adding, removing, or changing a provider/model option:

1. Update `src/lib/opencode/presets.ts`.
2. Update this file.
3. Update `README.md`.
4. Update `AGENTS.md`.
5. Verify the needed env vars are documented and available.
6. Confirm launch and restart still preserve the intended `agentProvider` and
   `agentModel` in Convex.
