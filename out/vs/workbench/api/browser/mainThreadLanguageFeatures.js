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
import { createStringDataTransferItem, VSDataTransfer } from "../../../base/common/dataTransfer.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { HierarchicalKind } from "../../../base/common/hierarchicalKind.js";
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { revive } from "../../../base/common/marshalling.js";
import { mixin } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { decodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { reviveWorkspaceEditDto } from "./mainThreadBulkEdits.js";
import * as typeConvert from "../common/extHostTypeConverters.js";
import { DataTransferFileCache } from "../common/shared/dataTransferCache.js";
import * as callh from "../../contrib/callHierarchy/common/callHierarchy.js";
import * as search from "../../contrib/search/common/search.js";
import * as typeh from "../../contrib/typeHierarchy/common/typeHierarchy.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, ISuggestDataDtoField, ISuggestResultDtoField, MainContext } from "../common/extHost.protocol.js";
import { InlineCompletionEndOfLifeReasonKind } from "../common/extHostTypes.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from "../../../platform/dataChannel/browser/forwardingTelemetryService.js";
import { IAiEditTelemetryService } from "../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditDeltaInfo } from "../../../editor/common/textModelEditSource.js";
import { IInlineCompletionsUnificationService } from "../../services/inlineCompletions/common/inlineCompletionsUnification.js";
import { sendInlineCompletionsEndOfLifeTelemetry } from "../../../editor/contrib/inlineCompletions/browser/telemetry.js";
let MainThreadLanguageFeatures = class extends Disposable {
  constructor(extHostContext, _languageService, _languageConfigurationService, _languageFeaturesService, _uriIdentService, _instantiationService, _inlineCompletionsUnificationService) {
    super();
    this._languageService = _languageService;
    this._languageConfigurationService = _languageConfigurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._uriIdentService = _uriIdentService;
    this._instantiationService = _instantiationService;
    this._inlineCompletionsUnificationService = _inlineCompletionsUnificationService;
    this._registrations = this._register(new DisposableMap());
    // --- copy paste action provider
    this._pasteEditProviders = /* @__PURE__ */ new Map();
    // --- document drop Edits
    this._documentOnDropEditProviders = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageFeatures);
    if (this._languageService) {
      const updateAllWordDefinitions = () => {
        const wordDefinitionDtos = [];
        for (const languageId of _languageService.getRegisteredLanguageIds()) {
          const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(languageId).getWordDefinition();
          wordDefinitionDtos.push({
            languageId,
            regexSource: wordDefinition.source,
            regexFlags: wordDefinition.flags
          });
        }
        this._proxy.$setWordDefinitions(wordDefinitionDtos);
      };
      this._register(this._languageConfigurationService.onDidChange((e) => {
        if (!e.languageId) {
          updateAllWordDefinitions();
        } else {
          const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(e.languageId).getWordDefinition();
          this._proxy.$setWordDefinitions([{
            languageId: e.languageId,
            regexSource: wordDefinition.source,
            regexFlags: wordDefinition.flags
          }]);
        }
      }));
      updateAllWordDefinitions();
    }
    if (this._inlineCompletionsUnificationService) {
      this._register(this._inlineCompletionsUnificationService.onDidStateChange(() => {
        this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
      }));
      this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
    }
  }
  $unregister(handle) {
    this._registrations.deleteAndDispose(handle);
  }
  static _reviveLocationDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach((l) => MainThreadLanguageFeatures._reviveLocationDto(l));
      return data;
    } else {
      data.uri = URI.revive(data.uri);
      return data;
    }
  }
  static _reviveLocationLinkDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach((l) => MainThreadLanguageFeatures._reviveLocationLinkDto(l));
      return data;
    } else {
      data.uri = URI.revive(data.uri);
      return data;
    }
  }
  static _reviveWorkspaceSymbolDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach(MainThreadLanguageFeatures._reviveWorkspaceSymbolDto);
      return data;
    } else {
      data.location = MainThreadLanguageFeatures._reviveLocationDto(data.location);
      return data;
    }
  }
  static _reviveCodeActionDto(data, uriIdentService) {
    data?.forEach((code) => reviveWorkspaceEditDto(code.edit, uriIdentService));
    return data;
  }
  static _reviveLinkDTO(data) {
    if (data.url && typeof data.url !== "string") {
      data.url = URI.revive(data.url);
    }
    return data;
  }
  static _reviveCallHierarchyItemDto(data) {
    if (data) {
      data.uri = URI.revive(data.uri);
    }
    return data;
  }
  static _reviveTypeHierarchyItemDto(data) {
    if (data) {
      data.uri = URI.revive(data.uri);
    }
    return data;
  }
  //#endregion
  // --- outline
  $registerDocumentSymbolProvider(handle, selector, displayName) {
    this._registrations.set(handle, this._languageFeaturesService.documentSymbolProvider.register(selector, {
      displayName,
      provideDocumentSymbols: (model, token) => {
        return this._proxy.$provideDocumentSymbols(handle, model.uri, token);
      }
    }));
  }
  // --- code lens
  $registerCodeLensSupport(handle, selector, eventHandle) {
    const provider = {
      provideCodeLenses: async (model, token) => {
        const listDto = await this._proxy.$provideCodeLenses(handle, model.uri, token);
        if (!listDto) {
          return void 0;
        }
        return {
          lenses: listDto.lenses,
          dispose: () => listDto.cacheId && this._proxy.$releaseCodeLenses(handle, listDto.cacheId)
        };
      },
      resolveCodeLens: async (model, codeLens, token) => {
        const result = await this._proxy.$resolveCodeLens(handle, codeLens, token);
        if (!result || token.isCancellationRequested) {
          return void 0;
        }
        return {
          ...result,
          range: model.validateRange(result.range)
        };
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChange = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.codeLensProvider.register(selector, provider));
  }
  $emitCodeLensEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // --- declaration
  $registerDefinitionSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.definitionProvider.register(selector, {
      provideDefinition: (model, position, token) => {
        return this._proxy.$provideDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerDeclarationSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.declarationProvider.register(selector, {
      provideDeclaration: (model, position, token) => {
        return this._proxy.$provideDeclaration(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerImplementationSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.implementationProvider.register(selector, {
      provideImplementation: (model, position, token) => {
        return this._proxy.$provideImplementation(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerTypeDefinitionSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.typeDefinitionProvider.register(selector, {
      provideTypeDefinition: (model, position, token) => {
        return this._proxy.$provideTypeDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  // --- extra info
  $registerHoverProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.hoverProvider.register(selector, {
      provideHover: async (model, position, token, context) => {
        const serializedContext = {
          verbosityRequest: context?.verbosityRequest ? {
            verbosityDelta: context.verbosityRequest.verbosityDelta,
            previousHover: { id: context.verbosityRequest.previousHover.id }
          } : void 0
        };
        const hover = await this._proxy.$provideHover(handle, model.uri, position, serializedContext, token);
        return hover;
      }
    }));
  }
  // --- debug hover
  $registerEvaluatableExpressionProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.evaluatableExpressionProvider.register(selector, {
      provideEvaluatableExpression: (model, position, token) => {
        return this._proxy.$provideEvaluatableExpression(handle, model.uri, position, token);
      }
    }));
  }
  // --- inline values
  $registerInlineValuesProvider(handle, selector, eventHandle) {
    const provider = {
      provideInlineValues: (model, viewPort, context, token) => {
        return this._proxy.$provideInlineValues(handle, model.uri, viewPort, context, token);
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChangeInlineValues = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.inlineValuesProvider.register(selector, provider));
  }
  $emitInlineValuesEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // --- occurrences
  $registerDocumentHighlightProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.documentHighlightProvider.register(selector, {
      provideDocumentHighlights: (model, position, token) => {
        return this._proxy.$provideDocumentHighlights(handle, model.uri, position, token);
      }
    }));
  }
  $registerMultiDocumentHighlightProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.multiDocumentHighlightProvider.register(selector, {
      selector,
      provideMultiDocumentHighlights: (model, position, otherModels, token) => {
        return this._proxy.$provideMultiDocumentHighlights(handle, model.uri, position, otherModels.map((model2) => model2.uri), token).then((dto) => {
          if (dto === void 0 || dto === null) {
            return void 0;
          }
          const result = new ResourceMap();
          dto?.forEach((value) => {
            const uri = URI.revive(value.uri);
            if (result.has(uri)) {
              result.get(uri).push(...value.highlights);
            } else {
              result.set(uri, value.highlights);
            }
          });
          return result;
        });
      }
    }));
  }
  // --- linked editing
  $registerLinkedEditingRangeProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.linkedEditingRangeProvider.register(selector, {
      provideLinkedEditingRanges: async (model, position, token) => {
        const res = await this._proxy.$provideLinkedEditingRanges(handle, model.uri, position, token);
        if (res) {
          return {
            ranges: res.ranges,
            wordPattern: res.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(res.wordPattern) : void 0
          };
        }
        return void 0;
      }
    }));
  }
  // --- references
  $registerReferenceSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.referenceProvider.register(selector, {
      provideReferences: (model, position, context, token) => {
        return this._proxy.$provideReferences(handle, model.uri, position, context, token).then(MainThreadLanguageFeatures._reviveLocationDto);
      }
    }));
  }
  // --- code actions
  $registerCodeActionSupport(handle, selector, metadata, displayName, extensionId, supportsResolve) {
    const provider = {
      provideCodeActions: async (model, rangeOrSelection, context, token) => {
        const listDto = await this._proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, context, token);
        if (!listDto) {
          return void 0;
        }
        return {
          actions: MainThreadLanguageFeatures._reviveCodeActionDto(listDto.actions, this._uriIdentService),
          dispose: () => {
            if (typeof listDto.cacheId === "number") {
              this._proxy.$releaseCodeActions(handle, listDto.cacheId);
            }
          }
        };
      },
      providedCodeActionKinds: metadata.providedKinds,
      documentation: metadata.documentation,
      displayName,
      extensionId
    };
    if (supportsResolve) {
      provider.resolveCodeAction = async (codeAction, token) => {
        const resolved = await this._proxy.$resolveCodeAction(handle, codeAction.cacheId, token);
        if (resolved.edit) {
          codeAction.edit = reviveWorkspaceEditDto(resolved.edit, this._uriIdentService);
        }
        if (resolved.command) {
          codeAction.command = resolved.command;
        }
        return codeAction;
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.codeActionProvider.register(selector, provider));
  }
  $registerPasteEditProvider(handle, selector, metadata) {
    const provider = new MainThreadPasteEditProvider(handle, this._proxy, metadata, this._uriIdentService);
    this._pasteEditProviders.set(handle, provider);
    this._registrations.set(handle, combinedDisposable(
      this._languageFeaturesService.documentPasteEditProvider.register(selector, provider),
      toDisposable(() => this._pasteEditProviders.delete(handle))
    ));
  }
  $resolvePasteFileData(handle, requestId, dataId) {
    const provider = this._pasteEditProviders.get(handle);
    if (!provider) {
      throw new Error("Could not find provider");
    }
    return provider.resolveFileData(requestId, dataId);
  }
  // --- formatting
  $registerDocumentFormattingSupport(handle, selector, extensionId, displayName) {
    this._registrations.set(handle, this._languageFeaturesService.documentFormattingEditProvider.register(selector, {
      extensionId,
      displayName,
      provideDocumentFormattingEdits: (model, options, token) => {
        return this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
      }
    }));
  }
  $registerRangeFormattingSupport(handle, selector, extensionId, displayName, supportsRanges) {
    this._registrations.set(handle, this._languageFeaturesService.documentRangeFormattingEditProvider.register(selector, {
      extensionId,
      displayName,
      provideDocumentRangeFormattingEdits: (model, range, options, token) => {
        return this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
      },
      provideDocumentRangesFormattingEdits: !supportsRanges ? void 0 : (model, ranges, options, token) => {
        return this._proxy.$provideDocumentRangesFormattingEdits(handle, model.uri, ranges, options, token);
      }
    }));
  }
  $registerOnTypeFormattingSupport(handle, selector, autoFormatTriggerCharacters, extensionId) {
    this._registrations.set(handle, this._languageFeaturesService.onTypeFormattingEditProvider.register(selector, {
      extensionId,
      autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: (model, position, ch, options, token) => {
        return this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
      }
    }));
  }
  // --- navigate type
  $registerNavigateTypeSupport(handle, supportsResolve) {
    let lastResultId;
    const provider = {
      provideWorkspaceSymbols: async (search2, token) => {
        const result = await this._proxy.$provideWorkspaceSymbols(handle, search2, token);
        if (lastResultId !== void 0) {
          this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
        }
        lastResultId = result.cacheId;
        return MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(result.symbols);
      }
    };
    if (supportsResolve) {
      provider.resolveWorkspaceSymbol = async (item, token) => {
        const resolvedItem = await this._proxy.$resolveWorkspaceSymbol(handle, item, token);
        return resolvedItem && MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(resolvedItem);
      };
    }
    this._registrations.set(handle, search.WorkspaceSymbolProviderRegistry.register(provider));
  }
  // --- rename
  $registerRenameSupport(handle, selector, supportResolveLocation) {
    this._registrations.set(handle, this._languageFeaturesService.renameProvider.register(selector, {
      provideRenameEdits: (model, position, newName, token) => {
        return this._proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then((data) => reviveWorkspaceEditDto(data, this._uriIdentService));
      },
      resolveRenameLocation: supportResolveLocation ? (model, position, token) => this._proxy.$resolveRenameLocation(handle, model.uri, position, token) : void 0
    }));
  }
  $registerNewSymbolNamesProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.newSymbolNamesProvider.register(selector, {
      supportsAutomaticNewSymbolNamesTriggerKind: this._proxy.$supportsAutomaticNewSymbolNamesTriggerKind(handle),
      provideNewSymbolNames: (model, range, triggerKind, token) => {
        return this._proxy.$provideNewSymbolNames(handle, model.uri, range, triggerKind, token);
      }
    }));
  }
  // --- semantic tokens
  $registerDocumentSemanticTokensProvider(handle, selector, legend, eventHandle) {
    let event = void 0;
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      event = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.documentSemanticTokensProvider.register(selector, new MainThreadDocumentSemanticTokensProvider(this._proxy, handle, legend, event)));
  }
  $emitDocumentSemanticTokensEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  $emitDocumentRangeSemanticTokensEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  $registerDocumentRangeSemanticTokensProvider(handle, selector, legend, eventHandle) {
    let event = void 0;
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      event = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.documentRangeSemanticTokensProvider.register(selector, new MainThreadDocumentRangeSemanticTokensProvider(this._proxy, handle, legend, event)));
  }
  // --- suggest
  static _inflateSuggestDto(defaultRange, data, extensionId) {
    const label = data[ISuggestDataDtoField.label];
    const commandId = data[ISuggestDataDtoField.commandId];
    const commandIdent = data[ISuggestDataDtoField.commandIdent];
    const commitChars = data[ISuggestDataDtoField.commitCharacters];
    let command;
    if (commandId) {
      command = {
        $ident: commandIdent,
        id: commandId,
        title: "",
        arguments: commandIdent ? [commandIdent] : data[ISuggestDataDtoField.commandArguments]
        // Automatically fill in ident as first argument
      };
    }
    return {
      label,
      extensionId,
      kind: data[ISuggestDataDtoField.kind] ?? languages.CompletionItemKind.Property,
      tags: data[ISuggestDataDtoField.kindModifier],
      detail: data[ISuggestDataDtoField.detail],
      documentation: data[ISuggestDataDtoField.documentation],
      sortText: data[ISuggestDataDtoField.sortText],
      filterText: data[ISuggestDataDtoField.filterText],
      preselect: data[ISuggestDataDtoField.preselect],
      insertText: data[ISuggestDataDtoField.insertText] ?? (typeof label === "string" ? label : label.label),
      range: data[ISuggestDataDtoField.range] ?? defaultRange,
      insertTextRules: data[ISuggestDataDtoField.insertTextRules],
      commitCharacters: commitChars ? Array.from(commitChars) : void 0,
      additionalTextEdits: data[ISuggestDataDtoField.additionalTextEdits],
      command,
      // not-standard
      _id: data.x
    };
  }
  $registerCompletionsProvider(handle, selector, triggerCharacters, supportsResolveDetails, extensionId) {
    const provider = {
      triggerCharacters,
      _debugDisplayName: `${extensionId.value}(${triggerCharacters.join("")})`,
      provideCompletionItems: async (model, position, context, token) => {
        const result = await this._proxy.$provideCompletionItems(handle, model.uri, position, context, token);
        if (!result) {
          return result;
        }
        return {
          suggestions: result[ISuggestResultDtoField.completions].map((d) => MainThreadLanguageFeatures._inflateSuggestDto(result[ISuggestResultDtoField.defaultRanges], d, extensionId)),
          incomplete: result[ISuggestResultDtoField.isIncomplete] || false,
          duration: result[ISuggestResultDtoField.duration],
          dispose: () => {
            if (typeof result.x === "number") {
              this._proxy.$releaseCompletionItems(handle, result.x);
            }
          }
        };
      }
    };
    if (supportsResolveDetails) {
      provider.resolveCompletionItem = (suggestion, token) => {
        return this._proxy.$resolveCompletionItem(handle, suggestion._id, token).then((result) => {
          if (!result) {
            return suggestion;
          }
          const newSuggestion = MainThreadLanguageFeatures._inflateSuggestDto(suggestion.range, result, extensionId);
          return mixin(suggestion, newSuggestion, true);
        });
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.completionProvider.register(selector, provider));
  }
  $registerInlineCompletionsSupport(handle, selector, supportsHandleEvents, extensionId, extensionVersion, groupId, yieldsToExtensionIds, displayName, debounceDelayMs, excludesExtensionIds, supportsOnDidChange, supportsSetModelId, initialModelInfo, supportsOnDidChangeModelInfo, supportsSetProviderOption, initialProviderOptions, supportsOnDidChangeProviderOptions) {
    const providerId = new languages.ProviderId(extensionId, extensionVersion, groupId);
    const provider = this._instantiationService.createInstance(
      ExtensionBackedInlineCompletionsProvider,
      handle,
      groupId ?? extensionId,
      providerId,
      yieldsToExtensionIds,
      excludesExtensionIds,
      debounceDelayMs,
      displayName,
      initialModelInfo,
      supportsHandleEvents,
      supportsSetModelId,
      supportsOnDidChange,
      supportsOnDidChangeModelInfo,
      initialProviderOptions,
      supportsSetProviderOption,
      supportsOnDidChangeProviderOptions,
      selector,
      this._proxy
    );
    this._registrations.set(handle, provider);
  }
  $emitInlineCompletionsChange(handle, changeHint) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._emitDidChange(changeHint);
    }
  }
  $emitInlineCompletionModelInfoChange(handle, data) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._setModelInfo(data);
    }
  }
  $emitInlineCompletionProviderOptionsChange(handle, data) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._setProviderOptions(data);
    }
  }
  // --- parameter hints
  $registerSignatureHelpProvider(handle, selector, metadata) {
    this._registrations.set(handle, this._languageFeaturesService.signatureHelpProvider.register(selector, {
      signatureHelpTriggerCharacters: metadata.triggerCharacters,
      signatureHelpRetriggerCharacters: metadata.retriggerCharacters,
      provideSignatureHelp: async (model, position, token, context) => {
        const result = await this._proxy.$provideSignatureHelp(handle, model.uri, position, context, token);
        if (!result) {
          return void 0;
        }
        return {
          value: result,
          dispose: () => {
            this._proxy.$releaseSignatureHelp(handle, result.id);
          }
        };
      }
    }));
  }
  // --- inline hints
  $registerInlayHintsProvider(handle, selector, supportsResolve, eventHandle, displayName) {
    const provider = {
      displayName,
      provideInlayHints: async (model, range, token) => {
        const result = await this._proxy.$provideInlayHints(handle, model.uri, range, token);
        if (!result) {
          return;
        }
        return {
          hints: revive(result.hints),
          dispose: () => {
            if (result.cacheId) {
              this._proxy.$releaseInlayHints(handle, result.cacheId);
            }
          }
        };
      }
    };
    if (supportsResolve) {
      provider.resolveInlayHint = async (hint, token) => {
        const dto = hint;
        if (!dto.cacheId) {
          return hint;
        }
        const result = await this._proxy.$resolveInlayHint(handle, dto.cacheId, token);
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        if (!result) {
          return hint;
        }
        return {
          ...hint,
          tooltip: result.tooltip,
          label: revive(result.label),
          textEdits: result.textEdits
        };
      };
    }
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChangeInlayHints = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.inlayHintsProvider.register(selector, provider));
  }
  $emitInlayHintsEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  // --- links
  $registerDocumentLinkProvider(handle, selector, supportsResolve) {
    const provider = {
      provideLinks: (model, token) => {
        return this._proxy.$provideDocumentLinks(handle, model.uri, token).then((dto) => {
          if (!dto) {
            return void 0;
          }
          return {
            links: dto.links.map(MainThreadLanguageFeatures._reviveLinkDTO),
            dispose: () => {
              if (typeof dto.cacheId === "number") {
                this._proxy.$releaseDocumentLinks(handle, dto.cacheId);
              }
            }
          };
        });
      }
    };
    if (supportsResolve) {
      provider.resolveLink = (link, token) => {
        const dto = link;
        if (!dto.cacheId) {
          return link;
        }
        return this._proxy.$resolveDocumentLink(handle, dto.cacheId, token).then((obj) => {
          return obj && MainThreadLanguageFeatures._reviveLinkDTO(obj);
        });
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.linkProvider.register(selector, provider));
  }
  // --- colors
  $registerDocumentColorProvider(handle, selector) {
    const proxy = this._proxy;
    this._registrations.set(handle, this._languageFeaturesService.colorProvider.register(selector, {
      provideDocumentColors: (model, token) => {
        return proxy.$provideDocumentColors(handle, model.uri, token).then((documentColors) => {
          return documentColors.map((documentColor) => {
            const [red, green, blue, alpha] = documentColor.color;
            const color = {
              red,
              green,
              blue,
              alpha
            };
            return {
              color,
              range: documentColor.range
            };
          });
        });
      },
      provideColorPresentations: (model, colorInfo, token) => {
        return proxy.$provideColorPresentations(handle, model.uri, {
          color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha],
          range: colorInfo.range
        }, token);
      }
    }));
  }
  // --- folding
  $registerFoldingRangeProvider(handle, selector, extensionId, eventHandle) {
    const provider = {
      id: extensionId.value,
      provideFoldingRanges: (model, context, token) => {
        return this._proxy.$provideFoldingRanges(handle, model.uri, context, token);
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChange = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.foldingRangeProvider.register(selector, provider));
  }
  $emitFoldingRangeEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // -- smart select
  $registerSelectionRangeProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.selectionRangeProvider.register(selector, {
      provideSelectionRanges: (model, positions, token) => {
        return this._proxy.$provideSelectionRanges(handle, model.uri, positions, token);
      }
    }));
  }
  // --- call hierarchy
  $registerCallHierarchyProvider(handle, selector) {
    this._registrations.set(handle, callh.CallHierarchyProviderRegistry.register(selector, {
      prepareCallHierarchy: async (document, position, token) => {
        const items = await this._proxy.$prepareCallHierarchy(handle, document.uri, position, token);
        if (!items || items.length === 0) {
          return void 0;
        }
        return {
          dispose: () => {
            for (const item of items) {
              this._proxy.$releaseCallHierarchy(handle, item._sessionId);
            }
          },
          roots: items.map(MainThreadLanguageFeatures._reviveCallHierarchyItemDto)
        };
      },
      provideOutgoingCalls: async (item, token) => {
        const outgoing = await this._proxy.$provideCallHierarchyOutgoingCalls(handle, item._sessionId, item._itemId, token);
        if (!outgoing) {
          return outgoing;
        }
        outgoing.forEach((value) => {
          value.to = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.to);
        });
        return outgoing;
      },
      provideIncomingCalls: async (item, token) => {
        const incoming = await this._proxy.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, token);
        if (!incoming) {
          return incoming;
        }
        incoming.forEach((value) => {
          value.from = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.from);
        });
        return incoming;
      }
    }));
  }
  // --- configuration
  static _reviveRegExp(regExp) {
    return new RegExp(regExp.pattern, regExp.flags);
  }
  static _reviveIndentationRule(indentationRule) {
    return {
      decreaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.decreaseIndentPattern),
      increaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.increaseIndentPattern),
      indentNextLinePattern: indentationRule.indentNextLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.indentNextLinePattern) : void 0,
      unIndentedLinePattern: indentationRule.unIndentedLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.unIndentedLinePattern) : void 0
    };
  }
  static _reviveOnEnterRule(onEnterRule) {
    return {
      beforeText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.beforeText),
      afterText: onEnterRule.afterText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.afterText) : void 0,
      previousLineText: onEnterRule.previousLineText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.previousLineText) : void 0,
      action: onEnterRule.action
    };
  }
  static _reviveOnEnterRules(onEnterRules) {
    return onEnterRules.map(MainThreadLanguageFeatures._reviveOnEnterRule);
  }
  $setLanguageConfiguration(handle, languageId, _configuration) {
    const configuration = {
      comments: _configuration.comments,
      brackets: _configuration.brackets,
      wordPattern: _configuration.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(_configuration.wordPattern) : void 0,
      indentationRules: _configuration.indentationRules ? MainThreadLanguageFeatures._reviveIndentationRule(_configuration.indentationRules) : void 0,
      onEnterRules: _configuration.onEnterRules ? MainThreadLanguageFeatures._reviveOnEnterRules(_configuration.onEnterRules) : void 0,
      autoClosingPairs: void 0,
      surroundingPairs: void 0,
      __electricCharacterSupport: void 0
    };
    if (_configuration.autoClosingPairs) {
      configuration.autoClosingPairs = _configuration.autoClosingPairs;
    } else if (_configuration.__characterPairSupport) {
      configuration.autoClosingPairs = _configuration.__characterPairSupport.autoClosingPairs;
    }
    if (_configuration.__electricCharacterSupport && _configuration.__electricCharacterSupport.docComment) {
      configuration.__electricCharacterSupport = {
        docComment: {
          open: _configuration.__electricCharacterSupport.docComment.open,
          close: _configuration.__electricCharacterSupport.docComment.close
        }
      };
    }
    if (this._languageService.isRegisteredLanguageId(languageId)) {
      this._registrations.set(handle, this._languageConfigurationService.register(languageId, configuration, 100));
    }
  }
  // --- type hierarchy
  $registerTypeHierarchyProvider(handle, selector) {
    this._registrations.set(handle, typeh.TypeHierarchyProviderRegistry.register(selector, {
      prepareTypeHierarchy: async (document, position, token) => {
        const items = await this._proxy.$prepareTypeHierarchy(handle, document.uri, position, token);
        if (!items) {
          return void 0;
        }
        return {
          dispose: () => {
            for (const item of items) {
              this._proxy.$releaseTypeHierarchy(handle, item._sessionId);
            }
          },
          roots: items.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto)
        };
      },
      provideSupertypes: async (item, token) => {
        const supertypes = await this._proxy.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, token);
        if (!supertypes) {
          return supertypes;
        }
        return supertypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
      },
      provideSubtypes: async (item, token) => {
        const subtypes = await this._proxy.$provideTypeHierarchySubtypes(handle, item._sessionId, item._itemId, token);
        if (!subtypes) {
          return subtypes;
        }
        return subtypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
      }
    }));
  }
  $registerDocumentOnDropEditProvider(handle, selector, metadata) {
    const provider = new MainThreadDocumentOnDropEditProvider(handle, this._proxy, metadata, this._uriIdentService);
    this._documentOnDropEditProviders.set(handle, provider);
    this._registrations.set(handle, combinedDisposable(
      this._languageFeaturesService.documentDropEditProvider.register(selector, provider),
      toDisposable(() => this._documentOnDropEditProviders.delete(handle))
    ));
  }
  async $resolveDocumentOnDropFileData(handle, requestId, dataId) {
    const provider = this._documentOnDropEditProviders.get(handle);
    if (!provider) {
      throw new Error("Could not find provider");
    }
    return provider.resolveDocumentOnDropFileData(requestId, dataId);
  }
};
MainThreadLanguageFeatures = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLanguageFeatures),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, ILanguageConfigurationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IInlineCompletionsUnificationService)
], MainThreadLanguageFeatures);
let MainThreadPasteEditProvider = class {
  constructor(_handle, _proxy, metadata, _uriIdentService) {
    this._handle = _handle;
    this._proxy = _proxy;
    this._uriIdentService = _uriIdentService;
    this.dataTransfers = new DataTransferFileCache();
    this.copyMimeTypes = metadata.copyMimeTypes ?? [];
    this.pasteMimeTypes = metadata.pasteMimeTypes ?? [];
    this.providedPasteEditKinds = metadata.providedPasteEditKinds?.map((kind) => new HierarchicalKind(kind)) ?? [];
    if (metadata.supportsCopy) {
      this.prepareDocumentPaste = async (model, selections, dataTransfer, token) => {
        const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
        if (token.isCancellationRequested) {
          return void 0;
        }
        const newDataTransfer = await this._proxy.$prepareDocumentPaste(_handle, model.uri, selections, dataTransferDto, token);
        if (!newDataTransfer) {
          return void 0;
        }
        const dataTransferOut = new VSDataTransfer();
        for (const [type, item] of newDataTransfer.items) {
          dataTransferOut.replace(type, createStringDataTransferItem(item.asString, item.id));
        }
        return dataTransferOut;
      };
    }
    if (metadata.supportsPaste) {
      this.provideDocumentPasteEdits = async (model, selections, dataTransfer, context, token) => {
        const request = this.dataTransfers.add(dataTransfer);
        try {
          const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
          if (token.isCancellationRequested) {
            return;
          }
          const edits = await this._proxy.$providePasteEdits(this._handle, request.id, model.uri, selections, dataTransferDto, {
            only: context.only?.value,
            triggerKind: context.triggerKind
          }, token);
          if (!edits) {
            return;
          }
          return {
            edits: edits.map((edit) => {
              return {
                ...edit,
                kind: edit.kind ? new HierarchicalKind(edit.kind.value) : new HierarchicalKind(""),
                yieldTo: edit.yieldTo?.map((x) => ({ kind: new HierarchicalKind(x) })),
                additionalEdit: edit.additionalEdit ? reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, (dataId) => this.resolveFileData(request.id, dataId)) : void 0
              };
            }),
            dispose: () => {
              this._proxy.$releasePasteEdits(this._handle, request.id);
            }
          };
        } finally {
          request.dispose();
        }
      };
    }
    if (metadata.supportsResolve) {
      this.resolveDocumentPasteEdit = async (edit, token) => {
        const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
        if (typeof resolved.insertText !== "undefined") {
          edit.insertText = resolved.insertText;
        }
        if (resolved.additionalEdit) {
          edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
        }
        return edit;
      };
    }
  }
  resolveFileData(requestId, dataId) {
    return this.dataTransfers.resolveFileData(requestId, dataId);
  }
};
MainThreadPasteEditProvider = __decorateClass([
  __decorateParam(3, IUriIdentityService)
], MainThreadPasteEditProvider);
let MainThreadDocumentOnDropEditProvider = class {
  constructor(_handle, _proxy, metadata, _uriIdentService) {
    this._handle = _handle;
    this._proxy = _proxy;
    this._uriIdentService = _uriIdentService;
    this.dataTransfers = new DataTransferFileCache();
    this.dropMimeTypes = metadata?.dropMimeTypes ?? ["*/*"];
    this.providedDropEditKinds = metadata?.providedDropKinds?.map((kind) => new HierarchicalKind(kind));
    if (metadata?.supportsResolve) {
      this.resolveDocumentDropEdit = async (edit, token) => {
        const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
        if (resolved.additionalEdit) {
          edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
        }
        return edit;
      };
    }
  }
  async provideDocumentDropEdits(model, position, dataTransfer, token) {
    const request = this.dataTransfers.add(dataTransfer);
    try {
      const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
      if (token.isCancellationRequested) {
        return;
      }
      const edits = await this._proxy.$provideDocumentOnDropEdits(this._handle, request.id, model.uri, position, dataTransferDto, token);
      if (!edits) {
        return;
      }
      return {
        edits: edits.map((edit) => {
          return {
            ...edit,
            yieldTo: edit.yieldTo?.map((x) => ({ kind: new HierarchicalKind(x) })),
            kind: edit.kind ? new HierarchicalKind(edit.kind) : void 0,
            additionalEdit: reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, (dataId) => this.resolveDocumentOnDropFileData(request.id, dataId))
          };
        }),
        dispose: () => {
          this._proxy.$releaseDocumentOnDropEdits(this._handle, request.id);
        }
      };
    } finally {
      request.dispose();
    }
  }
  resolveDocumentOnDropFileData(requestId, dataId) {
    return this.dataTransfers.resolveFileData(requestId, dataId);
  }
};
MainThreadDocumentOnDropEditProvider = __decorateClass([
  __decorateParam(3, IUriIdentityService)
], MainThreadDocumentOnDropEditProvider);
class MainThreadDocumentSemanticTokensProvider {
  constructor(_proxy, _handle, _legend, onDidChange) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._legend = _legend;
    this.onDidChange = onDidChange;
  }
  releaseDocumentSemanticTokens(resultId) {
    if (resultId) {
      this._proxy.$releaseDocumentSemanticTokens(this._handle, parseInt(resultId, 10));
    }
  }
  getLegend() {
    return this._legend;
  }
  async provideDocumentSemanticTokens(model, lastResultId, token) {
    const nLastResultId = lastResultId ? parseInt(lastResultId, 10) : 0;
    const encodedDto = await this._proxy.$provideDocumentSemanticTokens(this._handle, model.uri, nLastResultId, token);
    if (!encodedDto) {
      return null;
    }
    if (token.isCancellationRequested) {
      return null;
    }
    const dto = decodeSemanticTokensDto(encodedDto);
    if (dto.type === "full") {
      return {
        resultId: String(dto.id),
        data: dto.data
      };
    }
    return {
      resultId: String(dto.id),
      edits: dto.deltas
    };
  }
}
class MainThreadDocumentRangeSemanticTokensProvider {
  constructor(_proxy, _handle, _legend, onDidChange) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._legend = _legend;
    this.onDidChange = onDidChange;
  }
  getLegend() {
    return this._legend;
  }
  async provideDocumentRangeSemanticTokens(model, range, token) {
    const encodedDto = await this._proxy.$provideDocumentRangeSemanticTokens(this._handle, model.uri, range, token);
    if (!encodedDto) {
      return null;
    }
    if (token.isCancellationRequested) {
      return null;
    }
    const dto = decodeSemanticTokensDto(encodedDto);
    if (dto.type === "full") {
      return {
        resultId: String(dto.id),
        data: dto.data
      };
    }
    throw new Error(`Unexpected`);
  }
}
let ExtensionBackedInlineCompletionsProvider = class extends Disposable {
  constructor(handle, groupId, providerId, yieldsToGroupIds, excludesGroupIds, debounceDelayMs, displayName, modelInfo, _supportsHandleEvents, _supportsSetModelId, _supportsOnDidChange, _supportsOnDidChangeModelInfo, providerOptions, _supportsSetProviderOption, _supportsOnDidChangeProviderOptions, _selector, _proxy, _languageFeaturesService, _aiEditTelemetryService, _instantiationService) {
    super();
    this.handle = handle;
    this.groupId = groupId;
    this.providerId = providerId;
    this.yieldsToGroupIds = yieldsToGroupIds;
    this.excludesGroupIds = excludesGroupIds;
    this.debounceDelayMs = debounceDelayMs;
    this.displayName = displayName;
    this.modelInfo = modelInfo;
    this._supportsHandleEvents = _supportsHandleEvents;
    this._supportsSetModelId = _supportsSetModelId;
    this._supportsOnDidChange = _supportsOnDidChange;
    this._supportsOnDidChangeModelInfo = _supportsOnDidChangeModelInfo;
    this.providerOptions = providerOptions;
    this._supportsSetProviderOption = _supportsSetProviderOption;
    this._supportsOnDidChangeProviderOptions = _supportsOnDidChangeProviderOptions;
    this._selector = _selector;
    this._proxy = _proxy;
    this._languageFeaturesService = _languageFeaturesService;
    this._aiEditTelemetryService = _aiEditTelemetryService;
    this._instantiationService = _instantiationService;
    this._onDidChangeEmitter = this._register(new Emitter());
    this._onDidChangeModelInfoEmitter = this._register(new Emitter());
    this._onDidProviderOptionsChangeEmitter = this._register(new Emitter());
    this.setModelId = this._supportsSetModelId ? async (modelId) => {
      await this._proxy.$handleInlineCompletionSetCurrentModelId(this.handle, modelId);
    } : void 0;
    this.setProviderOption = this._supportsSetProviderOption ? async (optionId, valueId) => {
      await this._proxy.$handleInlineCompletionSetProviderOption(this.handle, optionId, valueId);
    } : void 0;
    this.onDidChangeInlineCompletions = this._supportsOnDidChange ? this._onDidChangeEmitter.event : void 0;
    this.onDidChangeModelInfo = this._supportsOnDidChangeModelInfo ? this._onDidChangeModelInfoEmitter.event : void 0;
    this.onDidProviderOptionsChange = this._supportsOnDidChangeProviderOptions ? this._onDidProviderOptionsChangeEmitter.event : void 0;
    this._register(this._languageFeaturesService.inlineCompletionsProvider.register(this._selector, this));
  }
  _setModelInfo(newModelInfo) {
    this.modelInfo = newModelInfo;
    if (this._supportsOnDidChangeModelInfo) {
      this._onDidChangeModelInfoEmitter.fire();
    }
  }
  _setProviderOptions(newProviderOptions) {
    this.providerOptions = newProviderOptions;
    if (this._supportsOnDidChangeProviderOptions) {
      this._onDidProviderOptionsChangeEmitter.fire();
    }
  }
  _emitDidChange(changeHint) {
    if (this._supportsOnDidChange) {
      this._onDidChangeEmitter.fire(changeHint);
    }
  }
  async provideInlineCompletions(model, position, context, token) {
    const result = await this._proxy.$provideInlineCompletions(this.handle, model.uri, position, context, token);
    return result;
  }
  async handleItemDidShow(completions, item, updatedInsertText, editDeltaInfo) {
    if (item.suggestionId === void 0) {
      item.suggestionId = this._aiEditTelemetryService.createSuggestionId({
        applyCodeBlockSuggestionId: void 0,
        feature: "inlineSuggestion",
        source: this.providerId,
        languageId: completions.languageId,
        editDeltaInfo,
        modeId: void 0,
        modelId: void 0,
        presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
        sourceRequestId: void 0
      });
    }
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionDidShow(this.handle, completions.pid, item.idx, updatedInsertText);
    }
  }
  async handlePartialAccept(completions, item, acceptedCharacters, info) {
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionPartialAccept(this.handle, completions.pid, item.idx, acceptedCharacters, info);
    }
  }
  async handleEndOfLifetime(completions, item, reason, lifetimeSummary) {
    function mapReason(reason2, f) {
      if (reason2.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
        return {
          ...reason2,
          supersededBy: reason2.supersededBy ? f(reason2.supersededBy) : void 0
        };
      }
      return reason2;
    }
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionEndOfLifetime(this.handle, completions.pid, item.idx, mapReason(reason, (i) => ({ pid: i.pid, idx: i.idx })));
    }
    if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
      if (item.suggestionId !== void 0) {
        this._aiEditTelemetryService.handleCodeAccepted({
          suggestionId: item.suggestionId,
          feature: "inlineSuggestion",
          source: this.providerId,
          languageId: completions.languageId,
          editDeltaInfo: EditDeltaInfo.tryCreate(
            lifetimeSummary.lineCountModified,
            lifetimeSummary.lineCountOriginal,
            lifetimeSummary.characterCountModified,
            lifetimeSummary.characterCountOriginal
          ),
          modeId: void 0,
          modelId: void 0,
          presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
          acceptanceMethod: "accept",
          applyCodeBlockSuggestionId: void 0,
          sourceRequestId: void 0
        });
      }
    } else if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Rejected) {
      if (item.suggestionId !== void 0) {
        this._aiEditTelemetryService.handleCodeRejected({
          suggestionId: item.suggestionId,
          feature: "inlineSuggestion",
          source: this.providerId,
          languageId: completions.languageId,
          editDeltaInfo: EditDeltaInfo.tryCreate(
            lifetimeSummary.lineCountModified,
            lifetimeSummary.lineCountOriginal,
            lifetimeSummary.characterCountModified,
            lifetimeSummary.characterCountOriginal
          ),
          modeId: void 0,
          modelId: void 0,
          presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
          rejectionMethod: "reject",
          applyCodeBlockSuggestionId: void 0,
          sourceRequestId: void 0
        });
      }
    }
    const endOfLifeSummary = {
      opportunityId: lifetimeSummary.requestUuid,
      correlationId: lifetimeSummary.correlationId,
      shown: lifetimeSummary.shown,
      shownDuration: lifetimeSummary.shownDuration,
      shownDurationUncollapsed: lifetimeSummary.shownDurationUncollapsed,
      timeUntilShown: lifetimeSummary.timeUntilShown,
      timeUntilProviderRequest: lifetimeSummary.timeUntilProviderRequest,
      timeUntilProviderResponse: lifetimeSummary.timeUntilProviderResponse,
      editorType: lifetimeSummary.editorType,
      viewKind: lifetimeSummary.viewKind,
      preceeded: lifetimeSummary.preceeded,
      requestReason: lifetimeSummary.requestReason,
      typingInterval: lifetimeSummary.typingInterval,
      typingIntervalCharacterCount: lifetimeSummary.typingIntervalCharacterCount,
      languageId: lifetimeSummary.languageId,
      cursorColumnDistance: lifetimeSummary.cursorColumnDistance,
      cursorLineDistance: lifetimeSummary.cursorLineDistance,
      lineCountOriginal: lifetimeSummary.lineCountOriginal,
      lineCountModified: lifetimeSummary.lineCountModified,
      characterCountOriginal: lifetimeSummary.characterCountOriginal,
      characterCountModified: lifetimeSummary.characterCountModified,
      disjointReplacements: lifetimeSummary.disjointReplacements,
      sameShapeReplacements: lifetimeSummary.sameShapeReplacements,
      selectedSuggestionInfo: lifetimeSummary.selectedSuggestionInfo,
      extensionId: this.providerId.extensionId,
      extensionVersion: this.providerId.extensionVersion,
      groupId: extractEngineFromCorrelationId(lifetimeSummary.correlationId) ?? this.groupId,
      skuPlan: lifetimeSummary.skuPlan,
      skuType: lifetimeSummary.skuType,
      performanceMarkers: lifetimeSummary.performanceMarkers,
      availableProviders: lifetimeSummary.availableProviders,
      partiallyAccepted: lifetimeSummary.partiallyAccepted,
      partiallyAcceptedCountSinceOriginal: lifetimeSummary.partiallyAcceptedCountSinceOriginal,
      partiallyAcceptedRatioSinceOriginal: lifetimeSummary.partiallyAcceptedRatioSinceOriginal,
      partiallyAcceptedCharactersSinceOriginal: lifetimeSummary.partiallyAcceptedCharactersSinceOriginal,
      superseded: reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored && !!reason.supersededBy,
      reason: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted ? "accepted" : reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected ? "rejected" : reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored ? "ignored" : void 0,
      acceptedAlternativeAction: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted && reason.alternativeAction,
      noSuggestionReason: void 0,
      notShownReason: lifetimeSummary.notShownReason,
      renameCreated: lifetimeSummary.renameCreated,
      renameDuration: lifetimeSummary.renameDuration,
      renameTimedOut: lifetimeSummary.renameTimedOut,
      renameDroppedOtherEdits: lifetimeSummary.renameDroppedOtherEdits,
      renameDroppedRenameEdits: lifetimeSummary.renameDroppedRenameEdits,
      editKind: lifetimeSummary.editKind,
      longDistanceHintVisible: lifetimeSummary.longDistanceHintVisible,
      longDistanceHintDistance: lifetimeSummary.longDistanceHintDistance,
      isForAnotherDocument: lifetimeSummary.isForAnotherDocument,
      ...forwardToChannelIf(isCopilotLikeExtension(this.providerId.extensionId))
    };
    const dataChannelForwardingTelemetryService = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
    sendInlineCompletionsEndOfLifeTelemetry(dataChannelForwardingTelemetryService, endOfLifeSummary);
  }
  disposeInlineCompletions(completions, reason) {
    this._proxy.$freeInlineCompletionsList(this.handle, completions.pid, reason);
  }
  async handleRejection(completions, item) {
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionRejection(this.handle, completions.pid, item.idx);
    }
  }
  toString() {
    return `InlineCompletionsProvider(${this.providerId.toString()})`;
  }
};
ExtensionBackedInlineCompletionsProvider = __decorateClass([
  __decorateParam(17, ILanguageFeaturesService),
  __decorateParam(18, IAiEditTelemetryService),
  __decorateParam(19, IInstantiationService)
], ExtensionBackedInlineCompletionsProvider);
function extractEngineFromCorrelationId(correlationId) {
  if (!correlationId) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(correlationId);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.engine === "string") {
      return parsed.engine;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
export {
  MainThreadDocumentRangeSemanticTokensProvider,
  MainThreadDocumentSemanticTokensProvider,
  MainThreadLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0sIElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBWU0RhdGFUcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gYXMgRWRpdG9yUG9zaXRpb24sIElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSBhcyBFZGl0b3JSYW5nZSwgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJbmRlbnRhdGlvblJ1bGUsIExhbmd1YWdlQ29uZmlndXJhdGlvbiwgT25FbnRlclJ1bGUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgZGVjb2RlU2VtYW50aWNUb2tlbnNEdG8gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zRHRvLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgcmV2aXZlV29ya3NwYWNlRWRpdER0byB9IGZyb20gJy4vbWFpblRocmVhZEJ1bGtFZGl0cy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydCBmcm9tICcuLi9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IERhdGFUcmFuc2ZlckZpbGVDYWNoZSB9IGZyb20gJy4uL2NvbW1vbi9zaGFyZWQvZGF0YVRyYW5zZmVyQ2FjaGUuanMnO1xuaW1wb3J0ICogYXMgY2FsbGggZnJvbSAnLi4vLi4vY29udHJpYi9jYWxsSGllcmFyY2h5L2NvbW1vbi9jYWxsSGllcmFyY2h5LmpzJztcbmltcG9ydCAqIGFzIHNlYXJjaCBmcm9tICcuLi8uLi9jb250cmliL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIHR5cGVoIGZyb20gJy4uLy4uL2NvbnRyaWIvdHlwZUhpZXJhcmNoeS9jb21tb24vdHlwZUhpZXJhcmNoeS5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSwgSG92ZXJXaXRoSWQsIElDYWxsSGllcmFyY2h5SXRlbUR0bywgSUNvZGVBY3Rpb25EdG8sIElDb2RlQWN0aW9uUHJvdmlkZXJNZXRhZGF0YUR0bywgSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbiwgSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnMsIElEb2N1bWVudERyb3BFZGl0RHRvLCBJRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyTWV0YWRhdGEsIElEb2N1bWVudEZpbHRlckR0bywgSUluZGVudGF0aW9uUnVsZUR0bywgSUlubGF5SGludER0bywgSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50RHRvLCBJSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mb0R0bywgSUlubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbkR0bywgSUxhbmd1YWdlQ29uZmlndXJhdGlvbkR0bywgSUxhbmd1YWdlV29yZERlZmluaXRpb25EdG8sIElMaW5rRHRvLCBJTG9jYXRpb25EdG8sIElMb2NhdGlvbkxpbmtEdG8sIElPbkVudGVyUnVsZUR0bywgSVBhc3RlRWRpdER0bywgSVBhc3RlRWRpdFByb3ZpZGVyTWV0YWRhdGFEdG8sIElSZWdFeHBEdG8sIElTaWduYXR1cmVIZWxwUHJvdmlkZXJNZXRhZGF0YUR0bywgSVN1Z2dlc3REYXRhRHRvLCBJU3VnZ2VzdERhdGFEdG9GaWVsZCwgSVN1Z2dlc3RSZXN1bHREdG9GaWVsZCwgSVR5cGVIaWVyYXJjaHlJdGVtRHRvLCBJV29ya3NwYWNlU3ltYm9sRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UsIGZvcndhcmRUb0NoYW5uZWxJZiwgaXNDb3BpbG90TGlrZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2Jyb3dzZXIvZm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdERlbHRhSW5mbyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9ucy9jb21tb24vaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlRXZlbnQsIHNlbmRJbmxpbmVDb21wbGV0aW9uc0VuZE9mTGlmZVRlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdGVsZW1ldHJ5LmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU2VydmljZTogSUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcyk7XG5cblx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVBbGxXb3JkRGVmaW5pdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmREZWZpbml0aW9uRHRvczogSUxhbmd1YWdlV29yZERlZmluaXRpb25EdG9bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxhbmd1YWdlSWQgb2YgX2xhbmd1YWdlU2VydmljZS5nZXRSZWdpc3RlcmVkTGFuZ3VhZ2VJZHMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmREZWZpbml0aW9uID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuZ2V0V29yZERlZmluaXRpb24oKTtcblx0XHRcdFx0XHR3b3JkRGVmaW5pdGlvbkR0b3MucHVzaCh7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0cmVnZXhTb3VyY2U6IHdvcmREZWZpbml0aW9uLnNvdXJjZSxcblx0XHRcdFx0XHRcdHJlZ2V4RmxhZ3M6IHdvcmREZWZpbml0aW9uLmZsYWdzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcHJveHkuJHNldFdvcmREZWZpbml0aW9ucyh3b3JkRGVmaW5pdGlvbkR0b3MpO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0aWYgKCFlLmxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHR1cGRhdGVBbGxXb3JkRGVmaW5pdGlvbnMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB3b3JkRGVmaW5pdGlvbiA9IHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGUubGFuZ3VhZ2VJZCkuZ2V0V29yZERlZmluaXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kc2V0V29yZERlZmluaXRpb25zKFt7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBlLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRyZWdleFNvdXJjZTogd29yZERlZmluaXRpb24uc291cmNlLFxuXHRcdFx0XHRcdFx0cmVnZXhGbGFnczogd29yZERlZmluaXRpb24uZmxhZ3Ncblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHVwZGF0ZUFsbFdvcmREZWZpbml0aW9ucygpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2Uub25EaWRTdGF0ZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUodGhpcy5faW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2Uuc3RhdGUpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdElubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSh0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU2VydmljZS5zdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0JHVucmVnaXN0ZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiAtLS0gcmV2aXZlIGZ1bmN0aW9uc1xuXG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVMb2NhdGlvbkR0byhkYXRhPzogSUxvY2F0aW9uRHRvKTogbGFuZ3VhZ2VzLkxvY2F0aW9uO1xuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlTG9jYXRpb25EdG8oZGF0YT86IElMb2NhdGlvbkR0b1tdKTogbGFuZ3VhZ2VzLkxvY2F0aW9uW107XG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVMb2NhdGlvbkR0byhkYXRhOiBJTG9jYXRpb25EdG8gfCBJTG9jYXRpb25EdG9bXSB8IHVuZGVmaW5lZCk6IGxhbmd1YWdlcy5Mb2NhdGlvbiB8IGxhbmd1YWdlcy5Mb2NhdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdFx0ZGF0YS5mb3JFYWNoKGwgPT4gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uRHRvKGwpKTtcblx0XHRcdHJldHVybiA8bGFuZ3VhZ2VzLkxvY2F0aW9uW10+ZGF0YTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS51cmkgPSBVUkkucmV2aXZlKGRhdGEudXJpKTtcblx0XHRcdHJldHVybiA8bGFuZ3VhZ2VzLkxvY2F0aW9uPmRhdGE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUxvY2F0aW9uTGlua0R0byhkYXRhOiBJTG9jYXRpb25MaW5rRHRvKTogbGFuZ3VhZ2VzLkxvY2F0aW9uTGluaztcblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUxvY2F0aW9uTGlua0R0byhkYXRhOiBJTG9jYXRpb25MaW5rRHRvW10pOiBsYW5ndWFnZXMuTG9jYXRpb25MaW5rW107XG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVMb2NhdGlvbkxpbmtEdG8oZGF0YTogSUxvY2F0aW9uTGlua0R0byB8IElMb2NhdGlvbkxpbmtEdG9bXSk6IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmsgfCBsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10ge1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIDxsYW5ndWFnZXMuTG9jYXRpb25MaW5rPmRhdGE7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0XHRkYXRhLmZvckVhY2gobCA9PiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25MaW5rRHRvKGwpKTtcblx0XHRcdHJldHVybiA8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPmRhdGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEudXJpID0gVVJJLnJldml2ZShkYXRhLnVyaSk7XG5cdFx0XHRyZXR1cm4gPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbms+ZGF0YTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlV29ya3NwYWNlU3ltYm9sRHRvKGRhdGE6IElXb3Jrc3BhY2VTeW1ib2xEdG8pOiBzZWFyY2guSVdvcmtzcGFjZVN5bWJvbDtcblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhkYXRhOiBJV29ya3NwYWNlU3ltYm9sRHRvW10pOiBzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFtdO1xuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlV29ya3NwYWNlU3ltYm9sRHRvKGRhdGE6IHVuZGVmaW5lZCk6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhkYXRhOiBJV29ya3NwYWNlU3ltYm9sRHRvIHwgSVdvcmtzcGFjZVN5bWJvbER0b1tdIHwgdW5kZWZpbmVkKTogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2wgfCBzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdFx0ZGF0YS5mb3JFYWNoKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVXb3Jrc3BhY2VTeW1ib2xEdG8pO1xuXHRcdFx0cmV0dXJuIDxzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFtdPmRhdGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEubG9jYXRpb24gPSBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25EdG8oZGF0YS5sb2NhdGlvbik7XG5cdFx0XHRyZXR1cm4gPHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sPmRhdGE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUNvZGVBY3Rpb25EdG8oZGF0YTogUmVhZG9ubHlBcnJheTxJQ29kZUFjdGlvbkR0bz4sIHVyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSk6IGxhbmd1YWdlcy5Db2RlQWN0aW9uW10ge1xuXHRcdGRhdGE/LmZvckVhY2goY29kZSA9PiByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGNvZGUuZWRpdCwgdXJpSWRlbnRTZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIDxsYW5ndWFnZXMuQ29kZUFjdGlvbltdPmRhdGE7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlTGlua0RUTyhkYXRhOiBJTGlua0R0byk6IGxhbmd1YWdlcy5JTGluayB7XG5cdFx0aWYgKGRhdGEudXJsICYmIHR5cGVvZiBkYXRhLnVybCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGRhdGEudXJsID0gVVJJLnJldml2ZShkYXRhLnVybCk7XG5cdFx0fVxuXHRcdHJldHVybiA8bGFuZ3VhZ2VzLklMaW5rPmRhdGE7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlQ2FsbEhpZXJhcmNoeUl0ZW1EdG8oZGF0YTogSUNhbGxIaWVyYXJjaHlJdGVtRHRvIHwgdW5kZWZpbmVkKTogY2FsbGguQ2FsbEhpZXJhcmNoeUl0ZW0ge1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRkYXRhLnVyaSA9IFVSSS5yZXZpdmUoZGF0YS51cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGF0YSBhcyBjYWxsaC5DYWxsSGllcmFyY2h5SXRlbTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVUeXBlSGllcmFyY2h5SXRlbUR0byhkYXRhOiBJVHlwZUhpZXJhcmNoeUl0ZW1EdG8gfCB1bmRlZmluZWQpOiB0eXBlaC5UeXBlSGllcmFyY2h5SXRlbSB7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdGRhdGEudXJpID0gVVJJLnJldml2ZShkYXRhLnVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBkYXRhIGFzIHR5cGVoLlR5cGVIaWVyYXJjaHlJdGVtO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8gLS0tIG91dGxpbmVcblxuXHQkcmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGRpc3BsYXlOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9sczogKG1vZGVsOiBJVGV4dE1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURvY3VtZW50U3ltYm9scyhoYW5kbGUsIG1vZGVsLnVyaSwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBjb2RlIGxlbnNcblxuXHQkcmVnaXN0ZXJDb2RlTGVuc1N1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgZXZlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcHJvdmlkZXI6IGxhbmd1YWdlcy5Db2RlTGVuc1Byb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZUNvZGVMZW5zZXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29kZUxlbnNMaXN0IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3REdG8gPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNvZGVMZW5zZXMoaGFuZGxlLCBtb2RlbC51cmksIHRva2VuKTtcblx0XHRcdFx0aWYgKCFsaXN0RHRvKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxlbnNlczogbGlzdER0by5sZW5zZXMsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gbGlzdER0by5jYWNoZUlkICYmIHRoaXMuX3Byb3h5LiRyZWxlYXNlQ29kZUxlbnNlcyhoYW5kbGUsIGxpc3REdG8uY2FjaGVJZClcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlQ29kZUxlbnM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgY29kZUxlbnM6IGxhbmd1YWdlcy5Db2RlTGVucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29kZUxlbnMgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVDb2RlTGVucyhoYW5kbGUsIGNvZGVMZW5zLCB0b2tlbik7XG5cdFx0XHRcdGlmICghcmVzdWx0IHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4ucmVzdWx0LFxuXHRcdFx0XHRcdHJhbmdlOiBtb2RlbC52YWxpZGF0ZVJhbmdlKHJlc3VsdC5yYW5nZSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8bGFuZ3VhZ2VzLkNvZGVMZW5zUHJvdmlkZXI+KCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChldmVudEhhbmRsZSwgZW1pdHRlcik7XG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZSA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0JGVtaXRDb2RlTGVuc0V2ZW50KGV2ZW50SGFuZGxlOiBudW1iZXIsIGV2ZW50PzogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUoZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBkZWNsYXJhdGlvblxuXG5cdCRyZWdpc3RlckRlZmluaXRpb25TdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZURlZmluaXRpb246IChtb2RlbCwgcG9zaXRpb24sIHRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRGVmaW5pdGlvbihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKS50aGVuKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMb2NhdGlvbkxpbmtEdG8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3RlckRlY2xhcmF0aW9uU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWNsYXJhdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlRGVjbGFyYXRpb246IChtb2RlbCwgcG9zaXRpb24sIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURlY2xhcmF0aW9uKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgdG9rZW4pLnRoZW4oTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uTGlua0R0byk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0JHJlZ2lzdGVySW1wbGVtZW50YXRpb25TdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbjogKG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVJbXBsZW1lbnRhdGlvbihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKS50aGVuKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMb2NhdGlvbkxpbmtEdG8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3RlclR5cGVEZWZpbml0aW9uU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS50eXBlRGVmaW5pdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlVHlwZURlZmluaXRpb246IChtb2RlbCwgcG9zaXRpb24sIHRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlVHlwZURlZmluaXRpb24oaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbikudGhlbihNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25MaW5rRHRvKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gZXh0cmEgaW5mb1xuXG5cdCRyZWdpc3RlckhvdmVyUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdC8qXG5cdFx0Y29uc3QgaG92ZXJGaW5hbGl6YXRpb25SZWdpc3RyeSA9IG5ldyBGaW5hbGl6YXRpb25SZWdpc3RyeSgoaG92ZXJJZDogbnVtYmVyKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZUhvdmVyKGhhbmRsZSwgaG92ZXJJZCk7XG5cdFx0fSk7XG5cdFx0Ki9cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVIb3ZlcjogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dD86IGxhbmd1YWdlcy5Ib3ZlckNvbnRleHQ8SG92ZXJXaXRoSWQ+KTogUHJvbWlzZTxIb3ZlcldpdGhJZCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCBzZXJpYWxpemVkQ29udGV4dDogbGFuZ3VhZ2VzLkhvdmVyQ29udGV4dDx7IGlkOiBudW1iZXIgfT4gPSB7XG5cdFx0XHRcdFx0dmVyYm9zaXR5UmVxdWVzdDogY29udGV4dD8udmVyYm9zaXR5UmVxdWVzdCA/IHtcblx0XHRcdFx0XHRcdHZlcmJvc2l0eURlbHRhOiBjb250ZXh0LnZlcmJvc2l0eVJlcXVlc3QudmVyYm9zaXR5RGVsdGEsXG5cdFx0XHRcdFx0XHRwcmV2aW91c0hvdmVyOiB7IGlkOiBjb250ZXh0LnZlcmJvc2l0eVJlcXVlc3QucHJldmlvdXNIb3Zlci5pZCB9XG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUhvdmVyKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgc2VyaWFsaXplZENvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0Ly8gaG92ZXJGaW5hbGl6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcihob3ZlciwgaG92ZXIuaWQpO1xuXHRcdFx0XHRyZXR1cm4gaG92ZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGRlYnVnIGhvdmVyXG5cblx0JHJlZ2lzdGVyRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVFdmFsdWF0YWJsZUV4cHJlc3Npb246IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRXZhbHVhdGFibGVFeHByZXNzaW9uKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBpbmxpbmUgdmFsdWVzXG5cblx0JHJlZ2lzdGVySW5saW5lVmFsdWVzUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgZXZlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBsYW5ndWFnZXMuSW5saW5lVmFsdWVzUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlSW5saW5lVmFsdWVzOiAobW9kZWw6IElUZXh0TW9kZWwsIHZpZXdQb3J0OiBFZGl0b3JSYW5nZSwgY29udGV4dDogbGFuZ3VhZ2VzLklubGluZVZhbHVlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuSW5saW5lVmFsdWVbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVJbmxpbmVWYWx1ZXMoaGFuZGxlLCBtb2RlbC51cmksIHZpZXdQb3J0LCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGV2ZW50SGFuZGxlLCBlbWl0dGVyKTtcblx0XHRcdHByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5saW5lVmFsdWVzID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZVZhbHVlc1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0JGVtaXRJbmxpbmVWYWx1ZXNFdmVudChldmVudEhhbmRsZTogbnVtYmVyLCBldmVudD86IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChldmVudEhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gb2NjdXJyZW5jZXNcblxuXHQkcmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodFtdIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRzZWxlY3Rvcjogc2VsZWN0b3IsXG5cdFx0XHRwcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCBvdGhlck1vZGVsczogSVRleHRNb2RlbFtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1hcDxVUkksIGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodFtdPiB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVNdWx0aURvY3VtZW50SGlnaGxpZ2h0cyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIG90aGVyTW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC51cmkpLCB0b2tlbikudGhlbihkdG8gPT4ge1xuXHRcdFx0XHRcdC8vIGR0byBzaG91bGQgYmUgbm9uLW51bGwgKyBub24tdW5kZWZpbmVkXG5cdFx0XHRcdFx0Ly8gZHRvIGxlbmd0aCBvZiAwIGlzIHZhbGlkLCBqdXN0IG5vIGhpZ2hsaWdodHMsIHBhc3MgdGhpcyB0aHJvdWdoLlxuXHRcdFx0XHRcdGlmIChkdG8gPT09IHVuZGVmaW5lZCB8fCBkdG8gPT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBSZXNvdXJjZU1hcDxsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXT4oKTtcblx0XHRcdFx0XHRkdG8/LmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhlIFVSSSBleGlzdHMgYWxyZWFkeSwgaWYgc28sIGNvbWJpbmUgdGhlIGhpZ2hsaWdodHMsIG90aGVyd2lzZSBjcmVhdGUgYSBuZXcgZW50cnlcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUodmFsdWUudXJpKTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQuaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LmdldCh1cmkpIS5wdXNoKC4uLnZhbHVlLmhpZ2hsaWdodHMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnNldCh1cmksIHZhbHVlLmhpZ2hsaWdodHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBsaW5rZWQgZWRpdGluZ1xuXG5cdCRyZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlTGlua2VkRWRpdGluZ1JhbmdlczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxpbmtlZEVkaXRpbmdSYW5nZXMgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVMaW5rZWRFZGl0aW5nUmFuZ2VzKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRpZiAocmVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHJhbmdlczogcmVzLnJhbmdlcyxcblx0XHRcdFx0XHRcdHdvcmRQYXR0ZXJuOiByZXMud29yZFBhdHRlcm4gPyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlUmVnRXhwKHJlcy53b3JkUGF0dGVybikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIHJlZmVyZW5jZXNcblxuXHQkcmVnaXN0ZXJSZWZlcmVuY2VTdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlczogKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5SZWZlcmVuY2VDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbltdPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZVJlZmVyZW5jZXMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbikudGhlbihNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25EdG8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBjb2RlIGFjdGlvbnNcblxuXHQkcmVnaXN0ZXJDb2RlQWN0aW9uU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBtZXRhZGF0YTogSUNvZGVBY3Rpb25Qcm92aWRlck1ldGFkYXRhRHRvLCBkaXNwbGF5TmFtZTogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBzdXBwb3J0c1Jlc29sdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVDb2RlQWN0aW9uczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZU9yU2VsZWN0aW9uOiBFZGl0b3JSYW5nZSB8IFNlbGVjdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Db2RlQWN0aW9uTGlzdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0RHRvID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDb2RlQWN0aW9ucyhoYW5kbGUsIG1vZGVsLnVyaSwgcmFuZ2VPclNlbGVjdGlvbiwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWxpc3REdG8pIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0YWN0aW9uczogTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUNvZGVBY3Rpb25EdG8obGlzdER0by5hY3Rpb25zLCB0aGlzLl91cmlJZGVudFNlcnZpY2UpLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgbGlzdER0by5jYWNoZUlkID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZUNvZGVBY3Rpb25zKGhhbmRsZSwgbGlzdER0by5jYWNoZUlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZWRDb2RlQWN0aW9uS2luZHM6IG1ldGFkYXRhLnByb3ZpZGVkS2luZHMsXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBtZXRhZGF0YS5kb2N1bWVudGF0aW9uLFxuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHR9O1xuXG5cdFx0aWYgKHN1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0cHJvdmlkZXIucmVzb2x2ZUNvZGVBY3Rpb24gPSBhc3luYyAoY29kZUFjdGlvbjogbGFuZ3VhZ2VzLkNvZGVBY3Rpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkNvZGVBY3Rpb24+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZUNvZGVBY3Rpb24oaGFuZGxlLCAoPElDb2RlQWN0aW9uRHRvPmNvZGVBY3Rpb24pLmNhY2hlSWQhLCB0b2tlbik7XG5cdFx0XHRcdGlmIChyZXNvbHZlZC5lZGl0KSB7XG5cdFx0XHRcdFx0Y29kZUFjdGlvbi5lZGl0ID0gcmV2aXZlV29ya3NwYWNlRWRpdER0byhyZXNvbHZlZC5lZGl0LCB0aGlzLl91cmlJZGVudFNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlc29sdmVkLmNvbW1hbmQpIHtcblx0XHRcdFx0XHRjb2RlQWN0aW9uLmNvbW1hbmQgPSByZXNvbHZlZC5jb21tYW5kO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGNvZGVBY3Rpb247XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8gLS0tIGNvcHkgcGFzdGUgYWN0aW9uIHByb3ZpZGVyXG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGFzdGVFZGl0UHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIE1haW5UaHJlYWRQYXN0ZUVkaXRQcm92aWRlcj4oKTtcblxuXHQkcmVnaXN0ZXJQYXN0ZUVkaXRQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBtZXRhZGF0YTogSVBhc3RlRWRpdFByb3ZpZGVyTWV0YWRhdGFEdG8pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNYWluVGhyZWFkUGFzdGVFZGl0UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl9wcm94eSwgbWV0YWRhdGEsIHRoaXMuX3VyaUlkZW50U2VydmljZSk7XG5cdFx0dGhpcy5fcGFzdGVFZGl0UHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHByb3ZpZGVyKSxcblx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wYXN0ZUVkaXRQcm92aWRlcnMuZGVsZXRlKGhhbmRsZSkpLFxuXHRcdCkpO1xuXHR9XG5cblx0JHJlc29sdmVQYXN0ZUZpbGVEYXRhKGhhbmRsZTogbnVtYmVyLCByZXF1ZXN0SWQ6IG51bWJlciwgZGF0YUlkOiBzdHJpbmcpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wYXN0ZUVkaXRQcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBwcm92aWRlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3RJZCwgZGF0YUlkKTtcblx0fVxuXG5cdC8vIC0tLSBmb3JtYXR0aW5nXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZGlzcGxheU5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0cHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzOiAobW9kZWw6IElUZXh0TW9kZWwsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhoYW5kbGUsIG1vZGVsLnVyaSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3RlclJhbmdlRm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGRpc3BsYXlOYW1lOiBzdHJpbmcsIHN1cHBvcnRzUmFuZ2VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzOiAobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBFZGl0b3JSYW5nZSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMoaGFuZGxlLCBtb2RlbC51cmksIHJhbmdlLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzOiAhc3VwcG9ydHNSYW5nZXNcblx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0OiAobW9kZWwsIHJhbmdlcywgb3B0aW9ucywgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyhoYW5kbGUsIG1vZGVsLnVyaSwgcmFuZ2VzLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdH0sXG5cdFx0fSkpO1xuXHR9XG5cblx0JHJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgYXV0b0Zvcm1hdFRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0YXV0b0Zvcm1hdFRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0cHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0czogKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIGNoOiBzdHJpbmcsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCBjaCwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBuYXZpZ2F0ZSB0eXBlXG5cblx0JHJlZ2lzdGVyTmF2aWdhdGVUeXBlU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc3VwcG9ydHNSZXNvbHZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IGxhc3RSZXN1bHRJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXI6IHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9sczogYXN5bmMgKHNlYXJjaDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sW10+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKGhhbmRsZSwgc2VhcmNoLCB0b2tlbik7XG5cdFx0XHRcdGlmIChsYXN0UmVzdWx0SWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlV29ya3NwYWNlU3ltYm9scyhoYW5kbGUsIGxhc3RSZXN1bHRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFJlc3VsdElkID0gcmVzdWx0LmNhY2hlSWQ7XG5cdFx0XHRcdHJldHVybiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlV29ya3NwYWNlU3ltYm9sRHRvKHJlc3VsdC5zeW1ib2xzKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmIChzdXBwb3J0c1Jlc29sdmUpIHtcblx0XHRcdHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2VTeW1ib2wgPSBhc3luYyAoaXRlbTogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2wsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c2VhcmNoLklXb3Jrc3BhY2VTeW1ib2wgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRJdGVtID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVXb3Jrc3BhY2VTeW1ib2woaGFuZGxlLCBpdGVtLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlZEl0ZW0gJiYgTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhyZXNvbHZlZEl0ZW0pO1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCBzZWFyY2guV29ya3NwYWNlU3ltYm9sUHJvdmlkZXJSZWdpc3RyeS5yZWdpc3Rlcihwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8gLS0tIHJlbmFtZVxuXG5cdCRyZWdpc3RlclJlbmFtZVN1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgc3VwcG9ydFJlc29sdmVMb2NhdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZVJlbmFtZUVkaXRzKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgbmV3TmFtZSwgdG9rZW4pLnRoZW4oZGF0YSA9PiByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGRhdGEsIHRoaXMuX3VyaUlkZW50U2VydmljZSkpO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVSZW5hbWVMb2NhdGlvbjogc3VwcG9ydFJlc29sdmVMb2NhdGlvblxuXHRcdFx0XHQ/IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5SZW5hbWVMb2NhdGlvbiB8IHVuZGVmaW5lZD4gPT4gdGhpcy5fcHJveHkuJHJlc29sdmVSZW5hbWVMb2NhdGlvbihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3Rlck5ld1N5bWJvbE5hbWVzUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubmV3U3ltYm9sTmFtZXNQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0c3VwcG9ydHNBdXRvbWF0aWNOZXdTeW1ib2xOYW1lc1RyaWdnZXJLaW5kOiB0aGlzLl9wcm94eS4kc3VwcG9ydHNBdXRvbWF0aWNOZXdTeW1ib2xOYW1lc1RyaWdnZXJLaW5kKGhhbmRsZSksXG5cdFx0XHRwcm92aWRlTmV3U3ltYm9sTmFtZXM6IChtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IElSYW5nZSwgdHJpZ2dlcktpbmQ6IGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVOZXdTeW1ib2xOYW1lcyhoYW5kbGUsIG1vZGVsLnVyaSwgcmFuZ2UsIHRyaWdnZXJLaW5kLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fSBzYXRpc2ZpZXMgbGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVzUHJvdmlkZXIpKTtcblx0fVxuXG5cdC8vIC0tLSBzZW1hbnRpYyB0b2tlbnNcblxuXHQkcmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgbGVnZW5kOiBsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQsIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRsZXQgZXZlbnQ6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGV2ZW50SGFuZGxlLCBlbWl0dGVyKTtcblx0XHRcdGV2ZW50ID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIG5ldyBNYWluVGhyZWFkRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKHRoaXMuX3Byb3h5LCBoYW5kbGUsIGxlZ2VuZCwgZXZlbnQpKSk7XG5cdH1cblxuXHQkZW1pdERvY3VtZW50U2VtYW50aWNUb2tlbnNFdmVudChldmVudEhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fcmVnaXN0cmF0aW9ucy5nZXQoZXZlbnRIYW5kbGUpO1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBFbWl0dGVyKSB7XG5cdFx0XHRvYmouZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdCRlbWl0RG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zRXZlbnQoZXZlbnRIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQkcmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBsZWdlbmQ6IGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCwgZXZlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCBldmVudDogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBldmVudEhhbmRsZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoZXZlbnRIYW5kbGUsIGVtaXR0ZXIpO1xuXHRcdFx0ZXZlbnQgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBuZXcgTWFpblRocmVhZERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKHRoaXMuX3Byb3h5LCBoYW5kbGUsIGxlZ2VuZCwgZXZlbnQpKSk7XG5cdH1cblxuXHQvLyAtLS0gc3VnZ2VzdFxuXG5cdHByaXZhdGUgc3RhdGljIF9pbmZsYXRlU3VnZ2VzdER0byhkZWZhdWx0UmFuZ2U6IElSYW5nZSB8IHsgaW5zZXJ0OiBJUmFuZ2U7IHJlcGxhY2U6IElSYW5nZSB9LCBkYXRhOiBJU3VnZ2VzdERhdGFEdG8sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtIHtcblxuXHRcdGNvbnN0IGxhYmVsID0gZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5sYWJlbF07XG5cdFx0Y29uc3QgY29tbWFuZElkID0gZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kSWRdO1xuXHRcdGNvbnN0IGNvbW1hbmRJZGVudCA9IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XTtcblx0XHRjb25zdCBjb21taXRDaGFycyA9IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWl0Q2hhcmFjdGVyc107XG5cblx0XHR0eXBlIElkZW50Q29tbWFuZCA9IGxhbmd1YWdlcy5Db21tYW5kICYgeyAkaWRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXG5cdFx0bGV0IGNvbW1hbmQ6IElkZW50Q29tbWFuZCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29tbWFuZElkKSB7XG5cdFx0XHRjb21tYW5kID0ge1xuXHRcdFx0XHQkaWRlbnQ6IGNvbW1hbmRJZGVudCxcblx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRhcmd1bWVudHM6IGNvbW1hbmRJZGVudCA/IFtjb21tYW5kSWRlbnRdIDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kQXJndW1lbnRzXSwgLy8gQXV0b21hdGljYWxseSBmaWxsIGluIGlkZW50IGFzIGZpcnN0IGFyZ3VtZW50XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbCxcblx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0a2luZDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5raW5kXSA/PyBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0dGFnczogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5raW5kTW9kaWZpZXJdLFxuXHRcdFx0ZGV0YWlsOiBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLmRldGFpbF0sXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLmRvY3VtZW50YXRpb25dLFxuXHRcdFx0c29ydFRleHQ6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuc29ydFRleHRdLFxuXHRcdFx0ZmlsdGVyVGV4dDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5maWx0ZXJUZXh0XSxcblx0XHRcdHByZXNlbGVjdDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5wcmVzZWxlY3RdLFxuXHRcdFx0aW5zZXJ0VGV4dDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XSA/PyAodHlwZW9mIGxhYmVsID09PSAnc3RyaW5nJyA/IGxhYmVsIDogbGFiZWwubGFiZWwpLFxuXHRcdFx0cmFuZ2U6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQucmFuZ2VdID8/IGRlZmF1bHRSYW5nZSxcblx0XHRcdGluc2VydFRleHRSdWxlczogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0UnVsZXNdLFxuXHRcdFx0Y29tbWl0Q2hhcmFjdGVyczogY29tbWl0Q2hhcnMgPyBBcnJheS5mcm9tKGNvbW1pdENoYXJzKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuYWRkaXRpb25hbFRleHRFZGl0c10sXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0Ly8gbm90LXN0YW5kYXJkXG5cdFx0XHRfaWQ6IGRhdGEueCxcblx0XHR9O1xuXHR9XG5cblx0JHJlZ2lzdGVyQ29tcGxldGlvbnNQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCB0cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10sIHN1cHBvcnRzUmVzb2x2ZURldGFpbHM6IGJvb2xlYW4sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXI6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogYCR7ZXh0ZW5zaW9uSWQudmFsdWV9KCR7dHJpZ2dlckNoYXJhY3RlcnMuam9pbignJyl9KWAsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Db21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHJlc3VsdFtJU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmNvbXBsZXRpb25zXS5tYXAoZCA9PiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5faW5mbGF0ZVN1Z2dlc3REdG8ocmVzdWx0W0lTdWdnZXN0UmVzdWx0RHRvRmllbGQuZGVmYXVsdFJhbmdlc10sIGQsIGV4dGVuc2lvbklkKSksXG5cdFx0XHRcdFx0aW5jb21wbGV0ZTogcmVzdWx0W0lTdWdnZXN0UmVzdWx0RHRvRmllbGQuaXNJbmNvbXBsZXRlXSB8fCBmYWxzZSxcblx0XHRcdFx0XHRkdXJhdGlvbjogcmVzdWx0W0lTdWdnZXN0UmVzdWx0RHRvRmllbGQuZHVyYXRpb25dLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0LnggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlQ29tcGxldGlvbkl0ZW1zKGhhbmRsZSwgcmVzdWx0LngpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmIChzdXBwb3J0c1Jlc29sdmVEZXRhaWxzKSB7XG5cdFx0XHRwcm92aWRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0gPSAoc3VnZ2VzdGlvbiwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXNvbHZlQ29tcGxldGlvbkl0ZW0oaGFuZGxlLCBzdWdnZXN0aW9uLl9pZCEsIHRva2VuKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBzdWdnZXN0aW9uO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG5ld1N1Z2dlc3Rpb24gPSBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5faW5mbGF0ZVN1Z2dlc3REdG8oc3VnZ2VzdGlvbi5yYW5nZSwgcmVzdWx0LCBleHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG1peGluKHN1Z2dlc3Rpb24sIG5ld1N1Z2dlc3Rpb24sIHRydWUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0JHJlZ2lzdGVySW5saW5lQ29tcGxldGlvbnNTdXBwb3J0KFxuXHRcdGhhbmRsZTogbnVtYmVyLFxuXHRcdHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSxcblx0XHRzdXBwb3J0c0hhbmRsZUV2ZW50czogYm9vbGVhbixcblx0XHRleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdGV4dGVuc2lvblZlcnNpb246IHN0cmluZyxcblx0XHRncm91cElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0eWllbGRzVG9FeHRlbnNpb25JZHM6IHN0cmluZ1tdLFxuXHRcdGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0ZGVib3VuY2VEZWxheU1zOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0ZXhjbHVkZXNFeHRlbnNpb25JZHM6IHN0cmluZ1tdLFxuXHRcdHN1cHBvcnRzT25EaWRDaGFuZ2U6IGJvb2xlYW4sXG5cdFx0c3VwcG9ydHNTZXRNb2RlbElkOiBib29sZWFuLFxuXHRcdGluaXRpYWxNb2RlbEluZm86IElJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvRHRvIHwgdW5kZWZpbmVkLFxuXHRcdHN1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm86IGJvb2xlYW4sXG5cdFx0c3VwcG9ydHNTZXRQcm92aWRlck9wdGlvbjogYm9vbGVhbixcblx0XHRpbml0aWFsUHJvdmlkZXJPcHRpb25zOiByZWFkb25seSBJSW5saW5lQ29tcGxldGlvblByb3ZpZGVyT3B0aW9uRHRvW10gfCB1bmRlZmluZWQsXG5cdFx0c3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9uczogYm9vbGVhbixcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IG5ldyBsYW5ndWFnZXMuUHJvdmlkZXJJZChleHRlbnNpb25JZCwgZXh0ZW5zaW9uVmVyc2lvbiwgZ3JvdXBJZCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RXh0ZW5zaW9uQmFja2VkSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcixcblx0XHRcdGhhbmRsZSxcblx0XHRcdGdyb3VwSWQgPz8gZXh0ZW5zaW9uSWQsXG5cdFx0XHRwcm92aWRlcklkLFxuXHRcdFx0eWllbGRzVG9FeHRlbnNpb25JZHMsXG5cdFx0XHRleGNsdWRlc0V4dGVuc2lvbklkcyxcblx0XHRcdGRlYm91bmNlRGVsYXlNcyxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0aW5pdGlhbE1vZGVsSW5mbyxcblx0XHRcdHN1cHBvcnRzSGFuZGxlRXZlbnRzLFxuXHRcdFx0c3VwcG9ydHNTZXRNb2RlbElkLFxuXHRcdFx0c3VwcG9ydHNPbkRpZENoYW5nZSxcblx0XHRcdHN1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm8sXG5cdFx0XHRpbml0aWFsUHJvdmlkZXJPcHRpb25zLFxuXHRcdFx0c3VwcG9ydHNTZXRQcm92aWRlck9wdGlvbixcblx0XHRcdHN1cHBvcnRzT25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnMsXG5cdFx0XHRzZWxlY3Rvcixcblx0XHRcdHRoaXMuX3Byb3h5LFxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0fVxuXG5cdCRlbWl0SW5saW5lQ29tcGxldGlvbnNDaGFuZ2UoaGFuZGxlOiBudW1iZXIsIGNoYW5nZUhpbnQ6IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludER0byB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEV4dGVuc2lvbkJhY2tlZElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIpIHtcblx0XHRcdG9iai5fZW1pdERpZENoYW5nZShjaGFuZ2VIaW50KTtcblx0XHR9XG5cdH1cblxuXHQkZW1pdElubGluZUNvbXBsZXRpb25Nb2RlbEluZm9DaGFuZ2UoaGFuZGxlOiBudW1iZXIsIGRhdGE6IElJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvRHRvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fcmVnaXN0cmF0aW9ucy5nZXQoaGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRXh0ZW5zaW9uQmFja2VkSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcikge1xuXHRcdFx0b2JqLl9zZXRNb2RlbEluZm8oZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0JGVtaXRJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJPcHRpb25zQ2hhbmdlKGhhbmRsZTogbnVtYmVyLCBkYXRhOiByZWFkb25seSBJSW5saW5lQ29tcGxldGlvblByb3ZpZGVyT3B0aW9uRHRvW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChoYW5kbGUpO1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBFeHRlbnNpb25CYWNrZWRJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKSB7XG5cdFx0XHRvYmouX3NldFByb3ZpZGVyT3B0aW9ucyhkYXRhKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gcGFyYW1ldGVyIGhpbnRzXG5cblx0JHJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIG1ldGFkYXRhOiBJU2lnbmF0dXJlSGVscFByb3ZpZGVyTWV0YWRhdGFEdG8pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXG5cdFx0XHRzaWduYXR1cmVIZWxwVHJpZ2dlckNoYXJhY3RlcnM6IG1ldGFkYXRhLnRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0c2lnbmF0dXJlSGVscFJldHJpZ2dlckNoYXJhY3RlcnM6IG1ldGFkYXRhLnJldHJpZ2dlckNoYXJhY3RlcnMsXG5cblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjb250ZXh0OiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscENvbnRleHQpOiBQcm9taXNlPGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUmVzdWx0IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlU2lnbmF0dXJlSGVscChoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dmFsdWU6IHJlc3VsdCxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZVNpZ25hdHVyZUhlbHAoaGFuZGxlLCByZXN1bHQuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW5saW5lIGhpbnRzXG5cblx0JHJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIHN1cHBvcnRzUmVzb2x2ZTogYm9vbGVhbiwgZXZlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCwgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBsYW5ndWFnZXMuSW5sYXlIaW50c1Byb3ZpZGVyID0ge1xuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRwcm92aWRlSW5sYXlIaW50czogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogRWRpdG9yUmFuZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLklubGF5SGludExpc3QgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVJbmxheUhpbnRzKGhhbmRsZSwgbW9kZWwudXJpLCByYW5nZSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGhpbnRzOiByZXZpdmUocmVzdWx0LmhpbnRzKSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0LmNhY2hlSWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VJbmxheUhpbnRzKGhhbmRsZSwgcmVzdWx0LmNhY2hlSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmIChzdXBwb3J0c1Jlc29sdmUpIHtcblx0XHRcdHByb3ZpZGVyLnJlc29sdmVJbmxheUhpbnQgPSBhc3luYyAoaGludCwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgZHRvOiBJSW5sYXlIaW50RHRvID0gaGludDtcblx0XHRcdFx0aWYgKCFkdG8uY2FjaGVJZCkge1xuXHRcdFx0XHRcdHJldHVybiBoaW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlSW5sYXlIaW50KGhhbmRsZSwgZHRvLmNhY2hlSWQsIHRva2VuKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gaGludDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmhpbnQsXG5cdFx0XHRcdFx0dG9vbHRpcDogcmVzdWx0LnRvb2x0aXAsXG5cdFx0XHRcdFx0bGFiZWw6IHJldml2ZTxzdHJpbmcgfCBsYW5ndWFnZXMuSW5sYXlIaW50TGFiZWxQYXJ0W10+KHJlc3VsdC5sYWJlbCksXG5cdFx0XHRcdFx0dGV4dEVkaXRzOiByZXN1bHQudGV4dEVkaXRzXG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChldmVudEhhbmRsZSwgZW1pdHRlcik7XG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUlubGF5SGludHMgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0JGVtaXRJbmxheUhpbnRzRXZlbnQoZXZlbnRIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gbGlua3NcblxuXHQkcmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBzdXBwb3J0c1Jlc29sdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogbGFuZ3VhZ2VzLkxpbmtQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVMaW5rczogKG1vZGVsLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudExpbmtzKGhhbmRsZSwgbW9kZWwudXJpLCB0b2tlbikudGhlbihkdG8gPT4ge1xuXHRcdFx0XHRcdGlmICghZHRvKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGlua3M6IGR0by5saW5rcy5tYXAoTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxpbmtEVE8pLFxuXHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIGR0by5jYWNoZUlkID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlRG9jdW1lbnRMaW5rcyhoYW5kbGUsIGR0by5jYWNoZUlkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKHN1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0cHJvdmlkZXIucmVzb2x2ZUxpbmsgPSAobGluaywgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgZHRvOiBJTGlua0R0byA9IGxpbms7XG5cdFx0XHRcdGlmICghZHRvLmNhY2hlSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbGluaztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlc29sdmVEb2N1bWVudExpbmsoaGFuZGxlLCBkdG8uY2FjaGVJZCwgdG9rZW4pLnRoZW4ob2JqID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gb2JqICYmIE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMaW5rRFRPKG9iaik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHByb3ZpZGVyKSk7XG5cdH1cblxuXHQvLyAtLS0gY29sb3JzXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRDb2xvclByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm94eSA9IHRoaXMuX3Byb3h5O1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29sb3JQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50Q29sb3JzOiAobW9kZWwsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiBwcm94eS4kcHJvdmlkZURvY3VtZW50Q29sb3JzKGhhbmRsZSwgbW9kZWwudXJpLCB0b2tlbilcblx0XHRcdFx0XHQudGhlbihkb2N1bWVudENvbG9ycyA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZG9jdW1lbnRDb2xvcnMubWFwKGRvY3VtZW50Q29sb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBbcmVkLCBncmVlbiwgYmx1ZSwgYWxwaGFdID0gZG9jdW1lbnRDb2xvci5jb2xvcjtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29sb3IgPSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVkOiByZWQsXG5cdFx0XHRcdFx0XHRcdFx0Z3JlZW46IGdyZWVuLFxuXHRcdFx0XHRcdFx0XHRcdGJsdWU6IGJsdWUsXG5cdFx0XHRcdFx0XHRcdFx0YWxwaGFcblx0XHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbG9yLFxuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBkb2N1bWVudENvbG9yLnJhbmdlXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cblx0XHRcdHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnM6IChtb2RlbCwgY29sb3JJbmZvLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcHJveHkuJHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoaGFuZGxlLCBtb2RlbC51cmksIHtcblx0XHRcdFx0XHRjb2xvcjogW2NvbG9ySW5mby5jb2xvci5yZWQsIGNvbG9ySW5mby5jb2xvci5ncmVlbiwgY29sb3JJbmZvLmNvbG9yLmJsdWUsIGNvbG9ySW5mby5jb2xvci5hbHBoYV0sXG5cdFx0XHRcdFx0cmFuZ2U6IGNvbG9ySW5mby5yYW5nZVxuXHRcdFx0XHR9LCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGZvbGRpbmdcblxuXHQkcmVnaXN0ZXJGb2xkaW5nUmFuZ2VQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXZlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlUHJvdmlkZXIgPSB7XG5cdFx0XHRpZDogZXh0ZW5zaW9uSWQudmFsdWUsXG5cdFx0XHRwcm92aWRlRm9sZGluZ1JhbmdlczogKG1vZGVsLCBjb250ZXh0LCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVGb2xkaW5nUmFuZ2VzKGhhbmRsZSwgbW9kZWwudXJpLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8bGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZVByb3ZpZGVyPigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoZXZlbnRIYW5kbGUsIGVtaXR0ZXIpO1xuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2UgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZm9sZGluZ1JhbmdlUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHByb3ZpZGVyKSk7XG5cdH1cblxuXHQkZW1pdEZvbGRpbmdSYW5nZUV2ZW50KGV2ZW50SGFuZGxlOiBudW1iZXIsIGV2ZW50PzogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUoZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIHNtYXJ0IHNlbGVjdFxuXG5cdCRyZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2VsZWN0aW9uUmFuZ2VQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZVNlbGVjdGlvblJhbmdlczogKG1vZGVsLCBwb3NpdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZVNlbGVjdGlvblJhbmdlcyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb25zLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGNhbGwgaGllcmFyY2h5XG5cblx0JHJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIGNhbGxoLkNhbGxIaWVyYXJjaHlQcm92aWRlclJlZ2lzdHJ5LnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cblx0XHRcdHByZXBhcmVDYWxsSGllcmFyY2h5OiBhc3luYyAoZG9jdW1lbnQsIHBvc2l0aW9uLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcmVwYXJlQ2FsbEhpZXJhcmNoeShoYW5kbGUsIGRvY3VtZW50LnVyaSwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdFx0aWYgKCFpdGVtcyB8fCBpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlQ2FsbEhpZXJhcmNoeShoYW5kbGUsIGl0ZW0uX3Nlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyb290czogaXRlbXMubWFwKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVDYWxsSGllcmFyY2h5SXRlbUR0bylcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cblx0XHRcdHByb3ZpZGVPdXRnb2luZ0NhbGxzOiBhc3luYyAoaXRlbSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgb3V0Z29pbmcgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxzKGhhbmRsZSwgaXRlbS5fc2Vzc2lvbklkLCBpdGVtLl9pdGVtSWQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFvdXRnb2luZykge1xuXHRcdFx0XHRcdHJldHVybiBvdXRnb2luZztcblx0XHRcdFx0fVxuXHRcdFx0XHRvdXRnb2luZy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdFx0XHR2YWx1ZS50byA9IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVDYWxsSGllcmFyY2h5SXRlbUR0byh2YWx1ZS50byk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0cmV0dXJuIDxhbnk+b3V0Z29pbmc7XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZUluY29taW5nQ2FsbHM6IGFzeW5jIChpdGVtLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbWluZyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbHMoaGFuZGxlLCBpdGVtLl9zZXNzaW9uSWQsIGl0ZW0uX2l0ZW1JZCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWluY29taW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluY29taW5nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluY29taW5nLmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0XHRcdHZhbHVlLmZyb20gPSBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlQ2FsbEhpZXJhcmNoeUl0ZW1EdG8odmFsdWUuZnJvbSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0cmV0dXJuIDxhbnk+aW5jb21pbmc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGNvbmZpZ3VyYXRpb25cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlUmVnRXhwKHJlZ0V4cDogSVJlZ0V4cER0byk6IFJlZ0V4cCB7XG5cdFx0cmV0dXJuIG5ldyBSZWdFeHAocmVnRXhwLnBhdHRlcm4sIHJlZ0V4cC5mbGFncyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlSW5kZW50YXRpb25SdWxlKGluZGVudGF0aW9uUnVsZTogSUluZGVudGF0aW9uUnVsZUR0byk6IEluZGVudGF0aW9uUnVsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuKSxcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuKSxcblx0XHRcdGluZGVudE5leHRMaW5lUGF0dGVybjogaW5kZW50YXRpb25SdWxlLmluZGVudE5leHRMaW5lUGF0dGVybiA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAoaW5kZW50YXRpb25SdWxlLmluZGVudE5leHRMaW5lUGF0dGVybikgOiB1bmRlZmluZWQsXG5cdFx0XHR1bkluZGVudGVkTGluZVBhdHRlcm46IGluZGVudGF0aW9uUnVsZS51bkluZGVudGVkTGluZVBhdHRlcm4gPyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlUmVnRXhwKGluZGVudGF0aW9uUnVsZS51bkluZGVudGVkTGluZVBhdHRlcm4pIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlT25FbnRlclJ1bGUob25FbnRlclJ1bGU6IElPbkVudGVyUnVsZUR0byk6IE9uRW50ZXJSdWxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YmVmb3JlVGV4dDogTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChvbkVudGVyUnVsZS5iZWZvcmVUZXh0KSxcblx0XHRcdGFmdGVyVGV4dDogb25FbnRlclJ1bGUuYWZ0ZXJUZXh0ID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChvbkVudGVyUnVsZS5hZnRlclRleHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0cHJldmlvdXNMaW5lVGV4dDogb25FbnRlclJ1bGUucHJldmlvdXNMaW5lVGV4dCA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAob25FbnRlclJ1bGUucHJldmlvdXNMaW5lVGV4dCkgOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb246IG9uRW50ZXJSdWxlLmFjdGlvblxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlT25FbnRlclJ1bGVzKG9uRW50ZXJSdWxlczogSU9uRW50ZXJSdWxlRHRvW10pOiBPbkVudGVyUnVsZVtdIHtcblx0XHRyZXR1cm4gb25FbnRlclJ1bGVzLm1hcChNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlT25FbnRlclJ1bGUpO1xuXHR9XG5cblx0JHNldExhbmd1YWdlQ29uZmlndXJhdGlvbihoYW5kbGU6IG51bWJlciwgbGFuZ3VhZ2VJZDogc3RyaW5nLCBfY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbkR0byk6IHZvaWQge1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0Y29tbWVudHM6IF9jb25maWd1cmF0aW9uLmNvbW1lbnRzLFxuXHRcdFx0YnJhY2tldHM6IF9jb25maWd1cmF0aW9uLmJyYWNrZXRzLFxuXHRcdFx0d29yZFBhdHRlcm46IF9jb25maWd1cmF0aW9uLndvcmRQYXR0ZXJuID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChfY29uZmlndXJhdGlvbi53b3JkUGF0dGVybikgOiB1bmRlZmluZWQsXG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiBfY29uZmlndXJhdGlvbi5pbmRlbnRhdGlvblJ1bGVzID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUluZGVudGF0aW9uUnVsZShfY29uZmlndXJhdGlvbi5pbmRlbnRhdGlvblJ1bGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdG9uRW50ZXJSdWxlczogX2NvbmZpZ3VyYXRpb24ub25FbnRlclJ1bGVzID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZU9uRW50ZXJSdWxlcyhfY29uZmlndXJhdGlvbi5vbkVudGVyUnVsZXMpIDogdW5kZWZpbmVkLFxuXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiB1bmRlZmluZWQsXG5cdFx0XHRzdXJyb3VuZGluZ1BhaXJzOiB1bmRlZmluZWQsXG5cdFx0XHRfX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdGlmIChfY29uZmlndXJhdGlvbi5hdXRvQ2xvc2luZ1BhaXJzKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmF1dG9DbG9zaW5nUGFpcnMgPSBfY29uZmlndXJhdGlvbi5hdXRvQ2xvc2luZ1BhaXJzO1xuXHRcdH0gZWxzZSBpZiAoX2NvbmZpZ3VyYXRpb24uX19jaGFyYWN0ZXJQYWlyU3VwcG9ydCkge1xuXHRcdFx0Ly8gYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcblx0XHRcdGNvbmZpZ3VyYXRpb24uYXV0b0Nsb3NpbmdQYWlycyA9IF9jb25maWd1cmF0aW9uLl9fY2hhcmFjdGVyUGFpclN1cHBvcnQuYXV0b0Nsb3NpbmdQYWlycztcblx0XHR9XG5cblx0XHRpZiAoX2NvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQgJiYgX2NvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQuZG9jQ29tbWVudCkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5fX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydCA9IHtcblx0XHRcdFx0ZG9jQ29tbWVudDoge1xuXHRcdFx0XHRcdG9wZW46IF9jb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0LmRvY0NvbW1lbnQub3Blbixcblx0XHRcdFx0XHRjbG9zZTogX2NvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQuZG9jQ29tbWVudC5jbG9zZVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24sIDEwMCkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSB0eXBlIGhpZXJhcmNoeVxuXG5cdCRyZWdpc3RlclR5cGVIaWVyYXJjaHlQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0eXBlaC5UeXBlSGllcmFyY2h5UHJvdmlkZXJSZWdpc3RyeS5yZWdpc3RlcihzZWxlY3Rvciwge1xuXG5cdFx0XHRwcmVwYXJlVHlwZUhpZXJhcmNoeTogYXN5bmMgKGRvY3VtZW50LCBwb3NpdGlvbiwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJlcGFyZVR5cGVIaWVyYXJjaHkoaGFuZGxlLCBkb2N1bWVudC51cmksIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0XHRcdGlmICghaXRlbXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlVHlwZUhpZXJhcmNoeShoYW5kbGUsIGl0ZW0uX3Nlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyb290czogaXRlbXMubWFwKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVUeXBlSGllcmFyY2h5SXRlbUR0bylcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cblx0XHRcdHByb3ZpZGVTdXBlcnR5cGVzOiBhc3luYyAoaXRlbSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3VwZXJ0eXBlcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlVHlwZUhpZXJhcmNoeVN1cGVydHlwZXMoaGFuZGxlLCBpdGVtLl9zZXNzaW9uSWQsIGl0ZW0uX2l0ZW1JZCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIXN1cGVydHlwZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3VwZXJ0eXBlcztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3VwZXJ0eXBlcy5tYXAoTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVR5cGVIaWVyYXJjaHlJdGVtRHRvKTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlU3VidHlwZXM6IGFzeW5jIChpdGVtLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBzdWJ0eXBlcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlVHlwZUhpZXJhcmNoeVN1YnR5cGVzKGhhbmRsZSwgaXRlbS5fc2Vzc2lvbklkLCBpdGVtLl9pdGVtSWQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFzdWJ0eXBlcykge1xuXHRcdFx0XHRcdHJldHVybiBzdWJ0eXBlcztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3VidHlwZXMubWFwKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVUeXBlSGllcmFyY2h5SXRlbUR0byk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblxuXHQvLyAtLS0gZG9jdW1lbnQgZHJvcCBFZGl0c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBNYWluVGhyZWFkRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXI+KCk7XG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgbWV0YWRhdGE6IElEb2N1bWVudERyb3BFZGl0UHJvdmlkZXJNZXRhZGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE1haW5UaHJlYWREb2N1bWVudE9uRHJvcEVkaXRQcm92aWRlcihoYW5kbGUsIHRoaXMuX3Byb3h5LCBtZXRhZGF0YSwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlKTtcblx0XHR0aGlzLl9kb2N1bWVudE9uRHJvcEVkaXRQcm92aWRlcnMuc2V0KGhhbmRsZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlciksXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpKSxcblx0XHQpKTtcblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlRG9jdW1lbnRPbkRyb3BGaWxlRGF0YShoYW5kbGU6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIGRhdGFJZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgcHJvdmlkZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnJlc29sdmVEb2N1bWVudE9uRHJvcEZpbGVEYXRhKHJlcXVlc3RJZCwgZGF0YUlkKTtcblx0fVxufVxuXG5jbGFzcyBNYWluVGhyZWFkUGFzdGVFZGl0UHJvdmlkZXIgaW1wbGVtZW50cyBsYW5ndWFnZXMuRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkYXRhVHJhbnNmZXJzID0gbmV3IERhdGFUcmFuc2ZlckZpbGVDYWNoZSgpO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cHVibGljIHJlYWRvbmx5IHBhc3RlTWltZVR5cGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVkUGFzdGVFZGl0S2luZHM6IHJlYWRvbmx5IEhpZXJhcmNoaWNhbEtpbmRbXTtcblxuXHRyZWFkb25seSBwcmVwYXJlRG9jdW1lbnRQYXN0ZT86IGxhbmd1YWdlcy5Eb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyWydwcmVwYXJlRG9jdW1lbnRQYXN0ZSddO1xuXHRyZWFkb25seSBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzPzogbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJbJ3Byb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMnXTtcblx0cmVhZG9ubHkgcmVzb2x2ZURvY3VtZW50UGFzdGVFZGl0PzogbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJbJ3Jlc29sdmVEb2N1bWVudFBhc3RlRWRpdCddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlc1NoYXBlLFxuXHRcdG1ldGFkYXRhOiBJUGFzdGVFZGl0UHJvdmlkZXJNZXRhZGF0YUR0byxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5jb3B5TWltZVR5cGVzID0gbWV0YWRhdGEuY29weU1pbWVUeXBlcyA/PyBbXTtcblx0XHR0aGlzLnBhc3RlTWltZVR5cGVzID0gbWV0YWRhdGEucGFzdGVNaW1lVHlwZXMgPz8gW107XG5cdFx0dGhpcy5wcm92aWRlZFBhc3RlRWRpdEtpbmRzID0gbWV0YWRhdGEucHJvdmlkZWRQYXN0ZUVkaXRLaW5kcz8ubWFwKGtpbmQgPT4gbmV3IEhpZXJhcmNoaWNhbEtpbmQoa2luZCkpID8/IFtdO1xuXG5cdFx0aWYgKG1ldGFkYXRhLnN1cHBvcnRzQ29weSkge1xuXHRcdFx0dGhpcy5wcmVwYXJlRG9jdW1lbnRQYXN0ZSA9IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogcmVhZG9ubHkgSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YVRyYW5zZmVyRHRvID0gYXdhaXQgdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVyLmZyb21MaXN0KGRhdGFUcmFuc2Zlcik7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXdEYXRhVHJhbnNmZXIgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJlcGFyZURvY3VtZW50UGFzdGUoX2hhbmRsZSwgbW9kZWwudXJpLCBzZWxlY3Rpb25zLCBkYXRhVHJhbnNmZXJEdG8sIHRva2VuKTtcblx0XHRcdFx0aWYgKCFuZXdEYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGF0YVRyYW5zZmVyT3V0ID0gbmV3IFZTRGF0YVRyYW5zZmVyKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW3R5cGUsIGl0ZW1dIG9mIG5ld0RhdGFUcmFuc2Zlci5pdGVtcykge1xuXHRcdFx0XHRcdGRhdGFUcmFuc2Zlck91dC5yZXBsYWNlKHR5cGUsIGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0oaXRlbS5hc1N0cmluZywgaXRlbS5pZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkYXRhVHJhbnNmZXJPdXQ7XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChtZXRhZGF0YS5zdXBwb3J0c1Bhc3RlKSB7XG5cdFx0XHR0aGlzLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMgPSBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBkYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBjb250ZXh0OiBsYW5ndWFnZXMuRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5kYXRhVHJhbnNmZXJzLmFkZChkYXRhVHJhbnNmZXIpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGFUcmFuc2ZlckR0byA9IGF3YWl0IHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlci5mcm9tTGlzdChkYXRhVHJhbnNmZXIpO1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVQYXN0ZUVkaXRzKHRoaXMuX2hhbmRsZSwgcmVxdWVzdC5pZCwgbW9kZWwudXJpLCBzZWxlY3Rpb25zLCBkYXRhVHJhbnNmZXJEdG8sIHtcblx0XHRcdFx0XHRcdG9ubHk6IGNvbnRleHQub25seT8udmFsdWUsXG5cdFx0XHRcdFx0XHR0cmlnZ2VyS2luZDogY29udGV4dC50cmlnZ2VyS2luZCxcblx0XHRcdFx0XHR9LCB0b2tlbik7XG5cdFx0XHRcdFx0aWYgKCFlZGl0cykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0czogZWRpdHMubWFwKChlZGl0KTogbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVFZGl0ID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHQuLi5lZGl0LFxuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6IGVkaXQua2luZCA/IG5ldyBIaWVyYXJjaGljYWxLaW5kKGVkaXQua2luZC52YWx1ZSkgOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnJyksXG5cdFx0XHRcdFx0XHRcdFx0eWllbGRUbzogZWRpdC55aWVsZFRvPy5tYXAoeCA9PiAoeyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCh4KSB9KSksXG5cdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbEVkaXQ6IGVkaXQuYWRkaXRpb25hbEVkaXQgPyByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKGVkaXQuYWRkaXRpb25hbEVkaXQsIHRoaXMuX3VyaUlkZW50U2VydmljZSwgZGF0YUlkID0+IHRoaXMucmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3QuaWQsIGRhdGFJZCkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlUGFzdGVFZGl0cyh0aGlzLl9oYW5kbGUsIHJlcXVlc3QuaWQpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJlcXVlc3QuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEuc3VwcG9ydHNSZXNvbHZlKSB7XG5cdFx0XHR0aGlzLnJlc29sdmVEb2N1bWVudFBhc3RlRWRpdCA9IGFzeW5jIChlZGl0OiBsYW5ndWFnZXMuRG9jdW1lbnRQYXN0ZUVkaXQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlUGFzdGVFZGl0KHRoaXMuX2hhbmRsZSwgKDxJUGFzdGVFZGl0RHRvPmVkaXQpLl9jYWNoZUlkISwgdG9rZW4pO1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlc29sdmVkLmluc2VydFRleHQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0ZWRpdC5pbnNlcnRUZXh0ID0gcmVzb2x2ZWQuaW5zZXJ0VGV4dDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXNvbHZlZC5hZGRpdGlvbmFsRWRpdCkge1xuXHRcdFx0XHRcdGVkaXQuYWRkaXRpb25hbEVkaXQgPSByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKHJlc29sdmVkLmFkZGl0aW9uYWxFZGl0LCB0aGlzLl91cmlJZGVudFNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlZGl0O1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRyZXNvbHZlRmlsZURhdGEocmVxdWVzdElkOiBudW1iZXIsIGRhdGFJZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiB0aGlzLmRhdGFUcmFuc2ZlcnMucmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3RJZCwgZGF0YUlkKTtcblx0fVxufVxuXG5jbGFzcyBNYWluVGhyZWFkRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIgaW1wbGVtZW50cyBsYW5ndWFnZXMuRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRhdGFUcmFuc2ZlcnMgPSBuZXcgRGF0YVRyYW5zZmVyRmlsZUNhY2hlKCk7XG5cblx0cmVhZG9ubHkgZHJvcE1pbWVUeXBlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXG5cdHJlYWRvbmx5IHByb3ZpZGVkRHJvcEVkaXRLaW5kczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHJlc29sdmVEb2N1bWVudERyb3BFZGl0PzogbGFuZ3VhZ2VzLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlclsncmVzb2x2ZURvY3VtZW50RHJvcEVkaXQnXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRtZXRhZGF0YTogSURvY3VtZW50RHJvcEVkaXRQcm92aWRlck1ldGFkYXRhIHwgdW5kZWZpbmVkLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmRyb3BNaW1lVHlwZXMgPSBtZXRhZGF0YT8uZHJvcE1pbWVUeXBlcyA/PyBbJyovKiddO1xuXHRcdHRoaXMucHJvdmlkZWREcm9wRWRpdEtpbmRzID0gbWV0YWRhdGE/LnByb3ZpZGVkRHJvcEtpbmRzPy5tYXAoa2luZCA9PiBuZXcgSGllcmFyY2hpY2FsS2luZChraW5kKSk7XG5cblx0XHRpZiAobWV0YWRhdGE/LnN1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0dGhpcy5yZXNvbHZlRG9jdW1lbnREcm9wRWRpdCA9IGFzeW5jIChlZGl0LCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlUGFzdGVFZGl0KHRoaXMuX2hhbmRsZSwgKDxJRG9jdW1lbnREcm9wRWRpdER0bz5lZGl0KS5fY2FjaGVJZCEsIHRva2VuKTtcblx0XHRcdFx0aWYgKHJlc29sdmVkLmFkZGl0aW9uYWxFZGl0KSB7XG5cdFx0XHRcdFx0ZWRpdC5hZGRpdGlvbmFsRWRpdCA9IHJldml2ZVdvcmtzcGFjZUVkaXREdG8ocmVzb2x2ZWQuYWRkaXRpb25hbEVkaXQsIHRoaXMuX3VyaUlkZW50U2VydmljZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudERyb3BFZGl0cyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IElQb3NpdGlvbiwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnREcm9wRWRpdHNTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuZGF0YVRyYW5zZmVycy5hZGQoZGF0YVRyYW5zZmVyKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YVRyYW5zZmVyRHRvID0gYXdhaXQgdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVyLmZyb21MaXN0KGRhdGFUcmFuc2Zlcik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlRG9jdW1lbnRPbkRyb3BFZGl0cyh0aGlzLl9oYW5kbGUsIHJlcXVlc3QuaWQsIG1vZGVsLnVyaSwgcG9zaXRpb24sIGRhdGFUcmFuc2ZlckR0bywgdG9rZW4pO1xuXHRcdFx0aWYgKCFlZGl0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRzOiBlZGl0cy5tYXAoZWRpdCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmVkaXQsXG5cdFx0XHRcdFx0XHR5aWVsZFRvOiBlZGl0LnlpZWxkVG8/Lm1hcCh4ID0+ICh7IGtpbmQ6IG5ldyBIaWVyYXJjaGljYWxLaW5kKHgpIH0pKSxcblx0XHRcdFx0XHRcdGtpbmQ6IGVkaXQua2luZCA/IG5ldyBIaWVyYXJjaGljYWxLaW5kKGVkaXQua2luZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsRWRpdDogcmV2aXZlV29ya3NwYWNlRWRpdER0byhlZGl0LmFkZGl0aW9uYWxFZGl0LCB0aGlzLl91cmlJZGVudFNlcnZpY2UsIGRhdGFJZCA9PiB0aGlzLnJlc29sdmVEb2N1bWVudE9uRHJvcEZpbGVEYXRhKHJlcXVlc3QuaWQsIGRhdGFJZCkpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VEb2N1bWVudE9uRHJvcEVkaXRzKHRoaXMuX2hhbmRsZSwgcmVxdWVzdC5pZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXF1ZXN0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZURvY3VtZW50T25Ecm9wRmlsZURhdGEocmVxdWVzdElkOiBudW1iZXIsIGRhdGFJZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiB0aGlzLmRhdGFUcmFuc2ZlcnMucmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3RJZCwgZGF0YUlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlciBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Eb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlc1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xlZ2VuZDogbGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kLFxuXHRcdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIHJlbGVhc2VEb2N1bWVudFNlbWFudGljVG9rZW5zKHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAocmVzdWx0SWQpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyh0aGlzLl9oYW5kbGUsIHBhcnNlSW50KHJlc3VsdElkLCAxMCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRMZWdlbmQoKTogbGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kIHtcblx0XHRyZXR1cm4gdGhpcy5fbGVnZW5kO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMobW9kZWw6IElUZXh0TW9kZWwsIGxhc3RSZXN1bHRJZDogc3RyaW5nIHwgbnVsbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnMgfCBsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGw+IHtcblx0XHRjb25zdCBuTGFzdFJlc3VsdElkID0gbGFzdFJlc3VsdElkID8gcGFyc2VJbnQobGFzdFJlc3VsdElkLCAxMCkgOiAwO1xuXHRcdGNvbnN0IGVuY29kZWREdG8gPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnModGhpcy5faGFuZGxlLCBtb2RlbC51cmksIG5MYXN0UmVzdWx0SWQsIHRva2VuKTtcblx0XHRpZiAoIWVuY29kZWREdG8pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBkdG8gPSBkZWNvZGVTZW1hbnRpY1Rva2Vuc0R0byhlbmNvZGVkRHRvKTtcblx0XHRpZiAoZHRvLnR5cGUgPT09ICdmdWxsJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzdWx0SWQ6IFN0cmluZyhkdG8uaWQpLFxuXHRcdFx0XHRkYXRhOiBkdG8uZGF0YVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3VsdElkOiBTdHJpbmcoZHRvLmlkKSxcblx0XHRcdGVkaXRzOiBkdG8uZGVsdGFzXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sZWdlbmQ6IGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBnZXRMZWdlbmQoKTogbGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kIHtcblx0XHRyZXR1cm4gdGhpcy5fbGVnZW5kO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vucyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IEVkaXRvclJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5TZW1hbnRpY1Rva2VucyB8IG51bGw+IHtcblx0XHRjb25zdCBlbmNvZGVkRHRvID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnModGhpcy5faGFuZGxlLCBtb2RlbC51cmksIHJhbmdlLCB0b2tlbik7XG5cdFx0aWYgKCFlbmNvZGVkRHRvKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZHRvID0gZGVjb2RlU2VtYW50aWNUb2tlbnNEdG8oZW5jb2RlZER0byk7XG5cdFx0aWYgKGR0by50eXBlID09PSAnZnVsbCcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdElkOiBTdHJpbmcoZHRvLmlkKSxcblx0XHRcdFx0ZGF0YTogZHRvLmRhdGFcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZGApO1xuXHR9XG59XG5cbmNsYXNzIEV4dGVuc2lvbkJhY2tlZElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25zUHJvdmlkZXI8SWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnM+IHtcblx0cHVibGljIHJlYWRvbmx5IHNldE1vZGVsSWQ6ICgobW9kZWxJZDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxsYW5ndWFnZXMuSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50IHwgdm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zOiBFdmVudDxsYW5ndWFnZXMuSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50IHwgdm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsSW5mb0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxJbmZvOiBFdmVudDx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2V0UHJvdmlkZXJPcHRpb246ICgob3B0aW9uSWQ6IHN0cmluZywgdmFsdWVJZDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IF9vbkRpZFByb3ZpZGVyT3B0aW9uc0NoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUHJvdmlkZXJPcHRpb25zQ2hhbmdlOiBFdmVudDx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGFuZGxlOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGdyb3VwSWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXJJZDogbGFuZ3VhZ2VzLlByb3ZpZGVySWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHlpZWxkc1RvR3JvdXBJZHM6IHN0cmluZ1tdLFxuXHRcdHB1YmxpYyByZWFkb25seSBleGNsdWRlc0dyb3VwSWRzOiBzdHJpbmdbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGVib3VuY2VEZWxheU1zOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIG1vZGVsSW5mbzogbGFuZ3VhZ2VzLklJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N1cHBvcnRzSGFuZGxlRXZlbnRzOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N1cHBvcnRzU2V0TW9kZWxJZDogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c09uRGlkQ2hhbmdlOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm86IGJvb2xlYW4sXG5cdFx0cHVibGljIHByb3ZpZGVyT3B0aW9uczogcmVhZG9ubHkgbGFuZ3VhZ2VzLklJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJPcHRpb25bXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c1NldFByb3ZpZGVyT3B0aW9uOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N1cHBvcnRzT25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlc1NoYXBlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWlFZGl0VGVsZW1ldHJ5U2VydmljZTogSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zZXRNb2RlbElkID0gdGhpcy5fc3VwcG9ydHNTZXRNb2RlbElkID8gYXN5bmMgKG1vZGVsSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJGhhbmRsZUlubGluZUNvbXBsZXRpb25TZXRDdXJyZW50TW9kZWxJZCh0aGlzLmhhbmRsZSwgbW9kZWxJZCk7XG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuc2V0UHJvdmlkZXJPcHRpb24gPSB0aGlzLl9zdXBwb3J0c1NldFByb3ZpZGVyT3B0aW9uID8gYXN5bmMgKG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJGhhbmRsZUlubGluZUNvbXBsZXRpb25TZXRQcm92aWRlck9wdGlvbih0aGlzLmhhbmRsZSwgb3B0aW9uSWQsIHZhbHVlSWQpO1xuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLl9zdXBwb3J0c09uRGlkQ2hhbmdlID8gdGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VNb2RlbEluZm8gPSB0aGlzLl9zdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvID8gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbEluZm9FbWl0dGVyLmV2ZW50IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMub25EaWRQcm92aWRlck9wdGlvbnNDaGFuZ2UgPSB0aGlzLl9zdXBwb3J0c09uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zID8gdGhpcy5fb25EaWRQcm92aWRlck9wdGlvbnNDaGFuZ2VFbWl0dGVyLmV2ZW50IDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3Rlcih0aGlzLl9zZWxlY3RvciwgdGhpcykpO1xuXHR9XG5cblx0cHVibGljIF9zZXRNb2RlbEluZm8obmV3TW9kZWxJbmZvOiBsYW5ndWFnZXMuSUlubGluZUNvbXBsZXRpb25Nb2RlbEluZm8gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLm1vZGVsSW5mbyA9IG5ld01vZGVsSW5mbztcblx0XHRpZiAodGhpcy5fc3VwcG9ydHNPbkRpZENoYW5nZU1vZGVsSW5mbykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbEluZm9FbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgX3NldFByb3ZpZGVyT3B0aW9ucyhuZXdQcm92aWRlck9wdGlvbnM6IHJlYWRvbmx5IGxhbmd1YWdlcy5JSW5saW5lQ29tcGxldGlvblByb3ZpZGVyT3B0aW9uW10gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnByb3ZpZGVyT3B0aW9ucyA9IG5ld1Byb3ZpZGVyT3B0aW9ucztcblx0XHRpZiAodGhpcy5fc3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucykge1xuXHRcdFx0dGhpcy5fb25EaWRQcm92aWRlck9wdGlvbnNDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgX2VtaXREaWRDaGFuZ2UoY2hhbmdlSGludDogSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50RHRvIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzT25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRW1pdHRlci5maXJlKGNoYW5nZUhpbnQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVJbmxpbmVDb21wbGV0aW9ucyh0aGlzLmhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaGFuZGxlSXRlbURpZFNob3coY29tcGxldGlvbnM6IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCBpdGVtOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9uLCB1cGRhdGVkSW5zZXJ0VGV4dDogc3RyaW5nLCBlZGl0RGVsdGFJbmZvOiBFZGl0RGVsdGFJbmZvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGl0ZW0uc3VnZ2VzdGlvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGl0ZW0uc3VnZ2VzdGlvbklkID0gdGhpcy5fYWlFZGl0VGVsZW1ldHJ5U2VydmljZS5jcmVhdGVTdWdnZXN0aW9uSWQoe1xuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmZWF0dXJlOiAnaW5saW5lU3VnZ2VzdGlvbicsXG5cdFx0XHRcdHNvdXJjZTogdGhpcy5wcm92aWRlcklkLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBjb21wbGV0aW9ucy5sYW5ndWFnZUlkLFxuXHRcdFx0XHRlZGl0RGVsdGFJbmZvOiBlZGl0RGVsdGFJbmZvLFxuXHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IGl0ZW0uaXNJbmxpbmVFZGl0ID8gJ25leHRFZGl0U3VnZ2VzdGlvbicgOiAnaW5saW5lQ29tcGxldGlvbicsXG5cdFx0XHRcdHNvdXJjZVJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzSGFuZGxlRXZlbnRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kaGFuZGxlSW5saW5lQ29tcGxldGlvbkRpZFNob3codGhpcy5oYW5kbGUsIGNvbXBsZXRpb25zLnBpZCwgaXRlbS5pZHgsIHVwZGF0ZWRJbnNlcnRUZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaGFuZGxlUGFydGlhbEFjY2VwdChjb21wbGV0aW9uczogSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnMsIGl0ZW06IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb24sIGFjY2VwdGVkQ2hhcmFjdGVyczogbnVtYmVyLCBpbmZvOiBsYW5ndWFnZXMuUGFydGlhbEFjY2VwdEluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3VwcG9ydHNIYW5kbGVFdmVudHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVJbmxpbmVDb21wbGV0aW9uUGFydGlhbEFjY2VwdCh0aGlzLmhhbmRsZSwgY29tcGxldGlvbnMucGlkLCBpdGVtLmlkeCwgYWNjZXB0ZWRDaGFyYWN0ZXJzLCBpbmZvKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaGFuZGxlRW5kT2ZMaWZldGltZShjb21wbGV0aW9uczogSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnMsIGl0ZW06IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb24sIHJlYXNvbjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb248SWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbj4sIGxpZmV0aW1lU3VtbWFyeTogbGFuZ3VhZ2VzLkxpZmV0aW1lU3VtbWFyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZ1bmN0aW9uIG1hcFJlYXNvbjxUMSwgVDI+KHJlYXNvbjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb248VDE+LCBmOiAocmVhc29uOiBUMSkgPT4gVDIpOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbjxUMj4ge1xuXHRcdFx0aWYgKHJlYXNvbi5raW5kID09PSBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuSWdub3JlZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnJlYXNvbixcblx0XHRcdFx0XHRzdXBlcnNlZGVkQnk6IHJlYXNvbi5zdXBlcnNlZGVkQnkgPyBmKHJlYXNvbi5zdXBlcnNlZGVkQnkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlYXNvbjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3VwcG9ydHNIYW5kbGVFdmVudHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZldGltZSh0aGlzLmhhbmRsZSwgY29tcGxldGlvbnMucGlkLCBpdGVtLmlkeCwgbWFwUmVhc29uKHJlYXNvbiwgaSA9PiAoeyBwaWQ6IGkucGlkLCBpZHg6IGkuaWR4IH0pKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlYXNvbi5raW5kID09PSBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuQWNjZXB0ZWQpIHtcblx0XHRcdGlmIChpdGVtLnN1Z2dlc3Rpb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuaGFuZGxlQ29kZUFjY2VwdGVkKHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uSWQ6IGl0ZW0uc3VnZ2VzdGlvbklkLFxuXHRcdFx0XHRcdGZlYXR1cmU6ICdpbmxpbmVTdWdnZXN0aW9uJyxcblx0XHRcdFx0XHRzb3VyY2U6IHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiBjb21wbGV0aW9ucy5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdGVkaXREZWx0YUluZm86IEVkaXREZWx0YUluZm8udHJ5Q3JlYXRlKFxuXHRcdFx0XHRcdFx0bGlmZXRpbWVTdW1tYXJ5LmxpbmVDb3VudE1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0bGlmZXRpbWVTdW1tYXJ5LmxpbmVDb3VudE9yaWdpbmFsLFxuXHRcdFx0XHRcdFx0bGlmZXRpbWVTdW1tYXJ5LmNoYXJhY3RlckNvdW50TW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRsaWZldGltZVN1bW1hcnkuY2hhcmFjdGVyQ291bnRPcmlnaW5hbCxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG1vZGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IGl0ZW0uaXNJbmxpbmVFZGl0ID8gJ25leHRFZGl0U3VnZ2VzdGlvbicgOiAnaW5saW5lQ29tcGxldGlvbicsXG5cdFx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2FjY2VwdCcsXG5cdFx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLlJlamVjdGVkKSB7XG5cdFx0XHRpZiAoaXRlbS5zdWdnZXN0aW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmhhbmRsZUNvZGVSZWplY3RlZCh7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbklkOiBpdGVtLnN1Z2dlc3Rpb25JZCxcblx0XHRcdFx0XHRmZWF0dXJlOiAnaW5saW5lU3VnZ2VzdGlvbicsXG5cdFx0XHRcdFx0c291cmNlOiB0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogY29tcGxldGlvbnMubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRlZGl0RGVsdGFJbmZvOiBFZGl0RGVsdGFJbmZvLnRyeUNyZWF0ZShcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5saW5lQ291bnRNb2RpZmllZCxcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5saW5lQ291bnRPcmlnaW5hbCxcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5jaGFyYWN0ZXJDb3VudE1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0bGlmZXRpbWVTdW1tYXJ5LmNoYXJhY3RlckNvdW50T3JpZ2luYWwsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiBpdGVtLmlzSW5saW5lRWRpdCA/ICduZXh0RWRpdFN1Z2dlc3Rpb24nIDogJ2lubGluZUNvbXBsZXRpb24nLFxuXHRcdFx0XHRcdHJlamVjdGlvbk1ldGhvZDogJ3JlamVjdCcsXG5cdFx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5kT2ZMaWZlU3VtbWFyeTogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZUV2ZW50ID0ge1xuXHRcdFx0b3Bwb3J0dW5pdHlJZDogbGlmZXRpbWVTdW1tYXJ5LnJlcXVlc3RVdWlkLFxuXHRcdFx0Y29ycmVsYXRpb25JZDogbGlmZXRpbWVTdW1tYXJ5LmNvcnJlbGF0aW9uSWQsXG5cdFx0XHRzaG93bjogbGlmZXRpbWVTdW1tYXJ5LnNob3duLFxuXHRcdFx0c2hvd25EdXJhdGlvbjogbGlmZXRpbWVTdW1tYXJ5LnNob3duRHVyYXRpb24sXG5cdFx0XHRzaG93bkR1cmF0aW9uVW5jb2xsYXBzZWQ6IGxpZmV0aW1lU3VtbWFyeS5zaG93bkR1cmF0aW9uVW5jb2xsYXBzZWQsXG5cdFx0XHR0aW1lVW50aWxTaG93bjogbGlmZXRpbWVTdW1tYXJ5LnRpbWVVbnRpbFNob3duLFxuXHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXF1ZXN0OiBsaWZldGltZVN1bW1hcnkudGltZVVudGlsUHJvdmlkZXJSZXF1ZXN0LFxuXHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXNwb25zZTogbGlmZXRpbWVTdW1tYXJ5LnRpbWVVbnRpbFByb3ZpZGVyUmVzcG9uc2UsXG5cdFx0XHRlZGl0b3JUeXBlOiBsaWZldGltZVN1bW1hcnkuZWRpdG9yVHlwZSxcblx0XHRcdHZpZXdLaW5kOiBsaWZldGltZVN1bW1hcnkudmlld0tpbmQsXG5cdFx0XHRwcmVjZWVkZWQ6IGxpZmV0aW1lU3VtbWFyeS5wcmVjZWVkZWQsXG5cdFx0XHRyZXF1ZXN0UmVhc29uOiBsaWZldGltZVN1bW1hcnkucmVxdWVzdFJlYXNvbixcblx0XHRcdHR5cGluZ0ludGVydmFsOiBsaWZldGltZVN1bW1hcnkudHlwaW5nSW50ZXJ2YWwsXG5cdFx0XHR0eXBpbmdJbnRlcnZhbENoYXJhY3RlckNvdW50OiBsaWZldGltZVN1bW1hcnkudHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudCxcblx0XHRcdGxhbmd1YWdlSWQ6IGxpZmV0aW1lU3VtbWFyeS5sYW5ndWFnZUlkLFxuXHRcdFx0Y3Vyc29yQ29sdW1uRGlzdGFuY2U6IGxpZmV0aW1lU3VtbWFyeS5jdXJzb3JDb2x1bW5EaXN0YW5jZSxcblx0XHRcdGN1cnNvckxpbmVEaXN0YW5jZTogbGlmZXRpbWVTdW1tYXJ5LmN1cnNvckxpbmVEaXN0YW5jZSxcblx0XHRcdGxpbmVDb3VudE9yaWdpbmFsOiBsaWZldGltZVN1bW1hcnkubGluZUNvdW50T3JpZ2luYWwsXG5cdFx0XHRsaW5lQ291bnRNb2RpZmllZDogbGlmZXRpbWVTdW1tYXJ5LmxpbmVDb3VudE1vZGlmaWVkLFxuXHRcdFx0Y2hhcmFjdGVyQ291bnRPcmlnaW5hbDogbGlmZXRpbWVTdW1tYXJ5LmNoYXJhY3RlckNvdW50T3JpZ2luYWwsXG5cdFx0XHRjaGFyYWN0ZXJDb3VudE1vZGlmaWVkOiBsaWZldGltZVN1bW1hcnkuY2hhcmFjdGVyQ291bnRNb2RpZmllZCxcblx0XHRcdGRpc2pvaW50UmVwbGFjZW1lbnRzOiBsaWZldGltZVN1bW1hcnkuZGlzam9pbnRSZXBsYWNlbWVudHMsXG5cdFx0XHRzYW1lU2hhcGVSZXBsYWNlbWVudHM6IGxpZmV0aW1lU3VtbWFyeS5zYW1lU2hhcGVSZXBsYWNlbWVudHMsXG5cdFx0XHRzZWxlY3RlZFN1Z2dlc3Rpb25JbmZvOiBsaWZldGltZVN1bW1hcnkuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbyxcblx0XHRcdGV4dGVuc2lvbklkOiB0aGlzLnByb3ZpZGVySWQuZXh0ZW5zaW9uSWQhLFxuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdGhpcy5wcm92aWRlcklkLmV4dGVuc2lvblZlcnNpb24hLFxuXHRcdFx0Z3JvdXBJZDogZXh0cmFjdEVuZ2luZUZyb21Db3JyZWxhdGlvbklkKGxpZmV0aW1lU3VtbWFyeS5jb3JyZWxhdGlvbklkKSA/PyB0aGlzLmdyb3VwSWQsXG5cdFx0XHRza3VQbGFuOiBsaWZldGltZVN1bW1hcnkuc2t1UGxhbixcblx0XHRcdHNrdVR5cGU6IGxpZmV0aW1lU3VtbWFyeS5za3VUeXBlLFxuXHRcdFx0cGVyZm9ybWFuY2VNYXJrZXJzOiBsaWZldGltZVN1bW1hcnkucGVyZm9ybWFuY2VNYXJrZXJzLFxuXHRcdFx0YXZhaWxhYmxlUHJvdmlkZXJzOiBsaWZldGltZVN1bW1hcnkuYXZhaWxhYmxlUHJvdmlkZXJzLFxuXHRcdFx0cGFydGlhbGx5QWNjZXB0ZWQ6IGxpZmV0aW1lU3VtbWFyeS5wYXJ0aWFsbHlBY2NlcHRlZCxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkQ291bnRTaW5jZU9yaWdpbmFsOiBsaWZldGltZVN1bW1hcnkucGFydGlhbGx5QWNjZXB0ZWRDb3VudFNpbmNlT3JpZ2luYWwsXG5cdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZFJhdGlvU2luY2VPcmlnaW5hbDogbGlmZXRpbWVTdW1tYXJ5LnBhcnRpYWxseUFjY2VwdGVkUmF0aW9TaW5jZU9yaWdpbmFsLFxuXHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRDaGFyYWN0ZXJzU2luY2VPcmlnaW5hbDogbGlmZXRpbWVTdW1tYXJ5LnBhcnRpYWxseUFjY2VwdGVkQ2hhcmFjdGVyc1NpbmNlT3JpZ2luYWwsXG5cdFx0XHRzdXBlcnNlZGVkOiByZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuSWdub3JlZCAmJiAhIXJlYXNvbi5zdXBlcnNlZGVkQnksXG5cdFx0XHRyZWFzb246IHJlYXNvbi5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5BY2NlcHRlZCA/ICdhY2NlcHRlZCdcblx0XHRcdFx0OiByZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuUmVqZWN0ZWQgPyAncmVqZWN0ZWQnXG5cdFx0XHRcdFx0OiByZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuSWdub3JlZCA/ICdpZ25vcmVkJyA6IHVuZGVmaW5lZCxcblx0XHRcdGFjY2VwdGVkQWx0ZXJuYXRpdmVBY3Rpb246IHJlYXNvbi5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5BY2NlcHRlZCAmJiByZWFzb24uYWx0ZXJuYXRpdmVBY3Rpb24sXG5cdFx0XHRub1N1Z2dlc3Rpb25SZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdG5vdFNob3duUmVhc29uOiBsaWZldGltZVN1bW1hcnkubm90U2hvd25SZWFzb24sXG5cdFx0XHRyZW5hbWVDcmVhdGVkOiBsaWZldGltZVN1bW1hcnkucmVuYW1lQ3JlYXRlZCxcblx0XHRcdHJlbmFtZUR1cmF0aW9uOiBsaWZldGltZVN1bW1hcnkucmVuYW1lRHVyYXRpb24sXG5cdFx0XHRyZW5hbWVUaW1lZE91dDogbGlmZXRpbWVTdW1tYXJ5LnJlbmFtZVRpbWVkT3V0LFxuXHRcdFx0cmVuYW1lRHJvcHBlZE90aGVyRWRpdHM6IGxpZmV0aW1lU3VtbWFyeS5yZW5hbWVEcm9wcGVkT3RoZXJFZGl0cyxcblx0XHRcdHJlbmFtZURyb3BwZWRSZW5hbWVFZGl0czogbGlmZXRpbWVTdW1tYXJ5LnJlbmFtZURyb3BwZWRSZW5hbWVFZGl0cyxcblx0XHRcdGVkaXRLaW5kOiBsaWZldGltZVN1bW1hcnkuZWRpdEtpbmQsXG5cdFx0XHRsb25nRGlzdGFuY2VIaW50VmlzaWJsZTogbGlmZXRpbWVTdW1tYXJ5LmxvbmdEaXN0YW5jZUhpbnRWaXNpYmxlLFxuXHRcdFx0bG9uZ0Rpc3RhbmNlSGludERpc3RhbmNlOiBsaWZldGltZVN1bW1hcnkubG9uZ0Rpc3RhbmNlSGludERpc3RhbmNlLFxuXHRcdFx0aXNGb3JBbm90aGVyRG9jdW1lbnQ6IGxpZmV0aW1lU3VtbWFyeS5pc0ZvckFub3RoZXJEb2N1bWVudCxcblx0XHRcdC4uLmZvcndhcmRUb0NoYW5uZWxJZihpc0NvcGlsb3RMaWtlRXh0ZW5zaW9uKHRoaXMucHJvdmlkZXJJZC5leHRlbnNpb25JZCEpKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGF0YUNoYW5uZWxGb3J3YXJkaW5nVGVsZW1ldHJ5U2VydmljZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHNlbmRJbmxpbmVDb21wbGV0aW9uc0VuZE9mTGlmZVRlbGVtZXRyeShkYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlLCBlbmRPZkxpZmVTdW1tYXJ5KTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlSW5saW5lQ29tcGxldGlvbnMoY29tcGxldGlvbnM6IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kZnJlZUlubGluZUNvbXBsZXRpb25zTGlzdCh0aGlzLmhhbmRsZSwgY29tcGxldGlvbnMucGlkLCByZWFzb24pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZVJlamVjdGlvbihjb21wbGV0aW9uczogSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnMsIGl0ZW06IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3VwcG9ydHNIYW5kbGVFdmVudHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVJbmxpbmVDb21wbGV0aW9uUmVqZWN0aW9uKHRoaXMuaGFuZGxlLCBjb21wbGV0aW9ucy5waWQsIGl0ZW0uaWR4KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gYElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIoJHt0aGlzLnByb3ZpZGVySWQudG9TdHJpbmcoKX0pYDtcblx0fVxufVxuXG5mdW5jdGlvbiBleHRyYWN0RW5naW5lRnJvbUNvcnJlbGF0aW9uSWQoY29ycmVsYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjb3JyZWxhdGlvbklkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoY29ycmVsYXRpb25JZCk7XG5cdFx0aWYgKHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnICYmIHBhcnNlZCAhPT0gbnVsbCAmJiB0eXBlb2YgcGFyc2VkLmVuZ2luZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBwYXJzZWQuZW5naW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsOEJBQXVELHNCQUFzQjtBQUN0RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CLFlBQVksZUFBZSxvQkFBb0I7QUFDNUUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFJcEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsZ0JBQW1uQixzQkFBc0Isd0JBQW9FLG1CQUFvRDtBQUMxd0IsU0FBUywyQ0FBMkM7QUFDcEQsU0FB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Z0JBQWdCO0FBQUEsTUFDbkMscUNBQXFDLGdCQUFnQjtBQUFBLE1BQ3JELHFDQUFxQyxnQkFBZ0I7QUFBQSxNQUNyRCwwQ0FBMEMsZ0JBQWdCO0FBQUEsTUFDMUQsWUFBWSxPQUFPLFNBQVMsb0NBQW9DLFdBQVcsQ0FBQyxDQUFDLE9BQU87QUFBQSxNQUNwRixRQUFRLE9BQU8sU0FBUyxvQ0FBb0MsV0FBVyxhQUNwRSxPQUFPLFNBQVMsb0NBQW9DLFdBQVcsYUFDOUQsT0FBTyxTQUFTLG9DQUFvQyxVQUFVLFlBQVk7QUFBQSxNQUM5RSwyQkFBMkIsT0FBTyxTQUFTLG9DQUFvQyxZQUFZLE9BQU87QUFBQSxNQUNsRyxvQkFBb0I7QUFBQSxNQUNwQixnQkFBZ0IsZ0JBQWdCO0FBQUEsTUFDaEMsZUFBZSxnQkFBZ0I7QUFBQSxNQUMvQixnQkFBZ0IsZ0JBQWdCO0FBQUEsTUFDaEMsZ0JBQWdCLGdCQUFnQjtBQUFBLE1BQ2hDLHlCQUF5QixnQkFBZ0I7QUFBQSxNQUN6QywwQkFBMEIsZ0JBQWdCO0FBQUEsTUFDMUMsVUFBVSxnQkFBZ0I7QUFBQSxNQUMxQix5QkFBeUIsZ0JBQWdCO0FBQUEsTUFDekMsMEJBQTBCLGdCQUFnQjtBQUFBLE1BQzFDLHNCQUFzQixnQkFBZ0I7QUFBQSxNQUN0QyxHQUFHLG1CQUFtQix1QkFBdUIsS0FBSyxXQUFXLFdBQVksQ0FBQztBQUFBLElBQzNFO0FBRUEsVUFBTSx3Q0FBd0MsS0FBSyxzQkFBc0IsZUFBZSxxQ0FBcUM7QUFDN0gsNENBQXdDLHVDQUF1QyxnQkFBZ0I7QUFBQSxFQUNoRztBQUFBLEVBRU8seUJBQXlCLGFBQTRDLFFBQXdEO0FBQ25JLFNBQUssT0FBTywyQkFBMkIsS0FBSyxRQUFRLFlBQVksS0FBSyxNQUFNO0FBQUEsRUFDNUU7QUFBQSxFQUVBLE1BQWEsZ0JBQWdCLGFBQTRDLE1BQW1EO0FBQzNILFFBQUksS0FBSyx1QkFBdUI7QUFDL0IsWUFBTSxLQUFLLE9BQU8saUNBQWlDLEtBQUssUUFBUSxZQUFZLEtBQUssS0FBSyxHQUFHO0FBQUEsSUFDMUY7QUFBQSxFQUNEO0FBQUEsRUFFUyxXQUFXO0FBQ25CLFdBQU8sNkJBQTZCLEtBQUssV0FBVyxTQUFTLENBQUM7QUFBQSxFQUMvRDtBQUNEO0FBek9NLDJDQUFOO0FBQUEsRUE4Qkc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaENHO0FBMk9OLFNBQVMsK0JBQStCLGVBQXVEO0FBQzlGLE1BQUksQ0FBQyxlQUFlO0FBQ25CLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSTtBQUNILFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYTtBQUN2QyxRQUFJLE9BQU8sV0FBVyxZQUFZLFdBQVcsUUFBUSxPQUFPLE9BQU8sV0FBVyxVQUFVO0FBQ3ZGLGFBQU8sT0FBTztBQUFBLElBQ2Y7QUFDQSxXQUFPO0FBQUEsRUFDUixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsibW9kZWwiLCAic2VhcmNoIiwgInJlYXNvbiJdCn0K
