import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  buildOpenCodeSessionPreviewUrl,
  resolveOpenCodeLaunchConfig,
} from '../src/lib/server/daytona.ts'

const ORIGINAL_ENV = { ...process.env }

describe('resolveOpenCodeLaunchConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  test('throws before sandbox creation when a required provider key is missing', () => {
    delete process.env.VENICE_API_KEY

    expect(() =>
      resolveOpenCodeLaunchConfig({
        agentPresetId: 'docs-writer',
        agentProvider: 'venice',
        agentModel: 'zai-org-glm-5',
      }),
    ).toThrow(
      'VENICE_API_KEY or VENICE_INFERENCE_KEY is not configured on the server.',
    )
  })

  test('uses the configured Venice API key for the docs preset default', () => {
    process.env.VENICE_API_KEY = 'test-venice-key'

    expect(
      resolveOpenCodeLaunchConfig({
        agentPresetId: 'docs-writer',
        agentProvider: 'venice',
        agentModel: 'zai-org-glm-5',
      }),
    ).toMatchObject({
      preset: {
        id: 'docs-writer',
        provider: 'venice',
        model: 'zai-org-glm-5',
      },
      launchEnvironment: {
        VENICE_API_KEY: 'test-venice-key',
      },
    })
  })

  test('accepts VENICE_INFERENCE_KEY as an alias for VENICE_API_KEY', () => {
    delete process.env.VENICE_API_KEY
    process.env.VENICE_INFERENCE_KEY = 'test-venice-inference-key'

    expect(
      resolveOpenCodeLaunchConfig({
        agentPresetId: 'docs-writer',
        agentProvider: 'venice',
        agentModel: 'zai-org-glm-5',
      }),
    ).toMatchObject({
      launchEnvironment: {
        VENICE_API_KEY: 'test-venice-inference-key',
      },
    })
  })

  test('injects the GitHub token aliases and account login needed for PR flows', () => {
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'

    const { launchEnvironment } = resolveOpenCodeLaunchConfig({
      agentPresetId: 'general-engineer',
      agentProvider: 'openrouter',
      agentModel: 'minimax/minimax-m2.7',
      githubAuth: {
        token: 'ghu_test_token',
        scopes: ['repo', 'read:user'],
        accountLogin: 'octocat',
        accountName: 'The Octocat',
        accountEmail: 'octocat@example.com',
      },
    })

    expect(launchEnvironment).toMatchObject({
      OPENROUTER_API_KEY: 'test-openrouter-key',
      GITHUB_TOKEN: 'ghu_test_token',
      GH_TOKEN: 'ghu_test_token',
      GITHUB_OAUTH_SCOPES: 'repo,read:user',
      GITHUB_OAUTH_ACCOUNT_LOGIN: 'octocat',
      GITHUB_ACTOR: 'octocat',
    })
    expect(launchEnvironment.GITHUB_OAUTH_ACCOUNT_EMAIL).toBeUndefined()
    expect(launchEnvironment.GITHUB_OAUTH_ACCOUNT_NAME).toBeUndefined()
    expect(launchEnvironment.GITHUB_OAUTH_ACCOUNT_ID).toBeUndefined()
  })
})

describe('buildOpenCodeSessionPreviewUrl', () => {
  test('opens the seeded session directly in the OpenCode web app', () => {
    expect(
      buildOpenCodeSessionPreviewUrl(
        'https://3000-sandbox.proxy.daytona.works/',
        '/home/daytona/example-repo',
        'session_123',
      ),
    ).toBe(
      'https://3000-sandbox.proxy.daytona.works/L2hvbWUvZGF5dG9uYS9leGFtcGxlLXJlcG8/session/session_123',
    )
  })

  test('keeps the root preview URL when no session is available', () => {
    expect(
      buildOpenCodeSessionPreviewUrl(
        'https://3000-sandbox.proxy.daytona.works/',
        '/home/daytona/example-repo',
      ),
    ).toBe('https://3000-sandbox.proxy.daytona.works/')
  })
})
