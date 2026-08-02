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
import { Button } from "../../../../base/browser/ui/button/button.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { createCombinedWorkspaceEdit } from "./edit.js";
import "./postEditWidget.css";
let PostEditWidget = class extends Disposable {
  constructor(typeId, editor, visibleContext, showCommand, range, edits, onSelectNewEdit, additionalActions, contextKeyService, _keybindingService, _actionWidgetService) {
    super();
    this.typeId = typeId;
    this.editor = editor;
    this.showCommand = showCommand;
    this.range = range;
    this.edits = edits;
    this.onSelectNewEdit = onSelectNewEdit;
    this.additionalActions = additionalActions;
    this._keybindingService = _keybindingService;
    this._actionWidgetService = _actionWidgetService;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = true;
    this.create();
    this.visibleContext = visibleContext.bindTo(contextKeyService);
    this.visibleContext.set(true);
    this._register(toDisposable(() => this.visibleContext.reset()));
    this.editor.addContentWidget(this);
    this.editor.layoutContentWidget(this);
    this._register(toDisposable((() => this.editor.removeContentWidget(this))));
    this._register(this.editor.onDidChangeCursorPosition((e) => {
      this.dispose();
    }));
    this._register(Event.runAndSubscribe(_keybindingService.onDidUpdateKeybindings, () => {
      this._updateButtonTitle();
    }));
  }
  _updateButtonTitle() {
    this.button.element.title = this._keybindingService.appendKeybinding(this.showCommand.label, this.showCommand.id);
  }
  create() {
    this.domNode = dom.$(".post-edit-widget");
    this.button = this._register(new Button(this.domNode, {
      supportIcons: true
    }));
    this.button.label = "$(insert)";
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => this.showSelector()));
  }
  getId() {
    return PostEditWidget.baseId + "." + this.typeId;
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    return {
      position: this.range.getEndPosition(),
      preference: [ContentWidgetPositionPreference.BELOW]
    };
  }
  showSelector() {
    const pos = dom.getDomNodePagePosition(this.button.element);
    const anchor = { x: pos.left + pos.width, y: pos.top + pos.height };
    this._actionWidgetService.show(
      "postEditWidget",
      false,
      this.edits.allEdits.map((edit, i) => {
        return {
          kind: ActionListItemKind.Action,
          item: edit,
          label: edit.title,
          disabled: false,
          canPreview: false,
          group: { title: "", icon: ThemeIcon.fromId(i === this.edits.activeEditIndex ? Codicon.check.id : Codicon.blank.id) }
        };
      }),
      {
        onHide: () => {
          this.editor.focus();
        },
        onSelect: (item) => {
          this._actionWidgetService.hide(false);
          const i = this.edits.allEdits.findIndex((edit) => edit === item);
          if (i !== this.edits.activeEditIndex) {
            return this.onSelectNewEdit(i);
          }
        }
      },
      anchor,
      this.editor.getDomNode() ?? void 0,
      this.additionalActions
    );
  }
};
PostEditWidget.baseId = "editor.widget.postEditWidget";
PostEditWidget = __decorateClass([
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IActionWidgetService)
], PostEditWidget);
let PostEditWidgetManager = class extends Disposable {
  constructor(_id, _editor, _visibleContext, _showCommand, _getAdditionalActions, _instantiationService, _bulkEditService, _notificationService) {
    super();
    this._id = _id;
    this._editor = _editor;
    this._visibleContext = _visibleContext;
    this._showCommand = _showCommand;
    this._getAdditionalActions = _getAdditionalActions;
    this._instantiationService = _instantiationService;
    this._bulkEditService = _bulkEditService;
    this._notificationService = _notificationService;
    this._currentWidget = this._register(new MutableDisposable());
    this._register(Event.any(
      _editor.onDidChangeModel,
      _editor.onDidChangeModelContent
    )(() => this.clear()));
  }
  async applyEditAndShowIfNeeded(ranges, edits, canShowWidget, resolve, token) {
    if (!ranges.length || !this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const edit = edits.allEdits.at(edits.activeEditIndex);
    if (!edit) {
      return;
    }
    const onDidSelectEdit = async (newEditIndex) => {
      const model2 = this._editor.getModel();
      if (!model2) {
        return;
      }
      await model2.undo();
      this.applyEditAndShowIfNeeded(ranges, { activeEditIndex: newEditIndex, allEdits: edits.allEdits }, canShowWidget, resolve, token);
    };
    const handleError = (e, message) => {
      if (isCancellationError(e)) {
        return;
      }
      this._notificationService.error(message);
      if (canShowWidget) {
        this.show(ranges[0], edits, onDidSelectEdit);
      }
    };
    const editorStateCts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0, token);
    let resolvedEdit;
    try {
      resolvedEdit = await raceCancellationError(resolve(edit, editorStateCts.token), editorStateCts.token);
    } catch (e) {
      return handleError(e, localize("resolveError", "Error resolving edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
    } finally {
      editorStateCts.dispose();
    }
    if (token.isCancellationRequested) {
      return;
    }
    const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, ranges, resolvedEdit);
    const primaryRange = ranges[0];
    const editTrackingDecoration = model.deltaDecorations([], [{
      range: primaryRange,
      options: { description: "paste-line-suffix", stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
    }]);
    this._editor.focus();
    let editResult;
    let editRange;
    try {
      editResult = await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor, token });
      editRange = model.getDecorationRange(editTrackingDecoration[0]);
    } catch (e) {
      return handleError(e, localize("applyError", "Error applying edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
    } finally {
      model.deltaDecorations(editTrackingDecoration, []);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (canShowWidget && editResult.isApplied && edits.allEdits.length > 1) {
      this.show(editRange ?? primaryRange, edits, onDidSelectEdit);
    }
  }
  show(range, edits, onDidSelectEdit) {
    this.clear();
    if (this._editor.hasModel()) {
      this._currentWidget.value = this._instantiationService.createInstance(PostEditWidget, this._id, this._editor, this._visibleContext, this._showCommand, range, edits, onDidSelectEdit, this._getAdditionalActions());
    }
  }
  clear() {
    this._currentWidget.clear();
  }
  tryShowSelector() {
    this._currentWidget.value?.showSelector();
  }
};
PostEditWidgetManager = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IBulkEditService),
  __decorateParam(7, INotificationService)
], PostEditWidgetManager);
export {
  PostEditWidgetManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL3Bvc3RFZGl0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFJlc3VsdCwgSUJ1bGtFZGl0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnREcm9wRWRpdCwgRG9jdW1lbnRQYXN0ZUVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclN0YXRlRmxhZywgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uL2VkaXRvclN0YXRlL2Jyb3dzZXIvZWRpdG9yU3RhdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tYmluZWRXb3Jrc3BhY2VFZGl0IH0gZnJvbSAnLi9lZGl0LmpzJztcbmltcG9ydCAnLi9wb3N0RWRpdFdpZGdldC5jc3MnO1xuXG5cbmludGVyZmFjZSBFZGl0U2V0PEVkaXQgZXh0ZW5kcyBEb2N1bWVudFBhc3RlRWRpdCB8IERvY3VtZW50RHJvcEVkaXQ+IHtcblx0cmVhZG9ubHkgYWN0aXZlRWRpdEluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsbEVkaXRzOiBSZWFkb25seUFycmF5PEVkaXQ+O1xufVxuXG5pbnRlcmZhY2UgU2hvd0NvbW1hbmQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5jbGFzcyBQb3N0RWRpdFdpZGdldDxUIGV4dGVuZHMgRG9jdW1lbnRQYXN0ZUVkaXQgfCBEb2N1bWVudERyb3BFZGl0PiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGJhc2VJZCA9ICdlZGl0b3Iud2lkZ2V0LnBvc3RFZGl0V2lkZ2V0JztcblxuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblx0cmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd24gPSB0cnVlO1xuXG5cdHByaXZhdGUgZG9tTm9kZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGJ1dHRvbiE6IEJ1dHRvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2libGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHR5cGVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHR2aXNpYmxlQ29udGV4dDogUmF3Q29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNob3dDb21tYW5kOiBTaG93Q29tbWFuZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJhbmdlOiBSYW5nZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRzOiBFZGl0U2V0PFQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25TZWxlY3ROZXdFZGl0OiAoZWRpdEluZGV4OiBudW1iZXIpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhZGRpdGlvbmFsQWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblxuXHRcdHRoaXMudmlzaWJsZUNvbnRleHQgPSB2aXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudmlzaWJsZUNvbnRleHQuc2V0KHRydWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnZpc2libGVDb250ZXh0LnJlc2V0KCkpKTtcblxuXHRcdHRoaXMuZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKCkgPT4gdGhpcy5lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsICgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvblRpdGxlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQnV0dG9uVGl0bGUoKSB7XG5cdFx0dGhpcy5idXR0b24uZWxlbWVudC50aXRsZSA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcodGhpcy5zaG93Q29tbWFuZC5sYWJlbCwgdGhpcy5zaG93Q29tbWFuZC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLnBvc3QtZWRpdC13aWRnZXQnKTtcblxuXHRcdHRoaXMuYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmRvbU5vZGUsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5idXR0b24ubGFiZWwgPSAnJChpbnNlcnQpJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnNob3dTZWxlY3RvcigpKSk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBQb3N0RWRpdFdpZGdldC5iYXNlSWQgKyAnLicgKyB0aGlzLnR5cGVJZDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiB0aGlzLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPV11cblx0XHR9O1xuXHR9XG5cblx0c2hvd1NlbGVjdG9yKCkge1xuXHRcdGNvbnN0IHBvcyA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuYnV0dG9uLmVsZW1lbnQpO1xuXHRcdGNvbnN0IGFuY2hvciA9IHsgeDogcG9zLmxlZnQgKyBwb3Mud2lkdGgsIHk6IHBvcy50b3AgKyBwb3MuaGVpZ2h0IH07XG5cblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3coJ3Bvc3RFZGl0V2lkZ2V0JywgZmFsc2UsXG5cdFx0XHR0aGlzLmVkaXRzLmFsbEVkaXRzLm1hcCgoZWRpdCwgaSk6IElBY3Rpb25MaXN0SXRlbTxUPiA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRpdGVtOiBlZGl0LFxuXHRcdFx0XHRcdGxhYmVsOiBlZGl0LnRpdGxlLFxuXHRcdFx0XHRcdGRpc2FibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRjYW5QcmV2aWV3OiBmYWxzZSxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IFRoZW1lSWNvbi5mcm9tSWQoaSA9PT0gdGhpcy5lZGl0cy5hY3RpdmVFZGl0SW5kZXggPyBDb2RpY29uLmNoZWNrLmlkIDogQ29kaWNvbi5ibGFuay5pZCkgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0pLCB7XG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdH0sXG5cdFx0XHRvblNlbGVjdDogKGl0ZW0pID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKGZhbHNlKTtcblxuXHRcdFx0XHRjb25zdCBpID0gdGhpcy5lZGl0cy5hbGxFZGl0cy5maW5kSW5kZXgoZWRpdCA9PiBlZGl0ID09PSBpdGVtKTtcblx0XHRcdFx0aWYgKGkgIT09IHRoaXMuZWRpdHMuYWN0aXZlRWRpdEluZGV4KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub25TZWxlY3ROZXdFZGl0KGkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sIGFuY2hvciwgdGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpID8/IHVuZGVmaW5lZCwgdGhpcy5hZGRpdGlvbmFsQWN0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBvc3RFZGl0V2lkZ2V0TWFuYWdlcjxUIGV4dGVuZHMgRG9jdW1lbnRQYXN0ZUVkaXQgfCBEb2N1bWVudERyb3BFZGl0PiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8UG9zdEVkaXRXaWRnZXQ8VD4+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlQ29udGV4dDogUmF3Q29udGV4dEtleTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaG93Q29tbWFuZDogU2hvd0NvbW1hbmQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0QWRkaXRpb25hbEFjdGlvbnM6ICgpID0+IHJlYWRvbmx5IElBY3Rpb25bXSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdF9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCxcblx0XHRcdF9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQsXG5cdFx0KSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhcHBseUVkaXRBbmRTaG93SWZOZWVkZWQocmFuZ2VzOiByZWFkb25seSBSYW5nZVtdLCBlZGl0czogRWRpdFNldDxUPiwgY2FuU2hvd1dpZGdldDogYm9vbGVhbiwgcmVzb2x2ZTogKGVkaXQ6IFQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxUPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0aWYgKCFyYW5nZXMubGVuZ3RoIHx8ICF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgZWRpdCA9IGVkaXRzLmFsbEVkaXRzLmF0KGVkaXRzLmFjdGl2ZUVkaXRJbmRleCk7XG5cdFx0aWYgKCFlZGl0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25EaWRTZWxlY3RFZGl0ID0gYXN5bmMgKG5ld0VkaXRJbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IG1vZGVsLnVuZG8oKTtcblx0XHRcdHRoaXMuYXBwbHlFZGl0QW5kU2hvd0lmTmVlZGVkKHJhbmdlcywgeyBhY3RpdmVFZGl0SW5kZXg6IG5ld0VkaXRJbmRleCwgYWxsRWRpdHM6IGVkaXRzLmFsbEVkaXRzIH0sIGNhblNob3dXaWRnZXQsIHJlc29sdmUsIHRva2VuKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGFuZGxlRXJyb3IgPSAoZTogRXJyb3IsIG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0aWYgKGNhblNob3dXaWRnZXQpIHtcblx0XHRcdFx0dGhpcy5zaG93KHJhbmdlc1swXSwgZWRpdHMsIG9uRGlkU2VsZWN0RWRpdCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXRvclN0YXRlQ3RzID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodGhpcy5fZWRpdG9yLCBDb2RlRWRpdG9yU3RhdGVGbGFnLlZhbHVlIHwgQ29kZUVkaXRvclN0YXRlRmxhZy5TZWxlY3Rpb24sIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHRcdGxldCByZXNvbHZlZEVkaXQ6IFQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVkRWRpdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihyZXNvbHZlKGVkaXQsIGVkaXRvclN0YXRlQ3RzLnRva2VuKSwgZWRpdG9yU3RhdGVDdHMudG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBoYW5kbGVFcnJvcihlLCBsb2NhbGl6ZSgncmVzb2x2ZUVycm9yJywgXCJFcnJvciByZXNvbHZpbmcgZWRpdCAnezB9JzpcXG57MX1cIiwgZWRpdC50aXRsZSwgdG9FcnJvck1lc3NhZ2UoZSkpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZWRpdG9yU3RhdGVDdHMuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbWJpbmVkV29ya3NwYWNlRWRpdCA9IGNyZWF0ZUNvbWJpbmVkV29ya3NwYWNlRWRpdChtb2RlbC51cmksIHJhbmdlcywgcmVzb2x2ZWRFZGl0KTtcblxuXHRcdC8vIFVzZSBhIGRlY29yYXRpb24gdG8gdHJhY2sgZWRpdHMgYXJvdW5kIHRoZSB0cmlnZ2VyIHJhbmdlXG5cdFx0Y29uc3QgcHJpbWFyeVJhbmdlID0gcmFuZ2VzWzBdO1xuXHRcdGNvbnN0IGVkaXRUcmFja2luZ0RlY29yYXRpb24gPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbe1xuXHRcdFx0cmFuZ2U6IHByaW1hcnlSYW5nZSxcblx0XHRcdG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdwYXN0ZS1saW5lLXN1ZmZpeCcsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyB9XG5cdFx0fV0pO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0bGV0IGVkaXRSZXN1bHQ6IElCdWxrRWRpdFJlc3VsdDtcblx0XHRsZXQgZWRpdFJhbmdlOiBSYW5nZSB8IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGVkaXRSZXN1bHQgPSBhd2FpdCB0aGlzLl9idWxrRWRpdFNlcnZpY2UuYXBwbHkoY29tYmluZWRXb3Jrc3BhY2VFZGl0LCB7IGVkaXRvcjogdGhpcy5fZWRpdG9yLCB0b2tlbiB9KTtcblx0XHRcdGVkaXRSYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShlZGl0VHJhY2tpbmdEZWNvcmF0aW9uWzBdKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlRXJyb3IoZSwgbG9jYWxpemUoJ2FwcGx5RXJyb3InLCBcIkVycm9yIGFwcGx5aW5nIGVkaXQgJ3swfSc6XFxuezF9XCIsIGVkaXQudGl0bGUsIHRvRXJyb3JNZXNzYWdlKGUpKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoZWRpdFRyYWNraW5nRGVjb3JhdGlvbiwgW10pO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjYW5TaG93V2lkZ2V0ICYmIGVkaXRSZXN1bHQuaXNBcHBsaWVkICYmIGVkaXRzLmFsbEVkaXRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHRoaXMuc2hvdyhlZGl0UmFuZ2UgPz8gcHJpbWFyeVJhbmdlLCBlZGl0cywgb25EaWRTZWxlY3RFZGl0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvdyhyYW5nZTogUmFuZ2UsIGVkaXRzOiBFZGl0U2V0PFQ+LCBvbkRpZFNlbGVjdEVkaXQ6IChuZXdJbmRleDogbnVtYmVyKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50V2lkZ2V0LnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUG9zdEVkaXRXaWRnZXQ8VD4sIHRoaXMuX2lkLCB0aGlzLl9lZGl0b3IsIHRoaXMuX3Zpc2libGVDb250ZXh0LCB0aGlzLl9zaG93Q29tbWFuZCwgcmFuZ2UsIGVkaXRzLCBvbkRpZFNlbGVjdEVkaXQsIHRoaXMuX2dldEFkZGl0aW9uYWxBY3Rpb25zKCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhcigpIHtcblx0XHR0aGlzLl9jdXJyZW50V2lkZ2V0LmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgdHJ5U2hvd1NlbGVjdG9yKCkge1xuXHRcdHRoaXMuX2N1cnJlbnRXaWRnZXQudmFsdWU/LnNob3dTZWxlY3RvcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFFdkIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0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
