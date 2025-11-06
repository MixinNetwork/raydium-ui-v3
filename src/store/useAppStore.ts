import { Connection, PublicKey, Transaction, VersionedTransaction, EpochInfo, clusterApiUrl, Commitment } from '@solana/web3.js'
import {
  Raydium,
  RaydiumLoadParams,
  API_URLS,
  API_URL_CONFIG,
  ProgramIdConfig,
  ALL_PROGRAM_ID,
  JupTokenType,
  AvailabilityCheckAPI3,
  TxVersion,
  TokenInfo,
  SOLMint,
  WSOLMint
} from '@raydium-io/raydium-sdk-v2'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { Wallet } from '@solana/wallet-adapter-react'
import { buildMixAddress, MixinApi, RequestConfig, SafeUtxoOutput, sleep, UserResponse, WebViewApi, WebviewAsset, type Keystore } from '@mixin.dev/mixin-node-sdk';
import createStore from './createStore'
import { blackJupMintSet, useTokenStore } from './useTokenStore'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import axios from '@/api/axios'
import { initComputerClient } from '@/api/computer';
import { isValidUrl } from '@/utils/url'
import { setStorageItem, getStorageItem } from '@/utils/localStorage'
import { retry, isProdEnv } from '@/utils/common'
import { compare } from 'compare-versions'
import { ComputerAssetResponse, ComputerInfoResponse, ComputerUserResponse, UserAssetBalance, UserAssetBalanceWithoutAsset } from '@/types/computer';
import { add } from '@/utils/number';
import { SOL_ASSET_ID } from '@/utils/constant';

export const defaultNetWork = WalletAdapterNetwork.Mainnet // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
export const defaultEndpoint = clusterApiUrl(defaultNetWork) // You can also provide a custom RPC endpoint
export const APR_MODE_KEY = '_r_apr_'
export const EXPLORER_KEY = '_r_explorer_'
export const supportedExplorers = [
  {
    name: 'Solscan',
    icon: '/images/explorer-solscan.png',
    host: 'https://solscan.io'
  },
  {
    name: 'Explorer',
    icon: '/images/explorer-solana.png',
    host: 'https://explorer.solana.com'
  },
  {
    name: 'SolanaFM',
    icon: '/images/explorer-solanaFM.png',
    host: 'https://solana.fm'
  }
]

const RPC_URL_KEY = '_r_rpc_dev_'
const RPC_URL_PROD_KEY = '_r_rpc_prod_'
let isRpcLoading = false
export const FEE_KEY = '_r_fee_'
export const PRIORITY_LEVEL_KEY = '_r_fee_level_'
export const PRIORITY_MODE_KEY = '_r_fee_mode_'
export const USER_ADDED_KEY = '_r_u_added_'
export enum PriorityLevel {
  Fast,
  Turbo,
  Ultra
}
export enum PriorityMode {
  MaxCap,
  Exact
}

interface RpcItem {
  url: string
  ws?: string
  weight: number
  batch: boolean
  name: string
}

export type MixinClient = ReturnType<typeof MixinApi>;

interface AppState {
  user?: UserResponse;
  keystore?: Keystore;
  balances: Record<string, UserAssetBalance>;
  balanceAddressMap: Record<string, UserAssetBalance>;
  getMixinClient: () => MixinClient;
  setKeystore: (k :Keystore) => MixinClient;
  getMe: () => Promise<void>;
  updateBalances: (cas: ComputerAssetResponse[]) => Promise<void>;
  getUserMix: () => string;

  info?: ComputerInfoResponse;
  account?: ComputerUserResponse;
  getComputerInfo: () => Promise<void>;
  getComputerAccount: () => Promise<void>;
  getComputerRecipient: () => string;

  raydium?: Raydium
  connection?: Connection
  signAllTransactions?: (<T extends Transaction | VersionedTransaction>(transaction: T[]) => Promise<T[]>) | undefined
  publicKey?: PublicKey
  explorerUrl: string
  isMobile: boolean
  isDesktop: boolean
  aprMode: 'M' | 'D'
  wallet?: Wallet
  initialing: boolean
  connected: boolean
  chainTimeOffset: number
  blockSlotCountForSecond: number
  commitment: Commitment

  rpcNodeUrl?: string
  wsNodeUrl?: string
  rpcs: RpcItem[]
  urlConfigs: typeof API_URLS & {
    SWAP_HOST: string
    SWAP_COMPUTE: string
    SWAP_TX: string
  }
  programIdConfig: typeof ALL_PROGRAM_ID

  jupTokenType: JupTokenType
  displayTokenSettings: { official: boolean; jup: boolean; userAdded: boolean }

