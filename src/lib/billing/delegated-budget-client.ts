import type { Address } from 'viem'
import {
  buildDelegatedBudgetId,
  delegatedBudgetContractAbi,
  getDelegatedBudgetApprovalAmount,
  type DelegatedBudgetInterval,
  type DelegatedBudgetType,
  usdCentsToUsdcAtomic,
} from '~/lib/billing/delegated-budget-contract'

type DelegatedBudgetSetupArgs = {
  amountUsdCents: number
  budgetType: DelegatedBudgetType
  interval?: DelegatedBudgetInterval | null
  chainId: number
  settlementContract: string
  backendDelegateAddress: string
  tokenAddress: string
}

type DelegatedBudgetSetupResult = {
  contractBudgetId: string
  budgetType: DelegatedBudgetType
  interval?: DelegatedBudgetInterval | null
  configuredAmountUsdCents: number
  remainingAmountUsdCents: number
  periodStartedAt: number | null
  periodEndsAt: number | null
  ownerAddress: string
  delegatorSmartAccount: string
  delegateAddress: string
  delegationJson: string
  delegationHash: string
  delegationExpiresAt: number
  approvalMode: 'exact' | 'standing'
  approvalTxHash: string
  createTxHash: string
}

declare global {
  interface Window {
    ethereum?: {
      request: (
        args: {
          method: string
          params?: unknown[] | object
        },
      ) => Promise<unknown>
    }
  }
}

function resolveSupportedChain(chainId: number) {
  switch (chainId) {
    case 8453:
      return import('viem/chains').then(({ base }) => base)
    case 84532:
      return import('viem/chains').then(({ baseSepolia }) => baseSepolia)
    default:
      throw new Error(`Unsupported delegated-budget chain ${chainId}.`)
  }
}

function stringifyDelegation(value: unknown) {
  return JSON.stringify(value)
}

