export const VERSION = 'prod';

export const isStaging = () => {
  return VERSION !== 'prod';
};

export const getEnvConfig = () => {
  return isStaging()
    ? {
        api: 'https://computer.mixin.dev/',
      }
    : {
        api: 'https://computer.mixin.one/',
      };
};

export const OperationTypeAddUser    = 1
export const OperationTypeSystemCall = 2

export const XIN_ASSET_ID = "c94ac88f-4671-3976-b60a-09064f1811e8"
export const SOL_ASSET_ID = "64692c23-8971-4cf4-84a7-4dd1271dd887"
export const WSOL_ASSET_ID = "438f21b9-c5fc-3b51-bd03-5c7788384308"
export const WSOL_PUBLICKEY = "So11111111111111111111111111111111111111112"

export const CREATE_POOL_RENT_SIZES = [1544, 165, 165, 4483, 1832]
export const OPEN_POSITION_RENT_SIZES = [165, 165, 225, 281, 270, 170, 10240, 10240]
export const SOL_DECIMAL = 9