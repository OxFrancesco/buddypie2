import { httpRouter } from 'convex/server'
import { api, internal } from './_generated/api'
import { httpAction } from './_generated/server'

const http = httpRouter()

http.route({
  path: '/billing/manual-topup',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return Response.json(
        { error: 'You must be signed in to continue.' },
        { status: 401 },
      )
    }

    const body = (await req.json()) as {
      amountUsdCents?: number
      paymentReference?: string
      idempotencyKey?: string
      source?: 'manual_testnet' | 'x402_settled'
      grossTokenAmount?: string
      metadataJson?: string
    }

    if (
      !Number.isInteger(body.amountUsdCents) ||
      !body.paymentReference ||
      !body.idempotencyKey ||
      !body.source
    ) {
      return Response.json(
        { error: 'Invalid top-up payload.' },
        { status: 400 },
      )
    }

    const amountUsdCents = body.amountUsdCents as number
    const paymentReference = body.paymentReference as string
    const idempotencyKey = body.idempotencyKey as string
    const source = body.source as 'manual_testnet' | 'x402_settled'

    await ctx.runMutation(api.user.ensureCurrentUser, {})

    const account = await ctx.runMutation(internal.billing.recordFundingTopup, {
      tokenIdentifier: identity.tokenIdentifier,
      amountUsdCents,
      paymentReference,
      idempotencyKey,
      source,
      grossTokenAmount: body.grossTokenAmount,
      metadataJson: body.metadataJson,
    })

    return Response.json(account, { status: 200 })
  }),
})

export default http
