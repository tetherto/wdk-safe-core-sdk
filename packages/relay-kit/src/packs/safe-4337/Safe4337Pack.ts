import { getAddress, toHex, isHex } from 'viem'
import semverSatisfies from 'semver/functions/satisfies.js'
import Safe, {
  EthSafeSignature,
  encodeMultiSendData,
  getMultiSendContract,
  PasskeyClient,
  SafeProvider,
  generateOnChainIdentifier,
  SafeAccountConfig,
  predictSafeAddress
} from '@wdk-safe-global/protocol-kit'
import { SafeVersion } from '@safe-global/types-kit'
import { RelayKitBasePack } from '@wdk-safe-global/relay-kit/RelayKitBasePack'
import {
  OperationType,
  SafeOperationConfirmation,
  SafeOperationResponse,
  SafeSignature,
  SigningMethod
} from '@safe-global/types-kit'
import {
  getSafeModuleSetupDeployment,
  getSafe4337ModuleDeployment,
  getSafeWebAuthnShareSignerDeployment
} from '@safe-global/safe-modules-deployments'
import {
  getSafeL2SingletonDeployment,
  getProxyFactoryDeployment,
  getMultiSendDeployment
} from '@safe-global/safe-deployments'
import {
  Hash,
  encodeFunctionData,
  zeroAddress,
  Hex,
  concat,
  keccak256,
  slice,
  encodeAbiParameters,
  parseAbiParameters,
  pad
} from 'viem'
import BaseSafeOperation from '@wdk-safe-global/relay-kit/packs/safe-4337/BaseSafeOperation'
import SafeOperationFactory from '@wdk-safe-global/relay-kit/packs/safe-4337/SafeOperationFactory'
import {
  EstimateFeeProps,
  Safe4337CreateTransactionProps,
  Safe4337ExecutableProps,
  Safe4337InitOptions,
  Safe4337Options,
  UserOperationReceipt,
  UserOperationWithPayload,
  PaymasterOptions,
  BundlerClient
} from '@wdk-safe-global/relay-kit/packs/safe-4337/types'
import {
  ABI,
  DEFAULT_SAFE_VERSION,
  DEFAULT_SAFE_MODULES_VERSION,
  RPC_4337_CALLS
} from '@wdk-safe-global/relay-kit/packs/safe-4337/constants'
import {
  entryPointToSafeModules,
  getDummySignature,
  createBundlerClient,
  userOperationToHexValues,
  getRelayKitVersion,
  createUserOperation
} from '@wdk-safe-global/relay-kit/packs/safe-4337/utils'
import { PimlicoFeeEstimator } from '@wdk-safe-global/relay-kit/packs/safe-4337/estimators/pimlico/PimlicoFeeEstimator'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_DATA = '0x'

function asHex(hex?: string): Hex {
  return isHex(hex) ? (hex as Hex) : (`0x${hex}` as Hex)
}

const MAX_ERC20_AMOUNT_TO_APPROVE =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn

const EQ_OR_GT_1_4_1 = '>=1.4.1'

const SAFE_PROXY_CREATION_CODES = {
  latest:
    '0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564',
  zkSync: {
    latest:
      '0x0000000000000000000000000000000000000000000000000000000000000000000000000100003b6cfa15bd7d1cae1c9c022074524d7785d34859ad0576d8fab4305d4f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
  }
} as const

const ZKSYNC_CREATE2_PREFIX = '0x2020dba91b30cc0006188af794c2fb30dd8520db7e2c088b7fc7c103c00ca494'
const ZKSYNC_SAFE_PROXY_DEPLOYED_BYTECODE: { [version: string]: { deployedBytecodeHash: Hash } } = {
  '1.3.0': {
    deployedBytecodeHash: '0x0100004124426fb9ebb25e27d670c068e52f9ba631bd383279a188be47e3f86d'
  },
  '1.4.1': {
    deployedBytecodeHash: '0x0100003b6cfa15bd7d1cae1c9c022074524d7785d34859ad0576d8fab4305d4f'
  }
}

function zkSyncCreate2Address(from: string, safeVersion: string, salt: Hex, input: Hex): string {
  const bytecodeHash = ZKSYNC_SAFE_PROXY_DEPLOYED_BYTECODE[safeVersion]?.deployedBytecodeHash
  if (!bytecodeHash) throw new Error(`Unsupported Safe version for zkSync: ${safeVersion}`)
  const inputHash = keccak256(input)
  const addressBytes = keccak256(
    concat([ZKSYNC_CREATE2_PREFIX, pad(asHex(from)), salt, bytecodeHash, inputHash])
  ).slice(26)
  return `0x${addressBytes}`
}

/**
 * Gets the Safe deployment information (version, factory, singleton).
 * This helper function gets the Safe core version and contract addresses
 * based on the chain ID and Safe version.
 *
 * @param {bigint | number} chainId - The chain ID
 * @param {string} safeVersion - The Safe core version to use
 * @returns {Object} Object containing safeVersion, factoryAddress, and singletonAddress
 * @throws {Error} If no deployment information is found for the chain ID and version
 */
function getSafeDeploymentInfo(
  chainId: bigint | number,
  safeVersion: string
): {
  safeVersion: string
  factoryAddress: string
  singletonAddress: string
} {
  const singletonDeployment = getSafeL2SingletonDeployment({
    version: safeVersion as SafeVersion,
    released: true
  })

  const factoryDeployment = getProxyFactoryDeployment({
    version: safeVersion as SafeVersion,
    released: true
  })

  if (!singletonDeployment) {
    throw new Error(`No Safe singleton deployment found for version ${safeVersion}`)
  }

  if (!factoryDeployment) {
    throw new Error(`No Safe proxy factory deployment found for version ${safeVersion}`)
  }

  const chainIdStr = chainId.toString()
  const singletonAddress = singletonDeployment.networkAddresses[chainIdStr]
  const factoryAddress = factoryDeployment.networkAddresses[chainIdStr]

  if (!singletonAddress) {
    throw new Error(
      `No Safe singleton address found for chain ID ${chainId} and version ${safeVersion}`
    )
  }

  if (!factoryAddress) {
    throw new Error(
      `No Safe proxy factory address found for chain ID ${chainId} and version ${safeVersion}`
    )
  }

  return {
    safeVersion,
    factoryAddress,
    singletonAddress
  }
}

