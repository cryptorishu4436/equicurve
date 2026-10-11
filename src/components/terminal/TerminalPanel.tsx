"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MarketBody = {
  ok?: boolean;
  quote?: string | null;
  quoteMint?: string | null;
  lifecycle?: string;
  migrated?: boolean;
  progress?: number | null;
  mint?: string;
  config?: string;
  reason?: string;
  note?: string;
  error?: { message?: string };
};

type VerifyBody = {
  ok?: boolean;
  verified?: boolean;
  reason?: string | null;
  checks?: { fingerprint?: boolean; poolConfiguration?: boolean; migrationThreshold?: boolean; readback?: boolean } | null;
  error?: string | { message?: string };
};

export function TerminalPanel({ pool }: { pool: string }) {
  const [market, setMarket] = useState<MarketBody | null>(null);
  const [verify, setVerify] = useState<VerifyBody | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v1/markets/${pool}`).then((response) => response.json()).then((body) => {
      if (!cancelled) setMarket(body as MarketBody);
    }).catch(() => {
      if (!cancelled) setMarket({ ok: false, reason: "rpc_unavailable" });
    });
    void fetch(`/api/v1/deployments/${pool}/verify`).then((response) => response.json()).then((body) => {
      if (!cancelled) setVerify(body as VerifyBody);
    }).catch(() => {
      if (!cancelled) setVerify({ ok: false, verified: false, reason: "rpc_unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [pool]);

  const verifyError = typeof verify?.error === "string" ? verify.error : verify?.error?.message;

  return (
    <div className="space-y-4">
      <header>
        <p className="ec-eyebrow">Terminal</p>
        <h1 className="ec-page-title break-all">{pool}</h1>
        <p className="mt-2 max-w-3xl text-sm text-fg-secondary">
          Lifecycle comes from the pool account. Verification compares a recorded design with the chain. A failed read stays failed.
        </p>
      </header>
      <section className="ec-card space-y-2 p-5 text-sm">
        <h2 className="font-medium text-fg-primary">Lifecycle</h2>
        {market == null ? <p className="text-fg-muted">Reading the pool…</p> : null}
        {market && market.ok === false ? <p className="text-signal-warn">{market.error?.message ?? market.reason ?? "Pool read failed."}</p> : null}
        {market?.ok ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-fg-muted">Phase</dt><dd>{market.lifecycle ?? "unknown"}</dd></div>
            <div><dt className="text-fg-muted">Migrated</dt><dd>{market.migrated ? "yes" : "no"}</dd></div>
            <div><dt className="text-fg-muted">Quote</dt><dd>{market.quote ?? "unlabelled"} · {market.quoteMint ?? "unavailable"}</dd></div>
            <div><dt className="text-fg-muted">Progress</dt><dd>{market.progress == null ? "unknown" : `${Math.round(market.progress * 1000) / 10}%`}</dd></div>
            <div className="sm:col-span-2"><dt className="text-fg-muted">Base mint</dt><dd className="break-all font-mono text-xs">{market.mint}</dd></div>
          </dl>
        ) : null}
        {market?.note ? <p className="text-xs text-fg-muted">{market.note}</p> : null}
      </section>
      <section className="ec-card space-y-2 p-5 text-sm">
        <h2 className="font-medium text-fg-primary">Deployment check</h2>
        {verify == null ? <p className="text-fg-muted">Comparing the recorded design…</p> : null}
        {verify ? (
          <p>{verify.verified ? "Chain matches the recorded design." : `Not verified${verify.reason ? `: ${verify.reason}` : ""}.`}</p>
        ) : null}
        {verifyError ? <p className="text-xs text-fg-muted">{verifyError}</p> : null}
        {verify?.checks ? (
          <ul className="text-xs text-fg-secondary">
            <li>Fingerprint {verify.checks.fingerprint ? "matches" : "does not match"}</li>
            <li>Pool configuration {verify.checks.poolConfiguration ? "matches" : "does not match"}</li>
            <li>Migration threshold {verify.checks.migrationThreshold ? "matches" : "does not match"}</li>
          </ul>
        ) : null}
      </section>
      <p className="text-sm"><Link href="/terminal" className="text-accent hover:underline">Check another pool</Link></p>
    </div>
  );
}
