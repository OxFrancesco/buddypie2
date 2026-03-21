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
      DelegationManager: '0x1111111111111111111111111111111111111111',
    }),
    contracts: {
      DelegationManager: {
        encode: {
          disableDelegation: () => '0xdeadbeef',
        },
      },
    },
    ...overrides,
  }))
}

describe('sendRevokeDelegatedBudgetUserOperation', () => {
  test('encodes delegation disable plus budget revoke and sends both through the bundler client', async () => {
    const bundlerConfigs = []
    const estimatedUserOperations = []
    const sentUserOperations = []
    const waitedReceipts = []
    const encodedDelegations = []
    const encodedFunctions = []
    const encodedCalls = []
    const signedUserOperations = []
    const stubSignatureInputs = []

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
              return '0xdeadbeef'
            },
          },
        },
      },
    })

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: (config) => {
        bundlerConfigs.push(config)
        return {
          estimateUserOperationGas: async (params) => {
            estimatedUserOperations.push(params)
            return {
              callGasLimit: 111n,
              verificationGasLimit: 222n,
              preVerificationGas: 333n,
            }
          },
          sendUserOperation: async (params) => {
            sentUserOperations.push(params)
            return '0xuserop'
          },
          waitForUserOperationReceipt: async (params) => {
            waitedReceipts.push(params)
            return {
              success: true,
              receipt: {
                status: 'success',
                transactionHash:
                  '0x2222222222222222222222222222222222222222222222222222222222222222',
              },
            }
          },
        }
      },
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    const txHash = await sendRevokeDelegatedBudgetUserOperation({
      chain: {
        id: 84532,
        name: 'Base Sepolia',
      },
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
        getFactoryArgs: async () => ({
          factory: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          factoryData: '0xcafe',
        }),
        getNonce: async () => 7n,
        getStubSignature: async (params) => {
          stubSignatureInputs.push(params)
          return '0xstub'
        },
        encodeCalls: async (calls) => {
          encodedCalls.push(calls)
          return '0xencodedcalls'
        },
        signUserOperation: async (params) => {
          signedUserOperations.push(params)
          return '0xsigned'
        },
      },
      delegation: {
        delegator: '0x4444444444444444444444444444444444444444',
      },
      settlementContract: '0x5555555555555555555555555555555555555555',
      contractBudgetId:
        '0x6666666666666666666666666666666666666666666666666666666666666666',
    })

    expect(txHash).toBe(
      '0x2222222222222222222222222222222222222222222222222222222222222222',
    )
    expect(encodedDelegations).toEqual([
      {
        delegator: '0x4444444444444444444444444444444444444444',
      },
    ])
    expect(bundlerConfigs).toHaveLength(1)
    expect(bundlerConfigs[0].transport).toEqual({
      transport: 'http',
      url: 'https://bundler.example',
    })
    expect(encodedFunctions).toEqual([
      {
        functionName: 'revokeBudget',
        args: [
          '0x6666666666666666666666666666666666666666666666666666666666666666',
        ],
      },
    ])
    expect(encodedCalls).toEqual([
      [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0xdeadbeef',
          value: 0n,
        },
        {
          to: '0x5555555555555555555555555555555555555555',
          data: '0xrevokebudget',
          value: 0n,
        },
      ],
    ])
    expect(stubSignatureInputs).toEqual([
      {
        sender: '0x3333333333333333333333333333333333333333',
        nonce: 7n,
        callData: '0xencodedcalls',
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 2n,
        factory: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        factoryData: '0xcafe',
      },
    ])
    expect(estimatedUserOperations).toEqual([
      {
        sender: '0x3333333333333333333333333333333333333333',
        nonce: 7n,
        callData: '0xencodedcalls',
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 2n,
        factory: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        factoryData: '0xcafe',
        signature: '0xstub',
        entryPointAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ])
    expect(signedUserOperations).toEqual([
      {
        sender: '0x3333333333333333333333333333333333333333',
        nonce: 7n,
        callData: '0xencodedcalls',
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 2n,
        factory: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        factoryData: '0xcafe',
        callGasLimit: 111n,
        verificationGasLimit: 150222n,
        preVerificationGas: 25333n,
        chainId: 84532,
      },
    ])
    expect(sentUserOperations).toEqual([
      {
        sender: '0x3333333333333333333333333333333333333333',
        nonce: 7n,
        callData: '0xencodedcalls',
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 2n,
        factory: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        factoryData: '0xcafe',
        callGasLimit: 111n,
        verificationGasLimit: 150222n,
        preVerificationGas: 25333n,
        signature: '0xsigned',
        entryPointAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ])
    expect(waitedReceipts).toEqual([
      {
        hash: '0xuserop',
        pollingInterval: 2000,
        retryCount: 60,
        timeout: 180000,
      },
    ])
  })

  test('throws a config error when the bundler URL points at the Base Sepolia RPC', async () => {
    const bundlerConfigs = []

    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: (config) => {
        bundlerConfigs.push(config)
        return {}
      },
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
        chainId: 84532,
        bundlerUrl: 'https://sepolia.base.org',
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).rejects.toThrow(
      'Bundler misconfiguration: delegated-budget bundler URL https://sepolia.base.org points to a standard Base Sepolia RPC endpoint',
    )

    expect(bundlerConfigs).toHaveLength(0)
  })

  test('throws a config error when the bundler URL is empty', async () => {
    const bundlerConfigs = []

    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: (config) => {
        bundlerConfigs.push(config)
        return {}
      },
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
        chainId: 84532,
        bundlerUrl: '',
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).rejects.toThrow(
      'Bundler misconfiguration: delegated-budget bundler URL is (empty). Configure DELEGATED_BUDGET_BUNDLER_URL to a bundler RPC such as https://api.pimlico.io/v2/84532/rpc?apikey=<YOUR_PIMLICO_API_KEY>, then refresh BuddyPie and try again.',
    )

    expect(bundlerConfigs).toHaveLength(0)
  })

  test('throws a config error when the endpoint rejects bundler RPC methods', async () => {
    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => {
          throw new Error(
            'HTTP request failed. Details: {"code":-32601,"message":"rpc method is unsupported"} method: eth_estimateUserOperationGas',
          )
        },
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
        chainId: 84532,
        bundlerUrl: 'https://rpc.provider.example/base-sepolia',
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).rejects.toThrow(
      'Bundler misconfiguration: delegated-budget bundler URL https://rpc.provider.example/base-sepolia does not support the ERC-4337 bundler methods BuddyPie needs on Base Sepolia',
    )
  })

  test('retries transient receipt fetch failures from the bundler before failing', async () => {
    const waitedReceipts = []

    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    let receiptAttempts = 0
    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => ({
          callGasLimit: 111n,
          verificationGasLimit: 222n,
          preVerificationGas: 333n,
        }),
        sendUserOperation: async () => '0xuserop',
        waitForUserOperationReceipt: async (params) => {
          waitedReceipts.push(params)
          receiptAttempts += 1

          if (receiptAttempts === 1) {
            throw new Error(
              'HTTP request failed. Failed to fetch',
            )
          }

          return {
            success: true,
            receipt: {
              status: 'success',
              transactionHash:
                '0x7777777777777777777777777777777777777777777777777777777777777777',
            },
          }
        },
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).resolves.toBe(
      '0x7777777777777777777777777777777777777777777777777777777777777777',
    )

    expect(waitedReceipts).toHaveLength(2)
  })

  test('surfaces AA26 verification gas failures clearly', async () => {
    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => ({
          callGasLimit: 111n,
          verificationGasLimit: 222n,
          preVerificationGas: 333n,
        }),
        sendUserOperation: async () => {
          throw new Error('FailedOp(0, AA26 over verificationGasLimit)')
        },
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).rejects.toThrow(
      'The bundler dropped this MetaMask smart-account operation with AA26 over verificationGasLimit.',
    )
  })

  test('surfaces dropped user operations clearly after a receipt timeout', async () => {
    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => ({
          callGasLimit: 111n,
          verificationGasLimit: 222n,
          preVerificationGas: 333n,
        }),
        sendUserOperation: async () => '0xuserop',
        waitForUserOperationReceipt: async () => {
          throw new Error(
            'Timed out while waiting for User Operation with hash "0xuserop" to be confirmed.',
          )
        },
        getUserOperationReceipt: async () => {
          throw new Error('UserOperationReceipt not found.')
        },
        getUserOperation: async () => {
          throw new Error('UserOperation not found.')
        },
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
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
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).rejects.toThrow(
      'The User Operation 0xuserop never produced a receipt before the timeout. The bundler likely dropped it before inclusion.',
    )
  })

  test('retries with a fresh nonce when the bundler rejects the first send with AA25 invalid account nonce', async () => {
    const noncesRead = []
    const sentUserOperations = []

    mockViemModule({
      encodeFunctionData: () => '0xrevokebudget',
    })

    mockDelegationCoreModule()
    mockDelegationToolkitModule()

    let sendAttempts = 0
    mock.module('viem/account-abstraction', () => ({
      createBundlerClient: () => ({
        estimateUserOperationGas: async () => ({
          callGasLimit: 111n,
          verificationGasLimit: 222n,
          preVerificationGas: 333n,
        }),
        sendUserOperation: async (params) => {
          sentUserOperations.push(params)
          sendAttempts += 1

          if (sendAttempts === 1) {
            throw new Error('UserOperation reverted with reason: AA25 invalid account nonce')
          }

          return '0xuserop2'
        },
        waitForUserOperationReceipt: async () => ({
          success: true,
          receipt: {
            status: 'success',
            transactionHash:
              '0x8888888888888888888888888888888888888888888888888888888888888888',
          },
        }),
      }),
    }))

    const { sendRevokeDelegatedBudgetUserOperation } = await import(
      '../src/lib/billing/delegated-budget-client.ts'
    )

    await expect(
      sendRevokeDelegatedBudgetUserOperation({
        chain: {
          id: 84532,
          name: 'Base Sepolia',
        },
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
          getNonce: async () => {
            const nextNonce = noncesRead.length === 0 ? 1n : 2n
            noncesRead.push(nextNonce)
            return nextNonce
          },
          getStubSignature: async () => '0xstub',
          encodeCalls: async () => '0xencodedcalls',
          signUserOperation: async () => '0xsigned',
        },
        delegation: {
          delegator: '0x4444444444444444444444444444444444444444',
        },
        settlementContract: '0x5555555555555555555555555555555555555555',
        contractBudgetId:
          '0x6666666666666666666666666666666666666666666666666666666666666666',
      }),
    ).resolves.toBe(
      '0x8888888888888888888888888888888888888888888888888888888888888888',
    )

    expect(noncesRead).toEqual([1n, 2n])
    expect(sentUserOperations).toHaveLength(2)
    expect(sentUserOperations[0].nonce).toBe(1n)
    expect(sentUserOperations[1].nonce).toBe(2n)
  })
})
