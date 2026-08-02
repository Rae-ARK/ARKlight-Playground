var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _callOnDispose, _items, _DataTransfer_instances, normalizeMime_fn;
import { asArray } from "../../../base/common/arrays.js";
import { encodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { illegalArgument } from "../../../base/common/errors.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Mimes } from "../../../base/common/mime.js";
import { nextCharLength } from "../../../base/common/strings.js";
import { isNumber, isObject, isString, isStringArray } from "../../../base/common/types.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { TextEditorSelectionSource } from "../../../platform/editor/common/editor.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { FileSystemProviderErrorCode, markAsFileSystemProviderError } from "../../../platform/files/common/files.js";
import { RemoteAuthorityResolverErrorCode } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { es5ClassCompat } from "./extHostTypes/es5ClassCompat.js";
import { MarkdownString } from "./extHostTypes/markdownString.js";
import { Range } from "./extHostTypes/range.js";
import { CodeActionKind as CodeActionKind2 } from "./extHostTypes/codeActionKind.js";
import {
  Diagnostic as Diagnostic2,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag
} from "./extHostTypes/diagnostic.js";
import { Location as Location2 } from "./extHostTypes/location.js";
import { MarkdownString as MarkdownString2 } from "./extHostTypes/markdownString.js";
import { NotebookCellData, NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookData, NotebookEdit, NotebookRange } from "./extHostTypes/notebooks.js";
import { Position as Position2 } from "./extHostTypes/position.js";
import { Range as Range2 } from "./extHostTypes/range.js";
import { Selection } from "./extHostTypes/selection.js";
import { SnippetString as SnippetString2 } from "./extHostTypes/snippetString.js";
import { SnippetTextEdit } from "./extHostTypes/snippetTextEdit.js";
import { SymbolInformation, SymbolKind as SymbolKind2, SymbolTag as SymbolTag2 } from "./extHostTypes/symbolInformation.js";
import { EndOfLine, TextEdit as TextEdit2 } from "./extHostTypes/textEdit.js";
import { FileEditType, WorkspaceEdit as WorkspaceEdit2 } from "./extHostTypes/workspaceEdit.js";
var TerminalOutputAnchor = /* @__PURE__ */ ((TerminalOutputAnchor2) => {
  TerminalOutputAnchor2[TerminalOutputAnchor2["Top"] = 0] = "Top";
  TerminalOutputAnchor2[TerminalOutputAnchor2["Bottom"] = 1] = "Bottom";
  return TerminalOutputAnchor2;
})(TerminalOutputAnchor || {});
var TerminalQuickFixType = /* @__PURE__ */ ((TerminalQuickFixType2) => {
  TerminalQuickFixType2[TerminalQuickFixType2["TerminalCommand"] = 0] = "TerminalCommand";
  TerminalQuickFixType2[TerminalQuickFixType2["Opener"] = 1] = "Opener";
  TerminalQuickFixType2[TerminalQuickFixType2["Command"] = 3] = "Command";
  return TerminalQuickFixType2;
})(TerminalQuickFixType || {});
let Disposable = class {
  constructor(callOnDispose) {
    __privateAdd(this, _callOnDispose);
    __privateSet(this, _callOnDispose, callOnDispose);
  }
  static from(...inDisposables) {
    let disposables = inDisposables;
    return new Disposable(function() {
      if (disposables) {
        for (const disposable of disposables) {
          if (disposable && typeof disposable.dispose === "function") {
            disposable.dispose();
          }
        }
        disposables = void 0;
      }
    });
  }
  dispose() {
    if (typeof __privateGet(this, _callOnDispose) === "function") {
      __privateGet(this, _callOnDispose).call(this);
      __privateSet(this, _callOnDispose, void 0);
    }
  }
};
_callOnDispose = new WeakMap();
Disposable = __decorateClass([
  es5ClassCompat
], Disposable);
const validateConnectionToken = (connectionToken) => {
  if (typeof connectionToken !== "string" || connectionToken.length === 0 || !/^[0-9A-Za-z_\-]+$/.test(connectionToken)) {
    throw illegalArgument("connectionToken");
  }
};
class ResolvedAuthority {
  static isResolvedAuthority(resolvedAuthority) {
    return resolvedAuthority && typeof resolvedAuthority === "object" && typeof resolvedAuthority.host === "string" && typeof resolvedAuthority.port === "number" && (resolvedAuthority.connectionToken === void 0 || typeof resolvedAuthority.connectionToken === "string");
  }
  constructor(host, port, connectionToken) {
    if (typeof host !== "string" || host.length === 0) {
      throw illegalArgument("host");
    }
    if (typeof port !== "number" || port === 0 || Math.round(port) !== port) {
      throw illegalArgument("port");
    }
    if (typeof connectionToken !== "undefined") {
      validateConnectionToken(connectionToken);
    }
    this.host = host;
    this.port = Math.round(port);
    this.connectionToken = connectionToken;
  }
}
class ManagedResolvedAuthority {
  constructor(makeConnection, connectionToken) {
    this.makeConnection = makeConnection;
    this.connectionToken = connectionToken;
    if (typeof connectionToken !== "undefined") {
      validateConnectionToken(connectionToken);
    }
  }
  static isManagedResolvedAuthority(resolvedAuthority) {
    return resolvedAuthority && typeof resolvedAuthority === "object" && typeof resolvedAuthority.makeConnection === "function" && (resolvedAuthority.connectionToken === void 0 || typeof resolvedAuthority.connectionToken === "string");
  }
}
class RemoteAuthorityResolverError extends Error {
  static NotAvailable(message, handled) {
    return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.NotAvailable, handled);
  }
  static TemporarilyNotAvailable(message) {
    return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable);
  }
  constructor(message, code = RemoteAuthorityResolverErrorCode.Unknown, detail) {
    super(message);
    this._message = message;
    this._code = code;
    this._detail = detail;
    Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
  }
}
var EnvironmentVariableMutatorType = /* @__PURE__ */ ((EnvironmentVariableMutatorType2) => {
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Replace"] = 1] = "Replace";
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Append"] = 2] = "Append";
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Prepend"] = 3] = "Prepend";
  return EnvironmentVariableMutatorType2;
})(EnvironmentVariableMutatorType || {});
let Hover = class {
  constructor(contents, range) {
    if (!contents) {
      throw new Error("Illegal argument, contents must be defined");
    }
    if (Array.isArray(contents)) {
      this.contents = contents;
    } else {
      this.contents = [contents];
    }
    this.range = range;
  }
};
Hover = __decorateClass([
  es5ClassCompat
], Hover);
let VerboseHover = class extends Hover {
  constructor(contents, range, canIncreaseVerbosity, canDecreaseVerbosity) {
    super(contents, range);
    this.canIncreaseVerbosity = canIncreaseVerbosity;
    this.canDecreaseVerbosity = canDecreaseVerbosity;
  }
};
VerboseHover = __decorateClass([
  es5ClassCompat
], VerboseHover);
var HoverVerbosityAction = /* @__PURE__ */ ((HoverVerbosityAction2) => {
  HoverVerbosityAction2[HoverVerbosityAction2["Increase"] = 0] = "Increase";
  HoverVerbosityAction2[HoverVerbosityAction2["Decrease"] = 1] = "Decrease";
  return HoverVerbosityAction2;
})(HoverVerbosityAction || {});
var DocumentHighlightKind = /* @__PURE__ */ ((DocumentHighlightKind2) => {
  DocumentHighlightKind2[DocumentHighlightKind2["Text"] = 0] = "Text";
  DocumentHighlightKind2[DocumentHighlightKind2["Read"] = 1] = "Read";
  DocumentHighlightKind2[DocumentHighlightKind2["Write"] = 2] = "Write";
  return DocumentHighlightKind2;
})(DocumentHighlightKind || {});
let DocumentHighlight = class {
  constructor(range, kind = 0 /* Text */) {
    this.range = range;
    this.kind = kind;
  }
  toJSON() {
    return {
      range: this.range,
      kind: DocumentHighlightKind[this.kind]
    };
  }
};
DocumentHighlight = __decorateClass([
  es5ClassCompat
], DocumentHighlight);
let MultiDocumentHighlight = class {
  constructor(uri, highlights) {
    this.uri = uri;
    this.highlights = highlights;
  }
  toJSON() {
    return {
      uri: this.uri,
      highlights: this.highlights.map((h) => h.toJSON())
    };
  }
};
MultiDocumentHighlight = __decorateClass([
  es5ClassCompat
], MultiDocumentHighlight);
let DocumentSymbol = class {
  static validate(candidate) {
    if (!candidate.name) {
      throw new Error("name must not be falsy");
    }
    if (!candidate.range.contains(candidate.selectionRange)) {
      throw new Error("selectionRange must be contained in fullRange");
    }
    candidate.children?.forEach(DocumentSymbol.validate);
  }
  constructor(name, detail, kind, range, selectionRange) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
    this.children = [];
    DocumentSymbol.validate(this);
  }
};
DocumentSymbol = __decorateClass([
  es5ClassCompat
], DocumentSymbol);
var CodeActionTriggerKind = /* @__PURE__ */ ((CodeActionTriggerKind2) => {
  CodeActionTriggerKind2[CodeActionTriggerKind2["Invoke"] = 1] = "Invoke";
  CodeActionTriggerKind2[CodeActionTriggerKind2["Automatic"] = 2] = "Automatic";
  return CodeActionTriggerKind2;
})(CodeActionTriggerKind || {});
let CodeAction = class {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
};
CodeAction = __decorateClass([
  es5ClassCompat
], CodeAction);
let SelectionRange = class {
  constructor(range, parent) {
    this.range = range;
    this.parent = parent;
    if (parent && !parent.range.contains(this.range)) {
      throw new Error("Invalid argument: parent must contain this range");
    }
  }
};
SelectionRange = __decorateClass([
  es5ClassCompat
], SelectionRange);
class CallHierarchyItem {
  constructor(kind, name, detail, uri, range, selectionRange) {
    this.kind = kind;
    this.name = name;
    this.detail = detail;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
  }
}
class CallHierarchyIncomingCall {
  constructor(item, fromRanges) {
    this.fromRanges = fromRanges;
    this.from = item;
  }
}
class CallHierarchyOutgoingCall {
  constructor(item, fromRanges) {
    this.fromRanges = fromRanges;
    this.to = item;
  }
}
var LanguageStatusSeverity = /* @__PURE__ */ ((LanguageStatusSeverity2) => {
  LanguageStatusSeverity2[LanguageStatusSeverity2["Information"] = 0] = "Information";
  LanguageStatusSeverity2[LanguageStatusSeverity2["Warning"] = 1] = "Warning";
  LanguageStatusSeverity2[LanguageStatusSeverity2["Error"] = 2] = "Error";
  return LanguageStatusSeverity2;
})(LanguageStatusSeverity || {});
let CodeLens = class {
  constructor(range, command) {
    this.range = range;
    this.command = command;
  }
  get isResolved() {
    return !!this.command;
  }
};
CodeLens = __decorateClass([
  es5ClassCompat
], CodeLens);
let ParameterInformation = class {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
  }
};
ParameterInformation = __decorateClass([
  es5ClassCompat
], ParameterInformation);
let SignatureInformation = class {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
    this.parameters = [];
  }
};
SignatureInformation = __decorateClass([
  es5ClassCompat
], SignatureInformation);
let SignatureHelp = class {
  constructor() {
    this.activeSignature = 0;
    this.activeParameter = 0;
    this.signatures = [];
  }
};
SignatureHelp = __decorateClass([
  es5ClassCompat
], SignatureHelp);
var SignatureHelpTriggerKind = /* @__PURE__ */ ((SignatureHelpTriggerKind2) => {
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["Invoke"] = 1] = "Invoke";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["TriggerCharacter"] = 2] = "TriggerCharacter";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["ContentChange"] = 3] = "ContentChange";
  return SignatureHelpTriggerKind2;
})(SignatureHelpTriggerKind || {});
var InlayHintKind = /* @__PURE__ */ ((InlayHintKind2) => {
  InlayHintKind2[InlayHintKind2["Type"] = 1] = "Type";
  InlayHintKind2[InlayHintKind2["Parameter"] = 2] = "Parameter";
  return InlayHintKind2;
})(InlayHintKind || {});
let InlayHintLabelPart = class {
  constructor(value) {
    this.value = value;
  }
};
InlayHintLabelPart = __decorateClass([
  es5ClassCompat
], InlayHintLabelPart);
let InlayHint = class {
  constructor(position, label, kind) {
    this.position = position;
    this.label = label;
    this.kind = kind;
  }
};
InlayHint = __decorateClass([
  es5ClassCompat
], InlayHint);
var CompletionTriggerKind = /* @__PURE__ */ ((CompletionTriggerKind2) => {
  CompletionTriggerKind2[CompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerCharacter"] = 1] = "TriggerCharacter";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
  return CompletionTriggerKind2;
})(CompletionTriggerKind || {});
var CompletionItemKind = /* @__PURE__ */ ((CompletionItemKind2) => {
  CompletionItemKind2[CompletionItemKind2["Text"] = 0] = "Text";
  CompletionItemKind2[CompletionItemKind2["Method"] = 1] = "Method";
  CompletionItemKind2[CompletionItemKind2["Function"] = 2] = "Function";
  CompletionItemKind2[CompletionItemKind2["Constructor"] = 3] = "Constructor";
  CompletionItemKind2[CompletionItemKind2["Field"] = 4] = "Field";
  CompletionItemKind2[CompletionItemKind2["Variable"] = 5] = "Variable";
  CompletionItemKind2[CompletionItemKind2["Class"] = 6] = "Class";
  CompletionItemKind2[CompletionItemKind2["Interface"] = 7] = "Interface";
  CompletionItemKind2[CompletionItemKind2["Module"] = 8] = "Module";
  CompletionItemKind2[CompletionItemKind2["Property"] = 9] = "Property";
  CompletionItemKind2[CompletionItemKind2["Unit"] = 10] = "Unit";
  CompletionItemKind2[CompletionItemKind2["Value"] = 11] = "Value";
  CompletionItemKind2[CompletionItemKind2["Enum"] = 12] = "Enum";
  CompletionItemKind2[CompletionItemKind2["Keyword"] = 13] = "Keyword";
  CompletionItemKind2[CompletionItemKind2["Snippet"] = 14] = "Snippet";
  CompletionItemKind2[CompletionItemKind2["Color"] = 15] = "Color";
  CompletionItemKind2[CompletionItemKind2["File"] = 16] = "File";
  CompletionItemKind2[CompletionItemKind2["Reference"] = 17] = "Reference";
  CompletionItemKind2[CompletionItemKind2["Folder"] = 18] = "Folder";
  CompletionItemKind2[CompletionItemKind2["EnumMember"] = 19] = "EnumMember";
  CompletionItemKind2[CompletionItemKind2["Constant"] = 20] = "Constant";
  CompletionItemKind2[CompletionItemKind2["Struct"] = 21] = "Struct";
  CompletionItemKind2[CompletionItemKind2["Event"] = 22] = "Event";
  CompletionItemKind2[CompletionItemKind2["Operator"] = 23] = "Operator";
  CompletionItemKind2[CompletionItemKind2["TypeParameter"] = 24] = "TypeParameter";
  CompletionItemKind2[CompletionItemKind2["User"] = 25] = "User";
  CompletionItemKind2[CompletionItemKind2["Issue"] = 26] = "Issue";
  return CompletionItemKind2;
})(CompletionItemKind || {});
var CompletionItemTag = /* @__PURE__ */ ((CompletionItemTag2) => {
  CompletionItemTag2[CompletionItemTag2["Deprecated"] = 1] = "Deprecated";
  return CompletionItemTag2;
})(CompletionItemTag || {});
let CompletionItem = class {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
  toJSON() {
    return {
      label: this.label,
      kind: this.kind && CompletionItemKind[this.kind],
      detail: this.detail,
      documentation: this.documentation,
      sortText: this.sortText,
      filterText: this.filterText,
      preselect: this.preselect,
      insertText: this.insertText,
      textEdit: this.textEdit
    };
  }
};
CompletionItem = __decorateClass([
  es5ClassCompat
], CompletionItem);
let CompletionList = class {
  constructor(items = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
};
CompletionList = __decorateClass([
  es5ClassCompat
], CompletionList);
let InlineSuggestion = class {
  constructor(insertText, range, command) {
    this.insertText = insertText;
    this.range = range;
    this.command = command;
  }
};
InlineSuggestion = __decorateClass([
  es5ClassCompat
], InlineSuggestion);
let InlineSuggestionList = class {
  constructor(items) {
    this.commands = void 0;
    this.suppressSuggestions = void 0;
    this.items = items;
  }
};
InlineSuggestionList = __decorateClass([
  es5ClassCompat
], InlineSuggestionList);
var PartialAcceptTriggerKind = /* @__PURE__ */ ((PartialAcceptTriggerKind2) => {
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Unknown"] = 0] = "Unknown";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Word"] = 1] = "Word";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Line"] = 2] = "Line";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Suggest"] = 3] = "Suggest";
  return PartialAcceptTriggerKind2;
})(PartialAcceptTriggerKind || {});
var InlineCompletionEndOfLifeReasonKind = /* @__PURE__ */ ((InlineCompletionEndOfLifeReasonKind2) => {
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Accepted"] = 0] = "Accepted";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Rejected"] = 1] = "Rejected";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Ignored"] = 2] = "Ignored";
  return InlineCompletionEndOfLifeReasonKind2;
})(InlineCompletionEndOfLifeReasonKind || {});
var InlineCompletionDisplayLocationKind = /* @__PURE__ */ ((InlineCompletionDisplayLocationKind2) => {
  InlineCompletionDisplayLocationKind2[InlineCompletionDisplayLocationKind2["Code"] = 1] = "Code";
  InlineCompletionDisplayLocationKind2[InlineCompletionDisplayLocationKind2["Label"] = 2] = "Label";
  return InlineCompletionDisplayLocationKind2;
})(InlineCompletionDisplayLocationKind || {});
var ViewColumn = /* @__PURE__ */ ((ViewColumn2) => {
  ViewColumn2[ViewColumn2["Active"] = -1] = "Active";
  ViewColumn2[ViewColumn2["Beside"] = -2] = "Beside";
  ViewColumn2[ViewColumn2["One"] = 1] = "One";
  ViewColumn2[ViewColumn2["Two"] = 2] = "Two";
  ViewColumn2[ViewColumn2["Three"] = 3] = "Three";
  ViewColumn2[ViewColumn2["Four"] = 4] = "Four";
  ViewColumn2[ViewColumn2["Five"] = 5] = "Five";
  ViewColumn2[ViewColumn2["Six"] = 6] = "Six";
  ViewColumn2[ViewColumn2["Seven"] = 7] = "Seven";
  ViewColumn2[ViewColumn2["Eight"] = 8] = "Eight";
  ViewColumn2[ViewColumn2["Nine"] = 9] = "Nine";
  return ViewColumn2;
})(ViewColumn || {});
var StatusBarAlignment = /* @__PURE__ */ ((StatusBarAlignment2) => {
  StatusBarAlignment2[StatusBarAlignment2["Left"] = 1] = "Left";
  StatusBarAlignment2[StatusBarAlignment2["Right"] = 2] = "Right";
  return StatusBarAlignment2;
})(StatusBarAlignment || {});
function asStatusBarItemIdentifier(extension, id) {
  return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
var TextEditorLineNumbersStyle = /* @__PURE__ */ ((TextEditorLineNumbersStyle2) => {
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Off"] = 0] = "Off";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["On"] = 1] = "On";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Relative"] = 2] = "Relative";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Interval"] = 3] = "Interval";
  return TextEditorLineNumbersStyle2;
})(TextEditorLineNumbersStyle || {});
var TextDocumentSaveReason = /* @__PURE__ */ ((TextDocumentSaveReason2) => {
  TextDocumentSaveReason2[TextDocumentSaveReason2["Manual"] = 1] = "Manual";
  TextDocumentSaveReason2[TextDocumentSaveReason2["AfterDelay"] = 2] = "AfterDelay";
  TextDocumentSaveReason2[TextDocumentSaveReason2["FocusOut"] = 3] = "FocusOut";
  return TextDocumentSaveReason2;
})(TextDocumentSaveReason || {});
var TextEditorRevealType = /* @__PURE__ */ ((TextEditorRevealType2) => {
  TextEditorRevealType2[TextEditorRevealType2["Default"] = 0] = "Default";
  TextEditorRevealType2[TextEditorRevealType2["InCenter"] = 1] = "InCenter";
  TextEditorRevealType2[TextEditorRevealType2["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
  TextEditorRevealType2[TextEditorRevealType2["AtTop"] = 3] = "AtTop";
  return TextEditorRevealType2;
})(TextEditorRevealType || {});
var TextEditorSelectionChangeKind = /* @__PURE__ */ ((TextEditorSelectionChangeKind2) => {
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Keyboard"] = 1] = "Keyboard";
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Mouse"] = 2] = "Mouse";
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Command"] = 3] = "Command";
  return TextEditorSelectionChangeKind2;
})(TextEditorSelectionChangeKind || {});
var TextEditorChangeKind = /* @__PURE__ */ ((TextEditorChangeKind2) => {
  TextEditorChangeKind2[TextEditorChangeKind2["Addition"] = 1] = "Addition";
  TextEditorChangeKind2[TextEditorChangeKind2["Deletion"] = 2] = "Deletion";
  TextEditorChangeKind2[TextEditorChangeKind2["Modification"] = 3] = "Modification";
  return TextEditorChangeKind2;
})(TextEditorChangeKind || {});
var TextDocumentChangeReason = /* @__PURE__ */ ((TextDocumentChangeReason2) => {
  TextDocumentChangeReason2[TextDocumentChangeReason2["Undo"] = 1] = "Undo";
  TextDocumentChangeReason2[TextDocumentChangeReason2["Redo"] = 2] = "Redo";
  return TextDocumentChangeReason2;
})(TextDocumentChangeReason || {});
var DecorationRangeBehavior = /* @__PURE__ */ ((DecorationRangeBehavior2) => {
  DecorationRangeBehavior2[DecorationRangeBehavior2["OpenOpen"] = 0] = "OpenOpen";
  DecorationRangeBehavior2[DecorationRangeBehavior2["ClosedClosed"] = 1] = "ClosedClosed";
  DecorationRangeBehavior2[DecorationRangeBehavior2["OpenClosed"] = 2] = "OpenClosed";
  DecorationRangeBehavior2[DecorationRangeBehavior2["ClosedOpen"] = 3] = "ClosedOpen";
  return DecorationRangeBehavior2;
})(DecorationRangeBehavior || {});
((TextEditorSelectionChangeKind2) => {
  function fromValue(s) {
    switch (s) {
      case "keyboard":
        return 1 /* Keyboard */;
      case "mouse":
        return 2 /* Mouse */;
      case TextEditorSelectionSource.PROGRAMMATIC:
      case TextEditorSelectionSource.JUMP:
      case TextEditorSelectionSource.NAVIGATION:
        return 3 /* Command */;
    }
    return void 0;
  }
  TextEditorSelectionChangeKind2.fromValue = fromValue;
})(TextEditorSelectionChangeKind || (TextEditorSelectionChangeKind = {}));
var SyntaxTokenType = /* @__PURE__ */ ((SyntaxTokenType2) => {
  SyntaxTokenType2[SyntaxTokenType2["Other"] = 0] = "Other";
  SyntaxTokenType2[SyntaxTokenType2["Comment"] = 1] = "Comment";
  SyntaxTokenType2[SyntaxTokenType2["String"] = 2] = "String";
  SyntaxTokenType2[SyntaxTokenType2["RegEx"] = 3] = "RegEx";
  return SyntaxTokenType2;
})(SyntaxTokenType || {});
((SyntaxTokenType2) => {
  function toString(v) {
    switch (v) {
      case 0 /* Other */:
        return "other";
      case 1 /* Comment */:
        return "comment";
      case 2 /* String */:
        return "string";
      case 3 /* RegEx */:
        return "regex";
    }
    return "other";
  }
  SyntaxTokenType2.toString = toString;
})(SyntaxTokenType || (SyntaxTokenType = {}));
let DocumentLink = class {
  constructor(range, target) {
    if (target && !URI.isUri(target)) {
      throw illegalArgument("target");
    }
    if (!Range.isRange(range) || range.isEmpty) {
      throw illegalArgument("range");
    }
    this.range = range;
    this.target = target;
  }
};
DocumentLink = __decorateClass([
  es5ClassCompat
], DocumentLink);
let Color = class {
  constructor(red, green, blue, alpha) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
  }
};
Color = __decorateClass([
  es5ClassCompat
], Color);
let ColorInformation = class {
  constructor(range, color) {
    if (color && !(color instanceof Color)) {
      throw illegalArgument("color");
    }
    if (!Range.isRange(range) || range.isEmpty) {
      throw illegalArgument("range");
    }
    this.range = range;
    this.color = color;
  }
};
ColorInformation = __decorateClass([
  es5ClassCompat
], ColorInformation);
let ColorPresentation = class {
  constructor(label) {
    if (!label || typeof label !== "string") {
      throw illegalArgument("label");
    }
    this.label = label;
  }
};
ColorPresentation = __decorateClass([
  es5ClassCompat
], ColorPresentation);
var ColorFormat = /* @__PURE__ */ ((ColorFormat2) => {
  ColorFormat2[ColorFormat2["RGB"] = 0] = "RGB";
  ColorFormat2[ColorFormat2["HEX"] = 1] = "HEX";
  ColorFormat2[ColorFormat2["HSL"] = 2] = "HSL";
  return ColorFormat2;
})(ColorFormat || {});
var SourceControlInputBoxValidationType = /* @__PURE__ */ ((SourceControlInputBoxValidationType2) => {
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Error"] = 0] = "Error";
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Warning"] = 1] = "Warning";
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Information"] = 2] = "Information";
  return SourceControlInputBoxValidationType2;
})(SourceControlInputBoxValidationType || {});
var TerminalExitReason = /* @__PURE__ */ ((TerminalExitReason2) => {
  TerminalExitReason2[TerminalExitReason2["Unknown"] = 0] = "Unknown";
  TerminalExitReason2[TerminalExitReason2["Shutdown"] = 1] = "Shutdown";
  TerminalExitReason2[TerminalExitReason2["Process"] = 2] = "Process";
  TerminalExitReason2[TerminalExitReason2["User"] = 3] = "User";
  TerminalExitReason2[TerminalExitReason2["Extension"] = 4] = "Extension";
  return TerminalExitReason2;
})(TerminalExitReason || {});
var TerminalShellExecutionCommandLineConfidence = /* @__PURE__ */ ((TerminalShellExecutionCommandLineConfidence2) => {
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["Low"] = 0] = "Low";
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["Medium"] = 1] = "Medium";
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["High"] = 2] = "High";
  return TerminalShellExecutionCommandLineConfidence2;
})(TerminalShellExecutionCommandLineConfidence || {});
var TerminalShellType = /* @__PURE__ */ ((TerminalShellType2) => {
  TerminalShellType2[TerminalShellType2["Sh"] = 1] = "Sh";
  TerminalShellType2[TerminalShellType2["Bash"] = 2] = "Bash";
  TerminalShellType2[TerminalShellType2["Fish"] = 3] = "Fish";
  TerminalShellType2[TerminalShellType2["Csh"] = 4] = "Csh";
  TerminalShellType2[TerminalShellType2["Ksh"] = 5] = "Ksh";
  TerminalShellType2[TerminalShellType2["Zsh"] = 6] = "Zsh";
  TerminalShellType2[TerminalShellType2["CommandPrompt"] = 7] = "CommandPrompt";
  TerminalShellType2[TerminalShellType2["GitBash"] = 8] = "GitBash";
  TerminalShellType2[TerminalShellType2["PowerShell"] = 9] = "PowerShell";
  TerminalShellType2[TerminalShellType2["Python"] = 10] = "Python";
  TerminalShellType2[TerminalShellType2["Julia"] = 11] = "Julia";
  TerminalShellType2[TerminalShellType2["NuShell"] = 12] = "NuShell";
  TerminalShellType2[TerminalShellType2["Node"] = 13] = "Node";
  TerminalShellType2[TerminalShellType2["Xonsh"] = 14] = "Xonsh";
  return TerminalShellType2;
})(TerminalShellType || {});
class TerminalLink {
  constructor(startIndex, length, tooltip) {
    this.startIndex = startIndex;
    this.length = length;
    this.tooltip = tooltip;
    if (typeof startIndex !== "number" || startIndex < 0) {
      throw illegalArgument("startIndex");
    }
    if (typeof length !== "number" || length < 1) {
      throw illegalArgument("length");
    }
    if (tooltip !== void 0 && typeof tooltip !== "string") {
      throw illegalArgument("tooltip");
    }
  }
}
class TerminalQuickFixOpener {
  constructor(uri) {
    this.uri = uri;
  }
}
class TerminalQuickFixCommand {
  constructor(terminalCommand) {
    this.terminalCommand = terminalCommand;
  }
}
var TerminalLocation = /* @__PURE__ */ ((TerminalLocation2) => {
  TerminalLocation2[TerminalLocation2["Panel"] = 1] = "Panel";
  TerminalLocation2[TerminalLocation2["Editor"] = 2] = "Editor";
  return TerminalLocation2;
})(TerminalLocation || {});
class TerminalProfile {
  constructor(options) {
    this.options = options;
    if (typeof options !== "object") {
      throw illegalArgument("options");
    }
  }
}
var TerminalCompletionItemKind = /* @__PURE__ */ ((TerminalCompletionItemKind2) => {
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["File"] = 0] = "File";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Folder"] = 1] = "Folder";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Method"] = 2] = "Method";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Alias"] = 3] = "Alias";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Argument"] = 4] = "Argument";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Option"] = 5] = "Option";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["OptionValue"] = 6] = "OptionValue";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Flag"] = 7] = "Flag";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["SymbolicLinkFile"] = 8] = "SymbolicLinkFile";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["SymbolicLinkFolder"] = 9] = "SymbolicLinkFolder";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmCommit"] = 10] = "ScmCommit";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmBranch"] = 11] = "ScmBranch";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmTag"] = 12] = "ScmTag";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmStash"] = 13] = "ScmStash";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmRemote"] = 14] = "ScmRemote";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["PullRequest"] = 15] = "PullRequest";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["PullRequestDone"] = 16] = "PullRequestDone";
  return TerminalCompletionItemKind2;
})(TerminalCompletionItemKind || {});
class TerminalCompletionItem {
  constructor(label, replacementRange, kind, detail, documentation, isFile, isDirectory, isKeyword) {
    this.label = label;
    this.replacementRange = replacementRange;
    this.kind = kind;
    this.detail = detail;
    this.documentation = documentation;
    this.isFile = isFile;
    this.isDirectory = isDirectory;
    this.isKeyword = isKeyword;
  }
}
class TerminalCompletionList {
  /**
   * Creates a new completion list.
   *
   * @param items The completion items.
   * @param isIncomplete The list is not complete.
   */
  constructor(items, resourceOptions) {
    this.items = items ?? [];
    this.resourceOptions = resourceOptions;
  }
}
var TaskRevealKind = /* @__PURE__ */ ((TaskRevealKind2) => {
  TaskRevealKind2[TaskRevealKind2["Always"] = 1] = "Always";
  TaskRevealKind2[TaskRevealKind2["Silent"] = 2] = "Silent";
  TaskRevealKind2[TaskRevealKind2["Never"] = 3] = "Never";
  return TaskRevealKind2;
})(TaskRevealKind || {});
var TaskEventKind = /* @__PURE__ */ ((TaskEventKind2) => {
  TaskEventKind2["Changed"] = "changed";
  TaskEventKind2["ProcessStarted"] = "processStarted";
  TaskEventKind2["ProcessEnded"] = "processEnded";
  TaskEventKind2["Terminated"] = "terminated";
  TaskEventKind2["Start"] = "start";
  TaskEventKind2["AcquiredInput"] = "acquiredInput";
  TaskEventKind2["DependsOnStarted"] = "dependsOnStarted";
  TaskEventKind2["Active"] = "active";
  TaskEventKind2["Inactive"] = "inactive";
  TaskEventKind2["End"] = "end";
  TaskEventKind2["ProblemMatcherStarted"] = "problemMatcherStarted";
  TaskEventKind2["ProblemMatcherEnded"] = "problemMatcherEnded";
  TaskEventKind2["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
  return TaskEventKind2;
})(TaskEventKind || {});
var TaskPanelKind = /* @__PURE__ */ ((TaskPanelKind2) => {
  TaskPanelKind2[TaskPanelKind2["Shared"] = 1] = "Shared";
  TaskPanelKind2[TaskPanelKind2["Dedicated"] = 2] = "Dedicated";
  TaskPanelKind2[TaskPanelKind2["New"] = 3] = "New";
  return TaskPanelKind2;
})(TaskPanelKind || {});
let TaskGroup = class {
  constructor(id, label) {
    this.label = label;
    if (typeof id !== "string") {
      throw illegalArgument("name");
    }
    if (typeof label !== "string") {
      throw illegalArgument("name");
    }
    this._id = id;
  }
  static from(value) {
    switch (value) {
      case "clean":
        return TaskGroup.Clean;
      case "build":
        return TaskGroup.Build;
      case "rebuild":
        return TaskGroup.Rebuild;
      case "test":
        return TaskGroup.Test;
      default:
        return void 0;
    }
  }
  get id() {
    return this._id;
  }
};
TaskGroup.Clean = new TaskGroup("clean", "Clean");
TaskGroup.Build = new TaskGroup("build", "Build");
TaskGroup.Rebuild = new TaskGroup("rebuild", "Rebuild");
TaskGroup.Test = new TaskGroup("test", "Test");
TaskGroup = __decorateClass([
  es5ClassCompat
], TaskGroup);
function computeTaskExecutionId(values) {
  let id = "";
  for (let i = 0; i < values.length; i++) {
    id += values[i].replace(/,/g, ",,") + ",";
  }
  return id;
}
let ProcessExecution = class {
  constructor(process, varg1, varg2) {
    if (typeof process !== "string") {
      throw illegalArgument("process");
    }
    this._args = [];
    this._process = process;
    if (varg1 !== void 0) {
      if (Array.isArray(varg1)) {
        this._args = varg1;
        this._options = varg2;
      } else {
        this._options = varg1;
      }
    }
  }
  get process() {
    return this._process;
  }
  set process(value) {
    if (typeof value !== "string") {
      throw illegalArgument("process");
    }
    this._process = value;
  }
  get args() {
    return this._args;
  }
  set args(value) {
    if (!Array.isArray(value)) {
      value = [];
    }
    this._args = value;
  }
  get options() {
    return this._options;
  }
  set options(value) {
    this._options = value;
  }
  computeId() {
    const props = [];
    props.push("process");
    if (this._process !== void 0) {
      props.push(this._process);
    }
    if (this._args && this._args.length > 0) {
      for (const arg of this._args) {
        props.push(arg);
      }
    }
    return computeTaskExecutionId(props);
  }
};
ProcessExecution = __decorateClass([
  es5ClassCompat
], ProcessExecution);
let ShellExecution = class {
  constructor(arg0, arg1, arg2) {
    this._args = [];
    if (Array.isArray(arg1)) {
      if (!arg0) {
        throw illegalArgument("command can't be undefined or null");
      }
      if (typeof arg0 !== "string" && typeof arg0.value !== "string") {
        throw illegalArgument("command");
      }
      this._command = arg0;
      if (arg1) {
        this._args = arg1;
      }
      this._options = arg2;
    } else {
      if (typeof arg0 !== "string") {
        throw illegalArgument("commandLine");
      }
      this._commandLine = arg0;
      this._options = arg1;
    }
  }
  get commandLine() {
    return this._commandLine;
  }
  set commandLine(value) {
    if (typeof value !== "string") {
      throw illegalArgument("commandLine");
    }
    this._commandLine = value;
  }
  get command() {
    return this._command ? this._command : "";
  }
  set command(value) {
    if (typeof value !== "string" && typeof value.value !== "string") {
      throw illegalArgument("command");
    }
    this._command = value;
  }
  get args() {
    return this._args;
  }
  set args(value) {
    this._args = value || [];
  }
  get options() {
    return this._options;
  }
  set options(value) {
    this._options = value;
  }
  computeId() {
    const props = [];
    props.push("shell");
    if (this._commandLine !== void 0) {
      props.push(this._commandLine);
    }
    if (this._command !== void 0) {
      props.push(typeof this._command === "string" ? this._command : this._command.value);
    }
    if (this._args && this._args.length > 0) {
      for (const arg of this._args) {
        props.push(typeof arg === "string" ? arg : arg.value);
      }
    }
    return computeTaskExecutionId(props);
  }
};
ShellExecution = __decorateClass([
  es5ClassCompat
], ShellExecution);
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["Escape"] = 1] = "Escape";
  ShellQuoting2[ShellQuoting2["Strong"] = 2] = "Strong";
  ShellQuoting2[ShellQuoting2["Weak"] = 3] = "Weak";
  return ShellQuoting2;
})(ShellQuoting || {});
var TaskScope = /* @__PURE__ */ ((TaskScope2) => {
  TaskScope2[TaskScope2["Global"] = 1] = "Global";
  TaskScope2[TaskScope2["Workspace"] = 2] = "Workspace";
  return TaskScope2;
})(TaskScope || {});
var TaskRunOn = /* @__PURE__ */ ((TaskRunOn2) => {
  TaskRunOn2[TaskRunOn2["Default"] = 1] = "Default";
  TaskRunOn2[TaskRunOn2["FolderOpen"] = 2] = "FolderOpen";
  TaskRunOn2[TaskRunOn2["WorktreeCreated"] = 3] = "WorktreeCreated";
  return TaskRunOn2;
})(TaskRunOn || {});
class CustomExecution {
  constructor(callback) {
    this._callback = callback;
  }
  computeId() {
    return "customExecution" + generateUuid();
  }
  set callback(value) {
    this._callback = value;
  }
  get callback() {
    return this._callback;
  }
}
let Task = class {
  constructor(definition, arg2, arg3, arg4, arg5, arg6) {
    this.__deprecated = false;
    this._definition = this.definition = definition;
    let problemMatchers;
    if (typeof arg2 === "string") {
      this._name = this.name = arg2;
      this._source = this.source = arg3;
      this.execution = arg4;
      problemMatchers = arg5;
      this.__deprecated = true;
    } else if (arg2 === 1 /* Global */ || arg2 === 2 /* Workspace */) {
      this.target = arg2;
      this._name = this.name = arg3;
      this._source = this.source = arg4;
      this.execution = arg5;
      problemMatchers = arg6;
    } else {
      this.target = arg2;
      this._name = this.name = arg3;
      this._source = this.source = arg4;
      this.execution = arg5;
      problemMatchers = arg6;
    }
    if (typeof problemMatchers === "string") {
      this._problemMatchers = [problemMatchers];
      this._hasDefinedMatchers = true;
    } else if (Array.isArray(problemMatchers)) {
      this._problemMatchers = problemMatchers;
      this._hasDefinedMatchers = true;
    } else {
      this._problemMatchers = [];
      this._hasDefinedMatchers = false;
    }
    this._isBackground = false;
    this._presentationOptions = /* @__PURE__ */ Object.create(null);
    this._runOptions = /* @__PURE__ */ Object.create(null);
  }
  get _id() {
    return this.__id;
  }
  set _id(value) {
    this.__id = value;
  }
  get _deprecated() {
    return this.__deprecated;
  }
  clear() {
    if (this.__id === void 0) {
      return;
    }
    this.__id = void 0;
    this._scope = void 0;
    this.computeDefinitionBasedOnExecution();
  }
  computeDefinitionBasedOnExecution() {
    if (this._execution instanceof ProcessExecution) {
      this._definition = {
        type: Task.ProcessType,
        id: this._execution.computeId()
      };
    } else if (this._execution instanceof ShellExecution) {
      this._definition = {
        type: Task.ShellType,
        id: this._execution.computeId()
      };
    } else if (this._execution instanceof CustomExecution) {
      this._definition = {
        type: Task.ExtensionCallbackType,
        id: this._execution.computeId()
      };
    } else {
      this._definition = {
        type: Task.EmptyType,
        id: generateUuid()
      };
    }
  }
  get definition() {
    return this._definition;
  }
  set definition(value) {
    if (value === void 0 || value === null) {
      throw illegalArgument("Kind can't be undefined or null");
    }
    this.clear();
    this._definition = value;
  }
  get scope() {
    return this._scope;
  }
  set target(value) {
    this.clear();
    this._scope = value;
  }
  get name() {
    return this._name;
  }
  set name(value) {
    if (typeof value !== "string") {
      throw illegalArgument("name");
    }
    this.clear();
    this._name = value;
  }
  get execution() {
    return this._execution;
  }
  set execution(value) {
    if (value === null) {
      value = void 0;
    }
    this.clear();
    this._execution = value;
    const type = this._definition.type;
    if (Task.EmptyType === type || Task.ProcessType === type || Task.ShellType === type || Task.ExtensionCallbackType === type) {
      this.computeDefinitionBasedOnExecution();
    }
  }
  get problemMatchers() {
    return this._problemMatchers;
  }
  set problemMatchers(value) {
    if (!Array.isArray(value)) {
      this.clear();
      this._problemMatchers = [];
      this._hasDefinedMatchers = false;
      return;
    } else {
      this.clear();
      this._problemMatchers = value;
      this._hasDefinedMatchers = true;
    }
  }
  get hasDefinedMatchers() {
    return this._hasDefinedMatchers;
  }
  get isBackground() {
    return this._isBackground;
  }
  set isBackground(value) {
    if (value !== true && value !== false) {
      value = false;
    }
    this.clear();
    this._isBackground = value;
  }
  get source() {
    return this._source;
  }
  set source(value) {
    if (typeof value !== "string" || value.length === 0) {
      throw illegalArgument("source must be a string of length > 0");
    }
    this.clear();
    this._source = value;
  }
  get group() {
    return this._group;
  }
  set group(value) {
    if (value === null) {
      value = void 0;
    }
    this.clear();
    this._group = value;
  }
  get detail() {
    return this._detail;
  }
  set detail(value) {
    if (value === null) {
      value = void 0;
    }
    this._detail = value;
  }
  get presentationOptions() {
    return this._presentationOptions;
  }
  set presentationOptions(value) {
    if (value === null || value === void 0) {
      value = /* @__PURE__ */ Object.create(null);
    }
    this.clear();
    this._presentationOptions = value;
  }
  get runOptions() {
    return this._runOptions;
  }
  set runOptions(value) {
    if (value === null || value === void 0) {
      value = /* @__PURE__ */ Object.create(null);
    }
    this.clear();
    this._runOptions = value;
  }
};
Task.ExtensionCallbackType = "customExecution";
Task.ProcessType = "process";
Task.ShellType = "shell";
Task.EmptyType = "$empty";
Task = __decorateClass([
  es5ClassCompat
], Task);
var ProgressLocation = /* @__PURE__ */ ((ProgressLocation2) => {
  ProgressLocation2[ProgressLocation2["SourceControl"] = 1] = "SourceControl";
  ProgressLocation2[ProgressLocation2["Window"] = 10] = "Window";
  ProgressLocation2[ProgressLocation2["Notification"] = 15] = "Notification";
  return ProgressLocation2;
})(ProgressLocation || {});
var ViewBadge;
((ViewBadge2) => {
  function isViewBadge(thing) {
    const viewBadgeThing = thing;
    if (!isNumber(viewBadgeThing.value)) {
      console.log("INVALID view badge, invalid value", viewBadgeThing.value);
      return false;
    }
    if (viewBadgeThing.tooltip && !isString(viewBadgeThing.tooltip)) {
      console.log("INVALID view badge, invalid tooltip", viewBadgeThing.tooltip);
      return false;
    }
    return true;
  }
  ViewBadge2.isViewBadge = isViewBadge;
})(ViewBadge || (ViewBadge = {}));
let TreeItem = class {
  constructor(arg1, collapsibleState = 0 /* None */) {
    this.collapsibleState = collapsibleState;
    if (URI.isUri(arg1)) {
      this.resourceUri = arg1;
    } else {
      this.label = arg1;
    }
  }
  static isTreeItem(thing, extension) {
    const treeItemThing = thing;
    if (treeItemThing.checkboxState !== void 0) {
      const checkbox = isNumber(treeItemThing.checkboxState) ? treeItemThing.checkboxState : isObject(treeItemThing.checkboxState) && isNumber(treeItemThing.checkboxState.state) ? treeItemThing.checkboxState.state : void 0;
      const tooltip = !isNumber(treeItemThing.checkboxState) && isObject(treeItemThing.checkboxState) ? treeItemThing.checkboxState.tooltip : void 0;
      if (checkbox === void 0 || checkbox !== 1 /* Checked */ && checkbox !== 0 /* Unchecked */ || tooltip !== void 0 && !isString(tooltip)) {
        console.log("INVALID tree item, invalid checkboxState", treeItemThing.checkboxState);
        return false;
      }
    }
    if (thing instanceof TreeItem) {
      return true;
    }
    if (treeItemThing.label !== void 0 && !isString(treeItemThing.label) && !treeItemThing.label?.label) {
      console.log("INVALID tree item, invalid label", treeItemThing.label);
      return false;
    }
    if (treeItemThing.id !== void 0 && !isString(treeItemThing.id)) {
      console.log("INVALID tree item, invalid id", treeItemThing.id);
      return false;
    }
    if (treeItemThing.iconPath !== void 0 && !isString(treeItemThing.iconPath) && !URI.isUri(treeItemThing.iconPath) && (!treeItemThing.iconPath || !isString(treeItemThing.iconPath.id))) {
      const asLightAndDarkThing = treeItemThing.iconPath;
      if (!asLightAndDarkThing || !isString(asLightAndDarkThing.light) && !URI.isUri(asLightAndDarkThing.light) && !isString(asLightAndDarkThing.dark) && !URI.isUri(asLightAndDarkThing.dark)) {
        console.log("INVALID tree item, invalid iconPath", treeItemThing.iconPath);
        return false;
      }
    }
    if (treeItemThing.description !== void 0 && !isString(treeItemThing.description) && typeof treeItemThing.description !== "boolean") {
      console.log("INVALID tree item, invalid description", treeItemThing.description);
      return false;
    }
    if (treeItemThing.resourceUri !== void 0 && !URI.isUri(treeItemThing.resourceUri)) {
      console.log("INVALID tree item, invalid resourceUri", treeItemThing.resourceUri);
      return false;
    }
    if (treeItemThing.tooltip !== void 0 && !isString(treeItemThing.tooltip) && !(treeItemThing.tooltip instanceof MarkdownString)) {
      console.log("INVALID tree item, invalid tooltip", treeItemThing.tooltip);
      return false;
    }
    if (treeItemThing.command !== void 0 && !treeItemThing.command.command) {
      console.log("INVALID tree item, invalid command", treeItemThing.command);
      return false;
    }
    if (treeItemThing.collapsibleState !== void 0 && treeItemThing.collapsibleState < 0 /* None */ && treeItemThing.collapsibleState > 2 /* Expanded */) {
      console.log("INVALID tree item, invalid collapsibleState", treeItemThing.collapsibleState);
      return false;
    }
    if (treeItemThing.contextValue !== void 0 && !isString(treeItemThing.contextValue)) {
      console.log("INVALID tree item, invalid contextValue", treeItemThing.contextValue);
      return false;
    }
    if (treeItemThing.accessibilityInformation !== void 0 && !treeItemThing.accessibilityInformation?.label) {
      console.log("INVALID tree item, invalid accessibilityInformation", treeItemThing.accessibilityInformation);
      return false;
    }
    return true;
  }
};
TreeItem = __decorateClass([
  es5ClassCompat
], TreeItem);
var TreeItemCollapsibleState = /* @__PURE__ */ ((TreeItemCollapsibleState2) => {
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["None"] = 0] = "None";
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["Collapsed"] = 1] = "Collapsed";
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["Expanded"] = 2] = "Expanded";
  return TreeItemCollapsibleState2;
})(TreeItemCollapsibleState || {});
var TreeItemCheckboxState = /* @__PURE__ */ ((TreeItemCheckboxState2) => {
  TreeItemCheckboxState2[TreeItemCheckboxState2["Unchecked"] = 0] = "Unchecked";
  TreeItemCheckboxState2[TreeItemCheckboxState2["Checked"] = 1] = "Checked";
  return TreeItemCheckboxState2;
})(TreeItemCheckboxState || {});
let DataTransferItem = class {
  constructor(value) {
    this.value = value;
  }
  async asString() {
    return typeof this.value === "string" ? this.value : JSON.stringify(this.value);
  }
  asFile() {
    return void 0;
  }
};
DataTransferItem = __decorateClass([
  es5ClassCompat
], DataTransferItem);
class InternalDataTransferItem extends DataTransferItem {
}
class InternalFileDataTransferItem extends InternalDataTransferItem {
  #file;
  constructor(file) {
    super("");
    this.#file = file;
  }
  asFile() {
    return this.#file;
  }
}
class DataTransferFile {
  constructor(name, uri, itemId, getData) {
    this.name = name;
    this.uri = uri;
    this._itemId = itemId;
    this._getData = getData;
  }
  data() {
    return this._getData();
  }
}
let DataTransfer = class {
  constructor(init) {
    __privateAdd(this, _DataTransfer_instances);
    __privateAdd(this, _items, /* @__PURE__ */ new Map());
    for (const [mime, item] of init ?? []) {
      const existing = __privateGet(this, _items).get(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mime));
      if (existing) {
        existing.push(item);
      } else {
        __privateGet(this, _items).set(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mime), [item]);
      }
    }
  }
  get(mimeType) {
    return __privateGet(this, _items).get(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mimeType))?.[0];
  }
  set(mimeType, value) {
    __privateGet(this, _items).set(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mimeType), [value]);
  }
  forEach(callbackfn, thisArg) {
    for (const [mime, items] of __privateGet(this, _items)) {
      for (const item of items) {
        callbackfn.call(thisArg, item, mime, this);
      }
    }
  }
  *[Symbol.iterator]() {
    for (const [mime, items] of __privateGet(this, _items)) {
      for (const item of items) {
        yield [mime, item];
      }
    }
  }
};
_items = new WeakMap();
_DataTransfer_instances = new WeakSet();
normalizeMime_fn = function(mimeType) {
  return mimeType.toLowerCase();
};
DataTransfer = __decorateClass([
  es5ClassCompat
], DataTransfer);
let DocumentDropEdit = class {
  constructor(insertText, title, kind) {
    this.insertText = insertText;
    this.title = title;
    this.kind = kind;
  }
};
DocumentDropEdit = __decorateClass([
  es5ClassCompat
], DocumentDropEdit);
var DocumentPasteTriggerKind = /* @__PURE__ */ ((DocumentPasteTriggerKind2) => {
  DocumentPasteTriggerKind2[DocumentPasteTriggerKind2["Automatic"] = 0] = "Automatic";
  DocumentPasteTriggerKind2[DocumentPasteTriggerKind2["PasteAs"] = 1] = "PasteAs";
  return DocumentPasteTriggerKind2;
})(DocumentPasteTriggerKind || {});
const _DocumentDropOrPasteEditKind = class _DocumentDropOrPasteEditKind {
  constructor(value) {
    this.value = value;
  }
  append(...parts) {
    return new _DocumentDropOrPasteEditKind((this.value ? [this.value, ...parts] : parts).join(_DocumentDropOrPasteEditKind.sep));
  }
  intersects(other) {
    return this.contains(other) || other.contains(this);
  }
  contains(other) {
    return this.value === other.value || other.value.startsWith(this.value + _DocumentDropOrPasteEditKind.sep);
  }
};
_DocumentDropOrPasteEditKind.sep = ".";
let DocumentDropOrPasteEditKind = _DocumentDropOrPasteEditKind;
DocumentDropOrPasteEditKind.Empty = new DocumentDropOrPasteEditKind("");
DocumentDropOrPasteEditKind.Text = new DocumentDropOrPasteEditKind("text");
DocumentDropOrPasteEditKind.TextUpdateImports = DocumentDropOrPasteEditKind.Text.append("updateImports");
class DocumentPasteEdit {
  constructor(insertText, title, kind) {
    this.title = title;
    this.insertText = insertText;
    this.kind = kind;
  }
}
let ThemeIcon = class {
  constructor(id, color) {
    this.id = id;
    this.color = color;
  }
  static isThemeIcon(thing) {
    if (typeof thing.id !== "string") {
      console.log("INVALID ThemeIcon, invalid id", thing.id);
      return false;
    }
    return true;
  }
};
ThemeIcon = __decorateClass([
  es5ClassCompat
], ThemeIcon);
ThemeIcon.File = new ThemeIcon("file");
ThemeIcon.Folder = new ThemeIcon("folder");
let ThemeColor = class {
  constructor(id) {
    this.id = id;
  }
};
ThemeColor = __decorateClass([
  es5ClassCompat
], ThemeColor);
var ConfigurationTarget = /* @__PURE__ */ ((ConfigurationTarget2) => {
  ConfigurationTarget2[ConfigurationTarget2["Global"] = 1] = "Global";
  ConfigurationTarget2[ConfigurationTarget2["Workspace"] = 2] = "Workspace";
  ConfigurationTarget2[ConfigurationTarget2["WorkspaceFolder"] = 3] = "WorkspaceFolder";
  return ConfigurationTarget2;
})(ConfigurationTarget || {});
let RelativePattern = class {
  get base() {
    return this._base;
  }
  set base(base) {
    this._base = base;
    this._baseUri = URI.file(base);
  }
  get baseUri() {
    return this._baseUri;
  }
  set baseUri(baseUri) {
    this._baseUri = baseUri;
    this._base = baseUri.fsPath;
  }
  constructor(base, pattern) {
    if (typeof base !== "string") {
      if (!base || !URI.isUri(base) && !URI.isUri(base.uri)) {
        throw illegalArgument("base");
      }
    }
    if (typeof pattern !== "string") {
      throw illegalArgument("pattern");
    }
    if (typeof base === "string") {
      this.baseUri = URI.file(base);
    } else if (URI.isUri(base)) {
      this.baseUri = base;
    } else {
      this.baseUri = base.uri;
    }
    this.pattern = pattern;
  }
  toJSON() {
    return {
      pattern: this.pattern,
      base: this.base,
      baseUri: this.baseUri.toJSON()
    };
  }
};
RelativePattern = __decorateClass([
  es5ClassCompat
], RelativePattern);
const breakpointIds = /* @__PURE__ */ new WeakMap();
function setBreakpointId(bp, id) {
  breakpointIds.set(bp, id);
}
let Breakpoint = class {
  constructor(enabled, condition, hitCondition, logMessage, mode) {
    this.enabled = typeof enabled === "boolean" ? enabled : true;
    if (typeof condition === "string") {
      this.condition = condition;
    }
    if (typeof hitCondition === "string") {
      this.hitCondition = hitCondition;
    }
    if (typeof logMessage === "string") {
      this.logMessage = logMessage;
    }
    if (typeof mode === "string") {
      this.mode = mode;
    }
  }
  get id() {
    if (!this._id) {
      this._id = breakpointIds.get(this) ?? generateUuid();
    }
    return this._id;
  }
};
Breakpoint = __decorateClass([
  es5ClassCompat
], Breakpoint);
let SourceBreakpoint = class extends Breakpoint {
  constructor(location, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    if (location === null) {
      throw illegalArgument("location");
    }
    this.location = location;
  }
};
SourceBreakpoint = __decorateClass([
  es5ClassCompat
], SourceBreakpoint);
let FunctionBreakpoint = class extends Breakpoint {
  constructor(functionName, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    this.functionName = functionName;
  }
};
FunctionBreakpoint = __decorateClass([
  es5ClassCompat
], FunctionBreakpoint);
let DataBreakpoint = class extends Breakpoint {
  constructor(label, dataId, canPersist, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    if (!dataId) {
      throw illegalArgument("dataId");
    }
    this.label = label;
    this.dataId = dataId;
    this.canPersist = canPersist;
  }
};
DataBreakpoint = __decorateClass([
  es5ClassCompat
], DataBreakpoint);
let DebugAdapterExecutable = class {
  constructor(command, args, options) {
    this.command = command;
    this.args = args || [];
    this.options = options;
  }
};
DebugAdapterExecutable = __decorateClass([
  es5ClassCompat
], DebugAdapterExecutable);
let DebugAdapterServer = class {
  constructor(port, host) {
    this.port = port;
    this.host = host;
  }
};
DebugAdapterServer = __decorateClass([
  es5ClassCompat
], DebugAdapterServer);
let DebugAdapterNamedPipeServer = class {
  constructor(path) {
    this.path = path;
  }
};
DebugAdapterNamedPipeServer = __decorateClass([
  es5ClassCompat
], DebugAdapterNamedPipeServer);
let DebugAdapterInlineImplementation = class {
  constructor(impl) {
    this.implementation = impl;
  }
};
DebugAdapterInlineImplementation = __decorateClass([
  es5ClassCompat
], DebugAdapterInlineImplementation);
class DebugStackFrame {
  constructor(session, threadId, frameId) {
    this.session = session;
    this.threadId = threadId;
    this.frameId = frameId;
  }
}
class DebugThread {
  constructor(session, threadId) {
    this.session = session;
    this.threadId = threadId;
  }
}
let EvaluatableExpression = class {
  constructor(range, expression) {
    this.range = range;
    this.expression = expression;
  }
};
EvaluatableExpression = __decorateClass([
  es5ClassCompat
], EvaluatableExpression);
var InlineCompletionTriggerKind = /* @__PURE__ */ ((InlineCompletionTriggerKind2) => {
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Automatic"] = 1] = "Automatic";
  return InlineCompletionTriggerKind2;
})(InlineCompletionTriggerKind || {});
var InlineCompletionsDisposeReasonKind = /* @__PURE__ */ ((InlineCompletionsDisposeReasonKind2) => {
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["Other"] = 0] = "Other";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["Empty"] = 1] = "Empty";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["TokenCancellation"] = 2] = "TokenCancellation";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["LostRace"] = 3] = "LostRace";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["NotTaken"] = 4] = "NotTaken";
  return InlineCompletionsDisposeReasonKind2;
})(InlineCompletionsDisposeReasonKind || {});
let InlineValueText = class {
  constructor(range, text) {
    this.range = range;
    this.text = text;
  }
};
InlineValueText = __decorateClass([
  es5ClassCompat
], InlineValueText);
let InlineValueVariableLookup = class {
  constructor(range, variableName, caseSensitiveLookup = true) {
    this.range = range;
    this.variableName = variableName;
    this.caseSensitiveLookup = caseSensitiveLookup;
  }
};
InlineValueVariableLookup = __decorateClass([
  es5ClassCompat
], InlineValueVariableLookup);
let InlineValueEvaluatableExpression = class {
  constructor(range, expression) {
    this.range = range;
    this.expression = expression;
  }
};
InlineValueEvaluatableExpression = __decorateClass([
  es5ClassCompat
], InlineValueEvaluatableExpression);
let InlineValueContext = class {
  constructor(frameId, range) {
    this.frameId = frameId;
    this.stoppedLocation = range;
  }
};
InlineValueContext = __decorateClass([
  es5ClassCompat
], InlineValueContext);
var NewSymbolNameTag = /* @__PURE__ */ ((NewSymbolNameTag2) => {
  NewSymbolNameTag2[NewSymbolNameTag2["AIGenerated"] = 1] = "AIGenerated";
  return NewSymbolNameTag2;
})(NewSymbolNameTag || {});
var NewSymbolNameTriggerKind = /* @__PURE__ */ ((NewSymbolNameTriggerKind2) => {
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Invoke"] = 0] = "Invoke";
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Automatic"] = 1] = "Automatic";
  return NewSymbolNameTriggerKind2;
})(NewSymbolNameTriggerKind || {});
class NewSymbolName {
  constructor(newSymbolName, tags) {
    this.newSymbolName = newSymbolName;
    this.tags = tags;
  }
}
var FileChangeType = /* @__PURE__ */ ((FileChangeType2) => {
  FileChangeType2[FileChangeType2["Changed"] = 1] = "Changed";
  FileChangeType2[FileChangeType2["Created"] = 2] = "Created";
  FileChangeType2[FileChangeType2["Deleted"] = 3] = "Deleted";
  return FileChangeType2;
})(FileChangeType || {});
let FileSystemError = class extends Error {
  static FileExists(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileExists, FileSystemError.FileExists);
  }
  static FileNotFound(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotFound, FileSystemError.FileNotFound);
  }
  static FileNotADirectory(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotADirectory, FileSystemError.FileNotADirectory);
  }
  static FileIsADirectory(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileIsADirectory, FileSystemError.FileIsADirectory);
  }
  static NoPermissions(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.NoPermissions, FileSystemError.NoPermissions);
  }
  static Unavailable(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.Unavailable, FileSystemError.Unavailable);
  }
  constructor(uriOrMessage, code = FileSystemProviderErrorCode.Unknown, terminator) {
    super(URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);
    this.code = terminator?.name ?? "Unknown";
    markAsFileSystemProviderError(this, code);
    Object.setPrototypeOf(this, FileSystemError.prototype);
    if (typeof Error.captureStackTrace === "function" && typeof terminator === "function") {
      Error.captureStackTrace(this, terminator);
    }
  }
};
FileSystemError = __decorateClass([
  es5ClassCompat
], FileSystemError);
let FoldingRange = class {
  constructor(start, end, kind) {
    this.start = start;
    this.end = end;
    this.kind = kind;
  }
};
FoldingRange = __decorateClass([
  es5ClassCompat
], FoldingRange);
var FoldingRangeKind = /* @__PURE__ */ ((FoldingRangeKind2) => {
  FoldingRangeKind2[FoldingRangeKind2["Comment"] = 1] = "Comment";
  FoldingRangeKind2[FoldingRangeKind2["Imports"] = 2] = "Imports";
  FoldingRangeKind2[FoldingRangeKind2["Region"] = 3] = "Region";
  return FoldingRangeKind2;
})(FoldingRangeKind || {});
var CommentThreadCollapsibleState = /* @__PURE__ */ ((CommentThreadCollapsibleState2) => {
  CommentThreadCollapsibleState2[CommentThreadCollapsibleState2["Collapsed"] = 0] = "Collapsed";
  CommentThreadCollapsibleState2[CommentThreadCollapsibleState2["Expanded"] = 1] = "Expanded";
  return CommentThreadCollapsibleState2;
})(CommentThreadCollapsibleState || {});
var CommentMode = /* @__PURE__ */ ((CommentMode2) => {
  CommentMode2[CommentMode2["Editing"] = 0] = "Editing";
  CommentMode2[CommentMode2["Preview"] = 1] = "Preview";
  return CommentMode2;
})(CommentMode || {});
var CommentState = /* @__PURE__ */ ((CommentState2) => {
  CommentState2[CommentState2["Published"] = 0] = "Published";
  CommentState2[CommentState2["Draft"] = 1] = "Draft";
  return CommentState2;
})(CommentState || {});
var CommentThreadState = /* @__PURE__ */ ((CommentThreadState2) => {
  CommentThreadState2[CommentThreadState2["Unresolved"] = 0] = "Unresolved";
  CommentThreadState2[CommentThreadState2["Resolved"] = 1] = "Resolved";
  return CommentThreadState2;
})(CommentThreadState || {});
var CommentThreadApplicability = /* @__PURE__ */ ((CommentThreadApplicability2) => {
  CommentThreadApplicability2[CommentThreadApplicability2["Current"] = 0] = "Current";
  CommentThreadApplicability2[CommentThreadApplicability2["Outdated"] = 1] = "Outdated";
  return CommentThreadApplicability2;
})(CommentThreadApplicability || {});
var CommentThreadFocus = /* @__PURE__ */ ((CommentThreadFocus2) => {
  CommentThreadFocus2[CommentThreadFocus2["Reply"] = 1] = "Reply";
  CommentThreadFocus2[CommentThreadFocus2["Comment"] = 2] = "Comment";
  return CommentThreadFocus2;
})(CommentThreadFocus || {});
class SemanticTokensLegend {
  constructor(tokenTypes, tokenModifiers = []) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
  }
}
function isStrArrayOrUndefined(arg) {
  return typeof arg === "undefined" || isStringArray(arg);
}
class SemanticTokensBuilder {
  constructor(legend) {
    this._prevLine = 0;
    this._prevChar = 0;
    this._dataIsSortedAndDeltaEncoded = true;
    this._data = [];
    this._dataLen = 0;
    this._tokenTypeStrToInt = /* @__PURE__ */ new Map();
    this._tokenModifierStrToInt = /* @__PURE__ */ new Map();
    this._hasLegend = false;
    if (legend) {
      this._hasLegend = true;
      for (let i = 0, len = legend.tokenTypes.length; i < len; i++) {
        this._tokenTypeStrToInt.set(legend.tokenTypes[i], i);
      }
      for (let i = 0, len = legend.tokenModifiers.length; i < len; i++) {
        this._tokenModifierStrToInt.set(legend.tokenModifiers[i], i);
      }
    }
  }
  push(arg0, arg1, arg2, arg3, arg4) {
    if (typeof arg0 === "number" && typeof arg1 === "number" && typeof arg2 === "number" && typeof arg3 === "number" && (typeof arg4 === "number" || typeof arg4 === "undefined")) {
      if (typeof arg4 === "undefined") {
        arg4 = 0;
      }
      return this._pushEncoded(arg0, arg1, arg2, arg3, arg4);
    }
    if (Range.isRange(arg0) && typeof arg1 === "string" && isStrArrayOrUndefined(arg2)) {
      return this._push(arg0, arg1, arg2);
    }
    throw illegalArgument();
  }
  _push(range, tokenType, tokenModifiers) {
    if (!this._hasLegend) {
      throw new Error("Legend must be provided in constructor");
    }
    if (range.start.line !== range.end.line) {
      throw new Error("`range` cannot span multiple lines");
    }
    if (!this._tokenTypeStrToInt.has(tokenType)) {
      throw new Error("`tokenType` is not in the provided legend");
    }
    const line = range.start.line;
    const char = range.start.character;
    const length = range.end.character - range.start.character;
    const nTokenType = this._tokenTypeStrToInt.get(tokenType);
    let nTokenModifiers = 0;
    if (tokenModifiers) {
      for (const tokenModifier of tokenModifiers) {
        if (!this._tokenModifierStrToInt.has(tokenModifier)) {
          throw new Error("`tokenModifier` is not in the provided legend");
        }
        const nTokenModifier = this._tokenModifierStrToInt.get(tokenModifier);
        nTokenModifiers |= 1 << nTokenModifier >>> 0;
      }
    }
    this._pushEncoded(line, char, length, nTokenType, nTokenModifiers);
  }
  _pushEncoded(line, char, length, tokenType, tokenModifiers) {
    if (this._dataIsSortedAndDeltaEncoded && (line < this._prevLine || line === this._prevLine && char < this._prevChar)) {
      this._dataIsSortedAndDeltaEncoded = false;
      const tokenCount = this._data.length / 5 | 0;
      let prevLine = 0;
      let prevChar = 0;
      for (let i = 0; i < tokenCount; i++) {
        let line2 = this._data[5 * i];
        let char2 = this._data[5 * i + 1];
        if (line2 === 0) {
          line2 = prevLine;
          char2 += prevChar;
        } else {
          line2 += prevLine;
        }
        this._data[5 * i] = line2;
        this._data[5 * i + 1] = char2;
        prevLine = line2;
        prevChar = char2;
      }
    }
    let pushLine = line;
    let pushChar = char;
    if (this._dataIsSortedAndDeltaEncoded && this._dataLen > 0) {
      pushLine -= this._prevLine;
      if (pushLine === 0) {
        pushChar -= this._prevChar;
      }
    }
    this._data[this._dataLen++] = pushLine;
    this._data[this._dataLen++] = pushChar;
    this._data[this._dataLen++] = length;
    this._data[this._dataLen++] = tokenType;
    this._data[this._dataLen++] = tokenModifiers;
    this._prevLine = line;
    this._prevChar = char;
  }
  static _sortAndDeltaEncode(data) {
    const pos = [];
    const tokenCount = data.length / 5 | 0;
    for (let i = 0; i < tokenCount; i++) {
      pos[i] = i;
    }
    pos.sort((a, b) => {
      const aLine = data[5 * a];
      const bLine = data[5 * b];
      if (aLine === bLine) {
        const aChar = data[5 * a + 1];
        const bChar = data[5 * b + 1];
        return aChar - bChar;
      }
      return aLine - bLine;
    });
    const result = new Uint32Array(data.length);
    let prevLine = 0;
    let prevChar = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 5 * pos[i];
      const line = data[srcOffset + 0];
      const char = data[srcOffset + 1];
      const length = data[srcOffset + 2];
      const tokenType = data[srcOffset + 3];
      const tokenModifiers = data[srcOffset + 4];
      const pushLine = line - prevLine;
      const pushChar = pushLine === 0 ? char - prevChar : char;
      const dstOffset = 5 * i;
      result[dstOffset + 0] = pushLine;
      result[dstOffset + 1] = pushChar;
      result[dstOffset + 2] = length;
      result[dstOffset + 3] = tokenType;
      result[dstOffset + 4] = tokenModifiers;
      prevLine = line;
      prevChar = char;
    }
    return result;
  }
  build(resultId) {
    if (!this._dataIsSortedAndDeltaEncoded) {
      return new SemanticTokens(SemanticTokensBuilder._sortAndDeltaEncode(this._data), resultId);
    }
    return new SemanticTokens(new Uint32Array(this._data), resultId);
  }
}
class SemanticTokens {
  constructor(data, resultId) {
    this.resultId = resultId;
    this.data = data;
  }
}
class SemanticTokensEdit {
  constructor(start, deleteCount, data) {
    this.start = start;
    this.deleteCount = deleteCount;
    this.data = data;
  }
}
class SemanticTokensEdits {
  constructor(edits, resultId) {
    this.resultId = resultId;
    this.edits = edits;
  }
}
var DebugConsoleMode = /* @__PURE__ */ ((DebugConsoleMode2) => {
  DebugConsoleMode2[DebugConsoleMode2["Separate"] = 0] = "Separate";
  DebugConsoleMode2[DebugConsoleMode2["MergeWithParent"] = 1] = "MergeWithParent";
  return DebugConsoleMode2;
})(DebugConsoleMode || {});
class DebugVisualization {
  constructor(name) {
    this.name = name;
  }
}
var QuickInputButtonLocation = /* @__PURE__ */ ((QuickInputButtonLocation2) => {
  QuickInputButtonLocation2[QuickInputButtonLocation2["Title"] = 1] = "Title";
  QuickInputButtonLocation2[QuickInputButtonLocation2["Inline"] = 2] = "Inline";
  QuickInputButtonLocation2[QuickInputButtonLocation2["Input"] = 3] = "Input";
  return QuickInputButtonLocation2;
})(QuickInputButtonLocation || {});
let QuickInputButtons = class {
  constructor() {
  }
};
QuickInputButtons.Back = { iconPath: new ThemeIcon("arrow-left") };
QuickInputButtons = __decorateClass([
  es5ClassCompat
], QuickInputButtons);
var QuickPickItemKind = /* @__PURE__ */ ((QuickPickItemKind2) => {
  QuickPickItemKind2[QuickPickItemKind2["Separator"] = -1] = "Separator";
  QuickPickItemKind2[QuickPickItemKind2["Default"] = 0] = "Default";
  return QuickPickItemKind2;
})(QuickPickItemKind || {});
var InputBoxValidationSeverity = /* @__PURE__ */ ((InputBoxValidationSeverity2) => {
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Info"] = 1] = "Info";
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Warning"] = 2] = "Warning";
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Error"] = 3] = "Error";
  return InputBoxValidationSeverity2;
})(InputBoxValidationSeverity || {});
var ExtensionKind = /* @__PURE__ */ ((ExtensionKind2) => {
  ExtensionKind2[ExtensionKind2["UI"] = 1] = "UI";
  ExtensionKind2[ExtensionKind2["Workspace"] = 2] = "Workspace";
  return ExtensionKind2;
})(ExtensionKind || {});
class FileDecoration {
  static validate(d) {
    if (typeof d.badge === "string") {
      let len = nextCharLength(d.badge, 0);
      if (len < d.badge.length) {
        len += nextCharLength(d.badge, len);
      }
      if (d.badge.length > len) {
        throw new Error(`The 'badge'-property must be undefined or a short character`);
      }
    } else if (d.badge) {
      if (!ThemeIcon.isThemeIcon(d.badge)) {
        throw new Error(`The 'badge'-property is not a valid ThemeIcon`);
      }
    }
    if (!d.color && !d.badge && !d.tooltip) {
      throw new Error(`The decoration is empty`);
    }
    return true;
  }
  constructor(badge, tooltip, color) {
    this.badge = badge;
    this.tooltip = tooltip;
    this.color = color;
  }
}
let ColorTheme = class {
  constructor(kind) {
    this.kind = kind;
  }
};
ColorTheme = __decorateClass([
  es5ClassCompat
], ColorTheme);
var ColorThemeKind = /* @__PURE__ */ ((ColorThemeKind2) => {
  ColorThemeKind2[ColorThemeKind2["Light"] = 1] = "Light";
  ColorThemeKind2[ColorThemeKind2["Dark"] = 2] = "Dark";
  ColorThemeKind2[ColorThemeKind2["HighContrast"] = 3] = "HighContrast";
  ColorThemeKind2[ColorThemeKind2["HighContrastLight"] = 4] = "HighContrastLight";
  return ColorThemeKind2;
})(ColorThemeKind || {});
class CellErrorStackFrame {
  /**
   * @param label The name of the stack frame
   * @param file The file URI of the stack frame
   * @param position The position of the stack frame within the file
   */
  constructor(label, uri, position) {
    this.label = label;
    this.uri = uri;
    this.position = position;
  }
}
var NotebookCellExecutionState = /* @__PURE__ */ ((NotebookCellExecutionState2) => {
  NotebookCellExecutionState2[NotebookCellExecutionState2["Idle"] = 1] = "Idle";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Pending"] = 2] = "Pending";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Executing"] = 3] = "Executing";
  return NotebookCellExecutionState2;
})(NotebookCellExecutionState || {});
var NotebookCellStatusBarAlignment = /* @__PURE__ */ ((NotebookCellStatusBarAlignment2) => {
  NotebookCellStatusBarAlignment2[NotebookCellStatusBarAlignment2["Left"] = 1] = "Left";
  NotebookCellStatusBarAlignment2[NotebookCellStatusBarAlignment2["Right"] = 2] = "Right";
  return NotebookCellStatusBarAlignment2;
})(NotebookCellStatusBarAlignment || {});
var NotebookEditorRevealType = /* @__PURE__ */ ((NotebookEditorRevealType2) => {
  NotebookEditorRevealType2[NotebookEditorRevealType2["Default"] = 0] = "Default";
  NotebookEditorRevealType2[NotebookEditorRevealType2["InCenter"] = 1] = "InCenter";
  NotebookEditorRevealType2[NotebookEditorRevealType2["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
  NotebookEditorRevealType2[NotebookEditorRevealType2["AtTop"] = 3] = "AtTop";
  return NotebookEditorRevealType2;
})(NotebookEditorRevealType || {});
class NotebookCellStatusBarItem {
  constructor(text, alignment) {
    this.text = text;
    this.alignment = alignment;
  }
}
var NotebookControllerAffinity = /* @__PURE__ */ ((NotebookControllerAffinity3) => {
  NotebookControllerAffinity3[NotebookControllerAffinity3["Default"] = 1] = "Default";
  NotebookControllerAffinity3[NotebookControllerAffinity3["Preferred"] = 2] = "Preferred";
  return NotebookControllerAffinity3;
})(NotebookControllerAffinity || {});
var NotebookControllerAffinity2 = /* @__PURE__ */ ((NotebookControllerAffinity22) => {
  NotebookControllerAffinity22[NotebookControllerAffinity22["Default"] = 1] = "Default";
  NotebookControllerAffinity22[NotebookControllerAffinity22["Preferred"] = 2] = "Preferred";
  NotebookControllerAffinity22[NotebookControllerAffinity22["Hidden"] = -1] = "Hidden";
  return NotebookControllerAffinity22;
})(NotebookControllerAffinity2 || {});
class NotebookRendererScript {
  constructor(uri, provides = []) {
    this.uri = uri;
    this.provides = asArray(provides);
  }
}
class NotebookKernelSourceAction {
  constructor(label) {
    this.label = label;
  }
}
var NotebookVariablesRequestKind = /* @__PURE__ */ ((NotebookVariablesRequestKind2) => {
  NotebookVariablesRequestKind2[NotebookVariablesRequestKind2["Named"] = 1] = "Named";
  NotebookVariablesRequestKind2[NotebookVariablesRequestKind2["Indexed"] = 2] = "Indexed";
  return NotebookVariablesRequestKind2;
})(NotebookVariablesRequestKind || {});
let TimelineItem = class {
  constructor(label, timestamp) {
    this.label = label;
    this.timestamp = timestamp;
  }
};
TimelineItem = __decorateClass([
  es5ClassCompat
], TimelineItem);
var ExtensionMode = /* @__PURE__ */ ((ExtensionMode2) => {
  ExtensionMode2[ExtensionMode2["Production"] = 1] = "Production";
  ExtensionMode2[ExtensionMode2["Development"] = 2] = "Development";
  ExtensionMode2[ExtensionMode2["Test"] = 3] = "Test";
  return ExtensionMode2;
})(ExtensionMode || {});
var ExtensionRuntime = /* @__PURE__ */ ((ExtensionRuntime2) => {
  ExtensionRuntime2[ExtensionRuntime2["Node"] = 1] = "Node";
  ExtensionRuntime2[ExtensionRuntime2["Webworker"] = 2] = "Webworker";
  return ExtensionRuntime2;
})(ExtensionRuntime || {});
var StandardTokenType = /* @__PURE__ */ ((StandardTokenType2) => {
  StandardTokenType2[StandardTokenType2["Other"] = 0] = "Other";
  StandardTokenType2[StandardTokenType2["Comment"] = 1] = "Comment";
  StandardTokenType2[StandardTokenType2["String"] = 2] = "String";
  StandardTokenType2[StandardTokenType2["RegEx"] = 3] = "RegEx";
  return StandardTokenType2;
})(StandardTokenType || {});
var SyntaxHighlightingTokenFontStyle = /* @__PURE__ */ ((SyntaxHighlightingTokenFontStyle2) => {
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["None"] = 0] = "None";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Italic"] = 1] = "Italic";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Bold"] = 2] = "Bold";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Underline"] = 4] = "Underline";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Strikethrough"] = 8] = "Strikethrough";
  return SyntaxHighlightingTokenFontStyle2;
})(SyntaxHighlightingTokenFontStyle || {});
class LinkedEditingRanges {
  constructor(ranges, wordPattern) {
    this.ranges = ranges;
    this.wordPattern = wordPattern;
  }
}
class PortAttributes {
  constructor(autoForwardAction) {
    this._autoForwardAction = autoForwardAction;
  }
  get autoForwardAction() {
    return this._autoForwardAction;
  }
}
var TestResultState = /* @__PURE__ */ ((TestResultState2) => {
  TestResultState2[TestResultState2["Queued"] = 1] = "Queued";
  TestResultState2[TestResultState2["Running"] = 2] = "Running";
  TestResultState2[TestResultState2["Passed"] = 3] = "Passed";
  TestResultState2[TestResultState2["Failed"] = 4] = "Failed";
  TestResultState2[TestResultState2["Skipped"] = 5] = "Skipped";
  TestResultState2[TestResultState2["Errored"] = 6] = "Errored";
  return TestResultState2;
})(TestResultState || {});
var TestRunProfileKind = /* @__PURE__ */ ((TestRunProfileKind2) => {
  TestRunProfileKind2[TestRunProfileKind2["Run"] = 1] = "Run";
  TestRunProfileKind2[TestRunProfileKind2["Debug"] = 2] = "Debug";
  TestRunProfileKind2[TestRunProfileKind2["Coverage"] = 3] = "Coverage";
  return TestRunProfileKind2;
})(TestRunProfileKind || {});
class TestRunProfileBase {
  constructor(controllerId, profileId, kind) {
    this.controllerId = controllerId;
    this.profileId = profileId;
    this.kind = kind;
  }
}
let TestRunRequest = class {
  constructor(include = void 0, exclude = void 0, profile = void 0, continuous = false, preserveFocus = true) {
    this.include = include;
    this.exclude = exclude;
    this.profile = profile;
    this.continuous = continuous;
    this.preserveFocus = preserveFocus;
  }
};
TestRunRequest = __decorateClass([
  es5ClassCompat
], TestRunRequest);
let TestMessage = class {
  constructor(message) {
    this.message = message;
  }
  static diff(message, expected, actual) {
    const msg = new TestMessage(message);
    msg.expectedOutput = expected;
    msg.actualOutput = actual;
    return msg;
  }
};
TestMessage = __decorateClass([
  es5ClassCompat
], TestMessage);
let TestTag = class {
  constructor(id) {
    this.id = id;
  }
};
TestTag = __decorateClass([
  es5ClassCompat
], TestTag);
class TestMessageStackFrame {
  /**
   * @param label The name of the stack frame
   * @param file The file URI of the stack frame
   * @param position The position of the stack frame within the file
   */
  constructor(label, uri, position) {
    this.label = label;
    this.uri = uri;
    this.position = position;
  }
}
class TestCoverageCount {
  constructor(covered, total) {
    this.covered = covered;
    this.total = total;
    validateTestCoverageCount(this);
  }
}
function validateTestCoverageCount(cc) {
  if (!cc) {
    return;
  }
  if (cc.covered > cc.total) {
    throw new Error(`The total number of covered items (${cc.covered}) cannot be greater than the total (${cc.total})`);
  }
  if (cc.total < 0) {
    throw new Error(`The number of covered items (${cc.total}) cannot be negative`);
  }
}
class FileCoverage {
  constructor(uri, statementCoverage, branchCoverage, declarationCoverage, includesTests = []) {
    this.uri = uri;
    this.statementCoverage = statementCoverage;
    this.branchCoverage = branchCoverage;
    this.declarationCoverage = declarationCoverage;
    this.includesTests = includesTests;
  }
  static fromDetails(uri, details) {
    const statements = new TestCoverageCount(0, 0);
    const branches = new TestCoverageCount(0, 0);
    const decl = new TestCoverageCount(0, 0);
    for (const detail of details) {
      if ("branches" in detail) {
        statements.total += 1;
        statements.covered += detail.executed ? 1 : 0;
        for (const branch of detail.branches) {
          branches.total += 1;
          branches.covered += branch.executed ? 1 : 0;
        }
      } else {
        decl.total += 1;
        decl.covered += detail.executed ? 1 : 0;
      }
    }
    const coverage = new FileCoverage(
      uri,
      statements,
      branches.total > 0 ? branches : void 0,
      decl.total > 0 ? decl : void 0
    );
    coverage.detailedCoverage = details;
    return coverage;
  }
}
class StatementCoverage {
  constructor(executed, location, branches = []) {
    this.executed = executed;
    this.location = location;
    this.branches = branches;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
class BranchCoverage {
  constructor(executed, location, label) {
    this.executed = executed;
    this.location = location;
    this.label = label;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
class DeclarationCoverage {
  constructor(name, executed, location) {
    this.name = name;
    this.executed = executed;
    this.location = location;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
var ExternalUriOpenerPriority = /* @__PURE__ */ ((ExternalUriOpenerPriority2) => {
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["None"] = 0] = "None";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Option"] = 1] = "Option";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Default"] = 2] = "Default";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Preferred"] = 3] = "Preferred";
  return ExternalUriOpenerPriority2;
})(ExternalUriOpenerPriority || {});
var WorkspaceTrustState = /* @__PURE__ */ ((WorkspaceTrustState2) => {
  WorkspaceTrustState2[WorkspaceTrustState2["Untrusted"] = 0] = "Untrusted";
  WorkspaceTrustState2[WorkspaceTrustState2["Trusted"] = 1] = "Trusted";
  WorkspaceTrustState2[WorkspaceTrustState2["Unspecified"] = 2] = "Unspecified";
  return WorkspaceTrustState2;
})(WorkspaceTrustState || {});
var PortAutoForwardAction = /* @__PURE__ */ ((PortAutoForwardAction2) => {
  PortAutoForwardAction2[PortAutoForwardAction2["Notify"] = 1] = "Notify";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenBrowser"] = 2] = "OpenBrowser";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenPreview"] = 3] = "OpenPreview";
  PortAutoForwardAction2[PortAutoForwardAction2["Silent"] = 4] = "Silent";
  PortAutoForwardAction2[PortAutoForwardAction2["Ignore"] = 5] = "Ignore";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenBrowserOnce"] = 6] = "OpenBrowserOnce";
  return PortAutoForwardAction2;
})(PortAutoForwardAction || {});
class TypeHierarchyItem {
  constructor(kind, name, detail, uri, range, selectionRange) {
    this.kind = kind;
    this.name = name;
    this.detail = detail;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
  }
}
class TextTabInput {
  constructor(uri) {
    this.uri = uri;
  }
}
class TextDiffTabInput {
  constructor(original, modified) {
    this.original = original;
    this.modified = modified;
  }
}
class TextMergeTabInput {
  constructor(base, input1, input2, result) {
    this.base = base;
    this.input1 = input1;
    this.input2 = input2;
    this.result = result;
  }
}
class CustomEditorTabInput {
  constructor(uri, viewType) {
    this.uri = uri;
    this.viewType = viewType;
  }
}
class WebviewEditorTabInput {
  constructor(viewType) {
    this.viewType = viewType;
  }
}
class NotebookEditorTabInput {
  constructor(uri, notebookType) {
    this.uri = uri;
    this.notebookType = notebookType;
  }
}
class NotebookDiffEditorTabInput {
  constructor(original, modified, notebookType) {
    this.original = original;
    this.modified = modified;
    this.notebookType = notebookType;
  }
}
class TerminalEditorTabInput {
  constructor() {
  }
}
class InteractiveWindowInput {
  constructor(uri, inputBoxUri) {
    this.uri = uri;
    this.inputBoxUri = inputBoxUri;
  }
}
class ChatEditorTabInput {
  constructor() {
  }
}
class TextMultiDiffTabInput {
  constructor(textDiffs) {
    this.textDiffs = textDiffs;
  }
}
var InteractiveSessionVoteDirection = /* @__PURE__ */ ((InteractiveSessionVoteDirection2) => {
  InteractiveSessionVoteDirection2[InteractiveSessionVoteDirection2["Down"] = 0] = "Down";
  InteractiveSessionVoteDirection2[InteractiveSessionVoteDirection2["Up"] = 1] = "Up";
  return InteractiveSessionVoteDirection2;
})(InteractiveSessionVoteDirection || {});
var ChatCopyKind = /* @__PURE__ */ ((ChatCopyKind2) => {
  ChatCopyKind2[ChatCopyKind2["Action"] = 1] = "Action";
  ChatCopyKind2[ChatCopyKind2["Toolbar"] = 2] = "Toolbar";
  return ChatCopyKind2;
})(ChatCopyKind || {});
var ChatVariableLevel = /* @__PURE__ */ ((ChatVariableLevel2) => {
  ChatVariableLevel2[ChatVariableLevel2["Short"] = 1] = "Short";
  ChatVariableLevel2[ChatVariableLevel2["Medium"] = 2] = "Medium";
  ChatVariableLevel2[ChatVariableLevel2["Full"] = 3] = "Full";
  return ChatVariableLevel2;
})(ChatVariableLevel || {});
class ChatCompletionItem {
  constructor(id, label, values) {
    this.id = id;
    this.label = label;
    this.values = values;
  }
}
var ChatEditingSessionActionOutcome = /* @__PURE__ */ ((ChatEditingSessionActionOutcome2) => {
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Accepted"] = 1] = "Accepted";
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Rejected"] = 2] = "Rejected";
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Saved"] = 3] = "Saved";
  return ChatEditingSessionActionOutcome2;
})(ChatEditingSessionActionOutcome || {});
var ChatRequestEditedFileEventKind = /* @__PURE__ */ ((ChatRequestEditedFileEventKind2) => {
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Keep"] = 1] = "Keep";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Undo"] = 2] = "Undo";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["UserModification"] = 3] = "UserModification";
  return ChatRequestEditedFileEventKind2;
})(ChatRequestEditedFileEventKind || {});
var InteractiveEditorResponseFeedbackKind = /* @__PURE__ */ ((InteractiveEditorResponseFeedbackKind2) => {
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Unhelpful"] = 0] = "Unhelpful";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Helpful"] = 1] = "Helpful";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Undone"] = 2] = "Undone";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Accepted"] = 3] = "Accepted";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Bug"] = 4] = "Bug";
  return InteractiveEditorResponseFeedbackKind2;
})(InteractiveEditorResponseFeedbackKind || {});
var ChatResultFeedbackKind = /* @__PURE__ */ ((ChatResultFeedbackKind2) => {
  ChatResultFeedbackKind2[ChatResultFeedbackKind2["Unhelpful"] = 0] = "Unhelpful";
  ChatResultFeedbackKind2[ChatResultFeedbackKind2["Helpful"] = 1] = "Helpful";
  return ChatResultFeedbackKind2;
})(ChatResultFeedbackKind || {});
class ChatResponseMarkdownPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseMarkdownWithVulnerabilitiesPart {
  constructor(value, vulnerabilities) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
    this.vulnerabilities = vulnerabilities;
  }
}
class ChatResponseConfirmationPart {
  constructor(title, message, data, buttons) {
    this.title = title;
    this.message = message;
    this.data = data;
    this.buttons = buttons;
  }
}
class ChatResponseFileTreePart {
  constructor(value, baseUri) {
    this.value = value;
    this.baseUri = baseUri;
  }
}
class ChatResponseMultiDiffPart {
  constructor(value, title, readOnly) {
    this.value = value;
    this.title = title;
    this.readOnly = readOnly;
  }
}
class McpToolInvocationContentData {
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
  }
}
class ChatSubagentToolInvocationData {
  constructor(description, agentName, prompt, result) {
    this.description = description;
    this.agentName = agentName;
    this.prompt = prompt;
    this.result = result;
  }
}
class ChatResponseExternalEditPart {
  constructor(uris, callback) {
    this.uris = uris;
    this.callback = callback;
    this.applied = new Promise((resolve) => {
      this.didGetApplied = resolve;
    });
  }
}
class ChatResponseAnchorPart {
  constructor(value, title) {
    this.value = value;
    this.value2 = value;
    this.title = title;
  }
}
class ChatResponseProgressPart {
  constructor(value) {
    this.value = value;
  }
}
class ChatResponseProgressPart2 {
  constructor(value, task) {
    this.value = value;
    this.task = task;
  }
}
class ChatResponseThinkingProgressPart {
  constructor(value, id, metadata) {
    this.value = value;
    this.id = id;
    this.metadata = metadata;
  }
}
class ChatResponseHookPart {
  constructor(hookType, stopReason, systemMessage, metadata) {
    this.hookType = hookType;
    this.stopReason = stopReason;
    this.systemMessage = systemMessage;
    this.metadata = metadata;
  }
}
class ChatResponseVoiceProgressPart {
  constructor(id, value) {
    this.id = id;
    this.value = value;
  }
}
class ChatResponseAutoModeResolutionPart {
  constructor(resolvedModel, resolvedModelName, predictedLabel, confidence) {
    this.resolvedModel = resolvedModel;
    this.resolvedModelName = resolvedModelName;
    this.predictedLabel = predictedLabel;
    this.confidence = confidence;
  }
}
class ChatResponseWarningPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseInfoPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseCommandButtonPart {
  constructor(value) {
    this.value = value;
  }
}
class ChatResponseReferencePart {
  constructor(value, iconPath, options) {
    this.value = value;
    this.iconPath = iconPath;
    this.options = options;
  }
}
class ChatResponseCodeblockUriPart {
  constructor(value, isEdit, undoStopId) {
    this.value = value;
    this.isEdit = isEdit;
    this.undoStopId = undoStopId;
  }
}
class ChatResponseCodeCitationPart {
  constructor(value, license, snippet) {
    this.value = value;
    this.license = license;
    this.snippet = snippet;
  }
}
class ChatResponseMovePart {
  constructor(uri, range) {
    this.uri = uri;
    this.range = range;
  }
}
class ChatResponseExtensionsPart {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class ChatResponsePullRequestPart {
  constructor(uriOrCommand, title, description, author, linkTag) {
    this.title = title;
    this.description = description;
    this.author = author;
    this.linkTag = linkTag;
    if (isUriComponents(uriOrCommand)) {
      this.uri = uriOrCommand;
      this.command = {
        title: "Open Pull Request",
        command: "vscode.open",
        arguments: [uriOrCommand]
      };
    } else {
      this.command = uriOrCommand;
    }
  }
  toJSON() {
    return {
      $mid: MarshalledId.ChatResponsePullRequestPart,
      uri: this.uri,
      title: this.title,
      description: this.description,
      author: this.author
    };
  }
}
var ChatQuestionType = /* @__PURE__ */ ((ChatQuestionType2) => {
  ChatQuestionType2[ChatQuestionType2["Text"] = 1] = "Text";
  ChatQuestionType2[ChatQuestionType2["SingleSelect"] = 2] = "SingleSelect";
  ChatQuestionType2[ChatQuestionType2["MultiSelect"] = 3] = "MultiSelect";
  return ChatQuestionType2;
})(ChatQuestionType || {});
class ChatQuestion {
  constructor(id, type, title, options) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.message = options?.message;
    this.options = options?.options;
    this.defaultValue = options?.defaultValue;
    this.allowFreeformInput = options?.allowFreeformInput;
  }
}
class ChatResponseQuestionCarouselPart {
  constructor(questions, allowSkip = true) {
    this.questions = questions;
    this.allowSkip = allowSkip;
  }
}
class ChatResponseTextEditPart {
  constructor(uri, editsOrDone) {
    this.uri = uri;
    if (editsOrDone === true) {
      this.isDone = true;
      this.edits = [];
    } else {
      this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];
    }
  }
}
class ChatResponseNotebookEditPart {
  constructor(uri, editsOrDone) {
    this.uri = uri;
    if (editsOrDone === true) {
      this.isDone = true;
      this.edits = [];
    } else {
      this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];
    }
  }
}
class ChatResponseWorkspaceEditPart {
  constructor(edits) {
    this.edits = edits;
  }
}
var ChatTodoStatus = /* @__PURE__ */ ((ChatTodoStatus2) => {
  ChatTodoStatus2[ChatTodoStatus2["NotStarted"] = 1] = "NotStarted";
  ChatTodoStatus2[ChatTodoStatus2["InProgress"] = 2] = "InProgress";
  ChatTodoStatus2[ChatTodoStatus2["Completed"] = 3] = "Completed";
  return ChatTodoStatus2;
})(ChatTodoStatus || {});
var ChatDebugSubagentStatus = /* @__PURE__ */ ((ChatDebugSubagentStatus2) => {
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Running"] = 0] = "Running";
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Completed"] = 1] = "Completed";
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Failed"] = 2] = "Failed";
  return ChatDebugSubagentStatus2;
})(ChatDebugSubagentStatus || {});
class ChatToolInvocationPart {
  constructor(toolName, toolCallId, errorMessage) {
    this.toolName = toolName;
    this.toolCallId = toolCallId;
    this.errorMessage = errorMessage;
  }
}
class ChatRequestTurn {
  constructor(prompt, command, references, participant, toolReferences, editedFileEvents, id, modelId, modeInstructions2) {
    this.prompt = prompt;
    this.command = command;
    this.references = references;
    this.participant = participant;
    this.toolReferences = toolReferences;
    this.editedFileEvents = editedFileEvents;
    this.id = id;
    this.modelId = modelId;
    this.modeInstructions2 = modeInstructions2;
  }
}
class ChatResponseTurn {
  constructor(response, result, participant, command) {
    this.response = response;
    this.result = result;
    this.participant = participant;
    this.command = command;
  }
}
class ChatResponseTurn2 {
  constructor(response, result, participant, command) {
    this.response = response;
    this.result = result;
    this.participant = participant;
    this.command = command;
  }
}
var ChatLocation = /* @__PURE__ */ ((ChatLocation2) => {
  ChatLocation2[ChatLocation2["Panel"] = 1] = "Panel";
  ChatLocation2[ChatLocation2["Terminal"] = 2] = "Terminal";
  ChatLocation2[ChatLocation2["Notebook"] = 3] = "Notebook";
  ChatLocation2[ChatLocation2["Editor"] = 4] = "Editor";
  return ChatLocation2;
})(ChatLocation || {});
var ChatSessionStatus = /* @__PURE__ */ ((ChatSessionStatus2) => {
  ChatSessionStatus2[ChatSessionStatus2["Failed"] = 0] = "Failed";
  ChatSessionStatus2[ChatSessionStatus2["Completed"] = 1] = "Completed";
  ChatSessionStatus2[ChatSessionStatus2["InProgress"] = 2] = "InProgress";
  ChatSessionStatus2[ChatSessionStatus2["NeedsInput"] = 3] = "NeedsInput";
  return ChatSessionStatus2;
})(ChatSessionStatus || {});
const _ChatSessionCustomizationType = class _ChatSessionCustomizationType {
  constructor(id) {
    this.id = id;
  }
};
_ChatSessionCustomizationType.Agent = new _ChatSessionCustomizationType("agent");
_ChatSessionCustomizationType.Skill = new _ChatSessionCustomizationType("skill");
_ChatSessionCustomizationType.Instructions = new _ChatSessionCustomizationType("instructions");
_ChatSessionCustomizationType.Prompt = new _ChatSessionCustomizationType("prompt");
_ChatSessionCustomizationType.Hook = new _ChatSessionCustomizationType("hook");
_ChatSessionCustomizationType.Plugins = new _ChatSessionCustomizationType("plugins");
let ChatSessionCustomizationType = _ChatSessionCustomizationType;
var ChatDebugLogLevel = /* @__PURE__ */ ((ChatDebugLogLevel2) => {
  ChatDebugLogLevel2[ChatDebugLogLevel2["Trace"] = 0] = "Trace";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Info"] = 1] = "Info";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Warning"] = 2] = "Warning";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Error"] = 3] = "Error";
  return ChatDebugLogLevel2;
})(ChatDebugLogLevel || {});
var ChatDebugToolCallResult = /* @__PURE__ */ ((ChatDebugToolCallResult2) => {
  ChatDebugToolCallResult2[ChatDebugToolCallResult2["Success"] = 0] = "Success";
  ChatDebugToolCallResult2[ChatDebugToolCallResult2["Error"] = 1] = "Error";
  return ChatDebugToolCallResult2;
})(ChatDebugToolCallResult || {});
var ChatDebugHookResult = /* @__PURE__ */ ((ChatDebugHookResult2) => {
  ChatDebugHookResult2[ChatDebugHookResult2["Success"] = 0] = "Success";
  ChatDebugHookResult2[ChatDebugHookResult2["Error"] = 1] = "Error";
  ChatDebugHookResult2[ChatDebugHookResult2["NonBlockingError"] = 2] = "NonBlockingError";
  return ChatDebugHookResult2;
})(ChatDebugHookResult || {});
class ChatDebugToolCallEvent {
  constructor(toolName, created) {
    this._kind = "toolCall";
    this.toolName = toolName;
    this.created = created;
  }
}
class ChatDebugModelTurnEvent {
  constructor(created) {
    this._kind = "modelTurn";
    this.created = created;
  }
}
class ChatDebugGenericEvent {
  constructor(name, level, created) {
    this._kind = "generic";
    this.name = name;
    this.level = level;
    this.created = created;
  }
}
class ChatDebugSubagentInvocationEvent {
  constructor(agentName, created) {
    this._kind = "subagentInvocation";
    this.agentName = agentName;
    this.created = created;
  }
}
class ChatDebugMessageSection {
  constructor(name, content) {
    this.name = name;
    this.content = content;
  }
}
class ChatDebugUserMessageEvent {
  constructor(message, created) {
    this._kind = "userMessage";
    this.message = message;
    this.created = created;
    this.sections = [];
  }
}
class ChatDebugAgentResponseEvent {
  constructor(message, created) {
    this._kind = "agentResponse";
    this.message = message;
    this.created = created;
    this.sections = [];
  }
}
class ChatDebugEventTextContent {
  constructor(value) {
    this._kind = "text";
    this.value = value;
  }
}
var ChatDebugMessageContentType = /* @__PURE__ */ ((ChatDebugMessageContentType2) => {
  ChatDebugMessageContentType2[ChatDebugMessageContentType2["User"] = 0] = "User";
  ChatDebugMessageContentType2[ChatDebugMessageContentType2["Agent"] = 1] = "Agent";
  return ChatDebugMessageContentType2;
})(ChatDebugMessageContentType || {});
class ChatDebugEventMessageContent {
  constructor(type, message, sections) {
    this._kind = "messageContent";
    this.type = type;
    this.message = message;
    this.sections = sections;
  }
}
class ChatDebugEventToolCallContent {
  constructor(toolName) {
    this._kind = "toolCallContent";
    this.toolName = toolName;
  }
}
class ChatDebugEventModelTurnContent {
  constructor(requestName) {
    this._kind = "modelTurnContent";
    this.requestName = requestName;
  }
}
class ChatDebugEventHookContent {
  constructor(hookType) {
    this._kind = "hookContent";
    this.hookType = hookType;
  }
}
class ChatSessionChangedFile {
  constructor(uri, originalUri, modifiedUri, insertions, deletions) {
    this.uri = uri;
    this.originalUri = originalUri;
    this.modifiedUri = modifiedUri;
    this.insertions = insertions;
    this.deletions = deletions;
  }
}
var ChatResponseReferencePartStatusKind = /* @__PURE__ */ ((ChatResponseReferencePartStatusKind2) => {
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Complete"] = 1] = "Complete";
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Partial"] = 2] = "Partial";
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Omitted"] = 3] = "Omitted";
  return ChatResponseReferencePartStatusKind2;
})(ChatResponseReferencePartStatusKind || {});
var ChatResponseClearToPreviousToolInvocationReason = /* @__PURE__ */ ((ChatResponseClearToPreviousToolInvocationReason2) => {
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["NoReason"] = 0] = "NoReason";
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["FilteredContentRetry"] = 1] = "FilteredContentRetry";
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["CopyrightContentRetry"] = 2] = "CopyrightContentRetry";
  return ChatResponseClearToPreviousToolInvocationReason2;
})(ChatResponseClearToPreviousToolInvocationReason || {});
class ChatRequestEditorData {
  constructor(editor, document, selection, wholeRange) {
    this.editor = editor;
    this.document = document;
    this.selection = selection;
    this.wholeRange = wholeRange;
  }
}
class ChatRequestNotebookData {
  constructor(cell) {
    this.cell = cell;
  }
}
class ChatReferenceBinaryData {
  constructor(mimeType, data, reference, isPasted, isURL) {
    this.mimeType = mimeType;
    this.data = data;
    this.reference = reference;
    this.isPasted = isPasted;
    this.isURL = isURL;
  }
}
class ChatReferenceDiagnostic {
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
  }
}
var LanguageModelChatMessageRole = /* @__PURE__ */ ((LanguageModelChatMessageRole2) => {
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["User"] = 1] = "User";
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["Assistant"] = 2] = "Assistant";
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["System"] = 3] = "System";
  return LanguageModelChatMessageRole2;
})(LanguageModelChatMessageRole || {});
class LanguageModelToolResultPart {
  constructor(callId, content, isError) {
    this.callId = callId;
    this.content = content;
    this.isError = isError ?? false;
  }
}
var ChatErrorLevel = /* @__PURE__ */ ((ChatErrorLevel2) => {
  ChatErrorLevel2[ChatErrorLevel2["Info"] = 0] = "Info";
  ChatErrorLevel2[ChatErrorLevel2["Warning"] = 1] = "Warning";
  ChatErrorLevel2[ChatErrorLevel2["Error"] = 2] = "Error";
  return ChatErrorLevel2;
})(ChatErrorLevel || {});
var ChatInputNotificationSeverity = /* @__PURE__ */ ((ChatInputNotificationSeverity2) => {
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Info"] = 0] = "Info";
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Warning"] = 1] = "Warning";
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Error"] = 2] = "Error";
  return ChatInputNotificationSeverity2;
})(ChatInputNotificationSeverity || {});
class LanguageModelChatMessage {
  constructor(role, content, name) {
    this._content = [];
    this.role = role;
    this.content = content;
    this.name = name;
  }
  static User(content, name) {
    return new LanguageModelChatMessage(1 /* User */, content, name);
  }
  static Assistant(content, name) {
    return new LanguageModelChatMessage(2 /* Assistant */, content, name);
  }
  set content(value) {
    if (typeof value === "string") {
      this._content = [new LanguageModelTextPart(value)];
    } else {
      this._content = value;
    }
  }
  get content() {
    return this._content;
  }
}
class LanguageModelChatMessage2 {
  constructor(role, content, name) {
    this._content = [];
    this.role = role;
    this.content = content;
    this.name = name;
  }
  static User(content, name) {
    return new LanguageModelChatMessage2(1 /* User */, content, name);
  }
  static Assistant(content, name) {
    return new LanguageModelChatMessage2(2 /* Assistant */, content, name);
  }
  set content(value) {
    if (typeof value === "string") {
      this._content = [new LanguageModelTextPart(value)];
    } else {
      this._content = value;
    }
  }
  get content() {
    return this._content;
  }
  // Temp to avoid breaking changes
  set content2(value) {
    if (value) {
      this.content = value.map((part) => {
        if (typeof part === "string") {
          return new LanguageModelTextPart(part);
        }
        return part;
      });
    }
  }
  get content2() {
    return this.content.map((part) => {
      if (part instanceof LanguageModelTextPart) {
        return part.value;
      }
      return part;
    });
  }
}
class LanguageModelToolCallPart {
  constructor(callId, name, input) {
    this.callId = callId;
    this.name = name;
    this.input = input;
  }
}
var LanguageModelPartAudience = /* @__PURE__ */ ((LanguageModelPartAudience2) => {
  LanguageModelPartAudience2[LanguageModelPartAudience2["Assistant"] = 0] = "Assistant";
  LanguageModelPartAudience2[LanguageModelPartAudience2["User"] = 1] = "User";
  LanguageModelPartAudience2[LanguageModelPartAudience2["Extension"] = 2] = "Extension";
  return LanguageModelPartAudience2;
})(LanguageModelPartAudience || {});
class LanguageModelTextPart {
  constructor(value, audience) {
    this.value = value;
    audience = audience;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelTextPart,
      value: this.value,
      audience: this.audience
    };
  }
}
class LanguageModelDataPart {
  constructor(data, mimeType, audience) {
    this.mimeType = mimeType;
    this.data = data;
    this.audience = audience;
  }
  static image(data, mimeType) {
    return new LanguageModelDataPart(data, mimeType);
  }
  static json(value, mime = "text/x-json") {
    const rawStr = JSON.stringify(value, void 0, "	");
    return new LanguageModelDataPart(VSBuffer.fromString(rawStr).buffer, mime);
  }
  static text(value, mime = Mimes.text) {
    return new LanguageModelDataPart(VSBuffer.fromString(value).buffer, mime);
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelDataPart,
      mimeType: this.mimeType,
      data: encodeBase64(VSBuffer.wrap(this.data)),
      audience: this.audience
    };
  }
}
var ChatImageMimeType = /* @__PURE__ */ ((ChatImageMimeType2) => {
  ChatImageMimeType2["PNG"] = "image/png";
  ChatImageMimeType2["JPEG"] = "image/jpeg";
  ChatImageMimeType2["GIF"] = "image/gif";
  ChatImageMimeType2["WEBP"] = "image/webp";
  ChatImageMimeType2["BMP"] = "image/bmp";
  return ChatImageMimeType2;
})(ChatImageMimeType || {});
class LanguageModelThinkingPart {
  constructor(value, id, metadata) {
    this.value = value;
    this.id = id;
    this.metadata = metadata;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelThinkingPart,
      value: this.value,
      id: this.id,
      metadata: this.metadata
    };
  }
}
class LanguageModelPromptTsxPart {
  constructor(value) {
    this.value = value;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelPromptTsxPart,
      value: this.value
    };
  }
}
class LanguageModelChatSystemMessage {
  constructor(content) {
    this.content = content;
  }
}
class LanguageModelChatUserMessage {
  constructor(content, name) {
    this.content = content;
    this.name = name;
  }
}
class LanguageModelChatAssistantMessage {
  constructor(content, name) {
    this.content = content;
    this.name = name;
  }
}
class LanguageModelError extends Error {
  static #name = "LanguageModelError";
  static NotFound(message) {
    return new LanguageModelError(message, LanguageModelError.NotFound.name);
  }
  static NoPermissions(message) {
    return new LanguageModelError(message, LanguageModelError.NoPermissions.name);
  }
  static Blocked(message) {
    return new LanguageModelError(message, LanguageModelError.Blocked.name);
  }
  static tryDeserialize(data) {
    if (data.name !== LanguageModelError.#name) {
      return void 0;
    }
    return new LanguageModelError(data.message, data.code, data.cause);
  }
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = LanguageModelError.#name;
    this.code = code ?? "";
  }
}
class LanguageModelToolResult {
  constructor(content) {
    this.content = content;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelToolResult,
      content: this.content
    };
  }
}
class LanguageModelToolResult2 {
  constructor(content) {
    this.content = content;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelToolResult,
      content: this.content
    };
  }
}
class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
}
var LanguageModelChatToolMode = /* @__PURE__ */ ((LanguageModelChatToolMode2) => {
  LanguageModelChatToolMode2[LanguageModelChatToolMode2["Auto"] = 1] = "Auto";
  LanguageModelChatToolMode2[LanguageModelChatToolMode2["Required"] = 2] = "Required";
  return LanguageModelChatToolMode2;
})(LanguageModelChatToolMode || {});
class LanguageModelToolExtensionSource {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
}
class LanguageModelToolMCPSource {
  constructor(label, name, instructions) {
    this.label = label;
    this.name = name;
    this.instructions = instructions;
  }
}
var RelatedInformationType = /* @__PURE__ */ ((RelatedInformationType2) => {
  RelatedInformationType2[RelatedInformationType2["SymbolInformation"] = 1] = "SymbolInformation";
  RelatedInformationType2[RelatedInformationType2["CommandInformation"] = 2] = "CommandInformation";
  RelatedInformationType2[RelatedInformationType2["SearchInformation"] = 3] = "SearchInformation";
  RelatedInformationType2[RelatedInformationType2["SettingInformation"] = 4] = "SettingInformation";
  return RelatedInformationType2;
})(RelatedInformationType || {});
var SettingsSearchResultKind = /* @__PURE__ */ ((SettingsSearchResultKind2) => {
  SettingsSearchResultKind2[SettingsSearchResultKind2["EMBEDDED"] = 1] = "EMBEDDED";
  SettingsSearchResultKind2[SettingsSearchResultKind2["LLM_RANKED"] = 2] = "LLM_RANKED";
  SettingsSearchResultKind2[SettingsSearchResultKind2["CANCELED"] = 3] = "CANCELED";
  return SettingsSearchResultKind2;
})(SettingsSearchResultKind || {});
var SpeechToTextStatus = /* @__PURE__ */ ((SpeechToTextStatus2) => {
  SpeechToTextStatus2[SpeechToTextStatus2["Started"] = 1] = "Started";
  SpeechToTextStatus2[SpeechToTextStatus2["Recognizing"] = 2] = "Recognizing";
  SpeechToTextStatus2[SpeechToTextStatus2["Recognized"] = 3] = "Recognized";
  SpeechToTextStatus2[SpeechToTextStatus2["Stopped"] = 4] = "Stopped";
  SpeechToTextStatus2[SpeechToTextStatus2["Error"] = 5] = "Error";
  return SpeechToTextStatus2;
})(SpeechToTextStatus || {});
var TextToSpeechStatus = /* @__PURE__ */ ((TextToSpeechStatus2) => {
  TextToSpeechStatus2[TextToSpeechStatus2["Started"] = 1] = "Started";
  TextToSpeechStatus2[TextToSpeechStatus2["Stopped"] = 2] = "Stopped";
  TextToSpeechStatus2[TextToSpeechStatus2["Error"] = 3] = "Error";
  return TextToSpeechStatus2;
})(TextToSpeechStatus || {});
var KeywordRecognitionStatus = /* @__PURE__ */ ((KeywordRecognitionStatus2) => {
  KeywordRecognitionStatus2[KeywordRecognitionStatus2["Recognized"] = 1] = "Recognized";
  KeywordRecognitionStatus2[KeywordRecognitionStatus2["Stopped"] = 2] = "Stopped";
  return KeywordRecognitionStatus2;
})(KeywordRecognitionStatus || {});
var McpToolAvailability = /* @__PURE__ */ ((McpToolAvailability2) => {
  McpToolAvailability2[McpToolAvailability2["Initial"] = 0] = "Initial";
  McpToolAvailability2[McpToolAvailability2["Dynamic"] = 1] = "Dynamic";
  return McpToolAvailability2;
})(McpToolAvailability || {});
class McpStdioServerDefinition {
  constructor(label, command, args, env = {}, version, metadata) {
    this.label = label;
    this.command = command;
    this.args = args;
    this.env = env;
    this.version = version;
    this.metadata = metadata;
  }
}
class McpHttpServerDefinition {
  constructor(label, uri, headers = {}, version, metadata, authentication) {
    this.label = label;
    this.uri = uri;
    this.headers = headers;
    this.version = version;
    this.metadata = metadata;
    this.authentication = authentication;
  }
}
export {
  BranchCoverage,
  Breakpoint,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CellErrorStackFrame,
  ChatCompletionItem,
  ChatCopyKind,
  ChatDebugAgentResponseEvent,
  ChatDebugEventHookContent,
  ChatDebugEventMessageContent,
  ChatDebugEventModelTurnContent,
  ChatDebugEventTextContent,
  ChatDebugEventToolCallContent,
  ChatDebugGenericEvent,
  ChatDebugHookResult,
  ChatDebugLogLevel,
  ChatDebugMessageContentType,
  ChatDebugMessageSection,
  ChatDebugModelTurnEvent,
  ChatDebugSubagentInvocationEvent,
  ChatDebugSubagentStatus,
  ChatDebugToolCallEvent,
  ChatDebugToolCallResult,
  ChatDebugUserMessageEvent,
  ChatEditingSessionActionOutcome,
  ChatEditorTabInput,
  ChatErrorLevel,
  ChatImageMimeType,
  ChatInputNotificationSeverity,
  ChatLocation,
  ChatQuestion,
  ChatQuestionType,
  ChatReferenceBinaryData,
  ChatReferenceDiagnostic,
  ChatRequestEditedFileEventKind,
  ChatRequestEditorData,
  ChatRequestNotebookData,
  ChatRequestTurn,
  ChatResponseAnchorPart,
  ChatResponseAutoModeResolutionPart,
  ChatResponseClearToPreviousToolInvocationReason,
  ChatResponseCodeCitationPart,
  ChatResponseCodeblockUriPart,
  ChatResponseCommandButtonPart,
  ChatResponseConfirmationPart,
  ChatResponseExtensionsPart,
  ChatResponseExternalEditPart,
  ChatResponseFileTreePart,
  ChatResponseHookPart,
  ChatResponseInfoPart,
  ChatResponseMarkdownPart,
  ChatResponseMarkdownWithVulnerabilitiesPart,
  ChatResponseMovePart,
  ChatResponseMultiDiffPart,
  ChatResponseNotebookEditPart,
  ChatResponseProgressPart,
  ChatResponseProgressPart2,
  ChatResponsePullRequestPart,
  ChatResponseQuestionCarouselPart,
  ChatResponseReferencePart,
  ChatResponseReferencePartStatusKind,
  ChatResponseTextEditPart,
  ChatResponseThinkingProgressPart,
  ChatResponseTurn,
  ChatResponseTurn2,
  ChatResponseVoiceProgressPart,
  ChatResponseWarningPart,
  ChatResponseWorkspaceEditPart,
  ChatResultFeedbackKind,
  ChatSessionChangedFile,
  ChatSessionCustomizationType,
  ChatSessionStatus,
  ChatSubagentToolInvocationData,
  ChatTodoStatus,
  ChatToolInvocationPart,
  ChatVariableLevel,
  CodeAction,
  CodeActionKind2 as CodeActionKind,
  CodeActionTriggerKind,
  CodeLens,
  Color,
  ColorFormat,
  ColorInformation,
  ColorPresentation,
  ColorTheme,
  ColorThemeKind,
  CommentMode,
  CommentState,
  CommentThreadApplicability,
  CommentThreadCollapsibleState,
  CommentThreadFocus,
  CommentThreadState,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionList,
  CompletionTriggerKind,
  ConfigurationTarget,
  CustomEditorTabInput,
  CustomExecution,
  DataBreakpoint,
  DataTransfer,
  DataTransferFile,
  DataTransferItem,
  DebugAdapterExecutable,
  DebugAdapterInlineImplementation,
  DebugAdapterNamedPipeServer,
  DebugAdapterServer,
  DebugConsoleMode,
  DebugStackFrame,
  DebugThread,
  DebugVisualization,
  DeclarationCoverage,
  DecorationRangeBehavior,
  Diagnostic2 as Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  Disposable,
  DocumentDropEdit,
  DocumentDropOrPasteEditKind,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentLink,
  DocumentPasteEdit,
  DocumentPasteTriggerKind,
  DocumentSymbol,
  EndOfLine,
  EnvironmentVariableMutatorType,
  EvaluatableExpression,
  ExtendedLanguageModelToolResult,
  ExtensionKind,
  ExtensionMode,
  ExtensionRuntime,
  ExternalUriOpenerPriority,
  FileChangeType,
  FileCoverage,
  FileDecoration,
  FileEditType,
  FileSystemError,
  FoldingRange,
  FoldingRangeKind,
  FunctionBreakpoint,
  Hover,
  HoverVerbosityAction,
  InlayHint,
  InlayHintKind,
  InlayHintLabelPart,
  InlineCompletionDisplayLocationKind,
  InlineCompletionEndOfLifeReasonKind,
  InlineCompletionTriggerKind,
  InlineCompletionsDisposeReasonKind,
  InlineSuggestion,
  InlineSuggestionList,
  InlineValueContext,
  InlineValueEvaluatableExpression,
  InlineValueText,
  InlineValueVariableLookup,
  InputBoxValidationSeverity,
  InteractiveEditorResponseFeedbackKind,
  InteractiveSessionVoteDirection,
  InteractiveWindowInput,
  InternalDataTransferItem,
  InternalFileDataTransferItem,
  KeywordRecognitionStatus,
  LanguageModelChatAssistantMessage,
  LanguageModelChatMessage,
  LanguageModelChatMessage2,
  LanguageModelChatMessageRole,
  LanguageModelChatSystemMessage,
  LanguageModelChatToolMode,
  LanguageModelChatUserMessage,
  LanguageModelDataPart,
  LanguageModelError,
  LanguageModelPartAudience,
  LanguageModelPromptTsxPart,
  LanguageModelTextPart,
  LanguageModelThinkingPart,
  LanguageModelToolCallPart,
  LanguageModelToolExtensionSource,
  LanguageModelToolMCPSource,
  LanguageModelToolResult,
  LanguageModelToolResult2,
  LanguageModelToolResultPart,
  LanguageStatusSeverity,
  LinkedEditingRanges,
  Location2 as Location,
  ManagedResolvedAuthority,
  MarkdownString2 as MarkdownString,
  McpHttpServerDefinition,
  McpStdioServerDefinition,
  McpToolAvailability,
  McpToolInvocationContentData,
  MultiDocumentHighlight,
  NewSymbolName,
  NewSymbolNameTag,
  NewSymbolNameTriggerKind,
  NotebookCellData,
  NotebookCellExecutionState,
  NotebookCellKind,
  NotebookCellOutput,
  NotebookCellOutputItem,
  NotebookCellStatusBarAlignment,
  NotebookCellStatusBarItem,
  NotebookControllerAffinity,
  NotebookControllerAffinity2,
  NotebookData,
  NotebookDiffEditorTabInput,
  NotebookEdit,
  NotebookEditorRevealType,
  NotebookEditorTabInput,
  NotebookKernelSourceAction,
  NotebookRange,
  NotebookRendererScript,
  NotebookVariablesRequestKind,
  ParameterInformation,
  PartialAcceptTriggerKind,
  PortAttributes,
  PortAutoForwardAction,
  Position2 as Position,
  ProcessExecution,
  ProgressLocation,
  QuickInputButtonLocation,
  QuickInputButtons,
  QuickPickItemKind,
  Range2 as Range,
  RelatedInformationType,
  RelativePattern,
  RemoteAuthorityResolverError,
  ResolvedAuthority,
  Selection,
  SelectionRange,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensEdit,
  SemanticTokensEdits,
  SemanticTokensLegend,
  SettingsSearchResultKind,
  ShellExecution,
  ShellQuoting,
  SignatureHelp,
  SignatureHelpTriggerKind,
  SignatureInformation,
  SnippetString2 as SnippetString,
  SnippetTextEdit,
  SourceBreakpoint,
  SourceControlInputBoxValidationType,
  SpeechToTextStatus,
  StandardTokenType,
  StatementCoverage,
  StatusBarAlignment,
  SymbolInformation,
  SymbolKind2 as SymbolKind,
  SymbolTag2 as SymbolTag,
  SyntaxHighlightingTokenFontStyle,
  SyntaxTokenType,
  Task,
  TaskEventKind,
  TaskGroup,
  TaskPanelKind,
  TaskRevealKind,
  TaskRunOn,
  TaskScope,
  TerminalCompletionItem,
  TerminalCompletionItemKind,
  TerminalCompletionList,
  TerminalEditorTabInput,
  TerminalExitReason,
  TerminalLink,
  TerminalLocation,
  TerminalOutputAnchor,
  TerminalProfile,
  TerminalQuickFixCommand,
  TerminalQuickFixOpener,
  TerminalQuickFixType,
  TerminalShellExecutionCommandLineConfidence,
  TerminalShellType,
  TestCoverageCount,
  TestMessage,
  TestMessageStackFrame,
  TestResultState,
  TestRunProfileBase,
  TestRunProfileKind,
  TestRunRequest,
  TestTag,
  TextDiffTabInput,
  TextDocumentChangeReason,
  TextDocumentSaveReason,
  TextEdit2 as TextEdit,
  TextEditorChangeKind,
  TextEditorLineNumbersStyle,
  TextEditorRevealType,
  TextEditorSelectionChangeKind,
  TextMergeTabInput,
  TextMultiDiffTabInput,
  TextTabInput,
  TextToSpeechStatus,
  ThemeColor,
  ThemeIcon,
  TimelineItem,
  TreeItem,
  TreeItemCheckboxState,
  TreeItemCollapsibleState,
  TypeHierarchyItem,
  VerboseHover,
  ViewBadge,
  ViewColumn,
  WebviewEditorTabInput,
  WorkspaceEdit2 as WorkspaceEdit,
  WorkspaceTrustState,
  asStatusBarItemIdentifier,
  setBreakpointId,
  validateTestCoverageCount
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaWxsZWdhbEFyZ3VtZW50LCBTZXJpYWxpemVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVJlbGF0aXZlUGF0dGVybiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IG5leHRDaGFyTGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciwgaXNPYmplY3QsIGlzU3RyaW5nLCBpc1N0cmluZ0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIG1hcmtBc0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJUmVsYXRpdmVQYXR0ZXJuRHRvIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvY29kZUFjdGlvbktpbmQuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpYyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL2RpYWdub3N0aWMuanMnO1xuaW1wb3J0IHsgZXM1Q2xhc3NDb21wYXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9lczVDbGFzc0NvbXBhdC5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL2xvY2F0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvbWFya2Rvd25TdHJpbmcuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3JhbmdlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRTdHJpbmcgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9zbmlwcGV0U3RyaW5nLmpzJztcbmltcG9ydCB7IFN5bWJvbEtpbmQsIFN5bWJvbFRhZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3N5bWJvbEluZm9ybWF0aW9uLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRWRpdCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3dvcmtzcGFjZUVkaXQuanMnO1xuaW1wb3J0IHsgSG9va1R5cGVWYWx1ZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5cbmV4cG9ydCB7IENvZGVBY3Rpb25LaW5kIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvY29kZUFjdGlvbktpbmQuanMnO1xuZXhwb3J0IHtcblx0RGlhZ25vc3RpYywgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbixcblx0RGlhZ25vc3RpY1NldmVyaXR5LCBEaWFnbm9zdGljVGFnXG59IGZyb20gJy4vZXh0SG9zdFR5cGVzL2RpYWdub3N0aWMuanMnO1xuZXhwb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9sb2NhdGlvbi5qcyc7XG5leHBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL21hcmtkb3duU3RyaW5nLmpzJztcbmV4cG9ydCB7IE5vdGVib29rQ2VsbERhdGEsIE5vdGVib29rQ2VsbEtpbmQsIE5vdGVib29rQ2VsbE91dHB1dCwgTm90ZWJvb2tDZWxsT3V0cHV0SXRlbSwgTm90ZWJvb2tEYXRhLCBOb3RlYm9va0VkaXQsIE5vdGVib29rUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9ub3RlYm9va3MuanMnO1xuZXhwb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9wb3NpdGlvbi5qcyc7XG5leHBvcnQgeyBSYW5nZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3JhbmdlLmpzJztcbmV4cG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3NlbGVjdGlvbi5qcyc7XG5leHBvcnQgeyBTbmlwcGV0U3RyaW5nIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvc25pcHBldFN0cmluZy5qcyc7XG5leHBvcnQgeyBTbmlwcGV0VGV4dEVkaXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9zbmlwcGV0VGV4dEVkaXQuanMnO1xuZXhwb3J0IHsgU3ltYm9sSW5mb3JtYXRpb24sIFN5bWJvbEtpbmQsIFN5bWJvbFRhZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3N5bWJvbEluZm9ybWF0aW9uLmpzJztcbmV4cG9ydCB7IEVuZE9mTGluZSwgVGV4dEVkaXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy90ZXh0RWRpdC5qcyc7XG5leHBvcnQgeyBGaWxlRWRpdFR5cGUsIFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy93b3Jrc3BhY2VFZGl0LmpzJztcblxuZXhwb3J0IGVudW0gVGVybWluYWxPdXRwdXRBbmNob3Ige1xuXHRUb3AgPSAwLFxuXHRCb3R0b20gPSAxXG59XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsUXVpY2tGaXhUeXBlIHtcblx0VGVybWluYWxDb21tYW5kID0gMCxcblx0T3BlbmVyID0gMSxcblx0Q29tbWFuZCA9IDNcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIGZyb20oLi4uaW5EaXNwb3NhYmxlczogeyBkaXNwb3NlKCk6IGFueSB9W10pOiBEaXNwb3NhYmxlIHtcblx0XHRsZXQgZGlzcG9zYWJsZXM6IFJlYWRvbmx5QXJyYXk8eyBkaXNwb3NlKCk6IGFueSB9PiB8IHVuZGVmaW5lZCA9IGluRGlzcG9zYWJsZXM7XG5cdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChkaXNwb3NhYmxlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0XHRpZiAoZGlzcG9zYWJsZSAmJiB0eXBlb2YgZGlzcG9zYWJsZS5kaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQjY2FsbE9uRGlzcG9zZT86ICgpID0+IGFueTtcblxuXHRjb25zdHJ1Y3RvcihjYWxsT25EaXNwb3NlOiAoKSA9PiBhbnkpIHtcblx0XHR0aGlzLiNjYWxsT25EaXNwb3NlID0gY2FsbE9uRGlzcG9zZTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogYW55IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuI2NhbGxPbkRpc3Bvc2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRoaXMuI2NhbGxPbkRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuI2NhbGxPbkRpc3Bvc2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IHZhbGlkYXRlQ29ubmVjdGlvblRva2VuID0gKGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nKSA9PiB7XG5cdGlmICh0eXBlb2YgY29ubmVjdGlvblRva2VuICE9PSAnc3RyaW5nJyB8fCBjb25uZWN0aW9uVG9rZW4ubGVuZ3RoID09PSAwIHx8ICEvXlswLTlBLVphLXpfXFwtXSskLy50ZXN0KGNvbm5lY3Rpb25Ub2tlbikpIHtcblx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2Nvbm5lY3Rpb25Ub2tlbicpO1xuXHR9XG59O1xuXG5cbmV4cG9ydCBjbGFzcyBSZXNvbHZlZEF1dGhvcml0eSB7XG5cdHB1YmxpYyBzdGF0aWMgaXNSZXNvbHZlZEF1dGhvcml0eShyZXNvbHZlZEF1dGhvcml0eTogYW55KTogcmVzb2x2ZWRBdXRob3JpdHkgaXMgUmVzb2x2ZWRBdXRob3JpdHkge1xuXHRcdHJldHVybiByZXNvbHZlZEF1dGhvcml0eVxuXHRcdFx0JiYgdHlwZW9mIHJlc29sdmVkQXV0aG9yaXR5ID09PSAnb2JqZWN0J1xuXHRcdFx0JiYgdHlwZW9mIHJlc29sdmVkQXV0aG9yaXR5Lmhvc3QgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2YgcmVzb2x2ZWRBdXRob3JpdHkucG9ydCA9PT0gJ251bWJlcidcblx0XHRcdCYmIChyZXNvbHZlZEF1dGhvcml0eS5jb25uZWN0aW9uVG9rZW4gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgcmVzb2x2ZWRBdXRob3JpdHkuY29ubmVjdGlvblRva2VuID09PSAnc3RyaW5nJyk7XG5cdH1cblxuXHRyZWFkb25seSBob3N0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBvcnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIsIGNvbm5lY3Rpb25Ub2tlbj86IHN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgaG9zdCAhPT0gJ3N0cmluZycgfHwgaG9zdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnaG9zdCcpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHBvcnQgIT09ICdudW1iZXInIHx8IHBvcnQgPT09IDAgfHwgTWF0aC5yb3VuZChwb3J0KSAhPT0gcG9ydCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdwb3J0Jyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgY29ubmVjdGlvblRva2VuICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dmFsaWRhdGVDb25uZWN0aW9uVG9rZW4oY29ubmVjdGlvblRva2VuKTtcblx0XHR9XG5cdFx0dGhpcy5ob3N0ID0gaG9zdDtcblx0XHR0aGlzLnBvcnQgPSBNYXRoLnJvdW5kKHBvcnQpO1xuXHRcdHRoaXMuY29ubmVjdGlvblRva2VuID0gY29ubmVjdGlvblRva2VuO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSB7XG5cblx0cHVibGljIHN0YXRpYyBpc01hbmFnZWRSZXNvbHZlZEF1dGhvcml0eShyZXNvbHZlZEF1dGhvcml0eTogYW55KTogcmVzb2x2ZWRBdXRob3JpdHkgaXMgTWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5IHtcblx0XHRyZXR1cm4gcmVzb2x2ZWRBdXRob3JpdHlcblx0XHRcdCYmIHR5cGVvZiByZXNvbHZlZEF1dGhvcml0eSA9PT0gJ29iamVjdCdcblx0XHRcdCYmIHR5cGVvZiByZXNvbHZlZEF1dGhvcml0eS5tYWtlQ29ubmVjdGlvbiA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0JiYgKHJlc29sdmVkQXV0aG9yaXR5LmNvbm5lY3Rpb25Ub2tlbiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiByZXNvbHZlZEF1dGhvcml0eS5jb25uZWN0aW9uVG9rZW4gPT09ICdzdHJpbmcnKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBtYWtlQ29ubmVjdGlvbjogKCkgPT4gVGhlbmFibGU8dnNjb2RlLk1hbmFnZWRNZXNzYWdlUGFzc2luZz4sIHB1YmxpYyByZWFkb25seSBjb25uZWN0aW9uVG9rZW4/OiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIGNvbm5lY3Rpb25Ub2tlbiAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHZhbGlkYXRlQ29ubmVjdGlvblRva2VuKGNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdHN0YXRpYyBOb3RBdmFpbGFibGUobWVzc2FnZT86IHN0cmluZywgaGFuZGxlZD86IGJvb2xlYW4pOiBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yIHtcblx0XHRyZXR1cm4gbmV3IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IobWVzc2FnZSwgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuTm90QXZhaWxhYmxlLCBoYW5kbGVkKTtcblx0fVxuXG5cdHN0YXRpYyBUZW1wb3JhcmlseU5vdEF2YWlsYWJsZShtZXNzYWdlPzogc3RyaW5nKTogUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKG1lc3NhZ2UsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLlRlbXBvcmFyaWx5Tm90QXZhaWxhYmxlKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBfbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgX2NvZGU6IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlO1xuXHRwdWJsaWMgcmVhZG9ubHkgX2RldGFpbDogdW5rbm93bjtcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlPzogc3RyaW5nLCBjb2RlOiBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSA9IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLlVua25vd24sIGRldGFpbD86IHVua25vd24pIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblxuXHRcdHRoaXMuX21lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX2NvZGUgPSBjb2RlO1xuXHRcdHRoaXMuX2RldGFpbCA9IGRldGFpbDtcblxuXHRcdC8vIHdvcmthcm91bmQgd2hlbiBleHRlbmRpbmcgYnVpbHRpbiBvYmplY3RzIGFuZCB3aGVuIGNvbXBpbGluZyB0byBFUzUsIHNlZTpcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQtd2lraS9ibG9iL21hc3Rlci9CcmVha2luZy1DaGFuZ2VzLm1kI2V4dGVuZGluZy1idWlsdC1pbnMtbGlrZS1lcnJvci1hcnJheS1hbmQtbWFwLW1heS1uby1sb25nZXItd29ya1xuXHRcdE9iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLnByb3RvdHlwZSk7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlIHtcblx0UmVwbGFjZSA9IDEsXG5cdEFwcGVuZCA9IDIsXG5cdFByZXBlbmQgPSAzXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIEhvdmVyIHtcblxuXHRwdWJsaWMgY29udGVudHM6ICh2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nKVtdO1xuXHRwdWJsaWMgcmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRlbnRzOiB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nIHwgKHZzY29kZS5NYXJrZG93blN0cmluZyB8IHZzY29kZS5NYXJrZWRTdHJpbmcpW10sXG5cdFx0cmFuZ2U/OiBSYW5nZVxuXHQpIHtcblx0XHRpZiAoIWNvbnRlbnRzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgYXJndW1lbnQsIGNvbnRlbnRzIG11c3QgYmUgZGVmaW5lZCcpO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheShjb250ZW50cykpIHtcblx0XHRcdHRoaXMuY29udGVudHMgPSBjb250ZW50cztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250ZW50cyA9IFtjb250ZW50c107XG5cdFx0fVxuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBWZXJib3NlSG92ZXIgZXh0ZW5kcyBIb3ZlciB7XG5cblx0cHVibGljIGNhbkluY3JlYXNlVmVyYm9zaXR5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgY2FuRGVjcmVhc2VWZXJib3NpdHk6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGVudHM6IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHZzY29kZS5NYXJrZWRTdHJpbmcgfCAodnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdnNjb2RlLk1hcmtlZFN0cmluZylbXSxcblx0XHRyYW5nZT86IFJhbmdlLFxuXHRcdGNhbkluY3JlYXNlVmVyYm9zaXR5PzogYm9vbGVhbixcblx0XHRjYW5EZWNyZWFzZVZlcmJvc2l0eT86IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRlbnRzLCByYW5nZSk7XG5cdFx0dGhpcy5jYW5JbmNyZWFzZVZlcmJvc2l0eSA9IGNhbkluY3JlYXNlVmVyYm9zaXR5O1xuXHRcdHRoaXMuY2FuRGVjcmVhc2VWZXJib3NpdHkgPSBjYW5EZWNyZWFzZVZlcmJvc2l0eTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBIb3ZlclZlcmJvc2l0eUFjdGlvbiB7XG5cdEluY3JlYXNlID0gMCxcblx0RGVjcmVhc2UgPSAxXG59XG5cbmV4cG9ydCBlbnVtIERvY3VtZW50SGlnaGxpZ2h0S2luZCB7XG5cdFRleHQgPSAwLFxuXHRSZWFkID0gMSxcblx0V3JpdGUgPSAyXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERvY3VtZW50SGlnaGxpZ2h0IHtcblxuXHRyYW5nZTogUmFuZ2U7XG5cdGtpbmQ6IERvY3VtZW50SGlnaGxpZ2h0S2luZDtcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIGtpbmQ6IERvY3VtZW50SGlnaGxpZ2h0S2luZCA9IERvY3VtZW50SGlnaGxpZ2h0S2luZC5UZXh0KSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdH1cblxuXHR0b0pTT04oKTogYW55IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IHRoaXMucmFuZ2UsXG5cdFx0XHRraW5kOiBEb2N1bWVudEhpZ2hsaWdodEtpbmRbdGhpcy5raW5kXVxuXHRcdH07XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgTXVsdGlEb2N1bWVudEhpZ2hsaWdodCB7XG5cblx0dXJpOiBVUkk7XG5cdGhpZ2hsaWdodHM6IERvY3VtZW50SGlnaGxpZ2h0W107XG5cblx0Y29uc3RydWN0b3IodXJpOiBVUkksIGhpZ2hsaWdodHM6IERvY3VtZW50SGlnaGxpZ2h0W10pIHtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHR0aGlzLmhpZ2hsaWdodHMgPSBoaWdobGlnaHRzO1xuXHR9XG5cblx0dG9KU09OKCk6IGFueSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogdGhpcy51cmksXG5cdFx0XHRoaWdobGlnaHRzOiB0aGlzLmhpZ2hsaWdodHMubWFwKGggPT4gaC50b0pTT04oKSlcblx0XHR9O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERvY3VtZW50U3ltYm9sIHtcblxuXHRzdGF0aWMgdmFsaWRhdGUoY2FuZGlkYXRlOiBEb2N1bWVudFN5bWJvbCk6IHZvaWQge1xuXHRcdGlmICghY2FuZGlkYXRlLm5hbWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbmFtZSBtdXN0IG5vdCBiZSBmYWxzeScpO1xuXHRcdH1cblx0XHRpZiAoIWNhbmRpZGF0ZS5yYW5nZS5jb250YWlucyhjYW5kaWRhdGUuc2VsZWN0aW9uUmFuZ2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3NlbGVjdGlvblJhbmdlIG11c3QgYmUgY29udGFpbmVkIGluIGZ1bGxSYW5nZScpO1xuXHRcdH1cblx0XHRjYW5kaWRhdGUuY2hpbGRyZW4/LmZvckVhY2goRG9jdW1lbnRTeW1ib2wudmFsaWRhdGUpO1xuXHR9XG5cblx0bmFtZTogc3RyaW5nO1xuXHRkZXRhaWw6IHN0cmluZztcblx0a2luZDogU3ltYm9sS2luZDtcblx0dGFncz86IFN5bWJvbFRhZ1tdO1xuXHRyYW5nZTogUmFuZ2U7XG5cdHNlbGVjdGlvblJhbmdlOiBSYW5nZTtcblx0Y2hpbGRyZW46IERvY3VtZW50U3ltYm9sW107XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZywga2luZDogU3ltYm9sS2luZCwgcmFuZ2U6IFJhbmdlLCBzZWxlY3Rpb25SYW5nZTogUmFuZ2UpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMuZGV0YWlsID0gZGV0YWlsO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuc2VsZWN0aW9uUmFuZ2UgPSBzZWxlY3Rpb25SYW5nZTtcblx0XHR0aGlzLmNoaWxkcmVuID0gW107XG5cblx0XHREb2N1bWVudFN5bWJvbC52YWxpZGF0ZSh0aGlzKTtcblx0fVxufVxuXG5cbmV4cG9ydCBlbnVtIENvZGVBY3Rpb25UcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDEsXG5cdEF1dG9tYXRpYyA9IDIsXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvZGVBY3Rpb24ge1xuXHR0aXRsZTogc3RyaW5nO1xuXG5cdGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZDtcblxuXHRlZGl0PzogV29ya3NwYWNlRWRpdDtcblxuXHRkaWFnbm9zdGljcz86IERpYWdub3N0aWNbXTtcblxuXHRraW5kPzogQ29kZUFjdGlvbktpbmQ7XG5cblx0aXNQcmVmZXJyZWQ/OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHRpdGxlOiBzdHJpbmcsIGtpbmQ/OiBDb2RlQWN0aW9uS2luZCkge1xuXHRcdHRoaXMudGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvblJhbmdlIHtcblxuXHRyYW5nZTogUmFuZ2U7XG5cdHBhcmVudD86IFNlbGVjdGlvblJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgcGFyZW50PzogU2VsZWN0aW9uUmFuZ2UpIHtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cblx0XHRpZiAocGFyZW50ICYmICFwYXJlbnQucmFuZ2UuY29udGFpbnModGhpcy5yYW5nZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudDogcGFyZW50IG11c3QgY29udGFpbiB0aGlzIHJhbmdlJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDYWxsSGllcmFyY2h5SXRlbSB7XG5cblx0X3Nlc3Npb25JZD86IHN0cmluZztcblx0X2l0ZW1JZD86IHN0cmluZztcblxuXHRraW5kOiBTeW1ib2xLaW5kO1xuXHR0YWdzPzogU3ltYm9sVGFnW107XG5cdG5hbWU6IHN0cmluZztcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHR1cmk6IFVSSTtcblx0cmFuZ2U6IFJhbmdlO1xuXHRzZWxlY3Rpb25SYW5nZTogUmFuZ2U7XG5cblx0Y29uc3RydWN0b3Ioa2luZDogU3ltYm9sS2luZCwgbmFtZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZywgdXJpOiBVUkksIHJhbmdlOiBSYW5nZSwgc2VsZWN0aW9uUmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMuZGV0YWlsID0gZGV0YWlsO1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLnNlbGVjdGlvblJhbmdlID0gc2VsZWN0aW9uUmFuZ2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwge1xuXG5cdGZyb206IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbTtcblx0ZnJvbVJhbmdlczogdnNjb2RlLlJhbmdlW107XG5cblx0Y29uc3RydWN0b3IoaXRlbTogdnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtLCBmcm9tUmFuZ2VzOiB2c2NvZGUuUmFuZ2VbXSkge1xuXHRcdHRoaXMuZnJvbVJhbmdlcyA9IGZyb21SYW5nZXM7XG5cdFx0dGhpcy5mcm9tID0gaXRlbTtcblx0fVxufVxuZXhwb3J0IGNsYXNzIENhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwge1xuXG5cdHRvOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW07XG5cdGZyb21SYW5nZXM6IHZzY29kZS5SYW5nZVtdO1xuXG5cdGNvbnN0cnVjdG9yKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgZnJvbVJhbmdlczogdnNjb2RlLlJhbmdlW10pIHtcblx0XHR0aGlzLmZyb21SYW5nZXMgPSBmcm9tUmFuZ2VzO1xuXHRcdHRoaXMudG8gPSBpdGVtO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIExhbmd1YWdlU3RhdHVzU2V2ZXJpdHkge1xuXHRJbmZvcm1hdGlvbiA9IDAsXG5cdFdhcm5pbmcgPSAxLFxuXHRFcnJvciA9IDJcbn1cblxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb2RlTGVucyB7XG5cblx0cmFuZ2U6IFJhbmdlO1xuXG5cdGNvbW1hbmQ6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgY29tbWFuZD86IHZzY29kZS5Db21tYW5kKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuY29tbWFuZCA9IGNvbW1hbmQ7XG5cdH1cblxuXHRnZXQgaXNSZXNvbHZlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmNvbW1hbmQ7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgUGFyYW1ldGVySW5mb3JtYXRpb24ge1xuXG5cdGxhYmVsOiBzdHJpbmcgfCBbbnVtYmVyLCBudW1iZXJdO1xuXHRkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcgfCBbbnVtYmVyLCBudW1iZXJdLCBkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuZG9jdW1lbnRhdGlvbiA9IGRvY3VtZW50YXRpb247XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgU2lnbmF0dXJlSW5mb3JtYXRpb24ge1xuXG5cdGxhYmVsOiBzdHJpbmc7XG5cdGRvY3VtZW50YXRpb24/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdHBhcmFtZXRlcnM6IFBhcmFtZXRlckluZm9ybWF0aW9uW107XG5cdGFjdGl2ZVBhcmFtZXRlcj86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihsYWJlbDogc3RyaW5nLCBkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuZG9jdW1lbnRhdGlvbiA9IGRvY3VtZW50YXRpb247XG5cdFx0dGhpcy5wYXJhbWV0ZXJzID0gW107XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgU2lnbmF0dXJlSGVscCB7XG5cblx0c2lnbmF0dXJlczogU2lnbmF0dXJlSW5mb3JtYXRpb25bXTtcblx0YWN0aXZlU2lnbmF0dXJlOiBudW1iZXIgPSAwO1xuXHRhY3RpdmVQYXJhbWV0ZXI6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5zaWduYXR1cmVzID0gW107XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kIHtcblx0SW52b2tlID0gMSxcblx0VHJpZ2dlckNoYXJhY3RlciA9IDIsXG5cdENvbnRlbnRDaGFuZ2UgPSAzLFxufVxuXG5cbmV4cG9ydCBlbnVtIElubGF5SGludEtpbmQge1xuXHRUeXBlID0gMSxcblx0UGFyYW1ldGVyID0gMixcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5sYXlIaW50TGFiZWxQYXJ0IHtcblxuXHR2YWx1ZTogc3RyaW5nO1xuXHR0b29sdGlwPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRsb2NhdGlvbj86IExvY2F0aW9uO1xuXHRjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQ7XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxheUhpbnQgaW1wbGVtZW50cyB2c2NvZGUuSW5sYXlIaW50IHtcblxuXHRsYWJlbDogc3RyaW5nIHwgSW5sYXlIaW50TGFiZWxQYXJ0W107XG5cdHRvb2x0aXA/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0dGV4dEVkaXRzPzogVGV4dEVkaXRbXTtcblx0a2luZD86IHZzY29kZS5JbmxheUhpbnRLaW5kO1xuXHRwYWRkaW5nTGVmdD86IGJvb2xlYW47XG5cdHBhZGRpbmdSaWdodD86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocG9zaXRpb246IFBvc2l0aW9uLCBsYWJlbDogc3RyaW5nIHwgSW5sYXlIaW50TGFiZWxQYXJ0W10sIGtpbmQ/OiB2c2NvZGUuSW5sYXlIaW50S2luZCkge1xuXHRcdHRoaXMucG9zaXRpb24gPSBwb3NpdGlvbjtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBDb21wbGV0aW9uVHJpZ2dlcktpbmQge1xuXHRJbnZva2UgPSAwLFxuXHRUcmlnZ2VyQ2hhcmFjdGVyID0gMSxcblx0VHJpZ2dlckZvckluY29tcGxldGVDb21wbGV0aW9ucyA9IDJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21wbGV0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQ7XG5cdHJlYWRvbmx5IHRyaWdnZXJDaGFyYWN0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGVudW0gQ29tcGxldGlvbkl0ZW1LaW5kIHtcblx0VGV4dCA9IDAsXG5cdE1ldGhvZCA9IDEsXG5cdEZ1bmN0aW9uID0gMixcblx0Q29uc3RydWN0b3IgPSAzLFxuXHRGaWVsZCA9IDQsXG5cdFZhcmlhYmxlID0gNSxcblx0Q2xhc3MgPSA2LFxuXHRJbnRlcmZhY2UgPSA3LFxuXHRNb2R1bGUgPSA4LFxuXHRQcm9wZXJ0eSA9IDksXG5cdFVuaXQgPSAxMCxcblx0VmFsdWUgPSAxMSxcblx0RW51bSA9IDEyLFxuXHRLZXl3b3JkID0gMTMsXG5cdFNuaXBwZXQgPSAxNCxcblx0Q29sb3IgPSAxNSxcblx0RmlsZSA9IDE2LFxuXHRSZWZlcmVuY2UgPSAxNyxcblx0Rm9sZGVyID0gMTgsXG5cdEVudW1NZW1iZXIgPSAxOSxcblx0Q29uc3RhbnQgPSAyMCxcblx0U3RydWN0ID0gMjEsXG5cdEV2ZW50ID0gMjIsXG5cdE9wZXJhdG9yID0gMjMsXG5cdFR5cGVQYXJhbWV0ZXIgPSAyNCxcblx0VXNlciA9IDI1LFxuXHRJc3N1ZSA9IDI2XG59XG5cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25JdGVtVGFnIHtcblx0RGVwcmVjYXRlZCA9IDEsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGxldGlvbkl0ZW1MYWJlbCB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25JdGVtIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtIHtcblxuXHRsYWJlbDogc3RyaW5nIHwgQ29tcGxldGlvbkl0ZW1MYWJlbDtcblx0a2luZD86IENvbXBsZXRpb25JdGVtS2luZDtcblx0dGFncz86IENvbXBsZXRpb25JdGVtVGFnW107XG5cdGRldGFpbD86IHN0cmluZztcblx0ZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0c29ydFRleHQ/OiBzdHJpbmc7XG5cdGZpbHRlclRleHQ/OiBzdHJpbmc7XG5cdHByZXNlbGVjdD86IGJvb2xlYW47XG5cdGluc2VydFRleHQ/OiBzdHJpbmcgfCBTbmlwcGV0U3RyaW5nO1xuXHRrZWVwV2hpdGVzcGFjZT86IGJvb2xlYW47XG5cdHJhbmdlPzogUmFuZ2UgfCB7IGluc2VydGluZzogUmFuZ2U7IHJlcGxhY2luZzogUmFuZ2UgfTtcblx0Y29tbWl0Q2hhcmFjdGVycz86IHN0cmluZ1tdO1xuXHR0ZXh0RWRpdD86IFRleHRFZGl0O1xuXHRhZGRpdGlvbmFsVGV4dEVkaXRzPzogVGV4dEVkaXRbXTtcblx0Y29tbWFuZD86IHZzY29kZS5Db21tYW5kO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUxhYmVsLCBraW5kPzogQ29tcGxldGlvbkl0ZW1LaW5kKSB7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdH1cblxuXHR0b0pTT04oKTogYW55IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHRraW5kOiB0aGlzLmtpbmQgJiYgQ29tcGxldGlvbkl0ZW1LaW5kW3RoaXMua2luZF0sXG5cdFx0XHRkZXRhaWw6IHRoaXMuZGV0YWlsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogdGhpcy5kb2N1bWVudGF0aW9uLFxuXHRcdFx0c29ydFRleHQ6IHRoaXMuc29ydFRleHQsXG5cdFx0XHRmaWx0ZXJUZXh0OiB0aGlzLmZpbHRlclRleHQsXG5cdFx0XHRwcmVzZWxlY3Q6IHRoaXMucHJlc2VsZWN0LFxuXHRcdFx0aW5zZXJ0VGV4dDogdGhpcy5pbnNlcnRUZXh0LFxuXHRcdFx0dGV4dEVkaXQ6IHRoaXMudGV4dEVkaXRcblx0XHR9O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25MaXN0IHtcblxuXHRpc0luY29tcGxldGU/OiBib29sZWFuO1xuXHRpdGVtczogdnNjb2RlLkNvbXBsZXRpb25JdGVtW107XG5cblx0Y29uc3RydWN0b3IoaXRlbXM6IHZzY29kZS5Db21wbGV0aW9uSXRlbVtdID0gW10sIGlzSW5jb21wbGV0ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0dGhpcy5pdGVtcyA9IGl0ZW1zO1xuXHRcdHRoaXMuaXNJbmNvbXBsZXRlID0gaXNJbmNvbXBsZXRlO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIElubGluZVN1Z2dlc3Rpb24gaW1wbGVtZW50cyB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW0ge1xuXG5cdGZpbHRlclRleHQ/OiBzdHJpbmc7XG5cdGluc2VydFRleHQ6IHN0cmluZztcblx0cmFuZ2U/OiBSYW5nZTtcblx0Y29tbWFuZD86IHZzY29kZS5Db21tYW5kO1xuXG5cdGNvbnN0cnVjdG9yKGluc2VydFRleHQ6IHN0cmluZywgcmFuZ2U/OiBSYW5nZSwgY29tbWFuZD86IHZzY29kZS5Db21tYW5kKSB7XG5cdFx0dGhpcy5pbnNlcnRUZXh0ID0gaW5zZXJ0VGV4dDtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5jb21tYW5kID0gY29tbWFuZDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uTGlzdCBpbXBsZW1lbnRzIHZzY29kZS5JbmxpbmVDb21wbGV0aW9uTGlzdCB7XG5cdGl0ZW1zOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1bXTtcblxuXHRjb21tYW5kczogKHZzY29kZS5Db21tYW5kIHwgeyBjb21tYW5kOiB2c2NvZGUuQ29tbWFuZDsgaWNvbjogdnNjb2RlLlRoZW1lSWNvbiB9KVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHN1cHByZXNzU3VnZ2VzdGlvbnM6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoaXRlbXM6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uSXRlbVtdKSB7XG5cdFx0dGhpcy5pdGVtcyA9IGl0ZW1zO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFydGlhbEFjY2VwdEluZm8ge1xuXHRraW5kOiBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQ7XG5cdGFjY2VwdGVkTGVuZ3RoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBlbnVtIFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCB7XG5cdFVua25vd24gPSAwLFxuXHRXb3JkID0gMSxcblx0TGluZSA9IDIsXG5cdFN1Z2dlc3QgPSAzLFxufVxuXG5leHBvcnQgZW51bSBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCB7XG5cdEFjY2VwdGVkID0gMCxcblx0UmVqZWN0ZWQgPSAxLFxuXHRJZ25vcmVkID0gMixcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQge1xuXHRDb2RlID0gMSxcblx0TGFiZWwgPSAyXG59XG5cbmV4cG9ydCBlbnVtIFZpZXdDb2x1bW4ge1xuXHRBY3RpdmUgPSAtMSxcblx0QmVzaWRlID0gLTIsXG5cdE9uZSA9IDEsXG5cdFR3byA9IDIsXG5cdFRocmVlID0gMyxcblx0Rm91ciA9IDQsXG5cdEZpdmUgPSA1LFxuXHRTaXggPSA2LFxuXHRTZXZlbiA9IDcsXG5cdEVpZ2h0ID0gOCxcblx0TmluZSA9IDlcbn1cblxuZXhwb3J0IGVudW0gU3RhdHVzQmFyQWxpZ25tZW50IHtcblx0TGVmdCA9IDEsXG5cdFJpZ2h0ID0gMlxufVxuXG5leHBvcnQgZnVuY3Rpb24gYXNTdGF0dXNCYXJJdGVtSWRlbnRpZmllcihleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIsIGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7RXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb24pfS4ke2lkfWA7XG59XG5cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIHtcblx0T2ZmID0gMCxcblx0T24gPSAxLFxuXHRSZWxhdGl2ZSA9IDIsXG5cdEludGVydmFsID0gM1xufVxuXG5leHBvcnQgZW51bSBUZXh0RG9jdW1lbnRTYXZlUmVhc29uIHtcblx0TWFudWFsID0gMSxcblx0QWZ0ZXJEZWxheSA9IDIsXG5cdEZvY3VzT3V0ID0gM1xufVxuXG5leHBvcnQgZW51bSBUZXh0RWRpdG9yUmV2ZWFsVHlwZSB7XG5cdERlZmF1bHQgPSAwLFxuXHRJbkNlbnRlciA9IDEsXG5cdEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQgPSAyLFxuXHRBdFRvcCA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGV4dEVkaXRvclNlbGVjdGlvbkNoYW5nZUtpbmQge1xuXHRLZXlib2FyZCA9IDEsXG5cdE1vdXNlID0gMixcblx0Q29tbWFuZCA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGV4dEVkaXRvckNoYW5nZUtpbmQge1xuXHRBZGRpdGlvbiA9IDEsXG5cdERlbGV0aW9uID0gMixcblx0TW9kaWZpY2F0aW9uID0gM1xufVxuXG5leHBvcnQgZW51bSBUZXh0RG9jdW1lbnRDaGFuZ2VSZWFzb24ge1xuXHRVbmRvID0gMSxcblx0UmVkbyA9IDIsXG59XG5cbi8qKlxuICogVGhlc2UgdmFsdWVzIG1hdGNoIHZlcnkgY2FyZWZ1bGx5IHRoZSB2YWx1ZXMgb2YgYFRyYWNrZWRSYW5nZVN0aWNraW5lc3NgXG4gKi9cbmV4cG9ydCBlbnVtIERlY29yYXRpb25SYW5nZUJlaGF2aW9yIHtcblx0LyoqXG5cdCAqIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHQgKi9cblx0T3Blbk9wZW4gPSAwLFxuXHQvKipcblx0ICogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0ICovXG5cdENsb3NlZENsb3NlZCA9IDEsXG5cdC8qKlxuXHQgKiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmVcblx0ICovXG5cdE9wZW5DbG9zZWQgPSAyLFxuXHQvKipcblx0ICogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXJcblx0ICovXG5cdENsb3NlZE9wZW4gPSAzXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGV4dEVkaXRvclNlbGVjdGlvbkNoYW5nZUtpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVZhbHVlKHM6IFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UgfCBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRzd2l0Y2ggKHMpIHtcblx0XHRcdGNhc2UgJ2tleWJvYXJkJzogcmV0dXJuIFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kLktleWJvYXJkO1xuXHRcdFx0Y2FzZSAnbW91c2UnOiByZXR1cm4gVGV4dEVkaXRvclNlbGVjdGlvbkNoYW5nZUtpbmQuTW91c2U7XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuUFJPR1JBTU1BVElDOlxuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLkpVTVA6XG5cdFx0XHRjYXNlIFRleHRFZGl0b3JTZWxlY3Rpb25Tb3VyY2UuTkFWSUdBVElPTjpcblx0XHRcdFx0cmV0dXJuIFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kLkNvbW1hbmQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gU3ludGF4VG9rZW5UeXBlIHtcblx0T3RoZXIgPSAwLFxuXHRDb21tZW50ID0gMSxcblx0U3RyaW5nID0gMixcblx0UmVnRXggPSAzXG59XG5leHBvcnQgbmFtZXNwYWNlIFN5bnRheFRva2VuVHlwZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b1N0cmluZyh2OiBTeW50YXhUb2tlblR5cGUgfCB1bmtub3duKTogJ290aGVyJyB8ICdjb21tZW50JyB8ICdzdHJpbmcnIHwgJ3JlZ2V4JyB7XG5cdFx0c3dpdGNoICh2KSB7XG5cdFx0XHRjYXNlIFN5bnRheFRva2VuVHlwZS5PdGhlcjogcmV0dXJuICdvdGhlcic7XG5cdFx0XHRjYXNlIFN5bnRheFRva2VuVHlwZS5Db21tZW50OiByZXR1cm4gJ2NvbW1lbnQnO1xuXHRcdFx0Y2FzZSBTeW50YXhUb2tlblR5cGUuU3RyaW5nOiByZXR1cm4gJ3N0cmluZyc7XG5cdFx0XHRjYXNlIFN5bnRheFRva2VuVHlwZS5SZWdFeDogcmV0dXJuICdyZWdleCc7XG5cdFx0fVxuXHRcdHJldHVybiAnb3RoZXInO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERvY3VtZW50TGluayB7XG5cblx0cmFuZ2U6IFJhbmdlO1xuXG5cdHRhcmdldD86IFVSSTtcblxuXHR0b29sdGlwPzogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgdGFyZ2V0OiBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGFyZ2V0ICYmICEoVVJJLmlzVXJpKHRhcmdldCkpKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3RhcmdldCcpO1xuXHRcdH1cblx0XHRpZiAoIVJhbmdlLmlzUmFuZ2UocmFuZ2UpIHx8IHJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncmFuZ2UnKTtcblx0XHR9XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMudGFyZ2V0ID0gdGFyZ2V0O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvbG9yIHtcblx0cmVhZG9ubHkgcmVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IGdyZWVuOiBudW1iZXI7XG5cdHJlYWRvbmx5IGJsdWU6IG51bWJlcjtcblx0cmVhZG9ubHkgYWxwaGE6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihyZWQ6IG51bWJlciwgZ3JlZW46IG51bWJlciwgYmx1ZTogbnVtYmVyLCBhbHBoYTogbnVtYmVyKSB7XG5cdFx0dGhpcy5yZWQgPSByZWQ7XG5cdFx0dGhpcy5ncmVlbiA9IGdyZWVuO1xuXHRcdHRoaXMuYmx1ZSA9IGJsdWU7XG5cdFx0dGhpcy5hbHBoYSA9IGFscGhhO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIElDb2xvckZvcm1hdCA9IHN0cmluZyB8IHsgb3BhcXVlOiBzdHJpbmc7IHRyYW5zcGFyZW50OiBzdHJpbmcgfTtcblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgQ29sb3JJbmZvcm1hdGlvbiB7XG5cdHJhbmdlOiBSYW5nZTtcblxuXHRjb2xvcjogQ29sb3I7XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCBjb2xvcjogQ29sb3IpIHtcblx0XHRpZiAoY29sb3IgJiYgIShjb2xvciBpbnN0YW5jZW9mIENvbG9yKSkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdjb2xvcicpO1xuXHRcdH1cblx0XHRpZiAoIVJhbmdlLmlzUmFuZ2UocmFuZ2UpIHx8IHJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncmFuZ2UnKTtcblx0XHR9XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuY29sb3IgPSBjb2xvcjtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb2xvclByZXNlbnRhdGlvbiB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHRleHRFZGl0PzogVGV4dEVkaXQ7XG5cdGFkZGl0aW9uYWxUZXh0RWRpdHM/OiBUZXh0RWRpdFtdO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcpIHtcblx0XHRpZiAoIWxhYmVsIHx8IHR5cGVvZiBsYWJlbCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbGFiZWwnKTtcblx0XHR9XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIENvbG9yRm9ybWF0IHtcblx0UkdCID0gMCxcblx0SEVYID0gMSxcblx0SFNMID0gMlxufVxuXG5leHBvcnQgZW51bSBTb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZSB7XG5cdEVycm9yID0gMCxcblx0V2FybmluZyA9IDEsXG5cdEluZm9ybWF0aW9uID0gMlxufVxuXG5leHBvcnQgZW51bSBUZXJtaW5hbEV4aXRSZWFzb24ge1xuXHRVbmtub3duID0gMCxcblx0U2h1dGRvd24gPSAxLFxuXHRQcm9jZXNzID0gMixcblx0VXNlciA9IDMsXG5cdEV4dGVuc2lvbiA9IDRcbn1cblxuZXhwb3J0IGVudW0gVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lQ29uZmlkZW5jZSB7XG5cdExvdyA9IDAsXG5cdE1lZGl1bSA9IDEsXG5cdEhpZ2ggPSAyXG59XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsU2hlbGxUeXBlIHtcblx0U2ggPSAxLFxuXHRCYXNoID0gMixcblx0RmlzaCA9IDMsXG5cdENzaCA9IDQsXG5cdEtzaCA9IDUsXG5cdFpzaCA9IDYsXG5cdENvbW1hbmRQcm9tcHQgPSA3LFxuXHRHaXRCYXNoID0gOCxcblx0UG93ZXJTaGVsbCA9IDksXG5cdFB5dGhvbiA9IDEwLFxuXHRKdWxpYSA9IDExLFxuXHROdVNoZWxsID0gMTIsXG5cdE5vZGUgPSAxMyxcblx0WG9uc2ggPSAxNFxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxMaW5rIGltcGxlbWVudHMgdnNjb2RlLlRlcm1pbmFsTGluayB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBzdGFydEluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIGxlbmd0aDogbnVtYmVyLFxuXHRcdHB1YmxpYyB0b29sdGlwPzogc3RyaW5nXG5cdCkge1xuXHRcdGlmICh0eXBlb2Ygc3RhcnRJbmRleCAhPT0gJ251bWJlcicgfHwgc3RhcnRJbmRleCA8IDApIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnc3RhcnRJbmRleCcpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGxlbmd0aCAhPT0gJ251bWJlcicgfHwgbGVuZ3RoIDwgMSkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdsZW5ndGgnKTtcblx0XHR9XG5cdFx0aWYgKHRvb2x0aXAgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdG9vbHRpcCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgndG9vbHRpcCcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxRdWlja0ZpeE9wZW5lciB7XG5cdHVyaTogdnNjb2RlLlVyaTtcblx0Y29uc3RydWN0b3IodXJpOiB2c2NvZGUuVXJpKSB7XG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUXVpY2tGaXhDb21tYW5kIHtcblx0dGVybWluYWxDb21tYW5kOiBzdHJpbmc7XG5cdGNvbnN0cnVjdG9yKHRlcm1pbmFsQ29tbWFuZDogc3RyaW5nKSB7XG5cdFx0dGhpcy50ZXJtaW5hbENvbW1hbmQgPSB0ZXJtaW5hbENvbW1hbmQ7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gVGVybWluYWxMb2NhdGlvbiB7XG5cdFBhbmVsID0gMSxcblx0RWRpdG9yID0gMixcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUHJvZmlsZSBpbXBsZW1lbnRzIHZzY29kZS5UZXJtaW5hbFByb2ZpbGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgb3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucyB8IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnNcblx0KSB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdvcHRpb25zJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kIHtcblx0RmlsZSA9IDAsXG5cdEZvbGRlciA9IDEsXG5cdE1ldGhvZCA9IDIsXG5cdEFsaWFzID0gMyxcblx0QXJndW1lbnQgPSA0LFxuXHRPcHRpb24gPSA1LFxuXHRPcHRpb25WYWx1ZSA9IDYsXG5cdEZsYWcgPSA3LFxuXHRTeW1ib2xpY0xpbmtGaWxlID0gOCxcblx0U3ltYm9saWNMaW5rRm9sZGVyID0gOSxcblx0U2NtQ29tbWl0ID0gMTAsXG5cdFNjbUJyYW5jaCA9IDExLFxuXHRTY21UYWcgPSAxMixcblx0U2NtU3Rhc2ggPSAxMyxcblx0U2NtUmVtb3RlID0gMTQsXG5cdFB1bGxSZXF1ZXN0ID0gMTUsXG5cdFB1bGxSZXF1ZXN0RG9uZSA9IDE2LFxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxDb21wbGV0aW9uSXRlbSBpbXBsZW1lbnRzIHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25JdGVtIHtcblx0bGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWw7XG5cdHJlcGxhY2VtZW50UmFuZ2U6IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl07XG5cdGRldGFpbD86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0ZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0a2luZD86IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kIHwgdW5kZWZpbmVkO1xuXHRpc0ZpbGU/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRpc0RpcmVjdG9yeT86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGlzS2V5d29yZD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IobGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWwsIHJlcGxhY2VtZW50UmFuZ2U6IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0sIGtpbmQ/OiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZCwgZGV0YWlsPzogc3RyaW5nLCBkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nLCBpc0ZpbGU/OiBib29sZWFuLCBpc0RpcmVjdG9yeT86IGJvb2xlYW4sIGlzS2V5d29yZD86IGJvb2xlYW4pIHtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5yZXBsYWNlbWVudFJhbmdlID0gcmVwbGFjZW1lbnRSYW5nZTtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHRcdHRoaXMuZGV0YWlsID0gZGV0YWlsO1xuXHRcdHRoaXMuZG9jdW1lbnRhdGlvbiA9IGRvY3VtZW50YXRpb247XG5cdFx0dGhpcy5pc0ZpbGUgPSBpc0ZpbGU7XG5cdFx0dGhpcy5pc0RpcmVjdG9yeSA9IGlzRGlyZWN0b3J5O1xuXHRcdHRoaXMuaXNLZXl3b3JkID0gaXNLZXl3b3JkO1xuXHR9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGNvbGxlY3Rpb24gb2Yge0BsaW5rIENvbXBsZXRpb25JdGVtIGNvbXBsZXRpb24gaXRlbXN9IHRvIGJlIHByZXNlbnRlZFxuICogaW4gdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQ29tcGxldGlvbkxpc3Q8VCBleHRlbmRzIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0gPSBUZXJtaW5hbENvbXBsZXRpb25JdGVtPiB7XG5cblx0LyoqXG5cdCAqIFJlc291cmNlcyBzaG91bGQgYmUgc2hvd24gaW4gdGhlIGNvbXBsZXRpb25zIGxpc3Rcblx0ICovXG5cdHJlc291cmNlT3B0aW9ucz86IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucztcblxuXHQvKipcblx0ICogVGhlIGNvbXBsZXRpb24gaXRlbXMuXG5cdCAqL1xuXHRpdGVtczogVFtdO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IGNvbXBsZXRpb24gbGlzdC5cblx0ICpcblx0ICogQHBhcmFtIGl0ZW1zIFRoZSBjb21wbGV0aW9uIGl0ZW1zLlxuXHQgKiBAcGFyYW0gaXNJbmNvbXBsZXRlIFRoZSBsaXN0IGlzIG5vdCBjb21wbGV0ZS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGl0ZW1zPzogVFtdLCByZXNvdXJjZU9wdGlvbnM/OiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMpIHtcblx0XHR0aGlzLml0ZW1zID0gaXRlbXMgPz8gW107XG5cdFx0dGhpcy5yZXNvdXJjZU9wdGlvbnMgPSByZXNvdXJjZU9wdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMge1xuXHRzaG93RmlsZXM/OiBib29sZWFuO1xuXHRzaG93RGlyZWN0b3JpZXM/OiBib29sZWFuO1xuXHRmaWxlRXh0ZW5zaW9ucz86IHN0cmluZ1tdO1xuXHRjd2Q/OiB2c2NvZGUuVXJpO1xufVxuXG5leHBvcnQgZW51bSBUYXNrUmV2ZWFsS2luZCB7XG5cdEFsd2F5cyA9IDEsXG5cblx0U2lsZW50ID0gMixcblxuXHROZXZlciA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGFza0V2ZW50S2luZCB7XG5cdC8qKiBJbmRpY2F0ZXMgYSB0YXNrJ3MgcHJvcGVydGllcyBvciBjb25maWd1cmF0aW9uIGhhdmUgY2hhbmdlZCAqL1xuXHRDaGFuZ2VkID0gJ2NoYW5nZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgYSB0YXNrIGhhcyBiZWd1biBleGVjdXRpbmcgKi9cblx0UHJvY2Vzc1N0YXJ0ZWQgPSAncHJvY2Vzc1N0YXJ0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgYSB0YXNrIHByb2Nlc3MgaGFzIGNvbXBsZXRlZCAqL1xuXHRQcm9jZXNzRW5kZWQgPSAncHJvY2Vzc0VuZGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayB3YXMgdGVybWluYXRlZCwgZWl0aGVyIGJ5IHVzZXIgYWN0aW9uIG9yIGJ5IHRoZSBzeXN0ZW0gKi9cblx0VGVybWluYXRlZCA9ICd0ZXJtaW5hdGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBoYXMgc3RhcnRlZCBydW5uaW5nICovXG5cdFN0YXJ0ID0gJ3N0YXJ0JyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBoYXMgYWNxdWlyZWQgYWxsIG5lZWRlZCBpbnB1dC92YXJpYWJsZXMgdG8gZXhlY3V0ZSAqL1xuXHRBY3F1aXJlZElucHV0ID0gJ2FjcXVpcmVkSW5wdXQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgYSBkZXBlbmRlbnQgdGFzayBoYXMgc3RhcnRlZCAqL1xuXHREZXBlbmRzT25TdGFydGVkID0gJ2RlcGVuZHNPblN0YXJ0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgYSB0YXNrIGlzIGFjdGl2ZWx5IHJ1bm5pbmcvcHJvY2Vzc2luZyAqL1xuXHRBY3RpdmUgPSAnYWN0aXZlJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBpcyBwYXVzZWQvd2FpdGluZyBidXQgbm90IGNvbXBsZXRlICovXG5cdEluYWN0aXZlID0gJ2luYWN0aXZlJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBoYXMgY29tcGxldGVkIGZ1bGx5ICovXG5cdEVuZCA9ICdlbmQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhlIHRhc2sncyBwcm9ibGVtIG1hdGNoZXIgaGFzIHN0YXJ0ZWQgKi9cblx0UHJvYmxlbU1hdGNoZXJTdGFydGVkID0gJ3Byb2JsZW1NYXRjaGVyU3RhcnRlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGUgdGFzaydzIHByb2JsZW0gbWF0Y2hlciBoYXMgZW5kZWQgd2l0aG91dCBlcnJvcnMgKi9cblx0UHJvYmxlbU1hdGNoZXJFbmRlZCA9ICdwcm9ibGVtTWF0Y2hlckVuZGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoZSB0YXNrJ3MgcHJvYmxlbSBtYXRjaGVyIGhhcyBlbmRlZCB3aXRoIGVycm9ycyAqL1xuXHRQcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzID0gJ3Byb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMnXG59XG5cblxuZXhwb3J0IGVudW0gVGFza1BhbmVsS2luZCB7XG5cdFNoYXJlZCA9IDEsXG5cblx0RGVkaWNhdGVkID0gMixcblxuXHROZXcgPSAzXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRhc2tHcm91cCBpbXBsZW1lbnRzIHZzY29kZS5UYXNrR3JvdXAge1xuXG5cdGlzRGVmYXVsdDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaWQ6IHN0cmluZztcblxuXHRwdWJsaWMgc3RhdGljIENsZWFuOiBUYXNrR3JvdXAgPSBuZXcgVGFza0dyb3VwKCdjbGVhbicsICdDbGVhbicpO1xuXG5cdHB1YmxpYyBzdGF0aWMgQnVpbGQ6IFRhc2tHcm91cCA9IG5ldyBUYXNrR3JvdXAoJ2J1aWxkJywgJ0J1aWxkJyk7XG5cblx0cHVibGljIHN0YXRpYyBSZWJ1aWxkOiBUYXNrR3JvdXAgPSBuZXcgVGFza0dyb3VwKCdyZWJ1aWxkJywgJ1JlYnVpbGQnKTtcblxuXHRwdWJsaWMgc3RhdGljIFRlc3Q6IFRhc2tHcm91cCA9IG5ldyBUYXNrR3JvdXAoJ3Rlc3QnLCAnVGVzdCcpO1xuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAnY2xlYW4nOlxuXHRcdFx0XHRyZXR1cm4gVGFza0dyb3VwLkNsZWFuO1xuXHRcdFx0Y2FzZSAnYnVpbGQnOlxuXHRcdFx0XHRyZXR1cm4gVGFza0dyb3VwLkJ1aWxkO1xuXHRcdFx0Y2FzZSAncmVidWlsZCc6XG5cdFx0XHRcdHJldHVybiBUYXNrR3JvdXAuUmVidWlsZDtcblx0XHRcdGNhc2UgJ3Rlc3QnOlxuXHRcdFx0XHRyZXR1cm4gVGFza0dyb3VwLlRlc3Q7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiBpZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbmFtZScpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCduYW1lJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdH1cblxuXHRnZXQgaWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZVRhc2tFeGVjdXRpb25JZCh2YWx1ZXM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0bGV0IGlkOiBzdHJpbmcgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRpZCArPSB2YWx1ZXNbaV0ucmVwbGFjZSgvLC9nLCAnLCwnKSArICcsJztcblx0fVxuXHRyZXR1cm4gaWQ7XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFByb2Nlc3NFeGVjdXRpb24gaW1wbGVtZW50cyB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbiB7XG5cblx0cHJpdmF0ZSBfcHJvY2Vzczogc3RyaW5nO1xuXHRwcml2YXRlIF9hcmdzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBfb3B0aW9uczogdnNjb2RlLlByb2Nlc3NFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByb2Nlc3M6IHN0cmluZywgb3B0aW9ucz86IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyk7XG5cdGNvbnN0cnVjdG9yKHByb2Nlc3M6IHN0cmluZywgYXJnczogc3RyaW5nW10sIG9wdGlvbnM/OiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMpO1xuXHRjb25zdHJ1Y3Rvcihwcm9jZXNzOiBzdHJpbmcsIHZhcmcxPzogc3RyaW5nW10gfCB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMsIHZhcmcyPzogdnNjb2RlLlByb2Nlc3NFeGVjdXRpb25PcHRpb25zKSB7XG5cdFx0aWYgKHR5cGVvZiBwcm9jZXNzICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdwcm9jZXNzJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2FyZ3MgPSBbXTtcblx0XHR0aGlzLl9wcm9jZXNzID0gcHJvY2Vzcztcblx0XHRpZiAodmFyZzEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFyZzEpKSB7XG5cdFx0XHRcdHRoaXMuX2FyZ3MgPSB2YXJnMTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucyA9IHZhcmcyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucyA9IHZhcmcxO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cblx0Z2V0IHByb2Nlc3MoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvY2Vzcztcblx0fVxuXG5cdHNldCBwcm9jZXNzKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdwcm9jZXNzJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb2Nlc3MgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBhcmdzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJncztcblx0fVxuXG5cdHNldCBhcmdzKHZhbHVlOiBzdHJpbmdbXSkge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHZhbHVlID0gW107XG5cdFx0fVxuXHRcdHRoaXMuX2FyZ3MgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBvcHRpb25zKCk6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnM7XG5cdH1cblxuXHRzZXQgb3B0aW9ucyh2YWx1ZTogdnNjb2RlLlByb2Nlc3NFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVJZCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHByb3BzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHByb3BzLnB1c2goJ3Byb2Nlc3MnKTtcblx0XHRpZiAodGhpcy5fcHJvY2VzcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwcm9wcy5wdXNoKHRoaXMuX3Byb2Nlc3MpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXJncyAmJiB0aGlzLl9hcmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgYXJnIG9mIHRoaXMuX2FyZ3MpIHtcblx0XHRcdFx0cHJvcHMucHVzaChhcmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29tcHV0ZVRhc2tFeGVjdXRpb25JZChwcm9wcyk7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgU2hlbGxFeGVjdXRpb24gaW1wbGVtZW50cyB2c2NvZGUuU2hlbGxFeGVjdXRpb24ge1xuXG5cdHByaXZhdGUgX2NvbW1hbmRMaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1hbmQ6IHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXJnczogKHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZylbXSA9IFtdO1xuXHRwcml2YXRlIF9vcHRpb25zOiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNvbW1hbmRMaW5lOiBzdHJpbmcsIG9wdGlvbnM/OiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zKTtcblx0Y29uc3RydWN0b3IoY29tbWFuZDogc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nLCBhcmdzOiAoc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nKVtdLCBvcHRpb25zPzogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyk7XG5cdGNvbnN0cnVjdG9yKGFyZzA6IHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZywgYXJnMT86IHZzY29kZS5TaGVsbEV4ZWN1dGlvbk9wdGlvbnMgfCAoc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nKVtdLCBhcmcyPzogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucykge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGFyZzEpKSB7XG5cdFx0XHRpZiAoIWFyZzApIHtcblx0XHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdjb21tYW5kIGNhblxcJ3QgYmUgdW5kZWZpbmVkIG9yIG51bGwnKTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgYXJnMCAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIGFyZzAudmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29tbWFuZCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29tbWFuZCA9IGFyZzA7XG5cdFx0XHRpZiAoYXJnMSkge1xuXHRcdFx0XHR0aGlzLl9hcmdzID0gYXJnMTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29wdGlvbnMgPSBhcmcyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodHlwZW9mIGFyZzAgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29tbWFuZExpbmUnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbW1hbmRMaW5lID0gYXJnMDtcblx0XHRcdHRoaXMuX29wdGlvbnMgPSBhcmcxO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjb21tYW5kTGluZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kTGluZTtcblx0fVxuXG5cdHNldCBjb21tYW5kTGluZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29tbWFuZExpbmUnKTtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWFuZExpbmUgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBjb21tYW5kKCk6IHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmQgPyB0aGlzLl9jb21tYW5kIDogJyc7XG5cdH1cblxuXHRzZXQgY29tbWFuZCh2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIHZhbHVlLnZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdjb21tYW5kJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1hbmQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBhcmdzKCk6IChzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcpW10ge1xuXHRcdHJldHVybiB0aGlzLl9hcmdzO1xuXHR9XG5cblx0c2V0IGFyZ3ModmFsdWU6IChzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcpW10gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9hcmdzID0gdmFsdWUgfHwgW107XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpOiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucztcblx0fVxuXG5cdHNldCBvcHRpb25zKHZhbHVlOiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVJZCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHByb3BzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHByb3BzLnB1c2goJ3NoZWxsJyk7XG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRMaW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHByb3BzLnB1c2godGhpcy5fY29tbWFuZExpbmUpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29tbWFuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwcm9wcy5wdXNoKHR5cGVvZiB0aGlzLl9jb21tYW5kID09PSAnc3RyaW5nJyA/IHRoaXMuX2NvbW1hbmQgOiB0aGlzLl9jb21tYW5kLnZhbHVlKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FyZ3MgJiYgdGhpcy5fYXJncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFyZyBvZiB0aGlzLl9hcmdzKSB7XG5cdFx0XHRcdHByb3BzLnB1c2godHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgPyBhcmcgOiBhcmcudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29tcHV0ZVRhc2tFeGVjdXRpb25JZChwcm9wcyk7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gU2hlbGxRdW90aW5nIHtcblx0RXNjYXBlID0gMSxcblx0U3Ryb25nID0gMixcblx0V2VhayA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGFza1Njb3BlIHtcblx0R2xvYmFsID0gMSxcblx0V29ya3NwYWNlID0gMlxufVxuXG5leHBvcnQgZW51bSBUYXNrUnVuT24ge1xuXHREZWZhdWx0ID0gMSxcblx0Rm9sZGVyT3BlbiA9IDIsXG5cdFdvcmt0cmVlQ3JlYXRlZCA9IDMsXG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21FeGVjdXRpb24gaW1wbGVtZW50cyB2c2NvZGUuQ3VzdG9tRXhlY3V0aW9uIHtcblx0cHJpdmF0ZSBfY2FsbGJhY2s6IChyZXNvbHZlZERlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbikgPT4gVGhlbmFibGU8dnNjb2RlLlBzZXVkb3Rlcm1pbmFsPjtcblx0Y29uc3RydWN0b3IoY2FsbGJhY2s6IChyZXNvbHZlZERlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbikgPT4gVGhlbmFibGU8dnNjb2RlLlBzZXVkb3Rlcm1pbmFsPikge1xuXHRcdHRoaXMuX2NhbGxiYWNrID0gY2FsbGJhY2s7XG5cdH1cblx0cHVibGljIGNvbXB1dGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnY3VzdG9tRXhlY3V0aW9uJyArIGdlbmVyYXRlVXVpZCgpO1xuXHR9XG5cblx0cHVibGljIHNldCBjYWxsYmFjayh2YWx1ZTogKHJlc29sdmVkRGVmaW5pdGlvbjogdnNjb2RlLlRhc2tEZWZpbml0aW9uKSA9PiBUaGVuYWJsZTx2c2NvZGUuUHNldWRvdGVybWluYWw+KSB7XG5cdFx0dGhpcy5fY2FsbGJhY2sgPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FsbGJhY2soKTogKChyZXNvbHZlZERlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbikgPT4gVGhlbmFibGU8dnNjb2RlLlBzZXVkb3Rlcm1pbmFsPikge1xuXHRcdHJldHVybiB0aGlzLl9jYWxsYmFjaztcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUYXNrIGltcGxlbWVudHMgdnNjb2RlLlRhc2sge1xuXG5cdHByaXZhdGUgc3RhdGljIEV4dGVuc2lvbkNhbGxiYWNrVHlwZTogc3RyaW5nID0gJ2N1c3RvbUV4ZWN1dGlvbic7XG5cdHByaXZhdGUgc3RhdGljIFByb2Nlc3NUeXBlOiBzdHJpbmcgPSAncHJvY2Vzcyc7XG5cdHByaXZhdGUgc3RhdGljIFNoZWxsVHlwZTogc3RyaW5nID0gJ3NoZWxsJztcblx0cHJpdmF0ZSBzdGF0aWMgRW1wdHlUeXBlOiBzdHJpbmcgPSAnJGVtcHR5JztcblxuXHRwcml2YXRlIF9faWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfX2RlcHJlY2F0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9kZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb247XG5cdHByaXZhdGUgX3Njb3BlOiB2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIF9leGVjdXRpb246IFByb2Nlc3NFeGVjdXRpb24gfCBTaGVsbEV4ZWN1dGlvbiB8IEN1c3RvbUV4ZWN1dGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvYmxlbU1hdGNoZXJzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBfaGFzRGVmaW5lZE1hdGNoZXJzOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc0JhY2tncm91bmQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX3NvdXJjZTogc3RyaW5nO1xuXHRwcml2YXRlIF9ncm91cDogVGFza0dyb3VwIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmVzZW50YXRpb25PcHRpb25zOiB2c2NvZGUuVGFza1ByZXNlbnRhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgX3J1bk9wdGlvbnM6IHZzY29kZS5SdW5PcHRpb25zO1xuXHRwcml2YXRlIF9kZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihkZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24sIG5hbWU6IHN0cmluZywgc291cmNlOiBzdHJpbmcsIGV4ZWN1dGlvbj86IFByb2Nlc3NFeGVjdXRpb24gfCBTaGVsbEV4ZWN1dGlvbiB8IEN1c3RvbUV4ZWN1dGlvbiwgcHJvYmxlbU1hdGNoZXJzPzogc3RyaW5nIHwgc3RyaW5nW10pO1xuXHRjb25zdHJ1Y3RvcihkZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24sIHNjb3BlOiB2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgbmFtZTogc3RyaW5nLCBzb3VyY2U6IHN0cmluZywgZXhlY3V0aW9uPzogUHJvY2Vzc0V4ZWN1dGlvbiB8IFNoZWxsRXhlY3V0aW9uIHwgQ3VzdG9tRXhlY3V0aW9uLCBwcm9ibGVtTWF0Y2hlcnM/OiBzdHJpbmcgfCBzdHJpbmdbXSk7XG5cdGNvbnN0cnVjdG9yKGRlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbiwgYXJnMjogc3RyaW5nIHwgKHZzY29kZS5UYXNrU2NvcGUuR2xvYmFsIHwgdnNjb2RlLlRhc2tTY29wZS5Xb3Jrc3BhY2UpIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlciwgYXJnMzogYW55LCBhcmc0PzogYW55LCBhcmc1PzogYW55LCBhcmc2PzogYW55KSB7XG5cdFx0dGhpcy5fZGVmaW5pdGlvbiA9IHRoaXMuZGVmaW5pdGlvbiA9IGRlZmluaXRpb247XG5cdFx0bGV0IHByb2JsZW1NYXRjaGVyczogc3RyaW5nIHwgc3RyaW5nW107XG5cdFx0aWYgKHR5cGVvZiBhcmcyID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fbmFtZSA9IHRoaXMubmFtZSA9IGFyZzI7XG5cdFx0XHR0aGlzLl9zb3VyY2UgPSB0aGlzLnNvdXJjZSA9IGFyZzM7XG5cdFx0XHR0aGlzLmV4ZWN1dGlvbiA9IGFyZzQ7XG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnMgPSBhcmc1O1xuXHRcdFx0dGhpcy5fX2RlcHJlY2F0ZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoYXJnMiA9PT0gVGFza1Njb3BlLkdsb2JhbCB8fCBhcmcyID09PSBUYXNrU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHR0aGlzLnRhcmdldCA9IGFyZzI7XG5cdFx0XHR0aGlzLl9uYW1lID0gdGhpcy5uYW1lID0gYXJnMztcblx0XHRcdHRoaXMuX3NvdXJjZSA9IHRoaXMuc291cmNlID0gYXJnNDtcblx0XHRcdHRoaXMuZXhlY3V0aW9uID0gYXJnNTtcblx0XHRcdHByb2JsZW1NYXRjaGVycyA9IGFyZzY7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGFyZ2V0ID0gYXJnMjtcblx0XHRcdHRoaXMuX25hbWUgPSB0aGlzLm5hbWUgPSBhcmczO1xuXHRcdFx0dGhpcy5fc291cmNlID0gdGhpcy5zb3VyY2UgPSBhcmc0O1xuXHRcdFx0dGhpcy5leGVjdXRpb24gPSBhcmc1O1xuXHRcdFx0cHJvYmxlbU1hdGNoZXJzID0gYXJnNjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBwcm9ibGVtTWF0Y2hlcnMgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9wcm9ibGVtTWF0Y2hlcnMgPSBbcHJvYmxlbU1hdGNoZXJzXTtcblx0XHRcdHRoaXMuX2hhc0RlZmluZWRNYXRjaGVycyA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHByb2JsZW1NYXRjaGVycykpIHtcblx0XHRcdHRoaXMuX3Byb2JsZW1NYXRjaGVycyA9IHByb2JsZW1NYXRjaGVycztcblx0XHRcdHRoaXMuX2hhc0RlZmluZWRNYXRjaGVycyA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Byb2JsZW1NYXRjaGVycyA9IFtdO1xuXHRcdFx0dGhpcy5faGFzRGVmaW5lZE1hdGNoZXJzID0gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2lzQmFja2dyb3VuZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3ByZXNlbnRhdGlvbk9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3J1bk9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0Z2V0IF9pZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9faWQ7XG5cdH1cblxuXHRzZXQgX2lkKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9faWQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBfZGVwcmVjYXRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fX2RlcHJlY2F0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9faWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9faWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2NvcGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jb21wdXRlRGVmaW5pdGlvbkJhc2VkT25FeGVjdXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZURlZmluaXRpb25CYXNlZE9uRXhlY3V0aW9uKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9leGVjdXRpb24gaW5zdGFuY2VvZiBQcm9jZXNzRXhlY3V0aW9uKSB7XG5cdFx0XHR0aGlzLl9kZWZpbml0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBUYXNrLlByb2Nlc3NUeXBlLFxuXHRcdFx0XHRpZDogdGhpcy5fZXhlY3V0aW9uLmNvbXB1dGVJZCgpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fZXhlY3V0aW9uIGluc3RhbmNlb2YgU2hlbGxFeGVjdXRpb24pIHtcblx0XHRcdHRoaXMuX2RlZmluaXRpb24gPSB7XG5cdFx0XHRcdHR5cGU6IFRhc2suU2hlbGxUeXBlLFxuXHRcdFx0XHRpZDogdGhpcy5fZXhlY3V0aW9uLmNvbXB1dGVJZCgpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fZXhlY3V0aW9uIGluc3RhbmNlb2YgQ3VzdG9tRXhlY3V0aW9uKSB7XG5cdFx0XHR0aGlzLl9kZWZpbml0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBUYXNrLkV4dGVuc2lvbkNhbGxiYWNrVHlwZSxcblx0XHRcdFx0aWQ6IHRoaXMuX2V4ZWN1dGlvbi5jb21wdXRlSWQoKVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVmaW5pdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogVGFzay5FbXB0eVR5cGUsXG5cdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRnZXQgZGVmaW5pdGlvbigpOiB2c2NvZGUuVGFza0RlZmluaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9kZWZpbml0aW9uO1xuXHR9XG5cblx0c2V0IGRlZmluaXRpb24odmFsdWU6IHZzY29kZS5UYXNrRGVmaW5pdGlvbikge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ0tpbmQgY2FuXFwndCBiZSB1bmRlZmluZWQgb3IgbnVsbCcpO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVmaW5pdGlvbiA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHNjb3BlKCk6IHZzY29kZS5UYXNrU2NvcGUuR2xvYmFsIHwgdnNjb2RlLlRhc2tTY29wZS5Xb3Jrc3BhY2UgfCB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2NvcGU7XG5cdH1cblxuXHRzZXQgdGFyZ2V0KHZhbHVlOiB2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlcikge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zY29wZSA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbmFtZTtcblx0fVxuXG5cdHNldCBuYW1lKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCduYW1lJyk7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9uYW1lID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgZXhlY3V0aW9uKCk6IFByb2Nlc3NFeGVjdXRpb24gfCBTaGVsbEV4ZWN1dGlvbiB8IEN1c3RvbUV4ZWN1dGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGlvbjtcblx0fVxuXG5cdHNldCBleGVjdXRpb24odmFsdWU6IFByb2Nlc3NFeGVjdXRpb24gfCBTaGVsbEV4ZWN1dGlvbiB8IEN1c3RvbUV4ZWN1dGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0dmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9leGVjdXRpb24gPSB2YWx1ZTtcblx0XHRjb25zdCB0eXBlID0gdGhpcy5fZGVmaW5pdGlvbi50eXBlO1xuXHRcdGlmIChUYXNrLkVtcHR5VHlwZSA9PT0gdHlwZSB8fCBUYXNrLlByb2Nlc3NUeXBlID09PSB0eXBlIHx8IFRhc2suU2hlbGxUeXBlID09PSB0eXBlIHx8IFRhc2suRXh0ZW5zaW9uQ2FsbGJhY2tUeXBlID09PSB0eXBlKSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVEZWZpbml0aW9uQmFzZWRPbkV4ZWN1dGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBwcm9ibGVtTWF0Y2hlcnMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9ibGVtTWF0Y2hlcnM7XG5cdH1cblxuXHRzZXQgcHJvYmxlbU1hdGNoZXJzKHZhbHVlOiBzdHJpbmdbXSkge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3Byb2JsZW1NYXRjaGVycyA9IFtdO1xuXHRcdFx0dGhpcy5faGFzRGVmaW5lZE1hdGNoZXJzID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3Byb2JsZW1NYXRjaGVycyA9IHZhbHVlO1xuXHRcdFx0dGhpcy5faGFzRGVmaW5lZE1hdGNoZXJzID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaGFzRGVmaW5lZE1hdGNoZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNEZWZpbmVkTWF0Y2hlcnM7XG5cdH1cblxuXHRnZXQgaXNCYWNrZ3JvdW5kKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0JhY2tncm91bmQ7XG5cdH1cblxuXHRzZXQgaXNCYWNrZ3JvdW5kKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB0cnVlICYmIHZhbHVlICE9PSBmYWxzZSkge1xuXHRcdFx0dmFsdWUgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX2lzQmFja2dyb3VuZCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHNvdXJjZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2U7XG5cdH1cblxuXHRzZXQgc291cmNlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnc291cmNlIG11c3QgYmUgYSBzdHJpbmcgb2YgbGVuZ3RoID4gMCcpO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc291cmNlID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgZ3JvdXAoKTogVGFza0dyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ3JvdXA7XG5cdH1cblxuXHRzZXQgZ3JvdXAodmFsdWU6IFRhc2tHcm91cCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0dmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9ncm91cCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IGRldGFpbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZXRhaWw7XG5cdH1cblxuXHRzZXQgZGV0YWlsKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9kZXRhaWwgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBwcmVzZW50YXRpb25PcHRpb25zKCk6IHZzY29kZS5UYXNrUHJlc2VudGF0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXNlbnRhdGlvbk9wdGlvbnM7XG5cdH1cblxuXHRzZXQgcHJlc2VudGF0aW9uT3B0aW9ucyh2YWx1ZTogdnNjb2RlLlRhc2tQcmVzZW50YXRpb25PcHRpb25zKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR9XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX3ByZXNlbnRhdGlvbk9wdGlvbnMgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBydW5PcHRpb25zKCk6IHZzY29kZS5SdW5PcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fcnVuT3B0aW9ucztcblx0fVxuXG5cdHNldCBydW5PcHRpb25zKHZhbHVlOiB2c2NvZGUuUnVuT3B0aW9ucykge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9ydW5PcHRpb25zID0gdmFsdWU7XG5cdH1cbn1cblxuXG5leHBvcnQgZW51bSBQcm9ncmVzc0xvY2F0aW9uIHtcblx0U291cmNlQ29udHJvbCA9IDEsXG5cdFdpbmRvdyA9IDEwLFxuXHROb3RpZmljYXRpb24gPSAxNVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFZpZXdCYWRnZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpc1ZpZXdCYWRnZSh0aGluZzogYW55KTogdGhpbmcgaXMgdnNjb2RlLlZpZXdCYWRnZSB7XG5cdFx0Y29uc3Qgdmlld0JhZGdlVGhpbmcgPSB0aGluZyBhcyB2c2NvZGUuVmlld0JhZGdlO1xuXG5cdFx0aWYgKCFpc051bWJlcih2aWV3QmFkZ2VUaGluZy52YWx1ZSkpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHZpZXcgYmFkZ2UsIGludmFsaWQgdmFsdWUnLCB2aWV3QmFkZ2VUaGluZy52YWx1ZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh2aWV3QmFkZ2VUaGluZy50b29sdGlwICYmICFpc1N0cmluZyh2aWV3QmFkZ2VUaGluZy50b29sdGlwKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdmlldyBiYWRnZSwgaW52YWxpZCB0b29sdGlwJywgdmlld0JhZGdlVGhpbmcudG9vbHRpcCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRyZWVJdGVtIHtcblxuXHRsYWJlbD86IHN0cmluZyB8IHZzY29kZS5UcmVlSXRlbUxhYmVsO1xuXHRyZXNvdXJjZVVyaT86IFVSSTtcblx0aWNvblBhdGg/OiBzdHJpbmcgfCBVUkkgfCB7IGxpZ2h0OiBzdHJpbmcgfCBVUkk7IGRhcms6IHN0cmluZyB8IFVSSSB9IHwgVGhlbWVJY29uO1xuXHRjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQ7XG5cdGNvbnRleHRWYWx1ZT86IHN0cmluZztcblx0dG9vbHRpcD86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0Y2hlY2tib3hTdGF0ZT86IHZzY29kZS5UcmVlSXRlbUNoZWNrYm94U3RhdGU7XG5cblx0c3RhdGljIGlzVHJlZUl0ZW0odGhpbmc6IGFueSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB0aGluZyBpcyBUcmVlSXRlbSB7XG5cdFx0Y29uc3QgdHJlZUl0ZW1UaGluZyA9IHRoaW5nIGFzIHZzY29kZS5UcmVlSXRlbTtcblxuXHRcdGlmICh0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY2hlY2tib3ggPSBpc051bWJlcih0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUpID8gdHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlIDpcblx0XHRcdFx0aXNPYmplY3QodHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlKSAmJiBpc051bWJlcih0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUuc3RhdGUpID8gdHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlLnN0YXRlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdG9vbHRpcCA9ICFpc051bWJlcih0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUpICYmIGlzT2JqZWN0KHRyZWVJdGVtVGhpbmcuY2hlY2tib3hTdGF0ZSkgPyB0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUudG9vbHRpcCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjaGVja2JveCA9PT0gdW5kZWZpbmVkIHx8IChjaGVja2JveCAhPT0gVHJlZUl0ZW1DaGVja2JveFN0YXRlLkNoZWNrZWQgJiYgY2hlY2tib3ggIT09IFRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5VbmNoZWNrZWQpIHx8ICh0b29sdGlwICE9PSB1bmRlZmluZWQgJiYgIWlzU3RyaW5nKHRvb2x0aXApKSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgY2hlY2tib3hTdGF0ZScsIHRyZWVJdGVtVGhpbmcuY2hlY2tib3hTdGF0ZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpbmcgaW5zdGFuY2VvZiBUcmVlSXRlbSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRyZWVJdGVtVGhpbmcubGFiZWwgIT09IHVuZGVmaW5lZCAmJiAhaXNTdHJpbmcodHJlZUl0ZW1UaGluZy5sYWJlbCkgJiYgISh0cmVlSXRlbVRoaW5nLmxhYmVsPy5sYWJlbCkpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCBsYWJlbCcsIHRyZWVJdGVtVGhpbmcubGFiZWwpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcuaWQgIT09IHVuZGVmaW5lZCkgJiYgIWlzU3RyaW5nKHRyZWVJdGVtVGhpbmcuaWQpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgaWQnLCB0cmVlSXRlbVRoaW5nLmlkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLmljb25QYXRoICE9PSB1bmRlZmluZWQpICYmICFpc1N0cmluZyh0cmVlSXRlbVRoaW5nLmljb25QYXRoKSAmJiAhVVJJLmlzVXJpKHRyZWVJdGVtVGhpbmcuaWNvblBhdGgpICYmICghdHJlZUl0ZW1UaGluZy5pY29uUGF0aCB8fCAhaXNTdHJpbmcoKHRyZWVJdGVtVGhpbmcuaWNvblBhdGggYXMgdnNjb2RlLlRoZW1lSWNvbikuaWQpKSkge1xuXHRcdFx0Y29uc3QgYXNMaWdodEFuZERhcmtUaGluZyA9IHRyZWVJdGVtVGhpbmcuaWNvblBhdGggYXMgeyBsaWdodDogc3RyaW5nIHwgVVJJOyBkYXJrOiBzdHJpbmcgfCBVUkkgfSB8IG51bGw7XG5cdFx0XHRpZiAoIWFzTGlnaHRBbmREYXJrVGhpbmcgfHwgKCFpc1N0cmluZyhhc0xpZ2h0QW5kRGFya1RoaW5nLmxpZ2h0KSAmJiAhVVJJLmlzVXJpKGFzTGlnaHRBbmREYXJrVGhpbmcubGlnaHQpICYmICFpc1N0cmluZyhhc0xpZ2h0QW5kRGFya1RoaW5nLmRhcmspICYmICFVUkkuaXNVcmkoYXNMaWdodEFuZERhcmtUaGluZy5kYXJrKSkpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGljb25QYXRoJywgdHJlZUl0ZW1UaGluZy5pY29uUGF0aCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQpICYmICFpc1N0cmluZyh0cmVlSXRlbVRoaW5nLmRlc2NyaXB0aW9uKSAmJiAodHlwZW9mIHRyZWVJdGVtVGhpbmcuZGVzY3JpcHRpb24gIT09ICdib29sZWFuJykpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCBkZXNjcmlwdGlvbicsIHRyZWVJdGVtVGhpbmcuZGVzY3JpcHRpb24pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcucmVzb3VyY2VVcmkgIT09IHVuZGVmaW5lZCkgJiYgIVVSSS5pc1VyaSh0cmVlSXRlbVRoaW5nLnJlc291cmNlVXJpKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIHJlc291cmNlVXJpJywgdHJlZUl0ZW1UaGluZy5yZXNvdXJjZVVyaSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy50b29sdGlwICE9PSB1bmRlZmluZWQpICYmICFpc1N0cmluZyh0cmVlSXRlbVRoaW5nLnRvb2x0aXApICYmICEodHJlZUl0ZW1UaGluZy50b29sdGlwIGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgdG9vbHRpcCcsIHRyZWVJdGVtVGhpbmcudG9vbHRpcCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy5jb21tYW5kICE9PSB1bmRlZmluZWQpICYmICF0cmVlSXRlbVRoaW5nLmNvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGNvbW1hbmQnLCB0cmVlSXRlbVRoaW5nLmNvbW1hbmQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcuY29sbGFwc2libGVTdGF0ZSAhPT0gdW5kZWZpbmVkKSAmJiAodHJlZUl0ZW1UaGluZy5jb2xsYXBzaWJsZVN0YXRlIDwgVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUpICYmICh0cmVlSXRlbVRoaW5nLmNvbGxhcHNpYmxlU3RhdGUgPiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgY29sbGFwc2libGVTdGF0ZScsIHRyZWVJdGVtVGhpbmcuY29sbGFwc2libGVTdGF0ZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy5jb250ZXh0VmFsdWUgIT09IHVuZGVmaW5lZCkgJiYgIWlzU3RyaW5nKHRyZWVJdGVtVGhpbmcuY29udGV4dFZhbHVlKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGNvbnRleHRWYWx1ZScsIHRyZWVJdGVtVGhpbmcuY29udGV4dFZhbHVlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiAhPT0gdW5kZWZpbmVkKSAmJiAhdHJlZUl0ZW1UaGluZy5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24/LmxhYmVsKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uJywgdHJlZUl0ZW1UaGluZy5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IobGFiZWw6IHN0cmluZyB8IHZzY29kZS5UcmVlSXRlbUxhYmVsLCBjb2xsYXBzaWJsZVN0YXRlPzogdnNjb2RlLlRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSk7XG5cdGNvbnN0cnVjdG9yKHJlc291cmNlVXJpOiBVUkksIGNvbGxhcHNpYmxlU3RhdGU/OiB2c2NvZGUuVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlKTtcblx0Y29uc3RydWN0b3IoYXJnMTogc3RyaW5nIHwgdnNjb2RlLlRyZWVJdGVtTGFiZWwgfCBVUkksIHB1YmxpYyBjb2xsYXBzaWJsZVN0YXRlOiB2c2NvZGUuVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlID0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUpIHtcblx0XHRpZiAoVVJJLmlzVXJpKGFyZzEpKSB7XG5cdFx0XHR0aGlzLnJlc291cmNlVXJpID0gYXJnMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYWJlbCA9IGFyZzE7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGVudW0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlIHtcblx0Tm9uZSA9IDAsXG5cdENvbGxhcHNlZCA9IDEsXG5cdEV4cGFuZGVkID0gMlxufVxuXG5leHBvcnQgZW51bSBUcmVlSXRlbUNoZWNrYm94U3RhdGUge1xuXHRVbmNoZWNrZWQgPSAwLFxuXHRDaGVja2VkID0gMVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEYXRhVHJhbnNmZXJJdGVtIGltcGxlbWVudHMgdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW0ge1xuXG5cdGFzeW5jIGFzU3RyaW5nKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLnZhbHVlID09PSAnc3RyaW5nJyA/IHRoaXMudmFsdWUgOiBKU09OLnN0cmluZ2lmeSh0aGlzLnZhbHVlKTtcblx0fVxuXG5cdGFzRmlsZSgpOiB1bmRlZmluZWQgfCB2c2NvZGUuRGF0YVRyYW5zZmVyRmlsZSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2YWx1ZTogYW55LFxuXHQpIHsgfVxufVxuXG4vKipcbiAqIEEgZGF0YSB0cmFuc2ZlciBpdGVtIHRoYXQgaGFzIGJlZW4gY3JlYXRlZCBieSBWUyBDb2RlIGluc3RlYWQgb2YgYnkgYSBleHRlbnNpb24uXG4gKlxuICogSW50ZW50aW9uYWxseSBub3QgZXhwb3J0ZWQgdG8gZXh0ZW5zaW9ucy5cbiAqL1xuZXhwb3J0IGNsYXNzIEludGVybmFsRGF0YVRyYW5zZmVySXRlbSBleHRlbmRzIERhdGFUcmFuc2Zlckl0ZW0geyB9XG5cbi8qKlxuICogQSBkYXRhIHRyYW5zZmVyIGl0ZW0gZm9yIGEgZmlsZS5cbiAqXG4gKiBJbnRlbnRpb25hbGx5IG5vdCBleHBvcnRlZCB0byBleHRlbnNpb25zIGFzIG9ubHkgd2UgY2FuIGNyZWF0ZSB0aGVzZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEludGVybmFsRmlsZURhdGFUcmFuc2Zlckl0ZW0gZXh0ZW5kcyBJbnRlcm5hbERhdGFUcmFuc2Zlckl0ZW0ge1xuXG5cdHJlYWRvbmx5ICNmaWxlOiB2c2NvZGUuRGF0YVRyYW5zZmVyRmlsZTtcblxuXHRjb25zdHJ1Y3RvcihmaWxlOiB2c2NvZGUuRGF0YVRyYW5zZmVyRmlsZSkge1xuXHRcdHN1cGVyKCcnKTtcblx0XHR0aGlzLiNmaWxlID0gZmlsZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzRmlsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy4jZmlsZTtcblx0fVxufVxuXG4vKipcbiAqIEludGVudGlvbmFsbHkgbm90IGV4cG9ydGVkIHRvIGV4dGVuc2lvbnNcbiAqL1xuZXhwb3J0IGNsYXNzIERhdGFUcmFuc2ZlckZpbGUgaW1wbGVtZW50cyB2c2NvZGUuRGF0YVRyYW5zZmVyRmlsZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHVyaTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgX2l0ZW1JZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nZXREYXRhOiAoKSA9PiBQcm9taXNlPFVpbnQ4QXJyYXk+O1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgdXJpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkLCBpdGVtSWQ6IHN0cmluZywgZ2V0RGF0YTogKCkgPT4gUHJvbWlzZTxVaW50OEFycmF5Pikge1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cdFx0dGhpcy5faXRlbUlkID0gaXRlbUlkO1xuXHRcdHRoaXMuX2dldERhdGEgPSBnZXREYXRhO1xuXHR9XG5cblx0ZGF0YSgpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RGF0YSgpO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERhdGFUcmFuc2ZlciBpbXBsZW1lbnRzIHZzY29kZS5EYXRhVHJhbnNmZXIge1xuXHQjaXRlbXMgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW1bXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihpbml0PzogSXRlcmFibGU8cmVhZG9ubHkgW3N0cmluZywgdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW1dPikge1xuXHRcdGZvciAoY29uc3QgW21pbWUsIGl0ZW1dIG9mIGluaXQgPz8gW10pIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy4jaXRlbXMuZ2V0KHRoaXMuI25vcm1hbGl6ZU1pbWUobWltZSkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLnB1c2goaXRlbSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiNpdGVtcy5zZXQodGhpcy4jbm9ybWFsaXplTWltZShtaW1lKSwgW2l0ZW1dKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXQobWltZVR5cGU6IHN0cmluZyk6IHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jaXRlbXMuZ2V0KHRoaXMuI25vcm1hbGl6ZU1pbWUobWltZVR5cGUpKT8uWzBdO1xuXHR9XG5cblx0c2V0KG1pbWVUeXBlOiBzdHJpbmcsIHZhbHVlOiB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbSk6IHZvaWQge1xuXHRcdC8vIFRoaXMgaW50ZW50aW9uYWxseSBvdmVyd3JpdGVzIGFsbCBlbnRyaWVzIGZvciBhIGdpdmVuIG1pbWV0eXBlLlxuXHRcdC8vIFRoaXMgaXMgc2ltaWxhciB0byBob3cgdGhlIERPTSBEYXRhVHJhbnNmZXIgdHlwZSB3b3Jrc1xuXHRcdHRoaXMuI2l0ZW1zLnNldCh0aGlzLiNub3JtYWxpemVNaW1lKG1pbWVUeXBlKSwgW3ZhbHVlXSk7XG5cdH1cblxuXHRmb3JFYWNoKGNhbGxiYWNrZm46ICh2YWx1ZTogdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW0sIGtleTogc3RyaW5nLCBkYXRhVHJhbnNmZXI6IERhdGFUcmFuc2ZlcikgPT4gdm9pZCwgdGhpc0FyZz86IHVua25vd24pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFttaW1lLCBpdGVtc10gb2YgdGhpcy4jaXRlbXMpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRjYWxsYmFja2ZuLmNhbGwodGhpc0FyZywgaXRlbSwgbWltZSwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0KltTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhYmxlSXRlcmF0b3I8W21pbWVUeXBlOiBzdHJpbmcsIGl0ZW06IHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtXT4ge1xuXHRcdGZvciAoY29uc3QgW21pbWUsIGl0ZW1zXSBvZiB0aGlzLiNpdGVtcykge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdHlpZWxkIFttaW1lLCBpdGVtXTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQjbm9ybWFsaXplTWltZShtaW1lVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbWltZVR5cGUudG9Mb3dlckNhc2UoKTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEb2N1bWVudERyb3BFZGl0IHtcblx0dGl0bGU/OiBzdHJpbmc7XG5cblx0aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRpbnNlcnRUZXh0OiBzdHJpbmcgfCBTbmlwcGV0U3RyaW5nO1xuXG5cdGFkZGl0aW9uYWxFZGl0PzogV29ya3NwYWNlRWRpdDtcblxuXHRraW5kPzogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kO1xuXG5cdGNvbnN0cnVjdG9yKGluc2VydFRleHQ6IHN0cmluZyB8IFNuaXBwZXRTdHJpbmcsIHRpdGxlPzogc3RyaW5nLCBraW5kPzogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKSB7XG5cdFx0dGhpcy5pbnNlcnRUZXh0ID0gaW5zZXJ0VGV4dDtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQge1xuXHRBdXRvbWF0aWMgPSAwLFxuXHRQYXN0ZUFzID0gMSxcbn1cblxuZXhwb3J0IGNsYXNzIERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCB7XG5cdHN0YXRpYyBFbXB0eTogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kO1xuXHRzdGF0aWMgVGV4dDogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kO1xuXHRzdGF0aWMgVGV4dFVwZGF0ZUltcG9ydHM6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZDtcblxuXHRwcml2YXRlIHN0YXRpYyBzZXAgPSAnLic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHZhbHVlOiBzdHJpbmdcblx0KSB7IH1cblxuXHRwdWJsaWMgYXBwZW5kKC4uLnBhcnRzOiBzdHJpbmdbXSk6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCB7XG5cdFx0cmV0dXJuIG5ldyBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQoKHRoaXMudmFsdWUgPyBbdGhpcy52YWx1ZSwgLi4ucGFydHNdIDogcGFydHMpLmpvaW4oRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLnNlcCkpO1xuXHR9XG5cblx0cHVibGljIGludGVyc2VjdHMob3RoZXI6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5zKG90aGVyKSB8fCBvdGhlci5jb250YWlucyh0aGlzKTtcblx0fVxuXG5cdHB1YmxpYyBjb250YWlucyhvdGhlcjogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlIHx8IG90aGVyLnZhbHVlLnN0YXJ0c1dpdGgodGhpcy52YWx1ZSArIERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZC5zZXApO1xuXHR9XG59XG5Eb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQuRW1wdHkgPSBuZXcgRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKCcnKTtcbkRvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZC5UZXh0ID0gbmV3IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCgndGV4dCcpO1xuRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLlRleHRVcGRhdGVJbXBvcnRzID0gRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLlRleHQuYXBwZW5kKCd1cGRhdGVJbXBvcnRzJyk7XG5cbmV4cG9ydCBjbGFzcyBEb2N1bWVudFBhc3RlRWRpdCB7XG5cblx0dGl0bGU6IHN0cmluZztcblx0aW5zZXJ0VGV4dDogc3RyaW5nIHwgU25pcHBldFN0cmluZztcblx0YWRkaXRpb25hbEVkaXQ/OiBXb3Jrc3BhY2VFZGl0O1xuXHRraW5kOiBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQ7XG5cblx0Y29uc3RydWN0b3IoaW5zZXJ0VGV4dDogc3RyaW5nIHwgU25pcHBldFN0cmluZywgdGl0bGU6IHN0cmluZywga2luZDogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKSB7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMuaW5zZXJ0VGV4dCA9IGluc2VydFRleHQ7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUaGVtZUljb24ge1xuXG5cdHN0YXRpYyBGaWxlOiBUaGVtZUljb247XG5cdHN0YXRpYyBGb2xkZXI6IFRoZW1lSWNvbjtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBjb2xvcj86IFRoZW1lQ29sb3I7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgY29sb3I/OiBUaGVtZUNvbG9yKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMuY29sb3IgPSBjb2xvcjtcblx0fVxuXG5cdHN0YXRpYyBpc1RoZW1lSWNvbih0aGluZzogYW55KSB7XG5cdFx0aWYgKHR5cGVvZiB0aGluZy5pZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIFRoZW1lSWNvbiwgaW52YWxpZCBpZCcsIHRoaW5nLmlkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblRoZW1lSWNvbi5GaWxlID0gbmV3IFRoZW1lSWNvbignZmlsZScpO1xuVGhlbWVJY29uLkZvbGRlciA9IG5ldyBUaGVtZUljb24oJ2ZvbGRlcicpO1xuXG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRoZW1lQ29sb3Ige1xuXHRpZDogc3RyaW5nO1xuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIENvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRHbG9iYWwgPSAxLFxuXG5cdFdvcmtzcGFjZSA9IDIsXG5cblx0V29ya3NwYWNlRm9sZGVyID0gM1xufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBSZWxhdGl2ZVBhdHRlcm4gaW1wbGVtZW50cyBJUmVsYXRpdmVQYXR0ZXJuIHtcblxuXHRwYXR0ZXJuOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfYmFzZSE6IHN0cmluZztcblx0Z2V0IGJhc2UoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFzZTtcblx0fVxuXHRzZXQgYmFzZShiYXNlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9iYXNlID0gYmFzZTtcblx0XHR0aGlzLl9iYXNlVXJpID0gVVJJLmZpbGUoYmFzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9iYXNlVXJpITogVVJJO1xuXHRnZXQgYmFzZVVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9iYXNlVXJpO1xuXHR9XG5cdHNldCBiYXNlVXJpKGJhc2VVcmk6IFVSSSkge1xuXHRcdHRoaXMuX2Jhc2VVcmkgPSBiYXNlVXJpO1xuXHRcdHRoaXMuX2Jhc2UgPSBiYXNlVXJpLmZzUGF0aDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGJhc2U6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCBVUkkgfCBzdHJpbmcsIHBhdHRlcm46IHN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgYmFzZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGlmICghYmFzZSB8fCAhVVJJLmlzVXJpKGJhc2UpICYmICFVUkkuaXNVcmkoYmFzZS51cmkpKSB7XG5cdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnYmFzZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgcGF0dGVybiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncGF0dGVybicpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgYmFzZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuYmFzZVVyaSA9IFVSSS5maWxlKGJhc2UpO1xuXHRcdH0gZWxzZSBpZiAoVVJJLmlzVXJpKGJhc2UpKSB7XG5cdFx0XHR0aGlzLmJhc2VVcmkgPSBiYXNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJhc2VVcmkgPSBiYXNlLnVyaTtcblx0XHR9XG5cblx0XHR0aGlzLnBhdHRlcm4gPSBwYXR0ZXJuO1xuXHR9XG5cblx0dG9KU09OKCk6IElSZWxhdGl2ZVBhdHRlcm5EdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXR0ZXJuOiB0aGlzLnBhdHRlcm4sXG5cdFx0XHRiYXNlOiB0aGlzLmJhc2UsXG5cdFx0XHRiYXNlVXJpOiB0aGlzLmJhc2VVcmkudG9KU09OKClcblx0XHR9O1xuXHR9XG59XG5cbmNvbnN0IGJyZWFrcG9pbnRJZHMgPSBuZXcgV2Vha01hcDxCcmVha3BvaW50LCBzdHJpbmc+KCk7XG5cbi8qKlxuICogV2Ugd2FudCB0byBiZSBhYmxlIHRvIGNvbnN0cnVjdCBCcmVha3BvaW50cyBpbnRlcm5hbGx5IHRoYXQgaGF2ZSBhIHBhcnRpY3VsYXIgaWQsIGJ1dCB3ZSBkb24ndCB3YW50IGV4dGVuc2lvbnMgdG8gYmVcbiAqIGFibGUgdG8gZG8gdGhpcyB3aXRoIHRoZSBleHBvc2VkIEJyZWFrcG9pbnQgY2xhc3NlcyBpbiBleHRlbnNpb24gQVBJLlxuICogV2UgYWxzbyB3YW50IFwiaW5zdGFuY2VvZlwiIHRvIHdvcmsgd2l0aCBkZWJ1Zy5icmVha3BvaW50cyBhbmQgdGhlIGV4cG9zZWQgYnJlYWtwb2ludCBjbGFzc2VzLlxuICogQW5kIHByaXZhdGUgbWVtYmVycyB3aWxsIGJlIHJlbmFtZWQgaW4gdGhlIGJ1aWx0IGpzLCBzbyBjYXN0aW5nIHRvIGFueSBhbmQgc2V0dGluZyBhIHByaXZhdGUgbWVtYmVyIGlzIG5vdCBzYWZlLlxuICogU28sIHdlIHN0b3JlIGludGVybmFsIGJyZWFrcG9pbnQgSURzIGluIGEgV2Vha01hcC4gVGhpcyBmdW5jdGlvbiBtdXN0IGJlIGNhbGxlZCBhZnRlciBjb25zdHJ1Y3RpbmcgYSBCcmVha3BvaW50XG4gKiB3aXRoIGEga25vd24gaWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRCcmVha3BvaW50SWQoYnA6IEJyZWFrcG9pbnQsIGlkOiBzdHJpbmcpIHtcblx0YnJlYWtwb2ludElkcy5zZXQoYnAsIGlkKTtcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgQnJlYWtwb2ludCB7XG5cblx0cHJpdmF0ZSBfaWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBjb25kaXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhpdENvbmRpdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgbG9nTWVzc2FnZT86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZT86IHN0cmluZztcblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3IoZW5hYmxlZD86IGJvb2xlYW4sIGNvbmRpdGlvbj86IHN0cmluZywgaGl0Q29uZGl0aW9uPzogc3RyaW5nLCBsb2dNZXNzYWdlPzogc3RyaW5nLCBtb2RlPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5lbmFibGVkID0gdHlwZW9mIGVuYWJsZWQgPT09ICdib29sZWFuJyA/IGVuYWJsZWQgOiB0cnVlO1xuXHRcdGlmICh0eXBlb2YgY29uZGl0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5jb25kaXRpb24gPSBjb25kaXRpb247XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgaGl0Q29uZGl0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5oaXRDb25kaXRpb24gPSBoaXRDb25kaXRpb247XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbG9nTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMubG9nTWVzc2FnZSA9IGxvZ01lc3NhZ2U7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMubW9kZSA9IG1vZGU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9pZCkge1xuXHRcdFx0dGhpcy5faWQgPSBicmVha3BvaW50SWRzLmdldCh0aGlzKSA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFNvdXJjZUJyZWFrcG9pbnQgZXh0ZW5kcyBCcmVha3BvaW50IHtcblx0cmVhZG9ubHkgbG9jYXRpb246IExvY2F0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKGxvY2F0aW9uOiBMb2NhdGlvbiwgZW5hYmxlZD86IGJvb2xlYW4sIGNvbmRpdGlvbj86IHN0cmluZywgaGl0Q29uZGl0aW9uPzogc3RyaW5nLCBsb2dNZXNzYWdlPzogc3RyaW5nLCBtb2RlPzogc3RyaW5nKSB7XG5cdFx0c3VwZXIoZW5hYmxlZCwgY29uZGl0aW9uLCBoaXRDb25kaXRpb24sIGxvZ01lc3NhZ2UsIG1vZGUpO1xuXHRcdGlmIChsb2NhdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdsb2NhdGlvbicpO1xuXHRcdH1cblx0XHR0aGlzLmxvY2F0aW9uID0gbG9jYXRpb247XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRnVuY3Rpb25CcmVha3BvaW50IGV4dGVuZHMgQnJlYWtwb2ludCB7XG5cdHJlYWRvbmx5IGZ1bmN0aW9uTmFtZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGZ1bmN0aW9uTmFtZTogc3RyaW5nLCBlbmFibGVkPzogYm9vbGVhbiwgY29uZGl0aW9uPzogc3RyaW5nLCBoaXRDb25kaXRpb24/OiBzdHJpbmcsIGxvZ01lc3NhZ2U/OiBzdHJpbmcsIG1vZGU/OiBzdHJpbmcpIHtcblx0XHRzdXBlcihlbmFibGVkLCBjb25kaXRpb24sIGhpdENvbmRpdGlvbiwgbG9nTWVzc2FnZSwgbW9kZSk7XG5cdFx0dGhpcy5mdW5jdGlvbk5hbWUgPSBmdW5jdGlvbk5hbWU7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGF0YUJyZWFrcG9pbnQgZXh0ZW5kcyBCcmVha3BvaW50IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGF0YUlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhblBlcnNpc3Q6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IobGFiZWw6IHN0cmluZywgZGF0YUlkOiBzdHJpbmcsIGNhblBlcnNpc3Q6IGJvb2xlYW4sIGVuYWJsZWQ/OiBib29sZWFuLCBjb25kaXRpb24/OiBzdHJpbmcsIGhpdENvbmRpdGlvbj86IHN0cmluZywgbG9nTWVzc2FnZT86IHN0cmluZywgbW9kZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGVuYWJsZWQsIGNvbmRpdGlvbiwgaGl0Q29uZGl0aW9uLCBsb2dNZXNzYWdlLCBtb2RlKTtcblx0XHRpZiAoIWRhdGFJZCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdkYXRhSWQnKTtcblx0XHR9XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuZGF0YUlkID0gZGF0YUlkO1xuXHRcdHRoaXMuY2FuUGVyc2lzdCA9IGNhblBlcnNpc3Q7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGVidWdBZGFwdGVyRXhlY3V0YWJsZSBpbXBsZW1lbnRzIHZzY29kZS5EZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlIHtcblx0cmVhZG9ubHkgY29tbWFuZDogc3RyaW5nO1xuXHRyZWFkb25seSBhcmdzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgb3B0aW9ucz86IHZzY29kZS5EZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlT3B0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBvcHRpb25zPzogdnNjb2RlLkRlYnVnQWRhcHRlckV4ZWN1dGFibGVPcHRpb25zKSB7XG5cdFx0dGhpcy5jb21tYW5kID0gY29tbWFuZDtcblx0XHR0aGlzLmFyZ3MgPSBhcmdzIHx8IFtdO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGVidWdBZGFwdGVyU2VydmVyIGltcGxlbWVudHMgdnNjb2RlLkRlYnVnQWRhcHRlclNlcnZlciB7XG5cdHJlYWRvbmx5IHBvcnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgaG9zdD86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihwb3J0OiBudW1iZXIsIGhvc3Q/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnBvcnQgPSBwb3J0O1xuXHRcdHRoaXMuaG9zdCA9IGhvc3Q7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyIGltcGxlbWVudHMgdnNjb2RlLkRlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBwYXRoOiBzdHJpbmcpIHtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbiBpbXBsZW1lbnRzIHZzY29kZS5EZWJ1Z0FkYXB0ZXJJbmxpbmVJbXBsZW1lbnRhdGlvbiB7XG5cdHJlYWRvbmx5IGltcGxlbWVudGF0aW9uOiB2c2NvZGUuRGVidWdBZGFwdGVyO1xuXG5cdGNvbnN0cnVjdG9yKGltcGw6IHZzY29kZS5EZWJ1Z0FkYXB0ZXIpIHtcblx0XHR0aGlzLmltcGxlbWVudGF0aW9uID0gaW1wbDtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1N0YWNrRnJhbWUgaW1wbGVtZW50cyB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb246IHZzY29kZS5EZWJ1Z1Nlc3Npb24sXG5cdFx0cmVhZG9ubHkgdGhyZWFkSWQ6IG51bWJlcixcblx0XHRyZWFkb25seSBmcmFtZUlkOiBudW1iZXIpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdUaHJlYWQgaW1wbGVtZW50cyB2c2NvZGUuRGVidWdUaHJlYWQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Vzc2lvbjogdnNjb2RlLkRlYnVnU2Vzc2lvbixcblx0XHRyZWFkb25seSB0aHJlYWRJZDogbnVtYmVyKSB7IH1cbn1cblxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBFdmFsdWF0YWJsZUV4cHJlc3Npb24gaW1wbGVtZW50cyB2c2NvZGUuRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcblx0cmVhZG9ubHkgcmFuZ2U6IHZzY29kZS5SYW5nZTtcblx0cmVhZG9ubHkgZXhwcmVzc2lvbj86IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogdnNjb2RlLlJhbmdlLCBleHByZXNzaW9uPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuZXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kIHtcblx0SW52b2tlID0gMCxcblx0QXV0b21hdGljID0gMSxcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZCB7XG5cdE90aGVyID0gMCxcblx0RW1wdHkgPSAxLFxuXHRUb2tlbkNhbmNlbGxhdGlvbiA9IDIsXG5cdExvc3RSYWNlID0gMyxcblx0Tm90VGFrZW4gPSA0LFxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVWYWx1ZVRleHQgaW1wbGVtZW50cyB2c2NvZGUuSW5saW5lVmFsdWVUZXh0IHtcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy50ZXh0ID0gdGV4dDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwIGltcGxlbWVudHMgdnNjb2RlLklubGluZVZhbHVlVmFyaWFibGVMb29rdXAge1xuXHRyZWFkb25seSByYW5nZTogUmFuZ2U7XG5cdHJlYWRvbmx5IHZhcmlhYmxlTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgY2FzZVNlbnNpdGl2ZUxvb2t1cDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIHZhcmlhYmxlTmFtZT86IHN0cmluZywgY2FzZVNlbnNpdGl2ZUxvb2t1cDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy52YXJpYWJsZU5hbWUgPSB2YXJpYWJsZU5hbWU7XG5cdFx0dGhpcy5jYXNlU2Vuc2l0aXZlTG9va3VwID0gY2FzZVNlbnNpdGl2ZUxvb2t1cDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVWYWx1ZUV2YWx1YXRhYmxlRXhwcmVzc2lvbiBpbXBsZW1lbnRzIHZzY29kZS5JbmxpbmVWYWx1ZUV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XG5cdHJlYWRvbmx5IHJhbmdlOiBSYW5nZTtcblx0cmVhZG9ubHkgZXhwcmVzc2lvbj86IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIGV4cHJlc3Npb24/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5leHByZXNzaW9uID0gZXhwcmVzc2lvbjtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVWYWx1ZUNvbnRleHQgaW1wbGVtZW50cyB2c2NvZGUuSW5saW5lVmFsdWVDb250ZXh0IHtcblxuXHRyZWFkb25seSBmcmFtZUlkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0b3BwZWRMb2NhdGlvbjogdnNjb2RlLlJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKGZyYW1lSWQ6IG51bWJlciwgcmFuZ2U6IHZzY29kZS5SYW5nZSkge1xuXHRcdHRoaXMuZnJhbWVJZCA9IGZyYW1lSWQ7XG5cdFx0dGhpcy5zdG9wcGVkTG9jYXRpb24gPSByYW5nZTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBOZXdTeW1ib2xOYW1lVGFnIHtcblx0QUlHZW5lcmF0ZWQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDAsXG5cdEF1dG9tYXRpYyA9IDEsXG59XG5cbmV4cG9ydCBjbGFzcyBOZXdTeW1ib2xOYW1lIGltcGxlbWVudHMgdnNjb2RlLk5ld1N5bWJvbE5hbWUge1xuXHRyZWFkb25seSBuZXdTeW1ib2xOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRhZ3M/OiByZWFkb25seSB2c2NvZGUuTmV3U3ltYm9sTmFtZVRhZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG5ld1N5bWJvbE5hbWU6IHN0cmluZyxcblx0XHR0YWdzPzogcmVhZG9ubHkgTmV3U3ltYm9sTmFtZVRhZ1tdXG5cdCkge1xuXHRcdHRoaXMubmV3U3ltYm9sTmFtZSA9IG5ld1N5bWJvbE5hbWU7XG5cdFx0dGhpcy50YWdzID0gdGFncztcblx0fVxufVxuXG4vLyNyZWdpb24gZmlsZSBhcGlcblxuZXhwb3J0IGVudW0gRmlsZUNoYW5nZVR5cGUge1xuXHRDaGFuZ2VkID0gMSxcblx0Q3JlYXRlZCA9IDIsXG5cdERlbGV0ZWQgPSAzLFxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBGaWxlU3lzdGVtRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cblx0c3RhdGljIEZpbGVFeGlzdHMobWVzc2FnZU9yVXJpPzogc3RyaW5nIHwgVVJJKTogRmlsZVN5c3RlbUVycm9yIHtcblx0XHRyZXR1cm4gbmV3IEZpbGVTeXN0ZW1FcnJvcihtZXNzYWdlT3JVcmksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzLCBGaWxlU3lzdGVtRXJyb3IuRmlsZUV4aXN0cyk7XG5cdH1cblx0c3RhdGljIEZpbGVOb3RGb3VuZChtZXNzYWdlT3JVcmk/OiBzdHJpbmcgfCBVUkkpOiBGaWxlU3lzdGVtRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgRmlsZVN5c3RlbUVycm9yKG1lc3NhZ2VPclVyaSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCwgRmlsZVN5c3RlbUVycm9yLkZpbGVOb3RGb3VuZCk7XG5cdH1cblx0c3RhdGljIEZpbGVOb3RBRGlyZWN0b3J5KG1lc3NhZ2VPclVyaT86IHN0cmluZyB8IFVSSSk6IEZpbGVTeXN0ZW1FcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlU3lzdGVtRXJyb3IobWVzc2FnZU9yVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEFEaXJlY3RvcnksIEZpbGVTeXN0ZW1FcnJvci5GaWxlTm90QURpcmVjdG9yeSk7XG5cdH1cblx0c3RhdGljIEZpbGVJc0FEaXJlY3RvcnkobWVzc2FnZU9yVXJpPzogc3RyaW5nIHwgVVJJKTogRmlsZVN5c3RlbUVycm9yIHtcblx0XHRyZXR1cm4gbmV3IEZpbGVTeXN0ZW1FcnJvcihtZXNzYWdlT3JVcmksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlSXNBRGlyZWN0b3J5LCBGaWxlU3lzdGVtRXJyb3IuRmlsZUlzQURpcmVjdG9yeSk7XG5cdH1cblx0c3RhdGljIE5vUGVybWlzc2lvbnMobWVzc2FnZU9yVXJpPzogc3RyaW5nIHwgVVJJKTogRmlsZVN5c3RlbUVycm9yIHtcblx0XHRyZXR1cm4gbmV3IEZpbGVTeXN0ZW1FcnJvcihtZXNzYWdlT3JVcmksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zLCBGaWxlU3lzdGVtRXJyb3IuTm9QZXJtaXNzaW9ucyk7XG5cdH1cblx0c3RhdGljIFVuYXZhaWxhYmxlKG1lc3NhZ2VPclVyaT86IHN0cmluZyB8IFVSSSk6IEZpbGVTeXN0ZW1FcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlU3lzdGVtRXJyb3IobWVzc2FnZU9yVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUsIEZpbGVTeXN0ZW1FcnJvci5VbmF2YWlsYWJsZSk7XG5cdH1cblxuXHRyZWFkb25seSBjb2RlOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodXJpT3JNZXNzYWdlPzogc3RyaW5nIHwgVVJJLCBjb2RlOiBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUgPSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5rbm93biwgdGVybWluYXRvcj86IEZ1bmN0aW9uKSB7XG5cdFx0c3VwZXIoVVJJLmlzVXJpKHVyaU9yTWVzc2FnZSkgPyB1cmlPck1lc3NhZ2UudG9TdHJpbmcodHJ1ZSkgOiB1cmlPck1lc3NhZ2UpO1xuXG5cdFx0dGhpcy5jb2RlID0gdGVybWluYXRvcj8ubmFtZSA/PyAnVW5rbm93bic7XG5cblx0XHQvLyBtYXJrIHRoZSBlcnJvciBhcyBmaWxlIHN5c3RlbSBwcm92aWRlciBlcnJvciBzbyB0aGF0XG5cdFx0Ly8gd2UgY2FuIGV4dHJhY3QgdGhlIGVycm9yIGNvZGUgb24gdGhlIHJlY2VpdmluZyBzaWRlXG5cdFx0bWFya0FzRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3IodGhpcywgY29kZSk7XG5cblx0XHQvLyB3b3JrYXJvdW5kIHdoZW4gZXh0ZW5kaW5nIGJ1aWx0aW4gb2JqZWN0cyBhbmQgd2hlbiBjb21waWxpbmcgdG8gRVM1LCBzZWU6XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9UeXBlU2NyaXB0LXdpa2kvYmxvYi9tYXN0ZXIvQnJlYWtpbmctQ2hhbmdlcy5tZCNleHRlbmRpbmctYnVpbHQtaW5zLWxpa2UtZXJyb3ItYXJyYXktYW5kLW1hcC1tYXktbm8tbG9uZ2VyLXdvcmtcblx0XHRPYmplY3Quc2V0UHJvdG90eXBlT2YodGhpcywgRmlsZVN5c3RlbUVycm9yLnByb3RvdHlwZSk7XG5cblx0XHRpZiAodHlwZW9mIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlID09PSAnZnVuY3Rpb24nICYmIHR5cGVvZiB0ZXJtaW5hdG9yID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHQvLyBuaWNlIHN0YWNrIHRyYWNlc1xuXHRcdFx0RXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgdGVybWluYXRvcik7XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZm9sZGluZyBhcGlcblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRm9sZGluZ1JhbmdlIHtcblxuXHRzdGFydDogbnVtYmVyO1xuXG5cdGVuZDogbnVtYmVyO1xuXG5cdGtpbmQ/OiBGb2xkaW5nUmFuZ2VLaW5kO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBraW5kPzogRm9sZGluZ1JhbmdlS2luZCkge1xuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmVuZCA9IGVuZDtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIEZvbGRpbmdSYW5nZUtpbmQge1xuXHRDb21tZW50ID0gMSxcblx0SW1wb3J0cyA9IDIsXG5cdFJlZ2lvbiA9IDNcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDb21tZW50XG5leHBvcnQgZW51bSBDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSB7XG5cdC8qKlxuXHQgKiBEZXRlcm1pbmVzIGFuIGl0ZW0gaXMgY29sbGFwc2VkXG5cdCAqL1xuXHRDb2xsYXBzZWQgPSAwLFxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyBhbiBpdGVtIGlzIGV4cGFuZGVkXG5cdCAqL1xuXHRFeHBhbmRlZCA9IDFcbn1cblxuZXhwb3J0IGVudW0gQ29tbWVudE1vZGUge1xuXHRFZGl0aW5nID0gMCxcblx0UHJldmlldyA9IDFcbn1cblxuZXhwb3J0IGVudW0gQ29tbWVudFN0YXRlIHtcblx0UHVibGlzaGVkID0gMCxcblx0RHJhZnQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRUaHJlYWRTdGF0ZSB7XG5cdFVucmVzb2x2ZWQgPSAwLFxuXHRSZXNvbHZlZCA9IDFcbn1cblxuZXhwb3J0IGVudW0gQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkge1xuXHRDdXJyZW50ID0gMCxcblx0T3V0ZGF0ZWQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRUaHJlYWRGb2N1cyB7XG5cdFJlcGx5ID0gMSxcblx0Q29tbWVudCA9IDJcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZW1hbnRpYyBDb2xvcmluZ1xuXG5leHBvcnQgY2xhc3MgU2VtYW50aWNUb2tlbnNMZWdlbmQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5UeXBlczogc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSB0b2tlbk1vZGlmaWVyczogc3RyaW5nW107XG5cblx0Y29uc3RydWN0b3IodG9rZW5UeXBlczogc3RyaW5nW10sIHRva2VuTW9kaWZpZXJzOiBzdHJpbmdbXSA9IFtdKSB7XG5cdFx0dGhpcy50b2tlblR5cGVzID0gdG9rZW5UeXBlcztcblx0XHR0aGlzLnRva2VuTW9kaWZpZXJzID0gdG9rZW5Nb2RpZmllcnM7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTdHJBcnJheU9yVW5kZWZpbmVkKGFyZzogYW55KTogYXJnIGlzIHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuICgodHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCcpIHx8IGlzU3RyaW5nQXJyYXkoYXJnKSk7XG59XG5cbmV4cG9ydCBjbGFzcyBTZW1hbnRpY1Rva2Vuc0J1aWxkZXIge1xuXG5cdHByaXZhdGUgX3ByZXZMaW5lOiBudW1iZXI7XG5cdHByaXZhdGUgX3ByZXZDaGFyOiBudW1iZXI7XG5cdHByaXZhdGUgX2RhdGFJc1NvcnRlZEFuZERlbHRhRW5jb2RlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZGF0YTogbnVtYmVyW107XG5cdHByaXZhdGUgX2RhdGFMZW46IG51bWJlcjtcblx0cHJpdmF0ZSBfdG9rZW5UeXBlU3RyVG9JbnQ6IE1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHByaXZhdGUgX3Rva2VuTW9kaWZpZXJTdHJUb0ludDogTWFwPHN0cmluZywgbnVtYmVyPjtcblx0cHJpdmF0ZSBfaGFzTGVnZW5kOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGxlZ2VuZD86IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCkge1xuXHRcdHRoaXMuX3ByZXZMaW5lID0gMDtcblx0XHR0aGlzLl9wcmV2Q2hhciA9IDA7XG5cdFx0dGhpcy5fZGF0YUlzU29ydGVkQW5kRGVsdGFFbmNvZGVkID0gdHJ1ZTtcblx0XHR0aGlzLl9kYXRhID0gW107XG5cdFx0dGhpcy5fZGF0YUxlbiA9IDA7XG5cdFx0dGhpcy5fdG9rZW5UeXBlU3RyVG9JbnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHRoaXMuX3Rva2VuTW9kaWZpZXJTdHJUb0ludCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0dGhpcy5faGFzTGVnZW5kID0gZmFsc2U7XG5cdFx0aWYgKGxlZ2VuZCkge1xuXHRcdFx0dGhpcy5faGFzTGVnZW5kID0gdHJ1ZTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsZWdlbmQudG9rZW5UeXBlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHR0aGlzLl90b2tlblR5cGVTdHJUb0ludC5zZXQobGVnZW5kLnRva2VuVHlwZXNbaV0sIGkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxlZ2VuZC50b2tlbk1vZGlmaWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHR0aGlzLl90b2tlbk1vZGlmaWVyU3RyVG9JbnQuc2V0KGxlZ2VuZC50b2tlbk1vZGlmaWVyc1tpXSwgaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHB1c2gobGluZTogbnVtYmVyLCBjaGFyOiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCB0b2tlblR5cGU6IG51bWJlciwgdG9rZW5Nb2RpZmllcnM/OiBudW1iZXIpOiB2b2lkO1xuXHRwdWJsaWMgcHVzaChyYW5nZTogUmFuZ2UsIHRva2VuVHlwZTogc3RyaW5nLCB0b2tlbk1vZGlmaWVycz86IHN0cmluZ1tdKTogdm9pZDtcblx0cHVibGljIHB1c2goYXJnMDogYW55LCBhcmcxOiBhbnksIGFyZzI6IGFueSwgYXJnMz86IGFueSwgYXJnND86IGFueSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgYXJnMCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGFyZzEgPT09ICdudW1iZXInICYmIHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgYXJnMyA9PT0gJ251bWJlcicgJiYgKHR5cGVvZiBhcmc0ID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgYXJnNCA9PT0gJ3VuZGVmaW5lZCcpKSB7XG5cdFx0XHRpZiAodHlwZW9mIGFyZzQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGFyZzQgPSAwO1xuXHRcdFx0fVxuXHRcdFx0Ly8gMXN0IG92ZXJsb2FkXG5cdFx0XHRyZXR1cm4gdGhpcy5fcHVzaEVuY29kZWQoYXJnMCwgYXJnMSwgYXJnMiwgYXJnMywgYXJnNCk7XG5cdFx0fVxuXHRcdGlmIChSYW5nZS5pc1JhbmdlKGFyZzApICYmIHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJyAmJiBpc1N0ckFycmF5T3JVbmRlZmluZWQoYXJnMikpIHtcblx0XHRcdC8vIDJuZCBvdmVybG9hZFxuXHRcdFx0cmV0dXJuIHRoaXMuX3B1c2goYXJnMCwgYXJnMSwgYXJnMik7XG5cdFx0fVxuXHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVzaChyYW5nZTogdnNjb2RlLlJhbmdlLCB0b2tlblR5cGU6IHN0cmluZywgdG9rZW5Nb2RpZmllcnM/OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzTGVnZW5kKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xlZ2VuZCBtdXN0IGJlIHByb3ZpZGVkIGluIGNvbnN0cnVjdG9yJyk7XG5cdFx0fVxuXHRcdGlmIChyYW5nZS5zdGFydC5saW5lICE9PSByYW5nZS5lbmQubGluZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdgcmFuZ2VgIGNhbm5vdCBzcGFuIG11bHRpcGxlIGxpbmVzJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdG9rZW5UeXBlU3RyVG9JbnQuaGFzKHRva2VuVHlwZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYHRva2VuVHlwZWAgaXMgbm90IGluIHRoZSBwcm92aWRlZCBsZWdlbmQnKTtcblx0XHR9XG5cdFx0Y29uc3QgbGluZSA9IHJhbmdlLnN0YXJ0LmxpbmU7XG5cdFx0Y29uc3QgY2hhciA9IHJhbmdlLnN0YXJ0LmNoYXJhY3Rlcjtcblx0XHRjb25zdCBsZW5ndGggPSByYW5nZS5lbmQuY2hhcmFjdGVyIC0gcmFuZ2Uuc3RhcnQuY2hhcmFjdGVyO1xuXHRcdGNvbnN0IG5Ub2tlblR5cGUgPSB0aGlzLl90b2tlblR5cGVTdHJUb0ludC5nZXQodG9rZW5UeXBlKSE7XG5cdFx0bGV0IG5Ub2tlbk1vZGlmaWVycyA9IDA7XG5cdFx0aWYgKHRva2VuTW9kaWZpZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRva2VuTW9kaWZpZXIgb2YgdG9rZW5Nb2RpZmllcnMpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl90b2tlbk1vZGlmaWVyU3RyVG9JbnQuaGFzKHRva2VuTW9kaWZpZXIpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdgdG9rZW5Nb2RpZmllcmAgaXMgbm90IGluIHRoZSBwcm92aWRlZCBsZWdlbmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuVG9rZW5Nb2RpZmllciA9IHRoaXMuX3Rva2VuTW9kaWZpZXJTdHJUb0ludC5nZXQodG9rZW5Nb2RpZmllcikhO1xuXHRcdFx0XHRuVG9rZW5Nb2RpZmllcnMgfD0gKDEgPDwgblRva2VuTW9kaWZpZXIpID4+PiAwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9wdXNoRW5jb2RlZChsaW5lLCBjaGFyLCBsZW5ndGgsIG5Ub2tlblR5cGUsIG5Ub2tlbk1vZGlmaWVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9wdXNoRW5jb2RlZChsaW5lOiBudW1iZXIsIGNoYXI6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIHRva2VuVHlwZTogbnVtYmVyLCB0b2tlbk1vZGlmaWVyczogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RhdGFJc1NvcnRlZEFuZERlbHRhRW5jb2RlZCAmJiAobGluZSA8IHRoaXMuX3ByZXZMaW5lIHx8IChsaW5lID09PSB0aGlzLl9wcmV2TGluZSAmJiBjaGFyIDwgdGhpcy5fcHJldkNoYXIpKSkge1xuXHRcdFx0Ly8gcHVzaCBjYWxscyB3ZXJlIG9yZGVyZWQgYW5kIGFyZSBubyBsb25nZXIgb3JkZXJlZFxuXHRcdFx0dGhpcy5fZGF0YUlzU29ydGVkQW5kRGVsdGFFbmNvZGVkID0gZmFsc2U7XG5cblx0XHRcdC8vIFJlbW92ZSBkZWx0YSBlbmNvZGluZyBmcm9tIGRhdGFcblx0XHRcdGNvbnN0IHRva2VuQ291bnQgPSAodGhpcy5fZGF0YS5sZW5ndGggLyA1KSB8IDA7XG5cdFx0XHRsZXQgcHJldkxpbmUgPSAwO1xuXHRcdFx0bGV0IHByZXZDaGFyID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5Db3VudDsgaSsrKSB7XG5cdFx0XHRcdGxldCBsaW5lID0gdGhpcy5fZGF0YVs1ICogaV07XG5cdFx0XHRcdGxldCBjaGFyID0gdGhpcy5fZGF0YVs1ICogaSArIDFdO1xuXG5cdFx0XHRcdGlmIChsaW5lID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gb24gdGhlIHNhbWUgbGluZSBhcyBwcmV2aW91cyB0b2tlblxuXHRcdFx0XHRcdGxpbmUgPSBwcmV2TGluZTtcblx0XHRcdFx0XHRjaGFyICs9IHByZXZDaGFyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIG9uIGEgZGlmZmVyZW50IGxpbmUgdGhhbiBwcmV2aW91cyB0b2tlblxuXHRcdFx0XHRcdGxpbmUgKz0gcHJldkxpbmU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9kYXRhWzUgKiBpXSA9IGxpbmU7XG5cdFx0XHRcdHRoaXMuX2RhdGFbNSAqIGkgKyAxXSA9IGNoYXI7XG5cblx0XHRcdFx0cHJldkxpbmUgPSBsaW5lO1xuXHRcdFx0XHRwcmV2Q2hhciA9IGNoYXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHB1c2hMaW5lID0gbGluZTtcblx0XHRsZXQgcHVzaENoYXIgPSBjaGFyO1xuXHRcdGlmICh0aGlzLl9kYXRhSXNTb3J0ZWRBbmREZWx0YUVuY29kZWQgJiYgdGhpcy5fZGF0YUxlbiA+IDApIHtcblx0XHRcdHB1c2hMaW5lIC09IHRoaXMuX3ByZXZMaW5lO1xuXHRcdFx0aWYgKHB1c2hMaW5lID09PSAwKSB7XG5cdFx0XHRcdHB1c2hDaGFyIC09IHRoaXMuX3ByZXZDaGFyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2RhdGFbdGhpcy5fZGF0YUxlbisrXSA9IHB1c2hMaW5lO1xuXHRcdHRoaXMuX2RhdGFbdGhpcy5fZGF0YUxlbisrXSA9IHB1c2hDaGFyO1xuXHRcdHRoaXMuX2RhdGFbdGhpcy5fZGF0YUxlbisrXSA9IGxlbmd0aDtcblx0XHR0aGlzLl9kYXRhW3RoaXMuX2RhdGFMZW4rK10gPSB0b2tlblR5cGU7XG5cdFx0dGhpcy5fZGF0YVt0aGlzLl9kYXRhTGVuKytdID0gdG9rZW5Nb2RpZmllcnM7XG5cblx0XHR0aGlzLl9wcmV2TGluZSA9IGxpbmU7XG5cdFx0dGhpcy5fcHJldkNoYXIgPSBjaGFyO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NvcnRBbmREZWx0YUVuY29kZShkYXRhOiBudW1iZXJbXSk6IFVpbnQzMkFycmF5IHtcblx0XHRjb25zdCBwb3M6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IChkYXRhLmxlbmd0aCAvIDUpIHwgMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0cG9zW2ldID0gaTtcblx0XHR9XG5cdFx0cG9zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFMaW5lID0gZGF0YVs1ICogYV07XG5cdFx0XHRjb25zdCBiTGluZSA9IGRhdGFbNSAqIGJdO1xuXHRcdFx0aWYgKGFMaW5lID09PSBiTGluZSkge1xuXHRcdFx0XHRjb25zdCBhQ2hhciA9IGRhdGFbNSAqIGEgKyAxXTtcblx0XHRcdFx0Y29uc3QgYkNoYXIgPSBkYXRhWzUgKiBiICsgMV07XG5cdFx0XHRcdHJldHVybiBhQ2hhciAtIGJDaGFyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFMaW5lIC0gYkxpbmU7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KGRhdGEubGVuZ3RoKTtcblx0XHRsZXQgcHJldkxpbmUgPSAwO1xuXHRcdGxldCBwcmV2Q2hhciA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHNyY09mZnNldCA9IDUgKiBwb3NbaV07XG5cdFx0XHRjb25zdCBsaW5lID0gZGF0YVtzcmNPZmZzZXQgKyAwXTtcblx0XHRcdGNvbnN0IGNoYXIgPSBkYXRhW3NyY09mZnNldCArIDFdO1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gZGF0YVtzcmNPZmZzZXQgKyAyXTtcblx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IGRhdGFbc3JjT2Zmc2V0ICsgM107XG5cdFx0XHRjb25zdCB0b2tlbk1vZGlmaWVycyA9IGRhdGFbc3JjT2Zmc2V0ICsgNF07XG5cblx0XHRcdGNvbnN0IHB1c2hMaW5lID0gbGluZSAtIHByZXZMaW5lO1xuXHRcdFx0Y29uc3QgcHVzaENoYXIgPSAocHVzaExpbmUgPT09IDAgPyBjaGFyIC0gcHJldkNoYXIgOiBjaGFyKTtcblxuXHRcdFx0Y29uc3QgZHN0T2Zmc2V0ID0gNSAqIGk7XG5cdFx0XHRyZXN1bHRbZHN0T2Zmc2V0ICsgMF0gPSBwdXNoTGluZTtcblx0XHRcdHJlc3VsdFtkc3RPZmZzZXQgKyAxXSA9IHB1c2hDaGFyO1xuXHRcdFx0cmVzdWx0W2RzdE9mZnNldCArIDJdID0gbGVuZ3RoO1xuXHRcdFx0cmVzdWx0W2RzdE9mZnNldCArIDNdID0gdG9rZW5UeXBlO1xuXHRcdFx0cmVzdWx0W2RzdE9mZnNldCArIDRdID0gdG9rZW5Nb2RpZmllcnM7XG5cblx0XHRcdHByZXZMaW5lID0gbGluZTtcblx0XHRcdHByZXZDaGFyID0gY2hhcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGJ1aWxkKHJlc3VsdElkPzogc3RyaW5nKTogU2VtYW50aWNUb2tlbnMge1xuXHRcdGlmICghdGhpcy5fZGF0YUlzU29ydGVkQW5kRGVsdGFFbmNvZGVkKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNlbWFudGljVG9rZW5zKFNlbWFudGljVG9rZW5zQnVpbGRlci5fc29ydEFuZERlbHRhRW5jb2RlKHRoaXMuX2RhdGEpLCByZXN1bHRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2VtYW50aWNUb2tlbnMobmV3IFVpbnQzMkFycmF5KHRoaXMuX2RhdGEpLCByZXN1bHRJZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbWFudGljVG9rZW5zIHtcblx0cmVhZG9ubHkgcmVzdWx0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGF0YTogVWludDMyQXJyYXk7XG5cblx0Y29uc3RydWN0b3IoZGF0YTogVWludDMyQXJyYXksIHJlc3VsdElkPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5yZXN1bHRJZCA9IHJlc3VsdElkO1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbWFudGljVG9rZW5zRWRpdCB7XG5cdHJlYWRvbmx5IHN0YXJ0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlbGV0ZUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGRhdGE6IFVpbnQzMkFycmF5IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGRhdGE/OiBVaW50MzJBcnJheSkge1xuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLmRlbGV0ZUNvdW50ID0gZGVsZXRlQ291bnQ7XG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VtYW50aWNUb2tlbnNFZGl0cyB7XG5cdHJlYWRvbmx5IHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVkaXRzOiBTZW1hbnRpY1Rva2Vuc0VkaXRbXTtcblxuXHRjb25zdHJ1Y3RvcihlZGl0czogU2VtYW50aWNUb2tlbnNFZGl0W10sIHJlc3VsdElkPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5yZXN1bHRJZCA9IHJlc3VsdElkO1xuXHRcdHRoaXMuZWRpdHMgPSBlZGl0cztcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGRlYnVnXG5leHBvcnQgZW51bSBEZWJ1Z0NvbnNvbGVNb2RlIHtcblx0LyoqXG5cdCAqIERlYnVnIHNlc3Npb24gc2hvdWxkIGhhdmUgYSBzZXBhcmF0ZSBkZWJ1ZyBjb25zb2xlLlxuXHQgKi9cblx0U2VwYXJhdGUgPSAwLFxuXG5cdC8qKlxuXHQgKiBEZWJ1ZyBzZXNzaW9uIHNob3VsZCBzaGFyZSBkZWJ1ZyBjb25zb2xlIHdpdGggaXRzIHBhcmVudCBzZXNzaW9uLlxuXHQgKiBUaGlzIHZhbHVlIGhhcyBubyBlZmZlY3QgZm9yIHNlc3Npb25zIHdoaWNoIGRvIG5vdCBoYXZlIGEgcGFyZW50IHNlc3Npb24uXG5cdCAqL1xuXHRNZXJnZVdpdGhQYXJlbnQgPSAxXG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Zpc3VhbGl6YXRpb24ge1xuXHRpY29uUGF0aD86IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCBUaGVtZUljb247XG5cdHZpc3VhbGl6YXRpb24/OiB2c2NvZGUuQ29tbWFuZCB8IHZzY29kZS5UcmVlRGF0YVByb3ZpZGVyPHVua25vd24+O1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBuYW1lOiBzdHJpbmcpIHsgfVxufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGVudW0gUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uIHtcblx0VGl0bGUgPSAxLFxuXHRJbmxpbmUgPSAyLFxuXHRJbnB1dCA9IDNcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgUXVpY2tJbnB1dEJ1dHRvbnMge1xuXG5cdHN0YXRpYyByZWFkb25seSBCYWNrOiB2c2NvZGUuUXVpY2tJbnB1dEJ1dHRvbiA9IHsgaWNvblBhdGg6IG5ldyBUaGVtZUljb24oJ2Fycm93LWxlZnQnKSB9O1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoKSB7IH1cbn1cblxuZXhwb3J0IGVudW0gUXVpY2tQaWNrSXRlbUtpbmQge1xuXHRTZXBhcmF0b3IgPSAtMSxcblx0RGVmYXVsdCA9IDAsXG59XG5cbmV4cG9ydCBlbnVtIElucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5IHtcblx0SW5mbyA9IDEsXG5cdFdhcm5pbmcgPSAyLFxuXHRFcnJvciA9IDNcbn1cblxuZXhwb3J0IGVudW0gRXh0ZW5zaW9uS2luZCB7XG5cdFVJID0gMSxcblx0V29ya3NwYWNlID0gMlxufVxuXG5leHBvcnQgY2xhc3MgRmlsZURlY29yYXRpb24ge1xuXG5cdHN0YXRpYyB2YWxpZGF0ZShkOiBGaWxlRGVjb3JhdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgZC5iYWRnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGxldCBsZW4gPSBuZXh0Q2hhckxlbmd0aChkLmJhZGdlLCAwKTtcblx0XHRcdGlmIChsZW4gPCBkLmJhZGdlLmxlbmd0aCkge1xuXHRcdFx0XHRsZW4gKz0gbmV4dENoYXJMZW5ndGgoZC5iYWRnZSwgbGVuKTtcblx0XHRcdH1cblx0XHRcdGlmIChkLmJhZGdlLmxlbmd0aCA+IGxlbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRoZSAnYmFkZ2UnLXByb3BlcnR5IG11c3QgYmUgdW5kZWZpbmVkIG9yIGEgc2hvcnQgY2hhcmFjdGVyYCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChkLmJhZGdlKSB7XG5cdFx0XHRpZiAoIVRoZW1lSWNvbi5pc1RoZW1lSWNvbihkLmJhZGdlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRoZSAnYmFkZ2UnLXByb3BlcnR5IGlzIG5vdCBhIHZhbGlkIFRoZW1lSWNvbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWQuY29sb3IgJiYgIWQuYmFkZ2UgJiYgIWQudG9vbHRpcCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgZGVjb3JhdGlvbiBpcyBlbXB0eWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGJhZGdlPzogc3RyaW5nIHwgdnNjb2RlLlRoZW1lSWNvbjtcblx0dG9vbHRpcD86IHN0cmluZztcblx0Y29sb3I/OiB2c2NvZGUuVGhlbWVDb2xvcjtcblx0cHJvcGFnYXRlPzogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihiYWRnZT86IHN0cmluZyB8IFRoZW1lSWNvbiwgdG9vbHRpcD86IHN0cmluZywgY29sb3I/OiBUaGVtZUNvbG9yKSB7XG5cdFx0dGhpcy5iYWRnZSA9IGJhZGdlO1xuXHRcdHRoaXMudG9vbHRpcCA9IHRvb2x0aXA7XG5cdFx0dGhpcy5jb2xvciA9IGNvbG9yO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBUaGVtaW5nXG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvbG9yVGhlbWUgaW1wbGVtZW50cyB2c2NvZGUuQ29sb3JUaGVtZSB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBraW5kOiBDb2xvclRoZW1lS2luZCkge1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIENvbG9yVGhlbWVLaW5kIHtcblx0TGlnaHQgPSAxLFxuXHREYXJrID0gMixcblx0SGlnaENvbnRyYXN0ID0gMyxcblx0SGlnaENvbnRyYXN0TGlnaHQgPSA0XG59XG5cbi8vI2VuZHJlZ2lvbiBUaGVtaW5nXG4vLyNyZWdpb24gTm90ZWJvb2tcblxuZXhwb3J0IGNsYXNzIENlbGxFcnJvclN0YWNrRnJhbWUge1xuXHQvKipcblx0ICogQHBhcmFtIGxhYmVsIFRoZSBuYW1lIG9mIHRoZSBzdGFjayBmcmFtZVxuXHQgKiBAcGFyYW0gZmlsZSBUaGUgZmlsZSBVUkkgb2YgdGhlIHN0YWNrIGZyYW1lXG5cdCAqIEBwYXJhbSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gb2YgdGhlIHN0YWNrIGZyYW1lIHdpdGhpbiB0aGUgZmlsZVxuXHQgKi9cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHVyaT86IHZzY29kZS5VcmksXG5cdFx0cHVibGljIHBvc2l0aW9uPzogUG9zaXRpb24sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlIHtcblx0SWRsZSA9IDEsXG5cdFBlbmRpbmcgPSAyLFxuXHRFeGVjdXRpbmcgPSAzLFxufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0NlbGxTdGF0dXNCYXJBbGlnbm1lbnQge1xuXHRMZWZ0ID0gMSxcblx0UmlnaHQgPSAyXG59XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rRWRpdG9yUmV2ZWFsVHlwZSB7XG5cdERlZmF1bHQgPSAwLFxuXHRJbkNlbnRlciA9IDEsXG5cdEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQgPSAyLFxuXHRBdFRvcCA9IDNcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgdGV4dDogc3RyaW5nLFxuXHRcdHB1YmxpYyBhbGlnbm1lbnQ6IE5vdGVib29rQ2VsbFN0YXR1c0JhckFsaWdubWVudCkgeyB9XG59XG5cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHkge1xuXHREZWZhdWx0ID0gMSxcblx0UHJlZmVycmVkID0gMlxufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eTIge1xuXHREZWZhdWx0ID0gMSxcblx0UHJlZmVycmVkID0gMixcblx0SGlkZGVuID0gLTFcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rUmVuZGVyZXJTY3JpcHQge1xuXG5cdHB1YmxpYyBwcm92aWRlczogcmVhZG9ubHkgc3RyaW5nW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHVyaTogdnNjb2RlLlVyaSxcblx0XHRwcm92aWRlczogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10gPSBbXVxuXHQpIHtcblx0XHR0aGlzLnByb3ZpZGVzID0gYXNBcnJheShwcm92aWRlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIHtcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0Y29tbWFuZD86IHZzY29kZS5Db21tYW5kO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgbGFiZWw6IHN0cmluZ1xuXHQpIHsgfVxufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kIHtcblx0TmFtZWQgPSAxLFxuXHRJbmRleGVkID0gMlxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFRpbWVsaW5lXG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRpbWVsaW5lSXRlbSBpbXBsZW1lbnRzIHZzY29kZS5UaW1lbGluZUl0ZW0ge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbGFiZWw6IHN0cmluZywgcHVibGljIHRpbWVzdGFtcDogbnVtYmVyKSB7IH1cbn1cblxuLy8jZW5kcmVnaW9uIFRpbWVsaW5lXG5cbi8vI3JlZ2lvbiBFeHRlbnNpb25Db250ZXh0XG5cbmV4cG9ydCBlbnVtIEV4dGVuc2lvbk1vZGUge1xuXHQvKipcblx0ICogVGhlIGV4dGVuc2lvbiBpcyBpbnN0YWxsZWQgbm9ybWFsbHkgKGZvciBleGFtcGxlLCBmcm9tIHRoZSBtYXJrZXRwbGFjZVxuXHQgKiBvciBWU0lYKSBpbiBWUyBDb2RlLlxuXHQgKi9cblx0UHJvZHVjdGlvbiA9IDEsXG5cblx0LyoqXG5cdCAqIFRoZSBleHRlbnNpb24gaXMgcnVubmluZyBmcm9tIGFuIGAtLWV4dGVuc2lvbkRldmVsb3BtZW50UGF0aGAgcHJvdmlkZWRcblx0ICogd2hlbiBsYXVuY2hpbmcgVlMgQ29kZS5cblx0ICovXG5cdERldmVsb3BtZW50ID0gMixcblxuXHQvKipcblx0ICogVGhlIGV4dGVuc2lvbiBpcyBydW5uaW5nIGZyb20gYW4gYC0tZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoYCBhbmRcblx0ICogdGhlIGV4dGVuc2lvbiBob3N0IGlzIHJ1bm5pbmcgdW5pdCB0ZXN0cy5cblx0ICovXG5cdFRlc3QgPSAzLFxufVxuXG5leHBvcnQgZW51bSBFeHRlbnNpb25SdW50aW1lIHtcblx0LyoqXG5cdCAqIFRoZSBleHRlbnNpb24gaXMgcnVubmluZyBpbiBhIE5vZGVKUyBleHRlbnNpb24gaG9zdC4gUnVudGltZSBhY2Nlc3MgdG8gTm9kZUpTIEFQSXMgaXMgYXZhaWxhYmxlLlxuXHQgKi9cblx0Tm9kZSA9IDEsXG5cdC8qKlxuXHQgKiBUaGUgZXh0ZW5zaW9uIGlzIHJ1bm5pbmcgaW4gYSBXZWJ3b3JrZXIgZXh0ZW5zaW9uIGhvc3QuIFJ1bnRpbWUgYWNjZXNzIGlzIGxpbWl0ZWQgdG8gV2Vid29ya2VyIEFQSXMuXG5cdCAqL1xuXHRXZWJ3b3JrZXIgPSAyXG59XG5cbi8vI2VuZHJlZ2lvbiBFeHRlbnNpb25Db250ZXh0XG5cbmV4cG9ydCBlbnVtIFN0YW5kYXJkVG9rZW5UeXBlIHtcblx0T3RoZXIgPSAwLFxuXHRDb21tZW50ID0gMSxcblx0U3RyaW5nID0gMixcblx0UmVnRXggPSAzXG59XG5cbmV4cG9ydCBlbnVtIFN5bnRheEhpZ2hsaWdodGluZ1Rva2VuRm9udFN0eWxlIHtcblx0Tm9uZSA9IDAsXG5cdEl0YWxpYyA9IDEsXG5cdEJvbGQgPSAyLFxuXHRVbmRlcmxpbmUgPSA0LFxuXHRTdHJpa2V0aHJvdWdoID0gOCxcbn1cblxuXG5leHBvcnQgY2xhc3MgTGlua2VkRWRpdGluZ1JhbmdlcyB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSByYW5nZXM6IFJhbmdlW10sIHB1YmxpYyByZWFkb25seSB3b3JkUGF0dGVybj86IFJlZ0V4cCkge1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBwb3J0c1xuZXhwb3J0IGNsYXNzIFBvcnRBdHRyaWJ1dGVzIHtcblx0cHJpdmF0ZSBfYXV0b0ZvcndhcmRBY3Rpb246IFBvcnRBdXRvRm9yd2FyZEFjdGlvbjtcblxuXHRjb25zdHJ1Y3RvcihhdXRvRm9yd2FyZEFjdGlvbjogUG9ydEF1dG9Gb3J3YXJkQWN0aW9uKSB7XG5cdFx0dGhpcy5fYXV0b0ZvcndhcmRBY3Rpb24gPSBhdXRvRm9yd2FyZEFjdGlvbjtcblx0fVxuXG5cdGdldCBhdXRvRm9yd2FyZEFjdGlvbigpOiBQb3J0QXV0b0ZvcndhcmRBY3Rpb24ge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvRm9yd2FyZEFjdGlvbjtcblx0fVxufVxuLy8jZW5kcmVnaW9uIHBvcnRzXG5cbi8vI3JlZ2lvbiBUZXN0aW5nXG5leHBvcnQgZW51bSBUZXN0UmVzdWx0U3RhdGUge1xuXHRRdWV1ZWQgPSAxLFxuXHRSdW5uaW5nID0gMixcblx0UGFzc2VkID0gMyxcblx0RmFpbGVkID0gNCxcblx0U2tpcHBlZCA9IDUsXG5cdEVycm9yZWQgPSA2XG59XG5cbmV4cG9ydCBlbnVtIFRlc3RSdW5Qcm9maWxlS2luZCB7XG5cdFJ1biA9IDEsXG5cdERlYnVnID0gMixcblx0Q292ZXJhZ2UgPSAzLFxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJ1blByb2ZpbGVCYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRyb2xsZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9maWxlSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkga2luZDogdnNjb2RlLlRlc3RSdW5Qcm9maWxlS2luZCxcblx0KSB7IH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVGVzdFJ1blJlcXVlc3QgaW1wbGVtZW50cyB2c2NvZGUuVGVzdFJ1blJlcXVlc3Qge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5jbHVkZTogdnNjb2RlLlRlc3RJdGVtW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4Y2x1ZGU6IHZzY29kZS5UZXN0SXRlbVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9maWxlOiB2c2NvZGUuVGVzdFJ1blByb2ZpbGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRpbnVvdXMgPSBmYWxzZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJlc2VydmVGb2N1cyA9IHRydWUsXG5cdCkgeyB9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRlc3RNZXNzYWdlIGltcGxlbWVudHMgdnNjb2RlLlRlc3RNZXNzYWdlIHtcblx0cHVibGljIGV4cGVjdGVkT3V0cHV0Pzogc3RyaW5nO1xuXHRwdWJsaWMgYWN0dWFsT3V0cHV0Pzogc3RyaW5nO1xuXHRwdWJsaWMgbG9jYXRpb24/OiB2c2NvZGUuTG9jYXRpb247XG5cdHB1YmxpYyBjb250ZXh0VmFsdWU/OiBzdHJpbmc7XG5cblx0LyoqIHByb3Bvc2VkOiAqL1xuXHRwdWJsaWMgc3RhY2tUcmFjZT86IFRlc3RNZXNzYWdlU3RhY2tGcmFtZVtdO1xuXG5cdHB1YmxpYyBzdGF0aWMgZGlmZihtZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcsIGFjdHVhbDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbXNnID0gbmV3IFRlc3RNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdG1zZy5leHBlY3RlZE91dHB1dCA9IGV4cGVjdGVkO1xuXHRcdG1zZy5hY3R1YWxPdXRwdXQgPSBhY3R1YWw7XG5cdFx0cmV0dXJuIG1zZztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBtZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcpIHsgfVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUZXN0VGFnIGltcGxlbWVudHMgdnNjb2RlLlRlc3RUYWcge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TWVzc2FnZVN0YWNrRnJhbWUge1xuXHQvKipcblx0ICogQHBhcmFtIGxhYmVsIFRoZSBuYW1lIG9mIHRoZSBzdGFjayBmcmFtZVxuXHQgKiBAcGFyYW0gZmlsZSBUaGUgZmlsZSBVUkkgb2YgdGhlIHN0YWNrIGZyYW1lXG5cdCAqIEBwYXJhbSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gb2YgdGhlIHN0YWNrIGZyYW1lIHdpdGhpbiB0aGUgZmlsZVxuXHQgKi9cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHVyaT86IHZzY29kZS5VcmksXG5cdFx0cHVibGljIHBvc2l0aW9uPzogUG9zaXRpb24sXG5cdCkgeyB9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVGVzdCBDb3ZlcmFnZVxuZXhwb3J0IGNsYXNzIFRlc3RDb3ZlcmFnZUNvdW50IGltcGxlbWVudHMgdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIGNvdmVyZWQ6IG51bWJlciwgcHVibGljIHRvdGFsOiBudW1iZXIpIHtcblx0XHR2YWxpZGF0ZVRlc3RDb3ZlcmFnZUNvdW50KHRoaXMpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWxpZGF0ZVRlc3RDb3ZlcmFnZUNvdW50KGNjPzogdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50KSB7XG5cdGlmICghY2MpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAoY2MuY292ZXJlZCA+IGNjLnRvdGFsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgdG90YWwgbnVtYmVyIG9mIGNvdmVyZWQgaXRlbXMgKCR7Y2MuY292ZXJlZH0pIGNhbm5vdCBiZSBncmVhdGVyIHRoYW4gdGhlIHRvdGFsICgke2NjLnRvdGFsfSlgKTtcblx0fVxuXG5cdGlmIChjYy50b3RhbCA8IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFRoZSBudW1iZXIgb2YgY292ZXJlZCBpdGVtcyAoJHtjYy50b3RhbH0pIGNhbm5vdCBiZSBuZWdhdGl2ZWApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlQ292ZXJhZ2UgaW1wbGVtZW50cyB2c2NvZGUuRmlsZUNvdmVyYWdlIHtcblx0cHVibGljIHN0YXRpYyBmcm9tRGV0YWlscyh1cmk6IHZzY29kZS5VcmksIGRldGFpbHM6IHZzY29kZS5GaWxlQ292ZXJhZ2VEZXRhaWxbXSk6IHZzY29kZS5GaWxlQ292ZXJhZ2Uge1xuXHRcdGNvbnN0IHN0YXRlbWVudHMgPSBuZXcgVGVzdENvdmVyYWdlQ291bnQoMCwgMCk7XG5cdFx0Y29uc3QgYnJhbmNoZXMgPSBuZXcgVGVzdENvdmVyYWdlQ291bnQoMCwgMCk7XG5cdFx0Y29uc3QgZGVjbCA9IG5ldyBUZXN0Q292ZXJhZ2VDb3VudCgwLCAwKTtcblxuXHRcdGZvciAoY29uc3QgZGV0YWlsIG9mIGRldGFpbHMpIHtcblx0XHRcdGlmICgnYnJhbmNoZXMnIGluIGRldGFpbCkge1xuXHRcdFx0XHRzdGF0ZW1lbnRzLnRvdGFsICs9IDE7XG5cdFx0XHRcdHN0YXRlbWVudHMuY292ZXJlZCArPSBkZXRhaWwuZXhlY3V0ZWQgPyAxIDogMDtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGJyYW5jaCBvZiBkZXRhaWwuYnJhbmNoZXMpIHtcblx0XHRcdFx0XHRicmFuY2hlcy50b3RhbCArPSAxO1xuXHRcdFx0XHRcdGJyYW5jaGVzLmNvdmVyZWQgKz0gYnJhbmNoLmV4ZWN1dGVkID8gMSA6IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlY2wudG90YWwgKz0gMTtcblx0XHRcdFx0ZGVjbC5jb3ZlcmVkICs9IGRldGFpbC5leGVjdXRlZCA/IDEgOiAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvdmVyYWdlID0gbmV3IEZpbGVDb3ZlcmFnZShcblx0XHRcdHVyaSxcblx0XHRcdHN0YXRlbWVudHMsXG5cdFx0XHRicmFuY2hlcy50b3RhbCA+IDAgPyBicmFuY2hlcyA6IHVuZGVmaW5lZCxcblx0XHRcdGRlY2wudG90YWwgPiAwID8gZGVjbCA6IHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0Y292ZXJhZ2UuZGV0YWlsZWRDb3ZlcmFnZSA9IGRldGFpbHM7XG5cblx0XHRyZXR1cm4gY292ZXJhZ2U7XG5cdH1cblxuXHRkZXRhaWxlZENvdmVyYWdlPzogdnNjb2RlLkZpbGVDb3ZlcmFnZURldGFpbFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB1cmk6IHZzY29kZS5VcmksXG5cdFx0cHVibGljIHN0YXRlbWVudENvdmVyYWdlOiB2c2NvZGUuVGVzdENvdmVyYWdlQ291bnQsXG5cdFx0cHVibGljIGJyYW5jaENvdmVyYWdlPzogdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50LFxuXHRcdHB1YmxpYyBkZWNsYXJhdGlvbkNvdmVyYWdlPzogdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50LFxuXHRcdHB1YmxpYyBpbmNsdWRlc1Rlc3RzOiB2c2NvZGUuVGVzdEl0ZW1bXSA9IFtdLFxuXHQpIHtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdGVtZW50Q292ZXJhZ2UgaW1wbGVtZW50cyB2c2NvZGUuU3RhdGVtZW50Q292ZXJhZ2Uge1xuXHQvLyBiYWNrIGNvbXBhdCB1bnRpbCBmaW5hbGl6YXRpb246XG5cdGdldCBleGVjdXRpb25Db3VudCgpIHsgcmV0dXJuICt0aGlzLmV4ZWN1dGVkOyB9XG5cdHNldCBleGVjdXRpb25Db3VudChuOiBudW1iZXIpIHsgdGhpcy5leGVjdXRlZCA9IG47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgZXhlY3V0ZWQ6IG51bWJlciB8IGJvb2xlYW4sXG5cdFx0cHVibGljIGxvY2F0aW9uOiBQb3NpdGlvbiB8IFJhbmdlLFxuXHRcdHB1YmxpYyBicmFuY2hlczogdnNjb2RlLkJyYW5jaENvdmVyYWdlW10gPSBbXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyYW5jaENvdmVyYWdlIGltcGxlbWVudHMgdnNjb2RlLkJyYW5jaENvdmVyYWdlIHtcblx0Ly8gYmFjayBjb21wYXQgdW50aWwgZmluYWxpemF0aW9uOlxuXHRnZXQgZXhlY3V0aW9uQ291bnQoKSB7IHJldHVybiArdGhpcy5leGVjdXRlZDsgfVxuXHRzZXQgZXhlY3V0aW9uQ291bnQobjogbnVtYmVyKSB7IHRoaXMuZXhlY3V0ZWQgPSBuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGV4ZWN1dGVkOiBudW1iZXIgfCBib29sZWFuLFxuXHRcdHB1YmxpYyBsb2NhdGlvbjogUG9zaXRpb24gfCBSYW5nZSxcblx0XHRwdWJsaWMgbGFiZWw/OiBzdHJpbmcsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWNsYXJhdGlvbkNvdmVyYWdlIGltcGxlbWVudHMgdnNjb2RlLkRlY2xhcmF0aW9uQ292ZXJhZ2Uge1xuXHQvLyBiYWNrIGNvbXBhdCB1bnRpbCBmaW5hbGl6YXRpb246XG5cdGdldCBleGVjdXRpb25Db3VudCgpIHsgcmV0dXJuICt0aGlzLmV4ZWN1dGVkOyB9XG5cdHNldCBleGVjdXRpb25Db3VudChuOiBudW1iZXIpIHsgdGhpcy5leGVjdXRlZCA9IG47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyBleGVjdXRlZDogbnVtYmVyIHwgYm9vbGVhbixcblx0XHRwdWJsaWMgbG9jYXRpb246IFBvc2l0aW9uIHwgUmFuZ2UsXG5cdCkgeyB9XG59XG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGVudW0gRXh0ZXJuYWxVcmlPcGVuZXJQcmlvcml0eSB7XG5cdE5vbmUgPSAwLFxuXHRPcHRpb24gPSAxLFxuXHREZWZhdWx0ID0gMixcblx0UHJlZmVycmVkID0gMyxcbn1cblxuZXhwb3J0IGVudW0gV29ya3NwYWNlVHJ1c3RTdGF0ZSB7XG5cdFVudHJ1c3RlZCA9IDAsXG5cdFRydXN0ZWQgPSAxLFxuXHRVbnNwZWNpZmllZCA9IDJcbn1cblxuZXhwb3J0IGVudW0gUG9ydEF1dG9Gb3J3YXJkQWN0aW9uIHtcblx0Tm90aWZ5ID0gMSxcblx0T3BlbkJyb3dzZXIgPSAyLFxuXHRPcGVuUHJldmlldyA9IDMsXG5cdFNpbGVudCA9IDQsXG5cdElnbm9yZSA9IDUsXG5cdE9wZW5Ccm93c2VyT25jZSA9IDZcbn1cblxuZXhwb3J0IGNsYXNzIFR5cGVIaWVyYXJjaHlJdGVtIHtcblx0X3Nlc3Npb25JZD86IHN0cmluZztcblx0X2l0ZW1JZD86IHN0cmluZztcblxuXHRraW5kOiBTeW1ib2xLaW5kO1xuXHR0YWdzPzogU3ltYm9sVGFnW107XG5cdG5hbWU6IHN0cmluZztcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHR1cmk6IFVSSTtcblx0cmFuZ2U6IFJhbmdlO1xuXHRzZWxlY3Rpb25SYW5nZTogUmFuZ2U7XG5cblx0Y29uc3RydWN0b3Ioa2luZDogU3ltYm9sS2luZCwgbmFtZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZywgdXJpOiBVUkksIHJhbmdlOiBSYW5nZSwgc2VsZWN0aW9uUmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMuZGV0YWlsID0gZGV0YWlsO1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLnNlbGVjdGlvblJhbmdlID0gc2VsZWN0aW9uUmFuZ2U7XG5cdH1cbn1cblxuLy8jcmVnaW9uIFRhYiBJbnB1dHNcblxuZXhwb3J0IGNsYXNzIFRleHRUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHREaWZmVGFiSW5wdXQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBvcmlnaW5hbDogVVJJLCByZWFkb25seSBtb2RpZmllZDogVVJJKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHRNZXJnZVRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgYmFzZTogVVJJLCByZWFkb25seSBpbnB1dDE6IFVSSSwgcmVhZG9ubHkgaW5wdXQyOiBVUkksIHJlYWRvbmx5IHJlc3VsdDogVVJJKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvclRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdXJpOiBVUkksIHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmcpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgV2Vidmlld0VkaXRvclRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvclRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdXJpOiBVUkksIHJlYWRvbmx5IG5vdGVib29rVHlwZTogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRGlmZkVkaXRvclRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgb3JpZ2luYWw6IFVSSSwgcmVhZG9ubHkgbW9kaWZpZWQ6IFVSSSwgcmVhZG9ubHkgbm90ZWJvb2tUeXBlOiBzdHJpbmcpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxFZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKCkgeyB9XG59XG5leHBvcnQgY2xhc3MgSW50ZXJhY3RpdmVXaW5kb3dJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJLCByZWFkb25seSBpbnB1dEJveFVyaTogVVJJKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0TXVsdGlEaWZmVGFiSW5wdXQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB0ZXh0RGlmZnM6IFRleHREaWZmVGFiSW5wdXRbXSkgeyB9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENoYXRcblxuZXhwb3J0IGVudW0gSW50ZXJhY3RpdmVTZXNzaW9uVm90ZURpcmVjdGlvbiB7XG5cdERvd24gPSAwLFxuXHRVcCA9IDFcbn1cblxuZXhwb3J0IGVudW0gQ2hhdENvcHlLaW5kIHtcblx0QWN0aW9uID0gMSxcblx0VG9vbGJhciA9IDJcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFZhcmlhYmxlTGV2ZWwge1xuXHRTaG9ydCA9IDEsXG5cdE1lZGl1bSA9IDIsXG5cdEZ1bGwgPSAzXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29tcGxldGlvbkl0ZW0gaW1wbGVtZW50cyB2c2NvZGUuQ2hhdENvbXBsZXRpb25JdGVtIHtcblx0aWQ6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWw7XG5cdGZ1bGxOYW1lPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpY29uPzogdnNjb2RlLlRoZW1lSWNvbjtcblx0aW5zZXJ0VGV4dD86IHN0cmluZztcblx0dmFsdWVzOiB2c2NvZGUuQ2hhdFZhcmlhYmxlVmFsdWVbXTtcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHRkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmc7XG5cdGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZDtcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nIHwgQ29tcGxldGlvbkl0ZW1MYWJlbCwgdmFsdWVzOiB2c2NvZGUuQ2hhdFZhcmlhYmxlVmFsdWVbXSkge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy52YWx1ZXMgPSB2YWx1ZXM7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZSB7XG5cdEFjY2VwdGVkID0gMSxcblx0UmVqZWN0ZWQgPSAyLFxuXHRTYXZlZCA9IDNcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kIHtcblx0S2VlcCA9IDEsXG5cdFVuZG8gPSAyLFxuXHRVc2VyTW9kaWZpY2F0aW9uID0gMyxcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBJbnRlcmFjdGl2ZSBFZGl0b3JcblxuZXhwb3J0IGVudW0gSW50ZXJhY3RpdmVFZGl0b3JSZXNwb25zZUZlZWRiYWNrS2luZCB7XG5cdFVuaGVscGZ1bCA9IDAsXG5cdEhlbHBmdWwgPSAxLFxuXHRVbmRvbmUgPSAyLFxuXHRBY2NlcHRlZCA9IDMsXG5cdEJ1ZyA9IDRcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFJlc3VsdEZlZWRiYWNrS2luZCB7XG5cdFVuaGVscGZ1bCA9IDAsXG5cdEhlbHBmdWwgPSAxLFxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICYmIHZhbHVlLmlzVHJ1c3RlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgYm9vbGVhbiBmb3JtIG9mIE1hcmtkb3duU3RyaW5nLmlzVHJ1c3RlZCBpcyBOT1Qgc3VwcG9ydGVkIGZvciBjaGF0IHBhcnRpY2lwYW50cy4nKTtcblx0XHR9XG5cblx0XHR0aGlzLnZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyh2YWx1ZSkgOiB2YWx1ZTtcblx0fVxufVxuXG4vKipcbiAqIFRPRE8gaWYgJ3Z1bG5lcmFiaWxpdGllcycgaXMgZmluYWxpemVkLCB0aGlzIHNob3VsZCBiZSBtZXJnZWQgd2l0aCB0aGUgYmFzZSBDaGF0UmVzcG9uc2VNYXJrZG93blBhcnQuIEkganVzdCBkb24ndCBzZWUgaG93IHRvIGRvIHRoYXQgd2hpbGUga2VlcGluZ1xuICogdnVsbmVyYWJpbGl0aWVzIGluIGEgc2VwZXJhdGUgQVBJIHByb3Bvc2FsIGluIGEgY2xlYW4gd2F5LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdHZ1bG5lcmFiaWxpdGllczogdnNjb2RlLkNoYXRWdWxuZXJhYmlsaXR5W107XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcsIHZ1bG5lcmFiaWxpdGllczogdnNjb2RlLkNoYXRWdWxuZXJhYmlsaXR5W10pIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyAmJiB2YWx1ZS5pc1RydXN0ZWQgPT09IHRydWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIGJvb2xlYW4gZm9ybSBvZiBNYXJrZG93blN0cmluZy5pc1RydXN0ZWQgaXMgTk9UIHN1cHBvcnRlZCBmb3IgY2hhdCBwYXJ0aWNpcGFudHMuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUpIDogdmFsdWU7XG5cdFx0dGhpcy52dWxuZXJhYmlsaXRpZXMgPSB2dWxuZXJhYmlsaXRpZXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdGRhdGE6IGFueTtcblx0YnV0dG9ucz86IHN0cmluZ1tdO1xuXG5cdGNvbnN0cnVjdG9yKHRpdGxlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZywgZGF0YTogYW55LCBidXR0b25zPzogc3RyaW5nW10pIHtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMuYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUZpbGVUcmVlUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVbXTtcblx0YmFzZVVyaTogdnNjb2RlLlVyaTtcblx0Y29uc3RydWN0b3IodmFsdWU6IHZzY29kZS5DaGF0UmVzcG9uc2VGaWxlVHJlZVtdLCBiYXNlVXJpOiB2c2NvZGUuVXJpKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMuYmFzZVVyaSA9IGJhc2VVcmk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQge1xuXHR2YWx1ZTogdnNjb2RlLkNoYXRSZXNwb25zZURpZmZFbnRyeVtdO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRyZWFkT25seT86IGJvb2xlYW47XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRGlmZkVudHJ5W10sIHRpdGxlOiBzdHJpbmcsIHJlYWRPbmx5PzogYm9vbGVhbikge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5yZWFkT25seSA9IHJlYWRPbmx5O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BUb29sSW52b2NhdGlvbkNvbnRlbnREYXRhIHtcblx0bWltZVR5cGU6IHN0cmluZztcblx0ZGF0YTogVWludDhBcnJheTtcblx0Y29uc3RydWN0b3IoZGF0YTogVWludDhBcnJheSwgbWltZVR5cGU6IHN0cmluZykge1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5taW1lVHlwZSA9IG1pbWVUeXBlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEge1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0YWdlbnROYW1lPzogc3RyaW5nO1xuXHRwcm9tcHQ/OiBzdHJpbmc7XG5cdHJlc3VsdD86IHN0cmluZztcblx0bW9kZWxOYW1lPzogc3RyaW5nO1xuXHRjb25zdHJ1Y3RvcihkZXNjcmlwdGlvbj86IHN0cmluZywgYWdlbnROYW1lPzogc3RyaW5nLCBwcm9tcHQ/OiBzdHJpbmcsIHJlc3VsdD86IHN0cmluZykge1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHR0aGlzLnByb21wdCA9IHByb21wdDtcblx0XHR0aGlzLnJlc3VsdCA9IHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlRXh0ZXJuYWxFZGl0UGFydCB7XG5cdGFwcGxpZWQ6IFRoZW5hYmxlPHN0cmluZz47XG5cdGRpZEdldEFwcGxpZWQhOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgdXJpczogdnNjb2RlLlVyaVtdLFxuXHRcdHB1YmxpYyBjYWxsYmFjazogKCkgPT4gVGhlbmFibGU8dW5rbm93bj4sXG5cdCkge1xuXHRcdHRoaXMuYXBwbGllZCA9IG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUpID0+IHtcblx0XHRcdHRoaXMuZGlkR2V0QXBwbGllZCA9IHJlc29sdmU7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUFuY2hvclBhcnQgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uO1xuXHR0aXRsZT86IHN0cmluZztcblxuXHR2YWx1ZTI6IHZzY29kZS5VcmkgfCB2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb247XG5cdHJlc29sdmU/KHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdnNjb2RlLlVyaSB8IHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbiwgdGl0bGU/OiBzdHJpbmcpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHR0aGlzLnZhbHVlID0gdmFsdWUgYXMgYW55O1xuXHRcdHRoaXMudmFsdWUyID0gdmFsdWU7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQge1xuXHR2YWx1ZTogc3RyaW5nO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyIHtcblx0dmFsdWU6IHN0cmluZztcblx0dGFzaz86IChwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydD4pID0+IFRoZW5hYmxlPHN0cmluZyB8IHZvaWQ+O1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nLCB0YXNrPzogKHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0PikgPT4gVGhlbmFibGU8c3RyaW5nIHwgdm9pZD4pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy50YXNrID0gdGFzaztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQge1xuXHR2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW107XG5cdGlkPzogc3RyaW5nO1xuXHRtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogYW55IH07XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXSwgaWQ/OiBzdHJpbmcsIG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBhbnkgfSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VIb29rUGFydCB7XG5cdGhvb2tUeXBlOiBIb29rVHlwZVZhbHVlO1xuXHRzdG9wUmVhc29uPzogc3RyaW5nO1xuXHRzeXN0ZW1NZXNzYWdlPzogc3RyaW5nO1xuXHRtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHRjb25zdHJ1Y3Rvcihob29rVHlwZTogSG9va1R5cGVWYWx1ZSwgc3RvcFJlYXNvbj86IHN0cmluZywgc3lzdGVtTWVzc2FnZT86IHN0cmluZywgbWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd24gfSkge1xuXHRcdHRoaXMuaG9va1R5cGUgPSBob29rVHlwZTtcblx0XHR0aGlzLnN0b3BSZWFzb24gPSBzdG9wUmVhc29uO1xuXHRcdHRoaXMuc3lzdGVtTWVzc2FnZSA9IHN5c3RlbU1lc3NhZ2U7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIENoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NTdGFnZSA9ICdpbnZlc3RpZ2F0aW5nJyB8ICdwbGFubmluZycgfCAnZWRpdGluZycgfCAndmFsaWRhdGluZycgfCAncmVjb3ZlcmluZyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCB7XG5cdHJlYWRvbmx5IGlkOiBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzU3RhZ2U7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdGNvbnN0cnVjdG9yKGlkOiBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzU3RhZ2UsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHtcblx0cmVzb2x2ZWRNb2RlbDogc3RyaW5nO1xuXHRyZXNvbHZlZE1vZGVsTmFtZTogc3RyaW5nO1xuXHRwcmVkaWN0ZWRMYWJlbDogc3RyaW5nO1xuXHRjb25maWRlbmNlOiBudW1iZXI7XG5cdGNvbnN0cnVjdG9yKHJlc29sdmVkTW9kZWw6IHN0cmluZywgcmVzb2x2ZWRNb2RlbE5hbWU6IHN0cmluZywgcHJlZGljdGVkTGFiZWw6IHN0cmluZywgY29uZmlkZW5jZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5yZXNvbHZlZE1vZGVsID0gcmVzb2x2ZWRNb2RlbDtcblx0XHR0aGlzLnJlc29sdmVkTW9kZWxOYW1lID0gcmVzb2x2ZWRNb2RlbE5hbWU7XG5cdFx0dGhpcy5wcmVkaWN0ZWRMYWJlbCA9IHByZWRpY3RlZExhYmVsO1xuXHRcdHRoaXMuY29uZmlkZW5jZSA9IGNvbmZpZGVuY2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVdhcm5pbmdQYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICYmIHZhbHVlLmlzVHJ1c3RlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgYm9vbGVhbiBmb3JtIG9mIE1hcmtkb3duU3RyaW5nLmlzVHJ1c3RlZCBpcyBOT1Qgc3VwcG9ydGVkIGZvciBjaGF0IHBhcnRpY2lwYW50cy4nKTtcblx0XHR9XG5cblx0XHR0aGlzLnZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyh2YWx1ZSkgOiB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlSW5mb1BhcnQge1xuXHR2YWx1ZTogdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgJiYgdmFsdWUuaXNUcnVzdGVkID09PSB0cnVlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBib29sZWFuIGZvcm0gb2YgTWFya2Rvd25TdHJpbmcuaXNUcnVzdGVkIGlzIE5PVCBzdXBwb3J0ZWQgZm9yIGNoYXQgcGFydGljaXBhbnRzLicpO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlKSA6IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuQ29tbWFuZDtcblx0Y29uc3RydWN0b3IodmFsdWU6IHZzY29kZS5Db21tYW5kKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5VcmkgfCB2c2NvZGUuTG9jYXRpb24gfCB7IHZhcmlhYmxlTmFtZTogc3RyaW5nOyB2YWx1ZT86IHZzY29kZS5VcmkgfCB2c2NvZGUuTG9jYXRpb24gfSB8IHN0cmluZztcblx0aWNvblBhdGg/OiB2c2NvZGUuVXJpIHwgdnNjb2RlLlRoZW1lSWNvbiB8IHsgbGlnaHQ6IHZzY29kZS5Vcmk7IGRhcms6IHZzY29kZS5VcmkgfTtcblx0b3B0aW9ucz86IHsgc3RhdHVzPzogeyBkZXNjcmlwdGlvbjogc3RyaW5nOyBraW5kOiB2c2NvZGUuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQgfTsgZGlmZk1ldGE/OiB7IGFkZGVkOiBudW1iZXI7IHJlbW92ZWQ6IG51bWJlciB9IH07XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uIHwgeyB2YXJpYWJsZU5hbWU6IHN0cmluZzsgdmFsdWU/OiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uIH0gfCBzdHJpbmcsIGljb25QYXRoPzogdnNjb2RlLlVyaSB8IHZzY29kZS5UaGVtZUljb24gfCB7IGxpZ2h0OiB2c2NvZGUuVXJpOyBkYXJrOiB2c2NvZGUuVXJpIH0sIG9wdGlvbnM/OiB7IHN0YXR1cz86IHsgZGVzY3JpcHRpb246IHN0cmluZzsga2luZDogdnNjb2RlLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnRTdGF0dXNLaW5kIH0gfSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmljb25QYXRoID0gaWNvblBhdGg7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCB7XG5cdGlzRWRpdD86IGJvb2xlYW47XG5cdHVuZG9TdG9wSWQ/OiBzdHJpbmc7XG5cdHZhbHVlOiB2c2NvZGUuVXJpO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdnNjb2RlLlVyaSwgaXNFZGl0PzogYm9vbGVhbiwgdW5kb1N0b3BJZD86IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmlzRWRpdCA9IGlzRWRpdDtcblx0XHR0aGlzLnVuZG9TdG9wSWQgPSB1bmRvU3RvcElkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5Vcmk7XG5cdGxpY2Vuc2U6IHN0cmluZztcblx0c25pcHBldDogc3RyaW5nO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdnNjb2RlLlVyaSwgbGljZW5zZTogc3RyaW5nLCBzbmlwcGV0OiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5saWNlbnNlID0gbGljZW5zZTtcblx0XHR0aGlzLnNuaXBwZXQgPSBzbmlwcGV0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VNb3ZlUGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB1cmk6IHZzY29kZS5VcmksXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlOiB2c2NvZGUuUmFuZ2UsXG5cdCkge1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25zOiBzdHJpbmdbXSxcblx0KSB7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSB1cmk/OiB2c2NvZGUuVXJpO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29tbWFuZDogdnNjb2RlLkNvbW1hbmQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXJpT3JDb21tYW5kOiB2c2NvZGUuVXJpIHwgdnNjb2RlLkNvbW1hbmQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRpdGxlOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGF1dGhvcjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5rVGFnOiBzdHJpbmdcblx0KSB7XG5cdFx0aWYgKGlzVXJpQ29tcG9uZW50cyh1cmlPckNvbW1hbmQpKSB7XG5cdFx0XHR0aGlzLnVyaSA9IHVyaU9yQ29tbWFuZCBhcyB2c2NvZGUuVXJpO1xuXHRcdFx0dGhpcy5jb21tYW5kID0ge1xuXHRcdFx0XHR0aXRsZTogJ09wZW4gUHVsbCBSZXF1ZXN0Jyxcblx0XHRcdFx0Y29tbWFuZDogJ3ZzY29kZS5vcGVuJyxcblx0XHRcdFx0YXJndW1lbnRzOiBbdXJpT3JDb21tYW5kXVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb21tYW5kID0gdXJpT3JDb21tYW5kO1xuXHRcdH1cblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydCxcblx0XHRcdHVyaTogdGhpcy51cmksXG5cdFx0XHR0aXRsZTogdGhpcy50aXRsZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0YXV0aG9yOiB0aGlzLmF1dGhvclxuXHRcdH07XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgdHlwZSBvZiBxdWVzdGlvbiBmb3IgYSBjaGF0IHF1ZXN0aW9uIGNhcm91c2VsLlxuICovXG5leHBvcnQgZW51bSBDaGF0UXVlc3Rpb25UeXBlIHtcblx0LyoqXG5cdCAqIEEgZnJlZS1mb3JtIHRleHQgaW5wdXQgcXVlc3Rpb24uXG5cdCAqL1xuXHRUZXh0ID0gMSxcblx0LyoqXG5cdCAqIEEgc2luZ2xlLXNlbGVjdCBxdWVzdGlvbiB3aXRoIHJhZGlvIGJ1dHRvbnMuXG5cdCAqL1xuXHRTaW5nbGVTZWxlY3QgPSAyLFxuXHQvKipcblx0ICogQSBtdWx0aS1zZWxlY3QgcXVlc3Rpb24gd2l0aCBjaGVja2JveGVzLlxuXHQgKi9cblx0TXVsdGlTZWxlY3QgPSAzXG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHF1ZXN0aW9uIHRvIGJlIGRpc3BsYXllZCBpbiBhIGNoYXQgcXVlc3Rpb24gY2Fyb3VzZWwuXG4gKiBRdWVzdGlvbnMgY2FuIGJlIG9mIHR5cGUgJ3RleHQnIGZvciBmcmVlLWZvcm0gaW5wdXQsICdzaW5nbGVTZWxlY3QnIGZvciByYWRpbyBidXR0b25zLFxuICogb3IgJ211bHRpU2VsZWN0JyBmb3IgY2hlY2tib3hlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRRdWVzdGlvbiB7XG5cdC8qKiBVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHF1ZXN0aW9uLiAqL1xuXHRpZDogc3RyaW5nO1xuXHQvKiogVGhlIHR5cGUgb2YgcXVlc3Rpb246IFRleHQgZm9yIGZyZWUtZm9ybSBpbnB1dCwgU2luZ2xlU2VsZWN0IGZvciByYWRpbyBidXR0b25zLCBNdWx0aVNlbGVjdCBmb3IgY2hlY2tib3hlcy4gKi9cblx0dHlwZTogQ2hhdFF1ZXN0aW9uVHlwZTtcblx0LyoqIFRoZSB0aXRsZS9oZWFkZXIgb2YgdGhlIHF1ZXN0aW9uLiAqL1xuXHR0aXRsZTogc3RyaW5nO1xuXHQvKiogT3B0aW9uYWwgZGV0YWlsZWQgbWVzc2FnZSBvciBkZXNjcmlwdGlvbiBmb3IgdGhlIHF1ZXN0aW9uLiAqL1xuXHRtZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHQvKiogT3B0aW9ucyBmb3Igc2luZ2xlU2VsZWN0IG9yIG11bHRpU2VsZWN0IHF1ZXN0aW9ucy4gKi9cblx0b3B0aW9ucz86IHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHVua25vd24gfVtdO1xuXHQvKiogVGhlIGlkKHMpIG9mIHRoZSBkZWZhdWx0IHNlbGVjdGVkIG9wdGlvbihzKS4gKi9cblx0ZGVmYXVsdFZhbHVlPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdC8qKiBXaGV0aGVyIHRvIGFsbG93IGZyZWUtZm9ybSB0ZXh0IGlucHV0IGluIGFkZGl0aW9uIHRvIHByZWRlZmluZWQgb3B0aW9ucy4gKi9cblx0YWxsb3dGcmVlZm9ybUlucHV0PzogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHR5cGU6IENoYXRRdWVzdGlvblR5cGUsXG5cdFx0dGl0bGU6IHN0cmluZyxcblx0XHRvcHRpb25zPzoge1xuXHRcdFx0bWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0XHRcdG9wdGlvbnM/OiB7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiB1bmtub3duIH1bXTtcblx0XHRcdGRlZmF1bHRWYWx1ZT86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0PzogYm9vbGVhbjtcblx0XHR9XG5cdCkge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLnR5cGUgPSB0eXBlO1xuXHRcdHRoaXMudGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLm1lc3NhZ2UgPSBvcHRpb25zPy5tZXNzYWdlO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM/Lm9wdGlvbnM7XG5cdFx0dGhpcy5kZWZhdWx0VmFsdWUgPSBvcHRpb25zPy5kZWZhdWx0VmFsdWU7XG5cdFx0dGhpcy5hbGxvd0ZyZWVmb3JtSW5wdXQgPSBvcHRpb25zPy5hbGxvd0ZyZWVmb3JtSW5wdXQ7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGNhcm91c2VsIHZpZXcgZm9yIHByZXNlbnRpbmcgbXVsdGlwbGUgcXVlc3Rpb25zIGlubGluZSBpbiB0aGUgY2hhdCByZXNwb25zZS5cbiAqIFVzZXJzIGNhbiBuYXZpZ2F0ZSBiZXR3ZWVuIHF1ZXN0aW9ucyBhbmQgc3VibWl0IHRoZWlyIGFuc3dlcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCB7XG5cdC8qKiBUaGUgcXVlc3Rpb25zIHRvIGRpc3BsYXkgaW4gdGhlIGNhcm91c2VsLiAqL1xuXHRxdWVzdGlvbnM6IENoYXRRdWVzdGlvbltdO1xuXHQvKiogV2hldGhlciB1c2VycyBjYW4gc2tpcCBhbnN3ZXJpbmcgdGhlIHF1ZXN0aW9ucy4gKi9cblx0YWxsb3dTa2lwOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHF1ZXN0aW9uczogQ2hhdFF1ZXN0aW9uW10sIGFsbG93U2tpcDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHR0aGlzLnF1ZXN0aW9ucyA9IHF1ZXN0aW9ucztcblx0XHR0aGlzLmFsbG93U2tpcCA9IGFsbG93U2tpcDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXNwb25zZVRleHRFZGl0UGFydCB7XG5cdHVyaTogdnNjb2RlLlVyaTtcblx0ZWRpdHM6IHZzY29kZS5UZXh0RWRpdFtdO1xuXHRpc0RvbmU/OiBib29sZWFuO1xuXHRjb25zdHJ1Y3Rvcih1cmk6IHZzY29kZS5VcmksIGVkaXRzT3JEb25lOiB2c2NvZGUuVGV4dEVkaXQgfCB2c2NvZGUuVGV4dEVkaXRbXSB8IHRydWUpIHtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHRpZiAoZWRpdHNPckRvbmUgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuaXNEb25lID0gdHJ1ZTtcblx0XHRcdHRoaXMuZWRpdHMgPSBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0cyA9IEFycmF5LmlzQXJyYXkoZWRpdHNPckRvbmUpID8gZWRpdHNPckRvbmUgOiBbZWRpdHNPckRvbmVdO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0IHtcblx0dXJpOiB2c2NvZGUuVXJpO1xuXHRlZGl0czogdnNjb2RlLk5vdGVib29rRWRpdFtdO1xuXHRpc0RvbmU/OiBib29sZWFuO1xuXHRjb25zdHJ1Y3Rvcih1cmk6IHZzY29kZS5VcmksIGVkaXRzT3JEb25lOiB2c2NvZGUuTm90ZWJvb2tFZGl0IHwgdnNjb2RlLk5vdGVib29rRWRpdFtdIHwgdHJ1ZSkge1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHRcdGlmIChlZGl0c09yRG9uZSA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5pc0RvbmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5lZGl0cyA9IFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRzID0gQXJyYXkuaXNBcnJheShlZGl0c09yRG9uZSkgPyBlZGl0c09yRG9uZSA6IFtlZGl0c09yRG9uZV07XG5cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0IHtcblx0ZWRpdHM6IHZzY29kZS5DaGF0V29ya3NwYWNlRmlsZUVkaXRbXTtcblx0Y29uc3RydWN0b3IoZWRpdHM6IHZzY29kZS5DaGF0V29ya3NwYWNlRmlsZUVkaXRbXSkge1xuXHRcdHRoaXMuZWRpdHMgPSBlZGl0cztcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTIge1xuXHRjb21tYW5kTGluZToge1xuXHRcdG9yaWdpbmFsOiBzdHJpbmc7XG5cdFx0dXNlckVkaXRlZD86IHN0cmluZztcblx0XHR0b29sRWRpdGVkPzogc3RyaW5nO1xuXHR9O1xuXHRsYW5ndWFnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgZW51bSBDaGF0VG9kb1N0YXR1cyB7XG5cdE5vdFN0YXJ0ZWQgPSAxLFxuXHRJblByb2dyZXNzID0gMixcblx0Q29tcGxldGVkID0gM1xufVxuXG5leHBvcnQgZW51bSBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cyB7XG5cdFJ1bm5pbmcgPSAwLFxuXHRDb21wbGV0ZWQgPSAxLFxuXHRGYWlsZWQgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IHtcblx0dG9vbE5hbWU6IHN0cmluZztcblx0dG9vbENhbGxJZDogc3RyaW5nO1xuXHRlcnJvck1lc3NhZ2U/OiBzdHJpbmc7XG5cdGludm9jYXRpb25NZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRvcmlnaW5NZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRwYXN0VGVuc2VNZXNzYWdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRpc0NvbmZpcm1lZD86IGJvb2xlYW47XG5cdGlzQ29tcGxldGU/OiBib29sZWFuO1xuXHR0b29sU3BlY2lmaWNEYXRhPzogQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhMjtcblx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdHN1YkFnZW50TmFtZT86IHN0cmluZztcblx0cHJlc2VudGF0aW9uPzogJ2hpZGRlbicgfCAnaGlkZGVuQWZ0ZXJDb21wbGV0ZScgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IodG9vbE5hbWU6IHN0cmluZyxcblx0XHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdFx0ZXJyb3JNZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0dGhpcy50b29sTmFtZSA9IHRvb2xOYW1lO1xuXHRcdHRoaXMudG9vbENhbGxJZCA9IHRvb2xDYWxsSWQ7XG5cdFx0dGhpcy5lcnJvck1lc3NhZ2UgPSBlcnJvck1lc3NhZ2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXF1ZXN0VHVybiBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVxdWVzdFR1cm4yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcHJvbXB0OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IHJlZmVyZW5jZXM6IHZzY29kZS5DaGF0UHJvbXB0UmVmZXJlbmNlW10sXG5cdFx0cmVhZG9ubHkgcGFydGljaXBhbnQ6IHN0cmluZyxcblx0XHRyZWFkb25seSB0b29sUmVmZXJlbmNlczogdnNjb2RlLkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZVtdLFxuXHRcdHJlYWRvbmx5IGVkaXRlZEZpbGVFdmVudHM/OiB2c2NvZGUuQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRbXSxcblx0XHRyZWFkb25seSBpZD86IHN0cmluZyxcblx0XHRyZWFkb25seSBtb2RlbElkPzogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG1vZGVJbnN0cnVjdGlvbnMyPzogdnNjb2RlLkNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVR1cm4gaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlc3BvbnNlVHVybiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzcG9uc2U6IFJlYWRvbmx5QXJyYXk8Q2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0IHwgQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0IHwgQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCB8IENoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0Pixcblx0XHRyZWFkb25seSByZXN1bHQ6IHZzY29kZS5DaGF0UmVzdWx0LFxuXHRcdHJlYWRvbmx5IHBhcnRpY2lwYW50OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZ1xuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVHVybjIgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlc3BvbnNlVHVybjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc3BvbnNlOiBSZWFkb25seUFycmF5PENoYXRSZXNwb25zZU1hcmtkb3duUGFydCB8IENoYXRSZXNwb25zZUZpbGVUcmVlUGFydCB8IENoYXRSZXNwb25zZUFuY2hvclBhcnQgfCBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCB8IENoYXRSZXNwb25zZUV4dGVuc2lvbnNQYXJ0IHwgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydD4sXG5cdFx0cmVhZG9ubHkgcmVzdWx0OiB2c2NvZGUuQ2hhdFJlc3VsdCxcblx0XHRyZWFkb25seSBwYXJ0aWNpcGFudDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbW1hbmQ/OiBzdHJpbmdcblx0KSB7IH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdExvY2F0aW9uIHtcblx0UGFuZWwgPSAxLFxuXHRUZXJtaW5hbCA9IDIsXG5cdE5vdGVib29rID0gMyxcblx0RWRpdG9yID0gNCxcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFNlc3Npb25TdGF0dXMge1xuXHRGYWlsZWQgPSAwLFxuXHRDb21wbGV0ZWQgPSAxLFxuXHRJblByb2dyZXNzID0gMixcblx0TmVlZHNJbnB1dCA9IDNcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUge1xuXHRzdGF0aWMgcmVhZG9ubHkgQWdlbnQgPSBuZXcgQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSgnYWdlbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNraWxsID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ3NraWxsJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbnN0cnVjdGlvbnMgPSBuZXcgQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSgnaW5zdHJ1Y3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBQcm9tcHQgPSBuZXcgQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSgncHJvbXB0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBIb29rID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ2hvb2snKTtcblx0c3RhdGljIHJlYWRvbmx5IFBsdWdpbnMgPSBuZXcgQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSgncGx1Z2lucycpO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdERlYnVnTG9nTGV2ZWwge1xuXHRUcmFjZSA9IDAsXG5cdEluZm8gPSAxLFxuXHRXYXJuaW5nID0gMixcblx0RXJyb3IgPSAzXG59XG5cbmV4cG9ydCBlbnVtIENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0IHtcblx0U3VjY2VzcyA9IDAsXG5cdEVycm9yID0gMVxufVxuXG5leHBvcnQgZW51bSBDaGF0RGVidWdIb29rUmVzdWx0IHtcblx0U3VjY2VzcyA9IDAsXG5cdEVycm9yID0gMSxcblx0Tm9uQmxvY2tpbmdFcnJvciA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICd0b29sQ2FsbCc7XG5cdGlkPzogc3RyaW5nO1xuXHRzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpO1xuXHRjcmVhdGVkOiBEYXRlO1xuXHRwYXJlbnRFdmVudElkPzogc3RyaW5nO1xuXHR0b29sTmFtZTogc3RyaW5nO1xuXHR0b29sQ2FsbElkPzogc3RyaW5nO1xuXHRpbnB1dD86IHN0cmluZztcblx0b3V0cHV0Pzogc3RyaW5nO1xuXHRyZXN1bHQ/OiBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdDtcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcih0b29sTmFtZTogc3RyaW5nLCBjcmVhdGVkOiBEYXRlKSB7XG5cdFx0dGhpcy50b29sTmFtZSA9IHRvb2xOYW1lO1xuXHRcdHRoaXMuY3JlYXRlZCA9IGNyZWF0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z01vZGVsVHVybkV2ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAnbW9kZWxUdXJuJztcblx0aWQ/OiBzdHJpbmc7XG5cdHNlc3Npb25SZXNvdXJjZT86IHZzY29kZS5Vcmk7XG5cdGNyZWF0ZWQ6IERhdGU7XG5cdHBhcmVudEV2ZW50SWQ/OiBzdHJpbmc7XG5cdG1vZGVsPzogc3RyaW5nO1xuXHRyZXF1ZXN0TmFtZT86IHN0cmluZztcblx0aW5wdXRUb2tlbnM/OiBudW1iZXI7XG5cdG91dHB1dFRva2Vucz86IG51bWJlcjtcblx0Y2FjaGVkVG9rZW5zPzogbnVtYmVyO1xuXHR0b3RhbFRva2Vucz86IG51bWJlcjtcblx0Y29zdD86IG51bWJlcjtcblx0Y29waWxvdFVzYWdlTmFub0FpdT86IG51bWJlcjtcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihjcmVhdGVkOiBEYXRlKSB7XG5cdFx0dGhpcy5jcmVhdGVkID0gY3JlYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnR2VuZXJpY0V2ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAnZ2VuZXJpYyc7XG5cdGlkPzogc3RyaW5nO1xuXHRzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpO1xuXHRjcmVhdGVkOiBEYXRlO1xuXHRwYXJlbnRFdmVudElkPzogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGRldGFpbHM/OiBzdHJpbmc7XG5cdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbDtcblx0Y2F0ZWdvcnk/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwsIGNyZWF0ZWQ6IERhdGUpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMubGV2ZWwgPSBsZXZlbDtcblx0XHR0aGlzLmNyZWF0ZWQgPSBjcmVhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdTdWJhZ2VudEludm9jYXRpb25FdmVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ3N1YmFnZW50SW52b2NhdGlvbic7XG5cdGlkPzogc3RyaW5nO1xuXHRzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpO1xuXHRjcmVhdGVkOiBEYXRlO1xuXHRwYXJlbnRFdmVudElkPzogc3RyaW5nO1xuXHRhZ2VudE5hbWU6IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHN0YXR1cz86IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzO1xuXHRkdXJhdGlvbkluTWlsbGlzPzogbnVtYmVyO1xuXHR0b29sQ2FsbENvdW50PzogbnVtYmVyO1xuXHRtb2RlbFR1cm5Db3VudD86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihhZ2VudE5hbWU6IHN0cmluZywgY3JlYXRlZDogRGF0ZSkge1xuXHRcdHRoaXMuYWdlbnROYW1lID0gYWdlbnROYW1lO1xuXHRcdHRoaXMuY3JlYXRlZCA9IGNyZWF0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uIHtcblx0bmFtZTogc3RyaW5nO1xuXHRjb250ZW50OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICd1c2VyTWVzc2FnZSc7XG5cdGlkPzogc3RyaW5nO1xuXHRzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpO1xuXHRjcmVhdGVkOiBEYXRlO1xuXHRwYXJlbnRFdmVudElkPzogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNlY3Rpb25zOiBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbltdO1xuXG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgY3JlYXRlZDogRGF0ZSkge1xuXHRcdHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5jcmVhdGVkID0gY3JlYXRlZDtcblx0XHR0aGlzLnNlY3Rpb25zID0gW107XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ2FnZW50UmVzcG9uc2UnO1xuXHRpZD86IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlPzogdnNjb2RlLlVyaTtcblx0Y3JlYXRlZDogRGF0ZTtcblx0cGFyZW50RXZlbnRJZD86IHN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRzZWN0aW9uczogQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb25bXTtcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIGNyZWF0ZWQ6IERhdGUpIHtcblx0XHR0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuY3JlYXRlZCA9IGNyZWF0ZWQ7XG5cdFx0dGhpcy5zZWN0aW9ucyA9IFtdO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdFdmVudFRleHRDb250ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAndGV4dCc7XG5cdHZhbHVlOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBDaGF0RGVidWdNZXNzYWdlQ29udGVudFR5cGUge1xuXHRVc2VyID0gMCxcblx0QWdlbnQgPSAxXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdFdmVudE1lc3NhZ2VDb250ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAnbWVzc2FnZUNvbnRlbnQnO1xuXHR0eXBlOiBDaGF0RGVidWdNZXNzYWdlQ29udGVudFR5cGU7XG5cdG1lc3NhZ2U6IHN0cmluZztcblx0c2VjdGlvbnM6IENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IodHlwZTogQ2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlLCBtZXNzYWdlOiBzdHJpbmcsIHNlY3Rpb25zOiBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbltdKSB7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuc2VjdGlvbnMgPSBzZWN0aW9ucztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRXZlbnRUb29sQ2FsbENvbnRlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICd0b29sQ2FsbENvbnRlbnQnO1xuXHR0b29sTmFtZTogc3RyaW5nO1xuXHRyZXN1bHQ/OiBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdDtcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblx0aW5wdXQ/OiBzdHJpbmc7XG5cdG91dHB1dD86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcih0b29sTmFtZTogc3RyaW5nKSB7XG5cdFx0dGhpcy50b29sTmFtZSA9IHRvb2xOYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdFdmVudE1vZGVsVHVybkNvbnRlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICdtb2RlbFR1cm5Db250ZW50Jztcblx0cmVxdWVzdE5hbWU6IHN0cmluZztcblx0bW9kZWw/OiBzdHJpbmc7XG5cdHN0YXR1cz86IHN0cmluZztcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblx0dGltZVRvRmlyc3RUb2tlbkluTWlsbGlzPzogbnVtYmVyO1xuXHRyZXF1ZXN0SWQ/OiBzdHJpbmc7XG5cdG1heElucHV0VG9rZW5zPzogbnVtYmVyO1xuXHRtYXhPdXRwdXRUb2tlbnM/OiBudW1iZXI7XG5cdGlucHV0VG9rZW5zPzogbnVtYmVyO1xuXHRvdXRwdXRUb2tlbnM/OiBudW1iZXI7XG5cdGNhY2hlZFRva2Vucz86IG51bWJlcjtcblx0dG90YWxUb2tlbnM/OiBudW1iZXI7XG5cdHJlcXVlc3RPcHRpb25zPzogc3RyaW5nO1xuXHRlcnJvck1lc3NhZ2U/OiBzdHJpbmc7XG5cdHNlY3Rpb25zPzogQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb25bXTtcblxuXHRjb25zdHJ1Y3RvcihyZXF1ZXN0TmFtZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5yZXF1ZXN0TmFtZSA9IHJlcXVlc3ROYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdFdmVudEhvb2tDb250ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAnaG9va0NvbnRlbnQnO1xuXHRob29rVHlwZTogc3RyaW5nO1xuXHRjb21tYW5kPzogc3RyaW5nO1xuXHRyZXN1bHQ/OiBDaGF0RGVidWdIb29rUmVzdWx0O1xuXHRkdXJhdGlvbkluTWlsbGlzPzogbnVtYmVyO1xuXHRpbnB1dD86IHN0cmluZztcblx0b3V0cHV0Pzogc3RyaW5nO1xuXHRleGl0Q29kZT86IG51bWJlcjtcblx0ZXJyb3JNZXNzYWdlPzogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGhvb2tUeXBlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmhvb2tUeXBlID0gaG9va1R5cGU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXNzaW9uQ2hhbmdlZEZpbGUge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgdXJpOiB2c2NvZGUuVXJpLCBwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWxVcmk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQsIHB1YmxpYyByZWFkb25seSBtb2RpZmllZFVyaTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCwgcHVibGljIHJlYWRvbmx5IGluc2VydGlvbnM6IG51bWJlciwgcHVibGljIHJlYWRvbmx5IGRlbGV0aW9uczogbnVtYmVyKSB7IH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQge1xuXHRDb21wbGV0ZSA9IDEsXG5cdFBhcnRpYWwgPSAyLFxuXHRPbWl0dGVkID0gM1xufVxuXG5leHBvcnQgZW51bSBDaGF0UmVzcG9uc2VDbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvblJlYXNvbiB7XG5cdE5vUmVhc29uID0gMCxcblx0RmlsdGVyZWRDb250ZW50UmV0cnkgPSAxLFxuXHRDb3B5cmlnaHRDb250ZW50UmV0cnkgPSAyLFxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlcXVlc3RFZGl0b3JEYXRhIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXF1ZXN0RWRpdG9yRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGVkaXRvcjogdnNjb2RlLlRleHRFZGl0b3IsXG5cdFx0cmVhZG9ubHkgZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsXG5cdFx0cmVhZG9ubHkgc2VsZWN0aW9uOiB2c2NvZGUuU2VsZWN0aW9uLFxuXHRcdHJlYWRvbmx5IHdob2xlUmFuZ2U6IHZzY29kZS5SYW5nZSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXF1ZXN0Tm90ZWJvb2tEYXRhIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXF1ZXN0Tm90ZWJvb2tEYXRhIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY2VsbDogdnNjb2RlLlRleHREb2N1bWVudFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEge1xuXHRtaW1lVHlwZTogc3RyaW5nO1xuXHRkYXRhOiAoKSA9PiBUaGVuYWJsZTxVaW50OEFycmF5Pjtcblx0cmVmZXJlbmNlPzogdnNjb2RlLlVyaTtcblx0aXNQYXN0ZWQ/OiBib29sZWFuO1xuXHRpc1VSTD86IGJvb2xlYW47XG5cdGNvbnN0cnVjdG9yKG1pbWVUeXBlOiBzdHJpbmcsIGRhdGE6ICgpID0+IFRoZW5hYmxlPFVpbnQ4QXJyYXk+LCByZWZlcmVuY2U/OiB2c2NvZGUuVXJpLCBpc1Bhc3RlZD86IGJvb2xlYW4sIGlzVVJMPzogYm9vbGVhbikge1xuXHRcdHRoaXMubWltZVR5cGUgPSBtaW1lVHlwZTtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMucmVmZXJlbmNlID0gcmVmZXJlbmNlO1xuXHRcdHRoaXMuaXNQYXN0ZWQgPSBpc1Bhc3RlZDtcblx0XHR0aGlzLmlzVVJMID0gaXNVUkw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZWZlcmVuY2VEaWFnbm9zdGljIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZWZlcmVuY2VEaWFnbm9zdGljIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGRpYWdub3N0aWNzOiBbdnNjb2RlLlVyaSwgdnNjb2RlLkRpYWdub3N0aWNbXV1bXSkgeyB9XG59XG5cbmV4cG9ydCBlbnVtIExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUge1xuXHRVc2VyID0gMSxcblx0QXNzaXN0YW50ID0gMixcblx0U3lzdGVtID0gM1xufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB7XG5cblx0Y2FsbElkOiBzdHJpbmc7XG5cdGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IHVua25vd24pW107XG5cdGlzRXJyb3I6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoY2FsbElkOiBzdHJpbmcsIGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IHVua25vd24pW10sIGlzRXJyb3I/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5jYWxsSWQgPSBjYWxsSWQ7XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLmlzRXJyb3IgPSBpc0Vycm9yID8/IGZhbHNlO1xuXHR9XG59XG5cblxuZXhwb3J0IGVudW0gQ2hhdEVycm9yTGV2ZWwge1xuXHRJbmZvID0gMCxcblx0V2FybmluZyA9IDEsXG5cdEVycm9yID0gMlxufVxuXG5leHBvcnQgZW51bSBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSB7XG5cdEluZm8gPSAwLFxuXHRXYXJuaW5nID0gMSxcblx0RXJyb3IgPSAyLFxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlIGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSB7XG5cblx0c3RhdGljIFVzZXIoY29udGVudDogc3RyaW5nIHwgKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10sIG5hbWU/OiBzdHJpbmcpOiBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2Uge1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlKExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudCwgbmFtZSk7XG5cdH1cblxuXHRzdGF0aWMgQXNzaXN0YW50KGNvbnRlbnQ6IHN0cmluZyB8IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdLCBuYW1lPzogc3RyaW5nKTogTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlIHtcblx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZShMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudCwgbmFtZSk7XG5cdH1cblxuXHRyb2xlOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZTtcblxuXHRwcml2YXRlIF9jb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSA9IFtdO1xuXG5cdHNldCBjb250ZW50KHZhbHVlOiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHQvLyB3ZSBjaGFuZ2VkIHRoaXMgYW5kIHN0aWxsIHN1cHBvcnQgc2V0dGluZyBjb250ZW50IHdpdGggYSBzdHJpbmcgcHJvcGVydHkuIHRoaXMga2VlcCB0aGUgQVBJIHJ1bnRpbWUgc3RhYmxlXG5cdFx0XHQvLyBkZXNwaXRlIHRoZSBicmVha2luZyBjaGFuZ2UgaW4gdGhlIHR5cGUgZGVmaW5pdGlvbi5cblx0XHRcdHRoaXMuX2NvbnRlbnQgPSBbbmV3IExhbmd1YWdlTW9kZWxUZXh0UGFydCh2YWx1ZSldO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb250ZW50ID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNvbnRlbnQoKTogKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50O1xuXHR9XG5cblx0bmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHJvbGU6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLCBjb250ZW50OiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSwgbmFtZT86IHN0cmluZykge1xuXHRcdHRoaXMucm9sZSA9IHJvbGU7XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyIGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIge1xuXG5cdHN0YXRpYyBVc2VyKGNvbnRlbnQ6IHN0cmluZyB8IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdLCBuYW1lPzogc3RyaW5nKTogTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMiB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyKExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudCwgbmFtZSk7XG5cdH1cblxuXHRzdGF0aWMgQXNzaXN0YW50KGNvbnRlbnQ6IHN0cmluZyB8IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdLCBuYW1lPzogc3RyaW5nKTogTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMiB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyKExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50LCBjb250ZW50LCBuYW1lKTtcblx0fVxuXG5cdHJvbGU6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlO1xuXG5cdHByaXZhdGUgX2NvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydClbXSA9IFtdO1xuXG5cdHNldCBjb250ZW50KHZhbHVlOiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydCB8IExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpW10pIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gd2UgY2hhbmdlZCB0aGlzIGFuZCBzdGlsbCBzdXBwb3J0IHNldHRpbmcgY29udGVudCB3aXRoIGEgc3RyaW5nIHByb3BlcnR5LiB0aGlzIGtlZXAgdGhlIEFQSSBydW50aW1lIHN0YWJsZVxuXHRcdFx0Ly8gZGVzcGl0ZSB0aGUgYnJlYWtpbmcgY2hhbmdlIGluIHRoZSB0eXBlIGRlZmluaXRpb24uXG5cdFx0XHR0aGlzLl9jb250ZW50ID0gW25ldyBMYW5ndWFnZU1vZGVsVGV4dFBhcnQodmFsdWUpXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29udGVudCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjb250ZW50KCk6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydClbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnQ7XG5cdH1cblxuXHQvLyBUZW1wIHRvIGF2b2lkIGJyZWFraW5nIGNoYW5nZXNcblx0c2V0IGNvbnRlbnQyKHZhbHVlOiAoc3RyaW5nIHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhpcy5jb250ZW50ID0gdmFsdWUubWFwKHBhcnQgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIHBhcnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsVGV4dFBhcnQocGFydCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY29udGVudDIoKTogKHN0cmluZyB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQgfCBMYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KVtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZW50Lm1hcChwYXJ0ID0+IHtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0LnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fSk7XG5cdH1cblxuXHRuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Iocm9sZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUsIGNvbnRlbnQ6IHN0cmluZyB8IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydClbXSwgbmFtZT86IHN0cmluZykge1xuXHRcdHRoaXMucm9sZSA9IHJvbGU7XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgaW1wbGVtZW50cyB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB7XG5cdGNhbGxJZDogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGlucHV0OiBhbnk7XG5cblx0Y29uc3RydWN0b3IoY2FsbElkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgaW5wdXQ6IGFueSkge1xuXHRcdHRoaXMuY2FsbElkID0gY2FsbElkO1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cblx0XHR0aGlzLmlucHV0ID0gaW5wdXQ7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSB7XG5cdEFzc2lzdGFudCA9IDAsXG5cdFVzZXIgPSAxLFxuXHRFeHRlbnNpb24gPSAyLFxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxUZXh0UGFydDIge1xuXHR2YWx1ZTogc3RyaW5nO1xuXHRhdWRpZW5jZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2VbXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nLCBhdWRpZW5jZT86IHZzY29kZS5MYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlW10pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0YXVkaWVuY2UgPSBhdWRpZW5jZTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUZXh0UGFydCxcblx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLFxuXHRcdFx0YXVkaWVuY2U6IHRoaXMuYXVkaWVuY2UsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxEYXRhUGFydDIge1xuXHRtaW1lVHlwZTogc3RyaW5nO1xuXHRkYXRhOiBVaW50OEFycmF5PEFycmF5QnVmZmVyTGlrZT47XG5cdGF1ZGllbmNlOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGRhdGE6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXJMaWtlPiwgbWltZVR5cGU6IHN0cmluZywgYXVkaWVuY2U/OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdKSB7XG5cdFx0dGhpcy5taW1lVHlwZSA9IG1pbWVUeXBlO1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5hdWRpZW5jZSA9IGF1ZGllbmNlO1xuXHR9XG5cblx0c3RhdGljIGltYWdlKGRhdGE6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXJMaWtlPiwgbWltZVR5cGU6IHN0cmluZyk6IHZzY29kZS5MYW5ndWFnZU1vZGVsRGF0YVBhcnQge1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGRhdGEsIG1pbWVUeXBlKTtcblx0fVxuXG5cdHN0YXRpYyBqc29uKHZhbHVlOiBvYmplY3QsIG1pbWU6IHN0cmluZyA9ICd0ZXh0L3gtanNvbicpOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHtcblx0XHRjb25zdCByYXdTdHIgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgdW5kZWZpbmVkLCAnXFx0Jyk7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRGF0YVBhcnQoVlNCdWZmZXIuZnJvbVN0cmluZyhyYXdTdHIpLmJ1ZmZlciwgbWltZSk7XG5cdH1cblxuXHRzdGF0aWMgdGV4dCh2YWx1ZTogc3RyaW5nLCBtaW1lOiBzdHJpbmcgPSBNaW1lcy50ZXh0KTogdnNjb2RlLkxhbmd1YWdlTW9kZWxEYXRhUGFydCB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRGF0YVBhcnQoVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSkuYnVmZmVyLCBtaW1lKTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxEYXRhUGFydCxcblx0XHRcdG1pbWVUeXBlOiB0aGlzLm1pbWVUeXBlLFxuXHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAodGhpcy5kYXRhKSksXG5cdFx0XHRhdWRpZW5jZTogdGhpcy5hdWRpZW5jZVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdEltYWdlTWltZVR5cGUge1xuXHRQTkcgPSAnaW1hZ2UvcG5nJyxcblx0SlBFRyA9ICdpbWFnZS9qcGVnJyxcblx0R0lGID0gJ2ltYWdlL2dpZicsXG5cdFdFQlAgPSAnaW1hZ2Uvd2VicCcsXG5cdEJNUCA9ICdpbWFnZS9ibXAnLFxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydCBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0IHtcblx0dmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRpZD86IHN0cmluZztcblx0bWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IGFueSB9O1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXSwgaWQ/OiBzdHJpbmcsIG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBhbnkgfSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydCxcblx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLFxuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRtZXRhZGF0YTogdGhpcy5tZXRhZGF0YSxcblx0XHR9O1xuXHR9XG59XG5cblxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQge1xuXHR2YWx1ZTogdW5rbm93bjtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdW5rbm93bikge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0LFxuXHRcdFx0dmFsdWU6IHRoaXMudmFsdWUsXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsQ2hhdFN5c3RlbU1lc3NhZ2Uge1xuXHRjb250ZW50OiBzdHJpbmc7XG5cdGNvbnN0cnVjdG9yKGNvbnRlbnQ6IHN0cmluZykge1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdH1cbn1cblxuXG4vKipcbiAqIEBkZXByZWNhdGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsQ2hhdFVzZXJNZXNzYWdlIHtcblx0Y29udGVudDogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoY29udGVudDogc3RyaW5nLCBuYW1lPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHR9XG59XG5cbi8qKlxuICogQGRlcHJlY2F0ZWRcbiAqL1xuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxDaGF0QXNzaXN0YW50TWVzc2FnZSB7XG5cdGNvbnRlbnQ6IHN0cmluZztcblx0bmFtZT86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihjb250ZW50OiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHRcdHRoaXMubmFtZSA9IG5hbWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxFcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgI25hbWUgPSAnTGFuZ3VhZ2VNb2RlbEVycm9yJztcblxuXHRzdGF0aWMgTm90Rm91bmQobWVzc2FnZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRXJyb3IobWVzc2FnZSwgTGFuZ3VhZ2VNb2RlbEVycm9yLk5vdEZvdW5kLm5hbWUpO1xuXHR9XG5cblx0c3RhdGljIE5vUGVybWlzc2lvbnMobWVzc2FnZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRXJyb3IobWVzc2FnZSwgTGFuZ3VhZ2VNb2RlbEVycm9yLk5vUGVybWlzc2lvbnMubmFtZSk7XG5cdH1cblxuXHRzdGF0aWMgQmxvY2tlZChtZXNzYWdlPzogc3RyaW5nKTogTGFuZ3VhZ2VNb2RlbEVycm9yIHtcblx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxFcnJvcihtZXNzYWdlLCBMYW5ndWFnZU1vZGVsRXJyb3IuQmxvY2tlZC5uYW1lKTtcblx0fVxuXG5cdHN0YXRpYyB0cnlEZXNlcmlhbGl6ZShkYXRhOiBTZXJpYWxpemVkRXJyb3IpOiBMYW5ndWFnZU1vZGVsRXJyb3IgfCB1bmRlZmluZWQge1xuXHRcdGlmIChkYXRhLm5hbWUgIT09IExhbmd1YWdlTW9kZWxFcnJvci4jbmFtZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRXJyb3IoZGF0YS5tZXNzYWdlLCBkYXRhLmNvZGUsIGRhdGEuY2F1c2UpO1xuXHR9XG5cblx0cmVhZG9ubHkgY29kZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U/OiBzdHJpbmcsIGNvZGU/OiBzdHJpbmcsIGNhdXNlPzogRXJyb3IpIHtcblx0XHRzdXBlcihtZXNzYWdlLCB7IGNhdXNlIH0pO1xuXHRcdHRoaXMubmFtZSA9IExhbmd1YWdlTW9kZWxFcnJvci4jbmFtZTtcblx0XHR0aGlzLmNvZGUgPSBjb2RlID8/ICcnO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sUmVzdWx0IHtcblx0Y29uc3RydWN0b3IocHVibGljIGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSkgeyB9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQsXG5cdFx0XHRjb250ZW50OiB0aGlzLmNvbnRlbnQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQyIHtcblx0Y29uc3RydWN0b3IocHVibGljIGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSkgeyB9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQsXG5cdFx0XHRjb250ZW50OiB0aGlzLmNvbnRlbnQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5kZWRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCBleHRlbmRzIExhbmd1YWdlTW9kZWxUb29sUmVzdWx0IHtcblx0dG9vbFJlc3VsdE1lc3NhZ2U/OiBzdHJpbmcgfCBNYXJrZG93blN0cmluZztcblx0dG9vbFJlc3VsdERldGFpbHM/OiBBcnJheTxVUkkgfCBMb2NhdGlvbj47XG5cdHRvb2xNZXRhZGF0YT86IHVua25vd247XG5cdGhhc0Vycm9yPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGVudW0gTGFuZ3VhZ2VNb2RlbENoYXRUb29sTW9kZSB7XG5cdEF1dG8gPSAxLFxuXHRSZXF1aXJlZCA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sRXh0ZW5zaW9uU291cmNlIGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sRXh0ZW5zaW9uU291cmNlIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sTUNQU291cmNlIGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sTUNQU291cmNlIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBpbnN0cnVjdGlvbnM6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gYWlcblxuZXhwb3J0IGVudW0gUmVsYXRlZEluZm9ybWF0aW9uVHlwZSB7XG5cdFN5bWJvbEluZm9ybWF0aW9uID0gMSxcblx0Q29tbWFuZEluZm9ybWF0aW9uID0gMixcblx0U2VhcmNoSW5mb3JtYXRpb24gPSAzLFxuXHRTZXR0aW5nSW5mb3JtYXRpb24gPSA0XG59XG5cbmV4cG9ydCBlbnVtIFNldHRpbmdzU2VhcmNoUmVzdWx0S2luZCB7XG5cdEVNQkVEREVEID0gMSxcblx0TExNX1JBTktFRCA9IDIsXG5cdENBTkNFTEVEID0gMyxcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTcGVlY2hcblxuZXhwb3J0IGVudW0gU3BlZWNoVG9UZXh0U3RhdHVzIHtcblx0U3RhcnRlZCA9IDEsXG5cdFJlY29nbml6aW5nID0gMixcblx0UmVjb2duaXplZCA9IDMsXG5cdFN0b3BwZWQgPSA0LFxuXHRFcnJvciA9IDVcbn1cblxuZXhwb3J0IGVudW0gVGV4dFRvU3BlZWNoU3RhdHVzIHtcblx0U3RhcnRlZCA9IDEsXG5cdFN0b3BwZWQgPSAyLFxuXHRFcnJvciA9IDNcbn1cblxuZXhwb3J0IGVudW0gS2V5d29yZFJlY29nbml0aW9uU3RhdHVzIHtcblx0UmVjb2duaXplZCA9IDEsXG5cdFN0b3BwZWQgPSAyXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTUNQXG5leHBvcnQgZW51bSBNY3BUb29sQXZhaWxhYmlsaXR5IHtcblx0SW5pdGlhbCA9IDAsXG5cdER5bmFtaWMgPSAxLFxufVxuXG5leHBvcnQgY2xhc3MgTWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uIGltcGxlbWVudHMgdnNjb2RlLk1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbiB7XG5cdGN3ZD86IFVSSTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgY29tbWFuZDogc3RyaW5nLFxuXHRcdHB1YmxpYyBhcmdzOiBzdHJpbmdbXSxcblx0XHRwdWJsaWMgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBudWxsPiA9IHt9LFxuXHRcdHB1YmxpYyB2ZXJzaW9uPzogc3RyaW5nLFxuXHRcdHB1YmxpYyBtZXRhZGF0YT86IHZzY29kZS5NY3BTZXJ2ZXJNZXRhZGF0YSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uIGltcGxlbWVudHMgdnNjb2RlLk1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHVyaTogVVJJLFxuXHRcdHB1YmxpYyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge30sXG5cdFx0cHVibGljIHZlcnNpb24/OiBzdHJpbmcsXG5cdFx0cHVibGljIG1ldGFkYXRhPzogdnNjb2RlLk1jcFNlcnZlck1ldGFkYXRhLFxuXHRcdHB1YmxpYyBhdXRoZW50aWNhdGlvbj86IHsgcHJvdmlkZXJJZDogc3RyaW5nOyBzY29wZXM6IHN0cmluZ1tdIH0sXG5cdCkgeyB9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVn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Q0o7QUFDTDsiLAogICJuYW1lcyI6IFsiQ29kZUFjdGlvbktpbmQiLCAiRGlhZ25vc3RpYyIsICJMb2NhdGlvbiIsICJNYXJrZG93blN0cmluZyIsICJQb3NpdGlvbiIsICJSYW5nZSIsICJTbmlwcGV0U3RyaW5nIiwgIlN5bWJvbEtpbmQiLCAiU3ltYm9sVGFnIiwgIlRleHRFZGl0IiwgIldvcmtzcGFjZUVkaXQiLCAiVGVybWluYWxPdXRwdXRBbmNob3IiLCAiVGVybWluYWxRdWlja0ZpeFR5cGUiLCAiRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlIiwgIkhvdmVyVmVyYm9zaXR5QWN0aW9uIiwgIkRvY3VtZW50SGlnaGxpZ2h0S2luZCIsICJDb2RlQWN0aW9uVHJpZ2dlcktpbmQiLCAiTGFuZ3VhZ2VTdGF0dXNTZXZlcml0eSIsICJTaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQiLCAiSW5sYXlIaW50S2luZCIsICJDb21wbGV0aW9uVHJpZ2dlcktpbmQiLCAiQ29tcGxldGlvbkl0ZW1LaW5kIiwgIkNvbXBsZXRpb25JdGVtVGFnIiwgIlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCIsICJJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCIsICJJbmxpbmVDb21wbGV0aW9uRGlzcGxheUxvY2F0aW9uS2luZCIsICJWaWV3Q29sdW1uIiwgIlN0YXR1c0JhckFsaWdubWVudCIsICJUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSIsICJUZXh0RG9jdW1lbnRTYXZlUmVhc29uIiwgIlRleHRFZGl0b3JSZXZlYWxUeXBlIiwgIlRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kIiwgIlRleHRFZGl0b3JDaGFuZ2VLaW5kIiwgIlRleHREb2N1bWVudENoYW5nZVJlYXNvbiIsICJEZWNvcmF0aW9uUmFuZ2VCZWhhdmlvciIsICJTeW50YXhUb2tlblR5cGUiLCAiQ29sb3JGb3JtYXQiLCAiU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUiLCAiVGVybWluYWxFeGl0UmVhc29uIiwgIlRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UiLCAiVGVybWluYWxTaGVsbFR5cGUiLCAiVGVybWluYWxMb2NhdGlvbiIsICJUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZCIsICJUYXNrUmV2ZWFsS2luZCIsICJUYXNrRXZlbnRLaW5kIiwgIlRhc2tQYW5lbEtpbmQiLCAiU2hlbGxRdW90aW5nIiwgIlRhc2tTY29wZSIsICJUYXNrUnVuT24iLCAiUHJvZ3Jlc3NMb2NhdGlvbiIsICJWaWV3QmFkZ2UiLCAiVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlIiwgIlRyZWVJdGVtQ2hlY2tib3hTdGF0ZSIsICJEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQiLCAiQ29uZmlndXJhdGlvblRhcmdldCIsICJJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQiLCAiSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZCIsICJOZXdTeW1ib2xOYW1lVGFnIiwgIk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCIsICJGaWxlQ2hhbmdlVHlwZSIsICJGb2xkaW5nUmFuZ2VLaW5kIiwgIkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlIiwgIkNvbW1lbnRNb2RlIiwgIkNvbW1lbnRTdGF0ZSIsICJDb21tZW50VGhyZWFkU3RhdGUiLCAiQ29tbWVudFRocmVhZEFwcGxpY2FiaWxpdHkiLCAiQ29tbWVudFRocmVhZEZvY3VzIiwgImxpbmUiLCAiY2hhciIsICJEZWJ1Z0NvbnNvbGVNb2RlIiwgIlF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiIsICJRdWlja1BpY2tJdGVtS2luZCIsICJJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eSIsICJFeHRlbnNpb25LaW5kIiwgIkNvbG9yVGhlbWVLaW5kIiwgIk5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlIiwgIk5vdGVib29rQ2VsbFN0YXR1c0JhckFsaWdubWVudCIsICJOb3RlYm9va0VkaXRvclJldmVhbFR5cGUiLCAiTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHkiLCAiTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHkyIiwgIk5vdGVib29rVmFyaWFibGVzUmVxdWVzdEtpbmQiLCAiRXh0ZW5zaW9uTW9kZSIsICJFeHRlbnNpb25SdW50aW1lIiwgIlN0YW5kYXJkVG9rZW5UeXBlIiwgIlN5bnRheEhpZ2hsaWdodGluZ1Rva2VuRm9udFN0eWxlIiwgIlRlc3RSZXN1bHRTdGF0ZSIsICJUZXN0UnVuUHJvZmlsZUtpbmQiLCAiRXh0ZXJuYWxVcmlPcGVuZXJQcmlvcml0eSIsICJXb3Jrc3BhY2VUcnVzdFN0YXRlIiwgIlBvcnRBdXRvRm9yd2FyZEFjdGlvbiIsICJJbnRlcmFjdGl2ZVNlc3Npb25Wb3RlRGlyZWN0aW9uIiwgIkNoYXRDb3B5S2luZCIsICJDaGF0VmFyaWFibGVMZXZlbCIsICJDaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lIiwgIkNoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZCIsICJJbnRlcmFjdGl2ZUVkaXRvclJlc3BvbnNlRmVlZGJhY2tLaW5kIiwgIkNoYXRSZXN1bHRGZWVkYmFja0tpbmQiLCAiQ2hhdFF1ZXN0aW9uVHlwZSIsICJDaGF0VG9kb1N0YXR1cyIsICJDaGF0RGVidWdTdWJhZ2VudFN0YXR1cyIsICJDaGF0TG9jYXRpb24iLCAiQ2hhdFNlc3Npb25TdGF0dXMiLCAiQ2hhdERlYnVnTG9nTGV2ZWwiLCAiQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQiLCAiQ2hhdERlYnVnSG9va1Jlc3VsdCIsICJDaGF0RGVidWdNZXNzYWdlQ29udGVudFR5cGUiLCAiQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydFN0YXR1c0tpbmQiLCAiQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24iLCAiTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSIsICJDaGF0RXJyb3JMZXZlbCIsICJDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSIsICJMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlIiwgIkNoYXRJbWFnZU1pbWVUeXBlIiwgIkxhbmd1YWdlTW9kZWxDaGF0VG9vbE1vZGUiLCAiUmVsYXRlZEluZm9ybWF0aW9uVHlwZSIsICJTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQiLCAiU3BlZWNoVG9UZXh0U3RhdHVzIiwgIlRleHRUb1NwZWVjaFN0YXR1cyIsICJLZXl3b3JkUmVjb2duaXRpb25TdGF0dXMiLCAiTWNwVG9vbEF2YWlsYWJpbGl0eSJdCn0K
