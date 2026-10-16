import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  RefreshCw, 
  Search, 
  Filter, 
  MapPin, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Calendar, 
  ArrowUpDown, 
  Database, 
  Download, 
  Sparkles, 
  Layers, 
  Clock, 
  Upload, 
  Trash2, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
  BarChart4,
  Percent
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ShopeeSpotRecord, PlatformType, DashboardStats } from "./types";
import { DailyEvolutionChart } from "./DailyEvolutionChart";

// Helper to robustly parse various date string formats like DD/MM/YYYY or YYYY-MM-DD
function parseDateString(dateStr: string): Date | null {
  if (!dateStr || dateStr === "N/A" || typeof dateStr !== "string") return null;
  const cleaned = dateStr.trim();
  
  // Try DD/MM/YYYY
  const partsDmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (partsDmy) {
    const day = parseInt(partsDmy[1], 10);
    const month = parseInt(partsDmy[2], 10) - 1; // 0-indexed
    const year = parseInt(partsDmy[3], 10);
    return new Date(year, month, day);
  }
  
  // Try YYYY-MM-DD
  const partsYmd = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (partsYmd) {
    const year = parseInt(partsYmd[1], 10);
    const month = parseInt(partsYmd[2], 10) - 1;
    const day = parseInt(partsYmd[3], 10);
    return new Date(year, month, day);
  }
  
  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
}

