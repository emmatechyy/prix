/** Human label for a NEAR Intents asset id such as nep141:base-0x…omft.near or nep141:sol.omft.near. */
export function intentsChain(asset: string): string {
  const id = asset.replace(/^nep\d+:/, "");
  const m = id.match(/^([a-z0-9]+)(?:-[^.]+)?\.omft\.near$/);
  if (m) return m[1].toUpperCase();
  if (id.endsWith(".factory.bridge.near")) return "ETH (Rainbow)";
  if (id.includes(".")) return "NEAR";
  return "NEAR";
}
