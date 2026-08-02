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
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/path.js";
import severity from "../../../../base/common/severity.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IDebugService } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
import { RawObjectReplElement, ReplEvaluationInput, ReplEvaluationResult, ReplGroup, ReplOutputElement, ReplVariableElement } from "../common/replModel.js";
import { AbstractExpressionsRenderer } from "./baseDebugView.js";
import { debugConsoleEvaluationInput } from "./debugIcons.js";
const $ = dom.$;
const _ReplEvaluationInputsRenderer = class _ReplEvaluationInputsRenderer {
  get templateId() {
    return _ReplEvaluationInputsRenderer.ID;
  }
  renderTemplate(container) {
    dom.append(container, $("span.arrow" + ThemeIcon.asCSSSelector(debugConsoleEvaluationInput)));
    const input = dom.append(container, $(".expression"));
    const label = new HighlightedLabel(input);
    return { label };
  }
  renderElement(element, index, templateData) {
    const evaluation = element.element;
    templateData.label.set(evaluation.value, createMatches(element.filterData));
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_ReplEvaluationInputsRenderer.ID = "replEvaluationInput";
let ReplEvaluationInputsRenderer = _ReplEvaluationInputsRenderer;
let ReplGroupRenderer = class {
  constructor(expressionRenderer, instaService) {
    this.expressionRenderer = expressionRenderer;
    this.instaService = instaService;
  }
  get templateId() {
    return ReplGroupRenderer.ID;
  }
  renderTemplate(container) {
    container.classList.add("group");
    const expression = dom.append(container, $(".output.expression.value-and-source"));
    const label = dom.append(expression, $("span.label"));
    const source = this.instaService.createInstance(SourceWidget, expression);
    return { label, source };
  }
  renderElement(element, _index, templateData) {
    templateData.elementDisposable?.dispose();
    const replGroup = element.element;
    dom.clearNode(templateData.label);
    templateData.elementDisposable = this.expressionRenderer.renderValue(templateData.label, replGroup.name, { wasANSI: true, session: element.element.session });
    templateData.source.setSource(replGroup.sourceData);
  }
  disposeTemplate(templateData) {
    templateData.elementDisposable?.dispose();
    templateData.source.dispose();
  }
};
ReplGroupRenderer.ID = "replGroup";
ReplGroupRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ReplGroupRenderer);
const _ReplEvaluationResultsRenderer = class _ReplEvaluationResultsRenderer {
  constructor(expressionRenderer) {
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return _ReplEvaluationResultsRenderer.ID;
  }
  renderTemplate(container) {
    const output = dom.append(container, $(".evaluation-result.expression"));
    const value = dom.append(output, $("span.value"));
    return { value, elementStore: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.elementStore.clear();
    const expression = element.element;
    templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, expression, {
      colorize: true,
      hover: false,
      session: element.element.getSession()
    }));
  }
  disposeTemplate(templateData) {
    templateData.elementStore.dispose();
  }
};
_ReplEvaluationResultsRenderer.ID = "replEvaluationResult";
let ReplEvaluationResultsRenderer = _ReplEvaluationResultsRenderer;
let ReplOutputElementRenderer = class {
  constructor(expressionRenderer, instaService) {
    this.expressionRenderer = expressionRenderer;
    this.instaService = instaService;
  }
  get templateId() {
    return ReplOutputElementRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    container.classList.add("output");
    const expression = dom.append(container, $(".output.expression.value-and-source"));
    data.container = container;
    data.countContainer = dom.append(expression, $(".count-badge-wrapper"));
    data.count = new CountBadge(data.countContainer, {}, defaultCountBadgeStyles);
    data.value = dom.append(expression, $("span.value.label"));
    data.source = this.instaService.createInstance(SourceWidget, expression);
    data.elementDisposable = new DisposableStore();
    return data;
  }
  renderElement({ element }, index, templateData) {
    templateData.elementDisposable.clear();
    this.setElementCount(element, templateData);
    templateData.elementDisposable.add(element.onDidChangeCount(() => this.setElementCount(element, templateData)));
    dom.clearNode(templateData.value);
    templateData.value.className = "value";
    const locationReference = element.expression?.valueLocationReference;
    templateData.elementDisposable.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
      wasANSI: true,
      session: element.session,
      locationReference,
      hover: false
    }));
    templateData.value.classList.add(element.severity === severity.Warning ? "warn" : element.severity === severity.Error ? "error" : element.severity === severity.Ignore ? "ignore" : "info");
    templateData.source.setSource(element.sourceData);
    templateData.getReplElementSource = () => element.sourceData;
  }
  setElementCount(element, templateData) {
    if (element.count >= 2) {
      templateData.count.setCount(element.count);
      templateData.countContainer.hidden = false;
    } else {
      templateData.countContainer.hidden = true;
    }
  }
  disposeTemplate(templateData) {
    templateData.source.dispose();
    templateData.elementDisposable.dispose();
    templateData.count.dispose();
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposable.clear();
  }
};
ReplOutputElementRenderer.ID = "outputReplElement";
ReplOutputElementRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ReplOutputElementRenderer);
let ReplVariablesRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, debugService, contextViewService, hoverService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return ReplVariablesRenderer.ID;
  }
  renderElement(node, _index, data) {
    const element = node.element;
    data.elementDisposable.clear();
    super.renderExpressionElement(element instanceof ReplVariableElement ? element.expression : element, node, data);
  }
  renderExpression(expression, data, highlights) {
    const isReplVariable = expression instanceof ReplVariableElement;
    if (isReplVariable || !expression.name) {
      data.label.set("");
      const value = isReplVariable ? expression.expression : expression;
      data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, value, { colorize: true, hover: false, session: expression.getSession() }));
      data.expression.classList.remove("nested-variable");
    } else {
      data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, { showChanged: true, highlights }));
      data.expression.classList.toggle("nested-variable", isNestedVariable(expression));
    }
  }
  getInputBoxOptions(expression) {
    return void 0;
  }
};
ReplVariablesRenderer.ID = "replVariable";
ReplVariablesRenderer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService)
], ReplVariablesRenderer);
const _ReplRawObjectsRenderer = class _ReplRawObjectsRenderer {
  constructor(expressionRenderer) {
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return _ReplRawObjectsRenderer.ID;
  }
  renderTemplate(container) {
    container.classList.add("output");
    const expression = dom.append(container, $(".output.expression"));
    const name = dom.append(expression, $("span.name"));
    const label = new HighlightedLabel(name);
    const value = dom.append(expression, $("span.value"));
    return { container, expression, name, label, value, elementStore: new DisposableStore() };
  }
  renderElement(node, index, templateData) {
    templateData.elementStore.clear();
    const element = node.element;
    templateData.label.set(element.name ? `${element.name}:` : "", createMatches(node.filterData));
    if (element.name) {
      templateData.name.textContent = `${element.name}:`;
    } else {
      templateData.name.textContent = "";
    }
    templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
      hover: false,
      session: node.element.getSession()
    }));
  }
  disposeTemplate(templateData) {
    templateData.elementStore.dispose();
    templateData.label.dispose();
  }
};
_ReplRawObjectsRenderer.ID = "rawObject";
let ReplRawObjectsRenderer = _ReplRawObjectsRenderer;
function isNestedVariable(element) {
  return element instanceof Variable && (element.parent instanceof ReplEvaluationResult || element.parent instanceof Variable);
}
class ReplDelegate extends CachedListVirtualDelegate {
  constructor(configurationService, replOptions) {
    super();
    this.configurationService = configurationService;
    this.replOptions = replOptions;
  }
  getHeight(element) {
    const config = this.configurationService.getValue("debug");
    if (!config.console.wordWrap) {
      return this.estimateHeight(element, true);
    }
    return super.getHeight(element);
  }
  /**
   * With wordWrap enabled, this is an estimate. With wordWrap disabled, this is the real height that the list will use.
   */
  estimateHeight(element, ignoreValueLength = false) {
    const lineHeight = this.replOptions.replConfiguration.lineHeight;
    const countNumberOfLines = (str) => str.match(/\n/g)?.length ?? 0;
    const hasValue = (e) => typeof e.value === "string";
    if (hasValue(element) && !isNestedVariable(element)) {
      const value = element.value;
      const valueRows = countNumberOfLines(value) + (ignoreValueLength ? 0 : Math.floor(value.length / 70)) + (element instanceof ReplOutputElement ? 0 : 1);
      return Math.max(valueRows, 1) * lineHeight;
    }
    return lineHeight;
  }
  getTemplateId(element) {
    if (element instanceof Variable || element instanceof ReplVariableElement) {
      return ReplVariablesRenderer.ID;
    }
    if (element instanceof ReplEvaluationResult) {
      return ReplEvaluationResultsRenderer.ID;
    }
    if (element instanceof ReplEvaluationInput) {
      return ReplEvaluationInputsRenderer.ID;
    }
    if (element instanceof ReplOutputElement) {
      return ReplOutputElementRenderer.ID;
    }
    if (element instanceof ReplGroup) {
      return ReplGroupRenderer.ID;
    }
    return ReplRawObjectsRenderer.ID;
  }
  hasDynamicHeight(element) {
    if (isNestedVariable(element)) {
      return false;
    }
    return element.toString().length > 0;
  }
}
function isDebugSession(obj) {
  return typeof obj.getReplElements === "function";
}
class ReplDataSource {
  hasChildren(element) {
    if (isDebugSession(element)) {
      return true;
    }
    return !!element.hasChildren;
  }
  getChildren(element) {
    if (isDebugSession(element)) {
      return Promise.resolve(element.getReplElements());
    }
    return Promise.resolve(element.getChildren());
  }
}
class ReplAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("debugConsole", "Debug Console");
  }
  getAriaLabel(element) {
    if (element instanceof Variable) {
      return localize("replVariableAriaLabel", "Variable {0}, value {1}", element.name, element.value);
    }
    if (element instanceof ReplOutputElement || element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult) {
      return element.value + (element instanceof ReplOutputElement && element.count > 1 ? localize(
        { key: "occurred", comment: ["Front will the value of the debug console element. Placeholder will be replaced by a number which represents occurrance count."] },
        ", occurred {0} times",
        element.count
      ) : "");
    }
    if (element instanceof RawObjectReplElement) {
      return localize("replRawObjectAriaLabel", "Debug console variable {0}, value {1}", element.name, element.value);
    }
    if (element instanceof ReplGroup) {
      return localize("replGroup", "Debug console group {0}", element.name);
    }
    return "";
  }
}
let SourceWidget = class extends Disposable {
  constructor(container, editorService, hoverService, labelService) {
    super();
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.el = dom.append(container, $(".source"));
    this._register(dom.addDisposableListener(this.el, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.source) {
        this.source.source.openInEditor(editorService, {
          startLineNumber: this.source.lineNumber,
          startColumn: this.source.column,
          endLineNumber: this.source.lineNumber,
          endColumn: this.source.column
        });
      }
    }));
  }
  setSource(source) {
    this.source = source;
    this.el.textContent = source ? `${basename(source.source.name)}:${source.lineNumber}` : "";
    this.hover ??= this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.el, ""));
    this.hover.update(source ? `${this.labelService.getUriLabel(source.source.uri)}:${source.lineNumber}` : "");
  }
};
SourceWidget = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, ILabelService)
], SourceWidget);
export {
  ReplAccessibilityProvider,
  ReplDataSource,
  ReplDelegate,
  ReplEvaluationInputsRenderer,
  ReplEvaluationResultsRenderer,
  ReplGroupRenderer,
  ReplOutputElementRenderer,
  ReplRawObjectsRenderer,
  ReplVariablesRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbFZpZXdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvdW50QmFkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwsIElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWF0Y2hlcywgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb25Db250YWluZXIsIElOZXN0aW5nUmVwbEVsZW1lbnQsIElSZXBsRWxlbWVudCwgSVJlcGxFbGVtZW50U291cmNlLCBJUmVwbE9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgVmFyaWFibGUgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBSYXdPYmplY3RSZXBsRWxlbWVudCwgUmVwbEV2YWx1YXRpb25JbnB1dCwgUmVwbEV2YWx1YXRpb25SZXN1bHQsIFJlcGxHcm91cCwgUmVwbE91dHB1dEVsZW1lbnQsIFJlcGxWYXJpYWJsZUVsZW1lbnQgfSBmcm9tICcuLi9jb21tb24vcmVwbE1vZGVsLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXhwcmVzc2lvbnNSZW5kZXJlciwgSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEsIElJbnB1dEJveE9wdGlvbnMgfSBmcm9tICcuL2Jhc2VEZWJ1Z1ZpZXcuanMnO1xuaW1wb3J0IHsgRGVidWdFeHByZXNzaW9uUmVuZGVyZXIgfSBmcm9tICcuL2RlYnVnRXhwcmVzc2lvblJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGRlYnVnQ29uc29sZUV2YWx1YXRpb25JbnB1dCB9IGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuaW50ZXJmYWNlIElSZXBsRXZhbHVhdGlvbklucHV0VGVtcGxhdGVEYXRhIHtcblx0bGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG59XG5cbmludGVyZmFjZSBJUmVwbEdyb3VwVGVtcGxhdGVEYXRhIHtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xuXHRzb3VyY2U6IFNvdXJjZVdpZGdldDtcblx0ZWxlbWVudERpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZTtcbn1cblxuaW50ZXJmYWNlIElSZXBsRXZhbHVhdGlvblJlc3VsdFRlbXBsYXRlRGF0YSB7XG5cdHZhbHVlOiBIVE1MRWxlbWVudDtcblx0ZWxlbWVudFN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjb3VudDogQ291bnRCYWRnZTtcblx0Y291bnRDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHR2YWx1ZTogSFRNTEVsZW1lbnQ7XG5cdHNvdXJjZTogU291cmNlV2lkZ2V0O1xuXHRnZXRSZXBsRWxlbWVudFNvdXJjZSgpOiBJUmVwbEVsZW1lbnRTb3VyY2UgfCB1bmRlZmluZWQ7XG5cdGVsZW1lbnREaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJUmF3T2JqZWN0UmVwbFRlbXBsYXRlRGF0YSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGV4cHJlc3Npb246IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0dmFsdWU6IEhUTUxFbGVtZW50O1xuXHRsYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0ZWxlbWVudFN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsRXZhbHVhdGlvbklucHV0c1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSZXBsRXZhbHVhdGlvbklucHV0LCBGdXp6eVNjb3JlLCBJUmVwbEV2YWx1YXRpb25JbnB1dFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmVwbEV2YWx1YXRpb25JbnB1dCc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbEV2YWx1YXRpb25JbnB1dHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUmVwbEV2YWx1YXRpb25JbnB1dFRlbXBsYXRlRGF0YSB7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uYXJyb3cnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZGVidWdDb25zb2xlRXZhbHVhdGlvbklucHV0KSkpO1xuXHRcdGNvbnN0IGlucHV0ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5leHByZXNzaW9uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoaW5wdXQpO1xuXHRcdHJldHVybiB7IGxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxSZXBsRXZhbHVhdGlvbklucHV0LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmVwbEV2YWx1YXRpb25JbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGV2YWx1YXRpb24gPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldChldmFsdWF0aW9uLnZhbHVlLCBjcmVhdGVNYXRjaGVzKGVsZW1lbnQuZmlsdGVyRGF0YSkpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVJlcGxFdmFsdWF0aW9uSW5wdXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsR3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UmVwbEdyb3VwLCBGdXp6eVNjb3JlLCBJUmVwbEdyb3VwVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdyZXBsR3JvdXAnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXhwcmVzc2lvblJlbmRlcmVyOiBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbEdyb3VwUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJlcGxHcm91cFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2dyb3VwJyk7XG5cdFx0Y29uc3QgZXhwcmVzc2lvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3V0cHV0LmV4cHJlc3Npb24udmFsdWUtYW5kLXNvdXJjZScpKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoZXhwcmVzc2lvbiwgJCgnc3Bhbi5sYWJlbCcpKTtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTb3VyY2VXaWRnZXQsIGV4cHJlc3Npb24pO1xuXHRcdHJldHVybiB7IGxhYmVsLCBzb3VyY2UgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFJlcGxHcm91cCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElSZXBsR3JvdXBUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHJlcGxHcm91cCA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5sYWJlbCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlID0gdGhpcy5leHByZXNzaW9uUmVuZGVyZXIucmVuZGVyVmFsdWUodGVtcGxhdGVEYXRhLmxhYmVsLCByZXBsR3JvdXAubmFtZSwgeyB3YXNBTlNJOiB0cnVlLCBzZXNzaW9uOiBlbGVtZW50LmVsZW1lbnQuc2Vzc2lvbiB9KTtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlLnNldFNvdXJjZShyZXBsR3JvdXAuc291cmNlRGF0YSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmVwbEdyb3VwVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnNvdXJjZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxFdmFsdWF0aW9uUmVzdWx0c1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSZXBsRXZhbHVhdGlvblJlc3VsdCB8IFZhcmlhYmxlLCBGdXp6eVNjb3JlLCBJUmVwbEV2YWx1YXRpb25SZXN1bHRUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3JlcGxFdmFsdWF0aW9uUmVzdWx0JztcblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBSZXBsRXZhbHVhdGlvblJlc3VsdHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXhwcmVzc2lvblJlbmRlcmVyOiBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcixcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJlcGxFdmFsdWF0aW9uUmVzdWx0VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBvdXRwdXQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV2YWx1YXRpb24tcmVzdWx0LmV4cHJlc3Npb24nKSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBkb20uYXBwZW5kKG91dHB1dCwgJCgnc3Bhbi52YWx1ZScpKTtcblxuXHRcdHJldHVybiB7IHZhbHVlLCBlbGVtZW50U3RvcmU6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UmVwbEV2YWx1YXRpb25SZXN1bHQgfCBWYXJpYWJsZSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlcGxFdmFsdWF0aW9uUmVzdWx0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnRTdG9yZS5jbGVhcigpO1xuXHRcdGNvbnN0IGV4cHJlc3Npb24gPSBlbGVtZW50LmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnRTdG9yZS5hZGQodGhpcy5leHByZXNzaW9uUmVuZGVyZXIucmVuZGVyVmFsdWUodGVtcGxhdGVEYXRhLnZhbHVlLCBleHByZXNzaW9uLCB7XG5cdFx0XHRjb2xvcml6ZTogdHJ1ZSxcblx0XHRcdGhvdmVyOiBmYWxzZSxcblx0XHRcdHNlc3Npb246IGVsZW1lbnQuZWxlbWVudC5nZXRTZXNzaW9uKCksXG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVJlcGxFdmFsdWF0aW9uUmVzdWx0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnRTdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxPdXRwdXRFbGVtZW50UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFJlcGxPdXRwdXRFbGVtZW50LCBGdXp6eVNjb3JlLCBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ291dHB1dFJlcGxFbGVtZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFJlcGxPdXRwdXRFbGVtZW50UmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU91dHB1dFJlcGxFbGVtZW50VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdvdXRwdXQnKTtcblx0XHRjb25zdCBleHByZXNzaW9uID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5vdXRwdXQuZXhwcmVzc2lvbi52YWx1ZS1hbmQtc291cmNlJykpO1xuXG5cdFx0ZGF0YS5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0ZGF0YS5jb3VudENvbnRhaW5lciA9IGRvbS5hcHBlbmQoZXhwcmVzc2lvbiwgJCgnLmNvdW50LWJhZGdlLXdyYXBwZXInKSk7XG5cdFx0ZGF0YS5jb3VudCA9IG5ldyBDb3VudEJhZGdlKGRhdGEuY291bnRDb250YWluZXIsIHt9LCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyk7XG5cdFx0ZGF0YS52YWx1ZSA9IGRvbS5hcHBlbmQoZXhwcmVzc2lvbiwgJCgnc3Bhbi52YWx1ZS5sYWJlbCcpKTtcblx0XHRkYXRhLnNvdXJjZSA9IHRoaXMuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNvdXJjZVdpZGdldCwgZXhwcmVzc2lvbik7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudCh7IGVsZW1lbnQgfTogSVRyZWVOb2RlPFJlcGxPdXRwdXRFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLnNldEVsZW1lbnRDb3VudChlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQoZWxlbWVudC5vbkRpZENoYW5nZUNvdW50KCgpID0+IHRoaXMuc2V0RWxlbWVudENvdW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSkpKTtcblx0XHQvLyB2YWx1ZVxuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLnZhbHVlKTtcblx0XHQvLyBSZXNldCBjbGFzc2VzIHRvIGNsZWFyIGFuc2kgZGVjb3JhdGlvbnMgc2luY2UgdGVtcGxhdGVzIGFyZSByZXVzZWRcblx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuY2xhc3NOYW1lID0gJ3ZhbHVlJztcblxuXHRcdGNvbnN0IGxvY2F0aW9uUmVmZXJlbmNlID0gZWxlbWVudC5leHByZXNzaW9uPy52YWx1ZUxvY2F0aW9uUmVmZXJlbmNlO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQodGhpcy5leHByZXNzaW9uUmVuZGVyZXIucmVuZGVyVmFsdWUodGVtcGxhdGVEYXRhLnZhbHVlLCBlbGVtZW50LnZhbHVlLCB7XG5cdFx0XHR3YXNBTlNJOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbjogZWxlbWVudC5zZXNzaW9uLFxuXHRcdFx0bG9jYXRpb25SZWZlcmVuY2UsXG5cdFx0XHRob3ZlcjogZmFsc2UsXG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmNsYXNzTGlzdC5hZGQoKGVsZW1lbnQuc2V2ZXJpdHkgPT09IHNldmVyaXR5Lldhcm5pbmcpID8gJ3dhcm4nIDogKGVsZW1lbnQuc2V2ZXJpdHkgPT09IHNldmVyaXR5LkVycm9yKSA/ICdlcnJvcicgOiAoZWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ZXJpdHkuSWdub3JlKSA/ICdpZ25vcmUnIDogJ2luZm8nKTtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlLnNldFNvdXJjZShlbGVtZW50LnNvdXJjZURhdGEpO1xuXHRcdHRlbXBsYXRlRGF0YS5nZXRSZXBsRWxlbWVudFNvdXJjZSA9ICgpID0+IGVsZW1lbnQuc291cmNlRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgc2V0RWxlbWVudENvdW50KGVsZW1lbnQ6IFJlcGxPdXRwdXRFbGVtZW50LCB0ZW1wbGF0ZURhdGE6IElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGlmIChlbGVtZW50LmNvdW50ID49IDIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb3VudC5zZXRDb3VudChlbGVtZW50LmNvdW50KTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb3VudENvbnRhaW5lci5oaWRkZW4gPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50Q29udGFpbmVyLmhpZGRlbiA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU91dHB1dFJlcGxFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuY291bnQuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxSZXBsT3V0cHV0RWxlbWVudCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsVmFyaWFibGVzUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25zUmVuZGVyZXI8SUV4cHJlc3Npb24gfCBSZXBsVmFyaWFibGVFbGVtZW50PiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3JlcGxWYXJpYWJsZSc7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z1NlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRXhwcmVzc2lvbiB8IFJlcGxWYXJpYWJsZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRzdXBlci5yZW5kZXJFeHByZXNzaW9uRWxlbWVudChlbGVtZW50IGluc3RhbmNlb2YgUmVwbFZhcmlhYmxlRWxlbWVudCA/IGVsZW1lbnQuZXhwcmVzc2lvbiA6IGVsZW1lbnQsIG5vZGUsIGRhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckV4cHJlc3Npb24oZXhwcmVzc2lvbjogSUV4cHJlc3Npb24gfCBSZXBsVmFyaWFibGVFbGVtZW50LCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgaGlnaGxpZ2h0czogSUhpZ2hsaWdodFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNSZXBsVmFyaWFibGUgPSBleHByZXNzaW9uIGluc3RhbmNlb2YgUmVwbFZhcmlhYmxlRWxlbWVudDtcblx0XHRpZiAoaXNSZXBsVmFyaWFibGUgfHwgIWV4cHJlc3Npb24ubmFtZSkge1xuXHRcdFx0ZGF0YS5sYWJlbC5zZXQoJycpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBpc1JlcGxWYXJpYWJsZSA/IGV4cHJlc3Npb24uZXhwcmVzc2lvbiA6IGV4cHJlc3Npb247XG5cdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZShkYXRhLnZhbHVlLCB2YWx1ZSwgeyBjb2xvcml6ZTogdHJ1ZSwgaG92ZXI6IGZhbHNlLCBzZXNzaW9uOiBleHByZXNzaW9uLmdldFNlc3Npb24oKSB9KSk7XG5cdFx0XHRkYXRhLmV4cHJlc3Npb24uY2xhc3NMaXN0LnJlbW92ZSgnbmVzdGVkLXZhcmlhYmxlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhcmlhYmxlKGRhdGEsIGV4cHJlc3Npb24gYXMgVmFyaWFibGUsIHsgc2hvd0NoYW5nZWQ6IHRydWUsIGhpZ2hsaWdodHMgfSkpO1xuXHRcdFx0ZGF0YS5leHByZXNzaW9uLmNsYXNzTGlzdC50b2dnbGUoJ25lc3RlZC12YXJpYWJsZScsIGlzTmVzdGVkVmFyaWFibGUoZXhwcmVzc2lvbikpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRJbnB1dEJveE9wdGlvbnMoZXhwcmVzc2lvbjogSUV4cHJlc3Npb24pOiBJSW5wdXRCb3hPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsUmF3T2JqZWN0c1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSYXdPYmplY3RSZXBsRWxlbWVudCwgRnV6enlTY29yZSwgSVJhd09iamVjdFJlcGxUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Jhd09iamVjdCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFJlcGxSYXdPYmplY3RzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJhd09iamVjdFJlcGxUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdvdXRwdXQnKTtcblxuXHRcdGNvbnN0IGV4cHJlc3Npb24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm91dHB1dC5leHByZXNzaW9uJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBkb20uYXBwZW5kKGV4cHJlc3Npb24sICQoJ3NwYW4ubmFtZScpKTtcblx0XHRjb25zdCBsYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKG5hbWUpO1xuXHRcdGNvbnN0IHZhbHVlID0gZG9tLmFwcGVuZChleHByZXNzaW9uLCAkKCdzcGFuLnZhbHVlJykpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBleHByZXNzaW9uLCBuYW1lLCBsYWJlbCwgdmFsdWUsIGVsZW1lbnRTdG9yZTogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxSYXdPYmplY3RSZXBsRWxlbWVudCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJhd09iamVjdFJlcGxUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmNsZWFyKCk7XG5cblx0XHQvLyBrZXlcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXQoZWxlbWVudC5uYW1lID8gYCR7ZWxlbWVudC5uYW1lfTpgIDogJycsIGNyZWF0ZU1hdGNoZXMobm9kZS5maWx0ZXJEYXRhKSk7XG5cdFx0aWYgKGVsZW1lbnQubmFtZSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBgJHtlbGVtZW50Lm5hbWV9OmA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gdmFsdWVcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0ZW1wbGF0ZURhdGEudmFsdWUsIGVsZW1lbnQudmFsdWUsIHtcblx0XHRcdGhvdmVyOiBmYWxzZSxcblx0XHRcdHNlc3Npb246IG5vZGUuZWxlbWVudC5nZXRTZXNzaW9uKCksXG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVJhd09iamVjdFJlcGxUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTmVzdGVkVmFyaWFibGUoZWxlbWVudDogSVJlcGxFbGVtZW50KSB7XG5cdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgVmFyaWFibGUgJiYgKGVsZW1lbnQucGFyZW50IGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25SZXN1bHQgfHwgZWxlbWVudC5wYXJlbnQgaW5zdGFuY2VvZiBWYXJpYWJsZSk7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsRGVsZWdhdGUgZXh0ZW5kcyBDYWNoZWRMaXN0VmlydHVhbERlbGVnYXRlPElSZXBsRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlcGxPcHRpb25zOiBJUmVwbE9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEhlaWdodChlbGVtZW50OiBJUmVwbEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJyk7XG5cblx0XHRpZiAoIWNvbmZpZy5jb25zb2xlLndvcmRXcmFwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lc3RpbWF0ZUhlaWdodChlbGVtZW50LCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZ2V0SGVpZ2h0KGVsZW1lbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpdGggd29yZFdyYXAgZW5hYmxlZCwgdGhpcyBpcyBhbiBlc3RpbWF0ZS4gV2l0aCB3b3JkV3JhcCBkaXNhYmxlZCwgdGhpcyBpcyB0aGUgcmVhbCBoZWlnaHQgdGhhdCB0aGUgbGlzdCB3aWxsIHVzZS5cblx0ICovXG5cdHByb3RlY3RlZCBlc3RpbWF0ZUhlaWdodChlbGVtZW50OiBJUmVwbEVsZW1lbnQsIGlnbm9yZVZhbHVlTGVuZ3RoID0gZmFsc2UpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgY291bnROdW1iZXJPZkxpbmVzID0gKHN0cjogc3RyaW5nKSA9PiBzdHIubWF0Y2goL1xcbi9nKT8ubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgaGFzVmFsdWUgPSAoZTogYW55KTogZSBpcyB7IHZhbHVlOiBzdHJpbmcgfSA9PiB0eXBlb2YgZS52YWx1ZSA9PT0gJ3N0cmluZyc7XG5cblx0XHRpZiAoaGFzVmFsdWUoZWxlbWVudCkgJiYgIWlzTmVzdGVkVmFyaWFibGUoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gZWxlbWVudC52YWx1ZTtcblx0XHRcdGNvbnN0IHZhbHVlUm93cyA9IGNvdW50TnVtYmVyT2ZMaW5lcyh2YWx1ZSlcblx0XHRcdFx0KyAoaWdub3JlVmFsdWVMZW5ndGggPyAwIDogTWF0aC5mbG9vcih2YWx1ZS5sZW5ndGggLyA3MCkpIC8vIE1ha2UgYW4gZXN0aW1hdGUgZm9yIHdyYXBwaW5nXG5cdFx0XHRcdCsgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCA/IDAgOiAxKTsgLy8gQSBTaW1wbGVSZXBsRWxlbWVudCBlbmRzIGluIFxcbiBpZiBpdCdzIGEgY29tcGxldGUgbGluZVxuXG5cdFx0XHRyZXR1cm4gTWF0aC5tYXgodmFsdWVSb3dzLCAxKSAqIGxpbmVIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmVIZWlnaHQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElSZXBsRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBWYXJpYWJsZSB8fCBlbGVtZW50IGluc3RhbmNlb2YgUmVwbFZhcmlhYmxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFJlcGxWYXJpYWJsZXNSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvblJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIFJlcGxFdmFsdWF0aW9uUmVzdWx0c1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxFdmFsdWF0aW9uSW5wdXQpIHtcblx0XHRcdHJldHVybiBSZXBsRXZhbHVhdGlvbklucHV0c1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gUmVwbE91dHB1dEVsZW1lbnRSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXApIHtcblx0XHRcdHJldHVybiBSZXBsR3JvdXBSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRyZXR1cm4gUmVwbFJhd09iamVjdHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdGhhc0R5bmFtaWNIZWlnaHQoZWxlbWVudDogSVJlcGxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzTmVzdGVkVmFyaWFibGUoZWxlbWVudCkpIHtcblx0XHRcdC8vIE5lc3RlZCB2YXJpYWJsZXMgc2hvdWxkIGFsd2F5cyBiZSBpbiBvbmUgbGluZSAjMTExODQzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIEVtcHR5IGVsZW1lbnRzIHNob3VsZCBub3QgaGF2ZSBkeW5hbWljIGhlaWdodCBzaW5jZSB0aGV5IHdpbGwgYmUgaW52aXNpYmxlXG5cdFx0cmV0dXJuIGVsZW1lbnQudG9TdHJpbmcoKS5sZW5ndGggPiAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzRGVidWdTZXNzaW9uKG9iajogYW55KTogb2JqIGlzIElEZWJ1Z1Nlc3Npb24ge1xuXHRyZXR1cm4gdHlwZW9mIG9iai5nZXRSZXBsRWxlbWVudHMgPT09ICdmdW5jdGlvbic7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SURlYnVnU2Vzc2lvbiwgSVJlcGxFbGVtZW50PiB7XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSVJlcGxFbGVtZW50IHwgSURlYnVnU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhKDxJRXhwcmVzc2lvbkNvbnRhaW5lciB8IElOZXN0aW5nUmVwbEVsZW1lbnQ+ZWxlbWVudCkuaGFzQ2hpbGRyZW47XG5cdH1cblxuXHRnZXRDaGlsZHJlbihlbGVtZW50OiBJUmVwbEVsZW1lbnQgfCBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTxJUmVwbEVsZW1lbnRbXT4ge1xuXHRcdGlmIChpc0RlYnVnU2Vzc2lvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlbGVtZW50LmdldFJlcGxFbGVtZW50cygpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCg8SUV4cHJlc3Npb24gfCBJTmVzdGluZ1JlcGxFbGVtZW50PmVsZW1lbnQpLmdldENoaWxkcmVuKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SVJlcGxFbGVtZW50PiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdkZWJ1Z0NvbnNvbGUnLCBcIkRlYnVnIENvbnNvbGVcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVJlcGxFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3JlcGxWYXJpYWJsZUFyaWFMYWJlbCcsIFwiVmFyaWFibGUgezB9LCB2YWx1ZSB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LnZhbHVlKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCB8fCBlbGVtZW50IGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25JbnB1dCB8fCBlbGVtZW50IGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25SZXN1bHQpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnZhbHVlICsgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJiBlbGVtZW50LmNvdW50ID4gMSA/IGxvY2FsaXplKHsga2V5OiAnb2NjdXJyZWQnLCBjb21tZW50OiBbJ0Zyb250IHdpbGwgdGhlIHZhbHVlIG9mIHRoZSBkZWJ1ZyBjb25zb2xlIGVsZW1lbnQuIFBsYWNlaG9sZGVyIHdpbGwgYmUgcmVwbGFjZWQgYnkgYSBudW1iZXIgd2hpY2ggcmVwcmVzZW50cyBvY2N1cnJhbmNlIGNvdW50LiddIH0sXG5cdFx0XHRcdFwiLCBvY2N1cnJlZCB7MH0gdGltZXNcIiwgZWxlbWVudC5jb3VudCkgOiAnJyk7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmF3T2JqZWN0UmVwbEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVwbFJhd09iamVjdEFyaWFMYWJlbCcsIFwiRGVidWcgY29uc29sZSB2YXJpYWJsZSB7MH0sIHZhbHVlIHsxfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXBsR3JvdXAnLCBcIkRlYnVnIGNvbnNvbGUgZ3JvdXAgezB9XCIsIGVsZW1lbnQubmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmNsYXNzIFNvdXJjZVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2U7XG5cdHByaXZhdGUgaG92ZXI/OiBJTWFuYWdlZEhvdmVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNvdXJjZScpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICh0aGlzLnNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLnNvdXJjZS5zb3VyY2Uub3BlbkluRWRpdG9yKGVkaXRvclNlcnZpY2UsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHRoaXMuc291cmNlLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHRoaXMuc291cmNlLmNvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB0aGlzLnNvdXJjZS5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogdGhpcy5zb3VyY2UuY29sdW1uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHR9XG5cblx0cHVibGljIHNldFNvdXJjZShzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2UpIHtcblx0XHR0aGlzLnNvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLmVsLnRleHRDb250ZW50ID0gc291cmNlID8gYCR7YmFzZW5hbWUoc291cmNlLnNvdXJjZS5uYW1lKX06JHtzb3VyY2UubGluZU51bWJlcn1gIDogJyc7XG5cblx0XHR0aGlzLmhvdmVyID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbCwgJycpKTtcblx0XHR0aGlzLmhvdmVyLnVwZGF0ZShzb3VyY2UgPyBgJHt0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChzb3VyY2Uuc291cmNlLnVyaSl9OiR7c291cmNlLmxpbmVOdW1iZXJ9YCA6ICcnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx3QkFBb0M7QUFFN0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFHMUMsU0FBUyxxQkFB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
