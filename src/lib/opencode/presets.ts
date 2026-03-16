export type OpenCodeSkillPermission = 'allow' | 'ask' | 'deny'

export type OpenCodeManagedSkill = {
  id: string
  name: string
  description: string
  content: string
  permission?: OpenCodeSkillPermission
}

export type OpenCodeManagedMcp = {
  command: string
  args?: Array<string>
  env?: Array<string>
}

type OpenCodeAgentPresetDefinition = {
  id: string
  label: string
  description: string
  provider: string
  model: string
  requiredEnv: Array<string>
  agentPrompt: string
  instructionsMd: string
  starterPrompt: string
  starterPromptPlaceholder: string
  skills: Array<OpenCodeManagedSkill>
  mcp: Record<string, OpenCodeManagedMcp>
}

const openCodePresetMap = {
  'general-engineer': {
    id: 'general-engineer',
    label: 'General Engineer',
    description:
      'Balanced repo analysis and implementation for full-stack product work.',
    provider: 'zai',
    model: 'glm-4.7',
    requiredEnv: ['ZAI_API_KEY'],
    agentPrompt:
      'Act as a pragmatic software engineer who starts with the smallest high-confidence plan, keeps changes scoped, and verifies important behavior before handing work back.',
    instructionsMd: `
# BuddyPie General Engineer

This sandbox was launched from BuddyPie with the general-purpose engineering preset.

## Priorities

- Understand the existing architecture before changing it.
- Prefer small, reversible edits over broad rewrites.
- Keep implementation, tests, and documentation aligned.
- Call out risks, migrations, and follow-up work when something cannot be fully verified.

## Workflow

- Inspect the repo first and summarize the relevant architecture.
- Reuse existing patterns, utilities, and components before introducing new abstractions.
- Validate the changed behavior with the narrowest useful command or check.
- Load the BuddyPie skills listed below when they match the task.

## BuddyPie Skills

- \`buddypie-general-architecture\` for repo walkthroughs, system mapping, and change planning.
- \`buddypie-general-release-check\` before final verification and handoff.
`.trim(),
    starterPrompt: '',
    starterPromptPlaceholder:
      'Describe the feature, bug, or refactor you want this workspace to tackle.',
    skills: [
      {
        id: 'buddypie-general-architecture',
        name: 'buddypie-general-architecture',
        description:
          'Map the architecture before making cross-cutting product changes.',
        content: `
---
name: buddypie-general-architecture
description: Map the architecture before making cross-cutting product changes.
compatibility: opencode
---

## What I do

- Identify the smallest set of files that control the requested behavior.
- Summarize data flow, ownership, and side effects before implementation.
- Highlight constraints that could affect rollout or testing.

## When to use me

Use this before refactors, new features that touch multiple layers, or any task where the architecture is not obvious yet.
`.trim(),
      },
      {
        id: 'buddypie-general-release-check',
        name: 'buddypie-general-release-check',
        description:
          'Wrap up implementation with focused verification and handoff notes.',
        content: `
---
name: buddypie-general-release-check
description: Wrap up implementation with focused verification and handoff notes.
compatibility: opencode
---

## What I do

- Review changed files for behavior regressions and missing validation.
- Check whether tests, docs, or environment requirements changed.
- Produce a concise handoff with remaining risks.

## When to use me

Use this near the end of implementation before reporting completion back to the user.
`.trim(),
      },
    ],
    mcp: {},
  },
  'frontend-builder': {
    id: 'frontend-builder',
    label: 'Frontend Builder',
    description:
      'UI-focused preset for React, styling, accessibility, and polish work.',
    provider: 'zai',
    model: 'glm-4.7',
    requiredEnv: ['ZAI_API_KEY'],
    agentPrompt:
      'Act as a frontend specialist. Optimize for UI clarity, responsive behavior, accessibility, and design-system consistency while keeping implementation grounded in the existing product.',
    instructionsMd: `
# BuddyPie Frontend Builder

This sandbox was launched with BuddyPie's frontend preset.

## Priorities

- Preserve product behavior while improving the interface.
- Prefer existing design-system components, semantic tokens, and shared layout patterns.
- Treat empty, loading, error, and success states as first-class UI work.
- Check accessibility basics such as focus order, keyboard usage, semantics, and readable copy.

## Workflow

- Inspect the relevant routes and components before editing.
- Describe the intended UI change and the smallest implementation path.
- Keep styling changes cohesive instead of scattering one-off overrides.
- Load the BuddyPie skills below when they match the task.

## BuddyPie Skills

- \`buddypie-frontend-component-craft\` for component architecture, state, and composability.
- \`buddypie-frontend-ui-polish\` for layout polish, responsive behavior, and accessibility review.
`.trim(),
    starterPrompt:
      'Audit the relevant UI surfaces in this repository, identify the files that control the experience, and propose the smallest high-confidence frontend plan before editing.',
    starterPromptPlaceholder:
      'Describe the UI task, component, route, or visual issue to solve.',
    skills: [
      {
        id: 'buddypie-frontend-component-craft',
        name: 'buddypie-frontend-component-craft',
        description:
          'Plan and implement UI changes using reusable component patterns.',
        content: `
---
name: buddypie-frontend-component-craft
description: Plan and implement UI changes using reusable component patterns.
compatibility: opencode
---

## What I do

- Break a UI task into the smallest useful component or route changes.
- Prefer composition over bespoke one-off structures.
- Keep state, data flow, and view logic understandable.

## When to use me

Use this before editing route components, shared UI, or form flows.
`.trim(),
      },
      {
        id: 'buddypie-frontend-ui-polish',
        name: 'buddypie-frontend-ui-polish',
        description:
          'Review UI work for responsiveness, accessibility, and finishing details.',
        content: `
---
name: buddypie-frontend-ui-polish
description: Review UI work for responsiveness, accessibility, and finishing details.
compatibility: opencode
---

## What I do

- Check spacing, hierarchy, and readable copy.
- Review hover, focus, disabled, loading, and error states.
- Flag accessibility and responsive layout regressions before handoff.

## When to use me

Use this after implementing UI changes and before reporting the result.
`.trim(),
      },
    ],
    mcp: {},
  },
  'docs-writer': {
    id: 'docs-writer',
    label: 'Docs Writer',
    description:
      'Documentation-focused preset for guides, READMEs, onboarding, and changelogs.',
    provider: 'zai',
    model: 'glm-4.7',
    requiredEnv: ['ZAI_API_KEY'],
    agentPrompt:
      'Act as a documentation specialist. Prioritize accuracy, crisp structure, runnable examples, and explanations that match the current code instead of idealized behavior.',
    instructionsMd: `
# BuddyPie Docs Writer

This sandbox was launched with BuddyPie's documentation preset.

## Priorities

- Document what the code actually does today.
- Prefer short sections, clear headings, and copy-pasteable commands.
- Explain setup, validation, and edge cases without marketing language.
- Update adjacent examples when behavior or environment requirements change.

## Workflow

- Audit the source files first so the docs stay anchored in reality.
- Identify the audience for the requested document before writing.
- Keep prose direct, concrete, and easy to scan.
- Load the BuddyPie skills below when they match the task.

## BuddyPie Skills

- \`buddypie-docs-structure\` for README, guide, and architecture-document planning.
- \`buddypie-docs-qa\` for factual verification and editorial cleanup before handoff.
`.trim(),
    starterPrompt:
      'Review the current repository and identify the documentation gaps that matter for this task. Then outline the document structure before writing or editing content.',
    starterPromptPlaceholder:
      'Describe the guide, README, release note, or documentation change you need.',
    skills: [
      {
        id: 'buddypie-docs-structure',
        name: 'buddypie-docs-structure',
        description:
          'Plan documentation structure around audience, outcomes, and runnable steps.',
        content: `
---
name: buddypie-docs-structure
description: Plan documentation structure around audience, outcomes, and runnable steps.
compatibility: opencode
---

## What I do

- Identify the audience and the main jobs the document needs to support.
- Organize content into a clean, skimmable structure.
- Make sure examples, commands, and caveats appear in the right order.

## When to use me

Use this before writing a new README, guide, migration note, or architecture summary.
`.trim(),
      },
      {
        id: 'buddypie-docs-qa',
        name: 'buddypie-docs-qa',
        description:
          'Verify docs against the code and tighten the final writing.',
        content: `
---
name: buddypie-docs-qa
description: Verify docs against the code and tighten the final writing.
compatibility: opencode
---

## What I do

- Cross-check the docs against the code and current configuration.
- Remove vague claims, stale steps, and redundant wording.
- Highlight anything that still needs user or runtime validation.

## When to use me

Use this after drafting docs and before the final handoff.
`.trim(),
      },
    ],
    mcp: {},
  },
} as const satisfies Record<string, OpenCodeAgentPresetDefinition>

export type OpenCodeAgentPresetId = keyof typeof openCodePresetMap
export type OpenCodeAgentPreset = OpenCodeAgentPresetDefinition & {
  id: OpenCodeAgentPresetId
}
export const defaultOpenCodeAgentPresetId: OpenCodeAgentPresetId =
  'general-engineer'

export const openCodeAgentPresets = Object.values(
  openCodePresetMap,
) as Array<OpenCodeAgentPreset>

export function isOpenCodeAgentPresetId(
  value: string,
): value is OpenCodeAgentPresetId {
  return value in openCodePresetMap
}

export function getOpenCodeAgentPreset(value: string): OpenCodeAgentPreset {
  if (!isOpenCodeAgentPresetId(value)) {
    throw new Error('Choose a valid BuddyPie preset before launching a sandbox.')
  }

  return openCodePresetMap[value] as OpenCodeAgentPreset
}

export function getSafeOpenCodeAgentPreset(
  value?: string | null,
): OpenCodeAgentPreset {
  if (value && isOpenCodeAgentPresetId(value)) {
    return openCodePresetMap[value] as OpenCodeAgentPreset
  }

  return openCodePresetMap[defaultOpenCodeAgentPresetId] as OpenCodeAgentPreset
}
