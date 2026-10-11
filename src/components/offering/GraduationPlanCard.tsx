"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
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
      toast.success(`DLMM pair opened. Signature ${sig.slice(0, 8)}…`);
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
    </section>
  );
}
