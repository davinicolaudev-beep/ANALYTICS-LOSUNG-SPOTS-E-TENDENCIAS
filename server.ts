import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || "https://sghpcukxomrpgnjmndly.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Local fallback directory for offline resiliency
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "shopee_spots.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ShopeeSpotRecord {
  week: string;
  creationDate: string;
  routeCode: string;
  type: "SPOT" | "TENDENCIA" | "OUTRO";
  status: "ACEITAMOS" | "PERDEMOS" | "OUTRO";
  cancelled: boolean;
  routeOrigin: string;
  routeDest: string;
  routeComplete: string;
  syncedAt: string;
}

// Local fallback handlers
function loadLocalRecordsFallback(): ShopeeSpotRecord[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Error loading local fallback file:", error);
  }
  return [];
}

function saveLocalRecordsFallback(records: ShopeeSpotRecord[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving local fallback file:", error);
  }
}

// Master Asynchronous Supabase Database Handlers
async function loadRecords(): Promise<ShopeeSpotRecord[]> {
  let supabaseRecords: ShopeeSpotRecord[] = [];
  try {
    const { data, error } = await supabase.from("shopee_routes").select("*").range(0, 9999);
    if (!error && data && Array.isArray(data)) {
      supabaseRecords = data.map((row: any) => ({
        week: row.week || "N/A",
        creationDate: row.creation_date || row.creationDate || "N/A",
        routeCode: row.route_code || row.routeCode || "",
        type: row.type || "OUTRO",
        status: row.status || "OUTRO",
        cancelled: !!row.cancelled,
        routeOrigin: row.route_origin || row.routeOrigin || "N/A",
        routeDest: row.route_dest || row.routeDest || "N/A",
        routeComplete: row.route_complete || row.routeComplete || "N/A",
        syncedAt: row.synced_at || row.syncedAt || new Date().toISOString()
      }));
    }
  } catch (error) {
    console.warn("Supabase loading warning:", error);
  }

  const localRecords = loadLocalRecordsFallback();

  // Also parse the attached CSV if available to ensure all 1000+ historical routes are included
  const csvRecords: ShopeeSpotRecord[] = [];
  try {
    const csvPath = path.join(process.cwd(), "public", "assets", "aistudio", "banco_de_spots_adaptado_v2_7537094f.csv");
    if (fs.existsSync(csvPath)) {
      const csvText = fs.readFileSync(csvPath, "utf-8");
      const parsedLines = parseCSV(csvText);
      if (parsedLines.length >= 2) {
        const dummyMap = new Map<string, ShopeeSpotRecord>();
        processShopeeRows(parsedLines, dummyMap);
        dummyMap.forEach(r => csvRecords.push(r));
      }
    }
  } catch (err) {
    console.warn("Error parsing attached CSV in loadRecords:", err);
  }

  // Merge records using routeCode as unique key: Supabase + Local + CSV
  const map = new Map<string, ShopeeSpotRecord>();
  supabaseRecords.forEach(r => {
    if (r.routeCode) map.set(r.routeCode, r);
  });
  localRecords.forEach(r => {
    if (r.routeCode && !map.has(r.routeCode)) {
      map.set(r.routeCode, r);
    }
  });
  csvRecords.forEach(r => {
    if (r.routeCode && !map.has(r.routeCode)) {
      map.set(r.routeCode, r);
    }
  });

  const merged = Array.from(map.values());
  saveLocalRecordsFallback(merged);

  // If local/CSV had more records than Supabase, push the merged dataset to Supabase in background
  if (merged.length > supabaseRecords.length) {
    console.log(`Restoring ${merged.length} total records to Supabase (Supabase had ${supabaseRecords.length}, local had ${localRecords.length}, csv had ${csvRecords.length})...`);
    saveRecords(merged).catch(e => console.error("Background sync to Supabase failed:", e));
  }

  return merged;
}

