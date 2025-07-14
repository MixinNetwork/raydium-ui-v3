import BigNumber from 'bignumber.js';

export const add = (a: string | number | BigNumber, b: string | number | BigNumber) => {
  const ba = BigNumber.isBigNumber(a) ? a : BigNumber(a);
  const bb = BigNumber.isBigNumber(b) ? b : BigNumber(b);
  return ba.plus(bb);
};

export const mul = (a: string | number | BigNumber, b: string | number | BigNumber) => {
  const ba = BigNumber.isBigNumber(a) ? a : BigNumber(a);
  const bb = BigNumber.isBigNumber(b) ? b : BigNumber(b);
  return ba.multipliedBy(bb);
};

export const eq = (a: string | number | BigNumber, b: string | number | BigNumber) => {
  const ba = BigNumber.isBigNumber(a) ? a : BigNumber(a);
  const bb = BigNumber.isBigNumber(b) ? b : BigNumber(b);
  return ba.eq(bb);
};

export const compare = (a: string | number | BigNumber, b: string | number | BigNumber) => {
  const ba = BigNumber.isBigNumber(a) ? a : BigNumber(a);
  const bb = BigNumber.isBigNumber(b) ? b : BigNumber(b);
  if (ba.eq(bb)) return 0;
  if (ba.isGreaterThan(bb)) return 1;
  else return -1;
};