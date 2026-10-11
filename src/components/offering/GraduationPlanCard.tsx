"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useState } from "react";
import { toast } from "sonner";
import type { DlmmGraduation, GraduationAttestation } from "@/lib/graduation/plan";
import { toUserMessage } from "@/lib/errors";
import { signAndSendTransaction } from "@/lib/send";

/**
 * Shows the stored graduation plan. A DLMM plan can be opened after the
 * issuer connects a wallet. The transaction creates an empty pair.
 */
export function GraduationPlanCard({
  plan,
  baseMint,
  quoteMint,
  migrated,
}: {
  plan: GraduationAttestation;
  baseMint: string | null;
  quoteMint: string | null;
  migrated: boolean;
}) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [dlmmPool, setDlmmPool] = useState("");
  const [amountX, setAmountX] = useState("0");
  const [amountY, setAmountY] = useState("0");
  const [rangeNote, setRangeNote] = useState<string | null>(null);
  const dlmm: DlmmGraduation | null = plan.plan.venue === "dlmm" ? plan.plan : null;

  async function openPool() {
    if (!dlmm || !baseMint || !quoteMint || !wallet.publicKey || !wallet.signTransaction) return;
    setBusy(true);
    try {
      const { buildDlmmOpenTransaction } = await import("@/lib/graduation/dlmm");
      const built = await buildDlmmOpenTransaction({
        connection,
        plan: dlmm,
        baseMint: new PublicKey(baseMint),
        quoteMint: new PublicKey(quoteMint),
        creator: wallet.publicKey,
      });
      const sig = await signAndSendTransaction({ connection, wallet, tx: built.transaction });
      toast.success(`DLMM pair opened. Signature ${sig.slice(0, 8)}… Paste the pair address below to add the planned liquidity.`);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ec-card space-y-2 p-4 text-sm">
      <p className="ec-eyebrow">Graduation plan</p>
      <p className="text-fg-secondary">{plan.note}</p>
      <p className="break-all font-mono text-xs text-fg-muted">Fingerprint {plan.fingerprint}</p>
      {dlmm ? (
        <p className="text-xs text-fg-muted">
          Bin step {dlmm.binStep}, fee {dlmm.feeBps} bps, {dlmm.rangeBins} bins each side. The range is the liquidity width you add later. This button only opens the empty pair.
        </p>
      ) : null}
      {dlmm && migrated && baseMint && quoteMint ? (
        <button type="button" className="ec-btn-secondary" disabled={busy || !wallet.publicKey} onClick={() => void openPool()}>
          {busy ? "Opening…" : "Open designed DLMM pool"}
        </button>
      ) : null}
      {dlmm ? (
        <div className="space-y-2">
          <input className="ec-input font-mono text-xs" placeholder="DLMM pair address" value={dlmmPool} onChange={(e) => setDlmmPool(e.target.value.trim())} />
          <div className="grid grid-cols-2 gap-2">
            <input className="ec-input font-mono text-xs" value={amountX} onChange={(e) => setAmountX(e.target.value.trim())} aria-label="Token X atoms" />
            <input className="ec-input font-mono text-xs" value={amountY} onChange={(e) => setAmountY(e.target.value.trim())} aria-label="Token Y atoms" />
          </div>
          <button
            type="button"
            className="ec-btn-secondary"
            disabled={busy || !wallet.publicKey || !dlmmPool}
            onClick={() => {
              void (async () => {
                if (!wallet.publicKey || !dlmm) return;
                setBusy(true);
                try {
                  const { buildDlmmLiquidityTransaction, readDlmmRange } = await import("@/lib/graduation/dlmm");
                  const built = await buildDlmmLiquidityTransaction({
                    connection,
                    pool: new PublicKey(dlmmPool),
                    plan: dlmm,
                    owner: wallet.publicKey,
                    amountX: new BN(amountX || "0"),
                    amountY: new BN(amountY || "0"),
                  });
                  built.transaction.partialSign(built.position);
                  const sig = await signAndSendTransaction({ connection, wallet, tx: built.transaction });
                  const read = await readDlmmRange({ connection, pool: new PublicKey(dlmmPool), owner: wallet.publicKey, plan: dlmm });
                  setRangeNote(read.reason);
                  toast.success(read.ok ? `Liquidity added. ${sig.slice(0, 8)}…` : `Transaction sent. ${read.reason}`);
                } catch (error) {
                  toast.error(toUserMessage(error));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Add liquidity across the planned range
          </button>
          {rangeNote ? <p className="text-xs text-fg-muted">{rangeNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
