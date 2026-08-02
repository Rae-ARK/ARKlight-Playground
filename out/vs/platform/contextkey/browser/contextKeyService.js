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
import { Event, PauseableEmitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { cloneAndChange, distinct, equals } from "../../../base/common/objects.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { CommandsRegistry } from "../../commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../common/contextkey.js";
import { InputFocusedContext } from "../common/contextkeys.js";
import { mainWindow } from "../../../base/browser/window.js";
import { addDisposableListener, EventType, getActiveWindow, isEditableElement, onDidRegisterWindow, trackFocus } from "../../../base/browser/dom.js";
const KEYBINDING_CONTEXT_ATTR = "data-keybinding-context";
class Context {
  constructor(id, parent) {
    this._id = id;
    this._parent = parent;
    this._value = /* @__PURE__ */ Object.create(null);
    this._value["_contextId"] = id;
  }
  get value() {
    return { ...this._value };
  }
  setValue(key, value) {
    if (!equals(this._value[key], value)) {
      this._value[key] = value;
      return true;
    }
    return false;
  }
  removeValue(key) {
    if (key in this._value) {
      delete this._value[key];
      return true;
    }
    return false;
  }
  getValue(key) {
    const ret = this._value[key];
    if (typeof ret === "undefined" && this._parent) {
      return this._parent.getValue(key);
    }
    return ret;
  }
  updateParent(parent) {
    this._parent = parent;
  }
  collectAllValues() {
    let result = this._parent ? this._parent.collectAllValues() : /* @__PURE__ */ Object.create(null);
    result = { ...result, ...this._value };
    delete result["_contextId"];
    return result;
  }
}
const _NullContext = class _NullContext extends Context {
  constructor() {
    super(-1, null);
  }
  setValue(key, value) {
    return false;
  }
  removeValue(key) {
    return false;
  }
  getValue(key) {
    return void 0;
  }
  collectAllValues() {
    return /* @__PURE__ */ Object.create(null);
  }
};
_NullContext.INSTANCE = new _NullContext();
let NullContext = _NullContext;
const _ConfigAwareContextValuesContainer = class _ConfigAwareContextValuesContainer extends Context {
  constructor(id, _configurationService, emitter) {
    super(id, null);
    this._configurationService = _configurationService;
    this._values = TernarySearchTree.forConfigKeys();
    this._listener = this._configurationService.onDidChangeConfiguration((event) => {
      if (event.source === ConfigurationTarget.DEFAULT) {
        const allKeys = Array.from(this._values, ([k]) => k);
        this._values.clear();
        emitter.fire(new ArrayContextKeyChangeEvent(allKeys));
      } else {
        const changedKeys = [];
        for (const configKey of event.affectedKeys) {
          const contextKey = `config.${configKey}`;
          const cachedItems = this._values.findSuperstr(contextKey);
          if (cachedItems !== void 0) {
            changedKeys.push(...Iterable.map(cachedItems, ([key]) => key));
            this._values.deleteSuperstr(contextKey);
          }
          if (this._values.has(contextKey)) {
            changedKeys.push(contextKey);
            this._values.delete(contextKey);
          }
        }
        emitter.fire(new ArrayContextKeyChangeEvent(changedKeys));
      }
    });
  }
  dispose() {
    this._listener.dispose();
  }
  getValue(key) {
    if (key.indexOf(_ConfigAwareContextValuesContainer._keyPrefix) !== 0) {
      return super.getValue(key);
    }
    if (this._values.has(key)) {
      return this._values.get(key);
    }
    const configKey = key.substr(_ConfigAwareContextValuesContainer._keyPrefix.length);
    const configValue = this._configurationService.getValue(configKey);
    let value = void 0;
    switch (typeof configValue) {
      case "number":
      case "boolean":
      case "string":
        value = configValue;
        break;
      default:
        if (Array.isArray(configValue)) {
          value = JSON.stringify(configValue);
        } else {
          value = configValue;
        }
    }
    this._values.set(key, value);
    return value;
  }
  setValue(key, value) {
    return super.setValue(key, value);
  }
  removeValue(key) {
    return super.removeValue(key);
  }
  collectAllValues() {
    const result = /* @__PURE__ */ Object.create(null);
    this._values.forEach((value, index) => result[index] = value);
    return { ...result, ...super.collectAllValues() };
  }
};
_ConfigAwareContextValuesContainer._keyPrefix = "config.";
let ConfigAwareContextValuesContainer = _ConfigAwareContextValuesContainer;
class ContextKey {
  constructor(service, key, defaultValue) {
    this._service = service;
    this._key = key;
    this._defaultValue = defaultValue;
    this.reset();
  }
  set(value) {
    this._service.setContext(this._key, value);
  }
  reset() {
    if (typeof this._defaultValue === "undefined") {
      this._service.removeContext(this._key);
    } else {
      this._service.setContext(this._key, this._defaultValue);
    }
  }
  get() {
    return this._service.getContextKeyValue(this._key);
  }
}
class SimpleContextKeyChangeEvent {
  constructor(key) {
    this.key = key;
  }
  affectsSome(keys) {
    return keys.has(this.key);
  }
  allKeysContainedIn(keys) {
    return this.affectsSome(keys);
  }
}
class ArrayContextKeyChangeEvent {
  constructor(keys) {
    this.keys = keys;
  }
  affectsSome(keys) {
    for (const key of this.keys) {
      if (keys.has(key)) {
        return true;
      }
    }
    return false;
  }
  allKeysContainedIn(keys) {
    return this.keys.every((key) => keys.has(key));
  }
}
class CompositeContextKeyChangeEvent {
  constructor(events) {
    this.events = events;
  }
  affectsSome(keys) {
    for (const e of this.events) {
      if (e.affectsSome(keys)) {
        return true;
      }
    }
    return false;
  }
  allKeysContainedIn(keys) {
    return this.events.every((evt) => evt.allKeysContainedIn(keys));
  }
}
function allEventKeysInContext(event, context) {
  return event.allKeysContainedIn(new Set(Object.keys(context)));
}
class AbstractContextKeyService extends Disposable {
  constructor(myContextId) {
    super();
    this._onDidChangeContext = this._register(new PauseableEmitter({ merge: (input) => new CompositeContextKeyChangeEvent(input) }));
    this._isDisposed = false;
    this._myContextId = myContextId;
  }
  get onDidChangeContext() {
    return this._onDidChangeContext.event;
  }
  get contextId() {
    return this._myContextId;
  }
  createKey(key, defaultValue) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new ContextKey(this, key, defaultValue);
  }
  bufferChangeEvents(callback) {
    this._onDidChangeContext.pause();
    try {
      callback();
    } finally {
      this._onDidChangeContext.resume();
    }
  }
  createScoped(domNode) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new ScopedContextKeyService(this, domNode);
  }
  createOverlay(overlay = Iterable.empty()) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    return new OverlayContextKeyService(this, overlay);
  }
  contextMatchesRules(rules) {
    if (this._isDisposed) {
      throw new Error(`AbstractContextKeyService has been disposed`);
    }
    const context = this.getContextValuesContainer(this._myContextId);
    const result = rules ? rules.evaluate(context) : true;
    return result;
  }
  getContextKeyValue(key) {
    if (this._isDisposed) {
      return void 0;
    }
    return this.getContextValuesContainer(this._myContextId).getValue(key);
  }
  setContext(key, value) {
    if (this._isDisposed) {
      return;
    }
    const myContext = this.getContextValuesContainer(this._myContextId);
    if (!myContext) {
      return;
    }
    if (myContext.setValue(key, value)) {
      this._onDidChangeContext.fire(new SimpleContextKeyChangeEvent(key));
    }
  }
  removeContext(key) {
    if (this._isDisposed) {
      return;
    }
    if (this.getContextValuesContainer(this._myContextId).removeValue(key)) {
      this._onDidChangeContext.fire(new SimpleContextKeyChangeEvent(key));
    }
  }
  getContext(target) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this.getContextValuesContainer(findContextAttr(target));
  }
  dispose() {
    super.dispose();
    this._isDisposed = true;
  }
}
let ContextKeyService = class extends AbstractContextKeyService {
  constructor(configurationService) {
    super(0);
    this._contexts = /* @__PURE__ */ new Map();
    this._lastContextId = 0;
    this.inputFocusedContext = InputFocusedContext.bindTo(this);
    const myContext = this._register(new ConfigAwareContextValuesContainer(this._myContextId, configurationService, this._onDidChangeContext));
    this._contexts.set(this._myContextId, myContext);
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const onFocusDisposables = disposables.add(new MutableDisposable());
      disposables.add(addDisposableListener(window, EventType.FOCUS_IN, () => {
        onFocusDisposables.value = new DisposableStore();
        this.updateInputContextKeys(window.document, onFocusDisposables.value);
      }, true));
    }, { window: mainWindow, disposables: this._store }));
  }
  updateInputContextKeys(ownerDocument, disposables) {
    function activeElementIsInput() {
      return !!ownerDocument.activeElement && isEditableElement(ownerDocument.activeElement);
    }
    const isInputFocused = activeElementIsInput();
    this.inputFocusedContext.set(isInputFocused);
    if (isInputFocused) {
      const tracker = disposables.add(trackFocus(ownerDocument.activeElement));
      Event.once(tracker.onDidBlur)(() => {
        if (getActiveWindow().document === ownerDocument) {
          this.inputFocusedContext.set(activeElementIsInput());
        }
        tracker.dispose();
      }, void 0, disposables);
    }
  }
  getContextValuesContainer(contextId) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this._contexts.get(contextId) || NullContext.INSTANCE;
  }
  createChildContext(parentContextId = this._myContextId) {
    if (this._isDisposed) {
      throw new Error(`ContextKeyService has been disposed`);
    }
    const id = ++this._lastContextId;
    this._contexts.set(id, new Context(id, this.getContextValuesContainer(parentContextId)));
    return id;
  }
  disposeContext(contextId) {
    if (!this._isDisposed) {
      this._contexts.delete(contextId);
    }
  }
  updateParent(_parentContextKeyService) {
    throw new Error("Cannot update parent of root ContextKeyService");
  }
};
ContextKeyService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ContextKeyService);
class ScopedContextKeyService extends AbstractContextKeyService {
  constructor(parent, domNode) {
    super(parent.createChildContext());
    this._parentChangeListener = this._register(new MutableDisposable());
    this._parent = parent;
    this._updateParentChangeListener();
    this._domNode = domNode;
    if (this._domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
      let extraInfo = "";
      if (this._domNode.classList) {
        extraInfo = Array.from(this._domNode.classList.values()).join(", ");
      }
      console.error(`Element already has context attribute${extraInfo ? ": " + extraInfo : ""}`);
    }
    this._domNode.setAttribute(KEYBINDING_CONTEXT_ATTR, String(this._myContextId));
  }
  _updateParentChangeListener() {
    this._parentChangeListener.value = this._parent.onDidChangeContext((e) => {
      const thisContainer = this._parent.getContextValuesContainer(this._myContextId);
      const thisContextValues = thisContainer.value;
      if (!allEventKeysInContext(e, thisContextValues)) {
        this._onDidChangeContext.fire(e);
      }
    });
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._parentChangeListener.clear();
    this._parent.disposeContext(this._myContextId);
    this._domNode.removeAttribute(KEYBINDING_CONTEXT_ATTR);
    super.dispose();
  }
  getContextValuesContainer(contextId) {
    if (this._isDisposed) {
      return NullContext.INSTANCE;
    }
    return this._parent.getContextValuesContainer(contextId);
  }
  createChildContext(parentContextId = this._myContextId) {
    if (this._isDisposed) {
      throw new Error(`ScopedContextKeyService has been disposed`);
    }
    return this._parent.createChildContext(parentContextId);
  }
  disposeContext(contextId) {
    this._parent.disposeContext(contextId);
  }
  updateParent(parentContextKeyService) {
    if (this._parent === parentContextKeyService) {
      return;
    }
    const thisContainer = this._parent.getContextValuesContainer(this._myContextId);
    const oldAllValues = thisContainer.collectAllValues();
    this._parent = parentContextKeyService;
    this._updateParentChangeListener();
    const newParentContainer = this._parent.getContextValuesContainer(this._parent.contextId);
    thisContainer.updateParent(newParentContainer);
    const newAllValues = thisContainer.collectAllValues();
    const allValuesDiff = {
      ...distinct(oldAllValues, newAllValues),
      ...distinct(newAllValues, oldAllValues)
    };
    const changedKeys = Object.keys(allValuesDiff);
    this._onDidChangeContext.fire(new ArrayContextKeyChangeEvent(changedKeys));
  }
}
class OverlayContext {
  constructor(parent, overlay) {
    this.parent = parent;
    this.overlay = overlay;
  }
  getValue(key) {
    return this.overlay.has(key) ? this.overlay.get(key) : this.parent.getValue(key);
  }
}
class OverlayContextKeyService {
  constructor(parent, overlay) {
    this.parent = parent;
    this.overlay = new Map(overlay);
  }
  get contextId() {
    return this.parent.contextId;
  }
  get onDidChangeContext() {
    return this.parent.onDidChangeContext;
  }
  bufferChangeEvents(callback) {
    this.parent.bufferChangeEvents(callback);
  }
  createKey() {
    throw new Error("Not supported.");
  }
  getContext(target) {
    return new OverlayContext(this.parent.getContext(target), this.overlay);
  }
  getContextValuesContainer(contextId) {
    const parentContext = this.parent.getContextValuesContainer(contextId);
    return new OverlayContext(parentContext, this.overlay);
  }
  contextMatchesRules(rules) {
    const context = this.getContextValuesContainer(this.contextId);
    const result = rules ? rules.evaluate(context) : true;
    return result;
  }
  getContextKeyValue(key) {
    return this.overlay.has(key) ? this.overlay.get(key) : this.parent.getContextKeyValue(key);
  }
  createScoped() {
    throw new Error("Not supported.");
  }
  createOverlay(overlay = Iterable.empty()) {
    return new OverlayContextKeyService(this, overlay);
  }
  updateParent() {
    throw new Error("Not supported.");
  }
}
function findContextAttr(domNode) {
  while (domNode) {
    if (domNode.hasAttribute(KEYBINDING_CONTEXT_ATTR)) {
      const attr = domNode.getAttribute(KEYBINDING_CONTEXT_ATTR);
      if (attr) {
        return parseInt(attr, 10);
      }
      return NaN;
    }
    domNode = domNode.parentElement;
  }
  return 0;
}
function setContext(accessor, contextKey, contextValue) {
  const contextKeyService = accessor.get(IContextKeyService);
  contextKeyService.createKey(String(contextKey), stringifyURIs(contextValue));
}
function stringifyURIs(contextValue) {
  return cloneAndChange(contextValue, (obj) => {
    if (typeof obj === "object" && obj.$mid === MarshalledId.Uri) {
      return URI.revive(obj).toString();
    }
    if (obj instanceof URI) {
      return obj.toString();
    }
    return void 0;
  });
}
CommandsRegistry.registerCommand("_setContext", setContext);
CommandsRegistry.registerCommand({
  id: "getContextKeyInfo",
  handler() {
    return [...RawContextKey.all()].sort((a, b) => a.key.localeCompare(b.key));
  },
  metadata: {
    description: localize("getContextKeyInfo", "A command that returns information about context keys"),
    args: []
  }
});
CommandsRegistry.registerCommand("_generateContextKeyInfo", function() {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const info of RawContextKey.all()) {
    if (!seen.has(info.key)) {
      seen.add(info.key);
      result.push(info);
    }
  }
  result.sort((a, b) => a.key.localeCompare(b.key));
  console.log(JSON.stringify(result, void 0, 2));
});
export {
  AbstractContextKeyService,
  Context,
  ContextKeyService,
  setContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBQYXVzZWFibGVFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UsIGRpc3RpbmN0LCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwcmVzc2lvbiwgQ29udGV4dEtleUluZm8sIENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHQsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleUNoYW5nZUV2ZW50LCBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5U2VydmljZVRhcmdldCwgSVJlYWRhYmxlU2V0LCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRBY3RpdmVXaW5kb3csIGlzRWRpdGFibGVFbGVtZW50LCBvbkRpZFJlZ2lzdGVyV2luZG93LCB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmNvbnN0IEtFWUJJTkRJTkdfQ09OVEVYVF9BVFRSID0gJ2RhdGEta2V5YmluZGluZy1jb250ZXh0JztcblxuZXhwb3J0IGNsYXNzIENvbnRleHQgaW1wbGVtZW50cyBJQ29udGV4dCB7XG5cblx0cHJvdGVjdGVkIF9wYXJlbnQ6IENvbnRleHQgfCBudWxsO1xuXHRwcm90ZWN0ZWQgX3ZhbHVlOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuXHRwcm90ZWN0ZWQgX2lkOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoaWQ6IG51bWJlciwgcGFyZW50OiBDb250ZXh0IHwgbnVsbCkge1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuX3ZhbHVlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl92YWx1ZVsnX2NvbnRleHRJZCddID0gaWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHZhbHVlKCk6IFJlY29yZDxzdHJpbmcsIGFueT4ge1xuXHRcdHJldHVybiB7IC4uLnRoaXMuX3ZhbHVlIH07XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBib29sZWFuIHtcblx0XHQvLyBjb25zb2xlLmxvZygnU0VUICcgKyBrZXkgKyAnID0gJyArIHZhbHVlICsgJyBPTiAnICsgdGhpcy5faWQpO1xuXHRcdGlmICghZXF1YWxzKHRoaXMuX3ZhbHVlW2tleV0sIHZhbHVlKSkge1xuXHRcdFx0dGhpcy5fdmFsdWVba2V5XSA9IHZhbHVlO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVWYWx1ZShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdC8vIGNvbnNvbGUubG9nKCdSRU1PVkUgJyArIGtleSArICcgRlJPTSAnICsgdGhpcy5faWQpO1xuXHRcdGlmIChrZXkgaW4gdGhpcy5fdmFsdWUpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl92YWx1ZVtrZXldO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZTxUPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJldCA9IHRoaXMuX3ZhbHVlW2tleV07XG5cdFx0aWYgKHR5cGVvZiByZXQgPT09ICd1bmRlZmluZWQnICYmIHRoaXMuX3BhcmVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5nZXRWYWx1ZTxUPihrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVBhcmVudChwYXJlbnQ6IENvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdH1cblxuXHRwdWJsaWMgY29sbGVjdEFsbFZhbHVlcygpOiBSZWNvcmQ8c3RyaW5nLCBhbnk+IHtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fcGFyZW50ID8gdGhpcy5fcGFyZW50LmNvbGxlY3RBbGxWYWx1ZXMoKSA6IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0cmVzdWx0ID0geyAuLi5yZXN1bHQsIC4uLnRoaXMuX3ZhbHVlIH07XG5cdFx0ZGVsZXRlIHJlc3VsdFsnX2NvbnRleHRJZCddO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgTnVsbENvbnRleHQgZXh0ZW5kcyBDb250ZXh0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSU5TVEFOQ0UgPSBuZXcgTnVsbENvbnRleHQoKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigtMSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgc2V0VmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVtb3ZlVmFsdWUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0VmFsdWU8VD4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgY29sbGVjdEFsbFZhbHVlcygpOiB7IFtrZXk6IHN0cmluZ106IGFueSB9IHtcblx0XHRyZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxufVxuXG5jbGFzcyBDb25maWdBd2FyZUNvbnRleHRWYWx1ZXNDb250YWluZXIgZXh0ZW5kcyBDb250ZXh0IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2tleVByZWZpeCA9ICdjb25maWcuJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXMgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JDb25maWdLZXlzPGFueT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRlbWl0dGVyOiBFbWl0dGVyPElDb250ZXh0S2V5Q2hhbmdlRXZlbnQ+XG5cdCkge1xuXHRcdHN1cGVyKGlkLCBudWxsKTtcblxuXHRcdHRoaXMuX2xpc3RlbmVyID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5zb3VyY2UgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0XHQvLyBuZXcgc2V0dGluZywgcmVzZXQgZXZlcnl0aGluZ1xuXHRcdFx0XHRjb25zdCBhbGxLZXlzID0gQXJyYXkuZnJvbSh0aGlzLl92YWx1ZXMsIChba10pID0+IGspO1xuXHRcdFx0XHR0aGlzLl92YWx1ZXMuY2xlYXIoKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKG5ldyBBcnJheUNvbnRleHRLZXlDaGFuZ2VFdmVudChhbGxLZXlzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VkS2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25maWdLZXkgb2YgZXZlbnQuYWZmZWN0ZWRLZXlzKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGV4dEtleSA9IGBjb25maWcuJHtjb25maWdLZXl9YDtcblxuXHRcdFx0XHRcdGNvbnN0IGNhY2hlZEl0ZW1zID0gdGhpcy5fdmFsdWVzLmZpbmRTdXBlcnN0cihjb250ZXh0S2V5KTtcblx0XHRcdFx0XHRpZiAoY2FjaGVkSXRlbXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y2hhbmdlZEtleXMucHVzaCguLi5JdGVyYWJsZS5tYXAoY2FjaGVkSXRlbXMsIChba2V5XSkgPT4ga2V5KSk7XG5cdFx0XHRcdFx0XHR0aGlzLl92YWx1ZXMuZGVsZXRlU3VwZXJzdHIoY29udGV4dEtleSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX3ZhbHVlcy5oYXMoY29udGV4dEtleSkpIHtcblx0XHRcdFx0XHRcdGNoYW5nZWRLZXlzLnB1c2goY29udGV4dEtleSk7XG5cdFx0XHRcdFx0XHR0aGlzLl92YWx1ZXMuZGVsZXRlKGNvbnRleHRLZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZShuZXcgQXJyYXlDb250ZXh0S2V5Q2hhbmdlRXZlbnQoY2hhbmdlZEtleXMpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0VmFsdWUoa2V5OiBzdHJpbmcpOiBhbnkge1xuXG5cdFx0aWYgKGtleS5pbmRleE9mKENvbmZpZ0F3YXJlQ29udGV4dFZhbHVlc0NvbnRhaW5lci5fa2V5UHJlZml4KSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmdldFZhbHVlKGtleSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3ZhbHVlcy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZhbHVlcy5nZXQoa2V5KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWdLZXkgPSBrZXkuc3Vic3RyKENvbmZpZ0F3YXJlQ29udGV4dFZhbHVlc0NvbnRhaW5lci5fa2V5UHJlZml4Lmxlbmd0aCk7XG5cdFx0Y29uc3QgY29uZmlnVmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShjb25maWdLZXkpO1xuXHRcdGxldCB2YWx1ZTogYW55ID0gdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAodHlwZW9mIGNvbmZpZ1ZhbHVlKSB7XG5cdFx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0Y2FzZSAnYm9vbGVhbic6XG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHR2YWx1ZSA9IGNvbmZpZ1ZhbHVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGNvbmZpZ1ZhbHVlKSkge1xuXHRcdFx0XHRcdHZhbHVlID0gSlNPTi5zdHJpbmdpZnkoY29uZmlnVmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlID0gY29uZmlnVmFsdWU7XG5cdFx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl92YWx1ZXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHN1cGVyLnNldFZhbHVlKGtleSwgdmFsdWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVtb3ZlVmFsdWUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3VwZXIucmVtb3ZlVmFsdWUoa2V5KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNvbGxlY3RBbGxWYWx1ZXMoKTogeyBba2V5OiBzdHJpbmddOiBhbnkgfSB7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl92YWx1ZXMuZm9yRWFjaCgodmFsdWUsIGluZGV4KSA9PiByZXN1bHRbaW5kZXhdID0gdmFsdWUpO1xuXHRcdHJldHVybiB7IC4uLnJlc3VsdCwgLi4uc3VwZXIuY29sbGVjdEFsbFZhbHVlcygpIH07XG5cdH1cbn1cblxuY2xhc3MgQ29udGV4dEtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlPiBpbXBsZW1lbnRzIElDb250ZXh0S2V5PFQ+IHtcblxuXHRwcml2YXRlIF9zZXJ2aWNlOiBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIF9rZXk6IHN0cmluZztcblx0cHJpdmF0ZSBfZGVmYXVsdFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHNlcnZpY2U6IEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UsIGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9zZXJ2aWNlID0gc2VydmljZTtcblx0XHR0aGlzLl9rZXkgPSBrZXk7XG5cdFx0dGhpcy5fZGVmYXVsdFZhbHVlID0gZGVmYXVsdFZhbHVlO1xuXHRcdHRoaXMucmVzZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQodmFsdWU6IFQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXJ2aWNlLnNldENvbnRleHQodGhpcy5fa2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXQoKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9kZWZhdWx0VmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9zZXJ2aWNlLnJlbW92ZUNvbnRleHQodGhpcy5fa2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VydmljZS5zZXRDb250ZXh0KHRoaXMuX2tleSwgdGhpcy5fZGVmYXVsdFZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxUPih0aGlzLl9rZXkpO1xuXHR9XG59XG5cbmNsYXNzIFNpbXBsZUNvbnRleHRLZXlDaGFuZ2VFdmVudCBpbXBsZW1lbnRzIElDb250ZXh0S2V5Q2hhbmdlRXZlbnQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBrZXk6IHN0cmluZykgeyB9XG5cdGFmZmVjdHNTb21lKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGtleXMuaGFzKHRoaXMua2V5KTtcblx0fVxuXHRhbGxLZXlzQ29udGFpbmVkSW4oa2V5czogSVJlYWRhYmxlU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5hZmZlY3RzU29tZShrZXlzKTtcblx0fVxufVxuXG5jbGFzcyBBcnJheUNvbnRleHRLZXlDaGFuZ2VFdmVudCBpbXBsZW1lbnRzIElDb250ZXh0S2V5Q2hhbmdlRXZlbnQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBrZXlzOiBzdHJpbmdbXSkgeyB9XG5cdGFmZmVjdHNTb21lKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5rZXlzKSB7XG5cdFx0XHRpZiAoa2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGFsbEtleXNDb250YWluZWRJbihrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmtleXMuZXZlcnkoa2V5ID0+IGtleXMuaGFzKGtleSkpO1xuXHR9XG59XG5cbmNsYXNzIENvbXBvc2l0ZUNvbnRleHRLZXlDaGFuZ2VFdmVudCBpbXBsZW1lbnRzIElDb250ZXh0S2V5Q2hhbmdlRXZlbnQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBldmVudHM6IElDb250ZXh0S2V5Q2hhbmdlRXZlbnRbXSkgeyB9XG5cdGFmZmVjdHNTb21lKGtleXM6IElSZWFkYWJsZVNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMuZXZlbnRzKSB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShrZXlzKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGFsbEtleXNDb250YWluZWRJbihrZXlzOiBJUmVhZGFibGVTZXQ8c3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmV2ZW50cy5ldmVyeShldnQgPT4gZXZ0LmFsbEtleXNDb250YWluZWRJbihrZXlzKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYWxsRXZlbnRLZXlzSW5Db250ZXh0KGV2ZW50OiBJQ29udGV4dEtleUNoYW5nZUV2ZW50LCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogYm9vbGVhbiB7XG5cdHJldHVybiBldmVudC5hbGxLZXlzQ29udGFpbmVkSW4obmV3IFNldChPYmplY3Qua2V5cyhjb250ZXh0KSkpO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGV4dEtleVNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByb3RlY3RlZCBfbXlDb250ZXh0SWQ6IG51bWJlcjtcblxuXHRwcm90ZWN0ZWQgX29uRGlkQ2hhbmdlQ29udGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQYXVzZWFibGVFbWl0dGVyPElDb250ZXh0S2V5Q2hhbmdlRXZlbnQ+KHsgbWVyZ2U6IGlucHV0ID0+IG5ldyBDb21wb3NpdGVDb250ZXh0S2V5Q2hhbmdlRXZlbnQoaW5wdXQpIH0pKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGV4dCgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKG15Q29udGV4dElkOiBudW1iZXIpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9teUNvbnRleHRJZCA9IG15Q29udGV4dElkO1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZXh0SWQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbXlDb250ZXh0SWQ7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlS2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQgfCB1bmRlZmluZWQpOiBJQ29udGV4dEtleTxUPiB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvbnRleHRLZXkodGhpcywga2V5LCBkZWZhdWx0VmFsdWUpO1xuXHR9XG5cblxuXHRidWZmZXJDaGFuZ2VFdmVudHMoY2FsbGJhY2s6IEZ1bmN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LnBhdXNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5yZXN1bWUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU2NvcGVkKGRvbU5vZGU6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCk6IElTY29wZWRDb250ZXh0S2V5U2VydmljZSB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSBoYXMgYmVlbiBkaXNwb3NlZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKHRoaXMsIGRvbU5vZGUpO1xuXHR9XG5cblx0Y3JlYXRlT3ZlcmxheShvdmVybGF5OiBJdGVyYWJsZTxbc3RyaW5nLCBhbnldPiA9IEl0ZXJhYmxlLmVtcHR5KCkpOiBJQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBPdmVybGF5Q29udGV4dEtleVNlcnZpY2UodGhpcywgb3ZlcmxheSk7XG5cdH1cblxuXHRwdWJsaWMgY29udGV4dE1hdGNoZXNSdWxlcyhydWxlczogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLmdldENvbnRleHRWYWx1ZXNDb250YWluZXIodGhpcy5fbXlDb250ZXh0SWQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChydWxlcyA/IHJ1bGVzLmV2YWx1YXRlKGNvbnRleHQpIDogdHJ1ZSk7XG5cdFx0Ly8gY29uc29sZS5ncm91cChydWxlcy5zZXJpYWxpemUoKSArICcgLT4gJyArIHJlc3VsdCk7XG5cdFx0Ly8gcnVsZXMua2V5cygpLmZvckVhY2goa2V5ID0+IHsgY29uc29sZS5sb2coa2V5LCBjdHhba2V5XSk7IH0pO1xuXHRcdC8vIGNvbnNvbGUuZ3JvdXBFbmQoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldENvbnRleHRLZXlWYWx1ZTxUPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkKS5nZXRWYWx1ZTxUPihrZXkpO1xuXHR9XG5cblx0cHVibGljIHNldENvbnRleHQoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBteUNvbnRleHQgPSB0aGlzLmdldENvbnRleHRWYWx1ZXNDb250YWluZXIodGhpcy5fbXlDb250ZXh0SWQpO1xuXHRcdGlmICghbXlDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChteUNvbnRleHQuc2V0VmFsdWUoa2V5LCB2YWx1ZSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5maXJlKG5ldyBTaW1wbGVDb250ZXh0S2V5Q2hhbmdlRXZlbnQoa2V5KSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbnRleHQoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkKS5yZW1vdmVWYWx1ZShrZXkpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZmlyZShuZXcgU2ltcGxlQ29udGV4dEtleUNoYW5nZUV2ZW50KGtleSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0KHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IHwgbnVsbCk6IElDb250ZXh0IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIE51bGxDb250ZXh0LklOU1RBTkNFO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGZpbmRDb250ZXh0QXR0cih0YXJnZXQpKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKGNvbnRleHRJZDogbnVtYmVyKTogQ29udGV4dDtcblx0cHVibGljIGFic3RyYWN0IGNyZWF0ZUNoaWxkQ29udGV4dChwYXJlbnRDb250ZXh0SWQ/OiBudW1iZXIpOiBudW1iZXI7XG5cdHB1YmxpYyBhYnN0cmFjdCBkaXNwb3NlQ29udGV4dChjb250ZXh0SWQ6IG51bWJlcik6IHZvaWQ7XG5cdHB1YmxpYyBhYnN0cmFjdCB1cGRhdGVQYXJlbnQocGFyZW50Q29udGV4dEtleVNlcnZpY2U/OiBJQ29udGV4dEtleVNlcnZpY2UpOiB2b2lkO1xuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29udGV4dEtleVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENvbnRleHRLZXlTZXJ2aWNlIGltcGxlbWVudHMgSUNvbnRleHRLZXlTZXJ2aWNlIHtcblxuXHRwcml2YXRlIF9sYXN0Q29udGV4dElkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRzID0gbmV3IE1hcDxudW1iZXIsIENvbnRleHQ+KCk7XG5cblx0cHJpdmF0ZSBpbnB1dEZvY3VzZWRDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3RvcihASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigwKTtcblx0XHR0aGlzLl9sYXN0Q29udGV4dElkID0gMDtcblx0XHR0aGlzLmlucHV0Rm9jdXNlZENvbnRleHQgPSBJbnB1dEZvY3VzZWRDb250ZXh0LmJpbmRUbyh0aGlzKTtcblxuXHRcdGNvbnN0IG15Q29udGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb25maWdBd2FyZUNvbnRleHRWYWx1ZXNDb250YWluZXIodGhpcy5fbXlDb250ZXh0SWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQpKTtcblx0XHR0aGlzLl9jb250ZXh0cy5zZXQodGhpcy5fbXlDb250ZXh0SWQsIG15Q29udGV4dCk7XG5cblx0XHQvLyBVbmNvbW1lbnQgdGhpcyB0byBzZWUgdGhlIGNvbnRleHRzIGNvbnRpbnVvdXNseSBsb2dnZWRcblx0XHQvLyBsZXQgbGFzdExvZ2dlZFZhbHVlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHQvLyBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0Ly8gXHRsZXQgdmFsdWVzID0gT2JqZWN0LmtleXModGhpcy5fY29udGV4dHMpLm1hcCgoa2V5KSA9PiB0aGlzLl9jb250ZXh0c1trZXldKTtcblx0XHQvLyBcdGxldCBsb2dWYWx1ZSA9IHZhbHVlcy5tYXAodiA9PiBKU09OLnN0cmluZ2lmeSh2Ll92YWx1ZSwgbnVsbCwgJ1xcdCcpKS5qb2luKCdcXG4nKTtcblx0XHQvLyBcdGlmIChsYXN0TG9nZ2VkVmFsdWUgIT09IGxvZ1ZhbHVlKSB7XG5cdFx0Ly8gXHRcdGxhc3RMb2dnZWRWYWx1ZSA9IGxvZ1ZhbHVlO1xuXHRcdC8vIFx0XHRjb25zb2xlLmxvZyhsYXN0TG9nZ2VkVmFsdWUpO1xuXHRcdC8vIFx0fVxuXHRcdC8vIH0sIDIwMDApO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG9uRGlkUmVnaXN0ZXJXaW5kb3csICh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0Y29uc3Qgb25Gb2N1c0Rpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3csIEV2ZW50VHlwZS5GT0NVU19JTiwgKCkgPT4ge1xuXHRcdFx0XHRvbkZvY3VzRGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRDb250ZXh0S2V5cyh3aW5kb3cuZG9jdW1lbnQsIG9uRm9jdXNEaXNwb3NhYmxlcy52YWx1ZSk7XG5cdFx0XHR9LCB0cnVlKSk7XG5cdFx0fSwgeyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUlucHV0Q29udGV4dEtleXMob3duZXJEb2N1bWVudDogRG9jdW1lbnQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblxuXHRcdGZ1bmN0aW9uIGFjdGl2ZUVsZW1lbnRJc0lucHV0KCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuICEhb3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ICYmIGlzRWRpdGFibGVFbGVtZW50KG93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNJbnB1dEZvY3VzZWQgPSBhY3RpdmVFbGVtZW50SXNJbnB1dCgpO1xuXHRcdHRoaXMuaW5wdXRGb2N1c2VkQ29udGV4dC5zZXQoaXNJbnB1dEZvY3VzZWQpO1xuXG5cdFx0aWYgKGlzSW5wdXRGb2N1c2VkKSB7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRyYWNrRm9jdXMob3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50KSk7XG5cdFx0XHRFdmVudC5vbmNlKHRyYWNrZXIub25EaWRCbHVyKSgoKSA9PiB7XG5cblx0XHRcdFx0Ly8gRW5zdXJlIHdlIGFyZSBvbmx5IHVwZGF0aW5nIHRoZSBjb250ZXh0IGtleSBpZiB3ZSBhcmVcblx0XHRcdFx0Ly8gc3RpbGwgaW4gdGhlIHNhbWUgZG9jdW1lbnQgdGhhdCB3ZSBhcmUgdHJhY2tpbmcuIFRoaXNcblx0XHRcdFx0Ly8gZml4ZXMgYSByYWNlIGNvbmRpdGlvbiBpbiBtdWx0aS13aW5kb3cgc2V0dXBzIHdoZXJlXG5cdFx0XHRcdC8vIHRoZSBibHVyIGV2ZW50IGFycml2ZXMgaW4gdGhlIGluYWN0aXZlIHdpbmRvdyBvdmVyd3JpdGluZ1xuXHRcdFx0XHQvLyB0aGUgY29udGV4dCBrZXkgb2YgdGhlIGFjdGl2ZSB3aW5kb3cuIFRoaXMgaXMgYmVjYXVzZVxuXHRcdFx0XHQvLyBibHVyIGV2ZW50cyBmcm9tIHRoZSBmb2N1cyB0cmFja2VyIGFyZSBlbWl0dGVkIHdpdGggYVxuXHRcdFx0XHQvLyB0aW1lb3V0IG9mIDAuXG5cblx0XHRcdFx0aWYgKGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50ID09PSBvd25lckRvY3VtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dEZvY3VzZWRDb250ZXh0LnNldChhY3RpdmVFbGVtZW50SXNJbnB1dCgpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyYWNrZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldENvbnRleHRWYWx1ZXNDb250YWluZXIoY29udGV4dElkOiBudW1iZXIpOiBDb250ZXh0IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIE51bGxDb250ZXh0LklOU1RBTkNFO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dHMuZ2V0KGNvbnRleHRJZCkgfHwgTnVsbENvbnRleHQuSU5TVEFOQ0U7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ2hpbGRDb250ZXh0KHBhcmVudENvbnRleHRJZDogbnVtYmVyID0gdGhpcy5fbXlDb250ZXh0SWQpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbnRleHRLZXlTZXJ2aWNlIGhhcyBiZWVuIGRpc3Bvc2VkYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGlkID0gKCsrdGhpcy5fbGFzdENvbnRleHRJZCk7XG5cdFx0dGhpcy5fY29udGV4dHMuc2V0KGlkLCBuZXcgQ29udGV4dChpZCwgdGhpcy5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHBhcmVudENvbnRleHRJZCkpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZUNvbnRleHQoY29udGV4dElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRzLmRlbGV0ZShjb250ZXh0SWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVQYXJlbnQoX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1cGRhdGUgcGFyZW50IG9mIHJvb3QgQ29udGV4dEtleVNlcnZpY2UnKTtcblx0fVxufVxuXG5jbGFzcyBTY29wZWRDb250ZXh0S2V5U2VydmljZSBleHRlbmRzIEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgX3BhcmVudDogQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBfZG9tTm9kZTogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudENoYW5nZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSwgZG9tTm9kZTogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KSB7XG5cdFx0c3VwZXIocGFyZW50LmNyZWF0ZUNoaWxkQ29udGV4dCgpKTtcblx0XHR0aGlzLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5fdXBkYXRlUGFyZW50Q2hhbmdlTGlzdGVuZXIoKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb21Ob2RlO1xuXHRcdGlmICh0aGlzLl9kb21Ob2RlLmhhc0F0dHJpYnV0ZShLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUikpIHtcblx0XHRcdGxldCBleHRyYUluZm8gPSAnJztcblx0XHRcdGlmICgodGhpcy5fZG9tTm9kZSBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0KSB7XG5cdFx0XHRcdGV4dHJhSW5mbyA9IEFycmF5LmZyb20oKHRoaXMuX2RvbU5vZGUgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC52YWx1ZXMoKSkuam9pbignLCAnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc29sZS5lcnJvcihgRWxlbWVudCBhbHJlYWR5IGhhcyBjb250ZXh0IGF0dHJpYnV0ZSR7ZXh0cmFJbmZvID8gJzogJyArIGV4dHJhSW5mbyA6ICcnfWApO1xuXHRcdH1cblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZShLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUiwgU3RyaW5nKHRoaXMuX215Q29udGV4dElkKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQYXJlbnRDaGFuZ2VMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHQvLyBGb3J3YXJkIHBhcmVudCBldmVudHMgdG8gdGhpcyBsaXN0ZW5lci4gUGFyZW50IHdpbGwgY2hhbmdlLlxuXHRcdHRoaXMuX3BhcmVudENoYW5nZUxpc3RlbmVyLnZhbHVlID0gdGhpcy5fcGFyZW50Lm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGNvbnN0IHRoaXNDb250YWluZXIgPSB0aGlzLl9wYXJlbnQuZ2V0Q29udGV4dFZhbHVlc0NvbnRhaW5lcih0aGlzLl9teUNvbnRleHRJZCk7XG5cdFx0XHRjb25zdCB0aGlzQ29udGV4dFZhbHVlcyA9IHRoaXNDb250YWluZXIudmFsdWU7XG5cblx0XHRcdGlmICghYWxsRXZlbnRLZXlzSW5Db250ZXh0KGUsIHRoaXNDb250ZXh0VmFsdWVzKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZmlyZShlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgdGhlIHBhcmVudCBjaGFuZ2UgbGlzdGVuZXIgYmVmb3JlIGRpc3Bvc2VDb250ZXh0IHRvIGF2b2lkXG5cdFx0Ly8gZm9yd2FyZGluZyBwYXJlbnQgZXZlbnRzIGFmdGVyIHRoaXMgc2VydmljZSBoYXMgYmVndW4gdGVhcmluZyBkb3duLlxuXHRcdHRoaXMuX3BhcmVudENoYW5nZUxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGFyZW50LmRpc3Bvc2VDb250ZXh0KHRoaXMuX215Q29udGV4dElkKTtcblx0XHR0aGlzLl9kb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUik7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRleHRWYWx1ZXNDb250YWluZXIoY29udGV4dElkOiBudW1iZXIpOiBDb250ZXh0IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIE51bGxDb250ZXh0LklOU1RBTkNFO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGFyZW50LmdldENvbnRleHRWYWx1ZXNDb250YWluZXIoY29udGV4dElkKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVDaGlsZENvbnRleHQocGFyZW50Q29udGV4dElkOiBudW1iZXIgPSB0aGlzLl9teUNvbnRleHRJZCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5jcmVhdGVDaGlsZENvbnRleHQocGFyZW50Q29udGV4dElkKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlQ29udGV4dChjb250ZXh0SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIEFsd2F5cyBmb3J3YXJkIHRvIHBhcmVudCBldmVuIGFmdGVyIGRpc3Bvc2FsIFx1MjAxNCBhIGNoaWxkIGNvbnRleHQgbWF5XG5cdFx0Ly8gYmUgZGlzcG9zZWQgYWZ0ZXIgdXMgYW5kIG11c3Qgc3RpbGwgcmVhY2ggdGhlIHJvb3QgQ29udGV4dEtleVNlcnZpY2Vcblx0XHQvLyB0byBkZWxldGUgaXRzIGVudHJ5IGZyb20gX2NvbnRleHRzLlxuXHRcdHRoaXMuX3BhcmVudC5kaXNwb3NlQ29udGV4dChjb250ZXh0SWQpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVBhcmVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZTogQWJzdHJhY3RDb250ZXh0S2V5U2VydmljZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wYXJlbnQgPT09IHBhcmVudENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhpc0NvbnRhaW5lciA9IHRoaXMuX3BhcmVudC5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX215Q29udGV4dElkKTtcblx0XHRjb25zdCBvbGRBbGxWYWx1ZXMgPSB0aGlzQ29udGFpbmVyLmNvbGxlY3RBbGxWYWx1ZXMoKTtcblx0XHR0aGlzLl9wYXJlbnQgPSBwYXJlbnRDb250ZXh0S2V5U2VydmljZTtcblx0XHR0aGlzLl91cGRhdGVQYXJlbnRDaGFuZ2VMaXN0ZW5lcigpO1xuXHRcdGNvbnN0IG5ld1BhcmVudENvbnRhaW5lciA9IHRoaXMuX3BhcmVudC5nZXRDb250ZXh0VmFsdWVzQ29udGFpbmVyKHRoaXMuX3BhcmVudC5jb250ZXh0SWQpO1xuXHRcdHRoaXNDb250YWluZXIudXBkYXRlUGFyZW50KG5ld1BhcmVudENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBuZXdBbGxWYWx1ZXMgPSB0aGlzQ29udGFpbmVyLmNvbGxlY3RBbGxWYWx1ZXMoKTtcblx0XHRjb25zdCBhbGxWYWx1ZXNEaWZmID0ge1xuXHRcdFx0Li4uZGlzdGluY3Qob2xkQWxsVmFsdWVzLCBuZXdBbGxWYWx1ZXMpLFxuXHRcdFx0Li4uZGlzdGluY3QobmV3QWxsVmFsdWVzLCBvbGRBbGxWYWx1ZXMpXG5cdFx0fTtcblx0XHRjb25zdCBjaGFuZ2VkS2V5cyA9IE9iamVjdC5rZXlzKGFsbFZhbHVlc0RpZmYpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUobmV3IEFycmF5Q29udGV4dEtleUNoYW5nZUV2ZW50KGNoYW5nZWRLZXlzKSk7XG5cdH1cbn1cblxuY2xhc3MgT3ZlcmxheUNvbnRleHQgaW1wbGVtZW50cyBJQ29udGV4dCB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwYXJlbnQ6IElDb250ZXh0LCBwcml2YXRlIG92ZXJsYXk6IFJlYWRvbmx5TWFwPHN0cmluZywgYW55PikgeyB9XG5cblx0Z2V0VmFsdWU8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5vdmVybGF5LmhhcyhrZXkpID8gdGhpcy5vdmVybGF5LmdldChrZXkpIDogdGhpcy5wYXJlbnQuZ2V0VmFsdWU8VD4oa2V5KTtcblx0fVxufVxuXG5jbGFzcyBPdmVybGF5Q29udGV4dEtleVNlcnZpY2UgaW1wbGVtZW50cyBJQ29udGV4dEtleVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIG92ZXJsYXk6IE1hcDxzdHJpbmcsIGFueT47XG5cblx0Z2V0IGNvbnRleHRJZCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnBhcmVudC5jb250ZXh0SWQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb250ZXh0KCk6IEV2ZW50PElDb250ZXh0S2V5Q2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQub25EaWRDaGFuZ2VDb250ZXh0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwYXJlbnQ6IEFic3RyYWN0Q29udGV4dEtleVNlcnZpY2UgfCBPdmVybGF5Q29udGV4dEtleVNlcnZpY2UsIG92ZXJsYXk6IEl0ZXJhYmxlPFtzdHJpbmcsIGFueV0+KSB7XG5cdFx0dGhpcy5vdmVybGF5ID0gbmV3IE1hcChvdmVybGF5KTtcblx0fVxuXG5cdGJ1ZmZlckNoYW5nZUV2ZW50cyhjYWxsYmFjazogRnVuY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLnBhcmVudC5idWZmZXJDaGFuZ2VFdmVudHMoY2FsbGJhY2spO1xuXHR9XG5cblx0Y3JlYXRlS2V5PFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+KCk6IElDb250ZXh0S2V5PFQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cblxuXHRnZXRDb250ZXh0KHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IHwgbnVsbCk6IElDb250ZXh0IHtcblx0XHRyZXR1cm4gbmV3IE92ZXJsYXlDb250ZXh0KHRoaXMucGFyZW50LmdldENvbnRleHQodGFyZ2V0KSwgdGhpcy5vdmVybGF5KTtcblx0fVxuXG5cdGdldENvbnRleHRWYWx1ZXNDb250YWluZXIoY29udGV4dElkOiBudW1iZXIpOiBJQ29udGV4dCB7XG5cdFx0Y29uc3QgcGFyZW50Q29udGV4dCA9IHRoaXMucGFyZW50LmdldENvbnRleHRWYWx1ZXNDb250YWluZXIoY29udGV4dElkKTtcblx0XHRyZXR1cm4gbmV3IE92ZXJsYXlDb250ZXh0KHBhcmVudENvbnRleHQsIHRoaXMub3ZlcmxheSk7XG5cdH1cblxuXHRjb250ZXh0TWF0Y2hlc1J1bGVzKHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLmdldENvbnRleHRWYWx1ZXNDb250YWluZXIodGhpcy5jb250ZXh0SWQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChydWxlcyA/IHJ1bGVzLmV2YWx1YXRlKGNvbnRleHQpIDogdHJ1ZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldENvbnRleHRLZXlWYWx1ZTxUPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm92ZXJsYXkuaGFzKGtleSkgPyB0aGlzLm92ZXJsYXkuZ2V0KGtleSkgOiB0aGlzLnBhcmVudC5nZXRDb250ZXh0S2V5VmFsdWUoa2V5KTtcblx0fVxuXG5cdGNyZWF0ZVNjb3BlZCgpOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZC4nKTtcblx0fVxuXG5cdGNyZWF0ZU92ZXJsYXkob3ZlcmxheTogSXRlcmFibGU8W3N0cmluZywgYW55XT4gPSBJdGVyYWJsZS5lbXB0eSgpKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRyZXR1cm4gbmV3IE92ZXJsYXlDb250ZXh0S2V5U2VydmljZSh0aGlzLCBvdmVybGF5KTtcblx0fVxuXG5cdHVwZGF0ZVBhcmVudCgpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmluZENvbnRleHRBdHRyKGRvbU5vZGU6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCB8IG51bGwpOiBudW1iZXIge1xuXHR3aGlsZSAoZG9tTm9kZSkge1xuXHRcdGlmIChkb21Ob2RlLmhhc0F0dHJpYnV0ZShLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUikpIHtcblx0XHRcdGNvbnN0IGF0dHIgPSBkb21Ob2RlLmdldEF0dHJpYnV0ZShLRVlCSU5ESU5HX0NPTlRFWFRfQVRUUik7XG5cdFx0XHRpZiAoYXR0cikge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VJbnQoYXR0ciwgMTApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE5hTjtcblx0XHR9XG5cdFx0ZG9tTm9kZSA9IGRvbU5vZGUucGFyZW50RWxlbWVudDtcblx0fVxuXHRyZXR1cm4gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHRLZXk6IGFueSwgY29udGV4dFZhbHVlOiBhbnkpIHtcblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KFN0cmluZyhjb250ZXh0S2V5KSwgc3RyaW5naWZ5VVJJcyhjb250ZXh0VmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gc3RyaW5naWZ5VVJJcyhjb250ZXh0VmFsdWU6IGFueSk6IGFueSB7XG5cdHJldHVybiBjbG9uZUFuZENoYW5nZShjb250ZXh0VmFsdWUsIChvYmopID0+IHtcblx0XHRpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiYgKDxNYXJzaGFsbGVkT2JqZWN0Pm9iaikuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlVyaSkge1xuXHRcdFx0cmV0dXJuIFVSSS5yZXZpdmUob2JqKS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRpZiAob2JqIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gb2JqLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0pO1xufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3NldENvbnRleHQnLCBzZXRDb250ZXh0KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ2dldENvbnRleHRLZXlJbmZvJyxcblx0aGFuZGxlcigpIHtcblx0XHRyZXR1cm4gWy4uLlJhd0NvbnRleHRLZXkuYWxsKCldLnNvcnQoKGEsIGIpID0+IGEua2V5LmxvY2FsZUNvbXBhcmUoYi5rZXkpKTtcblx0fSxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldENvbnRleHRLZXlJbmZvJywgXCJBIGNvbW1hbmQgdGhhdCByZXR1cm5zIGluZm9ybWF0aW9uIGFib3V0IGNvbnRleHQga2V5c1wiKSxcblx0XHRhcmdzOiBbXVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19nZW5lcmF0ZUNvbnRleHRLZXlJbmZvJywgZnVuY3Rpb24gKCkge1xuXHRjb25zdCByZXN1bHQ6IENvbnRleHRLZXlJbmZvW10gPSBbXTtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IGluZm8gb2YgUmF3Q29udGV4dEtleS5hbGwoKSkge1xuXHRcdGlmICghc2Vlbi5oYXMoaW5mby5rZXkpKSB7XG5cdFx0XHRzZWVuLmFkZChpbmZvLmtleSk7XG5cdFx0XHRyZXN1bHQucHVzaChpbmZvKTtcblx0XHR9XG5cdH1cblx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IGEua2V5LmxvY2FsZUNvbXBhcmUoYi5rZXkpKTtcblx0Y29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkocmVzdWx0LCB1bmRlZmluZWQsIDIpKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFrQixPQUFPLHdCQUF3QjtBQUNqRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUU1RSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQixVQUFVLGNBQWM7QUFDakQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUErRyxvQkFBc0YscUJBQXFCO0FBRTFOLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUJBQXVCLFdBQVcsaUJBQWlCLG1CQUFtQixxQkFBcUIsa0JBQWtCO0FBRXRILE1BQU0sMEJBQTBCO0FBRXpCLE1BQU0sUUFBNEI7QUFBQSxFQU14QyxZQUFZLElBQVksUUFBd0I7QUFDL0MsU0FBSyxNQUFNO0FBQ1gsU0FBSyxVQUFVO0FBQ2YsU0FBSyxTQUFTLHVCQUFPLE9BQU8sSUFBSTtBQUNoQyxTQUFLLE9BQU8sWUFBWSxJQUFJO0FBQUEsRUFDN0I7QUFBQSxFQUVBLElBQVcsUUFBNkI7QUFDdkMsV0FBTyxFQUFFLEdBQUcsS0FBSyxPQUFPO0FBQUEsRUFDekI7QUFBQSxFQUVPLFNBQVMsS0FBYSxPQUFxQjtBQUVqRCxRQUFJLENBQUMsT0FBTyxLQUFLLE9BQU8sR0FBRyxHQUFHLEtBQUssR0FBRztBQUNyQyxXQUFLLE9BQU8sR0FBRyxJQUFJO0FBQ25CLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFlBQVksS0FBc0I7QUFFeEMsUUFBSSxPQUFPLEtBQUssUUFBUTtBQUN2QixhQUFPLEtBQUssT0FBTyxHQUFHO0FBQ3RCLGFB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
