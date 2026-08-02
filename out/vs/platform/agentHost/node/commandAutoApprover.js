import * as fs from "fs";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { getAppNodeModulesPath } from "./appNodeModules.js";
const SAFE_POSIX_REDIRECT_TARGETS = /* @__PURE__ */ new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty"
]);
function isSafeRedirectDestination(dest, isPowerShell) {
  let cleaned = dest.trim();
  if (cleaned.length === 0) {
    return false;
  }
  if (isPowerShell && cleaned.toLowerCase() === "$null") {
    return true;
  }
  if (cleaned.startsWith(`'`) && cleaned.endsWith(`'`) || cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (/^&[0-9]+-?$/.test(cleaned)) {
    return true;
  }
  return !isPowerShell && SAFE_POSIX_REDIRECT_TARGETS.has(cleaned);
}
function classifyFileRedirect(redirectText, isPowerShell) {
  if (!redirectText.includes(">")) {
    return { kind: "read" };
  }
  const destMatch = redirectText.match(/(?:[0-9]+|&|\*)?>>?\|?\s*(.+)$/);
  if (!destMatch) {
    return { kind: "unsafeWrite", dest: void 0 };
  }
  const rawDest = destMatch[1].trim();
  if (isSafeRedirectDestination(rawDest, isPowerShell)) {
    return { kind: "safeWrite" };
  }
  let dest = rawDest;
  if (dest.startsWith(`'`) && dest.endsWith(`'`) || dest.startsWith('"') && dest.endsWith('"')) {
    dest = dest.slice(1, -1);
  }
  return { kind: "unsafeWrite", dest };
}
const pwshFlagEqualsRegex = /(^|\s)(-{1,2}[\w-]+)=/g;
function maskPwshFlagEquals(commandLine) {
  return commandLine.replace(pwshFlagEqualsRegex, (_, pre, flag) => `${pre}${flag} `);
}
const pwshNoSpaceRedirectRegex = /^[0-9*]?>>?/;
const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;
class CommandAutoApprover extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._initPromise = this._initTreeSitter();
  }
  /**
   * Returns a promise that resolves once tree-sitter WASM has been loaded.
   * Await this before processing any events to guarantee that
   * {@link shouldAutoApprove} can parse commands synchronously.
   */
  initialize() {
    return this._initPromise;
  }
  /**
   * Synchronously check whether the given command line should be auto-approved.
   * Uses tree-sitter (if loaded) to parse compound commands into sub-commands.
   *
   * When the command contains write redirections, `options.isWriteDestApproved`
   * is consulted for each destination. If every destination is approved by the
   * predicate, write redirections do not block auto-approval.
   */
  shouldAutoApprove(commandLine, options) {
    return this.evaluate(commandLine, options).result;
  }
  /** Evaluates the command and reports whether adding a persistent allow rule could resolve the result. */
  evaluate(commandLine, options) {
    const trimmed = commandLine.trimStart();
    if (trimmed.length === 0) {
      return { result: "approved", autoApproveRuleResolvable: false };
    }
    const rules = this._compileRules(options?.autoApproveRules);
    const isPowerShell = options?.language === "powershell";
    if (this._matchesCommandLineRule(trimmed, rules.denyCommandLineRules)) {
      return { result: "denied", autoApproveRuleResolvable: false };
    }
    const parsed = this._extractSubCommands(trimmed, isPowerShell);
    if (!parsed) {
      this._logService.trace("[CommandAutoApprover] Command line could not be analyzed, requiring confirmation");
      return { result: "noMatch", autoApproveRuleResolvable: false };
    }
    const hasUnapprovedRedirect = () => parsed.unsafeWriteDests.some((dest) => dest === void 0 || !options?.isWriteDestApproved?.(dest));
    let result = this._matchSubCommands(parsed.subCommands, rules, isPowerShell);
    if (result !== "denied" && this._matchesCommandLineRule(trimmed, rules.allowCommandLineRules)) {
      result = "approved";
    }
    if (result === "approved" && hasUnapprovedRedirect()) {
      this._logService.trace("[CommandAutoApprover] Write redirection to non-approved destination, requiring confirmation");
      return { result: "noMatch", autoApproveRuleResolvable: false };
    }
    return { result, autoApproveRuleResolvable: result === "noMatch" && !hasUnapprovedRedirect() };
  }
  _matchSubCommands(subCommands, rules, isPowerShell) {
    let allApproved = true;
    for (const subCommand of subCommands) {
      if (transientEnvVarRegex.test(subCommand)) {
        return "denied";
      }
      const result = this._matchSingleCommand(subCommand, rules, isPowerShell);
      if (result === "denied") {
        return "denied";
      }
      if (result !== "approved") {
        allApproved = false;
      }
    }
    return allApproved ? "approved" : "noMatch";
  }
  _matchSingleCommand(command, rules, isPowerShell) {
    if (this._matchesRule(command, rules.denyRules, isPowerShell)) {
      return "denied";
    }
    if (this._matchesRule(command, rules.allowRules, isPowerShell)) {
      return "approved";
    }
    return "noMatch";
  }
  _matchesCommandLineRule(commandLine, rules) {
    return rules.some((rule) => rule.regex.test(commandLine));
  }
  _matchesRule(command, rules, isPowerShell) {
    for (const rule of rules) {
      if ((isPowerShell ? rule.regexCaseInsensitive : rule.regex).test(command)) {
        return true;
      }
      if (isPowerShell && command.startsWith("(") && rule.regexCaseInsensitive.test(command.slice(1))) {
        return true;
      }
    }
    return false;
  }
  // ---- Tree-sitter --------------------------------------------------------
  _extractSubCommands(commandLine, isPowerShell) {
    const language = isPowerShell ? this._powershellLanguage : this._bashLanguage;
    if (!this._parser || !language || !this._queryClass) {
      return void 0;
    }
    try {
      this._parser.setLanguage(language);
      const masked = isPowerShell ? maskPwshFlagEquals(commandLine) : commandLine;
      const tree = this._parser.parse(masked);
      if (!tree) {
        return void 0;
      }
      try {
        if (isPowerShell && tree.rootNode.hasError) {
          this._logService.trace("[CommandAutoApprover] PowerShell parse contains errors, requiring confirmation");
          return void 0;
        }
        const query = new this._queryClass(language, isPowerShell ? "(command) @command (redirection) @redirection (generic_token) @generic_token (assignment_expression) @unanalyzable (invokation_expression) @unanalyzable" : "(command) @command (file_redirect) @file_redirect (heredoc_redirect) @heredoc_redirect (herestring_redirect) @herestring_redirect (variable_assignment) @unanalyzable (declaration_command) @unanalyzable");
        const captures = query.captures(tree.rootNode);
        const subCommands = [];
        const unsafeWriteDests = [];
        let unanalyzableType;
        for (const capture of captures) {
          const text = masked === commandLine ? capture.node.text : commandLine.substring(capture.node.startIndex, capture.node.endIndex);
          if (capture.name === "command") {
            subCommands.push(text);
          } else if (capture.name === "unanalyzable" && (capture.node.type !== "variable_assignment" || capture.node.parent?.type !== "command")) {
            unanalyzableType ??= capture.node.type;
          } else if (capture.name === "file_redirect" || capture.name === "redirection" || capture.name === "generic_token" && pwshNoSpaceRedirectRegex.test(text)) {
            const cls = classifyFileRedirect(text, isPowerShell);
            if (cls.kind === "unsafeWrite") {
              unsafeWriteDests.push(cls.dest);
            }
          } else if (capture.name === "heredoc_redirect" || capture.name === "herestring_redirect") {
          }
        }
        query.delete();
        if (unanalyzableType) {
          this._logService.trace(`[CommandAutoApprover] Command line contains an unanalyzable ${unanalyzableType}, requiring confirmation`);
          return void 0;
        }
        return subCommands.length > 0 || unsafeWriteDests.length > 0 ? { subCommands, unsafeWriteDests } : void 0;
      } finally {
        tree.delete();
      }
    } catch (err) {
      this._logService.warn("[CommandAutoApprover] Tree-sitter parsing failed", err);
      return void 0;
    }
  }
  async _initTreeSitter() {
    try {
      const { default: TreeSitter } = await import("@vscode/tree-sitter-wasm");
      if (this._store.isDisposed) {
        return;
      }
      const moduleRoot = URI.joinPath(FileAccess.asFileUri(getAppNodeModulesPath()), "@vscode", "tree-sitter-wasm", "wasm");
      const wasmPath = URI.joinPath(moduleRoot, "tree-sitter.wasm").fsPath;
      await TreeSitter.Parser.init({
        locateFile() {
          return wasmPath;
        }
      });
      if (this._store.isDisposed) {
        return;
      }
      const parser = new TreeSitter.Parser();
      this._register(toDisposable(() => {
        try {
          parser.delete();
        } catch {
        }
      }));
      const loadGrammar = async (fileName) => {
        const grammarWasm = await fs.promises.readFile(URI.joinPath(moduleRoot, fileName).fsPath);
        return TreeSitter.Language.load(new Uint8Array(grammarWasm.buffer, grammarWasm.byteOffset, grammarWasm.byteLength));
      };
      const [bashLanguage, powershellLanguage] = await Promise.allSettled([
        loadGrammar("tree-sitter-bash.wasm"),
        loadGrammar("tree-sitter-powershell.wasm")
      ]);
      if (this._store.isDisposed) {
        return;
      }
      this._parser = parser;
      this._queryClass = TreeSitter.Query;
      if (bashLanguage.status === "fulfilled") {
        this._bashLanguage = bashLanguage.value;
      } else {
        this._logService.warn("[CommandAutoApprover] Failed to load the bash grammar; bash commands will require confirmation", bashLanguage.reason);
      }
      if (powershellLanguage.status === "fulfilled") {
        this._powershellLanguage = powershellLanguage.value;
      } else {
        this._logService.warn("[CommandAutoApprover] Failed to load the PowerShell grammar; PowerShell commands will require confirmation", powershellLanguage.reason);
      }
      this._logService.info(`[CommandAutoApprover] Tree-sitter initialized (bash=${this._bashLanguage ? "available" : "unavailable"}, powershell=${this._powershellLanguage ? "available" : "unavailable"})`);
    } catch (err) {
      this._logService.warn("[CommandAutoApprover] Failed to initialize tree-sitter", err);
    }
  }
  // ---- Rules --------------------------------------------------------------
  _compileRules(ruleConfig) {
    if (!ruleConfig) {
      if (!this._fallbackRules) {
        this._fallbackRules = this._compileRuleEntries(DEFAULT_TERMINAL_AUTO_APPROVE_RULES);
      }
      return this._fallbackRules;
    }
    if (this._cachedRuleConfig === ruleConfig && this._cachedRules) {
      return this._cachedRules;
    }
    this._cachedRuleConfig = ruleConfig;
    this._cachedRules = this._compileRuleEntries(ruleConfig);
    return this._cachedRules;
  }
  _compileRuleEntries(ruleConfig) {
    const allowRules = [];
    const denyRules = [];
    const allowCommandLineRules = [];
    const denyCommandLineRules = [];
    for (const [key, value] of Object.entries(ruleConfig)) {
      const regex = convertAutoApproveEntryToRegex(key);
      const rule = {
        regex,
        regexCaseInsensitive: regex.flags.includes("i") ? regex : new RegExp(regex.source, regex.flags + "i")
      };
      if (value === true) {
        allowRules.push(rule);
      } else if (value === false) {
        denyRules.push(rule);
      } else if (value && typeof value === "object" && typeof value.approve === "boolean") {
        if (value.approve) {
          if (value.matchCommandLine === true) {
            allowCommandLineRules.push(rule);
          } else {
            allowRules.push(rule);
          }
        } else {
          if (value.matchCommandLine === true) {
            denyCommandLineRules.push(rule);
          } else {
            denyRules.push(rule);
          }
        }
      }
    }
    return { allowRules, denyRules, allowCommandLineRules, denyCommandLineRules };
  }
}
function convertAutoApproveEntryToRegex(value) {
  const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
  const regexPattern = regexMatch?.groups?.pattern;
  if (regexPattern) {
    let flags = regexMatch.groups?.flags;
    if (flags) {
      flags = flags.replaceAll("g", "");
    }
    if (regexPattern === ".*") {
      return new RegExp(regexPattern);
    }
    try {
      const regex = new RegExp(regexPattern, flags || void 0);
      if (regExpLeadsToEndlessLoop(regex)) {
        return neverMatchRegex;
      }
      return regex;
    } catch {
      return neverMatchRegex;
    }
  }
  if (value === "") {
    return neverMatchRegex;
  }
  let sanitizedValue;
  if (value.includes("/") || value.includes("\\")) {
    let pattern = value.replace(/[/\\]/g, "%%PATH_SEP%%");
    pattern = escapeRegExpCharacters(pattern);
    pattern = pattern.replace(/%%PATH_SEP%%*/g, "[/\\\\]");
    sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
  } else {
    sanitizedValue = escapeRegExpCharacters(value);
  }
  return new RegExp(`^${sanitizedValue}\\b`);
}
const DEFAULT_TERMINAL_AUTO_APPROVE_RULES = {
  // Safe readonly commands
  cd: true,
  echo: true,
  ls: true,
  dir: true,
  pwd: true,
  cat: true,
  head: true,
  tail: true,
  findstr: true,
  wc: true,
  tr: true,
  cut: true,
  cmp: true,
  which: true,
  basename: true,
  dirname: true,
  realpath: true,
  readlink: true,
  stat: true,
  file: true,
  od: true,
  du: true,
  df: true,
  sleep: true,
  nl: true,
  grep: true,
  // Safe git sub-commands
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/": false,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/": true,
  "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/": false,
  // Docker readonly sub-commands
  "/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/": true,
  "/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/": true,
  "/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/": true,
  // PowerShell
  "Get-ChildItem": true,
  "Get-Content": true,
  "Get-Date": true,
  "Get-Random": true,
  "Get-Location": true,
  "Set-Location": true,
  "Write-Host": true,
  "Write-Output": true,
  "Out-String": true,
  "Split-Path": true,
  "Join-Path": true,
  "Start-Sleep": true,
  "Where-Object": true,
  "/^Select-[a-z0-9]/i": true,
  "/^Measure-[a-z0-9]/i": true,
  "/^Compare-[a-z0-9]/i": true,
  "/^Format-[a-z0-9]/i": true,
  "/^Sort-[a-z0-9]/i": true,
  // Package manager read-only commands
  "/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/": true,
  "/^npm\\s+config\\s+(list|get)\\b/": true,
  "/^npm\\s+pkg\\s+get\\b/": true,
  "/^npm\\s+audit$/": true,
  "/^npm\\s+cache\\s+verify\\b/": true,
  "/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/": true,
  "/^yarn\\s+licenses\\b/": true,
  "/^yarn\\s+audit\\b(?!.*\\bfix\\b)/": true,
  "/^yarn\\s+config\\s+(list|get)\\b/": true,
  "/^yarn\\s+cache\\s+dir\\b/": true,
  "/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/": true,
  "/^pnpm\\s+licenses\\b/": true,
  "/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/": true,
  "/^pnpm\\s+config\\s+(list|get)\\b/": true,
  // Safe lockfile-only installs
  "npm ci": true,
  "/^yarn\\s+install\\s+--frozen-lockfile\\b/": true,
  "/^pnpm\\s+install\\s+--frozen-lockfile\\b/": true,
  // Safe commands with dangerous arg blocking
  column: true,
  "/^column\\b.*\\s-c\\s+[0-9]{4,}/": false,
  date: true,
  "/^date\\b.*\\s(-s|--set)\\b/": false,
  find: true,
  "/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/": false,
  rg: true,
  "/^rg\\b.*\\s(--pre|--hostname-bin)\\b/": false,
  sed: true,
  "/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/": false,
  "/^sed\\b.*s\\/.*\\/.*\\/[ew]/": false,
  "/^sed\\b.*;W/": false,
  sort: true,
  "/^sort\\b.*\\s-(o|S)\\b/": false,
  tree: true,
  "/^tree\\b.*\\s-o\\b/": false,
  "/^xxd$/": true,
  "/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/": true,
  // Dangerous commands
  rm: false,
  rmdir: false,
  del: false,
  "Remove-Item": false,
  ri: false,
  rd: false,
  erase: false,
  dd: false,
  kill: false,
  ps: false,
  top: false,
  "Stop-Process": false,
  spps: false,
  taskkill: false,
  "taskkill.exe": false,
  curl: false,
  wget: false,
  "Invoke-RestMethod": false,
  "Invoke-WebRequest": false,
  irm: false,
  iwr: false,
  chmod: false,
  chown: false,
  "Set-ItemProperty": false,
  sp: false,
  "Set-Acl": false,
  jq: false,
  xargs: false,
  eval: false,
  "Invoke-Expression": false,
  iex: false
};
export {
  CommandAutoApprover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvbW1hbmRBdXRvQXBwcm92ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IExhbmd1YWdlLCBQYXJzZXIsIFF1ZXJ5LCBRdWVyeUNhcHR1cmUgfSBmcm9tICdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMsIHJlZ0V4cExlYWRzVG9FbmRsZXNzTG9vcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldEFwcE5vZGVNb2R1bGVzUGF0aCB9IGZyb20gJy4vYXBwTm9kZU1vZHVsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWUsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuXG4vKipcbiAqIFJlZGlyZWN0IGRlc3RpbmF0aW9ucyB0aGF0IGRvIG5vdCByZXN1bHQgaW4gYSB3cml0ZSB0byBhbiBhcmJpdHJhcnkgZmlsZVxuICogb24gZGlzazogdGhlIC9kZXYgc2lua3MgdGhhdCBkaXNjYXJkIG91dHB1dCAoYC9kZXYvbnVsbGApIG9yIHdyaXRlIGJhY2sgdG9cbiAqIHRoZSBzYW1lIHRlcm1pbmFsIChgL2Rldi9zdGRvdXRgLCBgL2Rldi9zdGRlcnJgLCBgL2Rldi90dHlgKS5cbiAqL1xuY29uc3QgU0FGRV9QT1NJWF9SRURJUkVDVF9UQVJHRVRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdCcvZGV2L251bGwnLFxuXHQnL2Rldi9zdGRvdXQnLFxuXHQnL2Rldi9zdGRlcnInLFxuXHQnL2Rldi90dHknLFxuXSk7XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIGdpdmVuIHJlZGlyZWN0aW9uIGRlc3RpbmF0aW9uIGlzIGtub3duIHRvIGJlIHNhZmU6XG4gKiBlaXRoZXIgdGhlIHNoZWxsJ3MgbnVsbC9vdXRwdXQgc2luayBvciBhIGZpbGUtZGVzY3JpcHRvciBkdXBsaWNhdGlvbiB0YXJnZXRcbiAqIGxpa2UgYCYxYCAodXNlZCBpbiBgMj4mMWApLlxuICovXG5mdW5jdGlvbiBpc1NhZmVSZWRpcmVjdERlc3RpbmF0aW9uKGRlc3Q6IHN0cmluZywgaXNQb3dlclNoZWxsPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRsZXQgY2xlYW5lZCA9IGRlc3QudHJpbSgpO1xuXHRpZiAoY2xlYW5lZC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gYCRudWxsYCBkaXNjYXJkcyBvdXRwdXQgaW4gUG93ZXJTaGVsbCBsaWtlIC9kZXYvbnVsbDsgdmFyaWFibGUgbmFtZXMgYXJlXG5cdC8vIGNhc2UtaW5zZW5zaXRpdmUuIFF1b3RlZCBmb3JtcyBhcmUgc3RyaW5ncyByYXRoZXIgdGhhbiB0aGUgbnVsbCBzaW5rLlxuXHRpZiAoaXNQb3dlclNoZWxsICYmIGNsZWFuZWQudG9Mb3dlckNhc2UoKSA9PT0gJyRudWxsJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICgoY2xlYW5lZC5zdGFydHNXaXRoKGAnYCkgJiYgY2xlYW5lZC5lbmRzV2l0aChgJ2ApKSB8fFxuXHRcdChjbGVhbmVkLnN0YXJ0c1dpdGgoJ1wiJykgJiYgY2xlYW5lZC5lbmRzV2l0aCgnXCInKSkpIHtcblx0XHRjbGVhbmVkID0gY2xlYW5lZC5zbGljZSgxLCAtMSk7XG5cdH1cblx0Ly8gRmlsZS1kZXNjcmlwdG9yIGR1cGxpY2F0aW9uOiBgJk5gLCBvcHRpb25hbGx5IGZvbGxvd2VkIGJ5IGAtYCB0byBjbG9zZS5cblx0aWYgKC9eJlswLTldKy0/JC8udGVzdChjbGVhbmVkKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdC8vIFBvd2VyU2hlbGwgdXNlcyBgJG51bGxgIGFzIGl0cyBudWxsIHNpbmsuIEluIHBhcnRpY3VsYXIsIGAvZGV2L251bGxgXG5cdC8vIHJlc29sdmVzIGFzIGEgZmlsZXN5c3RlbSBwYXRoIG9uIFdpbmRvd3MuXG5cdHJldHVybiAhaXNQb3dlclNoZWxsICYmIFNBRkVfUE9TSVhfUkVESVJFQ1RfVEFSR0VUUy5oYXMoY2xlYW5lZCk7XG59XG5cbi8qKlxuICogQ2xhc3NpZmljYXRpb24gb2YgYSB0cmVlLXNpdHRlciBgZmlsZV9yZWRpcmVjdGAgbm9kZS5cbiAqIC0gYHJlYWRgOiBpbnB1dC1vbmx5IHJlZGlyZWN0IChgPGAsIGA8Jk5gKSBcdTIwMTQgbmV2ZXIgd3JpdGVzLlxuICogLSBgc2FmZVdyaXRlYDogd3JpdGUgdG8gYSBrbm93bi1zYWZlIHNpbmsgKGAvZGV2L251bGxgLCBmZCBkdXBsaWNhdGlvbiwgLi4uKS5cbiAqIC0gYHVuc2FmZVdyaXRlYDogd3JpdGUgdG8gYW4gYXJiaXRyYXJ5IGRlc3RpbmF0aW9uLiBUaGUgZGVzdGluYXRpb24gc3RyaW5nXG4gKiAgICh3aXRoIHN1cnJvdW5kaW5nIHF1b3RlcyBzdHJpcHBlZCkgaXMgaW5jbHVkZWQgd2hlbiBpdCBjb3VsZCBiZSBwYXJzZWQsXG4gKiAgIHNvIHRoZSBjYWxsZXIgbWF5IGRlY2lkZSB3aGV0aGVyIHRoZSB0YXJnZXQgaXMgYWNjZXB0YWJsZS5cbiAqL1xudHlwZSBGaWxlUmVkaXJlY3RDbGFzc2lmaWNhdGlvbiA9XG5cdHwgeyBraW5kOiAncmVhZCcgfVxuXHR8IHsga2luZDogJ3NhZmVXcml0ZScgfVxuXHR8IHsga2luZDogJ3Vuc2FmZVdyaXRlJzsgZGVzdDogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5RmlsZVJlZGlyZWN0KHJlZGlyZWN0VGV4dDogc3RyaW5nLCBpc1Bvd2VyU2hlbGw/OiBib29sZWFuKTogRmlsZVJlZGlyZWN0Q2xhc3NpZmljYXRpb24ge1xuXHRpZiAoIXJlZGlyZWN0VGV4dC5pbmNsdWRlcygnPicpKSB7XG5cdFx0cmV0dXJuIHsga2luZDogJ3JlYWQnIH07XG5cdH1cblx0Y29uc3QgZGVzdE1hdGNoID0gcmVkaXJlY3RUZXh0Lm1hdGNoKC8oPzpbMC05XSt8JnxcXCopPz4+P1xcfD9cXHMqKC4rKSQvKTtcblx0aWYgKCFkZXN0TWF0Y2gpIHtcblx0XHRyZXR1cm4geyBraW5kOiAndW5zYWZlV3JpdGUnLCBkZXN0OiB1bmRlZmluZWQgfTtcblx0fVxuXHRjb25zdCByYXdEZXN0ID0gZGVzdE1hdGNoWzFdLnRyaW0oKTtcblx0aWYgKGlzU2FmZVJlZGlyZWN0RGVzdGluYXRpb24ocmF3RGVzdCwgaXNQb3dlclNoZWxsKSkge1xuXHRcdHJldHVybiB7IGtpbmQ6ICdzYWZlV3JpdGUnIH07XG5cdH1cblx0bGV0IGRlc3QgPSByYXdEZXN0O1xuXHRpZiAoKGRlc3Quc3RhcnRzV2l0aChgJ2ApICYmIGRlc3QuZW5kc1dpdGgoYCdgKSkgfHxcblx0XHQoZGVzdC5zdGFydHNXaXRoKCdcIicpICYmIGRlc3QuZW5kc1dpdGgoJ1wiJykpKSB7XG5cdFx0ZGVzdCA9IGRlc3Quc2xpY2UoMSwgLTEpO1xuXHR9XG5cdHJldHVybiB7IGtpbmQ6ICd1bnNhZmVXcml0ZScsIGRlc3QgfTtcbn1cblxuLyoqXG4gKiBNYXRjaGVzIGEgUG93ZXJTaGVsbCBjb21tYW5kIHRva2VuIG9mIHRoZSBmb3JtIGAtZmxhZz1gIG9yIGAtLWZsYWc9YCBhdCB0aGVcbiAqIHN0YXJ0IG9mIGlucHV0IG9yIGZvbGxvd2luZyB3aGl0ZXNwYWNlLiBVc2VkIHRvIHdvcmsgYXJvdW5kIGEgdHJlZS1zaXR0ZXJcbiAqIFBvd2VyU2hlbGwgZ3JhbW1hciBsaW1pdGF0aW9uIHdoZXJlIFBPU0lYLXN0eWxlIGAtLWZsYWc9dmFsdWVgIGFyZ3VtZW50c1xuICogKGUuZy4gYGdpdCBsb2cgLS1mb3JtYXQ9XCJhfGJcImApIGFyZSBwYXJzZWQgYXMgYXNzaWdubWVudCBleHByZXNzaW9ucyBhbmRcbiAqIHRydW5jYXRlIHRoZSBzdXJyb3VuZGluZyBjb21tYW5kLiBNaXJyb3JzIHRoZSB3b3JrYmVuY2gnc1xuICogYFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyYCB3b3JrYXJvdW5kLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjk0MDEwXG4gKiBUT0RPOiBSZW1vdmUgb25jZSB1cHN0cmVhbSB0cmVlLXNpdHRlciBQb3dlclNoZWxsIGdyYW1tYXIgaXMgdXBkYXRlZC5cbiAqL1xuY29uc3QgcHdzaEZsYWdFcXVhbHNSZWdleCA9IC8oXnxcXHMpKC17MSwyfVtcXHctXSspPS9nO1xuXG4vLyBUT0RPOiBSZW1vdmUgb25jZSB1cHN0cmVhbSB0cmVlLXNpdHRlciBQb3dlclNoZWxsIGdyYW1tYXIgaXMgdXBkYXRlZC5cbmZ1bmN0aW9uIG1hc2tQd3NoRmxhZ0VxdWFscyhjb21tYW5kTGluZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbW1hbmRMaW5lLnJlcGxhY2UocHdzaEZsYWdFcXVhbHNSZWdleCwgKF8sIHByZSwgZmxhZykgPT4gYCR7cHJlfSR7ZmxhZ30gYCk7XG59XG5cbi8qKlxuICogTWF0Y2hlcyBQb3dlclNoZWxsIHJlZGlyZWN0cyBnbHVlZCB0byB0aGVpciB0YXJnZXQgKGAyPiRudWxsYCwgYD5vdXQudHh0YCxcbiAqIGAqPj5sb2cudHh0YCkuIFRoZSBncmFtbWFyIHBhcnNlcyB0aGVzZSBhcyBgZ2VuZXJpY190b2tlbmAgY29tbWFuZCBhcmd1bWVudHNcbiAqIHJhdGhlciB0aGFuIGByZWRpcmVjdGlvbmAgbm9kZXMsIHdoaWNoIG9ubHkgY292ZXIgdGhlIHNwYWNlZCBmb3JtLlxuICovXG5jb25zdCBwd3NoTm9TcGFjZVJlZGlyZWN0UmVnZXggPSAvXlswLTkqXT8+Pj8vO1xuXG4vKipcbiAqIFJlc3VsdCBvZiBhIGNvbW1hbmQgYXV0by1hcHByb3ZhbCBjaGVjay5cbiAqIC0gYGFwcHJvdmVkYDogYWxsIHN1Yi1jb21tYW5kcyBtYXRjaCBhbGxvdyBydWxlcyBhbmQgbm9uZSBhcmUgZGVuaWVkXG4gKiAtIGBkZW5pZWRgOiBhdCBsZWFzdCBvbmUgc3ViLWNvbW1hbmQgbWF0Y2hlcyBhIGRlbnkgcnVsZVxuICogLSBgbm9NYXRjaGA6IG5vIHJ1bGUgbWF0Y2hlZCBcdTIwMTQgcmVxdWlyZXMgdXNlciBjb25maXJtYXRpb25cbiAqL1xuZXhwb3J0IHR5cGUgQ29tbWFuZEFwcHJvdmFsUmVzdWx0ID0gJ2FwcHJvdmVkJyB8ICdkZW5pZWQnIHwgJ25vTWF0Y2gnO1xuXG4vKiogU3RydWN0dXJlZCBvdXRjb21lIG9mIHtAbGluayBDb21tYW5kQXV0b0FwcHJvdmVyLmV2YWx1YXRlfS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRBcHByb3ZhbEV2YWx1YXRpb24ge1xuXHQvKiogRmluYWwgYXBwcm92YWwgb3V0Y29tZSwgaWRlbnRpY2FsIHRvIHtAbGluayBDb21tYW5kQXV0b0FwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlfS4gKi9cblx0cmVhZG9ubHkgcmVzdWx0OiBDb21tYW5kQXBwcm92YWxSZXN1bHQ7XG5cdC8qKiBXaGV0aGVyIGEgbWlzc2luZyBhbGxvdyBydWxlIGlzIHRoZSBvbmx5IHJlYXNvbiBjb25maXJtYXRpb24gaXMgcmVxdWlyZWQuICovXG5cdHJlYWRvbmx5IGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGJvb2xlYW47XG59XG5cbi8qKiBPcHRpb25zIGZvciB7QGxpbmsgQ29tbWFuZEF1dG9BcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZX0uICovXG5leHBvcnQgaW50ZXJmYWNlIElTaG91bGRBdXRvQXBwcm92ZU9wdGlvbnMge1xuXHQvKipcblx0ICogUHJlZGljYXRlIHRoYXQgZGVjaWRlcyB3aGV0aGVyIGEgd3JpdGUgcmVkaXJlY3Rpb24gdG8gdGhlIGdpdmVuXG5cdCAqIGRlc3RpbmF0aW9uIGlzIGFjY2VwdGFibGUuIENhbGxlZCBvbmNlIHBlciB3cml0ZS1yZWRpcmVjdCBkZXN0aW5hdGlvblxuXHQgKiBmb3VuZCBpbiB0aGUgY29tbWFuZCBsaW5lOyB0aGUgZGVzdGluYXRpb24gaXMgdGhlIHJhdyBzdHJpbmcgdGhlIHVzZXJcblx0ICogdHlwZWQgKHdpdGggc3Vycm91bmRpbmcgcXVvdGVzIHN0cmlwcGVkKS4gVGhlIHByZWRpY2F0ZSBpcyByZXNwb25zaWJsZVxuXHQgKiBmb3IgcmVzb2x2aW5nIHJlbGF0aXZlIHBhdGhzIGFuZCBhcHBseWluZyBpdHMgb3duIHBvbGljeS5cblx0ICpcblx0ICogV2hlbiBvbWl0dGVkLCBhbnkgd3JpdGUgcmVkaXJlY3QgdG8gYSBkZXN0aW5hdGlvbiBvdXRzaWRlIHRoZSBrbm93bi1zYWZlXG5cdCAqIHNpbmtzIChlLmcuIGAvZGV2L251bGxgKSBkb3duZ3JhZGVzIHRoZSByZXN1bHQgdG8gYG5vTWF0Y2hgLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNXcml0ZURlc3RBcHByb3ZlZD86IChkZXN0OiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFZmZlY3RpdmUgVlMgQ29kZSBgY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZWAgcnVsZXMgZm9yd2FyZGVkIGZyb21cblx0ICogdGhlIHJlbmRlcmVyLiBXaGVuIG9taXR0ZWQsIHRoZSBhZ2VudCBob3N0IGZhbGxzIGJhY2sgdG8gaXRzIGJ1bmRsZWRcblx0ICogZGVmYXVsdCBydWxlcyBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG9sZGVyIGNsaWVudHMuXG5cdCAqL1xuXHRyZWFkb25seSBhdXRvQXBwcm92ZVJ1bGVzPzogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzO1xuXHQvKipcblx0ICogU2hlbGwgZ3JhbW1hciB0byBwYXJzZSB0aGUgY29tbWFuZCBsaW5lIHdpdGguIFBvd2VyU2hlbGwgY29tbWFuZHMgYXJlXG5cdCAqIHBhcnNlZCB3aXRoIHRoZSBQb3dlclNoZWxsIGdyYW1tYXIuIFN1Yi1jb21tYW5kIHJ1bGVzIGFyZSBtYXRjaGVkXG5cdCAqIGNhc2UtaW5zZW5zaXRpdmVseSwgbGlrZSBQb3dlclNoZWxsIGl0c2VsZjsgZnVsbC1jb21tYW5kIHJ1bGVzIHJldGFpblxuXHQgKiB0aGVpciBjb25maWd1cmVkIGNhc2luZy4gRGVmYXVsdHMgdG8gYGJhc2hgLlxuXHQgKi9cblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiAnYmFzaCcgfCAncG93ZXJzaGVsbCc7XG59XG5cbmludGVyZmFjZSBJQXV0b0FwcHJvdmVSdWxlIHtcblx0cmVhZG9ubHkgcmVnZXg6IFJlZ0V4cDtcblx0LyoqIENhc2UtaW5zZW5zaXRpdmUgdmFyaWFudCBvZiB7QGxpbmsgcmVnZXh9LCB1c2VkIGZvciBQb3dlclNoZWxsIG1hdGNoaW5nLiAqL1xuXHRyZWFkb25seSByZWdleENhc2VJbnNlbnNpdGl2ZTogUmVnRXhwO1xufVxuXG5pbnRlcmZhY2UgSUF1dG9BcHByb3ZlUnVsZXMge1xuXHRyZWFkb25seSBhbGxvd1J1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW107XG5cdHJlYWRvbmx5IGRlbnlSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRyZWFkb25seSBhbGxvd0NvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXTtcblx0cmVhZG9ubHkgZGVueUNvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXTtcbn1cblxuY29uc3QgbmV2ZXJNYXRjaFJlZ2V4ID0gLyg/IS4qKS87XG5jb25zdCB0cmFuc2llbnRFbnZWYXJSZWdleCA9IC9eW0EtWl9dW0EtWjAtOV9dKj0vaTtcblxuLyoqXG4gKiBBdXRvLWFwcHJvdmVzIG9yIGRlbmllcyBzaGVsbCBjb21tYW5kcyBiYXNlZCBvbiB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMuXG4gKlxuICogVXNlcyB0cmVlLXNpdHRlciB0byBwYXJzZSBjb21wb3VuZCBjb21tYW5kcyAoYGZvbyAmJiBiYXJgKSBpbnRvXG4gKiBzdWItY29tbWFuZHMgdGhhdCBhcmUgaW5kaXZpZHVhbGx5IGNoZWNrZWQgYWdhaW5zdCBhbGxvdy9kZW55IGxpc3RzLlxuICogVGhlIHJ1bGVzIGFyZSBub3JtYWxseSBmb3J3YXJkZWQgZnJvbSBWUyBDb2RlJ3NcbiAqIGBjaGF0LnRvb2xzLnRlcm1pbmFsLmF1dG9BcHByb3ZlYCBzZXR0aW5nLiBBIGJ1bmRsZWQgZGVmYXVsdCB0YWJsZSBpcyBrZXB0XG4gKiBhcyBhIGNvbXBhdGliaWxpdHkgZmFsbGJhY2sgZm9yIGNsaWVudHMgdGhhdCBoYXZlIG5vdCBmb3J3YXJkZWQgcnVsZXMgeWV0LlxuICpcbiAqIFRyZWUtc2l0dGVyIGlzIGluaXRpYWxpemVkIGVhZ2VybHk7IGNhbGwge0BsaW5rIGluaXRpYWxpemV9IGFuZCBhd2FpdCB0aGVcbiAqIHJlc3VsdCBiZWZvcmUgdXNpbmcge0BsaW5rIHNob3VsZEF1dG9BcHByb3ZlfSB0byBndWFyYW50ZWUgc3luY2hyb25vdXNcbiAqIHBhcnNpbmcuIElmIHRyZWUtc2l0dGVyIGZhaWxzIHRvIGxvYWQgb3IgcGFyc2UgdGhlIGNvbW1hbmQsXG4gKiB7QGxpbmsgc2hvdWxkQXV0b0FwcHJvdmV9IHJldHVybnMgYG5vTWF0Y2hgIHNvIHRoZSB1c2VyIGlzIHByb21wdGVkIGZvclxuICogY29uZmlybWF0aW9uIHJhdGhlciB0aGFuIGF1dG8tYXBwcm92aW5nIGJhc2VkIG9uIHRoZSBjb21tYW5kIG5hbWUgYWxvbmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb21tYW5kQXV0b0FwcHJvdmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfZmFsbGJhY2tSdWxlczogSUF1dG9BcHByb3ZlUnVsZXMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhY2hlZFJ1bGVDb25maWc6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FjaGVkUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wYXJzZXI6IFBhcnNlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYmFzaExhbmd1YWdlOiBMYW5ndWFnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcG93ZXJzaGVsbExhbmd1YWdlOiBMYW5ndWFnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcXVlcnlDbGFzczogdHlwZW9mIFF1ZXJ5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pbml0UHJvbWlzZSA9IHRoaXMuX2luaXRUcmVlU2l0dGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIHRyZWUtc2l0dGVyIFdBU00gaGFzIGJlZW4gbG9hZGVkLlxuXHQgKiBBd2FpdCB0aGlzIGJlZm9yZSBwcm9jZXNzaW5nIGFueSBldmVudHMgdG8gZ3VhcmFudGVlIHRoYXRcblx0ICoge0BsaW5rIHNob3VsZEF1dG9BcHByb3ZlfSBjYW4gcGFyc2UgY29tbWFuZHMgc3luY2hyb25vdXNseS5cblx0ICovXG5cdGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRQcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN5bmNocm9ub3VzbHkgY2hlY2sgd2hldGhlciB0aGUgZ2l2ZW4gY29tbWFuZCBsaW5lIHNob3VsZCBiZSBhdXRvLWFwcHJvdmVkLlxuXHQgKiBVc2VzIHRyZWUtc2l0dGVyIChpZiBsb2FkZWQpIHRvIHBhcnNlIGNvbXBvdW5kIGNvbW1hbmRzIGludG8gc3ViLWNvbW1hbmRzLlxuXHQgKlxuXHQgKiBXaGVuIHRoZSBjb21tYW5kIGNvbnRhaW5zIHdyaXRlIHJlZGlyZWN0aW9ucywgYG9wdGlvbnMuaXNXcml0ZURlc3RBcHByb3ZlZGBcblx0ICogaXMgY29uc3VsdGVkIGZvciBlYWNoIGRlc3RpbmF0aW9uLiBJZiBldmVyeSBkZXN0aW5hdGlvbiBpcyBhcHByb3ZlZCBieSB0aGVcblx0ICogcHJlZGljYXRlLCB3cml0ZSByZWRpcmVjdGlvbnMgZG8gbm90IGJsb2NrIGF1dG8tYXBwcm92YWwuXG5cdCAqL1xuXHRzaG91bGRBdXRvQXBwcm92ZShjb21tYW5kTGluZTogc3RyaW5nLCBvcHRpb25zPzogSVNob3VsZEF1dG9BcHByb3ZlT3B0aW9ucyk6IENvbW1hbmRBcHByb3ZhbFJlc3VsdCB7XG5cdFx0cmV0dXJuIHRoaXMuZXZhbHVhdGUoY29tbWFuZExpbmUsIG9wdGlvbnMpLnJlc3VsdDtcblx0fVxuXG5cdC8qKiBFdmFsdWF0ZXMgdGhlIGNvbW1hbmQgYW5kIHJlcG9ydHMgd2hldGhlciBhZGRpbmcgYSBwZXJzaXN0ZW50IGFsbG93IHJ1bGUgY291bGQgcmVzb2x2ZSB0aGUgcmVzdWx0LiAqL1xuXHRldmFsdWF0ZShjb21tYW5kTGluZTogc3RyaW5nLCBvcHRpb25zPzogSVNob3VsZEF1dG9BcHByb3ZlT3B0aW9ucyk6IElDb21tYW5kQXBwcm92YWxFdmFsdWF0aW9uIHtcblx0XHRjb25zdCB0cmltbWVkID0gY29tbWFuZExpbmUudHJpbVN0YXJ0KCk7XG5cdFx0aWYgKHRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6ICdhcHByb3ZlZCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVsZXMgPSB0aGlzLl9jb21waWxlUnVsZXMob3B0aW9ucz8uYXV0b0FwcHJvdmVSdWxlcyk7XG5cdFx0Y29uc3QgaXNQb3dlclNoZWxsID0gb3B0aW9ucz8ubGFuZ3VhZ2UgPT09ICdwb3dlcnNoZWxsJztcblxuXHRcdGlmICh0aGlzLl9tYXRjaGVzQ29tbWFuZExpbmVSdWxlKHRyaW1tZWQsIHJ1bGVzLmRlbnlDb21tYW5kTGluZVJ1bGVzKSkge1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiAnZGVuaWVkJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWQgPSB0aGlzLl9leHRyYWN0U3ViQ29tbWFuZHModHJpbW1lZCwgaXNQb3dlclNoZWxsKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0NvbW1hbmRBdXRvQXBwcm92ZXJdIENvbW1hbmQgbGluZSBjb3VsZCBub3QgYmUgYW5hbHl6ZWQsIHJlcXVpcmluZyBjb25maXJtYXRpb24nKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogJ25vTWF0Y2gnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1VuYXBwcm92ZWRSZWRpcmVjdCA9ICgpID0+IHBhcnNlZC51bnNhZmVXcml0ZURlc3RzLnNvbWUoZGVzdCA9PiBkZXN0ID09PSB1bmRlZmluZWQgfHwgIW9wdGlvbnM/LmlzV3JpdGVEZXN0QXBwcm92ZWQ/LihkZXN0KSk7XG5cblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fbWF0Y2hTdWJDb21tYW5kcyhwYXJzZWQuc3ViQ29tbWFuZHMsIHJ1bGVzLCBpc1Bvd2VyU2hlbGwpO1xuXHRcdGlmIChyZXN1bHQgIT09ICdkZW5pZWQnICYmIHRoaXMuX21hdGNoZXNDb21tYW5kTGluZVJ1bGUodHJpbW1lZCwgcnVsZXMuYWxsb3dDb21tYW5kTGluZVJ1bGVzKSkge1xuXHRcdFx0cmVzdWx0ID0gJ2FwcHJvdmVkJztcblx0XHR9XG5cdFx0aWYgKHJlc3VsdCA9PT0gJ2FwcHJvdmVkJyAmJiBoYXNVbmFwcHJvdmVkUmVkaXJlY3QoKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0NvbW1hbmRBdXRvQXBwcm92ZXJdIFdyaXRlIHJlZGlyZWN0aW9uIHRvIG5vbi1hcHByb3ZlZCBkZXN0aW5hdGlvbiwgcmVxdWlyaW5nIGNvbmZpcm1hdGlvbicpO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHJlc3VsdCwgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogcmVzdWx0ID09PSAnbm9NYXRjaCcgJiYgIWhhc1VuYXBwcm92ZWRSZWRpcmVjdCgpIH07XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaFN1YkNvbW1hbmRzKHN1YkNvbW1hbmRzOiBzdHJpbmdbXSwgcnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVzLCBpc1Bvd2VyU2hlbGw6IGJvb2xlYW4pOiBDb21tYW5kQXBwcm92YWxSZXN1bHQge1xuXHRcdGxldCBhbGxBcHByb3ZlZCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBzdWJDb21tYW5kIG9mIHN1YkNvbW1hbmRzKSB7XG5cdFx0XHQvLyBEZW55IHRyYW5zaWVudCBlbnYgdmFyIGFzc2lnbm1lbnRzXG5cdFx0XHRpZiAodHJhbnNpZW50RW52VmFyUmVnZXgudGVzdChzdWJDb21tYW5kKSkge1xuXHRcdFx0XHRyZXR1cm4gJ2RlbmllZCc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX21hdGNoU2luZ2xlQ29tbWFuZChzdWJDb21tYW5kLCBydWxlcywgaXNQb3dlclNoZWxsKTtcblx0XHRcdGlmIChyZXN1bHQgPT09ICdkZW5pZWQnKSB7XG5cdFx0XHRcdHJldHVybiAnZGVuaWVkJztcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgIT09ICdhcHByb3ZlZCcpIHtcblx0XHRcdFx0YWxsQXBwcm92ZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFsbEFwcHJvdmVkID8gJ2FwcHJvdmVkJyA6ICdub01hdGNoJztcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoU2luZ2xlQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIHJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlcywgaXNQb3dlclNoZWxsOiBib29sZWFuKTogQ29tbWFuZEFwcHJvdmFsUmVzdWx0IHtcblx0XHQvLyBDaGVjayBkZW55IHJ1bGVzIGZpcnN0XG5cdFx0aWYgKHRoaXMuX21hdGNoZXNSdWxlKGNvbW1hbmQsIHJ1bGVzLmRlbnlSdWxlcywgaXNQb3dlclNoZWxsKSkge1xuXHRcdFx0cmV0dXJuICdkZW5pZWQnO1xuXHRcdH1cblxuXHRcdC8vIFRoZW4gY2hlY2sgYWxsb3cgcnVsZXNcblx0XHRpZiAodGhpcy5fbWF0Y2hlc1J1bGUoY29tbWFuZCwgcnVsZXMuYWxsb3dSdWxlcywgaXNQb3dlclNoZWxsKSkge1xuXHRcdFx0cmV0dXJuICdhcHByb3ZlZCc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICdub01hdGNoJztcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoZXNDb21tYW5kTGluZVJ1bGUoY29tbWFuZExpbmU6IHN0cmluZywgcnVsZXM6IHJlYWRvbmx5IElBdXRvQXBwcm92ZVJ1bGVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBydWxlcy5zb21lKHJ1bGUgPT4gcnVsZS5yZWdleC50ZXN0KGNvbW1hbmRMaW5lKSk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaGVzUnVsZShjb21tYW5kOiBzdHJpbmcsIHJ1bGVzOiByZWFkb25seSBJQXV0b0FwcHJvdmVSdWxlW10sIGlzUG93ZXJTaGVsbD86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblx0XHRcdC8vIFBvd2VyU2hlbGwgcnVsZSBtYXRjaGluZyBpcyBjYXNlLWluc2Vuc2l0aXZlLCBsaWtlIHRoZSBzaGVsbCBpdHNlbGYuXG5cdFx0XHRpZiAoKGlzUG93ZXJTaGVsbCA/IHJ1bGUucmVnZXhDYXNlSW5zZW5zaXRpdmUgOiBydWxlLnJlZ2V4KS50ZXN0KGNvbW1hbmQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWdub3JlIGEgbGVhZGluZyAoIGZvciBQb3dlclNoZWxsIGNvbW1hbmRzOiBpdCdzIGEgY29tbWFuZCBwYXR0ZXJuXG5cdFx0XHQvLyBvcGVyYXRpbmcgb24gdGhlIG91dHB1dCBvZiBhIGNvbW1hbmQsIGUuZy4gYChHZXQtQ29udGVudCBSRUFETUUubWQpIC4uLmAuXG5cdFx0XHRpZiAoaXNQb3dlclNoZWxsICYmIGNvbW1hbmQuc3RhcnRzV2l0aCgnKCcpICYmIHJ1bGUucmVnZXhDYXNlSW5zZW5zaXRpdmUudGVzdChjb21tYW5kLnNsaWNlKDEpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gLS0tLSBUcmVlLXNpdHRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2V4dHJhY3RTdWJDb21tYW5kcyhjb21tYW5kTGluZTogc3RyaW5nLCBpc1Bvd2VyU2hlbGw6IGJvb2xlYW4pOiB7IHN1YkNvbW1hbmRzOiBzdHJpbmdbXTsgdW5zYWZlV3JpdGVEZXN0czogKHN0cmluZyB8IHVuZGVmaW5lZClbXSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYW5ndWFnZSA9IGlzUG93ZXJTaGVsbCA/IHRoaXMuX3Bvd2Vyc2hlbGxMYW5ndWFnZSA6IHRoaXMuX2Jhc2hMYW5ndWFnZTtcblx0XHRpZiAoIXRoaXMuX3BhcnNlciB8fCAhbGFuZ3VhZ2UgfHwgIXRoaXMuX3F1ZXJ5Q2xhc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3BhcnNlci5zZXRMYW5ndWFnZShsYW5ndWFnZSk7XG5cdFx0XHQvLyBUaGUgUG93ZXJTaGVsbCBncmFtbWFyIHRydW5jYXRlcyBjb21tYW5kcyBhcm91bmQgYC0tZmxhZz12YWx1ZWBcblx0XHRcdC8vIGFyZ3VtZW50cywgc28gdGhleSBhcmUgbWFza2VkIGJlZm9yZSBwYXJzaW5nIChwb3NpdGlvbnMgYXJlXG5cdFx0XHQvLyBwcmVzZXJ2ZWQpIGFuZCBjYXB0dXJlIHRleHQgaXMgc2xpY2VkIGZyb20gdGhlIG9yaWdpbmFsLlxuXHRcdFx0Y29uc3QgbWFza2VkID0gaXNQb3dlclNoZWxsID8gbWFza1B3c2hGbGFnRXF1YWxzKGNvbW1hbmRMaW5lKSA6IGNvbW1hbmRMaW5lO1xuXHRcdFx0Y29uc3QgdHJlZSA9IHRoaXMuX3BhcnNlci5wYXJzZShtYXNrZWQpO1xuXHRcdFx0aWYgKCF0cmVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChpc1Bvd2VyU2hlbGwgJiYgdHJlZS5yb290Tm9kZS5oYXNFcnJvcikge1xuXHRcdFx0XHRcdC8vIEFuIGVycm9yaW5nIHBhcnNlIGNhbiBwcm9kdWNlIHRydW5jYXRlZCBjYXB0dXJlcyB0aGF0IGhpZGVcblx0XHRcdFx0XHQvLyBwYXJ0IG9mIHRoZSBjb21tYW5kIGxpbmUgZnJvbSBydWxlIG1hdGNoaW5nLCBzbyByZXF1aXJlXG5cdFx0XHRcdFx0Ly8gY29uZmlybWF0aW9uIGluc3RlYWQgb2YganVkZ2luZyB0aGUgcGFydGlhbCBwYXJzZS5cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gUG93ZXJTaGVsbCBwYXJzZSBjb250YWlucyBlcnJvcnMsIHJlcXVpcmluZyBjb25maXJtYXRpb24nKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5vLXNwYWNlIFBvd2VyU2hlbGwgcmVkaXJlY3RzIChgMj4kbnVsbGApIHBhcnNlIGFzIGdlbmVyaWNfdG9rZW5cblx0XHRcdFx0Ly8gY29tbWFuZCBhcmd1bWVudHMgcmF0aGVyIHRoYW4gcmVkaXJlY3Rpb24gbm9kZXMsIHNvIGJvdGggYXJlXG5cdFx0XHRcdC8vIGNhcHR1cmVkIGFuZCBmaWx0ZXJlZCBieSBzaGFwZSBiZWxvdy4gQXNzaWdubWVudHMgYW5kIG1ldGhvZFxuXHRcdFx0XHQvLyBpbnZvY2F0aW9ucyBhcmUgY2FwdHVyZWQgc28gdGhlIGNvbW1hbmQgbGluZSBjYW4gZmFpbCBjbG9zZWRcblx0XHRcdFx0Ly8gd2hlbiBpdCBjb250YWlucyBjb2RlIHRoZSBydWxlcyBjYW5ub3Qgc2VlLlxuXHRcdFx0XHRjb25zdCBxdWVyeSA9IG5ldyB0aGlzLl9xdWVyeUNsYXNzKGxhbmd1YWdlLCBpc1Bvd2VyU2hlbGxcblx0XHRcdFx0XHQ/ICcoY29tbWFuZCkgQGNvbW1hbmQgKHJlZGlyZWN0aW9uKSBAcmVkaXJlY3Rpb24gKGdlbmVyaWNfdG9rZW4pIEBnZW5lcmljX3Rva2VuIChhc3NpZ25tZW50X2V4cHJlc3Npb24pIEB1bmFuYWx5emFibGUgKGludm9rYXRpb25fZXhwcmVzc2lvbikgQHVuYW5hbHl6YWJsZSdcblx0XHRcdFx0XHQ6ICcoY29tbWFuZCkgQGNvbW1hbmQgKGZpbGVfcmVkaXJlY3QpIEBmaWxlX3JlZGlyZWN0IChoZXJlZG9jX3JlZGlyZWN0KSBAaGVyZWRvY19yZWRpcmVjdCAoaGVyZXN0cmluZ19yZWRpcmVjdCkgQGhlcmVzdHJpbmdfcmVkaXJlY3QgKHZhcmlhYmxlX2Fzc2lnbm1lbnQpIEB1bmFuYWx5emFibGUgKGRlY2xhcmF0aW9uX2NvbW1hbmQpIEB1bmFuYWx5emFibGUnKTtcblx0XHRcdFx0Y29uc3QgY2FwdHVyZXM6IFF1ZXJ5Q2FwdHVyZVtdID0gcXVlcnkuY2FwdHVyZXModHJlZS5yb290Tm9kZSk7XG5cdFx0XHRcdGNvbnN0IHN1YkNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCB1bnNhZmVXcml0ZURlc3RzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0XHRcdGxldCB1bmFuYWx5emFibGVUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgY2FwdHVyZSBvZiBjYXB0dXJlcykge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBtYXNrZWQgPT09IGNvbW1hbmRMaW5lID8gY2FwdHVyZS5ub2RlLnRleHQgOiBjb21tYW5kTGluZS5zdWJzdHJpbmcoY2FwdHVyZS5ub2RlLnN0YXJ0SW5kZXgsIGNhcHR1cmUubm9kZS5lbmRJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGNhcHR1cmUubmFtZSA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0XHRzdWJDb21tYW5kcy5wdXNoKHRleHQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2FwdHVyZS5uYW1lID09PSAndW5hbmFseXphYmxlJyAmJiAoY2FwdHVyZS5ub2RlLnR5cGUgIT09ICd2YXJpYWJsZV9hc3NpZ25tZW50JyB8fCBjYXB0dXJlLm5vZGUucGFyZW50Py50eXBlICE9PSAnY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR1bmFuYWx5emFibGVUeXBlID8/PSBjYXB0dXJlLm5vZGUudHlwZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNhcHR1cmUubmFtZSA9PT0gJ2ZpbGVfcmVkaXJlY3QnIHx8IGNhcHR1cmUubmFtZSA9PT0gJ3JlZGlyZWN0aW9uJyB8fCAoY2FwdHVyZS5uYW1lID09PSAnZ2VuZXJpY190b2tlbicgJiYgcHdzaE5vU3BhY2VSZWRpcmVjdFJlZ2V4LnRlc3QodGV4dCkpKSB7XG5cdFx0XHRcdFx0XHQvLyBXcml0ZXMgdG8ga25vd24tc2FmZSBzaW5rcyAoZS5nLiBgPiAvZGV2L251bGxgLCBgMj4kbnVsbGApXG5cdFx0XHRcdFx0XHQvLyBhbmQgZmlsZS1kZXNjcmlwdG9yIGR1cGxpY2F0aW9ucyAoZS5nLiBgMj4mMWApIGFyZSBhbGxvd2VkLlxuXHRcdFx0XHRcdFx0Y29uc3QgY2xzID0gY2xhc3NpZnlGaWxlUmVkaXJlY3QodGV4dCwgaXNQb3dlclNoZWxsKTtcblx0XHRcdFx0XHRcdGlmIChjbHMua2luZCA9PT0gJ3Vuc2FmZVdyaXRlJykge1xuXHRcdFx0XHRcdFx0XHR1bnNhZmVXcml0ZURlc3RzLnB1c2goY2xzLmRlc3QpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2FwdHVyZS5uYW1lID09PSAnaGVyZWRvY19yZWRpcmVjdCcgfHwgY2FwdHVyZS5uYW1lID09PSAnaGVyZXN0cmluZ19yZWRpcmVjdCcpIHtcblx0XHRcdFx0XHRcdC8vIEhlcmVkb2MvaGVyZXN0cmluZyBmZWVkIGRhdGEgaW50byBzdGRpbjsgdGhleSBkbyBub3Qgd3JpdGVcblx0XHRcdFx0XHRcdC8vIGZpbGVzLCBzbyB0aGV5IGFyZSBub3QgdHJlYXRlZCBhcyB3cml0ZSByZWRpcmVjdHMgaGVyZS5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVlcnkuZGVsZXRlKCk7XG5cblx0XHRcdFx0aWYgKHVuYW5hbHl6YWJsZVR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29tbWFuZEF1dG9BcHByb3Zlcl0gQ29tbWFuZCBsaW5lIGNvbnRhaW5zIGFuIHVuYW5hbHl6YWJsZSAke3VuYW5hbHl6YWJsZVR5cGV9LCByZXF1aXJpbmcgY29uZmlybWF0aW9uYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3ViQ29tbWFuZHMubGVuZ3RoID4gMCB8fCB1bnNhZmVXcml0ZURlc3RzLmxlbmd0aCA+IDAgPyB7IHN1YkNvbW1hbmRzLCB1bnNhZmVXcml0ZURlc3RzIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cmVlLmRlbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29tbWFuZEF1dG9BcHByb3Zlcl0gVHJlZS1zaXR0ZXIgcGFyc2luZyBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0VHJlZVNpdHRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBkZWZhdWx0OiBUcmVlU2l0dGVyIH0gPSAoYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nKSk7XG5cblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSBXQVNNIGZpbGVzIGZyb20gbm9kZV9tb2R1bGVzLiBJbiB0aGUgZGVza3RvcCBhcHAgdGhlIGAud2FzbWBcblx0XHRcdC8vIGZpbGVzIGFyZSB1bnBhY2tlZCBuZXh0IHRvIHRoZSBBU0FSIGFyY2hpdmUgKGBub2RlX21vZHVsZXMuYXNhci51bnBhY2tlZGApLFxuXHRcdFx0Ly8gd2hpbGUgaW4gZGV2IGFuZCBvbiB0aGUgc2VydmVyICh3aGljaCBoYXMgbm8gQVNBUikgdGhleSBsaXZlIGluIGEgcGxhaW5cblx0XHRcdC8vIGBub2RlX21vZHVsZXNgLlxuXHRcdFx0Y29uc3QgbW9kdWxlUm9vdCA9IFVSSS5qb2luUGF0aChGaWxlQWNjZXNzLmFzRmlsZVVyaShnZXRBcHBOb2RlTW9kdWxlc1BhdGgoKSksICdAdnNjb2RlJywgJ3RyZWUtc2l0dGVyLXdhc20nLCAnd2FzbScpO1xuXHRcdFx0Y29uc3Qgd2FzbVBhdGggPSBVUkkuam9pblBhdGgobW9kdWxlUm9vdCwgJ3RyZWUtc2l0dGVyLndhc20nKS5mc1BhdGg7XG5cblx0XHRcdGF3YWl0IFRyZWVTaXR0ZXIuUGFyc2VyLmluaXQoe1xuXHRcdFx0XHRsb2NhdGVGaWxlKCkge1xuXHRcdFx0XHRcdHJldHVybiB3YXNtUGF0aDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyc2VyID0gbmV3IFRyZWVTaXR0ZXIuUGFyc2VyKCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHBhcnNlci5kZWxldGUoKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gV0FTTSBtZW1vcnkgbWF5IGFscmVhZHkgYmUgZnJlZWRcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBMb2FkIHRoZSBiYXNoIGFuZCBQb3dlclNoZWxsIGdyYW1tYXJzLiBBIGZhaWx1cmUgdG8gbG9hZCBvbmUgbXVzdFxuXHRcdFx0Ly8gbm90IGRpc2FibGUgYXV0by1hcHByb3ZhbCBmb3IgdGhlIG90aGVyLCBzbyBlYWNoIGlzIHNldHRsZWRcblx0XHRcdC8vIGluZGVwZW5kZW50bHkgYW5kIGFzc2lnbmVkIG9ubHkgaWYgaXQgcmVzb2x2ZWQuXG5cdFx0XHRjb25zdCBsb2FkR3JhbW1hciA9IGFzeW5jIChmaWxlTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGdyYW1tYXJXYXNtID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUoVVJJLmpvaW5QYXRoKG1vZHVsZVJvb3QsIGZpbGVOYW1lKS5mc1BhdGgpO1xuXHRcdFx0XHRyZXR1cm4gVHJlZVNpdHRlci5MYW5ndWFnZS5sb2FkKG5ldyBVaW50OEFycmF5KGdyYW1tYXJXYXNtLmJ1ZmZlciwgZ3JhbW1hcldhc20uYnl0ZU9mZnNldCwgZ3JhbW1hcldhc20uYnl0ZUxlbmd0aCkpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IFtiYXNoTGFuZ3VhZ2UsIHBvd2Vyc2hlbGxMYW5ndWFnZV0gPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0XHRsb2FkR3JhbW1hcigndHJlZS1zaXR0ZXItYmFzaC53YXNtJyksXG5cdFx0XHRcdGxvYWRHcmFtbWFyKCd0cmVlLXNpdHRlci1wb3dlcnNoZWxsLndhc20nKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3BhcnNlciA9IHBhcnNlcjtcblx0XHRcdHRoaXMuX3F1ZXJ5Q2xhc3MgPSBUcmVlU2l0dGVyLlF1ZXJ5O1xuXHRcdFx0Ly8gQSBncmFtbWFyIHRoYXQgZmFpbHMgdG8gbG9hZCBsZWF2ZXMgaXRzIGxhbmd1YWdlIHVuZGVmaW5lZCwgc29cblx0XHRcdC8vIGNvbW1hbmRzIGZvciB0aGF0IHNoZWxsIGZhbGwgYmFjayB0byBgbm9NYXRjaGAgYW5kIHJlcXVpcmVcblx0XHRcdC8vIGNvbmZpcm1hdGlvbiByYXRoZXIgdGhhbiBhdXRvLWFwcHJvdmluZy5cblx0XHRcdGlmIChiYXNoTGFuZ3VhZ2Uuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHR0aGlzLl9iYXNoTGFuZ3VhZ2UgPSBiYXNoTGFuZ3VhZ2UudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb21tYW5kQXV0b0FwcHJvdmVyXSBGYWlsZWQgdG8gbG9hZCB0aGUgYmFzaCBncmFtbWFyOyBiYXNoIGNvbW1hbmRzIHdpbGwgcmVxdWlyZSBjb25maXJtYXRpb24nLCBiYXNoTGFuZ3VhZ2UucmVhc29uKTtcblx0XHRcdH1cblx0XHRcdGlmIChwb3dlcnNoZWxsTGFuZ3VhZ2Uuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHR0aGlzLl9wb3dlcnNoZWxsTGFuZ3VhZ2UgPSBwb3dlcnNoZWxsTGFuZ3VhZ2UudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb21tYW5kQXV0b0FwcHJvdmVyXSBGYWlsZWQgdG8gbG9hZCB0aGUgUG93ZXJTaGVsbCBncmFtbWFyOyBQb3dlclNoZWxsIGNvbW1hbmRzIHdpbGwgcmVxdWlyZSBjb25maXJtYXRpb24nLCBwb3dlcnNoZWxsTGFuZ3VhZ2UucmVhc29uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvbW1hbmRBdXRvQXBwcm92ZXJdIFRyZWUtc2l0dGVyIGluaXRpYWxpemVkIChiYXNoPSR7dGhpcy5fYmFzaExhbmd1YWdlID8gJ2F2YWlsYWJsZScgOiAndW5hdmFpbGFibGUnfSwgcG93ZXJzaGVsbD0ke3RoaXMuX3Bvd2Vyc2hlbGxMYW5ndWFnZSA/ICdhdmFpbGFibGUnIDogJ3VuYXZhaWxhYmxlJ30pYCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb21tYW5kQXV0b0FwcHJvdmVyXSBGYWlsZWQgdG8gaW5pdGlhbGl6ZSB0cmVlLXNpdHRlcicsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBSdWxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2NvbXBpbGVSdWxlcyhydWxlQ29uZmlnOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgfCB1bmRlZmluZWQpOiBJQXV0b0FwcHJvdmVSdWxlcyB7XG5cdFx0aWYgKCFydWxlQ29uZmlnKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2ZhbGxiYWNrUnVsZXMpIHtcblx0XHRcdFx0dGhpcy5fZmFsbGJhY2tSdWxlcyA9IHRoaXMuX2NvbXBpbGVSdWxlRW50cmllcyhERUZBVUxUX1RFUk1JTkFMX0FVVE9fQVBQUk9WRV9SVUxFUyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmFsbGJhY2tSdWxlcztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2FjaGVkUnVsZUNvbmZpZyA9PT0gcnVsZUNvbmZpZyAmJiB0aGlzLl9jYWNoZWRSdWxlcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFJ1bGVzO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NhY2hlZFJ1bGVDb25maWcgPSBydWxlQ29uZmlnO1xuXHRcdHRoaXMuX2NhY2hlZFJ1bGVzID0gdGhpcy5fY29tcGlsZVJ1bGVFbnRyaWVzKHJ1bGVDb25maWcpO1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRSdWxlcztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBpbGVSdWxlRW50cmllcyhydWxlQ29uZmlnOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZVZhbHVlPj4pOiBJQXV0b0FwcHJvdmVSdWxlcyB7XG5cdFx0Y29uc3QgYWxsb3dSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cdFx0Y29uc3QgZGVueVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0XHRjb25zdCBhbGxvd0NvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXSA9IFtdO1xuXHRcdGNvbnN0IGRlbnlDb21tYW5kTGluZVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHJ1bGVDb25maWcpKSB7XG5cdFx0XHRjb25zdCByZWdleCA9IGNvbnZlcnRBdXRvQXBwcm92ZUVudHJ5VG9SZWdleChrZXkpO1xuXHRcdFx0Y29uc3QgcnVsZSA9IHtcblx0XHRcdFx0cmVnZXgsXG5cdFx0XHRcdHJlZ2V4Q2FzZUluc2Vuc2l0aXZlOiByZWdleC5mbGFncy5pbmNsdWRlcygnaScpID8gcmVnZXggOiBuZXcgUmVnRXhwKHJlZ2V4LnNvdXJjZSwgcmVnZXguZmxhZ3MgKyAnaScpLFxuXHRcdFx0fTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRhbGxvd1J1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBmYWxzZSkge1xuXHRcdFx0XHRkZW55UnVsZXMucHVzaChydWxlKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUuYXBwcm92ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdGlmICh2YWx1ZS5hcHByb3ZlKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlLm1hdGNoQ29tbWFuZExpbmUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdGFsbG93Q29tbWFuZExpbmVSdWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhbGxvd1J1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh2YWx1ZS5tYXRjaENvbW1hbmRMaW5lID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRkZW55Q29tbWFuZExpbmVSdWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZW55UnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBhbGxvd1J1bGVzLCBkZW55UnVsZXMsIGFsbG93Q29tbWFuZExpbmVSdWxlcywgZGVueUNvbW1hbmRMaW5lUnVsZXMgfTtcblx0fVxufVxuXG4vLyAtLS0tIFJlZ2V4IGNvbnZlcnNpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjb252ZXJ0QXV0b0FwcHJvdmVFbnRyeVRvUmVnZXgodmFsdWU6IHN0cmluZyk6IFJlZ0V4cCB7XG5cdC8vIElmIHdyYXBwZWQgaW4gYC9gLCB0cmVhdCBhcyByZWdleFxuXHRjb25zdCByZWdleE1hdGNoID0gdmFsdWUubWF0Y2goL15cXC8oPzxwYXR0ZXJuPi4rKVxcLyg/PGZsYWdzPltkZ2ltc3V2eV0qKSQvKTtcblx0Y29uc3QgcmVnZXhQYXR0ZXJuID0gcmVnZXhNYXRjaD8uZ3JvdXBzPy5wYXR0ZXJuO1xuXHRpZiAocmVnZXhQYXR0ZXJuKSB7XG5cdFx0bGV0IGZsYWdzID0gcmVnZXhNYXRjaC5ncm91cHM/LmZsYWdzO1xuXHRcdGlmIChmbGFncykge1xuXHRcdFx0ZmxhZ3MgPSBmbGFncy5yZXBsYWNlQWxsKCdnJywgJycpO1xuXHRcdH1cblxuXHRcdGlmIChyZWdleFBhdHRlcm4gPT09ICcuKicpIHtcblx0XHRcdHJldHVybiBuZXcgUmVnRXhwKHJlZ2V4UGF0dGVybik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFBhdHRlcm4sIGZsYWdzIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAocmVnRXhwTGVhZHNUb0VuZGxlc3NMb29wKHJlZ2V4KSkge1xuXHRcdFx0XHRyZXR1cm4gbmV2ZXJNYXRjaFJlZ2V4O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlZ2V4O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG5ldmVyTWF0Y2hSZWdleDtcblx0XHR9XG5cdH1cblxuXHRpZiAodmFsdWUgPT09ICcnKSB7XG5cdFx0cmV0dXJuIG5ldmVyTWF0Y2hSZWdleDtcblx0fVxuXG5cdGxldCBzYW5pdGl6ZWRWYWx1ZTogc3RyaW5nO1xuXG5cdC8vIE1hdGNoIGJvdGggcGF0aCBzZXBhcmF0b3JzIGlmIGl0IGxvb2tzIGxpa2UgYSBwYXRoXG5cdGlmICh2YWx1ZS5pbmNsdWRlcygnLycpIHx8IHZhbHVlLmluY2x1ZGVzKCdcXFxcJykpIHtcblx0XHRsZXQgcGF0dGVybiA9IHZhbHVlLnJlcGxhY2UoL1svXFxcXF0vZywgJyUlUEFUSF9TRVAlJScpO1xuXHRcdHBhdHRlcm4gPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHBhdHRlcm4pO1xuXHRcdHBhdHRlcm4gPSBwYXR0ZXJuLnJlcGxhY2UoLyUlUEFUSF9TRVAlJSovZywgJ1svXFxcXFxcXFxdJyk7XG5cdFx0c2FuaXRpemVkVmFsdWUgPSBgXig/OlxcXFwuWy9cXFxcXFxcXF0pPyR7cGF0dGVybn1gO1xuXHR9IGVsc2Uge1xuXHRcdHNhbml0aXplZFZhbHVlID0gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyh2YWx1ZSk7XG5cdH1cblxuXHRyZXR1cm4gbmV3IFJlZ0V4cChgXiR7c2FuaXRpemVkVmFsdWV9XFxcXGJgKTtcbn1cblxuLy8gLS0tLSBEZWZhdWx0IHJ1bGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vXG4vLyBDb21wYXRpYmlsaXR5IGZhbGxiYWNrIGZvciBjbGllbnRzIHRoYXQgZG8gbm90IGZvcndhcmQgdGhlIFZTIENvZGVcbi8vIGBjaGF0LnRvb2xzLnRlcm1pbmFsLmF1dG9BcHByb3ZlYCBzZXR0aW5nLlxuLy8gVE9ETzogUmVtb3ZlIHRoaXMgZmFsbGJhY2sgb25jZSBhbGwgYWdlbnQtaG9zdCBjbGllbnRzIGFyZSBndWFyYW50ZWVkIHRvXG4vLyBmb3J3YXJkIGBjaGF0LnRvb2xzLnRlcm1pbmFsLmF1dG9BcHByb3ZlYCBiZWZvcmUgc2hlbGwgYXBwcm92YWxzIHJ1bi5cblxuY29uc3QgREVGQVVMVF9URVJNSU5BTF9BVVRPX0FQUFJPVkVfUlVMRVM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWU+PiA9IHtcblx0Ly8gU2FmZSByZWFkb25seSBjb21tYW5kc1xuXHRjZDogdHJ1ZSxcblx0ZWNobzogdHJ1ZSxcblx0bHM6IHRydWUsXG5cdGRpcjogdHJ1ZSxcblx0cHdkOiB0cnVlLFxuXHRjYXQ6IHRydWUsXG5cdGhlYWQ6IHRydWUsXG5cdHRhaWw6IHRydWUsXG5cdGZpbmRzdHI6IHRydWUsXG5cdHdjOiB0cnVlLFxuXHR0cjogdHJ1ZSxcblx0Y3V0OiB0cnVlLFxuXHRjbXA6IHRydWUsXG5cdHdoaWNoOiB0cnVlLFxuXHRiYXNlbmFtZTogdHJ1ZSxcblx0ZGlybmFtZTogdHJ1ZSxcblx0cmVhbHBhdGg6IHRydWUsXG5cdHJlYWRsaW5rOiB0cnVlLFxuXHRzdGF0OiB0cnVlLFxuXHRmaWxlOiB0cnVlLFxuXHRvZDogdHJ1ZSxcblx0ZHU6IHRydWUsXG5cdGRmOiB0cnVlLFxuXHRzbGVlcDogdHJ1ZSxcblx0bmw6IHRydWUsXG5cblx0Z3JlcDogdHJ1ZSxcblxuXHQvLyBTYWZlIGdpdCBzdWItY29tbWFuZHNcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrc3RhdHVzXFxcXGIvJzogdHJ1ZSxcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrbG9nXFxcXGIvJzogdHJ1ZSxcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrbG9nXFxcXGIuKlxcXFxzLS1vdXRwdXQoPXxcXFxcc3wkKS8nOiBmYWxzZSxcblx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrc2hvd1xcXFxiLyc6IHRydWUsXG5cdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2RpZmZcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytscy1maWxlc1xcXFxiLyc6IHRydWUsXG5cdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2dyZXBcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccyticmFuY2hcXFxcYi8nOiB0cnVlLFxuXHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccyticmFuY2hcXFxcYi4qXFxcXHMtKGR8RHxtfE18LWRlbGV0ZXwtZm9yY2UpXFxcXGIvJzogZmFsc2UsXG5cblx0Ly8gRG9ja2VyIHJlYWRvbmx5IHN1Yi1jb21tYW5kc1xuXHQnL15kb2NrZXJcXFxccysocHN8aW1hZ2VzfGluZm98dmVyc2lvbnxpbnNwZWN0fGxvZ3N8dG9wfHN0YXRzfHBvcnR8ZGlmZnxzZWFyY2h8ZXZlbnRzKVxcXFxiLyc6IHRydWUsXG5cdCcvXmRvY2tlclxcXFxzKyhjb250YWluZXJ8aW1hZ2V8bmV0d29ya3x2b2x1bWV8Y29udGV4dHxzeXN0ZW0pXFxcXHMrKGxzfHBzfGluc3BlY3R8aGlzdG9yeXxzaG93fGRmfGluZm8pXFxcXGIvJzogdHJ1ZSxcblx0Jy9eZG9ja2VyXFxcXHMrY29tcG9zZVxcXFxzKyhwc3xsc3x0b3B8bG9nc3xpbWFnZXN8Y29uZmlnfHZlcnNpb258cG9ydHxldmVudHMpXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBQb3dlclNoZWxsXG5cdCdHZXQtQ2hpbGRJdGVtJzogdHJ1ZSxcblx0J0dldC1Db250ZW50JzogdHJ1ZSxcblx0J0dldC1EYXRlJzogdHJ1ZSxcblx0J0dldC1SYW5kb20nOiB0cnVlLFxuXHQnR2V0LUxvY2F0aW9uJzogdHJ1ZSxcblx0J1NldC1Mb2NhdGlvbic6IHRydWUsXG5cdCdXcml0ZS1Ib3N0JzogdHJ1ZSxcblx0J1dyaXRlLU91dHB1dCc6IHRydWUsXG5cdCdPdXQtU3RyaW5nJzogdHJ1ZSxcblx0J1NwbGl0LVBhdGgnOiB0cnVlLFxuXHQnSm9pbi1QYXRoJzogdHJ1ZSxcblx0J1N0YXJ0LVNsZWVwJzogdHJ1ZSxcblx0J1doZXJlLU9iamVjdCc6IHRydWUsXG5cdCcvXlNlbGVjdC1bYS16MC05XS9pJzogdHJ1ZSxcblx0Jy9eTWVhc3VyZS1bYS16MC05XS9pJzogdHJ1ZSxcblx0Jy9eQ29tcGFyZS1bYS16MC05XS9pJzogdHJ1ZSxcblx0Jy9eRm9ybWF0LVthLXowLTldL2knOiB0cnVlLFxuXHQnL15Tb3J0LVthLXowLTldL2knOiB0cnVlLFxuXG5cdC8vIFBhY2thZ2UgbWFuYWdlciByZWFkLW9ubHkgY29tbWFuZHNcblx0Jy9ebnBtXFxcXHMrKGxzfGxpc3R8b3V0ZGF0ZWR8dmlld3xpbmZvfHNob3d8ZXhwbGFpbnx3aHl8cm9vdHxwcmVmaXh8YmlufHNlYXJjaHxkb2N0b3J8ZnVuZHxyZXBvfGJ1Z3N8ZG9jc3xob21lfGhlbHAoLXNlYXJjaCk/KVxcXFxiLyc6IHRydWUsXG5cdCcvXm5wbVxcXFxzK2NvbmZpZ1xcXFxzKyhsaXN0fGdldClcXFxcYi8nOiB0cnVlLFxuXHQnL15ucG1cXFxccytwa2dcXFxccytnZXRcXFxcYi8nOiB0cnVlLFxuXHQnL15ucG1cXFxccythdWRpdCQvJzogdHJ1ZSxcblx0Jy9ebnBtXFxcXHMrY2FjaGVcXFxccyt2ZXJpZnlcXFxcYi8nOiB0cnVlLFxuXHQnL155YXJuXFxcXHMrKGxpc3R8b3V0ZGF0ZWR8aW5mb3x3aHl8YmlufGhlbHB8dmVyc2lvbnMpXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2xpY2Vuc2VzXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdCcvXnlhcm5cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblx0Jy9eeWFyblxcXFxzK2NhY2hlXFxcXHMrZGlyXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzKyhsc3xsaXN0fG91dGRhdGVkfHdoeXxyb290fGJpbnxkb2N0b3IpXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzK2xpY2Vuc2VzXFxcXGIvJzogdHJ1ZSxcblx0Jy9ecG5wbVxcXFxzK2F1ZGl0XFxcXGIoPyEuKlxcXFxiZml4XFxcXGIpLyc6IHRydWUsXG5cdCcvXnBucG1cXFxccytjb25maWdcXFxccysobGlzdHxnZXQpXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBTYWZlIGxvY2tmaWxlLW9ubHkgaW5zdGFsbHNcblx0J25wbSBjaSc6IHRydWUsXG5cdCcvXnlhcm5cXFxccytpbnN0YWxsXFxcXHMrLS1mcm96ZW4tbG9ja2ZpbGVcXFxcYi8nOiB0cnVlLFxuXHQnL15wbnBtXFxcXHMraW5zdGFsbFxcXFxzKy0tZnJvemVuLWxvY2tmaWxlXFxcXGIvJzogdHJ1ZSxcblxuXHQvLyBTYWZlIGNvbW1hbmRzIHdpdGggZGFuZ2Vyb3VzIGFyZyBibG9ja2luZ1xuXHRjb2x1bW46IHRydWUsXG5cdCcvXmNvbHVtblxcXFxiLipcXFxccy1jXFxcXHMrWzAtOV17NCx9Lyc6IGZhbHNlLFxuXHRkYXRlOiB0cnVlLFxuXHQnL15kYXRlXFxcXGIuKlxcXFxzKC1zfC0tc2V0KVxcXFxiLyc6IGZhbHNlLFxuXHRmaW5kOiB0cnVlLFxuXHQnL15maW5kXFxcXGIuKlxcXFxzLShkZWxldGV8ZXhlY3xleGVjZGlyfGZwcmludHxmcHJpbnRmfGZsc3xva3xva2RpcilcXFxcYi8nOiBmYWxzZSxcblx0cmc6IHRydWUsXG5cdCcvXnJnXFxcXGIuKlxcXFxzKC0tcHJlfC0taG9zdG5hbWUtYmluKVxcXFxiLyc6IGZhbHNlLFxuXHRzZWQ6IHRydWUsXG5cdCcvXnNlZFxcXFxiLipcXFxccygtW2EtekEtWl0qKGV8ZilbYS16QS1aXSp8LS1leHByZXNzaW9ufC0tZmlsZSlcXFxcYi8nOiBmYWxzZSxcblx0Jy9ec2VkXFxcXGIuKnNcXFxcLy4qXFxcXC8uKlxcXFwvW2V3XS8nOiBmYWxzZSxcblx0Jy9ec2VkXFxcXGIuKjtXLyc6IGZhbHNlLFxuXHRzb3J0OiB0cnVlLFxuXHQnL15zb3J0XFxcXGIuKlxcXFxzLShvfFMpXFxcXGIvJzogZmFsc2UsXG5cdHRyZWU6IHRydWUsXG5cdCcvXnRyZWVcXFxcYi4qXFxcXHMtb1xcXFxiLyc6IGZhbHNlLFxuXHQnL154eGQkLyc6IHRydWUsXG5cdCcvXnh4ZFxcXFxiKFxcXFxzKy1cXFxcUyspKlxcXFxzK1teLVxcXFxzXVxcXFxTKiQvJzogdHJ1ZSxcblxuXHQvLyBEYW5nZXJvdXMgY29tbWFuZHNcblx0cm06IGZhbHNlLFxuXHRybWRpcjogZmFsc2UsXG5cdGRlbDogZmFsc2UsXG5cdCdSZW1vdmUtSXRlbSc6IGZhbHNlLFxuXHRyaTogZmFsc2UsXG5cdHJkOiBmYWxzZSxcblx0ZXJhc2U6IGZhbHNlLFxuXHRkZDogZmFsc2UsXG5cdGtpbGw6IGZhbHNlLFxuXHRwczogZmFsc2UsXG5cdHRvcDogZmFsc2UsXG5cdCdTdG9wLVByb2Nlc3MnOiBmYWxzZSxcblx0c3BwczogZmFsc2UsXG5cdHRhc2traWxsOiBmYWxzZSxcblx0J3Rhc2traWxsLmV4ZSc6IGZhbHNlLFxuXHRjdXJsOiBmYWxzZSxcblx0d2dldDogZmFsc2UsXG5cdCdJbnZva2UtUmVzdE1ldGhvZCc6IGZhbHNlLFxuXHQnSW52b2tlLVdlYlJlcXVlc3QnOiBmYWxzZSxcblx0aXJtOiBmYWxzZSxcblx0aXdyOiBmYWxzZSxcblx0Y2htb2Q6IGZhbHNlLFxuXHRjaG93bjogZmFsc2UsXG5cdCdTZXQtSXRlbVByb3BlcnR5JzogZmFsc2UsXG5cdHNwOiBmYWxzZSxcblx0J1NldC1BY2wnOiBmYWxzZSxcblx0anE6IGZhbHNlLFxuXHR4YXJnczogZmFsc2UsXG5cdGV2YWw6IGZhbHNlLFxuXHQnSW52b2tlLUV4cHJlc3Npb24nOiBmYWxzZSxcblx0aWV4OiBmYWxzZSxcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3QixnQ0FBZ0M7QUFDakUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBU3RDLE1BQU0sOEJBQW1ELG9CQUFJLElBQUk7QUFBQSxFQUNoRTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNELENBQUM7QUFPRCxTQUFTLDBCQUEwQixNQUFjLGNBQWlDO0FBQ2pGLE1BQUksVUFBVSxLQUFLLEtBQUs7QUFDeEIsTUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QixXQUFPO0FBQUEsRUFDUjtBQUdBLE1BQUksZ0JBQWdCLFFBQVEsWUFBWSxNQUFNLFNBQVM7QUFDdEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFLLFFBQVEsV0FBVyxHQUFHLEtBQUssUUFBUSxTQUFTLEdBQUcsS0FDbEQsUUFBUSxXQUFXLEdBQUcsS0FBSyxRQUFRLFNBQVMsR0FBRyxHQUFJO0FBQ3BELGNBQVUsUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQzlCO0FBRUEsTUFBSSxjQUFjLEtBQUssT0FBTyxHQUFHO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBR0EsU0FBTyxDQUFDLGdCQUFnQiw0QkFBNEIsSUFBSSxPQUFPO0FBQ2hFO0FBZUEsU0FBUyxxQkFBcUIsY0FBc0IsY0FBb0Q7QUFDdkcsTUFBSSxDQUFDLGFBQWEsU0FBUyxHQUFHLEdBQUc7QUFDaEMsV0FBTyxFQUFFLE1BQU0sT0FBTztBQUFBLEVBQ3ZCO0FBQ0EsUUFBTSxZQUFZLGFBQWEsTUFBTSxnQ0FBZ0M7QUFDckUsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPLEVBQUUsTUFBTSxlQUFlLE1BQU0sT0FBVTtB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
