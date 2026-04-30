import { requestUrl } from "obsidian";

export type OmpStatus = "not-installed" | "checking" | "downloading" | "ready" | "error";
export type OmpSource = "sandboxed" | "system" | null;

interface OmpManifest {
  version: string;
  platform: string;
  arch: string;
  source: "sandboxed";
  installedAt: string;
}

const OMP_REPO = "JanDeDobbeleer/oh-my-posh";

export class OhMyPoshManager {
  private status: OmpStatus = "not-installed";
  private statusMessage = "";
  private source: OmpSource = null;
  private version: string | null = null;
  private resolvedBinary: string | null = null;
  private callbacks: Set<(status: OmpStatus) => void> = new Set();
  private availableThemesCache: string[] | null = null;

  private readonly fs: typeof import("fs");
  private readonly path: typeof import("path");
  private readonly os: typeof import("os");
  private readonly childProcess: typeof import("child_process");
  private readonly crypto: typeof import("crypto");

  private readonly ompDir: string;
  private readonly binDir: string;
  private readonly themesDir: string;
  private readonly manifestPath: string;
  private readonly sandboxedBinary: string;

  constructor(pluginDir: string) {
    this.fs = window.require("fs") as typeof import("fs");
    this.path = window.require("path") as typeof import("path");
    this.os = window.require("os") as typeof import("os");
    this.childProcess = window.require("child_process") as typeof import("child_process");
    this.crypto = window.require("crypto") as typeof import("crypto");

    this.ompDir = this.path.join(pluginDir, "oh-my-posh");
    this.binDir = this.path.join(this.ompDir, "bin");
    this.themesDir = this.path.join(this.ompDir, "themes");
    this.manifestPath = this.path.join(this.ompDir, ".manifest.json");
    this.sandboxedBinary = this.path.join(
      this.binDir,
      process.platform === "win32" ? "oh-my-posh.exe" : "oh-my-posh"
    );
  }

  /**
   * Detect the binary in this order: sandboxed install → system PATH.
   * Sets internal state and returns the resolved source/version.
   */
  checkInstalled(): { source: OmpSource; version: string | null } {
    this.setStatus("checking");

    if (this.fs.existsSync(this.sandboxedBinary)) {
      const ver = this.queryVersion(this.sandboxedBinary);
      if (ver) {
        this.source = "sandboxed";
        this.version = ver;
        this.resolvedBinary = this.sandboxedBinary;
        this.setStatus("ready");
        return { source: this.source, version: this.version };
      }
    }

    const sysBinary = this.findOnPath();
    if (sysBinary) {
      const ver = this.queryVersion(sysBinary);
      if (ver) {
        this.source = "system";
        this.version = ver;
        this.resolvedBinary = sysBinary;
        this.setStatus("ready");
        return { source: this.source, version: this.version };
      }
    }

    this.source = null;
    this.version = null;
    this.resolvedBinary = null;
    this.setStatus("not-installed");
    return { source: null, version: null };
  }

  async install(version?: string): Promise<void> {
    this.setStatus("downloading", "Fetching release info...");
    try {
      if (!version) {
        const releaseUrl = `https://api.github.com/repos/${OMP_REPO}/releases/latest`;
        const releaseResp = await requestUrl({ url: releaseUrl });
        version = (releaseResp.json.tag_name as string).replace(/^v/, "");
      }

      const assetName = this.assetNameForPlatform();
      if (!assetName) {
        throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
      }

      const tag = `v${version}`;
      const baseUrl = `https://github.com/${OMP_REPO}/releases/download/${tag}`;

      // Optional checksum verification
      this.setStatus("downloading", "Downloading checksums...");
      let checksums: Record<string, string> = {};
      try {
        const checksumResp = await requestUrl({ url: `${baseUrl}/checksums.txt` });
        checksums = parseChecksumsTxt(checksumResp.text);
      } catch {
        console.warn("Oh My Posh: checksums.txt not found, skipping verification");
      }

      // Download binary
      this.setStatus("downloading", `Downloading ${assetName}...`);
      const binaryResp = await requestUrl({
        url: `${baseUrl}/${assetName}`,
        contentType: "application/octet-stream",
      });
      const binaryBuffer = Buffer.from(binaryResp.arrayBuffer);
      this.verifyChecksum(checksums, assetName, binaryBuffer);

      // Write binary (themes are now downloaded on demand, not bundled)
      this.setStatus("downloading", "Installing...");
      this.fs.mkdirSync(this.binDir, { recursive: true });
      this.fs.writeFileSync(this.sandboxedBinary, binaryBuffer);
      if (process.platform !== "win32") {
        this.fs.chmodSync(this.sandboxedBinary, 0o755);
      }

      // Ensure themes directory exists for later on-demand downloads
      this.fs.mkdirSync(this.themesDir, { recursive: true });

      // Write manifest
      const manifest: OmpManifest = {
        version: version,
        platform: process.platform,
        arch: process.arch,
        source: "sandboxed",
        installedAt: new Date().toISOString(),
      };
      this.fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      // Refresh state
      this.checkInstalled();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Oh My Posh: install failed", err);
      this.setStatus("error", message);
      throw err;
    }
  }

  remove(): void {
    try {
      if (this.fs.existsSync(this.ompDir)) {
        this.fs.rmSync(this.ompDir, { recursive: true, force: true });
      }
      this.source = null;
      this.version = null;
      this.resolvedBinary = null;
      // Re-check in case a system install is still available
      this.checkInstalled();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus("error", message);
      throw err;
    }
  }

