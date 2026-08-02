import * as nls from "../../../../nls.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { registerColor, transparent, lessProminent, darken, lighten } from "../colorUtils.js";
import { foreground, contrastBorder, activeContrastBorder } from "./baseColors.js";
import { scrollbarShadow, badgeBackground } from "./miscColors.js";
const editorBackground = registerColor(
  "editor.background",
  { light: "#ffffff", dark: "#1E1E1E", hcDark: Color.black, hcLight: Color.white },
  nls.localize("editorBackground", "Editor background color.")
);
const editorForeground = registerColor(
  "editor.foreground",
  { light: "#333333", dark: "#BBBBBB", hcDark: Color.white, hcLight: foreground },
  nls.localize("editorForeground", "Editor default foreground color.")
);
const editorStickyScrollBackground = registerColor(
  "editorStickyScroll.background",
  editorBackground,
  nls.localize("editorStickyScrollBackground", "Background color of sticky scroll in the editor")
);
const editorStickyScrollGutterBackground = registerColor(
  "editorStickyScrollGutter.background",
  editorBackground,
  nls.localize("editorStickyScrollGutterBackground", "Background color of the gutter part of sticky scroll in the editor")
);
const editorStickyScrollHoverBackground = registerColor(
  "editorStickyScrollHover.background",
  { dark: "#2A2D2E", light: "#F0F0F0", hcDark: null, hcLight: Color.fromHex("#0F4A85").transparent(0.1) },
  nls.localize("editorStickyScrollHoverBackground", "Background color of sticky scroll on hover in the editor")
);
const editorStickyScrollBorder = registerColor(
  "editorStickyScroll.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("editorStickyScrollBorder", "Border color of sticky scroll in the editor")
);
const editorStickyScrollShadow = registerColor(
  "editorStickyScroll.shadow",
  scrollbarShadow,
  nls.localize("editorStickyScrollShadow", " Shadow color of sticky scroll in the editor")
);
const editorWidgetBackground = registerColor(
  "editorWidget.background",
  { dark: "#252526", light: "#F3F3F3", hcDark: "#0C141F", hcLight: Color.white },
  nls.localize("editorWidgetBackground", "Background color of editor widgets, such as find/replace.")
);
const editorWidgetForeground = registerColor(
  "editorWidget.foreground",
  foreground,
  nls.localize("editorWidgetForeground", "Foreground color of editor widgets, such as find/replace.")
);
const editorWidgetBorder = registerColor(
  "editorWidget.border",
  { dark: transparent(editorWidgetForeground, 0.2), light: transparent(editorWidgetForeground, 0.2), hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("editorWidgetBorder", "Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.")
);
const editorWidgetResizeBorder = registerColor(
  "editorWidget.resizeBorder",
  null,
  nls.localize("editorWidgetResizeBorder", "Border color of the resize bar of editor widgets. The color is only used if the widget chooses to have a resize border and if the color is not overridden by a widget.")
);
const editorErrorBackground = registerColor(
  "editorError.background",
  null,
  nls.localize("editorError.background", "Background color of error text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorErrorForeground = registerColor(
  "editorError.foreground",
  { dark: "#F14C4C", light: "#E51400", hcDark: "#F48771", hcLight: "#B5200D" },
  nls.localize("editorError.foreground", "Foreground color of error squigglies in the editor.")
);
const editorErrorBorder = registerColor(
  "editorError.border",
  { dark: null, light: null, hcDark: Color.fromHex("#E47777").transparent(0.8), hcLight: "#B5200D" },
  nls.localize("errorBorder", "If set, color of double underlines for errors in the editor.")
);
const editorWarningBackground = registerColor(
  "editorWarning.background",
  null,
  nls.localize("editorWarning.background", "Background color of warning text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorWarningForeground = registerColor(
  "editorWarning.foreground",
  { dark: "#CCA700", light: "#BF8803", hcDark: "#FFD370", hcLight: "#895503" },
  nls.localize("editorWarning.foreground", "Foreground color of warning squigglies in the editor.")
);
const editorWarningBorder = registerColor(
  "editorWarning.border",
  { dark: null, light: null, hcDark: Color.fromHex("#FFCC00").transparent(0.8), hcLight: Color.fromHex("#FFCC00").transparent(0.8) },
  nls.localize("warningBorder", "If set, color of double underlines for warnings in the editor.")
);
const editorInfoBackground = registerColor(
  "editorInfo.background",
  null,
  nls.localize("editorInfo.background", "Background color of info text in the editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorInfoForeground = registerColor(
  "editorInfo.foreground",
  { dark: "#59a4f9", light: "#0063d3", hcDark: "#59a4f9", hcLight: "#0063d3" },
  nls.localize("editorInfo.foreground", "Foreground color of info squigglies in the editor.")
);
const editorInfoBorder = registerColor(
  "editorInfo.border",
  { dark: null, light: null, hcDark: Color.fromHex("#59a4f9").transparent(0.8), hcLight: "#292929" },
  nls.localize("infoBorder", "If set, color of double underlines for infos in the editor.")
);
const editorHintForeground = registerColor(
  "editorHint.foreground",
  { dark: Color.fromHex("#eeeeee").transparent(0.7), light: "#6c6c6c", hcDark: null, hcLight: null },
  nls.localize("editorHint.foreground", "Foreground color of hint squigglies in the editor.")
);
const editorHintBorder = registerColor(
  "editorHint.border",
  { dark: null, light: null, hcDark: Color.fromHex("#eeeeee").transparent(0.8), hcLight: "#292929" },
  nls.localize("hintBorder", "If set, color of double underlines for hints in the editor.")
);
const editorActiveLinkForeground = registerColor(
  "editorLink.activeForeground",
  { dark: "#4E94CE", light: Color.blue, hcDark: Color.cyan, hcLight: "#292929" },
  nls.localize("activeLinkForeground", "Color of active links.")
);
const editorSelectionBackground = registerColor(
  "editor.selectionBackground",
  { light: "#ADD6FF", dark: "#264F78", hcDark: "#f3f518", hcLight: "#0F4A85" },
  nls.localize("editorSelectionBackground", "Color of the editor selection.")
);
const editorSelectionForeground = registerColor(
  "editor.selectionForeground",
  { light: null, dark: null, hcDark: "#000000", hcLight: Color.white },
  nls.localize("editorSelectionForeground", "Color of the selected text for high contrast.")
);
const editorInactiveSelection = registerColor(
  "editor.inactiveSelectionBackground",
  { light: transparent(editorSelectionBackground, 0.5), dark: transparent(editorSelectionBackground, 0.5), hcDark: transparent(editorSelectionBackground, 0.7), hcLight: transparent(editorSelectionBackground, 0.5) },
  nls.localize("editorInactiveSelection", "Color of the selection in an inactive editor. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorSelectionHighlight = registerColor(
  "editor.selectionHighlightBackground",
  { light: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), dark: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), hcDark: null, hcLight: null },
  nls.localize("editorSelectionHighlight", "Color for regions with the same content as the selection. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorSelectionHighlightBorder = registerColor(
  "editor.selectionHighlightBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("editorSelectionHighlightBorder", "Border color for regions with the same content as the selection.")
);
const editorCompositionBorder = registerColor(
  "editor.compositionBorder",
  { light: "#000000", dark: "#ffffff", hcLight: "#000000", hcDark: "#ffffff" },
  nls.localize("editorCompositionBorder", "The border color for an IME composition.")
);
const editorFindMatch = registerColor(
  "editor.findMatchBackground",
  { light: "#A8AC94", dark: "#515C6A", hcDark: null, hcLight: null },
  nls.localize("editorFindMatch", "Color of the current search match.")
);
const editorFindMatchForeground = registerColor(
  "editor.findMatchForeground",
  null,
  nls.localize("editorFindMatchForeground", "Text color of the current search match.")
);
const editorFindMatchHighlight = registerColor(
  "editor.findMatchHighlightBackground",
  { light: "#EA5C0055", dark: "#EA5C0055", hcDark: null, hcLight: null },
  nls.localize("findMatchHighlight", "Color of the other search matches. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorFindMatchHighlightForeground = registerColor(
  "editor.findMatchHighlightForeground",
  null,
  nls.localize("findMatchHighlightForeground", "Foreground color of the other search matches."),
  true
);
const editorFindRangeHighlight = registerColor(
  "editor.findRangeHighlightBackground",
  { dark: "#3a3d4166", light: "#b4b4b44d", hcDark: null, hcLight: null },
  nls.localize("findRangeHighlight", "Color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorFindMatchBorder = registerColor(
  "editor.findMatchBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("editorFindMatchBorder", "Border color of the current search match.")
);
const editorFindMatchHighlightBorder = registerColor(
  "editor.findMatchHighlightBorder",
  { light: null, dark: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("findMatchHighlightBorder", "Border color of the other search matches.")
);
const editorFindRangeHighlightBorder = registerColor(
  "editor.findRangeHighlightBorder",
  { dark: null, light: null, hcDark: transparent(activeContrastBorder, 0.4), hcLight: transparent(activeContrastBorder, 0.4) },
  nls.localize("findRangeHighlightBorder", "Border color of the range limiting the search. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorHoverHighlight = registerColor(
  "editor.hoverHighlightBackground",
  { light: "#ADD6FF26", dark: "#264f7840", hcDark: "#ADD6FF26", hcLight: null },
  nls.localize("hoverHighlight", "Highlight below the word for which a hover is shown. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const editorHoverBackground = registerColor(
  "editorHoverWidget.background",
  editorWidgetBackground,
  nls.localize("hoverBackground", "Background color of the editor hover.")
);
const editorHoverForeground = registerColor(
  "editorHoverWidget.foreground",
  editorWidgetForeground,
  nls.localize("hoverForeground", "Foreground color of the editor hover.")
);
const editorHoverBorder = registerColor(
  "editorHoverWidget.border",
  editorWidgetBorder,
  nls.localize("hoverBorder", "Border color of the editor hover.")
);
const editorHoverStatusBarBackground = registerColor(
  "editorHoverWidget.statusBarBackground",
  { dark: lighten(editorHoverBackground, 0.2), light: darken(editorHoverBackground, 0.05), hcDark: editorWidgetBackground, hcLight: editorWidgetBackground },
  nls.localize("statusBarBackground", "Background color of the editor hover status bar.")
);
const editorInlayHintForeground = registerColor(
  "editorInlayHint.foreground",
  { dark: "#969696", light: "#969696", hcDark: Color.white, hcLight: Color.black },
  nls.localize("editorInlayHintForeground", "Foreground color of inline hints")
);
const editorInlayHintBackground = registerColor(
  "editorInlayHint.background",
  { dark: transparent(badgeBackground, 0.1), light: transparent(badgeBackground, 0.1), hcDark: transparent(Color.white, 0.1), hcLight: transparent(badgeBackground, 0.1) },
  nls.localize("editorInlayHintBackground", "Background color of inline hints")
);
const editorInlayHintTypeForeground = registerColor(
  "editorInlayHint.typeForeground",
  editorInlayHintForeground,
  nls.localize("editorInlayHintForegroundTypes", "Foreground color of inline hints for types")
);
const editorInlayHintTypeBackground = registerColor(
  "editorInlayHint.typeBackground",
  editorInlayHintBackground,
  nls.localize("editorInlayHintBackgroundTypes", "Background color of inline hints for types")
);
const editorInlayHintParameterForeground = registerColor(
  "editorInlayHint.parameterForeground",
  editorInlayHintForeground,
  nls.localize("editorInlayHintForegroundParameter", "Foreground color of inline hints for parameters")
);
const editorInlayHintParameterBackground = registerColor(
  "editorInlayHint.parameterBackground",
  editorInlayHintBackground,
  nls.localize("editorInlayHintBackgroundParameter", "Background color of inline hints for parameters")
);
const editorLightBulbForeground = registerColor(
  "editorLightBulb.foreground",
  { dark: "#FFCC00", light: "#DDB100", hcDark: "#FFCC00", hcLight: "#007ACC" },
  nls.localize("editorLightBulbForeground", "The color used for the lightbulb actions icon.")
);
const editorLightBulbAutoFixForeground = registerColor(
  "editorLightBulbAutoFix.foreground",
  { dark: "#75BEFF", light: "#007ACC", hcDark: "#75BEFF", hcLight: "#007ACC" },
  nls.localize("editorLightBulbAutoFixForeground", "The color used for the lightbulb auto fix actions icon.")
);
const editorLightBulbAiForeground = registerColor(
  "editorLightBulbAi.foreground",
  editorLightBulbForeground,
  nls.localize("editorLightBulbAiForeground", "The color used for the lightbulb AI icon.")
);
const snippetTabstopHighlightBackground = registerColor(
  "editor.snippetTabstopHighlightBackground",
  { dark: new Color(new RGBA(124, 124, 124, 0.3)), light: new Color(new RGBA(10, 50, 100, 0.2)), hcDark: new Color(new RGBA(124, 124, 124, 0.3)), hcLight: new Color(new RGBA(10, 50, 100, 0.2)) },
  nls.localize("snippetTabstopHighlightBackground", "Highlight background color of a snippet tabstop.")
);
const snippetTabstopHighlightBorder = registerColor(
  "editor.snippetTabstopHighlightBorder",
  null,
  nls.localize("snippetTabstopHighlightBorder", "Highlight border color of a snippet tabstop.")
);
const snippetFinalTabstopHighlightBackground = registerColor(
  "editor.snippetFinalTabstopHighlightBackground",
  null,
  nls.localize("snippetFinalTabstopHighlightBackground", "Highlight background color of the final tabstop of a snippet.")
);
const snippetFinalTabstopHighlightBorder = registerColor(
  "editor.snippetFinalTabstopHighlightBorder",
  { dark: "#525252", light: new Color(new RGBA(10, 50, 100, 0.5)), hcDark: "#525252", hcLight: "#292929" },
  nls.localize("snippetFinalTabstopHighlightBorder", "Highlight border color of the final tabstop of a snippet.")
);
const defaultInsertColor = new Color(new RGBA(155, 185, 85, 0.2));
const defaultRemoveColor = new Color(new RGBA(255, 0, 0, 0.2));
const diffInserted = registerColor(
  "diffEditor.insertedTextBackground",
  { dark: "#9ccc2c33", light: "#9ccc2c40", hcDark: null, hcLight: null },
  nls.localize("diffEditorInserted", "Background color for text that got inserted. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffRemoved = registerColor(
  "diffEditor.removedTextBackground",
  { dark: "#ff000033", light: "#ff000033", hcDark: null, hcLight: null },
  nls.localize("diffEditorRemoved", "Background color for text that got removed. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffInsertedLine = registerColor(
  "diffEditor.insertedLineBackground",
  { dark: defaultInsertColor, light: defaultInsertColor, hcDark: null, hcLight: null },
  nls.localize("diffEditorInsertedLines", "Background color for lines that got inserted. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffRemovedLine = registerColor(
  "diffEditor.removedLineBackground",
  { dark: defaultRemoveColor, light: defaultRemoveColor, hcDark: null, hcLight: null },
  nls.localize("diffEditorRemovedLines", "Background color for lines that got removed. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const diffInsertedLineGutter = registerColor(
  "diffEditorGutter.insertedLineBackground",
  null,
  nls.localize("diffEditorInsertedLineGutter", "Background color for the margin where lines got inserted.")
);
const diffRemovedLineGutter = registerColor(
  "diffEditorGutter.removedLineBackground",
  null,
  nls.localize("diffEditorRemovedLineGutter", "Background color for the margin where lines got removed.")
);
const diffOverviewRulerInserted = registerColor(
  "diffEditorOverview.insertedForeground",
  null,
  nls.localize("diffEditorOverviewInserted", "Diff overview ruler foreground for inserted content.")
);
const diffOverviewRulerRemoved = registerColor(
  "diffEditorOverview.removedForeground",
  null,
  nls.localize("diffEditorOverviewRemoved", "Diff overview ruler foreground for removed content.")
);
const diffInsertedOutline = registerColor(
  "diffEditor.insertedTextBorder",
  { dark: null, light: null, hcDark: "#33ff2eff", hcLight: "#374E06" },
  nls.localize("diffEditorInsertedOutline", "Outline color for the text that got inserted.")
);
const diffRemovedOutline = registerColor(
  "diffEditor.removedTextBorder",
  { dark: null, light: null, hcDark: "#FF008F", hcLight: "#AD0707" },
  nls.localize("diffEditorRemovedOutline", "Outline color for text that got removed.")
);
const diffBorder = registerColor(
  "diffEditor.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("diffEditorBorder", "Border color between the two text editors.")
);
const diffDiagonalFill = registerColor(
  "diffEditor.diagonalFill",
  { dark: "#cccccc33", light: "#22222233", hcDark: null, hcLight: null },
  nls.localize("diffDiagonalFill", "Color of the diff editor's diagonal fill. The diagonal fill is used in side-by-side diff views.")
);
const diffUnchangedRegionBackground = registerColor(
  "diffEditor.unchangedRegionBackground",
  "sideBar.background",
  nls.localize("diffEditor.unchangedRegionBackground", "The background color of unchanged blocks in the diff editor.")
);
const diffUnchangedRegionForeground = registerColor(
  "diffEditor.unchangedRegionForeground",
  "foreground",
  nls.localize("diffEditor.unchangedRegionForeground", "The foreground color of unchanged blocks in the diff editor.")
);
const diffUnchangedTextBackground = registerColor(
  "diffEditor.unchangedCodeBackground",
  { dark: "#74747429", light: "#b8b8b829", hcDark: null, hcLight: null },
  nls.localize("diffEditor.unchangedCodeBackground", "The background color of unchanged code in the diff editor.")
);
const widgetShadow = registerColor(
  "widget.shadow",
  { dark: transparent(Color.black, 0.36), light: transparent(Color.black, 0.16), hcDark: null, hcLight: null },
  nls.localize("widgetShadow", "Shadow color of widgets such as find/replace inside the editor.")
);
const widgetBorder = registerColor(
  "widget.border",
  { dark: null, light: null, hcDark: contrastBorder, hcLight: contrastBorder },
  nls.localize("widgetBorder", "Border color of widgets such as find/replace inside the editor.")
);
const toolbarHoverBackground = registerColor(
  "toolbar.hoverBackground",
  { dark: "#5a5d5e50", light: "#b8b8b850", hcDark: null, hcLight: null },
  nls.localize("toolbarHoverBackground", "Toolbar background when hovering over actions using the mouse")
);
const toolbarHoverOutline = registerColor(
  "toolbar.hoverOutline",
  { dark: null, light: null, hcDark: activeContrastBorder, hcLight: activeContrastBorder },
  nls.localize("toolbarHoverOutline", "Toolbar outline when hovering over actions using the mouse")
);
const toolbarActiveBackground = registerColor(
  "toolbar.activeBackground",
  { dark: lighten(toolbarHoverBackground, 0.1), light: darken(toolbarHoverBackground, 0.1), hcDark: null, hcLight: null },
  nls.localize("toolbarActiveBackground", "Toolbar background when holding the mouse over actions")
);
const breadcrumbsForeground = registerColor(
  "breadcrumb.foreground",
  transparent(foreground, 0.8),
  nls.localize("breadcrumbsFocusForeground", "Color of focused breadcrumb items.")
);
const breadcrumbsBackground = registerColor(
  "breadcrumb.background",
  editorBackground,
  nls.localize("breadcrumbsBackground", "Background color of breadcrumb items.")
);
const breadcrumbsFocusForeground = registerColor(
  "breadcrumb.focusForeground",
  { light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
  nls.localize("breadcrumbsFocusForeground", "Color of focused breadcrumb items.")
);
const breadcrumbsActiveSelectionForeground = registerColor(
  "breadcrumb.activeSelectionForeground",
  { light: darken(foreground, 0.2), dark: lighten(foreground, 0.1), hcDark: lighten(foreground, 0.1), hcLight: lighten(foreground, 0.1) },
  nls.localize("breadcrumbsSelectedForeground", "Color of selected breadcrumb items.")
);
const breadcrumbsPickerBackground = registerColor(
  "breadcrumbPicker.background",
  editorWidgetBackground,
  nls.localize("breadcrumbsSelectedBackground", "Background color of breadcrumb item picker.")
);
const headerTransparency = 0.5;
const currentBaseColor = Color.fromHex("#40C8AE").transparent(headerTransparency);
const incomingBaseColor = Color.fromHex("#40A6FF").transparent(headerTransparency);
const commonBaseColor = Color.fromHex("#606060").transparent(0.4);
const contentTransparency = 0.4;
const rulerTransparency = 1;
const mergeCurrentHeaderBackground = registerColor(
  "merge.currentHeaderBackground",
  { dark: currentBaseColor, light: currentBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeCurrentHeaderBackground", "Current header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCurrentContentBackground = registerColor(
  "merge.currentContentBackground",
  transparent(mergeCurrentHeaderBackground, contentTransparency),
  nls.localize("mergeCurrentContentBackground", "Current content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeIncomingHeaderBackground = registerColor(
  "merge.incomingHeaderBackground",
  { dark: incomingBaseColor, light: incomingBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeIncomingHeaderBackground", "Incoming header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeIncomingContentBackground = registerColor(
  "merge.incomingContentBackground",
  transparent(mergeIncomingHeaderBackground, contentTransparency),
  nls.localize("mergeIncomingContentBackground", "Incoming content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCommonHeaderBackground = registerColor(
  "merge.commonHeaderBackground",
  { dark: commonBaseColor, light: commonBaseColor, hcDark: null, hcLight: null },
  nls.localize("mergeCommonHeaderBackground", "Common ancestor header background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeCommonContentBackground = registerColor(
  "merge.commonContentBackground",
  transparent(mergeCommonHeaderBackground, contentTransparency),
  nls.localize("mergeCommonContentBackground", "Common ancestor content background in inline merge-conflicts. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const mergeBorder = registerColor(
  "merge.border",
  { dark: null, light: null, hcDark: "#C3DF6F", hcLight: "#007ACC" },
  nls.localize("mergeBorder", "Border color on headers and the splitter in inline merge-conflicts.")
);
const overviewRulerCurrentContentForeground = registerColor(
  "editorOverviewRuler.currentContentForeground",
  { dark: transparent(mergeCurrentHeaderBackground, rulerTransparency), light: transparent(mergeCurrentHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerCurrentContentForeground", "Current overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerIncomingContentForeground = registerColor(
  "editorOverviewRuler.incomingContentForeground",
  { dark: transparent(mergeIncomingHeaderBackground, rulerTransparency), light: transparent(mergeIncomingHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerIncomingContentForeground", "Incoming overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerCommonContentForeground = registerColor(
  "editorOverviewRuler.commonContentForeground",
  { dark: transparent(mergeCommonHeaderBackground, rulerTransparency), light: transparent(mergeCommonHeaderBackground, rulerTransparency), hcDark: mergeBorder, hcLight: mergeBorder },
  nls.localize("overviewRulerCommonContentForeground", "Common ancestor overview ruler foreground for inline merge-conflicts.")
);
const overviewRulerFindMatchForeground = registerColor(
  "editorOverviewRuler.findMatchForeground",
  { dark: "#d186167e", light: "#d186167e", hcDark: "#AB5A00", hcLight: "#AB5A00" },
  nls.localize("overviewRulerFindMatchForeground", "Overview ruler marker color for find matches. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const overviewRulerSelectionHighlightForeground = registerColor(
  "editorOverviewRuler.selectionHighlightForeground",
  "#A0A0A0CC",
  nls.localize("overviewRulerSelectionHighlightForeground", "Overview ruler marker color for selection highlights. The color must not be opaque so as not to hide underlying decorations."),
  true
);
const problemsErrorIconForeground = registerColor(
  "problemsErrorIcon.foreground",
  editorErrorForeground,
  nls.localize("problemsErrorIconForeground", "The color used for the problems error icon.")
);
const problemsWarningIconForeground = registerColor(
  "problemsWarningIcon.foreground",
  editorWarningForeground,
  nls.localize("problemsWarningIconForeground", "The color used for the problems warning icon.")
);
const problemsInfoIconForeground = registerColor(
  "problemsInfoIcon.foreground",
  editorInfoForeground,
  nls.localize("problemsInfoIconForeground", "The color used for the problems info icon.")
);
export {
  breadcrumbsActiveSelectionForeground,
  breadcrumbsBackground,
  breadcrumbsFocusForeground,
  breadcrumbsForeground,
  breadcrumbsPickerBackground,
  defaultInsertColor,
  defaultRemoveColor,
  diffBorder,
  diffDiagonalFill,
  diffInserted,
  diffInsertedLine,
  diffInsertedLineGutter,
  diffInsertedOutline,
  diffOverviewRulerInserted,
  diffOverviewRulerRemoved,
  diffRemoved,
  diffRemovedLine,
  diffRemovedLineGutter,
  diffRemovedOutline,
  diffUnchangedRegionBackground,
  diffUnchangedRegionForeground,
  diffUnchangedTextBackground,
  editorActiveLinkForeground,
  editorBackground,
  editorCompositionBorder,
  editorErrorBackground,
  editorErrorBorder,
  editorErrorForeground,
  editorFindMatch,
  editorFindMatchBorder,
  editorFindMatchForeground,
  editorFindMatchHighlight,
  editorFindMatchHighlightBorder,
  editorFindMatchHighlightForeground,
  editorFindRangeHighlight,
  editorFindRangeHighlightBorder,
  editorForeground,
  editorHintBorder,
  editorHintForeground,
  editorHoverBackground,
  editorHoverBorder,
  editorHoverForeground,
  editorHoverHighlight,
  editorHoverStatusBarBackground,
  editorInactiveSelection,
  editorInfoBackground,
  editorInfoBorder,
  editorInfoForeground,
  editorInlayHintBackground,
  editorInlayHintForeground,
  editorInlayHintParameterBackground,
  editorInlayHintParameterForeground,
  editorInlayHintTypeBackground,
  editorInlayHintTypeForeground,
  editorLightBulbAiForeground,
  editorLightBulbAutoFixForeground,
  editorLightBulbForeground,
  editorSelectionBackground,
  editorSelectionForeground,
  editorSelectionHighlight,
  editorSelectionHighlightBorder,
  editorStickyScrollBackground,
  editorStickyScrollBorder,
  editorStickyScrollGutterBackground,
  editorStickyScrollHoverBackground,
  editorStickyScrollShadow,
  editorWarningBackground,
  editorWarningBorder,
  editorWarningForeground,
  editorWidgetBackground,
  editorWidgetBorder,
  editorWidgetForeground,
  editorWidgetResizeBorder,
  mergeBorder,
  mergeCommonContentBackground,
  mergeCommonHeaderBackground,
  mergeCurrentContentBackground,
  mergeCurrentHeaderBackground,
  mergeIncomingContentBackground,
  mergeIncomingHeaderBackground,
  overviewRulerCommonContentForeground,
  overviewRulerCurrentContentForeground,
  overviewRulerFindMatchForeground,
  overviewRulerIncomingContentForeground,
  overviewRulerSelectionHighlightForeground,
  problemsErrorIconForeground,
  problemsInfoIconForeground,
  problemsWarningIconForeground,
  snippetFinalTabstopHighlightBackground,
  snippetFinalTabstopHighlightBorder,
  snippetTabstopHighlightBackground,
  snippetTabstopHighlightBorder,
  toolbarActiveBackground,
  toolbarHoverBackground,
  toolbarHoverOutline,
  widgetBorder,
  widgetShadow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvZWRpdG9yQ29sb3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbi8vIEltcG9ydCB0aGUgZWZmZWN0cyB3ZSBuZWVkXG5pbXBvcnQgeyBDb2xvciwgUkdCQSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IsIHRyYW5zcGFyZW50LCBsZXNzUHJvbWluZW50LCBkYXJrZW4sIGxpZ2h0ZW4gfSBmcm9tICcuLi9jb2xvclV0aWxzLmpzJztcblxuLy8gSW1wb3J0IHRoZSBjb2xvcnMgd2UgbmVlZFxuaW1wb3J0IHsgZm9yZWdyb3VuZCwgY29udHJhc3RCb3JkZXIsIGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi9iYXNlQ29sb3JzLmpzJztcbmltcG9ydCB7IHNjcm9sbGJhclNoYWRvdywgYmFkZ2VCYWNrZ3JvdW5kIH0gZnJvbSAnLi9taXNjQ29sb3JzLmpzJztcblxuXG4vLyAtLS0tLSBlZGl0b3JcblxuZXhwb3J0IGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuYmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjZmZmZmZmJywgZGFyazogJyMxRTFFMUUnLCBoY0Rhcms6IENvbG9yLmJsYWNrLCBoY0xpZ2h0OiBDb2xvci53aGl0ZSB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckJhY2tncm91bmQnLCBcIkVkaXRvciBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZvcmVncm91bmQnLFxuXHR7IGxpZ2h0OiAnIzMzMzMzMycsIGRhcms6ICcjQkJCQkJCJywgaGNEYXJrOiBDb2xvci53aGl0ZSwgaGNMaWdodDogZm9yZWdyb3VuZCB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckZvcmVncm91bmQnLCBcIkVkaXRvciBkZWZhdWx0IGZvcmVncm91bmQgY29sb3IuXCIpKTtcblxuXG5leHBvcnQgY29uc3QgZWRpdG9yU3RpY2t5U2Nyb2xsQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN0aWNreVNjcm9sbC5iYWNrZ3JvdW5kJyxcblx0ZWRpdG9yQmFja2dyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JTdGlja3lTY3JvbGxCYWNrZ3JvdW5kJywgXCJCYWNrZ3JvdW5kIGNvbG9yIG9mIHN0aWNreSBzY3JvbGwgaW4gdGhlIGVkaXRvclwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JTdGlja3lTY3JvbGxHdXR0ZXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3RpY2t5U2Nyb2xsR3V0dGVyLmJhY2tncm91bmQnLFxuXHRlZGl0b3JCYWNrZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclN0aWNreVNjcm9sbEd1dHRlckJhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2YgdGhlIGd1dHRlciBwYXJ0IG9mIHN0aWNreSBzY3JvbGwgaW4gdGhlIGVkaXRvclwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JTdGlja3lTY3JvbGxIb3ZlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdGlja3lTY3JvbGxIb3Zlci5iYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzJBMkQyRScsIGxpZ2h0OiAnI0YwRjBGMCcsIGhjRGFyazogbnVsbCwgaGNMaWdodDogQ29sb3IuZnJvbUhleCgnIzBGNEE4NScpLnRyYW5zcGFyZW50KDAuMSkgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JTdGlja3lTY3JvbGxIb3ZlckJhY2tncm91bmQnLCBcIkJhY2tncm91bmQgY29sb3Igb2Ygc3RpY2t5IHNjcm9sbCBvbiBob3ZlciBpbiB0aGUgZWRpdG9yXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclN0aWNreVNjcm9sbEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN0aWNreVNjcm9sbC5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBjb250cmFzdEJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclN0aWNreVNjcm9sbEJvcmRlcicsIFwiQm9yZGVyIGNvbG9yIG9mIHN0aWNreSBzY3JvbGwgaW4gdGhlIGVkaXRvclwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JTdGlja3lTY3JvbGxTaGFkb3cgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdGlja3lTY3JvbGwuc2hhZG93Jyxcblx0c2Nyb2xsYmFyU2hhZG93LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclN0aWNreVNjcm9sbFNoYWRvdycsIFwiIFNoYWRvdyBjb2xvciBvZiBzdGlja3kgc2Nyb2xsIGluIHRoZSBlZGl0b3JcIikpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2lkZ2V0LmJhY2tncm91bmQnLFxuXHR7IGRhcms6ICcjMjUyNTI2JywgbGlnaHQ6ICcjRjNGM0YzJywgaGNEYXJrOiAnIzBDMTQxRicsIGhjTGlnaHQ6IENvbG9yLndoaXRlIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCcsICdCYWNrZ3JvdW5kIGNvbG9yIG9mIGVkaXRvciB3aWRnZXRzLCBzdWNoIGFzIGZpbmQvcmVwbGFjZS4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXaWRnZXRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2lkZ2V0LmZvcmVncm91bmQnLFxuXHRmb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvcldpZGdldEZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiBlZGl0b3Igd2lkZ2V0cywgc3VjaCBhcyBmaW5kL3JlcGxhY2UuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yV2lkZ2V0Qm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yV2lkZ2V0LmJvcmRlcicsXG5cdHsgZGFyazogdHJhbnNwYXJlbnQoZWRpdG9yV2lkZ2V0Rm9yZWdyb3VuZCwgMC4yKSwgbGlnaHQ6IHRyYW5zcGFyZW50KGVkaXRvcldpZGdldEZvcmVncm91bmQsIDAuMiksIGhjRGFyazogY29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2lkZ2V0Qm9yZGVyJywgJ0JvcmRlciBjb2xvciBvZiBlZGl0b3Igd2lkZ2V0cy4gVGhlIGNvbG9yIGlzIG9ubHkgdXNlZCBpZiB0aGUgd2lkZ2V0IGNob29zZXMgdG8gaGF2ZSBhIGJvcmRlciBhbmQgaWYgdGhlIGNvbG9yIGlzIG5vdCBvdmVycmlkZGVuIGJ5IGEgd2lkZ2V0LicpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcldpZGdldFJlc2l6ZUJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcldpZGdldC5yZXNpemVCb3JkZXInLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvcldpZGdldFJlc2l6ZUJvcmRlcicsIFwiQm9yZGVyIGNvbG9yIG9mIHRoZSByZXNpemUgYmFyIG9mIGVkaXRvciB3aWRnZXRzLiBUaGUgY29sb3IgaXMgb25seSB1c2VkIGlmIHRoZSB3aWRnZXQgY2hvb3NlcyB0byBoYXZlIGEgcmVzaXplIGJvcmRlciBhbmQgaWYgdGhlIGNvbG9yIGlzIG5vdCBvdmVycmlkZGVuIGJ5IGEgd2lkZ2V0LlwiKSk7XG5cblxuZXhwb3J0IGNvbnN0IGVkaXRvckVycm9yQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckVycm9yLmJhY2tncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckVycm9yLmJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiBlcnJvciB0ZXh0IGluIHRoZSBlZGl0b3IuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JFcnJvckZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JFcnJvci5mb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiAnI0YxNEM0QycsIGxpZ2h0OiAnI0U1MTQwMCcsIGhjRGFyazogJyNGNDg3NzEnLCBoY0xpZ2h0OiAnI0I1MjAwRCcgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JFcnJvci5mb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgZXJyb3Igc3F1aWdnbGllcyBpbiB0aGUgZWRpdG9yLicpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckVycm9yQm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yRXJyb3IuYm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiBDb2xvci5mcm9tSGV4KCcjRTQ3Nzc3JykudHJhbnNwYXJlbnQoMC44KSwgaGNMaWdodDogJyNCNTIwMEQnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZXJyb3JCb3JkZXInLCAnSWYgc2V0LCBjb2xvciBvZiBkb3VibGUgdW5kZXJsaW5lcyBmb3IgZXJyb3JzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXYXJuaW5nQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcldhcm5pbmcuYmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2FybmluZy5iYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2Ygd2FybmluZyB0ZXh0IGluIHRoZSBlZGl0b3IuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcldhcm5pbmcuZm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyNDQ0E3MDAnLCBsaWdodDogJyNCRjg4MDMnLCBoY0Rhcms6ICcjRkZEMzcwJywgaGNMaWdodDogJyM4OTU1MDMnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yV2FybmluZy5mb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2Ygd2FybmluZyBzcXVpZ2dsaWVzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yV2FybmluZ0JvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcldhcm5pbmcuYm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiBDb2xvci5mcm9tSGV4KCcjRkZDQzAwJykudHJhbnNwYXJlbnQoMC44KSwgaGNMaWdodDogQ29sb3IuZnJvbUhleCgnI0ZGQ0MwMCcpLnRyYW5zcGFyZW50KDAuOCkgfSxcblx0bmxzLmxvY2FsaXplKCd3YXJuaW5nQm9yZGVyJywgJ0lmIHNldCwgY29sb3Igb2YgZG91YmxlIHVuZGVybGluZXMgZm9yIHdhcm5pbmdzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmZvQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckluZm8uYmFja2dyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5mby5iYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2YgaW5mbyB0ZXh0IGluIHRoZSBlZGl0b3IuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmZvRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckluZm8uZm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyM1OWE0ZjknLCBsaWdodDogJyMwMDYzZDMnLCBoY0Rhcms6ICcjNTlhNGY5JywgaGNMaWdodDogJyMwMDYzZDMnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5mby5mb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgaW5mbyBzcXVpZ2dsaWVzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5mb0JvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckluZm8uYm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiBDb2xvci5mcm9tSGV4KCcjNTlhNGY5JykudHJhbnNwYXJlbnQoMC44KSwgaGNMaWdodDogJyMyOTI5MjknIH0sXG5cdG5scy5sb2NhbGl6ZSgnaW5mb0JvcmRlcicsICdJZiBzZXQsIGNvbG9yIG9mIGRvdWJsZSB1bmRlcmxpbmVzIGZvciBpbmZvcyBpbiB0aGUgZWRpdG9yLicpKTtcblxuXG5leHBvcnQgY29uc3QgZWRpdG9ySGludEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JIaW50LmZvcmVncm91bmQnLFxuXHR7IGRhcms6IENvbG9yLmZyb21IZXgoJyNlZWVlZWUnKS50cmFuc3BhcmVudCgwLjcpLCBsaWdodDogJyM2YzZjNmMnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JIaW50LmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiBoaW50IHNxdWlnZ2xpZXMgaW4gdGhlIGVkaXRvci4nKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIaW50Qm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySGludC5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IENvbG9yLmZyb21IZXgoJyNlZWVlZWUnKS50cmFuc3BhcmVudCgwLjgpLCBoY0xpZ2h0OiAnIzI5MjkyOScgfSxcblx0bmxzLmxvY2FsaXplKCdoaW50Qm9yZGVyJywgJ0lmIHNldCwgY29sb3Igb2YgZG91YmxlIHVuZGVybGluZXMgZm9yIGhpbnRzIGluIHRoZSBlZGl0b3IuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JBY3RpdmVMaW5rRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckxpbmsuYWN0aXZlRm9yZWdyb3VuZCcsXG5cdHsgZGFyazogJyM0RTk0Q0UnLCBsaWdodDogQ29sb3IuYmx1ZSwgaGNEYXJrOiBDb2xvci5jeWFuLCBoY0xpZ2h0OiAnIzI5MjkyOScgfSxcblx0bmxzLmxvY2FsaXplKCdhY3RpdmVMaW5rRm9yZWdyb3VuZCcsICdDb2xvciBvZiBhY3RpdmUgbGlua3MuJykpO1xuXG5cbi8vIC0tLS0tIGVkaXRvciBzZWxlY3Rpb25cblxuZXhwb3J0IGNvbnN0IGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc2VsZWN0aW9uQmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjQURENkZGJywgZGFyazogJyMyNjRGNzgnLCBoY0Rhcms6ICcjZjNmNTE4JywgaGNMaWdodDogJyMwRjRBODUnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCcsIFwiQ29sb3Igb2YgdGhlIGVkaXRvciBzZWxlY3Rpb24uXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc2VsZWN0aW9uRm9yZWdyb3VuZCcsXG5cdHsgbGlnaHQ6IG51bGwsIGRhcms6IG51bGwsIGhjRGFyazogJyMwMDAwMDAnLCBoY0xpZ2h0OiBDb2xvci53aGl0ZSB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclNlbGVjdGlvbkZvcmVncm91bmQnLCBcIkNvbG9yIG9mIHRoZSBzZWxlY3RlZCB0ZXh0IGZvciBoaWdoIGNvbnRyYXN0LlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmFjdGl2ZVNlbGVjdGlvbiA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5pbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQnLFxuXHR7IGxpZ2h0OiB0cmFuc3BhcmVudChlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kLCAwLjUpLCBkYXJrOiB0cmFuc3BhcmVudChlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kLCAwLjUpLCBoY0Rhcms6IHRyYW5zcGFyZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIDAuNyksIGhjTGlnaHQ6IHRyYW5zcGFyZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIDAuNSkgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmFjdGl2ZVNlbGVjdGlvbicsIFwiQ29sb3Igb2YgdGhlIHNlbGVjdGlvbiBpbiBhbiBpbmFjdGl2ZSBlZGl0b3IuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy5cIiksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yU2VsZWN0aW9uSGlnaGxpZ2h0ID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHR7IGxpZ2h0OiBsZXNzUHJvbWluZW50KGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIGVkaXRvckJhY2tncm91bmQsIDAuMywgMC42KSwgZGFyazogbGVzc1Byb21pbmVudChlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kLCBlZGl0b3JCYWNrZ3JvdW5kLCAwLjMsIDAuNiksIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclNlbGVjdGlvbkhpZ2hsaWdodCcsICdDb2xvciBmb3IgcmVnaW9ucyB3aXRoIHRoZSBzYW1lIGNvbnRlbnQgYXMgdGhlIHNlbGVjdGlvbi4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvclNlbGVjdGlvbkhpZ2hsaWdodEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5zZWxlY3Rpb25IaWdobGlnaHRCb3JkZXInLFxuXHR7IGxpZ2h0OiBudWxsLCBkYXJrOiBudWxsLCBoY0Rhcms6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBhY3RpdmVDb250cmFzdEJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvclNlbGVjdGlvbkhpZ2hsaWdodEJvcmRlcicsIFwiQm9yZGVyIGNvbG9yIGZvciByZWdpb25zIHdpdGggdGhlIHNhbWUgY29udGVudCBhcyB0aGUgc2VsZWN0aW9uLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JDb21wb3NpdGlvbkJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5jb21wb3NpdGlvbkJvcmRlcicsXG5cdHsgbGlnaHQ6ICcjMDAwMDAwJywgZGFyazogJyNmZmZmZmYnLCBoY0xpZ2h0OiAnIzAwMDAwMCcsIGhjRGFyazogJyNmZmZmZmYnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9yQ29tcG9zaXRpb25Cb3JkZXInLCBcIlRoZSBib3JkZXIgY29sb3IgZm9yIGFuIElNRSBjb21wb3NpdGlvbi5cIikpO1xuXG5cbi8vIC0tLS0tIGVkaXRvciBmaW5kXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGaW5kTWF0Y2ggPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZmluZE1hdGNoQmFja2dyb3VuZCcsXG5cdHsgbGlnaHQ6ICcjQThBQzk0JywgZGFyazogJyM1MTVDNkEnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JGaW5kTWF0Y2gnLCBcIkNvbG9yIG9mIHRoZSBjdXJyZW50IHNlYXJjaCBtYXRjaC5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZE1hdGNoRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kTWF0Y2hGb3JlZ3JvdW5kJyxcblx0bnVsbCxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JGaW5kTWF0Y2hGb3JlZ3JvdW5kJywgXCJUZXh0IGNvbG9yIG9mIHRoZSBjdXJyZW50IHNlYXJjaCBtYXRjaC5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0ID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZpbmRNYXRjaEhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHR7IGxpZ2h0OiAnI0VBNUMwMDU1JywgZGFyazogJyNFQTVDMDA1NScsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2ZpbmRNYXRjaEhpZ2hsaWdodCcsIFwiQ29sb3Igb2YgdGhlIG90aGVyIHNlYXJjaCBtYXRjaGVzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuXCIpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZpbmRNYXRjaEhpZ2hsaWdodEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZCcsXG5cdG51bGwsXG5cdG5scy5sb2NhbGl6ZSgnZmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZCcsIFwiRm9yZWdyb3VuZCBjb2xvciBvZiB0aGUgb3RoZXIgc2VhcmNoIG1hdGNoZXMuXCIpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZpbmRSYW5nZUhpZ2hsaWdodCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kUmFuZ2VIaWdobGlnaHRCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzNhM2Q0MTY2JywgbGlnaHQ6ICcjYjRiNGI0NGQnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdmaW5kUmFuZ2VIaWdobGlnaHQnLCBcIkNvbG9yIG9mIHRoZSByYW5nZSBsaW1pdGluZyB0aGUgc2VhcmNoLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuXCIpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckZpbmRNYXRjaEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5maW5kTWF0Y2hCb3JkZXInLFxuXHR7IGxpZ2h0OiBudWxsLCBkYXJrOiBudWxsLCBoY0Rhcms6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBhY3RpdmVDb250cmFzdEJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckZpbmRNYXRjaEJvcmRlcicsIFwiQm9yZGVyIGNvbG9yIG9mIHRoZSBjdXJyZW50IHNlYXJjaCBtYXRjaC5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmZpbmRNYXRjaEhpZ2hsaWdodEJvcmRlcicsXG5cdHsgbGlnaHQ6IG51bGwsIGRhcms6IG51bGwsIGhjRGFyazogYWN0aXZlQ29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyJywgXCJCb3JkZXIgY29sb3Igb2YgdGhlIG90aGVyIHNlYXJjaCBtYXRjaGVzLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JGaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuZmluZFJhbmdlSGlnaGxpZ2h0Qm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiB0cmFuc3BhcmVudChhY3RpdmVDb250cmFzdEJvcmRlciwgMC40KSwgaGNMaWdodDogdHJhbnNwYXJlbnQoYWN0aXZlQ29udHJhc3RCb3JkZXIsIDAuNCkgfSxcblx0bmxzLmxvY2FsaXplKCdmaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXInLCBcIkJvcmRlciBjb2xvciBvZiB0aGUgcmFuZ2UgbGltaXRpbmcgdGhlIHNlYXJjaC4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLlwiKSwgdHJ1ZSk7XG5cblxuLy8gLS0tLS0gZWRpdG9yIGhvdmVyXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIb3ZlckhpZ2hsaWdodCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5ob3ZlckhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHR7IGxpZ2h0OiAnI0FERDZGRjI2JywgZGFyazogJyMyNjRmNzg0MCcsIGhjRGFyazogJyNBREQ2RkYyNicsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdob3ZlckhpZ2hsaWdodCcsICdIaWdobGlnaHQgYmVsb3cgdGhlIHdvcmQgZm9yIHdoaWNoIGEgaG92ZXIgaXMgc2hvd24uIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JIb3ZlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JIb3ZlcldpZGdldC5iYWNrZ3JvdW5kJyxcblx0ZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdob3ZlckJhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciBvZiB0aGUgZWRpdG9yIGhvdmVyLicpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckhvdmVyRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckhvdmVyV2lkZ2V0LmZvcmVncm91bmQnLFxuXHRlZGl0b3JXaWRnZXRGb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2hvdmVyRm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIHRoZSBlZGl0b3IgaG92ZXIuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySG92ZXJCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JIb3ZlcldpZGdldC5ib3JkZXInLFxuXHRlZGl0b3JXaWRnZXRCb3JkZXIsXG5cdG5scy5sb2NhbGl6ZSgnaG92ZXJCb3JkZXInLCAnQm9yZGVyIGNvbG9yIG9mIHRoZSBlZGl0b3IgaG92ZXIuJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySG92ZXJTdGF0dXNCYXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9ySG92ZXJXaWRnZXQuc3RhdHVzQmFyQmFja2dyb3VuZCcsXG5cdHsgZGFyazogbGlnaHRlbihlZGl0b3JIb3ZlckJhY2tncm91bmQsIDAuMiksIGxpZ2h0OiBkYXJrZW4oZWRpdG9ySG92ZXJCYWNrZ3JvdW5kLCAwLjA1KSwgaGNEYXJrOiBlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kLCBoY0xpZ2h0OiBlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kIH0sXG5cdG5scy5sb2NhbGl6ZSgnc3RhdHVzQmFyQmFja2dyb3VuZCcsIFwiQmFja2dyb3VuZCBjb2xvciBvZiB0aGUgZWRpdG9yIGhvdmVyIHN0YXR1cyBiYXIuXCIpKTtcblxuXG4vLyAtLS0tLSBlZGl0b3IgaW5sYXkgaGludFxuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5sYXlIaW50Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC5mb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzk2OTY5NicsIGxpZ2h0OiAnIzk2OTY5NicsIGhjRGFyazogQ29sb3Iud2hpdGUsIGhjTGlnaHQ6IENvbG9yLmJsYWNrIH0sXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5sYXlIaW50Rm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIGlubGluZSBoaW50cycpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcklubGF5SGludEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JJbmxheUhpbnQuYmFja2dyb3VuZCcsXG5cdHsgZGFyazogdHJhbnNwYXJlbnQoYmFkZ2VCYWNrZ3JvdW5kLCAuMTApLCBsaWdodDogdHJhbnNwYXJlbnQoYmFkZ2VCYWNrZ3JvdW5kLCAuMTApLCBoY0Rhcms6IHRyYW5zcGFyZW50KENvbG9yLndoaXRlLCAuMTApLCBoY0xpZ2h0OiB0cmFuc3BhcmVudChiYWRnZUJhY2tncm91bmQsIC4xMCkgfSxcblx0bmxzLmxvY2FsaXplKCdlZGl0b3JJbmxheUhpbnRCYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzJykpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9ySW5sYXlIaW50VHlwZUZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JJbmxheUhpbnQudHlwZUZvcmVncm91bmQnLFxuXHRlZGl0b3JJbmxheUhpbnRGb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvcklubGF5SGludEZvcmVncm91bmRUeXBlcycsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIGlubGluZSBoaW50cyBmb3IgdHlwZXMnKSk7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JJbmxheUhpbnRUeXBlQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvcklubGF5SGludC50eXBlQmFja2dyb3VuZCcsXG5cdGVkaXRvcklubGF5SGludEJhY2tncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZFR5cGVzJywgJ0JhY2tncm91bmQgY29sb3Igb2YgaW5saW5lIGhpbnRzIGZvciB0eXBlcycpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcklubGF5SGludFBhcmFtZXRlckZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JJbmxheUhpbnQucGFyYW1ldGVyRm9yZWdyb3VuZCcsXG5cdGVkaXRvcklubGF5SGludEZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5sYXlIaW50Rm9yZWdyb3VuZFBhcmFtZXRlcicsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIGlubGluZSBoaW50cyBmb3IgcGFyYW1ldGVycycpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvcklubGF5SGludFBhcmFtZXRlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JJbmxheUhpbnQucGFyYW1ldGVyQmFja2dyb3VuZCcsXG5cdGVkaXRvcklubGF5SGludEJhY2tncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnZWRpdG9ySW5sYXlIaW50QmFja2dyb3VuZFBhcmFtZXRlcicsICdCYWNrZ3JvdW5kIGNvbG9yIG9mIGlubGluZSBoaW50cyBmb3IgcGFyYW1ldGVycycpKTtcblxuXG4vLyAtLS0tLSBlZGl0b3IgbGlnaHRidWxiXG5cbmV4cG9ydCBjb25zdCBlZGl0b3JMaWdodEJ1bGJGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTGlnaHRCdWxiLmZvcmVncm91bmQnLFxuXHR7IGRhcms6ICcjRkZDQzAwJywgbGlnaHQ6ICcjRERCMTAwJywgaGNEYXJrOiAnI0ZGQ0MwMCcsIGhjTGlnaHQ6ICcjMDA3QUNDJyB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckxpZ2h0QnVsYkZvcmVncm91bmQnLCBcIlRoZSBjb2xvciB1c2VkIGZvciB0aGUgbGlnaHRidWxiIGFjdGlvbnMgaWNvbi5cIikpO1xuXG5leHBvcnQgY29uc3QgZWRpdG9yTGlnaHRCdWxiQXV0b0ZpeEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JMaWdodEJ1bGJBdXRvRml4LmZvcmVncm91bmQnLFxuXHR7IGRhcms6ICcjNzVCRUZGJywgbGlnaHQ6ICcjMDA3QUNDJywgaGNEYXJrOiAnIzc1QkVGRicsIGhjTGlnaHQ6ICcjMDA3QUNDJyB9LFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckxpZ2h0QnVsYkF1dG9GaXhGb3JlZ3JvdW5kJywgXCJUaGUgY29sb3IgdXNlZCBmb3IgdGhlIGxpZ2h0YnVsYiBhdXRvIGZpeCBhY3Rpb25zIGljb24uXCIpKTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckxpZ2h0QnVsYkFpRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvckxpZ2h0QnVsYkFpLmZvcmVncm91bmQnLFxuXHRlZGl0b3JMaWdodEJ1bGJGb3JlZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2VkaXRvckxpZ2h0QnVsYkFpRm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIHVzZWQgZm9yIHRoZSBsaWdodGJ1bGIgQUkgaWNvbi5cIikpO1xuXG5cbi8vIC0tLS0tIGVkaXRvciBzbmlwcGV0XG5cbmV4cG9ydCBjb25zdCBzbmlwcGV0VGFic3RvcEhpZ2hsaWdodEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc25pcHBldFRhYnN0b3BIaWdobGlnaHRCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBuZXcgQ29sb3IobmV3IFJHQkEoMTI0LCAxMjQsIDEyNCwgMC4zKSksIGxpZ2h0OiBuZXcgQ29sb3IobmV3IFJHQkEoMTAsIDUwLCAxMDAsIDAuMikpLCBoY0Rhcms6IG5ldyBDb2xvcihuZXcgUkdCQSgxMjQsIDEyNCwgMTI0LCAwLjMpKSwgaGNMaWdodDogbmV3IENvbG9yKG5ldyBSR0JBKDEwLCA1MCwgMTAwLCAwLjIpKSB9LFxuXHRubHMubG9jYWxpemUoJ3NuaXBwZXRUYWJzdG9wSGlnaGxpZ2h0QmFja2dyb3VuZCcsIFwiSGlnaGxpZ2h0IGJhY2tncm91bmQgY29sb3Igb2YgYSBzbmlwcGV0IHRhYnN0b3AuXCIpKTtcblxuZXhwb3J0IGNvbnN0IHNuaXBwZXRUYWJzdG9wSGlnaGxpZ2h0Qm9yZGVyID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLnNuaXBwZXRUYWJzdG9wSGlnaGxpZ2h0Qm9yZGVyJyxcblx0bnVsbCxcblx0bmxzLmxvY2FsaXplKCdzbmlwcGV0VGFic3RvcEhpZ2hsaWdodEJvcmRlcicsIFwiSGlnaGxpZ2h0IGJvcmRlciBjb2xvciBvZiBhIHNuaXBwZXQgdGFic3RvcC5cIikpO1xuXG5leHBvcnQgY29uc3Qgc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJhY2tncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ3NuaXBwZXRGaW5hbFRhYnN0b3BIaWdobGlnaHRCYWNrZ3JvdW5kJywgXCJIaWdobGlnaHQgYmFja2dyb3VuZCBjb2xvciBvZiB0aGUgZmluYWwgdGFic3RvcCBvZiBhIHNuaXBwZXQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IHNuaXBwZXRGaW5hbFRhYnN0b3BIaWdobGlnaHRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3Iuc25pcHBldEZpbmFsVGFic3RvcEhpZ2hsaWdodEJvcmRlcicsXG5cdHsgZGFyazogJyM1MjUyNTInLCBsaWdodDogbmV3IENvbG9yKG5ldyBSR0JBKDEwLCA1MCwgMTAwLCAwLjUpKSwgaGNEYXJrOiAnIzUyNTI1MicsIGhjTGlnaHQ6ICcjMjkyOTI5JyB9LFxuXHRubHMubG9jYWxpemUoJ3NuaXBwZXRGaW5hbFRhYnN0b3BIaWdobGlnaHRCb3JkZXInLCBcIkhpZ2hsaWdodCBib3JkZXIgY29sb3Igb2YgdGhlIGZpbmFsIHRhYnN0b3Agb2YgYSBzbmlwcGV0LlwiKSk7XG5cblxuLy8gLS0tLS0gZGlmZiBlZGl0b3JcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRJbnNlcnRDb2xvciA9IG5ldyBDb2xvcihuZXcgUkdCQSgxNTUsIDE4NSwgODUsIC4yKSk7XG5leHBvcnQgY29uc3QgZGVmYXVsdFJlbW92ZUNvbG9yID0gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMCwgMCwgLjIpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZJbnNlcnRlZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IuaW5zZXJ0ZWRUZXh0QmFja2dyb3VuZCcsXG5cdHsgZGFyazogJyM5Y2NjMmMzMycsIGxpZ2h0OiAnIzljY2MyYzQwJywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvckluc2VydGVkJywgJ0JhY2tncm91bmQgY29sb3IgZm9yIHRleHQgdGhhdCBnb3QgaW5zZXJ0ZWQuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmUmVtb3ZlZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IucmVtb3ZlZFRleHRCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnI2ZmMDAwMDMzJywgbGlnaHQ6ICcjZmYwMDAwMzMnLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yUmVtb3ZlZCcsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciB0ZXh0IHRoYXQgZ290IHJlbW92ZWQuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cblxuZXhwb3J0IGNvbnN0IGRpZmZJbnNlcnRlZExpbmUgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLmluc2VydGVkTGluZUJhY2tncm91bmQnLFxuXHR7IGRhcms6IGRlZmF1bHRJbnNlcnRDb2xvciwgbGlnaHQ6IGRlZmF1bHRJbnNlcnRDb2xvciwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvckluc2VydGVkTGluZXMnLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgbGluZXMgdGhhdCBnb3QgaW5zZXJ0ZWQuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmUmVtb3ZlZExpbmUgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLnJlbW92ZWRMaW5lQmFja2dyb3VuZCcsXG5cdHsgZGFyazogZGVmYXVsdFJlbW92ZUNvbG9yLCBsaWdodDogZGVmYXVsdFJlbW92ZUNvbG9yLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yUmVtb3ZlZExpbmVzJywgJ0JhY2tncm91bmQgY29sb3IgZm9yIGxpbmVzIHRoYXQgZ290IHJlbW92ZWQuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cblxuZXhwb3J0IGNvbnN0IGRpZmZJbnNlcnRlZExpbmVHdXR0ZXIgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yR3V0dGVyLmluc2VydGVkTGluZUJhY2tncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JJbnNlcnRlZExpbmVHdXR0ZXInLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgdGhlIG1hcmdpbiB3aGVyZSBsaW5lcyBnb3QgaW5zZXJ0ZWQuJykpO1xuXG5leHBvcnQgY29uc3QgZGlmZlJlbW92ZWRMaW5lR3V0dGVyID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvckd1dHRlci5yZW1vdmVkTGluZUJhY2tncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JSZW1vdmVkTGluZUd1dHRlcicsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgbWFyZ2luIHdoZXJlIGxpbmVzIGdvdCByZW1vdmVkLicpKTtcblxuXG5leHBvcnQgY29uc3QgZGlmZk92ZXJ2aWV3UnVsZXJJbnNlcnRlZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3JPdmVydmlldy5pbnNlcnRlZEZvcmVncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JPdmVydmlld0luc2VydGVkJywgJ0RpZmYgb3ZlcnZpZXcgcnVsZXIgZm9yZWdyb3VuZCBmb3IgaW5zZXJ0ZWQgY29udGVudC4nKSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmT3ZlcnZpZXdSdWxlclJlbW92ZWQgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yT3ZlcnZpZXcucmVtb3ZlZEZvcmVncm91bmQnLFxuXHRudWxsLFxuXHRubHMubG9jYWxpemUoJ2RpZmZFZGl0b3JPdmVydmlld1JlbW92ZWQnLCAnRGlmZiBvdmVydmlldyBydWxlciBmb3JlZ3JvdW5kIGZvciByZW1vdmVkIGNvbnRlbnQuJykpO1xuXG5cbmV4cG9ydCBjb25zdCBkaWZmSW5zZXJ0ZWRPdXRsaW5lID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci5pbnNlcnRlZFRleHRCb3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6ICcjMzNmZjJlZmYnLCBoY0xpZ2h0OiAnIzM3NEUwNicgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9ySW5zZXJ0ZWRPdXRsaW5lJywgJ091dGxpbmUgY29sb3IgZm9yIHRoZSB0ZXh0IHRoYXQgZ290IGluc2VydGVkLicpKTtcblxuZXhwb3J0IGNvbnN0IGRpZmZSZW1vdmVkT3V0bGluZSA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IucmVtb3ZlZFRleHRCb3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6ICcjRkYwMDhGJywgaGNMaWdodDogJyNBRDA3MDcnIH0sXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvclJlbW92ZWRPdXRsaW5lJywgJ091dGxpbmUgY29sb3IgZm9yIHRleHQgdGhhdCBnb3QgcmVtb3ZlZC4nKSk7XG5cblxuZXhwb3J0IGNvbnN0IGRpZmZCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLmJvcmRlcicsXG5cdHsgZGFyazogbnVsbCwgbGlnaHQ6IG51bGwsIGhjRGFyazogY29udHJhc3RCb3JkZXIsIGhjTGlnaHQ6IGNvbnRyYXN0Qm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnZGlmZkVkaXRvckJvcmRlcicsICdCb3JkZXIgY29sb3IgYmV0d2VlbiB0aGUgdHdvIHRleHQgZWRpdG9ycy4nKSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmRGlhZ29uYWxGaWxsID0gcmVnaXN0ZXJDb2xvcignZGlmZkVkaXRvci5kaWFnb25hbEZpbGwnLFxuXHR7IGRhcms6ICcjY2NjY2NjMzMnLCBsaWdodDogJyMyMjIyMjIzMycsIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ2RpZmZEaWFnb25hbEZpbGwnLCBcIkNvbG9yIG9mIHRoZSBkaWZmIGVkaXRvcidzIGRpYWdvbmFsIGZpbGwuIFRoZSBkaWFnb25hbCBmaWxsIGlzIHVzZWQgaW4gc2lkZS1ieS1zaWRlIGRpZmYgdmlld3MuXCIpKTtcblxuXG5leHBvcnQgY29uc3QgZGlmZlVuY2hhbmdlZFJlZ2lvbkJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLnVuY2hhbmdlZFJlZ2lvbkJhY2tncm91bmQnLFxuXHQnc2lkZUJhci5iYWNrZ3JvdW5kJyxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yLnVuY2hhbmdlZFJlZ2lvbkJhY2tncm91bmQnLCBcIlRoZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIHVuY2hhbmdlZCBibG9ja3MgaW4gdGhlIGRpZmYgZWRpdG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmVW5jaGFuZ2VkUmVnaW9uRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RpZmZFZGl0b3IudW5jaGFuZ2VkUmVnaW9uRm9yZWdyb3VuZCcsXG5cdCdmb3JlZ3JvdW5kJyxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yLnVuY2hhbmdlZFJlZ2lvbkZvcmVncm91bmQnLCBcIlRoZSBmb3JlZ3JvdW5kIGNvbG9yIG9mIHVuY2hhbmdlZCBibG9ja3MgaW4gdGhlIGRpZmYgZWRpdG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBkaWZmVW5jaGFuZ2VkVGV4dEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdkaWZmRWRpdG9yLnVuY2hhbmdlZENvZGVCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiAnIzc0NzQ3NDI5JywgbGlnaHQ6ICcjYjhiOGI4MjknLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdkaWZmRWRpdG9yLnVuY2hhbmdlZENvZGVCYWNrZ3JvdW5kJywgXCJUaGUgYmFja2dyb3VuZCBjb2xvciBvZiB1bmNoYW5nZWQgY29kZSBpbiB0aGUgZGlmZiBlZGl0b3IuXCIpKTtcblxuXG4vLyAtLS0tLSB3aWRnZXRcblxuZXhwb3J0IGNvbnN0IHdpZGdldFNoYWRvdyA9IHJlZ2lzdGVyQ29sb3IoJ3dpZGdldC5zaGFkb3cnLFxuXHR7IGRhcms6IHRyYW5zcGFyZW50KENvbG9yLmJsYWNrLCAuMzYpLCBsaWdodDogdHJhbnNwYXJlbnQoQ29sb3IuYmxhY2ssIC4xNiksIGhjRGFyazogbnVsbCwgaGNMaWdodDogbnVsbCB9LFxuXHRubHMubG9jYWxpemUoJ3dpZGdldFNoYWRvdycsICdTaGFkb3cgY29sb3Igb2Ygd2lkZ2V0cyBzdWNoIGFzIGZpbmQvcmVwbGFjZSBpbnNpZGUgdGhlIGVkaXRvci4nKSk7XG5cbmV4cG9ydCBjb25zdCB3aWRnZXRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCd3aWRnZXQuYm9yZGVyJyxcblx0eyBkYXJrOiBudWxsLCBsaWdodDogbnVsbCwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCd3aWRnZXRCb3JkZXInLCAnQm9yZGVyIGNvbG9yIG9mIHdpZGdldHMgc3VjaCBhcyBmaW5kL3JlcGxhY2UgaW5zaWRlIHRoZSBlZGl0b3IuJykpO1xuXG5cbi8vIC0tLS0tIHRvb2xiYXJcblxuZXhwb3J0IGNvbnN0IHRvb2xiYXJIb3ZlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCd0b29sYmFyLmhvdmVyQmFja2dyb3VuZCcsXG5cdHsgZGFyazogJyM1YTVkNWU1MCcsIGxpZ2h0OiAnI2I4YjhiODUwJywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgndG9vbGJhckhvdmVyQmFja2dyb3VuZCcsIFwiVG9vbGJhciBiYWNrZ3JvdW5kIHdoZW4gaG92ZXJpbmcgb3ZlciBhY3Rpb25zIHVzaW5nIHRoZSBtb3VzZVwiKSk7XG5cbmV4cG9ydCBjb25zdCB0b29sYmFySG92ZXJPdXRsaW5lID0gcmVnaXN0ZXJDb2xvcigndG9vbGJhci5ob3Zlck91dGxpbmUnLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBhY3RpdmVDb250cmFzdEJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ3Rvb2xiYXJIb3Zlck91dGxpbmUnLCBcIlRvb2xiYXIgb3V0bGluZSB3aGVuIGhvdmVyaW5nIG92ZXIgYWN0aW9ucyB1c2luZyB0aGUgbW91c2VcIikpO1xuXG5leHBvcnQgY29uc3QgdG9vbGJhckFjdGl2ZUJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCd0b29sYmFyLmFjdGl2ZUJhY2tncm91bmQnLFxuXHR7IGRhcms6IGxpZ2h0ZW4odG9vbGJhckhvdmVyQmFja2dyb3VuZCwgMC4xKSwgbGlnaHQ6IGRhcmtlbih0b29sYmFySG92ZXJCYWNrZ3JvdW5kLCAwLjEpLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCd0b29sYmFyQWN0aXZlQmFja2dyb3VuZCcsIFwiVG9vbGJhciBiYWNrZ3JvdW5kIHdoZW4gaG9sZGluZyB0aGUgbW91c2Ugb3ZlciBhY3Rpb25zXCIpKTtcblxuXG4vLyAtLS0tLSBicmVhZGN1bWJzXG5cbmV4cG9ydCBjb25zdCBicmVhZGNydW1ic0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdicmVhZGNydW1iLmZvcmVncm91bmQnLFxuXHR0cmFuc3BhcmVudChmb3JlZ3JvdW5kLCAwLjgpLFxuXHRubHMubG9jYWxpemUoJ2JyZWFkY3J1bWJzRm9jdXNGb3JlZ3JvdW5kJywgXCJDb2xvciBvZiBmb2N1c2VkIGJyZWFkY3J1bWIgaXRlbXMuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGJyZWFkY3J1bWJzQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2JyZWFkY3J1bWIuYmFja2dyb3VuZCcsXG5cdGVkaXRvckJhY2tncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgnYnJlYWRjcnVtYnNCYWNrZ3JvdW5kJywgXCJCYWNrZ3JvdW5kIGNvbG9yIG9mIGJyZWFkY3J1bWIgaXRlbXMuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGJyZWFkY3J1bWJzRm9jdXNGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignYnJlYWRjcnVtYi5mb2N1c0ZvcmVncm91bmQnLFxuXHR7IGxpZ2h0OiBkYXJrZW4oZm9yZWdyb3VuZCwgMC4yKSwgZGFyazogbGlnaHRlbihmb3JlZ3JvdW5kLCAwLjEpLCBoY0Rhcms6IGxpZ2h0ZW4oZm9yZWdyb3VuZCwgMC4xKSwgaGNMaWdodDogbGlnaHRlbihmb3JlZ3JvdW5kLCAwLjEpIH0sXG5cdG5scy5sb2NhbGl6ZSgnYnJlYWRjcnVtYnNGb2N1c0ZvcmVncm91bmQnLCBcIkNvbG9yIG9mIGZvY3VzZWQgYnJlYWRjcnVtYiBpdGVtcy5cIikpO1xuXG5leHBvcnQgY29uc3QgYnJlYWRjcnVtYnNBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignYnJlYWRjcnVtYi5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kJyxcblx0eyBsaWdodDogZGFya2VuKGZvcmVncm91bmQsIDAuMiksIGRhcms6IGxpZ2h0ZW4oZm9yZWdyb3VuZCwgMC4xKSwgaGNEYXJrOiBsaWdodGVuKGZvcmVncm91bmQsIDAuMSksIGhjTGlnaHQ6IGxpZ2h0ZW4oZm9yZWdyb3VuZCwgMC4xKSB9LFxuXHRubHMubG9jYWxpemUoJ2JyZWFkY3J1bWJzU2VsZWN0ZWRGb3JlZ3JvdW5kJywgXCJDb2xvciBvZiBzZWxlY3RlZCBicmVhZGNydW1iIGl0ZW1zLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBicmVhZGNydW1ic1BpY2tlckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdicmVhZGNydW1iUGlja2VyLmJhY2tncm91bmQnLFxuXHRlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kLFxuXHRubHMubG9jYWxpemUoJ2JyZWFkY3J1bWJzU2VsZWN0ZWRCYWNrZ3JvdW5kJywgXCJCYWNrZ3JvdW5kIGNvbG9yIG9mIGJyZWFkY3J1bWIgaXRlbSBwaWNrZXIuXCIpKTtcblxuXG4vLyAtLS0tLSBtZXJnZVxuXG5jb25zdCBoZWFkZXJUcmFuc3BhcmVuY3kgPSAwLjU7XG5jb25zdCBjdXJyZW50QmFzZUNvbG9yID0gQ29sb3IuZnJvbUhleCgnIzQwQzhBRScpLnRyYW5zcGFyZW50KGhlYWRlclRyYW5zcGFyZW5jeSk7XG5jb25zdCBpbmNvbWluZ0Jhc2VDb2xvciA9IENvbG9yLmZyb21IZXgoJyM0MEE2RkYnKS50cmFuc3BhcmVudChoZWFkZXJUcmFuc3BhcmVuY3kpO1xuY29uc3QgY29tbW9uQmFzZUNvbG9yID0gQ29sb3IuZnJvbUhleCgnIzYwNjA2MCcpLnRyYW5zcGFyZW50KDAuNCk7XG5jb25zdCBjb250ZW50VHJhbnNwYXJlbmN5ID0gMC40O1xuY29uc3QgcnVsZXJUcmFuc3BhcmVuY3kgPSAxO1xuXG5leHBvcnQgY29uc3QgbWVyZ2VDdXJyZW50SGVhZGVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ21lcmdlLmN1cnJlbnRIZWFkZXJCYWNrZ3JvdW5kJyxcblx0eyBkYXJrOiBjdXJyZW50QmFzZUNvbG9yLCBsaWdodDogY3VycmVudEJhc2VDb2xvciwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VDdXJyZW50SGVhZGVyQmFja2dyb3VuZCcsICdDdXJyZW50IGhlYWRlciBiYWNrZ3JvdW5kIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUN1cnJlbnRDb250ZW50QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ21lcmdlLmN1cnJlbnRDb250ZW50QmFja2dyb3VuZCcsXG5cdHRyYW5zcGFyZW50KG1lcmdlQ3VycmVudEhlYWRlckJhY2tncm91bmQsIGNvbnRlbnRUcmFuc3BhcmVuY3kpLFxuXHRubHMubG9jYWxpemUoJ21lcmdlQ3VycmVudENvbnRlbnRCYWNrZ3JvdW5kJywgJ0N1cnJlbnQgY29udGVudCBiYWNrZ3JvdW5kIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUluY29taW5nSGVhZGVyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ21lcmdlLmluY29taW5nSGVhZGVyQmFja2dyb3VuZCcsXG5cdHsgZGFyazogaW5jb21pbmdCYXNlQ29sb3IsIGxpZ2h0OiBpbmNvbWluZ0Jhc2VDb2xvciwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VJbmNvbWluZ0hlYWRlckJhY2tncm91bmQnLCAnSW5jb21pbmcgaGVhZGVyIGJhY2tncm91bmQgaW4gaW5saW5lIG1lcmdlLWNvbmZsaWN0cy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IG1lcmdlSW5jb21pbmdDb250ZW50QmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ21lcmdlLmluY29taW5nQ29udGVudEJhY2tncm91bmQnLFxuXHR0cmFuc3BhcmVudChtZXJnZUluY29taW5nSGVhZGVyQmFja2dyb3VuZCwgY29udGVudFRyYW5zcGFyZW5jeSksXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VJbmNvbWluZ0NvbnRlbnRCYWNrZ3JvdW5kJywgJ0luY29taW5nIGNvbnRlbnQgYmFja2dyb3VuZCBpbiBpbmxpbmUgbWVyZ2UtY29uZmxpY3RzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgbWVyZ2VDb21tb25IZWFkZXJCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuY29tbW9uSGVhZGVyQmFja2dyb3VuZCcsXG5cdHsgZGFyazogY29tbW9uQmFzZUNvbG9yLCBsaWdodDogY29tbW9uQmFzZUNvbG9yLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSxcblx0bmxzLmxvY2FsaXplKCdtZXJnZUNvbW1vbkhlYWRlckJhY2tncm91bmQnLCAnQ29tbW9uIGFuY2VzdG9yIGhlYWRlciBiYWNrZ3JvdW5kIGluIGlubGluZSBtZXJnZS1jb25mbGljdHMuIFRoZSBjb2xvciBtdXN0IG5vdCBiZSBvcGFxdWUgc28gYXMgbm90IHRvIGhpZGUgdW5kZXJseWluZyBkZWNvcmF0aW9ucy4nKSwgdHJ1ZSk7XG5cbmV4cG9ydCBjb25zdCBtZXJnZUNvbW1vbkNvbnRlbnRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignbWVyZ2UuY29tbW9uQ29udGVudEJhY2tncm91bmQnLFxuXHR0cmFuc3BhcmVudChtZXJnZUNvbW1vbkhlYWRlckJhY2tncm91bmQsIGNvbnRlbnRUcmFuc3BhcmVuY3kpLFxuXHRubHMubG9jYWxpemUoJ21lcmdlQ29tbW9uQ29udGVudEJhY2tncm91bmQnLCAnQ29tbW9uIGFuY2VzdG9yIGNvbnRlbnQgYmFja2dyb3VuZCBpbiBpbmxpbmUgbWVyZ2UtY29uZmxpY3RzLiBUaGUgY29sb3IgbXVzdCBub3QgYmUgb3BhcXVlIHNvIGFzIG5vdCB0byBoaWRlIHVuZGVybHlpbmcgZGVjb3JhdGlvbnMuJyksIHRydWUpO1xuXG5leHBvcnQgY29uc3QgbWVyZ2VCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdtZXJnZS5ib3JkZXInLFxuXHR7IGRhcms6IG51bGwsIGxpZ2h0OiBudWxsLCBoY0Rhcms6ICcjQzNERjZGJywgaGNMaWdodDogJyMwMDdBQ0MnIH0sXG5cdG5scy5sb2NhbGl6ZSgnbWVyZ2VCb3JkZXInLCAnQm9yZGVyIGNvbG9yIG9uIGhlYWRlcnMgYW5kIHRoZSBzcGxpdHRlciBpbiBpbmxpbmUgbWVyZ2UtY29uZmxpY3RzLicpKTtcblxuXG5leHBvcnQgY29uc3Qgb3ZlcnZpZXdSdWxlckN1cnJlbnRDb250ZW50Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck92ZXJ2aWV3UnVsZXIuY3VycmVudENvbnRlbnRGb3JlZ3JvdW5kJyxcblx0eyBkYXJrOiB0cmFuc3BhcmVudChtZXJnZUN1cnJlbnRIZWFkZXJCYWNrZ3JvdW5kLCBydWxlclRyYW5zcGFyZW5jeSksIGxpZ2h0OiB0cmFuc3BhcmVudChtZXJnZUN1cnJlbnRIZWFkZXJCYWNrZ3JvdW5kLCBydWxlclRyYW5zcGFyZW5jeSksIGhjRGFyazogbWVyZ2VCb3JkZXIsIGhjTGlnaHQ6IG1lcmdlQm9yZGVyIH0sXG5cdG5scy5sb2NhbGl6ZSgnb3ZlcnZpZXdSdWxlckN1cnJlbnRDb250ZW50Rm9yZWdyb3VuZCcsICdDdXJyZW50IG92ZXJ2aWV3IHJ1bGVyIGZvcmVncm91bmQgZm9yIGlubGluZSBtZXJnZS1jb25mbGljdHMuJykpO1xuXG5leHBvcnQgY29uc3Qgb3ZlcnZpZXdSdWxlckluY29taW5nQ29udGVudEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JPdmVydmlld1J1bGVyLmluY29taW5nQ29udGVudEZvcmVncm91bmQnLFxuXHR7IGRhcms6IHRyYW5zcGFyZW50KG1lcmdlSW5jb21pbmdIZWFkZXJCYWNrZ3JvdW5kLCBydWxlclRyYW5zcGFyZW5jeSksIGxpZ2h0OiB0cmFuc3BhcmVudChtZXJnZUluY29taW5nSGVhZGVyQmFja2dyb3VuZCwgcnVsZXJUcmFuc3BhcmVuY3kpLCBoY0Rhcms6IG1lcmdlQm9yZGVyLCBoY0xpZ2h0OiBtZXJnZUJvcmRlciB9LFxuXHRubHMubG9jYWxpemUoJ292ZXJ2aWV3UnVsZXJJbmNvbWluZ0NvbnRlbnRGb3JlZ3JvdW5kJywgJ0luY29taW5nIG92ZXJ2aWV3IHJ1bGVyIGZvcmVncm91bmQgZm9yIGlubGluZSBtZXJnZS1jb25mbGljdHMuJykpO1xuXG5leHBvcnQgY29uc3Qgb3ZlcnZpZXdSdWxlckNvbW1vbkNvbnRlbnRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yT3ZlcnZpZXdSdWxlci5jb21tb25Db250ZW50Rm9yZWdyb3VuZCcsXG5cdHsgZGFyazogdHJhbnNwYXJlbnQobWVyZ2VDb21tb25IZWFkZXJCYWNrZ3JvdW5kLCBydWxlclRyYW5zcGFyZW5jeSksIGxpZ2h0OiB0cmFuc3BhcmVudChtZXJnZUNvbW1vbkhlYWRlckJhY2tncm91bmQsIHJ1bGVyVHJhbnNwYXJlbmN5KSwgaGNEYXJrOiBtZXJnZUJvcmRlciwgaGNMaWdodDogbWVyZ2VCb3JkZXIgfSxcblx0bmxzLmxvY2FsaXplKCdvdmVydmlld1J1bGVyQ29tbW9uQ29udGVudEZvcmVncm91bmQnLCAnQ29tbW9uIGFuY2VzdG9yIG92ZXJ2aWV3IHJ1bGVyIGZvcmVncm91bmQgZm9yIGlubGluZSBtZXJnZS1jb25mbGljdHMuJykpO1xuXG5leHBvcnQgY29uc3Qgb3ZlcnZpZXdSdWxlckZpbmRNYXRjaEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JPdmVydmlld1J1bGVyLmZpbmRNYXRjaEZvcmVncm91bmQnLFxuXHR7IGRhcms6ICcjZDE4NjE2N2UnLCBsaWdodDogJyNkMTg2MTY3ZScsIGhjRGFyazogJyNBQjVBMDAnLCBoY0xpZ2h0OiAnI0FCNUEwMCcgfSxcblx0bmxzLmxvY2FsaXplKCdvdmVydmlld1J1bGVyRmluZE1hdGNoRm9yZWdyb3VuZCcsICdPdmVydmlldyBydWxlciBtYXJrZXIgY29sb3IgZm9yIGZpbmQgbWF0Y2hlcy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuZXhwb3J0IGNvbnN0IG92ZXJ2aWV3UnVsZXJTZWxlY3Rpb25IaWdobGlnaHRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yT3ZlcnZpZXdSdWxlci5zZWxlY3Rpb25IaWdobGlnaHRGb3JlZ3JvdW5kJyxcblx0JyNBMEEwQTBDQycsXG5cdG5scy5sb2NhbGl6ZSgnb3ZlcnZpZXdSdWxlclNlbGVjdGlvbkhpZ2hsaWdodEZvcmVncm91bmQnLCAnT3ZlcnZpZXcgcnVsZXIgbWFya2VyIGNvbG9yIGZvciBzZWxlY3Rpb24gaGlnaGxpZ2h0cy4gVGhlIGNvbG9yIG11c3Qgbm90IGJlIG9wYXF1ZSBzbyBhcyBub3QgdG8gaGlkZSB1bmRlcmx5aW5nIGRlY29yYXRpb25zLicpLCB0cnVlKTtcblxuXG4vLyAtLS0tLSBwcm9ibGVtc1xuXG5leHBvcnQgY29uc3QgcHJvYmxlbXNFcnJvckljb25Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcigncHJvYmxlbXNFcnJvckljb24uZm9yZWdyb3VuZCcsXG5cdGVkaXRvckVycm9yRm9yZWdyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdwcm9ibGVtc0Vycm9ySWNvbkZvcmVncm91bmQnLCBcIlRoZSBjb2xvciB1c2VkIGZvciB0aGUgcHJvYmxlbXMgZXJyb3IgaWNvbi5cIikpO1xuXG5leHBvcnQgY29uc3QgcHJvYmxlbXNXYXJuaW5nSWNvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdwcm9ibGVtc1dhcm5pbmdJY29uLmZvcmVncm91bmQnLFxuXHRlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCxcblx0bmxzLmxvY2FsaXplKCdwcm9ibGVtc1dhcm5pbmdJY29uRm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIHVzZWQgZm9yIHRoZSBwcm9ibGVtcyB3YXJuaW5nIGljb24uXCIpKTtcblxuZXhwb3J0IGNvbnN0IHByb2JsZW1zSW5mb0ljb25Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcigncHJvYmxlbXNJbmZvSWNvbi5mb3JlZ3JvdW5kJyxcblx0ZWRpdG9ySW5mb0ZvcmVncm91bmQsXG5cdG5scy5sb2NhbGl6ZSgncHJvYmxlbXNJbmZvSWNvbkZvcmVncm91bmQnLCBcIlRoZSBjb2xvciB1c2VkIGZvciB0aGUgcHJvYmxlbXMgaW5mbyBpY29uLlwiKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFHckIsU0FBUyxPQUFPLFlBQVk7QUFDNUIsU0FBUyxlQUFlLGFBQWEsZUFBZSxRQUFRLGVBQWU7QUFHM0UsU0FBUyxZQUFZLGdCQUFnQiw0QkFBNEI7QUFD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SUFBc0k7QUFBQSxFQUFHO0FBQUk7QUFFcEwsTUFBTSxjQUFjO0FBQUEsRUFBYztBQUFBLEVBQ3hDLEVBQUUsTUFBTSxNQUFNLE9BQU8sTUFBTSxRQUFRLFdBQVcsU0FBUyxVQUFVO0FBQUEsRUFDakUsSUFBSSxTQUFTLGVBQWUscUVBQXFFO0FBQUM7QUFHNUYsTUFBTSx3Q0FBd0M7QUFBQSxFQUFjO0FBQUEsRUFDbEUsRUFBRSxNQUFNLFlBQVksOEJBQThCLGlCQUFpQixHQUFHLE9BQU8sWUFBWSw4QkFBOEIsaUJBQWlCLEdBQUcsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLEVBQ3JMLElBQUksU0FBUyx5Q0FBeUMsK0RBQStEO0FBQUM7QUFFaEgsTUFBTSx5Q0FBeUM7QUFBQSxFQUFjO0FBQUEsRUFDbkUsRUFBRSxNQUFNLFlBQVksK0JBQStCLGlCQUFpQixHQUFHLE9BQU8sWUFBWSwrQkFBK0IsaUJBQWlCLEdBQUcsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLEVBQ3ZMLElBQUksU0FBUywwQ0FBMEMsZ0VBQWdFO0FBQUM7QUFFbEgsTUFBTSx1Q0FBdUM7QUFBQSxFQUFjO0FBQUEsRUFDakUsRUFBRSxNQUFNLFlBQVksNkJBQTZCLGlCQUFpQixHQUFHLE9BQU8sWUFBWSw2QkFBNkIsaUJBQWlCLEdBQUcsUUFBUSxhQUFhLFNBQVMsWUFBWTtBQUFBLEVBQ25MLElBQUksU0FBUyx3Q0FBd0MsdUVBQXVFO0FBQUM7QUFFdkgsTUFBTSxtQ0FBbUM7QUFBQSxFQUFjO0FBQUEsRUFDN0QsRUFBRSxNQUFNLGFBQWEsT0FBTyxhQUFhLFFBQVEsV0FBVyxTQUFTLFVBQVU7QUFBQSxFQUMvRSxJQUFJLFNBQVMsb0NBQW9DLHNIQUFzSDtBQUFBLEVBQUc7QUFBSTtBQUV4SyxNQUFNLDRDQUE0QztBQUFBLEVBQWM7QUFBQSxFQUN0RTtBQUFBLEVBQ0EsSUFBSSxTQUFTLDZDQUE2Qyw4SEFBOEg7QUFBQSxFQUFHO0FBQUk7QUFLekwsTUFBTSw4QkFBOEI7QUFBQSxFQUFjO0FBQUEsRUFDeEQ7QUFBQSxFQUNBLElBQUksU0FBUywrQkFBK0IsNkNBQTZDO0FBQUM7QUFFcEYsTUFBTSxnQ0FBZ0M7QUFBQSxFQUFjO0FBQUEsRUFDMUQ7QUFBQSxFQUNBLElBQUksU0FBUyxpQ0FBaUMsK0NBQStDO0FBQUM7QUFFeEYsTUFBTSw2QkFBNkI7QUFBQSxFQUFjO0FBQUEsRUFDdkQ7QUFBQSxFQUNBLElBQUksU0FBUyw4QkFBOEIsNENBQTRDO0FBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
