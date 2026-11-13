/** Every upstream endpoint PRIX reads. All are public and read-only. */
export const RHEA_API = process.env.RHEA_INDEXER_URL ?? "https://api.rhea.finance";
export const RHEA_DATA = process.env.RHEA_DATA_SERVICE_URL ?? "https://api.data-service.ref.finance/api";
export const RHEA_ROUTER = process.env.RHEA_SMART_ROUTER_URL ?? "https://smartrouter.rhea.finance";
export const NEAR_RPC = process.env.NEAR_RPC_URL ?? "https://free.rpc.fastnear.com";
export const NEARBLOCKS = process.env.NEARBLOCKS_API_URL ?? "https://api.nearblocks.io";
export const FASTNEAR_API = process.env.FASTNEAR_API_URL ?? "https://api.fastnear.com";
export const ONECLICK = process.env.ONECLICK_API_URL ?? "https://1click.chaindefuser.com";

export const DCL_CONTRACT = "dclv2.ref-labs.near";
export const AMM_CONTRACT = "v2.ref-finance.near";
export const INTENTS_CONTRACT = "intents.near";
export const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const WNEAR = "wrap.near";
