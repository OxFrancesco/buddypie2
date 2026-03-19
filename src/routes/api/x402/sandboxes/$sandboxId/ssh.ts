import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { getBillingEventPriceUsdCents } from '~/lib/billing/catalog'

type SshRequestBody = {
  expiresInMinutes?: number
}

export const Route = createFileRoute('/api/x402/sandboxes/$sandboxId/ssh')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const [
          { createTerminalAccessWithPayment },
          { requireX402Payment },
          { getOwnedSandboxRouteContext, jsonError, parseJsonBody },
        ] = await Promise.all([
          import('~/features/sandboxes/runtime.server'),
          import('~/lib/server/x402'),
          import('~/routes/api/x402/-_helpers'),
        ])
        const auth = await getOwnedSandboxRouteContext(params.sandboxId)

        if (!auth.ok) {
          return auth.response
        }

        const body = await parseJsonBody<SshRequestBody>(request)
        const expiresInMinutes =
          Number.isInteger(body?.expiresInMinutes) && (body?.expiresInMinutes ?? 0) > 0
            ? body?.expiresInMinutes
            : 60
        const agentPresetId = auth.sandbox.agentPresetId ?? 'general-engineer'
        const amountUsdCents = getBillingEventPriceUsdCents(
          agentPresetId,
          'ssh_access',
        )

        let payment

        try {
          payment = await requireX402Payment({
            request,
            amountUsdCents,
            resourceDescription: `Generate SSH access for ${auth.sandbox.repoName}.`,
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
          const result = await createTerminalAccessWithPayment(
            params.sandboxId,
            expiresInMinutes,
            'x402',
          )
          const settlement = await payment.settle()

          await auth.convex.mutation(api.billing.recordX402DirectCharge, {
            sandboxId: auth.sandbox._id,
            agentPresetId,
            eventType: 'ssh_access',
            amountUsdCents,
            idempotencyKey: `x402:ssh_access:${settlement.transaction}`,
            description: 'Generated Daytona SSH access.',
            quantitySummary: `expires:${expiresInMinutes}`,
            externalReference: settlement.transaction,
            metadataJson: JSON.stringify({
              network: settlement.network,
              payer: settlement.payer,
            }),
          })

          return Response.json(result)
        } catch (error) {
          return jsonError(
            error instanceof Error ? error.message : 'Could not create SSH access.',
            400,
          )
        }
      },
    },
  },
})
