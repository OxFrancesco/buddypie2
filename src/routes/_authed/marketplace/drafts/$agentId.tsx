import { useState, type ReactNode } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import { SandboxLaunchFormFields } from '~/components/sandbox-launch-form-fields'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { readCurrentDelegatedBudgetHealth } from '~/features/billing/server'
import {
  approveMarketplaceDraft,
  deleteMarketplaceDraft,
  readMarketplaceViewerAccess,
  rejectMarketplaceDraft,
  submitMarketplaceDraftForReview,
  unpublishMarketplaceAgent,
  updateMarketplaceDraft,
} from '~/features/marketplace/server'
import { checkGithubConnection } from '~/features/sandboxes/server'
import { readConnectedWalletUsdcBalance } from '~/lib/billing/wallet-balance-client'
import {
  type AgentComposition,
  agentPersonaModuleMap,
  managedMcpModuleMap,
  managedSkillModuleMap,
  workspaceBootstrapModuleMap,
} from '~/lib/opencode/marketplace'
import {
  openCodeModelOptions,
  type OpenCodeModelOptionId,
} from '~/lib/opencode/presets'

type DelegatedBudgetSummary = {
  status?: string | null
  remainingAmountUsdCents?: number | null
}

export const Route = createFileRoute('/_authed/marketplace/drafts/$agentId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.user.current, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.marketplace.getById, {
          agentId: params.agentId as Id<'marketplaceAgents'>,
        }),
      ),
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

    const [github, viewerAccess] = await Promise.all([
      checkGithubConnection(),
      readMarketplaceViewerAccess(),
    ])

    return {
      github,
      viewerAccess,
    }
  },
  component: MarketplaceDraftRoute,
})

