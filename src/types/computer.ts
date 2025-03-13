export interface ComputerInfoResponse {
  observer: string;
  payer: string;
  members: {
    app_id: string;
    members: string[];
    threshold: number;
  },
  params: {
    operation: {
      asset: string;
      price: string;
    };
  };
  height: number;
}

export interface ComputerUserResponse {
  id: string;
  mix_address: string;
  chain_address: string;
}

export interface ComputerAssetResponse {
  asset_id: string;
  address: string;
}

export interface ComputerNonceResponse {
  nonce_address: string;
  nonce_hash: string;
}

export interface ComputerStorageResponse {
  hash: string;
}

export interface ComputerSystemCallRequest {
  trace: string;
  value: string;
}

export interface ComputerSystemCallResponse {
  id:            string;
  user_id:       string;
  nonce_account: string;
  raw:           string;
  state:         string;
}