import { clearNode } from "../../../base/browser/dom.js";
import { createCSSRule, createStyleSheet } from "../../../base/browser/domStylesheets.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
var ZIndex = /* @__PURE__ */ ((ZIndex2) => {
  ZIndex2[ZIndex2["Base"] = 0] = "Base";
  ZIndex2[ZIndex2["Sash"] = 35] = "Sash";
  ZIndex2[ZIndex2["SuggestWidget"] = 40] = "SuggestWidget";
  ZIndex2[ZIndex2["Hover"] = 50] = "Hover";
  ZIndex2[ZIndex2["DragImage"] = 1e3] = "DragImage";
  ZIndex2[ZIndex2["MenubarMenuItemsHolder"] = 2e3] = "MenubarMenuItemsHolder";
  ZIndex2[ZIndex2["ContextView"] = 2500] = "ContextView";
  ZIndex2[ZIndex2["ModalDialog"] = 2600] = "ModalDialog";
  ZIndex2[ZIndex2["PaneDropOverlay"] = 1e4] = "PaneDropOverlay";
  return ZIndex2;
})(ZIndex || {});
const ZIndexValues = Object.keys(ZIndex).filter((key) => !isNaN(Number(key))).map((key) => Number(key)).sort((a, b) => b - a);
function findBase(z) {
  for (const zi of ZIndexValues) {
    if (z >= zi) {
      return zi;
    }
  }
  return -1;
}
class ZIndexRegistry {
  constructor() {
    this.styleSheet = createStyleSheet();
    this.zIndexMap = /* @__PURE__ */ new Map();
    this.scheduler = new RunOnceScheduler(() => this.updateStyleElement(), 200);
  }
  registerZIndex(relativeLayer, z, name) {
    if (this.zIndexMap.get(name)) {
      throw new Error(`z-index with name ${name} has already been registered.`);
    }
    const proposedZValue = relativeLayer + z;
    if (findBase(proposedZValue) !== relativeLayer) {
      throw new Error(`Relative layer: ${relativeLayer} + z-index: ${z} exceeds next layer ${proposedZValue}.`);
    }
    this.zIndexMap.set(name, proposedZValue);
    this.scheduler.schedule();
    return this.getVarName(name);
  }
  getVarName(name) {
    return `--z-index-${name}`;
  }
  updateStyleElement() {
    clearNode(this.styleSheet);
    let ruleBuilder = "";
    this.zIndexMap.forEach((zIndex, name) => {
      ruleBuilder += `${this.getVarName(name)}: ${zIndex};
`;
    });
    createCSSRule(":root", ruleBuilder, this.styleSheet);
  }
}
const zIndexRegistry = new ZIndexRegistry();
function registerZIndex(relativeLayer, z, name) {
  return zIndexRegistry.registerZIndex(relativeLayer, z, name);
}
export {
  ZIndex,
  registerZIndex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xheW91dC9icm93c2VyL3pJbmRleFJlZ2lzdHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDU1NSdWxlLCBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBlbnVtIFpJbmRleCB7XG5cdEJhc2UgPSAwLFxuXHRTYXNoID0gMzUsXG5cdFN1Z2dlc3RXaWRnZXQgPSA0MCxcblx0SG92ZXIgPSA1MCxcblx0RHJhZ0ltYWdlID0gMTAwMCxcblx0TWVudWJhck1lbnVJdGVtc0hvbGRlciA9IDIwMDAsIC8vIHF1aWNrLWlucHV0LXdpZGdldFxuXHRDb250ZXh0VmlldyA9IDI1MDAsXG5cdE1vZGFsRGlhbG9nID0gMjYwMCxcblx0UGFuZURyb3BPdmVybGF5ID0gMTAwMDBcbn1cblxuY29uc3QgWkluZGV4VmFsdWVzID0gT2JqZWN0LmtleXMoWkluZGV4KS5maWx0ZXIoa2V5ID0+ICFpc05hTihOdW1iZXIoa2V5KSkpLm1hcChrZXkgPT4gTnVtYmVyKGtleSkpLnNvcnQoKGEsIGIpID0+IGIgLSBhKTtcbmZ1bmN0aW9uIGZpbmRCYXNlKHo6IG51bWJlcikge1xuXHRmb3IgKGNvbnN0IHppIG9mIFpJbmRleFZhbHVlcykge1xuXHRcdGlmICh6ID49IHppKSB7XG5cdFx0XHRyZXR1cm4gemk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIC0xO1xufVxuXG5jbGFzcyBaSW5kZXhSZWdpc3RyeSB7XG5cdHByaXZhdGUgc3R5bGVTaGVldDogSFRNTFN0eWxlRWxlbWVudDtcblx0cHJpdmF0ZSB6SW5kZXhNYXA6IE1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHByaXZhdGUgc2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnN0eWxlU2hlZXQgPSBjcmVhdGVTdHlsZVNoZWV0KCk7XG5cdFx0dGhpcy56SW5kZXhNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHRoaXMuc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51cGRhdGVTdHlsZUVsZW1lbnQoKSwgMjAwKTtcblx0fVxuXG5cdHJlZ2lzdGVyWkluZGV4KHJlbGF0aXZlTGF5ZXI6IFpJbmRleCwgejogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLnpJbmRleE1hcC5nZXQobmFtZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgei1pbmRleCB3aXRoIG5hbWUgJHtuYW1lfSBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcG9zZWRaVmFsdWUgPSByZWxhdGl2ZUxheWVyICsgejtcblx0XHRpZiAoZmluZEJhc2UocHJvcG9zZWRaVmFsdWUpICE9PSByZWxhdGl2ZUxheWVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlbGF0aXZlIGxheWVyOiAke3JlbGF0aXZlTGF5ZXJ9ICsgei1pbmRleDogJHt6fSBleGNlZWRzIG5leHQgbGF5ZXIgJHtwcm9wb3NlZFpWYWx1ZX0uYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy56SW5kZXhNYXAuc2V0KG5hbWUsIHByb3Bvc2VkWlZhbHVlKTtcblx0XHR0aGlzLnNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdHJldHVybiB0aGlzLmdldFZhck5hbWUobmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZhck5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYC0tei1pbmRleC0ke25hbWV9YDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3R5bGVFbGVtZW50KCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0aGlzLnN0eWxlU2hlZXQpO1xuXHRcdGxldCBydWxlQnVpbGRlciA9ICcnO1xuXHRcdHRoaXMuekluZGV4TWFwLmZvckVhY2goKHpJbmRleCwgbmFtZSkgPT4ge1xuXHRcdFx0cnVsZUJ1aWxkZXIgKz0gYCR7dGhpcy5nZXRWYXJOYW1lKG5hbWUpfTogJHt6SW5kZXh9O1xcbmA7XG5cdFx0fSk7XG5cdFx0Y3JlYXRlQ1NTUnVsZSgnOnJvb3QnLCBydWxlQnVpbGRlciwgdGhpcy5zdHlsZVNoZWV0KTtcblx0fVxufVxuXG5jb25zdCB6SW5kZXhSZWdpc3RyeSA9IG5ldyBaSW5kZXhSZWdpc3RyeSgpO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJaSW5kZXgocmVsYXRpdmVMYXllcjogWkluZGV4LCB6OiBudW1iZXIsIG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB6SW5kZXhSZWdpc3RyeS5yZWdpc3RlclpJbmRleChyZWxhdGl2ZUxheWVyLCB6LCBuYW1lKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZSx3QkFBd0I7QUFDaEQsU0FBUyx3QkFBd0I7QUFFMUIsSUFBSyxTQUFMLGtCQUFLQSxZQUFMO0FBQ04sRUFBQUEsZ0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsZ0JBQUEsVUFBTyxNQUFQO0FBQ0EsRUFBQUEsZ0JBQUEsbUJBQWdCLE1BQWhCO0FBQ0EsRUFBQUEsZ0JBQUEsV0FBUSxNQUFSO0FBQ0EsRUFBQUEsZ0JBQUEsZUFBWSxPQUFaO0FBQ0EsRUFBQUEsZ0JBQUEsNEJBQXlCLE9BQXpCO0FBQ0EsRUFBQUEsZ0JBQUEsaUJBQWMsUUFBZDtBQUNBLEVBQUFBLGdCQUFBLGlCQUFjLFFBQWQ7QUFDQSxFQUFBQSxnQkFBQSxxQkFBa0IsT0FBbEI7QUFUVyxTQUFBQTtBQUFBLEdBQUE7QUFZWixNQUFNLGVBQWUsT0FBTyxLQUFLLE1BQU0sRUFBRSxPQUFPLFNBQU8sQ0FBQyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLFNBQU8sT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQztBQUN4SCxTQUFTLFNBQVMsR0FBVztBQUM1QixhQUFXLE1BQU0sY0FBYztBQUM5QixRQUFJLEtBQUssSUFBSTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVBLE1BQU0sZUFBZTtBQUFBLEVBSXBCLGNBQWM7QUFDYixTQUFLLGFBQWEsaUJBQWlCO0FBQ25DLFNBQUssWUFBWSxvQkFBSSxJQUFvQjtBQUN6QyxTQUFLLFlBQVksSUFBSSxpQkFBaUIsTUFBTSxLQUFLLG1CQUFtQixHQUFHLEdBQUc7QUFBQSxFQUMzRTtBQUFBLEVBRUEsZUFBZSxlQUF1QixHQUFXLE1BQXNCO0FBQ3RFLFFBQUksS0FBSyxVQUFVLElBQUksSUFBSSxHQUFHO0FBQzdCLFlBQU0sSUFBSSxNQUFNLHFCQUFxQixJQUFJLCtCQUErQjtBQUFBLElBQ3pFO0FBRUEsVUFBTSxpQkFBaUIsZ0JBQWdCO0FBQ3ZDLFFBQUksU0FBUyxjQUFjLE1BQU0sZUFBZTtBQUMvQyxZQUFNLElBQUksTUFBTSxtQkFBbUIsYUFBYSxlQUFlLENBQUMsdUJBQXVCLGNBQWMsR0FBRztBQUFBLElBQ3pHO0FBRUEsU0FBSyxVQUFVLElBQUksTUFBTSxjQUFjO0FBQ3ZDLFNBQUssVUFBVSxTQUFTO0FBQ3hCLFdBQU8sS0FBSyxXQUFXLElBQUk7QUFBQSxFQUM1QjtBQUFBLEVBRVEsV0FBVyxNQUFzQjtBQUN4QyxXQUFPLGFBQWEsSUFBSTtBQUFBLEVBQ3pCO0FBQUEsRUFFUSxxQkFBMkI7QUFDbEMsY0FBVSxLQUFLLFVBQVU7QUFDekIsUUFBSSxjQUFjO0FBQ2xCLFNBQUssVUFBVSxRQUFRLENBQUMsUUFBUSxTQUFTO0FBQ3hDLHFCQUFlLEdBQUcsS0FBSyxXQUFXLElBQUksQ0FBQyxLQUFLLE1BQU07QUFBQTtBQUFBLElBQ25ELENBQUM7QUFDRCxrQkFBYyxTQUFTLGFBQWEsS0FBSyxVQUFVO0FBQUEsRUFDcEQ7QUFDRDtBQUVBLE1BQU0saUJBQWlCLElBQUksZUFBZTtBQUVuQyxTQUFTLGVBQWUsZUFBdUIsR0FBVyxNQUFzQjtBQUN0RixTQUFPLGVBQWUsZUFBZSxlQUFlLEdBQUcsSUFBSTtBQUM1RDsiLAogICJuYW1lcyI6IFsiWkluZGV4Il0KfQo=
