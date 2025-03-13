import { FC, PropsWithChildren, useEffect } from 'react'
import React, { useMemo, useState } from 'react'

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { initialize } from '@solflare-wallet/wallet-adapter'
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useAppStore, defaultNetWork, defaultEndpoint } from '../store/useAppStore'
import { registerMoonGateWallet } from '@moongate/moongate-adapter'
import { WalletConnectWalletAdapter } from '@walletconnect/solana-adapter'

import { type Adapter, type WalletError } from '@solana/wallet-adapter-base'
import { sendWalletEvent } from '@/api/event'
import { useEvent } from '@/hooks/useEvent'

initialize()

const App: FC<PropsWithChildren<any>> = ({ children }) => {
  const [network] = useState<WalletAdapterNetwork>(defaultNetWork)
  const rpcNodeUrl = useAppStore((s) => s.rpcNodeUrl)
  const wsNodeUrl = useAppStore((s) => s.wsNodeUrl)
  // const [endpoint] = useState<string>(defaultEndpoint)
  const [endpoint, setEndpoint] = useState<string>(rpcNodeUrl || defaultEndpoint)

  registerMoonGateWallet({
    authMode: 'Ethereum',
    position: 'top-right'
    // logoDataUri: 'OPTIONAL ADD IN-WALLET LOGO URL HERE',
    // buttonLogoUri: 'ADD OPTIONAL LOGO FOR WIDGET BUTTON HERE'
  })
  registerMoonGateWallet({
    authMode: 'Google',
    position: 'top-right'
    // logoDataUri: 'OPTIONAL ADD IN-WALLET LOGO URL HERE',
    // buttonLogoUri: 'ADD OPTIONAL LOGO FOR WIDGET BUTTON HERE'
  })
  // registerMoonGateWallet({
  //   authMode: 'Twitter',
  //   position: 'top-right'
  //   // logoDataUri: 'OPTIONAL ADD IN-WALLET LOGO URL HERE',
  //   // buttonLogoUri: 'ADD OPTIONAL LOGO FOR WIDGET BUTTON HERE'
  // })
  registerMoonGateWallet({
    authMode: 'Apple',
    position: 'top-right'
    // logoDataUri: 'OPTIONAL ADD IN-WALLET LOGO URL HERE',
    // buttonLogoUri: 'ADD OPTIONAL LOGO FOR WIDGET BUTTON HERE'
  })

  const _walletConnect = useMemo(() => {
    const connectWallet: WalletConnectWalletAdapter[] = []
    try {
      connectWallet.push(
        new WalletConnectWalletAdapter({
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
      // console.error('WalletConnect error', e)
    }
    return connectWallet
  }, [network])

  const wallets = useMemo(
    () => [
      new UnsafeBurnerWalletAdapter(),
      ..._walletConnect,
    ],
    [network, endpoint]
  )

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
