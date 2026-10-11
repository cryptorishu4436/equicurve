import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { DEVELOPER_API_ENGINE_VERSION, DEVELOPER_API_FINGERPRINT_VERSION, DEVELOPER_API_SCHEMA_VERSION } from "@/lib/market/apiVersion";
import { readDeployment } from "@/lib/registry/readDeployment";
import { clientKey } from "@/lib/server/http";
import { limitRequest } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ pool: string }> }) {
  const limited = await limitRequest(clientKey(req, "api:v1:verify"), 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: { code: "RATE_LIMITED", message: "Deployment verify rate limit exceeded." } }, { status: 429 });
  }
  const { pool } = await ctx.params;
  try {
    new PublicKey(pool);
  } catch {
    return NextResponse.json({ ok: false, verified: false, reason: "invalid_pool", error: { code: "INVALID_POOL", message: "Pool address is not a Solana address." } }, { status: 400 });
  }
  const read = await readDeployment(pool);
  return NextResponse.json({
    schemaVersion: DEVELOPER_API_SCHEMA_VERSION,
    engineVersion: DEVELOPER_API_ENGINE_VERSION,
    fingerprintVersion: DEVELOPER_API_FINGERPRINT_VERSION,
    pool,
    ...read.body,
  }, { status: read.status });
}
