import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import shallow from 'zustand/shallow'

export default function useComputer() {
  const [user, account, publicKey, raydium, getComputerInfo, getComputerAssets, getComputerAccount] = useAppStore(
    (s) => 
      [s.user, s.account, s.publicKey, s.raydium, s.getComputerInfo, s.getComputerAssets, s.getComputerAccount], 
      shallow
  )
  useEffect(() => {
    if (user && !account) {
      const id = window.setInterval(() => {
        getComputerAccount();
      }, 60 * 1000)
      return () => window.clearInterval(id)
    }

    getComputerInfo();
    getComputerAssets();
    const id = window.setInterval(() => {
      getComputerInfo();
      getComputerAssets();
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [user, account])

  useEffect(() => {
    if (!publicKey || !raydium) return;
    raydium.setOwner(publicKey)
  }, [publicKey])
}
