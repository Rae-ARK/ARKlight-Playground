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
import { distinct } from "../../../../base/common/arrays.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, trackSetChanges } from "../../../../base/common/event.js";
import { stringHash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { mixin } from "../../../../base/common/objects.js";
import { autorun } from "../../../../base/common/observable.js";
import * as resources from "../../../../base/common/resources.js";
import { isString, isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as nls from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DEBUG_MEMORY_SCHEME, DataBreakpointSetType, DebugTreeItemCollapsibleState, MemoryRangeType, State, isFrameDeemphasized } from "./debug.js";
import { UNKNOWN_SOURCE_LABEL, getUriFromSource } from "./debugSource.js";
import { DisassemblyViewInput } from "./disassemblyViewInput.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
const _ExpressionContainer = class _ExpressionContainer {
  constructor(session, threadId, _reference, id, namedVariables = 0, indexedVariables = 0, memoryReference = void 0, startOfVariables = 0, presentationHint = void 0, valueLocationReference = void 0) {
    this.session = session;
    this.threadId = threadId;
    this._reference = _reference;
    this.id = id;
    this.namedVariables = namedVariables;
    this.indexedVariables = indexedVariables;
    this.memoryReference = memoryReference;
    this.startOfVariables = startOfVariables;
    this.presentationHint = presentationHint;
    this.valueLocationReference = valueLocationReference;
    this.valueChanged = false;
    this._value = "";
  }
  get reference() {
    return this._reference;
  }
  set reference(value) {
    this._reference = value;
    this.children = void 0;
  }
  async evaluateLazy() {
    if (typeof this.reference === "undefined") {
      return;
    }
    const response = await this.session.variables(this.reference, this.threadId, void 0, void 0, void 0);
    if (!response || !response.body || !response.body.variables || response.body.variables.length !== 1) {
      return;
    }
    const dummyVar = response.body.variables[0];
    this.reference = dummyVar.variablesReference;
    this._value = dummyVar.value;
    this.namedVariables = dummyVar.namedVariables;
    this.indexedVariables = dummyVar.indexedVariables;
    this.memoryReference = dummyVar.memoryReference;
    this.presentationHint = dummyVar.presentationHint;
    this.valueLocationReference = dummyVar.valueLocationReference;
    this.adoptLazyResponse(dummyVar);
  }
  adoptLazyResponse(response) {
  }
  getChildren() {
    if (!this.children) {
      this.children = this.doGetChildren();
    }
    return this.children;
  }
  async doGetChildren() {
    if (!this.hasChildren) {
      return [];
    }
    if (!this.getChildrenInChunks) {
      return this.fetchVariables(void 0, void 0, void 0);
    }
    const children = this.namedVariables ? await this.fetchVariables(void 0, void 0, "named") : [];
    let chunkSize = _ExpressionContainer.BASE_CHUNK_SIZE;
    while (!!this.indexedVariables && this.indexedVariables > chunkSize * _ExpressionContainer.BASE_CHUNK_SIZE) {
      chunkSize *= _ExpressionContainer.BASE_CHUNK_SIZE;
    }
    if (!!this.indexedVariables && this.indexedVariables > chunkSize) {
      const numberOfChunks = Math.ceil(this.indexedVariables / chunkSize);
      for (let i = 0; i < numberOfChunks; i++) {
        const start = (this.startOfVariables || 0) + i * chunkSize;
        const count = Math.min(chunkSize, this.indexedVariables - i * chunkSize);
        children.push(new Variable(this.session, this.threadId, this, this.reference, `[${start}..${start + count - 1}]`, "", "", void 0, count, void 0, { kind: "virtual" }, void 0, void 0, true, start));
      }
      return children;
    }
    const variables = await this.fetchVariables(this.startOfVariables, this.indexedVariables, "indexed");
    return children.concat(variables);
  }
  getId() {
    return this.id;
  }
  getSession() {
    return this.session;
  }
  get value() {
    return this._value;
  }
  get hasChildren() {
    return !!this.reference && this.reference > 0 && !this.presentationHint?.lazy;
  }
  async fetchVariables(start, count, filter) {
    try {
      const response = await this.session.variables(this.reference || 0, this.threadId, filter, start, count);
      if (!response || !response.body || !response.body.variables) {
        return [];
      }
      const nameCount = /* @__PURE__ */ new Map();
      const vars = response.body.variables.filter((v) => !!v).map((v) => {
        if (isString(v.value) && isString(v.name) && typeof v.variablesReference === "number") {
          const count2 = nameCount.get(v.name) || 0;
          const idDuplicationIndex = count2 > 0 ? count2.toString() : "";
          nameCount.set(v.name, count2 + 1);
          return new Variable(this.session, this.threadId, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.memoryReference, v.presentationHint, v.type, v.__vscodeVariableMenuContext, true, 0, idDuplicationIndex, v.declarationLocationReference, v.valueLocationReference);
        }
        return new Variable(this.session, this.threadId, this, 0, "", void 0, nls.localize("invalidVariableAttributes", "Invalid variable attributes"), 0, 0, void 0, { kind: "virtual" }, void 0, void 0, false);
      });
      if (this.session.autoExpandLazyVariables) {
        await Promise.all(vars.map((v) => v.presentationHint?.lazy && v.evaluateLazy()));
      }
      return vars;
    } catch (e) {
      return [new Variable(this.session, this.threadId, this, 0, "", void 0, e.message, 0, 0, void 0, { kind: "virtual" }, void 0, void 0, false)];
    }
  }
  // The adapter explicitly sents the children count of an expression only if there are lots of children which should be chunked.
  get getChildrenInChunks() {
    return !!this.indexedVariables;
  }
  set value(value) {
    this._value = value;
    this.valueChanged = !!_ExpressionContainer.allValues.get(this.getId()) && _ExpressionContainer.allValues.get(this.getId()) !== Expression.DEFAULT_VALUE && _ExpressionContainer.allValues.get(this.getId()) !== value;
    _ExpressionContainer.allValues.set(this.getId(), value);
  }
  toString() {
    return this.value;
  }
  async evaluateExpression(expression, session, stackFrame, context, keepLazyVars = false, location) {
    if (!session || !stackFrame && context !== "repl") {
      this.value = context === "repl" ? nls.localize("startDebugFirst", "Please start a debug session to evaluate expressions") : Expression.DEFAULT_VALUE;
      this.reference = 0;
      return false;
    }
    this.session = session;
    try {
      const response = await session.evaluate(expression, stackFrame ? stackFrame.frameId : void 0, context, location);
      if (response && response.body) {
        this.value = response.body.result || "";
        this.reference = response.body.variablesReference;
        this.namedVariables = response.body.namedVariables;
        this.indexedVariables = response.body.indexedVariables;
        this.memoryReference = response.body.memoryReference;
        this.type = response.body.type || this.type;
        this.presentationHint = response.body.presentationHint;
        this.valueLocationReference = response.body.valueLocationReference;
        if (!keepLazyVars && response.body.presentationHint?.lazy) {
          await this.evaluateLazy();
        }
        return true;
      }
      return false;
    } catch (e) {
      this.value = e.message || "";
      this.reference = 0;
      this.memoryReference = void 0;
      return false;
    }
  }
};
_ExpressionContainer.allValues = /* @__PURE__ */ new Map();
// Use chunks to support variable paging #9537
_ExpressionContainer.BASE_CHUNK_SIZE = 100;
let ExpressionContainer = _ExpressionContainer;
function handleSetResponse(expression, response) {
  if (response && response.body) {
    expression.value = response.body.value || "";
    expression.type = response.body.type || expression.type;
    expression.reference = response.body.variablesReference;
    expression.namedVariables = response.body.namedVariables;
    expression.indexedVariables = response.body.indexedVariables;
    expression.memoryReference = response.body.memoryReference;
    expression.valueLocationReference = response.body.valueLocationReference;
  }
}
class VisualizedExpression {
  constructor(session, visualizer, treeId, treeItem, original) {
    this.session = session;
    this.visualizer = visualizer;
    this.treeId = treeId;
    this.treeItem = treeItem;
    this.original = original;
    this.id = generateUuid();
  }
  evaluateLazy() {
    return Promise.resolve();
  }
  getChildren() {
    return this.visualizer.getVisualizedChildren(this.session, this.treeId, this.treeItem.id);
  }
  getId() {
    return this.id;
  }
  get name() {
    return this.treeItem.label;
  }
  get value() {
    return this.treeItem.description || "";
  }
  get hasChildren() {
    return this.treeItem.collapsibleState !== DebugTreeItemCollapsibleState.None;
  }
  getSession() {
    return this.session;
  }
  /** Edits the value, sets the {@link errorMessage} and returns false if unsuccessful */
  async edit(newValue) {
    try {
      await this.visualizer.editTreeItem(this.treeId, this.treeItem, newValue);
      return true;
    } catch (e) {
      this.errorMessage = e.message;
      return false;
    }
  }
}
const _Expression = class _Expression extends ExpressionContainer {
  constructor(name, id = generateUuid()) {
    super(void 0, void 0, 0, id);
    this.name = name;
    this._onDidChangeValue = new Emitter();
    this.onDidChangeValue = this._onDidChangeValue.event;
    this.available = false;
    if (name) {
      this.value = _Expression.DEFAULT_VALUE;
    }
  }
  async evaluate(session, stackFrame, context, keepLazyVars, location) {
    const hadDefaultValue = this.value === _Expression.DEFAULT_VALUE;
    this.available = await this.evaluateExpression(this.name, session, stackFrame, context, keepLazyVars, location);
    if (hadDefaultValue || this.valueChanged) {
      this._onDidChangeValue.fire(this);
    }
  }
  toString() {
    return `${this.name}
${this.value}`;
  }
  toJSON() {
    return {
      sessionId: this.getSession()?.getId(),
      variable: this.toDebugProtocolObject()
    };
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      memoryReference: this.memoryReference,
      value: this.value,
      type: this.type,
      evaluateName: this.name
    };
  }
  async setExpression(value, stackFrame) {
    if (!this.session) {
      return;
    }
    const response = await this.session.setExpression(stackFrame.frameId, this.name, value);
    handleSetResponse(this, response);
  }
};
_Expression.DEFAULT_VALUE = nls.localize("notAvailable", "not available");
let Expression = _Expression;
class Variable extends ExpressionContainer {
  constructor(session, threadId, parent, reference, name, evaluateName, value, namedVariables, indexedVariables, memoryReference, presentationHint, type = void 0, variableMenuContext = void 0, available = true, startOfVariables = 0, idDuplicationIndex = "", declarationLocationReference = void 0, valueLocationReference = void 0) {
    super(session, threadId, reference, `variable:${parent.getId()}:${name}:${idDuplicationIndex}`, namedVariables, indexedVariables, memoryReference, startOfVariables, presentationHint, valueLocationReference);
    this.parent = parent;
    this.name = name;
    this.evaluateName = evaluateName;
    this.variableMenuContext = variableMenuContext;
    this.available = available;
    this.declarationLocationReference = declarationLocationReference;
    this.value = value || "";
    this.type = type;
  }
  getThreadId() {
    return this.threadId;
  }
  async setVariable(value, stackFrame) {
    if (!this.session) {
      return;
    }
    try {
      if (this.session.capabilities.supportsSetExpression && !this.session.capabilities.supportsSetVariable && this.evaluateName) {
        return this.setExpression(value, stackFrame);
      }
      const response = await this.session.setVariable(this.parent.reference, this.name, value);
      handleSetResponse(this, response);
    } catch (err) {
      this.errorMessage = err.message;
    }
  }
  async setExpression(value, stackFrame) {
    if (!this.session || !this.evaluateName) {
      return;
    }
    const response = await this.session.setExpression(stackFrame.frameId, this.evaluateName, value);
    handleSetResponse(this, response);
  }
  toString() {
    return this.name ? `${this.name}: ${this.value}` : this.value;
  }
  toJSON() {
    return {
      sessionId: this.getSession()?.getId(),
      container: this.parent instanceof Expression ? { expression: this.parent.name } : this.parent.toDebugProtocolObject(),
      variable: this.toDebugProtocolObject()
    };
  }
  adoptLazyResponse(response) {
    this.evaluateName = response.evaluateName;
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      memoryReference: this.memoryReference,
      value: this.value,
      type: this.type,
      evaluateName: this.evaluateName
    };
  }
}
class Scope extends ExpressionContainer {
  constructor(stackFrame, id, name, reference, expensive, namedVariables, indexedVariables, range) {
    super(stackFrame.thread.session, stackFrame.thread.threadId, reference, `scope:${name}:${id}`, namedVariables, indexedVariables);
    this.stackFrame = stackFrame;
    this.name = name;
    this.expensive = expensive;
    this.range = range;
  }
  get childrenHaveBeenLoaded() {
    return !!this.children;
  }
  toString() {
    return this.name;
  }
  toDebugProtocolObject() {
    return {
      name: this.name,
      variablesReference: this.reference || 0,
      expensive: this.expensive
    };
  }
}
class ErrorScope extends Scope {
  constructor(stackFrame, index, message) {
    super(stackFrame, index, message, 0, false);
  }
  toString() {
    return this.name;
  }
}
class StackFrame {
  constructor(thread, frameId, source, name, presentationHint, range, index, canRestart, instructionPointerReference) {
    this.thread = thread;
    this.frameId = frameId;
    this.source = source;
    this.name = name;
    this.presentationHint = presentationHint;
    this.range = range;
    this.index = index;
    this.canRestart = canRestart;
    this.instructionPointerReference = instructionPointerReference;
  }
  getId() {
    return `stackframe:${this.thread.getId()}:${this.index}:${this.source.name}`;
  }
  getScopes() {
    if (!this.scopes) {
      this.scopes = this.thread.session.scopes(this.frameId, this.thread.threadId).then((response) => {
        if (!response || !response.body || !response.body.scopes) {
          return [];
        }
        const usedIds = /* @__PURE__ */ new Set();
        return response.body.scopes.map((rs) => {
          let id = 0;
          do {
            id = stringHash(`${rs.name}:${rs.line}:${rs.column}`, id);
          } while (usedIds.has(id));
          usedIds.add(id);
          return new Scope(
            this,
            id,
            rs.name,
            rs.variablesReference,
            rs.expensive,
            rs.namedVariables,
            rs.indexedVariables,
            rs.line && rs.column && rs.endLine && rs.endColumn ? new Range(rs.line, rs.column, rs.endLine, rs.endColumn) : void 0
          );
        });
      }, (err) => [new ErrorScope(this, 0, err.message)]);
    }
    return this.scopes;
  }
  async getMostSpecificScopes(range) {
    const scopes = await this.getScopes();
    const nonExpensiveScopes = scopes.filter((s) => !s.expensive);
    const haveRangeInfo = nonExpensiveScopes.some((s) => !!s.range);
    if (!haveRangeInfo) {
      return nonExpensiveScopes;
    }
    const scopesContainingRange = nonExpensiveScopes.filter((scope) => scope.range && Range.containsRange(scope.range, range)).sort((first, second) => first.range.endLineNumber - first.range.startLineNumber - (second.range.endLineNumber - second.range.startLineNumber));
    return scopesContainingRange.length ? scopesContainingRange : nonExpensiveScopes;
  }
  restart() {
    return this.thread.session.restartFrame(this.frameId, this.thread.threadId);
  }
  forgetScopes() {
    this.scopes = void 0;
  }
  toString() {
    const lineNumberToString = typeof this.range.startLineNumber === "number" ? `:${this.range.startLineNumber}` : "";
    const sourceToString = `${this.source.inMemory ? this.source.name : this.source.uri.fsPath}${lineNumberToString}`;
    return sourceToString === UNKNOWN_SOURCE_LABEL ? this.name : `${this.name} (${sourceToString})`;
  }
  async openInEditor(editorService, preserveFocus, sideBySide, pinned) {
    const threadStopReason = this.thread.stoppedDetails?.reason;
    if (this.instructionPointerReference && (threadStopReason === "instruction breakpoint" && !preserveFocus || threadStopReason === "step" && this.thread.lastSteppingGranularity === "instruction" && !preserveFocus || editorService.activeEditor instanceof DisassemblyViewInput)) {
      return editorService.openEditor(DisassemblyViewInput.instance, { pinned: true, revealIfOpened: true, preserveFocus });
    }
    if (this.source.available) {
      return this.source.openInEditor(editorService, this.range, preserveFocus, sideBySide, pinned);
    }
    return void 0;
  }
  equals(other) {
    return this.name === other.name && other.thread === this.thread && this.frameId === other.frameId && other.source === this.source && Range.equalsRange(this.range, other.range);
  }
}
const KEEP_SUBTLE_FRAME_AT_TOP_REASONS = ["breakpoint", "step", "function breakpoint"];
class Thread {
  constructor(session, name, threadId) {
    this.session = session;
    this.name = name;
    this.threadId = threadId;
    this.callStackCancellationTokens = [];
    this.reachedEndOfCallStack = false;
    this.callStack = [];
    this.staleCallStack = [];
    this.stopped = false;
  }
  getId() {
    return `thread:${this.session.getId()}:${this.threadId}`;
  }
  clearCallStack() {
    if (this.callStack.length) {
      this.staleCallStack = this.callStack;
    }
    this.callStack = [];
    this.callStackCancellationTokens.forEach((c) => c.dispose(true));
    this.callStackCancellationTokens = [];
  }
  getCallStack() {
    return this.callStack;
  }
  getStaleCallStack() {
    return this.staleCallStack;
  }
  getTopStackFrame() {
    const callStack = this.getCallStack();
    const stopReason = this.stoppedDetails?.reason;
    const firstAvailableStackFrame = callStack.find((sf) => !!((stopReason === "instruction breakpoint" || stopReason === "step" && this.lastSteppingGranularity === "instruction") && sf.instructionPointerReference || sf.source && sf.source.available && (KEEP_SUBTLE_FRAME_AT_TOP_REASONS.includes(stopReason) || !isFrameDeemphasized(sf))));
    return firstAvailableStackFrame;
  }
  get stateLabel() {
    if (this.stoppedDetails) {
      return this.stoppedDetails.description || (this.stoppedDetails.reason ? nls.localize({ key: "pausedOn", comment: ["indicates reason for program being paused"] }, "Paused on {0}", this.stoppedDetails.reason) : nls.localize("paused", "Paused"));
    }
    return nls.localize({ key: "running", comment: ["indicates state"] }, "Running");
  }
  /**
   * Queries the debug adapter for the callstack and returns a promise
   * which completes once the call stack has been retrieved.
   * If the thread is not stopped, it returns a promise to an empty array.
   * Only fetches the first stack frame for performance reasons. Calling this method consecutive times
   * gets the remainder of the call stack.
   */
  async fetchCallStack(levels = 20) {
    if (this.stopped) {
      const start = this.callStack.length;
      const callStack = await this.getCallStackImpl(start, levels);
      this.reachedEndOfCallStack = callStack.length < levels;
      if (start < this.callStack.length) {
        this.callStack.splice(start, this.callStack.length - start);
      }
      this.callStack = this.callStack.concat(callStack || []);
      if (typeof this.stoppedDetails?.totalFrames === "number" && this.stoppedDetails.totalFrames === this.callStack.length) {
        this.reachedEndOfCallStack = true;
      }
    }
  }
  async getCallStackImpl(startFrame, levels) {
    try {
      const tokenSource = new CancellationTokenSource();
      this.callStackCancellationTokens.push(tokenSource);
      const response = await this.session.stackTrace(this.threadId, startFrame, levels, tokenSource.token);
      if (!response || !response.body || tokenSource.token.isCancellationRequested) {
        return [];
      }
      if (this.stoppedDetails) {
        this.stoppedDetails.totalFrames = response.body.totalFrames;
      }
      return response.body.stackFrames.map((rsf, index) => {
        const source = this.session.getSource(rsf.source);
        return new StackFrame(this, rsf.id, source, rsf.name, rsf.presentationHint, new Range(
          rsf.line,
          rsf.column,
          rsf.endLine || rsf.line,
          rsf.endColumn || rsf.column
        ), startFrame + index, typeof rsf.canRestart === "boolean" ? rsf.canRestart : true, rsf.instructionPointerReference);
      });
    } catch (err) {
      if (this.stoppedDetails) {
        this.stoppedDetails.framesErrorMessage = err.message;
      }
      return [];
    }
  }
  /**
   * Returns exception info promise if the exception was thrown, otherwise undefined
   */
  get exceptionInfo() {
    if (this.stoppedDetails && this.stoppedDetails.reason === "exception") {
      if (this.session.capabilities.supportsExceptionInfoRequest) {
        return this.session.exceptionInfo(this.threadId);
      }
      return Promise.resolve({
        description: this.stoppedDetails.text,
        breakMode: null
      });
    }
    return Promise.resolve(void 0);
  }
  next(granularity) {
    return this.session.next(this.threadId, granularity);
  }
  stepIn(granularity) {
    return this.session.stepIn(this.threadId, void 0, granularity);
  }
  stepOut(granularity) {
    return this.session.stepOut(this.threadId, granularity);
  }
  stepBack(granularity) {
    return this.session.stepBack(this.threadId, granularity);
  }
  continue() {
    return this.session.continue(this.threadId);
  }
  pause() {
    return this.session.pause(this.threadId);
  }
  terminate() {
    return this.session.terminateThreads([this.threadId]);
  }
  reverseContinue() {
    return this.session.reverseContinue(this.threadId);
  }
}
const getUriForDebugMemory = (sessionId, memoryReference, range, displayName = "memory") => {
  return URI.from({
    scheme: DEBUG_MEMORY_SCHEME,
    authority: sessionId,
    path: "/" + encodeURIComponent(memoryReference) + `/${encodeURIComponent(displayName)}.bin`,
    query: range ? `?range=${range.fromOffset}:${range.toOffset}` : void 0
  });
};
class MemoryRegion extends Disposable {
  constructor(memoryReference, session) {
    super();
    this.memoryReference = memoryReference;
    this.session = session;
    this.invalidateEmitter = this._register(new Emitter());
    /** @inheritdoc */
    this.onDidInvalidate = this.invalidateEmitter.event;
    this.writable = !!this.session.capabilities.supportsWriteMemoryRequest;
    this._register(session.onDidInvalidateMemory((e) => {
      if (e.body.memoryReference === memoryReference) {
        this.invalidate(e.body.offset, e.body.count - e.body.offset);
      }
    }));
  }
  async read(fromOffset, toOffset) {
    const length = toOffset - fromOffset;
    const offset = fromOffset;
    const result = await this.session.readMemory(this.memoryReference, offset, length);
    if (result === void 0 || !result.body?.data) {
      return [{ type: MemoryRangeType.Unreadable, offset, length }];
    }
    let data;
    try {
      data = decodeBase64(result.body.data);
    } catch {
      return [{ type: MemoryRangeType.Error, offset, length, error: "Invalid base64 data from debug adapter" }];
    }
    const unreadable = result.body.unreadableBytes || 0;
    const dataLength = length - unreadable;
    if (data.byteLength < dataLength) {
      const pad = VSBuffer.alloc(dataLength - data.byteLength);
      pad.buffer.fill(0);
      data = VSBuffer.concat([data, pad], dataLength);
    } else if (data.byteLength > dataLength) {
      data = data.slice(0, dataLength);
    }
    if (!unreadable) {
      return [{ type: MemoryRangeType.Valid, offset, length, data }];
    }
    return [
      { type: MemoryRangeType.Valid, offset, length: dataLength, data },
      { type: MemoryRangeType.Unreadable, offset: offset + dataLength, length: unreadable }
    ];
  }
  async write(offset, data) {
    const result = await this.session.writeMemory(this.memoryReference, offset, encodeBase64(data), true);
    const written = result?.body?.bytesWritten ?? data.byteLength;
    this.invalidate(offset, offset + written);
    return written;
  }
  dispose() {
    super.dispose();
  }
  invalidate(fromOffset, toOffset) {
    this.invalidateEmitter.fire({ fromOffset, toOffset });
  }
}
class Enablement {
  constructor(enabled, id) {
    this.enabled = enabled;
    this.id = id;
  }
  getId() {
    return this.id;
  }
}
function toBreakpointSessionData(data, capabilities) {
  return mixin({
    supportsConditionalBreakpoints: !!capabilities.supportsConditionalBreakpoints,
    supportsHitConditionalBreakpoints: !!capabilities.supportsHitConditionalBreakpoints,
    supportsLogPoints: !!capabilities.supportsLogPoints,
    supportsFunctionBreakpoints: !!capabilities.supportsFunctionBreakpoints,
    supportsDataBreakpoints: !!capabilities.supportsDataBreakpoints,
    supportsInstructionBreakpoints: !!capabilities.supportsInstructionBreakpoints
  }, data);
}
class BaseBreakpoint extends Enablement {
  constructor(id, opts) {
    super(opts.enabled ?? true, id);
    this.sessionData = /* @__PURE__ */ new Map();
    this.condition = opts.condition;
    this.hitCondition = opts.hitCondition;
    this.logMessage = opts.logMessage;
    this.mode = opts.mode;
    this.modeLabel = opts.modeLabel;
  }
  setSessionData(sessionId, data) {
    if (!data) {
      this.sessionData.delete(sessionId);
    } else {
      data.sessionId = sessionId;
      this.sessionData.set(sessionId, data);
    }
    const allData = Array.from(this.sessionData.values());
    const verifiedData = distinct(allData.filter((d) => d.verified), (d) => `${d.line}:${d.column}`);
    if (verifiedData.length) {
      this.data = verifiedData.length === 1 ? verifiedData[0] : void 0;
    } else {
      this.data = allData.length ? allData[0] : void 0;
    }
  }
  get message() {
    if (!this.data) {
      return void 0;
    }
    return this.data.message;
  }
  get verified() {
    return this.data ? this.data.verified : true;
  }
  get sessionsThatVerified() {
    const sessionIds = [];
    for (const [sessionId, data] of this.sessionData) {
      if (data.verified) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }
  getIdFromAdapter(sessionId) {
    const data = this.sessionData.get(sessionId);
    return data ? data.id : void 0;
  }
  getDebugProtocolBreakpoint(sessionId) {
    const data = this.sessionData.get(sessionId);
    if (data) {
      const bp = {
        id: data.id,
        verified: data.verified,
        message: data.message,
        source: data.source,
        line: data.line,
        column: data.column,
        endLine: data.endLine,
        endColumn: data.endColumn,
        instructionReference: data.instructionReference,
        offset: data.offset
      };
      return bp;
    }
    return void 0;
  }
  toJSON() {
    return {
      id: this.getId(),
      enabled: this.enabled,
      condition: this.condition,
      hitCondition: this.hitCondition,
      logMessage: this.logMessage,
      mode: this.mode,
      modeLabel: this.modeLabel
    };
  }
}
class Breakpoint extends BaseBreakpoint {
  constructor(opts, textFileService, uriIdentityService, logService, id = generateUuid()) {
    super(id, opts);
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._uri = opts.uri;
    this._lineNumber = opts.lineNumber;
    this._column = opts.column;
    this._adapterData = opts.adapterData;
    this.triggeredBy = opts.triggeredBy;
  }
  toDAP() {
    return {
      line: this.sessionAgnosticData.lineNumber,
      column: this.sessionAgnosticData.column,
      condition: this.condition,
      hitCondition: this.hitCondition,
      logMessage: this.logMessage,
      mode: this.mode
    };
  }
  get originalUri() {
    return this._uri;
  }
  get lineNumber() {
    return this.verified && this.data && typeof this.data.line === "number" ? this.data.line : this._lineNumber;
  }
  get verified() {
    if (this.data) {
      return this.data.verified && !this.textFileService.isDirty(this._uri);
    }
    return true;
  }
  get pending() {
    if (this.data) {
      return false;
    }
    return this.triggeredBy !== void 0;
  }
  get uri() {
    return this.verified && this.data && this.data.source ? getUriFromSource(this.data.source, this.data.source.path, this.data.sessionId, this.uriIdentityService, this.logService) : this._uri;
  }
  get column() {
    return this.verified && this.data && typeof this.data.column === "number" ? this.data.column : this._column;
  }
  get message() {
    if (this.textFileService.isDirty(this.uri)) {
      return nls.localize("breakpointDirtydHover", "Unverified breakpoint. File is modified, please restart debug session.");
    }
    return super.message;
  }
  get adapterData() {
    return this.data && this.data.source && this.data.source.adapterData ? this.data.source.adapterData : this._adapterData;
  }
  get endLineNumber() {
    return this.verified && this.data ? this.data.endLine : void 0;
  }
  get endColumn() {
    return this.verified && this.data ? this.data.endColumn : void 0;
  }
  get sessionAgnosticData() {
    return {
      lineNumber: this._lineNumber,
      column: this._column
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    if (this.logMessage && !this.data.supportsLogPoints) {
      return false;
    }
    if (this.condition && !this.data.supportsConditionalBreakpoints) {
      return false;
    }
    if (this.hitCondition && !this.data.supportsHitConditionalBreakpoints) {
      return false;
    }
    return true;
  }
  setSessionData(sessionId, data) {
    super.setSessionData(sessionId, data);
    if (!this._adapterData) {
      this._adapterData = this.adapterData;
    }
  }
  toJSON() {
    return {
      ...super.toJSON(),
      uri: this._uri,
      lineNumber: this._lineNumber,
      column: this._column,
      adapterData: this.adapterData,
      triggeredBy: this.triggeredBy
    };
  }
  toString() {
    return `${resources.basenameOrAuthority(this.uri)} ${this.lineNumber}`;
  }
  setSessionDidTrigger(sessionId, didTrigger = true) {
    if (didTrigger) {
      this.sessionsDidTrigger ??= /* @__PURE__ */ new Set();
      this.sessionsDidTrigger.add(sessionId);
    } else {
      this.sessionsDidTrigger?.delete(sessionId);
    }
  }
  getSessionDidTrigger(sessionId) {
    return !!this.sessionsDidTrigger?.has(sessionId);
  }
  update(data) {
    if (data.hasOwnProperty("lineNumber") && !isUndefinedOrNull(data.lineNumber)) {
      this._lineNumber = data.lineNumber;
    }
    if (data.hasOwnProperty("column")) {
      this._column = data.column;
    }
    if (data.hasOwnProperty("condition")) {
      this.condition = data.condition;
    }
    if (data.hasOwnProperty("hitCondition")) {
      this.hitCondition = data.hitCondition;
    }
    if (data.hasOwnProperty("logMessage")) {
      this.logMessage = data.logMessage;
    }
    if (data.hasOwnProperty("mode")) {
      this.mode = data.mode;
      this.modeLabel = data.modeLabel;
    }
    if (data.hasOwnProperty("triggeredBy")) {
      this.triggeredBy = data.triggeredBy;
      this.sessionsDidTrigger = void 0;
    }
  }
}
class FunctionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.name = opts.name;
  }
  toDAP() {
    return {
      name: this.name,
      condition: this.condition,
      hitCondition: this.hitCondition
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsFunctionBreakpoints;
  }
  toString() {
    return this.name;
  }
}
class DataBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.sessionDataIdForAddr = /* @__PURE__ */ new WeakMap();
    this.description = opts.description;
    if ("dataId" in opts) {
      opts.src = { type: DataBreakpointSetType.Variable, dataId: opts.dataId };
    }
    this.src = opts.src;
    this.canPersist = opts.canPersist;
    this.accessTypes = opts.accessTypes;
    this.accessType = opts.accessType;
    if (opts.initialSessionData) {
      this.sessionDataIdForAddr.set(opts.initialSessionData.session, opts.initialSessionData.dataId);
    }
  }
  async toDAP(session) {
    let dataId;
    if (this.src.type === DataBreakpointSetType.Variable) {
      dataId = this.src.dataId;
    } else {
      let sessionDataId = this.sessionDataIdForAddr.get(session);
      if (!sessionDataId) {
        sessionDataId = (await session.dataBytesBreakpointInfo(this.src.address, this.src.bytes))?.dataId;
        if (!sessionDataId) {
          return void 0;
        }
        this.sessionDataIdForAddr.set(session, sessionDataId);
      }
      dataId = sessionDataId;
    }
    return {
      dataId,
      accessType: this.accessType,
      condition: this.condition,
      hitCondition: this.hitCondition
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      description: this.description,
      src: this.src,
      accessTypes: this.accessTypes,
      accessType: this.accessType,
      canPersist: this.canPersist
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsDataBreakpoints;
  }
  toString() {
    return this.description;
  }
}
class ExceptionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.supportedSessions = /* @__PURE__ */ new Set();
    this.fallback = false;
    this.filter = opts.filter;
    this.label = opts.label;
    this.supportsCondition = opts.supportsCondition;
    this.description = opts.description;
    this.conditionDescription = opts.conditionDescription;
    this.fallback = opts.fallback || false;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      filter: this.filter,
      label: this.label,
      enabled: this.enabled,
      supportsCondition: this.supportsCondition,
      conditionDescription: this.conditionDescription,
      condition: this.condition,
      fallback: this.fallback,
      description: this.description
    };
  }
  setSupportedSession(sessionId, supported) {
    if (supported) {
      this.supportedSessions.add(sessionId);
    } else {
      this.supportedSessions.delete(sessionId);
    }
  }
  /**
   * Used to specify which breakpoints to show when no session is specified.
   * Useful when no session is active and we want to show the exception breakpoints from the last session.
   */
  setFallback(isFallback) {
    this.fallback = isFallback;
  }
  get supported() {
    return true;
  }
  /**
   * Checks if the breakpoint is applicable for the specified session.
   * If sessionId is undefined, returns true if this breakpoint is a fallback breakpoint.
   */
  isSupportedSession(sessionId) {
    return sessionId ? this.supportedSessions.has(sessionId) : this.fallback;
  }
  matches(filter) {
    return this.filter === filter.filter && this.label === filter.label && this.supportsCondition === !!filter.supportsCondition && this.conditionDescription === filter.conditionDescription && this.description === filter.description;
  }
  toString() {
    return this.label;
  }
}
class InstructionBreakpoint extends BaseBreakpoint {
  constructor(opts, id = generateUuid()) {
    super(id, opts);
    this.instructionReference = opts.instructionReference;
    this.offset = opts.offset;
    this.canPersist = opts.canPersist;
    this.address = opts.address;
  }
  toDAP() {
    return {
      instructionReference: this.instructionReference,
      condition: this.condition,
      hitCondition: this.hitCondition,
      mode: this.mode,
      offset: this.offset
    };
  }
  toJSON() {
    return {
      ...super.toJSON(),
      instructionReference: this.instructionReference,
      offset: this.offset,
      canPersist: this.canPersist,
      address: this.address
    };
  }
  get supported() {
    if (!this.data) {
      return true;
    }
    return this.data.supportsInstructionBreakpoints;
  }
  toString() {
    return this.instructionReference;
  }
}
class ThreadAndSessionIds {
  constructor(sessionId, threadId) {
    this.sessionId = sessionId;
    this.threadId = threadId;
  }
  getId() {
    return `${this.sessionId}:${this.threadId}`;
  }
}
let DebugModel = class extends Disposable {
  constructor(debugStorage, textFileService, uriIdentityService, logService) {
    super();
    this.textFileService = textFileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.schedulers = /* @__PURE__ */ new Map();
    this.breakpointsActivated = true;
    this._onDidChangeBreakpoints = this._register(new Emitter());
    this._onDidChangeCallStack = this._register(new Emitter());
    this._onDidChangeCallStackFire = this._register(new RunOnceScheduler(() => {
      this._onDidChangeCallStack.fire(void 0);
    }, 100));
    this._onDidChangeWatchExpressions = this._register(new Emitter());
    this._onDidChangeWatchExpressionValue = this._register(new Emitter());
    this._breakpointModes = /* @__PURE__ */ new Map();
    this._register(autorun((reader) => {
      this.breakpoints = debugStorage.breakpoints.read(reader);
      this.functionBreakpoints = debugStorage.functionBreakpoints.read(reader);
      this.exceptionBreakpoints = debugStorage.exceptionBreakpoints.read(reader);
      this.dataBreakpoints = debugStorage.dataBreakpoints.read(reader);
      this._onDidChangeBreakpoints.fire(void 0);
    }));
    this._register(autorun((reader) => {
      this.watchExpressions = debugStorage.watchExpressions.read(reader);
      this._onDidChangeWatchExpressions.fire(void 0);
    }));
    this._register(
      trackSetChanges(
        () => new Set(this.watchExpressions),
        this.onDidChangeWatchExpressions,
        (we) => we.onDidChangeValue((e) => this._onDidChangeWatchExpressionValue.fire(e))
      )
    );
    this.instructionBreakpoints = [];
    this.sessions = [];
  }
  getId() {
    return "root";
  }
  getSession(sessionId, includeInactive = false) {
    if (sessionId) {
      return this.getSessions(includeInactive).find((s) => s.getId() === sessionId);
    }
    return void 0;
  }
  getSessions(includeInactive = false) {
    return this.sessions.filter((s) => includeInactive || s.state !== State.Inactive);
  }
  shouldDisposeSession(session, newSession) {
    if (session.state !== State.Inactive) {
      return false;
    }
    if (session.configuration.name === newSession.configuration.name) {
      return true;
    }
    if (newSession.parentSession) {
      return false;
    }
    let rootSession = session;
    while (rootSession.parentSession) {
      rootSession = rootSession.parentSession;
    }
    return rootSession.state === State.Inactive && rootSession.configuration.name === newSession.configuration.name;
  }
  addSession(session) {
    this.sessions = this.sessions.filter((s) => {
      if (s.getId() === session.getId()) {
        return false;
      }
      if (this.shouldDisposeSession(s, session)) {
        s.dispose();
        return false;
      }
      return true;
    });
    let i = 1;
    while (this.sessions.some((s) => s.getLabel() === session.getLabel())) {
      session.setName(`${session.configuration.name} ${++i}`);
    }
    let index = -1;
    if (session.parentSession) {
      index = this.sessions.findLastIndex((s) => s.parentSession === session.parentSession || s === session.parentSession);
    }
    if (index >= 0) {
      this.sessions.splice(index + 1, 0, session);
    } else {
      this.sessions.push(session);
    }
    this._onDidChangeCallStack.fire(void 0);
  }
  get onDidChangeBreakpoints() {
    return this._onDidChangeBreakpoints.event;
  }
  get onDidChangeCallStack() {
    return this._onDidChangeCallStack.event;
  }
  get onDidChangeWatchExpressions() {
    return this._onDidChangeWatchExpressions.event;
  }
  get onDidChangeWatchExpressionValue() {
    return this._onDidChangeWatchExpressionValue.event;
  }
  rawUpdate(data) {
    const session = this.sessions.find((p) => p.getId() === data.sessionId);
    if (session) {
      session.rawUpdate(data);
      this._onDidChangeCallStack.fire(void 0);
    }
  }
  clearThreads(id, removeThreads, reference = void 0) {
    const session = this.sessions.find((p) => p.getId() === id);
    if (session) {
      let threads;
      if (reference === void 0) {
        threads = session.getAllThreads();
      } else {
        const thread = session.getThread(reference);
        threads = thread !== void 0 ? [thread] : [];
      }
      for (const thread of threads) {
        const threadId = thread.getId();
        const entry = this.schedulers.get(threadId);
        if (entry !== void 0) {
          entry.scheduler.dispose();
          entry.completeDeferred.complete();
          this.schedulers.delete(threadId);
        }
      }
      session.clearThreads(removeThreads, reference);
      if (!this._onDidChangeCallStackFire.isScheduled()) {
        this._onDidChangeCallStackFire.schedule();
      }
    }
  }
  /**
   * Update the call stack and notify the call stack view that changes have occurred.
   */
  async fetchCallstack(thread, levels) {
    if (thread.reachedEndOfCallStack) {
      return;
    }
    const totalFrames = thread.stoppedDetails?.totalFrames;
    const remainingFrames = typeof totalFrames === "number" ? totalFrames - thread.getCallStack().length : void 0;
    if (!levels || remainingFrames && levels > remainingFrames) {
      levels = remainingFrames;
    }
    if (levels && levels > 0) {
      await thread.fetchCallStack(levels);
      this._onDidChangeCallStack.fire();
    }
    return;
  }
  refreshTopOfCallstack(thread, fetchFullStack = true) {
    if (thread.session.capabilities.supportsDelayedStackTraceLoading) {
      let topCallStack = Promise.resolve();
      const wholeCallStack2 = new Promise((c, e) => {
        topCallStack = thread.fetchCallStack(1).then(() => {
          if (!fetchFullStack) {
            c();
            this._onDidChangeCallStack.fire();
            return;
          }
          if (!this.schedulers.has(thread.getId())) {
            const deferred = new DeferredPromise();
            this.schedulers.set(thread.getId(), {
              completeDeferred: deferred,
              scheduler: new RunOnceScheduler(() => {
                thread.fetchCallStack(19).then(() => {
                  const stale = thread.getStaleCallStack();
                  const current = thread.getCallStack();
                  let bottomOfCallStackChanged = stale.length !== current.length;
                  for (let i = 1; i < stale.length && !bottomOfCallStackChanged; i++) {
                    bottomOfCallStackChanged = !stale[i].equals(current[i]);
                  }
                  if (bottomOfCallStackChanged) {
                    this._onDidChangeCallStack.fire();
                  }
                }).finally(() => {
                  deferred.complete();
                  this.schedulers.delete(thread.getId());
                });
              }, 420)
            });
          }
          const entry = this.schedulers.get(thread.getId());
          entry.scheduler.schedule();
          entry.completeDeferred.p.then(c, e);
          this._onDidChangeCallStack.fire();
        });
      });
      return { topCallStack, wholeCallStack: wholeCallStack2 };
    }
    const wholeCallStack = thread.fetchCallStack();
    return { wholeCallStack, topCallStack: wholeCallStack };
  }
  getBreakpoints(filter) {
    if (filter) {
      const uriStr = filter.uri?.toString();
      const originalUriStr = filter.originalUri?.toString();
      return this.breakpoints.filter((bp) => {
        if (uriStr && bp.uri.toString() !== uriStr) {
          return false;
        }
        if (originalUriStr && bp.originalUri.toString() !== originalUriStr) {
          return false;
        }
        if (filter.lineNumber && bp.lineNumber !== filter.lineNumber) {
          return false;
        }
        if (filter.column && bp.column !== filter.column) {
          return false;
        }
        if (filter.enabledOnly && (!this.breakpointsActivated || !bp.enabled)) {
          return false;
        }
        if (filter.triggeredOnly && bp.triggeredBy === void 0) {
          return false;
        }
        return true;
      });
    }
    return this.breakpoints;
  }
  getFunctionBreakpoints() {
    return this.functionBreakpoints;
  }
  getDataBreakpoints() {
    return this.dataBreakpoints;
  }
  getExceptionBreakpoints() {
    return this.exceptionBreakpoints;
  }
  getExceptionBreakpointsForSession(sessionId) {
    return this.exceptionBreakpoints.filter((ebp) => ebp.isSupportedSession(sessionId));
  }
  getInstructionBreakpoints() {
    return this.instructionBreakpoints;
  }
  setExceptionBreakpointsForSession(sessionId, filters) {
    if (!filters) {
      return;
    }
    let didChangeBreakpoints = false;
    filters.forEach((d) => {
      let ebp = this.exceptionBreakpoints.filter((exbp) => exbp.matches(d)).pop();
      if (!ebp) {
        didChangeBreakpoints = true;
        ebp = new ExceptionBreakpoint({
          filter: d.filter,
          label: d.label,
          enabled: !!d.default,
          supportsCondition: !!d.supportsCondition,
          description: d.description,
          conditionDescription: d.conditionDescription
        });
        this.exceptionBreakpoints.push(ebp);
      }
      ebp.setSupportedSession(sessionId, true);
    });
    if (didChangeBreakpoints) {
      this._onDidChangeBreakpoints.fire(void 0);
    }
  }
  removeExceptionBreakpointsForSession(sessionId) {
    this.exceptionBreakpoints.forEach((ebp) => ebp.setSupportedSession(sessionId, false));
  }
  // Set last focused session as fallback session.
  // This is done to keep track of the exception breakpoints to show when no session is active.
  setExceptionBreakpointFallbackSession(sessionId) {
    this.exceptionBreakpoints.forEach((ebp) => ebp.setFallback(ebp.isSupportedSession(sessionId)));
  }
  setExceptionBreakpointCondition(exceptionBreakpoint, condition) {
    exceptionBreakpoint.condition = condition;
    this._onDidChangeBreakpoints.fire(void 0);
  }
  areBreakpointsActivated() {
    return this.breakpointsActivated;
  }
  setBreakpointsActivated(activated) {
    this.breakpointsActivated = activated;
    this._onDidChangeBreakpoints.fire(void 0);
  }
  addBreakpoints(uri2, rawData, fireEvent = true) {
    const newBreakpoints = rawData.map((rawBp) => {
      return new Breakpoint({
        uri: uri2,
        lineNumber: rawBp.lineNumber,
        column: rawBp.column,
        enabled: rawBp.enabled ?? true,
        condition: rawBp.condition,
        hitCondition: rawBp.hitCondition,
        logMessage: rawBp.logMessage,
        triggeredBy: rawBp.triggeredBy,
        adapterData: void 0,
        mode: rawBp.mode,
        modeLabel: rawBp.modeLabel
      }, this.textFileService, this.uriIdentityService, this.logService, rawBp.id);
    });
    this.breakpoints = this.breakpoints.concat(newBreakpoints);
    this.breakpointsActivated = true;
    this.sortAndDeDup();
    if (fireEvent) {
      this._onDidChangeBreakpoints.fire({ added: newBreakpoints, sessionOnly: false });
    }
    return newBreakpoints;
  }
  removeBreakpoints(toRemove) {
    this.breakpoints = this.breakpoints.filter((bp) => !toRemove.some((toRemove2) => toRemove2.getId() === bp.getId()));
    this._onDidChangeBreakpoints.fire({ removed: toRemove, sessionOnly: false });
  }
  updateBreakpoints(data) {
    const updated = [];
    this.breakpoints.forEach((bp) => {
      const bpData = data.get(bp.getId());
      if (bpData) {
        bp.update(bpData);
        updated.push(bp);
      }
    });
    this.sortAndDeDup();
    this._onDidChangeBreakpoints.fire({ changed: updated, sessionOnly: false });
  }
  setBreakpointSessionData(sessionId, capabilites, data) {
    this.breakpoints.forEach((bp) => {
      if (!data) {
        bp.setSessionData(sessionId, void 0);
      } else {
        const bpData = data.get(bp.getId());
        if (bpData) {
          bp.setSessionData(sessionId, toBreakpointSessionData(bpData, capabilites));
        }
      }
    });
    this.functionBreakpoints.forEach((fbp) => {
      if (!data) {
        fbp.setSessionData(sessionId, void 0);
      } else {
        const fbpData = data.get(fbp.getId());
        if (fbpData) {
          fbp.setSessionData(sessionId, toBreakpointSessionData(fbpData, capabilites));
        }
      }
    });
    this.dataBreakpoints.forEach((dbp) => {
      if (!data) {
        dbp.setSessionData(sessionId, void 0);
      } else {
        const dbpData = data.get(dbp.getId());
        if (dbpData) {
          dbp.setSessionData(sessionId, toBreakpointSessionData(dbpData, capabilites));
        }
      }
    });
    this.exceptionBreakpoints.forEach((ebp) => {
      if (!data) {
        ebp.setSessionData(sessionId, void 0);
      } else {
        const ebpData = data.get(ebp.getId());
        if (ebpData) {
          ebp.setSessionData(sessionId, toBreakpointSessionData(ebpData, capabilites));
        }
      }
    });
    this.instructionBreakpoints.forEach((ibp) => {
      if (!data) {
        ibp.setSessionData(sessionId, void 0);
      } else {
        const ibpData = data.get(ibp.getId());
        if (ibpData) {
          ibp.setSessionData(sessionId, toBreakpointSessionData(ibpData, capabilites));
        }
      }
    });
    this._onDidChangeBreakpoints.fire({
      sessionOnly: true
    });
  }
  getDebugProtocolBreakpoint(breakpointId, sessionId) {
    const bp = this.breakpoints.find((bp2) => bp2.getId() === breakpointId);
    if (bp) {
      return bp.getDebugProtocolBreakpoint(sessionId);
    }
    return void 0;
  }
  getBreakpointModes(forBreakpointType) {
    return [...this._breakpointModes.values()].filter((mode) => mode.appliesTo.includes(forBreakpointType));
  }
  registerBreakpointModes(debugType, modes) {
    for (const mode of modes) {
      const key = `${mode.mode}/${mode.label}`;
      const rec = this._breakpointModes.get(key);
      if (rec) {
        for (const target of mode.appliesTo) {
          if (!rec.appliesTo.includes(target)) {
            rec.appliesTo.push(target);
          }
        }
      } else {
        const duplicate = [...this._breakpointModes.values()].find((r) => r !== rec && r.label === mode.label);
        if (duplicate) {
          duplicate.label = `${duplicate.label} (${duplicate.firstFromDebugType})`;
        }
        this._breakpointModes.set(key, {
          mode: mode.mode,
          label: duplicate ? `${mode.label} (${debugType})` : mode.label,
          firstFromDebugType: debugType,
          description: mode.description,
          appliesTo: mode.appliesTo.slice()
          // avoid later mutations
        });
      }
    }
  }
  sortAndDeDup() {
    this.breakpoints = this.breakpoints.sort((first, second) => {
      if (first.uri.toString() !== second.uri.toString()) {
        return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
      }
      if (first.lineNumber === second.lineNumber) {
        if (first.column && second.column) {
          return first.column - second.column;
        }
        return 1;
      }
      return first.lineNumber - second.lineNumber;
    });
    this.breakpoints = distinct(this.breakpoints, (bp) => `${bp.uri.toString()}:${bp.lineNumber}:${bp.column}`);
  }
  setEnablement(element, enable) {
    if (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof ExceptionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint) {
      const changed = [];
      if (element.enabled !== enable && (element instanceof Breakpoint || element instanceof FunctionBreakpoint || element instanceof DataBreakpoint || element instanceof InstructionBreakpoint)) {
        changed.push(element);
      }
      element.enabled = enable;
      if (enable) {
        this.breakpointsActivated = true;
      }
      this._onDidChangeBreakpoints.fire({ changed, sessionOnly: false });
    }
  }
  enableOrDisableAllBreakpoints(enable) {
    const changed = [];
    this.breakpoints.forEach((bp) => {
      if (bp.enabled !== enable) {
        changed.push(bp);
      }
      bp.enabled = enable;
    });
    this.functionBreakpoints.forEach((fbp) => {
      if (fbp.enabled !== enable) {
        changed.push(fbp);
      }
      fbp.enabled = enable;
    });
    this.dataBreakpoints.forEach((dbp) => {
      if (dbp.enabled !== enable) {
        changed.push(dbp);
      }
      dbp.enabled = enable;
    });
    this.instructionBreakpoints.forEach((ibp) => {
      if (ibp.enabled !== enable) {
        changed.push(ibp);
      }
      ibp.enabled = enable;
    });
    if (enable) {
      this.breakpointsActivated = true;
    }
    this._onDidChangeBreakpoints.fire({ changed, sessionOnly: false });
  }
  addFunctionBreakpoint(opts, id) {
    const newFunctionBreakpoint = new FunctionBreakpoint(opts, id);
    this.functionBreakpoints.push(newFunctionBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newFunctionBreakpoint], sessionOnly: false });
    return newFunctionBreakpoint;
  }
  updateFunctionBreakpoint(id, update) {
    const functionBreakpoint = this.functionBreakpoints.find((fbp) => fbp.getId() === id);
    if (functionBreakpoint) {
      if (typeof update.name === "string") {
        functionBreakpoint.name = update.name;
      }
      if (typeof update.condition === "string") {
        functionBreakpoint.condition = update.condition;
      }
      if (typeof update.hitCondition === "string") {
        functionBreakpoint.hitCondition = update.hitCondition;
      }
      this._onDidChangeBreakpoints.fire({ changed: [functionBreakpoint], sessionOnly: false });
    }
  }
  removeFunctionBreakpoints(id) {
    let removed;
    if (id) {
      removed = this.functionBreakpoints.filter((fbp) => fbp.getId() === id);
      this.functionBreakpoints = this.functionBreakpoints.filter((fbp) => fbp.getId() !== id);
    } else {
      removed = this.functionBreakpoints;
      this.functionBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  addDataBreakpoint(opts, id) {
    const newDataBreakpoint = new DataBreakpoint(opts, id);
    this.dataBreakpoints.push(newDataBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newDataBreakpoint], sessionOnly: false });
  }
  updateDataBreakpoint(id, update) {
    const dataBreakpoint = this.dataBreakpoints.find((fbp) => fbp.getId() === id);
    if (dataBreakpoint) {
      if (typeof update.condition === "string") {
        dataBreakpoint.condition = update.condition;
      }
      if (typeof update.hitCondition === "string") {
        dataBreakpoint.hitCondition = update.hitCondition;
      }
      this._onDidChangeBreakpoints.fire({ changed: [dataBreakpoint], sessionOnly: false });
    }
  }
  removeDataBreakpoints(id) {
    let removed;
    if (id) {
      removed = this.dataBreakpoints.filter((fbp) => fbp.getId() === id);
      this.dataBreakpoints = this.dataBreakpoints.filter((fbp) => fbp.getId() !== id);
    } else {
      removed = this.dataBreakpoints;
      this.dataBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  addInstructionBreakpoint(opts) {
    const newInstructionBreakpoint = new InstructionBreakpoint(opts);
    this.instructionBreakpoints.push(newInstructionBreakpoint);
    this._onDidChangeBreakpoints.fire({ added: [newInstructionBreakpoint], sessionOnly: true });
  }
  removeInstructionBreakpoints(instructionReference, offset, address) {
    let removed = [];
    if (address !== void 0) {
      for (let i = 0; i < this.instructionBreakpoints.length; i++) {
        const ibp = this.instructionBreakpoints[i];
        if (ibp.address === address) {
          removed.push(ibp);
          this.instructionBreakpoints.splice(i--, 1);
        }
      }
    } else if (instructionReference) {
      for (let i = 0; i < this.instructionBreakpoints.length; i++) {
        const ibp = this.instructionBreakpoints[i];
        if (ibp.instructionReference === instructionReference && (offset === void 0 || ibp.offset === offset)) {
          removed.push(ibp);
          this.instructionBreakpoints.splice(i--, 1);
        }
      }
    } else {
      removed = this.instructionBreakpoints;
      this.instructionBreakpoints = [];
    }
    this._onDidChangeBreakpoints.fire({ removed, sessionOnly: false });
  }
  getWatchExpressions() {
    return this.watchExpressions;
  }
  addWatchExpression(name) {
    const we = new Expression(name || "");
    this.watchExpressions.push(we);
    this._onDidChangeWatchExpressions.fire(we);
    return we;
  }
  renameWatchExpression(id, newName) {
    const filtered = this.watchExpressions.filter((we) => we.getId() === id);
    if (filtered.length === 1) {
      filtered[0].name = newName;
      this._onDidChangeWatchExpressions.fire(filtered[0]);
    }
  }
  removeWatchExpressions(id = null) {
    this.watchExpressions = id ? this.watchExpressions.filter((we) => we.getId() !== id) : [];
    this._onDidChangeWatchExpressions.fire(void 0);
  }
  moveWatchExpression(id, position) {
    const we = this.watchExpressions.find((we2) => we2.getId() === id);
    if (we) {
      this.watchExpressions = this.watchExpressions.filter((we2) => we2.getId() !== id);
      this.watchExpressions = this.watchExpressions.slice(0, position).concat(we, this.watchExpressions.slice(position));
      this._onDidChangeWatchExpressions.fire(void 0);
    }
  }
  sourceIsNotAvailable(uri2) {
    this.sessions.forEach((s) => {
      const source = s.getSourceForUri(uri2);
      if (source) {
        source.available = false;
      }
    });
    this._onDidChangeCallStack.fire(void 0);
  }
};
DebugModel = __decorateClass([
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService)
], DebugModel);
export {
  BaseBreakpoint,
  Breakpoint,
  DataBreakpoint,
  DebugModel,
  Enablement,
  ErrorScope,
  ExceptionBreakpoint,
  Expression,
  ExpressionContainer,
  FunctionBreakpoint,
  InstructionBreakpoint,
  MemoryRegion,
  Scope,
  StackFrame,
  Thread,
  ThreadAndSessionIds,
  Variable,
  VisualizedExpression,
  getUriForDebugMemory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z01vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIGRlY29kZUJhc2U2NCwgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCB0cmFja1NldENoYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJpbmdIYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nLCBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERFQlVHX01FTU9SWV9TQ0hFTUUsIERhdGFCcmVha3BvaW50U2V0VHlwZSwgRGF0YUJyZWFrcG9pbnRTb3VyY2UsIERlYnVnVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLCBJQmFzZUJyZWFrcG9pbnQsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludERhdGEsIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSUJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQsIElEYXRhQnJlYWtwb2ludCwgSURlYnVnRXZhbHVhdGVQb3NpdGlvbiwgSURlYnVnTW9kZWwsIElEZWJ1Z1Nlc3Npb24sIElEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbSwgSUVuYWJsZW1lbnQsIElFeGNlcHRpb25CcmVha3BvaW50LCBJRXhjZXB0aW9uSW5mbywgSUV4cHJlc3Npb24sIElFeHByZXNzaW9uQ29udGFpbmVyLCBJRnVuY3Rpb25CcmVha3BvaW50LCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCBJTWVtb3J5SW52YWxpZGF0aW9uRXZlbnQsIElNZW1vcnlSZWdpb24sIElSYXdNb2RlbFVwZGF0ZSwgSVJhd1N0b3BwZWREZXRhaWxzLCBJU2NvcGUsIElTdGFja0ZyYW1lLCBJVGhyZWFkLCBJVHJlZUVsZW1lbnQsIE1lbW9yeVJhbmdlLCBNZW1vcnlSYW5nZVR5cGUsIFN0YXRlLCBpc0ZyYW1lRGVlbXBoYXNpemVkIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBTb3VyY2UsIFVOS05PV05fU09VUkNFX0xBQkVMLCBnZXRVcmlGcm9tU291cmNlIH0gZnJvbSAnLi9kZWJ1Z1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1N0b3JhZ2UgfSBmcm9tICcuL2RlYnVnU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRGVidWdWaXN1YWxpemVyU2VydmljZSB9IGZyb20gJy4vZGVidWdWaXN1YWxpemVycy5qcyc7XG5pbXBvcnQgeyBEaXNhc3NlbWJseVZpZXdJbnB1dCB9IGZyb20gJy4vZGlzYXNzZW1ibHlWaWV3SW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuXG5pbnRlcmZhY2UgSURlYnVnUHJvdG9jb2xWYXJpYWJsZVdpdGhDb250ZXh0IGV4dGVuZHMgRGVidWdQcm90b2NvbC5WYXJpYWJsZSB7XG5cdF9fdnNjb2RlVmFyaWFibGVNZW51Q29udGV4dD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJRXhwcmVzc2lvbkNvbnRhaW5lciB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBhbGxWYWx1ZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHQvLyBVc2UgY2h1bmtzIHRvIHN1cHBvcnQgdmFyaWFibGUgcGFnaW5nICM5NTM3XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEJBU0VfQ0hVTktfU0laRSA9IDEwMDtcblxuXHRwdWJsaWMgdHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgdmFsdWVDaGFuZ2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX3ZhbHVlOiBzdHJpbmcgPSAnJztcblx0cHJvdGVjdGVkIGNoaWxkcmVuPzogUHJvbWlzZTxJRXhwcmVzc2lvbltdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgdGhyZWFkSWQ6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIF9yZWZlcmVuY2U6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIG5hbWVkVmFyaWFibGVzOiBudW1iZXIgfCB1bmRlZmluZWQgPSAwLFxuXHRcdHB1YmxpYyBpbmRleGVkVmFyaWFibGVzOiBudW1iZXIgfCB1bmRlZmluZWQgPSAwLFxuXHRcdHB1YmxpYyBtZW1vcnlSZWZlcmVuY2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHN0YXJ0T2ZWYXJpYWJsZXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IDAsXG5cdFx0cHVibGljIHByZXNlbnRhdGlvbkhpbnQ6IERlYnVnUHJvdG9jb2wuVmFyaWFibGVQcmVzZW50YXRpb25IaW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyB2YWx1ZUxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0Z2V0IHJlZmVyZW5jZSgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWZlcmVuY2U7XG5cdH1cblxuXHRzZXQgcmVmZXJlbmNlKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9yZWZlcmVuY2UgPSB2YWx1ZTtcblx0XHR0aGlzLmNoaWxkcmVuID0gdW5kZWZpbmVkOyAvLyBpbnZhbGlkYXRlIGNoaWxkcmVuIGNhY2hlXG5cdH1cblxuXHRhc3luYyBldmFsdWF0ZUxhenkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnJlZmVyZW5jZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2Vzc2lvbiEudmFyaWFibGVzKHRoaXMucmVmZXJlbmNlLCB0aGlzLnRocmVhZElkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5ib2R5IHx8ICFyZXNwb25zZS5ib2R5LnZhcmlhYmxlcyB8fCByZXNwb25zZS5ib2R5LnZhcmlhYmxlcy5sZW5ndGggIT09IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkdW1teVZhciA9IHJlc3BvbnNlLmJvZHkudmFyaWFibGVzWzBdO1xuXHRcdHRoaXMucmVmZXJlbmNlID0gZHVtbXlWYXIudmFyaWFibGVzUmVmZXJlbmNlO1xuXHRcdHRoaXMuX3ZhbHVlID0gZHVtbXlWYXIudmFsdWU7XG5cdFx0dGhpcy5uYW1lZFZhcmlhYmxlcyA9IGR1bW15VmFyLm5hbWVkVmFyaWFibGVzO1xuXHRcdHRoaXMuaW5kZXhlZFZhcmlhYmxlcyA9IGR1bW15VmFyLmluZGV4ZWRWYXJpYWJsZXM7XG5cdFx0dGhpcy5tZW1vcnlSZWZlcmVuY2UgPSBkdW1teVZhci5tZW1vcnlSZWZlcmVuY2U7XG5cdFx0dGhpcy5wcmVzZW50YXRpb25IaW50ID0gZHVtbXlWYXIucHJlc2VudGF0aW9uSGludDtcblx0XHR0aGlzLnZhbHVlTG9jYXRpb25SZWZlcmVuY2UgPSBkdW1teVZhci52YWx1ZUxvY2F0aW9uUmVmZXJlbmNlO1xuXHRcdC8vIEFsc28gY2FsbCBvdmVycmlkZGVuIG1ldGhvZCB0byBhZG9wdCBzdWJjbGFzcyBwcm9wc1xuXHRcdHRoaXMuYWRvcHRMYXp5UmVzcG9uc2UoZHVtbXlWYXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFkb3B0TGF6eVJlc3BvbnNlKHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlKTogdm9pZCB7XG5cdH1cblxuXHRnZXRDaGlsZHJlbigpOiBQcm9taXNlPElFeHByZXNzaW9uW10+IHtcblx0XHRpZiAoIXRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdHRoaXMuY2hpbGRyZW4gPSB0aGlzLmRvR2V0Q2hpbGRyZW4oKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRDaGlsZHJlbigpOiBQcm9taXNlPElFeHByZXNzaW9uW10+IHtcblx0XHRpZiAoIXRoaXMuaGFzQ2hpbGRyZW4pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZ2V0Q2hpbGRyZW5JbkNodW5rcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmV0Y2hWYXJpYWJsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgb2JqZWN0IGhhcyBuYW1lZCB2YXJpYWJsZXMsIGZldGNoIHRoZW0gaW5kZXBlbmRlbnQgZnJvbSBpbmRleGVkIHZhcmlhYmxlcyAjOTY3MFxuXHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy5uYW1lZFZhcmlhYmxlcyA/IGF3YWl0IHRoaXMuZmV0Y2hWYXJpYWJsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsICduYW1lZCcpIDogW107XG5cblx0XHQvLyBVc2UgYSBkeW5hbWljIGNodW5rIHNpemUgYmFzZWQgb24gdGhlIG51bWJlciBvZiBlbGVtZW50cyAjOTc3NFxuXHRcdGxldCBjaHVua1NpemUgPSBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRTtcblx0XHR3aGlsZSAoISF0aGlzLmluZGV4ZWRWYXJpYWJsZXMgJiYgdGhpcy5pbmRleGVkVmFyaWFibGVzID4gY2h1bmtTaXplICogRXhwcmVzc2lvbkNvbnRhaW5lci5CQVNFX0NIVU5LX1NJWkUpIHtcblx0XHRcdGNodW5rU2l6ZSAqPSBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRTtcblx0XHR9XG5cblx0XHRpZiAoISF0aGlzLmluZGV4ZWRWYXJpYWJsZXMgJiYgdGhpcy5pbmRleGVkVmFyaWFibGVzID4gY2h1bmtTaXplKSB7XG5cdFx0XHQvLyBUaGVyZSBhcmUgYSBsb3Qgb2YgY2hpbGRyZW4sIGNyZWF0ZSBmYWtlIGludGVybWVkaWF0ZSB2YWx1ZXMgdGhhdCByZXByZXNlbnQgY2h1bmtzICM5NTM3XG5cdFx0XHRjb25zdCBudW1iZXJPZkNodW5rcyA9IE1hdGguY2VpbCh0aGlzLmluZGV4ZWRWYXJpYWJsZXMgLyBjaHVua1NpemUpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBudW1iZXJPZkNodW5rczsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gKHRoaXMuc3RhcnRPZlZhcmlhYmxlcyB8fCAwKSArIGkgKiBjaHVua1NpemU7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gTWF0aC5taW4oY2h1bmtTaXplLCB0aGlzLmluZGV4ZWRWYXJpYWJsZXMgLSBpICogY2h1bmtTaXplKTtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaChuZXcgVmFyaWFibGUodGhpcy5zZXNzaW9uLCB0aGlzLnRocmVhZElkLCB0aGlzLCB0aGlzLnJlZmVyZW5jZSwgYFske3N0YXJ0fS4uJHtzdGFydCArIGNvdW50IC0gMX1dYCwgJycsICcnLCB1bmRlZmluZWQsIGNvdW50LCB1bmRlZmluZWQsIHsga2luZDogJ3ZpcnR1YWwnIH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlLCBzdGFydCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFyaWFibGVzID0gYXdhaXQgdGhpcy5mZXRjaFZhcmlhYmxlcyh0aGlzLnN0YXJ0T2ZWYXJpYWJsZXMsIHRoaXMuaW5kZXhlZFZhcmlhYmxlcywgJ2luZGV4ZWQnKTtcblx0XHRyZXR1cm4gY2hpbGRyZW4uY29uY2F0KHZhcmlhYmxlcyk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlkO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdC8vIG9ubHkgdmFyaWFibGVzIHdpdGggcmVmZXJlbmNlID4gMCBoYXZlIGNoaWxkcmVuLlxuXHRcdHJldHVybiAhIXRoaXMucmVmZXJlbmNlICYmIHRoaXMucmVmZXJlbmNlID4gMCAmJiAhdGhpcy5wcmVzZW50YXRpb25IaW50Py5sYXp5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmZXRjaFZhcmlhYmxlcyhzdGFydDogbnVtYmVyIHwgdW5kZWZpbmVkLCBjb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkLCBmaWx0ZXI6ICdpbmRleGVkJyB8ICduYW1lZCcgfCB1bmRlZmluZWQpOiBQcm9taXNlPFZhcmlhYmxlW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlc3Npb24hLnZhcmlhYmxlcyh0aGlzLnJlZmVyZW5jZSB8fCAwLCB0aGlzLnRocmVhZElkLCBmaWx0ZXIsIHN0YXJ0LCBjb3VudCk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5ib2R5IHx8ICFyZXNwb25zZS5ib2R5LnZhcmlhYmxlcykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5hbWVDb3VudCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHRjb25zdCB2YXJzID0gcmVzcG9uc2UuYm9keS52YXJpYWJsZXMuZmlsdGVyKHYgPT4gISF2KS5tYXAoKHY6IElEZWJ1Z1Byb3RvY29sVmFyaWFibGVXaXRoQ29udGV4dCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNTdHJpbmcodi52YWx1ZSkgJiYgaXNTdHJpbmcodi5uYW1lKSAmJiB0eXBlb2Ygdi52YXJpYWJsZXNSZWZlcmVuY2UgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3QgY291bnQgPSBuYW1lQ291bnQuZ2V0KHYubmFtZSkgfHwgMDtcblx0XHRcdFx0XHRjb25zdCBpZER1cGxpY2F0aW9uSW5kZXggPSBjb3VudCA+IDAgPyBjb3VudC50b1N0cmluZygpIDogJyc7XG5cdFx0XHRcdFx0bmFtZUNvdW50LnNldCh2Lm5hbWUsIGNvdW50ICsgMSk7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBWYXJpYWJsZSh0aGlzLnNlc3Npb24sIHRoaXMudGhyZWFkSWQsIHRoaXMsIHYudmFyaWFibGVzUmVmZXJlbmNlLCB2Lm5hbWUsIHYuZXZhbHVhdGVOYW1lLCB2LnZhbHVlLCB2Lm5hbWVkVmFyaWFibGVzLCB2LmluZGV4ZWRWYXJpYWJsZXMsIHYubWVtb3J5UmVmZXJlbmNlLCB2LnByZXNlbnRhdGlvbkhpbnQsIHYudHlwZSwgdi5fX3ZzY29kZVZhcmlhYmxlTWVudUNvbnRleHQsIHRydWUsIDAsIGlkRHVwbGljYXRpb25JbmRleCwgdi5kZWNsYXJhdGlvbkxvY2F0aW9uUmVmZXJlbmNlLCB2LnZhbHVlTG9jYXRpb25SZWZlcmVuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgVmFyaWFibGUodGhpcy5zZXNzaW9uLCB0aGlzLnRocmVhZElkLCB0aGlzLCAwLCAnJywgdW5kZWZpbmVkLCBubHMubG9jYWxpemUoJ2ludmFsaWRWYXJpYWJsZUF0dHJpYnV0ZXMnLCBcIkludmFsaWQgdmFyaWFibGUgYXR0cmlidXRlc1wiKSwgMCwgMCwgdW5kZWZpbmVkLCB7IGtpbmQ6ICd2aXJ0dWFsJyB9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLnNlc3Npb24hLmF1dG9FeHBhbmRMYXp5VmFyaWFibGVzKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHZhcnMubWFwKHYgPT4gdi5wcmVzZW50YXRpb25IaW50Py5sYXp5ICYmIHYuZXZhbHVhdGVMYXp5KCkpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhcnM7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFtuZXcgVmFyaWFibGUodGhpcy5zZXNzaW9uLCB0aGlzLnRocmVhZElkLCB0aGlzLCAwLCAnJywgdW5kZWZpbmVkLCBlLm1lc3NhZ2UsIDAsIDAsIHVuZGVmaW5lZCwgeyBraW5kOiAndmlydHVhbCcgfSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKV07XG5cdFx0fVxuXHR9XG5cblx0Ly8gVGhlIGFkYXB0ZXIgZXhwbGljaXRseSBzZW50cyB0aGUgY2hpbGRyZW4gY291bnQgb2YgYW4gZXhwcmVzc2lvbiBvbmx5IGlmIHRoZXJlIGFyZSBsb3RzIG9mIGNoaWxkcmVuIHdoaWNoIHNob3VsZCBiZSBjaHVua2VkLlxuXHRwcml2YXRlIGdldCBnZXRDaGlsZHJlbkluQ2h1bmtzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuaW5kZXhlZFZhcmlhYmxlcztcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLnZhbHVlQ2hhbmdlZCA9ICEhRXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuZ2V0KHRoaXMuZ2V0SWQoKSkgJiZcblx0XHRcdEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLmdldCh0aGlzLmdldElkKCkpICE9PSBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUUgJiYgRXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuZ2V0KHRoaXMuZ2V0SWQoKSkgIT09IHZhbHVlO1xuXHRcdEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLnNldCh0aGlzLmdldElkKCksIHZhbHVlKTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWU7XG5cdH1cblxuXHRhc3luYyBldmFsdWF0ZUV4cHJlc3Npb24oXG5cdFx0ZXhwcmVzc2lvbjogc3RyaW5nLFxuXHRcdHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0c3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsXG5cdFx0Y29udGV4dDogc3RyaW5nLFxuXHRcdGtlZXBMYXp5VmFycyA9IGZhbHNlLFxuXHRcdGxvY2F0aW9uPzogSURlYnVnRXZhbHVhdGVQb3NpdGlvbixcblx0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRpZiAoIXNlc3Npb24gfHwgKCFzdGFja0ZyYW1lICYmIGNvbnRleHQgIT09ICdyZXBsJykpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBjb250ZXh0ID09PSAncmVwbCcgPyBubHMubG9jYWxpemUoJ3N0YXJ0RGVidWdGaXJzdCcsIFwiUGxlYXNlIHN0YXJ0IGEgZGVidWcgc2Vzc2lvbiB0byBldmFsdWF0ZSBleHByZXNzaW9uc1wiKSA6IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRTtcblx0XHRcdHRoaXMucmVmZXJlbmNlID0gMDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uZXZhbHVhdGUoZXhwcmVzc2lvbiwgc3RhY2tGcmFtZSA/IHN0YWNrRnJhbWUuZnJhbWVJZCA6IHVuZGVmaW5lZCwgY29udGV4dCwgbG9jYXRpb24pO1xuXG5cdFx0XHRpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuYm9keSkge1xuXHRcdFx0XHR0aGlzLnZhbHVlID0gcmVzcG9uc2UuYm9keS5yZXN1bHQgfHwgJyc7XG5cdFx0XHRcdHRoaXMucmVmZXJlbmNlID0gcmVzcG9uc2UuYm9keS52YXJpYWJsZXNSZWZlcmVuY2U7XG5cdFx0XHRcdHRoaXMubmFtZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5Lm5hbWVkVmFyaWFibGVzO1xuXHRcdFx0XHR0aGlzLmluZGV4ZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5LmluZGV4ZWRWYXJpYWJsZXM7XG5cdFx0XHRcdHRoaXMubWVtb3J5UmVmZXJlbmNlID0gcmVzcG9uc2UuYm9keS5tZW1vcnlSZWZlcmVuY2U7XG5cdFx0XHRcdHRoaXMudHlwZSA9IHJlc3BvbnNlLmJvZHkudHlwZSB8fCB0aGlzLnR5cGU7XG5cdFx0XHRcdHRoaXMucHJlc2VudGF0aW9uSGludCA9IHJlc3BvbnNlLmJvZHkucHJlc2VudGF0aW9uSGludDtcblx0XHRcdFx0dGhpcy52YWx1ZUxvY2F0aW9uUmVmZXJlbmNlID0gcmVzcG9uc2UuYm9keS52YWx1ZUxvY2F0aW9uUmVmZXJlbmNlO1xuXG5cdFx0XHRcdGlmICgha2VlcExhenlWYXJzICYmIHJlc3BvbnNlLmJvZHkucHJlc2VudGF0aW9uSGludD8ubGF6eSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXZhbHVhdGVMYXp5KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gZS5tZXNzYWdlIHx8ICcnO1xuXHRcdFx0dGhpcy5yZWZlcmVuY2UgPSAwO1xuXHRcdFx0dGhpcy5tZW1vcnlSZWZlcmVuY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNldFJlc3BvbnNlKGV4cHJlc3Npb246IEV4cHJlc3Npb25Db250YWluZXIsIHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlNldFZhcmlhYmxlUmVzcG9uc2UgfCBEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25SZXNwb25zZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuYm9keSkge1xuXHRcdGV4cHJlc3Npb24udmFsdWUgPSByZXNwb25zZS5ib2R5LnZhbHVlIHx8ICcnO1xuXHRcdGV4cHJlc3Npb24udHlwZSA9IHJlc3BvbnNlLmJvZHkudHlwZSB8fCBleHByZXNzaW9uLnR5cGU7XG5cdFx0ZXhwcmVzc2lvbi5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZTtcblx0XHRleHByZXNzaW9uLm5hbWVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5uYW1lZFZhcmlhYmxlcztcblx0XHRleHByZXNzaW9uLmluZGV4ZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5LmluZGV4ZWRWYXJpYWJsZXM7XG5cdFx0ZXhwcmVzc2lvbi5tZW1vcnlSZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5Lm1lbW9yeVJlZmVyZW5jZTtcblx0XHRleHByZXNzaW9uLnZhbHVlTG9jYXRpb25SZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhbHVlTG9jYXRpb25SZWZlcmVuY2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZpc3VhbGl6ZWRFeHByZXNzaW9uIGltcGxlbWVudHMgSUV4cHJlc3Npb24ge1xuXHRwdWJsaWMgZXJyb3JNZXNzYWdlPzogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0ZXZhbHVhdGVMYXp5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXHRnZXRDaGlsZHJlbigpOiBQcm9taXNlPElFeHByZXNzaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy52aXN1YWxpemVyLmdldFZpc3VhbGl6ZWRDaGlsZHJlbih0aGlzLnNlc3Npb24sIHRoaXMudHJlZUlkLCB0aGlzLnRyZWVJdGVtLmlkKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaWQ7XG5cdH1cblxuXHRnZXQgbmFtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlSXRlbS5sYWJlbDtcblx0fVxuXG5cdGdldCB2YWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlSXRlbS5kZXNjcmlwdGlvbiB8fCAnJztcblx0fVxuXG5cdGdldCBoYXNDaGlsZHJlbigpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlSXRlbS5jb2xsYXBzaWJsZVN0YXRlICE9PSBEZWJ1Z1RyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlzdWFsaXplcjogSURlYnVnVmlzdWFsaXplclNlcnZpY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRyZWVJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB0cmVlSXRlbTogSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbD86IFZhcmlhYmxlLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBnZXRTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb247XG5cdH1cblxuXHQvKiogRWRpdHMgdGhlIHZhbHVlLCBzZXRzIHRoZSB7QGxpbmsgZXJyb3JNZXNzYWdlfSBhbmQgcmV0dXJucyBmYWxzZSBpZiB1bnN1Y2Nlc3NmdWwgKi9cblx0cHVibGljIGFzeW5jIGVkaXQobmV3VmFsdWU6IHN0cmluZykge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnZpc3VhbGl6ZXIuZWRpdFRyZWVJdGVtKHRoaXMudHJlZUlkLCB0aGlzLnRyZWVJdGVtLCBuZXdWYWx1ZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmVycm9yTWVzc2FnZSA9IGUubWVzc2FnZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb24gZXh0ZW5kcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSUV4cHJlc3Npb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9WQUxVRSA9IG5scy5sb2NhbGl6ZSgnbm90QXZhaWxhYmxlJywgXCJub3QgYXZhaWxhYmxlXCIpO1xuXG5cdHB1YmxpYyBhdmFpbGFibGU6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWYWx1ZSA9IG5ldyBFbWl0dGVyPElFeHByZXNzaW9uPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZTogRXZlbnQ8SUV4cHJlc3Npb24+ID0gdGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbmFtZTogc3RyaW5nLCBpZCA9IGdlbmVyYXRlVXVpZCgpKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCB1bmRlZmluZWQsIDAsIGlkKTtcblx0XHR0aGlzLmF2YWlsYWJsZSA9IGZhbHNlO1xuXHRcdC8vIG5hbWUgaXMgbm90IHNldCBpZiB0aGUgZXhwcmVzc2lvbiBpcyBqdXN0IGJlaW5nIGFkZGVkXG5cdFx0Ly8gaW4gdGhhdCBjYXNlIGRvIG5vdCBzZXQgZGVmYXVsdCB2YWx1ZSB0byBwcmV2ZW50IGZsYXNoaW5nICMxNDQ5OVxuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHR0aGlzLnZhbHVlID0gRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGV2YWx1YXRlKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBzdHJpbmcsIGtlZXBMYXp5VmFycz86IGJvb2xlYW4sIGxvY2F0aW9uPzogSURlYnVnRXZhbHVhdGVQb3NpdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhhZERlZmF1bHRWYWx1ZSA9IHRoaXMudmFsdWUgPT09IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRTtcblx0XHR0aGlzLmF2YWlsYWJsZSA9IGF3YWl0IHRoaXMuZXZhbHVhdGVFeHByZXNzaW9uKHRoaXMubmFtZSwgc2Vzc2lvbiwgc3RhY2tGcmFtZSwgY29udGV4dCwga2VlcExhenlWYXJzLCBsb2NhdGlvbik7XG5cdFx0aWYgKGhhZERlZmF1bHRWYWx1ZSB8fCB0aGlzLnZhbHVlQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMubmFtZX1cXG4ke3RoaXMudmFsdWV9YDtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkOiB0aGlzLmdldFNlc3Npb24oKT8uZ2V0SWQoKSxcblx0XHRcdHZhcmlhYmxlOiB0aGlzLnRvRGVidWdQcm90b2NvbE9iamVjdCgpLFxuXHRcdH07XG5cdH1cblxuXHR0b0RlYnVnUHJvdG9jb2xPYmplY3QoKTogRGVidWdQcm90b2NvbC5WYXJpYWJsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdHZhcmlhYmxlc1JlZmVyZW5jZTogdGhpcy5yZWZlcmVuY2UgfHwgMCxcblx0XHRcdG1lbW9yeVJlZmVyZW5jZTogdGhpcy5tZW1vcnlSZWZlcmVuY2UsXG5cdFx0XHR2YWx1ZTogdGhpcy52YWx1ZSxcblx0XHRcdHR5cGU6IHRoaXMudHlwZSxcblx0XHRcdGV2YWx1YXRlTmFtZTogdGhpcy5uYW1lXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHNldEV4cHJlc3Npb24odmFsdWU6IHN0cmluZywgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZXNzaW9uLnNldEV4cHJlc3Npb24oc3RhY2tGcmFtZS5mcmFtZUlkLCB0aGlzLm5hbWUsIHZhbHVlKTtcblx0XHRoYW5kbGVTZXRSZXNwb25zZSh0aGlzLCByZXNwb25zZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZhcmlhYmxlIGV4dGVuZHMgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElFeHByZXNzaW9uIHtcblxuXHQvLyBVc2VkIHRvIHNob3cgdGhlIGVycm9yIG1lc3NhZ2UgY29taW5nIGZyb20gdGhlIGFkYXB0ZXIgd2hlbiBzZXR0aW5nIHRoZSB2YWx1ZSAjNzgwN1xuXHRwdWJsaWMgZXJyb3JNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHR0aHJlYWRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBwYXJlbnQ6IElFeHByZXNzaW9uQ29udGFpbmVyLFxuXHRcdHJlZmVyZW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIGV2YWx1YXRlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0bmFtZWRWYXJpYWJsZXM6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRpbmRleGVkVmFyaWFibGVzOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0bWVtb3J5UmVmZXJlbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJlc2VudGF0aW9uSGludDogRGVidWdQcm90b2NvbC5WYXJpYWJsZVByZXNlbnRhdGlvbkhpbnQgfCB1bmRlZmluZWQsXG5cdFx0dHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSB2YXJpYWJsZU1lbnVDb250ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGF2YWlsYWJsZSA9IHRydWUsXG5cdFx0c3RhcnRPZlZhcmlhYmxlcyA9IDAsXG5cdFx0aWREdXBsaWNhdGlvbkluZGV4ID0gJycsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlY2xhcmF0aW9uTG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHR2YWx1ZUxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKHNlc3Npb24sIHRocmVhZElkLCByZWZlcmVuY2UsIGB2YXJpYWJsZToke3BhcmVudC5nZXRJZCgpfToke25hbWV9OiR7aWREdXBsaWNhdGlvbkluZGV4fWAsIG5hbWVkVmFyaWFibGVzLCBpbmRleGVkVmFyaWFibGVzLCBtZW1vcnlSZWZlcmVuY2UsIHN0YXJ0T2ZWYXJpYWJsZXMsIHByZXNlbnRhdGlvbkhpbnQsIHZhbHVlTG9jYXRpb25SZWZlcmVuY2UpO1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZSB8fCAnJztcblx0XHR0aGlzLnR5cGUgPSB0eXBlO1xuXHR9XG5cblx0Z2V0VGhyZWFkSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMudGhyZWFkSWQ7XG5cdH1cblxuXHRhc3luYyBzZXRWYXJpYWJsZSh2YWx1ZTogc3RyaW5nLCBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNlbmQgb3V0IGEgc2V0RXhwcmVzc2lvbiBmb3IgZGVidWcgZXh0ZW5zaW9ucyB0aGF0IGRvIG5vdCBzdXBwb3J0IHNldCB2YXJpYWJsZXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNDY3OSNpc3N1ZWNvbW1lbnQtODY5ODQ0NDM3XG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1NldEV4cHJlc3Npb24gJiYgIXRoaXMuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTZXRWYXJpYWJsZSAmJiB0aGlzLmV2YWx1YXRlTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRFeHByZXNzaW9uKHZhbHVlLCBzdGFja0ZyYW1lKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlc3Npb24uc2V0VmFyaWFibGUoKDxFeHByZXNzaW9uQ29udGFpbmVyPnRoaXMucGFyZW50KS5yZWZlcmVuY2UsIHRoaXMubmFtZSwgdmFsdWUpO1xuXHRcdFx0aGFuZGxlU2V0UmVzcG9uc2UodGhpcywgcmVzcG9uc2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5lcnJvck1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRFeHByZXNzaW9uKHZhbHVlOiBzdHJpbmcsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb24gfHwgIXRoaXMuZXZhbHVhdGVOYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlc3Npb24uc2V0RXhwcmVzc2lvbihzdGFja0ZyYW1lLmZyYW1lSWQsIHRoaXMuZXZhbHVhdGVOYW1lLCB2YWx1ZSk7XG5cdFx0aGFuZGxlU2V0UmVzcG9uc2UodGhpcywgcmVzcG9uc2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5uYW1lID8gYCR7dGhpcy5uYW1lfTogJHt0aGlzLnZhbHVlfWAgOiB0aGlzLnZhbHVlO1xuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6IHRoaXMuZ2V0U2Vzc2lvbigpPy5nZXRJZCgpLFxuXHRcdFx0Y29udGFpbmVyOiB0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb25cblx0XHRcdFx0PyB7IGV4cHJlc3Npb246IHRoaXMucGFyZW50Lm5hbWUgfVxuXHRcdFx0XHQ6ICh0aGlzLnBhcmVudCBhcyAoVmFyaWFibGUgfCBTY29wZSkpLnRvRGVidWdQcm90b2NvbE9iamVjdCgpLFxuXHRcdFx0dmFyaWFibGU6IHRoaXMudG9EZWJ1Z1Byb3RvY29sT2JqZWN0KClcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFkb3B0TGF6eVJlc3BvbnNlKHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5ldmFsdWF0ZU5hbWUgPSByZXNwb25zZS5ldmFsdWF0ZU5hbWU7XG5cdH1cblxuXHR0b0RlYnVnUHJvdG9jb2xPYmplY3QoKTogRGVidWdQcm90b2NvbC5WYXJpYWJsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdHZhcmlhYmxlc1JlZmVyZW5jZTogdGhpcy5yZWZlcmVuY2UgfHwgMCxcblx0XHRcdG1lbW9yeVJlZmVyZW5jZTogdGhpcy5tZW1vcnlSZWZlcmVuY2UsXG5cdFx0XHR2YWx1ZTogdGhpcy52YWx1ZSxcblx0XHRcdHR5cGU6IHRoaXMudHlwZSxcblx0XHRcdGV2YWx1YXRlTmFtZTogdGhpcy5ldmFsdWF0ZU5hbWVcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY29wZSBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJU2NvcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSxcblx0XHRpZDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cmVmZXJlbmNlOiBudW1iZXIsXG5cdFx0cHVibGljIGV4cGVuc2l2ZTogYm9vbGVhbixcblx0XHRuYW1lZFZhcmlhYmxlcz86IG51bWJlcixcblx0XHRpbmRleGVkVmFyaWFibGVzPzogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZT86IElSYW5nZVxuXHQpIHtcblx0XHRzdXBlcihzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLCBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZCwgcmVmZXJlbmNlLCBgc2NvcGU6JHtuYW1lfToke2lkfWAsIG5hbWVkVmFyaWFibGVzLCBpbmRleGVkVmFyaWFibGVzKTtcblx0fVxuXG5cdGdldCBjaGlsZHJlbkhhdmVCZWVuTG9hZGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuY2hpbGRyZW47XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm5hbWU7XG5cdH1cblxuXHR0b0RlYnVnUHJvdG9jb2xPYmplY3QoKTogRGVidWdQcm90b2NvbC5TY29wZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdHZhcmlhYmxlc1JlZmVyZW5jZTogdGhpcy5yZWZlcmVuY2UgfHwgMCxcblx0XHRcdGV4cGVuc2l2ZTogdGhpcy5leHBlbnNpdmVcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFcnJvclNjb3BlIGV4dGVuZHMgU2NvcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lLFxuXHRcdGluZGV4OiBudW1iZXIsXG5cdFx0bWVzc2FnZTogc3RyaW5nLFxuXHQpIHtcblx0XHRzdXBlcihzdGFja0ZyYW1lLCBpbmRleCwgbWVzc2FnZSwgMCwgZmFsc2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5uYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFja0ZyYW1lIGltcGxlbWVudHMgSVN0YWNrRnJhbWUge1xuXG5cdHByaXZhdGUgc2NvcGVzOiBQcm9taXNlPFNjb3BlW10+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0aHJlYWQ6IFRocmVhZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZnJhbWVJZDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzb3VyY2U6IFNvdXJjZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcmVzZW50YXRpb25IaW50OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlOiBJUmFuZ2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBjYW5SZXN0YXJ0OiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2U/OiBzdHJpbmdcblx0KSB7IH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgc3RhY2tmcmFtZToke3RoaXMudGhyZWFkLmdldElkKCl9OiR7dGhpcy5pbmRleH06JHt0aGlzLnNvdXJjZS5uYW1lfWA7XG5cdH1cblxuXHRnZXRTY29wZXMoKTogUHJvbWlzZTxJU2NvcGVbXT4ge1xuXHRcdGlmICghdGhpcy5zY29wZXMpIHtcblx0XHRcdHRoaXMuc2NvcGVzID0gdGhpcy50aHJlYWQuc2Vzc2lvbi5zY29wZXModGhpcy5mcmFtZUlkLCB0aGlzLnRocmVhZC50aHJlYWRJZCkudGhlbihyZXNwb25zZSA9PiB7XG5cdFx0XHRcdGlmICghcmVzcG9uc2UgfHwgIXJlc3BvbnNlLmJvZHkgfHwgIXJlc3BvbnNlLmJvZHkuc2NvcGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXNlZElkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdFx0XHRyZXR1cm4gcmVzcG9uc2UuYm9keS5zY29wZXMubWFwKHJzID0+IHtcblx0XHRcdFx0XHQvLyBmb3JtIHRoZSBpZCBiYXNlZCBvbiB0aGUgbmFtZSBhbmQgbG9jYXRpb24gc28gdGhhdCBpdCdzIHRoZVxuXHRcdFx0XHRcdC8vIHNhbWUgYWNyb3NzIG11bHRpcGxlIHBhdXNlcyB0byByZXRhaW4gZXhwYW5zaW9uIHN0YXRlXG5cdFx0XHRcdFx0bGV0IGlkID0gMDtcblx0XHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0XHRpZCA9IHN0cmluZ0hhc2goYCR7cnMubmFtZX06JHtycy5saW5lfToke3JzLmNvbHVtbn1gLCBpZCk7XG5cdFx0XHRcdFx0fSB3aGlsZSAodXNlZElkcy5oYXMoaWQpKTtcblxuXHRcdFx0XHRcdHVzZWRJZHMuYWRkKGlkKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFNjb3BlKHRoaXMsIGlkLCBycy5uYW1lLCBycy52YXJpYWJsZXNSZWZlcmVuY2UsIHJzLmV4cGVuc2l2ZSwgcnMubmFtZWRWYXJpYWJsZXMsIHJzLmluZGV4ZWRWYXJpYWJsZXMsXG5cdFx0XHRcdFx0XHRycy5saW5lICYmIHJzLmNvbHVtbiAmJiBycy5lbmRMaW5lICYmIHJzLmVuZENvbHVtbiA/IG5ldyBSYW5nZShycy5saW5lLCBycy5jb2x1bW4sIHJzLmVuZExpbmUsIHJzLmVuZENvbHVtbikgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgZXJyID0+IFtuZXcgRXJyb3JTY29wZSh0aGlzLCAwLCBlcnIubWVzc2FnZSldKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zY29wZXM7XG5cdH1cblxuXHRhc3luYyBnZXRNb3N0U3BlY2lmaWNTY29wZXMocmFuZ2U6IElSYW5nZSk6IFByb21pc2U8SVNjb3BlW10+IHtcblx0XHRjb25zdCBzY29wZXMgPSBhd2FpdCB0aGlzLmdldFNjb3BlcygpO1xuXHRcdGNvbnN0IG5vbkV4cGVuc2l2ZVNjb3BlcyA9IHNjb3Blcy5maWx0ZXIocyA9PiAhcy5leHBlbnNpdmUpO1xuXHRcdGNvbnN0IGhhdmVSYW5nZUluZm8gPSBub25FeHBlbnNpdmVTY29wZXMuc29tZShzID0+ICEhcy5yYW5nZSk7XG5cdFx0aWYgKCFoYXZlUmFuZ2VJbmZvKSB7XG5cdFx0XHRyZXR1cm4gbm9uRXhwZW5zaXZlU2NvcGVzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjb3Blc0NvbnRhaW5pbmdSYW5nZSA9IG5vbkV4cGVuc2l2ZVNjb3Blcy5maWx0ZXIoc2NvcGUgPT4gc2NvcGUucmFuZ2UgJiYgUmFuZ2UuY29udGFpbnNSYW5nZShzY29wZS5yYW5nZSwgcmFuZ2UpKVxuXHRcdFx0LnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IChmaXJzdC5yYW5nZSEuZW5kTGluZU51bWJlciAtIGZpcnN0LnJhbmdlIS5zdGFydExpbmVOdW1iZXIpIC0gKHNlY29uZC5yYW5nZSEuZW5kTGluZU51bWJlciAtIHNlY29uZC5yYW5nZSEuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0cmV0dXJuIHNjb3Blc0NvbnRhaW5pbmdSYW5nZS5sZW5ndGggPyBzY29wZXNDb250YWluaW5nUmFuZ2UgOiBub25FeHBlbnNpdmVTY29wZXM7XG5cdH1cblxuXHRyZXN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnRocmVhZC5zZXNzaW9uLnJlc3RhcnRGcmFtZSh0aGlzLmZyYW1lSWQsIHRoaXMudGhyZWFkLnRocmVhZElkKTtcblx0fVxuXG5cdGZvcmdldFNjb3BlcygpOiB2b2lkIHtcblx0XHR0aGlzLnNjb3BlcyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZU51bWJlclRvU3RyaW5nID0gdHlwZW9mIHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSAnbnVtYmVyJyA/IGA6JHt0aGlzLnJhbmdlLnN0YXJ0TGluZU51bWJlcn1gIDogJyc7XG5cdFx0Y29uc3Qgc291cmNlVG9TdHJpbmcgPSBgJHt0aGlzLnNvdXJjZS5pbk1lbW9yeSA/IHRoaXMuc291cmNlLm5hbWUgOiB0aGlzLnNvdXJjZS51cmkuZnNQYXRofSR7bGluZU51bWJlclRvU3RyaW5nfWA7XG5cblx0XHRyZXR1cm4gc291cmNlVG9TdHJpbmcgPT09IFVOS05PV05fU09VUkNFX0xBQkVMID8gdGhpcy5uYW1lIDogYCR7dGhpcy5uYW1lfSAoJHtzb3VyY2VUb1N0cmluZ30pYDtcblx0fVxuXG5cdGFzeW5jIG9wZW5JbkVkaXRvcihlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHNpZGVCeVNpZGU/OiBib29sZWFuLCBwaW5uZWQ/OiBib29sZWFuKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRocmVhZFN0b3BSZWFzb24gPSB0aGlzLnRocmVhZC5zdG9wcGVkRGV0YWlscz8ucmVhc29uO1xuXHRcdGlmICh0aGlzLmluc3RydWN0aW9uUG9pbnRlclJlZmVyZW5jZSAmJlxuXHRcdFx0KCh0aHJlYWRTdG9wUmVhc29uID09PSAnaW5zdHJ1Y3Rpb24gYnJlYWtwb2ludCcgJiYgIXByZXNlcnZlRm9jdXMpIHx8XG5cdFx0XHRcdCh0aHJlYWRTdG9wUmVhc29uID09PSAnc3RlcCcgJiYgdGhpcy50aHJlYWQubGFzdFN0ZXBwaW5nR3JhbnVsYXJpdHkgPT09ICdpbnN0cnVjdGlvbicgJiYgIXByZXNlcnZlRm9jdXMpIHx8XG5cdFx0XHRcdGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgRGlzYXNzZW1ibHlWaWV3SW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKERpc2Fzc2VtYmx5Vmlld0lucHV0Lmluc3RhbmNlLCB7IHBpbm5lZDogdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUsIHByZXNlcnZlRm9jdXMgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc291cmNlLmF2YWlsYWJsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc291cmNlLm9wZW5JbkVkaXRvcihlZGl0b3JTZXJ2aWNlLCB0aGlzLnJhbmdlLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlLCBwaW5uZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBJU3RhY2tGcmFtZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5uYW1lID09PSBvdGhlci5uYW1lKSAmJiAob3RoZXIudGhyZWFkID09PSB0aGlzLnRocmVhZCkgJiYgKHRoaXMuZnJhbWVJZCA9PT0gb3RoZXIuZnJhbWVJZCkgJiYgKG90aGVyLnNvdXJjZSA9PT0gdGhpcy5zb3VyY2UpICYmIChSYW5nZS5lcXVhbHNSYW5nZSh0aGlzLnJhbmdlLCBvdGhlci5yYW5nZSkpO1xuXHR9XG59XG5cbmNvbnN0IEtFRVBfU1VCVExFX0ZSQU1FX0FUX1RPUF9SRUFTT05TOiByZWFkb25seSBzdHJpbmdbXSA9IFsnYnJlYWtwb2ludCcsICdzdGVwJywgJ2Z1bmN0aW9uIGJyZWFrcG9pbnQnXTtcblxuZXhwb3J0IGNsYXNzIFRocmVhZCBpbXBsZW1lbnRzIElUaHJlYWQge1xuXHRwcml2YXRlIGNhbGxTdGFjazogSVN0YWNrRnJhbWVbXTtcblx0cHJpdmF0ZSBzdGFsZUNhbGxTdGFjazogSVN0YWNrRnJhbWVbXTtcblx0cHJpdmF0ZSBjYWxsU3RhY2tDYW5jZWxsYXRpb25Ub2tlbnM6IENhbmNlbGxhdGlvblRva2VuU291cmNlW10gPSBbXTtcblx0cHVibGljIHN0b3BwZWREZXRhaWxzOiBJUmF3U3RvcHBlZERldGFpbHMgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBzdG9wcGVkOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhY2hlZEVuZE9mQ2FsbFN0YWNrID0gZmFsc2U7XG5cdHB1YmxpYyBsYXN0U3RlcHBpbmdHcmFudWxhcml0eTogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBwdWJsaWMgbmFtZTogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgdGhyZWFkSWQ6IG51bWJlcikge1xuXHRcdHRoaXMuY2FsbFN0YWNrID0gW107XG5cdFx0dGhpcy5zdGFsZUNhbGxTdGFjayA9IFtdO1xuXHRcdHRoaXMuc3RvcHBlZCA9IGZhbHNlO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYHRocmVhZDoke3RoaXMuc2Vzc2lvbi5nZXRJZCgpfToke3RoaXMudGhyZWFkSWR9YDtcblx0fVxuXG5cdGNsZWFyQ2FsbFN0YWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbGxTdGFjay5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc3RhbGVDYWxsU3RhY2sgPSB0aGlzLmNhbGxTdGFjaztcblx0XHR9XG5cdFx0dGhpcy5jYWxsU3RhY2sgPSBbXTtcblx0XHR0aGlzLmNhbGxTdGFja0NhbmNlbGxhdGlvblRva2Vucy5mb3JFYWNoKGMgPT4gYy5kaXNwb3NlKHRydWUpKTtcblx0XHR0aGlzLmNhbGxTdGFja0NhbmNlbGxhdGlvblRva2VucyA9IFtdO1xuXHR9XG5cblx0Z2V0Q2FsbFN0YWNrKCk6IElTdGFja0ZyYW1lW10ge1xuXHRcdHJldHVybiB0aGlzLmNhbGxTdGFjaztcblx0fVxuXG5cdGdldFN0YWxlQ2FsbFN0YWNrKCk6IFJlYWRvbmx5QXJyYXk8SVN0YWNrRnJhbWU+IHtcblx0XHRyZXR1cm4gdGhpcy5zdGFsZUNhbGxTdGFjaztcblx0fVxuXG5cdGdldFRvcFN0YWNrRnJhbWUoKTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhbGxTdGFjayA9IHRoaXMuZ2V0Q2FsbFN0YWNrKCk7XG5cdFx0Y29uc3Qgc3RvcFJlYXNvbiA9IHRoaXMuc3RvcHBlZERldGFpbHM/LnJlYXNvbjtcblx0XHQvLyBBbGxvdyBzdGFjayBmcmFtZSB3aXRob3V0IHNvdXJjZSBhbmQgd2l0aCBpbnN0cnVjdGlvblJlZmVyZW5jZVBvaW50ZXIgYXMgdG9wIHN0YWNrIGZyYW1lIHdoZW4gdXNpbmcgZGlzYXNzZW1ibHkgdmlldy5cblx0XHRjb25zdCBmaXJzdEF2YWlsYWJsZVN0YWNrRnJhbWUgPSBjYWxsU3RhY2suZmluZChzZiA9PiAhIShcblx0XHRcdCgoc3RvcFJlYXNvbiA9PT0gJ2luc3RydWN0aW9uIGJyZWFrcG9pbnQnIHx8IChzdG9wUmVhc29uID09PSAnc3RlcCcgJiYgdGhpcy5sYXN0U3RlcHBpbmdHcmFudWxhcml0eSA9PT0gJ2luc3RydWN0aW9uJykpICYmIHNmLmluc3RydWN0aW9uUG9pbnRlclJlZmVyZW5jZSkgfHxcblx0XHRcdChzZi5zb3VyY2UgJiYgc2Yuc291cmNlLmF2YWlsYWJsZSAmJiAoS0VFUF9TVUJUTEVfRlJBTUVfQVRfVE9QX1JFQVNPTlMuaW5jbHVkZXMoc3RvcFJlYXNvbiEpIHx8ICFpc0ZyYW1lRGVlbXBoYXNpemVkKHNmKSkpKSk7XG5cdFx0cmV0dXJuIGZpcnN0QXZhaWxhYmxlU3RhY2tGcmFtZTtcblx0fVxuXG5cdGdldCBzdGF0ZUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuc3RvcHBlZERldGFpbHMpIHtcblx0XHRcdHJldHVybiB0aGlzLnN0b3BwZWREZXRhaWxzLmRlc2NyaXB0aW9uIHx8XG5cdFx0XHRcdCh0aGlzLnN0b3BwZWREZXRhaWxzLnJlYXNvbiA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ3BhdXNlZE9uJywgY29tbWVudDogWydpbmRpY2F0ZXMgcmVhc29uIGZvciBwcm9ncmFtIGJlaW5nIHBhdXNlZCddIH0sIFwiUGF1c2VkIG9uIHswfVwiLCB0aGlzLnN0b3BwZWREZXRhaWxzLnJlYXNvbikgOiBubHMubG9jYWxpemUoJ3BhdXNlZCcsIFwiUGF1c2VkXCIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKHsga2V5OiAncnVubmluZycsIGNvbW1lbnQ6IFsnaW5kaWNhdGVzIHN0YXRlJ10gfSwgXCJSdW5uaW5nXCIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFF1ZXJpZXMgdGhlIGRlYnVnIGFkYXB0ZXIgZm9yIHRoZSBjYWxsc3RhY2sgYW5kIHJldHVybnMgYSBwcm9taXNlXG5cdCAqIHdoaWNoIGNvbXBsZXRlcyBvbmNlIHRoZSBjYWxsIHN0YWNrIGhhcyBiZWVuIHJldHJpZXZlZC5cblx0ICogSWYgdGhlIHRocmVhZCBpcyBub3Qgc3RvcHBlZCwgaXQgcmV0dXJucyBhIHByb21pc2UgdG8gYW4gZW1wdHkgYXJyYXkuXG5cdCAqIE9ubHkgZmV0Y2hlcyB0aGUgZmlyc3Qgc3RhY2sgZnJhbWUgZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMuIENhbGxpbmcgdGhpcyBtZXRob2QgY29uc2VjdXRpdmUgdGltZXNcblx0ICogZ2V0cyB0aGUgcmVtYWluZGVyIG9mIHRoZSBjYWxsIHN0YWNrLlxuXHQgKi9cblx0YXN5bmMgZmV0Y2hDYWxsU3RhY2sobGV2ZWxzID0gMjApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdG9wcGVkKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuY2FsbFN0YWNrLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNhbGxTdGFjayA9IGF3YWl0IHRoaXMuZ2V0Q2FsbFN0YWNrSW1wbChzdGFydCwgbGV2ZWxzKTtcblx0XHRcdHRoaXMucmVhY2hlZEVuZE9mQ2FsbFN0YWNrID0gY2FsbFN0YWNrLmxlbmd0aCA8IGxldmVscztcblx0XHRcdGlmIChzdGFydCA8IHRoaXMuY2FsbFN0YWNrLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBTZXQgdGhlIHN0YWNrIGZyYW1lcyBmb3IgZXhhY3QgcG9zaXRpb24gd2UgcmVxdWVzdGVkLiBUbyBtYWtlIHN1cmUgbm8gY29uY3VycmVudCByZXF1ZXN0cyBjcmVhdGUgZHVwbGljYXRlIHN0YWNrIGZyYW1lcyAjMzA2NjBcblx0XHRcdFx0dGhpcy5jYWxsU3RhY2suc3BsaWNlKHN0YXJ0LCB0aGlzLmNhbGxTdGFjay5sZW5ndGggLSBzdGFydCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNhbGxTdGFjayA9IHRoaXMuY2FsbFN0YWNrLmNvbmNhdChjYWxsU3RhY2sgfHwgW10pO1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLnN0b3BwZWREZXRhaWxzPy50b3RhbEZyYW1lcyA9PT0gJ251bWJlcicgJiYgdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyA9PT0gdGhpcy5jYWxsU3RhY2subGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMucmVhY2hlZEVuZE9mQ2FsbFN0YWNrID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENhbGxTdGFja0ltcGwoc3RhcnRGcmFtZTogbnVtYmVyLCBsZXZlbHM6IG51bWJlcik6IFByb21pc2U8SVN0YWNrRnJhbWVbXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGhpcy5jYWxsU3RhY2tDYW5jZWxsYXRpb25Ub2tlbnMucHVzaCh0b2tlblNvdXJjZSk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2Vzc2lvbi5zdGFja1RyYWNlKHRoaXMudGhyZWFkSWQsIHN0YXJ0RnJhbWUsIGxldmVscywgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0aWYgKCFyZXNwb25zZSB8fCAhcmVzcG9uc2UuYm9keSB8fCB0b2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnN0b3BwZWREZXRhaWxzKSB7XG5cdFx0XHRcdHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgPSByZXNwb25zZS5ib2R5LnRvdGFsRnJhbWVzO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzcG9uc2UuYm9keS5zdGFja0ZyYW1lcy5tYXAoKHJzZiwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc291cmNlID0gdGhpcy5zZXNzaW9uLmdldFNvdXJjZShyc2Yuc291cmNlKTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFN0YWNrRnJhbWUodGhpcywgcnNmLmlkLCBzb3VyY2UsIHJzZi5uYW1lLCByc2YucHJlc2VudGF0aW9uSGludCwgbmV3IFJhbmdlKFxuXHRcdFx0XHRcdHJzZi5saW5lLFxuXHRcdFx0XHRcdHJzZi5jb2x1bW4sXG5cdFx0XHRcdFx0cnNmLmVuZExpbmUgfHwgcnNmLmxpbmUsXG5cdFx0XHRcdFx0cnNmLmVuZENvbHVtbiB8fCByc2YuY29sdW1uXG5cdFx0XHRcdCksIHN0YXJ0RnJhbWUgKyBpbmRleCwgdHlwZW9mIHJzZi5jYW5SZXN0YXJ0ID09PSAnYm9vbGVhbicgPyByc2YuY2FuUmVzdGFydCA6IHRydWUsIHJzZi5pbnN0cnVjdGlvblBvaW50ZXJSZWZlcmVuY2UpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAodGhpcy5zdG9wcGVkRGV0YWlscykge1xuXHRcdFx0XHR0aGlzLnN0b3BwZWREZXRhaWxzLmZyYW1lc0Vycm9yTWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgZXhjZXB0aW9uIGluZm8gcHJvbWlzZSBpZiB0aGUgZXhjZXB0aW9uIHdhcyB0aHJvd24sIG90aGVyd2lzZSB1bmRlZmluZWRcblx0ICovXG5cdGdldCBleGNlcHRpb25JbmZvKCk6IFByb21pc2U8SUV4Y2VwdGlvbkluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5zdG9wcGVkRGV0YWlscyAmJiB0aGlzLnN0b3BwZWREZXRhaWxzLnJlYXNvbiA9PT0gJ2V4Y2VwdGlvbicpIHtcblx0XHRcdGlmICh0aGlzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRXhjZXB0aW9uSW5mb1JlcXVlc3QpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbi5leGNlcHRpb25JbmZvKHRoaXMudGhyZWFkSWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLnN0b3BwZWREZXRhaWxzLnRleHQsXG5cdFx0XHRcdGJyZWFrTW9kZTogbnVsbFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdG5leHQoZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLm5leHQodGhpcy50aHJlYWRJZCwgZ3JhbnVsYXJpdHkpO1xuXHR9XG5cblx0c3RlcEluKGdyYW51bGFyaXR5PzogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbi5zdGVwSW4odGhpcy50aHJlYWRJZCwgdW5kZWZpbmVkLCBncmFudWxhcml0eSk7XG5cdH1cblxuXHRzdGVwT3V0KGdyYW51bGFyaXR5PzogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbi5zdGVwT3V0KHRoaXMudGhyZWFkSWQsIGdyYW51bGFyaXR5KTtcblx0fVxuXG5cdHN0ZXBCYWNrKGdyYW51bGFyaXR5PzogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbi5zdGVwQmFjayh0aGlzLnRocmVhZElkLCBncmFudWxhcml0eSk7XG5cdH1cblxuXHRjb250aW51ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLmNvbnRpbnVlKHRoaXMudGhyZWFkSWQpO1xuXHR9XG5cblx0cGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbi5wYXVzZSh0aGlzLnRocmVhZElkKTtcblx0fVxuXG5cdHRlcm1pbmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnRlcm1pbmF0ZVRocmVhZHMoW3RoaXMudGhyZWFkSWRdKTtcblx0fVxuXG5cdHJldmVyc2VDb250aW51ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnJldmVyc2VDb250aW51ZSh0aGlzLnRocmVhZElkKTtcblx0fVxufVxuXG4vKipcbiAqIEdldHMgYSBVUkkgdG8gYSBtZW1vcnkgaW4gdGhlIGdpdmVuIHNlc3Npb24gSUQuXG4gKi9cbmV4cG9ydCBjb25zdCBnZXRVcmlGb3JEZWJ1Z01lbW9yeSA9IChcblx0c2Vzc2lvbklkOiBzdHJpbmcsXG5cdG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nLFxuXHRyYW5nZT86IHsgZnJvbU9mZnNldDogbnVtYmVyOyB0b09mZnNldDogbnVtYmVyIH0sXG5cdGRpc3BsYXlOYW1lID0gJ21lbW9yeSdcbikgPT4ge1xuXHRyZXR1cm4gVVJJLmZyb20oe1xuXHRcdHNjaGVtZTogREVCVUdfTUVNT1JZX1NDSEVNRSxcblx0XHRhdXRob3JpdHk6IHNlc3Npb25JZCxcblx0XHRwYXRoOiAnLycgKyBlbmNvZGVVUklDb21wb25lbnQobWVtb3J5UmVmZXJlbmNlKSArIGAvJHtlbmNvZGVVUklDb21wb25lbnQoZGlzcGxheU5hbWUpfS5iaW5gLFxuXHRcdHF1ZXJ5OiByYW5nZSA/IGA/cmFuZ2U9JHtyYW5nZS5mcm9tT2Zmc2V0fToke3JhbmdlLnRvT2Zmc2V0fWAgOiB1bmRlZmluZWQsXG5cdH0pO1xufTtcblxuZXhwb3J0IGNsYXNzIE1lbW9yeVJlZ2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWVtb3J5UmVnaW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBpbnZhbGlkYXRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNZW1vcnlJbnZhbGlkYXRpb25FdmVudD4oKSk7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEludmFsaWRhdGUgPSB0aGlzLmludmFsaWRhdGVFbWl0dGVyLmV2ZW50O1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgd3JpdGFibGU6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBtZW1vcnlSZWZlcmVuY2U6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLndyaXRhYmxlID0gISF0aGlzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzV3JpdGVNZW1vcnlSZXF1ZXN0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb24ub25EaWRJbnZhbGlkYXRlTWVtb3J5KGUgPT4ge1xuXHRcdFx0aWYgKGUuYm9keS5tZW1vcnlSZWZlcmVuY2UgPT09IG1lbW9yeVJlZmVyZW5jZSkge1xuXHRcdFx0XHR0aGlzLmludmFsaWRhdGUoZS5ib2R5Lm9mZnNldCwgZS5ib2R5LmNvdW50IC0gZS5ib2R5Lm9mZnNldCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlYWQoZnJvbU9mZnNldDogbnVtYmVyLCB0b09mZnNldDogbnVtYmVyKTogUHJvbWlzZTxNZW1vcnlSYW5nZVtdPiB7XG5cdFx0Y29uc3QgbGVuZ3RoID0gdG9PZmZzZXQgLSBmcm9tT2Zmc2V0O1xuXHRcdGNvbnN0IG9mZnNldCA9IGZyb21PZmZzZXQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXNzaW9uLnJlYWRNZW1vcnkodGhpcy5tZW1vcnlSZWZlcmVuY2UsIG9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCB8fCAhcmVzdWx0LmJvZHk/LmRhdGEpIHtcblx0XHRcdHJldHVybiBbeyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVW5yZWFkYWJsZSwgb2Zmc2V0LCBsZW5ndGggfV07XG5cdFx0fVxuXG5cdFx0bGV0IGRhdGE6IFZTQnVmZmVyO1xuXHRcdHRyeSB7XG5cdFx0XHRkYXRhID0gZGVjb2RlQmFzZTY0KHJlc3VsdC5ib2R5LmRhdGEpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFt7IHR5cGU6IE1lbW9yeVJhbmdlVHlwZS5FcnJvciwgb2Zmc2V0LCBsZW5ndGgsIGVycm9yOiAnSW52YWxpZCBiYXNlNjQgZGF0YSBmcm9tIGRlYnVnIGFkYXB0ZXInIH1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVucmVhZGFibGUgPSByZXN1bHQuYm9keS51bnJlYWRhYmxlQnl0ZXMgfHwgMDtcblx0XHRjb25zdCBkYXRhTGVuZ3RoID0gbGVuZ3RoIC0gdW5yZWFkYWJsZTtcblx0XHRpZiAoZGF0YS5ieXRlTGVuZ3RoIDwgZGF0YUxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcGFkID0gVlNCdWZmZXIuYWxsb2MoZGF0YUxlbmd0aCAtIGRhdGEuYnl0ZUxlbmd0aCk7XG5cdFx0XHRwYWQuYnVmZmVyLmZpbGwoMCk7XG5cdFx0XHRkYXRhID0gVlNCdWZmZXIuY29uY2F0KFtkYXRhLCBwYWRdLCBkYXRhTGVuZ3RoKTtcblx0XHR9IGVsc2UgaWYgKGRhdGEuYnl0ZUxlbmd0aCA+IGRhdGFMZW5ndGgpIHtcblx0XHRcdGRhdGEgPSBkYXRhLnNsaWNlKDAsIGRhdGFMZW5ndGgpO1xuXHRcdH1cblxuXHRcdGlmICghdW5yZWFkYWJsZSkge1xuXHRcdFx0cmV0dXJuIFt7IHR5cGU6IE1lbW9yeVJhbmdlVHlwZS5WYWxpZCwgb2Zmc2V0LCBsZW5ndGgsIGRhdGEgfV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgdHlwZTogTWVtb3J5UmFuZ2VUeXBlLlZhbGlkLCBvZmZzZXQsIGxlbmd0aDogZGF0YUxlbmd0aCwgZGF0YSB9LFxuXHRcdFx0eyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVW5yZWFkYWJsZSwgb2Zmc2V0OiBvZmZzZXQgKyBkYXRhTGVuZ3RoLCBsZW5ndGg6IHVucmVhZGFibGUgfSxcblx0XHRdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHdyaXRlKG9mZnNldDogbnVtYmVyLCBkYXRhOiBWU0J1ZmZlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXNzaW9uLndyaXRlTWVtb3J5KHRoaXMubWVtb3J5UmVmZXJlbmNlLCBvZmZzZXQsIGVuY29kZUJhc2U2NChkYXRhKSwgdHJ1ZSk7XG5cdFx0Y29uc3Qgd3JpdHRlbiA9IHJlc3VsdD8uYm9keT8uYnl0ZXNXcml0dGVuID8/IGRhdGEuYnl0ZUxlbmd0aDtcblx0XHR0aGlzLmludmFsaWRhdGUob2Zmc2V0LCBvZmZzZXQgKyB3cml0dGVuKTtcblx0XHRyZXR1cm4gd3JpdHRlbjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgaW52YWxpZGF0ZShmcm9tT2Zmc2V0OiBudW1iZXIsIHRvT2Zmc2V0OiBudW1iZXIpIHtcblx0XHR0aGlzLmludmFsaWRhdGVFbWl0dGVyLmZpcmUoeyBmcm9tT2Zmc2V0LCB0b09mZnNldCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlbWVudCBpbXBsZW1lbnRzIElFbmFibGVtZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGVuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpZDogc3RyaW5nXG5cdCkgeyB9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUJyZWFrcG9pbnRTZXNzaW9uRGF0YSBleHRlbmRzIERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCB7XG5cdHN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50czogYm9vbGVhbjtcblx0c3VwcG9ydHNIaXRDb25kaXRpb25hbEJyZWFrcG9pbnRzOiBib29sZWFuO1xuXHRzdXBwb3J0c0xvZ1BvaW50czogYm9vbGVhbjtcblx0c3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzOiBib29sZWFuO1xuXHRzdXBwb3J0c0RhdGFCcmVha3BvaW50czogYm9vbGVhbjtcblx0c3VwcG9ydHNJbnN0cnVjdGlvbkJyZWFrcG9pbnRzOiBib29sZWFuO1xuXHRzZXNzaW9uSWQ6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gdG9CcmVha3BvaW50U2Vzc2lvbkRhdGEoZGF0YTogRGVidWdQcm90b2NvbC5CcmVha3BvaW50LCBjYXBhYmlsaXRpZXM6IERlYnVnUHJvdG9jb2wuQ2FwYWJpbGl0aWVzKTogSUJyZWFrcG9pbnRTZXNzaW9uRGF0YSB7XG5cdHJldHVybiBtaXhpbih7XG5cdFx0c3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzOiAhIWNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMsXG5cdFx0c3VwcG9ydHNIaXRDb25kaXRpb25hbEJyZWFrcG9pbnRzOiAhIWNhcGFiaWxpdGllcy5zdXBwb3J0c0hpdENvbmRpdGlvbmFsQnJlYWtwb2ludHMsXG5cdFx0c3VwcG9ydHNMb2dQb2ludHM6ICEhY2FwYWJpbGl0aWVzLnN1cHBvcnRzTG9nUG9pbnRzLFxuXHRcdHN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50czogISFjYXBhYmlsaXRpZXMuc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzLFxuXHRcdHN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzOiAhIWNhcGFiaWxpdGllcy5zdXBwb3J0c0RhdGFCcmVha3BvaW50cyxcblx0XHRzdXBwb3J0c0luc3RydWN0aW9uQnJlYWtwb2ludHM6ICEhY2FwYWJpbGl0aWVzLnN1cHBvcnRzSW5zdHJ1Y3Rpb25CcmVha3BvaW50c1xuXHR9LCBkYXRhKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQmFzZUJyZWFrcG9pbnRPcHRpb25zIHtcblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdGhpdENvbmRpdGlvbj86IHN0cmluZztcblx0Y29uZGl0aW9uPzogc3RyaW5nO1xuXHRsb2dNZXNzYWdlPzogc3RyaW5nO1xuXHRtb2RlPzogc3RyaW5nO1xuXHRtb2RlTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlQnJlYWtwb2ludCBleHRlbmRzIEVuYWJsZW1lbnQgaW1wbGVtZW50cyBJQmFzZUJyZWFrcG9pbnQge1xuXG5cdHByaXZhdGUgc2Vzc2lvbkRhdGEgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRTZXNzaW9uRGF0YT4oKTtcblx0cHJvdGVjdGVkIGRhdGE6IElCcmVha3BvaW50U2Vzc2lvbkRhdGEgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBoaXRDb25kaXRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGNvbmRpdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbG9nTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbW9kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgbW9kZUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRvcHRzOiBJQmFzZUJyZWFrcG9pbnRPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKG9wdHMuZW5hYmxlZCA/PyB0cnVlLCBpZCk7XG5cdFx0dGhpcy5jb25kaXRpb24gPSBvcHRzLmNvbmRpdGlvbjtcblx0XHR0aGlzLmhpdENvbmRpdGlvbiA9IG9wdHMuaGl0Q29uZGl0aW9uO1xuXHRcdHRoaXMubG9nTWVzc2FnZSA9IG9wdHMubG9nTWVzc2FnZTtcblx0XHR0aGlzLm1vZGUgPSBvcHRzLm1vZGU7XG5cdFx0dGhpcy5tb2RlTGFiZWwgPSBvcHRzLm1vZGVMYWJlbDtcblx0fVxuXG5cdHNldFNlc3Npb25EYXRhKHNlc3Npb25JZDogc3RyaW5nLCBkYXRhOiBJQnJlYWtwb2ludFNlc3Npb25EYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25EYXRhLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnNlc3Npb25JZCA9IHNlc3Npb25JZDtcblx0XHRcdHRoaXMuc2Vzc2lvbkRhdGEuc2V0KHNlc3Npb25JZCwgZGF0YSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsRGF0YSA9IEFycmF5LmZyb20odGhpcy5zZXNzaW9uRGF0YS52YWx1ZXMoKSk7XG5cdFx0Y29uc3QgdmVyaWZpZWREYXRhID0gZGlzdGluY3QoYWxsRGF0YS5maWx0ZXIoZCA9PiBkLnZlcmlmaWVkKSwgZCA9PiBgJHtkLmxpbmV9OiR7ZC5jb2x1bW59YCk7XG5cdFx0aWYgKHZlcmlmaWVkRGF0YS5sZW5ndGgpIHtcblx0XHRcdC8vIEluIGNhc2UgbXVsdGlwbGUgc2Vzc2lvbiB2ZXJpZmllZCB0aGUgYnJlYWtwb2ludCBhbmQgdGhleSBwcm92aWRlIGRpZmZlcmVudCBkYXRhIHNob3cgdGhlIGludGlhbCBkYXRhIHRoYXQgdGhlIHVzZXIgc2V0IChjb3JuZXIgY2FzZSlcblx0XHRcdHRoaXMuZGF0YSA9IHZlcmlmaWVkRGF0YS5sZW5ndGggPT09IDEgPyB2ZXJpZmllZERhdGFbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vIHNlc3Npb24gdmVyaWZpZWQgdGhlIGJyZWFrcG9pbnRcblx0XHRcdHRoaXMuZGF0YSA9IGFsbERhdGEubGVuZ3RoID8gYWxsRGF0YVswXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRhdGEubWVzc2FnZTtcblx0fVxuXG5cdGdldCB2ZXJpZmllZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhID8gdGhpcy5kYXRhLnZlcmlmaWVkIDogdHJ1ZTtcblx0fVxuXG5cdGdldCBzZXNzaW9uc1RoYXRWZXJpZmllZCgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgZGF0YV0gb2YgdGhpcy5zZXNzaW9uRGF0YSkge1xuXHRcdFx0aWYgKGRhdGEudmVyaWZpZWQpIHtcblx0XHRcdFx0c2Vzc2lvbklkcy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlc3Npb25JZHM7XG5cdH1cblxuXHRhYnN0cmFjdCBnZXQgc3VwcG9ydGVkKCk6IGJvb2xlYW47XG5cblx0Z2V0SWRGcm9tQWRhcHRlcihzZXNzaW9uSWQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuc2Vzc2lvbkRhdGEuZ2V0KHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIGRhdGEgPyBkYXRhLmlkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoc2Vzc2lvbklkOiBzdHJpbmcpOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLnNlc3Npb25EYXRhLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRjb25zdCBicDogRGVidWdQcm90b2NvbC5CcmVha3BvaW50ID0ge1xuXHRcdFx0XHRpZDogZGF0YS5pZCxcblx0XHRcdFx0dmVyaWZpZWQ6IGRhdGEudmVyaWZpZWQsXG5cdFx0XHRcdG1lc3NhZ2U6IGRhdGEubWVzc2FnZSxcblx0XHRcdFx0c291cmNlOiBkYXRhLnNvdXJjZSxcblx0XHRcdFx0bGluZTogZGF0YS5saW5lLFxuXHRcdFx0XHRjb2x1bW46IGRhdGEuY29sdW1uLFxuXHRcdFx0XHRlbmRMaW5lOiBkYXRhLmVuZExpbmUsXG5cdFx0XHRcdGVuZENvbHVtbjogZGF0YS5lbmRDb2x1bW4sXG5cdFx0XHRcdGluc3RydWN0aW9uUmVmZXJlbmNlOiBkYXRhLmluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdFx0XHRvZmZzZXQ6IGRhdGEub2Zmc2V0XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIGJwO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0dG9KU09OKCk6IElCYXNlQnJlYWtwb2ludE9wdGlvbnMgJiB7IGlkOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB0aGlzLmdldElkKCksXG5cdFx0XHRlbmFibGVkOiB0aGlzLmVuYWJsZWQsXG5cdFx0XHRjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLFxuXHRcdFx0aGl0Q29uZGl0aW9uOiB0aGlzLmhpdENvbmRpdGlvbixcblx0XHRcdGxvZ01lc3NhZ2U6IHRoaXMubG9nTWVzc2FnZSxcblx0XHRcdG1vZGU6IHRoaXMubW9kZSxcblx0XHRcdG1vZGVMYWJlbDogdGhpcy5tb2RlTGFiZWwsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCcmVha3BvaW50T3B0aW9ucyBleHRlbmRzIElCYXNlQnJlYWtwb2ludE9wdGlvbnMge1xuXHR1cmk6IHVyaTtcblx0bGluZU51bWJlcjogbnVtYmVyO1xuXHRjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZDtcblx0YWRhcHRlckRhdGE6IHVua25vd247XG5cdHRyaWdnZXJlZEJ5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50IGV4dGVuZHMgQmFzZUJyZWFrcG9pbnQgaW1wbGVtZW50cyBJQnJlYWtwb2ludCB7XG5cdHByaXZhdGUgc2Vzc2lvbnNEaWRUcmlnZ2VyPzogU2V0PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaTogdXJpO1xuXHRwcml2YXRlIF9hZGFwdGVyRGF0YTogdW5rbm93bjtcblx0cHJpdmF0ZSBfbGluZU51bWJlcjogbnVtYmVyO1xuXHRwcml2YXRlIF9jb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHVibGljIHRyaWdnZXJlZEJ5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0czogSUJyZWFrcG9pbnRPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0aWQgPSBnZW5lcmF0ZVV1aWQoKSxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdHMpO1xuXHRcdHRoaXMuX3VyaSA9IG9wdHMudXJpO1xuXHRcdHRoaXMuX2xpbmVOdW1iZXIgPSBvcHRzLmxpbmVOdW1iZXI7XG5cdFx0dGhpcy5fY29sdW1uID0gb3B0cy5jb2x1bW47XG5cdFx0dGhpcy5fYWRhcHRlckRhdGEgPSBvcHRzLmFkYXB0ZXJEYXRhO1xuXHRcdHRoaXMudHJpZ2dlcmVkQnkgPSBvcHRzLnRyaWdnZXJlZEJ5O1xuXHR9XG5cblx0dG9EQVAoKTogRGVidWdQcm90b2NvbC5Tb3VyY2VCcmVha3BvaW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZTogdGhpcy5zZXNzaW9uQWdub3N0aWNEYXRhLmxpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IHRoaXMuc2Vzc2lvbkFnbm9zdGljRGF0YS5jb2x1bW4sXG5cdFx0XHRjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLFxuXHRcdFx0aGl0Q29uZGl0aW9uOiB0aGlzLmhpdENvbmRpdGlvbixcblx0XHRcdGxvZ01lc3NhZ2U6IHRoaXMubG9nTWVzc2FnZSxcblx0XHRcdG1vZGU6IHRoaXMubW9kZVxuXHRcdH07XG5cdH1cblxuXHRnZXQgb3JpZ2luYWxVcmkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3VyaTtcblx0fVxuXG5cdGdldCBsaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmVyaWZpZWQgJiYgdGhpcy5kYXRhICYmIHR5cGVvZiB0aGlzLmRhdGEubGluZSA9PT0gJ251bWJlcicgPyB0aGlzLmRhdGEubGluZSA6IHRoaXMuX2xpbmVOdW1iZXI7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdmVyaWZpZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGF0YS52ZXJpZmllZCAmJiAhdGhpcy50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0aGlzLl91cmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0IHBlbmRpbmcoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50cmlnZ2VyZWRCeSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHVyaSgpOiB1cmkge1xuXHRcdHJldHVybiB0aGlzLnZlcmlmaWVkICYmIHRoaXMuZGF0YSAmJiB0aGlzLmRhdGEuc291cmNlID8gZ2V0VXJpRnJvbVNvdXJjZSh0aGlzLmRhdGEuc291cmNlLCB0aGlzLmRhdGEuc291cmNlLnBhdGgsIHRoaXMuZGF0YS5zZXNzaW9uSWQsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpIDogdGhpcy5fdXJpO1xuXHR9XG5cblx0Z2V0IGNvbHVtbigpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZlcmlmaWVkICYmIHRoaXMuZGF0YSAmJiB0eXBlb2YgdGhpcy5kYXRhLmNvbHVtbiA9PT0gJ251bWJlcicgPyB0aGlzLmRhdGEuY29sdW1uIDogdGhpcy5fY29sdW1uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IG1lc3NhZ2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eSh0aGlzLnVyaSkpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2JyZWFrcG9pbnREaXJ0eWRIb3ZlcicsIFwiVW52ZXJpZmllZCBicmVha3BvaW50LiBGaWxlIGlzIG1vZGlmaWVkLCBwbGVhc2UgcmVzdGFydCBkZWJ1ZyBzZXNzaW9uLlwiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIubWVzc2FnZTtcblx0fVxuXG5cdGdldCBhZGFwdGVyRGF0YSgpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhICYmIHRoaXMuZGF0YS5zb3VyY2UgJiYgdGhpcy5kYXRhLnNvdXJjZS5hZGFwdGVyRGF0YSA/IHRoaXMuZGF0YS5zb3VyY2UuYWRhcHRlckRhdGEgOiB0aGlzLl9hZGFwdGVyRGF0YTtcblx0fVxuXG5cdGdldCBlbmRMaW5lTnVtYmVyKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmVyaWZpZWQgJiYgdGhpcy5kYXRhID8gdGhpcy5kYXRhLmVuZExpbmUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZW5kQ29sdW1uKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmVyaWZpZWQgJiYgdGhpcy5kYXRhID8gdGhpcy5kYXRhLmVuZENvbHVtbiA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBzZXNzaW9uQWdub3N0aWNEYXRhKCk6IHsgbGluZU51bWJlcjogbnVtYmVyOyBjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZU51bWJlcjogdGhpcy5fbGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogdGhpcy5fY29sdW1uXG5cdFx0fTtcblx0fVxuXG5cdGdldCBzdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmRhdGEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5sb2dNZXNzYWdlICYmICF0aGlzLmRhdGEuc3VwcG9ydHNMb2dQb2ludHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29uZGl0aW9uICYmICF0aGlzLmRhdGEuc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmhpdENvbmRpdGlvbiAmJiAhdGhpcy5kYXRhLnN1cHBvcnRzSGl0Q29uZGl0aW9uYWxCcmVha3BvaW50cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkOiBzdHJpbmcsIGRhdGE6IElCcmVha3BvaW50U2Vzc2lvbkRhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRzdXBlci5zZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQsIGRhdGEpO1xuXHRcdGlmICghdGhpcy5fYWRhcHRlckRhdGEpIHtcblx0XHRcdHRoaXMuX2FkYXB0ZXJEYXRhID0gdGhpcy5hZGFwdGVyRGF0YTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB0b0pTT04oKTogSUJyZWFrcG9pbnRPcHRpb25zICYgeyBpZDogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdXBlci50b0pTT04oKSxcblx0XHRcdHVyaTogdGhpcy5fdXJpLFxuXHRcdFx0bGluZU51bWJlcjogdGhpcy5fbGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogdGhpcy5fY29sdW1uLFxuXHRcdFx0YWRhcHRlckRhdGE6IHRoaXMuYWRhcHRlckRhdGEsXG5cdFx0XHR0cmlnZ2VyZWRCeTogdGhpcy50cmlnZ2VyZWRCeSxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7cmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkodGhpcy51cmkpfSAke3RoaXMubGluZU51bWJlcn1gO1xuXHR9XG5cblx0cHVibGljIHNldFNlc3Npb25EaWRUcmlnZ2VyKHNlc3Npb25JZDogc3RyaW5nLCBkaWRUcmlnZ2VyID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmIChkaWRUcmlnZ2VyKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zRGlkVHJpZ2dlciA/Pz0gbmV3IFNldCgpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc0RpZFRyaWdnZXIuYWRkKHNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNEaWRUcmlnZ2VyPy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Vzc2lvbkRpZFRyaWdnZXIoc2Vzc2lvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLnNlc3Npb25zRGlkVHJpZ2dlcj8uaGFzKHNlc3Npb25JZCk7XG5cdH1cblxuXHR1cGRhdGUoZGF0YTogSUJyZWFrcG9pbnRVcGRhdGVEYXRhKTogdm9pZCB7XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2xpbmVOdW1iZXInKSAmJiAhaXNVbmRlZmluZWRPck51bGwoZGF0YS5saW5lTnVtYmVyKSkge1xuXHRcdFx0dGhpcy5fbGluZU51bWJlciA9IGRhdGEubGluZU51bWJlcjtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2NvbHVtbicpKSB7XG5cdFx0XHR0aGlzLl9jb2x1bW4gPSBkYXRhLmNvbHVtbjtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ2NvbmRpdGlvbicpKSB7XG5cdFx0XHR0aGlzLmNvbmRpdGlvbiA9IGRhdGEuY29uZGl0aW9uO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eSgnaGl0Q29uZGl0aW9uJykpIHtcblx0XHRcdHRoaXMuaGl0Q29uZGl0aW9uID0gZGF0YS5oaXRDb25kaXRpb247XG5cdFx0fVxuXHRcdGlmIChkYXRhLmhhc093blByb3BlcnR5KCdsb2dNZXNzYWdlJykpIHtcblx0XHRcdHRoaXMubG9nTWVzc2FnZSA9IGRhdGEubG9nTWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ21vZGUnKSkge1xuXHRcdFx0dGhpcy5tb2RlID0gZGF0YS5tb2RlO1xuXHRcdFx0dGhpcy5tb2RlTGFiZWwgPSBkYXRhLm1vZGVMYWJlbDtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzT3duUHJvcGVydHkoJ3RyaWdnZXJlZEJ5JykpIHtcblx0XHRcdHRoaXMudHJpZ2dlcmVkQnkgPSBkYXRhLnRyaWdnZXJlZEJ5O1xuXHRcdFx0dGhpcy5zZXNzaW9uc0RpZFRyaWdnZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZ1bmN0aW9uQnJlYWtwb2ludE9wdGlvbnMgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRPcHRpb25zIHtcblx0bmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRnVuY3Rpb25CcmVha3BvaW50IGV4dGVuZHMgQmFzZUJyZWFrcG9pbnQgaW1wbGVtZW50cyBJRnVuY3Rpb25CcmVha3BvaW50IHtcblx0cHVibGljIG5hbWU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRzOiBJRnVuY3Rpb25CcmVha3BvaW50T3B0aW9ucyxcblx0XHRpZCA9IGdlbmVyYXRlVXVpZCgpXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBvcHRzKTtcblx0XHR0aGlzLm5hbWUgPSBvcHRzLm5hbWU7XG5cdH1cblxuXHR0b0RBUCgpOiBEZWJ1Z1Byb3RvY29sLkZ1bmN0aW9uQnJlYWtwb2ludCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRoaXRDb25kaXRpb246IHRoaXMuaGl0Q29uZGl0aW9uLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSB0b0pTT04oKTogSUZ1bmN0aW9uQnJlYWtwb2ludE9wdGlvbnMgJiB7IGlkOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN1cGVyLnRvSlNPTigpLFxuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdH07XG5cdH1cblxuXHRnZXQgc3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kYXRhLnN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cztcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubmFtZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEYXRhQnJlYWtwb2ludE9wdGlvbnMgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRPcHRpb25zIHtcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0c3JjOiBEYXRhQnJlYWtwb2ludFNvdXJjZTtcblx0Y2FuUGVyc2lzdDogYm9vbGVhbjtcblx0aW5pdGlhbFNlc3Npb25EYXRhPzogeyBzZXNzaW9uOiBJRGVidWdTZXNzaW9uOyBkYXRhSWQ6IHN0cmluZyB9O1xuXHRhY2Nlc3NUeXBlczogRGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVbXSB8IHVuZGVmaW5lZDtcblx0YWNjZXNzVHlwZTogRGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGU7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhQnJlYWtwb2ludCBleHRlbmRzIEJhc2VCcmVha3BvaW50IGltcGxlbWVudHMgSURhdGFCcmVha3BvaW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uRGF0YUlkRm9yQWRkciA9IG5ldyBXZWFrTWFwPElEZWJ1Z1Nlc3Npb24sIHN0cmluZyB8IG51bGw+KCk7XG5cblx0cHVibGljIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBzcmM6IERhdGFCcmVha3BvaW50U291cmNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FuUGVyc2lzdDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGFjY2Vzc1R5cGVzOiBEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50QWNjZXNzVHlwZVtdIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWNjZXNzVHlwZTogRGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0czogSURhdGFCcmVha3BvaW50T3B0aW9ucyxcblx0XHRpZCA9IGdlbmVyYXRlVXVpZCgpXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBvcHRzKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb3B0cy5kZXNjcmlwdGlvbjtcblx0XHRpZiAoJ2RhdGFJZCcgaW4gb3B0cykgeyAvLyAgYmFjayBjb21wYXQgd2l0aCBvbGQgc2F2ZWQgdmFyaWFibGVzIGluIDEuODdcblx0XHRcdG9wdHMuc3JjID0geyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogb3B0cy5kYXRhSWQgYXMgc3RyaW5nIH07XG5cdFx0fVxuXHRcdHRoaXMuc3JjID0gb3B0cy5zcmM7XG5cdFx0dGhpcy5jYW5QZXJzaXN0ID0gb3B0cy5jYW5QZXJzaXN0O1xuXHRcdHRoaXMuYWNjZXNzVHlwZXMgPSBvcHRzLmFjY2Vzc1R5cGVzO1xuXHRcdHRoaXMuYWNjZXNzVHlwZSA9IG9wdHMuYWNjZXNzVHlwZTtcblx0XHRpZiAob3B0cy5pbml0aWFsU2Vzc2lvbkRhdGEpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbkRhdGFJZEZvckFkZHIuc2V0KG9wdHMuaW5pdGlhbFNlc3Npb25EYXRhLnNlc3Npb24sIG9wdHMuaW5pdGlhbFNlc3Npb25EYXRhLmRhdGFJZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdG9EQVAoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5EYXRhQnJlYWtwb2ludCB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBkYXRhSWQ6IHN0cmluZztcblx0XHRpZiAodGhpcy5zcmMudHlwZSA9PT0gRGF0YUJyZWFrcG9pbnRTZXRUeXBlLlZhcmlhYmxlKSB7XG5cdFx0XHRkYXRhSWQgPSB0aGlzLnNyYy5kYXRhSWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBzZXNzaW9uRGF0YUlkID0gdGhpcy5zZXNzaW9uRGF0YUlkRm9yQWRkci5nZXQoc2Vzc2lvbik7XG5cdFx0XHRpZiAoIXNlc3Npb25EYXRhSWQpIHtcblx0XHRcdFx0c2Vzc2lvbkRhdGFJZCA9IChhd2FpdCBzZXNzaW9uLmRhdGFCeXRlc0JyZWFrcG9pbnRJbmZvKHRoaXMuc3JjLmFkZHJlc3MsIHRoaXMuc3JjLmJ5dGVzKSk/LmRhdGFJZDtcblx0XHRcdFx0aWYgKCFzZXNzaW9uRGF0YUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNlc3Npb25EYXRhSWRGb3JBZGRyLnNldChzZXNzaW9uLCBzZXNzaW9uRGF0YUlkKTtcblx0XHRcdH1cblx0XHRcdGRhdGFJZCA9IHNlc3Npb25EYXRhSWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGFJZCxcblx0XHRcdGFjY2Vzc1R5cGU6IHRoaXMuYWNjZXNzVHlwZSxcblx0XHRcdGNvbmRpdGlvbjogdGhpcy5jb25kaXRpb24sXG5cdFx0XHRoaXRDb25kaXRpb246IHRoaXMuaGl0Q29uZGl0aW9uLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSB0b0pTT04oKTogSURhdGFCcmVha3BvaW50T3B0aW9ucyAmIHsgaWQ6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3VwZXIudG9KU09OKCksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdHNyYzogdGhpcy5zcmMsXG5cdFx0XHRhY2Nlc3NUeXBlczogdGhpcy5hY2Nlc3NUeXBlcyxcblx0XHRcdGFjY2Vzc1R5cGU6IHRoaXMuYWNjZXNzVHlwZSxcblx0XHRcdGNhblBlcnNpc3Q6IHRoaXMuY2FuUGVyc2lzdCxcblx0XHR9O1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZGF0YSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5zdXBwb3J0c0RhdGFCcmVha3BvaW50cztcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZGVzY3JpcHRpb247XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXhjZXB0aW9uQnJlYWtwb2ludE9wdGlvbnMgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRPcHRpb25zIHtcblx0ZmlsdGVyOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHN1cHBvcnRzQ29uZGl0aW9uOiBib29sZWFuO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb25kaXRpb25EZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRmYWxsYmFjaz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBFeGNlcHRpb25CcmVha3BvaW50IGV4dGVuZHMgQmFzZUJyZWFrcG9pbnQgaW1wbGVtZW50cyBJRXhjZXB0aW9uQnJlYWtwb2ludCB7XG5cblx0cHJpdmF0ZSBzdXBwb3J0ZWRTZXNzaW9uczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0cHVibGljIHJlYWRvbmx5IGZpbHRlcjogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHN1cHBvcnRzQ29uZGl0aW9uOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGNvbmRpdGlvbkRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmFsbGJhY2s6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludE9wdGlvbnMsXG5cdFx0aWQgPSBnZW5lcmF0ZVV1aWQoKSxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdHMpO1xuXHRcdHRoaXMuZmlsdGVyID0gb3B0cy5maWx0ZXI7XG5cdFx0dGhpcy5sYWJlbCA9IG9wdHMubGFiZWw7XG5cdFx0dGhpcy5zdXBwb3J0c0NvbmRpdGlvbiA9IG9wdHMuc3VwcG9ydHNDb25kaXRpb247XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IG9wdHMuZGVzY3JpcHRpb247XG5cdFx0dGhpcy5jb25kaXRpb25EZXNjcmlwdGlvbiA9IG9wdHMuY29uZGl0aW9uRGVzY3JpcHRpb247XG5cdFx0dGhpcy5mYWxsYmFjayA9IG9wdHMuZmFsbGJhY2sgfHwgZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSB0b0pTT04oKTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRPcHRpb25zICYgeyBpZDogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdXBlci50b0pTT04oKSxcblx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRsYWJlbDogdGhpcy5sYWJlbCxcblx0XHRcdGVuYWJsZWQ6IHRoaXMuZW5hYmxlZCxcblx0XHRcdHN1cHBvcnRzQ29uZGl0aW9uOiB0aGlzLnN1cHBvcnRzQ29uZGl0aW9uLFxuXHRcdFx0Y29uZGl0aW9uRGVzY3JpcHRpb246IHRoaXMuY29uZGl0aW9uRGVzY3JpcHRpb24sXG5cdFx0XHRjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLFxuXHRcdFx0ZmFsbGJhY2s6IHRoaXMuZmFsbGJhY2ssXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHR9O1xuXHR9XG5cblx0c2V0U3VwcG9ydGVkU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgc3VwcG9ydGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHN1cHBvcnRlZCkge1xuXHRcdFx0dGhpcy5zdXBwb3J0ZWRTZXNzaW9ucy5hZGQoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLnN1cHBvcnRlZFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVc2VkIHRvIHNwZWNpZnkgd2hpY2ggYnJlYWtwb2ludHMgdG8gc2hvdyB3aGVuIG5vIHNlc3Npb24gaXMgc3BlY2lmaWVkLlxuXHQgKiBVc2VmdWwgd2hlbiBubyBzZXNzaW9uIGlzIGFjdGl2ZSBhbmQgd2Ugd2FudCB0byBzaG93IHRoZSBleGNlcHRpb24gYnJlYWtwb2ludHMgZnJvbSB0aGUgbGFzdCBzZXNzaW9uLlxuXHQgKi9cblx0c2V0RmFsbGJhY2soaXNGYWxsYmFjazogYm9vbGVhbikge1xuXHRcdHRoaXMuZmFsbGJhY2sgPSBpc0ZhbGxiYWNrO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgaWYgdGhlIGJyZWFrcG9pbnQgaXMgYXBwbGljYWJsZSBmb3IgdGhlIHNwZWNpZmllZCBzZXNzaW9uLlxuXHQgKiBJZiBzZXNzaW9uSWQgaXMgdW5kZWZpbmVkLCByZXR1cm5zIHRydWUgaWYgdGhpcyBicmVha3BvaW50IGlzIGEgZmFsbGJhY2sgYnJlYWtwb2ludC5cblx0ICovXG5cdGlzU3VwcG9ydGVkU2Vzc2lvbihzZXNzaW9uSWQ/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2Vzc2lvbklkID8gdGhpcy5zdXBwb3J0ZWRTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSA6IHRoaXMuZmFsbGJhY2s7XG5cdH1cblxuXHRtYXRjaGVzKGZpbHRlcjogRGVidWdQcm90b2NvbC5FeGNlcHRpb25CcmVha3BvaW50c0ZpbHRlcikge1xuXHRcdHJldHVybiB0aGlzLmZpbHRlciA9PT0gZmlsdGVyLmZpbHRlclxuXHRcdFx0JiYgdGhpcy5sYWJlbCA9PT0gZmlsdGVyLmxhYmVsXG5cdFx0XHQmJiB0aGlzLnN1cHBvcnRzQ29uZGl0aW9uID09PSAhIWZpbHRlci5zdXBwb3J0c0NvbmRpdGlvblxuXHRcdFx0JiYgdGhpcy5jb25kaXRpb25EZXNjcmlwdGlvbiA9PT0gZmlsdGVyLmNvbmRpdGlvbkRlc2NyaXB0aW9uXG5cdFx0XHQmJiB0aGlzLmRlc2NyaXB0aW9uID09PSBmaWx0ZXIuZGVzY3JpcHRpb247XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUluc3RydWN0aW9uQnJlYWtwb2ludE9wdGlvbnMgZXh0ZW5kcyBJQmFzZUJyZWFrcG9pbnRPcHRpb25zIHtcblx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHN0cmluZztcblx0b2Zmc2V0OiBudW1iZXI7XG5cdGNhblBlcnNpc3Q6IGJvb2xlYW47XG5cdGFkZHJlc3M6IGJpZ2ludDtcbn1cblxuZXhwb3J0IGNsYXNzIEluc3RydWN0aW9uQnJlYWtwb2ludCBleHRlbmRzIEJhc2VCcmVha3BvaW50IGltcGxlbWVudHMgSUluc3RydWN0aW9uQnJlYWtwb2ludCB7XG5cdHB1YmxpYyByZWFkb25seSBpbnN0cnVjdGlvblJlZmVyZW5jZTogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBjYW5QZXJzaXN0OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWRkcmVzczogYmlnaW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdHM6IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRPcHRpb25zLFxuXHRcdGlkID0gZ2VuZXJhdGVVdWlkKClcblx0KSB7XG5cdFx0c3VwZXIoaWQsIG9wdHMpO1xuXHRcdHRoaXMuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgPSBvcHRzLmluc3RydWN0aW9uUmVmZXJlbmNlO1xuXHRcdHRoaXMub2Zmc2V0ID0gb3B0cy5vZmZzZXQ7XG5cdFx0dGhpcy5jYW5QZXJzaXN0ID0gb3B0cy5jYW5QZXJzaXN0O1xuXHRcdHRoaXMuYWRkcmVzcyA9IG9wdHMuYWRkcmVzcztcblx0fVxuXG5cdHRvREFQKCk6IERlYnVnUHJvdG9jb2wuSW5zdHJ1Y3Rpb25CcmVha3BvaW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6IHRoaXMuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsXG5cdFx0XHRjb25kaXRpb246IHRoaXMuY29uZGl0aW9uLFxuXHRcdFx0aGl0Q29uZGl0aW9uOiB0aGlzLmhpdENvbmRpdGlvbixcblx0XHRcdG1vZGU6IHRoaXMubW9kZSxcblx0XHRcdG9mZnNldDogdGhpcy5vZmZzZXQsXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50T3B0aW9ucyAmIHsgaWQ6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3VwZXIudG9KU09OKCksXG5cdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZTogdGhpcy5pbnN0cnVjdGlvblJlZmVyZW5jZSxcblx0XHRcdG9mZnNldDogdGhpcy5vZmZzZXQsXG5cdFx0XHRjYW5QZXJzaXN0OiB0aGlzLmNhblBlcnNpc3QsXG5cdFx0XHRhZGRyZXNzOiB0aGlzLmFkZHJlc3MsXG5cdFx0fTtcblx0fVxuXG5cdGdldCBzdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmRhdGEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRhdGEuc3VwcG9ydHNJbnN0cnVjdGlvbkJyZWFrcG9pbnRzO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0cnVjdGlvblJlZmVyZW5jZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGhyZWFkQW5kU2Vzc2lvbklkcyBpbXBsZW1lbnRzIElUcmVlRWxlbWVudCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBzZXNzaW9uSWQ6IHN0cmluZywgcHVibGljIHRocmVhZElkOiBudW1iZXIpIHsgfVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuc2Vzc2lvbklkfToke3RoaXMudGhyZWFkSWR9YDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUJyZWFrcG9pbnRNb2RlSW50ZXJuYWwgZXh0ZW5kcyBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRNb2RlIHtcblx0Zmlyc3RGcm9tRGVidWdUeXBlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEZWJ1Z01vZGVsIHtcblxuXHRwcml2YXRlIHNlc3Npb25zOiBJRGVidWdTZXNzaW9uW107XG5cdHByaXZhdGUgc2NoZWR1bGVycyA9IG5ldyBNYXA8c3RyaW5nLCB7IHNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjsgY29tcGxldGVEZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IH0+KCk7XG5cdHByaXZhdGUgYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSB0cnVlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUJyZWFrcG9pbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQgfCB1bmRlZmluZWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNhbGxTdGFjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNhbGxTdGFja0ZpcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSh1bmRlZmluZWQpO1xuXHR9LCAxMDApKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvblZhbHVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icmVha3BvaW50TW9kZXMgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRNb2RlSW50ZXJuYWw+KCk7XG5cdHByaXZhdGUgYnJlYWtwb2ludHMhOiBCcmVha3BvaW50W107XG5cdHByaXZhdGUgZnVuY3Rpb25CcmVha3BvaW50cyE6IEZ1bmN0aW9uQnJlYWtwb2ludFtdO1xuXHRwcml2YXRlIGV4Y2VwdGlvbkJyZWFrcG9pbnRzITogRXhjZXB0aW9uQnJlYWtwb2ludFtdO1xuXHRwcml2YXRlIGRhdGFCcmVha3BvaW50cyE6IERhdGFCcmVha3BvaW50W107XG5cdHByaXZhdGUgd2F0Y2hFeHByZXNzaW9ucyE6IEV4cHJlc3Npb25bXTtcblx0cHJpdmF0ZSBpbnN0cnVjdGlvbkJyZWFrcG9pbnRzOiBJbnN0cnVjdGlvbkJyZWFrcG9pbnRbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZWJ1Z1N0b3JhZ2U6IERlYnVnU3RvcmFnZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5icmVha3BvaW50cyA9IGRlYnVnU3RvcmFnZS5icmVha3BvaW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMgPSBkZWJ1Z1N0b3JhZ2UuZnVuY3Rpb25CcmVha3BvaW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gZGVidWdTdG9yYWdlLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZGF0YUJyZWFrcG9pbnRzID0gZGVidWdTdG9yYWdlLmRhdGFCcmVha3BvaW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnMgPSBkZWJ1Z1N0b3JhZ2Uud2F0Y2hFeHByZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyYWNrU2V0Q2hhbmdlcyhcblx0XHRcdCgpID0+IG5ldyBTZXQodGhpcy53YXRjaEV4cHJlc3Npb25zKSxcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zLFxuXHRcdFx0KHdlKSA9PiB3ZS5vbkRpZENoYW5nZVZhbHVlKChlKSA9PiB0aGlzLl9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvblZhbHVlLmZpcmUoZSkpKVxuXHRcdCk7XG5cblx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMgPSBbXTtcblx0XHR0aGlzLnNlc3Npb25zID0gW107XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAncm9vdCc7XG5cdH1cblxuXHRnZXRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpbmNsdWRlSW5hY3RpdmUgPSBmYWxzZSk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25zKGluY2x1ZGVJbmFjdGl2ZSkuZmluZChzID0+IHMuZ2V0SWQoKSA9PT0gc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFNlc3Npb25zKGluY2x1ZGVJbmFjdGl2ZSA9IGZhbHNlKTogSURlYnVnU2Vzc2lvbltdIHtcblx0XHQvLyBCeSBkZWZhdWx0IGRvIG5vdCByZXR1cm4gaW5hY3RpdmUgc2Vzc2lvbnMuXG5cdFx0Ly8gSG93ZXZlciB3ZSBhcmUgc3RpbGwgaG9sZGluZyBvbnRvIGluYWN0aXZlIHNlc3Npb25zIGR1ZSB0byByZXBsIGFuZCBkZWJ1ZyBzZXJ2aWNlIHNlc3Npb24gcmV2aXZhbCAoZWggc2NlbmFyaW8pXG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnMuZmlsdGVyKHMgPT4gaW5jbHVkZUluYWN0aXZlIHx8IHMuc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkRGlzcG9zZVNlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgbmV3U2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChzZXNzaW9uLnN0YXRlICE9PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5jb25maWd1cmF0aW9uLm5hbWUgPT09IG5ld1Nlc3Npb24uY29uZmlndXJhdGlvbi5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKG5ld1Nlc3Npb24ucGFyZW50U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRsZXQgcm9vdFNlc3Npb24gPSBzZXNzaW9uO1xuXHRcdHdoaWxlIChyb290U2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRyb290U2Vzc2lvbiA9IHJvb3RTZXNzaW9uLnBhcmVudFNlc3Npb247XG5cdFx0fVxuXHRcdHJldHVybiByb290U2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUgJiYgcm9vdFNlc3Npb24uY29uZmlndXJhdGlvbi5uYW1lID09PSBuZXdTZXNzaW9uLmNvbmZpZ3VyYXRpb24ubmFtZTtcblx0fVxuXG5cdGFkZFNlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnMgPSB0aGlzLnNlc3Npb25zLmZpbHRlcihzID0+IHtcblx0XHRcdGlmIChzLmdldElkKCkgPT09IHNlc3Npb24uZ2V0SWQoKSkge1xuXHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gZGUtZHVwZSBpZiBhIHNlc3Npb24gaXMgcmUtaW5pdGlhbGl6ZWQuIEluIGNhc2Ugb2YgRUggZGVidWdnaW5nIHdlIGFyZSBhZGRpbmcgYSBzZXNzaW9uIGFnYWluIGFmdGVyIGFuIGF0dGFjaC5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc2hvdWxkRGlzcG9zZVNlc3Npb24ocywgc2Vzc2lvbikpIHtcblx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRvIHJlbW92ZSBhbGwgaW5hY3RpdmUgc2Vzc2lvbnMgdGhhdCBhcmUgdXNpbmcgdGhlIHNhbWUgY29uZmlndXJhdGlvbiBhcyB0aGUgbmV3IHNlc3Npb25cblx0XHRcdFx0cy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRsZXQgaSA9IDE7XG5cdFx0d2hpbGUgKHRoaXMuc2Vzc2lvbnMuc29tZShzID0+IHMuZ2V0TGFiZWwoKSA9PT0gc2Vzc2lvbi5nZXRMYWJlbCgpKSkge1xuXHRcdFx0c2Vzc2lvbi5zZXROYW1lKGAke3Nlc3Npb24uY29uZmlndXJhdGlvbi5uYW1lfSAkeysraX1gKTtcblx0XHR9XG5cblx0XHRsZXQgaW5kZXggPSAtMTtcblx0XHRpZiAoc2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhhdCBjaGlsZCBzZXNzaW9ucyBhcmUgcGxhY2VkIGFmdGVyIHRoZSBwYXJlbnQgc2Vzc2lvblxuXHRcdFx0aW5kZXggPSB0aGlzLnNlc3Npb25zLmZpbmRMYXN0SW5kZXgocyA9PiBzLnBhcmVudFNlc3Npb24gPT09IHNlc3Npb24ucGFyZW50U2Vzc2lvbiB8fCBzID09PSBzZXNzaW9uLnBhcmVudFNlc3Npb24pO1xuXHRcdH1cblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5zZXNzaW9ucy5zcGxpY2UoaW5kZXggKyAxLCAwLCBzZXNzaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXNzaW9ucy5wdXNoKHNlc3Npb24pO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VCcmVha3BvaW50cygpOiBFdmVudDxJQnJlYWtwb2ludHNDaGFuZ2VFdmVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ2FsbFN0YWNrKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25zKCk6IEV2ZW50PElFeHByZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvblZhbHVlKCk6IEV2ZW50PElFeHByZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9uVmFsdWUuZXZlbnQ7XG5cdH1cblxuXHRyYXdVcGRhdGUoZGF0YTogSVJhd01vZGVsVXBkYXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZmluZChwID0+IHAuZ2V0SWQoKSA9PT0gZGF0YS5zZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uLnJhd1VwZGF0ZShkYXRhKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhclRocmVhZHMoaWQ6IHN0cmluZywgcmVtb3ZlVGhyZWFkczogYm9vbGVhbiwgcmVmZXJlbmNlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5maW5kKHAgPT4gcC5nZXRJZCgpID09PSBpZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGxldCB0aHJlYWRzOiBJVGhyZWFkW107XG5cdFx0XHRpZiAocmVmZXJlbmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyZWFkcyA9IHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGhyZWFkID0gc2Vzc2lvbi5nZXRUaHJlYWQocmVmZXJlbmNlKTtcblx0XHRcdFx0dGhyZWFkcyA9IHRocmVhZCAhPT0gdW5kZWZpbmVkID8gW3RocmVhZF0gOiBbXTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIHRocmVhZHMpIHtcblx0XHRcdFx0Y29uc3QgdGhyZWFkSWQgPSB0aHJlYWQuZ2V0SWQoKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLnNjaGVkdWxlcnMuZ2V0KHRocmVhZElkKTtcblx0XHRcdFx0aWYgKGVudHJ5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRlbnRyeS5zY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGVudHJ5LmNvbXBsZXRlRGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlcnMuZGVsZXRlKHRocmVhZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzZXNzaW9uLmNsZWFyVGhyZWFkcyhyZW1vdmVUaHJlYWRzLCByZWZlcmVuY2UpO1xuXHRcdFx0aWYgKCF0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFja0ZpcmUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFja0ZpcmUuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBjYWxsIHN0YWNrIGFuZCBub3RpZnkgdGhlIGNhbGwgc3RhY2sgdmlldyB0aGF0IGNoYW5nZXMgaGF2ZSBvY2N1cnJlZC5cblx0ICovXG5cdGFzeW5jIGZldGNoQ2FsbHN0YWNrKHRocmVhZDogSVRocmVhZCwgbGV2ZWxzPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoKDxUaHJlYWQ+dGhyZWFkKS5yZWFjaGVkRW5kT2ZDYWxsU3RhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b3RhbEZyYW1lcyA9IHRocmVhZC5zdG9wcGVkRGV0YWlscz8udG90YWxGcmFtZXM7XG5cdFx0Y29uc3QgcmVtYWluaW5nRnJhbWVzID0gKHR5cGVvZiB0b3RhbEZyYW1lcyA9PT0gJ251bWJlcicpID8gKHRvdGFsRnJhbWVzIC0gdGhyZWFkLmdldENhbGxTdGFjaygpLmxlbmd0aCkgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIWxldmVscyB8fCAocmVtYWluaW5nRnJhbWVzICYmIGxldmVscyA+IHJlbWFpbmluZ0ZyYW1lcykpIHtcblx0XHRcdGxldmVscyA9IHJlbWFpbmluZ0ZyYW1lcztcblx0XHR9XG5cblx0XHRpZiAobGV2ZWxzICYmIGxldmVscyA+IDApIHtcblx0XHRcdGF3YWl0ICg8VGhyZWFkPnRocmVhZCkuZmV0Y2hDYWxsU3RhY2sobGV2ZWxzKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrLmZpcmUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZWZyZXNoVG9wT2ZDYWxsc3RhY2sodGhyZWFkOiBUaHJlYWQsIGZldGNoRnVsbFN0YWNrID0gdHJ1ZSk6IHsgdG9wQ2FsbFN0YWNrOiBQcm9taXNlPHZvaWQ+OyB3aG9sZUNhbGxTdGFjazogUHJvbWlzZTx2b2lkPiB9IHtcblx0XHRpZiAodGhyZWFkLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGVsYXllZFN0YWNrVHJhY2VMb2FkaW5nKSB7XG5cdFx0XHQvLyBGb3IgaW1wcm92ZWQgcGVyZm9ybWFuY2UgbG9hZCB0aGUgZmlyc3Qgc3RhY2sgZnJhbWUgYW5kIHRoZW4gbG9hZCB0aGUgcmVzdCBhc3luYy5cblx0XHRcdGxldCB0b3BDYWxsU3RhY2sgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGNvbnN0IHdob2xlQ2FsbFN0YWNrID0gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdFx0dG9wQ2FsbFN0YWNrID0gdGhyZWFkLmZldGNoQ2FsbFN0YWNrKDEpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghZmV0Y2hGdWxsU3RhY2spIHtcblx0XHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FsbFN0YWNrLmZpcmUoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuc2NoZWR1bGVycy5oYXModGhyZWFkLmdldElkKCkpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVycy5zZXQodGhyZWFkLmdldElkKCksIHtcblx0XHRcdFx0XHRcdFx0Y29tcGxldGVEZWZlcnJlZDogZGVmZXJyZWQsXG5cdFx0XHRcdFx0XHRcdHNjaGVkdWxlcjogbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRocmVhZC5mZXRjaENhbGxTdGFjaygxOSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBzdGFsZSA9IHRocmVhZC5nZXRTdGFsZUNhbGxTdGFjaygpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRocmVhZC5nZXRDYWxsU3RhY2soKTtcblx0XHRcdFx0XHRcdFx0XHRcdGxldCBib3R0b21PZkNhbGxTdGFja0NoYW5nZWQgPSBzdGFsZS5sZW5ndGggIT09IGN1cnJlbnQubGVuZ3RoO1xuXHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBzdGFsZS5sZW5ndGggJiYgIWJvdHRvbU9mQ2FsbFN0YWNrQ2hhbmdlZDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvdHRvbU9mQ2FsbFN0YWNrQ2hhbmdlZCA9ICFzdGFsZVtpXS5lcXVhbHMoY3VycmVudFtpXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdGlmIChib3R0b21PZkNhbGxTdGFja0NoYW5nZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVycy5kZWxldGUodGhyZWFkLmdldElkKCkpO1xuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9LCA0MjApXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuc2NoZWR1bGVycy5nZXQodGhyZWFkLmdldElkKCkpITtcblx0XHRcdFx0XHRlbnRyeS5zY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdFx0XHRlbnRyeS5jb21wbGV0ZURlZmVycmVkLnAudGhlbihjLCBlKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhbGxTdGFjay5maXJlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7IHRvcENhbGxTdGFjaywgd2hvbGVDYWxsU3RhY2sgfTtcblx0XHR9XG5cblx0XHRjb25zdCB3aG9sZUNhbGxTdGFjayA9IHRocmVhZC5mZXRjaENhbGxTdGFjaygpO1xuXHRcdHJldHVybiB7IHdob2xlQ2FsbFN0YWNrLCB0b3BDYWxsU3RhY2s6IHdob2xlQ2FsbFN0YWNrIH07XG5cdH1cblxuXHRnZXRCcmVha3BvaW50cyhmaWx0ZXI/OiB7IHVyaT86IHVyaTsgb3JpZ2luYWxVcmk/OiB1cmk7IGxpbmVOdW1iZXI/OiBudW1iZXI7IGNvbHVtbj86IG51bWJlcjsgZW5hYmxlZE9ubHk/OiBib29sZWFuOyB0cmlnZ2VyZWRPbmx5PzogYm9vbGVhbiB9KTogSUJyZWFrcG9pbnRbXSB7XG5cdFx0aWYgKGZpbHRlcikge1xuXHRcdFx0Y29uc3QgdXJpU3RyID0gZmlsdGVyLnVyaT8udG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpU3RyID0gZmlsdGVyLm9yaWdpbmFsVXJpPy50b1N0cmluZygpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IHtcblx0XHRcdFx0aWYgKHVyaVN0ciAmJiBicC51cmkudG9TdHJpbmcoKSAhPT0gdXJpU3RyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcmlnaW5hbFVyaVN0ciAmJiBicC5vcmlnaW5hbFVyaS50b1N0cmluZygpICE9PSBvcmlnaW5hbFVyaVN0cikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsdGVyLmxpbmVOdW1iZXIgJiYgYnAubGluZU51bWJlciAhPT0gZmlsdGVyLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpbHRlci5jb2x1bW4gJiYgYnAuY29sdW1uICE9PSBmaWx0ZXIuY29sdW1uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaWx0ZXIuZW5hYmxlZE9ubHkgJiYgKCF0aGlzLmJyZWFrcG9pbnRzQWN0aXZhdGVkIHx8ICFicC5lbmFibGVkKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlsdGVyLnRyaWdnZXJlZE9ubHkgJiYgYnAudHJpZ2dlcmVkQnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYnJlYWtwb2ludHM7XG5cdH1cblxuXHRnZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCk6IElGdW5jdGlvbkJyZWFrcG9pbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cztcblx0fVxuXG5cdGdldERhdGFCcmVha3BvaW50cygpOiBJRGF0YUJyZWFrcG9pbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YUJyZWFrcG9pbnRzO1xuXHR9XG5cblx0Z2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHM7XG5cdH1cblxuXHRnZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbklkPzogc3RyaW5nKTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMuZmlsdGVyKGVicCA9PiBlYnAuaXNTdXBwb3J0ZWRTZXNzaW9uKHNlc3Npb25JZCkpO1xuXHR9XG5cblx0Z2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50W10ge1xuXHRcdHJldHVybiB0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHM7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGZpbHRlcnM6IERlYnVnUHJvdG9jb2wuRXhjZXB0aW9uQnJlYWtwb2ludHNGaWx0ZXJbXSk6IHZvaWQge1xuXHRcdGlmICghZmlsdGVycykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkaWRDaGFuZ2VCcmVha3BvaW50cyA9IGZhbHNlO1xuXHRcdGZpbHRlcnMuZm9yRWFjaCgoZCkgPT4ge1xuXHRcdFx0bGV0IGVicCA9IHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMuZmlsdGVyKChleGJwKSA9PiBleGJwLm1hdGNoZXMoZCkpLnBvcCgpO1xuXG5cdFx0XHRpZiAoIWVicCkge1xuXHRcdFx0XHRkaWRDaGFuZ2VCcmVha3BvaW50cyA9IHRydWU7XG5cdFx0XHRcdGVicCA9IG5ldyBFeGNlcHRpb25CcmVha3BvaW50KHtcblx0XHRcdFx0XHRmaWx0ZXI6IGQuZmlsdGVyLFxuXHRcdFx0XHRcdGxhYmVsOiBkLmxhYmVsLFxuXHRcdFx0XHRcdGVuYWJsZWQ6ICEhZC5kZWZhdWx0LFxuXHRcdFx0XHRcdHN1cHBvcnRzQ29uZGl0aW9uOiAhIWQuc3VwcG9ydHNDb25kaXRpb24sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y29uZGl0aW9uRGVzY3JpcHRpb246IGQuY29uZGl0aW9uRGVzY3JpcHRpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLnB1c2goZWJwKTtcblx0XHRcdH1cblxuXHRcdFx0ZWJwLnNldFN1cHBvcnRlZFNlc3Npb24oc2Vzc2lvbklkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdGlmIChkaWRDaGFuZ2VCcmVha3BvaW50cykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlRXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5leGNlcHRpb25CcmVha3BvaW50cy5mb3JFYWNoKGVicCA9PiBlYnAuc2V0U3VwcG9ydGVkU2Vzc2lvbihzZXNzaW9uSWQsIGZhbHNlKSk7XG5cdH1cblxuXHQvLyBTZXQgbGFzdCBmb2N1c2VkIHNlc3Npb24gYXMgZmFsbGJhY2sgc2Vzc2lvbi5cblx0Ly8gVGhpcyBpcyBkb25lIHRvIGtlZXAgdHJhY2sgb2YgdGhlIGV4Y2VwdGlvbiBicmVha3BvaW50cyB0byBzaG93IHdoZW4gbm8gc2Vzc2lvbiBpcyBhY3RpdmUuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRGYWxsYmFja1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goZWJwID0+IGVicC5zZXRGYWxsYmFjayhlYnAuaXNTdXBwb3J0ZWRTZXNzaW9uKHNlc3Npb25JZCkpKTtcblx0fVxuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRDb25kaXRpb24oZXhjZXB0aW9uQnJlYWtwb2ludDogSUV4Y2VwdGlvbkJyZWFrcG9pbnQsIGNvbmRpdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0KGV4Y2VwdGlvbkJyZWFrcG9pbnQgYXMgRXhjZXB0aW9uQnJlYWtwb2ludCkuY29uZGl0aW9uID0gY29uZGl0aW9uO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0YXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJlYWtwb2ludHNBY3RpdmF0ZWQ7XG5cdH1cblxuXHRzZXRCcmVha3BvaW50c0FjdGl2YXRlZChhY3RpdmF0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmJyZWFrcG9pbnRzQWN0aXZhdGVkID0gYWN0aXZhdGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0YWRkQnJlYWtwb2ludHModXJpOiB1cmksIHJhd0RhdGE6IElCcmVha3BvaW50RGF0YVtdLCBmaXJlRXZlbnQgPSB0cnVlKTogSUJyZWFrcG9pbnRbXSB7XG5cdFx0Y29uc3QgbmV3QnJlYWtwb2ludHMgPSByYXdEYXRhLm1hcChyYXdCcCA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IEJyZWFrcG9pbnQoe1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGxpbmVOdW1iZXI6IHJhd0JwLmxpbmVOdW1iZXIsXG5cdFx0XHRcdGNvbHVtbjogcmF3QnAuY29sdW1uLFxuXHRcdFx0XHRlbmFibGVkOiByYXdCcC5lbmFibGVkID8/IHRydWUsXG5cdFx0XHRcdGNvbmRpdGlvbjogcmF3QnAuY29uZGl0aW9uLFxuXHRcdFx0XHRoaXRDb25kaXRpb246IHJhd0JwLmhpdENvbmRpdGlvbixcblx0XHRcdFx0bG9nTWVzc2FnZTogcmF3QnAubG9nTWVzc2FnZSxcblx0XHRcdFx0dHJpZ2dlcmVkQnk6IHJhd0JwLnRyaWdnZXJlZEJ5LFxuXHRcdFx0XHRhZGFwdGVyRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlOiByYXdCcC5tb2RlLFxuXHRcdFx0XHRtb2RlTGFiZWw6IHJhd0JwLm1vZGVMYWJlbCxcblx0XHRcdH0sIHRoaXMudGV4dEZpbGVTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCByYXdCcC5pZCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5icmVha3BvaW50cyA9IHRoaXMuYnJlYWtwb2ludHMuY29uY2F0KG5ld0JyZWFrcG9pbnRzKTtcblx0XHR0aGlzLmJyZWFrcG9pbnRzQWN0aXZhdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnNvcnRBbmREZUR1cCgpO1xuXG5cdFx0aWYgKGZpcmVFdmVudCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgYWRkZWQ6IG5ld0JyZWFrcG9pbnRzLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld0JyZWFrcG9pbnRzO1xuXHR9XG5cblx0cmVtb3ZlQnJlYWtwb2ludHModG9SZW1vdmU6IElCcmVha3BvaW50W10pOiB2b2lkIHtcblx0XHR0aGlzLmJyZWFrcG9pbnRzID0gdGhpcy5icmVha3BvaW50cy5maWx0ZXIoYnAgPT4gIXRvUmVtb3ZlLnNvbWUodG9SZW1vdmUgPT4gdG9SZW1vdmUuZ2V0SWQoKSA9PT0gYnAuZ2V0SWQoKSkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IHJlbW92ZWQ6IHRvUmVtb3ZlLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdH1cblxuXHR1cGRhdGVCcmVha3BvaW50cyhkYXRhOiBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludFVwZGF0ZURhdGE+KTogdm9pZCB7XG5cdFx0Y29uc3QgdXBkYXRlZDogSUJyZWFrcG9pbnRbXSA9IFtdO1xuXHRcdHRoaXMuYnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiB7XG5cdFx0XHRjb25zdCBicERhdGEgPSBkYXRhLmdldChicC5nZXRJZCgpKTtcblx0XHRcdGlmIChicERhdGEpIHtcblx0XHRcdFx0YnAudXBkYXRlKGJwRGF0YSk7XG5cdFx0XHRcdHVwZGF0ZWQucHVzaChicCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5zb3J0QW5kRGVEdXAoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyBjaGFuZ2VkOiB1cGRhdGVkLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdH1cblxuXHRzZXRCcmVha3BvaW50U2Vzc2lvbkRhdGEoc2Vzc2lvbklkOiBzdHJpbmcsIGNhcGFiaWxpdGVzOiBEZWJ1Z1Byb3RvY29sLkNhcGFiaWxpdGllcywgZGF0YTogTWFwPHN0cmluZywgRGVidWdQcm90b2NvbC5CcmVha3BvaW50PiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiB7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0YnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYnBEYXRhID0gZGF0YS5nZXQoYnAuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChicERhdGEpIHtcblx0XHRcdFx0XHRicC5zZXRTZXNzaW9uRGF0YShzZXNzaW9uSWQsIHRvQnJlYWtwb2ludFNlc3Npb25EYXRhKGJwRGF0YSwgY2FwYWJpbGl0ZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cy5mb3JFYWNoKGZicCA9PiB7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0ZmJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZicERhdGEgPSBkYXRhLmdldChmYnAuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChmYnBEYXRhKSB7XG5cdFx0XHRcdFx0ZmJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdG9CcmVha3BvaW50U2Vzc2lvbkRhdGEoZmJwRGF0YSwgY2FwYWJpbGl0ZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuZGF0YUJyZWFrcG9pbnRzLmZvckVhY2goZGJwID0+IHtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRkYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGJwRGF0YSA9IGRhdGEuZ2V0KGRicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKGRicERhdGEpIHtcblx0XHRcdFx0XHRkYnAuc2V0U2Vzc2lvbkRhdGEoc2Vzc2lvbklkLCB0b0JyZWFrcG9pbnRTZXNzaW9uRGF0YShkYnBEYXRhLCBjYXBhYmlsaXRlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5leGNlcHRpb25CcmVha3BvaW50cy5mb3JFYWNoKGVicCA9PiB7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0ZWJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVicERhdGEgPSBkYXRhLmdldChlYnAuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChlYnBEYXRhKSB7XG5cdFx0XHRcdFx0ZWJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdG9CcmVha3BvaW50U2Vzc2lvbkRhdGEoZWJwRGF0YSwgY2FwYWJpbGl0ZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cy5mb3JFYWNoKGlicCA9PiB7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0aWJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlicERhdGEgPSBkYXRhLmdldChpYnAuZ2V0SWQoKSk7XG5cdFx0XHRcdGlmIChpYnBEYXRhKSB7XG5cdFx0XHRcdFx0aWJwLnNldFNlc3Npb25EYXRhKHNlc3Npb25JZCwgdG9CcmVha3BvaW50U2Vzc2lvbkRhdGEoaWJwRGF0YSwgY2FwYWJpbGl0ZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHtcblx0XHRcdHNlc3Npb25Pbmx5OiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRnZXREZWJ1Z1Byb3RvY29sQnJlYWtwb2ludChicmVha3BvaW50SWQ6IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcpOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJwID0gdGhpcy5icmVha3BvaW50cy5maW5kKGJwID0+IGJwLmdldElkKCkgPT09IGJyZWFrcG9pbnRJZCk7XG5cdFx0aWYgKGJwKSB7XG5cdFx0XHRyZXR1cm4gYnAuZ2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEJyZWFrcG9pbnRNb2Rlcyhmb3JCcmVha3BvaW50VHlwZTogJ3NvdXJjZScgfCAnZXhjZXB0aW9uJyB8ICdkYXRhJyB8ICdpbnN0cnVjdGlvbicpOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRNb2RlW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fYnJlYWtwb2ludE1vZGVzLnZhbHVlcygpXS5maWx0ZXIobW9kZSA9PiBtb2RlLmFwcGxpZXNUby5pbmNsdWRlcyhmb3JCcmVha3BvaW50VHlwZSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJCcmVha3BvaW50TW9kZXMoZGVidWdUeXBlOiBzdHJpbmcsIG1vZGVzOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRNb2RlW10pIHtcblx0XHRmb3IgKGNvbnN0IG1vZGUgb2YgbW9kZXMpIHtcblx0XHRcdGNvbnN0IGtleSA9IGAke21vZGUubW9kZX0vJHttb2RlLmxhYmVsfWA7XG5cdFx0XHRjb25zdCByZWMgPSB0aGlzLl9icmVha3BvaW50TW9kZXMuZ2V0KGtleSk7XG5cdFx0XHRpZiAocmVjKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIG1vZGUuYXBwbGllc1RvKSB7XG5cdFx0XHRcdFx0aWYgKCFyZWMuYXBwbGllc1RvLmluY2x1ZGVzKHRhcmdldCkpIHtcblx0XHRcdFx0XHRcdHJlYy5hcHBsaWVzVG8ucHVzaCh0YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZHVwbGljYXRlID0gWy4uLnRoaXMuX2JyZWFrcG9pbnRNb2Rlcy52YWx1ZXMoKV0uZmluZChyID0+IHIgIT09IHJlYyAmJiByLmxhYmVsID09PSBtb2RlLmxhYmVsKTtcblx0XHRcdFx0aWYgKGR1cGxpY2F0ZSkge1xuXHRcdFx0XHRcdGR1cGxpY2F0ZS5sYWJlbCA9IGAke2R1cGxpY2F0ZS5sYWJlbH0gKCR7ZHVwbGljYXRlLmZpcnN0RnJvbURlYnVnVHlwZX0pYDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2JyZWFrcG9pbnRNb2Rlcy5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0bW9kZTogbW9kZS5tb2RlLFxuXHRcdFx0XHRcdGxhYmVsOiBkdXBsaWNhdGUgPyBgJHttb2RlLmxhYmVsfSAoJHtkZWJ1Z1R5cGV9KWAgOiBtb2RlLmxhYmVsLFxuXHRcdFx0XHRcdGZpcnN0RnJvbURlYnVnVHlwZTogZGVidWdUeXBlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBtb2RlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGFwcGxpZXNUbzogbW9kZS5hcHBsaWVzVG8uc2xpY2UoKSwgLy8gYXZvaWQgbGF0ZXIgbXV0YXRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc29ydEFuZERlRHVwKCk6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludHMgPSB0aGlzLmJyZWFrcG9pbnRzLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IHtcblx0XHRcdGlmIChmaXJzdC51cmkudG9TdHJpbmcoKSAhPT0gc2Vjb25kLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZXMuYmFzZW5hbWVPckF1dGhvcml0eShmaXJzdC51cmkpLmxvY2FsZUNvbXBhcmUocmVzb3VyY2VzLmJhc2VuYW1lT3JBdXRob3JpdHkoc2Vjb25kLnVyaSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpcnN0LmxpbmVOdW1iZXIgPT09IHNlY29uZC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdGlmIChmaXJzdC5jb2x1bW4gJiYgc2Vjb25kLmNvbHVtbikge1xuXHRcdFx0XHRcdHJldHVybiBmaXJzdC5jb2x1bW4gLSBzZWNvbmQuY29sdW1uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmlyc3QubGluZU51bWJlciAtIHNlY29uZC5saW5lTnVtYmVyO1xuXHRcdH0pO1xuXHRcdHRoaXMuYnJlYWtwb2ludHMgPSBkaXN0aW5jdCh0aGlzLmJyZWFrcG9pbnRzLCBicCA9PiBgJHticC51cmkudG9TdHJpbmcoKX06JHticC5saW5lTnVtYmVyfToke2JwLmNvbHVtbn1gKTtcblx0fVxuXG5cdHNldEVuYWJsZW1lbnQoZWxlbWVudDogSUVuYWJsZW1lbnQsIGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCB8fCBlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBFeGNlcHRpb25CcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCB8fCBlbGVtZW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkOiBBcnJheTxJQnJlYWtwb2ludCB8IElGdW5jdGlvbkJyZWFrcG9pbnQgfCBJRGF0YUJyZWFrcG9pbnQgfCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50PiA9IFtdO1xuXHRcdFx0aWYgKGVsZW1lbnQuZW5hYmxlZCAhPT0gZW5hYmxlICYmIChlbGVtZW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCB8fCBlbGVtZW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCB8fCBlbGVtZW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSkge1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goZWxlbWVudCk7XG5cdFx0XHR9XG5cblx0XHRcdGVsZW1lbnQuZW5hYmxlZCA9IGVuYWJsZTtcblx0XHRcdGlmIChlbmFibGUpIHtcblx0XHRcdFx0dGhpcy5icmVha3BvaW50c0FjdGl2YXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGNoYW5nZWQ6IGNoYW5nZWQsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0XHR9XG5cdH1cblxuXHRlbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkOiBBcnJheTxJQnJlYWtwb2ludCB8IElGdW5jdGlvbkJyZWFrcG9pbnQgfCBJRGF0YUJyZWFrcG9pbnQgfCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50PiA9IFtdO1xuXG5cdFx0dGhpcy5icmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHtcblx0XHRcdGlmIChicC5lbmFibGVkICE9PSBlbmFibGUpIHtcblx0XHRcdFx0Y2hhbmdlZC5wdXNoKGJwKTtcblx0XHRcdH1cblx0XHRcdGJwLmVuYWJsZWQgPSBlbmFibGU7XG5cdFx0fSk7XG5cdFx0dGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goZmJwID0+IHtcblx0XHRcdGlmIChmYnAuZW5hYmxlZCAhPT0gZW5hYmxlKSB7XG5cdFx0XHRcdGNoYW5nZWQucHVzaChmYnApO1xuXHRcdFx0fVxuXHRcdFx0ZmJwLmVuYWJsZWQgPSBlbmFibGU7XG5cdFx0fSk7XG5cdFx0dGhpcy5kYXRhQnJlYWtwb2ludHMuZm9yRWFjaChkYnAgPT4ge1xuXHRcdFx0aWYgKGRicC5lbmFibGVkICE9PSBlbmFibGUpIHtcblx0XHRcdFx0Y2hhbmdlZC5wdXNoKGRicCk7XG5cdFx0XHR9XG5cdFx0XHRkYnAuZW5hYmxlZCA9IGVuYWJsZTtcblx0XHR9KTtcblx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMuZm9yRWFjaChpYnAgPT4ge1xuXHRcdFx0aWYgKGlicC5lbmFibGVkICE9PSBlbmFibGUpIHtcblx0XHRcdFx0Y2hhbmdlZC5wdXNoKGlicCk7XG5cdFx0XHR9XG5cdFx0XHRpYnAuZW5hYmxlZCA9IGVuYWJsZTtcblx0XHR9KTtcblxuXHRcdGlmIChlbmFibGUpIHtcblx0XHRcdHRoaXMuYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGNoYW5nZWQ6IGNoYW5nZWQsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0fVxuXG5cdGFkZEZ1bmN0aW9uQnJlYWtwb2ludChvcHRzOiBJRnVuY3Rpb25CcmVha3BvaW50T3B0aW9ucywgaWQ/OiBzdHJpbmcpOiBJRnVuY3Rpb25CcmVha3BvaW50IHtcblx0XHRjb25zdCBuZXdGdW5jdGlvbkJyZWFrcG9pbnQgPSBuZXcgRnVuY3Rpb25CcmVha3BvaW50KG9wdHMsIGlkKTtcblx0XHR0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMucHVzaChuZXdGdW5jdGlvbkJyZWFrcG9pbnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGFkZGVkOiBbbmV3RnVuY3Rpb25CcmVha3BvaW50XSwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXG5cdFx0cmV0dXJuIG5ld0Z1bmN0aW9uQnJlYWtwb2ludDtcblx0fVxuXG5cdHVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZDogc3RyaW5nLCB1cGRhdGU6IHsgbmFtZT86IHN0cmluZzsgaGl0Q29uZGl0aW9uPzogc3RyaW5nOyBjb25kaXRpb24/OiBzdHJpbmcgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGZ1bmN0aW9uQnJlYWtwb2ludCA9IHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cy5maW5kKGZicCA9PiBmYnAuZ2V0SWQoKSA9PT0gaWQpO1xuXHRcdGlmIChmdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdGlmICh0eXBlb2YgdXBkYXRlLm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGZ1bmN0aW9uQnJlYWtwb2ludC5uYW1lID0gdXBkYXRlLm5hbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHVwZGF0ZS5jb25kaXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGZ1bmN0aW9uQnJlYWtwb2ludC5jb25kaXRpb24gPSB1cGRhdGUuY29uZGl0aW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiB1cGRhdGUuaGl0Q29uZGl0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRmdW5jdGlvbkJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uID0gdXBkYXRlLmhpdENvbmRpdGlvbjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IGNoYW5nZWQ6IFtmdW5jdGlvbkJyZWFrcG9pbnRdLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhpZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCByZW1vdmVkOiBGdW5jdGlvbkJyZWFrcG9pbnRbXTtcblx0XHRpZiAoaWQpIHtcblx0XHRcdHJlbW92ZWQgPSB0aGlzLmZ1bmN0aW9uQnJlYWtwb2ludHMuZmlsdGVyKGZicCA9PiBmYnAuZ2V0SWQoKSA9PT0gaWQpO1xuXHRcdFx0dGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzID0gdGhpcy5mdW5jdGlvbkJyZWFrcG9pbnRzLmZpbHRlcihmYnAgPT4gZmJwLmdldElkKCkgIT09IGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVtb3ZlZCA9IHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cztcblx0XHRcdHRoaXMuZnVuY3Rpb25CcmVha3BvaW50cyA9IFtdO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyByZW1vdmVkLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdH1cblxuXHRhZGREYXRhQnJlYWtwb2ludChvcHRzOiBJRGF0YUJyZWFrcG9pbnRPcHRpb25zLCBpZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0RhdGFCcmVha3BvaW50ID0gbmV3IERhdGFCcmVha3BvaW50KG9wdHMsIGlkKTtcblx0XHR0aGlzLmRhdGFCcmVha3BvaW50cy5wdXNoKG5ld0RhdGFCcmVha3BvaW50KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyBhZGRlZDogW25ld0RhdGFCcmVha3BvaW50XSwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXHR9XG5cblx0dXBkYXRlRGF0YUJyZWFrcG9pbnQoaWQ6IHN0cmluZywgdXBkYXRlOiB7IGhpdENvbmRpdGlvbj86IHN0cmluZzsgY29uZGl0aW9uPzogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhQnJlYWtwb2ludCA9IHRoaXMuZGF0YUJyZWFrcG9pbnRzLmZpbmQoZmJwID0+IGZicC5nZXRJZCgpID09PSBpZCk7XG5cdFx0aWYgKGRhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRpZiAodHlwZW9mIHVwZGF0ZS5jb25kaXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRhdGFCcmVha3BvaW50LmNvbmRpdGlvbiA9IHVwZGF0ZS5jb25kaXRpb247XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHVwZGF0ZS5oaXRDb25kaXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRhdGFCcmVha3BvaW50LmhpdENvbmRpdGlvbiA9IHVwZGF0ZS5oaXRDb25kaXRpb247XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyBjaGFuZ2VkOiBbZGF0YUJyZWFrcG9pbnRdLCBzZXNzaW9uT25seTogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHJlbW92ZWQ6IERhdGFCcmVha3BvaW50W107XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRyZW1vdmVkID0gdGhpcy5kYXRhQnJlYWtwb2ludHMuZmlsdGVyKGZicCA9PiBmYnAuZ2V0SWQoKSA9PT0gaWQpO1xuXHRcdFx0dGhpcy5kYXRhQnJlYWtwb2ludHMgPSB0aGlzLmRhdGFCcmVha3BvaW50cy5maWx0ZXIoZmJwID0+IGZicC5nZXRJZCgpICE9PSBpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW92ZWQgPSB0aGlzLmRhdGFCcmVha3BvaW50cztcblx0XHRcdHRoaXMuZGF0YUJyZWFrcG9pbnRzID0gW107XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZSh7IHJlbW92ZWQsIHNlc3Npb25Pbmx5OiBmYWxzZSB9KTtcblx0fVxuXG5cdGFkZEluc3RydWN0aW9uQnJlYWtwb2ludChvcHRzOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50T3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0luc3RydWN0aW9uQnJlYWtwb2ludCA9IG5ldyBJbnN0cnVjdGlvbkJyZWFrcG9pbnQob3B0cyk7XG5cdFx0dGhpcy5pbnN0cnVjdGlvbkJyZWFrcG9pbnRzLnB1c2gobmV3SW5zdHJ1Y3Rpb25CcmVha3BvaW50KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmZpcmUoeyBhZGRlZDogW25ld0luc3RydWN0aW9uQnJlYWtwb2ludF0sIHNlc3Npb25Pbmx5OiB0cnVlIH0pO1xuXHR9XG5cblx0cmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhpbnN0cnVjdGlvblJlZmVyZW5jZT86IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyLCBhZGRyZXNzPzogYmlnaW50KTogdm9pZCB7XG5cdFx0bGV0IHJlbW92ZWQ6IEluc3RydWN0aW9uQnJlYWtwb2ludFtdID0gW107XG5cdFx0aWYgKGFkZHJlc3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUHJlZmVyIG1hdGNoaW5nIGJ5IHJlc29sdmVkIG1lbW9yeSBhZGRyZXNzOiBgaW5zdHJ1Y3Rpb25SZWZlcmVuY2VgIGlzXG5cdFx0XHQvLyBhbGxvd2VkIGJ5IHRoZSBEZWJ1ZyBBZGFwdGVyIFByb3RvY29sIHRvIGNoYW5nZSBiZXR3ZWVuIGRpc2Fzc2VtYmxlXG5cdFx0XHQvLyByZXF1ZXN0cyAoZS5nLiBhZnRlciBzeW1ib2wgcmVsb2FkcyksIHNvIG1hdGNoaW5nIG9uIHJlZmVyZW5jZStvZmZzZXRcblx0XHRcdC8vIGFsb25lIHdvdWxkIGZhaWwgdG8gbG9jYXRlIHRoZSBicmVha3BvaW50IHRoYXQgdGhlIHVzZXIgaXMgdHJ5aW5nIHRvXG5cdFx0XHQvLyB0b2dnbGUgb2ZmLiBUaGUgYGFkZHJlc3NgIG9uIGFuIGBJbnN0cnVjdGlvbkJyZWFrcG9pbnRgIGlzIHRoZSBzdGFibGVcblx0XHRcdC8vIHJlc29sdmVkIG1lbW9yeSBhZGRyZXNzIGFuZCB1bmlxdWVseSBpZGVudGlmaWVzIGl0LlxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgaWJwID0gdGhpcy5pbnN0cnVjdGlvbkJyZWFrcG9pbnRzW2ldO1xuXHRcdFx0XHRpZiAoaWJwLmFkZHJlc3MgPT09IGFkZHJlc3MpIHtcblx0XHRcdFx0XHRyZW1vdmVkLnB1c2goaWJwKTtcblx0XHRcdFx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMuc3BsaWNlKGktLSwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGluc3RydWN0aW9uUmVmZXJlbmNlKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuaW5zdHJ1Y3Rpb25CcmVha3BvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpYnAgPSB0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHNbaV07XG5cdFx0XHRcdGlmIChpYnAuaW5zdHJ1Y3Rpb25SZWZlcmVuY2UgPT09IGluc3RydWN0aW9uUmVmZXJlbmNlICYmIChvZmZzZXQgPT09IHVuZGVmaW5lZCB8fCBpYnAub2Zmc2V0ID09PSBvZmZzZXQpKSB7XG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKGlicCk7XG5cdFx0XHRcdFx0dGhpcy5pbnN0cnVjdGlvbkJyZWFrcG9pbnRzLnNwbGljZShpLS0sIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbW92ZWQgPSB0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHM7XG5cdFx0XHR0aGlzLmluc3RydWN0aW9uQnJlYWtwb2ludHMgPSBbXTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcmVha3BvaW50cy5maXJlKHsgcmVtb3ZlZCwgc2Vzc2lvbk9ubHk6IGZhbHNlIH0pO1xuXHR9XG5cblx0Z2V0V2F0Y2hFeHByZXNzaW9ucygpOiBFeHByZXNzaW9uW10ge1xuXHRcdHJldHVybiB0aGlzLndhdGNoRXhwcmVzc2lvbnM7XG5cdH1cblxuXHRhZGRXYXRjaEV4cHJlc3Npb24obmFtZT86IHN0cmluZyk6IElFeHByZXNzaW9uIHtcblx0XHRjb25zdCB3ZSA9IG5ldyBFeHByZXNzaW9uKG5hbWUgfHwgJycpO1xuXHRcdHRoaXMud2F0Y2hFeHByZXNzaW9ucy5wdXNoKHdlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMuZmlyZSh3ZSk7XG5cblx0XHRyZXR1cm4gd2U7XG5cdH1cblxuXHRyZW5hbWVXYXRjaEV4cHJlc3Npb24oaWQ6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsdGVyZWQgPSB0aGlzLndhdGNoRXhwcmVzc2lvbnMuZmlsdGVyKHdlID0+IHdlLmdldElkKCkgPT09IGlkKTtcblx0XHRpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRmaWx0ZXJlZFswXS5uYW1lID0gbmV3TmFtZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5maXJlKGZpbHRlcmVkWzBdKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVXYXRjaEV4cHJlc3Npb25zKGlkOiBzdHJpbmcgfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMud2F0Y2hFeHByZXNzaW9ucyA9IGlkID8gdGhpcy53YXRjaEV4cHJlc3Npb25zLmZpbHRlcih3ZSA9PiB3ZS5nZXRJZCgpICE9PSBpZCkgOiBbXTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0bW92ZVdhdGNoRXhwcmVzc2lvbihpZDogc3RyaW5nLCBwb3NpdGlvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2UgPSB0aGlzLndhdGNoRXhwcmVzc2lvbnMuZmluZCh3ZSA9PiB3ZS5nZXRJZCgpID09PSBpZCk7XG5cdFx0aWYgKHdlKSB7XG5cdFx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnMgPSB0aGlzLndhdGNoRXhwcmVzc2lvbnMuZmlsdGVyKHdlID0+IHdlLmdldElkKCkgIT09IGlkKTtcblx0XHRcdHRoaXMud2F0Y2hFeHByZXNzaW9ucyA9IHRoaXMud2F0Y2hFeHByZXNzaW9ucy5zbGljZSgwLCBwb3NpdGlvbikuY29uY2F0KHdlLCB0aGlzLndhdGNoRXhwcmVzc2lvbnMuc2xpY2UocG9zaXRpb24pKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucy5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0c291cmNlSXNOb3RBdmFpbGFibGUodXJpOiB1cmkpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25zLmZvckVhY2gocyA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBzLmdldFNvdXJjZUZvclVyaSh1cmkpO1xuXHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRzb3VyY2UuYXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDYWxsU3RhY2suZmlyZSh1bmRlZmluZWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUFTLFVBQVUsY0FBYyxvQkFBb0I7QUFDckQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxTQUFnQix1QkFBdUI7QUFDaEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixZQUFZLGVBQWU7QUFDM0IsU0FBUyxVQUFVLHlCQUF5QjtBQUM1QyxTQUFTLFdBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWlCLGFBQWE7QUFDOUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUJBQXFCLHVCQUE2QywrQkFBMGUsaUJBQWlCLE9BQU8sMkJBQTJCO0FBQ3htQixTQUFpQixzQkFBc0Isd0JBQXdCO0FBRy9ELFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsd0JBQXdCO0FBTTFCLE1BQU0sdUJBQU4sTUFBTSxxQkFBb0Q7QUFBQSxFQVdoRSxZQUNXLFNBQ1MsVUFDWCxZQUNTLElBQ1YsaUJBQXFDLEdBQ3JDLG1CQUF1QyxHQUN2QyxrQkFBc0MsUUFDckMsbUJBQXVDLEdBQ3hD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
