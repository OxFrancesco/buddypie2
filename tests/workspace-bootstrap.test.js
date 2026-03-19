import { describe, expect, test } from 'bun:test'
import {
  buildWorkspaceBootstrapInstructions,
  buildWorkspaceBootstrapPromptPrefix,
  ensureDirectoryInGitignore,
  resolveDocsAppPath,
} from '../src/lib/opencode/workspace-bootstrap.ts'

const docsBootstrap = {
  kind: 'fumadocs-docs-app',
  sourceRepoUrl: 'https://github.com/fuma-nama/fumadocs.git',
  sourceRepoBranch: 'main',
  sourceRepoPath: 'sources/fumadocs',
  docsTemplate: 'tanstack-start',
  preferredDocsPath: 'docs',
  fallbackDocsPath: 'docs-site',
  packageManager: 'bun',
}

describe('ensureDirectoryInGitignore', () => {
  test('adds sources once and preserves existing content', () => {
    const original = 'node_modules\n.env\n'
    const updated = ensureDirectoryInGitignore(original, 'sources')

    expect(updated).toBe('node_modules\n.env\nsources/\n')
    expect(ensureDirectoryInGitignore(updated, 'sources')).toBe(updated)
  })

  test('does not duplicate an existing directory rule', () => {
    expect(ensureDirectoryInGitignore('sources/\n', 'sources')).toBe('sources/\n')
    expect(ensureDirectoryInGitignore('sources\n', 'sources')).toBe('sources\n')
  })
})

describe('resolveDocsAppPath', () => {
  test('scaffolds docs when no docs app exists', () => {
    expect(
      resolveDocsAppPath(docsBootstrap, {
        preferredPathExists: false,
        preferredPathLooksLikeFumadocs: false,
        fallbackPathExists: false,
        fallbackPathLooksLikeFumadocs: false,
      }),
    ).toEqual({
      docsAppPath: 'docs',
      shouldScaffold: true,
    })
  })

  test('reuses an existing fumadocs app in docs', () => {
    expect(
      resolveDocsAppPath(docsBootstrap, {
        preferredPathExists: true,
        preferredPathLooksLikeFumadocs: true,
        fallbackPathExists: false,
        fallbackPathLooksLikeFumadocs: false,
      }),
    ).toEqual({
      docsAppPath: 'docs',
      shouldScaffold: false,
    })
  })

  test('falls back to docs-site when docs exists but is not fumadocs', () => {
    expect(
      resolveDocsAppPath(docsBootstrap, {
        preferredPathExists: true,
        preferredPathLooksLikeFumadocs: false,
        fallbackPathExists: false,
        fallbackPathLooksLikeFumadocs: false,
      }),
    ).toEqual({
      docsAppPath: 'docs-site',
      shouldScaffold: true,
    })
  })

  test('reuses an existing fallback fumadocs app when docs is occupied', () => {
    expect(
      resolveDocsAppPath(docsBootstrap, {
        preferredPathExists: true,
        preferredPathLooksLikeFumadocs: false,
        fallbackPathExists: true,
        fallbackPathLooksLikeFumadocs: true,
      }),
    ).toEqual({
      docsAppPath: 'docs-site',
      shouldScaffold: false,
    })
  })

  test('throws when both docs paths are occupied by non-fumadocs content', () => {
    expect(() =>
      resolveDocsAppPath(docsBootstrap, {
        preferredPathExists: true,
        preferredPathLooksLikeFumadocs: false,
        fallbackPathExists: true,
        fallbackPathLooksLikeFumadocs: false,
      }),
    ).toThrow(
      "Cannot scaffold docs because both 'docs' and 'docs-site' already exist and neither looks like a Fumadocs app.",
    )
  })
})

describe('workspace bootstrap context text', () => {
  test('includes the source branch and prepared paths in instructions and prompt prefix', () => {
    const context = {
      repoRoot: '/home/daytona/example-repo',
      sourceRepoUrl: 'https://github.com/fuma-nama/fumadocs.git',
      sourceRepoBranch: 'main',
      sourceRepoPath: '/home/daytona/example-repo/sources/fumadocs',
      docsAppPath: '/home/daytona/example-repo/docs-site',
      packageManager: 'bun',
    }

    const instructions = buildWorkspaceBootstrapInstructions(context)
    const promptPrefix = buildWorkspaceBootstrapPromptPrefix(context)

    expect(instructions).toContain('/home/daytona/example-repo/sources/fumadocs')
    expect(instructions).toContain('branch `main`')
    expect(instructions).toContain('/home/daytona/example-repo/docs-site')
    expect(instructions).toContain('`bun`')

    expect(promptPrefix).toContain('/home/daytona/example-repo')
    expect(promptPrefix).toContain('/home/daytona/example-repo/sources/fumadocs')
    expect(promptPrefix).toContain('/home/daytona/example-repo/docs-site')
    expect(promptPrefix).toContain('framework truth')
  })
})
