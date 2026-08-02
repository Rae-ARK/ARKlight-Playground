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
import * as arrays from "../../../../base/common/arrays.js";
import { Delayer, first } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Color } from "../../../../base/common/color.js";
import { isCancellationError, onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import * as nls from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import "./linkedEditing.css";
const CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE = new RawContextKey("LinkedEditingInputVisible", false);
const DECORATION_CLASS_NAME = "linked-editing-decoration";
let LinkedEditingContribution = class extends Disposable {
  constructor(editor, contextKeyService, languageFeaturesService, languageConfigurationService, languageFeatureDebounceService) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    // The one at index 0 is the reference one
    this._syncRangesToken = 0;
    this._localToDispose = this._register(new DisposableStore());
    this._editor = editor;
    this._providers = languageFeaturesService.linkedEditingRangeProvider;
    this._enabled = false;
    this._visibleContextKey = CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
    this._debounceInformation = languageFeatureDebounceService.for(this._providers, "Linked Editing", { max: 200 });
    this._currentDecorations = this._editor.createDecorationsCollection();
    this._languageWordPattern = null;
    this._currentWordPattern = null;
    this._ignoreChangeEvent = false;
    this._localToDispose = this._register(new DisposableStore());
    this._rangeUpdateTriggerPromise = null;
    this._rangeSyncTriggerPromise = null;
    this._currentRequestCts = null;
    this._currentRequestPosition = null;
    this._currentRequestModelVersion = null;
    this._register(this._editor.onDidChangeModel(() => this.reinitialize(true)));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.linkedEditing) || e.hasChanged(EditorOption.renameOnType)) {
        this.reinitialize(false);
      }
    }));
    this._register(this._providers.onDidChange(() => this.reinitialize(false)));
    this._register(this._editor.onDidChangeModelLanguage(() => this.reinitialize(true)));
    this.reinitialize(true);
  }
  static get(editor) {
    return editor.getContribution(LinkedEditingContribution.ID);
  }
  reinitialize(forceRefresh) {
    const model = this._editor.getModel();
    const isEnabled = model !== null && (this._editor.getOption(EditorOption.linkedEditing) || this._editor.getOption(EditorOption.renameOnType)) && this._providers.has(model);
    if (isEnabled === this._enabled && !forceRefresh) {
      return;
    }
    this._enabled = isEnabled;
    this.clearRanges();
    this._localToDispose.clear();
    if (!isEnabled || model === null) {
      return;
    }
    this._localToDispose.add(
      Event.runAndSubscribe(
        model.onDidChangeLanguageConfiguration,
        () => {
          this._languageWordPattern = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        }
      )
    );
    const rangeUpdateScheduler = new Delayer(this._debounceInformation.get(model));
    const triggerRangeUpdate = () => {
      this._rangeUpdateTriggerPromise = rangeUpdateScheduler.trigger(() => this.updateRanges(), this._debounceDuration ?? this._debounceInformation.get(model));
    };
    const rangeSyncScheduler = new Delayer(0);
    const triggerRangeSync = (token) => {
      this._rangeSyncTriggerPromise = rangeSyncScheduler.trigger(() => this._syncRanges(token));
    };
    this._localToDispose.add(this._editor.onDidChangeCursorPosition(() => {
      triggerRangeUpdate();
    }));
    this._localToDispose.add(this._editor.onDidChangeModelContent((e) => {
      if (!this._ignoreChangeEvent) {
        if (this._currentDecorations.length > 0) {
          const referenceRange = this._currentDecorations.getRange(0);
          if (referenceRange && e.changes.every((c) => referenceRange.intersectRanges(c.range))) {
            triggerRangeSync(this._syncRangesToken);
            return;
          }
        }
      }
      triggerRangeUpdate();
    }));
    this._localToDispose.add({
      dispose: () => {
        rangeUpdateScheduler.dispose();
        rangeSyncScheduler.dispose();
      }
    });
    this.updateRanges();
  }
  _syncRanges(token) {
    if (!this._editor.hasModel() || token !== this._syncRangesToken || this._currentDecorations.length === 0) {
      return;
    }
    const model = this._editor.getModel();
    const referenceRange = this._currentDecorations.getRange(0);
    if (!referenceRange || referenceRange.startLineNumber !== referenceRange.endLineNumber) {
      return this.clearRanges();
    }
    const referenceValue = model.getValueInRange(referenceRange);
    if (this._currentWordPattern) {
      const match = referenceValue.match(this._currentWordPattern);
      const matchLength = match ? match[0].length : 0;
      if (matchLength !== referenceValue.length) {
        return this.clearRanges();
      }
    }
    const edits = [];
    for (let i = 1, len = this._currentDecorations.length; i < len; i++) {
      const mirrorRange = this._currentDecorations.getRange(i);
      if (!mirrorRange) {
        continue;
      }
      if (mirrorRange.startLineNumber !== mirrorRange.endLineNumber) {
        edits.push({
          range: mirrorRange,
          text: referenceValue
        });
      } else {
        let oldValue = model.getValueInRange(mirrorRange);
        let newValue = referenceValue;
        let rangeStartColumn = mirrorRange.startColumn;
        let rangeEndColumn = mirrorRange.endColumn;
        const commonPrefixLength = strings.commonPrefixLength(oldValue, newValue);
        rangeStartColumn += commonPrefixLength;
        oldValue = oldValue.substr(commonPrefixLength);
        newValue = newValue.substr(commonPrefixLength);
        const commonSuffixLength = strings.commonSuffixLength(oldValue, newValue);
        rangeEndColumn -= commonSuffixLength;
        oldValue = oldValue.substr(0, oldValue.length - commonSuffixLength);
        newValue = newValue.substr(0, newValue.length - commonSuffixLength);
        if (rangeStartColumn !== rangeEndColumn || newValue.length !== 0) {
          edits.push({
            range: new Range(mirrorRange.startLineNumber, rangeStartColumn, mirrorRange.endLineNumber, rangeEndColumn),
            text: newValue
          });
        }
      }
    }
    if (edits.length === 0) {
      return;
    }
    try {
      this._editor.popUndoStop();
      this._ignoreChangeEvent = true;
      const prevEditOperationType = this._editor._getViewModel().getPrevEditOperationType();
      this._editor.executeEdits("linkedEditing", edits);
      this._editor._getViewModel().setPrevEditOperationType(prevEditOperationType);
    } finally {
      this._ignoreChangeEvent = false;
    }
  }
  dispose() {
    this.clearRanges();
    super.dispose();
  }
  clearRanges() {
    this._visibleContextKey.set(false);
    this._currentDecorations.clear();
    if (this._currentRequestCts) {
      this._currentRequestCts.cancel();
      this._currentRequestCts = null;
      this._currentRequestPosition = null;
    }
  }
  get currentUpdateTriggerPromise() {
    return this._rangeUpdateTriggerPromise || Promise.resolve();
  }
  get currentSyncTriggerPromise() {
    return this._rangeSyncTriggerPromise || Promise.resolve();
  }
  async updateRanges(force = false) {
    if (!this._editor.hasModel()) {
      this.clearRanges();
      return;
    }
    const position = this._editor.getPosition();
    if (!this._enabled && !force || this._editor.getSelections().length > 1) {
      this.clearRanges();
      return;
    }
    const model = this._editor.getModel();
    const modelVersionId = model.getVersionId();
    if (this._currentRequestPosition && this._currentRequestModelVersion === modelVersionId) {
      if (position.equals(this._currentRequestPosition)) {
        return;
      }
      if (this._currentDecorations.length > 0) {
        const range = this._currentDecorations.getRange(0);
        if (range && range.containsPosition(position)) {
          return;
        }
      }
    }
    if (!this._currentRequestPosition?.equals(position)) {
      const currentRange = this._currentDecorations.getRange(0);
      if (!currentRange?.containsPosition(position)) {
        this.clearRanges();
      }
    }
    this._currentRequestPosition = position;
    this._currentRequestModelVersion = modelVersionId;
    const currentRequestCts = this._currentRequestCts = new CancellationTokenSource();
    try {
      const sw = new StopWatch(false);
      const response = await getLinkedEditingRanges(this._providers, model, position, currentRequestCts.token);
      this._debounceInformation.update(model, sw.elapsed());
      if (currentRequestCts !== this._currentRequestCts) {
        return;
      }
      this._currentRequestCts = null;
      if (modelVersionId !== model.getVersionId()) {
        return;
      }
      let ranges = [];
      if (response?.ranges) {
        ranges = response.ranges;
      }
      this._currentWordPattern = response?.wordPattern || this._languageWordPattern;
      let foundReferenceRange = false;
      for (let i = 0, len = ranges.length; i < len; i++) {
        if (Range.containsPosition(ranges[i], position)) {
          foundReferenceRange = true;
          if (i !== 0) {
            const referenceRange = ranges[i];
            ranges.splice(i, 1);
            ranges.unshift(referenceRange);
          }
          break;
        }
      }
      if (!foundReferenceRange) {
        this.clearRanges();
        return;
      }
      const decorations = ranges.map((range) => ({ range, options: LinkedEditingContribution.DECORATION }));
      this._visibleContextKey.set(true);
      this._currentDecorations.set(decorations);
      this._syncRangesToken++;
    } catch (err) {
      if (!isCancellationError(err)) {
        onUnexpectedError(err);
      }
      if (this._currentRequestCts === currentRequestCts || !this._currentRequestCts) {
        this.clearRanges();
      }
    }
  }
  // for testing
  setDebounceDuration(timeInMS) {
    this._debounceDuration = timeInMS;
  }
  // private printDecorators(model: ITextModel) {
  // 	return this._currentDecorations.map(d => {
  // 		const range = model.getDecorationRange(d);
  // 		if (range) {
  // 			return this.printRange(range);
  // 		}
  // 		return 'invalid';
  // 	}).join(',');
  // }
  // private printChanges(changes: IModelContentChange[]) {
  // 	return changes.map(c => {
  // 		return `${this.printRange(c.range)} - ${c.text}`;
  // 	}
  // 	).join(',');
  // }
  // private printRange(range: IRange) {
  // 	return `${range.startLineNumber},${range.startColumn}/${range.endLineNumber},${range.endColumn}`;
  // }
};
LinkedEditingContribution.ID = "editor.contrib.linkedEditing";
LinkedEditingContribution.DECORATION = ModelDecorationOptions.register({
  description: "linked-editing",
  stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
  className: DECORATION_CLASS_NAME
});
LinkedEditingContribution = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, ILanguageFeatureDebounceService)
], LinkedEditingContribution);
class LinkedEditingAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.linkedEditing",
      label: nls.localize2("linkedEditing.label", "Start Linked Editing"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runCommand(accessor, args) {
    const editorService = accessor.get(ICodeEditorService);
    const [uri, pos] = Array.isArray(args) && args || [void 0, void 0];
    if (URI.isUri(uri) && Position.isIPosition(pos)) {
      return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then((editor) => {
        if (!editor) {
          return;
        }
        editor.setPosition(pos);
        editor.invokeWithinContext((accessor2) => {
          this.reportTelemetry(accessor2, editor);
          return this.run(accessor2, editor);
        });
      }, onUnexpectedError);
    }
    return super.runCommand(accessor, args);
  }
  run(_accessor, editor) {
    const controller = LinkedEditingContribution.get(editor);
    if (controller) {
      return Promise.resolve(controller.updateRanges(true));
    }
    return Promise.resolve();
  }
}
const LinkedEditingCommand = EditorCommand.bindToContribution(LinkedEditingContribution.get);
registerEditorCommand(new LinkedEditingCommand({
  id: "cancelLinkedEditingInput",
  precondition: CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE,
  handler: (x) => x.clearRanges(),
  kbOpts: {
    kbExpr: EditorContextKeys.editorTextFocus,
    weight: KeybindingWeight.EditorContrib + 99,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
function getLinkedEditingRanges(providers, model, position, token) {
  const orderedByScore = providers.ordered(model);
  return first(orderedByScore.map((provider) => async () => {
    try {
      return await provider.provideLinkedEditingRanges(model, position, token);
    } catch (e) {
      onUnexpectedExternalError(e);
      return void 0;
    }
  }), (result) => !!result && arrays.isNonEmptyArray(result?.ranges));
}
const editorLinkedEditingBackground = registerColor("editor.linkedEditingBackground", { dark: Color.fromHex("#f00").transparent(0.3), light: Color.fromHex("#f00").transparent(0.3), hcDark: Color.fromHex("#f00").transparent(0.3), hcLight: Color.white }, nls.localize("editorLinkedEditingBackground", "Background color when the editor auto renames on type."));
registerModelAndPositionCommand("_executeLinkedEditingProvider", (_accessor, model, position) => {
  const { linkedEditingRangeProvider } = _accessor.get(ILanguageFeaturesService);
  return getLinkedEditingRanges(linkedEditingRangeProvider, model, position, CancellationToken.None);
});
registerEditorContribution(LinkedEditingContribution.ID, LinkedEditingContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(LinkedEditingAction);
export {
  CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE,
  LinkedEditingAction,
  LinkedEditingContribution,
  editorLinkedEditingBackground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2xpbmtlZEVkaXRpbmcvYnJvd3Nlci9saW5rZWRFZGl0aW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBmaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb21tYW5kLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb21tYW5kLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlciwgTGlua2VkRWRpdGluZ1JhbmdlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uLCBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgJy4vbGlua2VkRWRpdGluZy5jc3MnO1xuXG5leHBvcnQgY29uc3QgQ09OVEVYVF9PTlRZUEVfUkVOQU1FX0lOUFVUX1ZJU0lCTEUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignTGlua2VkRWRpdGluZ0lucHV0VmlzaWJsZScsIGZhbHNlKTtcblxuY29uc3QgREVDT1JBVElPTl9DTEFTU19OQU1FID0gJ2xpbmtlZC1lZGl0aW5nLWRlY29yYXRpb24nO1xuXG5leHBvcnQgY2xhc3MgTGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmxpbmtlZEVkaXRpbmcnO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFQ09SQVRJT04gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ2xpbmtlZC1lZGl0aW5nJyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0Y2xhc3NOYW1lOiBERUNPUkFUSU9OX0NMQVNTX05BTUVcblx0fSk7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogTGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPExpbmtlZEVkaXRpbmdDb250cmlidXRpb24+KExpbmtlZEVkaXRpbmdDb250cmlidXRpb24uSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVib3VuY2VEdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXI+O1xuXHRwcml2YXRlIF9lbmFibGVkOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VJbmZvcm1hdGlvbjogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xuXG5cdHByaXZhdGUgX3JhbmdlVXBkYXRlVHJpZ2dlclByb21pc2U6IFByb21pc2U8dW5rbm93bj4gfCBudWxsO1xuXHRwcml2YXRlIF9yYW5nZVN5bmNUcmlnZ2VyUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiB8IG51bGw7XG5cblx0cHJpdmF0ZSBfY3VycmVudFJlcXVlc3RDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFJlcXVlc3RQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50UmVxdWVzdE1vZGVsVmVyc2lvbjogbnVtYmVyIHwgbnVsbDtcblxuXHRwcml2YXRlIF9jdXJyZW50RGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247IC8vIFRoZSBvbmUgYXQgaW5kZXggMCBpcyB0aGUgcmVmZXJlbmNlIG9uZVxuXHRwcml2YXRlIF9zeW5jUmFuZ2VzVG9rZW46IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfbGFuZ3VhZ2VXb3JkUGF0dGVybjogUmVnRXhwIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFdvcmRQYXR0ZXJuOiBSZWdFeHAgfCBudWxsO1xuXHRwcml2YXRlIF9pZ25vcmVDaGFuZ2VFdmVudDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFRvRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcjtcblx0XHR0aGlzLl9lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkgPSBDT05URVhUX09OVFlQRV9SRU5BTUVfSU5QVVRfVklTSUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24gPSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UuZm9yKHRoaXMuX3Byb3ZpZGVycywgJ0xpbmtlZCBFZGl0aW5nJywgeyBtYXg6IDIwMCB9KTtcblxuXHRcdHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl9sYW5ndWFnZVdvcmRQYXR0ZXJuID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50V29yZFBhdHRlcm4gPSBudWxsO1xuXHRcdHRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5fcmFuZ2VVcGRhdGVUcmlnZ2VyUHJvbWlzZSA9IG51bGw7XG5cdFx0dGhpcy5fcmFuZ2VTeW5jVHJpZ2dlclByb21pc2UgPSBudWxsO1xuXG5cdFx0dGhpcy5fY3VycmVudFJlcXVlc3RDdHMgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0UG9zaXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0TW9kZWxWZXJzaW9uID0gbnVsbDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMucmVpbml0aWFsaXplKHRydWUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGlua2VkRWRpdGluZykgfHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5yZW5hbWVPblR5cGUpKSB7XG5cdFx0XHRcdHRoaXMucmVpbml0aWFsaXplKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvdmlkZXJzLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVpbml0aWFsaXplKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4gdGhpcy5yZWluaXRpYWxpemUodHJ1ZSkpKTtcblxuXHRcdHRoaXMucmVpbml0aWFsaXplKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWluaXRpYWxpemUoZm9yY2VSZWZyZXNoOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBpc0VuYWJsZWQgPSBtb2RlbCAhPT0gbnVsbCAmJiAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGlua2VkRWRpdGluZykgfHwgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVuYW1lT25UeXBlKSkgJiYgdGhpcy5fcHJvdmlkZXJzLmhhcyhtb2RlbCk7XG5cdFx0aWYgKGlzRW5hYmxlZCA9PT0gdGhpcy5fZW5hYmxlZCAmJiAhZm9yY2VSZWZyZXNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5hYmxlZCA9IGlzRW5hYmxlZDtcblxuXHRcdHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5jbGVhcigpO1xuXG5cdFx0aWYgKCFpc0VuYWJsZWQgfHwgbW9kZWwgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQoXG5cdFx0XHRFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRcdG1vZGVsLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VXb3JkUGF0dGVybiA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5nZXRXb3JkRGVmaW5pdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJhbmdlVXBkYXRlU2NoZWR1bGVyID0gbmV3IERlbGF5ZXIodGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQobW9kZWwpKTtcblx0XHRjb25zdCB0cmlnZ2VyUmFuZ2VVcGRhdGUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9yYW5nZVVwZGF0ZVRyaWdnZXJQcm9taXNlID0gcmFuZ2VVcGRhdGVTY2hlZHVsZXIudHJpZ2dlcigoKSA9PiB0aGlzLnVwZGF0ZVJhbmdlcygpLCB0aGlzLl9kZWJvdW5jZUR1cmF0aW9uID8/IHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24uZ2V0KG1vZGVsKSk7XG5cdFx0fTtcblx0XHRjb25zdCByYW5nZVN5bmNTY2hlZHVsZXIgPSBuZXcgRGVsYXllcigwKTtcblx0XHRjb25zdCB0cmlnZ2VyUmFuZ2VTeW5jID0gKHRva2VuOiBudW1iZXIpID0+IHtcblx0XHRcdHRoaXMuX3JhbmdlU3luY1RyaWdnZXJQcm9taXNlID0gcmFuZ2VTeW5jU2NoZWR1bGVyLnRyaWdnZXIoKCkgPT4gdGhpcy5fc3luY1Jhbmdlcyh0b2tlbikpO1xuXHRcdH07XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHtcblx0XHRcdHRyaWdnZXJSYW5nZVVwZGF0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50KSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZVJhbmdlID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLmdldFJhbmdlKDApO1xuXHRcdFx0XHRcdGlmIChyZWZlcmVuY2VSYW5nZSAmJiBlLmNoYW5nZXMuZXZlcnkoYyA9PiByZWZlcmVuY2VSYW5nZS5pbnRlcnNlY3RSYW5nZXMoYy5yYW5nZSkpKSB7XG5cdFx0XHRcdFx0XHR0cmlnZ2VyUmFuZ2VTeW5jKHRoaXMuX3N5bmNSYW5nZXNUb2tlbik7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0cmlnZ2VyUmFuZ2VVcGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxUb0Rpc3Bvc2UuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0cmFuZ2VVcGRhdGVTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyYW5nZVN5bmNTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMudXBkYXRlUmFuZ2VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jUmFuZ2VzKHRva2VuOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBkZWxheWVkIGludm9jYXRpb24sIG1ha2Ugc3VyZSB3ZSdyZSBzdGlsbCBvblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgdG9rZW4gIT09IHRoaXMuX3N5bmNSYW5nZXNUb2tlbiB8fCB0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCByZWZlcmVuY2VSYW5nZSA9IHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5nZXRSYW5nZSgwKTtcblxuXHRcdGlmICghcmVmZXJlbmNlUmFuZ2UgfHwgcmVmZXJlbmNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSByZWZlcmVuY2VSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZmVyZW5jZVZhbHVlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJlZmVyZW5jZVJhbmdlKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFdvcmRQYXR0ZXJuKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHJlZmVyZW5jZVZhbHVlLm1hdGNoKHRoaXMuX2N1cnJlbnRXb3JkUGF0dGVybik7XG5cdFx0XHRjb25zdCBtYXRjaExlbmd0aCA9IG1hdGNoID8gbWF0Y2hbMF0ubGVuZ3RoIDogMDtcblx0XHRcdGlmIChtYXRjaExlbmd0aCAhPT0gcmVmZXJlbmNlVmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNsZWFyUmFuZ2VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBtaXJyb3JSYW5nZSA9IHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5nZXRSYW5nZShpKTtcblx0XHRcdGlmICghbWlycm9yUmFuZ2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWlycm9yUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBtaXJyb3JSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlOiBtaXJyb3JSYW5nZSxcblx0XHRcdFx0XHR0ZXh0OiByZWZlcmVuY2VWYWx1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBvbGRWYWx1ZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShtaXJyb3JSYW5nZSk7XG5cdFx0XHRcdGxldCBuZXdWYWx1ZSA9IHJlZmVyZW5jZVZhbHVlO1xuXHRcdFx0XHRsZXQgcmFuZ2VTdGFydENvbHVtbiA9IG1pcnJvclJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHRsZXQgcmFuZ2VFbmRDb2x1bW4gPSBtaXJyb3JSYW5nZS5lbmRDb2x1bW47XG5cblx0XHRcdFx0Y29uc3QgY29tbW9uUHJlZml4TGVuZ3RoID0gc3RyaW5ncy5jb21tb25QcmVmaXhMZW5ndGgob2xkVmFsdWUsIG5ld1ZhbHVlKTtcblx0XHRcdFx0cmFuZ2VTdGFydENvbHVtbiArPSBjb21tb25QcmVmaXhMZW5ndGg7XG5cdFx0XHRcdG9sZFZhbHVlID0gb2xkVmFsdWUuc3Vic3RyKGNvbW1vblByZWZpeExlbmd0aCk7XG5cdFx0XHRcdG5ld1ZhbHVlID0gbmV3VmFsdWUuc3Vic3RyKGNvbW1vblByZWZpeExlbmd0aCk7XG5cblx0XHRcdFx0Y29uc3QgY29tbW9uU3VmZml4TGVuZ3RoID0gc3RyaW5ncy5jb21tb25TdWZmaXhMZW5ndGgob2xkVmFsdWUsIG5ld1ZhbHVlKTtcblx0XHRcdFx0cmFuZ2VFbmRDb2x1bW4gLT0gY29tbW9uU3VmZml4TGVuZ3RoO1xuXHRcdFx0XHRvbGRWYWx1ZSA9IG9sZFZhbHVlLnN1YnN0cigwLCBvbGRWYWx1ZS5sZW5ndGggLSBjb21tb25TdWZmaXhMZW5ndGgpO1xuXHRcdFx0XHRuZXdWYWx1ZSA9IG5ld1ZhbHVlLnN1YnN0cigwLCBuZXdWYWx1ZS5sZW5ndGggLSBjb21tb25TdWZmaXhMZW5ndGgpO1xuXG5cdFx0XHRcdGlmIChyYW5nZVN0YXJ0Q29sdW1uICE9PSByYW5nZUVuZENvbHVtbiB8fCBuZXdWYWx1ZS5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHRlZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UobWlycm9yUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZVN0YXJ0Q29sdW1uLCBtaXJyb3JSYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZUVuZENvbHVtbiksXG5cdFx0XHRcdFx0XHR0ZXh0OiBuZXdWYWx1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IucG9wVW5kb1N0b3AoKTtcblx0XHRcdHRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHByZXZFZGl0T3BlcmF0aW9uVHlwZSA9IHRoaXMuX2VkaXRvci5fZ2V0Vmlld01vZGVsKCkuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKCdsaW5rZWRFZGl0aW5nJywgZWRpdHMpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLl9nZXRWaWV3TW9kZWwoKS5zZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUocHJldkVkaXRPcGVyYXRpb25UeXBlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyUmFuZ2VzKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGNsZWFyUmFuZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fY3VycmVudERlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdEN0cy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzID0gbnVsbDtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0UG9zaXRpb24gPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgY3VycmVudFVwZGF0ZVRyaWdnZXJQcm9taXNlKCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZVVwZGF0ZVRyaWdnZXJQcm9taXNlIHx8IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50U3luY1RyaWdnZXJQcm9taXNlKCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZVN5bmNUcmlnZ2VyUHJvbWlzZSB8fCBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVSYW5nZXMoZm9yY2UgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCAmJiAhZm9yY2UgfHwgdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5sZW5ndGggPiAxKSB7XG5cdFx0XHQvLyBkaXNhYmxlZCBvciBtdWx0aWN1cnNvclxuXHRcdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxWZXJzaW9uSWQgPSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFJlcXVlc3RQb3NpdGlvbiAmJiB0aGlzLl9jdXJyZW50UmVxdWVzdE1vZGVsVmVyc2lvbiA9PT0gbW9kZWxWZXJzaW9uSWQpIHtcblx0XHRcdGlmIChwb3NpdGlvbi5lcXVhbHModGhpcy5fY3VycmVudFJlcXVlc3RQb3NpdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzYW1lIHBvc2l0aW9uXG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudERlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMuZ2V0UmFuZ2UoMCk7XG5cdFx0XHRcdGlmIChyYW5nZSAmJiByYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8ganVzdCBtb3ZpbmcgaW5zaWRlIHRoZSBleGlzdGluZyBwcmltYXJ5IHJhbmdlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRSZXF1ZXN0UG9zaXRpb24/LmVxdWFscyhwb3NpdGlvbikpIHtcblx0XHRcdC8vIEdldCB0aGUgY3VycmVudCByYW5nZSBvZiB0aGUgZmlyc3QgZGVjb3JhdGlvbiAocmVmZXJlbmNlIHJhbmdlKVxuXHRcdFx0Y29uc3QgY3VycmVudFJhbmdlID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLmdldFJhbmdlKDApO1xuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgbm8gY3VycmVudCByYW5nZSBvciB0aGUgY3VycmVudCByYW5nZSBkb2VzIG5vdCBjb250YWluIHRoZSBuZXcgcG9zaXRpb24sIGNsZWFyIHRoZSByYW5nZXNcblx0XHRcdGlmICghY3VycmVudFJhbmdlPy5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHQvLyBDbGVhciBleGlzdGluZyBkZWNvcmF0aW9ucyB3aGlsZSB3ZSBjb21wdXRlIG5ldyBvbmVzXG5cdFx0XHRcdHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdFBvc2l0aW9uID0gcG9zaXRpb247XG5cdFx0dGhpcy5fY3VycmVudFJlcXVlc3RNb2RlbFZlcnNpb24gPSBtb2RlbFZlcnNpb25JZDtcblxuXHRcdGNvbnN0IGN1cnJlbnRSZXF1ZXN0Q3RzID0gdGhpcy5fY3VycmVudFJlcXVlc3RDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKGZhbHNlKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0TGlua2VkRWRpdGluZ1Jhbmdlcyh0aGlzLl9wcm92aWRlcnMsIG1vZGVsLCBwb3NpdGlvbiwgY3VycmVudFJlcXVlc3RDdHMudG9rZW4pO1xuXHRcdFx0dGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi51cGRhdGUobW9kZWwsIHN3LmVsYXBzZWQoKSk7XG5cdFx0XHRpZiAoY3VycmVudFJlcXVlc3RDdHMgIT09IHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzID0gbnVsbDtcblx0XHRcdGlmIChtb2RlbFZlcnNpb25JZCAhPT0gbW9kZWwuZ2V0VmVyc2lvbklkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmFuZ2VzOiBJUmFuZ2VbXSA9IFtdO1xuXHRcdFx0aWYgKHJlc3BvbnNlPy5yYW5nZXMpIHtcblx0XHRcdFx0cmFuZ2VzID0gcmVzcG9uc2UucmFuZ2VzO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jdXJyZW50V29yZFBhdHRlcm4gPSByZXNwb25zZT8ud29yZFBhdHRlcm4gfHwgdGhpcy5fbGFuZ3VhZ2VXb3JkUGF0dGVybjtcblxuXHRcdFx0bGV0IGZvdW5kUmVmZXJlbmNlUmFuZ2UgPSBmYWxzZTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0aWYgKFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocmFuZ2VzW2ldLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRmb3VuZFJlZmVyZW5jZVJhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoaSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlUmFuZ2UgPSByYW5nZXNbaV07XG5cdFx0XHRcdFx0XHRyYW5nZXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0cmFuZ2VzLnVuc2hpZnQocmVmZXJlbmNlUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWZvdW5kUmVmZXJlbmNlUmFuZ2UpIHtcblx0XHRcdFx0Ly8gQ2Fubm90IGRvIGxpbmtlZCBlZGl0aW5nIGlmIHRoZSByYW5nZXMgYXJlIG5vdCB3aGVyZSB0aGUgY3Vyc29yIGlzLi4uXG5cdFx0XHRcdHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSByYW5nZXMubWFwKHJhbmdlID0+ICh7IHJhbmdlOiByYW5nZSwgb3B0aW9uczogTGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5ERUNPUkFUSU9OIH0pKTtcblx0XHRcdHRoaXMuX3Zpc2libGVDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbnMpO1xuXHRcdFx0dGhpcy5fc3luY1Jhbmdlc1Rva2VuKys7IC8vIGNhbmNlbCBhbnkgcGVuZGluZyBzeW5jUmFuZ2VzIGNhbGxcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFJlcXVlc3RDdHMgPT09IGN1cnJlbnRSZXF1ZXN0Q3RzIHx8ICF0aGlzLl9jdXJyZW50UmVxdWVzdEN0cykge1xuXHRcdFx0XHQvLyBzdG9wIGlmIHdlIGFyZSBzdGlsbCB0aGUgbGF0ZXN0IHJlcXVlc3Rcblx0XHRcdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHR9XG5cblx0Ly8gZm9yIHRlc3Rpbmdcblx0cHVibGljIHNldERlYm91bmNlRHVyYXRpb24odGltZUluTVM6IG51bWJlcikge1xuXHRcdHRoaXMuX2RlYm91bmNlRHVyYXRpb24gPSB0aW1lSW5NUztcblx0fVxuXG5cdC8vIHByaXZhdGUgcHJpbnREZWNvcmF0b3JzKG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdC8vIFx0cmV0dXJuIHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5tYXAoZCA9PiB7XG5cdC8vIFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShkKTtcblx0Ly8gXHRcdGlmIChyYW5nZSkge1xuXHQvLyBcdFx0XHRyZXR1cm4gdGhpcy5wcmludFJhbmdlKHJhbmdlKTtcblx0Ly8gXHRcdH1cblx0Ly8gXHRcdHJldHVybiAnaW52YWxpZCc7XG5cdC8vIFx0fSkuam9pbignLCcpO1xuXHQvLyB9XG5cblx0Ly8gcHJpdmF0ZSBwcmludENoYW5nZXMoY2hhbmdlczogSU1vZGVsQ29udGVudENoYW5nZVtdKSB7XG5cdC8vIFx0cmV0dXJuIGNoYW5nZXMubWFwKGMgPT4ge1xuXHQvLyBcdFx0cmV0dXJuIGAke3RoaXMucHJpbnRSYW5nZShjLnJhbmdlKX0gLSAke2MudGV4dH1gO1xuXHQvLyBcdH1cblx0Ly8gXHQpLmpvaW4oJywnKTtcblx0Ly8gfVxuXG5cdC8vIHByaXZhdGUgcHJpbnRSYW5nZShyYW5nZTogSVJhbmdlKSB7XG5cdC8vIFx0cmV0dXJuIGAke3JhbmdlLnN0YXJ0TGluZU51bWJlcn0sJHtyYW5nZS5zdGFydENvbHVtbn0vJHtyYW5nZS5lbmRMaW5lTnVtYmVyfSwke3JhbmdlLmVuZENvbHVtbn1gO1xuXHQvLyB9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5rZWRFZGl0aW5nQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmxpbmtlZEVkaXRpbmcnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xpbmtlZEVkaXRpbmcubGFiZWwnLCBcIlN0YXJ0IExpbmtlZCBFZGl0aW5nXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsIEVkaXRvckNvbnRleHRLZXlzLmhhc1JlbmFtZVByb3ZpZGVyKSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogW1VSSSwgSVBvc2l0aW9uXSk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgW3VyaSwgcG9zXSA9IEFycmF5LmlzQXJyYXkoYXJncykgJiYgYXJncyB8fCBbdW5kZWZpbmVkLCB1bmRlZmluZWRdO1xuXG5cdFx0aWYgKFVSSS5pc1VyaSh1cmkpICYmIFBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvcykpIHtcblx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSB9LCBlZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKSkudGhlbihlZGl0b3IgPT4ge1xuXHRcdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRcdFx0ZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0VGVsZW1ldHJ5KGFjY2Vzc29yLCBlZGl0b3IpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJ1bihhY2Nlc3NvciwgZWRpdG9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJ1bkNvbW1hbmQoYWNjZXNzb3IsIGFyZ3MpO1xuXHR9XG5cblx0cnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbnRyb2xsZXIudXBkYXRlUmFuZ2VzKHRydWUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmNvbnN0IExpbmtlZEVkaXRpbmdDb21tYW5kID0gRWRpdG9yQ29tbWFuZC5iaW5kVG9Db250cmlidXRpb248TGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbj4oTGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5nZXQpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBMaW5rZWRFZGl0aW5nQ29tbWFuZCh7XG5cdGlkOiAnY2FuY2VsTGlua2VkRWRpdGluZ0lucHV0Jyxcblx0cHJlY29uZGl0aW9uOiBDT05URVhUX09OVFlQRV9SRU5BTUVfSU5QVVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LmNsZWFyUmFuZ2VzKCksXG5cdGtiT3B0czoge1xuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgOTksXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdXG5cdH1cbn0pKTtcblxuXG5mdW5jdGlvbiBnZXRMaW5rZWRFZGl0aW5nUmFuZ2VzKHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXI+LCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPExpbmtlZEVkaXRpbmdSYW5nZXMgfCB1bmRlZmluZWQgfCBudWxsPiB7XG5cdGNvbnN0IG9yZGVyZWRCeVNjb3JlID0gcHJvdmlkZXJzLm9yZGVyZWQobW9kZWwpO1xuXG5cdC8vIGluIG9yZGVyIG9mIHNjb3JlIGFzayB0aGUgbGlua2VkIGVkaXRpbmcgcmFuZ2UgcHJvdmlkZXJcblx0Ly8gdW50aWwgc29tZW9uZSByZXNwb25zZSB3aXRoIGEgZ29vZCByZXN1bHRcblx0Ly8gKGdvb2QgPSBub3QgbnVsbClcblx0cmV0dXJuIGZpcnN0PExpbmtlZEVkaXRpbmdSYW5nZXMgfCB1bmRlZmluZWQgfCBudWxsPihvcmRlcmVkQnlTY29yZS5tYXAocHJvdmlkZXIgPT4gYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUxpbmtlZEVkaXRpbmdSYW5nZXMobW9kZWwsIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KSwgcmVzdWx0ID0+ICEhcmVzdWx0ICYmIGFycmF5cy5pc05vbkVtcHR5QXJyYXkocmVzdWx0Py5yYW5nZXMpKTtcbn1cblxuZXhwb3J0IGNvbnN0IGVkaXRvckxpbmtlZEVkaXRpbmdCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmxpbmtlZEVkaXRpbmdCYWNrZ3JvdW5kJywgeyBkYXJrOiBDb2xvci5mcm9tSGV4KCcjZjAwJykudHJhbnNwYXJlbnQoMC4zKSwgbGlnaHQ6IENvbG9yLmZyb21IZXgoJyNmMDAnKS50cmFuc3BhcmVudCgwLjMpLCBoY0Rhcms6IENvbG9yLmZyb21IZXgoJyNmMDAnKS50cmFuc3BhcmVudCgwLjMpLCBoY0xpZ2h0OiBDb2xvci53aGl0ZSB9LCBubHMubG9jYWxpemUoJ2VkaXRvckxpbmtlZEVkaXRpbmdCYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igd2hlbiB0aGUgZWRpdG9yIGF1dG8gcmVuYW1lcyBvbiB0eXBlLicpKTtcblxucmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCgnX2V4ZWN1dGVMaW5rZWRFZGl0aW5nUHJvdmlkZXInLCAoX2FjY2Vzc29yLCBtb2RlbCwgcG9zaXRpb24pID0+IHtcblx0Y29uc3QgeyBsaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlciB9ID0gX2FjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gZ2V0TGlua2VkRWRpdGluZ1JhbmdlcyhsaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcbn0pO1xuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLklELCBMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oTGlua2VkRWRpdGluZ0FjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCLG1CQUFtQixpQ0FBaUM7QUFDbEYsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsV0FBVztBQUVwQixTQUFTLGNBQWMsZUFBZSxpQ0FBaUMsc0JBQXNCLHVCQUF1Qiw0QkFBNEIsdUNBQXlEO0FBQ3pNLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFpQixhQUFhO0FBRTlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTRDLDhCQUE4QjtBQUMxRSxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHFDQUFxQztBQUM5QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBNkIsb0JBQW9CLHFCQUFxQjtBQUMvRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUc5QixT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QUFXLGFBQWEsSUFBSSxDQUFDO0FBQUEsSUFDckQ7QUFDQSxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQ0Q7QUFFQSxNQUFNLHVCQUF1QixjQUFjLG1CQUE4QywwQkFBMEIsR0FBRztBQUN0SCxzQkFBc0IsSUFBSSxxQkFBcUI7QUFBQSxFQUM5QyxJQUFJO0FBQUEsRUFDSixjQUFjO0FBQUEsRUFDZCxTQUFTLE9BQUssRUFBRSxZQUFZO0FBQUEsRUFDNUIsUUFBUTtBQUFBLElBQ1AsUUFBUSxrQkFBa0I7QUFBQSxJQUMxQixRQUFRLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUN6QyxTQUFTLFFBQVE7QUFBQSxJQUNqQixXQUFXLENBQUMsT0FBTyxRQUFRLFFBQVEsTUFBTTtBQUFBLEVBQzFDO0FBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBUyx1QkFBdUIsV0FBZ0UsT0FBbUIsVUFBb0IsT0FBMkU7QUFDak4sUUFBTSxpQkFBaUIsVUFBVSxRQUFRLEtBQUs7QUFLOUMsU0FBTyxNQUE4QyxlQUFlLElBQUksY0FBWSxZQUFZO0FBQy9GLFFBQUk7QUFDSCxhQUFPLE1BQU0sU0FBUywyQkFBMkIsT0FBTyxVQUFVLEtBQUs7QUFBQSxJQUN4RSxTQUFTLEdBQUc7QUFDWCxnQ0FBMEIsQ0FBQztBQUMzQixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0QsQ0FBQyxHQUFHLFlBQVUsQ0FBQyxDQUFDLFVBQVUsT0FBTyxnQkFBZ0IsUUFBUSxNQUFNLENBQUM7QUFDakU7QUFFTyxNQUFNLGdDQUFnQyxjQUFjLGtDQUFrQyxFQUFFLE1BQU0sTUFBTSxRQUFRLE1BQU0sRUFBRSxZQUFZLEdBQUcsR0FBRyxPQUFPLE1BQU0sUUFBUSxNQUFNLEVBQUUsWUFBWSxHQUFHLEdBQUcsUUFBUSxNQUFNLFFBQVEsTUFBTSxFQUFFLFlBQVksR0FBRyxHQUFHLFNBQVMsTUFBTSxNQUFNLEdBQUcsSUFBSSxTQUFTLGlDQUFpQyx3REFBd0QsQ0FBQztBQUUzVyxnQ0FBZ0MsaUNBQWlDLENBQUMsV0FBVyxPQUFPLGFBQWE7QUFDaEcsUUFBTSxFQUFFLDJCQUEyQixJQUFJLFVBQVUsSUFBSSx3QkFBd0I7QUFDN0UsU0FBTyx1QkFBdUIsNEJBQTRCLE9BQU8sVUFBVSxrQkFBa0IsSUFBSTtBQUNsRyxDQUFDO0FBRUQsMkJBQTJCLDBCQUEwQixJQUFJLDJCQUEyQixnQ0FBZ0MsZ0JBQWdCO0FBQ3BJLHFCQUFxQixtQkFBbUI7IiwKICAibmFtZXMiOiBbImFjY2Vzc29yIl0KfQo=
