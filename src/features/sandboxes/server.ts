import { createServerFn } from '@tanstack/react-start'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import type { CreateSandboxInput } from '~/lib/sandboxes'
import { normalizeSandboxInput } from '~/lib/sandboxes'

type SandboxMutationInput = {
  sandboxId: string
}

type GithubBranchListInput = {
  repoFullName: string
}

type GithubApiRepo = {
  id: number
  full_name: string
  clone_url: string
  default_branch: string
  private: boolean
}

type GithubApiBranch = {
  name: string
}

export type GithubRepoOption = {
  id: number
  fullName: string
  cloneUrl: string
  defaultBranch: string
  private: boolean
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

async function getRequiredGithubAccessToken(userId: string) {
  const githubToken = await getGithubAccessToken(userId)

  if (!githubToken) {
    throw new Error('Connect GitHub in Clerk before fetching repositories.')
  }

  return githubToken
}

async function githubRequest<T>(githubToken: string, path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (response.ok) {
    return (await response.json()) as T
  }

  let githubMessage = 'GitHub could not complete that request.'

  try {
    const error = (await response.json()) as { message?: string }

    if (error.message) {
      githubMessage = error.message
    }
  } catch {
    // Fall back to the generic message when GitHub returns a non-JSON body.
  }

  if (response.status === 401) {
    throw new Error('Your GitHub access expired. Refresh the GitHub connection in Clerk and try again.')
  }

  if (response.status === 403) {
    throw new Error('GitHub denied access. Refresh the GitHub connection in Clerk and make sure repo access is granted.')
  }

  throw new Error(githubMessage)
}

async function fetchGithubRepos(githubToken: string) {
  const repos: Array<GithubApiRepo> = []

  for (let page = 1; ; page += 1) {
    const nextPage = await githubRequest<Array<GithubApiRepo>>(
      githubToken,
      `/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&sort=updated&page=${page}`,
    )

    repos.push(...nextPage)

    if (nextPage.length < 100) {
      return repos
    }
  }
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

export const listGithubRepos = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { userId } = await getAuthenticatedConvexClient()
    const githubToken = await getRequiredGithubAccessToken(userId)
    const repos = await fetchGithubRepos(githubToken)
    const repoOptions: Array<GithubRepoOption> = repos.map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      private: repo.private,
    }))

    return repoOptions
  },
)

export const listGithubBranches = createServerFn({ method: 'POST' })
  .inputValidator((data: GithubBranchListInput) => data)
  .handler(async ({ data }) => {
    const repoFullName = data.repoFullName.trim()
    const [owner, repo, ...rest] = repoFullName.split('/')

    if (!owner || !repo || rest.length > 0) {
      throw new Error('Choose a valid GitHub repository before fetching branches.')
    }

    const { userId } = await getAuthenticatedConvexClient()
    const githubToken = await getRequiredGithubAccessToken(userId)
    const branches = await githubRequest<Array<GithubApiBranch>>(
      githubToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
    )

    return branches.map((branch) => branch.name)
  })

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
