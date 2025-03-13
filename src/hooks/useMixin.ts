import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import shallow from 'zustand/shallow'

export default function useMixin() {
  const [user, computer_assets, updateBalances] = useAppStore(
    (s) => 
      [s.user, s.computer_assets, s.updateBalances], 
      shallow
  )
  useEffect(() => {
    if (!user) return;
    updateBalances(computer_assets);
    const id = window.setInterval(() => {
      updateBalances(computer_assets);
    }, 60 * 1000)
    return () => window.clearInterval(id)
  }, [user, computer_assets])
}
