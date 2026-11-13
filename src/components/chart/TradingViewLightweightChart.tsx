import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
  type MouseEventParams,
  type AutoscaleInfoProvider,
} from "lightweight-charts";
import type { DrawingToolType, ChartDrawing, DrawingPoint } from "@/lib/chart/drawing-types";
import { FIBONACCI_LEVELS } from "@/lib/chart/drawing-types";
import type { UnicornSetup, FVGZone } from "@/lib/orderflow/fvg-calculator";

export interface ChartCandleData {
  readonly time: number; // UNIX timestamp in ms or seconds
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number | null;
}

export interface OiProfileLevel {
  readonly strike: number;
  readonly callOi: number;
  readonly putOi: number;
}

export interface TradingViewLightweightChartProps {
  readonly symbol: string;
  readonly intervalMs: number;
  readonly candles: readonly ChartCandleData[];
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
  readonly ltpLevels?: readonly { name: string; price: number; color: string; dash?: boolean }[];
  readonly astroLevels?: readonly { label: string; price: number; color: string }[];
  readonly liquidityLevels?: { pdh: number; pdl: number; pwh: number; pwl: number } | null;
  readonly unicornSetup?: UnicornSetup | null;
  readonly fvgs?: readonly FVGZone[];
  readonly oiProfile?: readonly OiProfileLevel[];
  readonly onCrosshairMove?: (hud: HudData | null) => void;
  readonly onFitContentRef?: React.MutableRefObject<(() => void) | null>;
  readonly onIsScrolledChange?: (isScrolled: boolean) => void;
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
  activeTool,
  onFinishDrawingTool,
  isMagnet,
  drawings,
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
}: TradingViewLightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const isScrolledRef = useRef(false);

  // Coordinate sync state for SVG drawing overlay
  const [, setViewportTick] = useState(0);
  const forceUpdateViewport = useCallback(() => {
    setViewportTick((t) => (t + 1) % 100000);
  }, []);

  // Temporary interactive drawing in-progress
  const [currentDrawing, setCurrentDrawing] = useState<{
    type: DrawingToolType;
    start: DrawingPoint;
    current: DrawingPoint;
  } | null>(null);

  // Helper to convert timestamp to seconds (UTCTimestamp)
  const toUtcSeconds = useCallback((msOrSec: number): UTCTimestamp => {
    return (msOrSec > 1e11 ? Math.floor(msOrSec / 1000) : Math.floor(msOrSec)) as UTCTimestamp;
  }, []);

  // 1. Initialize Chart Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
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
        rightOffset: 15,
        barSpacing: 9,
        minBarSpacing: 2,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.08)",
        scaleMargins: {
          top: 0.08,
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

    // Add Candlestick Series with pure candlestick autoscale decoupling
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
      priceLineColor: "#E5B869",
      autoscaleInfoProvider: ((original) => {
        const res = original();
        if (!res || !res.priceRange) return null;
        return {
          priceRange: {
            minValue: res.priceRange.minValue,
            maxValue: res.priceRange.maxValue,
          },
          margins: {
            above: 0.08,
            below: 0.18,
          },
        };
      }) as AutoscaleInfoProvider,
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
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      forceUpdateViewport();
    });

    // Crosshair hover for HUD
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param || !param.time || !param.seriesData) {
        if (onCrosshairMove) onCrosshairMove(null);
        return;
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
        if (onCrosshairMove) {
          onCrosshairMove({
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
  }, [isMagnet, forceUpdateViewport, onCrosshairMove]);

  // 2. Load and Sync Candle Data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const formattedCandles = candles.map((c) => ({
      time: toUtcSeconds(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeriesRef.current.setData(formattedCandles);

    if (showVolume) {
      const formattedVolume = candles.map((c) => ({
        time: toUtcSeconds(c.time),
        value: c.volume ?? 1000,
        color: c.close >= c.open ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)",
      }));
      volumeSeriesRef.current.setData(formattedVolume);
    } else {
      volumeSeriesRef.current.setData([]);
    }

    // Compute Session VWAP
    if (showVwap && vwapSeriesRef.current) {
      let cumulativeVolume = 0;
      let cumulativeVolumePrice = 0;
      const vwapPoints: { time: UTCTimestamp; value: number }[] = [];

      for (const c of candles) {
        const typical = (c.high + c.low + c.close) / 3;
        const vol = c.volume ?? 1000;
        cumulativeVolume += vol;
        cumulativeVolumePrice += typical * vol;
        if (cumulativeVolume > 0) {
          vwapPoints.push({
            time: toUtcSeconds(c.time),
            value: Math.round((cumulativeVolumePrice / cumulativeVolume) * 100) / 100,
          });
        }
      }
      vwapSeriesRef.current.setData(vwapPoints);
    } else if (vwapSeriesRef.current) {
      vwapSeriesRef.current.setData([]);
    }

    forceUpdateViewport();
  }, [candles, showVolume, showVwap, toUtcSeconds, forceUpdateViewport]);

  // 3. Smooth Live Streaming Tick Updates (60 FPS without resetting viewport)
  useEffect(() => {
    if (!candleSeriesRef.current || !liveCandle) return;

    candleSeriesRef.current.update({
      time: toUtcSeconds(liveCandle.time),
      open: liveCandle.open,
      high: liveCandle.high,
      low: liveCandle.low,
      close: liveCandle.close,
    });

    if (showVolume && volumeSeriesRef.current && liveCandle.volume != null) {
      volumeSeriesRef.current.update({
        time: toUtcSeconds(liveCandle.time),
        value: liveCandle.volume,
        color:
          liveCandle.close >= liveCandle.open
            ? "rgba(16, 185, 129, 0.35)"
            : "rgba(239, 68, 68, 0.35)",
      });
    }
  }, [liveCandle, showVolume, toUtcSeconds]);

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
        desiredMap.set(`ltp-${l.name}`, {
          id: `ltp-${l.name}`,
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: l.dash ? LineStyle.Dashed : LineStyle.Solid,
          title: l.name,
        });
      }
    }

    // Astro Levels
    if (showAstroLevels && astroLevels.length > 0) {
      for (const a of astroLevels) {
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
      const existing = priceLinesMapRef.current.get(id);
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
  ]);

  // Coordinate conversion helpers
  const getCoordinates = useCallback(
    (p: DrawingPoint): { x: number; y: number } | null => {
      if (!chartRef.current || !candleSeriesRef.current) return null;
      const x = chartRef.current.timeScale().timeToCoordinate(toUtcSeconds(p.time));
      const y = candleSeriesRef.current.priceToCoordinate(p.price);
      if (x == null || y == null) return null;
      return { x: Number(x), y: Number(y) };
    },
    [toUtcSeconds],
  );

  // Mouse Handlers for Left Drawing Toolbar
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === "cursor") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (!chartRef.current || !candleSeriesRef.current) return;
    const time = chartRef.current.timeScale().coordinateToTime(clientX);
    const price = candleSeriesRef.current.coordinateToPrice(clientY);
    if (!time || !price) return;

    const timeNum = typeof time === "number" ? time : Date.parse(time as string) / 1000;
    const pt: DrawingPoint = { time: timeNum, price };

    if (activeTool === "horizontal") {
      const newDrawing: ChartDrawing = {
        id: `h-${Date.now()}`,
        type: "horizontal",
        points: [pt],
        color: "#E5B869",
        isComplete: true,
        label: `H-Line: ${price.toFixed(2)}`,
      };
      onSaveDrawings([...drawings, newDrawing]);
      if (onFinishDrawingTool) onFinishDrawingTool();
      return;
    }

    if (!currentDrawing) {
      setCurrentDrawing({
        type: activeTool,
        start: pt,
        current: pt,
      });
    } else {
      // Complete drawing
      const p1 = currentDrawing.start;
      const p2 = pt;
      const priceDiff = p2.price - p1.price;
      const percentDiff = p1.price > 0 ? (priceDiff / p1.price) * 100 : 0;

      const newDrawing: ChartDrawing = {
        id: `draw-${Date.now()}`,
        type: activeTool,
        points: [p1, p2],
        color:
          activeTool === "riskRewardLong"
            ? "#10B981"
            : activeTool === "riskRewardShort"
              ? "#EF4444"
              : activeTool === "rectangle"
                ? "#06B6D4"
                : "#E5B869",
        isComplete: true,
        meta: {
          priceDiff,
          percentDiff,
        },
      };
      onSaveDrawings([...drawings, newDrawing]);
      setCurrentDrawing(null);
      if (onFinishDrawingTool) onFinishDrawingTool();
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!currentDrawing || !chartRef.current || !candleSeriesRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const time = chartRef.current.timeScale().coordinateToTime(clientX);
    const price = candleSeriesRef.current.coordinateToPrice(clientY);
    if (!time || !price) return;

    const timeNum = typeof time === "number" ? time : Date.parse(time as string) / 1000;
    setCurrentDrawing((prev) => (prev ? { ...prev, current: { time: timeNum, price } } : null));
  };

  // Reset / Auto-Fit Viewport
  const handleResetViewport = useCallback(() => {
    if (chartRef.current) {
      isScrolledRef.current = false;
      chartRef.current.priceScale("right").applyOptions({ autoScale: true });
      chartRef.current.timeScale().fitContent();
      chartRef.current.timeScale().applyOptions({ rightOffset: 15 });
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

  // Lock autoScale: false on user manual wheel or drag until explicit [Auto-Fit]
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lockAutoscale = () => {
      if (!isScrolledRef.current && chartRef.current) {
        isScrolledRef.current = true;
        chartRef.current.priceScale("right").applyOptions({ autoScale: false });
        onIsScrolledChange?.(true);
      }
    };

    container.addEventListener("wheel", lockAutoscale, { passive: true });

    let isPointerDown = false;
    const handlePointerDown = () => {
      isPointerDown = true;
    };
    const handlePointerMove = () => {
      if (isPointerDown) {
        lockAutoscale();
      }
    };
    const handlePointerUp = () => {
      isPointerDown = false;
    };

    container.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      container.removeEventListener("wheel", lockAutoscale);
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onIsScrolledChange]);

  return (
    <div className="relative w-full h-full flex-1 min-h-[460px] bg-[#08090C] overflow-hidden select-none">
      {/* Chart Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Synchronized Interactive SVG Layer */}
      <svg
        className={`absolute inset-0 w-full h-full pointer-events-none ${
          activeTool !== "cursor" ? "pointer-events-auto cursor-crosshair" : ""
        }`}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleSvgMouseMove}
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
          fvgs.map((fvg, i) => {
            if (!chartRef.current || !candleSeriesRef.current) return null;
            const topY = candleSeriesRef.current.priceToCoordinate(fvg.high);
            const botY = candleSeriesRef.current.priceToCoordinate(fvg.low);
            if (topY == null || botY == null) return null;

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
          oiProfile.map((oi, i) => {
            if (!candleSeriesRef.current) return null;
            const y = candleSeriesRef.current.priceToCoordinate(oi.strike);
            if (y == null) return null;

            const maxOi = Math.max(...oiProfile.map((p) => Math.max(p.callOi, p.putOi))) || 1;
            const maxBarWidth = 85; // Constrained width so bars never block candles or drag physics
            const callWidth = Math.min(maxBarWidth, (oi.callOi / maxOi) * maxBarWidth);
            const putWidth = Math.min(maxBarWidth, (oi.putOi / maxOi) * maxBarWidth);

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
          })}

        {/* 3. Persistent User Drawings */}
        {drawings.map((d) => {
          if (!d.points || d.points.length === 0) return null;
          const coords: { x: number; y: number }[] = [];
          for (const pt of d.points) {
            const c = getCoordinates(pt);
            if (c) coords.push(c);
          }
          if (coords.length === 0) return null;
          const c0 = coords[0];

          if (d.type === "horizontal" && c0) {
            return (
              <g key={d.id}>
                <line
                  x1="0"
                  y1={c0.y}
                  x2="100%"
                  y2={c0.y}
                  stroke={d.color}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                <text
                  x="70"
                  y={c0.y - 4}
                  fill={d.color}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {d.label ?? `Level: ${d.points[0].price.toFixed(1)}`}
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
              <line
                key={d.id}
                x1={c1.x}
                y1={c1.y}
                x2={c2.x}
                y2={c2.y}
                stroke={d.color}
                strokeWidth="2"
              />
            );
          }

          if (d.type === "rectangle") {
            const x = Math.min(c1.x, c2.x);
            const y = Math.min(c1.y, c2.y);
            const w = Math.abs(c2.x - c1.x);
            const h = Math.abs(c2.y - c1.y);
            return (
              <rect
                key={d.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="rgba(6, 182, 212, 0.15)"
                stroke={d.color}
                strokeWidth="1.5"
              />
            );
          }

          if (d.type === "fibonacci") {
            const priceLow = Math.min(d.points[0].price, d.points[1].price);
            const priceHigh = Math.max(d.points[0].price, d.points[1].price);
            const diff = priceHigh - priceLow;

            return (
              <g key={d.id}>
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
                        stroke={fib.color}
                        strokeWidth={fib.ratio === 0.618 || fib.ratio === 0.5 ? "2" : "1"}
                        strokeDasharray={fib.ratio === 0.618 ? "0" : "4 2"}
                      />
                      <text
                        x={Math.min(c1.x, c2.x) + 5}
                        y={fibY - 4}
                        fill={fib.color}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {fib.label} ({price.toFixed(1)})
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          }

          if (d.type === "riskRewardLong" || d.type === "riskRewardShort") {
            const isLong = d.type === "riskRewardLong";
            const x = Math.min(c1.x, c2.x);
            const w = Math.abs(c2.x - c1.x) || 120;
            const entryY = c1.y;
            const slY = c2.y;
            const targetY = isLong ? entryY - Math.abs(entryY - slY) * 2 : entryY + Math.abs(entryY - slY) * 2;

            return (
              <g key={d.id}>
                {/* Target Box (Green) */}
                <rect
                  x={x}
                  y={Math.min(entryY, targetY)}
                  width={w}
                  height={Math.abs(targetY - entryY)}
                  fill="rgba(16, 185, 129, 0.2)"
                  stroke="#10B981"
                  strokeWidth="1.5"
                />
                {/* Stop Loss Box (Red) */}
                <rect
                  x={x}
                  y={Math.min(entryY, slY)}
                  width={w}
                  height={Math.abs(slY - entryY)}
                  fill="rgba(239, 68, 68, 0.2)"
                  stroke="#EF4444"
                  strokeWidth="1.5"
                />
                <text
                  x={x + 6}
                  y={entryY - 4}
                  fill="#E5B869"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  Entry | R:R = 2.00
                </text>
              </g>
            );
          }

          if (d.type === "ruler") {
            const pDiff = d.points[1].price - d.points[0].price;
            const pPct = d.points[0].price > 0 ? (pDiff / d.points[0].price) * 100 : 0;
            return (
              <g key={d.id}>
                <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke="#38BDF8" strokeWidth="1.5" />
                <rect
                  x={Math.min(c1.x, c2.x) + 10}
                  y={Math.min(c1.y, c2.y) + 10}
                  width="130"
                  height="36"
                  fill="#0E1015"
                  stroke="#38BDF8"
                  strokeWidth="1"
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
                </text>
              </g>
            );
          }

          return null;
        })}

        {/* 4. Active Drawing Preview */}
        {currentDrawing && (() => {
          const c1 = getCoordinates(currentDrawing.start);
          const c2 = getCoordinates(currentDrawing.current);
          if (!c1 || !c2) return null;
          return (
            <line
              x1={c1.x}
              y1={c1.y}
              x2={c2.x}
              y2={c2.y}
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
          );
        })()}
      </svg>
    </div>
  );
}
