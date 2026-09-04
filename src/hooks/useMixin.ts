import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import shallow from 'zustand/shallow'
import { useTokenStore } from '@/store'

export default function useMixin() {
  const [user, updateBalances] = useAppStore(
    (s) => 
      [s.user, s.updateBalances], 
      shallow
  )
  const computerAssets = useTokenStore((s) => s.computerAssets)

  useEffect(() => {
    if (!user) return;
    updateBalances(computerAssets);
    const id = window.setInterval(() => {
      updateBalances(computerAssets);
    }, 60 * 1000)
    return () => window.clearInterval(id)
  }, [user, computerAssets])
}
