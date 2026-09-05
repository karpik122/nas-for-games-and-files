import os from "node:os";
import { statfs } from "node:fs/promises";
export class DebianSystemProvider {
    storageRoot;
    constructor(storageRoot) {
        this.storageRoot = storageRoot;
    }
    async getSystemSummary() {
        const storage = await statfs(this.storageRoot);
        const totalBytes = storage.blocks * storage.bsize;
        const freeBytes = storage.bavail * storage.bsize;
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        return {
            hostname: os.hostname(),
            platform: os.platform(),
            uptimeSeconds: os.uptime(),
            cpuThreads: os.cpus().length,
            loadAverage: os.loadavg(),
            memory: {
                totalBytes: totalMemory,
                freeBytes: freeMemory,
                usedBytes: totalMemory - freeMemory,
            },
            storage: {
                totalBytes,
                freeBytes,
                usedBytes: totalBytes - freeBytes,
            },
        };
    }
    async getDisks() {
        const storage = await statfs(this.storageRoot);
        const totalBytes = storage.blocks * storage.bsize;
        const freeBytes = storage.bavail * storage.bsize;
        return [
            {
                id: "storage-root",
                name: "Główny magazyn",
                mountPoint: this.storageRoot,
                filesystem: "Linux",
                totalBytes,
                freeBytes,
                usedBytes: totalBytes - freeBytes,
                status: "unknown",
                temperatureC: null,
                isMock: false,
            },
        ];
    }
    async getRaidStatus() {
        return {
            supported: false,
            status: "not-configured",
            message: "Odczyt /proc/mdstat zostanie podłączony przez bezpiecznego agenta.",
        };
    }
    async getServices() {
        return {
            supported: false,
            message: "Zarządzanie usługami wymaga bezpiecznego agenta systemowego.",
        };
    }
}
