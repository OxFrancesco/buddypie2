import { api } from 'convex/_generated/api'
import type { Doc } from 'convex/_generated/dataModel'
import { Cause, Effect, Exit, Ref } from 'effect'
import type { CreateSandboxInput } from '~/lib/sandboxes'
import {
  ConvexService,
  DaytonaService,
  MarketplaceService,
} from '~/lib/server/effect/services'
import {
  ExternalServiceError,
  SandboxError,
  ValidationError,
  toConvexFailureMessage,
} from '~/lib/server/effect/errors'
import {
  getBillingEventPriceUsdCents,
  type BillingPaymentMethod,
} from '../../../../convex/lib/billingConfig'
import { normalizeSandboxInputWithDefinition } from '~/lib/sandboxes'
import { getGithubLaunchAuth } from './github'
import {
  captureDelegatedLaunchCharge,
  requireDelegatedBudgetAllowance,
} from './payments'

type LaunchedSandbox = {
  daytonaSandboxId: string
  previewUrl: string
  previewUrlPattern?: string
  workspacePath: string
  previewAppPath?: string
  opencodeSessionId?: string
}

function normalizeUnknownMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

function sandboxMutation<T>(options: {
  try: () => Promise<T>
  fallback: string
}) {
  return Effect.tryPromise({
    try: options.try,
    catch: (error) =>
      new SandboxError({
        message: normalizeUnknownMessage(error, options.fallback),
        cause: error,
      }),
  })
}

function githubAuthEffect(userId: string) {
  return Effect.tryPromise({
    try: () => getGithubLaunchAuth(userId),
    catch: (error) =>
      new ExternalServiceError({
        service: 'GitHub',
        message: normalizeUnknownMessage(
          error,
          'GitHub could not complete that request.',
        ),
        cause: error,
      }),
  })
}

function normalizeLaunchInput(args: {
  repoUrl?: string | null
  branch?: string | null
  initialPrompt?: string | null
  definition: Parameters<typeof normalizeSandboxInputWithDefinition>[0]['definition']
}) {
  return Effect.try({
    try: () =>
      normalizeSandboxInputWithDefinition({
        repoUrl: args.repoUrl ?? undefined,
        branch: args.branch ?? undefined,
        initialPrompt: args.initialPrompt ?? undefined,
        definition: args.definition,
      }),
    catch: (error) =>
      new ValidationError({
        message: normalizeUnknownMessage(
          error,
          'The sandbox launch configuration is invalid.',
        ),
        cause: error,
      }),
  })
}

