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
import { addDisposableListener, EventType, h, reset } from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Toggle } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { Action, Separator } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import { autorun, autorunOpts, derived, derivedOpts, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { noBreakWhitespace } from "../../../../../../base/common/strings.js";
import { isDefined } from "../../../../../../base/common/types.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { defaultToggleStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { InputState } from "../../model/modifiedBaseRange.js";
import { applyObservableDecorations, setFields } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from "./codeEditorView.js";
let InputCodeEditorView = class extends CodeEditorView {
  constructor(inputNumber, viewModel, instantiationService, contextMenuService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this.inputNumber = inputNumber;
    this.otherInputNumber = this.inputNumber === 1 ? 2 : 1;
    this.modifiedBaseRangeGutterItemInfos = derivedOpts({ debugName: `input${this.inputNumber}.modifiedBaseRangeGutterItemInfos` }, (reader) => {
      const viewModel2 = this.viewModel.read(reader);
      if (!viewModel2) {
        return [];
      }
      const model = viewModel2.model;
      const inputNumber2 = this.inputNumber;
      const showNonConflictingChanges = viewModel2.showNonConflictingChanges.read(reader);
      return model.modifiedBaseRanges.read(reader).filter((r) => r.getInputDiffs(this.inputNumber).length > 0 && (showNonConflictingChanges || r.isConflicting || !model.isHandled(r).read(reader))).map((baseRange, idx) => new ModifiedBaseRangeGutterItemModel(idx.toString(), baseRange, inputNumber2, viewModel2));
    });
    this.decorations = derivedOpts({ debugName: `input${this.inputNumber}.decorations` }, (reader) => {
      const viewModel2 = this.viewModel.read(reader);
      if (!viewModel2) {
        return [];
      }
      const model = viewModel2.model;
      const textModel = (this.inputNumber === 1 ? model.input1 : model.input2).textModel;
      const activeModifiedBaseRange = viewModel2.activeModifiedBaseRange.read(reader);
      const result = new Array();
      const showNonConflictingChanges = viewModel2.showNonConflictingChanges.read(reader);
      const showDeletionMarkers = this.showDeletionMarkers.read(reader);
      const diffWithThis = viewModel2.baseCodeEditorView.read(reader) !== void 0 && viewModel2.baseShowDiffAgainst.read(reader) === this.inputNumber;
      const useSimplifiedDecorations = !diffWithThis && this.useSimplifiedDecorations.read(reader);
      for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
        const range = modifiedBaseRange.getInputRange(this.inputNumber);
        if (!range) {
          continue;
        }
        const blockClassNames = ["merge-editor-block"];
        let blockPadding = [0, 0, 0, 0];
        const isHandled = model.isInputHandled(modifiedBaseRange, this.inputNumber).read(reader);
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
        const inputClassName = this.inputNumber === 1 ? "input i1" : "input i2";
        blockClassNames.push(inputClassName);
        if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
          continue;
        }
        if (useSimplifiedDecorations && !isHandled) {
          blockClassNames.push("use-simplified-decorations");
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
        if (!useSimplifiedDecorations && (modifiedBaseRange.isConflicting || !model.isHandled(modifiedBaseRange).read(reader))) {
          const inputDiffs = modifiedBaseRange.getInputDiffs(this.inputNumber);
          for (const diff of inputDiffs) {
            const range2 = diff.outputRange.toInclusiveRange();
            if (range2) {
              result.push({
                range: range2,
                options: {
                  className: `merge-editor-diff ${inputClassName}`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            if (diff.rangeMappings) {
              for (const d of diff.rangeMappings) {
                if (showDeletionMarkers || !d.outputRange.isEmpty()) {
                  result.push({
                    range: d.outputRange,
                    options: {
                      className: d.outputRange.isEmpty() ? `merge-editor-diff-empty-word ${inputClassName}` : `merge-editor-diff-word ${inputClassName}`,
                      description: "Merge Editor",
                      showIfCollapsed: true
                    }
                  });
                }
              }
            }
          }
        }
      }
      return result;
    });
    this.htmlElements.root.classList.add(`input`);
    this._register(
      new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
        getIntersectingGutterItems: (range, reader) => {
          if (this.checkboxesVisible.read(reader)) {
            return this.modifiedBaseRangeGutterItemInfos.read(reader);
          } else {
            return [];
          }
        },
        createView: (item, target) => new MergeConflictGutterItemView(item, target, contextMenuService)
      })
    );
    this._register(
      createSelectionsAutorun(
        this,
        (baseRange, viewModel2) => viewModel2.model.translateBaseRangeToInput(this.inputNumber, baseRange)
      )
    );
    this._register(
      instantiationService.createInstance(
        TitleMenu,
        inputNumber === 1 ? MenuId.MergeInput1Toolbar : MenuId.MergeInput2Toolbar,
        this.htmlElements.toolbar
      )
    );
    this._register(autorunOpts({ debugName: `input${this.inputNumber}: update labels & text model` }, (reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      this.editor.setModel(this.inputNumber === 1 ? vm.model.input1.textModel : vm.model.input2.textModel);
      const title = this.inputNumber === 1 ? vm.model.input1.title || localize("input1", "Input 1") : vm.model.input2.title || localize("input2", "Input 2");
      const description = this.inputNumber === 1 ? vm.model.input1.description : vm.model.input2.description;
      const detail = this.inputNumber === 1 ? vm.model.input1.detail : vm.model.input2.detail;
      reset(this.htmlElements.title, ...renderLabelWithIcons(title));
      reset(this.htmlElements.description, ...description ? renderLabelWithIcons(description) : []);
      reset(this.htmlElements.detail, ...detail ? renderLabelWithIcons(detail) : []);
    }));
    this._register(applyObservableDecorations(this.editor, this.decorations));
  }
};
InputCodeEditorView = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService)
], InputCodeEditorView);
class ModifiedBaseRangeGutterItemModel {
  constructor(id, baseRange, inputNumber, viewModel) {
    this.id = id;
    this.baseRange = baseRange;
    this.inputNumber = inputNumber;
    this.viewModel = viewModel;
    this.model = this.viewModel.model;
    this.range = this.baseRange.getInputRange(this.inputNumber);
    this.enabled = this.model.isUpToDate;
    this.toggleState = derived(this, (reader) => {
      const input = this.model.getState(this.baseRange).read(reader).getInput(this.inputNumber);
      return input === InputState.second && !this.baseRange.isOrderRelevant ? InputState.first : input;
    });
    this.state = derived(this, (reader) => {
      const active = this.viewModel.activeModifiedBaseRange.read(reader);
      if (!this.model.hasBaseRange(this.baseRange)) {
        return { handled: false, focused: false };
      }
      return {
        handled: this.model.isHandled(this.baseRange).read(reader),
        focused: this.baseRange === active
      };
    });
  }
  setState(value, tx) {
    this.viewModel.setState(
      this.baseRange,
      this.model.getState(this.baseRange).get().withInputValue(this.inputNumber, value),
      tx,
      this.inputNumber
    );
  }
  toggleBothSides() {
    transaction((tx) => {
      const state = this.model.getState(this.baseRange).get();
      this.model.setState(
        this.baseRange,
        state.toggle(this.inputNumber).toggle(this.inputNumber === 1 ? 2 : 1),
        true,
        tx
      );
    });
  }
  getContextMenuActions() {
    const state = this.model.getState(this.baseRange).get();
    const handled = this.model.isHandled(this.baseRange).get();
    const update = (newState) => {
      transaction((tx) => {
        return this.viewModel.setState(this.baseRange, newState, tx, this.inputNumber);
      });
    };
    function action(id, label, targetState, checked) {
      const action2 = new Action(id, label, void 0, true, () => {
        update(targetState);
      });
      action2.checked = checked;
      return action2;
    }
    const both = state.includesInput1 && state.includesInput2;
    return [
      this.baseRange.input1Diffs.length > 0 ? action(
        "mergeEditor.acceptInput1",
        localize("mergeEditor.accept", "Accept {0}", this.model.input1.title),
        state.toggle(1),
        state.includesInput1
      ) : void 0,
      this.baseRange.input2Diffs.length > 0 ? action(
        "mergeEditor.acceptInput2",
        localize("mergeEditor.accept", "Accept {0}", this.model.input2.title),
        state.toggle(2),
        state.includesInput2
      ) : void 0,
      this.baseRange.isConflicting ? setFields(
        action(
          "mergeEditor.acceptBoth",
          localize(
            "mergeEditor.acceptBoth",
            "Accept Both"
          ),
          state.withInputValue(1, !both).withInputValue(2, !both),
          both
        ),
        { enabled: this.baseRange.canBeCombined }
      ) : void 0,
      new Separator(),
      this.baseRange.isConflicting ? setFields(
        action(
          "mergeEditor.swap",
          localize("mergeEditor.swap", "Swap"),
          state.swap(),
          false
        ),
        { enabled: !state.kind && (!both || this.baseRange.isOrderRelevant) }
      ) : void 0,
      setFields(
        new Action(
          "mergeEditor.markAsHandled",
          localize("mergeEditor.markAsHandled", "Mark as Handled"),
          void 0,
          true,
          () => {
            transaction((tx) => {
              this.model.setHandled(this.baseRange, !handled, tx);
            });
          }
        ),
        { checked: handled }
      )
    ].filter(isDefined);
  }
}
class MergeConflictGutterItemView extends Disposable {
  constructor(item, target, contextMenuService) {
    super();
    this.isMultiLine = observableValue(this, false);
    this.item = observableValue(this, item);
    const checkBox = new Toggle({
      isChecked: false,
      title: "",
      icon: Codicon.check,
      ...defaultToggleStyles
    });
    checkBox.domNode.classList.add("accept-conflict-group");
    this._register(
      addDisposableListener(checkBox.domNode, EventType.MOUSE_DOWN, (e) => {
        const item2 = this.item.get();
        if (!item2) {
          return;
        }
        if (e.button === /* Right */
        2) {
          e.stopPropagation();
          e.preventDefault();
          contextMenuService.showContextMenu({
            getAnchor: () => checkBox.domNode,
            getActions: () => item2.getContextMenuActions()
          });
        } else if (e.button === /* Middle */
        1) {
          e.stopPropagation();
          e.preventDefault();
          item2.toggleBothSides();
        }
      })
    );
    this._register(
      autorun((reader) => {
        const item2 = this.item.read(reader);
        const value = item2.toggleState.read(reader);
        const iconMap = {
          [InputState.excluded]: { icon: void 0, checked: false, title: localize("accept.excluded", "Accept") },
          [InputState.unrecognized]: { icon: Codicon.circleFilled, checked: false, title: localize("accept.conflicting", "Accept (result is dirty)") },
          [InputState.first]: { icon: Codicon.check, checked: true, title: localize("accept.first", "Undo accept") },
          [InputState.second]: { icon: Codicon.checkAll, checked: true, title: localize("accept.second", "Undo accept (currently second)") }
        };
        const state = iconMap[value];
        checkBox.setIcon(state.icon);
        checkBox.checked = state.checked;
        checkBox.setTitle(state.title);
        if (!item2.enabled.read(reader)) {
          checkBox.disable();
        } else {
          checkBox.enable();
        }
      })
    );
    this._register(autorun((reader) => {
      const state = this.item.read(reader).state.read(reader);
      const classNames = [
        "merge-accept-gutter-marker",
        state.handled && "handled",
        state.focused && "focused",
        this.isMultiLine.read(reader) ? "multi-line" : "single-line"
      ];
      target.className = classNames.filter((c) => typeof c === "string").join(" ");
    }));
    this._register(checkBox.onChange(() => {
      transaction((tx) => {
        this.item.get().setState(checkBox.checked, tx);
      });
    }));
    target.appendChild(h("div.background", [noBreakWhitespace]).root);
    target.appendChild(
      this.checkboxDiv = h("div.checkbox", [h("div.checkbox-background", [checkBox.domNode])]).root
    );
  }
  layout(top, height, viewTop, viewHeight) {
    const checkboxHeight = this.checkboxDiv.clientHeight;
    const middleHeight = height / 2 - checkboxHeight / 2;
    const margin = checkboxHeight;
    let effectiveCheckboxTop = top + middleHeight;
    const preferredViewPortRange = [
      margin,
      viewTop + viewHeight - margin - checkboxHeight
    ];
    const preferredParentRange = [
      top + margin,
      top + height - checkboxHeight - margin
    ];
    if (preferredParentRange[0] < preferredParentRange[1]) {
      effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredViewPortRange[0], preferredViewPortRange[1]);
      effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredParentRange[0], preferredParentRange[1]);
    }
    this.checkboxDiv.style.top = `${effectiveCheckboxTop - top}px`;
    transaction((tx) => {
      this.isMultiLine.set(height > 30, tx);
    });
  }
  update(baseRange) {
    transaction((tx) => {
      this.item.set(baseRange, tx);
    });
  }
}
export {
  InputCodeEditorView,
  MergeConflictGutterItemView,
  ModifiedBaseRangeGutterItemModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvdmlldy9lZGl0b3JzL2lucHV0Q29kZUVkaXRvclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgaCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1bk9wdHMsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBub0JyZWFrV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgTWluaW1hcFBvc2l0aW9uLCBPdmVydmlld1J1bGVyTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJbnB1dFN0YXRlLCBNb2RpZmllZEJhc2VSYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSB9IGZyb20gJy4uLy4uL21vZGVsL21vZGlmaWVkQmFzZVJhbmdlLmpzJztcbmltcG9ydCB7IGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zLCBzZXRGaWVsZHMgfSBmcm9tICcuLi8uLi91dGlscy5qcyc7XG5pbXBvcnQgeyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yLCB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSBmcm9tICcuLi9jb2xvcnMuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3V0dGVyLCBJR3V0dGVySXRlbUluZm8sIElHdXR0ZXJJdGVtVmlldyB9IGZyb20gJy4uL2VkaXRvckd1dHRlci5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yVmlldywgY3JlYXRlU2VsZWN0aW9uc0F1dG9ydW4sIFRpdGxlTWVudSB9IGZyb20gJy4vY29kZUVkaXRvclZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5wdXRDb2RlRWRpdG9yVmlldyBleHRlbmRzIENvZGVFZGl0b3JWaWV3IHtcblx0cHVibGljIHJlYWRvbmx5IG90aGVySW5wdXROdW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGlucHV0TnVtYmVyOiAxIHwgMixcblx0XHR2aWV3TW9kZWw6IElPYnNlcnZhYmxlPE1lcmdlRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIHZpZXdNb2RlbCwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMub3RoZXJJbnB1dE51bWJlciA9IHRoaXMuaW5wdXROdW1iZXIgPT09IDEgPyAyIDogMTtcblx0XHR0aGlzLm1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbUluZm9zID0gZGVyaXZlZE9wdHMoeyBkZWJ1Z05hbWU6IGBpbnB1dCR7dGhpcy5pbnB1dE51bWJlcn0ubW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtSW5mb3NgIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkgeyByZXR1cm4gW107IH1cblx0XHRcdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXHRcdFx0Y29uc3QgaW5wdXROdW1iZXIgPSB0aGlzLmlucHV0TnVtYmVyO1xuXG5cdFx0XHRjb25zdCBzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzID0gdmlld01vZGVsLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRyZXR1cm4gbW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQuZmlsdGVyKChyKSA9PiByLmdldElucHV0RGlmZnModGhpcy5pbnB1dE51bWJlcikubGVuZ3RoID4gMCAmJiAoc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyB8fCByLmlzQ29uZmxpY3RpbmcgfHwgIW1vZGVsLmlzSGFuZGxlZChyKS5yZWFkKHJlYWRlcikpKVxuXHRcdFx0XHQubWFwKChiYXNlUmFuZ2UsIGlkeCkgPT4gbmV3IE1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbU1vZGVsKGlkeC50b1N0cmluZygpLCBiYXNlUmFuZ2UsIGlucHV0TnVtYmVyLCB2aWV3TW9kZWwpKTtcblx0XHR9KTtcblx0XHR0aGlzLmRlY29yYXRpb25zID0gZGVyaXZlZE9wdHMoeyBkZWJ1Z05hbWU6IGBpbnB1dCR7dGhpcy5pbnB1dE51bWJlcn0uZGVjb3JhdGlvbnNgIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9ICh0aGlzLmlucHV0TnVtYmVyID09PSAxID8gbW9kZWwuaW5wdXQxIDogbW9kZWwuaW5wdXQyKS50ZXh0TW9kZWw7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlID0gdmlld01vZGVsLmFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PElNb2RlbERlbHRhRGVjb3JhdGlvbj4oKTtcblxuXHRcdFx0Y29uc3Qgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IHZpZXdNb2RlbC5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNob3dEZWxldGlvbk1hcmtlcnMgPSB0aGlzLnNob3dEZWxldGlvbk1hcmtlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZGlmZldpdGhUaGlzID0gdmlld01vZGVsLmJhc2VDb2RlRWRpdG9yVmlldy5yZWFkKHJlYWRlcikgIT09IHVuZGVmaW5lZCAmJiB2aWV3TW9kZWwuYmFzZVNob3dEaWZmQWdhaW5zdC5yZWFkKHJlYWRlcikgPT09IHRoaXMuaW5wdXROdW1iZXI7XG5cdFx0XHRjb25zdCB1c2VTaW1wbGlmaWVkRGVjb3JhdGlvbnMgPSAhZGlmZldpdGhUaGlzICYmIHRoaXMudXNlU2ltcGxpZmllZERlY29yYXRpb25zLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Zm9yIChjb25zdCBtb2RpZmllZEJhc2VSYW5nZSBvZiBtb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gbW9kaWZpZWRCYXNlUmFuZ2UuZ2V0SW5wdXRSYW5nZSh0aGlzLmlucHV0TnVtYmVyKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYmxvY2tDbGFzc05hbWVzID0gWydtZXJnZS1lZGl0b3ItYmxvY2snXTtcblx0XHRcdFx0bGV0IGJsb2NrUGFkZGluZzogW3RvcDogbnVtYmVyLCByaWdodDogbnVtYmVyLCBib3R0b206IG51bWJlciwgbGVmdDogbnVtYmVyXSA9IFswLCAwLCAwLCAwXTtcblx0XHRcdFx0Y29uc3QgaXNIYW5kbGVkID0gbW9kZWwuaXNJbnB1dEhhbmRsZWQobW9kaWZpZWRCYXNlUmFuZ2UsIHRoaXMuaW5wdXROdW1iZXIpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGlzSGFuZGxlZCkge1xuXHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKCdoYW5kbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlID09PSBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSkge1xuXHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKCdmb2N1c2VkJyk7XG5cdFx0XHRcdFx0YmxvY2tQYWRkaW5nID0gWzAsIDIsIDAsIDJdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nKSB7XG5cdFx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2NvbmZsaWN0aW5nJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW5wdXRDbGFzc05hbWUgPSB0aGlzLmlucHV0TnVtYmVyID09PSAxID8gJ2lucHV0IGkxJyA6ICdpbnB1dCBpMic7XG5cdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKGlucHV0Q2xhc3NOYW1lKTtcblxuXHRcdFx0XHRpZiAoIW1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgJiYgIXNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgJiYgaXNIYW5kbGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodXNlU2ltcGxpZmllZERlY29yYXRpb25zICYmICFpc0hhbmRsZWQpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgndXNlLXNpbXBsaWZpZWQtZGVjb3JhdGlvbnMnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZTogcmFuZ2UudG9JbmNsdXNpdmVSYW5nZU9yRW1wdHkoKSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZTogYmxvY2tDbGFzc05hbWVzLmpvaW4oJyAnKSxcblx0XHRcdFx0XHRcdGJsb2NrUGFkZGluZyxcblx0XHRcdFx0XHRcdGJsb2NrSXNBZnRlckVuZDogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gdGV4dE1vZGVsLmdldExpbmVDb3VudCgpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InLFxuXHRcdFx0XHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogTWluaW1hcFBvc2l0aW9uLkd1dHRlcixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHsgaWQ6IGlzSGFuZGxlZCA/IGhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgOiB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvdmVydmlld1J1bGVyOiBtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nID8ge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogeyBpZDogaXNIYW5kbGVkID8gaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciA6IHVuaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciB9LFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCF1c2VTaW1wbGlmaWVkRGVjb3JhdGlvbnMgJiYgKG1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgfHwgIW1vZGVsLmlzSGFuZGxlZChtb2RpZmllZEJhc2VSYW5nZSkucmVhZChyZWFkZXIpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0RGlmZnMgPSBtb2RpZmllZEJhc2VSYW5nZS5nZXRJbnB1dERpZmZzKHRoaXMuaW5wdXROdW1iZXIpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiBpbnB1dERpZmZzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByYW5nZSA9IGRpZmYub3V0cHV0UmFuZ2UudG9JbmNsdXNpdmVSYW5nZSgpO1xuXHRcdFx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGBtZXJnZS1lZGl0b3ItZGlmZiAke2lucHV0Q2xhc3NOYW1lfWAsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lcmdlIEVkaXRvcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoZGlmZi5yYW5nZU1hcHBpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgZCBvZiBkaWZmLnJhbmdlTWFwcGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc2hvd0RlbGV0aW9uTWFya2VycyB8fCAhZC5vdXRwdXRSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IGQub3V0cHV0UmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGQub3V0cHV0UmFuZ2UuaXNFbXB0eSgpID8gYG1lcmdlLWVkaXRvci1kaWZmLWVtcHR5LXdvcmQgJHtpbnB1dENsYXNzTmFtZX1gIDogYG1lcmdlLWVkaXRvci1kaWZmLXdvcmQgJHtpbnB1dENsYXNzTmFtZX1gLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVyZ2UgRWRpdG9yJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdHRoaXMuaHRtbEVsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LmFkZChgaW5wdXRgKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0bmV3IEVkaXRvckd1dHRlcih0aGlzLmVkaXRvciwgdGhpcy5odG1sRWxlbWVudHMuZ3V0dGVyRGl2LCB7XG5cdFx0XHRcdGdldEludGVyc2VjdGluZ0d1dHRlckl0ZW1zOiAocmFuZ2UsIHJlYWRlcikgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNoZWNrYm94ZXNWaXNpYmxlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtSW5mb3MucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjcmVhdGVWaWV3OiAoaXRlbSwgdGFyZ2V0KSA9PiBuZXcgTWVyZ2VDb25mbGljdEd1dHRlckl0ZW1WaWV3KGl0ZW0sIHRhcmdldCwgY29udGV4dE1lbnVTZXJ2aWNlKSxcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0Y3JlYXRlU2VsZWN0aW9uc0F1dG9ydW4odGhpcywgKGJhc2VSYW5nZSwgdmlld01vZGVsKSA9PlxuXHRcdFx0XHR2aWV3TW9kZWwubW9kZWwudHJhbnNsYXRlQmFzZVJhbmdlVG9JbnB1dCh0aGlzLmlucHV0TnVtYmVyLCBiYXNlUmFuZ2UpXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFRpdGxlTWVudSxcblx0XHRcdFx0aW5wdXROdW1iZXIgPT09IDEgPyBNZW51SWQuTWVyZ2VJbnB1dDFUb29sYmFyIDogTWVudUlkLk1lcmdlSW5wdXQyVG9vbGJhcixcblx0XHRcdFx0dGhpcy5odG1sRWxlbWVudHMudG9vbGJhclxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuT3B0cyh7IGRlYnVnTmFtZTogYGlucHV0JHt0aGlzLmlucHV0TnVtYmVyfTogdXBkYXRlIGxhYmVscyAmIHRleHQgbW9kZWxgIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2bSA9IHRoaXMudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdm0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVkaXRvci5zZXRNb2RlbCh0aGlzLmlucHV0TnVtYmVyID09PSAxID8gdm0ubW9kZWwuaW5wdXQxLnRleHRNb2RlbCA6IHZtLm1vZGVsLmlucHV0Mi50ZXh0TW9kZWwpO1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuaW5wdXROdW1iZXIgPT09IDFcblx0XHRcdFx0PyB2bS5tb2RlbC5pbnB1dDEudGl0bGUgfHwgbG9jYWxpemUoJ2lucHV0MScsICdJbnB1dCAxJylcblx0XHRcdFx0OiB2bS5tb2RlbC5pbnB1dDIudGl0bGUgfHwgbG9jYWxpemUoJ2lucHV0MicsICdJbnB1dCAyJyk7XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5pbnB1dE51bWJlciA9PT0gMVxuXHRcdFx0XHQ/IHZtLm1vZGVsLmlucHV0MS5kZXNjcmlwdGlvblxuXHRcdFx0XHQ6IHZtLm1vZGVsLmlucHV0Mi5kZXNjcmlwdGlvbjtcblxuXHRcdFx0Y29uc3QgZGV0YWlsID0gdGhpcy5pbnB1dE51bWJlciA9PT0gMVxuXHRcdFx0XHQ/IHZtLm1vZGVsLmlucHV0MS5kZXRhaWxcblx0XHRcdFx0OiB2bS5tb2RlbC5pbnB1dDIuZGV0YWlsO1xuXG5cdFx0XHRyZXNldCh0aGlzLmh0bWxFbGVtZW50cy50aXRsZSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnModGl0bGUpKTtcblx0XHRcdHJlc2V0KHRoaXMuaHRtbEVsZW1lbnRzLmRlc2NyaXB0aW9uLCAuLi4oZGVzY3JpcHRpb24gPyByZW5kZXJMYWJlbFdpdGhJY29ucyhkZXNjcmlwdGlvbikgOiBbXSkpO1xuXHRcdFx0cmVzZXQodGhpcy5odG1sRWxlbWVudHMuZGV0YWlsLCAuLi4oZGV0YWlsID8gcmVuZGVyTGFiZWxXaXRoSWNvbnMoZGV0YWlsKSA6IFtdKSk7XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseU9ic2VydmFibGVEZWNvcmF0aW9ucyh0aGlzLmVkaXRvciwgdGhpcy5kZWNvcmF0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1JbmZvcztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgTW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtTW9kZWwgaW1wbGVtZW50cyBJR3V0dGVySXRlbUluZm8ge1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5wdXROdW1iZXI6IDEgfCAyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbFxuXHQpIHtcblx0XHR0aGlzLm1vZGVsID0gdGhpcy52aWV3TW9kZWwubW9kZWw7XG5cdFx0dGhpcy5yYW5nZSA9IHRoaXMuYmFzZVJhbmdlLmdldElucHV0UmFuZ2UodGhpcy5pbnB1dE51bWJlcik7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5tb2RlbC5pc1VwVG9EYXRlO1xuXHRcdHRoaXMudG9nZ2xlU3RhdGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMubW9kZWxcblx0XHRcdFx0LmdldFN0YXRlKHRoaXMuYmFzZVJhbmdlKVxuXHRcdFx0XHQucmVhZChyZWFkZXIpXG5cdFx0XHRcdC5nZXRJbnB1dCh0aGlzLmlucHV0TnVtYmVyKTtcblx0XHRcdHJldHVybiBpbnB1dCA9PT0gSW5wdXRTdGF0ZS5zZWNvbmQgJiYgIXRoaXMuYmFzZVJhbmdlLmlzT3JkZXJSZWxldmFudFxuXHRcdFx0XHQ/IElucHV0U3RhdGUuZmlyc3Rcblx0XHRcdFx0OiBpbnB1dDtcblx0XHR9KTtcblx0XHR0aGlzLnN0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy52aWV3TW9kZWwuYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF0aGlzLm1vZGVsLmhhc0Jhc2VSYW5nZSh0aGlzLmJhc2VSYW5nZSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgaGFuZGxlZDogZmFsc2UsIGZvY3VzZWQ6IGZhbHNlIH07IC8vIEludmFsaWQgc3RhdGUsIHNob3VsZCBvbmx5IGJlIG9ic2VydmVkIHRlbXBvcmFyaWx5XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRoYW5kbGVkOiB0aGlzLm1vZGVsLmlzSGFuZGxlZCh0aGlzLmJhc2VSYW5nZSkucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRmb2N1c2VkOiB0aGlzLmJhc2VSYW5nZSA9PT0gYWN0aXZlLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBlbmFibGVkO1xuXG5cdHB1YmxpYyByZWFkb25seSB0b2dnbGVTdGF0ZTogSU9ic2VydmFibGU8SW5wdXRTdGF0ZT47XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTx7IGhhbmRsZWQ6IGJvb2xlYW47IGZvY3VzZWQ6IGJvb2xlYW4gfT47XG5cblx0cHVibGljIHNldFN0YXRlKHZhbHVlOiBib29sZWFuLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWwuc2V0U3RhdGUoXG5cdFx0XHR0aGlzLmJhc2VSYW5nZSxcblx0XHRcdHRoaXMubW9kZWxcblx0XHRcdFx0LmdldFN0YXRlKHRoaXMuYmFzZVJhbmdlKVxuXHRcdFx0XHQuZ2V0KClcblx0XHRcdFx0LndpdGhJbnB1dFZhbHVlKHRoaXMuaW5wdXROdW1iZXIsIHZhbHVlKSxcblx0XHRcdHR4LFxuXHRcdFx0dGhpcy5pbnB1dE51bWJlclxuXHRcdCk7XG5cdH1cblx0cHVibGljIHRvZ2dsZUJvdGhTaWRlcygpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIENvbnRleHQgTWVudTogdG9nZ2xlIGJvdGggc2lkZXMgKi9cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5tb2RlbFxuXHRcdFx0XHQuZ2V0U3RhdGUodGhpcy5iYXNlUmFuZ2UpXG5cdFx0XHRcdC5nZXQoKTtcblx0XHRcdHRoaXMubW9kZWwuc2V0U3RhdGUoXG5cdFx0XHRcdHRoaXMuYmFzZVJhbmdlLFxuXHRcdFx0XHRzdGF0ZVxuXHRcdFx0XHRcdC50b2dnbGUodGhpcy5pbnB1dE51bWJlcilcblx0XHRcdFx0XHQudG9nZ2xlKHRoaXMuaW5wdXROdW1iZXIgPT09IDEgPyAyIDogMSksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHR4XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRleHRNZW51QWN0aW9ucygpOiByZWFkb25seSBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5tb2RlbC5nZXRTdGF0ZSh0aGlzLmJhc2VSYW5nZSkuZ2V0KCk7XG5cdFx0Y29uc3QgaGFuZGxlZCA9IHRoaXMubW9kZWwuaXNIYW5kbGVkKHRoaXMuYmFzZVJhbmdlKS5nZXQoKTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9IChuZXdTdGF0ZTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSkgPT4ge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIENvbnRleHQgTWVudTogVXBkYXRlIEJhc2UgUmFuZ2UgU3RhdGUgKi9cblx0XHRcdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLnNldFN0YXRlKHRoaXMuYmFzZVJhbmdlLCBuZXdTdGF0ZSwgdHgsIHRoaXMuaW5wdXROdW1iZXIpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIGFjdGlvbihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0YXJnZXRTdGF0ZTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSwgY2hlY2tlZDogYm9vbGVhbikge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihpZCwgbGFiZWwsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGUodGFyZ2V0U3RhdGUpO1xuXHRcdFx0fSk7XG5cdFx0XHRhY3Rpb24uY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH1cblx0XHRjb25zdCBib3RoID0gc3RhdGUuaW5jbHVkZXNJbnB1dDEgJiYgc3RhdGUuaW5jbHVkZXNJbnB1dDI7XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5iYXNlUmFuZ2UuaW5wdXQxRGlmZnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IGFjdGlvbihcblx0XHRcdFx0XHQnbWVyZ2VFZGl0b3IuYWNjZXB0SW5wdXQxJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnbWVyZ2VFZGl0b3IuYWNjZXB0JywgJ0FjY2VwdCB7MH0nLCB0aGlzLm1vZGVsLmlucHV0MS50aXRsZSksXG5cdFx0XHRcdFx0c3RhdGUudG9nZ2xlKDEpLFxuXHRcdFx0XHRcdHN0YXRlLmluY2x1ZGVzSW5wdXQxXG5cdFx0XHRcdClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLmJhc2VSYW5nZS5pbnB1dDJEaWZmcy5sZW5ndGggPiAwXG5cdFx0XHRcdD8gYWN0aW9uKFxuXHRcdFx0XHRcdCdtZXJnZUVkaXRvci5hY2NlcHRJbnB1dDInLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdtZXJnZUVkaXRvci5hY2NlcHQnLCAnQWNjZXB0IHswfScsIHRoaXMubW9kZWwuaW5wdXQyLnRpdGxlKSxcblx0XHRcdFx0XHRzdGF0ZS50b2dnbGUoMiksXG5cdFx0XHRcdFx0c3RhdGUuaW5jbHVkZXNJbnB1dDJcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuYmFzZVJhbmdlLmlzQ29uZmxpY3Rpbmdcblx0XHRcdFx0PyBzZXRGaWVsZHMoXG5cdFx0XHRcdFx0YWN0aW9uKFxuXHRcdFx0XHRcdFx0J21lcmdlRWRpdG9yLmFjY2VwdEJvdGgnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdtZXJnZUVkaXRvci5hY2NlcHRCb3RoJyxcblx0XHRcdFx0XHRcdFx0J0FjY2VwdCBCb3RoJ1xuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdHN0YXRlLndpdGhJbnB1dFZhbHVlKDEsICFib3RoKS53aXRoSW5wdXRWYWx1ZSgyLCAhYm90aCksXG5cdFx0XHRcdFx0XHRib3RoXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHR7IGVuYWJsZWQ6IHRoaXMuYmFzZVJhbmdlLmNhbkJlQ29tYmluZWQgfVxuXHRcdFx0XHQpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0dGhpcy5iYXNlUmFuZ2UuaXNDb25mbGljdGluZ1xuXHRcdFx0XHQ/IHNldEZpZWxkcyhcblx0XHRcdFx0XHRhY3Rpb24oXG5cdFx0XHRcdFx0XHQnbWVyZ2VFZGl0b3Iuc3dhcCcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbWVyZ2VFZGl0b3Iuc3dhcCcsICdTd2FwJyksXG5cdFx0XHRcdFx0XHRzdGF0ZS5zd2FwKCksXG5cdFx0XHRcdFx0XHRmYWxzZVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0eyBlbmFibGVkOiAhc3RhdGUua2luZCAmJiAoIWJvdGggfHwgdGhpcy5iYXNlUmFuZ2UuaXNPcmRlclJlbGV2YW50KSB9XG5cdFx0XHRcdClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cblx0XHRcdHNldEZpZWxkcyhcblx0XHRcdFx0bmV3IEFjdGlvbihcblx0XHRcdFx0XHQnbWVyZ2VFZGl0b3IubWFya0FzSGFuZGxlZCcsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ21lcmdlRWRpdG9yLm1hcmtBc0hhbmRsZWQnLCAnTWFyayBhcyBIYW5kbGVkJyksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gQ29udGV4dCBNZW51OiBNYXJrIGFzIGhhbmRsZWQgKi9cblx0XHRcdFx0XHRcdFx0dGhpcy5tb2RlbC5zZXRIYW5kbGVkKHRoaXMuYmFzZVJhbmdlLCAhaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpLFxuXHRcdFx0XHR7IGNoZWNrZWQ6IGhhbmRsZWQgfVxuXHRcdFx0KSxcblx0XHRdLmZpbHRlcihpc0RlZmluZWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNZXJnZUNvbmZsaWN0R3V0dGVySXRlbVZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUd1dHRlckl0ZW1WaWV3PE1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbU1vZGVsPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbTogSVNldHRhYmxlT2JzZXJ2YWJsZTxNb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1Nb2RlbD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBjaGVja2JveERpdjogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNNdWx0aUxpbmUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGl0ZW06IE1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbU1vZGVsLFxuXHRcdHRhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pdGVtID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGl0ZW0pO1xuXG5cdFx0Y29uc3QgY2hlY2tCb3ggPSBuZXcgVG9nZ2xlKHtcblx0XHRcdGlzQ2hlY2tlZDogZmFsc2UsXG5cdFx0XHR0aXRsZTogJycsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0Li4uZGVmYXVsdFRvZ2dsZVN0eWxlc1xuXHRcdH0pO1xuXHRcdGNoZWNrQm94LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnYWNjZXB0LWNvbmZsaWN0LWdyb3VwJyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGVja0JveC5kb21Ob2RlLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKGUpID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbS5nZXQoKTtcblx0XHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUuYnV0dG9uID09PSAvKiBSaWdodCAqLyAyKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0XHRjb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gY2hlY2tCb3guZG9tTm9kZSxcblx0XHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGl0ZW0uZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCksXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChlLmJ1dHRvbiA9PT0gLyogTWlkZGxlICovIDEpIHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRcdGl0ZW0udG9nZ2xlQm90aFNpZGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0YXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIFVwZGF0ZSBDaGVja2JveCAqL1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtLnJlYWQocmVhZGVyKSE7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gaXRlbS50b2dnbGVTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGljb25NYXA6IFJlY29yZDxJbnB1dFN0YXRlLCB7IGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDsgY2hlY2tlZDogYm9vbGVhbjsgdGl0bGU6IHN0cmluZyB9PiA9IHtcblx0XHRcdFx0XHRbSW5wdXRTdGF0ZS5leGNsdWRlZF06IHsgaWNvbjogdW5kZWZpbmVkLCBjaGVja2VkOiBmYWxzZSwgdGl0bGU6IGxvY2FsaXplKCdhY2NlcHQuZXhjbHVkZWQnLCBcIkFjY2VwdFwiKSB9LFxuXHRcdFx0XHRcdFtJbnB1dFN0YXRlLnVucmVjb2duaXplZF06IHsgaWNvbjogQ29kaWNvbi5jaXJjbGVGaWxsZWQsIGNoZWNrZWQ6IGZhbHNlLCB0aXRsZTogbG9jYWxpemUoJ2FjY2VwdC5jb25mbGljdGluZycsIFwiQWNjZXB0IChyZXN1bHQgaXMgZGlydHkpXCIpIH0sXG5cdFx0XHRcdFx0W0lucHV0U3RhdGUuZmlyc3RdOiB7IGljb246IENvZGljb24uY2hlY2ssIGNoZWNrZWQ6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXB0LmZpcnN0JywgXCJVbmRvIGFjY2VwdFwiKSB9LFxuXHRcdFx0XHRcdFtJbnB1dFN0YXRlLnNlY29uZF06IHsgaWNvbjogQ29kaWNvbi5jaGVja0FsbCwgY2hlY2tlZDogdHJ1ZSwgdGl0bGU6IGxvY2FsaXplKCdhY2NlcHQuc2Vjb25kJywgXCJVbmRvIGFjY2VwdCAoY3VycmVudGx5IHNlY29uZClcIikgfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBpY29uTWFwW3ZhbHVlXTtcblx0XHRcdFx0Y2hlY2tCb3guc2V0SWNvbihzdGF0ZS5pY29uKTtcblx0XHRcdFx0Y2hlY2tCb3guY2hlY2tlZCA9IHN0YXRlLmNoZWNrZWQ7XG5cdFx0XHRcdGNoZWNrQm94LnNldFRpdGxlKHN0YXRlLnRpdGxlKTtcblxuXHRcdFx0XHRpZiAoIWl0ZW0uZW5hYmxlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRjaGVja0JveC5kaXNhYmxlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hlY2tCb3guZW5hYmxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIENoZWNrYm94IENTUyBDbGFzc05hbWVzICovXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuaXRlbS5yZWFkKHJlYWRlcikuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lcyA9IFtcblx0XHRcdFx0J21lcmdlLWFjY2VwdC1ndXR0ZXItbWFya2VyJyxcblx0XHRcdFx0c3RhdGUuaGFuZGxlZCAmJiAnaGFuZGxlZCcsXG5cdFx0XHRcdHN0YXRlLmZvY3VzZWQgJiYgJ2ZvY3VzZWQnLFxuXHRcdFx0XHR0aGlzLmlzTXVsdGlMaW5lLnJlYWQocmVhZGVyKSA/ICdtdWx0aS1saW5lJyA6ICdzaW5nbGUtbGluZScsXG5cdFx0XHRdO1xuXHRcdFx0dGFyZ2V0LmNsYXNzTmFtZSA9IGNsYXNzTmFtZXMuZmlsdGVyKGMgPT4gdHlwZW9mIGMgPT09ICdzdHJpbmcnKS5qb2luKCcgJyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hlY2tCb3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIEhhbmRsZSBDaGVja2JveCBDaGFuZ2UgKi9cblx0XHRcdFx0dGhpcy5pdGVtLmdldCgpIS5zZXRTdGF0ZShjaGVja0JveC5jaGVja2VkLCB0eCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoaCgnZGl2LmJhY2tncm91bmQnLCBbbm9CcmVha1doaXRlc3BhY2VdKS5yb290KTtcblx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoXG5cdFx0XHR0aGlzLmNoZWNrYm94RGl2ID0gaCgnZGl2LmNoZWNrYm94JywgW2goJ2Rpdi5jaGVja2JveC1iYWNrZ3JvdW5kJywgW2NoZWNrQm94LmRvbU5vZGVdKV0pLnJvb3Rcblx0XHQpO1xuXHR9XG5cblx0bGF5b3V0KHRvcDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdmlld1RvcDogbnVtYmVyLCB2aWV3SGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjaGVja2JveEhlaWdodCA9IHRoaXMuY2hlY2tib3hEaXYuY2xpZW50SGVpZ2h0O1xuXHRcdGNvbnN0IG1pZGRsZUhlaWdodCA9IGhlaWdodCAvIDIgLSBjaGVja2JveEhlaWdodCAvIDI7XG5cblx0XHRjb25zdCBtYXJnaW4gPSBjaGVja2JveEhlaWdodDtcblxuXHRcdGxldCBlZmZlY3RpdmVDaGVja2JveFRvcCA9IHRvcCArIG1pZGRsZUhlaWdodDtcblxuXHRcdGNvbnN0IHByZWZlcnJlZFZpZXdQb3J0UmFuZ2UgPSBbXG5cdFx0XHRtYXJnaW4sXG5cdFx0XHR2aWV3VG9wICsgdmlld0hlaWdodCAtIG1hcmdpbiAtIGNoZWNrYm94SGVpZ2h0XG5cdFx0XTtcblxuXHRcdGNvbnN0IHByZWZlcnJlZFBhcmVudFJhbmdlID0gW1xuXHRcdFx0dG9wICsgbWFyZ2luLFxuXHRcdFx0dG9wICsgaGVpZ2h0IC0gY2hlY2tib3hIZWlnaHQgLSBtYXJnaW5cblx0XHRdO1xuXG5cdFx0aWYgKHByZWZlcnJlZFBhcmVudFJhbmdlWzBdIDwgcHJlZmVycmVkUGFyZW50UmFuZ2VbMV0pIHtcblx0XHRcdGVmZmVjdGl2ZUNoZWNrYm94VG9wID0gY2xhbXAoZWZmZWN0aXZlQ2hlY2tib3hUb3AsIHByZWZlcnJlZFZpZXdQb3J0UmFuZ2VbMF0sIHByZWZlcnJlZFZpZXdQb3J0UmFuZ2VbMV0pO1xuXHRcdFx0ZWZmZWN0aXZlQ2hlY2tib3hUb3AgPSBjbGFtcChlZmZlY3RpdmVDaGVja2JveFRvcCwgcHJlZmVycmVkUGFyZW50UmFuZ2VbMF0sIHByZWZlcnJlZFBhcmVudFJhbmdlWzFdKTtcblx0XHR9XG5cblx0XHR0aGlzLmNoZWNrYm94RGl2LnN0eWxlLnRvcCA9IGAke2VmZmVjdGl2ZUNoZWNrYm94VG9wIC0gdG9wfXB4YDtcblxuXHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBNZXJnZUNvbmZsaWN0R3V0dGVySXRlbVZpZXc6IFVwZGF0ZSBJcyBNdWx0aSBMaW5lICovXG5cdFx0XHR0aGlzLmlzTXVsdGlMaW5lLnNldChoZWlnaHQgPiAzMCwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0dXBkYXRlKGJhc2VSYW5nZTogTW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtTW9kZWwpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIE1lcmdlQ29uZmxpY3RHdXR0ZXJJdGVtVmlldzogVXBkYXRpbmcgbmV3IGJhc2UgcmFuZ2UgKi9cblx0XHRcdHRoaXMuaXRlbS5zZXQoYmFzZVJhbmdlLCB0eCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUIsV0FBVyxHQUFHLGFBQWE7QUFDM0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGFBQWEsU0FBUyxhQUE2RCxpQkFBaUIsbUJBQW1CO0FBQ3pJLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQWdDLGlCQUFpQix5QkFBeUI7QUFDMUUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQTZEO0FBQ3RFLFNBQVMsNEJBQTRCLGlCQUFpQjtBQUN0RCxTQUFTLDBDQUEwQyxrREFBa0Q7QUFFckcsU0FBUyxvQkFBc0Q7QUFDL0QsU0FBUyxnQkFBZ0IseUJBQXlCLGlCQUFpQjtBQUU1RCxJQUFNLHNCQUFOLGNBQWtDLGVBQWU7QUFBQSxFQUd2RCxZQUNpQixhQUNoQixXQUN1QixzQkFDRixvQkFDRSxzQkFDdEI7QUFDRCxVQUFNLHNCQUFzQixXQUFXLG9CQUFvQjtBQU4zQztBQU9oQixTQUFLLG1CQUFtQixLQUFLLGdCQUFnQixJQUFJLElBQUk7QUFDckQsU0FBSyxtQ0FBbUMsWUFBWSxFQUFFLFdBQVcsUUFBUSxLQUFLLFdBQVcsb0NBQW9DLEdBQUcs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O0FBQUEsTUFDaEQ7QUFDQSxhQUFPLFlBQVksV0FBVyxPQUFPLE9BQUssT0FBTyxNQUFNLFFBQVEsRUFBRSxLQUFLLEdBQUc7QUFBQSxJQUMxRSxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsU0FBUyxTQUFTLE1BQU07QUFDdEMsa0JBQVksUUFBTTtBQUVqQixhQUFLLEtBQUssSUFBSSxFQUFHLFNBQVMsU0FBUyxTQUFTLEVBQUU7QUFBQSxNQUMvQyxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixXQUFPLFlBQVksRUFBRSxrQkFBa0IsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLElBQUk7QUFDaEUsV0FBTztBQUFBLE1BQ04sS0FBSyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxTQUFTLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUFBLElBQzFGO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxLQUFhLFFBQWdCLFNBQWlCLFlBQTBCO0FBQzlFLFVBQU0saUJBQWlCLEtBQUssWUFBWTtBQUN4QyxVQUFNLGVBQWUsU0FBUyxJQUFJLGlCQUFpQjtBQUVuRCxVQUFNLFNBQVM7QUFFZixRQUFJLHVCQUF1QixNQUFNO0FBRWpDLFVBQU0seUJBQXlCO0FBQUEsTUFDOUI7QUFBQSxNQUNBLFVBQVUsYUFBYSxTQUFTO0FBQUEsSUFDakM7QUFFQSxVQUFNLHVCQUF1QjtBQUFBLE1BQzVCLE1BQU07QUFBQSxNQUNOLE1BQU0sU0FBUyxpQkFBaUI7QUFBQSxJQUNqQztBQUVBLFFBQUkscUJBQXFCLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxHQUFHO0FBQ3RELDZCQUF1QixNQUFNLHNCQUFzQix1QkFBdUIsQ0FBQyxHQUFHLHVCQUF1QixDQUFDLENBQUM7QUFDdkcsNkJBQXVCLE1BQU0sc0JBQXNCLHFCQUFxQixDQUFDLEdBQUcscUJBQXFCLENBQUMsQ0FBQztBQUFBLElBQ3BHO0FBRUEsU0FBSyxZQUFZLE1BQU0sTUFBTSxHQUFHLHVCQUF1QixHQUFHO0FBRTFELGdCQUFZLENBQUMsT0FBTztBQUVuQixXQUFLLFlBQVksSUFBSSxTQUFTLElBQUksRUFBRTtBQUFBLElBQ3JDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFPLFdBQW1EO0FBQ3pELGdCQUFZLFFBQU07QUFFakIsV0FBSyxLQUFLLElBQUksV0FBVyxFQUFFO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0Y7QUFDRDsiLAogICJuYW1lcyI6IFsidmlld01vZGVsIiwgImlucHV0TnVtYmVyIiwgInJhbmdlIiwgImFjdGlvbiIsICJpdGVtIl0KfQo=
