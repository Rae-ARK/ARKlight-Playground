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
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { Extensions, ResolvableTreeItem, NoTreeViewError } from "../../common/views.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { distinct } from "../../../base/common/arrays.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { isUndefinedOrNull, isNumber } from "../../../base/common/types.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { createStringDataTransferItem, UriList, VSDataTransfer } from "../../../base/common/dataTransfer.js";
import { Mimes } from "../../../base/common/mime.js";
import { URI } from "../../../base/common/uri.js";
import { DataTransferFileCache } from "../common/shared/dataTransferCache.js";
import * as typeConvert from "../common/extHostTypeConverters.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
let MainThreadTreeViews = class extends Disposable {
  constructor(extHostContext, viewsService, notificationService, extensionService, logService, telemetryService) {
    super();
    this.viewsService = viewsService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this._dataProviders = this._register(new DisposableMap());
    this._dndControllers = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTreeViews);
  }
  async $registerTreeViewDataProvider(treeViewId, options) {
    this.logService.trace("MainThreadTreeViews#$registerTreeViewDataProvider", treeViewId, options);
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      const dataProvider = new TreeViewDataProvider(treeViewId, this._proxy, this.notificationService);
      const disposables = new DisposableStore();
      this._dataProviders.set(treeViewId, { dataProvider, dispose: () => disposables.dispose() });
      const dndController = options.hasHandleDrag || options.hasHandleDrop ? new TreeViewDragAndDropController(treeViewId, options.dropMimeTypes, options.dragMimeTypes, options.hasHandleDrag, this._proxy) : void 0;
      const viewer = this.getTreeView(treeViewId);
      if (viewer) {
        viewer.showCollapseAllAction = options.showCollapseAll;
        viewer.canSelectMany = options.canSelectMany;
        viewer.manuallyManageCheckboxes = options.manuallyManageCheckboxes;
        viewer.dragAndDropController = dndController;
        if (dndController) {
          this._dndControllers.set(treeViewId, dndController);
        }
        viewer.dataProvider = dataProvider;
        this.registerListeners(treeViewId, viewer, disposables);
        this._proxy.$setVisible(treeViewId, viewer.visible);
      } else {
        this.notificationService.error("No view is registered with id: " + treeViewId);
      }
    });
  }
  $reveal(treeViewId, itemInfo, options) {
    this.logService.trace("MainThreadTreeViews#$reveal", treeViewId, itemInfo?.item, itemInfo?.parentChain, options);
    return this.viewsService.openView(treeViewId, options.focus).then(() => {
      const viewer = this.getTreeView(treeViewId);
      if (viewer && itemInfo) {
        return this.reveal(viewer, this._dataProviders.get(treeViewId).dataProvider, itemInfo.item, itemInfo.parentChain, options);
      }
      return void 0;
    });
  }
  $refresh(treeViewId, itemsToRefreshByHandle) {
    this.logService.trace("MainThreadTreeViews#$refresh", treeViewId, itemsToRefreshByHandle);
    const viewer = this.getTreeView(treeViewId);
    const dataProvider = this._dataProviders.get(treeViewId);
    if (viewer && dataProvider) {
      const itemsToRefresh = dataProvider.dataProvider.getItemsToRefresh(itemsToRefreshByHandle);
      return viewer.refresh(itemsToRefresh.items.length ? itemsToRefresh.items : void 0, itemsToRefresh.checkboxes.length ? itemsToRefresh.checkboxes : void 0);
    }
    return Promise.resolve();
  }
  $setMessage(treeViewId, message) {
    this.logService.trace("MainThreadTreeViews#$setMessage", treeViewId, message.toString());
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.message = message;
    }
  }
  $setTitle(treeViewId, title, description) {
    this.logService.trace("MainThreadTreeViews#$setTitle", treeViewId, title, description);
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.title = title;
      viewer.description = description;
    }
  }
  $setBadge(treeViewId, badge) {
    this.logService.trace("MainThreadTreeViews#$setBadge", treeViewId, badge?.value, badge?.tooltip);
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.badge = badge;
    }
  }
  $resolveDropFileData(destinationViewId, requestId, dataItemId) {
    const controller = this._dndControllers.get(destinationViewId);
    if (!controller) {
      throw new Error("Unknown tree");
    }
    return controller.resolveDropFileData(requestId, dataItemId);
  }
  async $disposeTree(treeViewId) {
    const viewer = this.getTreeView(treeViewId);
    if (viewer) {
      viewer.dataProvider = void 0;
    }
    this._dataProviders.deleteAndDispose(treeViewId);
  }
  $logResolveTreeNodeFailure(extensionId) {
    this.telemetryService.publicLog2("treeView.resolveFailure", {
      extensionId
    });
  }
  async reveal(treeView, dataProvider, itemIn, parentChain, options) {
    options = options ? options : { select: false, focus: false };
    const select = isUndefinedOrNull(options.select) ? false : options.select;
    const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
    let expand = Math.min(isNumber(options.expand) ? options.expand : options.expand === true ? 1 : 0, 3);
    if (dataProvider.isEmpty()) {
      await treeView.refresh();
    }
    for (const parent of parentChain) {
      const parentItem = dataProvider.getItem(parent.handle);
      if (parentItem) {
        await treeView.expand(parentItem);
      }
    }
    const item = dataProvider.getItem(itemIn.handle);
    if (item) {
      await treeView.reveal(item);
      if (select) {
        treeView.setSelection([item]);
      }
      if (focus === false) {
        treeView.setFocus();
      } else if (focus) {
        treeView.setFocus(item);
      }
      let itemsToExpand = [item];
      for (; itemsToExpand.length > 0 && expand > 0; expand--) {
        await treeView.expand(itemsToExpand);
        itemsToExpand = itemsToExpand.reduce((result, itemValue) => {
          const item2 = dataProvider.getItem(itemValue.handle);
          if (item2 && item2.children && item2.children.length) {
            result.push(...item2.children);
          }
          return result;
        }, []);
      }
    }
  }
  registerListeners(treeViewId, treeView, disposables) {
    disposables.add(treeView.onDidExpandItem((item) => this._proxy.$setExpanded(treeViewId, item.handle, true)));
    disposables.add(treeView.onDidCollapseItem((item) => this._proxy.$setExpanded(treeViewId, item.handle, false)));
    disposables.add(treeView.onDidChangeSelectionAndFocus((items) => this._proxy.$setSelectionAndFocus(treeViewId, items.selection.map(({ handle }) => handle), items.focus.handle)));
    disposables.add(treeView.onDidChangeVisibility((isVisible) => this._proxy.$setVisible(treeViewId, isVisible)));
    disposables.add(treeView.onDidChangeCheckboxState((items) => {
      this._proxy.$changeCheckboxState(treeViewId, items.map((item) => {
        return { treeItemHandle: item.handle, newState: item.checkbox?.isChecked ?? false };
      }));
    }));
  }
  getTreeView(treeViewId) {
    const viewDescriptor = Registry.as(Extensions.ViewsRegistry).getView(treeViewId);
    return viewDescriptor ? viewDescriptor.treeView : null;
  }
  dispose() {
    for (const dataprovider of this._dataProviders) {
      const treeView = this.getTreeView(dataprovider[0]);
      if (treeView) {
        treeView.dataProvider = void 0;
      }
    }
    this._dataProviders.dispose();
    this._dndControllers.clear();
    super.dispose();
  }
};
MainThreadTreeViews = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTreeViews),
  __decorateParam(1, IViewsService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ITelemetryService)
], MainThreadTreeViews);
class TreeViewDragAndDropController {
  constructor(treeViewId, dropMimeTypes, dragMimeTypes, hasWillDrop, _proxy) {
    this.treeViewId = treeViewId;
    this.dropMimeTypes = dropMimeTypes;
    this.dragMimeTypes = dragMimeTypes;
    this.hasWillDrop = hasWillDrop;
    this._proxy = _proxy;
    this.dataTransfersCache = new DataTransferFileCache();
  }
  async handleDrop(dataTransfer, targetTreeItem, token, operationUuid, sourceTreeId, sourceTreeItemHandles) {
    const request = this.dataTransfersCache.add(dataTransfer);
    try {
      const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
      if (token.isCancellationRequested) {
        return;
      }
      return await this._proxy.$handleDrop(this.treeViewId, request.id, dataTransferDto, targetTreeItem?.handle, token, operationUuid, sourceTreeId, sourceTreeItemHandles);
    } finally {
      request.dispose();
    }
  }
  async handleDrag(sourceTreeItemHandles, operationUuid, token) {
    if (!this.hasWillDrop) {
      return;
    }
    const additionalDataTransferDTO = await this._proxy.$handleDrag(this.treeViewId, sourceTreeItemHandles, operationUuid, token);
    if (!additionalDataTransferDTO) {
      return;
    }
    const additionalDataTransfer = new VSDataTransfer();
    additionalDataTransferDTO.items.forEach(([type, item]) => {
      const value = type === Mimes.uriList && item.uriListData ? UriList.create(item.uriListData.map((part) => typeof part === "string" ? part : URI.revive(part))) : item.asString;
      additionalDataTransfer.replace(type, createStringDataTransferItem(value));
    });
    return additionalDataTransfer;
  }
  resolveDropFileData(requestId, dataItemId) {
    return this.dataTransfersCache.resolveFileData(requestId, dataItemId);
  }
}
class TreeViewDataProvider {
  constructor(treeViewId, _proxy, notificationService) {
    this.treeViewId = treeViewId;
    this._proxy = _proxy;
    this.notificationService = notificationService;
    this.itemsMap = /* @__PURE__ */ new Map();
    this.hasResolve = this._proxy.$hasResolve(this.treeViewId);
  }
  async getChildren(treeItem) {
    const batches = await this.getChildrenBatch(treeItem ? [treeItem] : void 0);
    return batches?.[0];
  }
  getChildrenBatch(treeItems) {
    if (!treeItems) {
      this.itemsMap.clear();
    }
    return this._proxy.$getChildren(this.treeViewId, treeItems ? treeItems.map((item) => item.handle) : void 0).then(
      (children) => {
        const convertedChildren = this.convertTransferChildren(treeItems ?? [], children);
        return this.postGetChildren(convertedChildren);
      },
      (err) => {
        if (!NoTreeViewError.is(err)) {
          this.notificationService.error(err);
        }
        return [];
      }
    );
  }
  convertTransferChildren(parents, children) {
    const convertedChildren = Array(parents.length);
    if (children) {
      for (const childGroup of children) {
        const childGroupIndex = childGroup[0];
        convertedChildren[childGroupIndex] = childGroup.slice(1);
      }
    }
    return convertedChildren;
  }
  getItemsToRefresh(itemsToRefreshByHandle) {
    const itemsToRefresh = [];
    const checkboxesToRefresh = [];
    if (itemsToRefreshByHandle) {
      for (const newTreeItemHandle of Object.keys(itemsToRefreshByHandle)) {
        const currentTreeItem = this.getItem(newTreeItemHandle);
        if (currentTreeItem) {
          const newTreeItem = itemsToRefreshByHandle[newTreeItemHandle];
          if (currentTreeItem.checkbox?.isChecked !== newTreeItem.checkbox?.isChecked) {
            checkboxesToRefresh.push(currentTreeItem);
          }
          this.updateTreeItem(currentTreeItem, newTreeItem);
          if (newTreeItemHandle === newTreeItem.handle) {
            itemsToRefresh.push(currentTreeItem);
          } else {
            this.itemsMap.delete(newTreeItemHandle);
            this.itemsMap.set(currentTreeItem.handle, currentTreeItem);
            const parent = newTreeItem.parentHandle ? this.itemsMap.get(newTreeItem.parentHandle) : null;
            if (parent) {
              itemsToRefresh.push(parent);
            }
          }
        }
      }
    }
    return { items: itemsToRefresh, checkboxes: checkboxesToRefresh };
  }
  getItem(treeItemHandle) {
    return this.itemsMap.get(treeItemHandle);
  }
  isEmpty() {
    return this.itemsMap.size === 0;
  }
  async postGetChildren(elementGroups) {
    if (elementGroups === void 0) {
      return void 0;
    }
    const resultGroups = [];
    const hasResolve = await this.hasResolve;
    if (elementGroups) {
      for (const elements of elementGroups) {
        const result = [];
        resultGroups.push(result);
        if (!elements) {
          continue;
        }
        for (const element of elements) {
          const resolvable = new ResolvableTreeItem(element, hasResolve ? (token) => {
            return this._proxy.$resolve(this.treeViewId, element.handle, token);
          } : void 0);
          this.itemsMap.set(element.handle, resolvable);
          result.push(resolvable);
        }
      }
    }
    return resultGroups;
  }
  updateTreeItem(current, treeItem) {
    treeItem.children = treeItem.children ? treeItem.children : void 0;
    if (current) {
      const properties = distinct([
        ...Object.keys(current instanceof ResolvableTreeItem ? current.asTreeItem() : current),
        ...Object.keys(treeItem)
      ]);
      for (const property of properties) {
        current[property] = treeItem[property];
      }
      if (current instanceof ResolvableTreeItem) {
        current.resetResolve();
      }
    }
  }
}
export {
  MainThreadTreeViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVHJlZVZpZXdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBNYWluVGhyZWFkVHJlZVZpZXdzU2hhcGUsIEV4dEhvc3RUcmVlVmlld3NTaGFwZSwgTWFpbkNvbnRleHQsIENoZWNrYm94VXBkYXRlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSVRyZWVJdGVtLCBJVHJlZVZpZXcsIElWaWV3c1JlZ2lzdHJ5LCBJVHJlZVZpZXdEZXNjcmlwdG9yLCBJUmV2ZWFsT3B0aW9ucywgRXh0ZW5zaW9ucywgUmVzb2x2YWJsZVRyZWVJdGVtLCBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIsIElWaWV3QmFkZ2UsIE5vVHJlZVZpZXdFcnJvciwgSVRyZWVWaWV3RGF0YVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwsIGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3RyaW5nRGF0YVRyYW5zZmVySXRlbSwgVXJpTGlzdCwgVlNEYXRhVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJGaWxlQ2FjaGUgfSBmcm9tICcuLi9jb21tb24vc2hhcmVkL2RhdGFUcmFuc2ZlckNhY2hlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkVHJlZVZpZXdzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRUcmVlVmlld3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZFRyZWVWaWV3c1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdFRyZWVWaWV3c1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhUHJvdmlkZXJzOiBEaXNwb3NhYmxlTWFwPHN0cmluZywgeyBkYXRhUHJvdmlkZXI6IFRyZWVWaWV3RGF0YVByb3ZpZGVyOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCB7IGRhdGFQcm92aWRlcjogVHJlZVZpZXdEYXRhUHJvdmlkZXI7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RuZENvbnRyb2xsZXJzID0gbmV3IE1hcDxzdHJpbmcsIFRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUcmVlVmlld3MpO1xuXHR9XG5cblx0YXN5bmMgJHJlZ2lzdGVyVHJlZVZpZXdEYXRhUHJvdmlkZXIodHJlZVZpZXdJZDogc3RyaW5nLCBvcHRpb25zOiB7IHNob3dDb2xsYXBzZUFsbDogYm9vbGVhbjsgY2FuU2VsZWN0TWFueTogYm9vbGVhbjsgZHJvcE1pbWVUeXBlczogc3RyaW5nW107IGRyYWdNaW1lVHlwZXM6IHN0cmluZ1tdOyBoYXNIYW5kbGVEcmFnOiBib29sZWFuOyBoYXNIYW5kbGVEcm9wOiBib29sZWFuOyBtYW51YWxseU1hbmFnZUNoZWNrYm94ZXM6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTWFpblRocmVhZFRyZWVWaWV3cyMkcmVnaXN0ZXJUcmVlVmlld0RhdGFQcm92aWRlcicsIHRyZWVWaWV3SWQsIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YVByb3ZpZGVyID0gbmV3IFRyZWVWaWV3RGF0YVByb3ZpZGVyKHRyZWVWaWV3SWQsIHRoaXMuX3Byb3h5LCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0aGlzLl9kYXRhUHJvdmlkZXJzLnNldCh0cmVlVmlld0lkLCB7IGRhdGFQcm92aWRlciwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpIH0pO1xuXHRcdFx0Y29uc3QgZG5kQ29udHJvbGxlciA9IChvcHRpb25zLmhhc0hhbmRsZURyYWcgfHwgb3B0aW9ucy5oYXNIYW5kbGVEcm9wKVxuXHRcdFx0XHQ/IG5ldyBUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlcih0cmVlVmlld0lkLCBvcHRpb25zLmRyb3BNaW1lVHlwZXMsIG9wdGlvbnMuZHJhZ01pbWVUeXBlcywgb3B0aW9ucy5oYXNIYW5kbGVEcmFnLCB0aGlzLl9wcm94eSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB2aWV3ZXIgPSB0aGlzLmdldFRyZWVWaWV3KHRyZWVWaWV3SWQpO1xuXHRcdFx0aWYgKHZpZXdlcikge1xuXHRcdFx0XHQvLyBPcmRlciBpcyBpbXBvcnRhbnQgaGVyZS4gVGhlIGludGVybmFsIHRyZWUgaXNuJ3QgY3JlYXRlZCB1bnRpbCB0aGUgZGF0YVByb3ZpZGVyIGlzIHNldC5cblx0XHRcdFx0Ly8gU2V0IGFsbCBvdGhlciBwcm9wZXJ0aWVzIGZpcnN0IVxuXHRcdFx0XHR2aWV3ZXIuc2hvd0NvbGxhcHNlQWxsQWN0aW9uID0gb3B0aW9ucy5zaG93Q29sbGFwc2VBbGw7XG5cdFx0XHRcdHZpZXdlci5jYW5TZWxlY3RNYW55ID0gb3B0aW9ucy5jYW5TZWxlY3RNYW55O1xuXHRcdFx0XHR2aWV3ZXIubWFudWFsbHlNYW5hZ2VDaGVja2JveGVzID0gb3B0aW9ucy5tYW51YWxseU1hbmFnZUNoZWNrYm94ZXM7XG5cdFx0XHRcdHZpZXdlci5kcmFnQW5kRHJvcENvbnRyb2xsZXIgPSBkbmRDb250cm9sbGVyO1xuXHRcdFx0XHRpZiAoZG5kQ29udHJvbGxlcikge1xuXHRcdFx0XHRcdHRoaXMuX2RuZENvbnRyb2xsZXJzLnNldCh0cmVlVmlld0lkLCBkbmRDb250cm9sbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2aWV3ZXIuZGF0YVByb3ZpZGVyID0gZGF0YVByb3ZpZGVyO1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKHRyZWVWaWV3SWQsIHZpZXdlciwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kc2V0VmlzaWJsZSh0cmVlVmlld0lkLCB2aWV3ZXIudmlzaWJsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoJ05vIHZpZXcgaXMgcmVnaXN0ZXJlZCB3aXRoIGlkOiAnICsgdHJlZVZpZXdJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQkcmV2ZWFsKHRyZWVWaWV3SWQ6IHN0cmluZywgaXRlbUluZm86IHsgaXRlbTogSVRyZWVJdGVtOyBwYXJlbnRDaGFpbjogSVRyZWVJdGVtW10gfSB8IHVuZGVmaW5lZCwgb3B0aW9uczogSVJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRUcmVlVmlld3MjJHJldmVhbCcsIHRyZWVWaWV3SWQsIGl0ZW1JbmZvPy5pdGVtLCBpdGVtSW5mbz8ucGFyZW50Q2hhaW4sIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KHRyZWVWaWV3SWQsIG9wdGlvbnMuZm9jdXMpXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0VHJlZVZpZXcodHJlZVZpZXdJZCk7XG5cdFx0XHRcdGlmICh2aWV3ZXIgJiYgaXRlbUluZm8pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZXZlYWwodmlld2VyLCB0aGlzLl9kYXRhUHJvdmlkZXJzLmdldCh0cmVlVmlld0lkKSEuZGF0YVByb3ZpZGVyLCBpdGVtSW5mby5pdGVtLCBpdGVtSW5mby5wYXJlbnRDaGFpbiwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHR9XG5cblx0JHJlZnJlc2godHJlZVZpZXdJZDogc3RyaW5nLCBpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlOiB7IFt0cmVlSXRlbUhhbmRsZTogc3RyaW5nXTogSVRyZWVJdGVtIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRUcmVlVmlld3MjJHJlZnJlc2gnLCB0cmVlVmlld0lkLCBpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlKTtcblxuXHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0VHJlZVZpZXcodHJlZVZpZXdJZCk7XG5cdFx0Y29uc3QgZGF0YVByb3ZpZGVyID0gdGhpcy5fZGF0YVByb3ZpZGVycy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKHZpZXdlciAmJiBkYXRhUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGl0ZW1zVG9SZWZyZXNoID0gZGF0YVByb3ZpZGVyLmRhdGFQcm92aWRlci5nZXRJdGVtc1RvUmVmcmVzaChpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlKTtcblx0XHRcdHJldHVybiB2aWV3ZXIucmVmcmVzaChpdGVtc1RvUmVmcmVzaC5pdGVtcy5sZW5ndGggPyBpdGVtc1RvUmVmcmVzaC5pdGVtcyA6IHVuZGVmaW5lZCwgaXRlbXNUb1JlZnJlc2guY2hlY2tib3hlcy5sZW5ndGggPyBpdGVtc1RvUmVmcmVzaC5jaGVja2JveGVzIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0JHNldE1lc3NhZ2UodHJlZVZpZXdJZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01haW5UaHJlYWRUcmVlVmlld3MjJHNldE1lc3NhZ2UnLCB0cmVlVmlld0lkLCBtZXNzYWdlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRUcmVlVmlldyh0cmVlVmlld0lkKTtcblx0XHRpZiAodmlld2VyKSB7XG5cdFx0XHR2aWV3ZXIubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0fVxuXHR9XG5cblx0JHNldFRpdGxlKHRyZWVWaWV3SWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTWFpblRocmVhZFRyZWVWaWV3cyMkc2V0VGl0bGUnLCB0cmVlVmlld0lkLCB0aXRsZSwgZGVzY3JpcHRpb24pO1xuXG5cdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRUcmVlVmlldyh0cmVlVmlld0lkKTtcblx0XHRpZiAodmlld2VyKSB7XG5cdFx0XHR2aWV3ZXIudGl0bGUgPSB0aXRsZTtcblx0XHRcdHZpZXdlci5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXHRcdH1cblx0fVxuXG5cdCRzZXRCYWRnZSh0cmVlVmlld0lkOiBzdHJpbmcsIGJhZGdlOiBJVmlld0JhZGdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkVHJlZVZpZXdzIyRzZXRCYWRnZScsIHRyZWVWaWV3SWQsIGJhZGdlPy52YWx1ZSwgYmFkZ2U/LnRvb2x0aXApO1xuXG5cdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRUcmVlVmlldyh0cmVlVmlld0lkKTtcblx0XHRpZiAodmlld2VyKSB7XG5cdFx0XHR2aWV3ZXIuYmFkZ2UgPSBiYWRnZTtcblx0XHR9XG5cdH1cblxuXHQkcmVzb2x2ZURyb3BGaWxlRGF0YShkZXN0aW5hdGlvblZpZXdJZDogc3RyaW5nLCByZXF1ZXN0SWQ6IG51bWJlciwgZGF0YUl0ZW1JZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9kbmRDb250cm9sbGVycy5nZXQoZGVzdGluYXRpb25WaWV3SWQpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHRyZWUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXIucmVzb2x2ZURyb3BGaWxlRGF0YShyZXF1ZXN0SWQsIGRhdGFJdGVtSWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRkaXNwb3NlVHJlZSh0cmVlVmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3ZXIgPSB0aGlzLmdldFRyZWVWaWV3KHRyZWVWaWV3SWQpO1xuXHRcdGlmICh2aWV3ZXIpIHtcblx0XHRcdHZpZXdlci5kYXRhUHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGF0YVByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKHRyZWVWaWV3SWQpO1xuXHR9XG5cblx0JGxvZ1Jlc29sdmVUcmVlTm9kZUZhaWx1cmUoZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHR5cGUgVHJlZVZpZXdSZXNvbHZlRmFpbHVyZUV2ZW50ID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHR9O1xuXHRcdHR5cGUgVHJlZVZpZXdSZXNvbHZlRmFpbHVyZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIGlkZW50aWZpZXIuJyB9O1xuXHRcdFx0b3duZXI6ICdhbGV4cjAwJztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgdHJlZSB2aWV3IHJlc29sdmUgZmFpbHVyZXMgZHVlIHRvIGNvbmN1cnJlbnQgcmVmcmVzaCByYWNlcy4nO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VHJlZVZpZXdSZXNvbHZlRmFpbHVyZUV2ZW50LCBUcmVlVmlld1Jlc29sdmVGYWlsdXJlQ2xhc3NpZmljYXRpb24+KCd0cmVlVmlldy5yZXNvbHZlRmFpbHVyZScsIHtcblx0XHRcdGV4dGVuc2lvbklkXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbCh0cmVlVmlldzogSVRyZWVWaWV3LCBkYXRhUHJvdmlkZXI6IFRyZWVWaWV3RGF0YVByb3ZpZGVyLCBpdGVtSW46IElUcmVlSXRlbSwgcGFyZW50Q2hhaW46IElUcmVlSXRlbVtdLCBvcHRpb25zOiBJUmV2ZWFsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zID8gb3B0aW9ucyA6IHsgc2VsZWN0OiBmYWxzZSwgZm9jdXM6IGZhbHNlIH07XG5cdFx0Y29uc3Qgc2VsZWN0ID0gaXNVbmRlZmluZWRPck51bGwob3B0aW9ucy5zZWxlY3QpID8gZmFsc2UgOiBvcHRpb25zLnNlbGVjdDtcblx0XHRjb25zdCBmb2N1cyA9IGlzVW5kZWZpbmVkT3JOdWxsKG9wdGlvbnMuZm9jdXMpID8gZmFsc2UgOiBvcHRpb25zLmZvY3VzO1xuXHRcdGxldCBleHBhbmQgPSBNYXRoLm1pbihpc051bWJlcihvcHRpb25zLmV4cGFuZCkgPyBvcHRpb25zLmV4cGFuZCA6IG9wdGlvbnMuZXhwYW5kID09PSB0cnVlID8gMSA6IDAsIDMpO1xuXG5cdFx0aWYgKGRhdGFQcm92aWRlci5pc0VtcHR5KCkpIHtcblx0XHRcdC8vIFJlZnJlc2ggaWYgZW1wdHlcblx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJlbnQgb2YgcGFyZW50Q2hhaW4pIHtcblx0XHRcdGNvbnN0IHBhcmVudEl0ZW0gPSBkYXRhUHJvdmlkZXIuZ2V0SXRlbShwYXJlbnQuaGFuZGxlKTtcblx0XHRcdGlmIChwYXJlbnRJdGVtKSB7XG5cdFx0XHRcdGF3YWl0IHRyZWVWaWV3LmV4cGFuZChwYXJlbnRJdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgaXRlbSA9IGRhdGFQcm92aWRlci5nZXRJdGVtKGl0ZW1Jbi5oYW5kbGUpO1xuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHRhd2FpdCB0cmVlVmlldy5yZXZlYWwoaXRlbSk7XG5cdFx0XHRpZiAoc2VsZWN0KSB7XG5cdFx0XHRcdHRyZWVWaWV3LnNldFNlbGVjdGlvbihbaXRlbV0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZvY3VzID09PSBmYWxzZSkge1xuXHRcdFx0XHR0cmVlVmlldy5zZXRGb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChmb2N1cykge1xuXHRcdFx0XHR0cmVlVmlldy5zZXRGb2N1cyhpdGVtKTtcblx0XHRcdH1cblx0XHRcdGxldCBpdGVtc1RvRXhwYW5kID0gW2l0ZW1dO1xuXHRcdFx0Zm9yICg7IGl0ZW1zVG9FeHBhbmQubGVuZ3RoID4gMCAmJiBleHBhbmQgPiAwOyBleHBhbmQtLSkge1xuXHRcdFx0XHRhd2FpdCB0cmVlVmlldy5leHBhbmQoaXRlbXNUb0V4cGFuZCk7XG5cdFx0XHRcdGl0ZW1zVG9FeHBhbmQgPSBpdGVtc1RvRXhwYW5kLnJlZHVjZSgocmVzdWx0LCBpdGVtVmFsdWUpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gZGF0YVByb3ZpZGVyLmdldEl0ZW0oaXRlbVZhbHVlLmhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS5jaGlsZHJlbiAmJiBpdGVtLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goLi4uaXRlbS5jaGlsZHJlbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0sIFtdIGFzIElUcmVlSXRlbVtdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKHRyZWVWaWV3SWQ6IHN0cmluZywgdHJlZVZpZXc6IElUcmVlVmlldywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlVmlldy5vbkRpZEV4cGFuZEl0ZW0oaXRlbSA9PiB0aGlzLl9wcm94eS4kc2V0RXhwYW5kZWQodHJlZVZpZXdJZCwgaXRlbS5oYW5kbGUsIHRydWUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyZWVWaWV3Lm9uRGlkQ29sbGFwc2VJdGVtKGl0ZW0gPT4gdGhpcy5fcHJveHkuJHNldEV4cGFuZGVkKHRyZWVWaWV3SWQsIGl0ZW0uaGFuZGxlLCBmYWxzZSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJlZVZpZXcub25EaWRDaGFuZ2VTZWxlY3Rpb25BbmRGb2N1cyhpdGVtcyA9PiB0aGlzLl9wcm94eS4kc2V0U2VsZWN0aW9uQW5kRm9jdXModHJlZVZpZXdJZCwgaXRlbXMuc2VsZWN0aW9uLm1hcCgoeyBoYW5kbGUgfSkgPT4gaGFuZGxlKSwgaXRlbXMuZm9jdXMuaGFuZGxlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmVlVmlldy5vbkRpZENoYW5nZVZpc2liaWxpdHkoaXNWaXNpYmxlID0+IHRoaXMuX3Byb3h5LiRzZXRWaXNpYmxlKHRyZWVWaWV3SWQsIGlzVmlzaWJsZSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJlZVZpZXcub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKGl0ZW1zID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRjaGFuZ2VDaGVja2JveFN0YXRlKHRyZWVWaWV3SWQsIDxDaGVja2JveFVwZGF0ZVtdPml0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0cmV0dXJuIHsgdHJlZUl0ZW1IYW5kbGU6IGl0ZW0uaGFuZGxlLCBuZXdTdGF0ZTogaXRlbS5jaGVja2JveD8uaXNDaGVja2VkID8/IGZhbHNlIH07XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlVmlldyh0cmVlVmlld0lkOiBzdHJpbmcpOiBJVHJlZVZpZXcgfCBudWxsIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVRyZWVWaWV3RGVzY3JpcHRvciA9IDxJVHJlZVZpZXdEZXNjcmlwdG9yPlJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLmdldFZpZXcodHJlZVZpZXdJZCk7XG5cdFx0cmV0dXJuIHZpZXdEZXNjcmlwdG9yID8gdmlld0Rlc2NyaXB0b3IudHJlZVZpZXcgOiBudWxsO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGRhdGFwcm92aWRlciBvZiB0aGlzLl9kYXRhUHJvdmlkZXJzKSB7XG5cdFx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuZ2V0VHJlZVZpZXcoZGF0YXByb3ZpZGVyWzBdKTtcblx0XHRcdGlmICh0cmVlVmlldykge1xuXHRcdFx0XHR0cmVlVmlldy5kYXRhUHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2RhdGFQcm92aWRlcnMuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlcnMuY2xlYXIoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG50eXBlIFRyZWVJdGVtSGFuZGxlID0gc3RyaW5nO1xuXG5jbGFzcyBUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciBpbXBsZW1lbnRzIElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkYXRhVHJhbnNmZXJzQ2FjaGUgPSBuZXcgRGF0YVRyYW5zZmVyRmlsZUNhY2hlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0cmVlVmlld0lkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZHJvcE1pbWVUeXBlczogc3RyaW5nW10sXG5cdFx0cmVhZG9ubHkgZHJhZ01pbWVUeXBlczogc3RyaW5nW10sXG5cdFx0cmVhZG9ubHkgaGFzV2lsbERyb3A6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUcmVlVmlld3NTaGFwZSkgeyB9XG5cblx0YXN5bmMgaGFuZGxlRHJvcChkYXRhVHJhbnNmZXI6IFZTRGF0YVRyYW5zZmVyLCB0YXJnZXRUcmVlSXRlbTogSVRyZWVJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0b3BlcmF0aW9uVXVpZD86IHN0cmluZywgc291cmNlVHJlZUlkPzogc3RyaW5nLCBzb3VyY2VUcmVlSXRlbUhhbmRsZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLmRhdGFUcmFuc2ZlcnNDYWNoZS5hZGQoZGF0YVRyYW5zZmVyKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YVRyYW5zZmVyRHRvID0gYXdhaXQgdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVyLmZyb21MaXN0KGRhdGFUcmFuc2Zlcik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVEcm9wKHRoaXMudHJlZVZpZXdJZCwgcmVxdWVzdC5pZCwgZGF0YVRyYW5zZmVyRHRvLCB0YXJnZXRUcmVlSXRlbT8uaGFuZGxlLCB0b2tlbiwgb3BlcmF0aW9uVXVpZCwgc291cmNlVHJlZUlkLCBzb3VyY2VUcmVlSXRlbUhhbmRsZXMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXF1ZXN0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBoYW5kbGVEcmFnKHNvdXJjZVRyZWVJdGVtSGFuZGxlczogc3RyaW5nW10sIG9wZXJhdGlvblV1aWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0RhdGFUcmFuc2ZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5oYXNXaWxsRHJvcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyRFRPID0gYXdhaXQgdGhpcy5fcHJveHkuJGhhbmRsZURyYWcodGhpcy50cmVlVmlld0lkLCBzb3VyY2VUcmVlSXRlbUhhbmRsZXMsIG9wZXJhdGlvblV1aWQsIHRva2VuKTtcblx0XHRpZiAoIWFkZGl0aW9uYWxEYXRhVHJhbnNmZXJEVE8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyID0gbmV3IFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0YWRkaXRpb25hbERhdGFUcmFuc2ZlckRUTy5pdGVtcy5mb3JFYWNoKChbdHlwZSwgaXRlbV0pID0+IHtcblx0XHRcdC8vIEZvciB0ZXh0L3VyaS1saXN0LCByZWNvbnN0cnVjdCBmcm9tIHVyaUxpc3REYXRhIHdoaWNoIGhhcyBiZWVuIHRyYW5zZm9ybWVkIGJ5IHRoZSBVUkkgdHJhbnNmb3JtZXJcblx0XHRcdGNvbnN0IHZhbHVlID0gdHlwZSA9PT0gTWltZXMudXJpTGlzdCAmJiBpdGVtLnVyaUxpc3REYXRhXG5cdFx0XHRcdD8gVXJpTGlzdC5jcmVhdGUoaXRlbS51cmlMaXN0RGF0YS5tYXAocGFydCA9PiB0eXBlb2YgcGFydCA9PT0gJ3N0cmluZycgPyBwYXJ0IDogVVJJLnJldml2ZShwYXJ0KSkpXG5cdFx0XHRcdDogaXRlbS5hc1N0cmluZztcblx0XHRcdGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIucmVwbGFjZSh0eXBlLCBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtKHZhbHVlKSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGFkZGl0aW9uYWxEYXRhVHJhbnNmZXI7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZURyb3BGaWxlRGF0YShyZXF1ZXN0SWQ6IG51bWJlciwgZGF0YUl0ZW1JZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiB0aGlzLmRhdGFUcmFuc2ZlcnNDYWNoZS5yZXNvbHZlRmlsZURhdGEocmVxdWVzdElkLCBkYXRhSXRlbUlkKTtcblx0fVxufVxuXG5jbGFzcyBUcmVlVmlld0RhdGFQcm92aWRlciBpbXBsZW1lbnRzIElUcmVlVmlld0RhdGFQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpdGVtc01hcDogTWFwPFRyZWVJdGVtSGFuZGxlLCBJVHJlZUl0ZW0+ID0gbmV3IE1hcDxUcmVlSXRlbUhhbmRsZSwgSVRyZWVJdGVtPigpO1xuXHRwcml2YXRlIGhhc1Jlc29sdmU6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0cmVlVmlld0lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUcmVlVmlld3NTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuaGFzUmVzb2x2ZSA9IHRoaXMuX3Byb3h5LiRoYXNSZXNvbHZlKHRoaXMudHJlZVZpZXdJZCk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbih0cmVlSXRlbT86IElUcmVlSXRlbSk6IFByb21pc2U8cmVhZG9ubHkgSVRyZWVJdGVtW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBiYXRjaGVzID0gYXdhaXQgdGhpcy5nZXRDaGlsZHJlbkJhdGNoKHRyZWVJdGVtID8gW3RyZWVJdGVtXSA6IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGJhdGNoZXM/LlswXTtcblx0fVxuXG5cdGdldENoaWxkcmVuQmF0Y2godHJlZUl0ZW1zPzogSVRyZWVJdGVtW10pOiBQcm9taXNlPChyZWFkb25seSBJVHJlZUl0ZW1bXSlbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdHJlZUl0ZW1zKSB7XG5cdFx0XHR0aGlzLml0ZW1zTWFwLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kZ2V0Q2hpbGRyZW4odGhpcy50cmVlVmlld0lkLCB0cmVlSXRlbXMgPyB0cmVlSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5oYW5kbGUpIDogdW5kZWZpbmVkKVxuXHRcdFx0LnRoZW4oXG5cdFx0XHRcdGNoaWxkcmVuID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb252ZXJ0ZWRDaGlsZHJlbiA9IHRoaXMuY29udmVydFRyYW5zZmVyQ2hpbGRyZW4odHJlZUl0ZW1zID8/IFtdLCBjaGlsZHJlbik7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucG9zdEdldENoaWxkcmVuKGNvbnZlcnRlZENoaWxkcmVuKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyID0+IHtcblx0XHRcdFx0XHQvLyBJdCBjYW4gaGFwcGVuIHRoYXQgYSB0cmVlIHZpZXcgaXMgZGlzcG9zZWQgcmlnaHQgYXMgYGdldENoaWxkcmVuYCBpcyBjYWxsZWQuIFRoaXMgcmVzdWx0cyBpbiBhbiBlcnJvciBiZWNhdXNlIHRoZSBkYXRhIHByb3ZpZGVyIGdldHMgcmVtb3ZlZC5cblx0XHRcdFx0XHQvLyBUaGUgdHJlZSB3aWxsIHNob3J0bHkgZ2V0IGNsZWFuZWQgdXAgaW4gdGhpcyBjYXNlLiBXZSBqdXN0IG5lZWQgdG8gaGFuZGxlIHRoZSBlcnJvciBoZXJlLlxuXHRcdFx0XHRcdGlmICghTm9UcmVlVmlld0Vycm9yLmlzKGVycikpIHtcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0VHJhbnNmZXJDaGlsZHJlbihwYXJlbnRzOiBJVHJlZUl0ZW1bXSwgY2hpbGRyZW46IChyZWFkb25seSAobnVtYmVyIHwgSVRyZWVJdGVtKVtdKVtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY29udmVydGVkQ2hpbGRyZW46IChyZWFkb25seSBJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZClbXSA9IEFycmF5KHBhcmVudHMubGVuZ3RoKTtcblx0XHRpZiAoY2hpbGRyZW4pIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGRHcm91cCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBjaGlsZEdyb3VwSW5kZXggPSBjaGlsZEdyb3VwWzBdIGFzIG51bWJlcjtcblx0XHRcdFx0Y29udmVydGVkQ2hpbGRyZW5bY2hpbGRHcm91cEluZGV4XSA9IGNoaWxkR3JvdXAuc2xpY2UoMSkgYXMgcmVhZG9ubHkgSVRyZWVJdGVtW107XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb252ZXJ0ZWRDaGlsZHJlbjtcblx0fVxuXG5cdGdldEl0ZW1zVG9SZWZyZXNoKGl0ZW1zVG9SZWZyZXNoQnlIYW5kbGU6IHsgW3RyZWVJdGVtSGFuZGxlOiBzdHJpbmddOiBJVHJlZUl0ZW0gfSk6IHsgaXRlbXM6IElUcmVlSXRlbVtdOyBjaGVja2JveGVzOiBJVHJlZUl0ZW1bXSB9IHtcblx0XHRjb25zdCBpdGVtc1RvUmVmcmVzaDogSVRyZWVJdGVtW10gPSBbXTtcblx0XHRjb25zdCBjaGVja2JveGVzVG9SZWZyZXNoOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXHRcdGlmIChpdGVtc1RvUmVmcmVzaEJ5SGFuZGxlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG5ld1RyZWVJdGVtSGFuZGxlIG9mIE9iamVjdC5rZXlzKGl0ZW1zVG9SZWZyZXNoQnlIYW5kbGUpKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRUcmVlSXRlbSA9IHRoaXMuZ2V0SXRlbShuZXdUcmVlSXRlbUhhbmRsZSk7XG5cdFx0XHRcdGlmIChjdXJyZW50VHJlZUl0ZW0pIHsgLy8gUmVmcmVzaCBvbmx5IGlmIHRoZSBpdGVtIGV4aXN0c1xuXHRcdFx0XHRcdGNvbnN0IG5ld1RyZWVJdGVtID0gaXRlbXNUb1JlZnJlc2hCeUhhbmRsZVtuZXdUcmVlSXRlbUhhbmRsZV07XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRUcmVlSXRlbS5jaGVja2JveD8uaXNDaGVja2VkICE9PSBuZXdUcmVlSXRlbS5jaGVja2JveD8uaXNDaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRjaGVja2JveGVzVG9SZWZyZXNoLnB1c2goY3VycmVudFRyZWVJdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBjdXJyZW50IGl0ZW0gd2l0aCByZWZyZXNoZWQgaXRlbVxuXHRcdFx0XHRcdHRoaXMudXBkYXRlVHJlZUl0ZW0oY3VycmVudFRyZWVJdGVtLCBuZXdUcmVlSXRlbSk7XG5cdFx0XHRcdFx0aWYgKG5ld1RyZWVJdGVtSGFuZGxlID09PSBuZXdUcmVlSXRlbS5oYW5kbGUpIHtcblx0XHRcdFx0XHRcdGl0ZW1zVG9SZWZyZXNoLnB1c2goY3VycmVudFRyZWVJdGVtKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gVXBkYXRlIG1hcHMgd2hlbiBoYW5kbGUgaXMgY2hhbmdlZCBhbmQgcmVmcmVzaCBwYXJlbnRcblx0XHRcdFx0XHRcdHRoaXMuaXRlbXNNYXAuZGVsZXRlKG5ld1RyZWVJdGVtSGFuZGxlKTtcblx0XHRcdFx0XHRcdHRoaXMuaXRlbXNNYXAuc2V0KGN1cnJlbnRUcmVlSXRlbS5oYW5kbGUsIGN1cnJlbnRUcmVlSXRlbSk7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSBuZXdUcmVlSXRlbS5wYXJlbnRIYW5kbGUgPyB0aGlzLml0ZW1zTWFwLmdldChuZXdUcmVlSXRlbS5wYXJlbnRIYW5kbGUpIDogbnVsbDtcblx0XHRcdFx0XHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdFx0XHRcdFx0aXRlbXNUb1JlZnJlc2gucHVzaChwYXJlbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBpdGVtczogaXRlbXNUb1JlZnJlc2gsIGNoZWNrYm94ZXM6IGNoZWNrYm94ZXNUb1JlZnJlc2ggfTtcblx0fVxuXG5cdGdldEl0ZW0odHJlZUl0ZW1IYW5kbGU6IHN0cmluZyk6IElUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNNYXAuZ2V0KHRyZWVJdGVtSGFuZGxlKTtcblx0fVxuXG5cdGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNNYXAuc2l6ZSA9PT0gMDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcG9zdEdldENoaWxkcmVuKGVsZW1lbnRHcm91cHM6IChyZWFkb25seSBJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZClbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8UmVzb2x2YWJsZVRyZWVJdGVtW11bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChlbGVtZW50R3JvdXBzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdEdyb3VwczogUmVzb2x2YWJsZVRyZWVJdGVtW11bXSA9IFtdO1xuXHRcdGNvbnN0IGhhc1Jlc29sdmUgPSBhd2FpdCB0aGlzLmhhc1Jlc29sdmU7XG5cdFx0aWYgKGVsZW1lbnRHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudHMgb2YgZWxlbWVudEdyb3Vwcykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IFJlc29sdmFibGVUcmVlSXRlbVtdID0gW107XG5cdFx0XHRcdHJlc3VsdEdyb3Vwcy5wdXNoKHJlc3VsdCk7XG5cdFx0XHRcdGlmICghZWxlbWVudHMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZhYmxlID0gbmV3IFJlc29sdmFibGVUcmVlSXRlbShlbGVtZW50LCBoYXNSZXNvbHZlID8gKHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlc29sdmUodGhpcy50cmVlVmlld0lkLCBlbGVtZW50LmhhbmRsZSwgdG9rZW4pO1xuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuaXRlbXNNYXAuc2V0KGVsZW1lbnQuaGFuZGxlLCByZXNvbHZhYmxlKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChyZXNvbHZhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0R3JvdXBzO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUcmVlSXRlbShjdXJyZW50OiBJVHJlZUl0ZW0sIHRyZWVJdGVtOiBJVHJlZUl0ZW0pOiB2b2lkIHtcblx0XHR0cmVlSXRlbS5jaGlsZHJlbiA9IHRyZWVJdGVtLmNoaWxkcmVuID8gdHJlZUl0ZW0uY2hpbGRyZW4gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSBkaXN0aW5jdChbLi4uT2JqZWN0LmtleXMoY3VycmVudCBpbnN0YW5jZW9mIFJlc29sdmFibGVUcmVlSXRlbSA/IGN1cnJlbnQuYXNUcmVlSXRlbSgpIDogY3VycmVudCksXG5cdFx0XHQuLi5PYmplY3Qua2V5cyh0cmVlSXRlbSldKTtcblx0XHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgcHJvcGVydGllcykge1xuXHRcdFx0XHQoY3VycmVudCBhcyB1bmtub3duIGFzIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9KVtwcm9wZXJ0eV0gPSAodHJlZUl0ZW0gYXMgdW5rbm93biBhcyB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSlbcHJvcGVydHldO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnQgaW5zdGFuY2VvZiBSZXNvbHZhYmxlVHJlZUl0ZW0pIHtcblx0XHRcdFx0Y3VycmVudC5yZXNldFJlc29sdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGVBQWUsdUJBQXVCO0FBQzNELFNBQVMsZ0JBQWlFLG1CQUFtQztBQUM3RyxTQUFvRixZQUFZLG9CQUFnRSx1QkFBOEM7QUFDOU0sU0FBUyw0QkFBNkM7QUFDdEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBbUIsZ0JBQWdCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsOEJBQThCLFNBQVMsc0JBQXNCO0FBQ3RFLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFFcEIsU0FBUyw2QkFBNkI7QUFDdEMsWUFBWSxpQkFBaUI7QUFFN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFHM0IsSUFBTSxzQkFBTixjQUFrQyxXQUErQztBQUFBLEVBTXZGLFlBQ0MsZ0JBQ2dDLGNBQ08scUJBQ0gsa0JBQ04sWUFDTSxrQkFDbkM7QUFDRCxVQUFNO0FBTjBCO0FBQ087QUFDSDtBQUNOO0FBQ007QUFUckMsU0FBaUIsaUJBQXFHLEtBQUssVUFBVSxJQUFJLGNBQW1GLENBQUM7QUFDN04sU0FBaUIsa0JBQWtCLG9CQUFJLElBQTJDO0FBV2pGLFNBQUssU0FBUyxlQUFlLFNBQVMsZUFBZSxnQkFBZ0I7QUFBQSxFQUN0RTtBQUFBLEVBRUEsTUFBTSw4QkFBOEIsWUFBb0IsU0FBbU47QUFDMVEsU0FBSyxXQUFXLE1BQU0scURBQXFELFlBQVksT0FBTztBQUU5RixTQUFLLGlCQUFpQixrQ0FBa0MsRUFBRSxLQUFLLE1BQU07QUFDcEUsWUFBTSxlQUFlLElBQUkscUJBQXFCLFlBQVksS0FBSyxRQUFRLEtBQUssbUJBQW1CO0FBQy9GLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxXQUFLLGVBQWUsSUFBSSxZQUFZLEVBQUUsY0FBYyxTQUFTLE1BQU0sWUFBWSxRQUFRLEVBQUUsQ0FBQztBQUMxRixZQUFNLGdCQUFpQixRQUFRLGlCQUFpQixRQUFRLGdCQUNyRCxJQUFJLDhCQUE4QixZQUFZLFFBQVEsZUFBZSxRQUFRLGVBQWUsUUFBUSxlQUFlLEtBQUssTUFBTSxJQUFJO0FBQ3JJLFlBQU0sU0FBUyxLQUFLLFlBQVksVUFBVTtBQUMxQyxVQUFJLFFBQVE7QUFHWCxlQUFPLHdCQUF3QixRQUFRO0FBQ3ZDLGVBQU8sZ0JBQWdCLFFBQVE7QUFDL0IsZUFBTywyQkFBMkIsUUFBUTtBQUMxQyxlQUFPLHdCQUF3QjtBQUMvQixZQUFJLGVBQWU7QUFDbEIsZUFBSyxnQkFBZ0IsSUFBSSxZQUFZLGFBQWE7QUFBQSxRQUNuRDtBQUNBLGVBQU8sZUFBZTtBQUN0QixhQUFLLGtCQUFrQixZQUFZLFFBQVEsV0FBVztBQUN0RCxhQUFLLE9BQU8sWUFBWSxZQUFZLE9BQU8sT0FBTztBQUFBLE1BQ25ELE9BQU87QUFDTixhQUFLLG9CQUFvQixNQUFNLG9DQUFvQyxVQUFVO0FBQUEsTUFDOUU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxRQUFRLFlBQW9CLFVBQXFFLFNBQXdDO0FBQ3hJLFNBQUssV0FBVyxNQUFNLCtCQUErQixZQUFZLFVBQVUsTUFBTSxVQUFVLGFBQWEsT0FBTztBQUUvRyxXQUFPLEtBQUssYUFBYSxTQUFTLFlBQVksUUFBUSxLQUFLLEVBQ3pELEtBQUssTUFBTTtBQUNYLFlBQU0sU0FBUyxLQUFLLFlBQVksVUFBVTtBQUMxQyxVQUFJLFVBQVUsVUFBVTtBQUN2QixlQUFPLEtBQUssT0FBTyxRQUFRLEtBQUssZUFBZSxJQUFJLFVBQVUsRUFBRyxjQUFjLFNBQVMsTUFBTSxTQUFTLGFBQWEsT0FBTztBQUFBLE1BQzNIO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFNBQVMsWUFBb0Isd0JBQWdGO0FBQzVHLFNBQUssV0FBVyxNQUFNLGdDQUFnQyxZQUFZLHNCQUFzQjtBQUV4RixVQUFNLFNBQVMsS0FBSyxZQUFZLFVBQVU7QUFDMUMsVUFBTSxlQUFlLEtBQUssZUFBZSxJQUFJLFVBQVU7QUFDdkQsUUFBSSxVQUFVLGNBQWM7QUFDM0IsWUFBTSxpQkFBaUIsYUFBYSxhQUFhLGtCQUFrQixzQkFBc0I7QUFDekYsYUFBTyxPQUFPLFFBQVEsZUFBZSxNQUFNLFNBQVMsZUFBZSxRQUFRLFFBQVcsZUFBZSxXQUFXLFNBQVMsZUFBZSxhQUFhLE1BQVM7QUFBQSxJQUMvSjtBQUNBLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUVBLFlBQVksWUFBb0IsU0FBeUM7QUFDeEUsU0FBSyxXQUFXLE1BQU0sbUNBQW1DLFlBQVksUUFBUSxTQUFTLENBQUM7QUFFdkYsVUFBTSxTQUFTLEtBQUssWUFBWSxVQUFVO0FBQzFDLFFBQUksUUFBUTtBQUNYLGFBQU8sVUFBVTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBRUEsVUFBVSxZQUFvQixPQUFlLGFBQXVDO0FBQ25GLFNBQUssV0FBVyxNQUFNLGlDQUFpQyxZQUFZLE9BQU8sV0FBVztBQUVyRixVQUFNLFNBQVMsS0FBSyxZQUFZLFVBQVU7QUFDMUMsUUFBSSxRQUFRO0FBQ1gsYUFBTyxRQUFRO0FBQ2YsYUFBTyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFVLFlBQW9CLE9BQXFDO0FBQ2xFLFNBQUssV0FBVyxNQUFNLGlDQUFpQyxZQUFZLE9BQU8sT0FBTyxPQUFPLE9BQU87QUFFL0YsVUFBTSxTQUFTLEtBQUssWUFBWSxVQUFVO0FBQzFDLFFBQUksUUFBUTtBQUNYLGFBQU8sUUFBUTtBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUFBLEVBRUEscUJBQXFCLG1CQUEyQixXQUFtQixZQUF1QztBQUN6RyxVQUFNLGFBQWEsS0FBSyxnQkFBZ0IsSUFBSSxpQkFBaUI7QUFDN0QsUUFBSSxDQUFDLFlBQVk7QUFDaEIsWUFBTSxJQUFJLE1BQU0sY0FBYztBQUFBLElBQy9CO0FBQ0EsV0FBTyxXQUFXLG9CQUFvQixXQUFXLFVBQVU7QUFBQSxFQUM1RDtBQUFBLEVBRUEsTUFBYSxhQUFhLFlBQW1DO0FBQzVELFVBQU0sU0FBUyxLQUFLLFlBQVksVUFBVTtBQUMxQyxRQUFJLFFBQVE7QUFDWCxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUVBLFNBQUssZUFBZSxpQkFBaUIsVUFBVTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSwyQkFBMkIsYUFBMkI7QUFTckQsU0FBSyxpQkFBaUIsV0FBOEUsMkJBQTJCO0FBQUEsTUFDOUg7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLE9BQU8sVUFBcUIsY0FBb0MsUUFBbUIsYUFBMEIsU0FBd0M7QUFDbEssY0FBVSxVQUFVLFVBQVUsRUFBRSxRQUFRLE9BQU8sT0FBTyxNQUFNO0FBQzVELFVBQU0sU0FBUyxrQkFBa0IsUUFBUSxNQUFNLElBQUksUUFBUSxRQUFRO0FBQ25FLFVBQU0sUUFBUSxrQkFBa0IsUUFBUSxLQUFLLElBQUksUUFBUSxRQUFRO0FBQ2pFLFFBQUksU0FBUyxLQUFLLElBQUksU0FBUyxRQUFRLE1BQU0sSUFBSSxRQUFRLFNBQVMsUUFBUSxXQUFXLE9BQU8sSUFBSSxHQUFHLENBQUM7QUFFcEcsUUFBSSxhQUFhLFFBQVEsR0FBRztBQUUzQixZQUFNLFNBQVMsUUFBUTtBQUFBLElBQ3hCO0FBQ0EsZUFBVyxVQUFVLGFBQWE7QUFDakMsWUFBTSxhQUFhLGFBQWEsUUFBUSxPQUFPLE1BQU07QUFDckQsVUFBSSxZQUFZO0FBQ2YsY0FBTSxTQUFTLE9BQU8sVUFBVTtBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUNBLFVBQU0sT0FBTyxhQUFhLFFBQVEsT0FBTyxNQUFNO0FBQy9DLFFBQUksTUFBTTtBQUNULFlBQU0sU0FBUyxPQUFPLElBQUk7QUFDMUIsVUFBSSxRQUFRO0FBQ1gsaUJBQVMsYUFBYSxDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCO0FBQ0EsVUFBSSxVQUFVLE9BQU87QUFDcEIsaUJBQVMsU0FBUztBQUFBLE1BQ25CLFdBQVcsT0FBTztBQUNqQixpQkFBUyxTQUFTLElBQUk7QUFBQSxNQUN2QjtBQUNBLFVBQUksZ0JBQWdCLENBQUMsSUFBSTtBQUN6QixhQUFPLGNBQWMsU0FBUyxLQUFLLFNBQVMsR0FBRyxVQUFVO0FBQ3hELGNBQU0sU0FBUyxPQUFPLGFBQWE7QUFDbkMsd0JBQWdCLGNBQWMsT0FBTyxDQUFDLFFBQVEsY0FBYztBQUMzRCxnQkFBTUEsUUFBTyxhQUFhLFFBQVEsVUFBVSxNQUFNO0FBQ2xELGNBQUlBLFNBQVFBLE1BQUssWUFBWUEsTUFBSyxTQUFTLFFBQVE7QUFDbEQsbUJBQU8sS0FBSyxHQUFHQSxNQUFLLFFBQVE7QUFBQSxVQUM3QjtBQUNBLGlCQUFPO0FBQUEsUUFDUixHQUFHLENBQUMsQ0FBZ0I7QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsWUFBb0IsVUFBcUIsYUFBb0M7QUFDdEcsZ0JBQVksSUFBSSxTQUFTLGdCQUFnQixVQUFRLEtBQUssT0FBTyxhQUFhLFlBQVksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDO0FBQ3pHLGdCQUFZLElBQUksU0FBUyxrQkFBa0IsVUFBUSxLQUFLLE9BQU8sYUFBYSxZQUFZLEtBQUssUUFBUSxLQUFLLENBQUMsQ0FBQztBQUM1RyxnQkFBWSxJQUFJLFNBQVMsNkJBQTZCLFdBQVMsS0FBSyxPQUFPLHNCQUFzQixZQUFZLE1BQU0sVUFBVSxJQUFJLENBQUMsRUFBRSxPQUFPLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxNQUFNLENBQUMsQ0FBQztBQUM5SyxnQkFBWSxJQUFJLFNBQVMsc0JBQXNCLGVBQWEsS0FBSyxPQUFPLFlBQVksWUFBWSxTQUFTLENBQUMsQ0FBQztBQUMzRyxnQkFBWSxJQUFJLFNBQVMseUJBQXlCLFdBQVM7QUFDMUQsV0FBSyxPQUFPLHFCQUFxQixZQUE4QixNQUFNLElBQUksVUFBUTtBQUNoRixlQUFPLEVBQUUsZ0JBQWdCLEtBQUssUUFBUSxVQUFVLEtBQUssVUFBVSxhQUFhLE1BQU07QUFBQSxNQUNuRixDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLFlBQVksWUFBc0M7QUFDekQsVUFBTSxpQkFBMkQsU0FBUyxHQUFtQixXQUFXLGFBQWEsRUFBRSxRQUFRLFVBQVU7QUFDekksV0FBTyxpQkFBaUIsZUFBZSxXQUFXO0FBQUEsRUFDbkQ7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLGVBQVcsZ0JBQWdCLEtBQUssZ0JBQWdCO0FBQy9DLFlBQU0sV0FBVyxLQUFLLFlBQVksYUFBYSxDQUFDLENBQUM7QUFDakQsVUFBSSxVQUFVO0FBQ2IsaUJBQVMsZUFBZTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxRQUFRO0FBRTVCLFNBQUssZ0JBQWdCLE1BQU07QUFFM0IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBMU1hLHNCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxFQVNsRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVO0FBOE1iLE1BQU0sOEJBQXdFO0FBQUEsRUFJN0UsWUFBNkIsWUFDbkIsZUFDQSxlQUNBLGFBQ1EsUUFBK0I7QUFKcEI7QUFDbkI7QUFDQTtBQUNBO0FBQ1E7QUFObEIsU0FBaUIscUJBQXFCLElBQUksc0JBQXNCO0FBQUEsRUFNYjtBQUFBLEVBRW5ELE1BQU0sV0FBVyxjQUE4QixnQkFBdUMsT0FDckYsZUFBd0IsY0FBdUIsdUJBQWlEO0FBQ2hHLFVBQU0sVUFBVSxLQUFLLG1CQUFtQixJQUFJLFlBQVk7QUFDeEQsUUFBSTtBQUNILFlBQU0sa0JBQWtCLE1BQU0sWUFBWSxhQUFhLFNBQVMsWUFBWTtBQUM1RSxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLGFBQU8sTUFBTSxLQUFLLE9BQU8sWUFBWSxLQUFLLFlBQVksUUFBUSxJQUFJLGlCQUFpQixnQkFBZ0IsUUFBUSxPQUFPLGVBQWUsY0FBYyxxQkFBcUI7QUFBQSxJQUNySyxVQUFFO0FBQ0QsY0FBUSxRQUFRO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFdBQVcsdUJBQWlDLGVBQXVCLE9BQStEO0FBQ3ZJLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSw0QkFBNEIsTUFBTSxLQUFLLE9BQU8sWUFBWSxLQUFLLFlBQVksdUJBQXVCLGVBQWUsS0FBSztBQUM1SCxRQUFJLENBQUMsMkJBQTJCO0FBQy9CO0FBQUEsSUFDRDtBQUVBLFVBQU0seUJBQXlCLElBQUksZUFBZTtBQUNsRCw4QkFBMEIsTUFBTSxRQUFRLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTTtBQUV6RCxZQUFNLFFBQVEsU0FBUyxNQUFNLFdBQVcsS0FBSyxjQUMxQyxRQUFRLE9BQU8sS0FBSyxZQUFZLElBQUksVUFBUSxPQUFPLFNBQVMsV0FBVyxPQUFPLElBQUksT0FBTyxJQUFJLENBQUMsQ0FBQyxJQUMvRixLQUFLO0FBQ1IsNkJBQXVCLFFBQVEsTUFBTSw2QkFBNkIsS0FBSyxDQUFDO0FBQUEsSUFDekUsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxvQkFBb0IsV0FBbUIsWUFBdUM7QUFDcEYsV0FBTyxLQUFLLG1CQUFtQixnQkFBZ0IsV0FBVyxVQUFVO0FBQUEsRUFDckU7QUFDRDtBQUVBLE1BQU0scUJBQXNEO0FBQUEsRUFLM0QsWUFBNkIsWUFDWCxRQUNBLHFCQUNoQjtBQUgyQjtBQUNYO0FBQ0E7QUFMbEIsU0FBaUIsV0FBMkMsb0JBQUksSUFBK0I7QUFPOUYsU0FBSyxhQUFhLEtBQUssT0FBTyxZQUFZLEtBQUssVUFBVTtBQUFBLEVBQzFEO0FBQUEsRUFFQSxNQUFNLFlBQVksVUFBaUU7QUFDbEYsVUFBTSxVQUFVLE1BQU0sS0FBSyxpQkFBaUIsV0FBVyxDQUFDLFFBQVEsSUFBSSxNQUFTO0FBQzdFLFdBQU8sVUFBVSxDQUFDO0FBQUEsRUFDbkI7QUFBQSxFQUVBLGlCQUFpQixXQUF3RTtBQUN4RixRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssU0FBUyxNQUFNO0FBQUEsSUFDckI7QUFDQSxXQUFPLEtBQUssT0FBTyxhQUFhLEtBQUssWUFBWSxZQUFZLFVBQVUsSUFBSSxVQUFRLEtBQUssTUFBTSxJQUFJLE1BQVMsRUFDekc7QUFBQSxNQUNBLGNBQVk7QUFDWCxjQUFNLG9CQUFvQixLQUFLLHdCQUF3QixhQUFhLENBQUMsR0FBRyxRQUFRO0FBQ2hGLGVBQU8sS0FBSyxnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDOUM7QUFBQSxNQUNBLFNBQU87QUFHTixZQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxHQUFHO0FBQzdCLGVBQUssb0JBQW9CLE1BQU0sR0FBRztBQUFBLFFBQ25DO0FBQ0EsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQUM7QUFBQSxFQUNKO0FBQUEsRUFFUSx3QkFBd0IsU0FBc0IsVUFBMkQ7QUFDaEgsVUFBTSxvQkFBMEQsTUFBTSxRQUFRLE1BQU07QUFDcEYsUUFBSSxVQUFVO0FBQ2IsaUJBQVcsY0FBYyxVQUFVO0FBQ2xDLGNBQU0sa0JBQWtCLFdBQVcsQ0FBQztBQUNwQywwQkFBa0IsZUFBZSxJQUFJLFdBQVcsTUFBTSxDQUFDO0FBQUEsTUFDeEQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGtCQUFrQix3QkFBa0g7QUFDbkksVUFBTSxpQkFBOEIsQ0FBQztBQUNyQyxVQUFNLHNCQUFtQyxDQUFDO0FBQzFDLFFBQUksd0JBQXdCO0FBQzNCLGlCQUFXLHFCQUFxQixPQUFPLEtBQUssc0JBQXNCLEdBQUc7QUFDcEUsY0FBTSxrQkFBa0IsS0FBSyxRQUFRLGlCQUFpQjtBQUN0RCxZQUFJLGlCQUFpQjtBQUNwQixnQkFBTSxjQUFjLHVCQUF1QixpQkFBaUI7QUFDNUQsY0FBSSxnQkFBZ0IsVUFBVSxjQUFjLFlBQVksVUFBVSxXQUFXO0FBQzVFLGdDQUFvQixLQUFLLGVBQWU7QUFBQSxVQUN6QztBQUVBLGVBQUssZUFBZSxpQkFBaUIsV0FBVztBQUNoRCxjQUFJLHNCQUFzQixZQUFZLFFBQVE7QUFDN0MsMkJBQWUsS0FBSyxlQUFlO0FBQUEsVUFDcEMsT0FBTztBQUVOLGlCQUFLLFNBQVMsT0FBTyxpQkFBaUI7QUFDdEMsaUJBQUssU0FBUyxJQUFJLGdCQUFnQixRQUFRLGVBQWU7QUFDekQsa0JBQU0sU0FBUyxZQUFZLGVBQWUsS0FBSyxTQUFTLElBQUksWUFBWSxZQUFZLElBQUk7QUFDeEYsZ0JBQUksUUFBUTtBQUNYLDZCQUFlLEtBQUssTUFBTTtBQUFBLFlBQzNCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxPQUFPLGdCQUFnQixZQUFZLG9CQUFvQjtBQUFBLEVBQ2pFO0FBQUEsRUFFQSxRQUFRLGdCQUErQztBQUN0RCxXQUFPLEtBQUssU0FBUyxJQUFJLGNBQWM7QUFBQSxFQUN4QztBQUFBLEVBRUEsVUFBbUI7QUFDbEIsV0FBTyxLQUFLLFNBQVMsU0FBUztBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixlQUE4RztBQUMzSSxRQUFJLGtCQUFrQixRQUFXO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxlQUF1QyxDQUFDO0FBQzlDLFVBQU0sYUFBYSxNQUFNLEtBQUs7QUFDOUIsUUFBSSxlQUFlO0FBQ2xCLGlCQUFXLFlBQVksZUFBZTtBQUNyQyxjQUFNLFNBQStCLENBQUM7QUFDdEMscUJBQWEsS0FBSyxNQUFNO0FBQ3hCLFlBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxRQUNEO0FBQ0EsbUJBQVcsV0FBVyxVQUFVO0FBQy9CLGdCQUFNLGFBQWEsSUFBSSxtQkFBbUIsU0FBUyxhQUFhLENBQUMsVUFBVTtBQUMxRSxtQkFBTyxLQUFLLE9BQU8sU0FBUyxLQUFLLFlBQVksUUFBUSxRQUFRLEtBQUs7QUFBQSxVQUNuRSxJQUFJLE1BQVM7QUFDYixlQUFLLFNBQVMsSUFBSSxRQUFRLFFBQVEsVUFBVTtBQUM1QyxpQkFBTyxLQUFLLFVBQVU7QUFBQSxRQUN2QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGVBQWUsU0FBb0IsVUFBMkI7QUFDckUsYUFBUyxXQUFXLFNBQVMsV0FBVyxTQUFTLFdBQVc7QUFDNUQsUUFBSSxTQUFTO0FBQ1osWUFBTSxhQUFhLFNBQVM7QUFBQSxRQUFDLEdBQUcsT0FBTyxLQUFLLG1CQUFtQixxQkFBcUIsUUFBUSxXQUFXLElBQUksT0FBTztBQUFBLFFBQ2xILEdBQUcsT0FBTyxLQUFLLFFBQVE7QUFBQSxNQUFDLENBQUM7QUFDekIsaUJBQVcsWUFBWSxZQUFZO0FBQ2xDLFFBQUMsUUFBa0QsUUFBUSxJQUFLLFNBQW1ELFFBQVE7QUFBQSxNQUM1SDtBQUNBLFVBQUksbUJBQW1CLG9CQUFvQjtBQUMxQyxnQkFBUSxhQUFhO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJpdGVtIl0KfQo=
