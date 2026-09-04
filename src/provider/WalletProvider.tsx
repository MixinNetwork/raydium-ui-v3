import { FC, PropsWithChildren, useEffect } from 'react'
import React, { useState } from 'react'

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { useAppStore, defaultNetWork, defaultEndpoint } from '../store/useAppStore'

import { type Adapter, type WalletError } from '@solana/wallet-adapter-base'
import { sendWalletEvent } from '@/api/event'
import { useEvent } from '@/hooks/useEvent'

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
      try {
        const [solflare, moongate, burner, walletConnect] = await Promise.all([
          import('@solflare-wallet/wallet-adapter'),
          import('@moongate/moongate-adapter'),
          import('@solana/wallet-adapter-unsafe-burner'),
          import('@walletconnect/solana-adapter')
        ])
        if (cancelled) return

        solflare.initialize()
        moongate.registerMoonGateWallet({ authMode: 'Ethereum', position: 'top-right' })
        moongate.registerMoonGateWallet({ authMode: 'Google', position: 'top-right' })
        moongate.registerMoonGateWallet({ authMode: 'Apple', position: 'top-right' })

        const nextWallets: Adapter[] = [new burner.UnsafeBurnerWalletAdapter()]
        try {
          nextWallets.push(
            new walletConnect.WalletConnectWalletAdapter({
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
        } catch (e) {
          // WalletConnect is optional when its environment configuration is unavailable.
        }
        if (!cancelled) setWallets(nextWallets)
      } catch (e) {
        // Browser wallet integrations are optional; keep the app usable if one fails to load.
      }
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
