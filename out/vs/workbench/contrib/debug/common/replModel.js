import { Emitter } from "../../../../base/common/event.js";
import severity from "../../../../base/common/severity.js";
import { isObject, isString } from "../../../../base/common/types.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import * as nls from "../../../../nls.js";
import { ExpressionContainer } from "./debugModel.js";
let topReplElementCounter = 0;
const getUniqueId = () => `topReplElement:${topReplElementCounter++}`;
class ReplOutputElement {
  constructor(session, id, value, severity2, sourceData, expression) {
    this.session = session;
    this.id = id;
    this.value = value;
    this.severity = severity2;
    this.sourceData = sourceData;
    this.expression = expression;
    this._count = 1;
    this._onDidChangeCount = new Emitter();
  }
  toString(includeSource = false) {
    let valueRespectCount = this.value;
    for (let i = 1; i < this.count; i++) {
      valueRespectCount += (valueRespectCount.endsWith("\n") ? "" : "\n") + this.value;
    }
    const sourceStr = this.sourceData && includeSource ? ` ${this.sourceData.source.name}` : "";
    return valueRespectCount + sourceStr;
  }
  getId() {
    return this.id;
  }
  getChildren() {
    return this.expression?.getChildren() || Promise.resolve([]);
  }
  set count(value) {
    this._count = value;
    this._onDidChangeCount.fire();
  }
  get count() {
    return this._count;
  }
  get onDidChangeCount() {
    return this._onDidChangeCount.event;
  }
  get hasChildren() {
    return !!this.expression?.hasChildren;
  }
}
class ReplVariableElement {
  constructor(session, expression, severity2, sourceData) {
    this.session = session;
    this.expression = expression;
    this.severity = severity2;
    this.sourceData = sourceData;
    this.id = generateUuid();
    this.hasChildren = expression.hasChildren;
  }
  getSession() {
    return this.session;
  }
  getChildren() {
    return this.expression.getChildren();
  }
  toString() {
    return this.expression.toString();
  }
  getId() {
    return this.id;
  }
}
const _RawObjectReplElement = class _RawObjectReplElement {
  // upper bound of children per value
  constructor(id, name, valueObj, sourceData, annotation) {
    this.id = id;
    this.name = name;
    this.valueObj = valueObj;
    this.sourceData = sourceData;
    this.annotation = annotation;
  }
  getId() {
    return this.id;
  }
  getSession() {
    return void 0;
  }
  get value() {
    if (this.valueObj === null) {
      return "null";
    } else if (Array.isArray(this.valueObj)) {
      return `Array[${this.valueObj.length}]`;
    } else if (isObject(this.valueObj)) {
      return "Object";
    } else if (isString(this.valueObj)) {
      return `"${this.valueObj}"`;
    }
    return String(this.valueObj) || "";
  }
  get hasChildren() {
    return Array.isArray(this.valueObj) && this.valueObj.length > 0 || isObject(this.valueObj) && Object.getOwnPropertyNames(this.valueObj).length > 0;
  }
  evaluateLazy() {
    throw new Error("Method not implemented.");
  }
  getChildren() {
    let result = [];
    if (Array.isArray(this.valueObj)) {
      result = this.valueObj.slice(0, _RawObjectReplElement.MAX_CHILDREN).map((v, index) => new _RawObjectReplElement(`${this.id}:${index}`, String(index), v));
    } else if (isObject(this.valueObj)) {
      result = Object.getOwnPropertyNames(this.valueObj).slice(0, _RawObjectReplElement.MAX_CHILDREN).map((key, index) => new _RawObjectReplElement(`${this.id}:${index}`, key, this.valueObj[key]));
    }
    return Promise.resolve(result);
  }
  toString() {
    return `${this.name}
${this.value}`;
  }
};
_RawObjectReplElement.MAX_CHILDREN = 1e3;
let RawObjectReplElement = _RawObjectReplElement;
class ReplEvaluationInput {
  constructor(value) {
    this.value = value;
    this.id = generateUuid();
  }
  toString() {
    return this.value;
  }
  getId() {
    return this.id;
  }
}
class ReplEvaluationResult extends ExpressionContainer {
  constructor(originalExpression) {
    super(void 0, void 0, 0, generateUuid());
    this.originalExpression = originalExpression;
    this._available = true;
  }
  get available() {
    return this._available;
  }
  async evaluateExpression(expression, session, stackFrame, context) {
    const result = await super.evaluateExpression(expression, session, stackFrame, context);
    this._available = result;
    return result;
  }
  toString() {
    return `${this.value}`;
  }
}
const _ReplGroup = class _ReplGroup {
  constructor(session, name, autoExpand, sourceData) {
    this.session = session;
    this.name = name;
    this.autoExpand = autoExpand;
    this.sourceData = sourceData;
    this.children = [];
    this.ended = false;
    this.id = `replGroup:${_ReplGroup.COUNTER++}`;
  }
  get hasChildren() {
    return true;
  }
  getId() {
    return this.id;
  }
  toString(includeSource = false) {
    const sourceStr = includeSource && this.sourceData ? ` ${this.sourceData.source.name}` : "";
    return this.name + sourceStr;
  }
  addChild(child) {
    const lastElement = this.children.length ? this.children[this.children.length - 1] : void 0;
    if (lastElement instanceof _ReplGroup && !lastElement.hasEnded) {
      lastElement.addChild(child);
    } else {
      this.children.push(child);
    }
  }
  getChildren() {
    return this.children;
  }
  end() {
    const lastElement = this.children.length ? this.children[this.children.length - 1] : void 0;
    if (lastElement instanceof _ReplGroup && !lastElement.hasEnded) {
      lastElement.end();
    } else {
      this.ended = true;
    }
  }
  get hasEnded() {
    return this.ended;
  }
};
_ReplGroup.COUNTER = 0;
let ReplGroup = _ReplGroup;
function areSourcesEqual(first, second) {
  if (!first && !second) {
    return true;
  }
  if (first && second) {
    return first.column === second.column && first.lineNumber === second.lineNumber && first.source.uri.toString() === second.source.uri.toString();
  }
  return false;
}
class ReplModel {
  constructor(configurationService) {
    this.configurationService = configurationService;
    this.replElements = [];
    this._onDidChangeElements = new Emitter();
    this.onDidChangeElements = this._onDidChangeElements.event;
  }
  getReplElements() {
    return this.replElements;
  }
  async addReplExpression(session, stackFrame, expression) {
    this.addReplElement(new ReplEvaluationInput(expression));
    const result = new ReplEvaluationResult(expression);
    await result.evaluateExpression(expression, session, stackFrame, "repl");
    this.addReplElement(result);
  }
  appendToRepl(session, { output, expression, sev, source }) {
    const clearAnsiSequence = "\x1B[2J";
    const clearAnsiIndex = output.lastIndexOf(clearAnsiSequence);
    if (clearAnsiIndex !== -1) {
      this.removeReplExpressions();
      this.appendToRepl(session, { output: nls.localize("consoleCleared", "Console was cleared"), sev: severity.Ignore });
      output = output.substring(clearAnsiIndex + clearAnsiSequence.length);
    }
    if (expression) {
      this.addReplElement(output ? new ReplOutputElement(session, getUniqueId(), output, sev, source, expression) : new ReplVariableElement(session, expression, sev, source));
      return;
    }
    this.appendOutputToRepl(session, output, sev, source);
  }
  appendOutputToRepl(session, output, sev, source) {
    const config = this.configurationService.getValue("debug");
    const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
    if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
      if (!previousElement.value.endsWith("\n") && !previousElement.value.endsWith("\r\n") && previousElement.count === 1) {
        const combinedOutput = previousElement.value + output;
        this.replElements[this.replElements.length - 1] = new ReplOutputElement(
          session,
          getUniqueId(),
          combinedOutput,
          sev,
          source
        );
        this._onDidChangeElements.fire(void 0);
        if (config.console.collapseIdenticalLines && combinedOutput.endsWith("\n")) {
          this.tryCollapseCompleteLine(sev, source);
        }
        if (config.console.collapseIdenticalLines && combinedOutput.includes("\n")) {
          const lines = this.splitIntoLines(combinedOutput);
          if (lines.length > 1) {
            this.applyLineLevelCollapsing(session, sev, source);
          }
        }
        return;
      }
    }
    if (config.console.collapseIdenticalLines && output.includes("\n")) {
      this.processMultiLineOutput(session, output, sev, source);
    } else {
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source)) {
        if (previousElement.value === output && config.console.collapseIdenticalLines) {
          previousElement.count++;
          return;
        }
      }
      const element = new ReplOutputElement(session, getUniqueId(), output, sev, source);
      this.addReplElement(element);
    }
  }
  tryCollapseCompleteLine(sev, source) {
    if (this.replElements.length < 2) {
      return;
    }
    const lastElement = this.replElements[this.replElements.length - 1];
    const secondToLastElement = this.replElements[this.replElements.length - 2];
    if (lastElement instanceof ReplOutputElement && secondToLastElement instanceof ReplOutputElement && lastElement.severity === sev && secondToLastElement.severity === sev && areSourcesEqual(lastElement.sourceData, source) && areSourcesEqual(secondToLastElement.sourceData, source) && lastElement.value === secondToLastElement.value && lastElement.count === 1 && lastElement.value.endsWith("\n")) {
      secondToLastElement.count += lastElement.count;
      this.replElements.pop();
      this._onDidChangeElements.fire(void 0);
    }
  }
  processMultiLineOutput(session, output, sev, source) {
    const lines = this.splitIntoLines(output);
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source) && previousElement.value === line) {
        previousElement.count++;
      } else {
        const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
        this.addReplElement(element);
      }
    }
  }
  splitIntoLines(text) {
    const lines = [];
    let start = 0;
    while (start < text.length) {
      const nextLF = text.indexOf("\n", start);
      if (nextLF === -1) {
        lines.push(text.substring(start));
        break;
      }
      lines.push(text.substring(start, nextLF + 1));
      start = nextLF + 1;
    }
    return lines;
  }
  applyLineLevelCollapsing(session, sev, source) {
    const lastElement = this.replElements[this.replElements.length - 1];
    if (!(lastElement instanceof ReplOutputElement) || lastElement.severity !== sev || !areSourcesEqual(lastElement.sourceData, source)) {
      return;
    }
    const lines = this.splitIntoLines(lastElement.value);
    if (lines.length <= 1) {
      return;
    }
    this.replElements.pop();
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      const previousElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
      if (previousElement instanceof ReplOutputElement && previousElement.severity === sev && areSourcesEqual(previousElement.sourceData, source) && previousElement.value === line) {
        previousElement.count++;
      } else {
        const element = new ReplOutputElement(session, getUniqueId(), line, sev, source);
        this.addReplElement(element);
      }
    }
    this._onDidChangeElements.fire(void 0);
  }
  startGroup(session, name, autoExpand, sourceData) {
    const group = new ReplGroup(session, name, autoExpand, sourceData);
    this.addReplElement(group);
  }
  endGroup() {
    const lastElement = this.replElements[this.replElements.length - 1];
    if (lastElement instanceof ReplGroup) {
      lastElement.end();
    }
  }
  addReplElement(newElement) {
    const lastElement = this.replElements.length ? this.replElements[this.replElements.length - 1] : void 0;
    if (lastElement instanceof ReplGroup && !lastElement.hasEnded) {
      lastElement.addChild(newElement);
    } else {
      this.replElements.push(newElement);
      const config = this.configurationService.getValue("debug");
      if (this.replElements.length > config.console.maximumLines) {
        this.replElements.splice(0, this.replElements.length - config.console.maximumLines);
      }
    }
    this._onDidChangeElements.fire(newElement);
  }
  removeReplExpressions() {
    if (this.replElements.length > 0) {
      this.replElements = [];
      this._onDidChangeElements.fire(void 0);
    }
  }
  /** Returns a new REPL model that's a copy of this one. */
  clone() {
    const newRepl = new ReplModel(this.configurationService);
    newRepl.replElements = this.replElements.slice();
    return newRepl;
  }
}
export {
  RawObjectReplElement,
  ReplEvaluationInput,
  ReplEvaluationResult,
  ReplGroup,
  ReplModel,
  ReplOutputElement,
  ReplVariableElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9yZXBsTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCBzZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXNzaW9uLCBJRXhwcmVzc2lvbiwgSU5lc3RpbmdSZXBsRWxlbWVudCwgSVJlcGxFbGVtZW50LCBJUmVwbEVsZW1lbnRTb3VyY2UsIElTdGFja0ZyYW1lIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBFeHByZXNzaW9uQ29udGFpbmVyIH0gZnJvbSAnLi9kZWJ1Z01vZGVsLmpzJztcblxubGV0IHRvcFJlcGxFbGVtZW50Q291bnRlciA9IDA7XG5jb25zdCBnZXRVbmlxdWVJZCA9ICgpID0+IGB0b3BSZXBsRWxlbWVudDoke3RvcFJlcGxFbGVtZW50Q291bnRlcisrfWA7XG5cbi8qKlxuICogR2VuZXJhbCBjYXNlIG9mIGRhdGEgZnJvbSBEQVAgdGhlIGBvdXRwdXRgIGV2ZW50LiB7QGxpbmsgUmVwbFZhcmlhYmxlRWxlbWVudH1cbiAqIGlzIHVzZWQgaW5zdGVhZCBvbmx5IGlmIHRoZXJlIGlzIGEgYHZhcmlhYmxlc1JlZmVyZW5jZWAgd2l0aCBubyBgb3V0cHV0YCB0ZXh0LlxuICovXG5leHBvcnQgY2xhc3MgUmVwbE91dHB1dEVsZW1lbnQgaW1wbGVtZW50cyBJTmVzdGluZ1JlcGxFbGVtZW50IHtcblxuXHRwcml2YXRlIF9jb3VudCA9IDE7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ291bnQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLFxuXHRcdHByaXZhdGUgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgdmFsdWU6IHN0cmluZyxcblx0XHRwdWJsaWMgc2V2ZXJpdHk6IHNldmVyaXR5LFxuXHRcdHB1YmxpYyBzb3VyY2VEYXRhPzogSVJlcGxFbGVtZW50U291cmNlLFxuXHRcdHB1YmxpYyByZWFkb25seSBleHByZXNzaW9uPzogSUV4cHJlc3Npb24sXG5cdCkge1xuXHR9XG5cblx0dG9TdHJpbmcoaW5jbHVkZVNvdXJjZSA9IGZhbHNlKTogc3RyaW5nIHtcblx0XHRsZXQgdmFsdWVSZXNwZWN0Q291bnQgPSB0aGlzLnZhbHVlO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgdGhpcy5jb3VudDsgaSsrKSB7XG5cdFx0XHR2YWx1ZVJlc3BlY3RDb3VudCArPSAodmFsdWVSZXNwZWN0Q291bnQuZW5kc1dpdGgoJ1xcbicpID8gJycgOiAnXFxuJykgKyB0aGlzLnZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VTdHIgPSAodGhpcy5zb3VyY2VEYXRhICYmIGluY2x1ZGVTb3VyY2UpID8gYCAke3RoaXMuc291cmNlRGF0YS5zb3VyY2UubmFtZX1gIDogJyc7XG5cdFx0cmV0dXJuIHZhbHVlUmVzcGVjdENvdW50ICsgc291cmNlU3RyO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxuXG5cdGdldENoaWxkcmVuKCk6IFByb21pc2U8SVJlcGxFbGVtZW50W10+IHtcblx0XHRyZXR1cm4gdGhpcy5leHByZXNzaW9uPy5nZXRDaGlsZHJlbigpIHx8IFByb21pc2UucmVzb2x2ZShbXSk7XG5cdH1cblxuXHRzZXQgY291bnQodmFsdWU6IG51bWJlcikge1xuXHRcdHRoaXMuX2NvdW50ID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb3VudC5maXJlKCk7XG5cdH1cblxuXHRnZXQgY291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY291bnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb3VudCgpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ291bnQuZXZlbnQ7XG5cdH1cblxuXHRnZXQgaGFzQ2hpbGRyZW4oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5leHByZXNzaW9uPy5oYXNDaGlsZHJlbjtcblx0fVxufVxuXG4vKiogVG9wLWxldmVsIHZhcmlhYmxlIGxvZ2dlZCB2aWEgREFQIG91dHB1dCB3aGVuIHRoZXJlJ3Mgbm8gYG91dHB1dGAgc3RyaW5nICovXG5leHBvcnQgY2xhc3MgUmVwbFZhcmlhYmxlRWxlbWVudCBpbXBsZW1lbnRzIElOZXN0aW5nUmVwbEVsZW1lbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgaGFzQ2hpbGRyZW46IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4cHJlc3Npb246IElFeHByZXNzaW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXZlcml0eTogc2V2ZXJpdHksXG5cdFx0cHVibGljIHJlYWRvbmx5IHNvdXJjZURhdGE/OiBJUmVwbEVsZW1lbnRTb3VyY2UsXG5cdCkge1xuXHRcdHRoaXMuaGFzQ2hpbGRyZW4gPSBleHByZXNzaW9uLmhhc0NoaWxkcmVuO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oKTogSVJlcGxFbGVtZW50W10gfCBQcm9taXNlPElSZXBsRWxlbWVudFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXhwcmVzc2lvbi5nZXRDaGlsZHJlbigpO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5leHByZXNzaW9uLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSYXdPYmplY3RSZXBsRWxlbWVudCBpbXBsZW1lbnRzIElFeHByZXNzaW9uLCBJTmVzdGluZ1JlcGxFbGVtZW50IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfQ0hJTERSRU4gPSAxMDAwOyAvLyB1cHBlciBib3VuZCBvZiBjaGlsZHJlbiBwZXIgdmFsdWVcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGlkOiBzdHJpbmcsIHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB2YWx1ZU9iajogYW55LCBwdWJsaWMgc291cmNlRGF0YT86IElSZXBsRWxlbWVudFNvdXJjZSwgcHVibGljIGFubm90YXRpb24/OiBzdHJpbmcpIHsgfVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdmFsdWUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy52YWx1ZU9iaiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuICdudWxsJztcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodGhpcy52YWx1ZU9iaikpIHtcblx0XHRcdHJldHVybiBgQXJyYXlbJHt0aGlzLnZhbHVlT2JqLmxlbmd0aH1dYDtcblx0XHR9IGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMudmFsdWVPYmopKSB7XG5cdFx0XHRyZXR1cm4gJ09iamVjdCc7XG5cdFx0fSBlbHNlIGlmIChpc1N0cmluZyh0aGlzLnZhbHVlT2JqKSkge1xuXHRcdFx0cmV0dXJuIGBcIiR7dGhpcy52YWx1ZU9ian1cImA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFN0cmluZyh0aGlzLnZhbHVlT2JqKSB8fCAnJztcblx0fVxuXG5cdGdldCBoYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKEFycmF5LmlzQXJyYXkodGhpcy52YWx1ZU9iaikgJiYgdGhpcy52YWx1ZU9iai5sZW5ndGggPiAwKSB8fCAoaXNPYmplY3QodGhpcy52YWx1ZU9iaikgJiYgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModGhpcy52YWx1ZU9iaikubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRldmFsdWF0ZUxhenkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJRXhwcmVzc2lvbltdPiB7XG5cdFx0bGV0IHJlc3VsdDogSUV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHRoaXMudmFsdWVPYmopKSB7XG5cdFx0XHRyZXN1bHQgPSAoPGFueVtdPnRoaXMudmFsdWVPYmopLnNsaWNlKDAsIFJhd09iamVjdFJlcGxFbGVtZW50Lk1BWF9DSElMRFJFTilcblx0XHRcdFx0Lm1hcCgodiwgaW5kZXgpID0+IG5ldyBSYXdPYmplY3RSZXBsRWxlbWVudChgJHt0aGlzLmlkfToke2luZGV4fWAsIFN0cmluZyhpbmRleCksIHYpKTtcblx0XHR9IGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMudmFsdWVPYmopKSB7XG5cdFx0XHRyZXN1bHQgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0aGlzLnZhbHVlT2JqKS5zbGljZSgwLCBSYXdPYmplY3RSZXBsRWxlbWVudC5NQVhfQ0hJTERSRU4pXG5cdFx0XHRcdC5tYXAoKGtleSwgaW5kZXgpID0+IG5ldyBSYXdPYmplY3RSZXBsRWxlbWVudChgJHt0aGlzLmlkfToke2luZGV4fWAsIGtleSwgdGhpcy52YWx1ZU9ialtrZXldKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5uYW1lfVxcbiR7dGhpcy52YWx1ZX1gO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsRXZhbHVhdGlvbklucHV0IGltcGxlbWVudHMgSVJlcGxFbGVtZW50IHtcblx0cHJpdmF0ZSBpZDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyB2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxFdmFsdWF0aW9uUmVzdWx0IGV4dGVuZHMgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElSZXBsRWxlbWVudCB7XG5cdHByaXZhdGUgX2F2YWlsYWJsZSA9IHRydWU7XG5cblx0Z2V0IGF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXZhaWxhYmxlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG9yaWdpbmFsRXhwcmVzc2lvbjogc3RyaW5nKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCB1bmRlZmluZWQsIDAsIGdlbmVyYXRlVXVpZCgpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uOiBzdHJpbmcsIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdXBlci5ldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvbiwgc2Vzc2lvbiwgc3RhY2tGcmFtZSwgY29udGV4dCk7XG5cdFx0dGhpcy5fYXZhaWxhYmxlID0gcmVzdWx0O1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMudmFsdWV9YDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVwbEdyb3VwIGltcGxlbWVudHMgSU5lc3RpbmdSZXBsRWxlbWVudCB7XG5cblx0cHJpdmF0ZSBjaGlsZHJlbjogSVJlcGxFbGVtZW50W10gPSBbXTtcblx0cHJpdmF0ZSBpZDogc3RyaW5nO1xuXHRwcml2YXRlIGVuZGVkID0gZmFsc2U7XG5cdHN0YXRpYyBDT1VOVEVSID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbixcblx0XHRwdWJsaWMgbmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyBhdXRvRXhwYW5kOiBib29sZWFuLFxuXHRcdHB1YmxpYyBzb3VyY2VEYXRhPzogSVJlcGxFbGVtZW50U291cmNlXG5cdCkge1xuXHRcdHRoaXMuaWQgPSBgcmVwbEdyb3VwOiR7UmVwbEdyb3VwLkNPVU5URVIrK31gO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxuXG5cdHRvU3RyaW5nKGluY2x1ZGVTb3VyY2UgPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc291cmNlU3RyID0gKGluY2x1ZGVTb3VyY2UgJiYgdGhpcy5zb3VyY2VEYXRhKSA/IGAgJHt0aGlzLnNvdXJjZURhdGEuc291cmNlLm5hbWV9YCA6ICcnO1xuXHRcdHJldHVybiB0aGlzLm5hbWUgKyBzb3VyY2VTdHI7XG5cdH1cblxuXHRhZGRDaGlsZChjaGlsZDogSVJlcGxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCA/IHRoaXMuY2hpbGRyZW5bdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAobGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXAgJiYgIWxhc3RFbGVtZW50Lmhhc0VuZGVkKSB7XG5cdFx0XHRsYXN0RWxlbWVudC5hZGRDaGlsZChjaGlsZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oKTogSVJlcGxFbGVtZW50W10ge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuO1xuXHR9XG5cblx0ZW5kKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5jaGlsZHJlbi5sZW5ndGggPyB0aGlzLmNoaWxkcmVuW3RoaXMuY2hpbGRyZW4ubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGxhc3RFbGVtZW50IGluc3RhbmNlb2YgUmVwbEdyb3VwICYmICFsYXN0RWxlbWVudC5oYXNFbmRlZCkge1xuXHRcdFx0bGFzdEVsZW1lbnQuZW5kKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW5kZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNFbmRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbmRlZDtcblx0fVxufVxuXG5mdW5jdGlvbiBhcmVTb3VyY2VzRXF1YWwoZmlyc3Q6IElSZXBsRWxlbWVudFNvdXJjZSB8IHVuZGVmaW5lZCwgc2Vjb25kOiBJUmVwbEVsZW1lbnRTb3VyY2UgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFmaXJzdCAmJiAhc2Vjb25kKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKGZpcnN0ICYmIHNlY29uZCkge1xuXHRcdHJldHVybiBmaXJzdC5jb2x1bW4gPT09IHNlY29uZC5jb2x1bW4gJiYgZmlyc3QubGluZU51bWJlciA9PT0gc2Vjb25kLmxpbmVOdW1iZXIgJiYgZmlyc3Quc291cmNlLnVyaS50b1N0cmluZygpID09PSBzZWNvbmQuc291cmNlLnVyaS50b1N0cmluZygpO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOZXdSZXBsRWxlbWVudERhdGEge1xuXHRvdXRwdXQ6IHN0cmluZztcblx0ZXhwcmVzc2lvbj86IElFeHByZXNzaW9uO1xuXHRzZXY6IHNldmVyaXR5O1xuXHRzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXBsTW9kZWwge1xuXHRwcml2YXRlIHJlcGxFbGVtZW50czogSVJlcGxFbGVtZW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbGVtZW50cyA9IG5ldyBFbWl0dGVyPElSZXBsRWxlbWVudCB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbGVtZW50cyA9IHRoaXMuX29uRGlkQ2hhbmdlRWxlbWVudHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7IH1cblxuXHRnZXRSZXBsRWxlbWVudHMoKTogSVJlcGxFbGVtZW50W10ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxFbGVtZW50cztcblx0fVxuXG5cdGFzeW5jIGFkZFJlcGxFeHByZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkLCBleHByZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFkZFJlcGxFbGVtZW50KG5ldyBSZXBsRXZhbHVhdGlvbklucHV0KGV4cHJlc3Npb24pKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUmVwbEV2YWx1YXRpb25SZXN1bHQoZXhwcmVzc2lvbik7XG5cdFx0YXdhaXQgcmVzdWx0LmV2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uLCBzZXNzaW9uLCBzdGFja0ZyYW1lLCAncmVwbCcpO1xuXHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQocmVzdWx0KTtcblx0fVxuXG5cdGFwcGVuZFRvUmVwbChzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCB7IG91dHB1dCwgZXhwcmVzc2lvbiwgc2V2LCBzb3VyY2UgfTogSU5ld1JlcGxFbGVtZW50RGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNsZWFyQW5zaVNlcXVlbmNlID0gJ1xcdTAwMWJbMkonO1xuXHRcdGNvbnN0IGNsZWFyQW5zaUluZGV4ID0gb3V0cHV0Lmxhc3RJbmRleE9mKGNsZWFyQW5zaVNlcXVlbmNlKTtcblx0XHRpZiAoY2xlYXJBbnNpSW5kZXggIT09IC0xKSB7XG5cdFx0XHQvLyBbMkogaXMgdGhlIGFuc2kgZXNjYXBlIHNlcXVlbmNlIGZvciBjbGVhcmluZyB0aGUgZGlzcGxheSBodHRwOi8vYXNjaWktdGFibGUuY29tL2Fuc2ktZXNjYXBlLXNlcXVlbmNlcy5waHBcblx0XHRcdHRoaXMucmVtb3ZlUmVwbEV4cHJlc3Npb25zKCk7XG5cdFx0XHR0aGlzLmFwcGVuZFRvUmVwbChzZXNzaW9uLCB7IG91dHB1dDogbmxzLmxvY2FsaXplKCdjb25zb2xlQ2xlYXJlZCcsIFwiQ29uc29sZSB3YXMgY2xlYXJlZFwiKSwgc2V2OiBzZXZlcml0eS5JZ25vcmUgfSk7XG5cdFx0XHRvdXRwdXQgPSBvdXRwdXQuc3Vic3RyaW5nKGNsZWFyQW5zaUluZGV4ICsgY2xlYXJBbnNpU2VxdWVuY2UubGVuZ3RoKTtcblx0XHR9XG5cblx0XHRpZiAoZXhwcmVzc2lvbikge1xuXHRcdFx0Ly8gaWYgdGhlcmUgaXMgYW4gb3V0cHV0IHN0cmluZywgcHJlZmVyIHRvIHNob3cgdGhhdCwgc2luY2UgdGhlIERBIGNvdWxkXG5cdFx0XHQvLyBoYXZlIGZvcm1hdHRlZCBpdCBuaWNlbHkgZS5nLiB3aXRoIEFOU0kgY29sb3IgY29kZXMuXG5cdFx0XHR0aGlzLmFkZFJlcGxFbGVtZW50KG91dHB1dFxuXHRcdFx0XHQ/IG5ldyBSZXBsT3V0cHV0RWxlbWVudChzZXNzaW9uLCBnZXRVbmlxdWVJZCgpLCBvdXRwdXQsIHNldiwgc291cmNlLCBleHByZXNzaW9uKVxuXHRcdFx0XHQ6IG5ldyBSZXBsVmFyaWFibGVFbGVtZW50KHNlc3Npb24sIGV4cHJlc3Npb24sIHNldiwgc291cmNlKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5hcHBlbmRPdXRwdXRUb1JlcGwoc2Vzc2lvbiwgb3V0cHV0LCBzZXYsIHNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZE91dHB1dFRvUmVwbChzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBvdXRwdXQ6IHN0cmluZywgc2V2OiBzZXZlcml0eSwgc291cmNlPzogSVJlcGxFbGVtZW50U291cmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKTtcblx0XHRjb25zdCBwcmV2aW91c0VsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggPyB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEhhbmRsZSBjb25jYXRlbmF0aW9uIG9mIGluY29tcGxldGUgbGluZXMgZmlyc3Rcblx0XHRpZiAocHJldmlvdXNFbGVtZW50IGluc3RhbmNlb2YgUmVwbE91dHB1dEVsZW1lbnQgJiYgcHJldmlvdXNFbGVtZW50LnNldmVyaXR5ID09PSBzZXYgJiYgYXJlU291cmNlc0VxdWFsKHByZXZpb3VzRWxlbWVudC5zb3VyY2VEYXRhLCBzb3VyY2UpKSB7XG5cdFx0XHRpZiAoIXByZXZpb3VzRWxlbWVudC52YWx1ZS5lbmRzV2l0aCgnXFxuJykgJiYgIXByZXZpb3VzRWxlbWVudC52YWx1ZS5lbmRzV2l0aCgnXFxyXFxuJykgJiYgcHJldmlvdXNFbGVtZW50LmNvdW50ID09PSAxKSB7XG5cdFx0XHRcdC8vIENvbmNhdGVuYXRlIHdpdGggcHJldmlvdXMgaW5jb21wbGV0ZSBsaW5lXG5cdFx0XHRcdGNvbnN0IGNvbWJpbmVkT3V0cHV0ID0gcHJldmlvdXNFbGVtZW50LnZhbHVlICsgb3V0cHV0O1xuXHRcdFx0XHR0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXSA9IG5ldyBSZXBsT3V0cHV0RWxlbWVudChcblx0XHRcdFx0XHRzZXNzaW9uLCBnZXRVbmlxdWVJZCgpLCBjb21iaW5lZE91dHB1dCwgc2V2LCBzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRzLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBJZiB0aGUgY29tYmluZWQgb3V0cHV0IG5vdyBmb3JtcyBhIGNvbXBsZXRlIGxpbmUgYW5kIGNvbGxhcHNpbmcgaXMgZW5hYmxlZCxcblx0XHRcdFx0Ly8gY2hlY2sgaWYgaXQgY2FuIGJlIGNvbGxhcHNlZCB3aXRoIHByZXZpb3VzIGVsZW1lbnRzXG5cdFx0XHRcdGlmIChjb25maWcuY29uc29sZS5jb2xsYXBzZUlkZW50aWNhbExpbmVzICYmIGNvbWJpbmVkT3V0cHV0LmVuZHNXaXRoKCdcXG4nKSkge1xuXHRcdFx0XHRcdHRoaXMudHJ5Q29sbGFwc2VDb21wbGV0ZUxpbmUoc2V2LCBzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIGNvbWJpbmVkIG91dHB1dCBjb250YWlucyBtdWx0aXBsZSBsaW5lcywgYXBwbHkgbGluZS1sZXZlbCBjb2xsYXBzaW5nXG5cdFx0XHRcdGlmIChjb25maWcuY29uc29sZS5jb2xsYXBzZUlkZW50aWNhbExpbmVzICYmIGNvbWJpbmVkT3V0cHV0LmluY2x1ZGVzKCdcXG4nKSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVzID0gdGhpcy5zcGxpdEludG9MaW5lcyhjb21iaW5lZE91dHB1dCk7XG5cdFx0XHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdHRoaXMuYXBwbHlMaW5lTGV2ZWxDb2xsYXBzaW5nKHNlc3Npb24sIHNldiwgc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIGNvbGxhcHNpbmcgaXMgZW5hYmxlZCBhbmQgdGhlIG91dHB1dCBjb250YWlucyBsaW5lIGJyZWFrcywgcGFyc2UgYW5kIGNvbGxhcHNlIGF0IGxpbmUgbGV2ZWxcblx0XHRpZiAoY29uZmlnLmNvbnNvbGUuY29sbGFwc2VJZGVudGljYWxMaW5lcyAmJiBvdXRwdXQuaW5jbHVkZXMoJ1xcbicpKSB7XG5cdFx0XHR0aGlzLnByb2Nlc3NNdWx0aUxpbmVPdXRwdXQoc2Vzc2lvbiwgb3V0cHV0LCBzZXYsIHNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZvciBzaW1wbGUgb3V0cHV0IHdpdGhvdXQgbGluZSBicmVha3MsIHVzZSB0aGUgb3JpZ2luYWwgbG9naWNcblx0XHRcdGlmIChwcmV2aW91c0VsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJiBwcmV2aW91c0VsZW1lbnQuc2V2ZXJpdHkgPT09IHNldiAmJiBhcmVTb3VyY2VzRXF1YWwocHJldmlvdXNFbGVtZW50LnNvdXJjZURhdGEsIHNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzRWxlbWVudC52YWx1ZSA9PT0gb3V0cHV0ICYmIGNvbmZpZy5jb25zb2xlLmNvbGxhcHNlSWRlbnRpY2FsTGluZXMpIHtcblx0XHRcdFx0XHRwcmV2aW91c0VsZW1lbnQuY291bnQrKztcblx0XHRcdFx0XHQvLyBObyBuZWVkIHRvIGZpcmUgYW4gZXZlbnQsIGp1c3QgdGhlIGNvdW50IHVwZGF0ZXMgYW5kIGJhZGdlIHdpbGwgYWRqdXN0IGF1dG9tYXRpY2FsbHlcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IG5ldyBSZXBsT3V0cHV0RWxlbWVudChzZXNzaW9uLCBnZXRVbmlxdWVJZCgpLCBvdXRwdXQsIHNldiwgc291cmNlKTtcblx0XHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQoZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cnlDb2xsYXBzZUNvbXBsZXRlTGluZShzZXY6IHNldmVyaXR5LCBzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2UpOiB2b2lkIHtcblx0XHQvLyBUcnkgdG8gY29sbGFwc2UgdGhlIGxhc3QgZWxlbWVudCB3aXRoIHRoZSBzZWNvbmQtdG8tbGFzdCBpZiB0aGV5IGFyZSBpZGVudGljYWwgY29tcGxldGUgbGluZXNcblx0XHRpZiAodGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5yZXBsRWxlbWVudHNbdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3Qgc2Vjb25kVG9MYXN0RWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDJdO1xuXG5cdFx0aWYgKGxhc3RFbGVtZW50IGluc3RhbmNlb2YgUmVwbE91dHB1dEVsZW1lbnQgJiZcblx0XHRcdHNlY29uZFRvTGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJlxuXHRcdFx0bGFzdEVsZW1lbnQuc2V2ZXJpdHkgPT09IHNldiAmJlxuXHRcdFx0c2Vjb25kVG9MYXN0RWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ICYmXG5cdFx0XHRhcmVTb3VyY2VzRXF1YWwobGFzdEVsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSAmJlxuXHRcdFx0YXJlU291cmNlc0VxdWFsKHNlY29uZFRvTGFzdEVsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSAmJlxuXHRcdFx0bGFzdEVsZW1lbnQudmFsdWUgPT09IHNlY29uZFRvTGFzdEVsZW1lbnQudmFsdWUgJiZcblx0XHRcdGxhc3RFbGVtZW50LmNvdW50ID09PSAxICYmXG5cdFx0XHRsYXN0RWxlbWVudC52YWx1ZS5lbmRzV2l0aCgnXFxuJykpIHtcblxuXHRcdFx0Ly8gQ29sbGFwc2UgdGhlIGxhc3QgZWxlbWVudCBpbnRvIHRoZSBzZWNvbmQtdG8tbGFzdFxuXHRcdFx0c2Vjb25kVG9MYXN0RWxlbWVudC5jb3VudCArPSBsYXN0RWxlbWVudC5jb3VudDtcblx0XHRcdHRoaXMucmVwbEVsZW1lbnRzLnBvcCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFbGVtZW50cy5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcm9jZXNzTXVsdGlMaW5lT3V0cHV0KHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIG91dHB1dDogc3RyaW5nLCBzZXY6IHNldmVyaXR5LCBzb3VyY2U/OiBJUmVwbEVsZW1lbnRTb3VyY2UpOiB2b2lkIHtcblx0XHQvLyBTcGxpdCBvdXRwdXQgaW50byBsaW5lcywgcHJlc2VydmluZyBsaW5lIGVuZGluZ3Ncblx0XHRjb25zdCBsaW5lcyA9IHRoaXMuc3BsaXRJbnRvTGluZXMob3V0cHV0KTtcblxuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0aWYgKGxpbmUubGVuZ3RoID09PSAwKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdGNvbnN0IHByZXZpb3VzRWxlbWVudCA9IHRoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCA/IHRoaXMucmVwbEVsZW1lbnRzW3RoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGlzIGxpbmUgY2FuIGJlIGNvbGxhcHNlZCB3aXRoIHRoZSBwcmV2aW91cyBvbmVcblx0XHRcdGlmIChwcmV2aW91c0VsZW1lbnQgaW5zdGFuY2VvZiBSZXBsT3V0cHV0RWxlbWVudCAmJlxuXHRcdFx0XHRwcmV2aW91c0VsZW1lbnQuc2V2ZXJpdHkgPT09IHNldiAmJlxuXHRcdFx0XHRhcmVTb3VyY2VzRXF1YWwocHJldmlvdXNFbGVtZW50LnNvdXJjZURhdGEsIHNvdXJjZSkgJiZcblx0XHRcdFx0cHJldmlvdXNFbGVtZW50LnZhbHVlID09PSBsaW5lKSB7XG5cdFx0XHRcdHByZXZpb3VzRWxlbWVudC5jb3VudCsrO1xuXHRcdFx0XHQvLyBObyBuZWVkIHRvIGZpcmUgYW4gZXZlbnQsIGp1c3QgdGhlIGNvdW50IHVwZGF0ZXMgYW5kIGJhZGdlIHdpbGwgYWRqdXN0IGF1dG9tYXRpY2FsbHlcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgUmVwbE91dHB1dEVsZW1lbnQoc2Vzc2lvbiwgZ2V0VW5pcXVlSWQoKSwgbGluZSwgc2V2LCBzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLmFkZFJlcGxFbGVtZW50KGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3BsaXRJbnRvTGluZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdC8vIFNwbGl0IHRleHQgaW50byBsaW5lcyB3aGlsZSBwcmVzZXJ2aW5nIGxpbmUgZW5kaW5ncywgdXNpbmcgaW5kZXhPZiBmb3IgZWZmaWNpZW5jeVxuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBzdGFydCA9IDA7XG5cblx0XHR3aGlsZSAoc3RhcnQgPCB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbmV4dExGID0gdGV4dC5pbmRleE9mKCdcXG4nLCBzdGFydCk7XG5cdFx0XHRpZiAobmV4dExGID09PSAtMSkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKHRleHQuc3Vic3RyaW5nKHN0YXJ0KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0bGluZXMucHVzaCh0ZXh0LnN1YnN0cmluZyhzdGFydCwgbmV4dExGICsgMSkpO1xuXHRcdFx0c3RhcnQgPSBuZXh0TEYgKyAxO1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lcztcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlMaW5lTGV2ZWxDb2xsYXBzaW5nKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHNldjogc2V2ZXJpdHksIHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZSk6IHZvaWQge1xuXHRcdC8vIEFwcGx5IGxpbmUtbGV2ZWwgY29sbGFwc2luZyB0byB0aGUgbGFzdCBlbGVtZW50IGlmIGl0IGNvbnRhaW5zIG11bHRpcGxlIGxpbmVzXG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHRpZiAoIShsYXN0RWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50KSB8fCBsYXN0RWxlbWVudC5zZXZlcml0eSAhPT0gc2V2IHx8ICFhcmVTb3VyY2VzRXF1YWwobGFzdEVsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzID0gdGhpcy5zcGxpdEludG9MaW5lcyhsYXN0RWxlbWVudC52YWx1ZSk7XG5cdFx0aWYgKGxpbmVzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vIG11bHRpcGxlIGxpbmVzIHRvIGNvbGxhcHNlXG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBsYXN0IGVsZW1lbnQgYW5kIHJlcHJvY2VzcyBpdCBhcyBtdWx0aXBsZSBsaW5lc1xuXHRcdHRoaXMucmVwbEVsZW1lbnRzLnBvcCgpO1xuXG5cdFx0Ly8gUHJvY2VzcyBlYWNoIGxpbmUgYW5kIHRyeSB0byBjb2xsYXBzZSB3aXRoIGV4aXN0aW5nIGVsZW1lbnRzXG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS5sZW5ndGggPT09IDApIHsgY29udGludWU7IH1cblxuXHRcdFx0Y29uc3QgcHJldmlvdXNFbGVtZW50ID0gdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoID8gdGhpcy5yZXBsRWxlbWVudHNbdGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgbGluZSBjYW4gYmUgY29sbGFwc2VkIHdpdGggdGhlIHByZXZpb3VzIG9uZVxuXHRcdFx0aWYgKHByZXZpb3VzRWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ICYmXG5cdFx0XHRcdHByZXZpb3VzRWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ICYmXG5cdFx0XHRcdGFyZVNvdXJjZXNFcXVhbChwcmV2aW91c0VsZW1lbnQuc291cmNlRGF0YSwgc291cmNlKSAmJlxuXHRcdFx0XHRwcmV2aW91c0VsZW1lbnQudmFsdWUgPT09IGxpbmUpIHtcblx0XHRcdFx0cHJldmlvdXNFbGVtZW50LmNvdW50Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gbmV3IFJlcGxPdXRwdXRFbGVtZW50KHNlc3Npb24sIGdldFVuaXF1ZUlkKCksIGxpbmUsIHNldiwgc291cmNlKTtcblx0XHRcdFx0dGhpcy5hZGRSZXBsRWxlbWVudChlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHN0YXJ0R3JvdXAoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgbmFtZTogc3RyaW5nLCBhdXRvRXhwYW5kOiBib29sZWFuLCBzb3VyY2VEYXRhPzogSVJlcGxFbGVtZW50U291cmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBuZXcgUmVwbEdyb3VwKHNlc3Npb24sIG5hbWUsIGF1dG9FeHBhbmQsIHNvdXJjZURhdGEpO1xuXHRcdHRoaXMuYWRkUmVwbEVsZW1lbnQoZ3JvdXApO1xuXHR9XG5cblx0ZW5kR3JvdXAoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHRpZiAobGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXApIHtcblx0XHRcdGxhc3RFbGVtZW50LmVuZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkUmVwbEVsZW1lbnQobmV3RWxlbWVudDogSVJlcGxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEVsZW1lbnQgPSB0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggPyB0aGlzLnJlcGxFbGVtZW50c1t0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAobGFzdEVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXAgJiYgIWxhc3RFbGVtZW50Lmhhc0VuZGVkKSB7XG5cdFx0XHRsYXN0RWxlbWVudC5hZGRDaGlsZChuZXdFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXBsRWxlbWVudHMucHVzaChuZXdFbGVtZW50KTtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJyk7XG5cdFx0XHRpZiAodGhpcy5yZXBsRWxlbWVudHMubGVuZ3RoID4gY29uZmlnLmNvbnNvbGUubWF4aW11bUxpbmVzKSB7XG5cdFx0XHRcdHRoaXMucmVwbEVsZW1lbnRzLnNwbGljZSgwLCB0aGlzLnJlcGxFbGVtZW50cy5sZW5ndGggLSBjb25maWcuY29uc29sZS5tYXhpbXVtTGluZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRzLmZpcmUobmV3RWxlbWVudCk7XG5cdH1cblxuXHRyZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmVwbEVsZW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMucmVwbEVsZW1lbnRzID0gW107XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmV0dXJucyBhIG5ldyBSRVBMIG1vZGVsIHRoYXQncyBhIGNvcHkgb2YgdGhpcyBvbmUuICovXG5cdGNsb25lKCkge1xuXHRcdGNvbnN0IG5ld1JlcGwgPSBuZXcgUmVwbE1vZGVsKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdG5ld1JlcGwucmVwbEVsZW1lbnRzID0gdGhpcy5yZXBsRWxlbWVudHMuc2xpY2UoKTtcblx0XHRyZXR1cm4gbmV3UmVwbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFzQjtBQUMvQixPQUFPLGNBQWM7QUFDckIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixZQUFZLFNBQVM7QUFHckIsU0FBUywyQkFBMkI7QUFFcEMsSUFBSSx3QkFBd0I7QUFDNUIsTUFBTSxjQUFjLE1BQU0sa0JBQWtCLHVCQUF1QjtBQU01RCxNQUFNLGtCQUFpRDtBQUFBLEVBSzdELFlBQ1EsU0FDQyxJQUNELE9BQ0FBLFdBQ0EsWUFDUyxZQUNmO0FBTk07QUFDQztBQUNEO0FBQ0Esb0JBQUFBO0FBQ0E7QUFDUztBQVRqQixTQUFRLFNBQVM7QUFDakIsU0FBUSxvQkFBb0IsSUFBSSxRQUFjO0FBQUEsRUFVOUM7QUFBQSxFQUVBLFNBQVMsZ0JBQWdCLE9BQWU7QUFDdkMsUUFBSSxvQkFBb0IsS0FBSztBQUM3QixhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssT0FBTyxLQUFLO0FBQ3BDLDRCQUFzQixrQkFBa0IsU0FBUyxJQUFJLElBQUksS0FBSyxRQUFRLEtBQUs7QUFBQSxJQUM1RTtBQUNBLFVBQU0sWUFBYSxLQUFLLGNBQWMsZ0JBQWlCLElBQUksS0FBSyxXQUFXLE9BQU8sSUFBSSxLQUFLO0FBQzNGLFdBQU8sb0JBQW9CO0FBQUEsRUFDNUI7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsY0FBdUM7QUFDdEMsV0FBTyxLQUFLLFlBQVksWUFBWSxLQUFLLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUM1RDtBQUFBLEVBRUEsSUFBSSxNQUFNLE9BQWU7QUFDeEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxrQkFBa0IsS0FBSztBQUFBLEVBQzdCO0FBQUEsRUFFQSxJQUFJLFFBQWdCO0FBQ25CLFdBQU8sS0FB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
