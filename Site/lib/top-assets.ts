export interface TopAssetUniverseItem {
  name: string
  symbol: string
  aliases?: string[]
}

export const TOP_30_ASSET_UNIVERSE: TopAssetUniverseItem[] = [
  { name: "Bitcoin", symbol: "BTC" },
  { name: "Ethereum", symbol: "ETH" },
  { name: "Tether", symbol: "USDT" },
  { name: "BNB", symbol: "BNB", aliases: ["BINANCECOIN"] },
  { name: "XRP", symbol: "XRP" },
  { name: "USD Coin", symbol: "USDC" },
  { name: "Solana", symbol: "SOL" },
  { name: "TRON", symbol: "TRX" },
  { name: "Dogecoin", symbol: "DOGE" },
  { name: "Cardano", symbol: "ADA" },
  { name: "Bitcoin Cash", symbol: "BCH" },
  { name: "Chainlink", symbol: "LINK" },
  { name: "Monero", symbol: "XMR" },
  { name: "Hyperliquid", symbol: "HYPE" },
  { name: "UNUS SED LEO", symbol: "LEO" },
  { name: "Zcash", symbol: "ZEC" },
  { name: "Stellar", symbol: "XLM" },
  { name: "Ethena USDe", symbol: "USDE", aliases: ["USDe"] },
  { name: "Litecoin", symbol: "LTC" },
  { name: "Sui", symbol: "SUI" },
  { name: "Dai", symbol: "DAI" },
  { name: "Avalanche", symbol: "AVAX" },
  { name: "Hedera", symbol: "HBAR" },
  { name: "Shiba Inu", symbol: "SHIB" },
  { name: "Uniswap", symbol: "UNI" },
  { name: "PayPal USD", symbol: "PYUSD" },
  { name: "Mantle", symbol: "MNT" },
  { name: "Cronos", symbol: "CRO" },
  { name: "Canton", symbol: "CC", aliases: ["CANTO"] },
  { name: "Toncoin", symbol: "TON" },
]