  /** Resolved binary path (sandboxed preferred, then system). Null when none. */
  getBinaryPath(): string | null {
    return this.resolvedBinary;
  }

  getThemesDir(): string {
    return this.themesDir;
  }

  /**
   * Return the absolute path of the .omp.json file for `name`.
   * `name` is the basename without the `.omp.json` suffix.
   */
  getThemePath(name: string): string {
    return this.path.join(this.themesDir, `${name}.omp.json`);
  }

  /** Sorted list of locally-downloaded theme names (basename without `.omp.json`). */
  listThemes(): string[] {
    try {
      if (!this.fs.existsSync(this.themesDir)) return [];
      const entries = this.fs.readdirSync(this.themesDir);
      return entries
        .filter((f) => f.endsWith(".omp.json"))
        .map((f) => f.slice(0, -".omp.json".length))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /** Whether the named theme is present on disk locally. */
  isThemeDownloaded(name: string): boolean {
    try {
      return this.fs.existsSync(this.getThemePath(name));
    } catch {
      return false;
    }
  }

  /**
   * Fetch the list of theme names available online from
   * github.com/JanDeDobbeleer/oh-my-posh/tree/main/themes.
   * Cached in-memory after the first successful call.
   */
  async fetchAvailableThemes(forceRefresh = false): Promise<string[]> {
    if (!forceRefresh && this.availableThemesCache) return this.availableThemesCache;

    const apiUrl = `https://api.github.com/repos/${OMP_REPO}/contents/themes?ref=main`;
    const resp = await requestUrl({ url: apiUrl });
    const entries = resp.json as Array<{ name: string; type: string }>;
    const names = entries
      .filter((e) => e.type === "file" && e.name.endsWith(".omp.json"))
      .map((e) => e.name.slice(0, -".omp.json".length))
      .sort((a, b) => a.localeCompare(b));

    this.availableThemesCache = names;
    return names;
  }

  /** Last-fetched online theme list, or null if not fetched yet. */
  getCachedAvailableThemes(): string[] | null {
    return this.availableThemesCache;
  }

  /**
   * Download a single `.omp.json` from the upstream repo into the local
   * themes directory. Idempotent — overwrites if it already exists.
   */
  async downloadTheme(name: string): Promise<void> {
    const url = `https://raw.githubusercontent.com/${OMP_REPO}/main/themes/${name}.omp.json`;
    const resp = await requestUrl({ url });
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Failed to download theme '${name}': HTTP ${resp.status}`);
    }
    this.fs.mkdirSync(this.themesDir, { recursive: true });
    this.fs.writeFileSync(this.getThemePath(name), resp.text, "utf-8");
  }

  /** Delete a single locally-downloaded theme. */
  removeTheme(name: string): void {
    try {
      const p = this.getThemePath(name);
      if (this.fs.existsSync(p)) this.fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }

  isReady(): boolean {
    return this.status === "ready";
  }

  getStatus(): OmpStatus {
    return this.status;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  getSource(): OmpSource {
    return this.source;
  }

  getVersion(): string | null {
    return this.version;
  }

  getPlatformInfo(): { platform: string; arch: string } {
    return { platform: process.platform, arch: process.arch };
  }

  onStatusChange(cb: (status: OmpStatus) => void): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private setStatus(status: OmpStatus, message = ""): void {
    this.status = status;
    this.statusMessage = message;
    for (const cb of this.callbacks) cb(status);
  }

  private assetNameForPlatform(): string | null {
    const p = process.platform;
    const a = process.arch;
    if (p === "darwin" && a === "arm64") return "posh-darwin-arm64";
    if (p === "darwin" && a === "x64")   return "posh-darwin-amd64";
    if (p === "linux"  && a === "arm64") return "posh-linux-arm64";
    if (p === "linux"  && a === "x64")   return "posh-linux-amd64";
    if (p === "win32"  && a === "arm64") return "posh-windows-arm64.exe";
    if (p === "win32"  && a === "x64")   return "posh-windows-amd64.exe";
    return null;
  }

  private verifyChecksum(map: Record<string, string>, name: string, data: Buffer): void {
    const expected = map[name];
    if (!expected) return;
    const actual = this.crypto.createHash("sha256").update(data).digest("hex");
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
    }
  }

  /** Run `<bin> --version` and return the trimmed version string, or null on error. */
  private queryVersion(binary: string): string | null {
    try {
      const out = this.childProcess.execFileSync(binary, ["--version"], {
        timeout: 3000,
        encoding: "utf-8",
      });
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /** Locate `oh-my-posh` on PATH using `command -v` / `where`. Returns absolute path or null. */
  private findOnPath(): string | null {
    try {
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? `where oh-my-posh`
        : `command -v oh-my-posh`;
      const out = this.childProcess.execSync(cmd, {
        timeout: 2000,
        encoding: "utf-8",
        // Use a login shell on POSIX so PATH includes brew, asdf, etc.
        shell: isWin ? undefined : "/bin/sh",
      });
      const first = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
      return first || null;
    } catch {
      return null;
    }
  }
}

/**
 * Parse the `checksums.txt` format used by Oh My Posh releases:
 *   <sha256_hex>  <filename>
 * Lines are separated by `\n`. Filenames may be prefixed with `*` (binary mode).
 */
function parseChecksumsTxt(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^([0-9a-fA-F]+)\s+\*?(.+)$/.exec(trimmed);
    if (m) {
      out[m[2].trim()] = m[1].toLowerCase();
    }
  }
  return out;
}
