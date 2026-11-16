import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { DrawingToolType, ChartDrawing, DrawingPoint } from "@/lib/chart/drawing-types";
import { createChartDrawing, drawingLogical, pointAtLogical, FIBONACCI_LEVELS } from "@/lib/chart/drawing-types";
import type { UnicornSetup, FVGZone } from "@/lib/orderflow/fvg-calculator";

import { LiveSeriesSynchronizer, mergeChartCandles, utcSeconds, type ChartCandleData } from "@/lib/chart/live-series";
export type { ChartCandleData } from "@/lib/chart/live-series";

export interface OiProfileLevel {
  readonly strike: number;
  readonly callOi: number;
  readonly putOi: number;
}

export interface TradingViewLightweightChartProps {
  readonly symbol: string;
  readonly intervalMs: number;
  readonly candles: readonly ChartCandleData[];
  readonly historyReady?: boolean;
  readonly datasetKey?: string;
  readonly liveCandle?: ChartCandleData | null;
  readonly activeTool: DrawingToolType;
  readonly onFinishDrawingTool?: () => void;
  readonly isMagnet: boolean;
  readonly drawings: readonly ChartDrawing[];
  readonly onSaveDrawings: (drawings: ChartDrawing[]) => void;
  // Overlays
  readonly showVolume: boolean;
  readonly showVwap: boolean;
  readonly showLtpLevels: boolean;
  readonly showAstroLevels: boolean;
  readonly showLiquidity: boolean;
  readonly showIctUnicorn: boolean;
  readonly showOiProfile: boolean;
  // Overlay Data
  readonly ltpLevels?: readonly { id?: string; name: string; price: number; color: string; dash?: boolean }[];
  readonly astroLevels?: readonly { label: string; price: number; color: string }[];
  readonly liquidityLevels?: { pdh: number; pdl: number; pwh: number; pwl: number } | null;
  readonly unicornSetup?: UnicornSetup | null;
  readonly fvgs?: readonly FVGZone[];
  readonly oiProfile?: readonly OiProfileLevel[];
  readonly onCrosshairMove?: (hud: HudData | null) => void;
  readonly onFitContentRef?: React.MutableRefObject<(() => void) | null>;
  readonly onIsScrolledChange?: (isScrolled: boolean) => void;
  readonly currencySymbol?: string;
  readonly priceScaleMode?: "normal" | "log" | "percent";
  readonly priceAlerts?: readonly {
    id: string;
    targetPrice: number;
    direction?: string;
    condition?: string;
    note?: string;
  }[];
  readonly onAddPriceAlert?: (price: number) => void;
  readonly onAddHorizontalLine?: (price: number) => void;
}

export interface HudData {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
  readonly change: number;
  readonly changePct: number;
}

