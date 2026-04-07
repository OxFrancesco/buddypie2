import { ConvexError, v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { getCurrentUserRecord, requireCurrentUserRecord } from './lib/auth'

const openCodeSkillPermissionValidator = v.union(
  v.literal('allow'),
  v.literal('ask'),
  v.literal('deny'),
)

const openCodeManagedSkillValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  content: v.string(),
  permission: v.optional(openCodeSkillPermissionValidator),
})

const openCodeManagedMcpValidator = v.object({
  command: v.string(),
  args: v.optional(v.array(v.string())),
  env: v.optional(v.array(v.string())),
})

const openCodeWorkspaceBootstrapValidator = v.object({
  kind: v.literal('fumadocs-docs-app'),
  sourceRepoUrl: v.string(),
  sourceRepoBranch: v.string(),
  sourceRepoPath: v.string(),
  docsTemplate: v.literal('tanstack-start'),
  preferredDocsPath: v.string(),
  fallbackDocsPath: v.string(),
  packageManager: v.union(v.literal('bun'), v.literal('npm')),
})

const marketplaceCompositionValidator = v.object({
  personaModuleId: v.string(),
  customAgentPrompt: v.optional(v.string()),
  customInstructionsMd: v.optional(v.string()),
  starterPrompt: v.string(),
  starterPromptPlaceholder: v.string(),
  repositoryOptional: v.boolean(),
  defaultModelOptionId: v.string(),
  skillModuleIds: v.array(v.string()),
  mcpModuleIds: v.array(v.string()),
  workspaceBootstrapModuleIds: v.array(v.string()),
})

const launchableAgentDefinitionValidator = v.object({
  id: v.string(),
  label: v.string(),
  description: v.string(),
  repositoryOptional: v.optional(v.boolean()),
  defaultModelOptionId: v.string(),
  provider: v.string(),
  model: v.string(),
  requiredEnv: v.array(v.string()),
  agentPrompt: v.string(),
  instructionsMd: v.string(),
  starterPrompt: v.string(),
  starterPromptPlaceholder: v.string(),
  skills: v.array(openCodeManagedSkillValidator),
  mcp: v.record(v.string(), openCodeManagedMcpValidator),
  workspaceBootstrap: v.optional(openCodeWorkspaceBootstrapValidator),
})

