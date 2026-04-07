import { createServerFn } from '@tanstack/react-start'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import type { AgentComposition } from '~/lib/opencode/marketplace'
import { getAuthenticatedConvexClient } from '~/lib/server/authenticated-convex'
import {
  buildApprovedMarketplaceSnapshot,
  createMarketplaceDraftDefaults,
  createMarketplaceDraftFromBuiltin,
  createMarketplaceDraftFromPublishedVersion,
  isMarketplaceReviewer,
  normalizeMarketplaceDraftInput,
} from '~/lib/server/marketplace'

type MarketplaceDraftPayload = {
  slug: string
  name: string
  shortDescription: string
  descriptionMd?: string
  tags?: Array<string>
  icon?: string
  draftComposition: AgentComposition
}

type MarketplaceDraftMutationInput = MarketplaceDraftPayload & {
  agentId: string
}

type CloneBuiltinInput = {
  builtinPresetId: string
}

type ClonePublishedInput = {
  sourceAgentId: string
  sourceVersionId: string
}

type ReviewInput = {
  agentId: string
  reviewNotes?: string
  releaseNotes?: string
}

type AgentOnlyInput = {
  agentId: string
}

export const readMarketplaceViewerAccess = createServerFn({
  method: 'GET',
}).handler(async () => {
  const client = await getAuthenticatedConvexClient()

  return {
    isReviewer: isMarketplaceReviewer(client.userId),
  }
})

export const createMarketplaceDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: MarketplaceDraftPayload) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})
    const normalized = normalizeMarketplaceDraftInput(data)

    return await convex.mutation(api.marketplace.createDraft, {
      ...normalized,
      tags: normalized.tags ?? [],
      defaultModelOptionId: normalized.draftComposition.defaultModelOptionId,
    })
  })

export const updateMarketplaceDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: MarketplaceDraftMutationInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})
    const normalized = normalizeMarketplaceDraftInput(data)

    return await convex.mutation(api.marketplace.updateDraft, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
      ...normalized,
      tags: normalized.tags ?? [],
      defaultModelOptionId: normalized.draftComposition.defaultModelOptionId,
    })
  })

export const createDefaultMarketplaceDraft = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { convex } = await getAuthenticatedConvexClient()
  await convex.mutation(api.user.ensureCurrentUser, {})
  const defaults = createMarketplaceDraftDefaults()
  return await convex.mutation(api.marketplace.createDraft, {
    ...defaults,
    tags: defaults.tags ?? [],
    defaultModelOptionId: defaults.draftComposition.defaultModelOptionId,
  })
})

export const cloneBuiltinMarketplaceAgent = createServerFn({ method: 'POST' })
  .inputValidator((data: CloneBuiltinInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})
    const draft = createMarketplaceDraftFromBuiltin(data.builtinPresetId)

    return await convex.mutation(api.marketplace.cloneBuiltin, {
      ...draft,
      tags: draft.tags ?? [],
      defaultModelOptionId: draft.draftComposition.defaultModelOptionId,
      builtinPresetId: data.builtinPresetId,
    })
  })

export const clonePublishedMarketplaceAgent = createServerFn({
  method: 'POST',
})
  .inputValidator((data: ClonePublishedInput) => data)
  .handler(async ({ data }) => {
    const client = await getAuthenticatedConvexClient()
    await client.convex.mutation(api.user.ensureCurrentUser, {})
    const draft = await createMarketplaceDraftFromPublishedVersion({
      convex: client.convex,
      sourceAgentId: data.sourceAgentId as Id<'marketplaceAgents'>,
      sourceVersionId: data.sourceVersionId as Id<'marketplaceAgentVersions'>,
    })

    return await client.convex.mutation(api.marketplace.clonePublishedAgent, {
      sourceAgentId: data.sourceAgentId as Id<'marketplaceAgents'>,
      sourceVersionId: data.sourceVersionId as Id<'marketplaceAgentVersions'>,
      ...draft,
      tags: draft.tags ?? [],
      defaultModelOptionId: draft.draftComposition.defaultModelOptionId,
    })
  })

export const submitMarketplaceDraftForReview = createServerFn({
  method: 'POST',
})
  .inputValidator((data: AgentOnlyInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})

    return await convex.mutation(api.marketplace.submitForReview, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
    })
  })

export const approveMarketplaceDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: ReviewInput) => data)
  .handler(async ({ data }) => {
    const client = await getAuthenticatedConvexClient()

    if (!isMarketplaceReviewer(client.userId)) {
      throw new Error('Only Marketplace reviewers can do that.')
    }

    const snapshot = await buildApprovedMarketplaceSnapshot({
      convex: client.convex,
      agentId: data.agentId as Id<'marketplaceAgents'>,
    })

    return await client.convex.mutation(api.marketplace.approvePublish, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
      compositionSnapshot: snapshot.compositionSnapshot,
      resolvedDefinitionSnapshot: snapshot.resolvedDefinitionSnapshot,
      ...(data.releaseNotes?.trim()
        ? { releaseNotes: data.releaseNotes.trim() }
        : {}),
      ...(data.reviewNotes?.trim()
        ? { reviewNotes: data.reviewNotes.trim() }
        : {}),
    })
  })

export const rejectMarketplaceDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: ReviewInput) => data)
  .handler(async ({ data }) => {
    const client = await getAuthenticatedConvexClient()

    if (!isMarketplaceReviewer(client.userId)) {
      throw new Error('Only Marketplace reviewers can do that.')
    }

    const reviewNotes = data.reviewNotes?.trim()

    if (!reviewNotes) {
      throw new Error('Enter review notes before rejecting a draft.')
    }

    return await client.convex.mutation(api.marketplace.rejectReview, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
      reviewNotes,
    })
  })

export const unpublishMarketplaceAgent = createServerFn({ method: 'POST' })
  .inputValidator((data: AgentOnlyInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})

    return await convex.mutation(api.marketplace.unpublish, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
    })
  })

export const deleteMarketplaceDraft = createServerFn({ method: 'POST' })
  .inputValidator((data: AgentOnlyInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})

    return await convex.mutation(api.marketplace.deleteDraft, {
      agentId: data.agentId as Id<'marketplaceAgents'>,
    })
  })
