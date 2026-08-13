export interface CpuHistoryPoint {
  cpuUsage: number;
  recordedAt: string;
}

export interface CpuHistoryResponse {
  success: boolean;
  history: CpuHistoryPoint[];
}