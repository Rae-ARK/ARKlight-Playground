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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { InvisibleCharacters, isBasicASCII } from "../../../../base/common/strings.js";
import "./unicodeHighlighter.css";
import { EditorAction, EditorContributionInstantiation, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { inUntrustedWorkspace, EditorOption, unicodeHighlightConfigKeys } from "../../../common/config/editorOptions.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { UnicodeHighlighterReasonKind, UnicodeTextModelHighlighter } from "../../../common/services/unicodeTextModelHighlighter.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { HoverAnchorType, HoverParticipantRegistry } from "../../hover/browser/hoverTypes.js";
import { MarkdownHover, renderMarkdownHovers } from "../../hover/browser/markdownHoverParticipant.js";
import { BannerController } from "./bannerController.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { safeIntl } from "../../../../base/common/date.js";
import { isModelDecorationInComment, isModelDecorationInString, isModelDecorationVisible } from "../../../common/viewModel/viewModelDecoration.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
const warningIcon = registerIcon("extensions-warning-message", Codicon.warning, nls.localize("warningIcon", "Icon shown with a warning message in the extensions editor."));
let UnicodeHighlighter = class extends Disposable {
  constructor(_editor, _editorWorkerService, _workspaceTrustService, instantiationService) {
    super();
    this._editor = _editor;
    this._editorWorkerService = _editorWorkerService;
    this._workspaceTrustService = _workspaceTrustService;
    this._highlighter = null;
    this._bannerClosed = false;
    this._updateState = (state) => {
      if (state && state.hasMore) {
        if (this._bannerClosed) {
          return;
        }
        const max = Math.max(state.ambiguousCharacterCount, state.nonBasicAsciiCharacterCount, state.invisibleCharacterCount);
        let data;
        if (state.nonBasicAsciiCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyNonBasicAsciiUnicodeCharacters", "This document contains many non-basic ASCII unicode characters"),
            command: new DisableHighlightingOfNonBasicAsciiCharactersAction()
          };
        } else if (state.ambiguousCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyAmbiguousUnicodeCharacters", "This document contains many ambiguous unicode characters"),
            command: new DisableHighlightingOfAmbiguousCharactersAction()
          };
        } else if (state.invisibleCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyInvisibleUnicodeCharacters", "This document contains many invisible unicode characters"),
            command: new DisableHighlightingOfInvisibleCharactersAction()
          };
        } else {
          throw new Error("Unreachable");
        }
        this._bannerController.show({
          id: "unicodeHighlightBanner",
          message: data.message,
          icon: warningIcon,
          actions: [
            {
              label: data.command.shortLabel,
              href: `command:${data.command.desc.id}`
            }
          ],
          onClose: () => {
            this._bannerClosed = true;
          }
        });
      } else {
        this._bannerController.hide();
      }
    };
    this._bannerController = this._register(instantiationService.createInstance(BannerController, _editor));
    this._register(this._editor.onDidChangeModel(() => {
      this._bannerClosed = false;
      this._updateHighlighter();
    }));
    this._options = _editor.getOption(EditorOption.unicodeHighlighting);
    this._register(_workspaceTrustService.onDidChangeTrust((e) => {
      this._updateHighlighter();
    }));
    this._register(_editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.unicodeHighlighting)) {
        this._options = _editor.getOption(EditorOption.unicodeHighlighting);
        this._updateHighlighter();
      }
    }));
    this._updateHighlighter();
  }
  dispose() {
    if (this._highlighter) {
      this._highlighter.dispose();
      this._highlighter = null;
    }
    super.dispose();
  }
  _updateHighlighter() {
    this._updateState(null);
    if (this._highlighter) {
      this._highlighter.dispose();
      this._highlighter = null;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    const options = resolveOptions(this._workspaceTrustService.isWorkspaceTrusted(), this._options);
    if ([
      options.nonBasicASCII,
      options.ambiguousCharacters,
      options.invisibleCharacters
    ].every((option) => option === false)) {
      return;
    }
    const highlightOptions = {
      nonBasicASCII: options.nonBasicASCII,
      ambiguousCharacters: options.ambiguousCharacters,
      invisibleCharacters: options.invisibleCharacters,
      includeComments: options.includeComments,
      includeStrings: options.includeStrings,
      allowedCodePoints: Object.keys(options.allowedCharacters).map((c) => c.codePointAt(0)),
      allowedLocales: Object.keys(options.allowedLocales).map((locale) => {
        if (locale === "_os") {
          const osLocale = safeIntl.NumberFormat().value.resolvedOptions().locale;
          return osLocale;
        } else if (locale === "_vscode") {
          return platform.language;
        }
        return locale;
      })
    };
    if (this._editorWorkerService.canComputeUnicodeHighlights(this._editor.getModel().uri)) {
      this._highlighter = new DocumentUnicodeHighlighter(this._editor, highlightOptions, this._updateState, this._editorWorkerService);
    } else {
      this._highlighter = new ViewportUnicodeHighlighter(this._editor, highlightOptions, this._updateState);
    }
  }
  getDecorationInfo(decoration) {
    if (this._highlighter) {
      return this._highlighter.getDecorationInfo(decoration);
    }
    return null;
  }
};
UnicodeHighlighter.ID = "editor.contrib.unicodeHighlighter";
UnicodeHighlighter = __decorateClass([
  __decorateParam(1, IEditorWorkerService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, IInstantiationService)
], UnicodeHighlighter);
function resolveOptions(trusted, options) {
  return {
    nonBasicASCII: options.nonBasicASCII === inUntrustedWorkspace ? !trusted : options.nonBasicASCII,
    ambiguousCharacters: options.ambiguousCharacters,
    invisibleCharacters: options.invisibleCharacters,
    includeComments: options.includeComments === inUntrustedWorkspace ? !trusted : options.includeComments,
    includeStrings: options.includeStrings === inUntrustedWorkspace ? !trusted : options.includeStrings,
    allowedCharacters: options.allowedCharacters,
    allowedLocales: options.allowedLocales
  };
}
let DocumentUnicodeHighlighter = class extends Disposable {
  constructor(_editor, _options, _updateState, _editorWorkerService) {
    super();
    this._editor = _editor;
    this._options = _options;
    this._updateState = _updateState;
    this._editorWorkerService = _editorWorkerService;
    this._model = this._editor.getModel();
    this._decorations = this._editor.createDecorationsCollection();
    this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateSoon.schedule();
    }));
    this._updateSoon.schedule();
  }
  dispose() {
    this._decorations.clear();
    super.dispose();
  }
  _update() {
    if (this._model.isDisposed()) {
      return;
    }
    if (!this._model.mightContainNonBasicASCII()) {
      this._decorations.clear();
      return;
    }
    const modelVersionId = this._model.getVersionId();
    this._editorWorkerService.computedUnicodeHighlights(this._model.uri, this._options).then((info) => {
      if (this._model.isDisposed()) {
        return;
      }
      if (this._model.getVersionId() !== modelVersionId) {
        return;
      }
      this._updateState(info);
      const decorations = [];
      if (!info.hasMore) {
        for (const range of info.ranges) {
          decorations.push({
            range,
            options: Decorations.instance.getDecorationFromOptions(this._options)
          });
        }
      }
      this._decorations.set(decorations);
    });
  }
  getDecorationInfo(decoration) {
    if (!this._decorations.has(decoration)) {
      return null;
    }
    const model = this._editor.getModel();
    if (!isModelDecorationVisible(model, decoration)) {
      return null;
    }
    const text = model.getValueInRange(decoration.range);
    return {
      reason: computeReason(text, this._options),
      inComment: isModelDecorationInComment(model, decoration),
      inString: isModelDecorationInString(model, decoration)
    };
  }
};
DocumentUnicodeHighlighter = __decorateClass([
  __decorateParam(3, IEditorWorkerService)
], DocumentUnicodeHighlighter);
class ViewportUnicodeHighlighter extends Disposable {
  constructor(_editor, _options, _updateState) {
    super();
    this._editor = _editor;
    this._options = _options;
    this._updateState = _updateState;
    this._model = this._editor.getModel();
    this._decorations = this._editor.createDecorationsCollection();
    this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
    this._register(this._editor.onDidLayoutChange(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidScrollChange(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidChangeHiddenAreas(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateSoon.schedule();
    }));
    this._updateSoon.schedule();
  }
  dispose() {
    this._decorations.clear();
    super.dispose();
  }
  _update() {
    if (this._model.isDisposed()) {
      return;
    }
    if (!this._model.mightContainNonBasicASCII()) {
      this._decorations.clear();
      return;
    }
    const ranges = this._editor.getVisibleRanges();
    const decorations = [];
    const totalResult = {
      ranges: [],
      ambiguousCharacterCount: 0,
      invisibleCharacterCount: 0,
      nonBasicAsciiCharacterCount: 0,
      hasMore: false
    };
    for (const range of ranges) {
      const result = UnicodeTextModelHighlighter.computeUnicodeHighlights(this._model, this._options, range);
      for (const r of result.ranges) {
        totalResult.ranges.push(r);
      }
      totalResult.ambiguousCharacterCount += totalResult.ambiguousCharacterCount;
      totalResult.invisibleCharacterCount += totalResult.invisibleCharacterCount;
      totalResult.nonBasicAsciiCharacterCount += totalResult.nonBasicAsciiCharacterCount;
      totalResult.hasMore = totalResult.hasMore || result.hasMore;
    }
    if (!totalResult.hasMore) {
      for (const range of totalResult.ranges) {
        decorations.push({ range, options: Decorations.instance.getDecorationFromOptions(this._options) });
      }
    }
    this._updateState(totalResult);
    this._decorations.set(decorations);
  }
  getDecorationInfo(decoration) {
    if (!this._decorations.has(decoration)) {
      return null;
    }
    const model = this._editor.getModel();
    const text = model.getValueInRange(decoration.range);
    if (!isModelDecorationVisible(model, decoration)) {
      return null;
    }
    return {
      reason: computeReason(text, this._options),
      inComment: isModelDecorationInComment(model, decoration),
      inString: isModelDecorationInString(model, decoration)
    };
  }
}
class UnicodeHighlighterHover {
  constructor(owner, range, decoration) {
    this.owner = owner;
    this.range = range;
    this.decoration = decoration;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
const configureUnicodeHighlightOptionsStr = nls.localize("unicodeHighlight.configureUnicodeHighlightOptions", "Configure Unicode Highlight Options");
let UnicodeHighlighterHoverParticipant = class {
  constructor(_editor, _markdownRendererService) {
    this._editor = _editor;
    this._markdownRendererService = _markdownRendererService;
    this.hoverOrdinal = 5;
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return [];
    }
    const model = this._editor.getModel();
    const unicodeHighlighter = this._editor.getContribution(UnicodeHighlighter.ID);
    if (!unicodeHighlighter) {
      return [];
    }
    const result = [];
    const existedReason = /* @__PURE__ */ new Set();
    let index = 300;
    for (const d of lineDecorations) {
      const highlightInfo = unicodeHighlighter.getDecorationInfo(d);
      if (!highlightInfo) {
        continue;
      }
      const char = model.getValueInRange(d.range);
      const codePoint = char.codePointAt(0);
      const codePointStr = formatCodePointMarkdown(codePoint);
      let reason;
      switch (highlightInfo.reason.kind) {
        case UnicodeHighlighterReasonKind.Ambiguous: {
          if (isBasicASCII(highlightInfo.reason.confusableWith)) {
            reason = nls.localize(
              "unicodeHighlight.characterIsAmbiguousASCII",
              "The character {0} could be confused with the ASCII character {1}, which is more common in source code.",
              codePointStr,
              formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0))
            );
          } else {
            reason = nls.localize(
              "unicodeHighlight.characterIsAmbiguous",
              "The character {0} could be confused with the character {1}, which is more common in source code.",
              codePointStr,
              formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0))
            );
          }
          break;
        }
        case UnicodeHighlighterReasonKind.Invisible:
          reason = nls.localize(
            "unicodeHighlight.characterIsInvisible",
            "The character {0} is invisible.",
            codePointStr
          );
          break;
        case UnicodeHighlighterReasonKind.NonBasicAscii:
          reason = nls.localize(
            "unicodeHighlight.characterIsNonBasicAscii",
            "The character {0} is not a basic ASCII character.",
            codePointStr
          );
          break;
      }
      if (existedReason.has(reason)) {
        continue;
      }
      existedReason.add(reason);
      const adjustSettingsArgs = {
        codePoint,
        reason: highlightInfo.reason,
        inComment: highlightInfo.inComment,
        inString: highlightInfo.inString
      };
      const adjustSettings = nls.localize("unicodeHighlight.adjustSettings", "Adjust settings");
      const uri = createCommandUri(ShowExcludeOptions.ID, adjustSettingsArgs);
      const markdown = new MarkdownString("", true).appendMarkdown(reason).appendText(" ").appendLink(uri, adjustSettings, configureUnicodeHighlightOptionsStr);
      result.push(new MarkdownHover(this, d.range, [markdown], false, index++));
    }
    return result;
  }
  renderHoverParts(context, hoverParts) {
    return renderMarkdownHovers(context, hoverParts, this._editor, this._markdownRendererService);
  }
  getAccessibleContent(hoverPart) {
    return hoverPart.contents.map((c) => c.value).join("\n");
  }
};
UnicodeHighlighterHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkdownRendererService)
], UnicodeHighlighterHoverParticipant);
function codePointToHex(codePoint) {
  return `U+${codePoint.toString(16).padStart(4, "0")}`;
}
function formatCodePointMarkdown(codePoint) {
  let value = `\`${codePointToHex(codePoint)}\``;
  if (!InvisibleCharacters.isInvisibleCharacter(codePoint)) {
    value += ` "${`${renderCodePointAsInlineCode(codePoint)}`}"`;
  }
  return value;
}
function renderCodePointAsInlineCode(codePoint) {
  if (codePoint === CharCode.BackTick) {
    return "`` ` ``";
  }
  return "`" + String.fromCodePoint(codePoint) + "`";
}
function computeReason(char, options) {
  return UnicodeTextModelHighlighter.computeUnicodeHighlightReason(char, options);
}
const _Decorations = class _Decorations {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  getDecorationFromOptions(options) {
    return this.getDecoration(!options.includeComments, !options.includeStrings);
  }
  getDecoration(hideInComments, hideInStrings) {
    const key = `${hideInComments}${hideInStrings}`;
    let options = this.map.get(key);
    if (!options) {
      options = ModelDecorationOptions.createDynamic({
        description: "unicode-highlight",
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        className: "unicode-highlight",
        showIfCollapsed: true,
        overviewRuler: null,
        minimap: null,
        hideInCommentTokens: hideInComments,
        hideInStringTokens: hideInStrings
      });
      this.map.set(key, options);
    }
    return options;
  }
};
_Decorations.instance = new _Decorations();
let Decorations = _Decorations;
class DisableHighlightingInCommentsAction extends EditorAction {
  constructor() {
    super({
      id: DisableHighlightingOfAmbiguousCharactersAction.ID,
      label: nls.localize2("action.unicodeHighlight.disableHighlightingInComments", "Disable highlighting of characters in comments"),
      precondition: void 0
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingInComments.shortLabel", "Disable Highlight In Comments");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.includeComments, false, ConfigurationTarget.USER);
  }
}
DisableHighlightingInCommentsAction.ID = "editor.action.unicodeHighlight.disableHighlightingInComments";
class DisableHighlightingInStringsAction extends EditorAction {
  constructor() {
    super({
      id: DisableHighlightingOfAmbiguousCharactersAction.ID,
      label: nls.localize2("action.unicodeHighlight.disableHighlightingInStrings", "Disable highlighting of characters in strings"),
      precondition: void 0
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingInStrings.shortLabel", "Disable Highlight In Strings");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.includeStrings, false, ConfigurationTarget.USER);
  }
}
DisableHighlightingInStringsAction.ID = "editor.action.unicodeHighlight.disableHighlightingInStrings";
const _DisableHighlightingOfAmbiguousCharactersAction = class _DisableHighlightingOfAmbiguousCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfAmbiguousCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters", "Disable highlighting of ambiguous characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfAmbiguousCharacters.shortLabel", "Disable Ambiguous Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.ambiguousCharacters, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfAmbiguousCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters";
let DisableHighlightingOfAmbiguousCharactersAction = _DisableHighlightingOfAmbiguousCharactersAction;
const _DisableHighlightingOfInvisibleCharactersAction = class _DisableHighlightingOfInvisibleCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfInvisibleCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfInvisibleCharacters", "Disable highlighting of invisible characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfInvisibleCharacters.shortLabel", "Disable Invisible Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.invisibleCharacters, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfInvisibleCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfInvisibleCharacters";
let DisableHighlightingOfInvisibleCharactersAction = _DisableHighlightingOfInvisibleCharactersAction;
const _DisableHighlightingOfNonBasicAsciiCharactersAction = class _DisableHighlightingOfNonBasicAsciiCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfNonBasicAsciiCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters", "Disable highlighting of non basic ASCII characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters.shortLabel", "Disable Non ASCII Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.nonBasicASCII, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfNonBasicAsciiCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters";
let DisableHighlightingOfNonBasicAsciiCharactersAction = _DisableHighlightingOfNonBasicAsciiCharactersAction;
const _ShowExcludeOptions = class _ShowExcludeOptions extends Action2 {
  constructor() {
    super({
      id: _ShowExcludeOptions.ID,
      title: nls.localize2("action.unicodeHighlight.showExcludeOptions", "Show Exclude Options"),
      precondition: void 0,
      f1: false
    });
  }
  async run(accessor, args) {
    const { codePoint, reason, inString, inComment } = args;
    const char = String.fromCodePoint(codePoint);
    const quickPickService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    function getExcludeCharFromBeingHighlightedLabel(codePoint2) {
      if (InvisibleCharacters.isInvisibleCharacter(codePoint2)) {
        return nls.localize("unicodeHighlight.excludeInvisibleCharFromBeingHighlighted", "Exclude {0} (invisible character) from being highlighted", codePointToHex(codePoint2));
      }
      return nls.localize("unicodeHighlight.excludeCharFromBeingHighlighted", "Exclude {0} from being highlighted", `${codePointToHex(codePoint2)} "${char}"`);
    }
    const options = [];
    if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
      for (const locale of reason.notAmbiguousInLocales) {
        options.push({
          label: nls.localize("unicodeHighlight.allowCommonCharactersInLanguage", 'Allow unicode characters that are more common in the language "{0}".', locale),
          run: async () => {
            excludeLocaleFromBeingHighlighted(configurationService, [locale]);
          }
        });
      }
    }
    options.push(
      {
        label: getExcludeCharFromBeingHighlightedLabel(codePoint),
        run: () => excludeCharFromBeingHighlighted(configurationService, [codePoint])
      }
    );
    if (inComment) {
      const action = new DisableHighlightingInCommentsAction();
      options.push({ label: action.label, run: async () => action.runAction(configurationService) });
    } else if (inString) {
      const action = new DisableHighlightingInStringsAction();
      options.push({ label: action.label, run: async () => action.runAction(configurationService) });
    }
    function getTitle(options2) {
      return typeof options2.desc.title === "string" ? options2.desc.title : options2.desc.title.value;
    }
    if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
      const action = new DisableHighlightingOfAmbiguousCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else if (reason.kind === UnicodeHighlighterReasonKind.Invisible) {
      const action = new DisableHighlightingOfInvisibleCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else if (reason.kind === UnicodeHighlighterReasonKind.NonBasicAscii) {
      const action = new DisableHighlightingOfNonBasicAsciiCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else {
      expectNever(reason);
    }
    const result = await quickPickService.pick(
      options,
      { title: configureUnicodeHighlightOptionsStr }
    );
    if (result) {
      await result.run();
    }
  }
};
_ShowExcludeOptions.ID = "editor.action.unicodeHighlight.showExcludeOptions";
let ShowExcludeOptions = _ShowExcludeOptions;
async function excludeCharFromBeingHighlighted(configurationService, charCodes) {
  const existingValue = configurationService.getValue(unicodeHighlightConfigKeys.allowedCharacters);
  let value;
  if (typeof existingValue === "object" && existingValue) {
    value = existingValue;
  } else {
    value = {};
  }
  for (const charCode of charCodes) {
    value[String.fromCodePoint(charCode)] = true;
  }
  await configurationService.updateValue(unicodeHighlightConfigKeys.allowedCharacters, value, ConfigurationTarget.USER);
}
async function excludeLocaleFromBeingHighlighted(configurationService, locales) {
  const existingValue = configurationService.inspect(unicodeHighlightConfigKeys.allowedLocales).user?.value;
  let value;
  if (typeof existingValue === "object" && existingValue) {
    value = Object.assign({}, existingValue);
  } else {
    value = {};
  }
  for (const locale of locales) {
    value[locale] = true;
  }
  await configurationService.updateValue(unicodeHighlightConfigKeys.allowedLocales, value, ConfigurationTarget.USER);
}
function expectNever(value) {
  throw new Error(`Unexpected value: ${value}`);
}
registerAction2(DisableHighlightingOfAmbiguousCharactersAction);
registerAction2(DisableHighlightingOfInvisibleCharactersAction);
registerAction2(DisableHighlightingOfNonBasicAsciiCharactersAction);
registerAction2(ShowExcludeOptions);
registerEditorContribution(UnicodeHighlighter.ID, UnicodeHighlighter, EditorContributionInstantiation.AfterFirstRender);
HoverParticipantRegistry.register(UnicodeHighlighterHoverParticipant);
export {
  DisableHighlightingInCommentsAction,
  DisableHighlightingInStringsAction,
  DisableHighlightingOfAmbiguousCharactersAction,
  DisableHighlightingOfInvisibleCharactersAction,
  DisableHighlightingOfNonBasicAsciiCharactersAction,
  ShowExcludeOptions,
  UnicodeHighlighter,
  UnicodeHighlighterHover,
  UnicodeHighlighterHoverParticipant,
  warningIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3VuaWNvZGVIaWdobGlnaHRlci9icm93c2VyL3VuaWNvZGVIaWdobGlnaHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21tYW5kVXJpLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSW52aXNpYmxlQ2hhcmFjdGVycywgaXNCYXNpY0FTQ0lJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgJy4vdW5pY29kZUhpZ2hsaWdodGVyLmNzcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJblVudHJ1c3RlZFdvcmtzcGFjZSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2UsIEVkaXRvck9wdGlvbiwgSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucywgdW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucywgVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uLCBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLCBVbmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlLCBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IEhvdmVyQW5jaG9yLCBIb3ZlckFuY2hvclR5cGUsIEhvdmVyUGFydGljaXBhbnRSZWdpc3RyeSwgSUVkaXRvckhvdmVyUGFydGljaXBhbnQsIElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIElIb3ZlclBhcnQsIElSZW5kZXJlZEhvdmVyUGFydHMgfSBmcm9tICcuLi8uLi9ob3Zlci9icm93c2VyL2hvdmVyVHlwZXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25Ib3ZlciwgcmVuZGVyTWFya2Rvd25Ib3ZlcnMgfSBmcm9tICcuLi8uLi9ob3Zlci9icm93c2VyL21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudC5qcyc7XG5pbXBvcnQgeyBCYW5uZXJDb250cm9sbGVyIH0gZnJvbSAnLi9iYW5uZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgc2FmZUludGwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IGlzTW9kZWxEZWNvcmF0aW9uSW5Db21tZW50LCBpc01vZGVsRGVjb3JhdGlvbkluU3RyaW5nLCBpc01vZGVsRGVjb3JhdGlvblZpc2libGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbERlY29yYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcblxuZXhwb3J0IGNvbnN0IHdhcm5pbmdJY29uID0gcmVnaXN0ZXJJY29uKCdleHRlbnNpb25zLXdhcm5pbmctbWVzc2FnZScsIENvZGljb24ud2FybmluZywgbmxzLmxvY2FsaXplKCd3YXJuaW5nSWNvbicsICdJY29uIHNob3duIHdpdGggYSB3YXJuaW5nIG1lc3NhZ2UgaW4gdGhlIGV4dGVuc2lvbnMgZWRpdG9yLicpKTtcblxuZXhwb3J0IGNsYXNzIFVuaWNvZGVIaWdobGlnaHRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi51bmljb2RlSGlnaGxpZ2h0ZXInO1xuXG5cdHByaXZhdGUgX2hpZ2hsaWdodGVyOiBEb2N1bWVudFVuaWNvZGVIaWdobGlnaHRlciB8IFZpZXdwb3J0VW5pY29kZUhpZ2hsaWdodGVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX29wdGlvbnM6IEludGVybmFsVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYmFubmVyQ29udHJvbGxlcjogQmFubmVyQ29udHJvbGxlcjtcblx0cHJpdmF0ZSBfYmFubmVyQ2xvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fYmFubmVyQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJhbm5lckNvbnRyb2xsZXIsIF9lZGl0b3IpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMuX2Jhbm5lckNsb3NlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0ZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9vcHRpb25zID0gX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnVuaWNvZGVIaWdobGlnaHRpbmcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3dvcmtzcGFjZVRydXN0U2VydmljZS5vbkRpZENoYW5nZVRydXN0KGUgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0ZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihfZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnVuaWNvZGVIaWdobGlnaHRpbmcpKSB7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMgPSBfZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24udW5pY29kZUhpZ2hsaWdodGluZyk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUhpZ2hsaWdodGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0ZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oaWdobGlnaHRlcikge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0ZXIgPSBudWxsO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVTdGF0ZSA9IChzdGF0ZTogSVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0IHwgbnVsbCk6IHZvaWQgPT4ge1xuXHRcdGlmIChzdGF0ZSAmJiBzdGF0ZS5oYXNNb3JlKSB7XG5cdFx0XHRpZiAodGhpcy5fYmFubmVyQ2xvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhpcyBkb2N1bWVudCBjb250YWlucyBtYW55IG5vbi1iYXNpYyBBU0NJSSBjaGFyYWN0ZXJzLlxuXHRcdFx0Y29uc3QgbWF4ID0gTWF0aC5tYXgoc3RhdGUuYW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQsIHN0YXRlLm5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudCwgc3RhdGUuaW52aXNpYmxlQ2hhcmFjdGVyQ291bnQpO1xuXG5cdFx0XHRsZXQgZGF0YTtcblx0XHRcdGlmIChzdGF0ZS5ub25CYXNpY0FzY2lpQ2hhcmFjdGVyQ291bnQgPj0gbWF4KSB7XG5cdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0aW5nLnRoaXNEb2N1bWVudEhhc01hbnlOb25CYXNpY0FzY2lpVW5pY29kZUNoYXJhY3RlcnMnLCAnVGhpcyBkb2N1bWVudCBjb250YWlucyBtYW55IG5vbi1iYXNpYyBBU0NJSSB1bmljb2RlIGNoYXJhY3RlcnMnKSxcblx0XHRcdFx0XHRjb21tYW5kOiBuZXcgRGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnNBY3Rpb24oKSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuYW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQgPj0gbWF4KSB7XG5cdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0aW5nLnRoaXNEb2N1bWVudEhhc01hbnlBbWJpZ3VvdXNVbmljb2RlQ2hhcmFjdGVycycsICdUaGlzIGRvY3VtZW50IGNvbnRhaW5zIG1hbnkgYW1iaWd1b3VzIHVuaWNvZGUgY2hhcmFjdGVycycpLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzQWN0aW9uKCksXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXRlLmludmlzaWJsZUNoYXJhY3RlckNvdW50ID49IG1heCkge1xuXHRcdFx0XHRkYXRhID0ge1xuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodGluZy50aGlzRG9jdW1lbnRIYXNNYW55SW52aXNpYmxlVW5pY29kZUNoYXJhY3RlcnMnLCAnVGhpcyBkb2N1bWVudCBjb250YWlucyBtYW55IGludmlzaWJsZSB1bmljb2RlIGNoYXJhY3RlcnMnKSxcblx0XHRcdFx0XHRjb21tYW5kOiBuZXcgRGlzYWJsZUhpZ2hsaWdodGluZ09mSW52aXNpYmxlQ2hhcmFjdGVyc0FjdGlvbigpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbnJlYWNoYWJsZScpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9iYW5uZXJDb250cm9sbGVyLnNob3coe1xuXHRcdFx0XHRpZDogJ3VuaWNvZGVIaWdobGlnaHRCYW5uZXInLFxuXHRcdFx0XHRtZXNzYWdlOiBkYXRhLm1lc3NhZ2UsXG5cdFx0XHRcdGljb246IHdhcm5pbmdJY29uLFxuXHRcdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGRhdGEuY29tbWFuZC5zaG9ydExhYmVsLFxuXHRcdFx0XHRcdFx0aHJlZjogYGNvbW1hbmQ6JHtkYXRhLmNvbW1hbmQuZGVzYy5pZH1gXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRvbkNsb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYmFubmVyQ2xvc2VkID0gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9iYW5uZXJDb250cm9sbGVyLmhpZGUoKTtcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGlnaGxpZ2h0ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlU3RhdGUobnVsbCk7XG5cblx0XHRpZiAodGhpcy5faGlnaGxpZ2h0ZXIpIHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodGVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodGVyID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvcHRpb25zID0gcmVzb2x2ZU9wdGlvbnModGhpcy5fd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpLCB0aGlzLl9vcHRpb25zKTtcblxuXHRcdGlmIChcblx0XHRcdFtcblx0XHRcdFx0b3B0aW9ucy5ub25CYXNpY0FTQ0lJLFxuXHRcdFx0XHRvcHRpb25zLmFtYmlndW91c0NoYXJhY3RlcnMsXG5cdFx0XHRcdG9wdGlvbnMuaW52aXNpYmxlQ2hhcmFjdGVycyxcblx0XHRcdF0uZXZlcnkoKG9wdGlvbikgPT4gb3B0aW9uID09PSBmYWxzZSlcblx0XHQpIHtcblx0XHRcdC8vIERvbid0IGRvIGFueXRoaW5nIGlmIHRoZSBmZWF0dXJlIGlzIGZ1bGx5IGRpc2FibGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlnaGxpZ2h0T3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyA9IHtcblx0XHRcdG5vbkJhc2ljQVNDSUk6IG9wdGlvbnMubm9uQmFzaWNBU0NJSSxcblx0XHRcdGFtYmlndW91c0NoYXJhY3RlcnM6IG9wdGlvbnMuYW1iaWd1b3VzQ2hhcmFjdGVycyxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IG9wdGlvbnMuaW52aXNpYmxlQ2hhcmFjdGVycyxcblx0XHRcdGluY2x1ZGVDb21tZW50czogb3B0aW9ucy5pbmNsdWRlQ29tbWVudHMsXG5cdFx0XHRpbmNsdWRlU3RyaW5nczogb3B0aW9ucy5pbmNsdWRlU3RyaW5ncyxcblx0XHRcdGFsbG93ZWRDb2RlUG9pbnRzOiBPYmplY3Qua2V5cyhvcHRpb25zLmFsbG93ZWRDaGFyYWN0ZXJzKS5tYXAoYyA9PiBjLmNvZGVQb2ludEF0KDApISksXG5cdFx0XHRhbGxvd2VkTG9jYWxlczogT2JqZWN0LmtleXMob3B0aW9ucy5hbGxvd2VkTG9jYWxlcykubWFwKGxvY2FsZSA9PiB7XG5cdFx0XHRcdGlmIChsb2NhbGUgPT09ICdfb3MnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3NMb2NhbGUgPSBzYWZlSW50bC5OdW1iZXJGb3JtYXQoKS52YWx1ZS5yZXNvbHZlZE9wdGlvbnMoKS5sb2NhbGU7XG5cdFx0XHRcdFx0cmV0dXJuIG9zTG9jYWxlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxvY2FsZSA9PT0gJ192c2NvZGUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBsYXRmb3JtLmxhbmd1YWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBsb2NhbGU7XG5cdFx0XHR9KSxcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UuY2FuQ29tcHV0ZVVuaWNvZGVIaWdobGlnaHRzKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLnVyaSkpIHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodGVyID0gbmV3IERvY3VtZW50VW5pY29kZUhpZ2hsaWdodGVyKHRoaXMuX2VkaXRvciwgaGlnaGxpZ2h0T3B0aW9ucywgdGhpcy5fdXBkYXRlU3RhdGUsIHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9oaWdobGlnaHRlciA9IG5ldyBWaWV3cG9ydFVuaWNvZGVIaWdobGlnaHRlcih0aGlzLl9lZGl0b3IsIGhpZ2hsaWdodE9wdGlvbnMsIHRoaXMuX3VwZGF0ZVN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbkluZm8oZGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbik6IFVuaWNvZGVIaWdobGlnaHRlckRlY29yYXRpb25JbmZvIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2hpZ2hsaWdodGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGlnaGxpZ2h0ZXIuZ2V0RGVjb3JhdGlvbkluZm8oZGVjb3JhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVW5pY29kZUhpZ2hsaWdodGVyRGVjb3JhdGlvbkluZm8ge1xuXHRyZWFzb246IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbjtcblx0aW5Db21tZW50OiBib29sZWFuO1xuXHRpblN0cmluZzogYm9vbGVhbjtcbn1cblxudHlwZSBSZXNvbHZlPFQ+ID1cblx0VCBleHRlbmRzIEluVW50cnVzdGVkV29ya3NwYWNlID8gbmV2ZXJcblx0OiBUIGV4dGVuZHMgJ2F1dG8nID8gbmV2ZXIgOiBUO1xuXG50eXBlIFJlc29sdmVkT3B0aW9ucyA9IHsgW1RLZXkgaW4ga2V5b2YgSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9uc106IFJlc29sdmU8SW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9uc1tUS2V5XT4gfTtcblxuZnVuY3Rpb24gcmVzb2x2ZU9wdGlvbnModHJ1c3RlZDogYm9vbGVhbiwgb3B0aW9uczogSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucyk6IFJlc29sdmVkT3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0bm9uQmFzaWNBU0NJSTogb3B0aW9ucy5ub25CYXNpY0FTQ0lJID09PSBpblVudHJ1c3RlZFdvcmtzcGFjZSA/ICF0cnVzdGVkIDogb3B0aW9ucy5ub25CYXNpY0FTQ0lJLFxuXHRcdGFtYmlndW91c0NoYXJhY3RlcnM6IG9wdGlvbnMuYW1iaWd1b3VzQ2hhcmFjdGVycyxcblx0XHRpbnZpc2libGVDaGFyYWN0ZXJzOiBvcHRpb25zLmludmlzaWJsZUNoYXJhY3RlcnMsXG5cdFx0aW5jbHVkZUNvbW1lbnRzOiBvcHRpb25zLmluY2x1ZGVDb21tZW50cyA9PT0gaW5VbnRydXN0ZWRXb3Jrc3BhY2UgPyAhdHJ1c3RlZCA6IG9wdGlvbnMuaW5jbHVkZUNvbW1lbnRzLFxuXHRcdGluY2x1ZGVTdHJpbmdzOiBvcHRpb25zLmluY2x1ZGVTdHJpbmdzID09PSBpblVudHJ1c3RlZFdvcmtzcGFjZSA/ICF0cnVzdGVkIDogb3B0aW9ucy5pbmNsdWRlU3RyaW5ncyxcblx0XHRhbGxvd2VkQ2hhcmFjdGVyczogb3B0aW9ucy5hbGxvd2VkQ2hhcmFjdGVycyxcblx0XHRhbGxvd2VkTG9jYWxlczogb3B0aW9ucy5hbGxvd2VkTG9jYWxlcyxcblx0fTtcbn1cblxuY2xhc3MgRG9jdW1lbnRVbmljb2RlSGlnaGxpZ2h0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVNvb246IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgX2RlY29yYXRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVTdGF0ZTogKHN0YXRlOiBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfCBudWxsKSA9PiB2b2lkLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3VwZGF0ZVNvb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGUoKSwgMjUwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2RlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX21vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFZlcnNpb25JZCA9IHRoaXMuX21vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2Vcblx0XHRcdC5jb21wdXRlZFVuaWNvZGVIaWdobGlnaHRzKHRoaXMuX21vZGVsLnVyaSwgdGhpcy5fb3B0aW9ucylcblx0XHRcdC50aGVuKChpbmZvKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsLmdldFZlcnNpb25JZCgpICE9PSBtb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0XHRcdC8vIG1vZGVsIGNoYW5nZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVN0YXRlKGluZm8pO1xuXG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdFx0XHRpZiAoIWluZm8uaGFzTW9yZSkge1xuXHRcdFx0XHRcdC8vIERvbid0IHNob3cgZGVjb3JhdGlvbiBpZiB0aGVyZSBhcmUgdG9vIG1hbnkuXG5cdFx0XHRcdFx0Ly8gSW4gdGhpcyBjYXNlLCBhIGJhbm5lciBpcyBzaG93bi5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIGluZm8ucmFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBEZWNvcmF0aW9ucy5pbnN0YW5jZS5nZXREZWNvcmF0aW9uRnJvbU9wdGlvbnModGhpcy5fb3B0aW9ucyksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KGRlY29yYXRpb25zKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25JbmZvKGRlY29yYXRpb246IElNb2RlbERlY29yYXRpb24pOiBVbmljb2RlSGlnaGxpZ2h0ZXJEZWNvcmF0aW9uSW5mbyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fZGVjb3JhdGlvbnMuaGFzKGRlY29yYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoXG5cdFx0XHQhaXNNb2RlbERlY29yYXRpb25WaXNpYmxlKG1vZGVsLCBkZWNvcmF0aW9uKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZGVjb3JhdGlvbi5yYW5nZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlYXNvbjogY29tcHV0ZVJlYXNvbih0ZXh0LCB0aGlzLl9vcHRpb25zKSEsXG5cdFx0XHRpbkNvbW1lbnQ6IGlzTW9kZWxEZWNvcmF0aW9uSW5Db21tZW50KG1vZGVsLCBkZWNvcmF0aW9uKSxcblx0XHRcdGluU3RyaW5nOiBpc01vZGVsRGVjb3JhdGlvbkluU3RyaW5nKG1vZGVsLCBkZWNvcmF0aW9uKSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFZpZXdwb3J0VW5pY29kZUhpZ2hsaWdodGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVNvb246IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVTdGF0ZTogKHN0YXRlOiBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfCBudWxsKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cblx0XHR0aGlzLl91cGRhdGVTb29uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdXBkYXRlKCksIDI1MCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlSGlkZGVuQXJlYXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2RlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX21vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZXMgPSB0aGlzLl9lZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHRvdGFsUmVzdWx0OiBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgPSB7XG5cdFx0XHRyYW5nZXM6IFtdLFxuXHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQ6IDAsXG5cdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJDb3VudDogMCxcblx0XHRcdG5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudDogMCxcblx0XHRcdGhhc01vcmU6IGZhbHNlLFxuXHRcdH07XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlci5jb21wdXRlVW5pY29kZUhpZ2hsaWdodHModGhpcy5fbW9kZWwsIHRoaXMuX29wdGlvbnMsIHJhbmdlKTtcblx0XHRcdGZvciAoY29uc3QgciBvZiByZXN1bHQucmFuZ2VzKSB7XG5cdFx0XHRcdHRvdGFsUmVzdWx0LnJhbmdlcy5wdXNoKHIpO1xuXHRcdFx0fVxuXHRcdFx0dG90YWxSZXN1bHQuYW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQgKz0gdG90YWxSZXN1bHQuYW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQ7XG5cdFx0XHR0b3RhbFJlc3VsdC5pbnZpc2libGVDaGFyYWN0ZXJDb3VudCArPSB0b3RhbFJlc3VsdC5pbnZpc2libGVDaGFyYWN0ZXJDb3VudDtcblx0XHRcdHRvdGFsUmVzdWx0Lm5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudCArPSB0b3RhbFJlc3VsdC5ub25CYXNpY0FzY2lpQ2hhcmFjdGVyQ291bnQ7XG5cdFx0XHR0b3RhbFJlc3VsdC5oYXNNb3JlID0gdG90YWxSZXN1bHQuaGFzTW9yZSB8fCByZXN1bHQuaGFzTW9yZTtcblx0XHR9XG5cblx0XHRpZiAoIXRvdGFsUmVzdWx0Lmhhc01vcmUpIHtcblx0XHRcdC8vIERvbid0IHNob3cgZGVjb3JhdGlvbnMgaWYgdGhlcmUgYXJlIHRvbyBtYW55LlxuXHRcdFx0Ly8gQSBiYW5uZXIgd2lsbCBiZSBzaG93biBpbnN0ZWFkLlxuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiB0b3RhbFJlc3VsdC5yYW5nZXMpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlLCBvcHRpb25zOiBEZWNvcmF0aW9ucy5pbnN0YW5jZS5nZXREZWNvcmF0aW9uRnJvbU9wdGlvbnModGhpcy5fb3B0aW9ucykgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZVN0YXRlKHRvdGFsUmVzdWx0KTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChkZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbkluZm8oZGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbik6IFVuaWNvZGVIaWdobGlnaHRlckRlY29yYXRpb25JbmZvIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9ucy5oYXMoZGVjb3JhdGlvbikpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZGVjb3JhdGlvbi5yYW5nZSk7XG5cdFx0aWYgKCFpc01vZGVsRGVjb3JhdGlvblZpc2libGUobW9kZWwsIGRlY29yYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlYXNvbjogY29tcHV0ZVJlYXNvbih0ZXh0LCB0aGlzLl9vcHRpb25zKSEsXG5cdFx0XHRpbkNvbW1lbnQ6IGlzTW9kZWxEZWNvcmF0aW9uSW5Db21tZW50KG1vZGVsLCBkZWNvcmF0aW9uKSxcblx0XHRcdGluU3RyaW5nOiBpc01vZGVsRGVjb3JhdGlvbkluU3RyaW5nKG1vZGVsLCBkZWNvcmF0aW9uKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmljb2RlSGlnaGxpZ2h0ZXJIb3ZlciBpbXBsZW1lbnRzIElIb3ZlclBhcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3duZXI6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PFVuaWNvZGVIaWdobGlnaHRlckhvdmVyPixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZWNvcmF0aW9uOiBJTW9kZWxEZWNvcmF0aW9uXG5cdCkgeyB9XG5cblx0cHVibGljIGlzVmFsaWRGb3JIb3ZlckFuY2hvcihhbmNob3I6IEhvdmVyQW5jaG9yKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdGFuY2hvci50eXBlID09PSBIb3ZlckFuY2hvclR5cGUuUmFuZ2Vcblx0XHRcdCYmIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gPD0gYW5jaG9yLnJhbmdlLnN0YXJ0Q29sdW1uXG5cdFx0XHQmJiB0aGlzLnJhbmdlLmVuZENvbHVtbiA+PSBhbmNob3IucmFuZ2UuZW5kQ29sdW1uXG5cdFx0KTtcblx0fVxufVxuXG5jb25zdCBjb25maWd1cmVVbmljb2RlSGlnaGxpZ2h0T3B0aW9uc1N0ciA9IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5jb25maWd1cmVVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucycsICdDb25maWd1cmUgVW5pY29kZSBIaWdobGlnaHQgT3B0aW9ucycpO1xuXG5leHBvcnQgY2xhc3MgVW5pY29kZUhpZ2hsaWdodGVySG92ZXJQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PE1hcmtkb3duSG92ZXI+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaG92ZXJPcmRpbmFsOiBudW1iZXIgPSA1O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNvbXB1dGVTeW5jKGFuY2hvcjogSG92ZXJBbmNob3IsIGxpbmVEZWNvcmF0aW9uczogSU1vZGVsRGVjb3JhdGlvbltdKTogTWFya2Rvd25Ib3ZlcltdIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8IGFuY2hvci50eXBlICE9PSBIb3ZlckFuY2hvclR5cGUuUmFuZ2UpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgdW5pY29kZUhpZ2hsaWdodGVyID0gdGhpcy5fZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxVbmljb2RlSGlnaGxpZ2h0ZXI+KFVuaWNvZGVIaWdobGlnaHRlci5JRCk7XG5cdFx0aWYgKCF1bmljb2RlSGlnaGxpZ2h0ZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IE1hcmtkb3duSG92ZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGV4aXN0ZWRSZWFzb24gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgaW5kZXggPSAzMDA7XG5cdFx0Zm9yIChjb25zdCBkIG9mIGxpbmVEZWNvcmF0aW9ucykge1xuXG5cdFx0XHRjb25zdCBoaWdobGlnaHRJbmZvID0gdW5pY29kZUhpZ2hsaWdodGVyLmdldERlY29yYXRpb25JbmZvKGQpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRJbmZvKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhciA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShkLnJhbmdlKTtcblx0XHRcdC8vIHRleHQgcmVmZXJzIHRvIGEgc2luZ2xlIGNoYXJhY3Rlci5cblx0XHRcdGNvbnN0IGNvZGVQb2ludCA9IGNoYXIuY29kZVBvaW50QXQoMCkhO1xuXG5cdFx0XHRjb25zdCBjb2RlUG9pbnRTdHIgPSBmb3JtYXRDb2RlUG9pbnRNYXJrZG93bihjb2RlUG9pbnQpO1xuXG5cdFx0XHRsZXQgcmVhc29uOiBzdHJpbmc7XG5cdFx0XHRzd2l0Y2ggKGhpZ2hsaWdodEluZm8ucmVhc29uLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkFtYmlndW91czoge1xuXHRcdFx0XHRcdGlmIChpc0Jhc2ljQVNDSUkoaGlnaGxpZ2h0SW5mby5yZWFzb24uY29uZnVzYWJsZVdpdGgpKSB7XG5cdFx0XHRcdFx0XHRyZWFzb24gPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCd1bmljb2RlSGlnaGxpZ2h0LmNoYXJhY3RlcklzQW1iaWd1b3VzQVNDSUknLFxuXHRcdFx0XHRcdFx0XHQnVGhlIGNoYXJhY3RlciB7MH0gY291bGQgYmUgY29uZnVzZWQgd2l0aCB0aGUgQVNDSUkgY2hhcmFjdGVyIHsxfSwgd2hpY2ggaXMgbW9yZSBjb21tb24gaW4gc291cmNlIGNvZGUuJyxcblx0XHRcdFx0XHRcdFx0Y29kZVBvaW50U3RyLFxuXHRcdFx0XHRcdFx0XHRmb3JtYXRDb2RlUG9pbnRNYXJrZG93bihoaWdobGlnaHRJbmZvLnJlYXNvbi5jb25mdXNhYmxlV2l0aC5jb2RlUG9pbnRBdCgwKSEpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZWFzb24gPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCd1bmljb2RlSGlnaGxpZ2h0LmNoYXJhY3RlcklzQW1iaWd1b3VzJyxcblx0XHRcdFx0XHRcdFx0J1RoZSBjaGFyYWN0ZXIgezB9IGNvdWxkIGJlIGNvbmZ1c2VkIHdpdGggdGhlIGNoYXJhY3RlciB7MX0sIHdoaWNoIGlzIG1vcmUgY29tbW9uIGluIHNvdXJjZSBjb2RlLicsXG5cdFx0XHRcdFx0XHRcdGNvZGVQb2ludFN0cixcblx0XHRcdFx0XHRcdFx0Zm9ybWF0Q29kZVBvaW50TWFya2Rvd24oaGlnaGxpZ2h0SW5mby5yZWFzb24uY29uZnVzYWJsZVdpdGguY29kZVBvaW50QXQoMCkhKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlIFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuSW52aXNpYmxlOlxuXHRcdFx0XHRcdHJlYXNvbiA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdCd1bmljb2RlSGlnaGxpZ2h0LmNoYXJhY3RlcklzSW52aXNpYmxlJyxcblx0XHRcdFx0XHRcdCdUaGUgY2hhcmFjdGVyIHswfSBpcyBpbnZpc2libGUuJyxcblx0XHRcdFx0XHRcdGNvZGVQb2ludFN0clxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLk5vbkJhc2ljQXNjaWk6XG5cdFx0XHRcdFx0cmVhc29uID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J3VuaWNvZGVIaWdobGlnaHQuY2hhcmFjdGVySXNOb25CYXNpY0FzY2lpJyxcblx0XHRcdFx0XHRcdCdUaGUgY2hhcmFjdGVyIHswfSBpcyBub3QgYSBiYXNpYyBBU0NJSSBjaGFyYWN0ZXIuJyxcblx0XHRcdFx0XHRcdGNvZGVQb2ludFN0clxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleGlzdGVkUmVhc29uLmhhcyhyZWFzb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZXhpc3RlZFJlYXNvbi5hZGQocmVhc29uKTtcblxuXHRcdFx0Y29uc3QgYWRqdXN0U2V0dGluZ3NBcmdzOiBTaG93RXhjbHVkZU9wdGlvbnNBcmdzID0ge1xuXHRcdFx0XHRjb2RlUG9pbnQ6IGNvZGVQb2ludCxcblx0XHRcdFx0cmVhc29uOiBoaWdobGlnaHRJbmZvLnJlYXNvbixcblx0XHRcdFx0aW5Db21tZW50OiBoaWdobGlnaHRJbmZvLmluQ29tbWVudCxcblx0XHRcdFx0aW5TdHJpbmc6IGhpZ2hsaWdodEluZm8uaW5TdHJpbmcsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhZGp1c3RTZXR0aW5ncyA9IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5hZGp1c3RTZXR0aW5ncycsICdBZGp1c3Qgc2V0dGluZ3MnKTtcblx0XHRcdGNvbnN0IHVyaSA9IGNyZWF0ZUNvbW1hbmRVcmkoU2hvd0V4Y2x1ZGVPcHRpb25zLklELCBhZGp1c3RTZXR0aW5nc0FyZ3MpO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHRydWUpXG5cdFx0XHRcdC5hcHBlbmRNYXJrZG93bihyZWFzb24pXG5cdFx0XHRcdC5hcHBlbmRUZXh0KCcgJylcblx0XHRcdFx0LmFwcGVuZExpbmsodXJpLCBhZGp1c3RTZXR0aW5ncywgY29uZmlndXJlVW5pY29kZUhpZ2hsaWdodE9wdGlvbnNTdHIpO1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IE1hcmtkb3duSG92ZXIodGhpcywgZC5yYW5nZSwgW21hcmtkb3duXSwgZmFsc2UsIGluZGV4KyspKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJIb3ZlclBhcnRzKGNvbnRleHQ6IElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIGhvdmVyUGFydHM6IE1hcmtkb3duSG92ZXJbXSk6IElSZW5kZXJlZEhvdmVyUGFydHM8TWFya2Rvd25Ib3Zlcj4ge1xuXHRcdHJldHVybiByZW5kZXJNYXJrZG93bkhvdmVycyhjb250ZXh0LCBob3ZlclBhcnRzLCB0aGlzLl9lZGl0b3IsIHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlQ29udGVudChob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBob3ZlclBhcnQuY29udGVudHMubWFwKGMgPT4gYy52YWx1ZSkuam9pbignXFxuJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29kZVBvaW50VG9IZXgoY29kZVBvaW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYFUrJHtjb2RlUG9pbnQudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDQsICcwJyl9YDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0Q29kZVBvaW50TWFya2Rvd24oY29kZVBvaW50OiBudW1iZXIpIHtcblx0bGV0IHZhbHVlID0gYFxcYCR7Y29kZVBvaW50VG9IZXgoY29kZVBvaW50KX1cXGBgO1xuXHRpZiAoIUludmlzaWJsZUNoYXJhY3RlcnMuaXNJbnZpc2libGVDaGFyYWN0ZXIoY29kZVBvaW50KSkge1xuXHRcdC8vIERvbid0IHJlbmRlciBhbnkgY29udHJvbCBjaGFyYWN0ZXJzIG9yIGFueSBpbnZpc2libGUgY2hhcmFjdGVycywgYXMgdGhleSBjYW5ub3QgYmUgc2VlbiBhbnl3YXlzLlxuXHRcdHZhbHVlICs9IGAgXCIke2Ake3JlbmRlckNvZGVQb2ludEFzSW5saW5lQ29kZShjb2RlUG9pbnQpfWB9XCJgO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ29kZVBvaW50QXNJbmxpbmVDb2RlKGNvZGVQb2ludDogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKGNvZGVQb2ludCA9PT0gQ2hhckNvZGUuQmFja1RpY2spIHtcblx0XHRyZXR1cm4gJ2BgIGAgYGAnO1xuXHR9XG5cdHJldHVybiAnYCcgKyBTdHJpbmcuZnJvbUNvZGVQb2ludChjb2RlUG9pbnQpICsgJ2AnO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlUmVhc29uKGNoYXI6IHN0cmluZywgb3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyk6IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbiB8IG51bGwge1xuXHRyZXR1cm4gVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmNvbXB1dGVVbmljb2RlSGlnaGxpZ2h0UmVhc29uKGNoYXIsIG9wdGlvbnMpO1xufVxuXG5jbGFzcyBEZWNvcmF0aW9ucyB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaW5zdGFuY2UgPSBuZXcgRGVjb3JhdGlvbnMoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBNb2RlbERlY29yYXRpb25PcHRpb25zPigpO1xuXG5cdGdldERlY29yYXRpb25Gcm9tT3B0aW9ucyhvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RGVjb3JhdGlvbighb3B0aW9ucy5pbmNsdWRlQ29tbWVudHMsICFvcHRpb25zLmluY2x1ZGVTdHJpbmdzKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVjb3JhdGlvbihoaWRlSW5Db21tZW50czogYm9vbGVhbiwgaGlkZUluU3RyaW5nczogYm9vbGVhbik6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IGtleSA9IGAke2hpZGVJbkNvbW1lbnRzfSR7aGlkZUluU3RyaW5nc31gO1xuXHRcdGxldCBvcHRpb25zID0gdGhpcy5tYXAuZ2V0KGtleSk7XG5cdFx0aWYgKCFvcHRpb25zKSB7XG5cdFx0XHRvcHRpb25zID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd1bmljb2RlLWhpZ2hsaWdodCcsXG5cdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdFx0XHRjbGFzc05hbWU6ICd1bmljb2RlLWhpZ2hsaWdodCcsXG5cdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlcjogbnVsbCxcblx0XHRcdFx0bWluaW1hcDogbnVsbCxcblx0XHRcdFx0aGlkZUluQ29tbWVudFRva2VuczogaGlkZUluQ29tbWVudHMsXG5cdFx0XHRcdGhpZGVJblN0cmluZ1Rva2VuczogaGlkZUluU3RyaW5ncyxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5tYXAuc2V0KGtleSwgb3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRGlzYWJsZVVuaWNvZGVIaWdobGlnaHRBY3Rpb24ge1xuXHRzaG9ydExhYmVsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlSGlnaGxpZ2h0aW5nSW5Db21tZW50c0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiBpbXBsZW1lbnRzIElEaXNhYmxlVW5pY29kZUhpZ2hsaWdodEFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgSUQgPSAnZWRpdG9yLmFjdGlvbi51bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdJbkNvbW1lbnRzJztcblx0cHVibGljIHJlYWRvbmx5IHNob3J0TGFiZWwgPSBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ0luQ29tbWVudHMuc2hvcnRMYWJlbCcsICdEaXNhYmxlIEhpZ2hsaWdodCBJbiBDb21tZW50cycpO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVyc0FjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nSW5Db21tZW50cycsIFwiRGlzYWJsZSBoaWdobGlnaHRpbmcgb2YgY2hhcmFjdGVycyBpbiBjb21tZW50c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbmNsdWRlQ29tbWVudHMsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlSGlnaGxpZ2h0aW5nSW5TdHJpbmdzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIGltcGxlbWVudHMgSURpc2FibGVVbmljb2RlSGlnaGxpZ2h0QWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ0luU3RyaW5ncyc7XG5cdHB1YmxpYyByZWFkb25seSBzaG9ydExhYmVsID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdJblN0cmluZ3Muc2hvcnRMYWJlbCcsICdEaXNhYmxlIEhpZ2hsaWdodCBJbiBTdHJpbmdzJyk7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi51bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdJblN0cmluZ3MnLCBcIkRpc2FibGUgaGlnaGxpZ2h0aW5nIG9mIGNoYXJhY3RlcnMgaW4gc3RyaW5nc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbmNsdWRlU3RyaW5ncywgZmFsc2UsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIGltcGxlbWVudHMgSURpc2FibGVVbmljb2RlSGlnaGxpZ2h0QWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVycyc7XG5cdHB1YmxpYyByZWFkb25seSBzaG9ydExhYmVsID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnMuc2hvcnRMYWJlbCcsICdEaXNhYmxlIEFtYmlndW91cyBIaWdobGlnaHQnKTtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVycycsIFwiRGlzYWJsZSBoaWdobGlnaHRpbmcgb2YgYW1iaWd1b3VzIGNoYXJhY3RlcnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFtYmlndW91c0NoYXJhY3RlcnMsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZJbnZpc2libGVDaGFyYWN0ZXJzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiBpbXBsZW1lbnRzIElEaXNhYmxlVW5pY29kZUhpZ2hsaWdodEFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgSUQgPSAnZWRpdG9yLmFjdGlvbi51bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnMnO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvcnRMYWJlbCA9IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZJbnZpc2libGVDaGFyYWN0ZXJzLnNob3J0TGFiZWwnLCAnRGlzYWJsZSBJbnZpc2libGUgSGlnaGxpZ2h0Jyk7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZJbnZpc2libGVDaGFyYWN0ZXJzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi51bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnMnLCBcIkRpc2FibGUgaGlnaGxpZ2h0aW5nIG9mIGludmlzaWJsZSBjaGFyYWN0ZXJzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbnZpc2libGVDaGFyYWN0ZXJzLCBmYWxzZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIGltcGxlbWVudHMgSURpc2FibGVVbmljb2RlSGlnaGxpZ2h0QWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnMnO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvcnRMYWJlbCA9IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVycy5zaG9ydExhYmVsJywgJ0Rpc2FibGUgTm9uIEFTQ0lJIEhpZ2hsaWdodCcpO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnMnLCBcIkRpc2FibGUgaGlnaGxpZ2h0aW5nIG9mIG5vbiBiYXNpYyBBU0NJSSBjaGFyYWN0ZXJzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5ub25CYXNpY0FTQ0lJLCBmYWxzZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgU2hvd0V4Y2x1ZGVPcHRpb25zQXJncyB7XG5cdGNvZGVQb2ludDogbnVtYmVyO1xuXHRyZWFzb246IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbjtcblx0aW5Db21tZW50OiBib29sZWFuO1xuXHRpblN0cmluZzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFNob3dFeGNsdWRlT3B0aW9ucyBleHRlbmRzIEFjdGlvbjIge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5hY3Rpb24udW5pY29kZUhpZ2hsaWdodC5zaG93RXhjbHVkZU9wdGlvbnMnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0V4Y2x1ZGVPcHRpb25zLklELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi51bmljb2RlSGlnaGxpZ2h0LnNob3dFeGNsdWRlT3B0aW9ucycsIFwiU2hvdyBFeGNsdWRlIE9wdGlvbnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgY29kZVBvaW50LCByZWFzb24sIGluU3RyaW5nLCBpbkNvbW1lbnQgfSA9IGFyZ3MgYXMgU2hvd0V4Y2x1ZGVPcHRpb25zQXJncztcblxuXHRcdGNvbnN0IGNoYXIgPSBTdHJpbmcuZnJvbUNvZGVQb2ludChjb2RlUG9pbnQpO1xuXG5cdFx0Y29uc3QgcXVpY2tQaWNrU2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpbnRlcmZhY2UgRXh0ZW5kZWRPcHRpb25zIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0cnVuKCk6IFByb21pc2U8dm9pZD47XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0RXhjbHVkZUNoYXJGcm9tQmVpbmdIaWdobGlnaHRlZExhYmVsKGNvZGVQb2ludDogbnVtYmVyKSB7XG5cdFx0XHRpZiAoSW52aXNpYmxlQ2hhcmFjdGVycy5pc0ludmlzaWJsZUNoYXJhY3Rlcihjb2RlUG9pbnQpKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuZXhjbHVkZUludmlzaWJsZUNoYXJGcm9tQmVpbmdIaWdobGlnaHRlZCcsICdFeGNsdWRlIHswfSAoaW52aXNpYmxlIGNoYXJhY3RlcikgZnJvbSBiZWluZyBoaWdobGlnaHRlZCcsIGNvZGVQb2ludFRvSGV4KGNvZGVQb2ludCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5leGNsdWRlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkJywgJ0V4Y2x1ZGUgezB9IGZyb20gYmVpbmcgaGlnaGxpZ2h0ZWQnLCBgJHtjb2RlUG9pbnRUb0hleChjb2RlUG9pbnQpfSBcIiR7Y2hhcn1cImApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnM6IEV4dGVuZGVkT3B0aW9uc1tdID0gW107XG5cblx0XHRpZiAocmVhc29uLmtpbmQgPT09IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuQW1iaWd1b3VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxvY2FsZSBvZiByZWFzb24ubm90QW1iaWd1b3VzSW5Mb2NhbGVzKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZShcInVuaWNvZGVIaWdobGlnaHQuYWxsb3dDb21tb25DaGFyYWN0ZXJzSW5MYW5ndWFnZVwiLCBcIkFsbG93IHVuaWNvZGUgY2hhcmFjdGVycyB0aGF0IGFyZSBtb3JlIGNvbW1vbiBpbiB0aGUgbGFuZ3VhZ2UgXFxcInswfVxcXCIuXCIsIGxvY2FsZSksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRleGNsdWRlTG9jYWxlRnJvbUJlaW5nSGlnaGxpZ2h0ZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIFtsb2NhbGVdKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRvcHRpb25zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBnZXRFeGNsdWRlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkTGFiZWwoY29kZVBvaW50KSxcblx0XHRcdFx0cnVuOiAoKSA9PiBleGNsdWRlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBbY29kZVBvaW50XSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0aWYgKGluQ29tbWVudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IERpc2FibGVIaWdobGlnaHRpbmdJbkNvbW1lbnRzQWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogYWN0aW9uLmxhYmVsLCBydW46IGFzeW5jICgpID0+IGFjdGlvbi5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHRcdH0gZWxzZSBpZiAoaW5TdHJpbmcpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nSW5TdHJpbmdzQWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogYWN0aW9uLmxhYmVsLCBydW46IGFzeW5jICgpID0+IGFjdGlvbi5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFRpdGxlKG9wdGlvbnM6IEFjdGlvbjIpIHtcblx0XHRcdHJldHVybiB0eXBlb2Ygb3B0aW9ucy5kZXNjLnRpdGxlID09PSAnc3RyaW5nJyA/IG9wdGlvbnMuZGVzYy50aXRsZSA6IG9wdGlvbnMuZGVzYy50aXRsZS52YWx1ZTtcblx0XHR9XG5cblx0XHRpZiAocmVhc29uLmtpbmQgPT09IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuQW1iaWd1b3VzKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgRGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVyc0FjdGlvbigpO1xuXHRcdFx0b3B0aW9ucy5wdXNoKHsgbGFiZWw6IGdldFRpdGxlKGFjdGlvbiksIHJ1bjogYXN5bmMgKCkgPT4gYWN0aW9uLnJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0fSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5JbnZpc2libGUpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZJbnZpc2libGVDaGFyYWN0ZXJzQWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogZ2V0VGl0bGUoYWN0aW9uKSwgcnVuOiBhc3luYyAoKSA9PiBhY3Rpb24ucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KTtcblx0XHR9IGVsc2UgaWYgKHJlYXNvbi5raW5kID09PSBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLk5vbkJhc2ljQXNjaWkpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVyc0FjdGlvbigpO1xuXHRcdFx0b3B0aW9ucy5wdXNoKHsgbGFiZWw6IGdldFRpdGxlKGFjdGlvbiksIHJ1bjogYXN5bmMgKCkgPT4gYWN0aW9uLnJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4cGVjdE5ldmVyKHJlYXNvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcXVpY2tQaWNrU2VydmljZS5waWNrKFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHsgdGl0bGU6IGNvbmZpZ3VyZVVuaWNvZGVIaWdobGlnaHRPcHRpb25zU3RyIH1cblx0XHQpO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0YXdhaXQgcmVzdWx0LnJ1bigpO1xuXHRcdH1cblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBleGNsdWRlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXJDb2RlczogbnVtYmVyW10pIHtcblx0Y29uc3QgZXhpc3RpbmdWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFsbG93ZWRDaGFyYWN0ZXJzKTtcblxuXHRsZXQgdmFsdWU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRpZiAoKHR5cGVvZiBleGlzdGluZ1ZhbHVlID09PSAnb2JqZWN0JykgJiYgZXhpc3RpbmdWYWx1ZSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHZhbHVlID0gZXhpc3RpbmdWYWx1ZSBhcyBhbnk7XG5cdH0gZWxzZSB7XG5cdFx0dmFsdWUgPSB7fTtcblx0fVxuXG5cdGZvciAoY29uc3QgY2hhckNvZGUgb2YgY2hhckNvZGVzKSB7XG5cdFx0dmFsdWVbU3RyaW5nLmZyb21Db2RlUG9pbnQoY2hhckNvZGUpXSA9IHRydWU7XG5cdH1cblxuXHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5hbGxvd2VkQ2hhcmFjdGVycywgdmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4Y2x1ZGVMb2NhbGVGcm9tQmVpbmdIaWdobGlnaHRlZChjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2NhbGVzOiBzdHJpbmdbXSkge1xuXHRjb25zdCBleGlzdGluZ1ZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCh1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5hbGxvd2VkTG9jYWxlcykudXNlcj8udmFsdWU7XG5cblx0bGV0IHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcblx0aWYgKCh0eXBlb2YgZXhpc3RpbmdWYWx1ZSA9PT0gJ29iamVjdCcpICYmIGV4aXN0aW5nVmFsdWUpIHtcblx0XHQvLyBDb3B5IHZhbHVlLCBhcyB0aGUgZXhpc3RpbmcgdmFsdWUgaXMgcmVhZCBvbmx5XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dmFsdWUgPSBPYmplY3QuYXNzaWduKHt9LCBleGlzdGluZ1ZhbHVlIGFzIGFueSk7XG5cdH0gZWxzZSB7XG5cdFx0dmFsdWUgPSB7fTtcblx0fVxuXG5cdGZvciAoY29uc3QgbG9jYWxlIG9mIGxvY2FsZXMpIHtcblx0XHR2YWx1ZVtsb2NhbGVdID0gdHJ1ZTtcblx0fVxuXG5cdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFsbG93ZWRMb2NhbGVzLCB2YWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcbn1cblxuZnVuY3Rpb24gZXhwZWN0TmV2ZXIodmFsdWU6IG5ldmVyKSB7XG5cdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCB2YWx1ZTogJHt2YWx1ZX1gKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKERpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKERpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKERpc2FibGVIaWdobGlnaHRpbmdPZk5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93RXhjbHVkZU9wdGlvbnMpO1xucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oVW5pY29kZUhpZ2hsaWdodGVyLklELCBVbmljb2RlSGlnaGxpZ2h0ZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG5Ib3ZlclBhcnRpY2lwYW50UmVnaXN0cnkucmVnaXN0ZXIoVW5pY29kZUhpZ2hsaWdodGVySG92ZXJQYXJ0aWNpcGFudCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxjQUFjO0FBQzFCLFNBQVMscUJBQXFCLG9CQUFvQjtBQUNsRCxPQUFPO0FBRVAsU0FBUyxjQUFjLGlDQUFpQyxrQ0FBb0Q7QUFDNUcsU0FBK0Isc0JBQXNCLGNBQStDLGtDQUFrQztBQUd0SSxTQUE4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Q3RFLGNBQVEsS0FBSyxFQUFFLE9BQU8sU0FBUyxNQUFNLEdBQUcsS0FBSyxZQUFZLE9BQU8sVUFBVSxvQkFBb0IsRUFBRSxDQUFDO0FBQUEsSUFDbEcsT0FBTztBQUNOLGtCQUFZLE1BQU07QUFBQSxJQUNuQjtBQUVBLFVBQU0sU0FBUyxNQUFNLGlCQUFpQjtBQUFBLE1BQ3JDO0FBQUEsTUFDQSxFQUFFLE9BQU8sb0NBQW9DO0FBQUEsSUFDOUM7QUFFQSxRQUFJLFFBQVE7QUFDWCxZQUFNLE9BQU8sSUFBSTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUNEO0FBcEZhLG9CQUNFLEtBQUs7QUFEYixJQUFNLHFCQUFOO0FBc0ZQLGVBQWUsZ0NBQWdDLHNCQUE2QyxXQUFxQjtBQUNoSCxRQUFNLGdCQUFnQixxQkFBcUIsU0FBUywyQkFBMkIsaUJBQWlCO0FBRWhHLE1BQUk7QUFDSixNQUFLLE9BQU8sa0JBQWtCLFlBQWEsZUFBZTtBQUV6RCxZQUFRO0FBQUEsRUFDVCxPQUFPO0FBQ04sWUFBUSxDQUFDO0FBQUEsRUFDVjtBQUVBLGFBQVcsWUFBWSxXQUFXO0FBQ2pDLFVBQU0sT0FBTyxjQUFjLFFBQVEsQ0FBQyxJQUFJO0FBQUEsRUFDekM7QUFFQSxRQUFNLHFCQUFxQixZQUFZLDJCQUEyQixtQkFBbUIsT0FBTyxvQkFBb0IsSUFBSTtBQUNySDtBQUVBLGVBQWUsa0NBQWtDLHNCQUE2QyxTQUFtQjtBQUNoSCxRQUFNLGdCQUFnQixxQkFBcUIsUUFBUSwyQkFBMkIsY0FBYyxFQUFFLE1BQU07QUFFcEcsTUFBSTtBQUNKLE1BQUssT0FBTyxrQkFBa0IsWUFBYSxlQUFlO0FBR3pELFlBQVEsT0FBTyxPQUFPLENBQUMsR0FBRyxhQUFvQjtBQUFBLEVBQy9DLE9BQU87QUFDTixZQUFRLENBQUM7QUFBQSxFQUNWO0FBRUEsYUFBVyxVQUFVLFNBQVM7QUFDN0IsVUFBTSxNQUFNLElBQUk7QUFBQSxFQUNqQjtBQUVBLFFBQU0scUJBQXFCLFlBQVksMkJBQTJCLGdCQUFnQixPQUFPLG9CQUFvQixJQUFJO0FBQ2xIO0FBRUEsU0FBUyxZQUFZLE9BQWM7QUFDbEMsUUFBTSxJQUFJLE1BQU0scUJBQXFCLEtBQUssRUFBRTtBQUM3QztBQUVBLGdCQUFnQiw4Q0FBOEM7QUFDOUQsZ0JBQWdCLDhDQUE4QztBQUM5RCxnQkFBZ0Isa0RBQWtEO0FBQ2xFLGdCQUFnQixrQkFBa0I7QUFDbEMsMkJBQTJCLG1CQUFtQixJQUFJLG9CQUFvQixnQ0FBZ0MsZ0JBQWdCO0FBQ3RILHlCQUF5QixTQUFTLGtDQUFrQzsiLAogICJuYW1lcyI6IFsiY29kZVBvaW50IiwgIm9wdGlvbnMiXQp9Cg==
