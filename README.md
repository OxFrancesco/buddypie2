# BuddyPie

**Cloud sandboxes for AI-driven coding sessions — pick a repo, choose a workflow, and let the agent build.**

BuddyPie is an open-source platform that launches cloud sandboxes via [Daytona](https://www.daytona.io/), clones a GitHub repository, creates a dedicated working branch, and boots an embedded [OpenCode](https://opencode.ai/) workspace pre-configured with a task-specific AI agent. Users select a workflow preset and an LLM model from the dashboard, and BuddyPie handles the full lifecycle: environment provisioning, agent configuration, billing, and delivery validation. The billing system supports USDC on Base through three payment rails — credit accounts, x402 direct payments, and MetaMask delegated budgets settled via an on-chain contract.

## Demo

<div align="center">

[![BuddyPie Demo](https://img.shields.io/badge/▶_Watch_Demo-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Francesco_Oddo/status/2034994244503347594)

*Quick preview of BuddyPie launching a sandbox and running an AI coding session.*

</div>

## Features

- **One-click sandbox launch** — paste a GitHub URL, pick a preset and model, and get a full development environment with an AI agent ready to code.
- **Workflow presets** — three built-in presets (`general-engineer`, `frontend-builder`, `docs-writer`) with custom agent prompts, managed instructions, skills, and workspace bootstrapping.
- **Multi-provider model selection** — choose from OpenRouter and Venice AI models independently of the workflow preset.
- **Docs site scaffolding** — the `docs-writer` preset auto-scaffolds a [Fumadocs](https://fumadocs.vercel.app/) site from template and clones the Fumadocs reference repo for framework-accurate documentation.
- **Shared delivery workflow** — every preset enforces build + typecheck validation before handoff and pushes the working branch for PR creation.
- **Dedicated working branches** — BuddyPie creates a `codex/...` branch before the session starts so agent work is isolated from the base branch.
- **Three payment rails** — USDC credit accounts, x402 direct payments, and MetaMask delegated budgets with on-chain settlement.
- **Subscription credit grants** — Clerk subscriptions automatically grant credits to user accounts.
- **Real-time dashboard** — Convex-powered reactive UI shows sandbox status, billing, and session activity.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Router + Start, Tailwind CSS 4, Radix UI, shadcn, Lucide |
| Backend | Convex (realtime DB, server functions, crons, HTTP actions) |
| Auth | Clerk (via `@clerk/tanstack-react-start`) |
| Sandboxes | Daytona SDK (`@daytonaio/sdk`) |
| AI Agent | OpenCode SDK (`@opencode-ai/sdk`) |
| Payments | x402 protocol (`@x402/core`, `@x402/evm`, `@x402/fetch`), viem |
| Delegation | MetaMask Delegation Toolkit (`@metamask/delegation-toolkit`) |
| Smart Contracts | Foundry / Solidity 0.8.26 — `BuddyPieDelegatedBudgetSettlement.sol` |
| Runtime | Bun |

## Project Structure

```
src/
  routes/               # TanStack Router file-based routes
    _authed/             #   Authenticated route group
    api/                 #   API routes
  features/
    billing/             # Billing UI components and logic
    sandboxes/           # Sandbox UI components and logic
  components/            # Shared UI components (sandbox-card, payment-method-toggle, etc.)
  lib/
    opencode/            # Preset + model definitions (presets.ts)
    billing/             # Billing utilities
    server/              # Server-side helpers
  styles/                # Global styles
  utils/                 # Shared utilities
convex/
  schema.ts              # Full Convex schema
  billing.ts             # Billing mutations and queries
  sandboxes.ts           # Sandbox CRUD
  user.ts                # User management
  crons.ts               # Background jobs (hold expiry, etc.)
  http.ts                # HTTP actions router (x402 settlement, webhooks)
  lib/                   # Shared server utilities
  auth.config.ts         # Clerk ↔ Convex auth configuration
contracts/
  src/                   # BuddyPieDelegatedBudgetSettlement.sol
  script/                # Foundry deploy scripts (Base Sepolia + Base Mainnet)
  test/                  # Contract tests
  lib/                   # Foundry dependencies
docs/                    # Fumadocs-based documentation site
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- A [Convex](https://convex.dev/) project
- A [Clerk](https://clerk.com/) application configured with Convex ([guide](https://docs.convex.dev/auth/clerk))
- A [Daytona](https://www.daytona.io/) API key
- [Foundry](https://getfoundry.sh/) (only for smart contract work)

### Install

```bash
git clone https://github.com/oxfrancesco/buddypie2.git
cd buddypie2
bun install
```

### Configure Environment

Create a `.env.local` file in the project root:

```env
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_JWT_ISSUER_DOMAIN=https://...
VITE_CONVEX_URL=https://...convex.cloud
DAYTONA_API_KEY=...
```

See the [Environment Variables](#environment-variables) section for the full list.

### Run

```bash
bun run dev
```

This runs `bunx convex dev --once` to sync the schema, then starts both the Vite dev server and Convex in watch mode via `concurrently`.

To sync Convex separately:

```bash
bunx convex dev --once
```

### Build

```bash
bun run build
```

Runs `vite build` followed by `tsc --noEmit` for type validation.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key |
| `CLERK_SECRET_KEY` | Yes | Clerk backend secret |
| `CLERK_JWT_ISSUER_DOMAIN` | Yes | Clerk issuer domain — must match `convex/auth.config.ts` |
| `VITE_CONVEX_URL` | Yes | Convex deployment URL |
| `DAYTONA_API_KEY` | Yes | Daytona API key for sandbox provisioning |
| `DAYTONA_API_URL` | No | Custom Daytona API endpoint (defaults to Daytona cloud) |
| `CONVEX_SITE_URL` | No | Explicit Convex HTTP actions URL (e.g. `https://<deployment>.convex.site`) |
| `OPENROUTER_API_KEY` | No | Required for OpenRouter-backed model selections |
| `VENICE_API_KEY` | No | Required for Venice-backed model selections |

**Convex environment variables** (set via `npx convex env set`):

| Variable | Description |
|---|---|
| `X402_PAY_TO_ADDRESS` | Recipient address for x402 USDC settlement |
| `X402_EIP712_TOKEN_NAME` | Override USDC EIP-712 token name (if using a non-standard USDC contract) |
| `X402_EIP712_TOKEN_VERSION` | Override USDC EIP-712 token version |

## OpenCode Presets & Models

BuddyPie manages the OpenCode preset layer instead of leaving agent selection to OpenCode itself. All definitions live in `src/lib/opencode/presets.ts`.

### Workflow Presets

| Preset | Default Model | Description |
|---|---|---|
| `general-engineer` | OpenRouter / MiniMax M2.7 | Balanced repo analysis and implementation for full-stack product work |
| `frontend-builder` | OpenRouter / MiniMax M2.7 | UI-focused preset for React, styling, accessibility, and polish work |
| `docs-writer` | Venice / GLM 5 | Documentation preset — auto-scaffolds a Fumadocs site, clones the Fumadocs reference repo |

Each preset includes:
- **Agent prompt** — shapes the agent's behavior and priorities
- **Managed instructions** — injected as `AGENTS.md` inside the sandbox
- **Skills** — preset-specific OpenCode skills loaded into the agent
- **Starter prompt** — seeds the first OpenCode session when the kickoff field is left blank
- **Workspace bootstrap** (docs-writer only) — scaffolds the Fumadocs app and clones reference sources

### Available Models

| ID | Provider | Model | Env Required |
|---|---|---|---|
| `openrouter-minimax-m2.7` | OpenRouter | `minimax/minimax-m2.7` | `OPENROUTER_API_KEY` |
| `venice-gpt-5.3-codex` | Venice AI | `openai-gpt-53-codex` | `VENICE_API_KEY` |
| `venice-claude-sonnet-4.6` | Venice AI | `claude-sonnet-4-6` | `VENICE_API_KEY` |
| `venice-glm-5` | Venice AI | `zai-org-glm-5` | `VENICE_API_KEY` |

The dashboard lets users choose the workflow preset separately from the provider/model. BuddyPie persists the selected `agentPresetId`, `agentProvider`, and `agentModel` into the Convex `sandboxes` table and reuses the stored provider/model on restart.

### Changing Models or Presets

When provider or model options change, update all three files in the same commit:
1. `src/lib/opencode/presets.ts` — the source of truth
2. `models.md` — model documentation
3. `README.md` — this file
4. `AGENTS.md` — project instructions for AI agents

## Billing & Payments

BuddyPie supports three payment rails for sandbox usage, all denominated in USDC:

1. **Credit Accounts** — Users fund a credit balance (via USDC transfer on Base or subscription grants). BuddyPie places a hold when a sandbox launches, captures it on usage, and releases unused holds. Subscriptions managed through Clerk automatically grant periodic credits.

2. **x402 Direct Pay** — Per-request payment using the [x402 protocol](https://www.x402.org/). The client signs a USDC payment authorization that the Convex HTTP action settles on-chain before fulfilling the request. Requires `X402_PAY_TO_ADDRESS` in the Convex environment.

3. **MetaMask Delegated Budgets** — Users create a spending budget via MetaMask's Delegation Toolkit, delegating USDC allowance to BuddyPie's settlement contract. BuddyPie draws from the budget as sandbox charges accrue, settling each draw on-chain. Supports fixed and periodic (day/week/month) budget types.

The billing schema tracks every charge through `billingCharges`, `creditLedgerEntries`, and `delegatedBudgetSettlements` for full auditability.

## Smart Contracts

The `BuddyPieDelegatedBudgetSettlement.sol` contract handles on-chain settlement for delegated budget payments.

**Known USDC addresses:**
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Deploy

Requires [Foundry](https://getfoundry.sh/).

```bash
# Base Sepolia
forge script contracts/script/DeployDelegatedBudgetBaseSepolia.s.sol \
  --rpc-url <BASE_SEPOLIA_RPC> --broadcast --verify

# Base Mainnet
forge script contracts/script/DeployDelegatedBudgetBaseMainnet.s.sol \
  --rpc-url <BASE_MAINNET_RPC> --broadcast --verify
```

### Test

```bash
forge test
```

## Architecture

```
┌──────────┐    ┌───────────┐    ┌─────────┐    ┌──────────────────┐    ┌──────────────┐
│  User    │───▶│ Dashboard │───▶│ Convex  │───▶│ Daytona Sandbox  │───▶│  OpenCode    │
│ Browser  │    │  (React)  │    │ Backend │    │ (cloud VM)       │    │  AI Session  │
└──────────┘    └───────────┘    └─────────┘    └──────────────────┘    └──────────────┘
```

1. **User** picks a GitHub repo, workflow preset, and model on the dashboard.
2. **Dashboard** calls a Convex mutation to create a sandbox record (status: `creating`).
3. **Convex** provisions a Daytona sandbox via the SDK, clones the repo, creates a `codex/...` working branch, writes preset-specific OpenCode config files, and optionally runs workspace bootstrap (e.g. Fumadocs scaffolding for `docs-writer`).
4. **OpenCode** starts inside the sandbox with the managed agent prompt, instructions, and skills. The first session is seeded with the kickoff task (or the preset's built-in starter prompt if no custom task was provided).
5. **The agent** works on the isolated branch. Before handoff, it runs build + typecheck validation and pushes the branch for PR creation when GitHub auth is available.
6. **Billing** runs in parallel — holds are placed at launch, usage events are recorded, and charges are settled via the selected payment rail.

### For AI Agents Working in This Codebase

- **Runtime**: Use Bun for all Node and TypeScript commands.
- **Branching**: BuddyPie creates a `codex/...` working branch before sessions start. Stay on it unless the user explicitly asks otherwise.
- **Delivery**: Run the repo's build command and typecheck before handoff. Fix any failures you introduced. Push the branch when GitHub auth is available.
- **Presets**: Definitions live in `src/lib/opencode/presets.ts`. The `openCodePresetMap` object is the source of truth for agent prompts, instructions, skills, and workspace bootstrap config. Keep it aligned with what Convex persists as `agentProvider` and `agentModel`.
- **Starter prompts**: Every shipping preset has a non-empty `starterPrompt`. Leaving the dashboard kickoff field blank seeds OpenCode with it. Don't remove starter prompts without updating docs.
- **Schema**: `convex/schema.ts` defines all tables. The `sandboxes` table links to billing via `billingAccountId`, `launchHoldId`, `lastChargeId`, and `pendingPaymentMethod`.
- **Billing flow**: Credit holds are placed at launch (`creditHolds`), captured on usage (`billingCharges` + `creditLedgerEntries`), and released on cancellation. Delegated budget settlements go through `delegatedBudgetSettlements`. x402 flows are handled in `convex/http.ts`.

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a PR.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run `bun run build` to verify the build and types pass
5. Open a pull request

## License

MIT
