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
import { createCancelablePromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as platform from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import "./links.css";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ClickLinkGesture } from "../../gotoSymbol/browser/link/clickLinkGesture.js";
import { getLinks } from "./getLinks.js";
import * as nls from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
let LinkDetector = class extends Disposable {
  constructor(editor, openerService, notificationService, languageFeaturesService, languageFeatureDebounceService) {
    super();
    this.editor = editor;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.languageFeaturesService = languageFeaturesService;
    this.providers = this.languageFeaturesService.linkProvider;
    this.debounceInformation = languageFeatureDebounceService.for(this.providers, "Links", { min: 1e3, max: 4e3 });
    this.computeLinks = this._register(new RunOnceScheduler(() => this.computeLinksNow(), 1e3));
    this.computePromise = null;
    this.activeLinksList = null;
    this.currentOccurrences = {};
    this.activeLinkDecorationId = null;
    const clickLinkGesture = this._register(new ClickLinkGesture(editor));
    this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
      this._onEditorMouseMove(mouseEvent, keyboardEvent);
    }));
    this._register(clickLinkGesture.onExecute((e) => {
      this.onEditorMouseUp(e);
    }));
    this._register(clickLinkGesture.onCancel((e) => {
      this.cleanUpActiveLinkDecoration();
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (!e.hasChanged(EditorOption.links)) {
        return;
      }
      this.updateDecorations([]);
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      if (!this.editor.hasModel()) {
        return;
      }
      this.computeLinks.schedule(this.debounceInformation.get(this.editor.getModel()));
    }));
    this._register(editor.onDidChangeModel((e) => {
      this.currentOccurrences = {};
      this.activeLinkDecorationId = null;
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(editor.onDidChangeModelLanguage((e) => {
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(this.providers.onDidChange((e) => {
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this.computeLinks.schedule(0);
  }
  static get(editor) {
    return editor.getContribution(LinkDetector.ID);
  }
  async computeLinksNow() {
    if (!this.editor.hasModel() || !this.editor.getOption(EditorOption.links)) {
      return;
    }
    const model = this.editor.getModel();
    if (model.isTooLargeForSyncing()) {
      return;
    }
    if (!this.providers.has(model)) {
      return;
    }
    if (this.activeLinksList) {
      this.activeLinksList.dispose();
      this.activeLinksList = null;
    }
    this.computePromise = createCancelablePromise((token) => getLinks(this.providers, model, token));
    try {
      const sw = new StopWatch(false);
      this.activeLinksList = await this.computePromise;
      this.debounceInformation.update(model, sw.elapsed());
      if (model.isDisposed()) {
        return;
      }
      this.updateDecorations(this.activeLinksList.links);
    } catch (err) {
      onUnexpectedError(err);
    } finally {
      this.computePromise = null;
    }
  }
  updateDecorations(links) {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    const oldDecorations = [];
    const keys = Object.keys(this.currentOccurrences);
    for (const decorationId of keys) {
      const occurence = this.currentOccurrences[decorationId];
      oldDecorations.push(occurence.decorationId);
    }
    const newDecorations = [];
    if (links) {
      for (const link of links) {
        newDecorations.push(LinkOccurrence.decoration(link, useMetaKey));
      }
    }
    this.editor.changeDecorations((changeAccessor) => {
      const decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);
      this.currentOccurrences = {};
      this.activeLinkDecorationId = null;
      for (let i = 0, len = decorations.length; i < len; i++) {
        const occurence = new LinkOccurrence(links[i], decorations[i]);
        this.currentOccurrences[occurence.decorationId] = occurence;
      }
    });
  }
  _onEditorMouseMove(mouseEvent, withKey) {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    if (this.isEnabled(mouseEvent, withKey)) {
      this.cleanUpActiveLinkDecoration();
      const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
      if (occurrence) {
        this.editor.changeDecorations((changeAccessor) => {
          occurrence.activate(changeAccessor, useMetaKey);
          this.activeLinkDecorationId = occurrence.decorationId;
        });
      }
    } else {
      this.cleanUpActiveLinkDecoration();
    }
  }
  cleanUpActiveLinkDecoration() {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    if (this.activeLinkDecorationId) {
      const occurrence = this.currentOccurrences[this.activeLinkDecorationId];
      if (occurrence) {
        this.editor.changeDecorations((changeAccessor) => {
          occurrence.deactivate(changeAccessor, useMetaKey);
        });
      }
      this.activeLinkDecorationId = null;
    }
  }
  onEditorMouseUp(mouseEvent) {
    if (!this.isEnabled(mouseEvent)) {
      return;
    }
    const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
    if (!occurrence) {
      return;
    }
    this.openLinkOccurrence(
      occurrence,
      mouseEvent.hasSideBySideModifier,
      true
      /* from user gesture */
    );
  }
  openLinkOccurrence(occurrence, openToSide, fromUserGesture = false) {
    if (!this.openerService) {
      return;
    }
    const { link } = occurrence;
    link.resolve(CancellationToken.None).then((uri) => {
      if (typeof uri === "string" && this.editor.hasModel()) {
        const modelUri = this.editor.getModel().uri;
        if (modelUri.scheme === Schemas.file && uri.startsWith(`${Schemas.file}:`)) {
          const parsedUri = URI.parse(uri);
          if (parsedUri.scheme === Schemas.file) {
            const fsPath = resources.originalFSPath(parsedUri);
            let relativePath = null;
            if (fsPath.startsWith("/./") || fsPath.startsWith("\\.\\")) {
              relativePath = `.${fsPath.substr(1)}`;
            } else if (fsPath.startsWith("//./") || fsPath.startsWith("\\\\.\\")) {
              relativePath = `.${fsPath.substr(2)}`;
            }
            if (relativePath) {
              uri = resources.joinPath(modelUri, relativePath);
            }
          }
        }
      }
      return this.openerService.open(uri, { openToSide, fromUserGesture, allowContributedOpeners: true, allowCommands: true, fromWorkspace: true });
    }, (err) => {
      const messageOrError = err instanceof Error ? err.message : err;
      if (messageOrError === "invalid") {
        this.notificationService.warn(nls.localize("invalid.url", "Failed to open this link because it is not well-formed: {0}", link.url.toString()));
      } else if (messageOrError === "missing") {
        this.notificationService.warn(nls.localize("missing.url", "Failed to open this link because its target is missing."));
      } else {
        onUnexpectedError(err);
      }
    });
  }
  getLinkOccurrence(position) {
    if (!this.editor.hasModel() || !position) {
      return null;
    }
    const decorations = this.editor.getModel().getDecorationsInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    }, 0, true);
    for (const decoration2 of decorations) {
      const currentOccurrence = this.currentOccurrences[decoration2.id];
      if (currentOccurrence) {
        return currentOccurrence;
      }
    }
    return null;
  }
  isEnabled(mouseEvent, withKey) {
    return Boolean(
      mouseEvent.target.type === MouseTargetType.CONTENT_TEXT && (mouseEvent.hasTriggerModifier || withKey && withKey.keyCodeIsTriggerKey || mouseEvent.isMiddleClick && mouseEvent.mouseMiddleClickAction === "openLink")
    );
  }
  stop() {
    this.computeLinks.cancel();
    if (this.activeLinksList) {
      this.activeLinksList?.dispose();
      this.activeLinksList = null;
    }
    if (this.computePromise) {
      this.computePromise.cancel();
      this.computePromise = null;
    }
  }
  dispose() {
    super.dispose();
    this.stop();
  }
};
LinkDetector.ID = "editor.linkDetector";
LinkDetector = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ILanguageFeatureDebounceService)
], LinkDetector);
const decoration = {
  general: ModelDecorationOptions.register({
    description: "detected-link",
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    collapseOnReplaceEdit: true,
    inlineClassName: "detected-link"
  }),
  active: ModelDecorationOptions.register({
    description: "detected-link-active",
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    collapseOnReplaceEdit: true,
    inlineClassName: "detected-link-active"
  })
};
class LinkOccurrence {
  static decoration(link, useMetaKey) {
    return {
      range: link.range,
      options: LinkOccurrence._getOptions(link, useMetaKey, false)
    };
  }
  static _getOptions(link, useMetaKey, isActive) {
    const options = { ...isActive ? decoration.active : decoration.general };
    options.hoverMessage = getHoverMessage(link, useMetaKey);
    return options;
  }
  constructor(link, decorationId) {
    this.link = link;
    this.decorationId = decorationId;
  }
  activate(changeAccessor, useMetaKey) {
    changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, true));
  }
  deactivate(changeAccessor, useMetaKey) {
    changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, false));
  }
}
function getHoverMessage(link, useMetaKey) {
  const executeCmd = link.url && /^command:/i.test(link.url.toString());
  const label = link.tooltip ? link.tooltip : executeCmd ? nls.localize("links.navigate.executeCmd", "Execute command") : nls.localize("links.navigate.follow", "Follow link");
  const kb = useMetaKey ? platform.isMacintosh ? nls.localize("links.navigate.kb.meta.mac", "cmd + click") : nls.localize("links.navigate.kb.meta", "ctrl + click") : platform.isMacintosh ? nls.localize("links.navigate.kb.alt.mac", "option + click") : nls.localize("links.navigate.kb.alt", "alt + click");
  if (link.url) {
    let nativeLabel = "";
    if (/^command:/i.test(link.url.toString())) {
      const match = link.url.toString().match(/^command:([^?#]+)/);
      if (match) {
        const commandId = match[1];
        nativeLabel = nls.localize("tooltip.explanation", "Execute command {0}", commandId);
      }
    }
    const hoverMessage = new MarkdownString("", true).appendLink(link.url.toString(true).replace(/ /g, "%20"), label, nativeLabel).appendMarkdown(` (${kb})`);
    return hoverMessage;
  } else {
    return new MarkdownString().appendText(`${label} (${kb})`);
  }
}
class OpenLinkAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.openLink",
      label: nls.localize2("label", "Open Link"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    const linkDetector = LinkDetector.get(editor);
    if (!linkDetector) {
      return;
    }
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    for (const sel of selections) {
      const link = linkDetector.getLinkOccurrence(sel.getEndPosition());
      if (link) {
        linkDetector.openLinkOccurrence(link, false);
      }
    }
  }
}
registerEditorContribution(LinkDetector.ID, LinkDetector, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(OpenLinkAction);
export {
  LinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2xpbmtzL2Jyb3dzZXIvbGlua3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgQ2FuY2VsYWJsZVByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9saW5rcy5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMaW5rUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ2xpY2tMaW5rR2VzdHVyZSwgQ2xpY2tMaW5rS2V5Ym9hcmRFdmVudCwgQ2xpY2tMaW5rTW91c2VFdmVudCB9IGZyb20gJy4uLy4uL2dvdG9TeW1ib2wvYnJvd3Nlci9saW5rL2NsaWNrTGlua0dlc3R1cmUuanMnO1xuaW1wb3J0IHsgZ2V0TGlua3MsIExpbmssIExpbmtzTGlzdCB9IGZyb20gJy4vZ2V0TGlua3MuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTGlua0RldGVjdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICdlZGl0b3IubGlua0RldGVjdG9yJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogTGlua0RldGVjdG9yIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248TGlua0RldGVjdG9yPihMaW5rRGV0ZWN0b3IuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcnM6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PExpbmtQcm92aWRlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVib3VuY2VJbmZvcm1hdGlvbjogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXB1dGVMaW5rczogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBjb21wdXRlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8TGlua3NMaXN0PiB8IG51bGw7XG5cdHByaXZhdGUgYWN0aXZlTGlua3NMaXN0OiBMaW5rc0xpc3QgfCBudWxsO1xuXHRwcml2YXRlIGFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgY3VycmVudE9jY3VycmVuY2VzOiB7IFtkZWNvcmF0aW9uSWQ6IHN0cmluZ106IExpbmtPY2N1cnJlbmNlIH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucHJvdmlkZXJzID0gdGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rUHJvdmlkZXI7XG5cdFx0dGhpcy5kZWJvdW5jZUluZm9ybWF0aW9uID0gbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLmZvcih0aGlzLnByb3ZpZGVycywgJ0xpbmtzJywgeyBtaW46IDEwMDAsIG1heDogNDAwMCB9KTtcblx0XHR0aGlzLmNvbXB1dGVMaW5rcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuY29tcHV0ZUxpbmtzTm93KCksIDEwMDApKTtcblx0XHR0aGlzLmNvbXB1dGVQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLmFjdGl2ZUxpbmtzTGlzdCA9IG51bGw7XG5cdFx0dGhpcy5jdXJyZW50T2NjdXJyZW5jZXMgPSB7fTtcblx0XHR0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQgPSBudWxsO1xuXG5cdFx0Y29uc3QgY2xpY2tMaW5rR2VzdHVyZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDbGlja0xpbmtHZXN0dXJlKGVkaXRvcikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpY2tMaW5rR2VzdHVyZS5vbk1vdXNlTW92ZU9yUmVsZXZhbnRLZXlEb3duKChbbW91c2VFdmVudCwga2V5Ym9hcmRFdmVudF0pID0+IHtcblx0XHRcdHRoaXMuX29uRWRpdG9yTW91c2VNb3ZlKG1vdXNlRXZlbnQsIGtleWJvYXJkRXZlbnQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGlja0xpbmtHZXN0dXJlLm9uRXhlY3V0ZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5vbkVkaXRvck1vdXNlVXAoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWNrTGlua0dlc3R1cmUub25DYW5jZWwoKGUpID0+IHtcblx0XHRcdHRoaXMuY2xlYW5VcEFjdGl2ZUxpbmtEZWNvcmF0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmICghZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5rcykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVtb3ZlIGFueSBsaW5rcyAoZm9yIHRoZSBnZXR0aW5nIGRpc2FibGVkIGNhc2UpXG5cdFx0XHR0aGlzLnVwZGF0ZURlY29yYXRpb25zKFtdKTtcblxuXHRcdFx0Ly8gU3RvcCBhbnkgY29tcHV0YXRpb24gKGZvciB0aGUgZ2V0dGluZyBkaXNhYmxlZCBjYXNlKVxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cblx0XHRcdC8vIFN0YXJ0IGNvbXB1dGluZyAoZm9yIHRoZSBnZXR0aW5nIGVuYWJsZWQgY2FzZSlcblx0XHRcdHRoaXMuY29tcHV0ZUxpbmtzLnNjaGVkdWxlKDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbXB1dGVMaW5rcy5zY2hlZHVsZSh0aGlzLmRlYm91bmNlSW5mb3JtYXRpb24uZ2V0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHtcblx0XHRcdHRoaXMuY3VycmVudE9jY3VycmVuY2VzID0ge307XG5cdFx0XHR0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQgPSBudWxsO1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR0aGlzLmNvbXB1dGVMaW5rcy5zY2hlZHVsZSgwKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR0aGlzLmNvbXB1dGVMaW5rcy5zY2hlZHVsZSgwKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm92aWRlcnMub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0dGhpcy5jb21wdXRlTGlua3Muc2NoZWR1bGUoMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jb21wdXRlTGlua3Muc2NoZWR1bGUoMCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVMaW5rc05vdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGlua3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0aWYgKG1vZGVsLmlzVG9vTGFyZ2VGb3JTeW5jaW5nKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucHJvdmlkZXJzLmhhcyhtb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3RpdmVMaW5rc0xpc3QpIHtcblx0XHRcdHRoaXMuYWN0aXZlTGlua3NMaXN0LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuYWN0aXZlTGlua3NMaXN0ID0gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLmNvbXB1dGVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gZ2V0TGlua3ModGhpcy5wcm92aWRlcnMsIG1vZGVsLCB0b2tlbikpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goZmFsc2UpO1xuXHRcdFx0dGhpcy5hY3RpdmVMaW5rc0xpc3QgPSBhd2FpdCB0aGlzLmNvbXB1dGVQcm9taXNlO1xuXHRcdFx0dGhpcy5kZWJvdW5jZUluZm9ybWF0aW9uLnVwZGF0ZShtb2RlbCwgc3cuZWxhcHNlZCgpKTtcblx0XHRcdGlmIChtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVEZWNvcmF0aW9ucyh0aGlzLmFjdGl2ZUxpbmtzTGlzdC5saW5rcyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVQcm9taXNlID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURlY29yYXRpb25zKGxpbmtzOiBMaW5rW10pOiB2b2lkIHtcblx0XHRjb25zdCB1c2VNZXRhS2V5ID0gKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JNb2RpZmllcikgPT09ICdhbHRLZXknKTtcblx0XHRjb25zdCBvbGREZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5jdXJyZW50T2NjdXJyZW5jZXMpO1xuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbklkIG9mIGtleXMpIHtcblx0XHRcdGNvbnN0IG9jY3VyZW5jZSA9IHRoaXMuY3VycmVudE9jY3VycmVuY2VzW2RlY29yYXRpb25JZF07XG5cdFx0XHRvbGREZWNvcmF0aW9ucy5wdXNoKG9jY3VyZW5jZS5kZWNvcmF0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGlmIChsaW5rcykge1xuXHRcdFx0Ly8gTm90IHN1cmUgd2h5IHRoaXMgaXMgc29tZXRpbWVzIG51bGxcblx0XHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5wdXNoKExpbmtPY2N1cnJlbmNlLmRlY29yYXRpb24obGluaywgdXNlTWV0YUtleSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSBjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKG9sZERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucyk7XG5cblx0XHRcdHRoaXMuY3VycmVudE9jY3VycmVuY2VzID0ge307XG5cdFx0XHR0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQgPSBudWxsO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG9jY3VyZW5jZSA9IG5ldyBMaW5rT2NjdXJyZW5jZShsaW5rc1tpXSwgZGVjb3JhdGlvbnNbaV0pO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRPY2N1cnJlbmNlc1tvY2N1cmVuY2UuZGVjb3JhdGlvbklkXSA9IG9jY3VyZW5jZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uRWRpdG9yTW91c2VNb3ZlKG1vdXNlRXZlbnQ6IENsaWNrTGlua01vdXNlRXZlbnQsIHdpdGhLZXk6IENsaWNrTGlua0tleWJvYXJkRXZlbnQgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgdXNlTWV0YUtleSA9ICh0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm11bHRpQ3Vyc29yTW9kaWZpZXIpID09PSAnYWx0S2V5Jyk7XG5cdFx0aWYgKHRoaXMuaXNFbmFibGVkKG1vdXNlRXZlbnQsIHdpdGhLZXkpKSB7XG5cdFx0XHR0aGlzLmNsZWFuVXBBY3RpdmVMaW5rRGVjb3JhdGlvbigpOyAvLyBhbHdheXMgcmVtb3ZlIHByZXZpb3VzIGxpbmsgZGVjb3JhdGlvbiBhcyB0aGVpciBjYW4gb25seSBiZSBvbmVcblx0XHRcdGNvbnN0IG9jY3VycmVuY2UgPSB0aGlzLmdldExpbmtPY2N1cnJlbmNlKG1vdXNlRXZlbnQudGFyZ2V0LnBvc2l0aW9uKTtcblx0XHRcdGlmIChvY2N1cnJlbmNlKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdG9jY3VycmVuY2UuYWN0aXZhdGUoY2hhbmdlQWNjZXNzb3IsIHVzZU1ldGFLZXkpO1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlTGlua0RlY29yYXRpb25JZCA9IG9jY3VycmVuY2UuZGVjb3JhdGlvbklkO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jbGVhblVwQWN0aXZlTGlua0RlY29yYXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFuVXBBY3RpdmVMaW5rRGVjb3JhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB1c2VNZXRhS2V5ID0gKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JNb2RpZmllcikgPT09ICdhbHRLZXknKTtcblx0XHRpZiAodGhpcy5hY3RpdmVMaW5rRGVjb3JhdGlvbklkKSB7XG5cdFx0XHRjb25zdCBvY2N1cnJlbmNlID0gdGhpcy5jdXJyZW50T2NjdXJyZW5jZXNbdGhpcy5hY3RpdmVMaW5rRGVjb3JhdGlvbklkXTtcblx0XHRcdGlmIChvY2N1cnJlbmNlKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdG9jY3VycmVuY2UuZGVhY3RpdmF0ZShjaGFuZ2VBY2Nlc3NvciwgdXNlTWV0YUtleSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZVVwKG1vdXNlRXZlbnQ6IENsaWNrTGlua01vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKG1vdXNlRXZlbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9jY3VycmVuY2UgPSB0aGlzLmdldExpbmtPY2N1cnJlbmNlKG1vdXNlRXZlbnQudGFyZ2V0LnBvc2l0aW9uKTtcblx0XHRpZiAoIW9jY3VycmVuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5vcGVuTGlua09jY3VycmVuY2Uob2NjdXJyZW5jZSwgbW91c2VFdmVudC5oYXNTaWRlQnlTaWRlTW9kaWZpZXIsIHRydWUgLyogZnJvbSB1c2VyIGdlc3R1cmUgKi8pO1xuXHR9XG5cblx0cHVibGljIG9wZW5MaW5rT2NjdXJyZW5jZShvY2N1cnJlbmNlOiBMaW5rT2NjdXJyZW5jZSwgb3BlblRvU2lkZTogYm9vbGVhbiwgZnJvbVVzZXJHZXN0dXJlID0gZmFsc2UpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5vcGVuZXJTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBsaW5rIH0gPSBvY2N1cnJlbmNlO1xuXG5cdFx0bGluay5yZXNvbHZlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4odXJpID0+IHtcblxuXHRcdFx0Ly8gU3VwcG9ydCBmb3IgcmVsYXRpdmUgZmlsZSBVUklzIG9mIHRoZSBzaGFwZSBmaWxlOi8vLi9yZWxhdGl2ZUZpbGUudHh0IG9yIGZpbGU6Ly8vLi9yZWxhdGl2ZUZpbGUudHh0XG5cdFx0XHRpZiAodHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgJiYgdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRjb25zdCBtb2RlbFVyaSA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0XHRpZiAobW9kZWxVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgdXJpLnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy5maWxlfTpgKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZFVyaSA9IFVSSS5wYXJzZSh1cmkpO1xuXHRcdFx0XHRcdGlmIChwYXJzZWRVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZzUGF0aCA9IHJlc291cmNlcy5vcmlnaW5hbEZTUGF0aChwYXJzZWRVcmkpO1xuXG5cdFx0XHRcdFx0XHRsZXQgcmVsYXRpdmVQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdFx0XHRcdGlmIChmc1BhdGguc3RhcnRzV2l0aCgnLy4vJykgfHwgZnNQYXRoLnN0YXJ0c1dpdGgoJ1xcXFwuXFxcXCcpKSB7XG5cdFx0XHRcdFx0XHRcdHJlbGF0aXZlUGF0aCA9IGAuJHtmc1BhdGguc3Vic3RyKDEpfWA7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGZzUGF0aC5zdGFydHNXaXRoKCcvLy4vJykgfHwgZnNQYXRoLnN0YXJ0c1dpdGgoJ1xcXFxcXFxcLlxcXFwnKSkge1xuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZVBhdGggPSBgLiR7ZnNQYXRoLnN1YnN0cigyKX1gO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAocmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0XHRcdHVyaSA9IHJlc291cmNlcy5qb2luUGF0aChtb2RlbFVyaSwgcmVsYXRpdmVQYXRoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBvcGVuVG9TaWRlLCBmcm9tVXNlckdlc3R1cmUsIGFsbG93Q29udHJpYnV0ZWRPcGVuZXJzOiB0cnVlLCBhbGxvd0NvbW1hbmRzOiB0cnVlLCBmcm9tV29ya3NwYWNlOiB0cnVlIH0pO1xuXG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VPckVycm9yID1cblx0XHRcdFx0ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycjtcblx0XHRcdC8vIGRpZmZlcmVudCBlcnJvciBjYXNlc1xuXHRcdFx0aWYgKG1lc3NhZ2VPckVycm9yID09PSAnaW52YWxpZCcpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdpbnZhbGlkLnVybCcsICdGYWlsZWQgdG8gb3BlbiB0aGlzIGxpbmsgYmVjYXVzZSBpdCBpcyBub3Qgd2VsbC1mb3JtZWQ6IHswfScsIGxpbmsudXJsIS50b1N0cmluZygpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKG1lc3NhZ2VPckVycm9yID09PSAnbWlzc2luZycpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdtaXNzaW5nLnVybCcsICdGYWlsZWQgdG8gb3BlbiB0aGlzIGxpbmsgYmVjYXVzZSBpdHMgdGFyZ2V0IGlzIG1pc3NpbmcuJykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5rT2NjdXJyZW5jZShwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsKTogTGlua09jY3VycmVuY2UgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkgfHwgIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpLmdldERlY29yYXRpb25zSW5SYW5nZSh7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRzdGFydENvbHVtbjogcG9zaXRpb24uY29sdW1uLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdGVuZENvbHVtbjogcG9zaXRpb24uY29sdW1uXG5cdFx0fSwgMCwgdHJ1ZSk7XG5cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRPY2N1cnJlbmNlID0gdGhpcy5jdXJyZW50T2NjdXJyZW5jZXNbZGVjb3JhdGlvbi5pZF07XG5cdFx0XHRpZiAoY3VycmVudE9jY3VycmVuY2UpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRPY2N1cnJlbmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0VuYWJsZWQobW91c2VFdmVudDogQ2xpY2tMaW5rTW91c2VFdmVudCwgd2l0aEtleT86IENsaWNrTGlua0tleWJvYXJkRXZlbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEJvb2xlYW4oXG5cdFx0XHQobW91c2VFdmVudC50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVClcblx0XHRcdCYmICgobW91c2VFdmVudC5oYXNUcmlnZ2VyTW9kaWZpZXIgfHwgKHdpdGhLZXkgJiYgd2l0aEtleS5rZXlDb2RlSXNUcmlnZ2VyS2V5KSkgfHwgbW91c2VFdmVudC5pc01pZGRsZUNsaWNrICYmIG1vdXNlRXZlbnQubW91c2VNaWRkbGVDbGlja0FjdGlvbiA9PT0gJ29wZW5MaW5rJylcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuY29tcHV0ZUxpbmtzLmNhbmNlbCgpO1xuXHRcdGlmICh0aGlzLmFjdGl2ZUxpbmtzTGlzdCkge1xuXHRcdFx0dGhpcy5hY3RpdmVMaW5rc0xpc3Q/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuYWN0aXZlTGlua3NMaXN0ID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29tcHV0ZVByb21pc2UpIHtcblx0XHRcdHRoaXMuY29tcHV0ZVByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLmNvbXB1dGVQcm9taXNlID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zdG9wKCk7XG5cdH1cbn1cblxuY29uc3QgZGVjb3JhdGlvbiA9IHtcblx0Z2VuZXJhbDogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdkZXRlY3RlZC1saW5rJyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRjb2xsYXBzZU9uUmVwbGFjZUVkaXQ6IHRydWUsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiAnZGV0ZWN0ZWQtbGluaydcblx0fSksXG5cdGFjdGl2ZTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdkZXRlY3RlZC1saW5rLWFjdGl2ZScsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0Y29sbGFwc2VPblJlcGxhY2VFZGl0OiB0cnVlLFxuXHRcdGlubGluZUNsYXNzTmFtZTogJ2RldGVjdGVkLWxpbmstYWN0aXZlJ1xuXHR9KVxufTtcblxuY2xhc3MgTGlua09jY3VycmVuY2Uge1xuXG5cdHB1YmxpYyBzdGF0aWMgZGVjb3JhdGlvbihsaW5rOiBMaW5rLCB1c2VNZXRhS2V5OiBib29sZWFuKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IGxpbmsucmFuZ2UsXG5cdFx0XHRvcHRpb25zOiBMaW5rT2NjdXJyZW5jZS5fZ2V0T3B0aW9ucyhsaW5rLCB1c2VNZXRhS2V5LCBmYWxzZSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldE9wdGlvbnMobGluazogTGluaywgdXNlTWV0YUtleTogYm9vbGVhbiwgaXNBY3RpdmU6IGJvb2xlYW4pOiBNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBvcHRpb25zID0geyAuLi4gKGlzQWN0aXZlID8gZGVjb3JhdGlvbi5hY3RpdmUgOiBkZWNvcmF0aW9uLmdlbmVyYWwpIH07XG5cdFx0b3B0aW9ucy5ob3Zlck1lc3NhZ2UgPSBnZXRIb3Zlck1lc3NhZ2UobGluaywgdXNlTWV0YUtleSk7XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZGVjb3JhdGlvbklkOiBzdHJpbmc7XG5cdHB1YmxpYyBsaW5rOiBMaW5rO1xuXG5cdGNvbnN0cnVjdG9yKGxpbms6IExpbmssIGRlY29yYXRpb25JZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5saW5rID0gbGluaztcblx0XHR0aGlzLmRlY29yYXRpb25JZCA9IGRlY29yYXRpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBhY3RpdmF0ZShjaGFuZ2VBY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgdXNlTWV0YUtleTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNoYW5nZUFjY2Vzc29yLmNoYW5nZURlY29yYXRpb25PcHRpb25zKHRoaXMuZGVjb3JhdGlvbklkLCBMaW5rT2NjdXJyZW5jZS5fZ2V0T3B0aW9ucyh0aGlzLmxpbmssIHVzZU1ldGFLZXksIHRydWUpKTtcblx0fVxuXG5cdHB1YmxpYyBkZWFjdGl2YXRlKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCB1c2VNZXRhS2V5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y2hhbmdlQWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnModGhpcy5kZWNvcmF0aW9uSWQsIExpbmtPY2N1cnJlbmNlLl9nZXRPcHRpb25zKHRoaXMubGluaywgdXNlTWV0YUtleSwgZmFsc2UpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRIb3Zlck1lc3NhZ2UobGluazogTGluaywgdXNlTWV0YUtleTogYm9vbGVhbik6IE1hcmtkb3duU3RyaW5nIHtcblx0Y29uc3QgZXhlY3V0ZUNtZCA9IGxpbmsudXJsICYmIC9eY29tbWFuZDovaS50ZXN0KGxpbmsudXJsLnRvU3RyaW5nKCkpO1xuXG5cdGNvbnN0IGxhYmVsID0gbGluay50b29sdGlwXG5cdFx0PyBsaW5rLnRvb2x0aXBcblx0XHQ6IGV4ZWN1dGVDbWRcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdsaW5rcy5uYXZpZ2F0ZS5leGVjdXRlQ21kJywgJ0V4ZWN1dGUgY29tbWFuZCcpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbGlua3MubmF2aWdhdGUuZm9sbG93JywgJ0ZvbGxvdyBsaW5rJyk7XG5cblx0Y29uc3Qga2IgPSB1c2VNZXRhS2V5XG5cdFx0PyBwbGF0Zm9ybS5pc01hY2ludG9zaFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2xpbmtzLm5hdmlnYXRlLmtiLm1ldGEubWFjJywgXCJjbWQgKyBjbGlja1wiKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2xpbmtzLm5hdmlnYXRlLmtiLm1ldGEnLCBcImN0cmwgKyBjbGlja1wiKVxuXHRcdDogcGxhdGZvcm0uaXNNYWNpbnRvc2hcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdsaW5rcy5uYXZpZ2F0ZS5rYi5hbHQubWFjJywgXCJvcHRpb24gKyBjbGlja1wiKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2xpbmtzLm5hdmlnYXRlLmtiLmFsdCcsIFwiYWx0ICsgY2xpY2tcIik7XG5cblx0aWYgKGxpbmsudXJsKSB7XG5cdFx0bGV0IG5hdGl2ZUxhYmVsID0gJyc7XG5cdFx0aWYgKC9eY29tbWFuZDovaS50ZXN0KGxpbmsudXJsLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHQvLyBEb24ndCBzaG93IGNvbXBsZXRlIGNvbW1hbmQgYXJndW1lbnRzIGluIHRoZSBuYXRpdmUgdG9vbHRpcFxuXHRcdFx0Y29uc3QgbWF0Y2ggPSBsaW5rLnVybC50b1N0cmluZygpLm1hdGNoKC9eY29tbWFuZDooW14/I10rKS8pO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IG1hdGNoWzFdO1xuXHRcdFx0XHRuYXRpdmVMYWJlbCA9IG5scy5sb2NhbGl6ZSgndG9vbHRpcC5leHBsYW5hdGlvbicsIFwiRXhlY3V0ZSBjb21tYW5kIHswfVwiLCBjb21tYW5kSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBob3Zlck1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHRydWUpXG5cdFx0XHQuYXBwZW5kTGluayhsaW5rLnVybC50b1N0cmluZyh0cnVlKS5yZXBsYWNlKC8gL2csICclMjAnKSwgbGFiZWwsIG5hdGl2ZUxhYmVsKVxuXHRcdFx0LmFwcGVuZE1hcmtkb3duKGAgKCR7a2J9KWApO1xuXHRcdHJldHVybiBob3Zlck1lc3NhZ2U7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoYCR7bGFiZWx9ICgke2tifSlgKTtcblx0fVxufVxuXG5jbGFzcyBPcGVuTGlua0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLm9wZW5MaW5rJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdsYWJlbCcsIFwiT3BlbiBMaW5rXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5rRGV0ZWN0b3IgPSBMaW5rRGV0ZWN0b3IuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFsaW5rRGV0ZWN0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGZvciAoY29uc3Qgc2VsIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGxpbmsgPSBsaW5rRGV0ZWN0b3IuZ2V0TGlua09jY3VycmVuY2Uoc2VsLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdFx0aWYgKGxpbmspIHtcblx0XHRcdFx0bGlua0RldGVjdG9yLm9wZW5MaW5rT2NjdXJyZW5jZShsaW5rLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKExpbmtEZXRlY3Rvci5JRCwgTGlua0RldGVjdG9yLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oT3BlbkxpbmtBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUE0Qyx3QkFBd0I7QUFDN0UsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFlBQVksY0FBYztBQUMxQixZQUFZLGVBQWU7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLE9BQU87QUFDUCxTQUFzQix1QkFBdUI7QUFDN0MsU0FBUyxjQUFjLGlDQUFpQyxzQkFBc0Isa0NBQW9EO0FBQ2xJLFNBQVMsb0JBQW9CO0FBSzdCLFNBQWlFLDhCQUE4QjtBQUMvRixTQUFTLDhCQUE4QjtBQUN2QyxTQUFzQyx1Q0FBdUM7QUFDN0UsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBcUU7QUFDOUUsU0FBUyxnQkFBaUM7QUFDMUMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBRXhCLElBQU0sZUFBTixjQUEyQixXQUEwQztBQUFBLEVBZ0IzRSxZQUNrQixRQUNnQixlQUNNLHFCQUNJLHlCQUNWLGdDQUNoQztBQUNELFVBQU07QUFOVztBQUNnQjtBQUNNO0FBQ0k7QUFLM0MsU0FBSyxZQUFZLEtBQUssd0JBQXdCO0FBQzlDLFNBQUssc0JBQXNCLCtCQUErQixJQUFJLEtBQUssV0FBVyxTQUFTLEVBQUUsS0FBSyxLQUFNLEtBQUssSUFBSyxDQUFDO0FBQy9HLFNBQUssZUFBZSxLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLGdCQUFnQixHQUFHLEdBQUksQ0FBQztBQUMzRixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLHFCQUFxQixDQUFDO0FBQzNCLFNBQUsseUJBQXlCO0FBRTlCLFVBQU0sbUJBQW1CLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLENBQUM7QUFFcEUsU0FBSyxVQUFVLGlCQUFpQiw2QkFBNkIsQ0FBQyxDQUFDLFlBQVksYUFBYSxNQUFNO0FBQzdGLFdBQUssbUJBQW1CLFlBQVksYUFBYTtBQUFBLElBQ2xELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxpQkFBaUIsVUFBVSxDQUFDLE1BQU07QUFDaEQsV0FBSyxnQkFBZ0IsQ0FBQztBQUFBLElBQ3ZCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxpQkFBaUIsU0FBUyxDQUFDLE1BQU07QUFDL0MsV0FBSyw0QkFBNEI7QUFBQSxJQUNsQyxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsT0FBTyx5QkFBeUIsQ0FBQyxNQUFNO0FBQ3JELFVBQUksQ0FBQyxFQUFFLFdBQVcsYUFBYSxLQUFLLEdBQUc7QUFDdEM7QUFBQSxNQUNEO0FBRUEsV0FBSyxrQkFBa0IsQ0FBQyxDQUFDO0FBR3pCLFdBQUssS0FBSztBQUdWLFdBQUssYUFBYSxTQUFTLENBQUM7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsT0FBTyx3QkFBd0IsQ0FBQyxNQUFNO0FBQ3BELFVBQUksQ0FBQyxLQUFLLE9BQU8sU0FBUyxHQUFHO0FBQzVCO0FBQUEsTUFDRDtBQUNBLFdBQUssYUFBYSxTQUFTLEtBQUssb0JBQW9CLElBQUksS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDaEYsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE9BQU8saUJBQWlCLENBQUMsTUFBTTtBQUM3QyxXQUFLLHFCQUFxQixDQUFDO0FBQzNCLFdBQUsseUJBQXlCO0FBQzlCLFdBQUssS0FBSztBQUNWLFdBQUssYUFBYSxTQUFTLENBQUM7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsT0FBTyx5QkFBeUIsQ0FBQyxNQUFNO0FBQ3JELFdBQUssS0FBSztBQUNWLFdBQUssYUFBYSxTQUFTLENBQUM7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxVQUFVLFlBQVksQ0FBQyxNQUFNO0FBQ2hELFdBQUssS0FBSztBQUNWLFdBQUssYUFBYSxTQUFTLENBQUM7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsU0FBUyxDQUFDO0FBQUEsRUFDN0I7QUFBQSxFQTNFQSxPQUFjLElBQUksUUFBMEM7QUFDM0QsV0FBTyxPQUFPLGdCQUE4QixhQUFhLEVBQUU7QUFBQSxFQUM1RDtBQUFBLEVBMkVBLE1BQWMsa0JBQWlDO0FBQzlDLFFBQUksQ0FBQyxLQUFLLE9BQU8sU0FBUyxLQUFLLENBQUMsS0FBSyxPQUFPLFVBQVUsYUFBYSxLQUFLLEdBQUc7QUFDMUU7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssT0FBTyxTQUFTO0FBRW5DLFFBQUksTUFBTSxxQkFBcUIsR0FBRztBQUNqQztBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxVQUFVLElBQUksS0FBSyxHQUFHO0FBQy9CO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxpQkFBaUI7QUFDekIsV0FBSyxnQkFBZ0IsUUFBUTtBQUM3QixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCO0FBRUEsU0FBSyxpQkFBaUIsd0JBQXdCLFdBQVMsU0FBUyxLQUFLLFdBQVcsT0FBTyxLQUFLLENBQUM7QUFDN0YsUUFBSTtBQUNILFlBQU0sS0FBSyxJQUFJLFVBQVUsS0FBSztBQUM5QixXQUFLLGtCQUFrQixNQUFNLEtBQUs7QUFDbEMsV0FBSyxvQkFBb0IsT0FBTyxPQUFPLEdBQUcsUUFBUSxDQUFDO0FBQ25ELFVBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxrQkFBa0IsS0FBSyxnQkFBZ0IsS0FBSztBQUFBLElBQ2xELFNBQVMsS0FBSztBQUNiLHdCQUFrQixHQUFHO0FBQUEsSUFDdEIsVUFBRTtBQUNELFdBQUssaUJBQWlCO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsT0FBcUI7QUFDOUMsVUFBTSxhQUFjLEtBQUssT0FBTyxVQUFVLGFBQWEsbUJBQW1CLE1BQU07QUFDaEYsVUFBTSxpQkFBMkIsQ0FBQztBQUNsQyxVQUFNLE9BQU8sT0FBTyxLQUFLLEtBQUssa0JBQWtCO0FBQ2hELGVBQVcsZ0JBQWdCLE1BQU07QUFDaEMsWUFBTSxZQUFZLEtBQUssbUJBQW1CLFlBQVk7QUFDdEQscUJBQWUsS0FBSyxVQUFVLFlBQVk7QUFBQSxJQUMzQztBQUVBLFVBQU0saUJBQTBDLENBQUM7QUFDakQsUUFBSSxPQUFPO0FBRVYsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCLHVCQUFlLEtBQUssZUFBZSxXQUFXLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBRUEsU0FBSyxPQUFPLGtCQUFrQixDQUFDLG1CQUFtQjtBQUNqRCxZQUFNLGNBQWMsZUFBZSxpQkFBaUIsZ0JBQWdCLGNBQWM7QUFFbEYsV0FBSyxxQkFBcUIsQ0FBQztBQUMzQixXQUFLLHlCQUF5QjtBQUM5QixlQUFTLElBQUksR0FBRyxNQUFNLFlBQVksUUFBUSxJQUFJLEtBQUssS0FBSztBQUN2RCxjQUFNLFlBQVksSUFBSSxlQUFlLE1BQU0sQ0FBQyxHQUFHLFlBQVksQ0FBQyxDQUFDO0FBQzdELGFBQUssbUJBQW1CLFVBQVUsWUFBWSxJQUFJO0FBQUEsTUFDbkQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxtQkFBbUIsWUFBaUMsU0FBOEM7QUFDekcsVUFBTSxhQUFjLEtBQUssT0FBTyxVQUFVLGFBQWEsbUJBQW1CLE1BQU07QUFDaEYsUUFBSSxLQUFLLFVBQVUsWUFBWSxPQUFPLEdBQUc7QUFDeEMsV0FBSyw0QkFBNEI7QUFDakMsWUFBTSxhQUFhLEtBQUssa0JBQWtCLFdBQVcsT0FBTyxRQUFRO0FBQ3BFLFVBQUksWUFBWTtBQUNmLGFBQUssT0FBTyxrQkFBa0IsQ0FBQyxtQkFBbUI7QUFDakQscUJBQVcsU0FBUyxnQkFBZ0IsVUFBVTtBQUM5QyxlQUFLLHlCQUF5QixXQUFXO0FBQUEsUUFDMUMsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLDRCQUE0QjtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFVBQU0sYUFBYyxLQUFLLE9BQU8sVUFBVSxhQUFhLG1CQUFtQixNQUFNO0FBQ2hGLFFBQUksS0FBSyx3QkFBd0I7QUFDaEMsWUFBTSxhQUFhLEtBQUssbUJBQW1CLEtBQUssc0JBQXNCO0FBQ3RFLFVBQUksWUFBWTtBQUNmLGFBQUssT0FBTyxrQkFBa0IsQ0FBQyxtQkFBbUI7QUFDakQscUJBQVcsV0FBVyxnQkFBZ0IsVUFBVTtBQUFBLFFBQ2pELENBQUM7QUFBQSxNQUNGO0FBRUEsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixZQUF1QztBQUM5RCxRQUFJLENBQUMsS0FBSyxVQUFVLFVBQVUsR0FBRztBQUNoQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGFBQWEsS0FBSyxrQkFBa0IsV0FBVyxPQUFPLFFBQVE7QUFDcEUsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBQ0EsU0FBSztBQUFBLE1BQW1CO0FBQUEsTUFBWSxXQUFXO0FBQUEsTUFBdUI7QUFBQTtBQUFBLElBQTRCO0FBQUEsRUFDbkc7QUFBQSxFQUVPLG1CQUFtQixZQUE0QixZQUFxQixrQkFBa0IsT0FBYTtBQUV6RyxRQUFJLENBQUMsS0FBSyxlQUFlO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxLQUFLLElBQUk7QUFFakIsU0FBSyxRQUFRLGtCQUFrQixJQUFJLEVBQUUsS0FBSyxTQUFPO0FBR2hELFVBQUksT0FBTyxRQUFRLFlBQVksS0FBSyxPQUFPLFNBQVMsR0FBRztBQUN0RCxjQUFNLFdBQVcsS0FBSyxPQUFPLFNBQVMsRUFBRTtBQUN4QyxZQUFJLFNBQVMsV0FBVyxRQUFRLFFBQVEsSUFBSSxXQUFXLEdBQUcsUUFBUSxJQUFJLEdBQUcsR0FBRztBQUMzRSxnQkFBTSxZQUFZLElBQUksTUFBTSxHQUFHO0FBQy9CLGNBQUksVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUN0QyxrQkFBTSxTQUFTLFVBQVUsZUFBZSxTQUFTO0FBRWpELGdCQUFJLGVBQThCO0FBQ2xDLGdCQUFJLE9BQU8sV0FBVyxLQUFLLEtBQUssT0FBTyxXQUFXLE9BQU8sR0FBRztBQUMzRCw2QkFBZSxJQUFJLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFBQSxZQUNwQyxXQUFXLE9BQU8sV0FBVyxNQUFNLEtBQUssT0FBTyxXQUFXLFNBQVMsR0FBRztBQUNyRSw2QkFBZSxJQUFJLE9BQU8sT0FBTyxDQUFDLENBQUM7QUFBQSxZQUNwQztBQUVBLGdCQUFJLGNBQWM7QUFDakIsb0JBQU0sVUFBVSxTQUFTLFVBQVUsWUFBWTtBQUFBLFlBQ2hEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsYUFBTyxLQUFLLGNBQWMsS0FBSyxLQUFLLEVBQUUsWUFBWSxpQkFBaUIseUJBQXlCLE1BQU0sZUFBZSxNQUFNLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFFN0ksR0FBRyxTQUFPO0FBQ1QsWUFBTSxpQkFDTCxlQUFlLFFBQVEsSUFBSSxVQUFVO0FBRXRDLFVBQUksbUJBQW1CLFdBQVc7QUFDakMsYUFBSyxvQkFBb0IsS0FBSyxJQUFJLFNBQVMsZUFBZSwrREFBK0QsS0FBSyxJQUFLLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDL0ksV0FBVyxtQkFBbUIsV0FBVztBQUN4QyxhQUFLLG9CQUFvQixLQUFLLElBQUksU0FBUyxlQUFlLHlEQUF5RCxDQUFDO0FBQUEsTUFDckgsT0FBTztBQUNOLDBCQUFrQixHQUFHO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxrQkFBa0IsVUFBa0Q7QUFDMUUsUUFBSSxDQUFDLEtBQUssT0FBTyxTQUFTLEtBQUssQ0FBQyxVQUFVO0FBQ3pDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxjQUFjLEtBQUssT0FBTyxTQUFTLEVBQUUsc0JBQXNCO0FBQUEsTUFDaEUsaUJBQWlCLFNBQVM7QUFBQSxNQUMxQixhQUFhLFNBQVM7QUFBQSxNQUN0QixlQUFlLFNBQVM7QUFBQSxNQUN4QixXQUFXLFNBQVM7QUFBQSxJQUNyQixHQUFHLEdBQUcsSUFBSTtBQUVWLGVBQVdBLGVBQWMsYUFBYTtBQUNyQyxZQUFNLG9CQUFvQixLQUFLLG1CQUFtQkEsWUFBVyxFQUFFO0FBQy9ELFVBQUksbUJBQW1CO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxVQUFVLFlBQWlDLFNBQWtEO0FBQ3BHLFdBQU87QUFBQSxNQUNMLFdBQVcsT0FBTyxTQUFTLGdCQUFnQixpQkFDdkMsV0FBVyxzQkFBdUIsV0FBVyxRQUFRLHVCQUF5QixXQUFXLGlCQUFpQixXQUFXLDJCQUEyQjtBQUFBLElBQ3RKO0FBQUEsRUFDRDtBQUFBLEVBRVEsT0FBYTtBQUNwQixTQUFLLGFBQWEsT0FBTztBQUN6QixRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFdBQUssaUJBQWlCLFFBQVE7QUFDOUIsV0FBSyxrQkFBa0I7QUFBQSxJQUN4QjtBQUNBLFFBQUksS0FBSyxnQkFBZ0I7QUFDeEIsV0FBSyxlQUFlLE9BQU87QUFDM0IsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixVQUFNLFFBQVE7QUFDZCxTQUFLLEtBQUs7QUFBQSxFQUNYO0FBQ0Q7QUF2UmEsYUFFVyxLQUFhO0FBRnhCLGVBQU47QUFBQSxFQWtCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckJVO0FBeVJiLE1BQU0sYUFBYTtBQUFBLEVBQ2xCLFNBQVMsdUJBQXVCLFNBQVM7QUFBQSxJQUN4QyxhQUFhO0FBQUEsSUFDYixZQUFZLHVCQUF1QjtBQUFBLElBQ25DLHVCQUF1QjtBQUFBLElBQ3ZCLGlCQUFpQjtBQUFBLEVBQ2xCLENBQUM7QUFBQSxFQUNELFFBQVEsdUJBQXVCLFNBQVM7QUFBQSxJQUN2QyxhQUFhO0FBQUEsSUFDYixZQUFZLHVCQUF1QjtBQUFBLElBQ25DLHVCQUF1QjtBQUFBLElBQ3ZCLGlCQUFpQjtBQUFBLEVBQ2xCLENBQUM7QUFDRjtBQUVBLE1BQU0sZUFBZTtBQUFBLEVBRXBCLE9BQWMsV0FBVyxNQUFZLFlBQTRDO0FBQ2hGLFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osU0FBUyxlQUFlLFlBQVksTUFBTSxZQUFZLEtBQUs7QUFBQSxJQUM1RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWUsWUFBWSxNQUFZLFlBQXFCLFVBQTJDO0FBQ3RHLFVBQU0sVUFBVSxFQUFFLEdBQUssV0FBVyxXQUFXLFNBQVMsV0FBVyxRQUFTO0FBQzFFLFlBQVEsZUFBZSxnQkFBZ0IsTUFBTSxVQUFVO0FBQ3ZELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFLQSxZQUFZLE1BQVksY0FBc0I7QUFDN0MsU0FBSyxPQUFPO0FBQ1osU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVPLFNBQVMsZ0JBQWlELFlBQTJCO0FBQzNGLG1CQUFlLHdCQUF3QixLQUFLLGNBQWMsZUFBZSxZQUFZLEtBQUssTUFBTSxZQUFZLElBQUksQ0FBQztBQUFBLEVBQ2xIO0FBQUEsRUFFTyxXQUFXLGdCQUFpRCxZQUEyQjtBQUM3RixtQkFBZSx3QkFBd0IsS0FBSyxjQUFjLGVBQWUsWUFBWSxLQUFLLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFBQSxFQUNuSDtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsTUFBWSxZQUFxQztBQUN6RSxRQUFNLGFBQWEsS0FBSyxPQUFPLGFBQWEsS0FBSyxLQUFLLElBQUksU0FBUyxDQUFDO0FBRXBFLFFBQU0sUUFBUSxLQUFLLFVBQ2hCLEtBQUssVUFDTCxhQUNDLElBQUksU0FBUyw2QkFBNkIsaUJBQWlCLElBQzNELElBQUksU0FBUyx5QkFBeUIsYUFBYTtBQUV2RCxRQUFNLEtBQUssYUFDUixTQUFTLGNBQ1IsSUFBSSxTQUFTLDhCQUE4QixhQUFhLElBQ3hELElBQUksU0FBUywwQkFBMEIsY0FBYyxJQUN0RCxTQUFTLGNBQ1IsSUFBSSxTQUFTLDZCQUE2QixnQkFBZ0IsSUFDMUQsSUFBSSxTQUFTLHlCQUF5QixhQUFhO0FBRXZELE1BQUksS0FBSyxLQUFLO0FBQ2IsUUFBSSxjQUFjO0FBQ2xCLFFBQUksYUFBYSxLQUFLLEtBQUssSUFBSSxTQUFTLENBQUMsR0FBRztBQUUzQyxZQUFNLFFBQVEsS0FBSyxJQUFJLFNBQVMsRUFBRSxNQUFNLG1CQUFtQjtBQUMzRCxVQUFJLE9BQU87QUFDVixjQUFNLFlBQVksTUFBTSxDQUFDO0FBQ3pCLHNCQUFjLElBQUksU0FBUyx1QkFBdUIsdUJBQXVCLFNBQVM7QUFBQSxNQUNuRjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGVBQWUsSUFBSSxlQUFlLElBQUksSUFBSSxFQUM5QyxXQUFXLEtBQUssSUFBSSxTQUFTLElBQUksRUFBRSxRQUFRLE1BQU0sS0FBSyxHQUFHLE9BQU8sV0FBVyxFQUMzRSxlQUFlLEtBQUssRUFBRSxHQUFHO0FBQzNCLFdBQU87QUFBQSxFQUNSLE9BQU87QUFDTixXQUFPLElBQUksZUFBZSxFQUFFLFdBQVcsR0FBRyxLQUFLLEtBQUssRUFBRSxHQUFHO0FBQUEsRUFDMUQ7QUFDRDtBQUVBLE1BQU0sdUJBQXVCLGFBQWE7QUFBQSxFQUV6QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsU0FBUyxXQUFXO0FBQUEsTUFDekMsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBMkI7QUFDakUsVUFBTSxlQUFlLGFBQWEsSUFBSSxNQUFNO0FBQzVDLFFBQUksQ0FBQyxjQUFjO0FBQ2xCO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsT0FBTyxjQUFjO0FBQ3hDLGVBQVcsT0FBTyxZQUFZO0FBQzdCLFlBQU0sT0FBTyxhQUFhLGtCQUFrQixJQUFJLGVBQWUsQ0FBQztBQUNoRSxVQUFJLE1BQU07QUFDVCxxQkFBYSxtQkFBbUIsTUFBTSxLQUFLO0FBQUEsTUFDNUM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsMkJBQTJCLGFBQWEsSUFBSSxjQUFjLGdDQUFnQyxnQkFBZ0I7QUFDMUcscUJBQXFCLGNBQWM7IiwKICAibmFtZXMiOiBbImRlY29yYXRpb24iXQp9Cg==
