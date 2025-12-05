import { PublicKey, VersionedTransaction,  TransactionMessage, SystemProgram, AddressLookupTableAccount } from '@solana/web3.js'
import { SOL_INFO, PoolKeys, getATAAddress, swapBaseInAutoAccount, ALL_PROGRAM_ID, addComputeBudget, TxVersion, WSOLMint, SOLMint, closeAccountInstruction, swapBaseOutAutoAccount } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import BigNumber from 'bignumber.js';
import { createStore, useAppStore, useTokenAccountStore, useTokenStore } from '@/store'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { txStatusSubject } from '@/hooks/toast/useTxStatus'
import { ApiSwapV1OutSuccess } from './type'
import axios from '@/api/axios'
import Decimal from 'decimal.js'
import { TxCallbackProps } from '@/types/tx'
import i18n from '@/i18n'
import { fetchComputePrice } from '@/utils/tx/computeBudget'
import { trimTailingZero } from '@/utils/numberish/formatter'
import { initComputerClient } from '@/api/computer'
import { attachInvoiceEntry, attachStorageEntry, formatUnits, getInvoiceString, MixinApi, newMixinInvoice, uniqueConversationID, checkSystemCallSize, OperationTypeUserDeposit, userIdToBytes } from '@mixin.dev/mixin-node-sdk'
import { buildComputerExtra, buildSystemCallInvoiceExtra, handleInvoiceSchema } from '@/utils/mixin'
import { OperationTypeSystemCall, SOL_DECIMAL, XIN_ASSET_ID } from '@/utils/constant'
import { ComputerFeeResponse, ComputerSystemCallRequest } from '@/types/computer'
import { add } from '@/utils/number'
import { getDefaultToastData, handleMultiTxToast, transformProcessData } from '@/hooks/toast/multiToastUtil';
import { handleMultiTxRetry } from '@/hooks/toast/retryTx';
import { routeWrapSOLInstuction } from '@/utils/insturction';

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

