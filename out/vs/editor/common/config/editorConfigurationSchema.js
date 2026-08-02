import { diffEditorDefaultOptions } from "./diffEditor.js";
import { editorOptionsRegistry } from "./editorOptions.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import * as nls from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../platform/registry/common/platform.js";
const editorConfigurationBaseNode = Object.freeze({
  id: "editor",
  order: 5,
  type: "object",
  title: nls.localize("editorConfigurationTitle", "Editor"),
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
});
const editorConfiguration = {
  ...editorConfigurationBaseNode,
  properties: {
    "editor.tabSize": {
      type: "number",
      default: EDITOR_MODEL_DEFAULTS.tabSize,
      minimum: 1,
      maximum: 100,
      markdownDescription: nls.localize("tabSize", "The number of spaces a tab is equal to. This setting is overridden based on the file contents when {0} is on.", "`#editor.detectIndentation#`")
    },
    "editor.indentSize": {
      "anyOf": [
        {
          type: "string",
          enum: ["tabSize"]
        },
        {
          type: "number",
          minimum: 1
        }
      ],
      default: "tabSize",
      markdownDescription: nls.localize("indentSize", 'The number of spaces used for indentation or `"tabSize"` to use the value from `#editor.tabSize#`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    "editor.insertSpaces": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.insertSpaces,
      markdownDescription: nls.localize("insertSpaces", "Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when {0} is on.", "`#editor.detectIndentation#`")
    },
    "editor.detectIndentation": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.detectIndentation,
      markdownDescription: nls.localize("detectIndentation", "Controls whether {0} and {1} will be automatically detected when a file is opened based on the file contents.", "`#editor.tabSize#`", "`#editor.insertSpaces#`")
    },
    "editor.trimAutoWhitespace": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
      description: nls.localize("trimAutoWhitespace", "Remove trailing auto inserted whitespace.")
    },
    "editor.largeFileOptimizations": {
      type: "boolean",
      default: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
      description: nls.localize("largeFileOptimizations", "Special handling for large files to disable certain memory intensive features.")
    },
    "editor.wordBasedSuggestions": {
      enum: ["off", "offWithInlineSuggestions", "currentDocument", "matchingDocuments", "allDocuments"],
      default: "offWithInlineSuggestions",
      enumDescriptions: [
        nls.localize("wordBasedSuggestions.off", "Turn off Word Based Suggestions."),
        nls.localize("wordBasedSuggestions.offWithInlineSuggestions", "Turn off Word Based Suggestions when Inline Suggestions are present."),
        nls.localize("wordBasedSuggestions.currentDocument", "Only suggest words from the active document."),
        nls.localize("wordBasedSuggestions.matchingDocuments", "Suggest words from all open documents of the same language."),
        nls.localize("wordBasedSuggestions.allDocuments", "Suggest words from all open documents.")
      ],
      description: nls.localize("wordBasedSuggestions", "Controls whether completions should be computed based on words in the document and from which documents they are computed."),
      experiment: { mode: "auto" }
    },
    "editor.semanticHighlighting.enabled": {
      enum: [true, false, "configuredByTheme"],
      enumDescriptions: [
        nls.localize("semanticHighlighting.true", "Semantic highlighting enabled for all color themes."),
        nls.localize("semanticHighlighting.false", "Semantic highlighting disabled for all color themes."),
        nls.localize("semanticHighlighting.configuredByTheme", "Semantic highlighting is configured by the current color theme's `semanticHighlighting` setting.")
      ],
      default: "configuredByTheme",
      description: nls.localize("semanticHighlighting.enabled", "Controls whether the semanticHighlighting is shown for the languages that support it.")
    },
    "editor.stablePeek": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("stablePeek", "Keep peek editors open even when double-clicking their content or when hitting `Escape`.")
    },
    "editor.maxTokenizationLineLength": {
      type: "integer",
      default: 2e4,
      description: nls.localize("maxTokenizationLineLength", "Lines above this length will not be tokenized for performance reasons")
    },
    "editor.experimental.asyncTokenization": {
      type: "boolean",
      default: true,
      description: nls.localize("editor.experimental.asyncTokenization", "Controls whether the tokenization should happen asynchronously on a web worker."),
      tags: ["experimental"]
    },
    "editor.experimental.asyncTokenizationLogging": {
      type: "boolean",
      default: false,
      description: nls.localize("editor.experimental.asyncTokenizationLogging", "Controls whether async tokenization should be logged. For debugging only.")
    },
    "editor.experimental.asyncTokenizationVerification": {
      type: "boolean",
      default: false,
      description: nls.localize("editor.experimental.asyncTokenizationVerification", "Controls whether async tokenization should be verified against legacy background tokenization. Might slow down tokenization. For debugging only."),
      tags: ["experimental"]
    },
    "editor.experimental.treeSitterTelemetry": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.treeSitterTelemetry", "Controls whether tree sitter parsing should be turned on and telemetry collected. Setting `#editor.experimental.preferTreeSitter#` for specific languages will take precedence."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.css": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.css", "Controls whether tree sitter parsing should be turned on for css. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for css."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.typescript": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.typescript", "Controls whether tree sitter parsing should be turned on for typescript. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for typescript."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.ini": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.ini", "Controls whether tree sitter parsing should be turned on for ini. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for ini."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.experimental.preferTreeSitter.regex": {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("editor.experimental.preferTreeSitter.regex", "Controls whether tree sitter parsing should be turned on for regex. This will take precedence over `#editor.experimental.treeSitterTelemetry#` for regex."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    "editor.language.brackets": {
      type: ["array", "null"],
      default: null,
      // We want to distinguish the empty array from not configured.
      description: nls.localize("schema.brackets", "Defines the bracket symbols that increase or decrease the indentation."),
      items: {
        type: "array",
        items: [
          {
            type: "string",
            description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
          },
          {
            type: "string",
            description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
          }
        ]
      }
    },
    "editor.language.colorizedBracketPairs": {
      type: ["array", "null"],
      default: null,
      // We want to distinguish the empty array from not configured.
      description: nls.localize("schema.colorizedBracketPairs", "Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled."),
      items: {
        type: "array",
        items: [
          {
            type: "string",
            description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
          },
          {
            type: "string",
            description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
          }
        ]
      }
    },
    "diffEditor.maxComputationTime": {
      type: "number",
      default: diffEditorDefaultOptions.maxComputationTime,
      description: nls.localize("maxComputationTime", "Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.")
    },
    "diffEditor.maxFileSize": {
      type: "number",
      default: diffEditorDefaultOptions.maxFileSize,
      description: nls.localize("maxFileSize", "Maximum file size in MB for which to compute diffs. Use 0 for no limit.")
    },
    "diffEditor.renderSideBySide": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderSideBySide,
      description: nls.localize("sideBySide", "Controls whether the diff editor shows the diff side by side or inline."),
      agentsWindow: { default: true }
    },
    "diffEditor.renderSideBySideInlineBreakpoint": {
      type: "number",
      default: diffEditorDefaultOptions.renderSideBySideInlineBreakpoint,
      description: nls.localize("renderSideBySideInlineBreakpoint", "If the diff editor width is smaller than this value, the inline view is used.")
    },
    "diffEditor.useInlineViewWhenSpaceIsLimited": {
      type: "boolean",
      default: diffEditorDefaultOptions.useInlineViewWhenSpaceIsLimited,
      description: nls.localize("useInlineViewWhenSpaceIsLimited", "If enabled and the editor width is too small, the inline view is used."),
      agentsWindow: { default: true }
    },
    "diffEditor.renderMarginRevertIcon": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderMarginRevertIcon,
      description: nls.localize("renderMarginRevertIcon", "When enabled, the diff editor shows arrows in its glyph margin to revert changes."),
      agentsWindow: { default: false }
    },
    "diffEditor.renderGutterMenu": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderGutterMenu,
      description: nls.localize("renderGutterMenu", "When enabled, the diff editor shows a special gutter for revert and stage actions."),
      agentsWindow: { default: false }
    },
    "diffEditor.ignoreTrimWhitespace": {
      type: "boolean",
      default: diffEditorDefaultOptions.ignoreTrimWhitespace,
      description: nls.localize("ignoreTrimWhitespace", "When enabled, the diff editor ignores changes in leading or trailing whitespace.")
    },
    "diffEditor.renderIndicators": {
      type: "boolean",
      default: diffEditorDefaultOptions.renderIndicators,
      description: nls.localize("renderIndicators", "Controls whether the diff editor shows +/- indicators for added/removed changes."),
      agentsWindow: { default: false }
    },
    "diffEditor.codeLens": {
      type: "boolean",
      default: diffEditorDefaultOptions.diffCodeLens,
      description: nls.localize("codeLens", "Controls whether the editor shows CodeLens.")
    },
    "diffEditor.wordWrap": {
      type: "string",
      enum: ["off", "on", "inherit"],
      default: diffEditorDefaultOptions.diffWordWrap,
      markdownEnumDescriptions: [
        nls.localize("wordWrap.off", "Lines will never wrap."),
        nls.localize("wordWrap.on", "Lines will wrap at the viewport width."),
        nls.localize("wordWrap.inherit", "Lines will wrap according to the {0} setting.", "`#editor.wordWrap#`")
      ]
    },
    "diffEditor.diffAlgorithm": {
      type: "string",
      enum: ["legacy", "advanced", "advanced-external", "advanced-wasm"],
      default: diffEditorDefaultOptions.diffAlgorithm,
      markdownEnumDescriptions: [
        nls.localize("diffAlgorithm.legacy", "Uses the legacy diffing algorithm."),
        nls.localize("diffAlgorithm.advanced", "Uses the advanced diffing algorithm."),
        nls.localize("diffAlgorithm.advancedExternal", "Uses the advanced diffing algorithm from the external `@vscode/diff` package (pure JavaScript)."),
        nls.localize("diffAlgorithm.advancedWasm", "Uses the advanced diffing algorithm from the external `@vscode/diff` package (WebAssembly).")
      ]
    },
    "diffEditor.hideUnchangedRegions.enabled": {
      type: "boolean",
      default: diffEditorDefaultOptions.hideUnchangedRegions.enabled,
      markdownDescription: nls.localize("hideUnchangedRegions.enabled", "Controls whether the diff editor shows unchanged regions."),
      agentsWindow: { default: true }
    },
    "diffEditor.hideUnchangedRegions.revealLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.revealLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.revealLineCount", "Controls how many lines are used for unchanged regions."),
      minimum: 1
    },
    "diffEditor.hideUnchangedRegions.minimumLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.minimumLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.minimumLineCount", "Controls how many lines are used as a minimum for unchanged regions."),
      minimum: 1
    },
    "diffEditor.hideUnchangedRegions.contextLineCount": {
      type: "integer",
      default: diffEditorDefaultOptions.hideUnchangedRegions.contextLineCount,
      markdownDescription: nls.localize("hideUnchangedRegions.contextLineCount", "Controls how many lines are used as context when comparing unchanged regions."),
      minimum: 1
    },
    "diffEditor.experimental.showMoves": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.showMoves,
      markdownDescription: nls.localize("showMoves", "Controls whether the diff editor should show detected code moves.")
    },
    "diffEditor.experimental.showEmptyDecorations": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.showEmptyDecorations,
      description: nls.localize("showEmptyDecorations", "Controls whether the diff editor shows empty decorations to see where characters got inserted or deleted.")
    },
    "diffEditor.experimental.useTrueInlineView": {
      type: "boolean",
      default: diffEditorDefaultOptions.experimental.useTrueInlineView,
      description: nls.localize("useTrueInlineView", "If enabled and the editor uses the inline view, word changes are rendered inline.")
    }
  }
};
function isConfigurationPropertySchema(x) {
  return typeof x.type !== "undefined" || typeof x.anyOf !== "undefined";
}
for (const editorOption of editorOptionsRegistry) {
  const schema = editorOption.schema;
  if (typeof schema !== "undefined") {
    if (isConfigurationPropertySchema(schema)) {
      editorConfiguration.properties[`editor.${editorOption.name}`] = schema;
    } else {
      for (const key in schema) {
        if (Object.hasOwnProperty.call(schema, key)) {
          editorConfiguration.properties[key] = schema[key];
        }
      }
    }
  }
}
let cachedEditorConfigurationKeys = null;
function getEditorConfigurationKeys() {
  if (cachedEditorConfigurationKeys === null) {
    cachedEditorConfigurationKeys = /* @__PURE__ */ Object.create(null);
    Object.keys(editorConfiguration.properties).forEach((prop) => {
      cachedEditorConfigurationKeys[prop] = true;
    });
  }
  return cachedEditorConfigurationKeys;
}
function isEditorConfigurationKey(key) {
  const editorConfigurationKeys = getEditorConfigurationKeys();
  return editorConfigurationKeys[`editor.${key}`] || false;
}
function isDiffEditorConfigurationKey(key) {
  const editorConfigurationKeys = getEditorConfigurationKeys();
  return editorConfigurationKeys[`diffEditor.${key}`] || false;
}
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration(editorConfiguration);
async function registerEditorFontConfigurations(getFontSnippets) {
  const editorKeysWithFont = ["editor.fontFamily"];
  const fontSnippets = await getFontSnippets();
  for (const key of editorKeysWithFont) {
    if (editorConfiguration.properties && editorConfiguration.properties[key]) {
      editorConfiguration.properties[key].defaultSnippets = fontSnippets;
    }
  }
}
export {
  editorConfigurationBaseNode,
  isDiffEditorConfigurationKey,
  isEditorConfigurationKey,
  registerEditorFontConfigurations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElKU09OU2NoZW1hU25pcHBldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zIH0gZnJvbSAnLi9kaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IGVkaXRvck9wdGlvbnNSZWdpc3RyeSB9IGZyb20gJy4vZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfTU9ERUxfREVGQVVMVFMgfSBmcm9tICcuLi9jb3JlL21pc2MvdGV4dE1vZGVsRGVmYXVsdHMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUgPSBPYmplY3QuZnJlZXplPElDb25maWd1cmF0aW9uTm9kZT4oe1xuXHRpZDogJ2VkaXRvcicsXG5cdG9yZGVyOiA1LFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZWRpdG9yQ29uZmlndXJhdGlvblRpdGxlJywgXCJFZGl0b3JcIiksXG5cdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG59KTtcblxuY29uc3QgZWRpdG9yQ29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHQuLi5lZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnZWRpdG9yLnRhYlNpemUnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy50YWJTaXplLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFiU2l6ZScsIFwiVGhlIG51bWJlciBvZiBzcGFjZXMgYSB0YWIgaXMgZXF1YWwgdG8uIFRoaXMgc2V0dGluZyBpcyBvdmVycmlkZGVuIGJhc2VkIG9uIHRoZSBmaWxlIGNvbnRlbnRzIHdoZW4gezB9IGlzIG9uLlwiLCAnYCNlZGl0b3IuZGV0ZWN0SW5kZW50YXRpb24jYCcpXG5cdFx0fSxcblx0XHQnZWRpdG9yLmluZGVudFNpemUnOiB7XG5cdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ3RhYlNpemUnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0bWluaW11bTogMVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ3RhYlNpemUnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmRlbnRTaXplJywgXCJUaGUgbnVtYmVyIG9mIHNwYWNlcyB1c2VkIGZvciBpbmRlbnRhdGlvbiBvciBgXFxcInRhYlNpemVcXFwiYCB0byB1c2UgdGhlIHZhbHVlIGZyb20gYCNlZGl0b3IudGFiU2l6ZSNgLiBUaGlzIHNldHRpbmcgaXMgb3ZlcnJpZGRlbiBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cyB3aGVuIGAjZWRpdG9yLmRldGVjdEluZGVudGF0aW9uI2AgaXMgb24uXCIpXG5cdFx0fSxcblx0XHQnZWRpdG9yLmluc2VydFNwYWNlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5pbnNlcnRTcGFjZXMsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2luc2VydFNwYWNlcycsIFwiSW5zZXJ0IHNwYWNlcyB3aGVuIHByZXNzaW5nIGBUYWJgLiBUaGlzIHNldHRpbmcgaXMgb3ZlcnJpZGRlbiBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cyB3aGVuIHswfSBpcyBvbi5cIiwgJ2AjZWRpdG9yLmRldGVjdEluZGVudGF0aW9uI2AnKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5kZXRlY3RJbmRlbnRhdGlvbic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5kZXRlY3RJbmRlbnRhdGlvbixcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGV0ZWN0SW5kZW50YXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgezB9IGFuZCB7MX0gd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGRldGVjdGVkIHdoZW4gYSBmaWxlIGlzIG9wZW5lZCBiYXNlZCBvbiB0aGUgZmlsZSBjb250ZW50cy5cIiwgJ2AjZWRpdG9yLnRhYlNpemUjYCcsICdgI2VkaXRvci5pbnNlcnRTcGFjZXMjYCcpXG5cdFx0fSxcblx0XHQnZWRpdG9yLnRyaW1BdXRvV2hpdGVzcGFjZSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy50cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0cmltQXV0b1doaXRlc3BhY2UnLCBcIlJlbW92ZSB0cmFpbGluZyBhdXRvIGluc2VydGVkIHdoaXRlc3BhY2UuXCIpXG5cdFx0fSxcblx0XHQnZWRpdG9yLmxhcmdlRmlsZU9wdGltaXphdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBFRElUT1JfTU9ERUxfREVGQVVMVFMubGFyZ2VGaWxlT3B0aW1pemF0aW9ucyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xhcmdlRmlsZU9wdGltaXphdGlvbnMnLCBcIlNwZWNpYWwgaGFuZGxpbmcgZm9yIGxhcmdlIGZpbGVzIHRvIGRpc2FibGUgY2VydGFpbiBtZW1vcnkgaW50ZW5zaXZlIGZlYXR1cmVzLlwiKVxuXHRcdH0sXG5cdFx0J2VkaXRvci53b3JkQmFzZWRTdWdnZXN0aW9ucyc6IHtcblx0XHRcdGVudW06IFsnb2ZmJywgJ29mZldpdGhJbmxpbmVTdWdnZXN0aW9ucycsICdjdXJyZW50RG9jdW1lbnQnLCAnbWF0Y2hpbmdEb2N1bWVudHMnLCAnYWxsRG9jdW1lbnRzJ10sXG5cdFx0XHRkZWZhdWx0OiAnb2ZmV2l0aElubGluZVN1Z2dlc3Rpb25zJyxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucy5vZmYnLCAnVHVybiBvZmYgV29yZCBCYXNlZCBTdWdnZXN0aW9ucy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucy5vZmZXaXRoSW5saW5lU3VnZ2VzdGlvbnMnLCAnVHVybiBvZmYgV29yZCBCYXNlZCBTdWdnZXN0aW9ucyB3aGVuIElubGluZSBTdWdnZXN0aW9ucyBhcmUgcHJlc2VudC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucy5jdXJyZW50RG9jdW1lbnQnLCAnT25seSBzdWdnZXN0IHdvcmRzIGZyb20gdGhlIGFjdGl2ZSBkb2N1bWVudC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQmFzZWRTdWdnZXN0aW9ucy5tYXRjaGluZ0RvY3VtZW50cycsICdTdWdnZXN0IHdvcmRzIGZyb20gYWxsIG9wZW4gZG9jdW1lbnRzIG9mIHRoZSBzYW1lIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3dvcmRCYXNlZFN1Z2dlc3Rpb25zLmFsbERvY3VtZW50cycsICdTdWdnZXN0IHdvcmRzIGZyb20gYWxsIG9wZW4gZG9jdW1lbnRzLicpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmRCYXNlZFN1Z2dlc3Rpb25zJywgXCJDb250cm9scyB3aGV0aGVyIGNvbXBsZXRpb25zIHNob3VsZCBiZSBjb21wdXRlZCBiYXNlZCBvbiB3b3JkcyBpbiB0aGUgZG9jdW1lbnQgYW5kIGZyb20gd2hpY2ggZG9jdW1lbnRzIHRoZXkgYXJlIGNvbXB1dGVkLlwiKSxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgbW9kZTogJ2F1dG8nIH0sXG5cdFx0fSxcblx0XHQnZWRpdG9yLnNlbWFudGljSGlnaGxpZ2h0aW5nLmVuYWJsZWQnOiB7XG5cdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2UsICdjb25maWd1cmVkQnlUaGVtZSddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlbWFudGljSGlnaGxpZ2h0aW5nLnRydWUnLCAnU2VtYW50aWMgaGlnaGxpZ2h0aW5nIGVuYWJsZWQgZm9yIGFsbCBjb2xvciB0aGVtZXMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2VtYW50aWNIaWdobGlnaHRpbmcuZmFsc2UnLCAnU2VtYW50aWMgaGlnaGxpZ2h0aW5nIGRpc2FibGVkIGZvciBhbGwgY29sb3IgdGhlbWVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NlbWFudGljSGlnaGxpZ2h0aW5nLmNvbmZpZ3VyZWRCeVRoZW1lJywgJ1NlbWFudGljIGhpZ2hsaWdodGluZyBpcyBjb25maWd1cmVkIGJ5IHRoZSBjdXJyZW50IGNvbG9yIHRoZW1lXFwncyBgc2VtYW50aWNIaWdobGlnaHRpbmdgIHNldHRpbmcuJylcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnY29uZmlndXJlZEJ5VGhlbWUnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VtYW50aWNIaWdobGlnaHRpbmcuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc2VtYW50aWNIaWdobGlnaHRpbmcgaXMgc2hvd24gZm9yIHRoZSBsYW5ndWFnZXMgdGhhdCBzdXBwb3J0IGl0LlwiKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5zdGFibGVQZWVrJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N0YWJsZVBlZWsnLCBcIktlZXAgcGVlayBlZGl0b3JzIG9wZW4gZXZlbiB3aGVuIGRvdWJsZS1jbGlja2luZyB0aGVpciBjb250ZW50IG9yIHdoZW4gaGl0dGluZyBgRXNjYXBlYC5cIilcblx0XHR9LFxuXHRcdCdlZGl0b3IubWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCc6IHtcblx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdGRlZmF1bHQ6IDIwXzAwMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnLCBcIkxpbmVzIGFib3ZlIHRoaXMgbGVuZ3RoIHdpbGwgbm90IGJlIHRva2VuaXplZCBmb3IgcGVyZm9ybWFuY2UgcmVhc29uc1wiKVxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmV4cGVyaW1lbnRhbC5hc3luY1Rva2VuaXphdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdG9rZW5pemF0aW9uIHNob3VsZCBoYXBwZW4gYXN5bmNocm9ub3VzbHkgb24gYSB3ZWIgd29ya2VyLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHQnZWRpdG9yLmV4cGVyaW1lbnRhbC5hc3luY1Rva2VuaXphdGlvbkxvZ2dpbmcnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb25Mb2dnaW5nJywgXCJDb250cm9scyB3aGV0aGVyIGFzeW5jIHRva2VuaXphdGlvbiBzaG91bGQgYmUgbG9nZ2VkLiBGb3IgZGVidWdnaW5nIG9ubHkuXCIpLFxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb25WZXJpZmljYXRpb24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb25WZXJpZmljYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYXN5bmMgdG9rZW5pemF0aW9uIHNob3VsZCBiZSB2ZXJpZmllZCBhZ2FpbnN0IGxlZ2FjeSBiYWNrZ3JvdW5kIHRva2VuaXphdGlvbi4gTWlnaHQgc2xvdyBkb3duIHRva2VuaXphdGlvbi4gRm9yIGRlYnVnZ2luZyBvbmx5LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHQnZWRpdG9yLmV4cGVyaW1lbnRhbC50cmVlU2l0dGVyVGVsZW1ldHJ5Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeScsIFwiQ29udHJvbHMgd2hldGhlciB0cmVlIHNpdHRlciBwYXJzaW5nIHNob3VsZCBiZSB0dXJuZWQgb24gYW5kIHRlbGVtZXRyeSBjb2xsZWN0ZWQuIFNldHRpbmcgYCNlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIjYCBmb3Igc3BlY2lmaWMgbGFuZ3VhZ2VzIHdpbGwgdGFrZSBwcmVjZWRlbmNlLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci5jc3MnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLmNzcycsIFwiQ29udHJvbHMgd2hldGhlciB0cmVlIHNpdHRlciBwYXJzaW5nIHNob3VsZCBiZSB0dXJuZWQgb24gZm9yIGNzcy4gVGhpcyB3aWxsIHRha2UgcHJlY2VkZW5jZSBvdmVyIGAjZWRpdG9yLmV4cGVyaW1lbnRhbC50cmVlU2l0dGVyVGVsZW1ldHJ5I2AgZm9yIGNzcy5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIudHlwZXNjcmlwdCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIudHlwZXNjcmlwdCcsIFwiQ29udHJvbHMgd2hldGhlciB0cmVlIHNpdHRlciBwYXJzaW5nIHNob3VsZCBiZSB0dXJuZWQgb24gZm9yIHR5cGVzY3JpcHQuIFRoaXMgd2lsbCB0YWtlIHByZWNlZGVuY2Ugb3ZlciBgI2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeSNgIGZvciB0eXBlc2NyaXB0LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci5pbmknOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLmluaScsIFwiQ29udHJvbHMgd2hldGhlciB0cmVlIHNpdHRlciBwYXJzaW5nIHNob3VsZCBiZSB0dXJuZWQgb24gZm9yIGluaS4gVGhpcyB3aWxsIHRha2UgcHJlY2VkZW5jZSBvdmVyIGAjZWRpdG9yLmV4cGVyaW1lbnRhbC50cmVlU2l0dGVyVGVsZW1ldHJ5I2AgZm9yIGluaS5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIucmVnZXgnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmV4cGVyaW1lbnRhbC5wcmVmZXJUcmVlU2l0dGVyLnJlZ2V4JywgXCJDb250cm9scyB3aGV0aGVyIHRyZWUgc2l0dGVyIHBhcnNpbmcgc2hvdWxkIGJlIHR1cm5lZCBvbiBmb3IgcmVnZXguIFRoaXMgd2lsbCB0YWtlIHByZWNlZGVuY2Ugb3ZlciBgI2VkaXRvci5leHBlcmltZW50YWwudHJlZVNpdHRlclRlbGVtZXRyeSNgIGZvciByZWdleC5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IubGFuZ3VhZ2UuYnJhY2tldHMnOiB7XG5cdFx0XHR0eXBlOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsIC8vIFdlIHdhbnQgdG8gZGlzdGluZ3Vpc2ggdGhlIGVtcHR5IGFycmF5IGZyb20gbm90IGNvbmZpZ3VyZWQuXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuYnJhY2tldHMnLCAnRGVmaW5lcyB0aGUgYnJhY2tldCBzeW1ib2xzIHRoYXQgaW5jcmVhc2Ugb3IgZGVjcmVhc2UgdGhlIGluZGVudGF0aW9uLicpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vcGVuQnJhY2tldCcsICdUaGUgb3BlbmluZyBicmFja2V0IGNoYXJhY3RlciBvciBzdHJpbmcgc2VxdWVuY2UuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmNsb3NlQnJhY2tldCcsICdUaGUgY2xvc2luZyBicmFja2V0IGNoYXJhY3RlciBvciBzdHJpbmcgc2VxdWVuY2UuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdlZGl0b3IubGFuZ3VhZ2UuY29sb3JpemVkQnJhY2tldFBhaXJzJzoge1xuXHRcdFx0dHlwZTogWydhcnJheScsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLCAvLyBXZSB3YW50IHRvIGRpc3Rpbmd1aXNoIHRoZSBlbXB0eSBhcnJheSBmcm9tIG5vdCBjb25maWd1cmVkLlxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmNvbG9yaXplZEJyYWNrZXRQYWlycycsICdEZWZpbmVzIHRoZSBicmFja2V0IHBhaXJzIHRoYXQgYXJlIGNvbG9yaXplZCBieSB0aGVpciBuZXN0aW5nIGxldmVsIGlmIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb24gaXMgZW5hYmxlZC4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub3BlbkJyYWNrZXQnLCAnVGhlIG9wZW5pbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jbG9zZUJyYWNrZXQnLCAnVGhlIGNsb3NpbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5tYXhDb21wdXRhdGlvblRpbWUnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5tYXhDb21wdXRhdGlvblRpbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtYXhDb21wdXRhdGlvblRpbWUnLCBcIlRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzIGFmdGVyIHdoaWNoIGRpZmYgY29tcHV0YXRpb24gaXMgY2FuY2VsbGVkLiBVc2UgMCBmb3Igbm8gdGltZW91dC5cIilcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLm1heEZpbGVTaXplJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMubWF4RmlsZVNpemUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtYXhGaWxlU2l6ZScsIFwiTWF4aW11bSBmaWxlIHNpemUgaW4gTUIgZm9yIHdoaWNoIHRvIGNvbXB1dGUgZGlmZnMuIFVzZSAwIGZvciBubyBsaW1pdC5cIilcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NpZGVCeVNpZGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGRpZmYgZWRpdG9yIHNob3dzIHRoZSBkaWZmIHNpZGUgYnkgc2lkZSBvciBpbmxpbmUuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZUlubGluZUJyZWFrcG9pbnQsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludCcsIFwiSWYgdGhlIGRpZmYgZWRpdG9yIHdpZHRoIGlzIHNtYWxsZXIgdGhhbiB0aGlzIHZhbHVlLCB0aGUgaW5saW5lIHZpZXcgaXMgdXNlZC5cIilcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLnVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMudXNlSW5saW5lVmlld1doZW5TcGFjZUlzTGltaXRlZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQnLCBcIklmIGVuYWJsZWQgYW5kIHRoZSBlZGl0b3Igd2lkdGggaXMgdG9vIHNtYWxsLCB0aGUgaW5saW5lIHZpZXcgaXMgdXNlZC5cIiksXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IucmVuZGVyTWFyZ2luUmV2ZXJ0SWNvbic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5yZW5kZXJNYXJnaW5SZXZlcnRJY29uLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyTWFyZ2luUmV2ZXJ0SWNvbicsIFwiV2hlbiBlbmFibGVkLCB0aGUgZGlmZiBlZGl0b3Igc2hvd3MgYXJyb3dzIGluIGl0cyBnbHlwaCBtYXJnaW4gdG8gcmV2ZXJ0IGNoYW5nZXMuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5yZW5kZXJHdXR0ZXJNZW51Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLnJlbmRlckd1dHRlck1lbnUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJHdXR0ZXJNZW51JywgXCJXaGVuIGVuYWJsZWQsIHRoZSBkaWZmIGVkaXRvciBzaG93cyBhIHNwZWNpYWwgZ3V0dGVyIGZvciByZXZlcnQgYW5kIHN0YWdlIGFjdGlvbnMuXCIpLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5pZ25vcmVUcmltV2hpdGVzcGFjZSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5pZ25vcmVUcmltV2hpdGVzcGFjZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lnbm9yZVRyaW1XaGl0ZXNwYWNlJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBkaWZmIGVkaXRvciBpZ25vcmVzIGNoYW5nZXMgaW4gbGVhZGluZyBvciB0cmFpbGluZyB3aGl0ZXNwYWNlLlwiKVxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IucmVuZGVySW5kaWNhdG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5yZW5kZXJJbmRpY2F0b3JzLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVySW5kaWNhdG9ycycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZGlmZiBlZGl0b3Igc2hvd3MgKy8tIGluZGljYXRvcnMgZm9yIGFkZGVkL3JlbW92ZWQgY2hhbmdlcy5cIiksXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogZmFsc2UgfSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmNvZGVMZW5zJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmRpZmZDb2RlTGVucyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvZGVMZW5zJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvd3MgQ29kZUxlbnMuXCIpXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci53b3JkV3JhcCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvZmYnLCAnb24nLCAnaW5oZXJpdCddLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmRpZmZXb3JkV3JhcCxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3dvcmRXcmFwLm9mZicsIFwiTGluZXMgd2lsbCBuZXZlciB3cmFwLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkV3JhcC5vbicsIFwiTGluZXMgd2lsbCB3cmFwIGF0IHRoZSB2aWV3cG9ydCB3aWR0aC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZFdyYXAuaW5oZXJpdCcsIFwiTGluZXMgd2lsbCB3cmFwIGFjY29yZGluZyB0byB0aGUgezB9IHNldHRpbmcuXCIsICdgI2VkaXRvci53b3JkV3JhcCNgJyksXG5cdFx0XHRdXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5kaWZmQWxnb3JpdGhtJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2xlZ2FjeScsICdhZHZhbmNlZCcsICdhZHZhbmNlZC1leHRlcm5hbCcsICdhZHZhbmNlZC13YXNtJ10sXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuZGlmZkFsZ29yaXRobSxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2RpZmZBbGdvcml0aG0ubGVnYWN5JywgXCJVc2VzIHRoZSBsZWdhY3kgZGlmZmluZyBhbGdvcml0aG0uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2RpZmZBbGdvcml0aG0uYWR2YW5jZWQnLCBcIlVzZXMgdGhlIGFkdmFuY2VkIGRpZmZpbmcgYWxnb3JpdGhtLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWZmQWxnb3JpdGhtLmFkdmFuY2VkRXh0ZXJuYWwnLCBcIlVzZXMgdGhlIGFkdmFuY2VkIGRpZmZpbmcgYWxnb3JpdGhtIGZyb20gdGhlIGV4dGVybmFsIGBAdnNjb2RlL2RpZmZgIHBhY2thZ2UgKHB1cmUgSmF2YVNjcmlwdCkuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2RpZmZBbGdvcml0aG0uYWR2YW5jZWRXYXNtJywgXCJVc2VzIHRoZSBhZHZhbmNlZCBkaWZmaW5nIGFsZ29yaXRobSBmcm9tIHRoZSBleHRlcm5hbCBgQHZzY29kZS9kaWZmYCBwYWNrYWdlIChXZWJBc3NlbWJseSkuXCIpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5lbmFibGVkLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdoaWRlVW5jaGFuZ2VkUmVnaW9ucy5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBkaWZmIGVkaXRvciBzaG93cyB1bmNoYW5nZWQgcmVnaW9ucy5cIiksXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZFJlZ2lvbnMucmV2ZWFsTGluZUNvdW50Jzoge1xuXHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmhpZGVVbmNoYW5nZWRSZWdpb25zLnJldmVhbExpbmVDb3VudCxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaGlkZVVuY2hhbmdlZFJlZ2lvbnMucmV2ZWFsTGluZUNvdW50JywgXCJDb250cm9scyBob3cgbWFueSBsaW5lcyBhcmUgdXNlZCBmb3IgdW5jaGFuZ2VkIHJlZ2lvbnMuXCIpLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLm1pbmltdW1MaW5lQ291bnQnOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRkZWZhdWx0OiBkaWZmRWRpdG9yRGVmYXVsdE9wdGlvbnMuaGlkZVVuY2hhbmdlZFJlZ2lvbnMubWluaW11bUxpbmVDb3VudCxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaGlkZVVuY2hhbmdlZFJlZ2lvbnMubWluaW11bUxpbmVDb3VudCcsIFwiQ29udHJvbHMgaG93IG1hbnkgbGluZXMgYXJlIHVzZWQgYXMgYSBtaW5pbXVtIGZvciB1bmNoYW5nZWQgcmVnaW9ucy5cIiksXG5cdFx0XHRtaW5pbXVtOiAxLFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuY29udGV4dExpbmVDb3VudCc6IHtcblx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5jb250ZXh0TGluZUNvdW50LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdoaWRlVW5jaGFuZ2VkUmVnaW9ucy5jb250ZXh0TGluZUNvdW50JywgXCJDb250cm9scyBob3cgbWFueSBsaW5lcyBhcmUgdXNlZCBhcyBjb250ZXh0IHdoZW4gY29tcGFyaW5nIHVuY2hhbmdlZCByZWdpb25zLlwiKSxcblx0XHRcdG1pbmltdW06IDEsXG5cdFx0fSxcblx0XHQnZGlmZkVkaXRvci5leHBlcmltZW50YWwuc2hvd01vdmVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmV4cGVyaW1lbnRhbC5zaG93TW92ZXMsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Nob3dNb3ZlcycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZGlmZiBlZGl0b3Igc2hvdWxkIHNob3cgZGV0ZWN0ZWQgY29kZSBtb3Zlcy5cIilcblx0XHR9LFxuXHRcdCdkaWZmRWRpdG9yLmV4cGVyaW1lbnRhbC5zaG93RW1wdHlEZWNvcmF0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGRpZmZFZGl0b3JEZWZhdWx0T3B0aW9ucy5leHBlcmltZW50YWwuc2hvd0VtcHR5RGVjb3JhdGlvbnMsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzaG93RW1wdHlEZWNvcmF0aW9ucycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZGlmZiBlZGl0b3Igc2hvd3MgZW1wdHkgZGVjb3JhdGlvbnMgdG8gc2VlIHdoZXJlIGNoYXJhY3RlcnMgZ290IGluc2VydGVkIG9yIGRlbGV0ZWQuXCIpLFxuXHRcdH0sXG5cdFx0J2RpZmZFZGl0b3IuZXhwZXJpbWVudGFsLnVzZVRydWVJbmxpbmVWaWV3Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZGlmZkVkaXRvckRlZmF1bHRPcHRpb25zLmV4cGVyaW1lbnRhbC51c2VUcnVlSW5saW5lVmlldyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZVRydWVJbmxpbmVWaWV3JywgXCJJZiBlbmFibGVkIGFuZCB0aGUgZWRpdG9yIHVzZXMgdGhlIGlubGluZSB2aWV3LCB3b3JkIGNoYW5nZXMgYXJlIHJlbmRlcmVkIGlubGluZS5cIiksXG5cdFx0fSxcblx0fVxufTtcblxuZnVuY3Rpb24gaXNDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEoeDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHsgW3BhdGg6IHN0cmluZ106IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSk6IHggaXMgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB7XG5cdHJldHVybiAodHlwZW9mIHgudHlwZSAhPT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIHguYW55T2YgIT09ICd1bmRlZmluZWQnKTtcbn1cblxuLy8gQWRkIHByb3BlcnRpZXMgZnJvbSB0aGUgRWRpdG9yIE9wdGlvbiBSZWdpc3RyeVxuZm9yIChjb25zdCBlZGl0b3JPcHRpb24gb2YgZWRpdG9yT3B0aW9uc1JlZ2lzdHJ5KSB7XG5cdGNvbnN0IHNjaGVtYSA9IGVkaXRvck9wdGlvbi5zY2hlbWE7XG5cdGlmICh0eXBlb2Ygc2NoZW1hICE9PSAndW5kZWZpbmVkJykge1xuXHRcdGlmIChpc0NvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYShzY2hlbWEpKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGEgc2luZ2xlIHNjaGVtYSBjb250cmlidXRpb25cblx0XHRcdGVkaXRvckNvbmZpZ3VyYXRpb24ucHJvcGVydGllcyFbYGVkaXRvci4ke2VkaXRvck9wdGlvbi5uYW1lfWBdID0gc2NoZW1hO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBzY2hlbWEpIHtcblx0XHRcdFx0aWYgKE9iamVjdC5oYXNPd25Qcm9wZXJ0eS5jYWxsKHNjaGVtYSwga2V5KSkge1xuXHRcdFx0XHRcdGVkaXRvckNvbmZpZ3VyYXRpb24ucHJvcGVydGllcyFba2V5XSA9IHNjaGVtYVtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmxldCBjYWNoZWRFZGl0b3JDb25maWd1cmF0aW9uS2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gfCBudWxsID0gbnVsbDtcbmZ1bmN0aW9uIGdldEVkaXRvckNvbmZpZ3VyYXRpb25LZXlzKCk6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9IHtcblx0aWYgKGNhY2hlZEVkaXRvckNvbmZpZ3VyYXRpb25LZXlzID09PSBudWxsKSB7XG5cdFx0Y2FjaGVkRWRpdG9yQ29uZmlndXJhdGlvbktleXMgPSA8eyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0+T2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRPYmplY3Qua2V5cyhlZGl0b3JDb25maWd1cmF0aW9uLnByb3BlcnRpZXMhKS5mb3JFYWNoKChwcm9wKSA9PiB7XG5cdFx0XHRjYWNoZWRFZGl0b3JDb25maWd1cmF0aW9uS2V5cyFbcHJvcF0gPSB0cnVlO1xuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBjYWNoZWRFZGl0b3JDb25maWd1cmF0aW9uS2V5cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRpdG9yQ29uZmlndXJhdGlvbktleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uS2V5cyA9IGdldEVkaXRvckNvbmZpZ3VyYXRpb25LZXlzKCk7XG5cdHJldHVybiAoZWRpdG9yQ29uZmlndXJhdGlvbktleXNbYGVkaXRvci4ke2tleX1gXSB8fCBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RpZmZFZGl0b3JDb25maWd1cmF0aW9uS2V5KGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGVkaXRvckNvbmZpZ3VyYXRpb25LZXlzID0gZ2V0RWRpdG9yQ29uZmlndXJhdGlvbktleXMoKTtcblx0cmV0dXJuIChlZGl0b3JDb25maWd1cmF0aW9uS2V5c1tgZGlmZkVkaXRvci4ke2tleX1gXSB8fCBmYWxzZSk7XG59XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGVkaXRvckNvbmZpZ3VyYXRpb24pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXJFZGl0b3JGb250Q29uZmlndXJhdGlvbnMoZ2V0Rm9udFNuaXBwZXRzOiAoKSA9PiBQcm9taXNlPElKU09OU2NoZW1hU25pcHBldFtdPikge1xuXHRjb25zdCBlZGl0b3JLZXlzV2l0aEZvbnQgPSBbJ2VkaXRvci5mb250RmFtaWx5J107XG5cdGNvbnN0IGZvbnRTbmlwcGV0cyA9IGF3YWl0IGdldEZvbnRTbmlwcGV0cygpO1xuXHRmb3IgKGNvbnN0IGtleSBvZiBlZGl0b3JLZXlzV2l0aEZvbnQpIHtcblx0XHRpZiAoXG5cdFx0XHRlZGl0b3JDb25maWd1cmF0aW9uLnByb3BlcnRpZXMgJiYgZWRpdG9yQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzW2tleV1cblx0XHQpIHtcblx0XHRcdGVkaXRvckNvbmZpZ3VyYXRpb24ucHJvcGVydGllc1trZXldLmRlZmF1bHRTbmlwcGV0cyA9IGZvbnRTbmlwcGV0cztcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksU0FBUztBQUNyQixTQUFTLG9CQUFvQixrQkFBNEY7QUFDekgsU0FBUyxnQkFBZ0I7QUFFbEIsTUFBTSw4QkFBOEIsT0FBTyxPQUEyQjtBQUFBLEVBQzVFLElBQUk7QUFBQSxFQUNKLE9BQU87QUFBQSxFQUNQLE1BQU07QUFBQSxFQUNOLE9BQU8sSUFBSSxTQUFTLDRCQUE0QixRQUFRO0FBQUEsRUFDeEQsT0FBTyxtQkFBbUI7QUFDM0IsQ0FBQztBQUVELE1BQU0sc0JBQTBDO0FBQUEsRUFDL0MsR0FBRztBQUFBLEVBQ0gsWUFBWTtBQUFBLElBQ1gsa0JBQWtCO0FBQUEsTUFDakIsTUFBTTtBQUFBLE1BQ04sU0FBUyxzQkFBc0I7QUFBQSxNQUMvQixTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxxQkFBcUIsSUFBSSxTQUFTLFdBQVcsaUhBQWlILDhCQUE4QjtBQUFBLElBQzdMO0FBQUEsSUFDQSxxQkFBcUI7QUFBQSxNQUNwQixTQUFTO0FBQUEsUUFDUjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sTUFBTSxDQUFDLFNBQVM7QUFBQSxRQUNqQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQUksU0FBUyxjQUFjLG1NQUFxTTtBQUFBLElBQ3RQO0FBQUEsSUFDQSx1QkFBdUI7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixTQUFTLHNCQUFzQjtBQUFBLE1BQy9CLHFCQUFxQixJQUFJLFNBQVMsZ0JBQWdCLDRHQUE0Ryw4QkFB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
