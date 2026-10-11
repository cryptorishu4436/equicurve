import { PublicKey } from "@solana/web3.js";
import { compareDeploymentReadback } from "@/lib/dbc/deploymentReadback";
import { getDbcClient } from "@/lib/dbc/client";
import { fetchPoolSnapshot } from "@/lib/dbc/migrate";
import { getServerConnection } from "@/lib/connection";
import { WSOL_MINT, knownUsdcMints } from "@/lib/constants";
import { mintHintForQuote } from "@/lib/quotes/resolve";
import { resolveDeploymentRecord } from "@/lib/registry/design";
import { getRecordedDeployment } from "@/lib/registry/publicDeployments";
import { getRegistryLaunch } from "@/lib/registry/store";

export type DeploymentRead = { status: number; body: Record<string, unknown> };

function quoteMintFor(quote: string): string | null {
  if (quote === "SOL") return WSOL_MINT.toBase58();
  if (quote === "USDC") return knownUsdcMints()[0] ?? null;
  if (quote === "CUSTOM") return null;
  return mintHintForQuote(quote);
}

/** Live comparison of a recorded design with the chain. A failed read is not a pass. */
export async function readDeployment(pool: string): Promise<DeploymentRead> {
  const registry = await getRegistryLaunch(pool);
  const deployment = resolveDeploymentRecord({
    pool,
    registry,
    catalog: getRecordedDeployment(pool),
  });
  if (!deployment) {
    return { status: 404, body: { ok: false, verified: false, reason: "no_record", error: "No recorded design for this pool." } };
  }
  const quoteMint = registry?.quoteMint ?? quoteMintFor(deployment.quote);
  if (!quoteMint) {
    return {
      status: 200,
      body: { ok: true, verified: false, reason: "record_mismatch", source: deployment.source, deployment, checks: null },
    };
  }
  try {
    const connection = getServerConnection();
    const snapshot = await fetchPoolSnapshot(connection, new PublicKey(deployment.pool));
    const onChain = await getDbcClient(connection).state.getPoolConfig(new PublicKey(deployment.config));
    if (!onChain) {
      return {
        status: 200,
        body: { ok: true, verified: false, reason: "config_unreadable", source: deployment.source, deployment, checks: null },
      };
    }
    const verdict = compareDeploymentReadback({
      expected: deployment.expected,
      canonicalConfig: deployment.canonicalConfig,
      fingerprint: deployment.fingerprint,
      identity: {
        pool: deployment.pool,
        config: deployment.config,
        mint: deployment.mint,
        threshold: deployment.migrationQuoteThresholdAtoms,
        quoteMint,
      },
      snapshot,
      chain: onChain as unknown as Record<string, unknown>,
    });
    return {
      status: 200,
      body: {
        ok: true,
        verified: verdict.verified,
        reason: verdict.verified ? null : "readback_mismatch",
        source: deployment.source,
        checks: verdict.checks,
        deployment,
      },
    };
  } catch {
    return {
      status: 200,
      body: { ok: true, verified: false, reason: "rpc_unavailable", source: deployment.source, deployment, checks: null },
    };
  }
}
