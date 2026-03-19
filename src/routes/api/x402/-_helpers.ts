import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import { getAuthenticatedConvexClient } from '~/lib/server/authenticated-convex'

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function parseJsonBody<T>(request: Request) {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export async function getAuthenticatedRouteContext() {
  try {
    const context = await getAuthenticatedConvexClient()
    await context.convex.mutation(api.user.ensureCurrentUser, {})

    return {
      ok: true as const,
      ...context,
    }
  } catch (error) {
    return {
      ok: false as const,
      response: jsonError(
        error instanceof Error ? error.message : 'You must be signed in to continue.',
        401,
      ),
    }
  }
}

export async function getOwnedSandboxRouteContext(sandboxId: string) {
  const auth = await getAuthenticatedRouteContext()

  if (!auth.ok) {
    return auth
  }

  const sandbox = await auth.convex.query(api.sandboxes.get, {
    sandboxId: sandboxId as Id<'sandboxes'>,
  })

  if (!sandbox) {
    return {
      ok: false as const,
      response: jsonError('Sandbox not found.', 404),
    }
  }

  return {
    ...auth,
    sandbox,
  }
}
