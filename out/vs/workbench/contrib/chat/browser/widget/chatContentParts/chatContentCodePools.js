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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { CodeBlockPart, CodeCompareBlockPart } from "./codeBlockPart.js";
import { ResourcePool, KeyedResourcePool } from "./chatCollections.js";
import { createSingleCallFunction } from "../../../../../../base/common/functional.js";
let EditorPool = class extends Disposable {
  constructor(options, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService) {
    super();
    this.isSimpleWidget = isSimpleWidget;
    this._pool = this._register(new KeyedResourcePool(() => {
      return instantiationService.createInstance(CodeBlockPart, options, MenuId.ChatCodeBlock, delegate, overflowWidgetsDomNode, this.isSimpleWidget);
    }, { maxIdleSize: 2 }));
  }
  inUse() {
    return this._pool.inUse;
  }
  get(key) {
    const codeBlock = this._pool.get(key);
    let stale = false;
    return {
      object: codeBlock,
      isStale: () => stale,
      dispose: createSingleCallFunction(() => {
        codeBlock.reset();
        stale = true;
        this._pool.release(codeBlock, key);
      })
    };
  }
  clear() {
    this._pool.clear();
  }
};
EditorPool = __decorateClass([
  __decorateParam(4, IInstantiationService)
], EditorPool);
let DiffEditorPool = class extends Disposable {
  constructor(options, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService) {
    super();
    this.isSimpleWidget = isSimpleWidget;
    this._pool = this._register(new ResourcePool(() => {
      return instantiationService.createInstance(CodeCompareBlockPart, options, MenuId.ChatCompareBlock, delegate, overflowWidgetsDomNode, this.isSimpleWidget);
    }));
  }
  inUse() {
    return this._pool.inUse;
  }
  get() {
    const codeBlock = this._pool.get();
    let stale = false;
    return {
      object: codeBlock,
      isStale: () => stale,
      dispose: createSingleCallFunction(() => {
        codeBlock.reset();
        stale = true;
        this._pool.release(codeBlock);
      })
    };
  }
  clear() {
    this._pool.clear();
  }
};
DiffEditorPool = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DiffEditorPool);
export {
  DiffEditorPool,
  EditorPool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2NoYXRMaXN0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jaGF0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlQmxvY2tQYXJ0LCBDb2RlQ29tcGFyZUJsb2NrUGFydCB9IGZyb20gJy4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVBvb2wsIEtleWVkUmVzb3VyY2VQb29sLCBJRGlzcG9zYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4vY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuXG5leHBvcnQgY2xhc3MgRWRpdG9yUG9vbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bvb2w6IEtleWVkUmVzb3VyY2VQb29sPENvZGVCbG9ja1BhcnQ+O1xuXG5cdGluVXNlKCk6IEl0ZXJhYmxlPENvZGVCbG9ja1BhcnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcG9vbC5pblVzZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdGRlbGVnYXRlOiBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUsXG5cdFx0b3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc1NpbXBsZVdpZGdldDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wb29sID0gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWVkUmVzb3VyY2VQb29sKCgpID0+IHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlQmxvY2tQYXJ0LCBvcHRpb25zLCBNZW51SWQuQ2hhdENvZGVCbG9jaywgZGVsZWdhdGUsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRoaXMuaXNTaW1wbGVXaWRnZXQpO1xuXHRcdH0sIHsgbWF4SWRsZVNpemU6IDIgfSkpO1xuXHR9XG5cblx0Z2V0KGtleTogc3RyaW5nKTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUJsb2NrUGFydD4ge1xuXHRcdGNvbnN0IGNvZGVCbG9jayA9IHRoaXMuX3Bvb2wuZ2V0KGtleSk7XG5cdFx0bGV0IHN0YWxlID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogY29kZUJsb2NrLFxuXHRcdFx0aXNTdGFsZTogKCkgPT4gc3RhbGUsXG5cdFx0XHRkaXNwb3NlOiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHRjb2RlQmxvY2sucmVzZXQoKTtcblx0XHRcdFx0c3RhbGUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9wb29sLnJlbGVhc2UoY29kZUJsb2NrLCBrZXkpO1xuXHRcdFx0fSlcblx0XHR9O1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9vbC5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaWZmRWRpdG9yUG9vbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bvb2w6IFJlc291cmNlUG9vbDxDb2RlQ29tcGFyZUJsb2NrUGFydD47XG5cblx0cHVibGljIGluVXNlKCk6IEl0ZXJhYmxlPENvZGVDb21wYXJlQmxvY2tQYXJ0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvb2wuaW5Vc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRkZWxlZ2F0ZTogSUNoYXRSZW5kZXJlckRlbGVnYXRlLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNTaW1wbGVXaWRnZXQ6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcG9vbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXNvdXJjZVBvb2woKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVDb21wYXJlQmxvY2tQYXJ0LCBvcHRpb25zLCBNZW51SWQuQ2hhdENvbXBhcmVCbG9jaywgZGVsZWdhdGUsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRoaXMuaXNTaW1wbGVXaWRnZXQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCgpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQ29tcGFyZUJsb2NrUGFydD4ge1xuXHRcdGNvbnN0IGNvZGVCbG9jayA9IHRoaXMuX3Bvb2wuZ2V0KCk7XG5cdFx0bGV0IHN0YWxlID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogY29kZUJsb2NrLFxuXHRcdFx0aXNTdGFsZTogKCkgPT4gc3RhbGUsXG5cdFx0XHRkaXNwb3NlOiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHRjb2RlQmxvY2sucmVzZXQoKTtcblx0XHRcdFx0c3RhbGUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9wb29sLnJlbGVhc2UoY29kZUJsb2NrKTtcblx0XHRcdH0pXG5cdFx0fTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Bvb2wuY2xlYXIoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyxlQUFlLDRCQUE0QjtBQUNwRCxTQUFTLGNBQWMseUJBQStDO0FBQ3RFLFNBQVMsZ0NBQWdDO0FBRWxDLElBQU0sYUFBTixjQUF5QixXQUFXO0FBQUEsRUFRMUMsWUFDQyxTQUNBLFVBQ0Esd0JBQ2lCLGlCQUEwQixPQUNwQixzQkFDdEI7QUFDRCxVQUFNO0FBSFc7QUFJakIsU0FBSyxRQUFRLEtBQUssVUFBVSxJQUFJLGtCQUFrQixNQUFNO0FBQ3ZELGFBQU8scUJBQXFCLGVBQWUsZUFBZSxTQUFTLE9BQU8sZUFBZSxVQUFVLHdCQUF3QixLQUFLLGNBQWM7QUFBQSxJQUMvSSxHQUFHLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQ3ZCO0FBQUEsRUFmQSxRQUFpQztBQUNoQyxXQUFPLEtBQUssTUFBTTtBQUFBLEVBQ25CO0FBQUEsRUFlQSxJQUFJLEtBQWtEO0FBQ3JELFVBQU0sWUFBWSxLQUFLLE1BQU0sSUFBSSxHQUFHO0FBQ3BDLFFBQUksUUFBUTtBQUNaLFdBQU87QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVMsTUFBTTtBQUFBLE1BQ2YsU0FBUyx5QkFBeUIsTUFBTTtBQUN2QyxrQkFBVSxNQUFNO0FBQ2hCLGdCQUFRO0FBQ1IsYUFBSyxNQUFNLFFBQVEsV0FBVyxHQUFHO0FBQUEsTUFDbEMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxNQUFNLE1BQU07QUFBQSxFQUNsQjtBQUNEO0FBdENhLGFBQU47QUFBQSxFQWFKO0FBQUEsR0FiVTtBQXdDTixJQUFNLGlCQUFOLGNBQTZCLFdBQVc7QUFBQSxFQVE5QyxZQUNDLFNBQ0EsVUFDQSx3QkFDaUIsaUJBQTBCLE9BQ3BCLHNCQUN0QjtBQUNELFVBQU07QUFIVztBQUlqQixTQUFLLFFBQVEsS0FBSyxVQUFVLElBQUksYUFBYSxNQUFNO0FBQ2xELGFBQU8scUJBQXFCLGVBQWUsc0JBQXNCLFNBQVMsT0FBTyxrQkFBa0IsVUFBVSx3QkFBd0IsS0FBSyxjQUFjO0FBQUEsSUFDekosQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBZk8sUUFBd0M7QUFDOUMsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBZUEsTUFBa0Q7QUFDakQsVUFBTSxZQUFZLEtBQUssTUFBTSxJQUFJO0FBQ2pDLFFBQUksUUFBUTtBQUNaLFdBQU87QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVMsTUFBTTtBQUFBLE1BQ2YsU0FBUyx5QkFBeUIsTUFBTTtBQUN2QyxrQkFBVSxNQUFNO0FBQ2hCLGdCQUFRO0FBQ1IsYUFBSyxNQUFNLFFBQVEsU0FBUztBQUFBLE1BQzdCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssTUFBTSxNQUFNO0FBQUEsRUFDbEI7QUFDRDtBQXRDYSxpQkFBTjtBQUFBLEVBYUo7QUFBQSxHQWJVOyIsCiAgIm5hbWVzIjogW10KfQo=
