import { TerminalToolId } from "../../../../chat/common/tools/terminalToolIds.js";
import { parseCommand, segmentHead } from "./terminalCommandParser.js";
var CacheClass = /* @__PURE__ */ ((CacheClass2) => {
  CacheClass2["Fast"] = "fast";
  CacheClass2["Medium"] = "medium";
  CacheClass2["Slow"] = "slow";
  return CacheClass2;
})(CacheClass || {});
const TTL_MS = {
  ["fast" /* Fast */]: 3e4,
  ["medium" /* Medium */]: 12e4,
  ["slow" /* Slow */]: 3e5
};
const MAX_ENTRIES = 256;
function classifyCommand(command) {
  const parsed = parseCommand(command);
  if (!parsed || parsed.segments.length === 0) {
    return { cls: void 0, invalidates: [] };
  }
  if (parsed.segments.length > 1) {
    const allInvalidates = [];
    for (const seg of parsed.segments) {
      const h = segmentHead(seg);
      if (h) {
        const sub = classifySingleHead(h);
        allInvalidates.push(...sub.invalidates);
      }
    }
    return { cls: void 0, invalidates: allInvalidates };
  }
  const head = segmentHead(parsed.segments[0]);
  if (!head) {
    return { cls: void 0, invalidates: [] };
  }
  return classifySingleHead(head);
}
function classifySingleHead(head) {
  switch (head.head) {
    case "git": {
      if (head.sub && /^(add|commit|push|pull|fetch|merge|rebase|reset|checkout|switch|restore|cherry-pick|revert|stash|tag|branch|am|apply|clean|rm|mv)$/.test(head.sub)) {
        return { cls: void 0, invalidates: ["git"] };
      }
      if (head.sub === "status" || head.sub === "diff" || head.sub === "show" || head.sub === "blame") {
        return { cls: "fast" /* Fast */, invalidates: [] };
      }
      if (head.sub === "log" || head.sub === "reflog" || head.sub === "shortlog") {
        return { cls: "slow" /* Slow */, invalidates: [] };
      }
      return { cls: void 0, invalidates: [] };
    }
    case "ls":
    case "pwd":
    case "tree":
    case "find":
      return { cls: head.head === "find" || head.head === "tree" ? "slow" /* Slow */ : "fast" /* Fast */, invalidates: [] };
    case "npm":
    case "pnpm":
    case "yarn":
      if (head.sub === "ls" || head.sub === "list" || head.sub === "outdated") {
        return { cls: "slow" /* Slow */, invalidates: [] };
      }
      if (head.sub === "install" || head.sub === "i" || head.sub === "ci" || head.sub === "add" || head.sub === "remove" || head.sub === "uninstall" || head.sub === "update") {
        return { cls: void 0, invalidates: ["npm", "pnpm", "yarn"] };
      }
      if (head.sub === "test" || head.sub === "run" || head.sub === void 0) {
        return { cls: "medium" /* Medium */, invalidates: [] };
      }
      return { cls: void 0, invalidates: [] };
    case "pytest":
    case "jest":
    case "vitest":
    case "cargo":
      if (head.head === "cargo" && head.sub && /^(test|nextest|check|build)$/.test(head.sub)) {
        return { cls: "medium" /* Medium */, invalidates: [] };
      }
      if (head.head !== "cargo") {
        return { cls: "medium" /* Medium */, invalidates: [] };
      }
      return { cls: void 0, invalidates: [] };
    case "go":
      if (head.sub === "test" || head.sub === "build" || head.sub === "vet") {
        return { cls: "medium" /* Medium */, invalidates: [] };
      }
      return { cls: void 0, invalidates: [] };
    case "docker":
    case "kubectl":
      if (head.sub === "ps" || head.sub === "images" || head.sub === "get" || head.sub === "describe") {
        return { cls: "fast" /* Fast */, invalidates: [] };
      }
      return { cls: void 0, invalidates: [] };
    case "env":
    case "printenv":
      return { cls: "slow" /* Slow */, invalidates: [] };
    case "gh":
      return { cls: "medium" /* Medium */, invalidates: [] };
  }
  return { cls: void 0, invalidates: [] };
}
function getInput(input) {
  if (typeof input !== "object" || input === null) {
    return void 0;
  }
  const i = input;
  if (typeof i.command !== "string" || !i.command.trim()) {
    return void 0;
  }
  const cwd = typeof i.cwd === "string" ? i.cwd : "";
  return { command: i.command, cwd };
}
class TerminalOutputCache {
  constructor(now = () => Date.now()) {
    this.id = "terminal.session-dedup";
    this.toolIds = [TerminalToolId.RunInTerminal];
    this._entries = /* @__PURE__ */ new Map();
    this._now = now;
  }
  _key(cwd, command) {
    return `${cwd}::${command.trim()}`;
  }
  observe(_toolId, input) {
    const parsed = getInput(input);
    if (!parsed) {
      return;
    }
    const { invalidates } = classifyCommand(parsed.command);
    if (invalidates.length === 0) {
      return;
    }
    this._invalidateByProgram(parsed.cwd, invalidates);
  }
  lookup(_toolId, input) {
    const parsed = getInput(input);
    if (!parsed) {
      return void 0;
    }
    const { cls } = classifyCommand(parsed.command);
    if (cls === void 0) {
      return void 0;
    }
    const key = this._key(parsed.cwd, parsed.command);
    const entry = this._entries.get(key);
    if (!entry) {
      return void 0;
    }
    const ttl = TTL_MS[entry.cls];
    if (this._now() - entry.timestamp > ttl) {
      this._entries.delete(key);
      return void 0;
    }
    return { text: entry.text, timestamp: entry.timestamp };
  }
  record(_toolId, input, text) {
    const parsed = getInput(input);
    if (!parsed) {
      return;
    }
    const { cls } = classifyCommand(parsed.command);
    if (cls === void 0) {
      return;
    }
    const key = this._key(parsed.cwd, parsed.command);
    if (this._entries.has(key)) {
      this._entries.delete(key);
    }
    this._entries.set(key, {
      cwd: parsed.cwd,
      command: parsed.command,
      text,
      timestamp: this._now(),
      cls
    });
    while (this._entries.size > MAX_ENTRIES) {
      const oldestKey = this._entries.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._entries.delete(oldestKey);
    }
  }
  /** External hook for editor file-write notifications etc. */
  invalidateCwd(cwd) {
    for (const key of [...this._entries.keys()]) {
      const e = this._entries.get(key);
      if (e.cwd === cwd) {
        this._entries.delete(key);
      }
    }
  }
  _invalidateByProgram(cwd, programs) {
    const progSet = new Set(programs);
    for (const key of [...this._entries.keys()]) {
      const e = this._entries.get(key);
      if (e.cwd !== cwd) {
        continue;
      }
      const head = segmentHead(parseCommand(e.command)?.segments[0] ?? { raw: "", tokens: [], rawTokens: [], envPrefixes: [], wrappers: [], trailingSeparator: void 0 });
      if (head && progSet.has(head.head)) {
        this._entries.delete(key);
      }
    }
  }
}
export {
  CacheClass,
  TerminalOutputCache
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3Rlcm1pbmFsT3V0cHV0Q2FjaGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVG9vbFJlc3VsdENhY2hlLCBJVG9vbFJlc3VsdENhY2hlSGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy90ZXJtaW5hbFRvb2xJZHMuanMnO1xuaW1wb3J0IHsgcGFyc2VDb21tYW5kLCBzZWdtZW50SGVhZCB9IGZyb20gJy4vdGVybWluYWxDb21tYW5kUGFyc2VyLmpzJztcblxuLyoqXG4gKiBTZXNzaW9uLW1lbW9yeSBkZWR1cCBjYWNoZSBmb3IgYHJ1bl9pbl90ZXJtaW5hbGAgb3V0cHV0LiBLZXllZCBvblxuICogYDxjd2Q+Ojo8Y29tbWFuZD5gIChjd2QgY3VycmVudGx5IGJlc3QtZWZmb3J0IFx1MjAxNCBwdWxsZWQgZnJvbSB0aGUgaW5wdXQnc1xuICogYGN3ZGAgZmllbGQgd2hlbiBwcmVzZW50LCBmYWxsaW5nIGJhY2sgdG8gYSBzaW5nbGUgc2hhcmVkIGJ1Y2tldCkuXG4gKlxuICogUmVhZC1vbmx5IGNvbW1hbmQgY2xhc3NlcyAoe0BsaW5rIENhY2hlQ2xhc3N9KSBkZWZpbmUgVFRMczsgb25seVxuICogcmVhZC1vbmx5IGNvbW1hbmRzIGFyZSBzdG9yZWQuIE11dGF0aW9uIGNvbW1hbmRzIHRyaWdnZXJcbiAqIHtAbGluayBfaW52YWxpZGF0ZVNpYmxpbmdzfSB3aGVuIG9ic2VydmVkIHNvIGEgbGF0ZXIgYGdpdCBzdGF0dXNgIHdvbid0XG4gKiByZXR1cm4gYSBzdGFsZSBlbnRyeSBmcm9tIGJlZm9yZSBhIGBnaXQgY29tbWl0YC5cbiAqXG4gKiBEZXNpZ25lZCB0byBsaXZlIGFzIGxvbmcgYXMgdGhlIGNoYXQgc2Vzc2lvbjsgZW50cmllcyBhbHNvIGFnZSBvdXQgYnkgVFRMLlxuICovXG5cbmludGVyZmFjZSBJVGVybWluYWxJbnB1dCB7XG5cdGNvbW1hbmQ/OiB1bmtub3duO1xuXHRjd2Q/OiB1bmtub3duO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDYWNoZUNsYXNzIHtcblx0LyoqIGBnaXQgc3RhdHVzYCwgYGxzYCwgYHB3ZGAgXHUyMDE0IGxpa2VseSB0byBjaGFuZ2UgcXVpY2tseS4gKi9cblx0RmFzdCA9ICdmYXN0Jyxcblx0LyoqIHRlc3QgcnVubmVycy4gKi9cblx0TWVkaXVtID0gJ21lZGl1bScsXG5cdC8qKiBgZ2l0IGxvZ2AsIGBmaW5kYCwgYHRyZWVgLiAqL1xuXHRTbG93ID0gJ3Nsb3cnLFxufVxuXG5jb25zdCBUVExfTVM6IFJlY29yZDxDYWNoZUNsYXNzLCBudW1iZXI+ID0ge1xuXHRbQ2FjaGVDbGFzcy5GYXN0XTogMzBfMDAwLFxuXHRbQ2FjaGVDbGFzcy5NZWRpdW1dOiAxMjBfMDAwLFxuXHRbQ2FjaGVDbGFzcy5TbG93XTogMzAwXzAwMCxcbn07XG5cbmNvbnN0IE1BWF9FTlRSSUVTID0gMjU2O1xuXG5pbnRlcmZhY2UgSUNsYXNzaWZpY2F0aW9uIHtcblx0cmVhZG9ubHkgY2xzOiBDYWNoZUNsYXNzIHwgdW5kZWZpbmVkO1xuXHQvKiogUHJvZ3JhbXMgd2hvc2UgY2FjaGVkIGVudHJpZXMgc2hvdWxkIGJlIGludmFsaWRhdGVkIHdoZW4gdGhpcyBjb21tYW5kIHJ1bnMuICovXG5cdHJlYWRvbmx5IGludmFsaWRhdGVzOiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqIENsYXNzaWZ5IGEgY29tbWFuZCdzIGZpcnN0IHNlZ21lbnQuIGBjbHMgPT09IHVuZGVmaW5lZGAgPT4gZG8gbm90IGNhY2hlLiAqL1xuZnVuY3Rpb24gY2xhc3NpZnlDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDbGFzc2lmaWNhdGlvbiB7XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChjb21tYW5kKTtcblx0aWYgKCFwYXJzZWQgfHwgcGFyc2VkLnNlZ21lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7IGNsczogdW5kZWZpbmVkLCBpbnZhbGlkYXRlczogW10gfTtcblx0fVxuXHQvLyBGb3IgY29tcG91bmQgY29tbWFuZHMgKGUuZy4gYGdpdCBzdGF0dXMgJiYgZ2l0IGNvbW1pdGApLCBkaXNhYmxlIGNhY2hpbmdcblx0Ly8gZW50aXJlbHkgXHUyMDE0IGNsYXNzaWZ5aW5nIG9ubHkgdGhlIGZpcnN0IHNlZ21lbnQgY291bGQgbWlzcyBtdXRhdGlvbnMgb3Jcblx0Ly8gcmV0dXJuIHN0YWxlIHJlc3VsdHMuXG5cdGlmIChwYXJzZWQuc2VnbWVudHMubGVuZ3RoID4gMSkge1xuXHRcdC8vIFN0aWxsIGNoZWNrIGFsbCBzZWdtZW50cyBmb3IgaW52YWxpZGF0aW9uIHRhcmdldHMuXG5cdFx0Y29uc3QgYWxsSW52YWxpZGF0ZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZWcgb2YgcGFyc2VkLnNlZ21lbnRzKSB7XG5cdFx0XHRjb25zdCBoID0gc2VnbWVudEhlYWQoc2VnKTtcblx0XHRcdGlmIChoKSB7XG5cdFx0XHRcdGNvbnN0IHN1YiA9IGNsYXNzaWZ5U2luZ2xlSGVhZChoKTtcblx0XHRcdFx0YWxsSW52YWxpZGF0ZXMucHVzaCguLi5zdWIuaW52YWxpZGF0ZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBjbHM6IHVuZGVmaW5lZCwgaW52YWxpZGF0ZXM6IGFsbEludmFsaWRhdGVzIH07XG5cdH1cblx0Y29uc3QgaGVhZCA9IHNlZ21lbnRIZWFkKHBhcnNlZC5zZWdtZW50c1swXSk7XG5cdGlmICghaGVhZCkge1xuXHRcdHJldHVybiB7IGNsczogdW5kZWZpbmVkLCBpbnZhbGlkYXRlczogW10gfTtcblx0fVxuXHRyZXR1cm4gY2xhc3NpZnlTaW5nbGVIZWFkKGhlYWQpO1xufVxuXG5mdW5jdGlvbiBjbGFzc2lmeVNpbmdsZUhlYWQoaGVhZDogeyBoZWFkOiBzdHJpbmc7IHN1Yjogc3RyaW5nIHwgdW5kZWZpbmVkIH0pOiBJQ2xhc3NpZmljYXRpb24ge1xuXHRzd2l0Y2ggKGhlYWQuaGVhZCkge1xuXHRcdGNhc2UgJ2dpdCc6IHtcblx0XHRcdC8vIE11dGF0aW9ucyBjbGVhciBhbGwgY2FjaGVkIGBnaXQgLi4uYCByZXN1bHRzIGluIHRoaXMgY3dkLlxuXHRcdFx0aWYgKGhlYWQuc3ViICYmIC9eKGFkZHxjb21taXR8cHVzaHxwdWxsfGZldGNofG1lcmdlfHJlYmFzZXxyZXNldHxjaGVja291dHxzd2l0Y2h8cmVzdG9yZXxjaGVycnktcGlja3xyZXZlcnR8c3Rhc2h8dGFnfGJyYW5jaHxhbXxhcHBseXxjbGVhbnxybXxtdikkLy50ZXN0KGhlYWQuc3ViKSkge1xuXHRcdFx0XHRyZXR1cm4geyBjbHM6IHVuZGVmaW5lZCwgaW52YWxpZGF0ZXM6IFsnZ2l0J10gfTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLnN1YiA9PT0gJ3N0YXR1cycgfHwgaGVhZC5zdWIgPT09ICdkaWZmJyB8fCBoZWFkLnN1YiA9PT0gJ3Nob3cnIHx8IGhlYWQuc3ViID09PSAnYmxhbWUnKSB7XG5cdFx0XHRcdHJldHVybiB7IGNsczogQ2FjaGVDbGFzcy5GYXN0LCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRcdH1cblx0XHRcdGlmIChoZWFkLnN1YiA9PT0gJ2xvZycgfHwgaGVhZC5zdWIgPT09ICdyZWZsb2cnIHx8IGhlYWQuc3ViID09PSAnc2hvcnRsb2cnKSB7XG5cdFx0XHRcdHJldHVybiB7IGNsczogQ2FjaGVDbGFzcy5TbG93LCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGNsczogdW5kZWZpbmVkLCBpbnZhbGlkYXRlczogW10gfTtcblx0XHR9XG5cdFx0Y2FzZSAnbHMnOlxuXHRcdGNhc2UgJ3B3ZCc6XG5cdFx0Y2FzZSAndHJlZSc6XG5cdFx0Y2FzZSAnZmluZCc6XG5cdFx0XHRyZXR1cm4geyBjbHM6IGhlYWQuaGVhZCA9PT0gJ2ZpbmQnIHx8IGhlYWQuaGVhZCA9PT0gJ3RyZWUnID8gQ2FjaGVDbGFzcy5TbG93IDogQ2FjaGVDbGFzcy5GYXN0LCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRjYXNlICducG0nOlxuXHRcdGNhc2UgJ3BucG0nOlxuXHRcdGNhc2UgJ3lhcm4nOlxuXHRcdFx0aWYgKGhlYWQuc3ViID09PSAnbHMnIHx8IGhlYWQuc3ViID09PSAnbGlzdCcgfHwgaGVhZC5zdWIgPT09ICdvdXRkYXRlZCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2xzOiBDYWNoZUNsYXNzLlNsb3csIGludmFsaWRhdGVzOiBbXSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuc3ViID09PSAnaW5zdGFsbCcgfHwgaGVhZC5zdWIgPT09ICdpJyB8fCBoZWFkLnN1YiA9PT0gJ2NpJyB8fCBoZWFkLnN1YiA9PT0gJ2FkZCcgfHwgaGVhZC5zdWIgPT09ICdyZW1vdmUnIHx8IGhlYWQuc3ViID09PSAndW5pbnN0YWxsJyB8fCBoZWFkLnN1YiA9PT0gJ3VwZGF0ZScpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2xzOiB1bmRlZmluZWQsIGludmFsaWRhdGVzOiBbJ25wbScsICdwbnBtJywgJ3lhcm4nXSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuc3ViID09PSAndGVzdCcgfHwgaGVhZC5zdWIgPT09ICdydW4nIHx8IGhlYWQuc3ViID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2xzOiBDYWNoZUNsYXNzLk1lZGl1bSwgaW52YWxpZGF0ZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBjbHM6IHVuZGVmaW5lZCwgaW52YWxpZGF0ZXM6IFtdIH07XG5cdFx0Y2FzZSAncHl0ZXN0Jzpcblx0XHRjYXNlICdqZXN0Jzpcblx0XHRjYXNlICd2aXRlc3QnOlxuXHRcdGNhc2UgJ2NhcmdvJzpcblx0XHRcdGlmIChoZWFkLmhlYWQgPT09ICdjYXJnbycgJiYgaGVhZC5zdWIgJiYgL14odGVzdHxuZXh0ZXN0fGNoZWNrfGJ1aWxkKSQvLnRlc3QoaGVhZC5zdWIpKSB7XG5cdFx0XHRcdHJldHVybiB7IGNsczogQ2FjaGVDbGFzcy5NZWRpdW0sIGludmFsaWRhdGVzOiBbXSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWQuaGVhZCAhPT0gJ2NhcmdvJykge1xuXHRcdFx0XHRyZXR1cm4geyBjbHM6IENhY2hlQ2xhc3MuTWVkaXVtLCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGNsczogdW5kZWZpbmVkLCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRjYXNlICdnbyc6XG5cdFx0XHRpZiAoaGVhZC5zdWIgPT09ICd0ZXN0JyB8fCBoZWFkLnN1YiA9PT0gJ2J1aWxkJyB8fCBoZWFkLnN1YiA9PT0gJ3ZldCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2xzOiBDYWNoZUNsYXNzLk1lZGl1bSwgaW52YWxpZGF0ZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBjbHM6IHVuZGVmaW5lZCwgaW52YWxpZGF0ZXM6IFtdIH07XG5cdFx0Y2FzZSAnZG9ja2VyJzpcblx0XHRjYXNlICdrdWJlY3RsJzpcblx0XHRcdGlmIChoZWFkLnN1YiA9PT0gJ3BzJyB8fCBoZWFkLnN1YiA9PT0gJ2ltYWdlcycgfHwgaGVhZC5zdWIgPT09ICdnZXQnIHx8IGhlYWQuc3ViID09PSAnZGVzY3JpYmUnKSB7XG5cdFx0XHRcdHJldHVybiB7IGNsczogQ2FjaGVDbGFzcy5GYXN0LCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGNsczogdW5kZWZpbmVkLCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRjYXNlICdlbnYnOlxuXHRcdGNhc2UgJ3ByaW50ZW52Jzpcblx0XHRcdHJldHVybiB7IGNsczogQ2FjaGVDbGFzcy5TbG93LCBpbnZhbGlkYXRlczogW10gfTtcblx0XHRjYXNlICdnaCc6XG5cdFx0XHRyZXR1cm4geyBjbHM6IENhY2hlQ2xhc3MuTWVkaXVtLCBpbnZhbGlkYXRlczogW10gfTtcblx0fVxuXHRyZXR1cm4geyBjbHM6IHVuZGVmaW5lZCwgaW52YWxpZGF0ZXM6IFtdIH07XG59XG5cbmludGVyZmFjZSBJQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IGN3ZDogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNsczogQ2FjaGVDbGFzcztcbn1cblxuZnVuY3Rpb24gZ2V0SW5wdXQoaW5wdXQ6IHVua25vd24pOiB7IGNvbW1hbmQ6IHN0cmluZzsgY3dkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnIHx8IGlucHV0ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBpID0gaW5wdXQgYXMgSVRlcm1pbmFsSW5wdXQ7XG5cdGlmICh0eXBlb2YgaS5jb21tYW5kICE9PSAnc3RyaW5nJyB8fCAhaS5jb21tYW5kLnRyaW0oKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY3dkID0gdHlwZW9mIGkuY3dkID09PSAnc3RyaW5nJyA/IGkuY3dkIDogJyc7XG5cdHJldHVybiB7IGNvbW1hbmQ6IGkuY29tbWFuZCwgY3dkIH07XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbE91dHB1dENhY2hlIGltcGxlbWVudHMgSVRvb2xSZXN1bHRDYWNoZSB7XG5cdHJlYWRvbmx5IGlkID0gJ3Rlcm1pbmFsLnNlc3Npb24tZGVkdXAnO1xuXHRyZWFkb25seSB0b29sSWRzID0gW1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWxdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSUNhY2hlRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdzogKCkgPT4gbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKG5vdzogKCkgPT4gbnVtYmVyID0gKCkgPT4gRGF0ZS5ub3coKSkge1xuXHRcdHRoaXMuX25vdyA9IG5vdztcblx0fVxuXG5cdHByaXZhdGUgX2tleShjd2Q6IHN0cmluZywgY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7Y3dkfTo6JHtjb21tYW5kLnRyaW0oKX1gO1xuXHR9XG5cblx0b2JzZXJ2ZShfdG9vbElkOiBzdHJpbmcsIGlucHV0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFyc2VkID0gZ2V0SW5wdXQoaW5wdXQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgaW52YWxpZGF0ZXMgfSA9IGNsYXNzaWZ5Q29tbWFuZChwYXJzZWQuY29tbWFuZCk7XG5cdFx0aWYgKGludmFsaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pbnZhbGlkYXRlQnlQcm9ncmFtKHBhcnNlZC5jd2QsIGludmFsaWRhdGVzKTtcblx0fVxuXG5cdGxvb2t1cChfdG9vbElkOiBzdHJpbmcsIGlucHV0OiB1bmtub3duKTogSVRvb2xSZXN1bHRDYWNoZUhpdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFyc2VkID0gZ2V0SW5wdXQoaW5wdXQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IGNscyB9ID0gY2xhc3NpZnlDb21tYW5kKHBhcnNlZC5jb21tYW5kKTtcblx0XHRpZiAoY2xzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShwYXJzZWQuY3dkLCBwYXJzZWQuY29tbWFuZCk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHR0bCA9IFRUTF9NU1tlbnRyeS5jbHNdO1xuXHRcdGlmICh0aGlzLl9ub3coKSAtIGVudHJ5LnRpbWVzdGFtcCA+IHR0bCkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoa2V5KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHRleHQ6IGVudHJ5LnRleHQsIHRpbWVzdGFtcDogZW50cnkudGltZXN0YW1wIH07XG5cdH1cblxuXHRyZWNvcmQoX3Rvb2xJZDogc3RyaW5nLCBpbnB1dDogdW5rbm93biwgdGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFyc2VkID0gZ2V0SW5wdXQoaW5wdXQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgY2xzIH0gPSBjbGFzc2lmeUNvbW1hbmQocGFyc2VkLmNvbW1hbmQpO1xuXHRcdGlmIChjbHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkocGFyc2VkLmN3ZCwgcGFyc2VkLmNvbW1hbmQpO1xuXHRcdC8vIExSVS1pc2g6IHJlLWluc2VydCBhdCB0aGUgZW5kIHRvIGJ1bXAgcmVjZW5jeS5cblx0XHRpZiAodGhpcy5fZW50cmllcy5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCB7XG5cdFx0XHRjd2Q6IHBhcnNlZC5jd2QsXG5cdFx0XHRjb21tYW5kOiBwYXJzZWQuY29tbWFuZCxcblx0XHRcdHRleHQsXG5cdFx0XHR0aW1lc3RhbXA6IHRoaXMuX25vdygpLFxuXHRcdFx0Y2xzLFxuXHRcdH0pO1xuXHRcdHdoaWxlICh0aGlzLl9lbnRyaWVzLnNpemUgPiBNQVhfRU5UUklFUykge1xuXHRcdFx0Y29uc3Qgb2xkZXN0S2V5ID0gdGhpcy5fZW50cmllcy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdEtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUob2xkZXN0S2V5KTtcblx0XHR9XG5cdH1cblxuXHQvKiogRXh0ZXJuYWwgaG9vayBmb3IgZWRpdG9yIGZpbGUtd3JpdGUgbm90aWZpY2F0aW9ucyBldGMuICovXG5cdGludmFsaWRhdGVDd2QoY3dkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy5fZW50cmllcy5rZXlzKCldKSB7XG5cdFx0XHRjb25zdCBlID0gdGhpcy5fZW50cmllcy5nZXQoa2V5KSE7XG5cdFx0XHRpZiAoZS5jd2QgPT09IGN3ZCkge1xuXHRcdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ludmFsaWRhdGVCeVByb2dyYW0oY3dkOiBzdHJpbmcsIHByb2dyYW1zOiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb2dTZXQgPSBuZXcgU2V0KHByb2dyYW1zKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBbLi4udGhpcy5fZW50cmllcy5rZXlzKCldKSB7XG5cdFx0XHRjb25zdCBlID0gdGhpcy5fZW50cmllcy5nZXQoa2V5KSE7XG5cdFx0XHRpZiAoZS5jd2QgIT09IGN3ZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhlYWQgPSBzZWdtZW50SGVhZChwYXJzZUNvbW1hbmQoZS5jb21tYW5kKT8uc2VnbWVudHNbMF0gPz8geyByYXc6ICcnLCB0b2tlbnM6IFtdLCByYXdUb2tlbnM6IFtdLCBlbnZQcmVmaXhlczogW10sIHdyYXBwZXJzOiBbXSwgdHJhaWxpbmdTZXBhcmF0b3I6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGlmIChoZWFkICYmIHByb2dTZXQuaGFzKGhlYWQuaGVhZCkpIHtcblx0XHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxtQkFBbUI7QUFvQm5DLElBQVcsYUFBWCxrQkFBV0EsZ0JBQVg7QUFFTixFQUFBQSxZQUFBLFVBQU87QUFFUCxFQUFBQSxZQUFBLFlBQVM7QUFFVCxFQUFBQSxZQUFBLFVBQU87QUFOVSxTQUFBQTtBQUFBLEdBQUE7QUFTbEIsTUFBTSxTQUFxQztBQUFBLEVBQzFDLENBQUMsaUJBQWUsR0FBRztBQUFBLEVBQ25CLENBQUMscUJBQWlCLEdBQUc7QUFBQSxFQUNyQixDQUFDLGlCQUFlLEdBQUc7QUFDcEI7QUFFQSxNQUFN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
