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
import "./media/sessionChangesEditor.css";
import { $, append, Dimension } from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derivedObservableWithCache, observableValue } from "../../../../base/common/observable.js";
import { Range } from "../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { AbstractEditorWithViewState } from "../../../../workbench/browser/parts/editor/editorWithViewState.js";
import { ResourceLabel } from "../../../../workbench/browser/labels.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { MultiDiffEditorWidget } from "../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { MultiDiffEditorItemLabelKind } from "../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js";
import { Menus } from "../../../browser/menus.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { ActiveSessionContextKeys } from "../common/changes.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { ChangesActionsBar, ChangesActionsBarActionViewItem, CHANGES_HEADER_ACTIONS_ID } from "./changesView.js";
import { SessionChangesEditorInput } from "./sessionChangesEditorInput.js";
import { ISessionChangesService } from "./sessionChangesService.js";
import { isEqual } from "../../../../base/common/resources.js";
import { MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { CheckboxActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { localize } from "../../../../nls.js";
import { getChangesEditorFileStats } from "./changesEditorLabels.js";
const HEADER_HEIGHT = 35;
const CHANGES_DIFF_EDITOR_OPTIONS = {
  hideOriginalLineNumbers: true,
  folding: false,
  lineNumbersMinChars: 3
};
let SessionChangesUIElementFactory = class {
  constructor(changesObs, instantiationService) {
    this.changesObs = changesObs;
    this.instantiationService = instantiationService;
    this.headerClickToCollapse = true;
  }
  createResourceLabel(element, kind) {
    const label = this.instantiationService.createInstance(ResourceLabel, element, {});
    const showDiffStats = kind === MultiDiffEditorItemLabelKind.Primary;
    return new SessionChangesResourceLabel(label, element, showDiffStats, this.changesObs);
  }
  createToolbarActionViewItem(action, options) {
    if (action.id === CHANGESET_REVIEW_ACTION_ID && action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(ChangesetReviewActionViewItem, action, options);
    }
    return void 0;
  }
};
SessionChangesUIElementFactory = __decorateClass([
  __decorateParam(1, IInstantiationService)
], SessionChangesUIElementFactory);
class SessionChangesResourceLabel extends Disposable {
  constructor(label, element, showDiffStats, changesObs) {
    super();
    this.label = label;
    this.resource = observableValue(this, void 0);
    this._register(label);
    if (showDiffStats) {
      const statsContainer = append(element, $(".session-changes-file-stats"));
      const added = append(statsContainer, $(".working-set-lines-added"));
      const removed = append(statsContainer, $(".working-set-lines-removed"));
      added.setAttribute("aria-hidden", "true");
      removed.setAttribute("aria-hidden", "true");
      this._register(autorun((reader) => {
        const resource = this.resource.read(reader);
        const stats = resource ? getChangesEditorFileStats(resource, changesObs.read(reader)) : void 0;
        statsContainer.style.display = stats ? "" : "none";
        if (stats) {
          added.textContent = `+${stats.insertions}`;
          removed.textContent = `-${stats.deletions}`;
          statsContainer.setAttribute("aria-label", localize("sessionChangesEditor.fileCounts", "{0} lines added, {1} lines removed", stats.insertions, stats.deletions));
        } else {
          added.textContent = "";
          removed.textContent = "";
          statsContainer.removeAttribute("aria-label");
        }
      }));
    }
  }
  setUri(uri, options = {}) {
    if (!uri) {
      this.label.element.clear();
    } else {
      this.label.element.setFile(uri, { strikethrough: options.strikethrough });
    }
    this.resource.set(uri, void 0);
  }
}
let SessionChangesEditor = class extends AbstractEditorWithViewState {
  constructor(group, telemetryService, themeService, storageService, instantiationService, textResourceConfigurationService, editorService, editorGroupService, contextKeyService, changesViewService, configurationService, layoutService, sessionChangesService) {
    super(
      SessionChangesEditor.ID,
      group,
      "sessionChangesEditorViewState",
      telemetryService,
      instantiationService,
      storageService,
      textResourceConfigurationService,
      themeService,
      editorService,
      editorGroupService
    );
    this.contextKeyService = contextKeyService;
    this.changesViewService = changesViewService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.sessionChangesService = sessionChangesService;
    this._singlePane = false;
    /** Session whose changes this editor is currently showing (from its input). */
    this._inputSessionResource = observableValue(this, void 0);
    /**
     * Changes for this editor's own session, scoped so a stale row does not pick
     * up the counts of a different (globally active) session during a switch.
     */
    this._scopedChangesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const editorSession = this._inputSessionResource.read(reader);
      const activeSession = this.changesViewService.activeSessionResourceObs.read(reader);
      if (!editorSession || !activeSession || !isEqual(editorSession, activeSession)) {
        return lastValue ?? [];
      }
      return this.changesViewService.activeSessionChangesObs.read(reader);
    });
    /** Deferred focus request awaiting the active diff editor to be rendered. */
    this._pendingFocus = this._register(new MutableDisposable());
  }
  createEditor(parent) {
    const root = append(parent, $(".session-changes-editor"));
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(root));
    this._register(bindContextKey(ActiveSessionContextKeys.HasGitRepository, scopedContextKeyService, (reader) => this.changesViewService.activeSessionHasGitRepositoryObs.read(reader)));
    this._register(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, (reader) => this.changesViewService.activeSessionChangesObs.read(reader).length > 0));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this._scopedInstantiationService = scopedInstantiationService;
    this._singlePane = this.layoutService.isSinglePaneLayoutEnabled;
    if (!this._singlePane) {
      const header = append(root, $(".session-changes-editor-header"));
      const left = append(header, $(".session-changes-editor-header-left"));
      const right = append(header, $(".session-changes-editor-header-right"));
      this._register(this._buildHeaderToolbars(left, right, scopedInstantiationService));
    }
    this.bodyContainer = append(root, $(".session-changes-editor-body"));
    const paneInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    this.widget = this._register(paneInstantiationService.createInstance(
      MultiDiffEditorWidget,
      this.bodyContainer,
      paneInstantiationService.createInstance(SessionChangesUIElementFactory, this._scopedChangesObs),
      CHANGES_DIFF_EDITOR_OPTIONS
    ));
    this._applyRenderSideBySide();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("diffEditor.renderSideBySide")) {
        this._applyRenderSideBySide();
      }
    }));
  }
  _applyRenderSideBySide() {
    this.widget?.setRenderSideBySide(this.configurationService.getValue("diffEditor.renderSideBySide") ?? true);
  }
  /**
   * Resolves the diff editor and code editor showing the given file, mirroring
   * {@link MultiDiffEditor.tryGetCodeEditor} so file-toolbar actions can operate
   * on this editor and the plain multi-diff editor uniformly.
   */
  tryGetCodeEditor(resource) {
    return this.widget?.tryGetCodeEditor(resource);
  }
  /** Creates the classic (non-single-pane) internal header toolbars. */
  _buildHeaderToolbars(left, right, instantiationService) {
    const store = new DisposableStore();
    store.add(instantiationService.createInstance(MenuWorkbenchToolBar, left, Menus.SessionsEditorHeaderPrimary, {
      menuOptions: { shouldForwardArgs: true }
    }));
    store.add(instantiationService.createInstance(ChangesActionsBar, right));
    return store;
  }
  /**
   * In single-pane, opt this editor in to the group's full-width header (spanning
   * the editor content and docked detail), providing this editor's scoped context
   * so the header actions' `when` clauses evaluate correctly.
   */
  getHeaderActions() {
    if (!this._singlePane || !this._scopedInstantiationService) {
      return void 0;
    }
    return { instantiationService: this._scopedInstantiationService };
  }
  /**
   * In single-pane, render the Create Pull Request button bar ({@link ChangesActionsBar})
   * as the editor tabs title anchor action ({@link CHANGES_HEADER_ACTIONS_ID}).
   */
  getActionViewItem(action, options) {
    if (this._singlePane && action.id === CHANGES_HEADER_ACTIONS_ID) {
      return this.instantiationService.createInstance(ChangesActionsBarActionViewItem, action, options);
    }
    return super.getActionViewItem(action, options);
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this._inputSessionResource.set(this.sessionChangesService.getSessionResource(input.multiDiffSource), void 0);
    const viewModel = await input.getViewModel();
    if (token.isCancellationRequested) {
      return;
    }
    this.viewModel = viewModel;
    const viewState = this.loadEditorViewState(input, context);
    this.widget?.setViewModel(viewModel, { preserveFocus: options?.preserveFocus, viewState });
    this._applyOptions(options);
  }
  setEditorVisible(visible) {
    if (!visible) {
      this._pendingFocus.clear();
      this.saveCurrentEditorViewState();
    }
    super.setEditorVisible(visible);
  }
  computeEditorViewState(_resource) {
    if (!this.viewModel) {
      return void 0;
    }
    return this.widget?.getViewState();
  }
  tracksEditorViewState(input) {
    return input instanceof SessionChangesEditorInput;
  }
  tracksDisposedEditorViewState() {
    return true;
  }
  toEditorViewStateResource(input) {
    return input instanceof SessionChangesEditorInput ? input.multiDiffSource : void 0;
  }
  collapseAllDiffs() {
    this.viewModel?.collapseAll();
  }
  expandAllDiffs() {
    this.viewModel?.expandAll();
  }
  collapse(resource) {
    const item = this.viewModel?.items.read(void 0).find((i) => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
    if (!item) {
      return;
    }
    this.viewModel?.collapse(item);
  }
  expand(resource) {
    const item = this.viewModel?.items.read(void 0).find((i) => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
    if (!item) {
      return;
    }
    this.viewModel?.expand(item);
  }
  setOptions(options) {
    this._applyOptions(options);
  }
  _applyOptions(options) {
    const revealData = options?.viewState?.revealData;
    if (!revealData) {
      return;
    }
    this.widget?.reveal(revealData.resource, {
      range: revealData.range ? Range.lift(revealData.range) : void 0,
      highlight: true
    });
  }
  clearInput() {
    this._pendingFocus.clear();
    super.clearInput();
    this.viewModel = void 0;
    this.widget?.setViewModel(void 0);
  }
  focus() {
    super.focus();
    this._pendingFocus.clear();
    const widget = this.widget;
    if (!widget) {
      return;
    }
    const control = widget.getActiveControl();
    if (control) {
      control.focus();
      return;
    }
    this._pendingFocus.value = widget.onDidChangeActiveControl(() => {
      const activeControl = widget.getActiveControl();
      if (activeControl) {
        this._pendingFocus.clear();
        activeControl.focus();
      }
    });
  }
  layout(dimension) {
    const bodyHeight = this._singlePane ? dimension.height : Math.max(0, dimension.height - HEADER_HEIGHT);
    this.widget?.layout(new Dimension(dimension.width, bodyHeight));
  }
};
SessionChangesEditor.ID = SessionChangesEditorInput.EDITOR_ID;
SessionChangesEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITextResourceConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IChangesViewService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IAgentWorkbenchLayoutService),
  __decorateParam(12, ISessionChangesService)
], SessionChangesEditor);
const CHANGESET_REVIEW_ACTION_ID = "changeset.review";
class ChangesetReviewActionViewItem extends CheckboxActionViewItem {
  constructor(action, options) {
    super(void 0, action, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } });
  }
  render(container) {
    super.render(container);
    container.classList.add("changeset-review-action");
  }
  updateChecked() {
    super.updateChecked();
    this.updateAriaLabel();
    this.updateTooltip();
  }
  getTooltip() {
    return this.action.checked ? localize("changeset.viewed.tooltip", "Mark as Not Viewed") : localize("changeset.notViewed.tooltip", "Mark as Viewed");
  }
}
export {
  CHANGESET_REVIEW_ACTION_ID,
  SessionChangesEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Nlc3Npb25DaGFuZ2VzRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQsIERpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFZGl0b3JXaXRoVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvcldpdGhWaWV3U3RhdGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9ySGVhZGVyQWN0aW9ucywgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tdWx0aURpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMsIElNdWx0aURpZmZFZGl0b3JWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldEltcGwuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LCBNdWx0aURpZmZFZGl0b3JJdGVtTGFiZWxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXMuanMnO1xuaW1wb3J0IHsgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc0FjdGlvbnNCYXIsIENoYW5nZXNBY3Rpb25zQmFyQWN0aW9uVmlld0l0ZW0sIENIQU5HRVNfSEVBREVSX0FDVElPTlNfSUQgfSBmcm9tICcuL2NoYW5nZXNWaWV3LmpzJztcbmltcG9ydCB7IFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQgfSBmcm9tICcuL3Nlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRmlsZUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucywgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3hBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRDaGVja2JveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRDaGFuZ2VzRWRpdG9yRmlsZVN0YXRzIH0gZnJvbSAnLi9jaGFuZ2VzRWRpdG9yTGFiZWxzLmpzJztcblxuY29uc3QgSEVBREVSX0hFSUdIVCA9IDM1O1xuXG4vKipcbiAqIE9wdGltaXplcyB0aGUgZW1iZWRkZWQgZGlmZnMgZm9yIHRoZSBuYXJyb3cgQWdlbnRzIHdpbmRvdyBwYW5lbCB3aGlsZVxuICogcHJlc2VydmluZyB0aGUgbXVsdGktZGlmZiBlZGl0b3IncyBleHBhbmRhYmxlIHVuY2hhbmdlZC1yZWdpb24gd2lkZ2V0cy5cbiAqL1xuY29uc3QgQ0hBTkdFU19ESUZGX0VESVRPUl9PUFRJT05TOiBJRGlmZkVkaXRvck9wdGlvbnMgPSB7XG5cdGhpZGVPcmlnaW5hbExpbmVOdW1iZXJzOiB0cnVlLFxuXHRmb2xkaW5nOiBmYWxzZSxcblx0bGluZU51bWJlcnNNaW5DaGFyczogMyxcbn07XG5cbmNsYXNzIFNlc3Npb25DaGFuZ2VzVUlFbGVtZW50RmFjdG9yeSBpbXBsZW1lbnRzIElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5IHtcblxuXHRyZWFkb25seSBoZWFkZXJDbGlja1RvQ29sbGFwc2UgPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNyZWF0ZVJlc291cmNlTGFiZWwoZWxlbWVudDogSFRNTEVsZW1lbnQsIGtpbmQ6IE11bHRpRGlmZkVkaXRvckl0ZW1MYWJlbEtpbmQpOiBJUmVzb3VyY2VMYWJlbCB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWwsIGVsZW1lbnQsIHt9KTtcblx0XHRjb25zdCBzaG93RGlmZlN0YXRzID0ga2luZCA9PT0gTXVsdGlEaWZmRWRpdG9ySXRlbUxhYmVsS2luZC5QcmltYXJ5O1xuXHRcdHJldHVybiBuZXcgU2Vzc2lvbkNoYW5nZXNSZXNvdXJjZUxhYmVsKGxhYmVsLCBlbGVtZW50LCBzaG93RGlmZlN0YXRzLCB0aGlzLmNoYW5nZXNPYnMpO1xuXHR9XG5cblx0Y3JlYXRlVG9vbGJhckFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ0hBTkdFU0VUX1JFVklFV19BQ1RJT05fSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNldFJldmlld0FjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFNlc3Npb25DaGFuZ2VzUmVzb3VyY2VMYWJlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVzb3VyY2VMYWJlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYWJlbDogUmVzb3VyY2VMYWJlbCxcblx0XHRlbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRzaG93RGlmZlN0YXRzOiBib29sZWFuLFxuXHRcdGNoYW5nZXNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYWJlbCk7XG5cblx0XHRpZiAoc2hvd0RpZmZTdGF0cykge1xuXHRcdFx0Y29uc3Qgc3RhdHNDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLnNlc3Npb24tY2hhbmdlcy1maWxlLXN0YXRzJykpO1xuXHRcdFx0Y29uc3QgYWRkZWQgPSBhcHBlbmQoc3RhdHNDb250YWluZXIsICQoJy53b3JraW5nLXNldC1saW5lcy1hZGRlZCcpKTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBhcHBlbmQoc3RhdHNDb250YWluZXIsICQoJy53b3JraW5nLXNldC1saW5lcy1yZW1vdmVkJykpO1xuXHRcdFx0YWRkZWQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRyZW1vdmVkLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5yZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHN0YXRzID0gcmVzb3VyY2Vcblx0XHRcdFx0XHQ/IGdldENoYW5nZXNFZGl0b3JGaWxlU3RhdHMocmVzb3VyY2UsIGNoYW5nZXNPYnMucmVhZChyZWFkZXIpKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRzdGF0c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gc3RhdHMgPyAnJyA6ICdub25lJztcblx0XHRcdFx0aWYgKHN0YXRzKSB7XG5cdFx0XHRcdFx0YWRkZWQudGV4dENvbnRlbnQgPSBgKyR7c3RhdHMuaW5zZXJ0aW9uc31gO1xuXHRcdFx0XHRcdHJlbW92ZWQudGV4dENvbnRlbnQgPSBgLSR7c3RhdHMuZGVsZXRpb25zfWA7XG5cdFx0XHRcdFx0c3RhdHNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Nlc3Npb25DaGFuZ2VzRWRpdG9yLmZpbGVDb3VudHMnLCAnezB9IGxpbmVzIGFkZGVkLCB7MX0gbGluZXMgcmVtb3ZlZCcsIHN0YXRzLmluc2VydGlvbnMsIHN0YXRzLmRlbGV0aW9ucykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGVkLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdFx0cmVtb3ZlZC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdHN0YXRzQ29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0VXJpKHVyaTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zOiB7IHN0cmlrZXRocm91Z2g/OiBib29sZWFuIH0gPSB7fSk6IHZvaWQge1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHR0aGlzLmxhYmVsLmVsZW1lbnQuY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYWJlbC5lbGVtZW50LnNldEZpbGUodXJpLCB7IHN0cmlrZXRocm91Z2g6IG9wdGlvbnMuc3RyaWtldGhyb3VnaCB9KTtcblx0XHR9XG5cdFx0dGhpcy5yZXNvdXJjZS5zZXQodXJpLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbi8qKlxuICogQ2hhbmdlcyBlZGl0b3IgZm9yIHRoZSBBZ2VudHMgd2luZG93OiBhIFwiQnJhbmNoIENoYW5nZXNcIiB2ZXJzaW9ucyBkcm9wZG93biBhbmRcbiAqIGRpZmYgc3RhdHMgaGVhZGVyIHNpdHRpbmcgYWJvdmUgYW4gZW1iZWRkZWQgbXVsdGktZGlmZiBlZGl0b3Igc2hvd2luZyB0aGVcbiAqIHNlc3Npb24ncyBmaWxlIGRpZmZzLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkNoYW5nZXNFZGl0b3IgZXh0ZW5kcyBBYnN0cmFjdEVkaXRvcldpdGhWaWV3U3RhdGU8SU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQuRURJVE9SX0lEO1xuXG5cdHByaXZhdGUgd2lkZ2V0OiBNdWx0aURpZmZFZGl0b3JXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmlld01vZGVsOiBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc2luZ2xlUGFuZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBTZXNzaW9uIHdob3NlIGNoYW5nZXMgdGhpcyBlZGl0b3IgaXMgY3VycmVudGx5IHNob3dpbmcgKGZyb20gaXRzIGlucHV0KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdC8qKlxuXHQgKiBDaGFuZ2VzIGZvciB0aGlzIGVkaXRvcidzIG93biBzZXNzaW9uLCBzY29wZWQgc28gYSBzdGFsZSByb3cgZG9lcyBub3QgcGlja1xuXHQgKiB1cCB0aGUgY291bnRzIG9mIGEgZGlmZmVyZW50IChnbG9iYWxseSBhY3RpdmUpIHNlc3Npb24gZHVyaW5nIGEgc3dpdGNoLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkQ2hhbmdlc09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPih0aGlzLCAocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXNzaW9uID0gdGhpcy5faW5wdXRTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZWRpdG9yU2Vzc2lvbiB8fCAhYWN0aXZlU2Vzc2lvbiB8fCAhaXNFcXVhbChlZGl0b3JTZXNzaW9uLCBhY3RpdmVTZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIGxhc3RWYWx1ZSA/PyBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0LyoqIERlZmVycmVkIGZvY3VzIHJlcXVlc3QgYXdhaXRpbmcgdGhlIGFjdGl2ZSBkaWZmIGVkaXRvciB0byBiZSByZW5kZXJlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0ZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdFNlc3Npb25DaGFuZ2VzRWRpdG9yLklELFxuXHRcdFx0Z3JvdXAsXG5cdFx0XHQnc2Vzc2lvbkNoYW5nZXNFZGl0b3JWaWV3U3RhdGUnLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHR0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRoZW1lU2VydmljZSxcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRlZGl0b3JHcm91cFNlcnZpY2UsXG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvb3QgPSBhcHBlbmQocGFyZW50LCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvcicpKTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQocm9vdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRSZXBvc2l0b3J5LCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+XG5cdFx0XHR0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uSGFzR2l0UmVwb3NpdG9yeU9icy5yZWFkKHJlYWRlcikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuaGFzQWdlbnRTZXNzaW9uQ2hhbmdlcywgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHJlYWRlciA9PlxuXHRcdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDApKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHQvLyBJbiBzaW5nbGUtcGFuZSwgdGhlIGhlYWRlciAoQnJhbmNoIENoYW5nZXMgZHJvcGRvd24sIGRpZmYgc3RhdHMgYW5kIHByaW1hcnlcblx0XHQvLyBhY3Rpb25zKSBpcyBob3N0ZWQgYnkgdGhlIGVkaXRvciBwYXJ0J3MgZnVsbC13aWR0aCBoZWFkZXIgaW5zdGVhZCBvZiBpbnNpZGVcblx0XHQvLyB0aGlzIGVkaXRvciwgc28gaXQgc3BhbnMgdGhlIGVkaXRvciBjb250ZW50IGFuZCB0aGUgZG9ja2VkIGRldGFpbCBwYW5lbC5cblx0XHR0aGlzLl9zaW5nbGVQYW5lID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQ7XG5cdFx0aWYgKCF0aGlzLl9zaW5nbGVQYW5lKSB7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQocm9vdCwgJCgnLnNlc3Npb24tY2hhbmdlcy1lZGl0b3ItaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IGFwcGVuZChoZWFkZXIsICQoJy5zZXNzaW9uLWNoYW5nZXMtZWRpdG9yLWhlYWRlci1sZWZ0JykpO1xuXHRcdFx0Y29uc3QgcmlnaHQgPSBhcHBlbmQoaGVhZGVyLCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvci1oZWFkZXItcmlnaHQnKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9idWlsZEhlYWRlclRvb2xiYXJzKGxlZnQsIHJpZ2h0LCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYm9keUNvbnRhaW5lciA9IGFwcGVuZChyb290LCAkKCcuc2Vzc2lvbi1jaGFuZ2VzLWVkaXRvci1ib2R5JykpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSB3aWRnZXQgaW4gdGhlIGVkaXRvci1wYW5lIGNvbnRleHQgKG5vdCB0aGUgZGVlcGVyIHNjb3BlZCBvbmUpXG5cdFx0Ly8gc28gaXRzIG93biBtdWx0aURpZmZFZGl0b3IqIGNvbnRleHQga2V5cyAoYWxsLWNvbGxhcHNlZCwgcmVuZGVyLXNpZGUtYnktc2lkZSlcblx0XHQvLyBhcmUgdmlzaWJsZSB0byB0aGUgRWRpdG9yVGl0bGUgbWVudSB0aGF0IGRyaXZlcyB0aGUgY29sbGFwc2UvZXhwYW5kLWFsbCBhbmRcblx0XHQvLyBpbmxpbmUtdmlldyB0b2dnbGUgYWN0aW9ucy5cblx0XHRjb25zdCBwYW5lSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIocGFuZUluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TXVsdGlEaWZmRWRpdG9yV2lkZ2V0LFxuXHRcdFx0dGhpcy5ib2R5Q29udGFpbmVyLFxuXHRcdFx0cGFuZUluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGFuZ2VzVUlFbGVtZW50RmFjdG9yeSwgdGhpcy5fc2NvcGVkQ2hhbmdlc09icyksXG5cdFx0XHRDSEFOR0VTX0RJRkZfRURJVE9SX09QVElPTlMsXG5cdFx0KSk7XG5cdFx0dGhpcy5fYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJykpIHtcblx0XHRcdFx0dGhpcy5fYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlSZW5kZXJTaWRlQnlTaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0Py5zZXRSZW5kZXJTaWRlQnlTaWRlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2RpZmZFZGl0b3IucmVuZGVyU2lkZUJ5U2lkZScpID8/IHRydWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBkaWZmIGVkaXRvciBhbmQgY29kZSBlZGl0b3Igc2hvd2luZyB0aGUgZ2l2ZW4gZmlsZSwgbWlycm9yaW5nXG5cdCAqIHtAbGluayBNdWx0aURpZmZFZGl0b3IudHJ5R2V0Q29kZUVkaXRvcn0gc28gZmlsZS10b29sYmFyIGFjdGlvbnMgY2FuIG9wZXJhdGVcblx0ICogb24gdGhpcyBlZGl0b3IgYW5kIHRoZSBwbGFpbiBtdWx0aS1kaWZmIGVkaXRvciB1bmlmb3JtbHkuXG5cdCAqL1xuXHR0cnlHZXRDb2RlRWRpdG9yKHJlc291cmNlOiBVUkkpOiB7IGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yOyBlZGl0b3I6IElDb2RlRWRpdG9yIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndpZGdldD8udHJ5R2V0Q29kZUVkaXRvcihyZXNvdXJjZSk7XG5cdH1cblxuXHQvKiogQ3JlYXRlcyB0aGUgY2xhc3NpYyAobm9uLXNpbmdsZS1wYW5lKSBpbnRlcm5hbCBoZWFkZXIgdG9vbGJhcnMuICovXG5cdHByaXZhdGUgX2J1aWxkSGVhZGVyVG9vbGJhcnMobGVmdDogSFRNTEVsZW1lbnQsIHJpZ2h0OiBIVE1MRWxlbWVudCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFRoZSBCcmFuY2ggQ2hhbmdlcyBwaWNrZXIgKyBkaWZmIHN0YXRzIHJlbmRlciBhcyB0aGUgbGVhZGluZyBoZWFkZXIgbWVudTtcblx0XHQvLyB0aGVpciBjdXN0b20gYWN0aW9uIHZpZXcgaXRlbXMgcmVzb2x2ZSBnbG9iYWxseSB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZS5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGxlZnQsIE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgUHVsbCBSZXF1ZXN0IChhbmQgcmVsYXRlZCkgYWN0aW9ucyByZW5kZXIgb24gdGhlIHJpZ2h0IG9mIHRoZSBoZWFkZXIgcm93LlxuXHRcdHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzQWN0aW9uc0JhciwgcmlnaHQpKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbiBzaW5nbGUtcGFuZSwgb3B0IHRoaXMgZWRpdG9yIGluIHRvIHRoZSBncm91cCdzIGZ1bGwtd2lkdGggaGVhZGVyIChzcGFubmluZ1xuXHQgKiB0aGUgZWRpdG9yIGNvbnRlbnQgYW5kIGRvY2tlZCBkZXRhaWwpLCBwcm92aWRpbmcgdGhpcyBlZGl0b3IncyBzY29wZWQgY29udGV4dFxuXHQgKiBzbyB0aGUgaGVhZGVyIGFjdGlvbnMnIGB3aGVuYCBjbGF1c2VzIGV2YWx1YXRlIGNvcnJlY3RseS5cblx0ICovXG5cdGdldEhlYWRlckFjdGlvbnMoKTogSUVkaXRvckhlYWRlckFjdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fc2luZ2xlUGFuZSB8fCAhdGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IGluc3RhbnRpYXRpb25TZXJ2aWNlOiB0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEluIHNpbmdsZS1wYW5lLCByZW5kZXIgdGhlIENyZWF0ZSBQdWxsIFJlcXVlc3QgYnV0dG9uIGJhciAoe0BsaW5rIENoYW5nZXNBY3Rpb25zQmFyfSlcblx0ICogYXMgdGhlIGVkaXRvciB0YWJzIHRpdGxlIGFuY2hvciBhY3Rpb24gKHtAbGluayBDSEFOR0VTX0hFQURFUl9BQ1RJT05TX0lEfSkuXG5cdCAqL1xuXHRvdmVycmlkZSBnZXRBY3Rpb25WaWV3SXRlbShhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc2luZ2xlUGFuZSAmJiBhY3Rpb24uaWQgPT09IENIQU5HRVNfSEVBREVSX0FDVElPTlNfSUQpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNBY3Rpb25zQmFyQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5nZXRBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElNdWx0aURpZmZFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0dGhpcy5faW5wdXRTZXNzaW9uUmVzb3VyY2Uuc2V0KHRoaXMuc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldFNlc3Npb25SZXNvdXJjZShpbnB1dC5tdWx0aURpZmZTb3VyY2UpLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGF3YWl0IGlucHV0LmdldFZpZXdNb2RlbCgpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnZpZXdNb2RlbCA9IHZpZXdNb2RlbDtcblxuXHRcdC8vIEFwcGx5IHRoZSBtb2RlbCBhbmQgYW55IHJlc3RvcmVkIHZpZXcgc3RhdGUgdG9nZXRoZXIgc28gdGhlIHdpZGdldCdzXG5cdFx0Ly8gYXV0b21hdGljIGZpcnN0LWNoYW5nZSBuYXZpZ2F0aW9uIHNlZXMgdGhlIHJlc3RvcmVkIGFjdGl2ZSBpdGVtIGluc3RlYWRcblx0XHQvLyBvZiBuYXZpZ2F0aW5nIHRvIChhbmQgZm9jdXNpbmcpIHRoZSBmaXJzdCBmaWxlLlxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMubG9hZEVkaXRvclZpZXdTdGF0ZShpbnB1dCwgY29udGV4dCk7XG5cdFx0dGhpcy53aWRnZXQ/LnNldFZpZXdNb2RlbCh2aWV3TW9kZWwsIHsgcHJlc2VydmVGb2N1czogb3B0aW9ucz8ucHJlc2VydmVGb2N1cywgdmlld1N0YXRlIH0pO1xuXHRcdHRoaXMuX2FwcGx5T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBUaGUgQ2hhbmdlcyBlZGl0b3IgY2FuIGJlIGJhY2tncm91bmRlZCB3aXRob3V0IGJlaW5nIGNsZWFyZWQgb3IgY2xvc2VkXG5cdFx0Ly8gKGUuZy4gc3dpdGNoaW5nIHNlc3Npb25zIG1ha2VzIGFub3RoZXIgZWRpdG9yIGFjdGl2ZSwgb3IgdGhlIGRldGFpbCBwYW5lbFxuXHRcdC8vIHN3aXRjaGVzIHRvIEZpbGVzKS4gUGVyc2lzdCBpdHMgdmlldyBzdGF0ZSBvbiBoaWRlIHNvIGNvbGxhcHNlZC9zY3JvbGxcblx0XHQvLyBzdGF0ZSBzdXJ2aXZlcyByZWdhcmRsZXNzIG9mIHRoZSBjbG9zZS9vcGVuIG9yZGVyaW5nLlxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0ZvY3VzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnNhdmVDdXJyZW50RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0fVxuXHRcdHN1cGVyLnNldEVkaXRvclZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZUVkaXRvclZpZXdTdGF0ZShfcmVzb3VyY2U6IFVSSSk6IElNdWx0aURpZmZFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIG5vdGhpbmcgbG9hZGVkOiBkb24ndCBvdmVyd3JpdGUgYSBzYXZlZCBzdGF0ZSB3aXRoIGFuIGVtcHR5IHNuYXBzaG90XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndpZGdldD8uZ2V0Vmlld1N0YXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdHJhY2tzRWRpdG9yVmlld1N0YXRlKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdHJhY2tzRGlzcG9zZWRFZGl0b3JWaWV3U3RhdGUoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVGhlIENoYW5nZXMgZWRpdG9yIGlzIHJlY3JlYXRlZCBmcm9tIGl0cyBwZXItc2Vzc2lvbiByZXNvdXJjZSAoZS5nLiB3aGVuXG5cdFx0Ly8gc3dpdGNoaW5nIHNlc3Npb25zIGNsb3Nlcy9kaXNwb3NlcyB0aGUgdGFiKSwgc28ga2VlcCB0aGUgdmlldyBzdGF0ZSBhcm91bmRcblx0XHQvLyBhZnRlciB0aGUgaW5wdXQgaXMgZGlzcG9zZWQgYW5kIHJlc3RvcmUgaXQgd2hlbiB0aGUgZWRpdG9yIHJlb3BlbnMuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdG9FZGl0b3JWaWV3U3RhdGVSZXNvdXJjZShpbnB1dDogRWRpdG9ySW5wdXQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQgPyBpbnB1dC5tdWx0aURpZmZTb3VyY2UgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb2xsYXBzZUFsbERpZmZzKCk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsPy5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0ZXhwYW5kQWxsRGlmZnMoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWw/LmV4cGFuZEFsbCgpO1xuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3TW9kZWw/Lml0ZW1zLnJlYWQodW5kZWZpbmVkKVxuXHRcdFx0LmZpbmQoaSA9PiBpc0VxdWFsKGkubW9kaWZpZWRVcmksIHJlc291cmNlKSB8fCBpc0VxdWFsKGkub3JpZ2luYWxVcmksIHJlc291cmNlKSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZWw/LmNvbGxhcHNlKGl0ZW0pO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZChyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMudmlld01vZGVsPy5pdGVtcy5yZWFkKHVuZGVmaW5lZClcblx0XHRcdC5maW5kKGkgPT4gaXNFcXVhbChpLm1vZGlmaWVkVXJpLCByZXNvdXJjZSkgfHwgaXNFcXVhbChpLm9yaWdpbmFsVXJpLCByZXNvdXJjZSkpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGVsPy5leHBhbmQoaXRlbSk7XG5cdH1cblxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hcHBseU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseU9wdGlvbnMob3B0aW9uczogSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZXZlYWxEYXRhID0gb3B0aW9ucz8udmlld1N0YXRlPy5yZXZlYWxEYXRhO1xuXHRcdGlmICghcmV2ZWFsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLndpZGdldD8ucmV2ZWFsKHJldmVhbERhdGEucmVzb3VyY2UsIHtcblx0XHRcdHJhbmdlOiByZXZlYWxEYXRhLnJhbmdlID8gUmFuZ2UubGlmdChyZXZlYWxEYXRhLnJhbmdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdGhpZ2hsaWdodDogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0ZvY3VzLmNsZWFyKCk7XG5cdFx0Ly8gTGV0IHRoZSBiYXNlIGNhcHR1cmUgdGhlIGN1cnJlbnQgdmlldyBzdGF0ZSAoaXQgcmVhZHMgdGhlIHdpZGdldCkgYmVmb3JlIHRoZVxuXHRcdC8vIHZpZXcgbW9kZWwgaXMgdG9ybiBkb3duLlxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLndpZGdldD8uc2V0Vmlld01vZGVsKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuX3BlbmRpbmdGb2N1cy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy53aWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sID0gd2lkZ2V0LmdldEFjdGl2ZUNvbnRyb2woKTtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0Y29udHJvbC5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhY3RpdmUgZmlsZSdzIGRpZmYgZWRpdG9yIG1heSBub3QgYmUgcmVuZGVyZWQgeWV0IChlLmcuIHRoZSBlZGl0b3Jcblx0XHQvLyBwYXJ0IHdhcyBqdXN0IHJldmVhbGVkIGZyb20gYSBoaWRkZW4gc3RhdGUpLCBzbyBnZXRBY3RpdmVDb250cm9sKCkgaXNcblx0XHQvLyB1bmRlZmluZWQuIEZvY3VzIGl0IGFzIHNvb24gYXMgaXQgYmVjb21lcyBhdmFpbGFibGUuXG5cdFx0dGhpcy5fcGVuZGluZ0ZvY3VzLnZhbHVlID0gd2lkZ2V0Lm9uRGlkQ2hhbmdlQWN0aXZlQ29udHJvbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVDb250cm9sID0gd2lkZ2V0LmdldEFjdGl2ZUNvbnRyb2woKTtcblx0XHRcdGlmIChhY3RpdmVDb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdGb2N1cy5jbGVhcigpO1xuXHRcdFx0XHRhY3RpdmVDb250cm9sLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHQvLyBJbiBzaW5nbGUtcGFuZSB0aGUgaGVhZGVyIGlzIGV4dGVybmFsICh0aGUgZWRpdG9yIHBhcnQgcmVzZXJ2ZXMgYSB0b3AgaW5zZXQpLFxuXHRcdC8vIHNvIHRoZSBkaWZmIGZpbGxzIHRoZSBmdWxsIGRpbWVuc2lvbjsgb3RoZXJ3aXNlIHJlc2VydmUgdGhlIGludGVybmFsIGhlYWRlci5cblx0XHRjb25zdCBib2R5SGVpZ2h0ID0gdGhpcy5fc2luZ2xlUGFuZSA/IGRpbWVuc2lvbi5oZWlnaHQgOiBNYXRoLm1heCgwLCBkaW1lbnNpb24uaGVpZ2h0IC0gSEVBREVSX0hFSUdIVCk7XG5cdFx0dGhpcy53aWRnZXQ/LmxheW91dChuZXcgRGltZW5zaW9uKGRpbWVuc2lvbi53aWR0aCwgYm9keUhlaWdodCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBDSEFOR0VTRVRfUkVWSUVXX0FDVElPTl9JRCA9ICdjaGFuZ2VzZXQucmV2aWV3JztcblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBwZXItZmlsZSBcIk1hcmsgYXMgVmlld2VkXCIgdG9nZ2xlIGluIHRoZSBDaGFuZ2VzIGVkaXRvciBmaWxlIGhlYWRlclxuICogYXMgYSBjaGVja2JveCB3aXRoIGEgc3RhdGljIFwiVmlld2VkXCIgbGFiZWwgKG1pcnJvcmluZyB0aGUgR2l0SHViIHB1bGwgcmVxdWVzdFxuICogXCJWaWV3ZWRcIiBjaGVja2JveCksIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgaWNvbi1vbmx5IHRvb2xiYXIgYnV0dG9uLiBUaGVcbiAqIGNvbW1hbmQncyB0b2dnbGluZyB0aXRsZSAoXCJNYXJrIGFzIFZpZXdlZFwiIC8gXCJNYXJrIGFzIE5vdCBWaWV3ZWRcIikgaXMga2VwdCBhc1xuICogdGhlIGFjY2Vzc2libGUgbmFtZSBzbyB0aGUgYWN0aW9uIGlzIGFubm91bmNlZCwgd2hpbGUgdGhlIGNoZWNrYm94IHN0YXRlXG4gKiBjb252ZXlzIHRoZSByZXZpZXdlZCBzdGF0ZS5cbiAqL1xuY2xhc3MgQ2hhbmdlc2V0UmV2aWV3QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBDaGVja2JveEFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3RvcihhY3Rpb246IE1lbnVJdGVtQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgbGFiZWw6IHRydWUsIGNoZWNrYm94U3R5bGVzOiB7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcywgc2l6ZTogMTQgfSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYW5nZXNldC1yZXZpZXctYWN0aW9uJyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZUNoZWNrZWQoKTtcblxuXHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uLmNoZWNrZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYW5nZXNldC52aWV3ZWQudG9vbHRpcCcsIFwiTWFyayBhcyBOb3QgVmlld2VkXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGFuZ2VzZXQubm90Vmlld2VkLnRvb2x0aXAnLCBcIk1hcmsgYXMgVmlld2VkXCIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsUUFBUSxpQkFBaUI7QUFFckMsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxTQUFTLDRCQUF5Qyx1QkFBdUI7QUFDbEYsU0FBUyxhQUFhO0FBSXRCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JB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
