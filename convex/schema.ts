import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    lastSeenAt: v.number(),
  })
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_clerk_user_id', ['clerkUserId']),

  sandboxes: defineTable({
    userId: v.id('users'),
    repoUrl: v.string(),
    repoName: v.string(),
    repoBranch: v.optional(v.string()),
    repoProvider: v.union(v.literal('github'), v.literal('git')),
    status: v.union(
      v.literal('creating'),
      v.literal('ready'),
      v.literal('failed'),
    ),
    daytonaSandboxId: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    workspacePath: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user_and_created_at', ['userId', 'createdAt']),
})
