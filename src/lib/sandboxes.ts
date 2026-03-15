export type CreateSandboxInput = {
  repoUrl: string
  branch?: string
}

export function normalizeSandboxInput(input: CreateSandboxInput) {
  const repoUrl = input.repoUrl.trim()
  const branch = input.branch?.trim() || undefined

  if (!repoUrl) {
    throw new Error('A repository URL is required.')
  }

  let parsedUrl: URL

  try {
    parsedUrl = new URL(repoUrl)
  } catch {
    throw new Error('Use a valid HTTPS Git repository URL.')
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP(S) repository URLs are supported in this MVP.')
  }

  const repoName = parsedUrl.pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/, '')
    .trim()

  if (!repoName) {
    throw new Error('Could not determine the repository name from that URL.')
  }

  return {
    repoUrl: parsedUrl.toString(),
    branch,
    repoName,
    repoProvider: isGitHubRepo(parsedUrl) ? ('github' as const) : ('git' as const),
  }
}

export function isGitHubRepo(repoUrl: string | URL) {
  const parsedUrl = typeof repoUrl === 'string' ? new URL(repoUrl) : repoUrl
  return parsedUrl.hostname === 'github.com' || parsedUrl.hostname === 'www.github.com'
}

export function getWorkspacePath(repoName: string) {
  const safeRepoName = repoName.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `/home/daytona/${safeRepoName}`
}
