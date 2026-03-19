import {
  ExecutionMode,
  createExecution,
  getDeleGatorEnvironment,
  redeemDelegations,
  type Delegation,
} from '@metamask/delegation-toolkit'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import {
  delegatedBudgetContractAbi,
  type DelegatedBudgetInterval,
  type DelegatedBudgetType,
  usdCentsToUsdcAtomic,
} from '~/lib/billing/delegated-budget-contract'
import {
  getBillingEnvironmentConfig,
  getDelegatedBudgetEnvironmentConfig,
} from '../../../convex/lib/billingConfig'

type ChainConfig = typeof base | typeof baseSepolia

type OnchainBudgetRecord = {
  owner: Address
  delegate: Address
  delegatorSmartAccount: Address
  token: Address
  configuredAmount: bigint
  remainingAmount: bigint
  periodStartAt: bigint
  periodEndsAt: bigint
  lastSettlementAt: bigint
  lastRevokedAt: bigint
  budgetType: number
  interval: number
  active: boolean
  revoked: boolean
}

export type DelegatedBudgetOnchainState = {
  status: 'active' | 'revoked' | 'expired'
  budgetType: DelegatedBudgetType
  interval: DelegatedBudgetInterval | null
  configuredAmountUsdCents: number
  remainingAmountUsdCents: number
  ownerAddress: Address
  delegateAddress: Address
  delegatorSmartAccount: Address
  periodStartedAt: number | null
  periodEndsAt: number | null
  lastSettlementAt: number | null
  lastRevokedAt: number | null
}

function readEnvironmentScopedValue(baseName: string) {
  const billingEnvironment = getBillingEnvironmentConfig().environment
  const scopedName =
    billingEnvironment === 'production'
      ? `${baseName}_PRODUCTION`
      : `${baseName}_STAGING`

  return process.env[scopedName]?.trim() || process.env[baseName]?.trim() || ''
}

function resolveDelegatedBudgetChain(): ChainConfig {
  const billing = getBillingEnvironmentConfig()
  return billing.chainId === 8453 ? base : baseSepolia
}

function resolveRpcUrl(chain: ChainConfig) {
  return (
    readEnvironmentScopedValue('DELEGATED_BUDGET_RPC_URL') ||
    readEnvironmentScopedValue('BASE_RPC_URL') ||
    chain.rpcUrls.default.http[0]
  )
}

function resolveBackendDelegatePrivateKey() {
  const privateKey =
    readEnvironmentScopedValue('DELEGATED_BUDGET_BACKEND_PRIVATE_KEY') ||
    process.env.EVM_PRIVATE_KEY?.trim() ||
    ''

  if (!privateKey) {
    throw new Error(
      'Set DELEGATED_BUDGET_BACKEND_PRIVATE_KEY before using delegated budgets.',
    )
  }

  return privateKey as Hex
}

function createOnchainClients() {
  const delegatedBudget = getDelegatedBudgetEnvironmentConfig()

  if (!delegatedBudget.enabled) {
    throw new Error('Delegated budgets are not configured in this environment.')
  }

  const chain = resolveDelegatedBudgetChain()
  const transport = http(resolveRpcUrl(chain))
  const delegateAccount = privateKeyToAccount(resolveBackendDelegatePrivateKey())

  if (
    getAddress(delegateAccount.address) !==
    getAddress(delegatedBudget.backendDelegateAddress as Address)
  ) {
    throw new Error(
      'DELEGATED_BUDGET_BACKEND_PRIVATE_KEY does not match the configured backend delegate address.',
    )
  }

  const publicClient = createPublicClient({
    chain,
    transport,
  })
  const walletClient = createWalletClient({
    account: delegateAccount,
    chain,
    transport,
  })

  return {
    chain,
    delegatedBudget,
    delegateAccount,
    publicClient,
    walletClient,
  }
}

function atomicToUsdCents(value: bigint) {
  return Number(value / 10_000n)
}

function contractEnumToBudgetType(value: number): DelegatedBudgetType {
  return value === 1 ? 'periodic' : 'fixed'
}

function contractEnumToInterval(value: number): DelegatedBudgetInterval | null {
  switch (value) {
    case 1:
      return 'day'
    case 2:
      return 'week'
    case 3:
      return 'month'
    default:
      return null
  }
}

function fromUnixSecondsMs(value: bigint) {
  return value > 0n ? Number(value) * 1000 : null
}

function advancePeriodEndMs(
  periodStartAt: number,
  interval: DelegatedBudgetInterval,
) {
  if (interval === 'day') {
    return periodStartAt + 24 * 60 * 60 * 1000
  }

  if (interval === 'week') {
    return periodStartAt + 7 * 24 * 60 * 60 * 1000
  }

  const nextDate = new Date(periodStartAt)
  nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
  return nextDate.getTime()
}

