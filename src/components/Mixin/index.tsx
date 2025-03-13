import { Avatar, Box, Button, Flex, HStack, Text } from '@chakra-ui/react'
import { useCallback, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { useTranslation } from 'react-i18next';
import { MixinLoginModal } from './MixinLoginModal';

export default function MixinWallet() {
  const { t } = useTranslation()
  
  const {user} = useAppStore((s) => ({
    user: s.user,
  }));

  const [show, setShow] = useState(false);
  const handleOpen = useCallback(() => setShow(true), [setShow])
  const handleClose = useCallback(() => setShow(false), [setShow])

  return (
    <Box>
      {
        user ? (
          <Flex>
            <HStack columnGap={3}>
              <Avatar src={user.avatar_url} size={"sm"}/>
              <Text>{ user.full_name }</Text>
            </HStack>
          </Flex>
        ) : ( 
          <Button onClick={handleOpen} width={"100%"}>
            {t('button.connect_wallet')}
          </Button>
        )
      }
      <MixinLoginModal isOpen={show} onClose={handleClose}/>
    </Box>
  )
}