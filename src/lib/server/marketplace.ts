import { api } from 'convex/_generated/api'
import type { Doc, Id } from 'convex/_generated/dataModel'
import type { getAuthenticatedConvexClient } from '~/lib/server/authenticated-convex'
import {
  compileMarketplaceAgentDefinition,
  createDefaultAgentComposition,
  decodeAgentComposition,
  decodeMarketplaceLaunchSelection,
  getBuiltinMarketplaceComposition,
  getBuiltinMarketplaceMetadata,
  normalizeMarketplaceSlug,
  type AgentComposition,
  type MarketplaceLaunchSelection,
  type MarketplaceAgentMetadata,
} from '~/lib/opencode/marketplace'
import { getOpenCodeAgentPreset } from '~/lib/opencode/presets'

type AuthenticatedConvexClient = Awaited<
  ReturnType<typeof getAuthenticatedConvexClient>
>

export type MarketplaceDraftInput = {
  slug: string
  name: string
  shortDescription: string
  descriptionMd?: string
  tags?: Array<string>
  icon?: string
  draftComposition: AgentComposition
}

export type ResolvedMarketplaceLaunch = {
  sourceKind: 'builtin' | 'marketplace_draft' | 'marketplace_version'
  definition: Doc<'marketplaceAgentVersions'>['resolvedDefinitionSnapshot'] | ReturnType<typeof getOpenCodeAgentPreset>
  marketplaceAgentId?: Id<'marketplaceAgents'>
  marketplaceVersionId?: Id<'marketplaceAgentVersions'>
}

function trimRequired(value: string, label: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error(`Enter ${label}.`)
  }

  return trimmed
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeTags(tags?: Array<string>) {
  return Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
    ),
  )
}

