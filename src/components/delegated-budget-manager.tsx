import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  createDelegatedBudget,
  type DelegatedBudgetHealthResult,
  refreshDelegatedBudgetState,
  revokeDelegatedBudget,
} from '~/features/billing/server'
import {
  type DelegatedBudgetFlowStep,
  createDelegatedBudgetWithWallet,
  revokeDelegatedBudgetWithWallet,
} from '~/lib/billing/delegated-budget-client'
import { formatUsdCents } from '~/lib/billing/format'
import type { DelegatedBudgetInterval } from '~/lib/billing/delegated-budget-contract'
import { cn } from '~/lib/utils'

type DelegatedBudgetSummary = {
  status?: string | null
  type?: 'fixed' | 'periodic' | null
  interval?: 'day' | 'week' | 'month' | null
  token?: string | null
  network?: string | null
  configuredAmountUsdCents?: number | null
  remainingAmountUsdCents?: number | null
  periodEndsAt?: string | number | null
  delegatorSmartAccount?: string | null
  delegateAddress?: string | null
  lastSettlementAt?: string | number | null
  lastRevokedAt?: string | number | null
}

type DelegatedBudgetRecord = {
  _id: string
  contractBudgetId: string
  delegationJson: string
  settlementContract?: string
  lastSettlementTxHash?: string
} | null

type DelegatedBudgetEnvironment = {
  chainId: number
  delegatedBudget: {
    enabled: boolean
    network: string
    tokenAddress: string
    tokenSymbol: 'USDC'
    settlementContract: string
    treasuryAddress: string
    backendDelegateAddress: string
    bundlerUrl: string
  }
}

type DelegatedBudgetManagerProps = {
  id?: string
  summary?: DelegatedBudgetSummary | null
  record?: DelegatedBudgetRecord
  health?: DelegatedBudgetHealthResult | null
  environment: DelegatedBudgetEnvironment
  onUpdated: () => Promise<void>
  onSelectRail?: () => void
  className?: string
  compact?: boolean
}

function getDelegatedBudgetConfigurationError(
  environment: DelegatedBudgetEnvironment,
) {
  const missingLabels: string[] = []

  if (!environment.delegatedBudget.treasuryAddress.trim()) {
    missingLabels.push('treasury address')
  }

  if (!environment.delegatedBudget.backendDelegateAddress.trim()) {
    missingLabels.push('backend delegate address')
  }

  if (!environment.delegatedBudget.bundlerUrl.trim()) {
    missingLabels.push('bundler URL')
  }

  if (missingLabels.length === 0) {
    return 'Delegated budgets are not configured in this environment yet.'
  }

  return `Delegated budgets are not configured in this environment yet. Missing ${missingLabels.join(', ')}.`
}

