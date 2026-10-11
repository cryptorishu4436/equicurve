import { NextResponse } from "next/server";
import { clientKey } from "@/lib/server/http";
import { limitRequest } from "@/lib/server/rateLimit";
import { createTtlSingleFlight } from "@/lib/server/ttlCache";
import { readDeployment, type DeploymentRead } from "@/lib/registry/readDeployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEPLOYMENT_CACHE_MS = 15_000;
const READ_LIMIT = 30;
const READ_WINDOW_MS = 60_000;

const deploymentCache = createTtlSingleFlight<DeploymentRead>(DEPLOYMENT_CACHE_MS);

function cacheable(payload: DeploymentRead): boolean {
  return payload.body.reason !== "rpc_unavailable";
}

export async function GET(req: Request, ctx: { params: Promise<{ pool: string }> }) {
  const { pool } = await ctx.params;
  if (!deploymentCache.peek(pool)) {
    const rl = await limitRequest(clientKey(req, "deployments:get"), READ_LIMIT, READ_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, verified: false, error: "Too many deployment reads — slow down.", code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }
  }
  const payload = await deploymentCache.get(pool, () => readDeployment(pool), cacheable);
  return NextResponse.json(payload.body, { status: payload.status });
}
