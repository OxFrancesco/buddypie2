import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChangeEvent, FocusEvent, FormEvent } from 'react'
import { KickoffPromptAckModal } from '~/components/kickoff-prompt-ack-modal'
import { PaymentMethodToggle } from '~/components/payment-method-toggle'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import type { GithubRepoOption } from '~/features/sandboxes/server'
import {
  createSandbox,
  listGithubBranches,
  listGithubRepos,
} from '~/features/sandboxes/server'
import { formatUsdCents } from '~/lib/billing/format'
import { formatSandboxPaymentMethod } from '~/lib/billing/presentation'
import { postJsonWithX402Payment } from '~/lib/billing/x402-client'
import { isKickoffPromptAckValid } from '~/lib/kickoff-prompt-ack'
import type { MarketplaceLaunchSelection } from '~/lib/opencode/marketplace'
import type { SandboxPaymentMethod } from '~/lib/sandboxes'

type GithubConnectionSummary = {
  connected: boolean
  message: string
}

type DelegatedBudgetSummary = {
  status?: string | null
  remainingAmountUsdCents?: number | null
}

type ConnectedWalletBalance = {
  balanceUsdCents: number | null
}

type BillingSummaryLike = {
  wallet: {
    chainId: number
    availableUsdCents: number
  }
}

type X402SandboxActionResult = {
  sandboxId: string
}

type SandboxLaunchAgentSummary = {
  label: string
  repositoryOptional: boolean
  starterPromptPlaceholder: string
  launchSelection?: MarketplaceLaunchSelection
  agentPresetId?: string
}

type SandboxLaunchFormFieldsProps = {
  agent: SandboxLaunchAgentSummary
  userId: string
  github: GithubConnectionSummary
  billingSummary: BillingSummaryLike
  delegatedBudget?: DelegatedBudgetSummary | null
  delegatedBudgetHealth?: {
    health?: string
    message?: string
  } | null
  connectedWalletUsdcBalance?: ConnectedWalletBalance | null
  hasActiveDelegatedBudget: boolean
  onLaunched: (sandboxId: string) => Promise<void>
  submitLabel?: string
}

