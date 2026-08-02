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
import * as nls from "../../../../nls.js";
import "./media/dirtydiffDecorator.css";
import { Disposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { OverviewRulerLane, MinimapPosition } from "../../../../editor/common/model.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ChangeType, getChangeType, IQuickDiffService, minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from "../common/quickDiff.js";
import { IQuickDiffModelService } from "./quickDiffModel.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ContextKeyTrueExpr, ContextKeyFalseExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
const quickDiffDecorationCount = new RawContextKey("quickDiffDecorationCount", 0);
let QuickDiffDecorator = class extends Disposable {
  constructor(codeEditor, quickDiffModelRef, configurationService, quickDiffService) {
    super();
    this.codeEditor = codeEditor;
    this.quickDiffModelRef = quickDiffModelRef;
    this.configurationService = configurationService;
    this.quickDiffService = quickDiffService;
    const decorations = configurationService.getValue("scm.diffDecorations");
    const gutter = decorations === "all" || decorations === "gutter";
    const overview = decorations === "all" || decorations === "overview";
    const minimap = decorations === "all" || decorations === "minimap";
    const diffAdded = nls.localize("diffAdded", "Added lines");
    const diffAddedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerAddedForeground },
      minimap: { active: minimap, color: minimapGutterAddedBackground },
      isWholeLine: true
    };
    this.addedOptions = QuickDiffDecorator.createDecoration("dirty-diff-added primary", diffAdded, diffAddedOptions);
    this.addedPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-added primary pattern", diffAdded, diffAddedOptions);
    this.addedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-added secondary", diffAdded, diffAddedOptions);
    this.addedSecondaryPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-added secondary pattern", diffAdded, diffAddedOptions);
    const diffModified = nls.localize("diffModified", "Changed lines");
    const diffModifiedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerModifiedForeground },
      minimap: { active: minimap, color: minimapGutterModifiedBackground },
      isWholeLine: true
    };
    this.modifiedOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified primary", diffModified, diffModifiedOptions);
    this.modifiedPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified primary pattern", diffModified, diffModifiedOptions);
    this.modifiedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified secondary", diffModified, diffModifiedOptions);
    this.modifiedSecondaryPatternOptions = QuickDiffDecorator.createDecoration("dirty-diff-modified secondary pattern", diffModified, diffModifiedOptions);
    const diffDeleted = nls.localize("diffDeleted", "Removed lines");
    const diffDeletedOptions = {
      gutter,
      overview: { active: overview, color: overviewRulerDeletedForeground },
      minimap: { active: minimap, color: minimapGutterDeletedBackground },
      isWholeLine: false
    };
    this.deletedOptions = QuickDiffDecorator.createDecoration("dirty-diff-deleted primary", diffDeleted, diffDeletedOptions);
    this.deletedSecondaryOptions = QuickDiffDecorator.createDecoration("dirty-diff-deleted secondary", diffDeleted, diffDeletedOptions);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("scm.diffDecorationsGutterPattern")) {
        this.onDidChange();
      }
    }));
    this._register(Event.runAndSubscribe(this.quickDiffModelRef.object.onDidChange, () => this.onDidChange()));
  }
  static createDecoration(className, tooltip, options) {
    const decorationOptions = {
      description: "dirty-diff-decoration",
      isWholeLine: options.isWholeLine
    };
    if (options.gutter) {
      decorationOptions.linesDecorationsClassName = `dirty-diff-glyph ${className}`;
      decorationOptions.linesDecorationsTooltip = tooltip;
    }
    if (options.overview.active) {
      decorationOptions.overviewRuler = {
        color: themeColorFromId(options.overview.color),
        position: OverviewRulerLane.Left
      };
    }
    if (options.minimap.active) {
      decorationOptions.minimap = {
        color: themeColorFromId(options.minimap.color),
        position: MinimapPosition.Gutter
      };
    }
    return ModelDecorationOptions.createDynamic(decorationOptions);
  }
  onDidChange() {
    if (!this.codeEditor.hasModel()) {
      return;
    }
    const pattern = this.configurationService.getValue("scm.diffDecorationsGutterPattern");
    const primaryQuickDiff = this.quickDiffModelRef.object.quickDiffs.find((quickDiff) => quickDiff.kind === "primary");
    const primaryQuickDiffChanges = this.quickDiffModelRef.object.changes.filter((change) => change.providerId === primaryQuickDiff?.id);
    const decorations = [];
    for (const change of this.quickDiffModelRef.object.changes) {
      const quickDiff = this.quickDiffModelRef.object.quickDiffs.find((quickDiff2) => quickDiff2.id === change.providerId);
      if (!quickDiff || !this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id)) {
        continue;
      }
      if (quickDiff.kind !== "primary" && primaryQuickDiffChanges.some((c) => c.change2.modified.intersectsOrTouches(change.change2.modified))) {
        continue;
      }
      const changeType = getChangeType(change.change);
      const startLineNumber = change.change.modifiedStartLineNumber;
      const endLineNumber = change.change.modifiedEndLineNumber || startLineNumber;
      switch (changeType) {
        case ChangeType.Add:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: 1,
              endLineNumber,
              endColumn: 1
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? pattern.added ? this.addedPatternOptions : this.addedOptions : pattern.added ? this.addedSecondaryPatternOptions : this.addedSecondaryOptions
          });
          break;
        case ChangeType.Delete:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: Number.MAX_VALUE,
              endLineNumber: startLineNumber,
              endColumn: Number.MAX_VALUE
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? this.deletedOptions : this.deletedSecondaryOptions
          });
          break;
        case ChangeType.Modify:
          decorations.push({
            range: {
              startLineNumber,
              startColumn: 1,
              endLineNumber,
              endColumn: 1
            },
            options: quickDiff.kind === "primary" || quickDiff.kind === "contributed" ? pattern.modified ? this.modifiedPatternOptions : this.modifiedOptions : pattern.modified ? this.modifiedSecondaryPatternOptions : this.modifiedSecondaryOptions
          });
          break;
      }
    }
    if (!this.decorationsCollection) {
      this.decorationsCollection = this.codeEditor.createDecorationsCollection(decorations);
    } else {
      this.decorationsCollection.set(decorations);
    }
  }
  dispose() {
    if (this.decorationsCollection) {
      this.decorationsCollection.clear();
    }
    this.decorationsCollection = void 0;
    this.quickDiffModelRef.dispose();
    super.dispose();
  }
};
QuickDiffDecorator = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickDiffService)
], QuickDiffDecorator);
let QuickDiffWorkbenchController = class extends Disposable {
  constructor(editorService, configurationService, quickDiffModelService, quickDiffService, uriIdentityService, contextKeyService) {
    super();
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.quickDiffModelService = quickDiffModelService;
    this.quickDiffService = quickDiffService;
    this.uriIdentityService = uriIdentityService;
    this.enabled = false;
    // Resource URI -> Code Editor Id -> Decoration (Disposable)
    this.decorators = new ResourceMap();
    this.viewState = { width: 3, visibility: "always" };
    this.transientDisposables = this._register(new DisposableStore());
    this.stylesheet = domStylesheetsJs.createStyleSheet(void 0, void 0, this._store);
    this.quickDiffDecorationCount = quickDiffDecorationCount.bindTo(contextKeyService);
    this.activeEditor = observableFromEvent(
      this,
      this.editorService.onDidActiveEditorChange,
      () => this.editorService.activeEditor
    );
    this.quickDiffProviders = observableFromEvent(
      this,
      this.quickDiffService.onDidChangeQuickDiffProviders,
      () => this.quickDiffService.providers
    );
    const onDidChangeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorations"));
    this._register(onDidChangeConfiguration(this.onDidChangeConfiguration, this));
    this.onDidChangeConfiguration();
    const onDidChangeDiffWidthConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterWidth"));
    this._register(onDidChangeDiffWidthConfiguration(this.onDidChangeDiffWidthConfiguration, this));
    this.onDidChangeDiffWidthConfiguration();
    const onDidChangeDiffVisibilityConfiguration = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterVisibility"));
    this._register(onDidChangeDiffVisibilityConfiguration(this.onDidChangeDiffVisibilityConfiguration, this));
    this.onDidChangeDiffVisibilityConfiguration();
  }
  onDidChangeConfiguration() {
    const enabled = this.configurationService.getValue("scm.diffDecorations") !== "none";
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }
  onDidChangeDiffWidthConfiguration() {
    let width = this.configurationService.getValue("scm.diffDecorationsGutterWidth");
    if (isNaN(width) || width <= 0 || width > 5) {
      width = 3;
    }
    this.setViewState({ ...this.viewState, width });
  }
  onDidChangeDiffVisibilityConfiguration() {
    const visibility = this.configurationService.getValue("scm.diffDecorationsGutterVisibility");
    this.setViewState({ ...this.viewState, visibility });
  }
  setViewState(state) {
    this.viewState = state;
    this.stylesheet.textContent = `
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified {
				border-left-width:${state.width}px;
			}
			.monaco-editor .dirty-diff-added.pattern,
			.monaco-editor .dirty-diff-added.pattern:before,
			.monaco-editor .dirty-diff-modified.pattern,
			.monaco-editor .dirty-diff-modified.pattern:before {
				background-size: ${state.width}px ${state.width}px;
			}
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified,
			.monaco-editor .dirty-diff-deleted {
				opacity: ${state.visibility === "always" ? 1 : 0};
			}
		`;
  }
  enable() {
    if (this.enabled) {
      this.disable();
    }
    this.transientDisposables.add(Event.any(this.editorService.onDidCloseEditor, this.editorService.onDidVisibleEditorsChange)(() => this.onEditorsChanged()));
    this.onEditorsChanged();
    this.onDidActiveEditorChange();
    this.onDidChangeQuickDiffProviders();
    this.enabled = true;
  }
  disable() {
    if (!this.enabled) {
      return;
    }
    this.transientDisposables.clear();
    this.quickDiffDecorationCount.set(0);
    for (const [uri, decoratorMap] of this.decorators.entries()) {
      decoratorMap.dispose();
      this.decorators.delete(uri);
    }
    this.enabled = false;
  }
  onDidActiveEditorChange() {
    this.transientDisposables.add(autorun((reader) => {
      const activeEditor = this.activeEditor.read(reader);
      const activeTextEditorControl = this.editorService.activeTextEditorControl;
      if (!isCodeEditor(activeTextEditorControl) || !activeEditor?.resource) {
        this.quickDiffDecorationCount.set(0);
        return;
      }
      const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(activeEditor.resource);
      if (!quickDiffModelRef) {
        this.quickDiffDecorationCount.set(0);
        return;
      }
      reader.store.add(quickDiffModelRef);
      const visibleDecorationCount = observableFromEvent(
        this,
        quickDiffModelRef.object.onDidChange,
        () => {
          const visibleQuickDiffs = quickDiffModelRef.object.quickDiffs.filter((quickDiff) => this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
          return quickDiffModelRef.object.changes.filter((change) => visibleQuickDiffs.some((quickDiff) => quickDiff.id === change.providerId)).length;
        }
      );
      reader.store.add(autorun((reader2) => {
        const count = visibleDecorationCount.read(reader2);
        this.quickDiffDecorationCount.set(count);
      }));
    }));
  }
  onDidChangeQuickDiffProviders() {
    this.transientDisposables.add(autorun((reader) => {
      const providers = this.quickDiffProviders.read(reader);
      const labels = [];
      for (let index = 0; index < providers.length; index++) {
        const provider = providers[index];
        if (labels.includes(provider.label)) {
          continue;
        }
        const visible = this.quickDiffService.isQuickDiffProviderVisible(provider.id);
        const group = provider.kind !== "contributed" ? "0_scm" : "1_contributed";
        const order = index + 1;
        reader.store.add(registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.scm.action.toggleQuickDiffVisibility.${provider.id}`,
              title: provider.label,
              toggled: visible ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE,
              menu: {
                id: MenuId.SCMQuickDiffDecorations,
                group,
                order
              },
              f1: false
            });
          }
          run(accessor) {
            const quickDiffService = accessor.get(IQuickDiffService);
            quickDiffService.toggleQuickDiffProviderVisibility(provider.id);
          }
        }));
        labels.push(provider.label);
      }
    }));
  }
  onEditorsChanged() {
    for (const editor of this.editorService.visibleTextEditorControls) {
      if (!isCodeEditor(editor)) {
        continue;
      }
      const textModel = editor.getModel();
      if (!textModel) {
        continue;
      }
      const editorId = editor.getId();
      if (this.decorators.get(textModel.uri)?.has(editorId)) {
        continue;
      }
      const quickDiffModelRef = this.quickDiffModelService.createQuickDiffModelReference(textModel.uri);
      if (!quickDiffModelRef) {
        continue;
      }
      if (!this.decorators.has(textModel.uri)) {
        this.decorators.set(textModel.uri, new DisposableMap());
      }
      this.decorators.get(textModel.uri).set(editorId, new QuickDiffDecorator(editor, quickDiffModelRef, this.configurationService, this.quickDiffService));
    }
    for (const [uri, decoratorMap] of this.decorators.entries()) {
      for (const editorId of decoratorMap.keys()) {
        const codeEditor = this.editorService.visibleTextEditorControls.find((editor) => isCodeEditor(editor) && editor.getId() === editorId && this.uriIdentityService.extUri.isEqual(editor.getModel()?.uri, uri));
        if (!codeEditor) {
          decoratorMap.deleteAndDispose(editorId);
        }
      }
      if (decoratorMap.size === 0) {
        decoratorMap.dispose();
        this.decorators.delete(uri);
      }
    }
  }
  dispose() {
    this.disable();
    super.dispose();
  }
};
QuickDiffWorkbenchController = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickDiffModelService),
  __decorateParam(3, IQuickDiffService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IContextKeyService)
], QuickDiffWorkbenchController);
export {
  QuickDiffWorkbenchController,
  quickDiffDecorationCount
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3F1aWNrRGlmZkRlY29yYXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgJy4vbWVkaWEvZGlydHlkaWZmRGVjb3JhdG9yLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGVNYXAsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckxhbmUsIElNb2RlbERlY29yYXRpb25PcHRpb25zLCBNaW5pbWFwUG9zaXRpb24sIElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlVHlwZSwgZ2V0Q2hhbmdlVHlwZSwgSVF1aWNrRGlmZlNlcnZpY2UsIFF1aWNrRGlmZlByb3ZpZGVyLCBtaW5pbWFwR3V0dGVyQWRkZWRCYWNrZ3JvdW5kLCBtaW5pbWFwR3V0dGVyRGVsZXRlZEJhY2tncm91bmQsIG1pbmltYXBHdXR0ZXJNb2RpZmllZEJhY2tncm91bmQsIG92ZXJ2aWV3UnVsZXJBZGRlZEZvcmVncm91bmQsIG92ZXJ2aWV3UnVsZXJEZWxldGVkRm9yZWdyb3VuZCwgb3ZlcnZpZXdSdWxlck1vZGlmaWVkRm9yZWdyb3VuZCB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0RpZmYuanMnO1xuaW1wb3J0IHsgUXVpY2tEaWZmTW9kZWwsIElRdWlja0RpZmZNb2RlbFNlcnZpY2UgfSBmcm9tICcuL3F1aWNrRGlmZk1vZGVsLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlUcnVlRXhwciwgQ29udGV4dEtleUZhbHNlRXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgcXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50ID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPigncXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50JywgMCk7XG5cbmNsYXNzIFF1aWNrRGlmZkRlY29yYXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyBjcmVhdGVEZWNvcmF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcgfCBudWxsLCBvcHRpb25zOiB7IGd1dHRlcjogYm9vbGVhbjsgb3ZlcnZpZXc6IHsgYWN0aXZlOiBib29sZWFuOyBjb2xvcjogc3RyaW5nIH07IG1pbmltYXA6IHsgYWN0aXZlOiBib29sZWFuOyBjb2xvcjogc3RyaW5nIH07IGlzV2hvbGVMaW5lOiBib29sZWFuIH0pOiBNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBkZWNvcmF0aW9uT3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ2RpcnR5LWRpZmYtZGVjb3JhdGlvbicsXG5cdFx0XHRpc1dob2xlTGluZTogb3B0aW9ucy5pc1dob2xlTGluZSxcblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMuZ3V0dGVyKSB7XG5cdFx0XHRkZWNvcmF0aW9uT3B0aW9ucy5saW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lID0gYGRpcnR5LWRpZmYtZ2x5cGggJHtjbGFzc05hbWV9YDtcblx0XHRcdGRlY29yYXRpb25PcHRpb25zLmxpbmVzRGVjb3JhdGlvbnNUb29sdGlwID0gdG9vbHRpcDtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5vdmVydmlldy5hY3RpdmUpIHtcblx0XHRcdGRlY29yYXRpb25PcHRpb25zLm92ZXJ2aWV3UnVsZXIgPSB7XG5cdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKG9wdGlvbnMub3ZlcnZpZXcuY29sb3IpLFxuXHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuTGVmdFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5taW5pbWFwLmFjdGl2ZSkge1xuXHRcdFx0ZGVjb3JhdGlvbk9wdGlvbnMubWluaW1hcCA9IHtcblx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3B0aW9ucy5taW5pbWFwLmNvbG9yKSxcblx0XHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXJcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyhkZWNvcmF0aW9uT3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFkZGVkT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBhZGRlZFNlY29uZGFyeU9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgYWRkZWRQYXR0ZXJuT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBhZGRlZFNlY29uZGFyeVBhdHRlcm5PcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIG1vZGlmaWVkT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBtb2RpZmllZFNlY29uZGFyeU9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgbW9kaWZpZWRQYXR0ZXJuT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBtb2RpZmllZFNlY29uZGFyeVBhdHRlcm5PcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGRlbGV0ZWRPcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGRlbGV0ZWRTZWNvbmRhcnlPcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGRlY29yYXRpb25zQ29sbGVjdGlvbjogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmTW9kZWxSZWY6IElSZWZlcmVuY2U8UXVpY2tEaWZmTW9kZWw+LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrRGlmZlNlcnZpY2U6IElRdWlja0RpZmZTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3NjbS5kaWZmRGVjb3JhdGlvbnMnKTtcblx0XHRjb25zdCBndXR0ZXIgPSBkZWNvcmF0aW9ucyA9PT0gJ2FsbCcgfHwgZGVjb3JhdGlvbnMgPT09ICdndXR0ZXInO1xuXHRcdGNvbnN0IG92ZXJ2aWV3ID0gZGVjb3JhdGlvbnMgPT09ICdhbGwnIHx8IGRlY29yYXRpb25zID09PSAnb3ZlcnZpZXcnO1xuXHRcdGNvbnN0IG1pbmltYXAgPSBkZWNvcmF0aW9ucyA9PT0gJ2FsbCcgfHwgZGVjb3JhdGlvbnMgPT09ICdtaW5pbWFwJztcblxuXHRcdGNvbnN0IGRpZmZBZGRlZCA9IG5scy5sb2NhbGl6ZSgnZGlmZkFkZGVkJywgJ0FkZGVkIGxpbmVzJyk7XG5cdFx0Y29uc3QgZGlmZkFkZGVkT3B0aW9ucyA9IHtcblx0XHRcdGd1dHRlcixcblx0XHRcdG92ZXJ2aWV3OiB7IGFjdGl2ZTogb3ZlcnZpZXcsIGNvbG9yOiBvdmVydmlld1J1bGVyQWRkZWRGb3JlZ3JvdW5kIH0sXG5cdFx0XHRtaW5pbWFwOiB7IGFjdGl2ZTogbWluaW1hcCwgY29sb3I6IG1pbmltYXBHdXR0ZXJBZGRlZEJhY2tncm91bmQgfSxcblx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlXG5cdFx0fTtcblx0XHR0aGlzLmFkZGVkT3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLWFkZGVkIHByaW1hcnknLCBkaWZmQWRkZWQsIGRpZmZBZGRlZE9wdGlvbnMpO1xuXHRcdHRoaXMuYWRkZWRQYXR0ZXJuT3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLWFkZGVkIHByaW1hcnkgcGF0dGVybicsIGRpZmZBZGRlZCwgZGlmZkFkZGVkT3B0aW9ucyk7XG5cdFx0dGhpcy5hZGRlZFNlY29uZGFyeU9wdGlvbnMgPSBRdWlja0RpZmZEZWNvcmF0b3IuY3JlYXRlRGVjb3JhdGlvbignZGlydHktZGlmZi1hZGRlZCBzZWNvbmRhcnknLCBkaWZmQWRkZWQsIGRpZmZBZGRlZE9wdGlvbnMpO1xuXHRcdHRoaXMuYWRkZWRTZWNvbmRhcnlQYXR0ZXJuT3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLWFkZGVkIHNlY29uZGFyeSBwYXR0ZXJuJywgZGlmZkFkZGVkLCBkaWZmQWRkZWRPcHRpb25zKTtcblxuXHRcdGNvbnN0IGRpZmZNb2RpZmllZCA9IG5scy5sb2NhbGl6ZSgnZGlmZk1vZGlmaWVkJywgJ0NoYW5nZWQgbGluZXMnKTtcblx0XHRjb25zdCBkaWZmTW9kaWZpZWRPcHRpb25zID0ge1xuXHRcdFx0Z3V0dGVyLFxuXHRcdFx0b3ZlcnZpZXc6IHsgYWN0aXZlOiBvdmVydmlldywgY29sb3I6IG92ZXJ2aWV3UnVsZXJNb2RpZmllZEZvcmVncm91bmQgfSxcblx0XHRcdG1pbmltYXA6IHsgYWN0aXZlOiBtaW5pbWFwLCBjb2xvcjogbWluaW1hcEd1dHRlck1vZGlmaWVkQmFja2dyb3VuZCB9LFxuXHRcdFx0aXNXaG9sZUxpbmU6IHRydWVcblx0XHR9O1xuXHRcdHRoaXMubW9kaWZpZWRPcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtbW9kaWZpZWQgcHJpbWFyeScsIGRpZmZNb2RpZmllZCwgZGlmZk1vZGlmaWVkT3B0aW9ucyk7XG5cdFx0dGhpcy5tb2RpZmllZFBhdHRlcm5PcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtbW9kaWZpZWQgcHJpbWFyeSBwYXR0ZXJuJywgZGlmZk1vZGlmaWVkLCBkaWZmTW9kaWZpZWRPcHRpb25zKTtcblx0XHR0aGlzLm1vZGlmaWVkU2Vjb25kYXJ5T3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLW1vZGlmaWVkIHNlY29uZGFyeScsIGRpZmZNb2RpZmllZCwgZGlmZk1vZGlmaWVkT3B0aW9ucyk7XG5cdFx0dGhpcy5tb2RpZmllZFNlY29uZGFyeVBhdHRlcm5PcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtbW9kaWZpZWQgc2Vjb25kYXJ5IHBhdHRlcm4nLCBkaWZmTW9kaWZpZWQsIGRpZmZNb2RpZmllZE9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgZGlmZkRlbGV0ZWQgPSBubHMubG9jYWxpemUoJ2RpZmZEZWxldGVkJywgJ1JlbW92ZWQgbGluZXMnKTtcblx0XHRjb25zdCBkaWZmRGVsZXRlZE9wdGlvbnMgPSB7XG5cdFx0XHRndXR0ZXIsXG5cdFx0XHRvdmVydmlldzogeyBhY3RpdmU6IG92ZXJ2aWV3LCBjb2xvcjogb3ZlcnZpZXdSdWxlckRlbGV0ZWRGb3JlZ3JvdW5kIH0sXG5cdFx0XHRtaW5pbWFwOiB7IGFjdGl2ZTogbWluaW1hcCwgY29sb3I6IG1pbmltYXBHdXR0ZXJEZWxldGVkQmFja2dyb3VuZCB9LFxuXHRcdFx0aXNXaG9sZUxpbmU6IGZhbHNlXG5cdFx0fTtcblx0XHR0aGlzLmRlbGV0ZWRPcHRpb25zID0gUXVpY2tEaWZmRGVjb3JhdG9yLmNyZWF0ZURlY29yYXRpb24oJ2RpcnR5LWRpZmYtZGVsZXRlZCBwcmltYXJ5JywgZGlmZkRlbGV0ZWQsIGRpZmZEZWxldGVkT3B0aW9ucyk7XG5cdFx0dGhpcy5kZWxldGVkU2Vjb25kYXJ5T3B0aW9ucyA9IFF1aWNrRGlmZkRlY29yYXRvci5jcmVhdGVEZWNvcmF0aW9uKCdkaXJ0eS1kaWZmLWRlbGV0ZWQgc2Vjb25kYXJ5JywgZGlmZkRlbGV0ZWQsIGRpZmZEZWxldGVkT3B0aW9ucyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclBhdHRlcm4nKSkge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMucXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvZGVFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdHRlcm4gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgYWRkZWQ6IGJvb2xlYW47IG1vZGlmaWVkOiBib29sZWFuIH0+KCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyUGF0dGVybicpO1xuXG5cdFx0Y29uc3QgcHJpbWFyeVF1aWNrRGlmZiA9IHRoaXMucXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LnF1aWNrRGlmZnMuZmluZChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmtpbmQgPT09ICdwcmltYXJ5Jyk7XG5cdFx0Y29uc3QgcHJpbWFyeVF1aWNrRGlmZkNoYW5nZXMgPSB0aGlzLnF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzLmZpbHRlcihjaGFuZ2UgPT4gY2hhbmdlLnByb3ZpZGVySWQgPT09IHByaW1hcnlRdWlja0RpZmY/LmlkKTtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHRoaXMucXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LmNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IHF1aWNrRGlmZiA9IHRoaXMucXVpY2tEaWZmTW9kZWxSZWYub2JqZWN0LnF1aWNrRGlmZnNcblx0XHRcdFx0LmZpbmQocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5pZCA9PT0gY2hhbmdlLnByb3ZpZGVySWQpO1xuXG5cdFx0XHQvLyBTa2lwIHF1aWNrIGRpZmZzIHRoYXQgYXJlIG5vdCB2aXNpYmxlXG5cdFx0XHRpZiAoIXF1aWNrRGlmZiB8fCAhdGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKHF1aWNrRGlmZi5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChxdWlja0RpZmYua2luZCAhPT0gJ3ByaW1hcnknICYmIHByaW1hcnlRdWlja0RpZmZDaGFuZ2VzLnNvbWUoYyA9PiBjLmNoYW5nZTIubW9kaWZpZWQuaW50ZXJzZWN0c09yVG91Y2hlcyhjaGFuZ2UuY2hhbmdlMi5tb2RpZmllZCkpKSB7XG5cdFx0XHRcdC8vIE92ZXJsYXAgd2l0aCBwcmltYXJ5IHF1aWNrIGRpZmYgY2hhbmdlc1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhbmdlVHlwZSA9IGdldENoYW5nZVR5cGUoY2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBjaGFuZ2UuY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGNoYW5nZS5jaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyIHx8IHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0c3dpdGNoIChjaGFuZ2VUeXBlKSB7XG5cdFx0XHRcdGNhc2UgQ2hhbmdlVHlwZS5BZGQ6XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogMVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHF1aWNrRGlmZi5raW5kID09PSAncHJpbWFyeScgfHwgcXVpY2tEaWZmLmtpbmQgPT09ICdjb250cmlidXRlZCdcblx0XHRcdFx0XHRcdFx0PyBwYXR0ZXJuLmFkZGVkID8gdGhpcy5hZGRlZFBhdHRlcm5PcHRpb25zIDogdGhpcy5hZGRlZE9wdGlvbnNcblx0XHRcdFx0XHRcdFx0OiBwYXR0ZXJuLmFkZGVkID8gdGhpcy5hZGRlZFNlY29uZGFyeVBhdHRlcm5PcHRpb25zIDogdGhpcy5hZGRlZFNlY29uZGFyeU9wdGlvbnNcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VUeXBlLkRlbGV0ZTpcblx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IE51bWJlci5NQVhfVkFMVUVcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBxdWlja0RpZmYua2luZCA9PT0gJ3ByaW1hcnknIHx8IHF1aWNrRGlmZi5raW5kID09PSAnY29udHJpYnV0ZWQnXG5cdFx0XHRcdFx0XHRcdD8gdGhpcy5kZWxldGVkT3B0aW9uc1xuXHRcdFx0XHRcdFx0XHQ6IHRoaXMuZGVsZXRlZFNlY29uZGFyeU9wdGlvbnNcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VUeXBlLk1vZGlmeTpcblx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiAxXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3B0aW9uczogcXVpY2tEaWZmLmtpbmQgPT09ICdwcmltYXJ5JyB8fCBxdWlja0RpZmYua2luZCA9PT0gJ2NvbnRyaWJ1dGVkJ1xuXHRcdFx0XHRcdFx0XHQ/IHBhdHRlcm4ubW9kaWZpZWQgPyB0aGlzLm1vZGlmaWVkUGF0dGVybk9wdGlvbnMgOiB0aGlzLm1vZGlmaWVkT3B0aW9uc1xuXHRcdFx0XHRcdFx0XHQ6IHBhdHRlcm4ubW9kaWZpZWQgPyB0aGlzLm1vZGlmaWVkU2Vjb25kYXJ5UGF0dGVybk9wdGlvbnMgOiB0aGlzLm1vZGlmaWVkU2Vjb25kYXJ5T3B0aW9uc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24pIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdGhpcy5jb2RlRWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihkZWNvcmF0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uLnNldChkZWNvcmF0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24pIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMucXVpY2tEaWZmTW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUXVpY2tEaWZmV29ya2JlbmNoQ29udHJvbGxlclZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZpc2liaWxpdHk6ICdhbHdheXMnIHwgJ2hvdmVyJztcbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrRGlmZldvcmtiZW5jaENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBlbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlRWRpdG9yOiBJT2JzZXJ2YWJsZTxFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmUHJvdmlkZXJzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBRdWlja0RpZmZQcm92aWRlcltdPjtcblxuXHQvLyBSZXNvdXJjZSBVUkkgLT4gQ29kZSBFZGl0b3IgSWQgLT4gRGVjb3JhdGlvbiAoRGlzcG9zYWJsZSlcblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0b3JzID0gbmV3IFJlc291cmNlTWFwPERpc3Bvc2FibGVNYXA8c3RyaW5nPj4oKTtcblx0cHJpdmF0ZSB2aWV3U3RhdGU6IFF1aWNrRGlmZldvcmtiZW5jaENvbnRyb2xsZXJWaWV3U3RhdGUgPSB7IHdpZHRoOiAzLCB2aXNpYmlsaXR5OiAnYWx3YXlzJyB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zaWVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdHlsZXNoZWV0OiBIVE1MU3R5bGVFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmTW9kZWxTZXJ2aWNlOiBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrRGlmZlNlcnZpY2U6IElRdWlja0RpZmZTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnN0eWxlc2hlZXQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMucXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50ID0gcXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmFjdGl2ZUVkaXRvciA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcik7XG5cblx0XHR0aGlzLnF1aWNrRGlmZlByb3ZpZGVycyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMucXVpY2tEaWZmU2VydmljZS5vbkRpZENoYW5nZVF1aWNrRGlmZlByb3ZpZGVycywgKCkgPT4gdGhpcy5xdWlja0RpZmZTZXJ2aWNlLnByb3ZpZGVycyk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBFdmVudC5maWx0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5kaWZmRGVjb3JhdGlvbnMnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKHRoaXMub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCB0aGlzKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlRGlmZldpZHRoQ29uZmlndXJhdGlvbiA9IEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlcldpZHRoJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRGlmZldpZHRoQ29uZmlndXJhdGlvbih0aGlzLm9uRGlkQ2hhbmdlRGlmZldpZHRoQ29uZmlndXJhdGlvbiwgdGhpcykpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VEaWZmV2lkdGhDb25maWd1cmF0aW9uKCk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZURpZmZWaXNpYmlsaXR5Q29uZmlndXJhdGlvbiA9IEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclZpc2liaWxpdHknKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VEaWZmVmlzaWJpbGl0eUNvbmZpZ3VyYXRpb24odGhpcy5vbkRpZENoYW5nZURpZmZWaXNpYmlsaXR5Q29uZmlndXJhdGlvbiwgdGhpcykpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VEaWZmVmlzaWJpbGl0eUNvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3NjbS5kaWZmRGVjb3JhdGlvbnMnKSAhPT0gJ25vbmUnO1xuXG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZW5hYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlzYWJsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VEaWZmV2lkdGhDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGxldCB3aWR0aCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlcldpZHRoJyk7XG5cblx0XHRpZiAoaXNOYU4od2lkdGgpIHx8IHdpZHRoIDw9IDAgfHwgd2lkdGggPiA1KSB7XG5cdFx0XHR3aWR0aCA9IDM7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRWaWV3U3RhdGUoeyAuLi50aGlzLnZpZXdTdGF0ZSwgd2lkdGggfSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlRGlmZlZpc2liaWxpdHlDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2liaWxpdHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhbHdheXMnIHwgJ2hvdmVyJz4oJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJWaXNpYmlsaXR5Jyk7XG5cdFx0dGhpcy5zZXRWaWV3U3RhdGUoeyAuLi50aGlzLnZpZXdTdGF0ZSwgdmlzaWJpbGl0eSB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Vmlld1N0YXRlKHN0YXRlOiBRdWlja0RpZmZXb3JrYmVuY2hDb250cm9sbGVyVmlld1N0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3U3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLnN0eWxlc2hlZXQudGV4dENvbnRlbnQgPSBgXG5cdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1hZGRlZCxcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLW1vZGlmaWVkIHtcblx0XHRcdFx0Ym9yZGVyLWxlZnQtd2lkdGg6JHtzdGF0ZS53aWR0aH1weDtcblx0XHRcdH1cblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLWFkZGVkLnBhdHRlcm4sXG5cdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1hZGRlZC5wYXR0ZXJuOmJlZm9yZSxcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLW1vZGlmaWVkLnBhdHRlcm4sXG5cdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1tb2RpZmllZC5wYXR0ZXJuOmJlZm9yZSB7XG5cdFx0XHRcdGJhY2tncm91bmQtc2l6ZTogJHtzdGF0ZS53aWR0aH1weCAke3N0YXRlLndpZHRofXB4O1xuXHRcdFx0fVxuXHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtYWRkZWQsXG5cdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1tb2RpZmllZCxcblx0XHRcdC5tb25hY28tZWRpdG9yIC5kaXJ0eS1kaWZmLWRlbGV0ZWQge1xuXHRcdFx0XHRvcGFjaXR5OiAke3N0YXRlLnZpc2liaWxpdHkgPT09ICdhbHdheXMnID8gMSA6IDB9O1xuXHRcdFx0fVxuXHRcdGA7XG5cdH1cblxuXHRwcml2YXRlIGVuYWJsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHR0aGlzLmRpc2FibGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IsIHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKSgoKSA9PiB0aGlzLm9uRWRpdG9yc0NoYW5nZWQoKSkpO1xuXHRcdHRoaXMub25FZGl0b3JzQ2hhbmdlZCgpO1xuXG5cdFx0dGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VRdWlja0RpZmZQcm92aWRlcnMoKTtcblxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGRpc2FibGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5xdWlja0RpZmZEZWNvcmF0aW9uQ291bnQuc2V0KDApO1xuXG5cdFx0Zm9yIChjb25zdCBbdXJpLCBkZWNvcmF0b3JNYXBdIG9mIHRoaXMuZGVjb3JhdG9ycy5lbnRyaWVzKCkpIHtcblx0XHRcdGRlY29yYXRvck1hcC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmRlY29yYXRvcnMuZGVsZXRlKHVyaSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuYWN0aXZlRWRpdG9yLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXG5cdFx0XHRpZiAoIWlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkgfHwgIWFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5xdWlja0RpZmZEZWNvcmF0aW9uQ291bnQuc2V0KDApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHF1aWNrRGlmZk1vZGVsUmVmID0gdGhpcy5xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UoYWN0aXZlRWRpdG9yLnJlc291cmNlKTtcblx0XHRcdGlmICghcXVpY2tEaWZmTW9kZWxSZWYpIHtcblx0XHRcdFx0dGhpcy5xdWlja0RpZmZEZWNvcmF0aW9uQ291bnQuc2V0KDApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQocXVpY2tEaWZmTW9kZWxSZWYpO1xuXG5cdFx0XHRjb25zdCB2aXNpYmxlRGVjb3JhdGlvbkNvdW50ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0XHRxdWlja0RpZmZNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2UsICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB2aXNpYmxlUXVpY2tEaWZmcyA9IHF1aWNrRGlmZk1vZGVsUmVmLm9iamVjdC5xdWlja0RpZmZzLmZpbHRlcihxdWlja0RpZmYgPT4gdGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKHF1aWNrRGlmZi5pZCkpO1xuXHRcdFx0XHRcdHJldHVybiBxdWlja0RpZmZNb2RlbFJlZi5vYmplY3QuY2hhbmdlcy5maWx0ZXIoY2hhbmdlID0+IHZpc2libGVRdWlja0RpZmZzLnNvbWUocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5pZCA9PT0gY2hhbmdlLnByb3ZpZGVySWQpKS5sZW5ndGg7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY291bnQgPSB2aXNpYmxlRGVjb3JhdGlvbkNvdW50LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGhpcy5xdWlja0RpZmZEZWNvcmF0aW9uQ291bnQuc2V0KGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUXVpY2tEaWZmUHJvdmlkZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMucXVpY2tEaWZmUHJvdmlkZXJzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgbGFiZWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHByb3ZpZGVycy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlcnNbaW5kZXhdO1xuXHRcdFx0XHRpZiAobGFiZWxzLmluY2x1ZGVzKHByb3ZpZGVyLmxhYmVsKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMucXVpY2tEaWZmU2VydmljZS5pc1F1aWNrRGlmZlByb3ZpZGVyVmlzaWJsZShwcm92aWRlci5pZCk7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gcHJvdmlkZXIua2luZCAhPT0gJ2NvbnRyaWJ1dGVkJyA/ICcwX3NjbScgOiAnMV9jb250cmlidXRlZCc7XG5cdFx0XHRcdGNvbnN0IG9yZGVyID0gaW5kZXggKyAxO1xuXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLnNjbS5hY3Rpb24udG9nZ2xlUXVpY2tEaWZmVmlzaWJpbGl0eS4ke3Byb3ZpZGVyLmlkfWAsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRcdFx0dG9nZ2xlZDogdmlzaWJsZSA/IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSA6IENvbnRleHRLZXlGYWxzZUV4cHIuSU5TVEFOQ0UsXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLlNDTVF1aWNrRGlmZkRlY29yYXRpb25zLCBncm91cCwgb3JkZXJcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZjE6IGZhbHNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdFx0XHRjb25zdCBxdWlja0RpZmZTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0RpZmZTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdHF1aWNrRGlmZlNlcnZpY2UudG9nZ2xlUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmlsaXR5KHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0bGFiZWxzLnB1c2gocHJvdmlkZXIubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZVRleHRFZGl0b3JDb250cm9scykge1xuXHRcdFx0aWYgKCFpc0NvZGVFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9ySWQgPSBlZGl0b3IuZ2V0SWQoKTtcblx0XHRcdGlmICh0aGlzLmRlY29yYXRvcnMuZ2V0KHRleHRNb2RlbC51cmkpPy5oYXMoZWRpdG9ySWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdWlja0RpZmZNb2RlbFJlZiA9IHRoaXMucXVpY2tEaWZmTW9kZWxTZXJ2aWNlLmNyZWF0ZVF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlKHRleHRNb2RlbC51cmkpO1xuXHRcdFx0aWYgKCFxdWlja0RpZmZNb2RlbFJlZikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmRlY29yYXRvcnMuaGFzKHRleHRNb2RlbC51cmkpKSB7XG5cdFx0XHRcdHRoaXMuZGVjb3JhdG9ycy5zZXQodGV4dE1vZGVsLnVyaSwgbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kZWNvcmF0b3JzLmdldCh0ZXh0TW9kZWwudXJpKSEuc2V0KGVkaXRvcklkLCBuZXcgUXVpY2tEaWZmRGVjb3JhdG9yKGVkaXRvciwgcXVpY2tEaWZmTW9kZWxSZWYsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMucXVpY2tEaWZmU2VydmljZSkpO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2UgZGVjb3JhdG9ycyBmb3IgZWRpdG9ycyB0aGF0IGFyZSBubyBsb25nZXIgdmlzaWJsZS5cblx0XHRmb3IgKGNvbnN0IFt1cmksIGRlY29yYXRvck1hcF0gb2YgdGhpcy5kZWNvcmF0b3JzLmVudHJpZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3JJZCBvZiBkZWNvcmF0b3JNYXAua2V5cygpKSB7XG5cdFx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZVRleHRFZGl0b3JDb250cm9sc1xuXHRcdFx0XHRcdC5maW5kKGVkaXRvciA9PiBpc0NvZGVFZGl0b3IoZWRpdG9yKSAmJiBlZGl0b3IuZ2V0SWQoKSA9PT0gZWRpdG9ySWQgJiZcblx0XHRcdFx0XHRcdHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGVkaXRvci5nZXRNb2RlbCgpPy51cmksIHVyaSkpO1xuXG5cdFx0XHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0XHRcdGRlY29yYXRvck1hcC5kZWxldGVBbmREaXNwb3NlKGVkaXRvcklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGVjb3JhdG9yTWFwLnNpemUgPT09IDApIHtcblx0XHRcdFx0ZGVjb3JhdG9yTWFwLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5kZWNvcmF0b3JzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNhYmxlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixPQUFPO0FBQ1AsU0FBUyxZQUFZLGlCQUFpQixxQkFBaUM7QUFDdkUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNkJBQTZCO0FBQ3RD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
