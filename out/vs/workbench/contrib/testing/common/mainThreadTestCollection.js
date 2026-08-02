import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { AbstractIncrementalTestCollection, TestDiffOpType } from "./testTypes.js";
class MainThreadTestCollection extends AbstractIncrementalTestCollection {
  constructor(uriIdentityService, expandActual) {
    super(uriIdentityService);
    this.expandActual = expandActual;
    this.testsByUrl = new ResourceMap();
    this.busyProvidersChangeEmitter = new Emitter();
    this.expandPromises = /* @__PURE__ */ new WeakMap();
    this.onBusyProvidersChange = this.busyProvidersChangeEmitter.event;
    this.changeCollector = {
      add: (node) => {
        if (!node.item.uri) {
          return;
        }
        const s = this.testsByUrl.get(node.item.uri);
        if (!s) {
          this.testsByUrl.set(node.item.uri, /* @__PURE__ */ new Set([node]));
        } else {
          s.add(node);
        }
      },
      remove: (node) => {
        if (!node.item.uri) {
          return;
        }
        const s = this.testsByUrl.get(node.item.uri);
        if (!s) {
          return;
        }
        s.delete(node);
        if (s.size === 0) {
          this.testsByUrl.delete(node.item.uri);
        }
      }
    };
  }
  /**
   * @inheritdoc
   */
  get busyProviders() {
    return this.busyControllerCount;
  }
  /**
   * @inheritdoc
   */
  get rootItems() {
    return this.roots;
  }
  /**
   * @inheritdoc
   */
  get all() {
    return this.getIterator();
  }
  get rootIds() {
    return Iterable.map(this.roots.values(), (r) => r.item.extId);
  }
  /**
   * @inheritdoc
   */
  expand(testId, levels) {
    const test = this.items.get(testId);
    if (!test) {
      return Promise.resolve();
    }
    const existing = this.expandPromises.get(test);
    if (existing && existing.pendingLvl >= levels) {
      return existing.prom;
    }
    const prom = this.expandActual(test.item.extId, levels);
    const record = { doneLvl: existing ? existing.doneLvl : -1, pendingLvl: levels, prom };
    this.expandPromises.set(test, record);
    return prom.then(() => {
      record.doneLvl = levels;
    });
  }
  /**
   * @inheritdoc
   */
  getNodeById(id) {
    return this.items.get(id);
  }
  /**
   * @inheritdoc
   */
  getNodeByUrl(uri) {
    return this.testsByUrl.get(uri) || Iterable.empty();
  }
  /**
   * @inheritdoc
   */
  getReviverDiff() {
    const ops = [{ op: TestDiffOpType.IncrementPendingExtHosts, amount: this.pendingRootCount }];
    const queue = [this.rootIds];
    while (queue.length) {
      for (const child of queue.pop()) {
        const item = this.items.get(child);
        ops.push({
          op: TestDiffOpType.Add,
          item: {
            controllerId: item.controllerId,
            expand: item.expand,
            item: item.item
          }
        });
        queue.push(item.children);
      }
    }
    return ops;
  }
  /**
   * Applies the diff to the collection.
   */
  apply(diff) {
    const prevBusy = this.busyControllerCount;
    super.apply(diff);
    if (prevBusy !== this.busyControllerCount) {
      this.busyProvidersChangeEmitter.fire(this.busyControllerCount);
    }
  }
  /**
   * Clears everything from the collection, and returns a diff that applies
   * that action.
   */
  clear() {
    const ops = [];
    for (const root of this.roots) {
      ops.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
    }
    this.roots.clear();
    this.items.clear();
    return ops;
  }
  /**
   * @override
   */
  createItem(internal) {
    return { ...internal, children: /* @__PURE__ */ new Set() };
  }
  createChangeCollector() {
    return this.changeCollector;
  }
  *getIterator() {
    const queue = new LinkedList();
    queue.push(this.rootIds);
    while (queue.size > 0) {
      for (const id of queue.pop()) {
        const node = this.getNodeById(id);
        yield node;
        queue.push(node.children);
      }
    }
  }
}
export {
  MainThreadTestCollection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL21haW5UaHJlYWRUZXN0Q29sbGVjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uIH0gZnJvbSAnLi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb24sIElUZXN0VXJpQ2Fub25pY2FsaXplciwgSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3IsIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtLCBJbnRlcm5hbFRlc3RJdGVtLCBUZXN0RGlmZk9wVHlwZSwgVGVzdHNEaWZmIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uPEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtPiBpbXBsZW1lbnRzIElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24ge1xuXHRwcml2YXRlIHRlc3RzQnlVcmwgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtPj4oKTtcblxuXHRwcml2YXRlIGJ1c3lQcm92aWRlcnNDaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bnVtYmVyPigpO1xuXHRwcml2YXRlIGV4cGFuZFByb21pc2VzID0gbmV3IFdlYWtNYXA8SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0sIHtcblx0XHRwZW5kaW5nTHZsOiBudW1iZXI7XG5cdFx0ZG9uZUx2bDogbnVtYmVyO1xuXHRcdHByb206IFByb21pc2U8dm9pZD47XG5cdH0+KCk7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGJ1c3lQcm92aWRlcnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldCByb290SXRlbXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMucm9vdHM7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXQgYWxsKCkge1xuXHRcdHJldHVybiB0aGlzLmdldEl0ZXJhdG9yKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJvb3RJZHMoKSB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcCh0aGlzLnJvb3RzLnZhbHVlcygpLCByID0+IHIuaXRlbS5leHRJZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgb25CdXN5UHJvdmlkZXJzQ2hhbmdlID0gdGhpcy5idXN5UHJvdmlkZXJzQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcih1cmlJZGVudGl0eVNlcnZpY2U6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgcHJpdmF0ZSByZWFkb25seSBleHBhbmRBY3R1YWw6IChpZDogc3RyaW5nLCBsZXZlbHM6IG51bWJlcikgPT4gUHJvbWlzZTx2b2lkPikge1xuXHRcdHN1cGVyKHVyaUlkZW50aXR5U2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBleHBhbmQodGVzdElkOiBzdHJpbmcsIGxldmVsczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVzdCA9IHRoaXMuaXRlbXMuZ2V0KHRlc3RJZCk7XG5cdFx0aWYgKCF0ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gc2ltcGxlIGNhY2hlIHRvIGF2b2lkIGR1cGxpY2F0ZS91bm5lY2Vzc2FyeSBleHBhbnNpb24gY2FsbHNcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuZXhwYW5kUHJvbWlzZXMuZ2V0KHRlc3QpO1xuXHRcdGlmIChleGlzdGluZyAmJiBleGlzdGluZy5wZW5kaW5nTHZsID49IGxldmVscykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnByb207XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbSA9IHRoaXMuZXhwYW5kQWN0dWFsKHRlc3QuaXRlbS5leHRJZCwgbGV2ZWxzKTtcblx0XHRjb25zdCByZWNvcmQgPSB7IGRvbmVMdmw6IGV4aXN0aW5nID8gZXhpc3RpbmcuZG9uZUx2bCA6IC0xLCBwZW5kaW5nTHZsOiBsZXZlbHMsIHByb20gfTtcblx0XHR0aGlzLmV4cGFuZFByb21pc2VzLnNldCh0ZXN0LCByZWNvcmQpO1xuXG5cdFx0cmV0dXJuIHByb20udGhlbigoKSA9PiB7XG5cdFx0XHRyZWNvcmQuZG9uZUx2bCA9IGxldmVscztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldE5vZGVCeUlkKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcy5nZXQoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Tm9kZUJ5VXJsKHVyaTogVVJJKTogSXRlcmFibGU8SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0+IHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0c0J5VXJsLmdldCh1cmkpIHx8IEl0ZXJhYmxlLmVtcHR5KCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXRSZXZpdmVyRGlmZigpIHtcblx0XHRjb25zdCBvcHM6IFRlc3RzRGlmZiA9IFt7IG9wOiBUZXN0RGlmZk9wVHlwZS5JbmNyZW1lbnRQZW5kaW5nRXh0SG9zdHMsIGFtb3VudDogdGhpcy5wZW5kaW5nUm9vdENvdW50IH1dO1xuXG5cdFx0Y29uc3QgcXVldWUgPSBbdGhpcy5yb290SWRzXTtcblx0XHR3aGlsZSAocXVldWUubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHF1ZXVlLnBvcCgpISkge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtcy5nZXQoY2hpbGQpITtcblx0XHRcdFx0b3BzLnB1c2goe1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiBpdGVtLmNvbnRyb2xsZXJJZCxcblx0XHRcdFx0XHRcdGV4cGFuZDogaXRlbS5leHBhbmQsXG5cdFx0XHRcdFx0XHRpdGVtOiBpdGVtLml0ZW0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cXVldWUucHVzaChpdGVtLmNoaWxkcmVuKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3BzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIGRpZmYgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgYXBwbHkoZGlmZjogVGVzdHNEaWZmKSB7XG5cdFx0Y29uc3QgcHJldkJ1c3kgPSB0aGlzLmJ1c3lDb250cm9sbGVyQ291bnQ7XG5cdFx0c3VwZXIuYXBwbHkoZGlmZik7XG5cblx0XHRpZiAocHJldkJ1c3kgIT09IHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudCkge1xuXHRcdFx0dGhpcy5idXN5UHJvdmlkZXJzQ2hhbmdlRW1pdHRlci5maXJlKHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyBldmVyeXRoaW5nIGZyb20gdGhlIGNvbGxlY3Rpb24sIGFuZCByZXR1cm5zIGEgZGlmZiB0aGF0IGFwcGxpZXNcblx0ICogdGhhdCBhY3Rpb24uXG5cdCAqL1xuXHRwdWJsaWMgY2xlYXIoKSB7XG5cdFx0Y29uc3Qgb3BzOiBUZXN0c0RpZmYgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgdGhpcy5yb290cykge1xuXHRcdFx0b3BzLnB1c2goeyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlLCBpdGVtSWQ6IHJvb3QuaXRlbS5leHRJZCB9KTtcblx0XHR9XG5cblx0XHR0aGlzLnJvb3RzLmNsZWFyKCk7XG5cdFx0dGhpcy5pdGVtcy5jbGVhcigpO1xuXG5cdFx0cmV0dXJuIG9wcztcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHByb3RlY3RlZCBjcmVhdGVJdGVtKGludGVybmFsOiBJbnRlcm5hbFRlc3RJdGVtKTogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0ge1xuXHRcdHJldHVybiB7IC4uLmludGVybmFsLCBjaGlsZHJlbjogbmV3IFNldCgpIH07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZUNvbGxlY3RvcjogSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3I8SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0+ID0ge1xuXHRcdGFkZDogbm9kZSA9PiB7XG5cdFx0XHRpZiAoIW5vZGUuaXRlbS51cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzID0gdGhpcy50ZXN0c0J5VXJsLmdldChub2RlLml0ZW0udXJpKTtcblx0XHRcdGlmICghcykge1xuXHRcdFx0XHR0aGlzLnRlc3RzQnlVcmwuc2V0KG5vZGUuaXRlbS51cmksIG5ldyBTZXQoW25vZGVdKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzLmFkZChub2RlKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlbW92ZTogbm9kZSA9PiB7XG5cdFx0XHRpZiAoIW5vZGUuaXRlbS51cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzID0gdGhpcy50ZXN0c0J5VXJsLmdldChub2RlLml0ZW0udXJpKTtcblx0XHRcdGlmICghcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHMuZGVsZXRlKG5vZGUpO1xuXHRcdFx0aWYgKHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnRlc3RzQnlVcmwuZGVsZXRlKG5vZGUuaXRlbS51cmkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH07XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNoYW5nZUNvbGxlY3RvcigpOiBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbT4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5nZUNvbGxlY3Rvcjtcblx0fVxuXG5cdHByaXZhdGUgKmdldEl0ZXJhdG9yKCkge1xuXHRcdGNvbnN0IHF1ZXVlID0gbmV3IExpbmtlZExpc3Q8SXRlcmFibGU8c3RyaW5nPj4oKTtcblx0XHRxdWV1ZS5wdXNoKHRoaXMucm9vdElkcyk7XG5cblx0XHR3aGlsZSAocXVldWUuc2l6ZSA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcXVldWUucG9wKCkhKSB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldE5vZGVCeUlkKGlkKSE7XG5cdFx0XHRcdHlpZWxkIG5vZGU7XG5cdFx0XHRcdHF1ZXVlLnB1c2gobm9kZS5jaGlsZHJlbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFHNUIsU0FBUyxtQ0FBdUksc0JBQWlDO0FBRTFLLE1BQU0saUNBQWlDLGtDQUFzRztBQUFBLEVBcUNuSixZQUFZLG9CQUE0RCxjQUE2RDtBQUNwSSxVQUFNLGtCQUFrQjtBQUQrQztBQXBDeEUsU0FBUSxhQUFhLElBQUksWUFBZ0Q7QUFFekUsU0FBUSw2QkFBNkIsSUFBSSxRQUFnQjtBQUN6RCxTQUFRLGlCQUFpQixvQkFBSSxRQUkxQjtBQTJCSCxTQUFnQix3QkFBd0IsS0FBSywyQkFBMkI7QUF3R3hFLFNBQWlCLGtCQUE2RTtBQUFBLE1BQzdGLEtBQUssVUFBUTtBQUNaLFlBQUksQ0FBQyxLQUFLLEtBQUssS0FBSztBQUNuQjtBQUFBLFFBQ0Q7QUFFQSxjQUFNLElBQUksS0FBSyxXQUFXLElBQUksS0FBSyxLQUFLLEdBQUc7QUFDM0MsWUFBSSxDQUFDLEdBQUc7QUFDUCxlQUFLLFdBQVcsSUFBSSxLQUFLLEtBQUssS0FBSyxvQkFBSSxJ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
