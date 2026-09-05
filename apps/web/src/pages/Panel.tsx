import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import "../App.css";
import { ApiError, apiRequest } from "../api";

type PanelProps = {
  username: string;
  onGoHome: () => void;
  onLogout: () => Promise<void>;
  onSessionExpired: () => void;
};

type SystemSummary = {
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

type DiskInfo = {
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

type FileEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  sizeBytes: number | null;
  modifiedAt: string;
};

type DirectoryListing = {
  path: string;
  parentPath: string;
  entries: FileEntry[];
};

type GameServerStatus = {
  id: "minecraft";
  name: string;
  game: "Minecraft Java Edition";
  state: "running" | "starting" | "stopped" | "unavailable" | "error";
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

type ServerFileEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  sizeBytes: number | null;
  modifiedAt: string;
  editable: boolean;
};

type ServerDirectoryListing = {
  path: string;
  parentPath: string;
  entries: ServerFileEntry[];
};

type EditableServerFile = {
  path: string;
  content: string;
  modifiedAt: string;
};

type MinecraftPlugin = {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
};

type MinecraftConsoleLog = {
  output: string;
  lineCount: number;
  capturedAt: string;
};

type MinecraftCommandResult = {
  command: string;
  output: string;
  sentAt: string;
};

type Page = "overview" | "files" | "storage" | "games" | "activity" | "settings";
type IconName =
  | "activity"
  | "chevron"
  | "cpu"
  | "database"
  | "file"
  | "folder"
  | "gamepad"
  | "grid"
  | "hard-drive"
  | "log-out"
  | "memory"
  | "refresh"
  | "settings"
  | "shield"
  | "thermometer"
  | "upload";

const navItems: Array<{ id: Page; label: string; icon: IconName }> = [
  { id: "overview", label: "Pulpit", icon: "grid" },
  { id: "files", label: "Pliki", icon: "folder" },
  { id: "storage", label: "Magazyn", icon: "hard-drive" },
  { id: "games", label: "Gry", icon: "gamepad" },
  { id: "activity", label: "Aktywność", icon: "activity" },
  { id: "settings", label: "Ustawienia", icon: "settings" },
];

const pageTitles: Record<Page, string> = {
  overview: "Pulpit",
  files: "Menedżer plików",
  storage: "Magazyn",
  games: "Serwery gier",
  activity: "Aktywność",
  settings: "Ustawienia",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    activity: <path d="M3 12h4l2.2-6 4.3 12 2.3-6H21" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    cpu: (
      <>
        <rect width="14" height="14" x="5" y="5" rx="2" />
        <path d="M9 9h6v6H9zM9 1v4M15 1v4M9 19v4M15 19v4M19 9h4M19 14h4M1 9h4M1 14h4" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
      </>
    ),
    file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    gamepad: <path d="M8 12h4M10 10v4M16 12h.01M18 10h.01M7 7h10a5 5 0 0 1 4.8 6.4l-1.2 4A2.2 2.2 0 0 1 17 18.5L15.5 17h-7L7 18.5a2.2 2.2 0 0 1-3.6-1.1l-1.2-4A5 5 0 0 1 7 7Z" />,
    grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    "hard-drive": (
      <>
        <path d="M4 5h16l2 7H2Z" />
        <path d="M2 12v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5M16 16h.01M19 16h.01" />
      </>
    ),
    "log-out": <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />,
    memory: <path d="M6 7h12v10H6zM8 10h2v4H8zM12 10h2v4h-2zM2 9h4M2 15h4M18 9h4M18 15h4M9 3v4M15 3v4M9 17v4M15 17v4" />,
    refresh: <path d="M20 12a8 8 0 0 1-14.9 4M4 12A8 8 0 0 1 18.9 8M5 20v-4h4M19 4v4h-4" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3.5-10 2.2 2.2 4.8-4.8" />,
    thermometer: <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0ZM12 10v7" />,
    upload: <path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" />,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex < 3 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days} d ${hours} godz.` : `${hours} godz.`;
}

function usagePercent(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

function formatModified(date: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function ProgressBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "violet" }) {
  return (
    <div className="progress-track" aria-label={`Wykorzystano ${value}%`}>
      <span className={`progress-fill ${tone}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function Panel({ username, onGoHome, onLogout, onSessionExpired }: PanelProps) {
  const [activePage, setActivePage] = useState<Page>("overview");
  const [system, setSystem] = useState<SystemSummary | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [files, setFiles] = useState<DirectoryListing | null>(null);
  const [gameServers, setGameServers] = useState<GameServerStatus[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gameAction, setGameAction] = useState<"start" | "stop" | null>(null);
  const [gameSection, setGameSection] = useState<"overview" | "console" | "plugins" | "files">("overview");
  const [plugins, setPlugins] = useState<MinecraftPlugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginUploading, setPluginUploading] = useState(false);
  const [serverFiles, setServerFiles] = useState<ServerDirectoryListing | null>(null);
  const [serverFilesLoading, setServerFilesLoading] = useState(false);
  const [selectedServerFile, setSelectedServerFile] = useState<EditableServerFile | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [fileSaving, setFileSaving] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const [consoleLog, setConsoleLog] = useState<MinecraftConsoleLog | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleCommand, setConsoleCommand] = useState("");
  const [consoleSending, setConsoleSending] = useState(false);
  const [consoleError, setConsoleError] = useState("");
  const [consoleMessage, setConsoleMessage] = useState("");
  const pluginInputRef = useRef<HTMLInputElement>(null);
  const consoleOutputRef = useRef<HTMLPreElement>(null);

  const handleRequestError = useCallback((requestError: unknown) => {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionExpired();
      return;
    }

    setError(requestError instanceof Error ? requestError.message : "Nieznany błąd");
  }, [onSessionExpired]);

  const loadFiles = useCallback(async (directoryPath = "") => {
    setFilesLoading(true);
    try {
      const result = await apiRequest<DirectoryListing>(
        `/api/files?path=${encodeURIComponent(directoryPath)}`,
      );
      setFiles(result);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setFilesLoading(false);
    }
  }, [handleRequestError]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [systemResult, disksResult] = await Promise.all([
        apiRequest<SystemSummary>("/api/system/summary"),
        apiRequest<DiskInfo[]>("/api/system/disks"),
      ]);
      setSystem(systemResult);
      setDisks(disksResult);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setLoading(false);
    }
  }, [handleRequestError]);

  const loadGameServers = useCallback(async () => {
    setGamesLoading(true);
    try {
      const result = await apiRequest<GameServerStatus[]>("/api/games/servers");
      setGameServers(result);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setGamesLoading(false);
    }
  }, [handleRequestError]);

  const loadPlugins = useCallback(async () => {
    setPluginsLoading(true);
    try {
      const result = await apiRequest<MinecraftPlugin[]>("/api/games/servers/minecraft/plugins");
      setPlugins(result);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setPluginsLoading(false);
    }
  }, [handleRequestError]);

  const loadConsoleLogs = useCallback(async (silent = false) => {
    if (!silent) setConsoleLoading(true);
    try {
      const result = await apiRequest<MinecraftConsoleLog>("/api/games/servers/minecraft/console/logs?tail=250");
      setConsoleLog(result);
      setConsoleError("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
      } else {
        setConsoleError(requestError instanceof Error ? requestError.message : "Nie udało się pobrać konsoli.");
      }
    } finally {
      if (!silent) setConsoleLoading(false);
    }
  }, [onSessionExpired]);

  const loadServerDirectory = useCallback(async (directoryPath = "") => {
    setServerFilesLoading(true);
    setSelectedServerFile(null);
    setFileSaved(false);
    try {
      const result = await apiRequest<ServerDirectoryListing>(
        `/api/games/servers/minecraft/files?path=${encodeURIComponent(directoryPath)}`,
      );
      setServerFiles(result);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setServerFilesLoading(false);
    }
  }, [handleRequestError]);

  const loadServerFile = async (filePath: string) => {
    setFileSaved(false);
    try {
      const result = await apiRequest<EditableServerFile>(
        `/api/games/servers/minecraft/file?path=${encodeURIComponent(filePath)}`,
      );
      setSelectedServerFile(result);
      setEditorContent(result.content);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    }
  };

  const saveServerFile = async () => {
    if (!selectedServerFile) return;
    setFileSaving(true);
    setFileSaved(false);
    try {
      const result = await apiRequest<EditableServerFile>("/api/games/servers/minecraft/file", {
        method: "PUT",
        body: JSON.stringify({ path: selectedServerFile.path, content: editorContent }),
      });
      setSelectedServerFile(result);
      setFileSaved(true);
      setError("");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setFileSaving(false);
    }
  };

  const uploadPlugin = async (event: ChangeEvent<HTMLInputElement>) => {
    const plugin = event.target.files?.[0];
    event.target.value = "";
    if (!plugin) return;
    if (!plugin.name.toLowerCase().endsWith(".jar")) {
      setError("Wybierz plugin Minecraft z rozszerzeniem .jar.");
      return;
    }

    setPluginUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("plugin", plugin, plugin.name);
      await apiRequest<MinecraftPlugin & { restartRequired: boolean }>(
        "/api/games/servers/minecraft/plugins",
        { method: "POST", body: formData },
      );
      await loadPlugins();
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setPluginUploading(false);
    }
  };

  const sendConsoleCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = consoleCommand.trim();
    if (!command || consoleSending) return;

    setConsoleSending(true);
    setConsoleError("");
    setConsoleMessage("");
    try {
      const result = await apiRequest<MinecraftCommandResult>(
        "/api/games/servers/minecraft/console/command",
        { method: "POST", body: JSON.stringify({ command }) },
      );
      setConsoleCommand("");
      setConsoleMessage(result.output);
      await loadConsoleLogs(true);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionExpired();
      } else {
        setConsoleError(requestError instanceof Error ? requestError.message : "Nie udało się wysłać komendy.");
      }
    } finally {
      setConsoleSending(false);
    }
  };

  const openGameSection = (section: "overview" | "console" | "plugins" | "files") => {
    setGameSection(section);
    if (section === "plugins") void loadPlugins();
    if (section === "files") void loadServerDirectory(serverFiles?.path ?? "");
  };

  useEffect(() => {
    if (activePage !== "games" || gameSection !== "console") return;

    const initialRefreshId = window.setTimeout(() => void loadConsoleLogs(), 0);
    const refreshId = window.setInterval(() => void loadConsoleLogs(true), 4_000);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(refreshId);
    };
  }, [activePage, gameSection, loadConsoleLogs]);

  useEffect(() => {
    if (consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop = consoleOutputRef.current.scrollHeight;
    }
  }, [consoleLog?.output]);

  useEffect(() => {
    void Promise.all([
      apiRequest<SystemSummary>("/api/system/summary"),
      apiRequest<DiskInfo[]>("/api/system/disks"),
      apiRequest<DirectoryListing>("/api/files"),
      apiRequest<GameServerStatus[]>("/api/games/servers"),
    ])
      .then(([systemResult, disksResult, filesResult, gamesResult]) => {
        setSystem(systemResult);
        setDisks(disksResult);
        setFiles(filesResult);
        setGameServers(gamesResult);
        setError("");
      })
      .catch((requestError: unknown) => {
        handleRequestError(requestError);
      })
      .finally(() => setLoading(false));
  }, [handleRequestError]);

  const storageUsage = useMemo(
    () => (system ? usagePercent(system.storage.usedBytes, system.storage.totalBytes) : 0),
    [system],
  );
  const memoryUsage = useMemo(
    () => (system ? usagePercent(system.memory.usedBytes, system.memory.totalBytes) : 0),
    [system],
  );

  const openDirectory = (directoryPath: string) => {
    setActivePage("files");
    void loadFiles(directoryPath);
  };

  const refreshCurrentView = () => {
    void loadDashboard();
    if (activePage === "files") void loadFiles(files?.path ?? "");
    if (activePage === "games") {
      void loadGameServers();
      if (gameSection === "console") void loadConsoleLogs();
      if (gameSection === "plugins") void loadPlugins();
      if (gameSection === "files") void loadServerDirectory(serverFiles?.path ?? "");
    }
  };

  const runGameServerAction = async (action: "start" | "stop") => {
    setGameAction(action);
    setError("");
    try {
      await apiRequest<GameServerStatus>(`/api/games/servers/minecraft/${action}`, {
        method: "POST",
      });
      await loadGameServers();
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setGameAction(null);
    }
  };

  const renderOverview = () => {
    if (loading && !system) {
      return <div className="state-card"><span className="spinner" />Ładowanie informacji o serwerze…</div>;
    }

    if (!system) {
      return (
        <div className="state-card error-state">
          <strong>API jest niedostępne</strong>
          <span>{error || "Uruchom backend na porcie 3001 i spróbuj ponownie."}</span>
          <button className="primary-button" onClick={refreshCurrentView}>Połącz ponownie</button>
        </div>
      );
    }

    return (
      <>
        <section className="welcome-row">
          <div>
            <p className="eyebrow">CENTRUM STEROWANIA</p>
            <h1>Witaj w KarpikNAS</h1>
            <p className="welcome-copy">Twój domowy serwer działa prawidłowo. Wszystkie podstawowe usługi są dostępne.</p>
          </div>
          <div className="health-pill"><span /> System sprawny</div>
        </section>

        <section className="metric-grid" aria-label="Podsumowanie systemu">
          <article className="metric-card">
            <div className="metric-icon blue"><Icon name="database" /></div>
            <div className="metric-copy">
              <span>Wykorzystanie magazynu</span>
              <strong>{storageUsage}%</strong>
              <small>{formatBytes(system.storage.freeBytes)} wolne</small>
            </div>
            <div className="metric-ring" style={{ "--progress": `${storageUsage * 3.6}deg` } as React.CSSProperties}>
              <span>{storageUsage}%</span>
            </div>
          </article>
          <article className="metric-card">
            <div className="metric-icon violet"><Icon name="memory" /></div>
            <div className="metric-copy">
              <span>Pamięć RAM</span>
              <strong>{formatBytes(system.memory.usedBytes)}</strong>
              <small>z {formatBytes(system.memory.totalBytes)}</small>
            </div>
            <div className="metric-side-value">{memoryUsage}%</div>
          </article>
          <article className="metric-card">
            <div className="metric-icon cyan"><Icon name="cpu" /></div>
            <div className="metric-copy">
              <span>Procesor</span>
              <strong>{system.cpuThreads} wątków</strong>
              <small>Platforma {system.platform}</small>
            </div>
            <span className="pulse-bars"><i /><i /><i /><i /></span>
          </article>
          <article className="metric-card">
            <div className="metric-icon green"><Icon name="activity" /></div>
            <div className="metric-copy">
              <span>Czas działania</span>
              <strong>{formatUptime(system.uptimeSeconds)}</strong>
              <small>Bez przerwy</small>
            </div>
            <span className="online-dot" />
          </article>
        </section>

        <section className="dashboard-grid">
          <article className="panel storage-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">GŁÓWNY MAGAZYN</span>
                <h2>Przestrzeń dyskowa</h2>
              </div>
              <button className="text-button" onClick={() => setActivePage("storage")}>Szczegóły <Icon name="chevron" size={16} /></button>
            </div>
            <div className="storage-summary">
              <div>
                <strong>{formatBytes(system.storage.usedBytes)}</strong>
                <span>wykorzystane z {formatBytes(system.storage.totalBytes)}</span>
              </div>
              <b>{storageUsage}%</b>
            </div>
            <ProgressBar value={storageUsage} />
            <div className="legend-row">
              <span><i className="legend used" /> Zajęte {formatBytes(system.storage.usedBytes)}</span>
              <span><i className="legend free" /> Wolne {formatBytes(system.storage.freeBytes)}</span>
            </div>
          </article>

          <article className="panel status-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">STATUS</span>
                <h2>Stan urządzenia</h2>
              </div>
              <span className="shield-icon"><Icon name="shield" /></span>
            </div>
            <div className="status-list">
              <div><span>Serwer API</span><b className="status-ok">Aktywny</b></div>
              <div><span>Magazyn plików</span><b className="status-ok">Dostępny</b></div>
              <div><span>Tryb systemowy</span><b className="status-neutral">Windows test</b></div>
            </div>
          </article>
        </section>

        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">PLIKI</span>
              <h2>Szybki dostęp</h2>
            </div>
            <button className="text-button" onClick={() => setActivePage("files")}>Wszystkie pliki <Icon name="chevron" size={16} /></button>
          </div>
          <div className="folder-grid">
            {(files?.entries.filter((entry) => entry.type === "directory") ?? []).slice(0, 4).map((entry, index) => (
              <button className="folder-card" key={entry.path} onClick={() => openDirectory(entry.path)}>
                <span className={`folder-icon folder-${index % 3}`}><Icon name="folder" size={25} /></span>
                <span><strong>{entry.name}</strong><small>Katalog</small></span>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
        </section>
      </>
    );
  };

  const renderFiles = () => {
    const crumbs = files?.path.split("/").filter(Boolean) ?? [];

    return (
      <section className="panel files-panel">
        <div className="files-toolbar">
          <div>
            <span className="panel-kicker">DEV-STORAGE</span>
            <h1>Twoje pliki</h1>
          </div>
          <button className="secondary-button disabled-action" title="Przesyłanie plików pojawi się w kolejnym etapie">
            <Icon name="upload" size={17} /> Prześlij plik
          </button>
        </div>
        <nav className="breadcrumbs" aria-label="Ścieżka katalogu">
          <button onClick={() => void loadFiles("")}>Magazyn</button>
          {crumbs.map((crumb, index) => {
            const crumbPath = crumbs.slice(0, index + 1).join("/");
            return (
              <span key={crumbPath}>
                <Icon name="chevron" size={14} />
                <button onClick={() => void loadFiles(crumbPath)}>{crumb}</button>
              </span>
            );
          })}
        </nav>
        <div className="file-table" aria-busy={filesLoading}>
          <div className="file-row file-header">
            <span>Nazwa</span><span>Rozmiar</span><span>Modyfikacja</span>
          </div>
          {files?.path && (
            <button className="file-row interactive" onClick={() => void loadFiles(files.parentPath)}>
              <span className="file-name"><span className="file-icon muted"><Icon name="folder" size={19} /></span><strong>..</strong></span>
              <span>—</span><span>Katalog nadrzędny</span>
            </button>
          )}
          {filesLoading ? (
            <div className="file-empty"><span className="spinner" />Otwieranie katalogu…</div>
          ) : files?.entries.length ? (
            files.entries.map((entry) => (
              <button
                className={`file-row ${entry.type === "directory" ? "interactive" : ""}`}
                key={entry.path}
                onClick={() => entry.type === "directory" && void loadFiles(entry.path)}
                disabled={entry.type === "file"}
              >
                <span className="file-name">
                  <span className={`file-icon ${entry.type}`}><Icon name={entry.type === "directory" ? "folder" : "file"} size={19} /></span>
                  <strong>{entry.name}</strong>
                </span>
                <span>{entry.sizeBytes === null ? "—" : formatBytes(entry.sizeBytes)}</span>
                <span>{formatModified(entry.modifiedAt)}</span>
              </button>
            ))
          ) : (
            <div className="file-empty"><Icon name="folder" size={30} />Ten katalog jest pusty</div>
          )}
        </div>
      </section>
    );
  };

  const renderStorage = () => (
    <div className="page-stack">
      <div className="page-intro">
        <p className="eyebrow">MAGAZYN</p>
        <h1>Dyski i wolumeny</h1>
        <p>Podgląd nośników udostępnionych przez aktywny adapter systemowy.</p>
      </div>
      <div className="disk-grid">
        {disks.map((disk) => {
          const diskUsage = usagePercent(disk.usedBytes, disk.totalBytes);
          return (
            <article className="panel disk-card" key={disk.id}>
              <div className="disk-title-row">
                <span className="disk-visual"><Icon name="hard-drive" size={27} /></span>
                <div><h2>{disk.name}</h2><p>{disk.filesystem} · {disk.mountPoint}</p></div>
                {disk.isMock && <span className="mock-badge">DANE TESTOWE</span>}
              </div>
              <div className="storage-summary">
                <div><strong>{formatBytes(disk.usedBytes)}</strong><span>z {formatBytes(disk.totalBytes)}</span></div>
                <b>{diskUsage}%</b>
              </div>
              <ProgressBar value={diskUsage} tone="violet" />
              <div className="disk-meta">
                <span><i className="status-light" /> Stan prawidłowy</span>
                <span><Icon name="thermometer" size={16} /> {disk.temperatureC === null ? "SMART na Debianie" : `${disk.temperatureC}°C`}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  const renderPlugins = () => (
    <section className="panel game-tool-panel">
      <div className="game-tool-heading">
        <div>
          <span className="panel-kicker">PAPER / SPIGOT</span>
          <h2>Pluginy Minecraft</h2>
          <p>Przesyłaj pluginy `.jar` bezpośrednio do katalogu serwera.</p>
        </div>
        <input
          ref={pluginInputRef}
          className="visually-hidden"
          type="file"
          accept=".jar,application/java-archive,application/octet-stream"
          onChange={(event) => void uploadPlugin(event)}
        />
        <button className="game-action" disabled={pluginUploading} onClick={() => pluginInputRef.current?.click()}>
          {pluginUploading ? <><span className="spinner" />Przesyłanie…</> : <><Icon name="upload" size={15} />Dodaj plugin</>}
        </button>
      </div>

      <div className="plugin-list" aria-busy={pluginsLoading}>
        <div className="plugin-row plugin-header"><span>Nazwa pluginu</span><span>Rozmiar</span><span>Dodano</span></div>
        {pluginsLoading ? (
          <div className="tool-empty"><span className="spinner" />Wczytywanie pluginów…</div>
        ) : plugins.length ? plugins.map((plugin) => (
          <div className="plugin-row" key={plugin.name}>
            <span className="plugin-name"><i>JAR</i><strong>{plugin.name}</strong></span>
            <span>{formatBytes(plugin.sizeBytes)}</span>
            <span>{formatModified(plugin.modifiedAt)}</span>
          </div>
        )) : (
          <div className="tool-empty"><Icon name="database" size={26} /><strong>Brak pluginów</strong><span>Dodaj pierwszy plik `.jar`. Zostanie załadowany po ponownym uruchomieniu serwera.</span></div>
        )}
      </div>
      <div className="game-tool-note"><span>!</span>Po dodaniu pluginu zatrzymaj i ponownie uruchom serwer Minecraft.</div>
    </section>
  );

  const renderServerFiles = () => {
    const crumbs = serverFiles?.path.split("/").filter(Boolean) ?? [];

    return (
      <section className="server-editor-grid">
        <article className="panel server-file-browser">
          <div className="game-tool-heading compact">
            <div><span className="panel-kicker">/DATA</span><h2>Pliki serwera</h2></div>
          </div>
          <nav className="server-file-crumbs" aria-label="Ścieżka plików serwera">
            <button onClick={() => void loadServerDirectory("")}>minecraft</button>
            {crumbs.map((crumb, index) => {
              const crumbPath = crumbs.slice(0, index + 1).join("/");
              return <span key={crumbPath}><b>/</b><button onClick={() => void loadServerDirectory(crumbPath)}>{crumb}</button></span>;
            })}
          </nav>
          <div className="server-file-list" aria-busy={serverFilesLoading}>
            {serverFiles?.path && (
              <button onClick={() => void loadServerDirectory(serverFiles.parentPath)}>
                <span className="server-file-icon directory"><Icon name="folder" size={16} /></span><strong>..</strong><small>Katalog wyżej</small>
              </button>
            )}
            {serverFilesLoading ? (
              <div className="tool-empty"><span className="spinner" />Otwieranie katalogu…</div>
            ) : serverFiles?.entries.length ? serverFiles.entries.map((entry) => (
              <button
                className={selectedServerFile?.path === entry.path ? "selected" : ""}
                disabled={entry.type === "file" && !entry.editable}
                key={entry.path}
                title={entry.type === "file" && !entry.editable ? "Tego typu pliku nie można edytować" : undefined}
                onClick={() => entry.type === "directory" ? void loadServerDirectory(entry.path) : void loadServerFile(entry.path)}
              >
                <span className={`server-file-icon ${entry.type}`}><Icon name={entry.type === "directory" ? "folder" : "file"} size={16} /></span>
                <strong>{entry.name}</strong>
                <small>{entry.type === "directory" ? "Katalog" : entry.editable ? formatBytes(entry.sizeBytes ?? 0) : "Tylko odczyt"}</small>
              </button>
            )) : <div className="tool-empty"><Icon name="folder" size={25} /><span>Katalog jest pusty</span></div>}
          </div>
        </article>

        <article className="panel server-code-editor">
          {selectedServerFile ? (
            <>
              <div className="editor-heading">
                <div><span>EDYCJA PLIKU</span><strong>{selectedServerFile.path}</strong></div>
                <button className="game-action" disabled={fileSaving} onClick={() => void saveServerFile()}>
                  {fileSaving ? <><span className="spinner" />Zapisywanie…</> : fileSaved ? "Zapisano ✓" : "Zapisz zmiany"}
                </button>
              </div>
              <textarea
                aria-label={`Treść pliku ${selectedServerFile.path}`}
                spellCheck={false}
                value={editorContent}
                onChange={(event) => { setEditorContent(event.target.value); setFileSaved(false); }}
              />
              <div className="editor-footer"><span>UTF-8</span><span>Limit 1 MB</span></div>
            </>
          ) : (
            <div className="editor-placeholder"><Icon name="file" size={31} /><strong>Wybierz plik do edycji</strong><span>Obsługiwane są pliki `.properties`, `.yml`, `.json`, `.toml`, `.cfg`, `.conf`, `.ini` i `.txt`.</span></div>
          )}
        </article>
      </section>
    );
  };

  const renderConsole = (minecraft: GameServerStatus) => {
    const canSendCommand = minecraft.state === "running";

    return (
      <section className="panel minecraft-console-panel">
        <div className="console-toolbar">
          <div>
            <span className="panel-kicker">KONSOLA MINECRAFT</span>
            <h2>Terminal serwera</h2>
            <p>Ostatnie 250 linii · automatyczne odświeżanie co 4 sekundy</p>
          </div>
          <button className="console-refresh" disabled={consoleLoading} onClick={() => void loadConsoleLogs()}>
            <Icon name="refresh" size={14} />{consoleLoading ? "Odświeżanie…" : "Odśwież"}
          </button>
        </div>

        <pre ref={consoleOutputRef} className="console-output" aria-live="polite" aria-label="Logi serwera Minecraft">
          {consoleLoading && !consoleLog
            ? "Łączenie z konsolą…"
            : consoleError
              ? `[KarpikNAS] ${consoleError}`
              : consoleLog?.output || "[KarpikNAS] Konsola jest pusta. Uruchom serwer, aby zobaczyć logi."}
        </pre>

        <form className="console-command-form" onSubmit={(event) => void sendConsoleCommand(event)}>
          <span aria-hidden="true">›</span>
          <input
            aria-label="Komenda Minecraft"
            autoComplete="off"
            disabled={!canSendCommand || consoleSending}
            maxLength={500}
            placeholder={canSendCommand ? "Wpisz komendę, np. say Witaj na serwerze" : "Uruchom serwer, aby wpisywać komendy"}
            value={consoleCommand}
            onChange={(event) => { setConsoleCommand(event.target.value); setConsoleMessage(""); }}
          />
          <button disabled={!canSendCommand || !consoleCommand.trim() || consoleSending} type="submit">
            {consoleSending ? "Wysyłanie…" : "Wyślij"}
          </button>
        </form>
        <div className="console-status-row">
          <span><i className={canSendCommand ? "online" : ""} />{canSendCommand ? "Serwer gotowy na komendy" : "Konsola tylko do odczytu"}</span>
          <span>{consoleMessage || (consoleLog ? `Odczyt: ${new Date(consoleLog.capturedAt).toLocaleTimeString("pl-PL")}` : "")}</span>
        </div>
      </section>
    );
  };

  const renderGames = () => {
    const minecraft = gameServers.find((server) => server.id === "minecraft");
    const stateLabels: Record<GameServerStatus["state"], string> = {
      running: "Uruchomiony",
      starting: "Uruchamianie",
      stopped: "Zatrzymany",
      unavailable: "Docker niedostępny",
      error: "Błąd",
    };

    if (gamesLoading && !minecraft) {
      return <div className="state-card"><span className="spinner" />Sprawdzanie serwerów gier…</div>;
    }

    if (!minecraft) {
      return <div className="state-card error-state"><strong>Brak konfiguracji gry</strong><span>Nie udało się znaleźć serwera Minecraft.</span></div>;
    }

    const canStart = minecraft.state !== "unavailable" && minecraft.eulaAccepted;
    const isRunning = minecraft.state === "running" || minecraft.state === "starting";

    return (
      <div className="page-stack games-page">
        <div className="page-intro">
          <p className="eyebrow">DOCKER</p>
          <h1>Serwery gier</h1>
          <p>Uruchamiaj gry w odizolowanych kontenerach z trwałym zapisem danych.</p>
        </div>

        <nav className="game-section-tabs" aria-label="Narzędzia serwera Minecraft">
          <button className={gameSection === "overview" ? "active" : ""} onClick={() => openGameSection("overview")}>Serwer</button>
          <button className={gameSection === "console" ? "active" : ""} onClick={() => openGameSection("console")}>Terminal</button>
          <button className={gameSection === "plugins" ? "active" : ""} onClick={() => openGameSection("plugins")}>Pluginy</button>
          <button className={gameSection === "files" ? "active" : ""} onClick={() => openGameSection("files")}>Pliki serwera</button>
        </nav>

        {gameSection === "overview" && <>
          <article className="panel game-server-card">
          <div className="game-server-heading">
            <div className="minecraft-tile" aria-hidden="true"><span /><i /></div>
            <div className="game-title">
              <span>{minecraft.game}</span>
              <h2>{minecraft.name}</h2>
              <p>{minecraft.containerName}</p>
            </div>
            <span className={`game-status ${minecraft.state}`}><i />{stateLabels[minecraft.state]}</span>
          </div>

          <div className="game-spec-grid">
            <div><span>Adres</span><strong>{minecraft.address}:{minecraft.port}</strong></div>
            <div><span>Silnik</span><strong>{minecraft.serverType}</strong></div>
            <div><span>Wersja</span><strong>{minecraft.version}</strong></div>
            <div><span>Pamięć</span><strong>{minecraft.memory}</strong></div>
          </div>

          {minecraft.state === "unavailable" && (
            <div className="game-notice warning">
              <strong>Docker nie jest dostępny</strong>
              <span>Zainstaluj Docker Desktop na Windowsie lub Docker Engine z Compose na Debianie.</span>
            </div>
          )}

          {!minecraft.eulaAccepted && (
            <div className="game-notice">
              <strong>Wymagana akceptacja EULA</strong>
              <span>Skopiuj `.env.example` jako `.env`, przeczytaj Minecraft EULA i ustaw `MINECRAFT_EULA=TRUE`.</span>
            </div>
          )}

          {minecraft.message && minecraft.state !== "unavailable" && (
            <div className="game-message">{minecraft.message}</div>
          )}

          <div className="game-footer">
            <div>
              <span>Konfiguracja</span>
              <code>game-servers/minecraft/compose.yaml</code>
            </div>
            {isRunning ? (
              <button className="game-action stop" disabled={gameAction !== null} onClick={() => void runGameServerAction("stop")}>
                {gameAction === "stop" ? <><span className="spinner" />Zatrzymywanie…</> : "Zatrzymaj serwer"}
              </button>
            ) : (
              <button className="game-action" disabled={!canStart || gameAction !== null} onClick={() => void runGameServerAction("start")}>
                {gameAction === "start" ? <><span className="spinner" />Uruchamianie…</> : "Uruchom serwer"}
              </button>
            )}
          </div>
          </article>

          <section className="game-help-grid">
            <article className="panel"><span>01</span><h3>Trwały świat</h3><p>Mapa i konfiguracja pozostają w katalogu `data` także po usunięciu kontenera.</p></article>
            <article className="panel"><span>02</span><h3>Bezpieczne zatrzymanie</h3><p>Docker otrzymuje dwie minuty na zapis świata przed zamknięciem procesu.</p></article>
            <article className="panel"><span>03</span><h3>Port gry</h3><p>Gracze łączą się domyślnie przez port TCP 25565. RCON nie jest publikowany.</p></article>
          </section>
        </>}

        {gameSection === "console" && renderConsole(minecraft)}
        {gameSection === "plugins" && renderPlugins()}
        {gameSection === "files" && renderServerFiles()}
      </div>
    );
  };

  const renderPlannedPage = (page: "activity" | "settings") => (
    <div className="planned-card panel">
      <span className="planned-icon"><Icon name={page === "activity" ? "activity" : "settings"} size={28} /></span>
      <p className="eyebrow">KOLEJNY ETAP</p>
      <h1>{page === "activity" ? "Historia operacji" : "Ustawienia serwera"}</h1>
      <p>
        {page === "activity"
          ? "Ten widok zostanie podłączony po dodaniu logowania administratora i bazy SQLite."
          : "Konfiguracja udziałów, użytkowników i usług pojawi się po przygotowaniu bezpiecznego agenta dla Debiana."}
      </p>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={onGoHome}><span>K</span><span><strong>KarpikNAS</strong><small>Home server</small></span></button>
        <nav className="main-nav" aria-label="Główna nawigacja">
          <span className="nav-caption">MENU</span>
          {navItems.map((item) => (
            <button className={activePage === item.id ? "active" : ""} key={item.id} onClick={() => setActivePage(item.id)}>
              <Icon name={item.icon} size={19} />{item.label}
              {item.id === "activity" && <span className="soon-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="server-mini">
            <span className="server-symbol"><Icon name="database" size={18} /></span>
            <div><strong>{system?.hostname ?? "KarpikNAS"}</strong><small><i /> Online</small></div>
          </div>
          <span className="version">Wersja 0.1.0 · Windows dev</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span>K</span><strong>KarpikNAS</strong></div>
          <strong className="current-page">{pageTitles[activePage]}</strong>
          <div className="topbar-actions">
            {error && system && <span className="inline-error">{error}</span>}
            <button className="icon-button" aria-label="Odśwież dane" onClick={refreshCurrentView}><Icon name="refresh" size={18} /></button>
            <div className="avatar" title={`Zalogowano jako ${username}`}>{username.slice(0, 2).toUpperCase()}</div>
            <button className="icon-button" aria-label="Wyloguj" onClick={() => void onLogout()}><Icon name="log-out" size={18} /></button>
          </div>
        </header>
        <div className="content">
          {activePage === "overview" && renderOverview()}
          {activePage === "files" && renderFiles()}
          {activePage === "storage" && renderStorage()}
          {activePage === "games" && renderGames()}
          {activePage === "activity" && renderPlannedPage("activity")}
          {activePage === "settings" && renderPlannedPage("settings")}
        </div>
      </main>
    </div>
  );
}

export default Panel;