function MarketplaceDraftRoute() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const { github, viewerAccess } = Route.useLoaderData()
  const { data: user } = useSuspenseQuery(convexQuery(api.user.current, {}))
  const { data: agent } = useSuspenseQuery(
    convexQuery(api.marketplace.getById, {
      agentId: params.agentId as Id<'marketplaceAgents'>,
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
  const [slug, setSlug] = useState(agent?.slug ?? '')
  const [name, setName] = useState(agent?.name ?? '')
  const [shortDescription, setShortDescription] = useState(
    agent?.shortDescription ?? '',
  )
  const [descriptionMd, setDescriptionMd] = useState(agent?.descriptionMd ?? '')
  const [tags, setTags] = useState(agent?.tags.join(', ') ?? '')
  const [icon, setIcon] = useState(agent?.icon ?? '')
  const [personaModuleId, setPersonaModuleId] = useState(
    agent?.draftComposition.personaModuleId ?? 'general-engineer',
  )
  const [starterPrompt, setStarterPrompt] = useState(
    agent?.draftComposition.starterPrompt ?? '',
  )
  const [starterPromptPlaceholder, setStarterPromptPlaceholder] = useState(
    agent?.draftComposition.starterPromptPlaceholder ?? '',
  )
  const [customAgentPrompt, setCustomAgentPrompt] = useState(
    agent?.draftComposition.customAgentPrompt ?? '',
  )
  const [customInstructionsMd, setCustomInstructionsMd] = useState(
    agent?.draftComposition.customInstructionsMd ?? '',
  )
  const [defaultModelOptionId, setDefaultModelOptionId] =
    useState<OpenCodeModelOptionId>(
      (agent?.draftComposition.defaultModelOptionId ??
        'openrouter-minimax-m2.7') as OpenCodeModelOptionId,
    )
  const [repositoryOptional, setRepositoryOptional] = useState(
    agent?.draftComposition.repositoryOptional ?? false,
  )
  const [selectedSkillModuleIds, setSelectedSkillModuleIds] = useState(
    agent?.draftComposition.skillModuleIds ?? [],
  )
  const [selectedMcpModuleIds, setSelectedMcpModuleIds] = useState(
    agent?.draftComposition.mcpModuleIds ?? [],
  )
  const [selectedBootstrapModuleId, setSelectedBootstrapModuleId] = useState(
    agent?.draftComposition.workspaceBootstrapModuleIds[0] ?? '',
  )
  const [reviewNotes, setReviewNotes] = useState(agent?.reviewNotes ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const skillModules = Object.values(managedSkillModuleMap)
  const mcpModules = Object.values(managedMcpModuleMap)
  const bootstrapModules = Object.values(workspaceBootstrapModuleMap)
  const personaModules = Object.values(agentPersonaModuleMap)

  if (!agent) {
    return (
      <div className="border-2 border-dashed border-foreground bg-muted p-10 text-sm font-bold text-muted-foreground">
        Marketplace draft not found.
      </div>
    )
  }

  const agentId = agent._id
  const draftComposition: AgentComposition = {
    personaModuleId,
    ...(customAgentPrompt.trim()
      ? { customAgentPrompt: customAgentPrompt.trim() }
      : {}),
    ...(customInstructionsMd.trim()
      ? { customInstructionsMd: customInstructionsMd.trim() }
      : {}),
    starterPrompt,
    starterPromptPlaceholder,
    repositoryOptional,
    defaultModelOptionId,
    skillModuleIds: selectedSkillModuleIds,
    mcpModuleIds: selectedMcpModuleIds,
    workspaceBootstrapModuleIds: selectedBootstrapModuleId
      ? [selectedBootstrapModuleId]
      : [],
  }

  async function handleSave() {
    setIsSaving(true)
    setFormError(null)
    setFormSuccess(null)

    try {
      await updateMarketplaceDraft({
        data: {
          agentId,
          slug,
          name,
          shortDescription,
          descriptionMd,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          icon,
          draftComposition,
        },
      })
      setFormSuccess('Marketplace draft saved.')
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not save this draft.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmitForReview() {
    await handleSave()

    try {
      await submitMarketplaceDraftForReview({
        data: { agentId },
      })
      setFormSuccess('Marketplace draft submitted for review.')
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Could not submit this draft for review.',
      )
    }
  }

  async function handleApprove() {
    try {
      await approveMarketplaceDraft({
        data: {
          agentId,
          reviewNotes,
        },
      })
      setFormSuccess('Marketplace draft approved and published.')
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not approve this draft.',
      )
    }
  }

  async function handleReject() {
    try {
      await rejectMarketplaceDraft({
        data: {
          agentId,
          reviewNotes,
        },
      })
      setFormSuccess('Marketplace draft sent back with review notes.')
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not reject this draft.',
      )
    }
  }

  async function handleUnpublish() {
    try {
      await unpublishMarketplaceAgent({
        data: { agentId },
      })
      setFormSuccess('Marketplace agent unpublished.')
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not unpublish this agent.',
      )
    }
  }

  async function handleDelete() {
    try {
      await deleteMarketplaceDraft({
        data: { agentId },
      })
      await navigate({ to: '/marketplace' })
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not delete this draft.',
      )
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Marketplace Draft
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase">{agent.name}</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Edit the curated modules, save your draft, preview it in a sandbox,
            and submit it for review when it is ready to publish.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              void handleSave()
            }}
            disabled={isSaving}
            className="border-2 border-foreground bg-foreground text-sm font-black uppercase tracking-wider text-background shadow-[3px_3px_0_var(--accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          >
            {isSaving ? 'Saving...' : 'Save draft'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void handleSubmitForReview()
            }}
            className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            Submit for review
          </Button>
          {agent.publicStatus === 'published' ? (
            <Button
              variant="outline"
              onClick={() => {
                void handleUnpublish()
              }}
              className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              Unpublish
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={() => {
              void handleDelete()
            }}
            className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
          >
            Delete
          </Button>
        </div>
      </section>

      {formError ? (
        <Alert variant="destructive" className="border-2 border-foreground">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {formSuccess ? (
        <Alert className="border-2 border-foreground">
          <AlertDescription>{formSuccess}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
          <CardHeader>
            <CardTitle className="text-2xl font-black uppercase">
              Builder
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Slug">
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
              </Field>
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
            </div>

            <Field label="Short Description">
              <Input
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={descriptionMd}
                onChange={(event) => setDescriptionMd(event.target.value)}
                className="min-h-28"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tags">
                <Input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="frontend, docs, agent"
                />
              </Field>
              <Field label="Icon">
                <Input value={icon} onChange={(event) => setIcon(event.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Persona">
                <select
                  className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm"
                  value={personaModuleId}
                  onChange={(event) => setPersonaModuleId(event.target.value)}
                >
                  {personaModules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default Model">
                <select
                  className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm"
                  value={defaultModelOptionId}
                  onChange={(event) =>
                    setDefaultModelOptionId(
                      event.target.value as OpenCodeModelOptionId,
                    )
                  }
                >
                  {openCodeModelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Custom Agent Prompt">
              <Textarea
                value={customAgentPrompt}
                onChange={(event) => setCustomAgentPrompt(event.target.value)}
                className="min-h-24"
              />
            </Field>

            <Field label="Custom Instructions">
              <Textarea
                value={customInstructionsMd}
                onChange={(event) =>
                  setCustomInstructionsMd(event.target.value)
                }
                className="min-h-32"
              />
            </Field>

            <Field label="Starter Prompt">
              <Textarea
                value={starterPrompt}
                onChange={(event) => setStarterPrompt(event.target.value)}
                className="min-h-24"
              />
            </Field>

            <Field label="Starter Prompt Placeholder">
              <Input
                value={starterPromptPlaceholder}
                onChange={(event) =>
                  setStarterPromptPlaceholder(event.target.value)
                }
              />
            </Field>

            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={repositoryOptional}
                onChange={(event) => setRepositoryOptional(event.target.checked)}
              />
              Repository optional
            </label>

            <ModulePicker
              title="Skills"
              items={skillModules.map((module) => ({
                id: module.id,
                label: module.label,
                description: module.description,
              }))}
              selectedIds={selectedSkillModuleIds}
              onToggle={(moduleId) => {
                setSelectedSkillModuleIds((current) =>
                  current.includes(moduleId)
                    ? current.filter((id) => id !== moduleId)
                    : [...current, moduleId],
                )
              }}
            />

            <ModulePicker
              title="MCP Modules"
              items={mcpModules.map((module) => ({
                id: module.id,
                label: module.label,
                description: module.description,
              }))}
              selectedIds={selectedMcpModuleIds}
              onToggle={(moduleId) => {
                setSelectedMcpModuleIds((current) =>
                  current.includes(moduleId)
                    ? current.filter((id) => id !== moduleId)
                    : [...current, moduleId],
                )
              }}
              emptyLabel="No curated MCP modules are available in this repo yet."
            />

            <ModulePicker
              title="Workspace Bootstrap"
              items={bootstrapModules.map((module) => ({
                id: module.id,
                label: module.label,
                description: module.description,
              }))}
              selectedIds={selectedBootstrapModuleId ? [selectedBootstrapModuleId] : []}
              onToggle={(moduleId) => {
                setSelectedBootstrapModuleId((current) =>
                  current === moduleId ? '' : moduleId,
                )
              }}
              singleSelect
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
            <CardHeader>
              <CardTitle className="text-2xl font-black uppercase">
                Draft Preview Launch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SandboxLaunchFormFields
                agent={{
                  label: name || agent.name,
                  repositoryOptional,
                  starterPromptPlaceholder,
                  launchSelection: {
                    kind: 'marketplace_draft',
                    marketplaceAgentId: agent._id,
                  },
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
                submitLabel="Launch draft preview →"
              />
            </CardContent>
          </Card>

          {viewerAccess.isReviewer ? (
            <Card className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]">
              <CardHeader>
                <CardTitle className="text-2xl font-black uppercase">
                  Reviewer Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  className="min-h-24"
                  placeholder="Reviewer notes"
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      void handleApprove()
                    }}
                    className="border-2 border-foreground bg-foreground text-sm font-black uppercase tracking-wider text-background shadow-[3px_3px_0_var(--accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
                  >
                    Approve &amp; publish
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleReject()
                    }}
                    className="border-2 border-foreground text-sm font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    Reject with notes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function Field(props: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-black uppercase tracking-widest">
        {props.label}
      </label>
      {props.children}
    </div>
  )
}

function ModulePicker(props: {
  title: string
  items: Array<{
    id: string
    label: string
    description: string
  }>
  selectedIds: Array<string>
  onToggle: (id: string) => void
  emptyLabel?: string
  singleSelect?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-black uppercase tracking-widest">
        {props.title}
      </p>
      {props.items.length === 0 ? (
        <div className="border-2 border-dashed border-foreground bg-muted p-3 text-sm text-muted-foreground">
          {props.emptyLabel ?? 'No modules available.'}
        </div>
      ) : (
        <div className="grid gap-3">
          {props.items.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-3 rounded-md border-2 border-foreground bg-muted p-3"
            >
              <input
                type={props.singleSelect ? 'radio' : 'checkbox'}
                name={props.singleSelect ? props.title : undefined}
                checked={props.selectedIds.includes(item.id)}
                onChange={() => props.onToggle(item.id)}
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-black uppercase">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
