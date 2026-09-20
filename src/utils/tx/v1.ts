import { fromLegacyPublicKey, fromLegacyTransactionInstruction } from '@solana/compat'
import {
  appendTransactionMessageInstructions,
  Blockhash,
  compileTransaction,
  createKeyPairFromBytes,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransaction,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  V1TransactionConfig
} from '@solana/kit'
import { ComputeBudgetProgram, Connection, PublicKey, Signer, SystemInstruction, TransactionInstruction } from '@solana/web3.js'

const MAX_V1_TRANSACTION_SIZE = 4096
const MAX_V1_ACCOUNT_COUNT = 64
const MAX_V1_INSTRUCTION_COUNT = 64
const MAX_V1_SIGNER_COUNT = 12
const MAX_COMPUTE_UNIT_LIMIT = 1_400_000
const MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 64 * 1024 * 1024
const MAX_PRIORITY_FEE_LAMPORTS = BigInt(1_000_000)
const RESOURCE_MARGIN_NUMERATOR = 110
const RESOURCE_MARGIN_DENOMINATOR = 100

interface BuildV1TransactionParams {
  allowDeferredFunding?: boolean
  connection: Connection
  feePayer: PublicKey
  recentBlockhash: string
  instructions: TransactionInstruction[]
  signers: Signer[]
  priorityMicroLamports?: number
}

interface SimulationResult {
  err: unknown
  loadedAccountsDataSize?: number
  logs?: string[]
  unitsConsumed?: number
}

interface SimulationRpcResponse {
  error?: { code: number; message: string }
  result?: { value: SimulationResult }
}

interface InstructionErrorResult {
  InstructionError?: [number, string | { Custom?: number }]
}

function withResourceMargin(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, Math.ceil((value * RESOURCE_MARGIN_NUMERATOR) / RESOURCE_MARGIN_DENOMINATOR)))
}

function getPriorityFeeLamports(priorityMicroLamports: number | undefined, computeUnitLimit: number): bigint {
  if (!priorityMicroLamports || priorityMicroLamports <= 0) return BigInt(0)
  const microLamports = BigInt(Math.ceil(priorityMicroLamports))
  const total = (microLamports * BigInt(computeUnitLimit) + BigInt(999_999)) / BigInt(1_000_000)
  return total > MAX_PRIORITY_FEE_LAMPORTS ? MAX_PRIORITY_FEE_LAMPORTS : total
}

function assertV1MessageLimits(feePayer: PublicKey, instructions: TransactionInstruction[]): void {
  if (instructions.length > MAX_V1_INSTRUCTION_COUNT) {
    throw new Error(`v1 transaction has ${instructions.length} instructions; maximum is ${MAX_V1_INSTRUCTION_COUNT}`)
  }

  const accounts = new Set<string>([feePayer.toBase58()])
  const signers = new Set<string>([feePayer.toBase58()])
  instructions.forEach((instruction) => {
    accounts.add(instruction.programId.toBase58())
    instruction.keys.forEach((key) => {
      const address = key.pubkey.toBase58()
      accounts.add(address)
      if (key.isSigner) signers.add(address)
    })
  })

  if (accounts.size > MAX_V1_ACCOUNT_COUNT) {
    throw new Error(`v1 transaction has ${accounts.size} accounts; maximum is ${MAX_V1_ACCOUNT_COUNT}`)
  }
  if (signers.size > MAX_V1_SIGNER_COUNT) {
    throw new Error(`v1 transaction has ${signers.size} signers; maximum is ${MAX_V1_SIGNER_COUNT}`)
  }
}

async function serializeV1Transaction({
  feePayer,
  recentBlockhash,
  instructions,
  signers,
  config
}: Omit<BuildV1TransactionParams, 'connection' | 'priorityMicroLamports'> & { config: V1TransactionConfig }): Promise<Buffer> {
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    (m) => setTransactionMessageFeePayer(fromLegacyPublicKey(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: recentBlockhash as Blockhash, lastValidBlockHeight: BigInt(0) }, m),
    (m) => appendTransactionMessageInstructions(instructions.map(fromLegacyTransactionInstruction), m),
    (m) => setTransactionMessageConfig(config, m)
  )

  let transaction = compileTransaction(message)
  if (signers.length > 0) {
    const uniqueSigners = Array.from(new Map(signers.map((signer) => [signer.publicKey.toBase58(), signer])).values())
    const keyPairs = await Promise.all(uniqueSigners.map((signer) => createKeyPairFromBytes(signer.secretKey)))
    transaction = await partiallySignTransaction(keyPairs, transaction)
  }

  const wire = Buffer.from(getBase64EncodedWireTransaction(transaction), 'base64')
  if (wire.length > MAX_V1_TRANSACTION_SIZE) {
    throw new Error(`v1 transaction is ${wire.length} bytes; maximum is ${MAX_V1_TRANSACTION_SIZE}`)
  }
  return wire
}

