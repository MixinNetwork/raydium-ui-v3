import { FC, PropsWithChildren, useEffect } from 'react'
import React, { useState } from 'react'

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { useAppStore, defaultNetWork, defaultEndpoint } from '../store/useAppStore'

import { type Adapter, type WalletError } from '@solana/wallet-adapter-base'
import { sendWalletEvent } from '@/api/event'
import { useEvent } from '@/hooks/useEvent'

const reportWalletError = (wallet: string, error: unknown) => {
  console.warn(`[WalletProvider] Failed to initialize ${wallet}`, error)
}

const App: FC<PropsWithChildren<any>> = ({ children }) => {
  const [network] = useState<WalletAdapterNetwork>(defaultNetWork)
  const [wallets, setWallets] = useState<Adapter[]>([])
  const rpcNodeUrl = useAppStore((s) => s.rpcNodeUrl)
  const wsNodeUrl = useAppStore((s) => s.wsNodeUrl)
  // const [endpoint] = useState<string>(defaultEndpoint)
  const [endpoint, setEndpoint] = useState<string>(rpcNodeUrl || defaultEndpoint)

  useEffect(() => {
    let cancelled = false

    const loadWallets = async () => {
      const [solflare, moongate, burner, walletConnect] = await Promise.allSettled([
        import('@solflare-wallet/wallet-adapter'),
        import('@moongate/moongate-adapter'),
        import('@solana/wallet-adapter-unsafe-burner'),
        import('@walletconnect/solana-adapter')
      ])
      if (cancelled) return

      if (solflare.status === 'fulfilled') {
        try {
          solflare.value.initialize()
        } catch (error) {
          reportWalletError('Solflare', error)
        }
      } else {
        reportWalletError('Solflare', solflare.reason)
      }

      if (moongate.status === 'fulfilled') {
        const authModes = ['Ethereum', 'Google', 'Apple'] as const
        authModes.forEach((authMode) => {
          try {
            moongate.value.registerMoonGateWallet({ authMode, position: 'top-right' })
          } catch (error) {
            reportWalletError(`MoonGate (${authMode})`, error)
          }
        })
      } else {
        reportWalletError('MoonGate', moongate.reason)
      }

      const nextWallets: Adapter[] = []
      if (burner.status === 'fulfilled') {
        try {
          nextWallets.push(new burner.value.UnsafeBurnerWalletAdapter())
        } catch (error) {
          reportWalletError('Unsafe Burner', error)
        }
      } else {
        reportWalletError('Unsafe Burner', burner.reason)
      }

      if (walletConnect.status === 'fulfilled') {
        try {
          nextWallets.push(
            new walletConnect.value.WalletConnectWalletAdapter({
              network: network as WalletAdapterNetwork.Mainnet,
              options: {
                projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PJ_ID,
                metadata: {
                  name: 'Raydium',
                  description: 'Raydium',
                  url: 'https://raydium.io/',
                  icons: ['https://raydium.io/logo/logo-only-icon.svg']
                }
              }
            })
          )
        } catch (error) {
          reportWalletError('WalletConnect', error)
        }
      } else {
        reportWalletError('WalletConnect', walletConnect.reason)
      }

      if (!cancelled) setWallets(nextWallets)
    }

    loadWallets()
    return () => {
      cancelled = true
    }
  }, [network])

  useEffect(() => {
    if (rpcNodeUrl) setEndpoint(rpcNodeUrl)
  }, [rpcNodeUrl])

  const onWalletError = useEvent((error: WalletError, adapter?: Adapter) => {
    if (!adapter) return
    sendWalletEvent({
      type: 'connectWallet',
      walletName: adapter.name,
      connectStatus: 'failure',
      errorMsg: error.message || error.stack
    })
  })

  return (
    <ConnectionProvider endpoint={endpoint} config={{ disableRetryOnRateLimit: true, wsEndpoint: wsNodeUrl }}>
      <WalletProvider wallets={wallets} onError={onWalletError} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default App
