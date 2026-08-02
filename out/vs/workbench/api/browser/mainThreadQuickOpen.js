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
import { Lazy } from "../../../base/common/lazy.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { basenameOrAuthority, dirname, hasTrailingPathSeparator } from "../../../base/common/resources.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { ICustomEditorLabelService } from "../../services/editor/common/customEditorLabelService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadQuickOpen = class {
  constructor(extHostContext, quickInputService, labelService, customEditorLabelService, modelService, languageService) {
    this.labelService = labelService;
    this.customEditorLabelService = customEditorLabelService;
    this.modelService = modelService;
    this.languageService = languageService;
    this._items = {};
    // ---- QuickInput
    this.sessions = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickOpen);
    this._quickInputService = quickInputService;
  }
  dispose() {
    for (const [_id, session] of this.sessions) {
      session.store.dispose();
    }
  }
  $show(instance, options, token) {
    const contents = new Promise((resolve, reject) => {
      this._items[instance] = { resolve, reject };
    });
    options = {
      ...options,
      onDidFocus: (el) => {
        if (el) {
          this._proxy.$onItemSelected(el.handle);
        }
      }
    };
    if (options.canPickMany) {
      return this._quickInputService.pick(contents, options, token).then((items) => {
        if (items) {
          return items.map((item) => item.handle);
        }
        return void 0;
      });
    } else {
      return this._quickInputService.pick(contents, options, token).then((item) => {
        if (item) {
          return item.handle;
        }
        return void 0;
      });
    }
  }
  $setItems(instance, items) {
    if (this._items[instance]) {
      items.forEach((item) => this.expandItemProps(item));
      this._items[instance].resolve(items);
      delete this._items[instance];
    }
    return Promise.resolve();
  }
  $setError(instance, error) {
    if (this._items[instance]) {
      this._items[instance].reject(error);
      delete this._items[instance];
    }
    return Promise.resolve();
  }
  // ---- input
  $input(options, validateInput, token) {
    const inputOptions = /* @__PURE__ */ Object.create(null);
    if (options) {
      inputOptions.title = options.title;
      inputOptions.password = options.password;
      inputOptions.placeHolder = options.placeHolder;
      inputOptions.valueSelection = options.valueSelection;
      inputOptions.prompt = options.prompt;
      inputOptions.value = options.value;
      inputOptions.ignoreFocusLost = options.ignoreFocusOut;
    }
    if (validateInput) {
      inputOptions.validateInput = (value) => {
        return this._proxy.$validateInput(value);
      };
    }
    return this._quickInputService.input(inputOptions, token);
  }
  $createOrUpdate(params) {
    const sessionId = params.id;
    let session = this.sessions.get(sessionId);
    if (!session) {
      const store = new DisposableStore();
      const input2 = params.type === "quickPick" ? this._quickInputService.createQuickPick() : this._quickInputService.createInputBox();
      store.add(input2);
      store.add(input2.onDidAccept(() => {
        this._proxy.$onDidAccept(sessionId);
      }));
      store.add(input2.onDidTriggerButton((button) => {
        this._proxy.$onDidTriggerButton(sessionId, button.handle, button.toggle?.checked);
      }));
      store.add(input2.onDidChangeValue((value) => {
        this._proxy.$onDidChangeValue(sessionId, value);
      }));
      store.add(input2.onDidHide(() => {
        this._proxy.$onDidHide(sessionId);
      }));
      if (params.type === "quickPick") {
        const quickPick2 = input2;
        store.add(quickPick2.onDidChangeActive((items) => {
          this._proxy.$onDidChangeActive(sessionId, items.map((item) => item.handle));
        }));
        store.add(quickPick2.onDidChangeSelection((items) => {
          this._proxy.$onDidChangeSelection(sessionId, items.map((item) => item.handle));
        }));
        store.add(quickPick2.onDidTriggerItemButton((e) => {
          const transferButton = e.button;
          this._proxy.$onDidTriggerItemButton(
            sessionId,
            e.item.handle,
            transferButton.handle,
            transferButton.toggle?.checked
          );
        }));
      }
      session = {
        input: input2,
        handlesToItems: /* @__PURE__ */ new Map(),
        store
      };
      this.sessions.set(sessionId, session);
    }
    const { input, handlesToItems } = session;
    const quickPick = input;
    for (const param in params) {
      switch (param) {
        case "id":
        case "type":
          continue;
        case "visible":
          if (params.visible) {
            input.show();
          } else {
            input.hide();
          }
          break;
        case "items": {
          handlesToItems.clear();
          params.items?.forEach((item) => {
            this.expandItemProps(item);
            if (item.type !== "separator") {
              item.buttons?.forEach((button) => this.expandIconPath(button));
              handlesToItems.set(item.handle, item);
            }
          });
          quickPick.items = params.items;
          break;
        }
        case "activeItems":
          quickPick.activeItems = params.activeItems?.map((handle) => handlesToItems.get(handle)).filter(Boolean);
          break;
        case "selectedItems":
          quickPick.selectedItems = params.selectedItems?.map((handle) => handlesToItems.get(handle)).filter(Boolean);
          break;
        case "buttons": {
          const buttons = [];
          for (const button of params.buttons) {
            if (button.handle === -1) {
              buttons.push(this._quickInputService.backButton);
            } else {
              this.expandIconPath(button);
              buttons.push(button);
            }
          }
          input.buttons = buttons;
          break;
        }
        default:
          input[param] = params[param];
          break;
      }
    }
    return Promise.resolve(void 0);
  }
  $dispose(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.store.dispose();
      this.sessions.delete(sessionId);
    }
    return Promise.resolve(void 0);
  }
  /**
  * Derives icon, label and description for Quick Pick items that represent a resource URI.
  */
  expandItemProps(item) {
    if (item.type === "separator") {
      return;
    }
    if (!item.resourceUri) {
      this.expandIconPath(item);
      return;
    }
    const resourceUri = URI.from(item.resourceUri);
    item.label ??= this.customEditorLabelService.getName(resourceUri) || "";
    if (item.label) {
      item.description ??= this.labelService.getUriLabel(resourceUri, { relative: true });
    } else {
      item.label = basenameOrAuthority(resourceUri);
      item.description ??= this.labelService.getUriLabel(dirname(resourceUri), { relative: true });
    }
    const icon = item.iconPathDto;
    if (ThemeIcon.isThemeIcon(icon) && (ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon))) {
      const fileKind = ThemeIcon.isFolder(icon) || hasTrailingPathSeparator(resourceUri) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = new Lazy(() => getIconClasses(this.modelService, this.languageService, resourceUri, fileKind));
      Object.defineProperty(item, "iconClasses", { get: () => iconClasses.value });
    } else {
      this.expandIconPath(item);
    }
  }
  /**
  * Converts IconPath DTO into iconPath/iconClass properties.
  */
  expandIconPath(target) {
    const icon = target.iconPathDto;
    if (!icon) {
      return;
    } else if (ThemeIcon.isThemeIcon(icon)) {
      target.iconClass = ThemeIcon.asClassName(icon);
    } else if (isUriComponents(icon)) {
      const uri = URI.from(icon);
      target.iconPath = { dark: uri, light: uri };
    } else {
      const { dark, light } = icon;
      target.iconPath = { dark: URI.from(dark), light: URI.from(light) };
    }
  }
};
MainThreadQuickOpen = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadQuickOpen),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, ICustomEditorLabelService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ILanguageService)
], MainThreadQuickOpen);
export {
  MainThreadQuickOpen
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkUXVpY2tPcGVuLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lT3JBdXRob3JpdHksIGRpcm5hbWUsIGhhc1RyYWlsaW5nUGF0aFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElJbnB1dE9wdGlvbnMsIElQaWNrT3B0aW9ucywgSVF1aWNrSW5wdXQsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2N1c3RvbUVkaXRvckxhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdFF1aWNrT3BlblNoYXBlLCBJSW5wdXRCb3hPcHRpb25zLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFF1aWNrT3BlblNoYXBlLCBUcmFuc2ZlclF1aWNrSW5wdXQsIFRyYW5zZmVyUXVpY2tJbnB1dEJ1dHRvbiwgVHJhbnNmZXJRdWlja1BpY2tJdGVtLCBUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvciB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuaW50ZXJmYWNlIFF1aWNrSW5wdXRTZXNzaW9uIHtcblx0aW5wdXQ6IElRdWlja0lucHV0O1xuXHRoYW5kbGVzVG9JdGVtczogTWFwPG51bWJlciwgVHJhbnNmZXJRdWlja1BpY2tJdGVtPjtcblx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRRdWlja09wZW4pXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFF1aWNrT3BlbiBpbXBsZW1lbnRzIE1haW5UaHJlYWRRdWlja09wZW5TaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RRdWlja09wZW5TaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbXM6IFJlY29yZDxudW1iZXIsIHtcblx0XHRyZXNvbHZlKGl0ZW1zOiBUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvcltdKTogdm9pZDtcblx0XHRyZWplY3QoZXJyb3I6IEVycm9yKTogdm9pZDtcblx0fT4gPSB7fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbUVkaXRvckxhYmVsU2VydmljZTogSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RRdWlja09wZW4pO1xuXHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlID0gcXVpY2tJbnB1dFNlcnZpY2U7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtfaWQsIHNlc3Npb25dIG9mIHRoaXMuc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdCRzaG93KGluc3RhbmNlOiBudW1iZXIsIG9wdGlvbnM6IElQaWNrT3B0aW9uczxUcmFuc2ZlclF1aWNrUGlja0l0ZW0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPG51bWJlciB8IG51bWJlcltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBuZXcgUHJvbWlzZTxUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvcltdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl9pdGVtc1tpbnN0YW5jZV0gPSB7IHJlc29sdmUsIHJlamVjdCB9O1xuXHRcdH0pO1xuXG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRvbkRpZEZvY3VzOiBlbCA9PiB7XG5cdFx0XHRcdGlmIChlbCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkl0ZW1TZWxlY3RlZChlbC5oYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChvcHRpb25zLmNhblBpY2tNYW55KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhjb250ZW50cywgb3B0aW9ucyBhcyB7IGNhblBpY2tNYW55OiB0cnVlIH0sIHRva2VuKS50aGVuKGl0ZW1zID0+IHtcblx0XHRcdFx0aWYgKGl0ZW1zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IGl0ZW0uaGFuZGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGNvbnRlbnRzLCBvcHRpb25zLCB0b2tlbikudGhlbihpdGVtID0+IHtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbS5oYW5kbGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdCRzZXRJdGVtcyhpbnN0YW5jZTogbnVtYmVyLCBpdGVtczogVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3JbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pdGVtc1tpbnN0YW5jZV0pIHtcblx0XHRcdGl0ZW1zLmZvckVhY2goaXRlbSA9PiB0aGlzLmV4cGFuZEl0ZW1Qcm9wcyhpdGVtKSk7XG5cdFx0XHR0aGlzLl9pdGVtc1tpbnN0YW5jZV0ucmVzb2x2ZShpdGVtcyk7XG5cdFx0XHRkZWxldGUgdGhpcy5faXRlbXNbaW5zdGFuY2VdO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHQkc2V0RXJyb3IoaW5zdGFuY2U6IG51bWJlciwgZXJyb3I6IEVycm9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2l0ZW1zW2luc3RhbmNlXSkge1xuXHRcdFx0dGhpcy5faXRlbXNbaW5zdGFuY2VdLnJlamVjdChlcnJvcik7XG5cdFx0XHRkZWxldGUgdGhpcy5faXRlbXNbaW5zdGFuY2VdO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHQvLyAtLS0tIGlucHV0XG5cblx0JGlucHV0KG9wdGlvbnM6IElJbnB1dEJveE9wdGlvbnMgfCB1bmRlZmluZWQsIHZhbGlkYXRlSW5wdXQ6IGJvb2xlYW4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaW5wdXRPcHRpb25zOiBJSW5wdXRPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRpbnB1dE9wdGlvbnMudGl0bGUgPSBvcHRpb25zLnRpdGxlO1xuXHRcdFx0aW5wdXRPcHRpb25zLnBhc3N3b3JkID0gb3B0aW9ucy5wYXNzd29yZDtcblx0XHRcdGlucHV0T3B0aW9ucy5wbGFjZUhvbGRlciA9IG9wdGlvbnMucGxhY2VIb2xkZXI7XG5cdFx0XHRpbnB1dE9wdGlvbnMudmFsdWVTZWxlY3Rpb24gPSBvcHRpb25zLnZhbHVlU2VsZWN0aW9uO1xuXHRcdFx0aW5wdXRPcHRpb25zLnByb21wdCA9IG9wdGlvbnMucHJvbXB0O1xuXHRcdFx0aW5wdXRPcHRpb25zLnZhbHVlID0gb3B0aW9ucy52YWx1ZTtcblx0XHRcdGlucHV0T3B0aW9ucy5pZ25vcmVGb2N1c0xvc3QgPSBvcHRpb25zLmlnbm9yZUZvY3VzT3V0O1xuXHRcdH1cblxuXHRcdGlmICh2YWxpZGF0ZUlucHV0KSB7XG5cdFx0XHRpbnB1dE9wdGlvbnMudmFsaWRhdGVJbnB1dCA9ICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHZhbGlkYXRlSW5wdXQodmFsdWUpO1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoaW5wdXRPcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0tIFF1aWNrSW5wdXRcblxuXHRwcml2YXRlIHNlc3Npb25zID0gbmV3IE1hcDxudW1iZXIsIFF1aWNrSW5wdXRTZXNzaW9uPigpO1xuXG5cdCRjcmVhdGVPclVwZGF0ZShwYXJhbXM6IFRyYW5zZmVyUXVpY2tJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHBhcmFtcy5pZDtcblx0XHRsZXQgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gcGFyYW1zLnR5cGUgPT09ICdxdWlja1BpY2snID8gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkgOiB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0KTtcblx0XHRcdHN0b3JlLmFkZChpbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZEFjY2VwdChzZXNzaW9uSWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0Lm9uRGlkVHJpZ2dlckJ1dHRvbihidXR0b24gPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRUcmlnZ2VyQnV0dG9uKHNlc3Npb25JZCwgKGJ1dHRvbiBhcyBUcmFuc2ZlclF1aWNrSW5wdXRCdXR0b24pLmhhbmRsZSwgYnV0dG9uLnRvZ2dsZT8uY2hlY2tlZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVZhbHVlKHNlc3Npb25JZCwgdmFsdWUpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGlucHV0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZEhpZGUoc2Vzc2lvbklkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHBhcmFtcy50eXBlID09PSAncXVpY2tQaWNrJykge1xuXHRcdFx0XHQvLyBBZGQgZXh0cmEgZXZlbnRzIHNwZWNpZmljIGZvciBxdWljayBwaWNrXG5cdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IGlucHV0IGFzIElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+O1xuXHRcdFx0XHRzdG9yZS5hZGQocXVpY2tQaWNrLm9uRGlkQ2hhbmdlQWN0aXZlKGl0ZW1zID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VBY3RpdmUoc2Vzc2lvbklkLCBpdGVtcy5tYXAoaXRlbSA9PiAoaXRlbSBhcyBUcmFuc2ZlclF1aWNrUGlja0l0ZW0pLmhhbmRsZSkpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHN0b3JlLmFkZChxdWlja1BpY2sub25EaWRDaGFuZ2VTZWxlY3Rpb24oaXRlbXMgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVNlbGVjdGlvbihzZXNzaW9uSWQsIGl0ZW1zLm1hcChpdGVtID0+IChpdGVtIGFzIFRyYW5zZmVyUXVpY2tQaWNrSXRlbSkuaGFuZGxlKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0c3RvcmUuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKChlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdHJhbnNmZXJCdXR0b24gPSBlLmJ1dHRvbiBhcyBUcmFuc2ZlclF1aWNrSW5wdXRCdXR0b247XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oXG5cdFx0XHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdFx0XHQoZS5pdGVtIGFzIFRyYW5zZmVyUXVpY2tQaWNrSXRlbSkuaGFuZGxlLFxuXHRcdFx0XHRcdFx0dHJhbnNmZXJCdXR0b24uaGFuZGxlLFxuXHRcdFx0XHRcdFx0dHJhbnNmZXJCdXR0b24udG9nZ2xlPy5jaGVja2VkXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXNzaW9uID0ge1xuXHRcdFx0XHRpbnB1dCxcblx0XHRcdFx0aGFuZGxlc1RvSXRlbXM6IG5ldyBNYXAoKSxcblx0XHRcdFx0c3RvcmVcblx0XHRcdH07XG5cdFx0XHR0aGlzLnNlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaW5wdXQsIGhhbmRsZXNUb0l0ZW1zIH0gPSBzZXNzaW9uO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGlucHV0IGFzIElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+O1xuXHRcdGZvciAoY29uc3QgcGFyYW0gaW4gcGFyYW1zKSB7XG5cdFx0XHRzd2l0Y2ggKHBhcmFtKSB7XG5cdFx0XHRcdGNhc2UgJ2lkJzpcblx0XHRcdFx0Y2FzZSAndHlwZSc6XG5cdFx0XHRcdFx0Y29udGludWU7XG5cblx0XHRcdFx0Y2FzZSAndmlzaWJsZSc6XG5cdFx0XHRcdFx0aWYgKHBhcmFtcy52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRpbnB1dC5zaG93KCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlucHV0LmhpZGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSAnaXRlbXMnOiB7XG5cdFx0XHRcdFx0aGFuZGxlc1RvSXRlbXMuY2xlYXIoKTtcblx0XHRcdFx0XHRwYXJhbXMuaXRlbXM/LmZvckVhY2goKGl0ZW06IFRyYW5zZmVyUXVpY2tQaWNrSXRlbU9yU2VwYXJhdG9yKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmV4cGFuZEl0ZW1Qcm9wcyhpdGVtKTtcblx0XHRcdFx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uYnV0dG9ucz8uZm9yRWFjaChidXR0b24gPT4gdGhpcy5leHBhbmRJY29uUGF0aChidXR0b24pKTtcblx0XHRcdFx0XHRcdFx0aGFuZGxlc1RvSXRlbXMuc2V0KGl0ZW0uaGFuZGxlLCBpdGVtKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSBwYXJhbXMuaXRlbXM7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjYXNlICdhY3RpdmVJdGVtcyc6XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gcGFyYW1zLmFjdGl2ZUl0ZW1zXG5cdFx0XHRcdFx0XHQ/Lm1hcCgoaGFuZGxlOiBudW1iZXIpID0+IGhhbmRsZXNUb0l0ZW1zLmdldChoYW5kbGUpKVxuXHRcdFx0XHRcdFx0LmZpbHRlcihCb29sZWFuKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdzZWxlY3RlZEl0ZW1zJzpcblx0XHRcdFx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IHBhcmFtcy5zZWxlY3RlZEl0ZW1zXG5cdFx0XHRcdFx0XHQ/Lm1hcCgoaGFuZGxlOiBudW1iZXIpID0+IGhhbmRsZXNUb0l0ZW1zLmdldChoYW5kbGUpKVxuXHRcdFx0XHRcdFx0LmZpbHRlcihCb29sZWFuKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlICdidXR0b25zJzoge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGJ1dHRvbiBvZiBwYXJhbXMuYnV0dG9ucyEpIHtcblx0XHRcdFx0XHRcdGlmIChidXR0b24uaGFuZGxlID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b25zLnB1c2godGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmV4cGFuZEljb25QYXRoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbnMucHVzaChidXR0b24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpbnB1dC5idXR0b25zID0gYnV0dG9ucztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0KGlucHV0IGFzIGFueSlbcGFyYW1dID0gcGFyYW1zW3BhcmFtXTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0JGRpc3Bvc2Uoc2Vzc2lvbklkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbi5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0KiBEZXJpdmVzIGljb24sIGxhYmVsIGFuZCBkZXNjcmlwdGlvbiBmb3IgUXVpY2sgUGljayBpdGVtcyB0aGF0IHJlcHJlc2VudCBhIHJlc291cmNlIFVSSS5cblx0Ki9cblx0cHJpdmF0ZSBleHBhbmRJdGVtUHJvcHMoaXRlbTogVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3IpIHtcblx0XHRpZiAoaXRlbS50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXRlbS5yZXNvdXJjZVVyaSkge1xuXHRcdFx0dGhpcy5leHBhbmRJY29uUGF0aChpdGVtKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXJpdmUgbWlzc2luZyBsYWJlbCBhbmQgZGVzY3JpcHRpb24gZnJvbSByZXNvdXJjZVVyaS5cblx0XHRjb25zdCByZXNvdXJjZVVyaSA9IFVSSS5mcm9tKGl0ZW0ucmVzb3VyY2VVcmkpO1xuXHRcdGl0ZW0ubGFiZWwgPz89IHRoaXMuY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLmdldE5hbWUocmVzb3VyY2VVcmkpIHx8ICcnO1xuXHRcdGlmIChpdGVtLmxhYmVsKSB7XG5cdFx0XHRpdGVtLmRlc2NyaXB0aW9uID8/PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZVVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbS5sYWJlbCA9IGJhc2VuYW1lT3JBdXRob3JpdHkocmVzb3VyY2VVcmkpO1xuXHRcdFx0aXRlbS5kZXNjcmlwdGlvbiA/Pz0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShyZXNvdXJjZVVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVyaXZlIGljb24gcHJvcHMgZnJvbSByZXNvdXJjZVVyaSBpZiBpY29uIGlzIHNldCB0byBUaGVtZUljb24uRmlsZSBvciBUaGVtZUljb24uRm9sZGVyLlxuXHRcdGNvbnN0IGljb24gPSBpdGVtLmljb25QYXRoRHRvO1xuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikgJiYgKFRoZW1lSWNvbi5pc0ZpbGUoaWNvbikgfHwgVGhlbWVJY29uLmlzRm9sZGVyKGljb24pKSkge1xuXHRcdFx0Y29uc3QgZmlsZUtpbmQgPSBUaGVtZUljb24uaXNGb2xkZXIoaWNvbikgfHwgaGFzVHJhaWxpbmdQYXRoU2VwYXJhdG9yKHJlc291cmNlVXJpKSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEU7XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NlcyA9IG5ldyBMYXp5KCgpID0+IGdldEljb25DbGFzc2VzKHRoaXMubW9kZWxTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2VVcmksIGZpbGVLaW5kKSk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaXRlbSwgJ2ljb25DbGFzc2VzJywgeyBnZXQ6ICgpID0+IGljb25DbGFzc2VzLnZhbHVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4cGFuZEljb25QYXRoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQqIENvbnZlcnRzIEljb25QYXRoIERUTyBpbnRvIGljb25QYXRoL2ljb25DbGFzcyBwcm9wZXJ0aWVzLlxuXHQqL1xuXHRwcml2YXRlIGV4cGFuZEljb25QYXRoKHRhcmdldDogUGljazxUcmFuc2ZlclF1aWNrUGlja0l0ZW0sICdpY29uUGF0aER0bycgfCAnaWNvblBhdGgnIHwgJ2ljb25DbGFzcyc+KSB7XG5cdFx0Y29uc3QgaWNvbiA9IHRhcmdldC5pY29uUGF0aER0bztcblx0XHRpZiAoIWljb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0Ly8gVE9ETzogU2luY2UgSVF1aWNrUGlja0l0ZW0gYW5kIElRdWlja0lucHV0QnV0dG9uIGRvIG5vdCBzdXBwb3J0IFRoZW1lSWNvbiBkaXJlY3RseSwgdGhlIGNvbG9yIElEIGlzIGxvc3QgaGVyZS5cblx0XHRcdC8vIFdlIHNob3VsZCBjb25zaWRlciBjaGFuZ2luZyBjaGFuZ2luZyBpY29uUGF0aC9pY29uQ2xhc3MgdG8gSWNvblBhdGggaW4gYm90aCBpbnRlcmZhY2VzLlxuXHRcdFx0Ly8gUmVxdWVzdCBmb3IgY29sb3Igc3VwcG9ydDogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4NTM1Ni4uXG5cdFx0XHR0YXJnZXQuaWNvbkNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdH0gZWxzZSBpZiAoaXNVcmlDb21wb25lbnRzKGljb24pKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbShpY29uKTtcblx0XHRcdHRhcmdldC5pY29uUGF0aCA9IHsgZGFyazogdXJpLCBsaWdodDogdXJpIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHsgZGFyaywgbGlnaHQgfSA9IGljb247XG5cdFx0XHR0YXJnZXQuaWNvblBhdGggPSB7IGRhcms6IFVSSS5mcm9tKGRhcmspLCBsaWdodDogVVJJLmZyb20obGlnaHQpIH07XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsWUFBWTtBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQixTQUFTLGdDQUFnQztBQUN2RSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQixXQUFXO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1ELDBCQUFzRDtBQUN6RyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDRCQUE2QztBQUN0RCxTQUFTLGdCQUF5RCxtQkFBb0o7QUFTL00sSUFBTSxzQkFBTixNQUE4RDtBQUFBLEVBU3BFLFlBQ0MsZ0JBQ29CLG1CQUNZLGNBQ1ksMEJBQ1osY0FDRyxpQkFDbEM7QUFKK0I7QUFDWTtBQUNaO0FBQ0c7QUFYcEMsU0FBaUIsU0FHWixDQUFDO0FBOEZOO0FBQUEsU0FBUSxXQUFXLG9CQUFJLElBQStCO0FBcEZyRCxTQUFLLFNBQVMsZUFBZSxTQUFTLGVBQWUsZ0JBQWdCO0FBQ3JFLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVPLFVBQWdCO0FBQ3RCLGVBQVcsQ0FBQyxLQUFLLE9BQU8sS0FBSyxLQUFLLFVBQVU7QUFDM0MsY0FBUSxNQUFNLFFBQVE7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sVUFBa0IsU0FBOEMsT0FBa0U7QUFDdkksVUFBTSxXQUFXLElBQUksUUFBNEMsQ0FBQyxTQUFTLFdBQVc7QUFDckYsV0FBSyxPQUFPLFFBQVEsSUFBSSxFQUFFLFNBQVMsT0FBTztBQUFBLElBQzNDLENBQUM7QUFFRCxjQUFVO0FBQUEsTUFDVCxHQUFHO0FBQUEsTUFDSCxZQUFZLFFBQU07QUFDakIsWUFBSSxJQUFJO0FBQ1AsZUFBSyxPQUFPLGdCQUFnQixHQUFHLE1BQU07QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLGFBQWE7QUFDeEIsYUFBTyxLQUFLLG1CQUFtQixLQUFLLFVBQVUsU0FBa0MsS0FBSyxFQUFFLEtBQUssV0FBUztBQUNwRyxZQUFJLE9BQU87QUFDVixpQkFBTyxNQUFNLElBQUksVUFBUSxLQUFLLE1BQU07QUFBQSxRQUNyQztBQUNBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLE9BQU87QUFDTixhQUFPLEtBQUssbUJBQW1CLEtBQUssVUFBVSxTQUFTLEtBQUssRUFBRSxLQUFLLFVBQVE7QUFDMUUsWUFBSSxNQUFNO0FBQ1QsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFVBQVUsVUFBa0IsT0FBMEQ7QUFDckYsUUFBSSxLQUFLLE9BQU8sUUFBUSxHQUFHO0FBQzFCLFlBQU0sUUFBUSxVQUFRLEtBQUssZ0JBQWdCLElBQUksQ0FBQztBQUNoRCxXQUFLLE9BQU8sUUFBUSxFQUFFLFFBQVEsS0FBSztBQUNuQyxhQUFPLEtBQUssT0FBTyxRQUFRO0FBQUEsSUFDNUI7QUFDQSxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxVQUFVLFVBQWtCLE9BQTZCO0FBQ3hELFFBQUksS0FBSyxPQUFPLFFBQVEsR0FBRztBQUMxQixXQUFLLE9BQU8sUUFBUSxFQUFFLE9BQU8sS0FBSztBQUNsQyxhQUFPLEtBQUssT0FBTyxRQUFRO0FBQUEsSUFDNUI7QUFDQSxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUE7QUFBQSxFQUlBLE9BQU8sU0FBdUMsZUFBd0IsT0FBdUQ7QUFDNUgsVUFBTSxlQUE4Qix1QkFBTyxPQUFPLElBQUk7QUFFdEQsUUFBSSxTQUFTO0FBQ1osbUJBQWEsUUFBUSxRQUFRO0FBQzdCLG1CQUFhLFdBQVcsUUFBUTtBQUNoQyxtQkFBYSxjQUFjLFFBQVE7QUFDbkMsbUJBQWEsaUJBQWlCLFFBQVE7QUFDdEMsbUJBQWEsU0FBUyxRQUFRO0FBQzlCLG1CQUFhLFFBQVEsUUFBUTtBQUM3QixtQkFBYSxrQkFBa0IsUUFBUTtBQUFBLElBQ3hDO0FBRUEsUUFBSSxlQUFlO0FBQ2xCLG1CQUFhLGdCQUFnQixDQUFDLFVBQVU7QUFDdkMsZUFBTyxLQUFLLE9BQU8sZUFBZSxLQUFLO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixNQUFNLGNBQWMsS0FBSztBQUFBLEVBQ3pEO0FBQUEsRUFNQSxnQkFBZ0IsUUFBMkM7QUFDMUQsVUFBTSxZQUFZLE9BQU87QUFDekIsUUFBSSxVQUFVLEtBQUssU0FBUyxJQUFJLFNBQVM7QUFDekMsUUFBSSxDQUFDLFNBQVM7QUFDYixZQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsWUFBTUEsU0FBUSxPQUFPLFNBQVMsY0FBYyxLQUFLLG1CQUFtQixnQkFBZ0IsSUFBSSxLQUFLLG1CQUFtQixlQUFlO0FBQy9ILFlBQU0sSUFBSUEsTUFBSztBQUNmLFlBQU0sSUFBSUEsT0FBTSxZQUFZLE1BQU07QUFDakMsYUFBSyxPQUFPLGFBQWEsU0FBUztBQUFBLE1BQ25DLENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSUEsT0FBTSxtQkFBbUIsWUFBVTtBQUM1QyxhQUFLLE9BQU8sb0JBQW9CLFdBQVksT0FBb0MsUUFBUSxPQUFPLFFBQVEsT0FBTztBQUFBLE1BQy9HLENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSUEsT0FBTSxpQkFBaUIsV0FBUztBQUN6QyxhQUFLLE9BQU8sa0JBQWtCLFdBQVcsS0FBSztBQUFBLE1BQy9DLENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSUEsT0FBTSxVQUFVLE1BQU07QUFDL0IsYUFBSyxPQUFPLFdBQVcsU0FBUztBQUFBLE1BQ2pDLENBQUMsQ0FBQztBQUVGLFVBQUksT0FBTyxTQUFTLGFBQWE7QUFFaEMsY0FBTUMsYUFBWUQ7QUFDbEIsY0FBTSxJQUFJQyxXQUFVLGtCQUFrQixXQUFTO0FBQzlDLGVBQUssT0FBTyxtQkFBbUIsV0FBVyxNQUFNLElBQUksVUFBUyxLQUErQixNQUFNLENBQUM7QUFBQSxRQUNwRyxDQUFDLENBQUM7QUFDRixjQUFNLElBQUlBLFdBQVUscUJBQXFCLFdBQVM7QUFDakQsZUFBSyxPQUFPLHNCQUFzQixXQUFXLE1BQU0sSUFBSSxVQUFTLEtBQStCLE1BQU0sQ0FBQztBQUFBLFFBQ3ZHLENBQUMsQ0FBQztBQUNGLGNBQU0sSUFBSUEsV0FBVSx1QkFBdUIsQ0FBQyxNQUFNO0FBQ2pELGdCQUFNLGlCQUFpQixFQUFFO0FBQ3pCLGVBQUssT0FBTztBQUFBLFlBQ1g7QUFBQSxZQUNDLEVBQUUsS0FBK0I7QUFBQSxZQUNsQyxlQUFlO0FBQUEsWUFDZixlQUFlLFFBQVE7QUFBQSxVQUN4QjtBQUFBLFFBQ0QsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUVBLGdCQUFVO0FBQUEsUUFDVCxPQUFBRDtBQUFBLFFBQ0EsZ0JBQWdCLG9CQUFJLElBQUk7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFNBQVMsSUFBSSxXQUFXLE9BQU87QUFBQSxJQUNyQztBQUVBLFVBQU0sRUFBRSxPQUFPLGVBQWUsSUFBSTtBQUNsQyxVQUFNLFlBQVk7QUFDbEIsZUFBVyxTQUFTLFFBQVE7QUFDM0IsY0FBUSxPQUFPO0FBQUEsUUFDZCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQ0o7QUFBQSxRQUVELEtBQUs7QUFDSixjQUFJLE9BQU8sU0FBUztBQUNuQixrQkFBTSxLQUFLO0FBQUEsVUFDWixPQUFPO0FBQ04sa0JBQU0sS0FBSztBQUFBLFVBQ1o7QUFDQTtBQUFBLFFBRUQsS0FBSyxTQUFTO0FBQ2IseUJBQWUsTUFBTTtBQUNyQixpQkFBTyxPQUFPLFFBQVEsQ0FBQyxTQUEyQztBQUNqRSxpQkFBSyxnQkFBZ0IsSUFBSTtBQUN6QixnQkFBSSxLQUFLLFNBQVMsYUFBYTtBQUM5QixtQkFBSyxTQUFTLFFBQVEsWUFBVSxLQUFLLGVBQWUsTUFBTSxDQUFDO0FBQzNELDZCQUFlLElBQUksS0FBSyxRQUFRLElBQUk7QUFBQSxZQUNyQztBQUFBLFVBQ0QsQ0FBQztBQUNELG9CQUFVLFFBQVEsT0FBTztBQUN6QjtBQUFBLFFBQ0Q7QUFBQSxRQUVBLEtBQUs7QUFDSixvQkFBVSxjQUFjLE9BQU8sYUFDNUIsSUFBSSxDQUFDLFdBQW1CLGVBQWUsSUFBSSxNQUFNLENBQUMsRUFDbkQsT0FBTyxPQUFPO0FBQ2hCO0FBQUEsUUFFRCxLQUFLO0FBQ0osb0JBQVUsZ0JBQWdCLE9BQU8sZUFDOUIsSUFBSSxDQUFDLFdBQW1CLGVBQWUsSUFBSSxNQUFNLENBQUMsRUFDbkQsT0FBTyxPQUFPO0FBQ2hCO0FBQUEsUUFFRCxLQUFLLFdBQVc7QUFDZixnQkFBTSxVQUFVLENBQUM7QUFDakIscUJBQVcsVUFBVSxPQUFPLFNBQVU7QUFDckMsZ0JBQUksT0FBTyxXQUFXLElBQUk7QUFDekIsc0JBQVEsS0FBSyxLQUFLLG1CQUFtQixVQUFVO0FBQUEsWUFDaEQsT0FBTztBQUNOLG1CQUFLLGVBQWUsTUFBTTtBQUMxQixzQkFBUSxLQUFLLE1BQU07QUFBQSxZQUNwQjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxVQUFVO0FBQ2hCO0FBQUEsUUFDRDtBQUFBLFFBRUE7QUFFQyxVQUFDLE1BQWMsS0FBSyxJQUFJLE9BQU8sS0FBSztBQUNwQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsV0FBTyxRQUFRLFFBQVEsTUFBUztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxTQUFTLFdBQWtDO0FBQzFDLFVBQU0sVUFBVSxLQUFLLFNBQVMsSUFBSSxTQUFTO0FBQzNDLFFBQUksU0FBUztBQUNaLGNBQVEsTUFBTSxRQUFRO0FBQ3RCLFdBQUssU0FBUyxPQUFPLFNBQVM7QUFBQSxJQUMvQjtBQUNBLFdBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsZ0JBQWdCLE1BQXdDO0FBQy9ELFFBQUksS0FBSyxTQUFTLGFBQWE7QUFDOUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QixXQUFLLGVBQWUsSUFBSTtBQUN4QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGNBQWMsSUFBSSxLQUFLLEtBQUssV0FBVztBQUM3QyxTQUFLLFVBQVUsS0FBSyx5QkFBeUIsUUFBUSxXQUFXLEtBQUs7QUFDckUsUUFBSSxLQUFLLE9BQU87QUFDZixXQUFLLGdCQUFnQixLQUFLLGFBQWEsWUFBWSxhQUFhLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxJQUNuRixPQUFPO0FBQ04sV0FBSyxRQUFRLG9CQUFvQixXQUFXO0FBQzVDLFdBQUssZ0JBQWdCLEtBQUssYUFBYSxZQUFZLFFBQVEsV0FBVyxHQUFHLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxJQUM1RjtBQUdBLFVBQU0sT0FBTyxLQUFLO0FBQ2xCLFFBQUksVUFBVSxZQUFZLElBQUksTUFBTSxVQUFVLE9BQU8sSUFBSSxLQUFLLFVBQVUsU0FBUyxJQUFJLElBQUk7QUFDeEYsWUFBTSxXQUFXLFVBQVUsU0FBUyxJQUFJLEtBQUsseUJBQXlCLFdBQVcsSUFBSSxTQUFTLFNBQVMsU0FBUztBQUNoSCxZQUFNLGNBQWMsSUFBSSxLQUFLLE1BQU0sZUFBZSxLQUFLLGNBQWMsS0FBSyxpQkFBaUIsYUFBYSxRQUFRLENBQUM7QUFDakgsYUFBTyxlQUFlLE1BQU0sZUFBZSxFQUFFLEtBQUssTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUFBLElBQzVFLE9BQU87QUFDTixXQUFLLGVBQWUsSUFBSTtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsZUFBZSxRQUErRTtBQUNyRyxVQUFNLE9BQU8sT0FBTztBQUNwQixRQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsSUFDRCxXQUFXLFVBQVUsWUFBWSxJQUFJLEdBQUc7QUFJdkMsYUFBTyxZQUFZLFVBQVUsWUFBWSxJQUFJO0FBQUEsSUFDOUMsV0FBVyxnQkFBZ0IsSUFBSSxHQUFHO0FBQ2pDLFlBQU0sTUFBTSxJQUFJLEtBQUssSUFBSTtBQUN6QixhQUFPLFdBQVcsRUFBRSxNQUFNLEtBQUssT0FBTyxJQUFJO0FBQUEsSUFDM0MsT0FBTztBQUNOLFlBQU0sRUFBRSxNQUFNLE1BQU0sSUFBSTtBQUN4QixhQUFPLFdBQVcsRUFBRSxNQUFNLElBQUksS0FBSyxJQUFJLEdBQUcsT0FBTyxJQUFJLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQ0Q7QUF0UmEsc0JBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLG1CQUFtQjtBQUFBLEVBWWxEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZlU7IiwKICAibmFtZXMiOiBbImlucHV0IiwgInF1aWNrUGljayJdCn0K
