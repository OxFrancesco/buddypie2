import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import type { Id } from 'convex/_generated/dataModel'
import { Effect } from 'effect'
import { getBillingEventPriceUsdCents } from '~/lib/billing/catalog'
import { normalizeSandboxInputWithDefinition } from '~/lib/sandboxes'
import { resolveMarketplaceLaunchSelection } from '~/lib/server/marketplace'
import {
  PaymentError,
  ValidationError,
} from '~/lib/server/effect/errors'
import { runRouteProgram } from '~/lib/server/effect/runtime'
import {
  executeX402PaymentRoute,
  getAuthenticatedRouteContextProgram,
  parseJsonBody,
} from '~/routes/api/x402/-_helpers'
import {
  getSandboxLaunchQuantitySummary,
  type CreateSandboxInput,
} from '~/lib/sandboxes'

function normalizeUnknownMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

function recordDirectCharge<T>(options: {
  auth: Awaited<
    ReturnType<typeof import('~/lib/server/authenticated-convex').getAuthenticatedConvexClient>
  > & {
    normalized: ReturnType<typeof normalizeSandboxInputWithDefinition>
  }
  result: T & {
    sandboxId: string
    agentPresetId: string
  }
  amountUsdCents: number
  idempotencyKey: string
  description: string
  quantitySummary?: string
  settlement: {
    transaction: string
    network: string
    payer?: string
  }
  metadata?: Record<string, unknown>
}) {
  return Effect.tryPromise({
    try: () =>
      options.auth.convex.mutation(api.billing.recordX402DirectCharge, {
        sandboxId: options.result.sandboxId as Id<'sandboxes'>,
        agentPresetId: options.result.agentPresetId,
        eventType: 'sandbox_launch',
        amountUsdCents: options.amountUsdCents,
        idempotencyKey: options.idempotencyKey,
        description: options.description,
        quantitySummary: options.quantitySummary,
        externalReference: options.settlement.transaction,
        metadataJson: JSON.stringify({
          network: options.settlement.network,
          payer: options.settlement.payer,
          ...(options.metadata ?? {}),
        }),
      }),
    catch: (error) =>
      new PaymentError({
        message: normalizeUnknownMessage(
          error,
          'BuddyPie could not record the x402 charge.',
        ),
        cause: error,
      }),
  })
}

export const Route = createFileRoute('/api/x402/sandboxes/create')({
  server: {
    handlers: {
      POST: ({ request }) =>
        runRouteProgram(
          Effect.gen(function*() {
            const [{ createSandboxWithPayment }] = yield* Effect.tryPromise({
              try: () => Promise.all([import('~/features/sandboxes/runtime.server')]),
              catch: (error) =>
                new ValidationError({
                  message: normalizeUnknownMessage(
                    error,
                    'BuddyPie could not load the sandbox runtime.',
                  ),
                  cause: error,
                }),
            })
            const body = yield* Effect.tryPromise({
              try: () => parseJsonBody<CreateSandboxInput>(request),
              catch: (error) =>
                new ValidationError({
                  message: normalizeUnknownMessage(
                    error,
                    'A JSON payload is required to create a sandbox.',
                  ),
                  cause: error,
                }),
            })

            if (!body) {
              return yield* Effect.fail(
                new ValidationError({
                  message: 'A JSON payload is required to create a sandbox.',
                }),
              )
            }

            return yield* executeX402PaymentRoute({
              request,
              context: Effect.gen(function*() {
                const auth = yield* getAuthenticatedRouteContextProgram()
                const resolvedLaunch = yield* Effect.tryPromise({
                  try: () =>
                    resolveMarketplaceLaunchSelection({
                      client: auth,
                      selection: body.launchSelection ?? {
                        kind: 'builtin',
                        builtinPresetId:
                          body.agentPresetId ?? 'general-engineer',
                      },
                    }),
                  catch: (error) =>
                    new ValidationError({
                      message: normalizeUnknownMessage(
                        error,
                        'Marketplace launch selection is invalid.',
                      ),
                      cause: error,
                    }),
                })
                const normalized = yield* Effect.try({
                  try: () =>
                    normalizeSandboxInputWithDefinition({
                      repoUrl: body.repoUrl,
                      branch: body.branch,
                      initialPrompt: body.initialPrompt,
                      definition: resolvedLaunch.definition,
                    }),
                  catch: (error) =>
                    new ValidationError({
                      message: normalizeUnknownMessage(
                        error,
                        'Sandbox input is invalid.',
                      ),
                      cause: error,
                    }),
                })

                return {
                  ...auth,
                  normalized,
                }
              }),
              amountUsdCents: ({ normalized }) =>
                getBillingEventPriceUsdCents(
                  normalized.agentPresetId,
                  'sandbox_launch',
                ),
              resourceDescription: ({ normalized }) =>
                `Launch ${normalized.repoName} with ${normalized.agentLabel}.`,
              execute: () =>
                createSandboxWithPayment(
                  {
                    ...body,
                    paymentMethod: 'x402',
                  },
                  'x402',
                ),
              recordCharge: (auth, settlement, result) =>
                recordDirectCharge({
                  auth,
                  result,
                  amountUsdCents: getBillingEventPriceUsdCents(
                    auth.normalized.agentPresetId,
                    'sandbox_launch',
                  ),
                  idempotencyKey: `x402:sandbox_launch:${settlement.transaction}`,
                  description: `OpenCode sandbox launch for ${auth.normalized.repoName}`,
                  quantitySummary: getSandboxLaunchQuantitySummary({
                    repoUrl: auth.normalized.repoUrl,
                    branch: auth.normalized.branch,
                  }),
                  settlement,
                }),
            })
          }),
        ),
    },
  },
})
