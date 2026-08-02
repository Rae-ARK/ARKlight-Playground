import { localize, localize2 } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from "../../../common/contributions.js";
import { VIEWLET_ID, ISCMService, VIEW_PANE_ID, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, HISTORY_VIEW_PANE_ID } from "../common/scm.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { SCMActiveResourceContextKeyController, SCMActiveRepositoryController } from "./activity.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ViewContainerLocation, Extensions as ViewContainerExtensions } from "../../../common/views.js";
import { SCMViewPaneContainer } from "./scmViewPaneContainer.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ContextKeys, SCMViewPane } from "./scmViewPane.js";
import { RepositoryPicker } from "./scmViewService.js";
import { SCMRepositoriesViewPane } from "./scmRepositoriesViewPane.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { InlineCompletionContextKeys } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys.js";
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from "../../workspace/common/workspace.js";
import { getActiveElement, isActiveElement } from "../../../../base/browser/dom.js";
import { SCMWorkingSetController } from "./workingSet.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { isSCMRepository } from "./util.js";
import { SCMHistoryViewPane } from "./scmHistoryViewPane.js";
import { RemoteNameContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { SCMAccessibilityHelp } from "./scmAccessibilityHelp.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { SCMHistoryItemContextContribution } from "./scmHistoryChatContext.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
import { SCMInputContextKeys } from "./scmInput.js";
import product from "../../../../platform/product/common/product.js";
ModesRegistry.registerLanguage({
  id: "scminput",
  extensions: [],
  aliases: [],
  // hide from language selector
  mimetypes: ["text/x-scm-input"]
});
const sourceControlViewIcon = registerIcon("source-control-view-icon", Codicon.sourceControl, localize("sourceControlViewIcon", "View icon of the Source Control view."));
const viewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
  id: VIEWLET_ID,
  title: localize2("source control", "Source Control"),
  ctorDescriptor: new SyncDescriptor(SCMViewPaneContainer),
  storageId: "workbench.scm.views.state",
  icon: sourceControlViewIcon,
  alwaysUseContainerInfo: true,
  order: 2,
  hideIfEmpty: true
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
const containerTitle = localize("source control view", "Source Control");
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: localize("no open repo", "No source control providers registered."),
  when: "default"
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: localize("no open repo in an untrusted workspace", "None of the registered source control providers work in Restricted Mode."),
  when: ContextKeyExpr.and(ContextKeyExpr.equals("scm.providerCount", 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: `[${localize("manageWorkspaceTrustAction", "Manage Workspace Trust")}](command:${MANAGE_TRUST_COMMAND_ID})`,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("scm.providerCount", 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(HISTORY_VIEW_PANE_ID, {
  content: localize("no history items", "The selected source control provider does not have any source control history items."),
  when: ContextKeys.SCMHistoryItemCount.isEqualTo(0)
});
viewsRegistry.registerViews([{
  id: REPOSITORIES_VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmRepositories", "Repositories"),
  singleViewPaneContainerTitle: localize("source control repositories", "Source Control Repositories"),
  ctorDescriptor: new SyncDescriptor(SCMRepositoriesViewPane),
  canToggleVisibility: true,
  hideByDefault: true,
  canMoveView: true,
  weight: 20,
  order: 0,
  when: ContextKeyExpr.and(ContextKeyExpr.has("scm.providerCount"), ContextKeyExpr.notEquals("scm.providerCount", 0)),
  // readonly when = ContextKeyExpr.or(ContextKeyExpr.equals('config.scm.alwaysShowProviders', true), ContextKeyExpr.and(ContextKeyExpr.notEquals('scm.providerCount', 0), ContextKeyExpr.notEquals('scm.providerCount', 1)));
  containerIcon: sourceControlViewIcon
}], viewContainer);
viewsRegistry.registerViews([{
  id: VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmChanges", "Changes"),
  singleViewPaneContainerTitle: containerTitle,
  ctorDescriptor: new SyncDescriptor(SCMViewPane),
  canToggleVisibility: true,
  canMoveView: true,
  weight: 40,
  order: 1,
  containerIcon: sourceControlViewIcon,
  openCommandActionDescriptor: {
    id: viewContainer.id,
    mnemonicTitle: localize({ key: "miViewSCM", comment: ["&& denotes a mnemonic"] }, "Source &&Control"),
    keybindings: {
      primary: 0,
      win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG }
    },
    order: 2
  }
}], viewContainer);
viewsRegistry.registerViews([{
  id: HISTORY_VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmGraph", "Graph"),
  singleViewPaneContainerTitle: localize("source control graph", "Source Control Graph"),
  ctorDescriptor: new SyncDescriptor(SCMHistoryViewPane),
  canToggleVisibility: true,
  canMoveView: true,
  weight: 40,
  order: 2,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scm.historyProviderCount"),
    ContextKeyExpr.notEquals("scm.historyProviderCount", 0)
  ),
  containerIcon: sourceControlViewIcon
}], viewContainer);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SCMActiveRepositoryController, LifecyclePhase.Restored);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SCMActiveResourceContextKeyController, LifecyclePhase.Restored);
registerWorkbenchContribution2(
  SCMWorkingSetController.ID,
  SCMWorkingSetController,
  WorkbenchPhase.AfterRestored
);
registerWorkbenchContribution2(
  SCMHistoryItemContextContribution.ID,
  SCMHistoryItemContextContribution,
  WorkbenchPhase.AfterRestored
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "scm",
  order: 5,
  title: localize("scmConfigurationTitle", "Source Control"),
  type: "object",
  scope: ConfigurationScope.RESOURCE,
  properties: {
    "scm.diffDecorations": {
      type: "string",
      enum: ["all", "gutter", "overview", "minimap", "none"],
      enumDescriptions: [
        localize("scm.diffDecorations.all", "Show the diff decorations in all available locations."),
        localize("scm.diffDecorations.gutter", "Show the diff decorations only in the editor gutter."),
        localize("scm.diffDecorations.overviewRuler", "Show the diff decorations only in the overview ruler."),
        localize("scm.diffDecorations.minimap", "Show the diff decorations only in the minimap."),
        localize("scm.diffDecorations.none", "Do not show the diff decorations.")
      ],
      default: "all",
      description: localize("diffDecorations", "Controls diff decorations in the editor.")
    },
    "scm.diffDecorationsGutterWidth": {
      type: "number",
      enum: [1, 2, 3, 4, 5],
      default: 3,
      description: localize("diffGutterWidth", "Controls the width(px) of diff decorations in gutter (added & modified).")
    },
    "scm.diffDecorationsGutterVisibility": {
      type: "string",
      enum: ["always", "hover"],
      enumDescriptions: [
        localize("scm.diffDecorationsGutterVisibility.always", "Show the diff decorator in the gutter at all times."),
        localize("scm.diffDecorationsGutterVisibility.hover", "Show the diff decorator in the gutter only on hover.")
      ],
      description: localize("scm.diffDecorationsGutterVisibility", "Controls the visibility of the Source Control diff decorator in the gutter."),
      default: "always"
    },
    "scm.diffDecorationsGutterAction": {
      type: "string",
      enum: ["diff", "none"],
      enumDescriptions: [
        localize("scm.diffDecorationsGutterAction.diff", "Show the inline diff Peek view on click."),
        localize("scm.diffDecorationsGutterAction.none", "Do nothing.")
      ],
      description: localize("scm.diffDecorationsGutterAction", "Controls the behavior of Source Control diff gutter decorations."),
      default: "diff"
    },
    "scm.diffDecorationsGutterPattern": {
      type: "object",
      description: localize("diffGutterPattern", "Controls whether a pattern is used for the diff decorations in gutter."),
      additionalProperties: false,
      properties: {
        "added": {
          type: "boolean",
          description: localize("diffGutterPatternAdded", "Use pattern for the diff decorations in gutter for added lines.")
        },
        "modified": {
          type: "boolean",
          description: localize("diffGutterPatternModifed", "Use pattern for the diff decorations in gutter for modified lines.")
        }
      },
      default: {
        "added": false,
        "modified": true
      }
    },
    "scm.diffDecorationsIgnoreTrimWhitespace": {
      type: "string",
      enum: ["true", "false", "inherit"],
      enumDescriptions: [
        localize("scm.diffDecorationsIgnoreTrimWhitespace.true", "Ignore leading and trailing whitespace."),
        localize("scm.diffDecorationsIgnoreTrimWhitespace.false", "Do not ignore leading and trailing whitespace."),
        localize("scm.diffDecorationsIgnoreTrimWhitespace.inherit", "Inherit from `diffEditor.ignoreTrimWhitespace`.")
      ],
      description: localize("diffDecorationsIgnoreTrimWhitespace", "Controls whether leading and trailing whitespace is ignored in Source Control diff gutter decorations."),
      default: "false"
    },
    "scm.alwaysShowActions": {
      type: "boolean",
      description: localize("alwaysShowActions", "Controls whether inline actions are always visible in the Source Control view."),
      default: false
    },
    "scm.countBadge": {
      type: "string",
      enum: ["all", "focused", "off"],
      enumDescriptions: [
        localize("scm.countBadge.all", "Show the sum of all Source Control Provider count badges."),
        localize("scm.countBadge.focused", "Show the count badge of the focused Source Control Provider."),
        localize("scm.countBadge.off", "Disable the Source Control count badge.")
      ],
      description: localize("scm.countBadge", "Controls the count badge on the Source Control icon on the Activity Bar."),
      default: "all"
    },
    "scm.providerCountBadge": {
      type: "string",
      enum: ["hidden", "auto", "visible"],
      enumDescriptions: [
        localize("scm.providerCountBadge.hidden", "Hide Source Control Provider count badges."),
        localize("scm.providerCountBadge.auto", "Only show count badge for Source Control Provider when non-zero."),
        localize("scm.providerCountBadge.visible", "Show Source Control Provider count badges.")
      ],
      markdownDescription: localize("scm.providerCountBadge", "Controls the count badges on Source Control Provider headers. These headers appear in the Source Control view when there is more than one provider or when the {0} setting is enabled, and in the Source Control Repositories view.", "`#scm.alwaysShowRepositories#`"),
      default: "hidden"
    },
    "scm.defaultViewMode": {
      type: "string",
      enum: ["tree", "list"],
      enumDescriptions: [
        localize("scm.defaultViewMode.tree", "Show the repository changes as a tree."),
        localize("scm.defaultViewMode.list", "Show the repository changes as a list.")
      ],
      description: localize("scm.defaultViewMode", "Controls the default Source Control repository view mode."),
      default: "list"
    },
    "scm.defaultViewSortKey": {
      type: "string",
      enum: ["name", "path", "status"],
      enumDescriptions: [
        localize("scm.defaultViewSortKey.name", "Sort the repository changes by file name."),
        localize("scm.defaultViewSortKey.path", "Sort the repository changes by path."),
        localize("scm.defaultViewSortKey.status", "Sort the repository changes by Source Control status.")
      ],
      description: localize("scm.defaultViewSortKey", "Controls the default Source Control repository changes sort order when viewed as a list."),
      default: "path"
    },
    "scm.autoReveal": {
      type: "boolean",
      description: localize("autoReveal", "Controls whether the Source Control view should automatically reveal and select files when opening them."),
      default: true
    },
    "scm.inputFontFamily": {
      type: "string",
      markdownDescription: localize("inputFontFamily", "Controls the font for the input message. Use `default` for the workbench user interface font family, `editor` for the `#editor.fontFamily#`'s value, or a custom font family."),
      default: "default"
    },
    "scm.inputFontSize": {
      type: "number",
      markdownDescription: localize("inputFontSize", "Controls the font size for the input message in pixels."),
      default: 13
    },
    "scm.inputMaxLineCount": {
      type: "number",
      markdownDescription: localize("inputMaxLines", "Controls the maximum number of lines that the input will auto-grow to."),
      minimum: 1,
      maximum: 50,
      default: 10
    },
    "scm.inputMinLineCount": {
      type: "number",
      markdownDescription: localize("inputMinLines", "Controls the minimum number of lines that the input will auto-grow from."),
      minimum: 1,
      maximum: 50,
      default: 1
    },
    "scm.alwaysShowRepositories": {
      type: "boolean",
      markdownDescription: localize("alwaysShowRepository", "Controls whether repositories should always be visible in the Source Control view."),
      default: false
    },
    "scm.repositories.sortOrder": {
      type: "string",
      enum: ["discovery time", "name", "path"],
      enumDescriptions: [
        localize("scm.repositoriesSortOrder.discoveryTime", "Repositories in the Source Control Repositories view are sorted by discovery time. Repositories in the Source Control view are sorted in the order that they were selected."),
        localize("scm.repositoriesSortOrder.name", "Repositories in the Source Control Repositories and Source Control views are sorted by repository name."),
        localize("scm.repositoriesSortOrder.path", "Repositories in the Source Control Repositories and Source Control views are sorted by repository path.")
      ],
      description: localize("repositoriesSortOrder", "Controls the sort order of the repositories in the source control repositories view."),
      default: "discovery time"
    },
    "scm.repositories.visible": {
      type: "number",
      description: localize("providersVisible", "Controls how many repositories are visible in the Source Control Repositories section. Set to 0, to be able to manually resize the view."),
      default: 10
    },
    "scm.repositories.selectionMode": {
      type: "string",
      enum: ["multiple", "single"],
      enumDescriptions: [
        localize("scm.repositories.selectionMode.multiple", "Multiple repositories can be selected at the same time."),
        localize("scm.repositories.selectionMode.single", "Only one repository can be selected at a time.")
      ],
      description: localize("scm.repositories.selectionMode", "Controls the selection mode of the repositories in the Source Control Repositories view."),
      default: "multiple"
    },
    "scm.repositories.explorer": {
      type: "boolean",
      markdownDescription: localize("scm.repositories.explorer", "Controls whether to show repository artifacts in the Source Control Repositories view. This feature is experimental and only works when {0} is set to `{1}`.", "`#scm.repositories.selectionMode#`", "single"),
      default: false,
      tags: ["experimental"]
    },
    "scm.showActionButton": {
      type: "boolean",
      markdownDescription: localize("showActionButton", "Controls whether an action button can be shown in the Source Control view."),
      default: true
    },
    "scm.showInputActionButton": {
      type: "boolean",
      markdownDescription: localize("showInputActionButton", "Controls whether an action button can be shown in the Source Control input."),
      default: true
    },
    "scm.workingSets.enabled": {
      type: "boolean",
      description: localize("scm.workingSets.enabled", "Controls whether to store editor working sets when switching between source control history item groups."),
      default: false
    },
    "scm.workingSets.default": {
      type: "string",
      enum: ["empty", "current"],
      enumDescriptions: [
        localize("scm.workingSets.default.empty", "Use an empty working set when switching to a source control history item group that does not have a working set."),
        localize("scm.workingSets.default.current", "Use the current working set when switching to a source control history item group that does not have a working set.")
      ],
      description: localize("scm.workingSets.default", "Controls the default working set to use when switching to a source control history item group that does not have a working set."),
      default: "current"
    },
    "scm.compactFolders": {
      type: "boolean",
      description: localize("scm.compactFolders", "Controls whether the Source Control view should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element."),
      default: true
    },
    "scm.graph.pageOnScroll": {
      type: "boolean",
      description: localize("scm.graph.pageOnScroll", "Controls whether the Source Control Graph view will load the next page of items when you scroll to the end of the list."),
      default: true
    },
    "scm.graph.pageSize": {
      type: "number",
      description: localize("scm.graph.pageSize", "The number of items to show in the Source Control Graph view by default and when loading more items."),
      minimum: 1,
      maximum: 1e3,
      default: 50
    },
    "scm.graph.badges": {
      type: "string",
      enum: ["all", "filter"],
      enumDescriptions: [
        localize("scm.graph.badges.all", "Show badges of all history item groups in the Source Control Graph view."),
        localize("scm.graph.badges.filter", "Show only the badges of history item groups used as a filter in the Source Control Graph view.")
      ],
      description: localize("scm.graph.badges", "Controls which badges are shown in the Source Control Graph view. The badges are shown on the right side of the graph indicating the names of history item groups."),
      default: "filter"
    },
    "scm.graph.showIncomingChanges": {
      type: "boolean",
      description: localize("scm.graph.showIncomingChanges", "Controls whether to show incoming changes in the Source Control Graph view."),
      default: true
    },
    "scm.graph.showOutgoingChanges": {
      type: "boolean",
      description: localize("scm.graph.showOutgoingChanges", "Controls whether to show outgoing changes in the Source Control Graph view."),
      default: true
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.acceptInput",
  metadata: { description: localize("scm accept", "Source Control: Accept Input"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    if (!repositoryId) {
      return Promise.resolve(null);
    }
    const scmService = accessor.get(ISCMService);
    const repository = scmService.getRepository(repositoryId);
    if (!repository?.provider.acceptInputCommand) {
      return Promise.resolve(null);
    }
    const id = repository.provider.acceptInputCommand.id;
    const args = repository.provider.acceptInputCommand.arguments;
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(id, ...args || []);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.clearValidation",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scmRepository"),
    SCMInputContextKeys.SCMInputHasValidationMessage
  ),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const scmViewService = accessor.get(ISCMViewService);
    scmViewService.activeRepository.get()?.repository.input.clearValidation();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.clearInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scmRepository"),
    SuggestContext.Visible.toNegated(),
    InlineCompletionContextKeys.inlineSuggestionVisible.toNegated(),
    SCMInputContextKeys.SCMInputHasValidationMessage.toNegated(),
    EditorContextKeys.hasNonEmptySelection.toNegated()
  ),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const scmService = accessor.get(ISCMService);
    const contextKeyService = accessor.get(IContextKeyService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.setValue("", true);
  }
});
const viewNextCommitCommand = {
  description: { description: localize("scm view next commit", "Source Control: View Next Commit"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const scmService = accessor.get(ISCMService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.showNextHistoryValue();
  }
};
const viewPreviousCommitCommand = {
  description: { description: localize("scm view previous commit", "Source Control: View Previous Commit"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const scmService = accessor.get(ISCMService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.showPreviousHistoryValue();
  }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewNextCommitCommand,
  id: "scm.viewNextCommit",
  when: ContextKeyExpr.and(ContextKeyExpr.has("scmRepository"), ContextKeyExpr.has("scmInputIsInLastPosition"), SuggestContext.Visible.toNegated()),
  primary: KeyCode.DownArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewPreviousCommitCommand,
  id: "scm.viewPreviousCommit",
  when: ContextKeyExpr.and(ContextKeyExpr.has("scmRepository"), ContextKeyExpr.has("scmInputIsInFirstPosition"), SuggestContext.Visible.toNegated()),
  primary: KeyCode.UpArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewNextCommitCommand,
  id: "scm.forceViewNextCommit",
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.Alt | KeyCode.DownArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewPreviousCommitCommand,
  id: "scm.forceViewPreviousCommit",
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.Alt | KeyCode.UpArrow
});
CommandsRegistry.registerCommand("scm.openInIntegratedTerminal", async (accessor, ...providers) => {
  if (!providers || providers.length === 0) {
    return;
  }
  const commandService = accessor.get(ICommandService);
  const listService = accessor.get(IListService);
  let provider = providers.length === 1 ? providers[0] : void 0;
  if (!provider) {
    const list = listService.lastFocusedList;
    const element = list?.getHTMLElement();
    if (list instanceof WorkbenchList && element && isActiveElement(element)) {
      const [index] = list.getFocus();
      const focusedElement = list.element(index);
      if (isSCMRepository(focusedElement)) {
        provider = focusedElement.provider;
      }
    }
  }
  if (!provider?.rootUri) {
    return;
  }
  await commandService.executeCommand("openInIntegratedTerminal", provider.rootUri);
});
CommandsRegistry.registerCommand("scm.openInTerminal", async (accessor, provider) => {
  if (!provider || !provider.rootUri) {
    return;
  }
  const commandService = accessor.get(ICommandService);
  await commandService.executeCommand("openInTerminal", provider.rootUri);
});
CommandsRegistry.registerCommand("scm.setActiveProvider", async (accessor) => {
  const instantiationService = accessor.get(IInstantiationService);
  const scmViewService = accessor.get(ISCMViewService);
  const placeHolder = localize("scmActiveRepositoryPlaceHolder", "Select the active repository, type to filter all repositories");
  const autoQuickItemDescription = localize("scmActiveRepositoryAutoDescription", "The active repository is updated based on active editor");
  const repositoryPicker = instantiationService.createInstance(RepositoryPicker, placeHolder, autoQuickItemDescription);
  const result = await repositoryPicker.pickRepository();
  if (result?.repository) {
    const repository = result.repository !== "auto" ? result.repository : void 0;
    scmViewService.pinActiveRepository(repository);
  }
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
  group: "99_terminal",
  command: {
    id: "scm.openInTerminal",
    title: localize("open in external terminal", "Open in External Terminal")
  },
  when: ContextKeyExpr.and(
    RemoteNameContext.isEqualTo(""),
    ContextKeyExpr.equals("scmProviderHasRootUri", true),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "external"),
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "both")
    )
  )
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
  group: "99_terminal",
  command: {
    id: "scm.openInIntegratedTerminal",
    title: localize("open in integrated terminal", "Open in Integrated Terminal")
  },
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals("scmProviderHasRootUri", true),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "integrated"),
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "both")
    )
  )
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusPreviousInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusPreviousInput();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusNextInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusNextInput();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusPreviousResourceGroup",
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusPreviousResourceGroup();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusNextResourceGroup",
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusNextResourceGroup();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "scm.editor.triggerSetup",
      title: localize("scmEditorResolveMergeConflict", "Resolve Conflicts with AI"),
      icon: Codicon.chatSparkle,
      f1: false,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate(),
          ChatContextKeys.Setup.completed.negate(),
          ContextKeyExpr.in(ResourceContextKey.Resource.key, "git.mergeChanges"),
          ContextKeyExpr.equals("git.activeResourceHasMergeConflicts", true)
        )
      }
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
    if (!result) {
      return;
    }
    const command = product.defaultChatAgent?.resolveMergeConflictsCommand;
    if (!command) {
      return;
    }
    await commandService.executeCommand(command, ...args);
  }
});
AccessibleViewRegistry.register(new SCMAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQsIElTQ01TZXJ2aWNlLCBWSUVXX1BBTkVfSUQsIElTQ01Qcm92aWRlciwgSVNDTVZpZXdTZXJ2aWNlLCBSRVBPU0lUT1JJRVNfVklFV19QQU5FX0lELCBISVNUT1JZX1ZJRVdfUEFORV9JRCB9IGZyb20gJy4uL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU0NNQWN0aXZlUmVzb3VyY2VDb250ZXh0S2V5Q29udHJvbGxlciwgU0NNQWN0aXZlUmVwb3NpdG9yeUNvbnRyb2xsZXIgfSBmcm9tICcuL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBJVmlld3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBTQ01WaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4vc2NtVmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBNb2Rlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5cywgU0NNVmlld1BhbmUgfSBmcm9tICcuL3NjbVZpZXdQYW5lLmpzJztcbmltcG9ydCB7IFJlcG9zaXRvcnlQaWNrZXIgfSBmcm9tICcuL3NjbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNDTVJlcG9zaXRvcmllc1ZpZXdQYW5lIH0gZnJvbSAnLi9zY21SZXBvc2l0b3JpZXNWaWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHQgYXMgU3VnZ2VzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IE1BTkFHRV9UUlVTVF9DT01NQU5EX0lELCBXb3Jrc3BhY2VUcnVzdENvbnRleHQgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVFbGVtZW50LCBpc0FjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFNDTVdvcmtpbmdTZXRDb250cm9sbGVyIH0gZnJvbSAnLi93b3JraW5nU2V0LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1NDTVJlcG9zaXRvcnkgfSBmcm9tICcuL3V0aWwuanMnO1xuaW1wb3J0IHsgU0NNSGlzdG9yeVZpZXdQYW5lIH0gZnJvbSAnLi9zY21IaXN0b3J5Vmlld1BhbmUuanMnO1xuaW1wb3J0IHsgUmVtb3RlTmFtZUNvbnRleHQsIFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU0NNQWNjZXNzaWJpbGl0eUhlbHAgfSBmcm9tICcuL3NjbUFjY2Vzc2liaWxpdHlIZWxwLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTQ01IaXN0b3J5SXRlbUNvbnRleHRDb250cmlidXRpb24gfSBmcm9tICcuL3NjbUhpc3RvcnlDaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX1NVUFBPUlRfQU5PTllNT1VTX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IFNDTUlucHV0Q29udGV4dEtleXMgfSBmcm9tICcuL3NjbUlucHV0LmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuXG5Nb2Rlc1JlZ2lzdHJ5LnJlZ2lzdGVyTGFuZ3VhZ2Uoe1xuXHRpZDogJ3NjbWlucHV0Jyxcblx0ZXh0ZW5zaW9uczogW10sXG5cdGFsaWFzZXM6IFtdLCAvLyBoaWRlIGZyb20gbGFuZ3VhZ2Ugc2VsZWN0b3Jcblx0bWltZXR5cGVzOiBbJ3RleHQveC1zY20taW5wdXQnXVxufSk7XG5cbmNvbnN0IHNvdXJjZUNvbnRyb2xWaWV3SWNvbiA9IHJlZ2lzdGVySWNvbignc291cmNlLWNvbnRyb2wtdmlldy1pY29uJywgQ29kaWNvbi5zb3VyY2VDb250cm9sLCBsb2NhbGl6ZSgnc291cmNlQ29udHJvbFZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgU291cmNlIENvbnRyb2wgdmlldy4nKSk7XG5cbmNvbnN0IHZpZXdDb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0aWQ6IFZJRVdMRVRfSUQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3NvdXJjZSBjb250cm9sJywgJ1NvdXJjZSBDb250cm9sJyksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU0NNVmlld1BhbmVDb250YWluZXIpLFxuXHRzdG9yYWdlSWQ6ICd3b3JrYmVuY2guc2NtLnZpZXdzLnN0YXRlJyxcblx0aWNvbjogc291cmNlQ29udHJvbFZpZXdJY29uLFxuXHRhbHdheXNVc2VDb250YWluZXJJbmZvOiB0cnVlLFxuXHRvcmRlcjogMixcblx0aGlkZUlmRW1wdHk6IHRydWUsXG59LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgeyBkb05vdFJlZ2lzdGVyT3BlbkNvbW1hbmQ6IHRydWUgfSk7XG5cbmNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5jb25zdCBjb250YWluZXJUaXRsZSA9IGxvY2FsaXplKCdzb3VyY2UgY29udHJvbCB2aWV3JywgXCJTb3VyY2UgQ29udHJvbFwiKTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudChWSUVXX1BBTkVfSUQsIHtcblx0Y29udGVudDogbG9jYWxpemUoJ25vIG9wZW4gcmVwbycsIFwiTm8gc291cmNlIGNvbnRyb2wgcHJvdmlkZXJzIHJlZ2lzdGVyZWQuXCIpLFxuXHR3aGVuOiAnZGVmYXVsdCdcbn0pO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KFZJRVdfUEFORV9JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSgnbm8gb3BlbiByZXBvIGluIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UnLCBcIk5vbmUgb2YgdGhlIHJlZ2lzdGVyZWQgc291cmNlIGNvbnRyb2wgcHJvdmlkZXJzIHdvcmsgaW4gUmVzdHJpY3RlZCBNb2RlLlwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnc2NtLnByb3ZpZGVyQ291bnQnLCAwKSwgV29ya3NwYWNlVHJ1c3RDb250ZXh0LklzRW5hYmxlZCwgV29ya3NwYWNlVHJ1c3RDb250ZXh0LklzVHJ1c3RlZC50b05lZ2F0ZWQoKSlcbn0pO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KFZJRVdfUEFORV9JRCwge1xuXHRjb250ZW50OiBgWyR7bG9jYWxpemUoJ21hbmFnZVdvcmtzcGFjZVRydXN0QWN0aW9uJywgXCJNYW5hZ2UgV29ya3NwYWNlIFRydXN0XCIpfV0oY29tbWFuZDoke01BTkFHRV9UUlVTVF9DT01NQU5EX0lEfSlgLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzY20ucHJvdmlkZXJDb3VudCcsIDApLCBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNFbmFibGVkLCBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNUcnVzdGVkLnRvTmVnYXRlZCgpKVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoSElTVE9SWV9WSUVXX1BBTkVfSUQsIHtcblx0Y29udGVudDogbG9jYWxpemUoJ25vIGhpc3RvcnkgaXRlbXMnLCBcIlRoZSBzZWxlY3RlZCBzb3VyY2UgY29udHJvbCBwcm92aWRlciBkb2VzIG5vdCBoYXZlIGFueSBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW1zLlwiKSxcblx0d2hlbjogQ29udGV4dEtleXMuU0NNSGlzdG9yeUl0ZW1Db3VudC5pc0VxdWFsVG8oMClcbn0pO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3tcblx0aWQ6IFJFUE9TSVRPUklFU19WSUVXX1BBTkVfSUQsXG5cdGNvbnRhaW5lclRpdGxlLFxuXHRuYW1lOiBsb2NhbGl6ZTIoJ3NjbVJlcG9zaXRvcmllcycsIFwiUmVwb3NpdG9yaWVzXCIpLFxuXHRzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiBsb2NhbGl6ZSgnc291cmNlIGNvbnRyb2wgcmVwb3NpdG9yaWVzJywgXCJTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXNcIiksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU0NNUmVwb3NpdG9yaWVzVmlld1BhbmUpLFxuXHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRoaWRlQnlEZWZhdWx0OiB0cnVlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0d2VpZ2h0OiAyMCxcblx0b3JkZXI6IDAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ3NjbS5wcm92aWRlckNvdW50JyksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnc2NtLnByb3ZpZGVyQ291bnQnLCAwKSksXG5cdC8vIHJlYWRvbmx5IHdoZW4gPSBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5zY20uYWx3YXlzU2hvd1Byb3ZpZGVycycsIHRydWUpLCBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdzY20ucHJvdmlkZXJDb3VudCcsIDApLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ3NjbS5wcm92aWRlckNvdW50JywgMSkpKTtcblx0Y29udGFpbmVySWNvbjogc291cmNlQ29udHJvbFZpZXdJY29uXG59XSwgdmlld0NvbnRhaW5lcik7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbe1xuXHRpZDogVklFV19QQU5FX0lELFxuXHRjb250YWluZXJUaXRsZSxcblx0bmFtZTogbG9jYWxpemUyKCdzY21DaGFuZ2VzJywgJ0NoYW5nZXMnKSxcblx0c2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZTogY29udGFpbmVyVGl0bGUsXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU0NNVmlld1BhbmUpLFxuXHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0d2VpZ2h0OiA0MCxcblx0b3JkZXI6IDEsXG5cdGNvbnRhaW5lckljb246IHNvdXJjZUNvbnRyb2xWaWV3SWNvbixcblx0b3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yOiB7XG5cdFx0aWQ6IHZpZXdDb250YWluZXIuaWQsXG5cdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVZpZXdTQ00nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU291cmNlICYmQ29udHJvbFwiKSxcblx0XHRrZXliaW5kaW5nczoge1xuXHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5RyB9LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUcgfSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5RyB9LFxuXHRcdH0sXG5cdFx0b3JkZXI6IDIsXG5cdH1cbn1dLCB2aWV3Q29udGFpbmVyKTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt7XG5cdGlkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0Y29udGFpbmVyVGl0bGUsXG5cdG5hbWU6IGxvY2FsaXplMignc2NtR3JhcGgnLCBcIkdyYXBoXCIpLFxuXHRzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiBsb2NhbGl6ZSgnc291cmNlIGNvbnRyb2wgZ3JhcGgnLCBcIlNvdXJjZSBDb250cm9sIEdyYXBoXCIpLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFNDTUhpc3RvcnlWaWV3UGFuZSksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHR3ZWlnaHQ6IDQwLFxuXHRvcmRlcjogMixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENvbnRleHRLZXlFeHByLmhhcygnc2NtLmhpc3RvcnlQcm92aWRlckNvdW50JyksXG5cdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdzY20uaGlzdG9yeVByb3ZpZGVyQ291bnQnLCAwKSxcblx0KSxcblx0Y29udGFpbmVySWNvbjogc291cmNlQ29udHJvbFZpZXdJY29uXG59XSwgdmlld0NvbnRhaW5lcik7XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKVxuXHQucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oU0NNQWN0aXZlUmVwb3NpdG9yeUNvbnRyb2xsZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpXG5cdC5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTQ01BY3RpdmVSZXNvdXJjZUNvbnRleHRLZXlDb250cm9sbGVyLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihcblx0U0NNV29ya2luZ1NldENvbnRyb2xsZXIuSUQsXG5cdFNDTVdvcmtpbmdTZXRDb250cm9sbGVyLFxuXHRXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkXG4pO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdFNDTUhpc3RvcnlJdGVtQ29udGV4dENvbnRyaWJ1dGlvbi5JRCxcblx0U0NNSGlzdG9yeUl0ZW1Db250ZXh0Q29udHJpYnV0aW9uLFxuXHRXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkXG4pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ3NjbScsXG5cdG9yZGVyOiA1LFxuXHR0aXRsZTogbG9jYWxpemUoJ3NjbUNvbmZpZ3VyYXRpb25UaXRsZScsIFwiU291cmNlIENvbnRyb2xcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3NjbS5kaWZmRGVjb3JhdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWxsJywgJ2d1dHRlcicsICdvdmVydmlldycsICdtaW5pbWFwJywgJ25vbmUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnMuYWxsJywgXCJTaG93IHRoZSBkaWZmIGRlY29yYXRpb25zIGluIGFsbCBhdmFpbGFibGUgbG9jYXRpb25zLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnMuZ3V0dGVyJywgXCJTaG93IHRoZSBkaWZmIGRlY29yYXRpb25zIG9ubHkgaW4gdGhlIGVkaXRvciBndXR0ZXIuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9ucy5vdmVydmlld1J1bGVyJywgXCJTaG93IHRoZSBkaWZmIGRlY29yYXRpb25zIG9ubHkgaW4gdGhlIG92ZXJ2aWV3IHJ1bGVyLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnMubWluaW1hcCcsIFwiU2hvdyB0aGUgZGlmZiBkZWNvcmF0aW9ucyBvbmx5IGluIHRoZSBtaW5pbWFwLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnMubm9uZScsIFwiRG8gbm90IHNob3cgdGhlIGRpZmYgZGVjb3JhdGlvbnMuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2FsbCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RpZmZEZWNvcmF0aW9ucycsIFwiQ29udHJvbHMgZGlmZiBkZWNvcmF0aW9ucyBpbiB0aGUgZWRpdG9yLlwiKVxuXHRcdH0sXG5cdFx0J3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJXaWR0aCc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZW51bTogWzEsIDIsIDMsIDQsIDVdLFxuXHRcdFx0ZGVmYXVsdDogMyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlmZkd1dHRlcldpZHRoJywgXCJDb250cm9scyB0aGUgd2lkdGgocHgpIG9mIGRpZmYgZGVjb3JhdGlvbnMgaW4gZ3V0dGVyIChhZGRlZCAmIG1vZGlmaWVkKS5cIilcblx0XHR9LFxuXHRcdCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyVmlzaWJpbGl0eSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbHdheXMnLCAnaG92ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJWaXNpYmlsaXR5LmFsd2F5cycsIFwiU2hvdyB0aGUgZGlmZiBkZWNvcmF0b3IgaW4gdGhlIGd1dHRlciBhdCBhbGwgdGltZXMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclZpc2liaWxpdHkuaG92ZXInLCBcIlNob3cgdGhlIGRpZmYgZGVjb3JhdG9yIGluIHRoZSBndXR0ZXIgb25seSBvbiBob3Zlci5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJWaXNpYmlsaXR5JywgXCJDb250cm9scyB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgU291cmNlIENvbnRyb2wgZGlmZiBkZWNvcmF0b3IgaW4gdGhlIGd1dHRlci5cIiksXG5cdFx0XHRkZWZhdWx0OiAnYWx3YXlzJ1xuXHRcdH0sXG5cdFx0J3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24nOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZGlmZicsICdub25lJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyQWN0aW9uLmRpZmYnLCBcIlNob3cgdGhlIGlubGluZSBkaWZmIFBlZWsgdmlldyBvbiBjbGljay5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyQWN0aW9uLm5vbmUnLCBcIkRvIG5vdGhpbmcuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyQWN0aW9uJywgXCJDb250cm9scyB0aGUgYmVoYXZpb3Igb2YgU291cmNlIENvbnRyb2wgZGlmZiBndXR0ZXIgZGVjb3JhdGlvbnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RpZmYnXG5cdFx0fSxcblx0XHQnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclBhdHRlcm4nOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlmZkd1dHRlclBhdHRlcm4nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBwYXR0ZXJuIGlzIHVzZWQgZm9yIHRoZSBkaWZmIGRlY29yYXRpb25zIGluIGd1dHRlci5cIiksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdhZGRlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmR3V0dGVyUGF0dGVybkFkZGVkJywgXCJVc2UgcGF0dGVybiBmb3IgdGhlIGRpZmYgZGVjb3JhdGlvbnMgaW4gZ3V0dGVyIGZvciBhZGRlZCBsaW5lcy5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdtb2RpZmllZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmR3V0dGVyUGF0dGVybk1vZGlmZWQnLCBcIlVzZSBwYXR0ZXJuIGZvciB0aGUgZGlmZiBkZWNvcmF0aW9ucyBpbiBndXR0ZXIgZm9yIG1vZGlmaWVkIGxpbmVzLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdhZGRlZCc6IGZhbHNlLFxuXHRcdFx0XHQnbW9kaWZpZWQnOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnc2NtLmRpZmZEZWNvcmF0aW9uc0lnbm9yZVRyaW1XaGl0ZXNwYWNlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3RydWUnLCAnZmFsc2UnLCAnaW5oZXJpdCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0lnbm9yZVRyaW1XaGl0ZXNwYWNlLnRydWUnLCBcIklnbm9yZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNJZ25vcmVUcmltV2hpdGVzcGFjZS5mYWxzZScsIFwiRG8gbm90IGlnbm9yZSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNJZ25vcmVUcmltV2hpdGVzcGFjZS5pbmhlcml0JywgXCJJbmhlcml0IGZyb20gYGRpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2VgLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlmZkRlY29yYXRpb25zSWdub3JlVHJpbVdoaXRlc3BhY2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSBpcyBpZ25vcmVkIGluIFNvdXJjZSBDb250cm9sIGRpZmYgZ3V0dGVyIGRlY29yYXRpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdmYWxzZSdcblx0XHR9LFxuXHRcdCdzY20uYWx3YXlzU2hvd0FjdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Fsd2F5c1Nob3dBY3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIGlubGluZSBhY3Rpb25zIGFyZSBhbHdheXMgdmlzaWJsZSBpbiB0aGUgU291cmNlIENvbnRyb2wgdmlldy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NjbS5jb3VudEJhZGdlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2FsbCcsICdmb2N1c2VkJywgJ29mZiddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmNvdW50QmFkZ2UuYWxsJywgXCJTaG93IHRoZSBzdW0gb2YgYWxsIFNvdXJjZSBDb250cm9sIFByb3ZpZGVyIGNvdW50IGJhZGdlcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uY291bnRCYWRnZS5mb2N1c2VkJywgXCJTaG93IHRoZSBjb3VudCBiYWRnZSBvZiB0aGUgZm9jdXNlZCBTb3VyY2UgQ29udHJvbCBQcm92aWRlci5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uY291bnRCYWRnZS5vZmYnLCBcIkRpc2FibGUgdGhlIFNvdXJjZSBDb250cm9sIGNvdW50IGJhZGdlLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmNvdW50QmFkZ2UnLCBcIkNvbnRyb2xzIHRoZSBjb3VudCBiYWRnZSBvbiB0aGUgU291cmNlIENvbnRyb2wgaWNvbiBvbiB0aGUgQWN0aXZpdHkgQmFyLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdhbGwnXG5cdFx0fSxcblx0XHQnc2NtLnByb3ZpZGVyQ291bnRCYWRnZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWRkZW4nLCAnYXV0bycsICd2aXNpYmxlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucHJvdmlkZXJDb3VudEJhZGdlLmhpZGRlbicsIFwiSGlkZSBTb3VyY2UgQ29udHJvbCBQcm92aWRlciBjb3VudCBiYWRnZXMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnByb3ZpZGVyQ291bnRCYWRnZS5hdXRvJywgXCJPbmx5IHNob3cgY291bnQgYmFkZ2UgZm9yIFNvdXJjZSBDb250cm9sIFByb3ZpZGVyIHdoZW4gbm9uLXplcm8uXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnByb3ZpZGVyQ291bnRCYWRnZS52aXNpYmxlJywgXCJTaG93IFNvdXJjZSBDb250cm9sIFByb3ZpZGVyIGNvdW50IGJhZGdlcy5cIilcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLnByb3ZpZGVyQ291bnRCYWRnZScsIFwiQ29udHJvbHMgdGhlIGNvdW50IGJhZGdlcyBvbiBTb3VyY2UgQ29udHJvbCBQcm92aWRlciBoZWFkZXJzLiBUaGVzZSBoZWFkZXJzIGFwcGVhciBpbiB0aGUgU291cmNlIENvbnRyb2wgdmlldyB3aGVuIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgcHJvdmlkZXIgb3Igd2hlbiB0aGUgezB9IHNldHRpbmcgaXMgZW5hYmxlZCwgYW5kIGluIHRoZSBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXMgdmlldy5cIiwgJ1xcYCNzY20uYWx3YXlzU2hvd1JlcG9zaXRvcmllcyNcXGAnKSxcblx0XHRcdGRlZmF1bHQ6ICdoaWRkZW4nXG5cdFx0fSxcblx0XHQnc2NtLmRlZmF1bHRWaWV3TW9kZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWyd0cmVlJywgJ2xpc3QnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld01vZGUudHJlZScsIFwiU2hvdyB0aGUgcmVwb3NpdG9yeSBjaGFuZ2VzIGFzIGEgdHJlZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdNb2RlLmxpc3QnLCBcIlNob3cgdGhlIHJlcG9zaXRvcnkgY2hhbmdlcyBhcyBhIGxpc3QuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdNb2RlJywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBTb3VyY2UgQ29udHJvbCByZXBvc2l0b3J5IHZpZXcgbW9kZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnbGlzdCdcblx0XHR9LFxuXHRcdCdzY20uZGVmYXVsdFZpZXdTb3J0S2V5Jzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ25hbWUnLCAncGF0aCcsICdzdGF0dXMnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld1NvcnRLZXkubmFtZScsIFwiU29ydCB0aGUgcmVwb3NpdG9yeSBjaGFuZ2VzIGJ5IGZpbGUgbmFtZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdTb3J0S2V5LnBhdGgnLCBcIlNvcnQgdGhlIHJlcG9zaXRvcnkgY2hhbmdlcyBieSBwYXRoLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld1NvcnRLZXkuc3RhdHVzJywgXCJTb3J0IHRoZSByZXBvc2l0b3J5IGNoYW5nZXMgYnkgU291cmNlIENvbnRyb2wgc3RhdHVzLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmRlZmF1bHRWaWV3U29ydEtleScsIFwiQ29udHJvbHMgdGhlIGRlZmF1bHQgU291cmNlIENvbnRyb2wgcmVwb3NpdG9yeSBjaGFuZ2VzIHNvcnQgb3JkZXIgd2hlbiB2aWV3ZWQgYXMgYSBsaXN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdwYXRoJ1xuXHRcdH0sXG5cdFx0J3NjbS5hdXRvUmV2ZWFsJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvUmV2ZWFsJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBTb3VyY2UgQ29udHJvbCB2aWV3IHNob3VsZCBhdXRvbWF0aWNhbGx5IHJldmVhbCBhbmQgc2VsZWN0IGZpbGVzIHdoZW4gb3BlbmluZyB0aGVtLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzY20uaW5wdXRGb250RmFtaWx5Jzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5wdXRGb250RmFtaWx5JywgXCJDb250cm9scyB0aGUgZm9udCBmb3IgdGhlIGlucHV0IG1lc3NhZ2UuIFVzZSBgZGVmYXVsdGAgZm9yIHRoZSB3b3JrYmVuY2ggdXNlciBpbnRlcmZhY2UgZm9udCBmYW1pbHksIGBlZGl0b3JgIGZvciB0aGUgYCNlZGl0b3IuZm9udEZhbWlseSNgJ3MgdmFsdWUsIG9yIGEgY3VzdG9tIGZvbnQgZmFtaWx5LlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0J1xuXHRcdH0sXG5cdFx0J3NjbS5pbnB1dEZvbnRTaXplJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5wdXRGb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIGlucHV0IG1lc3NhZ2UgaW4gcGl4ZWxzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IDEzXG5cdFx0fSxcblx0XHQnc2NtLmlucHV0TWF4TGluZUNvdW50Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5wdXRNYXhMaW5lcycsIFwiQ29udHJvbHMgdGhlIG1heGltdW0gbnVtYmVyIG9mIGxpbmVzIHRoYXQgdGhlIGlucHV0IHdpbGwgYXV0by1ncm93IHRvLlwiKSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0XHRtYXhpbXVtOiA1MCxcblx0XHRcdGRlZmF1bHQ6IDEwXG5cdFx0fSxcblx0XHQnc2NtLmlucHV0TWluTGluZUNvdW50Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5wdXRNaW5MaW5lcycsIFwiQ29udHJvbHMgdGhlIG1pbmltdW0gbnVtYmVyIG9mIGxpbmVzIHRoYXQgdGhlIGlucHV0IHdpbGwgYXV0by1ncm93IGZyb20uXCIpLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHRcdG1heGltdW06IDUwLFxuXHRcdFx0ZGVmYXVsdDogMVxuXHRcdH0sXG5cdFx0J3NjbS5hbHdheXNTaG93UmVwb3NpdG9yaWVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Fsd2F5c1Nob3dSZXBvc2l0b3J5JywgXCJDb250cm9scyB3aGV0aGVyIHJlcG9zaXRvcmllcyBzaG91bGQgYWx3YXlzIGJlIHZpc2libGUgaW4gdGhlIFNvdXJjZSBDb250cm9sIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzY20ucmVwb3NpdG9yaWVzLnNvcnRPcmRlcic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkaXNjb3ZlcnkgdGltZScsICduYW1lJywgJ3BhdGgnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5yZXBvc2l0b3JpZXNTb3J0T3JkZXIuZGlzY292ZXJ5VGltZScsIFwiUmVwb3NpdG9yaWVzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXMgdmlldyBhcmUgc29ydGVkIGJ5IGRpc2NvdmVyeSB0aW1lLiBSZXBvc2l0b3JpZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIHZpZXcgYXJlIHNvcnRlZCBpbiB0aGUgb3JkZXIgdGhhdCB0aGV5IHdlcmUgc2VsZWN0ZWQuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllc1NvcnRPcmRlci5uYW1lJywgXCJSZXBvc2l0b3JpZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyBhbmQgU291cmNlIENvbnRyb2wgdmlld3MgYXJlIHNvcnRlZCBieSByZXBvc2l0b3J5IG5hbWUuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllc1NvcnRPcmRlci5wYXRoJywgXCJSZXBvc2l0b3JpZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyBhbmQgU291cmNlIENvbnRyb2wgdmlld3MgYXJlIHNvcnRlZCBieSByZXBvc2l0b3J5IHBhdGguXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZXBvc2l0b3JpZXNTb3J0T3JkZXInLCBcIkNvbnRyb2xzIHRoZSBzb3J0IG9yZGVyIG9mIHRoZSByZXBvc2l0b3JpZXMgaW4gdGhlIHNvdXJjZSBjb250cm9sIHJlcG9zaXRvcmllcyB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdkaXNjb3ZlcnkgdGltZSdcblx0XHR9LFxuXHRcdCdzY20ucmVwb3NpdG9yaWVzLnZpc2libGUnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvdmlkZXJzVmlzaWJsZScsIFwiQ29udHJvbHMgaG93IG1hbnkgcmVwb3NpdG9yaWVzIGFyZSB2aXNpYmxlIGluIHRoZSBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXMgc2VjdGlvbi4gU2V0IHRvIDAsIHRvIGJlIGFibGUgdG8gbWFudWFsbHkgcmVzaXplIHRoZSB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IDEwXG5cdFx0fSxcblx0XHQnc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ211bHRpcGxlJywgJ3NpbmdsZSddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlLm11bHRpcGxlJywgXCJNdWx0aXBsZSByZXBvc2l0b3JpZXMgY2FuIGJlIHNlbGVjdGVkIGF0IHRoZSBzYW1lIHRpbWUuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlLnNpbmdsZScsIFwiT25seSBvbmUgcmVwb3NpdG9yeSBjYW4gYmUgc2VsZWN0ZWQgYXQgYSB0aW1lLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlJywgXCJDb250cm9scyB0aGUgc2VsZWN0aW9uIG1vZGUgb2YgdGhlIHJlcG9zaXRvcmllcyBpbiB0aGUgU291cmNlIENvbnRyb2wgUmVwb3NpdG9yaWVzIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ211bHRpcGxlJ1xuXHRcdH0sXG5cdFx0J3NjbS5yZXBvc2l0b3JpZXMuZXhwbG9yZXInOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllcy5leHBsb3JlcicsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IHJlcG9zaXRvcnkgYXJ0aWZhY3RzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXMgdmlldy4gVGhpcyBmZWF0dXJlIGlzIGV4cGVyaW1lbnRhbCBhbmQgb25seSB3b3JrcyB3aGVuIHswfSBpcyBzZXQgdG8gYHsxfWAuXCIsICdcXGAjc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlI1xcYCcsICdzaW5nbGUnKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0J3NjbS5zaG93QWN0aW9uQnV0dG9uJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Nob3dBY3Rpb25CdXR0b24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW4gYWN0aW9uIGJ1dHRvbiBjYW4gYmUgc2hvd24gaW4gdGhlIFNvdXJjZSBDb250cm9sIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J3NjbS5zaG93SW5wdXRBY3Rpb25CdXR0b24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hvd0lucHV0QWN0aW9uQnV0dG9uJywgXCJDb250cm9scyB3aGV0aGVyIGFuIGFjdGlvbiBidXR0b24gY2FuIGJlIHNob3duIGluIHRoZSBTb3VyY2UgQ29udHJvbCBpbnB1dC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnc2NtLndvcmtpbmdTZXRzLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS53b3JraW5nU2V0cy5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHN0b3JlIGVkaXRvciB3b3JraW5nIHNldHMgd2hlbiBzd2l0Y2hpbmcgYmV0d2VlbiBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW0gZ3JvdXBzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHQnc2NtLndvcmtpbmdTZXRzLmRlZmF1bHQnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZW1wdHknLCAnY3VycmVudCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLndvcmtpbmdTZXRzLmRlZmF1bHQuZW1wdHknLCBcIlVzZSBhbiBlbXB0eSB3b3JraW5nIHNldCB3aGVuIHN3aXRjaGluZyB0byBhIHNvdXJjZSBjb250cm9sIGhpc3RvcnkgaXRlbSBncm91cCB0aGF0IGRvZXMgbm90IGhhdmUgYSB3b3JraW5nIHNldC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ud29ya2luZ1NldHMuZGVmYXVsdC5jdXJyZW50JywgXCJVc2UgdGhlIGN1cnJlbnQgd29ya2luZyBzZXQgd2hlbiBzd2l0Y2hpbmcgdG8gYSBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW0gZ3JvdXAgdGhhdCBkb2VzIG5vdCBoYXZlIGEgd29ya2luZyBzZXQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20ud29ya2luZ1NldHMuZGVmYXVsdCcsIFwiQ29udHJvbHMgdGhlIGRlZmF1bHQgd29ya2luZyBzZXQgdG8gdXNlIHdoZW4gc3dpdGNoaW5nIHRvIGEgc291cmNlIGNvbnRyb2wgaGlzdG9yeSBpdGVtIGdyb3VwIHRoYXQgZG9lcyBub3QgaGF2ZSBhIHdvcmtpbmcgc2V0LlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdjdXJyZW50J1xuXHRcdH0sXG5cdFx0J3NjbS5jb21wYWN0Rm9sZGVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmNvbXBhY3RGb2xkZXJzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBTb3VyY2UgQ29udHJvbCB2aWV3IHNob3VsZCByZW5kZXIgZm9sZGVycyBpbiBhIGNvbXBhY3QgZm9ybS4gSW4gc3VjaCBhIGZvcm0sIHNpbmdsZSBjaGlsZCBmb2xkZXJzIHdpbGwgYmUgY29tcHJlc3NlZCBpbiBhIGNvbWJpbmVkIHRyZWUgZWxlbWVudC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnc2NtLmdyYXBoLnBhZ2VPblNjcm9sbCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmdyYXBoLnBhZ2VPblNjcm9sbCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgU291cmNlIENvbnRyb2wgR3JhcGggdmlldyB3aWxsIGxvYWQgdGhlIG5leHQgcGFnZSBvZiBpdGVtcyB3aGVuIHlvdSBzY3JvbGwgdG8gdGhlIGVuZCBvZiB0aGUgbGlzdC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnc2NtLmdyYXBoLnBhZ2VTaXplJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS5ncmFwaC5wYWdlU2l6ZScsIFwiVGhlIG51bWJlciBvZiBpdGVtcyB0byBzaG93IGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3IGJ5IGRlZmF1bHQgYW5kIHdoZW4gbG9hZGluZyBtb3JlIGl0ZW1zLlwiKSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0XHRtYXhpbXVtOiAxMDAwLFxuXHRcdFx0ZGVmYXVsdDogNTBcblx0XHR9LFxuXHRcdCdzY20uZ3JhcGguYmFkZ2VzJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2FsbCcsICdmaWx0ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5ncmFwaC5iYWRnZXMuYWxsJywgXCJTaG93IGJhZGdlcyBvZiBhbGwgaGlzdG9yeSBpdGVtIGdyb3VwcyBpbiB0aGUgU291cmNlIENvbnRyb2wgR3JhcGggdmlldy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZ3JhcGguYmFkZ2VzLmZpbHRlcicsIFwiU2hvdyBvbmx5IHRoZSBiYWRnZXMgb2YgaGlzdG9yeSBpdGVtIGdyb3VwcyB1c2VkIGFzIGEgZmlsdGVyIGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3LlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmdyYXBoLmJhZGdlcycsIFwiQ29udHJvbHMgd2hpY2ggYmFkZ2VzIGFyZSBzaG93biBpbiB0aGUgU291cmNlIENvbnRyb2wgR3JhcGggdmlldy4gVGhlIGJhZGdlcyBhcmUgc2hvd24gb24gdGhlIHJpZ2h0IHNpZGUgb2YgdGhlIGdyYXBoIGluZGljYXRpbmcgdGhlIG5hbWVzIG9mIGhpc3RvcnkgaXRlbSBncm91cHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2ZpbHRlcidcblx0XHR9LFxuXHRcdCdzY20uZ3JhcGguc2hvd0luY29taW5nQ2hhbmdlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmdyYXBoLnNob3dJbmNvbWluZ0NoYW5nZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBpbmNvbWluZyBjaGFuZ2VzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzY20uZ3JhcGguc2hvd091dGdvaW5nQ2hhbmdlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmdyYXBoLnNob3dPdXRnb2luZ0NoYW5nZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBvdXRnb2luZyBjaGFuZ2VzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdzY20uYWNjZXB0SW5wdXQnLFxuXHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbSBhY2NlcHQnLCBcIlNvdXJjZSBDb250cm9sOiBBY2NlcHQgSW5wdXRcIiksIGFyZ3M6IFtdIH0sXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ3NjbVJlcG9zaXRvcnknKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlJZCA9IGNvbnRleHQuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUmVwb3NpdG9yeScpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5SWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NtU2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNU2VydmljZSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHNjbVNlcnZpY2UuZ2V0UmVwb3NpdG9yeShyZXBvc2l0b3J5SWQpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5Py5wcm92aWRlci5hY2NlcHRJbnB1dENvbW1hbmQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSByZXBvc2l0b3J5LnByb3ZpZGVyLmFjY2VwdElucHV0Q29tbWFuZC5pZDtcblx0XHRjb25zdCBhcmdzID0gcmVwb3NpdG9yeS5wcm92aWRlci5hY2NlcHRJbnB1dENvbW1hbmQuYXJndW1lbnRzO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoaWQsIC4uLihhcmdzIHx8IFtdKSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdzY20uY2xlYXJWYWxpZGF0aW9uJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ3NjbVJlcG9zaXRvcnknKSxcblx0XHRTQ01JbnB1dENvbnRleHRLZXlzLlNDTUlucHV0SGFzVmFsaWRhdGlvbk1lc3NhZ2UpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgc2NtVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNDTVZpZXdTZXJ2aWNlKTtcblx0XHRzY21WaWV3U2VydmljZS5hY3RpdmVSZXBvc2l0b3J5LmdldCgpPy5yZXBvc2l0b3J5LmlucHV0LmNsZWFyVmFsaWRhdGlvbigpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnc2NtLmNsZWFySW5wdXQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLFxuXHRcdFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0SW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZVN1Z2dlc3Rpb25WaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFNDTUlucHV0Q29udGV4dEtleXMuU0NNSW5wdXRIYXNWYWxpZGF0aW9uTWVzc2FnZS50b05lZ2F0ZWQoKSxcblx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbi50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBzY21TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01TZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRjb25zdCByZXBvc2l0b3J5SWQgPSBjb250ZXh0LmdldFZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ3NjbVJlcG9zaXRvcnknKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gcmVwb3NpdG9yeUlkID8gc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KHJlcG9zaXRvcnlJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmVwb3NpdG9yeT8uaW5wdXQuc2V0VmFsdWUoJycsIHRydWUpO1xuXHR9XG59KTtcblxuY29uc3Qgdmlld05leHRDb21taXRDb21tYW5kID0ge1xuXHRkZXNjcmlwdGlvbjogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbSB2aWV3IG5leHQgY29tbWl0JywgXCJTb3VyY2UgQ29udHJvbDogVmlldyBOZXh0IENvbW1pdFwiKSwgYXJnczogW10gfSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtU2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRjb25zdCByZXBvc2l0b3J5SWQgPSBjb250ZXh0LmdldFZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ3NjbVJlcG9zaXRvcnknKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gcmVwb3NpdG9yeUlkID8gc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KHJlcG9zaXRvcnlJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmVwb3NpdG9yeT8uaW5wdXQuc2hvd05leHRIaXN0b3J5VmFsdWUoKTtcblx0fVxufTtcblxuY29uc3Qgdmlld1ByZXZpb3VzQ29tbWl0Q29tbWFuZCA9IHtcblx0ZGVzY3JpcHRpb246IHsgZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20gdmlldyBwcmV2aW91cyBjb21taXQnLCBcIlNvdXJjZSBDb250cm9sOiBWaWV3IFByZXZpb3VzIENvbW1pdFwiKSwgYXJnczogW10gfSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtU2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRjb25zdCByZXBvc2l0b3J5SWQgPSBjb250ZXh0LmdldFZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ3NjbVJlcG9zaXRvcnknKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gcmVwb3NpdG9yeUlkID8gc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KHJlcG9zaXRvcnlJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmVwb3NpdG9yeT8uaW5wdXQuc2hvd1ByZXZpb3VzSGlzdG9yeVZhbHVlKCk7XG5cdH1cbn07XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHQuLi52aWV3TmV4dENvbW1pdENvbW1hbmQsXG5cdGlkOiAnc2NtLnZpZXdOZXh0Q29tbWl0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLCBDb250ZXh0S2V5RXhwci5oYXMoJ3NjbUlucHV0SXNJbkxhc3RQb3NpdGlvbicpLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3dcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0Li4udmlld1ByZXZpb3VzQ29tbWl0Q29tbWFuZCxcblx0aWQ6ICdzY20udmlld1ByZXZpb3VzQ29tbWl0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLCBDb250ZXh0S2V5RXhwci5oYXMoJ3NjbUlucHV0SXNJbkZpcnN0UG9zaXRpb24nKSwgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvd1xufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHQuLi52aWV3TmV4dENvbW1pdENvbW1hbmQsXG5cdGlkOiAnc2NtLmZvcmNlVmlld05leHRDb21taXQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ3NjbVJlcG9zaXRvcnknKSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdC4uLnZpZXdQcmV2aW91c0NvbW1pdENvbW1hbmQsXG5cdGlkOiAnc2NtLmZvcmNlVmlld1ByZXZpb3VzQ29tbWl0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdzY21SZXBvc2l0b3J5JyksXG5cdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3dcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnc2NtLm9wZW5JbkludGVncmF0ZWRUZXJtaW5hbCcsIGFzeW5jIChhY2Nlc3NvciwgLi4ucHJvdmlkZXJzOiBJU0NNUHJvdmlkZXJbXSkgPT4ge1xuXHRpZiAoIXByb3ZpZGVycyB8fCBwcm92aWRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblxuXHRsZXQgcHJvdmlkZXIgPSBwcm92aWRlcnMubGVuZ3RoID09PSAxID8gcHJvdmlkZXJzWzBdIDogdW5kZWZpbmVkO1xuXG5cdGlmICghcHJvdmlkZXIpIHtcblx0XHRjb25zdCBsaXN0ID0gbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBsaXN0Py5nZXRIVE1MRWxlbWVudCgpO1xuXG5cdFx0aWYgKGxpc3QgaW5zdGFuY2VvZiBXb3JrYmVuY2hMaXN0ICYmIGVsZW1lbnQgJiYgaXNBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBbaW5kZXhdID0gbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSBsaXN0LmVsZW1lbnQoaW5kZXgpO1xuXG5cdFx0XHQvLyBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXNcblx0XHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHRcdHByb3ZpZGVyID0gZm9jdXNlZEVsZW1lbnQucHJvdmlkZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFwcm92aWRlcj8ucm9vdFVyaSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdvcGVuSW5JbnRlZ3JhdGVkVGVybWluYWwnLCBwcm92aWRlci5yb290VXJpKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnc2NtLm9wZW5JblRlcm1pbmFsJywgYXN5bmMgKGFjY2Vzc29yLCBwcm92aWRlcjogSVNDTVByb3ZpZGVyKSA9PiB7XG5cdGlmICghcHJvdmlkZXIgfHwgIXByb3ZpZGVyLnJvb3RVcmkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnb3BlbkluVGVybWluYWwnLCBwcm92aWRlci5yb290VXJpKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnc2NtLnNldEFjdGl2ZVByb3ZpZGVyJywgYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHNjbVZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01WaWV3U2VydmljZSk7XG5cblx0Y29uc3QgcGxhY2VIb2xkZXIgPSBsb2NhbGl6ZSgnc2NtQWN0aXZlUmVwb3NpdG9yeVBsYWNlSG9sZGVyJywgXCJTZWxlY3QgdGhlIGFjdGl2ZSByZXBvc2l0b3J5LCB0eXBlIHRvIGZpbHRlciBhbGwgcmVwb3NpdG9yaWVzXCIpO1xuXHRjb25zdCBhdXRvUXVpY2tJdGVtRGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnc2NtQWN0aXZlUmVwb3NpdG9yeUF1dG9EZXNjcmlwdGlvbicsIFwiVGhlIGFjdGl2ZSByZXBvc2l0b3J5IGlzIHVwZGF0ZWQgYmFzZWQgb24gYWN0aXZlIGVkaXRvclwiKTtcblx0Y29uc3QgcmVwb3NpdG9yeVBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcG9zaXRvcnlQaWNrZXIsIHBsYWNlSG9sZGVyLCBhdXRvUXVpY2tJdGVtRGVzY3JpcHRpb24pO1xuXG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlcG9zaXRvcnlQaWNrZXIucGlja1JlcG9zaXRvcnkoKTtcblx0aWYgKHJlc3VsdD8ucmVwb3NpdG9yeSkge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSByZXN1bHQucmVwb3NpdG9yeSAhPT0gJ2F1dG8nID8gcmVzdWx0LnJlcG9zaXRvcnkgOiB1bmRlZmluZWQ7XG5cdFx0c2NtVmlld1NlcnZpY2UucGluQWN0aXZlUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuU0NNU291cmNlQ29udHJvbCwge1xuXHRncm91cDogJzk5X3Rlcm1pbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnc2NtLm9wZW5JblRlcm1pbmFsJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ29wZW4gaW4gZXh0ZXJuYWwgdGVybWluYWwnLCBcIk9wZW4gaW4gRXh0ZXJuYWwgVGVybWluYWxcIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFJlbW90ZU5hbWVDb250ZXh0LmlzRXF1YWxUbygnJyksXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdzY21Qcm92aWRlckhhc1Jvb3RVcmknLCB0cnVlKSxcblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlcm1pbmFsLnNvdXJjZUNvbnRyb2xSZXBvc2l0b3JpZXNLaW5kJywgJ2V4dGVybmFsJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXJtaW5hbC5zb3VyY2VDb250cm9sUmVwb3NpdG9yaWVzS2luZCcsICdib3RoJykpKVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuU0NNU291cmNlQ29udHJvbCwge1xuXHRncm91cDogJzk5X3Rlcm1pbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnc2NtLm9wZW5JbkludGVncmF0ZWRUZXJtaW5hbCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdvcGVuIGluIGludGVncmF0ZWQgdGVybWluYWwnLCBcIk9wZW4gaW4gSW50ZWdyYXRlZCBUZXJtaW5hbFwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdzY21Qcm92aWRlckhhc1Jvb3RVcmknLCB0cnVlKSxcblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlcm1pbmFsLnNvdXJjZUNvbnRyb2xSZXBvc2l0b3JpZXNLaW5kJywgJ2ludGVncmF0ZWQnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlcm1pbmFsLnNvdXJjZUNvbnRyb2xSZXBvc2l0b3JpZXNLaW5kJywgJ2JvdGgnKSkpXG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZm9jdXNQcmV2aW91c0lucHV0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlzLlJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnQubm90RXF1YWxzVG8oMCksXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtVmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxTQ01WaWV3UGFuZT4oVklFV19QQU5FX0lEKTtcblx0XHRpZiAoc2NtVmlldykge1xuXHRcdFx0c2NtVmlldy5mb2N1c1ByZXZpb3VzSW5wdXQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5mb2N1c05leHRJbnB1dCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5cy5SZXBvc2l0b3J5VmlzaWJpbGl0eUNvdW50Lm5vdEVxdWFsc1RvKDApLFxuXHRoYW5kbGVyOiBhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNjbVZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXc8U0NNVmlld1BhbmU+KFZJRVdfUEFORV9JRCk7XG5cdFx0aWYgKHNjbVZpZXcpIHtcblx0XHRcdHNjbVZpZXcuZm9jdXNOZXh0SW5wdXQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5mb2N1c1ByZXZpb3VzUmVzb3VyY2VHcm91cCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRoYW5kbGVyOiBhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNjbVZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXc8U0NNVmlld1BhbmU+KFZJRVdfUEFORV9JRCk7XG5cdFx0aWYgKHNjbVZpZXcpIHtcblx0XHRcdHNjbVZpZXcuZm9jdXNQcmV2aW91c1Jlc291cmNlR3JvdXAoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5mb2N1c05leHRSZXNvdXJjZUdyb3VwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtVmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxTQ01WaWV3UGFuZT4oVklFV19QQU5FX0lEKTtcblx0XHRpZiAoc2NtVmlldykge1xuXHRcdFx0c2NtVmlldy5mb2N1c05leHRSZXNvdXJjZUdyb3VwKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2NtLmVkaXRvci50cmlnZ2VyU2V0dXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzY21FZGl0b3JSZXNvbHZlTWVyZ2VDb25mbGljdCcsIFwiUmVzb2x2ZSBDb25mbGljdHMgd2l0aCBBSVwiKSxcblx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5pbihSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2Uua2V5LCAnZ2l0Lm1lcmdlQ2hhbmdlcycpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnZ2l0LmFjdGl2ZVJlc291cmNlSGFzTWVyZ2VDb25mbGljdHMnLCB0cnVlKVxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX1NFVFVQX1NVUFBPUlRfQU5PTllNT1VTX0FDVElPTl9JRCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5yZXNvbHZlTWVyZ2VDb25mbGljdHNDb21tYW5kO1xuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQsIC4uLmFyZ3MpO1xuXHR9XG59KTtcblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgU0NNQWNjZXNzaWJpbGl0eUhlbHAoKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTBDLGdDQUFnQyxjQUFjLHFCQUFxQixzQkFBc0I7QUFDbkksU0FBUyxZQUFZLGFBQWEsY0FBNEIsaUJBQWlCLDJCQUEyQiw0QkFBNEI7QUFDdEksU0FBUyxRQUFRLGVBQWU7QUFDaEMsU0FBUyxjQUFjLFFBQVEsaUJBQWlCLGVBQWU7QUFDL0QsU0FBUyx1Q0FBdUMscUNBQXFDO0FBQ3JGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWlDLGNBQWMseUJBQXlCLDBCQUEwQjtBQUNsRyxTQUFTLG9CQUFvQixzQkFBc0I7QUFDbkQsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFrQyx1QkFBdUIsY0FBYywrQkFBK0M7QUFDdEgsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFB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
