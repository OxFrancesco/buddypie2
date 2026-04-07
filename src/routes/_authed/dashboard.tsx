import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import { DeleteSandboxModal } from '~/components/delete-sandbox-modal'
import { SandboxLaunchFormFields } from '~/components/sandbox-launch-form-fields'
import { SandboxCard } from '~/components/sandbox-card'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { readCurrentDelegatedBudgetHealth } from '~/features/billing/server'
import {
  checkGithubConnection,
  deleteSandbox,
  restartSandbox,
} from '~/features/sandboxes/server'
import { formatUsdCents } from '~/lib/billing/format'
import { readConnectedWalletUsdcBalance } from '~/lib/billing/wallet-balance-client'
import type { OpenCodeAgentPresetId } from '~/lib/opencode/presets'
import {
  getOpenCodeAgentPreset,
  openCodeAgentPresets,
} from '~/lib/opencode/presets'
import { cn } from '~/lib/utils'

type DelegatedBudgetSummary = {
  status?: string | null
  remainingAmountUsdCents?: number | null
}

export const Route = createFileRoute('/_authed/dashboard')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.user.current, {})),
      context.queryClient.ensureQueryData(convexQuery(api.sandboxes.list, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.dashboardSummary, {}),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.pricingCatalog, {}),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.billing.currentDelegatedBudget, {}),
      ),
    ])

    const github = await checkGithubConnection()

    return {
      github,
    }
  },
  component: DashboardRoute,
})

function DashboardRoute() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { github } = Route.useLoaderData()
  const { data: user } = useSuspenseQuery(convexQuery(api.user.current, {}))
  const { data: sandboxes } = useSuspenseQuery(
    convexQuery(api.sandboxes.list, {}),
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
  const [agentPresetId, setAgentPresetId] =
    useState<OpenCodeAgentPresetId>('general-engineer')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busySandboxId, setBusySandboxId] = useState<string | null>(null)
  const [deleteModalSandboxId, setDeleteModalSandboxId] = useState<
    string | null
  >(null)
  const selectedPreset = getOpenCodeAgentPreset(agentPresetId)

  async function refreshDashboard() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.user.current, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.sandboxes.list, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.billing.dashboardSummary, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.billing.pricingCatalog, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.billing.currentDelegatedBudget, {}).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: ['billing', 'delegated-budget-health'],
      }),
    ])
  }

  async function navigateToSandbox(sandboxId: string) {
    await navigate({
      to: '/sandboxes/$sandboxId',
      params: { sandboxId },
    })
    void refreshDashboard()
  }

  async function handleDeleteSandbox(sandboxId: string) {
    setBusySandboxId(sandboxId)
    setActionError(null)

    try {
      await deleteSandbox({
        data: { sandboxId },
      })
      await refreshDashboard()
      setDeleteModalSandboxId(null)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Sandbox deletion failed.',
      )
    } finally {
      setBusySandboxId(null)
    }
  }

  async function handleRestartSandbox(sandboxId: string) {
    setBusySandboxId(sandboxId)
    setActionError(null)

    try {
      const result = await restartSandbox({
        data: { sandboxId, paymentMethod: 'credits' } as any,
      })

      await navigateToSandbox(result.sandboxId)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Sandbox restart failed.',
      )
    } finally {
      setBusySandboxId(null)
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <section>
        <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
          <CardHeader>
            <CardTitle className="text-2xl font-black uppercase sm:text-3xl">
              Launch Workspace
            </CardTitle>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              {selectedPreset.repositoryOptional
                ? 'Choose an agent preset and attach a repository only when the task needs repo context.'
                : 'Choose an agent preset and a repository to launch a workspace.'}
            </p>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div
              role="radiogroup"
              aria-label="OpenCode preset agent"
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
            >
              {openCodeAgentPresets.map((preset) => {
                const isSelected = preset.id === agentPresetId
                const presetPrice =
                  pricingCatalog.launchPricesUsdCentsByAgentPreset[preset.id] ??
                  0

                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setAgentPresetId(preset.id)
                    }}
                    className={cn(
                      'flex flex-col gap-3 rounded-lg border-2 border-foreground p-4 text-left shadow-[3px_3px_0_var(--foreground)] transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                      isSelected
                        ? 'translate-x-[2px] translate-y-[2px] bg-accent shadow-none'
                        : 'bg-background hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-wide">
                          {preset.label}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {preset.description}
                        </p>
                      </div>
                      <Badge
                        variant={isSelected ? 'secondary' : 'outline'}
                        className="border-2 border-foreground font-bold uppercase tracking-widest"
                      >
                        Launch {formatUsdCents(presetPrice)}
                      </Badge>
                    </div>
                  </button>
                )
              })}
            </div>

            <SandboxLaunchFormFields
              agent={{
                label: selectedPreset.label,
                repositoryOptional: selectedPreset.repositoryOptional === true,
                starterPromptPlaceholder:
                  selectedPreset.starterPromptPlaceholder,
                agentPresetId: selectedPreset.id,
              }}
              userId={user?._id ?? 'anonymous'}
              github={github}
              billingSummary={billingSummary as any}
              delegatedBudget={delegatedBudget}
              delegatedBudgetHealth={delegatedBudgetHealth}
              connectedWalletUsdcBalance={connectedWalletUsdcBalance}
              hasActiveDelegatedBudget={hasActiveDelegatedBudget}
              onLaunched={navigateToSandbox}
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Workspaces
            </p>
            <h3 className="mt-1 text-2xl font-black uppercase">
              Pie&apos;s Workspaces
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <p className="border-2 border-foreground bg-accent px-2 py-1 text-xs font-black">
              {sandboxes.length}
            </p>
            <p className="text-xs text-muted-foreground">
              Manage payment rails in your profile.
            </p>
          </div>
        </div>

        {actionError ? (
          <Alert variant="destructive" className="border-2 border-foreground">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {sandboxes.length === 0 ? (
          <div className="border-2 border-dashed border-foreground bg-muted p-10 text-center text-sm font-bold text-muted-foreground">
            Your first sandbox will appear here.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {sandboxes.map((sandbox: any) => (
              <SandboxCard
                key={sandbox._id}
                sandbox={sandbox}
                isBusy={busySandboxId === sandbox._id}
                onDelete={() => setDeleteModalSandboxId(sandbox._id)}
                onRestart={() => {
                  void handleRestartSandbox(sandbox._id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      <DeleteSandboxModal
        open={deleteModalSandboxId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteModalSandboxId(null)
          }
        }}
        onConfirm={async () => {
          if (!deleteModalSandboxId) {
            return
          }

          await handleDeleteSandbox(deleteModalSandboxId)
        }}
        sandboxName={
          sandboxes.find((sandbox: any) => sandbox._id === deleteModalSandboxId)
            ?.repoName
        }
      />
    </main>
  )
}
