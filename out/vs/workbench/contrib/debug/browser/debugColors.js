import { registerColor, foreground, editorInfoForeground, editorWarningForeground, errorForeground, badgeBackground, badgeForeground, listDeemphasizedForeground, contrastBorder, inputBorder, toolbarHoverBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Color } from "../../../../base/common/color.js";
import { localize } from "../../../../nls.js";
import * as icons from "./debugIcons.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
const debugToolBarBackground = registerColor("debugToolBar.background", {
  dark: "#333333",
  light: "#F3F3F3",
  hcDark: "#000000",
  hcLight: "#FFFFFF"
}, localize("debugToolBarBackground", "Debug toolbar background color."));
const debugToolBarBorder = registerColor("debugToolBar.border", null, localize("debugToolBarBorder", "Debug toolbar border color."));
const debugIconStartForeground = registerColor("debugIcon.startForeground", {
  dark: "#89D185",
  light: "#388A34",
  hcDark: "#89D185",
  hcLight: "#388A34"
}, localize("debugIcon.startForeground", "Debug toolbar icon for start debugging."));
function registerColors() {
  const debugTokenExpressionName = registerColor("debugTokenExpression.name", { dark: "#c586c0", light: "#9b46b0", hcDark: foreground, hcLight: foreground }, "Foreground color for the token names shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionType = registerColor("debugTokenExpression.type", { dark: "#4A90E2", light: "#4A90E2", hcDark: foreground, hcLight: foreground }, "Foreground color for the token types shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionValue = registerColor("debugTokenExpression.value", { dark: "#cccccc99", light: "#6c6c6ccc", hcDark: foreground, hcLight: foreground }, "Foreground color for the token values shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionString = registerColor("debugTokenExpression.string", { dark: "#ce9178", light: "#a31515", hcDark: "#f48771", hcLight: "#a31515" }, "Foreground color for strings in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionBoolean = registerColor("debugTokenExpression.boolean", { dark: "#4e94ce", light: "#0000ff", hcDark: "#75bdfe", hcLight: "#0000ff" }, "Foreground color for booleans in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionNumber = registerColor("debugTokenExpression.number", { dark: "#b5cea8", light: "#098658", hcDark: "#89d185", hcLight: "#098658" }, "Foreground color for numbers in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionError = registerColor("debugTokenExpression.error", { dark: "#f48771", light: "#e51400", hcDark: "#f48771", hcLight: "#e51400" }, "Foreground color for expression errors in the debug views (ie. the Variables or Watch view) and for error logs shown in the debug console.");
  const debugViewExceptionLabelForeground = registerColor("debugView.exceptionLabelForeground", { dark: foreground, light: "#FFF", hcDark: foreground, hcLight: foreground }, "Foreground color for a label shown in the CALL STACK view when the debugger breaks on an exception.");
  const debugViewExceptionLabelBackground = registerColor("debugView.exceptionLabelBackground", { dark: "#6C2022", light: "#A31515", hcDark: "#6C2022", hcLight: "#A31515" }, "Background color for a label shown in the CALL STACK view when the debugger breaks on an exception.");
  const debugViewStateLabelForeground = registerColor("debugView.stateLabelForeground", foreground, "Foreground color for a label in the CALL STACK view showing the current session's or thread's state.");
  const debugViewStateLabelBackground = registerColor("debugView.stateLabelBackground", "#88888844", "Background color for a label in the CALL STACK view showing the current session's or thread's state.");
  const debugViewValueChangedHighlight = registerColor("debugView.valueChangedHighlight", "#569CD6", "Color used to highlight value changes in the debug views (ie. in the Variables view).");
  const debugConsoleInfoForeground = registerColor("debugConsole.infoForeground", { dark: editorInfoForeground, light: editorInfoForeground, hcDark: foreground, hcLight: foreground }, "Foreground color for info messages in debug REPL console.");
  const debugConsoleWarningForeground = registerColor("debugConsole.warningForeground", { dark: editorWarningForeground, light: editorWarningForeground, hcDark: "#008000", hcLight: editorWarningForeground }, "Foreground color for warning messages in debug REPL console.");
  const debugConsoleErrorForeground = registerColor("debugConsole.errorForeground", errorForeground, "Foreground color for error messages in debug REPL console.");
  const debugConsoleSourceForeground = registerColor("debugConsole.sourceForeground", foreground, "Foreground color for source filenames in debug REPL console.");
  const debugConsoleInputIconForeground = registerColor("debugConsoleInputIcon.foreground", foreground, "Foreground color for debug console input marker icon.");
  const debugIconPauseForeground = registerColor("debugIcon.pauseForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.pauseForeground", "Debug toolbar icon for pause."));
  const debugIconStopForeground = registerColor("debugIcon.stopForeground", {
    dark: "#F48771",
    light: "#A1260D",
    hcDark: "#F48771",
    hcLight: "#A1260D"
  }, localize("debugIcon.stopForeground", "Debug toolbar icon for stop."));
  const debugIconDisconnectForeground = registerColor("debugIcon.disconnectForeground", {
    dark: "#F48771",
    light: "#A1260D",
    hcDark: "#F48771",
    hcLight: "#A1260D"
  }, localize("debugIcon.disconnectForeground", "Debug toolbar icon for disconnect."));
  const debugIconRestartForeground = registerColor("debugIcon.restartForeground", {
    dark: "#89D185",
    light: "#388A34",
    hcDark: "#89D185",
    hcLight: "#388A34"
  }, localize("debugIcon.restartForeground", "Debug toolbar icon for restart."));
  const debugIconStepOverForeground = registerColor("debugIcon.stepOverForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepOverForeground", "Debug toolbar icon for step over."));
  const debugIconStepIntoForeground = registerColor("debugIcon.stepIntoForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepIntoForeground", "Debug toolbar icon for step into."));
  const debugIconStepOutForeground = registerColor("debugIcon.stepOutForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepOutForeground", "Debug toolbar icon for step over."));
  const debugIconContinueForeground = registerColor("debugIcon.continueForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.continueForeground", "Debug toolbar icon for continue."));
  const debugIconStepBackForeground = registerColor("debugIcon.stepBackForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepBackForeground", "Debug toolbar icon for step back."));
  registerThemingParticipant((theme, collector) => {
    const badgeBackgroundColor = theme.getColor(badgeBackground);
    const badgeForegroundColor = theme.getColor(badgeForeground);
    const listDeemphasizedForegroundColor = theme.getColor(listDeemphasizedForeground);
    const debugViewExceptionLabelForegroundColor = theme.getColor(debugViewExceptionLabelForeground);
    const debugViewExceptionLabelBackgroundColor = theme.getColor(debugViewExceptionLabelBackground);
    const debugViewStateLabelForegroundColor = theme.getColor(debugViewStateLabelForeground);
    const debugViewStateLabelBackgroundColor = theme.getColor(debugViewStateLabelBackground);
    const debugViewValueChangedHighlightColor = theme.getColor(debugViewValueChangedHighlight);
    const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
    collector.addRule(`
			/* Text colour of the call stack row's filename */
			.debug-pane .debug-call-stack .monaco-list-row:not(.selected) .stack-frame > .file .file-name {
				color: ${listDeemphasizedForegroundColor}
			}

			/* Line & column number "badge" for selected call stack row */
			.debug-pane .monaco-list-row.selected .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}

			/* Line & column number "badge" for unselected call stack row (basically all other rows) */
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor.transparent(0.6)};
				color: ${badgeForegroundColor.transparent(0.6)};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running.
			*/
			.debug-pane .debug-call-stack .thread > .state.label,
			.debug-pane .debug-call-stack .session > .state.label {
				background-color: ${debugViewStateLabelBackgroundColor};
				color: ${debugViewStateLabelForegroundColor};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running
			* and thread paused due to a thrown exception.
			*/
			.debug-pane .debug-call-stack .thread > .state.label.exception,
			.debug-pane .debug-call-stack .session > .state.label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Info "badge" shown when the debugger pauses due to a thrown exception. */
			.debug-pane .call-stack-state-message > .label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Animation of changed values in Debug viewlet */
			@keyframes debugViewletValueChanged {
				0%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0)} }
				5%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0.9)} }
				100% { background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)} }
			}

			.debug-pane .monaco-list-row .expression .value.changed {
				background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)};
				animation-name: debugViewletValueChanged;
				animation-duration: 1s;
				animation-fill-mode: forwards;
			}

			.monaco-list-row .expression .lazy-button:hover {
				background-color: ${toolbarHoverBackgroundColor}
			}
		`);
    const contrastBorderColor = theme.getColor(contrastBorder);
    if (contrastBorderColor) {
      collector.addRule(`
			.debug-pane .line-number {
				border: 1px solid ${contrastBorderColor};
			}
			`);
    }
    if (isHighContrast(theme.type)) {
      collector.addRule(`
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}`);
    }
    const tokenNameColor = theme.getColor(debugTokenExpressionName);
    const tokenTypeColor = theme.getColor(debugTokenExpressionType);
    const tokenValueColor = theme.getColor(debugTokenExpressionValue);
    const tokenStringColor = theme.getColor(debugTokenExpressionString);
    const tokenBooleanColor = theme.getColor(debugTokenExpressionBoolean);
    const tokenErrorColor = theme.getColor(debugTokenExpressionError);
    const tokenNumberColor = theme.getColor(debugTokenExpressionNumber);
    collector.addRule(`
			.monaco-workbench .monaco-list-row .expression .name {
				color: ${tokenNameColor};
			}

			.monaco-workbench .monaco-list-row .expression .type {
				color: ${tokenTypeColor};
			}

			.monaco-workbench .monaco-list-row .expression .value,
			.monaco-workbench .debug-hover-widget .value {
				color: ${tokenValueColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.string,
			.monaco-workbench .debug-hover-widget .value.string {
				color: ${tokenStringColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.boolean,
			.monaco-workbench .debug-hover-widget .value.boolean {
				color: ${tokenBooleanColor};
			}

			.monaco-workbench .monaco-list-row .expression .error,
			.monaco-workbench .debug-hover-widget .error,
			.monaco-workbench .debug-pane .debug-variables .scope .error {
				color: ${tokenErrorColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.number,
			.monaco-workbench .debug-hover-widget .value.number {
				color: ${tokenNumberColor};
			}
		`);
    const debugConsoleInputBorderColor = theme.getColor(inputBorder) || Color.fromHex("#80808060");
    const debugConsoleInfoForegroundColor = theme.getColor(debugConsoleInfoForeground);
    const debugConsoleWarningForegroundColor = theme.getColor(debugConsoleWarningForeground);
    const debugConsoleErrorForegroundColor = theme.getColor(debugConsoleErrorForeground);
    const debugConsoleSourceForegroundColor = theme.getColor(debugConsoleSourceForeground);
    const debugConsoleInputIconForegroundColor = theme.getColor(debugConsoleInputIconForeground);
    collector.addRule(`
			.repl .repl-input-wrapper {
				border-top: 1px solid ${debugConsoleInputBorderColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.info {
				color: ${debugConsoleInfoForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.warn {
				color: ${debugConsoleWarningForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.error {
				color: ${debugConsoleErrorForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .source {
				color: ${debugConsoleSourceForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .monaco-tl-contents .arrow {
				color: ${debugConsoleInputIconForegroundColor};
			}
		`);
    if (!theme.defines(debugConsoleInputIconForeground)) {
      collector.addRule(`
				.monaco-workbench.vs .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.25;
				}

				.monaco-workbench.vs-dark .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.4;
				}

				.monaco-workbench.hc-black .repl .repl-tree .monaco-tl-contents .arrow,
				.monaco-workbench.hc-light .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 1;
				}
			`);
    }
    const debugIconStartColor = theme.getColor(debugIconStartForeground);
    if (debugIconStartColor) {
      collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStart)} { color: ${debugIconStartColor}; }`);
    }
    const debugIconPauseColor = theme.getColor(debugIconPauseForeground);
    if (debugIconPauseColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugPause)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugPause)} { color: ${debugIconPauseColor}; }`);
    }
    const debugIconStopColor = theme.getColor(debugIconStopForeground);
    if (debugIconStopColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStop)},.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStop)} { color: ${debugIconStopColor}; }`);
    }
    const debugIconDisconnectColor = theme.getColor(debugIconDisconnectForeground);
    if (debugIconDisconnectColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugDisconnect)},.monaco-workbench .debug-view-content ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .debug-toolbar ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .command-center-center ${ThemeIcon.asCSSSelector(icons.debugDisconnect)} { color: ${debugIconDisconnectColor}; }`);
    }
    const debugIconRestartColor = theme.getColor(debugIconRestartForeground);
    if (debugIconRestartColor) {
      collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestartFrame)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestartFrame)} { color: ${debugIconRestartColor}; }`);
    }
    const debugIconStepOverColor = theme.getColor(debugIconStepOverForeground);
    if (debugIconStepOverColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOver)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOver)} { color: ${debugIconStepOverColor}; }`);
    }
    const debugIconStepIntoColor = theme.getColor(debugIconStepIntoForeground);
    if (debugIconStepIntoColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepInto)} { color: ${debugIconStepIntoColor}; }`);
    }
    const debugIconStepOutColor = theme.getColor(debugIconStepOutForeground);
    if (debugIconStepOutColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOut)} { color: ${debugIconStepOutColor}; }`);
    }
    const debugIconContinueColor = theme.getColor(debugIconContinueForeground);
    if (debugIconContinueColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugReverseContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugReverseContinue)} { color: ${debugIconContinueColor}; }`);
    }
    const debugIconStepBackColor = theme.getColor(debugIconStepBackForeground);
    if (debugIconStepBackColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepBack)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepBack)} { color: ${debugIconStepBackColor}; }`);
    }
  });
}
export {
  debugIconStartForeground,
  debugToolBarBackground,
  debugToolBarBorder,
  registerColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb2xvcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZWdpc3RlckNvbG9yLCBmb3JlZ3JvdW5kLCBlZGl0b3JJbmZvRm9yZWdyb3VuZCwgZWRpdG9yV2FybmluZ0ZvcmVncm91bmQsIGVycm9yRm9yZWdyb3VuZCwgYmFkZ2VCYWNrZ3JvdW5kLCBiYWRnZUZvcmVncm91bmQsIGxpc3REZWVtcGhhc2l6ZWRGb3JlZ3JvdW5kLCBjb250cmFzdEJvcmRlciwgaW5wdXRCb3JkZXIsIHRvb2xiYXJIb3ZlckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcblxuZXhwb3J0IGNvbnN0IGRlYnVnVG9vbEJhckJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rvb2xCYXIuYmFja2dyb3VuZCcsIHtcblx0ZGFyazogJyMzMzMzMzMnLFxuXHRsaWdodDogJyNGM0YzRjMnLFxuXHRoY0Rhcms6ICcjMDAwMDAwJyxcblx0aGNMaWdodDogJyNGRkZGRkYnXG59LCBsb2NhbGl6ZSgnZGVidWdUb29sQmFyQmFja2dyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBiYWNrZ3JvdW5kIGNvbG9yLlwiKSk7XG5cbmV4cG9ydCBjb25zdCBkZWJ1Z1Rvb2xCYXJCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rvb2xCYXIuYm9yZGVyJywgbnVsbCwgbG9jYWxpemUoJ2RlYnVnVG9vbEJhckJvcmRlcicsIFwiRGVidWcgdG9vbGJhciBib3JkZXIgY29sb3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5zdGFydEZvcmVncm91bmQnLCB7XG5cdGRhcms6ICcjODlEMTg1Jyxcblx0bGlnaHQ6ICcjMzg4QTM0Jyxcblx0aGNEYXJrOiAnIzg5RDE4NScsXG5cdGhjTGlnaHQ6ICcjMzg4QTM0J1xufSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5zdGFydEZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RhcnQgZGVidWdnaW5nLlwiKSk7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbG9ycygpIHtcblxuXHRjb25zdCBkZWJ1Z1Rva2VuRXhwcmVzc2lvbk5hbWUgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rva2VuRXhwcmVzc2lvbi5uYW1lJywgeyBkYXJrOiAnI2M1ODZjMCcsIGxpZ2h0OiAnIzliNDZiMCcsIGhjRGFyazogZm9yZWdyb3VuZCwgaGNMaWdodDogZm9yZWdyb3VuZCB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgdGhlIHRva2VuIG5hbWVzIHNob3duIGluIHRoZSBkZWJ1ZyB2aWV3cyAoaWUuIHRoZSBWYXJpYWJsZXMgb3IgV2F0Y2ggdmlldykuJyk7XG5cdGNvbnN0IGRlYnVnVG9rZW5FeHByZXNzaW9uVHlwZSA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLnR5cGUnLCB7IGRhcms6ICcjNEE5MEUyJywgbGlnaHQ6ICcjNEE5MEUyJywgaGNEYXJrOiBmb3JlZ3JvdW5kLCBoY0xpZ2h0OiBmb3JlZ3JvdW5kIH0sICdGb3JlZ3JvdW5kIGNvbG9yIGZvciB0aGUgdG9rZW4gdHlwZXMgc2hvd24gaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KS4nKTtcblx0Y29uc3QgZGVidWdUb2tlbkV4cHJlc3Npb25WYWx1ZSA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLnZhbHVlJywgeyBkYXJrOiAnI2NjY2NjYzk5JywgbGlnaHQ6ICcjNmM2YzZjY2MnLCBoY0Rhcms6IGZvcmVncm91bmQsIGhjTGlnaHQ6IGZvcmVncm91bmQgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHRoZSB0b2tlbiB2YWx1ZXMgc2hvd24gaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KS4nKTtcblx0Y29uc3QgZGVidWdUb2tlbkV4cHJlc3Npb25TdHJpbmcgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rva2VuRXhwcmVzc2lvbi5zdHJpbmcnLCB7IGRhcms6ICcjY2U5MTc4JywgbGlnaHQ6ICcjYTMxNTE1JywgaGNEYXJrOiAnI2Y0ODc3MScsIGhjTGlnaHQ6ICcjYTMxNTE1JyB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3Igc3RyaW5ncyBpbiB0aGUgZGVidWcgdmlld3MgKGllLiB0aGUgVmFyaWFibGVzIG9yIFdhdGNoIHZpZXcpLicpO1xuXHRjb25zdCBkZWJ1Z1Rva2VuRXhwcmVzc2lvbkJvb2xlYW4gPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rva2VuRXhwcmVzc2lvbi5ib29sZWFuJywgeyBkYXJrOiAnIzRlOTRjZScsIGxpZ2h0OiAnIzAwMDBmZicsIGhjRGFyazogJyM3NWJkZmUnLCBoY0xpZ2h0OiAnIzAwMDBmZicgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIGJvb2xlYW5zIGluIHRoZSBkZWJ1ZyB2aWV3cyAoaWUuIHRoZSBWYXJpYWJsZXMgb3IgV2F0Y2ggdmlldykuJyk7XG5cdGNvbnN0IGRlYnVnVG9rZW5FeHByZXNzaW9uTnVtYmVyID0gcmVnaXN0ZXJDb2xvcignZGVidWdUb2tlbkV4cHJlc3Npb24ubnVtYmVyJywgeyBkYXJrOiAnI2I1Y2VhOCcsIGxpZ2h0OiAnIzA5ODY1OCcsIGhjRGFyazogJyM4OWQxODUnLCBoY0xpZ2h0OiAnIzA5ODY1OCcgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIG51bWJlcnMgaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KS4nKTtcblx0Y29uc3QgZGVidWdUb2tlbkV4cHJlc3Npb25FcnJvciA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLmVycm9yJywgeyBkYXJrOiAnI2Y0ODc3MScsIGxpZ2h0OiAnI2U1MTQwMCcsIGhjRGFyazogJyNmNDg3NzEnLCBoY0xpZ2h0OiAnI2U1MTQwMCcgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIGV4cHJlc3Npb24gZXJyb3JzIGluIHRoZSBkZWJ1ZyB2aWV3cyAoaWUuIHRoZSBWYXJpYWJsZXMgb3IgV2F0Y2ggdmlldykgYW5kIGZvciBlcnJvciBsb2dzIHNob3duIGluIHRoZSBkZWJ1ZyBjb25zb2xlLicpO1xuXG5cdGNvbnN0IGRlYnVnVmlld0V4Y2VwdGlvbkxhYmVsRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVmlldy5leGNlcHRpb25MYWJlbEZvcmVncm91bmQnLCB7IGRhcms6IGZvcmVncm91bmQsIGxpZ2h0OiAnI0ZGRicsIGhjRGFyazogZm9yZWdyb3VuZCwgaGNMaWdodDogZm9yZWdyb3VuZCB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgYSBsYWJlbCBzaG93biBpbiB0aGUgQ0FMTCBTVEFDSyB2aWV3IHdoZW4gdGhlIGRlYnVnZ2VyIGJyZWFrcyBvbiBhbiBleGNlcHRpb24uJyk7XG5cdGNvbnN0IGRlYnVnVmlld0V4Y2VwdGlvbkxhYmVsQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVmlldy5leGNlcHRpb25MYWJlbEJhY2tncm91bmQnLCB7IGRhcms6ICcjNkMyMDIyJywgbGlnaHQ6ICcjQTMxNTE1JywgaGNEYXJrOiAnIzZDMjAyMicsIGhjTGlnaHQ6ICcjQTMxNTE1JyB9LCAnQmFja2dyb3VuZCBjb2xvciBmb3IgYSBsYWJlbCBzaG93biBpbiB0aGUgQ0FMTCBTVEFDSyB2aWV3IHdoZW4gdGhlIGRlYnVnZ2VyIGJyZWFrcyBvbiBhbiBleGNlcHRpb24uJyk7XG5cdGNvbnN0IGRlYnVnVmlld1N0YXRlTGFiZWxGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdWaWV3LnN0YXRlTGFiZWxGb3JlZ3JvdW5kJywgZm9yZWdyb3VuZCwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIGEgbGFiZWwgaW4gdGhlIENBTEwgU1RBQ0sgdmlldyBzaG93aW5nIHRoZSBjdXJyZW50IHNlc3Npb25cXCdzIG9yIHRocmVhZFxcJ3Mgc3RhdGUuJyk7XG5cdGNvbnN0IGRlYnVnVmlld1N0YXRlTGFiZWxCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdWaWV3LnN0YXRlTGFiZWxCYWNrZ3JvdW5kJywgJyM4ODg4ODg0NCcsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciBhIGxhYmVsIGluIHRoZSBDQUxMIFNUQUNLIHZpZXcgc2hvd2luZyB0aGUgY3VycmVudCBzZXNzaW9uXFwncyBvciB0aHJlYWRcXCdzIHN0YXRlLicpO1xuXHRjb25zdCBkZWJ1Z1ZpZXdWYWx1ZUNoYW5nZWRIaWdobGlnaHQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1ZpZXcudmFsdWVDaGFuZ2VkSGlnaGxpZ2h0JywgJyM1NjlDRDYnLCAnQ29sb3IgdXNlZCB0byBoaWdobGlnaHQgdmFsdWUgY2hhbmdlcyBpbiB0aGUgZGVidWcgdmlld3MgKGllLiBpbiB0aGUgVmFyaWFibGVzIHZpZXcpLicpO1xuXG5cdGNvbnN0IGRlYnVnQ29uc29sZUluZm9Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdDb25zb2xlLmluZm9Gb3JlZ3JvdW5kJywgeyBkYXJrOiBlZGl0b3JJbmZvRm9yZWdyb3VuZCwgbGlnaHQ6IGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBoY0Rhcms6IGZvcmVncm91bmQsIGhjTGlnaHQ6IGZvcmVncm91bmQgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIGluZm8gbWVzc2FnZXMgaW4gZGVidWcgUkVQTCBjb25zb2xlLicpO1xuXHRjb25zdCBkZWJ1Z0NvbnNvbGVXYXJuaW5nRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnQ29uc29sZS53YXJuaW5nRm9yZWdyb3VuZCcsIHsgZGFyazogZWRpdG9yV2FybmluZ0ZvcmVncm91bmQsIGxpZ2h0OiBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgaGNEYXJrOiAnIzAwODAwMCcsIGhjTGlnaHQ6IGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kIH0sICdGb3JlZ3JvdW5kIGNvbG9yIGZvciB3YXJuaW5nIG1lc3NhZ2VzIGluIGRlYnVnIFJFUEwgY29uc29sZS4nKTtcblx0Y29uc3QgZGVidWdDb25zb2xlRXJyb3JGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdDb25zb2xlLmVycm9yRm9yZWdyb3VuZCcsIGVycm9yRm9yZWdyb3VuZCwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIGVycm9yIG1lc3NhZ2VzIGluIGRlYnVnIFJFUEwgY29uc29sZS4nKTtcblx0Y29uc3QgZGVidWdDb25zb2xlU291cmNlRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnQ29uc29sZS5zb3VyY2VGb3JlZ3JvdW5kJywgZm9yZWdyb3VuZCwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHNvdXJjZSBmaWxlbmFtZXMgaW4gZGVidWcgUkVQTCBjb25zb2xlLicpO1xuXHRjb25zdCBkZWJ1Z0NvbnNvbGVJbnB1dEljb25Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdDb25zb2xlSW5wdXRJY29uLmZvcmVncm91bmQnLCBmb3JlZ3JvdW5kLCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgZGVidWcgY29uc29sZSBpbnB1dCBtYXJrZXIgaWNvbi4nKTtcblxuXHRjb25zdCBkZWJ1Z0ljb25QYXVzZUZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24ucGF1c2VGb3JlZ3JvdW5kJywge1xuXHRcdGRhcms6ICcjNzVCRUZGJyxcblx0XHRsaWdodDogJyMwMDdBQ0MnLFxuXHRcdGhjRGFyazogJyM3NUJFRkYnLFxuXHRcdGhjTGlnaHQ6ICcjMDA3QUNDJ1xuXHR9LCBsb2NhbGl6ZSgnZGVidWdJY29uLnBhdXNlRm9yZWdyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBpY29uIGZvciBwYXVzZS5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvblN0b3BGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0b3BGb3JlZ3JvdW5kJywge1xuXHRcdGRhcms6ICcjRjQ4NzcxJyxcblx0XHRsaWdodDogJyNBMTI2MEQnLFxuXHRcdGhjRGFyazogJyNGNDg3NzEnLFxuXHRcdGhjTGlnaHQ6ICcjQTEyNjBEJ1xuXHR9LCBsb2NhbGl6ZSgnZGVidWdJY29uLnN0b3BGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIHN0b3AuXCIpKTtcblxuXHRjb25zdCBkZWJ1Z0ljb25EaXNjb25uZWN0Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5kaXNjb25uZWN0Rm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnI0Y0ODc3MScsXG5cdFx0bGlnaHQ6ICcjQTEyNjBEJyxcblx0XHRoY0Rhcms6ICcjRjQ4NzcxJyxcblx0XHRoY0xpZ2h0OiAnI0ExMjYwRCdcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5kaXNjb25uZWN0Rm9yZWdyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBpY29uIGZvciBkaXNjb25uZWN0LlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uUmVzdGFydEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24ucmVzdGFydEZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM4OUQxODUnLFxuXHRcdGxpZ2h0OiAnIzM4OEEzNCcsXG5cdFx0aGNEYXJrOiAnIzg5RDE4NScsXG5cdFx0aGNMaWdodDogJyMzODhBMzQnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24ucmVzdGFydEZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3IgcmVzdGFydC5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvblN0ZXBPdmVyRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5zdGVwT3ZlckZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM3NUJFRkYnLFxuXHRcdGxpZ2h0OiAnIzAwN0FDQycsXG5cdFx0aGNEYXJrOiAnIzc1QkVGRicsXG5cdFx0aGNMaWdodDogJyMwMDdBQ0MnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24uc3RlcE92ZXJGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIHN0ZXAgb3Zlci5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvblN0ZXBJbnRvRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5zdGVwSW50b0ZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM3NUJFRkYnLFxuXHRcdGxpZ2h0OiAnIzAwN0FDQycsXG5cdFx0aGNEYXJrOiAnIzc1QkVGRicsXG5cdFx0aGNMaWdodDogJyMwMDdBQ0MnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24uc3RlcEludG9Gb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIHN0ZXAgaW50by5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvblN0ZXBPdXRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0ZXBPdXRGb3JlZ3JvdW5kJywge1xuXHRcdGRhcms6ICcjNzVCRUZGJyxcblx0XHRsaWdodDogJyMwMDdBQ0MnLFxuXHRcdGhjRGFyazogJyM3NUJFRkYnLFxuXHRcdGhjTGlnaHQ6ICcjMDA3QUNDJ1xuXHR9LCBsb2NhbGl6ZSgnZGVidWdJY29uLnN0ZXBPdXRGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIHN0ZXAgb3Zlci5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvbkNvbnRpbnVlRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5jb250aW51ZUZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM3NUJFRkYnLFxuXHRcdGxpZ2h0OiAnIzAwN0FDQycsXG5cdFx0aGNEYXJrOiAnIzc1QkVGRicsXG5cdFx0aGNMaWdodDogJyMwMDdBQ0MnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24uY29udGludWVGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIGNvbnRpbnVlLlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uU3RlcEJhY2tGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0ZXBCYWNrRm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnIzc1QkVGRicsXG5cdFx0bGlnaHQ6ICcjMDA3QUNDJyxcblx0XHRoY0Rhcms6ICcjNzVCRUZGJyxcblx0XHRoY0xpZ2h0OiAnIzAwN0FDQydcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5zdGVwQmFja0ZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RlcCBiYWNrLlwiKSk7XG5cblx0cmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0XHQvLyBBbGwgdGhlc2UgY29sb3VycyBwcm92aWRlIGEgZGVmYXVsdCB2YWx1ZSBzbyB0aGV5IHdpbGwgbmV2ZXIgYmUgdW5kZWZpbmVkLCBoZW5jZSB0aGUgYCFgXG5cdFx0Y29uc3QgYmFkZ2VCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihiYWRnZUJhY2tncm91bmQpITtcblx0XHRjb25zdCBiYWRnZUZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGJhZGdlRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGxpc3REZWVtcGhhc2l6ZWRGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0RGVlbXBoYXNpemVkRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnVmlld0V4Y2VwdGlvbkxhYmVsRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEJhY2tncm91bmQpITtcblx0XHRjb25zdCBkZWJ1Z1ZpZXdTdGF0ZUxhYmVsRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdWaWV3U3RhdGVMYWJlbEZvcmVncm91bmQpITtcblx0XHRjb25zdCBkZWJ1Z1ZpZXdTdGF0ZUxhYmVsQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdWaWV3U3RhdGVMYWJlbEJhY2tncm91bmQpITtcblx0XHRjb25zdCBkZWJ1Z1ZpZXdWYWx1ZUNoYW5nZWRIaWdobGlnaHRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodCkhO1xuXHRcdGNvbnN0IHRvb2xiYXJIb3ZlckJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKHRvb2xiYXJIb3ZlckJhY2tncm91bmQpO1xuXG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0LyogVGV4dCBjb2xvdXIgb2YgdGhlIGNhbGwgc3RhY2sgcm93J3MgZmlsZW5hbWUgKi9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5kZWJ1Zy1jYWxsLXN0YWNrIC5tb25hY28tbGlzdC1yb3c6bm90KC5zZWxlY3RlZCkgLnN0YWNrLWZyYW1lID4gLmZpbGUgLmZpbGUtbmFtZSB7XG5cdFx0XHRcdGNvbG9yOiAke2xpc3REZWVtcGhhc2l6ZWRGb3JlZ3JvdW5kQ29sb3J9XG5cdFx0XHR9XG5cblx0XHRcdC8qIExpbmUgJiBjb2x1bW4gbnVtYmVyIFwiYmFkZ2VcIiBmb3Igc2VsZWN0ZWQgY2FsbCBzdGFjayByb3cgKi9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgLmxpbmUtbnVtYmVyIHtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtiYWRnZUJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdGNvbG9yOiAke2JhZGdlRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0LyogTGluZSAmIGNvbHVtbiBudW1iZXIgXCJiYWRnZVwiIGZvciB1bnNlbGVjdGVkIGNhbGwgc3RhY2sgcm93IChiYXNpY2FsbHkgYWxsIG90aGVyIHJvd3MpICovXG5cdFx0XHQuZGVidWctcGFuZSAubGluZS1udW1iZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2JhZGdlQmFja2dyb3VuZENvbG9yLnRyYW5zcGFyZW50KDAuNil9O1xuXHRcdFx0XHRjb2xvcjogJHtiYWRnZUZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCgwLjYpfTtcblx0XHRcdH1cblxuXHRcdFx0LyogU3RhdGUgXCJiYWRnZVwiIGRpc3BsYXlpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgY3VycmVudCBzdGF0ZS5cblx0XHRcdCogT25seSB2aXNpYmxlIHdoZW4gdGhlcmUgYXJlIG1vcmUgYWN0aXZlIGRlYnVnIHNlc3Npb25zL3RocmVhZHMgcnVubmluZy5cblx0XHRcdCovXG5cdFx0XHQuZGVidWctcGFuZSAuZGVidWctY2FsbC1zdGFjayAudGhyZWFkID4gLnN0YXRlLmxhYmVsLFxuXHRcdFx0LmRlYnVnLXBhbmUgLmRlYnVnLWNhbGwtc3RhY2sgLnNlc3Npb24gPiAuc3RhdGUubGFiZWwge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2RlYnVnVmlld1N0YXRlTGFiZWxCYWNrZ3JvdW5kQ29sb3J9O1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z1ZpZXdTdGF0ZUxhYmVsRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0LyogU3RhdGUgXCJiYWRnZVwiIGRpc3BsYXlpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgY3VycmVudCBzdGF0ZS5cblx0XHRcdCogT25seSB2aXNpYmxlIHdoZW4gdGhlcmUgYXJlIG1vcmUgYWN0aXZlIGRlYnVnIHNlc3Npb25zL3RocmVhZHMgcnVubmluZ1xuXHRcdFx0KiBhbmQgdGhyZWFkIHBhdXNlZCBkdWUgdG8gYSB0aHJvd24gZXhjZXB0aW9uLlxuXHRcdFx0Ki9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5kZWJ1Zy1jYWxsLXN0YWNrIC50aHJlYWQgPiAuc3RhdGUubGFiZWwuZXhjZXB0aW9uLFxuXHRcdFx0LmRlYnVnLXBhbmUgLmRlYnVnLWNhbGwtc3RhY2sgLnNlc3Npb24gPiAuc3RhdGUubGFiZWwuZXhjZXB0aW9uIHtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnVmlld0V4Y2VwdGlvbkxhYmVsRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0LyogSW5mbyBcImJhZGdlXCIgc2hvd24gd2hlbiB0aGUgZGVidWdnZXIgcGF1c2VzIGR1ZSB0byBhIHRocm93biBleGNlcHRpb24uICovXG5cdFx0XHQuZGVidWctcGFuZSAuY2FsbC1zdGFjay1zdGF0ZS1tZXNzYWdlID4gLmxhYmVsLmV4Y2VwdGlvbiB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7ZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxCYWNrZ3JvdW5kQ29sb3J9O1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC8qIEFuaW1hdGlvbiBvZiBjaGFuZ2VkIHZhbHVlcyBpbiBEZWJ1ZyB2aWV3bGV0ICovXG5cdFx0XHRAa2V5ZnJhbWVzIGRlYnVnVmlld2xldFZhbHVlQ2hhbmdlZCB7XG5cdFx0XHRcdDAlICAgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke2RlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodENvbG9yLnRyYW5zcGFyZW50KDApfSB9XG5cdFx0XHRcdDUlICAgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke2RlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodENvbG9yLnRyYW5zcGFyZW50KDAuOSl9IH1cblx0XHRcdFx0MTAwJSB7IGJhY2tncm91bmQtY29sb3I6ICR7ZGVidWdWaWV3VmFsdWVDaGFuZ2VkSGlnaGxpZ2h0Q29sb3IudHJhbnNwYXJlbnQoMC4zKX0gfVxuXHRcdFx0fVxuXG5cdFx0XHQuZGVidWctcGFuZSAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC52YWx1ZS5jaGFuZ2VkIHtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtkZWJ1Z1ZpZXdWYWx1ZUNoYW5nZWRIaWdobGlnaHRDb2xvci50cmFuc3BhcmVudCgwLjMpfTtcblx0XHRcdFx0YW5pbWF0aW9uLW5hbWU6IGRlYnVnVmlld2xldFZhbHVlQ2hhbmdlZDtcblx0XHRcdFx0YW5pbWF0aW9uLWR1cmF0aW9uOiAxcztcblx0XHRcdFx0YW5pbWF0aW9uLWZpbGwtbW9kZTogZm9yd2FyZHM7XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLmxhenktYnV0dG9uOmhvdmVyIHtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0b29sYmFySG92ZXJCYWNrZ3JvdW5kQ29sb3J9XG5cdFx0XHR9XG5cdFx0YCk7XG5cblx0XHRjb25zdCBjb250cmFzdEJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXG5cdFx0aWYgKGNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdC5kZWJ1Zy1wYW5lIC5saW5lLW51bWJlciB7XG5cdFx0XHRcdGJvcmRlcjogMXB4IHNvbGlkICR7Y29udHJhc3RCb3JkZXJDb2xvcn07XG5cdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHQvLyBVc2UgZnVsbHktb3BhcXVlIGNvbG9ycyBmb3IgbGluZS1udW1iZXIgYmFkZ2VzXG5cdFx0aWYgKGlzSGlnaENvbnRyYXN0KHRoZW1lLnR5cGUpKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQuZGVidWctcGFuZSAubGluZS1udW1iZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2JhZGdlQmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0Y29sb3I6ICR7YmFkZ2VGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuTmFtZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdUb2tlbkV4cHJlc3Npb25OYW1lKSE7XG5cdFx0Y29uc3QgdG9rZW5UeXBlQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1Rva2VuRXhwcmVzc2lvblR5cGUpITtcblx0XHRjb25zdCB0b2tlblZhbHVlQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1Rva2VuRXhwcmVzc2lvblZhbHVlKSE7XG5cdFx0Y29uc3QgdG9rZW5TdHJpbmdDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uU3RyaW5nKSE7XG5cdFx0Y29uc3QgdG9rZW5Cb29sZWFuQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1Rva2VuRXhwcmVzc2lvbkJvb2xlYW4pITtcblx0XHRjb25zdCB0b2tlbkVycm9yQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1Rva2VuRXhwcmVzc2lvbkVycm9yKSE7XG5cdFx0Y29uc3QgdG9rZW5OdW1iZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uTnVtYmVyKSE7XG5cblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC5uYW1lIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5OYW1lQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC50eXBlIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5UeXBlQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC52YWx1ZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5kZWJ1Zy1ob3Zlci13aWRnZXQgLnZhbHVlIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5WYWx1ZUNvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0LXJvdyAuZXhwcmVzc2lvbiAudmFsdWUuc3RyaW5nLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLWhvdmVyLXdpZGdldCAudmFsdWUuc3RyaW5nIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5TdHJpbmdDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLnZhbHVlLmJvb2xlYW4sXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctaG92ZXItd2lkZ2V0IC52YWx1ZS5ib29sZWFuIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5Cb29sZWFuQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC5lcnJvcixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5kZWJ1Zy1ob3Zlci13aWRnZXQgLmVycm9yLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLXBhbmUgLmRlYnVnLXZhcmlhYmxlcyAuc2NvcGUgLmVycm9yIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5FcnJvckNvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0LXJvdyAuZXhwcmVzc2lvbiAudmFsdWUubnVtYmVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLWhvdmVyLXdpZGdldCAudmFsdWUubnVtYmVyIHtcblx0XHRcdFx0Y29sb3I6ICR7dG9rZW5OdW1iZXJDb2xvcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cblx0XHRjb25zdCBkZWJ1Z0NvbnNvbGVJbnB1dEJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoaW5wdXRCb3JkZXIpIHx8IENvbG9yLmZyb21IZXgoJyM4MDgwODA2MCcpO1xuXHRcdGNvbnN0IGRlYnVnQ29uc29sZUluZm9Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0NvbnNvbGVJbmZvRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnQ29uc29sZVdhcm5pbmdGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0NvbnNvbGVXYXJuaW5nRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnQ29uc29sZUVycm9yRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdDb25zb2xlRXJyb3JGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlU291cmNlRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdDb25zb2xlU291cmNlRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnQ29uc29sZUlucHV0SWNvbkZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnQ29uc29sZUlucHV0SWNvbkZvcmVncm91bmQpITtcblxuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdC5yZXBsIC5yZXBsLWlucHV0LXdyYXBwZXIge1xuXHRcdFx0XHRib3JkZXItdG9wOiAxcHggc29saWQgJHtkZWJ1Z0NvbnNvbGVJbnB1dEJvcmRlckNvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnJlcGwgLnJlcGwtdHJlZSAub3V0cHV0IC5leHByZXNzaW9uIC52YWx1ZS5pbmZvIHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdDb25zb2xlSW5mb0ZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5yZXBsIC5yZXBsLXRyZWUgLm91dHB1dCAuZXhwcmVzc2lvbiAudmFsdWUud2FybiB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnQ29uc29sZVdhcm5pbmdGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucmVwbCAucmVwbC10cmVlIC5vdXRwdXQgLmV4cHJlc3Npb24gLnZhbHVlLmVycm9yIHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdDb25zb2xlRXJyb3JGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucmVwbCAucmVwbC10cmVlIC5vdXRwdXQgLmV4cHJlc3Npb24gLnNvdXJjZSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnQ29uc29sZVNvdXJjZUZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5yZXBsIC5yZXBsLXRyZWUgLm1vbmFjby10bC1jb250ZW50cyAuYXJyb3cge1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z0NvbnNvbGVJbnB1dEljb25Gb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXHRcdGApO1xuXG5cdFx0aWYgKCF0aGVtZS5kZWZpbmVzKGRlYnVnQ29uc29sZUlucHV0SWNvbkZvcmVncm91bmQpKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoLnZzIC5yZXBsIC5yZXBsLXRyZWUgLm1vbmFjby10bC1jb250ZW50cyAuYXJyb3cge1xuXHRcdFx0XHRcdG9wYWNpdHk6IDAuMjU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaC52cy1kYXJrIC5yZXBsIC5yZXBsLXRyZWUgLm1vbmFjby10bC1jb250ZW50cyAuYXJyb3cge1xuXHRcdFx0XHRcdG9wYWNpdHk6IDAuNDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoLmhjLWJsYWNrIC5yZXBsIC5yZXBsLXRyZWUgLm1vbmFjby10bC1jb250ZW50cyAuYXJyb3csXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoLmhjLWxpZ2h0IC5yZXBsIC5yZXBsLXRyZWUgLm1vbmFjby10bC1jb250ZW50cyAuYXJyb3cge1xuXHRcdFx0XHRcdG9wYWNpdHk6IDE7XG5cdFx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblN0YXJ0Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25TdGFydEZvcmVncm91bmQpO1xuXHRcdGlmIChkZWJ1Z0ljb25TdGFydENvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0YXJ0KX0geyBjb2xvcjogJHtkZWJ1Z0ljb25TdGFydENvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblBhdXNlQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25QYXVzZUZvcmVncm91bmQpO1xuXHRcdGlmIChkZWJ1Z0ljb25QYXVzZUNvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1BhdXNlKX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdQYXVzZSl9IHsgY29sb3I6ICR7ZGVidWdJY29uUGF1c2VDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25TdG9wQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25TdG9wRm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblN0b3BDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdG9wKX0sLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0b3ApfSB7IGNvbG9yOiAke2RlYnVnSWNvblN0b3BDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25EaXNjb25uZWN0Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25EaXNjb25uZWN0Rm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvbkRpc2Nvbm5lY3RDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdEaXNjb25uZWN0KX0sLm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLXZpZXctY29udGVudCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnRGlzY29ubmVjdCl9LCAubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctdG9vbGJhciAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnRGlzY29ubmVjdCl9LCAubW9uYWNvLXdvcmtiZW5jaCAuY29tbWFuZC1jZW50ZXItY2VudGVyICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdEaXNjb25uZWN0KX0geyBjb2xvcjogJHtkZWJ1Z0ljb25EaXNjb25uZWN0Q29sb3J9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVidWdJY29uUmVzdGFydENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uUmVzdGFydEZvcmVncm91bmQpO1xuXHRcdGlmIChkZWJ1Z0ljb25SZXN0YXJ0Q29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnUmVzdGFydCl9LCAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnUmVzdGFydEZyYW1lKX0sIC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdSZXN0YXJ0KX0sIC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdSZXN0YXJ0RnJhbWUpfSB7IGNvbG9yOiAke2RlYnVnSWNvblJlc3RhcnRDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25TdGVwT3ZlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uU3RlcE92ZXJGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uU3RlcE92ZXJDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwT3Zlcil9LCAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RlcE92ZXIpfSB7IGNvbG9yOiAke2RlYnVnSWNvblN0ZXBPdmVyQ29sb3J9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVidWdJY29uU3RlcEludG9Db2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvblN0ZXBJbnRvRm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblN0ZXBJbnRvQ29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAucGFydCA+IC50aXRsZSA+IC50aXRsZS1hY3Rpb25zIC5hY3Rpb24tbGFiZWwke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RlcEludG8pfSwgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBJbnRvKX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwSW50byl9IHsgY29sb3I6ICR7ZGVidWdJY29uU3RlcEludG9Db2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25TdGVwT3V0Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25TdGVwT3V0Rm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblN0ZXBPdXRDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwT3V0KX0sIC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwT3V0KX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwT3V0KX0geyBjb2xvcjogJHtkZWJ1Z0ljb25TdGVwT3V0Q29sb3J9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVidWdJY29uQ29udGludWVDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvbkNvbnRpbnVlRm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvbkNvbnRpbnVlQ29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAucGFydCA+IC50aXRsZSA+IC50aXRsZS1hY3Rpb25zIC5hY3Rpb24tbGFiZWwke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnQ29udGludWUpfSwgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0NvbnRpbnVlKX0sIC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdSZXZlcnNlQ29udGludWUpfSwgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1JldmVyc2VDb250aW51ZSl9IHsgY29sb3I6ICR7ZGVidWdJY29uQ29udGludWVDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25TdGVwQmFja0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uU3RlcEJhY2tGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uU3RlcEJhY2tDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwQmFjayl9LCAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RlcEJhY2spfSB7IGNvbG9yOiAke2RlYnVnSWNvblN0ZXBCYWNrQ29sb3J9OyB9YCk7XG5cdFx0fVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZSxZQUFZLHNCQUFzQix5QkFBeUIsaUJBQWlCLGlCQUFpQixpQkFBaUIsNEJBQTRCLGdCQUFnQixhQUFhLDhCQUE4QjtBQUM3TixTQUFTLGtDQUFrQztBQUMzQyxT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
