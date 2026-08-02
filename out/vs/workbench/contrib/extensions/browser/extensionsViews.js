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
import { localize } from "../../../../nls.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { isCancellationError, getErrorMessage, CancellationError } from "../../../../base/common/errors.js";
import { PagedModel, DelayedPagedModel } from "../../../../base/common/paging.js";
import { SortOrder, SortBy as GallerySortBy, ExtensionGalleryErrorCode, ExtensionGalleryError } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionManagementServerService, EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { areSameExtensions, getExtensionDependencies } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { append, $ } from "../../../../base/browser/dom.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ExtensionResultsListFocused, ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
import { Query } from "../common/extensionQuery.js";
import { IExtensionService, toExtension } from "../../../services/extensions/common/extensions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ViewPane, ViewPaneShowActions } from "../../../browser/parts/views/viewPane.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { coalesce, distinct, range } from "../../../../base/common/arrays.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, isLanguagePackExtension } from "../../../../platform/extensions/common/extensions.js";
import { createCancelablePromise, ThrottledDelayer } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isOfflineError } from "../../../../base/parts/request/common/request.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { isString } from "../../../../base/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ExtensionsList } from "./extensionsViewer.js";
const NONE_CATEGORY = "none";
class ExtensionsViewState extends Disposable {
  constructor() {
    super(...arguments);
    this._onFocus = this._register(new Emitter());
    this.onFocus = this._onFocus.event;
    this._onBlur = this._register(new Emitter());
    this.onBlur = this._onBlur.event;
    this.currentlyFocusedItems = [];
    this.filters = {};
  }
  onFocusChange(extensions) {
    this.currentlyFocusedItems.forEach((extension) => this._onBlur.fire(extension));
    this.currentlyFocusedItems = extensions;
    this.currentlyFocusedItems.forEach((extension) => this._onFocus.fire(extension));
  }
}
var LocalSortBy = /* @__PURE__ */ ((LocalSortBy2) => {
  LocalSortBy2["UpdateDate"] = "UpdateDate";
  return LocalSortBy2;
})(LocalSortBy || {});
function isLocalSortBy(value) {
  switch (value) {
    case "UpdateDate" /* UpdateDate */:
      return true;
  }
}
class AbstractExtensionsListView extends ViewPane {
}
let ExtensionsListView = class extends AbstractExtensionsListView {
  constructor(options, viewletViewOptions, notificationService, keybindingService, contextMenuService, instantiationService, themeService, extensionService, extensionsWorkbenchService, extensionRecommendationsService, telemetryService, hoverService, configurationService, contextService, extensionManagementServerService, extensionManifestPropertiesService, extensionManagementService, workspaceService, productService, contextKeyService, viewDescriptorService, openerService, storageService, workspaceTrustManagementService, extensionEnablementService, extensionFeaturesManagementService, uriIdentityService, logService) {
    super({
      ...viewletViewOptions,
      showActions: ViewPaneShowActions.Always,
      maximumBodySize: options.flexibleHeight ? storageService.getNumber(`${viewletViewOptions.id}.size`, StorageScope.PROFILE, 0) ? void 0 : 0 : void 0
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.options = options;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.telemetryService = telemetryService;
    this.contextService = contextService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.extensionManagementService = extensionManagementService;
    this.workspaceService = workspaceService;
    this.productService = productService;
    this.storageService = storageService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.list = null;
    this.queryRequest = null;
    this.contextMenuActionRunner = this._register(new ActionRunner());
    if (this.options.onDidChangeTitle) {
      this._register(this.options.onDidChangeTitle((title) => this.updateTitle(title)));
    }
    this._register(this.contextMenuActionRunner.onDidRun(({ error }) => error && this.notificationService.error(error)));
    this.registerActions();
  }
  registerActions() {
  }
  renderHeader(container) {
    container.classList.add("extension-view-header");
    super.renderHeader(container);
    if (!this.options.hideBadge) {
      this.badge = this._register(new CountBadge(append(container, $(".count-badge-wrapper")), {}, defaultCountBadgeStyles));
    }
  }
  renderBody(container) {
    super.renderBody(container);
    const messageContainer = append(container, $(".message-container"));
    const messageSeverityIcon = append(messageContainer, $(""));
    const messageBox = append(messageContainer, $(".message"));
    const extensionsList = append(container, $(".extensions-list"));
    this.extensionsViewState = this._register(new ExtensionsViewState());
    this.list = this._register(this.instantiationService.createInstance(ExtensionsList, extensionsList, this.id, {}, this.extensionsViewState)).list;
    ExtensionResultsListFocused.bindTo(this.list.contextKeyService);
    this._register(this.list.onDidChangeFocus((e) => this.extensionsViewState?.onFocusChange(coalesce(e.elements)), this));
    this.bodyTemplate = {
      extensionsList,
      messageBox,
      messageContainer,
      messageSeverityIcon
    };
    if (this.queryResult) {
      this.setModel(this.queryResult.model);
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    if (this.bodyTemplate) {
      this.bodyTemplate.extensionsList.style.height = height + "px";
    }
    this.list?.layout(height, width);
  }
  async show(query, refresh) {
    if (this.queryRequest) {
      if (!refresh && this.queryRequest.query === query) {
        return this.queryRequest.request;
      }
      this.queryRequest.request.cancel();
      this.queryRequest = null;
    }
    if (this.queryResult) {
      this.queryResult.disposables.dispose();
      this.queryResult = void 0;
      if (this.extensionsViewState) {
        this.extensionsViewState.filters = {};
      }
    }
    const parsedQuery = Query.parse(query);
    const options = {
      sortOrder: SortOrder.Default
    };
    switch (parsedQuery.sortBy) {
      case "installs":
        options.sortBy = GallerySortBy.InstallCount;
        break;
      case "rating":
        options.sortBy = GallerySortBy.WeightedRating;
        break;
      case "name":
        options.sortBy = GallerySortBy.Title;
        break;
      case "publishedDate":
        options.sortBy = GallerySortBy.PublishedDate;
        break;
      case "updateDate":
        options.sortBy = "UpdateDate" /* UpdateDate */;
        break;
    }
    const request = createCancelablePromise(async (token) => {
      try {
        this.queryResult = await this.query(parsedQuery, options, token);
        const model = this.queryResult.model;
        this.setModel(model, this.queryResult.message);
        if (this.queryResult.onDidChangeModel) {
          this.queryResult.disposables.add(this.queryResult.onDidChangeModel((model2) => {
            if (this.queryResult) {
              this.queryResult.model = model2;
              this.updateModel(model2);
            }
          }));
        }
        return model;
      } catch (e) {
        const model = new PagedModel([]);
        if (!isCancellationError(e)) {
          this.logService.error(e);
          this.setModel(model, this.getMessage(e));
        }
        return this.list ? this.list.model : model;
      }
    });
    request.finally(() => this.queryRequest = null);
    this.queryRequest = { query, request };
    return request;
  }
  count() {
    return this.queryResult?.model.length ?? 0;
  }
  showEmptyModel() {
    const emptyModel = new PagedModel([]);
    this.setModel(emptyModel);
    return Promise.resolve(emptyModel);
  }
  async query(query, options, token) {
    const idRegex = /@id:(([a-z0-9A-Z][a-z0-9\-A-Z]*)\.([a-z0-9A-Z][a-z0-9\-A-Z]*))/g;
    const ids = [];
    let idMatch;
    while ((idMatch = idRegex.exec(query.value)) !== null) {
      const name = idMatch[1];
      ids.push(name);
    }
    if (ids.length) {
      const model = await this.queryByIds(ids, options, token);
      return { model, disposables: new DisposableStore() };
    }
    if (ExtensionsListView.isLocalExtensionsQuery(query.value, query.sortBy)) {
      return this.queryLocal(query, options);
    }
    if (ExtensionsListView.isSearchPopularQuery(query.value)) {
      query.value = query.value.replace("@popular", "");
      options.sortBy = !options.sortBy ? GallerySortBy.InstallCount : options.sortBy;
    } else if (ExtensionsListView.isSearchRecentlyPublishedQuery(query.value)) {
      query.value = query.value.replace("@recentlyPublished", "");
      options.sortBy = !options.sortBy ? GallerySortBy.PublishedDate : options.sortBy;
    }
    const galleryQueryOptions = { ...options, sortBy: isLocalSortBy(options.sortBy) ? void 0 : options.sortBy };
    return this.queryGallery(query, galleryQueryOptions, token);
  }
  async queryByIds(ids, options, token) {
    const idsSet = ids.reduce((result2, id) => {
      result2.add(id.toLowerCase());
      return result2;
    }, /* @__PURE__ */ new Set());
    const result = (await this.extensionsWorkbenchService.queryLocal(this.options.server)).filter((e) => idsSet.has(e.identifier.id.toLowerCase()));
    const galleryIds = result.length ? ids.filter((id) => result.every((r) => !areSameExtensions(r.identifier, { id }))) : ids;
    if (galleryIds.length) {
      const galleryResult = await this.extensionsWorkbenchService.getExtensions(galleryIds.map((id) => ({ id })), { source: "queryById" }, token);
      result.push(...galleryResult);
    }
    return new PagedModel(result);
  }
  async queryLocal(query, options) {
    const local = await this.extensionsWorkbenchService.queryLocal(this.options.server);
    let { extensions, canIncludeInstalledExtensions, description } = await this.filterLocal(local, this.extensionService.extensions, query, options);
    const disposables = new DisposableStore();
    const onDidChangeModel = disposables.add(new Emitter());
    if (canIncludeInstalledExtensions) {
      let isDisposed = false;
      disposables.add(toDisposable(() => isDisposed = true));
      disposables.add(Event.debounce(Event.any(
        Event.filter(this.extensionsWorkbenchService.onChange, (e) => e?.state === ExtensionState.Installed),
        this.extensionService.onDidChangeExtensions
      ), () => void 0)(async () => {
        const local2 = this.options.server ? this.extensionsWorkbenchService.installed.filter((e) => e.server === this.options.server) : this.extensionsWorkbenchService.local;
        const { extensions: newExtensions } = await this.filterLocal(local2, this.extensionService.extensions, query, options);
        if (!isDisposed) {
          const mergedExtensions = this.mergeAddedExtensions(extensions, newExtensions);
          if (mergedExtensions) {
            extensions = mergedExtensions;
            onDidChangeModel.fire(new PagedModel(extensions));
          }
        }
      }));
    }
    return {
      model: new PagedModel(extensions),
      message: description ? { text: description, severity: Severity.Info } : void 0,
      onDidChangeModel: onDidChangeModel.event,
      disposables
    };
  }
  async filterLocal(local, runningExtensions, query, options) {
    const value = query.value;
    let extensions = [];
    let description;
    const includeBuiltin = /@builtin/i.test(value);
    const canIncludeInstalledExtensions = !includeBuiltin;
    if (/@installed/i.test(value)) {
      extensions = this.filterInstalledExtensions(local, runningExtensions, query, options);
    } else if (/@outdated/i.test(value)) {
      extensions = this.filterOutdatedExtensions(local, query, options);
    } else if (/@disabled/i.test(value)) {
      extensions = this.filterDisabledExtensions(local, runningExtensions, query, options, includeBuiltin);
    } else if (/@enabled/i.test(value)) {
      extensions = this.filterEnabledExtensions(local, runningExtensions, query, options, includeBuiltin);
    } else if (/@workspaceUnsupported/i.test(value)) {
      extensions = this.filterWorkspaceUnsupportedExtensions(local, query, options);
    } else if (/@deprecated/i.test(query.value)) {
      extensions = await this.filterDeprecatedExtensions(local, query, options);
    } else if (/@recentlyUpdated/i.test(query.value)) {
      extensions = this.filterRecentlyUpdatedExtensions(local, query, options);
    } else if (/@restartrequired/i.test(query.value)) {
      extensions = this.filterRestartRequiredExtensions(local, query, options);
    } else if (/@contribute:/i.test(query.value)) {
      extensions = this.filterExtensionsByFeature(local, query);
    } else if (includeBuiltin) {
      extensions = this.filterBuiltinExtensions(local, query, options);
    }
    return { extensions, canIncludeInstalledExtensions, description };
  }
  filterBuiltinExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replaceAll(/@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => e.isBuiltin && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterExtensionByCategory(e, includedCategories, excludedCategories) {
    if (!includedCategories.length && !excludedCategories.length) {
      return true;
    }
    if (e.categories.length) {
      if (excludedCategories.length && e.categories.some((category) => excludedCategories.includes(category.toLowerCase()))) {
        return false;
      }
      return e.categories.some((category) => includedCategories.includes(category.toLowerCase()));
    } else {
      return includedCategories.includes(NONE_CATEGORY);
    }
  }
  parseCategories(value) {
    const includedCategories = [];
    const excludedCategories = [];
    value = value.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
      const entry = (category || quotedCategory || "").toLowerCase();
      if (entry.startsWith("-")) {
        if (excludedCategories.indexOf(entry) === -1) {
          excludedCategories.push(entry);
        }
      } else {
        if (includedCategories.indexOf(entry) === -1) {
          includedCategories.push(entry);
        }
      }
      return "";
    });
    return { value, includedCategories, excludedCategories };
  }
  filterInstalledExtensions(local, runningExtensions, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replace(/@installed/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const matchingText = (e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1 || e.description.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories);
    let result;
    if (options.sortBy !== void 0) {
      result = local.filter((e) => !e.isBuiltin && matchingText(e));
      result = this.sortExtensions(result, options);
    } else {
      result = local.filter((e) => (!e.isBuiltin || e.outdated || e.runtimeState !== void 0) && matchingText(e));
      const runningExtensionsById = runningExtensions.reduce((result2, e) => {
        result2.set(e.identifier.value, e);
        return result2;
      }, new ExtensionIdentifierMap());
      const defaultSort = (e1, e2) => {
        const running1 = runningExtensionsById.get(e1.identifier.id);
        const isE1Running = !!running1 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running1)) === e1.server;
        const running2 = runningExtensionsById.get(e2.identifier.id);
        const isE2Running = running2 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running2)) === e2.server;
        if (isE1Running && isE2Running) {
          return e1.displayName.localeCompare(e2.displayName);
        }
        const isE1LanguagePackExtension = e1.local && isLanguagePackExtension(e1.local.manifest);
        const isE2LanguagePackExtension = e2.local && isLanguagePackExtension(e2.local.manifest);
        if (!isE1Running && !isE2Running) {
          if (isE1LanguagePackExtension) {
            return -1;
          }
          if (isE2LanguagePackExtension) {
            return 1;
          }
          return e1.displayName.localeCompare(e2.displayName);
        }
        if (isE1Running && isE2LanguagePackExtension || isE2Running && isE1LanguagePackExtension) {
          return e1.displayName.localeCompare(e2.displayName);
        }
        return isE1Running ? -1 : 1;
      };
      const incompatible = [];
      const deprecated = [];
      const outdated = [];
      const actionRequired = [];
      const noActionRequired = [];
      for (const e of result) {
        if (e.enablementState === EnablementState.DisabledByInvalidExtension) {
          incompatible.push(e);
        } else if (e.deprecationInfo) {
          deprecated.push(e);
        } else if (e.outdated && this.extensionEnablementService.isEnabledEnablementState(e.enablementState)) {
          outdated.push(e);
        } else if (e.runtimeState) {
          actionRequired.push(e);
        } else {
          noActionRequired.push(e);
        }
      }
      result = [
        ...incompatible.sort(defaultSort),
        ...deprecated.sort(defaultSort),
        ...outdated.sort(defaultSort),
        ...actionRequired.sort(defaultSort),
        ...noActionRequired.sort(defaultSort)
      ];
    }
    return result;
  }
  filterOutdatedExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replace(/@outdated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((extension) => extension.outdated && (extension.name.toLowerCase().indexOf(value) > -1 || extension.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(extension, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterDisabledExtensions(local, runningExtensions, query, options, includeBuiltin) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replaceAll(/@disabled|@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    if (includeBuiltin) {
      local = local.filter((e) => e.isBuiltin);
    }
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((e) => runningExtensions.every((r) => !areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier)) && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterEnabledExtensions(local, runningExtensions, query, options, includeBuiltin) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value ? value.replaceAll(/@enabled|@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase() : "";
    local = local.filter((e) => e.isBuiltin === includeBuiltin);
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((e) => runningExtensions.some((r) => areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier)) && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterWorkspaceUnsupportedExtensions(local, query, options) {
    const queryString = query.value;
    const match = queryString.match(/^\s*@workspaceUnsupported(?::(untrusted|virtual)(Partial)?)?(?:\s+([^\s]*))?/i);
    if (!match) {
      return [];
    }
    const type = match[1]?.toLowerCase();
    const partial = !!match[2];
    const nameFilter = match[3]?.toLowerCase();
    if (nameFilter) {
      local = local.filter((extension) => extension.name.toLowerCase().indexOf(nameFilter) > -1 || extension.displayName.toLowerCase().indexOf(nameFilter) > -1);
    }
    const hasVirtualSupportType = (extension, supportType) => {
      return extension.local && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.local.manifest) === supportType;
    };
    const hasRestrictedSupportType = (extension, supportType) => {
      if (!extension.local) {
        return false;
      }
      const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
      if (enablementState !== EnablementState.EnabledGlobally && enablementState !== EnablementState.EnabledWorkspace && enablementState !== EnablementState.DisabledByTrustRequirement && enablementState !== EnablementState.DisabledByExtensionDependency) {
        return false;
      }
      if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.local.manifest) === supportType) {
        return true;
      }
      if (supportType === false) {
        const dependencies = getExtensionDependencies(local.map((ext) => ext.local), extension.local);
        return dependencies.some((ext) => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === supportType);
      }
      return false;
    };
    const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
    const inRestrictedWorkspace = !this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (type === "virtual") {
      local = local.filter((extension) => inVirtualWorkspace && hasVirtualSupportType(extension, partial ? "limited" : false) && !(inRestrictedWorkspace && hasRestrictedSupportType(extension, false)));
    } else if (type === "untrusted") {
      local = local.filter((extension) => hasRestrictedSupportType(extension, partial ? "limited" : false) && !(inVirtualWorkspace && hasVirtualSupportType(extension, false)));
    } else {
      local = local.filter((extension) => inVirtualWorkspace && !hasVirtualSupportType(extension, true) || inRestrictedWorkspace && !hasRestrictedSupportType(extension, true));
    }
    return this.sortExtensions(local, options);
  }
  async filterDeprecatedExtensions(local, query, options) {
    const value = query.value.replace(/@deprecated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const deprecatedExtensionIds = Object.keys(extensionsControlManifest.deprecated);
    local = local.filter((e) => deprecatedExtensionIds.includes(e.identifier.id) && (!value || e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));
    return this.sortExtensions(local, options);
  }
  filterRecentlyUpdatedExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    const currentTime = Date.now();
    local = local.filter((e) => !e.isBuiltin && !e.outdated && e.local?.updated && e.local?.installedTimestamp !== void 0 && currentTime - e.local.installedTimestamp < ExtensionsListView.RECENT_UPDATE_DURATION);
    value = value.replace(/@recentlyUpdated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    options.sortBy = options.sortBy ?? "UpdateDate" /* UpdateDate */;
    return this.sortExtensions(result, options);
  }
  filterRestartRequiredExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    local = local.filter((e) => e.runtimeState !== void 0);
    value = value.replace(/@restartrequired/gi, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterExtensionsByFeature(local, query) {
    const value = query.value.replace(/@contribute:/g, "").trim();
    const featureId = value.split(" ")[0];
    const feature = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(featureId);
    if (!feature) {
      return [];
    }
    if (this.extensionsViewState) {
      this.extensionsViewState.filters.featureId = featureId;
    }
    const renderer = feature.renderer ? this.instantiationService.createInstance(feature.renderer) : void 0;
    try {
      const result = [];
      for (const e of local) {
        if (!e.local) {
          continue;
        }
        const accessData = this.extensionFeaturesManagementService.getAccessData(new ExtensionIdentifier(e.identifier.id), featureId);
        const shouldRender = renderer?.shouldRender(e.local.manifest);
        if (accessData || shouldRender) {
          result.push([e, accessData?.accessTimes.length ?? 0]);
        }
      }
      return result.sort(([, a], [, b]) => b - a).map(([e]) => e);
    } finally {
      renderer?.dispose();
    }
  }
  mergeAddedExtensions(extensions, newExtensions) {
    const oldExtensions = [...extensions];
    const findPreviousExtensionIndex = (from) => {
      let index = -1;
      const previousExtensionInNew = newExtensions[from];
      if (previousExtensionInNew) {
        index = oldExtensions.findIndex((e) => areSameExtensions(e.identifier, previousExtensionInNew.identifier));
        if (index === -1) {
          return findPreviousExtensionIndex(from - 1);
        }
      }
      return index;
    };
    let hasChanged = false;
    for (let index = 0; index < newExtensions.length; index++) {
      const extension = newExtensions[index];
      if (extensions.every((r) => !areSameExtensions(r.identifier, extension.identifier))) {
        hasChanged = true;
        extensions.splice(findPreviousExtensionIndex(index - 1) + 1, 0, extension);
      }
    }
    return hasChanged ? extensions : void 0;
  }
  async queryGallery(query, options, token) {
    const hasUserDefinedSortOrder = options.sortBy !== void 0;
    if (!hasUserDefinedSortOrder && !query.value.trim()) {
      options.sortBy = GallerySortBy.InstallCount;
    }
    if (this.isRecommendationsQuery(query)) {
      const model = await this.queryRecommendations(query, options, token);
      return { model, disposables: new DisposableStore() };
    }
    const text = query.value;
    if (!text) {
      options.source = "viewlet";
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    if (/\bext:([^\s]+)\b/g.test(text)) {
      options.text = text;
      options.source = "file-extension-tags";
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    options.text = text.substring(0, 350);
    options.source = "searchText";
    if (hasUserDefinedSortOrder || /\b(category|tag):([^\s]+)\b/gi.test(text) || /\bfeatured(\s+|\b|$)/gi.test(text)) {
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    try {
      const [pager, preferredExtensions] = await Promise.all([
        this.extensionsWorkbenchService.queryGallery(options, token),
        this.getPreferredExtensions(options.text.toLowerCase(), token).catch(() => [])
      ]);
      const model = preferredExtensions.length ? new PreferredExtensionsPagedModel(preferredExtensions, pager) : new PagedModel(pager);
      return { model, disposables: new DisposableStore() };
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      if (!(error instanceof ExtensionGalleryError)) {
        throw error;
      }
      const searchText = options.text.toLowerCase();
      const localExtensions = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && (e.name.toLowerCase().indexOf(searchText) > -1 || e.displayName.toLowerCase().indexOf(searchText) > -1 || e.description.toLowerCase().indexOf(searchText) > -1));
      if (localExtensions.length) {
        const message = this.getMessage(error);
        return { model: new PagedModel(localExtensions), disposables: new DisposableStore(), message: { text: localize("showing local extensions only", "{0} Showing local extensions.", message.text), severity: message.severity } };
      }
      throw error;
    }
  }
  async getPreferredExtensions(searchText, token) {
    const preferredExtensions = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && (e.name.toLowerCase().indexOf(searchText) > -1 || e.displayName.toLowerCase().indexOf(searchText) > -1 || e.description.toLowerCase().indexOf(searchText) > -1));
    const preferredExtensionUUIDs = /* @__PURE__ */ new Set();
    if (preferredExtensions.length) {
      const extesionsToFetch = [];
      for (const extension of preferredExtensions) {
        if (extension.identifier.uuid) {
          preferredExtensionUUIDs.add(extension.identifier.uuid);
        }
        if (!extension.gallery && extension.identifier.uuid) {
          extesionsToFetch.push(extension.identifier);
        }
      }
      if (extesionsToFetch.length) {
        this.extensionsWorkbenchService.getExtensions(extesionsToFetch, CancellationToken.None).catch(
          (e) => null
          /*ignore error*/
        );
      }
    }
    const preferredResults = [];
    try {
      const manifest = await this.extensionManagementService.getExtensionsControlManifest();
      if (Array.isArray(manifest.search)) {
        for (const s of manifest.search) {
          if (s.query && s.query.toLowerCase() === searchText && Array.isArray(s.preferredResults)) {
            preferredResults.push(...s.preferredResults);
            break;
          }
        }
      }
      if (preferredResults.length) {
        const result = await this.extensionsWorkbenchService.getExtensions(preferredResults.map((id) => ({ id })), token);
        for (const extension of result) {
          if (extension.identifier.uuid && !preferredExtensionUUIDs.has(extension.identifier.uuid)) {
            preferredExtensions.push(extension);
          }
        }
      }
    } catch (e) {
      this.logService.warn("Failed to get preferred results from the extensions control manifest.", e);
    }
    return preferredExtensions;
  }
  sortExtensions(extensions, options) {
    switch (options.sortBy) {
      case GallerySortBy.InstallCount:
        extensions = extensions.sort((e1, e2) => typeof e2.installCount === "number" && typeof e1.installCount === "number" ? e2.installCount - e1.installCount : NaN);
        break;
      case "UpdateDate" /* UpdateDate */:
        extensions = extensions.sort((e1, e2) => typeof e2.local?.installedTimestamp === "number" && typeof e1.local?.installedTimestamp === "number" ? e2.local.installedTimestamp - e1.local.installedTimestamp : typeof e2.local?.installedTimestamp === "number" ? 1 : typeof e1.local?.installedTimestamp === "number" ? -1 : NaN);
        break;
      case GallerySortBy.AverageRating:
      case GallerySortBy.WeightedRating:
        extensions = extensions.sort((e1, e2) => typeof e2.rating === "number" && typeof e1.rating === "number" ? e2.rating - e1.rating : NaN);
        break;
      default:
        extensions = extensions.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
        break;
    }
    if (options.sortOrder === SortOrder.Descending) {
      extensions = extensions.reverse();
    }
    return extensions;
  }
  isRecommendationsQuery(query) {
    return ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value) || ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value) || ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value) || ExtensionsListView.isExeRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value) || /@recommended:all/i.test(query.value) || ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRecommendedExtensionsQuery(query.value);
  }
  async queryRecommendations(query, options, token) {
    if (ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)) {
      return this.getWorkspaceRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)) {
      return this.getKeymapRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value)) {
      return this.getLanguageRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isExeRecommendedExtensionsQuery(query.value)) {
      return this.getExeRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value)) {
      return this.getRemoteRecommendationsModel(query, options, token);
    }
    if (/@recommended:all/i.test(query.value)) {
      return this.getAllRecommendationsModel(options, token);
    }
    if (ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRecommendedExtensionsQuery(query.value) && options.sortBy !== void 0) {
      return this.searchRecommendations(query, options, token);
    }
    if (ExtensionsListView.isRecommendedExtensionsQuery(query.value)) {
      return this.getOtherRecommendationsModel(query, options, token);
    }
    return new PagedModel([]);
  }
  async getInstallableRecommendations(recommendations, options, token) {
    const result = [];
    if (recommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of recommendations) {
        if (typeof recommendation === "string") {
          galleryExtensions.push(recommendation);
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      if (galleryExtensions.length) {
        try {
          const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map((id) => ({ id })), { source: options.source }, token);
          for (const extension of extensions) {
            if (extension.gallery && !extension.deprecationInfo && await this.extensionManagementService.canInstall(extension.gallery) === true) {
              result.push(extension);
            }
          }
        } catch (error) {
          if (!resourceExtensions.length || !this.isOfflineError(error)) {
            throw error;
          }
        }
      }
      if (resourceExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
        for (const extension of extensions) {
          if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
            result.push(extension);
          }
        }
      }
    }
    return result;
  }
  async getWorkspaceRecommendations() {
    const recommendations = await this.extensionRecommendationsService.getWorkspaceRecommendations();
    const { important } = await this.extensionRecommendationsService.getConfigBasedRecommendations();
    for (const configBasedRecommendation of important) {
      if (!recommendations.find((extensionId) => extensionId === configBasedRecommendation)) {
        recommendations.push(configBasedRecommendation);
      }
    }
    return recommendations;
  }
  async getWorkspaceRecommendationsModel(query, options, token) {
    const recommendations = await this.getWorkspaceRecommendations();
    const installableRecommendations = await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-workspace" }, token);
    return new PagedModel(installableRecommendations);
  }
  async getKeymapRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:keymaps/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getKeymapRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-keymaps" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getLanguageRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:languages/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getLanguageRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-languages" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getRemoteRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:remotes/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getRemoteRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-remotes" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getExeRecommendationsModel(query, options, token) {
    const exe = query.value.replace(/@exe:/g, "").trim().toLowerCase();
    const { important, others } = await this.extensionRecommendationsService.getExeBasedRecommendations(exe.startsWith('"') ? exe.substring(1, exe.length - 1) : exe);
    const installableRecommendations = await this.getInstallableRecommendations([...important, ...others], { ...options, source: "recommendations-exe" }, token);
    return new PagedModel(installableRecommendations);
  }
  async getOtherRecommendationsModel(query, options, token) {
    const otherRecommendations = await this.getOtherRecommendations();
    const installableRecommendations = await this.getInstallableRecommendations(otherRecommendations, { ...options, source: "recommendations-other", sortBy: void 0 }, token);
    const result = coalesce(otherRecommendations.map((id) => installableRecommendations.find((i) => areSameExtensions(i.identifier, { id }))));
    return new PagedModel(result);
  }
  async getOtherRecommendations() {
    const local = (await this.extensionsWorkbenchService.queryLocal(this.options.server)).map((e) => e.identifier.id.toLowerCase());
    const workspaceRecommendations = (await this.getWorkspaceRecommendations()).map((extensionId) => isString(extensionId) ? extensionId.toLowerCase() : extensionId);
    return distinct(
      (await Promise.all([
        // Order is important
        this.extensionRecommendationsService.getImportantRecommendations(),
        this.extensionRecommendationsService.getFileBasedRecommendations(),
        this.extensionRecommendationsService.getOtherRecommendations()
      ])).flat().filter(
        (extensionId) => !local.includes(extensionId.toLowerCase()) && !workspaceRecommendations.includes(extensionId.toLowerCase())
      ),
      (extensionId) => extensionId.toLowerCase()
    );
  }
  // Get All types of recommendations, trimmed to show a max of 8 at any given time
  async getAllRecommendationsModel(options, token) {
    const localExtensions = await this.extensionsWorkbenchService.queryLocal(this.options.server);
    const localExtensionIds = localExtensions.map((e) => e.identifier.id.toLowerCase());
    const allRecommendations = distinct(
      (await Promise.all([
        // Order is important
        this.getWorkspaceRecommendations(),
        this.extensionRecommendationsService.getImportantRecommendations(),
        this.extensionRecommendationsService.getFileBasedRecommendations(),
        this.extensionRecommendationsService.getOtherRecommendations()
      ])).flat().filter((extensionId) => {
        if (isString(extensionId)) {
          return !localExtensionIds.includes(extensionId.toLowerCase());
        }
        return !localExtensions.some((localExtension) => localExtension.local && this.uriIdentityService.extUri.isEqual(localExtension.local.location, extensionId));
      })
    );
    const installableRecommendations = await this.getInstallableRecommendations(allRecommendations, { ...options, source: "recommendations-all", sortBy: void 0 }, token);
    const result = [];
    for (let i = 0; i < installableRecommendations.length && result.length < 8; i++) {
      const recommendation = allRecommendations[i];
      if (isString(recommendation)) {
        const extension = installableRecommendations.find((extension2) => areSameExtensions(extension2.identifier, { id: recommendation }));
        if (extension) {
          result.push(extension);
        }
      } else {
        const extension = installableRecommendations.find((extension2) => extension2.resourceExtension && this.uriIdentityService.extUri.isEqual(extension2.resourceExtension.location, recommendation));
        if (extension) {
          result.push(extension);
        }
      }
    }
    return new PagedModel(result);
  }
  async searchRecommendations(query, options, token) {
    const value = query.value.replace(/@recommended/g, "").trim().toLowerCase();
    const recommendations = distinct([...await this.getWorkspaceRecommendations(), ...await this.getOtherRecommendations()]);
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations", sortBy: void 0 }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(this.sortExtensions(installableRecommendations, options));
  }
  setModel(model, message, donotResetScrollTop) {
    if (this.list) {
      this.list.model = new DelayedPagedModel(model);
      this.updateBody(message);
      if (!donotResetScrollTop) {
        this.list.scrollTop = 0;
      }
    }
    if (this.badge) {
      this.badge.setCount(this.count());
    }
  }
  updateModel(model) {
    if (this.list) {
      this.list.model = new DelayedPagedModel(model);
      this.updateBody();
    }
    if (this.badge) {
      this.badge.setCount(this.count());
    }
  }
  updateBody(message) {
    if (this.bodyTemplate) {
      const count = this.count();
      this.bodyTemplate.extensionsList.classList.toggle("hidden", count === 0);
      this.bodyTemplate.messageContainer.classList.toggle("hidden", !message && count > 0);
      if (this.isBodyVisible()) {
        if (message) {
          this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(message.severity);
          this.bodyTemplate.messageBox.textContent = message.text;
        } else if (this.count() === 0) {
          this.bodyTemplate.messageSeverityIcon.className = "";
          this.bodyTemplate.messageBox.textContent = localize("no extensions found", "No extensions found.");
        }
        if (this.bodyTemplate.messageBox.textContent) {
          alert(this.bodyTemplate.messageBox.textContent);
        }
      }
    }
    this.updateSize();
  }
  getMessage(error) {
    if (this.isOfflineError(error)) {
      return { text: localize("offline error", "Unable to search the Marketplace when offline, please check your network connection."), severity: Severity.Warning };
    } else {
      return { text: localize("error", "Error while fetching extensions. {0}", getErrorMessage(error)), severity: Severity.Error };
    }
  }
  isOfflineError(error) {
    if (error instanceof ExtensionGalleryError) {
      return error.code === ExtensionGalleryErrorCode.Offline;
    }
    return isOfflineError(error);
  }
  updateSize() {
    if (this.options.flexibleHeight) {
      this.maximumBodySize = this.list?.model.length ? Number.POSITIVE_INFINITY : 0;
      this.storageService.store(`${this.id}.size`, this.list?.model.length || 0, StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  dispose() {
    super.dispose();
    if (this.queryRequest) {
      this.queryRequest.request.cancel();
      this.queryRequest = null;
    }
    if (this.queryResult) {
      this.queryResult.disposables.dispose();
      this.queryResult = void 0;
    }
    this.list = null;
  }
  static isLocalExtensionsQuery(query, sortBy) {
    return this.isInstalledExtensionsQuery(query) || this.isSearchInstalledExtensionsQuery(query) || this.isOutdatedExtensionsQuery(query) || this.isEnabledExtensionsQuery(query) || this.isDisabledExtensionsQuery(query) || this.isBuiltInExtensionsQuery(query) || this.isSearchBuiltInExtensionsQuery(query) || this.isBuiltInGroupExtensionsQuery(query) || this.isSearchDeprecatedExtensionsQuery(query) || this.isSearchWorkspaceUnsupportedExtensionsQuery(query) || this.isSearchRecentlyUpdatedQuery(query) || this.isRestartRequiredQuery(query) || this.isSearchExtensionUpdatesQuery(query) || this.isSortInstalledExtensionsQuery(query, sortBy) || this.isFeatureExtensionsQuery(query);
  }
  static isSearchBuiltInExtensionsQuery(query) {
    return /@builtin\s.+|.+\s@builtin/i.test(query);
  }
  static isBuiltInExtensionsQuery(query) {
    return /^@builtin$/i.test(query.trim());
  }
  static isBuiltInGroupExtensionsQuery(query) {
    return /^@builtin:.+$/i.test(query.trim());
  }
  static isSearchWorkspaceUnsupportedExtensionsQuery(query) {
    return /^\s*@workspaceUnsupported(:(untrusted|virtual)(Partial)?)?(\s|$)/i.test(query);
  }
  static isInstalledExtensionsQuery(query) {
    return /@installed$/i.test(query) && !/@mcp/i.test(query) && !/@agentPlugins/i.test(query);
  }
  static isSearchInstalledExtensionsQuery(query) {
    return /@installed\s./i.test(query) && !/@mcp/i.test(query) && !/@agentPlugins/i.test(query) || this.isFeatureExtensionsQuery(query);
  }
  static isOutdatedExtensionsQuery(query) {
    return /@outdated/i.test(query);
  }
  static isEnabledExtensionsQuery(query) {
    return /@enabled/i.test(query) && !/@builtin/i.test(query);
  }
  static isDisabledExtensionsQuery(query) {
    return /@disabled/i.test(query) && !/@builtin/i.test(query);
  }
  static isSearchDeprecatedExtensionsQuery(query) {
    return /@deprecated\s?.*/i.test(query);
  }
  static isRecommendedExtensionsQuery(query) {
    return /^@recommended$/i.test(query.trim());
  }
  static isSearchRecommendedExtensionsQuery(query) {
    return /@recommended\s.+/i.test(query);
  }
  static isWorkspaceRecommendedExtensionsQuery(query) {
    return /@recommended:workspace/i.test(query);
  }
  static isExeRecommendedExtensionsQuery(query) {
    return /@exe:.+/i.test(query);
  }
  static isRemoteRecommendedExtensionsQuery(query) {
    return /@recommended:remotes/i.test(query);
  }
  static isKeymapsRecommendedExtensionsQuery(query) {
    return /@recommended:keymaps/i.test(query);
  }
  static isLanguageRecommendedExtensionsQuery(query) {
    return /@recommended:languages/i.test(query);
  }
  static isSortInstalledExtensionsQuery(query, sortBy) {
    return sortBy !== void 0 && sortBy !== "" && query === "" || !sortBy && /^@sort:\S*$/i.test(query);
  }
  static isSearchPopularQuery(query) {
    return /@popular/i.test(query);
  }
  static isSearchRecentlyPublishedQuery(query) {
    return /@recentlyPublished/i.test(query);
  }
  static isSearchRecentlyUpdatedQuery(query) {
    return /@recentlyUpdated/i.test(query);
  }
  static isRestartRequiredQuery(query) {
    return /@restartrequired/i.test(query);
  }
  static isSearchExtensionUpdatesQuery(query) {
    return /@updates/i.test(query);
  }
  static isSortUpdateDateQuery(query) {
    return /@sort:updateDate/i.test(query);
  }
  static isFeatureExtensionsQuery(query) {
    return /@contribute:/i.test(query);
  }
  focus() {
    super.focus();
    if (!this.list) {
      return;
    }
    if (!(this.list.getFocus().length || this.list.getSelection().length)) {
      this.list.focusNext();
    }
    this.list.domFocus();
  }
};
ExtensionsListView.RECENT_UPDATE_DURATION = 7 * 24 * 60 * 60 * 1e3;
ExtensionsListView = __decorateClass([
  __decorateParam(2, INotificationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionRecommendationsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IExtensionManagementServerService),
  __decorateParam(15, IExtensionManifestPropertiesService),
  __decorateParam(16, IWorkbenchExtensionManagementService),
  __decorateParam(17, IWorkspaceContextService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IContextKeyService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IOpenerService),
  __decorateParam(22, IStorageService),
  __decorateParam(23, IWorkspaceTrustManagementService),
  __decorateParam(24, IWorkbenchExtensionEnablementService),
  __decorateParam(25, IExtensionFeaturesManagementService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, ILogService)
], ExtensionsListView);
class DefaultPopularExtensionsView extends ExtensionsListView {
  async show() {
    const query = this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? "@web" : "";
    return super.show(query);
  }
}
class ServerInstalledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@installed";
    if (!ExtensionsListView.isLocalExtensionsQuery(query) || ExtensionsListView.isSortInstalledExtensionsQuery(query)) {
      query = query += " @installed";
    }
    return super.show(query.trim());
  }
}
class EnabledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query || "@enabled";
    return ExtensionsListView.isEnabledExtensionsQuery(query) ? super.show(query) : ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show("@enabled " + query) : this.showEmptyModel();
  }
}
class DisabledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query || "@disabled";
    return ExtensionsListView.isDisabledExtensionsQuery(query) ? super.show(query) : ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show("@disabled " + query) : this.showEmptyModel();
  }
}
class OutdatedExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@outdated";
    if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
      query = query.replace("@updates", "@outdated");
    }
    return super.show(query.trim());
  }
  updateSize() {
    super.updateSize();
    this.setExpanded(this.count() > 0);
  }
}
class RecentlyUpdatedExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@recentlyUpdated";
    if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
      query = query.replace("@updates", "@recentlyUpdated");
    }
    return super.show(query.trim());
  }
}
let StaticQueryExtensionsView = class extends ExtensionsListView {
  constructor(options, viewletViewOptions, notificationService, keybindingService, contextMenuService, instantiationService, themeService, extensionService, extensionsWorkbenchService, extensionRecommendationsService, telemetryService, hoverService, configurationService, contextService, extensionManagementServerService, extensionManifestPropertiesService, extensionManagementService, workspaceService, productService, contextKeyService, viewDescriptorService, openerService, storageService, workspaceTrustManagementService, extensionEnablementService, extensionFeaturesManagementService, uriIdentityService, logService) {
    super(
      options,
      viewletViewOptions,
      notificationService,
      keybindingService,
      contextMenuService,
      instantiationService,
      themeService,
      extensionService,
      extensionsWorkbenchService,
      extensionRecommendationsService,
      telemetryService,
      hoverService,
      configurationService,
      contextService,
      extensionManagementServerService,
      extensionManifestPropertiesService,
      extensionManagementService,
      workspaceService,
      productService,
      contextKeyService,
      viewDescriptorService,
      openerService,
      storageService,
      workspaceTrustManagementService,
      extensionEnablementService,
      extensionFeaturesManagementService,
      uriIdentityService,
      logService
    );
    this.options = options;
  }
  show() {
    return super.show(this.options.query);
  }
};
StaticQueryExtensionsView = __decorateClass([
  __decorateParam(2, INotificationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionRecommendationsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IExtensionManagementServerService),
  __decorateParam(15, IExtensionManifestPropertiesService),
  __decorateParam(16, IWorkbenchExtensionManagementService),
  __decorateParam(17, IWorkspaceContextService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IContextKeyService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IOpenerService),
  __decorateParam(22, IStorageService),
  __decorateParam(23, IWorkspaceTrustManagementService),
  __decorateParam(24, IWorkbenchExtensionEnablementService),
  __decorateParam(25, IExtensionFeaturesManagementService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, ILogService)
], StaticQueryExtensionsView);
function toSpecificWorkspaceUnsupportedQuery(query, qualifier) {
  if (!query) {
    return "@workspaceUnsupported:" + qualifier;
  }
  const match = query.match(new RegExp(`@workspaceUnsupported(:${qualifier})?(\\s|$)`, "i"));
  if (match) {
    if (!match[1]) {
      return query.replace(/@workspaceUnsupported/gi, "@workspaceUnsupported:" + qualifier);
    }
    return query;
  }
  return void 0;
}
class UntrustedWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "untrusted");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class UntrustedWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "untrustedPartial");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class VirtualWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "virtual");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class VirtualWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "virtualPartial");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class DeprecatedExtensionsView extends ExtensionsListView {
  async show(query) {
    return ExtensionsListView.isSearchDeprecatedExtensionsQuery(query) ? super.show(query) : this.showEmptyModel();
  }
}
class SearchMarketplaceExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.reportSearchFinishedDelayer = this._register(new ThrottledDelayer(2e3));
    this.searchWaitPromise = Promise.resolve();
  }
  async show(query) {
    const queryPromise = super.show(query);
    this.reportSearchFinishedDelayer.trigger(() => this.reportSearchFinished());
    this.searchWaitPromise = queryPromise.then(null, null);
    return queryPromise;
  }
  async reportSearchFinished() {
    await this.searchWaitPromise;
    this.telemetryService.publicLog2("extensionsView:MarketplaceSearchFinished");
  }
}
class DefaultRecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended:all";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
      this.show("");
    }));
  }
  async show(query) {
    if (query && query.trim() !== this.recommendedExtensionsQuery) {
      return this.showEmptyModel();
    }
    const model = await super.show(this.recommendedExtensionsQuery);
    if (!this.extensionsWorkbenchService.local.some((e) => !e.isBuiltin)) {
      this.setExpanded(model.length > 0);
    }
    return model;
  }
}
class RecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
      this.show("");
    }));
  }
  async show(query) {
    return query && query.trim() !== this.recommendedExtensionsQuery ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery);
  }
}
class WorkspaceRecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended:workspace";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.show(this.recommendedExtensionsQuery)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.show(this.recommendedExtensionsQuery)));
  }
  async show(query) {
    const shouldShowEmptyView = query && query.trim() !== "@recommended" && query.trim() !== "@recommended:workspace";
    const model = await (shouldShowEmptyView ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery));
    this.setExpanded(model.length > 0);
    return model;
  }
  async getInstallableWorkspaceRecommendations() {
    const installed = (await this.extensionsWorkbenchService.queryLocal()).filter((l) => l.enablementState !== EnablementState.DisabledByExtensionKind);
    const recommendations = (await this.getWorkspaceRecommendations()).filter((recommendation) => installed.every((local) => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.local?.location)));
    return this.getInstallableRecommendations(recommendations, { source: "install-all-workspace-recommendations" }, CancellationToken.None);
  }
  async installWorkspaceRecommendations() {
    const installableRecommendations = await this.getInstallableWorkspaceRecommendations();
    if (installableRecommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of installableRecommendations) {
        if (recommendation.gallery) {
          galleryExtensions.push({ extension: recommendation.gallery, options: {} });
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      await Promise.all([
        this.extensionManagementService.installGalleryExtensions(galleryExtensions),
        ...resourceExtensions.map((extension) => this.extensionsWorkbenchService.install(extension))
      ]);
    } else {
      this.notificationService.notify({
        severity: Severity.Info,
        message: localize("no local extensions", "There are no extensions to install.")
      });
    }
  }
}
class PreferredExtensionsPagedModel {
  constructor(preferredExtensions, pager) {
    this.preferredExtensions = preferredExtensions;
    this.pager = pager;
    this.resolved = /* @__PURE__ */ new Map();
    this.preferredGalleryExtensions = /* @__PURE__ */ new Set();
    this.resolvedGalleryExtensionsFromQuery = [];
    for (let i = 0; i < this.preferredExtensions.length; i++) {
      this.resolved.set(i, this.preferredExtensions[i]);
    }
    for (const e of preferredExtensions) {
      if (e.identifier.uuid) {
        this.preferredGalleryExtensions.add(e.identifier.uuid);
      }
    }
    this.length = preferredExtensions.length - this.preferredGalleryExtensions.size + this.pager.total;
    const totalPages = Math.ceil(this.pager.total / this.pager.pageSize);
    this.populateResolvedExtensions(0, this.pager.firstPage);
    this.pages = range(totalPages - 1).map(() => ({
      promise: null,
      cts: null,
      promiseIndexes: /* @__PURE__ */ new Set()
    }));
  }
  get onDidIncrementLength() {
    return Event.None;
  }
  isResolved(index) {
    return this.resolved.has(index);
  }
  get(index) {
    return this.resolved.get(index);
  }
  async resolve(index, cancellationToken) {
    if (cancellationToken.isCancellationRequested) {
      throw new CancellationError();
    }
    if (this.isResolved(index)) {
      return this.get(index);
    }
    const indexInPagedModel = index - this.preferredExtensions.length + this.resolvedGalleryExtensionsFromQuery.length;
    const pageIndex = Math.floor(indexInPagedModel / this.pager.pageSize);
    const page = this.pages[pageIndex - 1];
    if (!page.promise) {
      page.cts = new CancellationTokenSource();
      page.promise = this.pager.getPage(pageIndex, page.cts.token).then((extensions) => this.populateResolvedExtensions(pageIndex, extensions)).catch((e) => {
        page.promise = null;
        throw e;
      }).finally(() => page.cts = null);
    }
    const listener = cancellationToken.onCancellationRequested(() => {
      if (!page.cts) {
        return;
      }
      page.promiseIndexes.delete(index);
      if (page.promiseIndexes.size === 0) {
        page.cts.cancel();
      }
    });
    page.promiseIndexes.add(index);
    try {
      await page.promise;
    } finally {
      listener.dispose();
    }
    return this.get(index);
  }
  populateResolvedExtensions(pageIndex, extensions) {
    let adjustIndexOfNextPagesBy = 0;
    const pageStartIndex = pageIndex * this.pager.pageSize;
    for (let i = 0; i < extensions.length; i++) {
      const e = extensions[i];
      if (e.gallery?.identifier.uuid && this.preferredGalleryExtensions.has(e.gallery.identifier.uuid)) {
        this.resolvedGalleryExtensionsFromQuery.push(e);
        adjustIndexOfNextPagesBy++;
      } else {
        this.resolved.set(this.preferredExtensions.length - this.resolvedGalleryExtensionsFromQuery.length + pageStartIndex + i, e);
      }
    }
    if (pageIndex !== 0 && adjustIndexOfNextPagesBy) {
      const nextPageStartIndex = (pageIndex + 1) * this.pager.pageSize;
      const indices = [...this.resolved.keys()].sort((a, b) => a - b);
      for (const index of indices) {
        if (index >= nextPageStartIndex) {
          const e = this.resolved.get(index);
          if (e) {
            this.resolved.delete(index);
            this.resolved.set(index - adjustIndexOfNextPagesBy, e);
          }
        }
      }
    }
  }
}
export {
  AbstractExtensionsListView,
  DefaultPopularExtensionsView,
  DefaultRecommendedExtensionsView,
  DeprecatedExtensionsView,
  DisabledExtensionsView,
  EnabledExtensionsView,
  ExtensionsListView,
  NONE_CATEGORY,
  OutdatedExtensionsView,
  PreferredExtensionsPagedModel,
  RecentlyUpdatedExtensionsView,
  RecommendedExtensionsView,
  SearchMarketplaceExtensionsView,
  ServerInstalledExtensionsView,
  StaticQueryExtensionsView,
  UntrustedWorkspacePartiallySupportedExtensionsView,
  UntrustedWorkspaceUnsupportedExtensionsView,
  VirtualWorkspacePartiallySupportedExtensionsView,
  VirtualWorkspaceUnsupportedExtensionsView,
  WorkspaceRecommendedExtensionsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zVmlld3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSwgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgUGFnZWRNb2RlbCwgSVBhZ2VkTW9kZWwsIERlbGF5ZWRQYWdlZE1vZGVsLCBJUGFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgU29ydE9yZGVyLCBJUXVlcnlPcHRpb25zIGFzIElHYWxsZXJ5UXVlcnlPcHRpb25zLCBTb3J0QnkgYXMgR2FsbGVyeVNvcnRCeSwgSW5zdGFsbEV4dGVuc2lvbkluZm8sIEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUsIEV4dGVuc2lvbkdhbGxlcnlFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBhcHBlbmQsICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVzdWx0c0xpc3RGb2N1c2VkLCBFeHRlbnNpb25TdGF0ZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNWaWV3U3RhdGUsIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBRdWVyeSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25RdWVyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgdG9FeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENvdW50QmFkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFBhZ2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lLCBJVmlld1BhbmVPcHRpb25zLCBWaWV3UGFuZVNob3dBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QsIHJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZSwgRXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElFeHRlbnNpb25JZGVudGlmaWVyLCBpc0xhbmd1YWdlUGFja0V4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaXNPZmZsaW5lRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zTGlzdCB9IGZyb20gJy4vZXh0ZW5zaW9uc1ZpZXdlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBOT05FX0NBVEVHT1JZID0gJ25vbmUnO1xuXG50eXBlIE1lc3NhZ2UgPSB7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2V2ZXJpdHk6IFNldmVyaXR5O1xufTtcblxuY2xhc3MgRXh0ZW5zaW9uc1ZpZXdTdGF0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uc1ZpZXdTdGF0ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Gb2N1czogRW1pdHRlcjxJRXh0ZW5zaW9uPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFeHRlbnNpb24+KCkpO1xuXHRyZWFkb25seSBvbkZvY3VzOiBFdmVudDxJRXh0ZW5zaW9uPiA9IHRoaXMuX29uRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CbHVyOiBFbWl0dGVyPElFeHRlbnNpb24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uQmx1cjogRXZlbnQ8SUV4dGVuc2lvbj4gPSB0aGlzLl9vbkJsdXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50bHlGb2N1c2VkSXRlbXM6IElFeHRlbnNpb25bXSA9IFtdO1xuXG5cdGZpbHRlcnM6IHtcblx0XHRmZWF0dXJlSWQ/OiBzdHJpbmc7XG5cdH0gPSB7fTtcblxuXHRvbkZvY3VzQ2hhbmdlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudGx5Rm9jdXNlZEl0ZW1zLmZvckVhY2goZXh0ZW5zaW9uID0+IHRoaXMuX29uQmx1ci5maXJlKGV4dGVuc2lvbikpO1xuXHRcdHRoaXMuY3VycmVudGx5Rm9jdXNlZEl0ZW1zID0gZXh0ZW5zaW9ucztcblx0XHR0aGlzLmN1cnJlbnRseUZvY3VzZWRJdGVtcy5mb3JFYWNoKGV4dGVuc2lvbiA9PiB0aGlzLl9vbkZvY3VzLmZpcmUoZXh0ZW5zaW9uKSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBFeHRlbnNpb25zTGlzdFZpZXdPcHRpb25zIHtcblx0c2VydmVyPzogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXI7XG5cdGZsZXhpYmxlSGVpZ2h0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUaXRsZT86IEV2ZW50PHN0cmluZz47XG5cdGhpZGVCYWRnZT86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUXVlcnlSZXN1bHQge1xuXHRtb2RlbDogSVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj47XG5cdG1lc3NhZ2U/OiB7IHRleHQ6IHN0cmluZzsgc2V2ZXJpdHk6IFNldmVyaXR5IH07XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWw/OiBFdmVudDxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj47XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNvbnN0IGVudW0gTG9jYWxTb3J0Qnkge1xuXHRVcGRhdGVEYXRlID0gJ1VwZGF0ZURhdGUnLFxufVxuXG5mdW5jdGlvbiBpc0xvY2FsU29ydEJ5KHZhbHVlOiBhbnkpOiB2YWx1ZSBpcyBMb2NhbFNvcnRCeSB7XG5cdHN3aXRjaCAodmFsdWUgYXMgTG9jYWxTb3J0QnkpIHtcblx0XHRjYXNlIExvY2FsU29ydEJ5LlVwZGF0ZURhdGU6IHJldHVybiB0cnVlO1xuXHR9XG59XG5cbnR5cGUgU29ydEJ5ID0gTG9jYWxTb3J0QnkgfCBHYWxsZXJ5U29ydEJ5O1xudHlwZSBJUXVlcnlPcHRpb25zID0gT21pdDxJR2FsbGVyeVF1ZXJ5T3B0aW9ucywgJ3NvcnRCeSc+ICYgeyBzb3J0Qnk/OiBTb3J0QnkgfTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3PFQ+IGV4dGVuZHMgVmlld1BhbmUge1xuXHRhYnN0cmFjdCBzaG93KHF1ZXJ5OiBzdHJpbmcsIHJlZnJlc2g/OiBib29sZWFuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxUPj47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zTGlzdFZpZXcgZXh0ZW5kcyBBYnN0cmFjdEV4dGVuc2lvbnNMaXN0VmlldzxJRXh0ZW5zaW9uPiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgUkVDRU5UX1VQREFURV9EVVJBVElPTiA9IDcgKiAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyA3IGRheXNcblxuXHRwcml2YXRlIGJvZHlUZW1wbGF0ZToge1xuXHRcdG1lc3NhZ2VDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRcdG1lc3NhZ2VTZXZlcml0eUljb246IEhUTUxFbGVtZW50O1xuXHRcdG1lc3NhZ2VCb3g6IEhUTUxFbGVtZW50O1xuXHRcdGV4dGVuc2lvbnNMaXN0OiBIVE1MRWxlbWVudDtcblx0fSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBiYWRnZTogQ291bnRCYWRnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsaXN0OiBXb3JrYmVuY2hQYWdlZExpc3Q8SUV4dGVuc2lvbj4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBxdWVyeVJlcXVlc3Q6IHsgcXVlcnk6IHN0cmluZzsgcmVxdWVzdDogQ2FuY2VsYWJsZVByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBxdWVyeVJlc3VsdDogSVF1ZXJ5UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGV4dGVuc2lvbnNWaWV3U3RhdGU6IEV4dGVuc2lvbnNWaWV3U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudUFjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG9wdGlvbnM6IEV4dGVuc2lvbnNMaXN0Vmlld09wdGlvbnMsXG5cdFx0dmlld2xldFZpZXdPcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcm90ZWN0ZWQgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJvdGVjdGVkIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIHByb3RlY3RlZCBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi4odmlld2xldFZpZXdPcHRpb25zIGFzIElWaWV3UGFuZU9wdGlvbnMpLFxuXHRcdFx0c2hvd0FjdGlvbnM6IFZpZXdQYW5lU2hvd0FjdGlvbnMuQWx3YXlzLFxuXHRcdFx0bWF4aW11bUJvZHlTaXplOiBvcHRpb25zLmZsZXhpYmxlSGVpZ2h0ID8gKHN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihgJHt2aWV3bGV0Vmlld09wdGlvbnMuaWR9LnNpemVgLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgMCkgPyB1bmRlZmluZWQgOiAwKSA6IHVuZGVmaW5lZFxuXHRcdH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMub25EaWRDaGFuZ2VUaXRsZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vcHRpb25zLm9uRGlkQ2hhbmdlVGl0bGUodGl0bGUgPT4gdGhpcy51cGRhdGVUaXRsZSh0aXRsZSkpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRNZW51QWN0aW9uUnVubmVyLm9uRGlkUnVuKCh7IGVycm9yIH0pID0+IGVycm9yICYmIHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcikpKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHsgfVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJIZWFkZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdleHRlbnNpb24tdmlldy1oZWFkZXInKTtcblx0XHRzdXBlci5yZW5kZXJIZWFkZXIoY29udGFpbmVyKTtcblxuXHRcdGlmICghdGhpcy5vcHRpb25zLmhpZGVCYWRnZSkge1xuXHRcdFx0dGhpcy5iYWRnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb3VudEJhZGdlKGFwcGVuZChjb250YWluZXIsICQoJy5jb3VudC1iYWRnZS13cmFwcGVyJykpLCB7fSwgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5tZXNzYWdlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBtZXNzYWdlU2V2ZXJpdHlJY29uID0gYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsICQoJycpKTtcblx0XHRjb25zdCBtZXNzYWdlQm94ID0gYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsICQoJy5tZXNzYWdlJykpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNMaXN0ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV4dGVuc2lvbnMtbGlzdCcpKTtcblx0XHR0aGlzLmV4dGVuc2lvbnNWaWV3U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0ZW5zaW9uc1ZpZXdTdGF0ZSgpKTtcblx0XHR0aGlzLmxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNMaXN0LCBleHRlbnNpb25zTGlzdCwgdGhpcy5pZCwge30sIHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZSkpLmxpc3Q7XG5cdFx0RXh0ZW5zaW9uUmVzdWx0c0xpc3RGb2N1c2VkLmJpbmRUbyh0aGlzLmxpc3QuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5leHRlbnNpb25zVmlld1N0YXRlPy5vbkZvY3VzQ2hhbmdlKGNvYWxlc2NlKGUuZWxlbWVudHMpKSwgdGhpcykpO1xuXG5cdFx0dGhpcy5ib2R5VGVtcGxhdGUgPSB7XG5cdFx0XHRleHRlbnNpb25zTGlzdCxcblx0XHRcdG1lc3NhZ2VCb3gsXG5cdFx0XHRtZXNzYWdlQ29udGFpbmVyLFxuXHRcdFx0bWVzc2FnZVNldmVyaXR5SWNvblxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5xdWVyeVJlc3VsdCkge1xuXHRcdFx0dGhpcy5zZXRNb2RlbCh0aGlzLnF1ZXJ5UmVzdWx0Lm1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0aWYgKHRoaXMuYm9keVRlbXBsYXRlKSB7XG5cdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5leHRlbnNpb25zTGlzdC5zdHlsZS5oZWlnaHQgPSBoZWlnaHQgKyAncHgnO1xuXHRcdH1cblx0XHR0aGlzLmxpc3Q/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdGFzeW5jIHNob3cocXVlcnk6IHN0cmluZywgcmVmcmVzaD86IGJvb2xlYW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0aWYgKHRoaXMucXVlcnlSZXF1ZXN0KSB7XG5cdFx0XHRpZiAoIXJlZnJlc2ggJiYgdGhpcy5xdWVyeVJlcXVlc3QucXVlcnkgPT09IHF1ZXJ5KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnF1ZXJ5UmVxdWVzdC5yZXF1ZXN0O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5xdWVyeVJlcXVlc3QucmVxdWVzdC5jYW5jZWwoKTtcblx0XHRcdHRoaXMucXVlcnlSZXF1ZXN0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5xdWVyeVJlc3VsdCkge1xuXHRcdFx0dGhpcy5xdWVyeVJlc3VsdC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNWaWV3U3RhdGUuZmlsdGVycyA9IHt9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZFF1ZXJ5ID0gUXVlcnkucGFyc2UocXVlcnkpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyA9IHtcblx0XHRcdHNvcnRPcmRlcjogU29ydE9yZGVyLkRlZmF1bHRcblx0XHR9O1xuXG5cdFx0c3dpdGNoIChwYXJzZWRRdWVyeS5zb3J0QnkpIHtcblx0XHRcdGNhc2UgJ2luc3RhbGxzJzogb3B0aW9ucy5zb3J0QnkgPSBHYWxsZXJ5U29ydEJ5Lkluc3RhbGxDb3VudDsgYnJlYWs7XG5cdFx0XHRjYXNlICdyYXRpbmcnOiBvcHRpb25zLnNvcnRCeSA9IEdhbGxlcnlTb3J0QnkuV2VpZ2h0ZWRSYXRpbmc7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnbmFtZSc6IG9wdGlvbnMuc29ydEJ5ID0gR2FsbGVyeVNvcnRCeS5UaXRsZTsgYnJlYWs7XG5cdFx0XHRjYXNlICdwdWJsaXNoZWREYXRlJzogb3B0aW9ucy5zb3J0QnkgPSBHYWxsZXJ5U29ydEJ5LlB1Ymxpc2hlZERhdGU7IGJyZWFrO1xuXHRcdFx0Y2FzZSAndXBkYXRlRGF0ZSc6IG9wdGlvbnMuc29ydEJ5ID0gTG9jYWxTb3J0QnkuVXBkYXRlRGF0ZTsgYnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMucXVlcnlSZXN1bHQgPSBhd2FpdCB0aGlzLnF1ZXJ5KHBhcnNlZFF1ZXJ5LCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5xdWVyeVJlc3VsdC5tb2RlbDtcblx0XHRcdFx0dGhpcy5zZXRNb2RlbChtb2RlbCwgdGhpcy5xdWVyeVJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdFx0aWYgKHRoaXMucXVlcnlSZXN1bHQub25EaWRDaGFuZ2VNb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMucXVlcnlSZXN1bHQuZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVlcnlSZXN1bHQub25EaWRDaGFuZ2VNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5xdWVyeVJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnF1ZXJ5UmVzdWx0Lm1vZGVsID0gbW9kZWw7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlTW9kZWwobW9kZWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFBhZ2VkTW9kZWwoW10pO1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdFx0dGhpcy5zZXRNb2RlbChtb2RlbCwgdGhpcy5nZXRNZXNzYWdlKGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5saXN0ID8gdGhpcy5saXN0Lm1vZGVsIDogbW9kZWw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXF1ZXN0LmZpbmFsbHkoKCkgPT4gdGhpcy5xdWVyeVJlcXVlc3QgPSBudWxsKTtcblx0XHR0aGlzLnF1ZXJ5UmVxdWVzdCA9IHsgcXVlcnksIHJlcXVlc3QgfTtcblx0XHRyZXR1cm4gcmVxdWVzdDtcblx0fVxuXG5cdGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlSZXN1bHQ/Lm1vZGVsLmxlbmd0aCA/PyAwO1xuXHR9XG5cblx0cHJvdGVjdGVkIHNob3dFbXB0eU1vZGVsKCk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBlbXB0eU1vZGVsID0gbmV3IFBhZ2VkTW9kZWwoW10pO1xuXHRcdHRoaXMuc2V0TW9kZWwoZW1wdHlNb2RlbCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlbXB0eU1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnkocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElRdWVyeVJlc3VsdD4ge1xuXHRcdGNvbnN0IGlkUmVnZXggPSAvQGlkOigoW2EtejAtOUEtWl1bYS16MC05XFwtQS1aXSopXFwuKFthLXowLTlBLVpdW2EtejAtOVxcLUEtWl0qKSkvZztcblx0XHRjb25zdCBpZHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGlkTWF0Y2g7XG5cdFx0d2hpbGUgKChpZE1hdGNoID0gaWRSZWdleC5leGVjKHF1ZXJ5LnZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBpZE1hdGNoWzFdO1xuXHRcdFx0aWRzLnB1c2gobmFtZSk7XG5cdFx0fVxuXHRcdGlmIChpZHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucXVlcnlCeUlkcyhpZHMsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdHJldHVybiB7IG1vZGVsLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdFx0fVxuXG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlLCBxdWVyeS5zb3J0QnkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5xdWVyeUxvY2FsKHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoUG9wdWxhclF1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cXVlcnkudmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKCdAcG9wdWxhcicsICcnKTtcblx0XHRcdG9wdGlvbnMuc29ydEJ5ID0gIW9wdGlvbnMuc29ydEJ5ID8gR2FsbGVyeVNvcnRCeS5JbnN0YWxsQ291bnQgOiBvcHRpb25zLnNvcnRCeTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoUmVjZW50bHlQdWJsaXNoZWRRdWVyeShxdWVyeS52YWx1ZSkpIHtcblx0XHRcdHF1ZXJ5LnZhbHVlID0gcXVlcnkudmFsdWUucmVwbGFjZSgnQHJlY2VudGx5UHVibGlzaGVkJywgJycpO1xuXHRcdFx0b3B0aW9ucy5zb3J0QnkgPSAhb3B0aW9ucy5zb3J0QnkgPyBHYWxsZXJ5U29ydEJ5LlB1Ymxpc2hlZERhdGUgOiBvcHRpb25zLnNvcnRCeTtcblx0XHR9XG5cblx0XHRjb25zdCBnYWxsZXJ5UXVlcnlPcHRpb25zOiBJR2FsbGVyeVF1ZXJ5T3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc29ydEJ5OiBpc0xvY2FsU29ydEJ5KG9wdGlvbnMuc29ydEJ5KSA/IHVuZGVmaW5lZCA6IG9wdGlvbnMuc29ydEJ5IH07XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlHYWxsZXJ5KHF1ZXJ5LCBnYWxsZXJ5UXVlcnlPcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5QnlJZHMoaWRzOiBzdHJpbmdbXSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IGlkc1NldDogU2V0PHN0cmluZz4gPSBpZHMucmVkdWNlKChyZXN1bHQsIGlkKSA9PiB7IHJlc3VsdC5hZGQoaWQudG9Mb3dlckNhc2UoKSk7IHJldHVybiByZXN1bHQ7IH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKHRoaXMub3B0aW9ucy5zZXJ2ZXIpKVxuXHRcdFx0LmZpbHRlcihlID0+IGlkc1NldC5oYXMoZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKTtcblxuXHRcdGNvbnN0IGdhbGxlcnlJZHMgPSByZXN1bHQubGVuZ3RoID8gaWRzLmZpbHRlcihpZCA9PiByZXN1bHQuZXZlcnkociA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoci5pZGVudGlmaWVyLCB7IGlkIH0pKSkgOiBpZHM7XG5cblx0XHRpZiAoZ2FsbGVyeUlkcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdhbGxlcnlSZXN1bHQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZ2FsbGVyeUlkcy5tYXAoaWQgPT4gKHsgaWQgfSkpLCB7IHNvdXJjZTogJ3F1ZXJ5QnlJZCcgfSwgdG9rZW4pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uZ2FsbGVyeVJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5TG9jYWwocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogUHJvbWlzZTxJUXVlcnlSZXN1bHQ+IHtcblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCh0aGlzLm9wdGlvbnMuc2VydmVyKTtcblx0XHRsZXQgeyBleHRlbnNpb25zLCBjYW5JbmNsdWRlSW5zdGFsbGVkRXh0ZW5zaW9ucywgZGVzY3JpcHRpb24gfSA9IGF3YWl0IHRoaXMuZmlsdGVyTG9jYWwobG9jYWwsIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLCBxdWVyeSwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4oKSk7XG5cblx0XHRpZiAoY2FuSW5jbHVkZUluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGxldCBpc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlzRGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vbkNoYW5nZSwgZSA9PiBlPy5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKSxcblx0XHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1xuXHRcdFx0KSwgKCkgPT4gdW5kZWZpbmVkKShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5vcHRpb25zLnNlcnZlciA/IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLmZpbHRlcihlID0+IGUuc2VydmVyID09PSB0aGlzLm9wdGlvbnMuc2VydmVyKSA6IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWw7XG5cdFx0XHRcdGNvbnN0IHsgZXh0ZW5zaW9uczogbmV3RXh0ZW5zaW9ucyB9ID0gYXdhaXQgdGhpcy5maWx0ZXJMb2NhbChsb2NhbCwgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVyZ2VkRXh0ZW5zaW9ucyA9IHRoaXMubWVyZ2VBZGRlZEV4dGVuc2lvbnMoZXh0ZW5zaW9ucywgbmV3RXh0ZW5zaW9ucyk7XG5cdFx0XHRcdFx0aWYgKG1lcmdlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnMgPSBtZXJnZWRFeHRlbnNpb25zO1xuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbC5maXJlKG5ldyBQYWdlZE1vZGVsKGV4dGVuc2lvbnMpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kZWw6IG5ldyBQYWdlZE1vZGVsKGV4dGVuc2lvbnMpLFxuXHRcdFx0bWVzc2FnZTogZGVzY3JpcHRpb24gPyB7IHRleHQ6IGRlc2NyaXB0aW9uLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9IDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VNb2RlbDogb25EaWRDaGFuZ2VNb2RlbC5ldmVudCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmlsdGVyTG9jYWwobG9jYWw6IElFeHRlbnNpb25bXSwgcnVubmluZ0V4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBQcm9taXNlPHsgZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdOyBjYW5JbmNsdWRlSW5zdGFsbGVkRXh0ZW5zaW9uczogYm9vbGVhbjsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gcXVlcnkudmFsdWU7XG5cdFx0bGV0IGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluY2x1ZGVCdWlsdGluID0gL0BidWlsdGluL2kudGVzdCh2YWx1ZSk7XG5cdFx0Y29uc3QgY2FuSW5jbHVkZUluc3RhbGxlZEV4dGVuc2lvbnMgPSAhaW5jbHVkZUJ1aWx0aW47XG5cblx0XHRpZiAoL0BpbnN0YWxsZWQvaS50ZXN0KHZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVySW5zdGFsbGVkRXh0ZW5zaW9ucyhsb2NhbCwgcnVubmluZ0V4dGVuc2lvbnMsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICgvQG91dGRhdGVkL2kudGVzdCh2YWx1ZSkpIHtcblx0XHRcdGV4dGVuc2lvbnMgPSB0aGlzLmZpbHRlck91dGRhdGVkRXh0ZW5zaW9ucyhsb2NhbCwgcXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9AZGlzYWJsZWQvaS50ZXN0KHZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyRGlzYWJsZWRFeHRlbnNpb25zKGxvY2FsLCBydW5uaW5nRXh0ZW5zaW9ucywgcXVlcnksIG9wdGlvbnMsIGluY2x1ZGVCdWlsdGluKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICgvQGVuYWJsZWQvaS50ZXN0KHZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyRW5hYmxlZEV4dGVuc2lvbnMobG9jYWwsIHJ1bm5pbmdFeHRlbnNpb25zLCBxdWVyeSwgb3B0aW9ucywgaW5jbHVkZUJ1aWx0aW4pO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9Ad29ya3NwYWNlVW5zdXBwb3J0ZWQvaS50ZXN0KHZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zKGxvY2FsLCBxdWVyeSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoL0BkZXByZWNhdGVkL2kudGVzdChxdWVyeS52YWx1ZSkpIHtcblx0XHRcdGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmZpbHRlckRlcHJlY2F0ZWRFeHRlbnNpb25zKGxvY2FsLCBxdWVyeSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoL0ByZWNlbnRseVVwZGF0ZWQvaS50ZXN0KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9ucyhsb2NhbCwgcXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9AcmVzdGFydHJlcXVpcmVkL2kudGVzdChxdWVyeS52YWx1ZSkpIHtcblx0XHRcdGV4dGVuc2lvbnMgPSB0aGlzLmZpbHRlclJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMobG9jYWwsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICgvQGNvbnRyaWJ1dGU6L2kudGVzdChxdWVyeS52YWx1ZSkpIHtcblx0XHRcdGV4dGVuc2lvbnMgPSB0aGlzLmZpbHRlckV4dGVuc2lvbnNCeUZlYXR1cmUobG9jYWwsIHF1ZXJ5KTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChpbmNsdWRlQnVpbHRpbikge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyQnVpbHRpbkV4dGVuc2lvbnMobG9jYWwsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBleHRlbnNpb25zLCBjYW5JbmNsdWRlSW5zdGFsbGVkRXh0ZW5zaW9ucywgZGVzY3JpcHRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyQnVpbHRpbkV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogSUV4dGVuc2lvbltdIHtcblx0XHRsZXQgeyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfSA9IHRoaXMucGFyc2VDYXRlZ29yaWVzKHF1ZXJ5LnZhbHVlKTtcblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2VBbGwoL0BidWlsdGluL2dpLCAnJykucmVwbGFjZUFsbCgvQHNvcnQ6KFxcdyspKC1cXHcqKT8vZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9jYWxcblx0XHRcdC5maWx0ZXIoZSA9PiBlLmlzQnVpbHRpbiAmJiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSlcblx0XHRcdFx0JiYgdGhpcy5maWx0ZXJFeHRlbnNpb25CeUNhdGVnb3J5KGUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhyZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJFeHRlbnNpb25CeUNhdGVnb3J5KGU6IElFeHRlbnNpb24sIGluY2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW10sIGV4Y2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRpZiAoIWluY2x1ZGVkQ2F0ZWdvcmllcy5sZW5ndGggJiYgIWV4Y2x1ZGVkQ2F0ZWdvcmllcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZS5jYXRlZ29yaWVzLmxlbmd0aCkge1xuXHRcdFx0aWYgKGV4Y2x1ZGVkQ2F0ZWdvcmllcy5sZW5ndGggJiYgZS5jYXRlZ29yaWVzLnNvbWUoY2F0ZWdvcnkgPT4gZXhjbHVkZWRDYXRlZ29yaWVzLmluY2x1ZGVzKGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZS5jYXRlZ29yaWVzLnNvbWUoY2F0ZWdvcnkgPT4gaW5jbHVkZWRDYXRlZ29yaWVzLmluY2x1ZGVzKGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGluY2x1ZGVkQ2F0ZWdvcmllcy5pbmNsdWRlcyhOT05FX0NBVEVHT1JZKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlQ2F0ZWdvcmllcyh2YWx1ZTogc3RyaW5nKTogeyB2YWx1ZTogc3RyaW5nOyBpbmNsdWRlZENhdGVnb3JpZXM6IHN0cmluZ1tdOyBleGNsdWRlZENhdGVnb3JpZXM6IHN0cmluZ1tdIH0ge1xuXHRcdGNvbnN0IGluY2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBleGNsdWRlZENhdGVnb3JpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9cXGJjYXRlZ29yeTooXCIoW15cIl0qKVwifChbXlwiXVxcUyopKShcXHMrfFxcYnwkKS9nLCAoXywgcXVvdGVkQ2F0ZWdvcnksIGNhdGVnb3J5KSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IChjYXRlZ29yeSB8fCBxdW90ZWRDYXRlZ29yeSB8fCAnJykudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChlbnRyeS5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdFx0aWYgKGV4Y2x1ZGVkQ2F0ZWdvcmllcy5pbmRleE9mKGVudHJ5KSA9PT0gLTEpIHtcblx0XHRcdFx0XHRleGNsdWRlZENhdGVnb3JpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChpbmNsdWRlZENhdGVnb3JpZXMuaW5kZXhPZihlbnRyeSkgPT09IC0xKSB7XG5cdFx0XHRcdFx0aW5jbHVkZWRDYXRlZ29yaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgdmFsdWUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzIH07XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckluc3RhbGxlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcnVubmluZ0V4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9AaW5zdGFsbGVkL2csICcnKS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCBtYXRjaGluZ1RleHQgPSAoZTogSUV4dGVuc2lvbikgPT4gKGUubmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEgfHwgZS5kZXNjcmlwdGlvbi50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpXG5cdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpO1xuXHRcdGxldCByZXN1bHQ7XG5cblx0XHRpZiAob3B0aW9ucy5zb3J0QnkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0ID0gbG9jYWwuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluICYmIG1hdGNoaW5nVGV4dChlKSk7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IGxvY2FsLmZpbHRlcihlID0+ICghZS5pc0J1aWx0aW4gfHwgZS5vdXRkYXRlZCB8fCBlLnJ1bnRpbWVTdGF0ZSAhPT0gdW5kZWZpbmVkKSAmJiBtYXRjaGluZ1RleHQoZSkpO1xuXHRcdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvbnNCeUlkID0gcnVubmluZ0V4dGVuc2lvbnMucmVkdWNlKChyZXN1bHQsIGUpID0+IHsgcmVzdWx0LnNldChlLmlkZW50aWZpZXIudmFsdWUsIGUpOyByZXR1cm4gcmVzdWx0OyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KCkpO1xuXG5cdFx0XHRjb25zdCBkZWZhdWx0U29ydCA9IChlMTogSUV4dGVuc2lvbiwgZTI6IElFeHRlbnNpb24pID0+IHtcblx0XHRcdFx0Y29uc3QgcnVubmluZzEgPSBydW5uaW5nRXh0ZW5zaW9uc0J5SWQuZ2V0KGUxLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb25zdCBpc0UxUnVubmluZyA9ICEhcnVubmluZzEgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmcxKSkgPT09IGUxLnNlcnZlcjtcblx0XHRcdFx0Y29uc3QgcnVubmluZzIgPSBydW5uaW5nRXh0ZW5zaW9uc0J5SWQuZ2V0KGUyLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb25zdCBpc0UyUnVubmluZyA9IHJ1bm5pbmcyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcih0b0V4dGVuc2lvbihydW5uaW5nMikpID09PSBlMi5zZXJ2ZXI7XG5cdFx0XHRcdGlmICgoaXNFMVJ1bm5pbmcgJiYgaXNFMlJ1bm5pbmcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGUxLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZGlzcGxheU5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlzRTFMYW5ndWFnZVBhY2tFeHRlbnNpb24gPSBlMS5sb2NhbCAmJiBpc0xhbmd1YWdlUGFja0V4dGVuc2lvbihlMS5sb2NhbC5tYW5pZmVzdCk7XG5cdFx0XHRcdGNvbnN0IGlzRTJMYW5ndWFnZVBhY2tFeHRlbnNpb24gPSBlMi5sb2NhbCAmJiBpc0xhbmd1YWdlUGFja0V4dGVuc2lvbihlMi5sb2NhbC5tYW5pZmVzdCk7XG5cdFx0XHRcdGlmICghaXNFMVJ1bm5pbmcgJiYgIWlzRTJSdW5uaW5nKSB7XG5cdFx0XHRcdFx0aWYgKGlzRTFMYW5ndWFnZVBhY2tFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzRTJMYW5ndWFnZVBhY2tFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChpc0UxUnVubmluZyAmJiBpc0UyTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKSB8fCAoaXNFMlJ1bm5pbmcgJiYgaXNFMUxhbmd1YWdlUGFja0V4dGVuc2lvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGlzRTFSdW5uaW5nID8gLTEgOiAxO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IGRlcHJlY2F0ZWQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb3V0ZGF0ZWQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWN0aW9uUmVxdWlyZWQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm9BY3Rpb25SZXF1aXJlZDogSUV4dGVuc2lvbltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgZSBvZiByZXN1bHQpIHtcblx0XHRcdFx0aWYgKGUuZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUludmFsaWRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRpbmNvbXBhdGlibGUucHVzaChlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChlLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0XHRcdGRlcHJlY2F0ZWQucHVzaChlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChlLm91dGRhdGVkICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGUuZW5hYmxlbWVudFN0YXRlKSkge1xuXHRcdFx0XHRcdG91dGRhdGVkLnB1c2goZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoZS5ydW50aW1lU3RhdGUpIHtcblx0XHRcdFx0XHRhY3Rpb25SZXF1aXJlZC5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdG5vQWN0aW9uUmVxdWlyZWQucHVzaChlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQgPSBbXG5cdFx0XHRcdC4uLmluY29tcGF0aWJsZS5zb3J0KGRlZmF1bHRTb3J0KSxcblx0XHRcdFx0Li4uZGVwcmVjYXRlZC5zb3J0KGRlZmF1bHRTb3J0KSxcblx0XHRcdFx0Li4ub3V0ZGF0ZWQuc29ydChkZWZhdWx0U29ydCksXG5cdFx0XHRcdC4uLmFjdGlvblJlcXVpcmVkLnNvcnQoZGVmYXVsdFNvcnQpLFxuXHRcdFx0XHQuLi5ub0FjdGlvblJlcXVpcmVkLnNvcnQoZGVmYXVsdFNvcnQpXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJPdXRkYXRlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogSUV4dGVuc2lvbltdIHtcblx0XHRsZXQgeyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfSA9IHRoaXMucGFyc2VDYXRlZ29yaWVzKHF1ZXJ5LnZhbHVlKTtcblxuXHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZSgvQG91dGRhdGVkL2csICcnKS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBsb2NhbFxuXHRcdFx0LnNvcnQoKGUxLCBlMikgPT4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSkpXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24ub3V0ZGF0ZWRcblx0XHRcdFx0JiYgKGV4dGVuc2lvbi5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBleHRlbnNpb24uZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKVxuXHRcdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZXh0ZW5zaW9uLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcykpO1xuXG5cdFx0cmV0dXJuIHRoaXMuc29ydEV4dGVuc2lvbnMocmVzdWx0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyRGlzYWJsZWRFeHRlbnNpb25zKGxvY2FsOiBJRXh0ZW5zaW9uW10sIHJ1bm5pbmdFeHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCBpbmNsdWRlQnVpbHRpbjogYm9vbGVhbik6IElFeHRlbnNpb25bXSB7XG5cdFx0bGV0IHsgdmFsdWUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzIH0gPSB0aGlzLnBhcnNlQ2F0ZWdvcmllcyhxdWVyeS52YWx1ZSk7XG5cblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2VBbGwoL0BkaXNhYmxlZHxAYnVpbHRpbi9naSwgJycpLnJlcGxhY2VBbGwoL0Bzb3J0OihcXHcrKSgtXFx3Kik/L2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGlmIChpbmNsdWRlQnVpbHRpbikge1xuXHRcdFx0bG9jYWwgPSBsb2NhbC5maWx0ZXIoZSA9PiBlLmlzQnVpbHRpbik7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGxvY2FsXG5cdFx0XHQuc29ydCgoZTEsIGUyKSA9PiBlMS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmRpc3BsYXlOYW1lKSlcblx0XHRcdC5maWx0ZXIoZSA9PiBydW5uaW5nRXh0ZW5zaW9ucy5ldmVyeShyID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiByLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IHIudXVpZCB9LCBlLmlkZW50aWZpZXIpKVxuXHRcdFx0XHQmJiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSlcblx0XHRcdFx0JiYgdGhpcy5maWx0ZXJFeHRlbnNpb25CeUNhdGVnb3J5KGUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhyZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJFbmFibGVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBydW5uaW5nRXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgaW5jbHVkZUJ1aWx0aW46IGJvb2xlYW4pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXG5cdFx0dmFsdWUgPSB2YWx1ZSA/IHZhbHVlLnJlcGxhY2VBbGwoL0BlbmFibGVkfEBidWlsdGluL2dpLCAnJykucmVwbGFjZUFsbCgvQHNvcnQ6KFxcdyspKC1cXHcqKT8vZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpIDogJyc7XG5cblx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihlID0+IGUuaXNCdWlsdGluID09PSBpbmNsdWRlQnVpbHRpbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9jYWxcblx0XHRcdC5zb3J0KChlMSwgZTIpID0+IGUxLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZGlzcGxheU5hbWUpKVxuXHRcdFx0LmZpbHRlcihlID0+IHJ1bm5pbmdFeHRlbnNpb25zLnNvbWUociA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiByLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IHIudXVpZCB9LCBlLmlkZW50aWZpZXIpKVxuXHRcdFx0XHQmJiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSlcblx0XHRcdFx0JiYgdGhpcy5maWx0ZXJFeHRlbnNpb25CeUNhdGVnb3J5KGUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhyZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogSUV4dGVuc2lvbltdIHtcblx0XHQvLyBzaG93cyBsb2NhbCBleHRlbnNpb25zIHdoaWNoIGFyZSByZXN0cmljdGVkIG9yIGRpc2FibGVkIGluIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBiZWNhdXNlIG9mIHRoZSBleHRlbnNpb24ncyBjYXBhYmlsaXR5XG5cblx0XHRjb25zdCBxdWVyeVN0cmluZyA9IHF1ZXJ5LnZhbHVlOyAvLyBAc29ydGJ5IGlzIGFscmVhZHkgZmlsdGVyZWQgb3V0XG5cblx0XHRjb25zdCBtYXRjaCA9IHF1ZXJ5U3RyaW5nLm1hdGNoKC9eXFxzKkB3b3Jrc3BhY2VVbnN1cHBvcnRlZCg/OjoodW50cnVzdGVkfHZpcnR1YWwpKFBhcnRpYWwpPyk/KD86XFxzKyhbXlxcc10qKSk/L2kpO1xuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IG1hdGNoWzFdPy50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHBhcnRpYWwgPSAhIW1hdGNoWzJdO1xuXHRcdGNvbnN0IG5hbWVGaWx0ZXIgPSBtYXRjaFszXT8udG9Mb3dlckNhc2UoKTtcblxuXHRcdGlmIChuYW1lRmlsdGVyKSB7XG5cdFx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKG5hbWVGaWx0ZXIpID4gLTEgfHwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihuYW1lRmlsdGVyKSA+IC0xKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNWaXJ0dWFsU3VwcG9ydFR5cGUgPSAoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBzdXBwb3J0VHlwZTogRXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlKSA9PiB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSA9PT0gc3VwcG9ydFR5cGU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGhhc1Jlc3RyaWN0ZWRTdXBwb3J0VHlwZSA9IChleHRlbnNpb246IElFeHRlbnNpb24sIHN1cHBvcnRUeXBlOiBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZSkgPT4ge1xuXHRcdFx0aWYgKCFleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdGUgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24ubG9jYWwpO1xuXHRcdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSAmJiBlbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlICYmXG5cdFx0XHRcdGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50ICYmIGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25EZXBlbmRlbmN5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpID09PSBzdXBwb3J0VHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1cHBvcnRUeXBlID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb25zdCBkZXBlbmRlbmNpZXMgPSBnZXRFeHRlbnNpb25EZXBlbmRlbmNpZXMobG9jYWwubWFwKGV4dCA9PiBleHQubG9jYWwhKSwgZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdFx0cmV0dXJuIGRlcGVuZGVuY2llcy5zb21lKGV4dCA9PiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0Lm1hbmlmZXN0KSA9PT0gc3VwcG9ydFR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluVmlydHVhbFdvcmtzcGFjZSA9IGlzVmlydHVhbFdvcmtzcGFjZSh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpO1xuXHRcdGNvbnN0IGluUmVzdHJpY3RlZFdvcmtzcGFjZSA9ICF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cblx0XHRpZiAodHlwZSA9PT0gJ3ZpcnR1YWwnKSB7XG5cdFx0XHQvLyBzaG93IGxpbWl0ZWQgYW5kIGRpc2FibGVkIGV4dGVuc2lvbnMgdW5sZXNzIGRpc2FibGVkIGJlY2F1c2Ugb2YgYSB1bnRydXN0ZWQgd29ya3NwYWNlXG5cdFx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihleHRlbnNpb24gPT4gaW5WaXJ0dWFsV29ya3NwYWNlICYmIGhhc1ZpcnR1YWxTdXBwb3J0VHlwZShleHRlbnNpb24sIHBhcnRpYWwgPyAnbGltaXRlZCcgOiBmYWxzZSkgJiYgIShpblJlc3RyaWN0ZWRXb3Jrc3BhY2UgJiYgaGFzUmVzdHJpY3RlZFN1cHBvcnRUeXBlKGV4dGVuc2lvbiwgZmFsc2UpKSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSAndW50cnVzdGVkJykge1xuXHRcdFx0Ly8gc2hvdyBsaW1pdGVkIGFuZCBkaXNhYmxlZCBleHRlbnNpb25zIHVubGVzcyBkaXNhYmxlZCBiZWNhdXNlIG9mIGEgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PiBoYXNSZXN0cmljdGVkU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLCBwYXJ0aWFsID8gJ2xpbWl0ZWQnIDogZmFsc2UpICYmICEoaW5WaXJ0dWFsV29ya3NwYWNlICYmIGhhc1ZpcnR1YWxTdXBwb3J0VHlwZShleHRlbnNpb24sIGZhbHNlKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBzaG93IGV4dGVuc2lvbnMgdGhhdCBhcmUgcmVzdHJpY3RlZCBvciBkaXNhYmxlZCBpbiB0aGUgY3VycmVudCB3b3Jrc3BhY2Vcblx0XHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PiBpblZpcnR1YWxXb3Jrc3BhY2UgJiYgIWhhc1ZpcnR1YWxTdXBwb3J0VHlwZShleHRlbnNpb24sIHRydWUpIHx8IGluUmVzdHJpY3RlZFdvcmtzcGFjZSAmJiAhaGFzUmVzdHJpY3RlZFN1cHBvcnRUeXBlKGV4dGVuc2lvbiwgdHJ1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhsb2NhbCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZpbHRlckRlcHJlY2F0ZWRFeHRlbnNpb25zKGxvY2FsOiBJRXh0ZW5zaW9uW10sIHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyk6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AZGVwcmVjYXRlZC9nLCAnJykucmVwbGFjZSgvQHNvcnQ6KFxcdyspKC1cXHcqKT8vZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRjb25zdCBkZXByZWNhdGVkRXh0ZW5zaW9uSWRzID0gT2JqZWN0LmtleXMoZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5kZXByZWNhdGVkKTtcblx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihlID0+IGRlcHJlY2F0ZWRFeHRlbnNpb25JZHMuaW5jbHVkZXMoZS5pZGVudGlmaWVyLmlkKSAmJiAoIXZhbHVlIHx8IGUubmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpKTtcblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhsb2NhbCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlY2VudGx5VXBkYXRlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogSUV4dGVuc2lvbltdIHtcblx0XHRsZXQgeyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfSA9IHRoaXMucGFyc2VDYXRlZ29yaWVzKHF1ZXJ5LnZhbHVlKTtcblx0XHRjb25zdCBjdXJyZW50VGltZSA9IERhdGUubm93KCk7XG5cdFx0bG9jYWwgPSBsb2NhbC5maWx0ZXIoZSA9PiAhZS5pc0J1aWx0aW4gJiYgIWUub3V0ZGF0ZWQgJiYgZS5sb2NhbD8udXBkYXRlZCAmJiBlLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJiBjdXJyZW50VGltZSAtIGUubG9jYWwuaW5zdGFsbGVkVGltZXN0YW1wIDwgRXh0ZW5zaW9uc0xpc3RWaWV3LlJFQ0VOVF9VUERBVEVfRFVSQVRJT04pO1xuXG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9AcmVjZW50bHlVcGRhdGVkL2csICcnKS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBsb2NhbC5maWx0ZXIoZSA9PlxuXHRcdFx0KGUubmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpXG5cdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpKTtcblxuXHRcdG9wdGlvbnMuc29ydEJ5ID0gb3B0aW9ucy5zb3J0QnkgPz8gTG9jYWxTb3J0QnkuVXBkYXRlRGF0ZTtcblxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogSUV4dGVuc2lvbltdIHtcblx0XHRsZXQgeyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfSA9IHRoaXMucGFyc2VDYXRlZ29yaWVzKHF1ZXJ5LnZhbHVlKTtcblx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihlID0+IGUucnVudGltZVN0YXRlICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9AcmVzdGFydHJlcXVpcmVkL2dpLCAnJykucmVwbGFjZSgvQHNvcnQ6KFxcdyspKC1cXHcqKT8vZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9jYWwuZmlsdGVyKGUgPT5cblx0XHRcdChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKVxuXHRcdFx0JiYgdGhpcy5maWx0ZXJFeHRlbnNpb25CeUNhdGVnb3J5KGUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhyZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJFeHRlbnNpb25zQnlGZWF0dXJlKGxvY2FsOiBJRXh0ZW5zaW9uW10sIHF1ZXJ5OiBRdWVyeSk6IElFeHRlbnNpb25bXSB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AY29udHJpYnV0ZTovZywgJycpLnRyaW0oKTtcblx0XHRjb25zdCBmZWF0dXJlSWQgPSB2YWx1ZS5zcGxpdCgnICcpWzBdO1xuXHRcdGNvbnN0IGZlYXR1cmUgPSBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5nZXRFeHRlbnNpb25GZWF0dXJlKGZlYXR1cmVJZCk7XG5cdFx0aWYgKCFmZWF0dXJlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbnNWaWV3U3RhdGUpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZS5maWx0ZXJzLmZlYXR1cmVJZCA9IGZlYXR1cmVJZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBmZWF0dXJlLnJlbmRlcmVyID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZTxJRXh0ZW5zaW9uRmVhdHVyZVJlbmRlcmVyPihmZWF0dXJlLnJlbmRlcmVyKSA6IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBbSUV4dGVuc2lvbiwgbnVtYmVyXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGUgb2YgbG9jYWwpIHtcblx0XHRcdFx0aWYgKCFlLmxvY2FsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWNjZXNzRGF0YSA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGUuaWRlbnRpZmllci5pZCksIGZlYXR1cmVJZCk7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFJlbmRlciA9IHJlbmRlcmVyPy5zaG91bGRSZW5kZXIoZS5sb2NhbC5tYW5pZmVzdCk7XG5cdFx0XHRcdGlmIChhY2Nlc3NEYXRhIHx8IHNob3VsZFJlbmRlcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFtlLCBhY2Nlc3NEYXRhPy5hY2Nlc3NUaW1lcy5sZW5ndGggPz8gMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0LnNvcnQoKFssIGFdLCBbLCBiXSkgPT4gYiAtIGEpLm1hcCgoW2VdKSA9PiBlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVuZGVyZXI/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlQWRkZWRFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgbmV3RXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvbGRFeHRlbnNpb25zID0gWy4uLmV4dGVuc2lvbnNdO1xuXHRcdGNvbnN0IGZpbmRQcmV2aW91c0V4dGVuc2lvbkluZGV4ID0gKGZyb206IG51bWJlcik6IG51bWJlciA9PiB7XG5cdFx0XHRsZXQgaW5kZXggPSAtMTtcblx0XHRcdGNvbnN0IHByZXZpb3VzRXh0ZW5zaW9uSW5OZXcgPSBuZXdFeHRlbnNpb25zW2Zyb21dO1xuXHRcdFx0aWYgKHByZXZpb3VzRXh0ZW5zaW9uSW5OZXcpIHtcblx0XHRcdFx0aW5kZXggPSBvbGRFeHRlbnNpb25zLmZpbmRJbmRleChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgcHJldmlvdXNFeHRlbnNpb25Jbk5ldy5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmluZFByZXZpb3VzRXh0ZW5zaW9uSW5kZXgoZnJvbSAtIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0fTtcblxuXHRcdGxldCBoYXNDaGFuZ2VkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG5ld0V4dGVuc2lvbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBuZXdFeHRlbnNpb25zW2luZGV4XTtcblx0XHRcdGlmIChleHRlbnNpb25zLmV2ZXJ5KHIgPT4gIWFyZVNhbWVFeHRlbnNpb25zKHIuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0ZXh0ZW5zaW9ucy5zcGxpY2UoZmluZFByZXZpb3VzRXh0ZW5zaW9uSW5kZXgoaW5kZXggLSAxKSArIDEsIDAsIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhc0NoYW5nZWQgPyBleHRlbnNpb25zIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeUdhbGxlcnkocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJR2FsbGVyeVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUXVlcnlSZXN1bHQ+IHtcblx0XHRjb25zdCBoYXNVc2VyRGVmaW5lZFNvcnRPcmRlciA9IG9wdGlvbnMuc29ydEJ5ICE9PSB1bmRlZmluZWQ7XG5cdFx0aWYgKCFoYXNVc2VyRGVmaW5lZFNvcnRPcmRlciAmJiAhcXVlcnkudmFsdWUudHJpbSgpKSB7XG5cdFx0XHRvcHRpb25zLnNvcnRCeSA9IEdhbGxlcnlTb3J0QnkuSW5zdGFsbENvdW50O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzUmVjb21tZW5kYXRpb25zUXVlcnkocXVlcnkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucXVlcnlSZWNvbW1lbmRhdGlvbnMocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdHJldHVybiB7IG1vZGVsLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHF1ZXJ5LnZhbHVlO1xuXG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRvcHRpb25zLnNvdXJjZSA9ICd2aWV3bGV0Jztcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUdhbGxlcnkob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWw6IG5ldyBQYWdlZE1vZGVsKHBhZ2VyKSwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHRcdH1cblxuXHRcdGlmICgvXFxiZXh0OihbXlxcc10rKVxcYi9nLnRlc3QodGV4dCkpIHtcblx0XHRcdG9wdGlvbnMudGV4dCA9IHRleHQ7XG5cdFx0XHRvcHRpb25zLnNvdXJjZSA9ICdmaWxlLWV4dGVuc2lvbi10YWdzJztcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUdhbGxlcnkob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWw6IG5ldyBQYWdlZE1vZGVsKHBhZ2VyKSwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHRcdH1cblxuXHRcdG9wdGlvbnMudGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIDM1MCk7XG5cdFx0b3B0aW9ucy5zb3VyY2UgPSAnc2VhcmNoVGV4dCc7XG5cblx0XHRpZiAoaGFzVXNlckRlZmluZWRTb3J0T3JkZXIgfHwgL1xcYihjYXRlZ29yeXx0YWcpOihbXlxcc10rKVxcYi9naS50ZXN0KHRleHQpIHx8IC9cXGJmZWF0dXJlZChcXHMrfFxcYnwkKS9naS50ZXN0KHRleHQpKSB7XG5cdFx0XHRjb25zdCBwYWdlciA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlHYWxsZXJ5KG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdHJldHVybiB7IG1vZGVsOiBuZXcgUGFnZWRNb2RlbChwYWdlciksIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW3BhZ2VyLCBwcmVmZXJyZWRFeHRlbnNpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUdhbGxlcnkob3B0aW9ucywgdG9rZW4pLFxuXHRcdFx0XHR0aGlzLmdldFByZWZlcnJlZEV4dGVuc2lvbnMob3B0aW9ucy50ZXh0LnRvTG93ZXJDYXNlKCksIHRva2VuKS5jYXRjaCgoKSA9PiBbXSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IHByZWZlcnJlZEV4dGVuc2lvbnMubGVuZ3RoID8gbmV3IFByZWZlcnJlZEV4dGVuc2lvbnNQYWdlZE1vZGVsKHByZWZlcnJlZEV4dGVuc2lvbnMsIHBhZ2VyKSA6IG5ldyBQYWdlZE1vZGVsKHBhZ2VyKTtcblx0XHRcdHJldHVybiB7IG1vZGVsLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBFeHRlbnNpb25HYWxsZXJ5RXJyb3IpKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWFyY2hUZXh0ID0gb3B0aW9ucy50ZXh0LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+ICFlLmlzQnVpbHRpbiAmJiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzZWFyY2hUZXh0KSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHNlYXJjaFRleHQpID4gLTEgfHwgZS5kZXNjcmlwdGlvbi50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc2VhcmNoVGV4dCkgPiAtMSkpO1xuXHRcdFx0aWYgKGxvY2FsRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuZ2V0TWVzc2FnZShlcnJvcik7XG5cdFx0XHRcdHJldHVybiB7IG1vZGVsOiBuZXcgUGFnZWRNb2RlbChsb2NhbEV4dGVuc2lvbnMpLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBtZXNzYWdlOiB7IHRleHQ6IGxvY2FsaXplKCdzaG93aW5nIGxvY2FsIGV4dGVuc2lvbnMgb25seScsIFwiezB9IFNob3dpbmcgbG9jYWwgZXh0ZW5zaW9ucy5cIiwgbWVzc2FnZS50ZXh0KSwgc2V2ZXJpdHk6IG1lc3NhZ2Uuc2V2ZXJpdHkgfSB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFByZWZlcnJlZEV4dGVuc2lvbnMoc2VhcmNoVGV4dDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHByZWZlcnJlZEV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+ICFlLmlzQnVpbHRpbiAmJiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzZWFyY2hUZXh0KSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHNlYXJjaFRleHQpID4gLTEgfHwgZS5kZXNjcmlwdGlvbi50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc2VhcmNoVGV4dCkgPiAtMSkpO1xuXHRcdGNvbnN0IHByZWZlcnJlZEV4dGVuc2lvblVVSURzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRpZiAocHJlZmVycmVkRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdC8vIFVwZGF0ZSBnYWxsZXJ5IGRhdGEgZm9yIHByZWZlcnJlZCBleHRlbnNpb25zIGlmIHRoZXkgYXJlIG5vdCB5ZXQgZmV0Y2hlZFxuXHRcdFx0Y29uc3QgZXh0ZXNpb25zVG9GZXRjaDogSUV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcHJlZmVycmVkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRcdHByZWZlcnJlZEV4dGVuc2lvblVVSURzLmFkZChleHRlbnNpb24uaWRlbnRpZmllci51dWlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWV4dGVuc2lvbi5nYWxsZXJ5ICYmIGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpIHtcblx0XHRcdFx0XHRleHRlc2lvbnNUb0ZldGNoLnB1c2goZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZXNpb25zVG9GZXRjaC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVzaW9uc1RvRmV0Y2gsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLmNhdGNoKGUgPT4gbnVsbC8qaWdub3JlIGVycm9yKi8pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByZWZlcnJlZFJlc3VsdHM6IHN0cmluZ1tdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShtYW5pZmVzdC5zZWFyY2gpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBtYW5pZmVzdC5zZWFyY2gpIHtcblx0XHRcdFx0XHRpZiAocy5xdWVyeSAmJiBzLnF1ZXJ5LnRvTG93ZXJDYXNlKCkgPT09IHNlYXJjaFRleHQgJiYgQXJyYXkuaXNBcnJheShzLnByZWZlcnJlZFJlc3VsdHMpKSB7XG5cdFx0XHRcdFx0XHRwcmVmZXJyZWRSZXN1bHRzLnB1c2goLi4ucy5wcmVmZXJyZWRSZXN1bHRzKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByZWZlcnJlZFJlc3VsdHMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhwcmVmZXJyZWRSZXN1bHRzLm1hcChpZCA9PiAoeyBpZCB9KSksIHRva2VuKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcmVzdWx0KSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQgJiYgIXByZWZlcnJlZEV4dGVuc2lvblVVSURzLmhhcyhleHRlbnNpb24uaWRlbnRpZmllci51dWlkKSkge1xuXHRcdFx0XHRcdFx0cHJlZmVycmVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBnZXQgcHJlZmVycmVkIHJlc3VsdHMgZnJvbSB0aGUgZXh0ZW5zaW9ucyBjb250cm9sIG1hbmlmZXN0LicsIGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmZXJyZWRFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBzb3J0RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdHN3aXRjaCAob3B0aW9ucy5zb3J0QnkpIHtcblx0XHRcdGNhc2UgR2FsbGVyeVNvcnRCeS5JbnN0YWxsQ291bnQ6XG5cdFx0XHRcdGV4dGVuc2lvbnMgPSBleHRlbnNpb25zLnNvcnQoKGUxLCBlMikgPT4gdHlwZW9mIGUyLmluc3RhbGxDb3VudCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGUxLmluc3RhbGxDb3VudCA9PT0gJ251bWJlcicgPyBlMi5pbnN0YWxsQ291bnQgLSBlMS5pbnN0YWxsQ291bnQgOiBOYU4pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTG9jYWxTb3J0QnkuVXBkYXRlRGF0ZTpcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PlxuXHRcdFx0XHRcdHR5cGVvZiBlMi5sb2NhbD8uaW5zdGFsbGVkVGltZXN0YW1wID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZTEubG9jYWw/Lmluc3RhbGxlZFRpbWVzdGFtcCA9PT0gJ251bWJlcicgPyBlMi5sb2NhbC5pbnN0YWxsZWRUaW1lc3RhbXAgLSBlMS5sb2NhbC5pbnN0YWxsZWRUaW1lc3RhbXAgOlxuXHRcdFx0XHRcdFx0dHlwZW9mIGUyLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXAgPT09ICdudW1iZXInID8gMSA6XG5cdFx0XHRcdFx0XHRcdHR5cGVvZiBlMS5sb2NhbD8uaW5zdGFsbGVkVGltZXN0YW1wID09PSAnbnVtYmVyJyA/IC0xIDogTmFOKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdhbGxlcnlTb3J0QnkuQXZlcmFnZVJhdGluZzpcblx0XHRcdGNhc2UgR2FsbGVyeVNvcnRCeS5XZWlnaHRlZFJhdGluZzpcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PiB0eXBlb2YgZTIucmF0aW5nID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZTEucmF0aW5nID09PSAnbnVtYmVyJyA/IGUyLnJhdGluZyAtIGUxLnJhdGluZyA6IE5hTik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PiBlMS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmRpc3BsYXlOYW1lKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5zb3J0T3JkZXIgPT09IFNvcnRPcmRlci5EZXNjZW5kaW5nKSB7XG5cdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5yZXZlcnNlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1JlY29tbWVuZGF0aW9uc1F1ZXJ5KHF1ZXJ5OiBRdWVyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBFeHRlbnNpb25zTGlzdFZpZXcuaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSlcblx0XHRcdHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc0tleW1hcHNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSlcblx0XHRcdHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xhbmd1YWdlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpXG5cdFx0XHR8fCBFeHRlbnNpb25zTGlzdFZpZXcuaXNFeGVSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSlcblx0XHRcdHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlbW90ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKVxuXHRcdFx0fHwgL0ByZWNvbW1lbmRlZDphbGwvaS50ZXN0KHF1ZXJ5LnZhbHVlKVxuXHRcdFx0fHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpXG5cdFx0XHR8fCBFeHRlbnNpb25zTGlzdFZpZXcuaXNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5UmVjb21tZW5kYXRpb25zKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdC8vIFdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEtleW1hcCByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzS2V5bWFwc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0S2V5bWFwUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBMYW5ndWFnZSByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTGFuZ3VhZ2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldExhbmd1YWdlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBFeGUgcmVjb21tZW5kYXRpb25zXG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0V4ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RXhlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdGUgcmVjb21tZW5kYXRpb25zXG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlbW90ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UmVtb3RlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBBbGwgcmVjb21tZW5kYXRpb25zXG5cdFx0aWYgKC9AcmVjb21tZW5kZWQ6YWxsL2kudGVzdChxdWVyeS52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldEFsbFJlY29tbWVuZGF0aW9uc01vZGVsKG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggcmVjb21tZW5kYXRpb25zXG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaFJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSB8fFxuXHRcdFx0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSAmJiBvcHRpb25zLnNvcnRCeSAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoUmVjb21tZW5kYXRpb25zKHF1ZXJ5LCBvcHRpb25zLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXIgcmVjb21tZW5kYXRpb25zXG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0T3RoZXJSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChbXSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zOiBBcnJheTxzdHJpbmcgfCBVUkk+LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0aWYgKHJlY29tbWVuZGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VFeHRlbnNpb25zOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZWNvbW1lbmRhdGlvbiBvZiByZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByZWNvbW1lbmRhdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKHJlY29tbWVuZGF0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvdXJjZUV4dGVuc2lvbnMucHVzaChyZWNvbW1lbmRhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChnYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb25zLm1hcChpZCA9PiAoeyBpZCB9KSksIHsgc291cmNlOiBvcHRpb25zLnNvdXJjZSB9LCB0b2tlbik7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5ICYmICFleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvXG5cdFx0XHRcdFx0XHRcdCYmIGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24uZ2FsbGVyeSkgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKCFyZXNvdXJjZUV4dGVuc2lvbnMubGVuZ3RoIHx8ICF0aGlzLmlzT2ZmbGluZUVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb3VyY2VFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRSZXNvdXJjZUV4dGVuc2lvbnMocmVzb3VyY2VFeHRlbnNpb25zLCB0cnVlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwoZXh0ZW5zaW9uKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTxBcnJheTxzdHJpbmcgfCBVUkk+PiB7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGNvbnN0IHsgaW1wb3J0YW50IH0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0Q29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb24gb2YgaW1wb3J0YW50KSB7XG5cdFx0XHRpZiAoIXJlY29tbWVuZGF0aW9ucy5maW5kKGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkID09PSBjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uKSkge1xuXHRcdFx0XHRyZWNvbW1lbmRhdGlvbnMucHVzaChjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlY29tbWVuZGF0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0V29ya3NwYWNlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMtd29ya3NwYWNlJyB9LCB0b2tlbikpO1xuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEtleW1hcFJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHZhbHVlID0gcXVlcnkudmFsdWUucmVwbGFjZSgvQHJlY29tbWVuZGVkOmtleW1hcHMvZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRLZXltYXBSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMta2V5bWFwcycgfSwgdG9rZW4pKVxuXHRcdFx0LmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKTtcblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwoaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMYW5ndWFnZVJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHZhbHVlID0gcXVlcnkudmFsdWUucmVwbGFjZSgvQHJlY29tbWVuZGVkOmxhbmd1YWdlcy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldExhbmd1YWdlUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0Y29uc3QgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhyZWNvbW1lbmRhdGlvbnMsIHsgLi4ub3B0aW9ucywgc291cmNlOiAncmVjb21tZW5kYXRpb25zLWxhbmd1YWdlcycgfSwgdG9rZW4pKVxuXHRcdFx0LmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKTtcblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwoaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZW1vdGVSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCB2YWx1ZSA9IHF1ZXJ5LnZhbHVlLnJlcGxhY2UoL0ByZWNvbW1lbmRlZDpyZW1vdGVzL2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0UmVtb3RlUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0Y29uc3QgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhyZWNvbW1lbmRhdGlvbnMsIHsgLi4ub3B0aW9ucywgc291cmNlOiAncmVjb21tZW5kYXRpb25zLXJlbW90ZXMnIH0sIHRva2VuKSlcblx0XHRcdC5maWx0ZXIoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSk7XG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXhlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgZXhlID0gcXVlcnkudmFsdWUucmVwbGFjZSgvQGV4ZTovZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHsgaW1wb3J0YW50LCBvdGhlcnMgfSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRFeGVCYXNlZFJlY29tbWVuZGF0aW9ucyhleGUuc3RhcnRzV2l0aCgnXCInKSA/IGV4ZS5zdWJzdHJpbmcoMSwgZXhlLmxlbmd0aCAtIDEpIDogZXhlKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMoWy4uLmltcG9ydGFudCwgLi4ub3RoZXJzXSwgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMtZXhlJyB9LCB0b2tlbik7XG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0T3RoZXJSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBvdGhlclJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0T3RoZXJSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMob3RoZXJSZWNvbW1lbmRhdGlvbnMsIHsgLi4ub3B0aW9ucywgc291cmNlOiAncmVjb21tZW5kYXRpb25zLW90aGVyJywgc29ydEJ5OiB1bmRlZmluZWQgfSwgdG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvYWxlc2NlKG90aGVyUmVjb21tZW5kYXRpb25zLm1hcChpZCA9PiBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucy5maW5kKGkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaS5pZGVudGlmaWVyLCB7IGlkIH0pKSkpO1xuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChyZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPdGhlclJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgbG9jYWwgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKHRoaXMub3B0aW9ucy5zZXJ2ZXIpKVxuXHRcdFx0Lm1hcChlID0+IGUuaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMgPSAoYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKSlcblx0XHRcdC5tYXAoZXh0ZW5zaW9uSWQgPT4gaXNTdHJpbmcoZXh0ZW5zaW9uSWQpID8gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSA6IGV4dGVuc2lvbklkKTtcblxuXHRcdHJldHVybiBkaXN0aW5jdChcblx0XHRcdChhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdC8vIE9yZGVyIGlzIGltcG9ydGFudFxuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0SW1wb3J0YW50UmVjb21tZW5kYXRpb25zKCksXG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRGaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMoKSxcblx0XHRcdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldE90aGVyUmVjb21tZW5kYXRpb25zKClcblx0XHRcdF0pKS5mbGF0KCkuZmlsdGVyKGV4dGVuc2lvbklkID0+ICFsb2NhbC5pbmNsdWRlcyhleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKSAmJiAhd29ya3NwYWNlUmVjb21tZW5kYXRpb25zLmluY2x1ZGVzKGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHQpLCBleHRlbnNpb25JZCA9PiBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKTtcblx0fVxuXG5cdC8vIEdldCBBbGwgdHlwZXMgb2YgcmVjb21tZW5kYXRpb25zLCB0cmltbWVkIHRvIHNob3cgYSBtYXggb2YgOCBhdCBhbnkgZ2l2ZW4gdGltZVxuXHRwcml2YXRlIGFzeW5jIGdldEFsbFJlY29tbWVuZGF0aW9uc01vZGVsKG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwodGhpcy5vcHRpb25zLnNlcnZlcik7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25JZHMgPSBsb2NhbEV4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXG5cdFx0Y29uc3QgYWxsUmVjb21tZW5kYXRpb25zID0gZGlzdGluY3QoXG5cdFx0XHQoYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHQvLyBPcmRlciBpcyBpbXBvcnRhbnRcblx0XHRcdFx0dGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKSxcblx0XHRcdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEltcG9ydGFudFJlY29tbWVuZGF0aW9ucygpLFxuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0RmlsZUJhc2VkUmVjb21tZW5kYXRpb25zKCksXG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRPdGhlclJlY29tbWVuZGF0aW9ucygpXG5cdFx0XHRdKSkuZmxhdCgpLmZpbHRlcihleHRlbnNpb25JZCA9PiB7XG5cdFx0XHRcdGlmIChpc1N0cmluZyhleHRlbnNpb25JZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gIWxvY2FsRXh0ZW5zaW9uSWRzLmluY2x1ZGVzKGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAhbG9jYWxFeHRlbnNpb25zLnNvbWUobG9jYWxFeHRlbnNpb24gPT4gbG9jYWxFeHRlbnNpb24ubG9jYWwgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwobG9jYWxFeHRlbnNpb24ubG9jYWwubG9jYXRpb24sIGV4dGVuc2lvbklkKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMoYWxsUmVjb21tZW5kYXRpb25zLCB7IC4uLm9wdGlvbnMsIHNvdXJjZTogJ3JlY29tbWVuZGF0aW9ucy1hbGwnLCBzb3J0Qnk6IHVuZGVmaW5lZCB9LCB0b2tlbik7XG5cblx0XHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMubGVuZ3RoICYmIHJlc3VsdC5sZW5ndGggPCA4OyBpKyspIHtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uID0gYWxsUmVjb21tZW5kYXRpb25zW2ldO1xuXHRcdFx0aWYgKGlzU3RyaW5nKHJlY29tbWVuZGF0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucy5maW5kKGV4dGVuc2lvbiA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgeyBpZDogcmVjb21tZW5kYXRpb24gfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMuZmluZChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbi5sb2NhdGlvbiwgcmVjb21tZW5kYXRpb24pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwocmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VhcmNoUmVjb21tZW5kYXRpb25zKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHZhbHVlID0gcXVlcnkudmFsdWUucmVwbGFjZSgvQHJlY29tbWVuZGVkL2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSBkaXN0aW5jdChbLi4uYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKSwgLi4uYXdhaXQgdGhpcy5nZXRPdGhlclJlY29tbWVuZGF0aW9ucygpXSk7XG5cdFx0Y29uc3QgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhyZWNvbW1lbmRhdGlvbnMsIHsgLi4ub3B0aW9ucywgc291cmNlOiAncmVjb21tZW5kYXRpb25zJywgc29ydEJ5OiB1bmRlZmluZWQgfSwgdG9rZW4pKVxuXHRcdFx0LmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKTtcblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwodGhpcy5zb3J0RXh0ZW5zaW9ucyhpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucywgb3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNb2RlbChtb2RlbDogSVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4sIG1lc3NhZ2U/OiBNZXNzYWdlLCBkb25vdFJlc2V0U2Nyb2xsVG9wPzogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLmxpc3QpIHtcblx0XHRcdHRoaXMubGlzdC5tb2RlbCA9IG5ldyBEZWxheWVkUGFnZWRNb2RlbChtb2RlbCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJvZHkobWVzc2FnZSk7XG5cdFx0XHRpZiAoIWRvbm90UmVzZXRTY3JvbGxUb3ApIHtcblx0XHRcdFx0dGhpcy5saXN0LnNjcm9sbFRvcCA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlLnNldENvdW50KHRoaXMuY291bnQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb2RlbChtb2RlbDogSVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4pIHtcblx0XHRpZiAodGhpcy5saXN0KSB7XG5cdFx0XHR0aGlzLmxpc3QubW9kZWwgPSBuZXcgRGVsYXllZFBhZ2VkTW9kZWwobW9kZWwpO1xuXHRcdFx0dGhpcy51cGRhdGVCb2R5KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlLnNldENvdW50KHRoaXMuY291bnQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb2R5KG1lc3NhZ2U/OiBNZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYm9keVRlbXBsYXRlKSB7XG5cblx0XHRcdGNvbnN0IGNvdW50ID0gdGhpcy5jb3VudCgpO1xuXHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUuZXh0ZW5zaW9uc0xpc3QuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgY291bnQgPT09IDApO1xuXHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhbWVzc2FnZSAmJiBjb3VudCA+IDApO1xuXG5cdFx0XHRpZiAodGhpcy5pc0JvZHlWaXNpYmxlKCkpIHtcblx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlU2V2ZXJpdHlJY29uLmNsYXNzTmFtZSA9IFNldmVyaXR5SWNvbi5jbGFzc05hbWUobWVzc2FnZS5zZXZlcml0eSk7XG5cdFx0XHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUJveC50ZXh0Q29udGVudCA9IG1lc3NhZ2UudGV4dDtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmNvdW50KCkgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlU2V2ZXJpdHlJY29uLmNsYXNzTmFtZSA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VCb3gudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm8gZXh0ZW5zaW9ucyBmb3VuZCcsIFwiTm8gZXh0ZW5zaW9ucyBmb3VuZC5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VCb3gudGV4dENvbnRlbnQpIHtcblx0XHRcdFx0XHRhbGVydCh0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQm94LnRleHRDb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNZXNzYWdlKGVycm9yOiBhbnkpOiBNZXNzYWdlIHtcblx0XHRpZiAodGhpcy5pc09mZmxpbmVFcnJvcihlcnJvcikpIHtcblx0XHRcdHJldHVybiB7IHRleHQ6IGxvY2FsaXplKCdvZmZsaW5lIGVycm9yJywgXCJVbmFibGUgdG8gc2VhcmNoIHRoZSBNYXJrZXRwbGFjZSB3aGVuIG9mZmxpbmUsIHBsZWFzZSBjaGVjayB5b3VyIG5ldHdvcmsgY29ubmVjdGlvbi5cIiksIHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IHRleHQ6IGxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3Igd2hpbGUgZmV0Y2hpbmcgZXh0ZW5zaW9ucy4gezB9XCIsIGdldEVycm9yTWVzc2FnZShlcnJvcikpLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzT2ZmbGluZUVycm9yKGVycm9yOiBFcnJvcik6IGJvb2xlYW4ge1xuXHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbkdhbGxlcnlFcnJvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yLmNvZGUgPT09IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuT2ZmbGluZTtcblx0XHR9XG5cdFx0cmV0dXJuIGlzT2ZmbGluZUVycm9yKGVycm9yKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVTaXplKCkge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmxleGlibGVIZWlnaHQpIHtcblx0XHRcdHRoaXMubWF4aW11bUJvZHlTaXplID0gdGhpcy5saXN0Py5tb2RlbC5sZW5ndGggPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiAwO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShgJHt0aGlzLmlkfS5zaXplYCwgdGhpcy5saXN0Py5tb2RlbC5sZW5ndGggfHwgMCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0aWYgKHRoaXMucXVlcnlSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVxdWVzdC5yZXF1ZXN0LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5xdWVyeVJlcXVlc3QgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5xdWVyeVJlc3VsdCkge1xuXHRcdFx0dGhpcy5xdWVyeVJlc3VsdC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLmxpc3QgPSBudWxsO1xuXHR9XG5cblx0c3RhdGljIGlzTG9jYWxFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZywgc29ydEJ5Pzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzU2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc091dGRhdGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc0VuYWJsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzRGlzYWJsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzQnVpbHRJbkV4dGVuc2lvbnNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNTZWFyY2hCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc0J1aWx0SW5Hcm91cEV4dGVuc2lvbnNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNTZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NlYXJjaFJlY2VudGx5VXBkYXRlZFF1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1Jlc3RhcnRSZXF1aXJlZFF1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NlYXJjaEV4dGVuc2lvblVwZGF0ZXNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNTb3J0SW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LCBzb3J0QnkpXG5cdFx0XHR8fCB0aGlzLmlzRmVhdHVyZUV4dGVuc2lvbnNRdWVyeShxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTZWFyY2hCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BidWlsdGluXFxzLit8LitcXHNAYnVpbHRpbi9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzQnVpbHRJbkV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9eQGJ1aWx0aW4kL2kudGVzdChxdWVyeS50cmltKCkpO1xuXHR9XG5cblx0c3RhdGljIGlzQnVpbHRJbkdyb3VwRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL15AYnVpbHRpbjouKyQvaS50ZXN0KHF1ZXJ5LnRyaW0oKSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTZWFyY2hXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9eXFxzKkB3b3Jrc3BhY2VVbnN1cHBvcnRlZCg6KHVudHJ1c3RlZHx2aXJ0dWFsKShQYXJ0aWFsKT8pPyhcXHN8JCkvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0luc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AaW5zdGFsbGVkJC9pLnRlc3QocXVlcnkpICYmICEvQG1jcC9pLnRlc3QocXVlcnkpICYmICEvQGFnZW50UGx1Z2lucy9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKC9AaW5zdGFsbGVkXFxzLi9pLnRlc3QocXVlcnkpICYmICEvQG1jcC9pLnRlc3QocXVlcnkpICYmICEvQGFnZW50UGx1Z2lucy9pLnRlc3QocXVlcnkpKSB8fCB0aGlzLmlzRmVhdHVyZUV4dGVuc2lvbnNRdWVyeShxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNPdXRkYXRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9Ab3V0ZGF0ZWQvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0VuYWJsZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQGVuYWJsZWQvaS50ZXN0KHF1ZXJ5KSAmJiAhL0BidWlsdGluL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNEaXNhYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AZGlzYWJsZWQvaS50ZXN0KHF1ZXJ5KSAmJiAhL0BidWlsdGluL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BkZXByZWNhdGVkXFxzPy4qL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9eQHJlY29tbWVuZGVkJC9pLnRlc3QocXVlcnkudHJpbSgpKTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaFJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNvbW1lbmRlZFxccy4rL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AcmVjb21tZW5kZWQ6d29ya3NwYWNlL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNFeGVSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AZXhlOi4rL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNSZW1vdGVSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AcmVjb21tZW5kZWQ6cmVtb3Rlcy9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzS2V5bWFwc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNvbW1lbmRlZDprZXltYXBzL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNMYW5ndWFnZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNvbW1lbmRlZDpsYW5ndWFnZXMvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1NvcnRJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZywgc29ydEJ5Pzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChzb3J0QnkgIT09IHVuZGVmaW5lZCAmJiBzb3J0QnkgIT09ICcnICYmIHF1ZXJ5ID09PSAnJykgfHwgKCFzb3J0QnkgJiYgL15Ac29ydDpcXFMqJC9pLnRlc3QocXVlcnkpKTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaFBvcHVsYXJRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AcG9wdWxhci9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoUmVjZW50bHlQdWJsaXNoZWRRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AcmVjZW50bHlQdWJsaXNoZWQvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaFJlY2VudGx5VXBkYXRlZFF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNlbnRseVVwZGF0ZWQvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1Jlc3RhcnRSZXF1aXJlZFF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZXN0YXJ0cmVxdWlyZWQvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaEV4dGVuc2lvblVwZGF0ZXNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AdXBkYXRlcy9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU29ydFVwZGF0ZURhdGVRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9Ac29ydDp1cGRhdGVEYXRlL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNGZWF0dXJlRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0Bjb250cmlidXRlOi9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRpZiAoIXRoaXMubGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghKHRoaXMubGlzdC5nZXRGb2N1cygpLmxlbmd0aCB8fCB0aGlzLmxpc3QuZ2V0U2VsZWN0aW9uKCkubGVuZ3RoKSkge1xuXHRcdFx0dGhpcy5saXN0LmZvY3VzTmV4dCgpO1xuXHRcdH1cblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdFBvcHVsYXJFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdygpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgcXVlcnkgPSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgIXRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmICF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPyAnQHdlYicgOiAnJztcblx0XHRyZXR1cm4gc3VwZXIuc2hvdyhxdWVyeSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU2VydmVySW5zdGFsbGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRxdWVyeSA9IHF1ZXJ5ID8gcXVlcnkgOiAnQGluc3RhbGxlZCc7XG5cdFx0aWYgKCFFeHRlbnNpb25zTGlzdFZpZXcuaXNMb2NhbEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgfHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU29ydEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkgKz0gJyBAaW5zdGFsbGVkJztcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLnNob3cocXVlcnkudHJpbSgpKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRxdWVyeSA9IHF1ZXJ5IHx8ICdAZW5hYmxlZCc7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbnNMaXN0Vmlldy5pc0VuYWJsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpID8gc3VwZXIuc2hvdyhxdWVyeSkgOlxuXHRcdFx0RXh0ZW5zaW9uc0xpc3RWaWV3LmlzU29ydEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgPyBzdXBlci5zaG93KCdAZW5hYmxlZCAnICsgcXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblxuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0cXVlcnkgPSBxdWVyeSB8fCAnQGRpc2FibGVkJztcblx0XHRyZXR1cm4gRXh0ZW5zaW9uc0xpc3RWaWV3LmlzRGlzYWJsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpID8gc3VwZXIuc2hvdyhxdWVyeSkgOlxuXHRcdFx0RXh0ZW5zaW9uc0xpc3RWaWV3LmlzU29ydEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgPyBzdXBlci5zaG93KCdAZGlzYWJsZWQgJyArIHF1ZXJ5KSA6IHRoaXMuc2hvd0VtcHR5TW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3V0ZGF0ZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHF1ZXJ5ID0gcXVlcnkgPyBxdWVyeSA6ICdAb3V0ZGF0ZWQnO1xuXHRcdGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hFeHRlbnNpb25VcGRhdGVzUXVlcnkocXVlcnkpKSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LnJlcGxhY2UoJ0B1cGRhdGVzJywgJ0BvdXRkYXRlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuc2hvdyhxdWVyeS50cmltKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZVNpemUoKSB7XG5cdFx0c3VwZXIudXBkYXRlU2l6ZSgpO1xuXHRcdHRoaXMuc2V0RXhwYW5kZWQodGhpcy5jb3VudCgpID4gMCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRxdWVyeSA9IHF1ZXJ5ID8gcXVlcnkgOiAnQHJlY2VudGx5VXBkYXRlZCc7XG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaEV4dGVuc2lvblVwZGF0ZXNRdWVyeShxdWVyeSkpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZSgnQHVwZGF0ZXMnLCAnQHJlY2VudGx5VXBkYXRlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuc2hvdyhxdWVyeS50cmltKCkpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdGF0aWNRdWVyeUV4dGVuc2lvbnNWaWV3T3B0aW9ucyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0Vmlld09wdGlvbnMge1xuXHRyZWFkb25seSBxdWVyeTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhdGljUXVlcnlFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IG9wdGlvbnM6IFN0YXRpY1F1ZXJ5RXh0ZW5zaW9uc1ZpZXdPcHRpb25zLFxuXHRcdHZpZXdsZXRWaWV3T3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywgdmlld2xldFZpZXdPcHRpb25zLCBub3RpZmljYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRcdGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgb3BlbmVyU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93KCk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRyZXR1cm4gc3VwZXIuc2hvdyh0aGlzLm9wdGlvbnMucXVlcnkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvU3BlY2lmaWNXb3Jrc3BhY2VVbnN1cHBvcnRlZFF1ZXJ5KHF1ZXJ5OiBzdHJpbmcsIHF1YWxpZmllcjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFxdWVyeSkge1xuXHRcdHJldHVybiAnQHdvcmtzcGFjZVVuc3VwcG9ydGVkOicgKyBxdWFsaWZpZXI7XG5cdH1cblx0Y29uc3QgbWF0Y2ggPSBxdWVyeS5tYXRjaChuZXcgUmVnRXhwKGBAd29ya3NwYWNlVW5zdXBwb3J0ZWQoOiR7cXVhbGlmaWVyfSk/KFxcXFxzfCQpYCwgJ2knKSk7XG5cdGlmIChtYXRjaCkge1xuXHRcdGlmICghbWF0Y2hbMV0pIHtcblx0XHRcdHJldHVybiBxdWVyeS5yZXBsYWNlKC9Ad29ya3NwYWNlVW5zdXBwb3J0ZWQvZ2ksICdAd29ya3NwYWNlVW5zdXBwb3J0ZWQ6JyArIHF1YWxpZmllcik7XG5cdFx0fVxuXHRcdHJldHVybiBxdWVyeTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBVbnRydXN0ZWRXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHVwZGF0ZWRRdWVyeSA9IHRvU3BlY2lmaWNXb3Jrc3BhY2VVbnN1cHBvcnRlZFF1ZXJ5KHF1ZXJ5LCAndW50cnVzdGVkJyk7XG5cdFx0cmV0dXJuIHVwZGF0ZWRRdWVyeSA/IHN1cGVyLnNob3codXBkYXRlZFF1ZXJ5KSA6IHRoaXMuc2hvd0VtcHR5TW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW50cnVzdGVkV29ya3NwYWNlUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdXBkYXRlZFF1ZXJ5ID0gdG9TcGVjaWZpY1dvcmtzcGFjZVVuc3VwcG9ydGVkUXVlcnkocXVlcnksICd1bnRydXN0ZWRQYXJ0aWFsJyk7XG5cdFx0cmV0dXJuIHVwZGF0ZWRRdWVyeSA/IHN1cGVyLnNob3codXBkYXRlZFF1ZXJ5KSA6IHRoaXMuc2hvd0VtcHR5TW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmlydHVhbFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdXBkYXRlZFF1ZXJ5ID0gdG9TcGVjaWZpY1dvcmtzcGFjZVVuc3VwcG9ydGVkUXVlcnkocXVlcnksICd2aXJ0dWFsJyk7XG5cdFx0cmV0dXJuIHVwZGF0ZWRRdWVyeSA/IHN1cGVyLnNob3codXBkYXRlZFF1ZXJ5KSA6IHRoaXMuc2hvd0VtcHR5TW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmlydHVhbFdvcmtzcGFjZVBhcnRpYWxseVN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHVwZGF0ZWRRdWVyeSA9IHRvU3BlY2lmaWNXb3Jrc3BhY2VVbnN1cHBvcnRlZFF1ZXJ5KHF1ZXJ5LCAndmlydHVhbFBhcnRpYWwnKTtcblx0XHRyZXR1cm4gdXBkYXRlZFF1ZXJ5ID8gc3VwZXIuc2hvdyh1cGRhdGVkUXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZXByZWNhdGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpID8gc3VwZXIuc2hvdyhxdWVyeSkgOiB0aGlzLnNob3dFbXB0eU1vZGVsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVwb3J0U2VhcmNoRmluaXNoZWREZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXIoMjAwMCkpO1xuXHRwcml2YXRlIHNlYXJjaFdhaXRQcm9taXNlOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHF1ZXJ5UHJvbWlzZSA9IHN1cGVyLnNob3cocXVlcnkpO1xuXHRcdHRoaXMucmVwb3J0U2VhcmNoRmluaXNoZWREZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZXBvcnRTZWFyY2hGaW5pc2hlZCgpKTtcblx0XHR0aGlzLnNlYXJjaFdhaXRQcm9taXNlID0gcXVlcnlQcm9taXNlLnRoZW4obnVsbCwgbnVsbCk7XG5cdFx0cmV0dXJuIHF1ZXJ5UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwb3J0U2VhcmNoRmluaXNoZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zZWFyY2hXYWl0UHJvbWlzZTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMignZXh0ZW5zaW9uc1ZpZXc6TWFya2V0cGxhY2VTZWFyY2hGaW5pc2hlZCcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0UmVjb21tZW5kZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkgPSAnQHJlY29tbWVuZGVkOmFsbCc7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5vbkRpZENoYW5nZVJlY29tbWVuZGF0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLnNob3coJycpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRpZiAocXVlcnkgJiYgcXVlcnkudHJpbSgpICE9PSB0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHN1cGVyLnNob3codGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLnNvbWUoZSA9PiAhZS5pc0J1aWx0aW4pKSB7XG5cdFx0XHQvLyBUaGlzIGlzIHBhcnQgb2YgcG9wdWxhciBleHRlbnNpb25zIHZpZXcuIENvbGxhcHNlIGlmIG5vIGluc3RhbGxlZCBleHRlbnNpb25zLlxuXHRcdFx0dGhpcy5zZXRFeHBhbmRlZChtb2RlbC5sZW5ndGggPiAwKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5ID0gJ0ByZWNvbW1lbmRlZCc7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5vbkRpZENoYW5nZVJlY29tbWVuZGF0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLnNob3coJycpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRyZXR1cm4gKHF1ZXJ5ICYmIHF1ZXJ5LnRyaW0oKSAhPT0gdGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSkgPyB0aGlzLnNob3dFbXB0eU1vZGVsKCkgOiBzdXBlci5zaG93KHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IGltcGxlbWVudHMgSVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcge1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5ID0gJ0ByZWNvbW1lbmRlZDp3b3Jrc3BhY2UnO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VSZWNvbW1lbmRhdGlvbnMoKCkgPT4gdGhpcy5zaG93KHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMuc2hvdyh0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHNob3VsZFNob3dFbXB0eVZpZXcgPSBxdWVyeSAmJiBxdWVyeS50cmltKCkgIT09ICdAcmVjb21tZW5kZWQnICYmIHF1ZXJ5LnRyaW0oKSAhPT0gJ0ByZWNvbW1lbmRlZDp3b3Jrc3BhY2UnO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgKHNob3VsZFNob3dFbXB0eVZpZXcgPyB0aGlzLnNob3dFbXB0eU1vZGVsKCkgOiBzdXBlci5zaG93KHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpKTtcblx0XHR0aGlzLnNldEV4cGFuZGVkKG1vZGVsLmxlbmd0aCA+IDApO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SW5zdGFsbGFibGVXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCkpXG5cdFx0XHQuZmlsdGVyKGwgPT4gbC5lbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCk7IC8vIEZpbHRlciBleHRlbnNpb25zIGRpc2FibGVkIGJ5IGtpbmRcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSAoYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKSlcblx0XHRcdC5maWx0ZXIocmVjb21tZW5kYXRpb24gPT4gaW5zdGFsbGVkLmV2ZXJ5KGxvY2FsID0+IGlzU3RyaW5nKHJlY29tbWVuZGF0aW9uKSA/ICFhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiByZWNvbW1lbmRhdGlvbiB9LCBsb2NhbC5pZGVudGlmaWVyKSA6ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZWNvbW1lbmRhdGlvbiwgbG9jYWwubG9jYWw/LmxvY2F0aW9uKSkpO1xuXHRcdHJldHVybiB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyBzb3VyY2U6ICdpbnN0YWxsLWFsbC13b3Jrc3BhY2UtcmVjb21tZW5kYXRpb25zJyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMgPSBhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlV29ya3NwYWNlUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0aWYgKGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IEluc3RhbGxFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc291cmNlRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlY29tbWVuZGF0aW9uIG9mIGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbi5nYWxsZXJ5KSB7XG5cdFx0XHRcdFx0Z2FsbGVyeUV4dGVuc2lvbnMucHVzaCh7IGV4dGVuc2lvbjogcmVjb21tZW5kYXRpb24uZ2FsbGVyeSwgb3B0aW9uczoge30gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VFeHRlbnNpb25zLnB1c2gocmVjb21tZW5kYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zKGdhbGxlcnlFeHRlbnNpb25zKSxcblx0XHRcdFx0Li4ucmVzb3VyY2VFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbikpXG5cdFx0XHRdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm8gbG9jYWwgZXh0ZW5zaW9ucycsIFwiVGhlcmUgYXJlIG5vIGV4dGVuc2lvbnMgdG8gaW5zdGFsbC5cIilcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBQcmVmZXJyZWRFeHRlbnNpb25zUGFnZWRNb2RlbCBpbXBsZW1lbnRzIElQYWdlZE1vZGVsPElFeHRlbnNpb24+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc29sdmVkID0gbmV3IE1hcDxudW1iZXIsIElFeHRlbnNpb24+KCk7XG5cdHByaXZhdGUgcHJlZmVycmVkR2FsbGVyeUV4dGVuc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZXNvbHZlZEdhbGxlcnlFeHRlbnNpb25zRnJvbVF1ZXJ5OiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBwYWdlczogQXJyYXk8e1xuXHRcdHByb21pc2U6IFByb21pc2U8dm9pZD4gfCBudWxsO1xuXHRcdGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCBudWxsO1xuXHRcdHByb21pc2VJbmRleGVzOiBTZXQ8bnVtYmVyPjtcblx0fT47XG5cblx0cHVibGljIHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXG5cdGdldCBvbkRpZEluY3JlbWVudExlbmd0aCgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gRXZlbnQuTm9uZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJlZmVycmVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFnZXI6IElQYWdlcjxJRXh0ZW5zaW9uPixcblx0KSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnByZWZlcnJlZEV4dGVuc2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMucmVzb2x2ZWQuc2V0KGksIHRoaXMucHJlZmVycmVkRXh0ZW5zaW9uc1tpXSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlIG9mIHByZWZlcnJlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChlLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHR0aGlzLnByZWZlcnJlZEdhbGxlcnlFeHRlbnNpb25zLmFkZChlLmlkZW50aWZpZXIudXVpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZXhwZWN0ZWQgdGhhdCBhbGwgcHJlZmVycmVkIGdhbGxlcnkgZXh0ZW5zaW9ucyB3aWxsIGJlIHBhcnQgb2YgdGhlIHF1ZXJ5IHJlc3VsdHNcblx0XHR0aGlzLmxlbmd0aCA9IChwcmVmZXJyZWRFeHRlbnNpb25zLmxlbmd0aCAtIHRoaXMucHJlZmVycmVkR2FsbGVyeUV4dGVuc2lvbnMuc2l6ZSkgKyB0aGlzLnBhZ2VyLnRvdGFsO1xuXG5cdFx0Y29uc3QgdG90YWxQYWdlcyA9IE1hdGguY2VpbCh0aGlzLnBhZ2VyLnRvdGFsIC8gdGhpcy5wYWdlci5wYWdlU2l6ZSk7XG5cdFx0dGhpcy5wb3B1bGF0ZVJlc29sdmVkRXh0ZW5zaW9ucygwLCB0aGlzLnBhZ2VyLmZpcnN0UGFnZSk7XG5cdFx0dGhpcy5wYWdlcyA9IHJhbmdlKHRvdGFsUGFnZXMgLSAxKS5tYXAoKCkgPT4gKHtcblx0XHRcdHByb21pc2U6IG51bGwsXG5cdFx0XHRjdHM6IG51bGwsXG5cdFx0XHRwcm9taXNlSW5kZXhlczogbmV3IFNldDxudW1iZXI+KCksXG5cdFx0fSkpO1xuXHR9XG5cblx0aXNSZXNvbHZlZChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZWQuaGFzKGluZGV4KTtcblx0fVxuXG5cdGdldChpbmRleDogbnVtYmVyKTogSUV4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZWQuZ2V0KGluZGV4KSE7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKGluZGV4OiBudW1iZXIsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbj4ge1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNSZXNvbHZlZChpbmRleCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldChpbmRleCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXhJblBhZ2VkTW9kZWwgPSBpbmRleCAtIHRoaXMucHJlZmVycmVkRXh0ZW5zaW9ucy5sZW5ndGggKyB0aGlzLnJlc29sdmVkR2FsbGVyeUV4dGVuc2lvbnNGcm9tUXVlcnkubGVuZ3RoO1xuXHRcdGNvbnN0IHBhZ2VJbmRleCA9IE1hdGguZmxvb3IoaW5kZXhJblBhZ2VkTW9kZWwgLyB0aGlzLnBhZ2VyLnBhZ2VTaXplKTtcblx0XHQvLyBwYWdlcyBhcnJheSBleGNsdWRlcyBwYWdlIDAgKHByZS1yZXNvbHZlZCB2aWEgZmlyc3RQYWdlKSwgc28gYWRqdXN0IGluZGV4XG5cdFx0Y29uc3QgcGFnZSA9IHRoaXMucGFnZXNbcGFnZUluZGV4IC0gMV07XG5cblx0XHRpZiAoIXBhZ2UucHJvbWlzZSkge1xuXHRcdFx0cGFnZS5jdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHBhZ2UucHJvbWlzZSA9IHRoaXMucGFnZXIuZ2V0UGFnZShwYWdlSW5kZXgsIHBhZ2UuY3RzLnRva2VuKVxuXHRcdFx0XHQudGhlbihleHRlbnNpb25zID0+IHRoaXMucG9wdWxhdGVSZXNvbHZlZEV4dGVuc2lvbnMocGFnZUluZGV4LCBleHRlbnNpb25zKSlcblx0XHRcdFx0LmNhdGNoKGUgPT4geyBwYWdlLnByb21pc2UgPSBudWxsOyB0aHJvdyBlOyB9KVxuXHRcdFx0XHQuZmluYWxseSgoKSA9PiBwYWdlLmN0cyA9IG51bGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0aWYgKCFwYWdlLmN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwYWdlLnByb21pc2VJbmRleGVzLmRlbGV0ZShpbmRleCk7XG5cdFx0XHRpZiAocGFnZS5wcm9taXNlSW5kZXhlcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHBhZ2UuY3RzLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cGFnZS5wcm9taXNlSW5kZXhlcy5hZGQoaW5kZXgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHBhZ2UucHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldChpbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIHBvcHVsYXRlUmVzb2x2ZWRFeHRlbnNpb25zKHBhZ2VJbmRleDogbnVtYmVyLCBleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkIHtcblx0XHRsZXQgYWRqdXN0SW5kZXhPZk5leHRQYWdlc0J5ID0gMDtcblx0XHRjb25zdCBwYWdlU3RhcnRJbmRleCA9IHBhZ2VJbmRleCAqIHRoaXMucGFnZXIucGFnZVNpemU7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHRlbnNpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlID0gZXh0ZW5zaW9uc1tpXTtcblx0XHRcdGlmIChlLmdhbGxlcnk/LmlkZW50aWZpZXIudXVpZCAmJiB0aGlzLnByZWZlcnJlZEdhbGxlcnlFeHRlbnNpb25zLmhhcyhlLmdhbGxlcnkuaWRlbnRpZmllci51dWlkKSkge1xuXHRcdFx0XHR0aGlzLnJlc29sdmVkR2FsbGVyeUV4dGVuc2lvbnNGcm9tUXVlcnkucHVzaChlKTtcblx0XHRcdFx0YWRqdXN0SW5kZXhPZk5leHRQYWdlc0J5Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlc29sdmVkLnNldCh0aGlzLnByZWZlcnJlZEV4dGVuc2lvbnMubGVuZ3RoIC0gdGhpcy5yZXNvbHZlZEdhbGxlcnlFeHRlbnNpb25zRnJvbVF1ZXJ5Lmxlbmd0aCArIHBhZ2VTdGFydEluZGV4ICsgaSwgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIElmIHRoaXMgcGFnZSBoYXMgcHJlZmVycmVkIGdhbGxlcnkgZXh0ZW5zaW9ucywgdGhlbiBhZGp1c3QgdGhlIGluZGV4IG9mIHRoZSBuZXh0IHBhZ2VzXG5cdFx0Ly8gYnkgdGhlIG51bWJlciBvZiBwcmVmZXJyZWQgZ2FsbGVyeSBleHRlbnNpb25zIGZvdW5kIGluIHRoaXMgcGFnZS4gQmVjYXVzZSB0aGVzZSBwcmVmZXJyZWQgZXh0ZW5zaW9uc1xuXHRcdC8vIGFyZSBhbHJlYWR5IGluIHRoZSByZXNvbHZlZCBsaXN0IGFuZCBzaW5jZSB3ZSBkaWQgbm90IGFkZCB0aGVtIG5vdywgd2UgbmVlZCB0byBhZGp1c3QgdGhlIGluZGljZXMgb2YgdGhlIG5leHQgcGFnZXMuXG5cdFx0Ly8gU2tpcCBmaXJzdCBwYWdlIGFzIHRoZSBwcmVmZXJyZWQgZXh0ZW5zaW9ucyBhcmUgYWx3YXlzIGluIHRoZSBmaXJzdCBwYWdlXG5cdFx0aWYgKHBhZ2VJbmRleCAhPT0gMCAmJiBhZGp1c3RJbmRleE9mTmV4dFBhZ2VzQnkpIHtcblx0XHRcdGNvbnN0IG5leHRQYWdlU3RhcnRJbmRleCA9IChwYWdlSW5kZXggKyAxKSAqIHRoaXMucGFnZXIucGFnZVNpemU7XG5cdFx0XHRjb25zdCBpbmRpY2VzID0gWy4uLnRoaXMucmVzb2x2ZWQua2V5cygpXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGluZGljZXMpIHtcblx0XHRcdFx0aWYgKGluZGV4ID49IG5leHRQYWdlU3RhcnRJbmRleCkge1xuXHRcdFx0XHRcdGNvbnN0IGUgPSB0aGlzLnJlc29sdmVkLmdldChpbmRleCk7XG5cdFx0XHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVzb2x2ZWQuZGVsZXRlKGluZGV4KTtcblx0XHRcdFx0XHRcdHRoaXMucmVzb2x2ZWQuc2V0KGluZGV4IC0gYWRqdXN0SW5kZXhPZk5leHRQYWdlc0J5LCBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxxQkFBcUIsaUJBQWlCLHlCQUF5QjtBQUN4RSxTQUFTLFlBQXlCLHlCQUFpQztBQUNuRSxTQUFTLFdBQWtELFVBQVUsZUFBcUMsMkJBQTJCLDZCQUE2QjtBQUNsSyxTQUFxQyxtQ0FBbUMsaUJBQWlCLHNDQUFzQyw0Q0FBNEM7QUFDM0ssU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxtQkFBbUIsZ0NBQWdDO0FBQzVELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsUUFBUSxTQUFTO0FBQzFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCLGdCQUFrRCxtQ0FBd0U7QUFDaEssU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CLG1CQUFtQjtBQUMvQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLDZCQUE2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SyxvQkFBb0IsU0FBUyxLQUFLLG1DQUFtQyxTQUFTLGlCQUFpQixHQUFHLENBQUM7QUFBQSxNQUMzSDtBQUFBLElBQ0Q7QUFLQSxRQUFJLGNBQWMsS0FBSywwQkFBMEI7QUFDaEQsWUFBTSxzQkFBc0IsWUFBWSxLQUFLLEtBQUssTUFBTTtBQUN4RCxZQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssU0FBUyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQztBQUM5RCxpQkFBVyxTQUFTLFNBQVM7QUFDNUIsWUFBSSxTQUFTLG9CQUFvQjtBQUNoQyxnQkFBTSxJQUFJLEtBQUssU0FBUyxJQUFJLEtBQUs7QUFDakMsY0FBSSxHQUFHO0FBQ04saUJBQUssU0FBUyxPQUFPLEtBQUs7QUFDMUIsaUJBQUssU0FBUyxJQUFJLFFBQVEsMEJBQTBCLENBQUM7QUFBQSxVQUN0RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiTG9jYWxTb3J0QnkiLCAibW9kZWwiLCAicmVzdWx0IiwgImxvY2FsIiwgImV4dGVuc2lvbiJdCn0K
