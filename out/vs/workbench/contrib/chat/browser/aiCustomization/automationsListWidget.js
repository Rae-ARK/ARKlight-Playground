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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { fromNow, getDurationString } from "../../../../../base/common/date.js";
import * as resources from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { IAutomationRunner } from "../../common/automations/automationRunner.js";
import { IAutomationService } from "../../common/automations/automationService.js";
import { IAutomationDialogService } from "../../common/automations/automationDialogService.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../common/automations/automationsEnabled.js";
import { DAYS_OF_WEEK } from "../../common/automations/schedule.js";
import { openSessionByResource } from "../agentSessions/agentSessionsOpener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
const $ = DOM.$;
const AUTOMATION_ROW_HEIGHT = 72;
const HISTORY_ROW_HEIGHT = 28;
const HISTORY_HEADER_HEIGHT = 32;
const HISTORY_EMPTY_HEIGHT = 28;
const HISTORY_MORE_HEIGHT = 22;
const MAX_VISIBLE_RUNS = 20;
class AutomationItemDelegate {
  // Initial estimate only. Actual row height is measured from the DOM because
  // the list is created with `supportDynamicHeights` (meta wraps, prompt wraps,
  // and run-error text is variable-height). See `hasDynamicHeight` below.
  getHeight(element) {
    if (!element.expanded) {
      return AUTOMATION_ROW_HEIGHT;
    }
    const runs = element.runs;
    const visibleRuns = Math.min(runs.length, MAX_VISIBLE_RUNS);
    if (visibleRuns === 0) {
      return AUTOMATION_ROW_HEIGHT + HISTORY_EMPTY_HEIGHT;
    }
    let historyHeight = HISTORY_HEADER_HEIGHT + visibleRuns * HISTORY_ROW_HEIGHT;
    if (runs.length > MAX_VISIBLE_RUNS) {
      historyHeight += HISTORY_MORE_HEIGHT;
    }
    return AUTOMATION_ROW_HEIGHT + historyHeight;
  }
  hasDynamicHeight(_element) {
    return true;
  }
  getTemplateId(_element) {
    return "automationItem";
  }
}
class AutomationItemRenderer {
  constructor(widget, hoverService, notificationService, editorService, editorGroupsService, logService, instantiationService) {
    this.widget = widget;
    this.hoverService = hoverService;
    this.notificationService = notificationService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this.logService = logService;
    this.instantiationService = instantiationService;
    this.templateId = "automationItem";
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    container.classList.add("automations-row-wrapper");
    const row = DOM.append(container, $(".automations-row"));
    const main = DOM.append(row, $(".automations-row-main"));
    const nameEl = DOM.append(main, $(".automations-row-name"));
    const nameTextEl = DOM.append(nameEl, $("span.automations-row-name-text"));
    const disabledBadge = DOM.append(nameEl, $("span.automations-row-disabled-badge"));
    const metaEl = DOM.append(main, $(".automations-row-meta"));
    const scheduleEl = DOM.append(metaEl, $("span.automations-row-schedule"));
    const sep1 = DOM.append(metaEl, $("span.automations-row-meta-sep"));
    const nextEl = DOM.append(metaEl, $("span.automations-row-next"));
    const sepFolder = DOM.append(metaEl, $("span.automations-row-meta-sep"));
    const folderEl = DOM.append(metaEl, $("span.automations-row-folder"));
    const sep2 = DOM.append(metaEl, $("span.automations-row-meta-sep"));
    const lastEl = DOM.append(metaEl, $("span.automations-row-last"));
    const promptEl = DOM.append(main, $(".automations-row-prompt"));
    const actions = DOM.append(row, $(".automations-row-actions"));
    const historyPanel = DOM.append(container, $(".automations-row-history"));
    return { container, row, nameEl, nameTextEl, disabledBadge, scheduleEl, sep1, nextEl, sepFolder, folderEl, sep2, lastEl, promptEl, actions, historyPanel, disposables };
  }
  renderElement(element, _index, templateData) {
    templateData.disposables.clear();
    const { automation, runs, expanded, inFlight } = element;
    templateData.nameTextEl.textContent = automation.name;
    templateData.row.classList.toggle("automations-row-disabled", !automation.enabled);
    templateData.disabledBadge.textContent = !automation.enabled ? localize("automationDisabled", "Disabled") : "";
    templateData.disabledBadge.style.display = !automation.enabled ? "" : "none";
    templateData.scheduleEl.textContent = formatSchedule(automation);
    templateData.sep1.textContent = "\xB7";
    templateData.nextEl.textContent = formatNextRun(automation);
    templateData.sepFolder.textContent = "\xB7";
    templateData.folderEl.textContent = this.widget.formatTargetLabel(automation);
    if (automation.target.kind === "quickChat") {
      templateData.folderEl.title = localize("automationQuickChatTitle", "Runs as a workspace-less chat");
    } else {
      templateData.folderEl.title = automation.target.folderUri.toString();
    }
    if (automation.lastRunAt) {
      templateData.sep2.textContent = "\xB7";
      templateData.sep2.style.display = "";
      templateData.lastEl.textContent = localize("lastRun", "Last run {0}", formatRelativeTimeOrIso(automation.lastRunAt));
      templateData.lastEl.style.display = "";
    } else {
      templateData.sep2.style.display = "none";
      templateData.lastEl.style.display = "none";
    }
    templateData.promptEl.textContent = truncate(automation.prompt, 160);
    templateData.promptEl.title = automation.prompt;
    templateData.disposables.add(DOM.addDisposableListener(templateData.row, "click", (e) => {
      if (DOM.isAncestor(e.target, templateData.actions)) {
        return;
      }
      this.widget.toggleExpanded(automation.id);
    }));
    DOM.clearNode(templateData.actions);
    templateData.disposables.add(DOM.addDisposableListener(templateData.actions, "click", (e) => {
      e.stopPropagation();
    }));
    this.renderActions(templateData, automation, expanded, inFlight);
    DOM.clearNode(templateData.historyPanel);
    templateData.historyPanel.id = `automation-history-${automation.id}`;
    if (expanded) {
      this.renderHistoryPanel(templateData, automation, runs);
    }
    templateData.historyPanel.style.display = expanded ? "" : "none";
    templateData.container.classList.toggle("automations-row-wrapper-expanded", expanded);
  }
  renderActions(templateData, automation, expanded, inFlight) {
    const { actions, disposables } = templateData;
    const runBtn = this.createIconButton(actions, Codicon.play, localize("runNow", "Run now"), inFlight, disposables);
    disposables.add(DOM.addStandardDisposableListener(runBtn, "click", () => {
      void this.widget.runNow(automation);
    }));
    const toggleIcon = automation.enabled ? Codicon.eye : Codicon.eyeClosed;
    const toggleTooltip = automation.enabled ? localize("disableAutomation", "Disable") : localize("enableAutomation", "Enable");
    const toggleBtn = this.createIconButton(actions, toggleIcon, toggleTooltip, false, disposables);
    disposables.add(DOM.addStandardDisposableListener(toggleBtn, "click", () => {
      void this.widget.toggleEnabled(automation);
    }));
    const editBtn = this.createIconButton(actions, Codicon.edit, localize("editAutomation", "Edit"), false, disposables);
    disposables.add(DOM.addStandardDisposableListener(editBtn, "click", () => {
      void this.widget.openEditDialog(automation);
    }));
    const deleteBtn = this.createIconButton(actions, Codicon.trash, localize("deleteAutomation", "Delete"), false, disposables);
    disposables.add(DOM.addStandardDisposableListener(deleteBtn, "click", () => {
      void this.widget.deleteAutomation(automation);
    }));
    const histIcon = expanded ? Codicon.chevronDown : Codicon.chevronRight;
    const histTooltip = expanded ? localize("hideHistory", "Hide history") : localize("showHistory", "Show history");
    const histBtn = this.createIconButton(actions, histIcon, histTooltip, false, disposables);
    histBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    histBtn.setAttribute("aria-controls", `automation-history-${automation.id}`);
    disposables.add(DOM.addStandardDisposableListener(histBtn, "click", () => {
      this.widget.toggleExpanded(automation.id);
    }));
  }
  renderHistoryPanel(templateData, automation, runs) {
    const panel = templateData.historyPanel;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", localize("historyAriaLabel", "Run history for {0}", automation.name));
    if (runs.length === 0) {
      const empty = DOM.append(panel, $(".automations-history-empty"));
      empty.textContent = localize("noRunsYet", "No runs yet.");
      return;
    }
    const heading = DOM.append(panel, $("h4.automations-history-heading"));
    heading.textContent = localize("runHistory", "Run history");
    const runsList = DOM.append(panel, $("ul.automations-history-list"));
    const visibleRuns = runs.slice(0, MAX_VISIBLE_RUNS);
    for (const run of visibleRuns) {
      this.renderRunRow(runsList, run, templateData.disposables);
    }
    if (runs.length > MAX_VISIBLE_RUNS) {
      const more = DOM.append(panel, $(".automations-history-more"));
      more.textContent = localize("historyMore", "{0} more run(s) not shown.", runs.length - visibleRuns.length);
    }
  }
  renderRunRow(container, run, disposables) {
    const li = DOM.append(container, $("li.automations-history-row", {
      "data-run-id": run.id,
      "data-run-status": run.status
    }));
    const statusIcon = DOM.append(li, $("span.automations-history-status.codicon"));
    const { iconId, spin } = runStatusIcon(run.status);
    statusIcon.classList.add(`codicon-${iconId}`);
    if (spin) {
      statusIcon.classList.add("codicon-modifier-spin");
    }
    statusIcon.setAttribute("aria-hidden", "true");
    const text = DOM.append(li, $(".automations-history-row-text"));
    const first = DOM.append(text, $(".automations-history-row-first"));
    const statusLabel = DOM.append(first, $("span.automations-history-row-status"));
    statusLabel.textContent = runStatusLabel(run.status);
    const sep = DOM.append(first, $("span.automations-history-row-sep"));
    sep.textContent = "\xB7";
    const trig = DOM.append(first, $("span.automations-history-row-trigger"));
    trig.textContent = runTriggerLabel(run.trigger);
    const sep2 = DOM.append(first, $("span.automations-history-row-sep"));
    sep2.textContent = "\xB7";
    const started = DOM.append(first, $("span.automations-history-row-started"));
    started.textContent = localize("runStarted", "Started {0}", formatRelativeTimeOrIso(run.startedAt));
    const dur = formatRunDuration(run);
    if (dur) {
      const sep3 = DOM.append(first, $("span.automations-history-row-sep"));
      sep3.textContent = "\xB7";
      const durEl = DOM.append(first, $("span.automations-history-row-duration"));
      durEl.textContent = dur;
    }
    if (run.errorMessage) {
      const err = DOM.append(text, $(".automations-history-row-error"));
      err.textContent = run.errorMessage;
      err.setAttribute("role", "status");
      err.setAttribute("aria-live", "polite");
    }
    if (run.sessionResource) {
      const openButton = DOM.append(li, $("span.automations-history-row-open.codicon.codicon-link-external"));
      openButton.setAttribute("role", "button");
      openButton.setAttribute("tabindex", "0");
      openButton.setAttribute("aria-label", localize("openRunSession", "Open session"));
      disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), openButton, localize("openRunSession", "Open session")));
      const openSession = (e) => {
        e.stopPropagation();
        const sessionResource = URI.parse(run.sessionResource);
        this.logService.debug(`[AutomationsListWidget] Opening session: ${sessionResource.toString()}`);
        const activeEditor = this.editorService.activeEditor;
        const activeGroupId = this.editorGroupsService.activeGroup.id;
        this.instantiationService.invokeFunction(openSessionByResource, sessionResource).then(() => {
          if (activeEditor) {
            this.editorService.closeEditor({ editor: activeEditor, groupId: activeGroupId });
          }
        }).catch((err) => {
          this.logService.error(`[AutomationsListWidget] openSession failed for ${sessionResource.toString()}`, err);
          this.notificationService.error(localize("openRunSessionFailed", "Failed to open automation session"));
        });
      };
      disposables.add(DOM.addDisposableListener(openButton, "click", openSession));
      disposables.add(DOM.addDisposableListener(openButton, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openSession(e);
        }
      }));
    }
  }
  createIconButton(container, icon, tooltip, disabled, disposables) {
    const button = DOM.append(container, $("button.automations-row-action-button", {
      type: "button",
      "aria-label": tooltip,
      tabindex: "0"
    }));
    button.classList.add(...ThemeIcon.asClassNameArray(icon));
    button.disabled = disabled;
    disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), button, tooltip));
    return button;
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
let AutomationsListWidget = class extends Disposable {
  constructor(automationService, automationRunner, dialogService, automationDialogService, hoverService, workspaceContextService, logService, configurationService, instantiationService, notificationService, editorService, editorGroupsService) {
    super();
    this.automationService = automationService;
    this.automationRunner = automationRunner;
    this.dialogService = dialogService;
    this.automationDialogService = automationDialogService;
    this.hoverService = hoverService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this.newButtonHover = this._register(new MutableDisposable());
    this.newEmptyStateButtonHover = this._register(new MutableDisposable());
    this._emptyStateStore = this._register(new DisposableStore());
    this.runInFlight = /* @__PURE__ */ new Set();
    this.expandedRows = /* @__PURE__ */ new Set();
    this.displayEntries = [];
    this.lastHeight = 0;
    this.lastWidth = 0;
    this.visible = false;
    this.listDirty = false;
    this.remeasureOnNextLayout = false;
    this.element = $(".automations-list-widget");
    this.headerEl = DOM.append(this.element, $(".automations-header"));
    this.emptyContainer = DOM.append(this.element, $(".automations-empty-state"));
    this.emptyContainer.style.display = "none";
    this.listContainer = DOM.append(this.element, $(".automations-list"));
    this.renderHeader();
    this.createList();
    this._register(autorun((reader) => {
      const items = this.automationService.automations.read(reader);
      this.automationService.runs.read(reader);
      this.updateList(items);
      this._onDidChangeItemCount.fire(items.length);
    }));
  }
  renderHeader() {
    const titleRow = DOM.append(this.headerEl, $(".automations-header-row"));
    const titleEl = DOM.append(titleRow, $("h2.automations-header-title"));
    titleEl.textContent = localize("automationsHeaderTitle", "Automations");
    const subtitleEl = DOM.append(this.headerEl, $("p.automations-header-subtitle"));
    subtitleEl.textContent = localize("automationsHeaderSubtitle", "Schedule agent sessions to run on a cadence you choose.");
    const newButton = this._register(new Button(titleRow, { ...defaultButtonStyles, title: localize("newAutomation", "New automation") }));
    newButton.label = localize("newAutomation", "New automation");
    newButton.element.classList.add("automations-new-button");
    this._register(newButton.onDidClick(() => this.openCreateDialog()));
    this.newButtonHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), newButton.element, localize("newAutomationTooltip", "Create a new automation"));
  }
  createList() {
    const delegate = new AutomationItemDelegate();
    const renderer = new AutomationItemRenderer(this, this.hoverService, this.notificationService, this.editorService, this.editorGroupsService, this.logService, this.instantiationService);
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "AutomationsManagementList",
      this.listContainer,
      delegate,
      [renderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        supportDynamicHeights: true,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            return this.formatAriaLabel(element.automation);
          },
          getWidgetAriaLabel() {
            return localize("automationsListAriaLabel", "Automations");
          }
        },
        identityProvider: {
          getId(element) {
            return element.automation.id;
          }
        }
      }
    ));
    this._register(this.list.onDidChangeSelection(() => {
      if (this.list.getSelection().length > 0) {
        this.list.setSelection([]);
      }
    }));
  }
  updateList(items) {
    if (items.length === 0) {
      this.element.classList.add("automations-empty");
      this.displayEntries = [];
      this.listDirty = true;
      this.commitList();
      this.emptyContainer.style.display = "";
      this.listContainer.style.display = "none";
      this.renderEmptyState();
      return;
    }
    this.element.classList.remove("automations-empty");
    this.emptyContainer.style.display = "none";
    this.listContainer.style.display = "";
    this.newEmptyStateButtonHover.clear();
    this.displayEntries = items.map((automation) => ({
      type: "automation-item",
      automation,
      runs: this.automationService.runsFor(automation.id).get(),
      expanded: this.expandedRows.has(automation.id),
      inFlight: this.runInFlight.has(automation.id)
    }));
    this.listDirty = true;
    this.commitList();
    if (this.visible && this.lastHeight > 0 && this.lastWidth > 0) {
      this.layout(this.lastHeight, this.lastWidth);
    }
  }
  commitList() {
    if (!this.visible || !this.listDirty) {
      return;
    }
    this.list.splice(0, this.list.length, this.displayEntries);
    this.listDirty = false;
  }
  renderEmptyState() {
    this._emptyStateStore.clear();
    DOM.clearNode(this.emptyContainer);
    this.emptyContainer.setAttribute("role", "status");
    const title = DOM.append(this.emptyContainer, $("h3.automations-empty-title"));
    title.textContent = localize("automationsEmptyTitle", "No automations yet");
    const message = DOM.append(this.emptyContainer, $("p.automations-empty-message"));
    message.textContent = localize("automationsEmptyMessage", "Create an automation to schedule an agent session to run on a cadence you choose.");
    const ctaButton = this._emptyStateStore.add(new Button(this.emptyContainer, { ...defaultButtonStyles }));
    ctaButton.label = localize("automationsEmptyCta", "Create automation");
    ctaButton.element.classList.add("automations-empty-cta");
    this._emptyStateStore.add(ctaButton.onDidClick(() => this.openCreateDialog()));
    this.newEmptyStateButtonHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), ctaButton.element, localize("newAutomationTooltip", "Create a new automation"));
  }
  toggleExpanded(automationId) {
    if (this.expandedRows.has(automationId)) {
      this.expandedRows.delete(automationId);
    } else {
      this.expandedRows.add(automationId);
    }
    this.updateList(this.automationService.automations.get());
  }
  async runNow(automation) {
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    if (this.runInFlight.has(automation.id)) {
      return;
    }
    this.runInFlight.add(automation.id);
    this.updateList(this.automationService.automations.get());
    try {
      const operation = this.automationRunner.runOnce(automation, "manual", 0, CancellationToken.None);
      const dispatch = await operation.whenDispatched;
      if (dispatch.kind === "started") {
        status(localize("automationStartedStatus", "Started automation {0}", automation.name));
      }
      await operation.whenCompleted;
    } catch (err) {
      this.logService.error("[Automations] runNow failed unexpectedly", err);
    } finally {
      this.runInFlight.delete(automation.id);
      this.updateList(this.automationService.automations.get());
    }
  }
  async toggleEnabled(automation) {
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    try {
      await this.automationService.updateAutomation(automation.id, { enabled: !automation.enabled });
      status(automation.enabled ? localize("automationDisabledStatus", "Disabled automation {0}", automation.name) : localize("automationEnabledStatus", "Enabled automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[Automations] Failed to toggle automation", err);
    }
  }
  async deleteAutomation(automation) {
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    const result = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmDeleteAutomation", "Delete automation \u201C{0}\u201D?", automation.name),
      detail: localize("confirmDeleteAutomationDetail", "Runs already in flight will continue. This cannot be undone."),
      primaryButton: localize("delete", "Delete")
    });
    if (!result.confirmed) {
      return;
    }
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    try {
      await this.automationService.deleteAutomation(automation.id);
      status(localize("automationDeletedStatus", "Deleted automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[Automations] Failed to delete automation", err);
    }
  }
  async openEditDialog(automation) {
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    const result = await this.automationDialogService.showAutomationDialog({
      existing: automation
    });
    if (!result || result.kind !== "update") {
      return;
    }
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    try {
      const updateResult = await this.automationService.updateAutomationIfUnchanged(result.id, result.value, automation);
      if (updateResult.kind === "conflict") {
        throw new Error(updateResult.current ? localize("automationChangedDuringEdit", "This automation changed while the dialog was open. Reopen it to review the latest values.") : localize("automationDeletedDuringEdit", "This automation was deleted while the dialog was open."));
      }
      status(localize("automationUpdatedStatus", "Updated automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[Automations] Failed to update automation", err);
      await this.dialogService.error(
        localize("automationUpdateFailed", "Failed to update automation."),
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  formatFolderLabel(folderUri) {
    const folders = this.workspaceContextService.getWorkspace().folders;
    const match = folders.find((f) => resources.isEqual(f.uri, folderUri));
    if (match) {
      return match.name || match.uri.toString();
    }
    const segments = folderUri.path.split("/").filter((s) => s.length > 0);
    return segments[segments.length - 1] ?? folderUri.toString();
  }
  formatTargetLabel(automation) {
    if (automation.target.kind === "quickChat") {
      return localize("automationQuickChatLabel", "without a workspace");
    }
    return localize("automationFolderLabel", "in {0}", this.formatFolderLabel(automation.target.folderUri));
  }
  formatAriaLabel(automation) {
    const schedule = formatSchedule(automation);
    const target = this.formatTargetLabel(automation);
    return automation.enabled ? localize("automationAriaLabel", "{0}, {1}, {2}", automation.name, schedule, target) : localize("automationAriaLabelDisabled", "{0}, disabled, {1}, {2}", automation.name, schedule, target);
  }
  _isEnabled() {
    return this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
  }
  async _notifyDisabled() {
    await this.dialogService.info(
      localize("automationsDisabledTitle", "Automations are disabled."),
      localize("automationsDisabledDetail", "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING)
    );
  }
  async openCreateDialog() {
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    const result = await this.automationDialogService.showAutomationDialog({});
    if (!result || result.kind !== "create") {
      return;
    }
    if (!this._isEnabled()) {
      await this._notifyDisabled();
      return;
    }
    try {
      const created = await this.automationService.createAutomation(result.value);
      status(localize("automationCreatedStatus", "Created automation {0}", created.name));
    } catch (err) {
      this.logService.error("[Automations] Failed to create automation", err);
      await this.dialogService.error(
        localize("automationCreateFailed", "Failed to create automation."),
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  layout(height, width) {
    this.lastHeight = height;
    this.lastWidth = width;
    this.element.style.height = `${height}px`;
    if (!this.visible || this.displayEntries.length === 0 || height <= 0 || width <= 0) {
      return;
    }
    const headerHeight = this.headerEl.offsetHeight;
    if (headerHeight === 0) {
      return;
    }
    const listHeight = Math.max(0, height - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, width);
    if (this.remeasureOnNextLayout) {
      this.remeasureOnNextLayout = false;
      this.list.rerender();
    }
  }
  setVisible(visible) {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (!visible) {
      return;
    }
    this.commitList();
    this.remeasureOnNextLayout = this.list.length > 0;
  }
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.automationService.automations.get().length);
  }
  /** Test-only: number of rows currently in the virtualized list. */
  get itemCount() {
    return this.list.length;
  }
  /**
   * Test-only: snapshot of the view-model rows the list is displaying.
   * The virtualized {@link WorkbenchList} does not lay out rows in a unit-test
   * DOM, so tests assert the derived render state (expansion, runs, in-flight)
   * here instead of querying row elements.
   */
  getDisplayEntriesForTest() {
    return this.displayEntries;
  }
  /**
   * Expands, reveals, and moves keyboard focus to an automation.
   */
  focusAutomation(automationId) {
    const index = this.displayEntries.findIndex((entry) => entry.automation.id === automationId);
    if (index < 0) {
      return false;
    }
    this.expandedRows.add(automationId);
    this.updateList(this.automationService.automations.get());
    this.list.reveal(index);
    this.list.setFocus([index]);
    this.list.domFocus();
    return true;
  }
  focus() {
    if (this.list.length > 0) {
      this.list.domFocus();
    }
  }
};
AutomationsListWidget = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, IAutomationRunner),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IAutomationDialogService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IEditorGroupsService)
], AutomationsListWidget);
function formatSchedule(a) {
  switch (a.schedule.interval) {
    case "manual":
      return localize("scheduleManual", "Manual");
    case "hourly":
      return localize("scheduleHourly", "Hourly");
    case "daily":
      return localize("scheduleDaily", "Daily at {0}", formatHourMinute(a.schedule.scheduleHour, a.schedule.scheduleMinute));
    case "weekly": {
      const day = dayName(a.schedule.scheduleDay);
      return localize("scheduleWeekly", "Weekly on {0} at {1}", day, formatHourMinute(a.schedule.scheduleHour, a.schedule.scheduleMinute));
    }
  }
}
function formatHourMinute(hour, minute) {
  const date = /* @__PURE__ */ new Date();
  date.setHours(Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0)), 0, 0);
  return date.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
}
function dayName(day) {
  const idx = (day % 7 + 7) % 7;
  return DAYS_OF_WEEK[idx];
}
function formatNextRun(a) {
  if (!a.enabled || a.schedule.interval === "manual" || !a.nextRunAt) {
    return localize("nextRunNever", "No scheduled run");
  }
  return localize("nextRun", "Next run {0}", formatRelativeTimeOrIso(a.nextRunAt));
}
function formatRelativeTimeOrIso(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return iso;
  }
  const date = new Date(t);
  const rel = fromNow(date, true);
  const absolute = date.toLocaleString();
  return `${rel} (${absolute})`;
}
function truncate(s, max) {
  const single = s.replace(/\s+/g, " ").trim();
  if (single.length <= max) {
    return single;
  }
  return single.slice(0, Math.max(0, max - 1)) + "\u2026";
}
function runStatusIcon(status2) {
  switch (status2) {
    case "pending":
      return { iconId: "circle-outline", spin: false };
    case "running":
      return { iconId: "sync", spin: true };
    case "completed":
      return { iconId: "check", spin: false };
    case "failed":
      return { iconId: "error", spin: false };
  }
}
function runStatusLabel(status2) {
  switch (status2) {
    case "pending":
      return localize("runStatusPending", "Pending");
    case "running":
      return localize("runStatusRunning", "Running");
    case "completed":
      return localize("runStatusCompleted", "Completed");
    case "failed":
      return localize("runStatusFailed", "Failed");
  }
}
function runTriggerLabel(trigger) {
  switch (trigger) {
    case "schedule":
      return localize("runTriggerSchedule", "Scheduled");
    case "manual":
      return localize("runTriggerManual", "Manual");
    case "catch_up":
      return localize("runTriggerCatchUp", "Catch-up");
  }
}
function formatRunDuration(run) {
  if (!run.completedAt) {
    return void 0;
  }
  const startMs = Date.parse(run.startedAt);
  const endMs = Date.parse(run.completedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return void 0;
  }
  const durationMs = Math.max(0, endMs - startMs);
  return getDurationString(durationMs);
}
export {
  AutomationsListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYXV0b21hdGlvbnNMaXN0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZnJvbU5vdywgZ2V0RHVyYXRpb25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbiwgSUF1dG9tYXRpb25SdW4sIEF1dG9tYXRpb25SdW5TdGF0dXMsIEF1dG9tYXRpb25SdW5UcmlnZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5uZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBEQVlTX09GX1dFRUsgfSBmcm9tICcuLi8uLi9jb21tb24vYXV0b21hdGlvbnMvc2NoZWR1bGUuanMnO1xuaW1wb3J0IHsgb3BlblNlc3Npb25CeVJlc291cmNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zT3BlbmVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5jb25zdCBBVVRPTUFUSU9OX1JPV19IRUlHSFQgPSA3MjtcbmNvbnN0IEhJU1RPUllfUk9XX0hFSUdIVCA9IDI4O1xuY29uc3QgSElTVE9SWV9IRUFERVJfSEVJR0hUID0gMzI7XG5jb25zdCBISVNUT1JZX0VNUFRZX0hFSUdIVCA9IDI4O1xuY29uc3QgSElTVE9SWV9NT1JFX0hFSUdIVCA9IDIyO1xuY29uc3QgTUFYX1ZJU0lCTEVfUlVOUyA9IDIwO1xuXG5pbnRlcmZhY2UgSUF1dG9tYXRpb25JdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnYXV0b21hdGlvbi1pdGVtJztcblx0cmVhZG9ubHkgYXV0b21hdGlvbjogSUF1dG9tYXRpb247XG5cdHJlYWRvbmx5IHJ1bnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW107XG5cdHJlYWRvbmx5IGV4cGFuZGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBpbkZsaWdodDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSUF1dG9tYXRpb25MaXN0RW50cnkgPSBJQXV0b21hdGlvbkl0ZW1FbnRyeTtcblxuaW50ZXJmYWNlIElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbmFtZUVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbmFtZVRleHRFbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc2FibGVkQmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzY2hlZHVsZUVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc2VwMTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5leHRFbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHNlcEZvbGRlcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGZvbGRlckVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc2VwMjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhc3RFbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHByb21wdEVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uczogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGhpc3RvcnlQYW5lbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIEF1dG9tYXRpb25JdGVtRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJQXV0b21hdGlvbkxpc3RFbnRyeT4ge1xuXHQvLyBJbml0aWFsIGVzdGltYXRlIG9ubHkuIEFjdHVhbCByb3cgaGVpZ2h0IGlzIG1lYXN1cmVkIGZyb20gdGhlIERPTSBiZWNhdXNlXG5cdC8vIHRoZSBsaXN0IGlzIGNyZWF0ZWQgd2l0aCBgc3VwcG9ydER5bmFtaWNIZWlnaHRzYCAobWV0YSB3cmFwcywgcHJvbXB0IHdyYXBzLFxuXHQvLyBhbmQgcnVuLWVycm9yIHRleHQgaXMgdmFyaWFibGUtaGVpZ2h0KS4gU2VlIGBoYXNEeW5hbWljSGVpZ2h0YCBiZWxvdy5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IElBdXRvbWF0aW9uTGlzdEVudHJ5KTogbnVtYmVyIHtcblx0XHRpZiAoIWVsZW1lbnQuZXhwYW5kZWQpIHtcblx0XHRcdHJldHVybiBBVVRPTUFUSU9OX1JPV19IRUlHSFQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJ1bnMgPSBlbGVtZW50LnJ1bnM7XG5cdFx0Y29uc3QgdmlzaWJsZVJ1bnMgPSBNYXRoLm1pbihydW5zLmxlbmd0aCwgTUFYX1ZJU0lCTEVfUlVOUyk7XG5cdFx0aWYgKHZpc2libGVSdW5zID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gQVVUT01BVElPTl9ST1dfSEVJR0hUICsgSElTVE9SWV9FTVBUWV9IRUlHSFQ7XG5cdFx0fVxuXHRcdGxldCBoaXN0b3J5SGVpZ2h0ID0gSElTVE9SWV9IRUFERVJfSEVJR0hUICsgdmlzaWJsZVJ1bnMgKiBISVNUT1JZX1JPV19IRUlHSFQ7XG5cdFx0aWYgKHJ1bnMubGVuZ3RoID4gTUFYX1ZJU0lCTEVfUlVOUykge1xuXHRcdFx0aGlzdG9yeUhlaWdodCArPSBISVNUT1JZX01PUkVfSEVJR0hUO1xuXHRcdH1cblx0XHRyZXR1cm4gQVVUT01BVElPTl9ST1dfSEVJR0hUICsgaGlzdG9yeUhlaWdodDtcblx0fVxuXG5cdGhhc0R5bmFtaWNIZWlnaHQoX2VsZW1lbnQ6IElBdXRvbWF0aW9uTGlzdEVudHJ5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKF9lbGVtZW50OiBJQXV0b21hdGlvbkxpc3RFbnRyeSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdhdXRvbWF0aW9uSXRlbSc7XG5cdH1cbn1cblxuY2xhc3MgQXV0b21hdGlvbkl0ZW1SZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUF1dG9tYXRpb25JdGVtRW50cnksIElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhPiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnYXV0b21hdGlvbkl0ZW0nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBBdXRvbWF0aW9uc0xpc3RXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtcm93LXdyYXBwZXInKTtcblxuXHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbnMtcm93JykpO1xuXHRcdGNvbnN0IG1haW4gPSBET00uYXBwZW5kKHJvdywgJCgnLmF1dG9tYXRpb25zLXJvdy1tYWluJykpO1xuXHRcdGNvbnN0IG5hbWVFbCA9IERPTS5hcHBlbmQobWFpbiwgJCgnLmF1dG9tYXRpb25zLXJvdy1uYW1lJykpO1xuXHRcdGNvbnN0IG5hbWVUZXh0RWwgPSBET00uYXBwZW5kKG5hbWVFbCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1yb3ctbmFtZS10ZXh0JykpO1xuXHRcdGNvbnN0IGRpc2FibGVkQmFkZ2UgPSBET00uYXBwZW5kKG5hbWVFbCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1yb3ctZGlzYWJsZWQtYmFkZ2UnKSk7XG5cblx0XHRjb25zdCBtZXRhRWwgPSBET00uYXBwZW5kKG1haW4sICQoJy5hdXRvbWF0aW9ucy1yb3ctbWV0YScpKTtcblx0XHRjb25zdCBzY2hlZHVsZUVsID0gRE9NLmFwcGVuZChtZXRhRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcm93LXNjaGVkdWxlJykpO1xuXHRcdGNvbnN0IHNlcDEgPSBET00uYXBwZW5kKG1ldGFFbCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1yb3ctbWV0YS1zZXAnKSk7XG5cdFx0Y29uc3QgbmV4dEVsID0gRE9NLmFwcGVuZChtZXRhRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcm93LW5leHQnKSk7XG5cdFx0Y29uc3Qgc2VwRm9sZGVyID0gRE9NLmFwcGVuZChtZXRhRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcm93LW1ldGEtc2VwJykpO1xuXHRcdGNvbnN0IGZvbGRlckVsID0gRE9NLmFwcGVuZChtZXRhRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcm93LWZvbGRlcicpKTtcblx0XHRjb25zdCBzZXAyID0gRE9NLmFwcGVuZChtZXRhRWwsICQoJ3NwYW4uYXV0b21hdGlvbnMtcm93LW1ldGEtc2VwJykpO1xuXHRcdGNvbnN0IGxhc3RFbCA9IERPTS5hcHBlbmQobWV0YUVsLCAkKCdzcGFuLmF1dG9tYXRpb25zLXJvdy1sYXN0JykpO1xuXG5cdFx0Y29uc3QgcHJvbXB0RWwgPSBET00uYXBwZW5kKG1haW4sICQoJy5hdXRvbWF0aW9ucy1yb3ctcHJvbXB0JykpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBET00uYXBwZW5kKHJvdywgJCgnLmF1dG9tYXRpb25zLXJvdy1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGhpc3RvcnlQYW5lbCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbnMtcm93LWhpc3RvcnknKSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIHJvdywgbmFtZUVsLCBuYW1lVGV4dEVsLCBkaXNhYmxlZEJhZGdlLCBzY2hlZHVsZUVsLCBzZXAxLCBuZXh0RWwsIHNlcEZvbGRlciwgZm9sZGVyRWwsIHNlcDIsIGxhc3RFbCwgcHJvbXB0RWwsIGFjdGlvbnMsIGhpc3RvcnlQYW5lbCwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUF1dG9tYXRpb25JdGVtRW50cnksIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uLCBydW5zLCBleHBhbmRlZCwgaW5GbGlnaHQgfSA9IGVsZW1lbnQ7XG5cblx0XHR0ZW1wbGF0ZURhdGEubmFtZVRleHRFbC50ZXh0Q29udGVudCA9IGF1dG9tYXRpb24ubmFtZTtcblx0XHR0ZW1wbGF0ZURhdGEucm93LmNsYXNzTGlzdC50b2dnbGUoJ2F1dG9tYXRpb25zLXJvdy1kaXNhYmxlZCcsICFhdXRvbWF0aW9uLmVuYWJsZWQpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNhYmxlZEJhZGdlLnRleHRDb250ZW50ID0gIWF1dG9tYXRpb24uZW5hYmxlZCA/IGxvY2FsaXplKCdhdXRvbWF0aW9uRGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpIDogJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc2FibGVkQmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICFhdXRvbWF0aW9uLmVuYWJsZWQgPyAnJyA6ICdub25lJztcblxuXHRcdHRlbXBsYXRlRGF0YS5zY2hlZHVsZUVsLnRleHRDb250ZW50ID0gZm9ybWF0U2NoZWR1bGUoYXV0b21hdGlvbik7XG5cdFx0dGVtcGxhdGVEYXRhLnNlcDEudGV4dENvbnRlbnQgPSAnXHUwMEI3Jztcblx0XHR0ZW1wbGF0ZURhdGEubmV4dEVsLnRleHRDb250ZW50ID0gZm9ybWF0TmV4dFJ1bihhdXRvbWF0aW9uKTtcblx0XHR0ZW1wbGF0ZURhdGEuc2VwRm9sZGVyLnRleHRDb250ZW50ID0gJ1x1MDBCNyc7XG5cdFx0dGVtcGxhdGVEYXRhLmZvbGRlckVsLnRleHRDb250ZW50ID0gdGhpcy53aWRnZXQuZm9ybWF0VGFyZ2V0TGFiZWwoYXV0b21hdGlvbik7XG5cdFx0aWYgKGF1dG9tYXRpb24udGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZm9sZGVyRWwudGl0bGUgPSBsb2NhbGl6ZSgnYXV0b21hdGlvblF1aWNrQ2hhdFRpdGxlJywgXCJSdW5zIGFzIGEgd29ya3NwYWNlLWxlc3MgY2hhdFwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmZvbGRlckVsLnRpdGxlID0gYXV0b21hdGlvbi50YXJnZXQuZm9sZGVyVXJpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGF1dG9tYXRpb24ubGFzdFJ1bkF0KSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc2VwMi50ZXh0Q29udGVudCA9ICdcdTAwQjcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnNlcDIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhc3RFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsYXN0UnVuJywgXCJMYXN0IHJ1biB7MH1cIiwgZm9ybWF0UmVsYXRpdmVUaW1lT3JJc28oYXV0b21hdGlvbi5sYXN0UnVuQXQpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYXN0RWwuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc2VwMi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhc3RFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5wcm9tcHRFbC50ZXh0Q29udGVudCA9IHRydW5jYXRlKGF1dG9tYXRpb24ucHJvbXB0LCAxNjApO1xuXHRcdHRlbXBsYXRlRGF0YS5wcm9tcHRFbC50aXRsZSA9IGF1dG9tYXRpb24ucHJvbXB0O1xuXG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5yb3csICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRpZiAoRE9NLmlzQW5jZXN0b3IoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRlbXBsYXRlRGF0YS5hY3Rpb25zKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLndpZGdldC50b2dnbGVFeHBhbmRlZChhdXRvbWF0aW9uLmlkKTtcblx0XHR9KSk7XG5cblx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5hY3Rpb25zKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLmFjdGlvbnMsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnJlbmRlckFjdGlvbnModGVtcGxhdGVEYXRhLCBhdXRvbWF0aW9uLCBleHBhbmRlZCwgaW5GbGlnaHQpO1xuXG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuaGlzdG9yeVBhbmVsKTtcblx0XHR0ZW1wbGF0ZURhdGEuaGlzdG9yeVBhbmVsLmlkID0gYGF1dG9tYXRpb24taGlzdG9yeS0ke2F1dG9tYXRpb24uaWR9YDtcblx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdHRoaXMucmVuZGVySGlzdG9yeVBhbmVsKHRlbXBsYXRlRGF0YSwgYXV0b21hdGlvbiwgcnVucyk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5oaXN0b3J5UGFuZWwuc3R5bGUuZGlzcGxheSA9IGV4cGFuZGVkID8gJycgOiAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhdXRvbWF0aW9ucy1yb3ctd3JhcHBlci1leHBhbmRlZCcsIGV4cGFuZGVkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQWN0aW9ucyh0ZW1wbGF0ZURhdGE6IElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhLCBhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgZXhwYW5kZWQ6IGJvb2xlYW4sIGluRmxpZ2h0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBhY3Rpb25zLCBkaXNwb3NhYmxlcyB9ID0gdGVtcGxhdGVEYXRhO1xuXG5cdFx0Y29uc3QgcnVuQnRuID0gdGhpcy5jcmVhdGVJY29uQnV0dG9uKGFjdGlvbnMsIENvZGljb24ucGxheSwgbG9jYWxpemUoJ3J1bk5vdycsIFwiUnVuIG5vd1wiKSwgaW5GbGlnaHQsIGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHJ1bkJ0biwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLndpZGdldC5ydW5Ob3coYXV0b21hdGlvbik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdG9nZ2xlSWNvbiA9IGF1dG9tYXRpb24uZW5hYmxlZCA/IENvZGljb24uZXllIDogQ29kaWNvbi5leWVDbG9zZWQ7XG5cdFx0Y29uc3QgdG9nZ2xlVG9vbHRpcCA9IGF1dG9tYXRpb24uZW5hYmxlZCA/IGxvY2FsaXplKCdkaXNhYmxlQXV0b21hdGlvbicsIFwiRGlzYWJsZVwiKSA6IGxvY2FsaXplKCdlbmFibGVBdXRvbWF0aW9uJywgXCJFbmFibGVcIik7XG5cdFx0Y29uc3QgdG9nZ2xlQnRuID0gdGhpcy5jcmVhdGVJY29uQnV0dG9uKGFjdGlvbnMsIHRvZ2dsZUljb24sIHRvZ2dsZVRvb2x0aXAsIGZhbHNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0b2dnbGVCdG4sICdjbGljaycsICgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy53aWRnZXQudG9nZ2xlRW5hYmxlZChhdXRvbWF0aW9uKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBlZGl0QnRuID0gdGhpcy5jcmVhdGVJY29uQnV0dG9uKGFjdGlvbnMsIENvZGljb24uZWRpdCwgbG9jYWxpemUoJ2VkaXRBdXRvbWF0aW9uJywgXCJFZGl0XCIpLCBmYWxzZSwgZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoZWRpdEJ0biwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLndpZGdldC5vcGVuRWRpdERpYWxvZyhhdXRvbWF0aW9uKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZWxldGVCdG4gPSB0aGlzLmNyZWF0ZUljb25CdXR0b24oYWN0aW9ucywgQ29kaWNvbi50cmFzaCwgbG9jYWxpemUoJ2RlbGV0ZUF1dG9tYXRpb24nLCBcIkRlbGV0ZVwiKSwgZmFsc2UsIGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGRlbGV0ZUJ0biwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLndpZGdldC5kZWxldGVBdXRvbWF0aW9uKGF1dG9tYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGhpc3RJY29uID0gZXhwYW5kZWQgPyBDb2RpY29uLmNoZXZyb25Eb3duIDogQ29kaWNvbi5jaGV2cm9uUmlnaHQ7XG5cdFx0Y29uc3QgaGlzdFRvb2x0aXAgPSBleHBhbmRlZCA/IGxvY2FsaXplKCdoaWRlSGlzdG9yeScsIFwiSGlkZSBoaXN0b3J5XCIpIDogbG9jYWxpemUoJ3Nob3dIaXN0b3J5JywgXCJTaG93IGhpc3RvcnlcIik7XG5cdFx0Y29uc3QgaGlzdEJ0biA9IHRoaXMuY3JlYXRlSWNvbkJ1dHRvbihhY3Rpb25zLCBoaXN0SWNvbiwgaGlzdFRvb2x0aXAsIGZhbHNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aGlzdEJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBleHBhbmRlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdGhpc3RCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgYGF1dG9tYXRpb24taGlzdG9yeS0ke2F1dG9tYXRpb24uaWR9YCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihoaXN0QnRuLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLndpZGdldC50b2dnbGVFeHBhbmRlZChhdXRvbWF0aW9uLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhpc3RvcnlQYW5lbCh0ZW1wbGF0ZURhdGE6IElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhLCBhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgcnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHBhbmVsID0gdGVtcGxhdGVEYXRhLmhpc3RvcnlQYW5lbDtcblx0XHRwYW5lbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0cGFuZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2hpc3RvcnlBcmlhTGFiZWwnLCBcIlJ1biBoaXN0b3J5IGZvciB7MH1cIiwgYXV0b21hdGlvbi5uYW1lKSk7XG5cblx0XHRpZiAocnVucy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gRE9NLmFwcGVuZChwYW5lbCwgJCgnLmF1dG9tYXRpb25zLWhpc3RvcnktZW1wdHknKSk7XG5cdFx0XHRlbXB0eS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub1J1bnNZZXQnLCBcIk5vIHJ1bnMgeWV0LlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkaW5nID0gRE9NLmFwcGVuZChwYW5lbCwgJCgnaDQuYXV0b21hdGlvbnMtaGlzdG9yeS1oZWFkaW5nJykpO1xuXHRcdGhlYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncnVuSGlzdG9yeScsIFwiUnVuIGhpc3RvcnlcIik7XG5cblx0XHRjb25zdCBydW5zTGlzdCA9IERPTS5hcHBlbmQocGFuZWwsICQoJ3VsLmF1dG9tYXRpb25zLWhpc3RvcnktbGlzdCcpKTtcblx0XHRjb25zdCB2aXNpYmxlUnVucyA9IHJ1bnMuc2xpY2UoMCwgTUFYX1ZJU0lCTEVfUlVOUyk7XG5cdFx0Zm9yIChjb25zdCBydW4gb2YgdmlzaWJsZVJ1bnMpIHtcblx0XHRcdHRoaXMucmVuZGVyUnVuUm93KHJ1bnNMaXN0LCBydW4sIHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHRcdGlmIChydW5zLmxlbmd0aCA+IE1BWF9WSVNJQkxFX1JVTlMpIHtcblx0XHRcdGNvbnN0IG1vcmUgPSBET00uYXBwZW5kKHBhbmVsLCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1tb3JlJykpO1xuXHRcdFx0bW9yZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdoaXN0b3J5TW9yZScsIFwiezB9IG1vcmUgcnVuKHMpIG5vdCBzaG93bi5cIiwgcnVucy5sZW5ndGggLSB2aXNpYmxlUnVucy5sZW5ndGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUnVuUm93KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHJ1bjogSUF1dG9tYXRpb25SdW4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRjb25zdCBsaSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdsaS5hdXRvbWF0aW9ucy1oaXN0b3J5LXJvdycsIHtcblx0XHRcdCdkYXRhLXJ1bi1pZCc6IHJ1bi5pZCxcblx0XHRcdCdkYXRhLXJ1bi1zdGF0dXMnOiBydW4uc3RhdHVzLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHN0YXR1c0ljb24gPSBET00uYXBwZW5kKGxpLCAkKCdzcGFuLmF1dG9tYXRpb25zLWhpc3Rvcnktc3RhdHVzLmNvZGljb24nKSk7XG5cdFx0Y29uc3QgeyBpY29uSWQsIHNwaW4gfSA9IHJ1blN0YXR1c0ljb24ocnVuLnN0YXR1cyk7XG5cdFx0c3RhdHVzSWNvbi5jbGFzc0xpc3QuYWRkKGBjb2RpY29uLSR7aWNvbklkfWApO1xuXHRcdGlmIChzcGluKSB7XG5cdFx0XHRzdGF0dXNJY29uLmNsYXNzTGlzdC5hZGQoJ2NvZGljb24tbW9kaWZpZXItc3BpbicpO1xuXHRcdH1cblx0XHRzdGF0dXNJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IERPTS5hcHBlbmQobGksICQoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LXJvdy10ZXh0JykpO1xuXHRcdGNvbnN0IGZpcnN0ID0gRE9NLmFwcGVuZCh0ZXh0LCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1yb3ctZmlyc3QnKSk7XG5cdFx0Y29uc3Qgc3RhdHVzTGFiZWwgPSBET00uYXBwZW5kKGZpcnN0LCAkKCdzcGFuLmF1dG9tYXRpb25zLWhpc3Rvcnktcm93LXN0YXR1cycpKTtcblx0XHRzdGF0dXNMYWJlbC50ZXh0Q29udGVudCA9IHJ1blN0YXR1c0xhYmVsKHJ1bi5zdGF0dXMpO1xuXHRcdGNvbnN0IHNlcCA9IERPTS5hcHBlbmQoZmlyc3QsICQoJ3NwYW4uYXV0b21hdGlvbnMtaGlzdG9yeS1yb3ctc2VwJykpO1xuXHRcdHNlcC50ZXh0Q29udGVudCA9ICdcdTAwQjcnO1xuXHRcdGNvbnN0IHRyaWcgPSBET00uYXBwZW5kKGZpcnN0LCAkKCdzcGFuLmF1dG9tYXRpb25zLWhpc3Rvcnktcm93LXRyaWdnZXInKSk7XG5cdFx0dHJpZy50ZXh0Q29udGVudCA9IHJ1blRyaWdnZXJMYWJlbChydW4udHJpZ2dlcik7XG5cdFx0Y29uc3Qgc2VwMiA9IERPTS5hcHBlbmQoZmlyc3QsICQoJ3NwYW4uYXV0b21hdGlvbnMtaGlzdG9yeS1yb3ctc2VwJykpO1xuXHRcdHNlcDIudGV4dENvbnRlbnQgPSAnXHUwMEI3Jztcblx0XHRjb25zdCBzdGFydGVkID0gRE9NLmFwcGVuZChmaXJzdCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1oaXN0b3J5LXJvdy1zdGFydGVkJykpO1xuXHRcdHN0YXJ0ZWQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncnVuU3RhcnRlZCcsIFwiU3RhcnRlZCB7MH1cIiwgZm9ybWF0UmVsYXRpdmVUaW1lT3JJc28ocnVuLnN0YXJ0ZWRBdCkpO1xuXHRcdGNvbnN0IGR1ciA9IGZvcm1hdFJ1bkR1cmF0aW9uKHJ1bik7XG5cdFx0aWYgKGR1cikge1xuXHRcdFx0Y29uc3Qgc2VwMyA9IERPTS5hcHBlbmQoZmlyc3QsICQoJ3NwYW4uYXV0b21hdGlvbnMtaGlzdG9yeS1yb3ctc2VwJykpO1xuXHRcdFx0c2VwMy50ZXh0Q29udGVudCA9ICdcdTAwQjcnO1xuXHRcdFx0Y29uc3QgZHVyRWwgPSBET00uYXBwZW5kKGZpcnN0LCAkKCdzcGFuLmF1dG9tYXRpb25zLWhpc3Rvcnktcm93LWR1cmF0aW9uJykpO1xuXHRcdFx0ZHVyRWwudGV4dENvbnRlbnQgPSBkdXI7XG5cdFx0fVxuXG5cdFx0aWYgKHJ1bi5lcnJvck1lc3NhZ2UpIHtcblx0XHRcdGNvbnN0IGVyciA9IERPTS5hcHBlbmQodGV4dCwgJCgnLmF1dG9tYXRpb25zLWhpc3Rvcnktcm93LWVycm9yJykpO1xuXHRcdFx0ZXJyLnRleHRDb250ZW50ID0gcnVuLmVycm9yTWVzc2FnZTtcblx0XHRcdGVyci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG5cdFx0XHRlcnIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHJ1bi5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IG9wZW5CdXR0b24gPSBET00uYXBwZW5kKGxpLCAkKCdzcGFuLmF1dG9tYXRpb25zLWhpc3Rvcnktcm93LW9wZW4uY29kaWNvbi5jb2RpY29uLWxpbmstZXh0ZXJuYWwnKSk7XG5cdFx0XHRvcGVuQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdG9wZW5CdXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRvcGVuQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdvcGVuUnVuU2Vzc2lvbicsIFwiT3BlbiBzZXNzaW9uXCIpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBvcGVuQnV0dG9uLCBsb2NhbGl6ZSgnb3BlblJ1blNlc3Npb24nLCBcIk9wZW4gc2Vzc2lvblwiKSkpO1xuXHRcdFx0Y29uc3Qgb3BlblNlc3Npb24gPSAoZTogRXZlbnQpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKHJ1bi5zZXNzaW9uUmVzb3VyY2UhKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbQXV0b21hdGlvbnNMaXN0V2lkZ2V0XSBPcGVuaW5nIHNlc3Npb246ICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwSWQgPSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuaWQ7XG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ob3BlblNlc3Npb25CeVJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChhY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5jbG9zZUVkaXRvcih7IGVkaXRvcjogYWN0aXZlRWRpdG9yLCBncm91cElkOiBhY3RpdmVHcm91cElkIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkuY2F0Y2goKGVycikgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0F1dG9tYXRpb25zTGlzdFdpZGdldF0gb3BlblNlc3Npb24gZmFpbGVkIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdvcGVuUnVuU2Vzc2lvbkZhaWxlZCcsIFwiRmFpbGVkIHRvIG9wZW4gYXV0b21hdGlvbiBzZXNzaW9uXCIpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIob3BlbkJ1dHRvbiwgJ2NsaWNrJywgb3BlblNlc3Npb24pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wZW5CdXR0b24sICdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0b3BlblNlc3Npb24oZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUljb25CdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaWNvbjogVGhlbWVJY29uLCB0b29sdGlwOiBzdHJpbmcsIGRpc2FibGVkOiBib29sZWFuLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdidXR0b24uYXV0b21hdGlvbnMtcm93LWFjdGlvbi1idXR0b24nLCB7XG5cdFx0XHR0eXBlOiAnYnV0dG9uJyxcblx0XHRcdCdhcmlhLWxhYmVsJzogdG9vbHRpcCxcblx0XHRcdHRhYmluZGV4OiAnMCcsXG5cdFx0fSkpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHRidXR0b24uZGlzYWJsZWQgPSBkaXNhYmxlZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYnV0dG9uLCB0b29sdGlwKSk7XG5cdFx0cmV0dXJuIGJ1dHRvbjtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBdXRvbWF0aW9uUm93VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFdpZGdldCB0aGF0IHJlbmRlcnMgdGhlIEF1dG9tYXRpb25zIHNlY3Rpb24gb2YgdGhlIEFJIEN1c3RvbWl6YXRpb24gZWRpdG9yXG4gKiB1c2luZyBhIHZpcnR1YWxpemVkIHtAbGluayBXb3JrYmVuY2hMaXN0fS5cbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25zTGlzdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbUNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhlYWRlckVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBlbXB0eUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGlzdCE6IFdvcmtiZW5jaExpc3Q8SUF1dG9tYXRpb25MaXN0RW50cnk+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbmV3QnV0dG9uSG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmV3RW1wdHlTdGF0ZUJ1dHRvbkhvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbXB0eVN0YXRlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcnVuSW5GbGlnaHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBleHBhbmRlZFJvd3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBkaXNwbGF5RW50cmllczogSUF1dG9tYXRpb25MaXN0RW50cnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgbGFzdEhlaWdodCA9IDA7XG5cdHByaXZhdGUgbGFzdFdpZHRoID0gMDtcblx0cHJpdmF0ZSB2aXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgbGlzdERpcnR5ID0gZmFsc2U7XG5cdHByaXZhdGUgcmVtZWFzdXJlT25OZXh0TGF5b3V0ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uUnVubmVyIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblJ1bm5lcjogSUF1dG9tYXRpb25SdW5uZXIsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlOiBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuYXV0b21hdGlvbnMtbGlzdC13aWRnZXQnKTtcblx0XHR0aGlzLmhlYWRlckVsID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5hdXRvbWF0aW9ucy1oZWFkZXInKSk7XG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuYXV0b21hdGlvbnMtZW1wdHktc3RhdGUnKSk7XG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMubGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuYXV0b21hdGlvbnMtbGlzdCcpKTtcblxuXHRcdHRoaXMucmVuZGVySGVhZGVyKCk7XG5cdFx0dGhpcy5jcmVhdGVMaXN0KCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uU2VydmljZS5ydW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlTGlzdChpdGVtcyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKGl0ZW1zLmxlbmd0aCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJIZWFkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBET00uYXBwZW5kKHRoaXMuaGVhZGVyRWwsICQoJy5hdXRvbWF0aW9ucy1oZWFkZXItcm93JykpO1xuXHRcdGNvbnN0IHRpdGxlRWwgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5hdXRvbWF0aW9ucy1oZWFkZXItdGl0bGUnKSk7XG5cdFx0dGl0bGVFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhdXRvbWF0aW9uc0hlYWRlclRpdGxlJywgXCJBdXRvbWF0aW9uc1wiKTtcblx0XHRjb25zdCBzdWJ0aXRsZUVsID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckVsLCAkKCdwLmF1dG9tYXRpb25zLWhlYWRlci1zdWJ0aXRsZScpKTtcblx0XHRzdWJ0aXRsZUVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2F1dG9tYXRpb25zSGVhZGVyU3VidGl0bGUnLCBcIlNjaGVkdWxlIGFnZW50IHNlc3Npb25zIHRvIHJ1biBvbiBhIGNhZGVuY2UgeW91IGNob29zZS5cIik7XG5cblx0XHRjb25zdCBuZXdCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRpdGxlUm93LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHRpdGxlOiBsb2NhbGl6ZSgnbmV3QXV0b21hdGlvbicsIFwiTmV3IGF1dG9tYXRpb25cIikgfSkpO1xuXHRcdG5ld0J1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCduZXdBdXRvbWF0aW9uJywgXCJOZXcgYXV0b21hdGlvblwiKTtcblx0XHRuZXdCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhdXRvbWF0aW9ucy1uZXctYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5vcGVuQ3JlYXRlRGlhbG9nKCkpKTtcblx0XHR0aGlzLm5ld0J1dHRvbkhvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgbmV3QnV0dG9uLmVsZW1lbnQsIGxvY2FsaXplKCduZXdBdXRvbWF0aW9uVG9vbHRpcCcsIFwiQ3JlYXRlIGEgbmV3IGF1dG9tYXRpb25cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMaXN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IEF1dG9tYXRpb25JdGVtRGVsZWdhdGUoKTtcblx0XHRjb25zdCByZW5kZXJlciA9IG5ldyBBdXRvbWF0aW9uSXRlbVJlbmRlcmVyKHRoaXMsIHRoaXMuaG92ZXJTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMuZWRpdG9yU2VydmljZSwgdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5saXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3Q8SUF1dG9tYXRpb25MaXN0RW50cnk+LFxuXHRcdFx0J0F1dG9tYXRpb25zTWFuYWdlbWVudExpc3QnLFxuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRbcmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydER5bmFtaWNIZWlnaHRzOiB0cnVlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudDogSUF1dG9tYXRpb25MaXN0RW50cnkpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmZvcm1hdEFyaWFMYWJlbChlbGVtZW50LmF1dG9tYXRpb24pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uc0xpc3RBcmlhTGFiZWwnLCBcIkF1dG9tYXRpb25zXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQ6IElBdXRvbWF0aW9uTGlzdEVudHJ5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hdXRvbWF0aW9uLmlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmxpc3QuZ2V0U2VsZWN0aW9uKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxpc3QoaXRlbXM6IHJlYWRvbmx5IElBdXRvbWF0aW9uW10pOiB2b2lkIHtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtZW1wdHknKTtcblx0XHRcdHRoaXMuZGlzcGxheUVudHJpZXMgPSBbXTtcblx0XHRcdHRoaXMubGlzdERpcnR5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuY29tbWl0TGlzdCgpO1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMucmVuZGVyRW1wdHlTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdhdXRvbWF0aW9ucy1lbXB0eScpO1xuXHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMubmV3RW1wdHlTdGF0ZUJ1dHRvbkhvdmVyLmNsZWFyKCk7XG5cblx0XHR0aGlzLmRpc3BsYXlFbnRyaWVzID0gaXRlbXMubWFwKGF1dG9tYXRpb24gPT4gKHtcblx0XHRcdHR5cGU6ICdhdXRvbWF0aW9uLWl0ZW0nIGFzIGNvbnN0LFxuXHRcdFx0YXV0b21hdGlvbixcblx0XHRcdHJ1bnM6IHRoaXMuYXV0b21hdGlvblNlcnZpY2UucnVuc0ZvcihhdXRvbWF0aW9uLmlkKS5nZXQoKSxcblx0XHRcdGV4cGFuZGVkOiB0aGlzLmV4cGFuZGVkUm93cy5oYXMoYXV0b21hdGlvbi5pZCksXG5cdFx0XHRpbkZsaWdodDogdGhpcy5ydW5JbkZsaWdodC5oYXMoYXV0b21hdGlvbi5pZCksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5saXN0RGlydHkgPSB0cnVlO1xuXHRcdHRoaXMuY29tbWl0TGlzdCgpO1xuXHRcdGlmICh0aGlzLnZpc2libGUgJiYgdGhpcy5sYXN0SGVpZ2h0ID4gMCAmJiB0aGlzLmxhc3RXaWR0aCA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGFzdEhlaWdodCwgdGhpcy5sYXN0V2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tbWl0TGlzdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSB8fCAhdGhpcy5saXN0RGlydHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIHRoaXMuZGlzcGxheUVudHJpZXMpO1xuXHRcdHRoaXMubGlzdERpcnR5ID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVtcHR5U3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1wdHlTdGF0ZVN0b3JlLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVtcHR5Q29udGFpbmVyKTtcblx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTtcblx0XHRjb25zdCB0aXRsZSA9IERPTS5hcHBlbmQodGhpcy5lbXB0eUNvbnRhaW5lciwgJCgnaDMuYXV0b21hdGlvbnMtZW1wdHktdGl0bGUnKSk7XG5cdFx0dGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYXV0b21hdGlvbnNFbXB0eVRpdGxlJywgXCJObyBhdXRvbWF0aW9ucyB5ZXRcIik7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IERPTS5hcHBlbmQodGhpcy5lbXB0eUNvbnRhaW5lciwgJCgncC5hdXRvbWF0aW9ucy1lbXB0eS1tZXNzYWdlJykpO1xuXHRcdG1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYXV0b21hdGlvbnNFbXB0eU1lc3NhZ2UnLCBcIkNyZWF0ZSBhbiBhdXRvbWF0aW9uIHRvIHNjaGVkdWxlIGFuIGFnZW50IHNlc3Npb24gdG8gcnVuIG9uIGEgY2FkZW5jZSB5b3UgY2hvb3NlLlwiKTtcblxuXHRcdGNvbnN0IGN0YUJ1dHRvbiA9IHRoaXMuX2VtcHR5U3RhdGVTdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLmVtcHR5Q29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSkpO1xuXHRcdGN0YUJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdhdXRvbWF0aW9uc0VtcHR5Q3RhJywgXCJDcmVhdGUgYXV0b21hdGlvblwiKTtcblx0XHRjdGFCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhdXRvbWF0aW9ucy1lbXB0eS1jdGEnKTtcblx0XHR0aGlzLl9lbXB0eVN0YXRlU3RvcmUuYWRkKGN0YUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMub3BlbkNyZWF0ZURpYWxvZygpKSk7XG5cdFx0dGhpcy5uZXdFbXB0eVN0YXRlQnV0dG9uSG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBjdGFCdXR0b24uZWxlbWVudCwgbG9jYWxpemUoJ25ld0F1dG9tYXRpb25Ub29sdGlwJywgXCJDcmVhdGUgYSBuZXcgYXV0b21hdGlvblwiKSk7XG5cdH1cblxuXHR0b2dnbGVFeHBhbmRlZChhdXRvbWF0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4cGFuZGVkUm93cy5oYXMoYXV0b21hdGlvbklkKSkge1xuXHRcdFx0dGhpcy5leHBhbmRlZFJvd3MuZGVsZXRlKGF1dG9tYXRpb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXhwYW5kZWRSb3dzLmFkZChhdXRvbWF0aW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUxpc3QodGhpcy5hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSk7XG5cdH1cblxuXHRhc3luYyBydW5Ob3coYXV0b21hdGlvbjogSUF1dG9tYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9ub3RpZnlEaXNhYmxlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5ydW5JbkZsaWdodC5oYXMoYXV0b21hdGlvbi5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5ydW5JbkZsaWdodC5hZGQoYXV0b21hdGlvbi5pZCk7XG5cdFx0dGhpcy51cGRhdGVMaXN0KHRoaXMuYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBNYW51YWwgcnVucyBkbyBub3QgY3VycmVudGx5IGV4cG9zZSBjYW5jZWxsYXRpb24uXG5cdFx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLmF1dG9tYXRpb25SdW5uZXIucnVuT25jZShhdXRvbWF0aW9uLCAnbWFudWFsJywgMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBkaXNwYXRjaCA9IGF3YWl0IG9wZXJhdGlvbi53aGVuRGlzcGF0Y2hlZDtcblx0XHRcdGlmIChkaXNwYXRjaC5raW5kID09PSAnc3RhcnRlZCcpIHtcblx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uU3RhcnRlZFN0YXR1cycsIFwiU3RhcnRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG9wZXJhdGlvbi53aGVuQ29tcGxldGVkO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNdIHJ1bk5vdyBmYWlsZWQgdW5leHBlY3RlZGx5JywgZXJyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5ydW5JbkZsaWdodC5kZWxldGUoYXV0b21hdGlvbi5pZCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUxpc3QodGhpcy5hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRW5hYmxlZChhdXRvbWF0aW9uOiBJQXV0b21hdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX25vdGlmeURpc2FibGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCwgeyBlbmFibGVkOiAhYXV0b21hdGlvbi5lbmFibGVkIH0pO1xuXHRcdFx0c3RhdHVzKGF1dG9tYXRpb24uZW5hYmxlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uRGlzYWJsZWRTdGF0dXMnLCBcIkRpc2FibGVkIGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbkVuYWJsZWRTdGF0dXMnLCBcIkVuYWJsZWQgYXV0b21hdGlvbiB7MH1cIiwgYXV0b21hdGlvbi5uYW1lKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc10gRmFpbGVkIHRvIHRvZ2dsZSBhdXRvbWF0aW9uJywgZXJyKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGVBdXRvbWF0aW9uKGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fbm90aWZ5RGlzYWJsZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVBdXRvbWF0aW9uJywgXCJEZWxldGUgYXV0b21hdGlvbiBcXHUyMDFDezB9XFx1MjAxRD9cIiwgYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVBdXRvbWF0aW9uRGV0YWlsJywgXCJSdW5zIGFscmVhZHkgaW4gZmxpZ2h0IHdpbGwgY29udGludWUuIFRoaXMgY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlJywgXCJEZWxldGVcIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX25vdGlmeURpc2FibGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZUF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25EZWxldGVkU3RhdHVzJywgXCJEZWxldGVkIGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNdIEZhaWxlZCB0byBkZWxldGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb3BlbkVkaXREaWFsb2coYXV0b21hdGlvbjogSUF1dG9tYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9ub3RpZnlEaXNhYmxlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnNob3dBdXRvbWF0aW9uRGlhbG9nKHtcblx0XHRcdGV4aXN0aW5nOiBhdXRvbWF0aW9uLFxuXHRcdH0pO1xuXHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5raW5kICE9PSAndXBkYXRlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9ub3RpZnlEaXNhYmxlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXBkYXRlUmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS51cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQocmVzdWx0LmlkLCByZXN1bHQudmFsdWUsIGF1dG9tYXRpb24pO1xuXHRcdFx0aWYgKHVwZGF0ZVJlc3VsdC5raW5kID09PSAnY29uZmxpY3QnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcih1cGRhdGVSZXN1bHQuY3VycmVudFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb25DaGFuZ2VkRHVyaW5nRWRpdCcsIFwiVGhpcyBhdXRvbWF0aW9uIGNoYW5nZWQgd2hpbGUgdGhlIGRpYWxvZyB3YXMgb3Blbi4gUmVvcGVuIGl0IHRvIHJldmlldyB0aGUgbGF0ZXN0IHZhbHVlcy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlZER1cmluZ0VkaXQnLCBcIlRoaXMgYXV0b21hdGlvbiB3YXMgZGVsZXRlZCB3aGlsZSB0aGUgZGlhbG9nIHdhcyBvcGVuLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25VcGRhdGVkU3RhdHVzJywgXCJVcGRhdGVkIGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNdIEZhaWxlZCB0byB1cGRhdGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uVXBkYXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gdXBkYXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdGZvcm1hdEZvbGRlckxhYmVsKGZvbGRlclVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGNvbnN0IG1hdGNoID0gZm9sZGVycy5maW5kKGYgPT4gcmVzb3VyY2VzLmlzRXF1YWwoZi51cmksIGZvbGRlclVyaSkpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoLm5hbWUgfHwgbWF0Y2gudXJpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlZ21lbnRzID0gZm9sZGVyVXJpLnBhdGguc3BsaXQoJy8nKS5maWx0ZXIocyA9PiBzLmxlbmd0aCA+IDApO1xuXHRcdHJldHVybiBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXSA/PyBmb2xkZXJVcmkudG9TdHJpbmcoKTtcblx0fVxuXG5cdGZvcm1hdFRhcmdldExhYmVsKGF1dG9tYXRpb246IElBdXRvbWF0aW9uKTogc3RyaW5nIHtcblx0XHRpZiAoYXV0b21hdGlvbi50YXJnZXQua2luZCA9PT0gJ3F1aWNrQ2hhdCcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvblF1aWNrQ2hhdExhYmVsJywgXCJ3aXRob3V0IGEgd29ya3NwYWNlXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb25Gb2xkZXJMYWJlbCcsIFwiaW4gezB9XCIsIHRoaXMuZm9ybWF0Rm9sZGVyTGFiZWwoYXV0b21hdGlvbi50YXJnZXQuZm9sZGVyVXJpKSk7XG5cdH1cblxuXHRmb3JtYXRBcmlhTGFiZWwoYXV0b21hdGlvbjogSUF1dG9tYXRpb24pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNjaGVkdWxlID0gZm9ybWF0U2NoZWR1bGUoYXV0b21hdGlvbik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5mb3JtYXRUYXJnZXRMYWJlbChhdXRvbWF0aW9uKTtcblx0XHRyZXR1cm4gYXV0b21hdGlvbi5lbmFibGVkXG5cdFx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uQXJpYUxhYmVsJywgXCJ7MH0sIHsxfSwgezJ9XCIsIGF1dG9tYXRpb24ubmFtZSwgc2NoZWR1bGUsIHRhcmdldClcblx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb25BcmlhTGFiZWxEaXNhYmxlZCcsIFwiezB9LCBkaXNhYmxlZCwgezF9LCB7Mn1cIiwgYXV0b21hdGlvbi5uYW1lLCBzY2hlZHVsZSwgdGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ub3RpZnlEaXNhYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uc0Rpc2FibGVkVGl0bGUnLCBcIkF1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvbnNEaXNhYmxlZERldGFpbCcsIFwiRW5hYmxlIFxcdTIwMUN7MH1cXHUyMDFEIHRvIG1ha2UgY2hhbmdlcy5cIiwgQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5DcmVhdGVEaWFsb2coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fbm90aWZ5RGlzYWJsZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5zaG93QXV0b21hdGlvbkRpYWxvZyh7fSk7XG5cdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LmtpbmQgIT09ICdjcmVhdGUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX25vdGlmeURpc2FibGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHJlc3VsdC52YWx1ZSk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25DcmVhdGVkU3RhdHVzJywgXCJDcmVhdGVkIGF1dG9tYXRpb24gezB9XCIsIGNyZWF0ZWQubmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNdIEZhaWxlZCB0byBjcmVhdGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uQ3JlYXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gY3JlYXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGFzdEhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmxhc3RXaWR0aCA9IHdpZHRoO1xuXG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0XHRpZiAoIXRoaXMudmlzaWJsZSB8fCB0aGlzLmRpc3BsYXlFbnRyaWVzLmxlbmd0aCA9PT0gMCB8fCBoZWlnaHQgPD0gMCB8fCB3aWR0aCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5oZWFkZXJFbC5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKGhlYWRlckhlaWdodCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gaGVhZGVySGVpZ2h0KTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHR0aGlzLmxpc3QubGF5b3V0KGxpc3RIZWlnaHQsIHdpZHRoKTtcblx0XHRpZiAodGhpcy5yZW1lYXN1cmVPbk5leHRMYXlvdXQpIHtcblx0XHRcdHRoaXMucmVtZWFzdXJlT25OZXh0TGF5b3V0ID0gZmFsc2U7XG5cdFx0XHR0aGlzLmxpc3QucmVyZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aXNpYmxlID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aXNpYmxlID0gdmlzaWJsZTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbW1pdExpc3QoKTtcblx0XHR0aGlzLnJlbWVhc3VyZU9uTmV4dExheW91dCA9IHRoaXMubGlzdC5sZW5ndGggPiAwO1xuXHR9XG5cblx0ZmlyZUl0ZW1Db3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKHRoaXMuYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoKTtcblx0fVxuXG5cdC8qKiBUZXN0LW9ubHk6IG51bWJlciBvZiByb3dzIGN1cnJlbnRseSBpbiB0aGUgdmlydHVhbGl6ZWQgbGlzdC4gKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpc3QubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3Qtb25seTogc25hcHNob3Qgb2YgdGhlIHZpZXctbW9kZWwgcm93cyB0aGUgbGlzdCBpcyBkaXNwbGF5aW5nLlxuXHQgKiBUaGUgdmlydHVhbGl6ZWQge0BsaW5rIFdvcmtiZW5jaExpc3R9IGRvZXMgbm90IGxheSBvdXQgcm93cyBpbiBhIHVuaXQtdGVzdFxuXHQgKiBET00sIHNvIHRlc3RzIGFzc2VydCB0aGUgZGVyaXZlZCByZW5kZXIgc3RhdGUgKGV4cGFuc2lvbiwgcnVucywgaW4tZmxpZ2h0KVxuXHQgKiBoZXJlIGluc3RlYWQgb2YgcXVlcnlpbmcgcm93IGVsZW1lbnRzLlxuXHQgKi9cblx0Z2V0RGlzcGxheUVudHJpZXNGb3JUZXN0KCk6IHJlYWRvbmx5IElBdXRvbWF0aW9uTGlzdEVudHJ5W10ge1xuXHRcdHJldHVybiB0aGlzLmRpc3BsYXlFbnRyaWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZHMsIHJldmVhbHMsIGFuZCBtb3ZlcyBrZXlib2FyZCBmb2N1cyB0byBhbiBhdXRvbWF0aW9uLlxuXHQgKi9cblx0Zm9jdXNBdXRvbWF0aW9uKGF1dG9tYXRpb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmRpc3BsYXlFbnRyaWVzLmZpbmRJbmRleChlbnRyeSA9PiBlbnRyeS5hdXRvbWF0aW9uLmlkID09PSBhdXRvbWF0aW9uSWQpO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5leHBhbmRlZFJvd3MuYWRkKGF1dG9tYXRpb25JZCk7XG5cdFx0dGhpcy51cGRhdGVMaXN0KHRoaXMuYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkpO1xuXHRcdHRoaXMubGlzdC5yZXZlYWwoaW5kZXgpO1xuXHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxpc3QubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFNjaGVkdWxlKGE6IElBdXRvbWF0aW9uKTogc3RyaW5nIHtcblx0c3dpdGNoIChhLnNjaGVkdWxlLmludGVydmFsKSB7XG5cdFx0Y2FzZSAnbWFudWFsJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2NoZWR1bGVNYW51YWwnLCBcIk1hbnVhbFwiKTtcblx0XHRjYXNlICdob3VybHknOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZUhvdXJseScsIFwiSG91cmx5XCIpO1xuXHRcdGNhc2UgJ2RhaWx5Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2NoZWR1bGVEYWlseScsIFwiRGFpbHkgYXQgezB9XCIsIGZvcm1hdEhvdXJNaW51dGUoYS5zY2hlZHVsZS5zY2hlZHVsZUhvdXIsIGEuc2NoZWR1bGUuc2NoZWR1bGVNaW51dGUpKTtcblx0XHRjYXNlICd3ZWVrbHknOiB7XG5cdFx0XHRjb25zdCBkYXkgPSBkYXlOYW1lKGEuc2NoZWR1bGUuc2NoZWR1bGVEYXkpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZVdlZWtseScsIFwiV2Vla2x5IG9uIHswfSBhdCB7MX1cIiwgZGF5LCBmb3JtYXRIb3VyTWludXRlKGEuc2NoZWR1bGUuc2NoZWR1bGVIb3VyLCBhLnNjaGVkdWxlLnNjaGVkdWxlTWludXRlKSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdEhvdXJNaW51dGUoaG91cjogbnVtYmVyLCBtaW51dGU6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpO1xuXHRkYXRlLnNldEhvdXJzKE1hdGgubWF4KDAsIE1hdGgubWluKDIzLCBob3VyIHwgMCkpLCBNYXRoLm1heCgwLCBNYXRoLm1pbig1OSwgbWludXRlIHwgMCkpLCAwLCAwKTtcblx0cmV0dXJuIGRhdGUudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xufVxuXG5mdW5jdGlvbiBkYXlOYW1lKGRheTogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgaWR4ID0gKChkYXkgJSA3KSArIDcpICUgNztcblx0cmV0dXJuIERBWVNfT0ZfV0VFS1tpZHhdO1xufVxuXG5mdW5jdGlvbiBmb3JtYXROZXh0UnVuKGE6IElBdXRvbWF0aW9uKTogc3RyaW5nIHtcblx0aWYgKCFhLmVuYWJsZWQgfHwgYS5zY2hlZHVsZS5pbnRlcnZhbCA9PT0gJ21hbnVhbCcgfHwgIWEubmV4dFJ1bkF0KSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCduZXh0UnVuTmV2ZXInLCBcIk5vIHNjaGVkdWxlZCBydW5cIik7XG5cdH1cblx0cmV0dXJuIGxvY2FsaXplKCduZXh0UnVuJywgXCJOZXh0IHJ1biB7MH1cIiwgZm9ybWF0UmVsYXRpdmVUaW1lT3JJc28oYS5uZXh0UnVuQXQpKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0UmVsYXRpdmVUaW1lT3JJc28oaXNvOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB0ID0gRGF0ZS5wYXJzZShpc28pO1xuXHRpZiAoTnVtYmVyLmlzTmFOKHQpKSB7XG5cdFx0cmV0dXJuIGlzbztcblx0fVxuXHRjb25zdCBkYXRlID0gbmV3IERhdGUodCk7XG5cdGNvbnN0IHJlbCA9IGZyb21Ob3coZGF0ZSwgdHJ1ZSk7XG5cdGNvbnN0IGFic29sdXRlID0gZGF0ZS50b0xvY2FsZVN0cmluZygpO1xuXHRyZXR1cm4gYCR7cmVsfSAoJHthYnNvbHV0ZX0pYDtcbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGUoczogc3RyaW5nLCBtYXg6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHNpbmdsZSA9IHMucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0aWYgKHNpbmdsZS5sZW5ndGggPD0gbWF4KSB7XG5cdFx0cmV0dXJuIHNpbmdsZTtcblx0fVxuXHRyZXR1cm4gc2luZ2xlLnNsaWNlKDAsIE1hdGgubWF4KDAsIG1heCAtIDEpKSArICdcXHUyMDI2Jztcbn1cblxuZnVuY3Rpb24gcnVuU3RhdHVzSWNvbihzdGF0dXM6IEF1dG9tYXRpb25SdW5TdGF0dXMpOiB7IGljb25JZDogc3RyaW5nOyBzcGluOiBib29sZWFuIH0ge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgJ3BlbmRpbmcnOiByZXR1cm4geyBpY29uSWQ6ICdjaXJjbGUtb3V0bGluZScsIHNwaW46IGZhbHNlIH07XG5cdFx0Y2FzZSAncnVubmluZyc6IHJldHVybiB7IGljb25JZDogJ3N5bmMnLCBzcGluOiB0cnVlIH07XG5cdFx0Y2FzZSAnY29tcGxldGVkJzogcmV0dXJuIHsgaWNvbklkOiAnY2hlY2snLCBzcGluOiBmYWxzZSB9O1xuXHRcdGNhc2UgJ2ZhaWxlZCc6IHJldHVybiB7IGljb25JZDogJ2Vycm9yJywgc3BpbjogZmFsc2UgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBydW5TdGF0dXNMYWJlbChzdGF0dXM6IEF1dG9tYXRpb25SdW5TdGF0dXMpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgJ3BlbmRpbmcnOiByZXR1cm4gbG9jYWxpemUoJ3J1blN0YXR1c1BlbmRpbmcnLCBcIlBlbmRpbmdcIik7XG5cdFx0Y2FzZSAncnVubmluZyc6IHJldHVybiBsb2NhbGl6ZSgncnVuU3RhdHVzUnVubmluZycsIFwiUnVubmluZ1wiKTtcblx0XHRjYXNlICdjb21wbGV0ZWQnOiByZXR1cm4gbG9jYWxpemUoJ3J1blN0YXR1c0NvbXBsZXRlZCcsIFwiQ29tcGxldGVkXCIpO1xuXHRcdGNhc2UgJ2ZhaWxlZCc6IHJldHVybiBsb2NhbGl6ZSgncnVuU3RhdHVzRmFpbGVkJywgXCJGYWlsZWRcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gcnVuVHJpZ2dlckxhYmVsKHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyKTogc3RyaW5nIHtcblx0c3dpdGNoICh0cmlnZ2VyKSB7XG5cdFx0Y2FzZSAnc2NoZWR1bGUnOiByZXR1cm4gbG9jYWxpemUoJ3J1blRyaWdnZXJTY2hlZHVsZScsIFwiU2NoZWR1bGVkXCIpO1xuXHRcdGNhc2UgJ21hbnVhbCc6IHJldHVybiBsb2NhbGl6ZSgncnVuVHJpZ2dlck1hbnVhbCcsIFwiTWFudWFsXCIpO1xuXHRcdGNhc2UgJ2NhdGNoX3VwJzogcmV0dXJuIGxvY2FsaXplKCdydW5UcmlnZ2VyQ2F0Y2hVcCcsIFwiQ2F0Y2gtdXBcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0UnVuRHVyYXRpb24ocnVuOiBJQXV0b21hdGlvblJ1bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghcnVuLmNvbXBsZXRlZEF0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGFydE1zID0gRGF0ZS5wYXJzZShydW4uc3RhcnRlZEF0KTtcblx0Y29uc3QgZW5kTXMgPSBEYXRlLnBhcnNlKHJ1bi5jb21wbGV0ZWRBdCk7XG5cdGlmIChOdW1iZXIuaXNOYU4oc3RhcnRNcykgfHwgTnVtYmVyLmlzTmFOKGVuZE1zKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZHVyYXRpb25NcyA9IE1hdGgubWF4KDAsIGVuZE1zIC0gc3RhcnRNcyk7XG5cdHJldHVybiBnZXREdXJhdGlvblN0cmluZyhkdXJhdGlvbk1zKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLHlCQUF5QjtBQUMz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
