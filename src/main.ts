import { FileSystemAdapter, Notice, Plugin, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_TERMINAL } from "./constants";
import { TerminalView } from "./terminal-view";
import { TerminalSettingTab, DEFAULT_SETTINGS, type TerminalPluginSettings } from "./settings";
import { BinaryManager } from "./binary-manager";
import { ThemeRegistry } from "./theme-registry";
import { OhMyPoshManager } from "./oh-my-posh-manager";

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;
  binaryManager!: BinaryManager;
  themeRegistry!: ThemeRegistry;
  ompManager!: OhMyPoshManager;
  private ribbonEl: HTMLElement | null = null;
  private themeObserver: MutationObserver | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Initialize binary manager
    const path = window.require("path") as typeof import("path");
    const adapter = this.app.vault.adapter as FileSystemAdapter;
    const pluginDir = path.join(
      adapter.getBasePath(),
      this.app.vault.configDir, "plugins", this.manifest.id
    );
    this.binaryManager = new BinaryManager(pluginDir);
    this.binaryManager.checkInstalled();

    // Theme registry — loads optional themes.json from the plugin folder
    this.themeRegistry = new ThemeRegistry(pluginDir);
    await this.themeRegistry.load();

    // Oh My Posh manager — manages the prompt-theming binary + themes catalog
    this.ompManager = new OhMyPoshManager(pluginDir);
    const detected = this.ompManager.checkInstalled();
    this.maybeOfferOmpEnable(detected.source);

    // Register the terminal view
    this.registerView(VIEW_TYPE_TERMINAL, (leaf: WorkspaceLeaf) => {
      return new TerminalView(leaf, this);
    });

    // Ribbon icon
    this.ribbonEl = this.addRibbonIcon(this.settings.ribbonIcon, "Toggle terminal", () => {
      this.toggleTerminal();
    });

    // Commands
    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => void this.activateTerminal(),
    });

    this.addCommand({
      id: "close-terminal",
      name: "Close terminal",
      callback: () => this.closeTerminal(),
    });

    this.addCommand({
      id: "new-terminal-tab",
      name: "New terminal tab",
      callback: () => this.newTab(),
    });

    this.addCommand({
      id: "toggle-terminal",
      name: "Toggle terminal",
      callback: () => this.toggleTerminal(),
    });

    this.addCommand({
      id: "open-terminal-split",
      name: "Open terminal in new pane",
      callback: () => void this.openTerminalInNewPane(),
    });

    // Settings tab
    this.addSettingTab(new TerminalSettingTab(this.app, this));

    // Watch for Obsidian theme changes (dark/light toggle)
    this.themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "class") {
          // Only re-theme when user chose "system" (auto-follow Obsidian)
          if (this.settings.theme === "system") {
            this.updateTerminalThemes();
          }
        }
      }
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  onunload(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;

    // Detach after a tick to avoid disrupting the settings modal
    setTimeout(() => {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
    }, 0);
  }

  async activateTerminal(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf =
      this.settings.defaultLocation === "right"
        ? this.app.workspace.getRightLeaf(false)
        : this.app.workspace.getLeaf("split", "horizontal");

    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  closeTerminal(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
  }

  toggleTerminal(): void {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      this.closeTerminal();
    } else {
      void this.activateTerminal();
    }
  }

  private newTab(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (leaves.length > 0) {
      const view = leaves[0].view as TerminalView;
      view.createNewTab();
    } else {
      // Open terminal first, then it auto-creates a tab
      void this.activateTerminal();
    }
  }

  async openTerminalInNewPane(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("split", "horizontal");
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
      void this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  updateTerminalBackgrounds(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateBackgroundColor();
    }
  }

  updateIcon(name: string): void {
    const safeName = name || "terminal";
    if (this.ribbonEl) setIcon(this.ribbonEl, safeName);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL)) {
      // tabHeaderInnerIconEl is undocumented but stable across Obsidian versions
      const iconEl = (leaf as WorkspaceLeaf & { tabHeaderInnerIconEl?: HTMLElement }).tabHeaderInnerIconEl;
      if (iconEl) setIcon(iconEl, safeName);
    }
  }

  /** Re-apply the full theme to all terminal views (e.g. after Obsidian dark/light switch). */
  updateTerminalThemes(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateTheme();
    }
  }

  updateCopyOnSelect(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    for (const leaf of leaves) {
      const view = leaf.view as TerminalView;
      view.updateCopyOnSelect();
    }
  }

  /**
   * Open the terminal panel (creating one if needed) and add a new tab whose
   * shell is initialized with the given OMP theme regardless of saved settings.
   */
  async openTerminalWithOmpPreview(themeName: string): Promise<void> {
    await this.activateTerminal();
    // activateTerminal returns once the leaf is set up but the view may still
    // be initializing — defer to next tick so getTabManager() is non-null.
    setTimeout(() => {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
      if (leaves.length === 0) return;
      const view = leaves[0].view as TerminalView;
      view.createNewTab({ ompPreviewTheme: themeName });
    }, 100);
  }

  /**
   * One-time auto-detect prompt: if oh-my-posh is on the system PATH and the
   * user has not been asked yet, offer to enable it. Their choice is persisted
   * so this never re-prompts.
   */
  private maybeOfferOmpEnable(source: "sandboxed" | "system" | null): void {
    if (source !== "system") return;
    if (this.settings.ohMyPoshEnabled) return;
    if (this.settings.ohMyPoshAutoDetectChoice !== "pending") return;

    const frag = document.createDocumentFragment();
    const wrap = frag.createDiv();
    wrap.createDiv({ text: "Oh My Posh detected on your system." });
    wrap.createDiv({ text: "Enable it for new terminal tabs in this plugin?" });

    const buttons = wrap.createDiv();
    buttons.style.marginTop = "8px";
    buttons.style.display = "flex";
    buttons.style.gap = "8px";

    const enableBtn = buttons.createEl("button", { text: "Enable" });
    const dismissBtn = buttons.createEl("button", { text: "Not now" });

    const notice = new Notice(frag, 0); // 0 = sticky until user clicks

    enableBtn.addEventListener("click", () => {
      void (async () => {
        this.settings.ohMyPoshEnabled = true;
        this.settings.ohMyPoshAutoDetectChoice = "accepted";
        await this.saveSettings();
        notice.hide();
        new Notice("Oh My Posh enabled for new terminal tabs.");
      })();
    });

    dismissBtn.addEventListener("click", () => {
      void (async () => {
        this.settings.ohMyPoshAutoDetectChoice = "dismissed";
        await this.saveSettings();
        notice.hide();
      })();
    });
  }
}
