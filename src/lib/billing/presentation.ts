import type { SandboxPaymentMethod } from '~/lib/sandboxes'

function startCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function formatBillingEventType(eventType: string) {
  return startCase(eventType)
}

export function formatBillingPaymentRail(paymentRail: string) {
  switch (paymentRail) {
    case 'clerk_credit':
      return 'Clerk credits'
    case 'x402_direct':
      return 'x402 direct'
    case 'metamask_delegated':
      return 'MetaMask delegated'
    case 'migration':
      return 'Migration'
    case 'manual_test':
      return 'Manual test'
    default:
      return startCase(paymentRail)
  }
}

export function formatBillingPlanStatus(status?: string | null) {
  if (!status) {
    return 'No subscription'
  }

  return startCase(status)
}

export function formatBillingPlanPeriod(period?: 'month' | 'annual') {
  if (!period) {
    return null
  }

  return period === 'annual' ? 'Annual' : 'Monthly'
}

export function formatSandboxPaymentMethod(paymentMethod: SandboxPaymentMethod) {
  switch (paymentMethod) {
    case 'credits':
      return 'Credits'
    case 'x402':
      return 'x402'
    case 'delegated_budget':
      return 'Delegated budget'
    default:
      return paymentMethod
  }
}
