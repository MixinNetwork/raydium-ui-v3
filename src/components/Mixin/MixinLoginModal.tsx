import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next';
import { AuthorizationResponse, base64RawURLEncode, getChallenge, getED25519KeyPair } from '@mixin.dev/mixin-node-sdk';
import ReconnectingWebSocket from 'reconnecting-websocket';
import pako from 'pako';
import { v4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore'
import { compare } from '@/utils/date';
import { MixinModal } from './MixinModal';

export function MixinLoginModal(props: { isOpen: boolean; onClose: () => void; }) {
  const { t } = useTranslation()
  const {user, getMixinClient, setKeystore} = useAppStore((s) => ({
    user: s.user,
    getMixinClient: s.getMixinClient,
    setKeystore: s.setKeystore,
  }));

  const clientId = process.env.NEXT_PUBLIC_CLIENT_ID as string;
  const scope = 'PROFILE:READ ASSETS:READ SNAPSHOTS:READ';
  const { verifier, challenge } = getChallenge();

  const [authorization, _setAuthorization] = useState<AuthorizationResponse | null>(null)
  const prev = useRef<AuthorizationResponse | null>(null)
  const setAuthorization = (a: AuthorizationResponse) => {
    prev.current = a;
    _setAuthorization(a);
  }
  const ws = useRef<ReconnectingWebSocket | null>(null);

  useEffect(() => {
    const endpoint = 'wss://blaze.mixin.one';
    ws.current = new ReconnectingWebSocket(endpoint, 'Mixin-OAuth-1', {
      maxReconnectionDelay: 5000,
      minReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1.2,
      connectionTimeout: 8000,
      maxRetries: Infinity,
      debug: false,
    });
  
    return () => {
      if (ws.current) ws.current.close();
    }
  }, []);
  useEffect(() => {
    if (!ws.current) return
  
    let handled = false;
    const send = (msg: any) => {
      try {
        if (ws.current) ws.current.send(pako.gzip(JSON.stringify(msg)));
      } catch (e) {
        if (!(e instanceof DOMException)) 
          console.error(e);
      }
    };
    const sendRefreshCode = (authorization: any) => {
      if (handled) {
        return;
      }
  
      send({
        id: v4().toUpperCase(),
        action: 'REFRESH_OAUTH_CODE',
        params: {
          client_id: clientId,
          scope,
          code_challenge: challenge,
          authorization_id: authorization ? authorization.authorization_id : '',
        },
      });
    };
    const handleAuthorization = (a: AuthorizationResponse) => {
      if (!prev.current || compare(prev.current.created_at, a.created_at) < 0) {
        setAuthorization(a)
        return false;
      }
      if (a.authorization_code.length > 16) {
        handleLogin(a.authorization_code);
        return true;
      }
      return false;
    }

    if (!ws.current.onopen) ws.current.onopen = function () {
      sendRefreshCode('');
    };
    if (!ws.current.onmessage) ws.current.onmessage = function (event) {
      if (handled) {
        return;
      }
      const fileReader = new FileReader();
      fileReader.onload = function () {
        const msg = this.result
          ? pako.ungzip(new Uint8Array(this.result as ArrayBuffer), { to: 'string' })
          : '{}';
        const authorization = JSON.parse(msg);
        if (handleAuthorization(authorization.data)) {
          handled = true;
          return;
        }
        setTimeout(function () {
          sendRefreshCode(authorization.data);
        }, 1000);
      };
      fileReader.readAsArrayBuffer(event.data);
    };
  }, [authorization])
  useEffect(() => {
    if (!user) return;
    _setAuthorization(null);
  }, [user]);

  const handleLogin = async (code: string) => {
    const { seed, publicKey } = getED25519KeyPair();

    try {
      let client = getMixinClient();
      const { scope, authorization_id } = await client.oauth.getToken({
        client_id: clientId,
        code,
        ed25519: base64RawURLEncode(publicKey),
        code_verifier: verifier,
      });

      if (
        !scope ||
        scope.indexOf('ASSETS:READ') < 0 ||
        scope.indexOf('SNAPSHOTS:READ') < 0
      ) {
        // TODO toast
        return;
      }

      client = setKeystore({
        app_id: clientId,
        scope,
        authorization_id,
        session_private_key: seed.toString('hex'),
      });
      const user = await client.user.profile();
      useAppStore.setState({ user })
      props.onClose();
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <MixinModal title={t("computer.login")} isOpen={props.isOpen} onClose={props.onClose} data={authorization ? `mixin://codes/${authorization.code_id}` : undefined}/>
  )
}