export const marketplaceAgentValidator = v.object({
  _id: v.id('marketplaceAgents'),
  _creationTime: v.number(),
  creatorUserId: v.id('users'),
  slug: v.string(),
  name: v.string(),
  shortDescription: v.string(),
  descriptionMd: v.optional(v.string()),
  tags: v.array(v.string()),
  icon: v.optional(v.string()),
  draftComposition: marketplaceCompositionValidator,
  defaultModelOptionId: v.string(),
  reviewStatus: v.union(
    v.literal('draft'),
    v.literal('pending_review'),
    v.literal('changes_requested'),
    v.literal('approved'),
  ),
  publicStatus: v.union(v.literal('private'), v.literal('published')),
  currentPublishedVersionId: v.optional(v.id('marketplaceAgentVersions')),
  publishedAt: v.optional(v.number()),
  reviewerUserId: v.optional(v.id('users')),
  reviewNotes: v.optional(v.string()),
  clonedFromKind: v.optional(
    v.union(v.literal('builtin'), v.literal('marketplace_version')),
  ),
  clonedFromBuiltinPresetId: v.optional(v.string()),
  clonedFromAgentId: v.optional(v.id('marketplaceAgents')),
  clonedFromVersionId: v.optional(v.id('marketplaceAgentVersions')),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const marketplaceAgentVersionValidator = v.object({
  _id: v.id('marketplaceAgentVersions'),
  _creationTime: v.number(),
  agentId: v.id('marketplaceAgents'),
  versionNumber: v.number(),
  compositionSnapshot: marketplaceCompositionValidator,
  resolvedDefinitionSnapshot: launchableAgentDefinitionValidator,
  releaseNotes: v.optional(v.string()),
  reviewerUserId: v.id('users'),
  approvedAt: v.number(),
  publishedAt: v.number(),
  createdAt: v.number(),
})

function parseReviewerClerkIds() {
  return new Set(
    (process.env.MARKETPLACE_REVIEWER_CLERK_USER_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

async function requireReviewer(ctx: any) {
  const user = await requireCurrentUserRecord(ctx)
  const reviewerIds = parseReviewerClerkIds()

  if (!reviewerIds.has(user.clerkUserId)) {
    throw new ConvexError('Only Marketplace reviewers can do that.')
  }

  return user
}

async function requireOwnedAgent(
  ctx: any,
  agentId: Id<'marketplaceAgents'>,
): Promise<Doc<'marketplaceAgents'>> {
  const user = await requireCurrentUserRecord(ctx)
  const agent = await ctx.db.get(agentId)

  if (!agent || agent.creatorUserId !== user._id) {
    throw new ConvexError('Marketplace draft not found.')
  }

  return agent
}

async function ensureUniqueSlug(
  ctx: any,
  slug: string,
  excludeAgentId?: Id<'marketplaceAgents'>,
) {
  const existing = await ctx.db
    .query('marketplaceAgents')
    .withIndex('by_slug', (q: any) => q.eq('slug', slug))
    .unique()

  if (existing && existing._id !== excludeAgentId) {
    throw new ConvexError('That Marketplace slug is already taken.')
  }
}

export const gallery = query({
  args: {},
  returns: v.array(marketplaceAgentValidator),
  handler: async (ctx) => {
    const user = await getCurrentUserRecord(ctx)
    const published = await ctx.db
      .query('marketplaceAgents')
      .withIndex('by_public_status_and_published_at', (q) =>
        q.eq('publicStatus', 'published'),
      )
      .order('desc')
      .take(100)

    if (!user) {
      return published
    }

    const seen = new Set<string>()
    const merged = published.filter((agent) => {
      seen.add(String(agent._id))
      return true
    })
    const mine = await ctx.db
      .query('marketplaceAgents')
      .withIndex('by_creator_and_updated_at', (q) =>
        q.eq('creatorUserId', user._id),
      )
      .order('desc')
      .take(50)

    for (const agent of mine) {
      if (!seen.has(String(agent._id))) {
        merged.push(agent)
      }
    }

    return merged
  },
})

export const myAgents = query({
  args: {},
  returns: v.array(marketplaceAgentValidator),
  handler: async (ctx) => {
    const user = await getCurrentUserRecord(ctx)

    if (!user) {
      return []
    }

    return await ctx.db
      .query('marketplaceAgents')
      .withIndex('by_creator_and_updated_at', (q) =>
        q.eq('creatorUserId', user._id),
      )
      .order('desc')
      .take(100)
  },
})

export const reviewerQueue = query({
  args: {},
  returns: v.array(marketplaceAgentValidator),
  handler: async (ctx) => {
    await requireReviewer(ctx)

    return await ctx.db
      .query('marketplaceAgents')
      .withIndex('by_review_status_and_updated_at', (q) =>
        q.eq('reviewStatus', 'pending_review'),
      )
      .order('desc')
      .take(100)
  },
})

export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(marketplaceAgentValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserRecord(ctx)
    const agent = await ctx.db
      .query('marketplaceAgents')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!agent) {
      return null
    }

    if (agent.publicStatus === 'published') {
      return agent
    }

    const reviewerIds = parseReviewerClerkIds()
    const isReviewer = user ? reviewerIds.has(user.clerkUserId) : false

    if (user && (agent.creatorUserId === user._id || isReviewer)) {
      return agent
    }

    return null
  },
})

export const getById = query({
  args: {
    agentId: v.id('marketplaceAgents'),
  },
  returns: v.union(marketplaceAgentValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserRecord(ctx)
    const agent = await ctx.db.get(args.agentId)

    if (!agent) {
      return null
    }

    if (agent.publicStatus === 'published') {
      return agent
    }

    const reviewerIds = parseReviewerClerkIds()
    const isReviewer = user ? reviewerIds.has(user.clerkUserId) : false

    if (user && (agent.creatorUserId === user._id || isReviewer)) {
      return agent
    }

    return null
  },
})

export const publishedVersionById = query({
  args: {
    versionId: v.id('marketplaceAgentVersions'),
  },
  returns: v.union(marketplaceAgentVersionValidator, v.null()),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)

    if (!version) {
      return null
    }

    const agent = await ctx.db.get(version.agentId)

    return agent?.publicStatus === 'published' ? version : null
  },
})

