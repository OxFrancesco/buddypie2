import { createServerFn } from '@tanstack/react-start'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import {
  normalizeSandboxInput,
  type CreateSandboxInput,
} from '~/lib/sandboxes'

type SandboxMutationInput = {
  sandboxId: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong while talking to Daytona.'
}

async function getAuthenticatedConvexClient() {
  const [{ auth }, { ConvexHttpClient }] = await Promise.all([
    import('@clerk/tanstack-react-start/server'),
    import('convex/browser'),
  ])
  const session = await auth()

  if (!session.userId) {
    throw new Error('You must be signed in to continue.')
  }

  const token = await session.getToken({ template: 'convex' })
  const convexUrl = process.env.VITE_CONVEX_URL

  if (!token) {
    throw new Error('Your Convex auth token could not be created.')
  }

  if (!convexUrl) {
    throw new Error('VITE_CONVEX_URL is not configured on the server.')
  }

  const convex = new ConvexHttpClient(convexUrl)
  convex.setAuth(token)

  return {
    convex,
    userId: session.userId,
  }
}

async function getGithubAccessToken(userId: string) {
  const { clerkClient } = await import('@clerk/tanstack-react-start/server')
  const client = await clerkClient()
  const tokens = await client.users.getUserOauthAccessToken(userId, 'github')
  return tokens.data[0]?.token ?? null
}

export const checkGithubConnection = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { userId } = await getAuthenticatedConvexClient()
    const githubToken = await getGithubAccessToken(userId)

    return {
      connected: Boolean(githubToken),
      message: githubToken
        ? 'GitHub is connected and ready for private repository imports.'
        : 'Connect GitHub from your Clerk profile to import private repositories.',
    }
  },
)

export const createSandbox = createServerFn({ method: 'POST' })
  .inputValidator((data: CreateSandboxInput) => data)
  .handler(async ({ data }) => {
    const normalized = normalizeSandboxInput(data)
    const { convex, userId } = await getAuthenticatedConvexClient()
    await convex.mutation(api.user.ensureCurrentUser, {})

    const pendingSandbox = await convex.mutation(api.sandboxes.createPending, {
      repoUrl: normalized.repoUrl,
      repoName: normalized.repoName,
      repoBranch: normalized.branch,
      repoProvider: normalized.repoProvider,
    })

    try {
      const githubToken =
        normalized.repoProvider === 'github'
          ? await getGithubAccessToken(userId)
          : null
      const { createOpenCodeSandbox } = await import('~/lib/server/daytona')
      const launched = await createOpenCodeSandbox({
        repoUrl: normalized.repoUrl,
        branch: normalized.branch,
        githubToken,
      })
      const readySandbox = await convex.mutation(api.sandboxes.markReady, {
        sandboxId: pendingSandbox._id,
        daytonaSandboxId: launched.daytonaSandboxId,
        previewUrl: launched.previewUrl,
        workspacePath: launched.workspacePath,
      })

      return {
        sandboxId: readySandbox._id,
        previewUrl: readySandbox.previewUrl ?? launched.previewUrl,
      }
    } catch (error) {
      const message = getErrorMessage(error)

      await convex.mutation(api.sandboxes.markFailed, {
        sandboxId: pendingSandbox._id,
        errorMessage: message,
      })

      throw new Error(message)
    }
  })

export const deleteSandbox = createServerFn({ method: 'POST' })
  .inputValidator((data: SandboxMutationInput) => data)
  .handler(async ({ data }) => {
    const { convex } = await getAuthenticatedConvexClient()
    const sandbox = await convex.query(api.sandboxes.get, {
      sandboxId: data.sandboxId as Id<'sandboxes'>,
    })

    if (!sandbox) {
      throw new Error('Sandbox not found.')
    }

    if (sandbox.daytonaSandboxId) {
      try {
        const { deleteOpenCodeSandbox } = await import('~/lib/server/daytona')
        await deleteOpenCodeSandbox(sandbox.daytonaSandboxId)
      } catch {
        // Best effort cleanup so stale Daytona sandboxes do not block record deletion.
      }
    }

    await convex.mutation(api.sandboxes.remove, {
      sandboxId: sandbox._id,
    })

    return { removed: true as const }
  })

export const restartSandbox = createServerFn({ method: 'POST' })
  .inputValidator((data: SandboxMutationInput) => data)
  .handler(async ({ data }) => {
    const { convex, userId } = await getAuthenticatedConvexClient()
    const sandbox = await convex.query(api.sandboxes.get, {
      sandboxId: data.sandboxId as Id<'sandboxes'>,
    })

    if (!sandbox) {
      throw new Error('Sandbox not found.')
    }

    const pendingSandbox = await convex.mutation(api.sandboxes.createPending, {
      repoUrl: sandbox.repoUrl,
      repoName: sandbox.repoName,
      repoBranch: sandbox.repoBranch,
      repoProvider: sandbox.repoProvider,
    })

    try {
      const githubToken =
        sandbox.repoProvider === 'github'
          ? await getGithubAccessToken(userId)
          : null
      const { createOpenCodeSandbox, deleteOpenCodeSandbox } = await import(
        '~/lib/server/daytona'
      )
      const launched = await createOpenCodeSandbox({
        repoUrl: sandbox.repoUrl,
        branch: sandbox.repoBranch,
        githubToken,
      })
      const readySandbox = await convex.mutation(api.sandboxes.markReady, {
        sandboxId: pendingSandbox._id,
        daytonaSandboxId: launched.daytonaSandboxId,
        previewUrl: launched.previewUrl,
        workspacePath: launched.workspacePath,
      })

      if (sandbox.daytonaSandboxId) {
        try {
          await deleteOpenCodeSandbox(sandbox.daytonaSandboxId)
        } catch {
          // Keep the new sandbox even if deleting the old runtime fails.
        }
      }

      await convex.mutation(api.sandboxes.remove, {
        sandboxId: sandbox._id,
      })

      return {
        sandboxId: readySandbox._id,
        previewUrl: readySandbox.previewUrl ?? launched.previewUrl,
      }
    } catch (error) {
      const message = getErrorMessage(error)

      await convex.mutation(api.sandboxes.markFailed, {
        sandboxId: pendingSandbox._id,
        errorMessage: message,
      })

      throw new Error(message)
    }
  })
