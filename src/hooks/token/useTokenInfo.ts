import { useState, useEffect } from 'react'
import { TokenInfo } from '@raydium-io/raydium-sdk-v2'
import { PublicKey } from '@solana/web3.js'
import { getTokenInfo } from './api'
import { useTokenStore } from '@/store/useTokenStore'
import { useAppStore } from '@/store/useAppStore'
import { getMintSymbol } from '@/utils/token'
import { SafeAsset } from '@mixin.dev/mixin-node-sdk'
import { SOL_ASSET_ID } from '@/utils/constant'

export default function useTokenInfo({
  mint,
  programId,
  skipTokenMap,
  asset
}: {
  mint?: string | PublicKey
  programId?: PublicKey | undefined
  skipTokenMap?: boolean
  asset?: SafeAsset
}) {
  const tokenMap = useTokenStore((s) => s.tokenMap)
  const connection = useAppStore((s) => s.connection)
  const [loading, setLoading] = useState<boolean>(true)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | undefined>(undefined)

  useEffect(() => {
    if (tokenMap.size < 1) return
    if (!mint) {
      setLoading(false)
      setTokenInfo(undefined)
      return
    }
    const info = skipTokenMap ? undefined : tokenMap.get(mint.toString())

    if (!info) {
      setLoading(true)
      getTokenInfo({ mint, connection, programId }).then((r) => {
        if (r) {
          if (asset && asset.chain_id !== SOL_ASSET_ID) 
            r = {
              ...r,
              logoURI: asset.icon_url,
              symbol: asset.symbol,
              name: `${asset.name} (Mixin)`
            }
          setTokenInfo({
            ...r,
            symbol: getMintSymbol({ mint: r })
          })
        }
        setLoading(false)
      })
      return
    }

    setTokenInfo(info)
    setLoading(false)
  }, [mint, tokenMap, connection, programId])

  return { loading, tokenInfo }
}