export async function createDelegatedBudgetWithWallet(
  args: DelegatedBudgetSetupArgs,
): Promise<DelegatedBudgetSetupResult> {
  const ethereum = window.ethereum

  if (!ethereum) {
    throw new Error('Install MetaMask before setting up a delegated budget.')
  }

  const chain = await resolveSupportedChain(args.chainId)
  const [viem, toolkit] = await Promise.all([
    import('viem'),
    import('@metamask/delegation-toolkit'),
  ])
  const transport = viem.custom(ethereum as never)
  const walletClientWithoutAccount = viem.createWalletClient({
    chain,
    transport,
  })
  const currentChainId = await walletClientWithoutAccount.getChainId()

  if (currentChainId !== args.chainId) {
    try {
      await walletClientWithoutAccount.switchChain({ id: args.chainId })
    } catch {
      throw new Error(`Switch MetaMask to ${chain.name} before continuing.`)
    }
  }

  const [ownerAddress] = await walletClientWithoutAccount.requestAddresses()

  if (!ownerAddress) {
    throw new Error('Connect MetaMask before setting up a delegated budget.')
  }

  const normalizedOwnerAddress = viem.getAddress(ownerAddress)
  const walletClient = viem.createWalletClient({
    account: normalizedOwnerAddress,
    chain,
    transport,
  })
  const publicClient = viem.createPublicClient({
    chain,
    transport: viem.http(chain.rpcUrls.default.http[0]),
  })
  const smartAccount = await toolkit.toMetaMaskSmartAccount({
    client: publicClient as never,
    implementation: toolkit.Implementation.Hybrid,
    deployParams: [normalizedOwnerAddress, [], [], []],
    deploySalt: '0x',
    signer: { walletClient: walletClient as never },
  })
  const delegatorSmartAccount = viem.getAddress(smartAccount.address)
  const backendDelegateAddress = viem.getAddress(
    args.backendDelegateAddress as Address,
  )
  const settlementContract = viem.getAddress(args.settlementContract as Address)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const delegationExpiresAt = (nowSeconds + 365 * 24 * 60 * 60) * 1000
  const contractBudgetId = buildDelegatedBudgetId(
    `buddypie:${normalizedOwnerAddress}:${delegatorSmartAccount}:${Date.now()}`,
  )
  const unsignedDelegation = toolkit.createDelegation({
    environment: toolkit.getDeleGatorEnvironment(args.chainId),
    scope: {
      type: 'functionCall',
      targets: [settlementContract],
      selectors: ['settleBudget(bytes32,bytes32,uint256)'],
    },
    from: delegatorSmartAccount,
    to: backendDelegateAddress,
  })
  const signature = await smartAccount.signDelegation({
    delegation: unsignedDelegation,
    chainId: args.chainId,
  })
  const signedDelegation = {
    ...unsignedDelegation,
    signature,
  }
  const approvalAmount = getDelegatedBudgetApprovalAmount({
    amountUsdCents: args.amountUsdCents,
    budgetType: args.budgetType,
  })
  const approvalTxHash = await walletClient.writeContract({
    account: normalizedOwnerAddress,
    address: viem.getAddress(args.tokenAddress as Address),
    abi: [
      {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ],
    functionName: 'approve',
    args: [settlementContract, approvalAmount],
  })
  await publicClient.waitForTransactionReceipt({
    hash: approvalTxHash,
  })
  const createTxHash = await walletClient.writeContract({
    account: normalizedOwnerAddress,
    address: settlementContract,
    abi: delegatedBudgetContractAbi,
    functionName: 'createBudget',
    args: [
      contractBudgetId as `0x${string}`,
      delegatorSmartAccount,
      backendDelegateAddress,
      args.budgetType === 'periodic' ? 1 : 0,
      args.interval === 'day' ? 1 : args.interval === 'week' ? 2 : args.interval === 'month' ? 3 : 0,
      usdCentsToUsdcAtomic(args.amountUsdCents),
    ],
  })
  await publicClient.waitForTransactionReceipt({
    hash: createTxHash,
  })
  const rawBudget = (await publicClient.readContract({
    address: settlementContract,
    abi: delegatedBudgetContractAbi,
    functionName: 'getBudget',
    args: [contractBudgetId as `0x${string}`],
  })) as {
    configuredAmount: bigint
    remainingAmount: bigint
    periodStartAt: bigint
    periodEndsAt: bigint
  }
  const onchainBudget = {
    configuredAmountUsdCents: Number(rawBudget.configuredAmount / 10_000n),
    remainingAmountUsdCents: Number(rawBudget.remainingAmount / 10_000n),
    periodStartedAt:
      rawBudget.periodStartAt > 0n ? Number(rawBudget.periodStartAt) * 1000 : null,
    periodEndsAt:
      rawBudget.periodEndsAt > 0n ? Number(rawBudget.periodEndsAt) * 1000 : null,
  }

  return {
    contractBudgetId,
    budgetType: args.budgetType,
    ...(args.budgetType === 'periodic' ? { interval: args.interval ?? null } : {}),
    configuredAmountUsdCents: onchainBudget.configuredAmountUsdCents,
    remainingAmountUsdCents: onchainBudget.remainingAmountUsdCents,
    periodStartedAt: onchainBudget.periodStartedAt,
    periodEndsAt: onchainBudget.periodEndsAt,
    ownerAddress: normalizedOwnerAddress,
    delegatorSmartAccount,
    delegateAddress: backendDelegateAddress,
    delegationJson: stringifyDelegation(signedDelegation),
    delegationHash: viem.keccak256(
      viem.stringToHex(stringifyDelegation(signedDelegation)),
    ),
    delegationExpiresAt,
    approvalMode: args.budgetType === 'periodic' ? 'standing' : 'exact',
    approvalTxHash,
    createTxHash,
  }
}

export async function revokeDelegatedBudgetWithWallet(args: {
  chainId: number
  settlementContract: string
  contractBudgetId: string
}) {
  const ethereum = window.ethereum

  if (!ethereum) {
    throw new Error('Install MetaMask before revoking a delegated budget.')
  }

  const chain = await resolveSupportedChain(args.chainId)
  const viem = await import('viem')
  const transport = viem.custom(ethereum as never)
  const walletClientWithoutAccount = viem.createWalletClient({
    chain,
    transport,
  })
  const currentChainId = await walletClientWithoutAccount.getChainId()

  if (currentChainId !== args.chainId) {
    try {
      await walletClientWithoutAccount.switchChain({ id: args.chainId })
    } catch {
      throw new Error(`Switch MetaMask to ${chain.name} before continuing.`)
    }
  }

  const [ownerAddress] = await walletClientWithoutAccount.requestAddresses()

  if (!ownerAddress) {
    throw new Error('Connect MetaMask before revoking a delegated budget.')
  }

  const normalizedOwnerAddress = viem.getAddress(ownerAddress)
  const walletClient = viem.createWalletClient({
    account: normalizedOwnerAddress,
    chain,
    transport,
  })
  const publicClient = viem.createPublicClient({
    chain,
    transport: viem.http(chain.rpcUrls.default.http[0]),
  })
  const txHash = await walletClient.writeContract({
    account: normalizedOwnerAddress,
    address: viem.getAddress(args.settlementContract as Address),
    abi: delegatedBudgetContractAbi,
    functionName: 'revokeBudget',
    args: [args.contractBudgetId as `0x${string}`],
  })
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

  return {
    txHash,
  }
}
