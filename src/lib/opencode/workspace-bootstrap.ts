import type { OpenCodeDocsWorkspaceBootstrap } from '~/lib/opencode/presets'

export type DocsAppPathInspection = {
  preferredPathExists: boolean
  preferredPathLooksLikeFumadocs: boolean
  fallbackPathExists: boolean
  fallbackPathLooksLikeFumadocs: boolean
}

export type DocsAppPathResolution = {
  docsAppPath: string
  shouldScaffold: boolean
}

export type WorkspaceBootstrapRuntimeContext = {
  repoRoot: string
  sourceRepoUrl?: string
  sourceRepoBranch?: string
  sourceRepoPath?: string
  docsAppPath?: string
  packageManager?: string
}

function hasDirectoryIgnoreEntry(content: string, directory: string) {
  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      return false
    }

    const normalized = trimmed.replace(/^\/+/, '')
    return normalized === directory || normalized === `${directory}/`
  })
}

export function ensureDirectoryInGitignore(content: string, directory: string) {
  if (hasDirectoryIgnoreEntry(content, directory)) {
    return content
  }

  const trimmedEnd = content.trimEnd()
  const lines = trimmedEnd ? [trimmedEnd, `${directory}/`] : [`${directory}/`]
  return `${lines.join('\n')}\n`
}

export function resolveDocsAppPath(
  bootstrap: OpenCodeDocsWorkspaceBootstrap,
  inspection: DocsAppPathInspection,
): DocsAppPathResolution {
  if (inspection.preferredPathLooksLikeFumadocs) {
    return {
      docsAppPath: bootstrap.preferredDocsPath,
      shouldScaffold: false,
    }
  }

  if (inspection.preferredPathExists) {
    if (inspection.fallbackPathLooksLikeFumadocs) {
      return {
        docsAppPath: bootstrap.fallbackDocsPath,
        shouldScaffold: false,
      }
    }

    if (!inspection.fallbackPathExists) {
      return {
        docsAppPath: bootstrap.fallbackDocsPath,
        shouldScaffold: true,
      }
    }

    throw new Error(
      `Cannot scaffold docs because both '${bootstrap.preferredDocsPath}' and '${bootstrap.fallbackDocsPath}' already exist and neither looks like a Fumadocs app.`,
    )
  }

  if (inspection.fallbackPathLooksLikeFumadocs) {
    return {
      docsAppPath: bootstrap.fallbackDocsPath,
      shouldScaffold: false,
    }
  }

  return {
    docsAppPath: bootstrap.preferredDocsPath,
    shouldScaffold: true,
  }
}

function buildWorkspaceBootstrapLines(
  context: WorkspaceBootstrapRuntimeContext,
) {
  const lines = [`- Primary repo root: \`${context.repoRoot}\``]

  if (context.sourceRepoPath) {
    const sourceRepoDetails = [
      `\`${context.sourceRepoPath}\``,
      context.sourceRepoBranch ? `branch \`${context.sourceRepoBranch}\`` : null,
      context.sourceRepoUrl ? `from \`${context.sourceRepoUrl}\`` : null,
    ]
      .filter(Boolean)
      .join(', ')

    lines.push(`- Fumadocs reference repo: ${sourceRepoDetails}`)
  }

  if (context.docsAppPath) {
    lines.push(`- Docs app path: \`${context.docsAppPath}\``)
  }

  if (context.packageManager) {
    lines.push(
      `- Preferred package manager inside the docs app: \`${context.packageManager}\``,
    )
  }

  return lines
}

function buildDocsAppPackageManagerGuidance(
  packageManager: string | undefined,
) {
  const docsPackageManager = packageManager?.trim() || 'npm'

  return `Use ${docsPackageManager} for install, dev, preview, typecheck, and build commands inside the docs app.`
}

export function buildWorkspaceBootstrapInstructions(
  context?: WorkspaceBootstrapRuntimeContext,
) {
  if (!context?.sourceRepoPath && !context?.docsAppPath && !context?.packageManager) {
    return ''
  }

  return [
    '## Runtime Workspace Context',
    '',
    'BuddyPie prepared supporting workspace assets before this session started.',
    '',
    ...buildWorkspaceBootstrapLines(context),
    '',
    'Use the primary repo as the source of truth for product behavior and project-specific facts.',
    'Use the Fumadocs reference repo as the source of truth for framework structure, conventions, and examples.',
    buildDocsAppPackageManagerGuidance(context.packageManager),
  ].join('\n')
}

export function buildWorkspaceBootstrapPromptPrefix(
  context?: WorkspaceBootstrapRuntimeContext,
) {
  if (!context?.sourceRepoPath && !context?.docsAppPath && !context?.packageManager) {
    return ''
  }

  return [
    'BuddyPie prepared this workspace before the first prompt.',
    '',
    ...buildWorkspaceBootstrapLines(context),
    '',
    `Use the target repo for project truth, use the Fumadocs reference repo for framework truth, and use ${
      context.packageManager?.trim() || 'npm'
    } inside the docs app.`,
  ].join('\n')
}
