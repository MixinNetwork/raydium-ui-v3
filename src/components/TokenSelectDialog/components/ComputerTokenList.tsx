import { ChangeEvent, useCallback, useEffect, useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react'
import { SOLMint, TokenInfo } from '@raydium-io/raydium-sdk-v2'
import { useTranslation } from 'react-i18next'
import { useEvent } from '@/hooks/useEvent'
import SearchIcon from '@/icons/misc/SearchIcon'
import { useAppStore, useTokenAccountStore, useTokenStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { filterFilteredMixinTokenFn } from '@/utils/token'
import { Box, Divider, Flex, Heading, Input, InputGroup, InputRightAddon, Text } from '@chakra-ui/react'
import Decimal from 'decimal.js'
import List, { ListPropController } from '@/components/List'
import AddressChip from '@/components/AddressChip'
import TokenAvatar from '@/components/TokenAvatar'
import Button from '@/components/Button'
import useTokenInfo from '@/hooks/token/useTokenInfo'
import { isValidPublicKey } from '@/utils/publicKey'
import { formatToRawLocaleStr } from '@/utils/numberish/formatter'
import useTokenPrice, { TokenPrice } from '@/hooks/token/useTokenPrice'
import { SOL_ASSET_ID } from '@/utils/constant'
import { Token } from '@/types/computer'

const perPage = 30

export interface TokenListHandles {
  resetSearch: () => void
}

export default forwardRef<
  TokenListHandles,
  {
    onOpenTokenList: () => void
    isDialogOpen: boolean
    onChooseToken: (token: TokenInfo | Token) => void
    filterFn?: (token: TokenInfo | Token) => boolean
  }
>(function TokenList({ onOpenTokenList, isDialogOpen: isOpen, onChooseToken, filterFn }, ref) {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user);
  const mixinTokenAccountMap = useAppStore((s) => s.balanceAddressMap);
  const computerAssetAddressMap = useTokenStore((s) => s.computerAssetAddressMap)
  const tokenList = useTokenStore((s) => s.displayTokenList)
  const orgTokenMap = useTokenStore((s) => s.tokenMap)
  const setExtraTokenListAct = useTokenStore((s) => s.setExtraTokenListAct)
  const [tokenAccountMap, tokenAccounts] = useTokenAccountStore((s) => [
    s.tokenAccountMap,
    s.tokenAccounts
  ])
  const [tokenPrice, setTokenPrice] = useState<Record<string, TokenPrice>>({})

  const fetchPriceList = useMemo(() => tokenAccounts.filter((a) => !a.amount.isZero()).map((a) => a.mint.toBase58()), [tokenAccounts])
  const { data } = useTokenPrice({
    mintList: fetchPriceList,
    refreshInterval: 1000 * 60 * 10
  })

  useEffect(() => {
    if (fetchPriceList.some((m) => !data[m])) return
    setTokenPrice(data)
  }, [data, fetchPriceList])

  const [filteredList, setFilteredList] = useState<Token[]>([])
  const [displayList, setDisplayList] = useState<Token[]>([])
  const [search, setSearch] = useState('')
  const customTokenInfo = useRef<{ name?: string; symbol?: string }>({})
  const listControllerRef = useRef<ListPropController>()

  useEffect(() => {
    listControllerRef.current?.resetRenderCount()
  }, [filteredList.length])

  useEffect(() => {
    const compareFn = (itemA: TokenInfo, itemB: TokenInfo) => {
      const ta = mixinTokenAccountMap[itemA.address];
      const tb = mixinTokenAccountMap[itemB.address];
      const amountA = new Decimal(ta ? ta.total_amount : 0);
      const amountB = new Decimal(tb ? tb.total_amount : 0);
      const priceA = new Decimal(ta ? ta.asset.price_usd : 0);
      const priceB = new Decimal(tb ? tb.asset.price_usd : 0);
      const usdA = amountA.mul(priceA || 0);
      const usdB = amountB.mul(priceB || 0);

      if (usdB.gt(usdA)) return 1
      if (usdB.eq(usdA)) {
        if (amountB.gt(amountA)) return 1
        if (amountB.eq(amountA)) return 0
      }
      return -1
    }
    const list = user 
      ? Object.values(mixinTokenAccountMap).reduce((prev, balance) => {
        if (
          balance?.hide ||
          !balance.address || 
          (balance.asset.chain_id !== SOL_ASSET_ID && !computerAssetAddressMap[balance.address])
        ) return prev;
        const uri = balance.asset.chain_id !== SOL_ASSET_ID 
          ? computerAssetAddressMap[balance.address].uri 
          : balance.asset.icon_url;
        const decimals = balance.asset.chain_id === SOL_ASSET_ID ? balance.asset.precision : 8;
        prev.push({
          address: balance.address,
          chainId: 101,
          decimals,
          extensions: {},
          logoURI: uri,
          name: balance.asset.name,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          symbol: balance.asset.symbol,
          tags: [],
          priority: 90,
        })
        return prev;
      }, [] as TokenInfo[])
      : [...Object.values(computerAssetAddressMap), {
          asset_id: SOL_ASSET_ID,
          chain_id: SOL_ASSET_ID,
          name: "Solana",
          symbol: "SOL",
          address: SOLMint.toString(),
          decimals: 9,
          uri: "https://images.mixin.one/eTzm8_cWke8NqJ3zbQcx7RkvbcTytD_NgBpdwIAgKJRpOoo0S0AQ3IQ-YeBJgUKmpsMPUHcZFzfuWowv3801cF5HXfya5MQ9fTA9HQ=s128",
          price_usd: '0',
      }].map(a => {
        return {
          address: a.address,
          chainId: 101,
          decimals: a.decimals,
          extensions: {},
          logoURI: a.uri,
          name: a.name,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          symbol: a.symbol,
          tags: [],
          priority: 90,
        }
      })
    const sortedTokenList = list
      .sort((a, b) => compareFn(a, b))
      .map(info => {
        const balance = mixinTokenAccountMap[info.address];
        return {
          info,
          balance
        }
      }) as Token[]
    const filteredList = search ? filterFilteredMixinTokenFn(sortedTokenList, { searchStr: search }) : sortedTokenList
    setDisplayList(filteredList)
    setFilteredList(filteredList)
  }, [user, search, tokenList, tokenAccountMap, orgTokenMap, tokenPrice, mixinTokenAccountMap, computerAssetAddressMap])

  const tempSetNewToken = orgTokenMap.get(search)
  const { tokenInfo: newToken } = useTokenInfo({
    mint:
      search && (!filteredList.length || (tempSetNewToken?.type === 'unknown' && !tempSetNewToken?.userAdded)) && isValidPublicKey(search)
        ? search
        : undefined
  })
  const isUnknownNewToken = newToken?.type === 'unknown'

  useEffect(() => {
    customTokenInfo.current = {}
    if (!newToken) return
    setExtraTokenListAct({ token: newToken, addToStorage: newToken.type === 'raydium' || newToken.type === 'jupiter' })
  }, [newToken, setExtraTokenListAct])

  const showMoreData = useEvent(() => {
    setDisplayList((list) => list.concat(filteredList.slice(list.length, list.length + perPage)))
  })

  useEffect(() => {
    setSearch('')
  }, [isOpen])

  const handleSearchChange = useEvent((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.currentTarget.value)
  })

  const handleAddUnknownTokenClick = useCallback((token: TokenInfo) => {
    setExtraTokenListAct({ token: { ...token, userAdded: true }, addToStorage: true, update: true })
  }, [])

  const renderTokenItem = useCallback(
    (token: Token) => (
      <FilteredMixinTokenRowItem
        token={token}
        onClick={(token) => onChooseToken(token)}
      />
    ),
    []
  )
  useImperativeHandle(ref, () => ({
    resetSearch: () => {
      setSearch('')
    }
  }))
  return (
    <Flex direction="column" height="100%" mx="8px">
      <InputGroup bg={colors.backgroundDark} color={colors.textSecondary} rounded="8px">
        <Input
          p="8px 16px"
          variant="unstyled"
          _placeholder={{
            fontSize: '14px',
            color: colors.textTertiary
          }}
          placeholder={t('token_selector.search_placeholder') ?? undefined}
          value={search}
          onChange={handleSearchChange}
        />
        <InputRightAddon bg="transparent">
          <SearchIcon />
        </InputRightAddon>
      </InputGroup>

      <Divider my="10px" color={colors.backgroundTransparent12} />

      <Flex direction="column" flexGrow={1} css={{ contain: 'size' }}>
        <Flex justifyContent="space-between" py="10px">
          <Heading fontSize="xs" fontWeight={500} color={colors.textTertiary}>
            {t('common.token')}
          </Heading>
          <Heading fontSize="xs" fontWeight={500} color={colors.textTertiary}>
            {t('common.balance')}/{t('common.address')}
          </Heading>
        </Flex>
        {isUnknownNewToken ? (
          <Box padding={4} gap={4} flexDirection="column" display="flex">
            <Flex alignItems="center">
              <Text flex="1">Symbol:</Text>
              <InputGroup flex="3" bg={colors.backgroundDark} color={colors.textSecondary} rounded="8px">
                <Input
                  p="8px 16px"
                  variant="unstyled"
                  _placeholder={{
                    fontSize: '14px',
                    color: colors.textTertiary
                  }}
                  placeholder={t('token_selector.input_token_symbol') ?? undefined}
                  defaultValue={`${newToken?.symbol}`}
                  onChange={(e) => {
                    customTokenInfo.current.symbol = e.currentTarget.value
                  }}
                />
              </InputGroup>
            </Flex>
            <Flex alignItems="center">
              <Text flex="1">Name:</Text>
              <InputGroup flex="3" bg={colors.backgroundDark} color={colors.textSecondary} rounded="8px">
                <Input
                  p="8px 16px"
                  variant="unstyled"
                  _placeholder={{
                    fontSize: '14px',
                    color: colors.textTertiary
                  }}
                  placeholder={t('token_selector.input_token_name') ?? undefined}
                  defaultValue={newToken?.name}
                  onChange={(e) => {
                    customTokenInfo.current.name = e.currentTarget.value
                  }}
                />
              </InputGroup>
            </Flex>
            <Button
              variant="solid-dark"
              width="full"
              bg={colors.backgroundDark}
              onClick={() => {
                handleAddUnknownTokenClick({
                  ...newToken,
                  ...customTokenInfo.current
                })
                customTokenInfo.current = {}
              }}
            >
              {t('token_selector.add_user_token')}
            </Button>
          </Box>
        ) : (
          <Box overflowY={'auto'} mx="-12px">
            <List onLoadMore={showMoreData} preventResetOnChange renderAllAtOnce items={displayList} getItemKey={(token) => token.info.address}>
              {renderTokenItem}
            </List>
          </Box>
        )}
      </Flex>
      {!isUnknownNewToken ? (
        <Box borderRadius={'8px'} background={colors.modalContainerBg} p="12px" mb="24px">
          <Text opacity={'50%'} fontWeight={'normal'} fontSize={'12px'} lineHeight={'16px'} color={colors.textSecondary}>
            {t('token_selector.token_not_found')}
          </Text>
        </Box>
      ) : null}

      <Button variant="solid-dark" width="full" bg={colors.backgroundDark} onClick={() => onOpenTokenList()}>
        {t('common.view_token_list')}
      </Button>
    </Flex>
  )
})

