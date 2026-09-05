import type {
  DiskInfo,
  SystemProvider,
  SystemSummary,
} from "./system-provider.js";

const gibibyte = 1024 ** 3;

export class MockSystemProvider implements SystemProvider {
  async getSystemSummary(): Promise<SystemSummary> {
    return {
      hostname: "karpiknas-demo",
      platform: "win32",
      uptimeSeconds: 183_845,
      cpuThreads: 8,
      loadAverage: [0, 0, 0],
      memory: {
        totalBytes: 32 * gibibyte,
        freeBytes: 19.2 * gibibyte,
        usedBytes: 12.8 * gibibyte,
      },
      storage: {
        totalBytes: 2 * 1024 * gibibyte,
        freeBytes: 1.3 * 1024 * gibibyte,
        usedBytes: 0.7 * 1024 * gibibyte,
      },
    };
  }

  async getDisks(): Promise<DiskInfo[]> {
    return [
      {
        id: "mock-disk-1",
        name: "Dysk testowy 1",
        mountPoint: "dev-storage",
        filesystem: "NTFS",
        totalBytes: 2 * 1024 * gibibyte,
        freeBytes: 1.3 * 1024 * gibibyte,
        usedBytes: 0.7 * 1024 * gibibyte,
        status: "healthy",
        temperatureC: 34,
        isMock: true,
      },
    ];
  }

  async getRaidStatus(): Promise<unknown> {
    return { supported: false, status: "demo" };
  }

  async getServices(): Promise<unknown> {
    return [{ id: "api", name: "KarpikNAS API", status: "running", isMock: true }];
  }
}
