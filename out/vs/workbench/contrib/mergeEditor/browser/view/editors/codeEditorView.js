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
import { h } from "../../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent } from "../../../../../../base/common/observable.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Selection } from "../../../../../../editor/common/core/selection.js";
import { CodeLensContribution } from "../../../../../../editor/contrib/codelens/browser/codelensController.js";
import { FoldingController } from "../../../../../../editor/contrib/folding/browser/folding.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from "../../../../../browser/parts/editor/editor.js";
import { setStyle } from "../../utils.js";
import { observableConfigValue } from "../../../../../../platform/observable/common/platformObservableUtils.js";
class CodeEditorView extends Disposable {
  constructor(instantiationService, viewModel, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.viewModel = viewModel;
    this.configurationService = configurationService;
    this.model = this.viewModel.map((m) => (
      /** @description model */
      m?.model
    ));
    this.htmlElements = h("div.code-view", [
      h("div.header@header", [
        h("span.title@title"),
        h("span.description@description"),
        h("span.detail@detail"),
        h("span.toolbar@toolbar")
      ]),
      h("div.container", [
        h("div.gutter@gutterDiv"),
        h("div@editor")
      ])
    ]);
    this._onDidViewChange = this._register(new Emitter());
    this.view = {
      element: this.htmlElements.root,
      minimumWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
      maximumWidth: DEFAULT_EDITOR_MAX_DIMENSIONS.width,
      minimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumHeight: DEFAULT_EDITOR_MAX_DIMENSIONS.height,
      onDidChange: this._onDidViewChange.event,
      layout: (width, height, top, left) => {
        setStyle(this.htmlElements.root, { width, height, top, left });
        this.editor.layout({
          width: width - this.htmlElements.gutterDiv.clientWidth,
          height: height - this.htmlElements.header.clientHeight
        });
      }
      // preferredWidth?: number | undefined;
      // preferredHeight?: number | undefined;
      // priority?: LayoutPriority | undefined;
      // snap?: boolean | undefined;
    };
    this.checkboxesVisible = observableConfigValue("mergeEditor.showCheckboxes", false, this.configurationService);
    this.showDeletionMarkers = observableConfigValue("mergeEditor.showDeletionMarkers", true, this.configurationService);
    this.useSimplifiedDecorations = observableConfigValue("mergeEditor.useSimplifiedDecorations", false, this.configurationService);
    this.editor = this.instantiationService.createInstance(
      CodeEditorWidget,
      this.htmlElements.editor,
      {},
      {
        contributions: this.getEditorContributions()
      }
    );
    this.isFocused = observableFromEvent(
      this,
      Event.any(this.editor.onDidBlurEditorWidget, this.editor.onDidFocusEditorWidget),
      () => (
        /** @description editor.hasWidgetFocus */
        this.editor.hasWidgetFocus()
      )
    );
    this.cursorPosition = observableFromEvent(
      this,
      this.editor.onDidChangeCursorPosition,
      () => (
        /** @description editor.getPosition */
        this.editor.getPosition()
      )
    );
    this.selection = observableFromEvent(
      this,
      this.editor.onDidChangeCursorSelection,
      () => (
        /** @description editor.getSelections */
        this.editor.getSelections()
      )
    );
    this.cursorLineNumber = this.cursorPosition.map((p) => (
      /** @description cursorPosition.lineNumber */
      p?.lineNumber
    ));
  }
  updateOptions(newOptions) {
    this.editor.updateOptions(newOptions);
  }
  getEditorContributions() {
    return EditorExtensionsRegistry.getEditorContributions().filter((c) => c.id !== FoldingController.ID && c.id !== CodeLensContribution.ID);
  }
}
function createSelectionsAutorun(codeEditorView, translateRange) {
  const selections = derived((reader) => {
    const viewModel = codeEditorView.viewModel.read(reader);
    if (!viewModel) {
      return [];
    }
    const baseRange = viewModel.selectionInBase.read(reader);
    if (!baseRange || baseRange.sourceEditor === codeEditorView) {
      return [];
    }
    return baseRange.rangesInBase.map((r) => translateRange(r, viewModel));
  });
  return autorun((reader) => {
    const ranges = selections.read(reader);
    if (ranges.length === 0) {
      return;
    }
    codeEditorView.editor.setSelections(ranges.map((r) => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)));
  });
}
let TitleMenu = class extends Disposable {
  constructor(menuId, targetHtmlElement, instantiationService) {
    super();
    const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, targetHtmlElement, menuId, {
      menuOptions: { renderShortTitle: true },
      toolbarOptions: { primaryGroup: (g) => g === "primary" }
    });
    this._store.add(toolbar);
  }
};
TitleMenu = __decorateClass([
  __decorateParam(2, IInstantiationService)
], TitleMenu);
export {
  CodeEditorView,
  TitleMenu,
  createSelectionsAutorun
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvdmlldy9lZGl0b3JzL2NvZGVFZGl0b3JWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSVZpZXcsIElWaWV3U2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biwgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVMZW5zQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZWxlbnMvYnJvd3Nlci9jb2RlbGVuc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRURJVE9SX01BWF9ESU1FTlNJT05TLCBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBzZXRTdHlsZSB9IGZyb20gJy4uLy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvZGVFZGl0b3JWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG1vZGVsO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBodG1sRWxlbWVudHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRWaWV3Q2hhbmdlO1xuXG5cdHB1YmxpYyByZWFkb25seSB2aWV3OiBJVmlldztcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY2hlY2tib3hlc1Zpc2libGU7XG5cdHByb3RlY3RlZCByZWFkb25seSBzaG93RGVsZXRpb25NYXJrZXJzO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlU2ltcGxpZmllZERlY29yYXRpb25zO1xuXG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3I7XG5cblx0cHVibGljIHVwZGF0ZU9wdGlvbnMobmV3T3B0aW9uczogUmVhZG9ubHk8SUVkaXRvck9wdGlvbnM+KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBpc0ZvY3VzZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGN1cnNvclBvc2l0aW9uO1xuXG5cdHB1YmxpYyByZWFkb25seSBzZWxlY3Rpb247XG5cblx0cHVibGljIHJlYWRvbmx5IGN1cnNvckxpbmVOdW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3TW9kZWw6IElPYnNlcnZhYmxlPHVuZGVmaW5lZCB8IE1lcmdlRWRpdG9yVmlld01vZGVsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5tb2RlbCA9IHRoaXMudmlld01vZGVsLm1hcChtID0+IC8qKiBAZGVzY3JpcHRpb24gbW9kZWwgKi8gbT8ubW9kZWwpO1xuXHRcdHRoaXMuaHRtbEVsZW1lbnRzID0gaCgnZGl2LmNvZGUtdmlldycsIFtcblx0XHRcdGgoJ2Rpdi5oZWFkZXJAaGVhZGVyJywgW1xuXHRcdFx0XHRoKCdzcGFuLnRpdGxlQHRpdGxlJyksXG5cdFx0XHRcdGgoJ3NwYW4uZGVzY3JpcHRpb25AZGVzY3JpcHRpb24nKSxcblx0XHRcdFx0aCgnc3Bhbi5kZXRhaWxAZGV0YWlsJyksXG5cdFx0XHRcdGgoJ3NwYW4udG9vbGJhckB0b29sYmFyJyksXG5cdFx0XHRdKSxcblx0XHRcdGgoJ2Rpdi5jb250YWluZXInLCBbXG5cdFx0XHRcdGgoJ2Rpdi5ndXR0ZXJAZ3V0dGVyRGl2JyksXG5cdFx0XHRcdGgoJ2RpdkBlZGl0b3InKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXHRcdHRoaXMuX29uRGlkVmlld0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWaWV3U2l6ZSB8IHVuZGVmaW5lZD4oKSk7XG5cdFx0dGhpcy52aWV3ID0ge1xuXHRcdFx0ZWxlbWVudDogdGhpcy5odG1sRWxlbWVudHMucm9vdCxcblx0XHRcdG1pbmltdW1XaWR0aDogREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMud2lkdGgsXG5cdFx0XHRtYXhpbXVtV2lkdGg6IERFRkFVTFRfRURJVE9SX01BWF9ESU1FTlNJT05TLndpZHRoLFxuXHRcdFx0bWluaW11bUhlaWdodDogREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMuaGVpZ2h0LFxuXHRcdFx0bWF4aW11bUhlaWdodDogREVGQVVMVF9FRElUT1JfTUFYX0RJTUVOU0lPTlMuaGVpZ2h0LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX29uRGlkVmlld0NoYW5nZS5ldmVudCxcblx0XHRcdGxheW91dDogKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHNldFN0eWxlKHRoaXMuaHRtbEVsZW1lbnRzLnJvb3QsIHsgd2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0IH0pO1xuXHRcdFx0XHR0aGlzLmVkaXRvci5sYXlvdXQoe1xuXHRcdFx0XHRcdHdpZHRoOiB3aWR0aCAtIHRoaXMuaHRtbEVsZW1lbnRzLmd1dHRlckRpdi5jbGllbnRXaWR0aCxcblx0XHRcdFx0XHRoZWlnaHQ6IGhlaWdodCAtIHRoaXMuaHRtbEVsZW1lbnRzLmhlYWRlci5jbGllbnRIZWlnaHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gcHJlZmVycmVkV2lkdGg/OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHQvLyBwcmVmZXJyZWRIZWlnaHQ/OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHQvLyBwcmlvcml0eT86IExheW91dFByaW9yaXR5IHwgdW5kZWZpbmVkO1xuXHRcdFx0Ly8gc25hcD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHR0aGlzLmNoZWNrYm94ZXNWaXNpYmxlID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KCdtZXJnZUVkaXRvci5zaG93Q2hlY2tib3hlcycsIGZhbHNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnNob3dEZWxldGlvbk1hcmtlcnMgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oJ21lcmdlRWRpdG9yLnNob3dEZWxldGlvbk1hcmtlcnMnLCB0cnVlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnVzZVNpbXBsaWZpZWREZWNvcmF0aW9ucyA9IG9ic2VydmFibGVDb25maWdWYWx1ZTxib29sZWFuPignbWVyZ2VFZGl0b3IudXNlU2ltcGxpZmllZERlY29yYXRpb25zJywgZmFsc2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdG9yID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHR0aGlzLmh0bWxFbGVtZW50cy5lZGl0b3IsXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y29udHJpYnV0aW9uczogdGhpcy5nZXRFZGl0b3JDb250cmlidXRpb25zKCksXG5cdFx0XHR9XG5cdFx0KTtcblx0XHR0aGlzLmlzRm9jdXNlZCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdEV2ZW50LmFueSh0aGlzLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQsIHRoaXMuZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQpLFxuXHRcdFx0KCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBlZGl0b3IuaGFzV2lkZ2V0Rm9jdXMgKi8gdGhpcy5lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKVxuXHRcdCk7XG5cdFx0dGhpcy5jdXJzb3JQb3NpdGlvbiA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24sXG5cdFx0XHQoKSA9PiAvKiogQGRlc2NyaXB0aW9uIGVkaXRvci5nZXRQb3NpdGlvbiAqLyB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpXG5cdFx0KTtcblx0XHR0aGlzLnNlbGVjdGlvbiA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uLFxuXHRcdFx0KCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBlZGl0b3IuZ2V0U2VsZWN0aW9ucyAqLyB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKClcblx0XHQpO1xuXHRcdHRoaXMuY3Vyc29yTGluZU51bWJlciA9IHRoaXMuY3Vyc29yUG9zaXRpb24ubWFwKHAgPT4gLyoqIEBkZXNjcmlwdGlvbiBjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyICovIHA/LmxpbmVOdW1iZXIpO1xuXG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpOiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCkuZmlsdGVyKGMgPT4gYy5pZCAhPT0gRm9sZGluZ0NvbnRyb2xsZXIuSUQgJiYgYy5pZCAhPT0gQ29kZUxlbnNDb250cmlidXRpb24uSUQpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZWxlY3Rpb25zQXV0b3J1bihcblx0Y29kZUVkaXRvclZpZXc6IENvZGVFZGl0b3JWaWV3LFxuXHR0cmFuc2xhdGVSYW5nZTogKGJhc2VSYW5nZTogUmFuZ2UsIHZpZXdNb2RlbDogTWVyZ2VFZGl0b3JWaWV3TW9kZWwpID0+IFJhbmdlXG4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHNlbGVjdGlvbnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0LyoqIEBkZXNjcmlwdGlvbiBzZWxlY3Rpb25zICovXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gY29kZUVkaXRvclZpZXcudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBiYXNlUmFuZ2UgPSB2aWV3TW9kZWwuc2VsZWN0aW9uSW5CYXNlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWJhc2VSYW5nZSB8fCBiYXNlUmFuZ2Uuc291cmNlRWRpdG9yID09PSBjb2RlRWRpdG9yVmlldykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZVJhbmdlLnJhbmdlc0luQmFzZS5tYXAociA9PiB0cmFuc2xhdGVSYW5nZShyLCB2aWV3TW9kZWwpKTtcblx0fSk7XG5cblx0cmV0dXJuIGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHQvKiogQGRlc2NyaXB0aW9uIHNldCBzZWxlY3Rpb25zICovXG5cdFx0Y29uc3QgcmFuZ2VzID0gc2VsZWN0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29kZUVkaXRvclZpZXcuZWRpdG9yLnNldFNlbGVjdGlvbnMocmFuZ2VzLm1hcChyID0+IG5ldyBTZWxlY3Rpb24oci5zdGFydExpbmVOdW1iZXIsIHIuc3RhcnRDb2x1bW4sIHIuZW5kTGluZU51bWJlciwgci5lbmRDb2x1bW4pKSk7XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgVGl0bGVNZW51IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lbnVJZDogTWVudUlkLFxuXHRcdHRhcmdldEh0bWxFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB0b29sYmFyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRhcmdldEh0bWxFbGVtZW50LCBtZW51SWQsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKGcpID0+IGcgPT09ICdwcmltYXJ5JyB9XG5cdFx0fSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvb2xiYXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUztBQUVsQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFzQixTQUFTLFNBQVMsMkJBQTJCO0FBQ25FLFNBQVMsZ0NBQWdFO0FBQ3pFLFNBQVMsd0JBQXdCO0FBR2pDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCLHFDQUFxQztBQUM3RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUcvQixNQUFlLHVCQUF1QixXQUFXO0FBQUEsRUEyQnZELFlBQ2tCLHNCQUNELFdBQ0Msc0JBQ2hCO0FBQ0QsVUFBTTtBQUpXO0FBQ0Q7QUFDQztBQUdqQixTQUFLLFFBQVEsS0FBSyxVQUFVLElBQUk7QUFBQTtBQUFBLE1BQStCLEdBQUc7QUFBQSxLQUFLO0FBQ3ZFLFNBQUssZUFBZSxF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