function FilteredMixinTokenRowItem({
  token,
  onClick,
}: {
  token: Token
  onClick: (token: Token) => void
}) {
  return (
    <Flex
      justifyContent={'space-between'}
      alignItems="center"
      _hover={{
        bg: colors.backgroundDark50
      }}
      rounded="md"
      py="12px"
      px="12px"
      maxW={'100%'}
      overflow={'hidden'}
      onClick={() => onClick?.(token)}
    >
      <Flex w="full" justifyContent={'space-between'} _hover={{ '.addRemoveCtrlContent': { display: 'flex' } }}>
        <Flex w="0" flexGrow={1} minW="0">
          <TokenAvatar icon={token.info.logoURI} mr="2" />
          <Box w="100%" minW="0" overflow="hidden">
            <Box display="flex" gap={2} alignItems="center">
              <Text color={colors.textSecondary} mt="0.5">
                {token.info.symbol}
              </Text>
            </Box>
            <Text color={colors.textTertiary} isTruncated fontSize="xs">
              {token.info.name}
            </Text>
          </Box>
        </Flex>
        <Box flexShrink={0}>
          <Box color={colors.textSecondary} textAlign="right">
            {token.balance ? formatToRawLocaleStr(token.balance.total_amount) : '0'}
            <AddressChip
              onClick={(ev) => ev.stopPropagation()}
              color={colors.textTertiary}
              canExternalLink
              fontSize="xs"
              address={token.info.address}
            />
          </Box>
        </Box>
      </Flex>
    </Flex>
  )
}
