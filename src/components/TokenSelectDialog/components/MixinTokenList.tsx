import { ChangeEvent, useCallback, useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { PublicKey } from '@solana/web3.js'
import { useEvent } from '@/hooks/useEvent'
import SearchIcon from '@/icons/misc/SearchIcon'
import { useAppStore } from '@/store'
import { colors } from '@/theme/cssVariables'
import { sortItems } from '@/utils/sortItems'
import { filterMixinTokenFn } from '@/utils/token'
import { Box, Divider, Flex, Heading, Input, InputGroup, InputRightAddon, Text } from '@chakra-ui/react'
import List, { ListPropController } from '@/components/List'
import AddressChip from '@/components/AddressChip'
import TokenAvatar from '@/components/TokenAvatar'
import { formatToRawLocaleStr } from '@/utils/numberish/formatter'
import { mul } from '@/utils/number'
import { UserAssetBalance } from '@/types/computer'

const perPage = 30

const USDCMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOLMint = PublicKey.default.toString()
const RAYMint = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'
const USDTMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

export interface TokenListHandles {
  resetSearch: () => void
}

export default forwardRef<
  TokenListHandles,
  {
    onOpenTokenList: () => void
    isDialogOpen: boolean
    onChooseToken: (token: UserAssetBalance) => void
    filterFn?: (token: UserAssetBalance) => boolean
  }
>(function MixinTokenList({ onOpenTokenList, isDialogOpen: isOpen, onChooseToken }, ref) {
  const { t } = useTranslation()
  const tokenAccountMap = useAppStore((s) => s.balances);

  const [filteredList, setFilteredList] = useState<UserAssetBalance[]>(Object.values(tokenAccountMap))
  const [displayList, setDisplayList] = useState<UserAssetBalance[]>([])
  const [search, setSearch] = useState('')
  const listControllerRef = useRef<ListPropController>()

  useEffect(() => {
    listControllerRef.current?.resetRenderCount()
  }, [filteredList.length])

  useEffect(() => {
    const compareFn = (itemA: UserAssetBalance, itemB: UserAssetBalance) => {
      const accountA = tokenAccountMap[itemA.asset_id]
      const accountB = tokenAccountMap[itemB.asset_id]
      const usdA = accountA?.asset ? mul(accountA.total_amount, accountA.asset.price_usd) : undefined
      const usdB = accountB?.asset ? mul(accountB.total_amount, accountB.asset.price_usd) : undefined

      let flag
      if (!usdA && !usdB) flag = 0
      else if (!usdA) flag = -1
      else if (!usdB) flag = 1
      else flag = usdA.isGreaterThan(usdB) ? 1 : usdA.isEqualTo(usdB) ? 0 : -1;
      return -flag;
    }
    const sortedTokenList = Object.values(tokenAccountMap).sort((a, b) => compareFn(a, b))
    const filteredList = search ? filterMixinTokenFn(sortedTokenList, { searchStr: search }) : sortedTokenList
    setDisplayList(filteredList)
    setFilteredList(filteredList)
  }, [search, tokenAccountMap])

  useEffect(() => {
    setSearch('')
  }, [isOpen])

  const handleSearchChange = useEvent((e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.currentTarget.value)
  })

  const renderTokenItem = useCallback(
    (token: UserAssetBalance) => (
      <MixinTokenRowItem
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
        <Box overflowY={'auto'} mx="-12px">
          <List preventResetOnChange items={displayList} getItemKey={(token: UserAssetBalance) => token.asset_id}>
            {renderTokenItem}
          </List>
        </Box>
      </Flex>
    </Flex>
  )
})

function MixinTokenRowItem({
  token,
  onClick,
}: {
  token: UserAssetBalance
  onClick: (token: UserAssetBalance) => void
}) {
  const { t } = useTranslation()

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
          <TokenAvatar icon={token.asset?.icon_url} mr="2" />
          <Box w="100%" minW="0" overflow="hidden">
            <Box display="flex" gap={2} alignItems="center">
              <Text color={colors.textSecondary} mt="0.5">
                {token.asset?.symbol}
              </Text>
            </Box>
            <Text color={colors.textTertiary} isTruncated fontSize="xs">
              {token.asset?.name}
            </Text>
          </Box>
        </Flex>
        <Box flexShrink={0}>
          <Box color={colors.textSecondary} textAlign="right">
            {formatToRawLocaleStr(token.total_amount)}
            {
              token.address && 
              <AddressChip
                onClick={(ev) => ev.stopPropagation()}
                color={colors.textTertiary}
                canExternalLink
                fontSize="xs"
                address={token.address}
              />
            }
          </Box>
        </Box>
      </Flex>
      {/* <Grid
        gridTemplate={`
          "avatar symbol" auto
          "avatar name  " auto / auto 1fr
        `}
        columnGap={[1, 2]}
        alignItems="center"
        cursor="pointer"
      >
        <GridItem gridArea="avatar">
          <TokenAvatar token={token} />
        </GridItem>
        <GridItem gridArea="symbol">
          <Text color={colors.textSecondary}>{token.symbol}</Text>
        </GridItem>
        <GridItem gridArea="name">
          <Text
            color={colors.textTertiary}
            maxWidth={'90%'} // handle token is too long
            overflow={'hidden'}
            whiteSpace={'nowrap'}
            textOverflow={'ellipsis'}
            fontSize="xs"
          >
            {token.name}
          </Text>
        </GridItem>
      </Grid>

      <Grid
        gridTemplate={`
          "balance" auto
          "address" auto / auto 
        `}
        columnGap={[2, 4]}
        alignItems="center"
      >
        <GridItem gridArea="balance">
          <Text color={colors.textSecondary} textAlign="right">
            {balance()}
          </Text>
        </GridItem>
        <GridItem gridArea="address">
          <AddressChip
            onClick={(ev) => ev.stopPropagation()}
            color={colors.textTertiary}
            canExternalLink
            fontSize="xs"
            address={token.address}
          />
        </GridItem>
      </Grid> */}
    </Flex>
  )
}
