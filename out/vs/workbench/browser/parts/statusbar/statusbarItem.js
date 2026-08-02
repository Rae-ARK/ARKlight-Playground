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
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isTooltipWithCommands, ShowTooltipCommand, StatusbarEntryKinds } from "../../../services/statusbar/browser/statusbar.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isThemeColor } from "../../../../editor/common/editorCommon.js";
import { addDisposableListener, EventType, hide, show, append, EventHelper, $ } from "../../../../base/browser/dom.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { renderIcon, renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { spinningLoading, syncing } from "../../../../platform/theme/common/iconRegistry.js";
import { isMarkdownString, markdownStringEqual } from "../../../../base/common/htmlContent.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
let StatusbarEntryItem = class extends Disposable {
  constructor(container, entry, hoverDelegate, commandService, hoverService, notificationService, telemetryService, themeService) {
    super();
    this.container = container;
    this.hoverDelegate = hoverDelegate;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.notificationService = notificationService;
    this.telemetryService = telemetryService;
    this.themeService = themeService;
    this.entry = void 0;
    this.foregroundListener = this._register(new MutableDisposable());
    this.backgroundListener = this._register(new MutableDisposable());
    this.commandMouseListener = this._register(new MutableDisposable());
    this.commandTouchListener = this._register(new MutableDisposable());
    this.commandKeyboardListener = this._register(new MutableDisposable());
    this.hover = void 0;
    this.labelContainer = $("a.statusbar-item-label", {
      role: "button",
      tabIndex: -1
      // allows screen readers to read title, but still prevents tab focus.
    });
    this._register(Gesture.addTarget(this.labelContainer));
    this.label = this._register(new StatusBarCodiconLabel(this.labelContainer));
    this.container.appendChild(this.labelContainer);
    this.beakContainer = $(".status-bar-item-beak-container");
    this.container.appendChild(this.beakContainer);
    if (entry.content) {
      this.container.appendChild(entry.content);
    }
    this.update(entry);
  }
  get name() {
    return assertReturnsDefined(this.entry).name;
  }
  get hasCommand() {
    return typeof this.entry?.command !== "undefined";
  }
  update(entry) {
    this.label.showProgress = entry.showProgress ?? false;
    if (!this.entry || entry.text !== this.entry.text) {
      this.label.text = entry.text;
      if (entry.text) {
        show(this.labelContainer);
      } else {
        hide(this.labelContainer);
      }
    }
    if (!this.entry || entry.ariaLabel !== this.entry.ariaLabel) {
      this.container.setAttribute("aria-label", entry.ariaLabel);
      this.labelContainer.setAttribute("aria-label", entry.ariaLabel);
    }
    if (!this.entry || entry.role !== this.entry.role) {
      this.labelContainer.setAttribute("role", entry.role || "button");
    }
    if (!this.entry || !this.isEqualTooltip(this.entry, entry)) {
      let hoverOptions;
      let hoverTooltip;
      if (isTooltipWithCommands(entry.tooltip)) {
        hoverTooltip = entry.tooltip.content;
        hoverOptions = {
          actions: entry.tooltip.commands.map((command) => ({
            commandId: command.id,
            label: command.title,
            run: () => this.executeCommand(command)
          }))
        };
      } else {
        hoverTooltip = entry.tooltip;
      }
      const hoverContents = isMarkdownString(hoverTooltip) ? { markdown: hoverTooltip, markdownNotSupportedFallback: void 0 } : hoverTooltip;
      if (this.hover) {
        this.hover.update(hoverContents, hoverOptions);
      } else {
        this.hover = this._register(this.hoverService.setupManagedHover(this.hoverDelegate, this.container, hoverContents, hoverOptions));
      }
    }
    if (!this.entry || entry.command !== this.entry.command) {
      this.commandMouseListener.clear();
      this.commandTouchListener.clear();
      this.commandKeyboardListener.clear();
      const command = entry.command;
      if (command && (command !== ShowTooltipCommand || this.hover)) {
        this.commandMouseListener.value = addDisposableListener(this.labelContainer, EventType.CLICK, () => this.executeCommand(command));
        this.commandTouchListener.value = addDisposableListener(this.labelContainer, TouchEventType.Tap, () => this.executeCommand(command));
        this.commandKeyboardListener.value = addDisposableListener(this.labelContainer, EventType.KEY_DOWN, (e) => {
          const event = new StandardKeyboardEvent(e);
          if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
            EventHelper.stop(e);
            this.executeCommand(command);
          } else if (event.equals(KeyCode.Escape) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
            EventHelper.stop(e);
            this.hover?.hide();
          }
        });
        this.labelContainer.classList.remove("disabled");
      } else {
        this.labelContainer.classList.add("disabled");
      }
    }
    if (!this.entry || entry.showBeak !== this.entry.showBeak) {
      if (entry.showBeak) {
        this.container.classList.add("has-beak");
      } else {
        this.container.classList.remove("has-beak");
      }
    }
    const hasBackgroundColor = !!entry.backgroundColor || entry.kind && entry.kind !== "standard";
    if (!this.entry || entry.kind !== this.entry.kind) {
      for (const kind of StatusbarEntryKinds) {
        this.container.classList.remove(`${kind}-kind`);
      }
      if (entry.kind && entry.kind !== "standard") {
        this.container.classList.add(`${entry.kind}-kind`);
      }
      this.container.classList.toggle("has-background-color", hasBackgroundColor);
    }
    if (!this.entry || entry.color !== this.entry.color) {
      this.applyColor(this.labelContainer, entry.color);
    }
    if (!this.entry || entry.backgroundColor !== this.entry.backgroundColor) {
      this.container.classList.toggle("has-background-color", hasBackgroundColor);
      this.applyColor(this.container, entry.backgroundColor, true);
    }
    this.entry = entry;
  }
  isEqualTooltip({ tooltip }, { tooltip: otherTooltip }) {
    if (tooltip === void 0) {
      return otherTooltip === void 0;
    }
    if (isMarkdownString(tooltip)) {
      return isMarkdownString(otherTooltip) && markdownStringEqual(tooltip, otherTooltip);
    }
    return tooltip === otherTooltip;
  }
  async executeCommand(command) {
    if (command === ShowTooltipCommand) {
      this.hover?.show(
        true
        /* focus */
      );
    } else {
      const id = typeof command === "string" ? command : command.id;
      const args = typeof command === "string" ? [] : command.arguments ?? [];
      this.telemetryService.publicLog2("workbenchActionExecuted", { id, from: "status bar" });
      try {
        await this.commandService.executeCommand(id, ...args);
      } catch (error) {
        this.notificationService.error(toErrorMessage(error));
      }
    }
  }
  applyColor(container, color, isBackground) {
    let colorResult = void 0;
    if (isBackground) {
      this.backgroundListener.clear();
    } else {
      this.foregroundListener.clear();
    }
    if (color) {
      if (isThemeColor(color)) {
        colorResult = this.themeService.getColorTheme().getColor(color.id)?.toString();
        const listener = this.themeService.onDidColorThemeChange((theme) => {
          const colorValue = theme.getColor(color.id)?.toString();
          if (isBackground) {
            container.style.backgroundColor = colorValue ?? "";
          } else {
            container.style.color = colorValue ?? "";
          }
        });
        if (isBackground) {
          this.backgroundListener.value = listener;
        } else {
          this.foregroundListener.value = listener;
        }
      } else {
        colorResult = color;
      }
    }
    if (isBackground) {
      container.style.backgroundColor = colorResult ?? "";
    } else {
      container.style.color = colorResult ?? "";
    }
  }
};
StatusbarEntryItem = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IThemeService)
], StatusbarEntryItem);
class StatusBarCodiconLabel extends SimpleIconLabel {
  constructor(container) {
    super(container);
    this.container = container;
    this.currentText = "";
    this.currentShowProgress = false;
  }
  set showProgress(showProgress) {
    if (this.currentShowProgress !== showProgress) {
      this.currentShowProgress = showProgress;
      if (showProgress) {
        this.progressCodicon = renderIcon(showProgress === "syncing" ? syncing : spinningLoading);
      }
      this.text = this.currentText;
    }
  }
  set text(text) {
    if (this.currentShowProgress && this.progressCodicon) {
      if (this.container.firstChild !== this.progressCodicon) {
        this.container.appendChild(this.progressCodicon);
      }
      for (const node of Array.from(this.container.childNodes)) {
        if (node !== this.progressCodicon) {
          node.remove();
        }
      }
      let textContent = text ?? "";
      if (textContent) {
        textContent = `\xA0${textContent}`;
      }
      append(this.container, ...renderLabelWithIcons(textContent));
    } else {
      super.text = text;
    }
  }
}
export {
  StatusbarEntryItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3N0YXR1c2Jhci9zdGF0dXNiYXJJdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2ltcGxlSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9zaW1wbGVJY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBpc1Rvb2x0aXBXaXRoQ29tbWFuZHMsIFNob3dUb29sdGlwQ29tbWFuZCwgU3RhdHVzYmFyRW50cnlLaW5kcywgVG9vbHRpcENvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc1RoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgaGlkZSwgc2hvdywgYXBwZW5kLCBFdmVudEhlbHBlciwgJCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiwgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgc3Bpbm5pbmdMb2FkaW5nLCBzeW5jaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nLCBtYXJrZG93blN0cmluZ0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciwgSU1hbmFnZWRIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgU3RhdHVzYmFyRW50cnlJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYWJlbDogU3RhdHVzQmFyQ29kaWNvbkxhYmVsO1xuXG5cdHByaXZhdGUgZW50cnk6IElTdGF0dXNiYXJFbnRyeSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZvcmVncm91bmRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBiYWNrZ3JvdW5kTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kTW91c2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kVG91Y2hMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kS2V5Ym9hcmRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIGhvdmVyOiBJTWFuYWdlZEhvdmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGxhYmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYmVha0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5lbnRyeSkubmFtZTtcblx0fVxuXG5cdGdldCBoYXNDb21tYW5kKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy5lbnRyeT8uY29tbWFuZCAhPT0gJ3VuZGVmaW5lZCc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZW50cnk6IElTdGF0dXNiYXJFbnRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBMYWJlbCBDb250YWluZXJcblx0XHR0aGlzLmxhYmVsQ29udGFpbmVyID0gJCgnYS5zdGF0dXNiYXItaXRlbS1sYWJlbCcsIHtcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0dGFiSW5kZXg6IC0xIC8vIGFsbG93cyBzY3JlZW4gcmVhZGVycyB0byByZWFkIHRpdGxlLCBidXQgc3RpbGwgcHJldmVudHMgdGFiIGZvY3VzLlxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMubGFiZWxDb250YWluZXIpKTsgLy8gZW5hYmxlIHRvdWNoXG5cblx0XHQvLyBMYWJlbCAod2l0aCBzdXBwb3J0IGZvciBwcm9ncmVzcylcblx0XHR0aGlzLmxhYmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0YXR1c0JhckNvZGljb25MYWJlbCh0aGlzLmxhYmVsQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5sYWJlbENvbnRhaW5lcik7XG5cblx0XHQvLyBCZWFrIENvbnRhaW5lclxuXHRcdHRoaXMuYmVha0NvbnRhaW5lciA9ICQoJy5zdGF0dXMtYmFyLWl0ZW0tYmVhay1jb250YWluZXInKTtcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmJlYWtDb250YWluZXIpO1xuXG5cdFx0aWYgKGVudHJ5LmNvbnRlbnQpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGVudHJ5LmNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlKGVudHJ5KTtcblx0fVxuXG5cdHVwZGF0ZShlbnRyeTogSVN0YXR1c2JhckVudHJ5KTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGU6IFByb2dyZXNzXG5cdFx0dGhpcy5sYWJlbC5zaG93UHJvZ3Jlc3MgPSBlbnRyeS5zaG93UHJvZ3Jlc3MgPz8gZmFsc2U7XG5cblx0XHQvLyBVcGRhdGU6IFRleHRcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkudGV4dCAhPT0gdGhpcy5lbnRyeS50ZXh0KSB7XG5cdFx0XHR0aGlzLmxhYmVsLnRleHQgPSBlbnRyeS50ZXh0O1xuXG5cdFx0XHRpZiAoZW50cnkudGV4dCkge1xuXHRcdFx0XHRzaG93KHRoaXMubGFiZWxDb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlkZSh0aGlzLmxhYmVsQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGU6IEFSSUEgbGFiZWxcblx0XHQvL1xuXHRcdC8vIFNldCB0aGUgYXJpYSBsYWJlbCBvbiBib3RoIGVsZW1lbnRzIHNvIHNjcmVlbiByZWFkZXJzIHdvdWxkIHJlYWRcblx0XHQvLyB0aGUgY29ycmVjdCB0aGluZyB3aXRob3V0IGR1cGxpY2F0aW9uICM5NjIxMFxuXG5cdFx0aWYgKCF0aGlzLmVudHJ5IHx8IGVudHJ5LmFyaWFMYWJlbCAhPT0gdGhpcy5lbnRyeS5hcmlhTGFiZWwpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGVudHJ5LmFyaWFMYWJlbCk7XG5cdFx0XHR0aGlzLmxhYmVsQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGVudHJ5LmFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVudHJ5IHx8IGVudHJ5LnJvbGUgIT09IHRoaXMuZW50cnkucm9sZSkge1xuXHRcdFx0dGhpcy5sYWJlbENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCBlbnRyeS5yb2xlIHx8ICdidXR0b24nKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGU6IEhvdmVyXG5cdFx0aWYgKCF0aGlzLmVudHJ5IHx8ICF0aGlzLmlzRXF1YWxUb29sdGlwKHRoaXMuZW50cnksIGVudHJ5KSkge1xuXHRcdFx0bGV0IGhvdmVyT3B0aW9uczogSU1hbmFnZWRIb3Zlck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaG92ZXJUb29sdGlwOiBUb29sdGlwQ29udGVudCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc1Rvb2x0aXBXaXRoQ29tbWFuZHMoZW50cnkudG9vbHRpcCkpIHtcblx0XHRcdFx0aG92ZXJUb29sdGlwID0gZW50cnkudG9vbHRpcC5jb250ZW50O1xuXHRcdFx0XHRob3Zlck9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0YWN0aW9uczogZW50cnkudG9vbHRpcC5jb21tYW5kcy5tYXAoY29tbWFuZCA9PiAoe1xuXHRcdFx0XHRcdFx0Y29tbWFuZElkOiBjb21tYW5kLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZClcblx0XHRcdFx0XHR9KSlcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhvdmVyVG9vbHRpcCA9IGVudHJ5LnRvb2x0aXA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhvdmVyQ29udGVudHMgPSBpc01hcmtkb3duU3RyaW5nKGhvdmVyVG9vbHRpcCkgPyB7IG1hcmtkb3duOiBob3ZlclRvb2x0aXAsIG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHVuZGVmaW5lZCB9IDogaG92ZXJUb29sdGlwO1xuXHRcdFx0aWYgKHRoaXMuaG92ZXIpIHtcblx0XHRcdFx0dGhpcy5ob3Zlci51cGRhdGUoaG92ZXJDb250ZW50cywgaG92ZXJPcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaG92ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih0aGlzLmhvdmVyRGVsZWdhdGUsIHRoaXMuY29udGFpbmVyLCBob3ZlckNvbnRlbnRzLCBob3Zlck9wdGlvbnMpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGU6IENvbW1hbmRcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkuY29tbWFuZCAhPT0gdGhpcy5lbnRyeS5jb21tYW5kKSB7XG5cdFx0XHR0aGlzLmNvbW1hbmRNb3VzZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRUb3VjaExpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRLZXlib2FyZExpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBlbnRyeS5jb21tYW5kO1xuXHRcdFx0aWYgKGNvbW1hbmQgJiYgKGNvbW1hbmQgIT09IFNob3dUb29sdGlwQ29tbWFuZCB8fCB0aGlzLmhvdmVyKSAvKiBcIlNob3cgSG92ZXJcIiBpcyBvbmx5IHZhbGlkIHdoZW4gd2UgaGF2ZSBhIGhvdmVyICovKSB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZE1vdXNlTGlzdGVuZXIudmFsdWUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5sYWJlbENvbnRhaW5lciwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQpKTtcblx0XHRcdFx0dGhpcy5jb21tYW5kVG91Y2hMaXN0ZW5lci52YWx1ZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxhYmVsQ29udGFpbmVyLCBUb3VjaEV2ZW50VHlwZS5UYXAsICgpID0+IHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCkpO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRLZXlib2FyZExpc3RlbmVyLnZhbHVlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMubGFiZWxDb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLmhvdmVyPy5oaWRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLmxhYmVsQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxhYmVsQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlOiBCZWFrXG5cdFx0aWYgKCF0aGlzLmVudHJ5IHx8IGVudHJ5LnNob3dCZWFrICE9PSB0aGlzLmVudHJ5LnNob3dCZWFrKSB7XG5cdFx0XHRpZiAoZW50cnkuc2hvd0JlYWspIHtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGFzLWJlYWsnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1iZWFrJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQmFja2dyb3VuZENvbG9yID0gISFlbnRyeS5iYWNrZ3JvdW5kQ29sb3IgfHwgKGVudHJ5LmtpbmQgJiYgZW50cnkua2luZCAhPT0gJ3N0YW5kYXJkJyk7XG5cblx0XHQvLyBVcGRhdGU6IEtpbmRcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkua2luZCAhPT0gdGhpcy5lbnRyeS5raW5kKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgU3RhdHVzYmFyRW50cnlLaW5kcykge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGAke2tpbmR9LWtpbmRgKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVudHJ5LmtpbmQgJiYgZW50cnkua2luZCAhPT0gJ3N0YW5kYXJkJykge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGAke2VudHJ5LmtpbmR9LWtpbmRgKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWJhY2tncm91bmQtY29sb3InLCBoYXNCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZTogRm9yZWdyb3VuZFxuXHRcdGlmICghdGhpcy5lbnRyeSB8fCBlbnRyeS5jb2xvciAhPT0gdGhpcy5lbnRyeS5jb2xvcikge1xuXHRcdFx0dGhpcy5hcHBseUNvbG9yKHRoaXMubGFiZWxDb250YWluZXIsIGVudHJ5LmNvbG9yKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGU6IEJhY2tncm91bmRcblx0XHRpZiAoIXRoaXMuZW50cnkgfHwgZW50cnkuYmFja2dyb3VuZENvbG9yICE9PSB0aGlzLmVudHJ5LmJhY2tncm91bmRDb2xvcikge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWJhY2tncm91bmQtY29sb3InLCBoYXNCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdFx0dGhpcy5hcHBseUNvbG9yKHRoaXMuY29udGFpbmVyLCBlbnRyeS5iYWNrZ3JvdW5kQ29sb3IsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGZvciBuZXh0IHJvdW5kXG5cdFx0dGhpcy5lbnRyeSA9IGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBpc0VxdWFsVG9vbHRpcCh7IHRvb2x0aXAgfTogSVN0YXR1c2JhckVudHJ5LCB7IHRvb2x0aXA6IG90aGVyVG9vbHRpcCB9OiBJU3RhdHVzYmFyRW50cnkpIHtcblx0XHRpZiAodG9vbHRpcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gb3RoZXJUb29sdGlwID09PSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcodG9vbHRpcCkpIHtcblx0XHRcdHJldHVybiBpc01hcmtkb3duU3RyaW5nKG90aGVyVG9vbHRpcCkgJiYgbWFya2Rvd25TdHJpbmdFcXVhbCh0b29sdGlwLCBvdGhlclRvb2x0aXApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b29sdGlwID09PSBvdGhlclRvb2x0aXA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4ZWN1dGVDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyB8IENvbW1hbmQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEN1c3RvbSBjb21tYW5kIGZyb20gdXM6IFNob3cgdG9vbHRpcFxuXHRcdGlmIChjb21tYW5kID09PSBTaG93VG9vbHRpcENvbW1hbmQpIHtcblx0XHRcdHRoaXMuaG92ZXI/LnNob3codHJ1ZSAvKiBmb2N1cyAqLyk7XG5cdFx0fVxuXG5cdFx0Ly8gQW55IG90aGVyIGNvbW1hbmQgaXMgZ29pbmcgdGhyb3VnaCBjb21tYW5kIHNlcnZpY2Vcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGlkID0gdHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnID8gY29tbWFuZCA6IGNvbW1hbmQuaWQ7XG5cdFx0XHRjb25zdCBhcmdzID0gdHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnID8gW10gOiBjb21tYW5kLmFyZ3VtZW50cyA/PyBbXTtcblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZCwgZnJvbTogJ3N0YXR1cyBiYXInIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCwgLi4uYXJncyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IodG9FcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5Q29sb3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY29sb3I6IHN0cmluZyB8IFRoZW1lQ29sb3IgfCB1bmRlZmluZWQsIGlzQmFja2dyb3VuZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgY29sb3JSZXN1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpc0JhY2tncm91bmQpIHtcblx0XHRcdHRoaXMuYmFja2dyb3VuZExpc3RlbmVyLmNsZWFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9yZWdyb3VuZExpc3RlbmVyLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRpZiAoaXNUaGVtZUNvbG9yKGNvbG9yKSkge1xuXHRcdFx0XHRjb2xvclJlc3VsdCA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihjb2xvci5pZCk/LnRvU3RyaW5nKCk7XG5cblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhlbWUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbG9yVmFsdWUgPSB0aGVtZS5nZXRDb2xvcihjb2xvci5pZCk/LnRvU3RyaW5nKCk7XG5cblx0XHRcdFx0XHRpZiAoaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29sb3JWYWx1ZSA/PyAnJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29udGFpbmVyLnN0eWxlLmNvbG9yID0gY29sb3JWYWx1ZSA/PyAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChpc0JhY2tncm91bmQpIHtcblx0XHRcdFx0XHR0aGlzLmJhY2tncm91bmRMaXN0ZW5lci52YWx1ZSA9IGxpc3RlbmVyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZm9yZWdyb3VuZExpc3RlbmVyLnZhbHVlID0gbGlzdGVuZXI7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbG9yUmVzdWx0ID0gY29sb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGNvbG9yUmVzdWx0ID8/ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuY29sb3IgPSBjb2xvclJlc3VsdCA/PyAnJztcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU3RhdHVzQmFyQ29kaWNvbkxhYmVsIGV4dGVuZHMgU2ltcGxlSWNvbkxhYmVsIHtcblxuXHRwcml2YXRlIHByb2dyZXNzQ29kaWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50VGV4dCA9ICcnO1xuXHRwcml2YXRlIGN1cnJlbnRTaG93UHJvZ3Jlc3M6IGJvb2xlYW4gfCAnbG9hZGluZycgfCAnc3luY2luZycgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnRcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyKTtcblx0fVxuXG5cdHNldCBzaG93UHJvZ3Jlc3Moc2hvd1Byb2dyZXNzOiBib29sZWFuIHwgJ2xvYWRpbmcnIHwgJ3N5bmNpbmcnKSB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFNob3dQcm9ncmVzcyAhPT0gc2hvd1Byb2dyZXNzKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRTaG93UHJvZ3Jlc3MgPSBzaG93UHJvZ3Jlc3M7XG5cdFx0XHRpZiAoc2hvd1Byb2dyZXNzKSB7XG5cdFx0XHRcdHRoaXMucHJvZ3Jlc3NDb2RpY29uID0gcmVuZGVySWNvbihzaG93UHJvZ3Jlc3MgPT09ICdzeW5jaW5nJyA/IHN5bmNpbmcgOiBzcGlubmluZ0xvYWRpbmcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50ZXh0ID0gdGhpcy5jdXJyZW50VGV4dDtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgdGV4dCh0ZXh0OiBzdHJpbmcpIHtcblxuXHRcdC8vIFByb2dyZXNzOiBpbnNlcnQgcHJvZ3Jlc3MgY29kaWNvbiBhcyBmaXJzdCBlbGVtZW50IGFzIG5lZWRlZFxuXHRcdC8vIGJ1dCBrZWVwIGl0IHN0YWJsZSBzbyB0aGF0IHRoZSBhbmltYXRpb24gZG9lcyBub3QgcmVzZXRcblx0XHRpZiAodGhpcy5jdXJyZW50U2hvd1Byb2dyZXNzICYmIHRoaXMucHJvZ3Jlc3NDb2RpY29uKSB7XG5cblx0XHRcdC8vIEFwcGVuZCBhcyBuZWVkZWRcblx0XHRcdGlmICh0aGlzLmNvbnRhaW5lci5maXJzdENoaWxkICE9PSB0aGlzLnByb2dyZXNzQ29kaWNvbikge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnByb2dyZXNzQ29kaWNvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbW92ZSBvdGhlcnNcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBBcnJheS5mcm9tKHRoaXMuY29udGFpbmVyLmNoaWxkTm9kZXMpKSB7XG5cdFx0XHRcdGlmIChub2RlICE9PSB0aGlzLnByb2dyZXNzQ29kaWNvbikge1xuXHRcdFx0XHRcdG5vZGUucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2UgaGF2ZSB0ZXh0IHRvIHNob3csIGFkZCBhIHNwYWNlIHRvIHNlcGFyYXRlIGZyb20gcHJvZ3Jlc3Ncblx0XHRcdGxldCB0ZXh0Q29udGVudCA9IHRleHQgPz8gJyc7XG5cdFx0XHRpZiAodGV4dENvbnRlbnQpIHtcblx0XHRcdFx0dGV4dENvbnRlbnQgPSBgXFx1MDBBMCR7dGV4dENvbnRlbnR9YDsgLy8gcHJlcGVuZCBub24tYnJlYWtpbmcgc3BhY2Vcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXBwZW5kIG5ldyBlbGVtZW50c1xuXHRcdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyh0ZXh0Q29udGVudCkpO1xuXHRcdH1cblxuXHRcdC8vIE5vIFByb2dyZXNzOiBubyBzcGVjaWFsIGhhbmRsaW5nXG5cdFx0ZWxzZSB7XG5cdFx0XHRzdXBlci50ZXh0ID0gdGV4dDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFT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
