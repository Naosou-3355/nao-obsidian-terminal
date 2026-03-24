import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_TERMINAL, ICON_TERMINAL } from "./constants";
import { TerminalView } from "./terminal-view";
import { TerminalSettingTab } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import type { TerminalPluginSettings } from "./settings";

export default class TerminalPlugin extends Plugin {
  settings: TerminalPluginSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register the terminal view
    this.registerView(VIEW_TYPE_TERMINAL, (leaf: WorkspaceLeaf) => {
      return new TerminalView(leaf, this);
    });

    // Ribbon icon
    this.addRibbonIcon(ICON_TERMINAL, "Toggle Terminal", () => {
      this.toggleTerminal();
    });

    // Commands
    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => this.activateTerminal(),
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
      callback: () => this.openTerminalInNewPane(),
    });

    // Settings tab
    this.addSettingTab(new TerminalSettingTab(this.app, this));
  }

  onunload(): void {
    // Detach after a tick to avoid disrupting the settings modal
    setTimeout(() => {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
    }, 0);
  }

  async activateTerminal(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf =
      this.settings.defaultLocation === "right"
        ? this.app.workspace.getRightLeaf(false)
        : this.app.workspace.getLeaf("split", "horizontal");

    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
      this.app.workspace.revealLeaf(leaf);
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
      this.activateTerminal();
    }
  }

  private newTab(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (leaves.length > 0) {
      const view = leaves[0].view as TerminalView;
      view.createNewTab();
    } else {
      // Open terminal first, then it auto-creates a tab
      this.activateTerminal();
    }
  }

  async openTerminalInNewPane(): Promise<void> {
    const leaf = this.app.workspace.getLeaf("split", "horizontal");
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_TERMINAL, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
