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
import { assertNever } from "../../../../base/common/assert.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { Constants } from "../../../../base/common/uint.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ClickLinkGesture } from "../../../../editor/contrib/gotoSymbol/browser/link/clickLinkGesture.js";
import { localize, localize2 } from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { ResourceLabel } from "../../../browser/labels.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { makeStackFrameColumnDecoration, TOP_STACK_FRAME_DECORATION } from "./callStackEditorContribution.js";
import "./media/callStackWidget.css";
class CallStackFrame {
  constructor(name, source, line = 1, column = 1) {
    this.name = name;
    this.source = source;
    this.line = line;
    this.column = column;
  }
}
class SkippedCallFrames {
  constructor(label, load) {
    this.label = label;
    this.load = load;
  }
}
class CustomStackFrame {
  constructor() {
    this.showHeader = observableValue("CustomStackFrame.showHeader", true);
  }
}
class WrappedCallStackFrame extends CallStackFrame {
  constructor(original) {
    super(original.name, original.source, original.line, original.column);
    this.editorHeight = observableValue("WrappedCallStackFrame.height", this.source ? 100 : 0);
    this.collapsed = observableValue("WrappedCallStackFrame.collapsed", false);
    this.height = derived((reader) => {
      return this.collapsed.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : CALL_STACK_WIDGET_HEADER_HEIGHT + this.editorHeight.read(reader);
    });
  }
}
class WrappedCustomStackFrame {
  constructor(original) {
    this.original = original;
    this.collapsed = observableValue("WrappedCallStackFrame.collapsed", false);
    this.height = derived((reader) => {
      const headerHeight = this.original.showHeader.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0;
      return this.collapsed.read(reader) ? headerHeight : headerHeight + this.original.height.read(reader);
    });
  }
}
const isFrameLike = (item) => item instanceof WrappedCallStackFrame || item instanceof WrappedCustomStackFrame;
const WIDGET_CLASS_NAME = "multiCallStackWidget";
let CallStackWidget = class extends Disposable {
  constructor(container, containingEditor, instantiationService) {
    super();
    this.layoutEmitter = this._register(new Emitter());
    this.currentFramesDs = this._register(new DisposableStore());
    container.classList.add(WIDGET_CLASS_NAME);
    this._register(toDisposable(() => container.classList.remove(WIDGET_CLASS_NAME)));
    this.list = this._register(instantiationService.createInstance(
      WorkbenchList,
      "TestResultStackWidget",
      container,
      new StackDelegate(),
      [
        instantiationService.createInstance(FrameCodeRenderer, containingEditor, this.layoutEmitter.event),
        instantiationService.createInstance(MissingCodeRenderer),
        instantiationService.createInstance(CustomRenderer),
        instantiationService.createInstance(SkippedRenderer, (i) => this.loadFrame(i))
      ],
      {
        multipleSelectionSupport: false,
        mouseSupport: false,
        keyboardSupport: false,
        setRowLineHeight: false,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: instantiationService.createInstance(StackAccessibilityProvider)
      }
    ));
  }
  get onDidChangeContentHeight() {
    return this.list.onDidChangeContentHeight;
  }
  get onDidScroll() {
    return this.list.onDidScroll;
  }
  get contentHeight() {
    return this.list.contentHeight;
  }
  /** Replaces the call frames display in the view. */
  setFrames(frames) {
    this.currentFramesDs.clear();
    const cts = new CancellationTokenSource();
    this.currentFramesDs.add(toDisposable(() => cts.dispose(true)));
    this.cts = cts;
    this.list.splice(0, this.list.length, this.mapFrames(frames));
  }
  layout(height, width) {
    this.list.layout(height, width);
    this.layoutEmitter.fire();
  }
  collapseAll() {
    transaction((tx) => {
      for (let i = 0; i < this.list.length; i++) {
        const frame = this.list.element(i);
        if (isFrameLike(frame)) {
          frame.collapsed.set(true, tx);
        }
      }
    });
  }
  async loadFrame(replacing) {
    if (!this.cts) {
      return;
    }
    const frames = await replacing.load(this.cts.token);
    if (this.cts.token.isCancellationRequested) {
      return;
    }
    const index = this.list.indexOf(replacing);
    this.list.splice(index, 1, this.mapFrames(frames));
  }
  mapFrames(frames) {
    const result = [];
    for (const frame of frames) {
      if (frame instanceof SkippedCallFrames) {
        result.push(frame);
        continue;
      }
      const wrapped = frame instanceof CustomStackFrame ? new WrappedCustomStackFrame(frame) : new WrappedCallStackFrame(frame);
      result.push(wrapped);
      this.currentFramesDs.add(autorun((reader) => {
        const height = wrapped.height.read(reader);
        const idx = this.list.indexOf(wrapped);
        if (idx !== -1) {
          this.list.updateElementHeight(idx, height);
        }
      }));
    }
    return result;
  }
};
CallStackWidget = __decorateClass([
  __decorateParam(2, IInstantiationService)
], CallStackWidget);
let StackAccessibilityProvider = class {
  constructor(labelService) {
    this.labelService = labelService;
  }
  getAriaLabel(e) {
    if (e instanceof SkippedCallFrames) {
      return e.label;
    }
    if (e instanceof WrappedCustomStackFrame) {
      return e.original.label;
    }
    if (e instanceof CallStackFrame) {
      if (e.source && e.line) {
        return localize({
          comment: ["{0} is an extension-defined label, then line number and filename"],
          key: "stackTraceLabel"
        }, "{0}, line {1} in {2}", e.name, e.line, this.labelService.getUriLabel(e.source, { relative: true }));
      }
      return e.name;
    }
    assertNever(e);
  }
  getWidgetAriaLabel() {
    return localize("stackTrace", "Stack Trace");
  }
};
StackAccessibilityProvider = __decorateClass([
  __decorateParam(0, ILabelService)
], StackAccessibilityProvider);
class StackDelegate {
  getHeight(element) {
    if (element instanceof CallStackFrame || element instanceof WrappedCustomStackFrame) {
      return element.height.get();
    }
    if (element instanceof SkippedCallFrames) {
      return CALL_STACK_WIDGET_HEADER_HEIGHT;
    }
    assertNever(element);
  }
  getTemplateId(element) {
    if (element instanceof CallStackFrame) {
      return element.source ? FrameCodeRenderer.templateId : MissingCodeRenderer.templateId;
    }
    if (element instanceof SkippedCallFrames) {
      return SkippedRenderer.templateId;
    }
    if (element instanceof WrappedCustomStackFrame) {
      return CustomRenderer.templateId;
    }
    assertNever(element);
  }
}
const editorOptions = {
  scrollBeyondLastLine: false,
  scrollbar: {
    vertical: "hidden",
    horizontal: "hidden",
    handleMouseWheel: false,
    useShadows: false
  },
  overviewRulerLanes: 0,
  fixedOverflowWidgets: true,
  overviewRulerBorder: false,
  stickyScroll: { enabled: false },
  minimap: { enabled: false },
  readOnly: true,
  automaticLayout: false
};
const makeFrameElements = () => dom.h("div.multiCallStackFrame", [
  dom.h("div.header@header", [
    dom.h("div.collapse-button@collapseButton"),
    dom.h("div.title.show-file-icons@title"),
    dom.h("div.actions@actions")
  ]),
  dom.h("div.editorParent", [
    dom.h("div.editorContainer@editor")
  ])
]);
const CALL_STACK_WIDGET_HEADER_HEIGHT = 24;
let AbstractFrameRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  renderTemplate(container) {
    const elements = makeFrameElements();
    container.appendChild(elements.root);
    const templateStore = new DisposableStore();
    container.classList.add("multiCallStackFrameContainer");
    templateStore.add(toDisposable(() => {
      container.classList.remove("multiCallStackFrameContainer");
      elements.root.remove();
    }));
    const label = templateStore.add(this.instantiationService.createInstance(ResourceLabel, elements.title, {}));
    const collapse = templateStore.add(new Button(elements.collapseButton, {}));
    const contentId = generateUuid();
    elements.editor.id = contentId;
    elements.editor.role = "region";
    elements.collapseButton.setAttribute("aria-controls", contentId);
    return this.finishRenderTemplate({
      container,
      decorations: [],
      elements,
      label,
      collapse,
      elementStore: templateStore.add(new DisposableStore()),
      templateStore
    });
  }
  renderElement(element, index, template) {
    const { elementStore } = template;
    elementStore.clear();
    const item = element;
    this.setupCollapseButton(item, template);
  }
  setupCollapseButton(item, { elementStore, elements, collapse }) {
    elementStore.add(autorun((reader) => {
      collapse.element.className = "";
      const collapsed = item.collapsed.read(reader);
      collapse.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      collapse.element.ariaExpanded = String(!collapsed);
      elements.root.classList.toggle("collapsed", collapsed);
    }));
    const toggleCollapse = () => item.collapsed.set(!item.collapsed.get(), void 0);
    elementStore.add(collapse.onDidClick(toggleCollapse));
    elementStore.add(dom.addDisposableListener(elements.title, "click", toggleCollapse));
  }
  disposeElement(element, index, templateData) {
    templateData.elementStore.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateStore.dispose();
  }
};
AbstractFrameRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AbstractFrameRenderer);
const CONTEXT_LINES = 2;
let FrameCodeRenderer = class extends AbstractFrameRenderer {
  constructor(containingEditor, onLayout, modelService, instantiationService) {
    super(instantiationService);
    this.containingEditor = containingEditor;
    this.onLayout = onLayout;
    this.modelService = modelService;
    this.templateId = FrameCodeRenderer.templateId;
  }
  finishRenderTemplate(data) {
    const contributions = [{
      id: ClickToLocationContribution.ID,
      instantiation: EditorContributionInstantiation.BeforeFirstInteraction,
      ctor: ClickToLocationContribution
    }];
    const editor = this.containingEditor ? this.instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      data.elements.editor,
      editorOptions,
      { isSimpleWidget: true, contributions },
      this.containingEditor
    ) : this.instantiationService.createInstance(
      CodeEditorWidget,
      data.elements.editor,
      editorOptions,
      { isSimpleWidget: true, contributions }
    );
    data.templateStore.add(editor);
    const toolbar = data.templateStore.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, data.elements.actions, MenuId.DebugCallStackToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
    }));
    return { ...data, editor, toolbar };
  }
  renderElement(element, index, template) {
    super.renderElement(element, index, template);
    const { elementStore, editor } = template;
    const item = element;
    const uri = item.source;
    template.label.element.setFile(uri);
    const cts = new CancellationTokenSource();
    elementStore.add(toDisposable(() => cts.dispose(true)));
    this.modelService.createModelReference(uri).then((reference) => {
      if (cts.token.isCancellationRequested) {
        return reference.dispose();
      }
      elementStore.add(reference);
      editor.setModel(reference.object.textEditorModel);
      this.setupEditorAfterModel(item, template);
      this.setupEditorLayout(item, template);
    });
  }
  setupEditorLayout(item, { elementStore, container, editor }) {
    const layout = () => {
      const prev = editor.getContentHeight();
      editor.layout({ width: container.clientWidth, height: prev });
      const next = editor.getContentHeight();
      if (next !== prev) {
        editor.layout({ width: container.clientWidth, height: next });
      }
      item.editorHeight.set(next, void 0);
    };
    elementStore.add(editor.onDidChangeModelDecorations(layout));
    elementStore.add(editor.onDidChangeModelContent(layout));
    elementStore.add(editor.onDidChangeModelOptions(layout));
    elementStore.add(this.onLayout(layout));
    layout();
  }
  setupEditorAfterModel(item, template) {
    const range = Range.fromPositions({
      column: item.column ?? 1,
      lineNumber: item.line ?? 1
    });
    template.toolbar.context = { uri: item.source, range };
    template.editor.setHiddenAreas([
      Range.fromPositions(
        { column: 1, lineNumber: 1 },
        { column: 1, lineNumber: Math.max(1, item.line - CONTEXT_LINES - 1) }
      ),
      Range.fromPositions(
        { column: 1, lineNumber: item.line + CONTEXT_LINES + 1 },
        { column: 1, lineNumber: Constants.MAX_SAFE_SMALL_INTEGER }
      )
    ]);
    template.editor.changeDecorations((accessor) => {
      for (const d of template.decorations) {
        accessor.removeDecoration(d);
      }
      template.decorations.length = 0;
      const beforeRange = range.setStartPosition(range.startLineNumber, 1);
      const hasCharactersBefore = !!template.editor.getModel()?.getValueInRange(beforeRange).trim();
      const decoRange = range.setEndPosition(range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
      template.decorations.push(accessor.addDecoration(
        decoRange,
        makeStackFrameColumnDecoration(!hasCharactersBefore)
      ));
      template.decorations.push(accessor.addDecoration(
        decoRange,
        TOP_STACK_FRAME_DECORATION
      ));
    });
    item.editorHeight.set(template.editor.getContentHeight(), void 0);
  }
};
FrameCodeRenderer.templateId = "f";
FrameCodeRenderer = __decorateClass([
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IInstantiationService)
], FrameCodeRenderer);
let MissingCodeRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = MissingCodeRenderer.templateId;
  }
  renderTemplate(container) {
    const elements = makeFrameElements();
    elements.root.classList.add("missing");
    container.appendChild(elements.root);
    const label = this.instantiationService.createInstance(ResourceLabel, elements.title, {});
    return { elements, label };
  }
  renderElement(element, _index, templateData) {
    const cast = element;
    templateData.label.element.setResource({
      name: cast.name,
      description: localize("stackFrameLocation", "Line {0} column {1}", cast.line, cast.column),
      range: { startLineNumber: cast.line, startColumn: cast.column, endColumn: cast.column, endLineNumber: cast.line }
    }, {
      icon: Codicon.fileBinary
    });
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
    templateData.elements.root.remove();
  }
};
MissingCodeRenderer.templateId = "m";
MissingCodeRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], MissingCodeRenderer);
const _CustomRenderer = class _CustomRenderer extends AbstractFrameRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _CustomRenderer.templateId;
  }
  finishRenderTemplate(data) {
    return data;
  }
  renderElement(element, index, template) {
    super.renderElement(element, index, template);
    const item = element;
    const { elementStore, container, label } = template;
    label.element.setResource({ name: item.original.label }, { icon: item.original.icon });
    elementStore.add(autorun((reader) => {
      template.elements.header.style.display = item.original.showHeader.read(reader) ? "" : "none";
    }));
    elementStore.add(autorunWithStore((reader, store) => {
      if (!item.collapsed.read(reader)) {
        store.add(item.original.render(container));
      }
    }));
    const actions = item.original.renderActions?.(template.elements.actions);
    if (actions) {
      elementStore.add(actions);
    }
  }
};
_CustomRenderer.templateId = "c";
let CustomRenderer = _CustomRenderer;
let SkippedRenderer = class {
  constructor(loadFrames, notificationService) {
    this.loadFrames = loadFrames;
    this.notificationService = notificationService;
    this.templateId = SkippedRenderer.templateId;
  }
  renderTemplate(container) {
    const store = new DisposableStore();
    const button = new Button(container, { title: "", ...defaultButtonStyles });
    const data = { button, store };
    store.add(button);
    store.add(button.onDidClick(() => {
      if (!data.current || !button.enabled) {
        return;
      }
      button.enabled = false;
      this.loadFrames(data.current).catch((e) => {
        this.notificationService.error(localize("failedToLoadFrames", "Failed to load stack frames: {0}", e.message));
      });
    }));
    return data;
  }
  renderElement(element, index, templateData) {
    const cast = element;
    templateData.button.enabled = true;
    templateData.button.label = cast.label;
    templateData.current = cast;
  }
  disposeTemplate(templateData) {
    templateData.store.dispose();
  }
};
SkippedRenderer.templateId = "s";
SkippedRenderer = __decorateClass([
  __decorateParam(1, INotificationService)
], SkippedRenderer);
let ClickToLocationContribution = class extends Disposable {
  constructor(editor, editorService) {
    super();
    this.editor = editor;
    this.linkDecorations = editor.createDecorationsCollection();
    this._register(toDisposable(() => this.linkDecorations.clear()));
    const clickLinkGesture = this._register(new ClickLinkGesture(editor));
    this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
      this.onMove(mouseEvent);
    }));
    this._register(clickLinkGesture.onExecute((e) => {
      const model = this.editor.getModel();
      if (!this.current || !model) {
        return;
      }
      editorService.openEditor({
        resource: model.uri,
        options: {
          selection: Range.fromPositions(new Position(this.current.line, this.current.word.startColumn)),
          selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
        }
      }, e.hasSideBySideModifier ? SIDE_GROUP : void 0);
    }));
  }
  onMove(mouseEvent) {
    if (!mouseEvent.hasTriggerModifier) {
      return this.clear();
    }
    const position = mouseEvent.target.position;
    const word = position && this.editor.getModel()?.getWordAtPosition(position);
    if (!word) {
      return this.clear();
    }
    const prev = this.current?.word;
    if (prev && prev.startColumn === word.startColumn && prev.endColumn === word.endColumn && prev.word === word.word) {
      return;
    }
    this.current = { word, line: position.lineNumber };
    this.linkDecorations.set([{
      range: new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      options: {
        description: "call-stack-go-to-file-link",
        inlineClassName: "call-stack-go-to-file-link"
      }
    }]);
  }
  clear() {
    this.linkDecorations.clear();
    this.current = void 0;
  }
};
ClickToLocationContribution.ID = "clickToLocation";
ClickToLocationContribution = __decorateClass([
  __decorateParam(1, IEditorService)
], ClickToLocationContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "callStackWidget.goToFile",
      title: localize2("goToFile", "Open File"),
      icon: Codicon.goToFile,
      menu: {
        id: MenuId.DebugCallStackToolbar,
        order: 22,
        group: "navigation"
      }
    });
  }
  async run(accessor, { uri, range }) {
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: uri,
      options: {
        selection: range,
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
  }
});
export {
  CALL_STACK_WIDGET_HEADER_HEIGHT,
  CallStackFrame,
  CallStackWidget,
  CustomStackFrame,
  SkippedCallFrames
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvY2FsbFN0YWNrV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udHJpYnV0aW9uQ3RvciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xpY2tMaW5rR2VzdHVyZSwgQ2xpY2tMaW5rTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9saW5rL2NsaWNrTGlua0dlc3R1cmUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFrZVN0YWNrRnJhbWVDb2x1bW5EZWNvcmF0aW9uLCBUT1BfU1RBQ0tfRlJBTUVfREVDT1JBVElPTiB9IGZyb20gJy4vY2FsbFN0YWNrRWRpdG9yQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi9tZWRpYS9jYWxsU3RhY2tXaWRnZXQuY3NzJztcblxuXG5leHBvcnQgY2xhc3MgQ2FsbFN0YWNrRnJhbWUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBzb3VyY2U/OiBVUkksXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmUgPSAxLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb2x1bW4gPSAxLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgU2tpcHBlZENhbGxGcmFtZXMge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbG9hZDogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxBbnlTdGFja0ZyYW1lW10+LFxuXHQpIHsgfVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ3VzdG9tU3RhY2tGcmFtZSB7XG5cdHB1YmxpYyByZWFkb25seSBzaG93SGVhZGVyID0gb2JzZXJ2YWJsZVZhbHVlKCdDdXN0b21TdGFja0ZyYW1lLnNob3dIZWFkZXInLCB0cnVlKTtcblx0cHVibGljIGFic3RyYWN0IHJlYWRvbmx5IGhlaWdodDogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHVibGljIGFic3RyYWN0IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHB1YmxpYyBpY29uPzogVGhlbWVJY29uO1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZTtcblx0cHVibGljIHJlbmRlckFjdGlvbnM/KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZTtcbn1cblxuZXhwb3J0IHR5cGUgQW55U3RhY2tGcmFtZSA9IFNraXBwZWRDYWxsRnJhbWVzIHwgQ2FsbFN0YWNrRnJhbWUgfCBDdXN0b21TdGFja0ZyYW1lO1xuXG5pbnRlcmZhY2UgSUZyYW1lTGlrZUl0ZW0ge1xuXHRyZWFkb25seSBjb2xsYXBzZWQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGhlaWdodDogSU9ic2VydmFibGU8bnVtYmVyPjtcbn1cblxuY2xhc3MgV3JhcHBlZENhbGxTdGFja0ZyYW1lIGV4dGVuZHMgQ2FsbFN0YWNrRnJhbWUgaW1wbGVtZW50cyBJRnJhbWVMaWtlSXRlbSB7XG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3JIZWlnaHQgPSBvYnNlcnZhYmxlVmFsdWUoJ1dyYXBwZWRDYWxsU3RhY2tGcmFtZS5oZWlnaHQnLCB0aGlzLnNvdXJjZSA/IDEwMCA6IDApO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29sbGFwc2VkID0gb2JzZXJ2YWJsZVZhbHVlKCdXcmFwcGVkQ2FsbFN0YWNrRnJhbWUuY29sbGFwc2VkJywgZmFsc2UpO1xuXG5cdHB1YmxpYyByZWFkb25seSBoZWlnaHQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IENBTExfU1RBQ0tfV0lER0VUX0hFQURFUl9IRUlHSFQgOiBDQUxMX1NUQUNLX1dJREdFVF9IRUFERVJfSEVJR0hUICsgdGhpcy5lZGl0b3JIZWlnaHQucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3RvcihvcmlnaW5hbDogQ2FsbFN0YWNrRnJhbWUpIHtcblx0XHRzdXBlcihvcmlnaW5hbC5uYW1lLCBvcmlnaW5hbC5zb3VyY2UsIG9yaWdpbmFsLmxpbmUsIG9yaWdpbmFsLmNvbHVtbik7XG5cdH1cbn1cblxuY2xhc3MgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWUgaW1wbGVtZW50cyBJRnJhbWVMaWtlSXRlbSB7XG5cdHB1YmxpYyByZWFkb25seSBjb2xsYXBzZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ1dyYXBwZWRDYWxsU3RhY2tGcmFtZS5jb2xsYXBzZWQnLCBmYWxzZSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGhlaWdodCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLm9yaWdpbmFsLnNob3dIZWFkZXIucmVhZChyZWFkZXIpID8gQ0FMTF9TVEFDS19XSURHRVRfSEVBREVSX0hFSUdIVCA6IDA7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IGhlYWRlckhlaWdodCA6IGhlYWRlckhlaWdodCArIHRoaXMub3JpZ2luYWwuaGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG9yaWdpbmFsOiBDdXN0b21TdGFja0ZyYW1lKSB7IH1cbn1cblxuY29uc3QgaXNGcmFtZUxpa2UgPSAoaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSUZyYW1lTGlrZUl0ZW0gPT5cblx0aXRlbSBpbnN0YW5jZW9mIFdyYXBwZWRDYWxsU3RhY2tGcmFtZSB8fCBpdGVtIGluc3RhbmNlb2YgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWU7XG5cbnR5cGUgTGlzdEl0ZW0gPSBXcmFwcGVkQ2FsbFN0YWNrRnJhbWUgfCBTa2lwcGVkQ2FsbEZyYW1lcyB8IFdyYXBwZWRDdXN0b21TdGFja0ZyYW1lO1xuXG5jb25zdCBXSURHRVRfQ0xBU1NfTkFNRSA9ICdtdWx0aUNhbGxTdGFja1dpZGdldCc7XG5cbi8qKlxuICogQSByZXVzYWJsZSB3aWRnZXQgdGhhdCBkaXNwbGF5cyBhIGNhbGwgc3RhY2sgYXMgYSBzZXJpZXMgb2YgZWRpdG9ycy4gTm90ZVxuICogdGhhdCB0aGlzIGJvdGggdXNlZCBpbiBkZWJ1ZydzIGV4Y2VwdGlvbiB3aWRnZXQgYXMgd2VsbCBhcyBpbiB0aGUgdGVzdGluZ1xuICogY2FsbCBzdGFjayB2aWV3LlxuICovXG5leHBvcnQgY2xhc3MgQ2FsbFN0YWNrV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGlzdDogV29ya2JlbmNoTGlzdDxMaXN0SXRlbT47XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRGcmFtZXNEcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgY3RzPzogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cblx0cHVibGljIGdldCBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU2Nyb2xsKCkge1xuXHRcdHJldHVybiB0aGlzLmxpc3Qub25EaWRTY3JvbGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbnRlbnRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdC5jb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250YWluaW5nRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChXSURHRVRfQ0xBU1NfTkFNRSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFdJREdFVF9DTEFTU19OQU1FKSkpO1xuXG5cdFx0dGhpcy5saXN0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0LFxuXHRcdFx0J1Rlc3RSZXN1bHRTdGFja1dpZGdldCcsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgU3RhY2tEZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGcmFtZUNvZGVSZW5kZXJlciwgY29udGFpbmluZ0VkaXRvciwgdGhpcy5sYXlvdXRFbWl0dGVyLmV2ZW50KSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWlzc2luZ0NvZGVSZW5kZXJlciksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbVJlbmRlcmVyKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2tpcHBlZFJlbmRlcmVyLCAoaSkgPT4gdGhpcy5sb2FkRnJhbWUoaSkpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0bW91c2VTdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdGFja0FjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHR9XG5cdFx0KSBhcyBXb3JrYmVuY2hMaXN0PExpc3RJdGVtPik7XG5cdH1cblxuXHQvKiogUmVwbGFjZXMgdGhlIGNhbGwgZnJhbWVzIGRpc3BsYXkgaW4gdGhlIHZpZXcuICovXG5cdHB1YmxpYyBzZXRGcmFtZXMoZnJhbWVzOiBBbnlTdGFja0ZyYW1lW10pOiB2b2lkIHtcblx0XHQvLyBjYW5jZWwgYW55IGV4aXN0aW5nIGxvYWRcblx0XHR0aGlzLmN1cnJlbnRGcmFtZXNEcy5jbGVhcigpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuY3VycmVudEZyYW1lc0RzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHR0aGlzLmN0cyA9IGN0cztcblxuXHRcdHRoaXMubGlzdC5zcGxpY2UoMCwgdGhpcy5saXN0Lmxlbmd0aCwgdGhpcy5tYXBGcmFtZXMoZnJhbWVzKSk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3QubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMubGF5b3V0RW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbGwoKSB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZnJhbWUgPSB0aGlzLmxpc3QuZWxlbWVudChpKTtcblx0XHRcdFx0aWYgKGlzRnJhbWVMaWtlKGZyYW1lKSkge1xuXHRcdFx0XHRcdGZyYW1lLmNvbGxhcHNlZC5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRGcmFtZShyZXBsYWNpbmc6IFNraXBwZWRDYWxsRnJhbWVzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmN0cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZyYW1lcyA9IGF3YWl0IHJlcGxhY2luZy5sb2FkKHRoaXMuY3RzLnRva2VuKTtcblx0XHRpZiAodGhpcy5jdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMubGlzdC5pbmRleE9mKHJlcGxhY2luZyk7XG5cdFx0dGhpcy5saXN0LnNwbGljZShpbmRleCwgMSwgdGhpcy5tYXBGcmFtZXMoZnJhbWVzKSk7XG5cdH1cblxuXHRwcml2YXRlIG1hcEZyYW1lcyhmcmFtZXM6IEFueVN0YWNrRnJhbWVbXSk6IExpc3RJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogTGlzdEl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZnJhbWUgb2YgZnJhbWVzKSB7XG5cdFx0XHRpZiAoZnJhbWUgaW5zdGFuY2VvZiBTa2lwcGVkQ2FsbEZyYW1lcykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChmcmFtZSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3cmFwcGVkID0gZnJhbWUgaW5zdGFuY2VvZiBDdXN0b21TdGFja0ZyYW1lXG5cdFx0XHRcdD8gbmV3IFdyYXBwZWRDdXN0b21TdGFja0ZyYW1lKGZyYW1lKSA6IG5ldyBXcmFwcGVkQ2FsbFN0YWNrRnJhbWUoZnJhbWUpO1xuXHRcdFx0cmVzdWx0LnB1c2god3JhcHBlZCk7XG5cblx0XHRcdHRoaXMuY3VycmVudEZyYW1lc0RzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IHdyYXBwZWQuaGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5saXN0LmluZGV4T2Yod3JhcHBlZCk7XG5cdFx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5saXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQoaWR4LCBoZWlnaHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBTdGFja0FjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPExpc3RJdGVtPiB7XG5cdGNvbnN0cnVjdG9yKEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKSB7IH1cblxuXHRnZXRBcmlhTGFiZWwoZTogTGlzdEl0ZW0pOiBzdHJpbmcgfCBJT2JzZXJ2YWJsZTxzdHJpbmc+IHwgbnVsbCB7XG5cdFx0aWYgKGUgaW5zdGFuY2VvZiBTa2lwcGVkQ2FsbEZyYW1lcykge1xuXHRcdFx0cmV0dXJuIGUubGFiZWw7XG5cdFx0fVxuXG5cdFx0aWYgKGUgaW5zdGFuY2VvZiBXcmFwcGVkQ3VzdG9tU3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuIGUub3JpZ2luYWwubGFiZWw7XG5cdFx0fVxuXG5cdFx0aWYgKGUgaW5zdGFuY2VvZiBDYWxsU3RhY2tGcmFtZSkge1xuXHRcdFx0aWYgKGUuc291cmNlICYmIGUubGluZSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoe1xuXHRcdFx0XHRcdGNvbW1lbnQ6IFsnezB9IGlzIGFuIGV4dGVuc2lvbi1kZWZpbmVkIGxhYmVsLCB0aGVuIGxpbmUgbnVtYmVyIGFuZCBmaWxlbmFtZSddLFxuXHRcdFx0XHRcdGtleTogJ3N0YWNrVHJhY2VMYWJlbCcsXG5cdFx0XHRcdH0sICd7MH0sIGxpbmUgezF9IGluIHsyfScsIGUubmFtZSwgZS5saW5lLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlLnNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBlLm5hbWU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TmV2ZXIoZSk7XG5cdH1cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzdGFja1RyYWNlJywgJ1N0YWNrIFRyYWNlJyk7XG5cdH1cbn1cblxuY2xhc3MgU3RhY2tEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPExpc3RJdGVtPiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBMaXN0SXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDYWxsU3RhY2tGcmFtZSB8fCBlbGVtZW50IGluc3RhbmNlb2YgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmhlaWdodC5nZXQoKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTa2lwcGVkQ2FsbEZyYW1lcykge1xuXHRcdFx0cmV0dXJuIENBTExfU1RBQ0tfV0lER0VUX0hFQURFUl9IRUlHSFQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TmV2ZXIoZWxlbWVudCk7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IExpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIENhbGxTdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5zb3VyY2UgPyBGcmFtZUNvZGVSZW5kZXJlci50ZW1wbGF0ZUlkIDogTWlzc2luZ0NvZGVSZW5kZXJlci50ZW1wbGF0ZUlkO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNraXBwZWRDYWxsRnJhbWVzKSB7XG5cdFx0XHRyZXR1cm4gU2tpcHBlZFJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBDdXN0b21SZW5kZXJlci50ZW1wbGF0ZUlkO1xuXHRcdH1cblxuXHRcdGFzc2VydE5ldmVyKGVsZW1lbnQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU3RhY2tUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhIHtcblx0ZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHR0b29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcbn1cblxuY29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0c2Nyb2xsYmFyOiB7XG5cdFx0dmVydGljYWw6ICdoaWRkZW4nLFxuXHRcdGhvcml6b250YWw6ICdoaWRkZW4nLFxuXHRcdGhhbmRsZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHR9LFxuXHRvdmVydmlld1J1bGVyTGFuZXM6IDAsXG5cdGZpeGVkT3ZlcmZsb3dXaWRnZXRzOiB0cnVlLFxuXHRvdmVydmlld1J1bGVyQm9yZGVyOiBmYWxzZSxcblx0c3RpY2t5U2Nyb2xsOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0cmVhZE9ubHk6IHRydWUsXG5cdGF1dG9tYXRpY0xheW91dDogZmFsc2UsXG59O1xuXG5jb25zdCBtYWtlRnJhbWVFbGVtZW50cyA9ICgpID0+IGRvbS5oKCdkaXYubXVsdGlDYWxsU3RhY2tGcmFtZScsIFtcblx0ZG9tLmgoJ2Rpdi5oZWFkZXJAaGVhZGVyJywgW1xuXHRcdGRvbS5oKCdkaXYuY29sbGFwc2UtYnV0dG9uQGNvbGxhcHNlQnV0dG9uJyksXG5cdFx0ZG9tLmgoJ2Rpdi50aXRsZS5zaG93LWZpbGUtaWNvbnNAdGl0bGUnKSxcblx0XHRkb20uaCgnZGl2LmFjdGlvbnNAYWN0aW9ucycpLFxuXHRdKSxcblxuXHRkb20uaCgnZGl2LmVkaXRvclBhcmVudCcsIFtcblx0XHRkb20uaCgnZGl2LmVkaXRvckNvbnRhaW5lckBlZGl0b3InKSxcblx0XSlcbl0pO1xuXG5leHBvcnQgY29uc3QgQ0FMTF9TVEFDS19XSURHRVRfSEVBREVSX0hFSUdIVCA9IDI0O1xuXG5pbnRlcmZhY2UgSUFic3RyYWN0RnJhbWVSZW5kZXJlclRlbXBsYXRlRGF0YSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBSZXNvdXJjZUxhYmVsO1xuXHRlbGVtZW50czogUmV0dXJuVHlwZTx0eXBlb2YgbWFrZUZyYW1lRWxlbWVudHM+O1xuXHRkZWNvcmF0aW9uczogc3RyaW5nW107XG5cdGNvbGxhcHNlOiBCdXR0b247XG5cdGVsZW1lbnRTdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXHR0ZW1wbGF0ZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0RnJhbWVSZW5kZXJlcjxUIGV4dGVuZHMgSUFic3RyYWN0RnJhbWVSZW5kZXJlclRlbXBsYXRlRGF0YT4gaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPExpc3RJdGVtLCBUPiB7XG5cdHB1YmxpYyBhYnN0cmFjdCB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogVCB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBtYWtlRnJhbWVFbGVtZW50cygpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50cy5yb290KTtcblxuXG5cdFx0Y29uc3QgdGVtcGxhdGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbXVsdGlDYWxsU3RhY2tGcmFtZUNvbnRhaW5lcicpO1xuXHRcdHRlbXBsYXRlU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbXVsdGlDYWxsU3RhY2tGcmFtZUNvbnRhaW5lcicpO1xuXHRcdFx0ZWxlbWVudHMucm9vdC5yZW1vdmUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlU3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbCwgZWxlbWVudHMudGl0bGUsIHt9KSk7XG5cblx0XHRjb25zdCBjb2xsYXBzZSA9IHRlbXBsYXRlU3RvcmUuYWRkKG5ldyBCdXR0b24oZWxlbWVudHMuY29sbGFwc2VCdXR0b24sIHt9KSk7XG5cblx0XHRjb25zdCBjb250ZW50SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRlbGVtZW50cy5lZGl0b3IuaWQgPSBjb250ZW50SWQ7XG5cdFx0ZWxlbWVudHMuZWRpdG9yLnJvbGUgPSAncmVnaW9uJztcblx0XHRlbGVtZW50cy5jb2xsYXBzZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnLCBjb250ZW50SWQpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZmluaXNoUmVuZGVyVGVtcGxhdGUoe1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0ZGVjb3JhdGlvbnM6IFtdLFxuXHRcdFx0ZWxlbWVudHMsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGNvbGxhcHNlLFxuXHRcdFx0ZWxlbWVudFN0b3JlOiB0ZW1wbGF0ZVN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXHRcdFx0dGVtcGxhdGVTdG9yZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBmaW5pc2hSZW5kZXJUZW1wbGF0ZShkYXRhOiBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhKTogVDtcblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IExpc3RJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogVCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZWxlbWVudFN0b3JlIH0gPSB0ZW1wbGF0ZTtcblx0XHRlbGVtZW50U3RvcmUuY2xlYXIoKTtcblx0XHRjb25zdCBpdGVtID0gZWxlbWVudCBhcyBJRnJhbWVMaWtlSXRlbTtcblxuXHRcdHRoaXMuc2V0dXBDb2xsYXBzZUJ1dHRvbihpdGVtLCB0ZW1wbGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwQ29sbGFwc2VCdXR0b24oaXRlbTogSUZyYW1lTGlrZUl0ZW0sIHsgZWxlbWVudFN0b3JlLCBlbGVtZW50cywgY29sbGFwc2UgfTogVCkge1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29sbGFwc2UuZWxlbWVudC5jbGFzc05hbWUgPSAnJztcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IGl0ZW0uY29sbGFwc2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbGxhcHNlLmljb24gPSBjb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd247XG5cdFx0XHRjb2xsYXBzZS5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyghY29sbGFwc2VkKTtcblx0XHRcdGVsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgY29sbGFwc2VkKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgdG9nZ2xlQ29sbGFwc2UgPSAoKSA9PiBpdGVtLmNvbGxhcHNlZC5zZXQoIWl0ZW0uY29sbGFwc2VkLmdldCgpLCB1bmRlZmluZWQpO1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQoY29sbGFwc2Uub25EaWRDbGljayh0b2dnbGVDb2xsYXBzZSkpO1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50cy50aXRsZSwgJ2NsaWNrJywgdG9nZ2xlQ29sbGFwc2UpKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IExpc3RJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFQpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBUKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlU3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNvbnN0IENPTlRFWFRfTElORVMgPSAyO1xuXG4vKiogUmVuZGVyZXIgZm9yIGEgbm9ybWFsIHN0YWNrIGZyYW1lIHdoZXJlIGNvZGUgaXMgYXZhaWxhYmxlLiAqL1xuY2xhc3MgRnJhbWVDb2RlUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdEZyYW1lUmVuZGVyZXI8SVN0YWNrVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdmJztcblxuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IEZyYW1lQ29kZVJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluaW5nRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uTGF5b3V0OiBFdmVudDx2b2lkPixcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGZpbmlzaFJlbmRlclRlbXBsYXRlKGRhdGE6IElBYnN0cmFjdEZyYW1lUmVuZGVyZXJUZW1wbGF0ZURhdGEpOiBJU3RhY2tUZW1wbGF0ZURhdGEge1xuXHRcdC8vIG92ZXJyaWRlIGRlZmF1bHQgZS5nLiBsYW5ndWFnZSBjb250cmlidXRpb25zLCBvbmx5IGFsbG93IHVzZXJzIHRvIGNsaWNrXG5cdFx0Ly8gb24gY29kZSBpbiB0aGUgY2FsbCBzdGFjayB0byBnbyB0byBpdHMgc291cmNlIGxvY2F0aW9uXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uczogSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW10gPSBbe1xuXHRcdFx0aWQ6IENsaWNrVG9Mb2NhdGlvbkNvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdGluc3RhbnRpYXRpb246IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQmVmb3JlRmlyc3RJbnRlcmFjdGlvbixcblx0XHRcdGN0b3I6IENsaWNrVG9Mb2NhdGlvbkNvbnRyaWJ1dGlvbiBhcyBFZGl0b3JDb250cmlidXRpb25DdG9yLFxuXHRcdH1dO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5jb250YWluaW5nRWRpdG9yXG5cdFx0XHQ/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCxcblx0XHRcdFx0ZGF0YS5lbGVtZW50cy5lZGl0b3IsXG5cdFx0XHRcdGVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdHsgaXNTaW1wbGVXaWRnZXQ6IHRydWUsIGNvbnRyaWJ1dGlvbnMgfSxcblx0XHRcdFx0dGhpcy5jb250YWluaW5nRWRpdG9yLFxuXHRcdFx0KVxuXHRcdFx0OiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0XHRkYXRhLmVsZW1lbnRzLmVkaXRvcixcblx0XHRcdFx0ZWRpdG9yT3B0aW9ucyxcblx0XHRcdFx0eyBpc1NpbXBsZVdpZGdldDogdHJ1ZSwgY29udHJpYnV0aW9ucyB9LFxuXHRcdFx0KTtcblxuXHRcdGRhdGEudGVtcGxhdGVTdG9yZS5hZGQoZWRpdG9yKTtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBkYXRhLnRlbXBsYXRlU3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGRhdGEuZWxlbWVudHMuYWN0aW9ucywgTWVudUlkLkRlYnVnQ2FsbFN0YWNrVG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgLi4uZGF0YSwgZWRpdG9yLCB0b29sYmFyIH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KGVsZW1lbnQ6IExpc3RJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSVN0YWNrVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGUpO1xuXG5cdFx0Y29uc3QgeyBlbGVtZW50U3RvcmUsIGVkaXRvciB9ID0gdGVtcGxhdGU7XG5cblx0XHRjb25zdCBpdGVtID0gZWxlbWVudCBhcyBXcmFwcGVkQ2FsbFN0YWNrRnJhbWU7XG5cdFx0Y29uc3QgdXJpID0gaXRlbS5zb3VyY2UhO1xuXG5cdFx0dGVtcGxhdGUubGFiZWwuZWxlbWVudC5zZXRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHR0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmkpLnRoZW4ocmVmZXJlbmNlID0+IHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGVsZW1lbnRTdG9yZS5hZGQocmVmZXJlbmNlKTtcblx0XHRcdGVkaXRvci5zZXRNb2RlbChyZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0XHR0aGlzLnNldHVwRWRpdG9yQWZ0ZXJNb2RlbChpdGVtLCB0ZW1wbGF0ZSk7XG5cdFx0XHR0aGlzLnNldHVwRWRpdG9yTGF5b3V0KGl0ZW0sIHRlbXBsYXRlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBFZGl0b3JMYXlvdXQoaXRlbTogV3JhcHBlZENhbGxTdGFja0ZyYW1lLCB7IGVsZW1lbnRTdG9yZSwgY29udGFpbmVyLCBlZGl0b3IgfTogSVN0YWNrVGVtcGxhdGVEYXRhKSB7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldiA9IGVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHRlZGl0b3IubGF5b3V0KHsgd2lkdGg6IGNvbnRhaW5lci5jbGllbnRXaWR0aCwgaGVpZ2h0OiBwcmV2IH0pO1xuXG5cdFx0XHRjb25zdCBuZXh0ID0gZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdGlmIChuZXh0ICE9PSBwcmV2KSB7XG5cdFx0XHRcdGVkaXRvci5sYXlvdXQoeyB3aWR0aDogY29udGFpbmVyLmNsaWVudFdpZHRoLCBoZWlnaHQ6IG5leHQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW0uZWRpdG9ySGVpZ2h0LnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHRcdH07XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zKGxheW91dCkpO1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGxheW91dCkpO1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxPcHRpb25zKGxheW91dCkpO1xuXHRcdGVsZW1lbnRTdG9yZS5hZGQodGhpcy5vbkxheW91dChsYXlvdXQpKTtcblx0XHRsYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBFZGl0b3JBZnRlck1vZGVsKGl0ZW06IFdyYXBwZWRDYWxsU3RhY2tGcmFtZSwgdGVtcGxhdGU6IElTdGFja1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyh7XG5cdFx0XHRjb2x1bW46IGl0ZW0uY29sdW1uID8/IDEsXG5cdFx0XHRsaW5lTnVtYmVyOiBpdGVtLmxpbmUgPz8gMSxcblx0XHR9KTtcblxuXHRcdHRlbXBsYXRlLnRvb2xiYXIuY29udGV4dCA9IHsgdXJpOiBpdGVtLnNvdXJjZSwgcmFuZ2UgfTtcblxuXHRcdHRlbXBsYXRlLmVkaXRvci5zZXRIaWRkZW5BcmVhcyhbXG5cdFx0XHRSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHR7IGNvbHVtbjogMSwgbGluZU51bWJlcjogMSB9LFxuXHRcdFx0XHR7IGNvbHVtbjogMSwgbGluZU51bWJlcjogTWF0aC5tYXgoMSwgaXRlbS5saW5lIC0gQ09OVEVYVF9MSU5FUyAtIDEpIH0sXG5cdFx0XHQpLFxuXHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhcblx0XHRcdFx0eyBjb2x1bW46IDEsIGxpbmVOdW1iZXI6IGl0ZW0ubGluZSArIENPTlRFWFRfTElORVMgKyAxIH0sXG5cdFx0XHRcdHsgY29sdW1uOiAxLCBsaW5lTnVtYmVyOiBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUiB9LFxuXHRcdFx0KSxcblx0XHRdKTtcblxuXHRcdHRlbXBsYXRlLmVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGVtcGxhdGUuZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbihkKTtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25zLmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IGJlZm9yZVJhbmdlID0gcmFuZ2Uuc2V0U3RhcnRQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0Y29uc3QgaGFzQ2hhcmFjdGVyc0JlZm9yZSA9ICEhdGVtcGxhdGUuZWRpdG9yLmdldE1vZGVsKCk/LmdldFZhbHVlSW5SYW5nZShiZWZvcmVSYW5nZSkudHJpbSgpO1xuXHRcdFx0Y29uc3QgZGVjb1JhbmdlID0gcmFuZ2Uuc2V0RW5kUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUik7XG5cblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25zLnB1c2goYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihcblx0XHRcdFx0ZGVjb1JhbmdlLFxuXHRcdFx0XHRtYWtlU3RhY2tGcmFtZUNvbHVtbkRlY29yYXRpb24oIWhhc0NoYXJhY3RlcnNCZWZvcmUpLFxuXHRcdFx0KSk7XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9ucy5wdXNoKGFjY2Vzc29yLmFkZERlY29yYXRpb24oXG5cdFx0XHRcdGRlY29SYW5nZSxcblx0XHRcdFx0VE9QX1NUQUNLX0ZSQU1FX0RFQ09SQVRJT04sXG5cdFx0XHQpKTtcblx0XHR9KTtcblxuXHRcdGl0ZW0uZWRpdG9ySGVpZ2h0LnNldCh0ZW1wbGF0ZS5lZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTWlzc2luZ1RlbXBsYXRlRGF0YSB7XG5cdGVsZW1lbnRzOiBSZXR1cm5UeXBlPHR5cGVvZiBtYWtlRnJhbWVFbGVtZW50cz47XG5cdGxhYmVsOiBSZXNvdXJjZUxhYmVsO1xufVxuXG4vKiogUmVuZGVyZXIgZm9yIGEgY2FsbCBmcmFtZSB0aGF0J3MgbWlzc2luZyBhIFVSSSAqL1xuY2xhc3MgTWlzc2luZ0NvZGVSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8TGlzdEl0ZW0sIElNaXNzaW5nVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdtJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBNaXNzaW5nQ29kZVJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoQElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTWlzc2luZ1RlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBtYWtlRnJhbWVFbGVtZW50cygpO1xuXHRcdGVsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LmFkZCgnbWlzc2luZycpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50cy5yb290KTtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbCwgZWxlbWVudHMudGl0bGUsIHt9KTtcblx0XHRyZXR1cm4geyBlbGVtZW50cywgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNaXNzaW5nVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FzdCA9IGVsZW1lbnQgYXMgQ2FsbFN0YWNrRnJhbWU7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0bmFtZTogY2FzdC5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzdGFja0ZyYW1lTG9jYXRpb24nLCAnTGluZSB7MH0gY29sdW1uIHsxfScsIGNhc3QubGluZSwgY2FzdC5jb2x1bW4pLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBjYXN0LmxpbmUsIHN0YXJ0Q29sdW1uOiBjYXN0LmNvbHVtbiwgZW5kQ29sdW1uOiBjYXN0LmNvbHVtbiwgZW5kTGluZU51bWJlcjogY2FzdC5saW5lIH0sXG5cdFx0fSwge1xuXHRcdFx0aWNvbjogQ29kaWNvbi5maWxlQmluYXJ5LFxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1pc3NpbmdUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50cy5yb290LnJlbW92ZSgpO1xuXHR9XG59XG5cbi8qKiBSZW5kZXJlciBmb3IgYSBjYWxsIGZyYW1lIHRoYXQncyBtaXNzaW5nIGEgVVJJICovXG5jbGFzcyBDdXN0b21SZW5kZXJlciBleHRlbmRzIEFic3RyYWN0RnJhbWVSZW5kZXJlcjxJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdjJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBDdXN0b21SZW5kZXJlci50ZW1wbGF0ZUlkO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBmaW5pc2hSZW5kZXJUZW1wbGF0ZShkYXRhOiBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhKTogSUFic3RyYWN0RnJhbWVSZW5kZXJlclRlbXBsYXRlRGF0YSB7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KGVsZW1lbnQ6IExpc3RJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSUFic3RyYWN0RnJhbWVSZW5kZXJlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlKTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBlbGVtZW50IGFzIFdyYXBwZWRDdXN0b21TdGFja0ZyYW1lO1xuXHRcdGNvbnN0IHsgZWxlbWVudFN0b3JlLCBjb250YWluZXIsIGxhYmVsIH0gPSB0ZW1wbGF0ZTtcblxuXHRcdGxhYmVsLmVsZW1lbnQuc2V0UmVzb3VyY2UoeyBuYW1lOiBpdGVtLm9yaWdpbmFsLmxhYmVsIH0sIHsgaWNvbjogaXRlbS5vcmlnaW5hbC5pY29uIH0pO1xuXG5cdFx0ZWxlbWVudFN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50cy5oZWFkZXIuc3R5bGUuZGlzcGxheSA9IGl0ZW0ub3JpZ2luYWwuc2hvd0hlYWRlci5yZWFkKHJlYWRlcikgPyAnJyA6ICdub25lJztcblx0XHR9KSk7XG5cblx0XHRlbGVtZW50U3RvcmUuYWRkKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdGlmICghaXRlbS5jb2xsYXBzZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChpdGVtLm9yaWdpbmFsLnJlbmRlcihjb250YWluZXIpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gaXRlbS5vcmlnaW5hbC5yZW5kZXJBY3Rpb25zPy4odGVtcGxhdGUuZWxlbWVudHMuYWN0aW9ucyk7XG5cdFx0aWYgKGFjdGlvbnMpIHtcblx0XHRcdGVsZW1lbnRTdG9yZS5hZGQoYWN0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJU2tpcHBlZFRlbXBsYXRlRGF0YSB7XG5cdGJ1dHRvbjogQnV0dG9uO1xuXHRjdXJyZW50PzogU2tpcHBlZENhbGxGcmFtZXM7XG5cdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbi8qKiBSZW5kZXJlciBmb3IgYSBidXR0b24gdG8gbG9hZCBtb3JlIGNhbGwgZnJhbWVzICovXG5jbGFzcyBTa2lwcGVkUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPExpc3RJdGVtLCBJU2tpcHBlZFRlbXBsYXRlRGF0YT4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAncyc7XG5cdHB1YmxpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gU2tpcHBlZFJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2FkRnJhbWVzOiAoZnJvbUl0ZW06IFNraXBwZWRDYWxsRnJhbWVzKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2tpcHBlZFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYnV0dG9uID0gbmV3IEJ1dHRvbihjb250YWluZXIsIHsgdGl0bGU6ICcnLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pO1xuXHRcdGNvbnN0IGRhdGE6IElTa2lwcGVkVGVtcGxhdGVEYXRhID0geyBidXR0b24sIHN0b3JlIH07XG5cblx0XHRzdG9yZS5hZGQoYnV0dG9uKTtcblx0XHRzdG9yZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0aWYgKCFkYXRhLmN1cnJlbnQgfHwgIWJ1dHRvbi5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMubG9hZEZyYW1lcyhkYXRhLmN1cnJlbnQpLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2ZhaWxlZFRvTG9hZEZyYW1lcycsICdGYWlsZWQgdG8gbG9hZCBzdGFjayBmcmFtZXM6IHswfScsIGUubWVzc2FnZSkpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IExpc3RJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTa2lwcGVkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FzdCA9IGVsZW1lbnQgYXMgU2tpcHBlZENhbGxGcmFtZXM7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR0ZW1wbGF0ZURhdGEuYnV0dG9uLmxhYmVsID0gY2FzdC5sYWJlbDtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudCA9IGNhc3Q7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJU2tpcHBlZFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5zdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqIEEgc2ltcGxlIGNvbnRyaWJ1dGlvbiB0aGF0IG1ha2VzIGFsbCBkYXRhIGluIHRoZSBlZGl0b3IgY2xpY2thYmxlIHRvIGdvIHRvIHRoZSBsb2NhdGlvbiAqL1xuY2xhc3MgQ2xpY2tUb0xvY2F0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2NsaWNrVG9Mb2NhdGlvbic7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGlua0RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIGN1cnJlbnQ6IHsgbGluZTogbnVtYmVyOyB3b3JkOiBJV29yZEF0UG9zaXRpb24gfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubGlua0RlY29yYXRpb25zID0gZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmxpbmtEZWNvcmF0aW9ucy5jbGVhcigpKSk7XG5cblx0XHRjb25zdCBjbGlja0xpbmtHZXN0dXJlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENsaWNrTGlua0dlc3R1cmUoZWRpdG9yKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGlja0xpbmtHZXN0dXJlLm9uTW91c2VNb3ZlT3JSZWxldmFudEtleURvd24oKFttb3VzZUV2ZW50LCBrZXlib2FyZEV2ZW50XSkgPT4ge1xuXHRcdFx0dGhpcy5vbk1vdmUobW91c2VFdmVudCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWNrTGlua0dlc3R1cmUub25FeGVjdXRlKChlKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIXRoaXMuY3VycmVudCB8fCAhbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbih0aGlzLmN1cnJlbnQubGluZSwgdGhpcy5jdXJyZW50LndvcmQuc3RhcnRDb2x1bW4pKSxcblx0XHRcdFx0XHRzZWxlY3Rpb25SZXZlYWxUeXBlOiBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCxcblx0XHRcdFx0fSxcblx0XHRcdH0sIGUuaGFzU2lkZUJ5U2lkZU1vZGlmaWVyID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdmUobW91c2VFdmVudDogQ2xpY2tMaW5rTW91c2VFdmVudCkge1xuXHRcdGlmICghbW91c2VFdmVudC5oYXNUcmlnZ2VyTW9kaWZpZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBtb3VzZUV2ZW50LnRhcmdldC5wb3NpdGlvbjtcblx0XHRjb25zdCB3b3JkID0gcG9zaXRpb24gJiYgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0V29yZEF0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2ID0gdGhpcy5jdXJyZW50Py53b3JkO1xuXHRcdGlmIChwcmV2ICYmIHByZXYuc3RhcnRDb2x1bW4gPT09IHdvcmQuc3RhcnRDb2x1bW4gJiYgcHJldi5lbmRDb2x1bW4gPT09IHdvcmQuZW5kQ29sdW1uICYmIHByZXYud29yZCA9PT0gd29yZC53b3JkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50ID0geyB3b3JkLCBsaW5lOiBwb3NpdGlvbi5saW5lTnVtYmVyIH07XG5cdFx0dGhpcy5saW5rRGVjb3JhdGlvbnMuc2V0KFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjYWxsLXN0YWNrLWdvLXRvLWZpbGUtbGluaycsXG5cdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2NhbGwtc3RhY2stZ28tdG8tZmlsZS1saW5rJyxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpIHtcblx0XHR0aGlzLmxpbmtEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdjYWxsU3RhY2tXaWRnZXQuZ29Ub0ZpbGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ29Ub0ZpbGUnLCAnT3BlbiBGaWxlJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ2FsbFN0YWNrVG9vbGJhcixcblx0XHRcdFx0b3JkZXI6IDIyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgeyB1cmksIHJhbmdlIH06IExvY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB1cmksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHNlbGVjdGlvbjogcmFuZ2UsXG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFHdkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsU0FBUyxrQkFBa0IsU0FBMkMsaUJBQWlCLG1CQUFtQjtBQUVuSCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLG9CQUFvQjtBQUU3QixTQUFpQyx1Q0FBdUU7QUFDeEcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBSXRCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQTZDO0FBQ3RELFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUMzQyxTQUFTLGdDQUFnQyxrQ0FBa0M7QUFDM0UsT0FBTztBQUdBLE1BQU0sZUFBZTtBQUFBLEVBQzNCLFlBQ2lCLE1BQ0EsUUFDQSxPQUFPLEdBQ1AsU0FBUyxHQUN4QjtBQUplO0FBQ0E7QUFDQTtBQUNBO0FBQUEs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
