import type { Address } from 'viem'
import { erc20BalanceAbi } from '~/lib/billing/delegated-budget-contract'

type ConnectedWalletUsdcBalance = {
  walletAddress: string
  balanceUsdCents: number
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string
        params?: unknown[] | object
      }) => Promise<unknown>
    }
  }
}

async function resolveSupportedChain(chainId: number) {
  switch (chainId) {
    case 8453:
      return import('viem/chains').then(({ base }) => base)
    case 84532:
      return import('viem/chains').then(({ baseSepolia }) => baseSepolia)
    default:
      throw new Error(`Unsupported wallet balance chain ${chainId}.`)
  }
}

export async function readConnectedWalletUsdcBalance(args: {
  chainId: number
  tokenAddress: string
}): Promise<ConnectedWalletUsdcBalance | null> {
  const ethereum = window.ethereum

  if (!ethereum) {
    return null
  }

  const accounts = await ethereum.request({
    method: 'eth_accounts',
  })

  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') {
    return null
  }

  const [viem, chain] = await Promise.all([
    import('viem'),
    resolveSupportedChain(args.chainId),
  ])
  const walletAddress = viem.getAddress(accounts[0] as Address)
  const publicClient = viem.createPublicClient({
    chain,
    transport: viem.http(chain.rpcUrls.default.http[0]),
  })
  const balanceAtomic = await publicClient.readContract({
    address: viem.getAddress(args.tokenAddress as Address),
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })

  return {
    walletAddress,
    balanceUsdCents: Number(balanceAtomic / 10_000n),
  }
}
