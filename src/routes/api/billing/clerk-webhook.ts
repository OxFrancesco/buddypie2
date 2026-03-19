import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import type { WebhookEvent } from '@clerk/tanstack-react-start/webhooks'
import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'
import { clerkClient } from '@clerk/tanstack-react-start/server'
import {
  isClerkBillingWebhookEvent,
  normalizeClerkBillingWebhookEvent,
  normalizeClerkSubscription,
  type ClerkBillingSubscription,
  type NormalizedClerkSubscriptionSnapshot,
} from '~/features/billing/clerk-billing'
import { getConvexAdminClient } from '~/lib/server/authenticated-convex'

export const Route = createFileRoute('/api/billing/clerk-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let event: WebhookEvent

        try {
          event = await verifyWebhook(request)
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not verify the Clerk webhook signature.',
            },
            { status: 400 },
          )
        }

        if (!isClerkBillingWebhookEvent(event)) {
          return Response.json({
            received: true,
            ignored: true,
          })
        }

        let normalized = normalizeClerkBillingWebhookEvent(event)

        if (!normalized) {
          return Response.json({
            received: true,
            ignored: true,
          })
        }

        let effectiveNormalized: NormalizedClerkSubscriptionSnapshot = normalized

        try {
          const client = await clerkClient()
          const subscription = (await client.billing.getUserBillingSubscription(
            effectiveNormalized.clerkUserId,
          )) as ClerkBillingSubscription
          const authoritative = normalizeClerkSubscription(
            effectiveNormalized.clerkUserId,
            subscription,
          )

          if (authoritative) {
            effectiveNormalized = authoritative
          }
        } catch {
          // Fall back to the verified webhook payload if Clerk's billing read model lags briefly.
        }

        const { convex } = await getConvexAdminClient()

        await convex.mutation(api.billing.syncClerkSubscriptionByClerkUserId, {
          clerkUserId: effectiveNormalized.clerkUserId,
          clerkSubscriptionId: effectiveNormalized.clerkSubscriptionId,
          ...(effectiveNormalized.clerkSubscriptionItemId
            ? { clerkSubscriptionItemId: effectiveNormalized.clerkSubscriptionItemId }
            : {}),
          status: effectiveNormalized.status,
          ...(effectiveNormalized.planSlug
            ? { planSlug: effectiveNormalized.planSlug }
            : {}),
          ...(effectiveNormalized.planName
            ? { planName: effectiveNormalized.planName }
            : {}),
          ...(effectiveNormalized.planPeriod
            ? { planPeriod: effectiveNormalized.planPeriod }
            : {}),
          ...(effectiveNormalized.periodStart
            ? { periodStart: effectiveNormalized.periodStart }
            : {}),
          ...(effectiveNormalized.periodEnd
            ? { periodEnd: effectiveNormalized.periodEnd }
            : {}),
          rawJson: effectiveNormalized.rawJson,
        })

        return Response.json({
          received: true,
        })
      },
    },
  },
})
