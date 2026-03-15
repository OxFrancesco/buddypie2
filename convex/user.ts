import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getCurrentUserRecord, requireIdentity } from './lib/auth'

export const userRecordValidator = v.object({
  _id: v.id('users'),
  _creationTime: v.number(),
  tokenIdentifier: v.string(),
  clerkUserId: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  lastSeenAt: v.number(),
})

export const ensureCurrentUser = mutation({
  args: {},
  returns: userRecordValidator,
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const existing = await getCurrentUserRecord(ctx)
    const now = Date.now()
    const displayName = identity.name ?? identity.preferredUsername
    const userData = {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      lastSeenAt: now,
      ...(identity.email ? { email: identity.email } : {}),
      ...(displayName ? { name: displayName } : {}),
      ...(identity.pictureUrl ? { imageUrl: identity.pictureUrl } : {}),
    }

    if (existing) {
      await ctx.db.patch(existing._id, userData)

      const updatedUser = await ctx.db.get(existing._id)
      if (!updatedUser) {
        throw new ConvexError('Failed to refresh your profile.')
      }

      return updatedUser
    }

    const userId = await ctx.db.insert('users', userData)
    const createdUser = await ctx.db.get(userId)

    if (!createdUser) {
      throw new ConvexError('Failed to create your profile.')
    }

    return createdUser
  },
})

export const current = query({
  args: {},
  returns: v.union(userRecordValidator, v.null()),
  handler: async (ctx) => {
    return await getCurrentUserRecord(ctx)
  },
})

export const profile = query({
  args: {},
  returns: v.union(userRecordValidator, v.null()),
  handler: async (ctx) => {
    return await getCurrentUserRecord(ctx)
  },
})
