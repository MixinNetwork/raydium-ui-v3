import { useMemo, useCallback } from 'react'
import { PoolsApiReturn, FetchPoolParams, solToWSol, ApiV3PoolInfoItem, PoolFetchType } from '@raydium-io/raydium-sdk-v2'
import shallow from 'zustand/shallow'
import axios from '@/api/axios'
import { MINUTE_MILLISECONDS } from '@/utils/date'
import { useAppStore } from '@/store'
import { formatPoolData, formatAprData } from './formatter'
import { ReturnPoolType, ReturnFormattedPoolType } from './type'

import useSWRInfinite from 'swr/infinite'
import { KeyedMutator } from 'swr'
import { AxiosResponse } from 'axios'

export default function useFetchPoolByMint<T extends PoolFetchType>(
  props: {
    shouldFetch?: boolean
    showFarms?: boolean
    mint1?: string
    mint2?: string
    poolId?: string
    refreshInterval?: number
    type?: T
  } & Omit<FetchPoolParams, 'type'>
): {
  selectedPool?: ReturnPoolType<T>
  data: ReturnPoolType<T>[]
  formattedData: ReturnFormattedPoolType<T>[]
  formattedSelectedPool?: ReturnPoolType<T>
  isLoadEnded: boolean
  loadMore: () => void
  size: number
  mutate: KeyedMutator<AxiosResponse<PoolsApiReturn, any>[]>
  isValidating: boolean
  isLoading: boolean
} {
  const {
    shouldFetch = true,
    showFarms,
    mint1: propMint1 = '',
    mint2: propMint2 = '',
    type = PoolFetchType.All,
    sort = 'default',
    order = 'desc',
    pageSize = 100,
    refreshInterval = MINUTE_MILLISECONDS,
    poolId
  } = props || {}

  const fetcher = useCallback(
    (url: string) =>
      axios.get<PoolsApiReturn>(url, {
        skipError: true
      }),
    []
  )

  const [mint1, mint2] = [propMint1 ? solToWSol(propMint1).toBase58() : propMint1, propMint2 ? solToWSol(propMint2).toBase58() : propMint2]
  const [host, mintUrl] = useAppStore((s) => [s.urlConfigs.BASE_HOST, s.urlConfigs.POOL_SEARCH_MINT], shallow)
  const [baseMint, quoteMint] = mint2 && mint1 > mint2 ? [mint2, mint1] : [mint1, mint2]
  const url = (!mint1 && !mint2) || !shouldFetch ? null : host + mintUrl

  const { data, setSize, error, ...swrProps } = useSWRInfinite(
    (index) =>
      url
        ? url +
          `?mint1=${baseMint}&mint2=${quoteMint}&poolType=${
            showFarms ? `${type}Farm` : type
          }&poolSortField=${sort}&sortType=${order}&pageSize=${pageSize}&page=${index + 1}`
        : url,
    fetcher,
    {
      dedupingInterval: refreshInterval,
      focusThrottleInterval: refreshInterval,
      refreshInterval
    }
  )

  const loadMore = useCallback(() => setSize((s) => s + 1), [type, sort, order])

  const resData = useMemo(
    () =>
      (data || []).reduce((acc, cur) => acc.concat(cur?.data?.data || []).filter(Boolean), [] as ApiV3PoolInfoItem[]).map(formatAprData),
    [data]
  ) as ReturnPoolType<T>[]
  const formattedData = useMemo(() => resData.map((i) => formatPoolData(i)), [resData]) as ReturnFormattedPoolType<T>[]
  const selectedPool = resData && poolId ? (resData.find((d) => d.id === poolId) as ReturnPoolType<T>) : undefined
  const isLoadEnded = !swrProps.isLoading && (!resData.length || !!error)

  return {
    selectedPool,
    data: resData,
    formattedData,
    formattedSelectedPool: selectedPool ? (formatPoolData(selectedPool as ApiV3PoolInfoItem) as ReturnFormattedPoolType<T>) : undefined,
    isLoadEnded,
    loadMore,
    ...swrProps
  }
}

