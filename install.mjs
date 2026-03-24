/**
 * Installs the plugin into an Obsidian vault's .obsidian/plugins directory.
 *
 * Usage: node install.mjs [vault-path]
 * Default vault: D:\Lean Notes
 */

import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const vaultPath = process.argv[2] || "D:\\Lean Notes";
const pluginDir = join(vaultPath, ".obsidian", "plugins", "lean-obsidian-terminal");

if (!existsSync(join(vaultPath, ".obsidian"))) {
  console.error(`Error: ${vaultPath} does not appear to be an Obsidian vault (no .obsidian folder)`);
  process.exit(1);
}

const srcDir = resolve(import.meta.dirname);

// Create plugin directory
mkdirSync(pluginDir, { recursive: true });

// Copy essential files
const files = ["main.js", "manifest.json", "styles.css"];
for (const file of files) {
  const src = join(srcDir, file);
  if (!existsSync(src)) {
    console.error(`Error: ${file} not found. Run 'npm run build' first.`);
    process.exit(1);
  }
  cpSync(src, join(pluginDir, file));
  console.log(`  Copied ${file}`);
}

// Copy node-pty (native module needed at runtime)
const nodePtySrc = join(srcDir, "node_modules", "node-pty");
const nodePtyDest = join(pluginDir, "node_modules", "node-pty");

if (existsSync(nodePtySrc)) {
  // Copy only the essential parts (lib + prebuilds + package.json)
  mkdirSync(join(nodePtyDest, "lib"), { recursive: true });
  cpSync(join(nodePtySrc, "lib"), join(nodePtyDest, "lib"), { recursive: true });
  cpSync(join(nodePtySrc, "prebuilds"), join(nodePtyDest, "prebuilds"), { recursive: true });
  cpSync(join(nodePtySrc, "package.json"), join(nodePtyDest, "package.json"));

  // Copy third_party (conpty DLLs needed on Windows)
  const thirdParty = join(nodePtySrc, "third_party");
  if (existsSync(thirdParty)) {
    cpSync(thirdParty, join(nodePtyDest, "third_party"), { recursive: true });
  }

  // Apply patch: replace Worker-based ConoutConnection with inline version
  const patchSrc = join(srcDir, "patches", "windowsConoutConnection.js");
  if (existsSync(patchSrc)) {
    cpSync(patchSrc, join(nodePtyDest, "lib", "windowsConoutConnection.js"));
    console.log("  Applied ConoutConnection patch (no Worker threads)");
  }

  console.log("  Copied node-pty (prebuilt N-API binaries)");
} else {
  console.error("Error: node_modules/node-pty not found. Run 'npm install' first.");
  process.exit(1);
}

console.log(`\nPlugin installed to: ${pluginDir}`);
console.log("Restart Obsidian and enable the 'Terminal' plugin in Settings > Community Plugins.");