async function simulateV1Transaction(connection: Connection, wire: Buffer): Promise<SimulationResult> {
  const response = await fetch(connection.rpcEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: [
        wire.toString('base64'),
        {
          commitment: 'processed',
          encoding: 'base64',
          sigVerify: false
        }
      ]
    })
  })
  if (!response.ok) throw new Error(`simulate v1 transaction failed: HTTP ${response.status}`)

  const body = (await response.json()) as SimulationRpcResponse
  if (body.error) throw new Error(`simulate v1 transaction failed: ${body.error.message}`)
  if (!body.result) throw new Error('simulate v1 transaction failed: empty RPC result')
  return body.result.value
}

function isDeferredFundingError(simulation: SimulationResult): boolean {
  const instructionError = (simulation.err as InstructionErrorResult | null)?.InstructionError
  const customError = typeof instructionError?.[1] === 'object' ? instructionError[1].Custom : undefined
  return customError === 1 && simulation.logs?.some((log) => log.includes('Error: insufficient funds')) === true
}

function simulationError(simulation: SimulationResult): Error {
  const logs = simulation.logs?.join('\n')
  return new Error(`simulate v1 transaction failed: ${JSON.stringify(simulation.err)}${logs ? `\n${logs}` : ''}`)
}

/**
 * Builds one partially signed v1 transaction for Computer. Compute-budget
 * instructions are removed because v1 commits resource limits in its config.
 * The provisional maximums are used for simulation. The final message stores
 * the observed values with a 10% margin. Transactions funded by a Computer
 * Invoice keep the maximums when simulation reaches the expected pre-deposit
 * insufficient-funds error.
 */
export async function buildSimulatedV1Transaction(params: BuildV1TransactionParams): Promise<Buffer> {
  const instructions = params.instructions.filter((instruction) => !instruction.programId.equals(ComputeBudgetProgram.programId))
  if (instructions.length === 0 || SystemInstruction.decodeInstructionType(instructions[0]) !== 'AdvanceNonceAccount') {
    throw new Error('v1 Computer transaction must start with an advance nonce instruction')
  }
  assertV1MessageLimits(params.feePayer, instructions)

  const provisionalConfig: V1TransactionConfig = {
    computeUnitLimit: MAX_COMPUTE_UNIT_LIMIT,
    loadedAccountsDataSizeLimit: MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT,
    priorityFeeLamports: BigInt(0)
  }
  const provisionalWire = await serializeV1Transaction({ ...params, instructions, config: provisionalConfig })
  const simulation = await simulateV1Transaction(params.connection, provisionalWire)
  if (simulation.err) {
    if (!params.allowDeferredFunding || !isDeferredFundingError(simulation)) throw simulationError(simulation)
    return serializeV1Transaction({
      ...params,
      instructions,
      config: {
        ...provisionalConfig,
        priorityFeeLamports: getPriorityFeeLamports(params.priorityMicroLamports, MAX_COMPUTE_UNIT_LIMIT)
      }
    })
  }
  if (!simulation.unitsConsumed) throw new Error('simulate v1 transaction failed: unitsConsumed is missing or zero')
  if (!simulation.loadedAccountsDataSize) {
    throw new Error('simulate v1 transaction failed: loadedAccountsDataSize is missing or zero')
  }

  const computeUnitLimit = withResourceMargin(simulation.unitsConsumed, MAX_COMPUTE_UNIT_LIMIT)
  const loadedAccountsDataSizeLimit = withResourceMargin(simulation.loadedAccountsDataSize, MAX_LOADED_ACCOUNTS_DATA_SIZE_LIMIT)
  return serializeV1Transaction({
    ...params,
    instructions,
    config: {
      computeUnitLimit,
      loadedAccountsDataSizeLimit,
      priorityFeeLamports: getPriorityFeeLamports(params.priorityMicroLamports, computeUnitLimit)
    }
  })
}