async function saveRecords(records: ShopeeSpotRecord[]): Promise<void> {
  // Always update the local cache fallback
  saveLocalRecordsFallback(records);

  try {
    const payload = records.map(r => ({
      route_code: r.routeCode,
      week: r.week,
      creation_date: r.creationDate,
      type: r.type,
      status: r.status,
      cancelled: r.cancelled,
      route_origin: r.routeOrigin,
      route_dest: r.routeDest,
      route_complete: r.routeComplete,
      synced_at: r.syncedAt
    }));

    const batchSize = 500;
    for (let i = 0; i < payload.length; i += batchSize) {
      const chunk = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("shopee_routes").upsert(chunk, { onConflict: "route_code" });
      if (error) throw error;
    }
    console.log(`Successfully persisted ${records.length} records to Supabase.`);
  } catch (error) {
    console.warn("Supabase save warning (local cache preserved):", error);
  }
}

async function saveChangedRecords(records: ShopeeSpotRecord[]): Promise<void> {
  if (!records || records.length === 0) return;
  try {
    const payload = records.map(r => ({
      route_code: r.routeCode,
      week: r.week,
      creation_date: r.creationDate,
      type: r.type,
      status: r.status,
      cancelled: r.cancelled,
      route_origin: r.routeOrigin,
      route_dest: r.routeDest,
      route_complete: r.routeComplete,
      synced_at: r.syncedAt
    }));

    const batchSize = 500;
    for (let i = 0; i < payload.length; i += batchSize) {
      const chunk = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("shopee_routes").upsert(chunk, { onConflict: "route_code" });
      if (error) throw error;
    }
    console.log(`Successfully persisted ${records.length} changed records to Supabase.`);
  } catch (error) {
    console.warn("Supabase save warning (local cache preserved):", error);
  }
}

async function clearRecordsInSupabase(): Promise<void> {
  saveLocalRecordsFallback([]);
  try {
    const { error } = await supabase.from("shopee_routes").delete().neq("route_code", "");
    if (error) throw error;
    console.log("Cleared all records from Supabase.");
  } catch (error) {
    console.warn("Supabase delete warning (local cache cleared):", error);
  }
}

// Robust CSV Parsing helper supporting multiline quotes and separators
function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  const firstLineEnd = csvText.indexOf("\n");
  const headerSample = firstLineEnd !== -1 ? csvText.substring(0, firstLineEnd) : csvText;
  const semicolons = (headerSample.match(/;/g) || []).length;
  const commas = (headerSample.match(/,/g) || []).length;
  const delimiter = semicolons > commas ? ";" : ",";

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(currentValue.trim());
      currentValue = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(currentValue.trim());
      if (row.length > 0 && row.some(cell => cell !== "")) {
        lines.push(row);
      }
      row = [];
      currentValue = "";
    } else {
      currentValue += char;
    }
  }
  if (currentValue || row.length > 0) {
    row.push(currentValue.trim());
    if (row.some(cell => cell !== "")) {
      lines.push(row);
    }
  }
  return lines;
}

// API Routes

