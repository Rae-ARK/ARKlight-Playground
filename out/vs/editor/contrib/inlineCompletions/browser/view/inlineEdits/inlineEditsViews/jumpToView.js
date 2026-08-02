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
import { n } from "../../../../../../../base/browser/dom.js";
import { KeybindingLabel } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { RunOnceScheduler } from "../../../../../../../base/common/async.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, DebugLocation, derived, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { defaultKeybindingLabelStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Range } from "../../../../../../common/core/range.js";
import { inlineSuggestCommitId } from "../../../controller/commandIds.js";
import { getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground } from "../theme.js";
import { rectToProps } from "../utils/utils.js";
let JumpToView = class extends Disposable {
  constructor(_editor, options, _data, _themeService, _keybindingService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._data = _data;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._contextKeyService = _contextKeyService;
    this._styles = derived(this, (reader) => ({
      background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
      foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
      border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
    }));
    this._pos = derived(this, (reader) => {
      return this._editor.observePosition(derived(
        (reader2) => this._data.read(reader2)?.jumpToPosition || null
      ), reader.store);
    }).flatten();
    this._layout = derived(this, (reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return void 0;
      }
      const position = data.jumpToPosition;
      const lineHeight = this._editor.observeLineHeightForLine(constObservable(position.lineNumber)).read(reader);
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const point = this._pos.read(reader);
      if (!point) {
        return void 0;
      }
      const layout = this._editor.layoutInfo.read(reader);
      const widgetRect = Rect.fromLeftTopWidthHeight(
        point.x + layout.contentLeft + 2 - scrollLeft,
        point.y,
        100,
        lineHeight
      );
      return {
        widgetRect
      };
    });
    this._blink = animateFixedValues([
      { value: true, durationMs: 600 },
      { value: false, durationMs: 600 }
    ]);
    this._widget = n.div(
      {
        class: "inline-edit-jump-to-widget",
        style: {
          position: "absolute",
          display: this._layout.map((l) => l ? "flex" : "none"),
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          ...rectToProps((reader) => this._layout.read(reader)?.widgetRect)
        }
      },
      derived((reader) => {
        if (this._data.read(reader) === void 0) {
          return [];
        }
        return n.div({
          style: {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "0 4px",
            height: "100%",
            backgroundColor: this._styles.map((s) => s.background),
            ["--vscodeIconForeground"]: this._styles.map((s) => s.foreground),
            border: this._styles.map((s) => `1px solid ${s.border}`),
            borderRadius: "3px",
            boxSizing: "border-box",
            fontSize: "11px",
            color: this._styles.map((s) => s.foreground)
          }
        }, [
          this._style === "cursor" ? n.elem("div", {
            style: {
              borderLeft: "2px solid",
              height: 14,
              opacity: this._blink.map((b) => b ? "0" : "1")
            }
          }) : [
            derived(() => n.elem("div", {}, keybindingLabel(this._keybinding))),
            n.elem(
              "div",
              { style: { lineHeight: this._layout.map((l) => l?.widgetRect.height), marginTop: "-2px" } },
              ["to jump"]
            )
          ]
        ]);
      })
    );
    this._style = options.style;
    this._keybinding = this._getKeybinding(inlineSuggestCommitId);
    const widget = this._widget.keepUpdated(this._store);
    this._register(this._editor.createOverlayWidget({
      domNode: widget.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this._register(this._editor.setDecorations(derived((reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return [];
      }
      return [{
        range: Range.fromPositions(data.jumpToPosition, data.jumpToPosition),
        options: {
          description: "inline-edit-jump-to-decoration",
          inlineClassNameAffectsLetterSpacing: true,
          showIfCollapsed: true,
          after: {
            content: this._style === "label" ? "          " : "  "
          }
        }
      }];
    })));
  }
  _getKeybinding(commandId, debugLocation = DebugLocation.ofCaller()) {
    if (!commandId) {
      return constObservable(void 0);
    }
    return observableFromEvent(this, this._contextKeyService.onDidChangeContext, () => this._keybindingService.lookupKeybinding(commandId), debugLocation);
  }
};
JumpToView = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService)
], JumpToView);
function animateFixedValues(values, debugLocation = DebugLocation.ofCaller()) {
  let idx = 0;
  return observableFromEvent(void 0, (l) => {
    idx = 0;
    const timer = new RunOnceScheduler(() => {
      idx = (idx + 1) % values.length;
      l(null);
      timer.schedule(values[idx].durationMs);
    }, 0);
    timer.schedule(0);
    return timer;
  }, () => {
    return values[idx].value;
  }, debugLocation);
}
function keybindingLabel(keybinding) {
  return derived((_reader) => n.div({
    style: {},
    ref: (elem) => {
      const keybindingLabel2 = _reader.store.add(new KeybindingLabel(elem, OS, {
        disableTitle: true,
        ...defaultKeybindingLabelStyles,
        keybindingLabelShadow: void 0,
        keybindingLabelForeground: asCssVariable(inlineEditIndicatorPrimaryForeground),
        keybindingLabelBackground: "transparent",
        keybindingLabelBorder: asCssVariable(inlineEditIndicatorPrimaryForeground),
        keybindingLabelBottomBorder: void 0
      }));
      _reader.store.add(autorun((reader) => {
        keybindingLabel2.set(keybinding.read(reader));
      }));
    }
  }));
}
export {
  JumpToView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2p1bXBUb1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIERlYnVnTG9jYXRpb24sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3JlY3QuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBpbmxpbmVTdWdnZXN0Q29tbWl0SWQgfSBmcm9tICcuLi8uLi8uLi9jb250cm9sbGVyL2NvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yQmxlbmRlZENvbG9yLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Qm9yZGVyLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUZvcmVncm91bmQgfSBmcm9tICcuLi90aGVtZS5qcyc7XG5pbXBvcnQgeyByZWN0VG9Qcm9wcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIEp1bXBUb1ZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3R5bGU6ICdsYWJlbCcgfCAnY3Vyc29yJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLFxuXHRcdG9wdGlvbnM6IHsgc3R5bGU6ICdsYWJlbCcgfCAnY3Vyc29yJyB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IElPYnNlcnZhYmxlPHsganVtcFRvUG9zaXRpb246IFBvc2l0aW9uIH0gfCB1bmRlZmluZWQ+LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdHlsZSA9IG9wdGlvbnMuc3R5bGU7XG5cdFx0dGhpcy5fa2V5YmluZGluZyA9IHRoaXMuX2dldEtleWJpbmRpbmcoaW5saW5lU3VnZ2VzdENvbW1pdElkKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX3dpZGdldC5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3IuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB3aWRnZXQuZWxlbWVudCxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUobnVsbCksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iuc2V0RGVjb3JhdGlvbnMoZGVyaXZlZDxJTW9kZWxEZWx0YURlY29yYXRpb25bXT4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHQvLyB1c2UgaW5qZWN0ZWQgdGV4dCBhdCBwb3NpdGlvblxuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKGRhdGEuanVtcFRvUG9zaXRpb24sIGRhdGEuanVtcFRvUG9zaXRpb24pLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdpbmxpbmUtZWRpdC1qdW1wLXRvLWRlY29yYXRpb24nLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlLFxuXHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogdGhpcy5fc3R5bGUgPT09ICdsYWJlbCcgPyAnICAgICAgICAgICcgOiAnICAnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0gc2F0aXNmaWVzIElNb2RlbERlbHRhRGVjb3JhdGlvbl07XG5cdFx0fSkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlcyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+ICh7XG5cdFx0YmFja2dyb3VuZDogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5QmFja2dyb3VuZCwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKSxcblx0XHRmb3JlZ3JvdW5kOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdGJvcmRlcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Qm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHR9KSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcG9zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3Iub2JzZXJ2ZVBvc2l0aW9uKGRlcml2ZWQocmVhZGVyID0+XG5cdFx0XHR0aGlzLl9kYXRhLnJlYWQocmVhZGVyKT8uanVtcFRvUG9zaXRpb24gfHwgbnVsbFxuXHRcdCksIHJlYWRlci5zdG9yZSk7XG5cdH0pLmZsYXR0ZW4oKTtcblxuXHRwcml2YXRlIF9nZXRLZXliaW5kaW5nKGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZWJ1Z0xvY2F0aW9uID0gRGVidWdMb2NhdGlvbi5vZkNhbGxlcigpKSB7XG5cdFx0aWYgKCFjb21tYW5kSWQpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCAoKSA9PiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCksIGRlYnVnTG9jYXRpb24pO1xuXHRcdC8vIFRPRE86IHVzZSBjb250ZXh0a2V5c2VydmljZSB0byB1c2UgZGlmZmVyZW50IHJlbmRlcmluZ3Ncblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBkYXRhLmp1bXBUb1Bvc2l0aW9uO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3Iub2JzZXJ2ZUxpbmVIZWlnaHRGb3JMaW5lKGNvbnN0T2JzZXJ2YWJsZShwb3NpdGlvbi5saW5lTnVtYmVyKSkucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9lZGl0b3Iuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBwb2ludCA9IHRoaXMuX3Bvcy5yZWFkKHJlYWRlcik7XG5cblx0XHRpZiAoIXBvaW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuX2VkaXRvci5sYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHdpZGdldFJlY3QgPSBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoXG5cdFx0XHRwb2ludC54ICsgbGF5b3V0LmNvbnRlbnRMZWZ0ICsgMiAtIHNjcm9sbExlZnQsXG5cdFx0XHRwb2ludC55LFxuXHRcdFx0MTAwLFxuXHRcdFx0bGluZUhlaWdodFxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkZ2V0UmVjdCxcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ibGluayA9IGFuaW1hdGVGaXhlZFZhbHVlczxib29sZWFuPihbXG5cdFx0eyB2YWx1ZTogdHJ1ZSwgZHVyYXRpb25NczogNjAwIH0sXG5cdFx0eyB2YWx1ZTogZmFsc2UsIGR1cmF0aW9uTXM6IDYwMCB9LFxuXHRdKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQgPSBuLmRpdih7XG5cdFx0Y2xhc3M6ICdpbmxpbmUtZWRpdC1qdW1wLXRvLXdpZGdldCcsXG5cdFx0c3R5bGU6IHtcblx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0ZGlzcGxheTogdGhpcy5fbGF5b3V0Lm1hcChsID0+IGwgPyAnZmxleCcgOiAnbm9uZScpLFxuXG5cdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHRcdFx0dXNlclNlbGVjdDogJ25vbmUnLFxuXHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IHRoaXMuX2xheW91dC5yZWFkKHJlYWRlcik/LndpZGdldFJlY3QpLFxuXHRcdH1cblx0fSxcblx0XHRkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGF0YS5yZWFkKHJlYWRlcikgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1haW4gY29udGVudCBjb250YWluZXIgd2l0aCByb3VuZGVkIGJvcmRlclxuXHRcdFx0cmV0dXJuIG4uZGl2KHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0Z2FwOiAnNHB4Jyxcblx0XHRcdFx0XHRwYWRkaW5nOiAnMCA0cHgnLFxuXHRcdFx0XHRcdGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhpcy5fc3R5bGVzLm1hcChzID0+IHMuYmFja2dyb3VuZCksXG5cdFx0XHRcdFx0WyctLXZzY29kZUljb25Gb3JlZ3JvdW5kJyBhcyBzdHJpbmddOiB0aGlzLl9zdHlsZXMubWFwKHMgPT4gcy5mb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRib3JkZXI6IHRoaXMuX3N0eWxlcy5tYXAocyA9PiBgMXB4IHNvbGlkICR7cy5ib3JkZXJ9YCksXG5cdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiAnM3B4Jyxcblx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRmb250U2l6ZTogJzExcHgnLFxuXHRcdFx0XHRcdGNvbG9yOiB0aGlzLl9zdHlsZXMubWFwKHMgPT4gcy5mb3JlZ3JvdW5kKSxcblx0XHRcdFx0fVxuXHRcdFx0fSwgW1xuXHRcdFx0XHR0aGlzLl9zdHlsZSA9PT0gJ2N1cnNvcicgP1xuXHRcdFx0XHRcdG4uZWxlbSgnZGl2Jywge1xuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0Ym9yZGVyTGVmdDogJzJweCBzb2xpZCcsXG5cdFx0XHRcdFx0XHRcdGhlaWdodDogMTQsXG5cdFx0XHRcdFx0XHRcdG9wYWNpdHk6IHRoaXMuX2JsaW5rLm1hcChiID0+IGIgPyAnMCcgOiAnMScpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pIDpcblxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGRlcml2ZWQoKCkgPT4gbi5lbGVtKCdkaXYnLCB7fSwga2V5YmluZGluZ0xhYmVsKHRoaXMuX2tleWJpbmRpbmcpKSksXG5cdFx0XHRcdFx0XHRuLmVsZW0oJ2RpdicsIHsgc3R5bGU6IHsgbGluZUhlaWdodDogdGhpcy5fbGF5b3V0Lm1hcChsID0+IGw/LndpZGdldFJlY3QuaGVpZ2h0KSwgbWFyZ2luVG9wOiAnLTJweCcgfSB9LFxuXHRcdFx0XHRcdFx0XHRbJ3RvIGp1bXAnLF1cblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRdLFxuXHRcdFx0XSk7XG5cblx0XHR9KVxuXHQpO1xufVxuXG5mdW5jdGlvbiBhbmltYXRlRml4ZWRWYWx1ZXM8VD4odmFsdWVzOiB7IHZhbHVlOiBUOyBkdXJhdGlvbk1zOiBudW1iZXIgfVtdLCBkZWJ1Z0xvY2F0aW9uID0gRGVidWdMb2NhdGlvbi5vZkNhbGxlcigpKTogSU9ic2VydmFibGU8VD4ge1xuXHRsZXQgaWR4ID0gMDtcblx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQodW5kZWZpbmVkLCAobCkgPT4ge1xuXHRcdGlkeCA9IDA7XG5cdFx0Y29uc3QgdGltZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRpZHggPSAoaWR4ICsgMSkgJSB2YWx1ZXMubGVuZ3RoO1xuXHRcdFx0bChudWxsKTtcblx0XHRcdHRpbWVyLnNjaGVkdWxlKHZhbHVlc1tpZHhdLmR1cmF0aW9uTXMpO1xuXHRcdH0sIDApO1xuXHRcdHRpbWVyLnNjaGVkdWxlKDApO1xuXG5cdFx0cmV0dXJuIHRpbWVyO1xuXHR9LCAoKSA9PiB7XG5cdFx0cmV0dXJuIHZhbHVlc1tpZHhdLnZhbHVlO1xuXHR9LCBkZWJ1Z0xvY2F0aW9uKTtcbn1cblxuZnVuY3Rpb24ga2V5YmluZGluZ0xhYmVsKGtleWJpbmRpbmc6IElPYnNlcnZhYmxlPFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZD4pIHtcblx0cmV0dXJuIGRlcml2ZWQoX3JlYWRlciA9PiBuLmRpdih7XG5cdFx0c3R5bGU6IHt9LFxuXHRcdHJlZjogZWxlbSA9PiB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSBfcmVhZGVyLnN0b3JlLmFkZChuZXcgS2V5YmluZGluZ0xhYmVsKGVsZW0sIE9TLCB7XG5cdFx0XHRcdGRpc2FibGVUaXRsZTogdHJ1ZSxcblx0XHRcdFx0Li4uZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsU2hhZG93OiB1bmRlZmluZWQsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbEZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kKSxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQmFja2dyb3VuZDogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQm9yZGVyOiBhc0Nzc1ZhcmlhYmxlKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Rm9yZWdyb3VuZCksXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJvdHRvbUJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdFx0X3JlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWwuc2V0KGtleWJpbmRpbmcucmVhZChyZWFkZXIpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH0pKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxpQkFBaUIsZUFBZSxTQUFzQiwyQkFBMkI7QUFDbkcsU0FBUyxVQUFVO0FB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
