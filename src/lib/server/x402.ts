import { getBillingEnvironmentConfig } from '../../../convex/lib/billingConfig'

const X402_PROTOCOL_VERSION = 2
const DEFAULT_X402_FACILITATOR_URL = 'https://x402.org/facilitator'
const DEFAULT_X402_MAX_TIMEOUT_SECONDS = 300
const DEFAULT_X402_EIP712_TOKEN_NAME = 'USDC'
const DEFAULT_X402_EIP712_TOKEN_VERSION = '2'
const USDC_ATOMIC_UNITS_PER_USD_CENT = 10_000

type X402PaymentRequirements = {
  scheme: 'exact'
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: {
    name: string
    version: string
  }
}

type X402PaymentPayload = {
  x402Version?: number
  payload?: Record<string, unknown>
  resource?: Record<string, unknown>
  accepted?: Record<string, unknown>
}

type X402VerifyResponse = {
  isValid?: boolean
  payer?: string
  invalidReason?: string
}

type X402SettleResponse = {
  success?: boolean
  payer?: string
  transaction?: string
  network?: string
  errorReason?: string
  errorMessage?: string
}

function encodeBase64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function decodeBase64Json<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T
}

function usdCentsToUsdcAtomicUnits(amountUsdCents: number) {
  return String(amountUsdCents * USDC_ATOMIC_UNITS_PER_USD_CENT)
}

function getPaymentHeader(req: Request) {
  return req.headers.get('payment-signature') ?? req.headers.get('x-payment')
}

function getX402Config() {
  const environmentConfig = getBillingEnvironmentConfig()
  const facilitatorUrl =
    process.env.X402_FACILITATOR_URL?.trim() || DEFAULT_X402_FACILITATOR_URL
  const payTo = process.env.X402_PAY_TO_ADDRESS?.trim()
  const maxTimeoutCandidate = process.env.X402_MAX_TIMEOUT_SECONDS
    ? Number(process.env.X402_MAX_TIMEOUT_SECONDS)
    : DEFAULT_X402_MAX_TIMEOUT_SECONDS
  const eip712TokenName =
    process.env.X402_EIP712_TOKEN_NAME?.trim() || DEFAULT_X402_EIP712_TOKEN_NAME
  const eip712TokenVersion =
    process.env.X402_EIP712_TOKEN_VERSION?.trim() || DEFAULT_X402_EIP712_TOKEN_VERSION

  if (!payTo) {
    throw new Error('X402_PAY_TO_ADDRESS must be configured for x402 payments.')
  }

  if (!Number.isFinite(maxTimeoutCandidate) || maxTimeoutCandidate <= 0) {
    throw new Error('X402_MAX_TIMEOUT_SECONDS must be a positive number.')
  }

  return {
    facilitatorUrl,
    network: environmentConfig.x402Network,
    asset: environmentConfig.fundingAsset,
    payTo,
    eip712TokenName,
    eip712TokenVersion,
    maxTimeoutSeconds: Math.floor(maxTimeoutCandidate),
  }
}

function buildPaymentRequirements(
  amountUsdCents: number,
  config: ReturnType<typeof getX402Config>,
) {
  return {
    scheme: 'exact',
    network: config.network,
    amount: usdCentsToUsdcAtomicUnits(amountUsdCents),
    asset: config.asset,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    extra: {
      name: config.eip712TokenName,
      version: config.eip712TokenVersion,
    },
  } satisfies X402PaymentRequirements
}

function buildPaymentRequiredResponse(args: {
  request: Request
  amountUsdCents: number
  resourceDescription: string
  requirements: X402PaymentRequirements
}) {
  return {
    x402Version: X402_PROTOCOL_VERSION,
    resource: {
      url: args.request.url,
      mimeType: 'application/json',
      description: args.resourceDescription,
    },
    accepts: [
      {
        scheme: args.requirements.scheme,
        network: args.requirements.network,
        amount: args.requirements.amount,
        asset: args.requirements.asset,
        payTo: args.requirements.payTo,
        maxTimeoutSeconds: args.requirements.maxTimeoutSeconds,
        extra: {
          ...args.requirements.extra,
          amountUsdCents: args.amountUsdCents,
        },
      },
    ],
    error: 'X-PAYMENT header is required',
  }
}

async function runFacilitatorVerification(
  config: ReturnType<typeof getX402Config>,
  paymentPayload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
) {
  const response = await fetch(`${config.facilitatorUrl}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: requirements,
    }),
  })

  if (!response.ok) {
    throw new Error(`x402 verifier rejected the payment check (${response.status}).`)
  }

  return (await response.json()) as X402VerifyResponse
}

async function runFacilitatorSettlement(
  config: ReturnType<typeof getX402Config>,
  paymentPayload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
) {
  const response = await fetch(`${config.facilitatorUrl}/settle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: requirements,
    }),
  })

  if (!response.ok) {
    throw new Error(`x402 settlement failed (${response.status}).`)
  }

  return (await response.json()) as X402SettleResponse
}

export async function requireX402Payment(args: {
  request: Request
  amountUsdCents: number
  resourceDescription: string
}) {
  const config = getX402Config()
  const requirements = buildPaymentRequirements(args.amountUsdCents, config)
  const paymentRequiredPayload = buildPaymentRequiredResponse({
    request: args.request,
    amountUsdCents: args.amountUsdCents,
    resourceDescription: args.resourceDescription,
    requirements,
  })
  const paymentRequiredHeader = encodeBase64Json(paymentRequiredPayload)
  const paymentHeader = getPaymentHeader(args.request)

  if (!paymentHeader) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify(paymentRequiredPayload), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': paymentRequiredHeader,
        },
      }),
    }
  }

  let paymentPayload: X402PaymentPayload

  try {
    paymentPayload = decodeBase64Json<X402PaymentPayload>(paymentHeader)
  } catch {
    return {
      ok: false as const,
      response: new Response(JSON.stringify(paymentRequiredPayload), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': paymentRequiredHeader,
        },
      }),
    }
  }

  const verification = await runFacilitatorVerification(
    config,
    paymentPayload,
    requirements,
  )

  if (!verification.isValid) {
    return {
      ok: false as const,
      response: new Response(
        JSON.stringify({
          ...paymentRequiredPayload,
          error: verification.invalidReason ?? 'invalid_payment',
        }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'PAYMENT-REQUIRED': paymentRequiredHeader,
          },
        },
      ),
    }
  }

  return {
    ok: true as const,
    verification,
    settle: async () => {
      const settlement = await runFacilitatorSettlement(
        config,
        paymentPayload,
        requirements,
      )

      if (!settlement.success || !settlement.transaction) {
        throw new Error(
          settlement.errorReason ??
            settlement.errorMessage ??
            'x402 settlement was not successful',
        )
      }

      return {
        transaction: settlement.transaction,
        network: settlement.network ?? requirements.network,
        payer: settlement.payer ?? verification.payer,
      }
    },
  }
}
