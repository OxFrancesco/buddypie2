import { describe, expect, mock, test } from 'bun:test'

const mockViemModule = (overrides = {}) => {
  mock.module('viem', () => ({
    http: (url) => ({ transport: 'http', url }),
    getAddress: (value) => value,
    encodeFunctionData: () => '0xencoded',
    keccak256: () =>
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    maxUint256:
      0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
    parseAbi: () => [],
    stringToHex: (value) =>
      `0x${Buffer.from(String(value), 'utf8').toString('hex')}`,
    ...overrides,
  }))
}

const mockDelegationCoreModule = () => {
  mock.module('@metamask/delegation-core', () => ({
    hashDelegation: () =>
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  }))
}

const mockDelegationToolkitModule = (overrides = {}) => {
  mock.module('@metamask/delegation-toolkit', () => ({
    createDelegation: () => ({
      salt: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    }),
    getDeleGatorEnvironment: () => ({
      DelegationManager: '0x9999999999999999999999999999999999999999',
    }),
    contracts: {
      DelegationManager: {
        encode: {
          disableDelegation: () => '0xdisabledelegation',
        },
      },
    },
    ...overrides,
  }))
}

describe('delegated budget settlement-contract user operations', () => {
  test('sendCreateDelegatedBudgetUserOperation creates the budget on the settlement contract', async () => {
    const bundlerConfigs = []
    const encodedFunctions = []
    const encodedCalls = []
    const signedUserOperations = []
    const sentUserOperations = []

    mockViemModule({
      encodeFunctionData: ({ functionName, args }) => {
        encodedFunctions.push({ functionName, args })
        return '0xcreatebudget'
      },
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: (config) => {
        bundlerConfigs.push(config)
        return {
          estimateUserOperationGas: async () => ({
            callGasLimit: 111n,
            verificationGasLimit: 222n,
            preVerificationGas: 333n,
          }),
          sendUserOperation: async (params) => {
            sentUserOperations.push(params)
            return '0xuserop'
          },
          waitForUserOperationReceipt: async () => ({
            success: true,
            receipt: {
              status: 'success',
              transactionHash:
                '0x5555555555555555555555555555555555555555555555555555555555555555',
            },
          }),
        }
      },
    }))

    const { sendCreateDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    const txHash = await sendCreateDelegatedBudgetUserOperation({
      chain: { id: 84532, name: 'Base Sepolia' },
      chainId: 84532,
      bundlerUrl: 'https://bundler.example',
      publicClient: {
        estimateFeesPerGas: async () => ({
          maxFeePerGas: 10n,
          maxPriorityFeePerGas: 2n,
        }),
      },
      smartAccount: {
        entryPoint: {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        getAddress: async () =>
          '0x3333333333333333333333333333333333333333',
        getFactoryArgs: async () => ({}),
        getNonce: async () => 7n,
        getStubSignature: async () => '0xstub',
        encodeCalls: async (calls) => {
          encodedCalls.push(calls)
          return '0xencodedcalls'
        },
        signUserOperation: async (params) => {
          signedUserOperations.push(params)
          return '0xsigned'
        },
      },
      settlementContract: '0x1111111111111111111111111111111111111111',
      contractBudgetId:
        '0x2222222222222222222222222222222222222222222222222222222222222222',
      delegatorSmartAccount: '0x3333333333333333333333333333333333333333',
      backendDelegateAddress: '0x4444444444444444444444444444444444444444',
      budgetType: 'periodic',
      interval: 'month',
      amountUsdCents: 2500,
    })

    expect(txHash).toBe(
      '0x5555555555555555555555555555555555555555555555555555555555555555',
    )
    expect(bundlerConfigs).toHaveLength(1)
    expect(encodedFunctions).toEqual([
      {
        functionName: 'createBudget',
        args: [
          '0x2222222222222222222222222222222222222222222222222222222222222222',
          '0x3333333333333333333333333333333333333333',
          '0x4444444444444444444444444444444444444444',
          1,
          3,
          25000000n,
        ],
      },
    ])
    expect(encodedCalls).toEqual([
      [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0xcreatebudget',
          value: 0n,
        },
      ],
    ])
    expect(signedUserOperations).toHaveLength(1)
    expect(sentUserOperations).toHaveLength(1)
  })

  test('sendRevokeDelegatedBudgetUserOperation disables the delegation and revokes the onchain budget', async () => {
    const encodedFunctions = []
    const encodedDelegations = []
    const encodedCalls = []

    mockViemModule({
      encodeFunctionData: ({ functionName, args }) => {
        encodedFunctions.push({ functionName, args })
        return '0xrevokebudget'
      },
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule({
      contracts: {
        DelegationManager: {
          encode: {
            disableDelegation: ({ delegation }) => {
              encodedDelegations.push(delegation)
              return '0xdisabledelegation'
            },
          },
        },
      },
    })

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => ({
          callGasLimit: 111n,
          verificationGasLimit: 222n,
          preVerificationGas: 333n,
        }),
        sendUserOperation: async () => '0xuserop',
        waitForUserOperationReceipt: async () => ({
          success: true,
          receipt: {
            status: 'success',
            transactionHash:
              '0x6666666666666666666666666666666666666666666666666666666666666666',
          },
        }),
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    const txHash = await sendRevokeDelegatedBudgetUserOperation({
      chain: { id: 84532, name: 'Base Sepolia' },
      chainId: 84532,
      bundlerUrl: 'https://bundler.example',
      publicClient: {
        estimateFeesPerGas: async () => ({
          maxFeePerGas: 10n,
          maxPriorityFeePerGas: 2n,
        }),
      },
      smartAccount: {
        entryPoint: {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        getAddress: async () =>
          '0x3333333333333333333333333333333333333333',
        getFactoryArgs: async () => ({}),
        getNonce: async () => 7n,
        getStubSignature: async () => '0xstub',
        encodeCalls: async (calls) => {
          encodedCalls.push(calls)
          return '0xencodedcalls'
        },
        signUserOperation: async () => '0xsigned',
      },
      delegation: {
        delegator: '0x4444444444444444444444444444444444444444',
      },
      settlementContract: '0x1111111111111111111111111111111111111111',
      contractBudgetId:
        '0x2222222222222222222222222222222222222222222222222222222222222222',
    })

    expect(txHash).toBe(
      '0x6666666666666666666666666666666666666666666666666666666666666666',
    )
    expect(encodedDelegations).toEqual([
      {
        delegator: '0x4444444444444444444444444444444444444444',
      },
    ])
    expect(encodedFunctions).toEqual([
      {
        functionName: 'revokeBudget',
        args: [
          '0x2222222222222222222222222222222222222222222222222222222222222222',
        ],
      },
    ])
    expect(encodedCalls).toEqual([
      [
        {
          to: '0x9999999999999999999999999999999999999999',
          data: '0xdisabledelegation',
          value: 0n,
        },
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0xrevokebudget',
          value: 0n,
        },
      ],
    ])
  })
})
