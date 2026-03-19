function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function requireConvexUrl() {
  const convexUrl = process.env.VITE_CONVEX_URL

  if (!convexUrl) {
    throw new Error('VITE_CONVEX_URL is not configured on the server.')
  }

  return convexUrl
}

function resolveConvexHttpUrl(convexUrl: string) {
  const configuredSiteUrl = process.env.CONVEX_SITE_URL?.trim()

  if (configuredSiteUrl) {
    return stripTrailingSlash(configuredSiteUrl)
  }

  // Convex HTTP actions live on the deployment's .site domain.
  return stripTrailingSlash(convexUrl).replace(/\.cloud(?=\/|$)/, '.site')
}

async function createConvexHttpClient() {
  const { ConvexHttpClient } = await import('convex/browser')
  const convexUrl = requireConvexUrl()
  const convex = new ConvexHttpClient(convexUrl)

  return {
    convex,
    convexUrl,
    convexHttpUrl: resolveConvexHttpUrl(convexUrl),
  }
}

export async function getAuthenticatedConvexClient() {
  const [{ auth }, { convex, convexUrl, convexHttpUrl }] = await Promise.all([
    import('@clerk/tanstack-react-start/server'),
    createConvexHttpClient(),
  ])
  const session = await auth()

  if (!session.userId) {
    throw new Error('You must be signed in to continue.')
  }

  const token = await session.getToken({ template: 'convex' })

  if (!token) {
    throw new Error('Your Convex auth token could not be created.')
  }
  convex.setAuth(token)

  return {
    convex,
    convexUrl,
    convexHttpUrl,
    token,
    userId: session.userId,
  }
}

export async function getConvexAdminClient() {
  const { convex, convexUrl, convexHttpUrl } = await createConvexHttpClient()
  const adminKey =
    process.env.CONVEX_ADMIN_KEY?.trim() || process.env.CONVEX_DEPLOY_KEY?.trim()

  if (!adminKey) {
    throw new Error('CONVEX_ADMIN_KEY or CONVEX_DEPLOY_KEY must be configured.')
  }

  ;(
    convex as typeof convex & {
      setAdminAuth: (token: string) => void
    }
  ).setAdminAuth(adminKey)

  return {
    convex,
    convexUrl,
    convexHttpUrl,
  }
}
