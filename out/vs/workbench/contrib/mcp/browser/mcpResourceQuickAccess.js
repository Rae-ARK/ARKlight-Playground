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
import { DeferredPromise, disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { DefaultQuickAccessFilterValue } from "../../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IChatAttachmentResolveService } from "../../chat/browser/attachments/chatAttachmentResolveService.js";
import { IMcpService, isMcpResourceTemplate, McpCapability, McpConnectionState, McpResourceURI } from "../common/mcpTypes.js";
import { McpIcons } from "../common/mcpIcons.js";
import { openPanelChatAndGetWidget } from "./openPanelChatAndGetWidget.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { asArray } from "../../../../base/common/arrays.js";
let McpResourcePickHelper = class extends Disposable {
  constructor(_mcpService, _fileService, _quickInputService, _notificationService, _chatAttachmentResolveService) {
    super();
    this._mcpService = _mcpService;
    this._fileService = _fileService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._chatAttachmentResolveService = _chatAttachmentResolveService;
    this._resources = observableValue(this, { picks: /* @__PURE__ */ new Map(), isBusy: true });
    this._pickItemsStack = new LinkedList();
    this._inDirectory = observableValue(this, void 0);
    this.hasServersWithResources = derived((reader) => {
      let enabled = false;
      for (const server of this._mcpService.servers.read(reader)) {
        const cap = server.capabilities.read(void 0);
        if (cap === void 0) {
          enabled = true;
        } else if (cap & McpCapability.Resources) {
          enabled = true;
          break;
        }
      }
      return enabled;
    });
    this.checkIfNestedResources = () => !this._pickItemsStack.isEmpty();
  }
  static sep(server) {
    return {
      id: server.definition.id,
      type: "separator",
      label: server.definition.label
    };
  }
  addCurrentMCPQuickPickItemLevel(server, resources) {
    let isValidPush = false;
    isValidPush = this._pickItemsStack.isEmpty();
    if (!isValidPush) {
      const stackedItem = this._pickItemsStack.peek();
      if (stackedItem?.server === server && stackedItem.resources === resources) {
        isValidPush = false;
      } else {
        isValidPush = true;
      }
    }
    if (isValidPush) {
      this._pickItemsStack.push({ server, resources });
    }
  }
  navigateBack() {
    const items = this._pickItemsStack.pop();
    if (items) {
      this._inDirectory.set({ server: items.server, resources: items.resources }, void 0);
      return true;
    } else {
      return false;
    }
  }
  static item(resource) {
    const iconPath = resource.icons.getUrl(22);
    if (isMcpResourceTemplate(resource)) {
      return {
        id: resource.template.template,
        label: resource.title || resource.name,
        description: resource.description,
        detail: localize("mcp.resource.template", "Resource template: {0}", resource.template.template),
        iconPath
      };
    }
    return {
      id: resource.uri.toString(),
      label: resource.title || resource.name,
      description: resource.description,
      detail: resource.mcpUri + (resource.sizeInBytes !== void 0 ? " (" + ByteSize.formatSize(resource.sizeInBytes) + ")" : ""),
      iconPath
    };
  }
  /**
   * Navigate to a resource if it's a directory.
   * Returns true if the resource is a directory with children (navigation succeeded).
   * Returns false if the resource is a leaf file (no navigation).
   * When returning true, statefully updates the picker state to display directory contents.
   */
  async navigate(resource, server) {
    if (isMcpResourceTemplate(resource)) {
      return false;
    }
    const uri = resource.uri;
    let stat = void 0;
    try {
      stat = await this._fileService.resolve(uri, { resolveMetadata: false });
    } catch (e) {
      return false;
    }
    if (stat && this._isDirectoryResource(resource) && (stat.children?.length ?? 0) > 0) {
      const currentResources = this._resources.get().picks.get(server);
      if (currentResources) {
        this.addCurrentMCPQuickPickItemLevel(server, currentResources);
      }
      const childResources = stat.children.map((child) => {
        const mcpUri = McpResourceURI.fromServer(server.definition, child.resource.toString());
        return {
          uri: mcpUri,
          mcpUri: child.resource.path,
          name: child.name,
          title: child.name,
          description: resource.description,
          mimeType: void 0,
          sizeInBytes: child.size,
          icons: McpIcons.fromParsed(void 0)
        };
      });
      this._inDirectory.set({ server, resources: childResources }, void 0);
      return true;
    }
    return false;
  }
  toAttachment(resource, server) {
    const noop = "noop";
    if (this._isDirectoryResource(resource)) {
      this.checkIfDirectoryAndPopulate(resource, server);
      return noop;
    }
    if (isMcpResourceTemplate(resource)) {
      return this._resourceTemplateToAttachment(resource).then((val) => val || noop);
    } else {
      return this._resourceToAttachment(resource).then((val) => val || noop);
    }
  }
  async checkIfDirectoryAndPopulate(resource, server) {
    try {
      return !await this.navigate(resource, server);
    } catch (error) {
      return false;
    }
  }
  async toURI(resource) {
    if (isMcpResourceTemplate(resource)) {
      const maybeUri = await this._resourceTemplateToURI(resource);
      return maybeUri && await this._verifyUriIfNeeded(maybeUri);
    } else {
      return resource.uri;
    }
  }
  async _resourceToAttachment(resource) {
    const asImage = await this._chatAttachmentResolveService.resolveImageEditorAttachContext(resource.uri, void 0, resource.mimeType);
    if (asImage) {
      return asImage;
    }
    return {
      id: resource.uri.toString(),
      kind: "file",
      name: resource.name,
      value: resource.uri
    };
  }
  async _resourceTemplateToAttachment(rt) {
    const maybeUri = await this._resourceTemplateToURI(rt);
    const uri = maybeUri && await this._verifyUriIfNeeded(maybeUri);
    return uri && this._resourceToAttachment({
      uri,
      name: rt.name,
      mimeType: rt.mimeType
    });
  }
  async _verifyUriIfNeeded({ uri, needsVerification }) {
    if (!needsVerification) {
      return uri;
    }
    const exists = await this._fileService.exists(uri);
    if (exists) {
      return uri;
    }
    this._notificationService.warn(localize("mcp.resource.template.notFound", "The resource {0} was not found.", McpResourceURI.toServer(uri).resourceURL.toString()));
    return void 0;
  }
  async _resourceTemplateToURI(rt) {
    const todo = rt.template.components.flatMap((c) => typeof c === "object" ? c.variables : []);
    const quickInput = this._quickInputService.createQuickPick();
    const cts = new CancellationTokenSource();
    const vars = {};
    quickInput.totalSteps = todo.length;
    quickInput.ignoreFocusOut = true;
    let needsVerification = false;
    try {
      for (let i = 0; i < todo.length; i++) {
        const variable = todo[i];
        const resolved = await this._promptForTemplateValue(quickInput, variable, vars, rt);
        if (resolved === void 0) {
          return void 0;
        }
        needsVerification ||= !resolved.completed;
        vars[todo[i].name] = variable.repeatable ? resolved.value.split("/") : resolved.value;
      }
      return { uri: rt.resolveURI(vars), needsVerification };
    } finally {
      cts.dispose(true);
      quickInput.dispose();
    }
  }
  _promptForTemplateValue(input, variable, variablesSoFar, rt) {
    const store = new DisposableStore();
    const completions = /* @__PURE__ */ new Map([]);
    const variablesWithPlaceholders = { ...variablesSoFar };
    for (const variable2 of rt.template.components.flatMap((c) => typeof c === "object" ? c.variables : [])) {
      if (!variablesWithPlaceholders.hasOwnProperty(variable2.name)) {
        variablesWithPlaceholders[variable2.name] = `$${variable2.name.toUpperCase()}`;
      }
    }
    let placeholder = localize("mcp.resource.template.placeholder", "Value for ${0} in {1}", variable.name.toUpperCase(), rt.template.resolve(variablesWithPlaceholders).replaceAll("%24", "$"));
    if (variable.optional) {
      placeholder += " (" + localize("mcp.resource.template.optional", "Optional") + ")";
    }
    input.placeholder = placeholder;
    input.value = "";
    input.items = [];
    input.show();
    const currentID = generateUuid();
    const setItems = (value, completed = []) => {
      const items = completed.filter((c) => c !== value).map((c) => ({ id: c, label: c }));
      if (value) {
        items.unshift({ id: currentID, label: value });
      } else if (variable.optional) {
        items.unshift({ id: currentID, label: localize("mcp.resource.template.empty", "<Empty>") });
      }
      input.items = items;
    };
    let changeCancellation = new CancellationTokenSource();
    store.add(toDisposable(() => changeCancellation.dispose(true)));
    const getCompletionItems = () => {
      const inputValue = input.value;
      let promise = completions.get(inputValue);
      if (!promise) {
        promise = rt.complete(variable.name, inputValue, variablesSoFar, changeCancellation.token);
        completions.set(inputValue, promise);
      }
      promise.then((values) => {
        if (!changeCancellation.token.isCancellationRequested) {
          setItems(inputValue, values);
        }
      }).catch(() => {
        completions.delete(inputValue);
      }).finally(() => {
        if (!changeCancellation.token.isCancellationRequested) {
          input.busy = false;
        }
      });
    };
    const getCompletionItemsScheduler = store.add(new RunOnceScheduler(getCompletionItems, 300));
    return new Promise((resolve) => {
      store.add(input.onDidHide(() => resolve(void 0)));
      store.add(input.onDidAccept(() => {
        const item = input.selectedItems[0];
        if (item.id === currentID) {
          resolve({ value: input.value, completed: false });
        } else if (variable.explodable && item.label.endsWith("/") && item.label !== input.value) {
          input.value = item.label;
        } else {
          resolve({ value: item.label, completed: true });
        }
      }));
      store.add(input.onDidChangeValue((value) => {
        input.busy = true;
        changeCancellation.dispose(true);
        changeCancellation = new CancellationTokenSource();
        getCompletionItemsScheduler.cancel();
        setItems(value);
        if (completions.has(input.value)) {
          getCompletionItems();
        } else {
          getCompletionItemsScheduler.schedule();
        }
      }));
      getCompletionItems();
    }).finally(() => store.dispose());
  }
  _isDirectoryResource(resource) {
    if (resource.mimeType && resource.mimeType === "inode/directory") {
      return true;
    } else if (isMcpResourceTemplate(resource)) {
      return resource.template.template.endsWith("/");
    } else {
      return resource.uri.path.endsWith("/");
    }
  }
  getPicks(token) {
    const cts = new CancellationTokenSource(token);
    let isBusyLoadingPicks = true;
    this._register(toDisposable(() => cts.dispose(true)));
    let showInSequence = true;
    this._register(disposableTimeout(() => {
      showInSequence = false;
      publish();
    }, 5e3));
    const publish = () => {
      const output = /* @__PURE__ */ new Map();
      for (const [server, rec] of servers) {
        const r = [];
        output.set(server, r);
        if (rec.templates.isResolved) {
          r.push(...rec.templates.value);
        } else if (showInSequence) {
          break;
        }
        r.push(...rec.resourcesSoFar);
        if (!rec.resources.isSettled && showInSequence) {
          break;
        }
      }
      this._resources.set({ picks: output, isBusy: isBusyLoadingPicks }, void 0);
    };
    const servers = /* @__PURE__ */ new Map();
    Promise.all((this.explicitServers || this._mcpService.servers.get()).map(async (server) => {
      let cap = server.capabilities.get();
      const rec = {
        templates: new DeferredPromise(),
        resourcesSoFar: [],
        resources: new DeferredPromise()
      };
      servers.set(server, rec);
      if (cap === void 0) {
        cap = await new Promise((resolve) => {
          server.start().then((state) => {
            if (state.state === McpConnectionState.Kind.Error || state.state === McpConnectionState.Kind.Stopped) {
              resolve(void 0);
            }
          });
          this._register(cts.token.onCancellationRequested(() => resolve(void 0)));
          this._register(autorun((reader) => {
            const cap2 = server.capabilities.read(reader);
            if (cap2 !== void 0) {
              resolve(cap2);
            }
          }));
        });
      }
      if (cap && cap & McpCapability.Resources) {
        await Promise.all([
          rec.templates.settleWith(server.resourceTemplates(cts.token).catch(() => [])).finally(publish),
          rec.resources.settleWith((async () => {
            for await (const page of server.resources(cts.token)) {
              rec.resourcesSoFar = rec.resourcesSoFar.concat(page);
              publish();
            }
          })())
        ]);
      } else {
        rec.templates.complete([]);
        rec.resources.complete([]);
      }
    })).finally(() => {
      isBusyLoadingPicks = false;
      publish();
    });
    return derived(this, (reader) => {
      const directoryResource = this._inDirectory.read(reader);
      return directoryResource ? { picks: /* @__PURE__ */ new Map([[directoryResource.server, directoryResource.resources]]), isBusy: false } : this._resources.read(reader);
    });
  }
};
McpResourcePickHelper = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IChatAttachmentResolveService)
], McpResourcePickHelper);
let AbstractMcpResourceAccessPick = class {
  constructor(_scopeTo, _instantiationService, _editorService, _chatWidgetService, _viewsService) {
    this._scopeTo = _scopeTo;
    this._instantiationService = _instantiationService;
    this._editorService = _editorService;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
  }
  applyToPick(picker, token, runOptions) {
    picker.canAcceptInBackground = true;
    picker.busy = true;
    picker.keepScrollPosition = true;
    const store = new DisposableStore();
    const goBackId = "_goback_";
    const attachButton = localize("mcp.quickaccess.attach", "Attach to chat");
    const helper = store.add(this._instantiationService.createInstance(McpResourcePickHelper));
    if (this._scopeTo) {
      helper.explicitServers = [this._scopeTo];
    }
    const picksObservable = helper.getPicks(token);
    store.add(autorun((reader) => {
      const pickItems = picksObservable.read(reader);
      const isBusy = pickItems.isBusy;
      const items = [];
      for (const [server, resources] of pickItems.picks) {
        items.push(McpResourcePickHelper.sep(server));
        for (const resource of resources) {
          const pickItem = McpResourcePickHelper.item(resource);
          pickItem.buttons = [{ iconClass: ThemeIcon.asClassName(Codicon.attach), tooltip: attachButton }];
          items.push({ ...pickItem, resource, server });
        }
      }
      if (helper.checkIfNestedResources()) {
        const goBackItem = {
          id: goBackId,
          label: localize("goBack", "Go back \u21A9"),
          alwaysShow: true
        };
        items.push(goBackItem);
      }
      picker.items = items;
      picker.busy = isBusy;
    }));
    store.add(picker.onDidTriggerItemButton((event) => {
      if (event.button.tooltip === attachButton) {
        picker.busy = true;
        const resourceItem = event.item;
        const attachment = helper.toAttachment(resourceItem.resource, resourceItem.server);
        if (attachment instanceof Promise) {
          attachment.then(async (a) => {
            if (a !== "noop") {
              const widget = await openPanelChatAndGetWidget(this._viewsService, this._chatWidgetService);
              widget?.attachmentModel.addContext(...asArray(a));
            }
            picker.hide();
          });
        }
      }
    }));
    store.add(picker.onDidHide(() => {
      helper.dispose();
    }));
    store.add(picker.onDidAccept(async (event) => {
      try {
        picker.busy = true;
        const [item] = picker.selectedItems;
        if (item.id === goBackId) {
          helper.navigateBack();
          picker.busy = false;
          return;
        }
        const resourceItem = item;
        const resource = resourceItem.resource;
        const isNested = await helper.navigate(resource, resourceItem.server);
        if (!isNested) {
          const uri = await helper.toURI(resource);
          if (uri) {
            picker.hide();
            this._editorService.openEditor({ resource: uri, options: { preserveFocus: event.inBackground } });
          }
        }
      } finally {
        picker.busy = false;
      }
    }));
    return store;
  }
};
AbstractMcpResourceAccessPick = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IViewsService)
], AbstractMcpResourceAccessPick);
let McpResourceQuickPick = class extends AbstractMcpResourceAccessPick {
  constructor(scopeTo, instantiationService, editorService, chatWidgetService, viewsService, _quickInputService) {
    super(scopeTo, instantiationService, editorService, chatWidgetService, viewsService);
    this._quickInputService = _quickInputService;
  }
  async pick(token = CancellationToken.None) {
    const store = new DisposableStore();
    const qp = store.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    qp.placeholder = localize("mcp.quickaccess.placeholder", "Search for resources");
    store.add(this.applyToPick(qp, token));
    store.add(qp.onDidHide(() => store.dispose()));
    qp.show();
    await Event.toPromise(qp.onDidHide);
  }
};
McpResourceQuickPick = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, IQuickInputService)
], McpResourceQuickPick);
let McpResourceQuickAccess = class extends AbstractMcpResourceAccessPick {
  constructor(instantiationService, editorService, chatWidgetService, viewsService) {
    super(void 0, instantiationService, editorService, chatWidgetService, viewsService);
    this.defaultFilterValue = DefaultQuickAccessFilterValue.LAST;
  }
  provide(picker, token, runOptions) {
    return this.applyToPick(picker, token, runOptions);
  }
};
McpResourceQuickAccess.PREFIX = "mcpr ";
McpResourceQuickAccess = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IViewsService)
], McpResourceQuickAccess);
export {
  AbstractMcpResourceAccessPick,
  McpResourcePickHelper,
  McpResourceQuickAccess,
  McpResourceQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFJlc291cmNlUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0UXVpY2tBY2Nlc3NGaWx0ZXJWYWx1ZSwgSVF1aWNrQWNjZXNzUHJvdmlkZXIsIElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSU1jcFJlc291cmNlLCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSwgSU1jcFNlcnZlciwgSU1jcFNlcnZpY2UsIGlzTWNwUmVzb3VyY2VUZW1wbGF0ZSwgTWNwQ2FwYWJpbGl0eSwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BSZXNvdXJjZVVSSSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BJY29ucyB9IGZyb20gJy4uL2NvbW1vbi9tY3BJY29ucy5qcyc7XG5pbXBvcnQgeyBJVXJpVGVtcGxhdGVWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaVRlbXBsYXRlLmpzJztcbmltcG9ydCB7IG9wZW5QYW5lbENoYXRBbmRHZXRXaWRnZXQgfSBmcm9tICcuL29wZW5QYW5lbENoYXRBbmRHZXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRQaWNrQXR0YWNobWVudCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTWNwUmVzb3VyY2VQaWNrSGVscGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3Jlc291cmNlcyA9IG9ic2VydmFibGVWYWx1ZTx7IHBpY2tzOiBNYXA8SU1jcFNlcnZlciwgKElNY3BSZXNvdXJjZVRlbXBsYXRlIHwgSU1jcFJlc291cmNlKVtdPjsgaXNCdXN5OiBib29sZWFuIH0+KHRoaXMsIHsgcGlja3M6IG5ldyBNYXAoKSwgaXNCdXN5OiB0cnVlIH0pO1xuXHRwcml2YXRlIF9waWNrSXRlbXNTdGFjazogTGlua2VkTGlzdDx7IHNlcnZlcjogSU1jcFNlcnZlcjsgcmVzb3VyY2VzOiAoSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpW10gfT4gPSBuZXcgTGlua2VkTGlzdCgpO1xuXHRwcml2YXRlIF9pbkRpcmVjdG9yeSA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQgfCB7IHNlcnZlcjogSU1jcFNlcnZlcjsgcmVzb3VyY2VzOiAoSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpW10gfT4odGhpcywgdW5kZWZpbmVkKTtcblx0cHVibGljIHN0YXRpYyBzZXAoc2VydmVyOiBJTWNwU2VydmVyKTogSVF1aWNrUGlja1NlcGFyYXRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCxcblx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0bGFiZWw6IHNlcnZlci5kZWZpbml0aW9uLmxhYmVsLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYWRkQ3VycmVudE1DUFF1aWNrUGlja0l0ZW1MZXZlbChzZXJ2ZXI6IElNY3BTZXJ2ZXIsIHJlc291cmNlczogKElNY3BSZXNvdXJjZSB8IElNY3BSZXNvdXJjZVRlbXBsYXRlKVtdKTogdm9pZCB7XG5cdFx0bGV0IGlzVmFsaWRQdXNoOiBib29sZWFuID0gZmFsc2U7XG5cdFx0aXNWYWxpZFB1c2ggPSB0aGlzLl9waWNrSXRlbXNTdGFjay5pc0VtcHR5KCk7XG5cdFx0aWYgKCFpc1ZhbGlkUHVzaCkge1xuXHRcdFx0Y29uc3Qgc3RhY2tlZEl0ZW0gPSB0aGlzLl9waWNrSXRlbXNTdGFjay5wZWVrKCk7XG5cdFx0XHRpZiAoc3RhY2tlZEl0ZW0/LnNlcnZlciA9PT0gc2VydmVyICYmIHN0YWNrZWRJdGVtLnJlc291cmNlcyA9PT0gcmVzb3VyY2VzKSB7XG5cdFx0XHRcdGlzVmFsaWRQdXNoID0gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpc1ZhbGlkUHVzaCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpc1ZhbGlkUHVzaCkge1xuXHRcdFx0dGhpcy5fcGlja0l0ZW1zU3RhY2sucHVzaCh7IHNlcnZlciwgcmVzb3VyY2VzIH0pO1xuXHRcdH1cblxuXHR9XG5cblx0cHVibGljIG5hdmlnYXRlQmFjaygpOiBib29sZWFuIHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX3BpY2tJdGVtc1N0YWNrLnBvcCgpO1xuXHRcdGlmIChpdGVtcykge1xuXHRcdFx0dGhpcy5faW5EaXJlY3Rvcnkuc2V0KHsgc2VydmVyOiBpdGVtcy5zZXJ2ZXIsIHJlc291cmNlczogaXRlbXMucmVzb3VyY2VzIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXRlbShyZXNvdXJjZTogSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUpOiBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0Y29uc3QgaWNvblBhdGggPSByZXNvdXJjZS5pY29ucy5nZXRVcmwoMjIpO1xuXHRcdGlmIChpc01jcFJlc291cmNlVGVtcGxhdGUocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVzb3VyY2UudGVtcGxhdGUudGVtcGxhdGUsXG5cdFx0XHRcdGxhYmVsOiByZXNvdXJjZS50aXRsZSB8fCByZXNvdXJjZS5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogcmVzb3VyY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ21jcC5yZXNvdXJjZS50ZW1wbGF0ZScsICdSZXNvdXJjZSB0ZW1wbGF0ZTogezB9JywgcmVzb3VyY2UudGVtcGxhdGUudGVtcGxhdGUpLFxuXHRcdFx0XHRpY29uUGF0aCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByZXNvdXJjZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiByZXNvdXJjZS50aXRsZSB8fCByZXNvdXJjZS5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHJlc291cmNlLmRlc2NyaXB0aW9uLFxuXHRcdFx0ZGV0YWlsOiByZXNvdXJjZS5tY3BVcmkgKyAocmVzb3VyY2Uuc2l6ZUluQnl0ZXMgIT09IHVuZGVmaW5lZCA/ICcgKCcgKyBCeXRlU2l6ZS5mb3JtYXRTaXplKHJlc291cmNlLnNpemVJbkJ5dGVzKSArICcpJyA6ICcnKSxcblx0XHRcdGljb25QYXRoLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgaGFzU2VydmVyc1dpdGhSZXNvdXJjZXMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0bGV0IGVuYWJsZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRjb25zdCBjYXAgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdGlmIChjYXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRlbmFibGVkID0gdHJ1ZTsgLy8gdW50aWwgd2Uga25vdyBtb3JlXG5cdFx0XHR9IGVsc2UgaWYgKGNhcCAmIE1jcENhcGFiaWxpdHkuUmVzb3VyY2VzKSB7XG5cdFx0XHRcdGVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZW5hYmxlZDtcblx0fSk7XG5cblx0cHVibGljIGV4cGxpY2l0U2VydmVycz86IElNY3BTZXJ2ZXJbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U6IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGUgdG8gYSByZXNvdXJjZSBpZiBpdCdzIGEgZGlyZWN0b3J5LlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIHJlc291cmNlIGlzIGEgZGlyZWN0b3J5IHdpdGggY2hpbGRyZW4gKG5hdmlnYXRpb24gc3VjY2VlZGVkKS5cblx0ICogUmV0dXJucyBmYWxzZSBpZiB0aGUgcmVzb3VyY2UgaXMgYSBsZWFmIGZpbGUgKG5vIG5hdmlnYXRpb24pLlxuXHQgKiBXaGVuIHJldHVybmluZyB0cnVlLCBzdGF0ZWZ1bGx5IHVwZGF0ZXMgdGhlIHBpY2tlciBzdGF0ZSB0byBkaXNwbGF5IGRpcmVjdG9yeSBjb250ZW50cy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBuYXZpZ2F0ZShyZXNvdXJjZTogSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUsIHNlcnZlcjogSU1jcFNlcnZlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChpc01jcFJlc291cmNlVGVtcGxhdGUocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gcmVzb3VyY2UudXJpO1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdCAmJiB0aGlzLl9pc0RpcmVjdG9yeVJlc291cmNlKHJlc291cmNlKSAmJiAoc3RhdC5jaGlsZHJlbj8ubGVuZ3RoID8/IDApID4gMCkge1xuXHRcdFx0Ly8gU2F2ZSBjdXJyZW50IHN0YXRlIHRvIHN0YWNrIGJlZm9yZSBuYXZpZ2F0aW5nXG5cdFx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2VzID0gdGhpcy5fcmVzb3VyY2VzLmdldCgpLnBpY2tzLmdldChzZXJ2ZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRSZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5hZGRDdXJyZW50TUNQUXVpY2tQaWNrSXRlbUxldmVsKHNlcnZlciwgY3VycmVudFJlc291cmNlcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgYWxsIHRoZSBjaGlsZHJlbiB0byBJTWNwUmVzb3VyY2Ugb2JqZWN0c1xuXHRcdFx0Y29uc3QgY2hpbGRSZXNvdXJjZXM6IElNY3BSZXNvdXJjZVtdID0gc3RhdC5jaGlsZHJlbiEubWFwKGNoaWxkID0+IHtcblx0XHRcdFx0Y29uc3QgbWNwVXJpID0gTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcihzZXJ2ZXIuZGVmaW5pdGlvbiwgY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dXJpOiBtY3BVcmksXG5cdFx0XHRcdFx0bWNwVXJpOiBjaGlsZC5yZXNvdXJjZS5wYXRoLFxuXHRcdFx0XHRcdG5hbWU6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0dGl0bGU6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHJlc291cmNlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2l6ZUluQnl0ZXM6IGNoaWxkLnNpemUsXG5cdFx0XHRcdFx0aWNvbnM6IE1jcEljb25zLmZyb21QYXJzZWQodW5kZWZpbmVkKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9pbkRpcmVjdG9yeS5zZXQoeyBzZXJ2ZXIsIHJlc291cmNlczogY2hpbGRSZXNvdXJjZXMgfSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgdG9BdHRhY2htZW50KHJlc291cmNlOiBJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZSwgc2VydmVyOiBJTWNwU2VydmVyKTogUHJvbWlzZTxDaGF0Q29udGV4dFBpY2tBdHRhY2htZW50PiB8ICdub29wJyB7XG5cdFx0Y29uc3Qgbm9vcCA9ICdub29wJztcblx0XHRpZiAodGhpcy5faXNEaXJlY3RvcnlSZXNvdXJjZShyZXNvdXJjZSkpIHtcblx0XHRcdC8vQ2hlY2sgaWYgZGlyZWN0b3J5XG5cdFx0XHR0aGlzLmNoZWNrSWZEaXJlY3RvcnlBbmRQb3B1bGF0ZShyZXNvdXJjZSwgc2VydmVyKTtcblx0XHRcdHJldHVybiBub29wO1xuXHRcdH1cblx0XHRpZiAoaXNNY3BSZXNvdXJjZVRlbXBsYXRlKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlVGVtcGxhdGVUb0F0dGFjaG1lbnQocmVzb3VyY2UpLnRoZW4odmFsID0+IHZhbCB8fCBub29wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlVG9BdHRhY2htZW50KHJlc291cmNlKS50aGVuKHZhbCA9PiB2YWwgfHwgbm9vcCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNoZWNrSWZEaXJlY3RvcnlBbmRQb3B1bGF0ZShyZXNvdXJjZTogSU1jcFJlc291cmNlIHwgSU1jcFJlc291cmNlVGVtcGxhdGUsIHNlcnZlcjogSU1jcFNlcnZlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gIWF3YWl0IHRoaXMubmF2aWdhdGUocmVzb3VyY2UsIHNlcnZlcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9VUkkocmVzb3VyY2U6IElNY3BSZXNvdXJjZSB8IElNY3BSZXNvdXJjZVRlbXBsYXRlKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoaXNNY3BSZXNvdXJjZVRlbXBsYXRlKHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgbWF5YmVVcmkgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVRlbXBsYXRlVG9VUkkocmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIG1heWJlVXJpICYmIGF3YWl0IHRoaXMuX3ZlcmlmeVVyaUlmTmVlZGVkKG1heWJlVXJpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLnVyaTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2hlY2tJZk5lc3RlZFJlc291cmNlcyA9ICgpID0+ICF0aGlzLl9waWNrSXRlbXNTdGFjay5pc0VtcHR5KCk7XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VUb0F0dGFjaG1lbnQocmVzb3VyY2U6IHsgdXJpOiBVUkk7IG5hbWU6IHN0cmluZzsgbWltZVR5cGU/OiBzdHJpbmcgfSk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFzSW1hZ2UgPSBhd2FpdCB0aGlzLl9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVJbWFnZUVkaXRvckF0dGFjaENvbnRleHQocmVzb3VyY2UudXJpLCB1bmRlZmluZWQsIHJlc291cmNlLm1pbWVUeXBlKTtcblx0XHRpZiAoYXNJbWFnZSkge1xuXHRcdFx0cmV0dXJuIGFzSW1hZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByZXNvdXJjZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdG5hbWU6IHJlc291cmNlLm5hbWUsXG5cdFx0XHR2YWx1ZTogcmVzb3VyY2UudXJpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZVRlbXBsYXRlVG9BdHRhY2htZW50KHJ0OiBJTWNwUmVzb3VyY2VUZW1wbGF0ZSkge1xuXHRcdGNvbnN0IG1heWJlVXJpID0gYXdhaXQgdGhpcy5fcmVzb3VyY2VUZW1wbGF0ZVRvVVJJKHJ0KTtcblx0XHRjb25zdCB1cmkgPSBtYXliZVVyaSAmJiBhd2FpdCB0aGlzLl92ZXJpZnlVcmlJZk5lZWRlZChtYXliZVVyaSk7XG5cdFx0cmV0dXJuIHVyaSAmJiB0aGlzLl9yZXNvdXJjZVRvQXR0YWNobWVudCh7XG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lOiBydC5uYW1lLFxuXHRcdFx0bWltZVR5cGU6IHJ0Lm1pbWVUeXBlLFxuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF92ZXJpZnlVcmlJZk5lZWRlZCh7IHVyaSwgbmVlZHNWZXJpZmljYXRpb24gfTogeyB1cmk6IFVSSTsgbmVlZHNWZXJpZmljYXRpb246IGJvb2xlYW4gfSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFuZWVkc1ZlcmlmaWNhdGlvbikge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHModXJpKTtcblx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnbWNwLnJlc291cmNlLnRlbXBsYXRlLm5vdEZvdW5kJywgXCJUaGUgcmVzb3VyY2UgezB9IHdhcyBub3QgZm91bmQuXCIsIE1jcFJlc291cmNlVVJJLnRvU2VydmVyKHVyaSkucmVzb3VyY2VVUkwudG9TdHJpbmcoKSkpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvdXJjZVRlbXBsYXRlVG9VUkkocnQ6IElNY3BSZXNvdXJjZVRlbXBsYXRlKSB7XG5cdFx0Y29uc3QgdG9kbyA9IHJ0LnRlbXBsYXRlLmNvbXBvbmVudHMuZmxhdE1hcChjID0+IHR5cGVvZiBjID09PSAnb2JqZWN0JyA/IGMudmFyaWFibGVzIDogW10pO1xuXG5cdFx0Y29uc3QgcXVpY2tJbnB1dCA9IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljaygpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgdmFyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10+ID0ge307XG5cdFx0cXVpY2tJbnB1dC50b3RhbFN0ZXBzID0gdG9kby5sZW5ndGg7XG5cdFx0cXVpY2tJbnB1dC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0bGV0IG5lZWRzVmVyaWZpY2F0aW9uID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2RvLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHZhcmlhYmxlID0gdG9kb1tpXTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9wcm9tcHRGb3JUZW1wbGF0ZVZhbHVlKHF1aWNrSW5wdXQsIHZhcmlhYmxlLCB2YXJzLCBydCk7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBtYXJrIHRoZSBVUkkgYXMgbmVlZGluZyB2ZXJpZmljYXRpb24gaWYgYW55IHBhcnQgd2FzIG5vdCBhIGNvbXBsZXRpb24gcGlja1xuXHRcdFx0XHRuZWVkc1ZlcmlmaWNhdGlvbiB8fD0gIXJlc29sdmVkLmNvbXBsZXRlZDtcblx0XHRcdFx0dmFyc1t0b2RvW2ldLm5hbWVdID0gdmFyaWFibGUucmVwZWF0YWJsZSA/IHJlc29sdmVkLnZhbHVlLnNwbGl0KCcvJykgOiByZXNvbHZlZC52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHVyaTogcnQucmVzb2x2ZVVSSSh2YXJzKSwgbmVlZHNWZXJpZmljYXRpb24gfTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRxdWlja0lucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wcm9tcHRGb3JUZW1wbGF0ZVZhbHVlKGlucHV0OiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPiwgdmFyaWFibGU6IElVcmlUZW1wbGF0ZVZhcmlhYmxlLCB2YXJpYWJsZXNTb0ZhcjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10+LCBydDogSU1jcFJlc291cmNlVGVtcGxhdGUpOiBQcm9taXNlPHsgdmFsdWU6IHN0cmluZzsgY29tcGxldGVkOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHN0cmluZ1tdPj4oW10pO1xuXG5cdFx0Y29uc3QgdmFyaWFibGVzV2l0aFBsYWNlaG9sZGVycyA9IHsgLi4udmFyaWFibGVzU29GYXIgfTtcblx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIHJ0LnRlbXBsYXRlLmNvbXBvbmVudHMuZmxhdE1hcChjID0+IHR5cGVvZiBjID09PSAnb2JqZWN0JyA/IGMudmFyaWFibGVzIDogW10pKSB7XG5cdFx0XHRpZiAoIXZhcmlhYmxlc1dpdGhQbGFjZWhvbGRlcnMuaGFzT3duUHJvcGVydHkodmFyaWFibGUubmFtZSkpIHtcblx0XHRcdFx0dmFyaWFibGVzV2l0aFBsYWNlaG9sZGVyc1t2YXJpYWJsZS5uYW1lXSA9IGAkJHt2YXJpYWJsZS5uYW1lLnRvVXBwZXJDYXNlKCl9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbWNwLnJlc291cmNlLnRlbXBsYXRlLnBsYWNlaG9sZGVyJywgXCJWYWx1ZSBmb3IgJHswfSBpbiB7MX1cIiwgdmFyaWFibGUubmFtZS50b1VwcGVyQ2FzZSgpLCBydC50ZW1wbGF0ZS5yZXNvbHZlKHZhcmlhYmxlc1dpdGhQbGFjZWhvbGRlcnMpLnJlcGxhY2VBbGwoJyUyNCcsICckJykpO1xuXHRcdGlmICh2YXJpYWJsZS5vcHRpb25hbCkge1xuXHRcdFx0cGxhY2Vob2xkZXIgKz0gJyAoJyArIGxvY2FsaXplKCdtY3AucmVzb3VyY2UudGVtcGxhdGUub3B0aW9uYWwnLCBcIk9wdGlvbmFsXCIpICsgJyknO1xuXHRcdH1cblxuXHRcdGlucHV0LnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0aW5wdXQudmFsdWUgPSAnJztcblx0XHRpbnB1dC5pdGVtcyA9IFtdO1xuXHRcdGlucHV0LnNob3coKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRJRCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHNldEl0ZW1zID0gKHZhbHVlOiBzdHJpbmcsIGNvbXBsZXRlZDogc3RyaW5nW10gPSBbXSkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBjb21wbGV0ZWQuZmlsdGVyKGMgPT4gYyAhPT0gdmFsdWUpLm1hcChjID0+ICh7IGlkOiBjLCBsYWJlbDogYyB9KSk7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0aXRlbXMudW5zaGlmdCh7IGlkOiBjdXJyZW50SUQsIGxhYmVsOiB2YWx1ZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAodmFyaWFibGUub3B0aW9uYWwpIHtcblx0XHRcdFx0aXRlbXMudW5zaGlmdCh7IGlkOiBjdXJyZW50SUQsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnJlc291cmNlLnRlbXBsYXRlLmVtcHR5JywgXCI8RW1wdHk+XCIpIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnB1dC5pdGVtcyA9IGl0ZW1zO1xuXHRcdH07XG5cblx0XHRsZXQgY2hhbmdlQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjaGFuZ2VDYW5jZWxsYXRpb24uZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0Y29uc3QgZ2V0Q29tcGxldGlvbkl0ZW1zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXRWYWx1ZSA9IGlucHV0LnZhbHVlO1xuXHRcdFx0bGV0IHByb21pc2UgPSBjb21wbGV0aW9ucy5nZXQoaW5wdXRWYWx1ZSk7XG5cdFx0XHRpZiAoIXByb21pc2UpIHtcblx0XHRcdFx0cHJvbWlzZSA9IHJ0LmNvbXBsZXRlKHZhcmlhYmxlLm5hbWUsIGlucHV0VmFsdWUsIHZhcmlhYmxlc1NvRmFyLCBjaGFuZ2VDYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdFx0XHRjb21wbGV0aW9ucy5zZXQoaW5wdXRWYWx1ZSwgcHJvbWlzZSk7XG5cdFx0XHR9XG5cblx0XHRcdHByb21pc2UudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRpZiAoIWNoYW5nZUNhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHNldEl0ZW1zKGlucHV0VmFsdWUsIHZhbHVlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKCgpID0+IHtcblx0XHRcdFx0Y29tcGxldGlvbnMuZGVsZXRlKGlucHV0VmFsdWUpO1xuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmICghY2hhbmdlQ2FuY2VsbGF0aW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0aW5wdXQuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0Q29tcGxldGlvbkl0ZW1zU2NoZWR1bGVyID0gc3RvcmUuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKGdldENvbXBsZXRpb25JdGVtcywgMzAwKSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8eyB2YWx1ZTogc3RyaW5nOyBjb21wbGV0ZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRIaWRlKCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSkpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGlucHV0LnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSBjdXJyZW50SUQpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgdmFsdWU6IGlucHV0LnZhbHVlLCBjb21wbGV0ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlLmV4cGxvZGFibGUgJiYgaXRlbS5sYWJlbC5lbmRzV2l0aCgnLycpICYmIGl0ZW0ubGFiZWwgIT09IGlucHV0LnZhbHVlKSB7XG5cdFx0XHRcdFx0Ly8gaWYgbmF2aWdhdGluZyBpbiBhIHBhdGggc3RydWN0dXJlLCBwaWNraW5nIGEgYC9gIHNob3VsZCBsZXQgdGhlIHVzZXIgcGljayBpbiBhIHN1YmRpcmVjdG9yeVxuXHRcdFx0XHRcdGlucHV0LnZhbHVlID0gaXRlbS5sYWJlbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHsgdmFsdWU6IGl0ZW0ubGFiZWwsIGNvbXBsZXRlZDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0XHRpbnB1dC5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0Y2hhbmdlQ2FuY2VsbGF0aW9uLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRcdGNoYW5nZUNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRnZXRDb21wbGV0aW9uSXRlbXNTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHNldEl0ZW1zKHZhbHVlKTtcblxuXHRcdFx0XHRpZiAoY29tcGxldGlvbnMuaGFzKGlucHV0LnZhbHVlKSkge1xuXHRcdFx0XHRcdGdldENvbXBsZXRpb25JdGVtcygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGdldENvbXBsZXRpb25JdGVtc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGdldENvbXBsZXRpb25JdGVtcygpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlyZWN0b3J5UmVzb3VyY2UocmVzb3VyY2U6IElNY3BSZXNvdXJjZSB8IElNY3BSZXNvdXJjZVRlbXBsYXRlKTogYm9vbGVhbiB7XG5cblx0XHRpZiAocmVzb3VyY2UubWltZVR5cGUgJiYgcmVzb3VyY2UubWltZVR5cGUgPT09ICdpbm9kZS9kaXJlY3RvcnknKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzTWNwUmVzb3VyY2VUZW1wbGF0ZShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZS50ZW1wbGF0ZS50ZW1wbGF0ZS5lbmRzV2l0aCgnLycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2UudXJpLnBhdGguZW5kc1dpdGgoJy8nKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0UGlja3ModG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IElPYnNlcnZhYmxlPHsgcGlja3M6IE1hcDxJTWNwU2VydmVyLCAoSU1jcFJlc291cmNlVGVtcGxhdGUgfCBJTWNwUmVzb3VyY2UpW10+OyBpc0J1c3k6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0bGV0IGlzQnVzeUxvYWRpbmdQaWNrcyA9IHRydWU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0Ly8gV2UgdHJ5IHRvIHNob3cgZXZlcnl0aGluZyBpbi1zZXF1ZW5jZSB0byBhdm9pZCBmbGlja2VyaW5nICgjMjUwNDExKSBhcyBsb25nIGFzXG5cdFx0Ly8gaXQgbG9hZHMgd2l0aGluIDUgc2Vjb25kcy4gT3RoZXJ3aXNlIHdlIGp1c3Qgc2hvdyB0aGluZ3MgYXMgdGhlIGxvYWQgaW4gcGFyYWxsZWwuXG5cdFx0bGV0IHNob3dJblNlcXVlbmNlID0gdHJ1ZTtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRzaG93SW5TZXF1ZW5jZSA9IGZhbHNlO1xuXHRcdFx0cHVibGlzaCgpO1xuXHRcdH0sIDVfMDAwKSk7XG5cblx0XHRjb25zdCBwdWJsaXNoID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gbmV3IE1hcDxJTWNwU2VydmVyLCAoSU1jcFJlc291cmNlVGVtcGxhdGUgfCBJTWNwUmVzb3VyY2UpW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IFtzZXJ2ZXIsIHJlY10gb2Ygc2VydmVycykge1xuXHRcdFx0XHRjb25zdCByOiAoSU1jcFJlc291cmNlVGVtcGxhdGUgfCBJTWNwUmVzb3VyY2UpW10gPSBbXTtcblx0XHRcdFx0b3V0cHV0LnNldChzZXJ2ZXIsIHIpO1xuXHRcdFx0XHRpZiAocmVjLnRlbXBsYXRlcy5pc1Jlc29sdmVkKSB7XG5cdFx0XHRcdFx0ci5wdXNoKC4uLnJlYy50ZW1wbGF0ZXMudmFsdWUhKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzaG93SW5TZXF1ZW5jZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ci5wdXNoKC4uLnJlYy5yZXNvdXJjZXNTb0Zhcik7XG5cdFx0XHRcdGlmICghcmVjLnJlc291cmNlcy5pc1NldHRsZWQgJiYgc2hvd0luU2VxdWVuY2UpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVzb3VyY2VzLnNldCh7IHBpY2tzOiBvdXRwdXQsIGlzQnVzeTogaXNCdXN5TG9hZGluZ1BpY2tzIH0sIHVuZGVmaW5lZCk7XG5cdFx0fTtcblxuXHRcdHR5cGUgUmVjID0geyB0ZW1wbGF0ZXM6IERlZmVycmVkUHJvbWlzZTxJTWNwUmVzb3VyY2VUZW1wbGF0ZVtdPjsgcmVzb3VyY2VzU29GYXI6IElNY3BSZXNvdXJjZVtdOyByZXNvdXJjZXM6IERlZmVycmVkUHJvbWlzZTx1bmtub3duPiB9O1xuXG5cdFx0Y29uc3Qgc2VydmVycyA9IG5ldyBNYXA8SU1jcFNlcnZlciwgUmVjPigpO1xuXHRcdC8vIEVudW1lcmF0ZSBzZXJ2ZXJzIGFuZCBzdGFydCBzZXJ2ZXJzIHRoYXQgbmVlZCB0byBiZSBzdGFydGVkIHRvIGdldCBjYXBhYmlsaXRpZXNcblx0XHRQcm9taXNlLmFsbCgodGhpcy5leHBsaWNpdFNlcnZlcnMgfHwgdGhpcy5fbWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpKS5tYXAoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGxldCBjYXAgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLmdldCgpO1xuXHRcdFx0Y29uc3QgcmVjOiBSZWMgPSB7XG5cdFx0XHRcdHRlbXBsYXRlczogbmV3IERlZmVycmVkUHJvbWlzZSgpLFxuXHRcdFx0XHRyZXNvdXJjZXNTb0ZhcjogW10sXG5cdFx0XHRcdHJlc291cmNlczogbmV3IERlZmVycmVkUHJvbWlzZSgpLFxuXHRcdFx0fTtcblx0XHRcdHNlcnZlcnMuc2V0KHNlcnZlciwgcmVjKTsgLy8gYWx3YXlzIGFkZCBpdCB0byByZXRhaW4gb3JkZXJcblxuXHRcdFx0aWYgKGNhcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNhcCA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdHNlcnZlci5zdGFydCgpLnRoZW4oc3RhdGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciB8fCBzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhcDIgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGlmIChjYXAyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShjYXAyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2FwICYmIChjYXAgJiBNY3BDYXBhYmlsaXR5LlJlc291cmNlcykpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHJlYy50ZW1wbGF0ZXMuc2V0dGxlV2l0aChzZXJ2ZXIucmVzb3VyY2VUZW1wbGF0ZXMoY3RzLnRva2VuKS5jYXRjaCgoKSA9PiBbXSkpLmZpbmFsbHkocHVibGlzaCksXG5cdFx0XHRcdFx0cmVjLnJlc291cmNlcy5zZXR0bGVXaXRoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHBhZ2Ugb2Ygc2VydmVyLnJlc291cmNlcyhjdHMudG9rZW4pKSB7XG5cdFx0XHRcdFx0XHRcdHJlYy5yZXNvdXJjZXNTb0ZhciA9IHJlYy5yZXNvdXJjZXNTb0Zhci5jb25jYXQocGFnZSk7XG5cdFx0XHRcdFx0XHRcdHB1Ymxpc2goKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSgpKVxuXHRcdFx0XHRdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlYy50ZW1wbGF0ZXMuY29tcGxldGUoW10pO1xuXHRcdFx0XHRyZWMucmVzb3VyY2VzLmNvbXBsZXRlKFtdKTtcblx0XHRcdH1cblx0XHR9KSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpc0J1c3lMb2FkaW5nUGlja3MgPSBmYWxzZTtcblx0XHRcdHB1Ymxpc2goKTtcblx0XHR9KTtcblxuXHRcdC8vIFVzZSBkZXJpdmVkIHRvIGNvbXB1dGUgdGhlIGFwcHJvcHJpYXRlIHJlc291cmNlIG1hcCBiYXNlZCBvbiBkaXJlY3RvcnkgbmF2aWdhdGlvbiBzdGF0ZVxuXHRcdHJldHVybiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnlSZXNvdXJjZSA9IHRoaXMuX2luRGlyZWN0b3J5LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBkaXJlY3RvcnlSZXNvdXJjZVxuXHRcdFx0XHQ/IHsgcGlja3M6IG5ldyBNYXAoW1tkaXJlY3RvcnlSZXNvdXJjZS5zZXJ2ZXIsIGRpcmVjdG9yeVJlc291cmNlLnJlc291cmNlc11dKSwgaXNCdXN5OiBmYWxzZSB9XG5cdFx0XHRcdDogdGhpcy5fcmVzb3VyY2VzLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNY3BSZXNvdXJjZUFjY2Vzc1BpY2sge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zY29wZVRvOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVRvUGljayhwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKSB7XG5cdFx0cGlja2VyLmNhbkFjY2VwdEluQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdHBpY2tlci5rZWVwU2Nyb2xsUG9zaXRpb24gPSB0cnVlO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGdvQmFja0lkID0gJ19nb2JhY2tfJztcblxuXHRcdHR5cGUgUmVzb3VyY2VRdWlja1BpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IHJlc291cmNlOiBJTWNwUmVzb3VyY2UgfCBJTWNwUmVzb3VyY2VUZW1wbGF0ZTsgc2VydmVyOiBJTWNwU2VydmVyIH07XG5cblx0XHRjb25zdCBhdHRhY2hCdXR0b24gPSBsb2NhbGl6ZSgnbWNwLnF1aWNrYWNjZXNzLmF0dGFjaCcsIFwiQXR0YWNoIHRvIGNoYXRcIik7XG5cblx0XHRjb25zdCBoZWxwZXIgPSBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwUmVzb3VyY2VQaWNrSGVscGVyKSk7XG5cdFx0aWYgKHRoaXMuX3Njb3BlVG8pIHtcblx0XHRcdGhlbHBlci5leHBsaWNpdFNlcnZlcnMgPSBbdGhpcy5fc2NvcGVUb107XG5cdFx0fVxuXHRcdGNvbnN0IHBpY2tzT2JzZXJ2YWJsZSA9IGhlbHBlci5nZXRQaWNrcyh0b2tlbik7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBpY2tJdGVtcyA9IHBpY2tzT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0J1c3kgPSBwaWNrSXRlbXMuaXNCdXN5O1xuXHRcdFx0Y29uc3QgaXRlbXM6IChSZXNvdXJjZVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgSVF1aWNrUGlja0l0ZW0pW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgW3NlcnZlciwgcmVzb3VyY2VzXSBvZiBwaWNrSXRlbXMucGlja3MpIHtcblx0XHRcdFx0aXRlbXMucHVzaChNY3BSZXNvdXJjZVBpY2tIZWxwZXIuc2VwKHNlcnZlcikpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2tJdGVtID0gTWNwUmVzb3VyY2VQaWNrSGVscGVyLml0ZW0ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdHBpY2tJdGVtLmJ1dHRvbnMgPSBbeyBpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmF0dGFjaCksIHRvb2x0aXA6IGF0dGFjaEJ1dHRvbiB9XTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgLi4ucGlja0l0ZW0sIHJlc291cmNlLCBzZXJ2ZXIgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChoZWxwZXIuY2hlY2tJZk5lc3RlZFJlc291cmNlcygpKSB7XG5cdFx0XHRcdC8vIEFkZCBnbyBiYWNrIGl0ZW1cblx0XHRcdFx0Y29uc3QgZ29CYWNrSXRlbTogSVF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0XHRcdFx0aWQ6IGdvQmFja0lkLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ29CYWNrJywgJ0dvIGJhY2sgXHUyMUE5JyksXG5cdFx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpdGVtcy5wdXNoKGdvQmFja0l0ZW0pO1xuXHRcdFx0fVxuXHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IGlzQnVzeTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmJ1dHRvbi50b29sdGlwID09PSBhdHRhY2hCdXR0b24pIHtcblx0XHRcdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZUl0ZW0gPSBldmVudC5pdGVtIGFzIFJlc291cmNlUXVpY2tQaWNrSXRlbTtcblx0XHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IGhlbHBlci50b0F0dGFjaG1lbnQocmVzb3VyY2VJdGVtLnJlc291cmNlLCByZXNvdXJjZUl0ZW0uc2VydmVyKTtcblx0XHRcdFx0aWYgKGF0dGFjaG1lbnQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRcdFx0YXR0YWNobWVudC50aGVuKGFzeW5jIGEgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGEgIT09ICdub29wJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBvcGVuUGFuZWxDaGF0QW5kR2V0V2lkZ2V0KHRoaXMuX3ZpZXdzU2VydmljZSwgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHR3aWRnZXQ/LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmFzQXJyYXkoYSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdGhlbHBlci5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEFjY2VwdChhc3luYyBldmVudCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IFtpdGVtXSA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIGdvIGJhY2sgaXRlbSB3YXMgc2VsZWN0ZWRcblx0XHRcdFx0aWYgKGl0ZW0uaWQgPT09IGdvQmFja0lkKSB7XG5cdFx0XHRcdFx0aGVscGVyLm5hdmlnYXRlQmFjaygpO1xuXHRcdFx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VJdGVtID0gaXRlbSBhcyBSZXNvdXJjZVF1aWNrUGlja0l0ZW07XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VJdGVtLnJlc291cmNlO1xuXHRcdFx0XHQvLyBUcnkgdG8gbmF2aWdhdGUgaW50byB0aGUgcmVzb3VyY2UgaWYgaXQncyBhIGRpcmVjdG9yeVxuXHRcdFx0XHRjb25zdCBpc05lc3RlZCA9IGF3YWl0IGhlbHBlci5uYXZpZ2F0ZShyZXNvdXJjZSwgcmVzb3VyY2VJdGVtLnNlcnZlcik7XG5cdFx0XHRcdGlmICghaXNOZXN0ZWQpIHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSBhd2FpdCBoZWxwZXIudG9VUkkocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdXJpLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IGV2ZW50LmluQmFja2dyb3VuZCB9IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BSZXNvdXJjZVF1aWNrUGljayBleHRlbmRzIEFic3RyYWN0TWNwUmVzb3VyY2VBY2Nlc3NQaWNrIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0c2NvcGVUbzogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihzY29wZVRvLCBpbnN0YW50aWF0aW9uU2VydmljZSwgZWRpdG9yU2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIHZpZXdzU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcGljayh0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxcCA9IHN0b3JlLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRxcC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtY3AucXVpY2thY2Nlc3MucGxhY2Vob2xkZXInLCBcIlNlYXJjaCBmb3IgcmVzb3VyY2VzXCIpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLmFwcGx5VG9QaWNrKHFwLCB0b2tlbikpO1xuXHRcdHN0b3JlLmFkZChxcC5vbkRpZEhpZGUoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKSk7XG5cdFx0cXAuc2hvdygpO1xuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShxcC5vbkRpZEhpZGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BSZXNvdXJjZVF1aWNrQWNjZXNzIGV4dGVuZHMgQWJzdHJhY3RNY3BSZXNvdXJjZUFjY2Vzc1BpY2sgaW1wbGVtZW50cyBJUXVpY2tBY2Nlc3NQcm92aWRlciB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgUFJFRklYID0gJ21jcHIgJztcblxuXHRkZWZhdWx0RmlsdGVyVmFsdWUgPSBEZWZhdWx0UXVpY2tBY2Nlc3NGaWx0ZXJWYWx1ZS5MQVNUO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgdmlld3NTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3ZpZGUocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5hcHBseVRvUGljayhwaWNrZXIsIHRva2VuLCBydW5PcHRpb25zKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixtQkFBbUIsd0JBQXdCO0FBQ3JFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQThCLGNBQWMsa0JBQWtCO0FBQ3ZFLFNBQVMsU0FBUyxTQUFTLHVCQUFvQztBQUMvRCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLG9CQUFvQjtBQUM3QixT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
