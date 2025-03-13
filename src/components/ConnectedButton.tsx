import { useAppStore } from '@/store'
import { Button, Box, ButtonProps } from '@chakra-ui/react'
import { LegacyRef, PropsWithChildren, forwardRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toastSubject } from '@/hooks/toast/useGlobalToast'
import { handleComputerRegisterSchema } from '@/utils/mixin'
import MixinWallet from './Mixin'
import { MixinModal } from './Mixin/MixinModal'

type Props = PropsWithChildren<ButtonProps>

export default forwardRef(function ConnectedButton({ children, onClick, isDisabled, ...props }: Props, ref: LegacyRef<HTMLButtonElement>) {
  const { t } = useTranslation()
  const {info, user, account, getUserMix, getComputerAccount} = useAppStore((s) => ({
    info: s.info,
    user: s.user,
    account: s.account,
    getUserMix: s.getUserMix,
    getComputerAccount: s.getComputerAccount,
  }))
  
  const [schema, setSchema] = useState('');
  const [show, setShow] = useState(false);
  const handleShow = useCallback(() => setShow(true), [setShow])
  const handleClose = useCallback(() => setShow(false), [setShow])

  useEffect(() => {
    if (!schema) return;
    if (account) {
      handleClose();
      setSchema('');
      toastSubject.next({
        description: t("computer.register_success"),
        status: 'success'
      })
      return;
    }
    const id = window.setInterval(() => {
      getComputerAccount();
    }, 5 * 1000)
    return () => window.clearInterval(id)
  }, [schema, account])

  const handleRegister = () => {
    const mix = getUserMix();
    if (!mix || !info) return;
    if (account) {
      toastSubject.next({
        description: t("computer.registered"),
        status: 'info'
      })
      return;
    }
    const url = handleComputerRegisterSchema(info, mix);
    setSchema(url);
    handleShow()
  }

  return (
    <Box>
      {
        !user 
          ? <MixinWallet />
          : <Button
            ref={account ? ref : undefined}
            {...props}
            isDisabled={account ? isDisabled : false}
            onClick={account ? onClick : handleRegister}
            width={"100%"}
          >
            {
              account 
                ? children 
                : t('button.register')
            }
          </Button>
      }
      <MixinModal title={t("computer.login")} isOpen={show} onClose={handleClose} data={schema}/>
    </Box>
  )
})
