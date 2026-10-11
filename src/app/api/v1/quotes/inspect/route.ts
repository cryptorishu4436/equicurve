import { NextResponse } from "next/server";
import { getServerConnection } from "@/lib/connection";
import { inspectQuoteMint } from "@/lib/quotes/inspect";
import { clientKey, readJsonBody } from "@/lib/server/http";
import { limitRequest } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await limitRequest(clientKey(req, "api:v1:quote-inspect"), 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }
  const body = await readJsonBody(req, 2_048);
  if (!body.ok) return NextResponse.json({ ok: false, reason: body.error }, { status: body.status });
  const mint = body.value && typeof body.value === "object" && "mint" in body.value ? String((body.value as { mint?: unknown }).mint ?? "") : "";
  const inspected = await inspectQuoteMint(getServerConnection(), mint);
  return NextResponse.json(inspected, { status: inspected.ok ? 200 : 422 });
}
