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
import * as DOM from "../../../../base/browser/dom.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as paths from "../../../../base/common/path.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isEqual } from "../../../../base/common/resources.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { SearchContext } from "../common/constants.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { isSearchTreeMatch, isSearchTreeFileMatch, isSearchTreeFolderMatch, isTextSearchHeading, isSearchTreeFolderMatchWorkspaceRoot, isSearchTreeFolderMatchNoRoot, isPlainTextSearchHeading } from "./searchTreeModel/searchTreeCommon.js";
import { isSearchTreeAIFileMatch } from "./AISearch/aiSearchModelBase.js";
const _SearchDelegate = class _SearchDelegate {
  getHeight(element) {
    return _SearchDelegate.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (isSearchTreeFolderMatch(element)) {
      return FolderMatchRenderer.TEMPLATE_ID;
    } else if (isSearchTreeFileMatch(element)) {
      return FileMatchRenderer.TEMPLATE_ID;
    } else if (isSearchTreeMatch(element)) {
      return MatchRenderer.TEMPLATE_ID;
    } else if (isTextSearchHeading(element)) {
      return TextSearchResultRenderer.TEMPLATE_ID;
    }
    console.error("Invalid search tree element", element);
    throw new Error("Invalid search tree element");
  }
};
_SearchDelegate.ITEM_HEIGHT = 22;
let SearchDelegate = _SearchDelegate;
let TextSearchResultRenderer = class extends Disposable {
  constructor(labels, contextService, instantiationService, contextKeyService) {
    super();
    this.labels = labels;
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = TextSearchResultRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const textSearchResultElement = DOM.append(container, DOM.$(".textsearchresult"));
    const label = this.labels.create(textSearchResultElement, { supportDescriptionHighlights: true, supportHighlights: true, supportIcons: true });
    disposables.add(label);
    const actionBarContainer = DOM.append(textSearchResultElement, DOM.$(".actionBarContainer"));
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      highlightToggledItems: true,
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return { label, disposables, actions, contextKeyService: contextKeyServiceMain };
  }
  async renderElement(node, index, templateData) {
    if (isPlainTextSearchHeading(node.element)) {
      templateData.label.setLabel(nls.localize("searchFolderMatch.plainText.label", "Text Results"));
      SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(false);
      SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
    } else {
      try {
        await node.element.parent().searchModel.getAITextResultProviderName();
      } catch {
      }
      const localizedLabel = nls.localize({
        key: "searchFolderMatch.aiText.label",
        comment: ['This is displayed before the AI text search results, now always "AI-assisted results".']
      }, "AI-assisted results");
      templateData.label.setLabel(`$(${Codicon.searchSparkle.id}) ${localizedLabel}`);
      SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(true);
      SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
      SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
    }
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  renderCompressedElements(node, index, templateData) {
  }
};
TextSearchResultRenderer.TEMPLATE_ID = "textResultMatch";
TextSearchResultRenderer = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService)
], TextSearchResultRenderer);
let FolderMatchRenderer = class extends Disposable {
  constructor(searchView, labels, contextService, labelService, instantiationService, contextKeyService) {
    super();
    this.searchView = searchView;
    this.labels = labels;
    this.contextService = contextService;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = FolderMatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    const label = compressed.elements.map((e) => e.name());
    if (folder.resource) {
      const fileKind = isSearchTreeFolderMatchWorkspaceRoot(folder) ? FileKind.ROOT_FOLDER : FileKind.FOLDER;
      templateData.label.setResource({ resource: folder.resource, name: label }, {
        fileKind,
        separator: this.labelService.getSeparator(folder.resource.scheme)
      });
    } else {
      templateData.label.setLabel(nls.localize("searchFolderMatch.other.label", "Other files"));
    }
    this.renderFolderDetails(folder, templateData);
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const folderMatchElement = DOM.append(container, DOM.$(".foldermatch"));
    const label = this.labels.create(folderMatchElement, { supportDescriptionHighlights: true, supportHighlights: true });
    disposables.add(label);
    const badge = new CountBadge(DOM.append(folderMatchElement, DOM.$(".badge")), {}, defaultCountBadgeStyles);
    disposables.add(badge);
    const actionBarContainer = DOM.append(folderMatchElement, DOM.$(".actionBarContainer"));
    const elementDisposables = new DisposableStore();
    disposables.add(elementDisposables);
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(true);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return {
      label,
      badge,
      actions,
      disposables,
      elementDisposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const folderMatch = node.element;
    if (folderMatch.resource) {
      const workspaceFolder = this.contextService.getWorkspaceFolder(folderMatch.resource);
      if (workspaceFolder && isEqual(workspaceFolder.uri, folderMatch.resource)) {
        templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.ROOT_FOLDER, hidePath: true });
      } else {
        templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.FOLDER, hidePath: this.searchView.isTreeLayoutViewVisible });
      }
    } else {
      templateData.label.setLabel(nls.localize("searchFolderMatch.other.label", "Other files"));
    }
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());
    templateData.elementDisposables.add(folderMatch.onChange(() => {
      SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());
    }));
    this.renderFolderDetails(folderMatch, templateData);
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  renderFolderDetails(folder, templateData) {
    const count = folder.recursiveMatchCount();
    templateData.badge.setCount(count);
    templateData.badge.setTitleFormat(count > 1 ? nls.localize("searchFileMatches", "{0} files found", count) : nls.localize("searchFileMatch", "{0} file found", count));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: folder };
  }
};
FolderMatchRenderer.TEMPLATE_ID = "folderMatch";
FolderMatchRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], FolderMatchRenderer);
let FileMatchRenderer = class extends Disposable {
  constructor(searchView, labels, contextService, configurationService, instantiationService, contextKeyService) {
    super();
    this.searchView = searchView;
    this.labels = labels;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = FileMatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible.");
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    disposables.add(elementDisposables);
    const fileMatchElement = DOM.append(container, DOM.$(".filematch"));
    const label = this.labels.create(fileMatchElement);
    disposables.add(label);
    const badge = new CountBadge(DOM.append(fileMatchElement, DOM.$(".badge")), {}, defaultCountBadgeStyles);
    disposables.add(badge);
    const actionBarContainer = DOM.append(fileMatchElement, DOM.$(".actionBarContainer"));
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(true);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    return {
      el: fileMatchElement,
      label,
      badge,
      actions,
      disposables,
      elementDisposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const fileMatch = node.element;
    templateData.el.setAttribute("data-resource", fileMatch.resource.toString());
    const decorationConfig = this.configurationService.getValue("search").decorations;
    templateData.label.setFile(fileMatch.resource, { range: isSearchTreeAIFileMatch(fileMatch) ? fileMatch.getFullRange() : void 0, hidePath: this.searchView.isTreeLayoutViewVisible && !isSearchTreeFolderMatchNoRoot(fileMatch.parent()), hideIcon: false, fileDecorations: { colors: decorationConfig.colors, badges: decorationConfig.badges } });
    const count = fileMatch.count();
    templateData.badge.setCount(count);
    templateData.badge.setTitleFormat(count > 1 ? nls.localize("searchMatches", "{0} matches found", count) : nls.localize("searchMatch", "{0} match found", count));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: fileMatch };
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());
    templateData.elementDisposables.add(fileMatch.onChange(() => {
      SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());
    }));
    const twistieContainer = templateData.el.parentElement?.parentElement?.querySelector(".monaco-tl-twistie");
    twistieContainer?.classList.add("force-twistie");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
