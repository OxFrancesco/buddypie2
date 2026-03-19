import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { getBillingEventPriceUsdCents } from '~/lib/billing/catalog'

const DAYTONA_WEB_TERMINAL_PORT = 22222

export const Route = createFileRoute('/api/x402/sandboxes/$sandboxId/web-terminal')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const [
          { getPortPreviewWithPayment },
          { requireX402Payment },
          { getOwnedSandboxRouteContext, jsonError },
        ] = await Promise.all([
          import('~/features/sandboxes/runtime.server'),
          import('~/lib/server/x402'),
          import('~/routes/api/x402/-_helpers'),
        ])
        const auth = await getOwnedSandboxRouteContext(params.sandboxId)

        if (!auth.ok) {
          return auth.response
        }

        const agentPresetId = auth.sandbox.agentPresetId ?? 'general-engineer'
        const amountUsdCents = getBillingEventPriceUsdCents(
          agentPresetId,
          'web_terminal',
        )

        let payment

        try {
          payment = await requireX402Payment({
            request,
            amountUsdCents,
            resourceDescription: `Open the Daytona web terminal for ${auth.sandbox.repoName}.`,
          })
        } catch (error) {
          return jsonError(
            error instanceof Error ? error.message : 'x402 is not configured correctly.',
            500,
          )
        }

        if (!payment.ok) {
          return payment.response
        }

        try {
          const result = await getPortPreviewWithPayment(
            params.sandboxId,
            DAYTONA_WEB_TERMINAL_PORT,
            'x402',
          )
          const settlement = await payment.settle()

          await auth.convex.mutation(api.billing.recordX402DirectCharge, {
            sandboxId: auth.sandbox._id,
            agentPresetId,
            eventType: 'web_terminal',
            amountUsdCents,
            idempotencyKey: `x402:web_terminal:${settlement.transaction}`,
            description: 'Opened the Daytona web terminal.',
            quantitySummary: `port:${DAYTONA_WEB_TERMINAL_PORT}`,
            externalReference: settlement.transaction,
            metadataJson: JSON.stringify({
              network: settlement.network,
              payer: settlement.payer,
            }),
          })

          return Response.json(result)
        } catch (error) {
          return jsonError(
            error instanceof Error
              ? error.message
              : 'Could not open the Daytona web terminal.',
            400,
          )
        }
      },
    },
  },
})
