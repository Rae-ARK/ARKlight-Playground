import { findLast } from "../../../../base/common/arraysFind.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunHandleChanges, autorunOpts, autorunWithStore, observableValue, transaction } from "../../../../base/common/observable.js";
import { ElementSizeObserver } from "../../config/elementSizeObserver.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TextLength } from "../../../common/core/text/textLength.js";
function joinCombine(arr1, arr2, keySelector, combine) {
  if (arr1.length === 0) {
    return arr2;
  }
  if (arr2.length === 0) {
    return arr1;
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < arr1.length && j < arr2.length) {
    const val1 = arr1[i];
    const val2 = arr2[j];
    const key1 = keySelector(val1);
    const key2 = keySelector(val2);
    if (key1 < key2) {
      result.push(val1);
      i++;
    } else if (key1 > key2) {
      result.push(val2);
      j++;
    } else {
      result.push(combine(val1, val2));
      i++;
      j++;
    }
  }
  while (i < arr1.length) {
    result.push(arr1[i]);
    i++;
  }
  while (j < arr2.length) {
    result.push(arr2[j]);
    j++;
  }
  return result;
}
function applyObservableDecorations(editor, decorations) {
  const d = new DisposableStore();
  const decorationsCollection = editor.createDecorationsCollection();
  d.add(autorunOpts({ debugName: () => `Apply decorations from ${decorations.debugName}` }, (reader) => {
    const d2 = decorations.read(reader);
    decorationsCollection.set(d2);
  }));
  d.add({
    dispose: () => {
      decorationsCollection.clear();
    }
  });
  return d;
}
function appendRemoveOnDispose(parent, child) {
  parent.appendChild(child);
  return toDisposable(() => {
    child.remove();
  });
}
function prependRemoveOnDispose(parent, child) {
  parent.prepend(child);
  return toDisposable(() => {
    child.remove();
  });
}
class ObservableElementSizeObserver extends Disposable {
  constructor(element, dimension) {
    super();
    this._automaticLayout = false;
    this.elementSizeObserver = this._register(new ElementSizeObserver(element, dimension));
    this._width = observableValue(this, this.elementSizeObserver.getWidth());
    this._height = observableValue(this, this.elementSizeObserver.getHeight());
    this._register(this.elementSizeObserver.onDidChange((e) => transaction((tx) => {
      this._width.set(this.elementSizeObserver.getWidth(), tx);
      this._height.set(this.elementSizeObserver.getHeight(), tx);
    })));
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  get automaticLayout() {
    return this._automaticLayout;
  }
  observe(dimension) {
    this.elementSizeObserver.observe(dimension);
  }
  setAutomaticLayout(automaticLayout) {
    this._automaticLayout = automaticLayout;
    if (automaticLayout) {
      this.elementSizeObserver.startObserving();
    } else {
      this.elementSizeObserver.stopObserving();
    }
  }
}
function animatedObservable(targetWindow, base, store) {
  let targetVal = base.get();
  let startVal = targetVal;
  let curVal = targetVal;
  const result = observableValue("animatedValue", targetVal);
  let animationStartMs = -1;
  const durationMs = 300;
  let animationFrame = void 0;
  store.add(autorunHandleChanges({
    changeTracker: {
      createChangeSummary: () => ({ animate: false }),
      handleChange: (ctx, s) => {
        if (ctx.didChange(base)) {
          s.animate = s.animate || ctx.change;
        }
        return true;
      }
    }
  }, (reader, s) => {
    if (animationFrame !== void 0) {
      targetWindow.cancelAnimationFrame(animationFrame);
      animationFrame = void 0;
    }
    startVal = curVal;
    targetVal = base.read(reader);
    if (startVal === targetVal) {
      animationStartMs = Date.now() - durationMs;
    } else {
      animationStartMs = Date.now() - (s.animate ? 0 : durationMs);
    }
    update();
  }));
  function update() {
    const passedMs = Date.now() - animationStartMs;
    curVal = Math.floor(easeOutExpo(passedMs, startVal, targetVal - startVal, durationMs));
    if (passedMs < durationMs) {
      animationFrame = targetWindow.requestAnimationFrame(update);
    } else {
      curVal = targetVal;
    }
    result.set(curVal, void 0);
  }
  return result;
}
function easeOutExpo(t, b, c, d) {
  return t === d ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
}
function deepMerge(source1, source2) {
  const result = {};
  for (const key in source1) {
    result[key] = source1[key];
  }
  for (const key in source2) {
    const source2Value = source2[key];
    if (typeof result[key] === "object" && source2Value && typeof source2Value === "object") {
      result[key] = deepMerge(result[key], source2Value);
    } else {
      result[key] = source2Value;
    }
  }
  return result;
}
class ViewZoneOverlayWidget extends Disposable {
  constructor(editor, viewZone, htmlElement) {
    super();
    this._register(new ManagedOverlayWidget(editor, htmlElement));
    this._register(applyStyle(htmlElement, {
      height: viewZone.actualHeight,
      top: viewZone.actualTop
    }));
  }
}
class PlaceholderViewZone {
  constructor(_afterLineNumber, heightInPx) {
    this._afterLineNumber = _afterLineNumber;
    this.heightInPx = heightInPx;
    this.domNode = document.createElement("div");
    this._actualTop = observableValue(this, void 0);
    this._actualHeight = observableValue(this, void 0);
    this.actualTop = this._actualTop;
    this.actualHeight = this._actualHeight;
    this.showInHiddenAreas = true;
    this.onChange = this._afterLineNumber;
    this.onDomNodeTop = (top) => {
      this._actualTop.set(top, void 0);
    };
    this.onComputedHeight = (height) => {
      this._actualHeight.set(height, void 0);
    };
  }
  get afterLineNumber() {
    return this._afterLineNumber.get();
  }
}
const _ManagedOverlayWidget = class _ManagedOverlayWidget {
  constructor(_editor, _domElement) {
    this._editor = _editor;
    this._domElement = _domElement;
    this._overlayWidgetId = `managedOverlayWidget-${_ManagedOverlayWidget._counter++}`;
    this._overlayWidget = {
      getId: () => this._overlayWidgetId,
      getDomNode: () => this._domElement,
      getPosition: () => null
    };
    this._editor.addOverlayWidget(this._overlayWidget);
  }
  dispose() {
    this._editor.removeOverlayWidget(this._overlayWidget);
  }
};
_ManagedOverlayWidget._counter = 0;
let ManagedOverlayWidget = _ManagedOverlayWidget;
function applyStyle(domNode, style) {
  return autorun((reader) => {
    for (let [key, val] of Object.entries(style)) {
      if (val && typeof val === "object" && "read" in val) {
        val = val.read(reader);
      }
      if (typeof val === "number") {
        val = `${val}px`;
      }
      key = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      domNode.style[key] = val;
    }
  });
}
function applyViewZones(editor, viewZones, setIsUpdating, zoneIds) {
  const store = new DisposableStore();
  const lastViewZoneIds = [];
  store.add(autorunWithStore((reader, store2) => {
    const curViewZones = viewZones.read(reader);
    const viewZonIdsPerViewZone = /* @__PURE__ */ new Map();
    const viewZoneIdPerOnChangeObservable = /* @__PURE__ */ new Map();
    if (setIsUpdating) {
      setIsUpdating(true);
    }
    editor.changeViewZones((a) => {
      for (const id of lastViewZoneIds) {
        a.removeZone(id);
        zoneIds?.delete(id);
      }
      lastViewZoneIds.length = 0;
      for (const z of curViewZones) {
        const id = a.addZone(z);
        if (z.setZoneId) {
          z.setZoneId(id);
        }
        lastViewZoneIds.push(id);
        zoneIds?.add(id);
        viewZonIdsPerViewZone.set(z, id);
      }
    });
    if (setIsUpdating) {
      setIsUpdating(false);
    }
    store2.add(autorunHandleChanges({
      changeTracker: {
        createChangeSummary() {
          return { zoneIds: [] };
        },
        handleChange(context, changeSummary) {
          const id = viewZoneIdPerOnChangeObservable.get(context.changedObservable);
          if (id !== void 0) {
            changeSummary.zoneIds.push(id);
          }
          return true;
        }
      }
    }, (reader2, changeSummary) => {
      for (const vz of curViewZones) {
        if (vz.onChange) {
          viewZoneIdPerOnChangeObservable.set(vz.onChange, viewZonIdsPerViewZone.get(vz));
          vz.onChange.read(reader2);
        }
      }
      if (setIsUpdating) {
        setIsUpdating(true);
      }
      editor.changeViewZones((a) => {
        for (const id of changeSummary.zoneIds) {
          a.layoutZone(id);
        }
      });
      if (setIsUpdating) {
        setIsUpdating(false);
      }
    }));
  }));
  store.add({
    dispose() {
      if (setIsUpdating) {
        setIsUpdating(true);
      }
      editor.changeViewZones((a) => {
        for (const id of lastViewZoneIds) {
          a.removeZone(id);
        }
      });
      zoneIds?.clear();
      if (setIsUpdating) {
        setIsUpdating(false);
      }
    }
  });
  return store;
}
class DisposableCancellationTokenSource extends CancellationTokenSource {
  dispose() {
    super.dispose(true);
  }
}
function translatePosition(posInOriginal, mappings) {
  const mapping = findLast(mappings, (m) => m.original.startLineNumber <= posInOriginal.lineNumber);
  if (!mapping) {
    return Range.fromPositions(posInOriginal);
  }
  if (mapping.original.endLineNumberExclusive <= posInOriginal.lineNumber) {
    const newLineNumber = posInOriginal.lineNumber - mapping.original.endLineNumberExclusive + mapping.modified.endLineNumberExclusive;
    return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
  }
  if (!mapping.innerChanges) {
    return Range.fromPositions(new Position(mapping.modified.startLineNumber, 1));
  }
  const innerMapping = findLast(mapping.innerChanges, (m) => m.originalRange.getStartPosition().isBeforeOrEqual(posInOriginal));
  if (!innerMapping) {
    const newLineNumber = posInOriginal.lineNumber - mapping.original.startLineNumber + mapping.modified.startLineNumber;
    return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
  }
  if (innerMapping.originalRange.containsPosition(posInOriginal)) {
    return innerMapping.modifiedRange;
  } else {
    const l = lengthBetweenPositions(innerMapping.originalRange.getEndPosition(), posInOriginal);
    return Range.fromPositions(l.addToPosition(innerMapping.modifiedRange.getEndPosition()));
  }
}
function lengthBetweenPositions(position1, position2) {
  if (position1.lineNumber === position2.lineNumber) {
    return new TextLength(0, position2.column - position1.column);
  } else {
    return new TextLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
  }
}
function filterWithPrevious(arr, filter) {
  let prev;
  return arr.filter((cur) => {
    const result = filter(cur, prev);
    prev = cur;
    return result;
  });
}
class RefCounted {
  static create(value, debugOwner = void 0) {
    return new BaseRefCounted(value, value, debugOwner);
  }
  static createWithDisposable(value, disposable, debugOwner = void 0) {
    const store = new DisposableStore();
    store.add(disposable);
    store.add(value);
    return new BaseRefCounted(value, store, debugOwner);
  }
  static createOfNonDisposable(value, disposable, debugOwner = void 0) {
    return new BaseRefCounted(value, disposable, debugOwner);
  }
}
class BaseRefCounted extends RefCounted {
  constructor(object, _disposable, _debugOwner) {
    super();
    this.object = object;
    this._disposable = _disposable;
    this._debugOwner = _debugOwner;
    this._refCount = 1;
    this._isDisposed = false;
    this._owners = [];
    if (_debugOwner) {
      this._addOwner(_debugOwner);
    }
  }
  _addOwner(debugOwner) {
    if (debugOwner) {
      this._owners.push(debugOwner);
    }
  }
  createNewRef(debugOwner) {
    this._refCount++;
    if (debugOwner) {
      this._addOwner(debugOwner);
    }
    return new ClonedRefCounted(this, debugOwner);
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._decreaseRefCount(this._debugOwner);
  }
  _decreaseRefCount(debugOwner) {
    this._refCount--;
    if (this._refCount === 0) {
      this._disposable.dispose();
    }
    if (debugOwner) {
      const idx = this._owners.indexOf(debugOwner);
      if (idx !== -1) {
        this._owners.splice(idx, 1);
      }
    }
  }
}
class ClonedRefCounted extends RefCounted {
  constructor(_base, _debugOwner) {
    super();
    this._base = _base;
    this._debugOwner = _debugOwner;
    this._isDisposed = false;
  }
  get object() {
    return this._base.object;
  }
  createNewRef(debugOwner) {
    return this._base.createNewRef(debugOwner);
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._base._decreaseRefCount(this._debugOwner);
  }
}
export {
  DisposableCancellationTokenSource,
  ManagedOverlayWidget,
  ObservableElementSizeObserver,
  PlaceholderViewZone,
  RefCounted,
  ViewZoneOverlayWidget,
  animatedObservable,
  appendRemoveOnDispose,
  applyObservableDecorations,
  applyStyle,
  applyViewZones,
  deepMerge,
  filterWithPrevious,
  joinCombine,
  prependRemoveOnDispose,
  translatePosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL3V0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZmluZExhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBhdXRvcnVuLCBhdXRvcnVuSGFuZGxlQ2hhbmdlcywgYXV0b3J1bk9wdHMsIGF1dG9ydW5XaXRoU3RvcmUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEVsZW1lbnRTaXplT2JzZXJ2ZXIgfSBmcm9tICcuLi8uLi9jb25maWcvZWxlbWVudFNpemVPYnNlcnZlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElWaWV3Wm9uZSB9IGZyb20gJy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dExlbmd0aCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvdGV4dExlbmd0aC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBqb2luQ29tYmluZTxUPihhcnIxOiByZWFkb25seSBUW10sIGFycjI6IHJlYWRvbmx5IFRbXSwga2V5U2VsZWN0b3I6ICh2YWw6IFQpID0+IG51bWJlciwgY29tYmluZTogKHYxOiBULCB2MjogVCkgPT4gVCk6IHJlYWRvbmx5IFRbXSB7XG5cdGlmIChhcnIxLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBhcnIyO1xuXHR9XG5cdGlmIChhcnIyLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBhcnIxO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBUW10gPSBbXTtcblx0bGV0IGkgPSAwO1xuXHRsZXQgaiA9IDA7XG5cdHdoaWxlIChpIDwgYXJyMS5sZW5ndGggJiYgaiA8IGFycjIubGVuZ3RoKSB7XG5cdFx0Y29uc3QgdmFsMSA9IGFycjFbaV07XG5cdFx0Y29uc3QgdmFsMiA9IGFycjJbal07XG5cdFx0Y29uc3Qga2V5MSA9IGtleVNlbGVjdG9yKHZhbDEpO1xuXHRcdGNvbnN0IGtleTIgPSBrZXlTZWxlY3Rvcih2YWwyKTtcblxuXHRcdGlmIChrZXkxIDwga2V5Mikge1xuXHRcdFx0cmVzdWx0LnB1c2godmFsMSk7XG5cdFx0XHRpKys7XG5cdFx0fSBlbHNlIGlmIChrZXkxID4ga2V5Mikge1xuXHRcdFx0cmVzdWx0LnB1c2godmFsMik7XG5cdFx0XHRqKys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKGNvbWJpbmUodmFsMSwgdmFsMikpO1xuXHRcdFx0aSsrO1xuXHRcdFx0aisrO1xuXHRcdH1cblx0fVxuXHR3aGlsZSAoaSA8IGFycjEubGVuZ3RoKSB7XG5cdFx0cmVzdWx0LnB1c2goYXJyMVtpXSk7XG5cdFx0aSsrO1xuXHR9XG5cdHdoaWxlIChqIDwgYXJyMi5sZW5ndGgpIHtcblx0XHRyZXN1bHQucHVzaChhcnIyW2pdKTtcblx0XHRqKys7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gVE9ETyBtYWtlIHV0aWxpdHlcbmV4cG9ydCBmdW5jdGlvbiBhcHBseU9ic2VydmFibGVEZWNvcmF0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCBkZWNvcmF0aW9uczogSU9ic2VydmFibGU8SU1vZGVsRGVsdGFEZWNvcmF0aW9uW10+KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdGQuYWRkKGF1dG9ydW5PcHRzKHsgZGVidWdOYW1lOiAoKSA9PiBgQXBwbHkgZGVjb3JhdGlvbnMgZnJvbSAke2RlY29yYXRpb25zLmRlYnVnTmFtZX1gIH0sIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgZCA9IGRlY29yYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRkZWNvcmF0aW9uc0NvbGxlY3Rpb24uc2V0KGQpO1xuXHR9KSk7XG5cdGQuYWRkKHtcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRkZWNvcmF0aW9uc0NvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZFJlbW92ZU9uRGlzcG9zZShwYXJlbnQ6IEhUTUxFbGVtZW50LCBjaGlsZDogSFRNTEVsZW1lbnQpIHtcblx0cGFyZW50LmFwcGVuZENoaWxkKGNoaWxkKTtcblx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0Y2hpbGQucmVtb3ZlKCk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJlcGVuZFJlbW92ZU9uRGlzcG9zZShwYXJlbnQ6IEhUTUxFbGVtZW50LCBjaGlsZDogSFRNTEVsZW1lbnQpIHtcblx0cGFyZW50LnByZXBlbmQoY2hpbGQpO1xuXHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRjaGlsZC5yZW1vdmUoKTtcblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmxlRWxlbWVudFNpemVPYnNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRTaXplT2JzZXJ2ZXI6IEVsZW1lbnRTaXplT2JzZXJ2ZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkdGg6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHVibGljIGdldCB3aWR0aCgpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMuX3dpZHRoOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGVpZ2h0OiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj47XG5cdHB1YmxpYyBnZXQgaGVpZ2h0KCk6IElPYnNlcnZhYmxlPG51bWJlcj4geyByZXR1cm4gdGhpcy5faGVpZ2h0OyB9XG5cblx0cHJpdmF0ZSBfYXV0b21hdGljTGF5b3V0OiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgYXV0b21hdGljTGF5b3V0KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYXV0b21hdGljTGF5b3V0OyB9XG5cblx0Y29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBkaW1lbnNpb246IElEaW1lbnNpb24gfCB1bmRlZmluZWQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVsZW1lbnRTaXplT2JzZXJ2ZXIoZWxlbWVudCwgZGltZW5zaW9uKSk7XG5cdFx0dGhpcy5fd2lkdGggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLmdldFdpZHRoKCkpO1xuXHRcdHRoaXMuX2hlaWdodCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIuZ2V0SGVpZ2h0KCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLm9uRGlkQ2hhbmdlKGUgPT4gdHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBTZXQgd2lkdGgvaGVpZ2h0IGZyb20gZWxlbWVudFNpemVPYnNlcnZlciAqL1xuXHRcdFx0dGhpcy5fd2lkdGguc2V0KHRoaXMuZWxlbWVudFNpemVPYnNlcnZlci5nZXRXaWR0aCgpLCB0eCk7XG5cdFx0XHR0aGlzLl9oZWlnaHQuc2V0KHRoaXMuZWxlbWVudFNpemVPYnNlcnZlci5nZXRIZWlnaHQoKSwgdHgpO1xuXHRcdH0pKSk7XG5cdH1cblxuXHRwdWJsaWMgb2JzZXJ2ZShkaW1lbnNpb24/OiBJRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLm9ic2VydmUoZGltZW5zaW9uKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRvbWF0aWNMYXlvdXQoYXV0b21hdGljTGF5b3V0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fYXV0b21hdGljTGF5b3V0ID0gYXV0b21hdGljTGF5b3V0O1xuXHRcdGlmIChhdXRvbWF0aWNMYXlvdXQpIHtcblx0XHRcdHRoaXMuZWxlbWVudFNpemVPYnNlcnZlci5zdGFydE9ic2VydmluZygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIuc3RvcE9ic2VydmluZygpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYW5pbWF0ZWRPYnNlcnZhYmxlKHRhcmdldFdpbmRvdzogV2luZG93LCBiYXNlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8bnVtYmVyLCBib29sZWFuPiwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IElPYnNlcnZhYmxlPG51bWJlcj4ge1xuXHRsZXQgdGFyZ2V0VmFsID0gYmFzZS5nZXQoKTtcblx0bGV0IHN0YXJ0VmFsID0gdGFyZ2V0VmFsO1xuXHRsZXQgY3VyVmFsID0gdGFyZ2V0VmFsO1xuXHRjb25zdCByZXN1bHQgPSBvYnNlcnZhYmxlVmFsdWUoJ2FuaW1hdGVkVmFsdWUnLCB0YXJnZXRWYWwpO1xuXG5cdGxldCBhbmltYXRpb25TdGFydE1zOiBudW1iZXIgPSAtMTtcblx0Y29uc3QgZHVyYXRpb25NcyA9IDMwMDtcblx0bGV0IGFuaW1hdGlvbkZyYW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0c3RvcmUuYWRkKGF1dG9ydW5IYW5kbGVDaGFuZ2VzKHtcblx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRjcmVhdGVDaGFuZ2VTdW1tYXJ5OiAoKSA9PiAoeyBhbmltYXRlOiBmYWxzZSB9KSxcblx0XHRcdGhhbmRsZUNoYW5nZTogKGN0eCwgcykgPT4ge1xuXHRcdFx0XHRpZiAoY3R4LmRpZENoYW5nZShiYXNlKSkge1xuXHRcdFx0XHRcdHMuYW5pbWF0ZSA9IHMuYW5pbWF0ZSB8fCBjdHguY2hhbmdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgKHJlYWRlciwgcykgPT4ge1xuXHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHZhbHVlICovXG5cdFx0aWYgKGFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhcmdldFdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShhbmltYXRpb25GcmFtZSk7XG5cdFx0XHRhbmltYXRpb25GcmFtZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzdGFydFZhbCA9IGN1clZhbDtcblx0XHR0YXJnZXRWYWwgPSBiYXNlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoc3RhcnRWYWwgPT09IHRhcmdldFZhbCkge1xuXHRcdFx0Ly8gTm8gY2hhbmdlLCBubyBhbmltYXRpb25cblx0XHRcdGFuaW1hdGlvblN0YXJ0TXMgPSBEYXRlLm5vdygpIC0gZHVyYXRpb25Ncztcblx0XHR9IGVsc2Uge1xuXHRcdFx0YW5pbWF0aW9uU3RhcnRNcyA9IERhdGUubm93KCkgLSAocy5hbmltYXRlID8gMCA6IGR1cmF0aW9uTXMpO1xuXHRcdH1cblxuXHRcdHVwZGF0ZSgpO1xuXHR9KSk7XG5cblx0ZnVuY3Rpb24gdXBkYXRlKCkge1xuXHRcdGNvbnN0IHBhc3NlZE1zID0gRGF0ZS5ub3coKSAtIGFuaW1hdGlvblN0YXJ0TXM7XG5cdFx0Y3VyVmFsID0gTWF0aC5mbG9vcihlYXNlT3V0RXhwbyhwYXNzZWRNcywgc3RhcnRWYWwsIHRhcmdldFZhbCAtIHN0YXJ0VmFsLCBkdXJhdGlvbk1zKSk7XG5cblx0XHRpZiAocGFzc2VkTXMgPCBkdXJhdGlvbk1zKSB7XG5cdFx0XHRhbmltYXRpb25GcmFtZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUodXBkYXRlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VyVmFsID0gdGFyZ2V0VmFsO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5zZXQoY3VyVmFsLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZWFzZU91dEV4cG8odDogbnVtYmVyLCBiOiBudW1iZXIsIGM6IG51bWJlciwgZDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIHQgPT09IGQgPyBiICsgYyA6IGMgKiAoLU1hdGgucG93KDIsIC0xMCAqIHQgLyBkKSArIDEpICsgYjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZXBNZXJnZTxUIGV4dGVuZHMge30+KHNvdXJjZTE6IFQsIHNvdXJjZTI6IFBhcnRpYWw8VD4pOiBUIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNvbnN0IHJlc3VsdCA9IHt9IGFzIGFueSBhcyBUO1xuXHRmb3IgKGNvbnN0IGtleSBpbiBzb3VyY2UxKSB7XG5cdFx0cmVzdWx0W2tleV0gPSBzb3VyY2UxW2tleV07XG5cdH1cblx0Zm9yIChjb25zdCBrZXkgaW4gc291cmNlMikge1xuXHRcdGNvbnN0IHNvdXJjZTJWYWx1ZSA9IHNvdXJjZTJba2V5XTtcblx0XHRpZiAodHlwZW9mIHJlc3VsdFtrZXldID09PSAnb2JqZWN0JyAmJiBzb3VyY2UyVmFsdWUgJiYgdHlwZW9mIHNvdXJjZTJWYWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRyZXN1bHRba2V5XSA9IGRlZXBNZXJnZTxhbnk+KHJlc3VsdFtrZXldLCBzb3VyY2UyVmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdHJlc3VsdFtrZXldID0gc291cmNlMlZhbHVlIGFzIGFueTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFZpZXdab25lT3ZlcmxheVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHZpZXdab25lOiBQbGFjZWhvbGRlclZpZXdab25lLFxuXHRcdGh0bWxFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBNYW5hZ2VkT3ZlcmxheVdpZGdldChlZGl0b3IsIGh0bWxFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlTdHlsZShodG1sRWxlbWVudCwge1xuXHRcdFx0aGVpZ2h0OiB2aWV3Wm9uZS5hY3R1YWxIZWlnaHQsXG5cdFx0XHR0b3A6IHZpZXdab25lLmFjdHVhbFRvcCxcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT2JzZXJ2YWJsZVZpZXdab25lIGV4dGVuZHMgSVZpZXdab25lIHtcblx0Ly8gQ2F1c2VzIHRoZSB2aWV3IHpvbmUgdG8gcmVsYXlvdXQuXG5cdG9uQ2hhbmdlPzogSU9ic2VydmFibGU8dW5rbm93bj47XG5cblx0Ly8gVGVsbHMgYSB2aWV3IHpvbmUgaXRzIGlkLlxuXHRzZXRab25lSWQ/KHpvbmVJZDogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFBsYWNlaG9sZGVyVmlld1pvbmUgaW1wbGVtZW50cyBJT2JzZXJ2YWJsZVZpZXdab25lIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0dWFsVG9wO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWxIZWlnaHQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGFjdHVhbFRvcDogSU9ic2VydmFibGU8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0cHVibGljIHJlYWRvbmx5IGFjdHVhbEhlaWdodDogSU9ic2VydmFibGU8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2hvd0luSGlkZGVuQXJlYXM7XG5cblx0cHVibGljIGdldCBhZnRlckxpbmVOdW1iZXIoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2FmdGVyTGluZU51bWJlci5nZXQoKTsgfVxuXG5cdHB1YmxpYyByZWFkb25seSBvbkNoYW5nZT86IElPYnNlcnZhYmxlPHVua25vd24+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FmdGVyTGluZU51bWJlcjogSU9ic2VydmFibGU8bnVtYmVyPixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0SW5QeDogbnVtYmVyLFxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9hY3R1YWxUb3AgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2FjdHVhbEhlaWdodCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXIgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5hY3R1YWxUb3AgPSB0aGlzLl9hY3R1YWxUb3A7XG5cdFx0dGhpcy5hY3R1YWxIZWlnaHQgPSB0aGlzLl9hY3R1YWxIZWlnaHQ7XG5cdFx0dGhpcy5zaG93SW5IaWRkZW5BcmVhcyA9IHRydWU7XG5cdFx0dGhpcy5vbkNoYW5nZSA9IHRoaXMuX2FmdGVyTGluZU51bWJlcjtcblx0XHR0aGlzLm9uRG9tTm9kZVRvcCA9ICh0b3A6IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fYWN0dWFsVG9wLnNldCh0b3AsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHR0aGlzLm9uQ29tcHV0ZWRIZWlnaHQgPSAoaGVpZ2h0OiBudW1iZXIpID0+IHtcblx0XHRcdHRoaXMuX2FjdHVhbEhlaWdodC5zZXQoaGVpZ2h0LCB1bmRlZmluZWQpO1xuXHRcdH07XG5cdH1cblxuXHRvbkRvbU5vZGVUb3A7XG5cblx0b25Db21wdXRlZEhlaWdodDtcbn1cblxuXG5leHBvcnQgY2xhc3MgTWFuYWdlZE92ZXJsYXlXaWRnZXQgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIF9jb3VudGVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmxheVdpZGdldElkID0gYG1hbmFnZWRPdmVybGF5V2lkZ2V0LSR7TWFuYWdlZE92ZXJsYXlXaWRnZXQuX2NvdW50ZXIrK31gO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJsYXlXaWRnZXQ6IElPdmVybGF5V2lkZ2V0ID0ge1xuXHRcdGdldElkOiAoKSA9PiB0aGlzLl9vdmVybGF5V2lkZ2V0SWQsXG5cdFx0Z2V0RG9tTm9kZTogKCkgPT4gdGhpcy5fZG9tRWxlbWVudCxcblx0XHRnZXRQb3NpdGlvbjogKCkgPT4gbnVsbFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdCkge1xuXHRcdHRoaXMuX2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMuX292ZXJsYXlXaWRnZXQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzLl9vdmVybGF5V2lkZ2V0KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENTU1N0eWxlIHtcblx0aGVpZ2h0OiBudW1iZXIgfCBzdHJpbmc7XG5cdHdpZHRoOiBudW1iZXIgfCBzdHJpbmc7XG5cdHRvcDogbnVtYmVyIHwgc3RyaW5nO1xuXHR2aXNpYmlsaXR5OiAndmlzaWJsZScgfCAnaGlkZGVuJyB8ICdjb2xsYXBzZSc7XG5cdGRpc3BsYXk6ICdibG9jaycgfCAnaW5saW5lJyB8ICdpbmxpbmUtYmxvY2snIHwgJ2ZsZXgnIHwgJ25vbmUnO1xuXHRwYWRkaW5nTGVmdDogbnVtYmVyIHwgc3RyaW5nO1xuXHRwYWRkaW5nUmlnaHQ6IG51bWJlciB8IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5U3R5bGUoZG9tTm9kZTogSFRNTEVsZW1lbnQsIHN0eWxlOiBQYXJ0aWFsPHsgW1RLZXkgaW4ga2V5b2YgQ1NTU3R5bGVdOiBDU1NTdHlsZVtUS2V5XSB8IElPYnNlcnZhYmxlPENTU1N0eWxlW1RLZXldIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCB9Pikge1xuXHRyZXR1cm4gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdC8qKiBAZGVzY3JpcHRpb24gYXBwbHlTdHlsZSAqL1xuXHRcdGZvciAobGV0IFtrZXksIHZhbF0gb2YgT2JqZWN0LmVudHJpZXMoc3R5bGUpKSB7XG5cdFx0XHRpZiAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmICdyZWFkJyBpbiB2YWwpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdHZhbCA9IHZhbC5yZWFkKHJlYWRlcikgYXMgYW55O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiB2YWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHZhbCA9IGAke3ZhbH1weGA7XG5cdFx0XHR9XG5cdFx0XHRrZXkgPSBrZXkucmVwbGFjZSgvW0EtWl0vZywgbSA9PiAnLScgKyBtLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRkb21Ob2RlLnN0eWxlW2tleSBhcyBhbnldID0gdmFsIGFzIGFueTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlWaWV3Wm9uZXMoZWRpdG9yOiBJQ29kZUVkaXRvciwgdmlld1pvbmVzOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZVZpZXdab25lW10+LCBzZXRJc1VwZGF0aW5nPzogKGlzVXBkYXRpbmdWaWV3Wm9uZXM6IGJvb2xlYW4pID0+IHZvaWQsIHpvbmVJZHM/OiBTZXQ8c3RyaW5nPik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGxhc3RWaWV3Wm9uZUlkczogc3RyaW5nW10gPSBbXTtcblxuXHRzdG9yZS5hZGQoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdC8qKiBAZGVzY3JpcHRpb24gYXBwbHlWaWV3Wm9uZXMgKi9cblx0XHRjb25zdCBjdXJWaWV3Wm9uZXMgPSB2aWV3Wm9uZXMucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3Qgdmlld1pvbklkc1BlclZpZXdab25lID0gbmV3IE1hcDxJT2JzZXJ2YWJsZVZpZXdab25lLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgdmlld1pvbmVJZFBlck9uQ2hhbmdlT2JzZXJ2YWJsZSA9IG5ldyBNYXA8SU9ic2VydmFibGU8dW5rbm93bj4sIHN0cmluZz4oKTtcblxuXHRcdC8vIEFkZC9yZW1vdmUgdmlldyB6b25lc1xuXHRcdGlmIChzZXRJc1VwZGF0aW5nKSB7IHNldElzVXBkYXRpbmcodHJ1ZSk7IH1cblx0XHRlZGl0b3IuY2hhbmdlVmlld1pvbmVzKGEgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBsYXN0Vmlld1pvbmVJZHMpIHsgYS5yZW1vdmVab25lKGlkKTsgem9uZUlkcz8uZGVsZXRlKGlkKTsgfVxuXHRcdFx0bGFzdFZpZXdab25lSWRzLmxlbmd0aCA9IDA7XG5cblx0XHRcdGZvciAoY29uc3QgeiBvZiBjdXJWaWV3Wm9uZXMpIHtcblx0XHRcdFx0Y29uc3QgaWQgPSBhLmFkZFpvbmUoeik7XG5cdFx0XHRcdGlmICh6LnNldFpvbmVJZCkge1xuXHRcdFx0XHRcdHouc2V0Wm9uZUlkKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0Vmlld1pvbmVJZHMucHVzaChpZCk7XG5cdFx0XHRcdHpvbmVJZHM/LmFkZChpZCk7XG5cdFx0XHRcdHZpZXdab25JZHNQZXJWaWV3Wm9uZS5zZXQoeiwgaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChzZXRJc1VwZGF0aW5nKSB7IHNldElzVXBkYXRpbmcoZmFsc2UpOyB9XG5cblx0XHQvLyBMYXlvdXQgem9uZSBvbiBjaGFuZ2Vcblx0XHRzdG9yZS5hZGQoYXV0b3J1bkhhbmRsZUNoYW5nZXMoe1xuXHRcdFx0Y2hhbmdlVHJhY2tlcjoge1xuXHRcdFx0XHRjcmVhdGVDaGFuZ2VTdW1tYXJ5KCkge1xuXHRcdFx0XHRcdHJldHVybiB7IHpvbmVJZHM6IFtdIGFzIHN0cmluZ1tdIH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhhbmRsZUNoYW5nZShjb250ZXh0LCBjaGFuZ2VTdW1tYXJ5KSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSB2aWV3Wm9uZUlkUGVyT25DaGFuZ2VPYnNlcnZhYmxlLmdldChjb250ZXh0LmNoYW5nZWRPYnNlcnZhYmxlKTtcblx0XHRcdFx0XHRpZiAoaWQgIT09IHVuZGVmaW5lZCkgeyBjaGFuZ2VTdW1tYXJ5LnpvbmVJZHMucHVzaChpZCk7IH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LCAocmVhZGVyLCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGxheW91dFpvbmUgb24gY2hhbmdlICovXG5cdFx0XHRmb3IgKGNvbnN0IHZ6IG9mIGN1clZpZXdab25lcykge1xuXHRcdFx0XHRpZiAodnoub25DaGFuZ2UpIHtcblx0XHRcdFx0XHR2aWV3Wm9uZUlkUGVyT25DaGFuZ2VPYnNlcnZhYmxlLnNldCh2ei5vbkNoYW5nZSwgdmlld1pvbklkc1BlclZpZXdab25lLmdldCh2eikhKTtcblx0XHRcdFx0XHR2ei5vbkNoYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZXRJc1VwZGF0aW5nKSB7IHNldElzVXBkYXRpbmcodHJ1ZSk7IH1cblx0XHRcdGVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYSA9PiB7IGZvciAoY29uc3QgaWQgb2YgY2hhbmdlU3VtbWFyeS56b25lSWRzKSB7IGEubGF5b3V0Wm9uZShpZCk7IH0gfSk7XG5cdFx0XHRpZiAoc2V0SXNVcGRhdGluZykgeyBzZXRJc1VwZGF0aW5nKGZhbHNlKTsgfVxuXHRcdH0pKTtcblx0fSkpO1xuXG5cdHN0b3JlLmFkZCh7XG5cdFx0ZGlzcG9zZSgpIHtcblx0XHRcdGlmIChzZXRJc1VwZGF0aW5nKSB7IHNldElzVXBkYXRpbmcodHJ1ZSk7IH1cblx0XHRcdGVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYSA9PiB7IGZvciAoY29uc3QgaWQgb2YgbGFzdFZpZXdab25lSWRzKSB7IGEucmVtb3ZlWm9uZShpZCk7IH0gfSk7XG5cdFx0XHR6b25lSWRzPy5jbGVhcigpO1xuXHRcdFx0aWYgKHNldElzVXBkYXRpbmcpIHsgc2V0SXNVcGRhdGluZyhmYWxzZSk7IH1cblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuZXhwb3J0IGNsYXNzIERpc3Bvc2FibGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSBleHRlbmRzIENhbmNlbGxhdGlvblRva2VuU291cmNlIHtcblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSh0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNsYXRlUG9zaXRpb24ocG9zSW5PcmlnaW5hbDogUG9zaXRpb24sIG1hcHBpbmdzOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSk6IFJhbmdlIHtcblx0Y29uc3QgbWFwcGluZyA9IGZpbmRMYXN0KG1hcHBpbmdzLCBtID0+IG0ub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyIDw9IHBvc0luT3JpZ2luYWwubGluZU51bWJlcik7XG5cdGlmICghbWFwcGluZykge1xuXHRcdC8vIE5vIGNoYW5nZXMgYmVmb3JlIHRoZSBwb3NpdGlvblxuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc0luT3JpZ2luYWwpO1xuXHR9XG5cblx0aWYgKG1hcHBpbmcub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA8PSBwb3NJbk9yaWdpbmFsLmxpbmVOdW1iZXIpIHtcblx0XHRjb25zdCBuZXdMaW5lTnVtYmVyID0gcG9zSW5PcmlnaW5hbC5saW5lTnVtYmVyIC0gbWFwcGluZy5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlICsgbWFwcGluZy5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihuZXdMaW5lTnVtYmVyLCBwb3NJbk9yaWdpbmFsLmNvbHVtbikpO1xuXHR9XG5cblx0aWYgKCFtYXBwaW5nLmlubmVyQ2hhbmdlcykge1xuXHRcdC8vIE9ubHkgZm9yIGxlZ2FjeSBhbGdvcml0aG1cblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24obWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIDEpKTtcblx0fVxuXG5cdGNvbnN0IGlubmVyTWFwcGluZyA9IGZpbmRMYXN0KG1hcHBpbmcuaW5uZXJDaGFuZ2VzLCBtID0+IG0ub3JpZ2luYWxSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuaXNCZWZvcmVPckVxdWFsKHBvc0luT3JpZ2luYWwpKTtcblx0aWYgKCFpbm5lck1hcHBpbmcpIHtcblx0XHRjb25zdCBuZXdMaW5lTnVtYmVyID0gcG9zSW5PcmlnaW5hbC5saW5lTnVtYmVyIC0gbWFwcGluZy5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgKyBtYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhuZXcgUG9zaXRpb24obmV3TGluZU51bWJlciwgcG9zSW5PcmlnaW5hbC5jb2x1bW4pKTtcblx0fVxuXG5cdGlmIChpbm5lck1hcHBpbmcub3JpZ2luYWxSYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc0luT3JpZ2luYWwpKSB7XG5cdFx0cmV0dXJuIGlubmVyTWFwcGluZy5tb2RpZmllZFJhbmdlO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGwgPSBsZW5ndGhCZXR3ZWVuUG9zaXRpb25zKGlubmVyTWFwcGluZy5vcmlnaW5hbFJhbmdlLmdldEVuZFBvc2l0aW9uKCksIHBvc0luT3JpZ2luYWwpO1xuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKGwuYWRkVG9Qb3NpdGlvbihpbm5lck1hcHBpbmcubW9kaWZpZWRSYW5nZS5nZXRFbmRQb3NpdGlvbigpKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbGVuZ3RoQmV0d2VlblBvc2l0aW9ucyhwb3NpdGlvbjE6IFBvc2l0aW9uLCBwb3NpdGlvbjI6IFBvc2l0aW9uKTogVGV4dExlbmd0aCB7XG5cdGlmIChwb3NpdGlvbjEubGluZU51bWJlciA9PT0gcG9zaXRpb24yLmxpbmVOdW1iZXIpIHtcblx0XHRyZXR1cm4gbmV3IFRleHRMZW5ndGgoMCwgcG9zaXRpb24yLmNvbHVtbiAtIHBvc2l0aW9uMS5jb2x1bW4pO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXcgVGV4dExlbmd0aChwb3NpdGlvbjIubGluZU51bWJlciAtIHBvc2l0aW9uMS5saW5lTnVtYmVyLCBwb3NpdGlvbjIuY29sdW1uIC0gMSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlcldpdGhQcmV2aW91czxUPihhcnI6IFRbXSwgZmlsdGVyOiAoY3VyOiBULCBwcmV2OiBUIHwgdW5kZWZpbmVkKSA9PiBib29sZWFuKTogVFtdIHtcblx0bGV0IHByZXY6IFQgfCB1bmRlZmluZWQ7XG5cdHJldHVybiBhcnIuZmlsdGVyKGN1ciA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyKGN1ciwgcHJldik7XG5cdFx0cHJldiA9IGN1cjtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVmQ291bnRlZCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0Y3JlYXRlTmV3UmVmKCk6IHRoaXM7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBSZWZDb3VudGVkPFQ+IGltcGxlbWVudHMgSURpc3Bvc2FibGUsIElSZWZlcmVuY2U8VD4ge1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KHZhbHVlOiBULCBkZWJ1Z093bmVyOiBvYmplY3QgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBSZWZDb3VudGVkPFQ+IHtcblx0XHRyZXR1cm4gbmV3IEJhc2VSZWZDb3VudGVkKHZhbHVlLCB2YWx1ZSwgZGVidWdPd25lcik7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVdpdGhEaXNwb3NhYmxlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4odmFsdWU6IFQsIGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlLCBkZWJ1Z093bmVyOiBvYmplY3QgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBSZWZDb3VudGVkPFQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0c3RvcmUuYWRkKHZhbHVlKTtcblx0XHRyZXR1cm4gbmV3IEJhc2VSZWZDb3VudGVkKHZhbHVlLCBzdG9yZSwgZGVidWdPd25lcik7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZU9mTm9uRGlzcG9zYWJsZTxUPih2YWx1ZTogVCwgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUsIGRlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFJlZkNvdW50ZWQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQmFzZVJlZkNvdW50ZWQodmFsdWUsIGRpc3Bvc2FibGUsIGRlYnVnT3duZXIpO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IGNyZWF0ZU5ld1JlZihkZWJ1Z093bmVyPzogb2JqZWN0IHwgdW5kZWZpbmVkKTogUmVmQ291bnRlZDxUPjtcblxuXHRwdWJsaWMgYWJzdHJhY3QgZGlzcG9zZSgpOiB2b2lkO1xuXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXQgb2JqZWN0KCk6IFQ7XG59XG5cbmNsYXNzIEJhc2VSZWZDb3VudGVkPFQ+IGV4dGVuZHMgUmVmQ291bnRlZDxUPiB7XG5cdHByaXZhdGUgX3JlZkNvdW50ID0gMTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vd25lcnM6IG9iamVjdFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIG92ZXJyaWRlIHJlYWRvbmx5IG9iamVjdDogVCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z093bmVyOiBvYmplY3QgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoX2RlYnVnT3duZXIpIHtcblx0XHRcdHRoaXMuX2FkZE93bmVyKF9kZWJ1Z093bmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRPd25lcihkZWJ1Z093bmVyOiBvYmplY3QgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoZGVidWdPd25lcikge1xuXHRcdFx0dGhpcy5fb3duZXJzLnB1c2goZGVidWdPd25lcik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNyZWF0ZU5ld1JlZihkZWJ1Z093bmVyPzogb2JqZWN0IHwgdW5kZWZpbmVkKTogUmVmQ291bnRlZDxUPiB7XG5cdFx0dGhpcy5fcmVmQ291bnQrKztcblx0XHRpZiAoZGVidWdPd25lcikge1xuXHRcdFx0dGhpcy5fYWRkT3duZXIoZGVidWdPd25lcik7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQ2xvbmVkUmVmQ291bnRlZCh0aGlzLCBkZWJ1Z093bmVyKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2RlY3JlYXNlUmVmQ291bnQodGhpcy5fZGVidWdPd25lcik7XG5cdH1cblxuXHRwdWJsaWMgX2RlY3JlYXNlUmVmQ291bnQoZGVidWdPd25lcj86IG9iamVjdCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZkNvdW50LS07XG5cdFx0aWYgKHRoaXMuX3JlZkNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoZGVidWdPd25lcikge1xuXHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fb3duZXJzLmluZGV4T2YoZGVidWdPd25lcik7XG5cdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9vd25lcnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENsb25lZFJlZkNvdW50ZWQ8VD4gZXh0ZW5kcyBSZWZDb3VudGVkPFQ+IHtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlOiBCYXNlUmVmQ291bnRlZDxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z093bmVyOiBvYmplY3QgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9iamVjdCgpOiBUIHsgcmV0dXJuIHRoaXMuX2Jhc2Uub2JqZWN0OyB9XG5cblx0cHVibGljIGNyZWF0ZU5ld1JlZihkZWJ1Z093bmVyPzogb2JqZWN0IHwgdW5kZWZpbmVkKTogUmVmQ291bnRlZDxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Jhc2UuY3JlYXRlTmV3UmVmKGRlYnVnT3duZXIpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fYmFzZS5fZGVjcmVhc2VSZWZDb3VudCh0aGlzLl9kZWJ1Z093bmVyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxZQUFZLGlCQUEwQyxvQkFBb0I7QUFDbkYsU0FBa0UsU0FBUyxzQkFBc0IsYUFBYSxrQkFBa0IsaUJBQWlCLG1CQUFtQjtBQUNwSyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFHdEIsU0FBUyxrQkFBa0I7QUFFcEIsU0FBUyxZQUFlLE1BQW9CLE1BQW9CLGFBQWlDLFNBQTRDO0FBQ25KLE1BQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxTQUFjLENBQUM7QUFDckIsTUFBSSxJQUFJO0FBQ1IsTUFBSSxJQUFJO0FBQ1IsU0FBTyxJQUFJLEtBQUssVUFBVSxJQUFJLEtBQUssUUFBUTtBQUMxQyxVQUFNLE9BQU8sS0FBSyxDQUFDO0FBQ25CLFVBQU0sT0FBTyxLQUFLLENBQUM7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
