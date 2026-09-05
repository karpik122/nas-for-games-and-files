import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GameServerState =
  | "running"
  | "starting"
  | "stopped"
  | "unavailable"
  | "error";

export type GameServerStatus = {
  id: "minecraft";
  name: string;
  game: "Minecraft Java Edition";
  state: GameServerState;
  health: string | null;
  containerName: string;
  address: string;
  port: number;
  version: string;
  serverType: string;
  memory: string;
  eulaAccepted: boolean;
  message: string | null;
};

export class GameServerError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "GameServerError";
  }
}

type ComposeContainer = {
  State?: string;
  Health?: string;
  Status?: string;
};

type MinecraftEnvironment = {
  eulaAccepted: boolean;
  memory: string;
  port: number;
  serverType: string;
  version: string;
};

export class GameServerManager {
  private readonly minecraftRoot: string;
  private readonly composePath: string;
  private readonly envPath: string;
  private readonly secretsRoot: string;

  constructor(gameServersRoot: string) {
    this.minecraftRoot = path.join(gameServersRoot, "minecraft");
    this.composePath = path.join(this.minecraftRoot, "compose.yaml");
    this.envPath = path.join(this.minecraftRoot, ".env");
    this.secretsRoot = path.join(this.minecraftRoot, ".secrets");
  }

  async listServers(): Promise<GameServerStatus[]> {
    return [await this.getMinecraftStatus()];
  }

  async startMinecraft(): Promise<GameServerStatus> {
    const environment = await this.readMinecraftEnvironment();
    if (!environment.eulaAccepted) {
      throw new GameServerError(
        "Przed startem zaakceptuj Minecraft EULA w pliku game-servers/minecraft/.env.",
        409,
      );
    }

    await this.runCompose(["up", "-d", "minecraft"], 180_000);
    return this.getMinecraftStatus();
  }

  async stopMinecraft(): Promise<GameServerStatus> {
    await this.runCompose(["stop", "minecraft"], 120_000);
    return this.getMinecraftStatus();
  }

  async getMinecraftLogs(tail = 200) {
    const safeTail = Math.min(Math.max(Math.trunc(tail), 20), 500);

    try {
      const { stdout, stderr } = await this.runCompose(
        ["logs", "--no-color", "--no-log-prefix", "--tail", String(safeTail), "minecraft"],
        15_000,
      );
      const output = `${stdout}${stderr}`.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trimEnd();
      return {
        output,
        lineCount: output ? output.split(/\r?\n/).length : 0,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this.toConsoleError(error, "Nie udało się pobrać logów serwera Minecraft.");
    }
  }

  async sendMinecraftCommand(command: string) {
    const normalizedCommand = command.trim();

    try {
      const { stdout, stderr } = await this.runCompose(
        ["exec", "-T", "--user", "1000", "minecraft", "mc-send-to-console", normalizedCommand],
        15_000,
      );
      return {
        command: normalizedCommand,
        output: `${stdout}${stderr}`.trim() || "Komenda została wysłana do serwera.",
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      throw this.toConsoleError(error, "Nie udało się wysłać komendy do serwera Minecraft.");
    }
  }

  private async getMinecraftStatus(): Promise<GameServerStatus> {
    const environment = await this.readMinecraftEnvironment();
    const baseStatus = this.baseMinecraftStatus(environment);

    try {
      const { stdout } = await this.runCompose(
        ["ps", "--format", "json", "minecraft"],
        15_000,
      );
      const containers = this.parseComposeOutput(stdout);
      const container = containers[0];

      if (!container) return baseStatus;

      const rawState = container.State?.toLowerCase() ?? "";
      const state: GameServerState = rawState === "running"
        ? "running"
        : rawState === "restarting"
          ? "starting"
          : rawState === "exited" || rawState === "created"
            ? "stopped"
            : "error";

      return {
        ...baseStatus,
        state,
        health: container.Health ?? null,
        message: container.Status ?? null,
      };
    } catch (error) {
      if (this.isDockerUnavailable(error)) {
        return {
          ...baseStatus,
          state: "unavailable",
          message: "Docker nie jest zainstalowany albo usługa Docker nie działa.",
        };
      }

      return {
        ...baseStatus,
        state: "error",
        message: error instanceof Error ? error.message : "Nie udało się odczytać stanu kontenera.",
      };
    }
  }

  private baseMinecraftStatus(environment: MinecraftEnvironment): GameServerStatus {
    return {
      id: "minecraft",
      name: "KarpikNAS Minecraft",
      game: "Minecraft Java Edition",
      state: "stopped",
      health: null,
      containerName: "karpiknas-minecraft",
      address: "localhost",
      port: environment.port,
      version: environment.version,
      serverType: environment.serverType,
      memory: environment.memory,
      eulaAccepted: environment.eulaAccepted,
      message: null,
    };
  }

  private async readMinecraftEnvironment(): Promise<MinecraftEnvironment> {
    let contents = "";
    try {
      contents = await readFile(this.envPath, "utf8");
    } catch {
      // Brak .env oznacza bezpieczne wartości domyślne z wyłączoną akceptacją EULA.
    }

    const values = new Map<string, string>();
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      values.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
    }

    const portValue = Number(values.get("MINECRAFT_PORT") ?? "25565");

    return {
      eulaAccepted: /^(true|1|yes)$/i.test(values.get("MINECRAFT_EULA") ?? "false"),
      memory: values.get("MINECRAFT_MEMORY") ?? "4G",
      port: Number.isInteger(portValue) && portValue > 0 && portValue <= 65_535
        ? portValue
        : 25_565,
      serverType: values.get("MINECRAFT_TYPE") ?? "PAPER",
      version: values.get("MINECRAFT_VERSION") ?? "LATEST",
    };
  }

  private async runCompose(argumentsList: string[], timeout: number) {
    try {
      await this.ensureDockerSecrets();
      return await execFileAsync(
        "docker",
        ["compose", "-f", this.composePath, ...argumentsList],
        {
          cwd: this.minecraftRoot,
          encoding: "utf8",
          timeout,
          windowsHide: true,
        },
      );
    } catch (error) {
      if (this.isDockerUnavailable(error)) {
        throw new GameServerError(
          "Docker nie jest zainstalowany albo usługa Docker nie działa.",
          503,
        );
      }
      throw error;
    }
  }

  private async ensureDockerSecrets() {
    await mkdir(this.secretsRoot, { recursive: true });
    for (const filename of ["minecraft_db_password", "minecraft_db_root_password"]) {
      const secretPath = path.join(this.secretsRoot, filename);
      await writeFile(secretPath, `${randomBytes(32).toString("hex")}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }).catch((error: unknown) => {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      });
    }
  }

  private parseComposeOutput(output: string): ComposeContainer[] {
    const trimmed = output.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed) as ComposeContainer | ComposeContainer[];
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return trimmed
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ComposeContainer);
    }
  }

  private isDockerUnavailable(error: unknown) {
    if (error instanceof GameServerError && error.statusCode === 503) return true;
    if (!(error instanceof Error)) return false;
    const code = "code" in error ? String(error.code) : "";
    return code === "ENOENT" || /docker.*(not found|not recognized|cannot connect)/i.test(error.message);
  }

  private toConsoleError(error: unknown, fallbackMessage: string) {
    if (error instanceof GameServerError) return error;
    const message = error instanceof Error ? error.message : "";
    if (/not running|is not running|no container found|service .* is not running/i.test(message)) {
      return new GameServerError("Serwer Minecraft nie jest uruchomiony.", 409);
    }
    return new GameServerError(fallbackMessage, 500);
  }
}
