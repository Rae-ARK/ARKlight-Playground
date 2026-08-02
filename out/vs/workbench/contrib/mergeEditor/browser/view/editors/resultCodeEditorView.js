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
import { reset } from "../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { CompareResult } from "../../../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived } from "../../../../../../base/common/observable.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { MergeEditorLineRange } from "../../model/lineRange.js";
import { applyObservableDecorations, join } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { ctxIsMergeResultEditor } from "../../../common/mergeEditor.js";
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from "./codeEditorView.js";
let ResultCodeEditorView = class extends CodeEditorView {
  constructor(viewModel, instantiationService, _labelService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this._labelService = _labelService;
    this.decorations = derived(this, (reader) => {
      const viewModel = this.viewModel.read(reader);
      if (!viewModel) {
        return [];
      }
      const model = viewModel.model;
      const textModel = model.resultTextModel;
      const result = new Array();
      const baseRangeWithStoreAndTouchingDiffs = join(
        model.modifiedBaseRanges.read(reader),
        model.baseResultDiffs.read(reader),
        (baseRange, diff) => baseRange.baseRange.intersectsOrTouches(diff.inputRange) ? CompareResult.neitherLessOrGreaterThan : MergeEditorLineRange.compareByStart(
          baseRange.baseRange,
          diff.inputRange
        )
      );
      const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
      const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
      for (const m of baseRangeWithStoreAndTouchingDiffs) {
        const modifiedBaseRange = m.left;
        if (modifiedBaseRange) {
          const blockClassNames = ["merge-editor-block"];
          let blockPadding = [0, 0, 0, 0];
          const isHandled = model.isHandled(modifiedBaseRange).read(reader);
          if (isHandled) {
            blockClassNames.push("handled");
          }
          if (modifiedBaseRange === activeModifiedBaseRange) {
            blockClassNames.push("focused");
            blockPadding = [0, 2, 0, 2];
          }
          if (modifiedBaseRange.isConflicting) {
            blockClassNames.push("conflicting");
          }
          blockClassNames.push("result");
          if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
            continue;
          }
          const range = model.getLineRangeInResult(modifiedBaseRange.baseRange, reader);
          result.push({
            range: range.toInclusiveRangeOrEmpty(),
            options: {
              showIfCollapsed: true,
              blockClassName: blockClassNames.join(" "),
              blockPadding,
              blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
              description: "Result Diff",
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
        if (!modifiedBaseRange || modifiedBaseRange.isConflicting) {
          for (const diff of m.rights) {
            const range = diff.outputRange.toInclusiveRange();
            if (range) {
              result.push({
                range,
                options: {
                  className: `merge-editor-diff result`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            if (diff.rangeMappings) {
              for (const d of diff.rangeMappings) {
                result.push({
                  range: d.outputRange,
                  options: {
                    className: `merge-editor-diff-word result`,
                    description: "Merge Editor"
                  }
                });
              }
            }
          }
        }
      }
      return result;
    });
    this.editor.invokeWithinContext((accessor) => {
      const contextKeyService = accessor.get(IContextKeyService);
      const isMergeResultEditor = ctxIsMergeResultEditor.bindTo(contextKeyService);
      isMergeResultEditor.set(true);
      this._register(toDisposable(() => isMergeResultEditor.reset()));
    });
    this.htmlElements.gutterDiv.style.width = "5px";
    this.htmlElements.root.classList.add(`result`);
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
    this._register(autorun((reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      this.editor.setModel(vm.model.resultTextModel);
      reset(this.htmlElements.title, ...renderLabelWithIcons(localize("result", "Result")));
      reset(this.htmlElements.description, ...renderLabelWithIcons(this._labelService.getUriLabel(vm.model.resultTextModel.uri, { relative: true })));
    }));
    const remainingConflictsActionBar = this._register(new ActionBar(this.htmlElements.detail));
    this._register(autorun((reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      const model = vm.model;
      if (!model) {
        return;
      }
      const count = model.unhandledConflictsCount.read(reader);
      const text = count === 1 ? localize(
        "mergeEditor.remainingConflicts",
        "{0} Conflict Remaining",
        count
      ) : localize(
        "mergeEditor.remainingConflict",
        "{0} Conflicts Remaining ",
        count
      );
      remainingConflictsActionBar.clear();
      remainingConflictsActionBar.push({
        class: void 0,
        enabled: count > 0,
        id: "nextConflict",
        label: text,
        run() {
          vm.model.telemetry.reportConflictCounterClicked();
          vm.goToNextModifiedBaseRange((m) => !model.isHandled(m).read(void 0));
        },
        tooltip: count > 0 ? localize("goToNextConflict", "Go to next conflict") : localize("allConflictHandled", "All conflicts handled, the merge can be completed now.")
      });
    }));
    this._register(applyObservableDecorations(this.editor, this.decorations));
    this._register(
      createSelectionsAutorun(
        this,
        (baseRange, viewModel2) => viewModel2.model.translateBaseRangeToResult(baseRange)
      )
    );
    this._register(
      instantiationService.createInstance(
        TitleMenu,
        MenuId.MergeInputResultToolbar,
        this.htmlElements.toolbar
      )
    );
  }
};
ResultCodeEditorView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IConfigurationService)
], ResultCodeEditorView);
export {
  ResultCodeEditorView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvdmlldy9lZGl0b3JzL3Jlc3VsdENvZGVFZGl0b3JWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IENvbXBhcmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBNaW5pbWFwUG9zaXRpb24sIE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi9tb2RlbC9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgYXBwbHlPYnNlcnZhYmxlRGVjb3JhdGlvbnMsIGpvaW4gfSBmcm9tICcuLi8uLi91dGlscy5qcyc7XG5pbXBvcnQgeyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yLCB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSBmcm9tICcuLi9jb2xvcnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3V0dGVyIH0gZnJvbSAnLi4vZWRpdG9yR3V0dGVyLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IGN0eElzTWVyZ2VSZXN1bHRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVyZ2VFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclZpZXcsIGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuLCBUaXRsZU1lbnUgfSBmcm9tICcuL2NvZGVFZGl0b3JWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIFJlc3VsdENvZGVFZGl0b3JWaWV3IGV4dGVuZHMgQ29kZUVkaXRvclZpZXcge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHR2aWV3TW9kZWw6IElPYnNlcnZhYmxlPE1lcmdlRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIHZpZXdNb2RlbCwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5lZGl0b3IuaW52b2tlV2l0aGluQ29udGV4dChhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaXNNZXJnZVJlc3VsdEVkaXRvciA9IGN0eElzTWVyZ2VSZXN1bHRFZGl0b3IuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGlzTWVyZ2VSZXN1bHRFZGl0b3Iuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGlzTWVyZ2VSZXN1bHRFZGl0b3IucmVzZXQoKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5odG1sRWxlbWVudHMuZ3V0dGVyRGl2LnN0eWxlLndpZHRoID0gJzVweCc7XG5cdFx0dGhpcy5odG1sRWxlbWVudHMucm9vdC5jbGFzc0xpc3QuYWRkKGByZXN1bHRgKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0YXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBjaGVja2JveGVzICovXG5cdFx0XHRcdGlmICh0aGlzLmNoZWNrYm94ZXNWaXNpYmxlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChuZXcgRWRpdG9yR3V0dGVyKHRoaXMuZWRpdG9yLCB0aGlzLmh0bWxFbGVtZW50cy5ndXR0ZXJEaXYsIHtcblx0XHRcdFx0XHRcdGdldEludGVyc2VjdGluZ0d1dHRlckl0ZW1zOiAocmFuZ2UsIHJlYWRlcikgPT4gW10sXG5cdFx0XHRcdFx0XHRjcmVhdGVWaWV3OiAoaXRlbSwgdGFyZ2V0KSA9PiB7IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTsgfSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIGxhYmVscyAmIHRleHQgbW9kZWwgKi9cblx0XHRcdGNvbnN0IHZtID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF2bSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRNb2RlbCh2bS5tb2RlbC5yZXN1bHRUZXh0TW9kZWwpO1xuXHRcdFx0cmVzZXQodGhpcy5odG1sRWxlbWVudHMudGl0bGUsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGxvY2FsaXplKCdyZXN1bHQnLCAnUmVzdWx0JykpKTtcblx0XHRcdHJlc2V0KHRoaXMuaHRtbEVsZW1lbnRzLmRlc2NyaXB0aW9uLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyh0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodm0ubW9kZWwucmVzdWx0VGV4dE1vZGVsLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSkpO1xuXHRcdH0pKTtcblxuXG5cdFx0Y29uc3QgcmVtYWluaW5nQ29uZmxpY3RzQWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0aGlzLmh0bWxFbGVtZW50cy5kZXRhaWwpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHJlbWFpbmluZ0NvbmZsaWN0cyBsYWJlbCAqL1xuXHRcdFx0Y29uc3Qgdm0gPSB0aGlzLnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSB2bS5tb2RlbDtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC51bmhhbmRsZWRDb25mbGljdHNDb3VudC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHRleHQgPSBjb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdtZXJnZUVkaXRvci5yZW1haW5pbmdDb25mbGljdHMnLFxuXHRcdFx0XHRcdCd7MH0gQ29uZmxpY3QgUmVtYWluaW5nJyxcblx0XHRcdFx0XHRjb3VudFxuXHRcdFx0XHQpXG5cdFx0XHRcdDogbG9jYWxpemUoXG5cdFx0XHRcdFx0J21lcmdlRWRpdG9yLnJlbWFpbmluZ0NvbmZsaWN0Jyxcblx0XHRcdFx0XHQnezB9IENvbmZsaWN0cyBSZW1haW5pbmcgJyxcblx0XHRcdFx0XHRjb3VudFxuXHRcdFx0XHQpO1xuXG5cdFx0XHRyZW1haW5pbmdDb25mbGljdHNBY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRcdHJlbWFpbmluZ0NvbmZsaWN0c0FjdGlvbkJhci5wdXNoKHtcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogY291bnQgPiAwLFxuXHRcdFx0XHRpZDogJ25leHRDb25mbGljdCcsXG5cdFx0XHRcdGxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRydW4oKSB7XG5cdFx0XHRcdFx0dm0ubW9kZWwudGVsZW1ldHJ5LnJlcG9ydENvbmZsaWN0Q291bnRlckNsaWNrZWQoKTtcblx0XHRcdFx0XHR2bS5nb1RvTmV4dE1vZGlmaWVkQmFzZVJhbmdlKG0gPT4gIW1vZGVsLmlzSGFuZGxlZChtKS5yZWFkKHVuZGVmaW5lZCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sdGlwOiBjb3VudCA+IDBcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdnb1RvTmV4dENvbmZsaWN0JywgJ0dvIHRvIG5leHQgY29uZmxpY3QnKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FsbENvbmZsaWN0SGFuZGxlZCcsICdBbGwgY29uZmxpY3RzIGhhbmRsZWQsIHRoZSBtZXJnZSBjYW4gYmUgY29tcGxldGVkIG5vdy4nKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlPYnNlcnZhYmxlRGVjb3JhdGlvbnModGhpcy5lZGl0b3IsIHRoaXMuZGVjb3JhdGlvbnMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0Y3JlYXRlU2VsZWN0aW9uc0F1dG9ydW4odGhpcywgKGJhc2VSYW5nZSwgdmlld01vZGVsKSA9PlxuXHRcdFx0XHR2aWV3TW9kZWwubW9kZWwudHJhbnNsYXRlQmFzZVJhbmdlVG9SZXN1bHQoYmFzZVJhbmdlKVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRUaXRsZU1lbnUsXG5cdFx0XHRcdE1lbnVJZC5NZXJnZUlucHV0UmVzdWx0VG9vbGJhcixcblx0XHRcdFx0dGhpcy5odG1sRWxlbWVudHMudG9vbGJhclxuXHRcdFx0KVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBtb2RlbC5yZXN1bHRUZXh0TW9kZWw7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PElNb2RlbERlbHRhRGVjb3JhdGlvbj4oKTtcblxuXHRcdGNvbnN0IGJhc2VSYW5nZVdpdGhTdG9yZUFuZFRvdWNoaW5nRGlmZnMgPSBqb2luKFxuXHRcdFx0bW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLnJlYWQocmVhZGVyKSxcblx0XHRcdG1vZGVsLmJhc2VSZXN1bHREaWZmcy5yZWFkKHJlYWRlciksXG5cdFx0XHQoYmFzZVJhbmdlLCBkaWZmKSA9PiBiYXNlUmFuZ2UuYmFzZVJhbmdlLmludGVyc2VjdHNPclRvdWNoZXMoZGlmZi5pbnB1dFJhbmdlKVxuXHRcdFx0XHQ/IENvbXBhcmVSZXN1bHQubmVpdGhlckxlc3NPckdyZWF0ZXJUaGFuXG5cdFx0XHRcdDogTWVyZ2VFZGl0b3JMaW5lUmFuZ2UuY29tcGFyZUJ5U3RhcnQoXG5cdFx0XHRcdFx0YmFzZVJhbmdlLmJhc2VSYW5nZSxcblx0XHRcdFx0XHRkaWZmLmlucHV0UmFuZ2Vcblx0XHRcdFx0KVxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IHZpZXdNb2RlbC5hY3RpdmVNb2RpZmllZEJhc2VSYW5nZS5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzID0gdmlld01vZGVsLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXMucmVhZChyZWFkZXIpO1xuXG5cdFx0Zm9yIChjb25zdCBtIG9mIGJhc2VSYW5nZVdpdGhTdG9yZUFuZFRvdWNoaW5nRGlmZnMpIHtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQmFzZVJhbmdlID0gbS5sZWZ0O1xuXG5cdFx0XHRpZiAobW9kaWZpZWRCYXNlUmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgYmxvY2tDbGFzc05hbWVzID0gWydtZXJnZS1lZGl0b3ItYmxvY2snXTtcblx0XHRcdFx0bGV0IGJsb2NrUGFkZGluZzogW3RvcDogbnVtYmVyLCByaWdodDogbnVtYmVyLCBib3R0b206IG51bWJlciwgbGVmdDogbnVtYmVyXSA9IFswLCAwLCAwLCAwXTtcblx0XHRcdFx0Y29uc3QgaXNIYW5kbGVkID0gbW9kZWwuaXNIYW5kbGVkKG1vZGlmaWVkQmFzZVJhbmdlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChpc0hhbmRsZWQpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnaGFuZGxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RpZmllZEJhc2VSYW5nZSA9PT0gYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnZm9jdXNlZCcpO1xuXHRcdFx0XHRcdGJsb2NrUGFkZGluZyA9IFswLCAyLCAwLCAyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZykge1xuXHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKCdjb25mbGljdGluZycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKCdyZXN1bHQnKTtcblxuXHRcdFx0XHRpZiAoIW1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgJiYgIXNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgJiYgaXNIYW5kbGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLmdldExpbmVSYW5nZUluUmVzdWx0KG1vZGlmaWVkQmFzZVJhbmdlLmJhc2VSYW5nZSwgcmVhZGVyKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlOiByYW5nZS50b0luY2x1c2l2ZVJhbmdlT3JFbXB0eSgpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lOiBibG9ja0NsYXNzTmFtZXMuam9pbignICcpLFxuXHRcdFx0XHRcdFx0YmxvY2tQYWRkaW5nLFxuXHRcdFx0XHRcdFx0YmxvY2tJc0FmdGVyRW5kOiByYW5nZS5zdGFydExpbmVOdW1iZXIgPiB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Jlc3VsdCBEaWZmJyxcblx0XHRcdFx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXIsXG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB7IGlkOiBpc0hhbmRsZWQgPyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIDogdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3ZlcnZpZXdSdWxlcjogbW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZyA/IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlcixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHsgaWQ6IGlzSGFuZGxlZCA/IGhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgOiB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSxcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW1vZGlmaWVkQmFzZVJhbmdlIHx8IG1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkaWZmIG9mIG0ucmlnaHRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBkaWZmLm91dHB1dFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKTtcblx0XHRcdFx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGBtZXJnZS1lZGl0b3ItZGlmZiByZXN1bHRgLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVyZ2UgRWRpdG9yJyxcblx0XHRcdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGRpZmYucmFuZ2VNYXBwaW5ncykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIGRpZmYucmFuZ2VNYXBwaW5ncykge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IGQub3V0cHV0UmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBgbWVyZ2UtZWRpdG9yLWRpZmYtd29yZCByZXN1bHRgLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFNBQVMsa0JBQWtCLGVBQTRCO0FBQ2hFLFNBQWdDLGlCQUFpQix5QkFBeUI7QUFDMUUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCLFlBQVk7QUFDakQsU0FBUywwQ0FBMEMsa0RBQWtEO0FBQ3JHLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNB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QUFNLEtBQUssYUFBYSxPQUFPLEdBQUcscUJBQXFCLFNBQVMsVUFBVSxRQUFRLENBQUMsQ0FBQztBQUNwRixZQUFNLEtBQUssYUFBYSxhQUFhLEdBQUcscUJBQXFCLEtBQUssY0FBYyxZQUFZLEdBQUcsTUFBTSxnQkFBZ0IsS0FBSyxFQUFFLFVBQVUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQy9JLENBQUMsQ0FBQztBQUdGLFVBQU0sOEJBQThCLEtBQUssVUFBVSxJQUFJLFVBQVUsS0FBSyxhQUFhLE1BQU0sQ0FBQztBQUUxRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBRWhDLFlBQU0sS0FBSyxLQUFLLFVBQVUsS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxNQUNEO0FBRUEsWUFBTSxRQUFRLEdBQUc7QUFDakIsVUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsTUFBTSx3QkFBd0IsS0FBSyxNQUFNO0FBRXZELFlBQU0sT0FBTyxVQUFVLElBQ3BCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxJQUNFO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVELGtDQUE0QixNQUFNO0FBQ2xDLGtDQUE0QixLQUFLO0FBQUEsUUFDaEMsT0FBTztBQUFBLFFBQ1AsU0FBUyxRQUFRO0FBQUEsUUFDakIsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsTUFBTTtBQUNMLGFBQUcsTUFBTSxVQUFVLDZCQUE2QjtBQUNoRCxhQUFHLDBCQUEwQixPQUFLLENBQUMsTUFBTSxVQUFVLENBQUMsRUFBRSxLQUFLLE1BQVMsQ0FBQztBQUFBLFFBQ3RFO0FBQUEsUUFDQSxTQUFTLFFBQVEsSUFDZCxTQUFTLG9CQUFvQixxQkFBcUIsSUFDbEQsU0FBUyxzQkFBc0Isd0RBQXdEO0FBQUEsTUFDM0YsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLDJCQUEyQixLQUFLLFFBQVEsS0FBSyxXQUFXLENBQUM7QUFFeEUsU0FBSztBQUFBLE1BQ0o7QUFBQSxRQUF3QjtBQUFBLFFBQU0sQ0FBQyxXQUFXQyxlQUN6Q0EsV0FBVSxNQUFNLDJCQUEyQixTQUFTO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBRUEsU0FBSztBQUFBLE1BQ0oscUJBQXFCO0FBQUEsUUFDcEI7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLEtBQUssYUFBYTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFvR0Q7QUExTWEsdUJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiLCAidmlld01vZGVsIl0KfQo=
