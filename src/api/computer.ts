import axios, { type AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import type { ComputerAssetResponse, ComputerInfoResponse, ComputerNonceResponse, ComputerStorageResponse, ComputerSystemCallResponse, ComputerUserResponse } from '@/types/computer';
import { getEnvConfig } from '@/utils/constant';

axios.defaults.headers.post['Content-Type'] = 'application/json';

export const initComputerClient = (responseCallback?: (e: any) => void) => {
  const ins = axios.create({
    baseURL: getEnvConfig().api,
    timeout: 1000 * 60,
  });

  ins.interceptors.response.use(async (res: AxiosResponse) => {
    return res.data;
  });

  ins.interceptors.response.use(undefined, async (e: any) => {
    if (e.response.status === 404) return Promise.resolve(undefined);
    responseCallback?.(e);
    return Promise.reject(e);
  });

  axiosRetry(ins, {
    retries: 5,
    shouldResetTimeout: true,
    retryDelay: () => 500,
  });

  return {
    fetchInfo: (): Promise<ComputerInfoResponse> => ins.get('/'),
    fetchUser: (mix: string): Promise<ComputerUserResponse> => ins.get(`/users/${mix}`),
    fetchAssets: (): Promise<ComputerAssetResponse[]> => ins.get('/deployed_assets'),
    fetchCall: (id: string): Promise<ComputerSystemCallResponse> => ins.get(`/system_calls/${id}`),

    deployAssets: (assets: string[]) => ins.post('/deployed_assets', { assets }),
    getNonce: (mix: string): Promise<ComputerNonceResponse> => ins.post('nonce_accounts', { mix }),
    storageTx: (tx: string): Promise<ComputerStorageResponse> => ins.post("/storages", { transaction: tx })
  };
};
