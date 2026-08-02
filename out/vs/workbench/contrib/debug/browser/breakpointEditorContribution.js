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
import { isSafari } from "../../../../base/browser/browser.js";
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { memoize } from "../../../../base/common/decorators.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { dispose, disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import * as env from "../../../../base/common/platform.js";
import severity from "../../../../base/common/severity.js";
import { noBreakWhitespace } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { GlyphMarginLane, OverviewRulerLane, TrackedRangeStickiness } from "../../../../editor/common/model.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { GutterActionsRegistry } from "../../codeEditor/browser/editorLineNumberMenu.js";
import { getBreakpointMessageAndIcon } from "./breakpointsView.js";
import { BreakpointWidget } from "./breakpointWidget.js";
import * as icons from "./debugIcons.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, DebuggerString, IDebugService, State } from "../common/debug.js";
const $ = dom.$;
const breakpointHelperDecoration = {
  description: "breakpoint-helper-decoration",
  glyphMarginClassName: ThemeIcon.asClassName(icons.debugBreakpointHint),
  glyphMargin: { position: GlyphMarginLane.Right },
  glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize("breakpointHelper", "Click to add a breakpoint")),
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
};
function createBreakpointDecorations(accessor, model, breakpoints, state, breakpointsActivated, showBreakpointsInOverviewRuler) {
  const result = [];
  breakpoints.forEach((breakpoint) => {
    if (breakpoint.lineNumber > model.getLineCount()) {
      return;
    }
    const hasOtherBreakpointsOnLine = breakpoints.some((bp) => bp !== breakpoint && bp.lineNumber === breakpoint.lineNumber);
    const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
    const range = model.validateRange(
      breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1) : new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1)
      // Decoration has to have a width #20688
    );
    result.push({
      options: getBreakpointDecorationOptions(accessor, model, breakpoint, state, breakpointsActivated, showBreakpointsInOverviewRuler, hasOtherBreakpointsOnLine),
      range
    });
  });
  return result;
}
function getBreakpointDecorationOptions(accessor, model, breakpoint, state, breakpointsActivated, showBreakpointsInOverviewRuler, hasOtherBreakpointsOnLine) {
  const debugService = accessor.get(IDebugService);
  const languageService = accessor.get(ILanguageService);
  const labelService = accessor.get(ILabelService);
  const { icon, message, showAdapterUnverifiedMessage } = getBreakpointMessageAndIcon(state, breakpointsActivated, breakpoint, labelService, debugService.getModel());
  let glyphMarginHoverMessage;
  let unverifiedMessage;
  if (showAdapterUnverifiedMessage) {
    let langId;
    unverifiedMessage = debugService.getModel().getSessions().map((s) => {
      const dbg = debugService.getAdapterManager().getDebugger(s.configuration.type);
      const message2 = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
      if (message2) {
        if (!langId) {
          langId = languageService.guessLanguageIdByFilepathOrFirstLine(breakpoint.uri) ?? void 0;
        }
        return langId && dbg.interestedInLanguage(langId) ? message2 : void 0;
      }
      return void 0;
    }).find((messages) => !!messages);
  }
  if (message) {
    glyphMarginHoverMessage = new MarkdownString(void 0, { isTrusted: true, supportThemeIcons: true });
    if (breakpoint.condition || breakpoint.hitCondition) {
      const languageId = model.getLanguageId();
      glyphMarginHoverMessage.appendCodeblock(languageId, message);
      if (unverifiedMessage) {
        glyphMarginHoverMessage.appendMarkdown("$(warning) " + unverifiedMessage);
      }
    } else {
      glyphMarginHoverMessage.appendText(message);
      if (unverifiedMessage) {
        glyphMarginHoverMessage.appendMarkdown("\n\n$(warning) " + unverifiedMessage);
      }
    }
  } else if (unverifiedMessage) {
    glyphMarginHoverMessage = new MarkdownString(void 0, { isTrusted: true, supportThemeIcons: true }).appendMarkdown(unverifiedMessage);
  }
  let overviewRulerDecoration = null;
  if (showBreakpointsInOverviewRuler) {
    overviewRulerDecoration = {
      color: themeColorFromId(debugIconBreakpointForeground),
      position: OverviewRulerLane.Left
    };
  }
  const renderInline = breakpoint.column && (hasOtherBreakpointsOnLine || breakpoint.column > model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber));
  return {
    description: "breakpoint-decoration",
    glyphMargin: { position: GlyphMarginLane.Right },
    glyphMarginClassName: ThemeIcon.asClassName(icon),
    glyphMarginHoverMessage,
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    before: renderInline ? {
      content: noBreakWhitespace,
      inlineClassName: `debug-breakpoint-placeholder`,
      inlineClassNameAffectsLetterSpacing: true
    } : void 0,
    overviewRuler: overviewRulerDecoration,
    zIndex: 9999
  };
}
async function requestBreakpointCandidateLocations(model, lineNumbers, session) {
  if (!session.capabilities.supportsBreakpointLocationsRequest) {
    return [];
  }
  return await Promise.all(distinct(lineNumbers, (l) => l).map(async (lineNumber) => {
    try {
      return { lineNumber, positions: await session.breakpointsLocations(model.uri, lineNumber) };
    } catch {
      return { lineNumber, positions: [] };
    }
  }));
}
function createCandidateDecorations(model, breakpointDecorations, lineBreakpoints) {
  const result = [];
  for (const { positions, lineNumber } of lineBreakpoints) {
    if (positions.length === 0) {
      continue;
    }
    const firstColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
    const lastColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
    positions.forEach((p) => {
      const range = new Range(p.lineNumber, p.column, p.lineNumber, p.column + 1);
      if (p.column <= firstColumn && !breakpointDecorations.some((bp) => bp.range.startColumn > firstColumn && bp.range.startLineNumber === p.lineNumber) || p.column > lastColumn) {
        return;
      }
      const breakpointAtPosition = breakpointDecorations.find((bpd) => bpd.range.equalsRange(range));
      if (breakpointAtPosition && breakpointAtPosition.inlineWidget) {
        return;
      }
      result.push({
        range,
        options: {
          description: "breakpoint-placeholder-decoration",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          before: breakpointAtPosition ? void 0 : {
            content: noBreakWhitespace,
            inlineClassName: `debug-breakpoint-placeholder`,
            inlineClassNameAffectsLetterSpacing: true
          }
        },
        breakpoint: breakpointAtPosition ? breakpointAtPosition.breakpoint : void 0
      });
    });
  }
  return result;
}
let BreakpointEditorContribution = class {
  constructor(editor, debugService, contextMenuService, instantiationService, contextKeyService, dialogService, configurationService, labelService) {
    this.editor = editor;
    this.debugService = debugService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.breakpointHintDecoration = null;
    this.toDispose = [];
    this.ignoreDecorationsChangedEvent = false;
    this.ignoreBreakpointsChangeEvent = false;
    this.breakpointDecorations = [];
    this.candidateDecorations = [];
    this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
    this.setDecorationsScheduler = new RunOnceScheduler(() => this.setDecorations(), 30);
    this.setDecorationsScheduler.schedule();
    this.registerListeners();
  }
  /**
   * Returns context menu actions at the line number if breakpoints can be
   * set. This is used by the {@link TestingDecorations} to allow breakpoint
   * setting on lines where breakpoint "run" actions are present.
   */
  getContextMenuActionsAtPosition(lineNumber, model) {
    if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
      return [];
    }
    if (!this.debugService.canSetBreakpointsIn(model)) {
      return [];
    }
    const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber, uri: model.uri });
    return this.getContextMenuActions(breakpoints, model.uri, lineNumber);
  }
  registerListeners() {
    this.toDispose.push(this.editor.onMouseDown(async (e) => {
      if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
        return;
      }
      const model = this.editor.getModel();
      if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.isAfterLines || !this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber) && !e.target.element?.className.includes("breakpoint")) {
        return;
      }
      const canSetBreakpoints = this.debugService.canSetBreakpointsIn(model);
      const lineNumber = e.target.position.lineNumber;
      const uri = model.uri;
      if (e.event.rightButton || env.isMacintosh && e.event.leftButton && e.event.ctrlKey) {
        return;
      } else {
        const breakpoints = this.debugService.getModel().getBreakpoints({ uri, lineNumber });
        if (breakpoints.length) {
          const isShiftPressed = e.event.shiftKey;
          const isAltPressed = e.event.altKey;
          const enabled = breakpoints.some((bp) => bp.enabled);
          if (isAltPressed) {
            this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column);
          } else if (isShiftPressed) {
            breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
          } else if (!env.isLinux && breakpoints.some((bp) => !!bp.condition || !!bp.logMessage || !!bp.hitCondition || !!bp.triggeredBy)) {
            const logPoint = breakpoints.every((bp) => !!bp.logMessage);
            const breakpointType = logPoint ? nls.localize("logPoint", "Logpoint") : nls.localize("breakpoint", "Breakpoint");
            const disabledBreakpointDialogMessage = nls.localize(
              "breakpointHasConditionDisabled",
              "This {0} has a {1} that will get lost on remove. Consider enabling the {0} instead.",
              breakpointType.toLowerCase(),
              logPoint ? nls.localize("message", "message") : nls.localize("condition", "condition")
            );
            const enabledBreakpointDialogMessage = nls.localize(
              "breakpointHasConditionEnabled",
              "This {0} has a {1} that will get lost on remove. Consider disabling the {0} instead.",
              breakpointType.toLowerCase(),
              logPoint ? nls.localize("message", "message") : nls.localize("condition", "condition")
            );
            await this.dialogService.prompt({
              type: severity.Info,
              message: enabled ? enabledBreakpointDialogMessage : disabledBreakpointDialogMessage,
              buttons: [
                {
                  label: nls.localize({ key: "removeLogPoint", comment: ["&& denotes a mnemonic"] }, "&&Remove {0}", breakpointType),
                  run: () => breakpoints.forEach((bp) => this.debugService.removeBreakpoints(bp.getId()))
                },
                {
                  label: nls.localize("disableLogPoint", "{0} {1}", enabled ? nls.localize({ key: "disable", comment: ["&& denotes a mnemonic"] }, "&&Disable") : nls.localize({ key: "enable", comment: ["&& denotes a mnemonic"] }, "&&Enable"), breakpointType),
                  run: () => breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp))
                }
              ],
              cancelButton: true
            });
          } else {
            if (!enabled) {
              breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
            } else {
              breakpoints.forEach((bp) => this.debugService.removeBreakpoints(bp.getId()));
            }
          }
        } else if (canSetBreakpoints) {
          if (e.event.altKey) {
            this.showBreakpointWidget(lineNumber, void 0, BreakpointWidgetContext.CONDITION);
          } else if (e.event.middleButton) {
            const action = this.configurationService.getValue("debug").gutterMiddleClickAction;
            if (action !== "none") {
              let context;
              switch (action) {
                case "logpoint":
                  context = BreakpointWidgetContext.LOG_MESSAGE;
                  break;
                case "conditionalBreakpoint":
                  context = BreakpointWidgetContext.CONDITION;
                  break;
                case "triggeredBreakpoint":
                  context = BreakpointWidgetContext.TRIGGER_POINT;
              }
              this.showBreakpointWidget(lineNumber, void 0, context);
            }
          } else {
            this.debugService.addBreakpoints(uri, [{ lineNumber }]);
          }
        }
      }
    }));
    if (!(BrowserFeatures.pointerEvents && isSafari)) {
      this.toDispose.push(this.editor.onMouseMove((e) => {
        if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
          return;
        }
        let showBreakpointHintAtLineNumber = -1;
        const model = this.editor.getModel();
        if (model && e.target.position && (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) && this.debugService.canSetBreakpointsIn(model) && this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
          const data = e.target.detail;
          if (!data.isAfterLines) {
            showBreakpointHintAtLineNumber = e.target.position.lineNumber;
          }
        }
        this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
      }));
      this.toDispose.push(this.editor.onMouseLeave(() => {
        this.ensureBreakpointHintDecoration(-1);
      }));
    }
    this.toDispose.push(this.editor.onDidChangeModel(async () => {
      this.closeBreakpointWidget();
      await this.setDecorations();
    }));
    this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => {
      if (!this.ignoreBreakpointsChangeEvent && !this.setDecorationsScheduler.isScheduled()) {
        this.setDecorationsScheduler.schedule();
      }
    }));
    this.toDispose.push(this.debugService.onDidChangeState(() => {
      if (!this.setDecorationsScheduler.isScheduled()) {
        this.setDecorationsScheduler.schedule();
      }
    }));
    this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.onModelDecorationsChanged()));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("debug.showBreakpointsInOverviewRuler") || e.affectsConfiguration("debug.showInlineBreakpointCandidates")) {
        await this.setDecorations();
      }
    }));
  }
  getContextMenuActions(breakpoints, uri, lineNumber, column) {
    const actions = [];
    if (breakpoints.length === 1) {
      const breakpointType = breakpoints[0].logMessage ? nls.localize("logPoint", "Logpoint") : nls.localize("breakpoint", "Breakpoint");
      actions.push(toAction({
        id: "debug.removeBreakpoint",
        label: nls.localize("removeBreakpoint", "Remove {0}", breakpointType),
        enabled: true,
        run: async () => {
          await this.debugService.removeBreakpoints(breakpoints[0].getId());
        }
      }));
      actions.push(toAction({
        id: "workbench.debug.action.editBreakpointAction",
        label: nls.localize("editBreakpoint", "Edit {0}...", breakpointType),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column))
      }));
      actions.push(toAction({
        id: `workbench.debug.viewlet.action.toggleBreakpoint`,
        label: breakpoints[0].enabled ? nls.localize("disableBreakpoint", "Disable {0}", breakpointType) : nls.localize("enableBreakpoint", "Enable {0}", breakpointType),
        enabled: true,
        run: () => this.debugService.enableOrDisableBreakpoints(!breakpoints[0].enabled, breakpoints[0])
      }));
    } else if (breakpoints.length > 1) {
      const sorted = breakpoints.slice().sort((first, second) => first.column && second.column ? first.column - second.column : 1);
      actions.push(new SubmenuAction("debug.removeBreakpoints", nls.localize("removeBreakpoints", "Remove Breakpoints"), sorted.map((bp) => toAction({
        id: "removeInlineBreakpoint",
        label: bp.column ? nls.localize("removeInlineBreakpointOnColumn", "Remove Inline Breakpoint on Column {0}", bp.column) : nls.localize("removeLineBreakpoint", "Remove Line Breakpoint"),
        enabled: true,
        run: () => this.debugService.removeBreakpoints(bp.getId())
      }))));
      actions.push(new SubmenuAction("debug.editBreakpoints", nls.localize("editBreakpoints", "Edit Breakpoints"), sorted.map(
        (bp) => toAction({
          id: "editBreakpoint",
          label: bp.column ? nls.localize("editInlineBreakpointOnColumn", "Edit Inline Breakpoint on Column {0}", bp.column) : nls.localize("editLineBreakpoint", "Edit Line Breakpoint"),
          enabled: true,
          run: () => Promise.resolve(this.showBreakpointWidget(bp.lineNumber, bp.column))
        })
      )));
      actions.push(new SubmenuAction("debug.enableDisableBreakpoints", nls.localize("enableDisableBreakpoints", "Enable/Disable Breakpoints"), sorted.map((bp) => toAction({
        id: bp.enabled ? "disableColumnBreakpoint" : "enableColumnBreakpoint",
        label: bp.enabled ? bp.column ? nls.localize("disableInlineColumnBreakpoint", "Disable Inline Breakpoint on Column {0}", bp.column) : nls.localize("disableBreakpointOnLine", "Disable Line Breakpoint") : bp.column ? nls.localize("enableBreakpoints", "Enable Inline Breakpoint on Column {0}", bp.column) : nls.localize("enableBreakpointOnLine", "Enable Line Breakpoint"),
        enabled: true,
        run: () => this.debugService.enableOrDisableBreakpoints(!bp.enabled, bp)
      }))));
    } else {
      actions.push(toAction({
        id: "addBreakpoint",
        label: nls.localize("addBreakpoint", "Add Breakpoint"),
        enabled: true,
        run: () => this.debugService.addBreakpoints(uri, [{ lineNumber, column }])
      }));
      actions.push(toAction({
        id: "addConditionalBreakpoint",
        label: nls.localize("addConditionalBreakpoint", "Add Conditional Breakpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.CONDITION))
      }));
      actions.push(toAction({
        id: "addLogPoint",
        label: nls.localize("addLogPoint", "Add Logpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.LOG_MESSAGE))
      }));
      actions.push(toAction({
        id: "addTriggeredBreakpoint",
        label: nls.localize("addTriggeredBreakpoint", "Add Triggered Breakpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.TRIGGER_POINT))
      }));
    }
    if (this.debugService.state === State.Stopped) {
      actions.push(new Separator());
      actions.push(toAction({
        id: "runToLine",
        label: nls.localize("runToLine", "Run to Line"),
        enabled: true,
        run: () => this.debugService.runTo(uri, lineNumber).catch(onUnexpectedError)
      }));
    }
    return actions;
  }
  marginFreeFromNonDebugDecorations(line) {
    const decorations = this.editor.getLineDecorations(line);
    if (decorations) {
      for (const { options } of decorations) {
        const clz = options.glyphMarginClassName;
        if (!clz) {
          continue;
        }
        const hasSomeActionableCodicon = !(clz.includes("codicon-") || clz.startsWith("coverage-deco-")) || clz.includes("codicon-testing-") || clz.includes("codicon-merge-") || clz.includes("codicon-arrow-") || clz.includes("codicon-loading") || clz.includes("codicon-fold") || clz.includes("codicon-gutter-lightbulb") || clz.includes("codicon-lightbulb-sparkle");
        if (hasSomeActionableCodicon) {
          return false;
        }
      }
    }
    return true;
  }
  ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber) {
    this.editor.changeDecorations((accessor) => {
      if (this.breakpointHintDecoration) {
        accessor.removeDecoration(this.breakpointHintDecoration);
        this.breakpointHintDecoration = null;
      }
      if (showBreakpointHintAtLineNumber !== -1) {
        this.breakpointHintDecoration = accessor.addDecoration(
          {
            startLineNumber: showBreakpointHintAtLineNumber,
            startColumn: 1,
            endLineNumber: showBreakpointHintAtLineNumber,
            endColumn: 1
          },
          breakpointHelperDecoration
        );
      }
    });
  }
  async setDecorations() {
    if (!this.editor.hasModel()) {
      return;
    }
    const setCandidateDecorations = (changeAccessor, desiredCandidatePositions2) => {
      const desiredCandidateDecorations = createCandidateDecorations(model, this.breakpointDecorations, desiredCandidatePositions2);
      const candidateDecorationIds = changeAccessor.deltaDecorations(this.candidateDecorations.map((c) => c.decorationId), desiredCandidateDecorations);
      this.candidateDecorations.forEach((candidate) => {
        candidate.inlineWidget.dispose();
      });
      this.candidateDecorations = candidateDecorationIds.map((decorationId, index) => {
        const candidate = desiredCandidateDecorations[index];
        const icon = candidate.breakpoint ? getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), candidate.breakpoint, this.labelService, this.debugService.getModel()).icon : icons.breakpoint.disabled;
        const contextMenuActions = () => this.getContextMenuActions(candidate.breakpoint ? [candidate.breakpoint] : [], activeCodeEditor.getModel().uri, candidate.range.startLineNumber, candidate.range.startColumn);
        const inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, ThemeIcon.asClassName(icon), candidate.breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
        return {
          decorationId,
          inlineWidget
        };
      });
    };
    const activeCodeEditor = this.editor;
    const model = activeCodeEditor.getModel();
    const breakpoints = this.debugService.getModel().getBreakpoints({ uri: model.uri });
    const debugSettings = this.configurationService.getValue("debug");
    const desiredBreakpointDecorations = this.instantiationService.invokeFunction((accessor) => createBreakpointDecorations(accessor, model, breakpoints, this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), debugSettings.showBreakpointsInOverviewRuler));
    const session = this.debugService.getViewModel().focusedSession;
    const desiredCandidatePositions = debugSettings.showInlineBreakpointCandidates && session ? requestBreakpointCandidateLocations(this.editor.getModel(), desiredBreakpointDecorations.map((bp) => bp.range.startLineNumber), session) : Promise.resolve([]);
    const desiredCandidatePositionsRaced = await Promise.race([desiredCandidatePositions, timeout(500).then(() => void 0)]);
    if (desiredCandidatePositionsRaced === void 0) {
      desiredCandidatePositions.then((v) => activeCodeEditor.changeDecorations((d) => setCandidateDecorations(d, v)));
    }
    try {
      this.ignoreDecorationsChangedEvent = true;
      activeCodeEditor.changeDecorations((changeAccessor) => {
        const decorationIds = changeAccessor.deltaDecorations(this.breakpointDecorations.map((bpd) => bpd.decorationId), desiredBreakpointDecorations);
        this.breakpointDecorations.forEach((bpd) => {
          bpd.inlineWidget?.dispose();
        });
        this.breakpointDecorations = decorationIds.map((decorationId, index) => {
          let inlineWidget = void 0;
          const breakpoint = breakpoints[index];
          if (desiredBreakpointDecorations[index].options.before) {
            const contextMenuActions = () => this.getContextMenuActions([breakpoint], activeCodeEditor.getModel().uri, breakpoint.lineNumber, breakpoint.column);
            inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, desiredBreakpointDecorations[index].options.glyphMarginClassName, breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
          }
          return {
            decorationId,
            breakpoint,
            range: desiredBreakpointDecorations[index].range,
            inlineWidget
          };
        });
        if (desiredCandidatePositionsRaced) {
          setCandidateDecorations(changeAccessor, desiredCandidatePositionsRaced);
        }
      });
    } finally {
      this.ignoreDecorationsChangedEvent = false;
    }
    for (const d of this.breakpointDecorations) {
      if (d.inlineWidget) {
        this.editor.layoutContentWidget(d.inlineWidget);
      }
    }
  }
  async onModelDecorationsChanged() {
    if (this.breakpointDecorations.length === 0 || this.ignoreDecorationsChangedEvent || !this.editor.hasModel()) {
      return;
    }
    let somethingChanged = false;
    const model = this.editor.getModel();
    this.breakpointDecorations.forEach((breakpointDecoration) => {
      if (somethingChanged) {
        return;
      }
      const newBreakpointRange = model.getDecorationRange(breakpointDecoration.decorationId);
      if (newBreakpointRange && !breakpointDecoration.range.equalsRange(newBreakpointRange)) {
        somethingChanged = true;
        breakpointDecoration.range = newBreakpointRange;
      }
    });
    if (!somethingChanged) {
      return;
    }
    const data = /* @__PURE__ */ new Map();
    for (let i = 0, len = this.breakpointDecorations.length; i < len; i++) {
      const breakpointDecoration = this.breakpointDecorations[i];
      const decorationRange = model.getDecorationRange(breakpointDecoration.decorationId);
      if (decorationRange) {
        if (breakpointDecoration.breakpoint) {
          data.set(breakpointDecoration.breakpoint.getId(), {
            lineNumber: decorationRange.startLineNumber,
            column: breakpointDecoration.breakpoint.column ? decorationRange.startColumn : void 0
          });
        }
      }
    }
    try {
      this.ignoreBreakpointsChangeEvent = true;
      await this.debugService.updateBreakpoints(model.uri, data, true);
    } finally {
      this.ignoreBreakpointsChangeEvent = false;
    }
  }
  // breakpoint widget
  showBreakpointWidget(lineNumber, column, context) {
    this.breakpointWidget?.dispose();
    this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber, column, context);
    this.breakpointWidget.show({ lineNumber, column: 1 });
    this.breakpointWidgetVisible.set(true);
  }
  closeBreakpointWidget() {
    if (this.breakpointWidget) {
      this.breakpointWidget.dispose();
      this.breakpointWidget = void 0;
      this.breakpointWidgetVisible.reset();
      this.editor.focus();
    }
  }
  dispose() {
    this.breakpointWidget?.dispose();
    this.setDecorationsScheduler.dispose();
    this.editor.removeDecorations(this.breakpointDecorations.map((bpd) => bpd.decorationId));
    dispose(this.toDispose);
  }
};
BreakpointEditorContribution = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILabelService)
], BreakpointEditorContribution);
GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
  const model = editor.getModel();
  const debugService = accessor.get(IDebugService);
  if (!model || !debugService.getAdapterManager().hasEnabledDebuggers() || !debugService.canSetBreakpointsIn(model)) {
    return;
  }
  const breakpointEditorContribution = editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
  if (!breakpointEditorContribution) {
    return;
  }
  const actions = breakpointEditorContribution.getContextMenuActionsAtPosition(lineNumber, model);
  for (const action of actions) {
    result.push(action, "2_debug");
  }
});
class InlineBreakpointWidget {
  constructor(editor, decorationId, cssClass, breakpoint, debugService, contextMenuService, getContextMenuActions) {
    this.editor = editor;
    this.decorationId = decorationId;
    this.breakpoint = breakpoint;
    this.debugService = debugService;
    this.contextMenuService = contextMenuService;
    this.getContextMenuActions = getContextMenuActions;
    // editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = false;
    this.suppressMouseDown = true;
    this.toDispose = [];
    this.range = this.editor.getModel().getDecorationRange(decorationId);
    this.toDispose.push(this.editor.onDidChangeModelDecorations(() => {
      const model = this.editor.getModel();
      const range = model.getDecorationRange(this.decorationId);
      if (this.range && !this.range.equalsRange(range)) {
        this.range = range;
        this.editor.layoutContentWidget(this);
        this.updateSize();
      }
    }));
    this.create(cssClass);
    this.editor.addContentWidget(this);
    this.editor.layoutContentWidget(this);
  }
  create(cssClass) {
    this.domNode = $(".inline-breakpoint-widget");
    if (cssClass) {
      this.domNode.classList.add(...cssClass.split(" "));
    }
    this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, async (e) => {
      switch (this.breakpoint?.enabled) {
        case void 0:
          await this.debugService.addBreakpoints(this.editor.getModel().uri, [{ lineNumber: this.range.startLineNumber, column: this.range.startColumn }]);
          break;
        case true:
          await this.debugService.removeBreakpoints(this.breakpoint.getId());
          break;
        case false:
          this.debugService.enableOrDisableBreakpoints(true, this.breakpoint);
          break;
      }
    }));
    this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
      const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
      const actions = this.getContextMenuActions();
      this.contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => actions,
        getActionsContext: () => this.breakpoint,
        onHide: () => disposeIfDisposable(actions)
      });
    }));
    this.updateSize();
    this.toDispose.push(this.editor.onDidChangeConfiguration((c) => {
      if (c.hasChanged(EditorOption.fontSize) || c.hasChanged(EditorOption.lineHeight)) {
        this.updateSize();
      }
    }));
  }
  updateSize() {
    const lineHeight = this.range ? this.editor.getLineHeightForPosition(this.range.getStartPosition()) : this.editor.getOption(EditorOption.lineHeight);
    this.domNode.style.height = `${lineHeight}px`;
    this.domNode.style.width = `${Math.ceil(0.8 * lineHeight)}px`;
    this.domNode.style.marginLeft = `4px`;
  }
  getId() {
    return generateUuid();
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    if (!this.range) {
      return null;
    }
    this.domNode.classList.toggle("line-start", this.range.startColumn === 1);
    return {
      position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn - 1 },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  dispose() {
    this.editor.removeContentWidget(this);
    dispose(this.toDispose);
  }
}
__decorateClass([
  memoize
], InlineBreakpointWidget.prototype, "getId", 1);
registerThemingParticipant((theme, collector) => {
  const scope = ".monaco-editor .glyph-margin-widgets, .monaco-workbench .debug-breakpoints, .monaco-workbench .disassembly-view, .monaco-editor .contentWidgets";
  const debugIconBreakpointColor = theme.getColor(debugIconBreakpointForeground);
  if (debugIconBreakpointColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => `${ThemeIcon.asCSSSelector(b.regular)}`).join(",\n		")},
			${ThemeIcon.asCSSSelector(icons.debugBreakpointUnsupported)},
			${ThemeIcon.asCSSSelector(icons.debugBreakpointHint)}:not([class*='codicon-debug-breakpoint']):not([class*='codicon-debug-stackframe']),
			${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)}::after,
			${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframe)}::after {
				color: ${debugIconBreakpointColor} !important;
			}
		}`);
    collector.addRule(`${scope} {
			${ThemeIcon.asCSSSelector(icons.breakpoint.pending)} {
				color: ${debugIconBreakpointColor} !important;
				font-size: 12px !important;
			}
		}`);
  }
  const debugIconBreakpointDisabledColor = theme.getColor(debugIconBreakpointDisabledForeground);
  if (debugIconBreakpointDisabledColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => ThemeIcon.asCSSSelector(b.disabled)).join(",\n		")} {
				color: ${debugIconBreakpointDisabledColor};
			}
		}`);
  }
  const debugIconBreakpointUnverifiedColor = theme.getColor(debugIconBreakpointUnverifiedForeground);
  if (debugIconBreakpointUnverifiedColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => ThemeIcon.asCSSSelector(b.unverified)).join(",\n		")} {
				color: ${debugIconBreakpointUnverifiedColor};
			}
		}`);
  }
  const debugIconBreakpointCurrentStackframeForegroundColor = theme.getColor(debugIconBreakpointCurrentStackframeForeground);
  if (debugIconBreakpointCurrentStackframeForegroundColor) {
    collector.addRule(`
		.monaco-editor .debug-top-stack-frame-column {
			color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
		}
		${scope} {
			${ThemeIcon.asCSSSelector(icons.debugStackframe)} {
				color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
			}
		}
		`);
  }
  const debugIconBreakpointStackframeFocusedColor = theme.getColor(debugIconBreakpointStackframeForeground);
  if (debugIconBreakpointStackframeFocusedColor) {
    collector.addRule(`${scope} {
			${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)} {
				color: ${debugIconBreakpointStackframeFocusedColor} !important;
			}
		}`);
  }
});
const debugIconBreakpointForeground = registerColor("debugIcon.breakpointForeground", "#E51400", nls.localize("debugIcon.breakpointForeground", "Icon color for breakpoints."));
const debugIconBreakpointDisabledForeground = registerColor("debugIcon.breakpointDisabledForeground", "#848484", nls.localize("debugIcon.breakpointDisabledForeground", "Icon color for disabled breakpoints."));
const debugIconBreakpointUnverifiedForeground = registerColor("debugIcon.breakpointUnverifiedForeground", "#848484", nls.localize("debugIcon.breakpointUnverifiedForeground", "Icon color for unverified breakpoints."));
const debugIconBreakpointCurrentStackframeForeground = registerColor("debugIcon.breakpointCurrentStackframeForeground", { dark: "#FFCC00", light: "#BE8700", hcDark: "#FFCC00", hcLight: "#BE8700" }, nls.localize("debugIcon.breakpointCurrentStackframeForeground", "Icon color for the current breakpoint stack frame."));
const debugIconBreakpointStackframeForeground = registerColor("debugIcon.breakpointStackframeForeground", "#89D185", nls.localize("debugIcon.breakpointStackframeForeground", "Icon color for all breakpoint stack frames."));
export {
  BreakpointEditorContribution,
  createBreakpointDecorations,
  debugIconBreakpointForeground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvYnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzU2FmYXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQnJvd3NlckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NhbklVc2UuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgZGlzcG9zZUlmRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgZW52IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBzZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBub0JyZWFrV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24sIElFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBHbHlwaE1hcmdpbkxhbmUsIElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJTW9kZWxEZWNvcmF0aW9uT3ZlcnZpZXdSdWxlck9wdGlvbnMsIElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIElUZXh0TW9kZWwsIE92ZXJ2aWV3UnVsZXJMYW5lLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQsIHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEd1dHRlckFjdGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9lZGl0b3JMaW5lTnVtYmVyTWVudS5qcyc7XG5pbXBvcnQgeyBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24gfSBmcm9tICcuL2JyZWFrcG9pbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBCcmVha3BvaW50V2lkZ2V0IH0gZnJvbSAnLi9icmVha3BvaW50V2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgeyBCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQsIEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LCBDT05URVhUX0JSRUFLUE9JTlRfV0lER0VUX1ZJU0lCTEUsIERlYnVnZ2VyU3RyaW5nLCBJQnJlYWtwb2ludCwgSUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24sIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgU3RhdGUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmludGVyZmFjZSBJQnJlYWtwb2ludERlY29yYXRpb24ge1xuXHRkZWNvcmF0aW9uSWQ6IHN0cmluZztcblx0YnJlYWtwb2ludDogSUJyZWFrcG9pbnQ7XG5cdHJhbmdlOiBSYW5nZTtcblx0aW5saW5lV2lkZ2V0PzogSW5saW5lQnJlYWtwb2ludFdpZGdldDtcbn1cblxuY29uc3QgYnJlYWtwb2ludEhlbHBlckRlY29yYXRpb246IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRkZXNjcmlwdGlvbjogJ2JyZWFrcG9pbnQtaGVscGVyLWRlY29yYXRpb24nLFxuXHRnbHlwaE1hcmdpbkNsYXNzTmFtZTogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb25zLmRlYnVnQnJlYWtwb2ludEhpbnQpLFxuXHRnbHlwaE1hcmdpbjogeyBwb3NpdGlvbjogR2x5cGhNYXJnaW5MYW5lLlJpZ2h0IH0sXG5cdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludEhlbHBlcicsIFwiQ2xpY2sgdG8gYWRkIGEgYnJlYWtwb2ludFwiKSksXG5cdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQnJlYWtwb2ludERlY29yYXRpb25zKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtb2RlbDogSVRleHRNb2RlbCwgYnJlYWtwb2ludHM6IFJlYWRvbmx5QXJyYXk8SUJyZWFrcG9pbnQ+LCBzdGF0ZTogU3RhdGUsIGJyZWFrcG9pbnRzQWN0aXZhdGVkOiBib29sZWFuLCBzaG93QnJlYWtwb2ludHNJbk92ZXJ2aWV3UnVsZXI6IGJvb2xlYW4pOiB7IHJhbmdlOiBSYW5nZTsgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfVtdIHtcblx0Y29uc3QgcmVzdWx0OiB7IHJhbmdlOiBSYW5nZTsgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfVtdID0gW107XG5cdGJyZWFrcG9pbnRzLmZvckVhY2goKGJyZWFrcG9pbnQpID0+IHtcblx0XHRpZiAoYnJlYWtwb2ludC5saW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFzT3RoZXJCcmVha3BvaW50c09uTGluZSA9IGJyZWFrcG9pbnRzLnNvbWUoYnAgPT4gYnAgIT09IGJyZWFrcG9pbnQgJiYgYnAubGluZU51bWJlciA9PT0gYnJlYWtwb2ludC5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBjb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGJyZWFrcG9pbnQubGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmFuZ2UgPSBtb2RlbC52YWxpZGF0ZVJhbmdlKFxuXHRcdFx0YnJlYWtwb2ludC5jb2x1bW4gPyBuZXcgUmFuZ2UoYnJlYWtwb2ludC5saW5lTnVtYmVyLCBicmVha3BvaW50LmNvbHVtbiwgYnJlYWtwb2ludC5saW5lTnVtYmVyLCBicmVha3BvaW50LmNvbHVtbiArIDEpXG5cdFx0XHRcdDogbmV3IFJhbmdlKGJyZWFrcG9pbnQubGluZU51bWJlciwgY29sdW1uLCBicmVha3BvaW50LmxpbmVOdW1iZXIsIGNvbHVtbiArIDEpIC8vIERlY29yYXRpb24gaGFzIHRvIGhhdmUgYSB3aWR0aCAjMjA2ODhcblx0XHQpO1xuXG5cdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0b3B0aW9uczogZ2V0QnJlYWtwb2ludERlY29yYXRpb25PcHRpb25zKGFjY2Vzc29yLCBtb2RlbCwgYnJlYWtwb2ludCwgc3RhdGUsIGJyZWFrcG9pbnRzQWN0aXZhdGVkLCBzaG93QnJlYWtwb2ludHNJbk92ZXJ2aWV3UnVsZXIsIGhhc090aGVyQnJlYWtwb2ludHNPbkxpbmUpLFxuXHRcdFx0cmFuZ2Vcblx0XHR9KTtcblx0fSk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZ2V0QnJlYWtwb2ludERlY29yYXRpb25PcHRpb25zKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtb2RlbDogSVRleHRNb2RlbCwgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQsIHN0YXRlOiBTdGF0ZSwgYnJlYWtwb2ludHNBY3RpdmF0ZWQ6IGJvb2xlYW4sIHNob3dCcmVha3BvaW50c0luT3ZlcnZpZXdSdWxlcjogYm9vbGVhbiwgaGFzT3RoZXJCcmVha3BvaW50c09uTGluZTogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IGxhYmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKTtcblx0Y29uc3QgeyBpY29uLCBtZXNzYWdlLCBzaG93QWRhcHRlclVudmVyaWZpZWRNZXNzYWdlIH0gPSBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24oc3RhdGUsIGJyZWFrcG9pbnRzQWN0aXZhdGVkLCBicmVha3BvaW50LCBsYWJlbFNlcnZpY2UsIGRlYnVnU2VydmljZS5nZXRNb2RlbCgpKTtcblx0bGV0IGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlOiBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRsZXQgdW52ZXJpZmllZE1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0aWYgKHNob3dBZGFwdGVyVW52ZXJpZmllZE1lc3NhZ2UpIHtcblx0XHRsZXQgbGFuZ0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dW52ZXJpZmllZE1lc3NhZ2UgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLm1hcChzID0+IHtcblx0XHRcdGNvbnN0IGRiZyA9IGRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLmdldERlYnVnZ2VyKHMuY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBkYmc/LnN0cmluZ3M/LltEZWJ1Z2dlclN0cmluZy5VbnZlcmlmaWVkQnJlYWtwb2ludHNdO1xuXHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0aWYgKCFsYW5nSWQpIHtcblx0XHRcdFx0XHQvLyBMYXppbHkgY29tcHV0ZSB0aGlzLCBvbmx5IGlmIG5lZWRlZCBmb3Igc29tZSBkZWJ1ZyBhZGFwdGVyXG5cdFx0XHRcdFx0bGFuZ0lkID0gbGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShicmVha3BvaW50LnVyaSkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBsYW5nSWQgJiYgZGJnLmludGVyZXN0ZWRJbkxhbmd1YWdlKGxhbmdJZCkgPyBtZXNzYWdlIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pXG5cdFx0XHQuZmluZChtZXNzYWdlcyA9PiAhIW1lc3NhZ2VzKTtcblx0fVxuXG5cdGlmIChtZXNzYWdlKSB7XG5cdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0aWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uIHx8IGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UuYXBwZW5kQ29kZWJsb2NrKGxhbmd1YWdlSWQsIG1lc3NhZ2UpO1xuXHRcdFx0aWYgKHVudmVyaWZpZWRNZXNzYWdlKSB7XG5cdFx0XHRcdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlLmFwcGVuZE1hcmtkb3duKCckKHdhcm5pbmcpICcgKyB1bnZlcmlmaWVkTWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlLmFwcGVuZFRleHQobWVzc2FnZSk7XG5cdFx0XHRpZiAodW52ZXJpZmllZE1lc3NhZ2UpIHtcblx0XHRcdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oJ1xcblxcbiQod2FybmluZykgJyArIHVudmVyaWZpZWRNZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSBpZiAodW52ZXJpZmllZE1lc3NhZ2UpIHtcblx0XHRnbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KS5hcHBlbmRNYXJrZG93bih1bnZlcmlmaWVkTWVzc2FnZSk7XG5cdH1cblxuXHRsZXQgb3ZlcnZpZXdSdWxlckRlY29yYXRpb246IElNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucyB8IG51bGwgPSBudWxsO1xuXHRpZiAoc2hvd0JyZWFrcG9pbnRzSW5PdmVydmlld1J1bGVyKSB7XG5cdFx0b3ZlcnZpZXdSdWxlckRlY29yYXRpb24gPSB7XG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChkZWJ1Z0ljb25CcmVha3BvaW50Rm9yZWdyb3VuZCksXG5cdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuTGVmdFxuXHRcdH07XG5cdH1cblxuXHRjb25zdCByZW5kZXJJbmxpbmUgPSBicmVha3BvaW50LmNvbHVtbiAmJiAoaGFzT3RoZXJCcmVha3BvaW50c09uTGluZSB8fCBicmVha3BvaW50LmNvbHVtbiA+IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oYnJlYWtwb2ludC5saW5lTnVtYmVyKSk7XG5cdHJldHVybiB7XG5cdFx0ZGVzY3JpcHRpb246ICdicmVha3BvaW50LWRlY29yYXRpb24nLFxuXHRcdGdseXBoTWFyZ2luOiB7IHBvc2l0aW9uOiBHbHlwaE1hcmdpbkxhbmUuUmlnaHQgfSxcblx0XHRnbHlwaE1hcmdpbkNsYXNzTmFtZTogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pLFxuXHRcdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGJlZm9yZTogcmVuZGVySW5saW5lID8ge1xuXHRcdFx0Y29udGVudDogbm9CcmVha1doaXRlc3BhY2UsXG5cdFx0XHRpbmxpbmVDbGFzc05hbWU6IGBkZWJ1Zy1icmVha3BvaW50LXBsYWNlaG9sZGVyYCxcblx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlXG5cdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRvdmVydmlld1J1bGVyOiBvdmVydmlld1J1bGVyRGVjb3JhdGlvbixcblx0XHR6SW5kZXg6IDk5OTlcblx0fTtcbn1cblxudHlwZSBCcmVha3BvaW50c0ZvckxpbmUgPSB7IGxpbmVOdW1iZXI6IG51bWJlcjsgcG9zaXRpb25zOiBJUG9zaXRpb25bXSB9O1xuXG5hc3luYyBmdW5jdGlvbiByZXF1ZXN0QnJlYWtwb2ludENhbmRpZGF0ZUxvY2F0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgbGluZU51bWJlcnM6IG51bWJlcltdLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTxCcmVha3BvaW50c0ZvckxpbmVbXT4ge1xuXHRpZiAoIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQnJlYWtwb2ludExvY2F0aW9uc1JlcXVlc3QpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRyZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwoZGlzdGluY3QobGluZU51bWJlcnMsIGwgPT4gbCkubWFwKGFzeW5jIGxpbmVOdW1iZXIgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4geyBsaW5lTnVtYmVyLCBwb3NpdGlvbnM6IGF3YWl0IHNlc3Npb24uYnJlYWtwb2ludHNMb2NhdGlvbnMobW9kZWwudXJpLCBsaW5lTnVtYmVyKSB9O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHsgbGluZU51bWJlciwgcG9zaXRpb25zOiBbXSB9O1xuXHRcdH1cblx0fSkpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDYW5kaWRhdGVEZWNvcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnJlYWtwb2ludERlY29yYXRpb25zOiBJQnJlYWtwb2ludERlY29yYXRpb25bXSwgbGluZUJyZWFrcG9pbnRzOiBCcmVha3BvaW50c0ZvckxpbmVbXSk6IHsgcmFuZ2U6IFJhbmdlOyBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9uczsgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQgfVtdIHtcblx0Y29uc3QgcmVzdWx0OiB7IHJhbmdlOiBSYW5nZTsgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7IGJyZWFrcG9pbnQ6IElCcmVha3BvaW50IHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHsgcG9zaXRpb25zLCBsaW5lTnVtYmVyIH0gb2YgbGluZUJyZWFrcG9pbnRzKSB7XG5cdFx0aWYgKHBvc2l0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIERvIG5vdCByZW5kZXIgY2FuZGlkYXRlcyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgc2luY2UgaXQgaXMgYWxyZWFkeSBjb3ZlcmVkIGJ5IHRoZSBsaW5lIGJyZWFrcG9pbnRcblx0XHRjb25zdCBmaXJzdENvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGFzdENvbHVtbiA9IG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRwb3NpdGlvbnMuZm9yRWFjaChwID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHAubGluZU51bWJlciwgcC5jb2x1bW4sIHAubGluZU51bWJlciwgcC5jb2x1bW4gKyAxKTtcblx0XHRcdGlmICgocC5jb2x1bW4gPD0gZmlyc3RDb2x1bW4gJiYgIWJyZWFrcG9pbnREZWNvcmF0aW9ucy5zb21lKGJwID0+IGJwLnJhbmdlLnN0YXJ0Q29sdW1uID4gZmlyc3RDb2x1bW4gJiYgYnAucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwLmxpbmVOdW1iZXIpKSB8fCBwLmNvbHVtbiA+IGxhc3RDb2x1bW4pIHtcblx0XHRcdFx0Ly8gRG8gbm90IHJlbmRlciBjYW5kaWRhdGVzIG9uIHRoZSBzdGFydCBvZiB0aGUgbGluZSBpZiB0aGVyZSdzIG5vIG90aGVyIGJyZWFrcG9pbnQgb24gdGhlIGxpbmUuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnJlYWtwb2ludEF0UG9zaXRpb24gPSBicmVha3BvaW50RGVjb3JhdGlvbnMuZmluZChicGQgPT4gYnBkLnJhbmdlLmVxdWFsc1JhbmdlKHJhbmdlKSk7XG5cdFx0XHRpZiAoYnJlYWtwb2ludEF0UG9zaXRpb24gJiYgYnJlYWtwb2ludEF0UG9zaXRpb24uaW5saW5lV2lkZ2V0KSB7XG5cdFx0XHRcdC8vIFNwYWNlIGFscmVhZHkgb2NjdXBpZWQsIGRvIG5vdCByZW5kZXIgY2FuZGlkYXRlLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdicmVha3BvaW50LXBsYWNlaG9sZGVyLWRlY29yYXRpb24nLFxuXHRcdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdFx0XHRcdGJlZm9yZTogYnJlYWtwb2ludEF0UG9zaXRpb24gPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBub0JyZWFrV2hpdGVzcGFjZSxcblx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogYGRlYnVnLWJyZWFrcG9pbnQtcGxhY2Vob2xkZXJgLFxuXHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRicmVha3BvaW50OiBicmVha3BvaW50QXRQb3NpdGlvbiA/IGJyZWFrcG9pbnRBdFBvc2l0aW9uLmJyZWFrcG9pbnQgOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24gaW1wbGVtZW50cyBJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBicmVha3BvaW50SGludERlY29yYXRpb246IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGJyZWFrcG9pbnRXaWRnZXQ6IEJyZWFrcG9pbnRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYnJlYWtwb2ludFdpZGdldFZpc2libGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBpZ25vcmVEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCA9IGZhbHNlO1xuXHRwcml2YXRlIGlnbm9yZUJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0cHJpdmF0ZSBicmVha3BvaW50RGVjb3JhdGlvbnM6IElCcmVha3BvaW50RGVjb3JhdGlvbltdID0gW107XG5cdHByaXZhdGUgY2FuZGlkYXRlRGVjb3JhdGlvbnM6IHsgZGVjb3JhdGlvbklkOiBzdHJpbmc7IGlubGluZVdpZGdldDogSW5saW5lQnJlYWtwb2ludFdpZGdldCB9W10gPSBbXTtcblx0cHJpdmF0ZSBzZXREZWNvcmF0aW9uc1NjaGVkdWxlciE6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXRWaXNpYmxlID0gQ09OVEVYVF9CUkVBS1BPSU5UX1dJREdFVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuc2V0RGVjb3JhdGlvbnMoKSwgMzApO1xuXHRcdHRoaXMuc2V0RGVjb3JhdGlvbnNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBjb250ZXh0IG1lbnUgYWN0aW9ucyBhdCB0aGUgbGluZSBudW1iZXIgaWYgYnJlYWtwb2ludHMgY2FuIGJlXG5cdCAqIHNldC4gVGhpcyBpcyB1c2VkIGJ5IHRoZSB7QGxpbmsgVGVzdGluZ0RlY29yYXRpb25zfSB0byBhbGxvdyBicmVha3BvaW50XG5cdCAqIHNldHRpbmcgb24gbGluZXMgd2hlcmUgYnJlYWtwb2ludCBcInJ1blwiIGFjdGlvbnMgYXJlIHByZXNlbnQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q29udGV4dE1lbnVBY3Rpb25zQXRQb3NpdGlvbihsaW5lTnVtYmVyOiBudW1iZXIsIG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0aWYgKCF0aGlzLmRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5kZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBicmVha3BvaW50cyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoeyBsaW5lTnVtYmVyLCB1cmk6IG1vZGVsLnVyaSB9KTtcblx0XHRyZXR1cm4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoYnJlYWtwb2ludHMsIG1vZGVsLnVyaSwgbGluZU51bWJlcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZURvd24oYXN5bmMgKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuaGFzRW5hYmxlZERlYnVnZ2VycygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFlLnRhcmdldC5wb3NpdGlvblxuXHRcdFx0XHR8fCAhbW9kZWxcblx0XHRcdFx0fHwgZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU5cblx0XHRcdFx0fHwgZS50YXJnZXQuZGV0YWlsLmlzQWZ0ZXJMaW5lc1xuXHRcdFx0XHR8fCAhdGhpcy5tYXJnaW5GcmVlRnJvbU5vbkRlYnVnRGVjb3JhdGlvbnMoZS50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcilcblx0XHRcdFx0Ly8gZG9uJ3QgcmV0dXJuIGVhcmx5IGlmIHRoZXJlJ3MgYSBicmVha3BvaW50XG5cdFx0XHRcdCYmICFlLnRhcmdldC5lbGVtZW50Py5jbGFzc05hbWUuaW5jbHVkZXMoJ2JyZWFrcG9pbnQnKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNhblNldEJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbCk7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gZS50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaTtcblxuXHRcdFx0aWYgKGUuZXZlbnQucmlnaHRCdXR0b24gfHwgKGVudi5pc01hY2ludG9zaCAmJiBlLmV2ZW50LmxlZnRCdXR0b24gJiYgZS5ldmVudC5jdHJsS2V5KSkge1xuXHRcdFx0XHQvLyBoYW5kbGVkIGJ5IGVkaXRvciBndXR0ZXIgY29udGV4dCBtZW51XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IHVyaSwgbGluZU51bWJlciB9KTtcblxuXHRcdFx0XHRpZiAoYnJlYWtwb2ludHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNTaGlmdFByZXNzZWQgPSBlLmV2ZW50LnNoaWZ0S2V5O1xuXHRcdFx0XHRcdGNvbnN0IGlzQWx0UHJlc3NlZCA9IGUuZXZlbnQuYWx0S2V5O1xuXHRcdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSBicmVha3BvaW50cy5zb21lKGJwID0+IGJwLmVuYWJsZWQpO1xuXG5cdFx0XHRcdFx0aWYgKGlzQWx0UHJlc3NlZCkge1xuXHRcdFx0XHRcdFx0Ly8gQWx0K2NsaWNrIG9uIGV4aXN0aW5nIGJyZWFrcG9pbnQgb3BlbnMgdGhlIGJyZWFrcG9pbnQgd2lkZ2V0IGZvciBlZGl0aW5nXG5cdFx0XHRcdFx0XHR0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGJyZWFrcG9pbnRzWzBdLmxpbmVOdW1iZXIsIGJyZWFrcG9pbnRzWzBdLmNvbHVtbik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc1NoaWZ0UHJlc3NlZCkge1xuXHRcdFx0XHRcdFx0YnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiB0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZW5hYmxlZCwgYnApKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFlbnYuaXNMaW51eCAmJiBicmVha3BvaW50cy5zb21lKGJwID0+ICEhYnAuY29uZGl0aW9uIHx8ICEhYnAubG9nTWVzc2FnZSB8fCAhIWJwLmhpdENvbmRpdGlvbiB8fCAhIWJwLnRyaWdnZXJlZEJ5KSkge1xuXHRcdFx0XHRcdFx0Ly8gU2hvdyB0aGUgZGlhbG9nIGlmIHRoZXJlIGlzIGEgcG90ZW50aWFsIGNvbmRpdGlvbiB0byBiZSBhY2NpZGVudGx5IGxvc3QuXG5cdFx0XHRcdFx0XHQvLyBEbyBub3Qgc2hvdyBkaWFsb2cgb24gbGludXggZHVlIHRvIGVsZWN0cm9uIGlzc3VlIGZyZWV6aW5nIHRoZSBtb3VzZSAjNTAwMjZcblx0XHRcdFx0XHRcdGNvbnN0IGxvZ1BvaW50ID0gYnJlYWtwb2ludHMuZXZlcnkoYnAgPT4gISFicC5sb2dNZXNzYWdlKTtcblx0XHRcdFx0XHRcdGNvbnN0IGJyZWFrcG9pbnRUeXBlID0gbG9nUG9pbnQgPyBubHMubG9jYWxpemUoJ2xvZ1BvaW50JywgXCJMb2dwb2ludFwiKSA6IG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludCcsIFwiQnJlYWtwb2ludFwiKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgZGlzYWJsZWRCcmVha3BvaW50RGlhbG9nTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J2JyZWFrcG9pbnRIYXNDb25kaXRpb25EaXNhYmxlZCcsXG5cdFx0XHRcdFx0XHRcdFwiVGhpcyB7MH0gaGFzIGEgezF9IHRoYXQgd2lsbCBnZXQgbG9zdCBvbiByZW1vdmUuIENvbnNpZGVyIGVuYWJsaW5nIHRoZSB7MH0gaW5zdGVhZC5cIixcblx0XHRcdFx0XHRcdFx0YnJlYWtwb2ludFR5cGUudG9Mb3dlckNhc2UoKSxcblx0XHRcdFx0XHRcdFx0bG9nUG9pbnQgPyBubHMubG9jYWxpemUoJ21lc3NhZ2UnLCBcIm1lc3NhZ2VcIikgOiBubHMubG9jYWxpemUoJ2NvbmRpdGlvbicsIFwiY29uZGl0aW9uXCIpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5hYmxlZEJyZWFrcG9pbnREaWFsb2dNZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQnYnJlYWtwb2ludEhhc0NvbmRpdGlvbkVuYWJsZWQnLFxuXHRcdFx0XHRcdFx0XHRcIlRoaXMgezB9IGhhcyBhIHsxfSB0aGF0IHdpbGwgZ2V0IGxvc3Qgb24gcmVtb3ZlLiBDb25zaWRlciBkaXNhYmxpbmcgdGhlIHswfSBpbnN0ZWFkLlwiLFxuXHRcdFx0XHRcdFx0XHRicmVha3BvaW50VHlwZS50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0XHRcdFx0XHRsb2dQb2ludCA/IG5scy5sb2NhbGl6ZSgnbWVzc2FnZScsIFwibWVzc2FnZVwiKSA6IG5scy5sb2NhbGl6ZSgnY29uZGl0aW9uJywgXCJjb25kaXRpb25cIilcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBzZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBlbmFibGVkID8gZW5hYmxlZEJyZWFrcG9pbnREaWFsb2dNZXNzYWdlIDogZGlzYWJsZWRCcmVha3BvaW50RGlhbG9nTWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdyZW1vdmVMb2dQb2ludCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbW92ZSB7MH1cIiwgYnJlYWtwb2ludFR5cGUpLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBicmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJwLmdldElkKCkpKVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZGlzYWJsZUxvZ1BvaW50JywgXCJ7MH0gezF9XCIsIGVuYWJsZWQgPyBubHMubG9jYWxpemUoeyBrZXk6ICdkaXNhYmxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGlzYWJsZVwiKSA6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2VuYWJsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkVuYWJsZVwiKSwgYnJlYWtwb2ludFR5cGUpLFxuXHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBicmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFlbmFibGVkLCBicCkpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiB0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghZW5hYmxlZCwgYnApKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChjYW5TZXRCcmVha3BvaW50cykge1xuXHRcdFx0XHRcdGlmIChlLmV2ZW50LmFsdEtleSkge1xuXHRcdFx0XHRcdFx0Ly8gQWx0K2NsaWNrIG9uIGVtcHR5IGd1dHRlciBvcGVucyB0aGUgYnJlYWtwb2ludCB3aWRnZXQgZm9yIGFkZGluZyBhIGNvbmRpdGlvbmFsIGJyZWFrcG9pbnRcblx0XHRcdFx0XHRcdHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlciwgdW5kZWZpbmVkLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5DT05ESVRJT04pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5ldmVudC5taWRkbGVCdXR0b24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuZ3V0dGVyTWlkZGxlQ2xpY2tBY3Rpb247XG5cdFx0XHRcdFx0XHRpZiAoYWN0aW9uICE9PSAnbm9uZScpIHtcblx0XHRcdFx0XHRcdFx0bGV0IGNvbnRleHQ6IEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0O1xuXHRcdFx0XHRcdFx0XHRzd2l0Y2ggKGFjdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2xvZ3BvaW50Jzpcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQgPSBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5MT0dfTUVTU0FHRTtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2NvbmRpdGlvbmFsQnJlYWtwb2ludCc6XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250ZXh0ID0gQnJlYWtwb2ludFdpZGdldENvbnRleHQuQ09ORElUSU9OO1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0Y2FzZSAndHJpZ2dlcmVkQnJlYWtwb2ludCc6XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250ZXh0ID0gQnJlYWtwb2ludFdpZGdldENvbnRleHQuVFJJR0dFUl9QT0lOVDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGxpbmVOdW1iZXIsIHVuZGVmaW5lZCwgY29udGV4dCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKHVyaSwgW3sgbGluZU51bWJlciB9XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCEoQnJvd3NlckZlYXR1cmVzLnBvaW50ZXJFdmVudHMgJiYgaXNTYWZhcmkpKSB7XG5cdFx0XHQvKipcblx0XHRcdCAqIFdlIGRpc2FibGUgdGhlIGhvdmVyIGZlYXR1cmUgZm9yIFNhZmFyaSBvbiBpT1MgYXNcblx0XHRcdCAqIDEuIEJyb3dzZXIgaG92ZXIgZXZlbnRzIGFyZSBoYW5kbGVkIHNwZWNpYWxseSBieSB0aGUgc3lzdGVtIChpdCB0cmVhdHMgZmlyc3QgY2xpY2sgYXMgaG92ZXIgaWYgdGhlcmUgaXMgYDpob3ZlcmAgY3NzIHJlZ2lzdGVyZWQpLiBCZWxvdyBob3ZlciBiZWhhdmlvciB3aWxsIGNvbmZ1c2UgdXNlcnMgd2l0aCBpbmNvbnNpc3RlbnQgZXhwZWlyZW5jZS5cblx0XHRcdCAqIDIuIFdoZW4gdXNlcnMgY2xpY2sgb24gbGluZSBudW1iZXJzLCB0aGUgYnJlYWtwb2ludCBoaW50IGRpc3BsYXlzIGltbWVkaWF0ZWx5LCBob3dldmVyIGl0IGRvZXNuJ3QgY3JlYXRlIHRoZSBicmVha3BvaW50IHVubGVzcyB1c2VycyBjbGljayBvbiB0aGUgbGVmdCBndXR0ZXIuIE9uIGEgdG91Y2ggc2NyZWVuLCBpdCdzIGhhcmQgdG8gY2xpY2sgb24gdGhhdCBzbWFsbCBhcmVhLlxuXHRcdFx0ICovXG5cdFx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uTW91c2VNb3ZlKChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuaGFzRW5hYmxlZERlYnVnZ2VycygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlciA9IC0xO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdGlmIChtb2RlbCAmJiBlLnRhcmdldC5wb3NpdGlvbiAmJiAoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4gfHwgZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX05VTUJFUlMpICYmIHRoaXMuZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4obW9kZWwpICYmXG5cdFx0XHRcdFx0dGhpcy5tYXJnaW5GcmVlRnJvbU5vbkRlYnVnRGVjb3JhdGlvbnMoZS50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gZS50YXJnZXQuZGV0YWlsO1xuXHRcdFx0XHRcdGlmICghZGF0YS5pc0FmdGVyTGluZXMpIHtcblx0XHRcdFx0XHRcdHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlciA9IGUudGFyZ2V0LnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZW5zdXJlQnJlYWtwb2ludEhpbnREZWNvcmF0aW9uKHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlcik7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uTW91c2VMZWF2ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZW5zdXJlQnJlYWtwb2ludEhpbnREZWNvcmF0aW9uKC0xKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbChhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLmNsb3NlQnJlYWtwb2ludFdpZGdldCgpO1xuXHRcdFx0YXdhaXQgdGhpcy5zZXREZWNvcmF0aW9ucygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaWdub3JlQnJlYWtwb2ludHNDaGFuZ2VFdmVudCAmJiAhdGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RGVjb3JhdGlvbnNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5vbkRpZENoYW5nZVN0YXRlKCgpID0+IHtcblx0XHRcdC8vIFdlIG5lZWQgdG8gdXBkYXRlIGJyZWFrcG9pbnQgZGVjb3JhdGlvbnMgd2hlbiBzdGF0ZSBjaGFuZ2VzIHNpbmNlIHRoZSB0b3Agc3RhY2sgZnJhbWUgYW5kIGJyZWFrcG9pbnQgZGVjb3JhdGlvbiBtaWdodCBjaGFuZ2Vcblx0XHRcdGlmICghdGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RGVjb3JhdGlvbnNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKCkgPT4gdGhpcy5vbk1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkKCkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuc2hvd0JyZWFrcG9pbnRzSW5PdmVydmlld1J1bGVyJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuc2hvd0lubGluZUJyZWFrcG9pbnRDYW5kaWRhdGVzJykpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZXREZWNvcmF0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGJyZWFrcG9pbnRzOiBSZWFkb25seUFycmF5PElCcmVha3BvaW50PiwgdXJpOiBVUkksIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uPzogbnVtYmVyKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGlmIChicmVha3BvaW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IGJyZWFrcG9pbnRUeXBlID0gYnJlYWtwb2ludHNbMF0ubG9nTWVzc2FnZSA/IG5scy5sb2NhbGl6ZSgnbG9nUG9pbnQnLCBcIkxvZ3BvaW50XCIpIDogbmxzLmxvY2FsaXplKCdicmVha3BvaW50JywgXCJCcmVha3BvaW50XCIpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdkZWJ1Zy5yZW1vdmVCcmVha3BvaW50JywgbGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3ZlQnJlYWtwb2ludCcsIFwiUmVtb3ZlIHswfVwiLCBicmVha3BvaW50VHlwZSksIGVuYWJsZWQ6IHRydWUsIHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzWzBdLmdldElkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy5hY3Rpb24uZWRpdEJyZWFrcG9pbnRBY3Rpb24nLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdlZGl0QnJlYWtwb2ludCcsIFwiRWRpdCB7MH0uLi5cIiwgYnJlYWtwb2ludFR5cGUpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IFByb21pc2UucmVzb2x2ZSh0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGJyZWFrcG9pbnRzWzBdLmxpbmVOdW1iZXIsIGJyZWFrcG9pbnRzWzBdLmNvbHVtbikpXG5cdFx0XHR9KSk7IGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiBgd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLnRvZ2dsZUJyZWFrcG9pbnRgLFxuXHRcdFx0XHRsYWJlbDogYnJlYWtwb2ludHNbMF0uZW5hYmxlZCA/IG5scy5sb2NhbGl6ZSgnZGlzYWJsZUJyZWFrcG9pbnQnLCBcIkRpc2FibGUgezB9XCIsIGJyZWFrcG9pbnRUeXBlKSA6IG5scy5sb2NhbGl6ZSgnZW5hYmxlQnJlYWtwb2ludCcsIFwiRW5hYmxlIHswfVwiLCBicmVha3BvaW50VHlwZSksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWJyZWFrcG9pbnRzWzBdLmVuYWJsZWQsIGJyZWFrcG9pbnRzWzBdKVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludHMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3Qgc29ydGVkID0gYnJlYWtwb2ludHMuc2xpY2UoKS5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiAoZmlyc3QuY29sdW1uICYmIHNlY29uZC5jb2x1bW4pID8gZmlyc3QuY29sdW1uIC0gc2Vjb25kLmNvbHVtbiA6IDEpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdkZWJ1Zy5yZW1vdmVCcmVha3BvaW50cycsIG5scy5sb2NhbGl6ZSgncmVtb3ZlQnJlYWtwb2ludHMnLCBcIlJlbW92ZSBCcmVha3BvaW50c1wiKSwgc29ydGVkLm1hcChicCA9PiB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAncmVtb3ZlSW5saW5lQnJlYWtwb2ludCcsXG5cdFx0XHRcdGxhYmVsOiBicC5jb2x1bW4gPyBubHMubG9jYWxpemUoJ3JlbW92ZUlubGluZUJyZWFrcG9pbnRPbkNvbHVtbicsIFwiUmVtb3ZlIElubGluZSBCcmVha3BvaW50IG9uIENvbHVtbiB7MH1cIiwgYnAuY29sdW1uKSA6IG5scy5sb2NhbGl6ZSgncmVtb3ZlTGluZUJyZWFrcG9pbnQnLCBcIlJlbW92ZSBMaW5lIEJyZWFrcG9pbnRcIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSlcblx0XHRcdH0pKSkpOyBhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ2RlYnVnLmVkaXRCcmVha3BvaW50cycsIG5scy5sb2NhbGl6ZSgnZWRpdEJyZWFrcG9pbnRzJywgXCJFZGl0IEJyZWFrcG9pbnRzXCIpLCBzb3J0ZWQubWFwKGJwID0+XG5cdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ2VkaXRCcmVha3BvaW50Jyxcblx0XHRcdFx0XHRsYWJlbDogYnAuY29sdW1uID8gbmxzLmxvY2FsaXplKCdlZGl0SW5saW5lQnJlYWtwb2ludE9uQ29sdW1uJywgXCJFZGl0IElubGluZSBCcmVha3BvaW50IG9uIENvbHVtbiB7MH1cIiwgYnAuY29sdW1uKSA6IG5scy5sb2NhbGl6ZSgnZWRpdExpbmVCcmVha3BvaW50JywgXCJFZGl0IExpbmUgQnJlYWtwb2ludFwiKSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQoYnAubGluZU51bWJlciwgYnAuY29sdW1uKSlcblx0XHRcdFx0fSlcblx0XHRcdCkpKTsgYWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdkZWJ1Zy5lbmFibGVEaXNhYmxlQnJlYWtwb2ludHMnLCBubHMubG9jYWxpemUoJ2VuYWJsZURpc2FibGVCcmVha3BvaW50cycsIFwiRW5hYmxlL0Rpc2FibGUgQnJlYWtwb2ludHNcIiksIHNvcnRlZC5tYXAoYnAgPT4gdG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogYnAuZW5hYmxlZCA/ICdkaXNhYmxlQ29sdW1uQnJlYWtwb2ludCcgOiAnZW5hYmxlQ29sdW1uQnJlYWtwb2ludCcsXG5cdFx0XHRcdGxhYmVsOiBicC5lbmFibGVkID8gKGJwLmNvbHVtbiA/IG5scy5sb2NhbGl6ZSgnZGlzYWJsZUlubGluZUNvbHVtbkJyZWFrcG9pbnQnLCBcIkRpc2FibGUgSW5saW5lIEJyZWFrcG9pbnQgb24gQ29sdW1uIHswfVwiLCBicC5jb2x1bW4pIDogbmxzLmxvY2FsaXplKCdkaXNhYmxlQnJlYWtwb2ludE9uTGluZScsIFwiRGlzYWJsZSBMaW5lIEJyZWFrcG9pbnRcIikpXG5cdFx0XHRcdFx0OiAoYnAuY29sdW1uID8gbmxzLmxvY2FsaXplKCdlbmFibGVCcmVha3BvaW50cycsIFwiRW5hYmxlIElubGluZSBCcmVha3BvaW50IG9uIENvbHVtbiB7MH1cIiwgYnAuY29sdW1uKSA6IG5scy5sb2NhbGl6ZSgnZW5hYmxlQnJlYWtwb2ludE9uTGluZScsIFwiRW5hYmxlIExpbmUgQnJlYWtwb2ludFwiKSksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWJwLmVuYWJsZWQsIGJwKVxuXHRcdFx0fSkpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnYWRkQnJlYWtwb2ludCcsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2FkZEJyZWFrcG9pbnQnLCBcIkFkZCBCcmVha3BvaW50XCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKHVyaSwgW3sgbGluZU51bWJlciwgY29sdW1uIH1dKVxuXHRcdFx0fSkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhZGRDb25kaXRpb25hbEJyZWFrcG9pbnQnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdhZGRDb25kaXRpb25hbEJyZWFrcG9pbnQnLCBcIkFkZCBDb25kaXRpb25hbCBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IFByb21pc2UucmVzb2x2ZSh0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGxpbmVOdW1iZXIsIGNvbHVtbiwgQnJlYWtwb2ludFdpZGdldENvbnRleHQuQ09ORElUSU9OKSlcblx0XHRcdH0pKTtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnYWRkTG9nUG9pbnQnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdhZGRMb2dQb2ludCcsIFwiQWRkIExvZ3BvaW50Li4uXCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IFByb21pc2UucmVzb2x2ZSh0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGxpbmVOdW1iZXIsIGNvbHVtbiwgQnJlYWtwb2ludFdpZGdldENvbnRleHQuTE9HX01FU1NBR0UpKVxuXHRcdFx0fSkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhZGRUcmlnZ2VyZWRCcmVha3BvaW50Jyxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnYWRkVHJpZ2dlcmVkQnJlYWtwb2ludCcsIFwiQWRkIFRyaWdnZXJlZCBCcmVha3BvaW50Li4uXCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IFByb21pc2UucmVzb2x2ZSh0aGlzLnNob3dCcmVha3BvaW50V2lkZ2V0KGxpbmVOdW1iZXIsIGNvbHVtbiwgQnJlYWtwb2ludFdpZGdldENvbnRleHQuVFJJR0dFUl9QT0lOVCkpXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAncnVuVG9MaW5lJyxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncnVuVG9MaW5lJywgXCJSdW4gdG8gTGluZVwiKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlYnVnU2VydmljZS5ydW5Ubyh1cmksIGxpbmVOdW1iZXIpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKVxuXHRcdFx0fSkpO1xuXHRcdH0gcmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIG1hcmdpbkZyZWVGcm9tTm9uRGVidWdEZWNvcmF0aW9ucyhsaW5lOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmdldExpbmVEZWNvcmF0aW9ucyhsaW5lKTtcblx0XHRpZiAoZGVjb3JhdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgeyBvcHRpb25zIH0gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgY2x6ID0gb3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZTtcblx0XHRcdFx0aWYgKCFjbHopIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoYXNTb21lQWN0aW9uYWJsZUNvZGljb24gPSAhKGNsei5pbmNsdWRlcygnY29kaWNvbi0nKSB8fCBjbHouc3RhcnRzV2l0aCgnY292ZXJhZ2UtZGVjby0nKSkgfHwgY2x6LmluY2x1ZGVzKCdjb2RpY29uLXRlc3RpbmctJykgfHwgY2x6LmluY2x1ZGVzKCdjb2RpY29uLW1lcmdlLScpIHx8IGNsei5pbmNsdWRlcygnY29kaWNvbi1hcnJvdy0nKSB8fCBjbHouaW5jbHVkZXMoJ2NvZGljb24tbG9hZGluZycpIHx8IGNsei5pbmNsdWRlcygnY29kaWNvbi1mb2xkJykgfHwgY2x6LmluY2x1ZGVzKCdjb2RpY29uLWd1dHRlci1saWdodGJ1bGInKSB8fCBjbHouaW5jbHVkZXMoJ2NvZGljb24tbGlnaHRidWxiLXNwYXJrbGUnKTtcblx0XHRcdFx0aWYgKGhhc1NvbWVBY3Rpb25hYmxlQ29kaWNvbikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVCcmVha3BvaW50SGludERlY29yYXRpb24oc2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdGlmICh0aGlzLmJyZWFrcG9pbnRIaW50RGVjb3JhdGlvbikge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKHRoaXMuYnJlYWtwb2ludEhpbnREZWNvcmF0aW9uKTtcblx0XHRcdFx0dGhpcy5icmVha3BvaW50SGludERlY29yYXRpb24gPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlciAhPT0gLTEpIHtcblx0XHRcdFx0dGhpcy5icmVha3BvaW50SGludERlY29yYXRpb24gPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzaG93QnJlYWtwb2ludEhpbnRBdExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdH0sIGJyZWFrcG9pbnRIZWxwZXJEZWNvcmF0aW9uXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldERlY29yYXRpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldENhbmRpZGF0ZURlY29yYXRpb25zID0gKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zOiBCcmVha3BvaW50c0ZvckxpbmVbXSkgPT4ge1xuXHRcdFx0Y29uc3QgZGVzaXJlZENhbmRpZGF0ZURlY29yYXRpb25zID0gY3JlYXRlQ2FuZGlkYXRlRGVjb3JhdGlvbnMobW9kZWwsIHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zLCBkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zKTtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZURlY29yYXRpb25JZHMgPSBjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuY2FuZGlkYXRlRGVjb3JhdGlvbnMubWFwKGMgPT4gYy5kZWNvcmF0aW9uSWQpLCBkZXNpcmVkQ2FuZGlkYXRlRGVjb3JhdGlvbnMpO1xuXHRcdFx0dGhpcy5jYW5kaWRhdGVEZWNvcmF0aW9ucy5mb3JFYWNoKGNhbmRpZGF0ZSA9PiB7XG5cdFx0XHRcdGNhbmRpZGF0ZS5pbmxpbmVXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNhbmRpZGF0ZURlY29yYXRpb25zID0gY2FuZGlkYXRlRGVjb3JhdGlvbklkcy5tYXAoKGRlY29yYXRpb25JZCwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gZGVzaXJlZENhbmRpZGF0ZURlY29yYXRpb25zW2luZGV4XTtcblx0XHRcdFx0Ly8gQ2FuZGlkYXRlIGRlY29yYXRpb24gaGFzIGEgYnJlYWtwb2ludCBhdHRhY2hlZCB3aGVuIGEgYnJlYWtwb2ludCBpcyBhbHJlYWR5IGF0IHRoYXQgbG9jYXRpb24gYW5kIHdlIGRpZCBub3QgeWV0IHNldCBhIGRlY29yYXRpb24gdGhlcmVcblx0XHRcdFx0Ly8gSW4gcHJhY3RpY2UgdGhpcyBoYXBwZW5zIGZvciB0aGUgZmlyc3QgYnJlYWtwb2ludCB0aGF0IHdhcyBzZXQgb24gYSBsaW5lXG5cdFx0XHRcdC8vIFdlIGNvdWxkIGhhdmUgYWxzbyByZW5kZXJlZCB0aGlzIGZpcnN0IGRlY29yYXRpb24gYXMgcGFydCBvZiBkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zIGhvd2V2ZXIgYXQgdGhhdCBtb21lbnQgd2UgaGF2ZSBubyBsb2NhdGlvbiBpbmZvcm1hdGlvblxuXHRcdFx0XHRjb25zdCBpY29uID0gY2FuZGlkYXRlLmJyZWFrcG9pbnQgPyBnZXRCcmVha3BvaW50TWVzc2FnZUFuZEljb24odGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgY2FuZGlkYXRlLmJyZWFrcG9pbnQsIHRoaXMubGFiZWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpKS5pY29uIDogaWNvbnMuYnJlYWtwb2ludC5kaXNhYmxlZDtcblx0XHRcdFx0Y29uc3QgY29udGV4dE1lbnVBY3Rpb25zID0gKCkgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoY2FuZGlkYXRlLmJyZWFrcG9pbnQgPyBbY2FuZGlkYXRlLmJyZWFrcG9pbnRdIDogW10sIGFjdGl2ZUNvZGVFZGl0b3IuZ2V0TW9kZWwoKS51cmksIGNhbmRpZGF0ZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNhbmRpZGF0ZS5yYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHRcdGNvbnN0IGlubGluZVdpZGdldCA9IG5ldyBJbmxpbmVCcmVha3BvaW50V2lkZ2V0KGFjdGl2ZUNvZGVFZGl0b3IsIGRlY29yYXRpb25JZCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pLCBjYW5kaWRhdGUuYnJlYWtwb2ludCwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudUFjdGlvbnMpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvbklkLFxuXHRcdFx0XHRcdGlubGluZVdpZGdldFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSB0aGlzLmVkaXRvcjtcblx0XHRjb25zdCBtb2RlbCA9IGFjdGl2ZUNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBicmVha3BvaW50cyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoeyB1cmk6IG1vZGVsLnVyaSB9KTtcblx0XHRjb25zdCBkZWJ1Z1NldHRpbmdzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKTtcblx0XHRjb25zdCBkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVha3BvaW50RGVjb3JhdGlvbnMoYWNjZXNzb3IsIG1vZGVsLCBicmVha3BvaW50cywgdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSwgZGVidWdTZXR0aW5ncy5zaG93QnJlYWtwb2ludHNJbk92ZXJ2aWV3UnVsZXIpKTtcblxuXHRcdC8vIHRyeSB0byBzZXQgYnJlYWtwb2ludCBsb2NhdGlvbiBjYW5kaWRhdGVzIGluIHRoZSBzYW1lIGNoYW5nZURlY29yYXRpb25zKClcblx0XHQvLyBjYWxsIHRvIGF2b2lkIGZsaWNrZXJpbmcsIGlmIHRoZSBEQSByZXNwb25kcyByZWFzb25hYmx5IHF1aWNrbHkuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGNvbnN0IGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnMgPSBkZWJ1Z1NldHRpbmdzLnNob3dJbmxpbmVCcmVha3BvaW50Q2FuZGlkYXRlcyAmJiBzZXNzaW9uID8gcmVxdWVzdEJyZWFrcG9pbnRDYW5kaWRhdGVMb2NhdGlvbnModGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSwgZGVzaXJlZEJyZWFrcG9pbnREZWNvcmF0aW9ucy5tYXAoYnAgPT4gYnAucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSwgc2Vzc2lvbikgOiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdGNvbnN0IGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnNSYWNlZCA9IGF3YWl0IFByb21pc2UucmFjZShbZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9ucywgdGltZW91dCg1MDApLnRoZW4oKCkgPT4gdW5kZWZpbmVkKV0pO1xuXHRcdGlmIChkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zUmFjZWQgPT09IHVuZGVmaW5lZCkgeyAvLyB0aGUgdGltZW91dCByZXNvbHZlZCBmaXJzdFxuXHRcdFx0ZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9ucy50aGVuKHYgPT4gYWN0aXZlQ29kZUVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucyhkID0+IHNldENhbmRpZGF0ZURlY29yYXRpb25zKGQsIHYpKSk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuaWdub3JlRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQgPSB0cnVlO1xuXG5cdFx0XHQvLyBTZXQgYnJlYWtwb2ludCBkZWNvcmF0aW9uc1xuXHRcdFx0YWN0aXZlQ29kZUVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbklkcyA9IGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnModGhpcy5icmVha3BvaW50RGVjb3JhdGlvbnMubWFwKGJwZCA9PiBicGQuZGVjb3JhdGlvbklkKSwgZGVzaXJlZEJyZWFrcG9pbnREZWNvcmF0aW9ucyk7XG5cdFx0XHRcdHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zLmZvckVhY2goYnBkID0+IHtcblx0XHRcdFx0XHRicGQuaW5saW5lV2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucyA9IGRlY29yYXRpb25JZHMubWFwKChkZWNvcmF0aW9uSWQsIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0bGV0IGlubGluZVdpZGdldDogSW5saW5lQnJlYWtwb2ludFdpZGdldCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBicmVha3BvaW50ID0gYnJlYWtwb2ludHNbaW5kZXhdO1xuXHRcdFx0XHRcdGlmIChkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zW2luZGV4XS5vcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGV4dE1lbnVBY3Rpb25zID0gKCkgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoW2JyZWFrcG9pbnRdLCBhY3RpdmVDb2RlRWRpdG9yLmdldE1vZGVsKCkudXJpLCBicmVha3BvaW50LmxpbmVOdW1iZXIsIGJyZWFrcG9pbnQuY29sdW1uKTtcblx0XHRcdFx0XHRcdGlubGluZVdpZGdldCA9IG5ldyBJbmxpbmVCcmVha3BvaW50V2lkZ2V0KGFjdGl2ZUNvZGVFZGl0b3IsIGRlY29yYXRpb25JZCwgZGVzaXJlZEJyZWFrcG9pbnREZWNvcmF0aW9uc1tpbmRleF0ub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSwgYnJlYWtwb2ludCwgdGhpcy5kZWJ1Z1NlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudUFjdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkZWNvcmF0aW9uSWQsXG5cdFx0XHRcdFx0XHRicmVha3BvaW50LFxuXHRcdFx0XHRcdFx0cmFuZ2U6IGRlc2lyZWRCcmVha3BvaW50RGVjb3JhdGlvbnNbaW5kZXhdLnJhbmdlLFxuXHRcdFx0XHRcdFx0aW5saW5lV2lkZ2V0XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnNSYWNlZCkge1xuXHRcdFx0XHRcdHNldENhbmRpZGF0ZURlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yLCBkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zUmFjZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pZ25vcmVEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZCBvZiB0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucykge1xuXHRcdFx0aWYgKGQuaW5saW5lV2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQoZC5pbmxpbmVXaWRnZXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Nb2RlbERlY29yYXRpb25zQ2hhbmdlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5icmVha3BvaW50RGVjb3JhdGlvbnMubGVuZ3RoID09PSAwIHx8IHRoaXMuaWdub3JlRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQgfHwgIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdC8vIEkgaGF2ZSBubyBkZWNvcmF0aW9uc1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgc29tZXRoaW5nQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucy5mb3JFYWNoKGJyZWFrcG9pbnREZWNvcmF0aW9uID0+IHtcblx0XHRcdGlmIChzb21ldGhpbmdDaGFuZ2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld0JyZWFrcG9pbnRSYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShicmVha3BvaW50RGVjb3JhdGlvbi5kZWNvcmF0aW9uSWQpO1xuXHRcdFx0aWYgKG5ld0JyZWFrcG9pbnRSYW5nZSAmJiAoIWJyZWFrcG9pbnREZWNvcmF0aW9uLnJhbmdlLmVxdWFsc1JhbmdlKG5ld0JyZWFrcG9pbnRSYW5nZSkpKSB7XG5cdFx0XHRcdHNvbWV0aGluZ0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRicmVha3BvaW50RGVjb3JhdGlvbi5yYW5nZSA9IG5ld0JyZWFrcG9pbnRSYW5nZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoIXNvbWV0aGluZ0NoYW5nZWQpIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gZG8sIG15IGRlY29yYXRpb25zIGRpZCBub3QgY2hhbmdlLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPigpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgYnJlYWtwb2ludERlY29yYXRpb24gPSB0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9uc1tpXTtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25SYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShicmVha3BvaW50RGVjb3JhdGlvbi5kZWNvcmF0aW9uSWQpO1xuXHRcdFx0Ly8gY2hlY2sgaWYgdGhlIGxpbmUgZ290IGRlbGV0ZWQuXG5cdFx0XHRpZiAoZGVjb3JhdGlvblJhbmdlKSB7XG5cdFx0XHRcdC8vIHNpbmNlIHdlIGtub3cgaXQgaXMgY29sbGFwc2VkLCBpdCBjYW5ub3QgZ3JvdyB0byBtdWx0aXBsZSBsaW5lc1xuXHRcdFx0XHRpZiAoYnJlYWtwb2ludERlY29yYXRpb24uYnJlYWtwb2ludCkge1xuXHRcdFx0XHRcdGRhdGEuc2V0KGJyZWFrcG9pbnREZWNvcmF0aW9uLmJyZWFrcG9pbnQuZ2V0SWQoKSwge1xuXHRcdFx0XHRcdFx0bGluZU51bWJlcjogZGVjb3JhdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGNvbHVtbjogYnJlYWtwb2ludERlY29yYXRpb24uYnJlYWtwb2ludC5jb2x1bW4gPyBkZWNvcmF0aW9uUmFuZ2Uuc3RhcnRDb2x1bW4gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5pZ25vcmVCcmVha3BvaW50c0NoYW5nZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZUJyZWFrcG9pbnRzKG1vZGVsLnVyaSwgZGF0YSwgdHJ1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaWdub3JlQnJlYWtwb2ludHNDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8vIGJyZWFrcG9pbnQgd2lkZ2V0XG5cdHNob3dCcmVha3BvaW50V2lkZ2V0KGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQsIGNvbnRleHQ/OiBCcmVha3BvaW50V2lkZ2V0Q29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldD8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5icmVha3BvaW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVha3BvaW50V2lkZ2V0LCB0aGlzLmVkaXRvciwgbGluZU51bWJlciwgY29sdW1uLCBjb250ZXh0KTtcblx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXQuc2hvdyh7IGxpbmVOdW1iZXIsIGNvbHVtbjogMSB9KTtcblx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblx0fVxuXG5cdGNsb3NlQnJlYWtwb2ludFdpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5icmVha3BvaW50V2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5icmVha3BvaW50V2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5icmVha3BvaW50V2lkZ2V0VmlzaWJsZS5yZXNldCgpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuc2V0RGVjb3JhdGlvbnNTY2hlZHVsZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZURlY29yYXRpb25zKHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zLm1hcChicGQgPT4gYnBkLmRlY29yYXRpb25JZCkpO1xuXHRcdGRpc3Bvc2UodGhpcy50b0Rpc3Bvc2UpO1xuXHR9XG59XG5cbkd1dHRlckFjdGlvbnNSZWdpc3RyeS5yZWdpc3Rlckd1dHRlckFjdGlvbnNHZW5lcmF0b3IoKHsgbGluZU51bWJlciwgZWRpdG9yLCBhY2Nlc3NvciB9LCByZXN1bHQpID0+IHtcblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRpZiAoIW1vZGVsIHx8ICFkZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5oYXNFbmFibGVkRGVidWdnZXJzKCkgfHwgIWRlYnVnU2VydmljZS5jYW5TZXRCcmVha3BvaW50c0luKG1vZGVsKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24gPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uPihCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQpO1xuXHRpZiAoIWJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24pIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBhY3Rpb25zID0gYnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbi5nZXRDb250ZXh0TWVudUFjdGlvbnNBdFBvc2l0aW9uKGxpbmVOdW1iZXIsIG1vZGVsKTtcblxuXHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0cmVzdWx0LnB1c2goYWN0aW9uLCAnMl9kZWJ1ZycpO1xuXHR9XG59KTtcblxuY2xhc3MgSW5saW5lQnJlYWtwb2ludFdpZGdldCBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0LCBJRGlzcG9zYWJsZSB7XG5cblx0Ly8gZWRpdG9yLklDb250ZW50V2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3dcblx0YWxsb3dFZGl0b3JPdmVyZmxvdyA9IGZhbHNlO1xuXHRzdXBwcmVzc01vdXNlRG93biA9IHRydWU7XG5cblx0cHJpdmF0ZSBkb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmFuZ2U6IFJhbmdlIHwgbnVsbDtcblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uSWQ6IHN0cmluZyxcblx0XHRjc3NDbGFzczogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJyZWFrcG9pbnQ6IElCcmVha3BvaW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0Q29udGV4dE1lbnVBY3Rpb25zOiAoKSA9PiBJQWN0aW9uW11cblx0KSB7XG5cdFx0dGhpcy5yYW5nZSA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZCk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5kZWNvcmF0aW9uSWQpO1xuXHRcdFx0aWYgKHRoaXMucmFuZ2UgJiYgIXRoaXMucmFuZ2UuZXF1YWxzUmFuZ2UocmFuZ2UpKSB7XG5cdFx0XHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuY3JlYXRlKGNzc0NsYXNzKTtcblxuXHRcdHRoaXMuZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKGNzc0NsYXNzOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnLmlubGluZS1icmVha3BvaW50LXdpZGdldCcpO1xuXHRcdGlmIChjc3NDbGFzcykge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uY3NzQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0fVxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGFzeW5jIGUgPT4ge1xuXHRcdFx0c3dpdGNoICh0aGlzLmJyZWFrcG9pbnQ/LmVuYWJsZWQpIHtcblx0XHRcdFx0Y2FzZSB1bmRlZmluZWQ6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHModGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmksIFt7IGxpbmVOdW1iZXI6IHRoaXMucmFuZ2UhLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiB0aGlzLnJhbmdlIS5zdGFydENvbHVtbiB9XSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgdHJ1ZTpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyh0aGlzLmJyZWFrcG9pbnQuZ2V0SWQoKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgZmFsc2U6XG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHModHJ1ZSwgdGhpcy5icmVha3BvaW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgZSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiB0aGlzLmJyZWFrcG9pbnQsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zZUlmRGlzcG9zYWJsZShhY3Rpb25zKVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihjID0+IHtcblx0XHRcdGlmIChjLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKSB8fCBjLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2l6ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2l6ZSgpIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5yYW5nZSA/IHRoaXMuZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbih0aGlzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkgOiB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtNYXRoLmNlaWwoMC44ICogbGluZUhlaWdodCl9cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5tYXJnaW5MZWZ0ID0gYDRweGA7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZW5lcmF0ZVV1aWQoKTtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLnJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Ly8gV29ya2Fyb3VuZDogc2luY2UgdGhlIGNvbnRlbnQgd2lkZ2V0IGNhbiBub3QgYmUgcGxhY2VkIGJlZm9yZSB0aGUgZmlyc3QgY29sdW1uIHdlIG5lZWQgdG8gZm9yY2UgdGhlIGxlZnQgcG9zaXRpb25cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnbGluZS1zdGFydCcsIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gPT09IDEpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIH0sXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVF1cblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdGRpc3Bvc2UodGhpcy50b0Rpc3Bvc2UpO1xuXHR9XG59XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IHNjb3BlID0gJy5tb25hY28tZWRpdG9yIC5nbHlwaC1tYXJnaW4td2lkZ2V0cywgLm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLWJyZWFrcG9pbnRzLCAubW9uYWNvLXdvcmtiZW5jaCAuZGlzYXNzZW1ibHktdmlldywgLm1vbmFjby1lZGl0b3IgLmNvbnRlbnRXaWRnZXRzJztcblx0Y29uc3QgZGVidWdJY29uQnJlYWtwb2ludENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQnJlYWtwb2ludEZvcmVncm91bmQpO1xuXHRpZiAoZGVidWdJY29uQnJlYWtwb2ludENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7c2NvcGV9IHtcblx0XHRcdCR7aWNvbnMuYWxsQnJlYWtwb2ludHMubWFwKGIgPT4gYCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoYi5yZWd1bGFyKX1gKS5qb2luKCcsXFxuXHRcdCcpfSxcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdCcmVha3BvaW50VW5zdXBwb3J0ZWQpfSxcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdCcmVha3BvaW50SGludCl9Om5vdChbY2xhc3MqPSdjb2RpY29uLWRlYnVnLWJyZWFrcG9pbnQnXSk6bm90KFtjbGFzcyo9J2NvZGljb24tZGVidWctc3RhY2tmcmFtZSddKSxcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuYnJlYWtwb2ludC5yZWd1bGFyKX0ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RhY2tmcmFtZUZvY3VzZWQpfTo6YWZ0ZXIsXG5cdFx0XHQke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmJyZWFrcG9pbnQucmVndWxhcil9JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0YWNrZnJhbWUpfTo6YWZ0ZXIge1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z0ljb25CcmVha3BvaW50Q29sb3J9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0fWApO1xuXG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7c2NvcGV9IHtcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuYnJlYWtwb2ludC5wZW5kaW5nKX0ge1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z0ljb25CcmVha3BvaW50Q29sb3J9ICFpbXBvcnRhbnQ7XG5cdFx0XHRcdGZvbnQtc2l6ZTogMTJweCAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdH1gKTtcblx0fVxuXG5cdGNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnREaXNhYmxlZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQnJlYWtwb2ludERpc2FibGVkRm9yZWdyb3VuZCk7XG5cdGlmIChkZWJ1Z0ljb25CcmVha3BvaW50RGlzYWJsZWRDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAke3Njb3BlfSB7XG5cdFx0XHQke2ljb25zLmFsbEJyZWFrcG9pbnRzLm1hcChiID0+IFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGIuZGlzYWJsZWQpKS5qb2luKCcsXFxuXHRcdCcpfSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnREaXNhYmxlZENvbG9yfTtcblx0XHRcdH1cblx0XHR9YCk7XG5cdH1cblxuXHRjb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50VW52ZXJpZmllZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQnJlYWtwb2ludFVudmVyaWZpZWRGb3JlZ3JvdW5kKTtcblx0aWYgKGRlYnVnSWNvbkJyZWFrcG9pbnRVbnZlcmlmaWVkQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgJHtzY29wZX0ge1xuXHRcdFx0JHtpY29ucy5hbGxCcmVha3BvaW50cy5tYXAoYiA9PiBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihiLnVudmVyaWZpZWQpKS5qb2luKCcsXFxuXHRcdCcpfSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRVbnZlcmlmaWVkQ29sb3J9O1xuXHRcdFx0fVxuXHRcdH1gKTtcblx0fVxuXG5cdGNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvbkJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmQpO1xuXHRpZiAoZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdC5tb25hY28tZWRpdG9yIC5kZWJ1Zy10b3Atc3RhY2stZnJhbWUtY29sdW1uIHtcblx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmRDb2xvcn0gIWltcG9ydGFudDtcblx0XHR9XG5cdFx0JHtzY29wZX0ge1xuXHRcdFx0JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0YWNrZnJhbWUpfSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmRDb2xvcn0gIWltcG9ydGFudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50U3RhY2tmcmFtZUZvY3VzZWRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvbkJyZWFrcG9pbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCk7XG5cdGlmIChkZWJ1Z0ljb25CcmVha3BvaW50U3RhY2tmcmFtZUZvY3VzZWRDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAke3Njb3BlfSB7XG5cdFx0XHQke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RhY2tmcmFtZUZvY3VzZWQpfSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRTdGFja2ZyYW1lRm9jdXNlZENvbG9yfSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdH1gKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5icmVha3BvaW50Rm9yZWdyb3VuZCcsICcjRTUxNDAwJywgbmxzLmxvY2FsaXplKCdkZWJ1Z0ljb24uYnJlYWtwb2ludEZvcmVncm91bmQnLCAnSWNvbiBjb2xvciBmb3IgYnJlYWtwb2ludHMuJykpO1xuY29uc3QgZGVidWdJY29uQnJlYWtwb2ludERpc2FibGVkRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5icmVha3BvaW50RGlzYWJsZWRGb3JlZ3JvdW5kJywgJyM4NDg0ODQnLCBubHMubG9jYWxpemUoJ2RlYnVnSWNvbi5icmVha3BvaW50RGlzYWJsZWRGb3JlZ3JvdW5kJywgJ0ljb24gY29sb3IgZm9yIGRpc2FibGVkIGJyZWFrcG9pbnRzLicpKTtcbmNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRVbnZlcmlmaWVkRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5icmVha3BvaW50VW52ZXJpZmllZEZvcmVncm91bmQnLCAnIzg0ODQ4NCcsIG5scy5sb2NhbGl6ZSgnZGVidWdJY29uLmJyZWFrcG9pbnRVbnZlcmlmaWVkRm9yZWdyb3VuZCcsICdJY29uIGNvbG9yIGZvciB1bnZlcmlmaWVkIGJyZWFrcG9pbnRzLicpKTtcbmNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24uYnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCcsIHsgZGFyazogJyNGRkNDMDAnLCBsaWdodDogJyNCRTg3MDAnLCBoY0Rhcms6ICcjRkZDQzAwJywgaGNMaWdodDogJyNCRTg3MDAnIH0sIG5scy5sb2NhbGl6ZSgnZGVidWdJY29uLmJyZWFrcG9pbnRDdXJyZW50U3RhY2tmcmFtZUZvcmVncm91bmQnLCAnSWNvbiBjb2xvciBmb3IgdGhlIGN1cnJlbnQgYnJlYWtwb2ludCBzdGFjayBmcmFtZS4nKSk7XG5jb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50U3RhY2tmcmFtZUZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24uYnJlYWtwb2ludFN0YWNrZnJhbWVGb3JlZ3JvdW5kJywgJyM4OUQxODUnLCBubHMubG9jYWxpemUoJ2RlYnVnSWNvbi5icmVha3BvaW50U3RhY2tmcmFtZUZvcmVncm91bmQnLCAnSWNvbiBjb2xvciBmb3IgYWxsIGJyZWFrcG9pbnQgc3RhY2sgZnJhbWVzLicpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQWtCLFdBQVcsZUFBZSxnQkFBZ0I7QUFDNUQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0IsZUFBZTtBQUMxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLDJCQUF3QztBQUMxRCxZQUFZLFNBQVM7QUFDckIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUNBQTRILHVCQUF1QjtBQUM1SixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBNkgsbUJBQW1CLDhCQUE4QjtBQUN2TCxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNB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QVMscUNBQXFDO0FBQzdGLE1BQUksa0NBQWtDO0FBQ3JDLGNBQVUsUUFBUSxHQUFHLEtBQUs7QUFBQSxLQUN2QixNQUFNLGVBQWUsSUFBSSxPQUFLLFVBQVUsY0FBYyxFQUFFLFFBQVEsQ0FBQyxFQUFFLEtBQUssT0FBTyxDQUFDO0FBQUEsYUFDeEUsZ0NBQWdDO0FBQUE7QUFBQSxJQUV6QztBQUFBLEVBQ0g7QUFFQSxRQUFNLHFDQUFxQyxNQUFNLFNBQVMsdUNBQXVDO0FBQ2pHLE1BQUksb0NBQW9DO0FBQ3ZDLGNBQVUsUUFBUSxHQUFHLEtBQUs7QUFBQSxLQUN2QixNQUFNLGVBQWUsSUFBSSxPQUFLLFVBQVUsY0FBYyxFQUFFLFVBQVUsQ0FBQyxFQUFFLEtBQUssT0FBTyxDQUFDO0FBQUEsYUFDMUUsa0NBQWtDO0FBQUE7QUFBQSxJQUUzQztBQUFBLEVBQ0g7QUFFQSxRQUFNLHNEQUFzRCxNQUFNLFNBQVMsOENBQThDO0FBQ3pILE1BQUkscURBQXFEO0FBQ3hELGNBQVUsUUFBUTtBQUFBO0FBQUEsWUFFUixtREFBbUQ7QUFBQTtBQUFBLElBRTNELEtBQUs7QUFBQSxLQUNKLFVBQVUsY0FBYyxNQUFNLGVBQWUsQ0FBQztBQUFBLGFBQ3RDLG1EQUFtRDtBQUFBO0FBQUE7QUFBQSxHQUc3RDtBQUFBLEVBQ0Y7QUFFQSxRQUFNLDRDQUE0QyxNQUFNLFNBQVMsdUNBQXVDO0FBQ3hHLE1BQUksMkNBQTJDO0FBQzlDLGNBQVUsUUFBUSxHQUFHLEtBQUs7QUFBQSxLQUN2QixVQUFVLGNBQWMsTUFBTSxzQkFBc0IsQ0FBQztBQUFBLGFBQzdDLHlDQUF5QztBQUFBO0FBQUEsSUFFbEQ7QUFBQSxFQUNIO0FBQ0QsQ0FBQztBQUVNLE1BQU0sZ0NBQWdDLGNBQWMsa0NBQWtDLFdBQVcsSUFBSSxTQUFTLGtDQUFrQyw2QkFBNkIsQ0FBQztBQUNyTCxNQUFNLHdDQUF3QyxjQUFjLDBDQUEwQyxXQUFXLElBQUksU0FBUywwQ0FBMEMsc0NBQXNDLENBQUM7QUFDL00sTUFBTSwwQ0FBMEMsY0FBYyw0Q0FBNEMsV0FBVyxJQUFJLFNBQVMsNENBQTRDLHdDQUF3QyxDQUFDO0FBQ3ZOLE1BQU0saURBQWlELGNBQWMsbURBQW1ELEVBQUUsTUFBTSxXQUFXLE9BQU8sV0FBVyxRQUFRLFdBQVcsU0FBUyxVQUFVLEdBQUcsSUFBSSxTQUFTLG1EQUFtRCxvREFBb0QsQ0FBQztBQUMzVCxNQUFNLDBDQUEwQyxjQUFjLDRDQUE0QyxXQUFXLElBQUksU0FBUyw0Q0FBNEMsNkNBQTZDLENBQUM7IiwKICAibmFtZXMiOiBbIm1lc3NhZ2UiLCAiZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9ucyJdCn0K
