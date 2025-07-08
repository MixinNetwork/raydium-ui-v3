import { HStack, Text, useDisclosure } from '@chakra-ui/react'
import { OwnerFullData } from '@/hooks/portfolio/useFetchOwnerIdo'
import { useAppStore } from '@/store'
import { AlertChip } from '../../components/AlertChip'
import { useTranslation } from 'react-i18next'
import { colors } from '@/theme/cssVariables'
import { useEffect } from 'react'

export function AcceleraytorAlertChip() {
  const { t } = useTranslation()
  const publicKey = useAppStore((s) => s.publicKey)
  const formattedData: OwnerFullData[] = [];
  // const idoInfo = useFetchOwnerIdo({
  //   owner: publicKey?.toString()
  // })
  const { isOpen, onClose, onOpen } = useDisclosure({ defaultIsOpen: formattedData.length > 0 })
  useEffect(() => {
    if (formattedData.length > 0) {
      onOpen()
    } else {
      onClose()
    }
  }, [formattedData])
  return (
    <AlertChip
      isOpen={isOpen}
      onClose={onClose}
      alertContent={
        <HStack>
          <Text>{t('portfolio.acceleraytor_banner_desc')}</Text>
          <Text color={colors.textLink} cursor={'pointer'} onClick={() => scrollToHeading('acceleraytor')}>
            {t('common.route_go')}
          </Text>
        </HStack>
      }
    />
  )
}

/**
 * DOM utils
 */
function scrollToHeading(id: string) {
  const element = document.getElementById(id)
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
