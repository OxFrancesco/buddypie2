import { describe, expect, test } from 'bun:test'
import {
  compileMarketplaceAgentDefinition,
  createDefaultAgentComposition,
} from '../src/lib/opencode/marketplace.ts'
import {
  getBillingEventPriceUsdCents,
} from '../convex/lib/billingConfig.ts'
import { normalizeSandboxInputWithDefinition } from '../src/lib/sandboxes.ts'

describe('marketplace agent compilation', () => {
  test('compiles a draft composition into the shared launchable definition shape', () => {
    const definition = compileMarketplaceAgentDefinition({
      metadata: {
        slug: 'alpha-agent',
        name: 'Alpha Agent',
        shortDescription: 'A custom marketplace draft.',
        tags: ['alpha'],
      },
      composition: createDefaultAgentComposition(),
      sourceKind: 'marketplace_draft',
    })

    expect(definition).toMatchObject({
      id: 'marketplace-draft-alpha-agent',
      label: 'Alpha Agent',
      description: 'A custom marketplace draft.',
      provider: 'openrouter',
      model: 'minimax/minimax-m2.7',
    })
    expect(definition.requiredEnv).toContain('OPENROUTER_API_KEY')
  })

  test('normalizes repository-optional marketplace launches without requiring a repo URL', () => {
    const definition = compileMarketplaceAgentDefinition({
      metadata: {
        slug: 'research-agent',
        name: 'Research Agent',
        shortDescription: 'A repo-optional marketplace draft.',
        tags: ['research'],
      },
      composition: createDefaultAgentComposition('nansen-analyst'),
      sourceKind: 'marketplace_draft',
    })

    expect(
      normalizeSandboxInputWithDefinition({
        definition,
      }),
    ).toMatchObject({
      repoUrl: undefined,
      repoName: 'Research Agent',
      agentPresetId: 'marketplace-draft-research-agent',
      agentLabel: 'Research Agent',
    })
  })
})

describe('marketplace billing', () => {
  test('uses the explicit marketplace default launch price for marketplace-backed agent ids', () => {
    expect(
      getBillingEventPriceUsdCents(
        'marketplace-draft-alpha-agent',
        'sandbox_launch',
      ),
    ).toBe(250)
    expect(
      getBillingEventPriceUsdCents('marketplace-alpha-agent', 'sandbox_launch'),
    ).toBe(250)
  })
})