export function useFetchPoolsByMint<T extends PoolFetchType>(
  props: {
    addresses: string[]
    shouldFetch?: boolean
    showFarms?: boolean
    poolId?: string
    refreshInterval?: number
    type?: T
  } & Omit<FetchPoolParams, 'type'>
): {
  formattedData: ReturnFormattedPoolType<T>[]
  isLoadEnded: boolean
  isLoading: boolean
} {
  const {
    addresses,
    shouldFetch,
    showFarms,
    type = PoolFetchType.All,
    sort = 'liquidity',
    order = 'desc',
    pageSize = 100,
    refreshInterval = MINUTE_MILLISECONDS,
    poolId
  } = props || {}
  
  const fetcher = useCallback(
    async (urls: string[]) => {
      const responses = await Promise.all(urls.map(url => axios.get<PoolsApiReturn>(url, {
        skipError: true
      })));
      return responses;
    },
    []
  )

  const [host, mintUrl] = useAppStore((s) => [s.urlConfigs.BASE_HOST, s.urlConfigs.POOL_SEARCH_MINT], shallow)
  
  const pm: Record<string, ReturnFormattedPoolType<T>> = {}
  const urls = shouldFetch ? addresses.map(address => {
    const [baseMint, quoteMint] = [address, '']
    let url =  host + mintUrl;
    return url +
        `?mint1=${baseMint}&mint2=${quoteMint}&poolType=${
          showFarms ? `${type}Farm` : type
        }&poolSortField=${sort}&sortType=${order}&pageSize=${pageSize}&page=1`
  }) : [];

  const { data, error, ...swrProps } = useSWRInfinite(
      () => urls,
      fetcher,
      {
        dedupingInterval: refreshInterval,
        focusThrottleInterval: refreshInterval,
        refreshInterval
      }
  )
  const resData = useMemo(
    () =>
      (data || []).flat().reduce((acc, cur) => acc.concat(cur?.data?.data || []).filter(Boolean), [] as ApiV3PoolInfoItem[]).map(formatAprData),
    [data]
  ) as ReturnPoolType<T>[]
  const isLoadEnded = !swrProps.isLoading && (!resData.length || !!error)
  const formattedData = useMemo(() => resData.map((i) => formatPoolData(i)), [resData]) as ReturnFormattedPoolType<T>[]
  formattedData.forEach(p => {
    if (pm[p.id]) return;
    pm[p.id] = p;
  })

  const res = Object.values(pm).sort((a, b) => {
    let av = 0;
    let bv = 0;
    switch (sort) {
      // @ts-ignore
      case "default":
      case "liquidity":
        av = a.tvl;
        bv = b.tvl;
        break;
      case "volume24h":
        av = a.day.volume
        bv = b.day.volume
        break;
      case "volume7d":
        av = a.week.volume
        bv = b.week.volume
        break;
      case "volume30d":
        av = a.month.volume
        bv = b.month.volume
        break;
      case "fee24h":
        av = a.day.volumeFee
        bv = b.day.volumeFee
        break;
      case "fee7d":
        av = a.week.volumeFee
        bv = b.week.volumeFee
        break;
      case "fee30d":
        av = a.month.volumeFee
        bv = b.month.volumeFee
        break;
      case "apr24h":
        av = a.day.apr
        bv = b.day.apr
        break;
      case "apr7d":
        av = a.week.apr
        bv = b.week.apr
        break;
      case "apr30d":
        av = a.month.apr
        bv = b.month.apr
        break;
    }
    
    if (order === 'desc') return av >= bv ? -1 : 1;
    return av >= bv ? 1 : -1;
  })

  return {
    formattedData: res,
    isLoadEnded,
    isLoading: swrProps.isLoading
  }
}