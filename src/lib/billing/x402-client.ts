function resolveSupportedChain(chainId: number) {
  switch (chainId) {
    case 8453:
      return import('viem/chains').then(({ base }) => base)
    case 84532:
      return import('viem/chains').then(({ baseSepolia }) => baseSepolia)
    default:
      throw new Error(`Unsupported x402 chain ${chainId}.`)
  }
}

async function readErrorResponseMessage(response: Response) {
  const raw = await response.text().catch(() => '')

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown }

    if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
      return parsed.error.trim()
    }

    if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
      return parsed.message.trim()
    }
  } catch {
    // Fall through to plain-text handling.
  }

  return raw.trim().length > 0 ? raw.trim() : null
}

export async function postJsonWithX402Payment<TResponse>(args: {
  url: string
  body: unknown
  chainId: number
}) {
  const ethereum = (
    window as Window & {
      ethereum?: {
        request: (...args: Array<unknown>) => Promise<unknown>
      }
    }
  ).ethereum

  if (!ethereum) {
    throw new Error('Install a wallet like MetaMask to pay with x402.')
  }

  const [
    { createWalletClient, custom, getAddress, createPublicClient },
    { x402Client },
    { registerExactEvmScheme },
    { toClientEvmSigner },
    { wrapFetchWithPayment },
    chain,
  ] = await Promise.all([
    import('viem'),
    import('@x402/core/client'),
    import('@x402/evm/exact/client'),
    import('@x402/evm'),
    import('@x402/fetch'),
    resolveSupportedChain(args.chainId),
  ])

  const walletClient = createWalletClient({
    chain,
    transport: custom(ethereum),
  })
  const publicClient = createPublicClient({
    chain,
    transport: custom(ethereum),
  })
  const [walletAddress] = await walletClient.requestAddresses()

  if (!walletAddress) {
    throw new Error('Connect your wallet before paying with x402.')
  }

  const normalizedWalletAddress = getAddress(walletAddress)
  const currentChainId = await walletClient.getChainId()

  if (currentChainId !== args.chainId) {
    try {
      await walletClient.switchChain({ id: args.chainId })
    } catch {
      await walletClient.addChain({ chain })
      await walletClient.switchChain({ id: args.chainId })
    }
  }

  const signer = toClientEvmSigner(
    {
      address: normalizedWalletAddress,
      signTypedData: async (message) =>
        await walletClient.signTypedData({
          account: normalizedWalletAddress,
          domain: message.domain,
          types: message.types,
          primaryType: message.primaryType,
          message: message.message,
        }),
    },
    publicClient,
  )
  const paidFetch = wrapFetchWithPayment(
    fetch,
    registerExactEvmScheme(new x402Client(), { signer }),
  )
  const response = await paidFetch(args.url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.body),
  })

  if (!response.ok) {
    throw new Error(
      (await readErrorResponseMessage(response)) ??
        `x402 request failed (${response.status}).`,
    )
  }

  return (await response.json()) as TResponse
}
