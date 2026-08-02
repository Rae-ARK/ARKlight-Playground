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
import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SyncDescriptor } from "../../common/descriptors.js";
import { createDecorator, IInstantiationService } from "../../common/instantiation.js";
import { InstantiationService } from "../../common/instantiationService.js";
import { ServiceCollection } from "../../common/serviceCollection.js";
const IService1 = createDecorator("service1");
class Service1 {
  constructor() {
    this.c = 1;
  }
}
const IService2 = createDecorator("service2");
class Service2 {
  constructor() {
    this.d = true;
  }
}
const IService3 = createDecorator("service3");
class Service3 {
  constructor() {
    this.s = "farboo";
  }
}
const IDependentService = createDecorator("dependentService");
let DependentService = class {
  constructor(service) {
    this.name = "farboo";
    assert.strictEqual(service.c, 1);
  }
};
DependentService = __decorateClass([
  __decorateParam(0, IService1)
], DependentService);
let Service1Consumer = class {
  constructor(service1) {
    assert.ok(service1);
    assert.strictEqual(service1.c, 1);
  }
};
Service1Consumer = __decorateClass([
  __decorateParam(0, IService1)
], Service1Consumer);
let Target2Dep = class {
  constructor(service1, service2) {
    assert.ok(service1 instanceof Service1);
    assert.ok(service2 instanceof Service2);
  }
};
Target2Dep = __decorateClass([
  __decorateParam(0, IService1),
  __decorateParam(1, IService2)
], Target2Dep);
let TargetWithStaticParam = class {
  constructor(v, service1) {
    assert.ok(v);
    assert.ok(service1);
    assert.strictEqual(service1.c, 1);
  }
};
TargetWithStaticParam = __decorateClass([
  __decorateParam(1, IService1)
], TargetWithStaticParam);
let DependentServiceTarget = class {
  constructor(d) {
    assert.ok(d);
    assert.strictEqual(d.name, "farboo");
  }
};
DependentServiceTarget = __decorateClass([
  __decorateParam(0, IDependentService)
], DependentServiceTarget);
let DependentServiceTarget2 = class {
  constructor(d, s) {
    assert.ok(d);
    assert.strictEqual(d.name, "farboo");
    assert.ok(s);
    assert.strictEqual(s.c, 1);
  }
};
DependentServiceTarget2 = __decorateClass([
  __decorateParam(0, IDependentService),
  __decorateParam(1, IService1)
], DependentServiceTarget2);
let ServiceLoop1 = class {
  constructor(s) {
    this.c = 1;
  }
};
ServiceLoop1 = __decorateClass([
  __decorateParam(0, IService2)
], ServiceLoop1);
let ServiceLoop2 = class {
  constructor(s) {
    this.d = true;
  }
};
ServiceLoop2 = __decorateClass([
  __decorateParam(0, IService1)
], ServiceLoop2);
suite("Instantiation Service", () => {
  test("service collection, cannot overwrite", function() {
    const collection = new ServiceCollection();
    let result = collection.set(IService1, null);
    assert.strictEqual(result, void 0);
    result = collection.set(IService1, new Service1());
    assert.strictEqual(result, null);
  });
  test("service collection, add/has", function() {
    const collection = new ServiceCollection();
    collection.set(IService1, null);
    assert.ok(collection.has(IService1));
    collection.set(IService2, null);
    assert.ok(collection.has(IService1));
    assert.ok(collection.has(IService2));
  });
  test("@Param - simple clase", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    collection.set(IService3, new Service3());
    service.createInstance(Service1Consumer);
  });
  test("@Param - fixed args", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    collection.set(IService3, new Service3());
    service.createInstance(TargetWithStaticParam, true);
  });
  test("service collection is live", function() {
    const collection = new ServiceCollection();
    collection.set(IService1, new Service1());
    const service = new InstantiationService(collection);
    service.createInstance(Service1Consumer);
    collection.set(IService2, new Service2());
    service.createInstance(Target2Dep);
    service.invokeFunction(function(a) {
      assert.ok(a.get(IService1));
      assert.ok(a.get(IService2));
    });
  });
  test("SyncDesc - no dependencies", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    service.invokeFunction((accessor) => {
      const service1 = accessor.get(IService1);
      assert.ok(service1);
      assert.strictEqual(service1.c, 1);
      const service2 = accessor.get(IService1);
      assert.ok(service1 === service2);
    });
  });
  test("SyncDesc - service with service dependency", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    collection.set(IDependentService, new SyncDescriptor(DependentService));
    service.invokeFunction((accessor) => {
      const d = accessor.get(IDependentService);
      assert.ok(d);
      assert.strictEqual(d.name, "farboo");
    });
  });
  test("SyncDesc - target depends on service future", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    collection.set(IDependentService, new SyncDescriptor(DependentService));
    const d = service.createInstance(DependentServiceTarget);
    assert.ok(d instanceof DependentServiceTarget);
    const d2 = service.createInstance(DependentServiceTarget2);
    assert.ok(d2 instanceof DependentServiceTarget2);
  });
  test("SyncDesc - explode on loop", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(ServiceLoop1));
    collection.set(IService2, new SyncDescriptor(ServiceLoop2));
    assert.throws(() => {
      service.invokeFunction((accessor) => {
        accessor.get(IService1);
      });
    });
    assert.throws(() => {
      service.invokeFunction((accessor) => {
        accessor.get(IService2);
      });
    });
    try {
      service.invokeFunction((accessor) => {
        accessor.get(IService1);
      });
    } catch (err) {
      assert.ok(err.name);
      assert.ok(err.message);
    }
  });
  test("Invoke - get services", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.strictEqual(accessor.get(IService1).c, 1);
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
  });
  test("Invoke - get service, optional", function() {
    const collection = new ServiceCollection([IService1, new Service1()]);
    const service = new InstantiationService(collection, true);
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.throws(() => accessor.get(IService2));
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
  });
  test("Invoke - keeping accessor NOT allowed", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    let cached;
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.strictEqual(accessor.get(IService1).c, 1);
      cached = accessor;
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
    assert.throws(() => cached.get(IService2));
  });
  test("Invoke - throw error", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    function test2(accessor) {
      throw new Error();
    }
    assert.throws(() => service.invokeFunction(test2));
  });
  test("Create child", function() {
    let serviceInstanceCount = 0;
    const CtorCounter = class {
      constructor() {
        this.c = 1;
        serviceInstanceCount += 1;
      }
    };
    let service = new InstantiationService(new ServiceCollection([IService1, new SyncDescriptor(CtorCounter)]));
    service.createInstance(Service1Consumer);
    let child = service.createChild(new ServiceCollection([IService2, new Service2()]));
    child.createInstance(Service1Consumer);
    assert.strictEqual(serviceInstanceCount, 1);
    serviceInstanceCount = 0;
    service = new InstantiationService(new ServiceCollection([IService1, new SyncDescriptor(CtorCounter)]));
    child = service.createChild(new ServiceCollection([IService2, new Service2()]));
    service.createInstance(Service1Consumer);
    child.createInstance(Service1Consumer);
    assert.strictEqual(serviceInstanceCount, 1);
  });
  test("Remote window / integration tests is broken #105562", function() {
    const Service12 = createDecorator("service1");
    let Service1Impl = class {
      constructor(insta2) {
        const c = insta2.invokeFunction((accessor) => accessor.get(Service22));
        assert.ok(c);
      }
    };
    Service1Impl = __decorateClass([
      __decorateParam(0, IInstantiationService)
    ], Service1Impl);
    const Service22 = createDecorator("service2");
    class Service2Impl {
      constructor() {
      }
    }
    const Service21 = createDecorator("service21");
    let Service21Impl = class {
      constructor(service2, service1) {
        this.service2 = service2;
        this.service1 = service1;
      }
    };
    Service21Impl = __decorateClass([
      __decorateParam(0, Service22),
      __decorateParam(1, Service12)
    ], Service21Impl);
    const insta = new InstantiationService(new ServiceCollection(
      [Service12, new SyncDescriptor(Service1Impl)],
      [Service22, new SyncDescriptor(Service2Impl)],
      [Service21, new SyncDescriptor(Service21Impl)]
    ));
    const obj = insta.invokeFunction((accessor) => accessor.get(Service21));
    assert.ok(obj);
  });
  test("Sync/Async dependency loop", async function() {
    const A = createDecorator("A");
    const B = createDecorator("B");
    let BConsumer = class {
      constructor(b) {
        this.b = b;
      }
      doIt() {
        return this.b.b();
      }
    };
    BConsumer = __decorateClass([
      __decorateParam(0, B)
    ], BConsumer);
    let AService = class {
      constructor(insta) {
        this.prop = insta.createInstance(BConsumer);
      }
      doIt() {
        return this.prop.doIt();
      }
    };
    AService = __decorateClass([
      __decorateParam(0, IInstantiationService)
    ], AService);
    let BService = class {
      constructor(a) {
        assert.ok(a);
      }
      b() {
        return true;
      }
    };
    BService = __decorateClass([
      __decorateParam(0, A)
    ], BService);
    {
      const insta1 = new InstantiationService(new ServiceCollection(
        [A, new SyncDescriptor(AService)],
        [B, new SyncDescriptor(BService)]
      ), true, void 0, true);
      try {
        insta1.invokeFunction((accessor) => accessor.get(A));
        assert.ok(false);
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("RECURSIVELY"));
      }
    }
    {
      const insta2 = new InstantiationService(new ServiceCollection(
        [A, new SyncDescriptor(AService, void 0, true)],
        [B, new SyncDescriptor(BService, void 0)]
      ), true, void 0, true);
      const a = insta2.invokeFunction((accessor) => accessor.get(A));
      a.doIt();
      const cycle = insta2._globalGraph?.findCycleSlow();
      assert.strictEqual(cycle, "A -> B -> A");
    }
  });
  test("Delayed and events", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const d1 = c.a.onDidDoIt(listener);
    const d2 = c.a.onDidDoIt(listener);
    assert.strictEqual(created, false);
    assert.strictEqual(eventCount, 0);
    d2.dispose();
    c.a.doIt();
    assert.strictEqual(created, true);
    assert.strictEqual(eventCount, 1);
    const d3 = c.a.onDidDoIt(listener);
    c.a.doIt();
    assert.strictEqual(eventCount, 3);
    dispose([d1, d3]);
  });
  test("Capture event before init, use after init", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
      noop() {
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const event = c.a.onDidDoIt;
    assert.strictEqual(created, false);
    c.a.noop();
    assert.strictEqual(created, true);
    const d1 = event(listener);
    c.a.doIt();
    assert.strictEqual(eventCount, 1);
    dispose(d1);
  });
  test("Dispose early event listener", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const d1 = c.a.onDidDoIt(listener);
    assert.strictEqual(created, false);
    assert.strictEqual(eventCount, 0);
    c.a.doIt();
    assert.strictEqual(created, true);
    assert.strictEqual(eventCount, 1);
    dispose(d1);
    c.a.doIt();
    assert.strictEqual(eventCount, 1);
  });
  test("Dispose services it created", function() {
    let disposedA = false;
    let disposedB = false;
    const A = createDecorator("A");
    class AImpl {
      constructor() {
        this.value = 1;
      }
      dispose() {
        disposedA = true;
      }
    }
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
      dispose() {
        disposedB = true;
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)],
      [B, new BImpl()]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a, b) {
        this.a = a;
        this.b = b;
        assert.strictEqual(a.value, b.value);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A),
      __decorateParam(1, B)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    insta.dispose();
    assert.ok(c);
    assert.strictEqual(disposedA, true);
    assert.strictEqual(disposedB, false);
  });
  test("Disposed service cannot be used anymore", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    assert.ok(c);
    insta.dispose();
    assert.throws(() => insta.createInstance(Consumer));
    assert.throws(() => insta.invokeFunction((accessor) => {
    }));
    assert.throws(() => insta.createChild(new ServiceCollection()));
  });
  test("Child does not dispose parent", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta1 = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    const insta2 = insta1.createChild(new ServiceCollection());
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    assert.ok(insta1.createInstance(Consumer));
    assert.ok(insta2.createInstance(Consumer));
    insta2.dispose();
    assert.ok(insta1.createInstance(Consumer));
    assert.throws(() => insta2.createInstance(Consumer));
  });
  test("Parent does dispose children", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta1 = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    const insta2 = insta1.createChild(new ServiceCollection());
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    assert.ok(insta1.createInstance(Consumer));
    assert.ok(insta2.createInstance(Consumer));
    insta1.dispose();
    assert.throws(() => insta2.createInstance(Consumer));
    assert.throws(() => insta1.createInstance(Consumer));
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuXG5jb25zdCBJU2VydmljZTEgPSBjcmVhdGVEZWNvcmF0b3I8SVNlcnZpY2UxPignc2VydmljZTEnKTtcblxuaW50ZXJmYWNlIElTZXJ2aWNlMSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YzogbnVtYmVyO1xufVxuXG5jbGFzcyBTZXJ2aWNlMSBpbXBsZW1lbnRzIElTZXJ2aWNlMSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjID0gMTtcbn1cblxuY29uc3QgSVNlcnZpY2UyID0gY3JlYXRlRGVjb3JhdG9yPElTZXJ2aWNlMj4oJ3NlcnZpY2UyJyk7XG5cbmludGVyZmFjZSBJU2VydmljZTIge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGQ6IGJvb2xlYW47XG59XG5cbmNsYXNzIFNlcnZpY2UyIGltcGxlbWVudHMgSVNlcnZpY2UyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGQgPSB0cnVlO1xufVxuXG5jb25zdCBJU2VydmljZTMgPSBjcmVhdGVEZWNvcmF0b3I8SVNlcnZpY2UzPignc2VydmljZTMnKTtcblxuaW50ZXJmYWNlIElTZXJ2aWNlMyB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0czogc3RyaW5nO1xufVxuXG5jbGFzcyBTZXJ2aWNlMyBpbXBsZW1lbnRzIElTZXJ2aWNlMyB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRzID0gJ2ZhcmJvbyc7XG59XG5cbmNvbnN0IElEZXBlbmRlbnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElEZXBlbmRlbnRTZXJ2aWNlPignZGVwZW5kZW50U2VydmljZScpO1xuXG5pbnRlcmZhY2UgSURlcGVuZGVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdG5hbWU6IHN0cmluZztcbn1cblxuY2xhc3MgRGVwZW5kZW50U2VydmljZSBpbXBsZW1lbnRzIElEZXBlbmRlbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGNvbnN0cnVjdG9yKEBJU2VydmljZTEgc2VydmljZTogSVNlcnZpY2UxKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYywgMSk7XG5cdH1cblxuXHRuYW1lID0gJ2ZhcmJvbyc7XG59XG5cbmNsYXNzIFNlcnZpY2UxQ29uc3VtZXIge1xuXG5cdGNvbnN0cnVjdG9yKEBJU2VydmljZTEgc2VydmljZTE6IElTZXJ2aWNlMSkge1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UxLmMsIDEpO1xuXHR9XG59XG5cbmNsYXNzIFRhcmdldDJEZXAge1xuXG5cdGNvbnN0cnVjdG9yKEBJU2VydmljZTEgc2VydmljZTE6IElTZXJ2aWNlMSwgQElTZXJ2aWNlMiBzZXJ2aWNlMjogU2VydmljZTIpIHtcblx0XHRhc3NlcnQub2soc2VydmljZTEgaW5zdGFuY2VvZiBTZXJ2aWNlMSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UyIGluc3RhbmNlb2YgU2VydmljZTIpO1xuXHR9XG59XG5cbmNsYXNzIFRhcmdldFdpdGhTdGF0aWNQYXJhbSB7XG5cdGNvbnN0cnVjdG9yKHY6IGJvb2xlYW4sIEBJU2VydmljZTEgc2VydmljZTE6IElTZXJ2aWNlMSkge1xuXHRcdGFzc2VydC5vayh2KTtcblx0XHRhc3NlcnQub2soc2VydmljZTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlMS5jLCAxKTtcblx0fVxufVxuXG5cblxuY2xhc3MgRGVwZW5kZW50U2VydmljZVRhcmdldCB7XG5cdGNvbnN0cnVjdG9yKEBJRGVwZW5kZW50U2VydmljZSBkOiBJRGVwZW5kZW50U2VydmljZSkge1xuXHRcdGFzc2VydC5vayhkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZC5uYW1lLCAnZmFyYm9vJyk7XG5cdH1cbn1cblxuY2xhc3MgRGVwZW5kZW50U2VydmljZVRhcmdldDIge1xuXHRjb25zdHJ1Y3RvcihASURlcGVuZGVudFNlcnZpY2UgZDogSURlcGVuZGVudFNlcnZpY2UsIEBJU2VydmljZTEgczogSVNlcnZpY2UxKSB7XG5cdFx0YXNzZXJ0Lm9rKGQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkLm5hbWUsICdmYXJib28nKTtcblx0XHRhc3NlcnQub2socyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHMuYywgMSk7XG5cdH1cbn1cblxuXG5jbGFzcyBTZXJ2aWNlTG9vcDEgaW1wbGVtZW50cyBJU2VydmljZTEge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YyA9IDE7XG5cblx0Y29uc3RydWN0b3IoQElTZXJ2aWNlMiBzOiBJU2VydmljZTIpIHtcblxuXHR9XG59XG5cbmNsYXNzIFNlcnZpY2VMb29wMiBpbXBsZW1lbnRzIElTZXJ2aWNlMiB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRkID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3RvcihASVNlcnZpY2UxIHM6IElTZXJ2aWNlMSkge1xuXG5cdH1cbn1cblxuc3VpdGUoJ0luc3RhbnRpYXRpb24gU2VydmljZScsICgpID0+IHtcblxuXHR0ZXN0KCdzZXJ2aWNlIGNvbGxlY3Rpb24sIGNhbm5vdCBvdmVyd3JpdGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGxldCByZXN1bHQgPSBjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG51bGwhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdHJlc3VsdCA9IGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlIGNvbGxlY3Rpb24sIGFkZC9oYXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbnVsbCEpO1xuXHRcdGFzc2VydC5vayhjb2xsZWN0aW9uLmhhcyhJU2VydmljZTEpKTtcblxuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMiwgbnVsbCEpO1xuXHRcdGFzc2VydC5vayhjb2xsZWN0aW9uLmhhcyhJU2VydmljZTEpKTtcblx0XHRhc3NlcnQub2soY29sbGVjdGlvbi5oYXMoSVNlcnZpY2UyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0BQYXJhbSAtIHNpbXBsZSBjbGFzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTZXJ2aWNlMSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTMsIG5ldyBTZXJ2aWNlMygpKTtcblxuXHRcdHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VydmljZTFDb25zdW1lcik7XG5cdH0pO1xuXG5cdHRlc3QoJ0BQYXJhbSAtIGZpeGVkIGFyZ3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoY29sbGVjdGlvbik7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UzLCBuZXcgU2VydmljZTMoKSk7XG5cblx0XHRzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhcmdldFdpdGhTdGF0aWNQYXJhbSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2UgY29sbGVjdGlvbiBpcyBsaXZlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlcnZpY2UxQ29uc3VtZXIpO1xuXG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cblx0XHRzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhcmdldDJEZXApO1xuXHRcdHNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZnVuY3Rpb24gKGEpIHtcblx0XHRcdGFzc2VydC5vayhhLmdldChJU2VydmljZTEpKTtcblx0XHRcdGFzc2VydC5vayhhLmdldChJU2VydmljZTIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gd2UgbWFkZSB0aGlzIGEgd2FybmluZ1xuXHQvLyB0ZXN0KCdAUGFyYW0gLSB0b28gbWFueSBhcmdzJywgZnVuY3Rpb24gKCkge1xuXHQvLyBcdGxldCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMywgbmV3IFNlcnZpY2UzKCkpO1xuXG5cdC8vIFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBhcmFtZXRlclRhcmdldDIsIHRydWUsIDIpKTtcblx0Ly8gfSk7XG5cblx0Ly8gdGVzdCgnQFBhcmFtIC0gdG9vIGZldyBhcmdzJywgZnVuY3Rpb24gKCkge1xuXHQvLyBcdGxldCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlKE9iamVjdC5jcmVhdGUobnVsbCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCkpO1xuXHQvLyBcdHNlcnZpY2UuYWRkU2luZ2xldG9uKElTZXJ2aWNlMywgbmV3IFNlcnZpY2UzKCkpO1xuXG5cdC8vIFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBhcmFtZXRlclRhcmdldDIpKTtcblx0Ly8gfSk7XG5cblx0dGVzdCgnU3luY0Rlc2MgLSBubyBkZXBlbmRlbmNpZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoY29sbGVjdGlvbik7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU3luY0Rlc2NyaXB0b3I8SVNlcnZpY2UxPihTZXJ2aWNlMSkpO1xuXG5cdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UxID0gYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UxLmMsIDEpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlMiA9IGFjY2Vzc29yLmdldChJU2VydmljZTEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UxID09PSBzZXJ2aWNlMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N5bmNEZXNjIC0gc2VydmljZSB3aXRoIHNlcnZpY2UgZGVwZW5kZW5jeScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcjxJU2VydmljZTE+KFNlcnZpY2UxKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSURlcGVuZGVudFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcjxJRGVwZW5kZW50U2VydmljZT4oRGVwZW5kZW50U2VydmljZSkpO1xuXG5cdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBkID0gYWNjZXNzb3IuZ2V0KElEZXBlbmRlbnRTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5vayhkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkLm5hbWUsICdmYXJib28nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3luY0Rlc2MgLSB0YXJnZXQgZGVwZW5kcyBvbiBzZXJ2aWNlIGZ1dHVyZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcjxJU2VydmljZTE+KFNlcnZpY2UxKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSURlcGVuZGVudFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcjxJRGVwZW5kZW50U2VydmljZT4oRGVwZW5kZW50U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZCA9IHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVwZW5kZW50U2VydmljZVRhcmdldCk7XG5cdFx0YXNzZXJ0Lm9rKGQgaW5zdGFuY2VvZiBEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0KTtcblxuXHRcdGNvbnN0IGQyID0gc2VydmljZS5jcmVhdGVJbnN0YW5jZShEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0Mik7XG5cdFx0YXNzZXJ0Lm9rKGQyIGluc3RhbmNlb2YgRGVwZW5kZW50U2VydmljZVRhcmdldDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdTeW5jRGVzYyAtIGV4cGxvZGUgb24gbG9vcCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcjxJU2VydmljZTE+KFNlcnZpY2VMb29wMSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMiwgbmV3IFN5bmNEZXNjcmlwdG9yPElTZXJ2aWNlMj4oU2VydmljZUxvb3AyKSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdHNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSVNlcnZpY2UxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJU2VydmljZTIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJU2VydmljZTEpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyLm5hbWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0ludm9rZSAtIGdldCBzZXJ2aWNlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTZXJ2aWNlMSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpKTtcblxuXHRcdGZ1bmN0aW9uIHRlc3QoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGFzc2VydC5vayhhY2Nlc3Nvci5nZXQoSVNlcnZpY2UxKSBpbnN0YW5jZW9mIFNlcnZpY2UxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY2Nlc3Nvci5nZXQoSVNlcnZpY2UxKS5jLCAxKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGVzdCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnZva2UgLSBnZXQgc2VydmljZSwgb3B0aW9uYWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKV0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoY29sbGVjdGlvbiwgdHJ1ZSk7XG5cblx0XHRmdW5jdGlvbiB0ZXN0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRhc3NlcnQub2soYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSkgaW5zdGFuY2VvZiBTZXJ2aWNlMSk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGFjY2Vzc29yLmdldChJU2VydmljZTIpKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnZva2VGdW5jdGlvbih0ZXN0KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ludm9rZSAtIGtlZXBpbmcgYWNjZXNzb3IgTk9UIGFsbG93ZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoY29sbGVjdGlvbik7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cblx0XHRsZXQgY2FjaGVkOiBTZXJ2aWNlc0FjY2Vzc29yO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLmdldChJU2VydmljZTEpIGluc3RhbmNlb2YgU2VydmljZTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLmdldChJU2VydmljZTEpLmMsIDEpO1xuXHRcdFx0Y2FjaGVkID0gYWNjZXNzb3I7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnZva2VGdW5jdGlvbih0ZXN0KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNhY2hlZC5nZXQoSVNlcnZpY2UyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ludm9rZSAtIHRocm93IGVycm9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCkpO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRlc3QpKTtcblx0fSk7XG5cblx0dGVzdCgnQ3JlYXRlIGNoaWxkJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHNlcnZpY2VJbnN0YW5jZUNvdW50ID0gMDtcblxuXHRcdGNvbnN0IEN0b3JDb3VudGVyID0gY2xhc3MgaW1wbGVtZW50cyBTZXJ2aWNlMSB7XG5cdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdGMgPSAxO1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHNlcnZpY2VJbnN0YW5jZUNvdW50ICs9IDE7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIGNyZWF0aW5nIHRoZSBzZXJ2aWNlIGluc3RhbmNlIEJFRk9SRSB0aGUgY2hpbGQgc2VydmljZVxuXHRcdGxldCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSVNlcnZpY2UxLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ3RvckNvdW50ZXIpXSkpO1xuXHRcdHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VydmljZTFDb25zdW1lcik7XG5cblx0XHQvLyBzZWNvbmQgaW5zdGFuY2UgbXVzdCBiZSBlYXJsaWVyIE9ORVxuXHRcdGxldCBjaGlsZCA9IHNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpXSkpO1xuXHRcdGNoaWxkLmNyZWF0ZUluc3RhbmNlKFNlcnZpY2UxQ29uc3VtZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2VJbnN0YW5jZUNvdW50LCAxKTtcblxuXHRcdC8vIGNyZWF0aW5nIHRoZSBzZXJ2aWNlIGluc3RhbmNlIEFGVEVSIHRoZSBjaGlsZCBzZXJ2aWNlXG5cdFx0c2VydmljZUluc3RhbmNlQ291bnQgPSAwO1xuXHRcdHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcihDdG9yQ291bnRlcildKSk7XG5cdFx0Y2hpbGQgPSBzZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKV0pKTtcblxuXHRcdC8vIHNlY29uZCBpbnN0YW5jZSBtdXN0IGJlIGVhcmxpZXIgT05FXG5cdFx0c2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXJ2aWNlMUNvbnN1bWVyKTtcblx0XHRjaGlsZC5jcmVhdGVJbnN0YW5jZShTZXJ2aWNlMUNvbnN1bWVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlSW5zdGFuY2VDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlbW90ZSB3aW5kb3cgLyBpbnRlZ3JhdGlvbiB0ZXN0cyBpcyBicm9rZW4gIzEwNTU2MicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IFNlcnZpY2UxID0gY3JlYXRlRGVjb3JhdG9yPGFueT4oJ3NlcnZpY2UxJyk7XG5cdFx0Y2xhc3MgU2VydmljZTFJbXBsIHtcblx0XHRcdGNvbnN0cnVjdG9yKEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGE6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0XHRjb25zdCBjID0gaW5zdGEuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KFNlcnZpY2UyKSk7IC8vIFRISVMgaXMgdGhlIHJlY3Vyc2l2ZSBjYWxsXG5cdFx0XHRcdGFzc2VydC5vayhjKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgU2VydmljZTIgPSBjcmVhdGVEZWNvcmF0b3I8YW55Pignc2VydmljZTInKTtcblx0XHRjbGFzcyBTZXJ2aWNlMkltcGwge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IH1cblx0XHR9XG5cblx0XHQvLyBUaGlzIHNlcnZpY2UgZGVwZW5kcyBvbiBTZXJ2aWNlMSBhbmQgU2VydmljZTIgQlVUIGNyZWF0aW5nIFNlcnZpY2UxIGNyZWF0ZXMgU2VydmljZTIgKHZpYSByZWN1cnNpdmUgaW52b2NhdGlvbilcblx0XHQvLyBhbmQgdGhlbiBTZXJ2Y2UyIHNob3VsZCBub3QgYmUgY3JlYXRlZCBhIHNlY29uZCB0aW1lXG5cdFx0Y29uc3QgU2VydmljZTIxID0gY3JlYXRlRGVjb3JhdG9yPGFueT4oJ3NlcnZpY2UyMScpO1xuXHRcdGNsYXNzIFNlcnZpY2UyMUltcGwge1xuXHRcdFx0Y29uc3RydWN0b3IoQFNlcnZpY2UyIHB1YmxpYyByZWFkb25seSBzZXJ2aWNlMjogU2VydmljZTJJbXBsLCBAU2VydmljZTEgcHVibGljIHJlYWRvbmx5IHNlcnZpY2UxOiBTZXJ2aWNlMUltcGwpIHsgfVxuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtTZXJ2aWNlMSwgbmV3IFN5bmNEZXNjcmlwdG9yKFNlcnZpY2UxSW1wbCldLFxuXHRcdFx0W1NlcnZpY2UyLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2VydmljZTJJbXBsKV0sXG5cdFx0XHRbU2VydmljZTIxLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2VydmljZTIxSW1wbCldLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgb2JqID0gaW5zdGEuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KFNlcnZpY2UyMSkpO1xuXHRcdGFzc2VydC5vayhvYmopO1xuXHR9KTtcblxuXHR0ZXN0KCdTeW5jL0FzeW5jIGRlcGVuZGVuY3kgbG9vcCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IEEgPSBjcmVhdGVEZWNvcmF0b3I8QT4oJ0EnKTtcblx0XHRjb25zdCBCID0gY3JlYXRlRGVjb3JhdG9yPEI+KCdCJyk7XG5cdFx0aW50ZXJmYWNlIEEgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7IGRvSXQoKTogdm9pZCB9XG5cdFx0aW50ZXJmYWNlIEIgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7IGIoKTogYm9vbGVhbiB9XG5cblx0XHRjbGFzcyBCQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoQEIgcHJpdmF0ZSByZWFkb25seSBiOiBCKSB7XG5cblx0XHRcdH1cblx0XHRcdGRvSXQoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmIuYigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIEFTZXJ2aWNlIGltcGxlbWVudHMgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRwcm9wOiBCQ29uc3VtZXI7XG5cdFx0XHRjb25zdHJ1Y3RvcihASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRcdFx0dGhpcy5wcm9wID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQkNvbnN1bWVyKTtcblx0XHRcdH1cblx0XHRcdGRvSXQoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnByb3AuZG9JdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIEJTZXJ2aWNlIGltcGxlbWVudHMgQiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdHJ1Y3RvcihAQSBhOiBBKSB7XG5cdFx0XHRcdGFzc2VydC5vayhhKTtcblx0XHRcdH1cblx0XHRcdGIoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0fVxuXG5cdFx0Ly8gU1lOQyAtPiBleHBsb2RlcyBBSW1wbCAtPiBbaW5zdGE6QkNvbnN1bWVyXSAtPiBCSW1wbCAtPiBBSW1wbFxuXHRcdHtcblx0XHRcdGNvbnN0IGluc3RhMSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtBLCBuZXcgU3luY0Rlc2NyaXB0b3IoQVNlcnZpY2UpXSxcblx0XHRcdFx0W0IsIG5ldyBTeW5jRGVzY3JpcHRvcihCU2VydmljZSldLFxuXHRcdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aW5zdGExLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChBKSk7XG5cdFx0XHRcdGFzc2VydC5vayhmYWxzZSk7XG5cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1JFQ1VSU0lWRUxZJykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFTWU5DIC0+IGRvZXNuJ3QgZXhwbG9kZSBidXQgY3ljbGUgaXMgdHJhY2tlZFxuXHRcdHtcblx0XHRcdGNvbnN0IGluc3RhMiA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtBLCBuZXcgU3luY0Rlc2NyaXB0b3IoQVNlcnZpY2UsIHVuZGVmaW5lZCwgdHJ1ZSldLFxuXHRcdFx0XHRbQiwgbmV3IFN5bmNEZXNjcmlwdG9yKEJTZXJ2aWNlLCB1bmRlZmluZWQpXSxcblx0XHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGEgPSBpbnN0YTIuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KEEpKTtcblx0XHRcdGEuZG9JdCgpO1xuXG5cdFx0XHRjb25zdCBjeWNsZSA9IGluc3RhMi5fZ2xvYmFsR3JhcGg/LmZpbmRDeWNsZVNsb3coKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjeWNsZSwgJ0EgLT4gQiAtPiBBJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdEZWxheWVkIGFuZCBldmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgQSA9IGNyZWF0ZURlY29yYXRvcjxBPignQScpO1xuXHRcdGludGVyZmFjZSBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRG9JdDogRXZlbnQ8YW55Pjtcblx0XHRcdGRvSXQoKTogdm9pZDtcblx0XHR9XG5cblx0XHRsZXQgY3JlYXRlZCA9IGZhbHNlO1xuXHRcdGNsYXNzIEFJbXBsIGltcGxlbWVudHMgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRfZG9JdCA9IDA7XG5cblx0XHRcdF9vbkRpZERvSXQgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRcdFx0cmVhZG9ubHkgb25EaWREb0l0OiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkRG9JdC5ldmVudDtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdGNyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRkb0l0KCk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLl9kb0l0ICs9IDE7XG5cdFx0XHRcdHRoaXMuX29uRGlkRG9JdC5maXJlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtBLCBuZXcgU3luY0Rlc2NyaXB0b3IoQUltcGwsIHVuZGVmaW5lZCwgdHJ1ZSldLFxuXHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjbGFzcyBDb25zdW1lciB7XG5cdFx0XHRjb25zdHJ1Y3RvcihAQSBwdWJsaWMgcmVhZG9ubHkgYTogQSkge1xuXHRcdFx0XHQvLyBlYWdlciBzdWJzY3JpYmUgLT4gTk8gc2VydmljZSBpbnN0YW5jZVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGM6IENvbnN1bWVyID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpO1xuXHRcdGxldCBldmVudENvdW50ID0gMDtcblxuXHRcdC8vIHN1YnNjcmliaW5nIHRvIGV2ZW50IGRvZXNuJ3QgdHJpZ2dlciBpbnN0YW50aWF0aW9uXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSAoZTogYW55KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIEFJbXBsKTtcblx0XHRcdGV2ZW50Q291bnQrKztcblx0XHR9O1xuXHRcdGNvbnN0IGQxID0gYy5hLm9uRGlkRG9JdChsaXN0ZW5lcik7XG5cdFx0Y29uc3QgZDIgPSBjLmEub25EaWREb0l0KGxpc3RlbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAwKTtcblx0XHRkMi5kaXNwb3NlKCk7XG5cblx0XHQvLyBpbnN0YW50aWF0aW9uIGhhcHBlbnMgb24gZmlyc3QgY2FsbFxuXHRcdGMuYS5kb0l0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblxuXG5cdFx0Y29uc3QgZDMgPSBjLmEub25EaWREb0l0KGxpc3RlbmVyKTtcblx0XHRjLmEuZG9JdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAzKTtcblxuXHRcdGRpc3Bvc2UoW2QxLCBkM10pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0NhcHR1cmUgZXZlbnQgYmVmb3JlIGluaXQsIHVzZSBhZnRlciBpbml0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IEEgPSBjcmVhdGVEZWNvcmF0b3I8QT4oJ0EnKTtcblx0XHRpbnRlcmZhY2UgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRyZWFkb25seSBvbkRpZERvSXQ6IEV2ZW50PGFueT47XG5cdFx0XHRkb0l0KCk6IHZvaWQ7XG5cdFx0XHRub29wKCk6IHZvaWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGNyZWF0ZWQgPSBmYWxzZTtcblx0XHRjbGFzcyBBSW1wbCBpbXBsZW1lbnRzIEEge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0X2RvSXQgPSAwO1xuXG5cdFx0XHRfb25EaWREb0l0ID0gbmV3IEVtaXR0ZXI8dGhpcz4oKTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRG9JdDogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZERvSXQuZXZlbnQ7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRjcmVhdGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0ZG9JdCgpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fZG9JdCArPSAxO1xuXHRcdFx0XHR0aGlzLl9vbkRpZERvSXQuZmlyZSh0aGlzKTtcblx0XHRcdH1cblxuXHRcdFx0bm9vcCgpOiB2b2lkIHtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbQSwgbmV3IFN5bmNEZXNjcmlwdG9yKEFJbXBsLCB1bmRlZmluZWQsIHRydWUpXSxcblx0XHQpLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y2xhc3MgQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoQEEgcHVibGljIHJlYWRvbmx5IGE6IEEpIHtcblx0XHRcdFx0Ly8gZWFnZXIgc3Vic2NyaWJlIC0+IE5PIHNlcnZpY2UgaW5zdGFuY2Vcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjOiBDb25zdW1lciA9IGluc3RhLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKTtcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cblx0XHQvLyBzdWJzY3JpYmluZyB0byBldmVudCBkb2Vzbid0IHRyaWdnZXIgaW5zdGFudGlhdGlvblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gKGU6IGFueSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBBSW1wbCk7XG5cdFx0XHRldmVudENvdW50Kys7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gYy5hLm9uRGlkRG9JdDtcblxuXHRcdC8vIGNvbnN0IGQxID0gYy5hLm9uRGlkRG9JdChsaXN0ZW5lcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQsIGZhbHNlKTtcblxuXHRcdGMuYS5ub29wKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgZDEgPSBldmVudChsaXN0ZW5lcik7XG5cblx0XHRjLmEuZG9JdCgpO1xuXG5cblx0XHQvLyBpbnN0YW50aWF0aW9uIGhhcHBlbnMgb24gZmlyc3QgY2FsbFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblxuXHRcdGRpc3Bvc2UoZDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdEaXNwb3NlIGVhcmx5IGV2ZW50IGxpc3RlbmVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IEEgPSBjcmVhdGVEZWNvcmF0b3I8QT4oJ0EnKTtcblx0XHRpbnRlcmZhY2UgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRyZWFkb25seSBvbkRpZERvSXQ6IEV2ZW50PGFueT47XG5cdFx0XHRkb0l0KCk6IHZvaWQ7XG5cdFx0fVxuXHRcdGxldCBjcmVhdGVkID0gZmFsc2U7XG5cdFx0Y2xhc3MgQUltcGwgaW1wbGVtZW50cyBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdF9kb0l0ID0gMDtcblxuXHRcdFx0X29uRGlkRG9JdCA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdFx0XHRyZWFkb25seSBvbkRpZERvSXQ6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWREb0l0LmV2ZW50O1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0Y3JlYXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGRvSXQoKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuX2RvSXQgKz0gMTtcblx0XHRcdFx0dGhpcy5fb25EaWREb0l0LmZpcmUodGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0EsIG5ldyBTeW5jRGVzY3JpcHRvcihBSW1wbCwgdW5kZWZpbmVkLCB0cnVlKV0sXG5cdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNsYXNzIENvbnN1bWVyIHtcblx0XHRcdGNvbnN0cnVjdG9yKEBBIHB1YmxpYyByZWFkb25seSBhOiBBKSB7XG5cdFx0XHRcdC8vIGVhZ2VyIHN1YnNjcmliZSAtPiBOTyBzZXJ2aWNlIGluc3RhbmNlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYzogQ29uc3VtZXIgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShDb25zdW1lcik7XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXG5cdFx0Ly8gc3Vic2NyaWJpbmcgdG8gZXZlbnQgZG9lc24ndCB0cmlnZ2VyIGluc3RhbnRpYXRpb25cblx0XHRjb25zdCBsaXN0ZW5lciA9IChlOiBhbnkpID0+IHtcblx0XHRcdGFzc2VydC5vayhlIGluc3RhbmNlb2YgQUltcGwpO1xuXHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdH07XG5cblx0XHRjb25zdCBkMSA9IGMuYS5vbkRpZERvSXQobGlzdGVuZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDApO1xuXG5cdFx0Yy5hLmRvSXQoKTtcblxuXHRcdC8vIGluc3RhbnRpYXRpb24gaGFwcGVucyBvbiBmaXJzdCBjYWxsXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblxuXHRcdGRpc3Bvc2UoZDEpO1xuXG5cdFx0Yy5hLmRvSXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRGlzcG9zZSBzZXJ2aWNlcyBpdCBjcmVhdGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBkaXNwb3NlZEEgPSBmYWxzZTtcblx0XHRsZXQgZGlzcG9zZWRCID0gZmFsc2U7XG5cblx0XHRjb25zdCBBID0gY3JlYXRlRGVjb3JhdG9yPEE+KCdBJyk7XG5cdFx0aW50ZXJmYWNlIEEge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDE7XG5cdFx0fVxuXHRcdGNsYXNzIEFJbXBsIGltcGxlbWVudHMgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMSA9IDE7XG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRkaXNwb3NlZEEgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IEIgPSBjcmVhdGVEZWNvcmF0b3I8Qj4oJ0InKTtcblx0XHRpbnRlcmZhY2UgQiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMTtcblx0XHR9XG5cdFx0Y2xhc3MgQkltcGwgaW1wbGVtZW50cyBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxID0gMTtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGRpc3Bvc2VkQiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0EsIG5ldyBTeW5jRGVzY3JpcHRvcihBSW1wbCwgdW5kZWZpbmVkLCB0cnVlKV0sXG5cdFx0XHRbQiwgbmV3IEJJbXBsKCldLFxuXHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjbGFzcyBDb25zdW1lciB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0QEEgcHVibGljIHJlYWRvbmx5IGE6IEEsXG5cdFx0XHRcdEBCIHB1YmxpYyByZWFkb25seSBiOiBCXG5cdFx0XHQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudmFsdWUsIGIudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGM6IENvbnN1bWVyID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpO1xuXG5cdFx0aW5zdGEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayhjKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRBLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRCLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Rpc3Bvc2VkIHNlcnZpY2UgY2Fubm90IGJlIHVzZWQgYW55bW9yZScsIGZ1bmN0aW9uICgpIHtcblxuXG5cdFx0Y29uc3QgQiA9IGNyZWF0ZURlY29yYXRvcjxCPignQicpO1xuXHRcdGludGVyZmFjZSBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxO1xuXHRcdH1cblx0XHRjbGFzcyBCSW1wbCBpbXBsZW1lbnRzIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDEgPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtCLCBuZXcgQkltcGwoKV0sXG5cdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNsYXNzIENvbnN1bWVyIHtcblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRAQiBwdWJsaWMgcmVhZG9ubHkgYjogQlxuXHRcdFx0KSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnZhbHVlLCAxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjOiBDb25zdW1lciA9IGluc3RhLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKTtcblx0XHRhc3NlcnQub2soYyk7XG5cblx0XHRpbnN0YS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGluc3RhLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpbnN0YS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7IH0pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGluc3RhLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoaWxkIGRvZXMgbm90IGRpc3Bvc2UgcGFyZW50JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgQiA9IGNyZWF0ZURlY29yYXRvcjxCPignQicpO1xuXHRcdGludGVyZmFjZSBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxO1xuXHRcdH1cblx0XHRjbGFzcyBCSW1wbCBpbXBsZW1lbnRzIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDEgPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhMSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbQiwgbmV3IEJJbXBsKCldLFxuXHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnN0YTIgPSBpbnN0YTEuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKCkpO1xuXG5cdFx0Y2xhc3MgQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdEBCIHB1YmxpYyByZWFkb25seSBiOiBCXG5cdFx0XHQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudmFsdWUsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5vayhpbnN0YTEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblx0XHRhc3NlcnQub2soaW5zdGEyLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7XG5cblx0XHRpbnN0YTIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGluc3RhMS5jcmVhdGVJbnN0YW5jZShDb25zdW1lcikpOyAvLyBwYXJlbnQgTk9UIGRpc3Bvc2VkIGJ5IGNoaWxkXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpbnN0YTIuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblx0fSk7XG5cblx0dGVzdCgnUGFyZW50IGRvZXMgZGlzcG9zZSBjaGlsZHJlbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IEIgPSBjcmVhdGVEZWNvcmF0b3I8Qj4oJ0InKTtcblx0XHRpbnRlcmZhY2UgQiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMTtcblx0XHR9XG5cdFx0Y2xhc3MgQkltcGwgaW1wbGVtZW50cyBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxID0gMTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YTEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0IsIG5ldyBCSW1wbCgpXSxcblx0XHQpLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5zdGEyID0gaW5zdGExLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpKTtcblxuXHRcdGNsYXNzIENvbnN1bWVyIHtcblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRAQiBwdWJsaWMgcmVhZG9ubHkgYjogQlxuXHRcdFx0KSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnZhbHVlLCAxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnQub2soaW5zdGExLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7XG5cdFx0YXNzZXJ0Lm9rKGluc3RhMi5jcmVhdGVJbnN0YW5jZShDb25zdW1lcikpO1xuXG5cdFx0aW5zdGExLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGEyLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7IC8vIGNoaWxkIGlzIGRpc3Bvc2VkIGJ5IHBhcmVudFxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGExLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQiw2QkFBK0M7QUFDekUsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxZQUFZLGdCQUEyQixVQUFVO0FBT3ZELE1BQU0sU0FBOEI7QUFBQSxFQUFwQztBQUVDLGFBQUk7QUFBQTtBQUNMO0FBRUEsTUFBTSxZQUFZLGdCQUEyQixVQUFVO0FBT3ZELE1BQU0sU0FBOEI7QUFBQSxFQUFwQztBQUVDLGFBQUk7QUFBQTtBQUNMO0FBRUEsTUFBTSxZQUFZLGdCQUEyQixVQUFVO0FBT3ZELE1BQU0sU0FBOEI7QUFBQSxFQUFwQztBQUVDLGFBQUk7QUFBQTtBQUNMO0FBRUEsTUFBTSxvQkFBb0IsZ0JBQW1DLGtCQUFrQjtBQU8vRSxJQUFNLG1CQUFOLE1BQW9EO0FBQUEsRUFFbkQsWUFBdUIsU0FBb0I7QUFJM0MsZ0JBQU87QUFITixXQUFPLFlBQVksUUFBUSxHQUFHLENBQUM7QUFBQSxFQUNoQztBQUdEO0FBUE0sbUJBQU47QUFBQSxFQUVjO0FBQUEsR0FGUjtBQVNOLElBQU0sbUJBQU4sTUFBdUI7QUFBQSxFQUV0QixZQUF1QixVQUFxQjtBQUMzQyxXQUFPLEdBQUcsUUFBUTtBQUNsQixXQUFPLFlBQVksU0FBUyxHQUFHLENBQUM7QUFBQSxFQUNqQztBQUNEO0FBTk0sbUJBQU47QUFBQSxFQUVjO0FBQUEsR0FGUjtBQVFOLElBQU0sYUFBTixNQUFpQjtBQUFBLEVBRWhCLFlBQXVCLFVBQWdDLFVBQW9CO0FBQzFFLFdBQU8sR0FBRyxvQkFBb0IsUUFB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