const client = MixinApi({ 
  requestConfig: {
    timeout: 1000 * 60,
  }
});

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
      const { publicKey, raydium, connection, urlConfigs, account, info, balanceAddressMap, getUserMix, getComputerRecipient } = useAppStore.getState()
      const { tokenAccounts } = useTokenAccountStore.getState();
      const computer = getComputerRecipient()
      if (!raydium || !connection || !info || !computer || !account || !publicKey) {
        console.error('no connection')
        toastSubject.next({ status: "error", description: "no connection" })
        return [];
      }
      if (!raydium.owner) raydium.setOwner(publicKey);

      const cc = initComputerClient();
      try {
        const getToken = useTokenStore.getState().getToken
        const [inputToken, outputToken] = [getToken(swapResponse.data.inputMint)!, getToken(swapResponse.data.outputMint)!]

        const computeData = await getSwapComputePrice()
        const computeIns = computeData ? addComputeBudget(computeData).instructions : []

        const poolsResp = await axios.get<PoolKeys[]>(
          urlConfigs.BASE_HOST + urlConfigs.POOL_KEY_BY_ID + `?ids=${swapResponse.data.routePlan.map((r) => r.poolId).join(',')}`
        )
        const allMints = poolsResp.data.map((r) => [r.mintA, r.mintB]).flat()
        const [mintAProgram, mintBProgram] = [
          allMints.find((m) => m.address === swapResponse.data.inputMint)!.programId,
          allMints.find((m) => m.address === swapResponse.data.outputMint)!.programId,
        ]
        const inputAccount =  getATAAddress(publicKey, new PublicKey(swapResponse.data.inputMint), new PublicKey(mintAProgram)).publicKey
        const outputAccount = getATAAddress(publicKey, new PublicKey(swapResponse.data.outputMint), new PublicKey(mintBProgram)).publicKey

        const ins = swapResponse.data.swapType === "BaseIn" ? swapBaseInAutoAccount({
          programId: ALL_PROGRAM_ID.Router,
          wallet: publicKey,
          amount: new BN(swapResponse.data.inputAmount),
          inputAccount,
          outputAccount,
          routeInfo: swapResponse,
          poolKeys: poolsResp.data,
        }) : swapBaseOutAutoAccount({
          programId: ALL_PROGRAM_ID.Router,
          wallet: publicKey,
          inputAccount,
          outputAccount,
          routeInfo: swapResponse,
          poolKeys: poolsResp.data,
        })

        const amount = swapResponse.data.inputAmount;
        const token = inputToken;
        const tokenAmount = formatUnits(amount, token.decimals).toString();
        const address = token.address === WSOLMint.toString() ? SOLMint.toString() : token.address;
        const balance = balanceAddressMap[address];
        if (!balance) throw new Error('invalid input')

        let ataCount = 0;
        [inputAccount, outputAccount].forEach(a => {
          const ataExists = !!tokenAccounts.find((acc) => acc.publicKey && acc.publicKey.equals(a));
          if (!ataExists) ataCount+= 1;
        });
        let fee: ComputerFeeResponse | undefined;
        if (ataCount > 0) {
          const rent = await raydium.connection.getMinimumBalanceForRentExemption(165)
          const rents = new Decimal(rent).mul(swapResponse.data.routePlan.length * ataCount);
          const solAmount = formatUnits(rents.toString(), SOL_DECIMAL).toString();
          fee = await cc.getFeeOnXin(solAmount);
        }
        const operationFee = fee 
          ? add(info.params.operation.price, fee.xin_amount).toFixed(8, BigNumber.ROUND_CEIL)
          : info.params.operation.price;

        // const swapTransactions = data || []
        // if (swapTransactions.length !== 1) throw new Error('invalid swap transaction'); //
        // const buf = Buffer.from(swapTransactions[0].transaction, 'base64')
        // let tx = VersionedTransaction.deserialize(buf as any);
        // const res = await Promise.all(tx.message.addressTableLookups.map(a => connection.getAddressLookupTable(a.accountKey)))
        // const alts = res.filter(r => r.value).map(r => r.value) as AddressLookupTableAccount[]
        // const swapIxs = TransactionMessage.decompile(tx.message, {
        //   addressLookupTableAccounts: alts
        // }).instructions;

        const nonce = await cc.getNonce(getUserMix())
        const nonceIns = SystemProgram.nonceAdvance({
          noncePubkey: new PublicKey(nonce.nonce_address),
          authorizedPubkey: new PublicKey(info.payer)
        })

        const instructions = [nonceIns];
        if (token.address === WSOLMint.toString()) {
            instructions.push(routeWrapSOLInstuction(publicKey, inputAccount, WSOLMint, BigInt(swapResponse.data.inputAmount)))
        }
        instructions.push(ins)
        if (swapResponse.data.outputMint === WSOLMint.toString()) {
          instructions.push(closeAccountInstruction({
            tokenAccount: outputAccount,
            payer: publicKey,
            owner: publicKey,
          }))
        }
        instructions.push(...computeIns)
        
        // const alts = await cc.getAtls();
        // const rpcAccounts = await Promise.all(alts.map(a => connection.getAddressLookupTable(new PublicKey(a))));
        // const altsAccounts = rpcAccounts.map(a => a.value).filter(a => a != null) as AddressLookupTableAccount[];
        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(info.payer),
          recentBlockhash: nonce.nonce_hash,
          instructions,
        }).compileToV0Message();
        const tx = new VersionedTransaction(messageV0);
        
        const txBuf = Buffer.from(tx.serialize());
        const valid = checkSystemCallSize(txBuf);
        if (!valid) throw new Error('Transaction too large');

        const trace = uniqueConversationID(txBuf.toString("hex"), "system call");
        const extra = buildComputerExtra(
          info.members.app_id, 
          OperationTypeSystemCall, 
          buildSystemCallInvoiceExtra(account.id, trace, false, fee?.fee_id)
        )

        const referenceExtra = Buffer.from(
          buildComputerExtra(info.members.app_id, OperationTypeUserDeposit, userIdToBytes(account.id))
        );

        const invoice = newMixinInvoice(computer);
        if (!invoice) throw new Error('invalid invoice recipient!');
        attachStorageEntry(invoice, uniqueConversationID(trace, "storage"), txBuf)
        attachInvoiceEntry(invoice, {
          trace_id: uniqueConversationID(trace, balance.asset_id),
          asset_id: balance.asset_id,
          amount: tokenAmount,
          extra: referenceExtra,
          index_references: [],
          hash_references: []
        })
        attachInvoiceEntry(invoice, {
          trace_id: trace,
          asset_id: XIN_ASSET_ID,
          amount: operationFee,
          extra: Buffer.from(extra),
          index_references: [0, 1],
          hash_references: []
        })
        const url = handleInvoiceSchema(getInvoiceString(invoice));
        console.log(invoice, url)
        const scheme = await client.code.schemes(url)
        const req = {
          trace: trace,
          value: `https://mixin.one/schemes/${scheme.scheme_id}`,
        }
        return [req]
      } catch (e: any) {
        console.error(e)
        txProps.onError?.()
        if (e.message !== 'tx failed') {
          const err =  typeof e === 'string' 
            ? new Error(e)
            : e.message.includes('Transaction too large') 
              ? new Error('Transaction too large, cannot swap directly')
              : e.message;
          toastSubject.next({ txError: err, title: 'Swap', description: 'Send transaction failed', duration: null })
        } 
      } finally {
        txProps.onFinally?.()
      }
      return [];
    },

    unWrapSolAct: async ({ amount, onSent, onError, ...txProps }): Promise<string | undefined> => {
      const raydium = useAppStore.getState().raydium
      const txVersion = useAppStore.getState().txVersion
      if (!raydium) return
      const { execute, builder } = await raydium.tradeV2.unWrapWSol({
        amount
        // computeBudgetConfig: await getComputeBudgetConfig()
      })

      if (builder.allInstructions.length > 12) {
        const { execute: multiExecute, transactions } =
          txVersion === TxVersion.LEGACY ? await builder.sizeCheckBuild() : await builder.sizeCheckBuildV0()

        const txLength = transactions.length
        const { toastId, processedId, handler } = getDefaultToastData({
          txLength,
          ...txProps
        })

        const meta = {
          title: i18n.t('swap.unwrap_all_wsol'),
          description: i18n.t('swap.unwrap_all_wsol_desc_no_amount'),
          txHistoryTitle: 'swap.unwrap_all_wsol',
          txHistoryDesc: 'swap.unwrap_all_wsol_desc_no_amount',
          txValues: {}
        }

        const getSubTxTitle = () => 'swap.unwrap_all_wsol_desc_no_amount'
        multiExecute({
          sequentially: true,
          onTxUpdate: (data) => {
            handleMultiTxRetry(data)
            handleMultiTxToast({
              toastId,
              processedId: transformProcessData({ processedId, data }),
              txLength,
              meta,
              handler,
              getSubTxTitle
            })
          }
        })
          .then(() => {
            handleMultiTxToast({
              toastId,
              processedId: transformProcessData({ processedId, data: [] }),
              txLength,
              meta,
              handler,
              getSubTxTitle
            })
            return { txId: '' }
          })
          .catch((e) => {
            toastSubject.next({ txError: e, ...meta })
            onError?.()
            return { txId: '' }
          })

        return ''
      }

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