function normalizeOnchainBudgetState(
  rawBudget: OnchainBudgetRecord,
): DelegatedBudgetOnchainState {
  const budgetType = contractEnumToBudgetType(rawBudget.budgetType)
  const interval = contractEnumToInterval(rawBudget.interval)
  let remainingAmountUsdCents = atomicToUsdCents(rawBudget.remainingAmount)
  let periodStartedAt = fromUnixSecondsMs(rawBudget.periodStartAt)
  let periodEndsAt = fromUnixSecondsMs(rawBudget.periodEndsAt)

  if (
    budgetType === 'periodic' &&
    interval &&
    periodStartedAt &&
    periodEndsAt &&
    Date.now() >= periodEndsAt
  ) {
    while (Date.now() >= periodEndsAt) {
      periodStartedAt = periodEndsAt
      periodEndsAt = advancePeriodEndMs(periodStartedAt, interval)
    }

    remainingAmountUsdCents = atomicToUsdCents(rawBudget.configuredAmount)
  }

  return {
    status: rawBudget.revoked
      ? 'revoked'
      : rawBudget.active
        ? 'active'
        : 'expired',
    budgetType,
    interval,
    configuredAmountUsdCents: atomicToUsdCents(rawBudget.configuredAmount),
    remainingAmountUsdCents,
    ownerAddress: getAddress(rawBudget.owner),
    delegateAddress: getAddress(rawBudget.delegate),
    delegatorSmartAccount: getAddress(rawBudget.delegatorSmartAccount),
    periodStartedAt,
    periodEndsAt,
    lastSettlementAt: fromUnixSecondsMs(rawBudget.lastSettlementAt),
    lastRevokedAt: fromUnixSecondsMs(rawBudget.lastRevokedAt),
  }
}

export function buildDelegatedBudgetId(seed: string) {
  return keccak256(stringToHex(seed))
}

export function buildDelegatedBudgetSettlementId(idempotencyKey: string) {
  return keccak256(stringToHex(`settlement:${idempotencyKey}`))
}

export async function readDelegatedBudgetOnchain(contractBudgetId: string) {
  const { delegatedBudget, publicClient } = createOnchainClients()
  const rawBudget = (await publicClient.readContract({
    address: delegatedBudget.settlementContract as Address,
    abi: delegatedBudgetContractAbi,
    functionName: 'getBudget',
    args: [contractBudgetId as Hex],
  })) as OnchainBudgetRecord

  return normalizeOnchainBudgetState(rawBudget)
}

async function submitDelegatedBudgetSettlement(args: {
  contractBudgetId: string
  delegationJson: string
  amountUsdCents: number
  settlementId: Hex
}) {
  const { chain, delegatedBudget, publicClient, walletClient } = createOnchainClients()
  const callData = encodeFunctionData({
    abi: delegatedBudgetContractAbi,
    functionName: 'settleBudget',
    args: [
      args.contractBudgetId as Hex,
      args.settlementId,
      usdCentsToUsdcAtomic(args.amountUsdCents),
    ],
  })

  try {
    const delegation = JSON.parse(args.delegationJson) as Delegation
    const environment = getDeleGatorEnvironment(chain.id)
    const txHash = await redeemDelegations(
      walletClient as never,
      publicClient as never,
      environment.DelegationManager as Address,
      [
        {
          permissionContext: [delegation],
          executions: [
            createExecution({
              target: delegatedBudget.settlementContract as Address,
              callData,
              value: 0n,
            }),
          ],
          mode: ExecutionMode.SingleDefault,
        },
      ],
    )
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })

    if (receipt.status === 'success') {
      return txHash
    }
  } catch {
    // Fall through to the direct delegate call when the delegation path is unavailable.
  }

  const txHash = await walletClient.writeContract({
    address: delegatedBudget.settlementContract as Address,
    abi: delegatedBudgetContractAbi,
    functionName: 'settleBudget',
    args: [
      args.contractBudgetId as Hex,
      args.settlementId,
      usdCentsToUsdcAtomic(args.amountUsdCents),
    ],
  })
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  })

  if (receipt.status !== 'success') {
    throw new Error('Delegated-budget settlement transaction reverted.')
  }

  return txHash
}

export async function settleDelegatedBudgetOnchain(args: {
  contractBudgetId: string
  delegationJson: string
  amountUsdCents: number
  idempotencyKey: string
}) {
  const settlementId = buildDelegatedBudgetSettlementId(args.idempotencyKey)
  const txHash = await submitDelegatedBudgetSettlement({
    contractBudgetId: args.contractBudgetId,
    delegationJson: args.delegationJson,
    amountUsdCents: args.amountUsdCents,
    settlementId,
  })
  const budget = await readDelegatedBudgetOnchain(args.contractBudgetId)

  return {
    txHash,
    settlementId,
    budget,
  }
}
