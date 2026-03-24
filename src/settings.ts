import { App, PluginSettingTab, Setting } from "obsidian";
import type TerminalPlugin from "./main";
import { THEME_NAMES } from "./themes";

export interface TerminalPluginSettings {
  shellPath: string;
  fontSize: number;
  fontFamily: string;
  theme: string;
  cursorBlink: boolean;
  scrollback: number;
  defaultLocation: "right" | "bottom";
}

export const DEFAULT_SETTINGS: TerminalPluginSettings = {
  shellPath: "",
  fontSize: 14,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  theme: "obsidian-dark",
  cursorBlink: true,
  scrollback: 5000,
  defaultLocation: "bottom",
};

export class TerminalSettingTab extends PluginSettingTab {
  plugin: TerminalPlugin;

  constructor(app: App, plugin: TerminalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Shell path")
      .setDesc("Leave empty for auto-detect (PowerShell on Windows, $SHELL on macOS/Linux)")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.shellPath)
          .onChange(async (value) => {
            this.plugin.settings.shellPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Font size")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.fontSize))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.fontSize = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Font family")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.fontFamily)
          .onChange(async (value) => {
            this.plugin.settings.fontFamily = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Theme")
      .addDropdown((dropdown) => {
        for (const name of THEME_NAMES) {
          dropdown.addOption(name, name);
        }
        dropdown.setValue(this.plugin.settings.theme);
        dropdown.onChange(async (value) => {
          this.plugin.settings.theme = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Cursor blink")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.cursorBlink).onChange(async (value) => {
          this.plugin.settings.cursorBlink = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Scrollback lines")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.scrollback))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.scrollback = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Default location")
      .setDesc("Where to open new terminal panels")
      .addDropdown((dropdown) => {
        dropdown.addOption("bottom", "Bottom");
        dropdown.addOption("right", "Right");
        dropdown.setValue(this.plugin.settings.defaultLocation);
        dropdown.onChange(async (value: string) => {
          this.plugin.settings.defaultLocation = value as "right" | "bottom";
          await this.plugin.saveSettings();
        });
      });
  }
}
