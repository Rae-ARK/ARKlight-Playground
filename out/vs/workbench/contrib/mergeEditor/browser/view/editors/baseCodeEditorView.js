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
import { h, reset } from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { autorun, autorunWithStore, derived } from "../../../../../../base/common/observable.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { applyObservableDecorations } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { CodeEditorView, TitleMenu, createSelectionsAutorun } from "./codeEditorView.js";
let BaseCodeEditorView = class extends CodeEditorView {
  constructor(viewModel, instantiationService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this.decorations = derived(this, (reader) => {
      const viewModel = this.viewModel.read(reader);
      if (!viewModel) {
        return [];
      }
      const model = viewModel.model;
      const textModel = model.base;
      const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
      const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
      const showDeletionMarkers = this.showDeletionMarkers.read(reader);
      const result = [];
      for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
        const range = modifiedBaseRange.baseRange;
        if (!range) {
          continue;
        }
        const isHandled = model.isHandled(modifiedBaseRange).read(reader);
        if (!modifiedBaseRange.isConflicting && isHandled && !showNonConflictingChanges) {
          continue;
        }
        const blockClassNames = ["merge-editor-block"];
        let blockPadding = [0, 0, 0, 0];
        if (isHandled) {
          blockClassNames.push("handled");
        }
        if (modifiedBaseRange === activeModifiedBaseRange) {
          blockClassNames.push("focused");
          blockPadding = [0, 2, 0, 2];
        }
        blockClassNames.push("base");
        const inputToDiffAgainst = viewModel.baseShowDiffAgainst.read(reader);
        if (inputToDiffAgainst) {
          for (const diff of modifiedBaseRange.getInputDiffs(inputToDiffAgainst)) {
            const range2 = diff.inputRange.toInclusiveRange();
            if (range2) {
              result.push({
                range: range2,
                options: {
                  className: `merge-editor-diff base`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            for (const diff2 of diff.rangeMappings) {
              if (showDeletionMarkers || !diff2.inputRange.isEmpty()) {
                result.push({
                  range: diff2.inputRange,
                  options: {
                    className: diff2.inputRange.isEmpty() ? `merge-editor-diff-empty-word base` : `merge-editor-diff-word base`,
                    description: "Merge Editor",
                    showIfCollapsed: true
                  }
                });
              }
            }
          }
        }
        result.push({
          range: range.toInclusiveRangeOrEmpty(),
          options: {
            showIfCollapsed: true,
            blockClassName: blockClassNames.join(" "),
            blockPadding,
            blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
            description: "Merge Editor",
            minimap: {
              position: MinimapPosition.Gutter,
              color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor }
            },
            overviewRuler: modifiedBaseRange.isConflicting ? {
              position: OverviewRulerLane.Center,
              color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor }
            } : void 0
          }
        });
      }
      return result;
    });
    this._register(
      createSelectionsAutorun(this, (baseRange, viewModel2) => baseRange)
    );
    this._register(
      instantiationService.createInstance(TitleMenu, MenuId.MergeBaseToolbar, this.htmlElements.title)
    );
    this._register(
      autorunWithStore((reader, store) => {
        if (this.checkboxesVisible.read(reader)) {
          store.add(new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
            getIntersectingGutterItems: (range, reader2) => [],
            createView: (item, target) => {
              throw new BugIndicatingError();
            }
          }));
        }
      })
    );
    this._register(
      autorun((reader) => {
        const vm = this.viewModel.read(reader);
        if (!vm) {
          return;
        }
        this.editor.setModel(vm.model.base);
        reset(this.htmlElements.title, ...renderLabelWithIcons(localize("base", "Base")));
        const baseShowDiffAgainst = vm.baseShowDiffAgainst.read(reader);
        let node = void 0;
        if (baseShowDiffAgainst) {
          const label = localize("compareWith", "Comparing with {0}", baseShowDiffAgainst === 1 ? vm.model.input1.title : vm.model.input2.title);
          const tooltip = localize("compareWithTooltip", "Differences are highlighted with a background color.");
          node = h("span", { title: tooltip }, [label]).root;
        }
        reset(this.htmlElements.description, ...node ? [node] : []);
      })
    );
    this._register(applyObservableDecorations(this.editor, this.decorations));
  }
};
BaseCodeEditorView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService)
], BaseCodeEditorView);
export {
  BaseCodeEditorView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvdmlldy9lZGl0b3JzL2Jhc2VDb2RlRWRpdG9yVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGgsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgTWluaW1hcFBvc2l0aW9uLCBPdmVydmlld1J1bGVyTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgYXBwbHlPYnNlcnZhYmxlRGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi91dGlscy5qcyc7XG5pbXBvcnQgeyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yLCB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSBmcm9tICcuLi9jb2xvcnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3V0dGVyIH0gZnJvbSAnLi4vZWRpdG9yR3V0dGVyLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JWaWV3LCBUaXRsZU1lbnUsIGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuIH0gZnJvbSAnLi9jb2RlRWRpdG9yVmlldy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCYXNlQ29kZUVkaXRvclZpZXcgZXh0ZW5kcyBDb2RlRWRpdG9yVmlldyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHZpZXdNb2RlbDogSU9ic2VydmFibGU8TWVyZ2VFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB2aWV3TW9kZWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0Y3JlYXRlU2VsZWN0aW9uc0F1dG9ydW4odGhpcywgKGJhc2VSYW5nZSwgdmlld01vZGVsKSA9PiBiYXNlUmFuZ2UpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGl0bGVNZW51LCBNZW51SWQuTWVyZ2VCYXNlVG9vbGJhciwgdGhpcy5odG1sRWxlbWVudHMudGl0bGUpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0YXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBjaGVja2JveGVzICovXG5cdFx0XHRcdGlmICh0aGlzLmNoZWNrYm94ZXNWaXNpYmxlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChuZXcgRWRpdG9yR3V0dGVyKHRoaXMuZWRpdG9yLCB0aGlzLmh0bWxFbGVtZW50cy5ndXR0ZXJEaXYsIHtcblx0XHRcdFx0XHRcdGdldEludGVyc2VjdGluZ0d1dHRlckl0ZW1zOiAocmFuZ2UsIHJlYWRlcikgPT4gW10sXG5cdFx0XHRcdFx0XHRjcmVhdGVWaWV3OiAoaXRlbSwgdGFyZ2V0KSA9PiB7IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTsgfSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0YXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBsYWJlbHMgJiB0ZXh0IG1vZGVsICovXG5cdFx0XHRcdGNvbnN0IHZtID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXZtKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnNldE1vZGVsKHZtLm1vZGVsLmJhc2UpO1xuXHRcdFx0XHRyZXNldCh0aGlzLmh0bWxFbGVtZW50cy50aXRsZSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMobG9jYWxpemUoJ2Jhc2UnLCAnQmFzZScpKSk7XG5cblx0XHRcdFx0Y29uc3QgYmFzZVNob3dEaWZmQWdhaW5zdCA9IHZtLmJhc2VTaG93RGlmZkFnYWluc3QucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdGxldCBub2RlOiBOb2RlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoYmFzZVNob3dEaWZmQWdhaW5zdCkge1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gbG9jYWxpemUoJ2NvbXBhcmVXaXRoJywgJ0NvbXBhcmluZyB3aXRoIHswfScsIGJhc2VTaG93RGlmZkFnYWluc3QgPT09IDEgPyB2bS5tb2RlbC5pbnB1dDEudGl0bGUgOiB2bS5tb2RlbC5pbnB1dDIudGl0bGUpO1xuXHRcdFx0XHRcdGNvbnN0IHRvb2x0aXAgPSBsb2NhbGl6ZSgnY29tcGFyZVdpdGhUb29sdGlwJywgJ0RpZmZlcmVuY2VzIGFyZSBoaWdobGlnaHRlZCB3aXRoIGEgYmFja2dyb3VuZCBjb2xvci4nKTtcblx0XHRcdFx0XHRub2RlID0gaCgnc3BhbicsIHsgdGl0bGU6IHRvb2x0aXAgfSwgW2xhYmVsXSkucm9vdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNldCh0aGlzLmh0bWxFbGVtZW50cy5kZXNjcmlwdGlvbiwgLi4uKG5vZGUgPyBbbm9kZV0gOiBbXSkpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlPYnNlcnZhYmxlRGVjb3JhdGlvbnModGhpcy5lZGl0b3IsIHRoaXMuZGVjb3JhdGlvbnMpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IG1vZGVsLmJhc2U7XG5cblx0XHRjb25zdCBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IHZpZXdNb2RlbC5hY3RpdmVNb2RpZmllZEJhc2VSYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IHZpZXdNb2RlbC5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBzaG93RGVsZXRpb25NYXJrZXJzID0gdGhpcy5zaG93RGVsZXRpb25NYXJrZXJzLnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1vZGlmaWVkQmFzZVJhbmdlIG9mIG1vZGVsLm1vZGlmaWVkQmFzZVJhbmdlcy5yZWFkKHJlYWRlcikpIHtcblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBtb2RpZmllZEJhc2VSYW5nZS5iYXNlUmFuZ2U7XG5cdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0hhbmRsZWQgPSBtb2RlbC5pc0hhbmRsZWQobW9kaWZpZWRCYXNlUmFuZ2UpLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZyAmJiBpc0hhbmRsZWQgJiYgIXNob3dOb25Db25mbGljdGluZ0NoYW5nZXMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJsb2NrQ2xhc3NOYW1lcyA9IFsnbWVyZ2UtZWRpdG9yLWJsb2NrJ107XG5cdFx0XHRsZXQgYmxvY2tQYWRkaW5nOiBbdG9wOiBudW1iZXIsIHJpZ2h0OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCBsZWZ0OiBudW1iZXJdID0gWzAsIDAsIDAsIDBdO1xuXHRcdFx0aWYgKGlzSGFuZGxlZCkge1xuXHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnaGFuZGxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlID09PSBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSkge1xuXHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnZm9jdXNlZCcpO1xuXHRcdFx0XHRibG9ja1BhZGRpbmcgPSBbMCwgMiwgMCwgMl07XG5cdFx0XHR9XG5cdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnYmFzZScpO1xuXG5cdFx0XHRjb25zdCBpbnB1dFRvRGlmZkFnYWluc3QgPSB2aWV3TW9kZWwuYmFzZVNob3dEaWZmQWdhaW5zdC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmIChpbnB1dFRvRGlmZkFnYWluc3QpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkaWZmIG9mIG1vZGlmaWVkQmFzZVJhbmdlLmdldElucHV0RGlmZnMoaW5wdXRUb0RpZmZBZ2FpbnN0KSkge1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gZGlmZi5pbnB1dFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKTtcblx0XHRcdFx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGBtZXJnZS1lZGl0b3ItZGlmZiBiYXNlYCxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lcmdlIEVkaXRvcicsXG5cdFx0XHRcdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoY29uc3QgZGlmZjIgb2YgZGlmZi5yYW5nZU1hcHBpbmdzKSB7XG5cdFx0XHRcdFx0XHRpZiAoc2hvd0RlbGV0aW9uTWFya2VycyB8fCAhZGlmZjIuaW5wdXRSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBkaWZmMi5pbnB1dFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzTmFtZTogZGlmZjIuaW5wdXRSYW5nZS5pc0VtcHR5KCkgPyBgbWVyZ2UtZWRpdG9yLWRpZmYtZW1wdHktd29yZCBiYXNlYCA6IGBtZXJnZS1lZGl0b3ItZGlmZi13b3JkIGJhc2VgLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiByYW5nZS50b0luY2x1c2l2ZVJhbmdlT3JFbXB0eSgpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lOiBibG9ja0NsYXNzTmFtZXMuam9pbignICcpLFxuXHRcdFx0XHRcdGJsb2NrUGFkZGluZyxcblx0XHRcdFx0XHRibG9ja0lzQWZ0ZXJFbmQ6IHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lcmdlIEVkaXRvcicsXG5cdFx0XHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXIsXG5cdFx0XHRcdFx0XHRjb2xvcjogeyBpZDogaXNIYW5kbGVkID8gaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciA6IHVuaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3ZlcnZpZXdSdWxlcjogbW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZyA/IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5DZW50ZXIsXG5cdFx0XHRcdFx0XHRjb2xvcjogeyBpZDogaXNIYW5kbGVkID8gaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciA6IHVuaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciB9LFxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsYUFBYTtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFzQixTQUFTLGtCQUFrQixl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O0FBRTlELFlBQUksT0FBeUI7QUFDN0IsWUFBSSxxQkFBcUI7QUFDeEIsZ0JBQU0sUUFBUSxTQUFTLGVBQWUsc0JBQXNCLHdCQUF3QixJQUFJLEdBQUcsTUFBTSxPQUFPLFFBQVEsR0FBRyxNQUFNLE9BQU8sS0FBSztBQUNySSxnQkFBTSxVQUFVLFNBQVMsc0JBQXNCLHNEQUFzRDtBQUNyRyxpQkFBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLFFBQVEsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO0FBQUEsUUFDL0M7QUFDQSxjQUFNLEtBQUssYUFBYSxhQUFhLEdBQUksT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUU7QUFBQSxNQUM3RCxDQUFDO0FBQUEsSUFDRjtBQUVBLFNBQUssVUFBVSwyQkFBMkIsS0FBSyxRQUFRLEtBQUssV0FBVyxDQUFDO0FBQUEsRUFDekU7QUEwRkQ7QUE3SWEscUJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbInJhbmdlIiwgInZpZXdNb2RlbCIsICJyZWFkZXIiXQp9Cg==