app.get("/api/shopee-spots", async (req, res) => {
  try {
    const records = await loadRecords();
    res.json({ success: true, count: records.length, data: records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/shopee-spots/bulk", async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, error: "Data must be an array" });
    }

    const currentRecords = await loadRecords();
    const currentMap = new Map(currentRecords.map(r => [r.routeCode, r]));

    let addedCount = 0;
    let updatedCount = 0;
    for (const record of data) {
      if (!record.routeCode) continue;
      const existing = currentMap.get(record.routeCode);
      if (!existing) {
        currentMap.set(record.routeCode, {
          week: record.week || "N/A",
          creationDate: record.creationDate || "N/A",
          routeCode: record.routeCode,
          type: record.type || "OUTRO",
          status: record.status || "OUTRO",
          cancelled: !!record.cancelled,
          routeOrigin: record.routeOrigin || "N/A",
          routeDest: record.routeDest || "N/A",
          routeComplete: record.routeComplete || "N/A",
          syncedAt: record.syncedAt || new Date().toISOString()
        });
        addedCount++;
      } else {
        let changed = false;
        const existingWeekNum = parseInt(existing.week);
        const isHistoricalWeek = !isNaN(existingWeekNum) && existingWeekNum < 38;

        if (!isHistoricalWeek) {
          if (record.status && record.status !== "OUTRO" && existing.status !== record.status) {
            existing.status = record.status;
            changed = true;
          }
          if (typeof record.cancelled === "boolean" && existing.cancelled !== record.cancelled) {
            existing.cancelled = record.cancelled;
            changed = true;
          }
        }
        if (record.type && record.type !== "OUTRO" && existing.type !== record.type) {
          existing.type = record.type;
          changed = true;
        }
        if (changed) {
          updatedCount++;
        }
      }
    }

    const merged = Array.from(currentMap.values());
    await saveRecords(merged);

    res.json({ success: true, count: merged.length, added: addedCount, updated: updatedCount, data: merged });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/shopee-spots/reset", async (req, res) => {
  try {
    await clearRecordsInSupabase();
    res.json({ success: true, count: 0, data: [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function processShopeeRows(
  parsedLines: string[][],
  currentMap: Map<string, ShopeeSpotRecord>
): { addedCount: number; updatedCount: number; changedRecords: ShopeeSpotRecord[] } {
  let addedCount = 0;
  let updatedCount = 0;
  const changedRecords: ShopeeSpotRecord[] = [];
  const nowStr = new Date().toISOString();

  const headers = parsedLines[0].map(h => (h || "").toLowerCase().trim());

  const findCol = (...names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h === name || h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  let tripCol = findCol("cpf_rota", "cpf", "trip_number", "trip", "código", "codigo", "trip number");
  if (tripCol === -1) tripCol = 2;

  let typeCol = findCol("tipo", "type", "solicitation_by", "solicitation");
  if (typeCol === -1) typeCol = 3;

  let usadCol = findCol("status", "usad", "used", "status_proprietario", "proprietario_uso");
  if (usadCol === -1) usadCol = 4;

  let statusAgrupadoCol = findCol("cancelado", "cancel", "status_agrupado", "status agrupado", "status_viagem");
  if (statusAgrupadoCol === -1) statusAgrupadoCol = 5;

  let ownerCol = findCol("owner", "transportadora", "proprietario");
  if (ownerCol === -1) ownerCol = 7;

  let cancelReasonCol = findCol("cancel_reason", "motivo_cancelamento", "cancelamento");
  if (cancelReasonCol === -1) cancelReasonCol = 12;

  let dateCol = findCol("data_criacao", "data_criação", "data_criacao_edited", "data", "date");
  if (dateCol === -1) dateCol = 1;

  let weekCol = findCol("semana", "week");
  if (weekCol === -1) weekCol = 0;

  let originCol = findCol("origem", "origin", "hub_origem");
  if (originCol === -1) originCol = 6;

  let destCol = findCol("destino", "dest", "destination", "hub_destino");
  if (destCol === -1) destCol = 7;

  let rotaCol = findCol("rota_completa", "rota", "route");
  if (rotaCol === -1) rotaCol = 8;

  for (let idx = 1; idx < parsedLines.length; idx++) {
    const cells = parsedLines[idx];
    const routeCode = (cells[tripCol] || "").trim();
    if (!routeCode) continue;

    const rawType = (cells[typeCol] || "").trim().toUpperCase();
    let type: "SPOT" | "TENDENCIA" | "OUTRO" = "OUTRO";
    if (rawType.includes("SPOT")) {
      type = "SPOT";
    } else if (rawType.includes("TENDENCIA") || rawType.includes("TREND") || rawType.includes("TENDÊNCIA")) {
      type = "TENDENCIA";
    }

    const rawStatus = (cells[usadCol] || "").trim().toUpperCase();
    const rawCancel = (cells[statusAgrupadoCol] || "").trim().toLowerCase();

    let status: "ACEITAMOS" | "PERDEMOS" | "OUTRO" = "OUTRO";
    if (
      rawStatus.includes("ACEIT") ||
      rawStatus.includes("OWNER") ||
      rawStatus.includes("GANH") ||
      rawStatus.includes("ACEITO") ||
      rawStatus.includes("NOSSO")
    ) {
      status = "ACEITAMOS";
    } else if (
      rawStatus.includes("PERD") ||
      rawStatus.includes("LOST") ||
      rawStatus.includes("RECUS") ||
      rawStatus.includes("OTHER") ||
      rawStatus.includes("OUTRO")
    ) {
      status = "PERDEMOS";
    } else if (rawStatus) {
      status = "PERDEMOS";
    } else {
      status = "ACEITAMOS";
    }

    let cancelled = false;
    if (
      rawCancel.includes("sim") ||
      rawCancel.includes("yes") ||
      rawCancel === "1" ||
      rawCancel === "true" ||
      rawCancel.includes("cancel")
    ) {
      cancelled = true;
    } else {
      cancelled = false;
    }

    let origin = originCol !== -1 && originCol < cells.length ? (cells[originCol] || "").trim() : "";
    let dest = destCol !== -1 && destCol < cells.length ? (cells[destCol] || "").trim() : "";
    const rawRota = rotaCol !== -1 && rotaCol < cells.length ? (cells[rotaCol] || "").trim() : "";

    let routeComplete = rawRota || "Rota Não Identificada";
    if (rawRota.includes("|")) {
      const parts = rawRota.split("|").map(p => p.trim());
      if (!origin || origin === "N/A") origin = parts[0] || "N/A";
      if (!dest || dest === "N/A") dest = parts[1] || "N/A";
      routeComplete = `${parts[0] || origin} ➔ ${parts[1] || dest}`;
    } else if (rawRota.includes("➔") || rawRota.includes("->")) {
      const sep = rawRota.includes("➔") ? "➔" : "->";
      const parts = rawRota.split(sep).map(p => p.trim());
      if (!origin || origin === "N/A") origin = parts[0] || "N/A";
      if (!dest || dest === "N/A") dest = parts[1] || "N/A";
      routeComplete = `${parts[0] || origin} ➔ ${parts[1] || dest}`;
    } else if (origin && dest && origin !== "N/A" && dest !== "N/A") {
      routeComplete = `${origin} ➔ ${dest}`;
    } else if (rawRota) {
      routeComplete = rawRota;
    }

    if (!origin) origin = "N/A";
    if (!dest) dest = "N/A";

    const week = weekCol !== -1 && weekCol < cells.length && cells[weekCol]?.trim() ? cells[weekCol].trim() : "N/A";
    const creationDate = dateCol !== -1 && dateCol < cells.length && cells[dateCol]?.trim() ? cells[dateCol].trim() : "N/A";

    const existing = currentMap.get(routeCode);
    if (!existing) {
      const newRec: ShopeeSpotRecord = {
        week,
        creationDate,
        routeCode,
        type,
        status,
        cancelled,
        routeOrigin: origin,
        routeDest: dest,
        routeComplete,
        syncedAt: nowStr
      };
      currentMap.set(routeCode, newRec);
      changedRecords.push(newRec);
      addedCount++;
    } else {
      let changed = false;
      const existingWeekNum = parseInt(existing.week);
      const isHistoricalWeek = !isNaN(existingWeekNum) && existingWeekNum < 38;

      if (!isHistoricalWeek) {
        if (existing.status !== status) {
          existing.status = status;
          changed = true;
        }
        if (existing.cancelled !== cancelled) {
          existing.cancelled = cancelled;
          changed = true;
        }
      }
      if (type !== "OUTRO" && existing.type !== type) {
        existing.type = type;
        changed = true;
      }
      if (origin !== "N/A" && existing.routeOrigin !== origin) {
        existing.routeOrigin = origin;
        existing.routeDest = dest;
        existing.routeComplete = routeComplete;
        changed = true;
      }
      if (week && week !== "N/A" && existing.week !== week) {
        existing.week = week;
        changed = true;
      }
      if (creationDate && creationDate !== "N/A" && existing.creationDate !== creationDate) {
        existing.creationDate = creationDate;
        changed = true;
      }
      if (changed) {
        existing.syncedAt = nowStr;
        changedRecords.push(existing);
        updatedCount++;
      }
    }
  }

  return { addedCount, updatedCount, changedRecords };
}

async function syncFromGoogleSheets(): Promise<{
  success: boolean;
  totalCount: number;
  addedCount: number;
  updatedCount: number;
  data: ShopeeSpotRecord[];
}> {
  const sheetId = "1rkn2_W-Rl9CYfEH1LDKLfMwJrL-SliCQebOiMjHJgUg";
  const sheetName = "SPOT";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${sheetName}`;

  console.log(`Fetching spreadsheet from: ${exportUrl}`);

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet. Status: ${response.status}`);
  }

  const csvText = await response.text();
  const parsedLines = parseCSV(csvText);

  if (parsedLines.length < 2) {
    throw new Error("No data rows found in the synchronized spreadsheet tab.");
  }

  const currentRecords = await loadRecords();
  const currentMap = new Map(currentRecords.map(r => [r.routeCode, r]));

  const { addedCount, updatedCount, changedRecords } = processShopeeRows(parsedLines, currentMap);

  const merged = Array.from(currentMap.values());
  saveLocalRecordsFallback(merged);

  if (changedRecords.length > 0) {
    await saveChangedRecords(changedRecords);
  }

  return {
    success: true,
    totalCount: merged.length,
    addedCount,
    updatedCount,
    data: merged
  };
}

app.post("/api/shopee-spots/import-csv", async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText || typeof csvText !== "string") {
      return res.status(400).json({ success: false, error: "csvText string is required" });
    }

    const parsedLines = parseCSV(csvText);
    if (parsedLines.length < 2) {
      return res.status(400).json({ success: false, error: "CSV has no data or header only" });
    }

    const currentRecords = await loadRecords();
    const currentMap = new Map(currentRecords.map(r => [r.routeCode, r]));

    const { addedCount, updatedCount, changedRecords } = processShopeeRows(parsedLines, currentMap);

    const merged = Array.from(currentMap.values());
    saveLocalRecordsFallback(merged);

    if (changedRecords.length > 0) {
      await saveChangedRecords(changedRecords);
    }

    res.json({
      success: true,
      totalCount: merged.length,
      addedCount,
      updatedCount,
      data: merged
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/shopee-spots/invert-routes", async (req, res) => {
  try {
    const currentRecords = await loadRecords();
    const inverted = currentRecords.map(r => {
      const newOrigin = r.routeDest || "N/A";
      const newDest = r.routeOrigin || "N/A";
      return {
        ...r,
        routeOrigin: newOrigin,
        routeDest: newDest,
        routeComplete: newOrigin && newDest ? `${newOrigin} ➔ ${newDest}` : (newOrigin || newDest || "Rota Não Identificada")
      };
    });
    await saveRecords(inverted);
    res.json({ success: true, count: inverted.length, data: inverted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

let isSyncInProgress = false;

app.post("/api/shopee-spots/sync", async (req, res) => {
  if (isSyncInProgress) {
    return res.status(409).json({
      success: false,
      error: "Sincronização já em andamento. Aguarde alguns instantes."
    });
  }

  isSyncInProgress = true;
  try {
    const result = await syncFromGoogleSheets();
    res.json({
      ...result,
      syncedTimestamp: Date.now()
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    res.status(500).json({
      success: false,
      error: `Erro ao sincronizar planilha: ${error.message}. Verifique se a planilha está pública para leitura.`
    });
  } finally {
    isSyncInProgress = false;
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
