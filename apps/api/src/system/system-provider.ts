export type SystemSummary = {
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  cpuThreads: number;
  loadAverage: number[];
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
  };
  storage: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
  };
};

export type DiskInfo = {
  id: string;
  name: string;
  mountPoint: string;
  filesystem: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  status: "healthy" | "warning" | "unknown";
  temperatureC: number | null;
  isMock: boolean;
};

export interface SystemProvider {
  getSystemSummary(): Promise<SystemSummary>;
  getDisks(): Promise<DiskInfo[]>;
  getRaidStatus(): Promise<unknown>;
  getServices(): Promise<unknown>;
}
