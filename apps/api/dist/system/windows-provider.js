import os from "node:os";
import { statfs } from "node:fs/promises";
export class WindowsSystemProvider {
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
                id: "dev-storage",
                name: "Dysk testowy",
                mountPoint: this.storageRoot,
                filesystem: "NTFS",
                totalBytes,
                freeBytes,
                usedBytes: totalBytes - freeBytes,
                status: "healthy",
                temperatureC: null,
                isMock: true,
            },
        ];
    }
    async getRaidStatus() {
        return {
            supported: false,
            status: "unavailable",
            message: "Informacje RAID będą dostępne na serwerze Debian.",
        };
    }
    async getServices() {
        return [
            { id: "api", name: "KarpikNAS API", status: "running", isMock: true },
            { id: "smb", name: "Samba", status: "unavailable", isMock: true },
            { id: "docker", name: "Docker", status: "unavailable", isMock: true },
        ];
    }
}
