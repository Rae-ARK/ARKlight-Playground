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
import * as dom from "../../../../base/browser/dom.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { createCancelablePromise, disposableTimeout } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/resources.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { IMarkerDecorationsService } from "../../../common/services/markerDecorations.js";
import { ApplyCodeActionReason, getCodeActions, quickFixCommandId } from "../../codeAction/browser/codeAction.js";
import { CodeActionController } from "../../codeAction/browser/codeActionController.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../codeAction/common/types.js";
import { MarkerController, NextMarkerAction } from "../../gotoError/browser/gotoError.js";
import { HoverAnchorType, RenderedHoverParts } from "./hoverTypes.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMarkerData, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
const $ = dom.$;
class MarkerHover {
  constructor(owner, range, marker) {
    this.owner = owner;
    this.range = range;
    this.marker = marker;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
const markerCodeActionTrigger = {
  type: CodeActionTriggerType.Invoke,
  filter: { include: CodeActionKind.QuickFix },
  triggerAction: CodeActionTriggerSource.QuickFixHover
};
let MarkerHoverParticipant = class {
  constructor(_editor, _markerDecorationsService, _openerService, _languageFeaturesService, _menuService, _contextKeyService) {
    this._editor = _editor;
    this._markerDecorationsService = _markerDecorationsService;
    this._openerService = _openerService;
    this._languageFeaturesService = _languageFeaturesService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this.hoverOrdinal = 1;
    this.recentMarkerCodeActionsInfo = void 0;
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
      return [];
    }
    const model = this._editor.getModel();
    const anchorRange = anchor.range;
    if (!model.isValidRange(anchor.range)) {
      return [];
    }
    const lineNumber = anchorRange.startLineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const result = [];
    for (const d of lineDecorations) {
      const startColumn = d.range.startLineNumber === lineNumber ? d.range.startColumn : 1;
      const endColumn = d.range.endLineNumber === lineNumber ? d.range.endColumn : maxColumn;
      const marker = this._markerDecorationsService.getMarker(model.uri, d);
      if (!marker) {
        continue;
      }
      const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
      result.push(new MarkerHover(this, range, marker));
    }
    return result;
  }
  renderHoverParts(context, hoverParts) {
    if (!hoverParts.length) {
      return new RenderedHoverParts([]);
    }
    const renderedHoverParts = [];
    hoverParts.forEach((hoverPart) => {
      const renderedMarkerHover = this._renderMarkerHover(hoverPart);
      context.fragment.appendChild(renderedMarkerHover.hoverElement);
      renderedHoverParts.push(renderedMarkerHover);
    });
    const markerHoverForStatusbar = hoverParts.length === 1 ? hoverParts[0] : hoverParts.sort((a, b) => MarkerSeverity.compare(a.marker.severity, b.marker.severity))[0];
    const disposables = this._renderMarkerStatusbar(context, markerHoverForStatusbar);
    return new RenderedHoverParts(renderedHoverParts, disposables);
  }
  getAccessibleContent(hoverPart) {
    const { marker } = hoverPart;
    const relatedInformation = isNonEmptyArray(marker.relatedInformation) ? marker.relatedInformation.map((related) => `${basename(related.resource)}(${related.startLineNumber}, ${related.startColumn}): ${related.message}`).join("\n") : void 0;
    return [marker.message, relatedInformation].filter((value) => !!value).join("\n");
  }
  _renderMarkerHover(markerHover) {
    const disposables = new DisposableStore();
    const hoverElement = $("div.hover-row");
    const markerElement = dom.append(hoverElement, $("div.marker.hover-contents"));
    const { source, message, code, relatedInformation } = markerHover.marker;
    this._editor.applyFontInfo(markerElement);
    const messageElement = dom.append(markerElement, $("span"));
    messageElement.style.whiteSpace = "pre-wrap";
    messageElement.innerText = message;
    if (source || code) {
      if (code && typeof code !== "string") {
        const sourceAndCodeElement = $("span");
        if (source) {
          const sourceElement = dom.append(sourceAndCodeElement, $("span"));
          sourceElement.innerText = source;
        }
        const codeLink = dom.append(sourceAndCodeElement, $("a.code-link"));
        codeLink.setAttribute("href", code.target.toString(true));
        disposables.add(dom.addDisposableListener(codeLink, "click", (e) => {
          this._openerService.open(code.target, { allowCommands: true });
          e.preventDefault();
          e.stopPropagation();
        }));
        const codeElement = dom.append(codeLink, $("span"));
        codeElement.innerText = code.value;
        const detailsElement = dom.append(markerElement, sourceAndCodeElement);
        detailsElement.style.opacity = "0.6";
        detailsElement.style.paddingLeft = "6px";
      } else {
        const detailsElement = dom.append(markerElement, $("span"));
        detailsElement.style.opacity = "0.6";
        detailsElement.style.paddingLeft = "6px";
        detailsElement.innerText = source && code ? `${source}(${code})` : source ? source : `(${code})`;
      }
    }
    if (isNonEmptyArray(relatedInformation)) {
      for (const { message: message2, resource, startLineNumber, startColumn } of relatedInformation) {
        const relatedInfoContainer = dom.append(markerElement, $("div"));
        relatedInfoContainer.style.marginTop = "8px";
        const a = dom.append(relatedInfoContainer, $("a"));
        a.innerText = `${basename(resource)}(${startLineNumber}, ${startColumn}): `;
        a.style.cursor = "pointer";
        disposables.add(dom.addDisposableListener(a, "click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (this._openerService) {
            const editorOptions = { selection: { startLineNumber, startColumn } };
            this._openerService.open(resource, {
              fromUserGesture: true,
              editorOptions
            }).catch(onUnexpectedError);
          }
        }));
        const messageElement2 = dom.append(relatedInfoContainer, $("span"));
        messageElement2.innerText = message2;
        this._editor.applyFontInfo(messageElement2);
      }
    }
    const renderedHoverPart = {
      hoverPart: markerHover,
      hoverElement,
      dispose: () => disposables.dispose()
    };
    return renderedHoverPart;
  }
  _renderMarkerStatusbar(context, markerHover) {
    const disposables = new DisposableStore();
    if (markerHover.marker.severity === MarkerSeverity.Error || markerHover.marker.severity === MarkerSeverity.Warning || markerHover.marker.severity === MarkerSeverity.Info) {
      const markerController = MarkerController.get(this._editor);
      if (markerController) {
        context.statusBar.addAction({
          label: nls.localize("view problem", "View Problem"),
          commandId: NextMarkerAction.ID,
          run: () => {
            context.hide();
            markerController.showAtMarker(markerHover.marker);
            this._editor.focus();
          }
        });
      }
    }
    const menuActions = [];
    for (const [, actions] of this._menuService.getMenuActions(MenuId.MarkerHoverStatusBar, this._contextKeyService)) {
      for (const action of actions) {
        if (action instanceof MenuItemAction && action.enabled) {
          menuActions.push(action);
        }
      }
    }
    const renderMenuActions = () => {
      for (const action of menuActions) {
        context.statusBar.addAction({
          label: action.label,
          commandId: action.id,
          iconClass: action.class,
          run: () => {
            context.hide();
            this._editor.setSelection(Range.lift(markerHover.range));
            action.run();
          }
        });
      }
    };
    if (!this._editor.getOption(EditorOption.readOnly)) {
      const quickfixPlaceholderElement = context.statusBar.append($("div"));
      if (this.recentMarkerCodeActionsInfo) {
        if (IMarkerData.makeKey(this.recentMarkerCodeActionsInfo.marker) === IMarkerData.makeKey(markerHover.marker)) {
          if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
            if (menuActions.length === 0) {
              quickfixPlaceholderElement.textContent = nls.localize("noQuickFixes", "No quick fixes available");
            }
          }
        } else {
          this.recentMarkerCodeActionsInfo = void 0;
        }
      }
      const updatePlaceholderDisposable = this.recentMarkerCodeActionsInfo && !this.recentMarkerCodeActionsInfo.hasCodeActions ? Disposable.None : disposableTimeout(() => quickfixPlaceholderElement.textContent = nls.localize("checkingForQuickFixes", "Checking for quick fixes..."), 200, disposables);
      if (!quickfixPlaceholderElement.textContent) {
        quickfixPlaceholderElement.textContent = String.fromCharCode(160);
      }
      const codeActionsPromise = this.getCodeActions(markerHover.marker);
      disposables.add(toDisposable(() => codeActionsPromise.cancel()));
      codeActionsPromise.then((actions) => {
        updatePlaceholderDisposable.dispose();
        this.recentMarkerCodeActionsInfo = { marker: markerHover.marker, hasCodeActions: actions.validActions.length > 0 };
        if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
          actions.dispose();
          if (menuActions.length === 0) {
            quickfixPlaceholderElement.textContent = nls.localize("noQuickFixes", "No quick fixes available");
          } else {
            quickfixPlaceholderElement.style.display = "none";
          }
          renderMenuActions();
          return;
        }
        quickfixPlaceholderElement.style.display = "none";
        let showing = false;
        disposables.add(toDisposable(() => {
          if (!showing) {
            actions.dispose();
          }
        }));
        context.statusBar.addAction({
          label: nls.localize("quick fixes", "Quick Fix..."),
          commandId: quickFixCommandId,
          run: (target) => {
            showing = true;
            const controller = CodeActionController.get(this._editor);
            const elementPosition = dom.getDomNodePagePosition(target);
            controller?.showCodeActions(markerCodeActionTrigger, actions, {
              x: elementPosition.left,
              y: elementPosition.top,
              width: elementPosition.width,
              height: elementPosition.height
            });
          }
        });
        const aiCodeAction = actions.validActions.find((action) => action.action.isAI);
        if (aiCodeAction) {
          context.statusBar.addAction({
            label: aiCodeAction.action.title,
            commandId: aiCodeAction.action.command?.id ?? "",
            iconClass: ThemeIcon.asClassName(Codicon.sparkle),
            run: () => {
              const controller = CodeActionController.get(this._editor);
              controller?.applyCodeAction(aiCodeAction, false, false, ApplyCodeActionReason.FromProblemsHover);
            }
          });
        } else {
          renderMenuActions();
        }
        context.onContentsChanged();
      }, onUnexpectedError);
    } else {
      renderMenuActions();
    }
    return disposables;
  }
  getCodeActions(marker) {
    return createCancelablePromise((cancellationToken) => {
      return getCodeActions(
        this._languageFeaturesService.codeActionProvider,
        this._editor.getModel(),
        new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
        markerCodeActionTrigger,
        Progress.None,
        cancellationToken
      );
    });
  }
};
MarkerHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkerDecorationsService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], MarkerHoverParticipant);
export {
  MarkerHover,
  MarkerHoverParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvbWFya2VySG92ZXJQYXJ0aWNpcGFudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25UcmlnZ2VyVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21hcmtlckRlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEFwcGx5Q29kZUFjdGlvblJlYXNvbiwgZ2V0Q29kZUFjdGlvbnMsIHF1aWNrRml4Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQsIENvZGVBY3Rpb25TZXQsIENvZGVBY3Rpb25UcmlnZ2VyLCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IE1hcmtlckNvbnRyb2xsZXIsIE5leHRNYXJrZXJBY3Rpb24gfSBmcm9tICcuLi8uLi9nb3RvRXJyb3IvYnJvd3Nlci9nb3RvRXJyb3IuanMnO1xuaW1wb3J0IHsgSG92ZXJBbmNob3IsIEhvdmVyQW5jaG9yVHlwZSwgSUVkaXRvckhvdmVyUGFydGljaXBhbnQsIElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIElIb3ZlclBhcnQsIElSZW5kZXJlZEhvdmVyUGFydCwgSVJlbmRlcmVkSG92ZXJQYXJ0cywgUmVuZGVyZWRIb3ZlclBhcnRzIH0gZnJvbSAnLi9ob3ZlclR5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElNYXJrZXIsIElNYXJrZXJEYXRhLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgY2xhc3MgTWFya2VySG92ZXIgaW1wbGVtZW50cyBJSG92ZXJQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3duZXI6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PE1hcmtlckhvdmVyPixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBtYXJrZXI6IElNYXJrZXIsXG5cdCkgeyB9XG5cblx0cHVibGljIGlzVmFsaWRGb3JIb3ZlckFuY2hvcihhbmNob3I6IEhvdmVyQW5jaG9yKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdGFuY2hvci50eXBlID09PSBIb3ZlckFuY2hvclR5cGUuUmFuZ2Vcblx0XHRcdCYmIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gPD0gYW5jaG9yLnJhbmdlLnN0YXJ0Q29sdW1uXG5cdFx0XHQmJiB0aGlzLnJhbmdlLmVuZENvbHVtbiA+PSBhbmNob3IucmFuZ2UuZW5kQ29sdW1uXG5cdFx0KTtcblx0fVxufVxuXG5jb25zdCBtYXJrZXJDb2RlQWN0aW9uVHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIgPSB7XG5cdHR5cGU6IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsXG5cdGZpbHRlcjogeyBpbmNsdWRlOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeCB9LFxuXHR0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5RdWlja0ZpeEhvdmVyXG59O1xuXG5leHBvcnQgY2xhc3MgTWFya2VySG92ZXJQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PE1hcmtlckhvdmVyPiB7XG5cblx0cHVibGljIHJlYWRvbmx5IGhvdmVyT3JkaW5hbDogbnVtYmVyID0gMTtcblxuXHRwcml2YXRlIHJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mbzogeyBtYXJrZXI6IElNYXJrZXI7IGhhc0NvZGVBY3Rpb25zOiBib29sZWFuIH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASU1hcmtlckRlY29yYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2U6IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjb21wdXRlU3luYyhhbmNob3I6IEhvdmVyQW5jaG9yLCBsaW5lRGVjb3JhdGlvbnM6IElNb2RlbERlY29yYXRpb25bXSk6IE1hcmtlckhvdmVyW10ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgYW5jaG9yLnR5cGUgIT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZSAmJiAhYW5jaG9yLnN1cHBvcnRzTWFya2VySG92ZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGFuY2hvclJhbmdlID0gYW5jaG9yLnJhbmdlO1xuXHRcdGlmICghbW9kZWwuaXNWYWxpZFJhbmdlKGFuY2hvci5yYW5nZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IGFuY2hvclJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHJlc3VsdDogTWFya2VySG92ZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZCBvZiBsaW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gKGQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSA/IGQucmFuZ2Uuc3RhcnRDb2x1bW4gOiAxO1xuXHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gKGQucmFuZ2UuZW5kTGluZU51bWJlciA9PT0gbGluZU51bWJlcikgPyBkLnJhbmdlLmVuZENvbHVtbiA6IG1heENvbHVtbjtcblxuXHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5fbWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlLmdldE1hcmtlcihtb2RlbC51cmksIGQpO1xuXHRcdFx0aWYgKCFtYXJrZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGFuY2hvci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBhbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IE1hcmtlckhvdmVyKHRoaXMsIHJhbmdlLCBtYXJrZXIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHJlbmRlckhvdmVyUGFydHMoY29udGV4dDogSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgaG92ZXJQYXJ0czogTWFya2VySG92ZXJbXSk6IElSZW5kZXJlZEhvdmVyUGFydHM8TWFya2VySG92ZXI+IHtcblx0XHRpZiAoIWhvdmVyUGFydHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlbmRlcmVkSG92ZXJQYXJ0cyhbXSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0czogSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtlckhvdmVyPltdID0gW107XG5cdFx0aG92ZXJQYXJ0cy5mb3JFYWNoKGhvdmVyUGFydCA9PiB7XG5cdFx0XHRjb25zdCByZW5kZXJlZE1hcmtlckhvdmVyID0gdGhpcy5fcmVuZGVyTWFya2VySG92ZXIoaG92ZXJQYXJ0KTtcblx0XHRcdGNvbnRleHQuZnJhZ21lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZXJIb3Zlci5ob3ZlckVsZW1lbnQpO1xuXHRcdFx0cmVuZGVyZWRIb3ZlclBhcnRzLnB1c2gocmVuZGVyZWRNYXJrZXJIb3Zlcik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgbWFya2VySG92ZXJGb3JTdGF0dXNiYXIgPSBob3ZlclBhcnRzLmxlbmd0aCA9PT0gMSA/IGhvdmVyUGFydHNbMF0gOiBob3ZlclBhcnRzLnNvcnQoKGEsIGIpID0+IE1hcmtlclNldmVyaXR5LmNvbXBhcmUoYS5tYXJrZXIuc2V2ZXJpdHksIGIubWFya2VyLnNldmVyaXR5KSlbMF07XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZW5kZXJNYXJrZXJTdGF0dXNiYXIoY29udGV4dCwgbWFya2VySG92ZXJGb3JTdGF0dXNiYXIpO1xuXHRcdHJldHVybiBuZXcgUmVuZGVyZWRIb3ZlclBhcnRzKHJlbmRlcmVkSG92ZXJQYXJ0cywgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVDb250ZW50KGhvdmVyUGFydDogTWFya2VySG92ZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHsgbWFya2VyIH0gPSBob3ZlclBhcnQ7XG5cdFx0Y29uc3QgcmVsYXRlZEluZm9ybWF0aW9uID0gaXNOb25FbXB0eUFycmF5KG1hcmtlci5yZWxhdGVkSW5mb3JtYXRpb24pXG5cdFx0XHQ/IG1hcmtlci5yZWxhdGVkSW5mb3JtYXRpb24ubWFwKHJlbGF0ZWQgPT4gYCR7YmFzZW5hbWUocmVsYXRlZC5yZXNvdXJjZSl9KCR7cmVsYXRlZC5zdGFydExpbmVOdW1iZXJ9LCAke3JlbGF0ZWQuc3RhcnRDb2x1bW59KTogJHtyZWxhdGVkLm1lc3NhZ2V9YCkuam9pbignXFxuJylcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBbbWFya2VyLm1lc3NhZ2UsIHJlbGF0ZWRJbmZvcm1hdGlvbl0uZmlsdGVyKHZhbHVlID0+ICEhdmFsdWUpLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWFya2VySG92ZXIobWFya2VySG92ZXI6IE1hcmtlckhvdmVyKTogSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtlckhvdmVyPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSAkKCdkaXYuaG92ZXItcm93Jyk7XG5cdFx0Y29uc3QgbWFya2VyRWxlbWVudCA9IGRvbS5hcHBlbmQoaG92ZXJFbGVtZW50LCAkKCdkaXYubWFya2VyLmhvdmVyLWNvbnRlbnRzJykpO1xuXHRcdGNvbnN0IHsgc291cmNlLCBtZXNzYWdlLCBjb2RlLCByZWxhdGVkSW5mb3JtYXRpb24gfSA9IG1hcmtlckhvdmVyLm1hcmtlcjtcblxuXHRcdHRoaXMuX2VkaXRvci5hcHBseUZvbnRJbmZvKG1hcmtlckVsZW1lbnQpO1xuXHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gZG9tLmFwcGVuZChtYXJrZXJFbGVtZW50LCAkKCdzcGFuJykpO1xuXHRcdG1lc3NhZ2VFbGVtZW50LnN0eWxlLndoaXRlU3BhY2UgPSAncHJlLXdyYXAnO1xuXHRcdG1lc3NhZ2VFbGVtZW50LmlubmVyVGV4dCA9IG1lc3NhZ2U7XG5cblx0XHRpZiAoc291cmNlIHx8IGNvZGUpIHtcblx0XHRcdC8vIENvZGUgaGFzIGxpbmtcblx0XHRcdGlmIChjb2RlICYmIHR5cGVvZiBjb2RlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VBbmRDb2RlRWxlbWVudCA9ICQoJ3NwYW4nKTtcblx0XHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZUVsZW1lbnQgPSBkb20uYXBwZW5kKHNvdXJjZUFuZENvZGVFbGVtZW50LCAkKCdzcGFuJykpO1xuXHRcdFx0XHRcdHNvdXJjZUVsZW1lbnQuaW5uZXJUZXh0ID0gc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvZGVMaW5rID0gZG9tLmFwcGVuZChzb3VyY2VBbmRDb2RlRWxlbWVudCwgJCgnYS5jb2RlLWxpbmsnKSk7XG5cdFx0XHRcdGNvZGVMaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIGNvZGUudGFyZ2V0LnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb2RlTGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oY29kZS50YXJnZXQsIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IGNvZGVFbGVtZW50ID0gZG9tLmFwcGVuZChjb2RlTGluaywgJCgnc3BhbicpKTtcblx0XHRcdFx0Y29kZUVsZW1lbnQuaW5uZXJUZXh0ID0gY29kZS52YWx1ZTtcblxuXHRcdFx0XHRjb25zdCBkZXRhaWxzRWxlbWVudCA9IGRvbS5hcHBlbmQobWFya2VyRWxlbWVudCwgc291cmNlQW5kQ29kZUVsZW1lbnQpO1xuXHRcdFx0XHRkZXRhaWxzRWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gJzAuNic7XG5cdFx0XHRcdGRldGFpbHNFbGVtZW50LnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzZweCc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkZXRhaWxzRWxlbWVudCA9IGRvbS5hcHBlbmQobWFya2VyRWxlbWVudCwgJCgnc3BhbicpKTtcblx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuc3R5bGUub3BhY2l0eSA9ICcwLjYnO1xuXHRcdFx0XHRkZXRhaWxzRWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9ICc2cHgnO1xuXHRcdFx0XHRkZXRhaWxzRWxlbWVudC5pbm5lclRleHQgPSBzb3VyY2UgJiYgY29kZSA/IGAke3NvdXJjZX0oJHtjb2RlfSlgIDogc291cmNlID8gc291cmNlIDogYCgke2NvZGV9KWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShyZWxhdGVkSW5mb3JtYXRpb24pKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbWVzc2FnZSwgcmVzb3VyY2UsIHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4gfSBvZiByZWxhdGVkSW5mb3JtYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgcmVsYXRlZEluZm9Db250YWluZXIgPSBkb20uYXBwZW5kKG1hcmtlckVsZW1lbnQsICQoJ2RpdicpKTtcblx0XHRcdFx0cmVsYXRlZEluZm9Db250YWluZXIuc3R5bGUubWFyZ2luVG9wID0gJzhweCc7XG5cdFx0XHRcdGNvbnN0IGEgPSBkb20uYXBwZW5kKHJlbGF0ZWRJbmZvQ29udGFpbmVyLCAkKCdhJykpO1xuXHRcdFx0XHRhLmlubmVyVGV4dCA9IGAke2Jhc2VuYW1lKHJlc291cmNlKX0oJHtzdGFydExpbmVOdW1iZXJ9LCAke3N0YXJ0Q29sdW1ufSk6IGA7XG5cdFx0XHRcdGEuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9vcGVuZXJTZXJ2aWNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgPSB7IHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uIH0gfTtcblx0XHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihyZXNvdXJjZSwge1xuXHRcdFx0XHRcdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGVkaXRvck9wdGlvbnNcblx0XHRcdFx0XHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZUVsZW1lbnQgPSBkb20uYXBwZW5kPEhUTUxBbmNob3JFbGVtZW50PihyZWxhdGVkSW5mb0NvbnRhaW5lciwgJCgnc3BhbicpKTtcblx0XHRcdFx0bWVzc2FnZUVsZW1lbnQuaW5uZXJUZXh0ID0gbWVzc2FnZTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmFwcGx5Rm9udEluZm8obWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0OiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2VySG92ZXI+ID0ge1xuXHRcdFx0aG92ZXJQYXJ0OiBtYXJrZXJIb3Zlcixcblx0XHRcdGhvdmVyRWxlbWVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdH07XG5cdFx0cmV0dXJuIHJlbmRlcmVkSG92ZXJQYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWFya2VyU3RhdHVzYmFyKGNvbnRleHQ6IElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIG1hcmtlckhvdmVyOiBNYXJrZXJIb3Zlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAobWFya2VySG92ZXIubWFya2VyLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvciB8fCBtYXJrZXJIb3Zlci5tYXJrZXIuc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5Lldhcm5pbmcgfHwgbWFya2VySG92ZXIubWFya2VyLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5JbmZvKSB7XG5cdFx0XHRjb25zdCBtYXJrZXJDb250cm9sbGVyID0gTWFya2VyQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yKTtcblx0XHRcdGlmIChtYXJrZXJDb250cm9sbGVyKSB7XG5cdFx0XHRcdGNvbnRleHQuc3RhdHVzQmFyLmFkZEFjdGlvbih7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndmlldyBwcm9ibGVtJywgXCJWaWV3IFByb2JsZW1cIiksXG5cdFx0XHRcdFx0Y29tbWFuZElkOiBOZXh0TWFya2VyQWN0aW9uLklELFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29udGV4dC5oaWRlKCk7XG5cdFx0XHRcdFx0XHRtYXJrZXJDb250cm9sbGVyLnNob3dBdE1hcmtlcihtYXJrZXJIb3Zlci5tYXJrZXIpO1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNZW51LWNvbnRyaWJ1dGVkIGFjdGlvbnMgKGUuZy4gZml4IHdpdGggaW5saW5lIGNoYXQpXG5cdFx0Y29uc3QgbWVudUFjdGlvbnM6IE1lbnVJdGVtQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFssIGFjdGlvbnNdIG9mIHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5NYXJrZXJIb3ZlclN0YXR1c0JhciwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRcdG1lbnVBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZW5kZXJNZW51QWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIG1lbnVBY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnRleHQuc3RhdHVzQmFyLmFkZEFjdGlvbih7XG5cdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGFjdGlvbi5pZCxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnRleHQuaGlkZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5saWZ0KG1hcmtlckhvdmVyLnJhbmdlKSk7XG5cdFx0XHRcdFx0XHRhY3Rpb24ucnVuKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdGNvbnN0IHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50ID0gY29udGV4dC5zdGF0dXNCYXIuYXBwZW5kKCQoJ2RpdicpKTtcblx0XHRcdGlmICh0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mbykge1xuXHRcdFx0XHRpZiAoSU1hcmtlckRhdGEubWFrZUtleSh0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mby5tYXJrZXIpID09PSBJTWFya2VyRGF0YS5tYWtlS2V5KG1hcmtlckhvdmVyLm1hcmtlcikpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMucmVjZW50TWFya2VyQ29kZUFjdGlvbnNJbmZvLmhhc0NvZGVBY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRpZiAobWVudUFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdub1F1aWNrRml4ZXMnLCBcIk5vIHF1aWNrIGZpeGVzIGF2YWlsYWJsZVwiKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZWNlbnRNYXJrZXJDb2RlQWN0aW9uc0luZm8gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZVBsYWNlaG9sZGVyRGlzcG9zYWJsZSA9IHRoaXMucmVjZW50TWFya2VyQ29kZUFjdGlvbnNJbmZvICYmICF0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mby5oYXNDb2RlQWN0aW9ucyA/IERpc3Bvc2FibGUuTm9uZSA6IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdjaGVja2luZ0ZvclF1aWNrRml4ZXMnLCBcIkNoZWNraW5nIGZvciBxdWljayBmaXhlcy4uLlwiKSwgMjAwLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRpZiAoIXF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnRleHRDb250ZW50KSB7XG5cdFx0XHRcdC8vIEhhdmUgc29tZSBjb250ZW50IGluIGhlcmUgdG8gYXZvaWQgZmxpY2tlcmluZ1xuXHRcdFx0XHRxdWlja2ZpeFBsYWNlaG9sZGVyRWxlbWVudC50ZXh0Q29udGVudCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMHhBMCk7IC8vICZuYnNwO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29kZUFjdGlvbnNQcm9taXNlID0gdGhpcy5nZXRDb2RlQWN0aW9ucyhtYXJrZXJIb3Zlci5tYXJrZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb2RlQWN0aW9uc1Byb21pc2UuY2FuY2VsKCkpKTtcblx0XHRcdGNvZGVBY3Rpb25zUHJvbWlzZS50aGVuKGFjdGlvbnMgPT4ge1xuXHRcdFx0XHR1cGRhdGVQbGFjZWhvbGRlckRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mbyA9IHsgbWFya2VyOiBtYXJrZXJIb3Zlci5tYXJrZXIsIGhhc0NvZGVBY3Rpb25zOiBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPiAwIH07XG5cblx0XHRcdFx0aWYgKCF0aGlzLnJlY2VudE1hcmtlckNvZGVBY3Rpb25zSW5mby5oYXNDb2RlQWN0aW9ucykge1xuXHRcdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlmIChtZW51QWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHF1aWNrZml4UGxhY2Vob2xkZXJFbGVtZW50LnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdub1F1aWNrRml4ZXMnLCBcIk5vIHF1aWNrIGZpeGVzIGF2YWlsYWJsZVwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cXVpY2tmaXhQbGFjZWhvbGRlckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVuZGVyTWVudUFjdGlvbnMoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVpY2tmaXhQbGFjZWhvbGRlckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdFx0XHRsZXQgc2hvd2luZyA9IGZhbHNlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXNob3dpbmcpIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnRleHQuc3RhdHVzQmFyLmFkZEFjdGlvbih7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncXVpY2sgZml4ZXMnLCBcIlF1aWNrIEZpeC4uLlwiKSxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IHF1aWNrRml4Q29tbWFuZElkLFxuXHRcdFx0XHRcdHJ1bjogKHRhcmdldCkgPT4ge1xuXHRcdFx0XHRcdFx0c2hvd2luZyA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gQ29kZUFjdGlvbkNvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik7XG5cdFx0XHRcdFx0XHRjb25zdCBlbGVtZW50UG9zaXRpb24gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0YXJnZXQpO1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcj8uc2hvd0NvZGVBY3Rpb25zKG1hcmtlckNvZGVBY3Rpb25UcmlnZ2VyLCBhY3Rpb25zLCB7XG5cdFx0XHRcdFx0XHRcdHg6IGVsZW1lbnRQb3NpdGlvbi5sZWZ0LFxuXHRcdFx0XHRcdFx0XHR5OiBlbGVtZW50UG9zaXRpb24udG9wLFxuXHRcdFx0XHRcdFx0XHR3aWR0aDogZWxlbWVudFBvc2l0aW9uLndpZHRoLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHQ6IGVsZW1lbnRQb3NpdGlvbi5oZWlnaHRcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgYWlDb2RlQWN0aW9uID0gYWN0aW9ucy52YWxpZEFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmFjdGlvbi5pc0FJKTtcblx0XHRcdFx0aWYgKGFpQ29kZUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnRleHQuc3RhdHVzQmFyLmFkZEFjdGlvbih7XG5cdFx0XHRcdFx0XHRsYWJlbDogYWlDb2RlQWN0aW9uLmFjdGlvbi50aXRsZSxcblx0XHRcdFx0XHRcdGNvbW1hbmRJZDogYWlDb2RlQWN0aW9uLmFjdGlvbi5jb21tYW5kPy5pZCA/PyAnJyxcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BhcmtsZSksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvZGVBY3Rpb25Db250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0XHRcdFx0XHRjb250cm9sbGVyPy5hcHBseUNvZGVBY3Rpb24oYWlDb2RlQWN0aW9uLCBmYWxzZSwgZmFsc2UsIEFwcGx5Q29kZUFjdGlvblJlYXNvbi5Gcm9tUHJvYmxlbXNIb3Zlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gT25seSBzaG93IG1lbnUtY29udHJpYnV0ZWQgYWN0aW9ucyAoZS5nLiBpbmxpbmUgY2hhdCBGaXgpIHdoZW4gdGhlcmVcblx0XHRcdFx0XHQvLyBpcyBubyBBSSBjb2RlIGFjdGlvbiwgdG8gYXZvaWQgZHVwbGljYXRlIEZpeCBlbnRyeSBwb2ludHMuXG5cdFx0XHRcdFx0cmVuZGVyTWVudUFjdGlvbnMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE5vdGlmeSB0aGF0IHRoZSBjb250ZW50cyBoYXZlIGNoYW5nZWQgZ2l2ZW4gd2UgYWRkZWRcblx0XHRcdFx0Ly8gYWN0aW9ucyB0byB0aGUgaG92ZXJcblx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MDQyNFxuXHRcdFx0XHRjb250ZXh0Lm9uQ29udGVudHNDaGFuZ2VkKCk7XG5cblx0XHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVuZGVyTWVudUFjdGlvbnMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvZGVBY3Rpb25zKG1hcmtlcjogSU1hcmtlcik6IENhbmNlbGFibGVQcm9taXNlPENvZGVBY3Rpb25TZXQ+IHtcblx0XHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoY2FuY2VsbGF0aW9uVG9rZW4gPT4ge1xuXHRcdFx0cmV0dXJuIGdldENvZGVBY3Rpb25zKFxuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIsXG5cdFx0XHRcdHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpISxcblx0XHRcdFx0bmV3IFJhbmdlKG1hcmtlci5zdGFydExpbmVOdW1iZXIsIG1hcmtlci5zdGFydENvbHVtbiwgbWFya2VyLmVuZExpbmVOdW1iZXIsIG1hcmtlci5lbmRDb2x1bW4pLFxuXHRcdFx0XHRtYXJrZXJDb2RlQWN0aW9uVHJpZ2dlcixcblx0XHRcdFx0UHJvZ3Jlc3MuTm9uZSxcblx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUE0Qix5QkFBeUIseUJBQXlCO0FBQzlFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVCQUF1QixnQkFBZ0IseUJBQXlCO0FBQ3pFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWtELCtCQUErQjtBQUMxRixTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBc0IsaUJBQTBILDBCQUEwQjtBQUMxSyxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjLFFBQVEsc0JBQXNCO0FBQ3JELFNBQVMsMEJBQTBCO0FBRW5DLFNBQWtCLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUV4QixNQUFNLElBQUksSUFBSTtBQUVQLE1BQU0sWUFBa0M7QUFBQSxFQUU5QyxZQUNpQixPQUNBLE9BQ0EsUUFDZjtBQUhlO0FBQ0E7QUFDQTtBQUFBLEVBQ2I7QUFBQSxFQUVHLHNCQUFzQixRQUE4QjtBQUMxRCxXQUNDLE9BQU8sU0FBUyxnQkFBZ0IsU0FDN0IsS0FBSyxNQUFNLGVBQWUsT0FBTyxNQUFNLGVBQ3ZDLEtBQUssTUFBTSxhQUFhLE9BQU8sTUFBTTtBQUFBLEVBRTFDO0FBQ0Q7QUFFQSxNQUFNLDBCQUE2QztBQUFBLEVBQ2xELE1BQU0sc0JBQXNCO0FBQUEsRUFDNUIsUUFBUSxFQUFFLFNBQVMsZUFBZSxTQUFTO0FBQUEsRUFDM0MsZUFBZSx3QkFBd0I7QUFDeEM7QUFFTyxJQUFNLHlCQUFOLE1BQTZFO0FBQUEsRUFNbkYsWUFDa0IsU0FDMkIsMkJBQ1gsZ0JBQ1UsMEJBQ1osY0FDTSxvQkFDcEM7QUFOZ0I7QUFDMkI7QUFDWDtBQUNVO0FBQ1o7QUFDTTtBQVZ0QyxTQUFnQixlQUF1QjtBQUV2QyxTQUFRLDhCQUF3RjtBQUFBLEVBUzVGO0FBQUEsRUFFRyxZQUFZLFFBQXFCLGlCQUFvRDtBQUMzRixRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsS0FBSyxPQUFPLFNBQVMsZ0JBQWdCLFNBQVMsQ0FBQyxPQUFPLHFCQUFxQjtBQUNyRyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxRQUFRLEtBQUssUUFBUSxTQUFTO0FBQ3BDLFVBQU0sY0FBYyxPQUFPO0FBQzNCLFFBQUksQ0FBQyxNQUFNLGFBQWEsT0FBTyxLQUFLLEdBQUc7QUFDdEMsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sYUFBYSxZQUFZO0FBQy9CLFVBQU0sWUFBWSxNQUFNLGlCQUFpQixVQUFVO0FBQ25ELFVBQU0sU0FBd0IsQ0FBQztBQUMvQixlQUFXLEtBQUssaUJBQWlCO0FBQ2hDLFlBQU0sY0FBZSxFQUFFLE1BQU0sb0JBQW9CLGFBQWMsRUFBRSxNQUFNLGNBQWM7QUFDckYsWUFBTSxZQUFhLEVBQUUsTUFBTSxrQkFBa0IsYUFBYyxFQUFFLE1BQU0sWUFBWTtBQUUvRSxZQUFNLFNBQVMsS0FBSywwQkFBMEIsVUFBVSxNQUFNLEtBQUssQ0FBQztBQUNwRSxVQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxJQUFJLE1BQU0sT0FBTyxNQUFNLGlCQUFpQixhQUFhLE9BQU8sTUFBTSxpQkFBaUIsU0FBUztBQUMxRyxhQUFPLEtBQUssSUFBSSxZQUFZLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFBQSxJQUNqRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxpQkFBaUIsU0FBb0MsWUFBNkQ7QUFDeEgsUUFBSSxDQUFDLFdBQVcsUUFBUTtBQUN2QixhQUFPLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUFBLElBQ2pDO0FBQ0EsVUFBTSxxQkFBd0QsQ0FBQztBQUMvRCxlQUFXLFFBQVEsZUFBYTtBQUMvQixZQUFNLHNCQUFzQixLQUFLLG1CQUFtQixTQUFTO0FBQzdELGNBQVEsU0FBUyxZQUFZLG9CQUFvQixZQUFZO0FBQzdELHlCQUFtQixLQUFLLG1CQUFtQjtBQUFBLElBQzVDLENBQUM7QUFDRCxVQUFNLDBCQUEwQixXQUFXLFdBQVcsSUFBSSxXQUFXLENBQUMsSUFBSSxXQUFXLEtBQUssQ0FBQyxHQUFHLE1BQU0sZUFBZSxRQUFRLEVBQUUsT0FBTyxVQUFVLEVBQUUsT0FBTyxRQUFRLENBQUMsRUFBRSxDQUFDO0FBQ25LLFVBQU0sY0FBYyxLQUFLLHVCQUF1QixTQUFTLHVCQUF1QjtBQUNoRixXQUFPLElBQUksbUJBQW1CLG9CQUFvQixXQUFXO0FBQUEsRUFDOUQ7QUFBQSxFQUVPLHFCQUFxQixXQUFnQztBQUMzRCxVQUFNLEVBQUUsT0FBTyxJQUFJO0FBQ25CLFVBQU0scUJBQXFCLGdCQUFnQixPQUFPLGtCQUFrQixJQUNqRSxPQUFPLG1CQUFtQixJQUFJLGFBQVcsR0FBRyxTQUFTLFFBQVEsUUFBUSxDQUFDLElBQUksUUFBUSxlQUFlLEtBQUssUUFBUSxXQUFXLE1BQU0sUUFBUSxPQUFPLEVBQUUsRUFBRSxLQUFLLElBQUksSUFDM0o7QUFDSCxXQUFPLENBQUMsT0FBTyxTQUFTLGtCQUFrQixFQUFFLE9BQU8sV0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssSUFBSTtBQUFBLEVBQy9FO0FBQUEsRUFFUSxtQkFBbUIsYUFBMkQ7QUFDckYsVUFBTSxjQUErQixJQUFJLGdCQUFnQjtBQUN6RCxVQUFNLGVBQWUsRUFBRSxlQUFlO0FBQ3RDLFVBQU0sZ0JBQWdCLElBQUksT0FBTyxjQUFjLEVBQUUsMkJBQTJCLENBQUM7QUFDN0UsVUFBTSxFQUFFLFFBQVEsU0FBUyxNQUFNLG1CQUFtQixJQUFJLFlBQVk7QUFFbEUsU0FBSyxRQUFRLGNBQWMsYUFBYTtBQUN4QyxVQUFNLGlCQUFpQixJQUFJLE9BQU8sZUFBZSxFQUFFLE1BQU0sQ0FBQztBQUMxRCxtQkFBZSxNQUFNLGFBQWE7QUFDbEMsbUJBQWUsWUFBWTtBQUUzQixRQUFJLFVBQVUsTUFBTTtBQUVuQixVQUFJLFFBQVEsT0FBTyxTQUFTLFVBQVU7QUFDckMsY0FBTSx1QkFBdUIsRUFBRSxNQUFNO0FBQ3JDLFlBQUksUUFBUTtBQUNYLGdCQUFNLGdCQUFnQixJQUFJLE9BQU8sc0JBQXNCLEVBQUUsTUFBTSxDQUFDO0FBQ2hFLHdCQUFjLFlBQVk7QUFBQSxRQUMzQjtBQUNBLGNBQU0sV0FBVyxJQUFJLE9BQU8sc0JBQXNCLEVBQUUsYUFBYSxDQUFDO0FBQ2xFLGlCQUFTLGFBQWEsUUFBUSxLQUFLLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFFeEQsb0JBQVksSUFBSSxJQUFJLHNCQUFzQixVQUFVLFNBQVMsQ0FBQyxNQUFNO0FBQ25FLGVBQUssZUFBZSxLQUFLLEtBQUssUUFBUSxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQzdELFlBQUUsZUFBZTtBQUNqQixZQUFFLGdCQUFnQjtBQUFBLFFBQ25CLENBQUMsQ0FBQztBQUVGLGNBQU0sY0FBYyxJQUFJLE9BQU8sVUFBVSxFQUFFLE1BQU0sQ0FBQztBQUNsRCxvQkFBWSxZQUFZLEtBQUs7QUFFN0IsY0FBTSxpQkFBaUIsSUFBSSxPQUFPLGVBQWUsb0JBQW9CO0FBQ3JFLHVCQUFlLE1BQU0sVUFBVTtBQUMvQix1QkFBZSxNQUFNLGNBQWM7QUFBQSxNQUNwQyxPQUFPO0FBQ04sY0FBTSxpQkFBaUIsSUFBSSxPQUFPLGVBQWUsRUFBRSxNQUFNLENBQUM7QUFDMUQsdUJBQWUsTUFBTSxVQUFVO0FBQy9CLHVCQUFlLE1BQU0sY0FBYztBQUNuQyx1QkFBZSxZQUFZLFVBQVUsT0FBTyxHQUFHLE1BQU0sSUFBSSxJQUFJLE1BQU0sU0FBUyxTQUFTLElBQUksSUFBSTtBQUFBLE1BQzlGO0FBQUEsSUFDRDtBQUVBLFFBQUksZ0JBQWdCLGtCQUFrQixHQUFHO0FBQ3hDLGlCQUFXLEVBQUUsU0FBQUEsVUFBUyxVQUFVLGlCQUFpQixZQUFZLEtBQUssb0JBQW9CO0FBQ3JGLGNBQU0sdUJBQXVCLElBQUksT0FBTyxlQUFlLEVBQUUsS0FBSyxDQUFDO0FBQy9ELDZCQUFxQixNQUFNLFlBQVk7QUFDdkMsY0FBTSxJQUFJLElBQUksT0FBTyxzQkFBc0IsRUFBRSxHQUFHLENBQUM7QUFDakQsVUFBRSxZQUFZLEdBQUcsU0FBUyxRQUFRLENBQUMsSUFBSSxlQUFlLEtBQUssV0FBVztBQUN0RSxVQUFFLE1BQU0sU0FBUztBQUNqQixvQkFBWSxJQUFJLElBQUksc0JBQXNCLEdBQUcsU0FBUyxDQUFDLE1BQU07QUFDNUQsWUFBRSxnQkFBZ0I7QUFDbEIsWUFBRSxlQUFlO0FBQ2pCLGNBQUksS0FBSyxnQkFBZ0I7QUFDeEIsa0JBQU0sZ0JBQW9DLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixZQUFZLEVBQUU7QUFDeEYsaUJBQUssZUFBZSxLQUFLLFVBQVU7QUFBQSxjQUNsQyxpQkFBaUI7QUFBQSxjQUNqQjtBQUFBLFlBQ0QsQ0FBQyxFQUFFLE1BQU0saUJBQWlCO0FBQUEsVUFDM0I7QUFBQSxRQUNELENBQUMsQ0FBQztBQUNGLGNBQU1DLGtCQUFpQixJQUFJLE9BQTBCLHNCQUFzQixFQUFFLE1BQU0sQ0FBQztBQUNwRixRQUFBQSxnQkFBZSxZQUFZRDtBQUMzQixhQUFLLFFBQVEsY0FBY0MsZUFBYztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQXFEO0FBQUEsTUFDMUQsV0FBVztBQUFBLE1BQ1g7QUFBQSxNQUNBLFNBQVMsTUFBTSxZQUFZLFFBQVE7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBdUIsU0FBb0MsYUFBdUM7QUFDekcsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQUksWUFBWSxPQUFPLGFBQWEsZUFBZSxTQUFTLFlBQVksT0FBTyxhQUFhLGVBQWUsV0FBVyxZQUFZLE9BQU8sYUFBYSxlQUFlLE1BQU07QUFDMUssWUFBTSxtQkFBbUIsaUJBQWlCLElBQUksS0FBSyxPQUFPO0FBQzFELFVBQUksa0JBQWtCO0FBQ3JCLGdCQUFRLFVBQVUsVUFBVTtBQUFBLFVBQzNCLE9BQU8sSUFBSSxTQUFTLGdCQUFnQixjQUFjO0FBQUEsVUFDbEQsV0FBVyxpQkFBaUI7QUFBQSxVQUM1QixLQUFLLE1BQU07QUFDVixvQkFBUSxLQUFLO0FBQ2IsNkJBQWlCLGFBQWEsWUFBWSxNQUFNO0FBQ2hELGlCQUFLLFFBQVEsTUFBTTtBQUFBLFVBQ3BCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGNBQWdDLENBQUM7QUFDdkMsZUFBVyxDQUFDLEVBQUUsT0FBTyxLQUFLLEtBQUssYUFBYSxlQUFlLE9BQU8sc0JBQXNCLEtBQUssa0JBQWtCLEdBQUc7QUFDakgsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQUksa0JBQWtCLGtCQUFrQixPQUFPLFNBQVM7QUFDdkQsc0JBQVksS0FBSyxNQUFNO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sb0JBQW9CLE1BQU07QUFDL0IsaUJBQVcsVUFBVSxhQUFhO0FBQ2pDLGdCQUFRLFVBQVUsVUFBVTtBQUFBLFVBQzNCLE9BQU8sT0FBTztBQUFBLFVBQ2QsV0FBVyxPQUFPO0FBQUEsVUFDbEIsV0FBVyxPQUFPO0FBQUEsVUFDbEIsS0FBSyxNQUFNO0FBQ1Ysb0JBQVEsS0FBSztBQUNiLGlCQUFLLFFBQVEsYUFBYSxNQUFNLEtBQUssWUFBWSxLQUFLLENBQUM7QUFDdkQsbUJBQU8sSUFBSTtBQUFBLFVBQ1o7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLFFBQVEsVUFBVSxhQUFhLFFBQVEsR0FBRztBQUNuRCxZQUFNLDZCQUE2QixRQUFRLFVBQVUsT0FBTyxFQUFFLEtBQUssQ0FBQztBQUNwRSxVQUFJLEtBQUssNkJBQTZCO0FBQ3JDLFlBQUksWUFBWSxRQUFRLEtBQUssNEJBQTRCLE1BQU0sTUFBTSxZQUFZLFFBQVEsWUFBWSxNQUFNLEdBQUc7QUFDN0csY0FBSSxDQUFDLEtBQUssNEJBQTRCLGdCQUFnQjtBQUNyRCxnQkFBSSxZQUFZLFdBQVcsR0FBRztBQUM3Qix5Q0FBMkIsY0FBYyxJQUFJLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUFBLFlBQ2pHO0FBQUEsVUFDRDtBQUFBLFFBQ0QsT0FBTztBQUNOLGVBQUssOEJBQThCO0FBQUEsUUFDcEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSw4QkFBOEIsS0FBSywrQkFBK0IsQ0FBQyxLQUFLLDRCQUE0QixpQkFBaUIsV0FBVyxPQUFPLGtCQUFrQixNQUFNLDJCQUEyQixjQUFjLElBQUksU0FBUyx5QkFBeUIsNkJBQTZCLEdBQUcsS0FBSyxXQUFXO0FBQ3BTLFVBQUksQ0FBQywyQkFBMkIsYUFBYTtBQUU1QyxtQ0FBMkIsY0FBYyxPQUFPLGFBQWEsR0FBSTtBQUFBLE1BQ2xFO0FBQ0EsWUFBTSxxQkFBcUIsS0FBSyxlQUFlLFlBQVksTUFBTTtBQUNqRSxrQkFBWSxJQUFJLGFBQWEsTUFBTSxtQkFBbUIsT0FBTyxDQUFDLENBQUM7QUFDL0QseUJBQW1CLEtBQUssYUFBVztBQUNsQyxvQ0FBNEIsUUFBUTtBQUNwQyxhQUFLLDhCQUE4QixFQUFFLFFBQVEsWUFBWSxRQUFRLGdCQUFnQixRQUFRLGFBQWEsU0FBUyxFQUFFO0FBRWpILFlBQUksQ0FBQyxLQUFLLDRCQUE0QixnQkFBZ0I7QUFDckQsa0JBQVEsUUFBUTtBQUNoQixjQUFJLFlBQVksV0FBVyxHQUFHO0FBQzdCLHVDQUEyQixjQUFjLElBQUksU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQUEsVUFDakcsT0FBTztBQUNOLHVDQUEyQixNQUFNLFVBQVU7QUFBQSxVQUM1QztBQUNBLDRCQUFrQjtBQUNsQjtBQUFBLFFBQ0Q7QUFDQSxtQ0FBMkIsTUFBTSxVQUFVO0FBRTNDLFlBQUksVUFBVTtBQUNkLG9CQUFZLElBQUksYUFBYSxNQUFNO0FBQ2xDLGNBQUksQ0FBQyxTQUFTO0FBQ2Isb0JBQVEsUUFBUTtBQUFBLFVBQ2pCO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFFRixnQkFBUSxVQUFVLFVBQVU7QUFBQSxVQUMzQixPQUFPLElBQUksU0FBUyxlQUFlLGNBQWM7QUFBQSxVQUNqRCxXQUFXO0FBQUEsVUFDWCxLQUFLLENBQUMsV0FBVztBQUNoQixzQkFBVTtBQUNWLGtCQUFNLGFBQWEscUJBQXFCLElBQUksS0FBSyxPQUFPO0FBQ3hELGtCQUFNLGtCQUFrQixJQUFJLHVCQUF1QixNQUFNO0FBQ3pELHdCQUFZLGdCQUFnQix5QkFBeUIsU0FBUztBQUFBLGNBQzdELEdBQUcsZ0JBQWdCO0FBQUEsY0FDbkIsR0FBRyxnQkFBZ0I7QUFBQSxjQUNuQixPQUFPLGdCQUFnQjtBQUFBLGNBQ3ZCLFFBQVEsZ0JBQWdCO0FBQUEsWUFDekIsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNELENBQUM7QUFFRCxjQUFNLGVBQWUsUUFBUSxhQUFhLEtBQUssWUFBVSxPQUFPLE9BQU8sSUFBSTtBQUMzRSxZQUFJLGNBQWM7QUFDakIsa0JBQVEsVUFBVSxVQUFVO0FBQUEsWUFDM0IsT0FBTyxhQUFhLE9BQU87QUFBQSxZQUMzQixXQUFXLGFBQWEsT0FBTyxTQUFTLE1BQU07QUFBQSxZQUM5QyxXQUFXLFVBQVUsWUFBWSxRQUFRLE9BQU87QUFBQSxZQUNoRCxLQUFLLE1BQU07QUFDVixvQkFBTSxhQUFhLHFCQUFxQixJQUFJLEtBQUssT0FBTztBQUN4RCwwQkFBWSxnQkFBZ0IsY0FBYyxPQUFPLE9BQU8sc0JBQXNCLGlCQUFpQjtBQUFBLFlBQ2hHO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixPQUFPO0FBR04sNEJBQWtCO0FBQUEsUUFDbkI7QUFLQSxnQkFBUSxrQkFBa0I7QUFBQSxNQUUzQixHQUFHLGlCQUFpQjtBQUFBLElBQ3JCLE9BQU87QUFDTix3QkFBa0I7QUFBQSxJQUNuQjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxlQUFlLFFBQW1EO0FBQ3pFLFdBQU8sd0JBQXdCLHVCQUFxQjtBQUNuRCxhQUFPO0FBQUEsUUFDTixLQUFLLHlCQUF5QjtBQUFBLFFBQzlCLEtBQUssUUFBUSxTQUFTO0FBQUEsUUFDdEIsSUFBSSxNQUFNLE9BQU8saUJBQWlCLE9BQU8sYUFBYSxPQUFPLGVBQWUsT0FBTyxTQUFTO0FBQUEsUUFDNUY7QUFBQSxRQUNBLFNBQVM7QUFBQSxRQUNUO0FBQUEsTUFBaUI7QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBMVJhLHlCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogWyJtZXNzYWdlIiwgIm1lc3NhZ2VFbGVtZW50Il0KfQo=
