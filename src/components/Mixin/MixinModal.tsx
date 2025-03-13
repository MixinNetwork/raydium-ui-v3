import { Box, Flex, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Skeleton, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next';
import QrCode from '../Qrcode';

interface MixinModalProps {
  title: string;
  data?: string;
  isOpen: boolean; 
  onClose: () => void;
}

export function MixinModal(props: MixinModalProps) {
  const { t } = useTranslation()
  
  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} size={'sm'}>
      <ModalOverlay />
      <ModalContent minW={['auto', '320px']}>
        <ModalHeader display="none">{ props.title }</ModalHeader>
        <ModalBody>
          <Flex direction={"column"} alignItems={"center"}>
            <Box width={256} height={256} borderRadius={"xl"} overflow={"hidden"}>
                {
                  props.data 
                    ? <QrCode value={props.data}/>
                    : <Skeleton borderRadius="8px" width={"100%"} height={"100%"} />
                }
            </Box>
            <Text mt={4} align={"center"}>
              {t("computer.scan")}
            </Text>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}