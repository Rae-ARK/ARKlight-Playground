var AccessibilitySupport = /* @__PURE__ */ ((AccessibilitySupport2) => {
  AccessibilitySupport2[AccessibilitySupport2["Unknown"] = 0] = "Unknown";
  AccessibilitySupport2[AccessibilitySupport2["Disabled"] = 1] = "Disabled";
  AccessibilitySupport2[AccessibilitySupport2["Enabled"] = 2] = "Enabled";
  return AccessibilitySupport2;
})(AccessibilitySupport || {});
var CodeActionTriggerType = /* @__PURE__ */ ((CodeActionTriggerType2) => {
  CodeActionTriggerType2[CodeActionTriggerType2["Invoke"] = 1] = "Invoke";
  CodeActionTriggerType2[CodeActionTriggerType2["Auto"] = 2] = "Auto";
  return CodeActionTriggerType2;
})(CodeActionTriggerType || {});
var CompletionItemInsertTextRule = /* @__PURE__ */ ((CompletionItemInsertTextRule2) => {
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["None"] = 0] = "None";
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["KeepWhitespace"] = 1] = "KeepWhitespace";
  CompletionItemInsertTextRule2[CompletionItemInsertTextRule2["InsertAsSnippet"] = 4] = "InsertAsSnippet";
  return CompletionItemInsertTextRule2;
})(CompletionItemInsertTextRule || {});
var CompletionItemKind = /* @__PURE__ */ ((CompletionItemKind2) => {
  CompletionItemKind2[CompletionItemKind2["Method"] = 0] = "Method";
  CompletionItemKind2[CompletionItemKind2["Function"] = 1] = "Function";
  CompletionItemKind2[CompletionItemKind2["Constructor"] = 2] = "Constructor";
  CompletionItemKind2[CompletionItemKind2["Field"] = 3] = "Field";
  CompletionItemKind2[CompletionItemKind2["Variable"] = 4] = "Variable";
  CompletionItemKind2[CompletionItemKind2["Class"] = 5] = "Class";
  CompletionItemKind2[CompletionItemKind2["Struct"] = 6] = "Struct";
  CompletionItemKind2[CompletionItemKind2["Interface"] = 7] = "Interface";
  CompletionItemKind2[CompletionItemKind2["Module"] = 8] = "Module";
  CompletionItemKind2[CompletionItemKind2["Property"] = 9] = "Property";
  CompletionItemKind2[CompletionItemKind2["Event"] = 10] = "Event";
  CompletionItemKind2[CompletionItemKind2["Operator"] = 11] = "Operator";
  CompletionItemKind2[CompletionItemKind2["Unit"] = 12] = "Unit";
  CompletionItemKind2[CompletionItemKind2["Value"] = 13] = "Value";
  CompletionItemKind2[CompletionItemKind2["Constant"] = 14] = "Constant";
  CompletionItemKind2[CompletionItemKind2["Enum"] = 15] = "Enum";
  CompletionItemKind2[CompletionItemKind2["EnumMember"] = 16] = "EnumMember";
  CompletionItemKind2[CompletionItemKind2["Keyword"] = 17] = "Keyword";
  CompletionItemKind2[CompletionItemKind2["Text"] = 18] = "Text";
  CompletionItemKind2[CompletionItemKind2["Color"] = 19] = "Color";
  CompletionItemKind2[CompletionItemKind2["File"] = 20] = "File";
  CompletionItemKind2[CompletionItemKind2["Reference"] = 21] = "Reference";
  CompletionItemKind2[CompletionItemKind2["Customcolor"] = 22] = "Customcolor";
  CompletionItemKind2[CompletionItemKind2["Folder"] = 23] = "Folder";
  CompletionItemKind2[CompletionItemKind2["TypeParameter"] = 24] = "TypeParameter";
  CompletionItemKind2[CompletionItemKind2["User"] = 25] = "User";
  CompletionItemKind2[CompletionItemKind2["Issue"] = 26] = "Issue";
  CompletionItemKind2[CompletionItemKind2["Tool"] = 27] = "Tool";
  CompletionItemKind2[CompletionItemKind2["Snippet"] = 28] = "Snippet";
  return CompletionItemKind2;
})(CompletionItemKind || {});
var CompletionItemTag = /* @__PURE__ */ ((CompletionItemTag2) => {
  CompletionItemTag2[CompletionItemTag2["Deprecated"] = 1] = "Deprecated";
  return CompletionItemTag2;
})(CompletionItemTag || {});
var CompletionTriggerKind = /* @__PURE__ */ ((CompletionTriggerKind2) => {
  CompletionTriggerKind2[CompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerCharacter"] = 1] = "TriggerCharacter";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
  return CompletionTriggerKind2;
})(CompletionTriggerKind || {});
var ContentWidgetPositionPreference = /* @__PURE__ */ ((ContentWidgetPositionPreference2) => {
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["EXACT"] = 0] = "EXACT";
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["ABOVE"] = 1] = "ABOVE";
  ContentWidgetPositionPreference2[ContentWidgetPositionPreference2["BELOW"] = 2] = "BELOW";
  return ContentWidgetPositionPreference2;
})(ContentWidgetPositionPreference || {});
var CursorChangeReason = /* @__PURE__ */ ((CursorChangeReason2) => {
  CursorChangeReason2[CursorChangeReason2["NotSet"] = 0] = "NotSet";
  CursorChangeReason2[CursorChangeReason2["ContentFlush"] = 1] = "ContentFlush";
  CursorChangeReason2[CursorChangeReason2["RecoverFromMarkers"] = 2] = "RecoverFromMarkers";
  CursorChangeReason2[CursorChangeReason2["Explicit"] = 3] = "Explicit";
  CursorChangeReason2[CursorChangeReason2["Paste"] = 4] = "Paste";
  CursorChangeReason2[CursorChangeReason2["Undo"] = 5] = "Undo";
  CursorChangeReason2[CursorChangeReason2["Redo"] = 6] = "Redo";
  return CursorChangeReason2;
})(CursorChangeReason || {});
var DefaultEndOfLine = /* @__PURE__ */ ((DefaultEndOfLine2) => {
  DefaultEndOfLine2[DefaultEndOfLine2["LF"] = 1] = "LF";
  DefaultEndOfLine2[DefaultEndOfLine2["CRLF"] = 2] = "CRLF";
  return DefaultEndOfLine2;
})(DefaultEndOfLine || {});
var DocumentHighlightKind = /* @__PURE__ */ ((DocumentHighlightKind2) => {
  DocumentHighlightKind2[DocumentHighlightKind2["Text"] = 0] = "Text";
  DocumentHighlightKind2[DocumentHighlightKind2["Read"] = 1] = "Read";
  DocumentHighlightKind2[DocumentHighlightKind2["Write"] = 2] = "Write";
  return DocumentHighlightKind2;
})(DocumentHighlightKind || {});
var EditorAutoIndentStrategy = /* @__PURE__ */ ((EditorAutoIndentStrategy2) => {
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["None"] = 0] = "None";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Keep"] = 1] = "Keep";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Brackets"] = 2] = "Brackets";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Advanced"] = 3] = "Advanced";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Full"] = 4] = "Full";
  return EditorAutoIndentStrategy2;
})(EditorAutoIndentStrategy || {});
var EditorOption = /* @__PURE__ */ ((EditorOption2) => {
  EditorOption2[EditorOption2["acceptSuggestionOnCommitCharacter"] = 0] = "acceptSuggestionOnCommitCharacter";
  EditorOption2[EditorOption2["acceptSuggestionOnEnter"] = 1] = "acceptSuggestionOnEnter";
  EditorOption2[EditorOption2["accessibilitySupport"] = 2] = "accessibilitySupport";
  EditorOption2[EditorOption2["accessibilityPageSize"] = 3] = "accessibilityPageSize";
  EditorOption2[EditorOption2["allowOverflow"] = 4] = "allowOverflow";
  EditorOption2[EditorOption2["allowVariableLineHeights"] = 5] = "allowVariableLineHeights";
  EditorOption2[EditorOption2["allowVariableFonts"] = 6] = "allowVariableFonts";
  EditorOption2[EditorOption2["allowVariableFontsInAccessibilityMode"] = 7] = "allowVariableFontsInAccessibilityMode";
  EditorOption2[EditorOption2["ariaLabel"] = 8] = "ariaLabel";
  EditorOption2[EditorOption2["ariaRequired"] = 9] = "ariaRequired";
  EditorOption2[EditorOption2["autoClosingBrackets"] = 10] = "autoClosingBrackets";
  EditorOption2[EditorOption2["autoClosingComments"] = 11] = "autoClosingComments";
  EditorOption2[EditorOption2["screenReaderAnnounceInlineSuggestion"] = 12] = "screenReaderAnnounceInlineSuggestion";
  EditorOption2[EditorOption2["autoClosingDelete"] = 13] = "autoClosingDelete";
  EditorOption2[EditorOption2["autoClosingOvertype"] = 14] = "autoClosingOvertype";
  EditorOption2[EditorOption2["autoClosingQuotes"] = 15] = "autoClosingQuotes";
  EditorOption2[EditorOption2["autoIndent"] = 16] = "autoIndent";
  EditorOption2[EditorOption2["autoIndentOnPaste"] = 17] = "autoIndentOnPaste";
  EditorOption2[EditorOption2["autoIndentOnPasteWithinString"] = 18] = "autoIndentOnPasteWithinString";
  EditorOption2[EditorOption2["automaticLayout"] = 19] = "automaticLayout";
  EditorOption2[EditorOption2["autoSurround"] = 20] = "autoSurround";
  EditorOption2[EditorOption2["bracketPairColorization"] = 21] = "bracketPairColorization";
  EditorOption2[EditorOption2["guides"] = 22] = "guides";
  EditorOption2[EditorOption2["codeLens"] = 23] = "codeLens";
  EditorOption2[EditorOption2["codeLensFontFamily"] = 24] = "codeLensFontFamily";
  EditorOption2[EditorOption2["codeLensFontSize"] = 25] = "codeLensFontSize";
  EditorOption2[EditorOption2["colorDecorators"] = 26] = "colorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsLimit"] = 27] = "colorDecoratorsLimit";
  EditorOption2[EditorOption2["columnSelection"] = 28] = "columnSelection";
  EditorOption2[EditorOption2["comments"] = 29] = "comments";
  EditorOption2[EditorOption2["contextmenu"] = 30] = "contextmenu";
  EditorOption2[EditorOption2["copyWithSyntaxHighlighting"] = 31] = "copyWithSyntaxHighlighting";
  EditorOption2[EditorOption2["cursorBlinking"] = 32] = "cursorBlinking";
  EditorOption2[EditorOption2["cursorSmoothCaretAnimation"] = 33] = "cursorSmoothCaretAnimation";
  EditorOption2[EditorOption2["cursorStyle"] = 34] = "cursorStyle";
  EditorOption2[EditorOption2["cursorSurroundingLines"] = 35] = "cursorSurroundingLines";
  EditorOption2[EditorOption2["cursorSurroundingLinesStyle"] = 36] = "cursorSurroundingLinesStyle";
  EditorOption2[EditorOption2["cursorWidth"] = 37] = "cursorWidth";
  EditorOption2[EditorOption2["cursorHeight"] = 38] = "cursorHeight";
  EditorOption2[EditorOption2["disableLayerHinting"] = 39] = "disableLayerHinting";
  EditorOption2[EditorOption2["disableMonospaceOptimizations"] = 40] = "disableMonospaceOptimizations";
  EditorOption2[EditorOption2["domReadOnly"] = 41] = "domReadOnly";
  EditorOption2[EditorOption2["dragAndDrop"] = 42] = "dragAndDrop";
  EditorOption2[EditorOption2["dropIntoEditor"] = 43] = "dropIntoEditor";
  EditorOption2[EditorOption2["editContext"] = 44] = "editContext";
  EditorOption2[EditorOption2["emptySelectionClipboard"] = 45] = "emptySelectionClipboard";
  EditorOption2[EditorOption2["experimentalGpuAcceleration"] = 46] = "experimentalGpuAcceleration";
  EditorOption2[EditorOption2["experimentalWhitespaceRendering"] = 47] = "experimentalWhitespaceRendering";
  EditorOption2[EditorOption2["extraEditorClassName"] = 48] = "extraEditorClassName";
  EditorOption2[EditorOption2["fastScrollSensitivity"] = 49] = "fastScrollSensitivity";
  EditorOption2[EditorOption2["find"] = 50] = "find";
  EditorOption2[EditorOption2["fixedOverflowWidgets"] = 51] = "fixedOverflowWidgets";
  EditorOption2[EditorOption2["folding"] = 52] = "folding";
  EditorOption2[EditorOption2["foldingStrategy"] = 53] = "foldingStrategy";
  EditorOption2[EditorOption2["foldingHighlight"] = 54] = "foldingHighlight";
  EditorOption2[EditorOption2["foldingImportsByDefault"] = 55] = "foldingImportsByDefault";
  EditorOption2[EditorOption2["foldingMaximumRegions"] = 56] = "foldingMaximumRegions";
  EditorOption2[EditorOption2["unfoldOnClickAfterEndOfLine"] = 57] = "unfoldOnClickAfterEndOfLine";
  EditorOption2[EditorOption2["fontFamily"] = 58] = "fontFamily";
  EditorOption2[EditorOption2["fontInfo"] = 59] = "fontInfo";
  EditorOption2[EditorOption2["fontLigatures"] = 60] = "fontLigatures";
  EditorOption2[EditorOption2["fontSize"] = 61] = "fontSize";
  EditorOption2[EditorOption2["fontWeight"] = 62] = "fontWeight";
  EditorOption2[EditorOption2["fontVariations"] = 63] = "fontVariations";
  EditorOption2[EditorOption2["formatOnPaste"] = 64] = "formatOnPaste";
  EditorOption2[EditorOption2["formatOnType"] = 65] = "formatOnType";
  EditorOption2[EditorOption2["glyphMargin"] = 66] = "glyphMargin";
  EditorOption2[EditorOption2["gotoLocation"] = 67] = "gotoLocation";
  EditorOption2[EditorOption2["hideCursorInOverviewRuler"] = 68] = "hideCursorInOverviewRuler";
  EditorOption2[EditorOption2["hover"] = 69] = "hover";
  EditorOption2[EditorOption2["inDiffEditor"] = 70] = "inDiffEditor";
  EditorOption2[EditorOption2["inlineSuggest"] = 71] = "inlineSuggest";
  EditorOption2[EditorOption2["letterSpacing"] = 72] = "letterSpacing";
  EditorOption2[EditorOption2["lightbulb"] = 73] = "lightbulb";
  EditorOption2[EditorOption2["lineDecorationsWidth"] = 74] = "lineDecorationsWidth";
  EditorOption2[EditorOption2["lineHeight"] = 75] = "lineHeight";
  EditorOption2[EditorOption2["lineNumbers"] = 76] = "lineNumbers";
  EditorOption2[EditorOption2["lineNumbersMinChars"] = 77] = "lineNumbersMinChars";
  EditorOption2[EditorOption2["linkedEditing"] = 78] = "linkedEditing";
  EditorOption2[EditorOption2["links"] = 79] = "links";
  EditorOption2[EditorOption2["matchBrackets"] = 80] = "matchBrackets";
  EditorOption2[EditorOption2["minimap"] = 81] = "minimap";
  EditorOption2[EditorOption2["mouseStyle"] = 82] = "mouseStyle";
  EditorOption2[EditorOption2["mouseWheelScrollSensitivity"] = 83] = "mouseWheelScrollSensitivity";
  EditorOption2[EditorOption2["mouseWheelZoom"] = 84] = "mouseWheelZoom";
  EditorOption2[EditorOption2["multiCursorMergeOverlapping"] = 85] = "multiCursorMergeOverlapping";
  EditorOption2[EditorOption2["multiCursorModifier"] = 86] = "multiCursorModifier";
  EditorOption2[EditorOption2["mouseMiddleClickAction"] = 87] = "mouseMiddleClickAction";
  EditorOption2[EditorOption2["multiCursorPaste"] = 88] = "multiCursorPaste";
  EditorOption2[EditorOption2["multiCursorLimit"] = 89] = "multiCursorLimit";
  EditorOption2[EditorOption2["occurrencesHighlight"] = 90] = "occurrencesHighlight";
  EditorOption2[EditorOption2["occurrencesHighlightDelay"] = 91] = "occurrencesHighlightDelay";
  EditorOption2[EditorOption2["overtypeCursorStyle"] = 92] = "overtypeCursorStyle";
  EditorOption2[EditorOption2["overtypeOnPaste"] = 93] = "overtypeOnPaste";
  EditorOption2[EditorOption2["overviewRulerBorder"] = 94] = "overviewRulerBorder";
  EditorOption2[EditorOption2["overviewRulerLanes"] = 95] = "overviewRulerLanes";
  EditorOption2[EditorOption2["padding"] = 96] = "padding";
  EditorOption2[EditorOption2["pasteAs"] = 97] = "pasteAs";
  EditorOption2[EditorOption2["parameterHints"] = 98] = "parameterHints";
  EditorOption2[EditorOption2["peekWidgetDefaultFocus"] = 99] = "peekWidgetDefaultFocus";
  EditorOption2[EditorOption2["placeholder"] = 100] = "placeholder";
  EditorOption2[EditorOption2["definitionLinkOpensInPeek"] = 101] = "definitionLinkOpensInPeek";
  EditorOption2[EditorOption2["quickSuggestions"] = 102] = "quickSuggestions";
  EditorOption2[EditorOption2["quickSuggestionsDelay"] = 103] = "quickSuggestionsDelay";
  EditorOption2[EditorOption2["readOnly"] = 104] = "readOnly";
  EditorOption2[EditorOption2["readOnlyMessage"] = 105] = "readOnlyMessage";
  EditorOption2[EditorOption2["renameOnType"] = 106] = "renameOnType";
  EditorOption2[EditorOption2["renderRichScreenReaderContent"] = 107] = "renderRichScreenReaderContent";
  EditorOption2[EditorOption2["renderControlCharacters"] = 108] = "renderControlCharacters";
  EditorOption2[EditorOption2["renderFinalNewline"] = 109] = "renderFinalNewline";
  EditorOption2[EditorOption2["renderLineHighlight"] = 110] = "renderLineHighlight";
  EditorOption2[EditorOption2["renderLineHighlightOnlyWhenFocus"] = 111] = "renderLineHighlightOnlyWhenFocus";
  EditorOption2[EditorOption2["renderValidationDecorations"] = 112] = "renderValidationDecorations";
  EditorOption2[EditorOption2["renderWhitespace"] = 113] = "renderWhitespace";
  EditorOption2[EditorOption2["revealHorizontalRightPadding"] = 114] = "revealHorizontalRightPadding";
  EditorOption2[EditorOption2["roundedSelection"] = 115] = "roundedSelection";
  EditorOption2[EditorOption2["rulers"] = 116] = "rulers";
  EditorOption2[EditorOption2["scrollbar"] = 117] = "scrollbar";
  EditorOption2[EditorOption2["scrollBeyondLastColumn"] = 118] = "scrollBeyondLastColumn";
  EditorOption2[EditorOption2["scrollBeyondLastLine"] = 119] = "scrollBeyondLastLine";
  EditorOption2[EditorOption2["scrollPredominantAxis"] = 120] = "scrollPredominantAxis";
  EditorOption2[EditorOption2["selectionClipboard"] = 121] = "selectionClipboard";
  EditorOption2[EditorOption2["selectionHighlight"] = 122] = "selectionHighlight";
  EditorOption2[EditorOption2["selectionHighlightMaxLength"] = 123] = "selectionHighlightMaxLength";
  EditorOption2[EditorOption2["selectionHighlightMultiline"] = 124] = "selectionHighlightMultiline";
  EditorOption2[EditorOption2["selectOnLineNumbers"] = 125] = "selectOnLineNumbers";
  EditorOption2[EditorOption2["showFoldingControls"] = 126] = "showFoldingControls";
  EditorOption2[EditorOption2["showUnused"] = 127] = "showUnused";
  EditorOption2[EditorOption2["snippetSuggestions"] = 128] = "snippetSuggestions";
  EditorOption2[EditorOption2["smartSelect"] = 129] = "smartSelect";
  EditorOption2[EditorOption2["smoothScrolling"] = 130] = "smoothScrolling";
  EditorOption2[EditorOption2["stickyScroll"] = 131] = "stickyScroll";
  EditorOption2[EditorOption2["stickyTabStops"] = 132] = "stickyTabStops";
  EditorOption2[EditorOption2["stopRenderingLineAfter"] = 133] = "stopRenderingLineAfter";
  EditorOption2[EditorOption2["suggest"] = 134] = "suggest";
  EditorOption2[EditorOption2["suggestFontSize"] = 135] = "suggestFontSize";
  EditorOption2[EditorOption2["suggestLineHeight"] = 136] = "suggestLineHeight";
  EditorOption2[EditorOption2["suggestOnTriggerCharacters"] = 137] = "suggestOnTriggerCharacters";
  EditorOption2[EditorOption2["suggestSelection"] = 138] = "suggestSelection";
  EditorOption2[EditorOption2["tabCompletion"] = 139] = "tabCompletion";
  EditorOption2[EditorOption2["tabIndex"] = 140] = "tabIndex";
  EditorOption2[EditorOption2["trimWhitespaceOnDelete"] = 141] = "trimWhitespaceOnDelete";
  EditorOption2[EditorOption2["unicodeHighlighting"] = 142] = "unicodeHighlighting";
  EditorOption2[EditorOption2["unusualLineTerminators"] = 143] = "unusualLineTerminators";
  EditorOption2[EditorOption2["useShadowDOM"] = 144] = "useShadowDOM";
  EditorOption2[EditorOption2["useTabStops"] = 145] = "useTabStops";
  EditorOption2[EditorOption2["wordBreak"] = 146] = "wordBreak";
  EditorOption2[EditorOption2["wordSegmenterLocales"] = 147] = "wordSegmenterLocales";
  EditorOption2[EditorOption2["wordSeparators"] = 148] = "wordSeparators";
  EditorOption2[EditorOption2["wordWrap"] = 149] = "wordWrap";
  EditorOption2[EditorOption2["wordWrapBreakAfterCharacters"] = 150] = "wordWrapBreakAfterCharacters";
  EditorOption2[EditorOption2["wordWrapBreakBeforeCharacters"] = 151] = "wordWrapBreakBeforeCharacters";
  EditorOption2[EditorOption2["wordWrapColumn"] = 152] = "wordWrapColumn";
  EditorOption2[EditorOption2["wordWrapOverride1"] = 153] = "wordWrapOverride1";
  EditorOption2[EditorOption2["wordWrapOverride2"] = 154] = "wordWrapOverride2";
  EditorOption2[EditorOption2["wrappingIndent"] = 155] = "wrappingIndent";
  EditorOption2[EditorOption2["wrappingStrategy"] = 156] = "wrappingStrategy";
  EditorOption2[EditorOption2["showDeprecated"] = 157] = "showDeprecated";
  EditorOption2[EditorOption2["inertialScroll"] = 158] = "inertialScroll";
  EditorOption2[EditorOption2["inlayHints"] = 159] = "inlayHints";
  EditorOption2[EditorOption2["wrapOnEscapedLineFeeds"] = 160] = "wrapOnEscapedLineFeeds";
  EditorOption2[EditorOption2["effectiveCursorStyle"] = 161] = "effectiveCursorStyle";
  EditorOption2[EditorOption2["editorClassName"] = 162] = "editorClassName";
  EditorOption2[EditorOption2["pixelRatio"] = 163] = "pixelRatio";
  EditorOption2[EditorOption2["tabFocusMode"] = 164] = "tabFocusMode";
  EditorOption2[EditorOption2["layoutInfo"] = 165] = "layoutInfo";
  EditorOption2[EditorOption2["wrappingInfo"] = 166] = "wrappingInfo";
  EditorOption2[EditorOption2["defaultColorDecorators"] = 167] = "defaultColorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsActivatedOn"] = 168] = "colorDecoratorsActivatedOn";
  EditorOption2[EditorOption2["inlineCompletionsAccessibilityVerbose"] = 169] = "inlineCompletionsAccessibilityVerbose";
  EditorOption2[EditorOption2["effectiveEditContext"] = 170] = "effectiveEditContext";
  EditorOption2[EditorOption2["scrollOnMiddleClick"] = 171] = "scrollOnMiddleClick";
  EditorOption2[EditorOption2["effectiveAllowVariableFonts"] = 172] = "effectiveAllowVariableFonts";
  EditorOption2[EditorOption2["doubleClickSelectsBlock"] = 173] = "doubleClickSelectsBlock";
  return EditorOption2;
})(EditorOption || {});
var EndOfLinePreference = /* @__PURE__ */ ((EndOfLinePreference2) => {
  EndOfLinePreference2[EndOfLinePreference2["TextDefined"] = 0] = "TextDefined";
  EndOfLinePreference2[EndOfLinePreference2["LF"] = 1] = "LF";
  EndOfLinePreference2[EndOfLinePreference2["CRLF"] = 2] = "CRLF";
  return EndOfLinePreference2;
})(EndOfLinePreference || {});
var EndOfLineSequence = /* @__PURE__ */ ((EndOfLineSequence2) => {
  EndOfLineSequence2[EndOfLineSequence2["LF"] = 0] = "LF";
  EndOfLineSequence2[EndOfLineSequence2["CRLF"] = 1] = "CRLF";
  return EndOfLineSequence2;
})(EndOfLineSequence || {});
var GlyphMarginLane = /* @__PURE__ */ ((GlyphMarginLane2) => {
  GlyphMarginLane2[GlyphMarginLane2["Left"] = 1] = "Left";
  GlyphMarginLane2[GlyphMarginLane2["Center"] = 2] = "Center";
  GlyphMarginLane2[GlyphMarginLane2["Right"] = 3] = "Right";
  return GlyphMarginLane2;
})(GlyphMarginLane || {});
var HoverVerbosityAction = /* @__PURE__ */ ((HoverVerbosityAction2) => {
  HoverVerbosityAction2[HoverVerbosityAction2["Increase"] = 0] = "Increase";
  HoverVerbosityAction2[HoverVerbosityAction2["Decrease"] = 1] = "Decrease";
  return HoverVerbosityAction2;
})(HoverVerbosityAction || {});
var IndentAction = /* @__PURE__ */ ((IndentAction2) => {
  IndentAction2[IndentAction2["None"] = 0] = "None";
  IndentAction2[IndentAction2["Indent"] = 1] = "Indent";
  IndentAction2[IndentAction2["IndentOutdent"] = 2] = "IndentOutdent";
  IndentAction2[IndentAction2["Outdent"] = 3] = "Outdent";
  return IndentAction2;
})(IndentAction || {});
var InjectedTextCursorStops = /* @__PURE__ */ ((InjectedTextCursorStops2) => {
  InjectedTextCursorStops2[InjectedTextCursorStops2["Both"] = 0] = "Both";
  InjectedTextCursorStops2[InjectedTextCursorStops2["Right"] = 1] = "Right";
  InjectedTextCursorStops2[InjectedTextCursorStops2["Left"] = 2] = "Left";
  InjectedTextCursorStops2[InjectedTextCursorStops2["None"] = 3] = "None";
  return InjectedTextCursorStops2;
})(InjectedTextCursorStops || {});
var InlayHintKind = /* @__PURE__ */ ((InlayHintKind2) => {
  InlayHintKind2[InlayHintKind2["Type"] = 1] = "Type";
  InlayHintKind2[InlayHintKind2["Parameter"] = 2] = "Parameter";
  return InlayHintKind2;
})(InlayHintKind || {});
var InlineCompletionEndOfLifeReasonKind = /* @__PURE__ */ ((InlineCompletionEndOfLifeReasonKind2) => {
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Accepted"] = 0] = "Accepted";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Rejected"] = 1] = "Rejected";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Ignored"] = 2] = "Ignored";
  return InlineCompletionEndOfLifeReasonKind2;
})(InlineCompletionEndOfLifeReasonKind || {});
var InlineCompletionHintStyle = /* @__PURE__ */ ((InlineCompletionHintStyle2) => {
  InlineCompletionHintStyle2[InlineCompletionHintStyle2["Code"] = 1] = "Code";
  InlineCompletionHintStyle2[InlineCompletionHintStyle2["Label"] = 2] = "Label";
  return InlineCompletionHintStyle2;
})(InlineCompletionHintStyle || {});
var InlineCompletionTriggerKind = /* @__PURE__ */ ((InlineCompletionTriggerKind2) => {
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Automatic"] = 0] = "Automatic";
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Explicit"] = 1] = "Explicit";
  return InlineCompletionTriggerKind2;
})(InlineCompletionTriggerKind || {});
var KeyCode = /* @__PURE__ */ ((KeyCode2) => {
  KeyCode2[KeyCode2["DependsOnKbLayout"] = -1] = "DependsOnKbLayout";
  KeyCode2[KeyCode2["Unknown"] = 0] = "Unknown";
  KeyCode2[KeyCode2["Backspace"] = 1] = "Backspace";
  KeyCode2[KeyCode2["Tab"] = 2] = "Tab";
  KeyCode2[KeyCode2["Enter"] = 3] = "Enter";
  KeyCode2[KeyCode2["Shift"] = 4] = "Shift";
  KeyCode2[KeyCode2["Ctrl"] = 5] = "Ctrl";
  KeyCode2[KeyCode2["Alt"] = 6] = "Alt";
  KeyCode2[KeyCode2["PauseBreak"] = 7] = "PauseBreak";
  KeyCode2[KeyCode2["CapsLock"] = 8] = "CapsLock";
  KeyCode2[KeyCode2["Escape"] = 9] = "Escape";
  KeyCode2[KeyCode2["Space"] = 10] = "Space";
  KeyCode2[KeyCode2["PageUp"] = 11] = "PageUp";
  KeyCode2[KeyCode2["PageDown"] = 12] = "PageDown";
  KeyCode2[KeyCode2["End"] = 13] = "End";
  KeyCode2[KeyCode2["Home"] = 14] = "Home";
  KeyCode2[KeyCode2["LeftArrow"] = 15] = "LeftArrow";
  KeyCode2[KeyCode2["UpArrow"] = 16] = "UpArrow";
  KeyCode2[KeyCode2["RightArrow"] = 17] = "RightArrow";
  KeyCode2[KeyCode2["DownArrow"] = 18] = "DownArrow";
  KeyCode2[KeyCode2["Insert"] = 19] = "Insert";
  KeyCode2[KeyCode2["Delete"] = 20] = "Delete";
  KeyCode2[KeyCode2["Digit0"] = 21] = "Digit0";
  KeyCode2[KeyCode2["Digit1"] = 22] = "Digit1";
  KeyCode2[KeyCode2["Digit2"] = 23] = "Digit2";
  KeyCode2[KeyCode2["Digit3"] = 24] = "Digit3";
  KeyCode2[KeyCode2["Digit4"] = 25] = "Digit4";
  KeyCode2[KeyCode2["Digit5"] = 26] = "Digit5";
  KeyCode2[KeyCode2["Digit6"] = 27] = "Digit6";
  KeyCode2[KeyCode2["Digit7"] = 28] = "Digit7";
  KeyCode2[KeyCode2["Digit8"] = 29] = "Digit8";
  KeyCode2[KeyCode2["Digit9"] = 30] = "Digit9";
  KeyCode2[KeyCode2["KeyA"] = 31] = "KeyA";
  KeyCode2[KeyCode2["KeyB"] = 32] = "KeyB";
  KeyCode2[KeyCode2["KeyC"] = 33] = "KeyC";
  KeyCode2[KeyCode2["KeyD"] = 34] = "KeyD";
  KeyCode2[KeyCode2["KeyE"] = 35] = "KeyE";
  KeyCode2[KeyCode2["KeyF"] = 36] = "KeyF";
  KeyCode2[KeyCode2["KeyG"] = 37] = "KeyG";
  KeyCode2[KeyCode2["KeyH"] = 38] = "KeyH";
  KeyCode2[KeyCode2["KeyI"] = 39] = "KeyI";
  KeyCode2[KeyCode2["KeyJ"] = 40] = "KeyJ";
  KeyCode2[KeyCode2["KeyK"] = 41] = "KeyK";
  KeyCode2[KeyCode2["KeyL"] = 42] = "KeyL";
  KeyCode2[KeyCode2["KeyM"] = 43] = "KeyM";
  KeyCode2[KeyCode2["KeyN"] = 44] = "KeyN";
  KeyCode2[KeyCode2["KeyO"] = 45] = "KeyO";
  KeyCode2[KeyCode2["KeyP"] = 46] = "KeyP";
  KeyCode2[KeyCode2["KeyQ"] = 47] = "KeyQ";
  KeyCode2[KeyCode2["KeyR"] = 48] = "KeyR";
  KeyCode2[KeyCode2["KeyS"] = 49] = "KeyS";
  KeyCode2[KeyCode2["KeyT"] = 50] = "KeyT";
  KeyCode2[KeyCode2["KeyU"] = 51] = "KeyU";
  KeyCode2[KeyCode2["KeyV"] = 52] = "KeyV";
  KeyCode2[KeyCode2["KeyW"] = 53] = "KeyW";
  KeyCode2[KeyCode2["KeyX"] = 54] = "KeyX";
  KeyCode2[KeyCode2["KeyY"] = 55] = "KeyY";
  KeyCode2[KeyCode2["KeyZ"] = 56] = "KeyZ";
  KeyCode2[KeyCode2["Meta"] = 57] = "Meta";
  KeyCode2[KeyCode2["ContextMenu"] = 58] = "ContextMenu";
  KeyCode2[KeyCode2["F1"] = 59] = "F1";
  KeyCode2[KeyCode2["F2"] = 60] = "F2";
  KeyCode2[KeyCode2["F3"] = 61] = "F3";
  KeyCode2[KeyCode2["F4"] = 62] = "F4";
  KeyCode2[KeyCode2["F5"] = 63] = "F5";
  KeyCode2[KeyCode2["F6"] = 64] = "F6";
  KeyCode2[KeyCode2["F7"] = 65] = "F7";
  KeyCode2[KeyCode2["F8"] = 66] = "F8";
  KeyCode2[KeyCode2["F9"] = 67] = "F9";
  KeyCode2[KeyCode2["F10"] = 68] = "F10";
  KeyCode2[KeyCode2["F11"] = 69] = "F11";
  KeyCode2[KeyCode2["F12"] = 70] = "F12";
  KeyCode2[KeyCode2["F13"] = 71] = "F13";
  KeyCode2[KeyCode2["F14"] = 72] = "F14";
  KeyCode2[KeyCode2["F15"] = 73] = "F15";
  KeyCode2[KeyCode2["F16"] = 74] = "F16";
  KeyCode2[KeyCode2["F17"] = 75] = "F17";
  KeyCode2[KeyCode2["F18"] = 76] = "F18";
  KeyCode2[KeyCode2["F19"] = 77] = "F19";
  KeyCode2[KeyCode2["F20"] = 78] = "F20";
  KeyCode2[KeyCode2["F21"] = 79] = "F21";
  KeyCode2[KeyCode2["F22"] = 80] = "F22";
  KeyCode2[KeyCode2["F23"] = 81] = "F23";
  KeyCode2[KeyCode2["F24"] = 82] = "F24";
  KeyCode2[KeyCode2["NumLock"] = 83] = "NumLock";
  KeyCode2[KeyCode2["ScrollLock"] = 84] = "ScrollLock";
  KeyCode2[KeyCode2["Semicolon"] = 85] = "Semicolon";
  KeyCode2[KeyCode2["Equal"] = 86] = "Equal";
  KeyCode2[KeyCode2["Comma"] = 87] = "Comma";
  KeyCode2[KeyCode2["Minus"] = 88] = "Minus";
  KeyCode2[KeyCode2["Period"] = 89] = "Period";
  KeyCode2[KeyCode2["Slash"] = 90] = "Slash";
  KeyCode2[KeyCode2["Backquote"] = 91] = "Backquote";
  KeyCode2[KeyCode2["BracketLeft"] = 92] = "BracketLeft";
  KeyCode2[KeyCode2["Backslash"] = 93] = "Backslash";
  KeyCode2[KeyCode2["BracketRight"] = 94] = "BracketRight";
  KeyCode2[KeyCode2["Quote"] = 95] = "Quote";
  KeyCode2[KeyCode2["OEM_8"] = 96] = "OEM_8";
  KeyCode2[KeyCode2["IntlBackslash"] = 97] = "IntlBackslash";
  KeyCode2[KeyCode2["Numpad0"] = 98] = "Numpad0";
  KeyCode2[KeyCode2["Numpad1"] = 99] = "Numpad1";
  KeyCode2[KeyCode2["Numpad2"] = 100] = "Numpad2";
  KeyCode2[KeyCode2["Numpad3"] = 101] = "Numpad3";
  KeyCode2[KeyCode2["Numpad4"] = 102] = "Numpad4";
  KeyCode2[KeyCode2["Numpad5"] = 103] = "Numpad5";
  KeyCode2[KeyCode2["Numpad6"] = 104] = "Numpad6";
  KeyCode2[KeyCode2["Numpad7"] = 105] = "Numpad7";
  KeyCode2[KeyCode2["Numpad8"] = 106] = "Numpad8";
  KeyCode2[KeyCode2["Numpad9"] = 107] = "Numpad9";
  KeyCode2[KeyCode2["NumpadMultiply"] = 108] = "NumpadMultiply";
  KeyCode2[KeyCode2["NumpadAdd"] = 109] = "NumpadAdd";
  KeyCode2[KeyCode2["NUMPAD_SEPARATOR"] = 110] = "NUMPAD_SEPARATOR";
  KeyCode2[KeyCode2["NumpadSubtract"] = 111] = "NumpadSubtract";
  KeyCode2[KeyCode2["NumpadDecimal"] = 112] = "NumpadDecimal";
  KeyCode2[KeyCode2["NumpadDivide"] = 113] = "NumpadDivide";
  KeyCode2[KeyCode2["KEY_IN_COMPOSITION"] = 114] = "KEY_IN_COMPOSITION";
  KeyCode2[KeyCode2["ABNT_C1"] = 115] = "ABNT_C1";
  KeyCode2[KeyCode2["ABNT_C2"] = 116] = "ABNT_C2";
  KeyCode2[KeyCode2["AudioVolumeMute"] = 117] = "AudioVolumeMute";
  KeyCode2[KeyCode2["AudioVolumeUp"] = 118] = "AudioVolumeUp";
  KeyCode2[KeyCode2["AudioVolumeDown"] = 119] = "AudioVolumeDown";
  KeyCode2[KeyCode2["BrowserSearch"] = 120] = "BrowserSearch";
  KeyCode2[KeyCode2["BrowserHome"] = 121] = "BrowserHome";
  KeyCode2[KeyCode2["BrowserBack"] = 122] = "BrowserBack";
  KeyCode2[KeyCode2["BrowserForward"] = 123] = "BrowserForward";
  KeyCode2[KeyCode2["MediaTrackNext"] = 124] = "MediaTrackNext";
  KeyCode2[KeyCode2["MediaTrackPrevious"] = 125] = "MediaTrackPrevious";
  KeyCode2[KeyCode2["MediaStop"] = 126] = "MediaStop";
  KeyCode2[KeyCode2["MediaPlayPause"] = 127] = "MediaPlayPause";
  KeyCode2[KeyCode2["LaunchMediaPlayer"] = 128] = "LaunchMediaPlayer";
  KeyCode2[KeyCode2["LaunchMail"] = 129] = "LaunchMail";
  KeyCode2[KeyCode2["LaunchApp2"] = 130] = "LaunchApp2";
  KeyCode2[KeyCode2["Clear"] = 131] = "Clear";
  KeyCode2[KeyCode2["MAX_VALUE"] = 132] = "MAX_VALUE";
  return KeyCode2;
})(KeyCode || {});
var MarkerSeverity = /* @__PURE__ */ ((MarkerSeverity2) => {
  MarkerSeverity2[MarkerSeverity2["Hint"] = 1] = "Hint";
  MarkerSeverity2[MarkerSeverity2["Info"] = 2] = "Info";
  MarkerSeverity2[MarkerSeverity2["Warning"] = 4] = "Warning";
  MarkerSeverity2[MarkerSeverity2["Error"] = 8] = "Error";
  return MarkerSeverity2;
})(MarkerSeverity || {});
var MarkerTag = /* @__PURE__ */ ((MarkerTag2) => {
  MarkerTag2[MarkerTag2["Unnecessary"] = 1] = "Unnecessary";
  MarkerTag2[MarkerTag2["Deprecated"] = 2] = "Deprecated";
  return MarkerTag2;
})(MarkerTag || {});
var MinimapPosition = /* @__PURE__ */ ((MinimapPosition2) => {
  MinimapPosition2[MinimapPosition2["Inline"] = 1] = "Inline";
  MinimapPosition2[MinimapPosition2["Gutter"] = 2] = "Gutter";
  return MinimapPosition2;
})(MinimapPosition || {});
var MinimapSectionHeaderStyle = /* @__PURE__ */ ((MinimapSectionHeaderStyle2) => {
  MinimapSectionHeaderStyle2[MinimapSectionHeaderStyle2["Normal"] = 1] = "Normal";
  MinimapSectionHeaderStyle2[MinimapSectionHeaderStyle2["Underlined"] = 2] = "Underlined";
  return MinimapSectionHeaderStyle2;
})(MinimapSectionHeaderStyle || {});
var MouseTargetType = /* @__PURE__ */ ((MouseTargetType2) => {
  MouseTargetType2[MouseTargetType2["UNKNOWN"] = 0] = "UNKNOWN";
  MouseTargetType2[MouseTargetType2["TEXTAREA"] = 1] = "TEXTAREA";
  MouseTargetType2[MouseTargetType2["GUTTER_GLYPH_MARGIN"] = 2] = "GUTTER_GLYPH_MARGIN";
  MouseTargetType2[MouseTargetType2["GUTTER_LINE_NUMBERS"] = 3] = "GUTTER_LINE_NUMBERS";
  MouseTargetType2[MouseTargetType2["GUTTER_LINE_DECORATIONS"] = 4] = "GUTTER_LINE_DECORATIONS";
  MouseTargetType2[MouseTargetType2["GUTTER_VIEW_ZONE"] = 5] = "GUTTER_VIEW_ZONE";
  MouseTargetType2[MouseTargetType2["CONTENT_TEXT"] = 6] = "CONTENT_TEXT";
  MouseTargetType2[MouseTargetType2["CONTENT_EMPTY"] = 7] = "CONTENT_EMPTY";
  MouseTargetType2[MouseTargetType2["CONTENT_VIEW_ZONE"] = 8] = "CONTENT_VIEW_ZONE";
  MouseTargetType2[MouseTargetType2["CONTENT_WIDGET"] = 9] = "CONTENT_WIDGET";
  MouseTargetType2[MouseTargetType2["OVERVIEW_RULER"] = 10] = "OVERVIEW_RULER";
  MouseTargetType2[MouseTargetType2["SCROLLBAR"] = 11] = "SCROLLBAR";
  MouseTargetType2[MouseTargetType2["OVERLAY_WIDGET"] = 12] = "OVERLAY_WIDGET";
  MouseTargetType2[MouseTargetType2["OUTSIDE_EDITOR"] = 13] = "OUTSIDE_EDITOR";
  return MouseTargetType2;
})(MouseTargetType || {});
var NewSymbolNameTag = /* @__PURE__ */ ((NewSymbolNameTag2) => {
  NewSymbolNameTag2[NewSymbolNameTag2["AIGenerated"] = 1] = "AIGenerated";
  return NewSymbolNameTag2;
})(NewSymbolNameTag || {});
var NewSymbolNameTriggerKind = /* @__PURE__ */ ((NewSymbolNameTriggerKind2) => {
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Invoke"] = 0] = "Invoke";
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Automatic"] = 1] = "Automatic";
  return NewSymbolNameTriggerKind2;
})(NewSymbolNameTriggerKind || {});
var OverlayWidgetPositionPreference = /* @__PURE__ */ ((OverlayWidgetPositionPreference2) => {
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["TOP_RIGHT_CORNER"] = 0] = "TOP_RIGHT_CORNER";
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["BOTTOM_RIGHT_CORNER"] = 1] = "BOTTOM_RIGHT_CORNER";
  OverlayWidgetPositionPreference2[OverlayWidgetPositionPreference2["TOP_CENTER"] = 2] = "TOP_CENTER";
  return OverlayWidgetPositionPreference2;
})(OverlayWidgetPositionPreference || {});
var OverviewRulerLane = /* @__PURE__ */ ((OverviewRulerLane2) => {
  OverviewRulerLane2[OverviewRulerLane2["Left"] = 1] = "Left";
  OverviewRulerLane2[OverviewRulerLane2["Center"] = 2] = "Center";
  OverviewRulerLane2[OverviewRulerLane2["Right"] = 4] = "Right";
  OverviewRulerLane2[OverviewRulerLane2["Full"] = 7] = "Full";
  return OverviewRulerLane2;
})(OverviewRulerLane || {});
var PartialAcceptTriggerKind = /* @__PURE__ */ ((PartialAcceptTriggerKind2) => {
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Word"] = 0] = "Word";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Line"] = 1] = "Line";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Suggest"] = 2] = "Suggest";
  return PartialAcceptTriggerKind2;
})(PartialAcceptTriggerKind || {});
var PositionAffinity = /* @__PURE__ */ ((PositionAffinity2) => {
  PositionAffinity2[PositionAffinity2["Left"] = 0] = "Left";
  PositionAffinity2[PositionAffinity2["Right"] = 1] = "Right";
  PositionAffinity2[PositionAffinity2["None"] = 2] = "None";
  PositionAffinity2[PositionAffinity2["LeftOfInjectedText"] = 3] = "LeftOfInjectedText";
  PositionAffinity2[PositionAffinity2["RightOfInjectedText"] = 4] = "RightOfInjectedText";
  return PositionAffinity2;
})(PositionAffinity || {});
var RenderLineNumbersType = /* @__PURE__ */ ((RenderLineNumbersType2) => {
  RenderLineNumbersType2[RenderLineNumbersType2["Off"] = 0] = "Off";
  RenderLineNumbersType2[RenderLineNumbersType2["On"] = 1] = "On";
  RenderLineNumbersType2[RenderLineNumbersType2["Relative"] = 2] = "Relative";
  RenderLineNumbersType2[RenderLineNumbersType2["Interval"] = 3] = "Interval";
  RenderLineNumbersType2[RenderLineNumbersType2["Custom"] = 4] = "Custom";
  return RenderLineNumbersType2;
})(RenderLineNumbersType || {});
var RenderMinimap = /* @__PURE__ */ ((RenderMinimap2) => {
  RenderMinimap2[RenderMinimap2["None"] = 0] = "None";
  RenderMinimap2[RenderMinimap2["Text"] = 1] = "Text";
  RenderMinimap2[RenderMinimap2["Blocks"] = 2] = "Blocks";
  return RenderMinimap2;
})(RenderMinimap || {});
var ScrollType = /* @__PURE__ */ ((ScrollType2) => {
  ScrollType2[ScrollType2["Smooth"] = 0] = "Smooth";
  ScrollType2[ScrollType2["Immediate"] = 1] = "Immediate";
  return ScrollType2;
})(ScrollType || {});
var ScrollbarVisibility = /* @__PURE__ */ ((ScrollbarVisibility2) => {
  ScrollbarVisibility2[ScrollbarVisibility2["Auto"] = 1] = "Auto";
  ScrollbarVisibility2[ScrollbarVisibility2["Hidden"] = 2] = "Hidden";
  ScrollbarVisibility2[ScrollbarVisibility2["Visible"] = 3] = "Visible";
  return ScrollbarVisibility2;
})(ScrollbarVisibility || {});
var SelectionDirection = /* @__PURE__ */ ((SelectionDirection2) => {
  SelectionDirection2[SelectionDirection2["LTR"] = 0] = "LTR";
  SelectionDirection2[SelectionDirection2["RTL"] = 1] = "RTL";
  return SelectionDirection2;
})(SelectionDirection || {});
var ShowLightbulbIconMode = /* @__PURE__ */ ((ShowLightbulbIconMode2) => {
  ShowLightbulbIconMode2["Off"] = "off";
  ShowLightbulbIconMode2["OnCode"] = "onCode";
  ShowLightbulbIconMode2["On"] = "on";
  return ShowLightbulbIconMode2;
})(ShowLightbulbIconMode || {});
var SignatureHelpTriggerKind = /* @__PURE__ */ ((SignatureHelpTriggerKind2) => {
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["Invoke"] = 1] = "Invoke";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["TriggerCharacter"] = 2] = "TriggerCharacter";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["ContentChange"] = 3] = "ContentChange";
  return SignatureHelpTriggerKind2;
})(SignatureHelpTriggerKind || {});
var SymbolKind = /* @__PURE__ */ ((SymbolKind2) => {
  SymbolKind2[SymbolKind2["File"] = 0] = "File";
  SymbolKind2[SymbolKind2["Module"] = 1] = "Module";
  SymbolKind2[SymbolKind2["Namespace"] = 2] = "Namespace";
  SymbolKind2[SymbolKind2["Package"] = 3] = "Package";
  SymbolKind2[SymbolKind2["Class"] = 4] = "Class";
  SymbolKind2[SymbolKind2["Method"] = 5] = "Method";
  SymbolKind2[SymbolKind2["Property"] = 6] = "Property";
  SymbolKind2[SymbolKind2["Field"] = 7] = "Field";
  SymbolKind2[SymbolKind2["Constructor"] = 8] = "Constructor";
  SymbolKind2[SymbolKind2["Enum"] = 9] = "Enum";
  SymbolKind2[SymbolKind2["Interface"] = 10] = "Interface";
  SymbolKind2[SymbolKind2["Function"] = 11] = "Function";
  SymbolKind2[SymbolKind2["Variable"] = 12] = "Variable";
  SymbolKind2[SymbolKind2["Constant"] = 13] = "Constant";
  SymbolKind2[SymbolKind2["String"] = 14] = "String";
  SymbolKind2[SymbolKind2["Number"] = 15] = "Number";
  SymbolKind2[SymbolKind2["Boolean"] = 16] = "Boolean";
  SymbolKind2[SymbolKind2["Array"] = 17] = "Array";
  SymbolKind2[SymbolKind2["Object"] = 18] = "Object";
  SymbolKind2[SymbolKind2["Key"] = 19] = "Key";
  SymbolKind2[SymbolKind2["Null"] = 20] = "Null";
  SymbolKind2[SymbolKind2["EnumMember"] = 21] = "EnumMember";
  SymbolKind2[SymbolKind2["Struct"] = 22] = "Struct";
  SymbolKind2[SymbolKind2["Event"] = 23] = "Event";
  SymbolKind2[SymbolKind2["Operator"] = 24] = "Operator";
  SymbolKind2[SymbolKind2["TypeParameter"] = 25] = "TypeParameter";
  return SymbolKind2;
})(SymbolKind || {});
var SymbolTag = /* @__PURE__ */ ((SymbolTag2) => {
  SymbolTag2[SymbolTag2["Deprecated"] = 1] = "Deprecated";
  return SymbolTag2;
})(SymbolTag || {});
var TextDirection = /* @__PURE__ */ ((TextDirection2) => {
  TextDirection2[TextDirection2["LTR"] = 0] = "LTR";
  TextDirection2[TextDirection2["RTL"] = 1] = "RTL";
  return TextDirection2;
})(TextDirection || {});
var TextEditorCursorBlinkingStyle = /* @__PURE__ */ ((TextEditorCursorBlinkingStyle2) => {
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Hidden"] = 0] = "Hidden";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Blink"] = 1] = "Blink";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Smooth"] = 2] = "Smooth";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Phase"] = 3] = "Phase";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Expand"] = 4] = "Expand";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Solid"] = 5] = "Solid";
  return TextEditorCursorBlinkingStyle2;
})(TextEditorCursorBlinkingStyle || {});
var TextEditorCursorStyle = /* @__PURE__ */ ((TextEditorCursorStyle2) => {
  TextEditorCursorStyle2[TextEditorCursorStyle2["Line"] = 1] = "Line";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Block"] = 2] = "Block";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Underline"] = 3] = "Underline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["LineThin"] = 4] = "LineThin";
  TextEditorCursorStyle2[TextEditorCursorStyle2["BlockOutline"] = 5] = "BlockOutline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["UnderlineThin"] = 6] = "UnderlineThin";
  return TextEditorCursorStyle2;
})(TextEditorCursorStyle || {});
var TrackedRangeStickiness = /* @__PURE__ */ ((TrackedRangeStickiness2) => {
  TrackedRangeStickiness2[TrackedRangeStickiness2["AlwaysGrowsWhenTypingAtEdges"] = 0] = "AlwaysGrowsWhenTypingAtEdges";
  TrackedRangeStickiness2[TrackedRangeStickiness2["NeverGrowsWhenTypingAtEdges"] = 1] = "NeverGrowsWhenTypingAtEdges";
  TrackedRangeStickiness2[TrackedRangeStickiness2["GrowsOnlyWhenTypingBefore"] = 2] = "GrowsOnlyWhenTypingBefore";
  TrackedRangeStickiness2[TrackedRangeStickiness2["GrowsOnlyWhenTypingAfter"] = 3] = "GrowsOnlyWhenTypingAfter";
  return TrackedRangeStickiness2;
})(TrackedRangeStickiness || {});
var WrappingIndent = /* @__PURE__ */ ((WrappingIndent2) => {
  WrappingIndent2[WrappingIndent2["None"] = 0] = "None";
  WrappingIndent2[WrappingIndent2["Same"] = 1] = "Same";
  WrappingIndent2[WrappingIndent2["Indent"] = 2] = "Indent";
  WrappingIndent2[WrappingIndent2["DeepIndent"] = 3] = "DeepIndent";
  return WrappingIndent2;
})(WrappingIndent || {});
export {
  AccessibilitySupport,
  CodeActionTriggerType,
  CompletionItemInsertTextRule,
  CompletionItemKind,
  CompletionItemTag,
  CompletionTriggerKind,
  ContentWidgetPositionPreference,
  CursorChangeReason,
  DefaultEndOfLine,
  DocumentHighlightKind,
  EditorAutoIndentStrategy,
  EditorOption,
  EndOfLinePreference,
  EndOfLineSequence,
  GlyphMarginLane,
  HoverVerbosityAction,
  IndentAction,
  InjectedTextCursorStops,
  InlayHintKind,
  InlineCompletionEndOfLifeReasonKind,
  InlineCompletionHintStyle,
  InlineCompletionTriggerKind,
  KeyCode,
  MarkerSeverity,
  MarkerTag,
  MinimapPosition,
  MinimapSectionHeaderStyle,
  MouseTargetType,
  NewSymbolNameTag,
  NewSymbolNameTriggerKind,
  OverlayWidgetPositionPreference,
  OverviewRulerLane,
  PartialAcceptTriggerKind,
  PositionAffinity,
  RenderLineNumbersType,
  RenderMinimap,
  ScrollType,
  ScrollbarVisibility,
  SelectionDirection,
  ShowLightbulbIconMode,
  SignatureHelpTriggerKind,
  SymbolKind,
  SymbolTag,
  TextDirection,
  TextEditorCursorBlinkingStyle,
  TextEditorCursorStyle,
  TrackedRangeStickiness,
  WrappingIndent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc3RhbmRhbG9uZS9zdGFuZGFsb25lRW51bXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBUSElTIElTIEEgR0VORVJBVEVEIEZJTEUuIERPIE5PVCBFRElUIERJUkVDVExZLlxuXG5cbmV4cG9ydCBlbnVtIEFjY2Vzc2liaWxpdHlTdXBwb3J0IHtcblx0LyoqXG5cdCAqIFRoaXMgc2hvdWxkIGJlIHRoZSBicm93c2VyIGNhc2Ugd2hlcmUgaXQgaXMgbm90IGtub3duIGlmIGEgc2NyZWVuIHJlYWRlciBpcyBhdHRhY2hlZCBvciBuby5cblx0ICovXG5cdFVua25vd24gPSAwLFxuXHREaXNhYmxlZCA9IDEsXG5cdEVuYWJsZWQgPSAyXG59XG5cbmV4cG9ydCBlbnVtIENvZGVBY3Rpb25UcmlnZ2VyVHlwZSB7XG5cdEludm9rZSA9IDEsXG5cdEF1dG8gPSAyXG59XG5cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUge1xuXHROb25lID0gMCxcblx0LyoqXG5cdCAqIEFkanVzdCB3aGl0ZXNwYWNlL2luZGVudGF0aW9uIG9mIG11bHRpbGluZSBpbnNlcnQgdGV4dHMgdG9cblx0ICogbWF0Y2ggdGhlIGN1cnJlbnQgbGluZSBpbmRlbnRhdGlvbi5cblx0ICovXG5cdEtlZXBXaGl0ZXNwYWNlID0gMSxcblx0LyoqXG5cdCAqIGBpbnNlcnRUZXh0YCBpcyBhIHNuaXBwZXQuXG5cdCAqL1xuXHRJbnNlcnRBc1NuaXBwZXQgPSA0XG59XG5cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25JdGVtS2luZCB7XG5cdE1ldGhvZCA9IDAsXG5cdEZ1bmN0aW9uID0gMSxcblx0Q29uc3RydWN0b3IgPSAyLFxuXHRGaWVsZCA9IDMsXG5cdFZhcmlhYmxlID0gNCxcblx0Q2xhc3MgPSA1LFxuXHRTdHJ1Y3QgPSA2LFxuXHRJbnRlcmZhY2UgPSA3LFxuXHRNb2R1bGUgPSA4LFxuXHRQcm9wZXJ0eSA9IDksXG5cdEV2ZW50ID0gMTAsXG5cdE9wZXJhdG9yID0gMTEsXG5cdFVuaXQgPSAxMixcblx0VmFsdWUgPSAxMyxcblx0Q29uc3RhbnQgPSAxNCxcblx0RW51bSA9IDE1LFxuXHRFbnVtTWVtYmVyID0gMTYsXG5cdEtleXdvcmQgPSAxNyxcblx0VGV4dCA9IDE4LFxuXHRDb2xvciA9IDE5LFxuXHRGaWxlID0gMjAsXG5cdFJlZmVyZW5jZSA9IDIxLFxuXHRDdXN0b21jb2xvciA9IDIyLFxuXHRGb2xkZXIgPSAyMyxcblx0VHlwZVBhcmFtZXRlciA9IDI0LFxuXHRVc2VyID0gMjUsXG5cdElzc3VlID0gMjYsXG5cdFRvb2wgPSAyNyxcblx0U25pcHBldCA9IDI4XG59XG5cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25JdGVtVGFnIHtcblx0RGVwcmVjYXRlZCA9IDFcbn1cblxuLyoqXG4gKiBIb3cgYSBzdWdnZXN0IHByb3ZpZGVyIHdhcyB0cmlnZ2VyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25UcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDAsXG5cdFRyaWdnZXJDaGFyYWN0ZXIgPSAxLFxuXHRUcmlnZ2VyRm9ySW5jb21wbGV0ZUNvbXBsZXRpb25zID0gMlxufVxuXG4vKipcbiAqIEEgcG9zaXRpb25pbmcgcHJlZmVyZW5jZSBmb3IgcmVuZGVyaW5nIGNvbnRlbnQgd2lkZ2V0cy5cbiAqL1xuZXhwb3J0IGVudW0gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB7XG5cdC8qKlxuXHQgKiBQbGFjZSB0aGUgY29udGVudCB3aWRnZXQgZXhhY3RseSBhdCBhIHBvc2l0aW9uXG5cdCAqL1xuXHRFWEFDVCA9IDAsXG5cdC8qKlxuXHQgKiBQbGFjZSB0aGUgY29udGVudCB3aWRnZXQgYWJvdmUgYSBwb3NpdGlvblxuXHQgKi9cblx0QUJPVkUgPSAxLFxuXHQvKipcblx0ICogUGxhY2UgdGhlIGNvbnRlbnQgd2lkZ2V0IGJlbG93IGEgcG9zaXRpb25cblx0ICovXG5cdEJFTE9XID0gMlxufVxuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgcmVhc29uIHRoZSBjdXJzb3IgaGFzIGNoYW5nZWQgaXRzIHBvc2l0aW9uLlxuICovXG5leHBvcnQgZW51bSBDdXJzb3JDaGFuZ2VSZWFzb24ge1xuXHQvKipcblx0ICogVW5rbm93biBvciBub3Qgc2V0LlxuXHQgKi9cblx0Tm90U2V0ID0gMCxcblx0LyoqXG5cdCAqIEEgYG1vZGVsLnNldFZhbHVlKClgIHdhcyBjYWxsZWQuXG5cdCAqL1xuXHRDb250ZW50Rmx1c2ggPSAxLFxuXHQvKipcblx0ICogVGhlIGBtb2RlbGAgaGFzIGJlZW4gY2hhbmdlZCBvdXRzaWRlIG9mIHRoaXMgY3Vyc29yIGFuZCB0aGUgY3Vyc29yIHJlY292ZXJzIGl0cyBwb3NpdGlvbiBmcm9tIGFzc29jaWF0ZWQgbWFya2Vycy5cblx0ICovXG5cdFJlY292ZXJGcm9tTWFya2VycyA9IDIsXG5cdC8qKlxuXHQgKiBUaGVyZSB3YXMgYW4gZXhwbGljaXQgdXNlciBnZXN0dXJlLlxuXHQgKi9cblx0RXhwbGljaXQgPSAzLFxuXHQvKipcblx0ICogVGhlcmUgd2FzIGEgUGFzdGUuXG5cdCAqL1xuXHRQYXN0ZSA9IDQsXG5cdC8qKlxuXHQgKiBUaGVyZSB3YXMgYW4gVW5kby5cblx0ICovXG5cdFVuZG8gPSA1LFxuXHQvKipcblx0ICogVGhlcmUgd2FzIGEgUmVkby5cblx0ICovXG5cdFJlZG8gPSA2XG59XG5cbi8qKlxuICogVGhlIGRlZmF1bHQgZW5kIG9mIGxpbmUgdG8gdXNlIHdoZW4gaW5zdGFudGlhdGluZyBtb2RlbHMuXG4gKi9cbmV4cG9ydCBlbnVtIERlZmF1bHRFbmRPZkxpbmUge1xuXHQvKipcblx0ICogVXNlIGxpbmUgZmVlZCAoXFxuKSBhcyB0aGUgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlxuXHQgKi9cblx0TEYgPSAxLFxuXHQvKipcblx0ICogVXNlIGNhcnJpYWdlIHJldHVybiBhbmQgbGluZSBmZWVkIChcXHJcXG4pIGFzIHRoZSBlbmQgb2YgbGluZSBjaGFyYWN0ZXIuXG5cdCAqL1xuXHRDUkxGID0gMlxufVxuXG4vKipcbiAqIEEgZG9jdW1lbnQgaGlnaGxpZ2h0IGtpbmQuXG4gKi9cbmV4cG9ydCBlbnVtIERvY3VtZW50SGlnaGxpZ2h0S2luZCB7XG5cdC8qKlxuXHQgKiBBIHRleHR1YWwgb2NjdXJyZW5jZS5cblx0ICovXG5cdFRleHQgPSAwLFxuXHQvKipcblx0ICogUmVhZC1hY2Nlc3Mgb2YgYSBzeW1ib2wsIGxpa2UgcmVhZGluZyBhIHZhcmlhYmxlLlxuXHQgKi9cblx0UmVhZCA9IDEsXG5cdC8qKlxuXHQgKiBXcml0ZS1hY2Nlc3Mgb2YgYSBzeW1ib2wsIGxpa2Ugd3JpdGluZyB0byBhIHZhcmlhYmxlLlxuXHQgKi9cblx0V3JpdGUgPSAyXG59XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBhdXRvIGluZGVudGF0aW9uIGluIHRoZSBlZGl0b3JcbiAqL1xuZXhwb3J0IGVudW0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IHtcblx0Tm9uZSA9IDAsXG5cdEtlZXAgPSAxLFxuXHRCcmFja2V0cyA9IDIsXG5cdEFkdmFuY2VkID0gMyxcblx0RnVsbCA9IDRcbn1cblxuZXhwb3J0IGVudW0gRWRpdG9yT3B0aW9uIHtcblx0YWNjZXB0U3VnZ2VzdGlvbk9uQ29tbWl0Q2hhcmFjdGVyID0gMCxcblx0YWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPSAxLFxuXHRhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IDIsXG5cdGFjY2Vzc2liaWxpdHlQYWdlU2l6ZSA9IDMsXG5cdGFsbG93T3ZlcmZsb3cgPSA0LFxuXHRhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMgPSA1LFxuXHRhbGxvd1ZhcmlhYmxlRm9udHMgPSA2LFxuXHRhbGxvd1ZhcmlhYmxlRm9udHNJbkFjY2Vzc2liaWxpdHlNb2RlID0gNyxcblx0YXJpYUxhYmVsID0gOCxcblx0YXJpYVJlcXVpcmVkID0gOSxcblx0YXV0b0Nsb3NpbmdCcmFja2V0cyA9IDEwLFxuXHRhdXRvQ2xvc2luZ0NvbW1lbnRzID0gMTEsXG5cdHNjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbiA9IDEyLFxuXHRhdXRvQ2xvc2luZ0RlbGV0ZSA9IDEzLFxuXHRhdXRvQ2xvc2luZ092ZXJ0eXBlID0gMTQsXG5cdGF1dG9DbG9zaW5nUXVvdGVzID0gMTUsXG5cdGF1dG9JbmRlbnQgPSAxNixcblx0YXV0b0luZGVudE9uUGFzdGUgPSAxNyxcblx0YXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmcgPSAxOCxcblx0YXV0b21hdGljTGF5b3V0ID0gMTksXG5cdGF1dG9TdXJyb3VuZCA9IDIwLFxuXHRicmFja2V0UGFpckNvbG9yaXphdGlvbiA9IDIxLFxuXHRndWlkZXMgPSAyMixcblx0Y29kZUxlbnMgPSAyMyxcblx0Y29kZUxlbnNGb250RmFtaWx5ID0gMjQsXG5cdGNvZGVMZW5zRm9udFNpemUgPSAyNSxcblx0Y29sb3JEZWNvcmF0b3JzID0gMjYsXG5cdGNvbG9yRGVjb3JhdG9yc0xpbWl0ID0gMjcsXG5cdGNvbHVtblNlbGVjdGlvbiA9IDI4LFxuXHRjb21tZW50cyA9IDI5LFxuXHRjb250ZXh0bWVudSA9IDMwLFxuXHRjb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZyA9IDMxLFxuXHRjdXJzb3JCbGlua2luZyA9IDMyLFxuXHRjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbiA9IDMzLFxuXHRjdXJzb3JTdHlsZSA9IDM0LFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzID0gMzUsXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSA9IDM2LFxuXHRjdXJzb3JXaWR0aCA9IDM3LFxuXHRjdXJzb3JIZWlnaHQgPSAzOCxcblx0ZGlzYWJsZUxheWVySGludGluZyA9IDM5LFxuXHRkaXNhYmxlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyA9IDQwLFxuXHRkb21SZWFkT25seSA9IDQxLFxuXHRkcmFnQW5kRHJvcCA9IDQyLFxuXHRkcm9wSW50b0VkaXRvciA9IDQzLFxuXHRlZGl0Q29udGV4dCA9IDQ0LFxuXHRlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCA9IDQ1LFxuXHRleHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24gPSA0Nixcblx0ZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZyA9IDQ3LFxuXHRleHRyYUVkaXRvckNsYXNzTmFtZSA9IDQ4LFxuXHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSA0OSxcblx0ZmluZCA9IDUwLFxuXHRmaXhlZE92ZXJmbG93V2lkZ2V0cyA9IDUxLFxuXHRmb2xkaW5nID0gNTIsXG5cdGZvbGRpbmdTdHJhdGVneSA9IDUzLFxuXHRmb2xkaW5nSGlnaGxpZ2h0ID0gNTQsXG5cdGZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0ID0gNTUsXG5cdGZvbGRpbmdNYXhpbXVtUmVnaW9ucyA9IDU2LFxuXHR1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUgPSA1Nyxcblx0Zm9udEZhbWlseSA9IDU4LFxuXHRmb250SW5mbyA9IDU5LFxuXHRmb250TGlnYXR1cmVzID0gNjAsXG5cdGZvbnRTaXplID0gNjEsXG5cdGZvbnRXZWlnaHQgPSA2Mixcblx0Zm9udFZhcmlhdGlvbnMgPSA2Myxcblx0Zm9ybWF0T25QYXN0ZSA9IDY0LFxuXHRmb3JtYXRPblR5cGUgPSA2NSxcblx0Z2x5cGhNYXJnaW4gPSA2Nixcblx0Z290b0xvY2F0aW9uID0gNjcsXG5cdGhpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXIgPSA2OCxcblx0aG92ZXIgPSA2OSxcblx0aW5EaWZmRWRpdG9yID0gNzAsXG5cdGlubGluZVN1Z2dlc3QgPSA3MSxcblx0bGV0dGVyU3BhY2luZyA9IDcyLFxuXHRsaWdodGJ1bGIgPSA3Myxcblx0bGluZURlY29yYXRpb25zV2lkdGggPSA3NCxcblx0bGluZUhlaWdodCA9IDc1LFxuXHRsaW5lTnVtYmVycyA9IDc2LFxuXHRsaW5lTnVtYmVyc01pbkNoYXJzID0gNzcsXG5cdGxpbmtlZEVkaXRpbmcgPSA3OCxcblx0bGlua3MgPSA3OSxcblx0bWF0Y2hCcmFja2V0cyA9IDgwLFxuXHRtaW5pbWFwID0gODEsXG5cdG1vdXNlU3R5bGUgPSA4Mixcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5ID0gODMsXG5cdG1vdXNlV2hlZWxab29tID0gODQsXG5cdG11bHRpQ3Vyc29yTWVyZ2VPdmVybGFwcGluZyA9IDg1LFxuXHRtdWx0aUN1cnNvck1vZGlmaWVyID0gODYsXG5cdG1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24gPSA4Nyxcblx0bXVsdGlDdXJzb3JQYXN0ZSA9IDg4LFxuXHRtdWx0aUN1cnNvckxpbWl0ID0gODksXG5cdG9jY3VycmVuY2VzSGlnaGxpZ2h0ID0gOTAsXG5cdG9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXkgPSA5MSxcblx0b3ZlcnR5cGVDdXJzb3JTdHlsZSA9IDkyLFxuXHRvdmVydHlwZU9uUGFzdGUgPSA5Myxcblx0b3ZlcnZpZXdSdWxlckJvcmRlciA9IDk0LFxuXHRvdmVydmlld1J1bGVyTGFuZXMgPSA5NSxcblx0cGFkZGluZyA9IDk2LFxuXHRwYXN0ZUFzID0gOTcsXG5cdHBhcmFtZXRlckhpbnRzID0gOTgsXG5cdHBlZWtXaWRnZXREZWZhdWx0Rm9jdXMgPSA5OSxcblx0cGxhY2Vob2xkZXIgPSAxMDAsXG5cdGRlZmluaXRpb25MaW5rT3BlbnNJblBlZWsgPSAxMDEsXG5cdHF1aWNrU3VnZ2VzdGlvbnMgPSAxMDIsXG5cdHF1aWNrU3VnZ2VzdGlvbnNEZWxheSA9IDEwMyxcblx0cmVhZE9ubHkgPSAxMDQsXG5cdHJlYWRPbmx5TWVzc2FnZSA9IDEwNSxcblx0cmVuYW1lT25UeXBlID0gMTA2LFxuXHRyZW5kZXJSaWNoU2NyZWVuUmVhZGVyQ29udGVudCA9IDEwNyxcblx0cmVuZGVyQ29udHJvbENoYXJhY3RlcnMgPSAxMDgsXG5cdHJlbmRlckZpbmFsTmV3bGluZSA9IDEwOSxcblx0cmVuZGVyTGluZUhpZ2hsaWdodCA9IDExMCxcblx0cmVuZGVyTGluZUhpZ2hsaWdodE9ubHlXaGVuRm9jdXMgPSAxMTEsXG5cdHJlbmRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyA9IDExMixcblx0cmVuZGVyV2hpdGVzcGFjZSA9IDExMyxcblx0cmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZyA9IDExNCxcblx0cm91bmRlZFNlbGVjdGlvbiA9IDExNSxcblx0cnVsZXJzID0gMTE2LFxuXHRzY3JvbGxiYXIgPSAxMTcsXG5cdHNjcm9sbEJleW9uZExhc3RDb2x1bW4gPSAxMTgsXG5cdHNjcm9sbEJleW9uZExhc3RMaW5lID0gMTE5LFxuXHRzY3JvbGxQcmVkb21pbmFudEF4aXMgPSAxMjAsXG5cdHNlbGVjdGlvbkNsaXBib2FyZCA9IDEyMSxcblx0c2VsZWN0aW9uSGlnaGxpZ2h0ID0gMTIyLFxuXHRzZWxlY3Rpb25IaWdobGlnaHRNYXhMZW5ndGggPSAxMjMsXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZSA9IDEyNCxcblx0c2VsZWN0T25MaW5lTnVtYmVycyA9IDEyNSxcblx0c2hvd0ZvbGRpbmdDb250cm9scyA9IDEyNixcblx0c2hvd1VudXNlZCA9IDEyNyxcblx0c25pcHBldFN1Z2dlc3Rpb25zID0gMTI4LFxuXHRzbWFydFNlbGVjdCA9IDEyOSxcblx0c21vb3RoU2Nyb2xsaW5nID0gMTMwLFxuXHRzdGlja3lTY3JvbGwgPSAxMzEsXG5cdHN0aWNreVRhYlN0b3BzID0gMTMyLFxuXHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyID0gMTMzLFxuXHRzdWdnZXN0ID0gMTM0LFxuXHRzdWdnZXN0Rm9udFNpemUgPSAxMzUsXG5cdHN1Z2dlc3RMaW5lSGVpZ2h0ID0gMTM2LFxuXHRzdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycyA9IDEzNyxcblx0c3VnZ2VzdFNlbGVjdGlvbiA9IDEzOCxcblx0dGFiQ29tcGxldGlvbiA9IDEzOSxcblx0dGFiSW5kZXggPSAxNDAsXG5cdHRyaW1XaGl0ZXNwYWNlT25EZWxldGUgPSAxNDEsXG5cdHVuaWNvZGVIaWdobGlnaHRpbmcgPSAxNDIsXG5cdHVudXN1YWxMaW5lVGVybWluYXRvcnMgPSAxNDMsXG5cdHVzZVNoYWRvd0RPTSA9IDE0NCxcblx0dXNlVGFiU3RvcHMgPSAxNDUsXG5cdHdvcmRCcmVhayA9IDE0Nixcblx0d29yZFNlZ21lbnRlckxvY2FsZXMgPSAxNDcsXG5cdHdvcmRTZXBhcmF0b3JzID0gMTQ4LFxuXHR3b3JkV3JhcCA9IDE0OSxcblx0d29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycyA9IDE1MCxcblx0d29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMgPSAxNTEsXG5cdHdvcmRXcmFwQ29sdW1uID0gMTUyLFxuXHR3b3JkV3JhcE92ZXJyaWRlMSA9IDE1Myxcblx0d29yZFdyYXBPdmVycmlkZTIgPSAxNTQsXG5cdHdyYXBwaW5nSW5kZW50ID0gMTU1LFxuXHR3cmFwcGluZ1N0cmF0ZWd5ID0gMTU2LFxuXHRzaG93RGVwcmVjYXRlZCA9IDE1Nyxcblx0aW5lcnRpYWxTY3JvbGwgPSAxNTgsXG5cdGlubGF5SGludHMgPSAxNTksXG5cdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHMgPSAxNjAsXG5cdGVmZmVjdGl2ZUN1cnNvclN0eWxlID0gMTYxLFxuXHRlZGl0b3JDbGFzc05hbWUgPSAxNjIsXG5cdHBpeGVsUmF0aW8gPSAxNjMsXG5cdHRhYkZvY3VzTW9kZSA9IDE2NCxcblx0bGF5b3V0SW5mbyA9IDE2NSxcblx0d3JhcHBpbmdJbmZvID0gMTY2LFxuXHRkZWZhdWx0Q29sb3JEZWNvcmF0b3JzID0gMTY3LFxuXHRjb2xvckRlY29yYXRvcnNBY3RpdmF0ZWRPbiA9IDE2OCxcblx0aW5saW5lQ29tcGxldGlvbnNBY2Nlc3NpYmlsaXR5VmVyYm9zZSA9IDE2OSxcblx0ZWZmZWN0aXZlRWRpdENvbnRleHQgPSAxNzAsXG5cdHNjcm9sbE9uTWlkZGxlQ2xpY2sgPSAxNzEsXG5cdGVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250cyA9IDE3Mixcblx0ZG91YmxlQ2xpY2tTZWxlY3RzQmxvY2sgPSAxNzNcbn1cblxuLyoqXG4gKiBFbmQgb2YgbGluZSBjaGFyYWN0ZXIgcHJlZmVyZW5jZS5cbiAqL1xuZXhwb3J0IGVudW0gRW5kT2ZMaW5lUHJlZmVyZW5jZSB7XG5cdC8qKlxuXHQgKiBVc2UgdGhlIGVuZCBvZiBsaW5lIGNoYXJhY3RlciBpZGVudGlmaWVkIGluIHRoZSB0ZXh0IGJ1ZmZlci5cblx0ICovXG5cdFRleHREZWZpbmVkID0gMCxcblx0LyoqXG5cdCAqIFVzZSBsaW5lIGZlZWQgKFxcbikgYXMgdGhlIGVuZCBvZiBsaW5lIGNoYXJhY3Rlci5cblx0ICovXG5cdExGID0gMSxcblx0LyoqXG5cdCAqIFVzZSBjYXJyaWFnZSByZXR1cm4gYW5kIGxpbmUgZmVlZCAoXFxyXFxuKSBhcyB0aGUgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlxuXHQgKi9cblx0Q1JMRiA9IDJcbn1cblxuLyoqXG4gKiBFbmQgb2YgbGluZSBjaGFyYWN0ZXIgcHJlZmVyZW5jZS5cbiAqL1xuZXhwb3J0IGVudW0gRW5kT2ZMaW5lU2VxdWVuY2Uge1xuXHQvKipcblx0ICogVXNlIGxpbmUgZmVlZCAoXFxuKSBhcyB0aGUgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlxuXHQgKi9cblx0TEYgPSAwLFxuXHQvKipcblx0ICogVXNlIGNhcnJpYWdlIHJldHVybiBhbmQgbGluZSBmZWVkIChcXHJcXG4pIGFzIHRoZSBlbmQgb2YgbGluZSBjaGFyYWN0ZXIuXG5cdCAqL1xuXHRDUkxGID0gMVxufVxuXG4vKipcbiAqIFZlcnRpY2FsIExhbmUgaW4gdGhlIGdseXBoIG1hcmdpbiBvZiB0aGUgZWRpdG9yLlxuICovXG5leHBvcnQgZW51bSBHbHlwaE1hcmdpbkxhbmUge1xuXHRMZWZ0ID0gMSxcblx0Q2VudGVyID0gMixcblx0UmlnaHQgPSAzXG59XG5cbmV4cG9ydCBlbnVtIEhvdmVyVmVyYm9zaXR5QWN0aW9uIHtcblx0LyoqXG5cdCAqIEluY3JlYXNlIHRoZSB2ZXJib3NpdHkgb2YgdGhlIGhvdmVyXG5cdCAqL1xuXHRJbmNyZWFzZSA9IDAsXG5cdC8qKlxuXHQgKiBEZWNyZWFzZSB0aGUgdmVyYm9zaXR5IG9mIHRoZSBob3ZlclxuXHQgKi9cblx0RGVjcmVhc2UgPSAxXG59XG5cbi8qKlxuICogRGVzY3JpYmVzIHdoYXQgdG8gZG8gd2l0aCB0aGUgaW5kZW50YXRpb24gd2hlbiBwcmVzc2luZyBFbnRlci5cbiAqL1xuZXhwb3J0IGVudW0gSW5kZW50QWN0aW9uIHtcblx0LyoqXG5cdCAqIEluc2VydCBuZXcgbGluZSBhbmQgY29weSB0aGUgcHJldmlvdXMgbGluZSdzIGluZGVudGF0aW9uLlxuXHQgKi9cblx0Tm9uZSA9IDAsXG5cdC8qKlxuXHQgKiBJbnNlcnQgbmV3IGxpbmUgYW5kIGluZGVudCBvbmNlIChyZWxhdGl2ZSB0byB0aGUgcHJldmlvdXMgbGluZSdzIGluZGVudGF0aW9uKS5cblx0ICovXG5cdEluZGVudCA9IDEsXG5cdC8qKlxuXHQgKiBJbnNlcnQgdHdvIG5ldyBsaW5lczpcblx0ICogIC0gdGhlIGZpcnN0IG9uZSBpbmRlbnRlZCB3aGljaCB3aWxsIGhvbGQgdGhlIGN1cnNvclxuXHQgKiAgLSB0aGUgc2Vjb25kIG9uZSBhdCB0aGUgc2FtZSBpbmRlbnRhdGlvbiBsZXZlbFxuXHQgKi9cblx0SW5kZW50T3V0ZGVudCA9IDIsXG5cdC8qKlxuXHQgKiBJbnNlcnQgbmV3IGxpbmUgYW5kIG91dGRlbnQgb25jZSAocmVsYXRpdmUgdG8gdGhlIHByZXZpb3VzIGxpbmUncyBpbmRlbnRhdGlvbikuXG5cdCAqL1xuXHRPdXRkZW50ID0gM1xufVxuXG5leHBvcnQgZW51bSBJbmplY3RlZFRleHRDdXJzb3JTdG9wcyB7XG5cdEJvdGggPSAwLFxuXHRSaWdodCA9IDEsXG5cdExlZnQgPSAyLFxuXHROb25lID0gM1xufVxuXG5leHBvcnQgZW51bSBJbmxheUhpbnRLaW5kIHtcblx0VHlwZSA9IDEsXG5cdFBhcmFtZXRlciA9IDJcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQge1xuXHRBY2NlcHRlZCA9IDAsXG5cdFJlamVjdGVkID0gMSxcblx0SWdub3JlZCA9IDJcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZSB7XG5cdENvZGUgPSAxLFxuXHRMYWJlbCA9IDJcbn1cblxuLyoqXG4gKiBIb3cgYW4ge0BsaW5rIElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgaW5saW5lIGNvbXBsZXRpb24gcHJvdmlkZXJ9IHdhcyB0cmlnZ2VyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCB7XG5cdC8qKlxuXHQgKiBDb21wbGV0aW9uIHdhcyB0cmlnZ2VyZWQgYXV0b21hdGljYWxseSB3aGlsZSBlZGl0aW5nLlxuXHQgKiBJdCBpcyBzdWZmaWNpZW50IHRvIHJldHVybiBhIHNpbmdsZSBjb21wbGV0aW9uIGl0ZW0gaW4gdGhpcyBjYXNlLlxuXHQgKi9cblx0QXV0b21hdGljID0gMCxcblx0LyoqXG5cdCAqIENvbXBsZXRpb24gd2FzIHRyaWdnZXJlZCBleHBsaWNpdGx5IGJ5IGEgdXNlciBnZXN0dXJlLlxuXHQgKiBSZXR1cm4gbXVsdGlwbGUgY29tcGxldGlvbiBpdGVtcyB0byBlbmFibGUgY3ljbGluZyB0aHJvdWdoIHRoZW0uXG5cdCAqL1xuXHRFeHBsaWNpdCA9IDFcbn1cbi8qKlxuICogVmlydHVhbCBLZXkgQ29kZXMsIHRoZSB2YWx1ZSBkb2VzIG5vdCBob2xkIGFueSBpbmhlcmVudCBtZWFuaW5nLlxuICogSW5zcGlyZWQgc29tZXdoYXQgZnJvbSBodHRwczovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L3dpbmRvd3MvZGVza3RvcC9kZDM3NTczMSh2PXZzLjg1KS5hc3B4XG4gKiBCdXQgdGhlc2UgYXJlIFwibW9yZSBnZW5lcmFsXCIsIGFzIHRoZXkgc2hvdWxkIHdvcmsgYWNyb3NzIGJyb3dzZXJzICYgT1Ngcy5cbiAqL1xuZXhwb3J0IGVudW0gS2V5Q29kZSB7XG5cdERlcGVuZHNPbktiTGF5b3V0ID0gLTEsXG5cdC8qKlxuXHQgKiBQbGFjZWQgZmlyc3QgdG8gY292ZXIgdGhlIDAgdmFsdWUgb2YgdGhlIGVudW0uXG5cdCAqL1xuXHRVbmtub3duID0gMCxcblx0QmFja3NwYWNlID0gMSxcblx0VGFiID0gMixcblx0RW50ZXIgPSAzLFxuXHRTaGlmdCA9IDQsXG5cdEN0cmwgPSA1LFxuXHRBbHQgPSA2LFxuXHRQYXVzZUJyZWFrID0gNyxcblx0Q2Fwc0xvY2sgPSA4LFxuXHRFc2NhcGUgPSA5LFxuXHRTcGFjZSA9IDEwLFxuXHRQYWdlVXAgPSAxMSxcblx0UGFnZURvd24gPSAxMixcblx0RW5kID0gMTMsXG5cdEhvbWUgPSAxNCxcblx0TGVmdEFycm93ID0gMTUsXG5cdFVwQXJyb3cgPSAxNixcblx0UmlnaHRBcnJvdyA9IDE3LFxuXHREb3duQXJyb3cgPSAxOCxcblx0SW5zZXJ0ID0gMTksXG5cdERlbGV0ZSA9IDIwLFxuXHREaWdpdDAgPSAyMSxcblx0RGlnaXQxID0gMjIsXG5cdERpZ2l0MiA9IDIzLFxuXHREaWdpdDMgPSAyNCxcblx0RGlnaXQ0ID0gMjUsXG5cdERpZ2l0NSA9IDI2LFxuXHREaWdpdDYgPSAyNyxcblx0RGlnaXQ3ID0gMjgsXG5cdERpZ2l0OCA9IDI5LFxuXHREaWdpdDkgPSAzMCxcblx0S2V5QSA9IDMxLFxuXHRLZXlCID0gMzIsXG5cdEtleUMgPSAzMyxcblx0S2V5RCA9IDM0LFxuXHRLZXlFID0gMzUsXG5cdEtleUYgPSAzNixcblx0S2V5RyA9IDM3LFxuXHRLZXlIID0gMzgsXG5cdEtleUkgPSAzOSxcblx0S2V5SiA9IDQwLFxuXHRLZXlLID0gNDEsXG5cdEtleUwgPSA0Mixcblx0S2V5TSA9IDQzLFxuXHRLZXlOID0gNDQsXG5cdEtleU8gPSA0NSxcblx0S2V5UCA9IDQ2LFxuXHRLZXlRID0gNDcsXG5cdEtleVIgPSA0OCxcblx0S2V5UyA9IDQ5LFxuXHRLZXlUID0gNTAsXG5cdEtleVUgPSA1MSxcblx0S2V5ViA9IDUyLFxuXHRLZXlXID0gNTMsXG5cdEtleVggPSA1NCxcblx0S2V5WSA9IDU1LFxuXHRLZXlaID0gNTYsXG5cdE1ldGEgPSA1Nyxcblx0Q29udGV4dE1lbnUgPSA1OCxcblx0RjEgPSA1OSxcblx0RjIgPSA2MCxcblx0RjMgPSA2MSxcblx0RjQgPSA2Mixcblx0RjUgPSA2Myxcblx0RjYgPSA2NCxcblx0RjcgPSA2NSxcblx0RjggPSA2Nixcblx0RjkgPSA2Nyxcblx0RjEwID0gNjgsXG5cdEYxMSA9IDY5LFxuXHRGMTIgPSA3MCxcblx0RjEzID0gNzEsXG5cdEYxNCA9IDcyLFxuXHRGMTUgPSA3Myxcblx0RjE2ID0gNzQsXG5cdEYxNyA9IDc1LFxuXHRGMTggPSA3Nixcblx0RjE5ID0gNzcsXG5cdEYyMCA9IDc4LFxuXHRGMjEgPSA3OSxcblx0RjIyID0gODAsXG5cdEYyMyA9IDgxLFxuXHRGMjQgPSA4Mixcblx0TnVtTG9jayA9IDgzLFxuXHRTY3JvbGxMb2NrID0gODQsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJzs6JyBrZXlcblx0ICovXG5cdFNlbWljb2xvbiA9IDg1LFxuXHQvKipcblx0ICogRm9yIGFueSBjb3VudHJ5L3JlZ2lvbiwgdGhlICcrJyBrZXlcblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICc9Kycga2V5XG5cdCAqL1xuXHRFcXVhbCA9IDg2LFxuXHQvKipcblx0ICogRm9yIGFueSBjb3VudHJ5L3JlZ2lvbiwgdGhlICcsJyBrZXlcblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICcsPCcga2V5XG5cdCAqL1xuXHRDb21tYSA9IDg3LFxuXHQvKipcblx0ICogRm9yIGFueSBjb3VudHJ5L3JlZ2lvbiwgdGhlICctJyBrZXlcblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICctXycga2V5XG5cdCAqL1xuXHRNaW51cyA9IDg4LFxuXHQvKipcblx0ICogRm9yIGFueSBjb3VudHJ5L3JlZ2lvbiwgdGhlICcuJyBrZXlcblx0ICogRm9yIHRoZSBVUyBzdGFuZGFyZCBrZXlib2FyZCwgdGhlICcuPicga2V5XG5cdCAqL1xuXHRQZXJpb2QgPSA4OSxcblx0LyoqXG5cdCAqIFVzZWQgZm9yIG1pc2NlbGxhbmVvdXMgY2hhcmFjdGVyczsgaXQgY2FuIHZhcnkgYnkga2V5Ym9hcmQuXG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnLz8nIGtleVxuXHQgKi9cblx0U2xhc2ggPSA5MCxcblx0LyoqXG5cdCAqIFVzZWQgZm9yIG1pc2NlbGxhbmVvdXMgY2hhcmFjdGVyczsgaXQgY2FuIHZhcnkgYnkga2V5Ym9hcmQuXG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnYH4nIGtleVxuXHQgKi9cblx0QmFja3F1b3RlID0gOTEsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJ1t7JyBrZXlcblx0ICovXG5cdEJyYWNrZXRMZWZ0ID0gOTIsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJ1xcfCcga2V5XG5cdCAqL1xuXHRCYWNrc2xhc2ggPSA5Myxcblx0LyoqXG5cdCAqIFVzZWQgZm9yIG1pc2NlbGxhbmVvdXMgY2hhcmFjdGVyczsgaXQgY2FuIHZhcnkgYnkga2V5Ym9hcmQuXG5cdCAqIEZvciB0aGUgVVMgc3RhbmRhcmQga2V5Ym9hcmQsIHRoZSAnXX0nIGtleVxuXHQgKi9cblx0QnJhY2tldFJpZ2h0ID0gOTQsXG5cdC8qKlxuXHQgKiBVc2VkIGZvciBtaXNjZWxsYW5lb3VzIGNoYXJhY3RlcnM7IGl0IGNhbiB2YXJ5IGJ5IGtleWJvYXJkLlxuXHQgKiBGb3IgdGhlIFVTIHN0YW5kYXJkIGtleWJvYXJkLCB0aGUgJydcIicga2V5XG5cdCAqL1xuXHRRdW90ZSA9IDk1LFxuXHQvKipcblx0ICogVXNlZCBmb3IgbWlzY2VsbGFuZW91cyBjaGFyYWN0ZXJzOyBpdCBjYW4gdmFyeSBieSBrZXlib2FyZC5cblx0ICovXG5cdE9FTV84ID0gOTYsXG5cdC8qKlxuXHQgKiBFaXRoZXIgdGhlIGFuZ2xlIGJyYWNrZXQga2V5IG9yIHRoZSBiYWNrc2xhc2gga2V5IG9uIHRoZSBSVCAxMDIta2V5IGtleWJvYXJkLlxuXHQgKi9cblx0SW50bEJhY2tzbGFzaCA9IDk3LFxuXHROdW1wYWQwID0gOTgsLy8gVktfTlVNUEFEMCwgMHg2MCwgTnVtZXJpYyBrZXlwYWQgMCBrZXlcblx0TnVtcGFkMSA9IDk5LC8vIFZLX05VTVBBRDEsIDB4NjEsIE51bWVyaWMga2V5cGFkIDEga2V5XG5cdE51bXBhZDIgPSAxMDAsLy8gVktfTlVNUEFEMiwgMHg2MiwgTnVtZXJpYyBrZXlwYWQgMiBrZXlcblx0TnVtcGFkMyA9IDEwMSwvLyBWS19OVU1QQUQzLCAweDYzLCBOdW1lcmljIGtleXBhZCAzIGtleVxuXHROdW1wYWQ0ID0gMTAyLC8vIFZLX05VTVBBRDQsIDB4NjQsIE51bWVyaWMga2V5cGFkIDQga2V5XG5cdE51bXBhZDUgPSAxMDMsLy8gVktfTlVNUEFENSwgMHg2NSwgTnVtZXJpYyBrZXlwYWQgNSBrZXlcblx0TnVtcGFkNiA9IDEwNCwvLyBWS19OVU1QQUQ2LCAweDY2LCBOdW1lcmljIGtleXBhZCA2IGtleVxuXHROdW1wYWQ3ID0gMTA1LC8vIFZLX05VTVBBRDcsIDB4NjcsIE51bWVyaWMga2V5cGFkIDcga2V5XG5cdE51bXBhZDggPSAxMDYsLy8gVktfTlVNUEFEOCwgMHg2OCwgTnVtZXJpYyBrZXlwYWQgOCBrZXlcblx0TnVtcGFkOSA9IDEwNywvLyBWS19OVU1QQUQ5LCAweDY5LCBOdW1lcmljIGtleXBhZCA5IGtleVxuXHROdW1wYWRNdWx0aXBseSA9IDEwOCwvLyBWS19NVUxUSVBMWSwgMHg2QSwgTXVsdGlwbHkga2V5XG5cdE51bXBhZEFkZCA9IDEwOSwvLyBWS19BREQsIDB4NkIsIEFkZCBrZXlcblx0TlVNUEFEX1NFUEFSQVRPUiA9IDExMCwvLyBWS19TRVBBUkFUT1IsIDB4NkMsIFNlcGFyYXRvciBrZXlcblx0TnVtcGFkU3VidHJhY3QgPSAxMTEsLy8gVktfU1VCVFJBQ1QsIDB4NkQsIFN1YnRyYWN0IGtleVxuXHROdW1wYWREZWNpbWFsID0gMTEyLC8vIFZLX0RFQ0lNQUwsIDB4NkUsIERlY2ltYWwga2V5XG5cdE51bXBhZERpdmlkZSA9IDExMywvLyBWS19ESVZJREUsIDB4NkYsXG5cdC8qKlxuXHQgKiBDb3ZlciBhbGwga2V5IGNvZGVzIHdoZW4gSU1FIGlzIHByb2Nlc3NpbmcgaW5wdXQuXG5cdCAqL1xuXHRLRVlfSU5fQ09NUE9TSVRJT04gPSAxMTQsXG5cdEFCTlRfQzEgPSAxMTUsLy8gQnJhemlsaWFuIChBQk5UKSBLZXlib2FyZFxuXHRBQk5UX0MyID0gMTE2LC8vIEJyYXppbGlhbiAoQUJOVCkgS2V5Ym9hcmRcblx0QXVkaW9Wb2x1bWVNdXRlID0gMTE3LFxuXHRBdWRpb1ZvbHVtZVVwID0gMTE4LFxuXHRBdWRpb1ZvbHVtZURvd24gPSAxMTksXG5cdEJyb3dzZXJTZWFyY2ggPSAxMjAsXG5cdEJyb3dzZXJIb21lID0gMTIxLFxuXHRCcm93c2VyQmFjayA9IDEyMixcblx0QnJvd3NlckZvcndhcmQgPSAxMjMsXG5cdE1lZGlhVHJhY2tOZXh0ID0gMTI0LFxuXHRNZWRpYVRyYWNrUHJldmlvdXMgPSAxMjUsXG5cdE1lZGlhU3RvcCA9IDEyNixcblx0TWVkaWFQbGF5UGF1c2UgPSAxMjcsXG5cdExhdW5jaE1lZGlhUGxheWVyID0gMTI4LFxuXHRMYXVuY2hNYWlsID0gMTI5LFxuXHRMYXVuY2hBcHAyID0gMTMwLFxuXHQvKipcblx0ICogVktfQ0xFQVIsIDB4MEMsIENMRUFSIGtleVxuXHQgKi9cblx0Q2xlYXIgPSAxMzEsXG5cdC8qKlxuXHQgKiBQbGFjZWQgbGFzdCB0byBjb3ZlciB0aGUgbGVuZ3RoIG9mIHRoZSBlbnVtLlxuXHQgKiBQbGVhc2UgZG8gbm90IGRlcGVuZCBvbiB0aGlzIHZhbHVlIVxuXHQgKi9cblx0TUFYX1ZBTFVFID0gMTMyXG59XG5cbmV4cG9ydCBlbnVtIE1hcmtlclNldmVyaXR5IHtcblx0SGludCA9IDEsXG5cdEluZm8gPSAyLFxuXHRXYXJuaW5nID0gNCxcblx0RXJyb3IgPSA4XG59XG5cbmV4cG9ydCBlbnVtIE1hcmtlclRhZyB7XG5cdFVubmVjZXNzYXJ5ID0gMSxcblx0RGVwcmVjYXRlZCA9IDJcbn1cblxuLyoqXG4gKiBQb3NpdGlvbiBpbiB0aGUgbWluaW1hcCB0byByZW5kZXIgdGhlIGRlY29yYXRpb24uXG4gKi9cbmV4cG9ydCBlbnVtIE1pbmltYXBQb3NpdGlvbiB7XG5cdElubGluZSA9IDEsXG5cdEd1dHRlciA9IDJcbn1cblxuLyoqXG4gKiBTZWN0aW9uIGhlYWRlciBzdHlsZS5cbiAqL1xuZXhwb3J0IGVudW0gTWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZSB7XG5cdE5vcm1hbCA9IDEsXG5cdFVuZGVybGluZWQgPSAyXG59XG5cbi8qKlxuICogVHlwZSBvZiBoaXQgZWxlbWVudCB3aXRoIHRoZSBtb3VzZSBpbiB0aGUgZWRpdG9yLlxuICovXG5leHBvcnQgZW51bSBNb3VzZVRhcmdldFR5cGUge1xuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIGFuIHVua25vd24gZWxlbWVudC5cblx0ICovXG5cdFVOS05PV04gPSAwLFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIHRoZSB0ZXh0YXJlYSB1c2VkIGZvciBpbnB1dC5cblx0ICovXG5cdFRFWFRBUkVBID0gMSxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgZ2x5cGggbWFyZ2luXG5cdCAqL1xuXHRHVVRURVJfR0xZUEhfTUFSR0lOID0gMixcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgbGluZSBudW1iZXJzXG5cdCAqL1xuXHRHVVRURVJfTElORV9OVU1CRVJTID0gMyxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiB0aGUgbGluZSBkZWNvcmF0aW9uc1xuXHQgKi9cblx0R1VUVEVSX0xJTkVfREVDT1JBVElPTlMgPSA0LFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIHRoZSB3aGl0ZXNwYWNlIGxlZnQgaW4gdGhlIGd1dHRlciBieSBhIHZpZXcgem9uZS5cblx0ICovXG5cdEdVVFRFUl9WSUVXX1pPTkUgPSA1LFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIHRleHQgaW4gdGhlIGNvbnRlbnQuXG5cdCAqL1xuXHRDT05URU5UX1RFWFQgPSA2LFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIGVtcHR5IHNwYWNlIGluIHRoZSBjb250ZW50IChlLmcuIGFmdGVyIGxpbmUgdGV4dCBvciBiZWxvdyBsYXN0IGxpbmUpXG5cdCAqL1xuXHRDT05URU5UX0VNUFRZID0gNyxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiBhIHZpZXcgem9uZSBpbiB0aGUgY29udGVudC5cblx0ICovXG5cdENPTlRFTlRfVklFV19aT05FID0gOCxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiBhIGNvbnRlbnQgd2lkZ2V0LlxuXHQgKi9cblx0Q09OVEVOVF9XSURHRVQgPSA5LFxuXHQvKipcblx0ICogTW91c2UgaXMgb24gdG9wIG9mIHRoZSBkZWNvcmF0aW9ucyBvdmVydmlldyBydWxlci5cblx0ICovXG5cdE9WRVJWSUVXX1JVTEVSID0gMTAsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvbiB0b3Agb2YgYSBzY3JvbGxiYXIuXG5cdCAqL1xuXHRTQ1JPTExCQVIgPSAxMSxcblx0LyoqXG5cdCAqIE1vdXNlIGlzIG9uIHRvcCBvZiBhbiBvdmVybGF5IHdpZGdldC5cblx0ICovXG5cdE9WRVJMQVlfV0lER0VUID0gMTIsXG5cdC8qKlxuXHQgKiBNb3VzZSBpcyBvdXRzaWRlIG9mIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRPVVRTSURFX0VESVRPUiA9IDEzXG59XG5cbmV4cG9ydCBlbnVtIE5ld1N5bWJvbE5hbWVUYWcge1xuXHRBSUdlbmVyYXRlZCA9IDFcbn1cblxuZXhwb3J0IGVudW0gTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kIHtcblx0SW52b2tlID0gMCxcblx0QXV0b21hdGljID0gMVxufVxuXG4vKipcbiAqIEEgcG9zaXRpb25pbmcgcHJlZmVyZW5jZSBmb3IgcmVuZGVyaW5nIG92ZXJsYXkgd2lkZ2V0cy5cbiAqL1xuZXhwb3J0IGVudW0gT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB7XG5cdC8qKlxuXHQgKiBQb3NpdGlvbiB0aGUgb3ZlcmxheSB3aWRnZXQgaW4gdGhlIHRvcCByaWdodCBjb3JuZXJcblx0ICovXG5cdFRPUF9SSUdIVF9DT1JORVIgPSAwLFxuXHQvKipcblx0ICogUG9zaXRpb24gdGhlIG92ZXJsYXkgd2lkZ2V0IGluIHRoZSBib3R0b20gcmlnaHQgY29ybmVyXG5cdCAqL1xuXHRCT1RUT01fUklHSFRfQ09STkVSID0gMSxcblx0LyoqXG5cdCAqIFBvc2l0aW9uIHRoZSBvdmVybGF5IHdpZGdldCBpbiB0aGUgdG9wIGNlbnRlclxuXHQgKi9cblx0VE9QX0NFTlRFUiA9IDJcbn1cblxuLyoqXG4gKiBWZXJ0aWNhbCBMYW5lIGluIHRoZSBvdmVydmlldyBydWxlciBvZiB0aGUgZWRpdG9yLlxuICovXG5leHBvcnQgZW51bSBPdmVydmlld1J1bGVyTGFuZSB7XG5cdExlZnQgPSAxLFxuXHRDZW50ZXIgPSAyLFxuXHRSaWdodCA9IDQsXG5cdEZ1bGwgPSA3XG59XG5cbi8qKlxuICogSG93IGEgcGFydGlhbCBhY2NlcHRhbmNlIHdhcyB0cmlnZ2VyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCB7XG5cdFdvcmQgPSAwLFxuXHRMaW5lID0gMSxcblx0U3VnZ2VzdCA9IDJcbn1cblxuZXhwb3J0IGVudW0gUG9zaXRpb25BZmZpbml0eSB7XG5cdC8qKlxuXHQgKiBQcmVmZXJzIHRoZSBsZWZ0IG1vc3QgcG9zaXRpb24uXG5cdCovXG5cdExlZnQgPSAwLFxuXHQvKipcblx0ICogUHJlZmVycyB0aGUgcmlnaHQgbW9zdCBwb3NpdGlvbi5cblx0Ki9cblx0UmlnaHQgPSAxLFxuXHQvKipcblx0ICogTm8gcHJlZmVyZW5jZS5cblx0Ki9cblx0Tm9uZSA9IDIsXG5cdC8qKlxuXHQgKiBJZiB0aGUgZ2l2ZW4gcG9zaXRpb24gaXMgb24gaW5qZWN0ZWQgdGV4dCwgcHJlZmVycyB0aGUgcG9zaXRpb24gbGVmdCBvZiBpdC5cblx0Ki9cblx0TGVmdE9mSW5qZWN0ZWRUZXh0ID0gMyxcblx0LyoqXG5cdCAqIElmIHRoZSBnaXZlbiBwb3NpdGlvbiBpcyBvbiBpbmplY3RlZCB0ZXh0LCBwcmVmZXJzIHRoZSBwb3NpdGlvbiByaWdodCBvZiBpdC5cblx0Ki9cblx0UmlnaHRPZkluamVjdGVkVGV4dCA9IDRcbn1cblxuZXhwb3J0IGVudW0gUmVuZGVyTGluZU51bWJlcnNUeXBlIHtcblx0T2ZmID0gMCxcblx0T24gPSAxLFxuXHRSZWxhdGl2ZSA9IDIsXG5cdEludGVydmFsID0gMyxcblx0Q3VzdG9tID0gNFxufVxuXG5leHBvcnQgZW51bSBSZW5kZXJNaW5pbWFwIHtcblx0Tm9uZSA9IDAsXG5cdFRleHQgPSAxLFxuXHRCbG9ja3MgPSAyXG59XG5cbmV4cG9ydCBlbnVtIFNjcm9sbFR5cGUge1xuXHRTbW9vdGggPSAwLFxuXHRJbW1lZGlhdGUgPSAxXG59XG5cbmV4cG9ydCBlbnVtIFNjcm9sbGJhclZpc2liaWxpdHkge1xuXHRBdXRvID0gMSxcblx0SGlkZGVuID0gMixcblx0VmlzaWJsZSA9IDNcbn1cblxuLyoqXG4gKiBUaGUgZGlyZWN0aW9uIG9mIGEgc2VsZWN0aW9uLlxuICovXG5leHBvcnQgZW51bSBTZWxlY3Rpb25EaXJlY3Rpb24ge1xuXHQvKipcblx0ICogVGhlIHNlbGVjdGlvbiBzdGFydHMgYWJvdmUgd2hlcmUgaXQgZW5kcy5cblx0ICovXG5cdExUUiA9IDAsXG5cdC8qKlxuXHQgKiBUaGUgc2VsZWN0aW9uIHN0YXJ0cyBiZWxvdyB3aGVyZSBpdCBlbmRzLlxuXHQgKi9cblx0UlRMID0gMVxufVxuXG5leHBvcnQgZW51bSBTaG93TGlnaHRidWxiSWNvbk1vZGUge1xuXHRPZmYgPSAnb2ZmJyxcblx0T25Db2RlID0gJ29uQ29kZScsXG5cdE9uID0gJ29uJ1xufVxuXG5leHBvcnQgZW51bSBTaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQge1xuXHRJbnZva2UgPSAxLFxuXHRUcmlnZ2VyQ2hhcmFjdGVyID0gMixcblx0Q29udGVudENoYW5nZSA9IDNcbn1cblxuLyoqXG4gKiBBIHN5bWJvbCBraW5kLlxuICovXG5leHBvcnQgZW51bSBTeW1ib2xLaW5kIHtcblx0RmlsZSA9IDAsXG5cdE1vZHVsZSA9IDEsXG5cdE5hbWVzcGFjZSA9IDIsXG5cdFBhY2thZ2UgPSAzLFxuXHRDbGFzcyA9IDQsXG5cdE1ldGhvZCA9IDUsXG5cdFByb3BlcnR5ID0gNixcblx0RmllbGQgPSA3LFxuXHRDb25zdHJ1Y3RvciA9IDgsXG5cdEVudW0gPSA5LFxuXHRJbnRlcmZhY2UgPSAxMCxcblx0RnVuY3Rpb24gPSAxMSxcblx0VmFyaWFibGUgPSAxMixcblx0Q29uc3RhbnQgPSAxMyxcblx0U3RyaW5nID0gMTQsXG5cdE51bWJlciA9IDE1LFxuXHRCb29sZWFuID0gMTYsXG5cdEFycmF5ID0gMTcsXG5cdE9iamVjdCA9IDE4LFxuXHRLZXkgPSAxOSxcblx0TnVsbCA9IDIwLFxuXHRFbnVtTWVtYmVyID0gMjEsXG5cdFN0cnVjdCA9IDIyLFxuXHRFdmVudCA9IDIzLFxuXHRPcGVyYXRvciA9IDI0LFxuXHRUeXBlUGFyYW1ldGVyID0gMjVcbn1cblxuZXhwb3J0IGVudW0gU3ltYm9sVGFnIHtcblx0RGVwcmVjYXRlZCA9IDFcbn1cblxuLyoqXG4gKiBUZXh0IERpcmVjdGlvbiBmb3IgYSBkZWNvcmF0aW9uLlxuICovXG5leHBvcnQgZW51bSBUZXh0RGlyZWN0aW9uIHtcblx0TFRSID0gMCxcblx0UlRMID0gMVxufVxuXG4vKipcbiAqIFRoZSBraW5kIG9mIGFuaW1hdGlvbiBpbiB3aGljaCB0aGUgZWRpdG9yJ3MgY3Vyc29yIHNob3VsZCBiZSByZW5kZXJlZC5cbiAqL1xuZXhwb3J0IGVudW0gVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUge1xuXHQvKipcblx0ICogSGlkZGVuXG5cdCAqL1xuXHRIaWRkZW4gPSAwLFxuXHQvKipcblx0ICogQmxpbmtpbmdcblx0ICovXG5cdEJsaW5rID0gMSxcblx0LyoqXG5cdCAqIEJsaW5raW5nIHdpdGggc21vb3RoIGZhZGluZ1xuXHQgKi9cblx0U21vb3RoID0gMixcblx0LyoqXG5cdCAqIEJsaW5raW5nIHdpdGggcHJvbG9uZ2VkIGZpbGxlZCBzdGF0ZSBhbmQgc21vb3RoIGZhZGluZ1xuXHQgKi9cblx0UGhhc2UgPSAzLFxuXHQvKipcblx0ICogRXhwYW5kIGNvbGxhcHNlIGFuaW1hdGlvbiBvbiB0aGUgeSBheGlzXG5cdCAqL1xuXHRFeHBhbmQgPSA0LFxuXHQvKipcblx0ICogTm8tQmxpbmtpbmdcblx0ICovXG5cdFNvbGlkID0gNVxufVxuXG4vKipcbiAqIFRoZSBzdHlsZSBpbiB3aGljaCB0aGUgZWRpdG9yJ3MgY3Vyc29yIHNob3VsZCBiZSByZW5kZXJlZC5cbiAqL1xuZXhwb3J0IGVudW0gVGV4dEVkaXRvckN1cnNvclN0eWxlIHtcblx0LyoqXG5cdCAqIEFzIGEgdmVydGljYWwgbGluZSAoc2l0dGluZyBiZXR3ZWVuIHR3byBjaGFyYWN0ZXJzKS5cblx0ICovXG5cdExpbmUgPSAxLFxuXHQvKipcblx0ICogQXMgYSBibG9jayAoc2l0dGluZyBvbiB0b3Agb2YgYSBjaGFyYWN0ZXIpLlxuXHQgKi9cblx0QmxvY2sgPSAyLFxuXHQvKipcblx0ICogQXMgYSBob3Jpem9udGFsIGxpbmUgKHNpdHRpbmcgdW5kZXIgYSBjaGFyYWN0ZXIpLlxuXHQgKi9cblx0VW5kZXJsaW5lID0gMyxcblx0LyoqXG5cdCAqIEFzIGEgdGhpbiB2ZXJ0aWNhbCBsaW5lIChzaXR0aW5nIGJldHdlZW4gdHdvIGNoYXJhY3RlcnMpLlxuXHQgKi9cblx0TGluZVRoaW4gPSA0LFxuXHQvKipcblx0ICogQXMgYW4gb3V0bGluZWQgYmxvY2sgKHNpdHRpbmcgb24gdG9wIG9mIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdEJsb2NrT3V0bGluZSA9IDUsXG5cdC8qKlxuXHQgKiBBcyBhIHRoaW4gaG9yaXpvbnRhbCBsaW5lIChzaXR0aW5nIHVuZGVyIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdFVuZGVybGluZVRoaW4gPSA2XG59XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBiZWhhdmlvciBvZiBkZWNvcmF0aW9ucyB3aGVuIHR5cGluZy9lZGl0aW5nIG5lYXIgdGhlaXIgZWRnZXMuXG4gKiBOb3RlOiBQbGVhc2UgZG8gbm90IGVkaXQgdGhlIHZhbHVlcywgYXMgdGhleSB2ZXJ5IGNhcmVmdWxseSBtYXRjaCBgRGVjb3JhdGlvblJhbmdlQmVoYXZpb3JgXG4gKi9cbmV4cG9ydCBlbnVtIFRyYWNrZWRSYW5nZVN0aWNraW5lc3Mge1xuXHRBbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzID0gMCxcblx0TmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzID0gMSxcblx0R3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSA9IDIsXG5cdEdyb3dzT25seVdoZW5UeXBpbmdBZnRlciA9IDNcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgaG93IHRvIGluZGVudCB3cmFwcGVkIGxpbmVzLlxuICovXG5leHBvcnQgZW51bSBXcmFwcGluZ0luZGVudCB7XG5cdC8qKlxuXHQgKiBObyBpbmRlbnRhdGlvbiA9PiB3cmFwcGVkIGxpbmVzIGJlZ2luIGF0IGNvbHVtbiAxLlxuXHQgKi9cblx0Tm9uZSA9IDAsXG5cdC8qKlxuXHQgKiBTYW1lID0+IHdyYXBwZWQgbGluZXMgZ2V0IHRoZSBzYW1lIGluZGVudGF0aW9uIGFzIHRoZSBwYXJlbnQuXG5cdCAqL1xuXHRTYW1lID0gMSxcblx0LyoqXG5cdCAqIEluZGVudCA9PiB3cmFwcGVkIGxpbmVzIGdldCArMSBpbmRlbnRhdGlvbiB0b3dhcmQgdGhlIHBhcmVudC5cblx0ICovXG5cdEluZGVudCA9IDIsXG5cdC8qKlxuXHQgKiBEZWVwSW5kZW50ID0+IHdyYXBwZWQgbGluZXMgZ2V0ICsyIGluZGVudGF0aW9uIHRvd2FyZCB0aGUgcGFyZW50LlxuXHQgKi9cblx0RGVlcEluZGVudCA9IDNcbn0iXSwKICAibWFwcGluZ3MiOiAiQUFRTyxJQUFLLHVCQUFMLGtCQUFLQSwwQkFBTDtBQUlOLEVBQUFBLDRDQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDRDQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLDRDQUFBLGFBQVUsS0FBVjtBQU5XLFNBQUFBO0FBQUEsR0FBQTtBQVNMLElBQUssd0JBQUwsa0JBQUtDLDJCQUFMO0FBQ04sRUFBQUEsOENBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsOENBQUEsVUFBTyxLQUFQO0FBRlcsU0FB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QSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxZQUFTLE1BQVQ7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxVQUFPLE1BQVA7QUFDQSxFQUFBQSxrQkFBQSxpQkFBYyxNQUFkO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsUUFBSyxNQUFMO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsU0FBTSxNQUFOO0FBQ0EsRUFBQUEsa0JBQUEsYUFBVSxNQUFWO0FBQ0EsRUFBQUEsa0JBQUEsZ0JBQWEsTUFBYjtBQUtBLEVBQUFBLGtCQUFBLGVBQVksTUFBWjtBQUtBLEVBQUFBLGtCQUFBLFdBQVEsTUFBUjtBQUtB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LGlDQUE4QixLQUE5QjtBQUNBLEVBQUFBLGdEQUFBLCtCQUE0QixLQUE1QjtBQUNBLEVBQUFBLGdEQUFBLDhCQUEyQixLQUEzQjtBQUpXLFNBQUFBO0FBQUEsR0FBQTtBQVVMLElBQUssaUJBQUwsa0JBQUtDLG9CQUFMO0FBSU4sRUFBQUEsZ0NBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsZ0NBQUEsVUFBTyxLQUFQO0FBSUEsRUFBQUEsZ0NBQUEsWUFBUyxLQUFUO0FBSUEsRUFBQUEsZ0NBQUEsZ0JBQWEsS0FBYjtBQWhCVyxTQUFBQTtBQUFBLEdBQUE7IiwKICAibmFtZXMiOiBbIkFjY2Vzc2liaWxpdHlTdXBwb3J0IiwgIkNvZGVBY3Rpb25UcmlnZ2VyVHlwZSIsICJDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlIiwgIkNvbXBsZXRpb25JdGVtS2luZCIsICJDb21wbGV0aW9uSXRlbVRhZyIsICJDb21wbGV0aW9uVHJpZ2dlcktpbmQiLCAiQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSIsICJDdXJzb3JDaGFuZ2VSZWFzb24iLCAiRGVmYXVsdEVuZE9mTGluZSIsICJEb2N1bWVudEhpZ2hsaWdodEtpbmQiLCAiRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IiwgIkVkaXRvck9wdGlvbiIsICJFbmRPZkxpbmVQcmVmZXJlbmNlIiwgIkVuZE9mTGluZVNlcXVlbmNlIiwgIkdseXBoTWFyZ2luTGFuZSIsICJIb3ZlclZlcmJvc2l0eUFjdGlvbiIsICJJbmRlbnRBY3Rpb24iLCAiSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMiLCAiSW5sYXlIaW50S2luZCIsICJJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCIsICJJbmxpbmVDb21wbGV0aW9uSGludFN0eWxlIiwgIklubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCIsICJLZXlDb2RlIiwgIk1hcmtlclNldmVyaXR5IiwgIk1hcmtlclRhZyIsICJNaW5pbWFwUG9zaXRpb24iLCAiTWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZSIsICJNb3VzZVRhcmdldFR5cGUiLCAiTmV3U3ltYm9sTmFtZVRhZyIsICJOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQiLCAiT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSIsICJPdmVydmlld1J1bGVyTGFuZSIsICJQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQiLCAiUG9zaXRpb25BZmZpbml0eSIsICJSZW5kZXJMaW5lTnVtYmVyc1R5cGUiLCAiUmVuZGVyTWluaW1hcCIsICJTY3JvbGxUeXBlIiwgIlNjcm9sbGJhclZpc2liaWxpdHkiLCAiU2VsZWN0aW9uRGlyZWN0aW9uIiwgIlNob3dMaWdodGJ1bGJJY29uTW9kZSIsICJTaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQiLCAiU3ltYm9sS2luZCIsICJTeW1ib2xUYWciLCAiVGV4dERpcmVjdGlvbiIsICJUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZSIsICJUZXh0RWRpdG9yQ3Vyc29yU3R5bGUiLCAiVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyIsICJXcmFwcGluZ0luZGVudCJdCn0K
