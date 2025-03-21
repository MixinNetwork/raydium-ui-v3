import {
  TxBuildData,
  TxV0BuildData,
  MakeMultiTxData,
  ApiClmmConfigInfo,
  ClmmPositionLayout,
  InitRewardsParams,
  Price,
  TickUtils,
  PoolUtils,
  ReturnTypeGetPriceAndTick,
  SetRewardsParams,
  ClmmKeys,
  ApiV3PoolInfoConcentratedItem,
  MakeTxData,
  OpenPositionFromBaseExtInfo,
  toToken,
  solToWSolToken,
  TxVersion,
  getTransferAmountFeeV2,
  ClmmLockAddress,
  TxBuilder,
  Owner,
  SqrtPriceMath,
  ClmmInstrument,
  mockV3CreatePoolInfo,
  WSOLMint,
} from '@raydium-io/raydium-sdk-v2'
import { AddressLookupTableAccount, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import createStore from '@/store/createStore'
import { useAppStore, useTokenAccountStore, useLiquidityStore } from '@/store'
import { isSolWSol } from '@/utils/token'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { txStatusSubject } from '@/hooks/toast/useTxStatus'
import { getDefaultToastData, transformProcessData, handleMultiTxToast } from '@/hooks/toast/multiToastUtil'
import getEphemeralSigners from '@/utils/tx/getEphemeralSigners'
import { getMintSymbol } from '@/utils/token'

import { CLMM_FEE_CONFIGS, getTxMeta } from './configs/clmm'
import { TxCallbackProps, TxCallbackPropsGeneric } from '../types/tx'
import { getComputeBudgetConfig } from '@/utils/tx/computeBudget'
import { handleMultiTxRetry } from '@/hooks/toast/retryTx'
import { shortenAddress } from '@/utils/token'
import { ClmmLockInfo } from '@/hooks/portfolio/clmm/useClmmBalance'

import BN from 'bn.js'
import Decimal from 'decimal.js'
import { ComputerNonceResponse, ComputerSystemCallRequest, Token } from '@/types/computer'
import { buildInvoiceWithEntries, buildComputerExtra, buildSystemCallInvoiceExtra, handleInvoiceSchema, computerEmptyExtra, buildAssetId } from '@/utils/mixin'
import { attachInvoiceEntry, formatUnits, getInvoiceString, newMixinInvoice, uniqueConversationID } from '@mixin.dev/mixin-node-sdk'
import { CREATE_POOL_RENT_SIZES, OPEN_POSITION_RENT_SIZES, OperationTypeSystemCall, SOL_ASSET_ID, SOL_DECIMAL, XIN_ASSET_ID } from '@/utils/constant'
import { initComputerClient } from '@/api/computer'

export type CreatePoolBuildData =
  | TxBuildData<{ mockPoolInfo: ApiV3PoolInfoConcentratedItem; address: ClmmKeys }>
  | TxV0BuildData<{ mockPoolInfo: ApiV3PoolInfoConcentratedItem; address: ClmmKeys }>

interface ClmmState {
  positionLoading: boolean

  clmmFeeConfigs: Record<string, ApiClmmConfigInfo>
  currentPoolInfo?: ApiV3PoolInfoConcentratedItem
  currentPoolLoading: boolean
  rewardWhiteListMints: PublicKey[]

  harvestAllAct: (
    props: {
      allPoolInfo: Record<string, ApiV3PoolInfoConcentratedItem>
      allPositions: Record<string, ClmmPositionLayout[]>
      lockInfo: ClmmLockInfo
      programId?: string
      execute?: boolean
    } & TxCallbackProps
  ) => Promise<{ txId: string; buildData?: MakeMultiTxData<TxVersion> }>
  openPositionAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      poolKeys?: ClmmKeys
      tickLower: number
      tickUpper: number
      baseAmount: string
      otherAmountMax: string
      base: 'MintA' | 'MintB'
      createPoolBuildData?: CreatePoolBuildData
      poolNonce?: ComputerNonceResponse
      onCloseToast?: () => void
    } & TxCallbackProps<{
      txId: string
      buildData: TxBuildData<OpenPositionFromBaseExtInfo> | TxV0BuildData<OpenPositionFromBaseExtInfo>
    }>
  ) => Promise<{
    requests: ComputerSystemCallRequest[];
    buildData: TxBuildData<OpenPositionFromBaseExtInfo> | TxV0BuildData<OpenPositionFromBaseExtInfo> | undefined
  }>
  closePositionAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      position: ClmmPositionLayout
    } & TxCallbackProps
  ) => Promise<string>
  removeLiquidityAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      position: ClmmPositionLayout
      liquidity: number | string | BN
      amountMinA: number | string | BN
      amountMinB: number | string | BN
      needRefresh?: boolean
      harvest?: boolean
      closePosition?: boolean
    } & TxCallbackProps
  ) => Promise<ComputerSystemCallRequest[]>
  increaseLiquidityAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      position: ClmmPositionLayout
      liquidity: BN
      amountMaxA: number | string | BN
      amountMaxB: number | string | BN
      onCloseToast?: () => void
    } & TxCallbackProps
  ) => Promise<string>
  lockPositionAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      position: ClmmPositionLayout
      onCloseToast?: () => void
    } & TxCallbackPropsGeneric<ClmmLockAddress>
  ) => Promise<string>
  collectRewardAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      rewardMint: PublicKey
    } & TxCallbackProps
  ) => Promise<string>
  harvestLockPositionAct: (
    props: {
      lockData: ClmmLockInfo['']['']
      poolInfo: ApiV3PoolInfoConcentratedItem
      position: ClmmPositionLayout
      needRefresh?: boolean
      onCloseToast?: () => void
    } & TxCallbackProps
  ) => Promise<string>
  fetchAmmConfigsAct: () => void
  createClmmPool: (props: {
    config: ApiClmmConfigInfo
    token1: Token
    token2: Token
    price: string
    execute?: boolean
    forerunCreate?: boolean
    getObserveState?: boolean
    nonce?: ComputerNonceResponse
  }) => Promise<{
    txId: string
    buildData?:
      | MakeTxData<
          TxVersion.LEGACY,
          {
            mockPoolInfo: ApiV3PoolInfoConcentratedItem
            address: ClmmKeys
          }
        >
      | MakeTxData<
          TxVersion.V0,
          {
            mockPoolInfo: ApiV3PoolInfoConcentratedItem
            address: ClmmKeys
          }
        >
  }>

  createFarm: (props: Pick<InitRewardsParams, 'poolInfo' | 'rewardInfos'> & TxCallbackProps) => Promise<string>

  convertPoolPrice: (props: { pool: ApiV3PoolInfoConcentratedItem; price: string | number }) => Price | undefined
  getPriceAndTick: (props: {
    pool?: ApiV3PoolInfoConcentratedItem
    price: string
    baseIn: boolean
    decimals?: number
  }) => ReturnTypeGetPriceAndTick | undefined
  getTickPrice: (props: { pool?: ApiV3PoolInfoConcentratedItem; tick: number; baseIn: boolean }) => ReturnTypeGetPriceAndTick | undefined
  computePairAmount: (props: {
    pool?: ApiV3PoolInfoConcentratedItem
    inputA: boolean
    tickLower?: number
    tickUpper?: number
    amount: string
  }) => Promise<
    | {
        amountSlippageA: Decimal
        amountSlippageB: Decimal
        amountA: Decimal
        amountB: Decimal
        liquidity: BN
      }
    | undefined
  >

  loadAddRewardWhiteListAct: (props?: { checkFetch: boolean }) => void
  setRewardsAct: (
    props: {
      poolInfo: ApiV3PoolInfoConcentratedItem
      rewardInfos: SetRewardsParams['rewardInfos']
      newRewardInfos: SetRewardsParams['rewardInfos']
    } & TxCallbackProps
  ) => Promise<string>
  reset: () => void
}

