"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TradingViewChart } from "@/components/offering/TradingViewChart";
import { formatMarketTimestamp, formatMetricValue } from "@/lib/marketDisplay";
import type { HistoryTimeframe, MarketHistory } from "@/lib/market/history";

type Props = {
  poolAddress: string | null;
  quoteLabel: string;
  progress: number | null;
  illustrative?: boolean;
  priceMultiple?: number;
  historicalOnly?: boolean;
  metricMode?: "price" | "mcap";
  denomination?: "SOL" | "USD";
  currentPrice?: string | null;
  currentPriceVenue?: string | null;
  marketStrip?: ChartMarketStrip | null;
  onSummary?: (summary: { volume24h: string | null; change24hPct: string | null; quoteMint: string | null; complete24h: boolean; rangeVolume: string | null }) => void;
  onManualRefresh?: () => void;
};

function MarketStrip({ strip }: { strip: ChartMarketStrip }) {
  const items = [
    { label: "Price", value: strip.price, note: null },
    { label: "MCap", value: strip.mcap, note: strip.mcapNote },
    { label: "FDV", value: strip.fdv, note: null },
    { label: "Liquidity", value: strip.liquidity, note: null },
    { label: strip.volumeLabel, value: strip.volume, note: null },
    { label: "24h Change", value: strip.change, note: null },
    { label: "Holders", value: strip.holders, note: null },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-input border border-line bg-line sm:grid-cols-4 xl:grid-cols-7" data-testid="chart-market-strip">
      {items.map((item) => (
        <div key={item.label} className="bg-base/80 px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">{item.label}</p>
          <p className="mt-1 break-all font-mono text-sm text-fg-primary">{item.value}</p>
          {item.note ? <p className="mt-1 text-[10px] text-fg-muted">{item.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function sumQuoteAmounts(values: string[]): string | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    total += parsed;
  }
  return Number.isFinite(total) ? String(total) : null;
}

export type ChartMarketStrip = {
  price: string;
  mcap: string;
  mcapNote: string | null;
  fdv: string;
  liquidity: string;
  volume: string;
  volumeLabel: string;
  change: string;
  holders: string;
};

const TIMEFRAMES: { value: HistoryTimeframe; label: string }[] = [
  { value: "5m", label: "5m" }, { value: "15m", label: "15m" }, { value: "1h", label: "1h" },
  { value: "4h", label: "4h" }, { value: "1D", label: "1D" }, { value: "ALL", label: "ALL" },
];

export function curveShapeYs(priceMultiple: number, n = 32): number[] {
  const m = Math.max(priceMultiple, 1.0001);
  const r = Math.sqrt(m) - 1;
  const ys: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = i / n;
    ys.push(((1 + x * r) ** 2 - 1) / (m - 1));
  }
  return ys;
}

export function liveSpotPoint(
  history: { t: number; price: number; source: "swap" | "spot" | "local" }[],
  spot: number | null,
  historicalOnly = false,
): Array<{ x: number; y: number }> {
  if (spot == null || historicalOnly) return [];
  const observed = history.filter((point) => point.source === "spot").at(-1);
  const swap = history.filter((point) => point.source === "swap").at(-1);
  return [{ x: observed?.t ?? swap?.t ?? 0, y: spot }];
}

function TheoreticalCurve({ progress, priceMultiple, mode }: { progress: number | null; priceMultiple: number; mode: "live" | "illustrative" | "thin" }) {
  const shape = curveShapeYs(priceMultiple);
  return <details className="rounded-xl border border-line p-4 sm:p-5" open={mode === "illustrative" ? true : undefined}><summary className="text-sm font-medium text-fg-secondary">Theoretical curve shape <span className="ml-2 text-xs font-normal text-fg-muted">Illustrative · separate scale</span></summary><div className="mt-5"><svg viewBox="0 0 640 160" className="block h-40 w-full" role="img" aria-label="Theoretical normalized curve shape"><polyline points={shape.map((value, index) => `${24 + index * 592 / (shape.length - 1)},${138 - value * 112}`).join(" ")} fill="none" stroke="#89BCEB" strokeWidth="2.5" strokeDasharray="5 4" /><text x="24" y="156" fill="#899B9F" fontSize="11">0%</text><text x="616" y="156" fill="#899B9F" fontSize="11" textAnchor="end">100%</text></svg><p className="mt-3 text-xs leading-relaxed text-fg-muted">{priceMultiple}× graduation / start price range. The vertical axis is normalized from 0 to 1; it is not a token price or forecast.{mode !== "illustrative" && ` Current threshold progress: ${progress == null ? "unknown" : `${(Math.min(1, Math.max(0, progress)) * 100).toFixed(1)}%`}.`}</p></div></details>;
}

export function PriceHistoryChart({ poolAddress, quoteLabel, progress, illustrative = false, priceMultiple = 15, historicalOnly = false, metricMode = "price", denomination = "SOL", currentPrice = null, currentPriceVenue = null, marketStrip = null, onSummary, onManualRefresh }: Props) {
  const [timeframe, setTimeframe] = useState<HistoryTimeframe>("1D");
  const [chartMode, setChartMode] = useState<"line" | "candles">("candles");
  const [result, setResult] = useState<MarketHistory | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<MarketHistory | null>(null);
  resultRef.current = result;
  const refresh = useCallback(async () => {
    if (!poolAddress || illustrative) { setResult(null); setStatus(null); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/markets/${encodeURIComponent(poolAddress)}/history?mode=candles&timeframe=${timeframe}`, { headers: { Accept: "application/json" } });
      const body = (await response.json()) as MarketHistory & { error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "History fetch failed");
      setResult(body);
      setStatus(body.unavailableReasons.length ? body.unavailableReasons.join(" ") : body.partial ? "History is partial because the bounded RPC scan did not reach the full requested range." : null);
      const rangeSource = body.candles.length > 0 ? body.candles.map((candle) => candle.quoteVolume) : body.trades.map((trade) => trade.quoteAmount);
      onSummary?.({ volume24h: body.volume24h, change24hPct: body.change24hPct, quoteMint: body.market.quoteMint, complete24h: body.coverage.reaches24hBoundary, rangeVolume: sumQuoteAmounts(rangeSource) });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "History fetch failed");
      if (!resultRef.current) onSummary?.({ volume24h: null, change24hPct: null, quoteMint: null, complete24h: false, rangeVolume: null });
    } finally { setLoading(false); }
  }, [illustrative, onSummary, poolAddress, timeframe]);
  useEffect(() => { void refresh(); }, [refresh]);
  const chartTrades = result?.trades ?? [];
  const mode = illustrative ? "illustrative" : chartTrades.length > 0 ? "live" : "thin";
  const historicalUsdUnavailable = denomination === "USD" && quoteLabel === "SOL";
  const chartQuoteLabel = denomination === "USD" ? "USD" : quoteLabel;
  const volumeText = result?.volume24h == null ? "—" : quoteLabel === "USDC" ? formatMetricValue(result.volume24h, "USD") : quoteLabel === "SOL" ? formatMetricValue(result.volume24h, "SOL") : `${result.volume24h} ${quoteLabel}`;
  const span = useMemo(() => result?.trades.length ? `${formatMarketTimestamp(result.trades[0].blockTime)} — ${formatMarketTimestamp(result.trades.at(-1)!.blockTime)}` : null, [result]);
  return <div className="space-y-4">
    {marketStrip ? <MarketStrip strip={marketStrip} /> : null}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-sm font-semibold text-fg-primary">{metricMode === "mcap" ? "Price history" : "Trading terminal"}</h3><p className="text-xs text-fg-muted">{illustrative ? "Illustrative offering — curve shape only; no invented price history." : "Candles and volume use confirmed swaps. The axis is the quote price, in SOL or USD, not lamports."}</p></div><div className="flex flex-wrap items-center gap-2" aria-label="History chart controls"><div className="flex shrink-0 rounded-input border border-line bg-subtle p-1" role="group" aria-label="Chart mode">{(["line", "candles"] as const).map((value) => <button key={value} type="button" aria-pressed={chartMode === value} onClick={() => setChartMode(value)} className={`min-h-9 rounded-md px-3 text-xs font-medium ${chartMode === value ? "bg-accent/15 text-accent" : "text-fg-secondary hover:text-fg-primary"}`}>{value === "line" ? "Line" : "Candles"}</button>)}</div><div className="flex max-w-full gap-1 overflow-x-auto rounded-input border border-line bg-subtle p-1" role="group" aria-label="History timeframe">{TIMEFRAMES.map((item) => <button key={item.value} type="button" aria-pressed={timeframe === item.value} onClick={() => setTimeframe(item.value)} className={`min-h-9 shrink-0 rounded-md px-2.5 text-xs font-medium ${timeframe === item.value ? "bg-accent/15 text-accent" : "text-fg-secondary hover:text-fg-primary"}`}>{item.label}</button>)}</div>{poolAddress && !illustrative && <button type="button" onClick={() => { void refresh(); onManualRefresh?.(); }} disabled={loading} className="min-h-9 px-1 text-xs text-accent hover:underline disabled:opacity-50">{loading ? "Loading…" : "Refresh"}</button>}</div></div>
    {historicalUsdUnavailable && !illustrative && <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-fg-secondary">Historical USD conversion is unavailable for SOL quotes. Switch to SOL to view exact quote-denominated history; no current SOL/USD rate is applied to old trades.</div>}
    {!illustrative && result && !historicalUsdUnavailable && <div className="ec-chart-frame p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs text-fg-muted"><span className="ec-chip">{result.coverage.reaches24hBoundary ? "24h covered" : "Partial range"}</span><span>Volume · {volumeText}</span></div><span className="text-xs text-fg-muted">{result.market.activeVenue === "DAMM v2" ? "DBC → verified DAMM v2" : result.market.activeVenue === "DBC" ? "Verified DBC" : "Active venue unknown"}</span></div><TradingViewChart trades={chartTrades} candles={result.candles} mode={chartMode} quoteLabel={chartQuoteLabel} currentPrice={historicalUsdUnavailable ? null : currentPrice} currentPriceVenue={currentPriceVenue} boundary={result.migrationBoundary} />{span && <p className="mt-3 text-xs text-fg-muted">{span} · {chartTrades.length} confirmed swap{chartTrades.length === 1 ? "" : "s"} · quote volume bars use the same candle buckets.</p>}<p className="mt-3 text-xs leading-relaxed text-fg-muted">Historical prices: confirmed parsed swaps. DBC uses Meteora DBC events; post-migration history uses balance-attributed swaps from the verified Meteora DAMM v2 pool. Current {currentPriceVenue ?? "active venue"} spot is independent of chart history.</p></div>}
    {!illustrative && !result && <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-line text-sm text-fg-muted">{loading ? "Reading confirmed market history…" : "History unavailable; current market metrics remain available."}</div>}
    {illustrative && <TheoreticalCurve progress={progress} priceMultiple={priceMultiple} mode={mode} />}{!illustrative && result && <TheoreticalCurve progress={progress} priceMultiple={priceMultiple} mode={mode} />}
    {!illustrative && status && <p className="text-xs text-signal-warn">{status}</p>}
    {!illustrative && result && (result.coverage.dbc.swapsParsed + result.coverage.dbc.signaturesScanned + result.coverage.dammV2.swapsParsed + result.coverage.dammV2.signaturesScanned > 0) && <ul className="grid gap-1 text-xs text-fg-muted sm:grid-cols-3"><li>DBC: {result.coverage.dbc.swapsParsed} parsed / {result.coverage.dbc.signaturesScanned} signatures</li><li>DAMM v2: {result.coverage.dammV2.swapsParsed} parsed / {result.coverage.dammV2.signaturesScanned} signatures</li><li>{result.migrationBoundary.known ? "Migration marker is verified from migration evidence." : result.migrationBoundary.source === "first-verified-damm-trade" ? "Migration boundary is a transition region around the first verified DAMM trade." : "Migration evidence is unavailable; no exact marker is claimed."}</li></ul>}
    {historicalOnly && <p className="text-xs text-fg-muted">DBC swaps remain visible as historical context after migration; the active price and current reserves come from verified DAMM v2.</p>}
  </div>;
}
