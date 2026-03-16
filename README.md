# BuddyPie

BuddyPie launches Daytona sandboxes, clones a repository, and boots an
embedded OpenCode workspace for task-specific AI sessions.

## Required Environment

Add these values to your local `.env` before starting the app:

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `VITE_CONVEX_URL`
- `DAYTONA_API_KEY`
- `ZAI_API_KEY`

Optional:

- `DAYTONA_API_URL`

Follow the Clerk + Convex auth guide at
https://docs.convex.dev/auth/clerk and make sure `convex/auth.config.ts`
uses the matching Clerk issuer domain.

## Development

```bash
npx convex dev --once
npm run dev
```

## OpenCode Presets

BuddyPie manages the OpenCode preset layer instead of leaving agent
selection to OpenCode itself.

- Preset definitions live in `src/lib/opencode/presets.ts`.
- Each preset can provide its own provider/model pair, AGENTS instructions,
  skills, MCP config, and seeded kickoff prompt.
- Current presets use the `zai/glm-4.7` model pair and require
  `ZAI_API_KEY`.

When a sandbox launches, BuddyPie writes the preset-specific OpenCode files
inside the sandbox, starts `opencode web`, then seeds the first session with
the selected kickoff task.
