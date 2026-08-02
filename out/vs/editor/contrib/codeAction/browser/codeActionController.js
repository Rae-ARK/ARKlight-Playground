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
import { getDomNodePagePosition } from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { derivedOpts, observableValue } from "../../../../base/common/observable.js";
import { Event } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { editorFindMatchHighlight, editorFindMatchHighlightBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { Position } from "../../../common/core/position.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { CodeActionTriggerType } from "../../../common/languages.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { MessageController } from "../../message/browser/messageController.js";
import { CodeActionAutoApply, CodeActionKind, CodeActionTriggerSource } from "../common/types.js";
import { ApplyCodeActionReason, applyCodeAction, autoFixCommandId, quickFixCommandId } from "./codeAction.js";
import { CodeActionKeybindingResolver } from "./codeActionKeybindingResolver.js";
import { toMenuItems } from "./codeActionMenu.js";
import { CodeActionModel, CodeActionsState } from "./codeActionModel.js";
import { computeLightBulbInfo, LightBulbWidget } from "./lightBulbWidget.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const DECORATION_CLASS_NAME = "quickfix-edit-highlight";
let CodeActionController = class extends Disposable {
  constructor(editor, markerService, contextKeyService, instantiationService, languageFeaturesService, progressService, _commandService, _configurationService, _actionWidgetService, _instantiationService, _progressService, _keybindingService) {
    super();
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._actionWidgetService = _actionWidgetService;
    this._instantiationService = _instantiationService;
    this._progressService = _progressService;
    this._keybindingService = _keybindingService;
    this._activeCodeActions = this._register(new MutableDisposable());
    this._showDisabled = false;
    this._disposed = false;
    this._onlyLightBulbWithEmptySelection = false;
    this._lightBulbInfoObs = observableValue(this, void 0);
    this._preferredKbLabel = observableValue(this, void 0);
    this._quickFixKbLabel = observableValue(this, void 0);
    this._hasLightBulbStateObservers = false;
    this.lightBulbState = derivedOpts({
      owner: this,
      onLastObserverRemoved: () => {
        this._hasLightBulbStateObservers = false;
        this._model.ignoreLightbulbOff = false;
      }
    }, (reader) => {
      if (!this._hasLightBulbStateObservers) {
        this._hasLightBulbStateObservers = true;
        this._model.ignoreLightbulbOff = true;
      }
      return this._lightBulbInfoObs.read(reader);
    });
    this._editor = editor;
    this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService, _configurationService));
    this._register(this._model.onDidChangeState((newState) => this.update(newState)));
    this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
      this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? void 0, void 0);
      this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? void 0, void 0);
    }));
    this._lightBulbWidget = new Lazy(() => {
      const widget = this._editor.getContribution(LightBulbWidget.ID);
      if (widget) {
        this._register(widget.onClick((e) => this.showCodeActionsFromLightbulb(e.actions, e)));
        widget.onlyWithEmptySelection = this._onlyLightBulbWithEmptySelection;
      }
      return widget;
    });
    this._resolver = instantiationService.createInstance(CodeActionKeybindingResolver);
    this._register(this._editor.onDidLayoutChange(() => this._actionWidgetService.hide()));
  }
  static get(editor) {
    return editor.getContribution(CodeActionController.ID);
  }
  set onlyLightBulbWithEmptySelection(value) {
    const widget = this._lightBulbWidget.rawValue;
    if (widget) {
      widget.onlyWithEmptySelection = value;
    }
    this._onlyLightBulbWithEmptySelection = value;
  }
  dispose() {
    this._disposed = true;
    super.dispose();
  }
  async showCodeActionsFromLightbulb(actions, at) {
    if (actions.allAIFixes && actions.validActions.length === 1) {
      const actionItem = actions.validActions[0];
      const command = actionItem.action.command;
      if (command && command.id === "inlineChat.start") {
        if (command.arguments && command.arguments.length >= 1 && command.arguments[0]) {
          command.arguments[0] = { ...command.arguments[0], autoSend: false };
        }
      }
      await this.applyCodeAction(actionItem, false, false, ApplyCodeActionReason.FromAILightbulb);
      return;
    }
    await this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: true });
  }
  showCodeActions(_trigger, actions, at) {
    return this.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: false });
  }
  hideCodeActions() {
    this._actionWidgetService.hide();
  }
  manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply) {
    if (!this._editor.hasModel()) {
      return;
    }
    MessageController.get(this._editor)?.closeMessage();
    const triggerPosition = this._editor.getPosition();
    this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition } });
  }
  _trigger(trigger) {
    return this._model.trigger(trigger);
  }
  async applyCodeAction(action, retrigger, preview, actionReason) {
    const progress = this._progressService.show(true, 500);
    try {
      await this._instantiationService.invokeFunction(applyCodeAction, action, actionReason, { preview, editor: this._editor });
    } finally {
      if (retrigger) {
        this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
      }
      progress.done();
    }
  }
  hideLightBulbWidget() {
    this._lightBulbWidget.rawValue?.hide();
    this._lightBulbWidget.rawValue?.gutterHide();
  }
  async update(newState) {
    if (newState.type !== CodeActionsState.Type.Triggered) {
      this.hideLightBulbWidget();
      this._lightBulbInfoObs.set(void 0, void 0);
      return;
    }
    let actions;
    try {
      actions = await newState.actions;
    } catch (e) {
      onUnexpectedError(e);
      return;
    }
    if (this._disposed) {
      return;
    }
    const selection = this._editor.getSelection();
    if (selection?.startLineNumber !== newState.position.lineNumber) {
      return;
    }
    this._lightBulbWidget.value?.update(actions, newState.trigger, newState.position);
    this._lightBulbInfoObs.set(computeLightBulbInfo(actions, newState.trigger, this._preferredKbLabel.get(), this._quickFixKbLabel.get()), void 0);
    if (newState.trigger.type === CodeActionTriggerType.Invoke) {
      if (newState.trigger.filter?.include) {
        const validActionToApply = this.tryGetValidActionToApply(newState.trigger, actions);
        if (validActionToApply) {
          try {
            this.hideLightBulbWidget();
            await this.applyCodeAction(validActionToApply, false, false, ApplyCodeActionReason.FromCodeActions);
          } finally {
            actions.dispose();
          }
          return;
        }
        if (newState.trigger.context) {
          const invalidAction = this.getInvalidActionThatWouldHaveBeenApplied(newState.trigger, actions);
          if (invalidAction && invalidAction.action.disabled) {
            MessageController.get(this._editor)?.showMessage(invalidAction.action.disabled, newState.trigger.context.position);
            actions.dispose();
            return;
          }
        }
      }
      const includeDisabledActions = !!newState.trigger.filter?.include;
      if (newState.trigger.context) {
        if (!actions.allActions.length || !includeDisabledActions && !actions.validActions.length) {
          MessageController.get(this._editor)?.showMessage(newState.trigger.context.notAvailableMessage, newState.trigger.context.position);
          this._activeCodeActions.value = actions;
          actions.dispose();
          return;
        }
      }
      this._activeCodeActions.value = actions;
      this.showCodeActionList(actions, this.toCoords(newState.position), { includeDisabledActions, fromLightbulb: false });
    } else {
      if (this._actionWidgetService.isVisible) {
        actions.dispose();
      } else {
        this._activeCodeActions.value = actions;
      }
    }
  }
  getInvalidActionThatWouldHaveBeenApplied(trigger, actions) {
    if (!actions.allActions.length) {
      return void 0;
    }
    if (trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length === 0 || trigger.autoApply === CodeActionAutoApply.IfSingle && actions.allActions.length === 1) {
      return actions.allActions.find(({ action }) => action.disabled);
    }
    return void 0;
  }
  tryGetValidActionToApply(trigger, actions) {
    if (!actions.validActions.length) {
      return void 0;
    }
    if (trigger.autoApply === CodeActionAutoApply.First && actions.validActions.length > 0 || trigger.autoApply === CodeActionAutoApply.IfSingle && actions.validActions.length === 1) {
      return actions.validActions[0];
    }
    return void 0;
  }
  async showCodeActionList(actions, at, options) {
    const currentDecorations = this._editor.createDecorationsCollection();
    const editorDom = this._editor.getDomNode();
    if (!editorDom) {
      return;
    }
    const actionsToShow = options.includeDisabledActions && (this._showDisabled || actions.validActions.length === 0) ? actions.allActions : actions.validActions;
    if (!actionsToShow.length) {
      return;
    }
    const anchor = Position.isIPosition(at) ? this.toCoords(at) : at;
    const delegate = {
      onSelect: async (action, preview) => {
        this.applyCodeAction(
          action,
          /* retrigger */
          true,
          !!preview,
          options.fromLightbulb ? ApplyCodeActionReason.FromAILightbulb : ApplyCodeActionReason.FromCodeActions
        );
        this._actionWidgetService.hide(false);
        currentDecorations.clear();
      },
      onHide: (didCancel) => {
        this._editor?.focus();
        currentDecorations.clear();
      },
      onHover: async (action, token) => {
        if (token.isCancellationRequested) {
          return;
        }
        let canPreview = false;
        const actionKind = action.action.kind;
        if (actionKind) {
          const hierarchicalKind = new HierarchicalKind(actionKind);
          const refactorKinds = [
            CodeActionKind.RefactorExtract,
            CodeActionKind.RefactorInline,
            CodeActionKind.RefactorRewrite,
            CodeActionKind.RefactorMove,
            CodeActionKind.Source
          ];
          canPreview = refactorKinds.some((refactorKind) => refactorKind.contains(hierarchicalKind));
        }
        return { canPreview: canPreview || !!action.action.edit?.edits.length };
      },
      onFocus: (action) => {
        if (action && action.action) {
          const ranges = action.action.ranges;
          const diagnostics = action.action.diagnostics;
          currentDecorations.clear();
          if (ranges && ranges.length > 0) {
            const decorations = diagnostics && diagnostics?.length > 1 ? diagnostics.map((diagnostic) => ({ range: diagnostic, options: CodeActionController.DECORATION })) : ranges.map((range) => ({ range, options: CodeActionController.DECORATION }));
            currentDecorations.set(decorations);
          } else if (diagnostics && diagnostics.length > 0) {
            const decorations = diagnostics.map((diagnostic2) => ({ range: diagnostic2, options: CodeActionController.DECORATION }));
            currentDecorations.set(decorations);
            const diagnostic = diagnostics[0];
            if (diagnostic.startLineNumber && diagnostic.startColumn) {
              const selectionText = this._editor.getModel()?.getWordAtPosition({ lineNumber: diagnostic.startLineNumber, column: diagnostic.startColumn })?.word;
              aria.status(localize("editingNewSelection", "Context: {0} at line {1} and column {2}.", selectionText, diagnostic.startLineNumber, diagnostic.startColumn));
            }
          }
        } else {
          currentDecorations.clear();
        }
      }
    };
    this._actionWidgetService.show(
      "codeActionWidget",
      true,
      toMenuItems(actionsToShow, this._shouldShowHeaders(), this._resolver.getResolver()),
      delegate,
      anchor,
      editorDom,
      this._getActionBarActions(actions, at, options)
    );
  }
  toCoords(position) {
    if (!this._editor.hasModel()) {
      return { x: 0, y: 0 };
    }
    this._editor.revealPosition(position, ScrollType.Immediate);
    this._editor.render();
    const cursorCoords = this._editor.getScrolledVisiblePosition(position);
    const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
    const x = editorCoords.left + cursorCoords.left;
    const y = editorCoords.top + cursorCoords.top + cursorCoords.height;
    return { x, y };
  }
  _shouldShowHeaders() {
    const model = this._editor?.getModel();
    return this._configurationService.getValue("editor.codeActionWidget.showHeaders", { resource: model?.uri });
  }
  _getActionBarActions(actions, at, options) {
    if (options.fromLightbulb) {
      return [];
    }
    const resultActions = actions.documentation.map((command) => ({
      id: command.id,
      label: command.title,
      tooltip: command.tooltip ?? "",
      class: void 0,
      enabled: true,
      run: () => this._commandService.executeCommand(command.id, ...command.arguments ?? [])
    }));
    if (options.includeDisabledActions && actions.validActions.length > 0 && actions.allActions.length !== actions.validActions.length) {
      resultActions.push(this._showDisabled ? {
        id: "hideMoreActions",
        label: localize("hideMoreActions", "Hide Disabled"),
        enabled: true,
        tooltip: "",
        class: void 0,
        run: () => {
          this._showDisabled = false;
          return this.showCodeActionList(actions, at, options);
        }
      } : {
        id: "showMoreActions",
        label: localize("showMoreActions", "Show Disabled"),
        enabled: true,
        tooltip: "",
        class: void 0,
        run: () => {
          this._showDisabled = true;
          return this.showCodeActionList(actions, at, options);
        }
      });
    }
    return resultActions;
  }
};
CodeActionController.ID = "editor.contrib.codeActionController";
CodeActionController.DECORATION = ModelDecorationOptions.register({
  description: "quickfix-highlight",
  className: DECORATION_CLASS_NAME
});
CodeActionController = __decorateClass([
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IActionWidgetService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorProgressService),
  __decorateParam(11, IKeybindingService)
], CodeActionController);
registerThemingParticipant((theme, collector) => {
  const addBackgroundColorRule = (selector, color) => {
    if (color) {
      collector.addRule(`.monaco-editor ${selector} { background-color: ${color}; }`);
    }
  };
  addBackgroundColorRule(".quickfix-edit-highlight", theme.getColor(editorFindMatchHighlight));
  const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
  if (findMatchHighlightBorder) {
    collector.addRule(`.monaco-editor .quickfix-edit-highlight { border: 1px ${isHighContrast(theme.type) ? "dotted" : "solid"} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
  }
});
export {
  CodeActionController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldERvbU5vZGVQYWdlUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbkxpc3REZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IGVkaXRvckZpbmRNYXRjaEhpZ2hsaWdodCwgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uVHJpZ2dlclR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQXV0b0FwcGx5LCBDb2RlQWN0aW9uRmlsdGVyLCBDb2RlQWN0aW9uSXRlbSwgQ29kZUFjdGlvbktpbmQsIENvZGVBY3Rpb25TZXQsIENvZGVBY3Rpb25UcmlnZ2VyLCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBBcHBseUNvZGVBY3Rpb25SZWFzb24sIGFwcGx5Q29kZUFjdGlvbiwgYXV0b0ZpeENvbW1hbmRJZCwgcXVpY2tGaXhDb21tYW5kSWQgfSBmcm9tICcuL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlciB9IGZyb20gJy4vY29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyB0b01lbnVJdGVtcyB9IGZyb20gJy4vY29kZUFjdGlvbk1lbnUuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbk1vZGVsLCBDb2RlQWN0aW9uc1N0YXRlIH0gZnJvbSAnLi9jb2RlQWN0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUxpZ2h0QnVsYkluZm8sIExpZ2h0QnVsYkluZm8sIExpZ2h0QnVsYldpZGdldCB9IGZyb20gJy4vbGlnaHRCdWxiV2lkZ2V0LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuXG5pbnRlcmZhY2UgSUFjdGlvblNob3dPcHRpb25zIHtcblx0cmVhZG9ubHkgaW5jbHVkZURpc2FibGVkQWN0aW9ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZyb21MaWdodGJ1bGI/OiBib29sZWFuO1xufVxuXG5cbmNvbnN0IERFQ09SQVRJT05fQ0xBU1NfTkFNRSA9ICdxdWlja2ZpeC1lZGl0LWhpZ2hsaWdodCc7XG5cbmV4cG9ydCBjbGFzcyBDb2RlQWN0aW9uQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmNvZGVBY3Rpb25Db250cm9sbGVyJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogQ29kZUFjdGlvbkNvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxDb2RlQWN0aW9uQ29udHJvbGxlcj4oQ29kZUFjdGlvbkNvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IENvZGVBY3Rpb25Nb2RlbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saWdodEJ1bGJXaWRnZXQ6IExhenk8TGlnaHRCdWxiV2lkZ2V0IHwgbnVsbD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNvZGVBY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENvZGVBY3Rpb25TZXQ+KCkpO1xuXHRwcml2YXRlIF9zaG93RGlzYWJsZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlcjogQ29kZUFjdGlvbktleWJpbmRpbmdSZXNvbHZlcjtcblxuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXG5cdHNldCBvbmx5TGlnaHRCdWxiV2l0aEVtcHR5U2VsZWN0aW9uKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fbGlnaHRCdWxiV2lkZ2V0LnJhd1ZhbHVlO1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5vbmx5V2l0aEVtcHR5U2VsZWN0aW9uID0gdmFsdWU7XG5cdFx0fVxuXHRcdHRoaXMuX29ubHlMaWdodEJ1bGJXaXRoRW1wdHlTZWxlY3Rpb24gPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX29ubHlMaWdodEJ1bGJXaXRoRW1wdHlTZWxlY3Rpb24gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saWdodEJ1bGJJbmZvT2JzID0gb2JzZXJ2YWJsZVZhbHVlPExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcnJlZEtiTGFiZWwgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0ZpeEtiTGFiZWwgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgX2hhc0xpZ2h0QnVsYlN0YXRlT2JzZXJ2ZXJzID0gZmFsc2U7XG5cblx0cHVibGljIHJlYWRvbmx5IGxpZ2h0QnVsYlN0YXRlOiBJT2JzZXJ2YWJsZTxMaWdodEJ1bGJJbmZvIHwgdW5kZWZpbmVkPiA9IGRlcml2ZWRPcHRzPExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQ+KHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRvbkxhc3RPYnNlcnZlclJlbW92ZWQ6ICgpID0+IHtcblx0XHRcdHRoaXMuX2hhc0xpZ2h0QnVsYlN0YXRlT2JzZXJ2ZXJzID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9tb2RlbC5pZ25vcmVMaWdodGJ1bGJPZmYgPSBmYWxzZTtcblx0XHR9LFxuXHR9LCByZWFkZXIgPT4ge1xuXHRcdGlmICghdGhpcy5faGFzTGlnaHRCdWxiU3RhdGVPYnNlcnZlcnMpIHtcblx0XHRcdHRoaXMuX2hhc0xpZ2h0QnVsYlN0YXRlT2JzZXJ2ZXJzID0gdHJ1ZTtcblx0XHRcdHRoaXMuX21vZGVsLmlnbm9yZUxpZ2h0YnVsYk9mZiA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9saWdodEJ1bGJJbmZvT2JzLnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASU1hcmtlclNlcnZpY2UgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvZGVBY3Rpb25Nb2RlbCh0aGlzLl9lZGl0b3IsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbWFya2VyU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHByb2dyZXNzU2VydmljZSwgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VTdGF0ZShuZXdTdGF0ZSA9PiB0aGlzLnVwZGF0ZShuZXdTdGF0ZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcmVmZXJyZWRLYkxhYmVsLnNldCh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGF1dG9GaXhDb21tYW5kSWQpPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3F1aWNrRml4S2JMYWJlbC5zZXQodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhxdWlja0ZpeENvbW1hbmRJZCk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xpZ2h0QnVsYldpZGdldCA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2VkaXRvci5nZXRDb250cmlidXRpb248TGlnaHRCdWxiV2lkZ2V0PihMaWdodEJ1bGJXaWRnZXQuSUQpO1xuXHRcdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih3aWRnZXQub25DbGljayhlID0+IHRoaXMuc2hvd0NvZGVBY3Rpb25zRnJvbUxpZ2h0YnVsYihlLmFjdGlvbnMsIGUpKSk7XG5cdFx0XHRcdHdpZGdldC5vbmx5V2l0aEVtcHR5U2VsZWN0aW9uID0gdGhpcy5fb25seUxpZ2h0QnVsYldpdGhFbXB0eVNlbGVjdGlvbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB3aWRnZXQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZXNvbHZlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVBY3Rpb25LZXliaW5kaW5nUmVzb2x2ZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dDb2RlQWN0aW9uc0Zyb21MaWdodGJ1bGIoYWN0aW9uczogQ29kZUFjdGlvblNldCwgYXQ6IElBbmNob3IgfCBJUG9zaXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYWN0aW9ucy5hbGxBSUZpeGVzICYmIGFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uSXRlbSA9IGFjdGlvbnMudmFsaWRBY3Rpb25zWzBdO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGFjdGlvbkl0ZW0uYWN0aW9uLmNvbW1hbmQ7XG5cdFx0XHRpZiAoY29tbWFuZCAmJiBjb21tYW5kLmlkID09PSAnaW5saW5lQ2hhdC5zdGFydCcpIHtcblx0XHRcdFx0aWYgKGNvbW1hbmQuYXJndW1lbnRzICYmIGNvbW1hbmQuYXJndW1lbnRzLmxlbmd0aCA+PSAxICYmIGNvbW1hbmQuYXJndW1lbnRzWzBdKSB7XG5cdFx0XHRcdFx0Y29tbWFuZC5hcmd1bWVudHNbMF0gPSB7IC4uLmNvbW1hbmQuYXJndW1lbnRzWzBdLCBhdXRvU2VuZDogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5hcHBseUNvZGVBY3Rpb24oYWN0aW9uSXRlbSwgZmFsc2UsIGZhbHNlLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uRnJvbUFJTGlnaHRidWxiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zaG93Q29kZUFjdGlvbkxpc3QoYWN0aW9ucywgYXQsIHsgaW5jbHVkZURpc2FibGVkQWN0aW9uczogZmFsc2UsIGZyb21MaWdodGJ1bGI6IHRydWUgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd0NvZGVBY3Rpb25zKF90cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlciwgYWN0aW9uczogQ29kZUFjdGlvblNldCwgYXQ6IElBbmNob3IgfCBJUG9zaXRpb24pIHtcblx0XHRyZXR1cm4gdGhpcy5zaG93Q29kZUFjdGlvbkxpc3QoYWN0aW9ucywgYXQsIHsgaW5jbHVkZURpc2FibGVkQWN0aW9uczogZmFsc2UsIGZyb21MaWdodGJ1bGI6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHVibGljIGhpZGVDb2RlQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0fVxuXG5cdHB1YmxpYyBtYW51YWxUcmlnZ2VyQXRDdXJyZW50UG9zaXRpb24oXG5cdFx0bm90QXZhaWxhYmxlTWVzc2FnZTogc3RyaW5nLFxuXHRcdHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLFxuXHRcdGZpbHRlcj86IENvZGVBY3Rpb25GaWx0ZXIsXG5cdFx0YXV0b0FwcGx5PzogQ29kZUFjdGlvbkF1dG9BcHBseSxcblx0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5jbG9zZU1lc3NhZ2UoKTtcblx0XHRjb25zdCB0cmlnZ2VyUG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHR0aGlzLl90cmlnZ2VyKHsgdHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSwgdHJpZ2dlckFjdGlvbiwgZmlsdGVyLCBhdXRvQXBwbHksIGNvbnRleHQ6IHsgbm90QXZhaWxhYmxlTWVzc2FnZSwgcG9zaXRpb246IHRyaWdnZXJQb3NpdGlvbiB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJpZ2dlcih0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcikge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC50cmlnZ2VyKHRyaWdnZXIpO1xuXHR9XG5cblx0YXN5bmMgYXBwbHlDb2RlQWN0aW9uKGFjdGlvbjogQ29kZUFjdGlvbkl0ZW0sIHJldHJpZ2dlcjogYm9vbGVhbiwgcHJldmlldzogYm9vbGVhbiwgYWN0aW9uUmVhc29uOiBBcHBseUNvZGVBY3Rpb25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9ncmVzcyA9IHRoaXMuX3Byb2dyZXNzU2VydmljZS5zaG93KHRydWUsIDUwMCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFwcGx5Q29kZUFjdGlvbiwgYWN0aW9uLCBhY3Rpb25SZWFzb24sIHsgcHJldmlldywgZWRpdG9yOiB0aGlzLl9lZGl0b3IgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChyZXRyaWdnZXIpIHtcblx0XHRcdFx0dGhpcy5fdHJpZ2dlcih7IHR5cGU6IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5RdWlja0ZpeCwgZmlsdGVyOiB7fSB9KTtcblx0XHRcdH1cblx0XHRcdHByb2dyZXNzLmRvbmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGlkZUxpZ2h0QnVsYldpZGdldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9saWdodEJ1bGJXaWRnZXQucmF3VmFsdWU/LmhpZGUoKTtcblx0XHR0aGlzLl9saWdodEJ1bGJXaWRnZXQucmF3VmFsdWU/Lmd1dHRlckhpZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlKG5ld1N0YXRlOiBDb2RlQWN0aW9uc1N0YXRlLlN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG5ld1N0YXRlLnR5cGUgIT09IENvZGVBY3Rpb25zU3RhdGUuVHlwZS5UcmlnZ2VyZWQpIHtcblx0XHRcdHRoaXMuaGlkZUxpZ2h0QnVsYldpZGdldCgpO1xuXHRcdFx0dGhpcy5fbGlnaHRCdWxiSW5mb09icy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhY3Rpb25zOiBDb2RlQWN0aW9uU2V0O1xuXHRcdHRyeSB7XG5cdFx0XHRhY3Rpb25zID0gYXdhaXQgbmV3U3RhdGUuYWN0aW9ucztcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uPy5zdGFydExpbmVOdW1iZXIgIT09IG5ld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9saWdodEJ1bGJXaWRnZXQudmFsdWU/LnVwZGF0ZShhY3Rpb25zLCBuZXdTdGF0ZS50cmlnZ2VyLCBuZXdTdGF0ZS5wb3NpdGlvbik7XG5cdFx0dGhpcy5fbGlnaHRCdWxiSW5mb09icy5zZXQoY29tcHV0ZUxpZ2h0QnVsYkluZm8oYWN0aW9ucywgbmV3U3RhdGUudHJpZ2dlciwgdGhpcy5fcHJlZmVycmVkS2JMYWJlbC5nZXQoKSwgdGhpcy5fcXVpY2tGaXhLYkxhYmVsLmdldCgpKSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmIChuZXdTdGF0ZS50cmlnZ2VyLnR5cGUgPT09IENvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UpIHtcblx0XHRcdGlmIChuZXdTdGF0ZS50cmlnZ2VyLmZpbHRlcj8uaW5jbHVkZSkgeyAvLyBUcmlnZ2VyZWQgZm9yIHNwZWNpZmljIHNjb3BlXG5cdFx0XHRcdC8vIENoZWNrIHRvIHNlZSBpZiB3ZSB3YW50IHRvIGF1dG8gYXBwbHkuXG5cblx0XHRcdFx0Y29uc3QgdmFsaWRBY3Rpb25Ub0FwcGx5ID0gdGhpcy50cnlHZXRWYWxpZEFjdGlvblRvQXBwbHkobmV3U3RhdGUudHJpZ2dlciwgYWN0aW9ucyk7XG5cdFx0XHRcdGlmICh2YWxpZEFjdGlvblRvQXBwbHkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dGhpcy5oaWRlTGlnaHRCdWxiV2lkZ2V0KCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmFwcGx5Q29kZUFjdGlvbih2YWxpZEFjdGlvblRvQXBwbHksIGZhbHNlLCBmYWxzZSwgQXBwbHlDb2RlQWN0aW9uUmVhc29uLkZyb21Db2RlQWN0aW9ucyk7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlcmUgaXMgYW4gYWN0aW9uIHRoYXQgd2Ugd291bGQgaGF2ZSBhcHBsaWVkIHdlcmUgaXQgbm90IGludmFsaWRcblx0XHRcdFx0aWYgKG5ld1N0YXRlLnRyaWdnZXIuY29udGV4dCkge1xuXHRcdFx0XHRcdGNvbnN0IGludmFsaWRBY3Rpb24gPSB0aGlzLmdldEludmFsaWRBY3Rpb25UaGF0V291bGRIYXZlQmVlbkFwcGxpZWQobmV3U3RhdGUudHJpZ2dlciwgYWN0aW9ucyk7XG5cdFx0XHRcdFx0aWYgKGludmFsaWRBY3Rpb24gJiYgaW52YWxpZEFjdGlvbi5hY3Rpb24uZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5zaG93TWVzc2FnZShpbnZhbGlkQWN0aW9uLmFjdGlvbi5kaXNhYmxlZCwgbmV3U3RhdGUudHJpZ2dlci5jb250ZXh0LnBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbmNsdWRlRGlzYWJsZWRBY3Rpb25zID0gISFuZXdTdGF0ZS50cmlnZ2VyLmZpbHRlcj8uaW5jbHVkZTtcblx0XHRcdGlmIChuZXdTdGF0ZS50cmlnZ2VyLmNvbnRleHQpIHtcblx0XHRcdFx0aWYgKCFhY3Rpb25zLmFsbEFjdGlvbnMubGVuZ3RoIHx8ICFpbmNsdWRlRGlzYWJsZWRBY3Rpb25zICYmICFhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yKT8uc2hvd01lc3NhZ2UobmV3U3RhdGUudHJpZ2dlci5jb250ZXh0Lm5vdEF2YWlsYWJsZU1lc3NhZ2UsIG5ld1N0YXRlLnRyaWdnZXIuY29udGV4dC5wb3NpdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlQ29kZUFjdGlvbnMudmFsdWUgPSBhY3Rpb25zO1xuXHRcdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hY3RpdmVDb2RlQWN0aW9ucy52YWx1ZSA9IGFjdGlvbnM7XG5cdFx0XHR0aGlzLnNob3dDb2RlQWN0aW9uTGlzdChhY3Rpb25zLCB0aGlzLnRvQ29vcmRzKG5ld1N0YXRlLnBvc2l0aW9uKSwgeyBpbmNsdWRlRGlzYWJsZWRBY3Rpb25zLCBmcm9tTGlnaHRidWxiOiBmYWxzZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gYXV0byBtYWdpY2FsbHkgdHJpZ2dlcmVkXG5cdFx0XHRpZiAodGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdFx0Ly8gVE9ETzogRmlndXJlIG91dCBpZiB3ZSBzaG91bGQgdXBkYXRlIHRoZSBzaG93aW5nIG1lbnU/XG5cdFx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlQ29kZUFjdGlvbnMudmFsdWUgPSBhY3Rpb25zO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SW52YWxpZEFjdGlvblRoYXRXb3VsZEhhdmVCZWVuQXBwbGllZCh0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlciwgYWN0aW9uczogQ29kZUFjdGlvblNldCk6IENvZGVBY3Rpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWFjdGlvbnMuYWxsQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCh0cmlnZ2VyLmF1dG9BcHBseSA9PT0gQ29kZUFjdGlvbkF1dG9BcHBseS5GaXJzdCAmJiBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPT09IDApXG5cdFx0XHR8fCAodHJpZ2dlci5hdXRvQXBwbHkgPT09IENvZGVBY3Rpb25BdXRvQXBwbHkuSWZTaW5nbGUgJiYgYWN0aW9ucy5hbGxBY3Rpb25zLmxlbmd0aCA9PT0gMSlcblx0XHQpIHtcblx0XHRcdHJldHVybiBhY3Rpb25zLmFsbEFjdGlvbnMuZmluZCgoeyBhY3Rpb24gfSkgPT4gYWN0aW9uLmRpc2FibGVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0cnlHZXRWYWxpZEFjdGlvblRvQXBwbHkodHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIsIGFjdGlvbnM6IENvZGVBY3Rpb25TZXQpOiBDb2RlQWN0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCh0cmlnZ2VyLmF1dG9BcHBseSA9PT0gQ29kZUFjdGlvbkF1dG9BcHBseS5GaXJzdCAmJiBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPiAwKVxuXHRcdFx0fHwgKHRyaWdnZXIuYXV0b0FwcGx5ID09PSBDb2RlQWN0aW9uQXV0b0FwcGx5LklmU2luZ2xlICYmIGFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCA9PT0gMSlcblx0XHQpIHtcblx0XHRcdHJldHVybiBhY3Rpb25zLnZhbGlkQWN0aW9uc1swXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVDT1JBVElPTiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAncXVpY2tmaXgtaGlnaGxpZ2h0Jyxcblx0XHRjbGFzc05hbWU6IERFQ09SQVRJT05fQ0xBU1NfTkFNRVxuXHR9KTtcblxuXHRwdWJsaWMgYXN5bmMgc2hvd0NvZGVBY3Rpb25MaXN0KGFjdGlvbnM6IENvZGVBY3Rpb25TZXQsIGF0OiBJQW5jaG9yIHwgSVBvc2l0aW9uLCBvcHRpb25zOiBJQWN0aW9uU2hvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGN1cnJlbnREZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblxuXHRcdGNvbnN0IGVkaXRvckRvbSA9IHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0aWYgKCFlZGl0b3JEb20pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zVG9TaG93ID0gb3B0aW9ucy5pbmNsdWRlRGlzYWJsZWRBY3Rpb25zICYmICh0aGlzLl9zaG93RGlzYWJsZWQgfHwgYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID09PSAwKSA/IGFjdGlvbnMuYWxsQWN0aW9ucyA6IGFjdGlvbnMudmFsaWRBY3Rpb25zO1xuXHRcdGlmICghYWN0aW9uc1RvU2hvdy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbmNob3IgPSBQb3NpdGlvbi5pc0lQb3NpdGlvbihhdCkgPyB0aGlzLnRvQ29vcmRzKGF0KSA6IGF0O1xuXG5cdFx0Y29uc3QgZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8Q29kZUFjdGlvbkl0ZW0+ID0ge1xuXHRcdFx0b25TZWxlY3Q6IGFzeW5jIChhY3Rpb246IENvZGVBY3Rpb25JdGVtLCBwcmV2aWV3PzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHR0aGlzLmFwcGx5Q29kZUFjdGlvbihhY3Rpb24sIC8qIHJldHJpZ2dlciAqLyB0cnVlLCAhIXByZXZpZXcsIG9wdGlvbnMuZnJvbUxpZ2h0YnVsYiA/IEFwcGx5Q29kZUFjdGlvblJlYXNvbi5Gcm9tQUlMaWdodGJ1bGIgOiBBcHBseUNvZGVBY3Rpb25SZWFzb24uRnJvbUNvZGVBY3Rpb25zKTtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKGZhbHNlKTtcblx0XHRcdFx0Y3VycmVudERlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoZGlkQ2FuY2VsPykgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3I/LmZvY3VzKCk7XG5cdFx0XHRcdGN1cnJlbnREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0fSxcblx0XHRcdG9uSG92ZXI6IGFzeW5jIChhY3Rpb246IENvZGVBY3Rpb25JdGVtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGNhblByZXZpZXcgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uS2luZCA9IGFjdGlvbi5hY3Rpb24ua2luZDtcblxuXHRcdFx0XHRpZiAoYWN0aW9uS2luZCkge1xuXHRcdFx0XHRcdGNvbnN0IGhpZXJhcmNoaWNhbEtpbmQgPSBuZXcgSGllcmFyY2hpY2FsS2luZChhY3Rpb25LaW5kKTtcblx0XHRcdFx0XHRjb25zdCByZWZhY3RvcktpbmRzID0gW1xuXHRcdFx0XHRcdFx0Q29kZUFjdGlvbktpbmQuUmVmYWN0b3JFeHRyYWN0LFxuXHRcdFx0XHRcdFx0Q29kZUFjdGlvbktpbmQuUmVmYWN0b3JJbmxpbmUsXG5cdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5SZWZhY3RvclJld3JpdGUsXG5cdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5SZWZhY3Rvck1vdmUsXG5cdFx0XHRcdFx0XHRDb2RlQWN0aW9uS2luZC5Tb3VyY2Vcblx0XHRcdFx0XHRdO1xuXG5cdFx0XHRcdFx0Y2FuUHJldmlldyA9IHJlZmFjdG9yS2luZHMuc29tZShyZWZhY3RvcktpbmQgPT4gcmVmYWN0b3JLaW5kLmNvbnRhaW5zKGhpZXJhcmNoaWNhbEtpbmQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IGNhblByZXZpZXc6IGNhblByZXZpZXcgfHwgISFhY3Rpb24uYWN0aW9uLmVkaXQ/LmVkaXRzLmxlbmd0aCB9O1xuXHRcdFx0fSxcblx0XHRcdG9uRm9jdXM6IChhY3Rpb246IENvZGVBY3Rpb25JdGVtIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gJiYgYWN0aW9uLmFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlcyA9IGFjdGlvbi5hY3Rpb24ucmFuZ2VzO1xuXHRcdFx0XHRcdGNvbnN0IGRpYWdub3N0aWNzID0gYWN0aW9uLmFjdGlvbi5kaWFnbm9zdGljcztcblx0XHRcdFx0XHRjdXJyZW50RGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdFx0XHRpZiAocmFuZ2VzICYmIHJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHQvLyBIYW5kbGVzIGNhc2UgZm9yIGBmaXggYWxsYCB3aGVyZSB0aGVyZSBhcmUgbXVsdGlwbGUgZGlhZ25vc3RpY3MuXG5cdFx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSAoZGlhZ25vc3RpY3MgJiYgZGlhZ25vc3RpY3M/Lmxlbmd0aCA+IDEpXG5cdFx0XHRcdFx0XHRcdD8gZGlhZ25vc3RpY3MubWFwKGRpYWdub3N0aWMgPT4gKHsgcmFuZ2U6IGRpYWdub3N0aWMsIG9wdGlvbnM6IENvZGVBY3Rpb25Db250cm9sbGVyLkRFQ09SQVRJT04gfSkpXG5cdFx0XHRcdFx0XHRcdDogcmFuZ2VzLm1hcChyYW5nZSA9PiAoeyByYW5nZSwgb3B0aW9uczogQ29kZUFjdGlvbkNvbnRyb2xsZXIuREVDT1JBVElPTiB9KSk7XG5cdFx0XHRcdFx0XHRjdXJyZW50RGVjb3JhdGlvbnMuc2V0KGRlY29yYXRpb25zKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGRpYWdub3N0aWNzICYmIGRpYWdub3N0aWNzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IGRpYWdub3N0aWNzLm1hcChkaWFnbm9zdGljID0+ICh7IHJhbmdlOiBkaWFnbm9zdGljLCBvcHRpb25zOiBDb2RlQWN0aW9uQ29udHJvbGxlci5ERUNPUkFUSU9OIH0pKTtcblx0XHRcdFx0XHRcdGN1cnJlbnREZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbnMpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlhZ25vc3RpYyA9IGRpYWdub3N0aWNzWzBdO1xuXHRcdFx0XHRcdFx0aWYgKGRpYWdub3N0aWMuc3RhcnRMaW5lTnVtYmVyICYmIGRpYWdub3N0aWMuc3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uVGV4dCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRXb3JkQXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IGRpYWdub3N0aWMuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IGRpYWdub3N0aWMuc3RhcnRDb2x1bW4gfSk/LndvcmQ7XG5cdFx0XHRcdFx0XHRcdGFyaWEuc3RhdHVzKGxvY2FsaXplKCdlZGl0aW5nTmV3U2VsZWN0aW9uJywgXCJDb250ZXh0OiB7MH0gYXQgbGluZSB7MX0gYW5kIGNvbHVtbiB7Mn0uXCIsIHNlbGVjdGlvblRleHQsIGRpYWdub3N0aWMuc3RhcnRMaW5lTnVtYmVyLCBkaWFnbm9zdGljLnN0YXJ0Q29sdW1uKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGN1cnJlbnREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2Uuc2hvdyhcblx0XHRcdCdjb2RlQWN0aW9uV2lkZ2V0Jyxcblx0XHRcdHRydWUsXG5cdFx0XHR0b01lbnVJdGVtcyhhY3Rpb25zVG9TaG93LCB0aGlzLl9zaG91bGRTaG93SGVhZGVycygpLCB0aGlzLl9yZXNvbHZlci5nZXRSZXNvbHZlcigpKSxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0YW5jaG9yLFxuXHRcdFx0ZWRpdG9yRG9tLFxuXHRcdFx0dGhpcy5fZ2V0QWN0aW9uQmFyQWN0aW9ucyhhY3Rpb25zLCBhdCwgb3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0Nvb3Jkcyhwb3NpdGlvbjogSVBvc2l0aW9uKTogSUFuY2hvciB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIHsgeDogMCwgeTogMCB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxQb3NpdGlvbihwb3NpdGlvbiwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW5kZXIoKTtcblxuXHRcdC8vIFRyYW5zbGF0ZSB0byBhYnNvbHV0ZSBlZGl0b3IgcG9zaXRpb25cblx0XHRjb25zdCBjdXJzb3JDb29yZHMgPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGNvbnN0IGVkaXRvckNvb3JkcyA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSk7XG5cdFx0Y29uc3QgeCA9IGVkaXRvckNvb3Jkcy5sZWZ0ICsgY3Vyc29yQ29vcmRzLmxlZnQ7XG5cdFx0Y29uc3QgeSA9IGVkaXRvckNvb3Jkcy50b3AgKyBjdXJzb3JDb29yZHMudG9wICsgY3Vyc29yQ29vcmRzLmhlaWdodDtcblxuXHRcdHJldHVybiB7IHgsIHkgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFNob3dIZWFkZXJzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmNvZGVBY3Rpb25XaWRnZXQuc2hvd0hlYWRlcnMnLCB7IHJlc291cmNlOiBtb2RlbD8udXJpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aW9uQmFyQWN0aW9ucyhhY3Rpb25zOiBDb2RlQWN0aW9uU2V0LCBhdDogSUFuY2hvciB8IElQb3NpdGlvbiwgb3B0aW9uczogSUFjdGlvblNob3dPcHRpb25zKTogSUFjdGlvbltdIHtcblx0XHRpZiAob3B0aW9ucy5mcm9tTGlnaHRidWxiKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0QWN0aW9ucyA9IGFjdGlvbnMuZG9jdW1lbnRhdGlvbi5tYXAoKGNvbW1hbmQpOiBJQWN0aW9uID0+ICh7XG5cdFx0XHRpZDogY29tbWFuZC5pZCxcblx0XHRcdGxhYmVsOiBjb21tYW5kLnRpdGxlLFxuXHRcdFx0dG9vbHRpcDogY29tbWFuZC50b29sdGlwID8/ICcnLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRydW46ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuaWQsIC4uLihjb21tYW5kLmFyZ3VtZW50cyA/PyBbXSkpLFxuXHRcdH0pKTtcblxuXHRcdGlmIChvcHRpb25zLmluY2x1ZGVEaXNhYmxlZEFjdGlvbnMgJiYgYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID4gMCAmJiBhY3Rpb25zLmFsbEFjdGlvbnMubGVuZ3RoICE9PSBhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdEFjdGlvbnMucHVzaCh0aGlzLl9zaG93RGlzYWJsZWQgPyB7XG5cdFx0XHRcdGlkOiAnaGlkZU1vcmVBY3Rpb25zJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdoaWRlTW9yZUFjdGlvbnMnLCAnSGlkZSBEaXNhYmxlZCcpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0Rpc2FibGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvd0NvZGVBY3Rpb25MaXN0KGFjdGlvbnMsIGF0LCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHtcblx0XHRcdFx0aWQ6ICdzaG93TW9yZUFjdGlvbnMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3dNb3JlQWN0aW9ucycsICdTaG93IERpc2FibGVkJyksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9zaG93RGlzYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNob3dDb2RlQWN0aW9uTGlzdChhY3Rpb25zLCBhdCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHRBY3Rpb25zO1xuXHR9XG59XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGFkZEJhY2tncm91bmRDb2xvclJ1bGUgPSAoc2VsZWN0b3I6IHN0cmluZywgY29sb3I6IENvbG9yIHwgdW5kZWZpbmVkKTogdm9pZCA9PiB7XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgJHtzZWxlY3Rvcn0geyBiYWNrZ3JvdW5kLWNvbG9yOiAke2NvbG9yfTsgfWApO1xuXHRcdH1cblx0fTtcblxuXHRhZGRCYWNrZ3JvdW5kQ29sb3JSdWxlKCcucXVpY2tmaXgtZWRpdC1oaWdobGlnaHQnLCB0aGVtZS5nZXRDb2xvcihlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHQpKTtcblx0Y29uc3QgZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyKTtcblxuXHRpZiAoZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5xdWlja2ZpeC1lZGl0LWhpZ2hsaWdodCB7IGJvcmRlcjogMXB4ICR7aXNIaWdoQ29udHJhc3QodGhlbWUudHlwZSkgPyAnZG90dGVkJyA6ICdzb2xpZCd9ICR7ZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyfTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw4QkFBOEI7QUFDdkMsWUFBWSxVQUFVO0FBS3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsYUFBMEIsdUJBQXVCO0FBQzFELFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQixzQ0FBc0M7QUFDekUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQThCLGtCQUFrQjtBQUNoRCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUF1RCxnQkFBa0QsK0JBQStCO0FBQ2pKLFNBQVMsdUJBQXVCLGlCQUFpQixrQkFBa0IseUJBQXlCO0FBQzVGLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUFTLHNCQUFxQyx1QkFBdUI7QUFDckUsU0FBUywwQkFBMEI7QUFRbkMsTUFBTSx3QkFBd0I7QUFFdkIsSUFBTSx1QkFBTixjQUFtQyxXQUEwQztBQUFBLEVBaURuRixZQUNDLFFBQ2dCLGVBQ0ksbUJBQ0csc0JBQ0cseUJBQ0YsaUJBQ1UsaUJBQ00sdUJBQ0Qsc0JBQ0MsdUJBQ0Msa0JBQ0osb0JBQ3BDO0FBQ0QsVUFBTTtBQVA0QjtBQUNNO0FBQ0Q7QUFDQztBQUNDO0FBQ0o7QUFqRHRDLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxrQkFBaUMsQ0FBQztBQUMzRixTQUFRLGdCQUFnQjtBQUl4QixTQUFRLFlBQVk7QUFVcEIsU0FBUSxtQ0FBbUM7QUFFM0MsU0FBaUIsb0JBQW9CLGdCQUEyQyxNQUFNLE1BQVM7QUFDL0YsU0FBaUIsb0JBQW9CLGdCQUFvQyxNQUFNLE1BQVM7QUFDeEYsU0FBaUIsbUJBQW1CLGdCQUFvQyxNQUFNLE1BQVM7QUFFdkYsU0FBUSw4QkFBOEI7QUFFdEMsU0FBZ0IsaUJBQXlELFlBQXVDO0FBQUEsTUFDL0csT0FBTztBQUFBLE1BQ1AsdUJBQXVCLE1BQU07QUFDNUIsYUFBSyw4QkFBOEI7QUFDbkMsYUFBSyxPQUFPLHFCQUFxQjtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxHQUFHLFlBQVU7QUFDWixVQUFJLENBQUMsS0FBSyw2QkFBNkI7QUFDdEMsYUFBSyw4QkFBOEI7QUFDbkMsYUFBSyxPQUFPLHFCQUFxQjtBQUFBLE1BQ2xDO0FBQ0EsYUFBTyxLQUFLLGtCQUFrQixLQUFLLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBa0JBLFNBQUssVUFBVTtBQUNmLFNBQUssU0FBUyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsS0FBSyxTQUFTLHdCQUF3QixvQkFBb0IsZUFBZSxtQkFBbUIsaUJBQWlCLHFCQUFxQixDQUFDO0FBQ3BMLFNBQUssVUFBVSxLQUFLLE9BQU8saUJBQWlCLGNBQVksS0FBSyxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBRTlFLFNBQUssVUFBVSxNQUFNLGdCQUFnQixLQUFLLG1CQUFtQix3QkFBd0IsTUFBTTtBQUMxRixXQUFLLGtCQUFrQixJQUFJLEtBQUssbUJBQW1CLGlCQUFpQixnQkFBZ0IsR0FBRyxTQUFTLEtBQUssUUFBVyxNQUFTO0FBQ3pILFdBQUssaUJBQWlCLElBQUksS0FBSyxtQkFBbUIsaUJBQWlCLGlCQUFpQixHQUFHLFNBQVMsS0FBSyxRQUFXLE1BQVM7QUFBQSxJQUMxSCxDQUFDLENBQUM7QUFFRixTQUFLLG1CQUFtQixJQUFJLEtBQUssTUFBTTtBQUN0QyxZQUFNLFNBQVMsS0FBSyxRQUFRLGdCQUFpQyxnQkFBZ0IsRUFBRTtBQUMvRSxVQUFJLFFBQVE7QUFDWCxhQUFLLFVBQVUsT0FBTyxRQUFRLE9BQUssS0FBSyw2QkFBNkIsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ25GLGVBQU8seUJBQXlCLEtBQUs7QUFBQSxNQUN0QztBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxTQUFLLFlBQVkscUJBQXFCLGVBQWUsNEJBQTRCO0FBRWpGLFNBQUssVUFBVSxLQUFLLFFBQVEsa0JBQWtCLE1BQU0sS0FBSyxxQkFBcUIsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUN0RjtBQUFBLEVBbEZBLE9BQWMsSUFBSSxRQUFrRDtBQUNuRSxXQUFPLE9BQU8sZ0JBQXNDLHFCQUFxQixFQUFFO0FBQUEsRUFDNUU7QUFBQSxFQWFBLElBQUksZ0NBQWdDLE9BQWdCO0FBQ25ELFVBQU0sU0FBUyxLQUFLLGlCQUFpQjtBQUNyQyxRQUFJLFFBQVE7QUFDWCxhQUFPLHlCQUF5QjtBQUFBLElBQ2pDO0FBQ0EsU0FBSyxtQ0FBbUM7QUFBQSxFQUN6QztBQUFBLEVBK0RTLFVBQVU7QUFDbEIsU0FBSyxZQUFZO0FBQ2pCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQWMsNkJBQTZCLFNBQXdCLElBQXdDO0FBQzFHLFFBQUksUUFBUSxjQUFjLFFBQVEsYUFBYSxXQUFXLEdBQUc7QUFDNUQsWUFBTSxhQUFhLFFBQVEsYUFBYSxDQUFDO0FBQ3pDLFlBQU0sVUFBVSxXQUFXLE9BQU87QUFDbEMsVUFBSSxXQUFXLFFBQVEsT0FBTyxvQkFBb0I7QUFDakQsWUFBSSxRQUFRLGFBQWEsUUFBUSxVQUFVLFVBQVUsS0FBSyxRQUFRLFVBQVUsQ0FBQyxHQUFHO0FBQy9FLGtCQUFRLFVBQVUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxRQUFRLFVBQVUsQ0FBQyxHQUFHLFVBQVUsTUFBTTtBQUFBLFFBQ25FO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxnQkFBZ0IsWUFBWSxPQUFPLE9BQU8sc0JBQXNCLGVBQWU7QUFDMUY7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLLG1CQUFtQixTQUFTLElBQUksRUFBRSx3QkFBd0IsT0FBTyxlQUFlLEtBQUssQ0FBQztBQUFBLEVBQ2xHO0FBQUEsRUFFTyxnQkFBZ0IsVUFBNkIsU0FBd0IsSUFBeUI7QUFDcEcsV0FBTyxLQUFLLG1CQUFtQixTQUFTLElBQUksRUFBRSx3QkFBd0IsT0FBTyxlQUFlLE1BQU0sQ0FBQztBQUFBLEVBQ3BHO0FBQUEsRUFFTyxrQkFBd0I7QUFDOUIsU0FBSyxxQkFBcUIsS0FBSztBQUFBLEVBQ2hDO0FBQUEsRUFFTywrQkFDTixxQkFDQSxlQUNBLFFBQ0EsV0FDTztBQUNQLFFBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzdCO0FBQUEsSUFDRDtBQUVBLHNCQUFrQixJQUFJLEtBQUssT0FBTyxHQUFHLGFBQWE7QUFDbEQsVUFBTSxrQkFBa0IsS0FBSyxRQUFRLFlBQVk7QUFDakQsU0FBSyxTQUFTLEVBQUUsTUFBTSxzQkFBc0IsUUFBUSxlQUFlLFFBQVEsV0FBVyxTQUFTLEVBQUUscUJBQXFCLFVBQVUsZ0JBQWdCLEVBQUUsQ0FBQztBQUFBLEVBQ3BKO0FBQUEsRUFFUSxTQUFTLFNBQTRCO0FBQzVDLFdBQU8sS0FBSyxPQUFPLFFBQVEsT0FBTztBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFNLGdCQUFnQixRQUF3QixXQUFvQixTQUFrQixjQUFvRDtBQUN2SSxVQUFNLFdBQVcsS0FBSyxpQkFBaUIsS0FBSyxNQUFNLEdBQUc7QUFDckQsUUFBSTtBQUNILFlBQU0sS0FBSyxzQkFBc0IsZUFBZSxpQkFBaUIsUUFBUSxjQUFjLEVBQUUsU0FBUyxRQUFRLEtBQUssUUFBUSxDQUFDO0FBQUEsSUFDekgsVUFBRTtBQUNELFVBQUksV0FBVztBQUNkLGFBQUssU0FBUyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sZUFBZSx3QkFBd0IsVUFBVSxRQUFRLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDaEg7QUFDQSxlQUFTLEtBQUs7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUFBLEVBRU8sc0JBQTRCO0FBQ2xDLFNBQUssaUJBQWlCLFVBQVUsS0FBSztBQUNyQyxTQUFLLGlCQUFpQixVQUFVLFdBQVc7QUFBQSxFQUM1QztBQUFBLEVBRUEsTUFBYyxPQUFPLFVBQWlEO0FBQ3JFLFFBQUksU0FBUyxTQUFTLGlCQUFpQixLQUFLLFdBQVc7QUFDdEQsV0FBSyxvQkFBb0I7QUFDekIsV0FBSyxrQkFBa0IsSUFBSSxRQUFXLE1BQVM7QUFDL0M7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSCxnQkFBVSxNQUFNLFNBQVM7QUFBQSxJQUMxQixTQUFTLEdBQUc7QUFDWCx3QkFBa0IsQ0FBQztBQUNuQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssV0FBVztBQUNuQjtBQUFBLElBQ0Q7QUFHQSxVQUFNLFlBQVksS0FBSyxRQUFRLGFBQWE7QUFDNUMsUUFBSSxXQUFXLG9CQUFvQixTQUFTLFNBQVMsWUFBWTtBQUNoRTtBQUFBLElBQ0Q7QUFFQSxTQUFLLGlCQUFpQixPQUFPLE9BQU8sU0FBUyxTQUFTLFNBQVMsU0FBUyxRQUFRO0FBQ2hGLFNBQUssa0JBQWtCLElBQUkscUJBQXFCLFNBQVMsU0FBUyxTQUFTLEtBQUssa0JBQWtCLElBQUksR0FBRyxLQUFLLGlCQUFpQixJQUFJLENBQUMsR0FBRyxNQUFTO0FBRWhKLFFBQUksU0FBUyxRQUFRLFNBQVMsc0JBQXNCLFFBQVE7QUFDM0QsVUFBSSxTQUFTLFFBQVEsUUFBUSxTQUFTO0FBR3JDLGNBQU0scUJBQXFCLEtBQUsseUJBQXlCLFNBQVMsU0FBUyxPQUFPO0FBQ2xGLFlBQUksb0JBQW9CO0FBQ3ZCLGNBQUk7QUFDSCxpQkFBSyxvQkFBb0I7QUFDekIsa0JBQU0sS0FBSyxnQkFBZ0Isb0JBQW9CLE9BQU8sT0FBTyxzQkFBc0IsZUFBZTtBQUFBLFVBQ25HLFVBQUU7QUFDRCxvQkFBUSxRQUFRO0FBQUEsVUFDakI7QUFDQTtBQUFBLFFBQ0Q7QUFHQSxZQUFJLFNBQVMsUUFBUSxTQUFTO0FBQzdCLGdCQUFNLGdCQUFnQixLQUFLLHlDQUF5QyxTQUFTLFNBQVMsT0FBTztBQUM3RixjQUFJLGlCQUFpQixjQUFjLE9BQU8sVUFBVTtBQUNuRCw4QkFBa0IsSUFBSSxLQUFLLE9BQU8sR0FBRyxZQUFZLGNBQWMsT0FBTyxVQUFVLFNBQVMsUUFBUSxRQUFRLFFBQVE7QUFDakgsb0JBQVEsUUFBUTtBQUNoQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0seUJBQXlCLENBQUMsQ0FBQyxTQUFTLFFBQVEsUUFBUTtBQUMxRCxVQUFJLFNBQVMsUUFBUSxTQUFTO0FBQzdCLFlBQUksQ0FBQyxRQUFRLFdBQVcsVUFBVSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsYUFBYSxRQUFRO0FBQzFGLDRCQUFrQixJQUFJLEtBQUssT0FBTyxHQUFHLFlBQVksU0FBUyxRQUFRLFFBQVEscUJBQXFCLFNBQVMsUUFBUSxRQUFRLFFBQVE7QUFDaEksZUFBSyxtQkFBbUIsUUFBUTtBQUNoQyxrQkFBUSxRQUFRO0FBQ2hCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLG1CQUFtQixRQUFRO0FBQ2hDLFdBQUssbUJBQW1CLFNBQVMsS0FBSyxTQUFTLFNBQVMsUUFBUSxHQUFHLEVBQUUsd0JBQXdCLGVBQWUsTUFBTSxDQUFDO0FBQUEsSUFDcEgsT0FBTztBQUVOLFVBQUksS0FBSyxxQkFBcUIsV0FBVztBQUV4QyxnQkFBUSxRQUFRO0FBQUEsTUFDakIsT0FBTztBQUNOLGFBQUssbUJBQW1CLFFBQVE7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx5Q0FBeUMsU0FBNEIsU0FBb0Q7QUFDaEksUUFBSSxDQUFDLFFBQVEsV0FBVyxRQUFRO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSyxRQUFRLGNBQWMsb0JBQW9CLFNBQVMsUUFBUSxhQUFhLFdBQVcsS0FDbkYsUUFBUSxjQUFjLG9CQUFvQixZQUFZLFFBQVEsV0FBVyxXQUFXLEdBQ3ZGO0FBQ0QsYUFBTyxRQUFRLFdBQVcsS0FBSyxDQUFDLEVBQUUsT0FBTyxNQUFNLE9BQU8sUUFBUTtBQUFBLElBQy9EO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHlCQUF5QixTQUE0QixTQUFvRDtBQUNoSCxRQUFJLENBQUMsUUFBUSxhQUFhLFFBQVE7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFLLFFBQVEsY0FBYyxvQkFBb0IsU0FBUyxRQUFRLGFBQWEsU0FBUyxLQUNqRixRQUFRLGNBQWMsb0JBQW9CLFlBQVksUUFBUSxhQUFhLFdBQVcsR0FDekY7QUFDRCxhQUFPLFFBQVEsYUFBYSxDQUFDO0FBQUEsSUFDOUI7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBT0EsTUFBYSxtQkFBbUIsU0FBd0IsSUFBeUIsU0FBNEM7QUFFNUgsVUFBTSxxQkFBcUIsS0FBSyxRQUFRLDRCQUE0QjtBQUVwRSxVQUFNLFlBQVksS0FBSyxRQUFRLFdBQVc7QUFDMUMsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixRQUFRLDJCQUEyQixLQUFLLGlCQUFpQixRQUFRLGFBQWEsV0FBVyxLQUFLLFFBQVEsYUFBYSxRQUFRO0FBQ2pKLFFBQUksQ0FBQyxjQUFjLFFBQVE7QUFDMUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLFNBQVMsWUFBWSxFQUFFLElBQUksS0FBSyxTQUFTLEVBQUUsSUFBSTtBQUU5RCxVQUFNLFdBQWdEO0FBQUEsTUFDckQsVUFBVSxPQUFPLFFBQXdCLFlBQXNCO0FBQzlELGFBQUs7QUFBQSxVQUFnQjtBQUFBO0FBQUEsVUFBd0I7QUFBQSxVQUFNLENBQUMsQ0FBQztBQUFBLFVBQVMsUUFBUSxnQkFBZ0Isc0JBQXNCLGtCQUFrQixzQkFBc0I7QUFBQSxRQUFlO0FBQ25LLGFBQUsscUJBQXFCLEtBQUssS0FBSztBQUNwQywyQkFBbUIsTUFBTTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxRQUFRLENBQUMsY0FBZTtBQUN2QixhQUFLLFNBQVMsTUFBTTtBQUNwQiwyQkFBbUIsTUFBTTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxTQUFTLE9BQU8sUUFBd0IsVUFBNkI7QUFDcEUsWUFBSSxNQUFNLHlCQUF5QjtBQUNsQztBQUFBLFFBQ0Q7QUFFQSxZQUFJLGFBQWE7QUFDakIsY0FBTSxhQUFhLE9BQU8sT0FBTztBQUVqQyxZQUFJLFlBQVk7QUFDZixnQkFBTSxtQkFBbUIsSUFBSSxpQkFBaUIsVUFBVTtBQUN4RCxnQkFBTSxnQkFBZ0I7QUFBQSxZQUNyQixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsVUFDaEI7QUFFQSx1QkFBYSxjQUFjLEtBQUssa0JBQWdCLGFBQWEsU0FBUyxnQkFBZ0IsQ0FBQztBQUFBLFFBQ3hGO0FBRUEsZUFBTyxFQUFFLFlBQVksY0FBYyxDQUFDLENBQUMsT0FBTyxPQUFPLE1BQU0sTUFBTSxPQUFPO0FBQUEsTUFDdkU7QUFBQSxNQUNBLFNBQVMsQ0FBQyxXQUF1QztBQUNoRCxZQUFJLFVBQVUsT0FBTyxRQUFRO0FBQzVCLGdCQUFNLFNBQVMsT0FBTyxPQUFPO0FBQzdCLGdCQUFNLGNBQWMsT0FBTyxPQUFPO0FBQ2xDLDZCQUFtQixNQUFNO0FBQ3pCLGNBQUksVUFBVSxPQUFPLFNBQVMsR0FBRztBQUVoQyxrQkFBTSxjQUF3QyxlQUFlLGFBQWEsU0FBUyxJQUNoRixZQUFZLElBQUksaUJBQWUsRUFBRSxPQUFPLFlBQVksU0FBUyxxQkFBcUIsV0FBVyxFQUFFLElBQy9GLE9BQU8sSUFBSSxZQUFVLEVBQUUsT0FBTyxTQUFTLHFCQUFxQixXQUFXLEVBQUU7QUFDNUUsK0JBQW1CLElBQUksV0FBVztBQUFBLFVBQ25DLFdBQVcsZUFBZSxZQUFZLFNBQVMsR0FBRztBQUNqRCxrQkFBTSxjQUF1QyxZQUFZLElBQUksQ0FBQUEsaUJBQWUsRUFBRSxPQUFPQSxhQUFZLFNBQVMscUJBQXFCLFdBQVcsRUFBRTtBQUM1SSwrQkFBbUIsSUFBSSxXQUFXO0FBQ2xDLGtCQUFNLGFBQWEsWUFBWSxDQUFDO0FBQ2hDLGdCQUFJLFdBQVcsbUJBQW1CLFdBQVcsYUFBYTtBQUN6RCxvQkFBTSxnQkFBZ0IsS0FBSyxRQUFRLFNBQVMsR0FBRyxrQkFBa0IsRUFBRSxZQUFZLFdBQVcsaUJBQWlCLFFBQVEsV0FBVyxZQUFZLENBQUMsR0FBRztBQUM5SSxtQkFBSyxPQUFPLFNBQVMsdUJBQXVCLDRDQUE0QyxlQUFlLFdBQVcsaUJBQWlCLFdBQVcsV0FBVyxDQUFDO0FBQUEsWUFDM0o7QUFBQSxVQUNEO0FBQUEsUUFDRCxPQUFPO0FBQ04sNkJBQW1CLE1BQU07QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxxQkFBcUI7QUFBQSxNQUN6QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFlBQVksZUFBZSxLQUFLLG1CQUFtQixHQUFHLEtBQUssVUFBVSxZQUFZLENBQUM7QUFBQSxNQUNsRjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLLHFCQUFxQixTQUFTLElBQUksT0FBTztBQUFBLElBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRVEsU0FBUyxVQUE4QjtBQUM5QyxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QixhQUFPLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLElBQ3JCO0FBRUEsU0FBSyxRQUFRLGVBQWUsVUFBVSxXQUFXLFNBQVM7QUFDMUQsU0FBSyxRQUFRLE9BQU87QUFHcEIsVUFBTSxlQUFlLEtBQUssUUFBUSwyQkFBMkIsUUFBUTtBQUNyRSxVQUFNLGVBQWUsdUJBQXVCLEtBQUssUUFBUSxXQUFXLENBQUM7QUFDckUsVUFBTSxJQUFJLGFBQWEsT0FBTyxhQUFhO0FBQzNDLFVBQU0sSUFBSSxhQUFhLE1BQU0sYUFBYSxNQUFNLGFBQWE7QUFFN0QsV0FBTyxFQUFFLEdBQUcsRUFBRTtBQUFBLEVBQ2Y7QUFBQSxFQUVRLHFCQUE4QjtBQUNyQyxVQUFNLFFBQVEsS0FBSyxTQUFTLFNBQVM7QUFDckMsV0FBTyxLQUFLLHNCQUFzQixTQUFTLHVDQUF1QyxFQUFFLFVBQVUsT0FBTyxJQUFJLENBQUM7QUFBQSxFQUMzRztBQUFBLEVBRVEscUJBQXFCLFNBQXdCLElBQXlCLFNBQXdDO0FBQ3JILFFBQUksUUFBUSxlQUFlO0FBQzFCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLGdCQUFnQixRQUFRLGNBQWMsSUFBSSxDQUFDLGFBQXNCO0FBQUEsTUFDdEUsSUFBSSxRQUFRO0FBQUEsTUFDWixPQUFPLFFBQVE7QUFBQSxNQUNmLFNBQVMsUUFBUSxXQUFXO0FBQUEsTUFDNUIsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsS0FBSyxNQUFNLEtBQUssZ0JBQWdCLGVBQWUsUUFBUSxJQUFJLEdBQUksUUFBUSxhQUFhLENBQUMsQ0FBRTtBQUFBLElBQ3hGLEVBQUU7QUFFRixRQUFJLFFBQVEsMEJBQTBCLFFBQVEsYUFBYSxTQUFTLEtBQUssUUFBUSxXQUFXLFdBQVcsUUFBUSxhQUFhLFFBQVE7QUFDbkksb0JBQWMsS0FBSyxLQUFLLGdCQUFnQjtBQUFBLFFBQ3ZDLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyxtQkFBbUIsZUFBZTtBQUFBLFFBQ2xELFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxRQUNULE9BQU87QUFBQSxRQUNQLEtBQUssTUFBTTtBQUNWLGVBQUssZ0JBQWdCO0FBQ3JCLGlCQUFPLEtBQUssbUJBQW1CLFNBQVMsSUFBSSxPQUFPO0FBQUEsUUFDcEQ7QUFBQSxNQUNELElBQUk7QUFBQSxRQUNILElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyxtQkFBbUIsZUFBZTtBQUFBLFFBQ2xELFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxRQUNULE9BQU87QUFBQSxRQUNQLEtBQUssTUFBTTtBQUNWLGVBQUssZ0JBQWdCO0FBQ3JCLGlCQUFPLEtBQUssbUJBQW1CLFNBQVMsSUFBSSxPQUFPO0FBQUEsUUFDcEQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXpaYSxxQkFFVyxLQUFLO0FBRmhCLHFCQWlRWSxhQUFhLHVCQUF1QixTQUFTO0FBQUEsRUFDcEUsYUFBYTtBQUFBLEVBQ2IsV0FBVztBQUNaLENBQUM7QUFwUVcsdUJBQU47QUFBQSxFQW1ESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTdEVTtBQTJaYiwyQkFBMkIsQ0FBQyxPQUFPLGNBQWM7QUFDaEQsUUFBTSx5QkFBeUIsQ0FBQyxVQUFrQixVQUFtQztBQUNwRixRQUFJLE9BQU87QUFDVixnQkFBVSxRQUFRLGtCQUFrQixRQUFRLHdCQUF3QixLQUFLLEtBQUs7QUFBQSxJQUMvRTtBQUFBLEVBQ0Q7QUFFQSx5QkFBdUIsNEJBQTRCLE1BQU0sU0FBUyx3QkFBd0IsQ0FBQztBQUMzRixRQUFNLDJCQUEyQixNQUFNLFNBQVMsOEJBQThCO0FBRTlFLE1BQUksMEJBQTBCO0FBQzdCLGNBQVUsUUFBUSx5REFBeUQsZUFBZSxNQUFNLElBQUksSUFBSSxXQUFXLE9BQU8sSUFBSSx3QkFBd0IsNkJBQTZCO0FBQUEsRUFDcEw7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJkaWFnbm9zdGljIl0KfQo=
