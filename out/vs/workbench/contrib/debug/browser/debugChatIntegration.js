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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, debouncedObservable, derived, ObservablePromise, observableValue } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IChatContextPickService } from "../../chat/browser/attachments/chatContextPickService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IDebugService, State } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
var PickerMode = /* @__PURE__ */ ((PickerMode2) => {
  PickerMode2["Main"] = "main";
  PickerMode2["Expression"] = "expression";
  return PickerMode2;
})(PickerMode || {});
let DebugSessionContextPick = class {
  constructor(debugService) {
    this.debugService = debugService;
    this.type = "pickerPick";
    this.label = localize("chatContext.debugSession", "Debug Session...");
    this.icon = Codicon.debug;
    this.ordinal = -200;
  }
  isEnabled() {
    const viewModel = this.debugService.getViewModel();
    const focusedSession = viewModel.focusedSession;
    return !!focusedSession && focusedSession.state === State.Stopped;
  }
  asPicker(_widget) {
    const store = new DisposableStore();
    const mode = observableValue("debugPicker.mode", "main" /* Main */);
    const query = observableValue("debugPicker.query", "");
    const picksObservable = this.createPicksObservable(mode, query, store);
    return {
      placeholder: localize("selectDebugData", "Select debug data to attach"),
      picks: (_queryObs, token) => {
        store.add(autorun((reader) => {
          query.set(_queryObs.read(reader), void 0);
        }));
        const cts = new CancellationTokenSource(token);
        store.add(toDisposable(() => cts.dispose(true)));
        return picksObservable;
      },
      goBack: () => {
        if (mode.get() === "expression" /* Expression */) {
          mode.set("main" /* Main */, void 0);
          return true;
        }
        return false;
      },
      dispose: () => store.dispose()
    };
  }
  createPicksObservable(mode, query, store) {
    const debouncedQuery = debouncedObservable(query, 300);
    return derived((reader) => {
      const currentMode = mode.read(reader);
      if (currentMode === "expression" /* Expression */) {
        return this.getExpressionPicks(debouncedQuery, store);
      } else {
        return this.getMainPicks(mode);
      }
    }).flatten();
  }
  getMainPicks(mode) {
    const promise = derived((_reader) => {
      return new ObservablePromise(this.buildMainPicks(mode));
    });
    return promise.map((value, reader) => {
      const result = value.promiseResult.read(reader);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async buildMainPicks(mode) {
    const picks = [];
    const viewModel = this.debugService.getViewModel();
    const stackFrame = viewModel.focusedStackFrame;
    const session = viewModel.focusedSession;
    if (!session || !stackFrame) {
      return picks;
    }
    picks.push({
      label: localize("expressionValue", "Expression Value..."),
      iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
      asAttachment: () => {
        mode.set("expression" /* Expression */, void 0);
        return "noop";
      }
    });
    const watches = this.debugService.getModel().getWatchExpressions();
    if (watches.length > 0) {
      picks.push({ type: "separator", label: localize("watchExpressions", "Watch Expressions") });
      for (const watch of watches) {
        picks.push({
          label: watch.name,
          description: watch.value,
          iconClass: ThemeIcon.asClassName(Codicon.eye),
          asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(watch))
        });
      }
    }
    let scopes = [];
    try {
      scopes = await stackFrame.getScopes();
    } catch {
    }
    for (const scope of scopes) {
      if (scope.expensive && !scope.childrenHaveBeenLoaded) {
        continue;
      }
      picks.push({ type: "separator", label: scope.name });
      try {
        const variables = await scope.getChildren();
        if (variables.length > 1) {
          picks.push({
            label: localize("allVariablesInScope", "All variables in {0}", scope.name),
            iconClass: ThemeIcon.asClassName(Codicon.symbolNamespace),
            asAttachment: () => createDebugAttachments(stackFrame, createScopeEntry(scope, variables))
          });
        }
        for (const variable of variables) {
          picks.push({
            label: variable.name,
            description: formatVariableDescription(variable),
            iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
            asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(variable))
          });
        }
      } catch {
      }
    }
    return picks;
  }
  getExpressionPicks(query, _store) {
    const promise = derived((reader) => {
      const queryValue = query.read(reader);
      const cts = new CancellationTokenSource();
      reader.store.add(toDisposable(() => cts.dispose(true)));
      return new ObservablePromise(this.evaluateExpression(queryValue, cts.token));
    });
    return promise.map((value, r) => {
      const result = value.promiseResult.read(r);
      return { picks: result?.data || [], busy: result === void 0 };
    });
  }
  async evaluateExpression(expression, token) {
    if (!expression.trim()) {
      return [{
        label: localize("typeExpression", "Type an expression to evaluate..."),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
    const viewModel = this.debugService.getViewModel();
    const session = viewModel.focusedSession;
    const stackFrame = viewModel.focusedStackFrame;
    if (!session || !stackFrame) {
      return [{
        label: localize("noDebugSession", "No active debug session"),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
    try {
      const response = await session.evaluate(expression, stackFrame.frameId, "watch");
      if (token.isCancellationRequested) {
        return [];
      }
      if (response?.body) {
        const resultValue = response.body.result;
        const resultType = response.body.type;
        return [{
          label: expression,
          description: formatExpressionResult(resultValue, resultType),
          iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
          asAttachment: () => createDebugAttachments(stackFrame, {
            kind: "debugVariable",
            id: `debug-expression:${expression}`,
            name: expression,
            fullName: expression,
            icon: Codicon.debug,
            value: resultValue,
            expression,
            type: resultType,
            modelDescription: formatModelDescription(expression, resultValue, resultType)
          })
        }];
      } else {
        return [{
          label: expression,
          description: localize("noResult", "No result"),
          disabled: true,
          asAttachment: () => "noop"
        }];
      }
    } catch (err) {
      return [{
        label: expression,
        description: err instanceof Error ? err.message : localize("evaluationError", "Evaluation error"),
        disabled: true,
        asAttachment: () => "noop"
      }];
    }
  }
};
DebugSessionContextPick = __decorateClass([
  __decorateParam(0, IDebugService)
], DebugSessionContextPick);
function createDebugVariableEntry(expression) {
  return {
    kind: "debugVariable",
    id: `debug-variable:${expression.getId()}`,
    name: expression.name,
    fullName: expression.name,
    icon: Codicon.debug,
    value: expression.value,
    expression: expression.name,
    type: expression.type,
    modelDescription: formatModelDescription(expression.name, expression.value, expression.type)
  };
}
function createPausedLocationEntry(stackFrame) {
  const uri = stackFrame.source.uri;
  let range = Range.lift(stackFrame.range);
  if (range.isEmpty()) {
    range = range.setEndPosition(range.startLineNumber + 1, 1);
  }
  return {
    kind: "file",
    value: { uri, range },
    id: `debug-paused-location:${uri.toString()}:${range.startLineNumber}`,
    name: basename(uri),
    modelDescription: "The debugger is currently paused at this location"
  };
}
function createDebugAttachments(stackFrame, variableEntry) {
  return [
    createPausedLocationEntry(stackFrame),
    variableEntry
  ];
}
function createScopeEntry(scope, variables) {
  const variablesSummary = variables.map((v) => `${v.name}: ${v.value}`).join("\n");
  return {
    kind: "debugVariable",
    id: `debug-scope:${scope.name}`,
    name: `Scope: ${scope.name}`,
    fullName: `Scope: ${scope.name}`,
    icon: Codicon.debug,
    value: variablesSummary,
    expression: scope.name,
    type: "scope",
    modelDescription: `Debug scope "${scope.name}" with ${variables.length} variables:
${variablesSummary}`
  };
}
function formatVariableDescription(expression) {
  const value = expression.value;
  const type = expression.type;
  if (type && value) {
    return `${type}: ${value}`;
  }
  return value || type || "";
}
function formatExpressionResult(value, type) {
  if (type && value) {
    return `${type}: ${value}`;
  }
  return value || type || "";
}
function formatModelDescription(name, value, type) {
  let description = `Debug variable "${name}"`;
  if (type) {
    description += ` of type ${type}`;
  }
  description += ` with value: ${value}`;
  return description;
}
let DebugChatContextContribution = class extends Disposable {
  constructor(contextPickService, instantiationService) {
    super();
    this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(DebugSessionContextPick)));
  }
};
DebugChatContextContribution.ID = "workbench.contrib.chat.debugChatContextContribution";
DebugChatContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService)
], DebugChatContextContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addVariableToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugVariablesContext,
        group: "z_commands",
        order: 110,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!widget) {
      return;
    }
    const entry = createDebugVariableEntryFromContext(context);
    if (entry) {
      const stackFrame = debugService.getViewModel().focusedStackFrame;
      if (stackFrame) {
        widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
      }
      widget.attachmentModel.addContext(entry);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addWatchExpressionToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugWatchContext,
        group: "z_commands",
        order: 110,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!context || !widget) {
      return;
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    if (stackFrame) {
      widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
    }
    widget.attachmentModel.addContext(createDebugVariableEntry(context));
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.debug.action.addScopeToChat",
      title: localize("addToChat", "Add to Chat"),
      f1: false,
      menu: {
        id: MenuId.DebugScopesContext,
        group: "z_commands",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const debugService = accessor.get(IDebugService);
    const widget = await chatWidgetService.revealWidget();
    if (!context || !widget) {
      return;
    }
    const viewModel = debugService.getViewModel();
    const stackFrame = viewModel.focusedStackFrame;
    if (!stackFrame) {
      return;
    }
    try {
      const scopes = await stackFrame.getScopes();
      const scope = scopes.find((s) => s.name === context.scope.name);
      if (scope) {
        const variables = await scope.getChildren();
        widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
        widget.attachmentModel.addContext(createScopeEntry(scope, variables));
      }
    } catch {
    }
  }
});
function isVariablesContext(context) {
  return typeof context === "object" && context !== null && "variable" in context && "sessionId" in context;
}
function createDebugVariableEntryFromContext(context) {
  if (context instanceof Variable) {
    return createDebugVariableEntry(context);
  }
  if (isVariablesContext(context)) {
    const variable = context.variable;
    return {
      kind: "debugVariable",
      id: `debug-variable:${variable.name}`,
      name: variable.name,
      fullName: variable.evaluateName ?? variable.name,
      icon: Codicon.debug,
      value: variable.value,
      expression: variable.evaluateName ?? variable.name,
      type: variable.type,
      modelDescription: formatModelDescription(variable.evaluateName || variable.name, variable.value, variable.type)
    };
  }
  return void 0;
}
export {
  DebugChatContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDaGF0SW50ZWdyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlYm91bmNlZE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFBpY2ssIElDaGF0Q29udGV4dFBpY2tlciwgSUNoYXRDb250ZXh0UGlja2VySXRlbSwgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RGaWxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElEZWJ1Z1ZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElFeHByZXNzaW9uLCBJU2NvcGUsIElTdGFja0ZyYW1lLCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBWYXJpYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcblxuY29uc3QgZW51bSBQaWNrZXJNb2RlIHtcblx0TWFpbiA9ICdtYWluJyxcblx0RXhwcmVzc2lvbiA9ICdleHByZXNzaW9uJyxcbn1cblxuY2xhc3MgRGVidWdTZXNzaW9uQ29udGV4dFBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtIHtcblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuZGVidWdTZXNzaW9uJywgJ0RlYnVnIFNlc3Npb24uLi4nKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uZGVidWc7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSAtMjAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHQvLyBPbmx5IGVuYWJsZWQgd2hlbiB0aGVyZSdzIGEgZm9jdXNlZCBzZXNzaW9uIHRoYXQgaXMgc3RvcHBlZCAocGF1c2VkKVxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gdmlld01vZGVsLmZvY3VzZWRTZXNzaW9uO1xuXHRcdHJldHVybiAhIWZvY3VzZWRTZXNzaW9uICYmIGZvY3VzZWRTZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkO1xuXHR9XG5cblx0YXNQaWNrZXIoX3dpZGdldDogSUNoYXRXaWRnZXQpOiBJQ2hhdENvbnRleHRQaWNrZXIge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8UGlja2VyTW9kZT4gPSBvYnNlcnZhYmxlVmFsdWUoJ2RlYnVnUGlja2VyLm1vZGUnLCBQaWNrZXJNb2RlLk1haW4pO1xuXHRcdGNvbnN0IHF1ZXJ5OiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZz4gPSBvYnNlcnZhYmxlVmFsdWUoJ2RlYnVnUGlja2VyLnF1ZXJ5JywgJycpO1xuXG5cdFx0Y29uc3QgcGlja3NPYnNlcnZhYmxlID0gdGhpcy5jcmVhdGVQaWNrc09ic2VydmFibGUobW9kZSwgcXVlcnksIHN0b3JlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdERlYnVnRGF0YScsICdTZWxlY3QgZGVidWcgZGF0YSB0byBhdHRhY2gnKSxcblx0XHRcdHBpY2tzOiAoX3F1ZXJ5T2JzOiBJT2JzZXJ2YWJsZTxzdHJpbmc+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Ly8gQ29ubmVjdCB0aGUgZXh0ZXJuYWwgcXVlcnkgb2JzZXJ2YWJsZSB0byBvdXIgaW50ZXJuYWwgb25lXG5cdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0cXVlcnkuc2V0KF9xdWVyeU9icy5yZWFkKHJlYWRlciksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRcdFx0cmV0dXJuIHBpY2tzT2JzZXJ2YWJsZTtcblx0XHRcdH0sXG5cdFx0XHRnb0JhY2s6ICgpID0+IHtcblx0XHRcdFx0aWYgKG1vZGUuZ2V0KCkgPT09IFBpY2tlck1vZGUuRXhwcmVzc2lvbikge1xuXHRcdFx0XHRcdG1vZGUuc2V0KFBpY2tlck1vZGUuTWFpbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gU3RheSBpbiBwaWNrZXJcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIEdvIGJhY2sgdG8gbWFpbiBjb250ZXh0IG1lbnVcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGlja3NPYnNlcnZhYmxlKFxuXHRcdG1vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8UGlja2VyTW9kZT4sXG5cdFx0cXVlcnk6IElPYnNlcnZhYmxlPHN0cmluZz4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZVxuXHQpOiBJT2JzZXJ2YWJsZTx7IGJ1c3k6IGJvb2xlYW47IHBpY2tzOiBDaGF0Q29udGV4dFBpY2tbXSB9PiB7XG5cdFx0Y29uc3QgZGVib3VuY2VkUXVlcnkgPSBkZWJvdW5jZWRPYnNlcnZhYmxlKHF1ZXJ5LCAzMDApO1xuXG5cdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gbW9kZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmIChjdXJyZW50TW9kZSA9PT0gUGlja2VyTW9kZS5FeHByZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldEV4cHJlc3Npb25QaWNrcyhkZWJvdW5jZWRRdWVyeSwgc3RvcmUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0TWFpblBpY2tzKG1vZGUpO1xuXHRcdFx0fVxuXHRcdH0pLmZsYXR0ZW4oKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFpblBpY2tzKG1vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8UGlja2VyTW9kZT4pOiBJT2JzZXJ2YWJsZTx7IGJ1c3k6IGJvb2xlYW47IHBpY2tzOiBDaGF0Q29udGV4dFBpY2tbXSB9PiB7XG5cdFx0Ly8gUmV0dXJuIGFuIG9ic2VydmFibGUgdGhhdCByZXNvbHZlcyB0byB0aGUgbWFpbiBwaWNrc1xuXHRcdGNvbnN0IHByb21pc2UgPSBkZXJpdmVkKF9yZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBPYnNlcnZhYmxlUHJvbWlzZSh0aGlzLmJ1aWxkTWFpblBpY2tzKG1vZGUpKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm9taXNlLm1hcCgodmFsdWUsIHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdmFsdWUucHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4geyBwaWNrczogcmVzdWx0Py5kYXRhIHx8IFtdLCBidXN5OiByZXN1bHQgPT09IHVuZGVmaW5lZCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBidWlsZE1haW5QaWNrcyhtb2RlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFBpY2tlck1vZGU+KTogUHJvbWlzZTxDaGF0Q29udGV4dFBpY2tbXT4ge1xuXHRcdGNvbnN0IHBpY2tzOiBDaGF0Q29udGV4dFBpY2tbXSA9IFtdO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbjtcblxuXHRcdGlmICghc2Vzc2lvbiB8fCAhc3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuIHBpY2tzO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBcIkV4cHJlc3Npb24gVmFsdWUuLi5cIiBvcHRpb24gYXQgdGhlIHRvcFxuXHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHByZXNzaW9uVmFsdWUnLCAnRXhwcmVzc2lvbiBWYWx1ZS4uLicpLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zeW1ib2xWYXJpYWJsZSksXG5cdFx0XHRhc0F0dGFjaG1lbnQ6ICgpID0+IHtcblx0XHRcdFx0Ly8gU3dpdGNoIHRvIGV4cHJlc3Npb24gbW9kZVxuXHRcdFx0XHRtb2RlLnNldChQaWNrZXJNb2RlLkV4cHJlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiAnbm9vcCc7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gQWRkIHdhdGNoIGV4cHJlc3Npb25zIHNlY3Rpb25cblx0XHRjb25zdCB3YXRjaGVzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRXYXRjaEV4cHJlc3Npb25zKCk7XG5cdFx0aWYgKHdhdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3dhdGNoRXhwcmVzc2lvbnMnLCAnV2F0Y2ggRXhwcmVzc2lvbnMnKSB9KTtcblx0XHRcdGZvciAoY29uc3Qgd2F0Y2ggb2Ygd2F0Y2hlcykge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogd2F0Y2gubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogd2F0Y2gudmFsdWUsXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leWUpLFxuXHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9PiBjcmVhdGVEZWJ1Z0F0dGFjaG1lbnRzKHN0YWNrRnJhbWUsIGNyZWF0ZURlYnVnVmFyaWFibGVFbnRyeSh3YXRjaCkpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgc2NvcGVzIGFuZCB0aGVpciB2YXJpYWJsZXNcblx0XHRsZXQgc2NvcGVzOiBJU2NvcGVbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRzY29wZXMgPSBhd2FpdCBzdGFja0ZyYW1lLmdldFNjb3BlcygpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWdub3JlIGVycm9ycyB3aGVuIGZldGNoaW5nIHNjb3Blc1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG5cdFx0XHQvLyBJbmNsdWRlIHZhcmlhYmxlcyBmcm9tIG5vbi1leHBlbnNpdmUgc2NvcGVzXG5cdFx0XHRpZiAoc2NvcGUuZXhwZW5zaXZlICYmICFzY29wZS5jaGlsZHJlbkhhdmVCZWVuTG9hZGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBzY29wZS5uYW1lIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdmFyaWFibGVzID0gYXdhaXQgc2NvcGUuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0aWYgKHZhcmlhYmxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbFZhcmlhYmxlc0luU2NvcGUnLCAnQWxsIHZhcmlhYmxlcyBpbiB7MH0nLCBzY29wZS5uYW1lKSxcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3ltYm9sTmFtZXNwYWNlKSxcblx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9PiBjcmVhdGVEZWJ1Z0F0dGFjaG1lbnRzKHN0YWNrRnJhbWUsIGNyZWF0ZVNjb3BlRW50cnkoc2NvcGUsIHZhcmlhYmxlcykpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogdmFyaWFibGUubmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBmb3JtYXRWYXJpYWJsZURlc2NyaXB0aW9uKHZhcmlhYmxlKSxcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3ltYm9sVmFyaWFibGUpLFxuXHRcdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0+IGNyZWF0ZURlYnVnQXR0YWNobWVudHMoc3RhY2tGcmFtZSwgY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJZ25vcmUgZXJyb3JzIHdoZW4gZmV0Y2hpbmcgdmFyaWFibGVzXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHByZXNzaW9uUGlja3MoXG5cdFx0cXVlcnk6IElPYnNlcnZhYmxlPHN0cmluZz4sXG5cdFx0X3N0b3JlOiBEaXNwb3NhYmxlU3RvcmVcblx0KTogSU9ic2VydmFibGU8eyBidXN5OiBib29sZWFuOyBwaWNrczogQ2hhdENvbnRleHRQaWNrW10gfT4ge1xuXHRcdGNvbnN0IHByb21pc2UgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHF1ZXJ5VmFsdWUgPSBxdWVyeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRyZXR1cm4gbmV3IE9ic2VydmFibGVQcm9taXNlKHRoaXMuZXZhbHVhdGVFeHByZXNzaW9uKHF1ZXJ5VmFsdWUsIGN0cy50b2tlbikpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHByb21pc2UubWFwKCh2YWx1ZSwgcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdmFsdWUucHJvbWlzZVJlc3VsdC5yZWFkKHIpO1xuXHRcdFx0cmV0dXJuIHsgcGlja3M6IHJlc3VsdD8uZGF0YSB8fCBbXSwgYnVzeTogcmVzdWx0ID09PSB1bmRlZmluZWQgfTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXZhbHVhdGVFeHByZXNzaW9uKGV4cHJlc3Npb246IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDaGF0Q29udGV4dFBpY2tbXT4ge1xuXHRcdGlmICghZXhwcmVzc2lvbi50cmltKCkpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R5cGVFeHByZXNzaW9uJywgJ1R5cGUgYW4gZXhwcmVzc2lvbiB0byBldmFsdWF0ZS4uLicpLFxuXHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0YXNBdHRhY2htZW50OiAoKSA9PiAnbm9vcCcsXG5cdFx0XHR9XTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWU7XG5cblx0XHRpZiAoIXNlc3Npb24gfHwgIXN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vRGVidWdTZXNzaW9uJywgJ05vIGFjdGl2ZSBkZWJ1ZyBzZXNzaW9uJyksXG5cdFx0XHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpID0+ICdub29wJyxcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uZXZhbHVhdGUoZXhwcmVzc2lvbiwgc3RhY2tGcmFtZS5mcmFtZUlkLCAnd2F0Y2gnKTtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3BvbnNlPy5ib2R5KSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdFZhbHVlID0gcmVzcG9uc2UuYm9keS5yZXN1bHQ7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdFR5cGUgPSByZXNwb25zZS5ib2R5LnR5cGU7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBleHByZXNzaW9uLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBmb3JtYXRFeHByZXNzaW9uUmVzdWx0KHJlc3VsdFZhbHVlLCByZXN1bHRUeXBlKSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnN5bWJvbFZhcmlhYmxlKSxcblx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPT4gY3JlYXRlRGVidWdBdHRhY2htZW50cyhzdGFja0ZyYW1lLCB7XG5cdFx0XHRcdFx0XHRraW5kOiAnZGVidWdWYXJpYWJsZScsXG5cdFx0XHRcdFx0XHRpZDogYGRlYnVnLWV4cHJlc3Npb246JHtleHByZXNzaW9ufWAsXG5cdFx0XHRcdFx0XHRuYW1lOiBleHByZXNzaW9uLFxuXHRcdFx0XHRcdFx0ZnVsbE5hbWU6IGV4cHJlc3Npb24sXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmRlYnVnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHJlc3VsdFZhbHVlLFxuXHRcdFx0XHRcdFx0ZXhwcmVzc2lvbjogZXhwcmVzc2lvbixcblx0XHRcdFx0XHRcdHR5cGU6IHJlc3VsdFR5cGUsXG5cdFx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBmb3JtYXRNb2RlbERlc2NyaXB0aW9uKGV4cHJlc3Npb24sIHJlc3VsdFZhbHVlLCByZXN1bHRUeXBlKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRsYWJlbDogZXhwcmVzc2lvbixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vUmVzdWx0JywgJ05vIHJlc3VsdCcpLFxuXHRcdFx0XHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4gJ25vb3AnLFxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRsYWJlbDogZXhwcmVzc2lvbixcblx0XHRcdFx0ZGVzY3JpcHRpb246IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBsb2NhbGl6ZSgnZXZhbHVhdGlvbkVycm9yJywgJ0V2YWx1YXRpb24gZXJyb3InKSxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4gJ25vb3AnLFxuXHRcdFx0fV07XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURlYnVnVmFyaWFibGVFbnRyeShleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IElEZWJ1Z1ZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdkZWJ1Z1ZhcmlhYmxlJyxcblx0XHRpZDogYGRlYnVnLXZhcmlhYmxlOiR7ZXhwcmVzc2lvbi5nZXRJZCgpfWAsXG5cdFx0bmFtZTogZXhwcmVzc2lvbi5uYW1lLFxuXHRcdGZ1bGxOYW1lOiBleHByZXNzaW9uLm5hbWUsXG5cdFx0aWNvbjogQ29kaWNvbi5kZWJ1Zyxcblx0XHR2YWx1ZTogZXhwcmVzc2lvbi52YWx1ZSxcblx0XHRleHByZXNzaW9uOiBleHByZXNzaW9uLm5hbWUsXG5cdFx0dHlwZTogZXhwcmVzc2lvbi50eXBlLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246IGZvcm1hdE1vZGVsRGVzY3JpcHRpb24oZXhwcmVzc2lvbi5uYW1lLCBleHByZXNzaW9uLnZhbHVlLCBleHByZXNzaW9uLnR5cGUpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYXVzZWRMb2NhdGlvbkVudHJ5KHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lKTogSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IHtcblx0Y29uc3QgdXJpID0gc3RhY2tGcmFtZS5zb3VyY2UudXJpO1xuXHRsZXQgcmFuZ2UgPSBSYW5nZS5saWZ0KHN0YWNrRnJhbWUucmFuZ2UpO1xuXHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0cmFuZ2UgPSByYW5nZS5zZXRFbmRQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIgKyAxLCAxKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2ZpbGUnLFxuXHRcdHZhbHVlOiB7IHVyaSwgcmFuZ2UgfSxcblx0XHRpZDogYGRlYnVnLXBhdXNlZC1sb2NhdGlvbjoke3VyaS50b1N0cmluZygpfToke3JhbmdlLnN0YXJ0TGluZU51bWJlcn1gLFxuXHRcdG5hbWU6IGJhc2VuYW1lKHVyaSksXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1RoZSBkZWJ1Z2dlciBpcyBjdXJyZW50bHkgcGF1c2VkIGF0IHRoaXMgbG9jYXRpb24nLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWJ1Z0F0dGFjaG1lbnRzKHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lLCB2YXJpYWJsZUVudHJ5OiBJRGVidWdWYXJpYWJsZUVudHJ5KTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0cmV0dXJuIFtcblx0XHRjcmVhdGVQYXVzZWRMb2NhdGlvbkVudHJ5KHN0YWNrRnJhbWUpLFxuXHRcdHZhcmlhYmxlRW50cnksXG5cdF07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNjb3BlRW50cnkoc2NvcGU6IElTY29wZSwgdmFyaWFibGVzOiBJRXhwcmVzc2lvbltdKTogSURlYnVnVmFyaWFibGVFbnRyeSB7XG5cdGNvbnN0IHZhcmlhYmxlc1N1bW1hcnkgPSB2YXJpYWJsZXMubWFwKHYgPT4gYCR7di5uYW1lfTogJHt2LnZhbHVlfWApLmpvaW4oJ1xcbicpO1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdkZWJ1Z1ZhcmlhYmxlJyxcblx0XHRpZDogYGRlYnVnLXNjb3BlOiR7c2NvcGUubmFtZX1gLFxuXHRcdG5hbWU6IGBTY29wZTogJHtzY29wZS5uYW1lfWAsXG5cdFx0ZnVsbE5hbWU6IGBTY29wZTogJHtzY29wZS5uYW1lfWAsXG5cdFx0aWNvbjogQ29kaWNvbi5kZWJ1Zyxcblx0XHR2YWx1ZTogdmFyaWFibGVzU3VtbWFyeSxcblx0XHRleHByZXNzaW9uOiBzY29wZS5uYW1lLFxuXHRcdHR5cGU6ICdzY29wZScsXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogYERlYnVnIHNjb3BlIFwiJHtzY29wZS5uYW1lfVwiIHdpdGggJHt2YXJpYWJsZXMubGVuZ3RofSB2YXJpYWJsZXM6XFxuJHt2YXJpYWJsZXNTdW1tYXJ5fWAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFZhcmlhYmxlRGVzY3JpcHRpb24oZXhwcmVzc2lvbjogSUV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRjb25zdCB2YWx1ZSA9IGV4cHJlc3Npb24udmFsdWU7XG5cdGNvbnN0IHR5cGUgPSBleHByZXNzaW9uLnR5cGU7XG5cdGlmICh0eXBlICYmIHZhbHVlKSB7XG5cdFx0cmV0dXJuIGAke3R5cGV9OiAke3ZhbHVlfWA7XG5cdH1cblx0cmV0dXJuIHZhbHVlIHx8IHR5cGUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdEV4cHJlc3Npb25SZXN1bHQodmFsdWU6IHN0cmluZywgdHlwZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0eXBlICYmIHZhbHVlKSB7XG5cdFx0cmV0dXJuIGAke3R5cGV9OiAke3ZhbHVlfWA7XG5cdH1cblx0cmV0dXJuIHZhbHVlIHx8IHR5cGUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE1vZGVsRGVzY3JpcHRpb24obmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCB0eXBlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGRlc2NyaXB0aW9uID0gYERlYnVnIHZhcmlhYmxlIFwiJHtuYW1lfVwiYDtcblx0aWYgKHR5cGUpIHtcblx0XHRkZXNjcmlwdGlvbiArPSBgIG9mIHR5cGUgJHt0eXBlfWA7XG5cdH1cblx0ZGVzY3JpcHRpb24gKz0gYCB3aXRoIHZhbHVlOiAke3ZhbHVlfWA7XG5cdHJldHVybiBkZXNjcmlwdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnQ2hhdENvbnRleHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0LmRlYnVnQ2hhdENvbnRleHRDb250cmlidXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdENvbnRleHRQaWNrU2VydmljZSBjb250ZXh0UGlja1NlcnZpY2U6IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdTZXNzaW9uQ29udGV4dFBpY2spKSk7XG5cdH1cbn1cblxuLy8gQ29udGV4dCBtZW51IGFjdGlvbjogQWRkIHZhcmlhYmxlIHRvIGNoYXRcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy5hY3Rpb24uYWRkVmFyaWFibGVUb0NoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZGRUb0NoYXQnLCAnQWRkIHRvIENoYXQnKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z1ZhcmlhYmxlc0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAxMTAsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHQgaXMgdGhlIHZhcmlhYmxlIGZyb20gdGhlIHZhcmlhYmxlcyB2aWV3XG5cdFx0Y29uc3QgZW50cnkgPSBjcmVhdGVEZWJ1Z1ZhcmlhYmxlRW50cnlGcm9tQ29udGV4dChjb250ZXh0KTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY3JlYXRlUGF1c2VkTG9jYXRpb25FbnRyeShzdGFja0ZyYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoZW50cnkpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vIENvbnRleHQgbWVudSBhY3Rpb246IEFkZCB3YXRjaCBleHByZXNzaW9uIHRvIGNoYXRcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy5hY3Rpb24uYWRkV2F0Y2hFeHByZXNzaW9uVG9DaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkVG9DaGF0JywgJ0FkZCB0byBDaGF0JyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdXYXRjaENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAxMTAsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElFeHByZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IGlzIHRoZSBleHByZXNzaW9uICh3YXRjaCBleHByZXNzaW9uIG9yIHZhcmlhYmxlIHVuZGVyIGl0KVxuXHRcdGNvbnN0IHN0YWNrRnJhbWUgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0aWYgKHN0YWNrRnJhbWUpIHtcblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChjcmVhdGVQYXVzZWRMb2NhdGlvbkVudHJ5KHN0YWNrRnJhbWUpKTtcblx0XHR9XG5cdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGNyZWF0ZURlYnVnVmFyaWFibGVFbnRyeShjb250ZXh0KSk7XG5cdH1cbn0pO1xuXG4vLyBDb250ZXh0IG1lbnUgYWN0aW9uOiBBZGQgc2NvcGUgdG8gY2hhdFxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5hZGRTY29wZVRvQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FkZFRvQ2hhdCcsICdBZGQgdG8gQ2hhdCcpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnU2NvcGVzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElTY29wZXNDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIGFjdHVhbCBzY29wZSBhbmQgaXRzIHZhcmlhYmxlc1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGlmICghc3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzY29wZXMgPSBhd2FpdCBzdGFja0ZyYW1lLmdldFNjb3BlcygpO1xuXHRcdFx0Y29uc3Qgc2NvcGUgPSBzY29wZXMuZmluZChzID0+IHMubmFtZSA9PT0gY29udGV4dC5zY29wZS5uYW1lKTtcblx0XHRcdGlmIChzY29wZSkge1xuXHRcdFx0XHRjb25zdCB2YXJpYWJsZXMgPSBhd2FpdCBzY29wZS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY3JlYXRlUGF1c2VkTG9jYXRpb25FbnRyeShzdGFja0ZyYW1lKSk7XG5cdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChjcmVhdGVTY29wZUVudHJ5KHNjb3BlLCB2YXJpYWJsZXMpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIElnbm9yZSBlcnJvcnNcblx0XHR9XG5cdH1cbn0pO1xuXG5pbnRlcmZhY2UgSVNjb3Blc0NvbnRleHQge1xuXHRzY29wZTogeyBuYW1lOiBzdHJpbmcgfTtcbn1cblxuaW50ZXJmYWNlIElWYXJpYWJsZXNDb250ZXh0IHtcblx0c2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHZhcmlhYmxlOiB7IG5hbWU6IHN0cmluZzsgdmFsdWU6IHN0cmluZzsgdHlwZT86IHN0cmluZzsgZXZhbHVhdGVOYW1lPzogc3RyaW5nIH07XG59XG5cbmZ1bmN0aW9uIGlzVmFyaWFibGVzQ29udGV4dChjb250ZXh0OiB1bmtub3duKTogY29udGV4dCBpcyBJVmFyaWFibGVzQ29udGV4dCB7XG5cdHJldHVybiB0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcgJiYgY29udGV4dCAhPT0gbnVsbCAmJiAndmFyaWFibGUnIGluIGNvbnRleHQgJiYgJ3Nlc3Npb25JZCcgaW4gY29udGV4dDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRGVidWdWYXJpYWJsZUVudHJ5RnJvbUNvbnRleHQoY29udGV4dDogdW5rbm93bik6IElEZWJ1Z1ZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQge1xuXHQvLyBUaGUgY29udGV4dCBjYW4gYmUgZWl0aGVyIGEgVmFyaWFibGUgZGlyZWN0bHksIG9yIGFuIElWYXJpYWJsZXNDb250ZXh0IG9iamVjdFxuXHRpZiAoY29udGV4dCBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0cmV0dXJuIGNyZWF0ZURlYnVnVmFyaWFibGVFbnRyeShjb250ZXh0KTtcblx0fVxuXG5cdC8vIEhhbmRsZSBJVmFyaWFibGVzQ29udGV4dCBmb3JtYXQgZnJvbSB0aGUgdmFyaWFibGVzIHZpZXdcblx0aWYgKGlzVmFyaWFibGVzQ29udGV4dChjb250ZXh0KSkge1xuXHRcdGNvbnN0IHZhcmlhYmxlID0gY29udGV4dC52YXJpYWJsZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2RlYnVnVmFyaWFibGUnLFxuXHRcdFx0aWQ6IGBkZWJ1Zy12YXJpYWJsZToke3ZhcmlhYmxlLm5hbWV9YCxcblx0XHRcdG5hbWU6IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHRmdWxsTmFtZTogdmFyaWFibGUuZXZhbHVhdGVOYW1lID8/IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmRlYnVnLFxuXHRcdFx0dmFsdWU6IHZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0ZXhwcmVzc2lvbjogdmFyaWFibGUuZXZhbHVhdGVOYW1lID8/IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHR0eXBlOiB2YXJpYWJsZS50eXBlLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogZm9ybWF0TW9kZWxEZXNjcmlwdGlvbih2YXJpYWJsZS5ldmFsdWF0ZU5hbWUgfHwgdmFyaWFibGUubmFtZSwgdmFyaWFibGUudmFsdWUsIHZhcmlhYmxlLnR5cGUpLFxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsU0FBUyxxQkFBcUIsU0FBMkMsbUJBQW1CLHVCQUF1QjtBQUM1SCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsNkJBQStDO0FBRXhELFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFzRSwrQkFBK0I7QUFDckcsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxlQUFpRCxhQUFhO0FBQ3ZFLFNBQVMsZ0JBQWdCO0FBRXpCLElBQVcsYUFBWCxrQkFBV0EsZ0JBQVg7QUFDQyxFQUFBQSxZQUFBLFVBQU87QUFDUCxFQUFBQSxZQUFBLGdCQUFhO0FBRkgsU0FBQUE7QUFBQSxHQUFBO0FBS1gsSUFBTSwwQkFBTixNQUFnRTtBQUFBLEVB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
