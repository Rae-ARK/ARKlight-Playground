import { asArray, coalesce, isFalsyOrEmpty, isNonEmptyArray } from "../../../base/common/arrays.js";
import { raceCancellationError } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { NotImplementedError, isCancellationError } from "../../../base/common/errors.js";
import { IdGenerator } from "../../../base/common/idGenerator.js";
import { DisposableStore, Disposable as CoreDisposable } from "../../../base/common/lifecycle.js";
import { equals, mixin } from "../../../base/common/objects.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { assertType, isObject } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Range as EditorRange } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import * as languages from "../../../editor/common/languages.js";
import { encodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Cache } from "./cache.js";
import * as extHostProtocol from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { CodeAction, CodeActionKind, CompletionList, DataTransfer, Disposable, DocumentDropOrPasteEditKind, DocumentSymbol, InlineCompletionsDisposeReasonKind, InlineCompletionTriggerKind, InternalDataTransferItem, Location, NewSymbolNameTriggerKind, Range, SemanticTokens, SemanticTokensEdit, SemanticTokensEdits, SnippetString, SyntaxTokenType } from "./extHostTypes.js";
import { Emitter } from "../../../base/common/event.js";
class DocumentSymbolAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentSymbols(resource, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentSymbols(doc, token);
    if (isFalsyOrEmpty(value)) {
      return void 0;
    } else if (value[0] instanceof DocumentSymbol) {
      return value.map(typeConvert.DocumentSymbol.from);
    } else {
      return DocumentSymbolAdapter._asDocumentSymbolTree(value);
    }
  }
  static _asDocumentSymbolTree(infos) {
    infos = infos.slice(0).sort((a, b) => {
      let res2 = a.location.range.start.compareTo(b.location.range.start);
      if (res2 === 0) {
        res2 = b.location.range.end.compareTo(a.location.range.end);
      }
      return res2;
    });
    const res = [];
    const parentStack = [];
    for (const info of infos) {
      const element = {
        name: info.name || "!!MISSING: name!!",
        kind: typeConvert.SymbolKind.from(info.kind),
        tags: info.tags?.map(typeConvert.SymbolTag.from) || [],
        detail: "",
        containerName: info.containerName,
        range: typeConvert.Range.from(info.location.range),
        selectionRange: typeConvert.Range.from(info.location.range),
        children: []
      };
      while (true) {
        if (parentStack.length === 0) {
          parentStack.push(element);
          res.push(element);
          break;
        }
        const parent = parentStack[parentStack.length - 1];
        if (EditorRange.containsRange(parent.range, element.range) && !EditorRange.equalsRange(parent.range, element.range)) {
          parent.children?.push(element);
          parentStack.push(element);
          break;
        }
        parentStack.pop();
      }
    }
    return res;
  }
}
class CodeLensAdapter {
  constructor(_documents, _commands, _provider, _extension, _extTelemetry, _logService) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._extension = _extension;
    this._extTelemetry = _extTelemetry;
    this._logService = _logService;
    this._cache = new Cache("CodeLens");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideCodeLenses(resource, token) {
    const doc = this._documents.getDocument(resource);
    const lenses = await this._provider.provideCodeLenses(doc, token);
    if (!lenses || token.isCancellationRequested) {
      return void 0;
    }
    const cacheId = this._cache.add(lenses);
    const disposables = new DisposableStore();
    this._disposables.set(cacheId, disposables);
    const result = {
      cacheId,
      lenses: []
    };
    for (let i = 0; i < lenses.length; i++) {
      if (!Range.isRange(lenses[i].range)) {
        console.warn("INVALID code lens, range is not defined", this._extension.identifier.value);
        continue;
      }
      result.lenses.push({
        cacheId: [cacheId, i],
        range: typeConvert.Range.from(lenses[i].range),
        command: this._commands.toInternal(lenses[i].command, disposables)
      });
    }
    return result;
  }
  async resolveCodeLens(symbol, token) {
    const lens = symbol.cacheId && this._cache.get(...symbol.cacheId);
    if (!lens) {
      return void 0;
    }
    let resolvedLens;
    if (typeof this._provider.resolveCodeLens !== "function" || lens.isResolved) {
      resolvedLens = lens;
    } else {
      resolvedLens = await this._provider.resolveCodeLens(lens, token);
    }
    if (!resolvedLens) {
      resolvedLens = lens;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const disposables = symbol.cacheId && this._disposables.get(symbol.cacheId[0]);
    if (!disposables) {
      return void 0;
    }
    if (!resolvedLens.command) {
      const error = new Error("INVALID code lens resolved, lacks command: " + this._extension.identifier.value);
      this._extTelemetry.onExtensionError(this._extension.identifier, error);
      this._logService.error(error);
      return void 0;
    }
    symbol.command = this._commands.toInternal(resolvedLens.command, disposables);
    return symbol;
  }
  releaseCodeLenses(cachedId) {
    this._disposables.get(cachedId)?.dispose();
    this._disposables.delete(cachedId);
    this._cache.delete(cachedId);
  }
}
function convertToLocationLinks(value) {
  if (Array.isArray(value)) {
    return value.map(typeConvert.DefinitionLink.from);
  } else if (value) {
    return [typeConvert.DefinitionLink.from(value)];
  }
  return [];
}
class DefinitionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDefinition(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDefinition(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class DeclarationAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDeclaration(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDeclaration(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class ImplementationAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideImplementation(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideImplementation(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class TypeDefinitionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideTypeDefinition(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideTypeDefinition(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
const _HoverAdapter = class _HoverAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._hoverCounter = 0;
    this._hoverMap = /* @__PURE__ */ new Map();
  }
  async provideHover(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    let value;
    if (context && context.verbosityRequest) {
      const previousHoverId = context.verbosityRequest.previousHover.id;
      const previousHover = this._hoverMap.get(previousHoverId);
      if (!previousHover) {
        throw new Error(`Hover with id ${previousHoverId} not found`);
      }
      const hoverContext = { verbosityDelta: context.verbosityRequest.verbosityDelta, previousHover };
      value = await this._provider.provideHover(doc, pos, token, hoverContext);
    } else {
      value = await this._provider.provideHover(doc, pos, token);
    }
    if (!value || isFalsyOrEmpty(value.contents)) {
      return void 0;
    }
    if (!value.range) {
      value.range = doc.getWordRangeAtPosition(pos);
    }
    if (!value.range) {
      value.range = new Range(pos, pos);
    }
    const convertedHover = typeConvert.Hover.from(value);
    const id = this._hoverCounter;
    if (this._hoverMap.size === _HoverAdapter.HOVER_MAP_MAX_SIZE) {
      const minimumId = Math.min(...this._hoverMap.keys());
      this._hoverMap.delete(minimumId);
    }
    this._hoverMap.set(id, value);
    this._hoverCounter += 1;
    const hover = {
      ...convertedHover,
      id
    };
    return hover;
  }
  releaseHover(id) {
    this._hoverMap.delete(id);
  }
};
_HoverAdapter.HOVER_MAP_MAX_SIZE = 10;
let HoverAdapter = _HoverAdapter;
class EvaluatableExpressionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideEvaluatableExpression(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideEvaluatableExpression(doc, pos, token);
    if (value) {
      return typeConvert.EvaluatableExpression.from(value);
    }
    return void 0;
  }
}
class InlineValuesAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideInlineValues(resource, viewPort, context, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideInlineValues(doc, typeConvert.Range.to(viewPort), typeConvert.InlineValueContext.to(context), token);
    if (Array.isArray(value)) {
      return value.map((iv) => typeConvert.InlineValue.from(iv));
    }
    return void 0;
  }
}
class DocumentHighlightAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentHighlights(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDocumentHighlights(doc, pos, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.DocumentHighlight.from);
    }
    return void 0;
  }
}
class MultiDocumentHighlightAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async provideMultiDocumentHighlights(resource, position, otherResources, token) {
    const doc = this._documents.getDocument(resource);
    const otherDocuments = otherResources.map((r) => {
      try {
        return this._documents.getDocument(r);
      } catch (err) {
        this._logService.error("Error: Unable to retrieve document from URI: " + r + ". Error message: " + err);
        return void 0;
      }
    }).filter((doc2) => doc2 !== void 0);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideMultiDocumentHighlights(doc, pos, otherDocuments, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.MultiDocumentHighlight.from);
    }
    return void 0;
  }
}
class LinkedEditingRangeAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideLinkedEditingRanges(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideLinkedEditingRanges(doc, pos, token);
    if (value && Array.isArray(value.ranges)) {
      return {
        ranges: coalesce(value.ranges.map(typeConvert.Range.from)),
        wordPattern: value.wordPattern
      };
    }
    return void 0;
  }
}
class ReferenceAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideReferences(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideReferences(doc, pos, context, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.location.from);
    }
    return void 0;
  }
}
const _CodeActionAdapter = class _CodeActionAdapter {
  constructor(_documents, _commands, _diagnostics, _provider, _logService, _extension, _apiDeprecation) {
    this._documents = _documents;
    this._commands = _commands;
    this._diagnostics = _diagnostics;
    this._provider = _provider;
    this._logService = _logService;
    this._extension = _extension;
    this._apiDeprecation = _apiDeprecation;
    this._cache = new Cache("CodeAction");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideCodeActions(resource, rangeOrSelection, context, token) {
    const doc = this._documents.getDocument(resource);
    const ran = Selection.isISelection(rangeOrSelection) ? typeConvert.Selection.to(rangeOrSelection) : typeConvert.Range.to(rangeOrSelection);
    const allDiagnostics = [];
    for (const diagnostic of this._diagnostics.getDiagnostics(resource)) {
      if (ran.intersection(diagnostic.range)) {
        const newLen = allDiagnostics.push(diagnostic);
        if (newLen > _CodeActionAdapter._maxCodeActionsPerFile) {
          break;
        }
      }
    }
    const codeActionContext = {
      diagnostics: allDiagnostics,
      only: context.only ? new CodeActionKind(context.only) : void 0,
      triggerKind: typeConvert.CodeActionTriggerKind.to(context.trigger)
    };
    const commandsOrActions = await this._provider.provideCodeActions(doc, ran, codeActionContext, token);
    if (!isNonEmptyArray(commandsOrActions) || token.isCancellationRequested) {
      return void 0;
    }
    const cacheId = this._cache.add(commandsOrActions);
    const disposables = new DisposableStore();
    this._disposables.set(cacheId, disposables);
    const actions = [];
    for (let i = 0; i < commandsOrActions.length; i++) {
      const candidate = commandsOrActions[i];
      if (!candidate) {
        continue;
      }
      if (_CodeActionAdapter._isCommand(candidate) && !(candidate instanceof CodeAction)) {
        this._apiDeprecation.report(
          "CodeActionProvider.provideCodeActions - return commands",
          this._extension,
          `Return 'CodeAction' instances instead.`
        );
        actions.push({
          _isSynthetic: true,
          title: candidate.title,
          command: this._commands.toInternal(candidate, disposables)
        });
      } else {
        const toConvert = candidate;
        if (codeActionContext.only) {
          if (!toConvert.kind) {
            this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
          } else if (!codeActionContext.only.contains(toConvert.kind)) {
            this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action is of kind '${toConvert.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
          }
        }
        const range = toConvert.ranges ?? [];
        actions.push({
          cacheId: [cacheId, i],
          title: toConvert.title,
          command: toConvert.command && this._commands.toInternal(toConvert.command, disposables),
          diagnostics: toConvert.diagnostics && toConvert.diagnostics.map(typeConvert.Diagnostic.from),
          edit: toConvert.edit && typeConvert.WorkspaceEdit.from(toConvert.edit, void 0),
          kind: toConvert.kind && toConvert.kind.value,
          isPreferred: toConvert.isPreferred,
          isAI: isProposedApiEnabled(this._extension, "codeActionAI") ? toConvert.isAI : false,
          ranges: isProposedApiEnabled(this._extension, "codeActionRanges") ? coalesce(range.map(typeConvert.Range.from)) : void 0,
          disabled: toConvert.disabled?.reason
        });
      }
    }
    return { cacheId, actions };
  }
  async resolveCodeAction(id, token) {
    const [sessionId, itemId] = id;
    const item = this._cache.get(sessionId, itemId);
    if (!item || _CodeActionAdapter._isCommand(item)) {
      return {};
    }
    if (!this._provider.resolveCodeAction) {
      return {};
    }
    const resolvedItem = await this._provider.resolveCodeAction(item, token) ?? item;
    let resolvedEdit;
    if (resolvedItem.edit) {
      resolvedEdit = typeConvert.WorkspaceEdit.from(resolvedItem.edit, void 0);
    }
    let resolvedCommand;
    if (resolvedItem.command) {
      const disposables = this._disposables.get(sessionId);
      if (disposables) {
        resolvedCommand = this._commands.toInternal(resolvedItem.command, disposables);
      }
    }
    return { edit: resolvedEdit, command: resolvedCommand };
  }
  releaseCodeActions(cachedId) {
    this._disposables.get(cachedId)?.dispose();
    this._disposables.delete(cachedId);
    this._cache.delete(cachedId);
  }
  static _isCommand(thing) {
    return typeof thing.command === "string" && typeof thing.title === "string";
  }
};
_CodeActionAdapter._maxCodeActionsPerFile = 1e3;
let CodeActionAdapter = _CodeActionAdapter;
class DocumentPasteEditProvider {
  constructor(_proxy, _documents, _provider, _handle, _extension) {
    this._proxy = _proxy;
    this._documents = _documents;
    this._provider = _provider;
    this._handle = _handle;
    this._extension = _extension;
    this._editsCache = new Cache("DocumentPasteEdit.edits");
  }
  async prepareDocumentPaste(resource, ranges, dataTransferDto, token) {
    if (!this._provider.prepareDocumentPaste) {
      return;
    }
    this._cachedPrepare = void 0;
    const doc = this._documents.getDocument(resource);
    const vscodeRanges = ranges.map((range) => typeConvert.Range.to(range));
    const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, () => {
      throw new NotImplementedError();
    });
    await this._provider.prepareDocumentPaste(doc, vscodeRanges, dataTransfer, token);
    if (token.isCancellationRequested) {
      return;
    }
    const newEntries = Array.from(dataTransfer).filter(([, value]) => !(value instanceof InternalDataTransferItem));
    const newCache = /* @__PURE__ */ new Map();
    const items = await Promise.all(Array.from(newEntries, async ([mime, value]) => {
      const id = generateUuid();
      newCache.set(id, value);
      return [mime, await typeConvert.DataTransferItem.from(mime, value, id)];
    }));
    this._cachedPrepare = newCache;
    return { items };
  }
  async providePasteEdits(requestId, resource, ranges, dataTransferDto, context, token) {
    if (!this._provider.provideDocumentPasteEdits) {
      return [];
    }
    const doc = this._documents.getDocument(resource);
    const vscodeRanges = ranges.map((range) => typeConvert.Range.to(range));
    const items = dataTransferDto.items.map(([mime, value]) => {
      const cached = this._cachedPrepare?.get(value.id);
      if (cached) {
        return [mime, cached];
      }
      return [
        mime,
        typeConvert.DataTransferItem.to(mime, value, async (id) => {
          return (await this._proxy.$resolvePasteFileData(this._handle, requestId, id)).buffer;
        })
      ];
    });
    const dataTransfer = new DataTransfer(items);
    const edits = await this._provider.provideDocumentPasteEdits(doc, vscodeRanges, dataTransfer, {
      only: context.only ? new DocumentDropOrPasteEditKind(context.only) : void 0,
      triggerKind: context.triggerKind
    }, token);
    if (!edits || token.isCancellationRequested) {
      return [];
    }
    const cacheId = this._editsCache.add(edits);
    return edits.map((edit, i) => ({
      _cacheId: [cacheId, i],
      title: edit.title ?? localize("defaultPasteLabel", "Paste using '{0}' extension", this._extension.displayName || this._extension.name),
      kind: edit.kind,
      yieldTo: edit.yieldTo?.map((x) => x.value),
      insertText: typeof edit.insertText === "string" ? edit.insertText : { snippet: edit.insertText.value },
      additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, void 0) : void 0
    }));
  }
  async resolvePasteEdit(id, token) {
    const [sessionId, itemId] = id;
    const item = this._editsCache.get(sessionId, itemId);
    if (!item || !this._provider.resolveDocumentPasteEdit) {
      return {};
    }
    const resolvedItem = await this._provider.resolveDocumentPasteEdit(item, token) ?? item;
    return {
      insertText: resolvedItem.insertText,
      additionalEdit: resolvedItem.additionalEdit ? typeConvert.WorkspaceEdit.from(resolvedItem.additionalEdit, void 0) : void 0
    };
  }
  releasePasteEdits(id) {
    this._editsCache.delete(id);
  }
}
class DocumentFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentFormattingEdits(resource, options, token) {
    const document = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentFormattingEdits(document, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class RangeFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentRangeFormattingEdits(resource, range, options, token) {
    const document = this._documents.getDocument(resource);
    const ran = typeConvert.Range.to(range);
    const value = await this._provider.provideDocumentRangeFormattingEdits(document, ran, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
  async provideDocumentRangesFormattingEdits(resource, ranges, options, token) {
    assertType(typeof this._provider.provideDocumentRangesFormattingEdits === "function", "INVALID invocation of `provideDocumentRangesFormattingEdits`");
    const document = this._documents.getDocument(resource);
    const _ranges = ranges.map(typeConvert.Range.to);
    const value = await this._provider.provideDocumentRangesFormattingEdits(document, _ranges, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class OnTypeFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this.autoFormatTriggerCharacters = [];
  }
  // not here
  async provideOnTypeFormattingEdits(resource, position, ch, options, token) {
    const document = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideOnTypeFormattingEdits(document, pos, ch, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class NavigateTypeAdapter {
  constructor(_provider, _logService) {
    this._provider = _provider;
    this._logService = _logService;
    this._cache = new Cache("WorkspaceSymbols");
  }
  async provideWorkspaceSymbols(search, token) {
    const value = await this._provider.provideWorkspaceSymbols(search, token);
    if (!isNonEmptyArray(value)) {
      return { symbols: [] };
    }
    const sid = this._cache.add(value);
    const result = {
      cacheId: sid,
      symbols: []
    };
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (!item || !item.name) {
        this._logService.warn("INVALID SymbolInformation", item);
        continue;
      }
      result.symbols.push({
        ...typeConvert.WorkspaceSymbol.from(item),
        cacheId: [sid, i]
      });
    }
    return result;
  }
  async resolveWorkspaceSymbol(symbol, token) {
    if (typeof this._provider.resolveWorkspaceSymbol !== "function") {
      return symbol;
    }
    if (!symbol.cacheId) {
      return symbol;
    }
    const item = this._cache.get(...symbol.cacheId);
    if (item) {
      const value = await this._provider.resolveWorkspaceSymbol(item, token);
      return value && mixin(symbol, typeConvert.WorkspaceSymbol.from(value), true);
    }
    return void 0;
  }
  releaseWorkspaceSymbols(id) {
    this._cache.delete(id);
  }
}
class RenameAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  static supportsResolving(provider) {
    return typeof provider.prepareRename === "function";
  }
  async provideRenameEdits(resource, position, newName, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    try {
      const value = await this._provider.provideRenameEdits(doc, pos, newName, token);
      if (!value) {
        return void 0;
      }
      return typeConvert.WorkspaceEdit.from(value);
    } catch (err) {
      const rejectReason = RenameAdapter._asMessage(err);
      if (rejectReason) {
        return { rejectReason, edits: void 0 };
      } else {
        return Promise.reject(err);
      }
    }
  }
  async resolveRenameLocation(resource, position, token) {
    if (typeof this._provider.prepareRename !== "function") {
      return Promise.resolve(void 0);
    }
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    try {
      const rangeOrLocation = await this._provider.prepareRename(doc, pos, token);
      let range;
      let text;
      if (Range.isRange(rangeOrLocation)) {
        range = rangeOrLocation;
        text = doc.getText(rangeOrLocation);
      } else if (isObject(rangeOrLocation)) {
        range = rangeOrLocation.range;
        text = rangeOrLocation.placeholder;
      }
      if (!range || !text) {
        return void 0;
      }
      if (range.start.line > pos.line || range.end.line < pos.line) {
        this._logService.warn("INVALID rename location: position line must be within range start/end lines");
        return void 0;
      }
      return { range: typeConvert.Range.from(range), text };
    } catch (err) {
      const rejectReason = RenameAdapter._asMessage(err);
      if (rejectReason) {
        return { rejectReason, range: void 0, text: void 0 };
      } else {
        return Promise.reject(err);
      }
    }
  }
  static _asMessage(err) {
    if (typeof err === "string") {
      return err;
    } else if (err instanceof Error && typeof err.message === "string") {
      return err.message;
    } else {
      return void 0;
    }
  }
}
const _NewSymbolNamesAdapter = class _NewSymbolNamesAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async supportsAutomaticNewSymbolNamesTriggerKind() {
    return this._provider.supportsAutomaticTriggerKind;
  }
  async provideNewSymbolNames(resource, range, triggerKind, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Range.to(range);
    try {
      const kind = _NewSymbolNamesAdapter.languageTriggerKindToVSCodeTriggerKind[triggerKind];
      const value = await this._provider.provideNewSymbolNames(doc, pos, kind, token);
      if (!value) {
        return void 0;
      }
      return value.map(
        (v) => typeof v === "string" ? { newSymbolName: v } : { newSymbolName: v.newSymbolName, tags: v.tags }
      );
    } catch (err) {
      this._logService.error(
        _NewSymbolNamesAdapter._asMessage(err) ?? JSON.stringify(err, null, "	")
        /* @ulugbekna: assuming `err` doesn't have circular references that could result in an exception when converting to JSON */
      );
      return void 0;
    }
  }
  // @ulugbekna: this method is also defined in RenameAdapter but seems OK to be duplicated
  static _asMessage(err) {
    if (typeof err === "string") {
      return err;
    } else if (err instanceof Error && typeof err.message === "string") {
      return err.message;
    } else {
      return void 0;
    }
  }
};
_NewSymbolNamesAdapter.languageTriggerKindToVSCodeTriggerKind = {
  [languages.NewSymbolNameTriggerKind.Invoke]: NewSymbolNameTriggerKind.Invoke,
  [languages.NewSymbolNameTriggerKind.Automatic]: NewSymbolNameTriggerKind.Automatic
};
let NewSymbolNamesAdapter = _NewSymbolNamesAdapter;
class SemanticTokensPreviousResult {
  constructor(resultId, tokens) {
    this.resultId = resultId;
    this.tokens = tokens;
  }
}
class DocumentSemanticTokensAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._nextResultId = 1;
    this._previousResults = /* @__PURE__ */ new Map();
  }
  async provideDocumentSemanticTokens(resource, previousResultId, token) {
    const doc = this._documents.getDocument(resource);
    const previousResult = previousResultId !== 0 ? this._previousResults.get(previousResultId) : null;
    let value = typeof previousResult?.resultId === "string" && typeof this._provider.provideDocumentSemanticTokensEdits === "function" ? await this._provider.provideDocumentSemanticTokensEdits(doc, previousResult.resultId, token) : await this._provider.provideDocumentSemanticTokens(doc, token);
    if (previousResult) {
      this._previousResults.delete(previousResultId);
    }
    if (!value) {
      return null;
    }
    value = DocumentSemanticTokensAdapter._fixProvidedSemanticTokens(value);
    return this._send(DocumentSemanticTokensAdapter._convertToEdits(previousResult, value), value);
  }
  async releaseDocumentSemanticColoring(semanticColoringResultId) {
    this._previousResults.delete(semanticColoringResultId);
  }
  static _fixProvidedSemanticTokens(v) {
    if (DocumentSemanticTokensAdapter._isSemanticTokens(v)) {
      if (DocumentSemanticTokensAdapter._isCorrectSemanticTokens(v)) {
        return v;
      }
      return new SemanticTokens(new Uint32Array(v.data), v.resultId);
    } else if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(v)) {
      if (DocumentSemanticTokensAdapter._isCorrectSemanticTokensEdits(v)) {
        return v;
      }
      return new SemanticTokensEdits(v.edits.map((edit) => new SemanticTokensEdit(edit.start, edit.deleteCount, edit.data ? new Uint32Array(edit.data) : edit.data)), v.resultId);
    }
    return v;
  }
  static _isSemanticTokens(v) {
    return v && !!v.data;
  }
  static _isCorrectSemanticTokens(v) {
    return v.data instanceof Uint32Array;
  }
  static _isSemanticTokensEdits(v) {
    return v && Array.isArray(v.edits);
  }
  static _isCorrectSemanticTokensEdits(v) {
    for (const edit of v.edits) {
      if (!(edit.data instanceof Uint32Array)) {
        return false;
      }
    }
    return true;
  }
  static _convertToEdits(previousResult, newResult) {
    if (!DocumentSemanticTokensAdapter._isSemanticTokens(newResult)) {
      return newResult;
    }
    if (!previousResult || !previousResult.tokens) {
      return newResult;
    }
    const oldData = previousResult.tokens;
    const oldLength = oldData.length;
    const newData = newResult.data;
    const newLength = newData.length;
    let commonPrefixLength = 0;
    const maxCommonPrefixLength = Math.min(oldLength, newLength);
    while (commonPrefixLength < maxCommonPrefixLength && oldData[commonPrefixLength] === newData[commonPrefixLength]) {
      commonPrefixLength++;
    }
    if (commonPrefixLength === oldLength && commonPrefixLength === newLength) {
      return new SemanticTokensEdits([], newResult.resultId);
    }
    let commonSuffixLength = 0;
    const maxCommonSuffixLength = maxCommonPrefixLength - commonPrefixLength;
    while (commonSuffixLength < maxCommonSuffixLength && oldData[oldLength - commonSuffixLength - 1] === newData[newLength - commonSuffixLength - 1]) {
      commonSuffixLength++;
    }
    return new SemanticTokensEdits([{
      start: commonPrefixLength,
      deleteCount: oldLength - commonPrefixLength - commonSuffixLength,
      data: newData.subarray(commonPrefixLength, newLength - commonSuffixLength)
    }], newResult.resultId);
  }
  _send(value, original) {
    if (DocumentSemanticTokensAdapter._isSemanticTokens(value)) {
      const myId = this._nextResultId++;
      this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId, value.data));
      return encodeSemanticTokensDto({
        id: myId,
        type: "full",
        data: value.data
      });
    }
    if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(value)) {
      const myId = this._nextResultId++;
      if (DocumentSemanticTokensAdapter._isSemanticTokens(original)) {
        this._previousResults.set(myId, new SemanticTokensPreviousResult(original.resultId, original.data));
      } else {
        this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId));
      }
      return encodeSemanticTokensDto({
        id: myId,
        type: "delta",
        deltas: (value.edits || []).map((edit) => ({ start: edit.start, deleteCount: edit.deleteCount, data: edit.data }))
      });
    }
    return null;
  }
}
class DocumentRangeSemanticTokensAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentRangeSemanticTokens(resource, range, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentRangeSemanticTokens(doc, typeConvert.Range.to(range), token);
    if (!value) {
      return null;
    }
    return this._send(value);
  }
  _send(value) {
    return encodeSemanticTokensDto({
      id: 0,
      type: "full",
      data: value.data
    });
  }
}
class CompletionsAdapter {
  constructor(_documents, _commands, _provider, _apiDeprecation, _extension) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._apiDeprecation = _apiDeprecation;
    this._extension = _extension;
    this._cache = new Cache("CompletionItem");
    this._disposables = /* @__PURE__ */ new Map();
  }
  static supportsResolving(provider) {
    return typeof provider.resolveCompletionItem === "function";
  }
  async provideCompletionItems(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const replaceRange = doc.getWordRangeAtPosition(pos) || new Range(pos, pos);
    const insertRange = replaceRange.with({ end: pos });
    const sw = new StopWatch();
    const itemsOrList = await this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.to(context));
    if (!itemsOrList) {
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const list = Array.isArray(itemsOrList) ? new CompletionList(itemsOrList) : itemsOrList;
    const pid = CompletionsAdapter.supportsResolving(this._provider) ? this._cache.add(list.items) : this._cache.add([]);
    const disposables = new DisposableStore();
    this._disposables.set(pid, disposables);
    const completions = [];
    const result = {
      x: pid,
      [extHostProtocol.ISuggestResultDtoField.completions]: completions,
      [extHostProtocol.ISuggestResultDtoField.defaultRanges]: { replace: typeConvert.Range.from(replaceRange), insert: typeConvert.Range.from(insertRange) },
      [extHostProtocol.ISuggestResultDtoField.isIncomplete]: list.isIncomplete || void 0,
      [extHostProtocol.ISuggestResultDtoField.duration]: sw.elapsed()
    };
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i];
      const dto = this._convertCompletionItem(item, [pid, i], insertRange, replaceRange);
      completions.push(dto);
    }
    return result;
  }
  async resolveCompletionItem(id, token) {
    if (typeof this._provider.resolveCompletionItem !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const dto1 = this._convertCompletionItem(item, id);
    const resolvedItem = await this._provider.resolveCompletionItem(item, token);
    if (!resolvedItem) {
      return void 0;
    }
    const dto2 = this._convertCompletionItem(resolvedItem, id);
    if (dto1[extHostProtocol.ISuggestDataDtoField.insertText] !== dto2[extHostProtocol.ISuggestDataDtoField.insertText] || dto1[extHostProtocol.ISuggestDataDtoField.insertTextRules] !== dto2[extHostProtocol.ISuggestDataDtoField.insertTextRules]) {
      this._apiDeprecation.report("CompletionItem.insertText", this._extension, "extension MAY NOT change 'insertText' of a CompletionItem during resolve");
    }
    if (dto1[extHostProtocol.ISuggestDataDtoField.commandIdent] !== dto2[extHostProtocol.ISuggestDataDtoField.commandIdent] || dto1[extHostProtocol.ISuggestDataDtoField.commandId] !== dto2[extHostProtocol.ISuggestDataDtoField.commandId] || !equals(dto1[extHostProtocol.ISuggestDataDtoField.commandArguments], dto2[extHostProtocol.ISuggestDataDtoField.commandArguments])) {
      this._apiDeprecation.report("CompletionItem.command", this._extension, "extension MAY NOT change 'command' of a CompletionItem during resolve");
    }
    return {
      ...dto1,
      [extHostProtocol.ISuggestDataDtoField.documentation]: dto2[extHostProtocol.ISuggestDataDtoField.documentation],
      [extHostProtocol.ISuggestDataDtoField.detail]: dto2[extHostProtocol.ISuggestDataDtoField.detail],
      [extHostProtocol.ISuggestDataDtoField.additionalTextEdits]: dto2[extHostProtocol.ISuggestDataDtoField.additionalTextEdits],
      // (fishy) async insertText
      [extHostProtocol.ISuggestDataDtoField.insertText]: dto2[extHostProtocol.ISuggestDataDtoField.insertText],
      [extHostProtocol.ISuggestDataDtoField.insertTextRules]: dto2[extHostProtocol.ISuggestDataDtoField.insertTextRules],
      // (fishy) async command
      [extHostProtocol.ISuggestDataDtoField.commandIdent]: dto2[extHostProtocol.ISuggestDataDtoField.commandIdent],
      [extHostProtocol.ISuggestDataDtoField.commandId]: dto2[extHostProtocol.ISuggestDataDtoField.commandId],
      [extHostProtocol.ISuggestDataDtoField.commandArguments]: dto2[extHostProtocol.ISuggestDataDtoField.commandArguments]
    };
  }
  releaseCompletionItems(id) {
    this._disposables.get(id)?.dispose();
    this._disposables.delete(id);
    this._cache.delete(id);
  }
  _convertCompletionItem(item, id, defaultInsertRange, defaultReplaceRange) {
    const disposables = this._disposables.get(id[0]);
    if (!disposables) {
      throw Error("DisposableStore is missing...");
    }
    const command = this._commands.toInternal(item.command, disposables);
    const result = {
      //
      x: id,
      //
      [extHostProtocol.ISuggestDataDtoField.label]: item.label,
      [extHostProtocol.ISuggestDataDtoField.kind]: item.kind !== void 0 ? typeConvert.CompletionItemKind.from(item.kind) : void 0,
      [extHostProtocol.ISuggestDataDtoField.kindModifier]: item.tags && item.tags.map(typeConvert.CompletionItemTag.from),
      [extHostProtocol.ISuggestDataDtoField.detail]: item.detail,
      [extHostProtocol.ISuggestDataDtoField.documentation]: typeof item.documentation === "undefined" ? void 0 : typeConvert.MarkdownString.fromStrict(item.documentation),
      [extHostProtocol.ISuggestDataDtoField.sortText]: item.sortText !== item.label ? item.sortText : void 0,
      [extHostProtocol.ISuggestDataDtoField.filterText]: item.filterText !== item.label ? item.filterText : void 0,
      [extHostProtocol.ISuggestDataDtoField.preselect]: item.preselect || void 0,
      [extHostProtocol.ISuggestDataDtoField.insertTextRules]: item.keepWhitespace ? languages.CompletionItemInsertTextRule.KeepWhitespace : languages.CompletionItemInsertTextRule.None,
      [extHostProtocol.ISuggestDataDtoField.commitCharacters]: item.commitCharacters?.join(""),
      [extHostProtocol.ISuggestDataDtoField.additionalTextEdits]: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
      [extHostProtocol.ISuggestDataDtoField.commandIdent]: command?.$ident,
      [extHostProtocol.ISuggestDataDtoField.commandId]: command?.id,
      [extHostProtocol.ISuggestDataDtoField.commandArguments]: command?.$ident ? void 0 : command?.arguments
      // filled in on main side from $ident
    };
    if (item.textEdit) {
      this._apiDeprecation.report("CompletionItem.textEdit", this._extension, `Use 'CompletionItem.insertText' and 'CompletionItem.range' instead.`);
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.textEdit.newText;
    } else if (typeof item.insertText === "string") {
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText;
    } else if (item.insertText instanceof SnippetString) {
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText.value;
      result[extHostProtocol.ISuggestDataDtoField.insertTextRules] |= languages.CompletionItemInsertTextRule.InsertAsSnippet;
    }
    let range;
    if (item.textEdit) {
      range = item.textEdit.range;
    } else if (item.range) {
      range = item.range;
    }
    if (Range.isRange(range)) {
      result[extHostProtocol.ISuggestDataDtoField.range] = typeConvert.Range.from(range);
    } else if (range && (!defaultInsertRange?.isEqual(range.inserting) || !defaultReplaceRange?.isEqual(range.replacing))) {
      result[extHostProtocol.ISuggestDataDtoField.range] = {
        insert: typeConvert.Range.from(range.inserting),
        replace: typeConvert.Range.from(range.replacing)
      };
    }
    return result;
  }
}
class InlineCompletionAdapter {
  constructor(_extension, _documents, _provider, _commands) {
    this._extension = _extension;
    this._documents = _documents;
    this._provider = _provider;
    this._commands = _commands;
    this._references = new ReferenceMap();
    this.languageTriggerKindToVSCodeTriggerKind = {
      [languages.InlineCompletionTriggerKind.Automatic]: InlineCompletionTriggerKind.Automatic,
      [languages.InlineCompletionTriggerKind.Explicit]: InlineCompletionTriggerKind.Invoke
    };
    this._isAdditionsProposedApiEnabled = isProposedApiEnabled(this._extension, "inlineCompletionsAdditions");
  }
  get supportsHandleEvents() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && (typeof this._provider.handleDidShowCompletionItem === "function" || typeof this._provider.handleDidPartiallyAcceptCompletionItem === "function" || typeof this._provider.handleDidRejectCompletionItem === "function" || typeof this._provider.handleEndOfLifetime === "function");
  }
  get supportsSetModelId() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && typeof this._provider.setCurrentModelId === "function";
  }
  get supportsSetProviderOption() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && typeof this._provider.setProviderOptionValue === "function";
  }
  get modelInfo() {
    if (!this._isAdditionsProposedApiEnabled) {
      return void 0;
    }
    return this._provider.modelInfo ? {
      models: this._provider.modelInfo.models,
      currentModelId: this._provider.modelInfo.currentModelId
    } : void 0;
  }
  setCurrentModelId(modelId) {
    if (!this._isAdditionsProposedApiEnabled) {
      return;
    }
    this._provider.setCurrentModelId?.(modelId);
  }
  get providerOptions() {
    if (!this._isAdditionsProposedApiEnabled) {
      return void 0;
    }
    return this._provider.providerOptions?.map((o) => ({
      id: o.id,
      label: o.label,
      values: o.values.map((v) => ({ id: v.id, label: v.label })),
      currentValueId: o.currentValueId
    }));
  }
  setProviderOption(optionId, valueId) {
    if (!this._isAdditionsProposedApiEnabled) {
      return;
    }
    this._provider.setProviderOptionValue?.(optionId, valueId);
  }
  async provideInlineCompletions(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const result = await this._provider.provideInlineCompletionItems(doc, pos, {
      selectedCompletionInfo: context.selectedSuggestionInfo ? {
        range: typeConvert.Range.to(context.selectedSuggestionInfo.range),
        text: context.selectedSuggestionInfo.text
      } : void 0,
      triggerKind: this.languageTriggerKindToVSCodeTriggerKind[context.triggerKind],
      requestUuid: context.requestUuid,
      requestIssuedDateTime: context.requestIssuedDateTime,
      earliestShownDateTime: context.earliestShownDateTime,
      changeHint: context.changeHint
    }, token);
    if (!result) {
      return void 0;
    }
    const { resultItems, list } = Array.isArray(result) ? { resultItems: result, list: void 0 } : { resultItems: result.items, list: result };
    const commands = this._isAdditionsProposedApiEnabled ? Array.isArray(result) ? [] : result.commands || [] : [];
    const enableForwardStability = this._isAdditionsProposedApiEnabled && !Array.isArray(result) ? result.enableForwardStability : void 0;
    let disposableStore = void 0;
    const pid = this._references.createReferenceId({
      dispose() {
        disposableStore?.dispose();
      },
      items: resultItems,
      list
    });
    const items = {
      pid,
      languageId: doc.languageId,
      items: resultItems.map((item, idx) => {
        let command = void 0;
        if (item.command) {
          if (!disposableStore) {
            disposableStore = new DisposableStore();
          }
          command = this._commands.toInternal(item.command, disposableStore);
        }
        let action = void 0;
        if (item.action) {
          if (!disposableStore) {
            disposableStore = new DisposableStore();
          }
          action = this._commands.toInternal(item.action, disposableStore);
        }
        const insertText = item.insertText;
        return {
          insertText: insertText === void 0 ? void 0 : typeof insertText === "string" ? insertText : { snippet: insertText.value },
          range: item.range ? typeConvert.Range.from(item.range) : void 0,
          showRange: this._isAdditionsProposedApiEnabled && item.showRange ? typeConvert.Range.from(item.showRange) : void 0,
          command,
          gutterMenuLinkAction: action,
          pid,
          idx,
          completeBracketPairs: this._isAdditionsProposedApiEnabled ? item.completeBracketPairs : false,
          isInlineEdit: this._isAdditionsProposedApiEnabled ? item.isInlineEdit : false,
          showInlineEditMenu: this._isAdditionsProposedApiEnabled ? item.showInlineEditMenu : false,
          hint: item.displayLocation && this._isAdditionsProposedApiEnabled ? {
            range: typeConvert.Range.from(item.displayLocation.range),
            content: item.displayLocation.label,
            style: item.displayLocation.kind ? typeConvert.InlineCompletionHintStyle.from(item.displayLocation.kind) : languages.InlineCompletionHintStyle.Code
          } : void 0,
          warning: item.warning && this._isAdditionsProposedApiEnabled ? {
            message: typeConvert.MarkdownString.from(item.warning.message),
            icon: item.warning.icon ? typeConvert.IconPath.fromThemeIcon(item.warning.icon) : void 0
          } : void 0,
          correlationId: this._isAdditionsProposedApiEnabled ? item.correlationId : void 0,
          suggestionId: void 0,
          uri: this._isAdditionsProposedApiEnabled && item.uri ? item.uri : void 0,
          supportsRename: this._isAdditionsProposedApiEnabled ? item.supportsRename : false,
          jumpToPosition: this._isAdditionsProposedApiEnabled && item.jumpToPosition ? typeConvert.Position.from(item.jumpToPosition) : void 0
        };
      }),
      commands: commands.map((c) => {
        if (!disposableStore) {
          disposableStore = new DisposableStore();
        }
        return typeConvert.CompletionCommand.from(c, this._commands, disposableStore);
      }),
      suppressSuggestions: false,
      enableForwardStability
    };
    return items;
  }
  disposeCompletions(pid, reason) {
    const completionList = this._references.get(pid);
    if (this._provider.handleListEndOfLifetime && this._isAdditionsProposedApiEnabled && completionList?.list) {
      let translateReason2 = function(reason2) {
        switch (reason2.kind) {
          case "lostRace":
            return { kind: InlineCompletionsDisposeReasonKind.LostRace };
          case "tokenCancellation":
            return { kind: InlineCompletionsDisposeReasonKind.TokenCancellation };
          case "other":
            return { kind: InlineCompletionsDisposeReasonKind.Other };
          case "empty":
            return { kind: InlineCompletionsDisposeReasonKind.Empty };
          case "notTaken":
            return { kind: InlineCompletionsDisposeReasonKind.NotTaken };
          default:
            return { kind: InlineCompletionsDisposeReasonKind.Other };
        }
      };
      var translateReason = translateReason2;
      this._provider.handleListEndOfLifetime(completionList.list, translateReason2(reason));
    }
    const data = this._references.disposeReferenceId(pid);
    data?.dispose();
  }
  handleDidShowCompletionItem(pid, idx, updatedInsertText) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidShowCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidShowCompletionItem(completionItem, updatedInsertText);
      }
    }
  }
  handlePartialAccept(pid, idx, acceptedCharacters, info) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidPartiallyAcceptCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidPartiallyAcceptCompletionItem(completionItem, acceptedCharacters);
        this._provider.handleDidPartiallyAcceptCompletionItem(completionItem, typeConvert.PartialAcceptInfo.to(info));
      }
    }
  }
  handleEndOfLifetime(pid, idx, reason) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleEndOfLifetime && this._isAdditionsProposedApiEnabled) {
        const r = typeConvert.InlineCompletionEndOfLifeReason.to(reason, (ref) => this._references.get(ref.pid)?.items[ref.idx]);
        this._provider.handleEndOfLifetime(completionItem, r);
      }
    }
  }
  handleRejection(pid, idx) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidRejectCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidRejectCompletionItem(completionItem);
      }
    }
  }
}
class ReferenceMap {
  constructor() {
    this._references = /* @__PURE__ */ new Map();
    this._idPool = 1;
  }
  createReferenceId(value) {
    const id = this._idPool++;
    this._references.set(id, value);
    return id;
  }
  disposeReferenceId(referenceId) {
    const value = this._references.get(referenceId);
    this._references.delete(referenceId);
    return value;
  }
  get(referenceId) {
    return this._references.get(referenceId);
  }
}
class SignatureHelpAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._cache = new Cache("SignatureHelp");
  }
  async provideSignatureHelp(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const vscodeContext = this.reviveContext(context);
    const value = await this._provider.provideSignatureHelp(doc, pos, token, vscodeContext);
    if (value) {
      const id = this._cache.add([value]);
      return { ...typeConvert.SignatureHelp.from(value), id };
    }
    return void 0;
  }
  reviveContext(context) {
    let activeSignatureHelp = void 0;
    if (context.activeSignatureHelp) {
      const revivedSignatureHelp = typeConvert.SignatureHelp.to(context.activeSignatureHelp);
      const saved = this._cache.get(context.activeSignatureHelp.id, 0);
      if (saved) {
        activeSignatureHelp = saved;
        activeSignatureHelp.activeSignature = revivedSignatureHelp.activeSignature;
        activeSignatureHelp.activeParameter = revivedSignatureHelp.activeParameter;
      } else {
        activeSignatureHelp = revivedSignatureHelp;
      }
    }
    return { ...context, activeSignatureHelp };
  }
  releaseSignatureHelp(id) {
    this._cache.delete(id);
  }
}
class InlayHintsAdapter {
  constructor(_documents, _commands, _provider, _logService, _extension) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._logService = _logService;
    this._extension = _extension;
    this._cache = new Cache("InlayHints");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideInlayHints(resource, ran, token) {
    const doc = this._documents.getDocument(resource);
    const range = typeConvert.Range.to(ran);
    const hints = await this._provider.provideInlayHints(doc, range, token);
    if (!Array.isArray(hints) || hints.length === 0) {
      this._logService.trace(`[InlayHints] NO inlay hints from '${this._extension.identifier.value}' for range ${JSON.stringify(ran)}`);
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const pid = this._cache.add(hints);
    this._disposables.set(pid, new DisposableStore());
    const result = { hints: [], cacheId: pid };
    for (let i = 0; i < hints.length; i++) {
      if (this._isValidInlayHint(hints[i], range)) {
        result.hints.push(this._convertInlayHint(hints[i], [pid, i]));
      }
    }
    this._logService.trace(`[InlayHints] ${result.hints.length} inlay hints from '${this._extension.identifier.value}' for range ${JSON.stringify(ran)}`);
    return result;
  }
  async resolveInlayHint(id, token) {
    if (typeof this._provider.resolveInlayHint !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const hint = await this._provider.resolveInlayHint(item, token);
    if (!hint) {
      return void 0;
    }
    if (!this._isValidInlayHint(hint)) {
      return void 0;
    }
    return this._convertInlayHint(hint, id);
  }
  releaseHints(id) {
    this._disposables.get(id)?.dispose();
    this._disposables.delete(id);
    this._cache.delete(id);
  }
  _isValidInlayHint(hint, range) {
    if (hint.label.length === 0 || Array.isArray(hint.label) && hint.label.every((part) => part.value.length === 0)) {
      console.log("INVALID inlay hint, empty label", hint);
      return false;
    }
    if (range && !range.contains(hint.position)) {
      return false;
    }
    return true;
  }
  _convertInlayHint(hint, id) {
    const disposables = this._disposables.get(id[0]);
    if (!disposables) {
      throw Error("DisposableStore is missing...");
    }
    const result = {
      label: "",
      // fill-in below
      cacheId: id,
      tooltip: typeConvert.MarkdownString.fromStrict(hint.tooltip),
      position: typeConvert.Position.from(hint.position),
      textEdits: hint.textEdits && hint.textEdits.map(typeConvert.TextEdit.from),
      kind: hint.kind && typeConvert.InlayHintKind.from(hint.kind),
      paddingLeft: hint.paddingLeft,
      paddingRight: hint.paddingRight
    };
    if (typeof hint.label === "string") {
      result.label = hint.label;
    } else {
      const parts = [];
      result.label = parts;
      for (const part of hint.label) {
        if (!part.value) {
          console.warn("INVALID inlay hint, empty label part", this._extension.identifier.value);
          continue;
        }
        const part2 = {
          label: part.value,
          tooltip: typeConvert.MarkdownString.fromStrict(part.tooltip)
        };
        if (Location.isLocation(part.location)) {
          part2.location = typeConvert.location.from(part.location);
        }
        if (part.command) {
          part2.command = this._commands.toInternal(part.command, disposables);
        }
        parts.push(part2);
      }
    }
    return result;
  }
}
class LinkProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._cache = new Cache("DocumentLink");
  }
  async provideLinks(resource, token) {
    const doc = this._documents.getDocument(resource);
    const links = await this._provider.provideDocumentLinks(doc, token);
    if (!Array.isArray(links) || links.length === 0) {
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    if (typeof this._provider.resolveDocumentLink !== "function") {
      return { links: links.filter(LinkProviderAdapter._validateLink).map(typeConvert.DocumentLink.from) };
    } else {
      const pid = this._cache.add(links);
      const result = { links: [], cacheId: pid };
      for (let i = 0; i < links.length; i++) {
        if (!LinkProviderAdapter._validateLink(links[i])) {
          continue;
        }
        const dto = typeConvert.DocumentLink.from(links[i]);
        dto.cacheId = [pid, i];
        result.links.push(dto);
      }
      return result;
    }
  }
  static _validateLink(link) {
    if (link.target && link.target.path.length > 5e4) {
      console.warn("DROPPING link because it is too long");
      return false;
    }
    return true;
  }
  async resolveLink(id, token) {
    if (typeof this._provider.resolveDocumentLink !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const link = await this._provider.resolveDocumentLink(item, token);
    if (!link || !LinkProviderAdapter._validateLink(link)) {
      return void 0;
    }
    return typeConvert.DocumentLink.from(link);
  }
  releaseLinks(id) {
    this._cache.delete(id);
  }
}
class ColorProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideColors(resource, token) {
    const doc = this._documents.getDocument(resource);
    const colors = await this._provider.provideDocumentColors(doc, token);
    if (!Array.isArray(colors)) {
      return [];
    }
    const colorInfos = colors.map((ci) => {
      return {
        color: typeConvert.Color.from(ci.color),
        range: typeConvert.Range.from(ci.range)
      };
    });
    return colorInfos;
  }
  async provideColorPresentations(resource, raw, token) {
    const document = this._documents.getDocument(resource);
    const range = typeConvert.Range.to(raw.range);
    const color = typeConvert.Color.to(raw.color);
    const value = await this._provider.provideColorPresentations(color, { document, range }, token);
    if (!Array.isArray(value)) {
      return void 0;
    }
    return value.map(typeConvert.ColorPresentation.from);
  }
}
class FoldingProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideFoldingRanges(resource, context, token) {
    const doc = this._documents.getDocument(resource);
    const ranges = await this._provider.provideFoldingRanges(doc, context, token);
    if (!Array.isArray(ranges)) {
      return void 0;
    }
    return ranges.map(typeConvert.FoldingRange.from);
  }
}
class SelectionRangeAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async provideSelectionRanges(resource, pos, token) {
    const document = this._documents.getDocument(resource);
    const positions = pos.map(typeConvert.Position.to);
    const allProviderRanges = await this._provider.provideSelectionRanges(document, positions, token);
    if (!isNonEmptyArray(allProviderRanges)) {
      return [];
    }
    if (allProviderRanges.length !== positions.length) {
      this._logService.warn("BAD selection ranges, provider must return ranges for each position");
      return [];
    }
    const allResults = [];
    for (let i = 0; i < positions.length; i++) {
      const oneResult = [];
      allResults.push(oneResult);
      let last = positions[i];
      let selectionRange = allProviderRanges[i];
      while (true) {
        if (!selectionRange.range.contains(last)) {
          throw new Error("INVALID selection range, must contain the previous range");
        }
        oneResult.push(typeConvert.SelectionRange.from(selectionRange));
        if (!selectionRange.parent) {
          break;
        }
        last = selectionRange.range;
        selectionRange = selectionRange.parent;
      }
    }
    return allResults;
  }
}
class CallHierarchyAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._idPool = new IdGenerator("");
    this._cache = /* @__PURE__ */ new Map();
  }
  async prepareSession(uri, position, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const items = await this._provider.prepareCallHierarchy(doc, pos, token);
    if (!items) {
      return void 0;
    }
    const sessionId = this._idPool.nextId();
    this._cache.set(sessionId, /* @__PURE__ */ new Map());
    if (Array.isArray(items)) {
      return items.map((item) => this._cacheAndConvertItem(sessionId, item));
    } else {
      return [this._cacheAndConvertItem(sessionId, items)];
    }
  }
  async provideCallsTo(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing call hierarchy item");
    }
    const calls = await this._provider.provideCallHierarchyIncomingCalls(item, token);
    if (!calls) {
      return void 0;
    }
    return calls.map((call) => {
      return {
        from: this._cacheAndConvertItem(sessionId, call.from),
        fromRanges: call.fromRanges.map((r) => typeConvert.Range.from(r))
      };
    });
  }
  async provideCallsFrom(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing call hierarchy item");
    }
    const calls = await this._provider.provideCallHierarchyOutgoingCalls(item, token);
    if (!calls) {
      return void 0;
    }
    return calls.map((call) => {
      return {
        to: this._cacheAndConvertItem(sessionId, call.to),
        fromRanges: call.fromRanges.map((r) => typeConvert.Range.from(r))
      };
    });
  }
  releaseSession(sessionId) {
    this._cache.delete(sessionId);
  }
  _cacheAndConvertItem(sessionId, item) {
    const map = this._cache.get(sessionId);
    const dto = typeConvert.CallHierarchyItem.from(item, sessionId, map.size.toString(36));
    map.set(dto._itemId, item);
    return dto;
  }
  _itemFromCache(sessionId, itemId) {
    const map = this._cache.get(sessionId);
    return map?.get(itemId);
  }
}
class TypeHierarchyAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._idPool = new IdGenerator("");
    this._cache = /* @__PURE__ */ new Map();
  }
  async prepareSession(uri, position, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const items = await this._provider.prepareTypeHierarchy(doc, pos, token);
    if (!items) {
      return void 0;
    }
    const sessionId = this._idPool.nextId();
    this._cache.set(sessionId, /* @__PURE__ */ new Map());
    if (Array.isArray(items)) {
      return items.map((item) => this._cacheAndConvertItem(sessionId, item));
    } else {
      return [this._cacheAndConvertItem(sessionId, items)];
    }
  }
  async provideSupertypes(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing type hierarchy item");
    }
    const supertypes = await this._provider.provideTypeHierarchySupertypes(item, token);
    if (!supertypes) {
      return void 0;
    }
    return supertypes.map((supertype) => {
      return this._cacheAndConvertItem(sessionId, supertype);
    });
  }
  async provideSubtypes(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing type hierarchy item");
    }
    const subtypes = await this._provider.provideTypeHierarchySubtypes(item, token);
    if (!subtypes) {
      return void 0;
    }
    return subtypes.map((subtype) => {
      return this._cacheAndConvertItem(sessionId, subtype);
    });
  }
  releaseSession(sessionId) {
    this._cache.delete(sessionId);
  }
  _cacheAndConvertItem(sessionId, item) {
    const map = this._cache.get(sessionId);
    const dto = typeConvert.TypeHierarchyItem.from(item, sessionId, map.size.toString(36));
    map.set(dto._itemId, item);
    return dto;
  }
  _itemFromCache(sessionId, itemId) {
    const map = this._cache.get(sessionId);
    return map?.get(itemId);
  }
}
class DocumentDropEditAdapter {
  constructor(_proxy, _documents, _provider, _handle, _extension) {
    this._proxy = _proxy;
    this._documents = _documents;
    this._provider = _provider;
    this._handle = _handle;
    this._extension = _extension;
    this._cache = new Cache("DocumentDropEdit");
  }
  async provideDocumentOnDropEdits(requestId, uri, position, dataTransferDto, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, async (id) => {
      return (await this._proxy.$resolveDocumentOnDropFileData(this._handle, requestId, id)).buffer;
    });
    const edits = await this._provider.provideDocumentDropEdits(doc, pos, dataTransfer, token);
    if (!edits) {
      return void 0;
    }
    const editsArray = asArray(edits);
    const cacheId = this._cache.add(editsArray);
    return editsArray.map((edit, i) => ({
      _cacheId: [cacheId, i],
      title: edit.title ?? localize("defaultDropLabel", "Drop using '{0}' extension", this._extension.displayName || this._extension.name),
      kind: edit.kind?.value,
      yieldTo: edit.yieldTo?.map((x) => x.value),
      insertText: typeof edit.insertText === "string" ? edit.insertText : { snippet: edit.insertText.value },
      additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, void 0) : void 0
    }));
  }
  async resolveDropEdit(id, token) {
    const [sessionId, itemId] = id;
    const item = this._cache.get(sessionId, itemId);
    if (!item || !this._provider.resolveDocumentDropEdit) {
      return {};
    }
    const resolvedItem = await this._provider.resolveDocumentDropEdit(item, token) ?? item;
    const additionalEdit = resolvedItem.additionalEdit ? typeConvert.WorkspaceEdit.from(resolvedItem.additionalEdit, void 0) : void 0;
    return { additionalEdit };
  }
  releaseDropEdits(id) {
    this._cache.delete(id);
  }
}
class AdapterData {
  constructor(adapter, extension) {
    this.adapter = adapter;
    this.extension = extension;
  }
}
const _ExtHostLanguageFeatures = class _ExtHostLanguageFeatures extends CoreDisposable {
  constructor(mainContext, _uriTransformer, _documents, _commands, _diagnostics, _logService, _apiDeprecation, _extensionTelemetry) {
    super();
    this._uriTransformer = _uriTransformer;
    this._documents = _documents;
    this._commands = _commands;
    this._diagnostics = _diagnostics;
    this._logService = _logService;
    this._apiDeprecation = _apiDeprecation;
    this._extensionTelemetry = _extensionTelemetry;
    this._adapter = /* @__PURE__ */ new Map();
    this._onDidChangeInlineCompletionsUnificationState = this._register(new Emitter());
    this.onDidChangeInlineCompletionsUnificationState = this._onDidChangeInlineCompletionsUnificationState.event;
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadLanguageFeatures);
    this._inlineCompletionsUnificationState = {
      codeUnification: false,
      modelUnification: false,
      extensionUnification: false,
      expAssignments: []
    };
  }
  get inlineCompletionsUnificationState() {
    return this._inlineCompletionsUnificationState;
  }
  _transformDocumentSelector(selector, extension) {
    return typeConvert.DocumentSelector.from(selector, this._uriTransformer, extension);
  }
  _createDisposable(handle) {
    return new Disposable(() => {
      this._adapter.delete(handle);
      this._proxy.$unregister(handle);
    });
  }
  _nextHandle() {
    return _ExtHostLanguageFeatures._handlePool++;
  }
  async _withAdapter(handle, ctor, callback, fallbackValue, tokenToRaceAgainst, doNotLog = false) {
    const data = this._adapter.get(handle);
    if (!data || !(data.adapter instanceof ctor)) {
      return fallbackValue;
    }
    const t1 = Date.now();
    if (!doNotLog) {
      this._logService.trace(`[${data.extension.identifier.value}] INVOKE provider '${callback.toString().replace(/[\r\n]/g, "")}'`);
    }
    const result = callback(data.adapter, data.extension);
    Promise.resolve(result).catch((err) => {
      if (!isCancellationError(err)) {
        this._logService.error(`[${data.extension.identifier.value}] provider FAILED`);
        this._logService.error(err);
        this._extensionTelemetry.onExtensionError(data.extension.identifier, err);
      }
    }).finally(() => {
      if (!doNotLog) {
        this._logService.trace(`[${data.extension.identifier.value}] provider DONE after ${Date.now() - t1}ms`);
      }
    });
    if (CancellationToken.isCancellationToken(tokenToRaceAgainst)) {
      return raceCancellationError(result, tokenToRaceAgainst);
    }
    return result;
  }
  _addNewAdapter(adapter, extension) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(adapter, extension));
    return handle;
  }
  static _extLabel(ext) {
    return ext.displayName || ext.name;
  }
  static _extId(ext) {
    return ext.identifier.value;
  }
  // --- outline
  registerDocumentSymbolProvider(extension, selector, provider, metadata) {
    const handle = this._addNewAdapter(new DocumentSymbolAdapter(this._documents, provider), extension);
    const displayName = metadata && metadata.label || _ExtHostLanguageFeatures._extLabel(extension);
    this._proxy.$registerDocumentSymbolProvider(handle, this._transformDocumentSelector(selector, extension), displayName);
    return this._createDisposable(handle);
  }
  $provideDocumentSymbols(handle, resource, token) {
    return this._withAdapter(handle, DocumentSymbolAdapter, (adapter) => adapter.provideDocumentSymbols(URI.revive(resource), token), void 0, token);
  }
  // --- code lens
  registerCodeLensProvider(extension, selector, provider) {
    const handle = this._nextHandle();
    const eventHandle = typeof provider.onDidChangeCodeLenses === "function" ? this._nextHandle() : void 0;
    this._adapter.set(handle, new AdapterData(new CodeLensAdapter(this._documents, this._commands.converter, provider, extension, this._extensionTelemetry, this._logService), extension));
    this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector, extension), eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeCodeLenses((_) => this._proxy.$emitCodeLensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideCodeLenses(handle, resource, token) {
    return this._withAdapter(handle, CodeLensAdapter, (adapter) => adapter.provideCodeLenses(URI.revive(resource), token), void 0, token, resource.scheme === "output");
  }
  $resolveCodeLens(handle, symbol, token) {
    return this._withAdapter(handle, CodeLensAdapter, (adapter) => adapter.resolveCodeLens(symbol, token), void 0, void 0, true);
  }
  $releaseCodeLenses(handle, cacheId) {
    this._withAdapter(handle, CodeLensAdapter, (adapter) => Promise.resolve(adapter.releaseCodeLenses(cacheId)), void 0, void 0, true);
  }
  // --- declaration
  registerDefinitionProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider), extension);
    this._proxy.$registerDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDefinition(handle, resource, position, token) {
    return this._withAdapter(handle, DefinitionAdapter, (adapter) => adapter.provideDefinition(URI.revive(resource), position, token), [], token);
  }
  registerDeclarationProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DeclarationAdapter(this._documents, provider), extension);
    this._proxy.$registerDeclarationSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDeclaration(handle, resource, position, token) {
    return this._withAdapter(handle, DeclarationAdapter, (adapter) => adapter.provideDeclaration(URI.revive(resource), position, token), [], token);
  }
  registerImplementationProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider), extension);
    this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideImplementation(handle, resource, position, token) {
    return this._withAdapter(handle, ImplementationAdapter, (adapter) => adapter.provideImplementation(URI.revive(resource), position, token), [], token);
  }
  registerTypeDefinitionProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider), extension);
    this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideTypeDefinition(handle, resource, position, token) {
    return this._withAdapter(handle, TypeDefinitionAdapter, (adapter) => adapter.provideTypeDefinition(URI.revive(resource), position, token), [], token);
  }
  // --- extra info
  registerHoverProvider(extension, selector, provider, extensionId) {
    const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider), extension);
    this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideHover(handle, resource, position, context, token) {
    return this._withAdapter(handle, HoverAdapter, (adapter) => adapter.provideHover(URI.revive(resource), position, context, token), void 0, token);
  }
  $releaseHover(handle, id) {
    this._withAdapter(handle, HoverAdapter, (adapter) => Promise.resolve(adapter.releaseHover(id)), void 0, void 0);
  }
  // --- debug hover
  registerEvaluatableExpressionProvider(extension, selector, provider, extensionId) {
    const handle = this._addNewAdapter(new EvaluatableExpressionAdapter(this._documents, provider), extension);
    this._proxy.$registerEvaluatableExpressionProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideEvaluatableExpression(handle, resource, position, token) {
    return this._withAdapter(handle, EvaluatableExpressionAdapter, (adapter) => adapter.provideEvaluatableExpression(URI.revive(resource), position, token), void 0, token);
  }
  // --- debug inline values
  registerInlineValuesProvider(extension, selector, provider, extensionId) {
    const eventHandle = typeof provider.onDidChangeInlineValues === "function" ? this._nextHandle() : void 0;
    const handle = this._addNewAdapter(new InlineValuesAdapter(this._documents, provider), extension);
    this._proxy.$registerInlineValuesProvider(handle, this._transformDocumentSelector(selector, extension), eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeInlineValues((_) => this._proxy.$emitInlineValuesEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideInlineValues(handle, resource, range, context, token) {
    return this._withAdapter(handle, InlineValuesAdapter, (adapter) => adapter.provideInlineValues(URI.revive(resource), range, context, token), void 0, token);
  }
  // --- occurrences
  registerDocumentHighlightProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  registerMultiDocumentHighlightProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new MultiDocumentHighlightAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerMultiDocumentHighlightProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDocumentHighlights(handle, resource, position, token) {
    return this._withAdapter(handle, DocumentHighlightAdapter, (adapter) => adapter.provideDocumentHighlights(URI.revive(resource), position, token), void 0, token);
  }
  $provideMultiDocumentHighlights(handle, resource, position, otherModels, token) {
    return this._withAdapter(handle, MultiDocumentHighlightAdapter, (adapter) => adapter.provideMultiDocumentHighlights(URI.revive(resource), position, otherModels.map((model) => URI.revive(model)), token), void 0, token);
  }
  // --- linked editing
  registerLinkedEditingRangeProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new LinkedEditingRangeAdapter(this._documents, provider), extension);
    this._proxy.$registerLinkedEditingRangeProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideLinkedEditingRanges(handle, resource, position, token) {
    return this._withAdapter(handle, LinkedEditingRangeAdapter, async (adapter) => {
      const res = await adapter.provideLinkedEditingRanges(URI.revive(resource), position, token);
      if (res) {
        return {
          ranges: res.ranges,
          wordPattern: res.wordPattern ? _ExtHostLanguageFeatures._serializeRegExp(res.wordPattern) : void 0
        };
      }
      return void 0;
    }, void 0, token);
  }
  // --- references
  registerReferenceProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider), extension);
    this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideReferences(handle, resource, position, context, token) {
    return this._withAdapter(handle, ReferenceAdapter, (adapter) => adapter.provideReferences(URI.revive(resource), position, context, token), void 0, token);
  }
  // --- code actions
  registerCodeActionProvider(extension, selector, provider, metadata) {
    const store = new DisposableStore();
    const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension, this._apiDeprecation), extension);
    this._proxy.$registerCodeActionSupport(handle, this._transformDocumentSelector(selector, extension), {
      providedKinds: metadata?.providedCodeActionKinds?.map((kind) => kind.value),
      documentation: metadata?.documentation?.map((x) => ({
        kind: x.kind.value,
        command: this._commands.converter.toInternal(x.command, store)
      }))
    }, _ExtHostLanguageFeatures._extLabel(extension), _ExtHostLanguageFeatures._extId(extension), Boolean(provider.resolveCodeAction));
    store.add(this._createDisposable(handle));
    return store;
  }
  $provideCodeActions(handle, resource, rangeOrSelection, context, token) {
    return this._withAdapter(handle, CodeActionAdapter, (adapter) => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token), void 0, token);
  }
  $resolveCodeAction(handle, id, token) {
    return this._withAdapter(handle, CodeActionAdapter, (adapter) => adapter.resolveCodeAction(id, token), {}, void 0);
  }
  $releaseCodeActions(handle, cacheId) {
    this._withAdapter(handle, CodeActionAdapter, (adapter) => Promise.resolve(adapter.releaseCodeActions(cacheId)), void 0, void 0);
  }
  // --- formatting
  registerDocumentFormattingEditProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name);
    return this._createDisposable(handle);
  }
  $provideDocumentFormattingEdits(handle, resource, options, token) {
    return this._withAdapter(handle, DocumentFormattingAdapter, (adapter) => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token), void 0, token);
  }
  registerDocumentRangeFormattingEditProvider(extension, selector, provider) {
    const canFormatMultipleRanges = typeof provider.provideDocumentRangesFormattingEdits === "function";
    const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name, canFormatMultipleRanges);
    return this._createDisposable(handle);
  }
  $provideDocumentRangeFormattingEdits(handle, resource, range, options, token) {
    return this._withAdapter(handle, RangeFormattingAdapter, (adapter) => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token), void 0, token);
  }
  $provideDocumentRangesFormattingEdits(handle, resource, ranges, options, token) {
    return this._withAdapter(handle, RangeFormattingAdapter, (adapter) => adapter.provideDocumentRangesFormattingEdits(URI.revive(resource), ranges, options, token), void 0, token);
  }
  registerOnTypeFormattingEditProvider(extension, selector, provider, triggerCharacters) {
    const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, extension.identifier);
    return this._createDisposable(handle);
  }
  $provideOnTypeFormattingEdits(handle, resource, position, ch, options, token) {
    return this._withAdapter(handle, OnTypeFormattingAdapter, (adapter) => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token), void 0, token);
  }
  // --- navigate types
  registerWorkspaceSymbolProvider(extension, provider) {
    const handle = this._addNewAdapter(new NavigateTypeAdapter(provider, this._logService), extension);
    this._proxy.$registerNavigateTypeSupport(handle, typeof provider.resolveWorkspaceSymbol === "function");
    return this._createDisposable(handle);
  }
  $provideWorkspaceSymbols(handle, search, token) {
    return this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.provideWorkspaceSymbols(search, token), { symbols: [] }, token);
  }
  $resolveWorkspaceSymbol(handle, symbol, token) {
    return this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.resolveWorkspaceSymbol(symbol, token), void 0, void 0);
  }
  $releaseWorkspaceSymbols(handle, id) {
    this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.releaseWorkspaceSymbols(id), void 0, void 0);
  }
  // --- rename
  registerRenameProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector, extension), RenameAdapter.supportsResolving(provider));
    return this._createDisposable(handle);
  }
  $provideRenameEdits(handle, resource, position, newName, token) {
    return this._withAdapter(handle, RenameAdapter, (adapter) => adapter.provideRenameEdits(URI.revive(resource), position, newName, token), void 0, token);
  }
  $resolveRenameLocation(handle, resource, position, token) {
    return this._withAdapter(handle, RenameAdapter, (adapter) => adapter.resolveRenameLocation(URI.revive(resource), position, token), void 0, token);
  }
  registerNewSymbolNamesProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new NewSymbolNamesAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerNewSymbolNamesProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $supportsAutomaticNewSymbolNamesTriggerKind(handle) {
    return this._withAdapter(
      handle,
      NewSymbolNamesAdapter,
      (adapter) => adapter.supportsAutomaticNewSymbolNamesTriggerKind(),
      false,
      void 0
    );
  }
  $provideNewSymbolNames(handle, resource, range, triggerKind, token) {
    return this._withAdapter(handle, NewSymbolNamesAdapter, (adapter) => adapter.provideNewSymbolNames(URI.revive(resource), range, triggerKind, token), void 0, token);
  }
  //#region semantic coloring
  registerDocumentSemanticTokensProvider(extension, selector, provider, legend) {
    const handle = this._addNewAdapter(new DocumentSemanticTokensAdapter(this._documents, provider), extension);
    const eventHandle = typeof provider.onDidChangeSemanticTokens === "function" ? this._nextHandle() : void 0;
    this._proxy.$registerDocumentSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle) {
      const subscription = provider.onDidChangeSemanticTokens((_) => this._proxy.$emitDocumentSemanticTokensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideDocumentSemanticTokens(handle, resource, previousResultId, token) {
    return this._withAdapter(handle, DocumentSemanticTokensAdapter, (adapter) => adapter.provideDocumentSemanticTokens(URI.revive(resource), previousResultId, token), null, token);
  }
  $releaseDocumentSemanticTokens(handle, semanticColoringResultId) {
    this._withAdapter(handle, DocumentSemanticTokensAdapter, (adapter) => adapter.releaseDocumentSemanticColoring(semanticColoringResultId), void 0, void 0);
  }
  registerDocumentRangeSemanticTokensProvider(extension, selector, provider, legend) {
    const handle = this._addNewAdapter(new DocumentRangeSemanticTokensAdapter(this._documents, provider), extension);
    const eventHandle = typeof provider.onDidChangeSemanticTokens === "function" ? this._nextHandle() : void 0;
    this._proxy.$registerDocumentRangeSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle) {
      const subscription = provider.onDidChangeSemanticTokens((_) => this._proxy.$emitDocumentRangeSemanticTokensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideDocumentRangeSemanticTokens(handle, resource, range, token) {
    return this._withAdapter(handle, DocumentRangeSemanticTokensAdapter, (adapter) => adapter.provideDocumentRangeSemanticTokens(URI.revive(resource), range, token), null, token);
  }
  //#endregion
  // --- suggestion
  registerCompletionItemProvider(extension, selector, provider, triggerCharacters) {
    const handle = this._addNewAdapter(new CompletionsAdapter(this._documents, this._commands.converter, provider, this._apiDeprecation, extension), extension);
    this._proxy.$registerCompletionsProvider(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, CompletionsAdapter.supportsResolving(provider), extension.identifier);
    return this._createDisposable(handle);
  }
  $provideCompletionItems(handle, resource, position, context, token) {
    return this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.provideCompletionItems(URI.revive(resource), position, context, token), void 0, token);
  }
  $resolveCompletionItem(handle, id, token) {
    return this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.resolveCompletionItem(id, token), void 0, token);
  }
  $releaseCompletionItems(handle, id) {
    this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.releaseCompletionItems(id), void 0, void 0);
  }
  // --- ghost text
  registerInlineCompletionsProvider(extension, selector, provider, metadata) {
    const adapter = new InlineCompletionAdapter(extension, this._documents, provider, this._commands.converter);
    const handle = this._addNewAdapter(adapter, extension);
    let result = this._createDisposable(handle);
    const supportsOnDidChange = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChange === "function";
    if (supportsOnDidChange) {
      const subscription = provider.onDidChange((e) => this._proxy.$emitInlineCompletionsChange(handle, e ? { data: e.data } : void 0));
      result = Disposable.from(result, subscription);
    }
    const supportsOnDidChangeModelInfo = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChangeModelInfo === "function";
    if (supportsOnDidChangeModelInfo) {
      const subscription = provider.onDidChangeModelInfo((_) => this._proxy.$emitInlineCompletionModelInfoChange(handle, adapter.modelInfo));
      result = Disposable.from(result, subscription);
    }
    const supportsOnDidChangeProviderOptions = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChangeProviderOptions === "function";
    if (supportsOnDidChangeProviderOptions) {
      const subscription = provider.onDidChangeProviderOptions((_) => this._proxy.$emitInlineCompletionProviderOptionsChange(handle, adapter.providerOptions));
      result = Disposable.from(result, subscription);
    }
    this._proxy.$registerInlineCompletionsSupport(
      handle,
      this._transformDocumentSelector(selector, extension),
      adapter.supportsHandleEvents,
      ExtensionIdentifier.toKey(extension.identifier.value),
      extension.version,
      metadata?.groupId ? ExtensionIdentifier.toKey(metadata.groupId) : void 0,
      metadata?.yieldTo?.map((extId) => ExtensionIdentifier.toKey(extId)) || [],
      metadata?.displayName,
      metadata?.debounceDelayMs,
      metadata?.excludes?.map((extId) => ExtensionIdentifier.toKey(extId)) || [],
      supportsOnDidChange,
      adapter.supportsSetModelId,
      adapter.modelInfo,
      supportsOnDidChangeModelInfo,
      adapter.supportsSetProviderOption,
      adapter.providerOptions,
      supportsOnDidChangeProviderOptions
    );
    return result;
  }
  $provideInlineCompletions(handle, resource, position, context, token) {
    return this._withAdapter(handle, InlineCompletionAdapter, (adapter) => adapter.provideInlineCompletions(URI.revive(resource), position, context, token), void 0, void 0);
  }
  $handleInlineCompletionDidShow(handle, pid, idx, updatedInsertText) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleDidShowCompletionItem(pid, idx, updatedInsertText);
    }, void 0, void 0);
  }
  $handleInlineCompletionPartialAccept(handle, pid, idx, acceptedCharacters, info) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handlePartialAccept(pid, idx, acceptedCharacters, info);
    }, void 0, void 0);
  }
  $handleInlineCompletionEndOfLifetime(handle, pid, idx, reason) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleEndOfLifetime(pid, idx, reason);
    }, void 0, void 0);
  }
  $handleInlineCompletionRejection(handle, pid, idx) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleRejection(pid, idx);
    }, void 0, void 0);
  }
  $freeInlineCompletionsList(handle, pid, reason) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.disposeCompletions(pid, reason);
    }, void 0, void 0);
  }
  $acceptInlineCompletionsUnificationState(state) {
    this._inlineCompletionsUnificationState = state;
    this._onDidChangeInlineCompletionsUnificationState.fire();
  }
  $handleInlineCompletionSetCurrentModelId(handle, modelId) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.setCurrentModelId(modelId);
    }, void 0, void 0);
  }
  $handleInlineCompletionSetProviderOption(handle, optionId, valueId) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.setProviderOption(optionId, valueId);
    }, void 0, void 0);
  }
  // --- parameter hints
  registerSignatureHelpProvider(extension, selector, provider, metadataOrTriggerChars) {
    const metadata = Array.isArray(metadataOrTriggerChars) ? { triggerCharacters: metadataOrTriggerChars, retriggerCharacters: [] } : metadataOrTriggerChars;
    const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider), extension);
    this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector, extension), metadata);
    return this._createDisposable(handle);
  }
  $provideSignatureHelp(handle, resource, position, context, token) {
    return this._withAdapter(handle, SignatureHelpAdapter, (adapter) => adapter.provideSignatureHelp(URI.revive(resource), position, context, token), void 0, token);
  }
  $releaseSignatureHelp(handle, id) {
    this._withAdapter(handle, SignatureHelpAdapter, (adapter) => adapter.releaseSignatureHelp(id), void 0, void 0);
  }
  // --- inline hints
  registerInlayHintsProvider(extension, selector, provider) {
    const eventHandle = typeof provider.onDidChangeInlayHints === "function" ? this._nextHandle() : void 0;
    const handle = this._addNewAdapter(new InlayHintsAdapter(this._documents, this._commands.converter, provider, this._logService, extension), extension);
    this._proxy.$registerInlayHintsProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveInlayHint === "function", eventHandle, _ExtHostLanguageFeatures._extLabel(extension));
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeInlayHints((uri) => this._proxy.$emitInlayHintsEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideInlayHints(handle, resource, range, token) {
    return this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.provideInlayHints(URI.revive(resource), range, token), void 0, token);
  }
  $resolveInlayHint(handle, id, token) {
    return this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.resolveInlayHint(id, token), void 0, token);
  }
  $releaseInlayHints(handle, id) {
    this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.releaseHints(id), void 0, void 0);
  }
  // --- links
  registerDocumentLinkProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveDocumentLink === "function");
    return this._createDisposable(handle);
  }
  $provideDocumentLinks(handle, resource, token) {
    return this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.provideLinks(URI.revive(resource), token), void 0, token, resource.scheme === "output");
  }
  $resolveDocumentLink(handle, id, token) {
    return this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.resolveLink(id, token), void 0, void 0, true);
  }
  $releaseDocumentLinks(handle, id) {
    this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.releaseLinks(id), void 0, void 0, true);
  }
  registerColorProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDocumentColors(handle, resource, token) {
    return this._withAdapter(handle, ColorProviderAdapter, (adapter) => adapter.provideColors(URI.revive(resource), token), [], token);
  }
  $provideColorPresentations(handle, resource, colorInfo, token) {
    return this._withAdapter(handle, ColorProviderAdapter, (adapter) => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token), void 0, token);
  }
  registerFoldingRangeProvider(extension, selector, provider) {
    const handle = this._nextHandle();
    const eventHandle = typeof provider.onDidChangeFoldingRanges === "function" ? this._nextHandle() : void 0;
    this._adapter.set(handle, new AdapterData(new FoldingProviderAdapter(this._documents, provider), extension));
    this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector, extension), extension.identifier, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeFoldingRanges(() => this._proxy.$emitFoldingRangeEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideFoldingRanges(handle, resource, context, token) {
    return this._withAdapter(
      handle,
      FoldingProviderAdapter,
      (adapter) => adapter.provideFoldingRanges(URI.revive(resource), context, token),
      void 0,
      token
    );
  }
  // --- smart select
  registerSelectionRangeProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new SelectionRangeAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerSelectionRangeProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideSelectionRanges(handle, resource, positions, token) {
    return this._withAdapter(handle, SelectionRangeAdapter, (adapter) => adapter.provideSelectionRanges(URI.revive(resource), positions, token), [], token);
  }
  // --- call hierarchy
  registerCallHierarchyProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new CallHierarchyAdapter(this._documents, provider), extension);
    this._proxy.$registerCallHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $prepareCallHierarchy(handle, resource, position, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), void 0, token);
  }
  $provideCallHierarchyIncomingCalls(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => adapter.provideCallsTo(sessionId, itemId, token), void 0, token);
  }
  $provideCallHierarchyOutgoingCalls(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => adapter.provideCallsFrom(sessionId, itemId, token), void 0, token);
  }
  $releaseCallHierarchy(handle, sessionId) {
    this._withAdapter(handle, CallHierarchyAdapter, (adapter) => Promise.resolve(adapter.releaseSession(sessionId)), void 0, void 0);
  }
  // --- type hierarchy
  registerTypeHierarchyProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new TypeHierarchyAdapter(this._documents, provider), extension);
    this._proxy.$registerTypeHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $prepareTypeHierarchy(handle, resource, position, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), void 0, token);
  }
  $provideTypeHierarchySupertypes(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => adapter.provideSupertypes(sessionId, itemId, token), void 0, token);
  }
  $provideTypeHierarchySubtypes(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => adapter.provideSubtypes(sessionId, itemId, token), void 0, token);
  }
  $releaseTypeHierarchy(handle, sessionId) {
    this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => Promise.resolve(adapter.releaseSession(sessionId)), void 0, void 0);
  }
  // --- Document on drop
  registerDocumentOnDropEditProvider(extension, selector, provider, metadata) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(new DocumentDropEditAdapter(this._proxy, this._documents, provider, handle, extension), extension));
    this._proxy.$registerDocumentOnDropEditProvider(handle, this._transformDocumentSelector(selector, extension), metadata ? {
      supportsResolve: !!provider.resolveDocumentDropEdit,
      dropMimeTypes: metadata.dropMimeTypes,
      providedDropKinds: metadata.providedDropEditKinds?.map((x) => x.value)
    } : void 0);
    return this._createDisposable(handle);
  }
  $provideDocumentOnDropEdits(handle, requestId, resource, position, dataTransferDto, token) {
    return this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => Promise.resolve(adapter.provideDocumentOnDropEdits(requestId, URI.revive(resource), position, dataTransferDto, token)), void 0, void 0);
  }
  $resolveDropEdit(handle, id, token) {
    return this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => adapter.resolveDropEdit(id, token), {}, void 0);
  }
  $releaseDocumentOnDropEdits(handle, cacheId) {
    this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => Promise.resolve(adapter.releaseDropEdits(cacheId)), void 0, void 0);
  }
  // --- copy/paste actions
  registerDocumentPasteEditProvider(extension, selector, provider, metadata) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(new DocumentPasteEditProvider(this._proxy, this._documents, provider, handle, extension), extension));
    this._proxy.$registerPasteEditProvider(handle, this._transformDocumentSelector(selector, extension), {
      supportsCopy: !!provider.prepareDocumentPaste,
      supportsPaste: !!provider.provideDocumentPasteEdits,
      supportsResolve: !!provider.resolveDocumentPasteEdit,
      providedPasteEditKinds: metadata.providedPasteEditKinds?.map((x) => x.value),
      copyMimeTypes: metadata.copyMimeTypes,
      pasteMimeTypes: metadata.pasteMimeTypes
    });
    return this._createDisposable(handle);
  }
  $prepareDocumentPaste(handle, resource, ranges, dataTransfer, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.prepareDocumentPaste(URI.revive(resource), ranges, dataTransfer, token), void 0, token);
  }
  $providePasteEdits(handle, requestId, resource, ranges, dataTransferDto, context, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.providePasteEdits(requestId, URI.revive(resource), ranges, dataTransferDto, context, token), void 0, token);
  }
  $resolvePasteEdit(handle, id, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.resolvePasteEdit(id, token), {}, void 0);
  }
  $releasePasteEdits(handle, cacheId) {
    this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => Promise.resolve(adapter.releasePasteEdits(cacheId)), void 0, void 0);
  }
  // --- configuration
  static _serializeRegExp(regExp) {
    return {
      pattern: regExp.source,
      flags: regExp.flags
    };
  }
  static _serializeIndentationRule(indentationRule) {
    return {
      decreaseIndentPattern: _ExtHostLanguageFeatures._serializeRegExp(indentationRule.decreaseIndentPattern),
      increaseIndentPattern: _ExtHostLanguageFeatures._serializeRegExp(indentationRule.increaseIndentPattern),
      indentNextLinePattern: indentationRule.indentNextLinePattern ? _ExtHostLanguageFeatures._serializeRegExp(indentationRule.indentNextLinePattern) : void 0,
      unIndentedLinePattern: indentationRule.unIndentedLinePattern ? _ExtHostLanguageFeatures._serializeRegExp(indentationRule.unIndentedLinePattern) : void 0
    };
  }
  static _serializeOnEnterRule(onEnterRule) {
    return {
      beforeText: _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.beforeText),
      afterText: onEnterRule.afterText ? _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.afterText) : void 0,
      previousLineText: onEnterRule.previousLineText ? _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.previousLineText) : void 0,
      action: onEnterRule.action
    };
  }
  static _serializeOnEnterRules(onEnterRules) {
    return onEnterRules.map(_ExtHostLanguageFeatures._serializeOnEnterRule);
  }
  static _serializeAutoClosingPair(autoClosingPair) {
    return {
      open: autoClosingPair.open,
      close: autoClosingPair.close,
      notIn: autoClosingPair.notIn ? autoClosingPair.notIn.map((v) => SyntaxTokenType.toString(v)) : void 0
    };
  }
  static _serializeAutoClosingPairs(autoClosingPairs) {
    return autoClosingPairs.map(_ExtHostLanguageFeatures._serializeAutoClosingPair);
  }
  setLanguageConfiguration(extension, languageId, configuration) {
    const { wordPattern } = configuration;
    if (wordPattern && regExpLeadsToEndlessLoop(wordPattern)) {
      throw new Error(`Invalid language configuration: wordPattern '${wordPattern}' is not allowed to match the empty string.`);
    }
    if (wordPattern) {
      this._documents.setWordDefinitionFor(languageId, wordPattern);
    } else {
      this._documents.setWordDefinitionFor(languageId, void 0);
    }
    if (configuration.__electricCharacterSupport) {
      this._apiDeprecation.report(
        "LanguageConfiguration.__electricCharacterSupport",
        extension,
        `Do not use.`
      );
    }
    if (configuration.__characterPairSupport) {
      this._apiDeprecation.report(
        "LanguageConfiguration.__characterPairSupport",
        extension,
        `Do not use.`
      );
    }
    const handle = this._nextHandle();
    const serializedConfiguration = {
      comments: configuration.comments,
      brackets: configuration.brackets,
      wordPattern: configuration.wordPattern ? _ExtHostLanguageFeatures._serializeRegExp(configuration.wordPattern) : void 0,
      indentationRules: configuration.indentationRules ? _ExtHostLanguageFeatures._serializeIndentationRule(configuration.indentationRules) : void 0,
      onEnterRules: configuration.onEnterRules ? _ExtHostLanguageFeatures._serializeOnEnterRules(configuration.onEnterRules) : void 0,
      __electricCharacterSupport: configuration.__electricCharacterSupport,
      __characterPairSupport: configuration.__characterPairSupport,
      autoClosingPairs: configuration.autoClosingPairs ? _ExtHostLanguageFeatures._serializeAutoClosingPairs(configuration.autoClosingPairs) : void 0
    };
    this._proxy.$setLanguageConfiguration(handle, languageId, serializedConfiguration);
    return this._createDisposable(handle);
  }
  $setWordDefinitions(wordDefinitions) {
    for (const wordDefinition of wordDefinitions) {
      this._documents.setWordDefinitionFor(wordDefinition.languageId, new RegExp(wordDefinition.regexSource, wordDefinition.regexFlags));
    }
  }
};
_ExtHostLanguageFeatures._handlePool = 0;
let ExtHostLanguageFeatures = _ExtHostLanguageFeatures;
export {
  ExtHostLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGFzQXJyYXksIGNvYWxlc2NlLCBpc0ZhbHN5T3JFbXB0eSwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE5vdEltcGxlbWVudGVkRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSWRHZW5lcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pZEdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUgYXMgQ29yZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBtaXhpbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IHJlZ0V4cExlYWRzVG9FbmRsZXNzTG9vcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSwgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpSXBjLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIGFzIEVkaXRvclJhbmdlLCBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiwgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGVuY29kZVNlbWFudGljVG9rZW5zRHRvIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc0R0by5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENhY2hlIH0gZnJvbSAnLi9jYWNoZS5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0UHJvdG9jb2wgZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzQ29udmVydGVyLCBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhZ25vc3RpY3MgfSBmcm9tICcuL2V4dEhvc3REaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZWxlbWV0cnksIElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb24sIENvZGVBY3Rpb25LaW5kLCBDb21wbGV0aW9uTGlzdCwgRGF0YVRyYW5zZmVyLCBEaXNwb3NhYmxlLCBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQsIERvY3VtZW50U3ltYm9sLCBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIEludGVybmFsRGF0YVRyYW5zZmVySXRlbSwgTG9jYXRpb24sIE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgUmFuZ2UsIFNlbWFudGljVG9rZW5zLCBTZW1hbnRpY1Rva2Vuc0VkaXQsIFNlbWFudGljVG9rZW5zRWRpdHMsIFNuaXBwZXRTdHJpbmcsIFN5bWJvbEluZm9ybWF0aW9uLCBTeW50YXhUb2tlblR5cGUgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zL2NvbW1vbi9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uLmpzJztcblxuLy8gLS0tIGFkYXB0ZXJcblxuY2xhc3MgRG9jdW1lbnRTeW1ib2xBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50U3ltYm9scyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFN5bWJvbHMoZG9jLCB0b2tlbik7XG5cdFx0aWYgKGlzRmFsc3lPckVtcHR5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHZhbHVlIVswXSBpbnN0YW5jZW9mIERvY3VtZW50U3ltYm9sKSB7XG5cdFx0XHRyZXR1cm4gKDxEb2N1bWVudFN5bWJvbFtdPnZhbHVlKS5tYXAodHlwZUNvbnZlcnQuRG9jdW1lbnRTeW1ib2wuZnJvbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBEb2N1bWVudFN5bWJvbEFkYXB0ZXIuX2FzRG9jdW1lbnRTeW1ib2xUcmVlKDxTeW1ib2xJbmZvcm1hdGlvbltdPnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYXNEb2N1bWVudFN5bWJvbFRyZWUoaW5mb3M6IFN5bWJvbEluZm9ybWF0aW9uW10pOiBsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2xbXSB7XG5cdFx0Ly8gZmlyc3Qgc29ydCBieSBzdGFydCAoYW5kIGVuZCkgYW5kIHRoZW4gbG9vcCBvdmVyIGFsbCBlbGVtZW50c1xuXHRcdC8vIGFuZCBidWlsZCBhIHRyZWUgYmFzZWQgb24gY29udGFpbm1lbnQuXG5cdFx0aW5mb3MgPSBpbmZvcy5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRsZXQgcmVzID0gYS5sb2NhdGlvbi5yYW5nZS5zdGFydC5jb21wYXJlVG8oYi5sb2NhdGlvbi5yYW5nZS5zdGFydCk7XG5cdFx0XHRpZiAocmVzID09PSAwKSB7XG5cdFx0XHRcdHJlcyA9IGIubG9jYXRpb24ucmFuZ2UuZW5kLmNvbXBhcmVUbyhhLmxvY2F0aW9uLnJhbmdlLmVuZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHJlczogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sW10gPSBbXTtcblx0XHRjb25zdCBwYXJlbnRTdGFjazogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluZm8gb2YgaW5mb3MpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQ6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbCA9IHtcblx0XHRcdFx0bmFtZTogaW5mby5uYW1lIHx8ICchIU1JU1NJTkc6IG5hbWUhIScsXG5cdFx0XHRcdGtpbmQ6IHR5cGVDb252ZXJ0LlN5bWJvbEtpbmQuZnJvbShpbmZvLmtpbmQpLFxuXHRcdFx0XHR0YWdzOiBpbmZvLnRhZ3M/Lm1hcCh0eXBlQ29udmVydC5TeW1ib2xUYWcuZnJvbSkgfHwgW10sXG5cdFx0XHRcdGRldGFpbDogJycsXG5cdFx0XHRcdGNvbnRhaW5lck5hbWU6IGluZm8uY29udGFpbmVyTmFtZSxcblx0XHRcdFx0cmFuZ2U6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20oaW5mby5sb2NhdGlvbi5yYW5nZSksXG5cdFx0XHRcdHNlbGVjdGlvblJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGluZm8ubG9jYXRpb24ucmFuZ2UpLFxuXHRcdFx0XHRjaGlsZHJlbjogW11cblx0XHRcdH07XG5cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGlmIChwYXJlbnRTdGFjay5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRwYXJlbnRTdGFjay5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHJlcy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBhcmVudCA9IHBhcmVudFN0YWNrW3BhcmVudFN0YWNrLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAoRWRpdG9yUmFuZ2UuY29udGFpbnNSYW5nZShwYXJlbnQucmFuZ2UsIGVsZW1lbnQucmFuZ2UpICYmICFFZGl0b3JSYW5nZS5lcXVhbHNSYW5nZShwYXJlbnQucmFuZ2UsIGVsZW1lbnQucmFuZ2UpKSB7XG5cdFx0XHRcdFx0cGFyZW50LmNoaWxkcmVuPy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHBhcmVudFN0YWNrLnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFyZW50U3RhY2sucG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXM7XG5cdH1cbn1cblxuY2xhc3MgQ29kZUxlbnNBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuQ29kZUxlbnM+KCdDb2RlTGVucycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkNvZGVMZW5zUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0VGVsZW1ldHJ5OiBFeHRIb3N0VGVsZW1ldHJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVDb2RlTGVuc2VzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDb2RlTGVuc0xpc3REdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgbGVuc2VzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNvZGVMZW5zZXMoZG9jLCB0b2tlbik7XG5cdFx0aWYgKCFsZW5zZXMgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLl9jYWNoZS5hZGQobGVuc2VzKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5zZXQoY2FjaGVJZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJlc3VsdDogZXh0SG9zdFByb3RvY29sLklDb2RlTGVuc0xpc3REdG8gPSB7XG5cdFx0XHRjYWNoZUlkLFxuXHRcdFx0bGVuc2VzOiBbXSxcblx0XHR9O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuc2VzLmxlbmd0aDsgaSsrKSB7XG5cblx0XHRcdGlmICghUmFuZ2UuaXNSYW5nZShsZW5zZXNbaV0ucmFuZ2UpKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignSU5WQUxJRCBjb2RlIGxlbnMsIHJhbmdlIGlzIG5vdCBkZWZpbmVkJywgdGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LmxlbnNlcy5wdXNoKHtcblx0XHRcdFx0Y2FjaGVJZDogW2NhY2hlSWQsIGldLFxuXHRcdFx0XHRyYW5nZTogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShsZW5zZXNbaV0ucmFuZ2UpLFxuXHRcdFx0XHRjb21tYW5kOiB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGxlbnNlc1tpXS5jb21tYW5kLCBkaXNwb3NhYmxlcylcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNvZGVMZW5zKHN5bWJvbDogZXh0SG9zdFByb3RvY29sLklDb2RlTGVuc0R0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUNvZGVMZW5zRHRvIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBsZW5zID0gc3ltYm9sLmNhY2hlSWQgJiYgdGhpcy5fY2FjaGUuZ2V0KC4uLnN5bWJvbC5jYWNoZUlkKTtcblx0XHRpZiAoIWxlbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVkTGVuczogdnNjb2RlLkNvZGVMZW5zIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVDb2RlTGVucyAhPT0gJ2Z1bmN0aW9uJyB8fCBsZW5zLmlzUmVzb2x2ZWQpIHtcblx0XHRcdHJlc29sdmVkTGVucyA9IGxlbnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkTGVucyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVDb2RlTGVucyhsZW5zLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICghcmVzb2x2ZWRMZW5zKSB7XG5cdFx0XHRyZXNvbHZlZExlbnMgPSBsZW5zO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBzeW1ib2wuY2FjaGVJZCAmJiB0aGlzLl9kaXNwb3NhYmxlcy5nZXQoc3ltYm9sLmNhY2hlSWRbMF0pO1xuXHRcdGlmICghZGlzcG9zYWJsZXMpIHtcblx0XHRcdC8vIGRpc3Bvc2VkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc29sdmVkTGVucy5jb21tYW5kKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcignSU5WQUxJRCBjb2RlIGxlbnMgcmVzb2x2ZWQsIGxhY2tzIGNvbW1hbmQ6ICcgKyB0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHR0aGlzLl9leHRUZWxlbWV0cnkub25FeHRlbnNpb25FcnJvcih0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllciwgZXJyb3IpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHN5bWJvbC5jb21tYW5kID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChyZXNvbHZlZExlbnMuY29tbWFuZCwgZGlzcG9zYWJsZXMpO1xuXHRcdHJldHVybiBzeW1ib2w7XG5cdH1cblxuXHRyZWxlYXNlQ29kZUxlbnNlcyhjYWNoZWRJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGNhY2hlZElkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRlbGV0ZShjYWNoZWRJZCk7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGNhY2hlZElkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb252ZXJ0VG9Mb2NhdGlvbkxpbmtzKHZhbHVlOiB2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25bXSB8IHZzY29kZS5Mb2NhdGlvbkxpbmtbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10ge1xuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZXR1cm4gKDxhbnk+dmFsdWUpLm1hcCh0eXBlQ29udmVydC5EZWZpbml0aW9uTGluay5mcm9tKTtcblx0fSBlbHNlIGlmICh2YWx1ZSkge1xuXHRcdHJldHVybiBbdHlwZUNvbnZlcnQuRGVmaW5pdGlvbkxpbmsuZnJvbSh2YWx1ZSldO1xuXHR9XG5cdHJldHVybiBbXTtcbn1cblxuY2xhc3MgRGVmaW5pdGlvbkFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEZWZpbml0aW9uKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRGVmaW5pdGlvbihkb2MsIHBvcywgdG9rZW4pO1xuXHRcdHJldHVybiBjb252ZXJ0VG9Mb2NhdGlvbkxpbmtzKHZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBEZWNsYXJhdGlvbkFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRGVjbGFyYXRpb24ocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEZWNsYXJhdGlvbihkb2MsIHBvcywgdG9rZW4pO1xuXHRcdHJldHVybiBjb252ZXJ0VG9Mb2NhdGlvbkxpbmtzKHZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBJbXBsZW1lbnRhdGlvbkFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkltcGxlbWVudGF0aW9uUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlSW1wbGVtZW50YXRpb24ocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVJbXBsZW1lbnRhdGlvbihkb2MsIHBvcywgdG9rZW4pO1xuXHRcdHJldHVybiBjb252ZXJ0VG9Mb2NhdGlvbkxpbmtzKHZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBUeXBlRGVmaW5pdGlvbkFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlVHlwZURlZmluaXRpb24ocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVUeXBlRGVmaW5pdGlvbihkb2MsIHBvcywgdG9rZW4pO1xuXHRcdHJldHVybiBjb252ZXJ0VG9Mb2NhdGlvbkxpbmtzKHZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBIb3ZlckFkYXB0ZXIge1xuXG5cdHByaXZhdGUgX2hvdmVyQ291bnRlcjogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfaG92ZXJNYXA6IE1hcDxudW1iZXIsIHZzY29kZS5Ib3Zlcj4gPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLkhvdmVyPigpO1xuXG5cdHByaXZhdGUgc3RhdGljIEhPVkVSX01BUF9NQVhfU0laRSA9IDEwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkhvdmVyUHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUhvdmVyKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Ib3ZlckNvbnRleHQ8eyBpZDogbnVtYmVyIH0+IHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5Ib3ZlcldpdGhJZCB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRsZXQgdmFsdWU6IHZzY29kZS5Ib3ZlciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRleHQgJiYgY29udGV4dC52ZXJib3NpdHlSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0hvdmVySWQgPSBjb250ZXh0LnZlcmJvc2l0eVJlcXVlc3QucHJldmlvdXNIb3Zlci5pZDtcblx0XHRcdGNvbnN0IHByZXZpb3VzSG92ZXIgPSB0aGlzLl9ob3Zlck1hcC5nZXQocHJldmlvdXNIb3ZlcklkKTtcblx0XHRcdGlmICghcHJldmlvdXNIb3Zlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEhvdmVyIHdpdGggaWQgJHtwcmV2aW91c0hvdmVySWR9IG5vdCBmb3VuZGApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaG92ZXJDb250ZXh0OiB2c2NvZGUuSG92ZXJDb250ZXh0ID0geyB2ZXJib3NpdHlEZWx0YTogY29udGV4dC52ZXJib3NpdHlSZXF1ZXN0LnZlcmJvc2l0eURlbHRhLCBwcmV2aW91c0hvdmVyIH07XG5cdFx0XHR2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVIb3Zlcihkb2MsIHBvcywgdG9rZW4sIGhvdmVyQ29udGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUhvdmVyKGRvYywgcG9zLCB0b2tlbik7XG5cdFx0fVxuXHRcdGlmICghdmFsdWUgfHwgaXNGYWxzeU9yRW1wdHkodmFsdWUuY29udGVudHMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXZhbHVlLnJhbmdlKSB7XG5cdFx0XHR2YWx1ZS5yYW5nZSA9IGRvYy5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKHBvcyk7XG5cdFx0fVxuXHRcdGlmICghdmFsdWUucmFuZ2UpIHtcblx0XHRcdHZhbHVlLnJhbmdlID0gbmV3IFJhbmdlKHBvcywgcG9zKTtcblx0XHR9XG5cdFx0Y29uc3QgY29udmVydGVkSG92ZXI6IGxhbmd1YWdlcy5Ib3ZlciA9IHR5cGVDb252ZXJ0LkhvdmVyLmZyb20odmFsdWUpO1xuXHRcdGNvbnN0IGlkID0gdGhpcy5faG92ZXJDb3VudGVyO1xuXHRcdC8vIENoZWNrIGlmIGhvdmVyIG1hcCBoYXMgbW9yZSB0aGFuIDEwIGVsZW1lbnRzIGFuZCBpZiB5ZXMsIHJlbW92ZSBvbGRlc3QgZnJvbSB0aGUgbWFwXG5cdFx0aWYgKHRoaXMuX2hvdmVyTWFwLnNpemUgPT09IEhvdmVyQWRhcHRlci5IT1ZFUl9NQVBfTUFYX1NJWkUpIHtcblx0XHRcdGNvbnN0IG1pbmltdW1JZCA9IE1hdGgubWluKC4uLnRoaXMuX2hvdmVyTWFwLmtleXMoKSk7XG5cdFx0XHR0aGlzLl9ob3Zlck1hcC5kZWxldGUobWluaW11bUlkKTtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXJNYXAuc2V0KGlkLCB2YWx1ZSk7XG5cdFx0dGhpcy5faG92ZXJDb3VudGVyICs9IDE7XG5cdFx0Y29uc3QgaG92ZXI6IGV4dEhvc3RQcm90b2NvbC5Ib3ZlcldpdGhJZCA9IHtcblx0XHRcdC4uLmNvbnZlcnRlZEhvdmVyLFxuXHRcdFx0aWRcblx0XHR9O1xuXHRcdHJldHVybiBob3Zlcjtcblx0fVxuXG5cdHJlbGVhc2VIb3ZlcihpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXJNYXAuZGVsZXRlKGlkKTtcblx0fVxufVxuXG5jbGFzcyBFdmFsdWF0YWJsZUV4cHJlc3Npb25BZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5FdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlcixcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRXZhbHVhdGFibGVFeHByZXNzaW9uKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVFdmFsdWF0YWJsZUV4cHJlc3Npb24oZG9jLCBwb3MsIHRva2VuKTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHJldHVybiB0eXBlQ29udmVydC5FdmFsdWF0YWJsZUV4cHJlc3Npb24uZnJvbSh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgSW5saW5lVmFsdWVzQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuSW5saW5lVmFsdWVzUHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUlubGluZVZhbHVlcyhyZXNvdXJjZTogVVJJLCB2aWV3UG9ydDogSVJhbmdlLCBjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSUlubGluZVZhbHVlQ29udGV4dER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuSW5saW5lVmFsdWVbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlSW5saW5lVmFsdWVzKGRvYywgdHlwZUNvbnZlcnQuUmFuZ2UudG8odmlld1BvcnQpLCB0eXBlQ29udmVydC5JbmxpbmVWYWx1ZUNvbnRleHQudG8oY29udGV4dCksIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoaXYgPT4gdHlwZUNvbnZlcnQuSW5saW5lVmFsdWUuZnJvbShpdikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIERvY3VtZW50SGlnaGxpZ2h0QWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoZG9jLCBwb3MsIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQuRG9jdW1lbnRIaWdobGlnaHQuZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTXVsdGlEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLk11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgb3RoZXJSZXNvdXJjZXM6IFVSSVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IG90aGVyRG9jdW1lbnRzID0gb3RoZXJSZXNvdXJjZXMubWFwKHIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdFcnJvcjogVW5hYmxlIHRvIHJldHJpZXZlIGRvY3VtZW50IGZyb20gVVJJOiAnICsgciArICcuIEVycm9yIG1lc3NhZ2U6ICcgKyBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pLmZpbHRlcihkb2MgPT4gZG9jICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHMoZG9jLCBwb3MsIG90aGVyRG9jdW1lbnRzLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0Lk11bHRpRG9jdW1lbnRIaWdobGlnaHQuZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTGlua2VkRWRpdGluZ1JhbmdlQWRhcHRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUxpbmtlZEVkaXRpbmdSYW5nZXMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTGlua2VkRWRpdGluZ1JhbmdlcyB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVMaW5rZWRFZGl0aW5nUmFuZ2VzKGRvYywgcG9zLCB0b2tlbik7XG5cdFx0aWYgKHZhbHVlICYmIEFycmF5LmlzQXJyYXkodmFsdWUucmFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2VzOiBjb2FsZXNjZSh2YWx1ZS5yYW5nZXMubWFwKHR5cGVDb252ZXJ0LlJhbmdlLmZyb20pKSxcblx0XHRcdFx0d29yZFBhdHRlcm46IHZhbHVlLndvcmRQYXR0ZXJuXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFJlZmVyZW5jZUFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLlJlZmVyZW5jZVByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZVJlZmVyZW5jZXMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLlJlZmVyZW5jZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVJlZmVyZW5jZXMoZG9jLCBwb3MsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQubG9jYXRpb24uZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDdXN0b21Db2RlQWN0aW9uIGV4dGVuZHMgZXh0SG9zdFByb3RvY29sLklDb2RlQWN0aW9uRHRvIHtcblx0X2lzU3ludGhldGljPzogYm9vbGVhbjtcbn1cblxuY2xhc3MgQ29kZUFjdGlvbkFkYXB0ZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfbWF4Q29kZUFjdGlvbnNQZXJGaWxlOiBudW1iZXIgPSAxMDAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IENhY2hlPHZzY29kZS5Db2RlQWN0aW9uIHwgdnNjb2RlLkNvbW1hbmQ+KCdDb2RlQWN0aW9uJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IE1hcDxudW1iZXIsIERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHM6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpYWdub3N0aWNzOiBFeHRIb3N0RGlhZ25vc3RpY3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBpRGVwcmVjYXRpb246IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVDb2RlQWN0aW9ucyhyZXNvdXJjZTogVVJJLCByYW5nZU9yU2VsZWN0aW9uOiBJUmFuZ2UgfCBJU2VsZWN0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDb2RlQWN0aW9uTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCByYW4gPSBTZWxlY3Rpb24uaXNJU2VsZWN0aW9uKHJhbmdlT3JTZWxlY3Rpb24pXG5cdFx0XHQ/IDx2c2NvZGUuU2VsZWN0aW9uPnR5cGVDb252ZXJ0LlNlbGVjdGlvbi50byhyYW5nZU9yU2VsZWN0aW9uKVxuXHRcdFx0OiA8dnNjb2RlLlJhbmdlPnR5cGVDb252ZXJ0LlJhbmdlLnRvKHJhbmdlT3JTZWxlY3Rpb24pO1xuXHRcdGNvbnN0IGFsbERpYWdub3N0aWNzOiB2c2NvZGUuRGlhZ25vc3RpY1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGRpYWdub3N0aWMgb2YgdGhpcy5fZGlhZ25vc3RpY3MuZ2V0RGlhZ25vc3RpY3MocmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAocmFuLmludGVyc2VjdGlvbihkaWFnbm9zdGljLnJhbmdlKSkge1xuXHRcdFx0XHRjb25zdCBuZXdMZW4gPSBhbGxEaWFnbm9zdGljcy5wdXNoKGRpYWdub3N0aWMpO1xuXHRcdFx0XHRpZiAobmV3TGVuID4gQ29kZUFjdGlvbkFkYXB0ZXIuX21heENvZGVBY3Rpb25zUGVyRmlsZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZUFjdGlvbkNvbnRleHQ6IHZzY29kZS5Db2RlQWN0aW9uQ29udGV4dCA9IHtcblx0XHRcdGRpYWdub3N0aWNzOiBhbGxEaWFnbm9zdGljcyxcblx0XHRcdG9ubHk6IGNvbnRleHQub25seSA/IG5ldyBDb2RlQWN0aW9uS2luZChjb250ZXh0Lm9ubHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IHR5cGVDb252ZXJ0LkNvZGVBY3Rpb25UcmlnZ2VyS2luZC50byhjb250ZXh0LnRyaWdnZXIpLFxuXHRcdH07XG5cblx0XHRjb25zdCBjb21tYW5kc09yQWN0aW9ucyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVDb2RlQWN0aW9ucyhkb2MsIHJhbiwgY29kZUFjdGlvbkNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAoIWlzTm9uRW1wdHlBcnJheShjb21tYW5kc09yQWN0aW9ucykgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVJZCA9IHRoaXMuX2NhY2hlLmFkZChjb21tYW5kc09yQWN0aW9ucyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuc2V0KGNhY2hlSWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBhY3Rpb25zOiBDdXN0b21Db2RlQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvbW1hbmRzT3JBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBjb21tYW5kc09yQWN0aW9uc1tpXTtcblx0XHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoQ29kZUFjdGlvbkFkYXB0ZXIuX2lzQ29tbWFuZChjYW5kaWRhdGUpICYmICEoY2FuZGlkYXRlIGluc3RhbmNlb2YgQ29kZUFjdGlvbikpIHtcblx0XHRcdFx0Ly8gb2xkIHNjaG9vbDogc3ludGhldGljIGNvZGUgYWN0aW9uXG5cdFx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnQ29kZUFjdGlvblByb3ZpZGVyLnByb3ZpZGVDb2RlQWN0aW9ucyAtIHJldHVybiBjb21tYW5kcycsIHRoaXMuX2V4dGVuc2lvbixcblx0XHRcdFx0XHRgUmV0dXJuICdDb2RlQWN0aW9uJyBpbnN0YW5jZXMgaW5zdGVhZC5gKTtcblxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdF9pc1N5bnRoZXRpYzogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogY2FuZGlkYXRlLnRpdGxlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHRoaXMuX2NvbW1hbmRzLnRvSW50ZXJuYWwoY2FuZGlkYXRlLCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdG9Db252ZXJ0ID0gY2FuZGlkYXRlIGFzIHZzY29kZS5Db2RlQWN0aW9uO1xuXG5cdFx0XHRcdC8vIG5ldyBzY2hvb2w6IGNvbnZlcnQgY29kZSBhY3Rpb25cblx0XHRcdFx0aWYgKGNvZGVBY3Rpb25Db250ZXh0Lm9ubHkpIHtcblx0XHRcdFx0XHRpZiAoIXRvQ29udmVydC5raW5kKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9IC0gQ29kZSBhY3Rpb25zIG9mIGtpbmQgJyR7Y29kZUFjdGlvbkNvbnRleHQub25seS52YWx1ZX0nIHJlcXVlc3RlZCBidXQgcmV0dXJuZWQgY29kZSBhY3Rpb24gZG9lcyBub3QgaGF2ZSBhICdraW5kJy4gQ29kZSBhY3Rpb24gd2lsbCBiZSBkcm9wcGVkLiBQbGVhc2Ugc2V0ICdDb2RlQWN0aW9uLmtpbmQnLmApO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWNvZGVBY3Rpb25Db250ZXh0Lm9ubHkuY29udGFpbnModG9Db252ZXJ0LmtpbmQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9IC0gQ29kZSBhY3Rpb25zIG9mIGtpbmQgJyR7Y29kZUFjdGlvbkNvbnRleHQub25seS52YWx1ZX0nIHJlcXVlc3RlZCBidXQgcmV0dXJuZWQgY29kZSBhY3Rpb24gaXMgb2Yga2luZCAnJHt0b0NvbnZlcnQua2luZC52YWx1ZX0nLiBDb2RlIGFjdGlvbiB3aWxsIGJlIGRyb3BwZWQuIFBsZWFzZSBjaGVjayAnQ29kZUFjdGlvbkNvbnRleHQub25seScgdG8gb25seSByZXR1cm4gcmVxdWVzdGVkIGNvZGUgYWN0aW9ucy5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFbnN1cmVzIHRoYXQgdGhpcyBpcyBlaXRoZXIgYSBSYW5nZVtdIG9yIGFuIGVtcHR5IGFycmF5IHNvIHdlIGRvbid0IGdldCBBcnJheTxSYW5nZSB8IHVuZGVmaW5lZD5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0b0NvbnZlcnQucmFuZ2VzID8/IFtdO1xuXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0Y2FjaGVJZDogW2NhY2hlSWQsIGldLFxuXHRcdFx0XHRcdHRpdGxlOiB0b0NvbnZlcnQudGl0bGUsXG5cdFx0XHRcdFx0Y29tbWFuZDogdG9Db252ZXJ0LmNvbW1hbmQgJiYgdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbCh0b0NvbnZlcnQuY29tbWFuZCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdGRpYWdub3N0aWNzOiB0b0NvbnZlcnQuZGlhZ25vc3RpY3MgJiYgdG9Db252ZXJ0LmRpYWdub3N0aWNzLm1hcCh0eXBlQ29udmVydC5EaWFnbm9zdGljLmZyb20pLFxuXHRcdFx0XHRcdGVkaXQ6IHRvQ29udmVydC5lZGl0ICYmIHR5cGVDb252ZXJ0LldvcmtzcGFjZUVkaXQuZnJvbSh0b0NvbnZlcnQuZWRpdCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRraW5kOiB0b0NvbnZlcnQua2luZCAmJiB0b0NvbnZlcnQua2luZC52YWx1ZSxcblx0XHRcdFx0XHRpc1ByZWZlcnJlZDogdG9Db252ZXJ0LmlzUHJlZmVycmVkLFxuXHRcdFx0XHRcdGlzQUk6IGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2NvZGVBY3Rpb25BSScpID8gdG9Db252ZXJ0LmlzQUkgOiBmYWxzZSxcblx0XHRcdFx0XHRyYW5nZXM6IGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2NvZGVBY3Rpb25SYW5nZXMnKSA/IGNvYWxlc2NlKHJhbmdlLm1hcCh0eXBlQ29udmVydC5SYW5nZS5mcm9tKSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHRvQ29udmVydC5kaXNhYmxlZD8ucmVhc29uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBjYWNoZUlkLCBhY3Rpb25zIH07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29kZUFjdGlvbihpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgZWRpdD86IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0bzsgY29tbWFuZD86IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byB9PiB7XG5cdFx0Y29uc3QgW3Nlc3Npb25JZCwgaXRlbUlkXSA9IGlkO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSB8fCBDb2RlQWN0aW9uQWRhcHRlci5faXNDb21tYW5kKGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4ge307IC8vIGNvZGUgYWN0aW9ucyBvbmx5IVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyLnJlc29sdmVDb2RlQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge307IC8vIHRoaXMgc2hvdWxkIG5vdCBoYXBwZW4uLi5cblx0XHR9XG5cblxuXHRcdGNvbnN0IHJlc29sdmVkSXRlbSA9IChhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ29kZUFjdGlvbihpdGVtLCB0b2tlbikpID8/IGl0ZW07XG5cblx0XHRsZXQgcmVzb2x2ZWRFZGl0OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlc29sdmVkSXRlbS5lZGl0KSB7XG5cdFx0XHRyZXNvbHZlZEVkaXQgPSB0eXBlQ29udmVydC5Xb3Jrc3BhY2VFZGl0LmZyb20ocmVzb2x2ZWRJdGVtLmVkaXQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVkQ29tbWFuZDogZXh0SG9zdFByb3RvY29sLklDb21tYW5kRHRvIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXNvbHZlZEl0ZW0uY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9kaXNwb3NhYmxlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRyZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKHJlc29sdmVkSXRlbS5jb21tYW5kLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZWRpdDogcmVzb2x2ZWRFZGl0LCBjb21tYW5kOiByZXNvbHZlZENvbW1hbmQgfTtcblx0fVxuXG5cdHJlbGVhc2VDb2RlQWN0aW9ucyhjYWNoZWRJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGNhY2hlZElkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRlbGV0ZShjYWNoZWRJZCk7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGNhY2hlZElkKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0NvbW1hbmQodGhpbmc6IGFueSk6IHRoaW5nIGlzIHZzY29kZS5Db21tYW5kIHtcblx0XHRyZXR1cm4gdHlwZW9mICg8dnNjb2RlLkNvbW1hbmQ+dGhpbmcpLmNvbW1hbmQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiAoPHZzY29kZS5Db21tYW5kPnRoaW5nKS50aXRsZSA9PT0gJ3N0cmluZyc7XG5cdH1cbn1cblxuY2xhc3MgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBfY2FjaGVkUHJlcGFyZT86IE1hcDxzdHJpbmcsIHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0c0NhY2hlID0gbmV3IENhY2hlPHZzY29kZS5Eb2N1bWVudFBhc3RlRWRpdD4oJ0RvY3VtZW50UGFzdGVFZGl0LmVkaXRzJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlc1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZURvY3VtZW50UGFzdGUocmVzb3VyY2U6IFVSSSwgcmFuZ2VzOiBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyRHRvOiBleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyLnByZXBhcmVEb2N1bWVudFBhc3RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2FjaGVkUHJlcGFyZSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdnNjb2RlUmFuZ2VzID0gcmFuZ2VzLm1hcChyYW5nZSA9PiB0eXBlQ29udmVydC5SYW5nZS50byhyYW5nZSkpO1xuXG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVyLnRvRGF0YVRyYW5zZmVyKGRhdGFUcmFuc2ZlckR0bywgKCkgPT4ge1xuXHRcdFx0dGhyb3cgbmV3IE5vdEltcGxlbWVudGVkRXJyb3IoKTtcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9wcm92aWRlci5wcmVwYXJlRG9jdW1lbnRQYXN0ZShkb2MsIHZzY29kZVJhbmdlcywgZGF0YVRyYW5zZmVyLCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBzZW5kIGJhY2sgdmFsdWVzIHRoYXQgaGF2ZSBiZWVuIGFkZGVkIHRvIHRoZSBkYXRhIHRyYW5zZmVyXG5cdFx0Y29uc3QgbmV3RW50cmllcyA9IEFycmF5LmZyb20oZGF0YVRyYW5zZmVyKS5maWx0ZXIoKFssIHZhbHVlXSkgPT4gISh2YWx1ZSBpbnN0YW5jZW9mIEludGVybmFsRGF0YVRyYW5zZmVySXRlbSkpO1xuXG5cdFx0Ly8gU3RvcmUgb2ZmIG9yaWdpbmFsIGRhdGEgdHJhbnNmZXIgaXRlbXMgc28gd2UgY2FuIHJldHJpZXZlIHRoZW0gb24gcGFzdGVcblx0XHRjb25zdCBuZXdDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbT4oKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbShuZXdFbnRyaWVzLCBhc3luYyAoW21pbWUsIHZhbHVlXSkgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdG5ld0NhY2hlLnNldChpZCwgdmFsdWUpO1xuXHRcdFx0cmV0dXJuIFttaW1lLCBhd2FpdCB0eXBlQ29udmVydC5EYXRhVHJhbnNmZXJJdGVtLmZyb20obWltZSwgdmFsdWUsIGlkKV0gYXMgY29uc3Q7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY2FjaGVkUHJlcGFyZSA9IG5ld0NhY2hlO1xuXG5cdFx0cmV0dXJuIHsgaXRlbXMgfTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVQYXN0ZUVkaXRzKHJlcXVlc3RJZDogbnVtYmVyLCByZXNvdXJjZTogVVJJLCByYW5nZXM6IElSYW5nZVtdLCBkYXRhVHJhbnNmZXJEdG86IGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8sIGNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnRQYXN0ZUNvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklQYXN0ZUVkaXREdG9bXT4ge1xuXHRcdGlmICghdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UGFzdGVFZGl0cykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdnNjb2RlUmFuZ2VzID0gcmFuZ2VzLm1hcChyYW5nZSA9PiB0eXBlQ29udmVydC5SYW5nZS50byhyYW5nZSkpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBkYXRhVHJhbnNmZXJEdG8uaXRlbXMubWFwKChbbWltZSwgdmFsdWVdKTogW3N0cmluZywgdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW1dID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX2NhY2hlZFByZXBhcmU/LmdldCh2YWx1ZS5pZCk7XG5cdFx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRcdHJldHVybiBbbWltZSwgY2FjaGVkXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bWltZSxcblx0XHRcdFx0dHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVySXRlbS50byhtaW1lLCB2YWx1ZSwgYXN5bmMgaWQgPT4ge1xuXHRcdFx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVQYXN0ZUZpbGVEYXRhKHRoaXMuX2hhbmRsZSwgcmVxdWVzdElkLCBpZCkpLmJ1ZmZlcjtcblx0XHRcdFx0fSlcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkYXRhVHJhbnNmZXIgPSBuZXcgRGF0YVRyYW5zZmVyKGl0ZW1zKTtcblxuXHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UGFzdGVFZGl0cyhkb2MsIHZzY29kZVJhbmdlcywgZGF0YVRyYW5zZmVyLCB7XG5cdFx0XHRvbmx5OiBjb250ZXh0Lm9ubHkgPyBuZXcgRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKGNvbnRleHQub25seSkgOiB1bmRlZmluZWQsXG5cdFx0XHR0cmlnZ2VyS2luZDogY29udGV4dC50cmlnZ2VyS2luZCxcblx0XHR9LCB0b2tlbik7XG5cdFx0aWYgKCFlZGl0cyB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLl9lZGl0c0NhY2hlLmFkZChlZGl0cyk7XG5cblx0XHRyZXR1cm4gZWRpdHMubWFwKChlZGl0LCBpKTogZXh0SG9zdFByb3RvY29sLklQYXN0ZUVkaXREdG8gPT4gKHtcblx0XHRcdF9jYWNoZUlkOiBbY2FjaGVJZCwgaV0sXG5cdFx0XHR0aXRsZTogZWRpdC50aXRsZSA/PyBsb2NhbGl6ZSgnZGVmYXVsdFBhc3RlTGFiZWwnLCBcIlBhc3RlIHVzaW5nICd7MH0nIGV4dGVuc2lvblwiLCB0aGlzLl9leHRlbnNpb24uZGlzcGxheU5hbWUgfHwgdGhpcy5fZXh0ZW5zaW9uLm5hbWUpLFxuXHRcdFx0a2luZDogZWRpdC5raW5kLFxuXHRcdFx0eWllbGRUbzogZWRpdC55aWVsZFRvPy5tYXAoeCA9PiB4LnZhbHVlKSxcblx0XHRcdGluc2VydFRleHQ6IHR5cGVvZiBlZGl0Lmluc2VydFRleHQgPT09ICdzdHJpbmcnID8gZWRpdC5pbnNlcnRUZXh0IDogeyBzbmlwcGV0OiBlZGl0Lmluc2VydFRleHQudmFsdWUgfSxcblx0XHRcdGFkZGl0aW9uYWxFZGl0OiBlZGl0LmFkZGl0aW9uYWxFZGl0ID8gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKGVkaXQuYWRkaXRpb25hbEVkaXQsIHVuZGVmaW5lZCkgOiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVBhc3RlRWRpdChpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgaW5zZXJ0VGV4dD86IHN0cmluZyB8IHZzY29kZS5TbmlwcGV0U3RyaW5nOyBhZGRpdGlvbmFsRWRpdD86IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byB9PiB7XG5cdFx0Y29uc3QgW3Nlc3Npb25JZCwgaXRlbUlkXSA9IGlkO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9lZGl0c0NhY2hlLmdldChzZXNzaW9uSWQsIGl0ZW1JZCk7XG5cdFx0aWYgKCFpdGVtIHx8ICF0aGlzLl9wcm92aWRlci5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQpIHtcblx0XHRcdHJldHVybiB7fTsgLy8gdGhpcyBzaG91bGQgbm90IGhhcHBlbi4uLlxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkSXRlbSA9IChhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQoaXRlbSwgdG9rZW4pKSA/PyBpdGVtO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnNlcnRUZXh0OiByZXNvbHZlZEl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdGFkZGl0aW9uYWxFZGl0OiByZXNvbHZlZEl0ZW0uYWRkaXRpb25hbEVkaXQgPyB0eXBlQ29udmVydC5Xb3Jrc3BhY2VFZGl0LmZyb20ocmVzb2x2ZWRJdGVtLmFkZGl0aW9uYWxFZGl0LCB1bmRlZmluZWQpIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHJlbGVhc2VQYXN0ZUVkaXRzKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2VkaXRzQ2FjaGUuZGVsZXRlKGlkKTtcblx0fVxufVxuXG5jbGFzcyBEb2N1bWVudEZvcm1hdHRpbmdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhkb2N1bWVudCwgPGFueT5vcHRpb25zLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LlRleHRFZGl0LmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFJhbmdlRm9ybWF0dGluZ0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMocmVzb3VyY2U6IFVSSSwgcmFuZ2U6IElSYW5nZSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmFuID0gdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmFuZ2UpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhkb2N1bWVudCwgcmFuLCA8YW55Pm9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQuVGV4dEVkaXQuZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRSYW5nZXNGb3JtYXR0aW5nRWRpdHMocmVzb3VyY2U6IFVSSSwgcmFuZ2VzOiBJUmFuZ2VbXSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXNzZXJ0VHlwZSh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzID09PSAnZnVuY3Rpb24nLCAnSU5WQUxJRCBpbnZvY2F0aW9uIG9mIGBwcm92aWRlRG9jdW1lbnRSYW5nZXNGb3JtYXR0aW5nRWRpdHNgJyk7XG5cblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgX3JhbmdlcyA9IDxSYW5nZVtdPnJhbmdlcy5tYXAodHlwZUNvbnZlcnQuUmFuZ2UudG8pO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzKGRvY3VtZW50LCBfcmFuZ2VzLCA8YW55Pm9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQuVGV4dEVkaXQuZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgT25UeXBlRm9ybWF0dGluZ0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLk9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXJcblx0KSB7IH1cblxuXHRhdXRvRm9ybWF0VHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdID0gW107IC8vIG5vdCBoZXJlXG5cblx0YXN5bmMgcHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cyhyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjaDogc3RyaW5nLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMoZG9jdW1lbnQsIHBvcywgY2gsIDxhbnk+b3B0aW9ucywgdG9rZW4pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh0eXBlQ29udmVydC5UZXh0RWRpdC5mcm9tKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBOYXZpZ2F0ZVR5cGVBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb24+KCdXb3Jrc3BhY2VTeW1ib2xzJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKHNlYXJjaDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlU3ltYm9sc0R0bz4ge1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMoc2VhcmNoLCB0b2tlbik7XG5cblx0XHRpZiAoIWlzTm9uRW1wdHlBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB7IHN5bWJvbHM6IFtdIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2lkID0gdGhpcy5fY2FjaGUuYWRkKHZhbHVlKTtcblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlU3ltYm9sc0R0byA9IHtcblx0XHRcdGNhY2hlSWQ6IHNpZCxcblx0XHRcdHN5bWJvbHM6IFtdXG5cdFx0fTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB2YWx1ZVtpXTtcblx0XHRcdGlmICghaXRlbSB8fCAhaXRlbS5uYW1lKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignSU5WQUxJRCBTeW1ib2xJbmZvcm1hdGlvbicsIGl0ZW0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zeW1ib2xzLnB1c2goe1xuXHRcdFx0XHQuLi50eXBlQ29udmVydC5Xb3Jrc3BhY2VTeW1ib2wuZnJvbShpdGVtKSxcblx0XHRcdFx0Y2FjaGVJZDogW3NpZCwgaV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlV29ya3NwYWNlU3ltYm9sKHN5bWJvbDogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VTeW1ib2xEdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VTeW1ib2xEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2VTeW1ib2wgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBzeW1ib2w7XG5cdFx0fVxuXHRcdGlmICghc3ltYm9sLmNhY2hlSWQpIHtcblx0XHRcdHJldHVybiBzeW1ib2w7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoLi4uc3ltYm9sLmNhY2hlSWQpO1xuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2VTeW1ib2woaXRlbSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHZhbHVlICYmIG1peGluKHN5bWJvbCwgdHlwZUNvbnZlcnQuV29ya3NwYWNlU3ltYm9sLmZyb20odmFsdWUpLCB0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlbGVhc2VXb3Jrc3BhY2VTeW1ib2xzKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cbn1cblxuY2xhc3MgUmVuYW1lQWRhcHRlciB7XG5cblx0c3RhdGljIHN1cHBvcnRzUmVzb2x2aW5nKHByb3ZpZGVyOiB2c2NvZGUuUmVuYW1lUHJvdmlkZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHlwZW9mIHByb3ZpZGVyLnByZXBhcmVSZW5hbWUgPT09ICdmdW5jdGlvbic7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5SZW5hbWVQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVSZW5hbWVFZGl0cyhyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBuZXdOYW1lOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvICYgbGFuZ3VhZ2VzLlJlamVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlUmVuYW1lRWRpdHMoZG9jLCBwb3MsIG5ld05hbWUsIHRva2VuKTtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0eXBlQ29udmVydC5Xb3Jrc3BhY2VFZGl0LmZyb20odmFsdWUpO1xuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCByZWplY3RSZWFzb24gPSBSZW5hbWVBZGFwdGVyLl9hc01lc3NhZ2UoZXJyKTtcblx0XHRcdGlmIChyZWplY3RSZWFzb24pIHtcblx0XHRcdFx0cmV0dXJuIHsgcmVqZWN0UmVhc29uLCBlZGl0czogdW5kZWZpbmVkISB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZ2VuZXJpYyBlcnJvclxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3Q8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvPihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVSZW5hbWVMb2NhdGlvbihyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPChsYW5ndWFnZXMuUmVuYW1lTG9jYXRpb24gJiBsYW5ndWFnZXMuUmVqZWN0aW9uKSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucHJlcGFyZVJlbmFtZSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJhbmdlT3JMb2NhdGlvbiA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByZXBhcmVSZW5hbWUoZG9jLCBwb3MsIHRva2VuKTtcblxuXHRcdFx0bGV0IHJhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKFJhbmdlLmlzUmFuZ2UocmFuZ2VPckxvY2F0aW9uKSkge1xuXHRcdFx0XHRyYW5nZSA9IHJhbmdlT3JMb2NhdGlvbjtcblx0XHRcdFx0dGV4dCA9IGRvYy5nZXRUZXh0KHJhbmdlT3JMb2NhdGlvbik7XG5cblx0XHRcdH0gZWxzZSBpZiAoaXNPYmplY3QocmFuZ2VPckxvY2F0aW9uKSkge1xuXHRcdFx0XHRyYW5nZSA9IHJhbmdlT3JMb2NhdGlvbi5yYW5nZTtcblx0XHRcdFx0dGV4dCA9IHJhbmdlT3JMb2NhdGlvbi5wbGFjZWhvbGRlcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFyYW5nZSB8fCAhdGV4dCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0LmxpbmUgPiBwb3MubGluZSB8fCByYW5nZS5lbmQubGluZSA8IHBvcy5saW5lKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignSU5WQUxJRCByZW5hbWUgbG9jYXRpb246IHBvc2l0aW9uIGxpbmUgbXVzdCBiZSB3aXRoaW4gcmFuZ2Ugc3RhcnQvZW5kIGxpbmVzJyk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyByYW5nZTogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShyYW5nZSksIHRleHQgfTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgcmVqZWN0UmVhc29uID0gUmVuYW1lQWRhcHRlci5fYXNNZXNzYWdlKGVycik7XG5cdFx0XHRpZiAocmVqZWN0UmVhc29uKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlamVjdFJlYXNvbiwgcmFuZ2U6IHVuZGVmaW5lZCEsIHRleHQ6IHVuZGVmaW5lZCEgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdDxhbnk+KGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FzTWVzc2FnZShlcnI6IGFueSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBlcnIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZXJyO1xuXHRcdH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IgJiYgdHlwZW9mIGVyci5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGVyci5tZXNzYWdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBOZXdTeW1ib2xOYW1lc0FkYXB0ZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIGxhbmd1YWdlVHJpZ2dlcktpbmRUb1ZTQ29kZVRyaWdnZXJLaW5kOiBSZWNvcmQ8bGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgdnNjb2RlLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZD4gPSB7XG5cdFx0W2xhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQuSW52b2tlXTogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkludm9rZSxcblx0XHRbbGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZC5BdXRvbWF0aWNdOiBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQuQXV0b21hdGljLFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLk5ld1N5bWJvbE5hbWVzUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBzdXBwb3J0c0F1dG9tYXRpY05ld1N5bWJvbE5hbWVzVHJpZ2dlcktpbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyLnN1cHBvcnRzQXV0b21hdGljVHJpZ2dlcktpbmQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlTmV3U3ltYm9sTmFtZXMocmVzb3VyY2U6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdHJpZ2dlcktpbmQ6IGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVbXSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5SYW5nZS50byhyYW5nZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qga2luZCA9IE5ld1N5bWJvbE5hbWVzQWRhcHRlci5sYW5ndWFnZVRyaWdnZXJLaW5kVG9WU0NvZGVUcmlnZ2VyS2luZFt0cmlnZ2VyS2luZF07XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVOZXdTeW1ib2xOYW1lcyhkb2MsIHBvcywga2luZCwgdG9rZW4pO1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh2ID0+XG5cdFx0XHRcdHR5cGVvZiB2ID09PSAnc3RyaW5nJyAvKiBAdWx1Z2Jla25hOiBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBiZWNhdXNlIGB2YWx1ZWAgdXNlZCB0byBiZSBqdXN0IGBzdHJpbmdbXWAgKi9cblx0XHRcdFx0XHQ/IHsgbmV3U3ltYm9sTmFtZTogdiB9XG5cdFx0XHRcdFx0OiB7IG5ld1N5bWJvbE5hbWU6IHYubmV3U3ltYm9sTmFtZSwgdGFnczogdi50YWdzIH1cblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKE5ld1N5bWJvbE5hbWVzQWRhcHRlci5fYXNNZXNzYWdlKGVycikgPz8gSlNPTi5zdHJpbmdpZnkoZXJyLCBudWxsLCAnXFx0JykgLyogQHVsdWdiZWtuYTogYXNzdW1pbmcgYGVycmAgZG9lc24ndCBoYXZlIGNpcmN1bGFyIHJlZmVyZW5jZXMgdGhhdCBjb3VsZCByZXN1bHQgaW4gYW4gZXhjZXB0aW9uIHdoZW4gY29udmVydGluZyB0byBKU09OICovKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQHVsdWdiZWtuYTogdGhpcyBtZXRob2QgaXMgYWxzbyBkZWZpbmVkIGluIFJlbmFtZUFkYXB0ZXIgYnV0IHNlZW1zIE9LIHRvIGJlIGR1cGxpY2F0ZWRcblx0cHJpdmF0ZSBzdGF0aWMgX2FzTWVzc2FnZShlcnI6IGFueSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBlcnIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZXJyO1xuXHRcdH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IgJiYgdHlwZW9mIGVyci5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGVyci5tZXNzYWdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTZW1hbnRpY1Rva2Vuc1ByZXZpb3VzUmVzdWx0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSB0b2tlbnM/OiBVaW50MzJBcnJheSxcblx0KSB7IH1cbn1cblxudHlwZSBSZWxheGVkU2VtYW50aWNUb2tlbnMgPSB7IHJlYWRvbmx5IHJlc3VsdElkPzogc3RyaW5nOyByZWFkb25seSBkYXRhOiBudW1iZXJbXSB9O1xudHlwZSBSZWxheGVkU2VtYW50aWNUb2tlbnNFZGl0ID0geyByZWFkb25seSBzdGFydDogbnVtYmVyOyByZWFkb25seSBkZWxldGVDb3VudDogbnVtYmVyOyByZWFkb25seSBkYXRhPzogbnVtYmVyW10gfTtcbnR5cGUgUmVsYXhlZFNlbWFudGljVG9rZW5zRWRpdHMgPSB7IHJlYWRvbmx5IHJlc3VsdElkPzogc3RyaW5nOyByZWFkb25seSBlZGl0czogUmVsYXhlZFNlbWFudGljVG9rZW5zRWRpdFtdIH07XG5cbnR5cGUgUHJvdmlkZWRTZW1hbnRpY1Rva2VucyA9IHZzY29kZS5TZW1hbnRpY1Rva2VucyB8IFJlbGF4ZWRTZW1hbnRpY1Rva2VucztcbnR5cGUgUHJvdmlkZWRTZW1hbnRpY1Rva2Vuc0VkaXRzID0gdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMgfCBSZWxheGVkU2VtYW50aWNUb2tlbnNFZGl0cztcblxuY2xhc3MgRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpb3VzUmVzdWx0czogTWFwPG51bWJlciwgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdD47XG5cdHByaXZhdGUgX25leHRSZXN1bHRJZCA9IDE7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLFxuXHQpIHtcblx0XHR0aGlzLl9wcmV2aW91c1Jlc3VsdHMgPSBuZXcgTWFwPG51bWJlciwgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdD4oKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKHJlc291cmNlOiBVUkksIHByZXZpb3VzUmVzdWx0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlciB8IG51bGw+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHByZXZpb3VzUmVzdWx0ID0gKHByZXZpb3VzUmVzdWx0SWQgIT09IDAgPyB0aGlzLl9wcmV2aW91c1Jlc3VsdHMuZ2V0KHByZXZpb3VzUmVzdWx0SWQpIDogbnVsbCk7XG5cdFx0bGV0IHZhbHVlID0gdHlwZW9mIHByZXZpb3VzUmVzdWx0Py5yZXN1bHRJZCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zRWRpdHMgPT09ICdmdW5jdGlvbidcblx0XHRcdD8gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnNFZGl0cyhkb2MsIHByZXZpb3VzUmVzdWx0LnJlc3VsdElkLCB0b2tlbilcblx0XHRcdDogYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMoZG9jLCB0b2tlbik7XG5cblx0XHRpZiAocHJldmlvdXNSZXN1bHQpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzUmVzdWx0cy5kZWxldGUocHJldmlvdXNSZXN1bHRJZCk7XG5cdFx0fVxuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHR2YWx1ZSA9IERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9maXhQcm92aWRlZFNlbWFudGljVG9rZW5zKHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZChEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5fY29udmVydFRvRWRpdHMocHJldmlvdXNSZXN1bHQsIHZhbHVlKSwgdmFsdWUpO1xuXHR9XG5cblx0YXN5bmMgcmVsZWFzZURvY3VtZW50U2VtYW50aWNDb2xvcmluZyhzZW1hbnRpY0NvbG9yaW5nUmVzdWx0SWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3ByZXZpb3VzUmVzdWx0cy5kZWxldGUoc2VtYW50aWNDb2xvcmluZ1Jlc3VsdElkKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maXhQcm92aWRlZFNlbWFudGljVG9rZW5zKHY6IFByb3ZpZGVkU2VtYW50aWNUb2tlbnMgfCBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMpOiB2c2NvZGUuU2VtYW50aWNUb2tlbnMgfCB2c2NvZGUuU2VtYW50aWNUb2tlbnNFZGl0cyB7XG5cdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc1NlbWFudGljVG9rZW5zKHYpKSB7XG5cdFx0XHRpZiAoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2lzQ29ycmVjdFNlbWFudGljVG9rZW5zKHYpKSB7XG5cdFx0XHRcdHJldHVybiB2O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZW1hbnRpY1Rva2VucyhuZXcgVWludDMyQXJyYXkodi5kYXRhKSwgdi5yZXN1bHRJZCk7XG5cdFx0fSBlbHNlIGlmIChEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5faXNTZW1hbnRpY1Rva2Vuc0VkaXRzKHYpKSB7XG5cdFx0XHRpZiAoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2lzQ29ycmVjdFNlbWFudGljVG9rZW5zRWRpdHModikpIHtcblx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFNlbWFudGljVG9rZW5zRWRpdHModi5lZGl0cy5tYXAoZWRpdCA9PiBuZXcgU2VtYW50aWNUb2tlbnNFZGl0KGVkaXQuc3RhcnQsIGVkaXQuZGVsZXRlQ291bnQsIGVkaXQuZGF0YSA/IG5ldyBVaW50MzJBcnJheShlZGl0LmRhdGEpIDogZWRpdC5kYXRhKSksIHYucmVzdWx0SWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc1NlbWFudGljVG9rZW5zKHY6IFByb3ZpZGVkU2VtYW50aWNUb2tlbnMgfCBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMpOiB2IGlzIFByb3ZpZGVkU2VtYW50aWNUb2tlbnMge1xuXHRcdHJldHVybiB2ICYmICEhKCh2IGFzIFByb3ZpZGVkU2VtYW50aWNUb2tlbnMpLmRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzQ29ycmVjdFNlbWFudGljVG9rZW5zKHY6IFByb3ZpZGVkU2VtYW50aWNUb2tlbnMpOiB2IGlzIHZzY29kZS5TZW1hbnRpY1Rva2VucyB7XG5cdFx0cmV0dXJuICh2LmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNTZW1hbnRpY1Rva2Vuc0VkaXRzKHY6IFByb3ZpZGVkU2VtYW50aWNUb2tlbnMgfCBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMpOiB2IGlzIFByb3ZpZGVkU2VtYW50aWNUb2tlbnNFZGl0cyB7XG5cdFx0cmV0dXJuIHYgJiYgQXJyYXkuaXNBcnJheSgodiBhcyBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMpLmVkaXRzKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0NvcnJlY3RTZW1hbnRpY1Rva2Vuc0VkaXRzKHY6IFByb3ZpZGVkU2VtYW50aWNUb2tlbnNFZGl0cyk6IHYgaXMgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMge1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB2LmVkaXRzKSB7XG5cdFx0XHRpZiAoIShlZGl0LmRhdGEgaW5zdGFuY2VvZiBVaW50MzJBcnJheSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb252ZXJ0VG9FZGl0cyhwcmV2aW91c1Jlc3VsdDogU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdCB8IG51bGwgfCB1bmRlZmluZWQsIG5ld1Jlc3VsdDogdnNjb2RlLlNlbWFudGljVG9rZW5zIHwgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMpOiB2c2NvZGUuU2VtYW50aWNUb2tlbnMgfCB2c2NvZGUuU2VtYW50aWNUb2tlbnNFZGl0cyB7XG5cdFx0aWYgKCFEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5faXNTZW1hbnRpY1Rva2VucyhuZXdSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gbmV3UmVzdWx0O1xuXHRcdH1cblx0XHRpZiAoIXByZXZpb3VzUmVzdWx0IHx8ICFwcmV2aW91c1Jlc3VsdC50b2tlbnMpIHtcblx0XHRcdHJldHVybiBuZXdSZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IG9sZERhdGEgPSBwcmV2aW91c1Jlc3VsdC50b2tlbnM7XG5cdFx0Y29uc3Qgb2xkTGVuZ3RoID0gb2xkRGF0YS5sZW5ndGg7XG5cdFx0Y29uc3QgbmV3RGF0YSA9IG5ld1Jlc3VsdC5kYXRhO1xuXHRcdGNvbnN0IG5ld0xlbmd0aCA9IG5ld0RhdGEubGVuZ3RoO1xuXG5cdFx0bGV0IGNvbW1vblByZWZpeExlbmd0aCA9IDA7XG5cdFx0Y29uc3QgbWF4Q29tbW9uUHJlZml4TGVuZ3RoID0gTWF0aC5taW4ob2xkTGVuZ3RoLCBuZXdMZW5ndGgpO1xuXHRcdHdoaWxlIChjb21tb25QcmVmaXhMZW5ndGggPCBtYXhDb21tb25QcmVmaXhMZW5ndGggJiYgb2xkRGF0YVtjb21tb25QcmVmaXhMZW5ndGhdID09PSBuZXdEYXRhW2NvbW1vblByZWZpeExlbmd0aF0pIHtcblx0XHRcdGNvbW1vblByZWZpeExlbmd0aCsrO1xuXHRcdH1cblxuXHRcdGlmIChjb21tb25QcmVmaXhMZW5ndGggPT09IG9sZExlbmd0aCAmJiBjb21tb25QcmVmaXhMZW5ndGggPT09IG5ld0xlbmd0aCkge1xuXHRcdFx0Ly8gY29tcGxldGUgb3ZlcmxhcCFcblx0XHRcdHJldHVybiBuZXcgU2VtYW50aWNUb2tlbnNFZGl0cyhbXSwgbmV3UmVzdWx0LnJlc3VsdElkKTtcblx0XHR9XG5cblx0XHRsZXQgY29tbW9uU3VmZml4TGVuZ3RoID0gMDtcblx0XHRjb25zdCBtYXhDb21tb25TdWZmaXhMZW5ndGggPSBtYXhDb21tb25QcmVmaXhMZW5ndGggLSBjb21tb25QcmVmaXhMZW5ndGg7XG5cdFx0d2hpbGUgKGNvbW1vblN1ZmZpeExlbmd0aCA8IG1heENvbW1vblN1ZmZpeExlbmd0aCAmJiBvbGREYXRhW29sZExlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aCAtIDFdID09PSBuZXdEYXRhW25ld0xlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aCAtIDFdKSB7XG5cdFx0XHRjb21tb25TdWZmaXhMZW5ndGgrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFNlbWFudGljVG9rZW5zRWRpdHMoW3tcblx0XHRcdHN0YXJ0OiBjb21tb25QcmVmaXhMZW5ndGgsXG5cdFx0XHRkZWxldGVDb3VudDogKG9sZExlbmd0aCAtIGNvbW1vblByZWZpeExlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aCksXG5cdFx0XHRkYXRhOiBuZXdEYXRhLnN1YmFycmF5KGNvbW1vblByZWZpeExlbmd0aCwgbmV3TGVuZ3RoIC0gY29tbW9uU3VmZml4TGVuZ3RoKVxuXHRcdH1dLCBuZXdSZXN1bHQucmVzdWx0SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZCh2YWx1ZTogdnNjb2RlLlNlbWFudGljVG9rZW5zIHwgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMsIG9yaWdpbmFsOiB2c2NvZGUuU2VtYW50aWNUb2tlbnMgfCB2c2NvZGUuU2VtYW50aWNUb2tlbnNFZGl0cyk6IFZTQnVmZmVyIHwgbnVsbCB7XG5cdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc1NlbWFudGljVG9rZW5zKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgbXlJZCA9IHRoaXMuX25leHRSZXN1bHRJZCsrO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNSZXN1bHRzLnNldChteUlkLCBuZXcgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdCh2YWx1ZS5yZXN1bHRJZCwgdmFsdWUuZGF0YSkpO1xuXHRcdFx0cmV0dXJuIGVuY29kZVNlbWFudGljVG9rZW5zRHRvKHtcblx0XHRcdFx0aWQ6IG15SWQsXG5cdFx0XHRcdHR5cGU6ICdmdWxsJyxcblx0XHRcdFx0ZGF0YTogdmFsdWUuZGF0YVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc1NlbWFudGljVG9rZW5zRWRpdHModmFsdWUpKSB7XG5cdFx0XHRjb25zdCBteUlkID0gdGhpcy5fbmV4dFJlc3VsdElkKys7XG5cdFx0XHRpZiAoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2lzU2VtYW50aWNUb2tlbnMob3JpZ2luYWwpKSB7XG5cdFx0XHRcdC8vIHN0b3JlIHRoZSBvcmlnaW5hbFxuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1Jlc3VsdHMuc2V0KG15SWQsIG5ldyBTZW1hbnRpY1Rva2Vuc1ByZXZpb3VzUmVzdWx0KG9yaWdpbmFsLnJlc3VsdElkLCBvcmlnaW5hbC5kYXRhKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1Jlc3VsdHMuc2V0KG15SWQsIG5ldyBTZW1hbnRpY1Rva2Vuc1ByZXZpb3VzUmVzdWx0KHZhbHVlLnJlc3VsdElkKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZW5jb2RlU2VtYW50aWNUb2tlbnNEdG8oe1xuXHRcdFx0XHRpZDogbXlJZCxcblx0XHRcdFx0dHlwZTogJ2RlbHRhJyxcblx0XHRcdFx0ZGVsdGFzOiAodmFsdWUuZWRpdHMgfHwgW10pLm1hcChlZGl0ID0+ICh7IHN0YXJ0OiBlZGl0LnN0YXJ0LCBkZWxldGVDb3VudDogZWRpdC5kZWxldGVDb3VudCwgZGF0YTogZWRpdC5kYXRhIH0pKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY2xhc3MgRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2VucyhyZXNvdXJjZTogVVJJLCByYW5nZTogSVJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFZTQnVmZmVyIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zKGRvYywgdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmFuZ2UpLCB0b2tlbik7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zZW5kKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmQodmFsdWU6IHZzY29kZS5TZW1hbnRpY1Rva2Vucyk6IFZTQnVmZmVyIHtcblx0XHRyZXR1cm4gZW5jb2RlU2VtYW50aWNUb2tlbnNEdG8oe1xuXHRcdFx0aWQ6IDAsXG5cdFx0XHR0eXBlOiAnZnVsbCcsXG5cdFx0XHRkYXRhOiB2YWx1ZS5kYXRhXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgQ29tcGxldGlvbnNBZGFwdGVyIHtcblxuXHRzdGF0aWMgc3VwcG9ydHNSZXNvbHZpbmcocHJvdmlkZXI6IHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0gPT09ICdmdW5jdGlvbic7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuQ29tcGxldGlvbkl0ZW0+KCdDb21wbGV0aW9uSXRlbScpO1xuXHRwcml2YXRlIF9kaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBpRGVwcmVjYXRpb246IElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVDb21wbGV0aW9uSXRlbXMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdFJlc3VsdER0byB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHQvLyBUaGUgZGVmYXVsdCBpbnNlcnQvcmVwbGFjZSByYW5nZXMuIEl0J3MgaW1wb3J0YW50IHRvIGNvbXB1dGUgdGhlbVxuXHRcdC8vIGJlZm9yZSBhc3luY2hyb25vdXNseSBhc2tpbmcgdGhlIHByb3ZpZGVyIGZvciBpdHMgcmVzdWx0cy4gU2VlXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzgzNDAwI2lzc3VlY29tbWVudC01NDY4NTE0MjFcblx0XHRjb25zdCByZXBsYWNlUmFuZ2UgPSBkb2MuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3MpIHx8IG5ldyBSYW5nZShwb3MsIHBvcyk7XG5cdFx0Y29uc3QgaW5zZXJ0UmFuZ2UgPSByZXBsYWNlUmFuZ2Uud2l0aCh7IGVuZDogcG9zIH0pO1xuXG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3QgaXRlbXNPckxpc3QgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zLCB0b2tlbiwgdHlwZUNvbnZlcnQuQ29tcGxldGlvbkNvbnRleHQudG8oY29udGV4dCkpO1xuXG5cdFx0aWYgKCFpdGVtc09yTGlzdCkge1xuXHRcdFx0Ly8gdW5kZWZpbmVkIGFuZCBudWxsIGFyZSB2YWxpZCByZXN1bHRzXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Ly8gY2FuY2VsbGVkIC0+IHJldHVybiB3aXRob3V0IGZ1cnRoZXIgYWRvLCBlc3Agbm8gY2FjaGluZ1xuXHRcdFx0Ly8gb2YgcmVzdWx0cyBhcyB0aGV5IHdpbGwgbGVha1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBsaXN0ID0gQXJyYXkuaXNBcnJheShpdGVtc09yTGlzdCkgPyBuZXcgQ29tcGxldGlvbkxpc3QoaXRlbXNPckxpc3QpIDogaXRlbXNPckxpc3Q7XG5cblx0XHQvLyBrZWVwIHJlc3VsdCBmb3IgcHJvdmlkZXJzIHRoYXQgc3VwcG9ydCByZXNvbHZpbmdcblx0XHRjb25zdCBwaWQ6IG51bWJlciA9IENvbXBsZXRpb25zQWRhcHRlci5zdXBwb3J0c1Jlc29sdmluZyh0aGlzLl9wcm92aWRlcikgPyB0aGlzLl9jYWNoZS5hZGQobGlzdC5pdGVtcykgOiB0aGlzLl9jYWNoZS5hZGQoW10pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnNldChwaWQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zOiBleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdFJlc3VsdER0byA9IHtcblx0XHRcdHg6IHBpZCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG9GaWVsZC5jb21wbGV0aW9uc106IGNvbXBsZXRpb25zLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmRlZmF1bHRSYW5nZXNdOiB7IHJlcGxhY2U6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20ocmVwbGFjZVJhbmdlKSwgaW5zZXJ0OiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGluc2VydFJhbmdlKSB9LFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmlzSW5jb21wbGV0ZV06IGxpc3QuaXNJbmNvbXBsZXRlIHx8IHVuZGVmaW5lZCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG9GaWVsZC5kdXJhdGlvbl06IHN3LmVsYXBzZWQoKVxuXHRcdH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QuaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBsaXN0Lml0ZW1zW2ldO1xuXHRcdFx0Ly8gY2hlY2sgZm9yIGJhZCBjb21wbGV0aW9uIGl0ZW0gZmlyc3Rcblx0XHRcdGNvbnN0IGR0byA9IHRoaXMuX2NvbnZlcnRDb21wbGV0aW9uSXRlbShpdGVtLCBbcGlkLCBpXSwgaW5zZXJ0UmFuZ2UsIHJlcGxhY2VSYW5nZSk7XG5cdFx0XHRjb21wbGV0aW9ucy5wdXNoKGR0byk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb21wbGV0aW9uSXRlbShpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG8gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoLi4uaWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkdG8xID0gdGhpcy5fY29udmVydENvbXBsZXRpb25JdGVtKGl0ZW0sIGlkKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkSXRlbSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbShpdGVtLCB0b2tlbik7XG5cblx0XHRpZiAoIXJlc29sdmVkSXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkdG8yID0gdGhpcy5fY29udmVydENvbXBsZXRpb25JdGVtKHJlc29sdmVkSXRlbSwgaWQpO1xuXG5cdFx0aWYgKGR0bzFbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRdICE9PSBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XVxuXHRcdFx0fHwgZHRvMVtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dFJ1bGVzXSAhPT0gZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dFJ1bGVzXVxuXHRcdCkge1xuXHRcdFx0dGhpcy5fYXBpRGVwcmVjYXRpb24ucmVwb3J0KCdDb21wbGV0aW9uSXRlbS5pbnNlcnRUZXh0JywgdGhpcy5fZXh0ZW5zaW9uLCAnZXh0ZW5zaW9uIE1BWSBOT1QgY2hhbmdlIFxcJ2luc2VydFRleHRcXCcgb2YgYSBDb21wbGV0aW9uSXRlbSBkdXJpbmcgcmVzb2x2ZScpO1xuXHRcdH1cblxuXHRcdGlmIChkdG8xW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRlbnRdICE9PSBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRlbnRdXG5cdFx0XHR8fCBkdG8xW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdICE9PSBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdXG5cdFx0XHR8fCAhZXF1YWxzKGR0bzFbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1hbmRBcmd1bWVudHNdLCBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kQXJndW1lbnRzXSlcblx0XHQpIHtcblx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnQ29tcGxldGlvbkl0ZW0uY29tbWFuZCcsIHRoaXMuX2V4dGVuc2lvbiwgJ2V4dGVuc2lvbiBNQVkgTk9UIGNoYW5nZSBcXCdjb21tYW5kXFwnIG9mIGEgQ29tcGxldGlvbkl0ZW0gZHVyaW5nIHJlc29sdmUnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uZHRvMSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuZG9jdW1lbnRhdGlvbl06IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmRvY3VtZW50YXRpb25dLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5kZXRhaWxdOiBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5kZXRhaWxdLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5hZGRpdGlvbmFsVGV4dEVkaXRzXTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuYWRkaXRpb25hbFRleHRFZGl0c10sXG5cblx0XHRcdC8vIChmaXNoeSkgYXN5bmMgaW5zZXJ0VGV4dFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dF0sXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRSdWxlc106IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRSdWxlc10sXG5cblx0XHRcdC8vIChmaXNoeSkgYXN5bmMgY29tbWFuZFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRlbnRdOiBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRlbnRdLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdOiBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kQXJndW1lbnRzXTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZEFyZ3VtZW50c10sXG5cdFx0fTtcblx0fVxuXG5cdHJlbGVhc2VDb21wbGV0aW9uSXRlbXMoaWQ6IG51bWJlcik6IGFueSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRDb21wbGV0aW9uSXRlbShpdGVtOiB2c2NvZGUuQ29tcGxldGlvbkl0ZW0sIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIGRlZmF1bHRJbnNlcnRSYW5nZT86IHZzY29kZS5SYW5nZSwgZGVmYXVsdFJlcGxhY2VSYW5nZT86IHZzY29kZS5SYW5nZSk6IGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG8ge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9kaXNwb3NhYmxlcy5nZXQoaWRbMF0pO1xuXHRcdGlmICghZGlzcG9zYWJsZXMpIHtcblx0XHRcdHRocm93IEVycm9yKCdEaXNwb3NhYmxlU3RvcmUgaXMgbWlzc2luZy4uLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGl0ZW0uY29tbWFuZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJlc3VsdDogZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0byA9IHtcblx0XHRcdC8vXG5cdFx0XHR4OiBpZCxcblx0XHRcdC8vXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmxhYmVsXTogaXRlbS5sYWJlbCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQua2luZF06IGl0ZW0ua2luZCAhPT0gdW5kZWZpbmVkID8gdHlwZUNvbnZlcnQuQ29tcGxldGlvbkl0ZW1LaW5kLmZyb20oaXRlbS5raW5kKSA6IHVuZGVmaW5lZCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQua2luZE1vZGlmaWVyXTogaXRlbS50YWdzICYmIGl0ZW0udGFncy5tYXAodHlwZUNvbnZlcnQuQ29tcGxldGlvbkl0ZW1UYWcuZnJvbSksXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmRldGFpbF06IGl0ZW0uZGV0YWlsLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5kb2N1bWVudGF0aW9uXTogdHlwZW9mIGl0ZW0uZG9jdW1lbnRhdGlvbiA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGl0ZW0uZG9jdW1lbnRhdGlvbiksXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLnNvcnRUZXh0XTogaXRlbS5zb3J0VGV4dCAhPT0gaXRlbS5sYWJlbCA/IGl0ZW0uc29ydFRleHQgOiB1bmRlZmluZWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmZpbHRlclRleHRdOiBpdGVtLmZpbHRlclRleHQgIT09IGl0ZW0ubGFiZWwgPyBpdGVtLmZpbHRlclRleHQgOiB1bmRlZmluZWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLnByZXNlbGVjdF06IGl0ZW0ucHJlc2VsZWN0IHx8IHVuZGVmaW5lZCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dFJ1bGVzXTogaXRlbS5rZWVwV2hpdGVzcGFjZSA/IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLktlZXBXaGl0ZXNwYWNlIDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuTm9uZSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWl0Q2hhcmFjdGVyc106IGl0ZW0uY29tbWl0Q2hhcmFjdGVycz8uam9pbignJyksXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmFkZGl0aW9uYWxUZXh0RWRpdHNdOiBpdGVtLmFkZGl0aW9uYWxUZXh0RWRpdHMgJiYgaXRlbS5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcCh0eXBlQ29udmVydC5UZXh0RWRpdC5mcm9tKSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XTogY29tbWFuZD8uJGlkZW50LFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdOiBjb21tYW5kPy5pZCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZEFyZ3VtZW50c106IGNvbW1hbmQ/LiRpZGVudCA/IHVuZGVmaW5lZCA6IGNvbW1hbmQ/LmFyZ3VtZW50cywgLy8gZmlsbGVkIGluIG9uIG1haW4gc2lkZSBmcm9tICRpZGVudFxuXHRcdH07XG5cblx0XHQvLyAnaW5zZXJ0VGV4dCctbG9naWNcblx0XHRpZiAoaXRlbS50ZXh0RWRpdCkge1xuXHRcdFx0dGhpcy5fYXBpRGVwcmVjYXRpb24ucmVwb3J0KCdDb21wbGV0aW9uSXRlbS50ZXh0RWRpdCcsIHRoaXMuX2V4dGVuc2lvbiwgYFVzZSAnQ29tcGxldGlvbkl0ZW0uaW5zZXJ0VGV4dCcgYW5kICdDb21wbGV0aW9uSXRlbS5yYW5nZScgaW5zdGVhZC5gKTtcblx0XHRcdHJlc3VsdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dF0gPSBpdGVtLnRleHRFZGl0Lm5ld1RleHQ7XG5cblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBpdGVtLmluc2VydFRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXN1bHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRdID0gaXRlbS5pbnNlcnRUZXh0O1xuXG5cdFx0fSBlbHNlIGlmIChpdGVtLmluc2VydFRleHQgaW5zdGFuY2VvZiBTbmlwcGV0U3RyaW5nKSB7XG5cdFx0XHRyZXN1bHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRdID0gaXRlbS5pbnNlcnRUZXh0LnZhbHVlO1xuXHRcdFx0cmVzdWx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0UnVsZXNdISB8PSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQ7XG5cdFx0fVxuXG5cdFx0Ly8gJ292ZXJ3cml0ZVtCZWZvcmV8QWZ0ZXJdJy1sb2dpY1xuXHRcdGxldCByYW5nZTogdnNjb2RlLlJhbmdlIHwgeyBpbnNlcnRpbmc6IHZzY29kZS5SYW5nZTsgcmVwbGFjaW5nOiB2c2NvZGUuUmFuZ2UgfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXRlbS50ZXh0RWRpdCkge1xuXHRcdFx0cmFuZ2UgPSBpdGVtLnRleHRFZGl0LnJhbmdlO1xuXHRcdH0gZWxzZSBpZiAoaXRlbS5yYW5nZSkge1xuXHRcdFx0cmFuZ2UgPSBpdGVtLnJhbmdlO1xuXHRcdH1cblxuXHRcdGlmIChSYW5nZS5pc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0Ly8gXCJvbGRcIiByYW5nZVxuXHRcdFx0cmVzdWx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5yYW5nZV0gPSB0eXBlQ29udmVydC5SYW5nZS5mcm9tKHJhbmdlKTtcblxuXHRcdH0gZWxzZSBpZiAocmFuZ2UgJiYgKCFkZWZhdWx0SW5zZXJ0UmFuZ2U/LmlzRXF1YWwocmFuZ2UuaW5zZXJ0aW5nKSB8fCAhZGVmYXVsdFJlcGxhY2VSYW5nZT8uaXNFcXVhbChyYW5nZS5yZXBsYWNpbmcpKSkge1xuXHRcdFx0Ly8gT05MWSBzZW5kIHJhbmdlIHdoZW4gaXQncyBkaWZmZXJlbnQgZnJvbSB0aGUgZGVmYXVsdCByYW5nZXMgKHNhZmUgYmFuZHdpZHRoKVxuXHRcdFx0cmVzdWx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5yYW5nZV0gPSB7XG5cdFx0XHRcdGluc2VydDogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShyYW5nZS5pbnNlcnRpbmcpLFxuXHRcdFx0XHRyZXBsYWNlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKHJhbmdlLnJlcGxhY2luZylcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZmVyZW5jZXMgPSBuZXcgUmVmZXJlbmNlTWFwPHtcblx0XHRkaXNwb3NlKCk6IHZvaWQ7XG5cdFx0aXRlbXM6IHJlYWRvbmx5IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uSXRlbVtdO1xuXHRcdGxpc3Q6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZDtcblx0fT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uSXRlbVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0KSB7XG5cdFx0dGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpO1xuXHR9XG5cblx0cHVibGljIGdldCBzdXBwb3J0c0hhbmRsZUV2ZW50cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKVxuXHRcdFx0JiYgKHR5cGVvZiB0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRTaG93Q29tcGxldGlvbkl0ZW0gPT09ICdmdW5jdGlvbidcblx0XHRcdFx0fHwgdHlwZW9mIHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFBhcnRpYWxseUFjY2VwdENvbXBsZXRpb25JdGVtID09PSAnZnVuY3Rpb24nXG5cdFx0XHRcdHx8IHR5cGVvZiB0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRSZWplY3RDb21wbGV0aW9uSXRlbSA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0XHR8fCB0eXBlb2YgdGhpcy5fcHJvdmlkZXIuaGFuZGxlRW5kT2ZMaWZldGltZSA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3VwcG9ydHNTZXRNb2RlbElkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpXG5cdFx0XHQmJiB0eXBlb2YgdGhpcy5fcHJvdmlkZXIuc2V0Q3VycmVudE1vZGVsSWQgPT09ICdmdW5jdGlvbic7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN1cHBvcnRzU2V0UHJvdmlkZXJPcHRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJylcblx0XHRcdCYmIHR5cGVvZiB0aGlzLl9wcm92aWRlci5zZXRQcm92aWRlck9wdGlvblZhbHVlID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVRyaWdnZXJLaW5kVG9WU0NvZGVUcmlnZ2VyS2luZDogUmVjb3JkPGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZD4gPSB7XG5cdFx0W2xhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljXTogSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkF1dG9tYXRpYyxcblx0XHRbbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdF06IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UsXG5cdH07XG5cblx0cHVibGljIGdldCBtb2RlbEluZm8oKTogZXh0SG9zdFByb3RvY29sLklJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvRHRvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXIubW9kZWxJbmZvID8ge1xuXHRcdFx0bW9kZWxzOiB0aGlzLl9wcm92aWRlci5tb2RlbEluZm8ubW9kZWxzLFxuXHRcdFx0Y3VycmVudE1vZGVsSWQ6IHRoaXMuX3Byb3ZpZGVyLm1vZGVsSW5mby5jdXJyZW50TW9kZWxJZFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRDdXJyZW50TW9kZWxJZChtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVyLnNldEN1cnJlbnRNb2RlbElkPy4obW9kZWxJZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHByb3ZpZGVyT3B0aW9ucygpOiByZWFkb25seSBleHRIb3N0UHJvdG9jb2wuSUlubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbkR0b1tdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXIucHJvdmlkZXJPcHRpb25zPy5tYXAobyA9PiAoe1xuXHRcdFx0aWQ6IG8uaWQsXG5cdFx0XHRsYWJlbDogby5sYWJlbCxcblx0XHRcdHZhbHVlczogby52YWx1ZXMubWFwKHYgPT4gKHsgaWQ6IHYuaWQsIGxhYmVsOiB2LmxhYmVsIH0pKSxcblx0XHRcdGN1cnJlbnRWYWx1ZUlkOiBvLmN1cnJlbnRWYWx1ZUlkLFxuXHRcdH0pKTtcblx0fVxuXG5cdHNldFByb3ZpZGVyT3B0aW9uKG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXIuc2V0UHJvdmlkZXJPcHRpb25WYWx1ZT8uKG9wdGlvbklkLCB2YWx1ZUlkKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVJbmxpbmVDb21wbGV0aW9ucyhyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlSW5saW5lQ29tcGxldGlvbkl0ZW1zKGRvYywgcG9zLCB7XG5cdFx0XHRzZWxlY3RlZENvbXBsZXRpb25JbmZvOlxuXHRcdFx0XHRjb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm9cblx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdHJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS50byhjb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8ucmFuZ2UpLFxuXHRcdFx0XHRcdFx0dGV4dDogY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvLnRleHRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR0cmlnZ2VyS2luZDogdGhpcy5sYW5ndWFnZVRyaWdnZXJLaW5kVG9WU0NvZGVUcmlnZ2VyS2luZFtjb250ZXh0LnRyaWdnZXJLaW5kXSxcblx0XHRcdHJlcXVlc3RVdWlkOiBjb250ZXh0LnJlcXVlc3RVdWlkLFxuXHRcdFx0cmVxdWVzdElzc3VlZERhdGVUaW1lOiBjb250ZXh0LnJlcXVlc3RJc3N1ZWREYXRlVGltZSxcblx0XHRcdGVhcmxpZXN0U2hvd25EYXRlVGltZTogY29udGV4dC5lYXJsaWVzdFNob3duRGF0ZVRpbWUsXG5cdFx0XHRjaGFuZ2VIaW50OiBjb250ZXh0LmNoYW5nZUhpbnQsXG5cdFx0fSwgdG9rZW4pO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdC8vIHVuZGVmaW5lZCBhbmQgbnVsbCBhcmUgdmFsaWQgcmVzdWx0c1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlc3VsdEl0ZW1zLCBsaXN0IH0gPSBBcnJheS5pc0FycmF5KHJlc3VsdCkgPyB7IHJlc3VsdEl0ZW1zOiByZXN1bHQsIGxpc3Q6IHVuZGVmaW5lZCB9IDogeyByZXN1bHRJdGVtczogcmVzdWx0Lml0ZW1zLCBsaXN0OiByZXN1bHQgfTtcblx0XHRjb25zdCBjb21tYW5kcyA9IHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkID8gQXJyYXkuaXNBcnJheShyZXN1bHQpID8gW10gOiByZXN1bHQuY29tbWFuZHMgfHwgW10gOiBbXTtcblx0XHRjb25zdCBlbmFibGVGb3J3YXJkU3RhYmlsaXR5ID0gdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgJiYgIUFycmF5LmlzQXJyYXkocmVzdWx0KSA/IHJlc3VsdC5lbmFibGVGb3J3YXJkU3RhYmlsaXR5IDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBpZCA9IHRoaXMuX3JlZmVyZW5jZXMuY3JlYXRlUmVmZXJlbmNlSWQoe1xuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlPy5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdFx0aXRlbXM6IHJlc3VsdEl0ZW1zLFxuXHRcdFx0bGlzdCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGl0ZW1zID0ge1xuXHRcdFx0cGlkLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZG9jLmxhbmd1YWdlSWQsXG5cdFx0XHRpdGVtczogcmVzdWx0SXRlbXMubWFwPGV4dEhvc3RQcm90b2NvbC5JZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9uPigoaXRlbSwgaWR4KSA9PiB7XG5cdFx0XHRcdGxldCBjb21tYW5kOiBsYW5ndWFnZXMuQ29tbWFuZCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGl0ZW0uY29tbWFuZCkge1xuXHRcdFx0XHRcdGlmICghZGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbW1hbmQgPSB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGl0ZW0uY29tbWFuZCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBhY3Rpb246IGxhbmd1YWdlcy5Db21tYW5kIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoaXRlbS5hY3Rpb24pIHtcblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2FibGVTdG9yZSkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhY3Rpb24gPSB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGl0ZW0uYWN0aW9uLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IGl0ZW0uaW5zZXJ0VGV4dDtcblx0XHRcdFx0cmV0dXJuICh7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaW5zZXJ0VGV4dCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogKHR5cGVvZiBpbnNlcnRUZXh0ID09PSAnc3RyaW5nJyA/IGluc2VydFRleHQgOiB7IHNuaXBwZXQ6IGluc2VydFRleHQudmFsdWUgfSksXG5cdFx0XHRcdFx0cmFuZ2U6IGl0ZW0ucmFuZ2UgPyB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGl0ZW0ucmFuZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNob3dSYW5nZTogKHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkICYmIGl0ZW0uc2hvd1JhbmdlKSA/IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20oaXRlbS5zaG93UmFuZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbW1hbmQsXG5cdFx0XHRcdFx0Z3V0dGVyTWVudUxpbmtBY3Rpb246IGFjdGlvbixcblx0XHRcdFx0XHRwaWQ6IHBpZCxcblx0XHRcdFx0XHRpZHg6IGlkeCxcblx0XHRcdFx0XHRjb21wbGV0ZUJyYWNrZXRQYWlyczogdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPyBpdGVtLmNvbXBsZXRlQnJhY2tldFBhaXJzIDogZmFsc2UsXG5cdFx0XHRcdFx0aXNJbmxpbmVFZGl0OiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCA/IGl0ZW0uaXNJbmxpbmVFZGl0IDogZmFsc2UsXG5cdFx0XHRcdFx0c2hvd0lubGluZUVkaXRNZW51OiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCA/IGl0ZW0uc2hvd0lubGluZUVkaXRNZW51IDogZmFsc2UsXG5cdFx0XHRcdFx0aGludDogKGl0ZW0uZGlzcGxheUxvY2F0aW9uICYmIHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSA/IHtcblx0XHRcdFx0XHRcdHJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGl0ZW0uZGlzcGxheUxvY2F0aW9uLnJhbmdlKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IGl0ZW0uZGlzcGxheUxvY2F0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0c3R5bGU6IGl0ZW0uZGlzcGxheUxvY2F0aW9uLmtpbmQgPyB0eXBlQ29udmVydC5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLmZyb20oaXRlbS5kaXNwbGF5TG9jYXRpb24ua2luZCkgOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZS5Db2RlLFxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0d2FybmluZzogKGl0ZW0ud2FybmluZyAmJiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkgPyB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tKGl0ZW0ud2FybmluZy5tZXNzYWdlKSxcblx0XHRcdFx0XHRcdGljb246IGl0ZW0ud2FybmluZy5pY29uID8gdHlwZUNvbnZlcnQuSWNvblBhdGguZnJvbVRoZW1lSWNvbihpdGVtLndhcm5pbmcuaWNvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb3JyZWxhdGlvbklkOiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCA/IGl0ZW0uY29ycmVsYXRpb25JZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6ICh0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCAmJiBpdGVtLnVyaSkgPyBpdGVtLnVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPyBpdGVtLnN1cHBvcnRzUmVuYW1lIDogZmFsc2UsXG5cdFx0XHRcdFx0anVtcFRvUG9zaXRpb246ICh0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCAmJiBpdGVtLmp1bXBUb1Bvc2l0aW9uKSA/IHR5cGVDb252ZXJ0LlBvc2l0aW9uLmZyb20oaXRlbS5qdW1wVG9Qb3NpdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSksXG5cdFx0XHRjb21tYW5kczogY29tbWFuZHMubWFwKGMgPT4ge1xuXHRcdFx0XHRpZiAoIWRpc3Bvc2FibGVTdG9yZSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuQ29tcGxldGlvbkNvbW1hbmQuZnJvbShjLCB0aGlzLl9jb21tYW5kcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdH0pLFxuXHRcdFx0c3VwcHJlc3NTdWdnZXN0aW9uczogZmFsc2UsXG5cdFx0XHRlbmFibGVGb3J3YXJkU3RhYmlsaXR5LFxuXHRcdH0gc2F0aXNmaWVzIGV4dEhvc3RQcm90b2NvbC5JZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucztcblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRkaXNwb3NlQ29tcGxldGlvbnMocGlkOiBudW1iZXIsIHJlYXNvbjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbikge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25MaXN0ID0gdGhpcy5fcmVmZXJlbmNlcy5nZXQocGlkKTtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXIuaGFuZGxlTGlzdEVuZE9mTGlmZXRpbWUgJiYgdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgJiYgY29tcGxldGlvbkxpc3Q/Lmxpc3QpIHtcblx0XHRcdGZ1bmN0aW9uIHRyYW5zbGF0ZVJlYXNvbihyZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb24pOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uIHtcblx0XHRcdFx0c3dpdGNoIChyZWFzb24ua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgJ2xvc3RSYWNlJzpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQuTG9zdFJhY2UgfTtcblx0XHRcdFx0XHRjYXNlICd0b2tlbkNhbmNlbGxhdGlvbic6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLlRva2VuQ2FuY2VsbGF0aW9uIH07XG5cdFx0XHRcdFx0Y2FzZSAnb3RoZXInOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZC5PdGhlciB9O1xuXHRcdFx0XHRcdGNhc2UgJ2VtcHR5Jzpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQuRW1wdHkgfTtcblx0XHRcdFx0XHRjYXNlICdub3RUYWtlbic6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLk5vdFRha2VuIH07XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQuT3RoZXIgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcm92aWRlci5oYW5kbGVMaXN0RW5kT2ZMaWZldGltZShjb21wbGV0aW9uTGlzdC5saXN0LCB0cmFuc2xhdGVSZWFzb24ocmVhc29uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3JlZmVyZW5jZXMuZGlzcG9zZVJlZmVyZW5jZUlkKHBpZCk7XG5cdFx0ZGF0YT8uZGlzcG9zZSgpO1xuXHR9XG5cblx0aGFuZGxlRGlkU2hvd0NvbXBsZXRpb25JdGVtKHBpZDogbnVtYmVyLCBpZHg6IG51bWJlciwgdXBkYXRlZEluc2VydFRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25JdGVtID0gdGhpcy5fcmVmZXJlbmNlcy5nZXQocGlkKT8uaXRlbXNbaWR4XTtcblx0XHRpZiAoY29tcGxldGlvbkl0ZW0pIHtcblx0XHRcdGlmICh0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRTaG93Q29tcGxldGlvbkl0ZW0gJiYgdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkU2hvd0NvbXBsZXRpb25JdGVtKGNvbXBsZXRpb25JdGVtLCB1cGRhdGVkSW5zZXJ0VGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlUGFydGlhbEFjY2VwdChwaWQ6IG51bWJlciwgaWR4OiBudW1iZXIsIGFjY2VwdGVkQ2hhcmFjdGVyczogbnVtYmVyLCBpbmZvOiBsYW5ndWFnZXMuUGFydGlhbEFjY2VwdEluZm8pOiB2b2lkIHtcblx0XHRjb25zdCBjb21wbGV0aW9uSXRlbSA9IHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHBpZCk/Lml0ZW1zW2lkeF07XG5cdFx0aWYgKGNvbXBsZXRpb25JdGVtKSB7XG5cdFx0XHRpZiAodGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkUGFydGlhbGx5QWNjZXB0Q29tcGxldGlvbkl0ZW0gJiYgdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkUGFydGlhbGx5QWNjZXB0Q29tcGxldGlvbkl0ZW0oY29tcGxldGlvbkl0ZW0sIGFjY2VwdGVkQ2hhcmFjdGVycyk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFBhcnRpYWxseUFjY2VwdENvbXBsZXRpb25JdGVtKGNvbXBsZXRpb25JdGVtLCB0eXBlQ29udmVydC5QYXJ0aWFsQWNjZXB0SW5mby50byhpbmZvKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlRW5kT2ZMaWZldGltZShwaWQ6IG51bWJlciwgaWR4OiBudW1iZXIsIHJlYXNvbjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb248eyBwaWQ6IG51bWJlcjsgaWR4OiBudW1iZXIgfT4pOiB2b2lkIHtcblx0XHRjb25zdCBjb21wbGV0aW9uSXRlbSA9IHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHBpZCk/Lml0ZW1zW2lkeF07XG5cdFx0aWYgKGNvbXBsZXRpb25JdGVtKSB7XG5cdFx0XHRpZiAodGhpcy5fcHJvdmlkZXIuaGFuZGxlRW5kT2ZMaWZldGltZSAmJiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCByID0gdHlwZUNvbnZlcnQuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbi50byhyZWFzb24sIHJlZiA9PiB0aGlzLl9yZWZlcmVuY2VzLmdldChyZWYucGlkKT8uaXRlbXNbcmVmLmlkeF0pO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlci5oYW5kbGVFbmRPZkxpZmV0aW1lKGNvbXBsZXRpb25JdGVtLCByKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRoYW5kbGVSZWplY3Rpb24ocGlkOiBudW1iZXIsIGlkeDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbkl0ZW0gPSB0aGlzLl9yZWZlcmVuY2VzLmdldChwaWQpPy5pdGVtc1tpZHhdO1xuXHRcdGlmIChjb21wbGV0aW9uSXRlbSkge1xuXHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFJlamVjdENvbXBsZXRpb25JdGVtICYmIHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFJlamVjdENvbXBsZXRpb25JdGVtKGNvbXBsZXRpb25JdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmVmZXJlbmNlTWFwPFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmZXJlbmNlcyA9IG5ldyBNYXA8bnVtYmVyLCBUPigpO1xuXHRwcml2YXRlIF9pZFBvb2wgPSAxO1xuXG5cdGNyZWF0ZVJlZmVyZW5jZUlkKHZhbHVlOiBUKTogbnVtYmVyIHtcblx0XHRjb25zdCBpZCA9IHRoaXMuX2lkUG9vbCsrO1xuXHRcdHRoaXMuX3JlZmVyZW5jZXMuc2V0KGlkLCB2YWx1ZSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0ZGlzcG9zZVJlZmVyZW5jZUlkKHJlZmVyZW5jZUlkOiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHJlZmVyZW5jZUlkKTtcblx0XHR0aGlzLl9yZWZlcmVuY2VzLmRlbGV0ZShyZWZlcmVuY2VJZCk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0Z2V0KHJlZmVyZW5jZUlkOiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVmZXJlbmNlcy5nZXQocmVmZXJlbmNlSWQpO1xuXHR9XG59XG5cbmNsYXNzIFNpZ25hdHVyZUhlbHBBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuU2lnbmF0dXJlSGVscD4oJ1NpZ25hdHVyZUhlbHAnKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZVNpZ25hdHVyZUhlbHAocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogZXh0SG9zdFByb3RvY29sLklTaWduYXR1cmVIZWxwQ29udGV4dER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVNpZ25hdHVyZUhlbHBEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCB2c2NvZGVDb250ZXh0ID0gdGhpcy5yZXZpdmVDb250ZXh0KGNvbnRleHQpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlU2lnbmF0dXJlSGVscChkb2MsIHBvcywgdG9rZW4sIHZzY29kZUNvbnRleHQpO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Y29uc3QgaWQgPSB0aGlzLl9jYWNoZS5hZGQoW3ZhbHVlXSk7XG5cdFx0XHRyZXR1cm4geyAuLi50eXBlQ29udmVydC5TaWduYXR1cmVIZWxwLmZyb20odmFsdWUpLCBpZCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXZpdmVDb250ZXh0KGNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JU2lnbmF0dXJlSGVscENvbnRleHREdG8pOiB2c2NvZGUuU2lnbmF0dXJlSGVscENvbnRleHQge1xuXHRcdGxldCBhY3RpdmVTaWduYXR1cmVIZWxwOiB2c2NvZGUuU2lnbmF0dXJlSGVscCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udGV4dC5hY3RpdmVTaWduYXR1cmVIZWxwKSB7XG5cdFx0XHRjb25zdCByZXZpdmVkU2lnbmF0dXJlSGVscCA9IHR5cGVDb252ZXJ0LlNpZ25hdHVyZUhlbHAudG8oY29udGV4dC5hY3RpdmVTaWduYXR1cmVIZWxwKTtcblx0XHRcdGNvbnN0IHNhdmVkID0gdGhpcy5fY2FjaGUuZ2V0KGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscC5pZCwgMCk7XG5cdFx0XHRpZiAoc2F2ZWQpIHtcblx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlSGVscCA9IHNhdmVkO1xuXHRcdFx0XHRhY3RpdmVTaWduYXR1cmVIZWxwLmFjdGl2ZVNpZ25hdHVyZSA9IHJldml2ZWRTaWduYXR1cmVIZWxwLmFjdGl2ZVNpZ25hdHVyZTtcblx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlSGVscC5hY3RpdmVQYXJhbWV0ZXIgPSByZXZpdmVkU2lnbmF0dXJlSGVscC5hY3RpdmVQYXJhbWV0ZXI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3RpdmVTaWduYXR1cmVIZWxwID0gcmV2aXZlZFNpZ25hdHVyZUhlbHA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLmNvbnRleHQsIGFjdGl2ZVNpZ25hdHVyZUhlbHAgfTtcblx0fVxuXG5cdHJlbGVhc2VTaWduYXR1cmVIZWxwKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cbn1cblxuY2xhc3MgSW5sYXlIaW50c0FkYXB0ZXIge1xuXG5cdHByaXZhdGUgX2NhY2hlID0gbmV3IENhY2hlPHZzY29kZS5JbmxheUhpbnQ+KCdJbmxheUhpbnRzJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IE1hcDxudW1iZXIsIERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHM6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuSW5sYXlIaW50c1Byb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUlubGF5SGludHMocmVzb3VyY2U6IFVSSSwgcmFuOiBJUmFuZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklJbmxheUhpbnRzRHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCByYW5nZSA9IHR5cGVDb252ZXJ0LlJhbmdlLnRvKHJhbik7XG5cblx0XHRjb25zdCBoaW50cyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVJbmxheUhpbnRzKGRvYywgcmFuZ2UsIHRva2VuKTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoaGludHMpIHx8IGhpbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gYmFkIHJlc3VsdFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0lubGF5SGludHNdIE5PIGlubGF5IGhpbnRzIGZyb20gJyR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9JyBmb3IgcmFuZ2UgJHtKU09OLnN0cmluZ2lmeShyYW4pfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHQvLyBjYW5jZWxsZWQgLT4gcmV0dXJuIHdpdGhvdXQgZnVydGhlciBhZG8sIGVzcCBubyBjYWNoaW5nXG5cdFx0XHQvLyBvZiByZXN1bHRzIGFzIHRoZXkgd2lsbCBsZWFrXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwaWQgPSB0aGlzLl9jYWNoZS5hZGQoaGludHMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnNldChwaWQsIG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmVzdWx0OiBleHRIb3N0UHJvdG9jb2wuSUlubGF5SGludHNEdG8gPSB7IGhpbnRzOiBbXSwgY2FjaGVJZDogcGlkIH07XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBoaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMuX2lzVmFsaWRJbmxheUhpbnQoaGludHNbaV0sIHJhbmdlKSkge1xuXHRcdFx0XHRyZXN1bHQuaGludHMucHVzaCh0aGlzLl9jb252ZXJ0SW5sYXlIaW50KGhpbnRzW2ldLCBbcGlkLCBpXSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbSW5sYXlIaW50c10gJHtyZXN1bHQuaGludHMubGVuZ3RofSBpbmxheSBoaW50cyBmcm9tICcke3RoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfScgZm9yIHJhbmdlICR7SlNPTi5zdHJpbmdpZnkocmFuKX1gKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUlubGF5SGludChpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVJbmxheUhpbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoLi4uaWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaGludCA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVJbmxheUhpbnQoaXRlbSwgdG9rZW4pO1xuXHRcdGlmICghaGludCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9pc1ZhbGlkSW5sYXlIaW50KGhpbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udmVydElubGF5SGludChoaW50LCBpZCk7XG5cdH1cblxuXHRyZWxlYXNlSGludHMoaWQ6IG51bWJlcik6IGFueSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVmFsaWRJbmxheUhpbnQoaGludDogdnNjb2RlLklubGF5SGludCwgcmFuZ2U/OiB2c2NvZGUuUmFuZ2UpOiBib29sZWFuIHtcblx0XHRpZiAoaGludC5sYWJlbC5sZW5ndGggPT09IDAgfHwgQXJyYXkuaXNBcnJheShoaW50LmxhYmVsKSAmJiBoaW50LmxhYmVsLmV2ZXJ5KHBhcnQgPT4gcGFydC52YWx1ZS5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCBpbmxheSBoaW50LCBlbXB0eSBsYWJlbCcsIGhpbnQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocmFuZ2UgJiYgIXJhbmdlLmNvbnRhaW5zKGhpbnQucG9zaXRpb24pKSB7XG5cdFx0XHQvLyBjb25zb2xlLmxvZygnSU5WQUxJRCBpbmxheSBoaW50LCBwb3NpdGlvbiBvdXRzaWRlIHJhbmdlJywgcmFuZ2UsIGhpbnQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRJbmxheUhpbnQoaGludDogdnNjb2RlLklubGF5SGludCwgaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCk6IGV4dEhvc3RQcm90b2NvbC5JSW5sYXlIaW50RHRvIHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGlkWzBdKTtcblx0XHRpZiAoIWRpc3Bvc2FibGVzKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignRGlzcG9zYWJsZVN0b3JlIGlzIG1pc3NpbmcuLi4nKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JSW5sYXlIaW50RHRvID0ge1xuXHRcdFx0bGFiZWw6ICcnLCAvLyBmaWxsLWluIGJlbG93XG5cdFx0XHRjYWNoZUlkOiBpZCxcblx0XHRcdHRvb2x0aXA6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoaGludC50b29sdGlwKSxcblx0XHRcdHBvc2l0aW9uOiB0eXBlQ29udmVydC5Qb3NpdGlvbi5mcm9tKGhpbnQucG9zaXRpb24pLFxuXHRcdFx0dGV4dEVkaXRzOiBoaW50LnRleHRFZGl0cyAmJiBoaW50LnRleHRFZGl0cy5tYXAodHlwZUNvbnZlcnQuVGV4dEVkaXQuZnJvbSksXG5cdFx0XHRraW5kOiBoaW50LmtpbmQgJiYgdHlwZUNvbnZlcnQuSW5sYXlIaW50S2luZC5mcm9tKGhpbnQua2luZCksXG5cdFx0XHRwYWRkaW5nTGVmdDogaGludC5wYWRkaW5nTGVmdCxcblx0XHRcdHBhZGRpbmdSaWdodDogaGludC5wYWRkaW5nUmlnaHQsXG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgaGludC5sYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJlc3VsdC5sYWJlbCA9IGhpbnQubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhcnRzOiBsYW5ndWFnZXMuSW5sYXlIaW50TGFiZWxQYXJ0W10gPSBbXTtcblx0XHRcdHJlc3VsdC5sYWJlbCA9IHBhcnRzO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgaGludC5sYWJlbCkge1xuXHRcdFx0XHRpZiAoIXBhcnQudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0lOVkFMSUQgaW5sYXkgaGludCwgZW1wdHkgbGFiZWwgcGFydCcsIHRoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwYXJ0MjogbGFuZ3VhZ2VzLklubGF5SGludExhYmVsUGFydCA9IHtcblx0XHRcdFx0XHRsYWJlbDogcGFydC52YWx1ZSxcblx0XHRcdFx0XHR0b29sdGlwOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHBhcnQudG9vbHRpcClcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKExvY2F0aW9uLmlzTG9jYXRpb24ocGFydC5sb2NhdGlvbikpIHtcblx0XHRcdFx0XHRwYXJ0Mi5sb2NhdGlvbiA9IHR5cGVDb252ZXJ0LmxvY2F0aW9uLmZyb20ocGFydC5sb2NhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQuY29tbWFuZCkge1xuXHRcdFx0XHRcdHBhcnQyLmNvbW1hbmQgPSB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKHBhcnQuY29tbWFuZCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBhcnRzLnB1c2gocGFydDIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIExpbmtQcm92aWRlckFkYXB0ZXIge1xuXG5cdHByaXZhdGUgX2NhY2hlID0gbmV3IENhY2hlPHZzY29kZS5Eb2N1bWVudExpbms+KCdEb2N1bWVudExpbmsnKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVMaW5rcyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JTGlua3NMaXN0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGxpbmtzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50TGlua3MoZG9jLCB0b2tlbik7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGxpbmtzKSB8fCBsaW5rcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGJhZCByZXN1bHRcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Ly8gY2FuY2VsbGVkIC0+IHJldHVybiB3aXRob3V0IGZ1cnRoZXIgYWRvLCBlc3Agbm8gY2FjaGluZ1xuXHRcdFx0Ly8gb2YgcmVzdWx0cyBhcyB0aGV5IHdpbGwgbGVha1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9wcm92aWRlci5yZXNvbHZlRG9jdW1lbnRMaW5rICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHQvLyBubyByZXNvbHZlIC0+IG5vIGNhY2hpbmdcblx0XHRcdHJldHVybiB7IGxpbmtzOiBsaW5rcy5maWx0ZXIoTGlua1Byb3ZpZGVyQWRhcHRlci5fdmFsaWRhdGVMaW5rKS5tYXAodHlwZUNvbnZlcnQuRG9jdW1lbnRMaW5rLmZyb20pIH07XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY2FjaGUgbGlua3MgZm9yIGZ1dHVyZSByZXNvbHZpbmdcblx0XHRcdGNvbnN0IHBpZCA9IHRoaXMuX2NhY2hlLmFkZChsaW5rcyk7XG5cdFx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JTGlua3NMaXN0RHRvID0geyBsaW5rczogW10sIGNhY2hlSWQ6IHBpZCB9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5rcy5sZW5ndGg7IGkrKykge1xuXG5cdFx0XHRcdGlmICghTGlua1Byb3ZpZGVyQWRhcHRlci5fdmFsaWRhdGVMaW5rKGxpbmtzW2ldKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZHRvOiBleHRIb3N0UHJvdG9jb2wuSUxpbmtEdG8gPSB0eXBlQ29udmVydC5Eb2N1bWVudExpbmsuZnJvbShsaW5rc1tpXSk7XG5cdFx0XHRcdGR0by5jYWNoZUlkID0gW3BpZCwgaV07XG5cdFx0XHRcdHJlc3VsdC5saW5rcy5wdXNoKGR0byk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF92YWxpZGF0ZUxpbmsobGluazogdnNjb2RlLkRvY3VtZW50TGluayk6IGJvb2xlYW4ge1xuXHRcdGlmIChsaW5rLnRhcmdldCAmJiBsaW5rLnRhcmdldC5wYXRoLmxlbmd0aCA+IDUwXzAwMCkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdEUk9QUElORyBsaW5rIGJlY2F1c2UgaXQgaXMgdG9vIGxvbmcnKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlTGluayhpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JTGlua0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50TGluayAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2NhY2hlLmdldCguLi5pZCk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsaW5rID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50TGluayhpdGVtLCB0b2tlbik7XG5cdFx0aWYgKCFsaW5rIHx8ICFMaW5rUHJvdmlkZXJBZGFwdGVyLl92YWxpZGF0ZUxpbmsobGluaykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlQ29udmVydC5Eb2N1bWVudExpbmsuZnJvbShsaW5rKTtcblx0fVxuXG5cdHJlbGVhc2VMaW5rcyhpZDogbnVtYmVyKTogYW55IHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHR9XG59XG5cbmNsYXNzIENvbG9yUHJvdmlkZXJBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudENvbG9yUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlQ29sb3JzKHJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklSYXdDb2xvckluZm9bXT4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgY29sb3JzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50Q29sb3JzKGRvYywgdG9rZW4pO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShjb2xvcnMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbG9ySW5mb3M6IGV4dEhvc3RQcm90b2NvbC5JUmF3Q29sb3JJbmZvW10gPSBjb2xvcnMubWFwKGNpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbG9yOiB0eXBlQ29udmVydC5Db2xvci5mcm9tKGNpLmNvbG9yKSxcblx0XHRcdFx0cmFuZ2U6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20oY2kucmFuZ2UpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHJldHVybiBjb2xvckluZm9zO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvbG9yUHJlc2VudGF0aW9ucyhyZXNvdXJjZTogVVJJLCByYXc6IGV4dEhvc3RQcm90b2NvbC5JUmF3Q29sb3JJbmZvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5JQ29sb3JQcmVzZW50YXRpb25bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCByYW5nZSA9IHR5cGVDb252ZXJ0LlJhbmdlLnRvKHJhdy5yYW5nZSk7XG5cdFx0Y29uc3QgY29sb3IgPSB0eXBlQ29udmVydC5Db2xvci50byhyYXcuY29sb3IpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNvbG9yUHJlc2VudGF0aW9ucyhjb2xvciwgeyBkb2N1bWVudCwgcmFuZ2UgfSwgdG9rZW4pO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQuQ29sb3JQcmVzZW50YXRpb24uZnJvbSk7XG5cdH1cbn1cblxuY2xhc3MgRm9sZGluZ1Byb3ZpZGVyQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgX3Byb3ZpZGVyOiB2c2NvZGUuRm9sZGluZ1JhbmdlUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRm9sZGluZ1JhbmdlcyhyZXNvdXJjZTogVVJJLCBjb250ZXh0OiBsYW5ndWFnZXMuRm9sZGluZ0NvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCByYW5nZXMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRm9sZGluZ1Jhbmdlcyhkb2MsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkocmFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlcy5tYXAodHlwZUNvbnZlcnQuRm9sZGluZ1JhbmdlLmZyb20pO1xuXHR9XG59XG5cbmNsYXNzIFNlbGVjdGlvblJhbmdlQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMocmVzb3VyY2U6IFVSSSwgcG9zOiBJUG9zaXRpb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2VbXVtdPiB7XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvc2l0aW9ucyA9IHBvcy5tYXAodHlwZUNvbnZlcnQuUG9zaXRpb24udG8pO1xuXG5cdFx0Y29uc3QgYWxsUHJvdmlkZXJSYW5nZXMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlU2VsZWN0aW9uUmFuZ2VzKGRvY3VtZW50LCBwb3NpdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoIWlzTm9uRW1wdHlBcnJheShhbGxQcm92aWRlclJhbmdlcykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKGFsbFByb3ZpZGVyUmFuZ2VzLmxlbmd0aCAhPT0gcG9zaXRpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdCQUQgc2VsZWN0aW9uIHJhbmdlcywgcHJvdmlkZXIgbXVzdCByZXR1cm4gcmFuZ2VzIGZvciBlYWNoIHBvc2l0aW9uJyk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFJlc3VsdHM6IGxhbmd1YWdlcy5TZWxlY3Rpb25SYW5nZVtdW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBvc2l0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb25lUmVzdWx0OiBsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2VbXSA9IFtdO1xuXHRcdFx0YWxsUmVzdWx0cy5wdXNoKG9uZVJlc3VsdCk7XG5cblx0XHRcdGxldCBsYXN0OiB2c2NvZGUuUG9zaXRpb24gfCB2c2NvZGUuUmFuZ2UgPSBwb3NpdGlvbnNbaV07XG5cdFx0XHRsZXQgc2VsZWN0aW9uUmFuZ2UgPSBhbGxQcm92aWRlclJhbmdlc1tpXTtcblxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKCFzZWxlY3Rpb25SYW5nZS5yYW5nZS5jb250YWlucyhsYXN0KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSU5WQUxJRCBzZWxlY3Rpb24gcmFuZ2UsIG11c3QgY29udGFpbiB0aGUgcHJldmlvdXMgcmFuZ2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbmVSZXN1bHQucHVzaCh0eXBlQ29udmVydC5TZWxlY3Rpb25SYW5nZS5mcm9tKHNlbGVjdGlvblJhbmdlKSk7XG5cdFx0XHRcdGlmICghc2VsZWN0aW9uUmFuZ2UucGFyZW50KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdCA9IHNlbGVjdGlvblJhbmdlLnJhbmdlO1xuXHRcdFx0XHRzZWxlY3Rpb25SYW5nZSA9IHNlbGVjdGlvblJhbmdlLnBhcmVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFsbFJlc3VsdHM7XG5cdH1cbn1cblxuY2xhc3MgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkUG9vbCA9IG5ldyBJZEdlbmVyYXRvcignJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbT4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeVByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVNlc3Npb24odXJpOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDYWxsSGllcmFyY2h5SXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHVyaSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcmVwYXJlQ2FsbEhpZXJhcmNoeShkb2MsIHBvcywgdG9rZW4pO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5faWRQb29sLm5leHRJZCgpO1xuXHRcdHRoaXMuX2NhY2hlLnNldChzZXNzaW9uSWQsIG5ldyBNYXAoKSk7XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShpdGVtcykpIHtcblx0XHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgaXRlbSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW3RoaXMuX2NhY2hlQW5kQ29udmVydEl0ZW0oc2Vzc2lvbklkLCBpdGVtcyldO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDYWxsc1RvKHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUluY29taW5nQ2FsbER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2l0ZW1Gcm9tQ2FjaGUoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIGNhbGwgaGllcmFyY2h5IGl0ZW0nKTtcblx0XHR9XG5cdFx0Y29uc3QgY2FsbHMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbHMoaXRlbSwgdG9rZW4pO1xuXHRcdGlmICghY2FsbHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBjYWxscy5tYXAoY2FsbCA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmcm9tOiB0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgY2FsbC5mcm9tKSxcblx0XHRcdFx0ZnJvbVJhbmdlczogY2FsbC5mcm9tUmFuZ2VzLm1hcChyID0+IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20ocikpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNhbGxzRnJvbShzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklPdXRnb2luZ0NhbGxEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtRnJvbUNhY2hlKHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbWlzc2luZyBjYWxsIGhpZXJhcmNoeSBpdGVtJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbGxzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxzKGl0ZW0sIHRva2VuKTtcblx0XHRpZiAoIWNhbGxzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FsbHMubWFwKGNhbGwgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG86IHRoaXMuX2NhY2hlQW5kQ29udmVydEl0ZW0oc2Vzc2lvbklkLCBjYWxsLnRvKSxcblx0XHRcdFx0ZnJvbVJhbmdlczogY2FsbC5mcm9tUmFuZ2VzLm1hcChyID0+IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20ocikpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cmVsZWFzZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlQW5kQ29udmVydEl0ZW0oc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSk6IGV4dEhvc3RQcm90b2NvbC5JQ2FsbEhpZXJhcmNoeUl0ZW1EdG8ge1xuXHRcdGNvbnN0IG1hcCA9IHRoaXMuX2NhY2hlLmdldChzZXNzaW9uSWQpITtcblx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DYWxsSGllcmFyY2h5SXRlbS5mcm9tKGl0ZW0sIHNlc3Npb25JZCwgbWFwLnNpemUudG9TdHJpbmcoMzYpKTtcblx0XHRtYXAuc2V0KGR0by5faXRlbUlkLCBpdGVtKTtcblx0XHRyZXR1cm4gZHRvO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXRlbUZyb21DYWNoZShzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcpOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hcCA9IHRoaXMuX2NhY2hlLmdldChzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBtYXA/LmdldChpdGVtSWQpO1xuXHR9XG59XG5cbmNsYXNzIFR5cGVIaWVyYXJjaHlBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZFBvb2wgPSBuZXcgSWRHZW5lcmF0b3IoJycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCB2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW0+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLlR5cGVIaWVyYXJjaHlQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVTZXNzaW9uKHVyaTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudCh1cmkpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJlcGFyZVR5cGVIaWVyYXJjaHkoZG9jLCBwb3MsIHRva2VuKTtcblx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX2lkUG9vbC5uZXh0SWQoKTtcblx0XHR0aGlzLl9jYWNoZS5zZXQoc2Vzc2lvbklkLCBuZXcgTWFwKCkpO1xuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG5cdFx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy5fY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQsIGl0ZW0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFt0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgaXRlbXMpXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwcm92aWRlU3VwZXJ0eXBlcyhzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2l0ZW1Gcm9tQ2FjaGUoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIHR5cGUgaGllcmFyY2h5IGl0ZW0nKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VwZXJ0eXBlcyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVUeXBlSGllcmFyY2h5U3VwZXJ0eXBlcyhpdGVtLCB0b2tlbik7XG5cdFx0aWYgKCFzdXBlcnR5cGVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXJ0eXBlcy5tYXAoc3VwZXJ0eXBlID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgc3VwZXJ0eXBlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVTdWJ0eXBlcyhzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2l0ZW1Gcm9tQ2FjaGUoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIHR5cGUgaGllcmFyY2h5IGl0ZW0nKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VidHlwZXMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlVHlwZUhpZXJhcmNoeVN1YnR5cGVzKGl0ZW0sIHRva2VuKTtcblx0XHRpZiAoIXN1YnR5cGVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VidHlwZXMubWFwKHN1YnR5cGUgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NhY2hlQW5kQ29udmVydEl0ZW0oc2Vzc2lvbklkLCBzdWJ0eXBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlbGVhc2VTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZDogc3RyaW5nLCBpdGVtOiB2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW0pOiBleHRIb3N0UHJvdG9jb2wuSVR5cGVIaWVyYXJjaHlJdGVtRHRvIHtcblx0XHRjb25zdCBtYXAgPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkKSE7XG5cdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuVHlwZUhpZXJhcmNoeUl0ZW0uZnJvbShpdGVtLCBzZXNzaW9uSWQsIG1hcC5zaXplLnRvU3RyaW5nKDM2KSk7XG5cdFx0bWFwLnNldChkdG8uX2l0ZW1JZCwgaXRlbSk7XG5cdFx0cmV0dXJuIGR0bztcblx0fVxuXG5cdHByaXZhdGUgX2l0ZW1Gcm9tQ2FjaGUoc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nKTogdnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXAgPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gbWFwPy5nZXQoaXRlbUlkKTtcblx0fVxufVxuXG5jbGFzcyBEb2N1bWVudERyb3BFZGl0QWRhcHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgQ2FjaGU8dnNjb2RlLkRvY3VtZW50RHJvcEVkaXQ+KCdEb2N1bWVudERyb3BFZGl0Jyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlc1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRPbkRyb3BFZGl0cyhyZXF1ZXN0SWQ6IG51bWJlciwgdXJpOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIGRhdGFUcmFuc2ZlckR0bzogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50RHJvcEVkaXREdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudCh1cmkpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblx0XHRjb25zdCBkYXRhVHJhbnNmZXIgPSB0eXBlQ29udmVydC5EYXRhVHJhbnNmZXIudG9EYXRhVHJhbnNmZXIoZGF0YVRyYW5zZmVyRHRvLCBhc3luYyAoaWQpID0+IHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVEb2N1bWVudE9uRHJvcEZpbGVEYXRhKHRoaXMuX2hhbmRsZSwgcmVxdWVzdElkLCBpZCkpLmJ1ZmZlcjtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50RHJvcEVkaXRzKGRvYywgcG9zLCBkYXRhVHJhbnNmZXIsIHRva2VuKTtcblx0XHRpZiAoIWVkaXRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzQXJyYXkgPSBhc0FycmF5KGVkaXRzKTtcblx0XHRjb25zdCBjYWNoZUlkID0gdGhpcy5fY2FjaGUuYWRkKGVkaXRzQXJyYXkpO1xuXG5cdFx0cmV0dXJuIGVkaXRzQXJyYXkubWFwKChlZGl0LCBpKTogZXh0SG9zdFByb3RvY29sLklEb2N1bWVudERyb3BFZGl0RHRvID0+ICh7XG5cdFx0XHRfY2FjaGVJZDogW2NhY2hlSWQsIGldLFxuXHRcdFx0dGl0bGU6IGVkaXQudGl0bGUgPz8gbG9jYWxpemUoJ2RlZmF1bHREcm9wTGFiZWwnLCBcIkRyb3AgdXNpbmcgJ3swfScgZXh0ZW5zaW9uXCIsIHRoaXMuX2V4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCB0aGlzLl9leHRlbnNpb24ubmFtZSksXG5cdFx0XHRraW5kOiBlZGl0LmtpbmQ/LnZhbHVlLFxuXHRcdFx0eWllbGRUbzogZWRpdC55aWVsZFRvPy5tYXAoeCA9PiB4LnZhbHVlKSxcblx0XHRcdGluc2VydFRleHQ6IHR5cGVvZiBlZGl0Lmluc2VydFRleHQgPT09ICdzdHJpbmcnID8gZWRpdC5pbnNlcnRUZXh0IDogeyBzbmlwcGV0OiBlZGl0Lmluc2VydFRleHQudmFsdWUgfSxcblx0XHRcdGFkZGl0aW9uYWxFZGl0OiBlZGl0LmFkZGl0aW9uYWxFZGl0ID8gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKGVkaXQuYWRkaXRpb25hbEVkaXQsIHVuZGVmaW5lZCkgOiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZURyb3BFZGl0KGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBhZGRpdGlvbmFsRWRpdD86IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byB9PiB7XG5cdFx0Y29uc3QgW3Nlc3Npb25JZCwgaXRlbUlkXSA9IGlkO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSB8fCAhdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50RHJvcEVkaXQpIHtcblx0XHRcdHJldHVybiB7fTsgLy8gdGhpcyBzaG91bGQgbm90IGhhcHBlbi4uLlxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkSXRlbSA9IChhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlRG9jdW1lbnREcm9wRWRpdChpdGVtLCB0b2tlbikpID8/IGl0ZW07XG5cdFx0Y29uc3QgYWRkaXRpb25hbEVkaXQgPSByZXNvbHZlZEl0ZW0uYWRkaXRpb25hbEVkaXQgPyB0eXBlQ29udmVydC5Xb3Jrc3BhY2VFZGl0LmZyb20ocmVzb2x2ZWRJdGVtLmFkZGl0aW9uYWxFZGl0LCB1bmRlZmluZWQpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7IGFkZGl0aW9uYWxFZGl0IH07XG5cdH1cblxuXHRyZWxlYXNlRHJvcEVkaXRzKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cbn1cblxudHlwZSBBZGFwdGVyID0gRG9jdW1lbnRTeW1ib2xBZGFwdGVyIHwgQ29kZUxlbnNBZGFwdGVyIHwgRGVmaW5pdGlvbkFkYXB0ZXIgfCBIb3ZlckFkYXB0ZXJcblx0fCBEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIgfCBNdWx0aURvY3VtZW50SGlnaGxpZ2h0QWRhcHRlciB8IFJlZmVyZW5jZUFkYXB0ZXIgfCBDb2RlQWN0aW9uQWRhcHRlclxuXHR8IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIgfCBEb2N1bWVudEZvcm1hdHRpbmdBZGFwdGVyIHwgUmFuZ2VGb3JtYXR0aW5nQWRhcHRlclxuXHR8IE9uVHlwZUZvcm1hdHRpbmdBZGFwdGVyIHwgTmF2aWdhdGVUeXBlQWRhcHRlciB8IFJlbmFtZUFkYXB0ZXJcblx0fCBDb21wbGV0aW9uc0FkYXB0ZXIgfCBTaWduYXR1cmVIZWxwQWRhcHRlciB8IExpbmtQcm92aWRlckFkYXB0ZXIgfCBJbXBsZW1lbnRhdGlvbkFkYXB0ZXJcblx0fCBUeXBlRGVmaW5pdGlvbkFkYXB0ZXIgfCBDb2xvclByb3ZpZGVyQWRhcHRlciB8IEZvbGRpbmdQcm92aWRlckFkYXB0ZXIgfCBEZWNsYXJhdGlvbkFkYXB0ZXJcblx0fCBTZWxlY3Rpb25SYW5nZUFkYXB0ZXIgfCBDYWxsSGllcmFyY2h5QWRhcHRlciB8IFR5cGVIaWVyYXJjaHlBZGFwdGVyXG5cdHwgRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIgfCBEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNBZGFwdGVyXG5cdHwgRXZhbHVhdGFibGVFeHByZXNzaW9uQWRhcHRlciB8IElubGluZVZhbHVlc0FkYXB0ZXJcblx0fCBMaW5rZWRFZGl0aW5nUmFuZ2VBZGFwdGVyIHwgSW5sYXlIaW50c0FkYXB0ZXIgfCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlclxuXHR8IERvY3VtZW50RHJvcEVkaXRBZGFwdGVyIHwgTmV3U3ltYm9sTmFtZXNBZGFwdGVyO1xuXG5jbGFzcyBBZGFwdGVyRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGFkYXB0ZXI6IEFkYXB0ZXIsXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25cblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzIGV4dGVuZHMgQ29yZURpc3Bvc2FibGUgaW1wbGVtZW50cyBleHRIb3N0UHJvdG9jb2wuRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZGFwdGVyID0gbmV3IE1hcDxudW1iZXIsIEFkYXB0ZXJEYXRhPigpO1xuXG5cdHByaXZhdGUgX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZTogdnNjb2RlLklubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZTtcblx0cHVibGljIGdldCBpbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUoKTogdnNjb2RlLklubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JTWFpbkNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWFnbm9zdGljczogRXh0SG9zdERpYWdub3N0aWNzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FwaURlcHJlY2F0aW9uOiBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25UZWxlbWV0cnk6IElFeHRIb3N0VGVsZW1ldHJ5XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShleHRIb3N0UHJvdG9jb2wuTWFpbkNvbnRleHQuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMpO1xuXHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSA9IHtcblx0XHRcdGNvZGVVbmlmaWNhdGlvbjogZmFsc2UsXG5cdFx0XHRtb2RlbFVuaWZpY2F0aW9uOiBmYWxzZSxcblx0XHRcdGV4dGVuc2lvblVuaWZpY2F0aW9uOiBmYWxzZSxcblx0XHRcdGV4cEFzc2lnbm1lbnRzOiBbXVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBBcnJheTxleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50RmlsdGVyRHRvPiB7XG5cdFx0cmV0dXJuIHR5cGVDb252ZXJ0LkRvY3VtZW50U2VsZWN0b3IuZnJvbShzZWxlY3RvciwgdGhpcy5fdXJpVHJhbnNmb3JtZXIsIGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZTogbnVtYmVyKTogRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2FkYXB0ZXIuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmV4dEhhbmRsZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5faGFuZGxlUG9vbCsrO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2l0aEFkYXB0ZXI8QSwgUj4oXG5cdFx0aGFuZGxlOiBudW1iZXIsXG5cdFx0Y3RvcjogeyBuZXcoLi4uYXJnczogYW55W10pOiBBIH0sXG5cdFx0Y2FsbGJhY2s6IChhZGFwdGVyOiBBLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbikgPT4gUHJvbWlzZTxSPixcblx0XHRmYWxsYmFja1ZhbHVlOiBSLFxuXHRcdHRva2VuVG9SYWNlQWdhaW5zdDogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQsXG5cdFx0ZG9Ob3RMb2c6IGJvb2xlYW4gPSBmYWxzZVxuXHQpOiBQcm9taXNlPFI+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fYWRhcHRlci5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWRhdGEgfHwgIShkYXRhLmFkYXB0ZXIgaW5zdGFuY2VvZiBjdG9yKSkge1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdDE6IG51bWJlciA9IERhdGUubm93KCk7XG5cdFx0aWYgKCFkb05vdExvZykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7ZGF0YS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX1dIElOVk9LRSBwcm92aWRlciAnJHtjYWxsYmFjay50b1N0cmluZygpLnJlcGxhY2UoL1tcXHJcXG5dL2csICcnKX0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY2FsbGJhY2soZGF0YS5hZGFwdGVyLCBkYXRhLmV4dGVuc2lvbik7XG5cblx0XHQvLyBsb2dnaW5nLHRyYWNpbmdcblx0XHRQcm9taXNlLnJlc29sdmUocmVzdWx0KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7ZGF0YS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX1dIHByb3ZpZGVyIEZBSUxFRGApO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uVGVsZW1ldHJ5Lm9uRXh0ZW5zaW9uRXJyb3IoZGF0YS5leHRlbnNpb24uaWRlbnRpZmllciwgZXJyKTtcblx0XHRcdH1cblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICghZG9Ob3RMb2cpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7ZGF0YS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX1dIHByb3ZpZGVyIERPTkUgYWZ0ZXIgJHtEYXRlLm5vdygpIC0gdDF9bXNgKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKHRva2VuVG9SYWNlQWdhaW5zdCkpIHtcblx0XHRcdHJldHVybiByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocmVzdWx0LCB0b2tlblRvUmFjZUFnYWluc3QpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkTmV3QWRhcHRlcihhZGFwdGVyOiBBZGFwdGVyLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbmV4dEhhbmRsZSgpO1xuXHRcdHRoaXMuX2FkYXB0ZXIuc2V0KGhhbmRsZSwgbmV3IEFkYXB0ZXJEYXRhKGFkYXB0ZXIsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0TGFiZWwoZXh0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBleHQuZGlzcGxheU5hbWUgfHwgZXh0Lm5hbWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0SWQoZXh0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBleHQuaWRlbnRpZmllci52YWx1ZTtcblx0fVxuXG5cdC8vIC0tLSBvdXRsaW5lXG5cblx0cmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERvY3VtZW50U3ltYm9sQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IChtZXRhZGF0YSAmJiBtZXRhZGF0YS5sYWJlbCkgfHwgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX2V4dExhYmVsKGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIGRpc3BsYXlOYW1lKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnRTeW1ib2xBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZURvY3VtZW50U3ltYm9scyhVUkkucmV2aXZlKHJlc291cmNlKSwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBjb2RlIGxlbnNcblxuXHRyZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25leHRIYW5kbGUoKTtcblx0XHRjb25zdCBldmVudEhhbmRsZSA9IHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZUNvZGVMZW5zZXMgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9uZXh0SGFuZGxlKCkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9hZGFwdGVyLnNldChoYW5kbGUsIG5ldyBBZGFwdGVyRGF0YShuZXcgQ29kZUxlbnNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCBwcm92aWRlciwgZXh0ZW5zaW9uLCB0aGlzLl9leHRlbnNpb25UZWxlbWV0cnksIHRoaXMuX2xvZ1NlcnZpY2UpLCBleHRlbnNpb24pKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDb2RlTGVuc1N1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBldmVudEhhbmRsZSk7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblxuXHRcdGlmIChldmVudEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZUNvZGVMZW5zZXMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXRDb2RlTGVuc0V2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZUNvZGVMZW5zZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNMaXN0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ29kZUxlbnNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNvZGVMZW5zZXMoVVJJLnJldml2ZShyZXNvdXJjZSksIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbiwgcmVzb3VyY2Uuc2NoZW1lID09PSAnb3V0cHV0Jyk7XG5cdH1cblxuXHQkcmVzb2x2ZUNvZGVMZW5zKGhhbmRsZTogbnVtYmVyLCBzeW1ib2w6IGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNEdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDb2RlTGVuc0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVMZW5zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlc29sdmVDb2RlTGVucyhzeW1ib2wsIHRva2VuKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0JHJlbGVhc2VDb2RlTGVuc2VzKGhhbmRsZTogbnVtYmVyLCBjYWNoZUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVMZW5zQWRhcHRlciwgYWRhcHRlciA9PiBQcm9taXNlLnJlc29sdmUoYWRhcHRlci5yZWxlYXNlQ29kZUxlbnNlcyhjYWNoZUlkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdC8vIC0tLSBkZWNsYXJhdGlvblxuXG5cdHJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERlZmluaXRpb25BZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRlZmluaXRpb25TdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRGVmaW5pdGlvbihoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRGVmaW5pdGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRGVmaW5pdGlvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSwgW10sIHRva2VuKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgRGVjbGFyYXRpb25BZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRlY2xhcmF0aW9uU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZURlY2xhcmF0aW9uKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEZWNsYXJhdGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRGVjbGFyYXRpb24oVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbiksIFtdLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IEltcGxlbWVudGF0aW9uQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJJbXBsZW1lbnRhdGlvblN1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVJbXBsZW1lbnRhdGlvbihoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW1wbGVtZW50YXRpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUltcGxlbWVudGF0aW9uKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pLCBbXSwgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBUeXBlRGVmaW5pdGlvbkFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyVHlwZURlZmluaXRpb25TdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlVHlwZURlZmluaXRpb24oaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFR5cGVEZWZpbml0aW9uQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVUeXBlRGVmaW5pdGlvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSwgW10sIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBleHRyYSBpbmZvXG5cblx0cmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSG92ZXJQcm92aWRlciwgZXh0ZW5zaW9uSWQ/OiBFeHRlbnNpb25JZGVudGlmaWVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IEhvdmVyQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlSG92ZXIoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuSG92ZXJDb250ZXh0PHsgaWQ6IG51bWJlciB9PiB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCk6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLkhvdmVyV2l0aElkIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSG92ZXJBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUhvdmVyKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlSG92ZXIoaGFuZGxlOiBudW1iZXIsIGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIEhvdmVyQWRhcHRlciwgYWRhcHRlciA9PiBQcm9taXNlLnJlc29sdmUoYWRhcHRlci5yZWxlYXNlSG92ZXIoaWQpKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGRlYnVnIGhvdmVyXG5cblx0cmVnaXN0ZXJFdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyLCBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgRXZhbHVhdGFibGVFeHByZXNzaW9uQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJFdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZUV2YWx1YXRhYmxlRXhwcmVzc2lvbihoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIEV2YWx1YXRhYmxlRXhwcmVzc2lvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRXZhbHVhdGFibGVFeHByZXNzaW9uKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBkZWJ1ZyBpbmxpbmUgdmFsdWVzXG5cblx0cmVnaXN0ZXJJbmxpbmVWYWx1ZXNQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLklubGluZVZhbHVlc1Byb3ZpZGVyLCBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cblx0XHRjb25zdCBldmVudEhhbmRsZSA9IHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZUlubGluZVZhbHVlcyA9PT0gJ2Z1bmN0aW9uJyA/IHRoaXMuX25leHRIYW5kbGUoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBJbmxpbmVWYWx1ZXNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVySW5saW5lVmFsdWVzUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBldmVudEhhbmRsZSk7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblxuXHRcdGlmIChldmVudEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZUlubGluZVZhbHVlcyEoXyA9PiB0aGlzLl9wcm94eS4kZW1pdElubGluZVZhbHVlc0V2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JHByb3ZpZGVJbmxpbmVWYWx1ZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlLCBjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSUlubGluZVZhbHVlQ29udGV4dER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuSW5saW5lVmFsdWVbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGluZVZhbHVlc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlSW5saW5lVmFsdWVzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZSwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBvY2N1cnJlbmNlc1xuXG5cdHJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgRG9jdW1lbnRIaWdobGlnaHRBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0cmVnaXN0ZXJNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5NdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgTXVsdGlEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50SGlnaGxpZ2h0QWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHByb3ZpZGVNdWx0aURvY3VtZW50SGlnaGxpZ2h0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIG90aGVyTW9kZWxzOiBVcmlDb21wb25lbnRzW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLk11bHRpRG9jdW1lbnRIaWdobGlnaHRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE11bHRpRG9jdW1lbnRIaWdobGlnaHRBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgb3RoZXJNb2RlbHMubWFwKG1vZGVsID0+IFVSSS5yZXZpdmUobW9kZWwpKSwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBsaW5rZWQgZWRpdGluZ1xuXG5cdHJlZ2lzdGVyTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5MaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBMaW5rZWRFZGl0aW5nUmFuZ2VBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlTGlua2VkRWRpdGluZ1JhbmdlcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklMaW5rZWRFZGl0aW5nUmFuZ2VzRHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgTGlua2VkRWRpdGluZ1JhbmdlQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBhZGFwdGVyLnByb3ZpZGVMaW5rZWRFZGl0aW5nUmFuZ2VzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdFx0aWYgKHJlcykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlczogcmVzLnJhbmdlcyxcblx0XHRcdFx0XHR3b3JkUGF0dGVybjogcmVzLndvcmRQYXR0ZXJuID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChyZXMud29yZFBhdHRlcm4pIDogdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0sIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0Ly8gLS0tIHJlZmVyZW5jZXNcblxuXHRyZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuUmVmZXJlbmNlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgUmVmZXJlbmNlQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJSZWZlcmVuY2VTdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlUmVmZXJlbmNlcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5SZWZlcmVuY2VDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgUmVmZXJlbmNlQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVSZWZlcmVuY2VzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBjb2RlIGFjdGlvbnNcblxuXHRyZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuQ29kZUFjdGlvblByb3ZpZGVyTWV0YWRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgQ29kZUFjdGlvbkFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIsIHRoaXMuX2RpYWdub3N0aWNzLCBwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSwgZXh0ZW5zaW9uLCB0aGlzLl9hcGlEZXByZWNhdGlvbiksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ29kZUFjdGlvblN1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB7XG5cdFx0XHRwcm92aWRlZEtpbmRzOiBtZXRhZGF0YT8ucHJvdmlkZWRDb2RlQWN0aW9uS2luZHM/Lm1hcChraW5kID0+IGtpbmQudmFsdWUpLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogbWV0YWRhdGE/LmRvY3VtZW50YXRpb24/Lm1hcCh4ID0+ICh7XG5cdFx0XHRcdGtpbmQ6IHgua2luZC52YWx1ZSxcblx0XHRcdFx0Y29tbWFuZDogdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoeC5jb21tYW5kLCBzdG9yZSksXG5cdFx0XHR9KSlcblx0XHR9LCBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fZXh0TGFiZWwoZXh0ZW5zaW9uKSwgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX2V4dElkKGV4dGVuc2lvbiksIEJvb2xlYW4ocHJvdmlkZXIucmVzb2x2ZUNvZGVBY3Rpb24pKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXG5cdCRwcm92aWRlQ29kZUFjdGlvbnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZU9yU2VsZWN0aW9uOiBJUmFuZ2UgfCBJU2VsZWN0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDb2RlQWN0aW9uTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVBY3Rpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNvZGVBY3Rpb25zKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZU9yU2VsZWN0aW9uLCBjb250ZXh0LCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlc29sdmVDb2RlQWN0aW9uKGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgZWRpdD86IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0bzsgY29tbWFuZD86IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ29kZUFjdGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlQ29kZUFjdGlvbihpZCwgdG9rZW4pLCB7fSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRyZWxlYXNlQ29kZUFjdGlvbnMoaGFuZGxlOiBudW1iZXIsIGNhY2hlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ29kZUFjdGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZUNvZGVBY3Rpb25zKGNhY2hlSWQpKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGZvcm1hdHRpbmdcblxuXHRyZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBEb2N1bWVudEZvcm1hdHRpbmdBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50Rm9ybWF0dGluZ0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoVVJJLnJldml2ZShyZXNvdXJjZSksIG9wdGlvbnMsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgY2FuRm9ybWF0TXVsdGlwbGVSYW5nZXMgPSB0eXBlb2YgcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzID09PSAnZnVuY3Rpb24nO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IFJhbmdlRm9ybWF0dGluZ0FkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUmFuZ2VGb3JtYXR0aW5nU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUsIGNhbkZvcm1hdE11bHRpcGxlUmFuZ2VzKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgUmFuZ2VGb3JtYXR0aW5nQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZSwgb3B0aW9ucywgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRSYW5nZXNGb3JtYXR0aW5nRWRpdHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZXM6IElSYW5nZVtdLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBSYW5nZUZvcm1hdHRpbmdBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZXMsIG9wdGlvbnMsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5PblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCB0cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgT25UeXBlRm9ybWF0dGluZ0FkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB0cmlnZ2VyQ2hhcmFjdGVycywgZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNoOiBzdHJpbmcsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE9uVHlwZUZvcm1hdHRpbmdBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cyhVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIGNoLCBvcHRpb25zLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0Ly8gLS0tIG5hdmlnYXRlIHR5cGVzXG5cblx0cmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXI6IHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBOYXZpZ2F0ZVR5cGVBZGFwdGVyKHByb3ZpZGVyLCB0aGlzLl9sb2dTZXJ2aWNlKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJOYXZpZ2F0ZVR5cGVTdXBwb3J0KGhhbmRsZSwgdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2VTeW1ib2wgPT09ICdmdW5jdGlvbicpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMoaGFuZGxlOiBudW1iZXIsIHNlYXJjaDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlU3ltYm9sc0R0bz4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE5hdmlnYXRlVHlwZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlV29ya3NwYWNlU3ltYm9scyhzZWFyY2gsIHRva2VuKSwgeyBzeW1ib2xzOiBbXSB9LCB0b2tlbik7XG5cdH1cblxuXHQkcmVzb2x2ZVdvcmtzcGFjZVN5bWJvbChoYW5kbGU6IG51bWJlciwgc3ltYm9sOiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZVN5bWJvbER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZVN5bWJvbER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE5hdmlnYXRlVHlwZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sKHN5bWJvbCwgdG9rZW4pLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkcmVsZWFzZVdvcmtzcGFjZVN5bWJvbHMoaGFuZGxlOiBudW1iZXIsIGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE5hdmlnYXRlVHlwZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZWxlYXNlV29ya3NwYWNlU3ltYm9scyhpZCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSByZW5hbWVcblxuXHRyZWdpc3RlclJlbmFtZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuUmVuYW1lUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgUmVuYW1lQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyLCB0aGlzLl9sb2dTZXJ2aWNlKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJSZW5hbWVTdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgUmVuYW1lQWRhcHRlci5zdXBwb3J0c1Jlc29sdmluZyhwcm92aWRlcikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVJlbmFtZUVkaXRzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgbmV3TmFtZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFJlbmFtZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlUmVuYW1lRWRpdHMoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCBuZXdOYW1lLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlc29sdmVSZW5hbWVMb2NhdGlvbihoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuUmVuYW1lTG9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBSZW5hbWVBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVzb2x2ZVJlbmFtZUxvY2F0aW9uKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdHJlZ2lzdGVyTmV3U3ltYm9sTmFtZXNQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLk5ld1N5bWJvbE5hbWVzUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgTmV3U3ltYm9sTmFtZXNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIsIHRoaXMuX2xvZ1NlcnZpY2UpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3Rlck5ld1N5bWJvbE5hbWVzUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHN1cHBvcnRzQXV0b21hdGljTmV3U3ltYm9sTmFtZXNUcmlnZ2VyS2luZChoYW5kbGU6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihcblx0XHRcdGhhbmRsZSxcblx0XHRcdE5ld1N5bWJvbE5hbWVzQWRhcHRlcixcblx0XHRcdGFkYXB0ZXIgPT4gYWRhcHRlci5zdXBwb3J0c0F1dG9tYXRpY05ld1N5bWJvbE5hbWVzVHJpZ2dlcktpbmQoKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblx0fVxuXG5cdCRwcm92aWRlTmV3U3ltYm9sTmFtZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlLCB0cmlnZ2VyS2luZDogbGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTmV3U3ltYm9sTmFtZVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgTmV3U3ltYm9sTmFtZXNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZU5ld1N5bWJvbE5hbWVzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZSwgdHJpZ2dlcktpbmQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyNyZWdpb24gc2VtYW50aWMgY29sb3JpbmdcblxuXHRyZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciwgbGVnZW5kOiB2c2NvZGUuU2VtYW50aWNUb2tlbnNMZWdlbmQpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSAodHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2VtYW50aWNUb2tlbnMgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9uZXh0SGFuZGxlKCkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIGxlZ2VuZCwgZXZlbnRIYW5kbGUpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2VtYW50aWNUb2tlbnMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXREb2N1bWVudFNlbWFudGljVG9rZW5zRXZlbnQoZXZlbnRIYW5kbGUpKTtcblx0XHRcdHJlc3VsdCA9IERpc3Bvc2FibGUuZnJvbShyZXN1bHQsIHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHByZXZpb3VzUmVzdWx0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlciB8IG51bGw+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwcmV2aW91c1Jlc3VsdElkLCB0b2tlbiksIG51bGwsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhoYW5kbGU6IG51bWJlciwgc2VtYW50aWNDb2xvcmluZ1Jlc3VsdElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVsZWFzZURvY3VtZW50U2VtYW50aWNDb2xvcmluZyhzZW1hbnRpY0NvbG9yaW5nUmVzdWx0SWQpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIsIGxlZ2VuZDogdnNjb2RlLlNlbWFudGljVG9rZW5zTGVnZW5kKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSAodHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2VtYW50aWNUb2tlbnMgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9uZXh0SGFuZGxlKCkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgbGVnZW5kLCBldmVudEhhbmRsZSk7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblxuXHRcdGlmIChldmVudEhhbmRsZSkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VTZW1hbnRpY1Rva2VucyEoXyA9PiB0aGlzLl9wcm94eS4kZW1pdERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0V2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2VucyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXIgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMoVVJJLnJldml2ZShyZXNvdXJjZSksIHJhbmdlLCB0b2tlbiksIG51bGwsIHRva2VuKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vIC0tLSBzdWdnZXN0aW9uXG5cblx0cmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgdHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IENvbXBsZXRpb25zQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlciwgcHJvdmlkZXIsIHRoaXMuX2FwaURlcHJlY2F0aW9uLCBleHRlbnNpb24pLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNvbXBsZXRpb25zUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB0cmlnZ2VyQ2hhcmFjdGVycywgQ29tcGxldGlvbnNBZGFwdGVyLnN1cHBvcnRzUmVzb2x2aW5nKHByb3ZpZGVyKSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb21wbGV0aW9uc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZXNvbHZlQ29tcGxldGlvbkl0ZW0oaGFuZGxlOiBudW1iZXIsIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvbXBsZXRpb25zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbShpZCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlQ29tcGxldGlvbkl0ZW1zKGhhbmRsZTogbnVtYmVyLCBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb21wbGV0aW9uc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZWxlYXNlQ29tcGxldGlvbkl0ZW1zKGlkKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGdob3N0IHRleHRcblxuXHRyZWdpc3RlcklubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uSXRlbVByb3ZpZGVyLCBtZXRhZGF0YTogdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtUHJvdmlkZXJNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBhZGFwdGVyID0gbmV3IElubGluZUNvbXBsZXRpb25BZGFwdGVyKGV4dGVuc2lvbiwgdGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgdGhpcy5fY29tbWFuZHMuY29udmVydGVyKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKGFkYXB0ZXIsIGV4dGVuc2lvbik7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblxuXHRcdGNvbnN0IHN1cHBvcnRzT25EaWRDaGFuZ2UgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpICYmIHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZSA9PT0gJ2Z1bmN0aW9uJztcblx0XHRpZiAoc3VwcG9ydHNPbkRpZENoYW5nZSkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2UhKGUgPT4gdGhpcy5fcHJveHkuJGVtaXRJbmxpbmVDb21wbGV0aW9uc0NoYW5nZShoYW5kbGUsIGUgPyB7IGRhdGE6IGUuZGF0YSB9IDogdW5kZWZpbmVkKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm8gPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpICYmIHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZU1vZGVsSW5mbyA9PT0gJ2Z1bmN0aW9uJztcblx0XHRpZiAoc3VwcG9ydHNPbkRpZENoYW5nZU1vZGVsSW5mbykge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VNb2RlbEluZm8hKF8gPT4gdGhpcy5fcHJveHkuJGVtaXRJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvQ2hhbmdlKGhhbmRsZSwgYWRhcHRlci5tb2RlbEluZm8pKTtcblx0XHRcdHJlc3VsdCA9IERpc3Bvc2FibGUuZnJvbShyZXN1bHQsIHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucyA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJykgJiYgdHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zID09PSAnZnVuY3Rpb24nO1xuXHRcdGlmIChzdXBwb3J0c09uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zKSB7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucyEoXyA9PiB0aGlzLl9wcm94eS4kZW1pdElubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbnNDaGFuZ2UoaGFuZGxlLCBhZGFwdGVyLnByb3ZpZGVyT3B0aW9ucykpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVySW5saW5lQ29tcGxldGlvbnNTdXBwb3J0KFxuXHRcdFx0aGFuZGxlLFxuXHRcdFx0dGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSxcblx0XHRcdGFkYXB0ZXIuc3VwcG9ydHNIYW5kbGVFdmVudHMsXG5cdFx0XHRFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKSxcblx0XHRcdGV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdFx0bWV0YWRhdGE/Lmdyb3VwSWQgPyBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KG1ldGFkYXRhLmdyb3VwSWQpIDogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE/LnlpZWxkVG8/Lm1hcChleHRJZCA9PiBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dElkKSkgfHwgW10sXG5cdFx0XHRtZXRhZGF0YT8uZGlzcGxheU5hbWUsXG5cdFx0XHRtZXRhZGF0YT8uZGVib3VuY2VEZWxheU1zLFxuXHRcdFx0bWV0YWRhdGE/LmV4Y2x1ZGVzPy5tYXAoZXh0SWQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRJZCkpIHx8IFtdLFxuXHRcdFx0c3VwcG9ydHNPbkRpZENoYW5nZSxcblx0XHRcdGFkYXB0ZXIuc3VwcG9ydHNTZXRNb2RlbElkLFxuXHRcdFx0YWRhcHRlci5tb2RlbEluZm8sXG5cdFx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvLFxuXHRcdFx0YWRhcHRlci5zdXBwb3J0c1NldFByb3ZpZGVyT3B0aW9uLFxuXHRcdFx0YWRhcHRlci5wcm92aWRlck9wdGlvbnMsXG5cdFx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdCRwcm92aWRlSW5saW5lQ29tcGxldGlvbnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlSW5saW5lQ29tcGxldGlvbnMoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRoYW5kbGVJbmxpbmVDb21wbGV0aW9uRGlkU2hvdyhoYW5kbGU6IG51bWJlciwgcGlkOiBudW1iZXIsIGlkeDogbnVtYmVyLCB1cGRhdGVkSW5zZXJ0VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRhZGFwdGVyLmhhbmRsZURpZFNob3dDb21wbGV0aW9uSXRlbShwaWQsIGlkeCwgdXBkYXRlZEluc2VydFRleHQpO1xuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRoYW5kbGVJbmxpbmVDb21wbGV0aW9uUGFydGlhbEFjY2VwdChoYW5kbGU6IG51bWJlciwgcGlkOiBudW1iZXIsIGlkeDogbnVtYmVyLCBhY2NlcHRlZENoYXJhY3RlcnM6IG51bWJlciwgaW5mbzogbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRJbmZvKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRhZGFwdGVyLmhhbmRsZVBhcnRpYWxBY2NlcHQocGlkLCBpZHgsIGFjY2VwdGVkQ2hhcmFjdGVycywgaW5mbyk7XG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JGhhbmRsZUlubGluZUNvbXBsZXRpb25FbmRPZkxpZmV0aW1lKGhhbmRsZTogbnVtYmVyLCBwaWQ6IG51bWJlciwgaWR4OiBudW1iZXIsIHJlYXNvbjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb248eyBwaWQ6IG51bWJlcjsgaWR4OiBudW1iZXIgfT4pOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGluZUNvbXBsZXRpb25BZGFwdGVyLCBhc3luYyBhZGFwdGVyID0+IHtcblx0XHRcdGFkYXB0ZXIuaGFuZGxlRW5kT2ZMaWZldGltZShwaWQsIGlkeCwgcmVhc29uKTtcblx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkaGFuZGxlSW5saW5lQ29tcGxldGlvblJlamVjdGlvbihoYW5kbGU6IG51bWJlciwgcGlkOiBudW1iZXIsIGlkeDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRhZGFwdGVyLmhhbmRsZVJlamVjdGlvbihwaWQsIGlkeCk7XG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JGZyZWVJbmxpbmVDb21wbGV0aW9uc0xpc3QoaGFuZGxlOiBudW1iZXIsIHBpZDogbnVtYmVyLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGluZUNvbXBsZXRpb25BZGFwdGVyLCBhc3luYyBhZGFwdGVyID0+IHsgYWRhcHRlci5kaXNwb3NlQ29tcGxldGlvbnMocGlkLCByZWFzb24pOyB9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkYWNjZXB0SW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKHN0YXRlOiBJSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUuZmlyZSgpO1xuXHR9XG5cblx0JGhhbmRsZUlubGluZUNvbXBsZXRpb25TZXRDdXJyZW50TW9kZWxJZChoYW5kbGU6IG51bWJlciwgbW9kZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRhZGFwdGVyLnNldEN1cnJlbnRNb2RlbElkKG1vZGVsSWQpO1xuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRoYW5kbGVJbmxpbmVDb21wbGV0aW9uU2V0UHJvdmlkZXJPcHRpb24oaGFuZGxlOiBudW1iZXIsIG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0YWRhcHRlci5zZXRQcm92aWRlck9wdGlvbihvcHRpb25JZCwgdmFsdWVJZCk7XG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIHBhcmFtZXRlciBoaW50c1xuXG5cdHJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyLCBtZXRhZGF0YU9yVHJpZ2dlckNoYXJzOiBzdHJpbmdbXSB8IHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBtZXRhZGF0YTogZXh0SG9zdFByb3RvY29sLklTaWduYXR1cmVIZWxwUHJvdmlkZXJNZXRhZGF0YUR0byB8IHVuZGVmaW5lZCA9IEFycmF5LmlzQXJyYXkobWV0YWRhdGFPclRyaWdnZXJDaGFycylcblx0XHRcdD8geyB0cmlnZ2VyQ2hhcmFjdGVyczogbWV0YWRhdGFPclRyaWdnZXJDaGFycywgcmV0cmlnZ2VyQ2hhcmFjdGVyczogW10gfVxuXHRcdFx0OiBtZXRhZGF0YU9yVHJpZ2dlckNoYXJzO1xuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgU2lnbmF0dXJlSGVscEFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgbWV0YWRhdGEpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVNpZ25hdHVyZUhlbHAoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSVNpZ25hdHVyZUhlbHBDb250ZXh0RHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JU2lnbmF0dXJlSGVscER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFNpZ25hdHVyZUhlbHBBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVNpZ25hdHVyZUhlbHAoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlbGVhc2VTaWduYXR1cmVIZWxwKGhhbmRsZTogbnVtYmVyLCBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBTaWduYXR1cmVIZWxwQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlbGVhc2VTaWduYXR1cmVIZWxwKGlkKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGlubGluZSBoaW50c1xuXG5cdHJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW5sYXlIaW50c1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VJbmxheUhpbnRzID09PSAnZnVuY3Rpb24nID8gdGhpcy5fbmV4dEhhbmRsZSgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IElubGF5SGludHNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCBwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSwgZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlcklubGF5SGludHNQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlSW5sYXlIaW50ID09PSAnZnVuY3Rpb24nLCBldmVudEhhbmRsZSwgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX2V4dExhYmVsKGV4dGVuc2lvbikpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VJbmxheUhpbnRzISh1cmkgPT4gdGhpcy5fcHJveHkuJGVtaXRJbmxheUhpbnRzRXZlbnQoZXZlbnRIYW5kbGUpKTtcblx0XHRcdHJlc3VsdCA9IERpc3Bvc2FibGUuZnJvbShyZXN1bHQsIHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZUlubGF5SGludHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JSW5sYXlIaW50c0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGF5SGludHNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUlubGF5SGludHMoVVJJLnJldml2ZShyZXNvdXJjZSksIHJhbmdlLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlc29sdmVJbmxheUhpbnQoaGFuZGxlOiBudW1iZXIsIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklJbmxheUhpbnREdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxheUhpbnRzQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlc29sdmVJbmxheUhpbnQoaWQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcmVsZWFzZUlubGF5SGludHMoaGFuZGxlOiBudW1iZXIsIGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGF5SGludHNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVsZWFzZUhpbnRzKGlkKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGxpbmtzXG5cblx0cmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IExpbmtQcm92aWRlckFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50TGluayA9PT0gJ2Z1bmN0aW9uJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRMaW5rcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklMaW5rc0xpc3REdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBMaW5rUHJvdmlkZXJBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUxpbmtzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4sIHJlc291cmNlLnNjaGVtZSA9PT0gJ291dHB1dCcpO1xuXHR9XG5cblx0JHJlc29sdmVEb2N1bWVudExpbmsoaGFuZGxlOiBudW1iZXIsIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklMaW5rRHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgTGlua1Byb3ZpZGVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlc29sdmVMaW5rKGlkLCB0b2tlbiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdCRyZWxlYXNlRG9jdW1lbnRMaW5rcyhoYW5kbGU6IG51bWJlciwgaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgTGlua1Byb3ZpZGVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlbGVhc2VMaW5rcyhpZCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29sb3JQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50Q29sb3JQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBDb2xvclByb3ZpZGVyQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEb2N1bWVudENvbG9yUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudENvbG9ycyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklSYXdDb2xvckluZm9bXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvbG9yUHJvdmlkZXJBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNvbG9ycyhVUkkucmV2aXZlKHJlc291cmNlKSwgdG9rZW4pLCBbXSwgdG9rZW4pO1xuXHR9XG5cblx0JHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBjb2xvckluZm86IGV4dEhvc3RQcm90b2NvbC5JUmF3Q29sb3JJbmZvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5JQ29sb3JQcmVzZW50YXRpb25bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvbG9yUHJvdmlkZXJBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNvbG9yUHJlc2VudGF0aW9ucyhVUkkucmV2aXZlKHJlc291cmNlKSwgY29sb3JJbmZvLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJGb2xkaW5nUmFuZ2VQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkZvbGRpbmdSYW5nZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25leHRIYW5kbGUoKTtcblx0XHRjb25zdCBldmVudEhhbmRsZSA9IHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZUZvbGRpbmdSYW5nZXMgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9uZXh0SGFuZGxlKCkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9hZGFwdGVyLnNldChoYW5kbGUsIG5ldyBBZGFwdGVyRGF0YShuZXcgRm9sZGluZ1Byb3ZpZGVyQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBleHRlbnNpb24uaWRlbnRpZmllciwgZXZlbnRIYW5kbGUpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VGb2xkaW5nUmFuZ2VzISgoKSA9PiB0aGlzLl9wcm94eS4kZW1pdEZvbGRpbmdSYW5nZUV2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZUZvbGRpbmdSYW5nZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBjb250ZXh0OiB2c2NvZGUuRm9sZGluZ0NvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKFxuXHRcdFx0aGFuZGxlLFxuXHRcdFx0Rm9sZGluZ1Byb3ZpZGVyQWRhcHRlcixcblx0XHRcdChhZGFwdGVyKSA9PlxuXHRcdFx0XHRhZGFwdGVyLnByb3ZpZGVGb2xkaW5nUmFuZ2VzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBjb250ZXh0LCB0b2tlbiksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0b2tlblxuXHRcdCk7XG5cdH1cblxuXHQvLyAtLS0gc21hcnQgc2VsZWN0XG5cblx0cmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBTZWxlY3Rpb25SYW5nZUFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVNlbGVjdGlvblJhbmdlcyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uczogSVBvc2l0aW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlNlbGVjdGlvblJhbmdlW11bXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFNlbGVjdGlvblJhbmdlQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9ucywgdG9rZW4pLCBbXSwgdG9rZW4pO1xuXHR9XG5cblx0Ly8gLS0tIGNhbGwgaGllcmFyY2h5XG5cblx0cmVnaXN0ZXJDYWxsSGllcmFyY2h5UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5DYWxsSGllcmFyY2h5UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcmVwYXJlQ2FsbEhpZXJhcmNoeShoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDYWxsSGllcmFyY2h5SXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucHJlcGFyZVNlc3Npb24oVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbikpLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbHMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUluY29taW5nQ2FsbER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlQ2FsbHNUbyhzZXNzaW9uSWQsIGl0ZW1JZCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbHMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSU91dGdvaW5nQ2FsbER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlQ2FsbHNGcm9tKHNlc3Npb25JZCwgaXRlbUlkLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlbGVhc2VDYWxsSGllcmFyY2h5KGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZVNlc3Npb24oc2Vzc2lvbklkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSB0eXBlIGhpZXJhcmNoeVxuXHRyZWdpc3RlclR5cGVIaWVyYXJjaHlQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlR5cGVIaWVyYXJjaHlQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBUeXBlSGllcmFyY2h5QWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUeXBlSGllcmFyY2h5UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByZXBhcmVUeXBlSGllcmFyY2h5KGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVR5cGVIaWVyYXJjaHlJdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBUeXBlSGllcmFyY2h5QWRhcHRlciwgYWRhcHRlciA9PiBQcm9taXNlLnJlc29sdmUoYWRhcHRlci5wcmVwYXJlU2Vzc2lvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHByb3ZpZGVUeXBlSGllcmFyY2h5U3VwZXJ0eXBlcyhoYW5kbGU6IG51bWJlciwgc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFR5cGVIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVN1cGVydHlwZXMoc2Vzc2lvbklkLCBpdGVtSWQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcHJvdmlkZVR5cGVIaWVyYXJjaHlTdWJ0eXBlcyhoYW5kbGU6IG51bWJlciwgc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFR5cGVIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVN1YnR5cGVzKHNlc3Npb25JZCwgaXRlbUlkLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlbGVhc2VUeXBlSGllcmFyY2h5KGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgVHlwZUhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZVNlc3Npb24oc2Vzc2lvbklkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBEb2N1bWVudCBvbiBkcm9wXG5cblx0cmVnaXN0ZXJEb2N1bWVudE9uRHJvcEVkaXRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlciwgbWV0YWRhdGE/OiB2c2NvZGUuRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyTWV0YWRhdGEpIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKCk7XG5cdFx0dGhpcy5fYWRhcHRlci5zZXQoaGFuZGxlLCBuZXcgQWRhcHRlckRhdGEobmV3IERvY3VtZW50RHJvcEVkaXRBZGFwdGVyKHRoaXMuX3Byb3h5LCB0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyLCBoYW5kbGUsIGV4dGVuc2lvbiksIGV4dGVuc2lvbikpO1xuXG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBtZXRhZGF0YSA/IHtcblx0XHRcdHN1cHBvcnRzUmVzb2x2ZTogISFwcm92aWRlci5yZXNvbHZlRG9jdW1lbnREcm9wRWRpdCxcblx0XHRcdGRyb3BNaW1lVHlwZXM6IG1ldGFkYXRhLmRyb3BNaW1lVHlwZXMsXG5cdFx0XHRwcm92aWRlZERyb3BLaW5kczogbWV0YWRhdGEucHJvdmlkZWREcm9wRWRpdEtpbmRzPy5tYXAoeCA9PiB4LnZhbHVlKSxcblx0XHR9IDogdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50T25Ecm9wRWRpdHMoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgZGF0YVRyYW5zZmVyRHRvOiBleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnREcm9wRWRpdER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnREcm9wRWRpdEFkYXB0ZXIsIGFkYXB0ZXIgPT5cblx0XHRcdFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnByb3ZpZGVEb2N1bWVudE9uRHJvcEVkaXRzKHJlcXVlc3RJZCwgVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCBkYXRhVHJhbnNmZXJEdG8sIHRva2VuKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRyZXNvbHZlRHJvcEVkaXQoaGFuZGxlOiBudW1iZXIsIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBhZGRpdGlvbmFsRWRpdD86IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnREcm9wRWRpdEFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlRHJvcEVkaXQoaWQsIHRva2VuKSwge30sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkcmVsZWFzZURvY3VtZW50T25Ecm9wRWRpdHMoaGFuZGxlOiBudW1iZXIsIGNhY2hlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnREcm9wRWRpdEFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZURyb3BFZGl0cyhjYWNoZUlkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBjb3B5L3Bhc3RlIGFjdGlvbnNcblxuXHRyZWdpc3RlckRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBtZXRhZGF0YTogdnNjb2RlLkRvY3VtZW50UGFzdGVQcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25leHRIYW5kbGUoKTtcblx0XHR0aGlzLl9hZGFwdGVyLnNldChoYW5kbGUsIG5ldyBBZGFwdGVyRGF0YShuZXcgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlcih0aGlzLl9wcm94eSwgdGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgaGFuZGxlLCBleHRlbnNpb24pLCBleHRlbnNpb24pKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJQYXN0ZUVkaXRQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIHtcblx0XHRcdHN1cHBvcnRzQ29weTogISFwcm92aWRlci5wcmVwYXJlRG9jdW1lbnRQYXN0ZSxcblx0XHRcdHN1cHBvcnRzUGFzdGU6ICEhcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UGFzdGVFZGl0cyxcblx0XHRcdHN1cHBvcnRzUmVzb2x2ZTogISFwcm92aWRlci5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQsXG5cdFx0XHRwcm92aWRlZFBhc3RlRWRpdEtpbmRzOiBtZXRhZGF0YS5wcm92aWRlZFBhc3RlRWRpdEtpbmRzPy5tYXAoeCA9PiB4LnZhbHVlKSxcblx0XHRcdGNvcHlNaW1lVHlwZXM6IG1ldGFkYXRhLmNvcHlNaW1lVHlwZXMsXG5cdFx0XHRwYXN0ZU1pbWVUeXBlczogbWV0YWRhdGEucGFzdGVNaW1lVHlwZXMsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcmVwYXJlRG9jdW1lbnRQYXN0ZShoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJhbmdlczogSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByZXBhcmVEb2N1bWVudFBhc3RlKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZXMsIGRhdGFUcmFuc2ZlciwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlUGFzdGVFZGl0cyhoYW5kbGU6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZXM6IElSYW5nZVtdLCBkYXRhVHJhbnNmZXJEdG86IGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8sIGNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnRQYXN0ZUNvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklQYXN0ZUVkaXREdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlUGFzdGVFZGl0cyhyZXF1ZXN0SWQsIFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZXMsIGRhdGFUcmFuc2ZlckR0bywgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZXNvbHZlUGFzdGVFZGl0KGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgYWRkaXRpb25hbEVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlUGFzdGVFZGl0KGlkLCB0b2tlbiksIHt9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JHJlbGVhc2VQYXN0ZUVkaXRzKGhhbmRsZTogbnVtYmVyLCBjYWNoZUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZVBhc3RlRWRpdHMoY2FjaGVJZCkpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gY29uZmlndXJhdGlvblxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVSZWdFeHAocmVnRXhwOiBSZWdFeHApOiBleHRIb3N0UHJvdG9jb2wuSVJlZ0V4cER0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhdHRlcm46IHJlZ0V4cC5zb3VyY2UsXG5cdFx0XHRmbGFnczogcmVnRXhwLmZsYWdzLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplSW5kZW50YXRpb25SdWxlKGluZGVudGF0aW9uUnVsZTogdnNjb2RlLkluZGVudGF0aW9uUnVsZSk6IGV4dEhvc3RQcm90b2NvbC5JSW5kZW50YXRpb25SdWxlRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKGluZGVudGF0aW9uUnVsZS5kZWNyZWFzZUluZGVudFBhdHRlcm4pLFxuXHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKGluZGVudGF0aW9uUnVsZS5pbmNyZWFzZUluZGVudFBhdHRlcm4pLFxuXHRcdFx0aW5kZW50TmV4dExpbmVQYXR0ZXJuOiBpbmRlbnRhdGlvblJ1bGUuaW5kZW50TmV4dExpbmVQYXR0ZXJuID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUuaW5kZW50TmV4dExpbmVQYXR0ZXJuKSA6IHVuZGVmaW5lZCxcblx0XHRcdHVuSW5kZW50ZWRMaW5lUGF0dGVybjogaW5kZW50YXRpb25SdWxlLnVuSW5kZW50ZWRMaW5lUGF0dGVybiA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVSZWdFeHAoaW5kZW50YXRpb25SdWxlLnVuSW5kZW50ZWRMaW5lUGF0dGVybikgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVPbkVudGVyUnVsZShvbkVudGVyUnVsZTogdnNjb2RlLk9uRW50ZXJSdWxlKTogZXh0SG9zdFByb3RvY29sLklPbkVudGVyUnVsZUR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJlZm9yZVRleHQ6IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVSZWdFeHAob25FbnRlclJ1bGUuYmVmb3JlVGV4dCksXG5cdFx0XHRhZnRlclRleHQ6IG9uRW50ZXJSdWxlLmFmdGVyVGV4dCA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVSZWdFeHAob25FbnRlclJ1bGUuYWZ0ZXJUZXh0KSA6IHVuZGVmaW5lZCxcblx0XHRcdHByZXZpb3VzTGluZVRleHQ6IG9uRW50ZXJSdWxlLnByZXZpb3VzTGluZVRleHQgPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKG9uRW50ZXJSdWxlLnByZXZpb3VzTGluZVRleHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiBvbkVudGVyUnVsZS5hY3Rpb25cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZU9uRW50ZXJSdWxlcyhvbkVudGVyUnVsZXM6IHZzY29kZS5PbkVudGVyUnVsZVtdKTogZXh0SG9zdFByb3RvY29sLklPbkVudGVyUnVsZUR0b1tdIHtcblx0XHRyZXR1cm4gb25FbnRlclJ1bGVzLm1hcChFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplT25FbnRlclJ1bGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZUF1dG9DbG9zaW5nUGFpcihhdXRvQ2xvc2luZ1BhaXI6IHZzY29kZS5BdXRvQ2xvc2luZ1BhaXIpOiBJQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRvcGVuOiBhdXRvQ2xvc2luZ1BhaXIub3Blbixcblx0XHRcdGNsb3NlOiBhdXRvQ2xvc2luZ1BhaXIuY2xvc2UsXG5cdFx0XHRub3RJbjogYXV0b0Nsb3NpbmdQYWlyLm5vdEluID8gYXV0b0Nsb3NpbmdQYWlyLm5vdEluLm1hcCh2ID0+IFN5bnRheFRva2VuVHlwZS50b1N0cmluZyh2KSkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVBdXRvQ2xvc2luZ1BhaXJzKGF1dG9DbG9zaW5nUGFpcnM6IHZzY29kZS5BdXRvQ2xvc2luZ1BhaXJbXSk6IElBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbFtdIHtcblx0XHRyZXR1cm4gYXV0b0Nsb3NpbmdQYWlycy5tYXAoRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZUF1dG9DbG9zaW5nUGFpcik7XG5cdH1cblxuXHRzZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogdnNjb2RlLkxhbmd1YWdlQ29uZmlndXJhdGlvbik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCB7IHdvcmRQYXR0ZXJuIH0gPSBjb25maWd1cmF0aW9uO1xuXG5cdFx0Ly8gY2hlY2sgZm9yIGEgdmFsaWQgd29yZCBwYXR0ZXJuXG5cdFx0aWYgKHdvcmRQYXR0ZXJuICYmIHJlZ0V4cExlYWRzVG9FbmRsZXNzTG9vcCh3b3JkUGF0dGVybikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiB3b3JkUGF0dGVybiAnJHt3b3JkUGF0dGVybn0nIGlzIG5vdCBhbGxvd2VkIHRvIG1hdGNoIHRoZSBlbXB0eSBzdHJpbmcuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gd29yZCBkZWZpbml0aW9uXG5cdFx0aWYgKHdvcmRQYXR0ZXJuKSB7XG5cdFx0XHR0aGlzLl9kb2N1bWVudHMuc2V0V29yZERlZmluaXRpb25Gb3IobGFuZ3VhZ2VJZCwgd29yZFBhdHRlcm4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kb2N1bWVudHMuc2V0V29yZERlZmluaXRpb25Gb3IobGFuZ3VhZ2VJZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJhdGlvbi5fX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydCkge1xuXHRcdFx0dGhpcy5fYXBpRGVwcmVjYXRpb24ucmVwb3J0KCdMYW5ndWFnZUNvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQnLCBleHRlbnNpb24sXG5cdFx0XHRcdGBEbyBub3QgdXNlLmApO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmF0aW9uLl9fY2hhcmFjdGVyUGFpclN1cHBvcnQpIHtcblx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnTGFuZ3VhZ2VDb25maWd1cmF0aW9uLl9fY2hhcmFjdGVyUGFpclN1cHBvcnQnLCBleHRlbnNpb24sXG5cdFx0XHRcdGBEbyBub3QgdXNlLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25leHRIYW5kbGUoKTtcblx0XHRjb25zdCBzZXJpYWxpemVkQ29uZmlndXJhdGlvbjogZXh0SG9zdFByb3RvY29sLklMYW5ndWFnZUNvbmZpZ3VyYXRpb25EdG8gPSB7XG5cdFx0XHRjb21tZW50czogY29uZmlndXJhdGlvbi5jb21tZW50cyxcblx0XHRcdGJyYWNrZXRzOiBjb25maWd1cmF0aW9uLmJyYWNrZXRzLFxuXHRcdFx0d29yZFBhdHRlcm46IGNvbmZpZ3VyYXRpb24ud29yZFBhdHRlcm4gPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKGNvbmZpZ3VyYXRpb24ud29yZFBhdHRlcm4pIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5kZW50YXRpb25SdWxlczogY29uZmlndXJhdGlvbi5pbmRlbnRhdGlvblJ1bGVzID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZUluZGVudGF0aW9uUnVsZShjb25maWd1cmF0aW9uLmluZGVudGF0aW9uUnVsZXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0b25FbnRlclJ1bGVzOiBjb25maWd1cmF0aW9uLm9uRW50ZXJSdWxlcyA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVPbkVudGVyUnVsZXMoY29uZmlndXJhdGlvbi5vbkVudGVyUnVsZXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0X19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQ6IGNvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQsXG5cdFx0XHRfX2NoYXJhY3RlclBhaXJTdXBwb3J0OiBjb25maWd1cmF0aW9uLl9fY2hhcmFjdGVyUGFpclN1cHBvcnQsXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBjb25maWd1cmF0aW9uLmF1dG9DbG9zaW5nUGFpcnMgPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplQXV0b0Nsb3NpbmdQYWlycyhjb25maWd1cmF0aW9uLmF1dG9DbG9zaW5nUGFpcnMpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHR0aGlzLl9wcm94eS4kc2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGhhbmRsZSwgbGFuZ3VhZ2VJZCwgc2VyaWFsaXplZENvbmZpZ3VyYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkc2V0V29yZERlZmluaXRpb25zKHdvcmREZWZpbml0aW9uczogZXh0SG9zdFByb3RvY29sLklMYW5ndWFnZVdvcmREZWZpbml0aW9uRHRvW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdvcmREZWZpbml0aW9uIG9mIHdvcmREZWZpbml0aW9ucykge1xuXHRcdFx0dGhpcy5fZG9jdW1lbnRzLnNldFdvcmREZWZpbml0aW9uRm9yKHdvcmREZWZpbml0aW9uLmxhbmd1YWdlSWQsIG5ldyBSZWdFeHAod29yZERlZmluaXRpb24ucmVnZXhTb3VyY2UsIHdvcmREZWZpbml0aW9uLnJlZ2V4RmxhZ3MpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsU0FBUyxVQUFVLGdCQUFnQix1QkFBdUI7QUFDbkUsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLGNBQWMsc0JBQXNCO0FBQzlELFNBQVMsUUFBUSxhQUFhO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsWUFBWSxnQkFBZ0I7QUFDckMsU0FBUyxXQUEwQjtBQUVuQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLFNBQVMsbUJBQTJCO0FBQzdDLFNBQXFCLGlCQUFpQjtBQUN0QyxZQUFZLGVBQWU7QUFFM0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBa0Q7QUFFM0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxhQUFhO0FBQ3RCLFlBQVkscUJBQXFCO0FBTWpDLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsWUFBWSxnQkFBZ0IsZ0JBQWdCLGNBQWMsWUFBWSw2QkFBNkIsZ0JBQWdCLG9DQUFvQyw2QkFBNkIsMEJBQTBCLFVBQVUsMEJBQTBCLE9BQU8sZ0JBQWdCLG9CQUFvQixxQkFBcUIsZUFBa0MsdUJBQXVCO0FBQ3BYLFNBQVMsZUFBZTtBQUt4QixNQUFNLHNCQUFzQjtBQUFBLEVBRTNCLFlBQ2tCLFlBQ0EsV0FDaEI7QUFGZ0I7QUFDQTtBQUFBLEVBQ2Q7QUFBQSxFQUVKLE1BQU0sdUJBQXVCLFVBQWUsT0FBMkU7QUFDdEgsVUFBTSxNQUFNLEtBQUssV0FBVyxZQUFZLFFBQVE7QUFDaEQsVUFBTSxRQUFR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
