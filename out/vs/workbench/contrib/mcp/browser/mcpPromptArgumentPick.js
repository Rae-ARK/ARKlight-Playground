var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { assertNever } from "../../../../base/common/assert.js";
import { disposableTimeout, RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, ObservablePromise, observableSignalFromEvent, observableValue } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { ISearchService } from "../../../services/search/common/search.js";
import { ITerminalGroupService, ITerminalService } from "../../terminal/browser/terminal.js";
const SHELL_INTEGRATION_TIMEOUT = 5e3;
const NO_SHELL_INTEGRATION_IDLE = 1e3;
const SUGGEST_DEBOUNCE = 200;
let McpPromptArgumentPick = class extends Disposable {
  constructor(prompt, _quickInputService, _terminalService, _searchService, _workspaceContextService, _labelService, _fileService, _modelService, _languageService, _terminalGroupService, _instantiationService, _codeEditorService, _editorService) {
    super();
    this.prompt = prompt;
    this._quickInputService = _quickInputService;
    this._terminalService = _terminalService;
    this._searchService = _searchService;
    this._workspaceContextService = _workspaceContextService;
    this._labelService = _labelService;
    this._fileService = _fileService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._terminalGroupService = _terminalGroupService;
    this._instantiationService = _instantiationService;
    this._codeEditorService = _codeEditorService;
    this._editorService = _editorService;
    this.quickPick = this._register(_quickInputService.createQuickPick({ useSeparators: true }));
  }
  async createArgs(token) {
    const { quickPick, prompt } = this;
    quickPick.totalSteps = prompt.arguments.length;
    quickPick.step = 0;
    quickPick.ignoreFocusOut = true;
    quickPick.sortByLabel = false;
    const args = {};
    const backSnapshots = [];
    for (let i = 0; i < prompt.arguments.length; i++) {
      const arg = prompt.arguments[i];
      const restore = backSnapshots.at(i);
      quickPick.step = i + 1;
      quickPick.placeholder = arg.required ? arg.description : `${arg.description || ""} (${localize("optional", "Optional")})`;
      quickPick.title = localize("mcp.prompt.pick.title", "Value for: {0}", arg.title || arg.name);
      quickPick.value = restore?.value ?? (args.hasOwnProperty(arg.name) && args[arg.name] || "");
      quickPick.items = restore?.items ?? [];
      quickPick.activeItems = restore?.activeItems ?? [];
      quickPick.buttons = i > 0 ? [this._quickInputService.backButton] : [];
      const value = await this._getArg(arg, !!restore, args, token);
      if (value.type === "back") {
        i -= 2;
      } else if (value.type === "cancel") {
        return void 0;
      } else if (value.type === "arg") {
        backSnapshots[i] = { value: quickPick.value, items: quickPick.items.slice(), activeItems: quickPick.activeItems.slice() };
        args[arg.name] = value.value;
      } else {
        assertNever(value);
      }
    }
    quickPick.value = "";
    quickPick.placeholder = localize("loading", "Loading...");
    quickPick.busy = true;
    return args;
  }
  async _getArg(arg, didRestoreState, argsSoFar, token) {
    const { quickPick } = this;
    const store = new DisposableStore();
    const input$ = observableValue(this, quickPick.value);
    const asyncPicks = [
      {
        name: localize("mcp.arg.suggestions", "Suggestions"),
        observer: this._promptCompletions(arg, input$, argsSoFar)
      },
      {
        name: localize("mcp.arg.activeFiles", "Active File"),
        observer: this._activeFileCompletions()
      },
      {
        name: localize("mcp.arg.files", "Files"),
        observer: this._fileCompletions(input$)
      }
    ];
    store.add(autorun((reader) => {
      if (didRestoreState) {
        input$.read(reader);
        return;
      }
      let items = [];
      items.push({ id: "insert-text", label: localize("mcp.arg.asText", "Insert as text"), iconClass: ThemeIcon.asClassName(Codicon.textSize), action: "text", alwaysShow: true });
      items.push({ id: "run-command", label: localize("mcp.arg.asCommand", "Run as Command"), description: localize("mcp.arg.asCommand.description", "Inserts the command output as the prompt argument"), iconClass: ThemeIcon.asClassName(Codicon.terminal), action: "command", alwaysShow: true });
      let busy = false;
      for (const pick of asyncPicks) {
        const state = pick.observer.read(reader);
        busy ||= state.busy;
        if (state.picks) {
          items.push({ label: pick.name, type: "separator" });
          items = items.concat(state.picks);
        }
      }
      const previouslyActive = quickPick.activeItems;
      quickPick.busy = busy;
      quickPick.items = items;
      const lastActive = items.find((i) => previouslyActive.some((a) => a.id === i.id));
      const serverSuggestions = asyncPicks[0].observer;
      if (lastActive) {
        quickPick.activeItems = [lastActive];
      } else if (serverSuggestions.read(reader).picks?.length) {
        quickPick.activeItems = [items[3]];
      } else if (busy) {
        quickPick.activeItems = [];
      } else {
        quickPick.activeItems = [items[0]];
      }
    }));
    try {
      const value = await new Promise((resolve) => {
        if (token) {
          store.add(token.onCancellationRequested(() => {
            resolve(void 0);
          }));
        }
        store.add(quickPick.onDidChangeValue((value2) => {
          quickPick.validationMessage = void 0;
          input$.set(value2, void 0);
        }));
        store.add(quickPick.onDidAccept(() => {
          const item = quickPick.selectedItems[0];
          if (!quickPick.value && arg.required && (!item || item.action === "text" || item.action === "command")) {
            quickPick.validationMessage = localize("mcp.arg.required", "This argument is required");
          } else if (!item) {
            resolve({ id: "insert-text", label: "", action: "text" });
          } else {
            resolve(item);
          }
        }));
        store.add(quickPick.onDidTriggerButton(() => {
          resolve("back");
        }));
        store.add(quickPick.onDidHide(() => {
          resolve(void 0);
        }));
        quickPick.show();
      });
      if (value === "back") {
        return { type: "back" };
      }
      if (value === void 0) {
        return { type: "cancel" };
      }
      store.clear();
      const cts = new CancellationTokenSource();
      store.add(toDisposable(() => cts.dispose(true)));
      store.add(quickPick.onDidHide(() => store.dispose()));
      switch (value.action) {
        case "text":
          return { type: "arg", value: quickPick.value || void 0 };
        case "command":
          if (!quickPick.value) {
            return { type: "arg", value: void 0 };
          }
          quickPick.busy = true;
          return { type: "arg", value: await this._getTerminalOutput(quickPick.value, cts.token) };
        case "suggest":
          return { type: "arg", value: value.label };
        case "file":
          quickPick.busy = true;
          return { type: "arg", value: await this._fileService.readFile(value.uri).then((c) => c.value.toString()) };
        case "selectedText":
          return { type: "arg", value: value.selectedText };
        default:
          assertNever(value);
      }
    } finally {
      store.dispose();
    }
  }
  _promptCompletions(arg, input, argsSoFar) {
    const alreadyResolved = {};
    for (const [key, value] of Object.entries(argsSoFar)) {
      if (value) {
        alreadyResolved[key] = value;
      }
    }
    return this._asyncCompletions(input, async (i, t) => {
      const items = await this.prompt.complete(arg.name, i, alreadyResolved, t);
      return items.map((i2) => ({ id: `suggest:${i2}`, label: i2, action: "suggest" }));
    });
  }
  _fileCompletions(input) {
    const qb = this._instantiationService.createInstance(QueryBuilder);
    return this._asyncCompletions(input, async (i, token) => {
      if (!i) {
        return [];
      }
      const query = qb.file(this._workspaceContextService.getWorkspace().folders, {
        filePattern: i,
        maxResults: 10
      });
      const { results } = await this._searchService.fileSearch(query, token);
      return results.map((i2) => ({
        id: i2.resource.toString(),
        label: basename(i2.resource),
        description: this._labelService.getUriLabel(i2.resource),
        iconClasses: getIconClasses(this._modelService, this._languageService, i2.resource),
        uri: i2.resource,
        action: "file"
      }));
    });
  }
  _activeFileCompletions() {
    const activeEditorChange = observableSignalFromEvent(this, this._editorService.onDidActiveEditorChange);
    const activeEditor = derived((reader) => {
      activeEditorChange.read(reader);
      return this._codeEditorService.getActiveCodeEditor();
    });
    const resourceObs = activeEditor.map((e) => e ? observableSignalFromEvent(this, e.onDidChangeModel).map(() => e.getModel()?.uri) : void 0).map((o, reader) => o?.read(reader));
    const selectionObs = activeEditor.map((e) => e ? observableSignalFromEvent(this, e.onDidChangeCursorSelection).map(() => ({ range: e.getSelection(), model: e.getModel() })) : void 0).map((o, reader) => o?.read(reader));
    return derived((reader) => {
      const resource = resourceObs.read(reader);
      if (!resource) {
        return { busy: false, picks: [] };
      }
      const items = [];
      items.push({
        id: "active-file",
        label: localize("mcp.arg.activeFile", "Active File"),
        description: this._labelService.getUriLabel(resource),
        iconClasses: getIconClasses(this._modelService, this._languageService, resource),
        uri: resource,
        action: "file"
      });
      const selection = selectionObs.read(reader);
      if (selection && selection.model && selection.range && !selection.range.isEmpty()) {
        const selectedText = selection.model.getValueInRange(selection.range);
        const lineCount = selection.range.endLineNumber - selection.range.startLineNumber + 1;
        const description = lineCount === 1 ? localize("mcp.arg.selectedText.singleLine", "line {0}", selection.range.startLineNumber) : localize("mcp.arg.selectedText.multiLine", "{0} lines", lineCount);
        items.push({
          id: "selected-text",
          label: localize("mcp.arg.selectedText", "Selected Text"),
          description,
          selectedText,
          iconClass: ThemeIcon.asClassName(Codicon.selection),
          uri: resource,
          action: "selectedText"
        });
      }
      return { picks: items, busy: false };
    });
  }
  _asyncCompletions(input, mapper) {
    const promise = derived((reader) => {
      const queryValue = input.read(reader);
      const cts = new CancellationTokenSource();
      reader.store.add(toDisposable(() => cts.dispose(true)));
      return new ObservablePromise(
        timeout(SUGGEST_DEBOUNCE, cts.token).then(() => mapper(queryValue, cts.token)).catch(() => [])
      );
    });
    return promise.map((value, reader) => {
      const result = value.promiseResult.read(reader);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async _getTerminalOutput(command, token) {
    const terminal = this._terminal ??= this._register(await this._terminalService.createTerminal({
      config: {
        name: localize("mcp.terminal.name", "MCP Terminal"),
        isTransient: true,
        forceShellIntegration: true,
        isFeatureTerminal: true
      },
      location: TerminalLocation.Panel
    }));
    this._terminalService.setActiveInstance(terminal);
    this._terminalGroupService.showPanel(false);
    const shellIntegration = terminal.capabilities.get(TerminalCapability.CommandDetection);
    if (shellIntegration) {
      return this._getTerminalOutputInner(terminal, command, shellIntegration, token);
    }
    const store = new DisposableStore();
    return await new Promise((resolve) => {
      store.add(terminal.capabilities.onDidAddCapability((e) => {
        if (e.id === TerminalCapability.CommandDetection) {
          store.dispose();
          resolve(this._getTerminalOutputInner(terminal, command, e.capability, token));
        }
      }));
      store.add(token.onCancellationRequested(() => {
        store.dispose();
        resolve(void 0);
      }));
      store.add(disposableTimeout(() => {
        store.dispose();
        resolve(this._getTerminalOutputInner(terminal, command, void 0, token));
      }, SHELL_INTEGRATION_TIMEOUT));
    });
  }
  async _getTerminalOutputInner(terminal, command, shellIntegration, token) {
    const store = new DisposableStore();
    return new Promise((resolve) => {
      let allData = "";
      store.add(terminal.onLineData((d) => allData += d + "\n"));
      if (shellIntegration) {
        store.add(shellIntegration.onCommandFinished((e) => resolve(e.getOutput() || allData)));
      } else {
        const done = store.add(new RunOnceScheduler(() => resolve(allData), NO_SHELL_INTEGRATION_IDLE));
        store.add(terminal.onData(() => done.schedule()));
      }
      store.add(token.onCancellationRequested(() => resolve(void 0)));
      store.add(terminal.onDisposed(() => resolve(void 0)));
      terminal.runCommand(command, true);
    }).finally(() => {
      store.dispose();
    });
  }
};
McpPromptArgumentPick = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, ISearchService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ICodeEditorService),
  __decorateParam(12, IEditorService)
], McpPromptArgumentPick);
export {
  McpPromptArgumentPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFByb21wdEFyZ3VtZW50UGljay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgT2JzZXJ2YWJsZVByb21pc2UsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFF1ZXJ5QnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vcXVlcnlCdWlsZGVyLmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSU1jcFByb21wdCB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuLi9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG50eXBlIFBpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiAoXG5cdHwgeyBhY3Rpb246ICd0ZXh0JyB8ICdjb21tYW5kJyB8ICdzdWdnZXN0JyB9XG5cdHwgeyBhY3Rpb246ICdmaWxlJzsgdXJpOiBVUkkgfVxuXHR8IHsgYWN0aW9uOiAnc2VsZWN0ZWRUZXh0JzsgdXJpOiBVUkk7IHNlbGVjdGVkVGV4dDogc3RyaW5nIH1cbik7XG5cbmNvbnN0IFNIRUxMX0lOVEVHUkFUSU9OX1RJTUVPVVQgPSA1MDAwO1xuY29uc3QgTk9fU0hFTExfSU5URUdSQVRJT05fSURMRSA9IDEwMDA7XG5jb25zdCBTVUdHRVNUX0RFQk9VTkNFID0gMjAwO1xuXG50eXBlIEFjdGlvbiA9IHsgdHlwZTogJ2FyZyc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHsgdHlwZTogJ2JhY2snIH0gfCB7IHR5cGU6ICdjYW5jZWwnIH07XG5cbmV4cG9ydCBjbGFzcyBNY3BQcm9tcHRBcmd1bWVudFBpY2sgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBxdWlja1BpY2s6IElRdWlja1BpY2s8UGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pjtcblx0cHJpdmF0ZSBfdGVybWluYWw/OiBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb21wdDogSU1jcFByb21wdCxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnF1aWNrUGljayA9IHRoaXMuX3JlZ2lzdGVyKF9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjcmVhdGVBcmdzKHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IHF1aWNrUGljaywgcHJvbXB0IH0gPSB0aGlzO1xuXG5cdFx0cXVpY2tQaWNrLnRvdGFsU3RlcHMgPSBwcm9tcHQuYXJndW1lbnRzLmxlbmd0aDtcblx0XHRxdWlja1BpY2suc3RlcCA9IDA7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2suc29ydEJ5TGFiZWwgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGFyZ3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gPSB7fTtcblx0XHRjb25zdCBiYWNrU25hcHNob3RzOiB7IHZhbHVlOiBzdHJpbmc7IGl0ZW1zOiByZWFkb25seSAoUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdOyBhY3RpdmVJdGVtczogcmVhZG9ubHkgUGlja0l0ZW1bXSB9W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByb21wdC5hcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGFyZyA9IHByb21wdC5hcmd1bWVudHNbaV07XG5cdFx0XHRjb25zdCByZXN0b3JlID0gYmFja1NuYXBzaG90cy5hdChpKTtcblx0XHRcdHF1aWNrUGljay5zdGVwID0gaSArIDE7XG5cdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBhcmcucmVxdWlyZWQgPyBhcmcuZGVzY3JpcHRpb24gOiBgJHthcmcuZGVzY3JpcHRpb24gfHwgJyd9ICgke2xvY2FsaXplKCdvcHRpb25hbCcsICdPcHRpb25hbCcpfSlgO1xuXHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ21jcC5wcm9tcHQucGljay50aXRsZScsICdWYWx1ZSBmb3I6IHswfScsIGFyZy50aXRsZSB8fCBhcmcubmFtZSk7XG5cdFx0XHRxdWlja1BpY2sudmFsdWUgPSByZXN0b3JlPy52YWx1ZSA/PyAoKGFyZ3MuaGFzT3duUHJvcGVydHkoYXJnLm5hbWUpICYmIGFyZ3NbYXJnLm5hbWVdKSB8fCAnJyk7XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSByZXN0b3JlPy5pdGVtcyA/PyBbXTtcblx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IHJlc3RvcmU/LmFjdGl2ZUl0ZW1zID8/IFtdO1xuXHRcdFx0cXVpY2tQaWNrLmJ1dHRvbnMgPSBpID4gMCA/IFt0aGlzLl9xdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uXSA6IFtdO1xuXG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX2dldEFyZyhhcmcsICEhcmVzdG9yZSwgYXJncywgdG9rZW4pO1xuXHRcdFx0aWYgKHZhbHVlLnR5cGUgPT09ICdiYWNrJykge1xuXHRcdFx0XHRpIC09IDI7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLnR5cGUgPT09ICdhcmcnKSB7XG5cdFx0XHRcdGJhY2tTbmFwc2hvdHNbaV0gPSB7IHZhbHVlOiBxdWlja1BpY2sudmFsdWUsIGl0ZW1zOiBxdWlja1BpY2suaXRlbXMuc2xpY2UoKSwgYWN0aXZlSXRlbXM6IHF1aWNrUGljay5hY3RpdmVJdGVtcy5zbGljZSgpIH07XG5cdFx0XHRcdGFyZ3NbYXJnLm5hbWVdID0gdmFsdWUudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnROZXZlcih2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cXVpY2tQaWNrLnZhbHVlID0gJyc7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2xvYWRpbmcnLCAnTG9hZGluZy4uLicpO1xuXHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblxuXHRcdHJldHVybiBhcmdzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0QXJnKGFyZzogTUNQLlByb21wdEFyZ3VtZW50LCBkaWRSZXN0b3JlU3RhdGU6IGJvb2xlYW4sIGFyZ3NTb0ZhcjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QWN0aW9uPiB7XG5cdFx0Y29uc3QgeyBxdWlja1BpY2sgfSA9IHRoaXM7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBpbnB1dCQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgcXVpY2tQaWNrLnZhbHVlKTtcblx0XHRjb25zdCBhc3luY1BpY2tzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbWNwLmFyZy5zdWdnZXN0aW9ucycsICdTdWdnZXN0aW9ucycpLFxuXHRcdFx0XHRvYnNlcnZlcjogdGhpcy5fcHJvbXB0Q29tcGxldGlvbnMoYXJnLCBpbnB1dCQsIGFyZ3NTb0ZhciksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbWNwLmFyZy5hY3RpdmVGaWxlcycsICdBY3RpdmUgRmlsZScpLFxuXHRcdFx0XHRvYnNlcnZlcjogdGhpcy5fYWN0aXZlRmlsZUNvbXBsZXRpb25zKCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbWNwLmFyZy5maWxlcycsICdGaWxlcycpLFxuXHRcdFx0XHRvYnNlcnZlcjogdGhpcy5fZmlsZUNvbXBsZXRpb25zKGlucHV0JCksXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoZGlkUmVzdG9yZVN0YXRlKSB7XG5cdFx0XHRcdGlucHV0JC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybjsgLy8gZG9uJ3Qgb3ZlcndyaXRlIGluaXRpYWwgaXRlbXMgdW50aWwgdGhlIHVzZXIgdHlwZXNcblx0XHRcdH1cblxuXHRcdFx0bGV0IGl0ZW1zOiAoUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0XHRpdGVtcy5wdXNoKHsgaWQ6ICdpbnNlcnQtdGV4dCcsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFyZy5hc1RleHQnLCAnSW5zZXJ0IGFzIHRleHQnKSwgaWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50ZXh0U2l6ZSksIGFjdGlvbjogJ3RleHQnLCBhbHdheXNTaG93OiB0cnVlIH0pO1xuXHRcdFx0aXRlbXMucHVzaCh7IGlkOiAncnVuLWNvbW1hbmQnLCBsYWJlbDogbG9jYWxpemUoJ21jcC5hcmcuYXNDb21tYW5kJywgJ1J1biBhcyBDb21tYW5kJyksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLmFyZy5hc0NvbW1hbmQuZGVzY3JpcHRpb24nLCAnSW5zZXJ0cyB0aGUgY29tbWFuZCBvdXRwdXQgYXMgdGhlIHByb21wdCBhcmd1bWVudCcpLCBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRlcm1pbmFsKSwgYWN0aW9uOiAnY29tbWFuZCcsIGFsd2F5c1Nob3c6IHRydWUgfSk7XG5cblx0XHRcdGxldCBidXN5ID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHBpY2sgb2YgYXN5bmNQaWNrcykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHBpY2sub2JzZXJ2ZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRidXN5IHx8PSBzdGF0ZS5idXN5O1xuXHRcdFx0XHRpZiAoc3RhdGUucGlja3MpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IHBpY2submFtZSwgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRcdFx0aXRlbXMgPSBpdGVtcy5jb25jYXQoc3RhdGUucGlja3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZXZpb3VzbHlBY3RpdmUgPSBxdWlja1BpY2suYWN0aXZlSXRlbXM7XG5cdFx0XHRxdWlja1BpY2suYnVzeSA9IGJ1c3k7XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblxuXHRcdFx0Y29uc3QgbGFzdEFjdGl2ZSA9IGl0ZW1zLmZpbmQoaSA9PiBwcmV2aW91c2x5QWN0aXZlLnNvbWUoYSA9PiBhLmlkID09PSBpLmlkKSkgYXMgUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzZXJ2ZXJTdWdnZXN0aW9ucyA9IGFzeW5jUGlja3NbMF0ub2JzZXJ2ZXI7XG5cdFx0XHQvLyBLZWVwIGFueSBzZWxlY3Rpb24gc3RhdGUsIGJ1dCBvdGhlcndpc2Ugc2VsZWN0IHRoZSBmaXJzdCBjb21wbGV0aW9uIGl0ZW0sIGFuZCBhdm9pZCBkZWZhdWx0LXNlbGVjdGluZyB0aGUgdG9wIGl0ZW0gdW5sZXNzIHRoZXJlIGFyZSBubyBjb21wbHRpb25zXG5cdFx0XHRpZiAobGFzdEFjdGl2ZSkge1xuXHRcdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBbbGFzdEFjdGl2ZV07XG5cdFx0XHR9IGVsc2UgaWYgKHNlcnZlclN1Z2dlc3Rpb25zLnJlYWQocmVhZGVyKS5waWNrcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IFtpdGVtc1szXSBhcyBQaWNrSXRlbV07XG5cdFx0XHR9IGVsc2UgaWYgKGJ1c3kpIHtcblx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gW107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWlja1BpY2suYWN0aXZlSXRlbXMgPSBbaXRlbXNbMF0gYXMgUGlja0l0ZW1dO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IG5ldyBQcm9taXNlPFBpY2tJdGVtIHwgJ2JhY2snIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0XHRxdWlja1BpY2sudmFsaWRhdGlvbk1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aW5wdXQkLnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdFx0aWYgKCFxdWlja1BpY2sudmFsdWUgJiYgYXJnLnJlcXVpcmVkICYmICghaXRlbSB8fCBpdGVtLmFjdGlvbiA9PT0gJ3RleHQnIHx8IGl0ZW0uYWN0aW9uID09PSAnY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2sudmFsaWRhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnbWNwLmFyZy5yZXF1aXJlZCcsIFwiVGhpcyBhcmd1bWVudCBpcyByZXF1aXJlZFwiKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFpdGVtKSB7XG5cdFx0XHRcdFx0XHQvLyBGb3Igb3B0aW9uYWwgYXJndW1lbnRzIHdoZW4gbm8gaXRlbSBpcyBzZWxlY3RlZCwgcmV0dXJuIGVtcHR5IHRleHQgYWN0aW9uXG5cdFx0XHRcdFx0XHRyZXNvbHZlKHsgaWQ6ICdpbnNlcnQtdGV4dCcsIGxhYmVsOiAnJywgYWN0aW9uOiAndGV4dCcgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VyQnV0dG9uKCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKCdiYWNrJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh2YWx1ZSA9PT0gJ2JhY2snKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICdiYWNrJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnY2FuY2VsJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5jbGVhcigpO1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpKTtcblxuXHRcdFx0c3dpdGNoICh2YWx1ZS5hY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2FyZycsIHZhbHVlOiBxdWlja1BpY2sudmFsdWUgfHwgdW5kZWZpbmVkIH07XG5cdFx0XHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0XHRcdGlmICghcXVpY2tQaWNrLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXJnJywgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2FyZycsIHZhbHVlOiBhd2FpdCB0aGlzLl9nZXRUZXJtaW5hbE91dHB1dChxdWlja1BpY2sudmFsdWUsIGN0cy50b2tlbikgfTtcblx0XHRcdFx0Y2FzZSAnc3VnZ2VzdCc6XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2FyZycsIHZhbHVlOiB2YWx1ZS5sYWJlbCB9O1xuXHRcdFx0XHRjYXNlICdmaWxlJzpcblx0XHRcdFx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2FyZycsIHZhbHVlOiBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh2YWx1ZS51cmkpLnRoZW4oYyA9PiBjLnZhbHVlLnRvU3RyaW5nKCkpIH07XG5cdFx0XHRcdGNhc2UgJ3NlbGVjdGVkVGV4dCc6XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2FyZycsIHZhbHVlOiB2YWx1ZS5zZWxlY3RlZFRleHQgfTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRhc3NlcnROZXZlcih2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wcm9tcHRDb21wbGV0aW9ucyhhcmc6IE1DUC5Qcm9tcHRBcmd1bWVudCwgaW5wdXQ6IElPYnNlcnZhYmxlPHN0cmluZz4sIGFyZ3NTb0ZhcjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPikge1xuXHRcdGNvbnN0IGFscmVhZHlSZXNvbHZlZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFyZ3NTb0ZhcikpIHtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRhbHJlYWR5UmVzb2x2ZWRba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hc3luY0NvbXBsZXRpb25zKGlucHV0LCBhc3luYyAoaSwgdCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLnByb21wdC5jb21wbGV0ZShhcmcubmFtZSwgaSwgYWxyZWFkeVJlc29sdmVkLCB0KTtcblx0XHRcdHJldHVybiBpdGVtcy5tYXAoKGkpOiBQaWNrSXRlbSA9PiAoeyBpZDogYHN1Z2dlc3Q6JHtpfWAsIGxhYmVsOiBpLCBhY3Rpb246ICdzdWdnZXN0JyB9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9maWxlQ29tcGxldGlvbnMoaW5wdXQ6IElPYnNlcnZhYmxlPHN0cmluZz4pIHtcblx0XHRjb25zdCBxYiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1ZXJ5QnVpbGRlcik7XG5cdFx0cmV0dXJuIHRoaXMuX2FzeW5jQ29tcGxldGlvbnMoaW5wdXQsIGFzeW5jIChpLCB0b2tlbikgPT4ge1xuXHRcdFx0aWYgKCFpKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlcnkgPSBxYi5maWxlKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMsIHtcblx0XHRcdFx0ZmlsZVBhdHRlcm46IGksXG5cdFx0XHRcdG1heFJlc3VsdHM6IDEwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgdGhpcy5fc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKHF1ZXJ5LCB0b2tlbik7XG5cblx0XHRcdHJldHVybiByZXN1bHRzLm1hcCgoaSk6IFBpY2tJdGVtID0+ICh7XG5cdFx0XHRcdGlkOiBpLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBiYXNlbmFtZShpLnJlc291cmNlKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpLnJlc291cmNlKSxcblx0XHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzKHRoaXMuX21vZGVsU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCBpLnJlc291cmNlKSxcblx0XHRcdFx0dXJpOiBpLnJlc291cmNlLFxuXHRcdFx0XHRhY3Rpb246ICdmaWxlJyxcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZUZpbGVDb21wbGV0aW9ucygpIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2UgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGFjdGl2ZUVkaXRvckNoYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VPYnMgPSBhY3RpdmVFZGl0b3Jcblx0XHRcdC5tYXAoZSA9PiBlID8gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCBlLm9uRGlkQ2hhbmdlTW9kZWwpLm1hcCgoKSA9PiBlLmdldE1vZGVsKCk/LnVyaSkgOiB1bmRlZmluZWQpXG5cdFx0XHQubWFwKChvLCByZWFkZXIpID0+IG8/LnJlYWQocmVhZGVyKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uT2JzID0gYWN0aXZlRWRpdG9yXG5cdFx0XHQubWFwKGUgPT4gZSA/IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgZS5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbikubWFwKCgpID0+ICh7IHJhbmdlOiBlLmdldFNlbGVjdGlvbigpLCBtb2RlbDogZS5nZXRNb2RlbCgpIH0pKSA6IHVuZGVmaW5lZClcblx0XHRcdC5tYXAoKG8sIHJlYWRlcikgPT4gbz8ucmVhZChyZWFkZXIpKTtcblxuXHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc291cmNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgYnVzeTogZmFsc2UsIHBpY2tzOiBbXSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtczogUGlja0l0ZW1bXSA9IFtdO1xuXG5cdFx0XHQvLyBBZGQgYWN0aXZlIGZpbGUgb3B0aW9uXG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0aWQ6ICdhY3RpdmUtZmlsZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFyZy5hY3RpdmVGaWxlJywgJ0FjdGl2ZSBGaWxlJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UpLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlKSxcblx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0YWN0aW9uOiAnZmlsZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIEFkZCBzZWxlY3RlZCB0ZXh0IG9wdGlvbiBpZiB0aGVyZSdzIGEgc2VsZWN0aW9uXG5cdFx0XHRpZiAoc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5tb2RlbCAmJiBzZWxlY3Rpb24ucmFuZ2UgJiYgIXNlbGVjdGlvbi5yYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gc2VsZWN0aW9uLm1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24ucmFuZ2UpO1xuXHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBzZWxlY3Rpb24ucmFuZ2UuZW5kTGluZU51bWJlciAtIHNlbGVjdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGxpbmVDb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5hcmcuc2VsZWN0ZWRUZXh0LnNpbmdsZUxpbmUnLCAnbGluZSB7MH0nLCBzZWxlY3Rpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21jcC5hcmcuc2VsZWN0ZWRUZXh0Lm11bHRpTGluZScsICd7MH0gbGluZXMnLCBsaW5lQ291bnQpO1xuXG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiAnc2VsZWN0ZWQtdGV4dCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuYXJnLnNlbGVjdGVkVGV4dCcsICdTZWxlY3RlZCBUZXh0JyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0c2VsZWN0ZWRUZXh0LFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc2VsZWN0aW9uKSxcblx0XHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRcdGFjdGlvbjogJ3NlbGVjdGVkVGV4dCcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBwaWNrczogaXRlbXMsIGJ1c3k6IGZhbHNlIH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9hc3luY0NvbXBsZXRpb25zKGlucHV0OiBJT2JzZXJ2YWJsZTxzdHJpbmc+LCBtYXBwZXI6IChpbnB1dDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8UGlja0l0ZW1bXT4pOiBJT2JzZXJ2YWJsZTx7IGJ1c3k6IGJvb2xlYW47IHBpY2tzOiBQaWNrSXRlbVtdIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBwcm9taXNlID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnlWYWx1ZSA9IGlucHV0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdHJldHVybiBuZXcgT2JzZXJ2YWJsZVByb21pc2UoXG5cdFx0XHRcdHRpbWVvdXQoU1VHR0VTVF9ERUJPVU5DRSwgY3RzLnRva2VuKVxuXHRcdFx0XHRcdC50aGVuKCgpID0+IG1hcHBlcihxdWVyeVZhbHVlLCBjdHMudG9rZW4pKVxuXHRcdFx0XHRcdC5jYXRjaCgoKSA9PiBbXSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcHJvbWlzZS5tYXAoKHZhbHVlLCByZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHZhbHVlLnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHsgcGlja3M6IHJlc3VsdD8uZGF0YSB8fCBbXSwgYnVzeTogcmVzdWx0ID09PSB1bmRlZmluZWQgfTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRlcm1pbmFsT3V0cHV0KGNvbW1hbmQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUaGUgdGVybWluYWwgb3V0bGl2ZXMgdGhlIHNwZWNpZmljIHBpY2sgYXJndW1lbnQuIFRoaXMgaXMgYm90aCBhIGZlYXR1cmUgYW5kIGEgYnVnLlxuXHRcdC8vIEZlYXR1cmU6IHdlIGNhbiByZXVzZSB0aGUgdGVybWluYWwgaWYgdGhlIHVzZXIgcHV0cyBpbiBtdWx0aXBsZSBhcmdzXG5cdFx0Ly8gQnVnIHdvcmthcm91bmQ6IGlmIHdlIGRpc3Bvc2UgdGhlIHRlcm1pbmFsIGhlcmUgYW5kIHRoYXQgcmVzdWx0cyBpbiB0aGUgcGFuZWxcblx0XHQvLyBjbG9zaW5nLCB0aGVuIGZvY3VzIG1vdmVzIG91dCBvZiB0aGUgcXVpY2twaWNrIGFuZCBpbnRvIHRoZSBhY3RpdmUgZWRpdG9yIHBhbmUgKGNoYXQgaW5wdXQpXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi82YTAxNmYyNTA3Y2QyMDBiMTJjYTZlZWNkYWIyZjU5ZGExNWFhY2IxL3NyYy92cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yR3JvdXBWaWV3LnRzI0wxMDg0XG5cdFx0Y29uc3QgdGVybWluYWwgPSAodGhpcy5fdGVybWluYWwgPz89IHRoaXMuX3JlZ2lzdGVyKGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ21jcC50ZXJtaW5hbC5uYW1lJywgXCJNQ1AgVGVybWluYWxcIiksXG5cdFx0XHRcdGlzVHJhbnNpZW50OiB0cnVlLFxuXHRcdFx0XHRmb3JjZVNoZWxsSW50ZWdyYXRpb246IHRydWUsXG5cdFx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsLFxuXHRcdH0pKSk7XG5cblx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbChmYWxzZSk7XG5cblx0XHRjb25zdCBzaGVsbEludGVncmF0aW9uID0gdGVybWluYWwuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKHNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRUZXJtaW5hbE91dHB1dElubmVyKHRlcm1pbmFsLCBjb21tYW5kLCBzaGVsbEludGVncmF0aW9uLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGVybWluYWwuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eShlID0+IHtcblx0XHRcdFx0aWYgKGUuaWQgPT09IFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUodGhpcy5fZ2V0VGVybWluYWxPdXRwdXRJbm5lcih0ZXJtaW5hbCwgY29tbWFuZCwgZS5jYXBhYmlsaXR5LCB0b2tlbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSh0aGlzLl9nZXRUZXJtaW5hbE91dHB1dElubmVyKHRlcm1pbmFsLCBjb21tYW5kLCB1bmRlZmluZWQsIHRva2VuKSk7XG5cdFx0XHR9LCBTSEVMTF9JTlRFR1JBVElPTl9USU1FT1VUKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUZXJtaW5hbE91dHB1dElubmVyKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgY29tbWFuZDogc3RyaW5nLCBzaGVsbEludGVncmF0aW9uOiBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bGV0IGFsbERhdGE6IHN0cmluZyA9ICcnO1xuXHRcdFx0c3RvcmUuYWRkKHRlcm1pbmFsLm9uTGluZURhdGEoZCA9PiBhbGxEYXRhICs9IGQgKyAnXFxuJykpO1xuXHRcdFx0aWYgKHNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdFx0c3RvcmUuYWRkKHNoZWxsSW50ZWdyYXRpb24ub25Db21tYW5kRmluaXNoZWQoZSA9PiByZXNvbHZlKGUuZ2V0T3V0cHV0KCkgfHwgYWxsRGF0YSkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRvbmUgPSBzdG9yZS5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gcmVzb2x2ZShhbGxEYXRhKSwgTk9fU0hFTExfSU5URUdSQVRJT05fSURMRSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQodGVybWluYWwub25EYXRhKCgpID0+IGRvbmUuc2NoZWR1bGUoKSkpO1xuXHRcdFx0fVxuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRlcm1pbmFsLm9uRGlzcG9zZWQoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cblx0XHRcdHRlcm1pbmFsLnJ1bkNvbW1hbmQoY29tbWFuZCwgdHJ1ZSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUIsa0JBQWtCLGVBQWU7QUFDN0Qs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QWEsbUJBQW1CLE9BQUs7QUFDdkQsWUFBSSxFQUFFLE9BQU8sbUJBQW1CLGtCQUFrQjtBQUNqRCxnQkFBTSxRQUFRO0FBQ2Qsa0JBQVEsS0FBSyx3QkFBd0IsVUFBVSxTQUFTLEVBQUUsWUFBWSxLQUFLLENBQUM7QUFBQSxRQUM3RTtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxJQUFJLE1BQU0sd0JBQXdCLE1BQU07QUFDN0MsY0FBTSxRQUFRO0FBQ2QsZ0JBQVEsTUFBUztBQUFBLE1BQ2xCLENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSSxrQkFBa0IsTUFBTTtBQUNqQyxjQUFNLFFBQVE7QUFDZCxnQkFBUSxLQUFLLHdCQUF3QixVQUFVLFNBQVMsUUFBVyxLQUFLLENBQUM7QUFBQSxNQUMxRSxHQUFHLHlCQUF5QixDQUFDO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFVBQTZCLFNBQWlCLGtCQUEyRCxPQUEwQjtBQUN4SyxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsV0FBTyxJQUFJLFFBQTRCLGFBQVc7QUFDakQsVUFBSSxVQUFrQjtBQUN0QixZQUFNLElBQUksU0FBUyxXQUFXLE9BQUssV0FBVyxJQUFJLElBQUksQ0FBQztBQUN2RCxVQUFJLGtCQUFrQjtBQUNyQixjQUFNLElBQUksaUJBQWlCLGtCQUFrQixPQUFLLFFBQVEsRUFBRSxVQUFVLEtBQUssT0FBTyxDQUFDLENBQUM7QUFBQSxNQUNyRixPQUFPO0FBQ04sY0FBTSxPQUFPLE1BQU0sSUFBSSxJQUFJLGlCQUFpQixNQUFNLFFBQVEsT0FBTyxHQUFHLHlCQUF5QixDQUFDO0FBQzlGLGNBQU0sSUFBSSxTQUFTLE9BQU8sTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDakQ7QUFDQSxZQUFNLElBQUksTUFBTSx3QkFBd0IsTUFBTSxRQUFRLE1BQVMsQ0FBQyxDQUFDO0FBQ2pFLFlBQU0sSUFBSSxTQUFTLFdBQVcsTUFBTSxRQUFRLE1BQVMsQ0FBQyxDQUFDO0FBRXZELGVBQVMsV0FBVyxTQUFTLElBQUk7QUFBQSxJQUNsQyxDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hCLFlBQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdXYSx3QkFBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBakJVOyIsCiAgIm5hbWVzIjogWyJ2YWx1ZSIsICJpIl0KfQo=
