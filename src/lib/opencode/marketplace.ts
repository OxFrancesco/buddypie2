import { Schema } from 'effect'
import {
  getOpenCodeAgentPreset,
  getOpenCodeModelOption,
  getOpenCodeModelOptionByProviderAndModel,
  openCodeAgentPresets,
  type AgentSourceKind,
  type LaunchableAgentDefinition,
  type MarketplacePublicStatus,
  type MarketplaceReviewStatus,
  type OpenCodeManagedMcp,
  type OpenCodeManagedSkill,
  type OpenCodeModelOptionId,
  type OpenCodeWorkspaceBootstrap,
} from './presets'

export const MARKETPLACE_DEFAULT_BILLING_KEY = 'marketplace-default'

export type MarketplaceLaunchSelection =
  | {
      kind: 'builtin'
      builtinPresetId: string
    }
  | {
      kind: 'marketplace_draft'
      marketplaceAgentId: string
    }
  | {
      kind: 'marketplace_version'
      marketplaceAgentId: string
      marketplaceVersionId?: string
    }

export type AgentComposition = {
  personaModuleId: string
  customAgentPrompt?: string
  customInstructionsMd?: string
  starterPrompt: string
  starterPromptPlaceholder: string
  repositoryOptional: boolean
  defaultModelOptionId: OpenCodeModelOptionId
  skillModuleIds: Array<string>
  mcpModuleIds: Array<string>
  workspaceBootstrapModuleIds: Array<string>
}

export type MarketplaceAgentMetadata = {
  slug: string
  name: string
  shortDescription: string
  descriptionMd?: string
  tags: Array<string>
  icon?: string
}

type PersonaContentMode = 'final'

export type AgentPersonaModule = {
  id: string
  label: string
  description: string
  agentPrompt: string
  instructionsMd: string
  starterPrompt: string
  starterPromptPlaceholder: string
  repositoryOptional: boolean
  defaultModelOptionId: OpenCodeModelOptionId
  requiredEnv: Array<string>
  contentMode: PersonaContentMode
}

export type ManagedSkillModule = {
  id: string
  label: string
  description: string
  skill: OpenCodeManagedSkill
}

export type ManagedMcpModule = {
  id: string
  label: string
  description: string
  mcpKey: string
  mcp: OpenCodeManagedMcp
}

export type WorkspaceBootstrapModule = {
  id: string
  label: string
  description: string
  workspaceBootstrap: OpenCodeWorkspaceBootstrap
}

export type BuiltinMarketplaceBlueprint = {
  id: string
  slug: string
  composition: AgentComposition
}

const MarketplaceLaunchSelectionSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('builtin'),
    builtinPresetId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('marketplace_draft'),
    marketplaceAgentId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('marketplace_version'),
    marketplaceAgentId: Schema.String,
    marketplaceVersionId: Schema.optional(Schema.String),
  }),
)

const AgentCompositionSchema = Schema.Struct({
  personaModuleId: Schema.String,
  customAgentPrompt: Schema.optional(Schema.String),
  customInstructionsMd: Schema.optional(Schema.String),
  starterPrompt: Schema.String,
  starterPromptPlaceholder: Schema.String,
  repositoryOptional: Schema.Boolean,
  defaultModelOptionId: Schema.String,
  skillModuleIds: Schema.Array(Schema.String),
  mcpModuleIds: Schema.Array(Schema.String),
  workspaceBootstrapModuleIds: Schema.Array(Schema.String),
})

function getUniqueStrings(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter(Boolean)))
}

function trimOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function removeModelEnvFromPresetRequiredEnv(presetId: string) {
  const preset = getOpenCodeAgentPreset(presetId)
  const presetModel = getOpenCodeModelOptionByProviderAndModel(
    preset.provider,
    preset.model,
  )
  const modelEnv = new Set(presetModel?.requiredEnv ?? [])

  return preset.requiredEnv.filter((envName) => !modelEnv.has(envName))
}

function createPersonaModuleFromBuiltin(presetId: string): AgentPersonaModule {
  const preset = getOpenCodeAgentPreset(presetId)

  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    agentPrompt: preset.agentPrompt,
    instructionsMd: preset.instructionsMd,
    starterPrompt: preset.starterPrompt,
    starterPromptPlaceholder: preset.starterPromptPlaceholder,
    repositoryOptional: preset.repositoryOptional === true,
    defaultModelOptionId: getOpenCodeModelOption(
      preset.defaultModelOptionId as OpenCodeModelOptionId,
    ).id,
    requiredEnv: removeModelEnvFromPresetRequiredEnv(preset.id),
    contentMode: 'final',
  }
}

export const agentPersonaModuleMap = Object.fromEntries(
  openCodeAgentPresets.map((preset) => [
    preset.id,
    createPersonaModuleFromBuiltin(preset.id),
  ]),
) as Record<string, AgentPersonaModule>