export function isMarketplaceReviewer(clerkUserId: string) {
  return new Set(
    (process.env.MARKETPLACE_REVIEWER_CLERK_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ).has(clerkUserId)
}

export function normalizeMarketplaceDraftInput(
  input: MarketplaceDraftInput,
): MarketplaceDraftInput {
  const composition = decodeAgentComposition(input.draftComposition)

  return {
    slug: normalizeMarketplaceSlug(input.slug),
    name: trimRequired(input.name, 'a Marketplace agent name'),
    shortDescription: trimRequired(
      input.shortDescription,
      'a Marketplace summary',
    ),
    ...(normalizeOptional(input.descriptionMd)
      ? { descriptionMd: normalizeOptional(input.descriptionMd) }
      : {}),
    tags: normalizeTags(input.tags),
    ...(normalizeOptional(input.icon)
      ? { icon: normalizeOptional(input.icon) }
      : {}),
    draftComposition: composition,
  }
}

export function createMarketplaceDraftFromBuiltin(presetId: string) {
  const metadata = getBuiltinMarketplaceMetadata(presetId)

  return normalizeMarketplaceDraftInput({
    slug: `${metadata.slug}-copy`,
    name: `${metadata.name} Copy`,
    shortDescription: metadata.shortDescription,
    descriptionMd: metadata.descriptionMd,
    tags: ['clone'],
    icon: metadata.icon,
    draftComposition: getBuiltinMarketplaceComposition(presetId),
  })
}

export function createMarketplaceDraftDefaults() {
  return normalizeMarketplaceDraftInput({
    slug: 'my-agent',
    name: 'My Agent',
    shortDescription: 'A custom BuddyPie agent built from curated modules.',
    descriptionMd: '',
    tags: [],
    icon: 'wand',
    draftComposition: createDefaultAgentComposition(),
  })
}

export function buildMarketplaceMetadataFromAgent(
  agent: Pick<
    Doc<'marketplaceAgents'>,
    'slug' | 'name' | 'shortDescription' | 'descriptionMd' | 'tags' | 'icon'
  >,
): MarketplaceAgentMetadata {
  return {
    slug: agent.slug,
    name: agent.name,
    shortDescription: agent.shortDescription,
    ...(agent.descriptionMd ? { descriptionMd: agent.descriptionMd } : {}),
    tags: agent.tags,
    ...(agent.icon ? { icon: agent.icon } : {}),
  }
}

export async function createMarketplaceDraftFromPublishedVersion(args: {
  convex: AuthenticatedConvexClient['convex']
  sourceAgentId: Id<'marketplaceAgents'>
  sourceVersionId: Id<'marketplaceAgentVersions'>
}) {
  const [agent, version] = await Promise.all([
    args.convex.query(api.marketplace.getById, {
      agentId: args.sourceAgentId,
    }),
    args.convex.query(api.marketplace.publishedVersionById, {
      versionId: args.sourceVersionId,
    }),
  ])

  if (!agent || !version || version.agentId !== agent._id) {
    throw new Error('Published Marketplace agent not found.')
  }

  return normalizeMarketplaceDraftInput({
    slug: `${agent.slug}-copy`,
    name: `${agent.name} Copy`,
    shortDescription: agent.shortDescription,
    descriptionMd: agent.descriptionMd,
    tags: ['clone'],
    icon: agent.icon,
    draftComposition: decodeAgentComposition(version.compositionSnapshot),
  })
}

export async function buildApprovedMarketplaceSnapshot(args: {
  convex: AuthenticatedConvexClient['convex']
  agentId: Id<'marketplaceAgents'>
}) {
  const agent = await args.convex.query(api.marketplace.getById, {
    agentId: args.agentId,
  })

  if (!agent) {
    throw new Error('Marketplace draft not found.')
  }

  const composition = decodeAgentComposition(agent.draftComposition)
  const resolvedDefinitionSnapshot = compileMarketplaceAgentDefinition({
    metadata: buildMarketplaceMetadataFromAgent(agent),
    composition,
    sourceKind: 'marketplace_version',
  })

  return {
    agent,
    compositionSnapshot: composition,
    resolvedDefinitionSnapshot,
  }
}

export async function resolveMarketplaceLaunchSelection(args: {
  client: AuthenticatedConvexClient
  selection: MarketplaceLaunchSelection
}): Promise<ResolvedMarketplaceLaunch> {
  const selection = decodeMarketplaceLaunchSelection(args.selection)

  if (selection.kind === 'builtin') {
    return {
      sourceKind: 'builtin',
      definition: getOpenCodeAgentPreset(selection.builtinPresetId),
    }
  }

  const currentUser = await args.client.convex.query(api.user.current, {})

  if (!currentUser) {
    throw new Error('You must be signed in to continue.')
  }

  if (selection.kind === 'marketplace_draft') {
    const agent = await args.client.convex.query(api.marketplace.getById, {
      agentId: selection.marketplaceAgentId as Id<'marketplaceAgents'>,
    })

    if (!agent || agent.creatorUserId !== currentUser._id) {
      throw new Error('Marketplace draft not found.')
    }

    return {
      sourceKind: 'marketplace_draft',
      definition: compileMarketplaceAgentDefinition({
        metadata: buildMarketplaceMetadataFromAgent(agent),
        composition: decodeAgentComposition(agent.draftComposition),
        sourceKind: 'marketplace_draft',
      }),
      marketplaceAgentId: agent._id,
    }
  }

  const agent = await args.client.convex.query(api.marketplace.getById, {
    agentId: selection.marketplaceAgentId as Id<'marketplaceAgents'>,
  })

  if (!agent || agent.publicStatus !== 'published') {
    throw new Error('Published Marketplace agent not found.')
  }

  const versionId =
    (selection.marketplaceVersionId as Id<'marketplaceAgentVersions'> | undefined) ??
    agent.currentPublishedVersionId

  if (!versionId) {
    throw new Error('Published Marketplace version not found.')
  }

  const version = await args.client.convex.query(
    api.marketplace.publishedVersionById,
    {
      versionId,
    },
  )

  if (!version || version.agentId !== agent._id) {
    throw new Error('Published Marketplace version not found.')
  }

  return {
    sourceKind: 'marketplace_version',
    definition: version.resolvedDefinitionSnapshot,
    marketplaceAgentId: agent._id,
    marketplaceVersionId: version._id,
  }
}
