import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { getCurrentUserRecord, requireCurrentUserRecord } from './lib/auth'

export const sandboxRecordValidator = v.object({
  _id: v.id('sandboxes'),
  _creationTime: v.number(),
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
})

async function getOwnedSandbox(
  ctx: MutationCtx,
  sandboxId: Id<'sandboxes'>,
): Promise<Doc<'sandboxes'>> {
  const user = await requireCurrentUserRecord(ctx)
  const sandbox = await ctx.db.get(sandboxId)

  if (!sandbox || sandbox.userId !== user._id) {
    throw new ConvexError('Sandbox not found.')
  }

  return sandbox
}

export const list = query({
  args: {},
  returns: v.array(sandboxRecordValidator),
  handler: async (ctx) => {
    const user = await getCurrentUserRecord(ctx)

    if (!user) {
      return []
    }

    return await ctx.db
      .query('sandboxes')
      .withIndex('by_user_and_created_at', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(25)
  },
})

export const get = query({
  args: {
    sandboxId: v.id('sandboxes'),
  },
  returns: v.union(sandboxRecordValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserRecord(ctx)

    if (!user) {
      return null
    }

    const sandbox = await ctx.db.get(args.sandboxId)

    if (!sandbox || sandbox.userId !== user._id) {
      return null
    }

    return sandbox
  },
})

export const createPending = mutation({
  args: {
    repoUrl: v.string(),
    repoName: v.string(),
    repoBranch: v.optional(v.string()),
    repoProvider: v.union(v.literal('github'), v.literal('git')),
  },
  returns: sandboxRecordValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUserRecord(ctx)
    const now = Date.now()
    const sandboxId = await ctx.db.insert('sandboxes', {
      userId: user._id,
      repoUrl: args.repoUrl,
      repoName: args.repoName,
      repoProvider: args.repoProvider,
      status: 'creating',
      createdAt: now,
      updatedAt: now,
      ...(args.repoBranch ? { repoBranch: args.repoBranch } : {}),
    })

    const sandbox = await ctx.db.get(sandboxId)

    if (!sandbox) {
      throw new ConvexError('Failed to create a sandbox record.')
    }

    return sandbox
  },
})

export const markReady = mutation({
  args: {
    sandboxId: v.id('sandboxes'),
    daytonaSandboxId: v.string(),
    previewUrl: v.string(),
    workspacePath: v.string(),
  },
  returns: sandboxRecordValidator,
  handler: async (ctx, args) => {
    await getOwnedSandbox(ctx, args.sandboxId)

    await ctx.db.patch(args.sandboxId, {
      status: 'ready',
      daytonaSandboxId: args.daytonaSandboxId,
      previewUrl: args.previewUrl,
      workspacePath: args.workspacePath,
      updatedAt: Date.now(),
    })

    const sandbox = await ctx.db.get(args.sandboxId)

    if (!sandbox) {
      throw new ConvexError('Sandbox not found after launch.')
    }

    return sandbox
  },
})

export const markFailed = mutation({
  args: {
    sandboxId: v.id('sandboxes'),
    errorMessage: v.string(),
  },
  returns: sandboxRecordValidator,
  handler: async (ctx, args) => {
    await getOwnedSandbox(ctx, args.sandboxId)

    await ctx.db.patch(args.sandboxId, {
      status: 'failed',
      errorMessage: args.errorMessage,
      updatedAt: Date.now(),
    })

    const sandbox = await ctx.db.get(args.sandboxId)

    if (!sandbox) {
      throw new ConvexError('Sandbox not found after failure.')
    }

    return sandbox
  },
})

export const remove = mutation({
  args: {
    sandboxId: v.id('sandboxes'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOwnedSandbox(ctx, args.sandboxId)
    await ctx.db.delete(args.sandboxId)
    return null
  },
})
