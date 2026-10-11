import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { parseQuoteUsd } from "@/lib/quotes/mark";
import { clientKey } from "@/lib/server/http";
import { limitRequest } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await limitRequest(clientKey(req, "api:v1:quote-mark"), 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ ok: false, reason: "rate_limited", quoteUsd: null }, { status: 429 });
  }
  const mint = new URL(req.url).searchParams.get("mint")?.trim() ?? "";
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_mint", quoteUsd: null }, { status: 400 });
  }
  try {
    const response = await fetch(`https://lite-api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ ok: true, reason: "unavailable", quoteUsd: null, mint });
    }
    const quoteUsd = parseQuoteUsd(await response.json(), mint);
    return NextResponse.json({
      ok: true,
      mint,
      quoteUsd,
      reason: quoteUsd ? null : "unavailable",
      note: "This is the quote token's own market price in USD. It does not price the token you launch.",
    });
  } catch {
    return NextResponse.json({ ok: true, mint, reason: "unavailable", quoteUsd: null });
  }
}
