import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import shallow from 'zustand/shallow'
import { useTokenStore } from '@/store'

export default function useComputer() {
  const [user, account, publicKey, raydium, getComputerInfo, getComputerAccount] = useAppStore(
    (s) => 
      [s.user, s.account, s.publicKey, s.raydium, s.getComputerInfo, s.getComputerAccount], 
      shallow
  )
  const getComputerAssets = useTokenStore(
    (s) => s.getComputerAssets
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
  }, [publicKey, raydium])
}
