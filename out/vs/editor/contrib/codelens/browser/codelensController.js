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
import { createCancelablePromise, disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../common/config/fontInfo.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { getCodeLensModel } from "./codelens.js";
import { ICodeLensCache } from "./codeLensCache.js";
import { CodeLensHelper, CodeLensWidget } from "./codelensWidget.js";
import { localize, localize2 } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
let CodeLensContribution = class {
  constructor(_editor, _languageFeaturesService, debounceService, _commandService, _notificationService, _codeLensCache) {
    this._editor = _editor;
    this._languageFeaturesService = _languageFeaturesService;
    this._commandService = _commandService;
    this._notificationService = _notificationService;
    this._codeLensCache = _codeLensCache;
    this._disposables = new DisposableStore();
    this._localToDispose = new DisposableStore();
    this._lenses = [];
    this._oldCodeLensModels = new DisposableStore();
    this._provideCodeLensDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, "CodeLensProvide", { min: 250 });
    this._resolveCodeLensesDebounce = debounceService.for(_languageFeaturesService.codeLensProvider, "CodeLensResolve", { min: 250, salt: "resolve" });
    this._resolveCodeLensesScheduler = new RunOnceScheduler(() => this._resolveCodeLensesInViewport(), this._resolveCodeLensesDebounce.default());
    this._disposables.add(this._editor.onDidChangeModel(() => this._onModelChange()));
    this._disposables.add(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.codeLensFontFamily)) {
        this._updateLensStyle();
      }
      if (e.hasChanged(EditorOption.codeLens)) {
        this._onModelChange();
      }
    }));
    this._disposables.add(_languageFeaturesService.codeLensProvider.onDidChange(this._onModelChange, this));
    this._onModelChange();
    this._updateLensStyle();
  }
  dispose() {
    this._localDispose();
    this._localToDispose.dispose();
    this._disposables.dispose();
    this._resolveCodeLensesScheduler.dispose();
    this._oldCodeLensModels.dispose();
    this._currentCodeLensModel?.dispose();
  }
  _getLayoutInfo() {
    const lineHeightFactor = Math.max(1.3, this._editor.getOption(EditorOption.lineHeight) / this._editor.getOption(EditorOption.fontSize));
    let fontSize = this._editor.getOption(EditorOption.codeLensFontSize);
    if (!fontSize || fontSize < 5) {
      fontSize = this._editor.getOption(EditorOption.fontSize) * 0.9 | 0;
    }
    return {
      fontSize,
      codeLensHeight: fontSize * lineHeightFactor | 0
    };
  }
  _updateLensStyle() {
    const { codeLensHeight, fontSize } = this._getLayoutInfo();
    const fontFamily = this._editor.getOption(EditorOption.codeLensFontFamily);
    const editorFontInfo = this._editor.getOption(EditorOption.fontInfo);
    const { style } = this._editor.getContainerDomNode();
    style.setProperty("--vscode-editorCodeLens-lineHeight", `${codeLensHeight}px`);
    style.setProperty("--vscode-editorCodeLens-fontSize", `${fontSize}px`);
    style.setProperty("--vscode-editorCodeLens-fontFeatureSettings", editorFontInfo.fontFeatureSettings);
    if (fontFamily) {
      style.setProperty("--vscode-editorCodeLens-fontFamily", fontFamily);
      style.setProperty("--vscode-editorCodeLens-fontFamilyDefault", EDITOR_FONT_DEFAULTS.fontFamily);
    }
    this._editor.changeViewZones((accessor) => {
      for (const lens of this._lenses) {
        lens.updateHeight(codeLensHeight, accessor);
      }
    });
  }
  _localDispose() {
    this._getCodeLensModelPromise?.cancel();
    this._getCodeLensModelPromise = void 0;
    this._resolveCodeLensesPromise?.cancel();
    this._resolveCodeLensesPromise = void 0;
    this._localToDispose.clear();
    this._oldCodeLensModels.clear();
    this._currentCodeLensModel?.dispose();
  }
  _onModelChange() {
    this._localDispose();
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    if (!this._editor.getOption(EditorOption.codeLens) || model.isTooLargeForTokenization()) {
      return;
    }
    const cachedLenses = this._codeLensCache.get(model);
    if (cachedLenses) {
      this._renderCodeLensSymbols(cachedLenses);
    }
    if (!this._languageFeaturesService.codeLensProvider.has(model)) {
      if (cachedLenses) {
        disposableTimeout(() => {
          const cachedLensesNow = this._codeLensCache.get(model);
          if (cachedLenses === cachedLensesNow) {
            this._codeLensCache.delete(model);
            this._onModelChange();
          }
        }, 30 * 1e3, this._localToDispose);
      }
      return;
    }
    for (const provider of this._languageFeaturesService.codeLensProvider.all(model)) {
      if (typeof provider.onDidChange === "function") {
        const registration = provider.onDidChange(() => scheduler.schedule());
        this._localToDispose.add(registration);
      }
    }
    const scheduler = new RunOnceScheduler(() => {
      const t1 = Date.now();
      this._getCodeLensModelPromise?.cancel();
      this._getCodeLensModelPromise = createCancelablePromise((token) => getCodeLensModel(this._languageFeaturesService.codeLensProvider, model, token));
      this._getCodeLensModelPromise.then((result) => {
        if (this._currentCodeLensModel) {
          this._oldCodeLensModels.add(this._currentCodeLensModel);
        }
        this._currentCodeLensModel = result;
        this._codeLensCache.put(model, result);
        const newDelay = this._provideCodeLensDebounce.update(model, Date.now() - t1);
        scheduler.delay = newDelay;
        this._renderCodeLensSymbols(result);
        this._resolveCodeLensesInViewportSoon();
      }, onUnexpectedError);
    }, this._provideCodeLensDebounce.get(model));
    this._localToDispose.add(scheduler);
    this._localToDispose.add(toDisposable(() => this._resolveCodeLensesScheduler.cancel()));
    this._localToDispose.add(this._editor.onDidChangeModelContent(() => {
      this._editor.changeDecorations((decorationsAccessor) => {
        this._editor.changeViewZones((viewZonesAccessor) => {
          const toDispose = [];
          let lastLensLineNumber = -1;
          this._lenses.forEach((lens) => {
            if (!lens.isValid() || lastLensLineNumber === lens.getLineNumber()) {
              toDispose.push(lens);
            } else {
              lens.update(viewZonesAccessor);
              lastLensLineNumber = lens.getLineNumber();
            }
          });
          const helper = new CodeLensHelper();
          toDispose.forEach((l) => {
            l.dispose(helper, viewZonesAccessor);
            this._lenses.splice(this._lenses.indexOf(l), 1);
          });
          helper.commit(decorationsAccessor);
        });
      });
      scheduler.schedule();
      this._resolveCodeLensesScheduler.cancel();
      this._resolveCodeLensesPromise?.cancel();
      this._resolveCodeLensesPromise = void 0;
    }));
    this._localToDispose.add(this._editor.onDidFocusEditorText(() => {
      scheduler.schedule();
    }));
    this._localToDispose.add(this._editor.onDidBlurEditorText(() => {
      scheduler.cancel();
    }));
    this._localToDispose.add(this._editor.onDidScrollChange((e) => {
      if (e.scrollTopChanged && this._lenses.length > 0) {
        this._resolveCodeLensesInViewportSoon();
      }
    }));
    this._localToDispose.add(this._editor.onDidLayoutChange(() => {
      this._resolveCodeLensesInViewportSoon();
    }));
    this._localToDispose.add(toDisposable(() => {
      if (this._editor.getModel()) {
        const scrollState = StableEditorScrollState.capture(this._editor);
        this._editor.changeDecorations((decorationsAccessor) => {
          this._editor.changeViewZones((viewZonesAccessor) => {
            this._disposeAllLenses(decorationsAccessor, viewZonesAccessor);
          });
        });
        scrollState.restore(this._editor);
      } else {
        this._disposeAllLenses(void 0, void 0);
      }
    }));
    this._localToDispose.add(this._editor.onMouseDown((e) => {
      if (e.target.type !== MouseTargetType.CONTENT_WIDGET) {
        return;
      }
      let target = e.target.element;
      if (target?.tagName === "SPAN") {
        target = target.parentElement;
      }
      if (target?.tagName === "A") {
        for (const lens of this._lenses) {
          const command = lens.getCommand(target);
          if (command) {
            this._commandService.executeCommand(command.id, ...command.arguments || []).catch((err) => this._notificationService.error(err));
            break;
          }
        }
      }
    }));
    scheduler.schedule();
  }
  _disposeAllLenses(decChangeAccessor, viewZoneChangeAccessor) {
    const helper = new CodeLensHelper();
    for (const lens of this._lenses) {
      lens.dispose(helper, viewZoneChangeAccessor);
    }
    if (decChangeAccessor) {
      helper.commit(decChangeAccessor);
    }
    this._lenses.length = 0;
  }
  _renderCodeLensSymbols(symbols) {
    if (!this._editor.hasModel()) {
      return;
    }
    const maxLineNumber = this._editor.getModel().getLineCount();
    const groups = [];
    let lastGroup;
    for (const symbol of symbols.lenses) {
      const line = symbol.symbol.range.startLineNumber;
      if (line < 1 || line > maxLineNumber) {
        continue;
      } else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
        lastGroup.push(symbol);
      } else {
        lastGroup = [symbol];
        groups.push(lastGroup);
      }
    }
    if (!groups.length && !this._lenses.length) {
      return;
    }
    const scrollState = StableEditorScrollState.capture(this._editor);
    const layoutInfo = this._getLayoutInfo();
    this._editor.changeDecorations((decorationsAccessor) => {
      this._editor.changeViewZones((viewZoneAccessor) => {
        const helper = new CodeLensHelper();
        let codeLensIndex = 0;
        let groupsIndex = 0;
        while (groupsIndex < groups.length && codeLensIndex < this._lenses.length) {
          const symbolsLineNumber = groups[groupsIndex][0].symbol.range.startLineNumber;
          const codeLensLineNumber = this._lenses[codeLensIndex].getLineNumber();
          if (codeLensLineNumber < symbolsLineNumber) {
            this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
            this._lenses.splice(codeLensIndex, 1);
          } else if (codeLensLineNumber === symbolsLineNumber) {
            this._lenses[codeLensIndex].updateCodeLensSymbols(groups[groupsIndex], helper);
            groupsIndex++;
            codeLensIndex++;
          } else {
            this._lenses.splice(codeLensIndex, 0, new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
            codeLensIndex++;
            groupsIndex++;
          }
        }
        while (codeLensIndex < this._lenses.length) {
          this._lenses[codeLensIndex].dispose(helper, viewZoneAccessor);
          this._lenses.splice(codeLensIndex, 1);
        }
        while (groupsIndex < groups.length) {
          this._lenses.push(new CodeLensWidget(groups[groupsIndex], this._editor, helper, viewZoneAccessor, layoutInfo.codeLensHeight, () => this._resolveCodeLensesInViewportSoon()));
          groupsIndex++;
        }
        helper.commit(decorationsAccessor);
      });
    });
    scrollState.restore(this._editor);
  }
  _resolveCodeLensesInViewportSoon() {
    const model = this._editor.getModel();
    if (model) {
      this._resolveCodeLensesScheduler.schedule();
    }
  }
  _resolveCodeLensesInViewport() {
    this._resolveCodeLensesPromise?.cancel();
    this._resolveCodeLensesPromise = void 0;
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    const toResolve = [];
    const lenses = [];
    this._lenses.forEach((lens) => {
      const request = lens.computeIfNecessary(model);
      if (request) {
        toResolve.push(request);
        lenses.push(lens);
      }
    });
    if (toResolve.length === 0) {
      this._oldCodeLensModels.clear();
      return;
    }
    const t1 = Date.now();
    const resolvePromise = createCancelablePromise((token) => {
      const promises = toResolve.map((request, i) => {
        const resolvedSymbols = new Array(request.length);
        const promises2 = request.map((request2, i2) => {
          if (!request2.symbol.command && typeof request2.provider.resolveCodeLens === "function") {
            return Promise.resolve(request2.provider.resolveCodeLens(model, request2.symbol, token)).then((symbol) => {
              resolvedSymbols[i2] = symbol;
            }, onUnexpectedExternalError);
          } else {
            resolvedSymbols[i2] = request2.symbol;
            return Promise.resolve(void 0);
          }
        });
        return Promise.all(promises2).then(() => {
          if (!token.isCancellationRequested && !lenses[i].isDisposed()) {
            lenses[i].updateCommands(resolvedSymbols);
          }
        });
      });
      return Promise.all(promises);
    });
    this._resolveCodeLensesPromise = resolvePromise;
    this._resolveCodeLensesPromise.then(() => {
      const newDelay = this._resolveCodeLensesDebounce.update(model, Date.now() - t1);
      this._resolveCodeLensesScheduler.delay = newDelay;
      if (this._currentCodeLensModel) {
        this._codeLensCache.put(model, this._currentCodeLensModel);
      }
      this._oldCodeLensModels.clear();
      if (resolvePromise === this._resolveCodeLensesPromise) {
        this._resolveCodeLensesPromise = void 0;
      }
    }, (err) => {
      onUnexpectedError(err);
      if (resolvePromise === this._resolveCodeLensesPromise) {
        this._resolveCodeLensesPromise = void 0;
      }
    });
  }
  async getModel() {
    await this._getCodeLensModelPromise;
    await this._resolveCodeLensesPromise;
    return !this._currentCodeLensModel?.isDisposed ? this._currentCodeLensModel : void 0;
  }
};
CodeLensContribution.ID = "css.editor.codeLens";
CodeLensContribution = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ILanguageFeatureDebounceService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, ICodeLensCache)
], CodeLensContribution);
registerEditorContribution(CodeLensContribution.ID, CodeLensContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(class ShowLensesInCurrentLine extends EditorAction {
  constructor() {
    super({
      id: "codelens.showLensesInCurrentLine",
      precondition: EditorContextKeys.hasCodeLensProvider,
      label: localize2("showLensOnLine", "Show CodeLens Commands for Current Line")
    });
  }
  async run(accessor, editor) {
    if (!editor.hasModel()) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const lineNumber = editor.getSelection().positionLineNumber;
    const codelensController = editor.getContribution(CodeLensContribution.ID);
    if (!codelensController) {
      return;
    }
    const model = await codelensController.getModel();
    if (!model) {
      return;
    }
    const items = [];
    for (const lens of model.lenses) {
      if (lens.symbol.command && lens.symbol.range.startLineNumber === lineNumber) {
        items.push({
          label: lens.symbol.command.title,
          command: lens.symbol.command
        });
      }
    }
    if (items.length === 0) {
      return;
    }
    const item = await quickInputService.pick(items, {
      canPickMany: false,
      placeHolder: localize("placeHolder", "Select a command")
    });
    if (!item) {
      return;
    }
    let command = item.command;
    if (model.isDisposed) {
      const newModel = await codelensController.getModel();
      const newLens = newModel?.lenses.find((lens) => lens.symbol.range.startLineNumber === lineNumber && lens.symbol.command?.title === command.title);
      if (!newLens || !newLens.symbol.command) {
        return;
      }
      command = newLens.symbol.command;
    }
    try {
      await commandService.executeCommand(command.id, ...command.arguments || []);
    } catch (err) {
      notificationService.error(err);
    }
  }
});
export {
  CodeLensContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvZGVsZW5zL2Jyb3dzZXIvY29kZWxlbnNDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3N0YWJsZUVkaXRvclNjcm9sbC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IsIElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yLCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvZGVMZW5zLCBDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb2RlTGVuc0l0ZW0sIENvZGVMZW5zTW9kZWwsIGdldENvZGVMZW5zTW9kZWwgfSBmcm9tICcuL2NvZGVsZW5zLmpzJztcbmltcG9ydCB7IElDb2RlTGVuc0NhY2hlIH0gZnJvbSAnLi9jb2RlTGVuc0NhY2hlLmpzJztcbmltcG9ydCB7IENvZGVMZW5zSGVscGVyLCBDb2RlTGVuc1dpZGdldCB9IGZyb20gJy4vY29kZWxlbnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiwgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb2RlTGVuc0NvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ2Nzcy5lZGl0b3IuY29kZUxlbnMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sZW5zZXM6IENvZGVMZW5zV2lkZ2V0W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlQ29kZUxlbnNEZWJvdW5jZTogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlQ29kZUxlbnNlc0RlYm91bmNlOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVDb2RlTGVuc2VzU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgX2dldENvZGVMZW5zTW9kZWxQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxDb2RlTGVuc01vZGVsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb2xkQ29kZUxlbnNNb2RlbHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX2N1cnJlbnRDb2RlTGVuc01vZGVsOiBDb2RlTGVuc01vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWRbXT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgZGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlTGVuc0NhY2hlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVMZW5zQ2FjaGU6IElDb2RlTGVuc0NhY2hlXG5cdCkge1xuXHRcdHRoaXMuX3Byb3ZpZGVDb2RlTGVuc0RlYm91bmNlID0gZGVib3VuY2VTZXJ2aWNlLmZvcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlciwgJ0NvZGVMZW5zUHJvdmlkZScsIHsgbWluOiAyNTAgfSk7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNEZWJvdW5jZSA9IGRlYm91bmNlU2VydmljZS5mb3IoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIsICdDb2RlTGVuc1Jlc29sdmUnLCB7IG1pbjogMjUwLCBzYWx0OiAncmVzb2x2ZScgfSk7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc0luVmlld3BvcnQoKSwgdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNEZWJvdW5jZS5kZWZhdWx0KCkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMuX29uTW9kZWxDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHRoaXMuX29uTW9kZWxDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykgfHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5jb2RlTGVuc0ZvbnRTaXplKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udEZhbWlseSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlTGVuc1N0eWxlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5jb2RlTGVucykpIHtcblx0XHRcdFx0dGhpcy5fb25Nb2RlbENoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIub25EaWRDaGFuZ2UodGhpcy5fb25Nb2RlbENoYW5nZSwgdGhpcykpO1xuXHRcdHRoaXMuX29uTW9kZWxDaGFuZ2UoKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUxlbnNTdHlsZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2NhbERpc3Bvc2UoKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzU2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbGRDb2RlTGVuc01vZGVscy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWw/LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgbGluZUhlaWdodEZhY3RvciA9IE1hdGgubWF4KDEuMywgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgLyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkpO1xuXHRcdGxldCBmb250U2l6ZSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udFNpemUpO1xuXHRcdGlmICghZm9udFNpemUgfHwgZm9udFNpemUgPCA1KSB7XG5cdFx0XHRmb250U2l6ZSA9ICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkgKiAuOSkgfCAwO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9udFNpemUsXG5cdFx0XHRjb2RlTGVuc0hlaWdodDogKGZvbnRTaXplICogbGluZUhlaWdodEZhY3RvcikgfCAwLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMZW5zU3R5bGUoKTogdm9pZCB7XG5cblx0XHRjb25zdCB7IGNvZGVMZW5zSGVpZ2h0LCBmb250U2l6ZSB9ID0gdGhpcy5fZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb2RlTGVuc0ZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGVkaXRvckZvbnRJbmZvID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXG5cdFx0Y29uc3QgeyBzdHlsZSB9ID0gdGhpcy5fZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKTtcblxuXHRcdHN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JDb2RlTGVucy1saW5lSGVpZ2h0JywgYCR7Y29kZUxlbnNIZWlnaHR9cHhgKTtcblx0XHRzdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yQ29kZUxlbnMtZm9udFNpemUnLCBgJHtmb250U2l6ZX1weGApO1xuXHRcdHN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JDb2RlTGVucy1mb250RmVhdHVyZVNldHRpbmdzJywgZWRpdG9yRm9udEluZm8uZm9udEZlYXR1cmVTZXR0aW5ncyk7XG5cblx0XHRpZiAoZm9udEZhbWlseSkge1xuXHRcdFx0c3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvckNvZGVMZW5zLWZvbnRGYW1pbHknLCBmb250RmFtaWx5KTtcblx0XHRcdHN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JDb2RlTGVucy1mb250RmFtaWx5RGVmYXVsdCcsIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHkpO1xuXHRcdH1cblxuXHRcdC8vXG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGxlbnMgb2YgdGhpcy5fbGVuc2VzKSB7XG5cdFx0XHRcdGxlbnMudXBkYXRlSGVpZ2h0KGNvZGVMZW5zSGVpZ2h0LCBhY2Nlc3Nvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2NhbERpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2V0Q29kZUxlbnNNb2RlbFByb21pc2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2dldENvZGVMZW5zTW9kZWxQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmNsZWFyKCk7XG5cdFx0dGhpcy5fb2xkQ29kZUxlbnNNb2RlbHMuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbD8uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb2RlbENoYW5nZSgpOiB2b2lkIHtcblxuXHRcdHRoaXMuX2xvY2FsRGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb2RlTGVucykgfHwgbW9kZWwuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkTGVuc2VzID0gdGhpcy5fY29kZUxlbnNDYWNoZS5nZXQobW9kZWwpO1xuXHRcdGlmIChjYWNoZWRMZW5zZXMpIHtcblx0XHRcdHRoaXMuX3JlbmRlckNvZGVMZW5zU3ltYm9scyhjYWNoZWRMZW5zZXMpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cdFx0XHQvLyBubyBwcm92aWRlciAtPiByZXR1cm4gYnV0IGNoZWNrIHdpdGhcblx0XHRcdC8vIGNhY2hlZCBsZW5zZXMuIHRoZXkgZXhwaXJlIGFmdGVyIDMwIHNlY29uZHNcblx0XHRcdGlmIChjYWNoZWRMZW5zZXMpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNhY2hlZExlbnNlc05vdyA9IHRoaXMuX2NvZGVMZW5zQ2FjaGUuZ2V0KG1vZGVsKTtcblx0XHRcdFx0XHRpZiAoY2FjaGVkTGVuc2VzID09PSBjYWNoZWRMZW5zZXNOb3cpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvZGVMZW5zQ2FjaGUuZGVsZXRlKG1vZGVsKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uTW9kZWxDaGFuZ2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDMwICogMTAwMCwgdGhpcy5fbG9jYWxUb0Rpc3Bvc2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5hbGwobW9kZWwpKSB7XG5cdFx0XHRpZiAodHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHNjaGVkdWxlci5zY2hlZHVsZSgpKTtcblx0XHRcdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHJlZ2lzdHJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHR0aGlzLl9nZXRDb2RlTGVuc01vZGVsUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9nZXRDb2RlTGVuc01vZGVsUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IGdldENvZGVMZW5zTW9kZWwodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlciwgbW9kZWwsIHRva2VuKSk7XG5cblx0XHRcdHRoaXMuX2dldENvZGVMZW5zTW9kZWxQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsKSB7XG5cdFx0XHRcdFx0dGhpcy5fb2xkQ29kZUxlbnNNb2RlbHMuYWRkKHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbCA9IHJlc3VsdDtcblxuXHRcdFx0XHQvLyBjYWNoZSBtb2RlbCB0byByZWR1Y2UgZmxpY2tlclxuXHRcdFx0XHR0aGlzLl9jb2RlTGVuc0NhY2hlLnB1dChtb2RlbCwgcmVzdWx0KTtcblxuXHRcdFx0XHQvLyB1cGRhdGUgbW92aW5nIGF2ZXJhZ2Vcblx0XHRcdFx0Y29uc3QgbmV3RGVsYXkgPSB0aGlzLl9wcm92aWRlQ29kZUxlbnNEZWJvdW5jZS51cGRhdGUobW9kZWwsIERhdGUubm93KCkgLSB0MSk7XG5cdFx0XHRcdHNjaGVkdWxlci5kZWxheSA9IG5ld0RlbGF5O1xuXG5cdFx0XHRcdC8vIHJlbmRlciBsZW5zZXNcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ29kZUxlbnNTeW1ib2xzKHJlc3VsdCk7XG5cdFx0XHRcdC8vIGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKCgpID0+IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydCgpKTtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNJblZpZXdwb3J0U29vbigpO1xuXHRcdFx0fSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXG5cdFx0fSwgdGhpcy5fcHJvdmlkZUNvZGVMZW5zRGVib3VuY2UuZ2V0KG1vZGVsKSk7XG5cblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQoc2NoZWR1bGVyKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzU2NoZWR1bGVyLmNhbmNlbCgpKSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNBY2Nlc3NvciA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VWaWV3Wm9uZXModmlld1pvbmVzQWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvRGlzcG9zZTogQ29kZUxlbnNXaWRnZXRbXSA9IFtdO1xuXHRcdFx0XHRcdGxldCBsYXN0TGVuc0xpbmVOdW1iZXI6IG51bWJlciA9IC0xO1xuXG5cdFx0XHRcdFx0dGhpcy5fbGVuc2VzLmZvckVhY2goKGxlbnMpID0+IHtcblx0XHRcdFx0XHRcdGlmICghbGVucy5pc1ZhbGlkKCkgfHwgbGFzdExlbnNMaW5lTnVtYmVyID09PSBsZW5zLmdldExpbmVOdW1iZXIoKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBpbnZhbGlkIC0+IGxlbnMgY29sbGFwc2VkLCBhdHRhY2ggcmFuZ2UgZG9lc24ndCBleGlzdCBhbnltb3JlXG5cdFx0XHRcdFx0XHRcdC8vIGxpbmVfbnVtYmVyIC0+IGxlbnNlcyBzaG91bGQgbmV2ZXIgYmUgb24gdGhlIHNhbWUgbGluZVxuXHRcdFx0XHRcdFx0XHR0b0Rpc3Bvc2UucHVzaChsZW5zKTtcblxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bGVucy51cGRhdGUodmlld1pvbmVzQWNjZXNzb3IpO1xuXHRcdFx0XHRcdFx0XHRsYXN0TGVuc0xpbmVOdW1iZXIgPSBsZW5zLmdldExpbmVOdW1iZXIoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNvbnN0IGhlbHBlciA9IG5ldyBDb2RlTGVuc0hlbHBlcigpO1xuXHRcdFx0XHRcdHRvRGlzcG9zZS5mb3JFYWNoKChsKSA9PiB7XG5cdFx0XHRcdFx0XHRsLmRpc3Bvc2UoaGVscGVyLCB2aWV3Wm9uZXNBY2Nlc3Nvcik7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZW5zZXMuc3BsaWNlKHRoaXMuX2xlbnNlcy5pbmRleE9mKGwpLCAxKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRoZWxwZXIuY29tbWl0KGRlY29yYXRpb25zQWNjZXNzb3IpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBc2sgZm9yIGFsbCByZWZlcmVuY2VzIGFnYWluXG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblxuXHRcdFx0Ly8gQ2FuY2VsIHBlbmRpbmcgYW5kIGFjdGl2ZSByZXNvbHZlIHJlcXVlc3RzXG5cdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1NjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRzY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxUb3BDaGFuZ2VkICYmIHRoaXMuX2xlbnNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydFNvb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc0luVmlld3BvcnRTb29uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpKSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNBY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcyh2aWV3Wm9uZXNBY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlQWxsTGVuc2VzKGRlY29yYXRpb25zQWNjZXNzb3IsIHZpZXdab25lc0FjY2Vzc29yKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNjcm9sbFN0YXRlLnJlc3RvcmUodGhpcy5fZWRpdG9yKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vIGFjY2Vzc29ycyBhdmFpbGFibGVcblx0XHRcdFx0dGhpcy5fZGlzcG9zZUFsbExlbnNlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VUKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCB0YXJnZXQgPSBlLnRhcmdldC5lbGVtZW50O1xuXHRcdFx0aWYgKHRhcmdldD8udGFnTmFtZSA9PT0gJ1NQQU4nKSB7XG5cdFx0XHRcdHRhcmdldCA9IHRhcmdldC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRhcmdldD8udGFnTmFtZSA9PT0gJ0EnKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbGVucyBvZiB0aGlzLl9sZW5zZXMpIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gbGVucy5nZXRDb21tYW5kKHRhcmdldCBhcyBIVE1MTGlua0VsZW1lbnQpO1xuXHRcdFx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kLmlkLCAuLi4oY29tbWFuZC5hcmd1bWVudHMgfHwgW10pKS5jYXRjaChlcnIgPT4gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VBbGxMZW5zZXMoZGVjQ2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IgfCB1bmRlZmluZWQsIHZpZXdab25lQ2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaGVscGVyID0gbmV3IENvZGVMZW5zSGVscGVyKCk7XG5cdFx0Zm9yIChjb25zdCBsZW5zIG9mIHRoaXMuX2xlbnNlcykge1xuXHRcdFx0bGVucy5kaXNwb3NlKGhlbHBlciwgdmlld1pvbmVDaGFuZ2VBY2Nlc3Nvcik7XG5cdFx0fVxuXHRcdGlmIChkZWNDaGFuZ2VBY2Nlc3Nvcikge1xuXHRcdFx0aGVscGVyLmNvbW1pdChkZWNDaGFuZ2VBY2Nlc3Nvcik7XG5cdFx0fVxuXHRcdHRoaXMuX2xlbnNlcy5sZW5ndGggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ29kZUxlbnNTeW1ib2xzKHN5bWJvbHM6IENvZGVMZW5zTW9kZWwpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4TGluZU51bWJlciA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGdyb3VwczogQ29kZUxlbnNJdGVtW11bXSA9IFtdO1xuXHRcdGxldCBsYXN0R3JvdXA6IENvZGVMZW5zSXRlbVtdIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scy5sZW5zZXMpIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBzeW1ib2wuc3ltYm9sLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGlmIChsaW5lIDwgMSB8fCBsaW5lID4gbWF4TGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBpbnZhbGlkIGNvZGUgbGVuc1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAobGFzdEdyb3VwICYmIGxhc3RHcm91cFtsYXN0R3JvdXAubGVuZ3RoIC0gMV0uc3ltYm9sLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZSkge1xuXHRcdFx0XHQvLyBvbiBzYW1lIGxpbmUgYXMgcHJldmlvdXNcblx0XHRcdFx0bGFzdEdyb3VwLnB1c2goc3ltYm9sKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG9uIGxhdGVyIGxpbmUgYXMgcHJldmlvdXNcblx0XHRcdFx0bGFzdEdyb3VwID0gW3N5bWJvbF07XG5cdFx0XHRcdGdyb3Vwcy5wdXNoKGxhc3RHcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFncm91cHMubGVuZ3RoICYmICF0aGlzLl9sZW5zZXMubGVuZ3RoKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGNoYW5nZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLl9lZGl0b3IpO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9nZXRMYXlvdXRJbmZvKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNBY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKHZpZXdab25lQWNjZXNzb3IgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGhlbHBlciA9IG5ldyBDb2RlTGVuc0hlbHBlcigpO1xuXHRcdFx0XHRsZXQgY29kZUxlbnNJbmRleCA9IDA7XG5cdFx0XHRcdGxldCBncm91cHNJbmRleCA9IDA7XG5cblx0XHRcdFx0d2hpbGUgKGdyb3Vwc0luZGV4IDwgZ3JvdXBzLmxlbmd0aCAmJiBjb2RlTGVuc0luZGV4IDwgdGhpcy5fbGVuc2VzLmxlbmd0aCkge1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3ltYm9sc0xpbmVOdW1iZXIgPSBncm91cHNbZ3JvdXBzSW5kZXhdWzBdLnN5bWJvbC5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0Y29uc3QgY29kZUxlbnNMaW5lTnVtYmVyID0gdGhpcy5fbGVuc2VzW2NvZGVMZW5zSW5kZXhdLmdldExpbmVOdW1iZXIoKTtcblxuXHRcdFx0XHRcdGlmIChjb2RlTGVuc0xpbmVOdW1iZXIgPCBzeW1ib2xzTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbGVuc2VzW2NvZGVMZW5zSW5kZXhdLmRpc3Bvc2UoaGVscGVyLCB2aWV3Wm9uZUFjY2Vzc29yKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xlbnNlcy5zcGxpY2UoY29kZUxlbnNJbmRleCwgMSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjb2RlTGVuc0xpbmVOdW1iZXIgPT09IHN5bWJvbHNMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZW5zZXNbY29kZUxlbnNJbmRleF0udXBkYXRlQ29kZUxlbnNTeW1ib2xzKGdyb3Vwc1tncm91cHNJbmRleF0sIGhlbHBlcik7XG5cdFx0XHRcdFx0XHRncm91cHNJbmRleCsrO1xuXHRcdFx0XHRcdFx0Y29kZUxlbnNJbmRleCsrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZW5zZXMuc3BsaWNlKGNvZGVMZW5zSW5kZXgsIDAsIG5ldyBDb2RlTGVuc1dpZGdldChncm91cHNbZ3JvdXBzSW5kZXhdLCA8SUFjdGl2ZUNvZGVFZGl0b3I+dGhpcy5fZWRpdG9yLCBoZWxwZXIsIHZpZXdab25lQWNjZXNzb3IsIGxheW91dEluZm8uY29kZUxlbnNIZWlnaHQsICgpID0+IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydFNvb24oKSkpO1xuXHRcdFx0XHRcdFx0Y29kZUxlbnNJbmRleCsrO1xuXHRcdFx0XHRcdFx0Z3JvdXBzSW5kZXgrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEZWxldGUgZXh0cmEgY29kZSBsZW5zZXNcblx0XHRcdFx0d2hpbGUgKGNvZGVMZW5zSW5kZXggPCB0aGlzLl9sZW5zZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGVuc2VzW2NvZGVMZW5zSW5kZXhdLmRpc3Bvc2UoaGVscGVyLCB2aWV3Wm9uZUFjY2Vzc29yKTtcblx0XHRcdFx0XHR0aGlzLl9sZW5zZXMuc3BsaWNlKGNvZGVMZW5zSW5kZXgsIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ3JlYXRlIGV4dHJhIHN5bWJvbHNcblx0XHRcdFx0d2hpbGUgKGdyb3Vwc0luZGV4IDwgZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX2xlbnNlcy5wdXNoKG5ldyBDb2RlTGVuc1dpZGdldChncm91cHNbZ3JvdXBzSW5kZXhdLCA8SUFjdGl2ZUNvZGVFZGl0b3I+dGhpcy5fZWRpdG9yLCBoZWxwZXIsIHZpZXdab25lQWNjZXNzb3IsIGxheW91dEluZm8uY29kZUxlbnNIZWlnaHQsICgpID0+IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydFNvb24oKSkpO1xuXHRcdFx0XHRcdGdyb3Vwc0luZGV4Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoZWxwZXIuY29tbWl0KGRlY29yYXRpb25zQWNjZXNzb3IpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzY3JvbGxTdGF0ZS5yZXN0b3JlKHRoaXMuX2VkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ29kZUxlbnNlc0luVmlld3BvcnRTb29uKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDb2RlTGVuc2VzSW5WaWV3cG9ydCgpOiB2b2lkIHtcblxuXHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9SZXNvbHZlOiBBcnJheTxSZWFkb25seUFycmF5PENvZGVMZW5zSXRlbT4+ID0gW107XG5cdFx0Y29uc3QgbGVuc2VzOiBDb2RlTGVuc1dpZGdldFtdID0gW107XG5cdFx0dGhpcy5fbGVuc2VzLmZvckVhY2goKGxlbnMpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBsZW5zLmNvbXB1dGVJZk5lY2Vzc2FyeShtb2RlbCk7XG5cdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHR0b1Jlc29sdmUucHVzaChyZXF1ZXN0KTtcblx0XHRcdFx0bGVuc2VzLnB1c2gobGVucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodG9SZXNvbHZlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb2xkQ29kZUxlbnNNb2RlbHMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0MSA9IERhdGUubm93KCk7XG5cblx0XHRjb25zdCByZXNvbHZlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSB0b1Jlc29sdmUubWFwKChyZXF1ZXN0LCBpKSA9PiB7XG5cblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRTeW1ib2xzID0gbmV3IEFycmF5PENvZGVMZW5zIHwgdW5kZWZpbmVkIHwgbnVsbD4ocmVxdWVzdC5sZW5ndGgpO1xuXHRcdFx0XHRjb25zdCBwcm9taXNlcyA9IHJlcXVlc3QubWFwKChyZXF1ZXN0LCBpKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZXF1ZXN0LnN5bWJvbC5jb21tYW5kICYmIHR5cGVvZiByZXF1ZXN0LnByb3ZpZGVyLnJlc29sdmVDb2RlTGVucyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXF1ZXN0LnByb3ZpZGVyLnJlc29sdmVDb2RlTGVucyhtb2RlbCwgcmVxdWVzdC5zeW1ib2wsIHRva2VuKSkudGhlbihzeW1ib2wgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlZFN5bWJvbHNbaV0gPSBzeW1ib2w7XG5cdFx0XHRcdFx0XHR9LCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWRTeW1ib2xzW2ldID0gcmVxdWVzdC5zeW1ib2w7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgIWxlbnNlc1tpXS5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdGxlbnNlc1tpXS51cGRhdGVDb21tYW5kcyhyZXNvbHZlZFN5bWJvbHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UgPSByZXNvbHZlUHJvbWlzZTtcblxuXHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZS50aGVuKCgpID0+IHtcblxuXHRcdFx0Ly8gdXBkYXRlIG1vdmluZyBhdmVyYWdlXG5cdFx0XHRjb25zdCBuZXdEZWxheSA9IHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzRGVib3VuY2UudXBkYXRlKG1vZGVsLCBEYXRlLm5vdygpIC0gdDEpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNTY2hlZHVsZXIuZGVsYXkgPSBuZXdEZWxheTtcblxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRDb2RlTGVuc01vZGVsKSB7IC8vIHVwZGF0ZSB0aGUgY2FjaGVkIHN0YXRlIHdpdGggbmV3IHJlc29sdmVkIGl0ZW1zXG5cdFx0XHRcdHRoaXMuX2NvZGVMZW5zQ2FjaGUucHV0KG1vZGVsLCB0aGlzLl9jdXJyZW50Q29kZUxlbnNNb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbGRDb2RlTGVuc01vZGVscy5jbGVhcigpOyAvLyBkaXNwb3NlIG9sZCBtb2RlbHMgb25jZSB3ZSBoYXZlIHVwZGF0ZWQgdGhlIFVJIHdpdGggdGhlIGN1cnJlbnQgbW9kZWxcblx0XHRcdGlmIChyZXNvbHZlUHJvbWlzZSA9PT0gdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVDb2RlTGVuc2VzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTsgLy8gY2FuIGFsc28gYmUgY2FuY2VsbGF0aW9uIVxuXHRcdFx0aWYgKHJlc29sdmVQcm9taXNlID09PSB0aGlzLl9yZXNvbHZlQ29kZUxlbnNlc1Byb21pc2UpIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0TW9kZWwoKTogUHJvbWlzZTxDb2RlTGVuc01vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0Q29kZUxlbnNNb2RlbFByb21pc2U7XG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUNvZGVMZW5zZXNQcm9taXNlO1xuXHRcdHJldHVybiAhdGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWw/LmlzRGlzcG9zZWRcblx0XHRcdD8gdGhpcy5fY3VycmVudENvZGVMZW5zTW9kZWxcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKENvZGVMZW5zQ29udHJpYnV0aW9uLklELCBDb2RlTGVuc0NvbnRyaWJ1dGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5BZnRlckZpcnN0UmVuZGVyKTtcblxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oY2xhc3MgU2hvd0xlbnNlc0luQ3VycmVudExpbmUgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY29kZWxlbnMuc2hvd0xlbnNlc0luQ3VycmVudExpbmUnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNDb2RlTGVuc1Byb3ZpZGVyLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplMignc2hvd0xlbnNPbkxpbmUnLCBcIlNob3cgQ29kZUxlbnMgQ29tbWFuZHMgZm9yIEN1cnJlbnQgTGluZVwiKSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkucG9zaXRpb25MaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvZGVsZW5zQ29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Q29kZUxlbnNDb250cmlidXRpb24+KENvZGVMZW5zQ29udHJpYnV0aW9uLklEKTtcblx0XHRpZiAoIWNvZGVsZW5zQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgY29kZWxlbnNDb250cm9sbGVyLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0Ly8gbm90aGluZ1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zOiB7IGxhYmVsOiBzdHJpbmc7IGNvbW1hbmQ6IENvbW1hbmQgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBsZW5zIG9mIG1vZGVsLmxlbnNlcykge1xuXHRcdFx0aWYgKGxlbnMuc3ltYm9sLmNvbW1hbmQgJiYgbGVucy5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsZW5zLnN5bWJvbC5jb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGxlbnMuc3ltYm9sLmNvbW1hbmRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gV2UgZG9udCB3YW50IGFuIGVtcHR5IHBpY2tlclxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRjYW5QaWNrTWFueTogZmFsc2UsXG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BsYWNlSG9sZGVyJywgXCJTZWxlY3QgYSBjb21tYW5kXCIpXG5cdFx0fSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHBpY2tlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjb21tYW5kID0gaXRlbS5jb21tYW5kO1xuXG5cdFx0aWYgKG1vZGVsLmlzRGlzcG9zZWQpIHtcblx0XHRcdC8vIHRyeSB0byBmaW5kIHRoZSBzYW1lIGNvbW1hbmQgYWdhaW4gaW4tY2FzZSB0aGUgbW9kZWwgaGFzIGJlZW4gcmUtY3JlYXRlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdC8vIHRoaXMgaXMgYSBiZXN0IGF0dGVtcHQgYXBwcm9hY2ggd2hpY2ggc2hvdWxkbid0IGJlIG5lZWRlZCBiZWNhdXNlIGVhZ2VyIG1vZGVsIHJlLWNyZWF0ZXNcblx0XHRcdC8vIHNob3VsZG4ndCBoYXBwZW4gZHVlIHRvIGZvY3VzIGluL291dCBhbnltb3JlXG5cdFx0XHRjb25zdCBuZXdNb2RlbCA9IGF3YWl0IGNvZGVsZW5zQ29udHJvbGxlci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgbmV3TGVucyA9IG5ld01vZGVsPy5sZW5zZXMuZmluZChsZW5zID0+IGxlbnMuc3ltYm9sLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlciAmJiBsZW5zLnN5bWJvbC5jb21tYW5kPy50aXRsZSA9PT0gY29tbWFuZC50aXRsZSk7XG5cdFx0XHRpZiAoIW5ld0xlbnMgfHwgIW5ld0xlbnMuc3ltYm9sLmNvbW1hbmQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29tbWFuZCA9IG5ld0xlbnMuc3ltYm9sLmNvbW1hbmQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuaWQsIC4uLihjb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQTRCLHlCQUF5QixtQkFBbUIsd0JBQXdCO0FBQ2hHLFNBQVMsbUJBQW1CLGlDQUFp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QUksQ0FBQyxNQUFNO0FBRVY7QUFBQSxJQUNEO0FBRUEsUUFBSSxVQUFVLEtBQUs7QUFFbkIsUUFBSSxNQUFNLFlBQVk7QUFJckIsWUFBTSxXQUFXLE1BQU0sbUJBQW1CLFNBQVM7QUFDbkQsWUFBTSxVQUFVLFVBQVUsT0FBTyxLQUFLLFVBQVEsS0FBSyxPQUFPLE1BQU0sb0JBQW9CLGNBQWMsS0FBSyxPQUFPLFNBQVMsVUFBVSxRQUFRLEtBQUs7QUFDOUksVUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLE9BQU8sU0FBUztBQUN4QztBQUFBLE1BQ0Q7QUFDQSxnQkFBVSxRQUFRLE9BQU87QUFBQSxJQUMxQjtBQUVBLFFBQUk7QUFDSCxZQUFNLGVBQWUsZUFBZSxRQUFRLElBQUksR0FBSSxRQUFRLGFBQWEsQ0FBQyxDQUFFO0FBQUEsSUFDN0UsU0FBUyxLQUFLO0FBQ2IsMEJBQW9CLE1BQU0sR0FBRztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbInByb21pc2VzIiwgInJlcXVlc3QiLCAiaSJdCn0K