export function SandboxLaunchFormFields(props: SandboxLaunchFormFieldsProps) {
  const [paymentMethod, setPaymentMethod] =
    useState<SandboxPaymentMethod>('credits')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [githubPickerError, setGithubPickerError] = useState<string | null>(
    null,
  )
  const [isCreating, setIsCreating] = useState(false)
  const [githubBranches, setGithubBranches] = useState<Array<string>>([])
  const [isLoadingGithubBranches, setIsLoadingGithubBranches] = useState(false)
  const [selectedGithubRepoFullName, setSelectedGithubRepoFullName] = useState<
    string | null
  >(null)
  const [kickoffAckModalOpen, setKickoffAckModalOpen] = useState(false)
  const kickoffTextareaRef = useRef<HTMLTextAreaElement>(null)
  const skipNextKickoffAckRef = useRef(false)
  const githubReposQueryKey = [
    'github',
    'recent-repos',
    props.userId,
  ] as const
  const githubReposQuery = useQuery({
    queryKey: githubReposQueryKey,
    queryFn: () => listGithubRepos(),
    enabled: props.github.connected,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const githubRepos = githubReposQuery.data ?? []
  const githubReposError =
    githubReposQuery.error instanceof Error
      ? githubReposQuery.error.message
      : null
  const isLoadingGithubRepos =
    githubReposQuery.isPending && githubRepos.length === 0
  const isRefreshingGithubRepos = githubReposQuery.isFetching
  const githubAlertMessage = githubPickerError ?? githubReposError
  const hasRepoUrl = repoUrl.trim().length > 0

  async function loadGithubBranchesForRepo(repo: GithubRepoOption) {
    setSelectedGithubRepoFullName(repo.fullName)
    setIsLoadingGithubBranches(true)
    setGithubPickerError(null)

    try {
      const branches = await listGithubBranches({
        data: {
          repoFullName: repo.fullName,
        },
      })

      setGithubBranches(branches)
    } catch (error) {
      setGithubBranches([])
      setGithubPickerError(
        error instanceof Error
          ? error.message
          : 'Could not load GitHub branches.',
      )
    } finally {
      setIsLoadingGithubBranches(false)
    }
  }

  function applyGithubRepo(repo: GithubRepoOption) {
    setRepoUrl(repo.cloneUrl)
    setBranch(repo.defaultBranch)
    void loadGithubBranchesForRepo(repo)
  }

  async function handleRefreshGithubRepos() {
    setGithubPickerError(null)

    const { data: repos = [] } = await githubReposQuery.refetch()
    const matchedRepo = repos.find((repo) => repo.cloneUrl === repoUrl)

    if (matchedRepo) {
      setBranch((currentBranch) => currentBranch || matchedRepo.defaultBranch)
      void loadGithubBranchesForRepo(matchedRepo)
    }
  }

  function handleKickoffPromptFocus(event: FocusEvent<HTMLTextAreaElement>) {
    if (skipNextKickoffAckRef.current) {
      skipNextKickoffAckRef.current = false
      return
    }

    if (isKickoffPromptAckValid()) {
      return
    }

    event.currentTarget.blur()
    setKickoffAckModalOpen(true)
  }

  function handleKickoffAcknowledged() {
    skipNextKickoffAckRef.current = true
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        kickoffTextareaRef.current?.focus()
      })
    })
  }

  function handleRepoUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRepoUrl = event.target.value
    const matchedRepo = githubRepos.find(
      (repo) => repo.cloneUrl === nextRepoUrl,
    )

    setFormError(null)
    setGithubPickerError(null)
    setRepoUrl(nextRepoUrl)

    if (!matchedRepo) {
      setSelectedGithubRepoFullName(null)
      setGithubBranches([])
      return
    }

    applyGithubRepo(matchedRepo)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (
      paymentMethod === 'delegated_budget' &&
      !props.hasActiveDelegatedBudget
    ) {
      setFormError(
        props.delegatedBudgetHealth?.message ??
          'Set up an active delegated budget before using that payment rail.',
      )
      return
    }

    setIsCreating(true)

    try {
      const payload = {
        ...(props.agent.launchSelection
          ? { launchSelection: props.agent.launchSelection }
          : {}),
        ...(props.agent.agentPresetId
          ? { agentPresetId: props.agent.agentPresetId }
          : {}),
        initialPrompt,
        paymentMethod,
        ...(hasRepoUrl ? { repoUrl, branch } : {}),
      }

      const result = paymentMethod === 'x402'
        ? await postJsonWithX402Payment<X402SandboxActionResult>({
            url: '/api/x402/sandboxes/create',
            body: payload,
            chainId: props.billingSummary.wallet.chainId,
          })
        : await createSandbox({
            data: payload as any,
          })

      await props.onLaunched(result.sandboxId)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Sandbox creation failed.',
      )
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest">
            Payment Rail
          </p>
          <PaymentMethodToggle
            value={paymentMethod}
            onChange={(nextValue) => {
              setFormError(null)
              setPaymentMethod(nextValue)
            }}
            creditsDescription="Spend from your shared BuddyPie wallet."
            x402Description="Pay per action from your wallet on Base."
            delegatedBudgetDescription={
              props.hasActiveDelegatedBudget
                ? 'Spend from your active MetaMask delegated budget.'
                : props.delegatedBudgetHealth?.message ??
                  'Set up a MetaMask delegated budget in your wallet before selecting this rail.'
            }
            delegatedBudgetDisabled={!props.hasActiveDelegatedBudget}
            creditsBalanceFormatted={formatUsdCents(
              props.billingSummary.wallet.availableUsdCents,
            )}
            x402BalanceFormatted={
              props.connectedWalletUsdcBalance?.balanceUsdCents != null
                ? formatUsdCents(
                    props.connectedWalletUsdcBalance.balanceUsdCents,
                  )
                : undefined
            }
            delegatedBudgetRemainingFormatted={
              props.delegatedBudget
                ? formatUsdCents(
                    props.delegatedBudget.remainingAmountUsdCents ?? 0,
                  )
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-start sm:gap-4">
          <div className="flex min-w-0 flex-col gap-2 sm:col-span-3">
            <label
              htmlFor="repo-url"
              className="text-[10px] font-black uppercase tracking-widest"
            >
              Repository URL{props.agent.repositoryOptional ? ' (Optional)' : ''}
            </label>
            <Input
              id="repo-url"
              type="url"
              required={!props.agent.repositoryOptional}
              list={githubRepos.length > 0 ? 'github-repo-options' : undefined}
              value={repoUrl}
              onChange={handleRepoUrlChange}
              placeholder="https://github.com/owner/repo.git"
              className="border-2 border-foreground bg-background font-mono text-sm shadow-[2px_2px_0_var(--foreground)] focus-visible:shadow-none"
            />

            {props.github.connected ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {props.agent.repositoryOptional
                    ? 'Leave this blank to launch without repo context, or attach a repo when the task needs code.'
                    : props.github.message}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void handleRefreshGithubRepos()
                    }}
                    disabled={isRefreshingGithubRepos}
                    className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    {isLoadingGithubRepos
                      ? 'Fetching latest repos...'
                      : isRefreshingGithubRepos
                        ? 'Refreshing...'
                        : 'Refresh repos'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {isLoadingGithubRepos
                      ? 'Loading your latest 10 repos.'
                      : githubRepos.length > 0
                        ? `${githubRepos.length} recent repo${githubRepos.length === 1 ? '' : 's'} cached until refresh.`
                        : 'No recent GitHub repos found.'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {props.agent.repositoryOptional
                  ? 'Leave this blank to launch without repo context, or paste any HTTPS Git repository URL when you want code context.'
                  : props.github.message}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:col-span-1">
            <label
              htmlFor="branch"
              className="text-[10px] font-black uppercase tracking-widest"
            >
              Base Branch
            </label>
            <Input
              id="branch"
              type="text"
              disabled={!hasRepoUrl}
              list={
                githubBranches.length > 0 ? 'github-branch-options' : undefined
              }
              value={branch}
              onChange={(event) => {
                setFormError(null)
                setBranch(event.target.value)
              }}
              placeholder="main"
              className="border-2 border-foreground bg-background font-mono text-xs shadow-[2px_2px_0_var(--foreground)] focus-visible:shadow-none"
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {!hasRepoUrl
                ? 'Add a repository URL to target a specific branch.'
                : isLoadingGithubBranches
                  ? 'Fetching branches...'
                  : selectedGithubRepoFullName && githubBranches.length > 0
                    ? `${githubBranches.length} branch${githubBranches.length === 1 ? '' : 'es'} from ${selectedGithubRepoFullName}.`
                    : 'Leave blank for the default branch.'}{' '}
              {hasRepoUrl
                ? 'BuddyPie clones this branch, then immediately creates a dedicated working branch for the agent.'
                : null}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="kickoff-prompt"
            className="text-[10px] font-black uppercase tracking-widest"
          >
            Kickoff Prompt
          </label>
          <Textarea
            ref={kickoffTextareaRef}
            id="kickoff-prompt"
            value={initialPrompt}
            onFocus={handleKickoffPromptFocus}
            onChange={(event) => {
              setFormError(null)
              setInitialPrompt(event.target.value)
            }}
            placeholder={props.agent.starterPromptPlaceholder}
            className="min-h-28 border-2 border-foreground bg-background font-mono text-sm shadow-[2px_2px_0_var(--foreground)] focus-visible:shadow-none"
          />
          <p className="text-xs text-muted-foreground">
            Leave this blank to use {props.agent.label}&apos;s built-in kickoff
            prompt.
          </p>
        </div>

        {githubRepos.length > 0 ? (
          <datalist id="github-repo-options">
            {githubRepos.map((repo) => (
              <option
                key={repo.id}
                value={repo.cloneUrl}
                label={`${repo.fullName} (${repo.private ? 'private' : 'public'})`}
              />
            ))}
          </datalist>
        ) : null}

        {githubBranches.length > 0 ? (
          <datalist id="github-branch-options">
            {githubBranches.map((branchName) => (
              <option key={branchName} value={branchName} />
            ))}
          </datalist>
        ) : null}

        {githubAlertMessage ? (
          <Alert variant="destructive" className="border-2 border-foreground">
            <AlertDescription>{githubAlertMessage}</AlertDescription>
          </Alert>
        ) : null}

        {formError ? (
          <Alert variant="destructive" className="border-2 border-foreground">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={isCreating}
            className="h-10 border-2 border-foreground bg-foreground px-6 text-sm font-black uppercase tracking-wider text-background shadow-[4px_4px_0_var(--accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          >
            {isCreating
              ? 'Launching...'
              : props.submitLabel ??
                `Create sandbox with ${formatSandboxPaymentMethod(paymentMethod)} →`}
          </Button>
        </div>
      </form>

      <KickoffPromptAckModal
        open={kickoffAckModalOpen}
        onOpenChange={setKickoffAckModalOpen}
        onAcknowledged={handleKickoffAcknowledged}
      />
    </>
  )
}
