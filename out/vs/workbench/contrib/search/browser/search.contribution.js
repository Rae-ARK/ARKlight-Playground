import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as platform from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Extensions as ViewExtensions, ViewContainerLocation } from "../../../common/views.js";
import { searchViewIcon } from "./searchIcons.js";
import { SearchView } from "./searchView.js";
import { registerContributions as searchWidgetContributions } from "./searchWidget.js";
import { SearchViewModelWorkbenchService } from "./searchTreeModel/searchModel.js";
import { ISearchViewModelWorkbenchService } from "./searchTreeModel/searchViewModelWorkbenchService.js";
import { SearchSortOrder, SEARCH_EXCLUDE_CONFIG, VIEWLET_ID, ViewMode, VIEW_ID, DEFAULT_MAX_SEARCH_RESULTS, SemanticSearchBehavior } from "../../../services/search/common/search.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { assertType } from "../../../../base/common/types.js";
import { getWorkspaceSymbols, searchConfigurationNode } from "../common/search.js";
import * as Constants from "../common/constants.js";
import { SearchChatContextContribution } from "./searchChatContext.js";
import "./searchActionsCopy.js";
import "./searchActionsFind.js";
import "./searchActionsNav.js";
import "./searchActionsRemoveReplace.js";
import "./searchActionsTopBar.js";
import "./searchActionsTextQuickAccess.js";
import "./searchQuickAccess.contribution.js";
import "./search.common.contribution.js";
import { TEXT_SEARCH_QUICK_ACCESS_PREFIX, TextSearchQuickAccess } from "./quickTextSearch/textSearchQuickAccess.js";
import { Extensions } from "../../../common/configuration.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { SearchAccessibilityHelp } from "./searchAccessibilityHelp.js";
registerSingleton(ISearchViewModelWorkbenchService, SearchViewModelWorkbenchService, InstantiationType.Delayed);
searchWidgetContributions();
registerWorkbenchContribution2(SearchChatContextContribution.ID, SearchChatContextContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new SearchAccessibilityHelp());
const SEARCH_MODE_CONFIG = "search.mode";
const viewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
  id: VIEWLET_ID,
  title: nls.localize2("search", "Search"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
  hideIfEmpty: true,
  icon: searchViewIcon,
  order: 1
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });
const viewDescriptor = {
  id: VIEW_ID,
  containerIcon: searchViewIcon,
  name: nls.localize2("search", "Search"),
  ctorDescriptor: new SyncDescriptor(SearchView),
  canToggleVisibility: false,
  canMoveView: true,
  openCommandActionDescriptor: {
    id: viewContainer.id,
    mnemonicTitle: nls.localize({ key: "miViewSearch", comment: ["&& denotes a mnemonic"] }, "&&Search"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
      // Yes, this is weird. See #116188, #115556, #115511, and now #124146, for examples of what can go wrong here.
      when: ContextKeyExpr.regex("neverMatch", /doesNotMatch/)
    },
    order: 1
  }
};
Registry.as(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
  ctor: TextSearchQuickAccess,
  prefix: TEXT_SEARCH_QUICK_ACCESS_PREFIX,
  contextKey: "inTextSearchPicker",
  placeholder: nls.localize("textSearchPickerPlaceholder", "Search for text in your workspace files."),
  helpEntries: [
    {
      description: nls.localize("textSearchPickerHelp", "Search for Text"),
      commandId: Constants.SearchCommandIds.QuickTextSearchActionId,
      commandCenterOrder: 25
    }
  ]
});
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  ...searchConfigurationNode,
  properties: {
    [SEARCH_EXCLUDE_CONFIG]: {
      type: "object",
      markdownDescription: nls.localize("exclude", "Configure [glob patterns](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options) for excluding files and folders in fulltext searches and file search in quick open. To exclude files from the recently opened list in quick open, patterns must be absolute (for example `**/node_modules/**`). Inherits all glob patterns from the `#files.exclude#` setting."),
      default: { "**/node_modules": true, "**/bower_components": true, "**/*.code-search": true },
      additionalProperties: {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("exclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            type: "object",
            properties: {
              when: {
                type: "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                pattern: "\\w*\\$\\(basename\\)\\w*",
                default: "$(basename).ext",
                markdownDescription: nls.localize({ key: "exclude.when", comment: ["\\$(basename) should not be translated"] }, "Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.")
              }
            }
          }
        ]
      },
      scope: ConfigurationScope.RESOURCE
    },
    [SEARCH_MODE_CONFIG]: {
      type: "string",
      enum: ["view", "reuseEditor", "newEditor"],
      default: "view",
      markdownDescription: nls.localize("search.mode", "Controls where new `Search: Find in Files` and `Find in Folder` operations occur: either in the Search view, or in a search editor."),
      enumDescriptions: [
        nls.localize("search.mode.view", "Search in the Search view, either in the panel or side bars."),
        nls.localize("search.mode.reuseEditor", "Search in an existing search editor if present, otherwise in a new search editor."),
        nls.localize("search.mode.newEditor", "Search in a new search editor.")
      ]
    },
    "search.useIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useIgnoreFiles", "Controls whether to use `.gitignore` and `.ignore` files when searching for files."),
      default: true,
      scope: ConfigurationScope.RESOURCE
    },
    "search.useGlobalIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useGlobalIgnoreFiles", "Controls whether to use your global gitignore file (for example, from `$HOME/.config/git/ignore`) when searching for files. Requires {0} to be enabled.", "`#search.useIgnoreFiles#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "search.useParentIgnoreFiles": {
      type: "boolean",
      markdownDescription: nls.localize("useParentIgnoreFiles", "Controls whether to use `.gitignore` and `.ignore` files in parent directories when searching for files. Requires {0} to be enabled.", "`#search.useIgnoreFiles#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "search.quickOpen.includeSymbols": {
      type: "boolean",
      description: nls.localize("search.quickOpen.includeSymbols", "Whether to include results from a global symbol search in the file results for Quick Open."),
      default: false
    },
    "search.ripgrep.maxThreads": {
      type: "number",
      description: nls.localize("search.ripgrep.maxThreads", "Number of threads to use for searching. When set to 0, the engine automatically determines this value."),
      default: 0
    },
    "search.quickOpen.includeHistory": {
      type: "boolean",
      description: nls.localize("search.quickOpen.includeHistory", "Whether to include results from recently opened files in the file results for Quick Open."),
      default: true,
      agentsWindow: { default: false }
    },
    "search.quickOpen.history.filterSortOrder": {
      type: "string",
      enum: ["default", "recency"],
      default: "default",
      enumDescriptions: [
        nls.localize("filterSortOrder.default", "History entries are sorted by relevance based on the filter value used. More relevant entries appear first."),
        nls.localize("filterSortOrder.recency", "History entries are sorted by recency. More recently opened entries appear first.")
      ],
      description: nls.localize("filterSortOrder", "Controls sorting order of editor history in quick open when filtering.")
    },
    "search.followSymlinks": {
      type: "boolean",
      description: nls.localize("search.followSymlinks", "Controls whether to follow symlinks while searching."),
      default: true
    },
    "search.smartCase": {
      type: "boolean",
      description: nls.localize("search.smartCase", "Search case-insensitively if the pattern is all lowercase, otherwise, search case-sensitively."),
      default: false
    },
    "search.globalFindClipboard": {
      type: "boolean",
      default: false,
      description: nls.localize("search.globalFindClipboard", "Controls whether the Search view should read or modify the shared find clipboard on macOS."),
      included: platform.isMacintosh
    },
    "search.maxResults": {
      type: ["number", "null"],
      default: DEFAULT_MAX_SEARCH_RESULTS,
      markdownDescription: nls.localize("search.maxResults", "Controls the maximum number of search results, this can be set to `null` (empty) to return unlimited results.")
    },
    "search.collapseResults": {
      type: "string",
      enum: ["auto", "alwaysCollapse", "alwaysExpand"],
      enumDescriptions: [
        nls.localize("search.collapseResults.auto", "Files with less than 10 results are expanded. Others are collapsed."),
        "",
        ""
      ],
      default: "alwaysExpand",
      description: nls.localize("search.collapseAllResults", "Controls whether the search results will be collapsed or expanded.")
    },
    "search.useReplacePreview": {
      type: "boolean",
      default: true,
      description: nls.localize("search.useReplacePreview", "Controls whether to open Replace Preview when selecting or replacing a match.")
    },
    "search.showLineNumbers": {
      type: "boolean",
      default: false,
      description: nls.localize("search.showLineNumbers", "Controls whether to show line numbers for search results.")
    },
    "search.actionsPosition": {
      type: "string",
      enum: ["auto", "right"],
      enumDescriptions: [
        nls.localize("search.actionsPositionAuto", "Position the actionbar to the right when the Search view is narrow, and immediately after the content when the Search view is wide."),
        nls.localize("search.actionsPositionRight", "Always position the actionbar to the right.")
      ],
      default: "right",
      description: nls.localize("search.actionsPosition", "Controls the positioning of the actionbar on rows in the Search view.")
    },
    "search.seedWithNearestWord": {
      type: "boolean",
      default: false,
      description: nls.localize("search.seedWithNearestWord", "Enable seeding search from the word nearest the cursor when the active editor has no selection.")
    },
    "search.seedOnFocus": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("search.seedOnFocus", "Update the search query to the editor's selected text when focusing the Search view. This happens either on click or when triggering the `workbench.views.search.focus` command.")
    },
    "search.sortOrder": {
      type: "string",
      enum: [SearchSortOrder.Default, SearchSortOrder.FileNames, SearchSortOrder.Type, SearchSortOrder.Modified, SearchSortOrder.CountDescending, SearchSortOrder.CountAscending],
      default: SearchSortOrder.Default,
      enumDescriptions: [
        nls.localize("searchSortOrder.default", "Results are sorted by folder and file names, in alphabetical order."),
        nls.localize("searchSortOrder.filesOnly", "Results are sorted by file names ignoring folder order, in alphabetical order."),
        nls.localize("searchSortOrder.type", "Results are sorted by file extensions, in alphabetical order."),
        nls.localize("searchSortOrder.modified", "Results are sorted by file last modified date, in descending order."),
        nls.localize("searchSortOrder.countDescending", "Results are sorted by count per file, in descending order."),
        nls.localize("searchSortOrder.countAscending", "Results are sorted by count per file, in ascending order.")
      ],
      description: nls.localize("search.sortOrder", "Controls sorting order of search results.")
    },
    "search.decorations.colors": {
      type: "boolean",
      description: nls.localize("search.decorations.colors", "Controls whether search file decorations should use colors."),
      default: true
    },
    "search.decorations.badges": {
      type: "boolean",
      description: nls.localize("search.decorations.badges", "Controls whether search file decorations should use badges."),
      default: true
    },
    "search.defaultViewMode": {
      type: "string",
      enum: [ViewMode.Tree, ViewMode.List],
      default: ViewMode.List,
      enumDescriptions: [
        nls.localize("scm.defaultViewMode.tree", "Shows search results as a tree."),
        nls.localize("scm.defaultViewMode.list", "Shows search results as a list.")
      ],
      description: nls.localize("search.defaultViewMode", "Controls the default search result view mode.")
    },
    "search.quickAccess.preserveInput": {
      type: "boolean",
      description: nls.localize("search.quickAccess.preserveInput", "Controls whether the last typed input to Quick Search should be restored when opening it the next time."),
      default: false
    },
    "search.experimental.closedNotebookRichContentResults": {
      type: "boolean",
      description: nls.localize("search.experimental.closedNotebookResults", "Show notebook editor rich content results for closed notebooks. Please refresh your search results after changing this setting."),
      default: false
    },
    "search.experimental.useIgnoreFilesInFindFiles": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("search.experimental.useIgnoreFilesInFindFiles", "When enabled, the legacy `findFiles` extension API honors the user's `#search.useIgnoreFiles#` setting instead of always ignoring `.gitignore`. Extensions that explicitly pass `null` as the `exclude` argument still get unfiltered results. Telemetry is emitted regardless of this setting to help decide future defaults."),
      tags: ["experimental"]
    },
    "search.searchView.semanticSearchBehavior": {
      type: "string",
      description: nls.localize("search.searchView.semanticSearchBehavior", "Controls the behavior of the semantic search results displayed in the Search view."),
      enum: [SemanticSearchBehavior.Manual, SemanticSearchBehavior.RunOnEmpty, SemanticSearchBehavior.Auto],
      default: SemanticSearchBehavior.Manual,
      enumDescriptions: [
        nls.localize("search.searchView.semanticSearchBehavior.manual", "Only request semantic search results manually."),
        nls.localize("search.searchView.semanticSearchBehavior.runOnEmpty", "Request semantic results automatically only when text search results are empty."),
        nls.localize("search.searchView.semanticSearchBehavior.auto", "Request semantic results automatically with every search.")
      ],
      tags: ["preview"]
    },
    "search.searchView.keywordSuggestions": {
      type: "boolean",
      description: nls.localize("search.searchView.keywordSuggestions", "Enable keyword suggestions in the Search view."),
      default: false,
      tags: ["preview"]
    }
  }
});
CommandsRegistry.registerCommand("_executeWorkspaceSymbolProvider", async function(accessor, ...args) {
  const [query] = args;
  assertType(typeof query === "string");
  const result = await getWorkspaceSymbols(query);
  return result.map((item) => item.symbol);
});
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "search.experimental.quickAccess.preserveInput",
  migrateFn: (value, _accessor) => [
    ["search.quickAccess.preserveInput", { value }],
    ["search.experimental.quickAccess.preserveInput", { value: void 0 }]
  ]
}]);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgUXVpY2tBY2Nlc3NFeHRlbnNpb25zLCBJUXVpY2tBY2Nlc3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFZpZXdFeHRlbnNpb25zLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yLCBJVmlld3NSZWdpc3RyeSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IHNlYXJjaFZpZXdJY29uIH0gZnJvbSAnLi9zZWFyY2hJY29ucy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hWaWV3IH0gZnJvbSAnLi9zZWFyY2hWaWV3LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29udHJpYnV0aW9ucyBhcyBzZWFyY2hXaWRnZXRDb250cmlidXRpb25zIH0gZnJvbSAnLi9zZWFyY2hXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IElTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZWFyY2hTb3J0T3JkZXIsIFNFQVJDSF9FWENMVURFX0NPTkZJRywgVklFV0xFVF9JRCwgVmlld01vZGUsIFZJRVdfSUQsIERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTLCBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0V29ya3NwYWNlU3ltYm9scywgSVdvcmtzcGFjZVN5bWJvbCwgc2VhcmNoQ29uZmlndXJhdGlvbk5vZGUgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIENvbnN0YW50cyBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNlYXJjaENoYXRDb250ZXh0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi9zZWFyY2hDaGF0Q29udGV4dC5qcyc7XG5cbmltcG9ydCAnLi9zZWFyY2hBY3Rpb25zQ29weS5qcyc7XG5pbXBvcnQgJy4vc2VhcmNoQWN0aW9uc0ZpbmQuanMnO1xuaW1wb3J0ICcuL3NlYXJjaEFjdGlvbnNOYXYuanMnO1xuaW1wb3J0ICcuL3NlYXJjaEFjdGlvbnNSZW1vdmVSZXBsYWNlLmpzJztcbmltcG9ydCAnLi9zZWFyY2hBY3Rpb25zVG9wQmFyLmpzJztcbmltcG9ydCAnLi9zZWFyY2hBY3Rpb25zVGV4dFF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCAnLi9zZWFyY2hRdWlja0FjY2Vzcy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0ICcuL3NlYXJjaC5jb21tb24uY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRFWFRfU0VBUkNIX1FVSUNLX0FDQ0VTU19QUkVGSVgsIFRleHRTZWFyY2hRdWlja0FjY2VzcyB9IGZyb20gJy4vcXVpY2tUZXh0U2VhcmNoL3RleHRTZWFyY2hRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTZWFyY2hBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4vc2VhcmNoQWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSwgU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbnNlYXJjaFdpZGdldENvbnRyaWJ1dGlvbnMoKTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNlYXJjaENoYXRDb250ZXh0Q29udHJpYnV0aW9uLklELCBTZWFyY2hDaGF0Q29udGV4dENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IFNlYXJjaEFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuXG5jb25zdCBTRUFSQ0hfTU9ERV9DT05GSUcgPSAnc2VhcmNoLm1vZGUnO1xuXG5jb25zdCB2aWV3Q29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7XG5cdGlkOiBWSUVXTEVUX0lELFxuXHR0aXRsZTogbmxzLmxvY2FsaXplMignc2VhcmNoJywgXCJTZWFyY2hcIiksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld1BhbmVDb250YWluZXIsIFtWSUVXTEVUX0lELCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9XSksXG5cdGhpZGVJZkVtcHR5OiB0cnVlLFxuXHRpY29uOiBzZWFyY2hWaWV3SWNvbixcblx0b3JkZXI6IDEsXG59LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgeyBkb05vdFJlZ2lzdGVyT3BlbkNvbW1hbmQ6IHRydWUgfSk7XG5cbmNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdGlkOiBWSUVXX0lELFxuXHRjb250YWluZXJJY29uOiBzZWFyY2hWaWV3SWNvbixcblx0bmFtZTogbmxzLmxvY2FsaXplMignc2VhcmNoJywgXCJTZWFyY2hcIiksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU2VhcmNoVmlldyksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IGZhbHNlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0b3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yOiB7XG5cdFx0aWQ6IHZpZXdDb250YWluZXIuaWQsXG5cdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlWaWV3U2VhcmNoJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2VhcmNoXCIpLFxuXHRcdGtleWJpbmRpbmdzOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdC8vIFllcywgdGhpcyBpcyB3ZWlyZC4gU2VlICMxMTYxODgsICMxMTU1NTYsICMxMTU1MTEsIGFuZCBub3cgIzEyNDE0NiwgZm9yIGV4YW1wbGVzIG9mIHdoYXQgY2FuIGdvIHdyb25nIGhlcmUuXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5yZWdleCgnbmV2ZXJNYXRjaCcsIC9kb2VzTm90TWF0Y2gvKVxuXHRcdH0sXG5cdFx0b3JkZXI6IDFcblx0fVxufTtcblxuLy8gUmVnaXN0ZXIgc2VhcmNoIGRlZmF1bHQgbG9jYXRpb24gdG8gc2lkZWJhclxuUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgdmlld0NvbnRhaW5lcik7XG5cbi8vIFJlZ2lzdGVyIFF1aWNrIEFjY2VzcyBIYW5kbGVyXG5jb25zdCBxdWlja0FjY2Vzc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KFF1aWNrQWNjZXNzRXh0ZW5zaW9ucy5RdWlja2FjY2Vzcyk7XG5cbnF1aWNrQWNjZXNzUmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHtcblx0Y3RvcjogVGV4dFNlYXJjaFF1aWNrQWNjZXNzLFxuXHRwcmVmaXg6IFRFWFRfU0VBUkNIX1FVSUNLX0FDQ0VTU19QUkVGSVgsXG5cdGNvbnRleHRLZXk6ICdpblRleHRTZWFyY2hQaWNrZXInLFxuXHRwbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCd0ZXh0U2VhcmNoUGlja2VyUGxhY2Vob2xkZXInLCBcIlNlYXJjaCBmb3IgdGV4dCBpbiB5b3VyIHdvcmtzcGFjZSBmaWxlcy5cIiksXG5cdGhlbHBFbnRyaWVzOiBbXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGV4dFNlYXJjaFBpY2tlckhlbHAnLCBcIlNlYXJjaCBmb3IgVGV4dFwiKSxcblx0XHRcdGNvbW1hbmRJZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuUXVpY2tUZXh0U2VhcmNoQWN0aW9uSWQsXG5cdFx0XHRjb21tYW5kQ2VudGVyT3JkZXI6IDI1LFxuXHRcdH1cblx0XVxufSk7XG5cbi8vIENvbmZpZ3VyYXRpb25cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLnNlYXJjaENvbmZpZ3VyYXRpb25Ob2RlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W1NFQVJDSF9FWENMVURFX0NPTkZJR106IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleGNsdWRlJywgXCJDb25maWd1cmUgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2NvZGViYXNpY3MjX2FkdmFuY2VkLXNlYXJjaC1vcHRpb25zKSBmb3IgZXhjbHVkaW5nIGZpbGVzIGFuZCBmb2xkZXJzIGluIGZ1bGx0ZXh0IHNlYXJjaGVzIGFuZCBmaWxlIHNlYXJjaCBpbiBxdWljayBvcGVuLiBUbyBleGNsdWRlIGZpbGVzIGZyb20gdGhlIHJlY2VudGx5IG9wZW5lZCBsaXN0IGluIHF1aWNrIG9wZW4sIHBhdHRlcm5zIG11c3QgYmUgYWJzb2x1dGUgKGZvciBleGFtcGxlIGAqKi9ub2RlX21vZHVsZXMvKipgKS4gSW5oZXJpdHMgYWxsIGdsb2IgcGF0dGVybnMgZnJvbSB0aGUgYCNmaWxlcy5leGNsdWRlI2Agc2V0dGluZy5cIiksXG5cdFx0XHRkZWZhdWx0OiB7ICcqKi9ub2RlX21vZHVsZXMnOiB0cnVlLCAnKiovYm93ZXJfY29tcG9uZW50cyc6IHRydWUsICcqKi8qLmNvZGUtc2VhcmNoJzogdHJ1ZSB9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleGNsdWRlLmJvb2xlYW4nLCBcIlRoZSBnbG9iIHBhdHRlcm4gdG8gbWF0Y2ggZmlsZSBwYXRocyBhZ2FpbnN0LiBTZXQgdG8gdHJ1ZSBvciBmYWxzZSB0byBlbmFibGUgb3IgZGlzYWJsZSB0aGUgcGF0dGVybi5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLCAvLyBleHByZXNzaW9uICh7IFwiKiovKi5qc1wiOiB7IFwid2hlblwiOiBcIiQoYmFzZW5hbWUpLmpzXCIgfSB9KVxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdcXFxcdypcXFxcJFxcXFwoYmFzZW5hbWVcXFxcKVxcXFx3KicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJyQoYmFzZW5hbWUpLmV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnZXhjbHVkZS53aGVuJywgY29tbWVudDogWydcXFxcJChiYXNlbmFtZSkgc2hvdWxkIG5vdCBiZSB0cmFuc2xhdGVkJ10gfSwgJ0FkZGl0aW9uYWwgY2hlY2sgb24gdGhlIHNpYmxpbmdzIG9mIGEgbWF0Y2hpbmcgZmlsZS4gVXNlIFxcXFwkKGJhc2VuYW1lKSBhcyB2YXJpYWJsZSBmb3IgdGhlIG1hdGNoaW5nIGZpbGUgbmFtZS4nKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHRcdH0sXG5cdFx0W1NFQVJDSF9NT0RFX0NPTkZJR106IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWyd2aWV3JywgJ3JldXNlRWRpdG9yJywgJ25ld0VkaXRvciddLFxuXHRcdFx0ZGVmYXVsdDogJ3ZpZXcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gubW9kZScsIFwiQ29udHJvbHMgd2hlcmUgbmV3IGBTZWFyY2g6IEZpbmQgaW4gRmlsZXNgIGFuZCBgRmluZCBpbiBGb2xkZXJgIG9wZXJhdGlvbnMgb2NjdXI6IGVpdGhlciBpbiB0aGUgU2VhcmNoIHZpZXcsIG9yIGluIGEgc2VhcmNoIGVkaXRvci5cIiksXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLm1vZGUudmlldycsIFwiU2VhcmNoIGluIHRoZSBTZWFyY2ggdmlldywgZWl0aGVyIGluIHRoZSBwYW5lbCBvciBzaWRlIGJhcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5tb2RlLnJldXNlRWRpdG9yJywgXCJTZWFyY2ggaW4gYW4gZXhpc3Rpbmcgc2VhcmNoIGVkaXRvciBpZiBwcmVzZW50LCBvdGhlcndpc2UgaW4gYSBuZXcgc2VhcmNoIGVkaXRvci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLm1vZGUubmV3RWRpdG9yJywgXCJTZWFyY2ggaW4gYSBuZXcgc2VhcmNoIGVkaXRvci5cIiksXG5cdFx0XHRdXG5cdFx0fSxcblx0XHQnc2VhcmNoLnVzZUlnbm9yZUZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1c2VJZ25vcmVGaWxlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byB1c2UgYC5naXRpZ25vcmVgIGFuZCBgLmlnbm9yZWAgZmlsZXMgd2hlbiBzZWFyY2hpbmcgZm9yIGZpbGVzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHQnc2VhcmNoLnVzZUdsb2JhbElnbm9yZUZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1c2VHbG9iYWxJZ25vcmVGaWxlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byB1c2UgeW91ciBnbG9iYWwgZ2l0aWdub3JlIGZpbGUgKGZvciBleGFtcGxlLCBmcm9tIGAkSE9NRS8uY29uZmlnL2dpdC9pZ25vcmVgKSB3aGVuIHNlYXJjaGluZyBmb3IgZmlsZXMuIFJlcXVpcmVzIHswfSB0byBiZSBlbmFibGVkLlwiLCAnYCNzZWFyY2gudXNlSWdub3JlRmlsZXMjYCcpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHQnc2VhcmNoLnVzZVBhcmVudElnbm9yZUZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1c2VQYXJlbnRJZ25vcmVGaWxlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byB1c2UgYC5naXRpZ25vcmVgIGFuZCBgLmlnbm9yZWAgZmlsZXMgaW4gcGFyZW50IGRpcmVjdG9yaWVzIHdoZW4gc2VhcmNoaW5nIGZvciBmaWxlcy4gUmVxdWlyZXMgezB9IHRvIGJlIGVuYWJsZWQuXCIsICdgI3NlYXJjaC51c2VJZ25vcmVGaWxlcyNgJyksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0Vcblx0XHR9LFxuXHRcdCdzZWFyY2gucXVpY2tPcGVuLmluY2x1ZGVTeW1ib2xzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnF1aWNrT3Blbi5pbmNsdWRlU3ltYm9scycsIFwiV2hldGhlciB0byBpbmNsdWRlIHJlc3VsdHMgZnJvbSBhIGdsb2JhbCBzeW1ib2wgc2VhcmNoIGluIHRoZSBmaWxlIHJlc3VsdHMgZm9yIFF1aWNrIE9wZW4uXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzZWFyY2gucmlwZ3JlcC5tYXhUaHJlYWRzJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gucmlwZ3JlcC5tYXhUaHJlYWRzJywgXCJOdW1iZXIgb2YgdGhyZWFkcyB0byB1c2UgZm9yIHNlYXJjaGluZy4gV2hlbiBzZXQgdG8gMCwgdGhlIGVuZ2luZSBhdXRvbWF0aWNhbGx5IGRldGVybWluZXMgdGhpcyB2YWx1ZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAwXG5cdFx0fSxcblx0XHQnc2VhcmNoLnF1aWNrT3Blbi5pbmNsdWRlSGlzdG9yeSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5xdWlja09wZW4uaW5jbHVkZUhpc3RvcnknLCBcIldoZXRoZXIgdG8gaW5jbHVkZSByZXN1bHRzIGZyb20gcmVjZW50bHkgb3BlbmVkIGZpbGVzIGluIHRoZSBmaWxlIHJlc3VsdHMgZm9yIFF1aWNrIE9wZW4uXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiBmYWxzZSB9LFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5xdWlja09wZW4uaGlzdG9yeS5maWx0ZXJTb3J0T3JkZXInOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZGVmYXVsdCcsICdyZWNlbmN5J10sXG5cdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZmlsdGVyU29ydE9yZGVyLmRlZmF1bHQnLCAnSGlzdG9yeSBlbnRyaWVzIGFyZSBzb3J0ZWQgYnkgcmVsZXZhbmNlIGJhc2VkIG9uIHRoZSBmaWx0ZXIgdmFsdWUgdXNlZC4gTW9yZSByZWxldmFudCBlbnRyaWVzIGFwcGVhciBmaXJzdC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdmaWx0ZXJTb3J0T3JkZXIucmVjZW5jeScsICdIaXN0b3J5IGVudHJpZXMgYXJlIHNvcnRlZCBieSByZWNlbmN5LiBNb3JlIHJlY2VudGx5IG9wZW5lZCBlbnRyaWVzIGFwcGVhciBmaXJzdC4nKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZpbHRlclNvcnRPcmRlcicsIFwiQ29udHJvbHMgc29ydGluZyBvcmRlciBvZiBlZGl0b3IgaGlzdG9yeSBpbiBxdWljayBvcGVuIHdoZW4gZmlsdGVyaW5nLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5mb2xsb3dTeW1saW5rcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5mb2xsb3dTeW1saW5rcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBmb2xsb3cgc3ltbGlua3Mgd2hpbGUgc2VhcmNoaW5nLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzZWFyY2guc21hcnRDYXNlJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNtYXJ0Q2FzZScsIFwiU2VhcmNoIGNhc2UtaW5zZW5zaXRpdmVseSBpZiB0aGUgcGF0dGVybiBpcyBhbGwgbG93ZXJjYXNlLCBvdGhlcndpc2UsIHNlYXJjaCBjYXNlLXNlbnNpdGl2ZWx5LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHQnc2VhcmNoLmdsb2JhbEZpbmRDbGlwYm9hcmQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5nbG9iYWxGaW5kQ2xpcGJvYXJkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBTZWFyY2ggdmlldyBzaG91bGQgcmVhZCBvciBtb2RpZnkgdGhlIHNoYXJlZCBmaW5kIGNsaXBib2FyZCBvbiBtYWNPUy5cIiksXG5cdFx0XHRpbmNsdWRlZDogcGxhdGZvcm0uaXNNYWNpbnRvc2hcblx0XHR9LFxuXHRcdCdzZWFyY2gubWF4UmVzdWx0cyc6IHtcblx0XHRcdHR5cGU6IFsnbnVtYmVyJywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gubWF4UmVzdWx0cycsIFwiQ29udHJvbHMgdGhlIG1heGltdW0gbnVtYmVyIG9mIHNlYXJjaCByZXN1bHRzLCB0aGlzIGNhbiBiZSBzZXQgdG8gYG51bGxgIChlbXB0eSkgdG8gcmV0dXJuIHVubGltaXRlZCByZXN1bHRzLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5jb2xsYXBzZVJlc3VsdHMnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYXV0bycsICdhbHdheXNDb2xsYXBzZScsICdhbHdheXNFeHBhbmQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guY29sbGFwc2VSZXN1bHRzLmF1dG8nLCBcIkZpbGVzIHdpdGggbGVzcyB0aGFuIDEwIHJlc3VsdHMgYXJlIGV4cGFuZGVkLiBPdGhlcnMgYXJlIGNvbGxhcHNlZC5cIiksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdhbHdheXNFeHBhbmQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmNvbGxhcHNlQWxsUmVzdWx0cycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc2VhcmNoIHJlc3VsdHMgd2lsbCBiZSBjb2xsYXBzZWQgb3IgZXhwYW5kZWQuXCIpLFxuXHRcdH0sXG5cdFx0J3NlYXJjaC51c2VSZXBsYWNlUHJldmlldyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gudXNlUmVwbGFjZVByZXZpZXcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gb3BlbiBSZXBsYWNlIFByZXZpZXcgd2hlbiBzZWxlY3Rpbmcgb3IgcmVwbGFjaW5nIGEgbWF0Y2guXCIpLFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zaG93TGluZU51bWJlcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zaG93TGluZU51bWJlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBsaW5lIG51bWJlcnMgZm9yIHNlYXJjaCByZXN1bHRzLlwiKSxcblx0XHR9LFxuXHRcdCdzZWFyY2guYWN0aW9uc1Bvc2l0aW9uJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2F1dG8nLCAncmlnaHQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guYWN0aW9uc1Bvc2l0aW9uQXV0bycsIFwiUG9zaXRpb24gdGhlIGFjdGlvbmJhciB0byB0aGUgcmlnaHQgd2hlbiB0aGUgU2VhcmNoIHZpZXcgaXMgbmFycm93LCBhbmQgaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIGNvbnRlbnQgd2hlbiB0aGUgU2VhcmNoIHZpZXcgaXMgd2lkZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoLmFjdGlvbnNQb3NpdGlvblJpZ2h0JywgXCJBbHdheXMgcG9zaXRpb24gdGhlIGFjdGlvbmJhciB0byB0aGUgcmlnaHQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdyaWdodCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guYWN0aW9uc1Bvc2l0aW9uJywgXCJDb250cm9scyB0aGUgcG9zaXRpb25pbmcgb2YgdGhlIGFjdGlvbmJhciBvbiByb3dzIGluIHRoZSBTZWFyY2ggdmlldy5cIilcblx0XHR9LFxuXHRcdCdzZWFyY2guc2VlZFdpdGhOZWFyZXN0V29yZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnNlZWRXaXRoTmVhcmVzdFdvcmQnLCBcIkVuYWJsZSBzZWVkaW5nIHNlYXJjaCBmcm9tIHRoZSB3b3JkIG5lYXJlc3QgdGhlIGN1cnNvciB3aGVuIHRoZSBhY3RpdmUgZWRpdG9yIGhhcyBubyBzZWxlY3Rpb24uXCIpXG5cdFx0fSxcblx0XHQnc2VhcmNoLnNlZWRPbkZvY3VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zZWVkT25Gb2N1cycsIFwiVXBkYXRlIHRoZSBzZWFyY2ggcXVlcnkgdG8gdGhlIGVkaXRvcidzIHNlbGVjdGVkIHRleHQgd2hlbiBmb2N1c2luZyB0aGUgU2VhcmNoIHZpZXcuIFRoaXMgaGFwcGVucyBlaXRoZXIgb24gY2xpY2sgb3Igd2hlbiB0cmlnZ2VyaW5nIHRoZSBgd29ya2JlbmNoLnZpZXdzLnNlYXJjaC5mb2N1c2AgY29tbWFuZC5cIilcblx0XHR9LFxuXHRcdCdzZWFyY2guc29ydE9yZGVyJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbU2VhcmNoU29ydE9yZGVyLkRlZmF1bHQsIFNlYXJjaFNvcnRPcmRlci5GaWxlTmFtZXMsIFNlYXJjaFNvcnRPcmRlci5UeXBlLCBTZWFyY2hTb3J0T3JkZXIuTW9kaWZpZWQsIFNlYXJjaFNvcnRPcmRlci5Db3VudERlc2NlbmRpbmcsIFNlYXJjaFNvcnRPcmRlci5Db3VudEFzY2VuZGluZ10sXG5cdFx0XHRkZWZhdWx0OiBTZWFyY2hTb3J0T3JkZXIuRGVmYXVsdCxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2hTb3J0T3JkZXIuZGVmYXVsdCcsIFwiUmVzdWx0cyBhcmUgc29ydGVkIGJ5IGZvbGRlciBhbmQgZmlsZSBuYW1lcywgaW4gYWxwaGFiZXRpY2FsIG9yZGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2hTb3J0T3JkZXIuZmlsZXNPbmx5JywgXCJSZXN1bHRzIGFyZSBzb3J0ZWQgYnkgZmlsZSBuYW1lcyBpZ25vcmluZyBmb2xkZXIgb3JkZXIsIGluIGFscGhhYmV0aWNhbCBvcmRlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoU29ydE9yZGVyLnR5cGUnLCBcIlJlc3VsdHMgYXJlIHNvcnRlZCBieSBmaWxlIGV4dGVuc2lvbnMsIGluIGFscGhhYmV0aWNhbCBvcmRlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoU29ydE9yZGVyLm1vZGlmaWVkJywgXCJSZXN1bHRzIGFyZSBzb3J0ZWQgYnkgZmlsZSBsYXN0IG1vZGlmaWVkIGRhdGUsIGluIGRlc2NlbmRpbmcgb3JkZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaFNvcnRPcmRlci5jb3VudERlc2NlbmRpbmcnLCBcIlJlc3VsdHMgYXJlIHNvcnRlZCBieSBjb3VudCBwZXIgZmlsZSwgaW4gZGVzY2VuZGluZyBvcmRlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VhcmNoU29ydE9yZGVyLmNvdW50QXNjZW5kaW5nJywgXCJSZXN1bHRzIGFyZSBzb3J0ZWQgYnkgY291bnQgcGVyIGZpbGUsIGluIGFzY2VuZGluZyBvcmRlci5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guc29ydE9yZGVyJywgXCJDb250cm9scyBzb3J0aW5nIG9yZGVyIG9mIHNlYXJjaCByZXN1bHRzLlwiKVxuXHRcdH0sXG5cdFx0J3NlYXJjaC5kZWNvcmF0aW9ucy5jb2xvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2guZGVjb3JhdGlvbnMuY29sb3JzJywgXCJDb250cm9scyB3aGV0aGVyIHNlYXJjaCBmaWxlIGRlY29yYXRpb25zIHNob3VsZCB1c2UgY29sb3JzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzZWFyY2guZGVjb3JhdGlvbnMuYmFkZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmRlY29yYXRpb25zLmJhZGdlcycsIFwiQ29udHJvbHMgd2hldGhlciBzZWFyY2ggZmlsZSBkZWNvcmF0aW9ucyBzaG91bGQgdXNlIGJhZGdlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnc2VhcmNoLmRlZmF1bHRWaWV3TW9kZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW1ZpZXdNb2RlLlRyZWUsIFZpZXdNb2RlLkxpc3RdLFxuXHRcdFx0ZGVmYXVsdDogVmlld01vZGUuTGlzdCxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdNb2RlLnRyZWUnLCBcIlNob3dzIHNlYXJjaCByZXN1bHRzIGFzIGEgdHJlZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NtLmRlZmF1bHRWaWV3TW9kZS5saXN0JywgXCJTaG93cyBzZWFyY2ggcmVzdWx0cyBhcyBhIGxpc3QuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmRlZmF1bHRWaWV3TW9kZScsIFwiQ29udHJvbHMgdGhlIGRlZmF1bHQgc2VhcmNoIHJlc3VsdCB2aWV3IG1vZGUuXCIpXG5cdFx0fSxcblx0XHQnc2VhcmNoLnF1aWNrQWNjZXNzLnByZXNlcnZlSW5wdXQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzZWFyY2gucXVpY2tBY2Nlc3MucHJlc2VydmVJbnB1dCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgbGFzdCB0eXBlZCBpbnB1dCB0byBRdWljayBTZWFyY2ggc2hvdWxkIGJlIHJlc3RvcmVkIHdoZW4gb3BlbmluZyBpdCB0aGUgbmV4dCB0aW1lLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHQnc2VhcmNoLmV4cGVyaW1lbnRhbC5jbG9zZWROb3RlYm9va1JpY2hDb250ZW50UmVzdWx0cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5leHBlcmltZW50YWwuY2xvc2VkTm90ZWJvb2tSZXN1bHRzJywgXCJTaG93IG5vdGVib29rIGVkaXRvciByaWNoIGNvbnRlbnQgcmVzdWx0cyBmb3IgY2xvc2VkIG5vdGVib29rcy4gUGxlYXNlIHJlZnJlc2ggeW91ciBzZWFyY2ggcmVzdWx0cyBhZnRlciBjaGFuZ2luZyB0aGlzIHNldHRpbmcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzZWFyY2guZXhwZXJpbWVudGFsLnVzZUlnbm9yZUZpbGVzSW5GaW5kRmlsZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmV4cGVyaW1lbnRhbC51c2VJZ25vcmVGaWxlc0luRmluZEZpbGVzJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBsZWdhY3kgYGZpbmRGaWxlc2AgZXh0ZW5zaW9uIEFQSSBob25vcnMgdGhlIHVzZXIncyBgI3NlYXJjaC51c2VJZ25vcmVGaWxlcyNgIHNldHRpbmcgaW5zdGVhZCBvZiBhbHdheXMgaWdub3JpbmcgYC5naXRpZ25vcmVgLiBFeHRlbnNpb25zIHRoYXQgZXhwbGljaXRseSBwYXNzIGBudWxsYCBhcyB0aGUgYGV4Y2x1ZGVgIGFyZ3VtZW50IHN0aWxsIGdldCB1bmZpbHRlcmVkIHJlc3VsdHMuIFRlbGVtZXRyeSBpcyBlbWl0dGVkIHJlZ2FyZGxlc3Mgb2YgdGhpcyBzZXR0aW5nIHRvIGhlbHAgZGVjaWRlIGZ1dHVyZSBkZWZhdWx0cy5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3InOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3InLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciBvZiB0aGUgc2VtYW50aWMgc2VhcmNoIHJlc3VsdHMgZGlzcGxheWVkIGluIHRoZSBTZWFyY2ggdmlldy5cIiksXG5cdFx0XHRlbnVtOiBbU2VtYW50aWNTZWFyY2hCZWhhdmlvci5NYW51YWwsIFNlbWFudGljU2VhcmNoQmVoYXZpb3IuUnVuT25FbXB0eSwgU2VtYW50aWNTZWFyY2hCZWhhdmlvci5BdXRvXSxcblx0XHRcdGRlZmF1bHQ6IFNlbWFudGljU2VhcmNoQmVoYXZpb3IuTWFudWFsLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3IubWFudWFsJywgXCJPbmx5IHJlcXVlc3Qgc2VtYW50aWMgc2VhcmNoIHJlc3VsdHMgbWFudWFsbHkuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3IucnVuT25FbXB0eScsIFwiUmVxdWVzdCBzZW1hbnRpYyByZXN1bHRzIGF1dG9tYXRpY2FsbHkgb25seSB3aGVuIHRleHQgc2VhcmNoIHJlc3VsdHMgYXJlIGVtcHR5LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzZWFyY2guc2VhcmNoVmlldy5zZW1hbnRpY1NlYXJjaEJlaGF2aW9yLmF1dG8nLCBcIlJlcXVlc3Qgc2VtYW50aWMgcmVzdWx0cyBhdXRvbWF0aWNhbGx5IHdpdGggZXZlcnkgc2VhcmNoLlwiKVxuXHRcdFx0XSxcblx0XHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdH0sXG5cdFx0J3NlYXJjaC5zZWFyY2hWaWV3LmtleXdvcmRTdWdnZXN0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlYXJjaC5zZWFyY2hWaWV3LmtleXdvcmRTdWdnZXN0aW9ucycsIFwiRW5hYmxlIGtleXdvcmQgc3VnZ2VzdGlvbnMgaW4gdGhlIFNlYXJjaCB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0fSxcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKTogUHJvbWlzZTxJV29ya3NwYWNlU3ltYm9sW10+IHtcblx0Y29uc3QgW3F1ZXJ5XSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUodHlwZW9mIHF1ZXJ5ID09PSAnc3RyaW5nJyk7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdldFdvcmtzcGFjZVN5bWJvbHMocXVlcnkpO1xuXHRyZXR1cm4gcmVzdWx0Lm1hcChpdGVtID0+IGl0ZW0uc3ltYm9sKTtcbn0pO1xuXG4vLyB0b2RvOiBAYW5kcmVhbWFoIGdldCByaWQgb2YgdGhpcyBhZnRlciBhIGZldyBpdGVyYXRpb25zXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAnc2VhcmNoLmV4cGVyaW1lbnRhbC5xdWlja0FjY2Vzcy5wcmVzZXJ2ZUlucHV0Jyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgX2FjY2Vzc29yKSA9PiAoW1xuXHRcdFx0WydzZWFyY2gucXVpY2tBY2Nlc3MucHJlc2VydmVJbnB1dCcsIHsgdmFsdWUgfV0sXG5cdFx0XHRbJ3NlYXJjaC5leHBlcmltZW50YWwucXVpY2tBY2Nlc3MucHJlc2VydmVJbnB1dCcsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XVxuXHRcdF0pXG5cdH1dKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxjQUFjO0FB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
