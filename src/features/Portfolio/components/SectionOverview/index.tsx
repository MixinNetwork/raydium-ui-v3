import { useMemo } from 'react'
import { Heading, SimpleGrid } from '@chakra-ui/react'
import { colors } from '@/theme/cssVariables'
import useClmmPortfolioData from '@/hooks/portfolio/clmm/useClmmPortfolioData'
import useAllStandardPoolPosition from '@/hooks/portfolio/useAllStandardPoolPosition'
import PortfolioIdle from './components/PortfolioIdle'
import PortfolioInfo from './components/PortfolioInfo'
import useTokenBalance from '@/hooks/portfolio/useTokenBalance'
import useTokenPrice from '@/hooks/token/useTokenPrice'
import Decimal from 'decimal.js'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store'
import { RAYMint } from '@raydium-io/raydium-sdk-v2'

export enum AssetType {
  STANDARD = 'Standard',
  CONCENTRATED = 'Concentrated',
  STAKEDRAY = 'STAKEDRAY',
  ALL = 'All'
}

const RAYMintStr = RAYMint.toBase58()
export default function SectionOverview() {
  const { t } = useTranslation()
  const isMobile = useAppStore((s) => s.isMobile)
  const { idleList, idleBalance } = useTokenBalance()
  const { data: tokenPrices } = useTokenPrice({
    mintList: []
  })

  const { data: clmmPoolAssets, totalUSD: totalClmmPosition, clmmBalanceByMint } = useClmmPortfolioData({ type: AssetType.CONCENTRATED })
  const {
    standardPoolListByMint,
    totalUSD: totalStandardPosition
  } = useAllStandardPoolPosition({ type: AssetType.STANDARD })

  const productiveBalance = totalClmmPosition.add(totalStandardPosition).toString()

  const tokenAssetsNew = useMemo(() => {
    const total = { ...clmmBalanceByMint }
    Object.keys(standardPoolListByMint).forEach((key) => {
      const data = standardPoolListByMint[key]
      total[key] = {
        mint: total[key]?.mint || data.mint,
        amount: new Decimal(total[key]?.amount || 0).add(data.amount).toString(),
        usd: new Decimal(total[key]?.usd || 0).add(data.usd).toString()
      }
    })
    const allUSD = Object.values(total).reduce((acc, cur) => acc.add(cur.usd), new Decimal(0))

    return Object.values(total).map((data) => ({
      key: data.mint?.symbol || data.mint.address.slice(0, 6),
      value: data.usd,
      percentage: new Decimal(data.usd).div(allUSD).mul(100).toDecimalPlaces(2).toNumber()
    }))
  }, [clmmBalanceByMint, standardPoolListByMint])

  return (
    <>
      <Heading id="overview" fontSize={['lg', 'xl']} fontWeight="500" mb={[2, 4]} mt={[3, 6]} color={colors.textPrimary}>
        {t('portfolio.section_overview')}
      </Heading>
      <SimpleGrid templateColumns={['', '1fr 1fr']} gap={[3, 8]} overflow={['scroll']} mx={[-5, 0]} px={[5, 0]} scrollSnapType={'x'}>
        <PortfolioInfo
          poolAssets={[...clmmPoolAssets]}
          mobileAssets={[
            {
              key: 'CLMM',
              value: totalClmmPosition.toString(),
              percentage: 100,
              type: AssetType.CONCENTRATED
            },
          ]}
          tokenAssets={tokenAssetsNew}
        />
        {!isMobile && <PortfolioIdle idleBalance={idleBalance.toString()} productiveBalance={productiveBalance} idleList={idleList} />}
      </SimpleGrid>
    </>
  )
}