FileMatchRenderer.TEMPLATE_ID = "fileMatch";
FileMatchRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], FileMatchRenderer);
let MatchRenderer = class extends Disposable {
  constructor(searchView, contextService, configurationService, instantiationService, contextKeyService, hoverService) {
    super();
    this.searchView = searchView;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.templateId = MatchRenderer.TEMPLATE_ID;
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible.");
  }
  renderTemplate(container) {
    container.classList.add("linematch");
    const lineNumber = DOM.append(container, DOM.$("span.matchLineNum"));
    const parent = DOM.append(container, DOM.$("a.plain.match"));
    const before = DOM.append(parent, DOM.$("span"));
    const match = DOM.append(parent, DOM.$("span.findInFileMatch"));
    const replace = DOM.append(parent, DOM.$("span.replaceMatch"));
    const after = DOM.append(parent, DOM.$("span"));
    const actionBarContainer = DOM.append(container, DOM.$("span.actionBarContainer"));
    const disposables = new DisposableStore();
    const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
    SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
    SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(true);
    SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
    SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);
    const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
    const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
      menuOptions: {
        shouldForwardArgs: true
      },
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: (g) => /^inline/.test(g)
      }
    }));
    const parentHover = disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), parent, ""));
    const lineNumberHover = disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), lineNumber, ""));
    return {
      parent,
      before,
      match,
      replace,
      after,
      lineNumber,
      actions,
      parentHover,
      lineNumberHover,
      disposables,
      contextKeyService: contextKeyServiceMain
    };
  }
  renderElement(node, index, templateData) {
    const match = node.element;
    const preview = match.preview();
    const replace = this.searchView.model.isReplaceActive() && !!this.searchView.model.replaceString && !match.isReadonly;
    templateData.before.textContent = preview.before;
    templateData.match.textContent = preview.inside;
    templateData.match.classList.toggle("replace", replace);
    templateData.replace.textContent = replace ? match.replaceString : "";
    templateData.after.textContent = preview.after;
    const title = (preview.fullBefore + (replace ? match.replaceString : preview.inside) + preview.after).trim().substr(0, 999);
    templateData.parentHover.update(title);
    SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!match.isReadonly);
    const numLines = match.range().endLineNumber - match.range().startLineNumber;
    const extraLinesStr = numLines > 0 ? `+${numLines}` : "";
    const showLineNumbers = this.configurationService.getValue("search").showLineNumbers;
    const lineNumberStr = showLineNumbers ? `${match.range().startLineNumber}:` : "";
    templateData.lineNumber.classList.toggle("show", numLines > 0 || showLineNumbers);
    templateData.lineNumber.textContent = lineNumberStr + extraLinesStr;
    templateData.lineNumberHover.update(this.getMatchTitle(match, showLineNumbers));
    templateData.actions.context = { viewer: this.searchView.getControl(), element: match };
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
  getMatchTitle(match, showLineNumbers) {
    const startLine = match.range().startLineNumber;
    const numLines = match.range().endLineNumber - match.range().startLineNumber;
    const lineNumStr = showLineNumbers ? nls.localize("lineNumStr", "From line {0}", startLine, numLines) + " " : "";
    const numLinesStr = numLines > 0 ? "+ " + nls.localize("numLinesStr", "{0} more lines", numLines) : "";
    return lineNumStr + numLinesStr;
  }
};
MatchRenderer.TEMPLATE_ID = "match";
MatchRenderer = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IHoverService)
], MatchRenderer);
let SearchAccessibilityProvider = class {
  constructor(searchView, labelService) {
    this.searchView = searchView;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return nls.localize("search", "Search");
  }
  getAriaLabel(element) {
    if (isSearchTreeFolderMatch(element)) {
      const count = element.allDownstreamFileMatches().reduce((total, current) => total + current.count(), 0);
      return element.resource ? nls.localize("folderMatchAriaLabel", "{0} matches in folder root {1}, Search result", count, element.name()) : nls.localize("otherFilesAriaLabel", "{0} matches outside of the workspace, Search result", count);
    }
    if (isSearchTreeFileMatch(element)) {
      const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
      return nls.localize("fileMatchAriaLabel", "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
    }
    if (isSearchTreeMatch(element)) {
      const match = element;
      const searchModel = this.searchView.model;
      const replace = searchModel.isReplaceActive() && !!searchModel.replaceString;
      const matchString = match.getMatchString();
      const range = match.range();
      const matchText = match.text().substr(0, range.endColumn + 150);
      if (replace) {
        return nls.localize("replacePreviewResultAria", "'{0}' at column {1} replace {2} with {3}", matchText, range.startColumn, matchString, match.replaceString);
      }
      return nls.localize("searchResultAria", "'{0}' at column {1} found {2}", matchText, range.startColumn, matchString);
    }
    return null;
  }
};
SearchAccessibilityProvider = __decorateClass([
  __decorateParam(1, ILabelService)
], SearchAccessibilityProvider);
export {
  FileMatchRenderer,
  FolderMatchRenderer,
  MatchRenderer,
  SearchAccessibilityProvider,
  SearchDelegate,
  TextSearchResultRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaFJlc3VsdHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwYXRocyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFNlYXJjaFZpZXcgfSBmcm9tICcuL3NlYXJjaFZpZXcuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElTZWFyY2hBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi9zZWFyY2hBY3Rpb25zUmVtb3ZlUmVwbGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgU2VhcmNoQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoVHJlZU1hdGNoLCBpc1NlYXJjaFRyZWVNYXRjaCwgUmVuZGVyYWJsZU1hdGNoLCBJVGV4dFNlYXJjaEhlYWRpbmcsIElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIElTZWFyY2hUcmVlRmlsZU1hdGNoLCBpc1NlYXJjaFRyZWVGaWxlTWF0Y2gsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBpc1RleHRTZWFyY2hIZWFkaW5nLCBJU2VhcmNoTW9kZWwsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hOb1Jvb3QsIGlzUGxhaW5UZXh0U2VhcmNoSGVhZGluZyB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuaW1wb3J0IHsgaXNTZWFyY2hUcmVlQUlGaWxlTWF0Y2ggfSBmcm9tICcuL0FJU2VhcmNoL2FpU2VhcmNoTW9kZWxCYXNlLmpzJztcblxuaW50ZXJmYWNlIElGb2xkZXJNYXRjaFRlbXBsYXRlIHtcblx0bGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRiYWRnZTogQ291bnRCYWRnZTtcblx0YWN0aW9uczogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xufVxuXG5pbnRlcmZhY2UgSVRleHRTZWFyY2hSZXN1bHRUZW1wbGF0ZSB7XG5cdGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0YWN0aW9uczogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG59XG5cbmludGVyZmFjZSBJRmlsZU1hdGNoVGVtcGxhdGUge1xuXHRlbDogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0YmFkZ2U6IENvdW50QmFkZ2U7XG5cdGFjdGlvbnM6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcbn1cblxuaW50ZXJmYWNlIElNYXRjaFRlbXBsYXRlIHtcblx0bGluZU51bWJlcjogSFRNTEVsZW1lbnQ7XG5cdHBhcmVudDogSFRNTEVsZW1lbnQ7XG5cdGJlZm9yZTogSFRNTEVsZW1lbnQ7XG5cdG1hdGNoOiBIVE1MRWxlbWVudDtcblx0cmVwbGFjZTogSFRNTEVsZW1lbnQ7XG5cdGFmdGVyOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uczogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHBhcmVudEhvdmVyOiBJTWFuYWdlZEhvdmVyO1xuXHRsaW5lTnVtYmVySG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFJlbmRlcmFibGVNYXRjaD4ge1xuXG5cdHB1YmxpYyBzdGF0aWMgSVRFTV9IRUlHSFQgPSAyMjtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gU2VhcmNoRGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRm9sZGVyTWF0Y2hSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEZpbGVNYXRjaFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBNYXRjaFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFRleHRTZWFyY2hSZXN1bHRSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cblx0XHRjb25zb2xlLmVycm9yKCdJbnZhbGlkIHNlYXJjaCB0cmVlIGVsZW1lbnQnLCBlbGVtZW50KTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc2VhcmNoIHRyZWUgZWxlbWVudCcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0U2VhcmNoUmVzdWx0UmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJVGV4dFNlYXJjaEhlYWRpbmcsIGFueSwgSVRleHRTZWFyY2hSZXN1bHRUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAndGV4dFJlc3VsdE1hdGNoJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gVGV4dFNlYXJjaFJlc3VsdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVGV4dFNlYXJjaFJlc3VsdFRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB0ZXh0U2VhcmNoUmVzdWx0RWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLnRleHRzZWFyY2hyZXN1bHQnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUodGV4dFNlYXJjaFJlc3VsdEVsZW1lbnQsIHsgc3VwcG9ydERlc2NyaXB0aW9uSGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFiZWwpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0ZXh0U2VhcmNoUmVzdWx0RWxlbWVudCwgRE9NLiQoJy5hY3Rpb25CYXJDb250YWluZXInKSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2VNYWluID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VNYWluXSkpKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIE1lbnVJZC5TZWFyY2hBY3Rpb25NZW51LCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdHByaW1hcnlHcm91cDogKGc6IHN0cmluZykgPT4gL15pbmxpbmUvLnRlc3QoZyksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRyZXR1cm4geyBsYWJlbCwgZGlzcG9zYWJsZXMsIGFjdGlvbnMsIGNvbnRleHRLZXlTZXJ2aWNlOiBjb250ZXh0S2V5U2VydmljZU1haW4gfTtcblx0fVxuXG5cdGFzeW5jIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElUZXh0U2VhcmNoSGVhZGluZywgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRm9sZGVyTWF0Y2hUZW1wbGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc1BsYWluVGV4dFNlYXJjaEhlYWRpbmcobm9kZS5lbGVtZW50KSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKG5scy5sb2NhbGl6ZSgnc2VhcmNoRm9sZGVyTWF0Y2gucGxhaW5UZXh0LmxhYmVsJywgXCJUZXh0IFJlc3VsdHNcIikpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5BSVJlc3VsdHNUaXRsZS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChmYWxzZSk7XG5cdFx0XHRTZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBub2RlLmVsZW1lbnQucGFyZW50KCkuc2VhcmNoTW9kZWwuZ2V0QUlUZXh0UmVzdWx0UHJvdmlkZXJOYW1lKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2FsaXplZExhYmVsID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnc2VhcmNoRm9sZGVyTWF0Y2guYWlUZXh0LmxhYmVsJyxcblx0XHRcdFx0Y29tbWVudDogWydUaGlzIGlzIGRpc3BsYXllZCBiZWZvcmUgdGhlIEFJIHRleHQgc2VhcmNoIHJlc3VsdHMsIG5vdyBhbHdheXMgXCJBSS1hc3Npc3RlZCByZXN1bHRzXCIuJ11cblx0XHRcdH0sICdBSS1hc3Npc3RlZCByZXN1bHRzJyk7XG5cblx0XHRcdC8vIHRvZG86IG1ha2UgaWNvbiBleHRlbnNpb24tY29udHJpYnV0ZWQuXG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwoYCQoJHtDb2RpY29uLnNlYXJjaFNwYXJrbGUuaWR9KSAke2xvY2FsaXplZExhYmVsfWApO1xuXG5cdFx0XHRTZWFyY2hDb250ZXh0LkFJUmVzdWx0c1RpdGxlLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHRcdFNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdFx0U2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXkuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHRcdFNlYXJjaENvbnRleHQuRm9sZGVyRm9jdXNLZXkuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRm9sZGVyTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVRleHRTZWFyY2hIZWFkaW5nPiwgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVGV4dFNlYXJjaFJlc3VsdFRlbXBsYXRlKTogdm9pZCB7XG5cdH1cblxufVxuZXhwb3J0IGNsYXNzIEZvbGRlck1hdGNoUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBhbnksIElGb2xkZXJNYXRjaFRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdmb2xkZXJNYXRjaCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEZvbGRlck1hdGNoUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBzZWFyY2hWaWV3OiBTZWFyY2hWaWV3LFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTZWFyY2hUcmVlRm9sZGVyTWF0Y2g+LCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcHJlc3NlZCA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBmb2xkZXIgPSBjb21wcmVzc2VkLmVsZW1lbnRzW2NvbXByZXNzZWQuZWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbGFiZWwgPSBjb21wcmVzc2VkLmVsZW1lbnRzLm1hcChlID0+IGUubmFtZSgpKTtcblxuXHRcdGlmIChmb2xkZXIucmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGZpbGVLaW5kID0gKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdChmb2xkZXIpKSA/IEZpbGVLaW5kLlJPT1RfRk9MREVSIDogRmlsZUtpbmQuRk9MREVSO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IGZvbGRlci5yZXNvdXJjZSwgbmFtZTogbGFiZWwgfSwge1xuXHRcdFx0XHRmaWxlS2luZCxcblx0XHRcdFx0c2VwYXJhdG9yOiB0aGlzLmxhYmVsU2VydmljZS5nZXRTZXBhcmF0b3IoZm9sZGVyLnJlc291cmNlLnNjaGVtZSksXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKG5scy5sb2NhbGl6ZSgnc2VhcmNoRm9sZGVyTWF0Y2gub3RoZXIubGFiZWwnLCBcIk90aGVyIGZpbGVzXCIpKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlckZvbGRlckRldGFpbHMoZm9sZGVyLCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElGb2xkZXJNYXRjaFRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGZvbGRlck1hdGNoRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmZvbGRlcm1hdGNoJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKGZvbGRlck1hdGNoRWxlbWVudCwgeyBzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFiZWwpO1xuXHRcdGNvbnN0IGJhZGdlID0gbmV3IENvdW50QmFkZ2UoRE9NLmFwcGVuZChmb2xkZXJNYXRjaEVsZW1lbnQsIERPTS4kKCcuYmFkZ2UnKSksIHt9LCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGJhZGdlKTtcblx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSBET00uYXBwZW5kKGZvbGRlck1hdGNoRWxlbWVudCwgRE9NLiQoJy5hY3Rpb25CYXJDb250YWluZXInKSk7XG5cblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZU1haW4gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0U2VhcmNoQ29udGV4dC5BSVJlc3VsdHNUaXRsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXHRcdFNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXHRcdFNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQodHJ1ZSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZU1haW5dKSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgTWVudUlkLlNlYXJjaEFjdGlvbk1lbnUsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoZzogc3RyaW5nKSA9PiAvXmlubGluZS8udGVzdChnKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0YmFkZ2UsXG5cdFx0XHRhY3Rpb25zLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXMsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogY29udGV4dEtleVNlcnZpY2VNYWluXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZvbGRlck1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IG5vZGUuZWxlbWVudDtcblx0XHRpZiAoZm9sZGVyTWF0Y2gucmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGZvbGRlck1hdGNoLnJlc291cmNlKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIgJiYgaXNFcXVhbCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBmb2xkZXJNYXRjaC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldEZpbGUoZm9sZGVyTWF0Y2gucmVzb3VyY2UsIHsgZmlsZUtpbmQ6IEZpbGVLaW5kLlJPT1RfRk9MREVSLCBoaWRlUGF0aDogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRGaWxlKGZvbGRlck1hdGNoLnJlc291cmNlLCB7IGZpbGVLaW5kOiBGaWxlS2luZC5GT0xERVIsIGhpZGVQYXRoOiB0aGlzLnNlYXJjaFZpZXcuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChubHMubG9jYWxpemUoJ3NlYXJjaEZvbGRlck1hdGNoLm90aGVyLmxhYmVsJywgXCJPdGhlciBmaWxlc1wiKSk7XG5cdFx0fVxuXG5cdFx0U2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoIWZvbGRlck1hdGNoLmhhc09ubHlSZWFkT25seU1hdGNoZXMoKSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChmb2xkZXJNYXRjaC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRTZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCghZm9sZGVyTWF0Y2guaGFzT25seVJlYWRPbmx5TWF0Y2hlcygpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlbmRlckZvbGRlckRldGFpbHMoZm9sZGVyTWF0Y2gsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UmVuZGVyYWJsZU1hdGNoLCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU2VhcmNoVHJlZUZvbGRlck1hdGNoPiwgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRm9sZGVyTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGb2xkZXJNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRm9sZGVyRGV0YWlscyhmb2xkZXI6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIHRlbXBsYXRlRGF0YTogSUZvbGRlck1hdGNoVGVtcGxhdGUpIHtcblx0XHRjb25zdCBjb3VudCA9IGZvbGRlci5yZWN1cnNpdmVNYXRjaENvdW50KCk7XG5cdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnNldENvdW50KGNvdW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc2V0VGl0bGVGb3JtYXQoY291bnQgPiAxID8gbmxzLmxvY2FsaXplKCdzZWFyY2hGaWxlTWF0Y2hlcycsIFwiezB9IGZpbGVzIGZvdW5kXCIsIGNvdW50KSA6IG5scy5sb2NhbGl6ZSgnc2VhcmNoRmlsZU1hdGNoJywgXCJ7MH0gZmlsZSBmb3VuZFwiLCBjb3VudCkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbnMuY29udGV4dCA9IHsgdmlld2VyOiB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLCBlbGVtZW50OiBmb2xkZXIgfSBzYXRpc2ZpZXMgSVNlYXJjaEFjdGlvbkNvbnRleHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVNYXRjaFJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVNlYXJjaFRyZWVGaWxlTWF0Y2gsIGFueSwgSUZpbGVNYXRjaFRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdmaWxlTWF0Y2gnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBGaWxlTWF0Y2hSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNlYXJjaFZpZXc6IFNlYXJjaFZpZXcsXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVNlYXJjaFRyZWVGaWxlTWF0Y2g+LCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlTWF0Y2hUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlLicpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElGaWxlTWF0Y2hUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGZpbGVNYXRjaEVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5maWxlbWF0Y2gnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUoZmlsZU1hdGNoRWxlbWVudCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhYmVsKTtcblx0XHRjb25zdCBiYWRnZSA9IG5ldyBDb3VudEJhZGdlKERPTS5hcHBlbmQoZmlsZU1hdGNoRWxlbWVudCwgRE9NLiQoJy5iYWRnZScpKSwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYmFkZ2UpO1xuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoZmlsZU1hdGNoRWxlbWVudCwgRE9NLiQoJy5hY3Rpb25CYXJDb250YWluZXInKSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZU1haW4gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0U2VhcmNoQ29udGV4dC5BSVJlc3VsdHNUaXRsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXHRcdFNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXHRcdFNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldCh0cnVlKTtcblx0XHRTZWFyY2hDb250ZXh0LkZvbGRlckZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZU1haW5dKSkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgTWVudUlkLlNlYXJjaEFjdGlvbk1lbnUsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoZzogc3RyaW5nKSA9PiAvXmlubGluZS8udGVzdChnKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsOiBmaWxlTWF0Y2hFbGVtZW50LFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRiYWRnZSxcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcyxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBjb250ZXh0S2V5U2VydmljZU1haW5cblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVNlYXJjaFRyZWVGaWxlTWF0Y2gsIGFueT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZpbGVNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsZU1hdGNoID0gbm9kZS5lbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5lbC5zZXRBdHRyaWJ1dGUoJ2RhdGEtcmVzb3VyY2UnLCBmaWxlTWF0Y2gucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKS5kZWNvcmF0aW9ucztcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0RmlsZShmaWxlTWF0Y2gucmVzb3VyY2UsIHsgcmFuZ2U6IGlzU2VhcmNoVHJlZUFJRmlsZU1hdGNoKGZpbGVNYXRjaCkgPyBmaWxlTWF0Y2guZ2V0RnVsbFJhbmdlKCkgOiB1bmRlZmluZWQsIGhpZGVQYXRoOiB0aGlzLnNlYXJjaFZpZXcuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUgJiYgIShpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdChmaWxlTWF0Y2gucGFyZW50KCkpKSwgaGlkZUljb246IGZhbHNlLCBmaWxlRGVjb3JhdGlvbnM6IHsgY29sb3JzOiBkZWNvcmF0aW9uQ29uZmlnLmNvbG9ycywgYmFkZ2VzOiBkZWNvcmF0aW9uQ29uZmlnLmJhZGdlcyB9IH0pO1xuXHRcdGNvbnN0IGNvdW50ID0gZmlsZU1hdGNoLmNvdW50KCk7XG5cdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnNldENvdW50KGNvdW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc2V0VGl0bGVGb3JtYXQoY291bnQgPiAxID8gbmxzLmxvY2FsaXplKCdzZWFyY2hNYXRjaGVzJywgXCJ7MH0gbWF0Y2hlcyBmb3VuZFwiLCBjb3VudCkgOiBubHMubG9jYWxpemUoJ3NlYXJjaE1hdGNoJywgXCJ7MH0gbWF0Y2ggZm91bmRcIiwgY291bnQpKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25zLmNvbnRleHQgPSB7IHZpZXdlcjogdGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKSwgZWxlbWVudDogZmlsZU1hdGNoIH0gc2F0aXNmaWVzIElTZWFyY2hBY3Rpb25Db250ZXh0O1xuXG5cdFx0U2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoIWZpbGVNYXRjaC5oYXNPbmx5UmVhZE9ubHlNYXRjaGVzKCkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZmlsZU1hdGNoLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KCFmaWxlTWF0Y2guaGFzT25seVJlYWRPbmx5TWF0Y2hlcygpKTtcblx0XHR9KSk7XG5cblx0XHQvLyB3aGVuIGhpZGVzRXhwbG9yZXJBcnJvd3M6IHRydWUsIHRoZW4gdGhlIGZpbGUgbm9kZXMgc2hvdWxkIHN0aWxsIGhhdmUgYSB0d2lzdGllIGJlY2F1c2UgaXQgd291bGQgb3RoZXJ3aXNlXG5cdFx0Ly8gYmUgaGFyZCB0byB0ZWxsIHdoZXRoZXIgdGhlIG5vZGUgaXMgY29sbGFwc2VkIG9yIGV4cGFuZGVkLlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHR3aXN0aWVDb250YWluZXIgPSB0ZW1wbGF0ZURhdGEuZWwucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvcignLm1vbmFjby10bC10d2lzdGllJyk7XG5cdFx0dHdpc3RpZUNvbnRhaW5lcj8uY2xhc3NMaXN0LmFkZCgnZm9yY2UtdHdpc3RpZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFJlbmRlcmFibGVNYXRjaCwgYW55PiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmlsZU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRmlsZU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXRjaFJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVNlYXJjaFRyZWVNYXRjaCwgdm9pZCwgSU1hdGNoVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ21hdGNoJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gTWF0Y2hSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNlYXJjaFZpZXc6IFNlYXJjaFZpZXcsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU2VhcmNoVHJlZU1hdGNoPiwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZS4nKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTWF0Y2hUZW1wbGF0ZSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2xpbmVtYXRjaCcpO1xuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnc3Bhbi5tYXRjaExpbmVOdW0nKSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdhLnBsYWluLm1hdGNoJykpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnc3BhbicpKTtcblx0XHRjb25zdCBtYXRjaCA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnc3Bhbi5maW5kSW5GaWxlTWF0Y2gnKSk7XG5cdFx0Y29uc3QgcmVwbGFjZSA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnc3Bhbi5yZXBsYWNlTWF0Y2gnKSk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdzcGFuLmFjdGlvbkJhckNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2VNYWluID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdFNlYXJjaENvbnRleHQuQUlSZXN1bHRzVGl0bGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KGZhbHNlKTtcblx0XHRTZWFyY2hDb250ZXh0Lk1hdGNoRm9jdXNLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlTWFpbikuc2V0KHRydWUpO1xuXHRcdFNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZU1haW4pLnNldChmYWxzZSk7XG5cdFx0U2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2VNYWluKS5zZXQoZmFsc2UpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VNYWluXSkpKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIE1lbnVJZC5TZWFyY2hBY3Rpb25NZW51LCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdHByaW1hcnlHcm91cDogKGc6IHN0cmluZykgPT4gL15pbmxpbmUvLnRlc3QoZyksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBhcmVudEhvdmVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBwYXJlbnQsICcnKSk7XG5cdFx0Y29uc3QgbGluZU51bWJlckhvdmVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBsaW5lTnVtYmVyLCAnJykpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcmVudCxcblx0XHRcdGJlZm9yZSxcblx0XHRcdG1hdGNoLFxuXHRcdFx0cmVwbGFjZSxcblx0XHRcdGFmdGVyLFxuXHRcdFx0bGluZU51bWJlcixcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRwYXJlbnRIb3Zlcixcblx0XHRcdGxpbmVOdW1iZXJIb3Zlcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNvbnRleHRLZXlTZXJ2aWNlTWFpblxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJU2VhcmNoVHJlZU1hdGNoLCBhbnk+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNYXRjaFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBub2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgcHJldmlldyA9IG1hdGNoLnByZXZpZXcoKTtcblx0XHRjb25zdCByZXBsYWNlID0gdGhpcy5zZWFyY2hWaWV3Lm1vZGVsLmlzUmVwbGFjZUFjdGl2ZSgpICYmXG5cdFx0XHQhIXRoaXMuc2VhcmNoVmlldy5tb2RlbC5yZXBsYWNlU3RyaW5nICYmXG5cdFx0XHQhbWF0Y2guaXNSZWFkb25seTtcblxuXHRcdHRlbXBsYXRlRGF0YS5iZWZvcmUudGV4dENvbnRlbnQgPSBwcmV2aWV3LmJlZm9yZTtcblx0XHR0ZW1wbGF0ZURhdGEubWF0Y2gudGV4dENvbnRlbnQgPSBwcmV2aWV3Lmluc2lkZTtcblx0XHR0ZW1wbGF0ZURhdGEubWF0Y2guY2xhc3NMaXN0LnRvZ2dsZSgncmVwbGFjZScsIHJlcGxhY2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXBsYWNlLnRleHRDb250ZW50ID0gcmVwbGFjZSA/IG1hdGNoLnJlcGxhY2VTdHJpbmcgOiAnJztcblx0XHR0ZW1wbGF0ZURhdGEuYWZ0ZXIudGV4dENvbnRlbnQgPSBwcmV2aWV3LmFmdGVyO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSAocHJldmlldy5mdWxsQmVmb3JlICsgKHJlcGxhY2UgPyBtYXRjaC5yZXBsYWNlU3RyaW5nIDogcHJldmlldy5pbnNpZGUpICsgcHJldmlldy5hZnRlcikudHJpbSgpLnN1YnN0cigwLCA5OTkpO1xuXHRcdHRlbXBsYXRlRGF0YS5wYXJlbnRIb3Zlci51cGRhdGUodGl0bGUpO1xuXG5cdFx0U2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoIW1hdGNoLmlzUmVhZG9ubHkpO1xuXG5cdFx0Y29uc3QgbnVtTGluZXMgPSBtYXRjaC5yYW5nZSgpLmVuZExpbmVOdW1iZXIgLSBtYXRjaC5yYW5nZSgpLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBleHRyYUxpbmVzU3RyID0gbnVtTGluZXMgPiAwID8gYCske251bUxpbmVzfWAgOiAnJztcblxuXHRcdGNvbnN0IHNob3dMaW5lTnVtYmVycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykuc2hvd0xpbmVOdW1iZXJzO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJTdHIgPSBzaG93TGluZU51bWJlcnMgPyBgJHttYXRjaC5yYW5nZSgpLnN0YXJ0TGluZU51bWJlcn06YCA6ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5saW5lTnVtYmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nob3cnLCAobnVtTGluZXMgPiAwKSB8fCBzaG93TGluZU51bWJlcnMpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmxpbmVOdW1iZXIudGV4dENvbnRlbnQgPSBsaW5lTnVtYmVyU3RyICsgZXh0cmFMaW5lc1N0cjtcblx0XHR0ZW1wbGF0ZURhdGEubGluZU51bWJlckhvdmVyLnVwZGF0ZSh0aGlzLmdldE1hdGNoVGl0bGUobWF0Y2gsIHNob3dMaW5lTnVtYmVycykpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbnMuY29udGV4dCA9IHsgdmlld2VyOiB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLCBlbGVtZW50OiBtYXRjaCB9IHNhdGlzZmllcyBJU2VhcmNoQWN0aW9uQ29udGV4dDtcblxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hdGNoVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXRjaFRpdGxlKG1hdGNoOiBJU2VhcmNoVHJlZU1hdGNoLCBzaG93TGluZU51bWJlcnM6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IG1hdGNoLnJhbmdlKCkuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG51bUxpbmVzID0gbWF0Y2gucmFuZ2UoKS5lbmRMaW5lTnVtYmVyIC0gbWF0Y2gucmFuZ2UoKS5zdGFydExpbmVOdW1iZXI7XG5cblx0XHRjb25zdCBsaW5lTnVtU3RyID0gc2hvd0xpbmVOdW1iZXJzID9cblx0XHRcdG5scy5sb2NhbGl6ZSgnbGluZU51bVN0cicsIFwiRnJvbSBsaW5lIHswfVwiLCBzdGFydExpbmUsIG51bUxpbmVzKSArICcgJyA6XG5cdFx0XHQnJztcblxuXHRcdGNvbnN0IG51bUxpbmVzU3RyID0gbnVtTGluZXMgPiAwID9cblx0XHRcdCcrICcgKyBubHMubG9jYWxpemUoJ251bUxpbmVzU3RyJywgXCJ7MH0gbW9yZSBsaW5lc1wiLCBudW1MaW5lcykgOlxuXHRcdFx0Jyc7XG5cblx0XHRyZXR1cm4gbGluZU51bVN0ciArIG51bUxpbmVzU3RyO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxSZW5kZXJhYmxlTWF0Y2g+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNlYXJjaFZpZXc6IFNlYXJjaFZpZXcsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzZWFyY2gnLCBcIlNlYXJjaFwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2gpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGNvdW50ID0gZWxlbWVudC5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKS5yZWR1Y2UoKHRvdGFsLCBjdXJyZW50KSA9PiB0b3RhbCArIGN1cnJlbnQuY291bnQoKSwgMCk7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZSA/XG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZm9sZGVyTWF0Y2hBcmlhTGFiZWwnLCBcInswfSBtYXRjaGVzIGluIGZvbGRlciByb290IHsxfSwgU2VhcmNoIHJlc3VsdFwiLCBjb3VudCwgZWxlbWVudC5uYW1lKCkpIDpcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdvdGhlckZpbGVzQXJpYUxhYmVsJywgXCJ7MH0gbWF0Y2hlcyBvdXRzaWRlIG9mIHRoZSB3b3Jrc3BhY2UsIFNlYXJjaCByZXN1bHRcIiwgY291bnQpO1xuXHRcdH1cblxuXHRcdGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LnJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pIHx8IGVsZW1lbnQucmVzb3VyY2UuZnNQYXRoO1xuXG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdmaWxlTWF0Y2hBcmlhTGFiZWwnLCBcInswfSBtYXRjaGVzIGluIGZpbGUgezF9IG9mIGZvbGRlciB7Mn0sIFNlYXJjaCByZXN1bHRcIiwgZWxlbWVudC5jb3VudCgpLCBlbGVtZW50Lm5hbWUoKSwgcGF0aHMuZGlybmFtZShwYXRoKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IDxJU2VhcmNoVHJlZU1hdGNoPmVsZW1lbnQ7XG5cdFx0XHRjb25zdCBzZWFyY2hNb2RlbDogSVNlYXJjaE1vZGVsID0gdGhpcy5zZWFyY2hWaWV3Lm1vZGVsO1xuXHRcdFx0Y29uc3QgcmVwbGFjZSA9IHNlYXJjaE1vZGVsLmlzUmVwbGFjZUFjdGl2ZSgpICYmICEhc2VhcmNoTW9kZWwucmVwbGFjZVN0cmluZztcblx0XHRcdGNvbnN0IG1hdGNoU3RyaW5nID0gbWF0Y2guZ2V0TWF0Y2hTdHJpbmcoKTtcblx0XHRcdGNvbnN0IHJhbmdlID0gbWF0Y2gucmFuZ2UoKTtcblx0XHRcdGNvbnN0IG1hdGNoVGV4dCA9IG1hdGNoLnRleHQoKS5zdWJzdHIoMCwgcmFuZ2UuZW5kQ29sdW1uICsgMTUwKTtcblx0XHRcdGlmIChyZXBsYWNlKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VQcmV2aWV3UmVzdWx0QXJpYScsIFwiJ3swfScgYXQgY29sdW1uIHsxfSByZXBsYWNlIHsyfSB3aXRoIHszfVwiLCBtYXRjaFRleHQsIHJhbmdlLnN0YXJ0Q29sdW1uLCBtYXRjaFN0cmluZywgbWF0Y2gucmVwbGFjZVN0cmluZyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NlYXJjaFJlc3VsdEFyaWEnLCBcIid7MH0nIGF0IGNvbHVtbiB7MX0gZm91bmQgezJ9XCIsIG1hdGNoVGV4dCwgcmFuZ2Uuc3RhcnRDb2x1bW4sIG1hdGNoU3RyaW5nKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBSTNCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGdDQUFnQztBQUd6QyxTQUFTLGVBQWU7QUFHeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUV6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUV4QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBMkIsbUJBQXNHLHVCQUF1Qix5QkFBeUIscUJBQW1DLHNDQUFzQywrQkFBK0IsZ0NBQWdDO0FBQ3pULFNBQVMsK0JBQStCO0FBMENqQyxNQUFNLGtCQUFOLE1BQU0sZ0JBQWdFO0FBQUEsRUFJNUUsVUFBVSxTQUFrQztBQUMzQyxXQUFPLGdCQUFlO0FBQUEsRUFDdkI7QUFBQSxFQUVBLGNBQWMsU0FBa0M7QUFDL0MsUUFBSSx3QkFBd0IsT0FBTyxHQUFHO0FBQ3JDLGFBQU8sb0JBQW9CO0FBQUEsSUFDNUIsV0FBVyxzQkFBc0IsT0FBTyxHQUFHO0FBQzFDLGFBQU8sa0JBQWtCO0FBQUEsSUFDMUIsV0FBVyxrQkFBa0IsT0FBTyxHQUFHO0FBQ3RDLGFBQU8sY0FBYztBQUFBLElBQ3RCLFdBQVcsb0JBQW9CLE9BQU8sR0FBRztBQUN4QyxhQUFPLHlCQUF5QjtBQUFBLElBQ2pDO0FBRUEsWUFBUSxNQUFNLCtCQUErQixPQUFPO0FBQ3BELFVBQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUFBLEVBQzlDO0FBQ0Q7QUF0QmEsZ0JBRUUsY0FBYztBQUZ0QixJQUFNLGlCQUFOO0FBd0JBLElBQU0sMkJBQU4sY0FBdUMsV0FBb0c7QUFBQSxFQUtqSixZQUNTLFFBQzRCLGdCQUNJLHNCQUNILG1CQUNwQztBQUNELFVBQU07QUFMRTtBQUM0QjtBQUNJO0FBQ0g7QUFOdEMsU0FBUyxhQUFhLHlCQUF5QjtBQUFBLEVBUy9DO0FBQUEsRUFDQSxlQUFlLFdBQW1EO0FBQ2pFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLDBCQUEwQixJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsbUJBQW1CLENBQUM7QUFDaEYsVUFBTSxRQUFRLEtBQUssT0FBTyxPQUFPLHlCQUF5QixFQUFFLDhCQUE4QixNQUFNLG1CQUFtQixNQUFNLGNBQWMsS0FBSyxDQUFDO0FBQzdJLGdCQUFZLElBQUksS0FBSztBQUVyQixVQUFNLHFCQUFxQixJQUFJLE9BQU8seUJBQXlCLElBQUksRUFBRSxxQkFBcUIsQ0FBQztBQUMzRixVQUFNLHdCQUF3QixZQUFZLElBQUksS0FBSyxrQkFBa0IsYUFBYSxTQUFTLENBQUM7QUFFNUYsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLEtBQUsscUJBQXFCLFlBQVksSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0FBQ3RKLFVBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLG9CQUFvQixPQUFPLGtCQUFrQjtBQUFBLE1BQ3RJLGFBQWE7QUFBQSxRQUNaLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSx1QkFBdUI7QUFBQSxNQUN2QixvQkFBb0IsbUJBQW1CO0FBQUEsTUFDdkMsZ0JBQWdCO0FBQUEsUUFDZixjQUFjLENBQUMsTUFBYyxVQUFVLEtBQUssQ0FBQztBQUFBLE1BQzlDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixXQUFPLEVBQUUsT0FBTyxhQUFhLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUFBLEVBQ2hGO0FBQUEsRUFFQSxNQUFNLGNBQWMsTUFBMEMsT0FBZSxjQUFtRDtBQUMvSCxRQUFJLHlCQUF5QixLQUFLLE9BQU8sR0FBRztBQUMzQyxtQkFBYSxNQUFNLFNBQVMsSUFBSSxTQUFTLHFDQUFxQyxjQUFjLENBQUM7QUFDN0Ysb0JBQWMsZUFBZSxPQUFPLGFBQWEsaUJBQWlCLEVBQUUsSUFBSSxLQUFLO0FBQzdFLG9CQUFjLGNBQWMsT0FBTyxhQUFhLGlCQUFpQixFQUFFLElBQUksS0FBSztBQUM1RSxvQkFBYyxhQUFhLE9BQU8sYUFBYSxpQkFBaUIsRUFBRSxJQUFJLEtBQUs7QUFDM0Usb0JBQWMsZUFBZSxPQUFPLGFBQWEsaUJBQWlCLEVBQUUsSUFBSSxLQUFLO0FBQUEsSUFDOUUsT0FBTztBQUNOLFVBQUk7QUFDSCxjQUFNLEtBQUssUUFBUSxPQUFPLEVBQUUsWUFBWSw0QkFBNEI7QUFBQSxNQUNyRSxRQUFRO0FBQUEsTUFFUjtBQUVBLFlBQU0saUJBQWlCLElBQUksU0FBUztBQUFBLFFBQ25DLEtBQUs7QUFBQSxRQUNMLFNBQVMsQ0FBQyx3RkFBd0Y7QUFBQSxNQUNuRyxHQUFHLHFCQUFxQjtBQUd4QixtQkFBYSxNQUFNLFNBQVMsS0FBSyxRQUFRLGNBQWMsRUFBRSxLQUFLLGNBQWMsRUFBRTtBQUU5RSxvQkFBYyxlQUFlLE9BQU8sYUFBYSxpQkFBaUIsRUFBRSxJQUFJLElBQUk7QUFDNUUsb0JBQWMsY0FBYyxPQUFPLGFBQWEsaUJBQWlCLEVBQUUsSUFBSSxLQUFLO0FBQzVFLG9CQUFjLGFBQWEsT0FBTyxhQUFhLGlCQUFpQixFQUFFLElBQUksS0FBSztBQUMzRSxvQkFBYyxlQUFlLE9BQU8sYUFBYSxpQkFBaUIsRUFBRSxJQUFJLEtBQUs7QUFBQSxJQUM5RTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGdCQUFnQixjQUEwQztBQUN6RCxpQkFBYSxZQUFZLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEseUJBQXlCLE1BQStELE9BQWUsY0FBK0M7QUFBQSxFQUN0SjtBQUVEO0FBeEVhLHlCQUNJLGNBQWM7QUFEbEIsMkJBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBeUVOLElBQU0sc0JBQU4sY0FBa0MsV0FBbUc7QUFBQSxFQUszSSxZQUNTLFlBQ0EsUUFDNEIsZ0JBQ0osY0FDUSxzQkFDSCxtQkFDcEM7QUFDRCxVQUFNO0FBUEU7QUFDQTtBQUM0QjtBQUNKO0FBQ1E7QUFDSDtBQVJ0QyxTQUFTLGFBQWEsb0JBQW9CO0FBQUEsRUFXMUM7QUFBQSxFQUVBLHlCQUF5QixNQUFtRSxPQUFlLGNBQTBDO0FBQ3BKLFVBQU0sYUFBYSxLQUFLO0FBQ3hCLFVBQU0sU0FBUyxXQUFXLFNBQVMsV0FBVyxTQUFTLFNBQVMsQ0FBQztBQUNqRSxVQUFNLFFBQVEsV0FBVyxTQUFTLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQztBQUVuRCxRQUFJLE9BQU8sVUFBVTtBQUNwQixZQUFNLFdBQVkscUNBQXFDLE1BQU0sSUFBSyxTQUFTLGNBQWMsU0FBUztBQUNsRyxtQkFBYSxNQUFNLFlBQVksRUFBRSxVQUFVLE9BQU8sVUFBVSxNQUFNLE1BQU0sR0FBRztBQUFBLFFBQzFFO0FBQUEsUUFDQSxXQUFXLEtBQUssYUFBYSxhQUFhLE9BQU8sU0FBUyxNQUFNO0FBQUEsTUFDakUsQ0FBQztBQUFBLElBQ0YsT0FBTztBQUNOLG1CQUFhLE1BQU0sU0FBUyxJQUFJLFNBQVMsaUNBQWlDLGFBQWEsQ0FBQztBQUFBLElBQ3pGO0FBRUEsU0FBSyxvQkFBb0IsUUFBUSxZQUFZO0FBQUEsRUFDOUM7QUFBQSxFQUVBLGVBQWUsV0FBOEM7QUFDNUQsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQU0scUJBQXFCLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxjQUFjLENBQUM7QUFDdEUsVUFBTSxRQUFRLEtBQUssT0FBTyxPQUFPLG9CQUFvQixFQUFFLDhCQUE4QixNQUFNLG1CQUFtQixLQUFLLENBQUM7QUFDcEgsZ0JBQVksSUFBSSxLQUFLO0FBQ3JCLFVBQU0sUUFBUSxJQUFJLFdBQVcsSUFBSSxPQUFPLG9CQUFvQixJQUFJLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLHVCQUF1QjtBQUN6RyxnQkFBWSxJQUFJLEtBQUs7QUFDckIsVUFBTSxxQkFBcUIsSUFBSSxPQUFPLG9CQUFvQixJQUFJLEVBQUUscUJBQXFCLENBQUM7QUFFdEYsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsZ0JBQVksSUFBSSxrQkFBa0I7QUFFbEMsVUFBTSx3QkFBd0IsWUFBWSxJQUFJLEtBQUssa0JBQWtCLGFBQWEsU0FBUyxDQUFDO0FBQzVGLGtCQUFjLGVBQWUsT0FBTyxxQkFBcUIsRUFBRSxJQUFJLEtBQUs7QUFDcEUsa0JBQWMsY0FBYyxPQUFPLHFCQUFxQixFQUFFLElBQUksS0FBSztBQUNuRSxrQkFBYyxhQUFhLE9BQU8scUJBQXFCLEVBQUUsSUFBSSxLQUFLO0FBQ2xFLGtCQUFjLGVBQWUsT0FBTyxxQkFBcUIsRUFBRSxJQUFJLElBQUk7QUFFbkUsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLEtBQUsscUJBQXFCLFlBQVksSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0FBQ3RKLFVBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLG9CQUFvQixPQUFPLGtCQUFrQjtBQUFBLE1BQ3RJLGFBQWE7QUFBQSxRQUNaLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxvQkFBb0IsbUJBQW1CO0FBQUEsTUFDdkMsZ0JBQWdCO0FBQUEsUUFDZixjQUFjLENBQUMsTUFBYyxVQUFVLEtBQUssQ0FBQztBQUFBLE1BQzlDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxNQUE4QyxPQUFlLGNBQTBDO0FBQ3BILFVBQU0sY0FBYyxLQUFLO0FBQ3pCLFFBQUksWUFBWSxVQUFVO0FBQ3pCLFlBQU0sa0JBQWtCLEtBQUssZUFBZSxtQkFBbUIsWUFBWSxRQUFRO0FBQ25GLFVBQUksbUJBQW1CLFFBQVEsZ0JBQWdCLEtBQUssWUFBWSxRQUFRLEdBQUc7QUFDMUUscUJBQWEsTUFBTSxRQUFRLFlBQVksVUFBVSxFQUFFLFVBQVUsU0FBUyxhQUFhLFVBQVUsS0FBSyxDQUFDO0FBQUEsTUFDcEcsT0FBTztBQUNOLHFCQUFhLE1BQU0sUUFBUSxZQUFZLFVBQVUsRUFBRSxVQUFVLFNBQVMsUUFBUSxVQUFVLEtBQUssV0FBVyx3QkFBd0IsQ0FBQztBQUFBLE1BQ2xJO0FBQUEsSUFDRCxPQUFPO0FBQ04sbUJBQWEsTUFBTSxTQUFTLElBQUksU0FBUyxpQ0FBaUMsYUFBYSxDQUFDO0FBQUEsSUFDekY7QUFFQSxrQkFBYyxrQkFBa0IsT0FBTyxhQUFhLGlCQUFpQixFQUFFLElBQUksQ0FBQyxZQUFZLHVCQUF1QixDQUFDO0FBRWhILGlCQUFhLG1CQUFtQixJQUFJLFlBQVksU0FBUyxNQUFNO0FBQzlELG9CQUFjLGtCQUFrQixPQUFPLGFBQWEsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFlBQVksdUJBQXVCLENBQUM7QUFBQSxJQUNqSCxDQUFDLENBQUM7QUFFRixTQUFLLG9CQUFvQixhQUFhLFlBQVk7QUFBQSxFQUNuRDtBQUFBLEVBRUEsZUFBZSxTQUEwQyxPQUFlLGNBQTBDO0FBQ2pILGlCQUFhLG1CQUFtQixNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVBLDBCQUEwQixNQUFtRSxPQUFlLGNBQTBDO0FBQ3JKLGlCQUFhLG1CQUFtQixNQUFNO0FBQUEsRUFDdkM7QUFBQSxFQUVBLGdCQUFnQixjQUEwQztBQUN6RCxpQkFBYSxZQUFZLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRVEsb0JBQW9CLFFBQWdDLGNBQW9DO0FBQy9GLFVBQU0sUUFBUSxPQUFPLG9CQUFvQjtBQUN6QyxpQkFBYSxNQUFNLFNBQVMsS0FBSztBQUNqQyxpQkFBYSxNQUFNLGVBQWUsUUFBUSxJQUFJLElBQUksU0FBUyxxQkFBcUIsbUJBQW1CLEtBQUssSUFBSSxJQUFJLFNBQVMsbUJBQW1CLGtCQUFrQixLQUFLLENBQUM7QUFFcEssaUJBQWEsUUFBUSxVQUFVLEVBQUUsUUFBUSxLQUFLLFdBQVcsV0FBVyxHQUFHLFNBQVMsT0FBTztBQUFBLEVBQ3hGO0FBQ0Q7QUFuSGEsb0JBQ0ksY0FBYztBQURsQixzQkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVO0FBcUhOLElBQU0sb0JBQU4sY0FBZ0MsV0FBK0Y7QUFBQSxFQUtySSxZQUNTLFlBQ0EsUUFDNEIsZ0JBQ0ksc0JBQ0Esc0JBQ0gsbUJBQ3BDO0FBQ0QsVUFBTTtBQVBFO0FBQ0E7QUFDNEI7QUFDSTtBQUNBO0FBQ0g7QUFSdEMsU0FBUyxhQUFhLGtCQUFrQjtBQUFBLEVBV3hDO0FBQUEsRUFFQSx5QkFBeUIsTUFBaUUsT0FBZSxjQUF3QztBQUNoSixVQUFNLElBQUksTUFBTSxtREFBbUQ7QUFBQSxFQUNwRTtBQUFBLEVBRUEsZUFBZSxXQUE0QztBQUMxRCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsZ0JBQVksSUFBSSxrQkFBa0I7QUFDbEMsVUFBTSxtQkFBbUIsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLFlBQVksQ0FBQztBQUNsRSxVQUFNLFFBQVEsS0FBSyxPQUFPLE9BQU8sZ0JBQWdCO0FBQ2pELGdCQUFZLElBQUksS0FBSztBQUNyQixVQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksT0FBTyxrQkFBa0IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyx1QkFBdUI7QUFDdkcsZ0JBQVksSUFBSSxLQUFLO0FBQ3JCLFVBQU0scUJBQXFCLElBQUksT0FBTyxrQkFBa0IsSUFBSSxFQUFFLHFCQUFxQixDQUFDO0FBRXBGLFVBQU0sd0JBQXdCLFlBQVksSUFBSSxLQUFLLGtCQUFrQixhQUFhLFNBQVMsQ0FBQztBQUM1RixrQkFBYyxlQUFlLE9BQU8scUJBQXFCLEVBQUUsSUFBSSxLQUFLO0FBQ3BFLGtCQUFjLGNBQWMsT0FBTyxxQkFBcUIsRUFBRSxJQUFJLEtBQUs7QUFDbkUsa0JBQWMsYUFBYSxPQUFPLHFCQUFxQixFQUFFLElBQUksSUFBSTtBQUNqRSxrQkFBYyxlQUFlLE9BQU8scUJBQXFCLEVBQUUsSUFBSSxLQUFLO0FBRXBFLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxLQUFLLHFCQUFxQixZQUFZLElBQUksa0JBQWtCLENBQUMsb0JBQW9CLHFCQUFxQixDQUFDLENBQUMsQ0FBQztBQUN0SixVQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHNCQUFzQixvQkFBb0IsT0FBTyxrQkFBa0I7QUFBQSxNQUN0SSxhQUFhO0FBQUEsUUFDWixtQkFBbUI7QUFBQSxNQUNwQjtBQUFBLE1BQ0Esb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZDLGdCQUFnQjtBQUFBLFFBQ2YsY0FBYyxDQUFDLE1BQWMsVUFBVSxLQUFLLENBQUM7QUFBQSxNQUM5QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0o7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxtQkFBbUI7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGNBQWMsTUFBNEMsT0FBZSxjQUF3QztBQUNoSCxVQUFNLFlBQVksS0FBSztBQUN2QixpQkFBYSxHQUFHLGFBQWEsaUJBQWlCLFVBQVUsU0FBUyxTQUFTLENBQUM7QUFFM0UsVUFBTSxtQkFBbUIsS0FBSyxxQkFBcUIsU0FBeUMsUUFBUSxFQUFFO0FBQ3RHLGlCQUFhLE1BQU0sUUFBUSxVQUFVLFVBQVUsRUFBRSxPQUFPLHdCQUF3QixTQUFTLElBQUksVUFBVSxhQUFhLElBQUksUUFBVyxVQUFVLEtBQUssV0FBVywyQkFBMkIsQ0FBRSw4QkFBOEIsVUFBVSxPQUFPLENBQUMsR0FBSSxVQUFVLE9BQU8saUJBQWlCLEVBQUUsUUFBUSxpQkFBaUIsUUFBUSxRQUFRLGlCQUFpQixPQUFPLEVBQUUsQ0FBQztBQUN0VixVQUFNLFFBQVEsVUFBVSxNQUFNO0FBQzlCLGlCQUFhLE1BQU0sU0FBUyxLQUFLO0FBQ2pDLGlCQUFhLE1BQU0sZUFBZSxRQUFRLElBQUksSUFBSSxTQUFTLGlCQUFpQixxQkFBcUIsS0FBSyxJQUFJLElBQUksU0FBUyxlQUFlLG1CQUFtQixLQUFLLENBQUM7QUFFL0osaUJBQWEsUUFBUSxVQUFVLEVBQUUsUUFBUSxLQUFLLFdBQVcsV0FBVyxHQUFHLFNBQVMsVUFBVTtBQUUxRixrQkFBYyxrQkFBa0IsT0FBTyxhQUFhLGlCQUFpQixFQUFFLElBQUksQ0FBQyxVQUFVLHVCQUF1QixDQUFDO0FBRTlHLGlCQUFhLG1CQUFtQixJQUFJLFVBQVUsU0FBUyxNQUFNO0FBQzVELG9CQUFjLGtCQUFrQixPQUFPLGFBQWEsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsdUJBQXVCLENBQUM7QUFBQSxJQUMvRyxDQUFDLENBQUM7QUFLRixVQUFNLG1CQUFtQixhQUFhLEdBQUcsZUFBZSxlQUFlLGNBQWMsb0JBQW9CO0FBQ3pHLHNCQUFrQixVQUFVLElBQUksZUFBZTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxlQUFlLFNBQTBDLE9BQWUsY0FBd0M7QUFDL0csaUJBQWEsbUJBQW1CLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsZ0JBQWdCLGNBQXdDO0FBQ3ZELGlCQUFhLFlBQVksUUFBUTtBQUFBLEVBQ2xDO0FBQ0Q7QUEzRmEsa0JBQ0ksY0FBYztBQURsQixvQkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVO0FBNkZOLElBQU0sZ0JBQU4sY0FBNEIsV0FBd0Y7QUFBQSxFQUsxSCxZQUNTLFlBQzRCLGdCQUNJLHNCQUNBLHNCQUNILG1CQUNMLGNBQy9CO0FBQ0QsVUFBTTtBQVBFO0FBQzRCO0FBQ0k7QUFDQTtBQUNIO0FBQ0w7QUFSakMsU0FBUyxhQUFhLGNBQWM7QUFBQSxFQVdwQztBQUFBLEVBQ0EseUJBQXlCLE1BQThELE9BQWUsY0FBb0M7QUFDekksVUFBTSxJQUFJLE1BQU0sbURBQW1EO0FBQUEsRUFDcEU7QUFBQSxFQUVBLGVBQWUsV0FBd0M7QUFDdEQsY0FBVSxVQUFVLElBQUksV0FBVztBQUVuQyxVQUFNLGFBQWEsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLG1CQUFtQixDQUFDO0FBQ25FLFVBQU0sU0FBUyxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsZUFBZSxDQUFDO0FBQzNELFVBQU0sU0FBUyxJQUFJLE9BQU8sUUFBUSxJQUFJLEVBQUUsTUFBTSxDQUFDO0FBQy9DLFVBQU0sUUFBUSxJQUFJLE9BQU8sUUFBUSxJQUFJLEVBQUUsc0JBQXNCLENBQUM7QUFDOUQsVUFBTSxVQUFVLElBQUksT0FBTyxRQUFRLElBQUksRUFBRSxtQkFBbUIsQ0FBQztBQUM3RCxVQUFNLFFBQVEsSUFBSSxPQUFPLFFBQVEsSUFBSSxFQUFFLE1BQU0sQ0FBQztBQUM5QyxVQUFNLHFCQUFxQixJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUseUJBQXlCLENBQUM7QUFFakYsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQU0sd0JBQXdCLFlBQVksSUFBSSxLQUFLLGtCQUFrQixhQUFhLFNBQVMsQ0FBQztBQUM1RixrQkFBYyxlQUFlLE9BQU8scUJBQXFCLEVBQUUsSUFBSSxLQUFLO0FBQ3BFLGtCQUFjLGNBQWMsT0FBTyxxQkFBcUIsRUFBRSxJQUFJLElBQUk7QUFDbEUsa0JBQWMsYUFBYSxPQUFPLHFCQUFxQixFQUFFLElBQUksS0FBSztBQUNsRSxrQkFBYyxlQUFlLE9BQU8scUJBQXFCLEVBQUUsSUFBSSxLQUFLO0FBRXBFLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxLQUFLLHFCQUFxQixZQUFZLElBQUksa0JBQWtCLENBQUMsb0JBQW9CLHFCQUFxQixDQUFDLENBQUMsQ0FBQztBQUN0SixVQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHNCQUFzQixvQkFBb0IsT0FBTyxrQkFBa0I7QUFBQSxNQUN0SSxhQUFhO0FBQUEsUUFDWixtQkFBbUI7QUFBQSxNQUNwQjtBQUFBLE1BQ0Esb0JBQW9CLG1CQUFtQjtBQUFBLE1BQ3ZDLGdCQUFnQjtBQUFBLFFBQ2YsY0FBYyxDQUFDLE1BQWMsVUFBVSxLQUFLLENBQUM7QUFBQSxNQUM5QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxjQUFjLFlBQVksSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDckgsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxZQUFZLEVBQUUsQ0FBQztBQUU3SCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsbUJBQW1CO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLE1BQXdDLE9BQWUsY0FBb0M7QUFDeEcsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxVQUFVLE1BQU0sUUFBUTtBQUM5QixVQUFNLFVBQVUsS0FBSyxXQUFXLE1BQU0sZ0JBQWdCLEtBQ3JELENBQUMsQ0FBQyxLQUFLLFdBQVcsTUFBTSxpQkFDeEIsQ0FBQyxNQUFNO0FBRVIsaUJBQWEsT0FBTyxjQUFjLFFBQVE7QUFDMUMsaUJBQWEsTUFBTSxjQUFjLFFBQVE7QUFDekMsaUJBQWEsTUFBTSxVQUFVLE9BQU8sV0FBVyxPQUFPO0FBQ3RELGlCQUFhLFFBQVEsY0FBYyxVQUFVLE1BQU0sZ0JBQWdCO0FBQ25FLGlCQUFhLE1BQU0sY0FBYyxRQUFRO0FBRXpDLFVBQU0sU0FBUyxRQUFRLGNBQWMsVUFBVSxNQUFNLGdCQUFnQixRQUFRLFVBQVUsUUFBUSxPQUFPLEtBQUssRUFBRSxPQUFPLEdBQUcsR0FBRztBQUMxSCxpQkFBYSxZQUFZLE9BQU8sS0FBSztBQUVyQyxrQkFBYyxrQkFBa0IsT0FBTyxhQUFhLGlCQUFpQixFQUFFLElBQUksQ0FBQyxNQUFNLFVBQVU7QUFFNUYsVUFBTSxXQUFXLE1BQU0sTUFBTSxFQUFFLGdCQUFnQixNQUFNLE1BQU0sRUFBRTtBQUM3RCxVQUFNLGdCQUFnQixXQUFXLElBQUksSUFBSSxRQUFRLEtBQUs7QUFFdEQsVUFBTSxrQkFBa0IsS0FBSyxxQkFBcUIsU0FBeUMsUUFBUSxFQUFFO0FBQ3JHLFVBQU0sZ0JBQWdCLGtCQUFrQixHQUFHLE1BQU0sTUFBTSxFQUFFLGVBQWUsTUFBTTtBQUM5RSxpQkFBYSxXQUFXLFVBQVUsT0FBTyxRQUFTLFdBQVcsS0FBTSxlQUFlO0FBRWxGLGlCQUFhLFdBQVcsY0FBYyxnQkFBZ0I7QUFDdEQsaUJBQWEsZ0JBQWdCLE9BQU8sS0FBSyxjQUFjLE9BQU8sZUFBZSxDQUFDO0FBRTlFLGlCQUFhLFFBQVEsVUFBVSxFQUFFLFFBQVEsS0FBSyxXQUFXLFdBQVcsR0FBRyxTQUFTLE1BQU07QUFBQSxFQUV2RjtBQUFBLEVBRUEsZ0JBQWdCLGNBQW9DO0FBQ25ELGlCQUFhLFlBQVksUUFBUTtBQUFBLEVBQ2xDO0FBQUEsRUFFUSxjQUFjLE9BQXlCLGlCQUFrQztBQUNoRixVQUFNLFlBQVksTUFBTSxNQUFNLEVBQUU7QUFDaEMsVUFBTSxXQUFXLE1BQU0sTUFBTSxFQUFFLGdCQUFnQixNQUFNLE1BQU0sRUFBRTtBQUU3RCxVQUFNLGFBQWEsa0JBQ2xCLElBQUksU0FBUyxjQUFjLGlCQUFpQixXQUFXLFFBQVEsSUFBSSxNQUNuRTtBQUVELFVBQU0sY0FBYyxXQUFXLElBQzlCLE9BQU8sSUFBSSxTQUFTLGVBQWUsa0JBQWtCLFFBQVEsSUFDN0Q7QUFFRCxXQUFPLGFBQWE7QUFBQSxFQUNyQjtBQUNEO0FBckhhLGNBQ0ksY0FBYztBQURsQixnQkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTtBQXVITixJQUFNLDhCQUFOLE1BQXlGO0FBQUEsRUFFL0YsWUFDUyxZQUN3QixjQUMvQjtBQUZPO0FBQ3dCO0FBQUEsRUFFakM7QUFBQSxFQUVBLHFCQUE2QjtBQUM1QixXQUFPLElBQUksU0FBUyxVQUFVLFFBQVE7QUFBQSxFQUN2QztBQUFBLEVBRUEsYUFBYSxTQUF5QztBQUNyRCxRQUFJLHdCQUF3QixPQUFPLEdBQUc7QUFDckMsWUFBTSxRQUFRLFFBQVEseUJBQXlCLEVBQUUsT0FBTyxDQUFDLE9BQU8sWUFBWSxRQUFRLFFBQVEsTUFBTSxHQUFHLENBQUM7QUFDdEcsYUFBTyxRQUFRLFdBQ2QsSUFBSSxTQUFTLHdCQUF3QixpREFBaUQsT0FBTyxRQUFRLEtBQUssQ0FBQyxJQUMzRyxJQUFJLFNBQVMsdUJBQXVCLHVEQUF1RCxLQUFLO0FBQUEsSUFDbEc7QUFFQSxRQUFJLHNCQUFzQixPQUFPLEdBQUc7QUFDbkMsWUFBTSxPQUFPLEtBQUssYUFBYSxZQUFZLFFBQVEsVUFBVSxFQUFFLFVBQVUsS0FBSyxDQUFDLEtBQUssUUFBUSxTQUFTO0FBRXJHLGFBQU8sSUFBSSxTQUFTLHNCQUFzQix3REFBd0QsUUFBUSxNQUFNLEdBQUcsUUFBUSxLQUFLLEdBQUcsTUFBTSxRQUFRLElBQUksQ0FBQztBQUFBLElBQ3ZKO0FBRUEsUUFBSSxrQkFBa0IsT0FBTyxHQUFHO0FBQy9CLFlBQU0sUUFBMEI7QUFDaEMsWUFBTSxjQUE0QixLQUFLLFdBQVc7QUFDbEQsWUFBTSxVQUFVLFlBQVksZ0JBQWdCLEtBQUssQ0FBQyxDQUFDLFlBQVk7QUFDL0QsWUFBTSxjQUFjLE1BQU0sZUFBZTtBQUN6QyxZQUFNLFFBQVEsTUFBTSxNQUFNO0FBQzFCLFlBQU0sWUFBWSxNQUFNLEtBQUssRUFBRSxPQUFPLEdBQUcsTUFBTSxZQUFZLEdBQUc7QUFDOUQsVUFBSSxTQUFTO0FBQ1osZUFBTyxJQUFJLFNBQVMsNEJBQTRCLDRDQUE0QyxXQUFXLE1BQU0sYUFBYSxhQUFhLE1BQU0sYUFBYTtBQUFBLE1BQzNKO0FBRUEsYUFBTyxJQUFJLFNBQVMsb0JBQW9CLGlDQUFpQyxXQUFXLE1BQU0sYUFBYSxXQUFXO0FBQUEsSUFDbkg7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBekNhLDhCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
