import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, writeBatch } from "firebase/firestore";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Load Firebase configuration
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (!fs.existsSync(configPath)) {
  console.error("Critical error: firebase-applet-config.json is missing.");
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Initialize Firebase App & Firestore
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

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

// Master Asynchronous Firestore Database Handlers
async function loadRecords(): Promise<ShopeeSpotRecord[]> {
  try {
    const colRef = collection(db, "shopee_routes");
    const querySnapshot = await getDocs(colRef);
    const records: ShopeeSpotRecord[] = [];
    querySnapshot.forEach((docSnap) => {
      records.push(docSnap.data() as ShopeeSpotRecord);
    });
    
    // Update local cache fallback to stay in sync
    saveLocalRecordsFallback(records);
    return records;
  } catch (error) {
    console.error("Firestore loading error. Falling back to local storage:", error);
    return loadLocalRecordsFallback();
  }
}

async function saveRecords(records: ShopeeSpotRecord[]): Promise<void> {
  // Always update the local cache fallback
  saveLocalRecordsFallback(records);

  try {
    const batchSize = 400;
    // Process writes in batches to adhere to Firestore limits (max 500 writes per batch)
    for (let i = 0; i < records.length; i += batchSize) {
      const batchInstance = writeBatch(db);
      const chunk = records.slice(i, i + batchSize);
      
      for (const record of chunk) {
        if (!record.routeCode) continue;
        const docRef = doc(db, "shopee_routes", record.routeCode);
        batchInstance.set(docRef, record);
      }
      await batchInstance.commit();
    }
    console.log(`Successfully persisted ${records.length} records to Firestore.`);
  } catch (error) {
    console.warn("Firestore save warning (local cache preserved):", error);
  }
}

async function clearRecordsInFirestore(): Promise<void> {
  saveLocalRecordsFallback([]);
  try {
    const colRef = collection(db, "shopee_routes");
    const querySnapshot = await getDocs(colRef);
    
    const batchSize = 400;
    let batchInstance = writeBatch(db);
    let count = 0;
    
    for (const docSnap of querySnapshot.docs) {
      batchInstance.delete(doc(db, "shopee_routes", docSnap.id));
      count++;
      if (count % batchSize === 0) {
        await batchInstance.commit();
        batchInstance = writeBatch(db);
      }
    }
    if (count % batchSize !== 0) {
      await batchInstance.commit();
    }
    console.log(`Cleared all ${count} records from Firestore.`);
  } catch (error) {
    console.warn("Firestore delete warning (local cache cleared):", error);
  }
}

// Robust CSV Parsing helper supporting multiline quotes and separators
function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  // Auto detect delimiter from first line (sample)
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
        i++; // skip next quote
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

// Get all records
app.get("/api/shopee-spots", async (req, res) => {
  try {
    const records = await loadRecords();
    res.json({ success: true, count: records.length, data: records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk sync from client (to restore state if server restarts)
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

// Clear all records
app.post("/api/shopee-spots/reset", async (req, res) => {
  try {
    await clearRecordsInFirestore();
    res.json({ success: true, count: 0, data: [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to process Shopee spreadsheet rows into existing records
function processShopeeRows(
  parsedLines: string[][],
  currentMap: Map<string, ShopeeSpotRecord>
): { addedCount: number; updatedCount: number } {
  let addedCount = 0;
  let updatedCount = 0;
  const nowStr = new Date().toISOString();

  const headers = parsedLines[0].map(h => (h || "").toLowerCase().trim());

  const findCol = (...names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex(h => h === name || h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  let tripCol = findCol("trip_number", "trip", "código", "codigo", "trip number");
  if (tripCol === -1) tripCol = 3;

  let typeCol = findCol("solicitation_by", "solicitation", "tipo", "type");
  if (typeCol === -1) typeCol = 4;

  let usadCol = findCol("usad", "used", "status_proprietario", "proprietario_uso");
  if (usadCol === -1) usadCol = 5;

  let statusAgrupadoCol = findCol("status_agrupado", "status agrupado", "status_viagem", "status");
  if (statusAgrupadoCol === -1) statusAgrupadoCol = 6;

  let ownerCol = findCol("owner", "transportadora", "proprietario");
  if (ownerCol === -1) ownerCol = 7;

  let cancelReasonCol = findCol("cancel_reason", "motivo_cancelamento", "cancelamento");
  if (cancelReasonCol === -1) cancelReasonCol = 12;

  let dateCol = findCol("data_criacao", "data_criação", "data_criacao_edited", "data", "date");
  if (dateCol === -1) dateCol = 1;

  let weekCol = findCol("semana", "week");
  if (weekCol === -1) weekCol = 0;

  let originCol = findCol("origem", "origin", "hub_origem");
  if (originCol === -1) originCol = 9;

  let destCol = findCol("destino", "dest", "destination", "hub_destino");
  if (destCol === -1) destCol = 10;

  let rotaCol = findCol("rota", "route");
  if (rotaCol === -1) rotaCol = 20;

  for (let idx = 1; idx < parsedLines.length; idx++) {
    const cells = parsedLines[idx];
    const routeCode = (cells[tripCol] || "").trim();
    if (!routeCode) continue;

    // Type: SPOT vs TENDENCIA
    const rawType = (cells[typeCol] || "").trim().toUpperCase();
    let type: "SPOT" | "TENDENCIA" | "OUTRO" = "OUTRO";
    if (rawType.includes("SPOT")) {
      type = "SPOT";
    } else if (rawType.includes("TENDENCIA") || rawType.includes("TREND") || rawType.includes("TENDÊNCIA")) {
      type = "TENDENCIA";
    }

    // Status: ACEITAMOS vs PERDEMOS
    // Regra da Shopee SPOT BID:
    // Coluna 'usad':
    // - 'owner' / 'aceitamos' / 'aceito' -> Lösung operou / ganhamos a rota => ACEITAMOS
    // - 'other' / 'outro' / 'perde' / 'recusa' / 'no accept' -> outra transportadora levou => PERDEMOS
    const rawUsad = (cells[usadCol] || "").trim().toLowerCase();
    const rawStatusAgrupado = (cells[statusAgrupadoCol] || "").trim().toLowerCase();

    let status: "ACEITAMOS" | "PERDEMOS" | "OUTRO" = "OUTRO";
    if (
      rawUsad === "owner" ||
      rawUsad === "aceitamos" ||
      rawUsad === "aceito" ||
      rawUsad === "nosso" ||
      rawUsad === "ganhamos"
    ) {
      status = "ACEITAMOS";
    } else if (
      rawUsad === "other" ||
      rawUsad === "outro" ||
      rawUsad.includes("perde") ||
      rawUsad.includes("lost") ||
      rawUsad.includes("recusa") ||
      rawUsad === "no accept"
    ) {
      status = "PERDEMOS";
    } else if (rawStatusAgrupado.includes("perde") || rawStatusAgrupado.includes("lost")) {
      status = "PERDEMOS";
    } else if (rawUsad) {
      status = "PERDEMOS";
    } else {
      status = "ACEITAMOS";
    }

    // Cancelled status
    // IMPORTANTE: Quando a rota tem "COMPLETED" é porque foi FINALIZADA (não cancelada)!
    // Somente rotas com status cancelado ("cancelled", "spotbid cancelled", "fruitless", "no show") são marcadas como canceladas.
    let cancelled = false;
    if (
      rawStatusAgrupado.includes("completed") ||
      rawStatusAgrupado.includes("finalizad") ||
      rawStatusAgrupado.includes("concluid")
    ) {
      cancelled = false;
    } else if (
      rawStatusAgrupado.includes("cancelled") ||
      rawStatusAgrupado.includes("cancelado") ||
      rawStatusAgrupado.includes("cancel") ||
      rawStatusAgrupado.includes("fruitless") ||
      rawStatusAgrupado.includes("no show")
    ) {
      cancelled = true;
    } else {
      cancelled = false;
    }

    // Origin, Destination, Route
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
      currentMap.set(routeCode, {
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
      });
      addedCount++;
    } else {
      let changed = false;
      const existingWeekNum = parseInt(existing.week);
      const isHistoricalWeek = !isNaN(existingWeekNum) && existingWeekNum < 38;

      // Preservar classificações das weeks antes da 38
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
        updatedCount++;
      }
    }
  }

  return { addedCount, updatedCount };
}

// Master Google Sheets Synchronizer
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

  const { addedCount, updatedCount } = processShopeeRows(parsedLines, currentMap);

  const merged = Array.from(currentMap.values());
  await saveRecords(merged);

  return {
    success: true,
    totalCount: merged.length,
    addedCount,
    updatedCount,
    data: merged
  };
}

// Import records via custom pasted CSV or upload
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

    const { addedCount, updatedCount } = processShopeeRows(parsedLines, currentMap);

    const merged = Array.from(currentMap.values());
    await saveRecords(merged);

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

// Invert origin and destination in database
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

// Synchronize with external Google Sheets URL
app.post("/api/shopee-spots/sync", async (req, res) => {
  try {
    const result = await syncFromGoogleSheets();
    res.json(result);
  } catch (error: any) {
    console.error("Sync error:", error);
    res.status(500).json({
      success: false,
      error: `Erro ao sincronizar planilha: ${error.message}. Verifique se a planilha está pública para leitura.`
    });
  }
});

// Serve frontend and handle SPA routing
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