export default function App() {
  const [activePlatform, setActivePlatform] = useState<PlatformType>("SHOPEE");
  const [records, setRecords] = useState<ShopeeSpotRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter and search states
  const [selectedWeek, setSelectedWeek] = useState<string>("TODAS");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("TODOS");
  const [filterStatus, setFilterStatus] = useState<string>("TODOS");
  const [filterCancelled, setFilterCancelled] = useState<string>("TODOS");
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(true);
  const [sortField, setSortField] = useState<keyof ShopeeSpotRecord>("creationDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Tab state for Shopee sub-panels
  const [shopeeTab, setShopeeTab] = useState<"geral" | "indicadores" | "rotas" | "funil" | "base">("geral");

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(15);

  // Manual Import CSV drawer state
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [csvPasteText, setCsvPasteText] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);

  // Fetch initial records from server on mount
  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shopee-spots");
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        // Also save to localStorage as a fallback backup
        localStorage.setItem("shopee_spots_backup", JSON.stringify(json.data));
      } else {
        throw new Error(json.error || "Erro ao carregar dados.");
      }
    } catch (err: any) {
      console.warn("Server connection failed, loading from local backup:", err);
      // Fallback to localStorage
      const backup = localStorage.getItem("shopee_spots_backup");
      if (backup) {
        const parsed = JSON.parse(backup);
        setRecords(parsed);
        // Attempt to sync client backup to server
        syncBackupToServer(parsed);
      } else {
        setError("Não foi possível conectar ao servidor e nenhum backup local foi encontrado.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Sync client backup to server silently ONLY if server database is empty
  const syncBackupToServer = async (backupData: ShopeeSpotRecord[]) => {
    try {
      const checkRes = await fetch("/api/shopee-spots");
      const checkJson = await checkRes.json();
      if (checkJson.success && Array.isArray(checkJson.data) && checkJson.data.length > 0) {
        // Server already has authoritative records, do not overwrite with client backup
        return;
      }
      await fetch("/api/shopee-spots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: backupData })
      });
    } catch (e) {
      console.error("Silent bulk upload failed", e);
    }
  };

  // Synchronize with Google Sheet URL
  const handleSyncSpreadsheet = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/shopee-spots/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        localStorage.setItem("shopee_spots_backup", JSON.stringify(json.data));
        setSuccessMsg(
          `Sincronização com a planilha concluída com sucesso! Total de rotas: ${json.totalCount}. ${json.addedCount > 0 ? `Novas rotas adicionadas: ${json.addedCount}.` : ""} ${json.updatedCount > 0 ? `Rotas atualizadas: ${json.updatedCount}.` : ""}`
        );
        setTimeout(() => setSuccessMsg(null), 6000);
      } else {
        throw new Error(json.error);
      }
    } catch (err: any) {
      setError(err.message || "Erro de conexão ao sincronizar com a planilha.");
    } finally {
      setSyncing(false);
    }
  };

  // Manual CSV text import
  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvPasteText.trim()) return;
    setImporting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/shopee-spots/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: csvPasteText })
      });
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        localStorage.setItem("shopee_spots_backup", JSON.stringify(json.data));
        setSuccessMsg(
          `Importação concluída com sucesso! Total: ${json.totalCount}. ${json.addedCount > 0 ? `Novas rotas: ${json.addedCount}. ` : ""}${json.updatedCount > 0 ? `Atualizadas: ${json.updatedCount}.` : ""}`
        );
        setIsImportOpen(false);
        setCsvPasteText("");
        setTimeout(() => setSuccessMsg(null), 6000);
      } else {
        throw new Error(json.error || "Erro ao processar CSV");
      }
    } catch (err: any) {
      setError(`Erro na importação manual: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Clear database
  const handleResetDatabase = async () => {
    if (!window.confirm("Deseja realmente limpar todos os dados salvos no sistema? Esta ação é irreversível.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/shopee-spots/reset", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setRecords([]);
        localStorage.removeItem("shopee_spots_backup");
        setSuccessMsg("Banco de dados do sistema redefinido com sucesso.");
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setError("Erro ao redefinir banco de dados.");
    } finally {
      setLoading(false);
    }
  };

  // Preset Date handling
  const handlePresetDate = (presetType: "7d" | "30d" | "month" | "year" | "clear") => {
    const baseDate = new Date("2026-09-17T00:00:00"); // Base reference aligned with our metadata year 2026
    if (presetType === "7d") {
      const past = new Date(baseDate);
      past.setDate(baseDate.getDate() - 7);
      setStartDateStr(past.toISOString().split("T")[0]);
      setEndDateStr(baseDate.toISOString().split("T")[0]);
    } else if (presetType === "30d") {
      const past = new Date(baseDate);
      past.setDate(baseDate.getDate() - 30);
      setStartDateStr(past.toISOString().split("T")[0]);
      setEndDateStr(baseDate.toISOString().split("T")[0]);
    } else if (presetType === "month") {
      const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      setStartDateStr(firstDay.toISOString().split("T")[0]);
      setEndDateStr(lastDay.toISOString().split("T")[0]);
    } else if (presetType === "year") {
      const firstDay = new Date(baseDate.getFullYear(), 0, 1);
      const lastDay = new Date(baseDate.getFullYear(), 11, 31);
      setStartDateStr(firstDay.toISOString().split("T")[0]);
      setEndDateStr(lastDay.toISOString().split("T")[0]);
    } else {
      setStartDateStr("");
      setEndDateStr("");
    }
  };

  // Extract unique weeks for filtering
  const uniqueWeeks = useMemo(() => {
    const weeksSet = new Set<string>();
    records.forEach(r => {
      if (r && r.week && r.week !== "N/A" && r.week !== "") {
        weeksSet.add(r.week);
      }
    });
    return Array.from(weeksSet).sort((a, b) => {
      // Sorter for strings like "W35", "Week 35" or date strings
      const strA = a || "";
      const strB = b || "";
      return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [records]);

  // Handle column sorting
  const requestSort = (field: keyof ShopeeSpotRecord) => {
    let direction: "asc" | "desc" = "asc";
    if (sortField === field && sortDirection === "asc") {
      direction = "desc";
    }
    setSortField(field);
    setSortDirection(direction);
  };

  // Filtered & Searched records
  const filteredRecords = useMemo(() => {
    const startFilter = startDateStr ? new Date(startDateStr + "T00:00:00") : null;
    const endFilter = endDateStr ? new Date(endDateStr + "T23:59:59") : null;

    return records.filter(r => {
      if (!r) return false;
      // Week filter
      const matchesWeek = selectedWeek === "TODAS" || r.week === selectedWeek;

      // Date range filter
      let matchesDate = true;
      if (startFilter || endFilter) {
        const itemDate = parseDateString(r.creationDate);
        if (!itemDate) {
          matchesDate = false;
        } else {
          if (startFilter && itemDate < startFilter) {
            matchesDate = false;
          }
          if (endFilter && itemDate > endFilter) {
            matchesDate = false;
          }
        }
      }

      // Indicator Type filter (SPOT / TENDENCIA)
      const matchesType = filterType === "TODOS" || r.type === filterType;

      // Status filter (ACEITAMOS / PERDEMOS)
      const matchesStatus = filterStatus === "TODOS" || r.status === filterStatus;

      // Cancellation filter (CANCELADOS / ATIVOS)
      const matchesCancelled = filterCancelled === "TODOS" || 
        (filterCancelled === "CANCELADOS" && r.cancelled) || 
        (filterCancelled === "ATIVOS" && !r.cancelled);

      // Search filter
      const term = searchQuery.trim().toLowerCase();
      const matchesSearch = !term || 
        (r.routeCode || "").toLowerCase().includes(term) ||
        (r.routeComplete || "").toLowerCase().includes(term) ||
        (r.routeOrigin || "").toLowerCase().includes(term) ||
        (r.routeDest || "").toLowerCase().includes(term) ||
        (r.week || "").toLowerCase().includes(term);

      return matchesWeek && matchesDate && matchesType && matchesStatus && matchesCancelled && matchesSearch;
    });
  }, [records, selectedWeek, searchQuery, startDateStr, endDateStr, filterType, filterStatus, filterCancelled]);

  // Sorted records
  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords];
    sorted.sort((a, b) => {
      const valA = a ? a[sortField] : undefined;
      const valB = b ? b[sortField] : undefined;

      if (valA === valB) return 0;
      if (valA === undefined || valA === null || valA === "") return 1;
      if (valB === undefined || valB === null || valB === "") return -1;

      if (typeof valA === "boolean" || typeof valB === "boolean") {
        const boolA = Boolean(valA);
        const boolB = Boolean(valB);
        return sortDirection === "asc" 
          ? (boolA === boolB ? 0 : boolA ? 1 : -1)
          : (boolA === boolB ? 0 : boolA ? -1 : 1);
      }

      if (sortField === "creationDate") {
        const dateA = parseDateString(String(valA))?.getTime() || 0;
        const dateB = parseDateString(String(valB))?.getTime() || 0;
        if (dateA !== dateB) {
          return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
        }
      }

      const strA = String(valA);
      const strB = String(valB);

      return sortDirection === "asc"
        ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: "base" })
        : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: "base" });
    });
    return sorted;
  }, [filteredRecords, sortField, sortDirection]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedRecords, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(sortedRecords.length / rowsPerPage) || 1;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedWeek, searchQuery, rowsPerPage]);

  // Statistics calculation based on filtered subset
  const stats: DashboardStats = useMemo(() => {
    const dataset = filteredRecords;
    const total = dataset.length;

    if (total === 0) {
      return {
        totalRoutes: 0,
        totalSpot: 0,
        totalTendencia: 0,
        totalAccepted: 0,
        totalLost: 0,
        totalCancelled: 0,
        spotPercentage: 0,
        tendenciaPercentage: 0,
        acceptanceRate: 0,
        cancellationRate: 0
      };
    }

    let spot = 0;
    let tendencia = 0;
    let accepted = 0;
    let lost = 0;
    let cancelled = 0;

    dataset.forEach(r => {
      if (r.type === "SPOT") spot++;
      if (r.type === "TENDENCIA") tendencia++;
      if (r.status === "ACEITAMOS") accepted++;
      if (r.status === "PERDEMOS") lost++;
      if (r.cancelled) cancelled++;
    });

    return {
      totalRoutes: total,
      totalSpot: spot,
      totalTendencia: tendencia,
      totalAccepted: accepted,
      totalLost: lost,
      totalCancelled: cancelled,
      spotPercentage: Math.round((spot / total) * 100),
      tendenciaPercentage: Math.round((tendencia / total) * 100),
      acceptanceRate: Math.round((accepted / total) * 100),
      cancellationRate: Math.round((cancelled / total) * 100)
    };
  }, [filteredRecords]);

  // Deep analytical computations for the complete dashboard
  const deepAnalytics = useMemo(() => {
    const dataset = filteredRecords;
    
    // 1. Top Origins Ranking
    const originCounts: { [key: string]: { total: number; accepted: number; lost: number; cancelled: number } } = {};
    const destCounts: { [key: string]: { total: number; accepted: number; lost: number; cancelled: number } } = {};
    
    // Spot vs Trend conversion metrics
    let spotAccepted = 0;
    let spotLost = 0;
    let spotCancelled = 0;
    let spotTotal = 0;
    
    let trendAccepted = 0;
    let trendLost = 0;
    let trendCancelled = 0;
    let trendTotal = 0;

    dataset.forEach(r => {
      // Origin metrics
      const origin = r.routeOrigin || "Desconhecida";
      if (!originCounts[origin]) {
        originCounts[origin] = { total: 0, accepted: 0, lost: 0, cancelled: 0 };
      }
      originCounts[origin].total++;
      if (r.status === "ACEITAMOS") originCounts[origin].accepted++;
      if (r.status === "PERDEMOS") originCounts[origin].lost++;
      if (r.cancelled) originCounts[origin].cancelled++;

      // Destination metrics
      const dest = r.routeDest || "Desconhecida";
      if (!destCounts[dest]) {
        destCounts[dest] = { total: 0, accepted: 0, lost: 0, cancelled: 0 };
      }
      destCounts[dest].total++;
      if (r.status === "ACEITAMOS") destCounts[dest].accepted++;
      if (r.status === "PERDEMOS") destCounts[dest].lost++;
      if (r.cancelled) destCounts[dest].cancelled++;

      // Spot vs Trend specific conversions
      if (r.type === "SPOT") {
        spotTotal++;
        if (r.status === "ACEITAMOS") spotAccepted++;
        if (r.status === "PERDEMOS") spotLost++;
        if (r.cancelled) spotCancelled++;
      } else if (r.type === "TENDENCIA") {
        trendTotal++;
        if (r.status === "ACEITAMOS") trendAccepted++;
        if (r.status === "PERDEMOS") trendLost++;
        if (r.cancelled) trendCancelled++;
      }
    });

    // Format and sort rankings
    const topOrigins = Object.entries(originCounts)
      .map(([name, d]) => ({
        name,
        total: d.total,
        accepted: d.accepted,
        lost: d.lost,
        cancelled: d.cancelled,
        acceptanceRate: Math.round((d.accepted / d.total) * 100) || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topDestinations = Object.entries(destCounts)
      .map(([name, d]) => ({
        name,
        total: d.total,
        accepted: d.accepted,
        lost: d.lost,
        cancelled: d.cancelled,
        acceptanceRate: Math.round((d.accepted / d.total) * 100) || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      topOrigins,
      topDestinations,
      spotConversion: {
        total: spotTotal,
        accepted: spotAccepted,
        lost: spotLost,
        cancelled: spotCancelled,
        acceptanceRate: Math.round((spotAccepted / Math.max(spotTotal, 1)) * 100),
        cancellationRate: Math.round((spotCancelled / Math.max(spotTotal, 1)) * 100)
      },
      trendConversion: {
        total: trendTotal,
        accepted: trendAccepted,
        lost: trendLost,
        cancelled: trendCancelled,
        acceptanceRate: Math.round((trendAccepted / Math.max(trendTotal, 1)) * 100),
        cancellationRate: Math.round((trendCancelled / Math.max(trendTotal, 1)) * 100)
      }
    };
  }, [filteredRecords]);

  // Loss and funnel computations for the advanced routing metrics
  const lossAnalytics = useMemo(() => {
    const dataset = filteredRecords;
    
    // Group by route complete path to find critical routes
    const routeGroups: { [key: string]: { code: string; origin: string; dest: string; total: number; accepted: number; lost: number; cancelled: number } } = {};
    
    dataset.forEach(r => {
      const key = r.routeComplete || `${r.routeOrigin || "S/O"}-${r.routeDest || "S/D"}`;
      if (!routeGroups[key]) {
        routeGroups[key] = {
          code: r.routeCode,
          origin: r.routeOrigin || "N/A",
          dest: r.routeDest || "N/A",
          total: 0,
          accepted: 0,
          lost: 0,
          cancelled: 0
        };
      }
      const g = routeGroups[key];
      g.total++;
      if (r.status === "ACEITAMOS") g.accepted++;
      if (r.status === "PERDEMOS") g.lost++;
      if (r.cancelled) g.cancelled++;
    });

    // Compute metrics and sort
    const allRoutes = Object.entries(routeGroups).map(([path, g]) => {
      const cancelRate = Math.round((g.cancelled / Math.max(g.total, 1)) * 100);
      const successRate = Math.round((g.accepted / Math.max(g.total, 1)) * 100);
      const realSuccessRate = Math.round(((g.accepted - g.cancelled) / Math.max(g.total, 1)) * 100);
      return {
        path,
        code: g.code,
        origin: g.origin,
        dest: g.dest,
        total: g.total,
        accepted: g.accepted,
        lost: g.lost,
        cancelled: g.cancelled,
        cancelRate,
        successRate,
        realSuccessRate: realSuccessRate < 0 ? 0 : realSuccessRate
      };
    });

    // 1. Worst routes by cancellation (Top 5 with at least 1 cancellation, sorted by cancelRate desc, then by total volume desc)
    const worstCancellationRoutes = [...allRoutes]
      .filter(r => r.cancelled > 0)
      .sort((a, b) => b.cancelRate - a.cancelRate || b.total - a.total)
      .slice(0, 5);

    // 2. High volume routes with low acceptance
    const lowAcceptanceVolumeRoutes = [...allRoutes]
      .filter(r => r.total >= 1)
      .sort((a, b) => a.successRate - b.successRate || b.total - a.total)
      .slice(0, 5);

    // 3. Funnel Steps
    const total = dataset.length;
    const accepted = dataset.filter(r => r.status === "ACEITAMOS").length;
    const lost = dataset.filter(r => r.status === "PERDEMOS").length;
    const cancelled = dataset.filter(r => r.cancelled).length;
    const netAccepted = Math.max(0, accepted - cancelled);

    const funnel = {
      total,
      accepted,
      lost,
      cancelled,
      netAccepted,
      acceptancePercent: total > 0 ? Math.round((accepted / total) * 100) : 0,
      cancelledPercent: accepted > 0 ? Math.round((cancelled / accepted) * 100) : 0,
      netSuccessPercent: total > 0 ? Math.round((netAccepted / total) * 100) : 0
    };

    return {
      allRoutes,
      worstCancellationRoutes,
      lowAcceptanceVolumeRoutes,
      funnel
    };
  }, [filteredRecords]);

  // Cruzamento de dados de cancelamento por resultado (Aceitamos e cancelou vs Perdemos e cancelou)
  const cancellationCrossData = useMemo(() => {
    const dataset = filteredRecords;
    
    // Aceitamos (status === "ACEITAMOS")
    const accepted = dataset.filter(r => r.status === "ACEITAMOS");
    const acceptedTotal = accepted.length;
    const acceptedAndCancelled = accepted.filter(r => r.cancelled).length;
    const acceptedAndActive = acceptedTotal - acceptedAndCancelled;
    
    // Perdemos (status === "PERDEMOS")
    const lost = dataset.filter(r => r.status === "PERDEMOS");
    const lostTotal = lost.length;
    const lostAndCancelled = lost.filter(r => r.cancelled).length;
    const lostAndActive = lostTotal - lostAndCancelled;
    
    // Rates
    const acceptedCancelRate = acceptedTotal > 0 ? Math.round((acceptedAndCancelled / acceptedTotal) * 100) : 0;
    const lostCancelRate = lostTotal > 0 ? Math.round((lostAndCancelled / lostTotal) * 100) : 0;

    return {
      acceptedTotal,
      acceptedAndCancelled,
      acceptedAndActive,
      acceptedCancelRate,
      lostTotal,
      lostAndCancelled,
      lostAndActive,
      lostCancelRate
    };
  }, [filteredRecords]);

  // Aggregate data by week for charts
  const weeklyChartData = useMemo(() => {
    const weeksMap = new Map<string, { total: number; accepted: number; cancelled: number; spot: number; tendencia: number }>();
    
    // Initialize weeks in dataset
    records.forEach(r => {
      if (!r.week || r.week === "N/A") return;
      if (!weeksMap.has(r.week)) {
        weeksMap.set(r.week, { total: 0, accepted: 0, cancelled: 0, spot: 0, tendencia: 0 });
      }
      const item = weeksMap.get(r.week)!;
      item.total++;
      if (r.status === "ACEITAMOS") item.accepted++;
      if (r.cancelled) item.cancelled++;
      if (r.type === "SPOT") item.spot++;
      if (r.type === "TENDENCIA") item.tendencia++;
    });

    const sortedWeeks = Array.from(weeksMap.keys()).sort((a, b) => {
      const strA = a || "";
      const strB = b || "";
      return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return sortedWeeks.map(wk => {
      const d = weeksMap.get(wk)!;
      return {
        week: wk,
        total: d.total,
        accepted: d.accepted,
        cancelled: d.cancelled,
        spot: d.spot,
        tendencia: d.tendencia,
        acceptanceRate: Math.round((d.accepted / d.total) * 100) || 0,
        cancellationRate: Math.round((d.cancelled / d.total) * 100) || 0
      };
    }).slice(-12); // Last 12 weeks to keep the chart clean
  }, [records]);

  // Export current filtered table to CSV format
  const handleExportCSV = () => {
    if (sortedRecords.length === 0) return;
    
    const headers = ["Week", "Data de Criacao", "CPF da Rota", "Tipo", "Status", "Cancelado", "Origem", "Destino", "Rota Completa"];
    const rows = sortedRecords.map(r => [
      r.week,
      r.creationDate,
      `="${r.routeCode}"`, // excel format to keep leading zeroes if any
      r.type,
      r.status,
      r.cancelled ? "Sim" : "Nao",
      r.routeOrigin,
      r.routeDest,
      r.routeComplete
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `LösungExpress_KPI_Shopee_${selectedWeek}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-slate-800 font-sans flex flex-col antialiased selection:bg-[#FF6600]/20 selection:text-[#FF6600]">
      
      {/* HEADER BAR */}
      <header className="bg-black text-white shadow-md border-b-2 border-[#FF6600] sticky top-0 z-40 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand mimicking the provided image perfectly */}
          <div className="flex items-center gap-3">
            <div className="flex items-center h-12">
              <img 
                src="image.png" 
                alt="Lösung Express Logo" 
                className="h-11 object-contain rounded-md shadow-sm border border-neutral-800"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fb = document.getElementById("fallback-logo-brand");
                  if (fb) {
                    fb.classList.remove("hidden");
                    fb.classList.add("flex");
                  }
                }}
              />
              {/* Fallback layout if image.png is not found */}
              <div id="fallback-logo-brand" className="hidden bg-[#FF6600] p-2 rounded-lg items-center gap-2.5 shadow-inner leading-none h-11">
                <div className="relative w-8 h-8 flex items-center justify-center">
                  {/* Two interlocking circles similar to actual Logo */}
                  <div className="absolute w-6 h-6 rounded-full border-2 border-white opacity-90 left-0 bottom-0" />
                  <div className="absolute w-4.5 h-4.5 rounded-full border-2 border-white opacity-85 right-1 top-0.5" />
                  <div className="absolute w-2 h-2 rounded-full bg-white opacity-75 left-2 bottom-2" />
                </div>
                <div className="flex flex-col select-none leading-none pr-2">
                  <span className="text-white text-base font-black tracking-tight leading-none">
                    lösung
                  </span>
                  <span className="text-orange-100 text-[9px] italic font-medium tracking-widest mt-1 leading-none pl-0.5">
                    express
                  </span>
                </div>
              </div>
            </div>
            
            <div className="h-8 w-px bg-neutral-800 hidden md:block" />
            
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-white tracking-wide leading-tight">
                KPI Analytics
              </h1>
              <span className="text-slate-400 text-xs hidden sm:inline">
                Painel Geral de Avaliação de Desempenho
              </span>
            </div>
          </div>

          {/* Platforms Selector */}
          <nav className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 shadow-md">
            <button
              onClick={() => setActivePlatform("SHOPEE")}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activePlatform === "SHOPEE"
                  ? "bg-[#FF6600] text-white shadow"
                  : "text-slate-300 hover:text-white hover:bg-neutral-800"
              }`}
            >
              SHOPEE
            </button>
            <button
              onClick={() => setActivePlatform("AMAZON")}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activePlatform === "AMAZON"
                  ? "bg-[#FF6600] text-white shadow"
                  : "text-slate-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              AMAZON
            </button>
            <button
              onClick={() => setActivePlatform("MELI")}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activePlatform === "MELI"
                  ? "bg-[#FF6600] text-white shadow"
                  : "text-slate-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              MELI
            </button>
          </nav>

          {/* User profile / Meta */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400 font-medium">Logado como</p>
              <p className="text-xs font-semibold text-slate-200">davinicolau.dev@gmail.com</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-[#FF6600] font-bold text-sm">
              DN
            </div>
          </div>

        </div>
      </header>

      {/* SUB-HEADER APP CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        {/* Alerts Block */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3"
            >
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-rose-800">Aviso / Erro</h3>
                <p className="text-xs text-rose-700 mt-1">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 font-bold text-sm px-1">
                &times;
              </button>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3"
            >
              <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-emerald-800">Sucesso</h3>
                <p className="text-xs text-emerald-700 mt-1">{successMsg}</p>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 font-bold text-sm px-1">
                &times;
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIVE HUB RENDERING */}
        {activePlatform === "SHOPEE" && (
          <div className="flex flex-col gap-6">
            
            {/* HERO BAR - SYNC AND ACTION CONTROLS */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col lg:flex-row items-center justify-between gap-5 transition-all hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-50 rounded-xl text-[#FF6600]">
                  <Database size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                      Shopee: Spots & Tendências
                    </h2>
                    <span className="bg-orange-100 text-[#FF6600] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Mãe SPOT
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <Info size={13} className="text-slate-400" />
                    Mescla e deduz dados automaticamente usando a coluna <strong className="text-slate-700">CPF da Rota (Coluna D)</strong> como chave única.
                  </p>
                </div>
              </div>

              {/* Sync Actions Grid */}
              <div className="flex flex-wrap items-center justify-end gap-3 w-full lg:w-auto">
                
                {/* Reset button to clear db */}
                {records.length > 0 && (
                  <button
                    onClick={handleResetDatabase}
                    title="Limpar Banco de Dados"
                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* Import manual button */}
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:text-black hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Importar Manual</span>
                </button>

                {/* Primary Synchronization button */}
                <button
                  disabled={syncing}
                  onClick={handleSyncSpreadsheet}
                  className={`flex items-center gap-2 px-5 py-2.5 bg-[#FF6600] hover:bg-[#E05300] disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer select-none ${
                    syncing ? "animate-pulse" : ""
                  }`}
                >
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  <span>{syncing ? "Sincronizando..." : "Sincronizar com Planilha"}</span>
                </button>

                {/* External link to spreadsheet */}
                <a
                  href="https://docs.google.com/spreadsheets/d/1rkn2_W-Rl9CYfEH1LDKLfMwJrL-SliCQebOiMjHJgUg/edit"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-100"
                  title="Abrir Planilha Origem"
                >
                  <ExternalLink size={16} />
                </a>

              </div>
            </div>

            {/* SYNC METADATA BANNER */}
            {records.length > 0 && (
              <div className="bg-neutral-900 text-slate-300 rounded-lg px-4 py-2 text-xs flex items-center justify-between flex-wrap gap-2 shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Status: <strong className="text-white">{records.length} rotas persistidas</strong> no banco de dados local.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">Origem: ID <code className="bg-neutral-800/80 px-1 py-0.5 rounded text-slate-200">1rkn2_W...</code></span>
                  <span className="text-slate-500">|</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> Último Sinc: {records[0]?.syncedAt ? new Date(records[0].syncedAt).toLocaleString("pt-BR") : "Desconhecido"}</span>
                </div>
              </div>
            )}

            {/* MANUAL IMPORT SLIDE-OVER DRAWER */}
            <AnimatePresence>
              {isImportOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                    onClick={() => setIsImportOpen(false)}
                  />
                  <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col p-6 z-10"
                  >
                    <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Upload className="text-[#FF6600]" size={20} />
                        <h3 className="text-base font-bold text-slate-800">Importar Dados Manualmente</h3>
                      </div>
                      <button onClick={() => setIsImportOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-semibold p-1">
                        &times;
                      </button>
                    </div>

                    <form onSubmit={handleManualImport} className="flex-1 flex flex-col gap-4 mt-4 overflow-y-auto">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Instruções</label>
                        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                          Cole as linhas copiadas diretamente do Excel ou Google Sheets (incluindo o cabeçalho). O delimitador pode ser ponto-e-vírgula (;) ou vírgula (,). O sistema identificará automaticamente a coluna <strong className="text-[#FF6600]">D</strong> como chave única para evitar duplicidades.
                        </p>
                      </div>

                      <div className="flex-1 flex flex-col">
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Conteúdo CSV / Dados da Tabela</label>
                        <textarea
                          required
                          value={csvPasteText}
                          onChange={(e) => setCsvPasteText(e.target.value)}
                          placeholder="Week;Data de criacao;CPF;Status;Origem;Destino...&#10;W35;10/09/2026;63428;OWNER;GRU;BSB..."
                          className="flex-1 w-full p-3 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF6600] focus:border-transparent resize-none bg-slate-50"
                        />
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setIsImportOpen(false)}
                          className="flex-1 py-2 px-4 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={importing}
                          className="flex-1 py-2 px-4 bg-[#FF6600] hover:bg-[#E05300] text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                        >
                          {importing ? "Processando..." : "Importar Linhas"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
            
            {/* GLOBAL PANEL FILTERS & DATE RANGE (FILTRO DE DATA) */}
            {records.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden transition-all duration-200 hover:shadow-md">
                {/* Filter Header */}
                <div 
                  onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                  className="px-5 py-4 flex items-center justify-between border-b border-slate-50 cursor-pointer select-none bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-orange-50 text-[#FF6600] rounded-md">
                      <Filter size={15} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Painel de Filtros Inteligentes</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Filtre todas as abas, métricas e gráficos por período, semana ou rota</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Active indicators preview */}
                    {(selectedWeek !== "TODAS" || startDateStr || endDateStr || searchQuery.trim() !== "") && (
                      <span className="hidden sm:inline-block text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold">
                        Filtros Ativos
                      </span>
                    )}
                    <button className="text-xs font-bold text-[#FF6600] hover:text-[#E05300] focus:outline-none flex items-center gap-1">
                      {isFilterExpanded ? "Recolher" : "Expandir"}
                    </button>
                  </div>
                </div>

                {/* Filter Controls Body */}
                <AnimatePresence initial={false}>
                  {isFilterExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 border-t border-slate-50 grid grid-cols-1 md:grid-cols-12 gap-5">
                        
                        {/* 1. Date Range Filter (md:col-span-5) */}
                        <div className="md:col-span-5 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Calendar size={12} />
                            Filtro por Período (Criação)
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2.5 text-[10px] font-extrabold text-slate-400 uppercase pointer-events-none">De:</span>
                              <input
                                type="date"
                                value={startDateStr}
                                onChange={(e) => setStartDateStr(e.target.value)}
                                className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700"
                              />
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-2.5 text-[10px] font-extrabold text-slate-400 uppercase pointer-events-none">Até:</span>
                              <input
                                type="date"
                                value={endDateStr}
                                onChange={(e) => setEndDateStr(e.target.value)}
                                className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700"
                              />
                            </div>
                          </div>
                          
                          {/* Quick Date Presets */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-[9px] font-bold text-slate-400 mr-1">Atalhos:</span>
                            <button
                              onClick={() => handlePresetDate("7d")}
                              className="text-[9px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              7 Dias
                            </button>
                            <button
                              onClick={() => handlePresetDate("30d")}
                              className="text-[9px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              30 Dias
                            </button>
                            <button
                              onClick={() => handlePresetDate("month")}
                              className="text-[9px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              Este Mês
                            </button>
                            <button
                              onClick={() => handlePresetDate("year")}
                              className="text-[9px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            >
                              Este Ano
                            </button>
                            {(startDateStr || endDateStr) && (
                              <button
                                onClick={() => handlePresetDate("clear")}
                                className="text-[9px] font-bold px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                              >
                                Limpar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 2. Week Filter (md:col-span-3) */}
                        <div className="md:col-span-3 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Layers size={12} />
                            Semana (Week)
                          </label>
                          <div className="relative">
                            <select
                              value={selectedWeek}
                              onChange={(e) => setSelectedWeek(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700 cursor-pointer appearance-none animate-fadeIn"
                            >
                              <option value="TODAS">Todas as Semanas</option>
                              {uniqueWeeks.map(wk => (
                                <option key={wk} value={wk}>{wk}</option>
                              ))}
                            </select>
                            <Filter className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={13} />
                            <span className="absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[8px]">▼</span>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Agrupamento por semanas comerciais (W35, W36, etc.).
                          </p>
                        </div>

                        {/* 3. Search Field (md:col-span-4) */}
                        <div className="md:col-span-4 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Search size={12} />
                            Busca Livre
                          </label>
                          <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Código de rota, hubs, origens..."
                              className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] focus:border-[#FF6600] bg-white"
                            />
                            {searchQuery !== "" && (
                              <button 
                                onClick={() => setSearchQuery("")} 
                                className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 font-bold text-sm"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Busca instantânea em qualquer campo de texto.
                          </p>
                        </div>

                        {/* ROW 2: ADVANCED FILTERS */}
                        {/* 4. Filter Type (md:col-span-4) */}
                        <div className="md:col-span-4 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <TrendingUp size={12} />
                            Indicador / Tipo de Rota
                          </label>
                          <div className="relative">
                            <select
                              value={filterType}
                              onChange={(e) => setFilterType(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700 cursor-pointer appearance-none"
                            >
                              <option value="TODOS">Todos os Tipos (SPOT & TREND)</option>
                              <option value="SPOT">Somente SPOT</option>
                              <option value="TENDENCIA">Somente TENDÊNCIA</option>
                            </select>
                            <TrendingUp className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={13} />
                            <span className="absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[8px]">▼</span>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Filtrar por Spot ou Tendência de Rota.
                          </p>
                        </div>

                        {/* 5. Filter Status (md:col-span-4) */}
                        <div className="md:col-span-4 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle size={12} />
                            Resultado (Aceite)
                          </label>
                          <div className="relative">
                            <select
                              value={filterStatus}
                              onChange={(e) => setFilterStatus(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700 cursor-pointer appearance-none"
                            >
                              <option value="TODOS">Todos os Resultados</option>
                              <option value="ACEITAMOS">Aceitamos (OWNER)</option>
                              <option value="PERDEMOS">Perdemos (NO ACCEPT / OTH)</option>
                            </select>
                            <CheckCircle className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={13} />
                            <span className="absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[8px]">▼</span>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Selecione rotas ganhas/aceitas ou perdidas.
                          </p>
                        </div>

                        {/* 6. Filter Cancelled (md:col-span-4) */}
                        <div className="md:col-span-4 flex flex-col gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <XCircle size={12} />
                            Status de Cancelamento
                          </label>
                          <div className="relative">
                            <select
                              value={filterCancelled}
                              onChange={(e) => setFilterCancelled(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#FF6600] bg-white text-slate-700 cursor-pointer appearance-none"
                            >
                              <option value="TODOS">Todos os Status</option>
                              <option value="ATIVOS">Apenas Rotas Ativas</option>
                              <option value="CANCELADOS">Apenas Rotas Canceladas</option>
                            </select>
                            <XCircle className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={13} />
                            <span className="absolute right-3 top-2.5 text-slate-400 pointer-events-none text-[8px]">▼</span>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Permite avaliar as rotas ativas ou as canceladas no sistema.
                          </p>
                        </div>

                      </div>

                      {/* Filter Status summary footer */}
                      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>
                            Filtro Ativo: exibindo <strong className="text-slate-700">{filteredRecords.length}</strong> de <strong className="text-slate-700">{records.length}</strong> rotas carregadas.
                          </span>
                        </div>
                        {(selectedWeek !== "TODAS" || startDateStr || endDateStr || searchQuery !== "" || filterType !== "TODOS" || filterStatus !== "TODOS" || filterCancelled !== "TODOS") && (
                          <button
                            onClick={() => {
                              setSelectedWeek("TODAS");
                              setStartDateStr("");
                              setEndDateStr("");
                              setSearchQuery("");
                              setFilterType("TODOS");
                              setFilterStatus("TODOS");
                              setFilterCancelled("TODOS");
                            }}
                            className="text-[10px] font-extrabold text-[#FF6600] hover:text-[#E05300] uppercase tracking-wider transition-colors"
                          >
                            Limpar Filtros
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* KPI METRIC CARDS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* Card 1: Total de Rotas */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Rotas</span>
                  <span className="bg-blue-50 text-blue-600 p-1.5 rounded-lg"><Layers size={16} /></span>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-black text-black tracking-tight">{stats.totalRoutes}</div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {stats.totalRoutes - stats.totalCancelled} Ativas
                    <span className="text-slate-300">|</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {stats.totalCancelled} Canceladas
                  </p>
                </div>
              </div>

              {/* Card 2: Mix Indicators (SPOT vs TENDENCIA) */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Spots & Tendências</span>
                  <span className="bg-orange-50 text-[#FF6600] p-1.5 rounded-lg"><TrendingUp size={16} /></span>
                </div>
                <div className="mt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-[#FF6600]">SPOT: {stats.spotPercentage}%</span>
                    <span className="text-xs font-semibold text-slate-500">TREND: {stats.tendenciaPercentage}%</span>
                  </div>
                  
                  {/* Custom progress bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full mt-2 overflow-hidden flex">
                    <div className="bg-[#FF6600] h-full" style={{ width: `${stats.spotPercentage}%` }} />
                    <div className="bg-slate-400 h-full" style={{ width: `${stats.tendenciaPercentage}%` }} />
                  </div>
                  
                  <p className="text-[10px] text-slate-400 mt-2">
                    {stats.totalSpot} Spots vs {stats.totalTendencia} Tendências em volume
                  </p>
                </div>
              </div>

              {/* Card 3: Performance (Acceptance Rate) */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Taxa de Aceite</span>
                  <span className={`p-1.5 rounded-lg ${stats.acceptanceRate >= 70 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    <CheckCircle size={16} />
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  {/* Mini Circular Gauge in SVG */}
                  <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="28" cy="28" r="24" className="stroke-slate-100 fill-none" strokeWidth="4" />
                      <circle 
                        cx="28" 
                        cy="28" 
                        r="24" 
                        className={`fill-none transition-all duration-1000 ${stats.acceptanceRate >= 70 ? "stroke-emerald-500" : "stroke-amber-500"}`} 
                        strokeWidth="4" 
                        strokeDasharray={2 * Math.PI * 24}
                        strokeDashoffset={2 * Math.PI * 24 * (1 - stats.acceptanceRate / 100)}
                      />
                    </svg>
                    <span className="absolute text-xs font-extrabold text-slate-700">{stats.acceptanceRate}%</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-800">{stats.totalAccepted} Rotas</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">ACEITAMOS (OWNER)</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{stats.totalLost} Perdidas (Other/No Accept)</p>
                  </div>
                </div>
              </div>

              {/* Card 4: Canceladas Rate */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cancelamentos</span>
                  <span className={`p-1.5 rounded-lg ${stats.cancellationRate > 15 ? "bg-rose-50 text-rose-600 animate-pulse" : "bg-slate-100 text-slate-600"}`}>
                    <XCircle size={16} />
                  </span>
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-black">{stats.cancellationRate}%</span>
                    <span className="text-xs text-slate-500">({stats.totalCancelled} rotas)</span>
                  </div>
                  
                  {/* Status alert label */}
                  <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded mt-2.5 ${
                    stats.cancellationRate > 15 
                      ? "bg-rose-100 text-rose-700" 
                      : stats.cancellationRate > 5 
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {stats.cancellationRate > 15 
                      ? "FATOR CRÍTICO DE CANCELAMENTO" 
                      : stats.cancellationRate > 5 
                        ? "ATENÇÃO MODERADA" 
                        : "ESTÁVEL / SOB CONTROLE"}
                  </span>
                </div>
              </div>

            </div>

            {/* EMPTY STATE OR FULL INTERACTIVE ANALYTICS */}
            {records.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 py-16 px-4 flex flex-col items-center justify-center text-center shadow-inner">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-[#FF6600]">
                  <Database size={32} className="animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Sem dados persistidos</h3>
                <p className="text-sm text-slate-500 max-w-md mt-2">
                  Não encontramos rotas salvas no banco local. Conecte-se com a planilha mãe para importar o histórico completo.
                </p>
                <div className="flex gap-4 mt-6">
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Importação Manual
                  </button>
                  <button
                    disabled={syncing}
                    onClick={handleSyncSpreadsheet}
                    className="px-5 py-2 bg-[#FF6600] hover:bg-[#E05300] text-white text-xs font-bold rounded-lg shadow flex items-center gap-2"
                  >
                    <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                    Sincronizar Planilha
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                
                {/* SUB-TABS NAVIGATION BAR */}
                <div className="flex flex-wrap border border-slate-200/80 bg-white rounded-xl p-1 shadow-sm gap-1">
                  <button
                    onClick={() => setShopeeTab("geral")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      shopeeTab === "geral"
                        ? "bg-black text-white shadow"
                        : "text-slate-500 hover:text-black hover:bg-slate-50"
                    }`}
                  >
                    <TrendingUp size={14} />
                    <span>Visão Geral & Evolução</span>
                  </button>
                  <button
                    onClick={() => setShopeeTab("indicadores")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      shopeeTab === "indicadores"
                        ? "bg-black text-white shadow"
                        : "text-slate-500 hover:text-black hover:bg-slate-50"
                    }`}
                  >
                    <Layers size={14} />
                    <span>Spot vs. Tendência</span>
                  </button>
                  <button
                    onClick={() => setShopeeTab("rotas")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      shopeeTab === "rotas"
                        ? "bg-black text-white shadow"
                        : "text-slate-500 hover:text-black hover:bg-slate-50"
                    }`}
                  >
                    <MapPin size={14} />
                    <span>Hubs, Origens & Destinos</span>
                  </button>
                  <button
                    onClick={() => setShopeeTab("funil")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      shopeeTab === "funil"
                        ? "bg-black text-white shadow"
                        : "text-slate-500 hover:text-black hover:bg-slate-50"
                    }`}
                  >
                    <BarChart4 size={14} />
                    <span>Funil de Perdas & Rotas Críticas</span>
                  </button>
                  <button
                    onClick={() => setShopeeTab("base")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${
                      shopeeTab === "base"
                        ? "bg-black text-white shadow"
                        : "text-slate-500 hover:text-black hover:bg-slate-50"
                    }`}
                  >
                    <Database size={14} />
                    <span>Base de Dados Completa</span>
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {/* TAB 1: GERAL (Charts + Quick summary) */}
                  {shopeeTab === "geral" && (
                    <motion.div
                      key="geral"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-6"
                    >
                      {/* EVOLUTIVO DIÁRIO (Barras e Linhas com Evolução dos Dias) */}
                      <DailyEvolutionChart records={filteredRecords} />

                      {/* ROW 1: Weekly Evolutivo & Indicator Mix */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column: Weekly Trend Chart (takes 2 cols) */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 lg:col-span-2 flex flex-col">
                          <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800">Evolutivo Semanal de Desempenho</h3>
                              <p className="text-[11px] text-slate-400 mt-0.5">Últimas semanas disponíveis no banco de dados</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-semibold">
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-400 rounded-sm" /> % Aceite</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-400 rounded-sm" /> % Cancel</span>
                            </div>
                          </div>

                          {/* Custom HTML/SVG Bar Chart */}
                          <div className="flex-1 mt-6 min-h-[220px] flex items-end justify-between gap-2 border-b border-slate-100 pb-2 relative">
                            {weeklyChartData.length === 0 ? (
                              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Sem dados semanais disponíveis</div>
                            ) : (
                              weeklyChartData.map((d, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                  {/* Hover info card */}
                                  <div className="absolute bottom-full mb-2 bg-black text-white text-[10px] p-2 rounded shadow-xl hidden group-hover:block z-20 pointer-events-none w-32 font-medium">
                                    <p className="font-bold text-center border-b border-neutral-800 pb-1 mb-1 text-[#FF6600]">{d.week}</p>
                                    <p className="flex justify-between"><span>Rotas Total:</span> <span>{d.total}</span></p>
                                    <p className="flex justify-between"><span>Aceitas:</span> <span className="text-emerald-400">{d.accepted}</span></p>
                                    <p className="flex justify-between"><span>Canceladas:</span> <span className="text-rose-400">{d.cancelled}</span></p>
                                    <p className="flex justify-between border-t border-neutral-800 pt-1 mt-1 font-bold"><span>Mix Spot:</span> <span>{Math.round((d.spot/d.total)*100)}%</span></p>
                                  </div>

                                  {/* Double Bars */}
                                  <div className="w-full flex items-end justify-center gap-1.5 h-36">
                                    {/* Acceptance Rate bar */}
                                    <div 
                                      className="w-3 sm:w-5 bg-emerald-400 rounded-t-sm transition-all duration-500 hover:bg-emerald-500 cursor-pointer relative" 
                                      style={{ height: `${Math.max(d.acceptanceRate, 4)}%` }}
                                    >
                                      <span className="absolute bottom-full left-0 right-0 text-center text-[9px] font-bold text-emerald-800 opacity-0 group-hover:opacity-100">{d.acceptanceRate}%</span>
                                    </div>
                                    {/* Cancellation Rate bar */}
                                    <div 
                                      className="w-3 sm:w-5 bg-rose-400 rounded-t-sm transition-all duration-500 hover:bg-rose-500 cursor-pointer relative" 
                                      style={{ height: `${Math.max(d.cancellationRate, 4)}%` }}
                                    >
                                      <span className="absolute bottom-full left-0 right-0 text-center text-[9px] font-bold text-rose-800 opacity-0 group-hover:opacity-100">{d.cancellationRate}%</span>
                                    </div>
                                  </div>
                                  
                                  {/* Label */}
                                  <span className="text-[9px] font-bold text-slate-500 rotate-45 sm:rotate-0 mt-1 origin-center">{d.week}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Right Column: Key Breakdown Stats (takes 1 col) */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50">Análise de Indicador (SPOT vs TREND)</h3>
                            
                            <div className="flex flex-col gap-4 mt-4">
                              {/* SPOT details */}
                              <div className="bg-orange-50/50 p-3.5 rounded-lg border border-orange-100/50">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-[#FF6600]">SPOT</span>
                                  <span className="text-xs font-bold text-slate-600">{stats.totalSpot} Rotas</span>
                                </div>
                                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                                  <span>Vol. do Mix:</span>
                                  <span className="font-bold text-slate-700">{stats.spotPercentage}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                                  <div className="bg-[#FF6600] h-full" style={{ width: `${stats.spotPercentage}%` }} />
                                </div>
                              </div>

                              {/* TENDENCIA details */}
                              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-600">TENDÊNCIA (TREND)</span>
                                  <span className="text-xs font-bold text-slate-600">{stats.totalTendencia} Rotas</span>
                                </div>
                                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                                  <span>Vol. do Mix:</span>
                                  <span className="font-bold text-slate-700">{stats.tendenciaPercentage}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                                  <div className="bg-slate-500 h-full" style={{ width: `${stats.tendenciaPercentage}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-black rounded-lg p-3 text-white text-xs mt-4 flex items-center gap-2">
                            <Sparkles size={16} className="text-[#FF6600] shrink-0" />
                            <p className="leading-tight text-slate-300">
                              Os dados estão sincronizados localmente e prontos para consulta, mesmo se excluídos da planilha original.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ROW 2: Cruzamento de Resultados vs Cancelamentos */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Left Column: Comparative Bar Chart (col-span-2) */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 lg:col-span-2 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                              <div>
                                <h3 className="text-sm font-bold text-slate-800">Cruzamento: Resultado vs. Cancelamentos</h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">Fator de cancelamento nas rotas ganhas (Aceitamos) vs. perdidas (Perdemos)</p>
                              </div>
                              <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" /> Canceladas</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" /> Ativas (Executadas)</span>
                              </div>
                            </div>

                            {/* Chart Area */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-6">
                              
                              {/* 1. Aceitamos e Cancelaram Chart */}
                              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-start">
                                    <span className="text-xs font-black text-slate-700 uppercase">Rotas Aceitas (OWNER)</span>
                                    <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                      {cancellationCrossData.acceptedTotal} Total
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-1">Como se comportaram as rotas que aceitamos assumir.</p>
                                </div>

                                <div className="mt-6 space-y-4">
                                  {/* Bar Comparison Visual */}
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                      <span>Aceitamos e Cancelaram</span>
                                      <span className="text-rose-600">{cancellationCrossData.acceptedAndCancelled} ({cancellationCrossData.acceptedCancelRate}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-rose-400 to-rose-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${cancellationCrossData.acceptedCancelRate}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                      <span>Aceitamos e Continuam Ativas</span>
                                      <span className="text-emerald-600">{cancellationCrossData.acceptedAndActive} ({100 - cancellationCrossData.acceptedCancelRate}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${100 - cancellationCrossData.acceptedCancelRate}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 2. Perdemos e Cancelaram Chart */}
                              <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 flex flex-col justify-between">
                                <div>
                                  <div className="flex justify-between items-start">
                                    <span className="text-xs font-black text-slate-700 uppercase">Rotas Perdidas</span>
                                    <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      {cancellationCrossData.lostTotal} Total
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-1">Status de cancelamento das rotas não aceitas.</p>
                                </div>

                                <div className="mt-6 space-y-4">
                                  {/* Bar Comparison Visual */}
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                      <span>Perdemos e Cancelaram</span>
                                      <span className="text-rose-600">{cancellationCrossData.lostAndCancelled} ({cancellationCrossData.lostCancelRate}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-rose-400 to-rose-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${cancellationCrossData.lostCancelRate}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                      <span>Perdemos e Continuam Ativas</span>
                                      <span className="text-slate-600">{cancellationCrossData.lostAndActive} ({100 - cancellationCrossData.lostCancelRate}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-gradient-to-r from-slate-400 to-slate-500 h-full rounded-full transition-all duration-500" 
                                        style={{ width: `${100 - cancellationCrossData.lostCancelRate}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </div>
                        </div>

                        {/* Right Column: Comparative Metrics Summary (col-span-1) */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-slate-50">Distribuição Consolidada</h3>
                            
                            <div className="space-y-3.5 mt-4">
                              {/* Total Canceladas */}
                              <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-100/50 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Total de Canceladas</span>
                                  <span className="text-lg font-black text-slate-800">
                                    {cancellationCrossData.acceptedAndCancelled + cancellationCrossData.lostAndCancelled} rotas
                                  </span>
                                </div>
                                <span className="bg-rose-100 text-rose-700 font-extrabold text-xs px-2.5 py-1 rounded">
                                  {stats.totalCancelled} no Geral
                                </span>
                              </div>

                              {/* Breakdown comparative details list */}
                              <div className="space-y-2">
                                <div className="flex justify-between text-[11px] text-slate-500 border-b border-slate-50 pb-1.5">
                                  <span>Aceitas e Canceladas:</span>
                                  <strong className="text-rose-600">{cancellationCrossData.acceptedAndCancelled} rotas</strong>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500 border-b border-slate-50 pb-1.5">
                                  <span>Perdidas e Canceladas:</span>
                                  <strong className="text-rose-600">{cancellationCrossData.lostAndCancelled} rotas</strong>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500 border-b border-slate-50 pb-1.5">
                                  <span>Aceitas e Ativas:</span>
                                  <strong className="text-emerald-600">{cancellationCrossData.acceptedAndActive} rotas</strong>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Perdidas e Ativas:</span>
                                  <strong className="text-slate-600">{cancellationCrossData.lostAndActive} rotas</strong>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-[#FF6600]/5 border border-[#FF6600]/10 rounded-lg p-3 text-[11px] text-slate-600 mt-4">
                            <h4 className="font-bold text-[#FF6600] mb-0.5">💡 Resumo Analítico</h4>
                            <p className="leading-tight">
                              {cancellationCrossData.acceptedAndCancelled > cancellationCrossData.lostAndCancelled 
                                ? "As quebras de rota ocorrem com mais frequência em rotas que foram aceitas por nós. Sugere-se alinhar as janelas operacionais com o fluxo da Shopee."
                                : "Maior parte dos cancelamentos ocorreu em rotas que já havíamos perdido, minimizando o impacto operacional sobre a frota da Lösung Express."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: INDICADORES (Spot vs Trend deep performance) */}
                  {shopeeTab === "indicadores" && (
                    <motion.div
                      key="indicadores"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn"
                    >
                      {/* Card A: Deep Spot performance */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#FF6600]" />
                              <h3 className="text-sm font-bold text-slate-800">Desempenho de Rotas SPOT</h3>
                            </div>
                            <span className="text-xs font-bold text-[#FF6600] bg-orange-50 px-2 py-0.5 rounded">
                              {deepAnalytics.spotConversion.total} rotas
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-3 my-6">
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Aceitas</span>
                              <p className="text-lg font-black text-emerald-600 mt-1">{deepAnalytics.spotConversion.accepted}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Perdidas</span>
                              <p className="text-lg font-black text-amber-600 mt-1">{deepAnalytics.spotConversion.lost}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Canceladas</span>
                              <p className="text-lg font-black text-rose-600 mt-1">{deepAnalytics.spotConversion.cancelled}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                                <span>Taxa de Aceite SPOT:</span>
                                <span className="font-bold text-[#FF6600]">{deepAnalytics.spotConversion.acceptanceRate}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full" style={{ width: `${deepAnalytics.spotConversion.acceptanceRate}%` }} />
                              </div>
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                                <span>Taxa de Cancelamento SPOT:</span>
                                <span className="font-bold text-rose-600">{deepAnalytics.spotConversion.cancellationRate}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-rose-500 h-full" style={{ width: `${deepAnalytics.spotConversion.cancellationRate}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 bg-orange-50/50 p-3 rounded-lg text-[11px] text-slate-600 border border-orange-100/50">
                          <strong>Análise Spot:</strong> Rotas Spot são acionadas sob demanda imediata. Manter a taxa de aceite acima de 75% indica excelente agilidade de frota.
                        </div>
                      </div>

                      {/* Card B: Deep Trend performance */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                              <h3 className="text-sm font-bold text-slate-800">Desempenho de Rotas TENDÊNCIA</h3>
                            </div>
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {deepAnalytics.trendConversion.total} rotas
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-3 my-6">
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Aceitas</span>
                              <p className="text-lg font-black text-emerald-600 mt-1">{deepAnalytics.trendConversion.accepted}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Perdidas</span>
                              <p className="text-lg font-black text-amber-600 mt-1">{deepAnalytics.trendConversion.lost}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg text-center">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Canceladas</span>
                              <p className="text-lg font-black text-rose-600 mt-1">{deepAnalytics.trendConversion.cancelled}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                                <span>Taxa de Aceite TENDÊNCIA:</span>
                                <span className="font-bold text-slate-700">{deepAnalytics.trendConversion.acceptanceRate}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full" style={{ width: `${deepAnalytics.trendConversion.acceptanceRate}%` }} />
                              </div>
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                                <span>Taxa de Cancelamento TENDÊNCIA:</span>
                                <span className="font-bold text-rose-600">{deepAnalytics.trendConversion.cancellationRate}%</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-rose-500 h-full" style={{ width: `${deepAnalytics.trendConversion.cancellationRate}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 bg-slate-50 p-3 rounded-lg text-[11px] text-slate-600 border border-slate-100">
                          <strong>Análise Tendência:</strong> Rotas de tendência representam padrões recorrentes ou sazonais. Taxas de cancelamento elevadas aqui exigem renegociação de SLAs contratuais.
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: ROTAS (Origins, Destinations and Hubs rankings) */}
                  {shopeeTab === "rotas" && (
                    <motion.div
                      key="rotas"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn"
                    >
                      {/* Top Origins Card */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col">
                        <div className="pb-3 border-b border-slate-50">
                          <h3 className="text-sm font-bold text-slate-800">Top 5 Origens mais Frequentes</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Pontos de partida com maior volume de saídas</p>
                        </div>
                        <div className="divide-y divide-slate-100 mt-4 flex-1">
                          {deepAnalytics.topOrigins.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">Nenhuma origem identificada</div>
                          ) : (
                            deepAnalytics.topOrigins.map((orig, i) => (
                              <div key={i} className="py-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <span className="text-xs font-bold text-slate-800">{orig.name}</span>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-700">{orig.total} rotas</span>
                                    <span className="text-slate-300 mx-1.5">|</span>
                                    <span className="text-emerald-600 font-semibold">{orig.acceptanceRate}% Aceite</span>
                                  </div>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    orig.cancelled > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                                  }`}>
                                    {orig.cancelled} Canc.
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Top Destinations Card */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col">
                        <div className="pb-3 border-b border-slate-50">
                          <h3 className="text-sm font-bold text-slate-800">Top 5 Destinos mais Frequentes</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">Cidades ou Hubs com maior fluxo de chegada</p>
                        </div>
                        <div className="divide-y divide-slate-100 mt-4 flex-1">
                          {deepAnalytics.topDestinations.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">Nenhum destino identificado</div>
                          ) : (
                            deepAnalytics.topDestinations.map((dst, i) => (
                              <div key={i} className="py-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <span className="text-xs font-bold text-slate-800">{dst.name}</span>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-700">{dst.total} rotas</span>
                                    <span className="text-slate-300 mx-1.5">|</span>
                                    <span className="text-emerald-600 font-semibold">{dst.acceptanceRate}% Aceite</span>
                                  </div>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    dst.cancelled > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                                  }`}>
                                    {dst.cancelled} Canc.
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3.5: FUNIL DE CONVERSÃO E ROTAS CRÍTICAS */}
                  {shopeeTab === "funil" && (
                    <motion.div
                      key="funil"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn"
                    >
                      {/* Left Column: Funil de Conversão Visual */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 lg:col-span-1 flex flex-col justify-between">
                        <div>
                          <div className="pb-3 border-b border-slate-50 flex items-center gap-2">
                            <Percent size={16} className="text-[#FF6600]" />
                            <h3 className="text-sm font-bold text-slate-800">Funil de Conversão Operacional</h3>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 mb-6">
                            Fluxo de rotas analisadas versus aprovação e cancelamentos na Shopee.
                          </p>

                          {/* Funnel graphic steps */}
                          <div className="space-y-4">
                            {/* Step 1 */}
                            <div className="relative">
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between z-10 relative">
                                <div>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Etapa 1: Analisadas</span>
                                  <span className="text-xs font-extrabold text-slate-700">Demanda Total Mapeada</span>
                                </div>
                                <span className="text-sm font-black text-slate-800">{lossAnalytics.funnel.total} rotas</span>
                              </div>
                              <div className="w-full bg-[#FF6600]/10 h-1 rounded-b-lg absolute bottom-0 left-0 right-0" />
                            </div>

                            {/* Chevron separator */}
                            <div className="text-center text-slate-300 text-xs py-0.5">▼</div>

                            {/* Step 2 */}
                            <div className="relative">
                              <div className="bg-orange-50/40 p-3 rounded-lg border border-orange-100/50 flex items-center justify-between z-10 relative">
                                <div>
                                  <span className="text-[9px] font-bold text-[#FF6600] uppercase tracking-wider block">Etapa 2: Pré-Aceitas (Owner)</span>
                                  <span className="text-xs font-extrabold text-slate-700">Taxa de Aceite Teórica ({lossAnalytics.funnel.acceptancePercent}%)</span>
                                </div>
                                <span className="text-sm font-black text-[#FF6600]">{lossAnalytics.funnel.accepted} rotas</span>
                              </div>
                              <div className="w-full bg-[#FF6600]/20 h-1 rounded-b-lg absolute bottom-0 left-0 right-0" />
                            </div>

                            {/* Chevron separator */}
                            <div className="text-center text-slate-300 text-xs py-0.5">▼</div>

                            {/* Step 3 */}
                            <div className="relative">
                              <div className="bg-rose-50/40 p-3 rounded-lg border border-rose-100/50 flex items-center justify-between z-10 relative">
                                <div>
                                  <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider block">Vazamento: Canceladas ({lossAnalytics.funnel.cancelledPercent}%)</span>
                                  <span className="text-xs font-extrabold text-slate-700">Perdas pós-aceite na operação</span>
                                </div>
                                <span className="text-sm font-black text-rose-600">-{lossAnalytics.funnel.cancelled} rotas</span>
                              </div>
                              <div className="w-full bg-rose-500/20 h-1 rounded-b-lg absolute bottom-0 left-0 right-0" />
                            </div>

                            {/* Chevron separator */}
                            <div className="text-center text-slate-300 text-xs py-0.5">▼</div>

                            {/* Step 4 */}
                            <div className="relative">
                              <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100/50 flex items-center justify-between z-10 relative">
                                <div>
                                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Etapa Final: Sucesso Líquido</span>
                                  <span className="text-xs font-extrabold text-slate-700">Rotas Executadas c/ Sucesso ({lossAnalytics.funnel.netSuccessPercent}%)</span>
                                </div>
                                <span className="text-sm font-black text-emerald-600">{lossAnalytics.funnel.netAccepted} rotas</span>
                              </div>
                              <div className="w-full bg-emerald-500/20 h-1 rounded-b-lg absolute bottom-0 left-0 right-0" />
                            </div>
                          </div>
                        </div>

                        {/* Recommendation Callout */}
                        <div className="mt-6 bg-black text-white rounded-lg p-3.5 border border-neutral-800">
                          <div className="flex gap-2.5 items-start">
                            <Sparkles className="text-orange-400 mt-0.5 shrink-0 animate-pulse" size={15} />
                            <div>
                              <h4 className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">Insight de Otimização</h4>
                              <p className="text-[10px] text-slate-300 leading-normal mt-1">
                                {lossAnalytics.funnel.cancelledPercent > 15 
                                  ? "Gargalo Crítico: O cancelamento operacional está alto. Priorize auditorias de rotas Spot, pois elas costumam ter mais flutuações."
                                  : "Bom aproveitamento operacional! Mantenha a sincronia de horários de saída de coleta para sustentar estes índices."}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Rotas Críticas e Cancelamentos (takes 2 cols) */}
                      <div className="lg:col-span-2 flex flex-col gap-6">
                        
                        {/* 1. Rotas com Maior Índice de Cancelamento */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                          <div className="pb-3 border-b border-slate-50 flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800">Rotas com maior Taxa de Cancelamento</h3>
                              <p className="text-[11px] text-slate-400 mt-0.5">Top 5 rotas com maior índice de quebra operacional (mín. 1 cancelamento)</p>
                            </div>
                            <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-2.5 py-1 rounded-full border border-rose-100 flex items-center gap-1 border border-rose-200">
                              <AlertTriangle size={10} /> Alerta
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100 mt-4">
                            {lossAnalytics.worstCancellationRoutes.length === 0 ? (
                              <div className="py-10 text-center text-xs text-slate-400">Nenhum cancelamento registrado nas rotas filtradas</div>
                            ) : (
                              lossAnalytics.worstCancellationRoutes.map((r, i) => (
                                <div key={i} className="py-3.5 flex items-center justify-between gap-4 border-b border-slate-50 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold flex items-center justify-center border border-rose-100">
                                      {i + 1}
                                    </span>
                                    <div>
                                      <span className="text-xs font-bold text-slate-800">{r.path}</span>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Código (CPF): <span className="font-mono text-slate-600">{r.code}</span></p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-6">
                                    <div className="text-right">
                                      <span className="text-xs font-bold text-slate-700">{r.cancelled} Cancelados</span>
                                      <p className="text-[10px] text-slate-400 mt-0.5">De {r.total} ocorrências</p>
                                    </div>
                                    <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                                      r.cancelRate >= 50 
                                        ? "bg-rose-100 text-rose-700 border border-rose-200" 
                                        : "bg-amber-100 text-amber-700 border border-amber-200"
                                    }`}>
                                      {r.cancelRate}% Quebra
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* 2. Rotas com Baixo Aproveitamento de Aceite */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                          <div className="pb-3 border-b border-slate-50 flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800">Rotas de Alto Volume com Baixa Aceitação</h3>
                              <p className="text-[11px] text-slate-400 mt-0.5">Top 5 rotas com menor conversão teórica de Aceite</p>
                            </div>
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-full border border-slate-200">
                              Mín. 1 ocorrência
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100 mt-4">
                            {lossAnalytics.lowAcceptanceVolumeRoutes.length === 0 ? (
                              <div className="py-10 text-center text-xs text-slate-400">Nenhuma rota identificada</div>
                            ) : (
                              lossAnalytics.lowAcceptanceVolumeRoutes.map((r, i) => (
                                <div key={i} className="py-3.5 flex items-center justify-between gap-4 border-b border-slate-50 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold flex items-center justify-center border border-amber-100">
                                      {i + 1}
                                    </span>
                                    <div>
                                      <span className="text-xs font-bold text-slate-800">{r.path}</span>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Código (CPF): <span className="font-mono text-slate-600">{r.code}</span></p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-6">
                                    <div className="text-right">
                                      <span className="text-xs font-bold text-slate-700">{r.accepted} Aceitos / {r.lost} Perdidos</span>
                                      <p className="text-[10px] text-slate-400 mt-0.5">Total de {r.total} demandas</p>
                                    </div>
                                    <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${
                                      r.successRate <= 30 
                                        ? "bg-red-50 text-red-700 border border-red-200" 
                                        : "bg-slate-100 text-slate-700 border border-slate-200"
                                    }`}>
                                      {r.successRate}% Aceite
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}

                  {/* TAB 4: BASE DE DADOS COMPLETA (searchable, filterable table view) */}
                  {shopeeTab === "base" && (
                    <motion.div
                      key="base"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4 animate-fadeIn"
                    >
                      {/* SEARCH, WEEK FILTERS, CONTROL BAR */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        
                        {/* Left: Active Filters Summary Badges */}
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                          <span className="text-xs font-bold text-slate-500 mr-1">Filtros Aplicados:</span>
                          
                          {selectedWeek !== "TODAS" ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Semana: {selectedWeek}
                              <button 
                                onClick={() => setSelectedWeek("TODAS")} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Remover filtro de semana"
                              >
                                &times;
                              </button>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full border border-slate-100">
                              Todas as Semanas
                            </span>
                          )}

                          {(startDateStr || endDateStr) ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Período: {startDateStr ? new Date(startDateStr + "T00:00:00").toLocaleDateString("pt-BR") : "Mín"} - {endDateStr ? new Date(endDateStr + "T00:00:00").toLocaleDateString("pt-BR") : "Máx"}
                              <button 
                                onClick={() => { setStartDateStr(""); setEndDateStr(""); }} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Limpar período"
                              >
                                &times;
                              </button>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full border border-slate-100">
                              Todo o Histórico
                            </span>
                          )}

                          {searchQuery.trim() !== "" ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Busca: "{searchQuery}"
                              <button 
                                onClick={() => setSearchQuery("")} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Limpar busca"
                              >
                                &times;
                              </button>
                            </span>
                          ) : null}

                          {filterType !== "TODOS" ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Tipo: {filterType}
                              <button 
                                onClick={() => setFilterType("TODOS")} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Remover filtro de tipo"
                              >
                                &times;
                              </button>
                            </span>
                          ) : null}

                          {filterStatus !== "TODOS" ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Resultado: {filterStatus === "ACEITAMOS" ? "ACEITAS" : "PERDIDAS"}
                              <button 
                                onClick={() => setFilterStatus("TODOS")} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Remover filtro de resultado"
                              >
                                &times;
                              </button>
                            </span>
                          ) : null}

                          {filterCancelled !== "TODOS" ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-50 text-[#FF6600] rounded-full border border-orange-100 flex items-center gap-1">
                              Status: {filterCancelled === "CANCELADOS" ? "CANCELADAS" : "ATIVAS"}
                              <button 
                                onClick={() => setFilterCancelled("TODOS")} 
                                className="text-slate-400 hover:text-slate-600 font-black ml-1 text-[11px]"
                                title="Remover filtro de cancelamento"
                              >
                                &times;
                              </button>
                            </span>
                          ) : null}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full md:w-auto">
                          
                          <span className="text-xs text-slate-400 font-medium">
                            Filtrados: <strong className="text-slate-700">{sortedRecords.length} de {records.length}</strong>
                          </span>

                          <button
                            onClick={handleExportCSV}
                            disabled={sortedRecords.length === 0}
                            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 text-slate-600 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                            title="Exportar dados filtrados para CSV"
                          >
                            <Download size={14} />
                            <span className="hidden sm:inline">Exportar CSV</span>
                          </button>

                        </div>

                      </div>

                      {/* ROUTES DATA TABLE CONTAINER */}
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                        
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("week")}>
                                  <div className="flex items-center gap-1">
                                    Semana
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("creationDate")}>
                                  <div className="flex items-center gap-1">
                                    Criação
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("routeCode")}>
                                  <div className="flex items-center gap-1">
                                    Código (CPF Rota)
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("type")}>
                                  <div className="flex items-center gap-1">
                                    Indicador
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("status")}>
                                  <div className="flex items-center gap-1">
                                    Status
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors select-none" onClick={() => requestSort("cancelled")}>
                                  <div className="flex items-center gap-1">
                                    Cancelada?
                                    <ArrowUpDown size={12} className="text-slate-400" />
                                  </div>
                                </th>
                                <th className="p-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  Rota Completa (Origem ➔ Destino)
                                </th>
                              </tr>
                            </thead>
                            
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {paginatedRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="p-8 text-center text-slate-400 font-medium bg-slate-50/50">
                                    Nenhuma rota corresponde aos filtros ou busca selecionados.
                                  </td>
                                </tr>
                              ) : (
                                paginatedRecords.map((r, idx) => {
                                  return (
                                    <tr 
                                      key={r.routeCode || idx} 
                                      className={`transition-colors hover:bg-slate-50/50 ${
                                        r.cancelled 
                                          ? "bg-rose-50/30 text-slate-400" 
                                          : r.status === "ACEITAMOS"
                                            ? "bg-emerald-50/10"
                                            : ""
                                      }`}
                                    >
                                      <td className="p-3.5 font-bold text-slate-700">{r.week}</td>
                                      <td className="p-3.5 text-slate-500 flex items-center gap-1"><Calendar size={12} className="text-slate-400" /> {r.creationDate}</td>
                                      <td className="p-3.5 font-mono text-slate-600 select-all">{r.routeCode}</td>
                                      <td className="p-3.5">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          r.type === "SPOT" 
                                            ? "bg-orange-100 text-[#FF6600]" 
                                            : "bg-slate-100 text-slate-600"
                                        }`}>
                                          {r.type}
                                        </span>
                                      </td>
                                      <td className="p-3.5">
                                        {r.status === "ACEITAMOS" ? (
                                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded text-xs flex items-center gap-1 w-max">
                                            <CheckCircle size={11} className="text-emerald-600" />
                                            ACEITAMOS
                                          </span>
                                        ) : r.status === "PERDEMOS" ? (
                                          <span className="bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded text-xs flex items-center gap-1 w-max">
                                            <XCircle size={11} className="text-amber-600" />
                                            PERDEMOS
                                          </span>
                                        ) : (
                                          <span className="bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-xs flex items-center gap-1 w-max">
                                            OUTRO
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-3.5">
                                        {r.cancelled ? (
                                          <span className="bg-rose-100 text-rose-700 border border-rose-200 font-bold px-2 py-0.5 rounded flex items-center gap-1 w-max text-[10px]">
                                            <XCircle size={10} /> SIM
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[10px]">Não</span>
                                        )}
                                      </td>
                                      <td className="p-3.5 font-medium text-slate-700">
                                        <div className="flex items-center gap-1.5 max-w-xs sm:max-w-md truncate">
                                          <MapPin size={12} className={r.cancelled ? "text-slate-300" : "text-[#FF6600] shrink-0"} />
                                          <span className={r.cancelled ? "line-through text-slate-400" : ""}>{r.routeComplete}</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* TABLE PAGINATION FOOTER */}
                        {sortedRecords.length > 0 && (
                          <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                            
                            {/* Left: Row range info */}
                            <div className="text-slate-500 text-center sm:text-left">
                              Mostrando <strong className="text-slate-700">{Math.min(sortedRecords.length, (currentPage - 1) * rowsPerPage + 1)}-{Math.min(sortedRecords.length, currentPage * rowsPerPage)}</strong> de <strong className="text-slate-700">{sortedRecords.length}</strong> rotas filtradas.
                            </div>

                            {/* Center: Rows per page selector */}
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">Linhas por página:</span>
                              <select
                                value={rowsPerPage}
                                onChange={(e) => {
                                  setRowsPerPage(Number(e.target.value));
                                  setCurrentPage(1);
                                }}
                                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
                              >
                                <option value={15}>15</option>
                                <option value={30}>30</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </div>

                            {/* Right: Page Navigation Buttons */}
                            <div className="flex items-center gap-1">
                              <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                className="p-1.5 border border-slate-200 rounded hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronLeft size={14} />
                              </button>
                              
                              <div className="px-2.5 font-bold text-slate-700">
                                Página {currentPage} de {totalPages}
                              </div>

                              <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                className="p-1.5 border border-slate-200 rounded hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>

                          </div>
                        )}

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>
        )}

        {/* AMAZON PLATFORM HUB PLACEHOLDER */}
        {activePlatform === "AMAZON" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6 text-amber-500">
              <TrendingUp size={40} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Avaliação de KPIs - Amazon</h2>
            <p className="text-sm text-slate-500 max-w-lg mt-3 leading-relaxed">
              Esta seção está reservada para o painel de Spots, Tendências e SLAs de entregas da <strong className="text-slate-700">Amazon</strong> para a Lösung Express.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 w-48 text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Status do Módulo</span>
                <p className="text-sm font-bold text-amber-600 mt-1">Próxima Fase (Planejado)</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 w-48 text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Integrações Previstas</span>
                <p className="text-sm font-bold text-slate-700 mt-1">Amazon Seller API & Planilhas Mestre</p>
              </div>
            </div>
            <button
              onClick={() => setActivePlatform("SHOPEE")}
              className="mt-10 px-5 py-2.5 bg-[#FF6600] text-white text-xs font-bold rounded-lg hover:bg-[#E05300] transition-colors shadow hover:shadow-md cursor-pointer"
            >
              Voltar para Shopee Dashboard
            </button>
          </div>
        )}

        {/* MELI PLATFORM HUB PLACEHOLDER */}
        {activePlatform === "MELI" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center flex flex-col items-center justify-center py-20">
            <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mb-6 text-yellow-500">
              <TrendingUp size={40} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Avaliação de KPIs - Mercado Livre</h2>
            <p className="text-sm text-slate-500 max-w-lg mt-3 leading-relaxed">
              Módulo de análise de performance de faturamento, coletas, devoluções e cancelamentos do <strong className="text-slate-700">Mercado Livre (MELI)</strong>.
            </p>
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 w-48 text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Status do Módulo</span>
                <p className="text-sm font-bold text-yellow-600 mt-1">Em Especificação</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 w-48 text-left">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Indicadores Planejados</span>
                <p className="text-sm font-bold text-slate-700 mt-1">Fulfillment SLA & Rotas Mercado Envios</p>
              </div>
            </div>
            <button
              onClick={() => setActivePlatform("SHOPEE")}
              className="mt-10 px-5 py-2.5 bg-[#FF6600] text-white text-xs font-bold rounded-lg hover:bg-[#E05300] transition-colors shadow hover:shadow-md cursor-pointer"
            >
              Voltar para Shopee Dashboard
            </button>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-black text-slate-400 py-6 border-t border-neutral-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p className="text-slate-500">
            &copy; {new Date().getFullYear()} Lösung Express. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block mr-1"></span>
            <span>Sistema Offline-Ready / Local Storage Conectado</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
