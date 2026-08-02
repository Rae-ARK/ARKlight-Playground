import { addStandardDisposableListener, getDomNodePagePosition } from "../../../../../../base/browser/dom.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { MouseTargetType } from "../../../../editorBrowser.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { EndOfLineSequence } from "../../../../../common/model.js";
import { localize } from "../../../../../../nls.js";
import { enableCopySelection } from "./copySelection.js";
class InlineDiffDeletedCodeMargin extends Disposable {
  constructor(_getViewZoneId, _marginDomNode, _deletedCodeDomNode, _modifiedEditor, _diff, _editor, _renderLinesResult, _originalTextModel, _contextMenuService, _clipboardService) {
    super();
    this._getViewZoneId = _getViewZoneId;
    this._marginDomNode = _marginDomNode;
    this._deletedCodeDomNode = _deletedCodeDomNode;
    this._modifiedEditor = _modifiedEditor;
    this._diff = _diff;
    this._editor = _editor;
    this._renderLinesResult = _renderLinesResult;
    this._originalTextModel = _originalTextModel;
    this._contextMenuService = _contextMenuService;
    this._clipboardService = _clipboardService;
    this._visibility = false;
    this._marginDomNode.style.zIndex = "10";
    this._diffActions = document.createElement("div");
    this._diffActions.className = ThemeIcon.asClassName(Codicon.lightBulb) + " lightbulb-glyph";
    this._diffActions.style.position = "absolute";
    const lineHeight = this._modifiedEditor.getOption(EditorOption.lineHeight);
    this._diffActions.style.right = "0px";
    this._diffActions.style.visibility = "hidden";
    this._diffActions.style.height = `${lineHeight}px`;
    this._diffActions.style.lineHeight = `${lineHeight}px`;
    this._marginDomNode.appendChild(this._diffActions);
    let currentLineNumberOffset = 0;
    const useShadowDOM = _modifiedEditor.getOption(EditorOption.useShadowDOM) && !isIOS;
    const showContextMenu = (anchor, baseActions, onHide) => {
      this._contextMenuService.showContextMenu({
        domForShadowRoot: useShadowDOM ? _modifiedEditor.getDomNode() ?? void 0 : void 0,
        getAnchor: () => anchor,
        onHide,
        getActions: () => {
          const actions = baseActions ?? [];
          const isDeletion = _diff.modified.isEmpty;
          actions.push(new Action(
            "diff.clipboard.copyDeletedContent",
            isDeletion ? _diff.original.length > 1 ? localize("diff.clipboard.copyDeletedLinesContent.label", "Copy deleted lines") : localize("diff.clipboard.copyDeletedLinesContent.single.label", "Copy deleted line") : _diff.original.length > 1 ? localize("diff.clipboard.copyChangedLinesContent.label", "Copy changed lines") : localize("diff.clipboard.copyChangedLinesContent.single.label", "Copy changed line"),
            void 0,
            true,
            async () => {
              const originalText = this._originalTextModel.getValueInRange(_diff.original.toExclusiveRange());
              await this._clipboardService.writeText(originalText);
            }
          ));
          if (_diff.original.length > 1) {
            actions.push(new Action(
              "diff.clipboard.copyDeletedLineContent",
              isDeletion ? localize(
                "diff.clipboard.copyDeletedLineContent.label",
                "Copy deleted line ({0})",
                _diff.original.startLineNumber + currentLineNumberOffset
              ) : localize(
                "diff.clipboard.copyChangedLineContent.label",
                "Copy changed line ({0})",
                _diff.original.startLineNumber + currentLineNumberOffset
              ),
              void 0,
              true,
              async () => {
                let lineContent = this._originalTextModel.getLineContent(_diff.original.startLineNumber + currentLineNumberOffset);
                if (lineContent === "") {
                  const eof = this._originalTextModel.getEndOfLineSequence();
                  lineContent = eof === EndOfLineSequence.LF ? "\n" : "\r\n";
                }
                await this._clipboardService.writeText(lineContent);
              }
            ));
          }
          const readOnly = _modifiedEditor.getOption(EditorOption.readOnly);
          if (!readOnly) {
            actions.push(
              new Action(
                "diff.inline.revertChange",
                localize("diff.inline.revertChange.label", "Revert this change"),
                void 0,
                true,
                async () => {
                  this._editor.revert(this._diff);
                }
              )
            );
          }
          return actions;
        },
        autoSelectFirstItem: true
      });
    };
    this._register(addStandardDisposableListener(this._diffActions, "mousedown", (e) => {
      if (!e.leftButton) {
        return;
      }
      const { top, height } = getDomNodePagePosition(this._diffActions);
      const pad = Math.floor(lineHeight / 3);
      e.preventDefault();
      showContextMenu({ x: e.posx, y: top + height + pad });
    }));
    this._register(_modifiedEditor.onMouseMove((e) => {
      if ((e.target.type === MouseTargetType.CONTENT_VIEW_ZONE || e.target.type === MouseTargetType.GUTTER_VIEW_ZONE) && e.target.detail.viewZoneId === this._getViewZoneId()) {
        currentLineNumberOffset = this._updateLightBulbPosition(this._marginDomNode, e.event.browserEvent.y, lineHeight);
        this.visibility = true;
      } else {
        this.visibility = false;
      }
    }));
    this._register(enableCopySelection({
      domNode: this._deletedCodeDomNode,
      diffEntry: _diff,
      originalModel: this._originalTextModel,
      renderLinesResult: this._renderLinesResult,
      clipboardService: _clipboardService
    }));
  }
  get visibility() {
    return this._visibility;
  }
  set visibility(_visibility) {
    if (this._visibility !== _visibility) {
      this._visibility = _visibility;
      this._diffActions.style.visibility = _visibility ? "visible" : "hidden";
    }
  }
  _updateLightBulbPosition(marginDomNode, y, lineHeight) {
    const { top } = getDomNodePagePosition(marginDomNode);
    const offset = y - top;
    const lineNumberOffset = Math.floor(offset / lineHeight);
    const newTop = lineNumberOffset * lineHeight;
    this._diffActions.style.top = `${newTop}px`;
    if (this._renderLinesResult.viewLineCounts) {
      let acc = 0;
      for (let i = 0; i < this._renderLinesResult.viewLineCounts.length; i++) {
        acc += this._renderLinesResult.viewLineCounts[i];
        if (lineNumberOffset < acc) {
          return i;
        }
      }
    }
    return lineNumberOffset;
  }
}
export {
  InlineDiffDeletedCodeMargin
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9pbmxpbmVEaWZmRGVsZXRlZENvZGVNYXJnaW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0lPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgZW5hYmxlQ29weVNlbGVjdGlvbiB9IGZyb20gJy4vY29weVNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBSZW5kZXJMaW5lc1Jlc3VsdCB9IGZyb20gJy4vcmVuZGVyTGluZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRGlmZkRlbGV0ZWRDb2RlTWFyZ2luIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZBY3Rpb25zOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF92aXNpYmlsaXR5OiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IHZpc2liaWxpdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2liaWxpdHk7XG5cdH1cblxuXHRzZXQgdmlzaWJpbGl0eShfdmlzaWJpbGl0eTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl92aXNpYmlsaXR5ICE9PSBfdmlzaWJpbGl0eSkge1xuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eSA9IF92aXNpYmlsaXR5O1xuXHRcdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUudmlzaWJpbGl0eSA9IF92aXNpYmlsaXR5ID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0Vmlld1pvbmVJZDogKCkgPT4gc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcmdpbkRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlbGV0ZWRDb2RlRG9tTm9kZTogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRFZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogRGlmZkVkaXRvcldpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJMaW5lc1Jlc3VsdDogUmVuZGVyTGluZXNSZXN1bHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxUZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gbWFrZSBzdXJlIHRoZSBkaWZmIG1hcmdpbiBzaG93cyBhYm92ZSBvdmVybGF5LlxuXHRcdHRoaXMuX21hcmdpbkRvbU5vZGUuc3R5bGUuekluZGV4ID0gJzEwJztcblxuXHRcdHRoaXMuX2RpZmZBY3Rpb25zID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ubGlnaHRCdWxiKSArICcgbGlnaHRidWxiLWdseXBoJztcblx0XHR0aGlzLl9kaWZmQWN0aW9ucy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX21vZGlmaWVkRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUucmlnaHQgPSAnMHB4Jztcblx0XHR0aGlzLl9kaWZmQWN0aW9ucy5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUuaGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cdFx0dGhpcy5fZGlmZkFjdGlvbnMuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuX21hcmdpbkRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZGlmZkFjdGlvbnMpO1xuXG5cdFx0bGV0IGN1cnJlbnRMaW5lTnVtYmVyT2Zmc2V0ID0gMDtcblxuXHRcdGNvbnN0IHVzZVNoYWRvd0RPTSA9IF9tb2RpZmllZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnVzZVNoYWRvd0RPTSkgJiYgIWlzSU9TOyAvLyBEbyBub3QgdXNlIHNoYWRvdyBkb20gb24gSU9TICMxMjIwMzVcblx0XHRjb25zdCBzaG93Q29udGV4dE1lbnUgPSAoYW5jaG9yOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGJhc2VBY3Rpb25zPzogQWN0aW9uW10sIG9uSGlkZT86ICgpID0+IHZvaWQpID0+IHtcblx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRkb21Gb3JTaGFkb3dSb290OiB1c2VTaGFkb3dET00gPyBfbW9kaWZpZWRFZGl0b3IuZ2V0RG9tTm9kZSgpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRcdG9uSGlkZSxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnM6IEFjdGlvbltdID0gYmFzZUFjdGlvbnMgPz8gW107XG5cdFx0XHRcdFx0Y29uc3QgaXNEZWxldGlvbiA9IF9kaWZmLm1vZGlmaWVkLmlzRW1wdHk7XG5cblx0XHRcdFx0XHQvLyBkZWZhdWx0IGFjdGlvblxuXHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdFx0J2RpZmYuY2xpcGJvYXJkLmNvcHlEZWxldGVkQ29udGVudCcsXG5cdFx0XHRcdFx0XHRpc0RlbGV0aW9uXG5cdFx0XHRcdFx0XHRcdD8gKF9kaWZmLm9yaWdpbmFsLmxlbmd0aCA+IDFcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkaWZmLmNsaXBib2FyZC5jb3B5RGVsZXRlZExpbmVzQ29udGVudC5sYWJlbCcsIFwiQ29weSBkZWxldGVkIGxpbmVzXCIpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGlmZi5jbGlwYm9hcmQuY29weURlbGV0ZWRMaW5lc0NvbnRlbnQuc2luZ2xlLmxhYmVsJywgXCJDb3B5IGRlbGV0ZWQgbGluZVwiKSlcblx0XHRcdFx0XHRcdFx0OiAoX2RpZmYub3JpZ2luYWwubGVuZ3RoID4gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2RpZmYuY2xpcGJvYXJkLmNvcHlDaGFuZ2VkTGluZXNDb250ZW50LmxhYmVsJywgXCJDb3B5IGNoYW5nZWQgbGluZXNcIilcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdkaWZmLmNsaXBib2FyZC5jb3B5Q2hhbmdlZExpbmVzQ29udGVudC5zaW5nbGUubGFiZWwnLCBcIkNvcHkgY2hhbmdlZCBsaW5lXCIpKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsVGV4dCA9IHRoaXMuX29yaWdpbmFsVGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShfZGlmZi5vcmlnaW5hbC50b0V4Y2x1c2l2ZVJhbmdlKCkpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChvcmlnaW5hbFRleHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0aWYgKF9kaWZmLm9yaWdpbmFsLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdFx0XHQnZGlmZi5jbGlwYm9hcmQuY29weURlbGV0ZWRMaW5lQ29udGVudCcsXG5cdFx0XHRcdFx0XHRcdGlzRGVsZXRpb25cblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkaWZmLmNsaXBib2FyZC5jb3B5RGVsZXRlZExpbmVDb250ZW50LmxhYmVsJywgXCJDb3B5IGRlbGV0ZWQgbGluZSAoezB9KVwiLFxuXHRcdFx0XHRcdFx0XHRcdFx0X2RpZmYub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyICsgY3VycmVudExpbmVOdW1iZXJPZmZzZXQpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZGlmZi5jbGlwYm9hcmQuY29weUNoYW5nZWRMaW5lQ29udGVudC5sYWJlbCcsIFwiQ29weSBjaGFuZ2VkIGxpbmUgKHswfSlcIixcblx0XHRcdFx0XHRcdFx0XHRcdF9kaWZmLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciArIGN1cnJlbnRMaW5lTnVtYmVyT2Zmc2V0KSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IGxpbmVDb250ZW50ID0gdGhpcy5fb3JpZ2luYWxUZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoX2RpZmYub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyICsgY3VycmVudExpbmVOdW1iZXJPZmZzZXQpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChsaW5lQ29udGVudCA9PT0gJycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIGVtcHR5IGxpbmUgLT4gbmV3IGxpbmVcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGVvZiA9IHRoaXMuX29yaWdpbmFsVGV4dE1vZGVsLmdldEVuZE9mTGluZVNlcXVlbmNlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRsaW5lQ29udGVudCA9IGVvZiA9PT0gRW5kT2ZMaW5lU2VxdWVuY2UuTEYgPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChsaW5lQ29udGVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZWFkT25seSA9IF9tb2RpZmllZEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnJlYWRPbmx5KTtcblx0XHRcdFx0XHRpZiAoIXJlYWRPbmx5KSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdFx0J2RpZmYuaW5saW5lLnJldmVydENoYW5nZScsXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdkaWZmLmlubGluZS5yZXZlcnRDaGFuZ2UubGFiZWwnLCBcIlJldmVydCB0aGlzIGNoYW5nZVwiKSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yLnJldmVydCh0aGlzLl9kaWZmKTtcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhdXRvU2VsZWN0Rmlyc3RJdGVtOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGlmZkFjdGlvbnMsICdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdGlmICghZS5sZWZ0QnV0dG9uKSB7IHJldHVybjsgfVxuXG5cdFx0XHRjb25zdCB7IHRvcCwgaGVpZ2h0IH0gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX2RpZmZBY3Rpb25zKTtcblx0XHRcdGNvbnN0IHBhZCA9IE1hdGguZmxvb3IobGluZUhlaWdodCAvIDMpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0c2hvd0NvbnRleHRNZW51KHsgeDogZS5wb3N4LCB5OiB0b3AgKyBoZWlnaHQgKyBwYWQgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21vZGlmaWVkRWRpdG9yLm9uTW91c2VNb3ZlKChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9WSUVXX1pPTkUgfHwgZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUpICYmIGUudGFyZ2V0LmRldGFpbC52aWV3Wm9uZUlkID09PSB0aGlzLl9nZXRWaWV3Wm9uZUlkKCkpIHtcblx0XHRcdFx0Y3VycmVudExpbmVOdW1iZXJPZmZzZXQgPSB0aGlzLl91cGRhdGVMaWdodEJ1bGJQb3NpdGlvbih0aGlzLl9tYXJnaW5Eb21Ob2RlLCBlLmV2ZW50LmJyb3dzZXJFdmVudC55LCBsaW5lSGVpZ2h0KTtcblx0XHRcdFx0dGhpcy52aXNpYmlsaXR5ID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVuYWJsZUNvcHlTZWxlY3Rpb24oe1xuXHRcdFx0ZG9tTm9kZTogdGhpcy5fZGVsZXRlZENvZGVEb21Ob2RlLFxuXHRcdFx0ZGlmZkVudHJ5OiBfZGlmZixcblx0XHRcdG9yaWdpbmFsTW9kZWw6IHRoaXMuX29yaWdpbmFsVGV4dE1vZGVsLFxuXHRcdFx0cmVuZGVyTGluZXNSZXN1bHQ6IHRoaXMuX3JlbmRlckxpbmVzUmVzdWx0LFxuXHRcdFx0Y2xpcGJvYXJkU2VydmljZTogX2NsaXBib2FyZFNlcnZpY2UsXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGlnaHRCdWxiUG9zaXRpb24obWFyZ2luRG9tTm9kZTogSFRNTEVsZW1lbnQsIHk6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCB7IHRvcCB9ID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihtYXJnaW5Eb21Ob2RlKTtcblx0XHRjb25zdCBvZmZzZXQgPSB5IC0gdG9wO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJPZmZzZXQgPSBNYXRoLmZsb29yKG9mZnNldCAvIGxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IG5ld1RvcCA9IGxpbmVOdW1iZXJPZmZzZXQgKiBsaW5lSGVpZ2h0O1xuXHRcdHRoaXMuX2RpZmZBY3Rpb25zLnN0eWxlLnRvcCA9IGAke25ld1RvcH1weGA7XG5cdFx0aWYgKHRoaXMuX3JlbmRlckxpbmVzUmVzdWx0LnZpZXdMaW5lQ291bnRzKSB7XG5cdFx0XHRsZXQgYWNjID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVuZGVyTGluZXNSZXN1bHQudmlld0xpbmVDb3VudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YWNjICs9IHRoaXMuX3JlbmRlckxpbmVzUmVzdWx0LnZpZXdMaW5lQ291bnRzW2ldO1xuXHRcdFx0XHRpZiAobGluZU51bWJlck9mZnNldCA8IGFjYykge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lTnVtYmVyT2Zmc2V0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLCtCQUErQiw4QkFBOEI7QUFDdEUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBNEIsdUJBQXVCO0FBR25ELFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMseUJBQXFDO0FBQzlDLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsMkJBQTJCO0FBRzdCLE1BQU0sb0NBQW9DLFdBQVc7QUFBQSxFQWdCM0QsWUFDa0IsZ0JBQ0EsZ0JBQ0EscUJBQ0EsaUJBQ0EsT0FDQSxTQUNBLG9CQUNBLG9CQUNBLHFCQUNBLG1CQUNoQjtBQUNELFVBQU07QUFYVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQXZCbEIsU0FBUSxjQUF1QjtBQTRCOUIsU0FBSyxlQUFlLE1BQU0sU0FBUztBQUVuQyxTQUFLLGVBQWUsU0FBUyxjQUFjLEtBQUs7QUFDaEQsU0FBSyxhQUFhLFlBQVksVUFBVSxZQUFZLFFBQVEsU0FBUyxJQUFJO0FBQ3pFLFNBQUssYUFBYSxNQUFNLFdBQVc7QUFDbkMsVUFBTSxhQUFhLEtBQUssZ0JBQWdCLFVBQVUsYUFBYSxVQUFVO0FBQ3pFLFNBQUssYUFBYSxNQUFNLFFBQVE7QUFDaEMsU0FBSyxhQUFhLE1BQU0sYUFBYTtBQUNyQyxTQUFLLGFBQWEsTUFBTSxTQUFTLEdBQUcsVUFBVTtBQUM5QyxTQUFLLGFBQWEsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUNsRCxTQUFLLGVBQWUsWUFBWSxLQUFLLFlBQVk7QUFFakQsUUFBSSwwQkFBMEI7QUFFOUIsVUFBTSxlQUFlLGdCQUFnQixVQUFVLGFBQWEsWUFBWSxLQUFLLENBQUM7QUFDOUUsVUFBTSxrQkFBa0IsQ0FBQyxRQUFrQyxhQUF3QixXQUF3QjtBQUMxRyxXQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxRQUN4QyxrQkFBa0IsZUFBZSxnQkFBZ0IsV0FBVyxLQUFLLFNBQVk7QUFBQSxRQUM3RSxXQUFXLE1BQU07QUFBQSxRQUNqQjtBQUFBLFFBQ0EsWUFBWSxNQUFNO0FBQ2pCLGdCQUFNLFVBQW9CLGVBQWUsQ0FBQztBQUMxQyxnQkFBTSxhQUFhLE1BQU0sU0FBUztBQUdsQyxrQkFBUSxLQUFLLElBQUk7QUFBQSxZQUNoQjtBQUFBLFlBQ0EsYUFDSSxNQUFNLFNBQVMsU0FBUyxJQUN4QixTQUFTLGdEQUFnRCxvQkFBb0IsSUFDN0UsU0FBUyx1REFBdUQsbUJBQW1CLElBQ25GLE1BQU0sU0FBUyxTQUFTLElBQ3hCLFNBQVMsZ0RBQWdELG9CQUFvQixJQUM3RSxTQUFTLHVEQUF1RCxtQkFBbUI7QUFBQSxZQUN2RjtBQUFBLFlBQ0E7QUFBQSxZQUNBLFlBQVk7QUFDWCxvQkFBTSxlQUFlLEtBQUssbUJBQW1CLGdCQUFnQixNQUFNLFNBQVMsaUJBQWlCLENBQUM7QUFDOUYsb0JBQU0sS0FBSyxrQkFBa0IsVUFBVSxZQUFZO0FBQUEsWUFDcEQ7QUFBQSxVQUNELENBQUM7QUFFRCxjQUFJLE1BQU0sU0FBUyxTQUFTLEdBQUc7QUFDOUIsb0JBQVEsS0FBSyxJQUFJO0FBQUEsY0FDaEI7QUFBQSxjQUNBLGFBQ0c7QUFBQSxnQkFBUztBQUFBLGdCQUErQztBQUFBLGdCQUN6RCxNQUFNLFNBQVMsa0JBQWtCO0FBQUEsY0FBdUIsSUFDdkQ7QUFBQSxnQkFBUztBQUFBLGdCQUErQztBQUFBLGdCQUN6RCxNQUFNLFNBQVMsa0JBQWtCO0FBQUEsY0FBdUI7QUFBQSxjQUMxRDtBQUFBLGNBQ0E7QUFBQSxjQUNBLFlBQVk7QUFDWCxvQkFBSSxjQUFjLEtBQUssbUJBQW1CLGVBQWUsTUFBTSxTQUFTLGtCQUFrQix1QkFBdUI7QUFDakgsb0JBQUksZ0JBQWdCLElBQUk7QUFFdkIsd0JBQU0sTUFBTSxLQUFLLG1CQUFtQixxQkFBcUI7QUFDekQsZ0NBQWMsUUFBUSxrQkFBa0IsS0FBSyxPQUFPO0FBQUEsZ0JBQ3JEO0FBQ0Esc0JBQU0sS0FBSyxrQkFBa0IsVUFBVSxXQUFXO0FBQUEsY0FDbkQ7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQ0EsZ0JBQU0sV0FBVyxnQkFBZ0IsVUFBVSxhQUFhLFFBQVE7QUFDaEUsY0FBSSxDQUFDLFVBQVU7QUFDZCxvQkFBUTtBQUFBLGNBQUssSUFBSTtBQUFBLGdCQUNoQjtBQUFBLGdCQUNBLFNBQVMsa0NBQWtDLG9CQUFvQjtBQUFBLGdCQUMvRDtBQUFBLGdCQUNBO0FBQUEsZ0JBQ0EsWUFBWTtBQUNYLHVCQUFLLFFBQVEsT0FBTyxLQUFLLEtBQUs7QUFBQSxnQkFDL0I7QUFBQSxjQUFDO0FBQUEsWUFDRjtBQUFBLFVBQ0Q7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLHFCQUFxQjtBQUFBLE1BQ3RCLENBQUM7QUFBQSxJQUNGO0FBRUEsU0FBSyxVQUFVLDhCQUE4QixLQUFLLGNBQWMsYUFBYSxPQUFLO0FBQ2pGLFVBQUksQ0FBQyxFQUFFLFlBQVk7QUFBRTtBQUFBLE1BQVE7QUFFN0IsWUFBTSxFQUFFLEtBQUssT0FBTyxJQUFJLHVCQUF1QixLQUFLLFlBQVk7QUFDaEUsWUFBTSxNQUFNLEtBQUssTUFBTSxhQUFhLENBQUM7QUFDckMsUUFBRSxlQUFlO0FBQ2pCLHNCQUFnQixFQUFFLEdBQUcsRUFBRSxNQUFNLEdBQUcsTUFBTSxTQUFTLElBQUksQ0FBQztBQUFBLElBQ3JELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxnQkFBZ0IsWUFBWSxDQUFDLE1BQXlCO0FBQ3BFLFdBQUssRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLHFCQUFxQixFQUFFLE9BQU8sU0FBUyxnQkFBZ0IscUJBQXFCLEVBQUUsT0FBTyxPQUFPLGVBQWUsS0FBSyxlQUFlLEdBQUc7QUFDeEssa0NBQTBCLEtBQUsseUJBQXlCLEtBQUssZ0JBQWdCLEVBQUUsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUMvRyxhQUFLLGFBQWE7QUFBQSxNQUNuQixPQUFPO0FBQ04sYUFBSyxhQUFhO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxvQkFBb0I7QUFBQSxNQUNsQyxTQUFTLEtBQUs7QUFBQSxNQUNkLFdBQVc7QUFBQSxNQUNYLGVBQWUsS0FBSztBQUFBLE1BQ3BCLG1CQUFtQixLQUFLO0FBQUEsTUFDeEIsa0JBQWtCO0FBQUEsSUFDbkIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBcElBLElBQUksYUFBc0I7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxXQUFXLGFBQXNCO0FBQ3BDLFFBQUksS0FBSyxnQkFBZ0IsYUFBYTtBQUNyQyxXQUFLLGNBQWM7QUFDbkIsV0FBSyxhQUFhLE1BQU0sYUFBYSxjQUFjLFlBQVk7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQTZIUSx5QkFBeUIsZUFBNEIsR0FBVyxZQUE0QjtBQUNuRyxVQUFNLEVBQUUsSUFBSSxJQUFJLHVCQUF1QixhQUFhO0FBQ3BELFVBQU0sU0FBUyxJQUFJO0FBQ25CLFVBQU0sbUJBQW1CLEtBQUssTUFBTSxTQUFTLFVBQVU7QUFDdkQsVUFBTSxTQUFTLG1CQUFtQjtBQUNsQyxTQUFLLGFBQWEsTUFBTSxNQUFNLEdBQUcsTUFBTTtBQUN2QyxRQUFJLEtBQUssbUJBQW1CLGdCQUFnQjtBQUMzQyxVQUFJLE1BQU07QUFDVixlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssbUJBQW1CLGVBQWUsUUFBUSxLQUFLO0FBQ3ZFLGVBQU8sS0FBSyxtQkFBbUIsZUFBZSxDQUFDO0FBQy9DLFlBQUksbUJBQW1CLEtBQUs7QUFDM0IsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
