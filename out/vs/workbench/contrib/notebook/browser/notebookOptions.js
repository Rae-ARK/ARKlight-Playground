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
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { isObject } from "../../../../base/common/types.js";
import { FontMeasurements } from "../../../../editor/browser/config/fontMeasurements.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookSetting } from "../common/notebookCommon.js";
import { INotebookExecutionStateService } from "../common/notebookExecutionStateService.js";
const SCROLLABLE_ELEMENT_PADDING_TOP = 18;
const OutputInnerContainerTopPadding = 4;
const defaultConfigConstants = Object.freeze({
  codeCellLeftMargin: 28,
  cellRunGutter: 32,
  markdownCellTopMargin: 8,
  markdownCellBottomMargin: 8,
  markdownCellLeftMargin: 0,
  markdownCellGutter: 32,
  focusIndicatorLeftMargin: 4
});
const compactConfigConstants = Object.freeze({
  codeCellLeftMargin: 8,
  cellRunGutter: 36,
  markdownCellTopMargin: 6,
  markdownCellBottomMargin: 6,
  markdownCellLeftMargin: 8,
  markdownCellGutter: 36,
  focusIndicatorLeftMargin: 4
});
let NotebookOptions = class extends Disposable {
  constructor(targetWindow, isReadonly, overrides, configurationService, notebookExecutionStateService, codeEditorService) {
    super();
    this.targetWindow = targetWindow;
    this.isReadonly = isReadonly;
    this.overrides = overrides;
    this.configurationService = configurationService;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.codeEditorService = codeEditorService;
    this._onDidChangeOptions = this._register(new Emitter());
    this.onDidChangeOptions = this._onDidChangeOptions.event;
    this._editorTopPadding = 12;
    this.previousModelToCompare = observableValue("previousModelToCompare", void 0);
    const showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
    const globalToolbar = overrides?.globalToolbar ?? this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
    const stickyScrollEnabled = overrides?.stickyScrollEnabled ?? this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
    const stickyScrollMode = this._computeStickyScrollModeOption();
    const consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
    const consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? false;
    const dragAndDropEnabled = overrides?.dragAndDropEnabled ?? this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
    const cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { "default": "right" };
    const cellToolbarInteraction = overrides?.cellToolbarInteraction ?? this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
    const compactView = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
    const focusIndicator = this._computeFocusIndicatorOption();
    const insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
    const insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
    const showFoldingControls = this._computeShowFoldingControlsOption();
    const fontSize = this.configurationService.getValue("editor.fontSize");
    const markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
    const markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
    let editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) ?? {};
    editorOptionsCustomizations = isObject(editorOptionsCustomizations) ? editorOptionsCustomizations : {};
    const interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
    const outputLineHeightSettingValue = this.configurationService.getValue(NotebookSetting.outputLineHeight);
    const outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || fontSize;
    const outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
    const outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
    const outputLineHeight = this._computeOutputLineHeight(outputLineHeightSettingValue, outputFontSize);
    const outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
    const outputLineLimit = this.configurationService.getValue(NotebookSetting.textOutputLineLimit) ?? 30;
    const linkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths) ?? true;
    const minimalErrors = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
    const markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
    const editorTopPadding = this._computeEditorTopPadding();
    this._layoutConfiguration = {
      ...compactView ? compactConfigConstants : defaultConfigConstants,
      cellTopMargin: 6,
      cellBottomMargin: 6,
      cellRightMargin: 16,
      cellStatusBarHeight: 22,
      cellOutputPadding: 8,
      markdownPreviewPadding: 8,
      // bottomToolbarHeight: bottomToolbarHeight,
      // bottomToolbarGap: bottomToolbarGap,
      editorToolbarHeight: 0,
      editorTopPadding,
      editorBottomPadding: 4,
      editorBottomPaddingWithoutStatusBar: 12,
      collapsedIndicatorHeight: 28,
      showCellStatusBar,
      globalToolbar,
      stickyScrollEnabled,
      stickyScrollMode,
      consolidatedOutputButton,
      consolidatedRunButton,
      dragAndDropEnabled,
      cellToolbarLocation,
      cellToolbarInteraction,
      compactView,
      focusIndicator,
      insertToolbarPosition,
      insertToolbarAlignment,
      showFoldingControls,
      fontSize,
      outputFontSize,
      outputFontFamily,
      outputLineHeight,
      markupFontSize,
      markdownLineHeight,
      editorOptionsCustomizations,
      focusIndicatorGap: 3,
      interactiveWindowCollapseCodeCells,
      markdownFoldHintHeight: 22,
      outputScrolling,
      outputWordWrap,
      outputLineLimit,
      outputLinkifyFilePaths: linkifyFilePaths,
      outputMinimalError: minimalErrors,
      markupFontFamily,
      disableRulers: overrides?.disableRulers
    };
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      this._updateConfiguration(e);
    }));
  }
  updateOptions(isReadonly) {
    if (this.isReadonly !== isReadonly) {
      this.isReadonly = isReadonly;
      this._updateConfiguration({
        affectsConfiguration(configuration) {
          return configuration === NotebookSetting.insertToolbarLocation;
        },
        source: ConfigurationTarget.DEFAULT,
        affectedKeys: /* @__PURE__ */ new Set([NotebookSetting.insertToolbarLocation]),
        change: { keys: [NotebookSetting.insertToolbarLocation], overrides: [] }
      });
    }
  }
  _computeEditorTopPadding() {
    let decorationTriggeredAdjustment = false;
    const updateEditorTopPadding = (top) => {
      this._editorTopPadding = top;
      const configuration = Object.assign({}, this._layoutConfiguration);
      configuration.editorTopPadding = this._editorTopPadding;
      this._layoutConfiguration = configuration;
      this._onDidChangeOptions.fire({ editorTopPadding: true });
    };
    const decorationCheckSet = /* @__PURE__ */ new Set();
    const onDidAddDecorationType = (e) => {
      if (decorationTriggeredAdjustment) {
        return;
      }
      if (decorationCheckSet.has(e)) {
        return;
      }
      try {
        const options = this.codeEditorService.resolveDecorationOptions(e, true);
        if (options.afterContentClassName || options.beforeContentClassName) {
          const cssRules = this.codeEditorService.resolveDecorationCSSRules(e);
          if (cssRules !== null) {
            for (let i = 0; i < cssRules.length; i++) {
              if ((cssRules[i].selectorText.endsWith("::after") || cssRules[i].selectorText.endsWith("::after")) && cssRules[i].cssText.indexOf("top:") > -1) {
                const editorOptions = this.configurationService.getValue("editor");
                updateEditorTopPadding(createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value).lineHeight + 2);
                decorationTriggeredAdjustment = true;
                break;
              }
            }
          }
        }
        decorationCheckSet.add(e);
      } catch (_ex) {
      }
    };
    this._register(this.codeEditorService.onDecorationTypeRegistered(onDidAddDecorationType));
    this.codeEditorService.listDecorationTypes().forEach(onDidAddDecorationType);
    return this._editorTopPadding;
  }
  _computeOutputLineHeight(lineHeight, outputFontSize) {
    const minimumLineHeight = 9;
    if (lineHeight === 0) {
      const editorOptions = this.configurationService.getValue("editor");
      const fontInfo = FontMeasurements.readFontInfo(this.targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value));
      lineHeight = fontInfo.lineHeight;
    } else if (lineHeight < minimumLineHeight) {
      let fontSize = outputFontSize;
      if (fontSize === 0) {
        fontSize = this.configurationService.getValue("editor.fontSize");
      }
      lineHeight = lineHeight * fontSize;
    }
    lineHeight = Math.round(lineHeight);
    if (lineHeight < minimumLineHeight) {
      lineHeight = minimumLineHeight;
    }
    return lineHeight;
  }
  _updateConfiguration(e) {
    const cellStatusBarVisibility = e.affectsConfiguration(NotebookSetting.showCellStatusBar);
    const cellToolbarLocation = e.affectsConfiguration(NotebookSetting.cellToolbarLocation);
    const cellToolbarInteraction = e.affectsConfiguration(NotebookSetting.cellToolbarVisibility);
    const compactView = e.affectsConfiguration(NotebookSetting.compactView);
    const focusIndicator = e.affectsConfiguration(NotebookSetting.focusIndicator);
    const insertToolbarPosition = e.affectsConfiguration(NotebookSetting.insertToolbarLocation);
    const insertToolbarAlignment = e.affectsConfiguration(NotebookSetting.experimentalInsertToolbarAlignment);
    const globalToolbar = e.affectsConfiguration(NotebookSetting.globalToolbar);
    const stickyScrollEnabled = e.affectsConfiguration(NotebookSetting.stickyScrollEnabled);
    const stickyScrollMode = e.affectsConfiguration(NotebookSetting.stickyScrollMode);
    const consolidatedOutputButton = e.affectsConfiguration(NotebookSetting.consolidatedOutputButton);
    const consolidatedRunButton = e.affectsConfiguration(NotebookSetting.consolidatedRunButton);
    const showFoldingControls = e.affectsConfiguration(NotebookSetting.showFoldingControls);
    const dragAndDropEnabled = e.affectsConfiguration(NotebookSetting.dragAndDropEnabled);
    const fontSize = e.affectsConfiguration("editor.fontSize");
    const outputFontSize = e.affectsConfiguration(NotebookSetting.outputFontSize);
    const markupFontSize = e.affectsConfiguration(NotebookSetting.markupFontSize);
    const markdownLineHeight = e.affectsConfiguration(NotebookSetting.markdownLineHeight);
    const fontFamily = e.affectsConfiguration("editor.fontFamily");
    const outputFontFamily = e.affectsConfiguration(NotebookSetting.outputFontFamily);
    const editorOptionsCustomizations = e.affectsConfiguration(NotebookSetting.cellEditorOptionsCustomizations);
    const interactiveWindowCollapseCodeCells = e.affectsConfiguration(NotebookSetting.interactiveWindowCollapseCodeCells);
    const outputLineHeight = e.affectsConfiguration(NotebookSetting.outputLineHeight);
    const outputScrolling = e.affectsConfiguration(NotebookSetting.outputScrolling);
    const outputWordWrap = e.affectsConfiguration(NotebookSetting.outputWordWrap);
    const outputLinkifyFilePaths = e.affectsConfiguration(NotebookSetting.LinkifyOutputFilePaths);
    const minimalError = e.affectsConfiguration(NotebookSetting.minimalErrorRendering);
    const markupFontFamily = e.affectsConfiguration(NotebookSetting.markupFontFamily);
    if (!cellStatusBarVisibility && !cellToolbarLocation && !cellToolbarInteraction && !compactView && !focusIndicator && !insertToolbarPosition && !insertToolbarAlignment && !globalToolbar && !stickyScrollEnabled && !stickyScrollMode && !consolidatedOutputButton && !consolidatedRunButton && !showFoldingControls && !dragAndDropEnabled && !fontSize && !outputFontSize && !markupFontSize && !markdownLineHeight && !fontFamily && !outputFontFamily && !editorOptionsCustomizations && !interactiveWindowCollapseCodeCells && !outputLineHeight && !outputScrolling && !outputWordWrap && !outputLinkifyFilePaths && !minimalError && !markupFontFamily) {
      return;
    }
    let configuration = Object.assign({}, this._layoutConfiguration);
    if (cellStatusBarVisibility) {
      configuration.showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
    }
    if (cellToolbarLocation) {
      configuration.cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { "default": "right" };
    }
    if (cellToolbarInteraction && !this.overrides?.cellToolbarInteraction) {
      configuration.cellToolbarInteraction = this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
    }
    if (focusIndicator) {
      configuration.focusIndicator = this._computeFocusIndicatorOption();
    }
    if (compactView) {
      const compactViewValue = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
      configuration = Object.assign(configuration, {
        ...compactViewValue ? compactConfigConstants : defaultConfigConstants
      });
      configuration.compactView = compactViewValue;
    }
    if (insertToolbarAlignment) {
      configuration.insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
    }
    if (insertToolbarPosition) {
      configuration.insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
    }
    if (globalToolbar && this.overrides?.globalToolbar === void 0) {
      configuration.globalToolbar = this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
    }
    if (stickyScrollEnabled && this.overrides?.stickyScrollEnabled === void 0) {
      configuration.stickyScrollEnabled = this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
    }
    if (stickyScrollMode) {
      configuration.stickyScrollMode = this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? "flat";
    }
    if (consolidatedOutputButton) {
      configuration.consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
    }
    if (consolidatedRunButton) {
      configuration.consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? true;
    }
    if (showFoldingControls) {
      configuration.showFoldingControls = this._computeShowFoldingControlsOption();
    }
    if (dragAndDropEnabled) {
      configuration.dragAndDropEnabled = this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
    }
    if (fontSize) {
      configuration.fontSize = this.configurationService.getValue("editor.fontSize");
    }
    if (outputFontSize || fontSize) {
      configuration.outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || configuration.fontSize;
    }
    if (markupFontSize) {
      configuration.markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
    }
    if (markdownLineHeight) {
      configuration.markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
    }
    if (outputFontFamily) {
      configuration.outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
    }
    if (editorOptionsCustomizations) {
      configuration.editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
    }
    if (interactiveWindowCollapseCodeCells) {
      configuration.interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
    }
    if (outputLineHeight || fontSize || outputFontSize) {
      const lineHeight = this.configurationService.getValue(NotebookSetting.outputLineHeight);
      configuration.outputLineHeight = this._computeOutputLineHeight(lineHeight, configuration.outputFontSize);
    }
    if (outputWordWrap) {
      configuration.outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
    }
    if (outputScrolling) {
      configuration.outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
    }
    if (outputLinkifyFilePaths) {
      configuration.outputLinkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths);
    }
    if (minimalError) {
      configuration.outputMinimalError = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
    }
    if (markupFontFamily) {
      configuration.markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
    }
    this._layoutConfiguration = Object.freeze(configuration);
    this._onDidChangeOptions.fire({
      cellStatusBarVisibility,
      cellToolbarLocation,
      cellToolbarInteraction,
      compactView,
      focusIndicator,
      insertToolbarPosition,
      insertToolbarAlignment,
      globalToolbar,
      stickyScrollEnabled,
      stickyScrollMode,
      showFoldingControls,
      consolidatedOutputButton,
      consolidatedRunButton,
      dragAndDropEnabled,
      fontSize,
      outputFontSize,
      markupFontSize,
      markdownLineHeight,
      fontFamily,
      outputFontFamily,
      editorOptionsCustomizations,
      interactiveWindowCollapseCodeCells,
      outputLineHeight,
      outputScrolling,
      outputWordWrap,
      outputLinkifyFilePaths,
      minimalError,
      markupFontFamily
    });
  }
  _computeInsertToolbarPositionOption(isReadOnly) {
    return isReadOnly ? "hidden" : this.configurationService.getValue(NotebookSetting.insertToolbarLocation) ?? "both";
  }
  _computeInsertToolbarAlignmentOption() {
    return this.configurationService.getValue(NotebookSetting.experimentalInsertToolbarAlignment) ?? "center";
  }
  _computeShowFoldingControlsOption() {
    return this.configurationService.getValue(NotebookSetting.showFoldingControls) ?? "mouseover";
  }
  _computeFocusIndicatorOption() {
    return this.configurationService.getValue(NotebookSetting.focusIndicator) ?? "gutter";
  }
  _computeStickyScrollModeOption() {
    return this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? "flat";
  }
  getCellCollapseDefault() {
    return this._layoutConfiguration.interactiveWindowCollapseCodeCells === "never" ? {
      codeCell: {
        inputCollapsed: false
      }
    } : {
      codeCell: {
        inputCollapsed: true
      }
    };
  }
  getLayoutConfiguration() {
    return this._layoutConfiguration;
  }
  getDisplayOptions() {
    return this._layoutConfiguration;
  }
  getCellEditorContainerLeftMargin() {
    const {
      codeCellLeftMargin,
      cellRunGutter
    } = this._layoutConfiguration;
    return codeCellLeftMargin + cellRunGutter;
  }
  computeCollapsedMarkdownCellHeight(viewType) {
    const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
    return this._layoutConfiguration.markdownCellTopMargin + this._layoutConfiguration.collapsedIndicatorHeight + bottomToolbarGap + this._layoutConfiguration.markdownCellBottomMargin;
  }
  computeBottomToolbarOffset(totalHeight, viewType) {
    const { bottomToolbarGap, bottomToolbarHeight } = this.computeBottomToolbarDimensions(viewType);
    return totalHeight - bottomToolbarGap - bottomToolbarHeight / 2;
  }
  computeCodeCellEditorWidth(outerWidth) {
    return outerWidth - (this._layoutConfiguration.codeCellLeftMargin + this._layoutConfiguration.cellRunGutter + this._layoutConfiguration.cellRightMargin);
  }
  computeMarkdownCellEditorWidth(outerWidth) {
    return outerWidth - this._layoutConfiguration.markdownCellGutter - this._layoutConfiguration.markdownCellLeftMargin - this._layoutConfiguration.cellRightMargin;
  }
  computeStatusBarHeight() {
    return this._layoutConfiguration.cellStatusBarHeight;
  }
  _computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment, cellToolbar) {
    if (insertToolbarAlignment === "left" || cellToolbar !== "hidden") {
      return {
        bottomToolbarGap: 18,
        bottomToolbarHeight: 18
      };
    }
    if (insertToolbarPosition === "betweenCells" || insertToolbarPosition === "both") {
      return compactView ? {
        bottomToolbarGap: 12,
        bottomToolbarHeight: 20
      } : {
        bottomToolbarGap: 20,
        bottomToolbarHeight: 20
      };
    } else {
      return {
        bottomToolbarGap: 0,
        bottomToolbarHeight: 0
      };
    }
  }
  computeBottomToolbarDimensions(viewType) {
    const configuration = this._layoutConfiguration;
    const cellToolbarPosition = this.computeCellToolbarLocation(viewType);
    const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition, configuration.insertToolbarAlignment, cellToolbarPosition);
    return {
      bottomToolbarGap,
      bottomToolbarHeight
    };
  }
  computeCellToolbarLocation(viewType) {
    const cellToolbarLocation = this._layoutConfiguration.cellToolbarLocation;
    if (typeof cellToolbarLocation === "string") {
      if (cellToolbarLocation === "left" || cellToolbarLocation === "right" || cellToolbarLocation === "hidden") {
        return cellToolbarLocation;
      }
    } else {
      if (viewType) {
        const notebookSpecificSetting = cellToolbarLocation[viewType] ?? cellToolbarLocation["default"];
        let cellToolbarLocationForCurrentView = "right";
        switch (notebookSpecificSetting) {
          case "left":
            cellToolbarLocationForCurrentView = "left";
            break;
          case "right":
            cellToolbarLocationForCurrentView = "right";
            break;
          case "hidden":
            cellToolbarLocationForCurrentView = "hidden";
            break;
          default:
            cellToolbarLocationForCurrentView = "right";
            break;
        }
        return cellToolbarLocationForCurrentView;
      }
    }
    return "right";
  }
  computeTopInsertToolbarHeight(viewType) {
    if (this._layoutConfiguration.insertToolbarPosition === "betweenCells" || this._layoutConfiguration.insertToolbarPosition === "both") {
      return SCROLLABLE_ELEMENT_PADDING_TOP;
    }
    const cellToolbarLocation = this.computeCellToolbarLocation(viewType);
    if (cellToolbarLocation === "left" || cellToolbarLocation === "right") {
      return SCROLLABLE_ELEMENT_PADDING_TOP;
    }
    return 0;
  }
  computeEditorPadding(internalMetadata, cellUri) {
    return {
      top: this._editorTopPadding,
      bottom: this.statusBarIsVisible(internalMetadata, cellUri) ? this._layoutConfiguration.editorBottomPadding : this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
    };
  }
  computeEditorStatusbarHeight(internalMetadata, cellUri) {
    return this.statusBarIsVisible(internalMetadata, cellUri) ? this.computeStatusBarHeight() : 0;
  }
  statusBarIsVisible(internalMetadata, cellUri) {
    const exe = this.notebookExecutionStateService.getCellExecution(cellUri);
    if (this._layoutConfiguration.showCellStatusBar === "visible") {
      return true;
    } else if (this._layoutConfiguration.showCellStatusBar === "visibleAfterExecute") {
      return typeof internalMetadata.lastRunSuccess === "boolean" || exe !== void 0;
    } else {
      return false;
    }
  }
  computeWebviewOptions() {
    return {
      outputNodePadding: this._layoutConfiguration.cellOutputPadding,
      outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding,
      previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
      markdownLeftMargin: this._layoutConfiguration.markdownCellGutter + this._layoutConfiguration.markdownCellLeftMargin,
      leftMargin: this._layoutConfiguration.codeCellLeftMargin,
      rightMargin: this._layoutConfiguration.cellRightMargin,
      runGutter: this._layoutConfiguration.cellRunGutter,
      dragAndDropEnabled: this._layoutConfiguration.dragAndDropEnabled,
      fontSize: this._layoutConfiguration.fontSize,
      outputFontSize: this._layoutConfiguration.outputFontSize,
      outputFontFamily: this._layoutConfiguration.outputFontFamily,
      markupFontSize: this._layoutConfiguration.markupFontSize,
      markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
      outputLineHeight: this._layoutConfiguration.outputLineHeight,
      outputScrolling: this._layoutConfiguration.outputScrolling,
      outputWordWrap: this._layoutConfiguration.outputWordWrap,
      outputLineLimit: this._layoutConfiguration.outputLineLimit,
      outputLinkifyFilePaths: this._layoutConfiguration.outputLinkifyFilePaths,
      minimalError: this._layoutConfiguration.outputMinimalError,
      markupFontFamily: this._layoutConfiguration.markupFontFamily
    };
  }
  computeDiffWebviewOptions() {
    return {
      outputNodePadding: this._layoutConfiguration.cellOutputPadding,
      outputNodeLeftPadding: 0,
      previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
      markdownLeftMargin: 0,
      leftMargin: 32,
      rightMargin: 0,
      runGutter: 0,
      dragAndDropEnabled: false,
      fontSize: this._layoutConfiguration.fontSize,
      outputFontSize: this._layoutConfiguration.outputFontSize,
      outputFontFamily: this._layoutConfiguration.outputFontFamily,
      markupFontSize: this._layoutConfiguration.markupFontSize,
      markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
      outputLineHeight: this._layoutConfiguration.outputLineHeight,
      outputScrolling: this._layoutConfiguration.outputScrolling,
      outputWordWrap: this._layoutConfiguration.outputWordWrap,
      outputLineLimit: this._layoutConfiguration.outputLineLimit,
      outputLinkifyFilePaths: false,
      minimalError: false,
      markupFontFamily: this._layoutConfiguration.markupFontFamily
    };
  }
  computeIndicatorPosition(totalHeight, foldHintHeight, viewType) {
    const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
    return {
      bottomIndicatorTop: totalHeight - bottomToolbarGap - this._layoutConfiguration.cellBottomMargin - foldHintHeight,
      verticalIndicatorHeight: totalHeight - bottomToolbarGap - foldHintHeight
    };
  }
};
NotebookOptions = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, INotebookExecutionStateService),
  __decorateParam(5, ICodeEditorService)
], NotebookOptions);
export {
  NotebookOptions,
  OutputInnerContainerTopPadding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tPcHRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUGl4ZWxSYXRpbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9waXhlbFJhdGlvLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRm9udE1lYXN1cmVtZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9mb250TWVhc3VyZW1lbnRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mb0Zyb21TZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IEludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMsIE5vdGVib29rQ2VsbERlZmF1bHRDb2xsYXBzZUNvbmZpZywgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgTm90ZWJvb2tTZXR0aW5nLCBTaG93Q2VsbFN0YXR1c0JhclR5cGUgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcblxuY29uc3QgU0NST0xMQUJMRV9FTEVNRU5UX1BBRERJTkdfVE9QID0gMTg7XG5cbmV4cG9ydCBjb25zdCBPdXRwdXRJbm5lckNvbnRhaW5lclRvcFBhZGRpbmcgPSA0O1xuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRGlzcGxheU9wdGlvbnMgeyAvLyBUT0RPIEBZb3lva3JhenkgcmVuYW1lIHRvIGEgbW9yZSBnZW5lcmljIG5hbWUsIG5vdCBkaXNwbGF5XG5cdHNob3dDZWxsU3RhdHVzQmFyOiBTaG93Q2VsbFN0YXR1c0JhclR5cGU7XG5cdGNlbGxUb29sYmFyTG9jYXRpb246IHN0cmluZyB8IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cdGNlbGxUb29sYmFySW50ZXJhY3Rpb246IHN0cmluZztcblx0Y29tcGFjdFZpZXc6IGJvb2xlYW47XG5cdGZvY3VzSW5kaWNhdG9yOiAnYm9yZGVyJyB8ICdndXR0ZXInO1xuXHRpbnNlcnRUb29sYmFyUG9zaXRpb246ICdiZXR3ZWVuQ2VsbHMnIHwgJ25vdGVib29rVG9vbGJhcicgfCAnYm90aCcgfCAnaGlkZGVuJztcblx0aW5zZXJ0VG9vbGJhckFsaWdubWVudDogJ2xlZnQnIHwgJ2NlbnRlcic7XG5cdGdsb2JhbFRvb2xiYXI6IGJvb2xlYW47XG5cdHN0aWNreVNjcm9sbEVuYWJsZWQ6IGJvb2xlYW47XG5cdHN0aWNreVNjcm9sbE1vZGU6ICdmbGF0JyB8ICdpbmRlbnRlZCc7XG5cdGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbjogYm9vbGVhbjtcblx0Y29uc29saWRhdGVkUnVuQnV0dG9uOiBib29sZWFuO1xuXHRzaG93Rm9sZGluZ0NvbnRyb2xzOiAnYWx3YXlzJyB8ICduZXZlcicgfCAnbW91c2VvdmVyJztcblx0ZHJhZ0FuZERyb3BFbmFibGVkOiBib29sZWFuO1xuXHRpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzOiBJbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzO1xuXHRvdXRwdXRTY3JvbGxpbmc6IGJvb2xlYW47XG5cdG91dHB1dFdvcmRXcmFwOiBib29sZWFuO1xuXHRvdXRwdXRMaW5lTGltaXQ6IG51bWJlcjtcblx0b3V0cHV0TGlua2lmeUZpbGVQYXRoczogYm9vbGVhbjtcblx0b3V0cHV0TWluaW1hbEVycm9yOiBib29sZWFuO1xuXHRmb250U2l6ZTogbnVtYmVyO1xuXHRvdXRwdXRGb250U2l6ZTogbnVtYmVyO1xuXHRvdXRwdXRGb250RmFtaWx5OiBzdHJpbmc7XG5cdG91dHB1dExpbmVIZWlnaHQ6IG51bWJlcjtcblx0bWFya3VwRm9udFNpemU6IG51bWJlcjtcblx0bWFya2Rvd25MaW5lSGVpZ2h0OiBudW1iZXI7XG5cdGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9uczogUGFydGlhbDx7XG5cdFx0J2VkaXRvci5pbmRlbnRTaXplJzogJ3RhYlNpemUnIHwgbnVtYmVyO1xuXHRcdCdlZGl0b3IudGFiU2l6ZSc6IG51bWJlcjtcblx0XHQnZWRpdG9yLmluc2VydFNwYWNlcyc6IGJvb2xlYW47XG5cdH0+IHwgdW5kZWZpbmVkO1xuXHRtYXJrdXBGb250RmFtaWx5OiBzdHJpbmc7XG5cdGRpc2FibGVSdWxlcnM6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uIHtcblx0Y2VsbFJpZ2h0TWFyZ2luOiBudW1iZXI7XG5cdGNlbGxSdW5HdXR0ZXI6IG51bWJlcjtcblx0Y2VsbFRvcE1hcmdpbjogbnVtYmVyO1xuXHRjZWxsQm90dG9tTWFyZ2luOiBudW1iZXI7XG5cdGNlbGxPdXRwdXRQYWRkaW5nOiBudW1iZXI7XG5cdGNvZGVDZWxsTGVmdE1hcmdpbjogbnVtYmVyO1xuXHRtYXJrZG93bkNlbGxMZWZ0TWFyZ2luOiBudW1iZXI7XG5cdG1hcmtkb3duQ2VsbEd1dHRlcjogbnVtYmVyO1xuXHRtYXJrZG93bkNlbGxUb3BNYXJnaW46IG51bWJlcjtcblx0bWFya2Rvd25DZWxsQm90dG9tTWFyZ2luOiBudW1iZXI7XG5cdG1hcmtkb3duUHJldmlld1BhZGRpbmc6IG51bWJlcjtcblx0bWFya2Rvd25Gb2xkSGludEhlaWdodDogbnVtYmVyO1xuXHRlZGl0b3JUb29sYmFySGVpZ2h0OiBudW1iZXI7XG5cdGVkaXRvclRvcFBhZGRpbmc6IG51bWJlcjtcblx0ZWRpdG9yQm90dG9tUGFkZGluZzogbnVtYmVyO1xuXHRlZGl0b3JCb3R0b21QYWRkaW5nV2l0aG91dFN0YXR1c0JhcjogbnVtYmVyO1xuXHRjb2xsYXBzZWRJbmRpY2F0b3JIZWlnaHQ6IG51bWJlcjtcblx0Y2VsbFN0YXR1c0JhckhlaWdodDogbnVtYmVyO1xuXHRmb2N1c0luZGljYXRvckxlZnRNYXJnaW46IG51bWJlcjtcblx0Zm9jdXNJbmRpY2F0b3JHYXA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va09wdGlvbnNDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGNlbGxTdGF0dXNCYXJWaXNpYmlsaXR5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2VsbFRvb2xiYXJMb2NhdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNlbGxUb29sYmFySW50ZXJhY3Rpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBlZGl0b3JUb3BQYWRkaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tcGFjdFZpZXc/OiBib29sZWFuO1xuXHRyZWFkb25seSBmb2N1c0luZGljYXRvcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluc2VydFRvb2xiYXJQb3NpdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluc2VydFRvb2xiYXJBbGlnbm1lbnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBnbG9iYWxUb29sYmFyPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0aWNreVNjcm9sbE1vZGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaG93Rm9sZGluZ0NvbnRyb2xzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29uc29saWRhdGVkT3V0cHV0QnV0dG9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29uc29saWRhdGVkUnVuQnV0dG9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZHJhZ0FuZERyb3BFbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9udFNpemU/OiBib29sZWFuO1xuXHRyZWFkb25seSBvdXRwdXRGb250U2l6ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1hcmt1cEZvbnRTaXplPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFya2Rvd25MaW5lSGVpZ2h0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9udEZhbWlseT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG91dHB1dEZvbnRGYW1pbHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnM/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0TGluZUhlaWdodD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG91dHB1dFdvcmRXcmFwPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0U2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0TGlua2lmeUZpbGVQYXRocz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYWxFcnJvcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlYWRvbmx5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFya3VwRm9udEZhbWlseT86IGJvb2xlYW47XG59XG5cbmNvbnN0IGRlZmF1bHRDb25maWdDb25zdGFudHMgPSBPYmplY3QuZnJlZXplKHtcblx0Y29kZUNlbGxMZWZ0TWFyZ2luOiAyOCxcblx0Y2VsbFJ1bkd1dHRlcjogMzIsXG5cdG1hcmtkb3duQ2VsbFRvcE1hcmdpbjogOCxcblx0bWFya2Rvd25DZWxsQm90dG9tTWFyZ2luOiA4LFxuXHRtYXJrZG93bkNlbGxMZWZ0TWFyZ2luOiAwLFxuXHRtYXJrZG93bkNlbGxHdXR0ZXI6IDMyLFxuXHRmb2N1c0luZGljYXRvckxlZnRNYXJnaW46IDRcbn0pO1xuXG5jb25zdCBjb21wYWN0Q29uZmlnQ29uc3RhbnRzID0gT2JqZWN0LmZyZWV6ZSh7XG5cdGNvZGVDZWxsTGVmdE1hcmdpbjogOCxcblx0Y2VsbFJ1bkd1dHRlcjogMzYsXG5cdG1hcmtkb3duQ2VsbFRvcE1hcmdpbjogNixcblx0bWFya2Rvd25DZWxsQm90dG9tTWFyZ2luOiA2LFxuXHRtYXJrZG93bkNlbGxMZWZ0TWFyZ2luOiA4LFxuXHRtYXJrZG93bkNlbGxHdXR0ZXI6IDM2LFxuXHRmb2N1c0luZGljYXRvckxlZnRNYXJnaW46IDRcbn0pO1xuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tPcHRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2xheW91dENvbmZpZ3VyYXRpb246IE5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbiAmIE5vdGVib29rRGlzcGxheU9wdGlvbnM7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Tm90ZWJvb2tPcHRpb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9wdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuZXZlbnQ7XG5cdHByaXZhdGUgX2VkaXRvclRvcFBhZGRpbmc6IG51bWJlciA9IDEyO1xuXG5cdHJlYWRvbmx5IHByZXZpb3VzTW9kZWxUb0NvbXBhcmUgPSBvYnNlcnZhYmxlVmFsdWU8Tm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQ+KCdwcmV2aW91c01vZGVsVG9Db21wYXJlJywgdW5kZWZpbmVkKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3csXG5cdFx0cHJpdmF0ZSBpc1JlYWRvbmx5OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3ZlcnJpZGVzOiB7IGNlbGxUb29sYmFySW50ZXJhY3Rpb246IHN0cmluZzsgZ2xvYmFsVG9vbGJhcjogYm9vbGVhbjsgc3RpY2t5U2Nyb2xsRW5hYmxlZDogYm9vbGVhbjsgZHJhZ0FuZERyb3BFbmFibGVkOiBib29sZWFuOyBkaXNhYmxlUnVsZXJzOiBib29sZWFuIH0gfCB1bmRlZmluZWQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2hvd0NlbGxTdGF0dXNCYXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFNob3dDZWxsU3RhdHVzQmFyVHlwZT4oTm90ZWJvb2tTZXR0aW5nLnNob3dDZWxsU3RhdHVzQmFyKTtcblx0XHRjb25zdCBnbG9iYWxUb29sYmFyID0gb3ZlcnJpZGVzPy5nbG9iYWxUb29sYmFyID8/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXIpID8/IHRydWU7XG5cdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsRW5hYmxlZCA9IG92ZXJyaWRlcz8uc3RpY2t5U2Nyb2xsRW5hYmxlZCA/PyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KE5vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxFbmFibGVkKSA/PyBmYWxzZTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxNb2RlID0gdGhpcy5fY29tcHV0ZVN0aWNreVNjcm9sbE1vZGVPcHRpb24oKTtcblx0XHRjb25zdCBjb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KE5vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24pID8/IHRydWU7XG5cdFx0Y29uc3QgY29uc29saWRhdGVkUnVuQnV0dG9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9uKSA/PyBmYWxzZTtcblx0XHRjb25zdCBkcmFnQW5kRHJvcEVuYWJsZWQgPSBvdmVycmlkZXM/LmRyYWdBbmREcm9wRW5hYmxlZCA/PyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KE5vdGVib29rU2V0dGluZy5kcmFnQW5kRHJvcEVuYWJsZWQpID8/IHRydWU7XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJMb2NhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyTG9jYXRpb24pID8/IHsgJ2RlZmF1bHQnOiAncmlnaHQnIH07XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbiA9IG92ZXJyaWRlcz8uY2VsbFRvb2xiYXJJbnRlcmFjdGlvbiA/PyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyVmlzaWJpbGl0eSk7XG5cdFx0Y29uc3QgY29tcGFjdFZpZXcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KE5vdGVib29rU2V0dGluZy5jb21wYWN0VmlldykgPz8gdHJ1ZTtcblx0XHRjb25zdCBmb2N1c0luZGljYXRvciA9IHRoaXMuX2NvbXB1dGVGb2N1c0luZGljYXRvck9wdGlvbigpO1xuXHRcdGNvbnN0IGluc2VydFRvb2xiYXJQb3NpdGlvbiA9IHRoaXMuX2NvbXB1dGVJbnNlcnRUb29sYmFyUG9zaXRpb25PcHRpb24odGhpcy5pc1JlYWRvbmx5KTtcblx0XHRjb25zdCBpbnNlcnRUb29sYmFyQWxpZ25tZW50ID0gdGhpcy5fY29tcHV0ZUluc2VydFRvb2xiYXJBbGlnbm1lbnRPcHRpb24oKTtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0NvbnRyb2xzID0gdGhpcy5fY29tcHV0ZVNob3dGb2xkaW5nQ29udHJvbHNPcHRpb24oKTtcblx0XHQvLyBjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAsIGJvdHRvbVRvb2xiYXJIZWlnaHQgfSA9IHRoaXMuX2NvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyhjb21wYWN0VmlldywgaW5zZXJ0VG9vbGJhclBvc2l0aW9uLCBpbnNlcnRUb29sYmFyQWxpZ25tZW50KTtcblx0XHRjb25zdCBmb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0Y29uc3QgbWFya3VwRm9udFNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm1hcmt1cEZvbnRTaXplKTtcblx0XHRjb25zdCBtYXJrZG93bkxpbmVIZWlnaHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm1hcmtkb3duTGluZUhlaWdodCk7XG5cdFx0bGV0IGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UGFydGlhbDx7XG5cdFx0XHQnZWRpdG9yLmluZGVudFNpemUnOiAndGFiU2l6ZScgfCBudW1iZXI7XG5cdFx0XHQnZWRpdG9yLnRhYlNpemUnOiBudW1iZXI7XG5cdFx0XHQnZWRpdG9yLmluc2VydFNwYWNlcyc6IGJvb2xlYW47XG5cdFx0fT4+KE5vdGVib29rU2V0dGluZy5jZWxsRWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zKSA/PyB7fTtcblx0XHRlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMgPSBpc09iamVjdChlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMpID8gZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zIDoge307XG5cdFx0Y29uc3QgaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxsczogSW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0TGluZUhlaWdodFNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcub3V0cHV0TGluZUhlaWdodCk7XG5cdFx0Y29uc3Qgb3V0cHV0Rm9udFNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRTaXplKSB8fCBmb250U2l6ZTtcblx0XHRjb25zdCBvdXRwdXRGb250RmFtaWx5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KE5vdGVib29rU2V0dGluZy5vdXRwdXRGb250RmFtaWx5KTtcblx0XHRjb25zdCBvdXRwdXRTY3JvbGxpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRwdXRTY3JvbGxpbmcpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0TGluZUhlaWdodCA9IHRoaXMuX2NvbXB1dGVPdXRwdXRMaW5lSGVpZ2h0KG91dHB1dExpbmVIZWlnaHRTZXR0aW5nVmFsdWUsIG91dHB1dEZvbnRTaXplKTtcblx0XHRjb25zdCBvdXRwdXRXb3JkV3JhcCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFdvcmRXcmFwKTtcblx0XHRjb25zdCBvdXRwdXRMaW5lTGltaXQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLnRleHRPdXRwdXRMaW5lTGltaXQpID8/IDMwO1xuXHRcdGNvbnN0IGxpbmtpZnlGaWxlUGF0aHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5MaW5raWZ5T3V0cHV0RmlsZVBhdGhzKSA/PyB0cnVlO1xuXHRcdGNvbnN0IG1pbmltYWxFcnJvcnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5taW5pbWFsRXJyb3JSZW5kZXJpbmcpO1xuXHRcdGNvbnN0IG1hcmt1cEZvbnRGYW1pbHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTm90ZWJvb2tTZXR0aW5nLm1hcmt1cEZvbnRGYW1pbHkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yVG9wUGFkZGluZyA9IHRoaXMuX2NvbXB1dGVFZGl0b3JUb3BQYWRkaW5nKCk7XG5cblx0XHR0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0Li4uKGNvbXBhY3RWaWV3ID8gY29tcGFjdENvbmZpZ0NvbnN0YW50cyA6IGRlZmF1bHRDb25maWdDb25zdGFudHMpLFxuXHRcdFx0Y2VsbFRvcE1hcmdpbjogNixcblx0XHRcdGNlbGxCb3R0b21NYXJnaW46IDYsXG5cdFx0XHRjZWxsUmlnaHRNYXJnaW46IDE2LFxuXHRcdFx0Y2VsbFN0YXR1c0JhckhlaWdodDogMjIsXG5cdFx0XHRjZWxsT3V0cHV0UGFkZGluZzogOCxcblx0XHRcdG1hcmtkb3duUHJldmlld1BhZGRpbmc6IDgsXG5cdFx0XHQvLyBib3R0b21Ub29sYmFySGVpZ2h0OiBib3R0b21Ub29sYmFySGVpZ2h0LFxuXHRcdFx0Ly8gYm90dG9tVG9vbGJhckdhcDogYm90dG9tVG9vbGJhckdhcCxcblx0XHRcdGVkaXRvclRvb2xiYXJIZWlnaHQ6IDAsXG5cdFx0XHRlZGl0b3JUb3BQYWRkaW5nOiBlZGl0b3JUb3BQYWRkaW5nLFxuXHRcdFx0ZWRpdG9yQm90dG9tUGFkZGluZzogNCxcblx0XHRcdGVkaXRvckJvdHRvbVBhZGRpbmdXaXRob3V0U3RhdHVzQmFyOiAxMixcblx0XHRcdGNvbGxhcHNlZEluZGljYXRvckhlaWdodDogMjgsXG5cdFx0XHRzaG93Q2VsbFN0YXR1c0Jhcixcblx0XHRcdGdsb2JhbFRvb2xiYXIsXG5cdFx0XHRzdGlja3lTY3JvbGxFbmFibGVkLFxuXHRcdFx0c3RpY2t5U2Nyb2xsTW9kZSxcblx0XHRcdGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbixcblx0XHRcdGNvbnNvbGlkYXRlZFJ1bkJ1dHRvbixcblx0XHRcdGRyYWdBbmREcm9wRW5hYmxlZCxcblx0XHRcdGNlbGxUb29sYmFyTG9jYXRpb24sXG5cdFx0XHRjZWxsVG9vbGJhckludGVyYWN0aW9uLFxuXHRcdFx0Y29tcGFjdFZpZXcsXG5cdFx0XHRmb2N1c0luZGljYXRvcixcblx0XHRcdGluc2VydFRvb2xiYXJQb3NpdGlvbixcblx0XHRcdGluc2VydFRvb2xiYXJBbGlnbm1lbnQsXG5cdFx0XHRzaG93Rm9sZGluZ0NvbnRyb2xzLFxuXHRcdFx0Zm9udFNpemUsXG5cdFx0XHRvdXRwdXRGb250U2l6ZSxcblx0XHRcdG91dHB1dEZvbnRGYW1pbHksXG5cdFx0XHRvdXRwdXRMaW5lSGVpZ2h0LFxuXHRcdFx0bWFya3VwRm9udFNpemUsXG5cdFx0XHRtYXJrZG93bkxpbmVIZWlnaHQsXG5cdFx0XHRlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMsXG5cdFx0XHRmb2N1c0luZGljYXRvckdhcDogMyxcblx0XHRcdGludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMsXG5cdFx0XHRtYXJrZG93bkZvbGRIaW50SGVpZ2h0OiAyMixcblx0XHRcdG91dHB1dFNjcm9sbGluZzogb3V0cHV0U2Nyb2xsaW5nLFxuXHRcdFx0b3V0cHV0V29yZFdyYXA6IG91dHB1dFdvcmRXcmFwLFxuXHRcdFx0b3V0cHV0TGluZUxpbWl0OiBvdXRwdXRMaW5lTGltaXQsXG5cdFx0XHRvdXRwdXRMaW5raWZ5RmlsZVBhdGhzOiBsaW5raWZ5RmlsZVBhdGhzLFxuXHRcdFx0b3V0cHV0TWluaW1hbEVycm9yOiBtaW5pbWFsRXJyb3JzLFxuXHRcdFx0bWFya3VwRm9udEZhbWlseSxcblx0XHRcdGRpc2FibGVSdWxlcnM6IG92ZXJyaWRlcz8uZGlzYWJsZVJ1bGVycyxcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVDb25maWd1cmF0aW9uKGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMoaXNSZWFkb25seTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkgIT09IGlzUmVhZG9ubHkpIHtcblx0XHRcdHRoaXMuaXNSZWFkb25seSA9IGlzUmVhZG9ubHk7XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbiA9PT0gTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbjtcblx0XHRcdFx0fSxcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbl0pLFxuXHRcdFx0XHRjaGFuZ2U6IHsga2V5czogW05vdGVib29rU2V0dGluZy5pbnNlcnRUb29sYmFyTG9jYXRpb25dLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlRWRpdG9yVG9wUGFkZGluZygpOiBudW1iZXIge1xuXHRcdGxldCBkZWNvcmF0aW9uVHJpZ2dlcmVkQWRqdXN0bWVudCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgdXBkYXRlRWRpdG9yVG9wUGFkZGluZyA9ICh0b3A6IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yVG9wUGFkZGluZyA9IHRvcDtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uKTtcblx0XHRcdGNvbmZpZ3VyYXRpb24uZWRpdG9yVG9wUGFkZGluZyA9IHRoaXMuX2VkaXRvclRvcFBhZGRpbmc7XG5cdFx0XHR0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvbjtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9ucy5maXJlKHsgZWRpdG9yVG9wUGFkZGluZzogdHJ1ZSB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbkNoZWNrU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgb25EaWRBZGREZWNvcmF0aW9uVHlwZSA9IChlOiBzdHJpbmcpID0+IHtcblx0XHRcdGlmIChkZWNvcmF0aW9uVHJpZ2dlcmVkQWRqdXN0bWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkZWNvcmF0aW9uQ2hlY2tTZXQuaGFzKGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVzb2x2ZURlY29yYXRpb25PcHRpb25zKGUsIHRydWUpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5hZnRlckNvbnRlbnRDbGFzc05hbWUgfHwgb3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3NzUnVsZXMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlc29sdmVEZWNvcmF0aW9uQ1NTUnVsZXMoZSk7XG5cdFx0XHRcdFx0aWYgKGNzc1J1bGVzICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNzc1J1bGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoZSBmb2xsb3dpbmcgd2F5cyB0byBpbmRleCBpbnRvIHRoZSBsaXN0IGFyZSBlcXVpdmFsZW50XG5cdFx0XHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdFx0XHQoKGNzc1J1bGVzW2ldIGFzIENTU1N0eWxlUnVsZSkuc2VsZWN0b3JUZXh0LmVuZHNXaXRoKCc6OmFmdGVyJykgfHwgKGNzc1J1bGVzW2ldIGFzIENTU1N0eWxlUnVsZSkuc2VsZWN0b3JUZXh0LmVuZHNXaXRoKCc6OmFmdGVyJykpXG5cdFx0XHRcdFx0XHRcdFx0JiYgKGNzc1J1bGVzW2ldIGFzIENTU1N0eWxlUnVsZSkuY3NzVGV4dC5pbmRleE9mKCd0b3A6JykgPiAtMVxuXHRcdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyB0aGVyZSBpcyBhIGA6OmJlZm9yZWAgb3IgYDo6YWZ0ZXJgIHRleHQgZGVjb3JhdGlvbiB3aG9zZSBwb3NpdGlvbiBpcyBhYm92ZSBvciBiZWxvdyBjdXJyZW50IGxpbmVcblx0XHRcdFx0XHRcdFx0XHQvLyB3ZSBhdCBsZWFzdCBtYWtlIHN1cmUgdGhhdCB0aGUgZWRpdG9yIHRvcCBwYWRkaW5nIGlzIGF0IGxlYXN0IG9uZSBsaW5lXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKTtcblx0XHRcdFx0XHRcdFx0XHR1cGRhdGVFZGl0b3JUb3BQYWRkaW5nKGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyhlZGl0b3JPcHRpb25zLCBQaXhlbFJhdGlvLmdldEluc3RhbmNlKHRoaXMudGFyZ2V0V2luZG93KS52YWx1ZSkubGluZUhlaWdodCArIDIpO1xuXHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25UcmlnZ2VyZWRBZGp1c3RtZW50ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRlY29yYXRpb25DaGVja1NldC5hZGQoZSk7XG5cdFx0XHR9IGNhdGNoIChfZXgpIHtcblx0XHRcdFx0Ly8gZG8gbm90IHRocm93IGFuZCBicmVhayBub3RlYm9va1xuXHRcdFx0fVxuXG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLm9uRGVjb3JhdGlvblR5cGVSZWdpc3RlcmVkKG9uRGlkQWRkRGVjb3JhdGlvblR5cGUpKTtcblx0XHR0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3REZWNvcmF0aW9uVHlwZXMoKS5mb3JFYWNoKG9uRGlkQWRkRGVjb3JhdGlvblR5cGUpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclRvcFBhZGRpbmc7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlT3V0cHV0TGluZUhlaWdodChsaW5lSGVpZ2h0OiBudW1iZXIsIG91dHB1dEZvbnRTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG1pbmltdW1MaW5lSGVpZ2h0ID0gOTtcblxuXHRcdGlmIChsaW5lSGVpZ2h0ID09PSAwKSB7XG5cdFx0XHQvLyB1c2UgZWRpdG9yIGxpbmUgaGVpZ2h0XG5cdFx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXHRcdFx0Y29uc3QgZm9udEluZm8gPSBGb250TWVhc3VyZW1lbnRzLnJlYWRGb250SW5mbyh0aGlzLnRhcmdldFdpbmRvdywgY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKGVkaXRvck9wdGlvbnMsIFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UodGhpcy50YXJnZXRXaW5kb3cpLnZhbHVlKSk7XG5cdFx0XHRsaW5lSGVpZ2h0ID0gZm9udEluZm8ubGluZUhlaWdodDtcblx0XHR9IGVsc2UgaWYgKGxpbmVIZWlnaHQgPCBtaW5pbXVtTGluZUhlaWdodCkge1xuXHRcdFx0Ly8gVmFsdWVzIHRvbyBzbWFsbCB0byBiZSBsaW5lIGhlaWdodHMgaW4gcGl4ZWxzIGFyZSBpbiBlbXMuXG5cdFx0XHRsZXQgZm9udFNpemUgPSBvdXRwdXRGb250U2l6ZTtcblx0XHRcdGlmIChmb250U2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRmb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0XHR9XG5cblx0XHRcdGxpbmVIZWlnaHQgPSBsaW5lSGVpZ2h0ICogZm9udFNpemU7XG5cdFx0fVxuXG5cdFx0Ly8gRW5mb3JjZSBpbnRlZ2VyLCBtaW5pbXVtIGNvbnN0cmFpbnRzXG5cdFx0bGluZUhlaWdodCA9IE1hdGgucm91bmQobGluZUhlaWdodCk7XG5cdFx0aWYgKGxpbmVIZWlnaHQgPCBtaW5pbXVtTGluZUhlaWdodCkge1xuXHRcdFx0bGluZUhlaWdodCA9IG1pbmltdW1MaW5lSGVpZ2h0O1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lSGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29uZmlndXJhdGlvbihlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KSB7XG5cdFx0Y29uc3QgY2VsbFN0YXR1c0JhclZpc2liaWxpdHkgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5zaG93Q2VsbFN0YXR1c0Jhcik7XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJMb2NhdGlvbiA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyTG9jYXRpb24pO1xuXHRcdGNvbnN0IGNlbGxUb29sYmFySW50ZXJhY3Rpb24gPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5jZWxsVG9vbGJhclZpc2liaWxpdHkpO1xuXHRcdGNvbnN0IGNvbXBhY3RWaWV3ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY29tcGFjdFZpZXcpO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuZm9jdXNJbmRpY2F0b3IpO1xuXHRcdGNvbnN0IGluc2VydFRvb2xiYXJQb3NpdGlvbiA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbik7XG5cdFx0Y29uc3QgaW5zZXJ0VG9vbGJhckFsaWdubWVudCA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmV4cGVyaW1lbnRhbEluc2VydFRvb2xiYXJBbGlnbm1lbnQpO1xuXHRcdGNvbnN0IGdsb2JhbFRvb2xiYXIgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5nbG9iYWxUb29sYmFyKTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxFbmFibGVkID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsRW5hYmxlZCk7XG5cdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsTW9kZSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLnN0aWNreVNjcm9sbE1vZGUpO1xuXHRcdGNvbnN0IGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbiA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbik7XG5cdFx0Y29uc3QgY29uc29saWRhdGVkUnVuQnV0dG9uID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9uKTtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0NvbnRyb2xzID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuc2hvd0ZvbGRpbmdDb250cm9scyk7XG5cdFx0Y29uc3QgZHJhZ0FuZERyb3BFbmFibGVkID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuZHJhZ0FuZERyb3BFbmFibGVkKTtcblx0XHRjb25zdCBmb250U2l6ZSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mb250U2l6ZScpO1xuXHRcdGNvbnN0IG91dHB1dEZvbnRTaXplID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0cHV0Rm9udFNpemUpO1xuXHRcdGNvbnN0IG1hcmt1cEZvbnRTaXplID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udFNpemUpO1xuXHRcdGNvbnN0IG1hcmtkb3duTGluZUhlaWdodCA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm1hcmtkb3duTGluZUhlaWdodCk7XG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mb250RmFtaWx5Jyk7XG5cdFx0Y29uc3Qgb3V0cHV0Rm9udEZhbWlseSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmNlbGxFZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMpO1xuXHRcdGNvbnN0IGludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzKTtcblx0XHRjb25zdCBvdXRwdXRMaW5lSGVpZ2h0ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0cHV0TGluZUhlaWdodCk7XG5cdFx0Y29uc3Qgb3V0cHV0U2Nyb2xsaW5nID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0cHV0U2Nyb2xsaW5nKTtcblx0XHRjb25zdCBvdXRwdXRXb3JkV3JhcCA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFdvcmRXcmFwKTtcblx0XHRjb25zdCBvdXRwdXRMaW5raWZ5RmlsZVBhdGhzID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuTGlua2lmeU91dHB1dEZpbGVQYXRocyk7XG5cdFx0Y29uc3QgbWluaW1hbEVycm9yID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcubWluaW1hbEVycm9yUmVuZGVyaW5nKTtcblx0XHRjb25zdCBtYXJrdXBGb250RmFtaWx5ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udEZhbWlseSk7XG5cblx0XHRpZiAoXG5cdFx0XHQhY2VsbFN0YXR1c0JhclZpc2liaWxpdHlcblx0XHRcdCYmICFjZWxsVG9vbGJhckxvY2F0aW9uXG5cdFx0XHQmJiAhY2VsbFRvb2xiYXJJbnRlcmFjdGlvblxuXHRcdFx0JiYgIWNvbXBhY3RWaWV3XG5cdFx0XHQmJiAhZm9jdXNJbmRpY2F0b3Jcblx0XHRcdCYmICFpbnNlcnRUb29sYmFyUG9zaXRpb25cblx0XHRcdCYmICFpbnNlcnRUb29sYmFyQWxpZ25tZW50XG5cdFx0XHQmJiAhZ2xvYmFsVG9vbGJhclxuXHRcdFx0JiYgIXN0aWNreVNjcm9sbEVuYWJsZWRcblx0XHRcdCYmICFzdGlja3lTY3JvbGxNb2RlXG5cdFx0XHQmJiAhY29uc29saWRhdGVkT3V0cHV0QnV0dG9uXG5cdFx0XHQmJiAhY29uc29saWRhdGVkUnVuQnV0dG9uXG5cdFx0XHQmJiAhc2hvd0ZvbGRpbmdDb250cm9sc1xuXHRcdFx0JiYgIWRyYWdBbmREcm9wRW5hYmxlZFxuXHRcdFx0JiYgIWZvbnRTaXplXG5cdFx0XHQmJiAhb3V0cHV0Rm9udFNpemVcblx0XHRcdCYmICFtYXJrdXBGb250U2l6ZVxuXHRcdFx0JiYgIW1hcmtkb3duTGluZUhlaWdodFxuXHRcdFx0JiYgIWZvbnRGYW1pbHlcblx0XHRcdCYmICFvdXRwdXRGb250RmFtaWx5XG5cdFx0XHQmJiAhZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zXG5cdFx0XHQmJiAhaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxsc1xuXHRcdFx0JiYgIW91dHB1dExpbmVIZWlnaHRcblx0XHRcdCYmICFvdXRwdXRTY3JvbGxpbmdcblx0XHRcdCYmICFvdXRwdXRXb3JkV3JhcFxuXHRcdFx0JiYgIW91dHB1dExpbmtpZnlGaWxlUGF0aHNcblx0XHRcdCYmICFtaW5pbWFsRXJyb3Jcblx0XHRcdCYmICFtYXJrdXBGb250RmFtaWx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvbmZpZ3VyYXRpb24gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uKTtcblxuXHRcdGlmIChjZWxsU3RhdHVzQmFyVmlzaWJpbGl0eSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5zaG93Q2VsbFN0YXR1c0JhciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8U2hvd0NlbGxTdGF0dXNCYXJUeXBlPihOb3RlYm9va1NldHRpbmcuc2hvd0NlbGxTdGF0dXNCYXIpO1xuXHRcdH1cblxuXHRcdGlmIChjZWxsVG9vbGJhckxvY2F0aW9uKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmNlbGxUb29sYmFyTG9jYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZyB8IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+KE5vdGVib29rU2V0dGluZy5jZWxsVG9vbGJhckxvY2F0aW9uKSA/PyB7ICdkZWZhdWx0JzogJ3JpZ2h0JyB9O1xuXHRcdH1cblxuXHRcdGlmIChjZWxsVG9vbGJhckludGVyYWN0aW9uICYmICF0aGlzLm92ZXJyaWRlcz8uY2VsbFRvb2xiYXJJbnRlcmFjdGlvbikge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5jZWxsVG9vbGJhckludGVyYWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KE5vdGVib29rU2V0dGluZy5jZWxsVG9vbGJhclZpc2liaWxpdHkpO1xuXHRcdH1cblxuXHRcdGlmIChmb2N1c0luZGljYXRvcikge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5mb2N1c0luZGljYXRvciA9IHRoaXMuX2NvbXB1dGVGb2N1c0luZGljYXRvck9wdGlvbigpO1xuXHRcdH1cblxuXHRcdGlmIChjb21wYWN0Vmlldykge1xuXHRcdFx0Y29uc3QgY29tcGFjdFZpZXdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmNvbXBhY3RWaWV3KSA/PyB0cnVlO1xuXHRcdFx0Y29uZmlndXJhdGlvbiA9IE9iamVjdC5hc3NpZ24oY29uZmlndXJhdGlvbiwge1xuXHRcdFx0XHQuLi4oY29tcGFjdFZpZXdWYWx1ZSA/IGNvbXBhY3RDb25maWdDb25zdGFudHMgOiBkZWZhdWx0Q29uZmlnQ29uc3RhbnRzKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uZmlndXJhdGlvbi5jb21wYWN0VmlldyA9IGNvbXBhY3RWaWV3VmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydFRvb2xiYXJBbGlnbm1lbnQpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uaW5zZXJ0VG9vbGJhckFsaWdubWVudCA9IHRoaXMuX2NvbXB1dGVJbnNlcnRUb29sYmFyQWxpZ25tZW50T3B0aW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydFRvb2xiYXJQb3NpdGlvbikge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5pbnNlcnRUb29sYmFyUG9zaXRpb24gPSB0aGlzLl9jb21wdXRlSW5zZXJ0VG9vbGJhclBvc2l0aW9uT3B0aW9uKHRoaXMuaXNSZWFkb25seSk7XG5cdFx0fVxuXG5cdFx0aWYgKGdsb2JhbFRvb2xiYXIgJiYgdGhpcy5vdmVycmlkZXM/Lmdsb2JhbFRvb2xiYXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5nbG9iYWxUb29sYmFyID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhcikgPz8gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoc3RpY2t5U2Nyb2xsRW5hYmxlZCAmJiB0aGlzLm92ZXJyaWRlcz8uc3RpY2t5U2Nyb2xsRW5hYmxlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnN0aWNreVNjcm9sbEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxFbmFibGVkKSA/PyBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoc3RpY2t5U2Nyb2xsTW9kZSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5zdGlja3lTY3JvbGxNb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmxhdCcgfCAnaW5kZW50ZWQnPihOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsTW9kZSkgPz8gJ2ZsYXQnO1xuXHRcdH1cblxuXHRcdGlmIChjb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24pIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uY29uc29saWRhdGVkT3V0cHV0QnV0dG9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkT3V0cHV0QnV0dG9uKSA/PyB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb25zb2xpZGF0ZWRSdW5CdXR0b24pIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uY29uc29saWRhdGVkUnVuQnV0dG9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9uKSA/PyB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChzaG93Rm9sZGluZ0NvbnRyb2xzKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMgPSB0aGlzLl9jb21wdXRlU2hvd0ZvbGRpbmdDb250cm9sc09wdGlvbigpO1xuXHRcdH1cblxuXHRcdGlmIChkcmFnQW5kRHJvcEVuYWJsZWQpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uZHJhZ0FuZERyb3BFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZHJhZ0FuZERyb3BFbmFibGVkKSA/PyB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChmb250U2l6ZSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5mb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dEZvbnRTaXplIHx8IGZvbnRTaXplKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dEZvbnRTaXplID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KE5vdGVib29rU2V0dGluZy5vdXRwdXRGb250U2l6ZSkgfHwgY29uZmlndXJhdGlvbi5mb250U2l6ZTtcblx0XHR9XG5cblx0XHRpZiAobWFya3VwRm9udFNpemUpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ubWFya3VwRm9udFNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm1hcmt1cEZvbnRTaXplKTtcblx0XHR9XG5cblx0XHRpZiAobWFya2Rvd25MaW5lSGVpZ2h0KSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm1hcmtkb3duTGluZUhlaWdodCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcubWFya2Rvd25MaW5lSGVpZ2h0KTtcblx0XHR9XG5cblx0XHRpZiAob3V0cHV0Rm9udEZhbWlseSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5vdXRwdXRGb250RmFtaWx5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KE5vdGVib29rU2V0dGluZy5vdXRwdXRGb250RmFtaWx5KTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLmNlbGxFZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy5pbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzKTtcblx0XHR9XG5cblx0XHRpZiAob3V0cHV0TGluZUhlaWdodCB8fCBmb250U2l6ZSB8fCBvdXRwdXRGb250U2l6ZSkge1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcub3V0cHV0TGluZUhlaWdodCk7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dExpbmVIZWlnaHQgPSB0aGlzLl9jb21wdXRlT3V0cHV0TGluZUhlaWdodChsaW5lSGVpZ2h0LCBjb25maWd1cmF0aW9uLm91dHB1dEZvbnRTaXplKTtcblx0XHR9XG5cblx0XHRpZiAob3V0cHV0V29yZFdyYXApIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ub3V0cHV0V29yZFdyYXAgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRwdXRXb3JkV3JhcCk7XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dFNjcm9sbGluZykge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5vdXRwdXRTY3JvbGxpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRwdXRTY3JvbGxpbmcpO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRMaW5raWZ5RmlsZVBhdGhzKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dExpbmtpZnlGaWxlUGF0aHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5MaW5raWZ5T3V0cHV0RmlsZVBhdGhzKTtcblx0XHR9XG5cblx0XHRpZiAobWluaW1hbEVycm9yKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dE1pbmltYWxFcnJvciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm1pbmltYWxFcnJvclJlbmRlcmluZyk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmt1cEZvbnRGYW1pbHkpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ubWFya3VwRm9udEZhbWlseSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udEZhbWlseSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbiA9IE9iamVjdC5mcmVlemUoY29uZmlndXJhdGlvbik7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmZpcmUoe1xuXHRcdFx0Y2VsbFN0YXR1c0JhclZpc2liaWxpdHksXG5cdFx0XHRjZWxsVG9vbGJhckxvY2F0aW9uLFxuXHRcdFx0Y2VsbFRvb2xiYXJJbnRlcmFjdGlvbixcblx0XHRcdGNvbXBhY3RWaWV3LFxuXHRcdFx0Zm9jdXNJbmRpY2F0b3IsXG5cdFx0XHRpbnNlcnRUb29sYmFyUG9zaXRpb24sXG5cdFx0XHRpbnNlcnRUb29sYmFyQWxpZ25tZW50LFxuXHRcdFx0Z2xvYmFsVG9vbGJhcixcblx0XHRcdHN0aWNreVNjcm9sbEVuYWJsZWQsXG5cdFx0XHRzdGlja3lTY3JvbGxNb2RlLFxuXHRcdFx0c2hvd0ZvbGRpbmdDb250cm9scyxcblx0XHRcdGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbixcblx0XHRcdGNvbnNvbGlkYXRlZFJ1bkJ1dHRvbixcblx0XHRcdGRyYWdBbmREcm9wRW5hYmxlZCxcblx0XHRcdGZvbnRTaXplLFxuXHRcdFx0b3V0cHV0Rm9udFNpemUsXG5cdFx0XHRtYXJrdXBGb250U2l6ZSxcblx0XHRcdG1hcmtkb3duTGluZUhlaWdodCxcblx0XHRcdGZvbnRGYW1pbHksXG5cdFx0XHRvdXRwdXRGb250RmFtaWx5LFxuXHRcdFx0ZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zLFxuXHRcdFx0aW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyxcblx0XHRcdG91dHB1dExpbmVIZWlnaHQsXG5cdFx0XHRvdXRwdXRTY3JvbGxpbmcsXG5cdFx0XHRvdXRwdXRXb3JkV3JhcCxcblx0XHRcdG91dHB1dExpbmtpZnlGaWxlUGF0aHMsXG5cdFx0XHRtaW5pbWFsRXJyb3IsXG5cdFx0XHRtYXJrdXBGb250RmFtaWx5XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlSW5zZXJ0VG9vbGJhclBvc2l0aW9uT3B0aW9uKGlzUmVhZE9ubHk6IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4gaXNSZWFkT25seSA/ICdoaWRkZW4nIDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYmV0d2VlbkNlbGxzJyB8ICdub3RlYm9va1Rvb2xiYXInIHwgJ2JvdGgnIHwgJ2hpZGRlbic+KE5vdGVib29rU2V0dGluZy5pbnNlcnRUb29sYmFyTG9jYXRpb24pID8/ICdib3RoJztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVJbnNlcnRUb29sYmFyQWxpZ25tZW50T3B0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdsZWZ0JyB8ICdjZW50ZXInPihOb3RlYm9va1NldHRpbmcuZXhwZXJpbWVudGFsSW5zZXJ0VG9vbGJhckFsaWdubWVudCkgPz8gJ2NlbnRlcic7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlU2hvd0ZvbGRpbmdDb250cm9sc09wdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYWx3YXlzJyB8ICduZXZlcicgfCAnbW91c2VvdmVyJz4oTm90ZWJvb2tTZXR0aW5nLnNob3dGb2xkaW5nQ29udHJvbHMpID8/ICdtb3VzZW92ZXInO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUZvY3VzSW5kaWNhdG9yT3B0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdib3JkZXInIHwgJ2d1dHRlcic+KE5vdGVib29rU2V0dGluZy5mb2N1c0luZGljYXRvcikgPz8gJ2d1dHRlcic7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlU3RpY2t5U2Nyb2xsTW9kZU9wdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmxhdCcgfCAnaW5kZW50ZWQnPihOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsTW9kZSkgPz8gJ2ZsYXQnO1xuXHR9XG5cblx0Z2V0Q2VsbENvbGxhcHNlRGVmYXVsdCgpOiBOb3RlYm9va0NlbGxEZWZhdWx0Q29sbGFwc2VDb25maWcge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMgPT09ICduZXZlcicgP1xuXHRcdFx0e1xuXHRcdFx0XHRjb2RlQ2VsbDoge1xuXHRcdFx0XHRcdGlucHV0Q29sbGFwc2VkOiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9IDoge1xuXHRcdFx0XHRjb2RlQ2VsbDoge1xuXHRcdFx0XHRcdGlucHV0Q29sbGFwc2VkOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdH1cblxuXHRnZXRMYXlvdXRDb25maWd1cmF0aW9uKCk6IE5vdGVib29rTGF5b3V0Q29uZmlndXJhdGlvbiAmIE5vdGVib29rRGlzcGxheU9wdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0RGlzcGxheU9wdGlvbnMoKTogTm90ZWJvb2tEaXNwbGF5T3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXRDZWxsRWRpdG9yQ29udGFpbmVyTGVmdE1hcmdpbigpIHtcblx0XHRjb25zdCB7XG5cdFx0XHRjb2RlQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRjZWxsUnVuR3V0dGVyXG5cdFx0fSA9IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb247XG5cdFx0cmV0dXJuIGNvZGVDZWxsTGVmdE1hcmdpbiArIGNlbGxSdW5HdXR0ZXI7XG5cdH1cblxuXHRjb21wdXRlQ29sbGFwc2VkTWFya2Rvd25DZWxsSGVpZ2h0KHZpZXdUeXBlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCB9ID0gdGhpcy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModmlld1R5cGUpO1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmtkb3duQ2VsbFRvcE1hcmdpblxuXHRcdFx0KyB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNvbGxhcHNlZEluZGljYXRvckhlaWdodFxuXHRcdFx0KyBib3R0b21Ub29sYmFyR2FwXG5cdFx0XHQrIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25DZWxsQm90dG9tTWFyZ2luO1xuXHR9XG5cblx0Y29tcHV0ZUJvdHRvbVRvb2xiYXJPZmZzZXQodG90YWxIZWlnaHQ6IG51bWJlciwgdmlld1R5cGU6IHN0cmluZykge1xuXHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCwgYm90dG9tVG9vbGJhckhlaWdodCB9ID0gdGhpcy5jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModmlld1R5cGUpO1xuXG5cdFx0cmV0dXJuIHRvdGFsSGVpZ2h0XG5cdFx0XHQtIGJvdHRvbVRvb2xiYXJHYXBcblx0XHRcdC0gYm90dG9tVG9vbGJhckhlaWdodCAvIDI7XG5cdH1cblxuXHRjb21wdXRlQ29kZUNlbGxFZGl0b3JXaWR0aChvdXRlcldpZHRoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBvdXRlcldpZHRoIC0gKFxuXHRcdFx0dGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jb2RlQ2VsbExlZnRNYXJnaW5cblx0XHRcdCsgdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsUnVuR3V0dGVyXG5cdFx0XHQrIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbFJpZ2h0TWFyZ2luXG5cdFx0KTtcblx0fVxuXG5cdGNvbXB1dGVNYXJrZG93bkNlbGxFZGl0b3JXaWR0aChvdXRlcldpZHRoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBvdXRlcldpZHRoXG5cdFx0XHQtIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25DZWxsR3V0dGVyXG5cdFx0XHQtIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25DZWxsTGVmdE1hcmdpblxuXHRcdFx0LSB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxSaWdodE1hcmdpbjtcblx0fVxuXG5cdGNvbXB1dGVTdGF0dXNCYXJIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsU3RhdHVzQmFySGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKGNvbXBhY3RWaWV3OiBib29sZWFuLCBpbnNlcnRUb29sYmFyUG9zaXRpb246ICdiZXR3ZWVuQ2VsbHMnIHwgJ25vdGVib29rVG9vbGJhcicgfCAnYm90aCcgfCAnaGlkZGVuJywgaW5zZXJ0VG9vbGJhckFsaWdubWVudDogJ2xlZnQnIHwgJ2NlbnRlcicsIGNlbGxUb29sYmFyOiAncmlnaHQnIHwgJ2xlZnQnIHwgJ2hpZGRlbicpOiB7IGJvdHRvbVRvb2xiYXJHYXA6IG51bWJlcjsgYm90dG9tVG9vbGJhckhlaWdodDogbnVtYmVyIH0ge1xuXHRcdGlmIChpbnNlcnRUb29sYmFyQWxpZ25tZW50ID09PSAnbGVmdCcgfHwgY2VsbFRvb2xiYXIgIT09ICdoaWRkZW4nKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRib3R0b21Ub29sYmFyR2FwOiAxOCxcblx0XHRcdFx0Ym90dG9tVG9vbGJhckhlaWdodDogMThcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGluc2VydFRvb2xiYXJQb3NpdGlvbiA9PT0gJ2JldHdlZW5DZWxscycgfHwgaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnYm90aCcpIHtcblx0XHRcdHJldHVybiBjb21wYWN0VmlldyA/IHtcblx0XHRcdFx0Ym90dG9tVG9vbGJhckdhcDogMTIsXG5cdFx0XHRcdGJvdHRvbVRvb2xiYXJIZWlnaHQ6IDIwXG5cdFx0XHR9IDoge1xuXHRcdFx0XHRib3R0b21Ub29sYmFyR2FwOiAyMCxcblx0XHRcdFx0Ym90dG9tVG9vbGJhckhlaWdodDogMjBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGJvdHRvbVRvb2xiYXJHYXA6IDAsXG5cdFx0XHRcdGJvdHRvbVRvb2xiYXJIZWlnaHQ6IDBcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Y29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHZpZXdUeXBlPzogc3RyaW5nKTogeyBib3R0b21Ub29sYmFyR2FwOiBudW1iZXI7IGJvdHRvbVRvb2xiYXJIZWlnaHQ6IG51bWJlciB9IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbjtcblx0XHRjb25zdCBjZWxsVG9vbGJhclBvc2l0aW9uID0gdGhpcy5jb21wdXRlQ2VsbFRvb2xiYXJMb2NhdGlvbih2aWV3VHlwZSk7XG5cdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwLCBib3R0b21Ub29sYmFySGVpZ2h0IH0gPSB0aGlzLl9jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnMoY29uZmlndXJhdGlvbi5jb21wYWN0VmlldywgY29uZmlndXJhdGlvbi5pbnNlcnRUb29sYmFyUG9zaXRpb24sIGNvbmZpZ3VyYXRpb24uaW5zZXJ0VG9vbGJhckFsaWdubWVudCwgY2VsbFRvb2xiYXJQb3NpdGlvbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJvdHRvbVRvb2xiYXJHYXAsXG5cdFx0XHRib3R0b21Ub29sYmFySGVpZ2h0XG5cdFx0fTtcblx0fVxuXG5cdGNvbXB1dGVDZWxsVG9vbGJhckxvY2F0aW9uKHZpZXdUeXBlPzogc3RyaW5nKTogJ3JpZ2h0JyB8ICdsZWZ0JyB8ICdoaWRkZW4nIHtcblx0XHRjb25zdCBjZWxsVG9vbGJhckxvY2F0aW9uID0gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsVG9vbGJhckxvY2F0aW9uO1xuXG5cdFx0aWYgKHR5cGVvZiBjZWxsVG9vbGJhckxvY2F0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKGNlbGxUb29sYmFyTG9jYXRpb24gPT09ICdsZWZ0JyB8fCBjZWxsVG9vbGJhckxvY2F0aW9uID09PSAncmlnaHQnIHx8IGNlbGxUb29sYmFyTG9jYXRpb24gPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdHJldHVybiBjZWxsVG9vbGJhckxvY2F0aW9uO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmlld1R5cGUpIHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tTcGVjaWZpY1NldHRpbmcgPSBjZWxsVG9vbGJhckxvY2F0aW9uW3ZpZXdUeXBlXSA/PyBjZWxsVG9vbGJhckxvY2F0aW9uWydkZWZhdWx0J107XG5cdFx0XHRcdGxldCBjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXc6ICdyaWdodCcgfCAnbGVmdCcgfCAnaGlkZGVuJyA9ICdyaWdodCc7XG5cblx0XHRcdFx0c3dpdGNoIChub3RlYm9va1NwZWNpZmljU2V0dGluZykge1xuXHRcdFx0XHRcdGNhc2UgJ2xlZnQnOlxuXHRcdFx0XHRcdFx0Y2VsbFRvb2xiYXJMb2NhdGlvbkZvckN1cnJlbnRWaWV3ID0gJ2xlZnQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncmlnaHQnOlxuXHRcdFx0XHRcdFx0Y2VsbFRvb2xiYXJMb2NhdGlvbkZvckN1cnJlbnRWaWV3ID0gJ3JpZ2h0Jztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2hpZGRlbic6XG5cdFx0XHRcdFx0XHRjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXcgPSAnaGlkZGVuJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXcgPSAncmlnaHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY2VsbFRvb2xiYXJMb2NhdGlvbkZvckN1cnJlbnRWaWV3O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAncmlnaHQnO1xuXHR9XG5cblx0Y29tcHV0ZVRvcEluc2VydFRvb2xiYXJIZWlnaHQodmlld1R5cGU/OiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmluc2VydFRvb2xiYXJQb3NpdGlvbiA9PT0gJ2JldHdlZW5DZWxscycgfHwgdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5pbnNlcnRUb29sYmFyUG9zaXRpb24gPT09ICdib3RoJykge1xuXHRcdFx0cmV0dXJuIFNDUk9MTEFCTEVfRUxFTUVOVF9QQURESU5HX1RPUDtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsVG9vbGJhckxvY2F0aW9uID0gdGhpcy5jb21wdXRlQ2VsbFRvb2xiYXJMb2NhdGlvbih2aWV3VHlwZSk7XG5cblx0XHRpZiAoY2VsbFRvb2xiYXJMb2NhdGlvbiA9PT0gJ2xlZnQnIHx8IGNlbGxUb29sYmFyTG9jYXRpb24gPT09ICdyaWdodCcpIHtcblx0XHRcdHJldHVybiBTQ1JPTExBQkxFX0VMRU1FTlRfUEFERElOR19UT1A7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRjb21wdXRlRWRpdG9yUGFkZGluZyhpbnRlcm5hbE1ldGFkYXRhOiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhLCBjZWxsVXJpOiBVUkkpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9wOiB0aGlzLl9lZGl0b3JUb3BQYWRkaW5nLFxuXHRcdFx0Ym90dG9tOiB0aGlzLnN0YXR1c0JhcklzVmlzaWJsZShpbnRlcm5hbE1ldGFkYXRhLCBjZWxsVXJpKVxuXHRcdFx0XHQ/IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uZWRpdG9yQm90dG9tUGFkZGluZ1xuXHRcdFx0XHQ6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uZWRpdG9yQm90dG9tUGFkZGluZ1dpdGhvdXRTdGF0dXNCYXJcblx0XHR9O1xuXHR9XG5cblxuXHRjb21wdXRlRWRpdG9yU3RhdHVzYmFySGVpZ2h0KGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIGNlbGxVcmk6IFVSSSkge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c0JhcklzVmlzaWJsZShpbnRlcm5hbE1ldGFkYXRhLCBjZWxsVXJpKSA/IHRoaXMuY29tcHV0ZVN0YXR1c0JhckhlaWdodCgpIDogMDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdHVzQmFySXNWaXNpYmxlKGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIGNlbGxVcmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4ZSA9IHRoaXMubm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbihjZWxsVXJpKTtcblx0XHRpZiAodGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5zaG93Q2VsbFN0YXR1c0JhciA9PT0gJ3Zpc2libGUnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uc2hvd0NlbGxTdGF0dXNCYXIgPT09ICd2aXNpYmxlQWZ0ZXJFeGVjdXRlJykge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBpbnRlcm5hbE1ldGFkYXRhLmxhc3RSdW5TdWNjZXNzID09PSAnYm9vbGVhbicgfHwgZXhlICE9PSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRjb21wdXRlV2Vidmlld09wdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG91dHB1dE5vZGVQYWRkaW5nOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxPdXRwdXRQYWRkaW5nLFxuXHRcdFx0b3V0cHV0Tm9kZUxlZnRQYWRkaW5nOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxPdXRwdXRQYWRkaW5nLFxuXHRcdFx0cHJldmlld05vZGVQYWRkaW5nOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmtkb3duUHJldmlld1BhZGRpbmcsXG5cdFx0XHRtYXJrZG93bkxlZnRNYXJnaW46IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25DZWxsR3V0dGVyICsgdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkNlbGxMZWZ0TWFyZ2luLFxuXHRcdFx0bGVmdE1hcmdpbjogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jb2RlQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRyaWdodE1hcmdpbjogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsUmlnaHRNYXJnaW4sXG5cdFx0XHRydW5HdXR0ZXI6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbFJ1bkd1dHRlcixcblx0XHRcdGRyYWdBbmREcm9wRW5hYmxlZDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5kcmFnQW5kRHJvcEVuYWJsZWQsXG5cdFx0XHRmb250U2l6ZTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5mb250U2l6ZSxcblx0XHRcdG91dHB1dEZvbnRTaXplOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dEZvbnRTaXplLFxuXHRcdFx0b3V0cHV0Rm9udEZhbWlseTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRGb250RmFtaWx5LFxuXHRcdFx0bWFya3VwRm9udFNpemU6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya3VwRm9udFNpemUsXG5cdFx0XHRtYXJrZG93bkxpbmVIZWlnaHQ6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25MaW5lSGVpZ2h0LFxuXHRcdFx0b3V0cHV0TGluZUhlaWdodDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRMaW5lSGVpZ2h0LFxuXHRcdFx0b3V0cHV0U2Nyb2xsaW5nOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dFNjcm9sbGluZyxcblx0XHRcdG91dHB1dFdvcmRXcmFwOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dFdvcmRXcmFwLFxuXHRcdFx0b3V0cHV0TGluZUxpbWl0OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dExpbmVMaW1pdCxcblx0XHRcdG91dHB1dExpbmtpZnlGaWxlUGF0aHM6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0TGlua2lmeUZpbGVQYXRocyxcblx0XHRcdG1pbmltYWxFcnJvcjogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRNaW5pbWFsRXJyb3IsXG5cdFx0XHRtYXJrdXBGb250RmFtaWx5OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmt1cEZvbnRGYW1pbHlcblx0XHR9O1xuXHR9XG5cblx0Y29tcHV0ZURpZmZXZWJ2aWV3T3B0aW9ucygpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3V0cHV0Tm9kZVBhZGRpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbE91dHB1dFBhZGRpbmcsXG5cdFx0XHRvdXRwdXROb2RlTGVmdFBhZGRpbmc6IDAsXG5cdFx0XHRwcmV2aWV3Tm9kZVBhZGRpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25QcmV2aWV3UGFkZGluZyxcblx0XHRcdG1hcmtkb3duTGVmdE1hcmdpbjogMCxcblx0XHRcdGxlZnRNYXJnaW46IDMyLFxuXHRcdFx0cmlnaHRNYXJnaW46IDAsXG5cdFx0XHRydW5HdXR0ZXI6IDAsXG5cdFx0XHRkcmFnQW5kRHJvcEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0Zm9udFNpemU6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uZm9udFNpemUsXG5cdFx0XHRvdXRwdXRGb250U2l6ZTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRGb250U2l6ZSxcblx0XHRcdG91dHB1dEZvbnRGYW1pbHk6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0Rm9udEZhbWlseSxcblx0XHRcdG1hcmt1cEZvbnRTaXplOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmt1cEZvbnRTaXplLFxuXHRcdFx0bWFya2Rvd25MaW5lSGVpZ2h0OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmtkb3duTGluZUhlaWdodCxcblx0XHRcdG91dHB1dExpbmVIZWlnaHQ6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0TGluZUhlaWdodCxcblx0XHRcdG91dHB1dFNjcm9sbGluZzogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRTY3JvbGxpbmcsXG5cdFx0XHRvdXRwdXRXb3JkV3JhcDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRXb3JkV3JhcCxcblx0XHRcdG91dHB1dExpbmVMaW1pdDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRMaW5lTGltaXQsXG5cdFx0XHRvdXRwdXRMaW5raWZ5RmlsZVBhdGhzOiBmYWxzZSxcblx0XHRcdG1pbmltYWxFcnJvcjogZmFsc2UsXG5cdFx0XHRtYXJrdXBGb250RmFtaWx5OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmt1cEZvbnRGYW1pbHlcblx0XHR9O1xuXHR9XG5cblx0Y29tcHV0ZUluZGljYXRvclBvc2l0aW9uKHRvdGFsSGVpZ2h0OiBudW1iZXIsIGZvbGRIaW50SGVpZ2h0OiBudW1iZXIsIHZpZXdUeXBlPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwIH0gPSB0aGlzLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh2aWV3VHlwZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym90dG9tSW5kaWNhdG9yVG9wOiB0b3RhbEhlaWdodCAtIGJvdHRvbVRvb2xiYXJHYXAgLSB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxCb3R0b21NYXJnaW4gLSBmb2xkSGludEhlaWdodCxcblx0XHRcdHZlcnRpY2FsSW5kaWNhdG9ySGVpZ2h0OiB0b3RhbEhlaWdodCAtIGJvdHRvbVRvb2xiYXJHYXAgLSBmb2xkSGludEhlaWdodFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMscUJBQWdELDZCQUE2QjtBQUV0RixT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