const clmmInitState = {
  positionLoading: false,
  currentPoolLoading: true,
  clmmFeeConfigs: {},
  rewardWhiteListMints: [],
  slippage: 0.005
}

export const useClmmStore = createStore<ClmmState>(
  (set, get) => ({
    ...clmmInitState,
    harvestAllAct: async ({ allPoolInfo, allPositions, lockInfo, programId, execute, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      if (!raydium) {
        toastSubject.next({ noRpc: true })
        return { txId: '' }
      }

      const buildData = await raydium.clmm.harvestAllRewards({
        allPoolInfo,
        allPositions,
        ownerInfo: {
          useSOLBalance: true
        },
        lockInfo,
        programId: programId ? new PublicKey(programId) : undefined,
        txVersion,
        computeBudgetConfig: execute ? await getComputeBudgetConfig() : undefined
      })

      if (execute) {
        const meta = getTxMeta({
          action: 'harvest',
          values: { symbol: 'All Clmm' }
        })

        const txLength = buildData.transactions.length
        const { toastId, processedId, handler } = getDefaultToastData({
          txLength,
          ...txProps
        })
        const getSubTxTitle = () => meta.txHistoryTitle

        buildData
          .execute({
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
            return { txId: '', buildData }
          })
          .catch((e) => {
            txProps.onError?.()
            toastSubject.next({ ...meta, txError: e })
            return { txId: '' }
          })
          .finally(txProps.onFinally)
      }
      return {
        txId: '',
        buildData
      }
    },

    openPositionAct: async ({
      poolNonce,
      poolInfo,
      poolKeys,
      base,
      tickLower,
      tickUpper,
      baseAmount,
      otherAmountMax,
      createPoolBuildData,
      onCloseToast,
      ...txProps
    }) => {
      const { raydium, publicKey, wallet, txVersion, info, keystore, user, account, balanceAddressMap, getComputerRecipient, getUserMix } = useAppStore.getState()
      if (!poolInfo) return {
        requests: [],
        buildData: undefined
      };
      const computer = getComputerRecipient()
      if (!raydium || !keystore || !user || !publicKey || !info || !account || !computer) {
        toastSubject.next({ noRpc: true })
        return {
          requests: [],
          buildData: undefined
        };
      }
      const token1 = balanceAddressMap[poolInfo.mintA.address]
      const token2 = balanceAddressMap[poolInfo.mintB.address]
      if (!token1 || !token2) {
        toastSubject.next({ title: "invalid tokens", status: "error" })
        return {
          requests: [],
          buildData: undefined
        };
      }

      // try {
        const computeBudgetConfig = await getComputeBudgetConfig()
        const nonce = await initComputerClient().getNonce(getUserMix())

        const owner = new PublicKey(publicKey)
        const txBuilder = new TxBuilder({
          connection: raydium.connection,
          owner: new Owner(publicKey),
          feePayer: new PublicKey(info.payer),
          cluster: raydium.cluster
        });
        const nonceIns = SystemProgram.nonceAdvance({
          noncePubkey: new PublicKey(nonce.nonce_address),
          authorizedPubkey: new PublicKey(info.payer)
        })
        txBuilder.addInstruction({
          instructions: [nonceIns],
          instructionTypes: ["AdvanceNonceAccount"],
        })

        const params = {
          poolInfo,
          ownerInfo: {
            useSOLBalance: isSolWSol(poolInfo.mintA.address) || isSolWSol(poolInfo.mintB.address)
          },
          tickLower: Math.min(tickLower, tickUpper),
          tickUpper: Math.max(tickLower, tickUpper),
          base,
          baseAmount: new BN(baseAmount),
          otherAmountMax: new BN(otherAmountMax),
          nft2022: true,
          associatedOnly: true,
          checkCreateATAOwner: false,
          withMetadata: "create" as "create" | "no-create",
          getEphemeralSigners: wallet ? await getEphemeralSigners(wallet) : undefined,
          computeBudgetConfig: createPoolBuildData ? undefined : computeBudgetConfig,
          txVersion,
        }
        let ownerTokenAccountA: PublicKey | null = null;
        let ownerTokenAccountB: PublicKey | null = null;
        const mintAUseSOLBalance = params.ownerInfo.useSOLBalance && poolInfo.mintA.address === WSOLMint.toString();
        const mintBUseSOLBalance = params.ownerInfo.useSOLBalance && poolInfo.mintB.address === WSOLMint.toString();
        const [bnAmountA, bnAmountB] = base === "MintA" 
          ? [params.baseAmount, params.otherAmountMax] 
          : [params.otherAmountMax, params.baseAmount];
          const { account: _ownerTokenAccountA, instructionParams: _tokenAccountAInstruction } =
          await raydium.account.getOrCreateTokenAccount({
            tokenProgram: poolInfo.mintA.programId,
            mint: new PublicKey(poolInfo.mintA.address),
            owner: owner,
    
            createInfo: {
              payer: owner,
              amount: bnAmountA,
            },
            skipCloseAccount: !mintAUseSOLBalance,
            notUseTokenAccount: mintAUseSOLBalance,
            associatedOnly: mintAUseSOLBalance ? false : params.associatedOnly,
            checkCreateATAOwner: params.checkCreateATAOwner,
          });
        if (_ownerTokenAccountA) ownerTokenAccountA = _ownerTokenAccountA;
        if (mintAUseSOLBalance || bnAmountA.isZero()) txBuilder.addInstruction(_tokenAccountAInstruction || {});
    
        const { account: _ownerTokenAccountB, instructionParams: _tokenAccountBInstruction } =
          await raydium.account.getOrCreateTokenAccount({
            tokenProgram: poolInfo.mintB.programId,
            mint: new PublicKey(poolInfo.mintB.address),
            owner: owner,
    
            createInfo: {
              payer: owner,
              amount: bnAmountB,
            },
            skipCloseAccount: !mintBUseSOLBalance,
            notUseTokenAccount: mintBUseSOLBalance,
            associatedOnly: mintBUseSOLBalance ? false : params.associatedOnly,
            checkCreateATAOwner: params.checkCreateATAOwner,
          });
        if (_ownerTokenAccountB) ownerTokenAccountB = _ownerTokenAccountB;
        if (mintAUseSOLBalance || bnAmountB.isZero()) txBuilder.addInstruction(_tokenAccountBInstruction || {});
    
        if (!ownerTokenAccountA || !ownerTokenAccountB)
          throw new Error(`cannot found target token accounts tokenAccounts: ${poolInfo.mintA.address} ${ownerTokenAccountA?.toBase58()}, ${poolInfo.mintB.address} ${ownerTokenAccountB?.toBase58()}`);
    
        poolKeys = poolKeys || (await raydium.clmm.getClmmPoolKeys(poolInfo.id));
        const insInfo = await ClmmInstrument.openPositionFromBaseInstructions({
          poolInfo,
          poolKeys,
          ownerInfo: {
            ...params.ownerInfo,
            feePayer: owner,
            wallet: owner,
            tokenAccountA: ownerTokenAccountA!,
            tokenAccountB: ownerTokenAccountB!,
          },
          tickLower,
          tickUpper,
          base,
          baseAmount: params.baseAmount,
          otherAmountMax: params.otherAmountMax,
          withMetadata: params.withMetadata,
          getEphemeralSigners: params.getEphemeralSigners,
          nft2022: params.nft2022,
        });
    
        txBuilder.addInstruction(insInfo);
        const buildData = await txBuilder.versionBuild({
          txVersion,
          extInfo: { ...insInfo.address, recentBlockHash: nonce.nonce_hash },
        });

        if (!buildData) {
          txProps.onError?.()
          return {
            requests: [],
            buildData: undefined
          };
        }
        const amount1 = base === 'MintA' 
          ? formatUnits(baseAmount, poolInfo.mintA.decimals).toString() 
          : formatUnits(otherAmountMax, poolInfo.mintA.decimals).toString();
        const amount2 = base === 'MintA' 
          ? formatUnits(otherAmountMax, poolInfo.mintB.decimals).toString() 
          : formatUnits(baseAmount, poolInfo.mintB.decimals).toString();
        
        const client = initComputerClient(); 
        const rentMap: Record<string, number> = {}  
        const sizes = Array.from(new Set([...CREATE_POOL_RENT_SIZES, ...OPEN_POSITION_RENT_SIZES]));
        const rents = await Promise.all(sizes.map(size => raydium.connection.getMinimumBalanceForRentExemption(size)))
        sizes.forEach((size, index) => {
          rentMap[size] = rents[index]
        })

        const reqs: ComputerSystemCallRequest[] = [];
        // create pool and open position
        if (createPoolBuildData) {
          let total1 = CREATE_POOL_RENT_SIZES.reduce((prev, cur) => {
            const total = prev + rentMap[cur]
            return total
          }, 0)
          total1 = Math.floor(total1 * 1.1)

          const { transactions } = await createPoolBuildData.builder.sizeCheckBuildV0();
          if (transactions.length !== 1 || !poolNonce) throw new Error('invalid create pool transaction');
          transactions[0].message.recentBlockhash = poolNonce.nonce_hash;
          const tx1 = Buffer.from(transactions[0].serialize()).toString('base64');

          const invoice = newMixinInvoice(computer);
          if (!invoice) throw new Error('computer connection failed');
          const storage1 = await client.storageTx(tx1);
          const trace = uniqueConversationID(storage1.hash, "system call");
          const extra1 = buildComputerExtra(
            info.members.app_id, 
            OperationTypeSystemCall, 
            buildSystemCallInvoiceExtra(account.id, trace, true, storage1.hash)
          )
          attachInvoiceEntry(invoice, {
            trace_id: uniqueConversationID(trace, SOL_ASSET_ID),
            asset_id: SOL_ASSET_ID,
            amount: formatUnits(total1, SOL_DECIMAL).toString(),
            extra: computerEmptyExtra,
            index_references: [],
            hash_references: []
          })
          attachInvoiceEntry(invoice, {
            trace_id: trace,
            asset_id: XIN_ASSET_ID,
            amount: info.params.operation.price,
            extra: Buffer.from(extra1),
            index_references: [0],
            hash_references: []
          })
          console.log(invoice)
          const req1 = {
            trace: trace,
            value: handleInvoiceSchema(getInvoiceString(invoice)),
          }
          reqs.push(req1);
        }

        const { transactions: txs } = await buildData.builder.sizeCheckBuildV0();
        if (txs.length !== 1) throw new Error('invalid open position transaction');
        txs[0].message.recentBlockhash = nonce.nonce_hash;
        txs[0].sign(insInfo.signers);
        const tx2 = Buffer.from(txs[0].serialize()).toString('base64');

        let total2 = OPEN_POSITION_RENT_SIZES.reduce((prev, cur) => {
          const total = prev + rentMap[cur]
          return total
        }, 0)
        total2 = Math.floor(total2 * 1.1)

        const storage2 = await client.storageTx(tx2);
        const trace2 = uniqueConversationID(storage2.hash, "system call");
        const extra2 = buildComputerExtra(
          info.members.app_id, 
          OperationTypeSystemCall, 
          buildSystemCallInvoiceExtra(account.id, trace2, false, storage2.hash)
        )
        const invoice2 = buildInvoiceWithEntries(
          computer, 
          {
            trace_id: trace2,
            asset_id: XIN_ASSET_ID,
            amount: info.params.operation.price,
            extra: Buffer.from(extra2),
            index_references: [],
            hash_references: []
          }, 
          [
            {
              trace_id: uniqueConversationID(uniqueConversationID(trace2, SOL_ASSET_ID), "rent"),
              asset_id: SOL_ASSET_ID,
              amount: formatUnits(total2, SOL_DECIMAL).toString(),
              extra: computerEmptyExtra,
              index_references: [],
              hash_references: []
            },
            {
              trace_id: uniqueConversationID(trace2, token1.asset_id),
              asset_id: token1.asset_id,
              amount: amount1,
              extra: computerEmptyExtra,
              index_references: [],
              hash_references: []
            },
            {
              trace_id: uniqueConversationID(trace2, token2.asset_id),
              asset_id: token2.asset_id,
              amount: amount2,
              extra: computerEmptyExtra,
              index_references: [0],
              hash_references: []
            }
          ]
        )
        console.log(invoice2)
        reqs.push({
          trace: trace2,
          value: handleInvoiceSchema(getInvoiceString(invoice2)),
        })
        return {
          requests: reqs,
          buildData
        };
      // } catch (e: any) {
      //   txProps.onError?.()
      //   txProps.onFinally?.()
      //   console.error(e)
      // }
    },

    removeLiquidityAct: async ({
      poolInfo,
      position,
      liquidity,
      amountMinA,
      amountMinB,
      needRefresh,
      closePosition,
      harvest,
      onSent,
      onError,
      onFinally,
      onConfirmed
    }) => {
      const { raydium, txVersion, getEpochInfo } = useAppStore.getState()      
      const { publicKey, connection, account, info, getUserMix, getComputerRecipient } = useAppStore.getState()
      const computer = getComputerRecipient()
      if (!publicKey || !raydium || !connection || !info || !computer || !account) {
        console.error('no connection')
        return [];
      }
      
      const slippage = useLiquidityStore.getState().slippage
      const [_amountMinA, _amountMinB] = [
        new BN(
          new Decimal(amountMinA.toString())
            .mul(1 - slippage)
            .mul(10 ** poolInfo.mintA.decimals)
            .toFixed(0)
        ),
        new BN(
          new Decimal(amountMinB.toString())
            .mul(1 - slippage)
            .mul(10 ** poolInfo.mintB.decimals)
            .toFixed(0)
        )
      ]
      const epochInfo = await getEpochInfo()
      const { fee: feeA = new BN(0) } = getTransferAmountFeeV2(_amountMinA, poolInfo.mintA.extensions.feeConfig, epochInfo!, false)
      const { fee: feeB = new BN(0) } = getTransferAmountFeeV2(_amountMinB, poolInfo.mintB.extensions.feeConfig, epochInfo!, false)

      try {
        const close = !position.liquidity.eq(new BN(liquidity)) ? false : closePosition ?? position.liquidity.eq(new BN(liquidity))
        const rent =  await raydium.connection.getMinimumBalanceForRentExemption(165)
        const rentAmount = Math.floor(rent * 2 * 1.1);

        const computeBudgetConfig = await getComputeBudgetConfig()
        const { transaction: old  } = await raydium.clmm.decreaseLiquidity({
          poolInfo,
          ownerPosition: position,
          ownerInfo: {
            useSOLBalance: true,
            closePosition: !position.liquidity.eq(new BN(liquidity)) ? false : closePosition ?? position.liquidity.eq(new BN(liquidity))
          },
          liquidity: new BN(liquidity),
          amountMinA: _amountMinA.sub(feeA),
          amountMinB: _amountMinB.sub(feeB),
          computeBudgetConfig,
          txVersion
        })
        const res = await Promise.all((old as VersionedTransaction).message.addressTableLookups
          .map(a => connection.getAddressLookupTable(a.accountKey)))
        const alts = res.filter(r => r.value).map(r => r.value) as AddressLookupTableAccount[]
        const swapIxs = TransactionMessage.decompile((old as VersionedTransaction).message, {
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
          instructions: [nonceIns, ...swapIxs,],
        }).compileToV0Message();
        const tx = new VersionedTransaction(messageV0);

        const memo = Buffer.from(tx.serialize()).toString('base64');
        const storage = await client.storageTx(memo);
        const trace = uniqueConversationID(storage.hash, "system call");
        const extra = buildComputerExtra(
          info.members.app_id, 
          OperationTypeSystemCall, 
          buildSystemCallInvoiceExtra(account.id, trace, true, storage.hash)
        )
        const referencedEntries = [
          {
            trace_id: uniqueConversationID(uniqueConversationID(trace, SOL_ASSET_ID), "rent"),
            asset_id: SOL_ASSET_ID,
            amount: formatUnits(rentAmount, SOL_DECIMAL).toString(),
            extra: computerEmptyExtra,
            index_references: [],
            hash_references: []
          },
        ]
        if (false) referencedEntries.push({
          trace_id: uniqueConversationID(trace, position.nftMint.toString()),
          asset_id: buildAssetId(position.nftMint.toString()),
          amount: "1",
          extra: computerEmptyExtra,
          index_references: [],
          hash_references: []
        })
        const invoice = buildInvoiceWithEntries(
          computer, 
          {
            trace_id: trace,
            asset_id: XIN_ASSET_ID,
            amount: info.params.operation.price,
            extra: Buffer.from(extra),
            index_references: [],
            hash_references: []
          }, referencedEntries
        )
        console.log(invoice)
        const req1 = {
          trace: trace,
          value: handleInvoiceSchema(getInvoiceString(invoice)),
        }
        return [req1]
      } catch(e) {
        console.log(e)
        onError?.()
        onFinally?.()
        return []
      }
    },

    closePositionAct: async ({ poolInfo, position, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      if (!raydium) return ''
      try {
        const { execute } = await raydium.clmm.closePosition({
          poolInfo,
          ownerPosition: position,
          txVersion
        })

        const meta = getTxMeta({
          action: 'closePosition',
          values: {
            mint: position.nftMint.toBase58().slice(0, 6).toUpperCase()
          }
        })

        return execute()
          .then(({ txId, signedTx }) => {
            txStatusSubject.next({
              txId,
              signedTx,
              ...meta,
              ...txProps
            })
            return txId
          })
          .catch((e) => {
            txProps.onError?.()
            toastSubject.next({ txError: e, ...meta })
            return ''
          })
          .finally(txProps.onFinally)
      } catch {
        txProps.onError?.()
        txProps.onFinally?.()
        return ''
      }
    },

    increaseLiquidityAct: async ({ poolInfo, position, liquidity, amountMaxA, amountMaxB, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      const slippage = useLiquidityStore.getState().slippage
      if (!raydium) return ''
      try {
        const computeBudgetConfig = await getComputeBudgetConfig()
        const { execute } = await raydium.clmm.increasePositionFromLiquidity({
          poolInfo,
          ownerPosition: position,
          ownerInfo: {
            useSOLBalance: isSolWSol(poolInfo.mintA.address) || isSolWSol(poolInfo.mintB.address)
          },
          liquidity: new BN(new Decimal(liquidity.toString()).mul(1 - slippage).toFixed(0)),
          amountMaxA: new BN(amountMaxA),
          amountMaxB: new BN(amountMaxB),
          checkCreateATAOwner: true,
          computeBudgetConfig,
          txVersion
        })

        const meta = getTxMeta({
          action: 'increaseLiquidity',
          values: {
            amountA: new Decimal(amountMaxA.toString())
              .div(10 ** poolInfo.mintA.decimals)
              .toDecimalPlaces(poolInfo.mintA.decimals)
              .toString(),
            symbolA: getMintSymbol({ mint: poolInfo.mintA, transformSol: true }),
            amountB: new Decimal(amountMaxB.toString())
              .div(10 ** poolInfo.mintB.decimals)
              .toDecimalPlaces(poolInfo.mintB.decimals)
              .toString(),
            symbolB: getMintSymbol({ mint: poolInfo.mintB, transformSol: true })
          }
        })

        return execute()
          .then(({ txId, signedTx }) => {
            txStatusSubject.next({
              txId,
              ...meta,
              signedTx,
              mintInfo: [poolInfo.mintA, poolInfo.mintB],
              onSent: txProps.onSent,
              onClose: txProps.onCloseToast,
              onConfirmed: () => {
                txProps.onConfirmed?.()
                setTimeout(() => {
                  useTokenAccountStore.setState({ refreshClmmPositionTag: Date.now() })
                }, 500)
              }
            })
            return txId
          })
          .catch((e) => {
            txProps.onError?.()
            toastSubject.next({ txError: e, ...meta })
            return ''
          })
          .finally(txProps.onFinally)
      } catch {
        txProps.onError?.()
        txProps.onFinally?.()
        return ''
      }
    },

    collectRewardAct: async ({ poolInfo, rewardMint, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      if (!raydium) return ''
      const computeBudgetConfig = await getComputeBudgetConfig()
      const { execute } = await raydium.clmm.collectReward({
        ownerInfo: { useSOLBalance: true },
        poolInfo,
        rewardMint,
        txVersion,
        computeBudgetConfig
      })

      const meta = getTxMeta({
        action: 'harvest',
        values: {}
      })

      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({
            txId,
            ...meta,
            signedTx,
            mintInfo: [poolInfo.mintA, poolInfo.mintB],
            ...txProps
          })
          return txId
        })
        .catch((e) => {
          txProps.onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
        .finally(() => {
          txProps.onFinally?.()
        })
    },

    lockPositionAct: async ({ poolInfo, position, ...txProps }) => {
      const { raydium, txVersion, wallet } = useAppStore.getState()
      if (!raydium) return ''
      const computeBudgetConfig = await getComputeBudgetConfig()
      const { execute, extInfo } = await raydium.clmm.lockPosition({
        ownerPosition: position,
        txVersion,
        computeBudgetConfig,
        getEphemeralSigners: wallet ? await getEphemeralSigners(wallet) : undefined
      })

      const meta = getTxMeta({
        action: 'lockPosition',
        values: {
          position: shortenAddress(position.nftMint.toBase58())
        }
      })

      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({
            txId,
            ...meta,
            signedTx,
            mintInfo: [poolInfo.mintA, poolInfo.mintB],
            onSent: () => {
              txProps.onSent?.(extInfo as ClmmLockAddress)
            },
            onClose: txProps.onCloseToast,
            onConfirmed: () => {
              txProps.onConfirmed?.()
              setTimeout(() => {
                useTokenAccountStore.setState({ refreshClmmPositionTag: Date.now() })
              }, 500)
            }
          })
          return txId
        })
        .catch((e) => {
          txProps.onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
        .finally(() => {
          txProps.onFinally?.(extInfo as ClmmLockAddress)
        })
    },

    harvestLockPositionAct: async ({ lockData, poolInfo, needRefresh, onConfirmed, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      if (!raydium) return ''
      const computeBudgetConfig = await getComputeBudgetConfig()
      const { execute } = await raydium.clmm.harvestLockPosition({
        // programId: useAppStore.getState().programIdConfig.CLMM_LOCK_PROGRAM_ID,
        // authProgramId: useAppStore.getState().programIdConfig.CLMM_LOCK_AUTH_ID,
        // ownerPosition: position,
        lockData,
        txVersion,
        computeBudgetConfig
      })

      const meta = getTxMeta({
        action: 'harvest',
        values: {
          symbolA: getMintSymbol({ mint: poolInfo.mintA, transformSol: true }),
          symbolB: getMintSymbol({ mint: poolInfo.mintB, transformSol: true })
        }
      })

      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({
            txId,
            ...meta,
            mintInfo: [poolInfo.mintA, poolInfo.mintB],
            signedTx,
            ...txProps,
            onConfirmed: () => {
              onConfirmed?.()
              if (needRefresh) setTimeout(() => useTokenAccountStore.setState({ refreshClmmPositionTag: Date.now() }), 500)
            }
          })
          return txId
        })
        .catch((e) => {
          txProps.onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
        .finally(txProps.onFinally)
    },

    setRewardsAct: async ({ poolInfo, rewardInfos, newRewardInfos, onConfirmed, ...txProps }) => {
      const { raydium, txVersion } = useAppStore.getState()
      if (!raydium || rewardInfos.length + newRewardInfos.length < 1) return ''
      const allBuildData: (
        | TxV0BuildData<{
            address: Record<string, PublicKey>
          }>
        | TxBuildData<{
            address: Record<string, PublicKey>
          }>
      )[] = []

      const meta = getTxMeta({
        action: 'updateRewards',
        values: {
          pool: poolInfo.id.slice(0, 6)
        }
      })
      const computeBudgetConfig = await getComputeBudgetConfig()
      if (rewardInfos.length) {
        const setRewardsBuildData = await raydium.clmm.setRewards({
          poolInfo,
          ownerInfo: { useSOLBalance: true },
          rewardInfos,
          computeBudgetConfig,
          txVersion
        })

        if (!newRewardInfos.length)
          return setRewardsBuildData
            .execute()
            .then(({ txId, signedTx }) => {
              txStatusSubject.next({ txId, ...meta, signedTx, mintInfo: newRewardInfos.map((r) => r.mint), onConfirmed })
              return txId
            })
            .catch((e) => {
              txProps.onError?.()
              toastSubject.next({ txError: e, ...meta })
              return ''
            })
            .finally(txProps.onFinally)
        allBuildData.push(setRewardsBuildData)
      }
      if (newRewardInfos.length) {
        const initRewardBuildData = await raydium.clmm.initRewards({
          poolInfo,
          ownerInfo: { useSOLBalance: true },
          checkCreateATAOwner: true,
          rewardInfos: newRewardInfos,
          computeBudgetConfig,
          txVersion
        })

        if (!rewardInfos.length)
          return initRewardBuildData
            .execute()
            .then(({ txId }) => {
              txStatusSubject.next({ txId, ...meta, mintInfo: rewardInfos.map((r) => r.mint), onConfirmed })
              return txId
            })
            .catch((e) => {
              txProps.onError?.()
              toastSubject.next({ txError: e, ...meta })
              return ''
            })
            .finally(txProps.onFinally)
        allBuildData.push(initRewardBuildData)
      }
      const builder0 = allBuildData[0].builder
      const res = await builder0.addInstruction(allBuildData[1].builder.AllTxData).build()
      if (!res) {
        txProps.onError?.()
        txProps.onFinally?.()
        return ''
      }
      const mints = new Map()
      rewardInfos.forEach((r) => mints.set(r.mint.address, r.mint))
      newRewardInfos.forEach((r) => mints.set(r.mint.address, r.mint))
      return res
        .execute()
        .then(({ txId }) => {
          txStatusSubject.next({ txId, ...txProps, ...meta, mintInfo: Array.from(mints.values()) })
          return txId
        })
        .catch((e) => {
          txProps.onError?.()
          toastSubject.next({ txError: e, ...meta })
          return ''
        })
        .finally(txProps.onFinally)
    },

    createClmmPool: async ({ token1, token2, config, price, execute, forerunCreate, getObserveState, nonce }) => {
      const { raydium, publicKey, txVersion, programIdConfig, info, getUserMix } = useAppStore.getState()
      if (!raydium || !publicKey || !info) {
        toastSubject.next({ noRpc: true })
        return { txId: '' }
      }
      try {
        const computeBudgetConfig = forerunCreate ? undefined : await getComputeBudgetConfig()
        if (!raydium.owner) raydium.setOwner(publicKey);
        const txBuilder = new TxBuilder({
          connection: raydium.connection,
          owner: new Owner(publicKey),
          feePayer: new PublicKey(info.payer),
          cluster: raydium.cluster
        });

        let hash = ''
        if (nonce) {
          const nonceIns = SystemProgram.nonceAdvance({
            noncePubkey: new PublicKey(nonce.nonce_address),
            authorizedPubkey: new PublicKey(info.payer)
          })
          txBuilder.addInstruction({
            instructions: [nonceIns],
            instructionTypes: ["AdvanceNonceAccount"],
          })
          hash = nonce.nonce_hash
        }

        const mint1 = { ...token1.info, address: token1.info.address }
        const mint2 = { ...token2.info, address: token2.info.address }
        const initialPrice = new Decimal(price);
        const [mintA, mintB, initPrice] = new BN(new PublicKey(mint1.address).toBuffer()).gt(
          new BN(new PublicKey(mint2.address).toBuffer()),
        )
          ? [mint2, mint1, new Decimal(1).div(initialPrice)]
          : [mint1, mint2, initialPrice];
        const initialPriceX64 = SqrtPriceMath.priceToSqrtPriceX64(initPrice, mintA.decimals, mintB.decimals);
        const ammConfig = { ...config, id: new PublicKey(config.id), fundOwner: '', description: '' }
        const insInfo = await ClmmInstrument.createPoolInstructions({
          connection: raydium.connection,
          programId: programIdConfig.CLMM_PROGRAM_ID,
          owner: new PublicKey(publicKey),
          mintA,
          mintB,
          ammConfigId: ammConfig.id,
          initialPriceX64,
          forerunCreate: !getObserveState && forerunCreate,
        });
        txBuilder.addInstruction(insInfo);
        txBuilder.addCustomComputeBudget(computeBudgetConfig);
        const buildData = await txBuilder.versionBuild({
          txVersion,
          extInfo: {
            recentBlockHash: hash ? hash : undefined,
            address: {
              ...insInfo.address,
              observationId: insInfo.address.observationId.toBase58(),
              exBitmapAccount: insInfo.address.exBitmapAccount.toBase58(),
              programId: programIdConfig.CLMM_PROGRAM_ID.toString(),
              id: insInfo.address.poolId.toString(),
              mintA,
              mintB,
              openTime: '0',
              vault: { A: insInfo.address.mintAVault.toString(), B: insInfo.address.mintBVault.toString() },
              rewardInfos: [],
              config: {
                id: ammConfig.id.toString(),
                index: ammConfig.index,
                protocolFeeRate: ammConfig.protocolFeeRate,
                tradeFeeRate: ammConfig.tradeFeeRate,
                tickSpacing: ammConfig.tickSpacing,
                fundFeeRate: ammConfig.fundFeeRate,
                description: ammConfig.description,
                defaultRange: 0,
                defaultRangePoint: [],
              },
            },
            mockPoolInfo: {
              type: "Concentrated" as "Concentrated",
              rewardDefaultPoolInfos: "Clmm" as "Clmm",
              id: insInfo.address.poolId.toString(),
              mintA,
              mintB,
              feeRate: ammConfig.tradeFeeRate,
              openTime: '0',
              programId: programIdConfig.CLMM_PROGRAM_ID.toString(),
              price: initPrice.toNumber(),
              config: {
                id: ammConfig.id.toString(),
                index: ammConfig.index,
                protocolFeeRate: ammConfig.protocolFeeRate,
                tradeFeeRate: ammConfig.tradeFeeRate,
                tickSpacing: ammConfig.tickSpacing,
                fundFeeRate: ammConfig.fundFeeRate,
                description: ammConfig.description,
                defaultRange: 0,
                defaultRangePoint: [],
              },
              burnPercent: 0,
              ...mockV3CreatePoolInfo,
            },
            forerunCreate,
          },
        }) ;

        const { execute: executeTx } = buildData
        if (execute) {
          const meta = getTxMeta({
            action: 'createPool',
            values: {}
          })

          return executeTx()
            .then(({ txId, signedTx }) => {
              txStatusSubject.next({ txId, ...meta, signedTx, mintInfo: [token1.info, token2.info] })
              return { txId, buildData }
            })
            .catch((e) => {
              toastSubject.next({ txError: e, ...meta })
              return { txId: '' }
            })
        }
        return { txId: '', buildData }
      } catch (e: any) {
        console.error(e)
        toastSubject.next({
          status: 'error',
          title: 'Error',
          description: e.message.includes('byte array longer than') ? 'Current price out of range' : e.message
        })
        return { txId: '' }
      }
    },

    createFarm: async ({ poolInfo, rewardInfos, onSent, onError, onFinally, onConfirmed }) => {
      const { raydium, publicKey, txVersion } = useAppStore.getState()
      if (!raydium || !publicKey) return ''
      const { execute } = await raydium.clmm.initRewards({
        poolInfo,
        rewardInfos: rewardInfos.map((r) => ({ ...r, mint: solToWSolToken(r.mint) })),
        ownerInfo: {
          useSOLBalance: true
        },
        checkCreateATAOwner: true,
        txVersion
      })

      const meta = getTxMeta({
        action: 'createFarm',
        values: { poolId: `${poolInfo.id.slice(0, 4)}...${poolInfo.id.slice(-4)}` }
      })
      return execute()
        .then(({ txId, signedTx }) => {
          txStatusSubject.next({ txId, ...meta, signedTx, mintInfo: rewardInfos.map((r) => r.mint), onConfirmed })
          onSent?.()
          return txId
        })
        .catch((e) => {
          toastSubject.next({ txError: e, ...meta })
          onError?.()
          return ''
        })
        .finally(onFinally)
    },

    fetchAmmConfigsAct: async () => {
      const { raydium } = useAppStore.getState()
      if (Object.keys(get().clmmFeeConfigs).length || !raydium) return
      try {
        const res = await raydium.api.getClmmConfigs()
        const apiRes = res.reduce(
          (acc, cur) => ({
            ...acc,
            [cur.id]: cur
          }),
          {}
        )
        set({ clmmFeeConfigs: apiRes || CLMM_FEE_CONFIGS }, false, { type: 'fetchAmmConfigsAct' })
      } catch {
        set({ clmmFeeConfigs: CLMM_FEE_CONFIGS }, false, { type: 'fetchAmmConfigsAct' })
      }
    },

    // store related utils
    convertPoolPrice: ({ pool, price }) => {
      const p = new Decimal(price ?? '0').clamp(
        1 / 10 ** Math.max(pool.mintA?.decimals ?? 0, pool.mintB?.decimals ?? 0, new Decimal(price).decimalPlaces()),
        Number.MAX_SAFE_INTEGER
      )
      return new Price({
        baseToken: toToken(pool.mintA),
        denominator: new BN(10).pow(new BN(20 + pool.mintA!.decimals)),
        quoteToken: toToken(pool.mintB),
        numerator: p.mul(new Decimal(10 ** (20 + pool.mintB!.decimals))).toFixed(0)
      })
    },
    getPriceAndTick: ({ pool, price, baseIn }) => {
      if (!pool || price === '0') return
      try {
        const p = new Decimal(price || '0').clamp(1 / 10 ** Math.max(pool.mintA.decimals, pool.mintB.decimals), Number.MAX_SAFE_INTEGER)
        return TickUtils.getPriceAndTick({
          poolInfo: pool,
          price: p,
          baseIn
        })
      } catch (e: any) {
        toastSubject.next({
          status: 'error',
          title: 'error',
          description: e.message.includes('not within the supported sqrtPrice range') ? 'Price for tick overflow' : e.message
        })
      }
    },
    getTickPrice: ({ pool, tick, baseIn }) => {
      if (!pool) return
      try {
        return TickUtils.getTickPrice({
          poolInfo: pool,
          tick,
          baseIn
        })
      } catch (e: any) {
        toastSubject.next({
          status: 'error',
          title: 'error',
          description: e.message
        })
      }
    },
    computePairAmount: async ({ pool, inputA, tickLower, tickUpper, amount }) => {
      const [connection, getEpochInfo] = [useAppStore.getState().connection, useAppStore.getState().getEpochInfo]
      const slippage = useLiquidityStore.getState().slippage
      const poolInfo = pool
      const epochInfo = await getEpochInfo()
      if (!poolInfo || !connection || tickLower === undefined || tickLower === undefined || !epochInfo) {
        return
      }
      const [decimalA, decimalB] = [poolInfo.mintA?.decimals ?? 6, poolInfo.mintB?.decimals ?? 6]
      const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
        poolInfo,
        slippage: 0,
        inputA,
        tickUpper: Math.max(tickLower, tickUpper!),
        tickLower: Math.min(tickLower, tickUpper!),
        amount: new BN(new Decimal(amount || '0').mul(10 ** (inputA ? decimalA : decimalB)).toFixed(0)),
        add: true,
        amountHasFee: true,
        epochInfo: epochInfo!
      })
      return {
        amountA: new Decimal(res.amountA.amount.toString()).div(10 ** decimalA),
        amountSlippageA: new Decimal(res.amountSlippageA.amount.toString()).mul(1 + slippage).div(10 ** decimalA),
        amountB: new Decimal(res.amountB.amount.toString()).div(10 ** decimalB),
        amountSlippageB: new Decimal(res.amountSlippageB.amount.toString()).mul(1 + slippage).div(10 ** decimalB),
        liquidity: res.liquidity,
        calResult: res
      }
    },
    loadAddRewardWhiteListAct: async (props) => {
      const raydium = useAppStore.getState().raydium
      if (!raydium) return ''
      const { checkFetch } = props || {}
      if (checkFetch && get().rewardWhiteListMints.length > 0) return
      raydium.clmm.getWhiteListMint({ programId: useAppStore.getState().programIdConfig.CLMM_PROGRAM_ID }).then((data) => {
        set({ rewardWhiteListMints: data }, false, { type: 'loadAddRewardWhiteListAct' })
      })
    },
    reset: () => set(clmmInitState)
  }),
  'useClmmStore'
)
