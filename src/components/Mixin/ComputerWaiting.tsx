import { useEffect } from "react";
import { Box, Flex, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Skeleton, Text } from '@chakra-ui/react'


interface Props {
  isOpen: boolean; 
  onClose: () => void;

  type: 'deploy';
  title: string;
  description?: string;
  handleCompleted: () => void;
}

export default function ComputerWaiting(props: Props) {
  const { isOpen, handleCompleted } = props;
  useEffect(() => {
    if (!isOpen) return;
    handleCompleted();
    const id = setInterval(() => {
      handleCompleted();
    }, 5 * 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} size={"sm"}>
      <ModalOverlay />
      <ModalContent minW={['auto', '320px']} minH={"64px"}>
        <ModalCloseButton />
        <ModalBody>
          <Flex width={256} height={64} justify={"center"} alignItems={"center"}>
            {props.title}
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}