import { createCancelablePromise, TimeoutTimer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { EditorOption, ShowLightbulbIconMode } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Selection } from "../../../common/core/selection.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { CodeActionKind, CodeActionTriggerSource } from "../common/types.js";
import { getCodeActions } from "./codeAction.js";
const SUPPORTED_CODE_ACTIONS = new RawContextKey("supportedCodeAction", "");
const APPLY_FIX_ALL_COMMAND_ID = "_typescript.applyFixAllCodeAction";
class CodeActionOracle extends Disposable {
  constructor(_editor, _markerService, _signalChange, _delay = 250) {
    super();
    this._editor = _editor;
    this._markerService = _markerService;
    this._signalChange = _signalChange;
    this._delay = _delay;
    this._autoTriggerTimer = this._register(new TimeoutTimer());
    this.ignoreLightbulbOff = false;
    this._register(this._markerService.onMarkerChanged((e) => this._onMarkerChanges(e)));
    this._register(this._editor.onDidChangeCursorPosition(() => this._tryAutoTrigger()));
  }
  trigger(trigger) {
    const selection = this._getRangeOfSelectionUnlessWhitespaceEnclosed(trigger);
    this._signalChange(selection ? { trigger, selection } : void 0);
  }
  _onMarkerChanges(resources) {
    const model = this._editor.getModel();
    if (model && resources.some((resource) => isEqual(resource, model.uri))) {
      this._tryAutoTrigger();
    }
  }
  _tryAutoTrigger() {
    this._autoTriggerTimer.cancelAndSet(() => {
      this.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
    }, this._delay);
  }
  _getRangeOfSelectionUnlessWhitespaceEnclosed(trigger) {
    if (!this._editor.hasModel()) {
      return void 0;
    }
    const selection = this._editor.getSelection();
    if (trigger.type === CodeActionTriggerType.Invoke) {
      return selection;
    }
    const enabled = this._editor.getOption(EditorOption.lightbulb).enabled;
    if (enabled === ShowLightbulbIconMode.Off && !this.ignoreLightbulbOff) {
      return void 0;
    } else if (enabled === ShowLightbulbIconMode.Off || enabled === ShowLightbulbIconMode.On) {
      return selection;
    } else if (enabled === ShowLightbulbIconMode.OnCode) {
      const isSelectionEmpty = selection.isEmpty();
      if (!isSelectionEmpty) {
        return selection;
      }
      const model = this._editor.getModel();
      const { lineNumber, column } = selection.getPosition();
      const line = model.getLineContent(lineNumber);
      if (line.length === 0) {
        return void 0;
      } else if (column === 1) {
        if (/\s/.test(line[0])) {
          return void 0;
        }
      } else if (column === model.getLineMaxColumn(lineNumber)) {
        if (/\s/.test(line[line.length - 1])) {
          return void 0;
        }
      } else {
        if (/\s/.test(line[column - 2]) && /\s/.test(line[column - 1])) {
          return void 0;
        }
      }
    }
    return selection;
  }
}
var CodeActionsState;
((CodeActionsState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Empty"] = 0] = "Empty";
    Type2[Type2["Triggered"] = 1] = "Triggered";
  })(Type = CodeActionsState2.Type || (CodeActionsState2.Type = {}));
  CodeActionsState2.Empty = { type: 0 /* Empty */ };
  class Triggered {
    constructor(trigger, position, _cancellablePromise) {
      this.trigger = trigger;
      this.position = position;
      this._cancellablePromise = _cancellablePromise;
      this.type = 1 /* Triggered */;
      this.actions = _cancellablePromise.catch((e) => {
        if (isCancellationError(e)) {
          return emptyCodeActionSet;
        }
        throw e;
      });
    }
    cancel() {
      this._cancellablePromise.cancel();
    }
  }
  CodeActionsState2.Triggered = Triggered;
})(CodeActionsState || (CodeActionsState = {}));
const emptyCodeActionSet = Object.freeze({
  allActions: [],
  validActions: [],
  dispose: () => {
  },
  documentation: [],
  hasAutoFix: false,
  hasAIFix: false,
  allAIFixes: false
});
class CodeActionModel extends Disposable {
  constructor(_editor, _registry, _markerService, contextKeyService, _progressService, _configurationService) {
    super();
    this._editor = _editor;
    this._registry = _registry;
    this._markerService = _markerService;
    this._progressService = _progressService;
    this._configurationService = _configurationService;
    this._codeActionOracle = this._register(new MutableDisposable());
    this._state = CodeActionsState.Empty;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.codeActionsDisposable = this._register(new MutableDisposable());
    this._disposed = false;
    this._ignoreLightbulbOff = false;
    this._supportedCodeActions = SUPPORTED_CODE_ACTIONS.bindTo(contextKeyService);
    this._register(this._editor.onDidChangeModel(() => this._update()));
    this._register(this._editor.onDidChangeModelLanguage(() => this._update()));
    this._register(this._registry.onDidChange(() => this._update()));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.lightbulb)) {
        this._update();
      }
    }));
    this._update();
  }
  set ignoreLightbulbOff(value) {
    if (this._ignoreLightbulbOff === value) {
      return;
    }
    this._ignoreLightbulbOff = value;
    const oracle = this._codeActionOracle.value;
    if (oracle) {
      oracle.ignoreLightbulbOff = value;
      if (value) {
        oracle.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
      }
    }
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    super.dispose();
    this.setState(CodeActionsState.Empty, true);
  }
  _settingEnabledNearbyQuickfixes() {
    const model = this._editor?.getModel();
    return this._configurationService ? this._configurationService.getValue("editor.codeActionWidget.includeNearbyQuickFixes", { resource: model?.uri }) : false;
  }
  _update() {
    if (this._disposed) {
      return;
    }
    this._codeActionOracle.value = void 0;
    this.setState(CodeActionsState.Empty);
    const model = this._editor.getModel();
    if (model && this._registry.has(model) && !this._editor.getOption(EditorOption.readOnly)) {
      const supportedActions = this._registry.all(model).flatMap((provider) => provider.providedCodeActionKinds ?? []);
      this._supportedCodeActions.set(supportedActions.join(" "));
      const oracle = new CodeActionOracle(this._editor, this._markerService, (trigger) => {
        if (!trigger) {
          this.setState(CodeActionsState.Empty);
          return;
        }
        const startPosition = trigger.selection.getStartPosition();
        const actions = createCancelablePromise(async (token) => {
          if (this._settingEnabledNearbyQuickfixes() && trigger.trigger.type === CodeActionTriggerType.Invoke && (trigger.trigger.triggerAction === CodeActionTriggerSource.QuickFix || trigger.trigger.filter?.include?.contains(CodeActionKind.QuickFix))) {
            const codeActionSet2 = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
            this.codeActionsDisposable.value = codeActionSet2;
            const allCodeActions = [...codeActionSet2.allActions];
            if (token.isCancellationRequested) {
              codeActionSet2.dispose();
              return emptyCodeActionSet;
            }
            const foundQuickfix = codeActionSet2.validActions?.some((action) => {
              return action.action.kind && CodeActionKind.QuickFix.contains(new HierarchicalKind(action.action.kind)) && !action.action.isAI;
            });
            const allMarkers = this._markerService.read({ resource: model.uri });
            if (foundQuickfix) {
              for (const action of codeActionSet2.validActions) {
                if (action.action.command?.arguments?.some((arg) => typeof arg === "string" && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
                  action.action.diagnostics = [...allMarkers.filter((marker) => marker.relatedInformation)];
                }
              }
              return { validActions: codeActionSet2.validActions, allActions: allCodeActions, documentation: codeActionSet2.documentation, hasAutoFix: codeActionSet2.hasAutoFix, hasAIFix: codeActionSet2.hasAIFix, allAIFixes: codeActionSet2.allAIFixes, dispose: () => {
                this.codeActionsDisposable.value = codeActionSet2;
              } };
            } else if (!foundQuickfix) {
              if (allMarkers.length > 0) {
                const currPosition = trigger.selection.getPosition();
                let trackedPosition = currPosition;
                let distance = Number.MAX_VALUE;
                const currentActions = [...codeActionSet2.validActions];
                for (const marker of allMarkers) {
                  const col = marker.endColumn;
                  const row = marker.endLineNumber;
                  const startRow = marker.startLineNumber;
                  if (row === currPosition.lineNumber || startRow === currPosition.lineNumber) {
                    trackedPosition = new Position(row, col);
                    const newCodeActionTrigger = {
                      type: trigger.trigger.type,
                      triggerAction: trigger.trigger.triggerAction,
                      filter: { include: trigger.trigger.filter?.include ? trigger.trigger.filter?.include : CodeActionKind.QuickFix },
                      autoApply: trigger.trigger.autoApply,
                      context: { notAvailableMessage: trigger.trigger.context?.notAvailableMessage || "", position: trackedPosition }
                    };
                    const selectionAsPosition = new Selection(trackedPosition.lineNumber, trackedPosition.column, trackedPosition.lineNumber, trackedPosition.column);
                    const actionsAtMarker = await getCodeActions(this._registry, model, selectionAsPosition, newCodeActionTrigger, Progress.None, token);
                    if (token.isCancellationRequested) {
                      actionsAtMarker.dispose();
                      return emptyCodeActionSet;
                    }
                    if (actionsAtMarker.validActions.length !== 0) {
                      for (const action of actionsAtMarker.validActions) {
                        if (action.action.command?.arguments?.some((arg) => typeof arg === "string" && arg.includes(APPLY_FIX_ALL_COMMAND_ID))) {
                          action.action.diagnostics = [...allMarkers.filter((marker2) => marker2.relatedInformation)];
                        }
                      }
                      if (codeActionSet2.allActions.length === 0) {
                        allCodeActions.push(...actionsAtMarker.allActions);
                      }
                      if (Math.abs(currPosition.column - col) < distance) {
                        currentActions.unshift(...actionsAtMarker.validActions);
                      } else {
                        currentActions.push(...actionsAtMarker.validActions);
                      }
                    }
                    distance = Math.abs(currPosition.column - col);
                  }
                }
                const filteredActions = currentActions.filter((action, index, self) => self.findIndex((a) => a.action.title === action.action.title) === index);
                filteredActions.sort((a, b) => {
                  if (a.action.isPreferred && !b.action.isPreferred) {
                    return -1;
                  } else if (!a.action.isPreferred && b.action.isPreferred) {
                    return 1;
                  } else if (a.action.isAI && !b.action.isAI) {
                    return 1;
                  } else if (!a.action.isAI && b.action.isAI) {
                    return -1;
                  } else {
                    return 0;
                  }
                });
                return { validActions: filteredActions, allActions: allCodeActions, documentation: codeActionSet2.documentation, hasAutoFix: codeActionSet2.hasAutoFix, hasAIFix: codeActionSet2.hasAIFix, allAIFixes: codeActionSet2.allAIFixes, dispose: () => {
                  this.codeActionsDisposable.value = codeActionSet2;
                } };
              }
            }
          }
          if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
            const codeActions = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
            this.codeActionsDisposable.value = codeActions;
            return codeActions;
          }
          const codeActionSet = await getCodeActions(this._registry, model, trigger.selection, trigger.trigger, Progress.None, token);
          this.codeActionsDisposable.value = codeActionSet;
          return codeActionSet;
        });
        if (trigger.trigger.type === CodeActionTriggerType.Invoke) {
          this._progressService?.showWhile(actions, 250);
        }
        const newState = new CodeActionsState.Triggered(trigger.trigger, startPosition, actions);
        let isManualToAutoTransition = false;
        if (this._state.type === 1 /* Triggered */) {
          isManualToAutoTransition = this._state.trigger.type === CodeActionTriggerType.Invoke && newState.type === 1 /* Triggered */ && newState.trigger.type === CodeActionTriggerType.Auto && this._state.position !== newState.position;
        }
        if (!isManualToAutoTransition) {
          this.setState(newState);
        } else {
          setTimeout(() => {
            this.setState(newState);
          }, 500);
        }
      }, void 0);
      oracle.ignoreLightbulbOff = this._ignoreLightbulbOff;
      this._codeActionOracle.value = oracle;
      this._codeActionOracle.value.trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.Default });
    } else {
      this._supportedCodeActions.reset();
    }
  }
  trigger(trigger) {
    this._codeActionOracle.value?.trigger(trigger);
    this.codeActionsDisposable.dispose();
  }
  setState(newState, skipNotify) {
    if (newState === this._state) {
      return;
    }
    if (this._state.type === 1 /* Triggered */) {
      this._state.cancel();
    }
    this._state = newState;
    if (!skipNotify && !this._disposed) {
      this._onDidChangeState.fire(newState);
    }
  }
}
export {
  APPLY_FIX_ALL_COMMAND_ID,
  CodeActionModel,
  CodeActionsState,
  SUPPORTED_CODE_ACTIONS
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIFNob3dMaWdodGJ1bGJJY29uTW9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uUHJvdmlkZXIsIENvZGVBY3Rpb25UcmlnZ2VyVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQsIENvZGVBY3Rpb25TZXQsIENvZGVBY3Rpb25UcmlnZ2VyLCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlQWN0aW9ucyB9IGZyb20gJy4vY29kZUFjdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBTVVBQT1JURURfQ09ERV9BQ1RJT05TID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignc3VwcG9ydGVkQ29kZUFjdGlvbicsICcnKTtcblxuZXhwb3J0IGNvbnN0IEFQUExZX0ZJWF9BTExfQ09NTUFORF9JRCA9ICdfdHlwZXNjcmlwdC5hcHBseUZpeEFsbENvZGVBY3Rpb24nO1xuXG50eXBlIFRyaWdnZXJlZENvZGVBY3Rpb24gPSB7XG5cdHJlYWRvbmx5IHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuXHRyZWFkb25seSB0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcjtcbn07XG5cbmNsYXNzIENvZGVBY3Rpb25PcmFjbGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvVHJpZ2dlclRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblxuXHRpZ25vcmVMaWdodGJ1bGJPZmYgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NpZ25hbENoYW5nZTogKHRyaWdnZXJlZDogVHJpZ2dlcmVkQ29kZUFjdGlvbiB8IHVuZGVmaW5lZCkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWxheTogbnVtYmVyID0gMjUwLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKGUgPT4gdGhpcy5fb25NYXJrZXJDaGFuZ2VzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKCkgPT4gdGhpcy5fdHJ5QXV0b1RyaWdnZXIoKSkpO1xuXHR9XG5cblx0cHVibGljIHRyaWdnZXIodHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9nZXRSYW5nZU9mU2VsZWN0aW9uVW5sZXNzV2hpdGVzcGFjZUVuY2xvc2VkKHRyaWdnZXIpO1xuXHRcdHRoaXMuX3NpZ25hbENoYW5nZShzZWxlY3Rpb24gPyB7IHRyaWdnZXIsIHNlbGVjdGlvbiB9IDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX29uTWFya2VyQ2hhbmdlcyhyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgJiYgcmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gaXNFcXVhbChyZXNvdXJjZSwgbW9kZWwudXJpKSkpIHtcblx0XHRcdHRoaXMuX3RyeUF1dG9UcmlnZ2VyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5QXV0b1RyaWdnZXIoKSB7XG5cdFx0dGhpcy5fYXV0b1RyaWdnZXJUaW1lci5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmlnZ2VyKHsgdHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQgfSk7XG5cdFx0fSwgdGhpcy5fZGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmFuZ2VPZlNlbGVjdGlvblVubGVzc1doaXRlc3BhY2VFbmNsb3NlZCh0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcik6IFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICh0cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saWdodGJ1bGIpLmVuYWJsZWQ7XG5cdFx0aWYgKGVuYWJsZWQgPT09IFNob3dMaWdodGJ1bGJJY29uTW9kZS5PZmYgJiYgIXRoaXMuaWdub3JlTGlnaHRidWxiT2ZmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoZW5hYmxlZCA9PT0gU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9mZiB8fCBlbmFibGVkID09PSBTaG93TGlnaHRidWxiSWNvbk1vZGUuT24pIHtcblx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0fSBlbHNlIGlmIChlbmFibGVkID09PSBTaG93TGlnaHRidWxiSWNvbk1vZGUuT25Db2RlKSB7XG5cdFx0XHRjb25zdCBpc1NlbGVjdGlvbkVtcHR5ID0gc2VsZWN0aW9uLmlzRW1wdHkoKTtcblx0XHRcdGlmICghaXNTZWxlY3Rpb25FbXB0eSkge1xuXHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IHsgbGluZU51bWJlciwgY29sdW1uIH0gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGxpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChsaW5lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyBlbXB0eSBsaW5lXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbHVtbiA9PT0gMSkge1xuXHRcdFx0XHQvLyBsb29rIG9ubHkgcmlnaHRcblx0XHRcdFx0aWYgKC9cXHMvLnRlc3QobGluZVswXSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNvbHVtbiA9PT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHQvLyBsb29rIG9ubHkgbGVmdFxuXHRcdFx0XHRpZiAoL1xccy8udGVzdChsaW5lW2xpbmUubGVuZ3RoIC0gMV0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gbG9vayBsZWZ0IGFuZCByaWdodFxuXHRcdFx0XHRpZiAoL1xccy8udGVzdChsaW5lW2NvbHVtbiAtIDJdKSAmJiAvXFxzLy50ZXN0KGxpbmVbY29sdW1uIC0gMV0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29kZUFjdGlvbnNTdGF0ZSB7XG5cblx0ZXhwb3J0IGNvbnN0IGVudW0gVHlwZSB7IEVtcHR5LCBUcmlnZ2VyZWQgfVxuXG5cdGV4cG9ydCBjb25zdCBFbXB0eSA9IHsgdHlwZTogVHlwZS5FbXB0eSB9IGFzIGNvbnN0O1xuXG5cdGV4cG9ydCBjbGFzcyBUcmlnZ2VyZWQge1xuXHRcdHJlYWRvbmx5IHR5cGUgPSBUeXBlLlRyaWdnZXJlZDtcblxuXHRcdHB1YmxpYyByZWFkb25seSBhY3Rpb25zOiBQcm9taXNlPENvZGVBY3Rpb25TZXQ+O1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIsXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgcG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfY2FuY2VsbGFibGVQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxDb2RlQWN0aW9uU2V0Pixcblx0XHQpIHtcblx0XHRcdHRoaXMuYWN0aW9ucyA9IF9jYW5jZWxsYWJsZVByb21pc2UuY2F0Y2goKGUpOiBDb2RlQWN0aW9uU2V0ID0+IHtcblx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZW1wdHlDb2RlQWN0aW9uU2V0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgY2FuY2VsKCkge1xuXHRcdFx0dGhpcy5fY2FuY2VsbGFibGVQcm9taXNlLmNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCB0eXBlIFN0YXRlID0gdHlwZW9mIEVtcHR5IHwgVHJpZ2dlcmVkO1xufVxuXG5jb25zdCBlbXB0eUNvZGVBY3Rpb25TZXQgPSBPYmplY3QuZnJlZXplPENvZGVBY3Rpb25TZXQ+KHtcblx0YWxsQWN0aW9uczogW10sXG5cdHZhbGlkQWN0aW9uczogW10sXG5cdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0ZG9jdW1lbnRhdGlvbjogW10sXG5cdGhhc0F1dG9GaXg6IGZhbHNlLFxuXHRoYXNBSUZpeDogZmFsc2UsXG5cdGFsbEFJRml4ZXM6IGZhbHNlLFxufSk7XG5cblxuZXhwb3J0IGNsYXNzIENvZGVBY3Rpb25Nb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVBY3Rpb25PcmFjbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q29kZUFjdGlvbk9yYWNsZT4oKSk7XG5cdHByaXZhdGUgX3N0YXRlOiBDb2RlQWN0aW9uc1N0YXRlLlN0YXRlID0gQ29kZUFjdGlvbnNTdGF0ZS5FbXB0eTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0ZWRDb2RlQWN0aW9uczogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29kZUFjdGlvbnNTdGF0ZS5TdGF0ZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVBY3Rpb25zRGlzcG9zYWJsZTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfaWdub3JlTGlnaHRidWxiT2ZmID0gZmFsc2U7XG5cblx0c2V0IGlnbm9yZUxpZ2h0YnVsYk9mZih2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9pZ25vcmVMaWdodGJ1bGJPZmYgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lnbm9yZUxpZ2h0YnVsYk9mZiA9IHZhbHVlO1xuXHRcdGNvbnN0IG9yYWNsZSA9IHRoaXMuX2NvZGVBY3Rpb25PcmFjbGUudmFsdWU7XG5cdFx0aWYgKG9yYWNsZSkge1xuXHRcdFx0b3JhY2xlLmlnbm9yZUxpZ2h0YnVsYk9mZiA9IHZhbHVlO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdG9yYWNsZS50cmlnZ2VyKHsgdHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLkRlZmF1bHQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8Q29kZUFjdGlvblByb3ZpZGVyPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZT86IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U/OiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3VwcG9ydGVkQ29kZUFjdGlvbnMgPSBTVVBQT1JURURfQ09ERV9BQ1RJT05TLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWdpc3RyeS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpZ2h0YnVsYikpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc2V0U3RhdGUoQ29kZUFjdGlvbnNTdGF0ZS5FbXB0eSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR0aW5nRW5hYmxlZE5lYXJieVF1aWNrZml4ZXMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID8gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5jb2RlQWN0aW9uV2lkZ2V0LmluY2x1ZGVOZWFyYnlRdWlja0ZpeGVzJywgeyByZXNvdXJjZTogbW9kZWw/LnVyaSB9KSA6IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvZGVBY3Rpb25PcmFjbGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnNldFN0YXRlKENvZGVBY3Rpb25zU3RhdGUuRW1wdHkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWxcblx0XHRcdCYmIHRoaXMuX3JlZ2lzdHJ5Lmhhcyhtb2RlbClcblx0XHRcdCYmICF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IHN1cHBvcnRlZEFjdGlvbnM6IHN0cmluZ1tdID0gdGhpcy5fcmVnaXN0cnkuYWxsKG1vZGVsKS5mbGF0TWFwKHByb3ZpZGVyID0+IHByb3ZpZGVyLnByb3ZpZGVkQ29kZUFjdGlvbktpbmRzID8/IFtdKTtcblx0XHRcdHRoaXMuX3N1cHBvcnRlZENvZGVBY3Rpb25zLnNldChzdXBwb3J0ZWRBY3Rpb25zLmpvaW4oJyAnKSk7XG5cblx0XHRcdGNvbnN0IG9yYWNsZSA9IG5ldyBDb2RlQWN0aW9uT3JhY2xlKHRoaXMuX2VkaXRvciwgdGhpcy5fbWFya2VyU2VydmljZSwgdHJpZ2dlciA9PiB7XG5cdFx0XHRcdGlmICghdHJpZ2dlcikge1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGUoQ29kZUFjdGlvbnNTdGF0ZS5FbXB0eSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHRyaWdnZXIuc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb25zID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zZXR0aW5nRW5hYmxlZE5lYXJieVF1aWNrZml4ZXMoKSAmJiB0cmlnZ2VyLnRyaWdnZXIudHlwZSA9PT0gQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSAmJiAodHJpZ2dlci50cmlnZ2VyLnRyaWdnZXJBY3Rpb24gPT09IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlF1aWNrRml4IHx8IHRyaWdnZXIudHJpZ2dlci5maWx0ZXI/LmluY2x1ZGU/LmNvbnRhaW5zKENvZGVBY3Rpb25LaW5kLlF1aWNrRml4KSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvZGVBY3Rpb25TZXQgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyh0aGlzLl9yZWdpc3RyeSwgbW9kZWwsIHRyaWdnZXIuc2VsZWN0aW9uLCB0cmlnZ2VyLnRyaWdnZXIsIFByb2dyZXNzLk5vbmUsIHRva2VuKTtcblx0XHRcdFx0XHRcdHRoaXMuY29kZUFjdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gY29kZUFjdGlvblNldDtcblx0XHRcdFx0XHRcdGNvbnN0IGFsbENvZGVBY3Rpb25zID0gWy4uLmNvZGVBY3Rpb25TZXQuYWxsQWN0aW9uc107XG5cdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29kZUFjdGlvblNldC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbXB0eUNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFNlYXJjaCBmb3Igbm9uLUFJIHF1aWNrZml4ZXMgaW4gdGhlIGN1cnJlbnQgY29kZSBhY3Rpb24gc2V0IC0gaWYgQUkgY29kZSBhY3Rpb25zIGFyZSB0aGUgb25seSB0aGluZyBmb3VuZCwgY29udGludWUgc2VhcmNoaW5nIGZvciBkaWFnbm9zdGljcyBpbiBsaW5lLlxuXHRcdFx0XHRcdFx0Y29uc3QgZm91bmRRdWlja2ZpeCA9IGNvZGVBY3Rpb25TZXQudmFsaWRBY3Rpb25zPy5zb21lKGFjdGlvbiA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhY3Rpb24uYWN0aW9uLmtpbmQgJiZcblx0XHRcdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5RdWlja0ZpeC5jb250YWlucyhuZXcgSGllcmFyY2hpY2FsS2luZChhY3Rpb24uYWN0aW9uLmtpbmQpKSAmJlxuXHRcdFx0XHRcdFx0XHRcdCFhY3Rpb24uYWN0aW9uLmlzQUk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGNvbnN0IGFsbE1hcmtlcnMgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogbW9kZWwudXJpIH0pO1xuXHRcdFx0XHRcdFx0aWYgKGZvdW5kUXVpY2tmaXgpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgY29kZUFjdGlvblNldC52YWxpZEFjdGlvbnMpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYWN0aW9uLmFjdGlvbi5jb21tYW5kPy5hcmd1bWVudHM/LnNvbWUoYXJnID0+IHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnICYmIGFyZy5pbmNsdWRlcyhBUFBMWV9GSVhfQUxMX0NPTU1BTkRfSUQpKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YWN0aW9uLmFjdGlvbi5kaWFnbm9zdGljcyA9IFsuLi5hbGxNYXJrZXJzLmZpbHRlcihtYXJrZXIgPT4gbWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbildO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyB2YWxpZEFjdGlvbnM6IGNvZGVBY3Rpb25TZXQudmFsaWRBY3Rpb25zLCBhbGxBY3Rpb25zOiBhbGxDb2RlQWN0aW9ucywgZG9jdW1lbnRhdGlvbjogY29kZUFjdGlvblNldC5kb2N1bWVudGF0aW9uLCBoYXNBdXRvRml4OiBjb2RlQWN0aW9uU2V0Lmhhc0F1dG9GaXgsIGhhc0FJRml4OiBjb2RlQWN0aW9uU2V0Lmhhc0FJRml4LCBhbGxBSUZpeGVzOiBjb2RlQWN0aW9uU2V0LmFsbEFJRml4ZXMsIGRpc3Bvc2U6ICgpID0+IHsgdGhpcy5jb2RlQWN0aW9uc0Rpc3Bvc2FibGUudmFsdWUgPSBjb2RlQWN0aW9uU2V0OyB9IH07XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCFmb3VuZFF1aWNrZml4KSB7XG5cdFx0XHRcdFx0XHRcdC8vIElmIG1hcmtlcnMgZXhpc3QsIGFuZCB0aGVyZSBhcmUgbm8gcXVpY2tmaXhlcyBmb3VuZCBvciBsZW5ndGggaXMgemVybywgY2hlY2sgZm9yIHF1aWNrZml4ZXMgb24gdGhhdCBsaW5lLlxuXHRcdFx0XHRcdFx0XHRpZiAoYWxsTWFya2Vycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VyclBvc2l0aW9uID0gdHJpZ2dlci5zZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRcdFx0XHRsZXQgdHJhY2tlZFBvc2l0aW9uID0gY3VyclBvc2l0aW9uO1xuXHRcdFx0XHRcdFx0XHRcdGxldCBkaXN0YW5jZSA9IE51bWJlci5NQVhfVkFMVUU7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudEFjdGlvbnMgPSBbLi4uY29kZUFjdGlvblNldC52YWxpZEFjdGlvbnNdO1xuXG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgYWxsTWFya2Vycykge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29sID0gbWFya2VyLmVuZENvbHVtbjtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJvdyA9IG1hcmtlci5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRSb3cgPSBtYXJrZXIuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBGb3VuZCBxdWlja2ZpeCBvbiB0aGUgc2FtZSBsaW5lIGFuZCBjaGVjayByZWxhdGl2ZSBkaXN0YW5jZSB0byBvdGhlciBtYXJrZXJzXG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoKHJvdyA9PT0gY3VyclBvc2l0aW9uLmxpbmVOdW1iZXIgfHwgc3RhcnRSb3cgPT09IGN1cnJQb3NpdGlvbi5saW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0cmFja2VkUG9zaXRpb24gPSBuZXcgUG9zaXRpb24ocm93LCBjb2wpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBuZXdDb2RlQWN0aW9uVHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIgPSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogdHJpZ2dlci50cmlnZ2VyLnR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHJpZ2dlckFjdGlvbjogdHJpZ2dlci50cmlnZ2VyLnRyaWdnZXJBY3Rpb24sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZmlsdGVyOiB7IGluY2x1ZGU6IHRyaWdnZXIudHJpZ2dlci5maWx0ZXI/LmluY2x1ZGUgPyB0cmlnZ2VyLnRyaWdnZXIuZmlsdGVyPy5pbmNsdWRlIDogQ29kZUFjdGlvbktpbmQuUXVpY2tGaXggfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhdXRvQXBwbHk6IHRyaWdnZXIudHJpZ2dlci5hdXRvQXBwbHksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGV4dDogeyBub3RBdmFpbGFibGVNZXNzYWdlOiB0cmlnZ2VyLnRyaWdnZXIuY29udGV4dD8ubm90QXZhaWxhYmxlTWVzc2FnZSB8fCAnJywgcG9zaXRpb246IHRyYWNrZWRQb3NpdGlvbiB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uQXNQb3NpdGlvbiA9IG5ldyBTZWxlY3Rpb24odHJhY2tlZFBvc2l0aW9uLmxpbmVOdW1iZXIsIHRyYWNrZWRQb3NpdGlvbi5jb2x1bW4sIHRyYWNrZWRQb3NpdGlvbi5saW5lTnVtYmVyLCB0cmFja2VkUG9zaXRpb24uY29sdW1uKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uc0F0TWFya2VyID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnModGhpcy5fcmVnaXN0cnksIG1vZGVsLCBzZWxlY3Rpb25Bc1Bvc2l0aW9uLCBuZXdDb2RlQWN0aW9uVHJpZ2dlciwgUHJvZ3Jlc3MuTm9uZSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhY3Rpb25zQXRNYXJrZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBlbXB0eUNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoYWN0aW9uc0F0TWFya2VyLnZhbGlkQWN0aW9ucy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zQXRNYXJrZXIudmFsaWRBY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoYWN0aW9uLmFjdGlvbi5jb21tYW5kPy5hcmd1bWVudHM/LnNvbWUoYXJnID0+IHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnICYmIGFyZy5pbmNsdWRlcyhBUFBMWV9GSVhfQUxMX0NPTU1BTkRfSUQpKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhY3Rpb24uYWN0aW9uLmRpYWdub3N0aWNzID0gWy4uLmFsbE1hcmtlcnMuZmlsdGVyKG1hcmtlciA9PiBtYXJrZXIucmVsYXRlZEluZm9ybWF0aW9uKV07XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNvZGVBY3Rpb25TZXQuYWxsQWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFsbENvZGVBY3Rpb25zLnB1c2goLi4uYWN0aW9uc0F0TWFya2VyLmFsbEFjdGlvbnMpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIEFscmVhZHkgZmlsdGVyZWQgdGhyb3VnaCB0byBvbmx5IGdldCBxdWlja2ZpeGVzLCBzbyBubyBuZWVkIHRvIGZpbHRlciBhZ2Fpbi5cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoTWF0aC5hYnMoY3VyclBvc2l0aW9uLmNvbHVtbiAtIGNvbCkgPCBkaXN0YW5jZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y3VycmVudEFjdGlvbnMudW5zaGlmdCguLi5hY3Rpb25zQXRNYXJrZXIudmFsaWRBY3Rpb25zKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y3VycmVudEFjdGlvbnMucHVzaCguLi5hY3Rpb25zQXRNYXJrZXIudmFsaWRBY3Rpb25zKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGlzdGFuY2UgPSBNYXRoLmFicyhjdXJyUG9zaXRpb24uY29sdW1uIC0gY29sKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZmlsdGVyZWRBY3Rpb25zID0gY3VycmVudEFjdGlvbnMuZmlsdGVyKChhY3Rpb24sIGluZGV4LCBzZWxmKSA9PlxuXHRcdFx0XHRcdFx0XHRcdFx0c2VsZi5maW5kSW5kZXgoKGEpID0+IGEuYWN0aW9uLnRpdGxlID09PSBhY3Rpb24uYWN0aW9uLnRpdGxlKSA9PT0gaW5kZXgpO1xuXG5cdFx0XHRcdFx0XHRcdFx0ZmlsdGVyZWRBY3Rpb25zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChhLmFjdGlvbi5pc1ByZWZlcnJlZCAmJiAhYi5hY3Rpb24uaXNQcmVmZXJyZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmICghYS5hY3Rpb24uaXNQcmVmZXJyZWQgJiYgYi5hY3Rpb24uaXNQcmVmZXJyZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGEuYWN0aW9uLmlzQUkgJiYgIWIuYWN0aW9uLmlzQUkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCFhLmFjdGlvbi5pc0FJICYmIGIuYWN0aW9uLmlzQUkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0XHQvLyBPbmx5IHJldHJpZ2dlcnMgaWYgYWN0dWFsbHkgZm91bmQgcXVpY2tmaXggb24gdGhlIHNhbWUgbGluZSBhcyBjdXJzb3Jcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyB2YWxpZEFjdGlvbnM6IGZpbHRlcmVkQWN0aW9ucywgYWxsQWN0aW9uczogYWxsQ29kZUFjdGlvbnMsIGRvY3VtZW50YXRpb246IGNvZGVBY3Rpb25TZXQuZG9jdW1lbnRhdGlvbiwgaGFzQXV0b0ZpeDogY29kZUFjdGlvblNldC5oYXNBdXRvRml4LCBoYXNBSUZpeDogY29kZUFjdGlvblNldC5oYXNBSUZpeCwgYWxsQUlGaXhlczogY29kZUFjdGlvblNldC5hbGxBSUZpeGVzLCBkaXNwb3NlOiAoKSA9PiB7IHRoaXMuY29kZUFjdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gY29kZUFjdGlvblNldDsgfSB9O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQ2FzZSBmb3IgbWFudWFsIHRyaWdnZXJzIC0gc3BlY2lmaWNhbGx5IFNvdXJjZSBBY3Rpb25zIGFuZCBSZWZhY3RvcnNcblx0XHRcdFx0XHRpZiAodHJpZ2dlci50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvZGVBY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnModGhpcy5fcmVnaXN0cnksIG1vZGVsLCB0cmlnZ2VyLnNlbGVjdGlvbiwgdHJpZ2dlci50cmlnZ2VyLCBQcm9ncmVzcy5Ob25lLCB0b2tlbik7XG5cdFx0XHRcdFx0XHR0aGlzLmNvZGVBY3Rpb25zRGlzcG9zYWJsZS52YWx1ZSA9IGNvZGVBY3Rpb25zO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNvZGVBY3Rpb25zO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNvZGVBY3Rpb25TZXQgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyh0aGlzLl9yZWdpc3RyeSwgbW9kZWwsIHRyaWdnZXIuc2VsZWN0aW9uLCB0cmlnZ2VyLnRyaWdnZXIsIFByb2dyZXNzLk5vbmUsIHRva2VuKTtcblx0XHRcdFx0XHR0aGlzLmNvZGVBY3Rpb25zRGlzcG9zYWJsZS52YWx1ZSA9IGNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdFx0cmV0dXJuIGNvZGVBY3Rpb25TZXQ7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICh0cmlnZ2VyLnRyaWdnZXIudHlwZSA9PT0gQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZT8uc2hvd1doaWxlKGFjdGlvbnMsIDI1MCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3U3RhdGUgPSBuZXcgQ29kZUFjdGlvbnNTdGF0ZS5UcmlnZ2VyZWQodHJpZ2dlci50cmlnZ2VyLCBzdGFydFBvc2l0aW9uLCBhY3Rpb25zKTtcblx0XHRcdFx0bGV0IGlzTWFudWFsVG9BdXRvVHJhbnNpdGlvbiA9IGZhbHNlO1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUudHlwZSA9PT0gQ29kZUFjdGlvbnNTdGF0ZS5UeXBlLlRyaWdnZXJlZCkge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBjdXJyZW50IHN0YXRlIGlzIG1hbnVhbCBhbmQgdGhlIG5ldyBzdGF0ZSBpcyBhdXRvbWF0aWNcblx0XHRcdFx0XHRpc01hbnVhbFRvQXV0b1RyYW5zaXRpb24gPSB0aGlzLl9zdGF0ZS50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UgJiZcblx0XHRcdFx0XHRcdG5ld1N0YXRlLnR5cGUgPT09IENvZGVBY3Rpb25zU3RhdGUuVHlwZS5UcmlnZ2VyZWQgJiZcblx0XHRcdFx0XHRcdG5ld1N0YXRlLnRyaWdnZXIudHlwZSA9PT0gQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8gJiZcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlLnBvc2l0aW9uICE9PSBuZXdTdGF0ZS5wb3NpdGlvbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERvIG5vdCB0cmlnZ2VyIHN0YXRlIGlmIGN1cnJlbnQgc3RhdGUgaXMgbWFudWFsIGFuZCBpbmNvbWluZyBzdGF0ZSBpcyBhdXRvbWF0aWNcblx0XHRcdFx0aWYgKCFpc01hbnVhbFRvQXV0b1RyYW5zaXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKG5ld1N0YXRlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBSZXNldCB0aGUgbmV3IHN0YXRlIGFmdGVyIGdldHRpbmcgY29kZSBhY3Rpb25zIGJhY2suXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldFN0YXRlKG5ld1N0YXRlKTtcblx0XHRcdFx0XHR9LCA1MDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0b3JhY2xlLmlnbm9yZUxpZ2h0YnVsYk9mZiA9IHRoaXMuX2lnbm9yZUxpZ2h0YnVsYk9mZjtcblx0XHRcdHRoaXMuX2NvZGVBY3Rpb25PcmFjbGUudmFsdWUgPSBvcmFjbGU7XG5cdFx0XHR0aGlzLl9jb2RlQWN0aW9uT3JhY2xlLnZhbHVlLnRyaWdnZXIoeyB0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuQXV0bywgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuRGVmYXVsdCB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3VwcG9ydGVkQ29kZUFjdGlvbnMucmVzZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlcih0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcikge1xuXHRcdHRoaXMuX2NvZGVBY3Rpb25PcmFjbGUudmFsdWU/LnRyaWdnZXIodHJpZ2dlcik7XG5cdFx0dGhpcy5jb2RlQWN0aW9uc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGF0ZShuZXdTdGF0ZTogQ29kZUFjdGlvbnNTdGF0ZS5TdGF0ZSwgc2tpcE5vdGlmeT86IGJvb2xlYW4pIHtcblx0XHRpZiAobmV3U3RhdGUgPT09IHRoaXMuX3N0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsIG9sZCByZXF1ZXN0XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgPT09IENvZGVBY3Rpb25zU3RhdGUuVHlwZS5UcmlnZ2VyZWQpIHtcblx0XHRcdHRoaXMuX3N0YXRlLmNhbmNlbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlID0gbmV3U3RhdGU7XG5cblx0XHRpZiAoIXNraXBOb3RpZnkgJiYgIXRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUobmV3U3RhdGUpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBNEIseUJBQXlCLG9CQUFvQjtBQUN6RSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsU0FBUyxlQUFlO0FBR3hCLFNBQTBDLHFCQUFxQjtBQUUvRCxTQUFpQyxnQkFBZ0I7QUFFakQsU0FBUyxjQUFjLDZCQUE2QjtBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixTQUE2Qiw2QkFBNkI7QUFDMUQsU0FBUyxnQkFBa0QsK0JBQStCO0FBQzFGLFNBQVMsc0JBQXNCO0FBRXhCLE1BQU0seUJBQXlCLElBQUksY0FBc0IsdUJBQXVCLEVBQUU7QUFFbEYsTUFBTSwyQkFBMkI7QUFPeEMsTUFBTSx5QkFBeUIsV0FBVztBQUFBLEVBTXpDLFlBQ2tCLFNBQ0EsZ0JBQ0EsZUFDQSxTQUFpQixLQUNqQztBQUNELFVBQU07QUFMVztB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
