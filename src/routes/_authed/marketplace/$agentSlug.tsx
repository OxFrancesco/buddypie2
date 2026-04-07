import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import { SandboxLaunchFormFields } from '~/components/sandbox-launch-form-fields'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { readCurrentDelegatedBudgetHealth } from '~/features/billing/server'
import {
  cloneBuiltinMarketplaceAgent,
  clonePublishedMarketplaceAgent,
} from '~/features/marketplace/server'
import { checkGithubConnection } from '~/features/sandboxes/server'
import { readConnectedWalletUsdcBalance } from '~/lib/billing/wallet-balance-client'
import { getBuiltinMarketplaceEntries } from '~/lib/opencode/marketplace'

type DelegatedBudgetSummary = {
  status?: string | null
  remainingAmountUsdCents?: number | null
}

export const Route = createFileRoute('/_authed/marketplace/$agentSlug')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.user.current, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.dashboardSummary, {}),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.pricingCatalog, {}),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.currentDelegatedBudget, {}),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.marketplace.getBySlug, {
          slug: params.agentSlug,
        }),
      ),
    ])

    const github = await checkGithubConnection()

    return {
      github,
    }
  },
  component: MarketplaceAgentDetailRoute,
})

function MarketplaceAgentDetailRoute() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const { github } = Route.useLoaderData()
  const { data: user } = useSuspenseQuery(convexQuery(api.user.current, {}))
  const { data: marketplaceAgent } = useSuspenseQuery(
    convexQuery(api.marketplace.getBySlug, {
      slug: params.agentSlug,
    }),
  )
  const { data: billingSummary } = useSuspenseQuery(
    convexQuery(api.billing.dashboardSummary, {}),
  )
  const { data: pricingCatalog } = useSuspenseQuery(
    convexQuery(api.billing.pricingCatalog, {}),
  )
  const { data: delegatedBudgetRecord } = useSuspenseQuery(
    convexQuery(api.billing.currentDelegatedBudget, {}),
  )
  const billingSummaryView = billingSummary as typeof billingSummary & {
    delegatedBudget?: DelegatedBudgetSummary
  }
  const delegatedBudget = billingSummaryView.delegatedBudget
  const delegatedBudgetHealthQuery = useQuery({
    queryKey: [
      'billing',
      'delegated-budget-health',
      delegatedBudgetRecord?._id ?? 'none',
    ],
    queryFn: () => readCurrentDelegatedBudgetHealth(),
    staleTime: 15_000,
  })
  const delegatedBudgetHealth = delegatedBudgetHealthQuery.data
  const connectedWalletUsdcBalanceQuery = useQuery({
    queryKey: [
      'billing',
      'connected-wallet-usdc-balance',
      pricingCatalog.environment.chainId,
      pricingCatalog.environment.delegatedBudget.tokenAddress,
    ],
    queryFn: () =>
      readConnectedWalletUsdcBalance({
        chainId: pricingCatalog.environment.chainId,
        tokenAddress: pricingCatalog.environment.delegatedBudget.tokenAddress,
      }),
    staleTime: 15_000,
  })
  const connectedWalletUsdcBalance = connectedWalletUsdcBalanceQuery.data
  const hasActiveDelegatedBudget =
    delegatedBudget?.status === 'active' &&
    delegatedBudgetHealth?.health === 'usable'
  const builtinAgent = getBuiltinMarketplaceEntries().find(
    (agent) => agent.slug === params.agentSlug,
  )
  const [isCloning, setIsCloning] = useState(false)

  if (!builtinAgent && !marketplaceAgent) {
    return (
      <div className="border-2 border-dashed border-foreground bg-muted p-10 text-sm font-bold text-muted-foreground">
        Marketplace agent not found.
      </div>
    )
  }

  const title = builtinAgent?.name ?? marketplaceAgent!.name
  const summary =
    builtinAgent?.shortDescription ?? marketplaceAgent!.shortDescription
  const composition =
    builtinAgent?.composition ?? marketplaceAgent!.draftComposition
  const launchSelection = builtinAgent
    ? { kind: 'builtin' as const, builtinPresetId: builtinAgent.presetId }
    : {
        kind: 'marketplace_version' as const,
        marketplaceAgentId: String(marketplaceAgent!._id),
        ...(marketplaceAgent?.currentPublishedVersionId
          ? {
              marketplaceVersionId: String(
                marketplaceAgent.currentPublishedVersionId,
              ),
            }
          : {}),
      }
  const starterPromptPlaceholder = builtinAgent
    ? builtinAgent.definition.starterPromptPlaceholder
    : marketplaceAgent!.draftComposition.starterPromptPlaceholder
  const repositoryOptional = builtinAgent
    ? builtinAgent.definition.repositoryOptional === true
    : marketplaceAgent!.draftComposition.repositoryOptional

  async function handleClone() {
    setIsCloning(true)

    try {
      const draft = builtinAgent
        ? await cloneBuiltinMarketplaceAgent({
            data: {
              builtinPresetId: builtinAgent.presetId,
            },
          })
        : await clonePublishedMarketplaceAgent({
            data: {
              sourceAgentId: String(marketplaceAgent!._id),
              sourceVersionId: String(marketplaceAgent!.currentPublishedVersionId),
            },
          })

      await navigate({
        to: '/marketplace/drafts/$agentId',
        params: { agentId: draft._id },
      })
    } finally {
      setIsCloning(false)
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Marketplace Agent
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            {summary}
          </p>
        </div>

        <Button
          onClick={() => {
            void handleClone()
          }}
          disabled={isCloning}
          variant="outline"
          className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          {isCloning ? 'Cloning...' : 'Clone to draft'}
        </Button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
          <CardHeader>
            <CardTitle className="text-2xl font-black uppercase">
              Composition
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <DefinitionBlock
              title="Persona"
              value={composition.personaModuleId}
            />
            <DefinitionBlock
              title="Model default"
              value={composition.defaultModelOptionId}
            />
            <DefinitionBlock
              title="Repository mode"
              value={
                composition.repositoryOptional
                  ? 'Repository optional'
                  : 'Repository required'
              }
            />
            <DefinitionBlock
              title="Skills"
              value={
                composition.skillModuleIds.length > 0
                  ? composition.skillModuleIds.join(', ')
                  : 'No additional managed skills'
              }
            />
            <DefinitionBlock
              title="MCP modules"
              value={
                composition.mcpModuleIds.length > 0
                  ? composition.mcpModuleIds.join(', ')
                  : 'No managed MCP modules'
              }
            />
            <DefinitionBlock
              title="Workspace bootstrap"
              value={
                composition.workspaceBootstrapModuleIds.length > 0
                  ? composition.workspaceBootstrapModuleIds.join(', ')
                  : 'No bootstrap module'
              }
            />
          </CardContent>
        </Card>

        <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
          <CardHeader>
            <CardTitle className="text-2xl font-black uppercase">
              Launch This Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SandboxLaunchFormFields
              agent={{
                label: title,
                repositoryOptional,
                starterPromptPlaceholder,
                launchSelection,
              }}
              userId={user?._id ?? 'anonymous'}
              github={github}
              billingSummary={billingSummary as any}
              delegatedBudget={delegatedBudget}
              delegatedBudgetHealth={delegatedBudgetHealth}
              connectedWalletUsdcBalance={connectedWalletUsdcBalance}
              hasActiveDelegatedBudget={hasActiveDelegatedBudget}
              onLaunched={async (sandboxId) => {
                await navigate({
                  to: '/sandboxes/$sandboxId',
                  params: { sandboxId },
                })
              }}
              submitLabel="Launch agent →"
            />
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function DefinitionBlock(props: { title: string; value: string }) {
  return (
    <div className="border-2 border-foreground bg-muted p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {props.title}
      </p>
      <p className="mt-1 text-sm font-bold">{props.value}</p>
    </div>
  )
}