export const createDraft = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    shortDescription: v.string(),
    descriptionMd: v.optional(v.string()),
    tags: v.array(v.string()),
    icon: v.optional(v.string()),
    draftComposition: marketplaceCompositionValidator,
    defaultModelOptionId: v.string(),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUserRecord(ctx)
    await ensureUniqueSlug(ctx, args.slug)
    const now = Date.now()
    const agentId = await ctx.db.insert('marketplaceAgents', {
      creatorUserId: user._id,
      slug: args.slug,
      name: args.name,
      shortDescription: args.shortDescription,
      ...(args.descriptionMd ? { descriptionMd: args.descriptionMd } : {}),
      tags: args.tags,
      ...(args.icon ? { icon: args.icon } : {}),
      draftComposition: args.draftComposition,
      defaultModelOptionId: args.defaultModelOptionId,
      reviewStatus: 'draft',
      publicStatus: 'private',
      createdAt: now,
      updatedAt: now,
    })
    const created = await ctx.db.get(agentId)

    if (!created) {
      throw new ConvexError('Could not create the Marketplace draft.')
    }

    return created
  },
})

export const updateDraft = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
    slug: v.string(),
    name: v.string(),
    shortDescription: v.string(),
    descriptionMd: v.optional(v.string()),
    tags: v.array(v.string()),
    icon: v.optional(v.string()),
    draftComposition: marketplaceCompositionValidator,
    defaultModelOptionId: v.string(),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const agent = await requireOwnedAgent(ctx, args.agentId)

    if (agent.reviewStatus === 'pending_review') {
      throw new ConvexError(
        'This draft is locked while it is pending Marketplace review.',
      )
    }

    await ensureUniqueSlug(ctx, args.slug, agent._id)
    await ctx.db.patch(agent._id, {
      slug: args.slug,
      name: args.name,
      shortDescription: args.shortDescription,
      descriptionMd: args.descriptionMd,
      tags: args.tags,
      icon: args.icon,
      draftComposition: args.draftComposition,
      defaultModelOptionId: args.defaultModelOptionId,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(agent._id)

    if (!updated) {
      throw new ConvexError('Could not update the Marketplace draft.')
    }

    return updated
  },
})

export const cloneBuiltin = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    shortDescription: v.string(),
    descriptionMd: v.optional(v.string()),
    tags: v.array(v.string()),
    icon: v.optional(v.string()),
    draftComposition: marketplaceCompositionValidator,
    defaultModelOptionId: v.string(),
    builtinPresetId: v.string(),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUserRecord(ctx)
    await ensureUniqueSlug(ctx, args.slug)
    const now = Date.now()
    const agentId = await ctx.db.insert('marketplaceAgents', {
      creatorUserId: user._id,
      slug: args.slug,
      name: args.name,
      shortDescription: args.shortDescription,
      ...(args.descriptionMd ? { descriptionMd: args.descriptionMd } : {}),
      tags: args.tags,
      ...(args.icon ? { icon: args.icon } : {}),
      draftComposition: args.draftComposition,
      defaultModelOptionId: args.defaultModelOptionId,
      reviewStatus: 'draft',
      publicStatus: 'private',
      clonedFromKind: 'builtin',
      clonedFromBuiltinPresetId: args.builtinPresetId,
      createdAt: now,
      updatedAt: now,
    })
    const created = await ctx.db.get(agentId)

    if (!created) {
      throw new ConvexError('Could not clone the built-in agent.')
    }

    return created
  },
})

export const clonePublishedAgent = mutation({
  args: {
    sourceAgentId: v.id('marketplaceAgents'),
    sourceVersionId: v.id('marketplaceAgentVersions'),
    slug: v.string(),
    name: v.string(),
    shortDescription: v.string(),
    descriptionMd: v.optional(v.string()),
    tags: v.array(v.string()),
    icon: v.optional(v.string()),
    draftComposition: marketplaceCompositionValidator,
    defaultModelOptionId: v.string(),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUserRecord(ctx)
    await ensureUniqueSlug(ctx, args.slug)
    const sourceAgent = await ctx.db.get(args.sourceAgentId)
    const sourceVersion = await ctx.db.get(args.sourceVersionId)

    if (
      !sourceAgent ||
      !sourceVersion ||
      sourceAgent.publicStatus !== 'published' ||
      sourceVersion.agentId !== sourceAgent._id
    ) {
      throw new ConvexError('Published Marketplace agent not found.')
    }

    const now = Date.now()
    const agentId = await ctx.db.insert('marketplaceAgents', {
      creatorUserId: user._id,
      slug: args.slug,
      name: args.name,
      shortDescription: args.shortDescription,
      ...(args.descriptionMd ? { descriptionMd: args.descriptionMd } : {}),
      tags: args.tags,
      ...(args.icon ? { icon: args.icon } : {}),
      draftComposition: args.draftComposition,
      defaultModelOptionId: args.defaultModelOptionId,
      reviewStatus: 'draft',
      publicStatus: 'private',
      clonedFromKind: 'marketplace_version',
      clonedFromAgentId: sourceAgent._id,
      clonedFromVersionId: sourceVersion._id,
      createdAt: now,
      updatedAt: now,
    })
    const created = await ctx.db.get(agentId)

    if (!created) {
      throw new ConvexError('Could not clone that Marketplace agent.')
    }

    return created
  },
})