export function TradingViewLightweightChart({
  symbol,
  intervalMs,
  candles,
  liveCandle,
  historyReady = true,
  datasetKey = `${symbol}:${intervalMs}`,
  activeTool,
  onFinishDrawingTool,
  isMagnet,
  drawings = [],
  onSaveDrawings,
  showVolume,
  showVwap,
  showLtpLevels,
  showAstroLevels,
  showLiquidity,
  showIctUnicorn,
  showOiProfile,
  ltpLevels = [],
  astroLevels = [],
  liquidityLevels,
  unicornSetup,
  fvgs = [],
  oiProfile = [],
  onCrosshairMove,
  onFitContentRef,
  onIsScrolledChange,
  currencySymbol = "₹",
  priceScaleMode = "normal",
  priceAlerts = [],
  onAddPriceAlert,
  onAddHorizontalLine,
}: TradingViewLightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const isScrolledRef = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const loadedDatasetKeyRef = useRef("");
  const synchronizerRef = useRef(new LiveSeriesSynchronizer());
  const chartBarsRef = useRef<readonly ChartCandleData[]>([]);
  const callbacksRef = useRef({ onCrosshairMove, onIsScrolledChange });
  callbacksRef.current = { onCrosshairMove, onIsScrolledChange };
  const mergedCandles = useMemo(() => mergeChartCandles(candles, liveCandle), [candles, liveCandle]);

  // Floating crosshair + quick action context menu
  const [crosshairPos, setCrosshairPos] = useState<{ price: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);

  // Coordinate sync state for SVG drawing overlay
  const [, setViewportTick] = useState(0);
  const forceUpdateViewport = useCallback(() => {
    setViewportTick((t) => (t + 1) % 100000);
  }, []);

  // Selected user drawing for deletion & highlight
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const handleDeleteSelectedDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    onSaveDrawings(drawings.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId, drawings, onSaveDrawings]);

  // Temporary interactive drawing in-progress
  const [currentDrawing, setCurrentDrawing] = useState<{
    type: DrawingToolType;
    start: DrawingPoint;
    current: DrawingPoint;
  } | null>(null);

  const draftRef = useRef<typeof currentDrawing>(null);
  const editRef = useRef<{ id: string; pointIndex: number | null; start: DrawingPoint; original: ChartDrawing } | null>(null);
  const [editedDrawing, setEditedDrawing] = useState<ChartDrawing | null>(null);
  const editedRef = useRef<ChartDrawing | null>(null);

  // Helper to convert timestamp to seconds (UTCTimestamp)
  const toUtcSeconds = useCallback((msOrSec: number): UTCTimestamp => {
    return (msOrSec > 1e11 ? Math.floor(msOrSec / 1000) : Math.floor(msOrSec)) as UTCTimestamp;
  }, []);

  // 1. Initialize Chart Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const istTimeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const istDateFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
    });

    const istYearFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    });

    const istDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const chart = createChart(containerRef.current, {
      localization: {
        locale: "en-IN",
        dateFormat: "dd MMM yyyy",
        priceFormatter: (p: number) => {
          if (!Number.isFinite(p)) return "";
          return `${currencySymbol}${p.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: p < 10 ? 4 : 2,
          })}`;
        },
        timeFormatter: (time: Time) => {
          try {
            let date: Date;
            if (typeof time === "number") {
              date = new Date(time > 1e11 ? time : time * 1000);
            } else if (typeof time === "string") {
              date = new Date(time);
            } else if (typeof time === "object" && time !== null && "year" in time) {
              date = new Date(time.year, time.month - 1, time.day);
            } else {
              return "";
            }
            if (isNaN(date.getTime())) return "";
            return `${istDateTimeFormatter.format(date)} IST`;
          } catch {
            return "";
          }
        },
      },
      layout: {
        background: { color: "#08090C" },
        textColor: "#9CA3AF",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Space Grotesk', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      crosshair: {
        mode: isMagnet ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal,
        vertLine: {
          color: "rgba(229, 184, 105, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#E5B869",
        },
        horzLine: {
          color: "rgba(229, 184, 105, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#E5B869",
        },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        shiftVisibleRangeOnNewBar: true,
        allowShiftVisibleRangeOnWhitespaceReplacement: false,
        barSpacing: 9,
        minBarSpacing: 2,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          try {
            let date: Date;
            if (typeof time === "number") {
              date = new Date(time > 1e11 ? time : time * 1000);
            } else if (typeof time === "string") {
              date = new Date(time);
            } else if (typeof time === "object" && time !== null && "year" in time) {
              date = new Date(time.year, time.month - 1, time.day);
            } else {
              return null;
            }
            if (isNaN(date.getTime())) return null;

            switch (tickMarkType) {
              case TickMarkType.Year:
                return istYearFormatter.format(date);
              case TickMarkType.Month:
                return istDateFormatter.format(date);
              case TickMarkType.DayOfMonth:
                return istDateFormatter.format(date);
              case TickMarkType.Time:
              case TickMarkType.TimeWithSeconds:
              default:
                return istTimeFormatter.format(date);
            }
          } catch {
            return null;
          }
        },
      },
      rightPriceScale: {
        autoScale: true,
        borderVisible: true,
        borderColor: "rgba(255, 255, 255, 0.08)",
        scaleMargins: {
          top: 0.12,
          bottom: 0.18,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;
    synchronizerRef.current = new LiveSeriesSynchronizer();
    loadedDatasetKeyRef.current = "";

    // Add Candlestick Series with pure candlestick autoscale decoupling
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
      priceLineColor: "#E5B869",
    });
    candleSeriesRef.current = candleSeries;

    // Add Volume Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume_overlay",
    });
    chart.priceScale("volume_overlay").applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Add VWAP Series (strictly non-scaling so VWAP never distorts candle Y-axis bounds)
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#8B5CF6",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: () => null,
    });
    vwapSeriesRef.current = vwapSeries;

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
      forceUpdateViewport();
    });
    resizeObserver.observe(containerRef.current);

    // Subscribe to pan & zoom viewport changes
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      forceUpdateViewport();
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      const last = candleSeries.data().length - 1;
      const scrolled = range != null && range.to < last;
      if (isScrolledRef.current !== scrolled) chart.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: !scrolled });
      isScrolledRef.current = scrolled;
      setIsScrolled(scrolled);
      callbacksRef.current.onIsScrolledChange?.(scrolled);
      forceUpdateViewport();
    });

    // Crosshair hover for HUD & Floating Alert Button
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param || !param.time || !param.seriesData) {
        callbacksRef.current.onCrosshairMove?.(null);
        setCrosshairPos(null);
        return;
      }

      if (param.point) {
        const p = candleSeries.coordinateToPrice(param.point.y);
        if (p != null && Number.isFinite(p) && p > 0) {
          setCrosshairPos({ price: Math.round(p * 100) / 100, y: param.point.y });
        } else {
          setCrosshairPos(null);
        }
      } else {
        setCrosshairPos(null);
      }
      const data = param.seriesData.get(candleSeries);
      if (data && "open" in data && "close" in data) {
        const o = Number(data.open);
        const h = Number(data.high);
        const l = Number(data.low);
        const c = Number(data.close);
        const change = c - o;
        const changePct = o > 0 ? (change / o) * 100 : 0;
        const volData = param.seriesData.get(volumeSeries);
        const v = volData && "value" in volData ? Number(volData.value) : null;
        if (callbacksRef.current.onCrosshairMove) {
          callbacksRef.current.onCrosshairMove({
            time: Number(param.time) * 1000,
            open: o,
            high: h,
            low: l,
            close: c,
            volume: v,
            change,
            changePct,
          });
        }
      }
    });

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
    };
  }, [forceUpdateViewport]);

  // Seed the full bootstrap once. Live bars and finalized corrections use update(), never viewport resets.
  useEffect(() => {
    const candle = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const vwap = vwapSeriesRef.current;
    if (!historyReady || !candle || !volume || !vwap || !mergedCandles.length) return;
    const initial = synchronizerRef.current.sync(datasetKey, mergedCandles, { candle, volume, vwap });
    chartBarsRef.current = synchronizerRef.current.candles;
    if (initial && chartRef.current) {
      loadedDatasetKeyRef.current = datasetKey;
      chartRef.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, mergedCandles.length - 90), to: mergedCandles.length + 6 });
    }
    forceUpdateViewport();
  }, [mergedCandles, historyReady, datasetKey, forceUpdateViewport]);

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
    vwapSeriesRef.current?.applyOptions({ visible: showVwap });
  }, [showVolume, showVwap]);

  useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: isMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal } });
  }, [isMagnet]);

  // 4. Manage Price Lines (In-place update to eliminate scale jumping and 1-frame disappearance)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    interface DesiredLine {
      id: string;
      price: number;
      color: string;
      lineWidth: 1 | 2;
      lineStyle: LineStyle;
      title: string;
    }

    const desiredMap = new Map<string, DesiredLine>();

    // AI-LTP Levels
    if (showLtpLevels && ltpLevels.length > 0) {
      for (const l of ltpLevels) {
        desiredMap.set(`ltp-${l.id ?? l.name}`, {
          id: `ltp-${l.id ?? l.name}`,
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: l.dash ? LineStyle.Dashed : LineStyle.Solid,
          title: l.name,
        });
      }
    }

    // Astro Levels: On 1D and 1W, limit to nearest R1 and S1 levels to prevent right-axis label overlapping
    if (showAstroLevels && astroLevels.length > 0) {
      let levelsToRender = astroLevels;
      if (intervalMs >= 86_400_000) {
        const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
        const currentPrice = lastCandle ? lastCandle.close : 0;
        if (currentPrice > 0) {
          const r1s = astroLevels.filter((a) => a.label.includes("R1"));
          const s1s = astroLevels.filter((a) => a.label.includes("S1"));
          const nearestR1 =
            r1s.length > 0
              ? r1s.reduce((prev, curr) =>
                  Math.abs(curr.price - currentPrice) < Math.abs(prev.price - currentPrice)
                    ? curr
                    : prev,
                )
              : null;
          const nearestS1 =
            s1s.length > 0
              ? s1s.reduce((prev, curr) =>
                  Math.abs(curr.price - currentPrice) < Math.abs(prev.price - currentPrice)
                    ? curr
                    : prev,
                )
              : null;
          levelsToRender = [nearestR1, nearestS1].filter(
            (l): l is NonNullable<typeof l> => l != null,
          );
        } else {
          levelsToRender = astroLevels.slice(0, 2);
        }
      }

      for (const a of levelsToRender) {
        desiredMap.set(`astro-${a.label}`, {
          id: `astro-${a.label}`,
          price: a.price,
          color: a.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          title: a.label,
        });
      }
    }

    // Session Liquidity (PDH / PDL / PWH / PWL)
    if (showLiquidity && liquidityLevels) {
      if (liquidityLevels.pdh > 0) {
        desiredMap.set("liq-pdh", {
          id: "liq-pdh",
          price: liquidityLevels.pdh,
          color: "#06B6D4",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: `PDH ${liquidityLevels.pdh.toLocaleString("en-IN")}`,
        });
      }
      if (liquidityLevels.pdl > 0) {
        desiredMap.set("liq-pdl", {
          id: "liq-pdl",
          price: liquidityLevels.pdl,
          color: "#F43F5E",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: `PDL ${liquidityLevels.pdl.toLocaleString("en-IN")}`,
        });
      }
    }

    // ICT Unicorn Auto Entry, Hard SL, TP1, TP2, TP3
    if (showIctUnicorn && unicornSetup) {
      const entry = unicornSetup.entryPrice;
      const sl = unicornSetup.invalidationSL;
      const isBull = unicornSetup.direction === "BULLISH";
      const risk = Math.abs(entry - sl);

      const tp1 = isBull ? entry + 1.5 * risk : entry - 1.5 * risk;
      const tp2 = isBull ? entry + 2.5 * risk : entry - 2.5 * risk;
      const tp3 = isBull ? entry + 4.0 * risk : entry - 4.0 * risk;

      desiredMap.set("unicorn-entry", {
        id: "unicorn-entry",
        price: entry,
        color: "#E5B869",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: `ENTRY ${entry.toLocaleString("en-IN")}`,
      });
      desiredMap.set("unicorn-sl", {
        id: "unicorn-sl",
        price: sl,
        color: "#EF4444",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: `HARD SL ${sl.toLocaleString("en-IN")}`,
      });
      desiredMap.set("unicorn-tp1", {
        id: "unicorn-tp1",
        price: tp1,
        color: "#10B981",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `TP1 (1.5R) ${tp1.toFixed(1)}`,
      });
      desiredMap.set("unicorn-tp2", {
        id: "unicorn-tp2",
        price: tp2,
        color: "#06B6D4",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `TP2 (2.5R) ${tp2.toFixed(1)}`,
      });
      desiredMap.set("unicorn-tp3", {
        id: "unicorn-tp3",
        price: tp3,
        color: "#8B5CF6",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: `TP3 (4.0R) ${tp3.toFixed(1)}`,
      });
    }

    // Active price alerts from right dock / crosshair trigger
    if (priceAlerts && priceAlerts.length > 0) {
      for (const alt of priceAlerts) {
        if (!alt || !Number.isFinite(alt.targetPrice) || alt.targetPrice <= 0) continue;
        const lineId = `alert-${alt.id}`;
        desiredMap.set(lineId, {
          id: lineId,
          price: alt.targetPrice,
          color: "#F59E0B",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: `🔔 Alert ${alt.targetPrice}`,
        });
      }
    }

    // 1. Remove obsolete lines
    for (const [id, line] of priceLinesMapRef.current.entries()) {
      if (!desiredMap.has(id)) {
        try {
          series.removePriceLine(line);
        } catch {
          // ignore
        }
        priceLinesMapRef.current.delete(id);
      }
    }

    // 2. Add or in-place update existing lines
    for (const [id, desired] of desiredMap.entries()) {
      if (!Number.isFinite(desired.price)) continue;
      const existing = priceLinesMapRef.current.get(id);
      try {
        if (existing) {
          existing.applyOptions({
            price: desired.price,
            color: desired.color,
            lineWidth: desired.lineWidth,
            lineStyle: desired.lineStyle,
            title: desired.title,
          });
        } else {
          const created = series.createPriceLine({
            price: desired.price,
            color: desired.color,
            lineWidth: desired.lineWidth,
            lineStyle: desired.lineStyle,
            title: desired.title,
            axisLabelVisible: true,
          });
          priceLinesMapRef.current.set(id, created);
        }
      } catch (err) {
        console.warn(`[Chart] Error updating price line ${id}:`, err);
      }
    }
  }, [
    showLtpLevels,
    ltpLevels,
    showAstroLevels,
    astroLevels,
    showLiquidity,
    liquidityLevels,
    showIctUnicorn,
    unicornSetup,
    priceAlerts,
  ]);

  // Apply Price Scale Mode (% | log | normal)
  useEffect(() => {
    if (!chartRef.current) return;
    const mode =
      priceScaleMode === "log"
        ? PriceScaleMode.Logarithmic
        : priceScaleMode === "percent"
          ? PriceScaleMode.Percentage
          : PriceScaleMode.Normal;
    try {
      chartRef.current.priceScale("right").applyOptions({ mode });
    } catch {
      // ignore
    }
  }, [priceScaleMode]);

  // Logical indices remain valid in future whitespace; stored anchors rebase after a reload.
  const getCoordinates = useCallback((point: DrawingPoint): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const logical = drawingLogical(point, chartBarsRef.current, intervalMs);
    const x = logical != null ? chart.timeScale().logicalToCoordinate(logical as import("lightweight-charts").Logical)
      : chart.timeScale().timeToCoordinate(toUtcSeconds(point.time));
    const y = series.priceToCoordinate(point.price);
    return x != null && y != null ? { x: Number(x), y: Number(y) } : null;
  }, [intervalMs, toUtcSeconds]);

  const dragStartRef = useRef<{ x: number; y: number; point: DrawingPoint } | null>(null);
  const setDraft = (draft: typeof currentDrawing) => { draftRef.current = draft; setCurrentDrawing(draft); };
  const capturePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || x > chart.timeScale().width()) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical == null || price == null || !Number.isFinite(price)) return null;
    const point = pointAtLogical(Number(logical), Number(price), chartBarsRef.current, intervalMs);
    return point ? { x, y, point } : null;
  };
  const completeDrawingWith = (type: DrawingToolType, first: DrawingPoint, second: DrawingPoint) => {
    onSaveDrawings([...drawings, createChartDrawing(type, first, second, `draw-${crypto.randomUUID()}`)]);
    setDraft(null);
    dragStartRef.current = null;
    onFinishDrawingTool?.();
  };

  useEffect(() => {
    const disabled = activeTool !== "cursor" || editedDrawing != null;
    chartRef.current?.applyOptions({ handleScroll: { mouseWheel: !disabled, pressedMouseMove: !disabled,
      horzTouchDrag: !disabled, vertTouchDrag: !disabled },
      handleScale: { axisPressedMouseMove: !disabled, mouseWheel: !disabled, pinch: !disabled } });
    if (draftRef.current && draftRef.current.type !== activeTool) { draftRef.current = null; setCurrentDrawing(null); }
  }, [activeTool, editedDrawing != null]);

  const handleSvgPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const captured = capturePoint(event);
    if (!captured) return;
    const target = event.target as SVGElement;
    if (activeTool === "cursor") {
      const id = target.closest("[data-drawing-id]")?.getAttribute("data-drawing-id");
      const drawing = drawings.find((d) => d.id === id);
      if (!drawing) { setSelectedDrawingId(null); return; }
      event.stopPropagation();
      event.preventDefault();
      const pointIndex = target.getAttribute("data-point-index");
      editRef.current = { id: drawing.id, original: drawing, start: captured.point,
        pointIndex: pointIndex != null ? Number(pointIndex) : null };
      editedRef.current = drawing;
      setEditedDrawing(drawing);
      setSelectedDrawingId(drawing.id);
    } else {
      event.preventDefault();
      if (activeTool === "horizontal") {
        onSaveDrawings([...drawings, { id: `h-${crypto.randomUUID()}`, type: "horizontal", points: [captured.point], color: "#E5B869", isComplete: true }]);
        onFinishDrawingTool?.();
        return;
      }
      if (draftRef.current) { completeDrawingWith(draftRef.current.type, draftRef.current.start, captured.point); return; }
      setDraft({ type: activeTool, start: captured.point, current: captured.point });
      dragStartRef.current = captured;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSvgPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const captured = capturePoint(event);
    if (!captured) return;
    const edit = editRef.current;
    if (edit) {
      const deltaLogical = captured.point.logical! - edit.start.logical!;
      const deltaPrice = captured.point.price - edit.start.price;
      const points = edit.original.points.map((point, index) => {
        if (edit.pointIndex != null) return index === edit.pointIndex ? captured.point : point;
        const logical = drawingLogical(point, chartBarsRef.current, intervalMs);
        return logical == null ? point : pointAtLogical(logical + deltaLogical, point.price + deltaPrice, chartBarsRef.current, intervalMs) ?? point;
      });
      const next = { ...edit.original, points };
      editedRef.current = next;
      setEditedDrawing(next);
    } else if (draftRef.current) setDraft({ ...draftRef.current, current: captured.point });
  };
  const handleSvgPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (editRef.current && editedRef.current) {
      onSaveDrawings(drawings.map((d) => d.id === editedRef.current!.id ? editedRef.current! : d));
      editRef.current = null;
      editedRef.current = null;
      setEditedDrawing(null);
    } else {
      const end = capturePoint(event);
      const start = dragStartRef.current;
      const draft = draftRef.current;
      if (end && start && draft && Math.hypot(end.x - start.x, end.y - start.y) > 8)
        completeDrawingWith(draft.type, draft.start, end.point);
      dragStartRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelGesture = () => {
    setDraft(null); editRef.current = null; editedRef.current = null; dragStartRef.current = null; setEditedDrawing(null);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "Escape") { cancelGesture(); onFinishDrawingTool?.(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedDrawingId) {
        event.preventDefault(); handleDeleteSelectedDrawing();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDrawingId, handleDeleteSelectedDrawing, onFinishDrawingTool]);

  // Reset / Auto-Fit Viewport
  const handleResetViewport = useCallback(() => {
    if (chartRef.current) {
      isScrolledRef.current = false;
      chartRef.current.priceScale("right").applyOptions({ autoScale: true });
      chartRef.current.timeScale().applyOptions({ shiftVisibleRangeOnNewBar: true });
      chartRef.current.timeScale().scrollToRealTime();
      setIsScrolled(false);
      onIsScrolledChange?.(false);
      forceUpdateViewport();
    }
  }, [forceUpdateViewport, onIsScrolledChange]);

  // Expose fitContent to parent ref
  useEffect(() => {
    if (onFitContentRef) {
      onFitContentRef.current = handleResetViewport;
    }
    return () => {
      if (onFitContentRef) onFitContentRef.current = null;
    };
  }, [onFitContentRef, handleResetViewport]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current || !candleSeriesRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const p = candleSeriesRef.current.coordinateToPrice(y);
    if (p != null && Number.isFinite(p) && p > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        price: Math.round(p * 100) / 100,
      });
    }
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      onContextMenu={handleContextMenu}
      onPointerDown={(event) => { if (activeTool === "cursor" && !(event.target as Element).closest("[data-drawing-id]")) setSelectedDrawingId(null); }}
      className="relative w-full h-full flex-1 min-h-0 bg-[#08090C] overflow-hidden select-none"
    >
      {/* Chart Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Synchronized Interactive SVG Layer */}
      <svg
        className={`absolute inset-0 w-full h-full pointer-events-none ${
          activeTool !== "cursor" ? "pointer-events-auto cursor-crosshair" : ""
        }`}
        style={{ touchAction: activeTool !== "cursor" || editedDrawing ? "none" : "auto" }}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerCancel={cancelGesture}
      >
        <defs>
          <linearGradient id="bullFvgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="bearFvgGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* 1. Fair Value Gaps (FVG) Boxes */}
        {showIctUnicorn &&
          Array.isArray(fvgs) &&
          fvgs.map((fvg, i) => {
            if (!chartRef.current || !candleSeriesRef.current) return null;
            if (!fvg || !Number.isFinite(fvg.high) || !Number.isFinite(fvg.low)) return null;
            const topY = candleSeriesRef.current.priceToCoordinate(fvg.high);
            const botY = candleSeriesRef.current.priceToCoordinate(fvg.low);
            if (topY == null || botY == null || !Number.isFinite(topY) || !Number.isFinite(botY)) return null;

            const height = Math.abs(botY - topY);
            const y = Math.min(topY, botY);
            const isBull = fvg.high > fvg.low;

            return (
              <g key={`fvg-${i}`}>
                <rect
                  x="60"
                  y={y}
                  width="85%"
                  height={Math.max(height, 2)}
                  fill={isBull ? "url(#bullFvgGrad)" : "url(#bearFvgGrad)"}
                  stroke={isBull ? "#10B981" : "#F43F5E"}
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  opacity="0.85"
                />
                <text
                  x="70"
                  y={y + 12}
                  fill={isBull ? "#10B981" : "#F43F5E"}
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {isBull ? "BULLISH FVG (Discount)" : "BEARISH FVG (Premium)"} [
                  {fvg.low.toFixed(1)} - {fvg.high.toFixed(1)}]
                </text>
              </g>
            );
          })}

        {/* 2. Live OI Profile Horizontal Bars on Right Axis (Constrained max-w-[110px]) */}
        {showOiProfile &&
          Array.isArray(oiProfile) &&
          (() => {
            const maxOi = Math.max(
              1,
              ...oiProfile.map((p) => Math.max(Number.isFinite(p?.callOi) ? p.callOi : 0, Number.isFinite(p?.putOi) ? p.putOi : 0))
            );
            return oiProfile.map((oi, i) => {
              if (!candleSeriesRef.current || !oi || !Number.isFinite(oi.strike)) return null;
              const y = candleSeriesRef.current.priceToCoordinate(oi.strike);
              if (y == null || !Number.isFinite(y)) return null;

              const maxBarWidth = 85; // Constrained width so bars never block candles or drag physics
              const callOiVal = Number.isFinite(oi.callOi) ? oi.callOi : 0;
              const putOiVal = Number.isFinite(oi.putOi) ? oi.putOi : 0;
              const callWidth = Math.max(0, Math.min(maxBarWidth, (callOiVal / maxOi) * maxBarWidth));
              const putWidth = Math.max(0, Math.min(maxBarWidth, (putOiVal / maxOi) * maxBarWidth));

              return (
                <g key={`oi-${oi.strike}-${i}`} className="pointer-events-none select-none">
                  {/* Put OI Bar (Green) */}
                  <rect
                    x={`calc(100% - ${putWidth + 50}px)`}
                    y={y - 5}
                    width={putWidth}
                    height="4"
                    fill="#10B981"
                    opacity="0.65"
                    rx="1"
                  />
                  {/* Call OI Bar (Red) */}
                  <rect
                    x={`calc(100% - ${callWidth + 50}px)`}
                    y={y + 1}
                    width={callWidth}
                    height="4"
                    fill="#F43F5E"
                    opacity="0.65"
                    rx="1"
                  />
                  <text
                    x="calc(100% - 46px)"
                    y={y + 3}
                    fill="#9CA3AF"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {oi.strike}
                  </text>
                </g>
              );
            });
          })()}

        {/* 3. Persistent User Drawings */}
        {[...(drawings || []).map((d) => editedDrawing?.id === d.id ? editedDrawing : d),
          ...(currentDrawing ? [{ id: "draft-preview", type: currentDrawing.type, points: [currentDrawing.start, currentDrawing.current], color: "#E5B869", isComplete: false } as ChartDrawing] : [])].map((d) => {
          if (!d || !d.points || d.points.length === 0) return null;
          const coords: { x: number; y: number }[] = [];
          for (const pt of d.points) {
            if (!pt || !Number.isFinite(pt.price) || !Number.isFinite(pt.time)) continue;
            const c = getCoordinates(pt);
            if (c) coords.push(c);
          }
          if (coords.length === 0) return null;
          const c0 = coords[0];
          const isSelected = d.id === selectedDrawingId;

          if (d.type === "horizontal" && c0) {
            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                {/* Wider invisible stroke for easy clicking */}
                <line
                  x1="0"
                  y1={c0.y}
                  x2="100%"
                  y2={c0.y}
                  stroke="transparent"
                  strokeWidth="12"
                />
                <line
                  x1="0"
                  y1={c0.y}
                  x2="100%"
                  y2={c0.y}
                  stroke={isSelected ? "#38BDF8" : d.color}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                  strokeDasharray="4 2"
                />
                {isSelected && (
                  <circle
                    cx="70"
                    cy={c0.y}
                    r="4.5"
                    fill="#38BDF8"
                    stroke="#08090C"
                    strokeWidth="1.5"
                  />
                )}
                <text
                  x="80"
                  y={c0.y - 4}
                  fill={isSelected ? "#38BDF8" : d.color}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {d.label ?? `Level: ${Number.isFinite(d.points?.[0]?.price) ? d.points[0].price.toFixed(1) : ""}`}
                </text>
              </g>
            );
          }

          if (coords.length < 2) return null;
          const c1 = coords[0];
          const c2 = coords[1];
          if (!c1 || !c2) return null;

          if (d.type === "trendline") {
            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                <line
                  x1={c1.x}
                  y1={c1.y}
                  x2={c2.x}
                  y2={c2.y}
                  stroke="transparent"
                  strokeWidth="12"
                />
                <line
                  x1={c1.x}
                  y1={c1.y}
                  x2={c2.x}
                  y2={c2.y}
                  stroke={isSelected ? "#38BDF8" : d.color}
                  strokeWidth={isSelected ? "3" : "2"}
                />
                {isSelected && (
                  <>
                    <circle cx={c1.x} cy={c1.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                    <circle cx={c2.x} cy={c2.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }

          if (d.type === "rectangle") {
            const x = Math.min(c1.x, c2.x);
            const y = Math.min(c1.y, c2.y);
            const w = Math.abs(c2.x - c1.x);
            const h = Math.abs(c2.y - c1.y);
            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={isSelected ? "rgba(56, 189, 248, 0.25)" : "rgba(6, 182, 212, 0.15)"}
                  stroke={isSelected ? "#38BDF8" : d.color}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                {isSelected && (
                  <>
                    <circle cx={c1.x} cy={c1.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                    <circle cx={c2.x} cy={c2.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }

          if (d.type === "fibonacci") {
            if (!d.points[0] || !d.points[1] || !Number.isFinite(d.points[0].price) || !Number.isFinite(d.points[1].price)) return null;
            const priceLow = Math.min(d.points[0].price, d.points[1].price);
            const priceHigh = Math.max(d.points[0].price, d.points[1].price);
            const diff = priceHigh - priceLow;

            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                {FIBONACCI_LEVELS.map((fib) => {
                  if (!candleSeriesRef.current) return null;
                  const price = priceLow + diff * fib.ratio;
                  const fibY = candleSeriesRef.current.priceToCoordinate(price);
                  if (fibY == null) return null;
                  return (
                    <g key={fib.ratio}>
                      <line
                        x1={Math.min(c1.x, c2.x)}
                        y1={fibY}
                        x2="95%"
                        y2={fibY}
                        stroke={isSelected ? "#38BDF8" : fib.color}
                        strokeWidth={fib.ratio === 0.618 || fib.ratio === 0.5 ? "2" : "1"}
                        strokeDasharray={fib.ratio === 0.618 ? "0" : "4 2"}
                      />
                      <text
                        x={Math.min(c1.x, c2.x) + 5}
                        y={fibY - 4}
                        fill={isSelected ? "#38BDF8" : fib.color}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {fib.label} ({Number.isFinite(price) ? price.toFixed(1) : ""})
                      </text>
                    </g>
                  );
                })}
                {isSelected && (
                  <>
                    <circle cx={c1.x} cy={c1.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                    <circle cx={c2.x} cy={c2.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }

          if (d.type === "riskRewardLong" || d.type === "riskRewardShort") {
            if (!d.points[0] || !d.points[1]) return null;
            const isLong = d.type === "riskRewardLong";
            const x = Math.min(c1.x, c2.x);
            const w = Math.abs(c2.x - c1.x) || 120;
            const entryY = c1.y;
            const entry = d.points[0].price;
            const risk = Math.abs(d.points[1].price - entry);
            const stop = d.isComplete ? d.points[1].price : entry + (isLong ? -risk : risk);
            const target = d.points[2]?.price ?? entry + (isLong ? risk * 2 : -risk * 2);
            const slY = Number(candleSeriesRef.current?.priceToCoordinate(stop) ?? c2.y);
            const targetY = Number(candleSeriesRef.current?.priceToCoordinate(target) ?? c1.y);
            const reward = Math.abs(target - entry);
            const rr = risk > 0 ? reward / risk : 0;

            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                {/* Target Box (Green) */}
                <rect
                  x={x}
                  y={Math.min(entryY, targetY)}
                  width={w}
                  height={Math.abs(targetY - entryY)}
                  fill="rgba(16, 185, 129, 0.2)"
                  stroke="#10B981"
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                {/* Stop Loss Box (Red) */}
                <rect
                  x={x}
                  y={Math.min(entryY, slY)}
                  width={w}
                  height={Math.abs(slY - entryY)}
                  fill="rgba(239, 68, 68, 0.2)"
                  stroke="#EF4444"
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                <text
                  x={x + 6}
                  y={entryY - 4}
                  fill="#E5B869"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  R:R {rr.toFixed(2)} ? TP {entry ? (reward / entry * 100).toFixed(2) : "0"}% ? SL {entry ? (risk / entry * 100).toFixed(2) : "0"}%
                </text>
                {isSelected && (
                  <>
                    <circle cx={c1.x} cy={c1.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                    <circle cx={c2.x} cy={c2.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }

          if (d.type === "ruler") {
            if (!d.points[0] || !d.points[1] || !Number.isFinite(d.points[0].price) || !Number.isFinite(d.points[1].price)) return null;
            const pDiff = d.points[1].price - d.points[0].price;
            const pPct = d.points[0].price > 0 ? (pDiff / d.points[0].price) * 100 : 0;
            return (
              <g
                key={d.id}
                data-drawing-id={d.id}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDrawingId(d.id);
                }}
                style={{
                  pointerEvents: d.isComplete ? "auto" : "none",
                  filter: isSelected ? "drop-shadow(0 0 6px #38BDF8)" : undefined,
                }}
              >
                <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={isSelected ? "#38BDF8" : "#38BDF8"} strokeWidth={isSelected ? "2.5" : "1.5"} />
                <rect
                  x={Math.min(c1.x, c2.x) + 10}
                  y={Math.min(c1.y, c2.y) + 10}
                  width="130"
                  height="48"
                  fill="#0E1015"
                  stroke="#38BDF8"
                  strokeWidth={isSelected ? "2" : "1"}
                  rx="4"
                />
                <text
                  x={Math.min(c1.x, c2.x) + 18}
                  y={Math.min(c1.y, c2.y) + 26}
                  fill="#38BDF8"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  Δ {pDiff > 0 ? `+${pDiff.toFixed(1)}` : pDiff.toFixed(1)} (
                  {pPct > 0 ? `+${pPct.toFixed(2)}%` : `${pPct.toFixed(2)}%`})
                  <tspan x={Math.min(c1.x, c2.x) + 18} dy="14">{Math.abs(Math.round((drawingLogical(d.points[1], chartBarsRef.current, intervalMs) ?? 0) - (drawingLogical(d.points[0], chartBarsRef.current, intervalMs) ?? 0)))} bars</tspan>
                </text>
                {isSelected && (
                  <>
                    <circle cx={c1.x} cy={c1.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                    <circle cx={c2.x} cy={c2.y} r="4.5" fill="#38BDF8" stroke="#08090C" strokeWidth="1.5" />
                  </>
                )}
              </g>
            );
          }

          return null;
        })}

        {/* Selected endpoints sit above hit targets for precise resizing. */}
        {(() => {
          const selected = editedDrawing ?? drawings.find((d) => d.id === selectedDrawingId);
          return selected?.points.map((point, index) => {
            const coordinate = getCoordinates(point);
            return coordinate ? <circle key={`handle-${index}`} data-drawing-id={selected.id} data-point-index={index}
              aria-label={`Drawing endpoint ${index + 1}`} cx={coordinate.x} cy={coordinate.y} r={6}
              fill="#E5B869" stroke="#08090C" strokeWidth={2} className="pointer-events-auto cursor-move" /> : null;
          });
        })()}
      </svg>

      {isScrolled && <button type="button" onClick={handleResetViewport}
        className="absolute bottom-8 right-20 z-30 rounded border border-amber-500/50 bg-zinc-950/95 px-3 py-1.5 font-mono text-xs text-amber-300"
        aria-label="Scroll to Real-Time">&#x23E9; Scroll to Real-Time</button>}
      {/* Floating Selected Drawing Action Pill */}
      {selectedDrawingId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950/95 border border-sky-500/60 shadow-2xl backdrop-blur-md">
          <span className="text-xs font-mono font-medium text-sky-400">Drawing Selected</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteSelectedDrawing();
            }}
            className="px-2.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/40 text-xs font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            title="Delete Selected Drawing (Delete or Backspace)"
          >
            <span>🗑</span> Delete
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDrawingId(null);
            }}
            className="text-zinc-400 hover:text-zinc-100 text-xs cursor-pointer ml-1"
            title="Deselect"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating [+] Add Alert Button next to price scale on crosshair move */}
      {crosshairPos != null && !contextMenu && (
        <div
          style={{ top: `${Math.max(10, crosshairPos.y - 12)}px` }}
          className="absolute right-[56px] z-30 flex items-center pointer-events-auto"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({
                x: Math.max(10, e.clientX - 220),
                y: Math.max(10, e.clientY - 60),
                price: crosshairPos.price,
              });
            }}
            className="group flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950/90 border border-amber-500/50 text-amber-300 hover:bg-amber-500 hover:text-black font-mono text-[11px] font-bold shadow-xl transition-all cursor-pointer backdrop-blur-sm"
            title={`Add alert or line at ${currencySymbol}${crosshairPos.price}`}
          >
            <span className="text-sm leading-none font-bold">+</span>
            <span className="text-[10px] hidden group-hover:inline font-mono">
              {crosshairPos.price}
            </span>
          </button>
        </div>
      )}

      {/* TradingView-Style Quick Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-zinc-950/95 border border-amber-500/40 rounded-xl p-1.5 shadow-2xl min-w-[230px] font-mono text-xs select-none backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] text-zinc-400 border-b border-white/10 font-semibold flex items-center justify-between">
            <span>
              {symbol} @ {currencySymbol}
              {contextMenu.price}
            </span>
            <button
              type="button"
              onClick={() => setContextMenu(null)}
              className="text-zinc-500 hover:text-zinc-200 cursor-pointer text-xs"
            >
              ✕
            </button>
          </div>
          <div className="py-1 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => {
                const p = contextMenu.price;
                setContextMenu(null);
                onAddPriceAlert?.(p);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 hover:text-amber-300 text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>🔔</span>
              <span>
                Add Alert at {currencySymbol}
                {contextMenu.price}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                const p = contextMenu.price;
                setContextMenu(null);
                onAddHorizontalLine?.(p);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 hover:text-zinc-100 text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>➖</span>
              <span>Draw Horizontal Line</span>
            </button>
            {selectedDrawingId && (
              <button
                type="button"
                onClick={() => {
                  setContextMenu(null);
                  handleDeleteSelectedDrawing();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-300 text-rose-400 flex items-center gap-2 cursor-pointer transition-colors border-t border-white/5 pt-2"
              >
                <span>🗑</span>
                <span>Delete Selected Drawing</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