/**
 * Detects if a chain is zkSync.
 *
 * @param {bigint | number} chainId - The chain ID to check.
 * @returns {boolean} True if the provided chain is a zkSync network; otherwise false.
 */
function isZkSyncChain(chainId: bigint | number): boolean {
  const ZKSYNC_CHAIN_IDS = new Set([
    324, // zkSync Era mainnet
    300, // zkSync Era testnet
    280, // zkSync Era localnet
    232 // zkSync Era internal testnet
  ])
  return ZKSYNC_CHAIN_IDS.has(Number(chainId))
}

/**
 * Returns the Safe Proxy creation bytecode for the provided Safe version on EVM chains.
 *
 * - Versions 1.0.0 - 1.2.0 use the legacy bytecode.
 * - Versions 1.3.0+ use the latest bytecode.
 * - zkSync chains are not supported by this function (different CREATE2 mechanics).
 *
 * @param {string} safeVersion - The Safe core version used to select the bytecode.
 * @param {bigint | number} [chainId] - Optional chain ID; if a zkSync chain is detected, an error is thrown.
 * @returns {`0x${string}`} The proxy creation bytecode for the given Safe version.
 * @throws {Error} If called for a zkSync chain.
 */
function getProxyCreationCode(chainId?: bigint | number): `0x${string}` {
  if (chainId && isZkSyncChain(chainId)) {
    return SAFE_PROXY_CREATION_CODES.zkSync.latest
  }
  return SAFE_PROXY_CREATION_CODES.latest
}

/**
 * Encodes the Safe setup initializer data synchronously.
 *
 * Produces the exact calldata used by Safe deployment, matching version-specific ABIs:
 * - Safe 1.0.0: setup(address[] _owners, uint256 _threshold, address to, bytes data, address paymentToken, uint256 payment, address paymentReceiver)
 * - Safe 1.1.0+: setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)
 *
 * @param {SafeAccountConfig} safeAccountConfig - The configuration used for the Safe setup transaction.
 * @param {string} safeVersion - The Safe core version used to select the correct ABI.
 * @returns {string} Hex-encoded calldata for the Safe setup function.
 */
function encodeSetupCallDataSync(
  safeAccountConfig: SafeAccountConfig,
  safeVersion: string
): string {
  const {
    owners,
    threshold,
    to = ZERO_ADDRESS,
    data = EMPTY_DATA,
    fallbackHandler = ZERO_ADDRESS,
    paymentToken = ZERO_ADDRESS,
    payment = 0,
    paymentReceiver = ZERO_ADDRESS
  } = safeAccountConfig

  const version = safeVersion.split('.')
  const major = parseInt(version[0])
  const minor = parseInt(version[1])

  if (major === 1 && minor === 0) {
    const setupData = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: '_owners', type: 'address[]' },
            { name: '_threshold', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
            { name: 'paymentToken', type: 'address' },
            { name: 'payment', type: 'uint256' },
            { name: 'paymentReceiver', type: 'address' }
          ],
          name: 'setup',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'setup',
      args: [
        owners,
        BigInt(threshold),
        to as `0x${string}`,
        data as `0x${string}`,
        paymentToken as `0x${string}`,
        BigInt(payment),
        paymentReceiver as `0x${string}`
      ]
    })
    return setupData
  } else {
    const setupData = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: '_owners', type: 'address[]' },
            { name: '_threshold', type: 'uint256' },
            { name: 'to', type: 'address' },
            { name: 'data', type: 'bytes' },
            { name: 'fallbackHandler', type: 'address' },
            { name: 'paymentToken', type: 'address' },
            { name: 'payment', type: 'uint256' },
            { name: 'paymentReceiver', type: 'address' }
          ],
          name: 'setup',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        }
      ],
      functionName: 'setup',
      args: [
        owners,
        BigInt(threshold),
        to as `0x${string}`,
        data as `0x${string}`,
        fallbackHandler as `0x${string}`,
        paymentToken as `0x${string}`,
        BigInt(payment),
        paymentReceiver as `0x${string}`
      ]
    })
    return setupData
  }
}
const USDT_ON_MAINNET = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

/**
 * Safe4337Pack class that extends RelayKitBasePack.
 * This class provides an implementation of the ERC-4337 that enables Safe accounts to wrk with UserOperations.
 * It allows to create, sign and execute transactions using the Safe 4337 Module.
 *
 * @class
 * @link https://github.com/safe-global/safe-modules/blob/main/modules/4337/contracts/Safe4337Module.sol
 * @link https://eips.ethereum.org/EIPS/eip-4337
 */
