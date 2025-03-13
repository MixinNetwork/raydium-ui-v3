import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, HStack, Text, VStack } from '@chakra-ui/react'
import { ApiV3PoolInfoConcentratedItem } from '@raydium-io/raydium-sdk-v2'

import { useTranslation } from 'react-i18next'
import TokenAvatar from '@/components/TokenAvatar'
import CLMMTokenInputGroup, { InputSide } from '@/features/Clmm/components/TokenInputGroup'
import { useAppStore, useClmmStore, UserAssetBalance, useTokenAccountStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { debounce } from '@/utils/functionMethods'
import toPercentString from '@/utils/numberish/toPercentString'
import { formatCurrency, formatToRawLocaleStr } from '@/utils/numberish/formatter'
import { getMintSymbol, wSolToSol, wsolToSolToken } from '@/utils/token'
import useTokenPrice from '@/hooks/token/useTokenPrice'
import { calRatio } from '@/features/Clmm/utils/math'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { trimTrailZero } from '@/utils/numberish/formatter'
import { TickData } from './type'
import { SOL_ASSET_ID, WSOL_PUBLICKEY } from '@/utils/constant'
interface Props extends Required<TickData> {
  baseIn: boolean
  tempCreatedPool: ApiV3PoolInfoConcentratedItem
  onConfirm: (props: { inputA: boolean; amount1: string; amount2: string; liquidity: BN }) => void
}

export default function TokenAmountPairInputs({ tempCreatedPool, baseIn, onConfirm, ...tickData }: Props) {
  const computePairAmount = useClmmStore((s) => s.computePairAmount)
  const { t } = useTranslation()
  const [tokenAmount, setTokenAmount] = useState(['', ''])
  const [tokenVolume, setTokenVolume] = useState([new Decimal(0), new Decimal(0)])
  const focusPoolARef = useRef(true)
  const computeRef = useRef(false)
  const computeDataRef = useRef<Awaited<ReturnType<typeof computePairAmount>> | undefined>(undefined)

  const balances = useAppStore((s) => s.balances);
  const [balance, setBalance] = useState<{
    token1?: UserAssetBalance;
    token2?: UserAssetBalance;
  }>({})
  useEffect(() => {
    const checkSelectedAsset = (b: UserAssetBalance, address: string) => {
      if (b.asset?.asset_id === SOL_ASSET_ID && address === WSOL_PUBLICKEY) return true
      if (b?.address === address) return true;
      if (b.asset?.asset_key === address) return true;
      return false;
    }
    const bs: {
      token1?: UserAssetBalance;
      token2?: UserAssetBalance;
    } = {}
    Object.values(balances).forEach((b) => {
      if (checkSelectedAsset(b, tempCreatedPool.mintA.address)) bs.token1 = b
      if (checkSelectedAsset(b, tempCreatedPool.mintB.address)) bs.token2 = b
    })
    setBalance(bs);

    const tokenA = baseIn ? bs.token1 : bs.token2;
    const tokenB = baseIn ? bs.token2 : bs.token1;
    const b1 = new Decimal(tokenAmount[0] || 0).mul(tokenA?.asset?.price_usd || 0)
    const b2 = new Decimal(tokenAmount[1] || 0).mul(tokenB?.asset?.price_usd || 0)
    setTokenVolume([b1, b2])
  }, [balances, tokenAmount]);
  
  const [mintA, mintB] = [tempCreatedPool![baseIn ? 'mintA' : 'mintB'], tempCreatedPool![baseIn ? 'mintB' : 'mintA']]
  const [priceLower, priceUpper] = baseIn
    ? [tickData.priceLower, tickData.priceUpper]
    : [new Decimal(1).div(tickData.priceUpper).toString(), new Decimal(1).div(tickData.priceLower).toString()]

  const disabledInput = tempCreatedPool
    ? [new Decimal(tempCreatedPool.price || 0).gt(priceUpper || 0), new Decimal(tempCreatedPool.price || 0).lt(priceLower || 0)]
    : [false, false]
  if (!baseIn) disabledInput.reverse()

  const debounceCompute = useCallback(
    debounce((props: Parameters<typeof computePairAmount>[0]) => {
      computePairAmount(props).then((res) => {
        computeRef.current = !!res
        computeDataRef.current = res
        if (res) {
          setTokenAmount((preValue) => {
            if (baseIn)
              return focusPoolARef.current
                ? [preValue[0], props.amount ? trimTrailZero(res.amountSlippageB.toFixed(mintB.decimals))! : '']
                : [props.amount ? trimTrailZero(res.amountSlippageA.toFixed(mintA.decimals))! : '', preValue[1]]
            return focusPoolARef.current
              ? [props.amount ? trimTrailZero(res.amountSlippageB.toFixed(mintB.decimals))! : '', preValue[1]]
              : [preValue[0], props.amount ? trimTrailZero(res.amountSlippageA.toFixed(mintA.decimals))! : '']
          })
        }
      })
    }, 100),
    [baseIn, mintA.decimals, mintB.decimals]
  )

  useEffect(() => {
    if (!tempCreatedPool.id) return
    if (computeRef.current) {
      computeRef.current = false
      return
    }
    const amount = (focusPoolARef.current && baseIn) || (!focusPoolARef.current && !baseIn) ? tokenAmount[0] : tokenAmount[1]

    debounceCompute({
      ...tickData,
      pool: tempCreatedPool,
      inputA: focusPoolARef.current,
      amount
    })
  }, [tempCreatedPool, baseIn, tokenAmount, debounceCompute, tickData])

  const handleAmountChange = useCallback(
    (val: string, side: string) => setTokenAmount((prevVal) => (side === InputSide.TokenA ? [val, prevVal[1]] : [prevVal[0], val])),
    []
  )
  const handleFocusChange = useCallback(
    (mint?: string) => (focusPoolARef.current = wSolToSol(mint) === wSolToSol(tempCreatedPool.mintA.address)),
    [tempCreatedPool.mintA.address]
  )

  let error = undefined
  function checkError() {
    if (!balance.token1 || !balance.token2 || !balance.token1.asset || !balance.token2.asset) return undefined;
    const b1 = new Decimal(balance.token1.total_amount)
    const b2 = new Decimal(balance.token2.total_amount)
    const balanceA = baseIn ? b1 : b2;
    const balanceB = baseIn ? b2 : b1;
  
    if (!disabledInput[0]) {
      if (!tokenAmount[0] || new Decimal(tokenAmount[0] || 0).isZero()) return { key: 'error.enter_token_amount' }
      if (new Decimal(tokenAmount[0]).gt(balanceA))
        return { key: 'error.insufficient_sub_balance', props: { token: getMintSymbol({ mint: mintA, transformSol: true }) } }
    }
    if (!disabledInput[1] || new Decimal(tokenAmount[1] || 0).isZero()) {
      if (!tokenAmount[1]) return { key: 'error.enter_token_amount' }
      if (new Decimal(tokenAmount[1]).gt(balanceB))
        return { key: 'error.insufficient_sub_balance', props: { token: getMintSymbol({ mint: mintB, transformSol: true }) } }
    }
    return undefined
  }
  error = checkError()

  const totalVolume = tokenVolume[0].add(tokenVolume[1])
  const { ratioA, ratioB } = calRatio({
    price: baseIn ? tempCreatedPool.price : 1 / tempCreatedPool.price,
    amountA: tokenAmount[0],
    amountB: tokenAmount[1]
  })
  return (
    <>
      <CLMMTokenInputGroup
        pool={tempCreatedPool}
        baseIn={baseIn}
        tokenAmount={tokenAmount}
        tokenBalance={balance}
        disableSelectToken
        onAmountChange={handleAmountChange}
        onFocusChange={handleFocusChange}
        token1Disable={disabledInput[0]}
        token2Disable={disabledInput[1]}
        solReserveAmount={0.5}
      />
      <VStack
        mt={4}
        align="stretch"
        bg={colors.backgroundTransparent07}
        rounded={'xl'}
        border={`1px solid ${colors.backgroundTransparent10}`}
        color={colors.textPrimary}
        p={3}
        gap={1}
      >
        <HStack justify={'space-between'}>
          <Text color={colors.textSecondary} fontSize="sm">
            {t('clmm.total_deposit')}
          </Text>
          <Text fontSize={['md', 'xl']} fontWeight="500">
            {formatCurrency(totalVolume.toString(), { symbol: '$', decimalPlaces: 2 })}
          </Text>
        </HStack>

        <HStack justify={'space-between'}>
          <Text color={colors.textSecondary} fontSize="sm">
            {t('clmm.deposit_ratio')}
          </Text>
          <HStack fontWeight="500">
            <TokenAvatar token={wsolToSolToken(tempCreatedPool![baseIn ? 'mintA' : 'mintB'])} size="sm" />
            <Text>{formatToRawLocaleStr(toPercentString(ratioA, { decimals: 1 }))}</Text>
            <Text>/</Text>
            <TokenAvatar token={wsolToSolToken(tempCreatedPool![baseIn ? 'mintB' : 'mintA'])} size="sm" />
            <Text>{formatToRawLocaleStr(toPercentString(ratioB, { decimals: 1 }))}</Text>
          </HStack>
        </HStack>
      </VStack>
      <Button
        mt="4"
        isDisabled={!!error}
        onClick={() => {
          onConfirm({
            inputA: focusPoolARef.current,
            amount1: tokenAmount[baseIn ? 0 : 1],
            amount2: tokenAmount[baseIn ? 1 : 0],
            liquidity: computeDataRef.current!.liquidity
          })
        }}
      >
        {error ? t(error.key, error.props || {}) : t('liquidity.preview_pool')}
      </Button>
    </>
  )
}
