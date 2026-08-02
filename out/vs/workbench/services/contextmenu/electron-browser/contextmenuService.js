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
import { Separator, SubmenuAction } from "../../../../base/common/actions.js";
import * as dom from "../../../../base/browser/dom.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { getZoomFactor } from "../../../../base/browser/browser.js";
import { unmnemonicLabel } from "../../../../base/common/labels.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { popup } from "../../../../base/parts/contextmenu/electron-browser/contextmenu.js";
import { hasNativeContextMenu, MenuSettings } from "../../../../platform/window/common/window.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextMenuMenuDelegate, ContextMenuService as HTMLContextMenuService } from "../../../../platform/contextview/browser/contextMenuService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { AnchorAlignment, AnchorAxisAlignment, isAnchor } from "../../../../base/browser/ui/contextview/contextview.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
let ContextMenuService = class {
  get onDidShowContextMenu() {
    return this.impl.onDidShowContextMenu;
  }
  get onDidHideContextMenu() {
    return this.impl.onDidHideContextMenu;
  }
  constructor(notificationService, telemetryService, keybindingService, configurationService, contextViewService, menuService, contextKeyService) {
    function createContextMenuService(native) {
      return native ? new NativeContextMenuService(notificationService, telemetryService, keybindingService, menuService, contextKeyService) : new HTMLContextMenuService(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
    }
    let isNativeContextMenu = hasNativeContextMenu(configurationService);
    this.impl = createContextMenuService(isNativeContextMenu);
    if (isMacintosh) {
      this.listener = configurationService.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(MenuSettings.MenuStyle)) {
          return;
        }
        const newIsNativeContextMenu = hasNativeContextMenu(configurationService);
        if (newIsNativeContextMenu === isNativeContextMenu) {
          return;
        }
        this.impl.dispose();
        this.impl = createContextMenuService(newIsNativeContextMenu);
        isNativeContextMenu = newIsNativeContextMenu;
      });
    }
  }
  dispose() {
    this.listener?.dispose();
    this.impl.dispose();
  }
  showContextMenu(delegate) {
    this.impl.showContextMenu(delegate);
  }
};
ContextMenuService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextKeyService)
], ContextMenuService);
let NativeContextMenuService = class extends Disposable {
  constructor(notificationService, telemetryService, keybindingService, menuService, contextKeyService) {
    super();
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this._onDidShowContextMenu = this._store.add(new Emitter());
    this.onDidShowContextMenu = this._onDidShowContextMenu.event;
    this._onDidHideContextMenu = this._store.add(new Emitter());
    this.onDidHideContextMenu = this._onDidHideContextMenu.event;
  }
  showContextMenu(delegate) {
    delegate = ContextMenuMenuDelegate.transform(delegate, this.menuService, this.contextKeyService);
    const actions = delegate.getActions();
    if (actions.length) {
      const onHide = createSingleCallFunction(() => {
        delegate.onHide?.(false);
        dom.ModifierKeyEmitter.getInstance().resetKeyStatus();
        this._onDidHideContextMenu.fire();
      });
      const menu = this.createMenu(delegate, actions, onHide);
      const anchor = delegate.getAnchor();
      let x;
      let y;
      let zoom = getZoomFactor(dom.isHTMLElement(anchor) ? dom.getWindow(anchor) : dom.getActiveWindow());
      if (dom.isHTMLElement(anchor)) {
        const clientRect = anchor.getBoundingClientRect();
        const elementPosition = { left: clientRect.left, top: clientRect.top, width: clientRect.width, height: clientRect.height };
        const win = dom.getWindow(anchor);
        const vw = win.innerWidth;
        const vh = win.innerHeight;
        const isClipped = clientRect.left < 0 || clientRect.top < 0 || clientRect.right > vw || clientRect.bottom > vh;
        zoom *= dom.getDomNodeZoomLevel(anchor);
        if (isClipped) {
          x = Math.min(Math.max(clientRect.right, 0), vw);
          y = Math.min(Math.max(clientRect.bottom, 0), vh);
        } else {
          if (delegate.anchorAxisAlignment === AnchorAxisAlignment.HORIZONTAL) {
            if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
              x = elementPosition.left;
              y = elementPosition.top;
            } else {
              x = elementPosition.left + elementPosition.width;
              y = elementPosition.top;
            }
            if (!isMacintosh) {
              const window = dom.getWindow(anchor);
              const availableHeightForMenu = window.screen.height - y;
              if (availableHeightForMenu < actions.length * (isWindows ? 45 : 32)) {
                y += elementPosition.height;
              }
            }
          } else {
            if (delegate.anchorAlignment === AnchorAlignment.LEFT) {
              x = elementPosition.left;
              y = elementPosition.top + elementPosition.height;
            } else {
              x = elementPosition.left + elementPosition.width;
              y = elementPosition.top + elementPosition.height;
            }
          }
        }
        if (isMacintosh) {
          y += 4 / zoom;
        }
      } else if (isAnchor(anchor)) {
        x = anchor.x;
        y = anchor.y;
      } else {
      }
      if (typeof x === "number") {
        x = Math.floor(x * zoom);
      }
      if (typeof y === "number") {
        y = Math.floor(y * zoom);
      }
      popup(menu, { x, y, positioningItem: delegate.autoSelectFirstItem ? 0 : void 0 }, () => onHide());
      this._onDidShowContextMenu.fire();
    }
  }
  createMenu(delegate, entries, onHide, submenuIds = /* @__PURE__ */ new Set()) {
    return coalesce(entries.map((entry) => this.createMenuItem(delegate, entry, onHide, submenuIds)));
  }
  createMenuItem(delegate, entry, onHide, submenuIds) {
    if (entry instanceof Separator) {
      return { type: "separator" };
    }
    if (entry instanceof SubmenuAction) {
      if (submenuIds.has(entry.id)) {
        console.warn(`Found submenu cycle: ${entry.id}`);
        return void 0;
      }
      return {
        label: unmnemonicLabel(stripIcons(entry.label)).trim(),
        submenu: this.createMenu(delegate, entry.actions, onHide, /* @__PURE__ */ new Set([...submenuIds, entry.id]))
      };
    } else {
      let type = void 0;
      if (entry.checked) {
        if (typeof delegate.getCheckedActionsRepresentation === "function") {
          type = delegate.getCheckedActionsRepresentation(entry);
        } else {
          type = "checkbox";
        }
      }
      const item = {
        label: unmnemonicLabel(stripIcons(entry.label)).trim(),
        checked: !!entry.checked,
        type,
        enabled: !!entry.enabled,
        click: (event) => {
          onHide();
          this.runAction(entry, delegate, event);
        }
      };
      const keybinding = delegate.getKeyBinding ? delegate.getKeyBinding(entry) : this.keybindingService.lookupKeybinding(entry.id);
      if (keybinding) {
        const electronAccelerator = keybinding.getElectronAccelerator();
        if (electronAccelerator) {
          item.accelerator = electronAccelerator;
        } else {
          const label = keybinding.getLabel();
          if (label) {
            item.label = `${item.label} [${label}]`;
          }
        }
      }
      return item;
    }
  }
  async runAction(actionToRun, delegate, event) {
    if (!delegate.skipTelemetry) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: actionToRun.id, from: "contextMenu" });
    }
    const context = delegate.getActionsContext ? delegate.getActionsContext(event) : void 0;
    try {
      if (delegate.actionRunner) {
        await delegate.actionRunner.run(actionToRun, context);
      } else if (actionToRun.enabled) {
        await actionToRun.run(context);
      }
    } catch (error) {
      this.notificationService.error(error);
    }
  }
};
NativeContextMenuService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService)
], NativeContextMenuService);
registerSingleton(IContextMenuService, ContextMenuService, InstantiationType.Delayed);
export {
  ContextMenuService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb250ZXh0bWVudS9lbGVjdHJvbi1icm93c2VyL2NvbnRleHRtZW51U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElBY3Rpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51TWVudURlbGVnYXRlLCBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZ2V0Wm9vbUZhY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IHVubW5lbW9uaWNMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudURlbGVnYXRlLCBJQ29udGV4dE1lbnVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2NvbnRleHRtZW51L2NvbW1vbi9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBwb3B1cCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvY29udGV4dG1lbnUvZWxlY3Ryb24tYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSwgTWVudVNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVNZW51RGVsZWdhdGUsIENvbnRleHRNZW51U2VydmljZSBhcyBIVE1MQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0TWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yQXhpc0FsaWdubWVudCwgaXNBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIENvbnRleHRNZW51U2VydmljZSBpbXBsZW1lbnRzIElDb250ZXh0TWVudVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaW1wbDogSFRNTENvbnRleHRNZW51U2VydmljZSB8IE5hdGl2ZUNvbnRleHRNZW51U2VydmljZTtcblx0cHJpdmF0ZSBsaXN0ZW5lcj86IElEaXNwb3NhYmxlO1xuXG5cdGdldCBvbkRpZFNob3dDb250ZXh0TWVudSgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLmltcGwub25EaWRTaG93Q29udGV4dE1lbnU7IH1cblx0Z2V0IG9uRGlkSGlkZUNvbnRleHRNZW51KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuaW1wbC5vbkRpZEhpZGVDb250ZXh0TWVudTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ29udGV4dE1lbnVTZXJ2aWNlKG5hdGl2ZTogYm9vbGVhbikge1xuXHRcdFx0cmV0dXJuIG5hdGl2ZSA/XG5cdFx0XHRcdG5ldyBOYXRpdmVDb250ZXh0TWVudVNlcnZpY2Uobm90aWZpY2F0aW9uU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSlcblx0XHRcdFx0OiBuZXcgSFRNTENvbnRleHRNZW51U2VydmljZSh0ZWxlbWV0cnlTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0Vmlld1NlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdC8vIHNldCBpbml0aWFsIGNvbnRleHQgbWVudSBzZXJ2aWNlXG5cdFx0bGV0IGlzTmF0aXZlQ29udGV4dE1lbnUgPSBoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5pbXBsID0gY3JlYXRlQ29udGV4dE1lbnVTZXJ2aWNlKGlzTmF0aXZlQ29udGV4dE1lbnUpO1xuXG5cdFx0Ly8gTWFjT1MgZG9lcyBub3QgbmVlZCBhIHJlc3RhcnQgd2hlbiB0aGUgbWVudSBzdHlsZSBjaGFuZ2VzXG5cdFx0Ly8gSXQgc2hvdWxkIHVwZGF0ZSB0aGUgY29udGV4dCBtZW51IHN0eWxlIG9uIG1lbnUgc3R5bGUgY29uZmlndXJhdGlvbiBjaGFuZ2Vcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHRoaXMubGlzdGVuZXIgPSBjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmICghZS5hZmZlY3RzQ29uZmlndXJhdGlvbihNZW51U2V0dGluZ3MuTWVudVN0eWxlKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5ld0lzTmF0aXZlQ29udGV4dE1lbnUgPSBoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGlmIChuZXdJc05hdGl2ZUNvbnRleHRNZW51ID09PSBpc05hdGl2ZUNvbnRleHRNZW51KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5pbXBsLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5pbXBsID0gY3JlYXRlQ29udGV4dE1lbnVTZXJ2aWNlKG5ld0lzTmF0aXZlQ29udGV4dE1lbnUpO1xuXHRcdFx0XHRpc05hdGl2ZUNvbnRleHRNZW51ID0gbmV3SXNOYXRpdmVDb250ZXh0TWVudTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuaW1wbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRzaG93Q29udGV4dE1lbnUoZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlIHwgSUNvbnRleHRNZW51TWVudURlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5pbXBsLnNob3dDb250ZXh0TWVudShkZWxlZ2F0ZSk7XG5cdH1cbn1cblxuY2xhc3MgTmF0aXZlQ29udGV4dE1lbnVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZXh0TWVudVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2hvd0NvbnRleHRNZW51ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNob3dDb250ZXh0TWVudSA9IHRoaXMuX29uRGlkU2hvd0NvbnRleHRNZW51LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZUNvbnRleHRNZW51ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGVDb250ZXh0TWVudSA9IHRoaXMuX29uRGlkSGlkZUNvbnRleHRNZW51LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzaG93Q29udGV4dE1lbnUoZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlIHwgSUNvbnRleHRNZW51TWVudURlbGVnYXRlKTogdm9pZCB7XG5cblx0XHRkZWxlZ2F0ZSA9IENvbnRleHRNZW51TWVudURlbGVnYXRlLnRyYW5zZm9ybShkZWxlZ2F0ZSwgdGhpcy5tZW51U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZGVsZWdhdGUuZ2V0QWN0aW9ucygpO1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgb25IaWRlID0gY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKCgpID0+IHtcblx0XHRcdFx0ZGVsZWdhdGUub25IaWRlPy4oZmFsc2UpO1xuXG5cdFx0XHRcdGRvbS5Nb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKS5yZXNldEtleVN0YXR1cygpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEhpZGVDb250ZXh0TWVudS5maXJlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMuY3JlYXRlTWVudShkZWxlZ2F0ZSwgYWN0aW9ucywgb25IaWRlKTtcblx0XHRcdGNvbnN0IGFuY2hvciA9IGRlbGVnYXRlLmdldEFuY2hvcigpO1xuXG5cdFx0XHRsZXQgeDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHk6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IHpvb20gPSBnZXRab29tRmFjdG9yKGRvbS5pc0hUTUxFbGVtZW50KGFuY2hvcikgPyBkb20uZ2V0V2luZG93KGFuY2hvcikgOiBkb20uZ2V0QWN0aXZlV2luZG93KCkpO1xuXHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGFuY2hvcikpIHtcblx0XHRcdFx0Y29uc3QgY2xpZW50UmVjdCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0Y29uc3QgZWxlbWVudFBvc2l0aW9uID0geyBsZWZ0OiBjbGllbnRSZWN0LmxlZnQsIHRvcDogY2xpZW50UmVjdC50b3AsIHdpZHRoOiBjbGllbnRSZWN0LndpZHRoLCBoZWlnaHQ6IGNsaWVudFJlY3QuaGVpZ2h0IH07XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5lIGlmIGVsZW1lbnQgaXMgY2xpcHBlZCBieSB2aWV3cG9ydDsgaWYgc28gd2UnbGwgdXNlIHRoZSBib3R0b20tcmlnaHQgb2YgdGhlIHZpc2libGUgcG9ydGlvblxuXHRcdFx0XHRjb25zdCB3aW4gPSBkb20uZ2V0V2luZG93KGFuY2hvcik7XG5cdFx0XHRcdGNvbnN0IHZ3ID0gd2luLmlubmVyV2lkdGg7XG5cdFx0XHRcdGNvbnN0IHZoID0gd2luLmlubmVySGVpZ2h0O1xuXHRcdFx0XHRjb25zdCBpc0NsaXBwZWQgPSBjbGllbnRSZWN0LmxlZnQgPCAwIHx8IGNsaWVudFJlY3QudG9wIDwgMCB8fCBjbGllbnRSZWN0LnJpZ2h0ID4gdncgfHwgY2xpZW50UmVjdC5ib3R0b20gPiB2aDtcblxuXHRcdFx0XHQvLyBXaGVuIGRyYXdpbmcgY29udGV4dCBtZW51cywgd2UgYWRqdXN0IHRoZSBwaXhlbCBwb3NpdGlvbiBmb3IgbmF0aXZlIG1lbnVzIHVzaW5nIHpvb20gbGV2ZWxcblx0XHRcdFx0Ly8gSW4gYXJlYXMgd2hlcmUgem9vbSBpcyBhcHBsaWVkIHRvIHRoZSBlbGVtZW50IG9yIGl0cyBhbmNlc3RvcnMsIHdlIG5lZWQgdG8gYWRqdXN0IGFjY29yZGluZ2x5XG5cdFx0XHRcdC8vIGUuZy4gVGhlIHRpdGxlIGJhciBoYXMgY291bnRlciB6b29tIGJlaGF2aW9yIG1lYW5pbmcgaXQgYXBwbGllcyB0aGUgaW52ZXJzZSBvZiB6b29tIGxldmVsLlxuXHRcdFx0XHQvLyBXaW5kb3cgWm9vbSBMZXZlbDogMS41LCBUaXRsZSBCYXIgWm9vbTogMS8xLjUsIENvb3JkaW5hdGUgTXVsdGlwbGllcjogMS41ICogMS4wIC8gMS41ID0gMS4wXG5cdFx0XHRcdHpvb20gKj0gZG9tLmdldERvbU5vZGVab29tTGV2ZWwoYW5jaG9yKTtcblxuXHRcdFx0XHRpZiAoaXNDbGlwcGVkKSB7XG5cdFx0XHRcdFx0Ly8gRWxlbWVudCBpcyBwYXJ0aWFsbHkgb3V0IG9mIHZpZXdwb3J0OiBhbHdheXMgcGxhY2UgYXQgYm90dG9tLXJpZ2h0IHZpc2libGUgY29ybmVyXG5cdFx0XHRcdFx0eCA9IE1hdGgubWluKE1hdGgubWF4KGNsaWVudFJlY3QucmlnaHQsIDApLCB2dyk7XG5cdFx0XHRcdFx0eSA9IE1hdGgubWluKE1hdGgubWF4KGNsaWVudFJlY3QuYm90dG9tLCAwKSwgdmgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFBvc2l0aW9uIGFjY29yZGluZyB0byB0aGUgYXhpcyBhbGlnbm1lbnQgYW5kIHRoZSBhbmNob3IgYWxpZ25tZW50OlxuXHRcdFx0XHRcdC8vIGBIT1JJWk9OVEFMYCBhbGlnbnMgYXQgdGhlIHRvcCBsZWZ0IG9yIHJpZ2h0IG9mIHRoZSBhbmNob3IgYW5kXG5cdFx0XHRcdFx0Ly8gIGBWRVJUSUNBTGAgYWxpZ25zIGF0IHRoZSBib3R0b20gbGVmdCBvZiB0aGUgYW5jaG9yLlxuXHRcdFx0XHRcdGlmIChkZWxlZ2F0ZS5hbmNob3JBeGlzQWxpZ25tZW50ID09PSBBbmNob3JBeGlzQWxpZ25tZW50LkhPUklaT05UQUwpIHtcblx0XHRcdFx0XHRcdGlmIChkZWxlZ2F0ZS5hbmNob3JBbGlnbm1lbnQgPT09IEFuY2hvckFsaWdubWVudC5MRUZUKSB7XG5cdFx0XHRcdFx0XHRcdHggPSBlbGVtZW50UG9zaXRpb24ubGVmdDtcblx0XHRcdFx0XHRcdFx0eSA9IGVsZW1lbnRQb3NpdGlvbi50b3A7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR4ID0gZWxlbWVudFBvc2l0aW9uLmxlZnQgKyBlbGVtZW50UG9zaXRpb24ud2lkdGg7XG5cdFx0XHRcdFx0XHRcdHkgPSBlbGVtZW50UG9zaXRpb24udG9wO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdpbmRvdyA9IGRvbS5nZXRXaW5kb3coYW5jaG9yKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlSGVpZ2h0Rm9yTWVudSA9IHdpbmRvdy5zY3JlZW4uaGVpZ2h0IC0geTtcblx0XHRcdFx0XHRcdFx0aWYgKGF2YWlsYWJsZUhlaWdodEZvck1lbnUgPCBhY3Rpb25zLmxlbmd0aCAqIChpc1dpbmRvd3MgPyA0NSA6IDMyKSAvKiBndWVzcyBvZiAxIG1lbnUgaXRlbSBoZWlnaHQgKi8pIHtcblx0XHRcdFx0XHRcdFx0XHQvLyB0aGlzIGlzIGEgZ3Vlc3MgdG8gZGV0ZWN0IHdoZXRoZXIgdGhlIGNvbnRleHQgbWVudSB3b3VsZFxuXHRcdFx0XHRcdFx0XHRcdC8vIG9wZW4gdG8gdGhlIGJvdHRvbSBmcm9tIHRoaXMgcG9pbnQgb3IgdG8gdGhlIHRvcC4gSWYgdGhlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gbWVudSBvcGVucyB0byB0aGUgdG9wLCBtYWtlIHN1cmUgdG8gYWxpZ24gaXQgdG8gdGhlIGJvdHRvbVxuXHRcdFx0XHRcdFx0XHRcdC8vIG9mIHRoZSBhbmNob3IgYW5kIG5vdCB0byB0aGUgdG9wLlxuXHRcdFx0XHRcdFx0XHRcdC8vIHRoaXMgc2VlbXMgdG8gYmUgb25seSBuZWNlc3NhcnkgZm9yIFdpbmRvd3MgYW5kIExpbnV4LlxuXHRcdFx0XHRcdFx0XHRcdHkgKz0gZWxlbWVudFBvc2l0aW9uLmhlaWdodDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoZGVsZWdhdGUuYW5jaG9yQWxpZ25tZW50ID09PSBBbmNob3JBbGlnbm1lbnQuTEVGVCkge1xuXHRcdFx0XHRcdFx0XHR4ID0gZWxlbWVudFBvc2l0aW9uLmxlZnQ7XG5cdFx0XHRcdFx0XHRcdHkgPSBlbGVtZW50UG9zaXRpb24udG9wICsgZWxlbWVudFBvc2l0aW9uLmhlaWdodDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHggPSBlbGVtZW50UG9zaXRpb24ubGVmdCArIGVsZW1lbnRQb3NpdGlvbi53aWR0aDtcblx0XHRcdFx0XHRcdFx0eSA9IGVsZW1lbnRQb3NpdGlvbi50b3AgKyBlbGVtZW50UG9zaXRpb24uaGVpZ2h0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNoaWZ0IG1hY09TIG1lbnVzIGJ5IGEgZmV3IHBpeGVscyBiZWxvdyBlbGVtZW50c1xuXHRcdFx0XHQvLyB0byBhY2NvdW50IGZvciBleHRyYSBwYWRkaW5nIG9uIHRvcCBvZiBuYXRpdmUgbWVudVxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODQyMzFcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0eSArPSA0IC8gem9vbTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc0FuY2hvcihhbmNob3IpKSB7XG5cdFx0XHRcdHggPSBhbmNob3IueDtcblx0XHRcdFx0eSA9IGFuY2hvci55O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2UgbGVhdmUgeC95IHVuZGVmaW5lZCBpbiB0aGlzIGNhc2Ugd2hpY2ggd2lsbCByZXN1bHQgaW5cblx0XHRcdFx0Ly8gRWxlY3Ryb24gdGFraW5nIGNhcmUgb2Ygb3BlbmluZyB0aGUgbWVudSBhdCB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHggPSBNYXRoLmZsb29yKHggKiB6b29tKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGVvZiB5ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR5ID0gTWF0aC5mbG9vcih5ICogem9vbSk7XG5cdFx0XHR9XG5cblx0XHRcdHBvcHVwKG1lbnUsIHsgeCwgeSwgcG9zaXRpb25pbmdJdGVtOiBkZWxlZ2F0ZS5hdXRvU2VsZWN0Rmlyc3RJdGVtID8gMCA6IHVuZGVmaW5lZCwgfSwgKCkgPT4gb25IaWRlKCkpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZFNob3dDb250ZXh0TWVudS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNZW51KGRlbGVnYXRlOiBJQ29udGV4dE1lbnVEZWxlZ2F0ZSwgZW50cmllczogcmVhZG9ubHkgSUFjdGlvbltdLCBvbkhpZGU6ICgpID0+IHZvaWQsIHN1Ym1lbnVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKSk6IElDb250ZXh0TWVudUl0ZW1bXSB7XG5cdFx0cmV0dXJuIGNvYWxlc2NlKGVudHJpZXMubWFwKGVudHJ5ID0+IHRoaXMuY3JlYXRlTWVudUl0ZW0oZGVsZWdhdGUsIGVudHJ5LCBvbkhpZGUsIHN1Ym1lbnVJZHMpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1lbnVJdGVtKGRlbGVnYXRlOiBJQ29udGV4dE1lbnVEZWxlZ2F0ZSwgZW50cnk6IElBY3Rpb24sIG9uSGlkZTogKCkgPT4gdm9pZCwgc3VibWVudUlkczogU2V0PHN0cmluZz4pOiBJQ29udGV4dE1lbnVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBTZXBhcmF0b3Jcblx0XHRpZiAoZW50cnkgaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdzZXBhcmF0b3InIH07XG5cdFx0fVxuXG5cdFx0Ly8gU3VibWVudVxuXHRcdGlmIChlbnRyeSBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdGlmIChzdWJtZW51SWRzLmhhcyhlbnRyeS5pZCkpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBGb3VuZCBzdWJtZW51IGN5Y2xlOiAke2VudHJ5LmlkfWApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogdW5tbmVtb25pY0xhYmVsKHN0cmlwSWNvbnMoZW50cnkubGFiZWwpKS50cmltKCksXG5cdFx0XHRcdHN1Ym1lbnU6IHRoaXMuY3JlYXRlTWVudShkZWxlZ2F0ZSwgZW50cnkuYWN0aW9ucywgb25IaWRlLCBuZXcgU2V0KFsuLi5zdWJtZW51SWRzLCBlbnRyeS5pZF0pKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBOb3JtYWwgTWVudSBJdGVtXG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgdHlwZTogJ3JhZGlvJyB8ICdjaGVja2JveCcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZW50cnkuY2hlY2tlZCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIGRlbGVnYXRlLmdldENoZWNrZWRBY3Rpb25zUmVwcmVzZW50YXRpb24gPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHR0eXBlID0gZGVsZWdhdGUuZ2V0Q2hlY2tlZEFjdGlvbnNSZXByZXNlbnRhdGlvbihlbnRyeSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHlwZSA9ICdjaGVja2JveCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbTogSUNvbnRleHRNZW51SXRlbSA9IHtcblx0XHRcdFx0bGFiZWw6IHVubW5lbW9uaWNMYWJlbChzdHJpcEljb25zKGVudHJ5LmxhYmVsKSkudHJpbSgpLFxuXHRcdFx0XHRjaGVja2VkOiAhIWVudHJ5LmNoZWNrZWQsXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGVuYWJsZWQ6ICEhZW50cnkuZW5hYmxlZCxcblx0XHRcdFx0Y2xpY2s6IGV2ZW50ID0+IHtcblxuXHRcdFx0XHRcdC8vIFRvIHByZXNlcnZlIHByZS1lbGVjdHJvbi0yLnggYmVoYXZpb3VyLCB3ZSBmaXJzdCB0cmlnZ2VyXG5cdFx0XHRcdFx0Ly8gdGhlIG9uSGlkZSBjYWxsYmFjayBhbmQgdGhlbiB0aGUgYWN0aW9uLlxuXHRcdFx0XHRcdC8vIEZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80NTYwMVxuXHRcdFx0XHRcdG9uSGlkZSgpO1xuXG5cdFx0XHRcdFx0Ly8gUnVuIGFjdGlvbiB3aGljaCB3aWxsIGNsb3NlIHRoZSBtZW51XG5cdFx0XHRcdFx0dGhpcy5ydW5BY3Rpb24oZW50cnksIGRlbGVnYXRlLCBldmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBkZWxlZ2F0ZS5nZXRLZXlCaW5kaW5nID8gZGVsZWdhdGUuZ2V0S2V5QmluZGluZyhlbnRyeSkgOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoZW50cnkuaWQpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0Y29uc3QgZWxlY3Ryb25BY2NlbGVyYXRvciA9IGtleWJpbmRpbmcuZ2V0RWxlY3Ryb25BY2NlbGVyYXRvcigpO1xuXHRcdFx0XHRpZiAoZWxlY3Ryb25BY2NlbGVyYXRvcikge1xuXHRcdFx0XHRcdGl0ZW0uYWNjZWxlcmF0b3IgPSBlbGVjdHJvbkFjY2VsZXJhdG9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0ga2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRcdFx0aXRlbS5sYWJlbCA9IGAke2l0ZW0ubGFiZWx9IFske2xhYmVsfV1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXRlbTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb25Ub1J1bjogSUFjdGlvbiwgZGVsZWdhdGU6IElDb250ZXh0TWVudURlbGVnYXRlLCBldmVudDogSUNvbnRleHRNZW51RXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWRlbGVnYXRlLnNraXBUZWxlbWV0cnkpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGFjdGlvblRvUnVuLmlkLCBmcm9tOiAnY29udGV4dE1lbnUnIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBkZWxlZ2F0ZS5nZXRBY3Rpb25zQ29udGV4dCA/IGRlbGVnYXRlLmdldEFjdGlvbnNDb250ZXh0KGV2ZW50KSA6IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZGVsZWdhdGUuYWN0aW9uUnVubmVyKSB7XG5cdFx0XHRcdGF3YWl0IGRlbGVnYXRlLmFjdGlvblJ1bm5lci5ydW4oYWN0aW9uVG9SdW4sIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb25Ub1J1bi5lbmFibGVkKSB7XG5cdFx0XHRcdGF3YWl0IGFjdGlvblRvUnVuLnJ1bihjb250ZXh0KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUNvbnRleHRNZW51U2VydmljZSwgQ29udGV4dE1lbnVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBdUYsV0FBVyxxQkFBcUI7QUFDdkgsWUFBWSxTQUFTO0FBQ3JCLFNBQW1DLHFCQUFxQiwyQkFBMkI7QUFDbkYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCLG9CQUFvQjtBQUNuRCxTQUFTLGFBQWEsaUJBQWlCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCLHNCQUFzQiw4QkFBOEI7QUFDdEYsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWdCLGVBQWU7QUFDL0IsU0FBUyxpQkFBaUIscUJBQXFCLGdCQUFnQjtBQUMvRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUErQjtBQUVqQyxJQUFNLHFCQUFOLE1BQXdEO0FBQUEsRUFPOUQsSUFBSSx1QkFBb0M7QUFBRSxXQUFPLEtBQUssS0FBSztBQUFBLEVBQXNCO0FBQUEsRUFDakYsSUFBSSx1QkFBb0M7QUFBRSxXQUFPLEtBQUssS0FBSztBQUFBLEVBQXNCO0FBQUEsRUFFakYsWUFDdUIscUJBQ0gsa0JBQ0MsbUJBQ0csc0JBQ0Ysb0JBQ1AsYUFDTSxtQkFDbkI7QUFDRCxhQUFTLHlCQUF5QixRQUFpQjtBQUNsRCxhQUFPLFNBQ04sSUFBSSx5QkFBeUIscUJBQXFCLGtCQUFrQixtQkFBbUIsYUFBYSxpQkFBaUIsSUFDbkgsSUFBSSx1QkFBdUIsa0JBQWtCLHFCQUFxQixvQkFBb0IsbUJBQW1CLGFBQWEsaUJBQWlCO0FBQUEsSUFDM0k7QUFHQSxRQUFJLHNCQUFzQixxQkFBcUIsb0JBQW9CO0FBQ25FLFNBQUssT0FBTyx5QkFBeUIsbUJBQW1CO0FBSXhELFFBQUksYUFBYTtBQUNoQixXQUFLLFdBQVcscUJBQXFCLHlCQUF5QixPQUFLO0FBQ2xFLFlBQUksQ0FBQyxFQUFFLHFCQUFxQixhQUFhLFNBQVMsR0FBRztBQUNwRDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLHlCQUF5QixxQkFBcUIsb0JBQW9CO0FBQ3hFLFlBQUksMkJBQTJCLHFCQUFxQjtBQUNuRDtBQUFBLFFBQ0Q7QUFFQSxhQUFLLEtBQUssUUFBUTtBQUNsQixhQUFLLE9BQU8seUJBQXlCLHNCQUFzQjtBQUMzRCw4QkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxVQUFVLFFBQVE7QUFDdkIsU0FBSyxLQUFLLFFBQVE7QUFBQSxFQUNuQjtBQUFBLEVBRUEsZ0JBQWdCLFVBQWlFO0FBQ2hGLFNBQUssS0FBSyxnQkFBZ0IsUUFBUTtBQUFBLEVBQ25DO0FBQ0Q7QUF6RGEscUJBQU47QUFBQSxFQVdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQlU7QUEyRGIsSUFBTSwyQkFBTixjQUF1QyxXQUEwQztBQUFBLEVBVWhGLFlBQ3dDLHFCQUNILGtCQUNDLG1CQUNOLGFBQ00sbUJBQ3BDO0FBQ0QsVUFBTTtBQU5pQztBQUNIO0FBQ0M7QUFDTjtBQUNNO0FBWHRDLFNBQWlCLHdCQUF3QixLQUFLLE9BQU8sSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUM1RSxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFpQix3QkFBd0IsS0FBSyxPQUFPLElBQUksSUFBSSxRQUFjLENBQUM7QUFDNUUsU0FBUyx1QkFBdUIsS0FBSyxzQkFBc0I7QUFBQSxFQVUzRDtBQUFBLEVBRUEsZ0JBQWdCLFVBQWlFO0FBRWhGLGVBQVcsd0JBQXdCLFVBQVUsVUFBVSxLQUFLLGFBQWEsS0FBSyxpQkFBaUI7QUFFL0YsVUFBTSxVQUFVLFNBQVMsV0FBVztBQUNwQyxRQUFJLFFBQVEsUUFBUTtBQUNuQixZQUFNLFNBQVMseUJBQXlCLE1BQU07QUFDN0MsaUJBQVMsU0FBUyxLQUFLO0FBRXZCLFlBQUksbUJBQW1CLFlBQVksRUFBRSxlQUFlO0FBQ3BELGFBQUssc0JBQXNCLEtBQUs7QUFBQSxNQUNqQyxDQUFDO0FBRUQsWUFBTSxPQUFPLEtBQUssV0FBVyxVQUFVLFNBQVMsTUFBTTtBQUN0RCxZQUFNLFNBQVMsU0FBUyxVQUFVO0FBRWxDLFVBQUk7QUFDSixVQUFJO0FBRUosVUFBSSxPQUFPLGNBQWMsSUFBSSxjQUFjLE1BQU0sSUFBSSxJQUFJLFVBQVUsTUFBTSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDbEcsVUFBSSxJQUFJLGNBQWMsTUFBTSxHQUFHO0FBQzlCLGNBQU0sYUFBYSxPQUFPLHNCQUFzQjtBQUNoRCxjQUFNLGtCQUFrQixFQUFFLE1BQU0sV0FBVyxNQUFNLEtBQUssV0FBVyxLQUFLLE9BQU8sV0FBVyxPQUFPLFFBQVEsV0FBVyxPQUFPO0FBR3pILGNBQU0sTUFBTSxJQUFJLFVBQVUsTUFBTTtBQUNoQyxjQUFNLEtBQUssSUFBSTtBQUNmLGNBQU0sS0FBSyxJQUFJO0FBQ2YsY0FBTSxZQUFZLFdBQVcsT0FBTyxLQUFLLFdBQVcsTUFBTSxLQUFLLFdBQVcsUUFBUSxNQUFNLFdBQVcsU0FBUztBQU01RyxnQkFBUSxJQUFJLG9CQUFvQixNQUFNO0FBRXRDLFlBQUksV0FBVztBQUVkLGNBQUksS0FBSyxJQUFJLEtBQUssSUFBSSxXQUFXLE9BQU8sQ0FBQyxHQUFHLEVBQUU7QUFDOUMsY0FBSSxLQUFLLElBQUksS0FBSyxJQUFJLFdBQVcsUUFBUSxDQUFDLEdBQUcsRUFBRTtBQUFBLFFBQ2hELE9BQU87QUFJTixjQUFJLFNBQVMsd0JBQXdCLG9CQUFvQixZQUFZO0FBQ3BFLGdCQUFJLFNBQVMsb0JBQW9CLGdCQUFnQixNQUFNO0FBQ3RELGtCQUFJLGdCQUFnQjtBQUNwQixrQkFBSSxnQkFBZ0I7QUFBQSxZQUNyQixPQUFPO0FBQ04sa0JBQUksZ0JBQWdCLE9BQU8sZ0JBQWdCO0FBQzNDLGtCQUFJLGdCQUFnQjtBQUFBLFlBQ3JCO0FBRUEsZ0JBQUksQ0FBQyxhQUFhO0FBQ2pCLG9CQUFNLFNBQVMsSUFBSSxVQUFVLE1BQU07QUFDbkMsb0JBQU0seUJBQXlCLE9BQU8sT0FBTyxTQUFTO0FBQ3RELGtCQUFJLHlCQUF5QixRQUFRLFVBQVUsWUFBWSxLQUFLLEtBQXVDO0FBTXRHLHFCQUFLLGdCQUFnQjtBQUFBLGNBQ3RCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsT0FBTztBQUNOLGdCQUFJLFNBQVMsb0JBQW9CLGdCQUFnQixNQUFNO0FBQ3RELGtCQUFJLGdCQUFnQjtBQUNwQixrQkFBSSxnQkFBZ0IsTUFBTSxnQkFBZ0I7QUFBQSxZQUMzQyxPQUFPO0FBQ04sa0JBQUksZ0JBQWdCLE9BQU8sZ0JBQWdCO0FBQzNDLGtCQUFJLGdCQUFnQixNQUFNLGdCQUFnQjtBQUFBLFlBQzNDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFLQSxZQUFJLGFBQWE7QUFDaEIsZUFBSyxJQUFJO0FBQUEsUUFDVjtBQUFBLE1BQ0QsV0FBVyxTQUFTLE1BQU0sR0FBRztBQUM1QixZQUFJLE9BQU87QUFDWCxZQUFJLE9BQU87QUFBQSxNQUNaLE9BQU87QUFBQSxNQUdQO0FBRUEsVUFBSSxPQUFPLE1BQU0sVUFBVTtBQUMxQixZQUFJLEtBQUssTUFBTSxJQUFJLElBQUk7QUFBQSxNQUN4QjtBQUVBLFVBQUksT0FBTyxNQUFNLFVBQVU7QUFDMUIsWUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDeEI7QUFFQSxZQUFNLE1BQU0sRUFBRSxHQUFHLEdBQUcsaUJBQWlCLFNBQVMsc0JBQXNCLElBQUksT0FBVyxHQUFHLE1BQU0sT0FBTyxDQUFDO0FBRXBHLFdBQUssc0JBQXNCLEtBQUs7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcsVUFBZ0MsU0FBNkIsUUFBb0IsYUFBYSxvQkFBSSxJQUFZLEdBQXVCO0FBQ3ZKLFdBQU8sU0FBUyxRQUFRLElBQUksV0FBUyxLQUFLLGVBQWUsVUFBVSxPQUFPLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFBQSxFQUMvRjtBQUFBLEVBRVEsZUFBZSxVQUFnQyxPQUFnQixRQUFvQixZQUF1RDtBQUVqSixRQUFJLGlCQUFpQixXQUFXO0FBQy9CLGFBQU8sRUFBRSxNQUFNLFlBQVk7QUFBQSxJQUM1QjtBQUdBLFFBQUksaUJBQWlCLGVBQWU7QUFDbkMsVUFBSSxXQUFXLElBQUksTUFBTSxFQUFFLEdBQUc7QUFDN0IsZ0JBQVEsS0FBSyx3QkFBd0IsTUFBTSxFQUFFLEVBQUU7QUFDL0MsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPO0FBQUEsUUFDTixPQUFPLGdCQUFnQixXQUFXLE1BQU0sS0FBSyxDQUFDLEVBQUUsS0FBSztBQUFBLFFBQ3JELFNBQVMsS0FBSyxXQUFXLFVBQVUsTUFBTSxTQUFTLFFBQVEsb0JBQUksSUFBSSxDQUFDLEdBQUcsWUFBWSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDN0Y7QUFBQSxJQUNELE9BR0s7QUFDSixVQUFJLE9BQXlDO0FBQzdDLFVBQUksTUFBTSxTQUFTO0FBQ2xCLFlBQUksT0FBTyxTQUFTLG9DQUFvQyxZQUFZO0FBQ25FLGlCQUFPLFNBQVMsZ0NBQWdDLEtBQUs7QUFBQSxRQUN0RCxPQUFPO0FBQ04saUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBeUI7QUFBQSxRQUM5QixPQUFPLGdCQUFnQixXQUFXLE1BQU0sS0FBSyxDQUFDLEVBQUUsS0FBSztBQUFBLFFBQ3JELFNBQVMsQ0FBQyxDQUFDLE1BQU07QUFBQSxRQUNqQjtBQUFBLFFBQ0EsU0FBUyxDQUFDLENBQUMsTUFBTTtBQUFBLFFBQ2pCLE9BQU8sV0FBUztBQUtmLGlCQUFPO0FBR1AsZUFBSyxVQUFVLE9BQU8sVUFBVSxLQUFLO0FBQUEsUUFDdEM7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLFNBQVMsZ0JBQWdCLFNBQVMsY0FBYyxLQUFLLElBQUksS0FBSyxrQkFBa0IsaUJBQWlCLE1BQU0sRUFBRTtBQUM1SCxVQUFJLFlBQVk7QUFDZixjQUFNLHNCQUFzQixXQUFXLHVCQUF1QjtBQUM5RCxZQUFJLHFCQUFxQjtBQUN4QixlQUFLLGNBQWM7QUFBQSxRQUNwQixPQUFPO0FBQ04sZ0JBQU0sUUFBUSxXQUFXLFNBQVM7QUFDbEMsY0FBSSxPQUFPO0FBQ1YsaUJBQUssUUFBUSxHQUFHLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFBQSxVQUNyQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFVBQVUsYUFBc0IsVUFBZ0MsT0FBeUM7QUFDdEgsUUFBSSxDQUFDLFNBQVMsZUFBZTtBQUM1QixXQUFLLGlCQUFpQixXQUFnRiwyQkFBMkIsRUFBRSxJQUFJLFlBQVksSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUFBLElBQzdLO0FBRUEsVUFBTSxVQUFVLFNBQVMsb0JBQW9CLFNBQVMsa0JBQWtCLEtBQUssSUFBSTtBQUVqRixRQUFJO0FBQ0gsVUFBSSxTQUFTLGNBQWM7QUFDMUIsY0FBTSxTQUFTLGFBQWEsSUFBSSxhQUFhLE9BQU87QUFBQSxNQUNyRCxXQUFXLFlBQVksU0FBUztBQUMvQixjQUFNLFlBQVksSUFBSSxPQUFPO0FBQUEsTUFDOUI7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLFdBQUssb0JBQW9CLE1BQU0sS0FBSztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUNEO0FBak5NLDJCQUFOO0FBQUEsRUFXRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWZHO0FBbU5OLGtCQUFrQixxQkFBcUIsb0JBQW9CLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogW10KfQo=
