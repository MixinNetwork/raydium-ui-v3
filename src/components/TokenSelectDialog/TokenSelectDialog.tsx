import { useState, useCallback, forwardRef } from 'react'
import { TokenInfo } from '@raydium-io/raydium-sdk-v2'
import { useTranslation } from 'react-i18next'
import { useEvent } from '@/hooks/useEvent'
import ChevronLeftIcon from '@/icons/misc/ChevronLeftIcon'
import { colors } from '@/theme/cssVariables'
import { Box, Grid, GridItem, Heading, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay } from '@chakra-ui/react'
import TokenListSetting from './components/TokenListSetting'
import TokenList, { TokenListHandles } from './components/TokenList'
import TokenListUnknown from './components/TokenListUnknown'
import MixinTokenList from './components/MixinTokenList'
import FilteredMixinTokenList from './components/FilteredMixinTokenList'
import { UserAssetBalance, Token } from '@/store'

export interface TokenSelectDialogProps {
  onSelectValue: ((token: TokenInfo | Token) => void) | ((token: UserAssetBalance) => void)
  isOpen: boolean
  filterFn?: ((token: TokenInfo | Token) => boolean) | ((token: UserAssetBalance) => boolean) 
  onClose: () => void
  fromMixin?: boolean;
  fromMixinFilter?: boolean;
}

enum PageType {
  TokenList,
  TokenListSetting,
  TokenListUnknown,
  MixinTokenList,
  FilteredMixinTokenList,
}

export default forwardRef<TokenListHandles, TokenSelectDialogProps>(function TokenSelectDialog(
  { onSelectValue, isOpen, filterFn, onClose, fromMixin, fromMixinFilter },
  ref
) {
  const { t } = useTranslation()
  const init = fromMixin ? PageType.MixinTokenList : fromMixinFilter ? PageType.FilteredMixinTokenList : PageType.TokenList
  const [currentPage, setCurrentPage] = useState<PageType>(init)

  const renderModalContent = useCallback(() => {
    switch (currentPage) {
      case PageType.TokenList:
        return <TokenListContent />
      case PageType.TokenListSetting:
        return <TokenListSettingContent />
      case PageType.TokenListUnknown:
        return <TokenListUnknownContent />
      case PageType.MixinTokenList:
        return <MixinTokenListContent />
      case PageType.FilteredMixinTokenList:
        return <FilteredMixinTokenListContent />
      default:
        return null
    }
  }, [currentPage])

  const MixinTokenListContent = () => {
    const onSelect = onSelectValue as (token: UserAssetBalance) => void
    const filter = filterFn as (token: UserAssetBalance) => boolean
    return (
      <>
        <ModalHeader mx="8px">
          <Heading fontSize="xl" fontWeight={500} mb="24px">
            {t('common.select_a_token')}
          </Heading>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody display={'flex'} flexDirection={'column'} overflowX="hidden">
          <Box height={['auto', '60vh']} flex={['1', 'unset']}>
            <MixinTokenList
              ref={ref}
              onOpenTokenList={() => setCurrentPage(PageType.MixinTokenList)}
              onChooseToken={(token: UserAssetBalance) => {
                onSelect(token)
              }}
              isDialogOpen={isOpen}
              filterFn={filter}
            />
          </Box>
        </ModalBody>
      </>
    )
  }

  const FilteredMixinTokenListContent = () => {
    const onSelect = onSelectValue as (token: Token | TokenInfo) => void
    const filter = filterFn as (token: Token | TokenInfo) => boolean
    return (
      <>
        <ModalHeader mx="8px">
          <Heading fontSize="xl" fontWeight={500} mb="24px">
            {t('common.select_a_token')}
          </Heading>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody display={'flex'} flexDirection={'column'} overflowX="hidden">
          <Box height={['auto', '60vh']} flex={['1', 'unset']}>
            <FilteredMixinTokenList
              ref={ref}
              onOpenTokenList={() => setCurrentPage(PageType.FilteredMixinTokenList)}
              onChooseToken={(token: Token | TokenInfo) => {
                onSelect(token)
              }}
              isDialogOpen={isOpen}
              filterFn={filter}
            />
          </Box>
        </ModalBody>
      </>
    )
  }

  const TokenListContent = () => {
    const onSelect = onSelectValue as (token: TokenInfo) => void
    const filter = filterFn as (token: TokenInfo) => boolean
    return (
      <>
        <ModalHeader mx="8px">
          <Heading fontSize="xl" fontWeight={500} mb="24px">
            {t('common.select_a_token')}
          </Heading>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody display={'flex'} flexDirection={'column'} overflowX="hidden">
          <Box height={['auto', '60vh']} flex={['1', 'unset']}>
            <TokenList
              ref={ref}
              onOpenTokenList={() => setCurrentPage(PageType.TokenListSetting)}
              onChooseToken={(token) => {
                onSelect(token)
              }}
              isDialogOpen={isOpen}
              filterFn={filter}
            />
          </Box>
        </ModalBody>
      </>
    )
  }

  const TokenListSettingContent = () => (
    <>
      <ModalHeader mx="8px">
        <Grid templateColumns={'1fr 3fr 1fr'} mb="24px">
          <GridItem alignSelf="center" cursor="pointer" textAlign="left" onClick={() => setCurrentPage(PageType.TokenList)}>
            <ChevronLeftIcon width="24px" fontWeight={500} />
          </GridItem>
          <GridItem textAlign="center">
            <Heading fontSize="xl" fontWeight={500} color={colors.textPrimary}>
              {t('common.token_list_settings')}
            </Heading>
          </GridItem>
          <GridItem textAlign="right"></GridItem>
        </Grid>
      </ModalHeader>
      <ModalBody display={'flex'} flexDirection={'column'} overflowX="hidden">
        <Box height={['auto', '60vh']} flex={['1', 'unset']}>
          <TokenListSetting onClick={() => setCurrentPage(PageType.TokenListUnknown)} />
        </Box>
      </ModalBody>
    </>
  )

  const TokenListUnknownContent = () => (
    <>
      <ModalHeader mx="8px">
        <Grid templateColumns={'1fr 3fr 1fr'} mb="24px">
          <GridItem alignSelf="center" cursor="pointer" textAlign="left" onClick={() => setCurrentPage(PageType.TokenListSetting)}>
            <ChevronLeftIcon width="24px" fontWeight={500} />
          </GridItem>
          <GridItem textAlign="center">
            <Heading fontSize="xl" fontWeight={500} color={colors.textPrimary}>
              {t('swap.user_added_token_list')}
            </Heading>
          </GridItem>
          <GridItem textAlign="right"></GridItem>
        </Grid>
      </ModalHeader>
      <ModalBody display={'flex'} flexDirection={'column'} overflowX="hidden">
        <Box height={['auto', '60vh']} flex={['1', 'unset']}>
          <TokenListUnknown />
        </Box>
      </ModalBody>
    </>
  )

  const handleClose = useEvent(() => {
    onClose()
  })
  const onCloseComplete = useEvent(() => {
    setCurrentPage(init)
  })
  return (
    <Modal variant={'mobileFullPage'} isOpen={isOpen} onClose={handleClose} onCloseComplete={onCloseComplete}>
      <ModalOverlay />
      <ModalContent>{renderModalContent()}</ModalContent>
    </Modal>
  )
})
