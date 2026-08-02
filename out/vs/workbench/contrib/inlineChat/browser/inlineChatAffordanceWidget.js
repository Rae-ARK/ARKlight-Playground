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
import "./media/inlineChatEditorAffordance.css";
import * as dom from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { SelectionDirection } from "../../../../editor/common/core/selection.js";
import { computeIndentLevel } from "../../../../editor/common/model/utils.js";
import { autorun } from "../../../../base/common/observable.js";
import { MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { quickFixCommandId } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ACTION_START, ACTION_ASK_IN_CHAT } from "../common/inlineChat.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
let QuickFixActionViewItem = class extends MenuEntryActionViewItem {
  #lightBulbStore = this._store.add(new MutableDisposable());
  #currentTitle;
  #editor;
  constructor(action, editor, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, commandService) {
    const wrappedAction = new class extends MenuItemAction {
      constructor() {
        super(action.item, action.alt?.item, {}, action.hideActions, action.menuKeybinding, contextKeyService, commandService);
        this.elementGetter = () => void 0;
      }
      async run(...args) {
        const controller = CodeActionController.get(editor);
        const info = controller?.lightBulbState.get();
        const element = this.elementGetter();
        if (controller && info && element) {
          const { bottom, left } = element.getBoundingClientRect();
          await controller.showCodeActions(info.trigger, info.actions, { x: left, y: bottom });
        }
      }
    }();
    super(wrappedAction, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.#editor = editor;
    wrappedAction.elementGetter = () => this.element;
  }
  render(container) {
    super.render(container);
    this.#updateFromLightBulb();
  }
  getTooltip() {
    return this.#currentTitle ?? super.getTooltip();
  }
  #updateFromLightBulb() {
    const controller = CodeActionController.get(this.#editor);
    if (!controller) {
      return;
    }
    const store = new DisposableStore();
    this.#lightBulbStore.value = store;
    store.add(autorun((reader) => {
      const info = controller.lightBulbState.read(reader);
      if (this.label) {
        const icon = info?.icon ?? Codicon.lightBulb;
        const iconClasses = ThemeIcon.asClassNameArray(icon);
        this.label.className = "";
        this.label.classList.add("codicon", "action-label", ...iconClasses);
      }
      this.#currentTitle = info?.title;
      this.updateTooltip();
    }));
  }
};
QuickFixActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, ICommandService)
], QuickFixActionViewItem);
let LabelWithKeybindingActionViewItem = class extends MenuEntryActionViewItem {
  #kbLabel;
  constructor(action, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService) {
    super(action, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.options.label = true;
    this.options.icon = false;
    this.#kbLabel = keybindingService.lookupKeybinding(action.id)?.getLabel() ?? void 0;
  }
  updateLabel() {
    if (this.label) {
      dom.reset(
        this.label,
        this.action.label,
        ...this.#kbLabel ? [dom.$("span.inline-chat-keybinding", void 0, this.#kbLabel)] : []
      );
    }
  }
};
LabelWithKeybindingActionViewItem = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IAccessibilityService)
], LabelWithKeybindingActionViewItem);
let InlineChatAffordanceWidget = class extends Disposable {
  constructor(editor, selection, instantiationService) {
    super();
    this.#id = `inline-chat-content-widget-${InlineChatAffordanceWidget.#idPool++}`;
    this.#position = null;
    this.#isVisible = false;
    this.#onDidRunAction = this._store.add(new Emitter());
    this.onDidRunAction = this.#onDidRunAction.event;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = false;
    this.#editor = editor;
    this.#domNode = dom.$(".inline-chat-content-widget");
    const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this.#domNode, MenuId.InlineChatEditorAffordance, {
      telemetrySource: "inlineChatEditorAffordance",
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { renderShortTitle: true },
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
      actionViewItemProvider: (action) => {
        if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
          return instantiationService.createInstance(QuickFixActionViewItem, action, this.#editor);
        }
        if (action instanceof MenuItemAction && (action.id === ACTION_START || action.id === ACTION_ASK_IN_CHAT || action.id === "inlineChat.fixDiagnostics")) {
          return instantiationService.createInstance(LabelWithKeybindingActionViewItem, action);
        }
        return void 0;
      }
    }));
    this._store.add(toolbar.actionRunner.onDidRun((e) => {
      this.#onDidRunAction.fire(e.action.id);
      this.#hide();
    }));
    this._store.add(autorun((r) => {
      const sel = selection.read(r);
      if (sel) {
        this.#show(sel);
      } else {
        this.#hide();
      }
    }));
    this._store.add(this.#editor.onDidScrollChange(() => {
      const sel = selection.get();
      if (!sel) {
        return;
      }
      const isInViewport = this.#isPositionInViewport();
      if (isInViewport && !this.#isVisible) {
        this.#show(sel);
      } else if (!isInViewport && this.#isVisible) {
        this.#hide();
      }
    }));
  }
  static #idPool = 0;
  #id;
  #domNode;
  #position;
  #isVisible;
  #onDidRunAction;
  #editor;
  #show(selection) {
    if (selection.isEmpty()) {
      this.#showAtLineStart(selection.getPosition().lineNumber);
    } else {
      this.#showAtSelection(selection);
    }
    if (this.#isVisible) {
      this.#editor.layoutContentWidget(this);
    } else {
      this.#editor.addContentWidget(this);
      this.#isVisible = true;
    }
  }
  #showAtSelection(selection) {
    const cursorPosition = selection.getPosition();
    const direction = selection.getDirection();
    const preference = direction === SelectionDirection.RTL ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
    this.#position = {
      position: cursorPosition,
      preference: [preference]
    };
  }
  #showAtLineStart(lineNumber) {
    const model = this.#editor.getModel();
    if (!model) {
      return;
    }
    const tabSize = model.getOptions().tabSize;
    const fontInfo = this.#editor.getOptions().get(EditorOption.fontInfo);
    const lineContent = model.getLineContent(lineNumber);
    const indent = computeIndentLevel(lineContent, tabSize);
    const lineHasSpace = indent < 0 ? true : fontInfo.spaceWidth * indent > 22;
    let effectiveLineNumber = lineNumber;
    if (!lineHasSpace) {
      const isLineEmptyOrIndented = (ln) => {
        const content = model.getLineContent(ln);
        return /^\s*$|^\s+/.test(content);
      };
      const lineCount = model.getLineCount();
      if (lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1)) {
        effectiveLineNumber = lineNumber - 1;
      } else if (lineNumber < lineCount && isLineEmptyOrIndented(lineNumber + 1)) {
        effectiveLineNumber = lineNumber + 1;
      }
    }
    const effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
    this.#position = {
      position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  #isPositionInViewport() {
    const widgetPosition = this.#position?.position;
    if (!widgetPosition) {
      return false;
    }
    const visibleRanges = this.#editor.getVisibleRanges();
    const isLineVisible = visibleRanges.some(
      (range) => widgetPosition.lineNumber >= range.startLineNumber && widgetPosition.lineNumber <= range.endLineNumber
    );
    if (!isLineVisible) {
      return false;
    }
    const scrolledPos = this.#editor.getScrolledVisiblePosition(widgetPosition);
    if (!scrolledPos) {
      return false;
    }
    const layoutInfo = this.#editor.getOptions().get(EditorOption.layoutInfo);
    return scrolledPos.left >= 0 && scrolledPos.left <= layoutInfo.width;
  }
  #hide() {
    if (this.#isVisible) {
      this.#isVisible = false;
      this.#editor.removeContentWidget(this);
    }
  }
  getId() {
    return this.#id;
  }
  getDomNode() {
    return this.#domNode;
  }
  getPosition() {
    return this.#position;
  }
  beforeRender() {
    const position = this.#editor.getPosition();
    const lineHeight = position ? this.#editor.getLineHeightForPosition(position) : this.#editor.getOption(EditorOption.lineHeight);
    this.#domNode.style.setProperty("--vscode-inline-chat-affordance-height", `${lineHeight}px`);
    return null;
  }
  dispose() {
    if (this.#isVisible) {
      this.#editor.removeContentWidget(this);
    }
    super.dispose();
  }
};
InlineChatAffordanceWidget = __decorateClass([
  __decorateParam(2, IInstantiationService)
], InlineChatAffordanceWidget);
export {
  InlineChatAffordanceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0QWZmb3JkYW5jZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9pbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZS5jc3MnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgY29tcHV0ZUluZGVudExldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC91dGlscy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgcXVpY2tGaXhDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQUNUSU9OX1NUQVJULCBBQ1RJT05fQVNLX0lOX0NIQVQgfSBmcm9tICcuLi9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuXG5jbGFzcyBRdWlja0ZpeEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0ge1xuXG5cdHJlYWRvbmx5ICNsaWdodEJ1bGJTdG9yZSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0I2N1cnJlbnRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSAjZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IHdyYXBwZWRBY3Rpb24gPSBuZXcgY2xhc3MgZXh0ZW5kcyBNZW51SXRlbUFjdGlvbiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoYWN0aW9uLml0ZW0sIGFjdGlvbi5hbHQ/Lml0ZW0sIHt9LCBhY3Rpb24uaGlkZUFjdGlvbnMsIGFjdGlvbi5tZW51S2V5YmluZGluZywgY29udGV4dEtleVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxlbWVudEdldHRlcjogKCkgPT4gSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgPSAoKSA9PiB1bmRlZmluZWQ7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1biguLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvZGVBY3Rpb25Db250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdFx0XHRjb25zdCBpbmZvID0gY29udHJvbGxlcj8ubGlnaHRCdWxiU3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnRHZXR0ZXIoKTtcblx0XHRcdFx0aWYgKGNvbnRyb2xsZXIgJiYgaW5mbyAmJiBlbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBib3R0b20sIGxlZnQgfSA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5zaG93Q29kZUFjdGlvbnMoaW5mby50cmlnZ2VyLCBpbmZvLmFjdGlvbnMsIHsgeDogbGVmdCwgeTogYm90dG9tIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN1cGVyKHdyYXBwZWRBY3Rpb24sIHsgZHJhZ2dhYmxlOiBmYWxzZSB9LCBrZXliaW5kaW5nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cblx0XHR0aGlzLiNlZGl0b3IgPSBlZGl0b3I7XG5cdFx0d3JhcHBlZEFjdGlvbi5lbGVtZW50R2V0dGVyID0gKCkgPT4gdGhpcy5lbGVtZW50O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLiN1cGRhdGVGcm9tTGlnaHRCdWxiKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLiNjdXJyZW50VGl0bGUgPz8gc3VwZXIuZ2V0VG9vbHRpcCgpO1xuXHR9XG5cblx0I3VwZGF0ZUZyb21MaWdodEJ1bGIoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvZGVBY3Rpb25Db250cm9sbGVyLmdldCh0aGlzLiNlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuI2xpZ2h0QnVsYlN0b3JlLnZhbHVlID0gc3RvcmU7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGNvbnRyb2xsZXIubGlnaHRCdWxiU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdFx0Ly8gVXBkYXRlIGljb25cblx0XHRcdFx0Y29uc3QgaWNvbiA9IGluZm8/Lmljb24gPz8gQ29kaWNvbi5saWdodEJ1bGI7XG5cdFx0XHRcdGNvbnN0IGljb25DbGFzc2VzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbik7XG5cdFx0XHRcdHRoaXMubGFiZWwuY2xhc3NOYW1lID0gJyc7XG5cdFx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnY29kaWNvbicsICdhY3Rpb24tbGFiZWwnLCAuLi5pY29uQ2xhc3Nlcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSB0b29sdGlwXG5cdFx0XHR0aGlzLiNjdXJyZW50VGl0bGUgPSBpbmZvPy50aXRsZTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBMYWJlbFdpdGhLZXliaW5kaW5nQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cblx0cmVhZG9ubHkgI2tiTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbiwgeyBkcmFnZ2FibGU6IGZhbHNlIH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLm9wdGlvbnMubGFiZWwgPSB0cnVlO1xuXHRcdHRoaXMub3B0aW9ucy5pY29uID0gZmFsc2U7XG5cdFx0dGhpcy4ja2JMYWJlbCA9IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdGRvbS5yZXNldCh0aGlzLmxhYmVsLFxuXHRcdFx0XHR0aGlzLmFjdGlvbi5sYWJlbCxcblx0XHRcdFx0Li4uKHRoaXMuI2tiTGFiZWwgPyBbZG9tLiQoJ3NwYW4uaW5saW5lLWNoYXQta2V5YmluZGluZycsIHVuZGVmaW5lZCwgdGhpcy4ja2JMYWJlbCldIDogW10pXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIENvbnRlbnQgd2lkZ2V0IHRoYXQgc2hvd3MgYSBzbWFsbCBzcGFya2xlIGljb24gYXQgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAqIFdoZW4gY2xpY2tlZCwgaXQgc2hvd3MgdGhlIG92ZXJsYXkgd2lkZ2V0IGZvciBpbmxpbmUgY2hhdC5cbiAqL1xuZXhwb3J0IGNsYXNzIElubGluZUNoYXRBZmZvcmRhbmNlV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblxuXHRzdGF0aWMgI2lkUG9vbCA9IDA7XG5cblx0cmVhZG9ubHkgI2lkID0gYGlubGluZS1jaGF0LWNvbnRlbnQtd2lkZ2V0LSR7SW5saW5lQ2hhdEFmZm9yZGFuY2VXaWRnZXQuI2lkUG9vbCsrfWA7XG5cdHJlYWRvbmx5ICNkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0I3Bvc2l0aW9uOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdCNpc1Zpc2libGUgPSBmYWxzZTtcblxuXHRyZWFkb25seSAjb25EaWRSdW5BY3Rpb24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSdW5BY3Rpb246IEV2ZW50PHN0cmluZz4gPSB0aGlzLiNvbkRpZFJ1bkFjdGlvbi5ldmVudDtcblxuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblx0cmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd24gPSBmYWxzZTtcblxuXHRyZWFkb25seSAjZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHNlbGVjdGlvbjogSU9ic2VydmFibGU8U2VsZWN0aW9uIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLiNlZGl0b3IgPSBlZGl0b3I7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHdpZGdldCBET01cblx0XHR0aGlzLiNkb21Ob2RlID0gZG9tLiQoJy5pbmxpbmUtY2hhdC1jb250ZW50LXdpZGdldCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRvb2xiYXIgd2l0aCB0aGUgaW5saW5lIGNoYXQgc3RhcnQgYWN0aW9uXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3N0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy4jZG9tTm9kZSwgTWVudUlkLklubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdpbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZScsXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHRtZW51T3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiB0cnVlIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24uaWQgPT09IHF1aWNrRml4Q29tbWFuZElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRml4QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgdGhpcy4jZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgKGFjdGlvbi5pZCA9PT0gQUNUSU9OX1NUQVJUIHx8IGFjdGlvbi5pZCA9PT0gQUNUSU9OX0FTS19JTl9DSEFUIHx8IGFjdGlvbi5pZCA9PT0gJ2lubGluZUNoYXQuZml4RGlhZ25vc3RpY3MnKSkge1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYWJlbFdpdGhLZXliaW5kaW5nQWN0aW9uVmlld0l0ZW0sIGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvb2xiYXIuYWN0aW9uUnVubmVyLm9uRGlkUnVuKChlKSA9PiB7XG5cdFx0XHR0aGlzLiNvbkRpZFJ1bkFjdGlvbi5maXJlKGUuYWN0aW9uLmlkKTtcblx0XHRcdHRoaXMuI2hpZGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlbCA9IHNlbGVjdGlvbi5yZWFkKHIpO1xuXHRcdFx0aWYgKHNlbCkge1xuXHRcdFx0XHR0aGlzLiNzaG93KHNlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiNoaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuI2VkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWwgPSBzZWxlY3Rpb24uZ2V0KCk7XG5cdFx0XHRpZiAoIXNlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0luVmlld3BvcnQgPSB0aGlzLiNpc1Bvc2l0aW9uSW5WaWV3cG9ydCgpO1xuXHRcdFx0aWYgKGlzSW5WaWV3cG9ydCAmJiAhdGhpcy4jaXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuI3Nob3coc2VsKTtcblx0XHRcdH0gZWxzZSBpZiAoIWlzSW5WaWV3cG9ydCAmJiB0aGlzLiNpc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy4jaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdCNzaG93KHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG5cblx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0dGhpcy4jc2hvd0F0TGluZVN0YXJ0KHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLiNzaG93QXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy4jaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLiNlZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy4jZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0XHR0aGlzLiNpc1Zpc2libGUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdCNzaG93QXRTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGRpcmVjdGlvbiA9IHNlbGVjdGlvbi5nZXREaXJlY3Rpb24oKTtcblxuXHRcdGNvbnN0IHByZWZlcmVuY2UgPSBkaXJlY3Rpb24gPT09IFNlbGVjdGlvbkRpcmVjdGlvbi5SVExcblx0XHRcdD8gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRVxuXHRcdFx0OiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XO1xuXG5cdFx0dGhpcy4jcG9zaXRpb24gPSB7XG5cdFx0XHRwb3NpdGlvbjogY3Vyc29yUG9zaXRpb24sXG5cdFx0XHRwcmVmZXJlbmNlOiBbcHJlZmVyZW5jZV0sXG5cdFx0fTtcblx0fVxuXG5cdCNzaG93QXRMaW5lU3RhcnQobGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLiNlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFiU2l6ZSA9IG1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy4jZWRpdG9yLmdldE9wdGlvbnMoKS5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGluZGVudCA9IGNvbXB1dGVJbmRlbnRMZXZlbChsaW5lQ29udGVudCwgdGFiU2l6ZSk7XG5cdFx0Y29uc3QgbGluZUhhc1NwYWNlID0gaW5kZW50IDwgMCA/IHRydWUgOiBmb250SW5mby5zcGFjZVdpZHRoICogaW5kZW50ID4gMjI7XG5cblx0XHRsZXQgZWZmZWN0aXZlTGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cblx0XHRpZiAoIWxpbmVIYXNTcGFjZSkge1xuXHRcdFx0Y29uc3QgaXNMaW5lRW1wdHlPckluZGVudGVkID0gKGxuOiBudW1iZXIpOiBib29sZWFuID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxuKTtcblx0XHRcdFx0cmV0dXJuIC9eXFxzKiR8XlxccysvLnRlc3QoY29udGVudCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGlmIChsaW5lTnVtYmVyID4gMSAmJiBpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlciAtIDEpKSB7XG5cdFx0XHRcdGVmZmVjdGl2ZUxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIC0gMTtcblx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlciA8IGxpbmVDb3VudCAmJiBpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlciArIDEpKSB7XG5cdFx0XHRcdGVmZmVjdGl2ZUxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyICsgMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZmZlY3RpdmVDb2x1bW5OdW1iZXIgPSAvXlxcU1xccyokLy50ZXN0KG1vZGVsLmdldExpbmVDb250ZW50KGVmZmVjdGl2ZUxpbmVOdW1iZXIpKSA/IDIgOiAxO1xuXG5cdFx0dGhpcy4jcG9zaXRpb24gPSB7XG5cdFx0XHRwb3NpdGlvbjogeyBsaW5lTnVtYmVyOiBlZmZlY3RpdmVMaW5lTnVtYmVyLCBjb2x1bW46IGVmZmVjdGl2ZUNvbHVtbk51bWJlciB9LFxuXHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1RdLFxuXHRcdH07XG5cdH1cblxuXHQjaXNQb3NpdGlvbkluVmlld3BvcnQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd2lkZ2V0UG9zaXRpb24gPSB0aGlzLiNwb3NpdGlvbj8ucG9zaXRpb247XG5cdFx0aWYgKCF3aWRnZXRQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHZlcnRpY2FsIHZpc2liaWxpdHlcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy4jZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRjb25zdCBpc0xpbmVWaXNpYmxlID0gdmlzaWJsZVJhbmdlcy5zb21lKHJhbmdlID0+XG5cdFx0XHR3aWRnZXRQb3NpdGlvbi5saW5lTnVtYmVyID49IHJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiB3aWRnZXRQb3NpdGlvbi5saW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXJcblx0XHQpO1xuXHRcdGlmICghaXNMaW5lVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGhvcml6b250YWwgdmlzaWJpbGl0eVxuXHRcdGNvbnN0IHNjcm9sbGVkUG9zID0gdGhpcy4jZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHdpZGdldFBvc2l0aW9uKTtcblx0XHRpZiAoIXNjcm9sbGVkUG9zKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLiNlZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0cmV0dXJuIHNjcm9sbGVkUG9zLmxlZnQgPj0gMCAmJiBzY3JvbGxlZFBvcy5sZWZ0IDw9IGxheW91dEluZm8ud2lkdGg7XG5cdH1cblxuXHQjaGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy4jaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLiNpc1Zpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuI2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuI2lkO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuI2RvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuI3Bvc2l0aW9uO1xuXHR9XG5cblx0YmVmb3JlUmVuZGVyKCk6IElEaW1lbnNpb24gfCBudWxsIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuI2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBwb3NpdGlvbiA/IHRoaXMuI2VkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb24pIDogdGhpcy4jZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHR0aGlzLiNkb21Ob2RlLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1pbmxpbmUtY2hhdC1hZmZvcmRhbmNlLWhlaWdodCcsIGAke2xpbmVIZWlnaHR9cHhgKTtcblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy4jaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLiNlZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVDQUE0RjtBQUNyRyxTQUFTLG9CQUFvQjtBQUM3QixTQUFvQiwwQkFBMEI7QUFDOUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLFFBQVEsc0JBQXNCO0FBQ3ZDLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjLDBCQUEwQjtBQUNqRCxTQUFTLHVCQUF1QjtBQUVoQyxJQUFNLHlCQUFOLGNBQXFDLHdCQUF3QjtBQUFBLEVBRW5ELGtCQUFrQixLQUFLLE9BQU8sSUFBSSxJQUFJLGtCQUFtQyxDQUFDO0FBQUEsRUFDbkY7QUFBQSxFQUNTO0FBQUEsRUFFVCxZQUNDLFFBQ0EsUUFDb0IsbUJBQ0UscUJBQ0YsbUJBQ0wsY0FDTSxvQkFDRSxzQkFDTixnQkFDaEI7QUFDRCxVQUFNLGdCQUFnQixJQUFJLGNBQWMsZUFBZTtBQUFBLE1BQ3RELGNBQWM7QUFDYixjQUFNLE9BQU8sTUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDLEdBQUcsT0FBTyxhQUFhLE9BQU8sZ0JBQWdCLG1CQUFtQixjQUFjO0FBR3RILDZCQUErQyxNQUFNO0FBQUEsTUFGckQ7QUFBQSxNQUlBLE1BQWUsT0FBTyxNQUFnQztBQUNyRCxjQUFNLGFBQWEscUJBQXFCLElBQUksTUFBTTtBQUNsRCxjQUFNLE9BQU8sWUFBWSxlQUFlLElBQUk7QUFDNUMsY0FBTSxVQUFVLEtBQUssY0FBYztBQUNuQyxZQUFJLGNBQWMsUUFBUSxTQUFTO0FBQ2xDLGdCQUFNLEVBQUUsUUFBUSxLQUFLLElBQUksUUFBUSxzQkFBc0I7QUFDdkQsZ0JBQU0sV0FBVyxnQkFBZ0IsS0FBSyxTQUFTLEtBQUssU0FBUyxFQUFFLEdBQUcsTUFBTSxHQUFHLE9BQU8sQ0FBQztBQUFBLFFBQ3BGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsRUFBRSxXQUFXLE1BQU0sR0FBRyxtQkFBbUIscUJBQXFCLG1CQUFtQixjQUFjLG9CQUFvQixvQkFBb0I7QUFFNUosU0FBSyxVQUFVO0FBQ2Ysa0JBQWMsZ0JBQWdCLE1BQU0sS0FBSztBQUFBLEVBQzFDO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVtQixhQUFxQjtBQUN2QyxXQUFPLEtBQUssaUJBQWlCLE1BQU0sV0FBVztBQUFBLEVBQy9DO0FBQUEsRUFFQSx1QkFBNkI7QUFDNUIsVUFBTSxhQUFhLHFCQUFxQixJQUFJLEtBQUssT0FBTztBQUN4RCxRQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsU0FBSyxnQkFBZ0IsUUFBUTtBQUU3QixVQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFlBQU0sT0FBTyxXQUFXLGVBQWUsS0FBSyxNQUFNO0FBQ2xELFVBQUksS0FBSyxPQUFPO0FBRWYsY0FBTSxPQUFPLE1BQU0sUUFBUSxRQUFRO0FBQ25DLGNBQU0sY0FBYyxVQUFVLGlCQUFpQixJQUFJO0FBQ25ELGFBQUssTUFBTSxZQUFZO0FBQ3ZCLGFBQUssTUFBTSxVQUFVLElBQUksV0FBVyxnQkFBZ0IsR0FBRyxXQUFXO0FBQUEsTUFDbkU7QUFHQSxXQUFLLGdCQUFnQixNQUFNO0FBQzNCLFdBQUssY0FBYztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQTFFTSx5QkFBTjtBQUFBLEVBU0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWZHO0FBNEVOLElBQU0sb0NBQU4sY0FBZ0Qsd0JBQXdCO0FBQUEsRUFFOUQ7QUFBQSxFQUVULFlBQ0MsUUFDb0IsbUJBQ0UscUJBQ0YsbUJBQ0wsY0FDTSxvQkFDRSxzQkFDdEI7QUFDRCxVQUFNLFFBQVEsRUFBRSxXQUFXLE1BQU0sR0FBRyxtQkFBbUIscUJBQXFCLG1CQUFtQixjQUFjLG9CQUFvQixvQkFBb0I7QUFDckosU0FBSyxRQUFRLFFBQVE7QUFDckIsU0FBSyxRQUFRLE9BQU87QUFDcEIsU0FBSyxXQUFXLGtCQUFrQixpQkFBaUIsT0FBTyxFQUFFLEdBQUcsU0FBUyxLQUFLO0FBQUEsRUFDOUU7QUFBQSxFQUVtQixjQUFvQjtBQUN0QyxRQUFJLEtBQUssT0FBTztBQUNmLFVBQUk7QUFBQSxRQUFNLEtBQUs7QUFBQSxRQUNkLEtBQUssT0FBTztBQUFBLFFBQ1osR0FBSSxLQUFLLFdBQVcsQ0FBQyxJQUFJLEVBQUUsK0JBQStCLFFBQVcsS0FBSyxRQUFRLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDekY7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBM0JNLG9DQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYRztBQWlDQyxJQUFNLDZCQUFOLGNBQXlDLFdBQXFDO0FBQUEsRUFpQnBGLFlBQ0MsUUFDQSxXQUN1QixzQkFDdEI7QUFDRCxVQUFNO0FBbEJQLFNBQVMsTUFBTSw4QkFBOEIsMkJBQTJCLFNBQVM7QUFFakYscUJBQTJDO0FBQzNDLHNCQUFhO0FBRWIsU0FBUyxrQkFBa0IsS0FBSyxPQUFPLElBQUksSUFBSSxRQUFnQixDQUFDO0FBQ2hFLFNBQVMsaUJBQWdDLEtBQUssZ0JBQWdCO0FBRTlELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBVzVCLFNBQUssVUFBVTtBQUdmLFNBQUssV0FBVyxJQUFJLEVBQUUsNkJBQTZCO0FBR25ELFVBQU0sVUFBVSxLQUFLLE9BQU8sSUFBSSxxQkFBcUIsZUFBZSxzQkFBc0IsS0FBSyxVQUFVLE9BQU8sNEJBQTRCO0FBQUEsTUFDM0ksaUJBQWlCO0FBQUEsTUFDakIsb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZDLGFBQWEsRUFBRSxrQkFBa0IsS0FBSztBQUFBLE1BQ3RDLGdCQUFnQixFQUFFLGNBQWMsTUFBTSxNQUFNLCtCQUErQixLQUFLO0FBQUEsTUFDaEYsd0JBQXdCLENBQUMsV0FBb0I7QUFDNUMsWUFBSSxrQkFBa0Isa0JBQWtCLE9BQU8sT0FBTyxtQkFBbUI7QUFDeEUsaUJBQU8scUJBQXFCLGVBQWUsd0JBQXdCLFFBQVEsS0FBSyxPQUFPO0FBQUEsUUFDeEY7QUFDQSxZQUFJLGtCQUFrQixtQkFBbUIsT0FBTyxPQUFPLGdCQUFnQixPQUFPLE9BQU8sc0JBQXNCLE9BQU8sT0FBTyw4QkFBOEI7QUFDdEosaUJBQU8scUJBQXFCLGVBQWUsbUNBQW1DLE1BQU07QUFBQSxRQUNyRjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLE9BQU8sSUFBSSxRQUFRLGFBQWEsU0FBUyxDQUFDLE1BQU07QUFDcEQsV0FBSyxnQkFBZ0IsS0FBSyxFQUFFLE9BQU8sRUFBRTtBQUNyQyxXQUFLLE1BQU07QUFBQSxJQUNaLENBQUMsQ0FBQztBQUVGLFNBQUssT0FBTyxJQUFJLFFBQVEsT0FBSztBQUM1QixZQUFNLE1BQU0sVUFBVSxLQUFLLENBQUM7QUFDNUIsVUFBSSxLQUFLO0FBQ1IsYUFBSyxNQUFNLEdBQUc7QUFBQSxNQUNmLE9BQU87QUFDTixhQUFLLE1BQU07QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLE9BQU8sSUFBSSxLQUFLLFFBQVEsa0JBQWtCLE1BQU07QUFDcEQsWUFBTSxNQUFNLFVBQVUsSUFBSTtBQUMxQixVQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsTUFDRDtBQUNBLFlBQU0sZUFBZSxLQUFLLHNCQUFzQjtBQUNoRCxVQUFJLGdCQUFnQixDQUFDLEtBQUssWUFBWTtBQUNyQyxhQUFLLE1BQU0sR0FBRztBQUFBLE1BQ2YsV0FBVyxDQUFDLGdCQUFnQixLQUFLLFlBQVk7QUFDNUMsYUFBSyxNQUFNO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBckVBLE9BQU8sVUFBVTtBQUFBLEVBRVI7QUFBQSxFQUNBO0FBQUEsRUFDVDtBQUFBLEVBQ0E7QUFBQSxFQUVTO0FBQUEsRUFNQTtBQUFBLEVBMERULE1BQU0sV0FBNEI7QUFFakMsUUFBSSxVQUFVLFFBQVEsR0FBRztBQUN4QixXQUFLLGlCQUFpQixVQUFVLFlBQVksRUFBRSxVQUFVO0FBQUEsSUFDekQsT0FBTztBQUNOLFdBQUssaUJBQWlCLFNBQVM7QUFBQSxJQUNoQztBQUVBLFFBQUksS0FBSyxZQUFZO0FBQ3BCLFdBQUssUUFBUSxvQkFBb0IsSUFBSTtBQUFBLElBQ3RDLE9BQU87QUFDTixXQUFLLFFBQVEsaUJBQWlCLElBQUk7QUFDbEMsV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBaUIsV0FBNEI7QUFDNUMsVUFBTSxpQkFBaUIsVUFBVSxZQUFZO0FBQzdDLFVBQU0sWUFBWSxVQUFVLGFBQWE7QUFFekMsVUFBTSxhQUFhLGNBQWMsbUJBQW1CLE1BQ2pELGdDQUFnQyxRQUNoQyxnQ0FBZ0M7QUFFbkMsU0FBSyxZQUFZO0FBQUEsTUFDaEIsVUFBVTtBQUFBLE1BQ1YsWUFBWSxDQUFDLFVBQVU7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGlCQUFpQixZQUEwQjtBQUMxQyxVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsUUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVUsTUFBTSxXQUFXLEVBQUU7QUFDbkMsVUFBTSxXQUFXLEtBQUssUUFBUSxXQUFXLEVBQUUsSUFBSSxhQUFhLFFBQVE7QUFDcEUsVUFBTSxjQUFjLE1BQU0sZUFBZSxVQUFVO0FBQ25ELFVBQU0sU0FBUyxtQkFBbUIsYUFBYSxPQUFPO0FBQ3RELFVBQU0sZUFBZSxTQUFTLElBQUksT0FBTyxTQUFTLGFBQWEsU0FBUztBQUV4RSxRQUFJLHNCQUFzQjtBQUUxQixRQUFJLENBQUMsY0FBYztBQUNsQixZQUFNLHdCQUF3QixDQUFDLE9BQXdCO0FBQ3RELGNBQU0sVUFBVSxNQUFNLGVBQWUsRUFBRTtBQUN2QyxlQUFPLGFBQWEsS0FBSyxPQUFPO0FBQUEsTUFDakM7QUFFQSxZQUFNLFlBQVksTUFBTSxhQUFhO0FBQ3JDLFVBQUksYUFBYSxLQUFLLHNCQUFzQixhQUFhLENBQUMsR0FBRztBQUM1RCw4QkFBc0IsYUFBYTtBQUFBLE1BQ3BDLFdBQVcsYUFBYSxhQUFhLHNCQUFzQixhQUFhLENBQUMsR0FBRztBQUMzRSw4QkFBc0IsYUFBYTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUVBLFVBQU0sd0JBQXdCLFVBQVUsS0FBSyxNQUFNLGVBQWUsbUJBQW1CLENBQUMsSUFBSSxJQUFJO0FBRTlGLFNBQUssWUFBWTtBQUFBLE1BQ2hCLFVBQVUsRUFBRSxZQUFZLHFCQUFxQixRQUFRLHNCQUFzQjtBQUFBLE1BQzNFLFlBQVksQ0FBQyxnQ0FBZ0MsS0FBSztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRUEsd0JBQWlDO0FBQ2hDLFVBQU0saUJBQWlCLEtBQUssV0FBVztBQUN2QyxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLGlCQUFpQjtBQUNwRCxVQUFNLGdCQUFnQixjQUFjO0FBQUEsTUFBSyxXQUN4QyxlQUFlLGNBQWMsTUFBTSxtQkFBbUIsZUFBZSxjQUFjLE1BQU07QUFBQSxJQUMxRjtBQUNBLFFBQUksQ0FBQyxlQUFlO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxjQUFjLEtBQUssUUFBUSwyQkFBMkIsY0FBYztBQUMxRSxRQUFJLENBQUMsYUFBYTtBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sYUFBYSxLQUFLLFFBQVEsV0FBVyxFQUFFLElBQUksYUFBYSxVQUFVO0FBQ3hFLFdBQU8sWUFBWSxRQUFRLEtBQUssWUFBWSxRQUFRLFdBQVc7QUFBQSxFQUNoRTtBQUFBLEVBRUEsUUFBYztBQUNiLFFBQUksS0FBSyxZQUFZO0FBQ3BCLFdBQUssYUFBYTtBQUNsQixXQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsYUFBMEI7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsY0FBNkM7QUFDNUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsZUFBa0M7QUFDakMsVUFBTSxXQUFXLEtBQUssUUFBUSxZQUFZO0FBQzFDLFVBQU0sYUFBYSxXQUFXLEtBQUssUUFBUSx5QkFBeUIsUUFBUSxJQUFJLEtBQUssUUFBUSxVQUFVLGFBQWEsVUFBVTtBQUU5SCxTQUFLLFNBQVMsTUFBTSxZQUFZLDBDQUEwQyxHQUFHLFVBQVUsSUFBSTtBQUUzRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsUUFBSSxLQUFLLFlBQVk7QUFDcEIsV0FBSyxRQUFRLG9CQUFvQixJQUFJO0FBQUEsSUFDdEM7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFyTWEsNkJBQU47QUFBQSxFQW9CSjtBQUFBLEdBcEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
