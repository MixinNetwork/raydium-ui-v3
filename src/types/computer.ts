import { SafeUtxoOutput } from "@mixin.dev/mixin-node-sdk";
import { TokenInfo } from "@raydium-io/raydium-sdk-v2";

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
  chain_id: string;
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  uri: string;
  price_usd: string;
}

export interface ComputerNonceResponse {
  nonce_address: string;
  nonce_hash: string;
}

export interface ComputerFeeResponse {
  fee_id: string;
  xin_amount: string;
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
  hash:          string;
}

export interface Asset {
  asset_id: string;
  chain_id: string;
  asset_key: string;
  precision: number;
  name: string;
  symbol: string;
  price_usd: string;
  change_usd: string;
  icon_url: string;
}

export interface UserAssetBalanceWithoutAsset {
  asset_id: string;
  total_amount: string;
  outputs: SafeUtxoOutput[];
  address?: string;
}

export interface UserAssetBalance extends UserAssetBalanceWithoutAsset{
  asset: Asset;
  hide?: boolean;
}

export interface Token {
  info: TokenInfo;
  balance: UserAssetBalance;
}
