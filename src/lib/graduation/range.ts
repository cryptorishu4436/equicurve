import type { DlmmGraduation } from "./plan";

/** Bins from the bottom of the position to the top. The plan covers `rangeBins` on each side. */
export function plannedRangeWidth(rangeBins: number): number {
  return rangeBins * 2;
}

export function dlmmRangeMatches(
  plan: DlmmGraduation,
  position: { lowerBinId: number; upperBinId: number } | null,
): { ok: boolean; reason: string } {
  if (!position) {
    return { ok: false, reason: "No DLMM position was found for this owner. The planned range is not on chain." };
  }
  if (!Number.isInteger(position.lowerBinId) || !Number.isInteger(position.upperBinId)) {
    return { ok: false, reason: "DLMM position bin ids could not be read." };
  }
  if (position.upperBinId < position.lowerBinId) {
    return { ok: false, reason: "DLMM position bin range is reversed." };
  }
  const width = position.upperBinId - position.lowerBinId;
  const planned = plannedRangeWidth(plan.rangeBins);
  if (Math.abs(width - planned) > 1) {
    return {
      ok: false,
      reason: `DLMM position spans ${width} bins. The plan spans ${planned} bins (${plan.rangeBins} on each side of the active bin).`,
    };
  }
  return { ok: true, reason: "DLMM position width matches the graduation plan." };
}
