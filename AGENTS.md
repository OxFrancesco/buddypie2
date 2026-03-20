Make sure to use bun!

If you change OpenCode providers, models, or defaults, update `models.md`,
`README.md`, and this file in the same change.

Keep the provider/model catalog in `src/lib/opencode/presets.ts` aligned with
the values BuddyPie persists to Convex as `agentProvider` and `agentModel`.

Kickoff prompt defaults matter too: leaving the dashboard kickoff field blank
should always seed OpenCode with the preset's built-in starter prompt, so keep
each shipping preset's `starterPrompt` non-empty unless the product behavior is
intentionally changing and the docs above are updated with it.

Preset delivery workflow defaults matter too: every shipping preset currently
injects shared delivery requirements into the managed agent instructions. Those
defaults require Bun for Node and TypeScript repo commands, staying on the
dedicated `codex/...` working branch BuddyPie creates before the session
starts unless the user explicitly asks otherwise, build plus type validation
before handoff, and a branch push when GitHub auth is available in the
sandbox. If that behavior changes, update `models.md`, `README.md`, and this
file in the same change.
