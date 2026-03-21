import { describe, expect, test } from 'bun:test'
import {
  buildPreviewCommand,
  buildPreviewCommandSuggestion,
  getAppPreviewLogPath,
  resolveLaunchPreviewAppPath,
  resolvePreviewAppPath,
  selectPreviewScript,
} from '../src/lib/server/daytona.ts'
import { getOpenCodeAgentPreset } from '../src/lib/opencode/presets.ts'

describe('preview app path resolution', () => {
  test('uses the generated docs app path for docs sandboxes at launch', () => {
    const preset = getOpenCodeAgentPreset('docs-writer')

    expect(
      resolveLaunchPreviewAppPath({
        preset,
        workspacePath: '/home/daytona/example-repo',
        runtimeContext: {
          repoRoot: '/home/daytona/example-repo',
          docsAppPath: '/home/daytona/example-repo/docs-site',
          packageManager: 'bun',
        },
      }),
    ).toBe('/home/daytona/example-repo/docs-site')
  })

  test('reuses a persisted preview app path when present', () => {
    expect(
      resolvePreviewAppPath({
        workspacePath: '/home/daytona/example-repo',
        previewAppPath: '/home/daytona/example-repo/docs',
        agentPresetId: 'docs-writer',
        docsAppPath: '/home/daytona/example-repo/docs-site',
      }),
    ).toBe('/home/daytona/example-repo/docs')
  })

  test('falls back to the derived docs app path for older docs sandboxes', () => {
    expect(
      resolvePreviewAppPath({
        workspacePath: '/home/daytona/example-repo',
        agentPresetId: 'docs-writer',
        docsAppPath: '/home/daytona/example-repo/docs-site',
      }),
    ).toBe('/home/daytona/example-repo/docs-site')
  })

  test('falls back to the repo root for non-doc sandboxes', () => {
    expect(
      resolvePreviewAppPath({
        workspacePath: '/home/daytona/example-repo',
        agentPresetId: 'general-engineer',
      }),
    ).toBe('/home/daytona/example-repo')
  })
})

describe('preview script selection', () => {
  test('prefers dev:web over other scripts at the repo root', () => {
    expect(
      selectPreviewScript({
        dev: 'vite dev',
        'dev:web': 'vite dev',
        preview: 'vite preview',
      }),
    ).toBe('dev:web')
  })

  test('selects preview when dev is absent', () => {
    expect(
      selectPreviewScript({
        preview: 'vite preview',
        start: 'node server.js',
      }),
    ).toBe('preview')
  })
})

describe('preview command building', () => {
  test('builds a bun command for nested docs previews', () => {
    const suggestion = buildPreviewCommandSuggestion({
      workspacePath: '/home/daytona/example-repo',
      previewAppPath: '/home/daytona/example-repo/docs',
      metadata: {
        framework: 'vite',
        packageManager: 'bun',
        previewScript: 'preview',
      },
      port: 4173,
    })

    expect(suggestion.command).toContain("cd '/home/daytona/example-repo/docs'")
    expect(suggestion.command).toContain('$HOME/.bun/bin/bun run preview')
    expect(suggestion.command).toContain('--host 0.0.0.0 --port 4173')
    expect(suggestion.previewAppPath).toBe('/home/daytona/example-repo/docs')
  })

  test('builds the expected root app command for dev:web', () => {
    expect(
      buildPreviewCommand({
        packageManager: 'bun',
        framework: 'vite',
        previewScript: 'dev:web',
        port: 5173,
      }),
    ).toContain('$HOME/.bun/bin/bun run dev:web --host 0.0.0.0 --port 5173')
  })
})

describe('preview logs', () => {
  test('keeps preview logs under the workspace-root .buddypie directory', () => {
    expect(getAppPreviewLogPath('/home/daytona/example-repo', 4173)).toBe(
      '/home/daytona/example-repo/.buddypie/logs/app-preview-4173.log',
    )
  })
})
