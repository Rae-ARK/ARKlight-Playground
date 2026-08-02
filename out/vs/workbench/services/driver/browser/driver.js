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
import { getClientArea, getTopLeftOffset, isHTMLDivElement, isHTMLTextAreaElement } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { language, locale } from "../../../../base/common/platform.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import localizedStrings from "../../../../platform/languagePacks/common/localizedStrings.js";
import { getLogs } from "../../../../platform/log/browser/log.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
let BrowserWindowDriver = class {
  constructor(fileService, environmentService, lifecycleService, logService) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.lifecycleService = lifecycleService;
    this.logService = logService;
  }
  async getLogs() {
    return getLogs(this.fileService, this.environmentService);
  }
  async whenWorkbenchRestored() {
    this.logService.info("[driver] Waiting for restored lifecycle phase...");
    await this.lifecycleService.when(LifecyclePhase.Restored);
    this.logService.info("[driver] Restored lifecycle phase reached. Waiting for contributions...");
    await Registry.as(WorkbenchExtensions.Workbench).whenRestored;
    this.logService.info("[driver] Workbench contributions created.");
  }
  async setValue(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      return Promise.reject(new Error(`Element not found: ${selector}`));
    }
    const inputElement = element;
    inputElement.value = text;
    const event = new Event("input", { bubbles: true, cancelable: true });
    inputElement.dispatchEvent(event);
  }
  async isActiveElement(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (element !== mainWindow.document.activeElement) {
      const chain = [];
      let el = mainWindow.document.activeElement;
      while (el) {
        const tagName = el.tagName;
        const id = el.id ? `#${el.id}` : "";
        const classes = coalesce(el.className.split(/\s+/g).map((c) => c.trim())).map((c) => `.${c}`).join("");
        chain.unshift(`${tagName}${id}${classes}`);
        el = el.parentElement;
      }
      throw new Error(`Active element not found. Current active element is '${chain.join(" > ")}'. Looking for ${selector}`);
    }
    return true;
  }
  async getElements(selector, recursive) {
    const query = mainWindow.document.querySelectorAll(selector);
    const result = [];
    for (let i = 0; i < query.length; i++) {
      const element = query.item(i);
      result.push(this.serializeElement(element, recursive));
    }
    return result;
  }
  serializeElement(element, recursive) {
    const attributes = /* @__PURE__ */ Object.create(null);
    for (let j = 0; j < element.attributes.length; j++) {
      const attr = element.attributes.item(j);
      if (attr) {
        attributes[attr.name] = attr.value;
      }
    }
    const children = [];
    if (recursive) {
      for (let i = 0; i < element.children.length; i++) {
        const child = element.children.item(i);
        if (child) {
          children.push(this.serializeElement(child, true));
        }
      }
    }
    const { left, top } = getTopLeftOffset(element);
    return {
      tagName: element.tagName,
      className: element.className,
      textContent: element.textContent || "",
      attributes,
      children,
      left,
      top
    };
  }
  async getElementXY(selector, xoffset, yoffset) {
    const offset = typeof xoffset === "number" && typeof yoffset === "number" ? { x: xoffset, y: yoffset } : void 0;
    return this._getElementXY(selector, offset);
  }
  async typeInEditor(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Editor not found: ${selector}`);
    }
    if (isHTMLDivElement(element)) {
      const editContext = element.editContext;
      if (!editContext) {
        throw new Error(`Edit context not found: ${selector}`);
      }
      const selectionStart = editContext.selectionStart;
      const selectionEnd = editContext.selectionEnd;
      const event = new TextUpdateEvent("textupdate", {
        updateRangeStart: selectionStart,
        updateRangeEnd: selectionEnd,
        text,
        selectionStart: selectionStart + text.length,
        selectionEnd: selectionStart + text.length,
        compositionStart: 0,
        compositionEnd: 0
      });
      editContext.dispatchEvent(event);
    } else if (isHTMLTextAreaElement(element)) {
      const start = element.selectionStart;
      const newStart = start + text.length;
      const value = element.value;
      const newValue = value.substr(0, start) + text + value.substr(start);
      element.value = newValue;
      element.setSelectionRange(newStart, newStart);
      const event = new Event("input", { "bubbles": true, "cancelable": true });
      element.dispatchEvent(event);
    }
  }
  async getEditorSelection(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Editor not found: ${selector}`);
    }
    if (isHTMLDivElement(element)) {
      const editContext = element.editContext;
      if (!editContext) {
        throw new Error(`Edit context not found: ${selector}`);
      }
      return { selectionStart: editContext.selectionStart, selectionEnd: editContext.selectionEnd };
    } else if (isHTMLTextAreaElement(element)) {
      return { selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
    } else {
      throw new Error(`Unknown type of element: ${selector}`);
    }
  }
  async getTerminalBuffer(selector) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Terminal not found: ${selector}`);
    }
    const xterm = element.xterm;
    if (!xterm) {
      throw new Error(`Xterm not found: ${selector}`);
    }
    const lines = [];
    for (let i = 0; i < xterm.buffer.active.length; i++) {
      lines.push(xterm.buffer.active.getLine(i).translateToString(true));
    }
    return lines;
  }
  async writeInTerminal(selector, text) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    const xterm = element.xterm;
    if (!xterm) {
      throw new Error(`Xterm not found: ${selector}`);
    }
    xterm.input(text);
  }
  getLocaleInfo() {
    return Promise.resolve({
      language,
      locale
    });
  }
  getLocalizedStrings() {
    return Promise.resolve({
      open: localizedStrings.open,
      close: localizedStrings.close,
      find: localizedStrings.find
    });
  }
  async _getElementXY(selector, offset) {
    const element = mainWindow.document.querySelector(selector);
    if (!element) {
      return Promise.reject(new Error(`Element not found: ${selector}`));
    }
    const { left, top } = getTopLeftOffset(element);
    const { width, height } = getClientArea(element);
    let x, y;
    if (offset) {
      x = left + offset.x;
      y = top + offset.y;
    } else {
      x = left + width / 2;
      y = top + height / 2;
    }
    x = Math.round(x);
    y = Math.round(y);
    return { x, y };
  }
};
BrowserWindowDriver = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, ILogService)
], BrowserWindowDriver);
function registerWindowDriver(instantiationService) {
  Object.assign(mainWindow, { driver: instantiationService.createInstance(BrowserWindowDriver) });
}
export {
  BrowserWindowDriver,
  registerWindowDriver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kcml2ZXIvYnJvd3Nlci9kcml2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRDbGllbnRBcmVhLCBnZXRUb3BMZWZ0T2Zmc2V0LCBpc0hUTUxEaXZFbGVtZW50LCBpc0hUTUxUZXh0QXJlYUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGxhbmd1YWdlLCBsb2NhbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCBsb2NhbGl6ZWRTdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xvY2FsaXplZFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxvZ0ZpbGUsIGdldExvZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvYnJvd3Nlci9sb2cuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV2luZG93RHJpdmVyLCBJRWxlbWVudCwgSUxvY2FsZUluZm8sIElMb2NhbGl6ZWRTdHJpbmdzIH0gZnJvbSAnLi4vY29tbW9uL2RyaXZlci5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIGFzIFh0ZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuXG5leHBvcnQgY2xhc3MgQnJvd3NlcldpbmRvd0RyaXZlciBpbXBsZW1lbnRzIElXaW5kb3dEcml2ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9ncygpOiBQcm9taXNlPElMb2dGaWxlW10+IHtcblx0XHRyZXR1cm4gZ2V0TG9ncyh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyB3aGVuV29ya2JlbmNoUmVzdG9yZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tkcml2ZXJdIFdhaXRpbmcgZm9yIHJlc3RvcmVkIGxpZmVjeWNsZSBwaGFzZS4uLicpO1xuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW2RyaXZlcl0gUmVzdG9yZWQgbGlmZWN5Y2xlIHBoYXNlIHJlYWNoZWQuIFdhaXRpbmcgZm9yIGNvbnRyaWJ1dGlvbnMuLi4nKTtcblx0XHRhd2FpdCBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkud2hlblJlc3RvcmVkO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbZHJpdmVyXSBXb3JrYmVuY2ggY29udHJpYnV0aW9ucyBjcmVhdGVkLicpO1xuXHR9XG5cblx0YXN5bmMgc2V0VmFsdWUoc2VsZWN0b3I6IHN0cmluZywgdGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSBlbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cdFx0aW5wdXRFbGVtZW50LnZhbHVlID0gdGV4dDtcblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KTtcblx0XHRpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdH1cblxuXHRhc3luYyBpc0FjdGl2ZUVsZW1lbnQoc2VsZWN0b3I6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG5cdFx0aWYgKGVsZW1lbnQgIT09IG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgY2hhaW46IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgZWwgPSBtYWluV2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cblx0XHRcdHdoaWxlIChlbCkge1xuXHRcdFx0XHRjb25zdCB0YWdOYW1lID0gZWwudGFnTmFtZTtcblx0XHRcdFx0Y29uc3QgaWQgPSBlbC5pZCA/IGAjJHtlbC5pZH1gIDogJyc7XG5cdFx0XHRcdGNvbnN0IGNsYXNzZXMgPSBjb2FsZXNjZShlbC5jbGFzc05hbWUuc3BsaXQoL1xccysvZykubWFwKGMgPT4gYy50cmltKCkpKS5tYXAoYyA9PiBgLiR7Y31gKS5qb2luKCcnKTtcblx0XHRcdFx0Y2hhaW4udW5zaGlmdChgJHt0YWdOYW1lfSR7aWR9JHtjbGFzc2VzfWApO1xuXG5cdFx0XHRcdGVsID0gZWwucGFyZW50RWxlbWVudDtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBY3RpdmUgZWxlbWVudCBub3QgZm91bmQuIEN1cnJlbnQgYWN0aXZlIGVsZW1lbnQgaXMgJyR7Y2hhaW4uam9pbignID4gJyl9Jy4gTG9va2luZyBmb3IgJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGdldEVsZW1lbnRzKHNlbGVjdG9yOiBzdHJpbmcsIHJlY3Vyc2l2ZTogYm9vbGVhbik6IFByb21pc2U8SUVsZW1lbnRbXT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHF1ZXJ5ID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcblx0XHRjb25zdCByZXN1bHQ6IElFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXJ5Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gcXVlcnkuaXRlbShpKTtcblx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuc2VyaWFsaXplRWxlbWVudChlbGVtZW50LCByZWN1cnNpdmUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXJpYWxpemVFbGVtZW50KGVsZW1lbnQ6IEVsZW1lbnQsIHJlY3Vyc2l2ZTogYm9vbGVhbik6IElFbGVtZW50IHtcblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdGZvciAobGV0IGogPSAwOyBqIDwgZWxlbWVudC5hdHRyaWJ1dGVzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRjb25zdCBhdHRyID0gZWxlbWVudC5hdHRyaWJ1dGVzLml0ZW0oaik7XG5cdFx0XHRpZiAoYXR0cikge1xuXHRcdFx0XHRhdHRyaWJ1dGVzW2F0dHIubmFtZV0gPSBhdHRyLnZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkcmVuOiBJRWxlbWVudFtdID0gW107XG5cblx0XHRpZiAocmVjdXJzaXZlKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hpbGQgPSBlbGVtZW50LmNoaWxkcmVuLml0ZW0oaSk7XG5cdFx0XHRcdGlmIChjaGlsZCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2godGhpcy5zZXJpYWxpemVFbGVtZW50KGNoaWxkLCB0cnVlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB7IGxlZnQsIHRvcCB9ID0gZ2V0VG9wTGVmdE9mZnNldChlbGVtZW50IGFzIEhUTUxFbGVtZW50KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0YWdOYW1lOiBlbGVtZW50LnRhZ05hbWUsXG5cdFx0XHRjbGFzc05hbWU6IGVsZW1lbnQuY2xhc3NOYW1lLFxuXHRcdFx0dGV4dENvbnRlbnQ6IGVsZW1lbnQudGV4dENvbnRlbnQgfHwgJycsXG5cdFx0XHRhdHRyaWJ1dGVzLFxuXHRcdFx0Y2hpbGRyZW4sXG5cdFx0XHRsZWZ0LFxuXHRcdFx0dG9wXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldEVsZW1lbnRYWShzZWxlY3Rvcjogc3RyaW5nLCB4b2Zmc2V0PzogbnVtYmVyLCB5b2Zmc2V0PzogbnVtYmVyKTogUHJvbWlzZTx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+IHtcblx0XHRjb25zdCBvZmZzZXQgPSB0eXBlb2YgeG9mZnNldCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHlvZmZzZXQgPT09ICdudW1iZXInID8geyB4OiB4b2Zmc2V0LCB5OiB5b2Zmc2V0IH0gOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEVsZW1lbnRYWShzZWxlY3Rvciwgb2Zmc2V0KTtcblx0fVxuXG5cdGFzeW5jIHR5cGVJbkVkaXRvcihzZWxlY3Rvcjogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBlbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblxuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFZGl0b3Igbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblx0XHRpZiAoaXNIVE1MRGl2RWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Ly8gRWRpdCBjb250ZXh0IGlzIGVuYWJsZWRcblx0XHRcdGNvbnN0IGVkaXRDb250ZXh0ID0gZWxlbWVudC5lZGl0Q29udGV4dDtcblx0XHRcdGlmICghZWRpdENvbnRleHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFZGl0IGNvbnRleHQgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnQgPSBlZGl0Q29udGV4dC5zZWxlY3Rpb25TdGFydDtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbkVuZCA9IGVkaXRDb250ZXh0LnNlbGVjdGlvbkVuZDtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFRleHRVcGRhdGVFdmVudCgndGV4dHVwZGF0ZScsIHtcblx0XHRcdFx0dXBkYXRlUmFuZ2VTdGFydDogc2VsZWN0aW9uU3RhcnQsXG5cdFx0XHRcdHVwZGF0ZVJhbmdlRW5kOiBzZWxlY3Rpb25FbmQsXG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0OiBzZWxlY3Rpb25TdGFydCArIHRleHQubGVuZ3RoLFxuXHRcdFx0XHRzZWxlY3Rpb25FbmQ6IHNlbGVjdGlvblN0YXJ0ICsgdGV4dC5sZW5ndGgsXG5cdFx0XHRcdGNvbXBvc2l0aW9uU3RhcnQ6IDAsXG5cdFx0XHRcdGNvbXBvc2l0aW9uRW5kOiAwXG5cdFx0XHR9KTtcblx0XHRcdGVkaXRDb250ZXh0LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRcdH0gZWxzZSBpZiAoaXNIVE1MVGV4dEFyZWFFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IGVsZW1lbnQuc2VsZWN0aW9uU3RhcnQ7XG5cdFx0XHRjb25zdCBuZXdTdGFydCA9IHN0YXJ0ICsgdGV4dC5sZW5ndGg7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGVsZW1lbnQudmFsdWU7XG5cdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHZhbHVlLnN1YnN0cigwLCBzdGFydCkgKyB0ZXh0ICsgdmFsdWUuc3Vic3RyKHN0YXJ0KTtcblxuXHRcdFx0ZWxlbWVudC52YWx1ZSA9IG5ld1ZhbHVlO1xuXHRcdFx0ZWxlbWVudC5zZXRTZWxlY3Rpb25SYW5nZShuZXdTdGFydCwgbmV3U3RhcnQpO1xuXG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBFdmVudCgnaW5wdXQnLCB7ICdidWJibGVzJzogdHJ1ZSwgJ2NhbmNlbGFibGUnOiB0cnVlIH0pO1xuXHRcdFx0ZWxlbWVudC5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRFZGl0b3JTZWxlY3Rpb24oc2VsZWN0b3I6IHN0cmluZyk6IFByb21pc2U8eyBzZWxlY3Rpb25TdGFydDogbnVtYmVyOyBzZWxlY3Rpb25FbmQ6IG51bWJlciB9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEVkaXRvciBub3QgZm91bmQ6ICR7c2VsZWN0b3J9YCk7XG5cdFx0fVxuXHRcdGlmIChpc0hUTUxEaXZFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBlZGl0Q29udGV4dCA9IGVsZW1lbnQuZWRpdENvbnRleHQ7XG5cdFx0XHRpZiAoIWVkaXRDb250ZXh0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRWRpdCBjb250ZXh0IG5vdCBmb3VuZDogJHtzZWxlY3Rvcn1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHNlbGVjdGlvblN0YXJ0OiBlZGl0Q29udGV4dC5zZWxlY3Rpb25TdGFydCwgc2VsZWN0aW9uRW5kOiBlZGl0Q29udGV4dC5zZWxlY3Rpb25FbmQgfTtcblx0XHR9IGVsc2UgaWYgKGlzSFRNTFRleHRBcmVhRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHsgc2VsZWN0aW9uU3RhcnQ6IGVsZW1lbnQuc2VsZWN0aW9uU3RhcnQsIHNlbGVjdGlvbkVuZDogZWxlbWVudC5zZWxlY3Rpb25FbmQgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHR5cGUgb2YgZWxlbWVudDogJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRUZXJtaW5hbEJ1ZmZlcihzZWxlY3Rvcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsIG5vdCBmb3VuZDogJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRjb25zdCB4dGVybSA9IChlbGVtZW50IGFzIGFueSkueHRlcm07XG5cblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFh0ZXJtIG5vdCBmb3VuZDogJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHh0ZXJtLmJ1ZmZlci5hY3RpdmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGxpbmVzLnB1c2goeHRlcm0uYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKGkpIS50cmFuc2xhdGVUb1N0cmluZyh0cnVlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmVzO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVJblRlcm1pbmFsKHNlbGVjdG9yOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGNvbnN0IHh0ZXJtID0gKGVsZW1lbnQgYXMgYW55KS54dGVybSBhcyAoWHRlcm1UZXJtaW5hbCB8IHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFh0ZXJtIG5vdCBmb3VuZDogJHtzZWxlY3Rvcn1gKTtcblx0XHR9XG5cblx0XHR4dGVybS5pbnB1dCh0ZXh0KTtcblx0fVxuXG5cdGdldExvY2FsZUluZm8oKTogUHJvbWlzZTxJTG9jYWxlSW5mbz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxuXHRcdFx0bG9jYWxlOiBsb2NhbGVcblx0XHR9KTtcblx0fVxuXG5cdGdldExvY2FsaXplZFN0cmluZ3MoKTogUHJvbWlzZTxJTG9jYWxpemVkU3RyaW5ncz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0b3BlbjogbG9jYWxpemVkU3RyaW5ncy5vcGVuLFxuXHRcdFx0Y2xvc2U6IGxvY2FsaXplZFN0cmluZ3MuY2xvc2UsXG5cdFx0XHRmaW5kOiBsb2NhbGl6ZWRTdHJpbmdzLmZpbmRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0RWxlbWVudFhZKHNlbGVjdG9yOiBzdHJpbmcsIG9mZnNldD86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IFByb21pc2U8eyB4OiBudW1iZXI7IHk6IG51bWJlciB9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYEVsZW1lbnQgbm90IGZvdW5kOiAke3NlbGVjdG9yfWApKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxlZnQsIHRvcCB9ID0gZ2V0VG9wTGVmdE9mZnNldChlbGVtZW50IGFzIEhUTUxFbGVtZW50KTtcblx0XHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IGdldENsaWVudEFyZWEoZWxlbWVudCBhcyBIVE1MRWxlbWVudCk7XG5cdFx0bGV0IHg6IG51bWJlciwgeTogbnVtYmVyO1xuXG5cdFx0aWYgKG9mZnNldCkge1xuXHRcdFx0eCA9IGxlZnQgKyBvZmZzZXQueDtcblx0XHRcdHkgPSB0b3AgKyBvZmZzZXQueTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0eCA9IGxlZnQgKyAod2lkdGggLyAyKTtcblx0XHRcdHkgPSB0b3AgKyAoaGVpZ2h0IC8gMik7XG5cdFx0fVxuXG5cdFx0eCA9IE1hdGgucm91bmQoeCk7XG5cdFx0eSA9IE1hdGgucm91bmQoeSk7XG5cblx0XHRyZXR1cm4geyB4LCB5IH07XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyV2luZG93RHJpdmVyKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0T2JqZWN0LmFzc2lnbihtYWluV2luZG93LCB7IGRyaXZlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlcldpbmRvd0RyaXZlcikgfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZSxrQkFBa0Isa0JBQWtCLDZCQUE2QjtBQUN6RixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUU3QixPQUFPLHNCQUFzQjtBQUM3QixTQUFtQixlQUFlO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMs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
