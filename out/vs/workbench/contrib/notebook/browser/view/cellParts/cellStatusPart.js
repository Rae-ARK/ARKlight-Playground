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
import * as DOM from "../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { SimpleIconLabel } from "../../../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { toErrorMessage } from "../../../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { stripIcons } from "../../../../../../base/common/iconLabels.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, dispose } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { isThemeColor } from "../../../../../../editor/common/editorCommon.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { CellFocusMode } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
import { ClickTargetType } from "./cellWidgets.js";
import { CodeCellViewModel } from "../../viewModel/codeCellViewModel.js";
import { CellStatusbarAlignment } from "../../../common/notebookCommon.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
const $ = DOM.$;
let CellEditorStatusBar = class extends CellContentPart {
  constructor(_notebookEditor, _cellContainer, editorPart, _editor, _instantiationService, hoverService, configurationService, _themeService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._cellContainer = _cellContainer;
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this.leftItems = [];
    this.rightItems = [];
    this.width = 0;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.statusBarContainer = DOM.append(editorPart, $(".cell-statusbar-container"));
    this.statusBarContainer.tabIndex = -1;
    const leftItemsContainer = DOM.append(this.statusBarContainer, $(".cell-status-left"));
    const rightItemsContainer = DOM.append(this.statusBarContainer, $(".cell-status-right"));
    this.leftItemsContainer = DOM.append(leftItemsContainer, $(".cell-contributed-items.cell-contributed-items-left"));
    this.rightItemsContainer = DOM.append(rightItemsContainer, $(".cell-contributed-items.cell-contributed-items-right"));
    this.itemsDisposable = this._register(new DisposableStore());
    this.hoverDelegate = new class {
      constructor() {
        this._lastHoverHideTime = 0;
        this.showHover = (options) => {
          options.position = options.position ?? {};
          options.position.hoverPosition = HoverPosition.ABOVE;
          return hoverService.showInstantHover(options);
        };
        this.placement = "element";
      }
      get delay() {
        return Date.now() - this._lastHoverHideTime < 200 ? 0 : configurationService.getValue("workbench.hover.delay");
      }
      onDidHideHover() {
        this._lastHoverHideTime = Date.now();
      }
    }();
    this._register(this._themeService.onDidColorThemeChange(() => this.currentContext && this.updateContext(this.currentContext)));
    this._register(DOM.addDisposableListener(this.statusBarContainer, DOM.EventType.CLICK, (e) => {
      if (e.target === leftItemsContainer || e.target === rightItemsContainer || e.target === this.statusBarContainer) {
        this._onDidClick.fire({
          type: ClickTargetType.Container,
          event: e
        });
      } else {
        const target = e.target;
        let itemHasCommand = false;
        if (target && DOM.isHTMLElement(target)) {
          const targetElement = target;
          if (targetElement.classList.contains("cell-status-item-has-command")) {
            itemHasCommand = true;
          } else if (targetElement.parentElement && targetElement.parentElement.classList.contains("cell-status-item-has-command")) {
            itemHasCommand = true;
          }
        }
        if (itemHasCommand) {
          this._onDidClick.fire({
            type: ClickTargetType.ContributedCommandItem,
            event: e
          });
        } else {
          this._onDidClick.fire({
            type: ClickTargetType.ContributedTextItem,
            event: e
          });
        }
      }
    }));
  }
  didRenderCell(element) {
    if (this._notebookEditor.hasModel()) {
      const context = {
        ui: true,
        cell: element,
        notebookEditor: this._notebookEditor,
        $mid: MarshalledId.NotebookCellActionContext
      };
      this.updateContext(context);
    }
    if (this._editor) {
      const updateFocusModeForEditorEvent = () => {
        if (this._editor && (this._editor.hasWidgetFocus() || this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement))) {
          element.focusMode = CellFocusMode.Editor;
        } else {
          const currentMode = element.focusMode;
          if (currentMode === CellFocusMode.ChatInput) {
            element.focusMode = CellFocusMode.ChatInput;
          } else if (currentMode === CellFocusMode.Output && this._notebookEditor.hasWebviewFocus()) {
            element.focusMode = CellFocusMode.Output;
          } else {
            element.focusMode = CellFocusMode.Container;
          }
        }
      };
      this.cellDisposables.add(this._editor.onDidFocusEditorWidget(() => {
        updateFocusModeForEditorEvent();
      }));
      this.cellDisposables.add(this._editor.onDidBlurEditorWidget(() => {
        if (this._notebookEditor.hasEditorFocus() && !(this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement))) {
          updateFocusModeForEditorEvent();
        }
      }));
      this.cellDisposables.add(this.onDidClick((e) => {
        if (this.currentCell instanceof CodeCellViewModel && e.type !== ClickTargetType.ContributedCommandItem && this._editor) {
          const target = this._editor.getTargetAtClientPoint(e.event.clientX, e.event.clientY - this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(this.currentCell.internalMetadata, this.currentCell.uri));
          if (target?.position) {
            this._editor.setPosition(target.position);
            this._editor.focus();
          }
        }
      }));
    }
  }
  updateInternalLayoutNow(element) {
    this._cellContainer.classList.toggle("cell-statusbar-hidden", this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(element.internalMetadata, element.uri) === 0);
    const layoutInfo = element.layoutInfo;
    const width = layoutInfo.editorWidth;
    if (!width) {
      return;
    }
    this.width = width;
    this.statusBarContainer.style.width = `${width}px`;
    const maxItemWidth = this.getMaxItemWidth();
    this.leftItems.forEach((item) => item.maxWidth = maxItemWidth);
    this.rightItems.forEach((item) => item.maxWidth = maxItemWidth);
  }
  getMaxItemWidth() {
    return this.width / 2;
  }
  updateContext(context) {
    this.currentContext = context;
    this.itemsDisposable.clear();
    if (!this.currentContext) {
      return;
    }
    this.itemsDisposable.add(this.currentContext.cell.onDidChangeLayout(() => {
      if (this.currentContext) {
        this.updateInternalLayoutNow(this.currentContext.cell);
      }
    }));
    this.itemsDisposable.add(this.currentContext.cell.onDidChangeCellStatusBarItems(() => this.updateRenderedItems()));
    this.itemsDisposable.add(this.currentContext.notebookEditor.onDidChangeActiveCell(() => this.updateActiveCell()));
    this.updateInternalLayoutNow(this.currentContext.cell);
    this.updateActiveCell();
    this.updateRenderedItems();
  }
  updateActiveCell() {
    const isActiveCell = this.currentContext.notebookEditor.getActiveCell() === this.currentContext?.cell;
    this.statusBarContainer.classList.toggle("is-active-cell", isActiveCell);
  }
  updateRenderedItems() {
    const items = this.currentContext.cell.getCellStatusBarItems();
    items.sort((itemA, itemB) => {
      return (itemB.priority ?? 0) - (itemA.priority ?? 0);
    });
    const maxItemWidth = this.getMaxItemWidth();
    const newLeftItems = items.filter((item) => item.alignment === CellStatusbarAlignment.Left);
    const newRightItems = items.filter((item) => item.alignment === CellStatusbarAlignment.Right).reverse();
    const updateItems = (renderedItems, newItems, container) => {
      if (renderedItems.length > newItems.length) {
        const deleted = renderedItems.splice(newItems.length, renderedItems.length - newItems.length);
        for (const deletedItem of deleted) {
          deletedItem.container.remove();
          deletedItem.dispose();
        }
      }
      newItems.forEach((newLeftItem, i) => {
        const existingItem = renderedItems[i];
        if (existingItem) {
          existingItem.updateItem(newLeftItem, maxItemWidth);
        } else {
          const item = this._instantiationService.createInstance(CellStatusBarItem, this.currentContext, this.hoverDelegate, this._editor, newLeftItem, maxItemWidth);
          renderedItems.push(item);
          container.appendChild(item.container);
        }
      });
    };
    updateItems(this.leftItems, newLeftItems, this.leftItemsContainer);
    updateItems(this.rightItems, newRightItems, this.rightItemsContainer);
  }
  dispose() {
    super.dispose();
    dispose(this.leftItems);
    dispose(this.rightItems);
  }
};
CellEditorStatusBar = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IThemeService)
], CellEditorStatusBar);
let CellStatusBarItem = class extends Disposable {
  constructor(_context, _hoverDelegate, _editor, itemModel, maxWidth, _telemetryService, _commandService, _notificationService, _themeService, _hoverService) {
    super();
    this._context = _context;
    this._hoverDelegate = _hoverDelegate;
    this._editor = _editor;
    this._telemetryService = _telemetryService;
    this._commandService = _commandService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._hoverService = _hoverService;
    this.container = $(".cell-status-item");
    this._itemDisposables = this._register(new DisposableStore());
    this.updateItem(itemModel, maxWidth);
  }
  set maxWidth(v) {
    this.container.style.maxWidth = v + "px";
  }
  updateItem(item, maxWidth) {
    this._itemDisposables.clear();
    if (!this._currentItem || this._currentItem.text !== item.text) {
      this._itemDisposables.add(new SimpleIconLabel(this.container)).text = item.text.replace(/\n/g, " ");
    }
    const resolveColor = (color) => {
      return isThemeColor(color) ? this._themeService.getColorTheme().getColor(color.id)?.toString() || "" : color;
    };
    this.container.style.color = item.color ? resolveColor(item.color) : "";
    this.container.style.backgroundColor = item.backgroundColor ? resolveColor(item.backgroundColor) : "";
    this.container.style.opacity = item.opacity ? item.opacity : "";
    this.container.classList.toggle("cell-status-item-show-when-active", !!item.onlyShowWhenActive);
    if (typeof maxWidth === "number") {
      this.maxWidth = maxWidth;
    }
    let ariaLabel;
    let role;
    if (item.accessibilityInformation) {
      ariaLabel = item.accessibilityInformation.label;
      role = item.accessibilityInformation.role;
    } else {
      ariaLabel = item.text ? stripIcons(item.text).trim() : "";
    }
    this.container.setAttribute("aria-label", ariaLabel);
    this.container.setAttribute("role", role || "");
    if (item.tooltip) {
      const hoverContent = typeof item.tooltip === "string" ? item.tooltip : { markdown: item.tooltip, markdownNotSupportedFallback: void 0 };
      this._itemDisposables.add(this._hoverService.setupManagedHover(this._hoverDelegate, this.container, hoverContent));
    }
    this.container.classList.toggle("cell-status-item-has-command", !!item.command);
    if (item.command) {
      this.container.tabIndex = 0;
      this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.CLICK, (_e) => {
        this.executeCommand();
      }));
      this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
          this.executeCommand();
        }
      }));
    } else {
      this.container.removeAttribute("tabIndex");
    }
    this._currentItem = item;
  }
  async executeCommand() {
    const command = this._currentItem.command;
    if (!command) {
      return;
    }
    const id = typeof command === "string" ? command : command.id;
    const args = typeof command === "string" ? [] : command.arguments ?? [];
    if (typeof command === "string" || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
      args.unshift(this._context);
    }
    this._telemetryService.publicLog2("workbenchActionExecuted", { id, from: "cell status bar" });
    try {
      this._editor?.focus();
      await this._commandService.executeCommand(id, ...args);
    } catch (error) {
      this._notificationService.error(toErrorMessage(error));
    }
  }
};
CellStatusBarItem = __decorateClass([
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], CellStatusBarItem);
export {
  CellEditorStatusBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbFN0YXR1c1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTaW1wbGVJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL3NpbXBsZUljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGlzVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRm9jdXNNb2RlLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ2VsbENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2VsbFBhcnQuanMnO1xuaW1wb3J0IHsgQ2xpY2tUYXJnZXRUeXBlLCBJQ2xpY2tUYXJnZXQgfSBmcm9tICcuL2NlbGxXaWRnZXRzLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQsIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlLCBJSG92ZXJEZWxlZ2F0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5cbmV4cG9ydCBjbGFzcyBDZWxsRWRpdG9yU3RhdHVzQmFyIGV4dGVuZHMgQ2VsbENvbnRlbnRQYXJ0IHtcblx0cmVhZG9ubHkgc3RhdHVzQmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxlZnRJdGVtc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmlnaHRJdGVtc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbXNEaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0cHJpdmF0ZSBsZWZ0SXRlbXM6IENlbGxTdGF0dXNCYXJJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSByaWdodEl0ZW1zOiBDZWxsU3RhdHVzQmFySXRlbVtdID0gW107XG5cdHByaXZhdGUgd2lkdGg6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBjdXJyZW50Q29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDbGljazogRW1pdHRlcjxJQ2xpY2tUYXJnZXQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNsaWNrVGFyZ2V0PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljazogRXZlbnQ8SUNsaWNrVGFyZ2V0PiA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2VsbENvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZWRpdG9yUGFydDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zdGF0dXNCYXJDb250YWluZXIgPSBET00uYXBwZW5kKGVkaXRvclBhcnQsICQoJy5jZWxsLXN0YXR1c2Jhci1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zdGF0dXNCYXJDb250YWluZXIudGFiSW5kZXggPSAtMTtcblx0XHRjb25zdCBsZWZ0SXRlbXNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLCAkKCcuY2VsbC1zdGF0dXMtbGVmdCcpKTtcblx0XHRjb25zdCByaWdodEl0ZW1zQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnN0YXR1c0JhckNvbnRhaW5lciwgJCgnLmNlbGwtc3RhdHVzLXJpZ2h0JykpO1xuXHRcdHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyID0gRE9NLmFwcGVuZChsZWZ0SXRlbXNDb250YWluZXIsICQoJy5jZWxsLWNvbnRyaWJ1dGVkLWl0ZW1zLmNlbGwtY29udHJpYnV0ZWQtaXRlbXMtbGVmdCcpKTtcblx0XHR0aGlzLnJpZ2h0SXRlbXNDb250YWluZXIgPSBET00uYXBwZW5kKHJpZ2h0SXRlbXNDb250YWluZXIsICQoJy5jZWxsLWNvbnRyaWJ1dGVkLWl0ZW1zLmNlbGwtY29udHJpYnV0ZWQtaXRlbXMtcmlnaHQnKSk7XG5cblx0XHR0aGlzLml0ZW1zRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLmhvdmVyRGVsZWdhdGUgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJSG92ZXJEZWxlZ2F0ZSB7XG5cdFx0XHRwcml2YXRlIF9sYXN0SG92ZXJIaWRlVGltZTogbnVtYmVyID0gMDtcblxuXHRcdFx0cmVhZG9ubHkgc2hvd0hvdmVyID0gKG9wdGlvbnM6IElIb3ZlckRlbGVnYXRlT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRvcHRpb25zLnBvc2l0aW9uID0gb3B0aW9ucy5wb3NpdGlvbiA/PyB7fTtcblx0XHRcdFx0b3B0aW9ucy5wb3NpdGlvbi5ob3ZlclBvc2l0aW9uID0gSG92ZXJQb3NpdGlvbi5BQk9WRTtcblx0XHRcdFx0cmV0dXJuIGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKG9wdGlvbnMpO1xuXHRcdFx0fTtcblxuXHRcdFx0cmVhZG9ubHkgcGxhY2VtZW50ID0gJ2VsZW1lbnQnO1xuXG5cdFx0XHRnZXQgZGVsYXkoKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIERhdGUubm93KCkgLSB0aGlzLl9sYXN0SG92ZXJIaWRlVGltZSA8IDIwMFxuXHRcdFx0XHRcdD8gMCAgLy8gc2hvdyBpbnN0YW50bHkgd2hlbiBhIGhvdmVyIHdhcyByZWNlbnRseSBzaG93blxuXHRcdFx0XHRcdDogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignd29ya2JlbmNoLmhvdmVyLmRlbGF5Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG9uRGlkSGlkZUhvdmVyKCkge1xuXHRcdFx0XHR0aGlzLl9sYXN0SG92ZXJIaWRlVGltZSA9IERhdGUubm93KCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5jdXJyZW50Q29udGV4dCAmJiB0aGlzLnVwZGF0ZUNvbnRleHQodGhpcy5jdXJyZW50Q29udGV4dCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdGF0dXNCYXJDb250YWluZXIsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0ID09PSBsZWZ0SXRlbXNDb250YWluZXIgfHwgZS50YXJnZXQgPT09IHJpZ2h0SXRlbXNDb250YWluZXIgfHwgZS50YXJnZXQgPT09IHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyKSB7XG5cdFx0XHRcdC8vIGhpdCBvbiBlbXB0eSBzcGFjZVxuXHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoe1xuXHRcdFx0XHRcdHR5cGU6IENsaWNrVGFyZ2V0VHlwZS5Db250YWluZXIsXG5cdFx0XHRcdFx0ZXZlbnQ6IGVcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcblx0XHRcdFx0bGV0IGl0ZW1IYXNDb21tYW5kID0gZmFsc2U7XG5cdFx0XHRcdGlmICh0YXJnZXQgJiYgRE9NLmlzSFRNTEVsZW1lbnQodGFyZ2V0KSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldEVsZW1lbnQgPSA8SFRNTEVsZW1lbnQ+dGFyZ2V0O1xuXHRcdFx0XHRcdGlmICh0YXJnZXRFbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY2VsbC1zdGF0dXMtaXRlbS1oYXMtY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHRpdGVtSGFzQ29tbWFuZCA9IHRydWU7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0YXJnZXRFbGVtZW50LnBhcmVudEVsZW1lbnQgJiYgdGFyZ2V0RWxlbWVudC5wYXJlbnRFbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnY2VsbC1zdGF0dXMtaXRlbS1oYXMtY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHRpdGVtSGFzQ29tbWFuZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpdGVtSGFzQ29tbWFuZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZSh7XG5cdFx0XHRcdFx0XHR0eXBlOiBDbGlja1RhcmdldFR5cGUuQ29udHJpYnV0ZWRDb21tYW5kSXRlbSxcblx0XHRcdFx0XHRcdGV2ZW50OiBlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdGV4dFxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZSh7XG5cdFx0XHRcdFx0XHR0eXBlOiBDbGlja1RhcmdldFR5cGUuQ29udHJpYnV0ZWRUZXh0SXRlbSxcblx0XHRcdFx0XHRcdGV2ZW50OiBlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXG5cdG92ZXJyaWRlIGRpZFJlbmRlckNlbGwoZWxlbWVudDogSUNlbGxWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Y29uc3QgY29udGV4dDogKElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0ICYgeyAkbWlkOiBudW1iZXIgfSkgPSB7XG5cdFx0XHRcdHVpOiB0cnVlLFxuXHRcdFx0XHRjZWxsOiBlbGVtZW50LFxuXHRcdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5fbm90ZWJvb2tFZGl0b3IsXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0NlbGxBY3Rpb25Db250ZXh0XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZXh0KGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lZGl0b3IpIHtcblx0XHRcdC8vIEZvY3VzIE1vZGVcblx0XHRcdGNvbnN0IHVwZGF0ZUZvY3VzTW9kZUZvckVkaXRvckV2ZW50ID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZWRpdG9yICYmICh0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSB8fCAodGhpcy5zdGF0dXNCYXJDb250YWluZXIub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ICYmIHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLmNvbnRhaW5zKHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCkpKSkge1xuXHRcdFx0XHRcdGVsZW1lbnQuZm9jdXNNb2RlID0gQ2VsbEZvY3VzTW9kZS5FZGl0b3I7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudE1vZGUgPSBlbGVtZW50LmZvY3VzTW9kZTtcblx0XHRcdFx0XHRpZiAoY3VycmVudE1vZGUgPT09IENlbGxGb2N1c01vZGUuQ2hhdElucHV0KSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuQ2hhdElucHV0O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY3VycmVudE1vZGUgPT09IENlbGxGb2N1c01vZGUuT3V0cHV0ICYmIHRoaXMuX25vdGVib29rRWRpdG9yLmhhc1dlYnZpZXdGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuT3V0cHV0O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuQ29udGFpbmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5jZWxsRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdFx0dXBkYXRlRm9jdXNNb2RlRm9yRWRpdG9yRXZlbnQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuY2VsbERpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdFx0Ly8gdGhpcyBpcyBmb3IgYSBzcGVjaWFsIGNhc2U6XG5cdFx0XHRcdC8vIHVzZXJzIGNsaWNrIHRoZSBzdGF0dXMgYmFyIGVtcHR5IHNwYWNlLCB3aGljaCB3ZSB3aWxsIHRoZW4gZm9jdXMgdGhlIGVkaXRvclxuXHRcdFx0XHQvLyBzbyB3ZSBkb24ndCB3YW50IHRvIHVwZGF0ZSB0aGUgZm9jdXMgc3RhdGUgdG9vIGVhZ2VybHksIGl0IHdpbGwgYmUgdXBkYXRlZCB3aXRoIG9uRGlkRm9jdXNFZGl0b3JXaWRnZXRcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmhhc0VkaXRvckZvY3VzKCkgJiZcblx0XHRcdFx0XHQhKHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiB0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5jb250YWlucyh0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpKSkge1xuXHRcdFx0XHRcdHVwZGF0ZUZvY3VzTW9kZUZvckVkaXRvckV2ZW50KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW91c2UgY2xpY2sgaGFuZGxlcnNcblx0XHRcdHRoaXMuY2VsbERpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRDZWxsIGluc3RhbmNlb2YgQ29kZUNlbGxWaWV3TW9kZWwgJiYgZS50eXBlICE9PSBDbGlja1RhcmdldFR5cGUuQ29udHJpYnV0ZWRDb21tYW5kSXRlbSAmJiB0aGlzLl9lZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9lZGl0b3IuZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChlLmV2ZW50LmNsaWVudFgsIGUuZXZlbnQuY2xpZW50WSAtIHRoaXMuX25vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yU3RhdHVzYmFySGVpZ2h0KHRoaXMuY3VycmVudENlbGwuaW50ZXJuYWxNZXRhZGF0YSwgdGhpcy5jdXJyZW50Q2VsbC51cmkpKTtcblx0XHRcdFx0XHRpZiAodGFyZ2V0Py5wb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVJbnRlcm5hbExheW91dE5vdyhlbGVtZW50OiBJQ2VsbFZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdC8vIHRvZG9AcmVib3JuaXggbGF5ZXIgYnJlYWtlclxuXHRcdHRoaXMuX2NlbGxDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1zdGF0dXNiYXItaGlkZGVuJywgdGhpcy5fbm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVFZGl0b3JTdGF0dXNiYXJIZWlnaHQoZWxlbWVudC5pbnRlcm5hbE1ldGFkYXRhLCBlbGVtZW50LnVyaSkgPT09IDApO1xuXG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IGVsZW1lbnQubGF5b3V0SW5mbztcblx0XHRjb25zdCB3aWR0aCA9IGxheW91dEluZm8uZWRpdG9yV2lkdGg7XG5cdFx0aWYgKCF3aWR0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblxuXHRcdGNvbnN0IG1heEl0ZW1XaWR0aCA9IHRoaXMuZ2V0TWF4SXRlbVdpZHRoKCk7XG5cdFx0dGhpcy5sZWZ0SXRlbXMuZm9yRWFjaChpdGVtID0+IGl0ZW0ubWF4V2lkdGggPSBtYXhJdGVtV2lkdGgpO1xuXHRcdHRoaXMucmlnaHRJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5tYXhXaWR0aCA9IG1heEl0ZW1XaWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1heEl0ZW1XaWR0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy53aWR0aCAvIDI7XG5cdH1cblxuXHR1cGRhdGVDb250ZXh0KGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0dGhpcy5jdXJyZW50Q29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5pdGVtc0Rpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5jdXJyZW50Q29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaXRlbXNEaXNwb3NhYmxlLmFkZCh0aGlzLmN1cnJlbnRDb250ZXh0LmNlbGwub25EaWRDaGFuZ2VMYXlvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudENvbnRleHQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVJbnRlcm5hbExheW91dE5vdyh0aGlzLmN1cnJlbnRDb250ZXh0LmNlbGwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLml0ZW1zRGlzcG9zYWJsZS5hZGQodGhpcy5jdXJyZW50Q29udGV4dC5jZWxsLm9uRGlkQ2hhbmdlQ2VsbFN0YXR1c0Jhckl0ZW1zKCgpID0+IHRoaXMudXBkYXRlUmVuZGVyZWRJdGVtcygpKSk7XG5cdFx0dGhpcy5pdGVtc0Rpc3Bvc2FibGUuYWRkKHRoaXMuY3VycmVudENvbnRleHQubm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VBY3RpdmVDZWxsKCgpID0+IHRoaXMudXBkYXRlQWN0aXZlQ2VsbCgpKSk7XG5cdFx0dGhpcy51cGRhdGVJbnRlcm5hbExheW91dE5vdyh0aGlzLmN1cnJlbnRDb250ZXh0LmNlbGwpO1xuXHRcdHRoaXMudXBkYXRlQWN0aXZlQ2VsbCgpO1xuXHRcdHRoaXMudXBkYXRlUmVuZGVyZWRJdGVtcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY3RpdmVDZWxsKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzQWN0aXZlQ2VsbCA9IHRoaXMuY3VycmVudENvbnRleHQhLm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKSA9PT0gdGhpcy5jdXJyZW50Q29udGV4dD8uY2VsbDtcblx0XHR0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpcy1hY3RpdmUtY2VsbCcsIGlzQWN0aXZlQ2VsbCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlbmRlcmVkSXRlbXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmN1cnJlbnRDb250ZXh0IS5jZWxsLmdldENlbGxTdGF0dXNCYXJJdGVtcygpO1xuXHRcdGl0ZW1zLnNvcnQoKGl0ZW1BLCBpdGVtQikgPT4ge1xuXHRcdFx0cmV0dXJuIChpdGVtQi5wcmlvcml0eSA/PyAwKSAtIChpdGVtQS5wcmlvcml0eSA/PyAwKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1heEl0ZW1XaWR0aCA9IHRoaXMuZ2V0TWF4SXRlbVdpZHRoKCk7XG5cdFx0Y29uc3QgbmV3TGVmdEl0ZW1zID0gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5hbGlnbm1lbnQgPT09IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCk7XG5cdFx0Y29uc3QgbmV3UmlnaHRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uYWxpZ25tZW50ID09PSBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LlJpZ2h0KS5yZXZlcnNlKCk7XG5cblx0XHRjb25zdCB1cGRhdGVJdGVtcyA9IChyZW5kZXJlZEl0ZW1zOiBDZWxsU3RhdHVzQmFySXRlbVtdLCBuZXdJdGVtczogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1bXSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0aWYgKHJlbmRlcmVkSXRlbXMubGVuZ3RoID4gbmV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGRlbGV0ZWQgPSByZW5kZXJlZEl0ZW1zLnNwbGljZShuZXdJdGVtcy5sZW5ndGgsIHJlbmRlcmVkSXRlbXMubGVuZ3RoIC0gbmV3SXRlbXMubGVuZ3RoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBkZWxldGVkSXRlbSBvZiBkZWxldGVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlZEl0ZW0uY29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0XHRcdGRlbGV0ZWRJdGVtLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRuZXdJdGVtcy5mb3JFYWNoKChuZXdMZWZ0SXRlbSwgaSkgPT4ge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0l0ZW0gPSByZW5kZXJlZEl0ZW1zW2ldO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdJdGVtKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmdJdGVtLnVwZGF0ZUl0ZW0obmV3TGVmdEl0ZW0sIG1heEl0ZW1XaWR0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENlbGxTdGF0dXNCYXJJdGVtLCB0aGlzLmN1cnJlbnRDb250ZXh0ISwgdGhpcy5ob3ZlckRlbGVnYXRlLCB0aGlzLl9lZGl0b3IsIG5ld0xlZnRJdGVtLCBtYXhJdGVtV2lkdGgpO1xuXHRcdFx0XHRcdHJlbmRlcmVkSXRlbXMucHVzaChpdGVtKTtcblx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaXRlbS5jb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0dXBkYXRlSXRlbXModGhpcy5sZWZ0SXRlbXMsIG5ld0xlZnRJdGVtcywgdGhpcy5sZWZ0SXRlbXNDb250YWluZXIpO1xuXHRcdHVwZGF0ZUl0ZW1zKHRoaXMucmlnaHRJdGVtcywgbmV3UmlnaHRJdGVtcywgdGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5sZWZ0SXRlbXMpO1xuXHRcdGRpc3Bvc2UodGhpcy5yaWdodEl0ZW1zKTtcblx0fVxufVxuXG5jbGFzcyBDZWxsU3RhdHVzQmFySXRlbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGNvbnRhaW5lciA9ICQoJy5jZWxsLXN0YXR1cy1pdGVtJyk7XG5cblx0c2V0IG1heFdpZHRoKHY6IG51bWJlcikge1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLm1heFdpZHRoID0gdiArICdweCc7XG5cdH1cblxuXHRwcml2YXRlIF9jdXJyZW50SXRlbSE6IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0aXRlbU1vZGVsOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSxcblx0XHRtYXhXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUl0ZW0oaXRlbU1vZGVsLCBtYXhXaWR0aCk7XG5cdH1cblxuXHR1cGRhdGVJdGVtKGl0ZW06IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtLCBtYXhXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRJdGVtIHx8IHRoaXMuX2N1cnJlbnRJdGVtLnRleHQgIT09IGl0ZW0udGV4dCkge1xuXHRcdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKHRoaXMuY29udGFpbmVyKSkudGV4dCA9IGl0ZW0udGV4dC5yZXBsYWNlKC9cXG4vZywgJyAnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlQ29sb3IgPSAoY29sb3I6IFRoZW1lQ29sb3IgfCBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBpc1RoZW1lQ29sb3IoY29sb3IpID9cblx0XHRcdFx0KHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoY29sb3IuaWQpPy50b1N0cmluZygpIHx8ICcnKSA6XG5cdFx0XHRcdGNvbG9yO1xuXHRcdH07XG5cblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5jb2xvciA9IGl0ZW0uY29sb3IgPyByZXNvbHZlQ29sb3IoaXRlbS5jb2xvcikgOiAnJztcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBpdGVtLmJhY2tncm91bmRDb2xvciA/IHJlc29sdmVDb2xvcihpdGVtLmJhY2tncm91bmRDb2xvcikgOiAnJztcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5vcGFjaXR5ID0gaXRlbS5vcGFjaXR5ID8gaXRlbS5vcGFjaXR5IDogJyc7XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjZWxsLXN0YXR1cy1pdGVtLXNob3ctd2hlbi1hY3RpdmUnLCAhIWl0ZW0ub25seVNob3dXaGVuQWN0aXZlKTtcblxuXHRcdGlmICh0eXBlb2YgbWF4V2lkdGggPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLm1heFdpZHRoID0gbWF4V2lkdGg7XG5cdFx0fVxuXG5cdFx0bGV0IGFyaWFMYWJlbDogc3RyaW5nO1xuXHRcdGxldCByb2xlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGl0ZW0uYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBpdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbi5sYWJlbDtcblx0XHRcdHJvbGUgPSBpdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbi5yb2xlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBpdGVtLnRleHQgPyBzdHJpcEljb25zKGl0ZW0udGV4dCkudHJpbSgpIDogJyc7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCByb2xlIHx8ICcnKTtcblxuXHRcdGlmIChpdGVtLnRvb2x0aXApIHtcblx0XHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IHR5cGVvZiBpdGVtLnRvb2x0aXAgPT09ICdzdHJpbmcnID8gaXRlbS50b29sdGlwIDogeyBtYXJrZG93bjogaXRlbS50b29sdGlwLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiB1bmRlZmluZWQgfSBzYXRpc2ZpZXMgSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZztcblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMuX2hvdmVyRGVsZWdhdGUsIHRoaXMuY29udGFpbmVyLCBob3ZlckNvbnRlbnQpKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjZWxsLXN0YXR1cy1pdGVtLWhhcy1jb21tYW5kJywgISFpdGVtLmNvbW1hbmQpO1xuXHRcdGlmIChpdGVtLmNvbW1hbmQpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnRhYkluZGV4ID0gMDtcblxuXHRcdFx0dGhpcy5faXRlbURpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBET00uRXZlbnRUeXBlLkNMSUNLLCBfZSA9PiB7XG5cdFx0XHRcdHRoaXMuZXhlY3V0ZUNvbW1hbmQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0XHR0aGlzLmV4ZWN1dGVDb21tYW5kKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCd0YWJJbmRleCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRJdGVtID0gaXRlbTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhlY3V0ZUNvbW1hbmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX2N1cnJlbnRJdGVtLmNvbW1hbmQ7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSB0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgPyBjb21tYW5kIDogY29tbWFuZC5pZDtcblx0XHRjb25zdCBhcmdzID0gdHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnID8gW10gOiBjb21tYW5kLmFyZ3VtZW50cyA/PyBbXTtcblxuXHRcdGlmICh0eXBlb2YgY29tbWFuZCA9PT0gJ3N0cmluZycgfHwgIWNvbW1hbmQuYXJndW1lbnRzIHx8ICFBcnJheS5pc0FycmF5KGNvbW1hbmQuYXJndW1lbnRzKSB8fCBjb21tYW5kLmFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGFyZ3MudW5zaGlmdCh0aGlzLl9jb250ZXh0KTtcblx0XHR9XG5cblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZCwgZnJvbTogJ2NlbGwgc3RhdHVzIGJhcicgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2VkaXRvcj8uZm9jdXMoKTtcblx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGlkLCAuLi5hcmdzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixlQUFlO0FBQ3JELFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRzlCLFNBQVMscUJBQThEO0FBQ3ZFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXFDO0FBQzlDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQTBEO0FBRW5FLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRzlCLE1BQU0sSUFBSSxJQUFJO0FBR1AsSUFBTSxzQkFBTixjQUFrQyxnQkFBZ0I7QUFBQSxFQWlCeEQsWUFDa0IsaUJBQ0EsZ0JBQ2pCLFlBQ2lCLFNBQ3VCLHVCQUN6QixjQUNRLHNCQUNTLGVBQy9CO0FBQ0QsVUFBTTtBQVRXO0FBQ0E7QUFFQTtBQUN1QjtBQUdSO0FBbEJqQyxTQUFR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
