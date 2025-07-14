import { useEffect, useRef, useState } from 'react'
import { Flex, Grid, GridItem, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/router'
import { colors } from '@/theme/cssVariables'
import { useAppStore } from '@/store/useAppStore'
import { ClmmMyPositionTabContent } from './TabClmm'
import { useStateWithUrl } from '@/hooks/useStateWithUrl'
import IntervalCircle, { IntervalCircleHandler } from '@/components/IntervalCircle'
import useAllPositionInfo, { PositionTabValues } from '@/hooks/portfolio/useAllPositionInfo'
import { panelCard } from '@/theme/cssBlocks'
import { useEvent } from '@/hooks/useEvent'

export default function SectionMyPositions() {
  const { t } = useTranslation()
  const { query } = useRouter()
  const [refreshTag, setRefreshTag] = useState(Date.now())
  const circleRef = useRef<IntervalCircleHandler>(null)
  const tabs: {
    value: PositionTabValues
    label: string
  }[] = [
    {
      value: 'concentrated',
      label: t('portfolio.section_positions_tab_clmm')
    },
  ]
  const connected = useAppStore((s) => s.connected)
  const owner = useAppStore((s) => s.publicKey)

  const defaultTab = (query.tab as string) || tabs[0].value

  const [currentTab, setCurrentTab] = useStateWithUrl(defaultTab, 'position_tab', {
    fromUrl: (v) => v,
    toUrl: (v) => v
  })

  const noRewardClmmPos = useRef<Set<string>>(new Set())
  const setNoRewardClmmPos = useEvent((poolId: string, isDelete?: boolean) => {
    if (isDelete) {
      noRewardClmmPos.current.delete(poolId)
      return
    }
    noRewardClmmPos.current.add(poolId)
  })

  useEffect(
    () => () => {
      noRewardClmmPos.current.clear()
    },
    [owner?.toBase58()]
  )

  const {
    handleRefresh,
    clmmBalanceInfo,
    clmmLockInfo,
    isClmmLoading,
    rewardState,
  } = useAllPositionInfo({})

  const currentRewardState = rewardState[currentTab as PositionTabValues]

  const handleRefreshAll = useEvent(() => {
    handleRefresh()
    setRefreshTag(Date.now())
  })

  const handleClick = useEvent(() => {
    circleRef.current?.restart()
    handleRefreshAll()
  })

  return (
    <>
      <Grid
        gridTemplate={[
          `
          "title  tabs  " auto
          "action action" auto / 1fr 1fr
        `,
          //   `
          //   "title " auto
          //   "tabs  " auto
          //   "action" auto / 1fr
          // `,
          `
          "title title " auto
          "tabs  action" auto / 1fr 1fr
        `
        ]}
        columnGap={3}
        rowGap={[3, 2]}
        mb={3}
        mt={6}
        alignItems={'center'}
      >
        <GridItem area={'title'}>
          <Flex gap="2" alignItems="center">
            <Heading id="my-position" fontSize={['lg', 'xl']} fontWeight="500" color={colors.textPrimary}>
              {t('portfolio.section_positions')}
            </Heading>
            <IntervalCircle
              componentRef={circleRef}
              svgWidth={18}
              strokeWidth={2}
              trackStrokeColor={colors.secondary}
              trackStrokeOpacity={0.5}
              filledTrackStrokeColor={colors.secondary}
              onClick={handleClick}
              onEnd={handleRefreshAll}
            />
          </Flex>
        </GridItem>
      </Grid>
      {connected ? (
        <ClmmMyPositionTabContent
          isLoading={isClmmLoading}
          clmmBalanceInfo={clmmBalanceInfo}
          lockInfo={clmmLockInfo}
          setNoRewardClmmPos={setNoRewardClmmPos}
          refreshTag={refreshTag}
        />
      ) : (
        <SimpleGrid {...panelCard} placeItems={'center'} bg={colors.backgroundLight} borderRadius="12px" py={12}>
          <Text my={8} color={colors.textTertiary} fontSize={['sm', 'md']}>
            {t('wallet.connected_hint.portfolio_position')}
          </Text>
        </SimpleGrid>
      )}
    </>
  )
}
