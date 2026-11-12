export interface ShopeeSpotRecord {
  week: string;
  creationDate: string;
  routeCode: string; // Col D (CPF / Key)
  type: "SPOT" | "TENDENCIA" | "OUTRO"; // Col E
  status: "ACEITAMOS" | "PERDEMOS" | "OUTRO"; // Col F: ACEITAMOS = OWNER, PERDEMOS = NO ACCEPT / OTHER
  cancelled: boolean; // Col G: has CANCELLED or CANCELADO
  routeOrigin: string; // Col J
  routeDest: string; // Col K
  routeComplete: string; // J + K
  syncedAt: string;
}

export type PlatformType = "SHOPEE" | "AMAZON" | "MELI";

export interface DashboardStats {
  totalRoutes: number;
  totalSpot: number;
  totalTendencia: number;
  totalAccepted: number;
  totalLost: number;
  totalCancelled: number;
  spotPercentage: number;
  tendenciaPercentage: number;
  acceptanceRate: number;
  cancellationRate: number;
}