function formatDateTime(value?: string | number | null) {
  if (!value) {
    return null
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleString()
}

const stepLabels: Record<DelegatedBudgetFlowStep, string> = {
  connect_wallet: 'Connect wallet',
  confirm_network: 'Confirm Base network',
  derive_smart_account: 'Derive smart account',
  deploy_smart_account: 'Deploy smart account',
  sign_budget_delegation: 'Sign budget delegation',
  reset_stale_budget: 'Reset stale budget',
}

const createFlowSteps: DelegatedBudgetFlowStep[] = [
  'confirm_network',
  'connect_wallet',
  'derive_smart_account',
  'deploy_smart_account',
  'sign_budget_delegation',
]

const resetFlowSteps: DelegatedBudgetFlowStep[] = [
  'confirm_network',
  'connect_wallet',
  'derive_smart_account',
  'deploy_smart_account',
  'reset_stale_budget',
]

export function DelegatedBudgetManager({
  id,
  summary,
  record,
  health,
  environment,
  onUpdated,
  onSelectRail,
  className,
  compact = false,
}: DelegatedBudgetManagerProps) {
  const [amount, setAmount] = useState('25')
  const [budgetType, setBudgetType] = useState<'fixed' | 'periodic'>('fixed')
  const [interval, setInterval] = useState<DelegatedBudgetInterval>('month')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState<DelegatedBudgetFlowStep | null>(
    null,
  )
  const [currentFlow, setCurrentFlow] = useState<'create' | 'reset' | 'revoke' | null>(
    null,
  )

  const isConfigured = environment.delegatedBudget.enabled
  const delegatedBudgetConfigurationError =
    getDelegatedBudgetConfigurationError(environment)
  const hasActiveBudget = summary?.status === 'active' && record
  const hasUsableBudget = Boolean(
    hasActiveBudget && health?.health === 'usable',
  )
  const needsReset = Boolean(hasActiveBudget && health?.health === 'needs_recreate')
  const visibleSteps =
    currentFlow === 'create'
      ? createFlowSteps
      : currentFlow === 'reset' || currentFlow === 'revoke'
        ? resetFlowSteps
        : []

  useEffect(() => {
    if (
      hasActiveBudget &&
      summary?.configuredAmountUsdCents &&
      amount === '25'
    ) {
      setAmount(String(summary.configuredAmountUsdCents / 100))
    }

    if (hasActiveBudget && summary?.type) {
      setBudgetType(summary.type)
    }

    if (summary?.interval) {
      setInterval(summary.interval)
    }
  }, [
    amount,
    hasActiveBudget,
    summary?.configuredAmountUsdCents,
    summary?.interval,
    summary?.type,
  ])

  async function createFreshBudget() {
    const parsedAmount = Number(amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a delegated budget amount greater than zero.')
      return
    }

    if (!isConfigured) {
      setError(delegatedBudgetConfigurationError)
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    setCurrentFlow('create')
    setCurrentStep('confirm_network')

    try {
      const setup = await createDelegatedBudgetWithWallet({
        amountUsdCents: Math.round(parsedAmount * 100),
        budgetType,
        interval: budgetType === 'periodic' ? interval : null,
        chainId: environment.chainId,
        backendDelegateAddress: environment.delegatedBudget.backendDelegateAddress,
        tokenAddress: environment.delegatedBudget.tokenAddress,
        treasuryAddress: environment.delegatedBudget.treasuryAddress,
        onProgress: setCurrentStep,
      })

      await createDelegatedBudget({
        data: setup,
      })
      await onUpdated()
      onSelectRail?.()
      setSuccess('Delegated budget created and ready to use.')
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create the delegated budget.',
      )
    } finally {
      setCurrentFlow(null)
      setCurrentStep(null)
      setIsSubmitting(false)
    }
  }

  async function handleRefreshBudget() {
    if (!record) {
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      await refreshDelegatedBudgetState({
        data: {
          delegatedBudgetId: record._id,
          ...(record.lastSettlementTxHash
            ? { lastSettlementTxHash: record.lastSettlementTxHash }
            : {}),
        },
      })
      await onUpdated()
      setSuccess('Delegated budget state refreshed from chain.')
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Could not refresh delegated budget state.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateBudget() {
    await createFreshBudget()
  }

  async function handleResetAndRecreateBudget() {
    if (!record) {
      return
    }

    if (!isConfigured) {
      setError(delegatedBudgetConfigurationError)
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    setCurrentFlow('reset')
    setCurrentStep('confirm_network')

    try {
      const revokeResult = await revokeDelegatedBudgetWithWallet({
        chainId: environment.chainId,
        bundlerUrl: environment.delegatedBudget.bundlerUrl,
        delegationJson: record.delegationJson,
        onProgress: setCurrentStep,
      })

      await revokeDelegatedBudget({
        data: {
          delegatedBudgetId: record._id,
          ...(revokeResult.revocationMode === 'onchain'
            ? { revokeTxHash: revokeResult.txHash }
            : {}),
          revocationMode: revokeResult.revocationMode,
        },
      })
      await onUpdated()
      setCurrentFlow(null)
      setCurrentStep(null)
      setIsSubmitting(false)

      await createFreshBudget()

      setSuccess(
        revokeResult.revocationMode === 'local_retire'
          ? 'Stale delegated budget was retired locally and replaced with a fresh one.'
          : 'Stale delegated budget replaced with a fresh one.',
      )
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Could not reset the delegated budget.',
      )
      setCurrentFlow(null)
      setCurrentStep(null)
      setIsSubmitting(false)
    }
  }

  async function handleRevokeBudget() {
    if (!record) {
      return
    }

    if (!isConfigured) {
      setError(delegatedBudgetConfigurationError)
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    setCurrentFlow('revoke')
    setCurrentStep('confirm_network')

    try {
      const revokeResult = await revokeDelegatedBudgetWithWallet({
        chainId: environment.chainId,
        bundlerUrl: environment.delegatedBudget.bundlerUrl,
        delegationJson: record.delegationJson,
        onProgress: setCurrentStep,
      })

      await revokeDelegatedBudget({
        data: {
          delegatedBudgetId: record._id,
          ...(revokeResult.revocationMode === 'onchain'
            ? { revokeTxHash: revokeResult.txHash }
            : {}),
          revocationMode: revokeResult.revocationMode,
        },
      })
      await onUpdated()
      setSuccess(
        revokeResult.revocationMode === 'onchain'
          ? 'Delegated budget revoked.'
          : revokeResult.warning,
      )
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : 'Could not revoke the delegated budget.',
      )
    } finally {
      setCurrentFlow(null)
      setCurrentStep(null)
      setIsSubmitting(false)
    }
  }

  return (
    <div
      id={id}
      className={cn(
        'border-2 border-foreground bg-background p-4 shadow-[3px_3px_0_var(--foreground)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Delegated budget
          </p>
          <p className="mt-1 text-sm font-black uppercase">
            {hasUsableBudget
              ? 'Active'
              : needsReset
                ? 'Needs reset'
                : isConfigured
                  ? 'Setup required'
                  : 'Unavailable'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectRail?.()}
            disabled={!hasUsableBudget}
            className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-[2px_2px_0_var(--foreground)]"
          >
            Use rail
          </Button>
          {hasUsableBudget ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshBudget}
              disabled={isSubmitting}
              className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              Refresh
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-3 border-2 border-foreground">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert className="mt-3 border-2 border-foreground">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {visibleSteps.length > 0 ? (
        <div className="mt-3 border-2 border-foreground bg-muted/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {currentFlow === 'create'
              ? 'Setup progress'
              : currentFlow === 'reset'
                ? 'Reset progress'
                : 'Revoke progress'}
          </p>
          <div className="mt-2 grid gap-2">
            {visibleSteps.map((step) => {
              const active = currentStep === step
              const completed =
                currentStep !== null &&
                visibleSteps.indexOf(step) < visibleSteps.indexOf(currentStep)

              return (
                <div key={step} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      'inline-block h-2.5 w-2.5 rounded-full border border-foreground',
                      completed || active ? 'bg-foreground' : 'bg-background',
                    )}
                  />
                  <span
                    className={cn(
                      completed || active
                        ? 'font-bold text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {stepLabels[step]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {hasActiveBudget && summary ? (
        <div className="mt-4 space-y-3">
          <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
            <div className="border-2 border-foreground bg-muted p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Type
              </p>
              <p className="mt-1 font-bold">
                {summary.type === 'periodic'
                  ? `Periodic · ${summary.interval ?? 'custom'}`
                  : 'Fixed'}
              </p>
            </div>
            <div className="border-2 border-foreground bg-muted p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Remaining
              </p>
              <p className="mt-1 font-bold">
                {formatUsdCents(summary.remainingAmountUsdCents ?? 0)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {formatUsdCents(summary.configuredAmountUsdCents ?? 0)}
                </span>
              </p>
            </div>
            <div className="border-2 border-foreground bg-muted p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Network
              </p>
              <p className="mt-1 font-bold">{summary.network ?? environment.delegatedBudget.network}</p>
            </div>
            <div className="border-2 border-foreground bg-muted p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Delegate
              </p>
              <p className="mt-1 truncate font-bold" title={summary.delegateAddress ?? undefined}>
                {summary.delegateAddress
                  ? `${summary.delegateAddress.slice(0, 6)}…${summary.delegateAddress.slice(-4)}`
                  : 'Not assigned'}
              </p>
            </div>
            {summary.periodEndsAt ? (
              <div className="border-2 border-foreground bg-muted p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Period ends
                </p>
                <p className="mt-1 font-bold">{formatDateTime(summary.periodEndsAt)}</p>
              </div>
            ) : null}
            {summary.lastSettlementAt ? (
              <div className="border-2 border-foreground bg-muted p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Last settlement
                </p>
                <p className="mt-1 font-bold">{formatDateTime(summary.lastSettlementAt)}</p>
              </div>
            ) : null}
          </div>

          {needsReset ? (
            <div className="border-2 border-foreground bg-destructive/10 p-3">
              <p className="text-xs font-bold text-destructive">
                {health?.message ??
                  'This delegated budget needs to be reset before it can be used again.'}
              </p>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            {needsReset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetAndRecreateBudget}
                disabled={isSubmitting}
                className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Reset and recreate
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevokeBudget}
                disabled={isSubmitting}
                className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                Revoke
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!isConfigured ? (
            <p className="text-xs text-muted-foreground">
              Configure the delegated-budget treasury and backend delegate
              environment variables before using this rail.
            </p>
          ) : (
            <>
              <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-2')}>
                <div className="border-2 border-foreground bg-muted p-3">
                  <label className="flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Budget amount (USD)
                    </span>
                    <Input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="25"
                      className="border-2 border-foreground bg-background font-bold"
                    />
                  </label>
                </div>

                <div className="border-2 border-foreground bg-muted p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Budget type
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBudgetType('fixed')}
                      className={cn(
                        'border-2 border-foreground px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all',
                        budgetType === 'fixed'
                          ? 'translate-x-[1px] translate-y-[1px] bg-foreground text-background'
                          : 'bg-background hover:bg-accent',
                      )}
                    >
                      Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => setBudgetType('periodic')}
                      className={cn(
                        'border-2 border-foreground px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all',
                        budgetType === 'periodic'
                          ? 'translate-x-[1px] translate-y-[1px] bg-foreground text-background'
                          : 'bg-background hover:bg-accent',
                      )}
                    >
                      Periodic
                    </button>
                  </div>
                </div>

                {budgetType === 'periodic' ? (
                  <div className="border-2 border-foreground bg-muted p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Interval
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(['day', 'week', 'month'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setInterval(option)}
                          className={cn(
                            'border-2 border-foreground px-2 py-1.5 text-xs font-black uppercase tracking-wide transition-all',
                            interval === option
                              ? 'translate-x-[1px] translate-y-[1px] bg-foreground text-background'
                              : 'bg-background hover:bg-accent',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Setup stores a smart-account delegation with a treasury-bound USDC
                spend limit so later agent spends can settle without repeated wallet
                prompts. If your MetaMask smart account is still counterfactual on
                this network, BuddyPie will ask for a one-time deployment
                transaction first. The smart account itself must also hold enough
                USDC on this network before the budget can be created or charged.
              </p>

              <Button
                type="button"
                onClick={handleCreateBudget}
                disabled={isSubmitting}
                className="w-full border-2 border-foreground bg-foreground font-black uppercase tracking-wider text-background shadow-[4px_4px_0_var(--accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
              >
                {isSubmitting ? 'Preparing budget...' : 'Create delegated budget'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
