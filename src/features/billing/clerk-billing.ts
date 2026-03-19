import type { WebhookEvent } from '@clerk/tanstack-react-start/webhooks'

type ClerkBillingPlan = {
  name?: string | null
  slug?: string | null
}

export type ClerkBillingSubscriptionItem = {
  id?: string
  status?: string
  plan_period?: 'month' | 'annual'
  period_start?: number
  period_end?: number | null
  plan?: ClerkBillingPlan | null
}

type ClerkBillingSubscriptionPayer = {
  user_id?: string
}

export type ClerkBillingSubscription = {
  id?: string
  status?: string
  payer?: ClerkBillingSubscriptionPayer | null
  subscriptionItems?: Array<ClerkBillingSubscriptionItem> | null
  subscription_items?: Array<ClerkBillingSubscriptionItem> | null
}

export type NormalizedClerkSubscriptionSnapshot = {
  clerkUserId: string
  clerkSubscriptionId: string
  clerkSubscriptionItemId?: string
  status:
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'ended'
    | 'abandoned'
    | 'incomplete'
    | 'upcoming'
  planSlug?: string
  planName?: string
  planPeriod?: 'month' | 'annual'
  periodStart?: number
  periodEnd?: number
  rawJson?: string
}

function getSubscriptionItems(
  subscription: ClerkBillingSubscription | null | undefined,
) {
  return subscription?.subscriptionItems ?? subscription?.subscription_items ?? undefined
}

function pickPrimarySubscriptionItem(
  items: Array<ClerkBillingSubscriptionItem> | undefined | null,
) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    items.find((item) => item.status === 'active' && item.plan?.slug) ??
    items.find((item) => item.plan?.slug) ??
    items[0]
  )
}

export function normalizeClerkSubscription(
  clerkUserId: string,
  subscription: ClerkBillingSubscription | null | undefined,
): NormalizedClerkSubscriptionSnapshot | null {
  if (!clerkUserId || !subscription?.id || !subscription.status) {
    return null
  }

  const item = pickPrimarySubscriptionItem(getSubscriptionItems(subscription))

  return {
    clerkUserId,
    clerkSubscriptionId: subscription.id,
    clerkSubscriptionItemId: item?.id,
    status: subscription.status as NormalizedClerkSubscriptionSnapshot['status'],
    planSlug: item?.plan?.slug ?? undefined,
    planName: item?.plan?.name ?? undefined,
    planPeriod: item?.plan_period ?? undefined,
    periodStart: item?.period_start ?? undefined,
    periodEnd: item?.period_end ?? undefined,
    rawJson: JSON.stringify(subscription),
  }
}

type BillingWebhookSubscriptionItem = ClerkBillingSubscriptionItem & {
  payer?: ClerkBillingSubscriptionPayer | null
  subscription?: {
    id?: string
  } | null
}

type BillingWebhookSubscription = ClerkBillingSubscription & {
  items?: Array<BillingWebhookSubscriptionItem> | null
}

function pickPrimaryWebhookItem(
  items:
    | Array<BillingWebhookSubscriptionItem>
    | undefined
    | null,
) {
  if (!items || items.length === 0) {
    return null
  }

  return items.find((item) => item.status === 'active' && item.plan?.slug) ?? items[0]
}

export function isClerkBillingWebhookEvent(event: WebhookEvent) {
  return (
    event.type.startsWith('subscription.') ||
    event.type.startsWith('subscriptionItem.')
  )
}

export function normalizeClerkBillingWebhookEvent(
  event: WebhookEvent,
): NormalizedClerkSubscriptionSnapshot | null {
  if (event.type.startsWith('subscriptionItem.')) {
    const data = event.data as BillingWebhookSubscriptionItem
    const clerkUserId = data.payer?.user_id
    const clerkSubscriptionId = data.subscription?.id ?? data.id

    if (!clerkUserId || !clerkSubscriptionId || !data.id || !data.status) {
      return null
    }

    return {
      clerkUserId,
      clerkSubscriptionId,
      clerkSubscriptionItemId: data.id,
      status: data.status as NormalizedClerkSubscriptionSnapshot['status'],
      planSlug: data.plan?.slug ?? undefined,
      planName: data.plan?.name ?? undefined,
      planPeriod: data.plan_period ?? undefined,
      periodStart: data.period_start ?? undefined,
      periodEnd: data.period_end ?? undefined,
      rawJson: JSON.stringify(event.data),
    } satisfies NormalizedClerkSubscriptionSnapshot
  }

  if (event.type.startsWith('subscription.')) {
    const data = event.data as BillingWebhookSubscription
    const item = pickPrimaryWebhookItem(data.items)
    const clerkUserId = data.payer?.user_id

    if (!clerkUserId || !data.id || !data.status) {
      return null
    }

    return {
      clerkUserId,
      clerkSubscriptionId: data.id,
      clerkSubscriptionItemId: item?.id,
      status: data.status as NormalizedClerkSubscriptionSnapshot['status'],
      planSlug: item?.plan?.slug ?? undefined,
      planName: item?.plan?.name ?? undefined,
      planPeriod: item?.plan_period ?? undefined,
      periodStart: item?.period_start ?? undefined,
      periodEnd: item?.period_end ?? undefined,
      rawJson: JSON.stringify(event.data),
    } satisfies NormalizedClerkSubscriptionSnapshot
  }

  return null
}