function launchSandboxLifecycle(args: {
  input: CreateSandboxInput
  paymentMethod: BillingPaymentMethod
}) {
  return Effect.scoped(
    Effect.gen(function*() {
      const convex = yield* ConvexService
      const daytona = yield* DaytonaService
      const marketplace = yield* MarketplaceService
      yield* convex.ensureCurrentUser

      const pendingSandboxRef = yield* Ref.make<Doc<'sandboxes'> | null>(null)
      const launchedSandboxRef = yield* Ref.make<LaunchedSandbox | null>(null)
      const completedRef = yield* Ref.make(false)

      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function*() {
          if (Exit.isSuccess(exit) || (yield* Ref.get(completedRef))) {
            return
          }

          const launched = yield* Ref.get(launchedSandboxRef)

          if (launched?.daytonaSandboxId) {
            yield* daytona.deleteOpenCodeSandbox(launched.daytonaSandboxId).pipe(
              Effect.catchAll(() => Effect.void),
            )
          }

          const pendingSandbox = yield* Ref.get(pendingSandboxRef)

          if (pendingSandbox) {
            yield* sandboxMutation({
              try: () =>
                convex.context.convex.mutation(api.sandboxes.markFailed, {
                  sandboxId: pendingSandbox._id,
                  errorMessage: toConvexFailureMessage(Cause.squash(exit.cause)),
                }),
              fallback: 'BuddyPie could not persist the sandbox failure state.',
            }).pipe(Effect.catchAll(() => Effect.void))
          }
        }),
      )

      const resolvedLaunch = yield* marketplace.resolveLaunchSelection(
        args.input.launchSelection ?? {
          kind: 'builtin',
          builtinPresetId: args.input.agentPresetId ?? 'general-engineer',
        },
      )
      const normalized = yield* normalizeLaunchInput({
        repoUrl: args.input.repoUrl,
        branch: args.input.branch,
        initialPrompt: args.input.initialPrompt,
        definition: resolvedLaunch.definition,
      })

      if (args.paymentMethod === 'delegated_budget') {
        yield* requireDelegatedBudgetAllowance({
          requiredAmountUsdCents: getBillingEventPriceUsdCents(
            normalized.agentPresetId,
            'sandbox_launch',
          ),
          actionLabel: `launching ${normalized.repoName}`,
        })
      }

      const githubAuth =
        normalized.repoProvider === 'github'
          ? yield* githubAuthEffect(convex.context.userId)
          : null

      yield* daytona.resolveOpenCodeLaunchConfig({
        definition: resolvedLaunch.definition,
        githubAuth,
      })

      const pendingSandbox = yield* sandboxMutation({
        try: () =>
          convex.context.convex.mutation(api.sandboxes.createPending, {
            repoName: normalized.repoName,
            agentSourceKind: resolvedLaunch.sourceKind,
            ...(resolvedLaunch.marketplaceAgentId
              ? { marketplaceAgentId: resolvedLaunch.marketplaceAgentId }
              : {}),
            ...(resolvedLaunch.marketplaceVersionId
              ? { marketplaceVersionId: resolvedLaunch.marketplaceVersionId }
              : {}),
            agentPresetId: normalized.agentPresetId,
            agentLabel: normalized.agentLabel,
            agentProvider: normalized.agentProvider,
            agentModel: normalized.agentModel,
            initialPrompt: normalized.initialPrompt,
            paymentMethod: args.paymentMethod,
            ...(normalized.repoUrl
              ? { repoUrl: normalized.repoUrl }
              : {}),
            ...(normalized.branch
              ? { repoBranch: normalized.branch }
              : {}),
            ...(normalized.repoProvider
              ? { repoProvider: normalized.repoProvider }
              : {}),
          }),
        fallback: 'BuddyPie could not create the pending sandbox record.',
      })
      yield* Ref.set(pendingSandboxRef, pendingSandbox)

      const launched = yield* daytona.createOpenCodeSandbox({
        repoUrl: normalized.repoUrl,
        branch: normalized.branch,
        agentDefinition: resolvedLaunch.definition,
        initialPrompt: normalized.initialPrompt,
        githubAuth,
      })
      yield* Ref.set(launchedSandboxRef, launched)

      if (args.paymentMethod === 'delegated_budget') {
        yield* captureDelegatedLaunchCharge({
          sandboxId: pendingSandbox._id,
          agentPresetId: normalized.agentPresetId,
          repoName: normalized.repoName,
          repoBranch: normalized.branch,
        })
      }

      const readySandbox = yield* sandboxMutation({
        try: () =>
          convex.context.convex.mutation(api.sandboxes.markReady, {
            sandboxId: pendingSandbox._id,
            daytonaSandboxId: launched.daytonaSandboxId,
            previewUrl: launched.previewUrl,
            previewUrlPattern: launched.previewUrlPattern,
            workspacePath: launched.workspacePath,
            previewAppPath: launched.previewAppPath,
            opencodeSessionId: launched.opencodeSessionId,
          }),
        fallback: 'BuddyPie could not persist the launched sandbox.',
      })

      yield* Ref.set(completedRef, true)

      return {
        sandboxId: readySandbox._id,
        previewUrl: readySandbox.previewUrl ?? launched.previewUrl,
        agentPresetId: readySandbox.agentPresetId ?? normalized.agentPresetId,
      }
    }),
  )
}

