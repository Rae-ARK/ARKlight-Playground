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
import "./media/checksWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { GitHubCheckConclusion, GitHubCheckStatus } from "../../github/common/types.js";
import { parseWorkflowRunId } from "../../github/browser/models/githubPullRequestCIModel.js";
import { CICheckGroup, getCheckGroup, getCheckStateLabel } from "./checksActions.js";
const $ = dom.$;
const _CICheckListDelegate = class _CICheckListDelegate {
  getHeight(_element) {
    return _CICheckListDelegate.ITEM_HEIGHT;
  }
  getTemplateId(_element) {
    return CICheckListRenderer.TEMPLATE_ID;
  }
};
_CICheckListDelegate.ITEM_HEIGHT = 28;
let CICheckListDelegate = _CICheckListDelegate;
const _CICheckListRenderer = class _CICheckListRenderer {
  constructor(_labels, _openerService, _getModel) {
    this._labels = _labels;
    this._openerService = _openerService;
    this._getModel = _getModel;
    this.templateId = _CICheckListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $(".ci-status-widget-check"));
    const labelContainer = dom.append(row, $(".ci-status-widget-check-label"));
    const label = templateDisposables.add(this._labels.create(labelContainer, { supportIcons: true }));
    const actionBarContainer = dom.append(row, $(".ci-status-widget-check-actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));
    return {
      row,
      label,
      actionBar,
      templateDisposables,
      elementDisposables: templateDisposables.add(new DisposableStore())
    };
  }
  renderElement(element, _index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
    templateData.row.className = `ci-status-widget-check ${getCheckStatusClass(element.check)}`;
    const title = localize("ci.checkTitle", "{0}: {1}", element.check.name, getCheckStateLabel(element.check));
    templateData.label.setResource({
      name: element.check.name,
      resource: URI.from({ scheme: "github-check", path: `/${element.check.id}/${element.check.name}` })
    }, {
      icon: getCheckIcon(element.check),
      title
    });
    const actions = [];
    if (element.group === CICheckGroup.Failed && parseWorkflowRunId(element.check.detailsUrl) !== void 0) {
      actions.push(templateData.elementDisposables.add(new Action(
        "ci.rerunCheck",
        localize("ci.rerunCheck", "Rerun Check"),
        ThemeIcon.asClassName(Codicon.debugRerun),
        true,
        async () => {
          await this._getModel()?.rerunFailedCheck(element.check);
        }
      )));
    }
    if (element.check.detailsUrl) {
      actions.push(templateData.elementDisposables.add(new Action(
        "ci.openOnGitHub",
        localize("ci.openOnGitHub", "Open on GitHub"),
        ThemeIcon.asClassName(Codicon.linkExternal),
        true,
        async () => {
          await this._openerService.open(URI.parse(element.check.detailsUrl));
        }
      )));
    }
    templateData.actionBar.push(actions, { icon: true, label: false });
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
_CICheckListRenderer.TEMPLATE_ID = "ciCheck";
let CICheckListRenderer = _CICheckListRenderer;
let CIStatusWidget = class extends Disposable {
  constructor(container, _openerService, _instantiationService) {
    super();
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidToggleCollapsed = this._register(new Emitter());
    this.onDidToggleCollapsed = this._onDidToggleCollapsed.event;
    this._checkCount = 0;
    this._collapsed = false;
    this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this._domNode = dom.append(container, $(".ci-status-widget"));
    this._domNode.style.display = "none";
    this._headerNode = dom.append(this._domNode, $(".ci-status-widget-header"));
    this._titleNode = dom.append(this._headerNode, $(".ci-status-widget-title"));
    this._titleLabelNode = dom.append(this._titleNode, $(".ci-status-widget-title-label"));
    this._titleLabelNode.textContent = localize("ci.checksLabel", "Checks");
    this._countsNode = dom.append(this._titleNode, $(".ci-status-widget-counts"));
    this._chevronNode = dom.append(this._headerNode, $(".group-chevron"));
    this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._headerNode.setAttribute("role", "button");
    this._headerNode.setAttribute("aria-label", localize("ci.toggleChecks", "Toggle Checks"));
    this._headerNode.setAttribute("aria-expanded", "true");
    this._headerNode.tabIndex = 0;
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.CLICK, () => {
      this._toggleCollapsed();
    }));
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === this._headerNode) {
        e.preventDefault();
        this._toggleCollapsed();
      }
    }));
    const bodyId = "ci-status-widget-body";
    this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
    this._bodyNode.id = bodyId;
    this._headerNode.setAttribute("aria-controls", bodyId);
    const listContainer = $(".ci-status-widget-list");
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "CIStatusWidget",
      listContainer,
      new CICheckListDelegate(),
      [new CICheckListRenderer(this._labels, this._openerService, () => this._model)],
      {
        multipleSelectionSupport: false,
        openOnSingleClick: false,
        accessibilityProvider: {
          getWidgetAriaLabel: () => localize("ci.checksListAriaLabel", "Checks"),
          getAriaLabel: (item) => localize("ci.checkAriaLabel", "{0}, {1}", item.check.name, getCheckStateLabel(item.check))
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => item.check.name
        }
      }
    ));
    this._bodyNode.appendChild(listContainer);
  }
  get element() {
    return this._domNode;
  }
  /** The full content height the widget would like (header + all checks). */
  get desiredHeight() {
    if (this._checkCount === 0) {
      return 0;
    }
    if (this._collapsed) {
      return CIStatusWidget.HEADER_HEIGHT;
    }
    return CIStatusWidget.HEADER_HEIGHT + this._checkCount * CICheckListDelegate.ITEM_HEIGHT;
  }
  /** Whether the widget is currently visible (has checks to show). */
  get visible() {
    return this._checkCount > 0;
  }
  /** Whether the body is collapsed (header-only). */
  get collapsed() {
    return this._collapsed;
  }
  setInput(input) {
    return autorun((reader) => {
      this._model = input.checksObs.read(reader);
      if (!this._model) {
        this._checkCount = 0;
        this._setCollapsed(false);
        this._renderBody([]);
        this._domNode.style.display = "none";
        this._onDidChangeHeight.fire();
        return;
      }
      const checks = this._model.checks.read(reader);
      if (checks.length === 0) {
        this._checkCount = 0;
        this._setCollapsed(false);
        this._renderBody([]);
        this._domNode.style.display = "none";
        this._onDidChangeHeight.fire();
        return;
      }
      const sorted = sortChecks(checks);
      const oldCount = this._checkCount;
      this._checkCount = sorted.length;
      this._domNode.style.display = "";
      this._renderHeader(checks);
      this._renderBody(sorted);
      if (this._checkCount !== oldCount) {
        this._onDidChangeHeight.fire();
      }
    });
  }
  _renderHeader(checks) {
    const counts = getCheckCounts(checks);
    dom.clearNode(this._countsNode);
    if (counts.running > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-running"));
      badge.appendChild(renderIcon(Codicon.circleFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.running}`;
    }
    if (counts.failed > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-failure"));
      badge.appendChild(renderIcon(Codicon.errorCompact));
      dom.append(badge, $("span")).textContent = `${counts.failed}`;
    }
    if (counts.pending > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-pending"));
      badge.appendChild(renderIcon(Codicon.circleFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.pending}`;
    }
    if (counts.successful > 0) {
      const badge = dom.append(this._countsNode, $(".ci-status-widget-count-badge.ci-status-success"));
      badge.appendChild(renderIcon(Codicon.passFilledCompact));
      dom.append(badge, $("span")).textContent = `${counts.successful}`;
    }
  }
  /**
   * Layout the widget body list to the given height.
   * Called by the parent view after computing available space.
   */
  layout(height) {
    if (this._collapsed) {
      this._bodyNode.style.display = "none";
      return;
    }
    this._bodyNode.style.display = "";
    this._list.layout(height);
  }
  _toggleCollapsed() {
    this._setCollapsed(!this._collapsed);
    this._onDidToggleCollapsed.fire(this._collapsed);
    this._onDidChangeHeight.fire();
  }
  /**
   * Expand the body if it is currently collapsed, notifying listeners so the
   * parent pane restores its size. No-op when already expanded.
   */
  expand() {
    if (!this._collapsed) {
      return;
    }
    this._setCollapsed(false);
    this._onDidToggleCollapsed.fire(false);
    this._onDidChangeHeight.fire();
  }
  /**
   * Move keyboard focus into the checks list. Falls back to the header when
   * the body is collapsed or there is nothing to focus.
   */
  focus() {
    if (this._collapsed || this._checkCount === 0) {
      this._headerNode.focus();
      return;
    }
    this._list.domFocus();
    if (this._list.length > 0 && this._list.getFocus().length === 0) {
      this._list.setFocus([0]);
    }
  }
  _setCollapsed(collapsed) {
    this._collapsed = collapsed;
    this._updateChevron();
    this._headerNode.classList.toggle("collapsed", collapsed);
    this._headerNode.setAttribute("aria-expanded", String(!collapsed));
  }
  _updateChevron() {
    this._chevronNode.className = "group-chevron";
    this._chevronNode.classList.add(
      ...ThemeIcon.asClassNameArray(
        this._collapsed ? Codicon.chevronRight : Codicon.chevronDown
      )
    );
  }
  _renderBody(checks) {
    this._list.splice(0, this._list.length, checks);
  }
};
CIStatusWidget.HEADER_HEIGHT = 32;
// total header height in px (5px section margin + 6px header margin + 28px header)
CIStatusWidget.MIN_BODY_HEIGHT = 3 * CICheckListDelegate.ITEM_HEIGHT + 2;
// at least 3 checks (3 * 28) + 2px
CIStatusWidget.PREFERRED_BODY_HEIGHT = 112;
// preferred 4 checks (4 * 28)
CIStatusWidget.MAX_BODY_HEIGHT = 240;
CIStatusWidget = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IInstantiationService)
], CIStatusWidget);
function sortChecks(checks) {
  return [...checks].sort(compareChecks).map((check) => ({ check, group: getCheckGroup(check) }));
}
function compareChecks(a, b) {
  const groupDiff = getCheckGroup(a) - getCheckGroup(b);
  if (groupDiff !== 0) {
    return groupDiff;
  }
  return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
}
function getCheckCounts(checks) {
  let running = 0;
  let pending = 0;
  let failed = 0;
  let successful = 0;
  for (const check of checks) {
    switch (getCheckGroup(check)) {
      case CICheckGroup.Running:
        running++;
        break;
      case CICheckGroup.Pending:
        pending++;
        break;
      case CICheckGroup.Failed:
        failed++;
        break;
      case CICheckGroup.Successful:
        successful++;
        break;
    }
  }
  return { running, pending, failed, successful };
}
function getCheckIcon(check) {
  switch (check.status) {
    case GitHubCheckStatus.InProgress:
      return Codicon.syncCompact;
    case GitHubCheckStatus.Queued:
      return Codicon.circleFilledCompact;
    case GitHubCheckStatus.Completed:
      switch (check.conclusion) {
        case GitHubCheckConclusion.Success:
          return Codicon.passFilledCompact;
        case GitHubCheckConclusion.Failure:
        case GitHubCheckConclusion.TimedOut:
        case GitHubCheckConclusion.ActionRequired:
          return Codicon.errorCompact;
        case GitHubCheckConclusion.Cancelled:
          return Codicon.circleSlashCompact;
        case GitHubCheckConclusion.Skipped:
          return Codicon.debugStepOver;
        default:
          return Codicon.circleFilledCompact;
      }
    default:
      return Codicon.circleFilledCompact;
  }
}
function getCheckStatusClass(check) {
  switch (getCheckGroup(check)) {
    case CICheckGroup.Running:
      return "ci-status-running";
    case CICheckGroup.Pending:
      return "ci-status-pending";
    case CICheckGroup.Failed:
      return "ci-status-failure";
    case CICheckGroup.Successful:
      return "ci-status-success";
  }
}
export {
  CIStatusWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoZWNrc1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGVja3NXaWRnZXQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgR2l0SHViQ2hlY2tDb25jbHVzaW9uLCBHaXRIdWJDaGVja1N0YXR1cywgSUdpdEh1YkNJQ2hlY2sgfSBmcm9tICcuLi8uLi9naXRodWIvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCwgcGFyc2VXb3JrZmxvd1J1bklkIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG5pbXBvcnQgeyBDSUNoZWNrR3JvdXAsIGdldENoZWNrR3JvdXAsIGdldENoZWNrU3RhdGVMYWJlbCB9IGZyb20gJy4vY2hlY2tzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGVja3NWaWV3TW9kZWwgfSBmcm9tICcuL2NoZWNrc1ZpZXdNb2RlbC5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuaW50ZXJmYWNlIElDSUNoZWNrTGlzdEl0ZW0ge1xuXHRyZWFkb25seSBjaGVjazogSUdpdEh1YkNJQ2hlY2s7XG5cdHJlYWRvbmx5IGdyb3VwOiBDSUNoZWNrR3JvdXA7XG59XG5cbmludGVyZmFjZSBJQ0lDaGVja0NvdW50cyB7XG5cdHJlYWRvbmx5IHJ1bm5pbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgcGVuZGluZzogbnVtYmVyO1xuXHRyZWFkb25seSBmYWlsZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgc3VjY2Vzc2Z1bDogbnVtYmVyO1xufVxuXG5jbGFzcyBDSUNoZWNrTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUNJQ2hlY2tMaXN0SXRlbT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSAyODtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IElDSUNoZWNrTGlzdEl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiBDSUNoZWNrTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChfZWxlbWVudDogSUNJQ2hlY2tMaXN0SXRlbSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIENJQ2hlY2tMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDSUNoZWNrVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgcm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQ0lDaGVja0xpc3RSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUNJQ2hlY2tMaXN0SXRlbSwgSUNJQ2hlY2tUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NpQ2hlY2snO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gQ0lDaGVja0xpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldE1vZGVsOiAoKSA9PiBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDSUNoZWNrVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jaGVjaycpKTtcblxuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3csICQoJy5jaS1zdGF0dXMtd2lkZ2V0LWNoZWNrLWxhYmVsJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fbGFiZWxzLmNyZWF0ZShsYWJlbENvbnRhaW5lciwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3csICQoJy5jaS1zdGF0dXMtd2lkZ2V0LWNoZWNrLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25CYXJDb250YWluZXIpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyb3csXG5cdFx0XHRsYWJlbCxcblx0XHRcdGFjdGlvbkJhcixcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSksXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUNJQ2hlY2tMaXN0SXRlbSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNJQ2hlY2tUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnJvdy5jbGFzc05hbWUgPSBgY2ktc3RhdHVzLXdpZGdldC1jaGVjayAke2dldENoZWNrU3RhdHVzQ2xhc3MoZWxlbWVudC5jaGVjayl9YDtcblxuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUoJ2NpLmNoZWNrVGl0bGUnLCBcInswfTogezF9XCIsIGVsZW1lbnQuY2hlY2submFtZSwgZ2V0Q2hlY2tTdGF0ZUxhYmVsKGVsZW1lbnQuY2hlY2spKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0bmFtZTogZWxlbWVudC5jaGVjay5uYW1lLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAnZ2l0aHViLWNoZWNrJywgcGF0aDogYC8ke2VsZW1lbnQuY2hlY2suaWR9LyR7ZWxlbWVudC5jaGVjay5uYW1lfWAgfSksXG5cdFx0fSwge1xuXHRcdFx0aWNvbjogZ2V0Q2hlY2tJY29uKGVsZW1lbnQuY2hlY2spLFxuXHRcdFx0dGl0bGUsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBBY3Rpb25bXSA9IFtdO1xuXG5cdFx0aWYgKGVsZW1lbnQuZ3JvdXAgPT09IENJQ2hlY2tHcm91cC5GYWlsZWQgJiYgcGFyc2VXb3JrZmxvd1J1bklkKGVsZW1lbnQuY2hlY2suZGV0YWlsc1VybCkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdjaS5yZXJ1bkNoZWNrJyxcblx0XHRcdFx0bG9jYWxpemUoJ2NpLnJlcnVuQ2hlY2snLCBcIlJlcnVuIENoZWNrXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z1JlcnVuKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2dldE1vZGVsKCk/LnJlcnVuRmFpbGVkQ2hlY2soZWxlbWVudC5jaGVjayk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuY2hlY2suZGV0YWlsc1VybCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdjaS5vcGVuT25HaXRIdWInLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2kub3Blbk9uR2l0SHViJywgXCJPcGVuIG9uIEdpdEh1YlwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ubGlua0V4dGVybmFsKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoZWxlbWVudC5jaGVjay5kZXRhaWxzVXJsISkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0KSkpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9lbGVtZW50OiBJQ0lDaGVja0xpc3RJdGVtLCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ0lDaGVja1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQ0lDaGVja1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEEgd2lkZ2V0IHRoYXQgc2hvd3MgdGhlIENJIHN0YXR1cyBvZiBhIFBSLlxuICogUmVuZGVyZWQgYmVuZWF0aCB0aGUgY2hhbmdlcyB0cmVlIGluIHRoZSBjaGFuZ2VzIHZpZXcgYXMgYSBTcGxpdFZpZXcgcGFuZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENJU3RhdHVzV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IEhFQURFUl9IRUlHSFQgPSAzMjsgLy8gdG90YWwgaGVhZGVyIGhlaWdodCBpbiBweCAoNXB4IHNlY3Rpb24gbWFyZ2luICsgNnB4IGhlYWRlciBtYXJnaW4gKyAyOHB4IGhlYWRlcilcblx0c3RhdGljIHJlYWRvbmx5IE1JTl9CT0RZX0hFSUdIVCA9IDMgKiBDSUNoZWNrTGlzdERlbGVnYXRlLklURU1fSEVJR0hUICsgMjsgLy8gYXQgbGVhc3QgMyBjaGVja3MgKDMgKiAyOCkgKyAycHhcblx0c3RhdGljIHJlYWRvbmx5IFBSRUZFUlJFRF9CT0RZX0hFSUdIVCA9IDExMjsgLy8gcHJlZmVycmVkIDQgY2hlY2tzICg0ICogMjgpXG5cdHN0YXRpYyByZWFkb25seSBNQVhfQk9EWV9IRUlHSFQgPSAyNDA7IC8vIGF0IG1vc3QgfjggY2hlY2tzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hlYWRlck5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZUxhYmVsTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvdW50c05vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ib2R5Tm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3Q6IFdvcmtiZW5jaExpc3Q8SUNJQ2hlY2tMaXN0SXRlbT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRvZ2dsZUNvbGxhcHNlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZUNvbGxhcHNlZCA9IHRoaXMuX29uRGlkVG9nZ2xlQ29sbGFwc2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgX2NoZWNrQ291bnQgPSAwO1xuXHRwcml2YXRlIF9jb2xsYXBzZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbW9kZWw6IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hldnJvbk5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdC8qKiBUaGUgZnVsbCBjb250ZW50IGhlaWdodCB0aGUgd2lkZ2V0IHdvdWxkIGxpa2UgKGhlYWRlciArIGFsbCBjaGVja3MpLiAqL1xuXHRnZXQgZGVzaXJlZEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9jaGVja0NvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiBDSVN0YXR1c1dpZGdldC5IRUFERVJfSEVJR0hUICsgdGhpcy5fY2hlY2tDb3VudCAqIENJQ2hlY2tMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgd2lkZ2V0IGlzIGN1cnJlbnRseSB2aXNpYmxlIChoYXMgY2hlY2tzIHRvIHNob3cpLiAqL1xuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hlY2tDb3VudCA+IDA7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgYm9keSBpcyBjb2xsYXBzZWQgKGhlYWRlci1vbmx5KS4gKi9cblx0Z2V0IGNvbGxhcHNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29sbGFwc2VkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNpLXN0YXR1cy13aWRnZXQnKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Ly8gSGVhZGVyIChhbHdheXMgdmlzaWJsZSwgY2xpY2sgdG8gY29sbGFwc2UvZXhwYW5kKVxuXHRcdHRoaXMuX2hlYWRlck5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJy5jaS1zdGF0dXMtd2lkZ2V0LWhlYWRlcicpKTtcblx0XHR0aGlzLl90aXRsZU5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlck5vZGUsICQoJy5jaS1zdGF0dXMtd2lkZ2V0LXRpdGxlJykpO1xuXHRcdHRoaXMuX3RpdGxlTGFiZWxOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl90aXRsZU5vZGUsICQoJy5jaS1zdGF0dXMtd2lkZ2V0LXRpdGxlLWxhYmVsJykpO1xuXHRcdHRoaXMuX3RpdGxlTGFiZWxOb2RlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NpLmNoZWNrc0xhYmVsJywgXCJDaGVja3NcIik7XG5cdFx0dGhpcy5fY291bnRzTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5fdGl0bGVOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jb3VudHMnKSk7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlck5vZGUsICQoJy5ncm91cC1jaGV2cm9uJykpO1xuXHRcdHRoaXMuX2NoZXZyb25Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2kudG9nZ2xlQ2hlY2tzJywgXCJUb2dnbGUgQ2hlY2tzXCIpKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS50YWJJbmRleCA9IDA7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hlYWRlck5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX3RvZ2dsZUNvbGxhcHNlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hlYWRlck5vZGUsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSAmJiBlLnRhcmdldCA9PT0gdGhpcy5faGVhZGVyTm9kZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZUNvbGxhcHNlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJvZHkgKGxpc3Qgb2YgY2hlY2tzKVxuXHRcdGNvbnN0IGJvZHlJZCA9ICdjaS1zdGF0dXMtd2lkZ2V0LWJvZHknO1xuXHRcdHRoaXMuX2JvZHlOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKGAuJHtib2R5SWR9YCkpO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmlkID0gYm9keUlkO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgYm9keUlkKTtcblxuXHRcdGNvbnN0IGxpc3RDb250YWluZXIgPSAkKCcuY2ktc3RhdHVzLXdpZGdldC1saXN0Jyk7XG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJQ0lDaGVja0xpc3RJdGVtPixcblx0XHRcdCdDSVN0YXR1c1dpZGdldCcsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0bmV3IENJQ2hlY2tMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFtuZXcgQ0lDaGVja0xpc3RSZW5kZXJlcih0aGlzLl9sYWJlbHMsIHRoaXMuX29wZW5lclNlcnZpY2UsICgpID0+IHRoaXMuX21vZGVsKV0sXG5cdFx0XHR7XG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnY2kuY2hlY2tzTGlzdEFyaWFMYWJlbCcsIFwiQ2hlY2tzXCIpLFxuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogaXRlbSA9PiBsb2NhbGl6ZSgnY2kuY2hlY2tBcmlhTGFiZWwnLCBcInswfSwgezF9XCIsIGl0ZW0uY2hlY2submFtZSwgZ2V0Q2hlY2tTdGF0ZUxhYmVsKGl0ZW0uY2hlY2spKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiBpdGVtID0+IGl0ZW0uY2hlY2submFtZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fYm9keU5vZGUuYXBwZW5kQ2hpbGQobGlzdENvbnRhaW5lcik7XG5cdH1cblxuXHRzZXRJbnB1dChpbnB1dDogQ2hlY2tzVmlld01vZGVsKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IGlucHV0LmNoZWNrc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghdGhpcy5fbW9kZWwpIHtcblx0XHRcdFx0dGhpcy5fY2hlY2tDb3VudCA9IDA7XG5cdFx0XHRcdHRoaXMuX3NldENvbGxhcHNlZChmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckJvZHkoW10pO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGVja3MgPSB0aGlzLl9tb2RlbC5jaGVja3MucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoY2hlY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9jaGVja0NvdW50ID0gMDtcblx0XHRcdFx0dGhpcy5fc2V0Q29sbGFwc2VkKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQm9keShbXSk7XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNvcnRlZCA9IHNvcnRDaGVja3MoY2hlY2tzKTtcblx0XHRcdGNvbnN0IG9sZENvdW50ID0gdGhpcy5fY2hlY2tDb3VudDtcblx0XHRcdHRoaXMuX2NoZWNrQ291bnQgPSBzb3J0ZWQubGVuZ3RoO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX3JlbmRlckhlYWRlcihjaGVja3MpO1xuXHRcdFx0dGhpcy5fcmVuZGVyQm9keShzb3J0ZWQpO1xuXG5cdFx0XHRpZiAodGhpcy5fY2hlY2tDb3VudCAhPT0gb2xkQ291bnQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySGVhZGVyKGNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50cyA9IGdldENoZWNrQ291bnRzKGNoZWNrcyk7XG5cblx0XHQvLyBVcGRhdGUgY291bnQgYmFkZ2VzXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9jb3VudHNOb2RlKTtcblxuXHRcdGlmIChjb3VudHMucnVubmluZyA+IDApIHtcblx0XHRcdGNvbnN0IGJhZGdlID0gZG9tLmFwcGVuZCh0aGlzLl9jb3VudHNOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jb3VudC1iYWRnZS5jaS1zdGF0dXMtcnVubmluZycpKTtcblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWRDb21wYWN0KSk7XG5cdFx0XHRkb20uYXBwZW5kKGJhZGdlLCAkKCdzcGFuJykpLnRleHRDb250ZW50ID0gYCR7Y291bnRzLnJ1bm5pbmd9YDtcblx0XHR9XG5cblx0XHRpZiAoY291bnRzLmZhaWxlZCA+IDApIHtcblx0XHRcdGNvbnN0IGJhZGdlID0gZG9tLmFwcGVuZCh0aGlzLl9jb3VudHNOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jb3VudC1iYWRnZS5jaS1zdGF0dXMtZmFpbHVyZScpKTtcblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5lcnJvckNvbXBhY3QpKTtcblx0XHRcdGRvbS5hcHBlbmQoYmFkZ2UsICQoJ3NwYW4nKSkudGV4dENvbnRlbnQgPSBgJHtjb3VudHMuZmFpbGVkfWA7XG5cdFx0fVxuXG5cdFx0aWYgKGNvdW50cy5wZW5kaW5nID4gMCkge1xuXHRcdFx0Y29uc3QgYmFkZ2UgPSBkb20uYXBwZW5kKHRoaXMuX2NvdW50c05vZGUsICQoJy5jaS1zdGF0dXMtd2lkZ2V0LWNvdW50LWJhZGdlLmNpLXN0YXR1cy1wZW5kaW5nJykpO1xuXHRcdFx0YmFkZ2UuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZENvbXBhY3QpKTtcblx0XHRcdGRvbS5hcHBlbmQoYmFkZ2UsICQoJ3NwYW4nKSkudGV4dENvbnRlbnQgPSBgJHtjb3VudHMucGVuZGluZ31gO1xuXHRcdH1cblxuXHRcdGlmIChjb3VudHMuc3VjY2Vzc2Z1bCA+IDApIHtcblx0XHRcdGNvbnN0IGJhZGdlID0gZG9tLmFwcGVuZCh0aGlzLl9jb3VudHNOb2RlLCAkKCcuY2ktc3RhdHVzLXdpZGdldC1jb3VudC1iYWRnZS5jaS1zdGF0dXMtc3VjY2VzcycpKTtcblx0XHRcdGJhZGdlLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5wYXNzRmlsbGVkQ29tcGFjdCkpO1xuXHRcdFx0ZG9tLmFwcGVuZChiYWRnZSwgJCgnc3BhbicpKS50ZXh0Q29udGVudCA9IGAke2NvdW50cy5zdWNjZXNzZnVsfWA7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIExheW91dCB0aGUgd2lkZ2V0IGJvZHkgbGlzdCB0byB0aGUgZ2l2ZW4gaGVpZ2h0LlxuXHQgKiBDYWxsZWQgYnkgdGhlIHBhcmVudCB2aWV3IGFmdGVyIGNvbXB1dGluZyBhdmFpbGFibGUgc3BhY2UuXG5cdCAqL1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9ib2R5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ib2R5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fbGlzdC5sYXlvdXQoaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZUNvbGxhcHNlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRDb2xsYXBzZWQoIXRoaXMuX2NvbGxhcHNlZCk7XG5cdFx0dGhpcy5fb25EaWRUb2dnbGVDb2xsYXBzZWQuZmlyZSh0aGlzLl9jb2xsYXBzZWQpO1xuXHRcdC8vIEFsc28gZmlyZXMgb25EaWRDaGFuZ2VIZWlnaHQgc28gdGhlIFNwbGl0VmlldyBwYW5lIHVwZGF0ZXMgaXRzIG1pbi9tYXggY29uc3RyYWludHNcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kIHRoZSBib2R5IGlmIGl0IGlzIGN1cnJlbnRseSBjb2xsYXBzZWQsIG5vdGlmeWluZyBsaXN0ZW5lcnMgc28gdGhlXG5cdCAqIHBhcmVudCBwYW5lIHJlc3RvcmVzIGl0cyBzaXplLiBOby1vcCB3aGVuIGFscmVhZHkgZXhwYW5kZWQuXG5cdCAqL1xuXHRleHBhbmQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Q29sbGFwc2VkKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZFRvZ2dsZUNvbGxhcHNlZC5maXJlKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZSBrZXlib2FyZCBmb2N1cyBpbnRvIHRoZSBjaGVja3MgbGlzdC4gRmFsbHMgYmFjayB0byB0aGUgaGVhZGVyIHdoZW5cblx0ICogdGhlIGJvZHkgaXMgY29sbGFwc2VkIG9yIHRoZXJlIGlzIG5vdGhpbmcgdG8gZm9jdXMuXG5cdCAqL1xuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VkIHx8IHRoaXMuX2NoZWNrQ291bnQgPT09IDApIHtcblx0XHRcdHRoaXMuX2hlYWRlck5vZGUuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdGlmICh0aGlzLl9saXN0Lmxlbmd0aCA+IDAgJiYgdGhpcy5fbGlzdC5nZXRGb2N1cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldENvbGxhcHNlZChjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb2xsYXBzZWQgPSBjb2xsYXBzZWQ7XG5cdFx0dGhpcy5fdXBkYXRlQ2hldnJvbigpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgY29sbGFwc2VkKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghY29sbGFwc2VkKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDaGV2cm9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoZXZyb25Ob2RlLmNsYXNzTmFtZSA9ICdncm91cC1jaGV2cm9uJztcblx0XHR0aGlzLl9jaGV2cm9uTm9kZS5jbGFzc0xpc3QuYWRkKFxuXHRcdFx0Li4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoXG5cdFx0XHRcdHRoaXMuX2NvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93blxuXHRcdFx0KVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJCb2R5KGNoZWNrczogcmVhZG9ubHkgSUNJQ2hlY2tMaXN0SXRlbVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgsIGNoZWNrcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc29ydENoZWNrcyhjaGVja3M6IHJlYWRvbmx5IElHaXRIdWJDSUNoZWNrW10pOiBJQ0lDaGVja0xpc3RJdGVtW10ge1xuXHRyZXR1cm4gWy4uLmNoZWNrc11cblx0XHQuc29ydChjb21wYXJlQ2hlY2tzKVxuXHRcdC5tYXAoY2hlY2sgPT4gKHsgY2hlY2ssIGdyb3VwOiBnZXRDaGVja0dyb3VwKGNoZWNrKSB9KSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVDaGVja3MoYTogSUdpdEh1YkNJQ2hlY2ssIGI6IElHaXRIdWJDSUNoZWNrKTogbnVtYmVyIHtcblx0Y29uc3QgZ3JvdXBEaWZmID0gZ2V0Q2hlY2tHcm91cChhKSAtIGdldENoZWNrR3JvdXAoYik7XG5cdGlmIChncm91cERpZmYgIT09IDApIHtcblx0XHRyZXR1cm4gZ3JvdXBEaWZmO1xuXHR9XG5cblx0cmV0dXJuIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgdW5kZWZpbmVkLCB7IHNlbnNpdGl2aXR5OiAnYmFzZScgfSk7XG59XG5cbmZ1bmN0aW9uIGdldENoZWNrQ291bnRzKGNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSk6IElDSUNoZWNrQ291bnRzIHtcblx0bGV0IHJ1bm5pbmcgPSAwO1xuXHRsZXQgcGVuZGluZyA9IDA7XG5cdGxldCBmYWlsZWQgPSAwO1xuXHRsZXQgc3VjY2Vzc2Z1bCA9IDA7XG5cblx0Zm9yIChjb25zdCBjaGVjayBvZiBjaGVja3MpIHtcblx0XHRzd2l0Y2ggKGdldENoZWNrR3JvdXAoY2hlY2spKSB7XG5cdFx0XHRjYXNlIENJQ2hlY2tHcm91cC5SdW5uaW5nOlxuXHRcdFx0XHRydW5uaW5nKys7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDSUNoZWNrR3JvdXAuUGVuZGluZzpcblx0XHRcdFx0cGVuZGluZysrO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ0lDaGVja0dyb3VwLkZhaWxlZDpcblx0XHRcdFx0ZmFpbGVkKys7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDSUNoZWNrR3JvdXAuU3VjY2Vzc2Z1bDpcblx0XHRcdFx0c3VjY2Vzc2Z1bCsrO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBydW5uaW5nLCBwZW5kaW5nLCBmYWlsZWQsIHN1Y2Nlc3NmdWwgfTtcbn1cblxuZnVuY3Rpb24gZ2V0Q2hlY2tJY29uKGNoZWNrOiBJR2l0SHViQ0lDaGVjayk6IFRoZW1lSWNvbiB7XG5cdHN3aXRjaCAoY2hlY2suc3RhdHVzKSB7XG5cdFx0Y2FzZSBHaXRIdWJDaGVja1N0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0cmV0dXJuIENvZGljb24uc3luY0NvbXBhY3Q7XG5cdFx0Y2FzZSBHaXRIdWJDaGVja1N0YXR1cy5RdWV1ZWQ6XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5jaXJjbGVGaWxsZWRDb21wYWN0O1xuXHRcdGNhc2UgR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkOlxuXHRcdFx0c3dpdGNoIChjaGVjay5jb25jbHVzaW9uKSB7XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3M6XG5cdFx0XHRcdFx0cmV0dXJuIENvZGljb24ucGFzc0ZpbGxlZENvbXBhY3Q7XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLkZhaWx1cmU6XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLlRpbWVkT3V0OlxuXHRcdFx0XHRjYXNlIEdpdEh1YkNoZWNrQ29uY2x1c2lvbi5BY3Rpb25SZXF1aXJlZDpcblx0XHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5lcnJvckNvbXBhY3Q7XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLkNhbmNlbGxlZDpcblx0XHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5jaXJjbGVTbGFzaENvbXBhY3Q7XG5cdFx0XHRcdGNhc2UgR2l0SHViQ2hlY2tDb25jbHVzaW9uLlNraXBwZWQ6XG5cdFx0XHRcdFx0cmV0dXJuIENvZGljb24uZGVidWdTdGVwT3Zlcjtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gQ29kaWNvbi5jaXJjbGVGaWxsZWRDb21wYWN0O1xuXHRcdFx0fVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5jaXJjbGVGaWxsZWRDb21wYWN0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldENoZWNrU3RhdHVzQ2xhc3MoY2hlY2s6IElHaXRIdWJDSUNoZWNrKTogc3RyaW5nIHtcblx0c3dpdGNoIChnZXRDaGVja0dyb3VwKGNoZWNrKSkge1xuXHRcdGNhc2UgQ0lDaGVja0dyb3VwLlJ1bm5pbmc6XG5cdFx0XHRyZXR1cm4gJ2NpLXN0YXR1cy1ydW5uaW5nJztcblx0XHRjYXNlIENJQ2hlY2tHcm91cC5QZW5kaW5nOlxuXHRcdFx0cmV0dXJuICdjaS1zdGF0dXMtcGVuZGluZyc7XG5cdFx0Y2FzZSBDSUNoZWNrR3JvdXAuRmFpbGVkOlxuXHRcdFx0cmV0dXJuICdjaS1zdGF0dXMtZmFpbHVyZSc7XG5cdFx0Y2FzZSBDSUNoZWNrR3JvdXAuU3VjY2Vzc2Z1bDpcblx0XHRcdHJldHVybiAnY2ktc3RhdHVzLXN1Y2Nlc3MnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBDLHNCQUFzQjtBQUN6RSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1Qix5QkFBeUM7QUFDekUsU0FBbUMsMEJBQTBCO0FBQzdELFNBQVMsY0FBYyxlQUFlLDBCQUEwQjtBQUdoRSxNQUFNLElBQUksSUFBSTtBQWNkLE1BQU0sdUJBQU4sTUFBTSxxQkFBc0U7QUFBQSxFQUczRSxVQUFVLFVBQW9DO0FBQzdDLFdBQU8scUJBQW9CO0FBQUEsRUFDNUI7QUFBQSxFQUVBLGNBQWMsVUFBb0M7QUFDakQsV0FBTyxvQkFBb0I7QUFBQSxFQUM1QjtBQUNEO0FBVk0scUJBQ1csY0FBYztBQUQvQixJQUFNLHNCQUFOO0FBb0JBLE1BQU0sdUJBQU4sTUFBTSxxQkFBcUY7QUFBQSxFQUkxRixZQUNrQixTQUNBLGdCQUNBLFdBQ2hCO0FBSGdCO0FBQ0E7QUFDQTtBQUxsQixTQUFTLGFBQWEscUJBQW9CO0FBQUEsRUFNdEM7QUFBQSxFQUVKLGVBQWUsV0FBOEM7QUFDNUQsVUFBTSxzQkFBc0IsSUFBSSxnQkFBZ0I7QUFDaEQsVUFBTSxNQUFNLElBQUksT0FBTyxXQUFXLEVBQUUseUJBQXlCLENBQUM7QUFFOUQsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssRUFBRSwrQkFBK0IsQ0FBQztBQUN6RSxVQUFNLFFBQVEsb0JBQW9CLElBQUksS0FBSyxRQUFRLE9BQU8sZ0JBQWdCLEVBQUUsY0FBYyxLQUFLLENBQUMsQ0FBQztBQUVqRyxVQUFNLHFCQUFxQixJQUFJLE9BQU8sS0FBSyxFQUFFLGlDQUFpQyxDQUFDO0FBQy9FLFVBQU0sWUFBWSxvQkFBb0IsSUFBSSxJQUFJLFVBQVUsa0JBQWtCLENBQUM7QUFFM0UsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLG9CQUFvQixvQkFBb0IsSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLFNBQTJCLFFBQWdCLGNBQTBDO0FBQ2xHLGlCQUFhLG1CQUFtQixNQUFNO0FBQ3RDLGlCQUFhLFVBQVUsTUFBTTtBQUU3QixpQkFBYSxJQUFJLFlBQVksMEJBQTBCLG9CQUFvQixRQUFRLEtBQUssQ0FBQztBQUV6RixVQUFNLFFBQVEsU0FBUyxpQkFBaUIsWUFBWSxRQUFRLE1BQU0sTUFBTSxtQkFBbUIsUUFBUSxLQUFLLENBQUM7QUFDekcsaUJBQWEsTUFBTSxZQUFZO0FBQUEsTUFDOUIsTUFBTSxRQUFRLE1BQU07QUFBQSxNQUNwQixVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsZ0JBQWdCLE1BQU0sSUFBSSxRQUFRLE1BQU0sRUFBRSxJQUFJLFFBQVEsTUFBTSxJQUFJLEdBQUcsQ0FBQztBQUFBLElBQ2xHLEdBQUc7QUFBQSxNQUNGLE1BQU0sYUFBYSxRQUFRLEtBQUs7QUFBQSxNQUNoQztBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sVUFBb0IsQ0FBQztBQUUzQixRQUFJLFFBQVEsVUFBVSxhQUFhLFVBQVUsbUJBQW1CLFFBQVEsTUFBTSxVQUFVLE1BQU0sUUFBVztBQUN4RyxjQUFRLEtBQUssYUFBYSxtQkFBbUIsSUFBSSxJQUFJO0FBQUEsUUFDcEQ7QUFBQSxRQUNBLFNBQVMsaUJBQWlCLGFBQWE7QUFBQSxRQUN2QyxVQUFVLFlBQVksUUFBUSxVQUFVO0FBQUEsUUFDeEM7QUFBQSxRQUNBLFlBQVk7QUFDWCxnQkFBTSxLQUFLLFVBQVUsR0FBRyxpQkFBaUIsUUFBUSxLQUFLO0FBQUEsUUFDdkQ7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxRQUFJLFFBQVEsTUFBTSxZQUFZO0FBQzdCLGNBQVEsS0FBSyxhQUFhLG1CQUFtQixJQUFJLElBQUk7QUFBQSxRQUNwRDtBQUFBLFFBQ0EsU0FBUyxtQkFBbUIsZ0JBQWdCO0FBQUEsUUFDNUMsVUFBVSxZQUFZLFFBQVEsWUFBWTtBQUFBLFFBQzFDO0FBQUEsUUFDQSxZQUFZO0FBQ1gsZ0JBQU0sS0FBSyxlQUFlLEtBQUssSUFBSSxNQUFNLFFBQVEsTUFBTSxVQUFXLENBQUM7QUFBQSxRQUNwRTtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLGlCQUFhLFVBQVUsS0FBSyxTQUFTLEVBQUUsTUFBTSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQUEsRUFDbEU7QUFBQSxFQUVBLGVBQWUsVUFBNEIsUUFBZ0IsY0FBMEM7QUFDcEcsaUJBQWEsbUJBQW1CLE1BQU07QUFDdEMsaUJBQWEsVUFBVSxNQUFNO0FBQUEsRUFDOUI7QUFBQSxFQUVBLGdCQUFnQixjQUEwQztBQUN6RCxpQkFBYSxvQkFBb0IsUUFBUTtBQUFBLEVBQzFDO0FBQ0Q7QUFqRk0scUJBQ1csY0FBYztBQUQvQixJQUFNLHNCQUFOO0FBdUZPLElBQU0saUJBQU4sY0FBNkIsV0FBVztBQUFBLEVBb0Q5QyxZQUNDLFdBQ2lDLGdCQUNPLHVCQUN2QztBQUNELFVBQU07QUFIMkI7QUFDTztBQXZDekMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQUVyRCxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUM5RSxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFRLGNBQWM7QUFDdEIsU0FBUSxhQUFhO0FBbUNwQixTQUFLLFVBQVUsS0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsZ0JBQWdCLHdCQUF3QixDQUFDO0FBRWpILFNBQUssV0FBVyxJQUFJLE9BQU8sV0FBVyxFQUFFLG1CQUFtQixDQUFDO0FBQzVELFNBQUssU0FBUyxNQUFNLFVBQVU7QUFHOUIsU0FBSyxjQUFjLElBQUksT0FBTyxLQUFLLFVBQVUsRUFBRSwwQkFBMEIsQ0FBQztBQUMxRSxTQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLHlCQUF5QixDQUFDO0FBQzNFLFNBQUssa0JBQWtCLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSwrQkFBK0IsQ0FBQztBQUNyRixTQUFLLGdCQUFnQixjQUFjLFNBQVMsa0JBQWtCLFFBQVE7QUFDdEUsU0FBSyxjQUFjLElBQUksT0FBTyxLQUFLLFlBQVksRUFBRSwwQkFBMEIsQ0FBQztBQUM1RSxTQUFLLGVBQWUsSUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLGdCQUFnQixDQUFDO0FBQ3BFLFNBQUssYUFBYSxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLFdBQVcsQ0FBQztBQUVsRixTQUFLLFlBQVksYUFBYSxRQUFRLFFBQVE7QUFDOUMsU0FBSyxZQUFZLGFBQWEsY0FBYyxTQUFTLG1CQUFtQixlQUFlLENBQUM7QUFDeEYsU0FBSyxZQUFZLGFBQWEsaUJBQWlCLE1BQU07QUFDckQsU0FBSyxZQUFZLFdBQVc7QUFFNUIsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssYUFBYSxJQUFJLFVBQVUsT0FBTyxNQUFNO0FBQ3JGLFdBQUssaUJBQWlCO0FBQUEsSUFDdkIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssYUFBYSxJQUFJLFVBQVUsVUFBVSxPQUFLO0FBQ3ZGLFdBQUssRUFBRSxRQUFRLFdBQVcsRUFBRSxRQUFRLFFBQVEsRUFBRSxXQUFXLEtBQUssYUFBYTtBQUMxRSxVQUFFLGVBQWU7QUFDakIsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsVUFBTSxTQUFTO0FBQ2YsU0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLFVBQVUsRUFBRSxJQUFJLE1BQU0sRUFBRSxDQUFDO0FBQzFELFNBQUssVUFBVSxLQUFLO0FBQ3BCLFNBQUssWUFBWSxhQUFhLGlCQUFpQixNQUFNO0FBRXJELFVBQU0sZ0JBQWdCLEVBQUUsd0JBQXdCO0FBQ2hELFNBQUssUUFBUSxLQUFLLFVBQVUsS0FBSyxzQkFBc0I7QUFBQSxNQUN0RDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLG9CQUFvQjtBQUFBLE1BQ3hCLENBQUMsSUFBSSxvQkFBb0IsS0FBSyxTQUFTLEtBQUssZ0JBQWdCLE1BQU0sS0FBSyxNQUFNLENBQUM7QUFBQSxNQUM5RTtBQUFBLFFBQ0MsMEJBQTBCO0FBQUEsUUFDMUIsbUJBQW1CO0FBQUEsUUFDbkIsdUJBQXVCO0FBQUEsVUFDdEIsb0JBQW9CLE1BQU0sU0FBUywwQkFBMEIsUUFBUTtBQUFBLFVBQ3JFLGNBQWMsVUFBUSxTQUFTLHFCQUFxQixZQUFZLEtBQUssTUFBTSxNQUFNLG1CQUFtQixLQUFLLEtBQUssQ0FBQztBQUFBLFFBQ2hIO0FBQUEsUUFDQSxpQ0FBaUM7QUFBQSxVQUNoQyw0QkFBNEIsVUFBUSxLQUFLLE1BQU07QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFVBQVUsWUFBWSxhQUFhO0FBQUEsRUFDekM7QUFBQSxFQXRGQSxJQUFJLFVBQXVCO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBLEVBR0EsSUFBSSxnQkFBd0I7QUFDM0IsUUFBSSxLQUFLLGdCQUFnQixHQUFHO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLFlBQVk7QUFDcEIsYUFBTyxlQUFlO0FBQUEsSUFDdkI7QUFDQSxXQUFPLGVBQWUsZ0JBQWdCLEtBQUssY0FBYyxvQkFBb0I7QUFBQSxFQUM5RTtBQUFBO0FBQUEsRUFHQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSyxjQUFjO0FBQUEsRUFDM0I7QUFBQTtBQUFBLEVBR0EsSUFBSSxZQUFxQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFpRUEsU0FBUyxPQUFxQztBQUM3QyxXQUFPLFFBQVEsWUFBVTtBQUN4QixXQUFLLFNBQVMsTUFBTSxVQUFVLEtBQUssTUFBTTtBQUV6QyxVQUFJLENBQUMsS0FBSyxRQUFRO0FBQ2pCLGFBQUssY0FBYztBQUNuQixhQUFLLGNBQWMsS0FBSztBQUN4QixhQUFLLFlBQVksQ0FBQyxDQUFDO0FBQ25CLGFBQUssU0FBUyxNQUFNLFVBQVU7QUFDOUIsYUFBSyxtQkFBbUIsS0FBSztBQUM3QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsS0FBSyxPQUFPLE9BQU8sS0FBSyxNQUFNO0FBRTdDLFVBQUksT0FBTyxXQUFXLEdBQUc7QUFDeEIsYUFBSyxjQUFjO0FBQ25CLGFBQUssY0FBYyxLQUFLO0FBQ3hCLGFBQUssWUFBWSxDQUFDLENBQUM7QUFDbkIsYUFBSyxTQUFTLE1BQU0sVUFBVTtBQUM5QixhQUFLLG1CQUFtQixLQUFLO0FBQzdCO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxXQUFXLE1BQU07QUFDaEMsWUFBTSxXQUFXLEtBQUs7QUFDdEIsV0FBSyxjQUFjLE9BQU87QUFFMUIsV0FBSyxTQUFTLE1BQU0sVUFBVTtBQUM5QixXQUFLLGNBQWMsTUFBTTtBQUN6QixXQUFLLFlBQVksTUFBTTtBQUV2QixVQUFJLEtBQUssZ0JBQWdCLFVBQVU7QUFDbEMsYUFBSyxtQkFBbUIsS0FBSztBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYyxRQUF5QztBQUM5RCxVQUFNLFNBQVMsZUFBZSxNQUFNO0FBR3BDLFFBQUksVUFBVSxLQUFLLFdBQVc7QUFFOUIsUUFBSSxPQUFPLFVBQVUsR0FBRztBQUN2QixZQUFNLFFBQVEsSUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLGlEQUFpRCxDQUFDO0FBQy9GLFlBQU0sWUFBWSxXQUFXLFFBQVEsbUJBQW1CLENBQUM7QUFDekQsVUFBSSxPQUFPLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBRSxjQUFjLEdBQUcsT0FBTyxPQUFPO0FBQUEsSUFDN0Q7QUFFQSxRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLFlBQU0sUUFBUSxJQUFJLE9BQU8sS0FBSyxhQUFhLEVBQUUsaURBQWlELENBQUM7QUFDL0YsWUFBTSxZQUFZLFdBQVcsUUFBUSxZQUFZLENBQUM7QUFDbEQsVUFBSSxPQUFPLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBRSxjQUFjLEdBQUcsT0FBTyxNQUFNO0FBQUEsSUFDNUQ7QUFFQSxRQUFJLE9BQU8sVUFBVSxHQUFHO0FBQ3ZCLFlBQU0sUUFBUSxJQUFJLE9BQU8sS0FBSyxhQUFhLEVBQUUsaURBQWlELENBQUM7QUFDL0YsWUFBTSxZQUFZLFdBQVcsUUFBUSxtQkFBbUIsQ0FBQztBQUN6RCxVQUFJLE9BQU8sT0FBTyxFQUFFLE1BQU0sQ0FBQyxFQUFFLGNBQWMsR0FBRyxPQUFPLE9BQU87QUFBQSxJQUM3RDtBQUVBLFFBQUksT0FBTyxhQUFhLEdBQUc7QUFDMUIsWUFBTSxRQUFRLElBQUksT0FBTyxLQUFLLGFBQWEsRUFBRSxpREFBaUQsQ0FBQztBQUMvRixZQUFNLFlBQVksV0FBVyxRQUFRLGlCQUFpQixDQUFDO0FBQ3ZELFVBQUksT0FBTyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsY0FBYyxHQUFHLE9BQU8sVUFBVTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxPQUFPLFFBQXNCO0FBQzVCLFFBQUksS0FBSyxZQUFZO0FBQ3BCLFdBQUssVUFBVSxNQUFNLFVBQVU7QUFDL0I7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLE1BQU0sVUFBVTtBQUMvQixTQUFLLE1BQU0sT0FBTyxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVRLG1CQUF5QjtBQUNoQyxTQUFLLGNBQWMsQ0FBQyxLQUFLLFVBQVU7QUFDbkMsU0FBSyxzQkFBc0IsS0FBSyxLQUFLLFVBQVU7QUFFL0MsU0FBSyxtQkFBbUIsS0FBSztBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLFNBQWU7QUFDZCxRQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxLQUFLO0FBQ3hCLFNBQUssc0JBQXNCLEtBQUssS0FBSztBQUNyQyxTQUFLLG1CQUFtQixLQUFLO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsUUFBYztBQUNiLFFBQUksS0FBSyxjQUFjLEtBQUssZ0JBQWdCLEdBQUc7QUFDOUMsV0FBSyxZQUFZLE1BQU07QUFDdkI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxNQUFNLFNBQVM7QUFDcEIsUUFBSSxLQUFLLE1BQU0sU0FBUyxLQUFLLEtBQUssTUFBTSxTQUFTLEVBQUUsV0FBVyxHQUFHO0FBQ2hFLFdBQUssTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFdBQTBCO0FBQy9DLFNBQUssYUFBYTtBQUNsQixTQUFLLGVBQWU7QUFDcEIsU0FBSyxZQUFZLFVBQVUsT0FBTyxhQUFhLFNBQVM7QUFDeEQsU0FBSyxZQUFZLGFBQWEsaUJBQWlCLE9BQU8sQ0FBQyxTQUFTLENBQUM7QUFBQSxFQUNsRTtBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFNBQUssYUFBYSxZQUFZO0FBQzlCLFNBQUssYUFBYSxVQUFVO0FBQUEsTUFDM0IsR0FBRyxVQUFVO0FBQUEsUUFDWixLQUFLLGFBQWEsUUFBUSxlQUFlLFFBQVE7QUFBQSxNQUNsRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLFFBQTJDO0FBQzlELFNBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQy9DO0FBQ0Q7QUEzUGEsZUFFSSxnQkFBZ0I7QUFBQTtBQUZwQixlQUdJLGtCQUFrQixJQUFJLG9CQUFvQixjQUFjO0FBQUE7QUFINUQsZUFJSSx3QkFBd0I7QUFBQTtBQUo1QixlQUtJLGtCQUFrQjtBQUx0QixpQkFBTjtBQUFBLEVBc0RKO0FBQUEsRUFDQTtBQUFBLEdBdkRVO0FBNlBiLFNBQVMsV0FBVyxRQUF1RDtBQUMxRSxTQUFPLENBQUMsR0FBRyxNQUFNLEVBQ2YsS0FBSyxhQUFhLEVBQ2xCLElBQUksWUFBVSxFQUFFLE9BQU8sT0FBTyxjQUFjLEtBQUssRUFBRSxFQUFFO0FBQ3hEO0FBRUEsU0FBUyxjQUFjLEdBQW1CLEdBQTJCO0FBQ3BFLFFBQU0sWUFBWSxjQUFjLENBQUMsSUFBSSxjQUFjLENBQUM7QUFDcEQsTUFBSSxjQUFjLEdBQUc7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLEVBQUUsS0FBSyxjQUFjLEVBQUUsTUFBTSxRQUFXLEVBQUUsYUFBYSxPQUFPLENBQUM7QUFDdkU7QUFFQSxTQUFTLGVBQWUsUUFBbUQ7QUFDMUUsTUFBSSxVQUFVO0FBQ2QsTUFBSSxVQUFVO0FBQ2QsTUFBSSxTQUFTO0FBQ2IsTUFBSSxhQUFhO0FBRWpCLGFBQVcsU0FBUyxRQUFRO0FBQzNCLFlBQVEsY0FBYyxLQUFLLEdBQUc7QUFBQSxNQUM3QixLQUFLLGFBQWE7QUFDakI7QUFDQTtBQUFBLE1BQ0QsS0FBSyxhQUFhO0FBQ2pCO0FBQ0E7QUFBQSxNQUNELEtBQUssYUFBYTtBQUNqQjtBQUNBO0FBQUEsTUFDRCxLQUFLLGFBQWE7QUFDakI7QUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBRUEsU0FBTyxFQUFFLFNBQVMsU0FBUyxRQUFRLFdBQVc7QUFDL0M7QUFFQSxTQUFTLGFBQWEsT0FBa0M7QUFDdkQsVUFBUSxNQUFNLFFBQVE7QUFBQSxJQUNyQixLQUFLLGtCQUFrQjtBQUN0QixhQUFPLFFBQVE7QUFBQSxJQUNoQixLQUFLLGtCQUFrQjtBQUN0QixhQUFPLFFBQVE7QUFBQSxJQUNoQixLQUFLLGtCQUFrQjtBQUN0QixjQUFRLE1BQU0sWUFBWTtBQUFBLFFBQ3pCLEtBQUssc0JBQXNCO0FBQzFCLGlCQUFPLFFBQVE7QUFBQSxRQUNoQixLQUFLLHNCQUFzQjtBQUFBLFFBQzNCLEtBQUssc0JBQXNCO0FBQUEsUUFDM0IsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQU8sUUFBUTtBQUFBLFFBQ2hCLEtBQUssc0JBQXNCO0FBQzFCLGlCQUFPLFFBQVE7QUFBQSxRQUNoQixLQUFLLHNCQUFzQjtBQUMxQixpQkFBTyxRQUFRO0FBQUEsUUFDaEI7QUFDQyxpQkFBTyxRQUFRO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBQ0MsYUFBTyxRQUFRO0FBQUEsRUFDakI7QUFDRDtBQUVBLFNBQVMsb0JBQW9CLE9BQStCO0FBQzNELFVBQVEsY0FBYyxLQUFLLEdBQUc7QUFBQSxJQUM3QixLQUFLLGFBQWE7QUFDakIsYUFBTztBQUFBLElBQ1IsS0FBSyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSLEtBQUssYUFBYTtBQUNqQixhQUFPO0FBQUEsSUFDUixLQUFLLGFBQWE7QUFDakIsYUFBTztBQUFBLEVBQ1Q7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