  featureDisabled: Partial<AvailabilityCheckAPI3>

  epochInfo?: EpochInfo
  txVersion: TxVersion
  tokenAccLoaded: boolean

  appVersion: string
  needRefresh: boolean

  priorityLevel: PriorityLevel
  priorityMode: PriorityMode
  transactionFee?: string
  feeConfig: Partial<Record<PriorityLevel, number>>

  getPriorityFee: () => string | undefined
  getEpochInfo: () => Promise<EpochInfo | undefined>
  initRaydiumAct: (payload: RaydiumLoadParams) => Promise<void>
  fetchChainTimeAct: () => void
  fetchRpcsAct: () => Promise<void>
  fetchBlockSlotCountAct: () => Promise<void>
  setUrlConfigAct: (urls: API_URL_CONFIG) => void
  setProgramIdConfigAct: (urls: ProgramIdConfig) => void
  setRpcUrlAct: (url: string, skipToast?: boolean, skipError?: boolean) => Promise<boolean>
  setAprModeAct: (mode: 'M' | 'D') => void
  checkAppVersionAct: () => Promise<void>
  fetchPriorityFeeAct: () => Promise<void>
}

const loadKeystore = () => {
  try {
    const value = localStorage.getItem('keystore');
    if (!value) return undefined
    return JSON.parse(value) as Keystore;
  } catch {
    return undefined
  }
};
const saveKeystore = (k: Keystore) => {
  localStorage.setItem('keystore', JSON.stringify(k));
}
const client = initComputerClient();

const appInitState = {
  keystore: loadKeystore(),
  balances: {},
  balanceAddressMap: {},

  raydium: undefined,
  initialing: false,
  connected: false,
  chainTimeOffset: 0,
  blockSlotCountForSecond: 0,
  explorerUrl: supportedExplorers[0].host,
  isMobile: false,
  isDesktop: false,
  aprMode: 'M' as 'M' | 'D',
  rpcs: [],
  urlConfigs: API_URLS,
  programIdConfig: ALL_PROGRAM_ID,
  jupTokenType: JupTokenType.Strict,
  displayTokenSettings: {
    official: true,
    jup: true,
    userAdded: true
  },
  featureDisabled: {},
  txVersion: TxVersion.V0,
  appVersion: 'V3.0.2',
  needRefresh: false,
  tokenAccLoaded: false,
  commitment: 'confirmed' as Commitment,

  priorityLevel: PriorityLevel.Turbo,
  priorityMode: PriorityMode.MaxCap,
  feeConfig: {},
  transactionFee: '0.01'
}

let rpcLoading = false
let epochInfoCache = {
  time: 0,
  loading: false
}

const defaultHttpConfig: RequestConfig = {
  timeout: 1000 * 60
}

const processUserBalance = async (mc: MixinClient, bm: Record<string, UserAssetBalanceWithoutAsset>, as: ComputerAssetResponse[]) => {
  if (!bm[SOL_ASSET_ID]) bm[SOL_ASSET_ID] = {
    asset_id: SOL_ASSET_ID,
    total_amount: "0",
    address: "11111111111111111111111111111111"
  }
  as.forEach(a => {
    if (bm[a.asset_id]) return;
    bm[a.asset_id] = {
      asset_id: a.asset_id,
      total_amount: "0",
      address: a.address
    }
  });

  const deployedAddrs = as.map(a => a.address);
  const assets = await mc.safe.fetchAssets(Object.keys(bm));
  const fbm = assets.reduce((prev, cur) => {
    if (cur.chain_id === SOL_ASSET_ID && deployedAddrs.includes(cur.asset_key)) 
      return prev;
    const b = bm[cur.asset_id]
    const v: UserAssetBalance = { ...b, asset: {
      ...cur,
      name: cur.display_name,
      symbol: cur.display_symbol,
    } }
    if (cur.chain_id === SOL_ASSET_ID) 
      v.address = cur.asset_key;
    prev[cur.asset_id] = v;
    return prev
  }, {} as Record<string, UserAssetBalance>)
  const bs = Object.values(fbm).filter(b => b.address);
  const am = Object.fromEntries(bs.map(b => [b.address, b])) as Record<string, UserAssetBalance>
  if (am[SOLMint.toString()] && !am[WSOLMint.toString()]) am[WSOLMint.toString()] = {
    ...am[SOLMint.toString()],
    hide: true
  }
  return [fbm, am];
}

