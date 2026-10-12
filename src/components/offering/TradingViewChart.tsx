"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, HistogramData, IChartApi, ISeriesApi, LineData, UTCTimestamp } from "lightweight-charts";
import { formatPriceAxis, formatTokenPrice } from "@/lib/marketDisplay";
import type { HistoryCandle, HistoricalTrade, MarketHistory } from "@/lib/market/history";

type Props = {
  trades: HistoricalTrade[];
  candles: HistoryCandle[];
  mode: "line" | "candles";
  quoteLabel: string;
  currentPrice: string | null;
  currentPriceVenue: string | null;
  boundary: MarketHistory["migrationBoundary"];
};

function toUnix(value: number): UTCTimestamp {
  const seconds = value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  return seconds as UTCTimestamp;
}

function priceNumber(value: string): number | null {
  const parsed = Number(value);
  return parsed > 0 && Number.isFinite(parsed) ? parsed : null;
}

function formatQuote(value: number, quote: string): string {
  return formatTokenPrice(value, quote).secondary;
}

/** TradingView's open-source chart. Custom pool prices have no TradingView symbol, so the series is our confirmed OHLCV. */
export function TradingViewChart({ trades, candles, mode, quoteLabel, currentPrice, currentPriceVenue, boundary }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const spot = currentPrice ? priceNumber(currentPrice) : null;

  const resting = useMemo(() => {
    if (mode === "candles" && candles.length > 0) {
      const last = candles[candles.length - 1];
      const open = priceNumber(last.open);
      const high = priceNumber(last.high);
      const low = priceNumber(last.low);
      const close = priceNumber(last.close);
      if (open == null || high == null || low == null || close == null) return null;
      return `O ${formatQuote(open, quoteLabel)}  H ${formatQuote(high, quoteLabel)}  L ${formatQuote(low, quoteLabel)}  C ${formatQuote(close, quoteLabel)}`;
    }
    const last = trades.at(-1);
    const price = last ? priceNumber(last.priceQuotePerToken) : null;
    return price == null ? null : formatQuote(price, quoteLabel);
  }, [candles, mode, quoteLabel, trades]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const priceRows = mode === "candles" ? candles : trades;
    if (priceRows.length === 0) return;

    let chart: IChartApi | undefined;
    let cancelled = false;

    void import("lightweight-charts").then((lc) => {
      if (cancelled || !container.isConnected) return;
      const samples = (mode === "candles" ? candles.flatMap((candle) => [candle.high, candle.low]) : trades.map((trade) => trade.priceQuotePerToken))
        .map(priceNumber)
        .filter((value): value is number => value != null);
      const min = samples.length ? Math.min(...samples) : 1e-8;
      const decimals = Math.min(12, Math.max(4, Math.ceil(-Math.log10(min > 0 ? min : 1e-8)) + 3));
      const base = 10 ** decimals;

      chart = lc.createChart(container, {
        autoSize: true,
        height: 420,
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0D1215" },
          textColor: "#899B9F",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 12,
        },
        grid: {
          vertLines: { color: "#2C393E" },
          horzLines: { color: "#2C393E" },
        },
        crosshair: { mode: lc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#2C393E" },
        timeScale: { borderColor: "#2C393E", timeVisible: true, secondsVisible: false },
        localization: {
          priceFormatter: (price: number) => formatPriceAxis(price, quoteLabel),
        },
      });

      const priceFormat = {
        type: "custom" as const,
        minMove: 1 / base,
        base,
        formatter: (price: number) => formatPriceAxis(price, quoteLabel),
      };
      let priceSeries: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;
      if (mode === "candles") {
        const series = chart.addSeries(lc.CandlestickSeries, {
          upColor: "#6DE0C5",
          downColor: "#F87171",
          borderUpColor: "#6DE0C5",
          borderDownColor: "#F87171",
          wickUpColor: "#6DE0C5",
          wickDownColor: "#F87171",
          priceFormat,
        });
        const bars = new Map<number, CandlestickData<UTCTimestamp>>();
        for (const candle of candles) {
          const open = priceNumber(candle.open);
          const high = priceNumber(candle.high);
          const low = priceNumber(candle.low);
          const close = priceNumber(candle.close);
          if (open == null || high == null || low == null || close == null) continue;
          bars.set(toUnix(candle.startTime) as number, { time: toUnix(candle.startTime), open, high, low, close });
        }
        series.setData([...bars.values()].sort((a, b) => (a.time as number) - (b.time as number)));
        priceSeries = series;
      } else {
        const series = chart.addSeries(lc.LineSeries, {
          color: "#6DE0C5",
          lineWidth: 2,
          priceFormat,
        });
        const points = new Map<number, LineData<UTCTimestamp>>();
        for (const trade of trades) {
          const value = priceNumber(trade.priceQuotePerToken);
          if (value == null) continue;
          points.set(toUnix(trade.blockTime) as number, { time: toUnix(trade.blockTime), value });
        }
        series.setData([...points.values()].sort((a, b) => (a.time as number) - (b.time as number)));
        priceSeries = series;
      }

      const volume = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      priceSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
      const volumeBars = new Map<number, HistogramData<UTCTimestamp>>();
      for (const candle of candles) {
        const value = Number(candle.quoteVolume);
        if (!Number.isFinite(value)) continue;
        const open = priceNumber(candle.open);
        const close = priceNumber(candle.close);
        volumeBars.set(toUnix(candle.startTime) as number, {
          time: toUnix(candle.startTime),
          value: value > 0 ? value : 0,
          color: open != null && close != null && close < open ? "rgba(248, 113, 113, 0.55)" : "rgba(109, 224, 197, 0.55)",
        });
      }
      volume.setData([...volumeBars.values()].sort((a, b) => (a.time as number) - (b.time as number)));

      if (spot != null) {
        priceSeries.createPriceLine({
          price: spot,
          color: "#E8C547",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: currentPriceVenue ? `${currentPriceVenue} spot` : "Spot",
        });
      }

      const markerTime = boundary.blockTime ?? boundary.transitionStartTime;
      if (markerTime != null) {
        lc.createSeriesMarkers(priceSeries, [{
          time: toUnix(markerTime),
          position: "aboveBar",
          color: "#E8C547",
          shape: "circle",
          text: "DAMM v2",
        }]);
      }

      chart.timeScale().fitContent();
      if (cancelled) {
        chart.remove();
        return;
      }
      chart.subscribeCrosshairMove((param) => {
        if (cancelled) return;
        const bar = param.seriesData.get(priceSeries);
        if (!bar) {
          setHover(null);
          return;
        }
        if ("open" in bar && "high" in bar && "low" in bar && "close" in bar) {
          setHover(`O ${formatQuote(bar.open, quoteLabel)}  H ${formatQuote(bar.high, quoteLabel)}  L ${formatQuote(bar.low, quoteLabel)}  C ${formatQuote(bar.close, quoteLabel)}`);
          return;
        }
        if ("value" in bar) setHover(formatQuote(bar.value, quoteLabel));
      });
    }).catch(() => {
      if (!cancelled) setHover("Chart failed to load");
    });

    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [boundary.blockTime, boundary.transitionStartTime, candles, currentPriceVenue, mode, quoteLabel, spot, trades]);

  if ((mode === "candles" ? candles.length : trades.length) === 0) {
    return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-fg-muted">No confirmed swaps in this range. Empty periods are left blank.</div>;
  }

  return (
    <div data-testid="trading-terminal">
      <p className="mb-2 min-h-5 font-mono text-xs text-fg-secondary" aria-live="polite">{hover ?? resting ?? `Price in ${quoteLabel}`}</p>
      <div ref={containerRef} className="h-[420px] w-full" role="img" aria-label={`TradingView ${mode === "candles" ? "candlestick" : "line"} terminal priced in ${quoteLabel}`} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />Up candle / DBC</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-signal-danger" />Down candle</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />Current {currentPriceVenue ?? "active venue"} spot</span>
        <span>Volume bars are quote volume. Axis prices are {quoteLabel} per token.</span>
      </div>
    </div>
  );
}