const skillEntries = openCodeAgentPresets.flatMap((preset) =>
  preset.skills.map((skill) => [
    skill.id,
    {
      id: skill.id,
      label: skill.name,
      description: skill.description,
      skill,
    } satisfies ManagedSkillModule,
  ]),
)

export const managedSkillModuleMap = Object.fromEntries(
  skillEntries,
) as Record<string, ManagedSkillModule>

const mcpEntries = openCodeAgentPresets.flatMap((preset) =>
  Object.entries(preset.mcp).map(([mcpKey, mcp]) => [
    `${preset.id}:${mcpKey}`,
    {
      id: `${preset.id}:${mcpKey}`,
      label: mcpKey,
      description: `Managed MCP module '${mcpKey}' from ${preset.label}.`,
      mcpKey,
      mcp,
    } satisfies ManagedMcpModule,
  ]),
)

export const managedMcpModuleMap = Object.fromEntries(
  mcpEntries,
) as Record<string, ManagedMcpModule>

const bootstrapEntries = openCodeAgentPresets
  .filter((preset) => Boolean(preset.workspaceBootstrap))
  .map((preset) => [
    preset.id,
    {
      id: preset.id,
      label: `${preset.label} bootstrap`,
      description: `Workspace bootstrap module from ${preset.label}.`,
      workspaceBootstrap: preset.workspaceBootstrap!,
    } satisfies WorkspaceBootstrapModule,
  ])

export const workspaceBootstrapModuleMap = Object.fromEntries(
  bootstrapEntries,
) as Record<string, WorkspaceBootstrapModule>

export const builtinMarketplaceBlueprints = Object.fromEntries(
  openCodeAgentPresets.map((preset) => [
    preset.id,
    {
      id: preset.id,
      slug: preset.id,
      composition: {
        personaModuleId: preset.id,
        starterPrompt: preset.starterPrompt,
        starterPromptPlaceholder: preset.starterPromptPlaceholder,
        repositoryOptional: preset.repositoryOptional === true,
        defaultModelOptionId: getOpenCodeModelOption(
          preset.defaultModelOptionId as OpenCodeModelOptionId,
        ).id,
        skillModuleIds: preset.skills.map((skill) => skill.id),
        mcpModuleIds: Object.keys(preset.mcp).map(
          (mcpKey) => `${preset.id}:${mcpKey}`,
        ),
        workspaceBootstrapModuleIds: preset.workspaceBootstrap
          ? [preset.id]
          : [],
      },
    } satisfies BuiltinMarketplaceBlueprint,
  ]),
) as Record<string, BuiltinMarketplaceBlueprint>

export function decodeMarketplaceLaunchSelection(
  input: unknown,
): MarketplaceLaunchSelection {
  return Schema.decodeUnknownSync(MarketplaceLaunchSelectionSchema)(input)
}

export function decodeAgentComposition(input: unknown): AgentComposition {
  const composition = Schema.decodeUnknownSync(AgentCompositionSchema)(input) as {
    personaModuleId: string
    customAgentPrompt?: string
    customInstructionsMd?: string
    starterPrompt: string
    starterPromptPlaceholder: string
    repositoryOptional: boolean
    defaultModelOptionId: string
    skillModuleIds: Array<string>
    mcpModuleIds: Array<string>
    workspaceBootstrapModuleIds: Array<string>
  }

  if (!agentPersonaModuleMap[composition.personaModuleId]) {
    throw new Error('Choose a supported persona module.')
  }

  if (composition.workspaceBootstrapModuleIds.length > 1) {
    throw new Error('Choose at most one workspace bootstrap module.')
  }

  for (const skillId of composition.skillModuleIds) {
    if (!managedSkillModuleMap[skillId]) {
      throw new Error(`Unknown managed skill module '${skillId}'.`)
    }
  }

  for (const mcpId of composition.mcpModuleIds) {
    if (!managedMcpModuleMap[mcpId]) {
      throw new Error(`Unknown managed MCP module '${mcpId}'.`)
    }
  }

  for (const bootstrapId of composition.workspaceBootstrapModuleIds) {
    if (!workspaceBootstrapModuleMap[bootstrapId]) {
      throw new Error(`Unknown workspace bootstrap module '${bootstrapId}'.`)
    }
  }

  return {
    ...composition,
    customAgentPrompt: trimOptional(composition.customAgentPrompt),
    customInstructionsMd: trimOptional(composition.customInstructionsMd),
    starterPrompt: composition.starterPrompt.trim(),
    starterPromptPlaceholder: composition.starterPromptPlaceholder.trim(),
    defaultModelOptionId: getOpenCodeModelOption(
      composition.defaultModelOptionId,
    ).id,
    skillModuleIds: getUniqueStrings(composition.skillModuleIds),
    mcpModuleIds: getUniqueStrings(composition.mcpModuleIds),
    workspaceBootstrapModuleIds: getUniqueStrings(
      composition.workspaceBootstrapModuleIds,
    ),
  }
}