export const useAppStore = createStore<AppState>(
  (set, get) => ({
    ...appInitState,
    setKeystore: (keystore: Keystore) => {
      saveKeystore(keystore);
      set({ keystore })
      return MixinApi({ keystore, requestConfig: defaultHttpConfig });
    },
    getMixinClient: () => {
      const { keystore } = get();
      return MixinApi({ keystore, requestConfig: defaultHttpConfig });
    },
    getMe: async () => {
      const { keystore } = get();
      if (!keystore) return;
      const mc = MixinApi({ keystore, requestConfig: defaultHttpConfig });
      try {
        const user = await mc.user.profile();
        const mix = buildMixAddress({
          version: 2,
          xinMembers: [],
          uuidMembers: [user.user_id],
          threshold: 1
        })
        const account = await client.fetchUser(mix);
        if (account) 
          set({ user, account, connected: true, publicKey: new PublicKey(account.chain_address) });
        else
          set({ user });
      } catch {}
    },
    getUserMix: () => {
      const { user } = get();
      if (!user) return '';
      return buildMixAddress({
        version: 2,
        xinMembers: [],
        uuidMembers: [user.user_id],
        threshold: 1
      })
    },
    updateBalances: async (as: ComputerAssetResponse[]) => {
      const { user, getMixinClient } = get();
      if (!user) return;
      const client = getMixinClient();
      const webview = WebViewApi();
      const platform = webview.getMixinContext().platform ?? '';

      switch (platform) {
        case 'Android':
        case 'iOS': {
          const cb = async (assets: WebviewAsset[]) => {
            try {
              const bm = {} as Record<string, UserAssetBalanceWithoutAsset>;
              assets.forEach(a => {
                const address = as.find(a => a.asset_id === a.asset_id)?.address;
                bm[a.asset_id] = {
                  asset_id: a.asset_id,
                  total_amount: a.balance,
                  address,
                }
              })
              const [fbm, am] = await processUserBalance(client, bm, as)
              set({ balances: fbm, balanceAddressMap: am })
            } catch (e) {}
          }
          await webview.getAssets([], cb);
          break;
        }
        default: {
          const members = [user.user_id];
          let offset = 0
          let total: SafeUtxoOutput[] = []
          while(true) {
            const outputs = await client.utxo.safeOutputs({
              limit: 500,
              members,
              threshold: 1,
              state: 'unspent',
              offset
            });
            total = [...total, ...outputs]
            if (outputs.length < 500) {
              break;
            }
            offset = outputs[outputs.length - 1].sequence + 1
          }
          const bm = total.reduce((prev, cur) => {
            if (cur.inscription_hash) return prev;
            const key = cur.asset_id;
            if (prev[key]) {
              prev[key].total_amount = add(prev[key].total_amount, cur.amount).toString();
            } else {
              const address = as.find(a => a.asset_id === cur.asset_id)?.address;
              prev[key] = {
                asset_id: cur.asset_id,
                total_amount: cur.amount,
                address,
              }
            }
            return prev
          }, {} as Record<string, UserAssetBalanceWithoutAsset>)
          const [fbm, am] = await processUserBalance(client, bm, as)
          set({ balances: fbm, balanceAddressMap: am })
        }
      }
    },
    getComputerInfo: async () => {
      const info = await client.fetchInfo();
      if (info) set({ info });
    },
    getComputerAccount: async () => {
      const { user, getUserMix } = get();
      if (!user) return;
      try {
        const account = await client.fetchUser(getUserMix());
        if (account) set({ account, connected: true, publicKey: new PublicKey(account.chain_address) });
      } catch {}
    },
    getComputerRecipient: () => {
      const { info } = get();
      if (!info) return '';
      return buildMixAddress({
        version: 2,
        xinMembers: [],
        uuidMembers: info.members.members,
        threshold: info.members.threshold,
      })
    },

    initRaydiumAct: async (payload) => {
      const action = { type: 'initRaydiumAct' }
      const { initialing, urlConfigs, jupTokenType, displayTokenSettings } = get()
      if (initialing) return
      const connection = new Connection(process.env.NEXT_PUBLIC_RPC!)
      set({ initialing: true }, false, action)
      const isDev = window.location.host === 'localhost:3002'

      const raydium = await Raydium.load({
        ...payload,
        connection,
        urlConfigs: {
          ...urlConfigs,
          BASE_HOST: !isProdEnv() ? getStorageItem('_r_api_host_') || urlConfigs.BASE_HOST : urlConfigs.BASE_HOST
        },
        jupTokenType,
        logRequests: !isDev,
        disableFeatureCheck: true,
        loopMultiTxStatus: true,
        blockhashCommitment: 'finalized'
      })
      useTokenStore.getState().extraLoadedTokenList.forEach((t) => {
        const existed = raydium.token.tokenMap.has(t.address)
        if (!existed) {
          raydium.token.tokenList.push(t)
          raydium.token.tokenMap.set(t.address, t)
          raydium.token.mintGroup.official.add(t.address)
        }
      })
      const tokenMap = new Map(Array.from(raydium.token.tokenMap))
      const tokenList = (JSON.parse(JSON.stringify(raydium.token.tokenList)) as TokenInfo[])
        .filter((t) => {
          if (blackJupMintSet.has(t.address)) {
            tokenMap.delete(t.address)
            raydium.token.tokenMap.delete(t.address)
            raydium.token.mintGroup.jup.delete(t.address)
            return false
          }
          return true
        })
        .map((t) => {
          if (t.type === 'jupiter') {
            const newInfo = { ...t, logoURI: t.logoURI ? `https://wsrv.nl/?fit=cover&w=48&h=48&url=${t.logoURI}` : t.logoURI }
            tokenMap.set(t.address, newInfo)
            return newInfo
          }
          return t
        })
      useTokenStore.setState(
        {
          tokenList,
          displayTokenList: tokenList.filter((token) => {
            return (
              (displayTokenSettings.official && raydium.token.mintGroup.official.has(token.address)) ||
              (displayTokenSettings.jup && raydium.token.mintGroup.jup.has(token.address))
            )
          }),
          tokenMap,
          mintGroup: raydium.token.mintGroup,
          whiteListMap: new Set(Array.from(raydium.token.whiteListMap))
        },
        false,
        action
      )
      set({ raydium, initialing: false, }, false, action)
      set(
        {
          featureDisabled: {
            swap: raydium.availability.swap === false,
            createConcentratedPosition: raydium.availability.createConcentratedPosition === false,
            addConcentratedPosition: raydium.availability.addConcentratedPosition === false,
            addStandardPosition: raydium.availability.addStandardPosition === false,
            removeConcentratedPosition: raydium.availability.removeConcentratedPosition === false,
            removeStandardPosition: raydium.availability.removeStandardPosition === false,
            addFarm: raydium.availability.addFarm === false,
            removeFarm: raydium.availability.removeFarm === false
          }
        },
        false,
        action
      )

      setTimeout(() => {
        get().fetchChainTimeAct()
      }, 1000)
    },
    fetchChainTimeAct: () => {
      const { urlConfigs } = get()
      axios
        .get<{ offset: number }>(`${urlConfigs.BASE_HOST}${urlConfigs.CHAIN_TIME}`)
        .then((data) => {
          set({ chainTimeOffset: isNaN(data?.data.offset) ? 0 : data.data.offset * 1000 }, false, { type: 'fetchChainTimeAct' })
        })
        .catch(() => {
          set({ chainTimeOffset: 0 }, false, { type: 'fetchChainTimeAct' })
        })
    },
    fetchBlockSlotCountAct: async () => {
      const { raydium, connection } = get()
      if (!raydium || !connection) return
      const res: {
        id: string
        jsonrpc: string
        result: { numSlots: number; numTransactions: number; samplePeriodSecs: number; slot: number }[]
      } = await axios.post(connection.rpcEndpoint, {
        id: 'getRecentPerformanceSamples',
        jsonrpc: '2.0',
        method: 'getRecentPerformanceSamples',
        params: [4]
      })
      const slotList = res.result.map((data) => data.numSlots)
      set({ blockSlotCountForSecond: slotList.reduce((a, b) => a + b, 0) / slotList.length / 60 }, false, {
        type: 'fetchBlockSlotCountAct'
      })
    },
    setUrlConfigAct: (urls) => {
      set({ urlConfigs: { ...get().urlConfigs, ...urls } }, false, { type: 'setUrlConfigAct' })
    },
    setProgramIdConfigAct: (urls) => {
      set({ programIdConfig: { ...get().programIdConfig, ...urls } }, false, { type: 'setProgramIdConfigAct' })
    },
    fetchRpcsAct: async () => {
      const { urlConfigs, setRpcUrlAct } = get()
      if (rpcLoading) return
      rpcLoading = true
      try {
        const {
          data: { rpcs }
        } = await axios.get<{ rpcs: RpcItem[] }>(urlConfigs.BASE_HOST + urlConfigs.RPCS)
        set({ rpcs }, false, { type: 'fetchRpcsAct' })
        const localRpcNode: { rpcNode?: RpcItem; url?: string } = process.env.NEXT_PUBLIC_RPC
          ? {
            url: process.env.NEXT_PUBLIC_RPC,
          }
          : {}

        let i = 0
        const checkAndSetRpcNode = async () => {
          const readyRpcs = [...rpcs]
          if (localRpcNode?.rpcNode) readyRpcs.sort((a) => (a.name === localRpcNode.rpcNode!.name ? -1 : 1))
          const success = await setRpcUrlAct(readyRpcs[i].url, true, i !== readyRpcs.length - 1)
          if (!success) {
            i++
            if (i < readyRpcs.length) {
              checkAndSetRpcNode()
            } else {
              console.error('All RPCs failed.')
            }
          }
        }

        if (localRpcNode && !localRpcNode.rpcNode && isValidUrl(localRpcNode.url)) {
          const success = await setRpcUrlAct(localRpcNode.url!, true, true)
          if (!success) checkAndSetRpcNode()
        } else {
          checkAndSetRpcNode()
        }
      } finally {
        rpcLoading = false
      }
    },
    setRpcUrlAct: async (url, skipToast, skipError) => {
      if (url === get().rpcNodeUrl) {
        toastSubject.next({
          status: 'info',
          title: 'Switch Rpc Node',
          description: 'Rpc node already in use'
        })
        return true
      }
      try {
        if (!isValidUrl(url)) throw new Error('invalid url')
        if (isRpcLoading) {
          toastSubject.next({
            status: 'warning',
            title: 'Switch Rpc Node',
            description: 'Validating Rpc node..'
          })
          return false
        }
        isRpcLoading = true
        await retry<Promise<EpochInfo>>(() => axios.post(url, { method: 'getEpochInfo' }, { skipError: true }), {
          retryCount: 3,
          onError: () => (isRpcLoading = false)
        })
        isRpcLoading = false
        const rpcNode = get().rpcs.find((r) => r.url === url)
        set({ rpcNodeUrl: url, wsNodeUrl: rpcNode?.ws, tokenAccLoaded: false }, false, { type: 'setRpcUrlAct' })
        setStorageItem(
          isProdEnv() ? RPC_URL_PROD_KEY : RPC_URL_KEY,
          JSON.stringify({
            rpcNode: rpcNode ? { ...rpcNode, url: '' } : undefined,
            url
          })
        )
        if (!skipToast)
          toastSubject.next({
            status: 'success',
            title: 'Switch Rpc Node Success',
            description: 'Rpc node switched'
          })
        return true
      } catch {
        if (!skipError)
          toastSubject.next({
            status: 'error',
            title: 'Switch Rpc Node error',
            description: 'Invalid rpc node'
          })
        return false
      }
    },
    setAprModeAct: (mode) => {
      setStorageItem(APR_MODE_KEY, mode)
      set({ aprMode: mode })
    },
    checkAppVersionAct: async () => {
      const { urlConfigs, appVersion } = get()
      const res = await axios.get<{
        latest: string
        least: string
      }>(`${urlConfigs.BASE_HOST}${urlConfigs.VERSION}`)
      set({ needRefresh: compare(appVersion, res.data.latest, '<') })
    },

    fetchPriorityFeeAct: async () => {
      const { urlConfigs } = get()
      const { data } = await axios.get<{
        default: {
          h: number
          m: number
          vh: number
        }
      }>(`${urlConfigs.BASE_HOST}${urlConfigs.PRIORITY_FEE}`)
      set({
        feeConfig: {
          [PriorityLevel.Fast]: data.default.m / 10 ** 9,
          [PriorityLevel.Turbo]: data.default.h / 10 ** 9,
          [PriorityLevel.Ultra]: data.default.vh / 10 ** 9
        }
      })
    },

    getPriorityFee: () => {
      const { priorityMode, priorityLevel, transactionFee, feeConfig } = get()
      if (priorityMode === PriorityMode.Exact) return transactionFee ? String(transactionFee) : transactionFee
      if (feeConfig[priorityLevel] === undefined || transactionFee === undefined) return String(feeConfig[PriorityLevel.Turbo] ?? 0)
      return String(Math.min(Number(transactionFee), feeConfig[priorityLevel]!))
    },

    getEpochInfo: async () => {
      const [connection, epochInfo] = [get().connection, get().epochInfo]
      if (!connection) return undefined
      if (epochInfo && Date.now() - epochInfoCache.time <= 30 * 1000) return epochInfo
      if (epochInfoCache.loading) return epochInfo
      epochInfoCache.loading = true
      const newEpochInfo = await retry<Promise<EpochInfo>>(() => connection.getEpochInfo())
      epochInfoCache = { time: Date.now(), loading: false }
      set({ epochInfo: newEpochInfo }, false, { type: 'useAppStore.getEpochInfo' })
      return newEpochInfo
    },
    reset: () => set(appInitState)
  }),
  'useAppStore'
)
