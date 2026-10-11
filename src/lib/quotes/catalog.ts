/**
 * Quote assets a DBC pool can be denominated in.
 *
 * SOL and USDC are the original quotes. Stock rows are pinned mainnet mints
 * for tokenized equities. The stock is the quote asset. The token EquiCurve
 * launches is not that stock and is not a share.
 *
 * Mints are pinned from issuer catalogs reproduced by public Solana listings
 * (xStocks / Backed and Backpack Securities) and checked as base58 addresses
 * in tests. A mainnet launch still reads the mint account and refuses a
 * decimal mismatch.
 */

export const QUOTE_DECIMALS = [6, 7, 8, 9] as const;
export type QuoteDecimals = (typeof QUOTE_DECIMALS)[number];

export type QuoteKind = "native" | "stable" | "stock";

export type QuoteAsset = {
  id: string;
  symbol: string;
  name: string;
  decimals: QuoteDecimals;
  kind: QuoteKind;
  /** Who issues the quote token. Null for SOL. */
  issuer: string | null;
  /** Mainnet mint. SOL and USDC resolve through the cluster helpers instead. */
  mainnetMint: string | null;
  /** What holding the quote token is. Not a claim about the launched token. */
  claim: string;
};

const STOCK_CLAIM =
  "This mint is someone else's tokenized equity. EquiCurve does not custody it, redeem it, or turn the launched token into a share.";

export const QUOTE_ASSETS = [
  {
    id: "SOL",
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    kind: "native",
    issuer: null,
    mainnetMint: "So11111111111111111111111111111111111111112",
    claim: "The quote is wrapped SOL.",
  },
  {
    id: "USDC",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    kind: "stable",
    issuer: "Circle",
    mainnetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    claim: "The quote is USDC for this cluster. A devnet override is not Circle USDC.",
  },
  {
    id: "AAPLx",
    symbol: "AAPLx",
    name: "Apple",
    decimals: 8,
    kind: "stock",
    issuer: "Backed (xStocks)",
    mainnetMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    claim: STOCK_CLAIM,
  },
  {
    id: "NVDAx",
    symbol: "NVDAx",
    name: "NVIDIA",
    decimals: 8,
    kind: "stock",
    issuer: "Backed (xStocks)",
    mainnetMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    claim: STOCK_CLAIM,
  },
  {
    id: "TSLAx",
    symbol: "TSLAx",
    name: "Tesla",
    decimals: 8,
    kind: "stock",
    issuer: "Backed (xStocks)",
    mainnetMint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    claim: STOCK_CLAIM,
  },
  {
    id: "MSFTx",
    symbol: "MSFTx",
    name: "Microsoft",
    decimals: 8,
    kind: "stock",
    issuer: "Backed (xStocks)",
    mainnetMint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",
    claim: STOCK_CLAIM,
  },
  {
    id: "SPYx",
    symbol: "SPYx",
    name: "S&P 500",
    decimals: 8,
    kind: "stock",
    issuer: "Backed (xStocks)",
    mainnetMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    claim: STOCK_CLAIM,
  },
  {
    id: "SPCX",
    symbol: "SPCX",
    name: "SpaceX",
    decimals: 6,
    kind: "stock",
    issuer: "Backpack Securities",
    mainnetMint: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb",
    claim: STOCK_CLAIM,
  },
  {
    id: "HOOD",
    symbol: "HOOD",
    name: "Robinhood",
    decimals: 6,
    kind: "stock",
    issuer: "Backpack Securities",
    mainnetMint: "HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A",
    claim: STOCK_CLAIM,
  },
  {
    id: "MU",
    symbol: "MU",
    name: "Micron",
    decimals: 6,
    kind: "stock",
    issuer: "Backpack Securities",
    mainnetMint: "MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1",
    claim: STOCK_CLAIM,
  },
  {
    id: "GRND",
    symbol: "GRND",
    name: "Grindr",
    decimals: 6,
    kind: "stock",
    issuer: "Backpack Securities",
    mainnetMint: "GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2",
    claim: STOCK_CLAIM,
  },
] as const satisfies readonly QuoteAsset[];

export type QuoteId = (typeof QUOTE_ASSETS)[number]["id"];

export const QUOTE_ID_LIST = QUOTE_ASSETS.map((asset) => asset.id) as [
  QuoteId,
  ...QuoteId[],
];

const BY_ID = new Map<string, (typeof QUOTE_ASSETS)[number]>(
  QUOTE_ASSETS.map((asset) => [asset.id, asset]),
);
const BY_MINT = new Map<string, (typeof QUOTE_ASSETS)[number]>();
for (const asset of QUOTE_ASSETS) {
  if (asset.kind === "stock" && asset.mainnetMint) BY_MINT.set(asset.mainnetMint, asset);
}

export function isQuoteId(value: string): value is QuoteId {
  return BY_ID.has(value);
}

export function isDesignQuote(value: string): boolean {
  return value === "CUSTOM" || isQuoteId(value);
}

export function getQuoteAsset(id: QuoteId): (typeof QUOTE_ASSETS)[number] {
  const asset = BY_ID.get(id);
  if (!asset) throw new Error(`Unknown quote ${id}.`);
  return asset;
}

export function quoteDecimals(id: QuoteId): QuoteDecimals {
  return getQuoteAsset(id).decimals;
}

export function isStockQuote(id: QuoteId): boolean {
  return getQuoteAsset(id).kind === "stock";
}

/** Stock catalog hit for a mint. SOL and USDC are resolved by the caller. */
export function stockQuoteForMint(mint: string): (typeof QUOTE_ASSETS)[number] | null {
  return BY_MINT.get(mint) ?? null;
}

/**
 * Default market caps, in quote-token units, when a search has not chosen caps.
 * Stock quotes use the preset's USDC price multiple starting at 1 quote token,
 * so the number is a count of quote tokens and not a dollar price.
 */
export function defaultMarketCaps(
  multiple: number,
  kind: QuoteKind,
  sol: { initial: number; migration: number },
  usdc: { initial: number; migration: number },
): { initial: number; migration: number } {
  if (kind === "stable") return usdc;
  if (kind === "native") return sol;
  if (!(multiple > 1)) throw new Error("Stock quote multiple must be greater than 1.");
  return { initial: 1, migration: multiple };
}
