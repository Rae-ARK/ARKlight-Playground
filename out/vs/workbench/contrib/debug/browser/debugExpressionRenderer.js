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
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { Expression, ExpressionContainer, Variable } from "../common/debugModel.js";
import { ReplEvaluationResult } from "../common/replModel.js";
import { splitExpressionOrScopeHighlights } from "./baseDebugView.js";
import { handleANSIOutput } from "./debugANSIHandling.js";
import { COPY_EVALUATE_PATH_ID, COPY_VALUE_ID } from "./debugCommands.js";
import { DebugLinkHoverBehavior, LinkDetector } from "./linkDetector.js";
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
const booleanRegex = /^(true|false)$/i;
const stringRegex = /^(['"]).*\1$/;
var Cls = /* @__PURE__ */ ((Cls2) => {
  Cls2["Value"] = "value";
  Cls2["Unavailable"] = "unavailable";
  Cls2["Error"] = "error";
  Cls2["Changed"] = "changed";
  Cls2["Boolean"] = "boolean";
  Cls2["String"] = "string";
  Cls2["Number"] = "number";
  return Cls2;
})(Cls || {});
const allClasses = Object.keys({
  ["value" /* Value */]: 0,
  ["unavailable" /* Unavailable */]: 0,
  ["error" /* Error */]: 0,
  ["changed" /* Changed */]: 0,
  ["boolean" /* Boolean */]: 0,
  ["string" /* String */]: 0,
  ["number" /* Number */]: 0
});
let DebugExpressionRenderer = class {
  constructor(commandService, configurationService, instantiationService, hoverService) {
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.linkDetector = instantiationService.createInstance(LinkDetector);
    this.displayType = observableConfigValue("debug.showVariableTypes", false, configurationService);
  }
  renderVariable(data, variable, options = {}) {
    const displayType = this.displayType.get();
    const highlights = splitExpressionOrScopeHighlights(variable, options.highlights || []);
    if (variable.available) {
      data.type.textContent = "";
      let text = variable.name;
      if (variable.value && typeof variable.name === "string") {
        if (variable.type && displayType) {
          text += ": ";
          data.type.textContent = variable.type + " =";
        } else {
          text += " =";
        }
      }
      data.label.set(text, highlights.name, variable.type && !displayType ? variable.type : variable.name);
      data.name.classList.toggle("virtual", variable.presentationHint?.kind === "virtual");
      data.name.classList.toggle("internal", variable.presentationHint?.visibility === "internal");
    } else if (variable.value && typeof variable.name === "string" && variable.name) {
      data.label.set(":");
    }
    data.expression.classList.toggle("lazy", !!variable.presentationHint?.lazy);
    const commands = [
      { id: COPY_VALUE_ID, args: [variable, [variable]] }
    ];
    if (variable.evaluateName) {
      commands.push({ id: COPY_EVALUATE_PATH_ID, args: [{ variable }] });
    }
    return this.renderValue(data.value, variable, {
      showChanged: options.showChanged,
      maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
      hover: { commands },
      highlights: highlights.value,
      colorize: true,
      session: variable.getSession()
    });
  }
  renderValue(container, expressionOrValue, options = {}) {
    const store = new DisposableStore();
    const supportsANSI = options.session?.rememberedCapabilities?.supportsANSIStyling ?? options.wasANSI ?? false;
    let value = typeof expressionOrValue === "string" ? expressionOrValue : expressionOrValue.value;
    for (const cls of allClasses) {
      container.classList.remove(cls);
    }
    container.classList.add("value" /* Value */);
    if (value === null || (expressionOrValue instanceof Expression || expressionOrValue instanceof Variable || expressionOrValue instanceof ReplEvaluationResult) && !expressionOrValue.available) {
      container.classList.add("unavailable" /* Unavailable */);
      if (value !== Expression.DEFAULT_VALUE) {
        container.classList.add("error" /* Error */);
      }
    } else {
      if (typeof expressionOrValue !== "string" && options.showChanged && expressionOrValue.valueChanged && value !== Expression.DEFAULT_VALUE) {
        container.classList.add("changed" /* Changed */);
        expressionOrValue.valueChanged = false;
      }
      if (options.colorize && typeof expressionOrValue !== "string") {
        if (expressionOrValue.type === "number" || expressionOrValue.type === "boolean" || expressionOrValue.type === "string") {
          container.classList.add(expressionOrValue.type);
        } else if (!isNaN(+value)) {
          container.classList.add("number" /* Number */);
        } else if (booleanRegex.test(value)) {
          container.classList.add("boolean" /* Boolean */);
        } else if (stringRegex.test(value)) {
          container.classList.add("string" /* String */);
        }
      }
    }
    if (options.maxValueLength && value && value.length > options.maxValueLength) {
      value = value.substring(0, options.maxValueLength) + "...";
    }
    if (!value) {
      value = "";
    }
    const session = options.session ?? (expressionOrValue instanceof ExpressionContainer ? expressionOrValue.getSession() : void 0);
    const hoverBehavior = options.hover === false ? { type: DebugLinkHoverBehavior.Rich, store } : { type: DebugLinkHoverBehavior.None, store };
    dom.clearNode(container);
    const locationReference = options.locationReference ?? (expressionOrValue instanceof ExpressionContainer && expressionOrValue.valueLocationReference);
    let linkDetector = this.linkDetector;
    if (locationReference && session) {
      linkDetector = this.linkDetector.makeReferencedLinkDetector(locationReference, session);
    }
    if (supportsANSI) {
      container.appendChild(handleANSIOutput(value, linkDetector, session ? session.root : void 0, options.highlights, hoverBehavior));
    } else {
      container.appendChild(linkDetector.linkify(value, hoverBehavior, false, session?.root, true, options.highlights));
    }
    if (options.hover !== false) {
      const { commands = [] } = options.hover || {};
      store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), container, () => {
        const container2 = dom.$("div");
        const markdownHoverElement = dom.$("div.hover-row");
        const hoverContentsElement = dom.append(markdownHoverElement, dom.$("div.hover-contents"));
        const hoverContentsPre = dom.append(hoverContentsElement, dom.$("pre.debug-var-hover-pre"));
        if (supportsANSI) {
          hoverContentsPre.appendChild(handleANSIOutput(value, this.linkDetector, session ? session.root : void 0, options.highlights, hoverBehavior));
        } else {
          hoverContentsPre.textContent = value;
        }
        container2.appendChild(markdownHoverElement);
        return container2;
      }, {
        actions: commands.map(({ id, args }) => {
          const description = CommandsRegistry.getCommand(id)?.metadata?.description;
          return {
            label: typeof description === "string" ? description : description ? description.value : id,
            commandId: id,
            run: () => this.commandService.executeCommand(id, ...args)
          };
        })
      }));
    }
    return store;
  }
};
DebugExpressionRenderer = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IHoverService)
], DebugExpressionRenderer);
export {
  DebugExpressionRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdFeHByZXNzaW9uUmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1Nlc3Npb24sIElFeHByZXNzaW9uVmFsdWUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRXhwcmVzc2lvbiwgRXhwcmVzc2lvbkNvbnRhaW5lciwgVmFyaWFibGUgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXBsRXZhbHVhdGlvblJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9yZXBsTW9kZWwuanMnO1xuaW1wb3J0IHsgSVZhcmlhYmxlVGVtcGxhdGVEYXRhLCBzcGxpdEV4cHJlc3Npb25PclNjb3BlSGlnaGxpZ2h0cyB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5pbXBvcnQgeyBoYW5kbGVBTlNJT3V0cHV0IH0gZnJvbSAnLi9kZWJ1Z0FOU0lIYW5kbGluZy5qcyc7XG5pbXBvcnQgeyBDT1BZX0VWQUxVQVRFX1BBVEhfSUQsIENPUFlfVkFMVUVfSUQgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRGVidWdMaW5rSG92ZXJCZWhhdmlvciwgRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhLCBJTGlua0RldGVjdG9yLCBMaW5rRGV0ZWN0b3IgfSBmcm9tICcuL2xpbmtEZXRlY3Rvci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZhbHVlSG92ZXJPcHRpb25zIHtcblx0LyoqIENvbW1hbmRzIHRvIHNob3cgaW4gdGhlIGhvdmVyIGZvb3Rlci4gKi9cblx0Y29tbWFuZHM/OiB7IGlkOiBzdHJpbmc7IGFyZ3M6IHVua25vd25bXSB9W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbmRlclZhbHVlT3B0aW9ucyB7XG5cdHNob3dDaGFuZ2VkPzogYm9vbGVhbjtcblx0bWF4VmFsdWVMZW5ndGg/OiBudW1iZXI7XG5cdC8qKiBJZiBub3QgZmFsc2UsIGEgcmljaCBob3ZlciB3aWxsIGJlIHNob3duIG9uIHRoZSBlbGVtZW50LiAqL1xuXHRob3Zlcj86IGZhbHNlIHwgSVZhbHVlSG92ZXJPcHRpb25zO1xuXHRjb2xvcml6ZT86IGJvb2xlYW47XG5cdGhpZ2hsaWdodHM/OiBJSGlnaGxpZ2h0W107XG5cblx0LyoqXG5cdCAqIEluZGljYXRlcyBhcmVhcyB3aGVyZSBWUyBDb2RlIGltcGxpY2l0bHkgYWx3YXlzIHN1cHBvcnRlZCBBTlNJIGVzY2FwZVxuXHQgKiBzZXF1ZW5jZXMuIFRoZXNlIHNob3VsZCBiZSByZW5kZXJlZCBhcyBBTlNJIHdoZW4gdGhlIERBIGRvZXMgbm90IHNwZWNpZnlcblx0ICogYW55IHZhbHVlIG9mIGBzdXBwb3J0c0FOU0lTdHlsaW5nYC5cblx0ICogQGRlcHJlY2F0ZWRcblx0ICovXG5cdHdhc0FOU0k/OiBib29sZWFuO1xuXHRzZXNzaW9uPzogSURlYnVnU2Vzc2lvbjtcblx0bG9jYXRpb25SZWZlcmVuY2U/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbmRlclZhcmlhYmxlT3B0aW9ucyB7XG5cdHNob3dDaGFuZ2VkPzogYm9vbGVhbjtcblx0aGlnaGxpZ2h0cz86IElIaWdobGlnaHRbXTtcbn1cblxuXG5jb25zdCBNQVhfVkFMVUVfUkVOREVSX0xFTkdUSF9JTl9WSUVXTEVUID0gMTAyNDtcbmNvbnN0IGJvb2xlYW5SZWdleCA9IC9eKHRydWV8ZmFsc2UpJC9pO1xuY29uc3Qgc3RyaW5nUmVnZXggPSAvXihbJ1wiXSkuKlxcMSQvO1xuXG5jb25zdCBlbnVtIENscyB7XG5cdFZhbHVlID0gJ3ZhbHVlJyxcblx0VW5hdmFpbGFibGUgPSAndW5hdmFpbGFibGUnLFxuXHRFcnJvciA9ICdlcnJvcicsXG5cdENoYW5nZWQgPSAnY2hhbmdlZCcsXG5cdEJvb2xlYW4gPSAnYm9vbGVhbicsXG5cdFN0cmluZyA9ICdzdHJpbmcnLFxuXHROdW1iZXIgPSAnbnVtYmVyJyxcbn1cblxuY29uc3QgYWxsQ2xhc3NlczogcmVhZG9ubHkgQ2xzW10gPSBPYmplY3Qua2V5cyh7XG5cdFtDbHMuVmFsdWVdOiAwLFxuXHRbQ2xzLlVuYXZhaWxhYmxlXTogMCxcblx0W0Nscy5FcnJvcl06IDAsXG5cdFtDbHMuQ2hhbmdlZF06IDAsXG5cdFtDbHMuQm9vbGVhbl06IDAsXG5cdFtDbHMuU3RyaW5nXTogMCxcblx0W0Nscy5OdW1iZXJdOiAwLFxufSBzYXRpc2ZpZXMgeyBba2V5IGluIENsc106IHVua25vd24gfSkgYXMgQ2xzW107XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlciB7XG5cdHByaXZhdGUgZGlzcGxheVR5cGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGxpbmtEZXRlY3RvcjogTGlua0RldGVjdG9yO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMubGlua0RldGVjdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlua0RldGVjdG9yKTtcblx0XHR0aGlzLmRpc3BsYXlUeXBlID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKCdkZWJ1Zy5zaG93VmFyaWFibGVUeXBlcycsIGZhbHNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRyZW5kZXJWYXJpYWJsZShkYXRhOiBJVmFyaWFibGVUZW1wbGF0ZURhdGEsIHZhcmlhYmxlOiBWYXJpYWJsZSwgb3B0aW9uczogSVJlbmRlclZhcmlhYmxlT3B0aW9ucyA9IHt9KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3BsYXlUeXBlID0gdGhpcy5kaXNwbGF5VHlwZS5nZXQoKTtcblx0XHRjb25zdCBoaWdobGlnaHRzID0gc3BsaXRFeHByZXNzaW9uT3JTY29wZUhpZ2hsaWdodHModmFyaWFibGUsIG9wdGlvbnMuaGlnaGxpZ2h0cyB8fCBbXSk7XG5cblx0XHRpZiAodmFyaWFibGUuYXZhaWxhYmxlKSB7XG5cdFx0XHRkYXRhLnR5cGUudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdGxldCB0ZXh0ID0gdmFyaWFibGUubmFtZTtcblx0XHRcdGlmICh2YXJpYWJsZS52YWx1ZSAmJiB0eXBlb2YgdmFyaWFibGUubmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0aWYgKHZhcmlhYmxlLnR5cGUgJiYgZGlzcGxheVR5cGUpIHtcblx0XHRcdFx0XHR0ZXh0ICs9ICc6ICc7XG5cdFx0XHRcdFx0ZGF0YS50eXBlLnRleHRDb250ZW50ID0gdmFyaWFibGUudHlwZSArICcgPSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGV4dCArPSAnID0nO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGRhdGEubGFiZWwuc2V0KHRleHQsIGhpZ2hsaWdodHMubmFtZSwgdmFyaWFibGUudHlwZSAmJiAhZGlzcGxheVR5cGUgPyB2YXJpYWJsZS50eXBlIDogdmFyaWFibGUubmFtZSk7XG5cdFx0XHRkYXRhLm5hbWUuY2xhc3NMaXN0LnRvZ2dsZSgndmlydHVhbCcsIHZhcmlhYmxlLnByZXNlbnRhdGlvbkhpbnQ/LmtpbmQgPT09ICd2aXJ0dWFsJyk7XG5cdFx0XHRkYXRhLm5hbWUuY2xhc3NMaXN0LnRvZ2dsZSgnaW50ZXJuYWwnLCB2YXJpYWJsZS5wcmVzZW50YXRpb25IaW50Py52aXNpYmlsaXR5ID09PSAnaW50ZXJuYWwnKTtcblx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlLnZhbHVlICYmIHR5cGVvZiB2YXJpYWJsZS5uYW1lID09PSAnc3RyaW5nJyAmJiB2YXJpYWJsZS5uYW1lKSB7XG5cdFx0XHRkYXRhLmxhYmVsLnNldCgnOicpO1xuXHRcdH1cblxuXHRcdGRhdGEuZXhwcmVzc2lvbi5jbGFzc0xpc3QudG9nZ2xlKCdsYXp5JywgISF2YXJpYWJsZS5wcmVzZW50YXRpb25IaW50Py5sYXp5KTtcblx0XHRjb25zdCBjb21tYW5kcyA9IFtcblx0XHRcdHsgaWQ6IENPUFlfVkFMVUVfSUQsIGFyZ3M6IFt2YXJpYWJsZSwgW3ZhcmlhYmxlXV0gYXMgdW5rbm93bltdIH1cblx0XHRdO1xuXHRcdGlmICh2YXJpYWJsZS5ldmFsdWF0ZU5hbWUpIHtcblx0XHRcdGNvbW1hbmRzLnB1c2goeyBpZDogQ09QWV9FVkFMVUFURV9QQVRIX0lELCBhcmdzOiBbeyB2YXJpYWJsZSB9XSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZW5kZXJWYWx1ZShkYXRhLnZhbHVlLCB2YXJpYWJsZSwge1xuXHRcdFx0c2hvd0NoYW5nZWQ6IG9wdGlvbnMuc2hvd0NoYW5nZWQsXG5cdFx0XHRtYXhWYWx1ZUxlbmd0aDogTUFYX1ZBTFVFX1JFTkRFUl9MRU5HVEhfSU5fVklFV0xFVCxcblx0XHRcdGhvdmVyOiB7IGNvbW1hbmRzIH0sXG5cdFx0XHRoaWdobGlnaHRzOiBoaWdobGlnaHRzLnZhbHVlLFxuXHRcdFx0Y29sb3JpemU6IHRydWUsXG5cdFx0XHRzZXNzaW9uOiB2YXJpYWJsZS5nZXRTZXNzaW9uKCksXG5cdFx0fSk7XG5cdH1cblxuXHRyZW5kZXJWYWx1ZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHByZXNzaW9uT3JWYWx1ZTogSUV4cHJlc3Npb25WYWx1ZSB8IHN0cmluZywgb3B0aW9uczogSVJlbmRlclZhbHVlT3B0aW9ucyA9IHt9KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdC8vIFVzZSByZW1lbWJlcmVkIGNhcGFiaWxpdGllcyBzbyBSRVBMIGVsZW1lbnRzIGNhbiByZW5kZXIgZXZlbiBvbmNlIGEgc2Vzc2lvbiBlbmRzXG5cdFx0Y29uc3Qgc3VwcG9ydHNBTlNJOiBib29sZWFuID0gb3B0aW9ucy5zZXNzaW9uPy5yZW1lbWJlcmVkQ2FwYWJpbGl0aWVzPy5zdXBwb3J0c0FOU0lTdHlsaW5nID8/IG9wdGlvbnMud2FzQU5TSSA/PyBmYWxzZTtcblxuXHRcdGxldCB2YWx1ZSA9IHR5cGVvZiBleHByZXNzaW9uT3JWYWx1ZSA9PT0gJ3N0cmluZycgPyBleHByZXNzaW9uT3JWYWx1ZSA6IGV4cHJlc3Npb25PclZhbHVlLnZhbHVlO1xuXG5cdFx0Ly8gcmVtb3ZlIHN0YWxlIGNsYXNzZXNcblx0XHRmb3IgKGNvbnN0IGNscyBvZiBhbGxDbGFzc2VzKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShjbHMpO1xuXHRcdH1cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuVmFsdWUpO1xuXHRcdC8vIHdoZW4gcmVzb2x2aW5nIGV4cHJlc3Npb25zIHdlIHJlcHJlc2VudCBlcnJvcnMgZnJvbSB0aGUgc2VydmVyIGFzIGEgdmFyaWFibGUgd2l0aCBuYW1lID09PSBudWxsLlxuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCAoKGV4cHJlc3Npb25PclZhbHVlIGluc3RhbmNlb2YgRXhwcmVzc2lvbiB8fCBleHByZXNzaW9uT3JWYWx1ZSBpbnN0YW5jZW9mIFZhcmlhYmxlIHx8IGV4cHJlc3Npb25PclZhbHVlIGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25SZXN1bHQpICYmICFleHByZXNzaW9uT3JWYWx1ZS5hdmFpbGFibGUpKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuVW5hdmFpbGFibGUpO1xuXHRcdFx0aWYgKHZhbHVlICE9PSBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUUpIHtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoQ2xzLkVycm9yKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHR5cGVvZiBleHByZXNzaW9uT3JWYWx1ZSAhPT0gJ3N0cmluZycgJiYgb3B0aW9ucy5zaG93Q2hhbmdlZCAmJiBleHByZXNzaW9uT3JWYWx1ZS52YWx1ZUNoYW5nZWQgJiYgdmFsdWUgIT09IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRSkge1xuXHRcdFx0XHQvLyB2YWx1ZSBjaGFuZ2VkIGNvbG9yIGhhcyBwcmlvcml0eSBvdmVyIG90aGVyIGNvbG9ycy5cblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoQ2xzLkNoYW5nZWQpO1xuXHRcdFx0XHRleHByZXNzaW9uT3JWYWx1ZS52YWx1ZUNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMuY29sb3JpemUgJiYgdHlwZW9mIGV4cHJlc3Npb25PclZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAoZXhwcmVzc2lvbk9yVmFsdWUudHlwZSA9PT0gJ251bWJlcicgfHwgZXhwcmVzc2lvbk9yVmFsdWUudHlwZSA9PT0gJ2Jvb2xlYW4nIHx8IGV4cHJlc3Npb25PclZhbHVlLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoZXhwcmVzc2lvbk9yVmFsdWUudHlwZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWlzTmFOKCt2YWx1ZSkpIHtcblx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuTnVtYmVyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChib29sZWFuUmVnZXgudGVzdCh2YWx1ZSkpIHtcblx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuQm9vbGVhbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc3RyaW5nUmVnZXgudGVzdCh2YWx1ZSkpIHtcblx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChDbHMuU3RyaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm1heFZhbHVlTGVuZ3RoICYmIHZhbHVlICYmIHZhbHVlLmxlbmd0aCA+IG9wdGlvbnMubWF4VmFsdWVMZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIG9wdGlvbnMubWF4VmFsdWVMZW5ndGgpICsgJy4uLic7XG5cdFx0fVxuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHZhbHVlID0gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG9wdGlvbnMuc2Vzc2lvbiA/PyAoKGV4cHJlc3Npb25PclZhbHVlIGluc3RhbmNlb2YgRXhwcmVzc2lvbkNvbnRhaW5lcikgPyBleHByZXNzaW9uT3JWYWx1ZS5nZXRTZXNzaW9uKCkgOiB1bmRlZmluZWQpO1xuXHRcdC8vIE9ubHkgdXNlIGhvdmVycyBmb3IgbGlua3MgaWYgdGhyZSdzIG5vdCBnb2luZyB0byBiZSBhIGhvdmVyIGZvciB0aGUgdmFsdWUuXG5cdFx0Y29uc3QgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhID0gb3B0aW9ucy5ob3ZlciA9PT0gZmFsc2UgPyB7IHR5cGU6IERlYnVnTGlua0hvdmVyQmVoYXZpb3IuUmljaCwgc3RvcmUgfSA6IHsgdHlwZTogRGVidWdMaW5rSG92ZXJCZWhhdmlvci5Ob25lLCBzdG9yZSB9O1xuXHRcdGRvbS5jbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRjb25zdCBsb2NhdGlvblJlZmVyZW5jZSA9IG9wdGlvbnMubG9jYXRpb25SZWZlcmVuY2UgPz8gKGV4cHJlc3Npb25PclZhbHVlIGluc3RhbmNlb2YgRXhwcmVzc2lvbkNvbnRhaW5lciAmJiBleHByZXNzaW9uT3JWYWx1ZS52YWx1ZUxvY2F0aW9uUmVmZXJlbmNlKTtcblxuXHRcdGxldCBsaW5rRGV0ZWN0b3I6IElMaW5rRGV0ZWN0b3IgPSB0aGlzLmxpbmtEZXRlY3Rvcjtcblx0XHRpZiAobG9jYXRpb25SZWZlcmVuY2UgJiYgc2Vzc2lvbikge1xuXHRcdFx0bGlua0RldGVjdG9yID0gdGhpcy5saW5rRGV0ZWN0b3IubWFrZVJlZmVyZW5jZWRMaW5rRGV0ZWN0b3IobG9jYXRpb25SZWZlcmVuY2UsIHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdGlmIChzdXBwb3J0c0FOU0kpIHtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChoYW5kbGVBTlNJT3V0cHV0KHZhbHVlLCBsaW5rRGV0ZWN0b3IsIHNlc3Npb24gPyBzZXNzaW9uLnJvb3QgOiB1bmRlZmluZWQsIG9wdGlvbnMuaGlnaGxpZ2h0cywgaG92ZXJCZWhhdmlvcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobGlua0RldGVjdG9yLmxpbmtpZnkodmFsdWUsIGhvdmVyQmVoYXZpb3IsIGZhbHNlLCBzZXNzaW9uPy5yb290LCB0cnVlLCBvcHRpb25zLmhpZ2hsaWdodHMpKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5ob3ZlciAhPT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IHsgY29tbWFuZHMgPSBbXSB9ID0gb3B0aW9ucy5ob3ZlciB8fCB7fTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgY29udGFpbmVyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgbWFya2Rvd25Ib3ZlckVsZW1lbnQgPSBkb20uJCgnZGl2LmhvdmVyLXJvdycpO1xuXHRcdFx0XHRjb25zdCBob3ZlckNvbnRlbnRzRWxlbWVudCA9IGRvbS5hcHBlbmQobWFya2Rvd25Ib3ZlckVsZW1lbnQsIGRvbS4kKCdkaXYuaG92ZXItY29udGVudHMnKSk7XG5cdFx0XHRcdGNvbnN0IGhvdmVyQ29udGVudHNQcmUgPSBkb20uYXBwZW5kKGhvdmVyQ29udGVudHNFbGVtZW50LCBkb20uJCgncHJlLmRlYnVnLXZhci1ob3Zlci1wcmUnKSk7XG5cdFx0XHRcdGlmIChzdXBwb3J0c0FOU0kpIHtcblx0XHRcdFx0XHQvLyBub3RlOiBpbnRlbnRpb25hbGx5IHVzaW5nIGB0aGlzLmxpbmtEZXRlY3RvcmAgc28gd2UgZG9uJ3QgYmxpbmRseSBsaW5raWZ5IHRoZVxuXHRcdFx0XHRcdC8vIGVudGlyZSBjb250ZW50cyBhbmQgaW5zdGVhZCBvbmx5IGxpbmsgZmlsZSBwYXRocyB0aGF0IGl0IGNvbnRhaW5zLlxuXHRcdFx0XHRcdGhvdmVyQ29udGVudHNQcmUuYXBwZW5kQ2hpbGQoaGFuZGxlQU5TSU91dHB1dCh2YWx1ZSwgdGhpcy5saW5rRGV0ZWN0b3IsIHNlc3Npb24gPyBzZXNzaW9uLnJvb3QgOiB1bmRlZmluZWQsIG9wdGlvbnMuaGlnaGxpZ2h0cywgaG92ZXJCZWhhdmlvcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhvdmVyQ29udGVudHNQcmUudGV4dENvbnRlbnQgPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWFya2Rvd25Ib3ZlckVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0fSwge1xuXHRcdFx0XHRhY3Rpb25zOiBjb21tYW5kcy5tYXAoKHsgaWQsIGFyZ3MgfSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGlkKT8ubWV0YWRhdGE/LmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogdHlwZW9mIGRlc2NyaXB0aW9uID09PSAnc3RyaW5nJyA/IGRlc2NyaXB0aW9uIDogZGVzY3JpcHRpb24gPyBkZXNjcmlwdGlvbi52YWx1ZSA6IGlkLFxuXHRcdFx0XHRcdFx0Y29tbWFuZElkOiBpZCxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCwgLi4uYXJncyksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQW9DO0FBRTdDLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLFlBQVkscUJBQXFCLGdCQUFnQjtBQUMxRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFnQyx3Q0FBd0M7QUFDeEUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUIscUJBQXFCO0FBQ3JELFNBQVMsd0JBQXVF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
