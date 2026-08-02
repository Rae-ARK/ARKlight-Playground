import { GlobalIdleValue } from "../../../base/common/async.js";
import { illegalState } from "../../../base/common/errors.js";
import { dispose, isDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { SyncDescriptor } from "./descriptors.js";
import { Graph } from "./graph.js";
import { IInstantiationService, _util } from "./instantiation.js";
import { ServiceCollection } from "./serviceCollection.js";
import { LinkedList } from "../../../base/common/linkedList.js";
const _enableAllTracing = false;
class CyclicDependencyError extends Error {
  constructor(graph) {
    super("cyclic dependency between services");
    this.message = graph.findCycleSlow() ?? `UNABLE to detect cycle, dumping graph: 
${graph.toString()}`;
  }
}
class InstantiationService {
  constructor(_services = new ServiceCollection(), _strict = false, _parent, _enableTracing = _enableAllTracing) {
    this._services = _services;
    this._strict = _strict;
    this._parent = _parent;
    this._enableTracing = _enableTracing;
    this._isDisposed = false;
    this._servicesToMaybeDispose = /* @__PURE__ */ new Set();
    this._children = /* @__PURE__ */ new Set();
    this._activeInstantiations = /* @__PURE__ */ new Set();
    this._services.set(IInstantiationService, this);
    this._globalGraph = _enableTracing ? _parent?._globalGraph ?? new Graph((e) => e) : void 0;
  }
  dispose() {
    if (!this._isDisposed) {
      this._isDisposed = true;
      dispose(this._children);
      this._children.clear();
      for (const candidate of this._servicesToMaybeDispose) {
        if (isDisposable(candidate)) {
          candidate.dispose();
        }
      }
      this._servicesToMaybeDispose.clear();
    }
  }
  _throwIfDisposed() {
    if (this._isDisposed) {
      throw new Error("InstantiationService has been disposed");
    }
  }
  createChild(services, store) {
    this._throwIfDisposed();
    const that = this;
    const result = new class extends InstantiationService {
      dispose() {
        that._children.delete(result);
        super.dispose();
      }
    }(services, this._strict, this, this._enableTracing);
    this._children.add(result);
    store?.add(result);
    return result;
  }
  invokeFunction(fn, ...args) {
    this._throwIfDisposed();
    const _trace = Trace.traceInvocation(this._enableTracing, fn);
    let _done = false;
    try {
      const accessor = {
        get: (id) => {
          if (_done) {
            throw illegalState("service accessor is only valid during the invocation of its target method");
          }
          const result = this._getOrCreateServiceInstance(id, _trace);
          if (!result) {
            this._throwIfStrict(`[invokeFunction] unknown service '${id}'`, false);
          }
          return result;
        }
      };
      return fn(accessor, ...args);
    } finally {
      _done = true;
      _trace.stop();
    }
  }
  createInstance(ctorOrDescriptor, ...rest) {
    this._throwIfDisposed();
    let _trace;
    let result;
    if (ctorOrDescriptor instanceof SyncDescriptor) {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor.ctor);
      result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
    } else {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor);
      result = this._createInstance(ctorOrDescriptor, rest, _trace);
    }
    _trace.stop();
    return result;
  }
  _createInstance(ctor, args = [], _trace) {
    const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
    const serviceArgs = [];
    for (const dependency of serviceDependencies) {
      const service = this._getOrCreateServiceInstance(dependency.id, _trace);
      if (!service) {
        this._throwIfStrict(`[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`, false);
      }
      serviceArgs.push(service);
    }
    const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;
    if (args.length !== firstServiceArgPos) {
      console.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);
      const delta = firstServiceArgPos - args.length;
      if (delta > 0) {
        args = args.concat(new Array(delta));
      } else {
        args = args.slice(0, firstServiceArgPos);
      }
    }
    return Reflect.construct(ctor, args.concat(serviceArgs));
  }
  _setCreatedServiceInstance(id, instance) {
    if (this._services.get(id) instanceof SyncDescriptor) {
      this._services.set(id, instance);
    } else if (this._parent) {
      this._parent._setCreatedServiceInstance(id, instance);
    } else {
      throw new Error("illegalState - setting UNKNOWN service instance");
    }
  }
  _getServiceInstanceOrDescriptor(id) {
    const instanceOrDesc = this._services.get(id);
    if (!instanceOrDesc && this._parent) {
      return this._parent._getServiceInstanceOrDescriptor(id);
    } else {
      return instanceOrDesc;
    }
  }
  _getOrCreateServiceInstance(id, _trace) {
    if (this._globalGraph && this._globalGraphImplicitDependency) {
      this._globalGraph.insertEdge(this._globalGraphImplicitDependency, String(id));
    }
    const thing = this._getServiceInstanceOrDescriptor(id);
    if (thing instanceof SyncDescriptor) {
      return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
    } else {
      _trace.branch(id, false);
      return thing;
    }
  }
  _safeCreateAndCacheServiceInstance(id, desc, _trace) {
    if (this._activeInstantiations.has(id)) {
      throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
    }
    this._activeInstantiations.add(id);
    try {
      return this._createAndCacheServiceInstance(id, desc, _trace);
    } finally {
      this._activeInstantiations.delete(id);
    }
  }
  _createAndCacheServiceInstance(id, desc, _trace) {
    const graph = new Graph((data) => data.id.toString());
    let cycleCount = 0;
    const stack = [{ id, desc, _trace }];
    const seen = /* @__PURE__ */ new Set();
    while (stack.length) {
      const item = stack.pop();
      if (seen.has(String(item.id))) {
        continue;
      }
      seen.add(String(item.id));
      graph.lookupOrInsertNode(item);
      if (cycleCount++ > 1e3) {
        throw new CyclicDependencyError(graph);
      }
      for (const dependency of _util.getServiceDependencies(item.desc.ctor)) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
        if (!instanceOrDesc) {
          this._throwIfStrict(`[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`, true);
        }
        this._globalGraph?.insertEdge(String(item.id), String(dependency.id));
        if (instanceOrDesc instanceof SyncDescriptor) {
          const d = { id: dependency.id, desc: instanceOrDesc, _trace: item._trace.branch(dependency.id, true) };
          graph.insertEdge(item, d);
          stack.push(d);
        }
      }
    }
    while (true) {
      const roots = graph.roots();
      if (roots.length === 0) {
        if (!graph.isEmpty()) {
          throw new CyclicDependencyError(graph);
        }
        break;
      }
      for (const { data } of roots) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
        if (instanceOrDesc instanceof SyncDescriptor) {
          const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
          this._setCreatedServiceInstance(data.id, instance);
        }
        graph.removeNode(data);
      }
    }
    return this._getServiceInstanceOrDescriptor(id);
  }
  _createServiceInstanceWithOwner(id, ctor, args = [], supportsDelayedInstantiation, _trace) {
    if (this._services.get(id) instanceof SyncDescriptor) {
      return this._createServiceInstance(id, ctor, args, supportsDelayedInstantiation, _trace, this._servicesToMaybeDispose);
    } else if (this._parent) {
      return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
    } else {
      throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
    }
  }
  _createServiceInstance(id, ctor, args = [], supportsDelayedInstantiation, _trace, disposeBucket) {
    if (!supportsDelayedInstantiation) {
      const result = this._createInstance(ctor, args, _trace);
      disposeBucket.add(result);
      return result;
    } else {
      const child = new InstantiationService(void 0, this._strict, this, this._enableTracing);
      child._globalGraphImplicitDependency = String(id);
      const earlyListeners = /* @__PURE__ */ new Map();
      const idle = new GlobalIdleValue(() => {
        const result = child._createInstance(ctor, args, _trace);
        for (const [key, values] of earlyListeners) {
          const candidate = result[key];
          if (typeof candidate === "function") {
            for (const value of values) {
              value.disposable = candidate.apply(result, value.listener);
            }
          }
        }
        earlyListeners.clear();
        disposeBucket.add(result);
        return result;
      });
      return new Proxy(/* @__PURE__ */ Object.create(null), {
        get(target, key) {
          if (!idle.isInitialized) {
            if (typeof key === "string" && (key.startsWith("onDid") || key.startsWith("onWill"))) {
              let list = earlyListeners.get(key);
              if (!list) {
                list = new LinkedList();
                earlyListeners.set(key, list);
              }
              const event = (callback, thisArg, disposables) => {
                if (idle.isInitialized) {
                  return idle.value[key](callback, thisArg, disposables);
                } else {
                  const entry = { listener: [callback, thisArg, disposables], disposable: void 0 };
                  const rm = list.push(entry);
                  const result = toDisposable(() => {
                    rm();
                    entry.disposable?.dispose();
                  });
                  return result;
                }
              };
              return event;
            }
          }
          if (key in target) {
            return target[key];
          }
          const obj = idle.value;
          let prop = obj[key];
          if (typeof prop !== "function") {
            return prop;
          }
          prop = prop.bind(obj);
          target[key] = prop;
          return prop;
        },
        set(_target, p, value) {
          idle.value[p] = value;
          return true;
        },
        getPrototypeOf(_target) {
          return ctor.prototype;
        }
      });
    }
  }
  _throwIfStrict(msg, printWarning) {
    if (printWarning) {
      console.warn(msg);
    }
    if (this._strict) {
      throw new Error(msg);
    }
  }
}
var TraceType = /* @__PURE__ */ ((TraceType2) => {
  TraceType2[TraceType2["None"] = 0] = "None";
  TraceType2[TraceType2["Creation"] = 1] = "Creation";
  TraceType2[TraceType2["Invocation"] = 2] = "Invocation";
  TraceType2[TraceType2["Branch"] = 3] = "Branch";
  return TraceType2;
})(TraceType || {});
const _Trace = class _Trace {
  constructor(type, name) {
    this.type = type;
    this.name = name;
    this._start = Date.now();
    this._dep = [];
  }
  static traceInvocation(_enableTracing, ctor) {
    return !_enableTracing ? _Trace._None : new _Trace(2 /* Invocation */, ctor.name || new Error().stack.split("\n").slice(3, 4).join("\n"));
  }
  static traceCreation(_enableTracing, ctor) {
    return !_enableTracing ? _Trace._None : new _Trace(1 /* Creation */, ctor.name);
  }
  branch(id, first) {
    const child = new _Trace(3 /* Branch */, id.toString());
    this._dep.push([id, first, child]);
    return child;
  }
  stop() {
    const dur = Date.now() - this._start;
    _Trace._totals += dur;
    let causedCreation = false;
    function printChild(n, trace) {
      const res = [];
      const prefix = new Array(n + 1).join("	");
      for (const [id, first, child] of trace._dep) {
        if (first && child) {
          causedCreation = true;
          res.push(`${prefix}CREATES -> ${id}`);
          const nested = printChild(n + 1, child);
          if (nested) {
            res.push(nested);
          }
        } else {
          res.push(`${prefix}uses -> ${id}`);
        }
      }
      return res.join("\n");
    }
    const lines = [
      `${this.type === 1 /* Creation */ ? "CREATE" : "CALL"} ${this.name}`,
      `${printChild(1, this)}`,
      `DONE, took ${dur.toFixed(2)}ms (grand total ${_Trace._totals.toFixed(2)}ms)`
    ];
    if (dur > 2 || causedCreation) {
      _Trace.all.add(lines.join("\n"));
    }
  }
};
_Trace.all = /* @__PURE__ */ new Set();
_Trace._None = new class extends _Trace {
  constructor() {
    super(0 /* None */, null);
  }
  stop() {
  }
  branch() {
    return this;
  }
}();
_Trace._totals = 0;
let Trace = _Trace;
export {
  InstantiationService,
  Trace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgR2xvYmFsSWRsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpbGxlZ2FsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgaXNEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IsIFN5bmNEZXNjcmlwdG9yMCB9IGZyb20gJy4vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgR3JhcGggfSBmcm9tICcuL2dyYXBoLmpzJztcbmltcG9ydCB7IEdldExlYWRpbmdOb25TZXJ2aWNlQXJncywgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlSWRlbnRpZmllciwgU2VydmljZXNBY2Nlc3NvciwgX3V0aWwgfSBmcm9tICcuL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcblxuLy8gVFJBQ0lOR1xuY29uc3QgX2VuYWJsZUFsbFRyYWNpbmcgPSBmYWxzZVxuXHQvLyB8fCBcIlRSVUVcIiAvLyBETyBOT1QgQ0hFQ0sgSU4hXG5cdDtcblxuY2xhc3MgQ3ljbGljRGVwZW5kZW5jeUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihncmFwaDogR3JhcGg8YW55Pikge1xuXHRcdHN1cGVyKCdjeWNsaWMgZGVwZW5kZW5jeSBiZXR3ZWVuIHNlcnZpY2VzJyk7XG5cdFx0dGhpcy5tZXNzYWdlID0gZ3JhcGguZmluZEN5Y2xlU2xvdygpID8/IGBVTkFCTEUgdG8gZGV0ZWN0IGN5Y2xlLCBkdW1waW5nIGdyYXBoOiBcXG4ke2dyYXBoLnRvU3RyaW5nKCl9YDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFudGlhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IF9nbG9iYWxHcmFwaD86IEdyYXBoPHN0cmluZz47XG5cdHByaXZhdGUgX2dsb2JhbEdyYXBoSW1wbGljaXREZXBlbmRlbmN5Pzogc3RyaW5nO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmljZXNUb01heWJlRGlzcG9zZSA9IG5ldyBTZXQ8YW55PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGlsZHJlbiA9IG5ldyBTZXQ8SW5zdGFudGlhdGlvblNlcnZpY2U+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VydmljZXM6IFNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RyaWN0OiBib29sZWFuID0gZmFsc2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50PzogSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW5hYmxlVHJhY2luZzogYm9vbGVhbiA9IF9lbmFibGVBbGxUcmFjaW5nXG5cdCkge1xuXG5cdFx0dGhpcy5fc2VydmljZXMuc2V0KElJbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcyk7XG5cdFx0dGhpcy5fZ2xvYmFsR3JhcGggPSBfZW5hYmxlVHJhY2luZyA/IF9wYXJlbnQ/Ll9nbG9iYWxHcmFwaCA/PyBuZXcgR3JhcGgoZSA9PiBlKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdC8vIGRpc3Bvc2UgYWxsIGNoaWxkIHNlcnZpY2VzXG5cdFx0XHRkaXNwb3NlKHRoaXMuX2NoaWxkcmVuKTtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLmNsZWFyKCk7XG5cblx0XHRcdC8vIGRpc3Bvc2UgYWxsIHNlcnZpY2VzIGNyZWF0ZWQgYnkgdGhpcyBzZXJ2aWNlXG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0aGlzLl9zZXJ2aWNlc1RvTWF5YmVEaXNwb3NlKSB7XG5cdFx0XHRcdGlmIChpc0Rpc3Bvc2FibGUoY2FuZGlkYXRlKSkge1xuXHRcdFx0XHRcdGNhbmRpZGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlcnZpY2VzVG9NYXliZURpc3Bvc2UuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd0lmRGlzcG9zZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW5zdGFudGlhdGlvblNlcnZpY2UgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHR9XG5cdH1cblxuXHRjcmVhdGVDaGlsZChzZXJ2aWNlczogU2VydmljZUNvbGxlY3Rpb24sIHN0b3JlPzogRGlzcG9zYWJsZVN0b3JlKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHR0aGlzLl90aHJvd0lmRGlzcG9zZWQoKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBjbGFzcyBleHRlbmRzIEluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdHRoYXQuX2NoaWxkcmVuLmRlbGV0ZShyZXN1bHQpO1xuXHRcdFx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fShzZXJ2aWNlcywgdGhpcy5fc3RyaWN0LCB0aGlzLCB0aGlzLl9lbmFibGVUcmFjaW5nKTtcblx0XHR0aGlzLl9jaGlsZHJlbi5hZGQocmVzdWx0KTtcblxuXHRcdHN0b3JlPy5hZGQocmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aW52b2tlRnVuY3Rpb248UiwgVFMgZXh0ZW5kcyBhbnlbXSA9IFtdPihmbjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiBUUykgPT4gUiwgLi4uYXJnczogVFMpOiBSIHtcblx0XHR0aGlzLl90aHJvd0lmRGlzcG9zZWQoKTtcblxuXHRcdGNvbnN0IF90cmFjZSA9IFRyYWNlLnRyYWNlSW52b2NhdGlvbih0aGlzLl9lbmFibGVUcmFjaW5nLCBmbik7XG5cdFx0bGV0IF9kb25lID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yID0ge1xuXHRcdFx0XHRnZXQ6IDxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4pID0+IHtcblxuXHRcdFx0XHRcdGlmIChfZG9uZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgaWxsZWdhbFN0YXRlKCdzZXJ2aWNlIGFjY2Vzc29yIGlzIG9ubHkgdmFsaWQgZHVyaW5nIHRoZSBpbnZvY2F0aW9uIG9mIGl0cyB0YXJnZXQgbWV0aG9kJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZ2V0T3JDcmVhdGVTZXJ2aWNlSW5zdGFuY2UoaWQsIF90cmFjZSk7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rocm93SWZTdHJpY3QoYFtpbnZva2VGdW5jdGlvbl0gdW5rbm93biBzZXJ2aWNlICcke2lkfSdgLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gZm4oYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRfZG9uZSA9IHRydWU7XG5cdFx0XHRfdHJhY2Uuc3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdGNyZWF0ZUluc3RhbmNlPFQ+KGRlc2NyaXB0b3I6IFN5bmNEZXNjcmlwdG9yMDxUPik6IFQ7XG5cdGNyZWF0ZUluc3RhbmNlPEN0b3IgZXh0ZW5kcyBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiB1bmtub3duLCBSIGV4dGVuZHMgSW5zdGFuY2VUeXBlPEN0b3I+PihjdG9yOiBDdG9yLCAuLi5hcmdzOiBHZXRMZWFkaW5nTm9uU2VydmljZUFyZ3M8Q29uc3RydWN0b3JQYXJhbWV0ZXJzPEN0b3I+Pik6IFI7XG5cdGNyZWF0ZUluc3RhbmNlKGN0b3JPckRlc2NyaXB0b3I6IGFueSB8IFN5bmNEZXNjcmlwdG9yPGFueT4sIC4uLnJlc3Q6IHVua25vd25bXSk6IHVua25vd24ge1xuXHRcdHRoaXMuX3Rocm93SWZEaXNwb3NlZCgpO1xuXG5cdFx0bGV0IF90cmFjZTogVHJhY2U7XG5cdFx0bGV0IHJlc3VsdDogdW5rbm93bjtcblx0XHRpZiAoY3Rvck9yRGVzY3JpcHRvciBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRfdHJhY2UgPSBUcmFjZS50cmFjZUNyZWF0aW9uKHRoaXMuX2VuYWJsZVRyYWNpbmcsIGN0b3JPckRlc2NyaXB0b3IuY3Rvcik7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLl9jcmVhdGVJbnN0YW5jZShjdG9yT3JEZXNjcmlwdG9yLmN0b3IsIGN0b3JPckRlc2NyaXB0b3Iuc3RhdGljQXJndW1lbnRzLmNvbmNhdChyZXN0KSwgX3RyYWNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0X3RyYWNlID0gVHJhY2UudHJhY2VDcmVhdGlvbih0aGlzLl9lbmFibGVUcmFjaW5nLCBjdG9yT3JEZXNjcmlwdG9yKTtcblx0XHRcdHJlc3VsdCA9IHRoaXMuX2NyZWF0ZUluc3RhbmNlKGN0b3JPckRlc2NyaXB0b3IsIHJlc3QsIF90cmFjZSk7XG5cdFx0fVxuXHRcdF90cmFjZS5zdG9wKCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUluc3RhbmNlPFQ+KGN0b3I6IGFueSwgYXJnczogdW5rbm93bltdID0gW10sIF90cmFjZTogVHJhY2UpOiBUIHtcblxuXHRcdC8vIGFyZ3VtZW50cyBkZWZpbmVkIGJ5IHNlcnZpY2UgZGVjb3JhdG9yc1xuXHRcdGNvbnN0IHNlcnZpY2VEZXBlbmRlbmNpZXMgPSBfdXRpbC5nZXRTZXJ2aWNlRGVwZW5kZW5jaWVzKGN0b3IpLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcblx0XHRjb25zdCBzZXJ2aWNlQXJnczogdW5rbm93bltdID0gW107XG5cdFx0Zm9yIChjb25zdCBkZXBlbmRlbmN5IG9mIHNlcnZpY2VEZXBlbmRlbmNpZXMpIHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSB0aGlzLl9nZXRPckNyZWF0ZVNlcnZpY2VJbnN0YW5jZShkZXBlbmRlbmN5LmlkLCBfdHJhY2UpO1xuXHRcdFx0aWYgKCFzZXJ2aWNlKSB7XG5cdFx0XHRcdHRoaXMuX3Rocm93SWZTdHJpY3QoYFtjcmVhdGVJbnN0YW5jZV0gJHtjdG9yLm5hbWV9IGRlcGVuZHMgb24gVU5LTk9XTiBzZXJ2aWNlICR7ZGVwZW5kZW5jeS5pZH0uYCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0c2VydmljZUFyZ3MucHVzaChzZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdFNlcnZpY2VBcmdQb3MgPSBzZXJ2aWNlRGVwZW5kZW5jaWVzLmxlbmd0aCA+IDAgPyBzZXJ2aWNlRGVwZW5kZW5jaWVzWzBdLmluZGV4IDogYXJncy5sZW5ndGg7XG5cblx0XHQvLyBjaGVjayBmb3IgYXJndW1lbnQgbWlzbWF0Y2hlcywgYWRqdXN0IHN0YXRpYyBhcmdzIGlmIG5lZWRlZFxuXHRcdGlmIChhcmdzLmxlbmd0aCAhPT0gZmlyc3RTZXJ2aWNlQXJnUG9zKSB7XG5cdFx0XHRjb25zb2xlLnRyYWNlKGBbY3JlYXRlSW5zdGFuY2VdIEZpcnN0IHNlcnZpY2UgZGVwZW5kZW5jeSBvZiAke2N0b3IubmFtZX0gYXQgcG9zaXRpb24gJHtmaXJzdFNlcnZpY2VBcmdQb3MgKyAxfSBjb25mbGljdHMgd2l0aCAke2FyZ3MubGVuZ3RofSBzdGF0aWMgYXJndW1lbnRzYCk7XG5cblx0XHRcdGNvbnN0IGRlbHRhID0gZmlyc3RTZXJ2aWNlQXJnUG9zIC0gYXJncy5sZW5ndGg7XG5cdFx0XHRpZiAoZGVsdGEgPiAwKSB7XG5cdFx0XHRcdGFyZ3MgPSBhcmdzLmNvbmNhdChuZXcgQXJyYXkoZGVsdGEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFyZ3MgPSBhcmdzLnNsaWNlKDAsIGZpcnN0U2VydmljZUFyZ1Bvcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbm93IGNyZWF0ZSB0aGUgaW5zdGFuY2Vcblx0XHRyZXR1cm4gUmVmbGVjdC5jb25zdHJ1Y3Q8YW55LCBUPihjdG9yLCBhcmdzLmNvbmNhdChzZXJ2aWNlQXJncykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q3JlYXRlZFNlcnZpY2VJbnN0YW5jZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGluc3RhbmNlOiBUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlcnZpY2VzLmdldChpZCkgaW5zdGFuY2VvZiBTeW5jRGVzY3JpcHRvcikge1xuXHRcdFx0dGhpcy5fc2VydmljZXMuc2V0KGlkLCBpbnN0YW5jZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHRoaXMuX3BhcmVudC5fc2V0Q3JlYXRlZFNlcnZpY2VJbnN0YW5jZShpZCwgaW5zdGFuY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2lsbGVnYWxTdGF0ZSAtIHNldHRpbmcgVU5LTk9XTiBzZXJ2aWNlIGluc3RhbmNlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2VydmljZUluc3RhbmNlT3JEZXNjcmlwdG9yPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPik6IFQgfCBTeW5jRGVzY3JpcHRvcjxUPiB7XG5cdFx0Y29uc3QgaW5zdGFuY2VPckRlc2MgPSB0aGlzLl9zZXJ2aWNlcy5nZXQoaWQpO1xuXHRcdGlmICghaW5zdGFuY2VPckRlc2MgJiYgdGhpcy5fcGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyZW50Ll9nZXRTZXJ2aWNlSW5zdGFuY2VPckRlc2NyaXB0b3IoaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gaW5zdGFuY2VPckRlc2M7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRPckNyZWF0ZVNlcnZpY2VJbnN0YW5jZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIF90cmFjZTogVHJhY2UpOiBUIHtcblx0XHRpZiAodGhpcy5fZ2xvYmFsR3JhcGggJiYgdGhpcy5fZ2xvYmFsR3JhcGhJbXBsaWNpdERlcGVuZGVuY3kpIHtcblx0XHRcdHRoaXMuX2dsb2JhbEdyYXBoLmluc2VydEVkZ2UodGhpcy5fZ2xvYmFsR3JhcGhJbXBsaWNpdERlcGVuZGVuY3ksIFN0cmluZyhpZCkpO1xuXHRcdH1cblx0XHRjb25zdCB0aGluZyA9IHRoaXMuX2dldFNlcnZpY2VJbnN0YW5jZU9yRGVzY3JpcHRvcihpZCk7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zYWZlQ3JlYXRlQW5kQ2FjaGVTZXJ2aWNlSW5zdGFuY2UoaWQsIHRoaW5nLCBfdHJhY2UuYnJhbmNoKGlkLCB0cnVlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdF90cmFjZS5icmFuY2goaWQsIGZhbHNlKTtcblx0XHRcdHJldHVybiB0aGluZztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVJbnN0YW50aWF0aW9ucyA9IG5ldyBTZXQ8U2VydmljZUlkZW50aWZpZXI8YW55Pj4oKTtcblxuXG5cdHByaXZhdGUgX3NhZmVDcmVhdGVBbmRDYWNoZVNlcnZpY2VJbnN0YW5jZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGRlc2M6IFN5bmNEZXNjcmlwdG9yPFQ+LCBfdHJhY2U6IFRyYWNlKTogVCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUluc3RhbnRpYXRpb25zLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgaWxsZWdhbCBzdGF0ZSAtIFJFQ1VSU0lWRUxZIGluc3RhbnRpYXRpbmcgc2VydmljZSAnJHtpZH0nYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUluc3RhbnRpYXRpb25zLmFkZChpZCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVBbmRDYWNoZVNlcnZpY2VJbnN0YW5jZShpZCwgZGVzYywgX3RyYWNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fYWN0aXZlSW5zdGFudGlhdGlvbnMuZGVsZXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVBbmRDYWNoZVNlcnZpY2VJbnN0YW5jZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGRlc2M6IFN5bmNEZXNjcmlwdG9yPFQ+LCBfdHJhY2U6IFRyYWNlKTogVCB7XG5cblx0XHR0eXBlIFRyaXBsZSA9IHsgaWQ6IFNlcnZpY2VJZGVudGlmaWVyPGFueT47IGRlc2M6IFN5bmNEZXNjcmlwdG9yPGFueT47IF90cmFjZTogVHJhY2UgfTtcblx0XHRjb25zdCBncmFwaCA9IG5ldyBHcmFwaDxUcmlwbGU+KGRhdGEgPT4gZGF0YS5pZC50b1N0cmluZygpKTtcblxuXHRcdGxldCBjeWNsZUNvdW50ID0gMDtcblx0XHRjb25zdCBzdGFjayA9IFt7IGlkLCBkZXNjLCBfdHJhY2UgfV07XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHdoaWxlIChzdGFjay5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBzdGFjay5wb3AoKSE7XG5cblx0XHRcdGlmIChzZWVuLmhhcyhTdHJpbmcoaXRlbS5pZCkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5hZGQoU3RyaW5nKGl0ZW0uaWQpKTtcblxuXHRcdFx0Z3JhcGgubG9va3VwT3JJbnNlcnROb2RlKGl0ZW0pO1xuXG5cdFx0XHQvLyBhIHdlYWsgYnV0IHdvcmtpbmcgaGV1cmlzdGljIGZvciBjeWNsZSBjaGVja3Ncblx0XHRcdGlmIChjeWNsZUNvdW50KysgPiAxMDAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDeWNsaWNEZXBlbmRlbmN5RXJyb3IoZ3JhcGgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjaGVjayBhbGwgZGVwZW5kZW5jaWVzIGZvciBleGlzdGVuY2UgYW5kIGlmIHRoZXkgbmVlZCB0byBiZSBjcmVhdGVkIGZpcnN0XG5cdFx0XHRmb3IgKGNvbnN0IGRlcGVuZGVuY3kgb2YgX3V0aWwuZ2V0U2VydmljZURlcGVuZGVuY2llcyhpdGVtLmRlc2MuY3RvcikpIHtcblxuXHRcdFx0XHRjb25zdCBpbnN0YW5jZU9yRGVzYyA9IHRoaXMuX2dldFNlcnZpY2VJbnN0YW5jZU9yRGVzY3JpcHRvcihkZXBlbmRlbmN5LmlkKTtcblx0XHRcdFx0aWYgKCFpbnN0YW5jZU9yRGVzYykge1xuXHRcdFx0XHRcdHRoaXMuX3Rocm93SWZTdHJpY3QoYFtjcmVhdGVJbnN0YW5jZV0gJHtpZH0gZGVwZW5kcyBvbiAke2RlcGVuZGVuY3kuaWR9IHdoaWNoIGlzIE5PVCByZWdpc3RlcmVkLmAsIHRydWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdGFrZSBub3RlIG9mIGFsbCBzZXJ2aWNlIGRlcGVuZGVuY2llc1xuXHRcdFx0XHR0aGlzLl9nbG9iYWxHcmFwaD8uaW5zZXJ0RWRnZShTdHJpbmcoaXRlbS5pZCksIFN0cmluZyhkZXBlbmRlbmN5LmlkKSk7XG5cblx0XHRcdFx0aWYgKGluc3RhbmNlT3JEZXNjIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBkID0geyBpZDogZGVwZW5kZW5jeS5pZCwgZGVzYzogaW5zdGFuY2VPckRlc2MsIF90cmFjZTogaXRlbS5fdHJhY2UuYnJhbmNoKGRlcGVuZGVuY3kuaWQsIHRydWUpIH07XG5cdFx0XHRcdFx0Z3JhcGguaW5zZXJ0RWRnZShpdGVtLCBkKTtcblx0XHRcdFx0XHRzdGFjay5wdXNoKGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHJvb3RzID0gZ3JhcGgucm9vdHMoKTtcblxuXHRcdFx0Ly8gaWYgdGhlcmUgaXMgbm8gbW9yZSByb290cyBidXQgc3RpbGxcblx0XHRcdC8vIG5vZGVzIGluIHRoZSBncmFwaCB3ZSBoYXZlIGEgY3ljbGVcblx0XHRcdGlmIChyb290cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0aWYgKCFncmFwaC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ3ljbGljRGVwZW5kZW5jeUVycm9yKGdyYXBoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB7IGRhdGEgfSBvZiByb290cykge1xuXHRcdFx0XHQvLyBSZXBlYXQgdGhlIGNoZWNrIGZvciB0aGlzIHN0aWxsIGJlaW5nIGEgc2VydmljZSBzeW5jIGRlc2NyaXB0b3IuIFRoYXQncyBiZWNhdXNlXG5cdFx0XHRcdC8vIGluc3RhbnRpYXRpbmcgYSBkZXBlbmRlbmN5IG1pZ2h0IGhhdmUgc2lkZS1lZmZlY3QgYW5kIHJlY3Vyc2l2ZWx5IHRyaWdnZXIgaW5zdGFudGlhdGlvblxuXHRcdFx0XHQvLyBzbyB0aGF0IHNvbWUgZGVwZW5kZW5jaWVzIGFyZSBub3cgZnVsbGZpbGxlZCBhbHJlYWR5LlxuXHRcdFx0XHRjb25zdCBpbnN0YW5jZU9yRGVzYyA9IHRoaXMuX2dldFNlcnZpY2VJbnN0YW5jZU9yRGVzY3JpcHRvcihkYXRhLmlkKTtcblx0XHRcdFx0aWYgKGluc3RhbmNlT3JEZXNjIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHQvLyBjcmVhdGUgaW5zdGFuY2UgYW5kIG92ZXJ3cml0ZSB0aGUgc2VydmljZSBjb2xsZWN0aW9uc1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fY3JlYXRlU2VydmljZUluc3RhbmNlV2l0aE93bmVyKGRhdGEuaWQsIGRhdGEuZGVzYy5jdG9yLCBkYXRhLmRlc2Muc3RhdGljQXJndW1lbnRzLCBkYXRhLmRlc2Muc3VwcG9ydHNEZWxheWVkSW5zdGFudGlhdGlvbiwgZGF0YS5fdHJhY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3NldENyZWF0ZWRTZXJ2aWNlSW5zdGFuY2UoZGF0YS5pZCwgaW5zdGFuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyYXBoLnJlbW92ZU5vZGUoZGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiA8VD50aGlzLl9nZXRTZXJ2aWNlSW5zdGFuY2VPckRlc2NyaXB0b3IoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU2VydmljZUluc3RhbmNlV2l0aE93bmVyPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgY3RvcjogYW55LCBhcmdzOiB1bmtub3duW10gPSBbXSwgc3VwcG9ydHNEZWxheWVkSW5zdGFudGlhdGlvbjogYm9vbGVhbiwgX3RyYWNlOiBUcmFjZSk6IFQge1xuXHRcdGlmICh0aGlzLl9zZXJ2aWNlcy5nZXQoaWQpIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVTZXJ2aWNlSW5zdGFuY2UoaWQsIGN0b3IsIGFyZ3MsIHN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb24sIF90cmFjZSwgdGhpcy5fc2VydmljZXNUb01heWJlRGlzcG9zZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9wYXJlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wYXJlbnQuX2NyZWF0ZVNlcnZpY2VJbnN0YW5jZVdpdGhPd25lcihpZCwgY3RvciwgYXJncywgc3VwcG9ydHNEZWxheWVkSW5zdGFudGlhdGlvbiwgX3RyYWNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBpbGxlZ2FsU3RhdGUgLSBjcmVhdGluZyBVTktOT1dOIHNlcnZpY2UgaW5zdGFuY2UgJHtjdG9yLm5hbWV9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU2VydmljZUluc3RhbmNlPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgY3RvcjogYW55LCBhcmdzOiB1bmtub3duW10gPSBbXSwgc3VwcG9ydHNEZWxheWVkSW5zdGFudGlhdGlvbjogYm9vbGVhbiwgX3RyYWNlOiBUcmFjZSwgZGlzcG9zZUJ1Y2tldDogU2V0PGFueT4pOiBUIHtcblx0XHRpZiAoIXN1cHBvcnRzRGVsYXllZEluc3RhbnRpYXRpb24pIHtcblx0XHRcdC8vIGVhZ2VyIGluc3RhbnRpYXRpb25cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2NyZWF0ZUluc3RhbmNlPFQ+KGN0b3IsIGFyZ3MsIF90cmFjZSk7XG5cdFx0XHRkaXNwb3NlQnVja2V0LmFkZChyZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHRoaXMuX3N0cmljdCwgdGhpcywgdGhpcy5fZW5hYmxlVHJhY2luZyk7XG5cdFx0XHRjaGlsZC5fZ2xvYmFsR3JhcGhJbXBsaWNpdERlcGVuZGVuY3kgPSBTdHJpbmcoaWQpO1xuXG5cdFx0XHR0eXBlIEVhcnlMaXN0ZW5lckRhdGEgPSB7XG5cdFx0XHRcdGxpc3RlbmVyOiBQYXJhbWV0ZXJzPEV2ZW50PGFueT4+O1xuXHRcdFx0XHRkaXNwb3NhYmxlPzogSURpc3Bvc2FibGU7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBSZXR1cm4gYSBwcm94eSBvYmplY3QgdGhhdCdzIGJhY2tlZCBieSBhbiBpZGxlIHZhbHVlLiBUaGF0XG5cdFx0XHQvLyBzdHJhdGVneSBpcyB0byBpbnN0YW50aWF0ZSBzZXJ2aWNlcyBpbiBvdXIgaWRsZSB0aW1lIG9yIHdoZW4gYWN0dWFsbHlcblx0XHRcdC8vIG5lZWRlZCBidXQgbm90IHdoZW4gaW5qZWN0ZWQgaW50byBhIGNvbnN1bWVyXG5cblx0XHRcdC8vIHJldHVybiBcImVtcHR5IGV2ZW50c1wiIHdoZW4gdGhlIHNlcnZpY2UgaXNuJ3QgaW5zdGFudGlhdGVkIHlldFxuXHRcdFx0Y29uc3QgZWFybHlMaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgTGlua2VkTGlzdDxFYXJ5TGlzdGVuZXJEYXRhPj4oKTtcblxuXHRcdFx0Y29uc3QgaWRsZSA9IG5ldyBHbG9iYWxJZGxlVmFsdWU8YW55PigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGNoaWxkLl9jcmVhdGVJbnN0YW5jZTxUPihjdG9yLCBhcmdzLCBfdHJhY2UpO1xuXG5cdFx0XHRcdC8vIGVhcmx5IGxpc3RlbmVycyB0aGF0IHdlIGtlcHQgYXJlIG5vdyBiZWluZyBzdWJzY3JpYmVkIHRvXG5cdFx0XHRcdC8vIHRoZSByZWFsIHNlcnZpY2Vcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZXNdIG9mIGVhcmx5TGlzdGVuZXJzKSB7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gPEV2ZW50PGFueT4+KDxhbnk+cmVzdWx0KVtrZXldO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgY2FuZGlkYXRlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdFx0XHR2YWx1ZS5kaXNwb3NhYmxlID0gY2FuZGlkYXRlLmFwcGx5KHJlc3VsdCwgdmFsdWUubGlzdGVuZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlYXJseUxpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0XHRkaXNwb3NlQnVja2V0LmFkZChyZXN1bHQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gPFQ+bmV3IFByb3h5KE9iamVjdC5jcmVhdGUobnVsbCksIHtcblx0XHRcdFx0Z2V0KHRhcmdldDogYW55LCBrZXk6IFByb3BlcnR5S2V5KTogdW5rbm93biB7XG5cblx0XHRcdFx0XHRpZiAoIWlkbGUuaXNJbml0aWFsaXplZCkge1xuXHRcdFx0XHRcdFx0Ly8gbG9va3MgbGlrZSBhbiBldmVudFxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIChrZXkuc3RhcnRzV2l0aCgnb25EaWQnKSB8fCBrZXkuc3RhcnRzV2l0aCgnb25XaWxsJykpKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBsaXN0ID0gZWFybHlMaXN0ZW5lcnMuZ2V0KGtleSk7XG5cdFx0XHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0XHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdCgpO1xuXHRcdFx0XHRcdFx0XHRcdGVhcmx5TGlzdGVuZXJzLnNldChrZXksIGxpc3QpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV2ZW50OiBFdmVudDxhbnk+ID0gKGNhbGxiYWNrLCB0aGlzQXJnLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChpZGxlLmlzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBpZGxlLnZhbHVlW2tleV0oY2FsbGJhY2ssIHRoaXNBcmcsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZW50cnk6IEVhcnlMaXN0ZW5lckRhdGEgPSB7IGxpc3RlbmVyOiBbY2FsbGJhY2ssIHRoaXNBcmcsIGRpc3Bvc2FibGVzXSwgZGlzcG9zYWJsZTogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBybSA9IGxpc3QucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRybSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRlbnRyeS5kaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZXZlbnQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gdmFsdWUgYWxyZWFkeSBleGlzdHNcblx0XHRcdFx0XHRpZiAoa2V5IGluIHRhcmdldCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRhcmdldFtrZXldO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGNyZWF0ZSB2YWx1ZVxuXHRcdFx0XHRcdGNvbnN0IG9iaiA9IGlkbGUudmFsdWU7XG5cdFx0XHRcdFx0bGV0IHByb3AgPSBvYmpba2V5XTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHByb3AgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiBwcm9wO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcm9wID0gcHJvcC5iaW5kKG9iaik7XG5cdFx0XHRcdFx0dGFyZ2V0W2tleV0gPSBwcm9wO1xuXHRcdFx0XHRcdHJldHVybiBwcm9wO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXQoX3RhcmdldDogVCwgcDogUHJvcGVydHlLZXksIHZhbHVlOiBhbnkpOiBib29sZWFuIHtcblx0XHRcdFx0XHRpZGxlLnZhbHVlW3BdID0gdmFsdWU7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFByb3RvdHlwZU9mKF90YXJnZXQ6IFQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3Rvci5wcm90b3R5cGU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Rocm93SWZTdHJpY3QobXNnOiBzdHJpbmcsIHByaW50V2FybmluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChwcmludFdhcm5pbmcpIHtcblx0XHRcdGNvbnNvbGUud2Fybihtc2cpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RyaWN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobXNnKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jcmVnaW9uIC0tIHRyYWNpbmcgLS0tXG5cbmNvbnN0IGVudW0gVHJhY2VUeXBlIHtcblx0Tm9uZSA9IDAsXG5cdENyZWF0aW9uID0gMSxcblx0SW52b2NhdGlvbiA9IDIsXG5cdEJyYW5jaCA9IDMsXG59XG5cbmV4cG9ydCBjbGFzcyBUcmFjZSB7XG5cblx0c3RhdGljIGFsbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9Ob25lID0gbmV3IGNsYXNzIGV4dGVuZHMgVHJhY2Uge1xuXHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihUcmFjZVR5cGUuTm9uZSwgbnVsbCk7IH1cblx0XHRvdmVycmlkZSBzdG9wKCkgeyB9XG5cdFx0b3ZlcnJpZGUgYnJhbmNoKCkgeyByZXR1cm4gdGhpczsgfVxuXHR9O1xuXG5cdHN0YXRpYyB0cmFjZUludm9jYXRpb24oX2VuYWJsZVRyYWNpbmc6IGJvb2xlYW4sIGN0b3I6IGFueSk6IFRyYWNlIHtcblx0XHRyZXR1cm4gIV9lbmFibGVUcmFjaW5nID8gVHJhY2UuX05vbmUgOiBuZXcgVHJhY2UoVHJhY2VUeXBlLkludm9jYXRpb24sIGN0b3IubmFtZSB8fCBuZXcgRXJyb3IoKS5zdGFjayEuc3BsaXQoJ1xcbicpLnNsaWNlKDMsIDQpLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHN0YXRpYyB0cmFjZUNyZWF0aW9uKF9lbmFibGVUcmFjaW5nOiBib29sZWFuLCBjdG9yOiBhbnkpOiBUcmFjZSB7XG5cdFx0cmV0dXJuICFfZW5hYmxlVHJhY2luZyA/IFRyYWNlLl9Ob25lIDogbmV3IFRyYWNlKFRyYWNlVHlwZS5DcmVhdGlvbiwgY3Rvci5uYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF90b3RhbHM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0OiBudW1iZXIgPSBEYXRlLm5vdygpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXA6IFtTZXJ2aWNlSWRlbnRpZmllcjxhbnk+LCBib29sZWFuLCBUcmFjZT9dW10gPSBbXTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHR5cGU6IFRyYWNlVHlwZSxcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcgfCBudWxsXG5cdCkgeyB9XG5cblx0YnJhbmNoKGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxhbnk+LCBmaXJzdDogYm9vbGVhbik6IFRyYWNlIHtcblx0XHRjb25zdCBjaGlsZCA9IG5ldyBUcmFjZShUcmFjZVR5cGUuQnJhbmNoLCBpZC50b1N0cmluZygpKTtcblx0XHR0aGlzLl9kZXAucHVzaChbaWQsIGZpcnN0LCBjaGlsZF0pO1xuXHRcdHJldHVybiBjaGlsZDtcblx0fVxuXG5cdHN0b3AoKSB7XG5cdFx0Y29uc3QgZHVyID0gRGF0ZS5ub3coKSAtIHRoaXMuX3N0YXJ0O1xuXHRcdFRyYWNlLl90b3RhbHMgKz0gZHVyO1xuXG5cdFx0bGV0IGNhdXNlZENyZWF0aW9uID0gZmFsc2U7XG5cblx0XHRmdW5jdGlvbiBwcmludENoaWxkKG46IG51bWJlciwgdHJhY2U6IFRyYWNlKSB7XG5cdFx0XHRjb25zdCByZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBwcmVmaXggPSBuZXcgQXJyYXkobiArIDEpLmpvaW4oJ1xcdCcpO1xuXHRcdFx0Zm9yIChjb25zdCBbaWQsIGZpcnN0LCBjaGlsZF0gb2YgdHJhY2UuX2RlcCkge1xuXHRcdFx0XHRpZiAoZmlyc3QgJiYgY2hpbGQpIHtcblx0XHRcdFx0XHRjYXVzZWRDcmVhdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0cmVzLnB1c2goYCR7cHJlZml4fUNSRUFURVMgLT4gJHtpZH1gKTtcblx0XHRcdFx0XHRjb25zdCBuZXN0ZWQgPSBwcmludENoaWxkKG4gKyAxLCBjaGlsZCk7XG5cdFx0XHRcdFx0aWYgKG5lc3RlZCkge1xuXHRcdFx0XHRcdFx0cmVzLnB1c2gobmVzdGVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzLnB1c2goYCR7cHJlZml4fXVzZXMgLT4gJHtpZH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdGAke3RoaXMudHlwZSA9PT0gVHJhY2VUeXBlLkNyZWF0aW9uID8gJ0NSRUFURScgOiAnQ0FMTCd9ICR7dGhpcy5uYW1lfWAsXG5cdFx0XHRgJHtwcmludENoaWxkKDEsIHRoaXMpfWAsXG5cdFx0XHRgRE9ORSwgdG9vayAke2R1ci50b0ZpeGVkKDIpfW1zIChncmFuZCB0b3RhbCAke1RyYWNlLl90b3RhbHMudG9GaXhlZCgyKX1tcylgXG5cdFx0XTtcblxuXHRcdGlmIChkdXIgPiAyIHx8IGNhdXNlZENyZWF0aW9uKSB7XG5cdFx0XHRUcmFjZS5hbGwuYWRkKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUEwQixTQUFzQixjQUFjLG9CQUFvQjtBQUNsRixTQUFTLHNCQUF1QztBQUNoRCxTQUFTLGFBQWE7QUFDdEIsU0FBbUMsdUJBQTRELGFBQWE7QUFDNUcsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFHM0IsTUFBTSxvQkFBb0I7QUFJMUIsTUFBTSw4QkFBOEIsTUFBTTtBQUFBLEVBQ3pDLFlBQVksT0FBbUI7QUFDOUIsVUFBTSxvQ0FBb0M7QUFDMUMsU0FBSyxVQUFVLE1BQU0sY0FBYyxLQUFLO0FBQUEsRUFBNEMsTUFBTSxTQUFTLENBQUM7QUFBQSxFQUNyRztBQUNEO0FBRU8sTUFBTSxxQkFBc0Q7QUFBQSxFQVdsRSxZQUNrQixZQUErQixJQUFJLGtCQUFrQixHQUNyRCxVQUFtQixPQUNuQixTQUNBLGlCQUEwQixtQkFDMUM7QUFKZ0I7QUFDQTtBQUNBO0FBQ0E7QUFSbEIsU0FBUSxjQUFjO0FBQ3RC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LElBQUk7QUFBQSxFQUMvRTtBQUFBLEVBV0EsT0FBTyxJQUE0QixPQUF1QjtBQUN6RCxVQUFNLFFBQVEsSUFBSSxPQUFNLGdCQUFrQixHQUFHLFNBQVMsQ0FBQztBQUN2RCxTQUFLLEtBQUssS0FBSyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUM7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQU87QUFDTixVQUFNLE1BQU0sS0FBSyxJQUFJLElBQUksS0FBSztBQUM5QixXQUFNLFdBQVc7QUFFakIsUUFBSSxpQkFBaUI7QUFFckIsYUFBUyxXQUFXLEdBQVcsT0FBYztBQUM1QyxZQUFNLE1BQWdCLENBQUM7QUFDdkIsWUFBTSxTQUFTLElBQUksTUFBTSxJQUFJLENBQUMsRUFBRSxLQUFLLEdBQUk7QUFDekMsaUJBQVcsQ0FBQyxJQUFJLE9BQU8sS0FBSyxLQUFLLE1BQU0sTUFBTTtBQUM1QyxZQUFJLFNBQVMsT0FBTztBQUNuQiwyQkFBaUI7QUFDakIsY0FBSSxLQUFLLEdBQUcsTUFBTSxjQUFjLEVBQUUsRUFBRTtBQUNwQyxnQkFBTSxTQUFTLFdBQVcsSUFBSSxHQUFHLEtBQUs7QUFDdEMsY0FBSSxRQUFRO0FBQ1gsZ0JBQUksS0FBSyxNQUFNO0FBQUEsVUFDaEI7QUFBQSxRQUNELE9BQU87QUFDTixjQUFJLEtBQUssR0FBRyxNQUFNLFdBQVcsRUFBRSxFQUFFO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQ0EsYUFBTyxJQUFJLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBRUEsVUFBTSxRQUFRO0FBQUEsTUFDYixHQUFHLEtBQUssU0FBUyxtQkFBcUIsV0FBVyxNQUFNLElBQUksS0FBSyxJQUFJO0FBQUEsTUFDcEUsR0FBRyxXQUFXLEdBQUcsSUFBSSxDQUFDO0FBQUEsTUFDdEIsY0FBYyxJQUFJLFFBQVEsQ0FBQyxDQUFDLG1CQUFtQixPQUFNLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxJQUN4RTtBQUVBLFFBQUksTUFBTSxLQUFLLGdCQUFnQjtBQUM5QixhQUFNLElBQUksSUFBSSxNQUFNLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQ0Q7QUFuRWEsT0FFTCxNQUFNLG9CQUFJLElBQVk7QUFGakIsT0FJWSxRQUFRLElBQUksY0FBYyxPQUFNO0FBQUEsRUFDdkQsY0FBYztBQUFFLFVBQU0sY0FBZ0IsSUFBSTtBQUFBLEVBQUc7QUFBQSxFQUNwQyxPQUFPO0FBQUEsRUFBRTtBQUFBLEVBQ1QsU0FBUztBQUFFLFdBQU87QUFBQSxFQUFNO0FBQ2xDO0FBUlksT0FrQkcsVUFBa0I7QUFsQjNCLElBQU0sUUFBTjsiLAogICJuYW1lcyI6IFsiVHJhY2VUeXBlIl0KfQo=
