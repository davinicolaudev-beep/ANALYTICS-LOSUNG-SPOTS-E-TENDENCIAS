import React, { useState, useMemo } from "react";
import { 
  BarChart3, 
  LineChart, 
  TrendingUp, 
  Calendar, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  Filter
} from "lucide-react";
import { ShopeeSpotRecord } from "./types";

export interface DayMetric {
  dateKey: string; // YYYY-MM-DD
  displayDate: string; // DD/MM
  fullDate: string; // DD/MM/YYYY
  dayOfWeek: string;
  total: number;
  accepted: number;
  lost: number;
  cancelled: number;
  active: number;
  spot: number;
  tendencia: number;
  acceptanceRate: number;
  cancellationRate: number;
}

interface DailyEvolutionChartProps {
  records: ShopeeSpotRecord[];
}

// Robust date parser supporting DD/MM/YYYY and YYYY-MM-DD
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/A" || typeof dateStr !== "string") return null;
  const cleaned = dateStr.trim();
  
  // DD/MM/YYYY
  const partsDmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (partsDmy) {
    const day = parseInt(partsDmy[1], 10);
    const month = parseInt(partsDmy[2], 10) - 1;
    const year = parseInt(partsDmy[3], 10);
    return new Date(year, month, day);
  }
  
  // YYYY-MM-DD
  const partsYmd = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (partsYmd) {
    const year = parseInt(partsYmd[1], 10);
    const month = parseInt(partsYmd[2], 10) - 1;
    const day = parseInt(partsYmd[3], 10);
    return new Date(year, month, day);
  }
  
  const parsed = Date.parse(cleaned);
  return isNaN(parsed) ? null : new Date(parsed);
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const DailyEvolutionChart: React.FC<DailyEvolutionChartProps> = ({ records }) => {
  // Chart view mode: "combined" (bars + line), "bars" (bar chart), "lines" (line chart)
  const [viewMode, setViewMode] = useState<"combined" | "bars" | "lines">("combined");
  
  // Day window: "7d", "14d", "30d", "all"
  const [dayWindow, setDayWindow] = useState<"7d" | "14d" | "30d" | "all">("14d");

  // Metric focus
  const [metricFocus, setMetricFocus] = useState<"volume" | "acceptance" | "mix">("volume");

  // Hovered day for interactive tooltip
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);

  // Group and sort records by date
  const allDailyData = useMemo(() => {
    const map = new Map<string, {
      dateObj: Date;
      dateKey: string;
      displayDate: string;
      fullDate: string;
      dayOfWeek: string;
      total: number;
      accepted: number;
      lost: number;
      cancelled: number;
      spot: number;
      tendencia: number;
    }>();

    records.forEach(r => {
      if (!r) return;
      const dateObj = parseDate(r.creationDate);
      if (!dateObj) return;

      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;

      if (!map.has(key)) {
        map.set(key, {
          dateObj,
          dateKey: key,
          displayDate: `${d}/${m}`,
          fullDate: `${d}/${m}/${y}`,
          dayOfWeek: WEEKDAYS[dateObj.getDay()],
          total: 0,
          accepted: 0,
          lost: 0,
          cancelled: 0,
          spot: 0,
          tendencia: 0
        });
      }

      const item = map.get(key)!;
      item.total++;
      if (r.status === "ACEITAMOS") item.accepted++;
      if (r.status === "PERDEMOS") item.lost++;
      if (r.cancelled) item.cancelled++;
      if (r.type === "SPOT") item.spot++;
      if (r.type === "TENDENCIA") item.tendencia++;
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
      const keyA = a?.dateKey || "";
      const keyB = b?.dateKey || "";
      return keyA.localeCompare(keyB);
    });

    return sorted.map((d): DayMetric => {
      const rate = d.total > 0 ? Math.round((d.accepted / d.total) * 100) : 0;
      const cancelRate = d.total > 0 ? Math.round((d.cancelled / d.total) * 100) : 0;
      return {
        ...d,
        active: Math.max(0, d.accepted - d.cancelled),
        acceptanceRate: rate,
        cancellationRate: cancelRate
      };
    });
  }, [records]);

  // Windowed data slice
  const displayData = useMemo(() => {
    if (dayWindow === "7d") return allDailyData.slice(-7);
    if (dayWindow === "14d") return allDailyData.slice(-14);
    if (dayWindow === "30d") return allDailyData.slice(-30);
    return allDailyData;
  }, [allDailyData, dayWindow]);

  // Key stats across the selected window
  const summary = useMemo(() => {
    if (displayData.length === 0) {
      return {
        totalDays: 0,
        totalRoutes: 0,
        avgDaily: 0,
        peakDay: null,
        avgAcceptance: 0,
        bestDay: null
      };
    }

    let totalRoutes = 0;
    let totalAccepted = 0;
    let peakDay: DayMetric = displayData[0];
    let bestDay: DayMetric = displayData[0];

    displayData.forEach(d => {
      totalRoutes += d.total;
      totalAccepted += d.accepted;
      if (d.total > peakDay.total) peakDay = d;
      if (d.acceptanceRate > bestDay.acceptanceRate) bestDay = d;
    });

    return {
      totalDays: displayData.length,
      totalRoutes,
      avgDaily: Math.round(totalRoutes / displayData.length) || 0,
      peakDay,
      avgAcceptance: totalRoutes > 0 ? Math.round((totalAccepted / totalRoutes) * 100) : 0,
      bestDay
    };
  }, [displayData]);

  if (allDailyData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center text-slate-400">
        <Calendar className="mx-auto text-slate-300 mb-2" size={32} />
        <p className="text-sm font-semibold">Nenhuma data válida encontrada nos registros.</p>
      </div>
    );
  }

  // SVG Chart Geometry Calculations
  const chartHeight = 240;
  const paddingLeft = 46;
  const paddingRight = viewMode === "combined" ? 46 : 20;
  const paddingTop = 26;
  const paddingBottom = 42;
  const svgWidth = 800; // viewBox width for responsive scaling
  const innerWidth = svgWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Max value for volume scaling
  const maxVolumeRaw = Math.max(...displayData.map(d => d.total), 10);
  // Round up to nice number for grid lines
  const maxVolume = Math.ceil(maxVolumeRaw / 10) * 10 || 10;

  const dataCount = displayData.length;
  const colWidth = innerWidth / Math.max(dataCount, 1);
  const barWidth = Math.min(Math.max(colWidth * 0.52, 10), 38);

  // Helper to compute coordinates
  const getX = (index: number) => paddingLeft + index * colWidth + colWidth / 2;
  const getYVolume = (val: number) => paddingTop + innerHeight - (val / maxVolume) * innerHeight;
  const getYPercent = (percent: number) => paddingTop + innerHeight - (percent / 100) * innerHeight;

  // Build SVG Path for Line Chart
  const linePointsVolume = displayData.map((d, i) => ({
    x: getX(i),
    y: getYVolume(d.total)
  }));

  const linePointsAccepted = displayData.map((d, i) => ({
    x: getX(i),
    y: getYVolume(d.accepted)
  }));

  const linePointsRate = displayData.map((d, i) => ({
    x: getX(i),
    y: getYPercent(d.acceptanceRate)
  }));

  const createSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const volumePath = createSmoothPath(linePointsVolume);
  const acceptedPath = createSmoothPath(linePointsAccepted);
  const ratePath = createSmoothPath(linePointsRate);

  // Gradient area closed paths
  const volumeAreaPath = pointsToArea(linePointsVolume, paddingTop + innerHeight);
  const rateAreaPath = pointsToArea(linePointsRate, paddingTop + innerHeight);

  function pointsToArea(points: { x: number; y: number }[], baselineY: number) {
    if (points.length < 2) return "";
    const line = createSmoothPath(points);
    return `${line} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`;
  }

  // Active day details (hovered or latest)
  const activeDay = hoveredDayIndex !== null && displayData[hoveredDayIndex] 
    ? displayData[hoveredDayIndex] 
    : displayData[displayData.length - 1];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col gap-5 transition-all hover:shadow-md">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-50 text-[#FF6600] rounded-lg">
              <TrendingUp size={18} />
            </div>
            <h3 className="text-base font-bold text-slate-800 tracking-tight">
              Evolução dos Dias (Evolutivo Diário)
            </h3>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100">
              Dia a Dia
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Visualização diária em barras e linhas com taxa de aceite, perdas e cancelamentos
          </p>
        </div>

        {/* CONTROLS BAR: Mode Toggle & Window Filter */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* View Mode: Bars / Lines / Combined */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-semibold text-slate-600">
            <button
              onClick={() => setViewMode("combined")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === "combined"
                  ? "bg-white text-slate-900 shadow-sm font-bold"
                  : "hover:text-black"
              }`}
              title="Exibir Barras de Volume com Linha de Tendência de Aceite"
            >
              <BarChart3 size={13} className="text-[#FF6600]" />
              <span className="text-[11px]">Barras + Linha</span>
            </button>

            <button
              onClick={() => setViewMode("bars")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === "bars"
                  ? "bg-white text-slate-900 shadow-sm font-bold"
                  : "hover:text-black"
              }`}
              title="Exibir somente Gráfico de Barras"
            >
              <BarChart3 size={13} className="text-emerald-600" />
              <span className="text-[11px]">Barras</span>
            </button>

            <button
              onClick={() => setViewMode("lines")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === "lines"
                  ? "bg-white text-slate-900 shadow-sm font-bold"
                  : "hover:text-black"
              }`}
              title="Exibir visualmente em Gráfico de Linhas contínuas"
            >
              <LineChart size={13} className="text-indigo-600" />
              <span className="text-[11px]">Linhas</span>
            </button>
          </div>

          {/* Time Window Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-semibold text-slate-600">
            <button
              onClick={() => setDayWindow("7d")}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                dayWindow === "7d" ? "bg-black text-white shadow-sm" : "hover:text-black"
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setDayWindow("14d")}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                dayWindow === "14d" ? "bg-black text-white shadow-sm" : "hover:text-black"
              }`}
            >
              14 Dias
            </button>
            <button
              onClick={() => setDayWindow("30d")}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                dayWindow === "30d" ? "bg-black text-white shadow-sm" : "hover:text-black"
              }`}
            >
              30 Dias
            </button>
            <button
              onClick={() => setDayWindow("all")}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                dayWindow === "all" ? "bg-black text-white shadow-sm" : "hover:text-black"
              }`}
            >
              Tudo ({allDailyData.length}d)
            </button>
          </div>

        </div>
      </div>

      {/* QUICK SUMMARY CHIPS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50/80 border border-slate-100 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Média Diária</span>
          <div className="text-xl font-extrabold text-slate-800 mt-1">
            {summary.avgDaily} <span className="text-xs font-semibold text-slate-500">rotas/dia</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5">{summary.totalDays} dias analisados</span>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-100/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Taxa Média de Aceite</span>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">
            {summary.avgAcceptance}%
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5">Rotas com status OWNER</span>
        </div>

        <div className="bg-orange-50/50 border border-orange-100/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold text-[#FF6600] uppercase tracking-wider">Pico Máximo</span>
          <div className="text-xl font-extrabold text-slate-800 mt-1">
            {summary.peakDay?.total || 0} <span className="text-xs font-semibold text-slate-500">rotas</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">Em {summary.peakDay?.fullDate || "-"}</span>
        </div>

        <div className="bg-blue-50/50 border border-blue-100/60 p-3 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Melhor Aceite</span>
          <div className="text-xl font-extrabold text-blue-700 mt-1">
            {summary.bestDay?.acceptanceRate || 0}%
          </div>
          <span className="text-[10px] text-blue-600 mt-0.5">Em {summary.bestDay?.fullDate || "-"}</span>
        </div>
      </div>

      {/* METRIC SELECTION PILLS & LEGEND */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400">Modo de Comparação:</span>
          <button
            onClick={() => setMetricFocus("volume")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              metricFocus === "volume"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Volume por Status
          </button>
          <button
            onClick={() => setMetricFocus("acceptance")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              metricFocus === "acceptance"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Foco em Aceite (%)
          </button>
          <button
            onClick={() => setMetricFocus("mix")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              metricFocus === "mix"
                ? "bg-[#FF6600] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Mix SPOT vs Tendência
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
          {metricFocus === "volume" && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Aceitas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" /> Perdidas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Canceladas
              </span>
            </>
          )}

          {metricFocus === "mix" && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#FF6600]" /> SPOT
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> Tendência
              </span>
            </>
          )}

          {(viewMode === "combined" || metricFocus === "acceptance") && (
            <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
              <span className="w-3.5 h-1 bg-indigo-600 rounded-full inline-block" /> % Taxa de Aceite
            </span>
          )}
        </div>
      </div>

      {/* MAIN INTERACTIVE SVG CHART */}
      <div className="relative w-full overflow-hidden bg-slate-50/50 rounded-xl border border-slate-100 p-2 sm:p-4">
        
        {/* SVG Canvas with high-DPI scaling */}
        <svg
          viewBox={`0 0 ${svgWidth} ${chartHeight}`}
          className="w-full h-auto select-none overflow-visible"
        >
          <defs>
            {/* Linear gradient for Volume Area in Line mode */}
            <linearGradient id="volumeAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF6600" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#FF6600" stopOpacity="0.0" />
            </linearGradient>

            {/* Linear gradient for Acceptance Rate in Combined / Line mode */}
            <linearGradient id="rateAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>

            {/* Drop shadow for lines and hover points */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = paddingTop + innerHeight * (1 - pct);
            const volumeLabel = Math.round(maxVolume * pct);
            const percentLabel = Math.round(100 * pct);

            return (
              <g key={idx} className="text-slate-300">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                {/* Left Y Axis Label (Volume) */}
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] font-bold fill-slate-400 font-mono"
                >
                  {volumeLabel}
                </text>

                {/* Right Y Axis Label (Percentage for Combined mode) */}
                {viewMode === "combined" && (
                  <text
                    x={svgWidth - paddingRight + 8}
                    y={y + 3}
                    textAnchor="start"
                    className="text-[10px] font-bold fill-indigo-500 font-mono"
                  >
                    {percentLabel}%
                  </text>
                )}
              </g>
            );
          })}

          {/* BARS RENDERING (For "combined" and "bars" modes) */}
          {(viewMode === "combined" || viewMode === "bars") && (
            <g>
              {displayData.map((d, i) => {
                const cx = getX(i);
                const x0 = cx - barWidth / 2;
                const baselineY = paddingTop + innerHeight;
                const isHovered = hoveredDayIndex === i;

                if (metricFocus === "mix") {
                  // Stacked SPOT vs Tendência
                  const spotH = (d.spot / maxVolume) * innerHeight;
                  const trendH = (d.tendencia / maxVolume) * innerHeight;
                  const otherH = ((d.total - d.spot - d.tendencia) / maxVolume) * innerHeight;

                  return (
                    <g key={d.dateKey} opacity={hoveredDayIndex !== null && !isHovered ? 0.45 : 1} className="transition-opacity">
                      {/* Trend portion (bottom) */}
                      <rect
                        x={x0}
                        y={baselineY - trendH}
                        width={barWidth}
                        height={Math.max(trendH, 0)}
                        fill="#64748b"
                        rx="1"
                      />
                      {/* SPOT portion (top of trend) */}
                      <rect
                        x={x0}
                        y={baselineY - trendH - spotH}
                        width={barWidth}
                        height={Math.max(spotH, 0)}
                        fill="#FF6600"
                        rx="2"
                      />
                    </g>
                  );
                }

                // Default: Stacked Accepted / Lost / Cancelled
                const totalH = (d.total / maxVolume) * innerHeight;
                const acceptedH = (d.accepted / maxVolume) * innerHeight;
                const lostH = (d.lost / maxVolume) * innerHeight;
                const cancelledH = (d.cancelled / maxVolume) * innerHeight;

                return (
                  <g 
                    key={d.dateKey}
                    opacity={hoveredDayIndex !== null && !isHovered ? 0.35 : 1}
                    className="transition-all duration-200"
                  >
                    {/* Background track on hover */}
                    {isHovered && (
                      <rect
                        x={cx - colWidth / 2}
                        y={paddingTop}
                        width={colWidth}
                        height={innerHeight}
                        fill="#000000"
                        fillOpacity="0.04"
                        rx="4"
                      />
                    )}

                    {/* Single unified or segmented bar */}
                    {viewMode === "combined" ? (
                      // In combined mode: volume bar with emerald tint for accepted, grey for lost
                      <g>
                        {/* Lost routes (base) */}
                        <rect
                          x={x0}
                          y={baselineY - (lostH + acceptedH)}
                          width={barWidth}
                          height={Math.max(lostH, 0)}
                          fill="#94a3b8"
                          rx="1"
                        />
                        {/* Accepted routes (stacked) */}
                        <rect
                          x={x0}
                          y={baselineY - acceptedH}
                          width={barWidth}
                          height={Math.max(acceptedH, 0)}
                          fill={isHovered ? "#059669" : "#10b981"}
                          rx="2"
                        />
                        {/* Small cancellation cap marker if any */}
                        {d.cancelled > 0 && (
                          <rect
                            x={x0}
                            y={baselineY - totalH}
                            width={barWidth}
                            height={Math.min(cancelledH, 3)}
                            fill="#f43f5e"
                            rx="1"
                          />
                        )}
                      </g>
                    ) : (
                      // In "bars" mode: full breakdown stacked
                      <g>
                        {/* Lost base */}
                        <rect
                          x={x0}
                          y={baselineY - totalH}
                          width={barWidth}
                          height={Math.max(totalH - acceptedH, 0)}
                          fill="#cbd5e1"
                          rx="2"
                        />
                        {/* Accepted bar */}
                        <rect
                          x={x0}
                          y={baselineY - acceptedH}
                          width={barWidth}
                          height={Math.max(acceptedH, 0)}
                          fill="#10b981"
                          rx="2"
                        />
                        {/* Cancelled overlay strip */}
                        {d.cancelled > 0 && (
                          <rect
                            x={x0 + barWidth - 4}
                            y={baselineY - totalH}
                            width={4}
                            height={Math.max(cancelledH, 4)}
                            fill="#f43f5e"
                            rx="1"
                          />
                        )}
                      </g>
                    )}

                    {/* Volume value label above bar */}
                    {d.total > 0 && (
                      <text
                        x={cx}
                        y={baselineY - totalH - 5}
                        textAnchor="middle"
                        className={`text-[9px] font-black transition-opacity ${
                          isHovered ? "fill-slate-900 opacity-100" : "fill-slate-500 opacity-80"
                        }`}
                      >
                        {d.total}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* LINES RENDERING (For "lines" mode and "combined" mode) */}
          {viewMode === "lines" && (
            <g>
              {/* Gradient Area under volume line */}
              <path d={volumeAreaPath} fill="url(#volumeAreaGradient)" />

              {/* Total Volume Line */}
              <path
                d={volumePath}
                fill="none"
                stroke="#FF6600"
                strokeWidth="2.5"
                filter="url(#glow)"
              />

              {/* Accepted Volume Line */}
              <path
                d={acceptedPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4 2"
              />

              {/* Line nodes */}
              {displayData.map((d, i) => {
                const cx = getX(i);
                const cy = getYVolume(d.total);
                const isHovered = hoveredDayIndex === i;

                return (
                  <g key={`node-${d.dateKey}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 5.5 : 3.5}
                      fill={isHovered ? "#FF6600" : "#ffffff"}
                      stroke="#FF6600"
                      strokeWidth={isHovered ? 2.5 : 2}
                      className="transition-all"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* SECONDARY LINE FOR ACCEPTANCE RATE (In Combined Mode) */}
          {viewMode === "combined" && (
            <g>
              {/* Acceptance Rate Line */}
              <path
                d={ratePath}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                filter="url(#glow)"
              />

              {/* Glowing Dots for Rate */}
              {displayData.map((d, i) => {
                const cx = getX(i);
                const cy = getYPercent(d.acceptanceRate);
                const isHovered = hoveredDayIndex === i;

                return (
                  <g key={`rate-node-${d.dateKey}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 6 : 3.5}
                      fill={isHovered ? "#6366f1" : "#ffffff"}
                      stroke="#6366f1"
                      strokeWidth={isHovered ? 2.5 : 2}
                    />
                    {isHovered && (
                      <text
                        x={cx}
                        y={cy - 9}
                        textAnchor="middle"
                        className="text-[10px] font-black fill-indigo-700 bg-white"
                      >
                        {d.acceptanceRate}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* X AXIS LABELS */}
          <g>
            {displayData.map((d, i) => {
              const cx = getX(i);
              const isHovered = hoveredDayIndex === i;

              return (
                <g key={`label-${d.dateKey}`}>
                  {/* Day of month */}
                  <text
                    x={cx}
                    y={paddingTop + innerHeight + 16}
                    textAnchor="middle"
                    className={`text-[10px] transition-colors ${
                      isHovered ? "font-black fill-[#FF6600]" : "font-semibold fill-slate-700"
                    }`}
                  >
                    {d.displayDate}
                  </text>
                  {/* Day of week */}
                  <text
                    x={cx}
                    y={paddingTop + innerHeight + 28}
                    textAnchor="middle"
                    className={`text-[8.5px] uppercase tracking-wider ${
                      d.dayOfWeek === "Dom" || d.dayOfWeek === "Sáb" 
                        ? "fill-slate-400 font-bold" 
                        : "fill-slate-500 font-medium"
                    }`}
                  >
                    {d.dayOfWeek}
                  </text>
                </g>
              );
            })}
          </g>

          {/* INVISIBLE INTERACTIVE HIT AREAS FOR HOVER */}
          {displayData.map((d, i) => {
            const cx = getX(i);
            const x0 = cx - colWidth / 2;

            return (
              <rect
                key={`hit-${d.dateKey}`}
                x={x0}
                y={paddingTop}
                width={colWidth}
                height={innerHeight + paddingBottom}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredDayIndex(i)}
                onMouseLeave={() => setHoveredDayIndex(null)}
              />
            );
          })}
        </svg>

        {/* FLOATING HOVER CARD PREVIEW */}
        {activeDay && (
          <div className="mt-3 bg-white border border-slate-200/80 rounded-xl p-3 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#FF6600] flex items-center justify-center font-bold text-xs">
                {activeDay.displayDate.split("/")[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-800 text-sm">{activeDay.fullDate}</span>
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                    {activeDay.dayOfWeek}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Detalhes das rotas geradas nesta data
                </p>
              </div>
            </div>

            {/* Quick Metrics of Active Day */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Volume Total</span>
                <span className="font-black text-slate-800 text-sm">{activeDay.total} rotas</span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-600 font-bold uppercase">Aceitas (OWNER)</span>
                <span className="font-black text-emerald-700 text-sm">
                  {activeDay.accepted} <span className="text-[10px] font-bold">({activeDay.acceptanceRate}%)</span>
                </span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Perdidas</span>
                <span className="font-bold text-slate-600 text-sm">{activeDay.lost}</span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div className="flex flex-col">
                <span className="text-[10px] text-rose-500 font-bold uppercase">Canceladas</span>
                <span className={`font-bold text-sm ${activeDay.cancelled > 0 ? "text-rose-600" : "text-slate-400"}`}>
                  {activeDay.cancelled} <span className="text-[10px]">({activeDay.cancellationRate}%)</span>
                </span>
              </div>

              <div className="h-6 w-px bg-slate-200" />

              <div className="flex flex-col">
                <span className="text-[10px] text-[#FF6600] font-bold uppercase">Mix SPOT / Trend</span>
                <span className="font-bold text-slate-700 text-sm">
                  {activeDay.spot} <span className="text-[10px] text-slate-400 font-normal">S</span> / {activeDay.tendencia} <span className="text-[10px] text-slate-400 font-normal">T</span>
                </span>
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
