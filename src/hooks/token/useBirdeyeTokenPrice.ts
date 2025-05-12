import axios from '@/api/axios'
import { Asset } from '@/types/computer'
import { birdeyePriceUrl } from '@/utils/config/birdeyeAPI'
import { MINUTE_MILLISECONDS } from '@/utils/date'
import { isValidPublicKey } from '@/utils/publicKey'
import { solToWSol, WSOLMint } from '@raydium-io/raydium-sdk-v2'
import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import useSWR from 'swr'

export interface BirdEyeTokenPrice {
  value: number
  updateUnixTime: number
  updateHumanTime: string
  priceChange24h: number
}

const fetcher = ([url, mintList]: [string, string]): Promise<{
  success: boolean
  data: { [key: string]: BirdEyeTokenPrice }
}> => {
  return axios.post(
    url,
    {
      list_address: mintList
    },
    {
      skipError: true
    }
  )
}

export default function useBirdeyeTokenPrice(props: {
  mintList: (string | PublicKey | undefined)[]
  refreshInterval?: number
  timeout?: number
  assetMap?: Record<string, Asset>
}) {
  const { mintList, refreshInterval = 2 * MINUTE_MILLISECONDS } = props || {}

  const readyList = useMemo(
    () => Array.from(new Set(mintList.filter((m) => !!m && isValidPublicKey(m)).map((m) => solToWSol(m!).toString()))),
    [JSON.stringify(mintList)]
  )

  const shouldFetch = readyList.length > 0

  const { data, isLoading, error, ...rest } = useSWR(shouldFetch ? [birdeyePriceUrl, readyList.join(',')] : null, fetcher, {
    refreshInterval,
    dedupingInterval: refreshInterval,
    focusThrottleInterval: refreshInterval
  })
  const isEmptyResult = !isLoading && !(data && !error)

  if (data?.data && data?.success) {
    data.data[PublicKey.default.toBase58()] = data.data[WSOLMint.toBase58()]
  }

  if (data?.data) {
    Object.keys(data.data).forEach((key) => {
      if (data.data[key] || !props.assetMap || !props.assetMap[key]) return
      const ts = Date.now();
      data.data[key] = {
        value: Number(props.assetMap[key].price_usd),
        updateUnixTime: ts,
        updateHumanTime: ts.toString(),
        priceChange24h: Number(props.assetMap[key].change_usd)
      }
    })
  }

  return {
    data: data?.success ? data?.data : {},
    isLoading,
    error,
    isEmptyResult,
    ...rest
  }
}
