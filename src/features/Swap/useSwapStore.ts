import { PublicKey, VersionedTransaction,  TransactionMessage, SystemProgram, AddressLookupTableAccount } from '@solana/web3.js'
import { TxVersion, SOL_INFO, LOOKUP_TABLE_CACHE } from '@raydium-io/raydium-sdk-v2'
import { createStore, useAppStore, useTokenStore } from '@/store'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { txStatusSubject } from '@/hooks/toast/useTxStatus'
import { ApiSwapV1OutSuccess } from './type'
import { isSolWSol } from '@/utils/token'
import axios from '@/api/axios'
import Decimal from 'decimal.js'
import { TxCallbackProps } from '@/types/tx'
import i18n from '@/i18n'
import { fetchComputePrice } from '@/utils/tx/computeBudget'
import { trimTailingZero } from '@/utils/numberish/formatter'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { initComputerClient } from '@/api/computer'
import { formatUnits, getInvoiceString, uniqueConversationID } from '@mixin.dev/mixin-node-sdk'
import { buildComputerExtra, buildInvoiceWithEntries, buildSystemCallInvoiceExtra, computerEmptyExtra, handleInvoiceSchema } from '@/utils/mixin'
import { OperationTypeSystemCall, SOL_ASSET_ID, SOL_DECIMAL, XIN_ASSET_ID } from '@/utils/constant'
import { ComputerSystemCallRequest } from '@/types/computer'

const getSwapComputePrice = async () => {
  const transactionFee = useAppStore.getState().getPriorityFee()
  if (isNaN(parseFloat(String(transactionFee) || ''))) {
    const json = await fetchComputePrice()
    const { avg } = json?.[15] ?? {}
    if (!avg) return undefined
    return {
      units: 600000,
      microLamports: avg
    }
  }
  return {
    units: 600000,
    microLamports: new Decimal(transactionFee as string)
      .mul(10 ** SOL_INFO.decimals)
      .toDecimalPlaces(0)
      .toNumber()
  }
}

interface SwapStore {
  slippage: number
  swapTokenAct: (
    props: { swapResponse: ApiSwapV1OutSuccess; wrapSol?: boolean; unwrapSol?: boolean; onCloseToast?: () => void } & TxCallbackProps
  ) => Promise<ComputerSystemCallRequest[]>
  unWrapSolAct: (props: { amount: string; onClose?: () => void; onSent?: () => void; onError?: () => void }) => Promise<string | undefined>
  wrapSolAct: (amount: string) => Promise<string | undefined>
}

export interface ComputeParams {
  inputMint: string
  outputMint: string
  amount: string
}

export const SWAP_SLIPPAGE_KEY = '_r_swap_slippage_'
const initSwapState = {
  slippage: 0.005
}

