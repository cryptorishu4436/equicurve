import { NextResponse } from "next/server";
import { getCluster } from "@/lib/constants";
import { getWalletSession } from "@/lib/community/auth";
import { toPublicPost, togglePostLike } from "@/lib/community/authorize";
import { resolveCommunityMarket } from "@/lib/community/market";
import { CommunityStorageConfigError, getCommunityStore } from "@/lib/community/store";
import { limitRequest } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ postId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { postId } = await ctx.params;
  const session = await getWalletSession(req).catch(() => null);
  if (!session || session.cluster !== getCluster()) {
    return NextResponse.json({ ok: false, error: "Authenticate a wallet before reacting.", code: "unauthenticated" }, { status: 401 });
  }
  const rl = await limitRequest(`community:like:${session.wallet}`, 60, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "Too many reactions — slow down.", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  try {
    const store = getCommunityStore();
    const post = await store.getPost(postId);
    if (!post || post.deletedAt) return NextResponse.json({ ok: false, error: "Update not found.", code: "post_not_found" }, { status: 404 });
    const market = await resolveCommunityMarket(post.marketId);
    if (!market.ok) return NextResponse.json({ ok: false, error: market.error, code: market.code }, { status: market.status });
    const result = await togglePostLike({ post, signer: session.wallet, store });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: result.status });
    return NextResponse.json({ ok: true, liked: result.liked, post: toPublicPost(result.post, (await store.listComments(result.post.id)).length, session.wallet) });
  } catch (error) {
    const status = error instanceof CommunityStorageConfigError ? 503 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Community storage unavailable", code: "storage_unavailable" }, { status });
  }
}
