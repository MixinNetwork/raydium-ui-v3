import { useMemo } from 'react'
import { useAppStore, useTokenAccountStore, useTokenStore } from '@/store'
import useTokenPrice from '@/hooks/token/useTokenPrice'
import Decimal from 'decimal.js'
import { IdleType } from '@/features/Portfolio/components/SectionOverview/components/PortfolioIdle'
import { SOL_ASSET_ID } from '@/utils/constant'
import { add, compare, mul } from '@/utils/number'

const displayCount = 3

export default function useTokenBalance() {
  const balances = useAppStore((s) => s.balances)
  const tokenMap = useTokenStore((s) => s.tokenMap)
  const computerAssetIdMap = useTokenStore((s) => s.computerAssetIdMap)
  const [getTokenBalanceUiAmount, tokenAccounts] = useTokenAccountStore((s) => [s.getTokenBalanceUiAmount, s.tokenAccounts])
  const { data: tokenPrices } = useTokenPrice({
    mintList: tokenAccounts
      .filter((tokenAccount) => (tokenAccount.isNative || tokenAccount.isAssociated) && !tokenAccount.amount.isZero())
      .map((a) => a.mint)
  })

  const idleList: IdleType[] = useMemo(() => {
    const allBalance = Object.values(balances)
    .filter(b => {
      return b.asset.chain_id === SOL_ASSET_ID || !!computerAssetIdMap[b.asset_id]
    })
    .map(b => {
      const decimals = b.asset.chain_id === SOL_ASSET_ID 
        ? b.asset.precision
        : 8;
      const address = b.asset.chain_id === SOL_ASSET_ID 
        ? b.asset.asset_key
        : computerAssetIdMap[b.asset_id].address
      const value = mul(b.total_amount, b.asset.price_usd).toString()
      return {
        token: {
          decimals,
          chainId: 101,
          symbol: b.asset.symbol,
          address,
          programId: '',
          logoURI: '',
          name: b.asset.name,
          tags: [],
          extensions: {}
        },
        address: '',
        isZero: true,
        amount: b.total_amount,
        amountInUSD: value
      }
    })
    .sort((a, b) => {
      return -compare(a.amountInUSD, b.amountInUSD)
    })
    const top = allBalance.slice(0, displayCount);
    const other = allBalance.slice(displayCount, allBalance.length).reduce(
      (acc: any, cur: IdleType) => {
        const res = add(acc.amountInUSD, cur.amountInUSD)
        if (acc.isZero && res.isPositive()) acc.isZero = false;
        acc.amountInUSD = res.toString();
        return acc
      },
      {
        token: {
            decimals: 0,
            chainId: 101,
            symbol: 'Others',
            address: '',
            programId: '',
            logoURI: '',
            name: 'Others',
            tags: [],
            extensions: {}
          },
          address: '',
          isZero: true,
          amount: '',
          amountInUSD: '0'
      } as IdleType
    )
    return [...top, other]
  }, [tokenAccounts, getTokenBalanceUiAmount, tokenMap, tokenPrices])

  const idleBalance = useMemo(() => idleList.reduce((acc, cur) => acc.add(cur.amountInUSD), new Decimal(0)), [idleList])

  return {
    idleList,
    idleBalance
  }
}