export const useSwapStore = createStore<SwapStore>(
  () => ({
    ...initSwapState,

    swapTokenAct: async ({ swapResponse, wrapSol, unwrapSol = false, onCloseToast, ...txProps }) => {
      const { publicKey, raydium, txVersion, connection, urlConfigs, account, info, balanceAddressMap, getUserMix, getComputerRecipient } = useAppStore.getState()
      const computer = getComputerRecipient()
      if (!raydium || !connection || !info || !computer || !account || !publicKey) {
        console.error('no connection')
        toastSubject.next({ status: "error", description: "no connection" })
        return [];
      }
      if (!raydium.owner) raydium.setOwner(publicKey);

      try {
        const tokenMap = useTokenStore.getState().tokenMap
        const getToken = useTokenStore.getState().getToken
        const [inputToken, outputToken] = [getToken(swapResponse.data.inputMint)!, getToken(swapResponse.data.outputMint)!]
        const [isInputSol, isOutputSol] = [wrapSol && isSolWSol(swapResponse.data.inputMint), isSolWSol(swapResponse.data.outputMint)]

        const inputTokenAcc = raydium.account.getAssociatedTokenAccount(
          new PublicKey(inputToken.address), 
          new PublicKey(inputToken.programId ?? TOKEN_PROGRAM_ID)
        )

        const outputTokenAcc = await raydium.account.getCreatedTokenAccount({
          programId: new PublicKey(outputToken.programId ?? TOKEN_PROGRAM_ID),
          mint: new PublicKey(outputToken.address)
        })

        const computeData = await getSwapComputePrice()

        const isV0Tx = txVersion === TxVersion.V0
        const {
          data,
          success
        }: {
          id: string
          success: true
          version: 'V1'
          msg?: string
          data?: { transaction: string }[]
        } = await axios.post(
          `${urlConfigs.SWAP_HOST}${urlConfigs.SWAP_TX}${swapResponse.data.swapType === 'BaseIn' ? 'swap-base-in' : 'swap-base-out'}`,
          {
            wallet: publicKey.toBase58(),
            computeUnitPriceMicroLamports: new Decimal(computeData?.microLamports || 0).toFixed(0),
            swapResponse,
            txVersion: isV0Tx ? 'V0' : 'LEGACY',
            wrapSol: isInputSol,
            unwrapSol,
            inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
            outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58()
          }
        )
        if (!success) {
          toastSubject.next({
            title: 'Make Transaction Error',
            description: 'Please try again, or contact us on discord',
            status: 'error'
          })
          onCloseToast && onCloseToast()
          return [];
        }

        console.log(swapResponse)
        const amount = swapResponse.data.swapType === "BaseIn" 
          ? swapResponse.data.inputAmount 
          : swapResponse.data.outputAmount;
        const token = swapResponse.data.swapType === "BaseIn" ? inputToken : outputToken;
        const tokenAmount = formatUnits(amount, token.decimals).toString();
        const balance = balanceAddressMap[token.address];
        if (!balance) throw new Error('invalid input')

        const rent = await raydium.connection.getMinimumBalanceForRentExemption(165)
        const rents = new Decimal(rent).mul(swapResponse.data.routePlan.length * 2 - 1);
        const solAmount = formatUnits(rents.toString(), SOL_DECIMAL).toString()
        const swapTransactions = data || []
        if (swapTransactions.length !== 1) throw new Error('invalid swap transaction'); //
        const buf = Buffer.from(swapTransactions[0].transaction, 'base64')
        let tx = VersionedTransaction.deserialize(buf as any);
        const res = await Promise.all(tx.message.addressTableLookups.map(a => connection.getAddressLookupTable(a.accountKey)))
        const alts = res.filter(r => r.value).map(r => r.value) as AddressLookupTableAccount[]
        const swapIxs = TransactionMessage.decompile(tx.message, {
          addressLookupTableAccounts: alts
        }).instructions;

        const client = initComputerClient();
        const nonce = await client.getNonce(getUserMix())
        const nonceIns = SystemProgram.nonceAdvance({
          noncePubkey: new PublicKey(nonce.nonce_address),
          authorizedPubkey: new PublicKey(info.payer)
        })
        const messageV0 = new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash: nonce.nonce_hash,
          instructions: [nonceIns, ...swapIxs,], // add additional instructions here
        }).compileToV0Message();
        tx = new VersionedTransaction(messageV0);
        const memo = Buffer.from(tx.serialize()).toString('base64');
        const storage = await client.storageTx(memo);
        const trace = uniqueConversationID(storage.hash, "system call");
        const extra = buildComputerExtra(
          info.members.app_id, 
          OperationTypeSystemCall, 
          buildSystemCallInvoiceExtra(account.id, trace, false, storage.hash)
        )
        const invoice = buildInvoiceWithEntries(
          computer, 
          {
            trace_id: trace,
            asset_id: XIN_ASSET_ID,
            amount: info.params.operation.price,
            extra: Buffer.from(extra),
            index_references: [],
            hash_references: []
          }, 
          [
            {
              trace_id: uniqueConversationID(uniqueConversationID(trace, SOL_ASSET_ID), "rent"),
              asset_id: SOL_ASSET_ID,
              amount: solAmount,
              extra: computerEmptyExtra,
              index_references: [],
              hash_references: []
            },
            {
              trace_id: uniqueConversationID(trace, balance.asset_id),
              asset_id: balance.asset_id,
              amount: tokenAmount,
              extra: computerEmptyExtra,
              index_references: [],
              hash_references: []
            },
          ]
        )
         console.log(invoice)
         const req = {
           trace: trace,
           value: handleInvoiceSchema(getInvoiceString(invoice)),
         }
         return [req]
      } catch (e: any) {
        txProps.onError?.()
        if (e.message !== 'tx failed')
          toastSubject.next({ txError: typeof e === 'string' ? new Error(e) : e, title: 'Swap', description: 'Send transaction failed' })
      } finally {
        txProps.onFinally?.()
      }
      return [];
    },

    unWrapSolAct: async ({ amount, onSent, onError, ...txProps }): Promise<string | undefined> => {
      const raydium = useAppStore.getState().raydium
      if (!raydium) return
      const { execute } = await raydium.tradeV2.unWrapWSol({
        amount
        // computeBudgetConfig: await getComputeBudgetConfig()
      })

      const values = { amount: trimTailingZero(new Decimal(amount).div(10 ** SOL_INFO.decimals).toFixed(SOL_INFO.decimals)) }
      const meta = {
        title: i18n.t('swap.unwrap_all_wsol', values),
        description: i18n.t('swap.unwrap_all_wsol_desc', values),
        txHistoryTitle: 'swap.unwrap_all_wsol',
        txHistoryDesc: 'swap.unwrap_all_wsol_desc',
        txValues: values
      }

      return execute()
        .then(({ txId, signedTx }) => {
          onSent?.()
          txStatusSubject.next({ txId, signedTx, ...meta, ...txProps })
          return txId
        })
        .catch((e) => {
          onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
    },

    wrapSolAct: async (amount: string): Promise<string | undefined> => {
      const raydium = useAppStore.getState().raydium
      if (!raydium) return
      const { execute } = await raydium.tradeV2.wrapWSol(new Decimal(amount).mul(10 ** SOL_INFO.decimals).toFixed(0))
      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({ txId, signedTx })
          return txId
        })
        .catch((e) => {
          toastSubject.next({ txError: e, title: 'Wrap Sol' })
          return ''
        })
    }
  }),
  'useSwapStore'
)
