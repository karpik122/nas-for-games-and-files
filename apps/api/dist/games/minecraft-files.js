import { createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile, } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
const editableExtensions = new Set([
    ".cfg",
    ".conf",
    ".hjson",
    ".ini",
    ".json",
    ".json5",
    ".properties",
    ".txt",
    ".toml",
    ".yml",
    ".yaml",
]);
const maxEditableFileBytes = 1024 * 1024;
const maxPluginBytes = 100 * 1024 * 1024;
export class MinecraftFileError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = "MinecraftFileError";
    }
}
export class MinecraftFiles {
    dataRoot;
    constructor(minecraftRoot) {
        this.dataRoot = path.join(minecraftRoot, "data");
    }
    async list(relativePath = "") {
        const { absolutePath, normalizedPath } = await this.resolveExisting(relativePath);
        const details = await lstat(absolutePath);
        if (!details.isDirectory()) {
            throw new MinecraftFileError("Wybrana ścieżka nie jest katalogiem.", 400);
        }
        const entries = await readdir(absolutePath, { withFileTypes: true });
        const visibleEntries = entries.filter((entry) => entry.name !== ".gitkeep");
        const result = await Promise.all(visibleEntries.map(async (entry) => {
            const entryPath = path.join(absolutePath, entry.name);
            const entryDetails = await lstat(entryPath);
            const entryRelativePath = path.posix.join(normalizedPath, entry.name);
            return {
                name: entry.name,
                path: entryRelativePath,
                type: entry.isDirectory() ? "directory" : "file",
                sizeBytes: entry.isFile() ? entryDetails.size : null,
                modifiedAt: entryDetails.mtime.toISOString(),
                editable: entry.isFile() && this.isEditable(entry.name) && entryDetails.size <= maxEditableFileBytes,
            };
        }));
        result.sort((left, right) => {
            if (left.type !== right.type)
                return left.type === "directory" ? -1 : 1;
            return left.name.localeCompare(right.name, "pl");
        });
        const parts = normalizedPath.split("/").filter(Boolean);
        return {
            path: normalizedPath,
            parentPath: parts.slice(0, -1).join("/"),
            entries: result,
        };
    }
    async read(relativePath) {
        if (!this.isEditable(relativePath)) {
            throw new MinecraftFileError("Ten typ pliku nie może być edytowany w panelu.", 415);
        }
        const { absolutePath, normalizedPath } = await this.resolveExisting(relativePath);
        const details = await lstat(absolutePath);
        if (!details.isFile() || details.isSymbolicLink()) {
            throw new MinecraftFileError("Wybrana ścieżka nie jest zwykłym plikiem.", 400);
        }
        if (details.size > maxEditableFileBytes) {
            throw new MinecraftFileError("Plik jest zbyt duży do edycji w panelu.", 413);
        }
        const content = await readFile(absolutePath, "utf8");
        if (content.includes("\0")) {
            throw new MinecraftFileError("Plik binarny nie może być edytowany w panelu.", 415);
        }
        return {
            path: normalizedPath,
            content,
            modifiedAt: details.mtime.toISOString(),
        };
    }
    async write(relativePath, content) {
        if (!this.isEditable(relativePath)) {
            throw new MinecraftFileError("Ten typ pliku nie może być edytowany w panelu.", 415);
        }
        if (Buffer.byteLength(content, "utf8") > maxEditableFileBytes) {
            throw new MinecraftFileError("Plik jest zbyt duży. Limit edytora wynosi 1 MB.", 413);
        }
        const { absolutePath, normalizedPath } = await this.resolveWritable(relativePath);
        await writeFile(absolutePath, content, { encoding: "utf8", flag: "w" });
        const details = await lstat(absolutePath);
        return {
            path: normalizedPath,
            content,
            modifiedAt: details.mtime.toISOString(),
        };
    }
    async listPlugins() {
        const pluginsRoot = await this.ensurePluginsRoot();
        const entries = await readdir(pluginsRoot, { withFileTypes: true });
        const plugins = await Promise.all(entries
            .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".jar")
            .map(async (entry) => {
            const details = await lstat(path.join(pluginsRoot, entry.name));
            return {
                name: entry.name,
                sizeBytes: details.size,
                modifiedAt: details.mtime.toISOString(),
            };
        }));
        return plugins.sort((left, right) => left.name.localeCompare(right.name, "pl"));
    }
    async savePlugin(filename, stream) {
        const safeFilename = path.basename(filename);
        const invalidFilename = safeFilename !== filename ||
            safeFilename.length > 160 ||
            /[<>:"/\\|?*\u0000-\u001f]/.test(safeFilename) ||
            path.extname(safeFilename).toLowerCase() !== ".jar";
        if (invalidFilename) {
            throw new MinecraftFileError("Dozwolone są wyłącznie poprawnie nazwane pliki .jar.", 415);
        }
        const pluginsRoot = await this.ensurePluginsRoot();
        const destination = path.join(pluginsRoot, safeFilename);
        let destinationCreated = false;
        const output = createWriteStream(destination, { flags: "wx" });
        output.once("open", () => {
            destinationCreated = true;
        });
        try {
            await pipeline(stream, output);
            if (stream.truncated) {
                await unlink(destination).catch(() => undefined);
                throw new MinecraftFileError("Plugin jest zbyt duży. Limit wynosi 100 MB.", 413);
            }
        }
        catch (error) {
            if (destinationCreated)
                await unlink(destination).catch(() => undefined);
            if (error instanceof MinecraftFileError)
                throw error;
            if (error instanceof Error && "code" in error && error.code === "EEXIST") {
                throw new MinecraftFileError("Plugin o tej nazwie już istnieje.", 409);
            }
            throw error;
        }
        const details = await lstat(destination);
        if (details.size > maxPluginBytes) {
            await unlink(destination).catch(() => undefined);
            throw new MinecraftFileError("Plugin jest zbyt duży. Limit wynosi 100 MB.", 413);
        }
        return {
            name: safeFilename,
            sizeBytes: details.size,
            modifiedAt: details.mtime.toISOString(),
            restartRequired: true,
        };
    }
    async ensureDataRoot() {
        await mkdir(this.dataRoot, { recursive: true });
        return realpath(this.dataRoot);
    }
    async ensurePluginsRoot() {
        const realRoot = await this.ensureDataRoot();
        const pluginsPath = path.join(realRoot, "plugins");
        await mkdir(pluginsPath, { recursive: true });
        const realPluginsPath = await realpath(pluginsPath);
        this.assertInside(realRoot, realPluginsPath);
        return realPluginsPath;
    }
    normalize(relativePath) {
        return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    }
    async resolveExisting(relativePath) {
        const realRoot = await this.ensureDataRoot();
        const normalizedPath = this.normalize(relativePath);
        const requestedPath = path.resolve(realRoot, normalizedPath);
        let absolutePath;
        try {
            absolutePath = await realpath(requestedPath);
        }
        catch {
            throw new MinecraftFileError("Nie znaleziono pliku lub katalogu.", 404);
        }
        this.assertInside(realRoot, absolutePath);
        return { absolutePath, normalizedPath };
    }
    async resolveWritable(relativePath) {
        const realRoot = await this.ensureDataRoot();
        const normalizedPath = this.normalize(relativePath);
        if (!normalizedPath || normalizedPath.endsWith("/")) {
            throw new MinecraftFileError("Podaj poprawną ścieżkę pliku.", 400);
        }
        const requestedPath = path.resolve(realRoot, normalizedPath);
        this.assertInside(realRoot, requestedPath);
        const realParent = await realpath(path.dirname(requestedPath)).catch(() => null);
        if (!realParent)
            throw new MinecraftFileError("Katalog nadrzędny nie istnieje.", 404);
        this.assertInside(realRoot, realParent);
        try {
            const details = await lstat(requestedPath);
            if (!details.isFile() || details.isSymbolicLink()) {
                throw new MinecraftFileError("Wybrana ścieżka nie jest zwykłym plikiem.", 400);
            }
        }
        catch (error) {
            if (error instanceof MinecraftFileError)
                throw error;
            if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
                throw error;
        }
        return { absolutePath: requestedPath, normalizedPath };
    }
    assertInside(realRoot, target) {
        if (target !== realRoot && !target.startsWith(`${realRoot}${path.sep}`)) {
            throw new MinecraftFileError("Ścieżka wychodzi poza katalog serwera gry.", 403);
        }
    }
    isEditable(filename) {
        return editableExtensions.has(path.extname(filename).toLowerCase());
    }
}
