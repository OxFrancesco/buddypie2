import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { getBillingEventPriceUsdCents } from '~/lib/billing/catalog'

type PreviewRequestBody = {
  port: number
}

const APP_PREVIEW_PORT_MIN = 3000
const APP_PREVIEW_PORT_MAX = 9999

function isValidAppPreviewPort(port: number) {
  return (
    Number.isInteger(port) &&
    port >= APP_PREVIEW_PORT_MIN &&
    port <= APP_PREVIEW_PORT_MAX
  )
}

export const Route = createFileRoute('/api/x402/sandboxes/$sandboxId/preview')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const [
          { ensureAppPreviewServerWithPayment },
          { getSandboxAppPreviewStatus },
          { requireX402Payment },
          { getOwnedSandboxRouteContext, jsonError, parseJsonBody },
        ] = await Promise.all([
          import('~/features/sandboxes/runtime.server'),
          import('~/lib/server/daytona'),
          import('~/lib/server/x402'),
          import('~/routes/api/x402/-_helpers'),
        ])
        const auth = await getOwnedSandboxRouteContext(params.sandboxId)

        if (!auth.ok) {
          return auth.response
        }

        const body = await parseJsonBody<PreviewRequestBody>(request)
        const port = Number(body?.port)

        if (!isValidAppPreviewPort(port)) {
          return jsonError(
            `Choose a valid preview port between ${APP_PREVIEW_PORT_MIN} and ${APP_PREVIEW_PORT_MAX}.`,
            400,
          )
        }

        if (!auth.sandbox.daytonaSandboxId || !auth.sandbox.workspacePath) {
          return jsonError('Sandbox runtime is not ready for app preview yet.', 400)
        }

        try {
          const previewStatus = await getSandboxAppPreviewStatus({
            daytonaSandboxId: auth.sandbox.daytonaSandboxId,
            workspacePath: auth.sandbox.workspacePath,
            previewAppPath: auth.sandbox.previewAppPath,
            agentPresetId: auth.sandbox.agentPresetId,
            port,
          })

          if (previewStatus.status === 'already-running') {
            return Response.json(previewStatus)
          }
        } catch (error) {
          return jsonError(
            error instanceof Error ? error.message : 'Could not inspect the preview status.',
            400,
          )
        }

        const agentPresetId = auth.sandbox.agentPresetId ?? 'general-engineer'
        const amountUsdCents = getBillingEventPriceUsdCents(
          agentPresetId,
          'preview_boot',
        )

        let payment

        try {
          payment = await requireX402Payment({
            request,
            amountUsdCents,
            resourceDescription: `Boot app preview on port ${port} for ${auth.sandbox.repoName}.`,
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
          const result = await ensureAppPreviewServerWithPayment(
            params.sandboxId,
            port,
            'x402',
          )

          if (result.status !== 'started') {
            return Response.json(result)
          }

          const settlement = await payment.settle()

          await auth.convex.mutation(api.billing.recordX402DirectCharge, {
            sandboxId: auth.sandbox._id,
            agentPresetId,
            eventType: 'preview_boot',
            amountUsdCents,
            idempotencyKey: `x402:preview_boot:${settlement.transaction}`,
            description: `Preview boot on port ${port}`,
            quantitySummary: `port:${port}`,
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
              : 'Could not start the app preview server.',
            400,
          )
        }
      },
    },
  },
})
