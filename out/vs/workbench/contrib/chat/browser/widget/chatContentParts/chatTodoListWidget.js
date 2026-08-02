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
import * as dom from "../../../../../../base/browser/dom.js";
import { trackFocus } from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { IconLabel } from "../../../../../../base/browser/ui/iconLabel/iconLabel.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { localize } from "../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { IChatTodoListService } from "../../../common/tools/chatTodoListService.js";
class TodoListDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return TodoListRenderer.TEMPLATE_ID;
  }
}
const _TodoListRenderer = class _TodoListRenderer {
  constructor() {
    this.templateId = _TodoListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const todoElement = dom.append(container, dom.$("li.todo-item"));
    todoElement.setAttribute("role", "listitem");
    const statusIcon = dom.append(todoElement, dom.$(".todo-status-icon.codicon"));
    statusIcon.setAttribute("aria-hidden", "true");
    const todoContent = dom.append(todoElement, dom.$(".todo-content"));
    const iconLabel = templateDisposables.add(new IconLabel(todoContent, { supportIcons: false }));
    return { templateDisposables, todoElement, statusIcon, iconLabel };
  }
  renderElement(todo, index, templateData) {
    const { todoElement, statusIcon, iconLabel } = templateData;
    statusIcon.className = `todo-status-icon codicon ${this.getStatusIconClass(todo.status)}`;
    statusIcon.style.color = this.getStatusIconColor(todo.status);
    iconLabel.setLabel(todo.title);
    const statusText = this.getStatusText(todo.status);
    const ariaLabel = localize("chat.todoList.item", "{0}, {1}", todo.title, statusText);
    todoElement.setAttribute("aria-label", ariaLabel);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  getStatusText(status) {
    switch (status) {
      case "completed":
        return localize("chat.todoList.status.completed", "completed");
      case "in-progress":
        return localize("chat.todoList.status.inProgress", "in progress");
      case "not-started":
      default:
        return localize("chat.todoList.status.notStarted", "not started");
    }
  }
  getStatusIconClass(status) {
    switch (status) {
      case "completed":
        return "codicon-pass";
      case "in-progress":
        return "codicon-record";
      case "not-started":
      default:
        return "codicon-circle-outline";
    }
  }
  getStatusIconColor(status) {
    switch (status) {
      case "completed":
        return "var(--vscode-charts-green)";
      case "in-progress":
        return "var(--vscode-charts-blue)";
      case "not-started":
      default:
        return "var(--vscode-foreground)";
    }
  }
};
_TodoListRenderer.TEMPLATE_ID = "todoListRenderer";
let TodoListRenderer = _TodoListRenderer;
let ChatTodoListWidget = class extends Disposable {
  constructor(chatTodoListService, instantiationService, contextKeyService, telemetryService) {
    super();
    this.chatTodoListService = chatTodoListService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.telemetryService = telemetryService;
    this._isExpanded = false;
    this._userManuallyExpanded = false;
    this._inChatTodoListContextKey = ChatContextKeys.inChatTodoList.bindTo(contextKeyService);
    this.domNode = this.createChatTodoWidget();
    const focusTracker = this._register(trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => this._inChatTodoListContextKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this._inChatTodoListContextKey.set(false)));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([ChatContextKeys.requestInProgress.key]))) {
        this.updateClearButtonState();
      }
    }));
  }
  get height() {
    return this.domNode.style.display === "none" ? 0 : this.domNode.offsetHeight;
  }
  hideWidget() {
    this.domNode.style.display = "none";
  }
  createChatTodoWidget() {
    const container = dom.$(".chat-todo-list-widget");
    container.style.display = "none";
    const expandoContainer = dom.$(".todo-list-expand");
    this.expandoButton = this._register(new Button(expandoContainer, {
      supportIcons: true
    }));
    this.expandoButton.element.setAttribute("aria-expanded", String(this._isExpanded));
    this.expandoButton.element.setAttribute("aria-controls", "todo-list-container");
    const titleSection = dom.$(".todo-list-title-section");
    this.expandIcon = dom.$(".expand-icon.codicon");
    this.expandIcon.classList.add(this._isExpanded ? "codicon-chevron-down" : "codicon-chevron-right");
    this.expandIcon.setAttribute("aria-hidden", "true");
    this.titleElement = dom.$(".todo-list-title");
    this.titleElement.id = "todo-list-title";
    this.titleElement.textContent = localize("chat.todoList.title", "Todos");
    this.clearButtonContainer = dom.$(".todo-clear-button-container");
    this.createClearButton();
    titleSection.appendChild(this.expandIcon);
    titleSection.appendChild(this.titleElement);
    this.expandoButton.element.appendChild(titleSection);
    this.expandoButton.element.appendChild(this.clearButtonContainer);
    this.todoListContainer = dom.$(".todo-list-container");
    this.todoListContainer.style.display = this._isExpanded ? "block" : "none";
    this.todoListContainer.id = "todo-list-container";
    this.todoListContainer.setAttribute("role", "list");
    this.todoListContainer.setAttribute("aria-labelledby", "todo-list-title");
    container.appendChild(expandoContainer);
    container.appendChild(this.todoListContainer);
    this._register(this.expandoButton.onDidClick(() => {
      this.toggleExpanded();
    }));
    return container;
  }
  createClearButton() {
    this.clearButton = new Button(this.clearButtonContainer, {
      supportIcons: true,
      ariaLabel: localize("chat.todoList.clearButton", "Clear all todos")
    });
    this.clearButton.element.tabIndex = 0;
    this.clearButton.icon = Codicon.clearAll;
    this._register(this.clearButton);
    this._register(this.clearButton.onDidClick(() => {
      const todoCount = this._currentSessionResource ? this.chatTodoListService.getTodos(this._currentSessionResource).length : 0;
      this.telemetryService.publicLog2(
        "chatTodoListWidget",
        {
          action: "clear",
          todoCount
        }
      );
      this.clearAllTodos();
    }));
  }
  render(sessionResource) {
    if (!sessionResource) {
      this.hideWidget();
      return;
    }
    if (!isEqual(this._currentSessionResource, sessionResource)) {
      this._userManuallyExpanded = false;
      this._currentSessionResource = sessionResource;
      this.hideWidget();
    }
    this.updateTodoDisplay();
  }
  clear(sessionResource, force = false) {
    if (!sessionResource || this.domNode.style.display === "none") {
      return;
    }
    const currentTodos = this.chatTodoListService.getTodos(sessionResource);
    const shouldClear = force || currentTodos.length > 0 && !currentTodos.some((todo) => todo.status !== "completed");
    if (shouldClear) {
      this.clearAllTodos();
    }
  }
  hasTodos() {
    return this.domNode.classList.contains("has-todos") && !!this._todoList && this._todoList.length > 0;
  }
  hasFocus() {
    return dom.isAncestorOfActiveElement(this.todoListContainer);
  }
  focus() {
    if (!this.hasTodos()) {
      return false;
    }
    if (!this._isExpanded) {
      this.toggleExpanded();
    }
    this._todoList?.domFocus();
    return this.hasFocus();
  }
  updateTodoDisplay() {
    if (!this._currentSessionResource) {
      return;
    }
    const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
    const shouldShow = todoList.length > 0;
    if (!shouldShow) {
      this.domNode.classList.remove("has-todos");
      this.hideWidget();
      return;
    }
    this.domNode.classList.add("has-todos");
    this.renderTodoList(todoList);
    this.domNode.style.display = "block";
  }
  renderTodoList(todoList) {
    this.updateTitleElement(this.titleElement, todoList);
    const allIncomplete = todoList.every((todo) => todo.status === "not-started");
    if (allIncomplete) {
      this._userManuallyExpanded = false;
    }
    if (!this._todoList) {
      this._todoList = this._register(this.instantiationService.createInstance(
        WorkbenchList,
        "ChatTodoListRenderer",
        this.todoListContainer,
        new TodoListDelegate(),
        [new TodoListRenderer()],
        {
          alwaysConsumeMouseWheel: false,
          accessibilityProvider: {
            getAriaLabel: (todo) => {
              const statusText = this.getStatusText(todo.status);
              return localize("chat.todoList.item", "{0}, {1}", todo.title, statusText);
            },
            getWidgetAriaLabel: () => localize("chatTodoList", "Chat Todo List")
          }
        }
      ));
    }
    const maxItemsShown = 6;
    const itemsShown = Math.min(todoList.length, maxItemsShown);
    const height = itemsShown * 22;
    this._todoList.layout(height);
    this._todoList.getHTMLElement().style.height = `${height}px`;
    this._todoList.splice(0, this._todoList.length, todoList);
    const hasInProgressTask = todoList.some((todo) => todo.status === "in-progress");
    const hasCompletedTask = todoList.some((todo) => todo.status === "completed");
    this.updateClearButtonState();
    if ((hasInProgressTask || hasCompletedTask) && this._isExpanded && !this._userManuallyExpanded) {
      this._isExpanded = false;
      this.expandoButton.element.setAttribute("aria-expanded", "false");
      this.todoListContainer.style.display = "none";
      this.expandIcon.classList.remove("codicon-chevron-down");
      this.expandIcon.classList.add("codicon-chevron-right");
      this.updateTitleElement(this.titleElement, todoList);
    }
  }
  toggleExpanded() {
    this._isExpanded = !this._isExpanded;
    this._userManuallyExpanded = true;
    this.expandIcon.classList.toggle("codicon-chevron-down", this._isExpanded);
    this.expandIcon.classList.toggle("codicon-chevron-right", !this._isExpanded);
    this.todoListContainer.style.display = this._isExpanded ? "block" : "none";
    const todoCount = this._currentSessionResource ? this.chatTodoListService.getTodos(this._currentSessionResource).length : 0;
    this.telemetryService.publicLog2(
      "chatTodoListWidget",
      {
        action: this._isExpanded ? "expand" : "collapse",
        todoCount
      }
    );
    if (this._currentSessionResource) {
      const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
      this.updateTitleElement(this.titleElement, todoList);
    }
  }
  clearAllTodos() {
    if (!this._currentSessionResource) {
      return;
    }
    this.chatTodoListService.setTodos(this._currentSessionResource, []);
    this.hideWidget();
  }
  updateClearButtonState() {
    if (!this._currentSessionResource) {
      return;
    }
    const todoList = this.chatTodoListService.getTodos(this._currentSessionResource);
    const hasInProgressTask = todoList.some((todo) => todo.status === "in-progress");
    const isRequestInProgress = ChatContextKeys.requestInProgress.getValue(this.contextKeyService) ?? false;
    const shouldDisable = isRequestInProgress && hasInProgressTask;
    this.clearButton.enabled = !shouldDisable;
    if (shouldDisable) {
      this.clearButton.setTitle(localize("chat.todoList.clearButton.disabled", "Cannot clear todos while a task is in progress"));
    } else {
      this.clearButton.setTitle(localize("chat.todoList.clearButton", "Clear all todos"));
    }
  }
  updateTitleElement(titleElement, todoList) {
    titleElement.textContent = "";
    const completedCount = todoList.filter((todo) => todo.status === "completed").length;
    const totalCount = todoList.length;
    const inProgressTodos = todoList.filter((todo) => todo.status === "in-progress");
    const firstInProgressTodo = inProgressTodos.length > 0 ? inProgressTodos[0] : void 0;
    const notStartedTodos = todoList.filter((todo) => todo.status === "not-started");
    const firstNotStartedTodo = notStartedTodos.length > 0 ? notStartedTodos[0] : void 0;
    const currentTaskNumber = inProgressTodos.length > 0 ? completedCount + 1 : Math.max(1, completedCount);
    const expandButtonLabel = this._isExpanded ? localize("chat.todoList.collapseButton", "Collapse Todos") : localize("chat.todoList.expandButton", "Expand Todos");
    this.expandoButton.element.setAttribute("aria-label", expandButtonLabel);
    this.expandoButton.element.setAttribute("aria-expanded", this._isExpanded ? "true" : "false");
    if (this._isExpanded) {
      const titleText = dom.$("span");
      titleText.textContent = totalCount > 0 ? localize("chat.todoList.titleWithCount", "Todos ({0}/{1})", currentTaskNumber, totalCount) : localize("chat.todoList.title", "Todos");
      titleElement.appendChild(titleText);
    } else {
      const todoToShow = firstInProgressTodo || firstNotStartedTodo;
      if (todoToShow) {
        const icon = dom.$(".codicon");
        if (todoToShow === firstInProgressTodo) {
          icon.classList.add("codicon-record");
          icon.style.color = "var(--vscode-charts-blue)";
        } else {
          icon.classList.add("codicon-circle-outline");
          icon.style.color = "var(--vscode-foreground)";
        }
        icon.style.marginRight = "4px";
        icon.style.verticalAlign = "middle";
        titleElement.appendChild(icon);
        const todoText = dom.$("span");
        todoText.textContent = localize("chat.todoList.currentTask", "{0} ({1}/{2})", todoToShow.title, currentTaskNumber, totalCount);
        todoText.style.verticalAlign = "middle";
        todoText.style.overflow = "hidden";
        todoText.style.textOverflow = "ellipsis";
        todoText.style.whiteSpace = "nowrap";
        todoText.style.minWidth = "0";
        titleElement.appendChild(todoText);
      } else if (completedCount > 0 && completedCount === totalCount) {
        const doneText = dom.$("span");
        doneText.textContent = localize("chat.todoList.titleWithCount", "Todos ({0}/{1})", totalCount, totalCount);
        doneText.style.verticalAlign = "middle";
        titleElement.appendChild(doneText);
      }
    }
  }
  getStatusText(status) {
    switch (status) {
      case "completed":
        return localize("chat.todoList.status.completed", "completed");
      case "in-progress":
        return localize("chat.todoList.status.inProgress", "in progress");
      case "not-started":
      default:
        return localize("chat.todoList.status.notStarted", "not started");
    }
  }
};
ChatTodoListWidget = __decorateClass([
  __decorateParam(0, IChatTodoListService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ITelemetryService)
], ChatTodoListWidget);
export {
  ChatTodoListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9kb0xpc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRUb2RvLCBJQ2hhdFRvZG9MaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcblxuY2xhc3MgVG9kb0xpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElDaGF0VG9kbz4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSUNoYXRUb2RvKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElDaGF0VG9kbyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFRvZG9MaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUb2RvTGlzdFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSB0b2RvRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN0YXR1c0ljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpY29uTGFiZWw6IEljb25MYWJlbDtcbn1cblxuY2xhc3MgVG9kb0xpc3RSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUNoYXRUb2RvLCBJVG9kb0xpc3RUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgVEVNUExBVEVfSUQgPSAndG9kb0xpc3RSZW5kZXJlcic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFRvZG9MaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUb2RvTGlzdFRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHRvZG9FbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdsaS50b2RvLWl0ZW0nKSk7XG5cdFx0dG9kb0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3RpdGVtJyk7XG5cblx0XHRjb25zdCBzdGF0dXNJY29uID0gZG9tLmFwcGVuZCh0b2RvRWxlbWVudCwgZG9tLiQoJy50b2RvLXN0YXR1cy1pY29uLmNvZGljb24nKSk7XG5cdFx0c3RhdHVzSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IHRvZG9Db250ZW50ID0gZG9tLmFwcGVuZCh0b2RvRWxlbWVudCwgZG9tLiQoJy50b2RvLWNvbnRlbnQnKSk7XG5cdFx0Y29uc3QgaWNvbkxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEljb25MYWJlbCh0b2RvQ29udGVudCwgeyBzdXBwb3J0SWNvbnM6IGZhbHNlIH0pKTtcblxuXHRcdHJldHVybiB7IHRlbXBsYXRlRGlzcG9zYWJsZXMsIHRvZG9FbGVtZW50LCBzdGF0dXNJY29uLCBpY29uTGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQodG9kbzogSUNoYXRUb2RvLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2RvTGlzdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgeyB0b2RvRWxlbWVudCwgc3RhdHVzSWNvbiwgaWNvbkxhYmVsIH0gPSB0ZW1wbGF0ZURhdGE7XG5cblx0XHQvLyBVcGRhdGUgc3RhdHVzIGljb25cblx0XHRzdGF0dXNJY29uLmNsYXNzTmFtZSA9IGB0b2RvLXN0YXR1cy1pY29uIGNvZGljb24gJHt0aGlzLmdldFN0YXR1c0ljb25DbGFzcyh0b2RvLnN0YXR1cyl9YDtcblx0XHRzdGF0dXNJY29uLnN0eWxlLmNvbG9yID0gdGhpcy5nZXRTdGF0dXNJY29uQ29sb3IodG9kby5zdGF0dXMpO1xuXG5cdFx0aWNvbkxhYmVsLnNldExhYmVsKHRvZG8udGl0bGUpO1xuXG5cdFx0Ly8gVXBkYXRlIGFyaWEtbGFiZWxcblx0XHRjb25zdCBzdGF0dXNUZXh0ID0gdGhpcy5nZXRTdGF0dXNUZXh0KHRvZG8uc3RhdHVzKTtcblx0XHRjb25zdCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5pdGVtJywgJ3swfSwgezF9JywgdG9kby50aXRsZSwgc3RhdHVzVGV4dCk7XG5cdFx0dG9kb0VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUb2RvTGlzdFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdGF0dXNUZXh0KHN0YXR1czogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LnN0YXR1cy5jb21wbGV0ZWQnLCAnY29tcGxldGVkJyk7XG5cdFx0XHRjYXNlICdpbi1wcm9ncmVzcyc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5zdGF0dXMuaW5Qcm9ncmVzcycsICdpbiBwcm9ncmVzcycpO1xuXHRcdFx0Y2FzZSAnbm90LXN0YXJ0ZWQnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LnN0YXR1cy5ub3RTdGFydGVkJywgJ25vdCBzdGFydGVkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdGF0dXNJY29uQ2xhc3Moc3RhdHVzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdjb21wbGV0ZWQnOlxuXHRcdFx0XHRyZXR1cm4gJ2NvZGljb24tcGFzcyc7XG5cdFx0XHRjYXNlICdpbi1wcm9ncmVzcyc6XG5cdFx0XHRcdHJldHVybiAnY29kaWNvbi1yZWNvcmQnO1xuXHRcdFx0Y2FzZSAnbm90LXN0YXJ0ZWQnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuICdjb2RpY29uLWNpcmNsZS1vdXRsaW5lJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YXR1c0ljb25Db2xvcihzdGF0dXM6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgJ2NvbXBsZXRlZCc6XG5cdFx0XHRcdHJldHVybiAndmFyKC0tdnNjb2RlLWNoYXJ0cy1ncmVlbiknO1xuXHRcdFx0Y2FzZSAnaW4tcHJvZ3Jlc3MnOlxuXHRcdFx0XHRyZXR1cm4gJ3ZhcigtLXZzY29kZS1jaGFydHMtYmx1ZSknO1xuXHRcdFx0Y2FzZSAnbm90LXN0YXJ0ZWQnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRvZG9MaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF9pc0V4cGFuZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3VzZXJNYW51YWxseUV4cGFuZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgZXhwYW5kb0J1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBleHBhbmRJY29uITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9kb0xpc3RDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjbGVhckJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNsZWFyQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIF9jdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RvZG9MaXN0OiBXb3JrYmVuY2hMaXN0PElDaGF0VG9kbz4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5DaGF0VG9kb0xpc3RDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5DaGF0VG9kb0xpc3RDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmluQ2hhdFRvZG9MaXN0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5jcmVhdGVDaGF0VG9kb1dpZGdldCgpO1xuXG5cdFx0Ly8gVHJhY2sgZm9jdXMgc3RhdGUgZm9yIGNvbnRleHQga2V5XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIodHJhY2tGb2N1cyh0aGlzLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9pbkNoYXRUb2RvTGlzdENvbnRleHRLZXkuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLl9pbkNoYXRUb2RvTGlzdENvbnRleHRLZXkuc2V0KGZhbHNlKSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGNvbnRleHQga2V5IGNoYW5nZXMgdG8gdXBkYXRlIGNsZWFyIGJ1dHRvbiBzdGF0ZSB3aGVuIHJlcXVlc3Qgc3RhdGUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUobmV3IFNldChbQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RJblByb2dyZXNzLmtleV0pKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNsZWFyQnV0dG9uU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnID8gMCA6IHRoaXMuZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNoYXRUb2RvV2lkZ2V0KCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtdG9kby1saXN0LXdpZGdldCcpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Y29uc3QgZXhwYW5kb0NvbnRhaW5lciA9IGRvbS4kKCcudG9kby1saXN0LWV4cGFuZCcpO1xuXHRcdHRoaXMuZXhwYW5kb0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZXhwYW5kb0NvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlXG5cdFx0fSkpO1xuXHRcdHRoaXMuZXhwYW5kb0J1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyh0aGlzLl9pc0V4cGFuZGVkKSk7XG5cdFx0dGhpcy5leHBhbmRvQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgJ3RvZG8tbGlzdC1jb250YWluZXInKTtcblxuXHRcdC8vIENyZWF0ZSB0aXRsZSBzZWN0aW9uIHRvIGdyb3VwIGljb24gYW5kIHRpdGxlXG5cdFx0Y29uc3QgdGl0bGVTZWN0aW9uID0gZG9tLiQoJy50b2RvLWxpc3QtdGl0bGUtc2VjdGlvbicpO1xuXG5cdFx0dGhpcy5leHBhbmRJY29uID0gZG9tLiQoJy5leHBhbmQtaWNvbi5jb2RpY29uJyk7XG5cdFx0dGhpcy5leHBhbmRJY29uLmNsYXNzTGlzdC5hZGQodGhpcy5faXNFeHBhbmRlZCA/ICdjb2RpY29uLWNoZXZyb24tZG93bicgOiAnY29kaWNvbi1jaGV2cm9uLXJpZ2h0Jyk7XG5cdFx0dGhpcy5leHBhbmRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0dGhpcy50aXRsZUVsZW1lbnQgPSBkb20uJCgnLnRvZG8tbGlzdC10aXRsZScpO1xuXHRcdHRoaXMudGl0bGVFbGVtZW50LmlkID0gJ3RvZG8tbGlzdC10aXRsZSc7XG5cdFx0dGhpcy50aXRsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC50aXRsZScsICdUb2RvcycpO1xuXG5cdFx0Ly8gQWRkIGNsZWFyIGJ1dHRvbiBjb250YWluZXIgdG8gdGhlIGV4cGFuZCBlbGVtZW50XG5cdFx0dGhpcy5jbGVhckJ1dHRvbkNvbnRhaW5lciA9IGRvbS4kKCcudG9kby1jbGVhci1idXR0b24tY29udGFpbmVyJyk7XG5cdFx0dGhpcy5jcmVhdGVDbGVhckJ1dHRvbigpO1xuXG5cdFx0dGl0bGVTZWN0aW9uLmFwcGVuZENoaWxkKHRoaXMuZXhwYW5kSWNvbik7XG5cdFx0dGl0bGVTZWN0aW9uLmFwcGVuZENoaWxkKHRoaXMudGl0bGVFbGVtZW50KTtcblxuXHRcdHRoaXMuZXhwYW5kb0J1dHRvbi5lbGVtZW50LmFwcGVuZENoaWxkKHRpdGxlU2VjdGlvbik7XG5cdFx0dGhpcy5leHBhbmRvQnV0dG9uLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5jbGVhckJ1dHRvbkNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnRvZG9MaXN0Q29udGFpbmVyID0gZG9tLiQoJy50b2RvLWxpc3QtY29udGFpbmVyJyk7XG5cdFx0dGhpcy50b2RvTGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdGhpcy5faXNFeHBhbmRlZCA/ICdibG9jaycgOiAnbm9uZSc7XG5cdFx0dGhpcy50b2RvTGlzdENvbnRhaW5lci5pZCA9ICd0b2RvLWxpc3QtY29udGFpbmVyJztcblx0XHR0aGlzLnRvZG9MaXN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Jyk7XG5cdFx0dGhpcy50b2RvTGlzdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWxsZWRieScsICd0b2RvLWxpc3QtdGl0bGUnKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChleHBhbmRvQ29udGFpbmVyKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy50b2RvTGlzdENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4cGFuZG9CdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvZ2dsZUV4cGFuZGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ2xlYXJCdXR0b24oKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhckJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5jbGVhckJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5jbGVhckJ1dHRvbicsICdDbGVhciBhbGwgdG9kb3MnKSxcblx0XHR9KTtcblx0XHR0aGlzLmNsZWFyQnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuY2xlYXJCdXR0b24uaWNvbiA9IENvZGljb24uY2xlYXJBbGw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jbGVhckJ1dHRvbik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNsZWFyQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9kb0NvdW50ID0gdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSA/IHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5nZXRUb2Rvcyh0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlKS5sZW5ndGggOiAwO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFRvZG9MaXN0V2lkZ2V0RXZlbnQsIENoYXRUb2RvTGlzdFdpZGdldENsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0J2NoYXRUb2RvTGlzdFdpZGdldCcsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhY3Rpb246ICdjbGVhcicsXG5cdFx0XHRcdFx0dG9kb0NvdW50XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0XHR0aGlzLmNsZWFyQWxsVG9kb3MoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuaGlkZVdpZGdldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXNFcXVhbCh0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl91c2VyTWFudWFsbHlFeHBhbmRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRoaXMuaGlkZVdpZGdldCgpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlVG9kb0Rpc3BsYXkoKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhcihzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgZm9yY2U6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8IHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VG9kb3MgPSB0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2UuZ2V0VG9kb3Moc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzaG91bGRDbGVhciA9IGZvcmNlIHx8IChjdXJyZW50VG9kb3MubGVuZ3RoID4gMCAmJiAhY3VycmVudFRvZG9zLnNvbWUodG9kbyA9PiB0b2RvLnN0YXR1cyAhPT0gJ2NvbXBsZXRlZCcpKTtcblx0XHRpZiAoc2hvdWxkQ2xlYXIpIHtcblx0XHRcdHRoaXMuY2xlYXJBbGxUb2RvcygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYXNUb2RvcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnaGFzLXRvZG9zJykgJiYgISF0aGlzLl90b2RvTGlzdCAmJiB0aGlzLl90b2RvTGlzdC5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHVibGljIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLnRvZG9MaXN0Q29udGFpbmVyKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGFzVG9kb3MoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy50b2dnbGVFeHBhbmRlZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RvZG9MaXN0Py5kb21Gb2N1cygpO1xuXHRcdHJldHVybiB0aGlzLmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvZG9EaXNwbGF5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvZG9MaXN0ID0gdGhpcy5jaGF0VG9kb0xpc3RTZXJ2aWNlLmdldFRvZG9zKHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNob3VsZFNob3cgPSB0b2RvTGlzdC5sZW5ndGggPiAwO1xuXG5cdFx0aWYgKCFzaG91bGRTaG93KSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRvZG9zJyk7XG5cdFx0XHR0aGlzLmhpZGVXaWRnZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaGFzLXRvZG9zJyk7XG5cdFx0dGhpcy5yZW5kZXJUb2RvTGlzdCh0b2RvTGlzdCk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUb2RvTGlzdCh0b2RvTGlzdDogSUNoYXRUb2RvW10pOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVRpdGxlRWxlbWVudCh0aGlzLnRpdGxlRWxlbWVudCwgdG9kb0xpc3QpO1xuXG5cdFx0Y29uc3QgYWxsSW5jb21wbGV0ZSA9IHRvZG9MaXN0LmV2ZXJ5KHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdub3Qtc3RhcnRlZCcpO1xuXHRcdGlmIChhbGxJbmNvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl91c2VyTWFudWFsbHlFeHBhbmRlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBvciB1cGRhdGUgdGhlIFdvcmtiZW5jaExpc3Rcblx0XHRpZiAoIXRoaXMuX3RvZG9MaXN0KSB7XG5cdFx0XHR0aGlzLl90b2RvTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFdvcmtiZW5jaExpc3Q8SUNoYXRUb2RvPixcblx0XHRcdFx0J0NoYXRUb2RvTGlzdFJlbmRlcmVyJyxcblx0XHRcdFx0dGhpcy50b2RvTGlzdENvbnRhaW5lcixcblx0XHRcdFx0bmV3IFRvZG9MaXN0RGVsZWdhdGUoKSxcblx0XHRcdFx0W25ldyBUb2RvTGlzdFJlbmRlcmVyKCldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAodG9kbzogSUNoYXRUb2RvKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXR1c1RleHQgPSB0aGlzLmdldFN0YXR1c1RleHQodG9kby5zdGF0dXMpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQudG9kb0xpc3QuaXRlbScsICd7MH0sIHsxfScsIHRvZG8udGl0bGUsIHN0YXR1c1RleHQpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2NoYXRUb2RvTGlzdCcsICdDaGF0IFRvZG8gTGlzdCcpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbGlzdCBjb250ZW50c1xuXHRcdGNvbnN0IG1heEl0ZW1zU2hvd24gPSA2O1xuXHRcdGNvbnN0IGl0ZW1zU2hvd24gPSBNYXRoLm1pbih0b2RvTGlzdC5sZW5ndGgsIG1heEl0ZW1zU2hvd24pO1xuXHRcdGNvbnN0IGhlaWdodCA9IGl0ZW1zU2hvd24gKiAyMjtcblx0XHR0aGlzLl90b2RvTGlzdC5sYXlvdXQoaGVpZ2h0KTtcblx0XHR0aGlzLl90b2RvTGlzdC5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy5fdG9kb0xpc3Quc3BsaWNlKDAsIHRoaXMuX3RvZG9MaXN0Lmxlbmd0aCwgdG9kb0xpc3QpO1xuXG5cdFx0Y29uc3QgaGFzSW5Qcm9ncmVzc1Rhc2sgPSB0b2RvTGlzdC5zb21lKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdpbi1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IGhhc0NvbXBsZXRlZFRhc2sgPSB0b2RvTGlzdC5zb21lKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdjb21wbGV0ZWQnKTtcblxuXHRcdC8vIFVwZGF0ZSBjbGVhciBidXR0b24gc3RhdGUgYmFzZWQgb24gcmVxdWVzdCBwcm9ncmVzc1xuXHRcdHRoaXMudXBkYXRlQ2xlYXJCdXR0b25TdGF0ZSgpO1xuXG5cdFx0Ly8gT25seSBhdXRvLWNvbGxhcHNlIGlmIHRoZXJlIGFyZSBpbi1wcm9ncmVzcyBvciBjb21wbGV0ZWQgdGFza3MgQU5EIHVzZXIgaGFzbid0IG1hbnVhbGx5IGV4cGFuZGVkXG5cdFx0aWYgKChoYXNJblByb2dyZXNzVGFzayB8fCBoYXNDb21wbGV0ZWRUYXNrKSAmJiB0aGlzLl9pc0V4cGFuZGVkICYmICF0aGlzLl91c2VyTWFudWFsbHlFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5faXNFeHBhbmRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5leHBhbmRvQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHR0aGlzLnRvZG9MaXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdHRoaXMuZXhwYW5kSWNvbi5jbGFzc0xpc3QucmVtb3ZlKCdjb2RpY29uLWNoZXZyb24tZG93bicpO1xuXHRcdFx0dGhpcy5leHBhbmRJY29uLmNsYXNzTGlzdC5hZGQoJ2NvZGljb24tY2hldnJvbi1yaWdodCcpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlRWxlbWVudCh0aGlzLnRpdGxlRWxlbWVudCwgdG9kb0xpc3QpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlRXhwYW5kZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNFeHBhbmRlZCA9ICF0aGlzLl9pc0V4cGFuZGVkO1xuXHRcdHRoaXMuX3VzZXJNYW51YWxseUV4cGFuZGVkID0gdHJ1ZTtcblxuXHRcdHRoaXMuZXhwYW5kSWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tZG93bicsIHRoaXMuX2lzRXhwYW5kZWQpO1xuXHRcdHRoaXMuZXhwYW5kSWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tcmlnaHQnLCAhdGhpcy5faXNFeHBhbmRlZCk7XG5cblx0XHR0aGlzLnRvZG9MaXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB0aGlzLl9pc0V4cGFuZGVkID8gJ2Jsb2NrJyA6ICdub25lJztcblxuXHRcdGNvbnN0IHRvZG9Db3VudCA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPyB0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2UuZ2V0VG9kb3ModGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSkubGVuZ3RoIDogMDtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0VG9kb0xpc3RXaWRnZXRFdmVudCwgQ2hhdFRvZG9MaXN0V2lkZ2V0Q2xhc3NpZmljYXRpb24+KFxuXHRcdFx0J2NoYXRUb2RvTGlzdFdpZGdldCcsXG5cdFx0XHR7XG5cdFx0XHRcdGFjdGlvbjogdGhpcy5faXNFeHBhbmRlZCA/ICdleHBhbmQnIDogJ2NvbGxhcHNlJyxcblx0XHRcdFx0dG9kb0NvdW50XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGlmICh0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCB0b2RvTGlzdCA9IHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5nZXRUb2Rvcyh0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGVFbGVtZW50KHRoaXMudGl0bGVFbGVtZW50LCB0b2RvTGlzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckFsbFRvZG9zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5zZXRUb2Rvcyh0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlLCBbXSk7XG5cdFx0dGhpcy5oaWRlV2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNsZWFyQnV0dG9uU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9kb0xpc3QgPSB0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2UuZ2V0VG9kb3ModGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgaGFzSW5Qcm9ncmVzc1Rhc2sgPSB0b2RvTGlzdC5zb21lKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdpbi1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IGlzUmVxdWVzdEluUHJvZ3Jlc3MgPSBDaGF0Q29udGV4dEtleXMucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSkgPz8gZmFsc2U7XG5cdFx0Y29uc3Qgc2hvdWxkRGlzYWJsZSA9IGlzUmVxdWVzdEluUHJvZ3Jlc3MgJiYgaGFzSW5Qcm9ncmVzc1Rhc2s7XG5cblx0XHR0aGlzLmNsZWFyQnV0dG9uLmVuYWJsZWQgPSAhc2hvdWxkRGlzYWJsZTtcblxuXHRcdC8vIFVwZGF0ZSB0b29sdGlwIGJhc2VkIG9uIHN0YXRlXG5cdFx0aWYgKHNob3VsZERpc2FibGUpIHtcblx0XHRcdHRoaXMuY2xlYXJCdXR0b24uc2V0VGl0bGUobG9jYWxpemUoJ2NoYXQudG9kb0xpc3QuY2xlYXJCdXR0b24uZGlzYWJsZWQnLCAnQ2Fubm90IGNsZWFyIHRvZG9zIHdoaWxlIGEgdGFzayBpcyBpbiBwcm9ncmVzcycpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jbGVhckJ1dHRvbi5zZXRUaXRsZShsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5jbGVhckJ1dHRvbicsICdDbGVhciBhbGwgdG9kb3MnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaXRsZUVsZW1lbnQodGl0bGVFbGVtZW50OiBIVE1MRWxlbWVudCwgdG9kb0xpc3Q6IElDaGF0VG9kb1tdKTogdm9pZCB7XG5cdFx0dGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBjb21wbGV0ZWRDb3VudCA9IHRvZG9MaXN0LmZpbHRlcih0b2RvID0+IHRvZG8uc3RhdHVzID09PSAnY29tcGxldGVkJykubGVuZ3RoO1xuXHRcdGNvbnN0IHRvdGFsQ291bnQgPSB0b2RvTGlzdC5sZW5ndGg7XG5cdFx0Y29uc3QgaW5Qcm9ncmVzc1RvZG9zID0gdG9kb0xpc3QuZmlsdGVyKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdpbi1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IGZpcnN0SW5Qcm9ncmVzc1RvZG8gPSBpblByb2dyZXNzVG9kb3MubGVuZ3RoID4gMCA/IGluUHJvZ3Jlc3NUb2Rvc1swXSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBub3RTdGFydGVkVG9kb3MgPSB0b2RvTGlzdC5maWx0ZXIodG9kbyA9PiB0b2RvLnN0YXR1cyA9PT0gJ25vdC1zdGFydGVkJyk7XG5cdFx0Y29uc3QgZmlyc3ROb3RTdGFydGVkVG9kbyA9IG5vdFN0YXJ0ZWRUb2Rvcy5sZW5ndGggPiAwID8gbm90U3RhcnRlZFRvZG9zWzBdIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGN1cnJlbnRUYXNrTnVtYmVyID0gaW5Qcm9ncmVzc1RvZG9zLmxlbmd0aCA+IDAgPyBjb21wbGV0ZWRDb3VudCArIDEgOiBNYXRoLm1heCgxLCBjb21wbGV0ZWRDb3VudCk7XG5cblx0XHRjb25zdCBleHBhbmRCdXR0b25MYWJlbCA9IHRoaXMuX2lzRXhwYW5kZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudG9kb0xpc3QuY29sbGFwc2VCdXR0b24nLCAnQ29sbGFwc2UgVG9kb3MnKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5leHBhbmRCdXR0b24nLCAnRXhwYW5kIFRvZG9zJyk7XG5cdFx0dGhpcy5leHBhbmRvQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZXhwYW5kQnV0dG9uTGFiZWwpO1xuXHRcdHRoaXMuZXhwYW5kb0J1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIHRoaXMuX2lzRXhwYW5kZWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblxuXHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHRjb25zdCB0aXRsZVRleHQgPSBkb20uJCgnc3BhbicpO1xuXHRcdFx0dGl0bGVUZXh0LnRleHRDb250ZW50ID0gdG90YWxDb3VudCA+IDAgP1xuXHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC50aXRsZVdpdGhDb3VudCcsICdUb2RvcyAoezB9L3sxfSknLCBjdXJyZW50VGFza051bWJlciwgdG90YWxDb3VudCkgOlxuXHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC50aXRsZScsICdUb2RvcycpO1xuXHRcdFx0dGl0bGVFbGVtZW50LmFwcGVuZENoaWxkKHRpdGxlVGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNob3cgZmlyc3QgaW4tcHJvZ3Jlc3MgdG9kbywgb3IgaWYgbm9uZSwgdGhlIGZpcnN0IG5vdC1zdGFydGVkIHRvZG9cblx0XHRcdGNvbnN0IHRvZG9Ub1Nob3cgPSBmaXJzdEluUHJvZ3Jlc3NUb2RvIHx8IGZpcnN0Tm90U3RhcnRlZFRvZG87XG5cdFx0XHRpZiAodG9kb1RvU2hvdykge1xuXHRcdFx0XHRjb25zdCBpY29uID0gZG9tLiQoJy5jb2RpY29uJyk7XG5cdFx0XHRcdGlmICh0b2RvVG9TaG93ID09PSBmaXJzdEluUHJvZ3Jlc3NUb2RvKSB7XG5cdFx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKCdjb2RpY29uLXJlY29yZCcpO1xuXHRcdFx0XHRcdGljb24uc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWNoYXJ0cy1ibHVlKSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKCdjb2RpY29uLWNpcmNsZS1vdXRsaW5lJyk7XG5cdFx0XHRcdFx0aWNvbi5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGljb24uc3R5bGUubWFyZ2luUmlnaHQgPSAnNHB4Jztcblx0XHRcdFx0aWNvbi5zdHlsZS52ZXJ0aWNhbEFsaWduID0gJ21pZGRsZSc7XG5cdFx0XHRcdHRpdGxlRWxlbWVudC5hcHBlbmRDaGlsZChpY29uKTtcblxuXHRcdFx0XHRjb25zdCB0b2RvVGV4dCA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHRcdHRvZG9UZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQudG9kb0xpc3QuY3VycmVudFRhc2snLCAnezB9ICh7MX0vezJ9KScsIHRvZG9Ub1Nob3cudGl0bGUsIGN1cnJlbnRUYXNrTnVtYmVyLCB0b3RhbENvdW50KTtcblx0XHRcdFx0dG9kb1RleHQuc3R5bGUudmVydGljYWxBbGlnbiA9ICdtaWRkbGUnO1xuXHRcdFx0XHR0b2RvVGV4dC5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdFx0XHR0b2RvVGV4dC5zdHlsZS50ZXh0T3ZlcmZsb3cgPSAnZWxsaXBzaXMnO1xuXHRcdFx0XHR0b2RvVGV4dC5zdHlsZS53aGl0ZVNwYWNlID0gJ25vd3JhcCc7XG5cdFx0XHRcdHRvZG9UZXh0LnN0eWxlLm1pbldpZHRoID0gJzAnO1xuXHRcdFx0XHR0aXRsZUVsZW1lbnQuYXBwZW5kQ2hpbGQodG9kb1RleHQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2hvdyBcIkRvbmVcIiB3aGVuIGFsbCB0YXNrcyBhcmUgY29tcGxldGVkXG5cdFx0XHRlbHNlIGlmIChjb21wbGV0ZWRDb3VudCA+IDAgJiYgY29tcGxldGVkQ291bnQgPT09IHRvdGFsQ291bnQpIHtcblx0XHRcdFx0Y29uc3QgZG9uZVRleHQgPSBkb20uJCgnc3BhbicpO1xuXHRcdFx0XHRkb25lVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LnRpdGxlV2l0aENvdW50JywgJ1RvZG9zICh7MH0vezF9KScsIHRvdGFsQ291bnQsIHRvdGFsQ291bnQpO1xuXHRcdFx0XHRkb25lVGV4dC5zdHlsZS52ZXJ0aWNhbEFsaWduID0gJ21pZGRsZSc7XG5cdFx0XHRcdHRpdGxlRWxlbWVudC5hcHBlbmRDaGlsZChkb25lVGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdGF0dXNUZXh0KHN0YXR1czogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LnN0YXR1cy5jb21wbGV0ZWQnLCAnY29tcGxldGVkJyk7XG5cdFx0XHRjYXNlICdpbi1wcm9ncmVzcyc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC50b2RvTGlzdC5zdGF0dXMuaW5Qcm9ncmVzcycsICdpbiBwcm9ncmVzcycpO1xuXHRcdFx0Y2FzZSAnbm90LXN0YXJ0ZWQnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LnN0YXR1cy5ub3RTdGFydGVkJywgJ25vdCBzdGFydGVkJyk7XG5cdFx0fVxuXHR9XG59XG5cbnR5cGUgQ2hhdFRvZG9MaXN0V2lkZ2V0RXZlbnQgPSB7XG5cdGFjdGlvbjogJ2V4cGFuZCcgfCAnY29sbGFwc2UnIHwgJ2NsZWFyJztcblx0dG9kb0NvdW50OiBudW1iZXI7XG59O1xuXG50eXBlIENoYXRUb2RvTGlzdFdpZGdldENsYXNzaWZpY2F0aW9uID0ge1xuXHRhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdXNlciBhY3Rpb24gb24gdGhlIHRvZG8gbGlzdCB3aWRnZXQgKGV4cGFuZCwgY29sbGFwc2UsIG9yIGNsZWFyKS4nIH07XG5cdHRvZG9Db3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdG9kb3MgYXQgdGhlIHRpbWUgb2YgdGhlIGFjdGlvbi4nIH07XG5cdG93bmVyOiAnYmhhdnlhdXMnO1xuXHRjb21tZW50OiAnVHJhY2tzIHVzZXIgaW50ZXJhY3Rpb25zIHdpdGggdGhlIGNoYXQgdG9kbyBsaXN0IHdpZGdldC4nO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBdUM7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBb0IsNEJB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
