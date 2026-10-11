import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getServerConnection } from "@/lib/connection";
import { fetchPoolSnapshot } from "@/lib/dbc/migrate";
import { PoolNotFoundError } from "@/lib/dbc/poolAccount";
import { quoteLabelForMint } from "@/lib/constants";
import { DEVELOPER_API_ENGINE_VERSION, DEVELOPER_API_SCHEMA_VERSION } from "@/lib/market/apiVersion";
import { clientKey } from "@/lib/server/http";
import { limitRequest } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limitRequest(clientKey(req, "api:v1:market"), 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "Market read rate limit exceeded." } }, { status: 429 });
  }
  const { id } = await ctx.params;
  let pool: PublicKey;
  try {
    pool = new PublicKey(id);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_pool", error: { code: "INVALID_POOL", message: "Pool address is not a Solana address." } }, { status: 400 });
  }
  try {
    const snapshot = await fetchPoolSnapshot(getServerConnection(), pool);
    const quote = snapshot.quoteMint ? quoteLabelForMint(snapshot.quoteMint) : null;
    return NextResponse.json({
      ok: true,
      schemaVersion: DEVELOPER_API_SCHEMA_VERSION,
      engineVersion: DEVELOPER_API_ENGINE_VERSION,
      pool: snapshot.pool,
      mint: snapshot.baseMint,
      config: snapshot.config,
      quoteMint: snapshot.quoteMint,
      quote: quote ?? (snapshot.quoteMint ? "CUSTOM" : null),
      lifecycle: snapshot.curve.phase,
      migrated: snapshot.isMigrated,
      progress: snapshot.quoteProgress,
      migrationQuoteThreshold: snapshot.migrationQuoteThreshold,
      note: "Progress and phase come from the pool account. A missing config read stays unknown. This is not a price prediction.",
    });
  } catch (error) {
    if (error instanceof PoolNotFoundError) {
      return NextResponse.json({ ok: false, reason: "not_found", error: { code: "NOT_FOUND", message: "Pool account was not found." } }, { status: 404 });
    }
    return NextResponse.json({ ok: false, reason: "rpc_unavailable", error: { code: "RPC_UNAVAILABLE", message: "Pool could not be read. Retry shortly." } }, { status: 503 });
  }
}
