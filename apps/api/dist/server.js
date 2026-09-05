import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { lstat, readdir, realpath } from "node:fs/promises";
import { z } from "zod";
import { WindowsSystemProvider } from "./system/windows-provider.js";
import { DebianSystemProvider } from "./system/debian-provider.js";
import { MockSystemProvider } from "./system/mock-provider.js";
import { GameServerError, GameServerManager } from "./games/game-server-manager.js";
import { MinecraftFileError, MinecraftFiles } from "./games/minecraft-files.js";
import { AppDatabase } from "./database.js";
const app = Fastify({ logger: true });
const sessionCookieName = "karpiknas_session";
const sessionDurationSeconds = 8 * 60 * 60;
const sessionDurationMs = sessionDurationSeconds * 1000;
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "karpiknas";
if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
    throw new Error("W środowisku produkcyjnym ustaw ADMIN_USERNAME i ADMIN_PASSWORD.");
}
const sessions = new Map();
const loginAttempts = new Map();
await app.register(cors, {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
});
await app.register(multipart, {
    limits: {
        files: 1,
        fields: 0,
        fileSize: 100 * 1024 * 1024,
    },
});
const storageRoot = path.resolve(process.env.STORAGE_ROOT ?? path.resolve(process.cwd(), "../../dev-storage"));
const storageRealRoot = await realpath(storageRoot);
const gameServersRoot = path.resolve(process.env.GAME_SERVERS_ROOT ?? path.resolve(process.cwd(), "../../game-servers"));
const databasePath = path.resolve(process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "../../data/karpiknas.sqlite"));
function selectSystemProvider() {
    if (process.env.SYSTEM_PROVIDER === "mock") {
        return new MockSystemProvider();
    }
    return process.platform === "win32"
        ? new WindowsSystemProvider(storageRoot)
        : new DebianSystemProvider(storageRoot);
}
const systemProvider = selectSystemProvider();
const gameServerManager = new GameServerManager(gameServersRoot);
const minecraftFiles = new MinecraftFiles(path.join(gameServersRoot, "minecraft"));
const database = new AppDatabase(databasePath);
const filesQuerySchema = z.object({
    path: z.string().max(500).optional().default(""),
});
const loginBodySchema = z.object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(200),
});
const gamePathQuerySchema = z.object({
    path: z.string().max(1000).optional().default(""),
});
const gameFileBodySchema = z.object({
    path: z.string().min(1).max(1000),
    content: z.string().max(1_100_000),
});
const gameLogsQuerySchema = z.object({
    tail: z.coerce.number().int().min(20).max(500).optional().default(200),
});
const gameCommandBodySchema = z.object({
    command: z.string().trim().min(1).max(500).refine((command) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\r\n]/u.test(command), "Komenda zawiera niedozwolone znaki."),
});
function parseCookies(cookieHeader) {
    const cookies = new Map();
    for (const cookie of cookieHeader?.split(";") ?? []) {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex < 1)
            continue;
        cookies.set(cookie.slice(0, separatorIndex).trim(), cookie.slice(separatorIndex + 1).trim());
    }
    return cookies;
}
function getSession(request) {
    const token = parseCookies(request.headers.cookie).get(sessionCookieName);
    if (!token)
        return null;
    const session = sessions.get(token);
    if (!session)
        return null;
    if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
    }
    return { token, session };
}
function safeTextEqual(left, right) {
    const leftDigest = createHash("sha256").update(left).digest();
    const rightDigest = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftDigest, rightDigest);
}
function sessionCookie(token, maxAge = sessionDurationSeconds) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
async function requireAuth(request, reply) {
    if (!getSession(request)) {
        return reply.code(401).send({ message: "Sesja wygasła. Zaloguj się ponownie." });
    }
}
async function resolveStoragePath(relativePath) {
    const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
    const absolutePath = path.resolve(storageRoot, normalizedPath);
    const realPath = await realpath(absolutePath);
    const isInsideStorage = realPath === storageRealRoot || realPath.startsWith(`${storageRealRoot}${path.sep}`);
    if (!isInsideStorage) {
        throw new Error("Ścieżka wychodzi poza magazyn.");
    }
    return { absolutePath: realPath, normalizedPath };
}
app.get("/api/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
    version: "0.1.0",
    database: database.getStatus(),
}));
app.post("/api/auth/login", async (request, reply) => {
    const attemptKey = request.ip;
    const now = Date.now();
    const previousAttempt = loginAttempts.get(attemptKey);
    const attempt = previousAttempt && previousAttempt.resetAt > now
        ? previousAttempt
        : { count: 0, resetAt: now + 60_000 };
    if (attempt.count >= 5) {
        return reply.code(429).send({ message: "Zbyt wiele prób. Spróbuj ponownie za minutę." });
    }
    const parsedBody = loginBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
        return reply.code(400).send({ message: "Podaj login i hasło." });
    }
    const validUsername = safeTextEqual(parsedBody.data.username, adminUsername);
    const validPassword = safeTextEqual(parsedBody.data.password, adminPassword);
    const validCredentials = validUsername && validPassword;
    if (!validCredentials) {
        attempt.count += 1;
        loginAttempts.set(attemptKey, attempt);
        return reply.code(401).send({ message: "Nieprawidłowy login lub hasło." });
    }
    loginAttempts.delete(attemptKey);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, {
        username: adminUsername,
        expiresAt: now + sessionDurationMs,
    });
    reply.header("Set-Cookie", sessionCookie(token));
    return { user: { username: adminUsername, role: "admin" } };
});
app.get("/api/auth/me", async (request, reply) => {
    const activeSession = getSession(request);
    if (!activeSession) {
        return reply.code(401).send({ message: "Brak aktywnej sesji." });
    }
    return { user: { username: activeSession.session.username, role: "admin" } };
});
app.post("/api/auth/logout", async (request, reply) => {
    const activeSession = getSession(request);
    if (activeSession)
        sessions.delete(activeSession.token);
    reply.header("Set-Cookie", sessionCookie("", 0));
    return { status: "ok" };
});
const protectedRoute = { preHandler: requireAuth };
app.get("/api/system/summary", protectedRoute, async () => systemProvider.getSystemSummary());
app.get("/api/system/disks", protectedRoute, async () => systemProvider.getDisks());
app.get("/api/system/raid", protectedRoute, async () => systemProvider.getRaidStatus());
app.get("/api/system/services", protectedRoute, async () => systemProvider.getServices());
app.get("/api/games/servers", protectedRoute, async () => gameServerManager.listServers());
app.post("/api/games/servers/minecraft/start", protectedRoute, async (request, reply) => {
    try {
        const status = await gameServerManager.startMinecraft();
        database.recordGameActivity("server_start");
        return status;
    }
    catch (error) {
        request.log.error(error);
        const statusCode = error instanceof GameServerError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się uruchomić serwera gry.";
        return reply.code(statusCode).send({ message });
    }
});
app.post("/api/games/servers/minecraft/stop", protectedRoute, async (request, reply) => {
    try {
        const status = await gameServerManager.stopMinecraft();
        database.recordGameActivity("server_stop");
        return status;
    }
    catch (error) {
        request.log.error(error);
        const statusCode = error instanceof GameServerError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się zatrzymać serwera gry.";
        return reply.code(statusCode).send({ message });
    }
});
app.get("/api/games/servers/minecraft/console/logs", protectedRoute, async (request, reply) => {
    const parsedQuery = gameLogsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success)
        return reply.code(400).send({ message: "Nieprawidłowa liczba linii logów." });
    try {
        return await gameServerManager.getMinecraftLogs(parsedQuery.data.tail);
    }
    catch (error) {
        const statusCode = error instanceof GameServerError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się pobrać logów serwera.";
        return reply.code(statusCode).send({ message });
    }
});
app.post("/api/games/servers/minecraft/console/command", protectedRoute, async (request, reply) => {
    const parsedBody = gameCommandBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
        return reply.code(400).send({ message: "Podaj jedną komendę o długości do 500 znaków." });
    }
    try {
        const result = await gameServerManager.sendMinecraftCommand(parsedBody.data.command);
        database.recordGameActivity("console_command", {
            commandName: parsedBody.data.command.split(/\s+/, 1)[0],
            commandLength: parsedBody.data.command.length,
        });
        return result;
    }
    catch (error) {
        const statusCode = error instanceof GameServerError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się wysłać komendy do serwera.";
        return reply.code(statusCode).send({ message });
    }
});
app.get("/api/games/servers/minecraft/files", protectedRoute, async (request, reply) => {
    const parsedQuery = gamePathQuerySchema.safeParse(request.query);
    if (!parsedQuery.success)
        return reply.code(400).send({ message: "Nieprawidłowa ścieżka." });
    try {
        return await minecraftFiles.list(parsedQuery.data.path);
    }
    catch (error) {
        const statusCode = error instanceof MinecraftFileError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się odczytać katalogu.";
        return reply.code(statusCode).send({ message });
    }
});
app.get("/api/games/servers/minecraft/file", protectedRoute, async (request, reply) => {
    const parsedQuery = gamePathQuerySchema.safeParse(request.query);
    if (!parsedQuery.success || !parsedQuery.data.path) {
        return reply.code(400).send({ message: "Podaj ścieżkę pliku." });
    }
    try {
        return await minecraftFiles.read(parsedQuery.data.path);
    }
    catch (error) {
        const statusCode = error instanceof MinecraftFileError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się odczytać pliku.";
        return reply.code(statusCode).send({ message });
    }
});
app.put("/api/games/servers/minecraft/file", protectedRoute, async (request, reply) => {
    const parsedBody = gameFileBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
        return reply.code(400).send({ message: "Nieprawidłowa treść lub ścieżka pliku." });
    }
    try {
        const result = await minecraftFiles.write(parsedBody.data.path, parsedBody.data.content);
        database.recordGameActivity("file_update", { path: parsedBody.data.path });
        return result;
    }
    catch (error) {
        const statusCode = error instanceof MinecraftFileError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się zapisać pliku.";
        return reply.code(statusCode).send({ message });
    }
});
app.get("/api/games/servers/minecraft/plugins", protectedRoute, async (_request, reply) => {
    try {
        return await minecraftFiles.listPlugins();
    }
    catch (error) {
        const statusCode = error instanceof MinecraftFileError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : "Nie udało się odczytać pluginów.";
        return reply.code(statusCode).send({ message });
    }
});
app.post("/api/games/servers/minecraft/plugins", protectedRoute, async (request, reply) => {
    let upload;
    try {
        upload = await request.file();
        if (!upload)
            return reply.code(400).send({ message: "Wybierz plik pluginu .jar." });
        const result = await minecraftFiles.savePlugin(upload.filename, upload.file);
        database.recordGameActivity("plugin_upload", { filename: result.name, sizeBytes: result.sizeBytes });
        return result;
    }
    catch (error) {
        upload?.file.resume();
        const statusCode = error instanceof MinecraftFileError
            ? error.statusCode
            : error !== null && typeof error === "object" && "statusCode" in error
                ? Number(error.statusCode) || 500
                : 500;
        const message = error instanceof Error ? error.message : "Nie udało się przesłać pluginu.";
        return reply.code(statusCode).send({ message });
    }
});
app.get("/api/files", protectedRoute, async (request, reply) => {
    const parsedQuery = filesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
        return reply.code(400).send({ message: "Nieprawidłowa ścieżka." });
    }
    try {
        const { absolutePath, normalizedPath } = await resolveStoragePath(parsedQuery.data.path);
        const directoryEntries = await readdir(absolutePath, { withFileTypes: true });
        const entries = await Promise.all(directoryEntries.map(async (entry) => {
            const entryPath = path.join(absolutePath, entry.name);
            const details = await lstat(entryPath);
            return {
                name: entry.name,
                path: path.posix.join(normalizedPath, entry.name),
                type: entry.isDirectory() ? "directory" : "file",
                sizeBytes: entry.isFile() ? details.size : null,
                modifiedAt: details.mtime.toISOString(),
            };
        }));
        entries.sort((left, right) => {
            if (left.type !== right.type) {
                return left.type === "directory" ? -1 : 1;
            }
            return left.name.localeCompare(right.name, "pl");
        });
        const pathParts = normalizedPath.split("/").filter(Boolean);
        return {
            path: normalizedPath,
            parentPath: pathParts.slice(0, -1).join("/"),
            entries,
        };
    }
    catch (error) {
        request.log.warn(error);
        return reply.code(404).send({ message: "Nie znaleziono katalogu." });
    }
});
try {
    await app.listen({
        host: process.env.HOST ?? "127.0.0.1",
        port: Number(process.env.PORT ?? 3001),
    });
}
catch (error) {
    app.log.error(error);
    process.exit(1);
}
