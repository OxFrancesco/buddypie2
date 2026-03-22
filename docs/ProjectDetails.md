# BuddyPie — Hackathon Submission

## 1. Project Name

**BuddyPie**

## 2. Description

Right now, if you want a good AI coding agent, you need your own machine, your own API keys, your own setup. You install the CLI, configure the model, wire up the environment, and hope it all works. BuddyPie skips all of that. You open your browser, pick a repo, choose an agent preset, and hit launch. A cloud sandbox spins up with the agent already inside, working on your code. You watch it through a browser-based IDE, or you walk away and come back when it's done.

Three ways to pay: subscription credits if you want a monthly budget, x402 micropayments on Base if you want pay-per-session, or a delegated USDC budget through MetaMask Delegation Toolkit if you want to approve a spending cap once and never see a wallet prompt again.

## 3. Problem Statement

Using AI coding agents today requires a local machine with the right setup. You need the CLI installed, API keys configured, the right model selected, and a dev environment that can actually run the agent. If your laptop is closed, the agent stops. If you switch machines, you start over. Most people who would benefit from these agents never get past the setup.

BuddyPie removes that barrier. You get access to a library of pre-configured agent presets (general engineering, frontend, docs writing) running in isolated cloud sandboxes, directly from your browser. No local setup, no machine dependency. The agent clones your repo, reads the codebase, does the work on a dedicated branch, and pushes it when it's done. You open a PR whenever you're ready. Billing is flexible: credits, micropayments, or onchain delegated budgets, so you pay the way that works for you.

## 4. Repo URL

[https://github.com/OxFrancesco/BuddyPie2](https://github.com/OxFrancesco/BuddyPie2)

## 5. Conversation Log

**Human-Agent Collaboration Summary:**

The build was a continuous back-and-forth between the developer (Francesco) and AI coding agents, using Amp (openclaw harness) as the primary development environment.

**Phase 1 — Architecture & Core Scaffolding:**
Brainstormed the core concept: a platform that provisions cloud sandboxes with AI agents inside. Decided on TanStack Router + Start for the frontend, Convex for the realtime backend, Clerk for auth, and Daytona SDK for sandbox provisioning. The key decision was to embed OpenCode as the agent runtime rather than building a custom agent — this let us focus on orchestration and billing instead of reinventing the agent layer.

**Phase 2 — Preset System Design:**
Iterated on how to make the agent actually useful out of the box. Landed on a preset system where each workflow (general-engineer, frontend-builder, docs-writer) ships with its own system prompt, managed instructions, injected skills, and workspace bootstrap behavior. The breakthrough was decoupling the preset from the model — you pick the workflow and the model independently, so you can run the docs-writer on GPT-5.3 Codex or MiniMax M2.7.

**Phase 3 — Billing & Payment Rails:**
Started with simple Clerk subscription credits, then added x402 micropayments on Base for pay-as-you-go. The big breakthrough was integrating MetaMask Delegation Toolkit to create delegated USDC budgets — users sign a delegation once that creates an onchain spending cap, and the backend settles against it without wallet prompts. Built the `BuddyPieDelegatedBudgetSettlement` Solidity contract, deployed on Base Sepolia with Foundry.

**Phase 4 — Sandbox Lifecycle & Agent Orchestration:**
Wired up the full lifecycle: Daytona sandbox creation → repo clone → branch checkout (`codex/...`) → preset injection → OpenCode boot → agent kickoff → branch push on completion. The agent handles build verification, typechecking, and git push automatically as part of the delivery workflow.

**Phase 5 — Docs Site & Polish:**
Used the docs-writer preset to dogfood BuddyPie itself — had the agent scaffold a Fumadocs documentation site, cross-reference actual source code, typecheck, and build. Polished the dashboard UI, billing flows, and sandbox management.

**Key Decisions:**
- Convex for realtime state (sandbox status, billing ledger, credit holds) instead of polling
- OpenCode as the agent runtime — battle-tested, extensible, embeddable
- Three independent payment rails rather than forcing one billing model
- Preset ↔ model independence so users aren't locked into specific combinations
- Dedicated branches per session so agent work never touches main

## 6. Deployed URL

[https://agents.buddytools.org/](https://agents.buddytools.org/)

> ⚠️ **Note:** Currently on testnet. Users need whitelist access to use the platform.

## 7. Video URL

[https://x.com/Francesco_Oddo/status/2034994244503347594](https://x.com/Francesco_Oddo/status/2034994244503347594)

---

## Submission Metadata

| Field | Value |
|---|---|
| agentFramework | OpenCode (AI agent runtime) |
| agentHarness | openclaw |
| model | minimax-m2.7, venice-gpt-5.3-codex, venice-claude-sonnet-4.6, venice-minimax-m2.7 |
| skills | convex, shadcn, cloudflare, deploying-contracts-on-base, frontend-design, find-docs |
| tools | React 19, TanStack Router/Start, Convex, Clerk, Daytona SDK, OpenCode SDK, MetaMask Delegation Toolkit, x402, Viem, Foundry/Solidity, Base chain, Tailwind CSS 4, Radix UI, shadcn/ui, Fumadocs |
| helpfulResources | Convex docs, MetaMask Delegation Toolkit docs, x402 protocol docs, Daytona SDK docs, Clerk + Convex auth guide |
| intention | continuing |

## Tracks

- 🎭 **Venice** — Private Agents, Trusted Actions (prizes: 1,000/600/400 VVV)
- 🦊 **MetaMask** — Best Use of Delegations ($3,000 / $1,500 / $500)
- 🌟 **Synthesis Open Track** — $28,133+ community pool