function restartSandboxLifecycle(args: {
  sandboxId: string
  paymentMethod: BillingPaymentMethod
}) {
  return Effect.scoped(
    Effect.gen(function*() {
      const convex = yield* ConvexService
      const daytona = yield* DaytonaService
      const marketplace = yield* MarketplaceService
      const sandbox = yield* convex.getOwnedSandbox(args.sandboxId)
      const resolvedLaunch = yield* marketplace.resolveLaunchSelection(
        sandbox.agentSourceKind === 'marketplace_draft' &&
          sandbox.marketplaceAgentId
          ? {
              kind: 'marketplace_draft',
              marketplaceAgentId: String(sandbox.marketplaceAgentId),
            }
          : sandbox.agentSourceKind === 'marketplace_version' &&
              sandbox.marketplaceAgentId
            ? {
                kind: 'marketplace_version',
                marketplaceAgentId: String(sandbox.marketplaceAgentId),
                ...(sandbox.marketplaceVersionId
                  ? {
                      marketplaceVersionId: String(
                        sandbox.marketplaceVersionId,
                      ),
                    }
                  : {}),
              }
            : {
                kind: 'builtin',
                builtinPresetId: sandbox.agentPresetId ?? 'general-engineer',
              },
      )
      const restartPreset = yield* normalizeLaunchInput({
        repoUrl: sandbox.repoUrl,
        branch: sandbox.repoBranch,
        initialPrompt: sandbox.initialPrompt,
        definition: resolvedLaunch.definition,
      })

      const pendingSandboxRef = yield* Ref.make<Doc<'sandboxes'> | null>(null)
      const launchedSandboxRef = yield* Ref.make<LaunchedSandbox | null>(null)
      const completedRef = yield* Ref.make(false)

      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function*() {
          if (Exit.isSuccess(exit) || (yield* Ref.get(completedRef))) {
            return
          }

          const launched = yield* Ref.get(launchedSandboxRef)

          if (launched?.daytonaSandboxId) {
            yield* daytona.deleteOpenCodeSandbox(launched.daytonaSandboxId).pipe(
              Effect.catchAll(() => Effect.void),
            )
          }

          const pendingSandbox = yield* Ref.get(pendingSandboxRef)

          if (pendingSandbox) {
            yield* sandboxMutation({
              try: () =>
                convex.context.convex.mutation(api.sandboxes.markFailed, {
                  sandboxId: pendingSandbox._id,
                  errorMessage: toConvexFailureMessage(Cause.squash(exit.cause)),
                }),
              fallback: 'BuddyPie could not persist the sandbox failure state.',
            }).pipe(Effect.catchAll(() => Effect.void))
          }
        }),
      )

      if (args.paymentMethod === 'delegated_budget') {
        yield* requireDelegatedBudgetAllowance({
          requiredAmountUsdCents: getBillingEventPriceUsdCents(
            restartPreset.agentPresetId,
            'sandbox_launch',
          ),
          actionLabel: `restarting ${sandbox.repoName}`,
        })
      }

      const githubAuth =
        sandbox.repoProvider === 'github'
          ? yield* githubAuthEffect(convex.context.userId)
          : null

      yield* daytona.resolveOpenCodeLaunchConfig({
        definition: resolvedLaunch.definition,
        githubAuth,
      })

      const pendingSandbox = yield* sandboxMutation({
        try: () =>
          convex.context.convex.mutation(api.sandboxes.createPending, {
            repoName: sandbox.repoName,
            agentSourceKind: resolvedLaunch.sourceKind,
            ...(resolvedLaunch.marketplaceAgentId
              ? { marketplaceAgentId: resolvedLaunch.marketplaceAgentId }
              : {}),
            ...(resolvedLaunch.marketplaceVersionId
              ? { marketplaceVersionId: resolvedLaunch.marketplaceVersionId }
              : {}),
            agentPresetId: restartPreset.agentPresetId,
            agentLabel: restartPreset.agentLabel,
            agentProvider: restartPreset.agentProvider,
            agentModel: restartPreset.agentModel,
            initialPrompt: restartPreset.initialPrompt,
            paymentMethod: args.paymentMethod,
            ...(sandbox.repoUrl ? { repoUrl: sandbox.repoUrl } : {}),
            ...(sandbox.repoBranch ? { repoBranch: sandbox.repoBranch } : {}),
            ...(sandbox.repoProvider
              ? { repoProvider: sandbox.repoProvider }
              : {}),
          }),
        fallback: 'BuddyPie could not create the replacement sandbox record.',
      })
      yield* Ref.set(pendingSandboxRef, pendingSandbox)

      const launched = yield* daytona.createOpenCodeSandbox({
        repoUrl: sandbox.repoUrl,
        branch: sandbox.repoBranch,
        agentDefinition: resolvedLaunch.definition,
        initialPrompt: restartPreset.initialPrompt,
        githubAuth,
      })
      yield* Ref.set(launchedSandboxRef, launched)

      if (args.paymentMethod === 'delegated_budget') {
        yield* captureDelegatedLaunchCharge({
          sandboxId: pendingSandbox._id,
          agentPresetId: restartPreset.agentPresetId,
          repoName: sandbox.repoName,
          repoBranch: sandbox.repoBranch,
        })
      }

      const readySandbox = yield* sandboxMutation({
        try: () =>
          convex.context.convex.mutation(api.sandboxes.markReady, {
            sandboxId: pendingSandbox._id,
            daytonaSandboxId: launched.daytonaSandboxId,
            previewUrl: launched.previewUrl,
            previewUrlPattern: launched.previewUrlPattern,
            workspacePath: launched.workspacePath,
            previewAppPath: launched.previewAppPath,
            opencodeSessionId: launched.opencodeSessionId,
          }),
        fallback: 'BuddyPie could not persist the replacement sandbox.',
      })

      if (sandbox.daytonaSandboxId) {
        yield* daytona.deleteOpenCodeSandbox(sandbox.daytonaSandboxId).pipe(
          Effect.catchAll(() => Effect.void),
        )
      }

      yield* sandboxMutation({
        try: () =>
          convex.context.convex.mutation(api.sandboxes.remove, {
            sandboxId: sandbox._id,
          }),
        fallback: 'BuddyPie could not remove the previous sandbox record.',
      })

      yield* Ref.set(completedRef, true)

      return {
        sandboxId: readySandbox._id,
        previewUrl: readySandbox.previewUrl ?? launched.previewUrl,
        agentPresetId: readySandbox.agentPresetId ?? restartPreset.agentPresetId,
      }
    }),
  )
}

export function createSandboxWithPayment(
  input: CreateSandboxInput,
  paymentMethod: BillingPaymentMethod,
) {
  return launchSandboxLifecycle({
    input,
    paymentMethod,
  })
}

export function deleteSandboxRuntime(sandboxId: string) {
  return Effect.gen(function*() {
    const convex = yield* ConvexService
    const daytona = yield* DaytonaService
    const sandbox = yield* convex.getOwnedSandbox(sandboxId)

    if (sandbox.daytonaSandboxId) {
      yield* daytona.deleteOpenCodeSandbox(sandbox.daytonaSandboxId).pipe(
        Effect.catchAll(() => Effect.void),
      )
    }

    yield* sandboxMutation({
      try: () =>
        convex.context.convex.mutation(api.sandboxes.remove, {
          sandboxId: sandbox._id,
        }),
      fallback: 'BuddyPie could not remove the sandbox record.',
    })

    return { removed: true as const }
  })
}

export function restartSandboxWithPayment(
  sandboxId: string,
  paymentMethod: BillingPaymentMethod,
) {
  return restartSandboxLifecycle({
    sandboxId,
    paymentMethod,
  })
}
