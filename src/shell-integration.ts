import { Platform } from "obsidian";

/**
 * Shell integration for OSC 133 command detection.
 * Init scripts are embedded as string constants and written to the plugin
 * directory on first use, so no extra files need to ship in the release.
 */

const BASH_SCRIPT = `
# Lean Terminal — shell integration for bash
if [ -n "$__LOT_SHELL_INTEGRATION" ]; then return 0 2>/dev/null || exit 0; fi
__LOT_SHELL_INTEGRATION=1
__lot_prompt_command() {
  local ec="$?"
  printf '\\e]133;D;%s\\e\\\\' "$ec"
  printf '\\e]133;A\\e\\\\'
}
if [ -n "$PROMPT_COMMAND" ]; then
  PROMPT_COMMAND="__lot_prompt_command;\${PROMPT_COMMAND}"
else
  PROMPT_COMMAND="__lot_prompt_command"
fi
PS0='$(__lot_preexec)'
__lot_preexec() { printf '\\e]133;B\\e\\\\'; }
printf '\\e]133;A\\e\\\\'
`.trim();

const ZSH_SCRIPT = `
# Lean Terminal — shell integration for zsh
if [[ -n "$__LOT_SHELL_INTEGRATION" ]]; then return 0; fi
__LOT_SHELL_INTEGRATION=1
if [[ -n "$__LOT_USER_ZDOTDIR" ]]; then
  ZDOTDIR="$__LOT_USER_ZDOTDIR"
  [[ -f "$ZDOTDIR/.zshrc" ]] && source "$ZDOTDIR/.zshrc"
elif [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi
__lot_precmd() {
  local ec="$?"
  printf '\\e]133;D;%s\\e\\\\' "$ec"
  printf '\\e]133;A\\e\\\\'
}
__lot_preexec() { printf '\\e]133;B\\e\\\\'; }
autoload -Uz add-zsh-hook
add-zsh-hook precmd __lot_precmd
add-zsh-hook preexec __lot_preexec
printf '\\e]133;A\\e\\\\'
`.trim();

const PWSH_SCRIPT = `
# Lean Terminal — shell integration for PowerShell
if ($env:__LOT_SHELL_INTEGRATION) { return }
$env:__LOT_SHELL_INTEGRATION = "1"
$__lot_original_prompt = $function:prompt
function prompt {
    $ec = $global:LASTEXITCODE
    [Console]::Out.Write("\`e]133;D;$ec\`e\\")
    [Console]::Out.Write("\`e]133;A\`e\\")
    $result = & $__lot_original_prompt
    [Console]::Out.Write("\`e]133;B\`e\\")
    return $result
}
[Console]::Out.Write("\`e]133;A\`e\\")
`.trim();

function joinPath(...parts: string[]): string {
  const path = window.require("path") as typeof import("path");
  return path.join(...parts);
}

/** Write a script to disk if it doesn't exist or has changed. */
function ensureScript(dir: string, filename: string, content: string): string {
  const fs = window.require("fs") as typeof import("fs");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = joinPath(dir, filename);
  try {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing === content) return filePath;
  } catch {
    // file doesn't exist yet
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

interface ShellIntegrationResult {
  env: Record<string, string>;
  args: string[];
}

export interface OmpContext {
  /** Absolute path to the oh-my-posh binary. */
  binaryPath: string;
  /** Absolute path to a `.omp.json` theme file. */
  themePath: string;
}

/** Quote a path for POSIX shells using single quotes, escaping any embedded `'`. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Quote a path for PowerShell using single quotes, escaping any embedded `'`. */
function pwshQuote(s: string): string {
  return `'${s.replace(/'/g, `''`)}'`;
}

/** Build the OMP init line appended to a shell's init script. */
function ompInitLine(shell: "bash" | "zsh" | "pwsh", omp: OmpContext): string {
  if (shell === "pwsh") {
    return `& ${pwshQuote(omp.binaryPath)} init pwsh --config ${pwshQuote(omp.themePath)} | Invoke-Expression`;
  }
  const which = shell === "zsh" ? "zsh" : "bash";
  return `eval "$(${shQuote(omp.binaryPath)} init ${which} --config ${shQuote(omp.themePath)})"`;
}

/**
 * Returns extra env vars and args to inject shell integration hooks.
 * Scripts are materialized to pluginDir/shell-integration/ on demand.
 *
 * When `omp` is provided, the OMP `init` eval is appended to the end of the
 * per-shell init script so the prompt is rendered by oh-my-posh. The OSC 133
 * hooks still run first.
 */
export function getShellIntegration(
  shellPath: string,
  pluginDir: string,
  omp?: OmpContext
): ShellIntegrationResult {
  const lower = shellPath.toLowerCase();
  const scriptDir = joinPath(pluginDir, "shell-integration");

  if (Platform.isWin) {
    if (lower.includes("pwsh") || lower.includes("powershell")) {
      const content = omp ? `${PWSH_SCRIPT}\n${ompInitLine("pwsh", omp)}\n` : PWSH_SCRIPT;
      const filename = omp ? "pwsh-init-omp.ps1" : "pwsh-init.ps1";
      const initPath = ensureScript(scriptDir, filename, content);
      return {
        env: {},
        args: ["-NoLogo", "-NoExit", "-File", initPath],
      };
    }
    // cmd.exe — no hook support
    return { env: {}, args: [] };
  }

  // macOS / Linux
  if (lower.includes("zsh") || lower.endsWith("/zsh")) {
    const content = omp ? `${ZSH_SCRIPT}\n${ompInitLine("zsh", omp)}\n` : ZSH_SCRIPT;
    const filename = omp ? "zsh-init-omp.zsh" : "zsh-init.zsh";
    const initFile = ensureScript(scriptDir, filename, content);
    const userZdotdir = process.env.ZDOTDIR || process.env.HOME || "";
    // zsh reads startup files from ZDOTDIR; point it to our directory and
    // provide forwarding scripts for all three per-user config files so that
    // the user's real environment (PATH, aliases, etc.) is fully loaded.
    ensureScript(scriptDir, ".zshenv",   `[[ -f "${userZdotdir}/.zshenv"   ]] && source "${userZdotdir}/.zshenv"\n`);
    ensureScript(scriptDir, ".zprofile", `[[ -f "${userZdotdir}/.zprofile" ]] && source "${userZdotdir}/.zprofile"\n`);
    ensureScript(scriptDir, ".zshrc",    `source "${initFile}"\n`);
    return {
      env: {
        __LOT_USER_ZDOTDIR: userZdotdir,
        ZDOTDIR: scriptDir,
      },
      args: [],
    };
  }

  if (lower.includes("bash") || lower.endsWith("/bash") || lower.endsWith("/sh")) {
    const content = omp ? `${BASH_SCRIPT}\n${ompInitLine("bash", omp)}\n` : BASH_SCRIPT;
    const filename = omp ? "bash-init-omp.sh" : "bash-init.sh";
    const initPath = ensureScript(scriptDir, filename, content);
    return {
      env: { BASH_ENV: initPath },
      args: [],
    };
  }

  return { env: {}, args: [] };
}
