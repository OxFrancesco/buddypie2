import { Link } from '@tanstack/react-router'
import type { SandboxPaymentMethod } from '~/lib/sandboxes'
import { cn } from '~/lib/utils'

function RailBalanceLine({
  label,
  amountFormatted,
}: {
  label: string
  amountFormatted: string
}) {
  return (
    <p className="mt-3 text-xs leading-snug">
      <span className="font-black uppercase tracking-wide">{label}</span>{' '}
      <span className="font-black tabular-nums tracking-tight text-foreground">
        {amountFormatted}
      </span>
    </p>
  )
}

type PaymentMethodToggleProps = {
  value: SandboxPaymentMethod
  onChange: (value: SandboxPaymentMethod) => void
  className?: string
  creditsDescription?: string
  x402Description?: string
  delegatedBudgetDescription?: string
  delegatedBudgetDisabled?: boolean
  /** When the delegated rail is unavailable, offer navigation to Profile (wallet) to create one. */
  hideDelegatedWalletCta?: boolean
  /** BuddyPie wallet credits (available balance), formatted e.g. via `formatUsdCents`. */
  creditsBalanceFormatted?: string
  /** Smart-account USDC on the billing chain, when known. */
  x402BalanceFormatted?: string
  /** Remaining delegated allowance, formatted. */
  delegatedBudgetRemainingFormatted?: string
}

export function PaymentMethodToggle({
  value,
  onChange,
  className,
  creditsDescription = 'Spend from your shared BuddyPie wallet.',
  x402Description = 'Pay per action from your wallet with x402.',
  delegatedBudgetDescription = 'Spend from a preapproved MetaMask delegated budget.',
  delegatedBudgetDisabled = false,
  hideDelegatedWalletCta = false,
  creditsBalanceFormatted,
  x402BalanceFormatted,
  delegatedBudgetRemainingFormatted,
}: PaymentMethodToggleProps) {
  const delegatedCopy = (
    <>
      <p className="text-sm font-black uppercase tracking-wide">
        Delegated budget
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {delegatedBudgetDescription}
      </p>
      <div className="min-h-2 flex-1" aria-hidden />
      {delegatedBudgetRemainingFormatted ? (
        <RailBalanceLine
          label="Remaining"
          amountFormatted={delegatedBudgetRemainingFormatted}
        />
      ) : null}
    </>
  )

  const walletLinkClassName =
    'inline-flex h-8 w-full items-center justify-center border-2 border-foreground bg-foreground text-xs font-black uppercase tracking-wider text-background shadow-[2px_2px_0_var(--accent)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'

  return (
    <div className={cn('grid gap-3 md:grid-cols-3', className)}>
      <button
        type="button"
        onClick={() => onChange('credits')}
        className={cn(
          'flex min-h-[9rem] flex-col rounded-lg border-2 border-foreground p-4 text-left shadow-[3px_3px_0_var(--foreground)] transition-all',
          value === 'credits'
            ? 'translate-x-[2px] translate-y-[2px] bg-accent shadow-none'
            : 'bg-background hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none',
        )}
      >
        <p className="text-sm font-black uppercase tracking-wide">Credits</p>
        <p className="mt-2 text-xs text-muted-foreground">{creditsDescription}</p>
        <div className="min-h-2 flex-1" aria-hidden />
        {creditsBalanceFormatted ? (
          <RailBalanceLine
            label="Balance"
            amountFormatted={creditsBalanceFormatted}
          />
        ) : null}
      </button>

      <button
        type="button"
        onClick={() => onChange('x402')}
        className={cn(
          'flex min-h-[9rem] flex-col rounded-lg border-2 border-foreground p-4 text-left shadow-[3px_3px_0_var(--foreground)] transition-all',
          value === 'x402'
            ? 'translate-x-[2px] translate-y-[2px] bg-accent shadow-none'
            : 'bg-background hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none',
        )}
      >
        <p className="text-sm font-black uppercase tracking-wide">x402</p>
        <p className="mt-2 text-xs text-muted-foreground">{x402Description}</p>
        <div className="min-h-2 flex-1" aria-hidden />
        {x402BalanceFormatted ? (
          <RailBalanceLine
            label="Wallet USDC"
            amountFormatted={x402BalanceFormatted}
          />
        ) : null}
      </button>

      {delegatedBudgetDisabled ? (
        <div
          className={cn(
            'flex min-h-[9rem] flex-col overflow-hidden rounded-lg border-2 border-muted-foreground/50 bg-muted/40 text-left shadow-[3px_3px_0_hsl(var(--muted-foreground)/0.35)]',
          )}
        >
          <div
            className="flex min-h-0 flex-1 cursor-not-allowed flex-col select-none p-4 opacity-[0.42]"
            aria-disabled="true"
          >
            <div className="flex min-h-0 flex-1 flex-col">{delegatedCopy}</div>
          </div>
          {!hideDelegatedWalletCta ? (
            <div className="border-t-2 border-foreground/15 bg-background p-4">
              <Link
                to="/profile"
                hash="delegated-budget"
                className={walletLinkClassName}
              >
                Go to wallet
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange('delegated_budget')}
          className={cn(
            'flex min-h-[9rem] flex-col rounded-lg border-2 border-foreground p-4 text-left shadow-[3px_3px_0_var(--foreground)] transition-all',
            value === 'delegated_budget'
              ? 'translate-x-[2px] translate-y-[2px] bg-accent shadow-none'
              : 'bg-background hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col">{delegatedCopy}</div>
        </button>
      )}
    </div>
  )
}
