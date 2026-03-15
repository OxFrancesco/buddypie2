import { ConvexError } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type AuthCtx = QueryCtx | MutationCtx

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new ConvexError('You must be signed in to continue.')
  }

  return identity
}

export async function getCurrentUserRecord(
  ctx: AuthCtx,
): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    return null
  }

  return await ctx.db
    .query('users')
    .withIndex('by_token_identifier', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()
}

export async function requireCurrentUserRecord(ctx: AuthCtx) {
  const user = await getCurrentUserRecord(ctx)

  if (!user) {
    throw new ConvexError(
      'Your account is still syncing. Refresh the page and try again.',
    )
  }

  return user
}
