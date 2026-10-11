import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, type Connection } from "@solana/web3.js";
import { deriveTokenBadgeAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { isUsdcMint, WSOL_MINT } from "@/lib/constants";
import { stockQuoteForMint, type QuoteDecimals } from "./catalog";

export type QuoteInspection =
  | {
      ok: true;
      mint: string;
      decimals: QuoteDecimals;
      badge: "not-required" | "present";
      label: "SOL" | "USDC" | "CUSTOM" | string;
    }
  | { ok: false; reason: string };

const DECIMAL_SET = new Set([6, 7, 8, 9]);

export function isQuoteDecimal(value: number): value is QuoteDecimals {
  return DECIMAL_SET.has(value);
}

/**
 * Decide whether a mint may be a DBC quote. SOL and USDC do not need a badge.
 * Every other mint needs decimals in 6–9 and a Meteora quote badge. An unknown
 * mint is never labelled SOL.
 */
export function classifyQuoteMint(args: {
  mint: string;
  decimals: number | null;
  badgeExists: boolean;
}): QuoteInspection {
  if (args.mint === WSOL_MINT.toBase58()) {
    return { ok: true, mint: args.mint, decimals: 9, badge: "not-required", label: "SOL" };
  }
  if (isUsdcMint(args.mint)) {
    if (args.decimals != null && args.decimals !== 6) {
      return { ok: false, reason: `USDC mint reports ${args.decimals} decimals. Expected 6.` };
    }
    return { ok: true, mint: args.mint, decimals: 6, badge: "not-required", label: "USDC" };
  }
  if (args.decimals == null) {
    return { ok: false, reason: "Quote mint decimals could not be read." };
  }
  if (!isQuoteDecimal(args.decimals)) {
    return { ok: false, reason: `Quote mint has ${args.decimals} decimals. EquiCurve accepts 6, 7, 8, or 9.` };
  }
  const stock = stockQuoteForMint(args.mint);
  if (stock && stock.decimals !== args.decimals) {
    return {
      ok: false,
      reason: `${stock.symbol} mint reports ${args.decimals} decimals. The catalog says ${stock.decimals}.`,
    };
  }
  if (!args.badgeExists) {
    return {
      ok: false,
      reason: "This mint has no Meteora DBC quote badge. EquiCurve will not use it as a quote.",
    };
  }
  return {
    ok: true,
    mint: args.mint,
    decimals: args.decimals,
    badge: "present",
    label: stock?.id ?? "CUSTOM",
  };
}

async function readDecimals(connection: Connection, mint: PublicKey): Promise<number | null> {
  for (const program of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const parsed = await getMint(connection, mint, "confirmed", program);
      return parsed.decimals;
    } catch {
      /* try the other token program */
    }
  }
  return null;
}

/** On-chain decimal and badge check. A failed account read is a refusal, not a guess. */
export async function inspectQuoteMint(connection: Connection, mint: string): Promise<QuoteInspection> {
  let key: PublicKey;
  try {
    key = new PublicKey(mint);
  } catch {
    return { ok: false, reason: "Quote mint is not a Solana address." };
  }
  const canonical = key.toBase58();
  if (canonical === WSOL_MINT.toBase58() || isUsdcMint(canonical)) {
    const decimals = canonical === WSOL_MINT.toBase58() ? 9 : await readDecimals(connection, key);
    return classifyQuoteMint({ mint: canonical, decimals, badgeExists: false });
  }
  const [decimals, badgeInfo] = await Promise.all([
    readDecimals(connection, key),
    connection.getAccountInfo(deriveTokenBadgeAddress(key), "confirmed").catch(() => null),
  ]);
  if (decimals == null && badgeInfo === null) {
    return { ok: false, reason: "Quote mint could not be read. Retry shortly." };
  }
  return classifyQuoteMint({ mint: canonical, decimals, badgeExists: badgeInfo != null });
}