export function createDefaultAgentComposition(
  personaModuleId = 'general-engineer',
): AgentComposition {
  const persona = agentPersonaModuleMap[personaModuleId]

  if (!persona) {
    throw new Error('Choose a supported persona module.')
  }

  return {
    personaModuleId: persona.id,
    starterPrompt: persona.starterPrompt,
    starterPromptPlaceholder: persona.starterPromptPlaceholder,
    repositoryOptional: persona.repositoryOptional,
    defaultModelOptionId: persona.defaultModelOptionId,
    skillModuleIds: [],
    mcpModuleIds: [],
    workspaceBootstrapModuleIds: [],
  }
}

export function buildMarketplaceDefinitionId(args: {
  slug: string
  sourceKind: Exclude<AgentSourceKind, 'builtin'>
}) {
  const sourcePrefix =
    args.sourceKind === 'marketplace_version'
      ? 'marketplace'
      : 'marketplace-draft'

  return `${sourcePrefix}-${args.slug}`
}

export function normalizeMarketplaceSlug(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  if (!normalized) {
    throw new Error('Enter a slug for this agent.')
  }

  return normalized
}

export function compileMarketplaceAgentDefinition(args: {
  metadata: MarketplaceAgentMetadata
  composition: AgentComposition
  sourceKind: Exclude<AgentSourceKind, 'builtin'>
}): LaunchableAgentDefinition {
  const composition = decodeAgentComposition(args.composition)
  const persona = agentPersonaModuleMap[composition.personaModuleId]
  const modelOption = getOpenCodeModelOption(composition.defaultModelOptionId)
  const skills = composition.skillModuleIds.map(
    (skillId) => managedSkillModuleMap[skillId].skill,
  )
  const mcpModules = composition.mcpModuleIds.map(
    (mcpId) => managedMcpModuleMap[mcpId],
  )
  const workspaceBootstrapId = composition.workspaceBootstrapModuleIds[0]
  const workspaceBootstrap = workspaceBootstrapId
    ? workspaceBootstrapModuleMap[workspaceBootstrapId].workspaceBootstrap
    : undefined
  const requiredEnv = getUniqueStrings([
    ...persona.requiredEnv,
    ...modelOption.requiredEnv,
    ...mcpModules.flatMap((module) => module.mcp.env ?? []),
  ])
  const mcp = Object.fromEntries(
    mcpModules.map((module) => [module.mcpKey, module.mcp]),
  )

  return {
    id: buildMarketplaceDefinitionId({
      slug: normalizeMarketplaceSlug(args.metadata.slug),
      sourceKind: args.sourceKind,
    }),
    label: args.metadata.name.trim(),
    description: args.metadata.shortDescription.trim(),
    repositoryOptional: composition.repositoryOptional,
    defaultModelOptionId: modelOption.id,
    provider: modelOption.provider,
    model: modelOption.model,
    requiredEnv,
    agentPrompt: [persona.agentPrompt, trimOptional(composition.customAgentPrompt)]
      .filter(Boolean)
      .join(' '),
    instructionsMd: [
      persona.instructionsMd,
      trimOptional(composition.customInstructionsMd),
    ]
      .filter(Boolean)
      .join('\n\n'),
    starterPrompt: composition.starterPrompt,
    starterPromptPlaceholder: composition.starterPromptPlaceholder,
    skills,
    mcp,
    ...(workspaceBootstrap ? { workspaceBootstrap } : {}),
  }
}

export function getBuiltinMarketplaceMetadata(
  presetId: string,
): MarketplaceAgentMetadata {
  const preset = getOpenCodeAgentPreset(presetId)

  return {
    slug: preset.id,
    name: preset.label,
    shortDescription: preset.description,
    descriptionMd: preset.instructionsMd,
    tags: ['verified', 'builtin'],
    icon: 'pie',
  }
}

export function compileBuiltinMarketplaceDefinition(presetId: string) {
  return getOpenCodeAgentPreset(presetId)
}

export function getBuiltinMarketplaceComposition(presetId: string) {
  const blueprint = builtinMarketplaceBlueprints[presetId]

  if (!blueprint) {
    throw new Error('Choose a supported BuddyPie preset.')
  }

  return blueprint.composition
}

export function getBuiltinMarketplaceEntries() {
  return openCodeAgentPresets.map((preset) => ({
    kind: 'builtin' as const,
    sourceKind: 'builtin' as const,
    presetId: preset.id,
    slug: preset.id,
    name: preset.label,
    shortDescription: preset.description,
    tags: ['verified', 'builtin'],
    icon: 'pie',
    reviewStatus: 'approved' as MarketplaceReviewStatus,
    publicStatus: 'published' as MarketplacePublicStatus,
    publishedAt: null,
    composition: getBuiltinMarketplaceComposition(preset.id),
    definition: compileBuiltinMarketplaceDefinition(preset.id),
  }))
}
