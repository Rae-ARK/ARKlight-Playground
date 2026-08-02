import { isFalsyOrEmpty } from "../../../base/common/arrays.js";
import { Schemas, matchesSomeScheme } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { decodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { validateWhenClauses } from "../../../platform/contextkey/common/contextkey.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as typeConverters from "./extHostTypeConverters.js";
import * as types from "./extHostTypes.js";
const newCommands = [
  // -- document highlights
  new ApiCommand(
    "vscode.executeDocumentHighlights",
    "_executeDocumentHighlights",
    "Execute document highlight provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of DocumentHighlight-instances.", tryMapWith(typeConverters.DocumentHighlight.to))
  ),
  // -- document symbols
  new ApiCommand(
    "vscode.executeDocumentSymbolProvider",
    "_executeDocumentSymbolProvider",
    "Execute document symbol provider.",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of SymbolInformation and DocumentSymbol instances.", (value, apiArgs) => {
      if (isFalsyOrEmpty(value)) {
        return void 0;
      }
      class MergedInfo extends types.SymbolInformation {
        constructor() {
          super(...arguments);
          this.containerName = "";
        }
        static to(symbol) {
          const res = new MergedInfo(
            symbol.name,
            typeConverters.SymbolKind.to(symbol.kind),
            symbol.containerName || "",
            new types.Location(apiArgs[0], typeConverters.Range.to(symbol.range))
          );
          res.detail = symbol.detail;
          res.range = res.location.range;
          res.selectionRange = typeConverters.Range.to(symbol.selectionRange);
          res.children = symbol.children ? symbol.children.map(MergedInfo.to) : [];
          return res;
        }
      }
      return value.map(MergedInfo.to);
    })
  ),
  // -- formatting
  new ApiCommand(
    "vscode.executeFormatDocumentProvider",
    "_executeFormatDocumentProvider",
    "Execute document format provider.",
    [ApiCommandArgument.Uri, new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  new ApiCommand(
    "vscode.executeFormatRangeProvider",
    "_executeFormatRangeProvider",
    "Execute range format provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range, new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  new ApiCommand(
    "vscode.executeFormatOnTypeProvider",
    "_executeFormatOnTypeProvider",
    "Execute format on type provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, new ApiCommandArgument("ch", "Trigger character", (v) => typeof v === "string", (v) => v), new ApiCommandArgument("options", "Formatting options", (_) => true, (v) => v)],
    new ApiCommandResult("A promise that resolves to an array of TextEdits.", tryMapWith(typeConverters.TextEdit.to))
  ),
  // -- go to symbol (definition, type definition, declaration, impl, references)
  new ApiCommand(
    "vscode.executeDefinitionProvider",
    "_executeDefinitionProvider",
    "Execute all definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeDefinitionProvider_recursive",
    "_executeDefinitionProvider_recursive",
    "Execute all definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeTypeDefinitionProvider",
    "_executeTypeDefinitionProvider",
    "Execute all type definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeTypeDefinitionProvider_recursive",
    "_executeTypeDefinitionProvider_recursive",
    "Execute all type definition providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeDeclarationProvider",
    "_executeDeclarationProvider",
    "Execute all declaration providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeDeclarationProvider_recursive",
    "_executeDeclarationProvider_recursive",
    "Execute all declaration providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeImplementationProvider",
    "_executeImplementationProvider",
    "Execute all implementation providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.experimental.executeImplementationProvider_recursive",
    "_executeImplementationProvider_recursive",
    "Execute all implementation providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location or LocationLink instances.", mapLocationOrLocationLink)
  ),
  new ApiCommand(
    "vscode.executeReferenceProvider",
    "_executeReferenceProvider",
    "Execute all reference providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location-instances.", tryMapWith(typeConverters.location.to))
  ),
  new ApiCommand(
    "vscode.experimental.executeReferenceProvider",
    "_executeReferenceProvider_recursive",
    "Execute all reference providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Location-instances.", tryMapWith(typeConverters.location.to))
  ),
  // -- hover
  new ApiCommand(
    "vscode.executeHoverProvider",
    "_executeHoverProvider",
    "Execute all hover providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Hover-instances.", tryMapWith(typeConverters.Hover.to))
  ),
  new ApiCommand(
    "vscode.experimental.executeHoverProvider_recursive",
    "_executeHoverProvider_recursive",
    "Execute all hover providers.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of Hover-instances.", tryMapWith(typeConverters.Hover.to))
  ),
  // -- selection range
  new ApiCommand(
    "vscode.executeSelectionRangeProvider",
    "_executeSelectionRangeProvider",
    "Execute selection range provider.",
    [ApiCommandArgument.Uri, new ApiCommandArgument("position", "A position in a text document", (v) => Array.isArray(v) && v.every((v2) => types.Position.isPosition(v2)), (v) => v.map(typeConverters.Position.from))],
    new ApiCommandResult("A promise that resolves to an array of ranges.", (result) => {
      return result.map((ranges) => {
        let node;
        for (const range of ranges.reverse()) {
          node = new types.SelectionRange(typeConverters.Range.to(range), node);
        }
        return node;
      });
    })
  ),
  // -- symbol search
  new ApiCommand(
    "vscode.executeWorkspaceSymbolProvider",
    "_executeWorkspaceSymbolProvider",
    "Execute all workspace symbol providers.",
    [ApiCommandArgument.String.with("query", "Search string")],
    new ApiCommandResult("A promise that resolves to an array of SymbolInformation-instances.", (value) => {
      return value.map(typeConverters.WorkspaceSymbol.to);
    })
  ),
  // --- call hierarchy
  new ApiCommand(
    "vscode.prepareCallHierarchy",
    "_executePrepareCallHierarchy",
    "Prepare call hierarchy at a position inside a document",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyItem-instances", (v) => v.map(typeConverters.CallHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideIncomingCalls",
    "_executeProvideIncomingCalls",
    "Compute incoming calls for an item",
    [ApiCommandArgument.CallHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyIncomingCall-instances", (v) => v.map(typeConverters.CallHierarchyIncomingCall.to))
  ),
  new ApiCommand(
    "vscode.provideOutgoingCalls",
    "_executeProvideOutgoingCalls",
    "Compute outgoing calls for an item",
    [ApiCommandArgument.CallHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of CallHierarchyOutgoingCall-instances", (v) => v.map(typeConverters.CallHierarchyOutgoingCall.to))
  ),
  // --- rename
  new ApiCommand(
    "vscode.prepareRename",
    "_executePrepareRename",
    "Execute the prepareRename of rename provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to a range and placeholder text.", (value) => {
      if (!value) {
        return void 0;
      }
      return {
        range: typeConverters.Range.to(value.range),
        placeholder: value.text
      };
    })
  ),
  new ApiCommand(
    "vscode.executeDocumentRenameProvider",
    "_executeDocumentRenameProvider",
    "Execute rename provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with("newName", "The new symbol name")],
    new ApiCommandResult("A promise that resolves to a WorkspaceEdit.", (value) => {
      if (!value) {
        return void 0;
      }
      if (value.rejectReason) {
        throw new Error(value.rejectReason);
      }
      return typeConverters.WorkspaceEdit.to(value);
    })
  ),
  // --- links
  new ApiCommand(
    "vscode.executeLinkProvider",
    "_executeLinkProvider",
    "Execute document link provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Number.with("linkResolveCount", "Number of links that should be resolved, only when links are unresolved.").optional()],
    new ApiCommandResult("A promise that resolves to an array of DocumentLink-instances.", (value) => value.map(typeConverters.DocumentLink.to))
  ),
  // --- semantic tokens
  new ApiCommand(
    "vscode.provideDocumentSemanticTokensLegend",
    "_provideDocumentSemanticTokensLegend",
    "Provide semantic tokens legend for a document",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to SemanticTokensLegend.", (value) => {
      if (!value) {
        return void 0;
      }
      return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentSemanticTokens",
    "_provideDocumentSemanticTokens",
    "Provide semantic tokens for a document",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to SemanticTokens.", (value) => {
      if (!value) {
        return void 0;
      }
      const semanticTokensDto = decodeSemanticTokensDto(value);
      if (semanticTokensDto.type !== "full") {
        return void 0;
      }
      return new types.SemanticTokens(semanticTokensDto.data, void 0);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentRangeSemanticTokensLegend",
    "_provideDocumentRangeSemanticTokensLegend",
    "Provide semantic tokens legend for a document range",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range.optional()],
    new ApiCommandResult("A promise that resolves to SemanticTokensLegend.", (value) => {
      if (!value) {
        return void 0;
      }
      return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
    })
  ),
  new ApiCommand(
    "vscode.provideDocumentRangeSemanticTokens",
    "_provideDocumentRangeSemanticTokens",
    "Provide semantic tokens for a document range",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range],
    new ApiCommandResult("A promise that resolves to SemanticTokens.", (value) => {
      if (!value) {
        return void 0;
      }
      const semanticTokensDto = decodeSemanticTokensDto(value);
      if (semanticTokensDto.type !== "full") {
        return void 0;
      }
      return new types.SemanticTokens(semanticTokensDto.data, void 0);
    })
  ),
  // --- completions
  new ApiCommand(
    "vscode.executeCompletionItemProvider",
    "_executeCompletionItemProvider",
    "Execute completion item provider.",
    [
      ApiCommandArgument.Uri,
      ApiCommandArgument.Position,
      ApiCommandArgument.String.with("triggerCharacter", "Trigger completion when the user types the character, like `,` or `(`").optional(),
      ApiCommandArgument.Number.with("itemResolveCount", "Number of completions to resolve (too large numbers slow down completions)").optional()
    ],
    new ApiCommandResult("A promise that resolves to a CompletionList-instance.", (value, _args, converter) => {
      if (!value) {
        return new types.CompletionList([]);
      }
      const items = value.suggestions.map((suggestion) => typeConverters.CompletionItem.to(suggestion, converter));
      return new types.CompletionList(items, value.incomplete);
    })
  ),
  // --- signature help
  new ApiCommand(
    "vscode.executeSignatureHelpProvider",
    "_executeSignatureHelpProvider",
    "Execute signature help provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with("triggerCharacter", "Trigger signature help when the user types the character, like `,` or `(`").optional()],
    new ApiCommandResult("A promise that resolves to SignatureHelp.", (value) => {
      if (value) {
        return typeConverters.SignatureHelp.to(value);
      }
      return void 0;
    })
  ),
  // --- code lens
  new ApiCommand(
    "vscode.executeCodeLensProvider",
    "_executeCodeLensProvider",
    "Execute code lens provider.",
    [ApiCommandArgument.Uri, ApiCommandArgument.Number.with("itemResolveCount", "Number of lenses that should be resolved and returned. Will only return resolved lenses, will impact performance)").optional()],
    new ApiCommandResult("A promise that resolves to an array of CodeLens-instances.", (value, _args, converter) => {
      return tryMapWith((item) => {
        return new types.CodeLens(typeConverters.Range.to(item.range), item.command && converter.fromInternal(item.command));
      })(value);
    })
  ),
  // --- code actions
  new ApiCommand(
    "vscode.executeCodeActionProvider",
    "_executeCodeActionProvider",
    "Execute code action provider.",
    [
      ApiCommandArgument.Uri,
      new ApiCommandArgument("rangeOrSelection", "Range in a text document. Some refactoring provider requires Selection object.", (v) => types.Range.isRange(v), (v) => types.Selection.isSelection(v) ? typeConverters.Selection.from(v) : typeConverters.Range.from(v)),
      ApiCommandArgument.String.with("kind", "Code action kind to return code actions for").optional(),
      ApiCommandArgument.Number.with("itemResolveCount", "Number of code actions to resolve (too large numbers slow down code actions)").optional()
    ],
    new ApiCommandResult("A promise that resolves to an array of Command-instances.", (value, _args, converter) => {
      return tryMapWith((codeAction) => {
        if (codeAction._isSynthetic) {
          if (!codeAction.command) {
            throw new Error("Synthetic code actions must have a command");
          }
          return converter.fromInternal(codeAction.command);
        } else {
          const ret = new types.CodeAction(
            codeAction.title,
            codeAction.kind ? new types.CodeActionKind(codeAction.kind) : void 0
          );
          if (codeAction.edit) {
            ret.edit = typeConverters.WorkspaceEdit.to(codeAction.edit);
          }
          if (codeAction.command) {
            ret.command = converter.fromInternal(codeAction.command);
          }
          ret.isPreferred = codeAction.isPreferred;
          return ret;
        }
      })(value);
    })
  ),
  // --- colors
  new ApiCommand(
    "vscode.executeDocumentColorProvider",
    "_executeDocumentColorProvider",
    "Execute document color provider.",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of ColorInformation objects.", (result) => {
      if (result) {
        return result.map((ci) => new types.ColorInformation(typeConverters.Range.to(ci.range), typeConverters.Color.to(ci.color)));
      }
      return [];
    })
  ),
  new ApiCommand(
    "vscode.executeColorPresentationProvider",
    "_executeColorPresentationProvider",
    "Execute color presentation provider.",
    [
      new ApiCommandArgument("color", "The color to show and insert", (v) => v instanceof types.Color, typeConverters.Color.from),
      new ApiCommandArgument("context", "Context object with uri and range", (_v) => true, (v) => ({ uri: v.uri, range: typeConverters.Range.from(v.range) }))
    ],
    new ApiCommandResult("A promise that resolves to an array of ColorPresentation objects.", (result) => {
      if (result) {
        return result.map(typeConverters.ColorPresentation.to);
      }
      return [];
    })
  ),
  // --- inline hints
  new ApiCommand(
    "vscode.executeInlayHintProvider",
    "_executeInlayHintProvider",
    "Execute inlay hints provider",
    [ApiCommandArgument.Uri, ApiCommandArgument.Range],
    new ApiCommandResult("A promise that resolves to an array of Inlay objects", (result, args, converter) => {
      return result.map(typeConverters.InlayHint.to.bind(void 0, converter));
    })
  ),
  // --- folding
  new ApiCommand(
    "vscode.executeFoldingRangeProvider",
    "_executeFoldingRangeProvider",
    "Execute folding range provider",
    [ApiCommandArgument.Uri],
    new ApiCommandResult("A promise that resolves to an array of FoldingRange objects", (result, args) => {
      if (result) {
        return result.map(typeConverters.FoldingRange.to);
      }
      return void 0;
    })
  ),
  // --- notebooks
  new ApiCommand(
    "vscode.resolveNotebookContentProviders",
    "_resolveNotebookContentProvider",
    "Resolve Notebook Content Providers",
    [
      // new ApiCommandArgument<string, string>('viewType', '', v => typeof v === 'string', v => v),
      // new ApiCommandArgument<string, string>('displayName', '', v => typeof v === 'string', v => v),
      // new ApiCommandArgument<object, object>('options', '', v => typeof v === 'object', v => v),
    ],
    new ApiCommandResult("A promise that resolves to an array of NotebookContentProvider static info objects.", tryMapWith((item) => {
      return {
        viewType: item.viewType,
        displayName: item.displayName,
        options: {
          transientOutputs: item.options.transientOutputs,
          transientCellMetadata: item.options.transientCellMetadata,
          transientDocumentMetadata: item.options.transientDocumentMetadata
        },
        filenamePattern: item.filenamePattern.map((pattern) => typeConverters.NotebookExclusiveDocumentPattern.to(pattern))
      };
    }))
  ),
  // --- debug support
  new ApiCommand(
    "vscode.executeInlineValueProvider",
    "_executeInlineValueProvider",
    "Execute inline value provider",
    [
      ApiCommandArgument.Uri,
      ApiCommandArgument.Range,
      new ApiCommandArgument("context", "An InlineValueContext", (v) => v && typeof v.frameId === "number" && v.stoppedLocation instanceof types.Range, (v) => typeConverters.InlineValueContext.from(v))
    ],
    new ApiCommandResult("A promise that resolves to an array of InlineValue objects", (result) => {
      return result.map(typeConverters.InlineValue.to);
    })
  ),
  // --- open'ish commands
  new ApiCommand(
    "vscode.open",
    "_workbench.open",
    "Opens the provided resource in the editor. Can be a text or binary file, or an http(s) URL. If you need more control over the options for opening a text file, use vscode.window.showTextDocument instead.",
    [
      new ApiCommandArgument("uriOrString", "Uri-instance or string (only http/https)", (v) => URI.isUri(v) || typeof v === "string" && matchesSomeScheme(v, Schemas.http, Schemas.https), (v) => v),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "number" || typeof v === "object",
        (v) => !v ? v : typeof v === "number" ? [typeConverters.ViewColumn.from(v), void 0] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional(),
      ApiCommandArgument.String.with("label", "").optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.openWith",
    "_workbench.openWith",
    "Opens the provided resource with a specific editor.",
    [
      ApiCommandArgument.Uri.with("resource", "Resource to open"),
      ApiCommandArgument.String.with("viewId", "Custom editor view id. This should be the viewType string for custom editors or the notebookType string for notebooks. Use 'default' to use VS Code's default text editor"),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "number" || typeof v === "object",
        (v) => !v ? v : typeof v === "number" ? [typeConverters.ViewColumn.from(v), void 0] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.diff",
    "_workbench.diff",
    "Opens the provided resources in the diff editor to compare their contents.",
    [
      ApiCommandArgument.Uri.with("left", "Left-hand side resource of the diff editor"),
      ApiCommandArgument.Uri.with("right", "Right-hand side resource of the diff editor"),
      ApiCommandArgument.String.with("title", "Human readable title for the diff editor").optional(),
      new ApiCommandArgument(
        "columnOrOptions",
        "Either the column in which to open or editor options, see vscode.TextDocumentShowOptions",
        (v) => v === void 0 || typeof v === "object",
        (v) => v && [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
      ).optional()
    ],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.changes",
    "_workbench.changes",
    "Opens a list of resources in the changes editor to compare their contents.",
    [
      ApiCommandArgument.String.with("title", "Human readable title for the changes editor"),
      new ApiCommandArgument(
        "resourceList",
        "List of resources to compare",
        (resources) => {
          for (const resource of resources) {
            if (resource.length !== 3) {
              return false;
            }
            const [label, left, right] = resource;
            if (!URI.isUri(label) || !URI.isUri(left) && left !== void 0 && left !== null || !URI.isUri(right) && right !== void 0 && right !== null) {
              return false;
            }
          }
          return true;
        },
        (v) => v
      )
    ],
    ApiCommandResult.Void
  ),
  // --- type hierarchy
  new ApiCommand(
    "vscode.prepareTypeHierarchy",
    "_executePrepareTypeHierarchy",
    "Prepare type hierarchy at a position inside a document",
    [ApiCommandArgument.Uri, ApiCommandArgument.Position],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideSupertypes",
    "_executeProvideSupertypes",
    "Compute supertypes for an item",
    [ApiCommandArgument.TypeHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  new ApiCommand(
    "vscode.provideSubtypes",
    "_executeProvideSubtypes",
    "Compute subtypes for an item",
    [ApiCommandArgument.TypeHierarchyItem],
    new ApiCommandResult("A promise that resolves to an array of TypeHierarchyItem-instances", (v) => v.map(typeConverters.TypeHierarchyItem.to))
  ),
  // --- testing
  new ApiCommand(
    "vscode.revealTestInExplorer",
    "_revealTestInExplorer",
    "Reveals a test instance in the explorer",
    [ApiCommandArgument.TestItem],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.startContinuousTestRun",
    "testing.startContinuousRunFromExtension",
    "Starts running the given tests with continuous run mode.",
    [ApiCommandArgument.TestProfile, ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
    ApiCommandResult.Void
  ),
  new ApiCommand(
    "vscode.stopContinuousTestRun",
    "testing.stopContinuousRunFromExtension",
    "Stops running the given tests with continuous run mode.",
    [ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
    ApiCommandResult.Void
  ),
  // --- continue edit session
  new ApiCommand(
    "vscode.experimental.editSession.continue",
    "_workbench.editSessions.actions.continueEditSession",
    "Continue the current edit session in a different workspace",
    [ApiCommandArgument.Uri.with("workspaceUri", "The target workspace to continue the current edit session in")],
    ApiCommandResult.Void
  ),
  // --- context keys
  new ApiCommand(
    "setContext",
    "_setContext",
    "Set a custom context key value that can be used in when clauses.",
    [
      ApiCommandArgument.String.with("name", "The context key name"),
      new ApiCommandArgument("value", "The context key value", () => true, (v) => v)
    ],
    ApiCommandResult.Void
  ),
  // --- inline chat
  new ApiCommand(
    "vscode.editorChat.start",
    "inlineChat.start",
    "Invoke a new editor chat session",
    [new ApiCommandArgument("Run arguments", "", (_v) => true, (v) => {
      if (!v) {
        return void 0;
      }
      return {
        initialRange: v.initialRange ? typeConverters.Range.from(v.initialRange) : void 0,
        initialSelection: types.Selection.isSelection(v.initialSelection) ? typeConverters.Selection.from(v.initialSelection) : void 0,
        message: v.message,
        attachments: v.attachments,
        autoSend: v.autoSend,
        position: v.position ? typeConverters.Position.from(v.position) : void 0,
        resolveOnResponse: v.resolveOnResponse
      };
    })],
    ApiCommandResult.Void
  ),
  // --- extension prompt files
  new ApiCommand(
    "vscode.extensionPromptFileProvider",
    "_listExtensionPromptFiles",
    "Get all extension-contributed prompt files (custom agents, instructions, and prompt files).",
    [],
    new ApiCommandResult(
      "A promise that resolves to an array of objects containing uri, type, and extensionId.",
      (value) => {
        if (!value) {
          return [];
        }
        return value.map((item) => ({
          uri: URI.revive(item.uri),
          type: item.type,
          extensionId: item.extensionId
        }));
      }
    )
  )
];
class ExtHostApiCommands {
  static register(commands) {
    newCommands.forEach(commands.registerApiCommand, commands);
    this._registerValidateWhenClausesCommand(commands);
  }
  static _registerValidateWhenClausesCommand(commands) {
    commands.registerCommand(false, "_validateWhenClauses", validateWhenClauses);
  }
}
function tryMapWith(f) {
  return (value) => {
    if (Array.isArray(value)) {
      return value.map(f);
    }
    return void 0;
  };
}
function mapLocationOrLocationLink(values) {
  if (!Array.isArray(values)) {
    return void 0;
  }
  const result = [];
  for (const item of values) {
    if (languages.isLocationLink(item)) {
      result.push(typeConverters.DefinitionLink.to(item));
    } else {
      result.push(typeConverters.location.to(item));
    }
  }
  return result;
}
export {
  ExtHostApiCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBcGlDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmFsc3lPckVtcHR5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMsIG1hdGNoZXNTb21lU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZGVjb2RlU2VtYW50aWNUb2tlbnNEdG8gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zRHRvLmpzJztcbmltcG9ydCB7IHZhbGlkYXRlV2hlbkNsYXVzZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDYWxsSGllcmFyY2h5SXRlbUR0bywgSUluY29taW5nQ2FsbER0bywgSUlubGluZVZhbHVlQ29udGV4dER0bywgSU91dGdvaW5nQ2FsbER0bywgSVJhd0NvbG9ySW5mbywgSVR5cGVIaWVyYXJjaHlJdGVtRHRvLCBJV29ya3NwYWNlRWRpdER0byB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBBcGlDb21tYW5kLCBBcGlDb21tYW5kQXJndW1lbnQsIEFwaUNvbW1hbmRSZXN1bHQsIEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEN1c3RvbUNvZGVBY3Rpb24gfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IFRyYW5zaWVudENlbGxNZXRhZGF0YSwgVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCAqIGFzIHNlYXJjaCBmcm9tICcuLi8uLi9jb250cmliL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgSUV4dGVuc2lvblByb21wdEZpbGVSZXN1bHQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9jaGF0UHJvbXB0RmlsZXNDb250cmlidXRpb24uanMnO1xuXG4vLyNyZWdpb24gLS0tIE5FVyB3b3JsZFxuXG5jb25zdCBuZXdDb21tYW5kczogQXBpQ29tbWFuZFtdID0gW1xuXHQvLyAtLSBkb2N1bWVudCBoaWdobGlnaHRzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50SGlnaGxpZ2h0cycsICdfZXhlY3V0ZURvY3VtZW50SGlnaGxpZ2h0cycsICdFeGVjdXRlIGRvY3VtZW50IGhpZ2hsaWdodCBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodFtdLCB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodFtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgRG9jdW1lbnRIaWdobGlnaHQtaW5zdGFuY2VzLicsIHRyeU1hcFdpdGgodHlwZUNvbnZlcnRlcnMuRG9jdW1lbnRIaWdobGlnaHQudG8pKVxuXHQpLFxuXHQvLyAtLSBkb2N1bWVudCBzeW1ib2xzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50U3ltYm9sUHJvdmlkZXInLCAnX2V4ZWN1dGVEb2N1bWVudFN5bWJvbFByb3ZpZGVyJywgJ0V4ZWN1dGUgZG9jdW1lbnQgc3ltYm9sIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdLCB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb25bXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFN5bWJvbEluZm9ybWF0aW9uIGFuZCBEb2N1bWVudFN5bWJvbCBpbnN0YW5jZXMuJywgKHZhbHVlLCBhcGlBcmdzKSA9PiB7XG5cblx0XHRcdGlmIChpc0ZhbHN5T3JFbXB0eSh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNsYXNzIE1lcmdlZEluZm8gZXh0ZW5kcyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFN5bWJvbCB7XG5cdFx0XHRcdHN0YXRpYyB0byhzeW1ib2w6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbCk6IE1lcmdlZEluZm8ge1xuXHRcdFx0XHRcdGNvbnN0IHJlcyA9IG5ldyBNZXJnZWRJbmZvKFxuXHRcdFx0XHRcdFx0c3ltYm9sLm5hbWUsXG5cdFx0XHRcdFx0XHR0eXBlQ29udmVydGVycy5TeW1ib2xLaW5kLnRvKHN5bWJvbC5raW5kKSxcblx0XHRcdFx0XHRcdHN5bWJvbC5jb250YWluZXJOYW1lIHx8ICcnLFxuXHRcdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGFwaUFyZ3NbMF0sIHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKHN5bWJvbC5yYW5nZSkpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRyZXMuZGV0YWlsID0gc3ltYm9sLmRldGFpbDtcblx0XHRcdFx0XHRyZXMucmFuZ2UgPSByZXMubG9jYXRpb24ucmFuZ2U7XG5cdFx0XHRcdFx0cmVzLnNlbGVjdGlvblJhbmdlID0gdHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8oc3ltYm9sLnNlbGVjdGlvblJhbmdlKTtcblx0XHRcdFx0XHRyZXMuY2hpbGRyZW4gPSBzeW1ib2wuY2hpbGRyZW4gPyBzeW1ib2wuY2hpbGRyZW4ubWFwKE1lcmdlZEluZm8udG8pIDogW107XG5cdFx0XHRcdFx0cmV0dXJuIHJlcztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRldGFpbCE6IHN0cmluZztcblx0XHRcdFx0cmFuZ2UhOiB2c2NvZGUuUmFuZ2U7XG5cdFx0XHRcdHNlbGVjdGlvblJhbmdlITogdnNjb2RlLlJhbmdlO1xuXHRcdFx0XHRjaGlsZHJlbiE6IHZzY29kZS5Eb2N1bWVudFN5bWJvbFtdO1xuXHRcdFx0XHRvdmVycmlkZSBjb250YWluZXJOYW1lOiBzdHJpbmcgPSAnJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoTWVyZ2VkSW5mby50byk7XG5cblx0XHR9KVxuXHQpLFxuXHQvLyAtLSBmb3JtYXR0aW5nXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUZvcm1hdERvY3VtZW50UHJvdmlkZXInLCAnX2V4ZWN1dGVGb3JtYXREb2N1bWVudFByb3ZpZGVyJywgJ0V4ZWN1dGUgZG9jdW1lbnQgZm9ybWF0IHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ29wdGlvbnMnLCAnRm9ybWF0dGluZyBvcHRpb25zJywgXyA9PiB0cnVlLCB2ID0+IHYpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuVGV4dEVkaXRbXSwgdHlwZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFRleHRFZGl0cy4nLCB0cnlNYXBXaXRoKHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0LnRvKSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRm9ybWF0UmFuZ2VQcm92aWRlcicsICdfZXhlY3V0ZUZvcm1hdFJhbmdlUHJvdmlkZXInLCAnRXhlY3V0ZSByYW5nZSBmb3JtYXQgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlJhbmdlLCBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdvcHRpb25zJywgJ0Zvcm1hdHRpbmcgb3B0aW9ucycsIF8gPT4gdHJ1ZSwgdiA9PiB2KV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlRleHRFZGl0W10sIHR5cGVzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBUZXh0RWRpdHMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5UZXh0RWRpdC50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUZvcm1hdE9uVHlwZVByb3ZpZGVyJywgJ19leGVjdXRlRm9ybWF0T25UeXBlUHJvdmlkZXInLCAnRXhlY3V0ZSBmb3JtYXQgb24gdHlwZSBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb24sIG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ2NoJywgJ1RyaWdnZXIgY2hhcmFjdGVyJywgdiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycsIHYgPT4gdiksIG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ29wdGlvbnMnLCAnRm9ybWF0dGluZyBvcHRpb25zJywgXyA9PiB0cnVlLCB2ID0+IHYpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuVGV4dEVkaXRbXSwgdHlwZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIFRleHRFZGl0cy4nLCB0cnlNYXBXaXRoKHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0LnRvKSlcblx0KSxcblx0Ly8gLS0gZ28gdG8gc3ltYm9sIChkZWZpbml0aW9uLCB0eXBlIGRlZmluaXRpb24sIGRlY2xhcmF0aW9uLCBpbXBsLCByZWZlcmVuY2VzKVxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInLCAnX2V4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInLCAnRXhlY3V0ZSBhbGwgZGVmaW5pdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leHBlcmltZW50YWwuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcl9yZWN1cnNpdmUnLCAnX2V4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ0V4ZWN1dGUgYWxsIGRlZmluaXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInLCAnX2V4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgJ0V4ZWN1dGUgYWxsIHR5cGUgZGVmaW5pdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leHBlcmltZW50YWwuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ19leGVjdXRlVHlwZURlZmluaXRpb25Qcm92aWRlcl9yZWN1cnNpdmUnLCAnRXhlY3V0ZSBhbGwgdHlwZSBkZWZpbml0aW9uIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PChsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rKVtdLCAodHlwZXMuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24gb3IgTG9jYXRpb25MaW5rIGluc3RhbmNlcy4nLCBtYXBMb2NhdGlvbk9yTG9jYXRpb25MaW5rKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVEZWNsYXJhdGlvblByb3ZpZGVyJywgJ19leGVjdXRlRGVjbGFyYXRpb25Qcm92aWRlcicsICdFeGVjdXRlIGFsbCBkZWNsYXJhdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leHBlcmltZW50YWwuZXhlY3V0ZURlY2xhcmF0aW9uUHJvdmlkZXJfcmVjdXJzaXZlJywgJ19leGVjdXRlRGVjbGFyYXRpb25Qcm92aWRlcl9yZWN1cnNpdmUnLCAnRXhlY3V0ZSBhbGwgZGVjbGFyYXRpb24gcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8KGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmspW10sICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbiBvciBMb2NhdGlvbkxpbmsgaW5zdGFuY2VzLicsIG1hcExvY2F0aW9uT3JMb2NhdGlvbkxpbmspXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInLCAnX2V4ZWN1dGVJbXBsZW1lbnRhdGlvblByb3ZpZGVyJywgJ0V4ZWN1dGUgYWxsIGltcGxlbWVudGF0aW9uIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PChsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rKVtdLCAodHlwZXMuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgTG9jYXRpb24gb3IgTG9jYXRpb25MaW5rIGluc3RhbmNlcy4nLCBtYXBMb2NhdGlvbk9yTG9jYXRpb25MaW5rKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4cGVyaW1lbnRhbC5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcl9yZWN1cnNpdmUnLCAnX2V4ZWN1dGVJbXBsZW1lbnRhdGlvblByb3ZpZGVyX3JlY3Vyc2l2ZScsICdFeGVjdXRlIGFsbCBpbXBsZW1lbnRhdGlvbiBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDwobGFuZ3VhZ2VzLkxvY2F0aW9uIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaylbXSwgKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIExvY2F0aW9uIG9yIExvY2F0aW9uTGluayBpbnN0YW5jZXMuJywgbWFwTG9jYXRpb25PckxvY2F0aW9uTGluaylcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlUmVmZXJlbmNlUHJvdmlkZXInLCAnX2V4ZWN1dGVSZWZlcmVuY2VQcm92aWRlcicsICdFeGVjdXRlIGFsbCByZWZlcmVuY2UgcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLkxvY2F0aW9uW10sIHR5cGVzLkxvY2F0aW9uW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbi1pbnN0YW5jZXMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5sb2NhdGlvbi50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhwZXJpbWVudGFsLmV4ZWN1dGVSZWZlcmVuY2VQcm92aWRlcicsICdfZXhlY3V0ZVJlZmVyZW5jZVByb3ZpZGVyX3JlY3Vyc2l2ZScsICdFeGVjdXRlIGFsbCByZWZlcmVuY2UgcHJvdmlkZXJzLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLkxvY2F0aW9uW10sIHR5cGVzLkxvY2F0aW9uW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBMb2NhdGlvbi1pbnN0YW5jZXMuJywgdHJ5TWFwV2l0aCh0eXBlQ29udmVydGVycy5sb2NhdGlvbi50bykpXG5cdCksXG5cdC8vIC0tIGhvdmVyXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUhvdmVyUHJvdmlkZXInLCAnX2V4ZWN1dGVIb3ZlclByb3ZpZGVyJywgJ0V4ZWN1dGUgYWxsIGhvdmVyIHByb3ZpZGVycy4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Ib3ZlcltdLCB0eXBlcy5Ib3ZlcltdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgSG92ZXItaW5zdGFuY2VzLicsIHRyeU1hcFdpdGgodHlwZUNvbnZlcnRlcnMuSG92ZXIudG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4cGVyaW1lbnRhbC5leGVjdXRlSG92ZXJQcm92aWRlcl9yZWN1cnNpdmUnLCAnX2V4ZWN1dGVIb3ZlclByb3ZpZGVyX3JlY3Vyc2l2ZScsICdFeGVjdXRlIGFsbCBob3ZlciBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuSG92ZXJbXSwgdHlwZXMuSG92ZXJbXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIEhvdmVyLWluc3RhbmNlcy4nLCB0cnlNYXBXaXRoKHR5cGVDb252ZXJ0ZXJzLkhvdmVyLnRvKSlcblx0KSxcblx0Ly8gLS0gc2VsZWN0aW9uIHJhbmdlXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZVNlbGVjdGlvblJhbmdlUHJvdmlkZXInLCAnX2V4ZWN1dGVTZWxlY3Rpb25SYW5nZVByb3ZpZGVyJywgJ0V4ZWN1dGUgc2VsZWN0aW9uIHJhbmdlIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8dHlwZXMuUG9zaXRpb25bXSwgSVBvc2l0aW9uW10+KCdwb3NpdGlvbicsICdBIHBvc2l0aW9uIGluIGEgdGV4dCBkb2N1bWVudCcsIHYgPT4gQXJyYXkuaXNBcnJheSh2KSAmJiB2LmV2ZXJ5KHYgPT4gdHlwZXMuUG9zaXRpb24uaXNQb3NpdGlvbih2KSksIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuUG9zaXRpb24uZnJvbSkpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJUmFuZ2VbXVtdLCB0eXBlcy5TZWxlY3Rpb25SYW5nZVtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgcmFuZ2VzLicsIHJlc3VsdCA9PiB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcChyYW5nZXMgPT4ge1xuXHRcdFx0XHRsZXQgbm9kZTogdHlwZXMuU2VsZWN0aW9uUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzLnJldmVyc2UoKSkge1xuXHRcdFx0XHRcdG5vZGUgPSBuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UodHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8ocmFuZ2UpLCBub2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbm9kZSE7XG5cdFx0XHR9KTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLSBzeW1ib2wgc2VhcmNoXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgJ19leGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXInLCAnRXhlY3V0ZSBhbGwgd29ya3NwYWNlIHN5bWJvbCBwcm92aWRlcnMuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCdxdWVyeScsICdTZWFyY2ggc3RyaW5nJyldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sW10sIHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uW10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBTeW1ib2xJbmZvcm1hdGlvbi1pbnN0YW5jZXMuJywgdmFsdWUgPT4ge1xuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh0eXBlQ29udmVydGVycy5Xb3Jrc3BhY2VTeW1ib2wudG8pO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBjYWxsIGhpZXJhcmNoeVxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByZXBhcmVDYWxsSGllcmFyY2h5JywgJ19leGVjdXRlUHJlcGFyZUNhbGxIaWVyYXJjaHknLCAnUHJlcGFyZSBjYWxsIGhpZXJhcmNoeSBhdCBhIHBvc2l0aW9uIGluc2lkZSBhIGRvY3VtZW50Jyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50LlBvc2l0aW9uXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJQ2FsbEhpZXJhcmNoeUl0ZW1EdG9bXSwgdHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW1bXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIENhbGxIaWVyYXJjaHlJdGVtLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuQ2FsbEhpZXJhcmNoeUl0ZW0udG8pKVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVJbmNvbWluZ0NhbGxzJywgJ19leGVjdXRlUHJvdmlkZUluY29taW5nQ2FsbHMnLCAnQ29tcHV0ZSBpbmNvbWluZyBjYWxscyBmb3IgYW4gaXRlbScsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5DYWxsSGllcmFyY2h5SXRlbV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SUluY29taW5nQ2FsbER0b1tdLCB0eXBlcy5DYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsW10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBDYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsLWluc3RhbmNlcycsIHYgPT4gdi5tYXAodHlwZUNvbnZlcnRlcnMuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbC50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZU91dGdvaW5nQ2FsbHMnLCAnX2V4ZWN1dGVQcm92aWRlT3V0Z29pbmdDYWxscycsICdDb21wdXRlIG91dGdvaW5nIGNhbGxzIGZvciBhbiBpdGVtJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LkNhbGxIaWVyYXJjaHlJdGVtXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxJT3V0Z29pbmdDYWxsRHRvW10sIHR5cGVzLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxbXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIENhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwtaW5zdGFuY2VzJywgdiA9PiB2Lm1hcCh0eXBlQ29udmVydGVycy5DYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsLnRvKSlcblx0KSxcblx0Ly8gLS0tIHJlbmFtZVxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByZXBhcmVSZW5hbWUnLCAnX2V4ZWN1dGVQcmVwYXJlUmVuYW1lJywgJ0V4ZWN1dGUgdGhlIHByZXBhcmVSZW5hbWUgb2YgcmVuYW1lIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbl0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlJlbmFtZUxvY2F0aW9uLCB7IHJhbmdlOiB0eXBlcy5SYW5nZTsgcGxhY2Vob2xkZXI6IHN0cmluZyB9IHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSByYW5nZSBhbmQgcGxhY2Vob2xkZXIgdGV4dC4nLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogdHlwZUNvbnZlcnRlcnMuUmFuZ2UudG8odmFsdWUucmFuZ2UpLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogdmFsdWUudGV4dFxuXHRcdFx0fTtcblx0XHR9KVxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVEb2N1bWVudFJlbmFtZVByb3ZpZGVyJywgJ19leGVjdXRlRG9jdW1lbnRSZW5hbWVQcm92aWRlcicsICdFeGVjdXRlIHJlbmFtZSBwcm92aWRlci4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb24sIEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgnbmV3TmFtZScsICdUaGUgbmV3IHN5bWJvbCBuYW1lJyldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElXb3Jrc3BhY2VFZGl0RHRvICYgeyByZWplY3RSZWFzb24/OiBzdHJpbmcgfSwgdHlwZXMuV29ya3NwYWNlRWRpdCB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgV29ya3NwYWNlRWRpdC4nLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUucmVqZWN0UmVhc29uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcih2YWx1ZS5yZWplY3RSZWFzb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHR5cGVDb252ZXJ0ZXJzLldvcmtzcGFjZUVkaXQudG8odmFsdWUpO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBsaW5rc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVMaW5rUHJvdmlkZXInLCAnX2V4ZWN1dGVMaW5rUHJvdmlkZXInLCAnRXhlY3V0ZSBkb2N1bWVudCBsaW5rIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5OdW1iZXIud2l0aCgnbGlua1Jlc29sdmVDb3VudCcsICdOdW1iZXIgb2YgbGlua3MgdGhhdCBzaG91bGQgYmUgcmVzb2x2ZWQsIG9ubHkgd2hlbiBsaW5rcyBhcmUgdW5yZXNvbHZlZC4nKS5vcHRpb25hbCgpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuSUxpbmtbXSwgdnNjb2RlLkRvY3VtZW50TGlua1tdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgRG9jdW1lbnRMaW5rLWluc3RhbmNlcy4nLCB2YWx1ZSA9PiB2YWx1ZS5tYXAodHlwZUNvbnZlcnRlcnMuRG9jdW1lbnRMaW5rLnRvKSlcblx0KSxcblx0Ly8gLS0tIHNlbWFudGljIHRva2Vuc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zTGVnZW5kJywgJ19wcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0xlZ2VuZCcsICdQcm92aWRlIHNlbWFudGljIHRva2VucyBsZWdlbmQgZm9yIGEgZG9jdW1lbnQnLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQsIHR5cGVzLlNlbWFudGljVG9rZW5zTGVnZW5kIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gU2VtYW50aWNUb2tlbnNMZWdlbmQuJywgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCh2YWx1ZS50b2tlblR5cGVzLCB2YWx1ZS50b2tlbk1vZGlmaWVycyk7XG5cdFx0fSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5wcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2VucycsICdfcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMnLCAnUHJvdmlkZSBzZW1hbnRpYyB0b2tlbnMgZm9yIGEgZG9jdW1lbnQnLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxWU0J1ZmZlciwgdHlwZXMuU2VtYW50aWNUb2tlbnMgfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBTZW1hbnRpY1Rva2Vucy4nLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZW1hbnRpY1Rva2Vuc0R0byA9IGRlY29kZVNlbWFudGljVG9rZW5zRHRvKHZhbHVlKTtcblx0XHRcdGlmIChzZW1hbnRpY1Rva2Vuc0R0by50eXBlICE9PSAnZnVsbCcpIHtcblx0XHRcdFx0Ly8gb25seSBhY2NlcHRpbmcgZnVsbCBzZW1hbnRpYyB0b2tlbnMgZnJvbSBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5TZW1hbnRpY1Rva2VucyhzZW1hbnRpY1Rva2Vuc0R0by5kYXRhLCB1bmRlZmluZWQpO1xuXHRcdH0pXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0xlZ2VuZCcsICdfcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0xlZ2VuZCcsICdQcm92aWRlIHNlbWFudGljIHRva2VucyBsZWdlbmQgZm9yIGEgZG9jdW1lbnQgcmFuZ2UnLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUmFuZ2Uub3B0aW9uYWwoKV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kLCB0eXBlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIFNlbWFudGljVG9rZW5zTGVnZW5kLicsIHZhbHVlID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQodmFsdWUudG9rZW5UeXBlcywgdmFsdWUudG9rZW5Nb2RpZmllcnMpO1xuXHRcdH0pXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2VucycsICdfcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2VucycsICdQcm92aWRlIHNlbWFudGljIHRva2VucyBmb3IgYSBkb2N1bWVudCByYW5nZScsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5SYW5nZV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8VlNCdWZmZXIsIHR5cGVzLlNlbWFudGljVG9rZW5zIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gU2VtYW50aWNUb2tlbnMuJywgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VtYW50aWNUb2tlbnNEdG8gPSBkZWNvZGVTZW1hbnRpY1Rva2Vuc0R0byh2YWx1ZSk7XG5cdFx0XHRpZiAoc2VtYW50aWNUb2tlbnNEdG8udHlwZSAhPT0gJ2Z1bGwnKSB7XG5cdFx0XHRcdC8vIG9ubHkgYWNjZXB0aW5nIGZ1bGwgc2VtYW50aWMgdG9rZW5zIGZyb20gcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5TZW1hbnRpY1Rva2VucyhzZW1hbnRpY1Rva2Vuc0R0by5kYXRhLCB1bmRlZmluZWQpO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBjb21wbGV0aW9uc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVDb21wbGV0aW9uSXRlbVByb3ZpZGVyJywgJ19leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsICdFeGVjdXRlIGNvbXBsZXRpb24gaXRlbSBwcm92aWRlci4nLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5VcmksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb24sXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ3RyaWdnZXJDaGFyYWN0ZXInLCAnVHJpZ2dlciBjb21wbGV0aW9uIHdoZW4gdGhlIHVzZXIgdHlwZXMgdGhlIGNoYXJhY3RlciwgbGlrZSBgLGAgb3IgYChgJykub3B0aW9uYWwoKSxcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5OdW1iZXIud2l0aCgnaXRlbVJlc29sdmVDb3VudCcsICdOdW1iZXIgb2YgY29tcGxldGlvbnMgdG8gcmVzb2x2ZSAodG9vIGxhcmdlIG51bWJlcnMgc2xvdyBkb3duIGNvbXBsZXRpb25zKScpLm9wdGlvbmFsKClcblx0XHRdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Db21wbGV0aW9uTGlzdCwgdnNjb2RlLkNvbXBsZXRpb25MaXN0PignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBDb21wbGV0aW9uTGlzdC1pbnN0YW5jZS4nLCAodmFsdWUsIF9hcmdzLCBjb252ZXJ0ZXIpID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db21wbGV0aW9uTGlzdChbXSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpdGVtcyA9IHZhbHVlLnN1Z2dlc3Rpb25zLm1hcChzdWdnZXN0aW9uID0+IHR5cGVDb252ZXJ0ZXJzLkNvbXBsZXRpb25JdGVtLnRvKHN1Z2dlc3Rpb24sIGNvbnZlcnRlcikpO1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db21wbGV0aW9uTGlzdChpdGVtcywgdmFsdWUuaW5jb21wbGV0ZSk7XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0tIHNpZ25hdHVyZSBoZWxwXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZVNpZ25hdHVyZUhlbHBQcm92aWRlcicsICdfZXhlY3V0ZVNpZ25hdHVyZUhlbHBQcm92aWRlcicsICdFeGVjdXRlIHNpZ25hdHVyZSBoZWxwIHByb3ZpZGVyLicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmksIEFwaUNvbW1hbmRBcmd1bWVudC5Qb3NpdGlvbiwgQXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCd0cmlnZ2VyQ2hhcmFjdGVyJywgJ1RyaWdnZXIgc2lnbmF0dXJlIGhlbHAgd2hlbiB0aGUgdXNlciB0eXBlcyB0aGUgY2hhcmFjdGVyLCBsaWtlIGAsYCBvciBgKGAnKS5vcHRpb25hbCgpXSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscCwgdnNjb2RlLlNpZ25hdHVyZUhlbHAgfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBTaWduYXR1cmVIZWxwLicsIHZhbHVlID0+IHtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnRlcnMuU2lnbmF0dXJlSGVscC50byh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBjb2RlIGxlbnNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlQ29kZUxlbnNQcm92aWRlcicsICdfZXhlY3V0ZUNvZGVMZW5zUHJvdmlkZXInLCAnRXhlY3V0ZSBjb2RlIGxlbnMgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaSwgQXBpQ29tbWFuZEFyZ3VtZW50Lk51bWJlci53aXRoKCdpdGVtUmVzb2x2ZUNvdW50JywgJ051bWJlciBvZiBsZW5zZXMgdGhhdCBzaG91bGQgYmUgcmVzb2x2ZWQgYW5kIHJldHVybmVkLiBXaWxsIG9ubHkgcmV0dXJuIHJlc29sdmVkIGxlbnNlcywgd2lsbCBpbXBhY3QgcGVyZm9ybWFuY2UpJykub3B0aW9uYWwoKV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLkNvZGVMZW5zW10sIHZzY29kZS5Db2RlTGVuc1tdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgQ29kZUxlbnMtaW5zdGFuY2VzLicsICh2YWx1ZSwgX2FyZ3MsIGNvbnZlcnRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHRyeU1hcFdpdGg8bGFuZ3VhZ2VzLkNvZGVMZW5zLCB2c2NvZGUuQ29kZUxlbnM+KGl0ZW0gPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNvZGVMZW5zKHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGl0ZW0ucmFuZ2UpLCBpdGVtLmNvbW1hbmQgJiYgY29udmVydGVyLmZyb21JbnRlcm5hbChpdGVtLmNvbW1hbmQpKTtcblx0XHRcdH0pKHZhbHVlKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gY29kZSBhY3Rpb25zXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhlY3V0ZUNvZGVBY3Rpb25Qcm92aWRlcicsICdfZXhlY3V0ZUNvZGVBY3Rpb25Qcm92aWRlcicsICdFeGVjdXRlIGNvZGUgYWN0aW9uIHByb3ZpZGVyLicsXG5cdFx0W1xuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlVyaSxcblx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3JhbmdlT3JTZWxlY3Rpb24nLCAnUmFuZ2UgaW4gYSB0ZXh0IGRvY3VtZW50LiBTb21lIHJlZmFjdG9yaW5nIHByb3ZpZGVyIHJlcXVpcmVzIFNlbGVjdGlvbiBvYmplY3QuJywgdiA9PiB0eXBlcy5SYW5nZS5pc1JhbmdlKHYpLCB2ID0+IHR5cGVzLlNlbGVjdGlvbi5pc1NlbGVjdGlvbih2KSA/IHR5cGVDb252ZXJ0ZXJzLlNlbGVjdGlvbi5mcm9tKHYpIDogdHlwZUNvbnZlcnRlcnMuUmFuZ2UuZnJvbSh2KSksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ2tpbmQnLCAnQ29kZSBhY3Rpb24ga2luZCB0byByZXR1cm4gY29kZSBhY3Rpb25zIGZvcicpLm9wdGlvbmFsKCksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuTnVtYmVyLndpdGgoJ2l0ZW1SZXNvbHZlQ291bnQnLCAnTnVtYmVyIG9mIGNvZGUgYWN0aW9ucyB0byByZXNvbHZlICh0b28gbGFyZ2UgbnVtYmVycyBzbG93IGRvd24gY29kZSBhY3Rpb25zKScpLm9wdGlvbmFsKClcblx0XHRdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PEN1c3RvbUNvZGVBY3Rpb25bXSwgKHZzY29kZS5Db2RlQWN0aW9uIHwgdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQpW10gfCB1bmRlZmluZWQ+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBDb21tYW5kLWluc3RhbmNlcy4nLCAodmFsdWUsIF9hcmdzLCBjb252ZXJ0ZXIpID0+IHtcblx0XHRcdHJldHVybiB0cnlNYXBXaXRoPEN1c3RvbUNvZGVBY3Rpb24sIHZzY29kZS5Db2RlQWN0aW9uIHwgdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQ+KChjb2RlQWN0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChjb2RlQWN0aW9uLl9pc1N5bnRoZXRpYykge1xuXHRcdFx0XHRcdGlmICghY29kZUFjdGlvbi5jb21tYW5kKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1N5bnRoZXRpYyBjb2RlIGFjdGlvbnMgbXVzdCBoYXZlIGEgY29tbWFuZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gY29udmVydGVyLmZyb21JbnRlcm5hbChjb2RlQWN0aW9uLmNvbW1hbmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJldCA9IG5ldyB0eXBlcy5Db2RlQWN0aW9uKFxuXHRcdFx0XHRcdFx0Y29kZUFjdGlvbi50aXRsZSxcblx0XHRcdFx0XHRcdGNvZGVBY3Rpb24ua2luZCA/IG5ldyB0eXBlcy5Db2RlQWN0aW9uS2luZChjb2RlQWN0aW9uLmtpbmQpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAoY29kZUFjdGlvbi5lZGl0KSB7XG5cdFx0XHRcdFx0XHRyZXQuZWRpdCA9IHR5cGVDb252ZXJ0ZXJzLldvcmtzcGFjZUVkaXQudG8oY29kZUFjdGlvbi5lZGl0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNvZGVBY3Rpb24uY29tbWFuZCkge1xuXHRcdFx0XHRcdFx0cmV0LmNvbW1hbmQgPSBjb252ZXJ0ZXIuZnJvbUludGVybmFsKGNvZGVBY3Rpb24uY29tbWFuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldC5pc1ByZWZlcnJlZCA9IGNvZGVBY3Rpb24uaXNQcmVmZXJyZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdFx0fVxuXHRcdFx0fSkodmFsdWUpO1xuXHRcdH0pXG5cdCksXG5cdC8vIC0tLSBjb2xvcnNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlRG9jdW1lbnRDb2xvclByb3ZpZGVyJywgJ19leGVjdXRlRG9jdW1lbnRDb2xvclByb3ZpZGVyJywgJ0V4ZWN1dGUgZG9jdW1lbnQgY29sb3IgcHJvdmlkZXIuJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaV0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SVJhd0NvbG9ySW5mb1tdLCB2c2NvZGUuQ29sb3JJbmZvcm1hdGlvbltdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgQ29sb3JJbmZvcm1hdGlvbiBvYmplY3RzLicsIHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQubWFwKGNpID0+IG5ldyB0eXBlcy5Db2xvckluZm9ybWF0aW9uKHR5cGVDb252ZXJ0ZXJzLlJhbmdlLnRvKGNpLnJhbmdlKSwgdHlwZUNvbnZlcnRlcnMuQ29sb3IudG8oY2kuY29sb3IpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSlcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlQ29sb3JQcmVzZW50YXRpb25Qcm92aWRlcicsICdfZXhlY3V0ZUNvbG9yUHJlc2VudGF0aW9uUHJvdmlkZXInLCAnRXhlY3V0ZSBjb2xvciBwcmVzZW50YXRpb24gcHJvdmlkZXIuJyxcblx0XHRbXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHR5cGVzLkNvbG9yLCBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXT4oJ2NvbG9yJywgJ1RoZSBjb2xvciB0byBzaG93IGFuZCBpbnNlcnQnLCB2ID0+IHYgaW5zdGFuY2VvZiB0eXBlcy5Db2xvciwgdHlwZUNvbnZlcnRlcnMuQ29sb3IuZnJvbSksXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHsgdXJpOiBVUkk7IHJhbmdlOiB0eXBlcy5SYW5nZSB9LCB7IHVyaTogVVJJOyByYW5nZTogSVJhbmdlIH0+KCdjb250ZXh0JywgJ0NvbnRleHQgb2JqZWN0IHdpdGggdXJpIGFuZCByYW5nZScsIF92ID0+IHRydWUsIHYgPT4gKHsgdXJpOiB2LnVyaSwgcmFuZ2U6IHR5cGVDb252ZXJ0ZXJzLlJhbmdlLmZyb20odi5yYW5nZSkgfSkpLFxuXHRcdF0sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8bGFuZ3VhZ2VzLklDb2xvclByZXNlbnRhdGlvbltdLCB0eXBlcy5Db2xvclByZXNlbnRhdGlvbltdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgQ29sb3JQcmVzZW50YXRpb24gb2JqZWN0cy4nLCByZXN1bHQgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcCh0eXBlQ29udmVydGVycy5Db2xvclByZXNlbnRhdGlvbi50byk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSlcblx0KSxcblx0Ly8gLS0tIGlubGluZSBoaW50c1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsICdfZXhlY3V0ZUlubGF5SGludFByb3ZpZGVyJywgJ0V4ZWN1dGUgaW5sYXkgaGludHMgcHJvdmlkZXInLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUmFuZ2VdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5JbmxheUhpbnRbXSwgdnNjb2RlLklubGF5SGludFtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgSW5sYXkgb2JqZWN0cycsIChyZXN1bHQsIGFyZ3MsIGNvbnZlcnRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5tYXAodHlwZUNvbnZlcnRlcnMuSW5sYXlIaW50LnRvLmJpbmQodW5kZWZpbmVkLCBjb252ZXJ0ZXIpKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gZm9sZGluZ1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLmV4ZWN1dGVGb2xkaW5nUmFuZ2VQcm92aWRlcicsICdfZXhlY3V0ZUZvbGRpbmdSYW5nZVByb3ZpZGVyJywgJ0V4ZWN1dGUgZm9sZGluZyByYW5nZSBwcm92aWRlcicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmldLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VbXSB8IHVuZGVmaW5lZCwgdnNjb2RlLkZvbGRpbmdSYW5nZVtdIHwgdW5kZWZpbmVkPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgRm9sZGluZ1JhbmdlIG9iamVjdHMnLCAocmVzdWx0LCBhcmdzKSA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQubWFwKHR5cGVDb252ZXJ0ZXJzLkZvbGRpbmdSYW5nZS50byk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pXG5cdCksXG5cblx0Ly8gLS0tIG5vdGVib29rc1xuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLnJlc29sdmVOb3RlYm9va0NvbnRlbnRQcm92aWRlcnMnLCAnX3Jlc29sdmVOb3RlYm9va0NvbnRlbnRQcm92aWRlcicsICdSZXNvbHZlIE5vdGVib29rIENvbnRlbnQgUHJvdmlkZXJzJyxcblx0XHRbXG5cdFx0XHQvLyBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHN0cmluZywgc3RyaW5nPigndmlld1R5cGUnLCAnJywgdiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycsIHYgPT4gdiksXG5cdFx0XHQvLyBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHN0cmluZywgc3RyaW5nPignZGlzcGxheU5hbWUnLCAnJywgdiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycsIHYgPT4gdiksXG5cdFx0XHQvLyBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PG9iamVjdCwgb2JqZWN0Pignb3B0aW9ucycsICcnLCB2ID0+IHR5cGVvZiB2ID09PSAnb2JqZWN0JywgdiA9PiB2KSxcblx0XHRdLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PHtcblx0XHRcdHZpZXdUeXBlOiBzdHJpbmc7XG5cdFx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdFx0b3B0aW9uczogeyB0cmFuc2llbnRPdXRwdXRzOiBib29sZWFuOyB0cmFuc2llbnRDZWxsTWV0YWRhdGE6IFRyYW5zaWVudENlbGxNZXRhZGF0YTsgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YTogVHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSB9O1xuXHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiAodnNjb2RlLkdsb2JQYXR0ZXJuIHwgeyBpbmNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm47IGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB9KVtdO1xuXHRcdH1bXSwge1xuXHRcdFx0dmlld1R5cGU6IHN0cmluZztcblx0XHRcdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0XHRmaWxlbmFtZVBhdHRlcm46ICh2c2NvZGUuR2xvYlBhdHRlcm4gfCB7IGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybjsgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIH0pW107XG5cdFx0XHRvcHRpb25zOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRPcHRpb25zO1xuXHRcdH1bXSB8IHVuZGVmaW5lZD4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIE5vdGVib29rQ29udGVudFByb3ZpZGVyIHN0YXRpYyBpbmZvIG9iamVjdHMuJywgdHJ5TWFwV2l0aChpdGVtID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZpZXdUeXBlOiBpdGVtLnZpZXdUeXBlLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogaXRlbS5kaXNwbGF5TmFtZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHRyYW5zaWVudE91dHB1dHM6IGl0ZW0ub3B0aW9ucy50cmFuc2llbnRPdXRwdXRzLFxuXHRcdFx0XHRcdHRyYW5zaWVudENlbGxNZXRhZGF0YTogaXRlbS5vcHRpb25zLnRyYW5zaWVudENlbGxNZXRhZGF0YSxcblx0XHRcdFx0XHR0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiBpdGVtLm9wdGlvbnMudHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaWxlbmFtZVBhdHRlcm46IGl0ZW0uZmlsZW5hbWVQYXR0ZXJuLm1hcChwYXR0ZXJuID0+IHR5cGVDb252ZXJ0ZXJzLk5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRQYXR0ZXJuLnRvKHBhdHRlcm4pKVxuXHRcdFx0fTtcblx0XHR9KSlcblx0KSxcblx0Ly8gLS0tIGRlYnVnIHN1cHBvcnRcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5leGVjdXRlSW5saW5lVmFsdWVQcm92aWRlcicsICdfZXhlY3V0ZUlubGluZVZhbHVlUHJvdmlkZXInLCAnRXhlY3V0ZSBpbmxpbmUgdmFsdWUgcHJvdmlkZXInLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5VcmksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuUmFuZ2UsXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHR5cGVzLklubGluZVZhbHVlQ29udGV4dCwgSUlubGluZVZhbHVlQ29udGV4dER0bz4oJ2NvbnRleHQnLCAnQW4gSW5saW5lVmFsdWVDb250ZXh0JywgdiA9PiB2ICYmIHR5cGVvZiB2LmZyYW1lSWQgPT09ICdudW1iZXInICYmIHYuc3RvcHBlZExvY2F0aW9uIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UsIHYgPT4gdHlwZUNvbnZlcnRlcnMuSW5saW5lVmFsdWVDb250ZXh0LmZyb20odikpXG5cdFx0XSxcblx0XHRuZXcgQXBpQ29tbWFuZFJlc3VsdDxsYW5ndWFnZXMuSW5saW5lVmFsdWVbXSwgdnNjb2RlLklubGluZVZhbHVlW10+KCdBIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byBhbiBhcnJheSBvZiBJbmxpbmVWYWx1ZSBvYmplY3RzJywgcmVzdWx0ID0+IHtcblx0XHRcdHJldHVybiByZXN1bHQubWFwKHR5cGVDb252ZXJ0ZXJzLklubGluZVZhbHVlLnRvKTtcblx0XHR9KVxuXHQpLFxuXHQvLyAtLS0gb3Blbidpc2ggY29tbWFuZHNcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5vcGVuJywgJ193b3JrYmVuY2gub3BlbicsICdPcGVucyB0aGUgcHJvdmlkZWQgcmVzb3VyY2UgaW4gdGhlIGVkaXRvci4gQ2FuIGJlIGEgdGV4dCBvciBiaW5hcnkgZmlsZSwgb3IgYW4gaHR0cChzKSBVUkwuIElmIHlvdSBuZWVkIG1vcmUgY29udHJvbCBvdmVyIHRoZSBvcHRpb25zIGZvciBvcGVuaW5nIGEgdGV4dCBmaWxlLCB1c2UgdnNjb2RlLndpbmRvdy5zaG93VGV4dERvY3VtZW50IGluc3RlYWQuJyxcblx0XHRbXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PFVSSSB8IHN0cmluZz4oJ3VyaU9yU3RyaW5nJywgJ1VyaS1pbnN0YW5jZSBvciBzdHJpbmcgKG9ubHkgaHR0cC9odHRwcyknLCB2ID0+IFVSSS5pc1VyaSh2KSB8fCAodHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIG1hdGNoZXNTb21lU2NoZW1lKHYsIFNjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwcykpLCB2ID0+IHYpLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudDx2c2NvZGUuVmlld0NvbHVtbiB8IHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZCwgW3ZzY29kZS5WaWV3Q29sdW1uPywgSVRleHRFZGl0b3JPcHRpb25zP10gfCB1bmRlZmluZWQ+KCdjb2x1bW5Pck9wdGlvbnMnLCAnRWl0aGVyIHRoZSBjb2x1bW4gaW4gd2hpY2ggdG8gb3BlbiBvciBlZGl0b3Igb3B0aW9ucywgc2VlIHZzY29kZS5UZXh0RG9jdW1lbnRTaG93T3B0aW9ucycsXG5cdFx0XHRcdHYgPT4gdiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2ID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgdiA9PT0gJ29iamVjdCcsXG5cdFx0XHRcdHYgPT4gIXYgPyB2IDogdHlwZW9mIHYgPT09ICdudW1iZXInID8gW3R5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4uZnJvbSh2KSwgdW5kZWZpbmVkXSA6IFt0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLmZyb20odi52aWV3Q29sdW1uKSwgdHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvck9wZW5PcHRpb25zLmZyb20odildXG5cdFx0XHQpLm9wdGlvbmFsKCksXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuU3RyaW5nLndpdGgoJ2xhYmVsJywgJycpLm9wdGlvbmFsKClcblx0XHRdLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHRuZXcgQXBpQ29tbWFuZChcblx0XHQndnNjb2RlLm9wZW5XaXRoJywgJ193b3JrYmVuY2gub3BlbldpdGgnLCAnT3BlbnMgdGhlIHByb3ZpZGVkIHJlc291cmNlIHdpdGggYSBzcGVjaWZpYyBlZGl0b3IuJyxcblx0XHRbXG5cdFx0XHRBcGlDb21tYW5kQXJndW1lbnQuVXJpLndpdGgoJ3Jlc291cmNlJywgJ1Jlc291cmNlIHRvIG9wZW4nKSxcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgndmlld0lkJywgJ0N1c3RvbSBlZGl0b3IgdmlldyBpZC4gVGhpcyBzaG91bGQgYmUgdGhlIHZpZXdUeXBlIHN0cmluZyBmb3IgY3VzdG9tIGVkaXRvcnMgb3IgdGhlIG5vdGVib29rVHlwZSBzdHJpbmcgZm9yIG5vdGVib29rcy4gVXNlIFxcJ2RlZmF1bHRcXCcgdG8gdXNlIFZTIENvZGVcXCdzIGRlZmF1bHQgdGV4dCBlZGl0b3InKSxcblx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8dnNjb2RlLlZpZXdDb2x1bW4gfCB0eXBlQ29udmVydGVycy5UZXh0RWRpdG9yT3Blbk9wdGlvbnMgfCB1bmRlZmluZWQsIFt2c2NvZGUuVmlld0NvbHVtbj8sIElUZXh0RWRpdG9yT3B0aW9ucz9dIHwgdW5kZWZpbmVkPignY29sdW1uT3JPcHRpb25zJywgJ0VpdGhlciB0aGUgY29sdW1uIGluIHdoaWNoIHRvIG9wZW4gb3IgZWRpdG9yIG9wdGlvbnMsIHNlZSB2c2NvZGUuVGV4dERvY3VtZW50U2hvd09wdGlvbnMnLFxuXHRcdFx0XHR2ID0+IHYgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdiA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHYgPT09ICdvYmplY3QnLFxuXHRcdFx0XHR2ID0+ICF2ID8gdiA6IHR5cGVvZiB2ID09PSAnbnVtYmVyJyA/IFt0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLmZyb20odiksIHVuZGVmaW5lZF0gOiBbdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi5mcm9tKHYudmlld0NvbHVtbiksIHR5cGVDb252ZXJ0ZXJzLlRleHRFZGl0b3JPcGVuT3B0aW9ucy5mcm9tKHYpXSxcblx0XHRcdCkub3B0aW9uYWwoKVxuXHRcdF0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZGlmZicsICdfd29ya2JlbmNoLmRpZmYnLCAnT3BlbnMgdGhlIHByb3ZpZGVkIHJlc291cmNlcyBpbiB0aGUgZGlmZiBlZGl0b3IgdG8gY29tcGFyZSB0aGVpciBjb250ZW50cy4nLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5Vcmkud2l0aCgnbGVmdCcsICdMZWZ0LWhhbmQgc2lkZSByZXNvdXJjZSBvZiB0aGUgZGlmZiBlZGl0b3InKSxcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5Vcmkud2l0aCgncmlnaHQnLCAnUmlnaHQtaGFuZCBzaWRlIHJlc291cmNlIG9mIHRoZSBkaWZmIGVkaXRvcicpLFxuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCd0aXRsZScsICdIdW1hbiByZWFkYWJsZSB0aXRsZSBmb3IgdGhlIGRpZmYgZWRpdG9yJykub3B0aW9uYWwoKSxcblx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8dHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvck9wZW5PcHRpb25zIHwgdW5kZWZpbmVkLCBbbnVtYmVyPywgSVRleHRFZGl0b3JPcHRpb25zP10gfCB1bmRlZmluZWQ+KCdjb2x1bW5Pck9wdGlvbnMnLCAnRWl0aGVyIHRoZSBjb2x1bW4gaW4gd2hpY2ggdG8gb3BlbiBvciBlZGl0b3Igb3B0aW9ucywgc2VlIHZzY29kZS5UZXh0RG9jdW1lbnRTaG93T3B0aW9ucycsXG5cdFx0XHRcdHYgPT4gdiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2ID09PSAnb2JqZWN0Jyxcblx0XHRcdFx0diA9PiB2ICYmIFt0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLmZyb20odi52aWV3Q29sdW1uKSwgdHlwZUNvbnZlcnRlcnMuVGV4dEVkaXRvck9wZW5PcHRpb25zLmZyb20odildXG5cdFx0XHQpLm9wdGlvbmFsKCksXG5cdFx0XSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5jaGFuZ2VzJywgJ193b3JrYmVuY2guY2hhbmdlcycsICdPcGVucyBhIGxpc3Qgb2YgcmVzb3VyY2VzIGluIHRoZSBjaGFuZ2VzIGVkaXRvciB0byBjb21wYXJlIHRoZWlyIGNvbnRlbnRzLicsXG5cdFx0W1xuXHRcdFx0QXBpQ29tbWFuZEFyZ3VtZW50LlN0cmluZy53aXRoKCd0aXRsZScsICdIdW1hbiByZWFkYWJsZSB0aXRsZSBmb3IgdGhlIGNoYW5nZXMgZWRpdG9yJyksXG5cdFx0XHRuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PFtVUkksIFVSST8sIFVSST9dW10+KCdyZXNvdXJjZUxpc3QnLCAnTGlzdCBvZiByZXNvdXJjZXMgdG8gY29tcGFyZScsXG5cdFx0XHRcdHJlc291cmNlcyA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0XHRcdGlmIChyZXNvdXJjZS5sZW5ndGggIT09IDMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBbbGFiZWwsIGxlZnQsIHJpZ2h0XSA9IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0aWYgKCFVUkkuaXNVcmkobGFiZWwpIHx8XG5cdFx0XHRcdFx0XHRcdCghVVJJLmlzVXJpKGxlZnQpICYmIGxlZnQgIT09IHVuZGVmaW5lZCAmJiBsZWZ0ICE9PSBudWxsKSB8fFxuXHRcdFx0XHRcdFx0XHQoIVVSSS5pc1VyaShyaWdodCkgJiYgcmlnaHQgIT09IHVuZGVmaW5lZCAmJiByaWdodCAhPT0gbnVsbCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR2ID0+IHYpXG5cdFx0XSxcblx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0KSxcblx0Ly8gLS0tIHR5cGUgaGllcmFyY2h5XG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJlcGFyZVR5cGVIaWVyYXJjaHknLCAnX2V4ZWN1dGVQcmVwYXJlVHlwZUhpZXJhcmNoeScsICdQcmVwYXJlIHR5cGUgaGllcmFyY2h5IGF0IGEgcG9zaXRpb24gaW5zaWRlIGEgZG9jdW1lbnQnLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVXJpLCBBcGlDb21tYW5kQXJndW1lbnQuUG9zaXRpb25dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElUeXBlSGllcmFyY2h5SXRlbUR0b1tdLCB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbVtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgVHlwZUhpZXJhcmNoeUl0ZW0taW5zdGFuY2VzJywgdiA9PiB2Lm1hcCh0eXBlQ29udmVydGVycy5UeXBlSGllcmFyY2h5SXRlbS50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZVN1cGVydHlwZXMnLCAnX2V4ZWN1dGVQcm92aWRlU3VwZXJ0eXBlcycsICdDb21wdXRlIHN1cGVydHlwZXMgZm9yIGFuIGl0ZW0nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVHlwZUhpZXJhcmNoeUl0ZW1dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElUeXBlSGllcmFyY2h5SXRlbUR0b1tdLCB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbVtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgVHlwZUhpZXJhcmNoeUl0ZW0taW5zdGFuY2VzJywgdiA9PiB2Lm1hcCh0eXBlQ29udmVydGVycy5UeXBlSGllcmFyY2h5SXRlbS50bykpXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucHJvdmlkZVN1YnR5cGVzJywgJ19leGVjdXRlUHJvdmlkZVN1YnR5cGVzJywgJ0NvbXB1dGUgc3VidHlwZXMgZm9yIGFuIGl0ZW0nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVHlwZUhpZXJhcmNoeUl0ZW1dLFxuXHRcdG5ldyBBcGlDb21tYW5kUmVzdWx0PElUeXBlSGllcmFyY2h5SXRlbUR0b1tdLCB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbVtdPignQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2YgVHlwZUhpZXJhcmNoeUl0ZW0taW5zdGFuY2VzJywgdiA9PiB2Lm1hcCh0eXBlQ29udmVydGVycy5UeXBlSGllcmFyY2h5SXRlbS50bykpXG5cdCksXG5cdC8vIC0tLSB0ZXN0aW5nXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUucmV2ZWFsVGVzdEluRXhwbG9yZXInLCAnX3JldmVhbFRlc3RJbkV4cGxvcmVyJywgJ1JldmVhbHMgYSB0ZXN0IGluc3RhbmNlIGluIHRoZSBleHBsb3JlcicsXG5cdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5UZXN0SXRlbV0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuc3RhcnRDb250aW51b3VzVGVzdFJ1bicsICd0ZXN0aW5nLnN0YXJ0Q29udGludW91c1J1bkZyb21FeHRlbnNpb24nLCAnU3RhcnRzIHJ1bm5pbmcgdGhlIGdpdmVuIHRlc3RzIHdpdGggY29udGludW91cyBydW4gbW9kZS4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuVGVzdFByb2ZpbGUsIEFwaUNvbW1hbmRBcmd1bWVudC5BcnIoQXBpQ29tbWFuZEFyZ3VtZW50LlRlc3RJdGVtKV0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuc3RvcENvbnRpbnVvdXNUZXN0UnVuJywgJ3Rlc3Rpbmcuc3RvcENvbnRpbnVvdXNSdW5Gcm9tRXh0ZW5zaW9uJywgJ1N0b3BzIHJ1bm5pbmcgdGhlIGdpdmVuIHRlc3RzIHdpdGggY29udGludW91cyBydW4gbW9kZS4nLFxuXHRcdFtBcGlDb21tYW5kQXJndW1lbnQuQXJyKEFwaUNvbW1hbmRBcmd1bWVudC5UZXN0SXRlbSldLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHQvLyAtLS0gY29udGludWUgZWRpdCBzZXNzaW9uXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXhwZXJpbWVudGFsLmVkaXRTZXNzaW9uLmNvbnRpbnVlJywgJ193b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuY29udGludWVFZGl0U2Vzc2lvbicsICdDb250aW51ZSB0aGUgY3VycmVudCBlZGl0IHNlc3Npb24gaW4gYSBkaWZmZXJlbnQgd29ya3NwYWNlJyxcblx0XHRbQXBpQ29tbWFuZEFyZ3VtZW50LlVyaS53aXRoKCd3b3Jrc3BhY2VVcmknLCAnVGhlIHRhcmdldCB3b3Jrc3BhY2UgdG8gY29udGludWUgdGhlIGN1cnJlbnQgZWRpdCBzZXNzaW9uIGluJyldLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHQvLyAtLS0gY29udGV4dCBrZXlzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCdzZXRDb250ZXh0JywgJ19zZXRDb250ZXh0JywgJ1NldCBhIGN1c3RvbSBjb250ZXh0IGtleSB2YWx1ZSB0aGF0IGNhbiBiZSB1c2VkIGluIHdoZW4gY2xhdXNlcy4nLFxuXHRcdFtcblx0XHRcdEFwaUNvbW1hbmRBcmd1bWVudC5TdHJpbmcud2l0aCgnbmFtZScsICdUaGUgY29udGV4dCBrZXkgbmFtZScpLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRBcmd1bWVudCgndmFsdWUnLCAnVGhlIGNvbnRleHQga2V5IHZhbHVlJywgKCkgPT4gdHJ1ZSwgdiA9PiB2KSxcblx0XHRdLFxuXHRcdEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHQpLFxuXHQvLyAtLS0gaW5saW5lIGNoYXRcblx0bmV3IEFwaUNvbW1hbmQoXG5cdFx0J3ZzY29kZS5lZGl0b3JDaGF0LnN0YXJ0JywgJ2lubGluZUNoYXQuc3RhcnQnLCAnSW52b2tlIGEgbmV3IGVkaXRvciBjaGF0IHNlc3Npb24nLFxuXHRcdFtuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PElubGluZUNoYXRFZGl0b3JBcGlBcmcgfCB1bmRlZmluZWQsIElubGluZUNoYXRSdW5PcHRpb25zIHwgdW5kZWZpbmVkPignUnVuIGFyZ3VtZW50cycsICcnLCBfdiA9PiB0cnVlLCB2ID0+IHtcblxuXHRcdFx0aWYgKCF2KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluaXRpYWxSYW5nZTogdi5pbml0aWFsUmFuZ2UgPyB0eXBlQ29udmVydGVycy5SYW5nZS5mcm9tKHYuaW5pdGlhbFJhbmdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5pdGlhbFNlbGVjdGlvbjogdHlwZXMuU2VsZWN0aW9uLmlzU2VsZWN0aW9uKHYuaW5pdGlhbFNlbGVjdGlvbikgPyB0eXBlQ29udmVydGVycy5TZWxlY3Rpb24uZnJvbSh2LmluaXRpYWxTZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXNzYWdlOiB2Lm1lc3NhZ2UsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiB2LmF0dGFjaG1lbnRzLFxuXHRcdFx0XHRhdXRvU2VuZDogdi5hdXRvU2VuZCxcblx0XHRcdFx0cG9zaXRpb246IHYucG9zaXRpb24gPyB0eXBlQ29udmVydGVycy5Qb3NpdGlvbi5mcm9tKHYucG9zaXRpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlT25SZXNwb25zZTogdi5yZXNvbHZlT25SZXNwb25zZVxuXHRcdFx0fTtcblx0XHR9KV0sXG5cdFx0QXBpQ29tbWFuZFJlc3VsdC5Wb2lkXG5cdCksXG5cdC8vIC0tLSBleHRlbnNpb24gcHJvbXB0IGZpbGVzXG5cdG5ldyBBcGlDb21tYW5kKFxuXHRcdCd2c2NvZGUuZXh0ZW5zaW9uUHJvbXB0RmlsZVByb3ZpZGVyJywgJ19saXN0RXh0ZW5zaW9uUHJvbXB0RmlsZXMnLCAnR2V0IGFsbCBleHRlbnNpb24tY29udHJpYnV0ZWQgcHJvbXB0IGZpbGVzIChjdXN0b20gYWdlbnRzLCBpbnN0cnVjdGlvbnMsIGFuZCBwcm9tcHQgZmlsZXMpLicsXG5cdFx0W10sXG5cdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8SUV4dGVuc2lvblByb21wdEZpbGVSZXN1bHRbXSwgeyB1cmk6IHZzY29kZS5Vcmk7IHR5cGU6IFByb21wdHNUeXBlOyBleHRlbnNpb25JZDogc3RyaW5nIH1bXT4oXG5cdFx0XHQnQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygb2JqZWN0cyBjb250YWluaW5nIHVyaSwgdHlwZSwgYW5kIGV4dGVuc2lvbklkLicsXG5cdFx0XHQodmFsdWUpID0+IHtcblx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsdWUubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUoaXRlbS51cmkpLFxuXHRcdFx0XHRcdHR5cGU6IGl0ZW0udHlwZSxcblx0XHRcdFx0XHRleHRlbnNpb25JZDogaXRlbS5leHRlbnNpb25JZFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0KVxuXHQpXG5dO1xuXG50eXBlIElubGluZUNoYXRFZGl0b3JBcGlBcmcgPSB7XG5cdGluaXRpYWxSYW5nZT86IHZzY29kZS5SYW5nZTtcblx0aW5pdGlhbFNlbGVjdGlvbj86IHZzY29kZS5TZWxlY3Rpb247XG5cdG1lc3NhZ2U/OiBzdHJpbmc7XG5cdGF0dGFjaG1lbnRzPzogdnNjb2RlLlVyaVtdO1xuXHRhdXRvU2VuZD86IGJvb2xlYW47XG5cdHBvc2l0aW9uPzogdnNjb2RlLlBvc2l0aW9uO1xuXHRyZXNvbHZlT25SZXNwb25zZT86IGJvb2xlYW47XG59O1xuXG50eXBlIElubGluZUNoYXRSdW5PcHRpb25zID0ge1xuXHRpbml0aWFsUmFuZ2U/OiBJUmFuZ2U7XG5cdGluaXRpYWxTZWxlY3Rpb24/OiBJU2VsZWN0aW9uO1xuXHRtZXNzYWdlPzogc3RyaW5nO1xuXHRhdHRhY2htZW50cz86IFVSSVtdO1xuXHRhdXRvU2VuZD86IGJvb2xlYW47XG5cdHBvc2l0aW9uPzogSVBvc2l0aW9uO1xuXHRyZXNvbHZlT25SZXNwb25zZT86IGJvb2xlYW47XG59O1xuXG4vLyNlbmRyZWdpb25cblxuXG4vLyNyZWdpb24gT0xEIHdvcmxkXG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0QXBpQ29tbWFuZHMge1xuXG5cdHN0YXRpYyByZWdpc3Rlcihjb21tYW5kczogRXh0SG9zdENvbW1hbmRzKSB7XG5cblx0XHRuZXdDb21tYW5kcy5mb3JFYWNoKGNvbW1hbmRzLnJlZ2lzdGVyQXBpQ29tbWFuZCwgY29tbWFuZHMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJWYWxpZGF0ZVdoZW5DbGF1c2VzQ29tbWFuZChjb21tYW5kcyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVnaXN0ZXJWYWxpZGF0ZVdoZW5DbGF1c2VzQ29tbWFuZChjb21tYW5kczogRXh0SG9zdENvbW1hbmRzKSB7XG5cdFx0Y29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKGZhbHNlLCAnX3ZhbGlkYXRlV2hlbkNsYXVzZXMnLCB2YWxpZGF0ZVdoZW5DbGF1c2VzKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0cnlNYXBXaXRoPFQsIFI+KGY6ICh4OiBUKSA9PiBSKSB7XG5cdHJldHVybiAodmFsdWU6IFRbXSkgPT4ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcChmKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFwTG9jYXRpb25PckxvY2F0aW9uTGluayh2YWx1ZXM6IChsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rKVtdKTogKHR5cGVzLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZXMpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXN1bHQ6ICh0eXBlcy5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10gPSBbXTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIHZhbHVlcykge1xuXHRcdGlmIChsYW5ndWFnZXMuaXNMb2NhdGlvbkxpbmsoaXRlbSkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHR5cGVDb252ZXJ0ZXJzLkRlZmluaXRpb25MaW5rLnRvKGl0ZW0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2godHlwZUNvbnZlcnRlcnMubG9jYXRpb24udG8oaXRlbSkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuIl0s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
