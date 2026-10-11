import { NextResponse } from "next/server";
import { publishedPresetCard } from "@/lib/presets/published";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    presets: [publishedPresetCard()],
  });
}