export class Safe4337Pack extends RelayKitBasePack<{
  EstimateFeeProps: EstimateFeeProps
  EstimateFeeResult: BaseSafeOperation
  CreateTransactionProps: Safe4337CreateTransactionProps
  CreateTransactionResult: BaseSafeOperation
  ExecuteTransactionProps: Safe4337ExecutableProps
  ExecuteTransactionResult: string
}> {
  #BUNDLER_URL: string

  #ENTRYPOINT_ADDRESS: string
  #SAFE_4337_MODULE_ADDRESS: string = '0x'
  #SAFE_WEBAUTHN_SHARED_SIGNER_ADDRESS: string = '0x'

  #bundlerClient: BundlerClient

  #chainId: bigint

  #paymasterOptions?: PaymasterOptions

  #onchainIdentifier: string = ''

  /**
   * Creates an instance of the Safe4337Pack.
   *
   * @param {Safe4337Options} options - The initialization parameters.
   */
  constructor({
    protocolKit,
    bundlerClient,
    bundlerUrl,
    chainId,
    paymasterOptions,
    entryPointAddress,
    safe4337ModuleAddress,
    safeWebAuthnSharedSignerAddress,
    onchainAnalytics
  }: Safe4337Options) {
    super(protocolKit)

    this.#BUNDLER_URL = bundlerUrl
    this.#bundlerClient = bundlerClient
    this.#chainId = chainId
    this.#paymasterOptions = paymasterOptions
    this.#ENTRYPOINT_ADDRESS = entryPointAddress
    this.#SAFE_4337_MODULE_ADDRESS = safe4337ModuleAddress
    this.#SAFE_WEBAUTHN_SHARED_SIGNER_ADDRESS = safeWebAuthnSharedSignerAddress || '0x'

    if (onchainAnalytics?.project) {
      const { project, platform } = onchainAnalytics
      this.#onchainIdentifier = generateOnChainIdentifier({
        project,
        platform,
        tool: 'relay-kit',
        toolVersion: getRelayKitVersion()
      })
    }
  }

  /**
   * Initializes a Safe4337Pack class.
   * This method creates the protocolKit instance based on the input parameters.
   * When the Safe address is provided, it will use the existing Safe.
   * When the Safe address is not provided, it will use the predictedSafe feature with the provided owners and threshold.
   * It will use the correct contract addresses for the fallbackHandler and the module and will add the data to enable the 4337 module.
   *
   * @param {Safe4337InitOptions} initOptions - The initialization parameters.
   * @return {Promise<Safe4337Pack>} The Promise object that will be resolved into an instance of Safe4337Pack.
   */
  static async init(initOptions: Safe4337InitOptions): Promise<Safe4337Pack> {
    const {
      provider,
      signer,
      options,
      bundlerUrl,
      customContracts,
      paymasterOptions,
      onchainAnalytics
    } = initOptions

    let protocolKit: Safe
    const bundlerClient = createBundlerClient(bundlerUrl)
    const chainId = await bundlerClient.request({ method: RPC_4337_CALLS.CHAIN_ID })

    let safeModulesSetupAddress = customContracts?.safeModulesSetupAddress
    const network = parseInt(chainId, 16).toString()

    const safeModulesVersion = initOptions.safeModulesVersion || DEFAULT_SAFE_MODULES_VERSION

    if (!safeModulesSetupAddress) {
      const safeModuleSetupDeployment = getSafeModuleSetupDeployment({
        released: true,
        version: safeModulesVersion,
        network
      })
      safeModulesSetupAddress = safeModuleSetupDeployment?.networkAddresses[network]
    }

    let safe4337ModuleAddress = customContracts?.safe4337ModuleAddress
    if (!safe4337ModuleAddress) {
      const safe4337ModuleDeployment = getSafe4337ModuleDeployment({
        released: true,
        version: safeModulesVersion,
        network
      })
      safe4337ModuleAddress = safe4337ModuleDeployment?.networkAddresses[network]
    }

    if (!safeModulesSetupAddress || !safe4337ModuleAddress) {
      throw new Error(
        `Safe4337Module and/or SafeModuleSetup not available for chain ${network} and modules version ${safeModulesVersion}`
      )
    }

    let safeWebAuthnSharedSignerAddress = customContracts?.safeWebAuthnSharedSignerAddress

    // Existing Safe
    if ('safeAddress' in options) {
      protocolKit = await Safe.init({
        provider,
        signer,
        safeAddress: options.safeAddress
      })

      const safeVersion = protocolKit.getContractVersion()
      const isSafeVersion4337Compatible = semverSatisfies(safeVersion, EQ_OR_GT_1_4_1)

      if (!isSafeVersion4337Compatible) {
        throw new Error(
          `Incompatibility detected: The current Safe Account version (${safeVersion}) is not supported. EIP-4337 requires the Safe to use at least v1.4.1.`
        )
      }

      const safeModules = (await protocolKit.getModules()) as string[]
      const is4337ModulePresent = safeModules.some((module) => module === safe4337ModuleAddress)

      if (!is4337ModulePresent) {
        throw new Error(
          `Incompatibility detected: The EIP-4337 module is not enabled in the provided Safe Account. Enable this module (address: ${safe4337ModuleAddress}) to add compatibility.`
        )
      }

      const safeFallbackhandler = await protocolKit.getFallbackHandler()
      const is4337FallbackhandlerPresent = safeFallbackhandler === safe4337ModuleAddress

      if (!is4337FallbackhandlerPresent) {
        throw new Error(
          `Incompatibility detected: The EIP-4337 fallbackhandler is not attached to the Safe Account. Attach this fallbackhandler (address: ${safe4337ModuleAddress}) to ensure compatibility.`
        )
      }
    } else {
      // New Safe will be created based on the provided configuration when bundling a new UserOperation
      if (!options.owners || !options.threshold) {
        throw new Error('Owners and threshold are required to deploy a new Safe')
      }

      const safeVersion = options.safeVersion || DEFAULT_SAFE_VERSION

      // we need to create a batch to setup the 4337 Safe Account

      // first setup transaction: Enable 4337 module
      const enable4337ModuleTransaction = {
        to: safeModulesSetupAddress,
        value: '0',
        data: encodeFunctionData({
          abi: ABI,
          functionName: 'enableModules',
          args: [[safe4337ModuleAddress]]
        }),
        operation: OperationType.DelegateCall // DelegateCall required for enabling the 4337 module
      }

      const setupTransactions = [enable4337ModuleTransaction]

      // Initialize deployment variables early
      let deploymentTo = enable4337ModuleTransaction.to
      let deploymentData = enable4337ModuleTransaction.data

      const isApproveTransactionRequired =
        !!paymasterOptions &&
        !paymasterOptions.isSponsored &&
        !!paymasterOptions.paymasterTokenAddress

      if (isApproveTransactionRequired && !paymasterOptions.skipApproveTransaction) {
        const { paymasterAddress, amountToApprove = MAX_ERC20_AMOUNT_TO_APPROVE } = paymasterOptions

        // Handle USDT on Mainnet special case - must reset allowance to 0 first if current allowance != 0
        if (
          paymasterOptions.paymasterTokenAddress.toLowerCase() === USDT_ON_MAINNET.toLowerCase()
        ) {
          // Get the predicted Safe address to check current allowance
          const predictedSafeAddress = await predictSafeAddress({
            safeProvider: await SafeProvider.init({ provider, signer, safeVersion }),
            chainId: BigInt(chainId),
            safeAccountConfig: {
              owners: options.owners,
              threshold: options.threshold,
              to: deploymentTo,
              data: deploymentData,
              fallbackHandler: safe4337ModuleAddress,
              paymentToken: zeroAddress,
              payment: 0,
              paymentReceiver: zeroAddress
            },
            safeDeploymentConfig: {
              safeVersion,
              saltNonce: options.saltNonce || undefined,
              deploymentType: options.deploymentType || undefined
            }
          })

          // Create a SafeProvider to read contract data
          const tempSafeProvider = await SafeProvider.init({ provider, signer, safeVersion })

          // Check current allowance to paymaster using SafeProvider's readContract
          const currentAllowance = await tempSafeProvider.readContract({
            address: paymasterOptions.paymasterTokenAddress as `0x${string}`,
            abi: ABI,
            functionName: 'allowance',
            args: [predictedSafeAddress as `0x${string}`, paymasterAddress]
          })

          // Only reset if current allowance is not 0
          if (currentAllowance !== 0n) {
            const resetApproveToPaymasterTransaction = {
              to: paymasterOptions.paymasterTokenAddress,
              data: encodeFunctionData({
                abi: ABI,
                functionName: 'approve',
                args: [paymasterAddress, 0n]
              }),
              value: '0',
              operation: OperationType.Call // Call for approve
            }

            setupTransactions.push(resetApproveToPaymasterTransaction)
          }
        }

        // second transaction: approve ERC-20 paymaster token
        const approveToPaymasterTransaction = {
          to: paymasterOptions.paymasterTokenAddress,
          data: encodeFunctionData({
            abi: ABI,
            functionName: 'approve',
            args: [paymasterAddress, amountToApprove]
          }),
          value: '0',
          operation: OperationType.Call // Call for approve
        }

        setupTransactions.push(approveToPaymasterTransaction)
      }

      const safeProvider = await SafeProvider.init({ provider, signer, safeVersion })

      // third transaction: passkey support via shared signer SafeWebAuthnSharedSigner
      // see: https://github.com/safe-global/safe-modules/blob/main/modules/passkey/contracts/4337/experimental/README.md
      const isPasskeySigner = await safeProvider.isPasskeySigner()

      if (isPasskeySigner) {
        if (!safeWebAuthnSharedSignerAddress) {
          const safeWebAuthnSharedSignerDeployment = getSafeWebAuthnShareSignerDeployment({
            released: true,
            version: '0.2.1',
            network
          })
          safeWebAuthnSharedSignerAddress =
            safeWebAuthnSharedSignerDeployment?.networkAddresses[network]
        }

        if (!safeWebAuthnSharedSignerAddress) {
          throw new Error(`safeWebAuthnSharedSignerAddress not available for chain ${network}`)
        }

        const passkeySigner = (await safeProvider.getExternalSigner()) as PasskeyClient

        const checkSummedOwners = options.owners.map((owner) => getAddress(owner))
        const checkSummedSignerAddress = getAddress(safeWebAuthnSharedSignerAddress)

        if (!checkSummedOwners.includes(checkSummedSignerAddress)) {
          options.owners.push(checkSummedSignerAddress)
        }

        const sharedSignerTransaction = {
          to: safeWebAuthnSharedSignerAddress,
          value: '0',
          data: passkeySigner.encodeConfigure(),
          operation: OperationType.DelegateCall // DelegateCall required into the SafeWebAuthnSharedSigner instance in order for it to set its configuration.
        }

        setupTransactions.push(sharedSignerTransaction)
      }

      const isBatch = setupTransactions.length > 1

      if (isBatch) {
        const multiSendContract = await getMultiSendContract({
          safeProvider,
          safeVersion,
          deploymentType: options.deploymentType || undefined
        })

        const batchData = encodeFunctionData({
          abi: ABI,
          functionName: 'multiSend',
          args: [encodeMultiSendData(setupTransactions) as Hex]
        })

        deploymentTo = multiSendContract.getAddress()
        deploymentData = batchData
      }

      protocolKit = await Safe.init({
        provider,
        signer,
        predictedSafe: {
          safeDeploymentConfig: {
            safeVersion,
            saltNonce: options.saltNonce || undefined,
            deploymentType: options.deploymentType || undefined
          },
          safeAccountConfig: {
            owners: options.owners,
            threshold: options.threshold,
            to: deploymentTo,
            data: deploymentData,
            fallbackHandler: safe4337ModuleAddress,
            paymentToken: zeroAddress,
            payment: 0,
            paymentReceiver: zeroAddress
          }
        },
        onchainAnalytics
      })
    }

    let selectedEntryPoint

    if (customContracts?.entryPointAddress) {
      const requiredSafeModulesVersion = entryPointToSafeModules(customContracts?.entryPointAddress)
      if (!semverSatisfies(safeModulesVersion, requiredSafeModulesVersion))
        throw new Error(
          `The selected entrypoint ${customContracts?.entryPointAddress} is not compatible with version ${safeModulesVersion} of Safe modules`
        )

      selectedEntryPoint = customContracts?.entryPointAddress
    } else {
      const supportedEntryPoints = await bundlerClient.request({
        method: RPC_4337_CALLS.SUPPORTED_ENTRY_POINTS
      })

      if (!supportedEntryPoints.length) {
        throw new Error('No entrypoint provided or available through the bundler')
      }

      selectedEntryPoint = supportedEntryPoints.find((entryPoint: string) => {
        const requiredSafeModulesVersion = entryPointToSafeModules(entryPoint)
        return semverSatisfies(safeModulesVersion, requiredSafeModulesVersion)
      })

      if (!selectedEntryPoint) {
        throw new Error(
          `Incompatibility detected: None of the entrypoints provided by the bundler is compatible with the Safe modules version ${safeModulesVersion}`
        )
      }
    }

    return new Safe4337Pack({
      chainId: BigInt(chainId),
      protocolKit,
      bundlerClient,
      paymasterOptions,
      bundlerUrl,
      entryPointAddress: selectedEntryPoint!,
      safe4337ModuleAddress,
      safeWebAuthnSharedSignerAddress,
      onchainAnalytics
    })
  }

  /**
   * Estimates gas for the SafeOperation.
   *
   * @param {EstimateFeeProps} props - The parameters for the gas estimation.
   * @param {BaseSafeOperation} props.safeOperation - The SafeOperation to estimate the gas.
   * @param {PaymasterOptions} props.paymasterOptions - The paymaster options.
   * @param {IFeeEstimator} props.feeEstimator - The function to estimate the gas.
   * @return {Promise<BaseSafeOperation>} The Promise object that will be resolved into the gas estimation.
   */

  async getEstimateFee({
    safeOperation,
    paymasterOptions,
    feeEstimator = new PimlicoFeeEstimator()
  }: EstimateFeeProps): Promise<BaseSafeOperation> {
    const threshold = await this.protocolKit.getThreshold()
    const preEstimationData = await feeEstimator?.preEstimateUserOperationGas?.({
      bundlerUrl: this.#BUNDLER_URL,
      entryPoint: this.#ENTRYPOINT_ADDRESS,
      userOperation: safeOperation.getUserOperation(),
      paymasterOptions
    })

    if (preEstimationData) {
      safeOperation.addEstimations(preEstimationData)
    }

    const estimateUserOperationGas = await this.#bundlerClient.request({
      method: RPC_4337_CALLS.ESTIMATE_USER_OPERATION_GAS,
      params: [
        {
          ...userOperationToHexValues(safeOperation.getUserOperation(), this.#ENTRYPOINT_ADDRESS),
          signature: getDummySignature(this.#SAFE_WEBAUTHN_SHARED_SIGNER_ADDRESS, threshold)
        },
        this.#ENTRYPOINT_ADDRESS
      ]
    })

    if (estimateUserOperationGas) {
      if (
        feeEstimator.defaultVerificationGasLimitOverhead != null &&
        estimateUserOperationGas.verificationGasLimit != null
      ) {
        estimateUserOperationGas.verificationGasLimit = (
          BigInt(estimateUserOperationGas.verificationGasLimit) +
          BigInt(threshold) * feeEstimator.defaultVerificationGasLimitOverhead
        ).toString()
      }

      safeOperation.addEstimations(estimateUserOperationGas)
    }

    const postEstimationData = await feeEstimator?.postEstimateUserOperationGas?.({
      bundlerUrl: this.#BUNDLER_URL,
      entryPoint: this.#ENTRYPOINT_ADDRESS,
      userOperation: {
        ...safeOperation.getUserOperation(),
        signature: getDummySignature(this.#SAFE_WEBAUTHN_SHARED_SIGNER_ADDRESS, threshold)
      },
      paymasterOptions
    })

    if (postEstimationData) {
      if (
        feeEstimator.defaultVerificationGasLimitOverhead != null &&
        postEstimationData.verificationGasLimit != null
      ) {
        postEstimationData.verificationGasLimit = (
          BigInt(postEstimationData.verificationGasLimit) +
          BigInt(threshold) * feeEstimator.defaultVerificationGasLimitOverhead
        ).toString()
      }
      safeOperation.addEstimations(postEstimationData)
    }

    return safeOperation
  }

  /**
   * Creates a relayed transaction based on the provided parameters.
   *
   * @param {MetaTransactionData[]} transactions - The transactions to batch in a SafeOperation.
   * @param options - Optional configuration options for the transaction creation.
   * @return {Promise<BaseSafeOperation>} The Promise object will resolve a SafeOperation.
   */
  async createTransaction({
    transactions,
    options = {}
  }: Safe4337CreateTransactionProps): Promise<BaseSafeOperation> {
    const {
      amountToApprove,
      validUntil,
      validAfter,
      feeEstimator,
      customNonce,
      paymasterTokenAddress,
      isSponsored,
      sponsorshipPolicyId
    } = options

    const paymasterOptions: PaymasterOptions = this.#paymasterOptions
      ? { ...this.#paymasterOptions }
      : undefined

    if (paymasterOptions) {
      if (isSponsored) {
        // Switch to SponsoredPaymasterOption
        ;(paymasterOptions as any).isSponsored = true
        ;(paymasterOptions as any).sponsorshipPolicyId = sponsorshipPolicyId
        delete (paymasterOptions as any).paymasterTokenAddress
        delete (paymasterOptions as any).amountToApprove
      } else if (!paymasterOptions.isSponsored && paymasterTokenAddress) {
        paymasterOptions.paymasterTokenAddress = paymasterTokenAddress
      }
    }

    const userOperation = await createUserOperation(this.protocolKit, transactions, {
      entryPoint: this.#ENTRYPOINT_ADDRESS,
      paymasterOptions,
      amountToApprove: isSponsored ? undefined : amountToApprove,
      customNonce
    })

    if (this.#onchainIdentifier) {
      userOperation.callData += this.#onchainIdentifier
    }

    const safeOperation = SafeOperationFactory.createSafeOperation(userOperation, {
      chainId: this.#chainId,
      moduleAddress: this.#SAFE_4337_MODULE_ADDRESS,
      entryPoint: this.#ENTRYPOINT_ADDRESS,
      validUntil,
      validAfter
    })

    return await this.getEstimateFee({
      safeOperation,
      paymasterOptions,
      feeEstimator
    })
  }

  /**
   * Converts a SafeOperationResponse to an SafeOperation.
   *
   * @param {SafeOperationResponse} safeOperationResponse - The SafeOperationResponse to convert to SafeOperation
   * @returns {BaseSafeOperation} - The SafeOperation object
   */
  #toSafeOperation(safeOperationResponse: SafeOperationResponse): BaseSafeOperation {
    const { validUntil, validAfter, userOperation } = safeOperationResponse

    const paymaster = (userOperation?.paymaster as Hex) || '0x'
    const paymasterData = (userOperation?.paymasterData as Hex) || '0x'
    const safeOperation = SafeOperationFactory.createSafeOperation(
      {
        sender: userOperation?.sender || '0x',
        nonce: userOperation?.nonce || '0',
        initCode: userOperation?.initCode || '',
        callData: userOperation?.callData || '',
        callGasLimit: BigInt(userOperation?.callGasLimit || 0n),
        verificationGasLimit: BigInt(userOperation?.verificationGasLimit || 0),
        preVerificationGas: BigInt(userOperation?.preVerificationGas || 0),
        maxFeePerGas: BigInt(userOperation?.maxFeePerGas || 0),
        maxPriorityFeePerGas: BigInt(userOperation?.maxPriorityFeePerGas || 0),
        paymasterAndData: concat([paymaster, paymasterData]),
        signature: safeOperationResponse.preparedSignature || '0x'
      },
      {
        chainId: this.#chainId,
        moduleAddress: this.#SAFE_4337_MODULE_ADDRESS,
        entryPoint: userOperation?.entryPoint || this.#ENTRYPOINT_ADDRESS,
        validAfter: this.#timestamp(validAfter),
        validUntil: this.#timestamp(validUntil)
      }
    )

    if (safeOperationResponse.confirmations) {
      safeOperationResponse.confirmations.forEach((confirmation: SafeOperationConfirmation) => {
        safeOperation.addSignature(new EthSafeSignature(confirmation.owner, confirmation.signature))
      })
    }

    return safeOperation
  }

  /**
   *
   * @param date An ISO string date
   * @returns The timestamp in seconds to send to the bundler
   */
  #timestamp(date: string | null) {
    return date ? new Date(date).getTime() / 1000 : undefined
  }

  /**
   * Signs a safe operation.
   *
   * @param {BaseSafeOperation | SafeOperationResponse} safeOperation - The SafeOperation to sign. It can be:
   * - A response from the API (Tx Service)
   * - An instance of SafeOperation
   * @param {SigningMethod} signingMethod - The signing method to use.
   * @return {Promise<BaseSafeOperation>} The Promise object will resolve to the signed SafeOperation.
   */
  async signSafeOperation(
    safeOperation: BaseSafeOperation | SafeOperationResponse,
    signingMethod: SigningMethod = SigningMethod.ETH_SIGN_TYPED_DATA_V4
  ): Promise<BaseSafeOperation> {
    let safeOp: BaseSafeOperation

    if (safeOperation instanceof BaseSafeOperation) {
      safeOp = safeOperation
    } else {
      safeOp = this.#toSafeOperation(safeOperation)
    }

    const safeProvider = this.protocolKit.getSafeProvider()
    const signerAddress = await safeProvider.getSignerAddress()
    const isPasskeySigner = await safeProvider.isPasskeySigner()

    if (!signerAddress) {
      throw new Error('There is no signer address available to sign the SafeOperation')
    }

    const isOwner = await this.protocolKit.isOwner(signerAddress)
    const isSafeDeployed = await this.protocolKit.isSafeDeployed()

    if ((!isOwner && isSafeDeployed) || (!isSafeDeployed && !isPasskeySigner && !isOwner)) {
      throw new Error('UserOperations can only be signed by Safe owners')
    }

    let safeSignature: SafeSignature

    if (isPasskeySigner) {
      const safeOpHash = safeOp.getHash()

      if (!isSafeDeployed) {
        const passkeySignature = await this.protocolKit.signHash(safeOpHash)
        safeSignature = new EthSafeSignature(
          this.#SAFE_WEBAUTHN_SHARED_SIGNER_ADDRESS,
          passkeySignature.data,
          true
        )
      } else {
        safeSignature = await this.protocolKit.signHash(safeOpHash)
      }
    } else {
      if (
        [
          SigningMethod.ETH_SIGN_TYPED_DATA_V4,
          SigningMethod.ETH_SIGN_TYPED_DATA_V3,
          SigningMethod.ETH_SIGN_TYPED_DATA
        ].includes(signingMethod)
      ) {
        const signer = await safeProvider.getExternalSigner()

        if (!signer) {
          throw new Error('No signer found')
        }

        const signerAddress = signer.account.address
        const safeOperation = safeOp.getSafeOperation()

        // Prepare the parameters for signTypedData
        const domain = {
          chainId: Number(this.#chainId),
          verifyingContract: this.#SAFE_4337_MODULE_ADDRESS
        }

        const types = safeOp.getEIP712Type()

        const message = {
          ...safeOperation,
          nonce: BigInt(safeOperation.nonce),
          validAfter: toHex(safeOperation.validAfter),
          validUntil: toHex(safeOperation.validUntil),
          maxFeePerGas: toHex(safeOperation.maxFeePerGas),
          maxPriorityFeePerGas: toHex(safeOperation.maxPriorityFeePerGas)
        }

        let signature: string

        // Use a try-catch to support both viem and ethers.js signers
        try {
          // First try the standard viem way
          signature = await signer.signTypedData({
            domain,
            types,
            message,
            primaryType: 'SafeOp'
          })
        } catch (error) {
          // If viem fails, try ethers.js way using a type assertion
          const ethersCompatibleSigner = signer as any

          if (typeof ethersCompatibleSigner._signTypedData === 'function') {
            // Ethers v5
            signature = await ethersCompatibleSigner._signTypedData(domain, types, message)
          } else if (typeof ethersCompatibleSigner.signTypedData === 'function') {
            // Ethers v6 with different parameter format
            try {
              // Try calling with object format first (some implementations support this)
              signature = await ethersCompatibleSigner.signTypedData({
                domain,
                types,
                primaryType: 'SafeOp',
                message
              })
            } catch {
              // Fallback to ethers v6 standard format
              signature = await ethersCompatibleSigner.signTypedData(domain, types, message)
            }
          } else {
            // Re-throw if we couldn't handle it
            throw error
          }
        }

        safeSignature = new EthSafeSignature(signerAddress, signature)
      } else {
        const safeOpHash = safeOp.getHash()

        safeSignature = await this.protocolKit.signHash(safeOpHash)
      }
    }

    safeOp.addSignature(safeSignature)

    return safeOp
  }

  /**
   * Executes the relay transaction.
   *
   * @param {Safe4337ExecutableProps} props - The parameters for the transaction execution.
   * @param {BaseSafeOperation | SafeOperationResponse} props.executable - The SafeOperation to execute. It can be:
   * - A response from the API (Tx Service)
   * - An instance of SafeOperation
   * @return {Promise<string>} The user operation hash.
   */
  async executeTransaction({ executable }: Safe4337ExecutableProps): Promise<string> {
    let safeOperation: BaseSafeOperation

    if (executable instanceof BaseSafeOperation) {
      safeOperation = executable
    } else {
      safeOperation = this.#toSafeOperation(executable)
    }

    return this.#bundlerClient.request({
      method: RPC_4337_CALLS.SEND_USER_OPERATION,
      params: [
        userOperationToHexValues(safeOperation.getUserOperation(), this.#ENTRYPOINT_ADDRESS),
        this.#ENTRYPOINT_ADDRESS
      ]
    })
  }

  /**
   * Return a UserOperation based on a hash (userOpHash) returned by eth_sendUserOperation
   *
   * @param {string} userOpHash - The hash of the user operation to fetch. Returned from the #sendUserOperation method
   * @returns {UserOperation} - null in case the UserOperation is not yet included in a block, or a full UserOperation, with the addition of entryPoint, blockNumber, blockHash and transactionHash
   */
  async getUserOperationByHash(userOpHash: string): Promise<UserOperationWithPayload> {
    return this.#bundlerClient.request({
      method: RPC_4337_CALLS.GET_USER_OPERATION_BY_HASH,
      params: [userOpHash as Hash]
    })
  }

  /**
   * Return a UserOperation receipt based on a hash (userOpHash) returned by eth_sendUserOperation
   *
   * @param {string} userOpHash - The hash of the user operation to fetch. Returned from the #sendUserOperation method
   * @returns {UserOperationReceipt} - null in case the UserOperation is not yet included in a block, or UserOperationReceipt object
   */
  async getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null> {
    return this.#bundlerClient.request({
      method: RPC_4337_CALLS.GET_USER_OPERATION_RECEIPT,
      params: [userOpHash as Hash]
    })
  }

  /**
   * Returns an array of the entryPoint addresses supported by the client.
   * The first element of the array SHOULD be the entryPoint addressed preferred by the client.
   *
   * @returns {string[]} - The supported entry points.
   */
  async getSupportedEntryPoints(): Promise<string[]> {
    return this.#bundlerClient.request({
      method: RPC_4337_CALLS.SUPPORTED_ENTRY_POINTS
    })
  }

  /**
   * Returns EIP-155 Chain ID.
   *
   * @returns {string} - The chain id.
   */
  async getChainId(): Promise<string> {
    return this.#bundlerClient.request({ method: RPC_4337_CALLS.CHAIN_ID })
  }

  /**
   * Returns the exchange rate applied by the paymaster.
   *
   * @param {string} tokenAddress - The address of the token to get the exchange rate for.
   * @returns {Promise<number>} - The exchange rate for the token used by the paymaster.
   * @throws {Error} If paymaster URL is not configured or if the token is not supported
   */
  async getTokenExchangeRate(tokenAddress: string): Promise<number> {
    if (!this.#paymasterOptions?.paymasterUrl) {
      throw new Error('Paymaster URL is not configured')
    }

    const bundlerClient = createBundlerClient(this.#paymasterOptions?.paymasterUrl)
    const isPimlico = this.#paymasterOptions.paymasterUrl.includes('pimlico')

    if (isPimlico) {
      const response = await bundlerClient.request({
        method: 'pimlico_getTokenQuotes',
        params: [
          {
            tokens: [tokenAddress]
          },
          this.#ENTRYPOINT_ADDRESS,
          '0x' + this.#chainId.toString(16)
        ]
      })

      return parseInt(response.quotes[0].exchangeRate, 16)
    } else {
      const response = await bundlerClient.request({
        method: 'pm_supportedERC20Tokens',
        params: [this.#ENTRYPOINT_ADDRESS]
      })

      const matchingToken = response.tokens.find(
        (token: { address: string; exchangeRate: string }) =>
          token.address.toLowerCase() === tokenAddress.toLowerCase()
      )

      if (!matchingToken) {
        throw new Error(`No exchange rate found for token: ${tokenAddress}`)
      }

      return parseInt(matchingToken.exchangeRate, 16)
    }
  }

  getOnchainIdentifier(): string {
    return this.#onchainIdentifier
  }

  /**
   * Predicts the address of a Safe account and returns it.
   *
   * Implements the CREATE2 derivation using the Safe Proxy Factory:
   * address = keccak256(0xff ++ factoryAddress ++ salt ++ keccak256(initCode))[12:]
   *
   * @param {Object} config - The prediction configuration.
   * @param {number} config.threshold - The number of owners required to execute a transaction.
   * @param {string[]} config.owners - The owner addresses for the Safe account.
   * @param {string} config.saltNonce - 0x-prefixed 32-byte salt used for CREATE2.
   * @param {string} config.entryPointAddress - The ERC-4337 entrypoint address.
   * @param {bigint | number} config.chainId - The chain ID for deployment.
   * @returns {string} The predicted Safe address (checksumed hex string).
   */
  static predictSafeAddress({
    threshold,
    owners,
    saltNonce,
    chainId,
    safeVersion = '1.4.1',
    safeModulesVersion = '0.2.0',
    paymasterOptions
  }: {
    threshold: number
    owners: string[]
    saltNonce: string
    chainId: bigint | number
    safeVersion?: string
    safeModulesVersion?: string
    paymasterOptions?: PaymasterOptions
  }): string {
    // Validate owners and threshold
    if (owners.length <= 0) {
      throw new Error('Owner list must have at least one owner')
    }
    if (threshold <= 0) {
      throw new Error('Threshold must be greater than or equal to 1')
    }
    if (threshold > owners.length) {
      throw new Error('Threshold must be lower than or equal to owners length')
    }

    const chainIdBigInt = BigInt(chainId)

    const { factoryAddress, singletonAddress } = getSafeDeploymentInfo(chainIdBigInt, safeVersion)

    const network = chainIdBigInt.toString()
    const safe4337ModuleDeployment = getSafe4337ModuleDeployment({
      released: true,
      version: safeModulesVersion,
      network
    })
    const safe4337ModuleAddress = safe4337ModuleDeployment?.networkAddresses[network]

    if (!safe4337ModuleAddress) {
      throw new Error(
        `Safe4337Module not available for chain ${network} and modules version ${safeModulesVersion}`
      )
    }

    const safeModuleSetupDeployment = getSafeModuleSetupDeployment({
      released: true,
      version: safeModulesVersion,
      network
    })
    const safeModulesSetupAddress = safeModuleSetupDeployment?.networkAddresses[network]

    if (!safeModulesSetupAddress) {
      throw new Error(
        `SafeModuleSetup not available for chain ${network} and modules version ${safeModulesVersion}`
      )
    }

    const enable4337ModuleTransaction = {
      to: safeModulesSetupAddress,
      value: '0',
      data: encodeFunctionData({
        abi: ABI,
        functionName: 'enableModules',
        args: [[safe4337ModuleAddress]]
      }),
      operation: OperationType.DelegateCall
    }

    const setupTransactions = [enable4337ModuleTransaction]

    const isApproveTransactionRequired =
      !!paymasterOptions &&
      !paymasterOptions.isSponsored &&
      !!paymasterOptions.paymasterTokenAddress

    if (isApproveTransactionRequired) {
      const { paymasterAddress, amountToApprove = MAX_ERC20_AMOUNT_TO_APPROVE } = paymasterOptions

      const approveToPaymasterTransaction = {
        to: paymasterOptions.paymasterTokenAddress,
        data: encodeFunctionData({
          abi: ABI,
          functionName: 'approve',
          args: [paymasterAddress, amountToApprove]
        }),
        value: '0',
        operation: OperationType.Call
      }

      setupTransactions.push(approveToPaymasterTransaction)
    }

    let deploymentTo: string
    let deploymentData: string

    const isBatch = setupTransactions.length > 1

    if (isBatch) {
      const multiSendDeployment = getMultiSendDeployment({
        version: safeVersion as SafeVersion,
        released: true
      })
      const multiSendAddress = multiSendDeployment?.networkAddresses[network]

      if (!multiSendAddress) {
        throw new Error(`MultiSend not available for chain ${network} and version ${safeVersion}`)
      }

      deploymentTo = multiSendAddress
      deploymentData = encodeFunctionData({
        abi: ABI,
        functionName: 'multiSend',
        args: [encodeMultiSendData(setupTransactions) as Hex]
      })
    } else {
      deploymentTo = enable4337ModuleTransaction.to
      deploymentData = enable4337ModuleTransaction.data
    }

    const safeAccountConfig: SafeAccountConfig = {
      owners,
      threshold,
      to: deploymentTo,
      data: deploymentData,
      fallbackHandler: safe4337ModuleAddress,
      paymentToken: '0x0000000000000000000000000000000000000000',
      payment: 0,
      paymentReceiver: '0x0000000000000000000000000000000000000000'
    }

    const initializer = encodeSetupCallDataSync(safeAccountConfig, safeVersion)

    const initializerHash = keccak256(initializer as `0x${string}`)

    const encodedNonce = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(saltNonce)])
    const salt = keccak256(concat([initializerHash as `0x${string}`, encodedNonce]))

    const proxyCreationCode = getProxyCreationCode(chainIdBigInt)

    const checksummedSingletonAddress = getAddress(singletonAddress)
    const input = encodeAbiParameters(parseAbiParameters('address'), [checksummedSingletonAddress])

    if (isZkSyncChain(chainId)) {
      const proxyAddress = zkSyncCreate2Address(factoryAddress, safeVersion, salt, asHex(input))
      return getAddress(proxyAddress)
    }
    const initCode = concat([proxyCreationCode, asHex(input)])

    const hash = keccak256(
      concat(['0xff' as `0x${string}`, factoryAddress as `0x${string}`, salt, keccak256(initCode)])
    )

    const address = slice(hash, 12)
    return getAddress(address)
  }
}
