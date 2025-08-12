import { Box, Flex, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next';
import QrCode from '../Qrcode';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { ComputerSystemCallRequest } from '@/types/computer';
import { toastSubject } from '@/hooks/toast/useGlobalToast';

interface MixinModalProps {
  requests: ComputerSystemCallRequest[];
  isOpen: boolean; 
  onClose: () => void;
}

export function MixinMultipleTracesModal(props: MixinModalProps) {
  const { t } = useTranslation()
  const { getMixinClient } = useAppStore.getState()
  const client = getMixinClient();
  console.log(props.requests)
  
  const [index, setIndex] = useState(0);
  const [ordinal, setOrdinal] = useState('');

  const getOrdinal = (n :number) => {
    const v = n % 10;
    if (v === 1) return `${n}-st`;
    else if (v === 2) return `${n}-nd`;
    else if (v === 3) return `${n}-rd`;
    else return `${n}-th`;
  };
  useEffect(() => {
    setOrdinal(getOrdinal(index+1))
    const timer = setInterval(async () => {
      const trace = props.requests[index].trace;
      try {
        const tx = await client.utxo.fetchTransaction(trace);
        if (tx.state !== 'spent') return;
        if (index === props.requests.length - 1) {
          clearInterval(timer);
          props.onClose();
          toastSubject.next({
            status: 'success',
            title: t('transaction.transaction_processing'),
            isClosable: true,
            duration: null
          });
        } else setIndex((i) => i + 1);
      } catch(e) {}
    }, 1000 * 5);
    return () => clearInterval(timer);
  }, [index])

  
  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} size={'sm'}>
      <ModalOverlay />
      <ModalContent minW={['auto', '320px']}>
        <ModalBody>
          <Flex direction={"column"} alignItems={"center"}>        
            <Box width={256} height={256} borderRadius={"xl"} overflow={"hidden"}>
                <QrCode value={props.requests[index].value}/>
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