export const submitForReview = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const agent = await requireOwnedAgent(ctx, args.agentId)

    await ctx.db.patch(agent._id, {
      reviewStatus: 'pending_review',
      publicStatus: 'private',
      reviewNotes: undefined,
      reviewerUserId: undefined,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(agent._id)

    if (!updated) {
      throw new ConvexError('Could not submit this draft for review.')
    }

    return updated
  },
})

export const approvePublish = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
    compositionSnapshot: marketplaceCompositionValidator,
    resolvedDefinitionSnapshot: launchableAgentDefinitionValidator,
    releaseNotes: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
  },
  returns: v.object({
    agent: marketplaceAgentValidator,
    version: marketplaceAgentVersionValidator,
  }),
  handler: async (ctx, args) => {
    const reviewer = await requireReviewer(ctx)
    const agent = await ctx.db.get(args.agentId)

    if (!agent) {
      throw new ConvexError('Marketplace draft not found.')
    }

    const existingVersions = await ctx.db
      .query('marketplaceAgentVersions')
      .withIndex('by_agent_and_version_number', (q) => q.eq('agentId', agent._id))
      .order('desc')
      .take(1)
    const versionNumber =
      (existingVersions[0]?.versionNumber ?? 0) + 1
    const now = Date.now()
    const versionId = await ctx.db.insert('marketplaceAgentVersions', {
      agentId: agent._id,
      versionNumber,
      compositionSnapshot: args.compositionSnapshot,
      resolvedDefinitionSnapshot: args.resolvedDefinitionSnapshot,
      ...(args.releaseNotes ? { releaseNotes: args.releaseNotes } : {}),
      reviewerUserId: reviewer._id,
      approvedAt: now,
      publishedAt: now,
      createdAt: now,
    })

    await ctx.db.patch(agent._id, {
      draftComposition: args.compositionSnapshot,
      defaultModelOptionId: args.compositionSnapshot.defaultModelOptionId,
      reviewStatus: 'approved',
      publicStatus: 'published',
      currentPublishedVersionId: versionId,
      publishedAt: now,
      reviewerUserId: reviewer._id,
      reviewNotes: args.reviewNotes,
      updatedAt: now,
    })

    const updatedAgent = await ctx.db.get(agent._id)
    const version = await ctx.db.get(versionId)

    if (!updatedAgent || !version) {
      throw new ConvexError('Could not publish this Marketplace agent.')
    }

    return {
      agent: updatedAgent,
      version,
    }
  },
})

export const rejectReview = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
    reviewNotes: v.string(),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const reviewer = await requireReviewer(ctx)
    const agent = await ctx.db.get(args.agentId)

    if (!agent) {
      throw new ConvexError('Marketplace draft not found.')
    }

    await ctx.db.patch(agent._id, {
      reviewStatus: 'changes_requested',
      publicStatus: 'private',
      reviewerUserId: reviewer._id,
      reviewNotes: args.reviewNotes,
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(agent._id)

    if (!updated) {
      throw new ConvexError('Could not reject this Marketplace draft.')
    }

    return updated
  },
})

export const unpublish = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
  },
  returns: marketplaceAgentValidator,
  handler: async (ctx, args) => {
    const agent = await requireOwnedAgent(ctx, args.agentId)

    await ctx.db.patch(agent._id, {
      publicStatus: 'private',
      updatedAt: Date.now(),
    })
    const updated = await ctx.db.get(agent._id)

    if (!updated) {
      throw new ConvexError('Could not unpublish this Marketplace agent.')
    }

    return updated
  },
})

export const deleteDraft = mutation({
  args: {
    agentId: v.id('marketplaceAgents'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const agent = await requireOwnedAgent(ctx, args.agentId)

    if (agent.publicStatus === 'published') {
      throw new ConvexError('Unpublish this agent before deleting it.')
    }

    await ctx.db.delete(agent._id)
    return null
  },
})
