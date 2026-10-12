"use client";

import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isLocalTokenImageUrl, normalizeHttpsUrl } from "@/lib/validation";
import type { CommunityMarketKind, PostCategory, PublicCommunityComment, PublicIssuerPost } from "@/lib/community/types";

const CATEGORIES: { value: PostCategory; label: string }[] = [
  { value: "announcement", label: "Announcement" },
  { value: "update", label: "Update" },
  { value: "milestone", label: "Milestone" },
  { value: "important", label: "Important" },
];

type Props = { marketId: string; marketKind: CommunityMarketKind; creatorWallet: string | null; focusPostId?: string | null };
type Draft = { category: PostCategory; title: string; body: string; link: string; imageUrl: string };

const EMPTY_DRAFT: Draft = { category: "update", title: "", body: "", link: "", imageUrl: "" };

function shortWallet(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

function categoryLabel(value: PostCategory): string {
  return CATEGORIES.find((item) => item.value === value)?.label ?? "Update";
}

function validDraft(draft: Draft): string | null {
  if (draft.title.trim().length < 1 || draft.title.trim().length > 100) return "Title must be 1–100 characters.";
  if (draft.body.trim().length < 1 || draft.body.trim().length > 4000) return "Body must be 1–4,000 characters.";
  if (draft.link.trim() && !normalizeHttpsUrl(draft.link)) return "Link must use https://.";
  if (draft.imageUrl.trim() && !isLocalTokenImageUrl(draft.imageUrl) && !normalizeHttpsUrl(draft.imageUrl)) return "Image URL must use https:// or a local uploaded image.";
  return null;
}

function when(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

export function UpdatesPanel({ marketId, marketKind, creatorWallet, focusPostId = null }: Props) {
  const wallet = useWallet();
  const [posts, setPosts] = useState<PublicIssuerPost[]>([]);
  const [comments, setComments] = useState<Record<string, PublicCommunityComment[]>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ postId: string; commentId: string } | null>(null);
  const connectedWallet = wallet.publicKey?.toBase58() ?? null;
  const isCreator = !!connectedWallet && connectedWallet === creatorWallet;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/markets/${encodeURIComponent(marketId)}/updates`, { cache: "no-store" });
      const body = (await response.json()) as { ok?: boolean; posts?: PublicIssuerPost[]; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Updates are unavailable.");
      const next = body.posts ?? [];
      setPosts(next);
      const entries = await Promise.all(next.map(async (post) => {
        const result = await fetch(`/api/updates/${encodeURIComponent(post.id)}/comments`, { cache: "no-store" });
        const data = (await result.json()) as { comments?: PublicCommunityComment[] };
        return [post.id, data.comments ?? []] as const;
      }));
      setComments(Object.fromEntries(entries));
    } catch (error) {
      setPosts([]);
      if (error instanceof Error && error.message !== "Updates are unavailable.") toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!focusPostId || !posts.some((post) => post.id === focusPostId)) return;
    window.setTimeout(() => document.getElementById(`news-post-${focusPostId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, [focusPostId, posts]);

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey || !wallet.signMessage) {
      toast.error("Connect a wallet with message signing enabled.");
      return false;
    }
    const signer = wallet.publicKey.toBase58();
    const existing = await fetch("/api/auth/wallet/session", { cache: "no-store" }).then((response) => response.json() as Promise<{ authenticated?: boolean; wallet?: string }>).catch(() => null);
    if (existing?.authenticated && existing.wallet === signer) return true;
    const challengeResponse = await fetch("/api/auth/wallet/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: signer }) });
    const challenge = (await challengeResponse.json()) as { ok?: boolean; message?: string; nonce?: string; error?: string };
    if (!challengeResponse.ok || !challenge.ok || !challenge.message || !challenge.nonce) throw new Error(challenge.error ?? "Could not start wallet authentication.");
    const signature = await wallet.signMessage(new TextEncoder().encode(challenge.message));
    const verifyResponse = await fetch("/api/auth/wallet/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: signer, nonce: challenge.nonce, signature: bs58.encode(signature) }) });
    const verified = (await verifyResponse.json()) as { ok?: boolean; error?: string };
    if (!verifyResponse.ok || !verified.ok) throw new Error(verified.error ?? "Wallet authentication failed.");
    return true;
  }, [wallet]);

  const mutate = useCallback(async (url: string, init: RequestInit): Promise<boolean> => {
    try {
      if (!(await ensureSession())) return false;
      const response = await fetch(url, init);
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Community action failed.");
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Community action failed.");
      return false;
    }
  }, [ensureSession, load]);

  const submitPost = async () => {
    const error = validDraft(draft);
    if (error) { toast.error(error); return; }
    setBusy("composer");
    const ok = await mutate(editingId ? `/api/updates/${encodeURIComponent(editingId)}` : `/api/markets/${encodeURIComponent(marketId)}/updates`, {
      method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: draft.category, title: draft.title.trim(), body: draft.body.trim(), link: draft.link.trim(), imageUrl: draft.imageUrl.trim() }),
    });
    if (ok) { setDraft(EMPTY_DRAFT); setEditingId(null); toast.success(editingId ? "Update edited" : "Update published"); }
    setBusy(null);
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy("image");
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("purpose", "update");
      const response = await fetch("/api/uploads/token-image", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !body.ok || !body.url) throw new Error(body.error ?? "Image upload failed.");
      setDraft((current) => ({ ...current, imageUrl: body.url ?? "" }));
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (post: PublicIssuerPost) => {
    setEditingId(post.id);
    setDraft({ category: post.category, title: post.title, body: post.body, link: post.link ?? "", imageUrl: post.imageUrl ?? "" });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const deletePost = async (post: PublicIssuerPost) => {
    if (!window.confirm("Delete this creator update? It is removed from the market page. The server keeps a deletion record that is not shown here.")) return;
    setBusy(post.id);
    await mutate(`/api/updates/${encodeURIComponent(post.id)}`, { method: "DELETE" });
    setBusy(null);
  };

  const pinPost = async (post: PublicIssuerPost) => {
    setBusy(post.id);
    await mutate(`/api/updates/${encodeURIComponent(post.id)}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !post.pinned }) });
    setBusy(null);
  };

  const toggleLike = async (post: PublicIssuerPost) => {
    setBusy(`like:${post.id}`);
    await mutate(`/api/updates/${encodeURIComponent(post.id)}/like`, { method: "POST" });
    setBusy(null);
  };

  const submitComment = async (postId: string, body: string, parentId?: string) => {
    if (!body.trim() || body.trim().length > 1000) { toast.error("Comment must be 1–1,000 characters."); return; }
    setBusy(`comment:${postId}`);
    const ok = await mutate(`/api/updates/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), ...(parentId ? { parentId } : {}) }),
    });
    if (ok) setReplyTo(null);
    setBusy(null);
  };

  const editComment = async (comment: PublicCommunityComment) => {
    const next = window.prompt("Edit your comment", comment.body);
    if (next == null || next.trim() === comment.body) return;
    setBusy(comment.id);
    await mutate(`/api/comments/${encodeURIComponent(comment.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: next.trim() }) });
    setBusy(null);
  };

  const deleteComment = async (comment: PublicCommunityComment) => {
    const own = connectedWallet === comment.authorWallet;
    if (!window.confirm(own ? "Delete your comment?" : "Remove this comment from the market page?")) return;
    setBusy(comment.id);
    await mutate(`/api/comments/${encodeURIComponent(comment.id)}`, { method: "DELETE" });
    setBusy(null);
  };

  if (loading) return <div className="rounded-input border border-line bg-subtle p-5 text-sm text-fg-muted">Loading updates…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-input border border-signal-warn/30 bg-signal-warn/5 p-4 text-xs leading-relaxed text-signal-warn">
        Published by the market creator. EquiCurve verifies authorship, not the claims made in this post.
        {marketKind === "scheduled" && <span className="ml-1">This is an Upcoming creator update; no market exists on-chain yet.</span>}
      </div>

      {isCreator && (
        <div className="rounded-input border border-accent/25 bg-accent/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-fg-primary">{editingId ? "Edit creator update" : "Publish creator update"}</h3>{editingId && <button type="button" className="text-xs text-fg-muted hover:text-fg-primary" onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); }}>Cancel</button>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="ec-label">Category</span><select className="ec-input" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as PostCategory }))}>{CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label className="space-y-1.5"><span className="ec-label">Title</span><input className="ec-input" maxLength={100} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="A clear update title" /></label>
          </div>
          <label className="mt-3 block space-y-1.5"><span className="ec-label">Body</span><textarea className="ec-input min-h-32" maxLength={4000} value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} placeholder="Share a concise, factual update." /></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="ec-label">Link (optional)</span><input className="ec-input font-mono text-xs" maxLength={200} value={draft.link} onChange={(event) => setDraft((current) => ({ ...current, link: event.target.value }))} placeholder="https://…" /></label>
            <label className="space-y-1.5">
              <span className="ec-label">Image (optional)</span>
              <input className="ec-input font-mono text-xs" maxLength={200} value={draft.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://…" />
              <input className="mt-2 block text-xs text-fg-secondary" type="file" accept="image/png,image/jpeg,image/webp,image/avif" disabled={busy === "image"} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          </div>
          <button type="button" className="ec-btn-primary mt-4" disabled={busy === "composer"} onClick={() => void submitPost()}>{busy === "composer" ? "Saving…" : editingId ? "Save changes" : "Publish update"}</button>
        </div>
      )}

      {posts.length === 0 && <div className="rounded-input border border-line bg-subtle p-6 text-sm text-fg-muted">No creator updates yet.</div>}
      {posts.map((post) => {
        const postComments = comments[post.id] ?? [];
        const image = post.imageUrl && (isLocalTokenImageUrl(post.imageUrl) || normalizeHttpsUrl(post.imageUrl)) ? post.imageUrl : null;
        const permalink = `?tab=updates&post=${encodeURIComponent(post.id)}`;
        return (
          <article id={`news-post-${post.id}`} key={post.id} className="rounded-input border border-line bg-base/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ec-chip border-accent/25 text-accent">{post.pinned ? "Pinned · " : ""}{categoryLabel(post.category)}</span>
                  <span className="text-xs text-fg-muted">Creator update</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-fg-primary">{post.title}</h3>
              </div>
              {isCreator && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" className="text-accent hover:underline" onClick={() => startEdit(post)}>Edit</button>
                  <button type="button" className="text-accent hover:underline" disabled={busy === post.id} onClick={() => void pinPost(post)}>{post.pinned ? "Unpin" : "Pin"}</button>
                  <button type="button" className="text-signal-danger hover:underline" disabled={busy === post.id} onClick={() => void deletePost(post)}>Delete</button>
                </div>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg-secondary">{post.body}</p>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Creator update" className="mt-4 max-h-80 w-full rounded-input border border-line object-cover" referrerPolicy="no-referrer" />
            )}
            {post.link && normalizeHttpsUrl(post.link) && <a href={normalizeHttpsUrl(post.link) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm text-accent hover:underline">Open source link ↗</a>}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-fg-muted">
              <span>Author {shortWallet(post.creatorWallet)}</span>
              <span className="font-mono">{post.id}</span>
              <a href={permalink} className="text-accent hover:underline">Permalink</a>
              <span>{when(post.createdAt)}</span>
              {post.edited && <span>Edited {when(post.updatedAt)}</span>}
              <span>{post.commentCount} comment{post.commentCount === 1 ? "" : "s"}</span>
              <button type="button" className="text-accent hover:underline" disabled={busy === `like:${post.id}`} onClick={() => void toggleLike(post)}>{post.liked ? "Liked" : "Like"} · {post.likeCount ?? 0}</button>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-fg-primary">Comments</p>
              <CommentThread
                comments={postComments}
                connectedWallet={connectedWallet}
                isCreator={isCreator}
                busy={busy}
                onEdit={(comment) => void editComment(comment)}
                onDelete={(comment) => void deleteComment(comment)}
                onReply={(comment) => setReplyTo({ postId: post.id, commentId: comment.id })}
              />
              <CommentBox
                connected={!!connectedWallet}
                busy={busy === `comment:${post.id}`}
                replyLabel={replyTo?.postId === post.id ? "Replying to a comment" : null}
                onCancelReply={() => setReplyTo(null)}
                onSubmit={(body) => void submitComment(post.id, body, replyTo?.postId === post.id ? replyTo.commentId : undefined)}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CommentThread({
  comments,
  connectedWallet,
  isCreator,
  busy,
  onEdit,
  onDelete,
  onReply,
}: {
  comments: PublicCommunityComment[];
  connectedWallet: string | null;
  isCreator: boolean;
  busy: string | null;
  onEdit: (comment: PublicCommunityComment) => void;
  onDelete: (comment: PublicCommunityComment) => void;
  onReply: (comment: PublicCommunityComment) => void;
}) {
  const ids = new Set(comments.map((comment) => comment.id));
  const roots = comments.filter((comment) => !comment.parentId || !ids.has(comment.parentId));
  const repliesOf = (id: string) => comments.filter((comment) => comment.parentId === id);
  return (
    <>
      {roots.map((comment) => (
        <div key={comment.id}>
          <CommentItem comment={comment} connectedWallet={connectedWallet} isCreator={isCreator} busy={busy} onEdit={onEdit} onDelete={onDelete} onReply={onReply} />
          {repliesOf(comment.id).map((reply) => (
            <div key={reply.id} className="ml-4 mt-2 border-l border-line pl-3">
              <CommentItem comment={reply} connectedWallet={connectedWallet} isCreator={isCreator} busy={busy} onEdit={onEdit} onDelete={onDelete} onReply={null} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function CommentItem({
  comment,
  connectedWallet,
  isCreator,
  busy,
  onEdit,
  onDelete,
  onReply,
}: {
  comment: PublicCommunityComment;
  connectedWallet: string | null;
  isCreator: boolean;
  busy: string | null;
  onEdit: (comment: PublicCommunityComment) => void;
  onDelete: (comment: PublicCommunityComment) => void;
  onReply: ((comment: PublicCommunityComment) => void) | null;
}) {
  const own = connectedWallet === comment.authorWallet;
  const canDelete = own || isCreator;
  return (
    <div className="rounded-input border border-line/70 bg-subtle px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <span className="font-mono">{shortWallet(comment.authorWallet)}</span>
        <span>{when(comment.createdAt)}</span>
        {comment.creator && <span className="ec-chip border-accent/25 text-accent">Creator</span>}
        {comment.edited && <span>Edited {when(comment.updatedAt)}</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-fg-secondary">{comment.body}</p>
      {(own || canDelete || onReply) && (
        <div className="mt-2 flex gap-3 text-xs">
          {onReply && connectedWallet && <button type="button" className="text-accent hover:underline" onClick={() => onReply(comment)}>Reply</button>}
          {own && <button type="button" className="text-accent hover:underline" disabled={busy === comment.id} onClick={() => onEdit(comment)}>Edit</button>}
          {canDelete && <button type="button" className="text-signal-danger hover:underline" disabled={busy === comment.id} onClick={() => onDelete(comment)}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function CommentBox({
  connected,
  busy,
  replyLabel,
  onCancelReply,
  onSubmit,
}: {
  connected: boolean;
  busy: boolean;
  replyLabel: string | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  if (!connected) return <p className="text-xs text-fg-muted">Connect wallet to comment.</p>;
  return (
    <div>
      {replyLabel && (
        <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
          <span>{replyLabel}</span>
          <button type="button" className="text-accent hover:underline" onClick={onCancelReply}>Cancel reply</button>
        </div>
      )}
      <div className="flex gap-2">
        <input className="ec-input min-w-0 flex-1 text-sm" maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={replyLabel ? "Write a reply…" : "Write a comment…"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (body.trim()) { onSubmit(body); setBody(""); } } }} />
        <button type="button" className="ec-btn-secondary shrink-0 text-xs" disabled={busy || !body.trim()} onClick={() => { onSubmit(body); setBody(""); }}>{busy ? "Posting…" : replyLabel ? "Post reply" : "Post comment"}</button>
      </div>
    </div>
  );
}
