import { asArray, coalesce, isNonEmptyArray } from "../../../base/common/arrays.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../base/common/buffer.js";
import { UriList } from "../../../base/common/dataTransfer.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import * as htmlContent from "../../../base/common/htmlContent.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import * as marked from "../../../base/common/marked/marked.js";
import { parse, revive } from "../../../base/common/marshalling.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Mimes } from "../../../base/common/mime.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { OS } from "../../../base/common/platform.js";
import { WellDefinedPrefixTree } from "../../../base/common/prefixTree.js";
import { basename } from "../../../base/common/resources.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isDefined, isEmptyObject, isNumber, isString, isUndefinedOrNull } from "../../../base/common/types.js";
import { URI, isUriComponents } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { RenderLineNumbersType } from "../../../editor/common/config/editorOptions.js";
import * as editorRange from "../../../editor/common/core/range.js";
import * as encodedTokenAttributes from "../../../editor/common/encodedTokenAttributes.js";
import * as languages from "../../../editor/common/languages.js";
import { EndOfLineSequence, TrackedRangeStickiness } from "../../../editor/common/model.js";
import { MarkerSeverity, MarkerTag } from "../../../platform/markers/common/markers.js";
import { ProgressLocation as MainProgressLocation } from "../../../platform/progress/common/progress.js";
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from "../../common/editor.js";
import { LocalChatSessionUri } from "../../contrib/chat/common/model/chatUri.js";
import { isElementVariableEntry, isImageVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry } from "../../contrib/chat/common/attachments/chatVariableEntries.js";
import { coerceImageBuffer } from "../../contrib/chat/common/chatImageExtraction.js";
import { ChatSessionStatus } from "../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { resolveEffectiveCommand } from "../../contrib/chat/common/promptSyntax/hookSchema.js";
import { ToolDataSource, ToolInvocationPresentation } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import * as chatProvider from "../../contrib/chat/common/languageModels.js";
import { DebugTreeItemCollapsibleState } from "../../contrib/debug/common/debug.js";
import { McpServerLaunch, McpServerTransportType } from "../../contrib/mcp/common/mcpTypes.js";
import * as notebooks from "../../contrib/notebook/common/notebookCommon.js";
import { CellEditType } from "../../contrib/notebook/common/notebookCommon.js";
import { InputValidationType } from "../../contrib/scm/common/scm.js";
import { TestId } from "../../contrib/testing/common/testId.js";
import { DetailType, TestMessageType, TestRunProfileBitset, denamespaceTestTag, namespaceTestTag } from "../../contrib/testing/common/testTypes.js";
import { AiSettingsSearchResultKind } from "../../services/aiSettingsSearch/common/aiSettingsSearch.js";
import { ACTIVE_GROUP, SIDE_GROUP } from "../../services/editor/common/editorService.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { getPrivateApiFor } from "./extHostTestingPrivateApi.js";
import * as types from "./extHostTypes.js";
import { LanguageModelTextPart } from "./extHostTypes.js";
var Selection;
((Selection2) => {
  function to(selection) {
    const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
    const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
    const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
    return new types.Selection(start, end);
  }
  Selection2.to = to;
  function from(selection) {
    const { anchor, active } = selection;
    return {
      selectionStartLineNumber: anchor.line + 1,
      selectionStartColumn: anchor.character + 1,
      positionLineNumber: active.line + 1,
      positionColumn: active.character + 1
    };
  }
  Selection2.from = from;
})(Selection || (Selection = {}));
var Range;
((Range2) => {
  function from(range) {
    if (!range) {
      return void 0;
    }
    const { start, end } = range;
    return {
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1
    };
  }
  Range2.from = from;
  function to(range) {
    if (!range) {
      return void 0;
    }
    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
  }
  Range2.to = to;
})(Range || (Range = {}));
var Location;
((Location2) => {
  function from(location2) {
    return {
      uri: location2.uri,
      range: Range.from(location2.range)
    };
  }
  Location2.from = from;
  function to(location2) {
    return new types.Location(URI.revive(location2.uri), Range.to(location2.range));
  }
  Location2.to = to;
})(Location || (Location = {}));
var TokenType;
((TokenType2) => {
  function to(type) {
    switch (type) {
      case encodedTokenAttributes.StandardTokenType.Comment:
        return types.StandardTokenType.Comment;
      case encodedTokenAttributes.StandardTokenType.Other:
        return types.StandardTokenType.Other;
      case encodedTokenAttributes.StandardTokenType.RegEx:
        return types.StandardTokenType.RegEx;
      case encodedTokenAttributes.StandardTokenType.String:
        return types.StandardTokenType.String;
    }
  }
  TokenType2.to = to;
})(TokenType || (TokenType = {}));
var Position;
((Position2) => {
  function to(position) {
    return new types.Position(position.lineNumber - 1, position.column - 1);
  }
  Position2.to = to;
  function from(position) {
    return { lineNumber: position.line + 1, column: position.character + 1 };
  }
  Position2.from = from;
})(Position || (Position = {}));
var DocumentSelector;
((DocumentSelector2) => {
  function from(value, uriTransformer, extension) {
    return coalesce(asArray(value).map((sel) => _doTransformDocumentSelector(sel, uriTransformer, extension)));
  }
  DocumentSelector2.from = from;
  function _doTransformDocumentSelector(selector, uriTransformer, extension) {
    if (typeof selector === "string") {
      return {
        $serialized: true,
        language: selector,
        isBuiltin: extension?.isBuiltin
      };
    }
    if (selector) {
      return {
        $serialized: true,
        language: selector.language,
        scheme: _transformScheme(selector.scheme, uriTransformer),
        pattern: GlobPattern.from(selector.pattern) ?? void 0,
        exclusive: selector.exclusive,
        notebookType: selector.notebookType,
        isBuiltin: extension?.isBuiltin
      };
    }
    return void 0;
  }
  function _transformScheme(scheme, uriTransformer) {
    if (uriTransformer && typeof scheme === "string") {
      return uriTransformer.transformOutgoingScheme(scheme);
    }
    return scheme;
  }
})(DocumentSelector || (DocumentSelector = {}));
var TabSelector;
((TabSelector2) => {
  function isViewTypeSelector(value) {
    return value.viewType !== void 0;
  }
  function from(value, uriTransformer, extension) {
    if (isViewTypeSelector(value)) {
      return { viewType: value.viewType };
    }
    return { uri: DocumentSelector.from(value.uri, uriTransformer, extension) };
  }
  TabSelector2.from = from;
})(TabSelector || (TabSelector = {}));
var DiagnosticTag;
((DiagnosticTag2) => {
  function from(value) {
    switch (value) {
      case types.DiagnosticTag.Unnecessary:
        return MarkerTag.Unnecessary;
      case types.DiagnosticTag.Deprecated:
        return MarkerTag.Deprecated;
    }
    return void 0;
  }
  DiagnosticTag2.from = from;
  function to(value) {
    switch (value) {
      case MarkerTag.Unnecessary:
        return types.DiagnosticTag.Unnecessary;
      case MarkerTag.Deprecated:
        return types.DiagnosticTag.Deprecated;
      default:
        return void 0;
    }
  }
  DiagnosticTag2.to = to;
})(DiagnosticTag || (DiagnosticTag = {}));
var Diagnostic;
((Diagnostic2) => {
  function from(value) {
    let code;
    if (value.code) {
      if (isString(value.code) || isNumber(value.code)) {
        code = String(value.code);
      } else {
        code = {
          value: String(value.code.value),
          target: value.code.target
        };
      }
    }
    return {
      ...Range.from(value.range),
      message: value.message,
      source: value.source,
      code,
      severity: DiagnosticSeverity.from(value.severity),
      relatedInformation: value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.from),
      tags: Array.isArray(value.tags) ? coalesce(value.tags.map(DiagnosticTag.from)) : void 0
    };
  }
  Diagnostic2.from = from;
  function to(value) {
    const res = new types.Diagnostic(Range.to(value), value.message, DiagnosticSeverity.to(value.severity));
    res.source = value.source;
    res.code = isString(value.code) ? value.code : value.code?.value;
    res.relatedInformation = value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.to);
    res.tags = value.tags && coalesce(value.tags.map(DiagnosticTag.to));
    return res;
  }
  Diagnostic2.to = to;
})(Diagnostic || (Diagnostic = {}));
var DiagnosticRelatedInformation;
((DiagnosticRelatedInformation2) => {
  function from(value) {
    return {
      ...Range.from(value.location.range),
      message: value.message,
      resource: value.location.uri
    };
  }
  DiagnosticRelatedInformation2.from = from;
  function to(value) {
    return new types.DiagnosticRelatedInformation(new types.Location(value.resource, Range.to(value)), value.message);
  }
  DiagnosticRelatedInformation2.to = to;
})(DiagnosticRelatedInformation || (DiagnosticRelatedInformation = {}));
var DiagnosticSeverity;
((DiagnosticSeverity2) => {
  function from(value) {
    switch (value) {
      case types.DiagnosticSeverity.Error:
        return MarkerSeverity.Error;
      case types.DiagnosticSeverity.Warning:
        return MarkerSeverity.Warning;
      case types.DiagnosticSeverity.Information:
        return MarkerSeverity.Info;
      case types.DiagnosticSeverity.Hint:
        return MarkerSeverity.Hint;
    }
    return MarkerSeverity.Error;
  }
  DiagnosticSeverity2.from = from;
  function to(value) {
    switch (value) {
      case MarkerSeverity.Info:
        return types.DiagnosticSeverity.Information;
      case MarkerSeverity.Warning:
        return types.DiagnosticSeverity.Warning;
      case MarkerSeverity.Error:
        return types.DiagnosticSeverity.Error;
      case MarkerSeverity.Hint:
        return types.DiagnosticSeverity.Hint;
      default:
        return types.DiagnosticSeverity.Error;
    }
  }
  DiagnosticSeverity2.to = to;
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
var ViewColumn;
((ViewColumn2) => {
  function from(column) {
    if (typeof column === "number" && column >= types.ViewColumn.One) {
      return column - 1;
    }
    if (column === types.ViewColumn.Beside) {
      return SIDE_GROUP;
    }
    return ACTIVE_GROUP;
  }
  ViewColumn2.from = from;
  function to(position) {
    if (typeof position === "number" && position >= 0) {
      return position + 1;
    }
    throw new Error(`invalid 'EditorGroupColumn'`);
  }
  ViewColumn2.to = to;
})(ViewColumn || (ViewColumn = {}));
function isDecorationOptions(something) {
  return typeof something.range !== "undefined";
}
function isDecorationOptionsArr(something) {
  if (something.length === 0) {
    return true;
  }
  return isDecorationOptions(something[0]) ? true : false;
}
var MarkdownString;
((MarkdownString2) => {
  function fromMany(markup) {
    return markup.map(MarkdownString2.from);
  }
  MarkdownString2.fromMany = fromMany;
  function isCodeblock(thing) {
    return thing && typeof thing === "object" && typeof thing.language === "string" && typeof thing.value === "string";
  }
  function from(markup) {
    let res;
    if (isCodeblock(markup)) {
      const { language, value } = markup;
      res = { value: "```" + language + "\n" + value + "\n```\n" };
    } else if (types.MarkdownString.isMarkdownString(markup)) {
      res = { value: markup.value, isTrusted: markup.isTrusted, supportThemeIcons: markup.supportThemeIcons, supportHtml: markup.supportHtml, supportAlertSyntax: markup.supportAlertSyntax, baseUri: markup.baseUri };
    } else if (typeof markup === "string") {
      res = { value: markup };
    } else {
      res = { value: "" };
    }
    const resUris = /* @__PURE__ */ Object.create(null);
    res.uris = resUris;
    const collectUri = ({ href }) => {
      try {
        let uri = URI.parse(href, true);
        uri = uri.with({ query: _uriMassage(uri.query, resUris) });
        resUris[href] = uri;
      } catch (e) {
      }
      return "";
    };
    marked.marked.walkTokens(marked.marked.lexer(res.value), (token) => {
      if (token.type === "link") {
        collectUri({ href: token.href });
      } else if (token.type === "image") {
        if (typeof token.href === "string") {
          collectUri(htmlContent.parseHrefAndDimensions(token.href));
        }
      }
    });
    return res;
  }
  MarkdownString2.from = from;
  function _uriMassage(part, bucket) {
    if (!part) {
      return part;
    }
    let data;
    try {
      data = parse(part);
    } catch (e) {
    }
    if (!data) {
      return part;
    }
    let changed = false;
    data = cloneAndChange(data, (value) => {
      if (URI.isUri(value)) {
        const key = `__uri_${Math.random().toString(16).slice(2, 8)}`;
        bucket[key] = value;
        changed = true;
        return key;
      } else {
        return void 0;
      }
    });
    if (!changed) {
      return part;
    }
    return JSON.stringify(data);
  }
  function to(value) {
    const result = new types.MarkdownString(value.value, value.supportThemeIcons);
    result.isTrusted = value.isTrusted;
    result.supportHtml = value.supportHtml;
    result.supportAlertSyntax = value.supportAlertSyntax;
    result.baseUri = value.baseUri ? URI.from(value.baseUri) : void 0;
    return result;
  }
  MarkdownString2.to = to;
  function fromStrict(value) {
    if (!value) {
      return void 0;
    }
    return typeof value === "string" ? value : MarkdownString2.from(value);
  }
  MarkdownString2.fromStrict = fromStrict;
})(MarkdownString || (MarkdownString = {}));
function fromRangeOrRangeWithMessage(ranges) {
  if (isDecorationOptionsArr(ranges)) {
    return ranges.map((r) => {
      return {
        range: Range.from(r.range),
        hoverMessage: Array.isArray(r.hoverMessage) ? MarkdownString.fromMany(r.hoverMessage) : r.hoverMessage ? MarkdownString.from(r.hoverMessage) : void 0,
        // eslint-disable-next-line local/code-no-any-casts
        renderOptions: (
          /* URI vs Uri */
          r.renderOptions
        )
      };
    });
  } else {
    return ranges.map((r) => {
      return {
        range: Range.from(r)
      };
    });
  }
}
function pathOrURIToURI(value) {
  if (typeof value === "undefined") {
    return value;
  }
  if (typeof value === "string") {
    return URI.file(value);
  } else {
    return value;
  }
}
var ThemableDecorationAttachmentRenderOptions;
((ThemableDecorationAttachmentRenderOptions2) => {
  function from(options) {
    if (typeof options === "undefined") {
      return options;
    }
    return {
      contentText: options.contentText,
      contentIconPath: options.contentIconPath ? pathOrURIToURI(options.contentIconPath) : void 0,
      border: options.border,
      borderColor: options.borderColor,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      color: options.color,
      backgroundColor: options.backgroundColor,
      margin: options.margin,
      width: options.width,
      height: options.height
    };
  }
  ThemableDecorationAttachmentRenderOptions2.from = from;
})(ThemableDecorationAttachmentRenderOptions || (ThemableDecorationAttachmentRenderOptions = {}));
var ThemableDecorationRenderOptions;
((ThemableDecorationRenderOptions2) => {
  function from(options) {
    if (typeof options === "undefined") {
      return options;
    }
    return {
      backgroundColor: options.backgroundColor,
      outline: options.outline,
      outlineColor: options.outlineColor,
      outlineStyle: options.outlineStyle,
      outlineWidth: options.outlineWidth,
      border: options.border,
      borderColor: options.borderColor,
      borderRadius: options.borderRadius,
      borderSpacing: options.borderSpacing,
      borderStyle: options.borderStyle,
      borderWidth: options.borderWidth,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      cursor: options.cursor,
      color: options.color,
      opacity: options.opacity,
      letterSpacing: options.letterSpacing,
      gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : void 0,
      gutterIconSize: options.gutterIconSize,
      overviewRulerColor: options.overviewRulerColor,
      before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : void 0,
      after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : void 0
    };
  }
  ThemableDecorationRenderOptions2.from = from;
})(ThemableDecorationRenderOptions || (ThemableDecorationRenderOptions = {}));
var DecorationRangeBehavior;
((DecorationRangeBehavior2) => {
  function from(value) {
    if (typeof value === "undefined") {
      return value;
    }
    switch (value) {
      case types.DecorationRangeBehavior.OpenOpen:
        return TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
      case types.DecorationRangeBehavior.ClosedClosed:
        return TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
      case types.DecorationRangeBehavior.OpenClosed:
        return TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
      case types.DecorationRangeBehavior.ClosedOpen:
        return TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
    }
  }
  DecorationRangeBehavior2.from = from;
})(DecorationRangeBehavior || (DecorationRangeBehavior = {}));
var DecorationRenderOptions;
((DecorationRenderOptions2) => {
  function from(options) {
    return {
      isWholeLine: options.isWholeLine,
      rangeBehavior: options.rangeBehavior ? DecorationRangeBehavior.from(options.rangeBehavior) : void 0,
      overviewRulerLane: options.overviewRulerLane,
      light: options.light ? ThemableDecorationRenderOptions.from(options.light) : void 0,
      dark: options.dark ? ThemableDecorationRenderOptions.from(options.dark) : void 0,
      backgroundColor: options.backgroundColor,
      outline: options.outline,
      outlineColor: options.outlineColor,
      outlineStyle: options.outlineStyle,
      outlineWidth: options.outlineWidth,
      border: options.border,
      borderColor: options.borderColor,
      borderRadius: options.borderRadius,
      borderSpacing: options.borderSpacing,
      borderStyle: options.borderStyle,
      borderWidth: options.borderWidth,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      cursor: options.cursor,
      color: options.color,
      opacity: options.opacity,
      letterSpacing: options.letterSpacing,
      gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : void 0,
      gutterIconSize: options.gutterIconSize,
      overviewRulerColor: options.overviewRulerColor,
      before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : void 0,
      after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : void 0
    };
  }
  DecorationRenderOptions2.from = from;
})(DecorationRenderOptions || (DecorationRenderOptions = {}));
var TextEdit;
((TextEdit2) => {
  function from(edit) {
    return {
      text: edit.newText,
      eol: edit.newEol && EndOfLine.from(edit.newEol),
      range: Range.from(edit.range)
    };
  }
  TextEdit2.from = from;
  function to(edit) {
    const result = new types.TextEdit(Range.to(edit.range), edit.text);
    result.newEol = typeof edit.eol === "undefined" ? void 0 : EndOfLine.to(edit.eol);
    return result;
  }
  TextEdit2.to = to;
})(TextEdit || (TextEdit = {}));
var WorkspaceEdit;
((WorkspaceEdit2) => {
  function from(value, versionInfo) {
    const result = {
      edits: []
    };
    if (value instanceof types.WorkspaceEdit) {
      const toCreate = new ResourceSet();
      for (const entry of value._allEntries()) {
        if (entry._type === types.FileEditType.File && URI.isUri(entry.to) && entry.from === void 0) {
          toCreate.add(entry.to);
        }
      }
      for (const entry of value._allEntries()) {
        if (entry._type === types.FileEditType.File) {
          let contents;
          if (entry.options?.contents) {
            if (ArrayBuffer.isView(entry.options.contents)) {
              contents = { type: "base64", value: encodeBase64(VSBuffer.wrap(entry.options.contents)) };
            } else {
              contents = { type: "dataTransferItem", id: entry.options.contents._itemId };
            }
          }
          result.edits.push({
            oldResource: entry.from,
            newResource: entry.to,
            options: { ...entry.options, contents },
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Text) {
          result.edits.push({
            resource: entry.uri,
            textEdit: TextEdit.from(entry.edit),
            versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : void 0,
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Snippet) {
          result.edits.push({
            resource: entry.uri,
            textEdit: {
              range: Range.from(entry.range),
              text: entry.edit.value,
              insertAsSnippet: true,
              keepWhitespace: entry.keepWhitespace
            },
            versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : void 0,
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Cell) {
          result.edits.push({
            metadata: entry.metadata,
            resource: entry.uri,
            cellEdit: entry.edit,
            notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri)
          });
        } else if (entry._type === types.FileEditType.CellReplace) {
          result.edits.push({
            metadata: entry.metadata,
            resource: entry.uri,
            notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri),
            cellEdit: {
              editType: notebooks.CellEditType.Replace,
              index: entry.index,
              count: entry.count,
              cells: entry.cells.map(NotebookCellData.from)
            }
          });
        }
      }
    }
    return result;
  }
  WorkspaceEdit2.from = from;
  function to(value) {
    const result = new types.WorkspaceEdit();
    const edits = new ResourceMap();
    for (const edit of value.edits) {
      if (edit.textEdit) {
        const item = edit;
        const uri = URI.revive(item.resource);
        const range = Range.to(item.textEdit.range);
        const text = item.textEdit.text;
        const isSnippet = item.textEdit.insertAsSnippet;
        let editOrSnippetTest;
        if (isSnippet) {
          editOrSnippetTest = types.SnippetTextEdit.replace(range, new types.SnippetString(text));
        } else {
          editOrSnippetTest = types.TextEdit.replace(range, text);
        }
        const array = edits.get(uri);
        if (!array) {
          edits.set(uri, [editOrSnippetTest]);
        } else {
          array.push(editOrSnippetTest);
        }
      } else {
        result.renameFile(
          URI.revive(edit.oldResource),
          URI.revive(edit.newResource),
          edit.options
        );
      }
    }
    for (const [uri, array] of edits) {
      result.set(uri, array);
    }
    return result;
  }
  WorkspaceEdit2.to = to;
})(WorkspaceEdit || (WorkspaceEdit = {}));
var SymbolKind;
((SymbolKind2) => {
  const _fromMapping = /* @__PURE__ */ Object.create(null);
  _fromMapping[types.SymbolKind.File] = languages.SymbolKind.File;
  _fromMapping[types.SymbolKind.Module] = languages.SymbolKind.Module;
  _fromMapping[types.SymbolKind.Namespace] = languages.SymbolKind.Namespace;
  _fromMapping[types.SymbolKind.Package] = languages.SymbolKind.Package;
  _fromMapping[types.SymbolKind.Class] = languages.SymbolKind.Class;
  _fromMapping[types.SymbolKind.Method] = languages.SymbolKind.Method;
  _fromMapping[types.SymbolKind.Property] = languages.SymbolKind.Property;
  _fromMapping[types.SymbolKind.Field] = languages.SymbolKind.Field;
  _fromMapping[types.SymbolKind.Constructor] = languages.SymbolKind.Constructor;
  _fromMapping[types.SymbolKind.Enum] = languages.SymbolKind.Enum;
  _fromMapping[types.SymbolKind.Interface] = languages.SymbolKind.Interface;
  _fromMapping[types.SymbolKind.Function] = languages.SymbolKind.Function;
  _fromMapping[types.SymbolKind.Variable] = languages.SymbolKind.Variable;
  _fromMapping[types.SymbolKind.Constant] = languages.SymbolKind.Constant;
  _fromMapping[types.SymbolKind.String] = languages.SymbolKind.String;
  _fromMapping[types.SymbolKind.Number] = languages.SymbolKind.Number;
  _fromMapping[types.SymbolKind.Boolean] = languages.SymbolKind.Boolean;
  _fromMapping[types.SymbolKind.Array] = languages.SymbolKind.Array;
  _fromMapping[types.SymbolKind.Object] = languages.SymbolKind.Object;
  _fromMapping[types.SymbolKind.Key] = languages.SymbolKind.Key;
  _fromMapping[types.SymbolKind.Null] = languages.SymbolKind.Null;
  _fromMapping[types.SymbolKind.EnumMember] = languages.SymbolKind.EnumMember;
  _fromMapping[types.SymbolKind.Struct] = languages.SymbolKind.Struct;
  _fromMapping[types.SymbolKind.Event] = languages.SymbolKind.Event;
  _fromMapping[types.SymbolKind.Operator] = languages.SymbolKind.Operator;
  _fromMapping[types.SymbolKind.TypeParameter] = languages.SymbolKind.TypeParameter;
  function from(kind) {
    return typeof _fromMapping[kind] === "number" ? _fromMapping[kind] : languages.SymbolKind.Property;
  }
  SymbolKind2.from = from;
  function to(kind) {
    for (const k in _fromMapping) {
      if (_fromMapping[k] === kind) {
        return Number(k);
      }
    }
    return types.SymbolKind.Property;
  }
  SymbolKind2.to = to;
})(SymbolKind || (SymbolKind = {}));
var SymbolTag;
((SymbolTag2) => {
  function from(kind) {
    switch (kind) {
      case types.SymbolTag.Deprecated:
        return languages.SymbolTag.Deprecated;
    }
  }
  SymbolTag2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.SymbolTag.Deprecated:
        return types.SymbolTag.Deprecated;
    }
  }
  SymbolTag2.to = to;
})(SymbolTag || (SymbolTag = {}));
var WorkspaceSymbol;
((WorkspaceSymbol2) => {
  function from(info) {
    return {
      name: info.name,
      kind: SymbolKind.from(info.kind),
      tags: info.tags && info.tags.map(SymbolTag.from),
      containerName: info.containerName,
      location: location.from(info.location)
    };
  }
  WorkspaceSymbol2.from = from;
  function to(info) {
    const result = new types.SymbolInformation(
      info.name,
      SymbolKind.to(info.kind),
      info.containerName,
      location.to(info.location)
    );
    result.tags = info.tags && info.tags.map(SymbolTag.to);
    return result;
  }
  WorkspaceSymbol2.to = to;
})(WorkspaceSymbol || (WorkspaceSymbol = {}));
var DocumentSymbol;
((DocumentSymbol2) => {
  function from(info) {
    const result = {
      name: info.name || "!!MISSING: name!!",
      detail: info.detail,
      range: Range.from(info.range),
      selectionRange: Range.from(info.selectionRange),
      kind: SymbolKind.from(info.kind),
      tags: info.tags?.map(SymbolTag.from) ?? []
    };
    if (info.children) {
      result.children = info.children.map(from);
    }
    return result;
  }
  DocumentSymbol2.from = from;
  function to(info) {
    const result = new types.DocumentSymbol(
      info.name,
      info.detail,
      SymbolKind.to(info.kind),
      Range.to(info.range),
      Range.to(info.selectionRange)
    );
    if (isNonEmptyArray(info.tags)) {
      result.tags = info.tags.map(SymbolTag.to);
    }
    if (info.children) {
      result.children = info.children.map(to);
    }
    return result;
  }
  DocumentSymbol2.to = to;
})(DocumentSymbol || (DocumentSymbol = {}));
var CallHierarchyItem;
((CallHierarchyItem2) => {
  function to(item) {
    const result = new types.CallHierarchyItem(
      SymbolKind.to(item.kind),
      item.name,
      item.detail || "",
      URI.revive(item.uri),
      Range.to(item.range),
      Range.to(item.selectionRange)
    );
    result._sessionId = item._sessionId;
    result._itemId = item._itemId;
    return result;
  }
  CallHierarchyItem2.to = to;
  function from(item, sessionId, itemId) {
    sessionId = sessionId ?? item._sessionId;
    itemId = itemId ?? item._itemId;
    if (sessionId === void 0 || itemId === void 0) {
      throw new Error("invalid item");
    }
    return {
      _sessionId: sessionId,
      _itemId: itemId,
      name: item.name,
      detail: item.detail,
      kind: SymbolKind.from(item.kind),
      uri: item.uri,
      range: Range.from(item.range),
      selectionRange: Range.from(item.selectionRange),
      tags: item.tags?.map(SymbolTag.from)
    };
  }
  CallHierarchyItem2.from = from;
})(CallHierarchyItem || (CallHierarchyItem = {}));
var CallHierarchyIncomingCall;
((CallHierarchyIncomingCall2) => {
  function to(item) {
    return new types.CallHierarchyIncomingCall(
      CallHierarchyItem.to(item.from),
      item.fromRanges.map((r) => Range.to(r))
    );
  }
  CallHierarchyIncomingCall2.to = to;
})(CallHierarchyIncomingCall || (CallHierarchyIncomingCall = {}));
var CallHierarchyOutgoingCall;
((CallHierarchyOutgoingCall2) => {
  function to(item) {
    return new types.CallHierarchyOutgoingCall(
      CallHierarchyItem.to(item.to),
      item.fromRanges.map((r) => Range.to(r))
    );
  }
  CallHierarchyOutgoingCall2.to = to;
})(CallHierarchyOutgoingCall || (CallHierarchyOutgoingCall = {}));
var location;
((location2) => {
  function from(value) {
    return {
      range: value.range && Range.from(value.range),
      uri: value.uri
    };
  }
  location2.from = from;
  function to(value) {
    return new types.Location(URI.revive(value.uri), Range.to(value.range));
  }
  location2.to = to;
})(location || (location = {}));
var DefinitionLink;
((DefinitionLink2) => {
  function from(value) {
    const definitionLink = value;
    const location2 = value;
    return {
      originSelectionRange: definitionLink.originSelectionRange ? Range.from(definitionLink.originSelectionRange) : void 0,
      uri: definitionLink.targetUri ? definitionLink.targetUri : location2.uri,
      range: Range.from(definitionLink.targetRange ? definitionLink.targetRange : location2.range),
      targetSelectionRange: definitionLink.targetSelectionRange ? Range.from(definitionLink.targetSelectionRange) : void 0
    };
  }
  DefinitionLink2.from = from;
  function to(value) {
    return {
      targetUri: URI.revive(value.uri),
      targetRange: Range.to(value.range),
      targetSelectionRange: value.targetSelectionRange ? Range.to(value.targetSelectionRange) : void 0,
      originSelectionRange: value.originSelectionRange ? Range.to(value.originSelectionRange) : void 0
    };
  }
  DefinitionLink2.to = to;
})(DefinitionLink || (DefinitionLink = {}));
var Hover;
((Hover2) => {
  function from(hover) {
    const convertedHover = {
      range: Range.from(hover.range),
      contents: MarkdownString.fromMany(hover.contents),
      canIncreaseVerbosity: hover.canIncreaseVerbosity,
      canDecreaseVerbosity: hover.canDecreaseVerbosity
    };
    return convertedHover;
  }
  Hover2.from = from;
  function to(info) {
    const contents = info.contents.map(MarkdownString.to);
    const range = Range.to(info.range);
    const canIncreaseVerbosity = info.canIncreaseVerbosity;
    const canDecreaseVerbosity = info.canDecreaseVerbosity;
    return new types.VerboseHover(contents, range, canIncreaseVerbosity, canDecreaseVerbosity);
  }
  Hover2.to = to;
})(Hover || (Hover = {}));
var EvaluatableExpression;
((EvaluatableExpression2) => {
  function from(expression) {
    return {
      range: Range.from(expression.range),
      expression: expression.expression
    };
  }
  EvaluatableExpression2.from = from;
  function to(info) {
    return new types.EvaluatableExpression(Range.to(info.range), info.expression);
  }
  EvaluatableExpression2.to = to;
})(EvaluatableExpression || (EvaluatableExpression = {}));
var InlineValue;
((InlineValue2) => {
  function from(inlineValue) {
    if (inlineValue instanceof types.InlineValueText) {
      return {
        type: "text",
        range: Range.from(inlineValue.range),
        text: inlineValue.text
      };
    } else if (inlineValue instanceof types.InlineValueVariableLookup) {
      return {
        type: "variable",
        range: Range.from(inlineValue.range),
        variableName: inlineValue.variableName,
        caseSensitiveLookup: inlineValue.caseSensitiveLookup
      };
    } else if (inlineValue instanceof types.InlineValueEvaluatableExpression) {
      return {
        type: "expression",
        range: Range.from(inlineValue.range),
        expression: inlineValue.expression
      };
    } else {
      throw new Error(`Unknown 'InlineValue' type`);
    }
  }
  InlineValue2.from = from;
  function to(inlineValue) {
    switch (inlineValue.type) {
      case "text":
        return {
          range: Range.to(inlineValue.range),
          text: inlineValue.text
        };
      case "variable":
        return {
          range: Range.to(inlineValue.range),
          variableName: inlineValue.variableName,
          caseSensitiveLookup: inlineValue.caseSensitiveLookup
        };
      case "expression":
        return {
          range: Range.to(inlineValue.range),
          expression: inlineValue.expression
        };
    }
  }
  InlineValue2.to = to;
})(InlineValue || (InlineValue = {}));
var InlineValueContext;
((InlineValueContext2) => {
  function from(inlineValueContext) {
    return {
      frameId: inlineValueContext.frameId,
      stoppedLocation: Range.from(inlineValueContext.stoppedLocation)
    };
  }
  InlineValueContext2.from = from;
  function to(inlineValueContext) {
    return new types.InlineValueContext(inlineValueContext.frameId, Range.to(inlineValueContext.stoppedLocation));
  }
  InlineValueContext2.to = to;
})(InlineValueContext || (InlineValueContext = {}));
var DocumentHighlight;
((DocumentHighlight2) => {
  function from(documentHighlight) {
    return {
      range: Range.from(documentHighlight.range),
      kind: documentHighlight.kind
    };
  }
  DocumentHighlight2.from = from;
  function to(occurrence) {
    return new types.DocumentHighlight(Range.to(occurrence.range), occurrence.kind);
  }
  DocumentHighlight2.to = to;
})(DocumentHighlight || (DocumentHighlight = {}));
var MultiDocumentHighlight;
((MultiDocumentHighlight2) => {
  function from(multiDocumentHighlight) {
    return {
      uri: multiDocumentHighlight.uri,
      highlights: multiDocumentHighlight.highlights.map(DocumentHighlight.from)
    };
  }
  MultiDocumentHighlight2.from = from;
  function to(multiDocumentHighlight) {
    return new types.MultiDocumentHighlight(URI.revive(multiDocumentHighlight.uri), multiDocumentHighlight.highlights.map(DocumentHighlight.to));
  }
  MultiDocumentHighlight2.to = to;
})(MultiDocumentHighlight || (MultiDocumentHighlight = {}));
var CompletionTriggerKind;
((CompletionTriggerKind2) => {
  function to(kind) {
    switch (kind) {
      case languages.CompletionTriggerKind.TriggerCharacter:
        return types.CompletionTriggerKind.TriggerCharacter;
      case languages.CompletionTriggerKind.TriggerForIncompleteCompletions:
        return types.CompletionTriggerKind.TriggerForIncompleteCompletions;
      case languages.CompletionTriggerKind.Invoke:
      default:
        return types.CompletionTriggerKind.Invoke;
    }
  }
  CompletionTriggerKind2.to = to;
})(CompletionTriggerKind || (CompletionTriggerKind = {}));
var CompletionContext;
((CompletionContext2) => {
  function to(context) {
    return {
      triggerKind: CompletionTriggerKind.to(context.triggerKind),
      triggerCharacter: context.triggerCharacter
    };
  }
  CompletionContext2.to = to;
})(CompletionContext || (CompletionContext = {}));
var CompletionItemTag;
((CompletionItemTag2) => {
  function from(kind) {
    switch (kind) {
      case types.CompletionItemTag.Deprecated:
        return languages.CompletionItemTag.Deprecated;
    }
  }
  CompletionItemTag2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.CompletionItemTag.Deprecated:
        return types.CompletionItemTag.Deprecated;
    }
  }
  CompletionItemTag2.to = to;
})(CompletionItemTag || (CompletionItemTag = {}));
var CompletionCommand;
((CompletionCommand2) => {
  function from(c, converter, disposables) {
    if ("icon" in c && "command" in c) {
      return {
        command: converter.toInternal(c.command, disposables),
        icon: IconPath.fromThemeIcon(c.icon)
      };
    }
    return { command: converter.toInternal(c, disposables) };
  }
  CompletionCommand2.from = from;
})(CompletionCommand || (CompletionCommand = {}));
var CompletionItemKind;
((CompletionItemKind2) => {
  const _from = /* @__PURE__ */ new Map([
    [types.CompletionItemKind.Method, languages.CompletionItemKind.Method],
    [types.CompletionItemKind.Function, languages.CompletionItemKind.Function],
    [types.CompletionItemKind.Constructor, languages.CompletionItemKind.Constructor],
    [types.CompletionItemKind.Field, languages.CompletionItemKind.Field],
    [types.CompletionItemKind.Variable, languages.CompletionItemKind.Variable],
    [types.CompletionItemKind.Class, languages.CompletionItemKind.Class],
    [types.CompletionItemKind.Interface, languages.CompletionItemKind.Interface],
    [types.CompletionItemKind.Struct, languages.CompletionItemKind.Struct],
    [types.CompletionItemKind.Module, languages.CompletionItemKind.Module],
    [types.CompletionItemKind.Property, languages.CompletionItemKind.Property],
    [types.CompletionItemKind.Unit, languages.CompletionItemKind.Unit],
    [types.CompletionItemKind.Value, languages.CompletionItemKind.Value],
    [types.CompletionItemKind.Constant, languages.CompletionItemKind.Constant],
    [types.CompletionItemKind.Enum, languages.CompletionItemKind.Enum],
    [types.CompletionItemKind.EnumMember, languages.CompletionItemKind.EnumMember],
    [types.CompletionItemKind.Keyword, languages.CompletionItemKind.Keyword],
    [types.CompletionItemKind.Snippet, languages.CompletionItemKind.Snippet],
    [types.CompletionItemKind.Text, languages.CompletionItemKind.Text],
    [types.CompletionItemKind.Color, languages.CompletionItemKind.Color],
    [types.CompletionItemKind.File, languages.CompletionItemKind.File],
    [types.CompletionItemKind.Reference, languages.CompletionItemKind.Reference],
    [types.CompletionItemKind.Folder, languages.CompletionItemKind.Folder],
    [types.CompletionItemKind.Event, languages.CompletionItemKind.Event],
    [types.CompletionItemKind.Operator, languages.CompletionItemKind.Operator],
    [types.CompletionItemKind.TypeParameter, languages.CompletionItemKind.TypeParameter],
    [types.CompletionItemKind.Issue, languages.CompletionItemKind.Issue],
    [types.CompletionItemKind.User, languages.CompletionItemKind.User]
  ]);
  function from(kind) {
    return _from.get(kind) ?? languages.CompletionItemKind.Property;
  }
  CompletionItemKind2.from = from;
  const _to = /* @__PURE__ */ new Map([
    [languages.CompletionItemKind.Method, types.CompletionItemKind.Method],
    [languages.CompletionItemKind.Function, types.CompletionItemKind.Function],
    [languages.CompletionItemKind.Constructor, types.CompletionItemKind.Constructor],
    [languages.CompletionItemKind.Field, types.CompletionItemKind.Field],
    [languages.CompletionItemKind.Variable, types.CompletionItemKind.Variable],
    [languages.CompletionItemKind.Class, types.CompletionItemKind.Class],
    [languages.CompletionItemKind.Interface, types.CompletionItemKind.Interface],
    [languages.CompletionItemKind.Struct, types.CompletionItemKind.Struct],
    [languages.CompletionItemKind.Module, types.CompletionItemKind.Module],
    [languages.CompletionItemKind.Property, types.CompletionItemKind.Property],
    [languages.CompletionItemKind.Unit, types.CompletionItemKind.Unit],
    [languages.CompletionItemKind.Value, types.CompletionItemKind.Value],
    [languages.CompletionItemKind.Constant, types.CompletionItemKind.Constant],
    [languages.CompletionItemKind.Enum, types.CompletionItemKind.Enum],
    [languages.CompletionItemKind.EnumMember, types.CompletionItemKind.EnumMember],
    [languages.CompletionItemKind.Keyword, types.CompletionItemKind.Keyword],
    [languages.CompletionItemKind.Snippet, types.CompletionItemKind.Snippet],
    [languages.CompletionItemKind.Text, types.CompletionItemKind.Text],
    [languages.CompletionItemKind.Color, types.CompletionItemKind.Color],
    [languages.CompletionItemKind.File, types.CompletionItemKind.File],
    [languages.CompletionItemKind.Reference, types.CompletionItemKind.Reference],
    [languages.CompletionItemKind.Folder, types.CompletionItemKind.Folder],
    [languages.CompletionItemKind.Event, types.CompletionItemKind.Event],
    [languages.CompletionItemKind.Operator, types.CompletionItemKind.Operator],
    [languages.CompletionItemKind.TypeParameter, types.CompletionItemKind.TypeParameter],
    [languages.CompletionItemKind.User, types.CompletionItemKind.User],
    [languages.CompletionItemKind.Issue, types.CompletionItemKind.Issue]
  ]);
  function to(kind) {
    return _to.get(kind) ?? types.CompletionItemKind.Property;
  }
  CompletionItemKind2.to = to;
})(CompletionItemKind || (CompletionItemKind = {}));
var CompletionItem;
((CompletionItem2) => {
  function to(suggestion, converter) {
    const result = new types.CompletionItem(suggestion.label);
    result.insertText = suggestion.insertText;
    result.kind = CompletionItemKind.to(suggestion.kind);
    result.tags = suggestion.tags?.map(CompletionItemTag.to);
    result.detail = suggestion.detail;
    result.documentation = htmlContent.isMarkdownString(suggestion.documentation) ? MarkdownString.to(suggestion.documentation) : suggestion.documentation;
    result.sortText = suggestion.sortText;
    result.filterText = suggestion.filterText;
    result.preselect = suggestion.preselect;
    result.commitCharacters = suggestion.commitCharacters;
    if (editorRange.Range.isIRange(suggestion.range)) {
      result.range = Range.to(suggestion.range);
    } else if (typeof suggestion.range === "object") {
      result.range = { inserting: Range.to(suggestion.range.insert), replacing: Range.to(suggestion.range.replace) };
    }
    result.keepWhitespace = typeof suggestion.insertTextRules === "undefined" ? false : Boolean(suggestion.insertTextRules & languages.CompletionItemInsertTextRule.KeepWhitespace);
    if (typeof suggestion.insertTextRules !== "undefined" && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
      result.insertText = new types.SnippetString(suggestion.insertText);
    } else {
      result.insertText = suggestion.insertText;
      result.textEdit = result.range instanceof types.Range ? new types.TextEdit(result.range, result.insertText) : void 0;
    }
    if (suggestion.additionalTextEdits && suggestion.additionalTextEdits.length > 0) {
      result.additionalTextEdits = suggestion.additionalTextEdits.map((e) => TextEdit.to(e));
    }
    result.command = converter && suggestion.command ? converter.fromInternal(suggestion.command) : void 0;
    return result;
  }
  CompletionItem2.to = to;
})(CompletionItem || (CompletionItem = {}));
var ParameterInformation;
((ParameterInformation2) => {
  function from(info) {
    if (typeof info.label !== "string" && !Array.isArray(info.label)) {
      throw new TypeError("Invalid label");
    }
    return {
      label: info.label,
      documentation: MarkdownString.fromStrict(info.documentation)
    };
  }
  ParameterInformation2.from = from;
  function to(info) {
    return {
      label: info.label,
      documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation
    };
  }
  ParameterInformation2.to = to;
})(ParameterInformation || (ParameterInformation = {}));
var SignatureInformation;
((SignatureInformation2) => {
  function from(info) {
    return {
      label: info.label,
      documentation: MarkdownString.fromStrict(info.documentation),
      parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.from) : [],
      activeParameter: info.activeParameter
    };
  }
  SignatureInformation2.from = from;
  function to(info) {
    return {
      label: info.label,
      documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation,
      parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.to) : [],
      activeParameter: info.activeParameter
    };
  }
  SignatureInformation2.to = to;
})(SignatureInformation || (SignatureInformation = {}));
var SignatureHelp;
((SignatureHelp2) => {
  function from(help) {
    return {
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
      signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.from) : []
    };
  }
  SignatureHelp2.from = from;
  function to(help) {
    return {
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
      signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.to) : []
    };
  }
  SignatureHelp2.to = to;
})(SignatureHelp || (SignatureHelp = {}));
var InlayHint;
((InlayHint2) => {
  function to(converter, hint) {
    const res = new types.InlayHint(
      Position.to(hint.position),
      typeof hint.label === "string" ? hint.label : hint.label.map(InlayHintLabelPart.to.bind(void 0, converter)),
      hint.kind && InlayHintKind.to(hint.kind)
    );
    res.textEdits = hint.textEdits && hint.textEdits.map(TextEdit.to);
    res.tooltip = htmlContent.isMarkdownString(hint.tooltip) ? MarkdownString.to(hint.tooltip) : hint.tooltip;
    res.paddingLeft = hint.paddingLeft;
    res.paddingRight = hint.paddingRight;
    return res;
  }
  InlayHint2.to = to;
})(InlayHint || (InlayHint = {}));
var InlayHintLabelPart;
((InlayHintLabelPart2) => {
  function to(converter, part) {
    const result = new types.InlayHintLabelPart(part.label);
    result.tooltip = htmlContent.isMarkdownString(part.tooltip) ? MarkdownString.to(part.tooltip) : part.tooltip;
    if (languages.Command.is(part.command)) {
      result.command = converter.fromInternal(part.command);
    }
    if (part.location) {
      result.location = location.to(part.location);
    }
    return result;
  }
  InlayHintLabelPart2.to = to;
})(InlayHintLabelPart || (InlayHintLabelPart = {}));
var InlayHintKind;
((InlayHintKind2) => {
  function from(kind) {
    return kind;
  }
  InlayHintKind2.from = from;
  function to(kind) {
    return kind;
  }
  InlayHintKind2.to = to;
})(InlayHintKind || (InlayHintKind = {}));
var DocumentLink;
((DocumentLink2) => {
  function from(link) {
    return {
      range: Range.from(link.range),
      url: link.target,
      tooltip: link.tooltip
    };
  }
  DocumentLink2.from = from;
  function to(link) {
    let target = void 0;
    if (link.url) {
      try {
        target = typeof link.url === "string" ? URI.parse(link.url, true) : URI.revive(link.url);
      } catch (err) {
      }
    }
    const result = new types.DocumentLink(Range.to(link.range), target);
    result.tooltip = link.tooltip;
    return result;
  }
  DocumentLink2.to = to;
})(DocumentLink || (DocumentLink = {}));
var ColorPresentation;
((ColorPresentation2) => {
  function to(colorPresentation) {
    const cp = new types.ColorPresentation(colorPresentation.label);
    if (colorPresentation.textEdit) {
      cp.textEdit = TextEdit.to(colorPresentation.textEdit);
    }
    if (colorPresentation.additionalTextEdits) {
      cp.additionalTextEdits = colorPresentation.additionalTextEdits.map((value) => TextEdit.to(value));
    }
    return cp;
  }
  ColorPresentation2.to = to;
  function from(colorPresentation) {
    return {
      label: colorPresentation.label,
      textEdit: colorPresentation.textEdit ? TextEdit.from(colorPresentation.textEdit) : void 0,
      additionalTextEdits: colorPresentation.additionalTextEdits ? colorPresentation.additionalTextEdits.map((value) => TextEdit.from(value)) : void 0
    };
  }
  ColorPresentation2.from = from;
})(ColorPresentation || (ColorPresentation = {}));
var Color;
((Color2) => {
  function to(c) {
    return new types.Color(c[0], c[1], c[2], c[3]);
  }
  Color2.to = to;
  function from(color) {
    return [color.red, color.green, color.blue, color.alpha];
  }
  Color2.from = from;
})(Color || (Color = {}));
var SelectionRange;
((SelectionRange2) => {
  function from(obj) {
    return { range: Range.from(obj.range) };
  }
  SelectionRange2.from = from;
  function to(obj) {
    return new types.SelectionRange(Range.to(obj.range));
  }
  SelectionRange2.to = to;
})(SelectionRange || (SelectionRange = {}));
var TextDocumentSaveReason;
((TextDocumentSaveReason2) => {
  function to(reason) {
    switch (reason) {
      case SaveReason.AUTO:
        return types.TextDocumentSaveReason.AfterDelay;
      case SaveReason.EXPLICIT:
        return types.TextDocumentSaveReason.Manual;
      case SaveReason.FOCUS_CHANGE:
      case SaveReason.WINDOW_CHANGE:
        return types.TextDocumentSaveReason.FocusOut;
    }
  }
  TextDocumentSaveReason2.to = to;
})(TextDocumentSaveReason || (TextDocumentSaveReason = {}));
var TextEditorLineNumbersStyle;
((TextEditorLineNumbersStyle2) => {
  function from(style) {
    switch (style) {
      case types.TextEditorLineNumbersStyle.Off:
        return RenderLineNumbersType.Off;
      case types.TextEditorLineNumbersStyle.Relative:
        return RenderLineNumbersType.Relative;
      case types.TextEditorLineNumbersStyle.Interval:
        return RenderLineNumbersType.Interval;
      case types.TextEditorLineNumbersStyle.On:
      default:
        return RenderLineNumbersType.On;
    }
  }
  TextEditorLineNumbersStyle2.from = from;
  function to(style) {
    switch (style) {
      case RenderLineNumbersType.Off:
        return types.TextEditorLineNumbersStyle.Off;
      case RenderLineNumbersType.Relative:
        return types.TextEditorLineNumbersStyle.Relative;
      case RenderLineNumbersType.Interval:
        return types.TextEditorLineNumbersStyle.Interval;
      case RenderLineNumbersType.On:
      default:
        return types.TextEditorLineNumbersStyle.On;
    }
  }
  TextEditorLineNumbersStyle2.to = to;
})(TextEditorLineNumbersStyle || (TextEditorLineNumbersStyle = {}));
var EndOfLine;
((EndOfLine2) => {
  function from(eol) {
    if (eol === types.EndOfLine.CRLF) {
      return EndOfLineSequence.CRLF;
    } else if (eol === types.EndOfLine.LF) {
      return EndOfLineSequence.LF;
    }
    return void 0;
  }
  EndOfLine2.from = from;
  function to(eol) {
    if (eol === EndOfLineSequence.CRLF) {
      return types.EndOfLine.CRLF;
    } else if (eol === EndOfLineSequence.LF) {
      return types.EndOfLine.LF;
    }
    return void 0;
  }
  EndOfLine2.to = to;
})(EndOfLine || (EndOfLine = {}));
var ProgressLocation;
((ProgressLocation2) => {
  function from(loc) {
    if (typeof loc === "object") {
      return loc.viewId;
    }
    switch (loc) {
      case types.ProgressLocation.SourceControl:
        return MainProgressLocation.Scm;
      case types.ProgressLocation.Window:
        return MainProgressLocation.Window;
      case types.ProgressLocation.Notification:
        return MainProgressLocation.Notification;
    }
    throw new Error(`Unknown 'ProgressLocation'`);
  }
  ProgressLocation2.from = from;
})(ProgressLocation || (ProgressLocation = {}));
var FoldingRange;
((FoldingRange2) => {
  function from(r) {
    const range = { start: r.start + 1, end: r.end + 1 };
    if (r.kind) {
      range.kind = FoldingRangeKind.from(r.kind);
    }
    return range;
  }
  FoldingRange2.from = from;
  function to(r) {
    const range = { start: r.start - 1, end: r.end - 1 };
    if (r.kind) {
      range.kind = FoldingRangeKind.to(r.kind);
    }
    return range;
  }
  FoldingRange2.to = to;
})(FoldingRange || (FoldingRange = {}));
var FoldingRangeKind;
((FoldingRangeKind2) => {
  function from(kind) {
    if (kind) {
      switch (kind) {
        case types.FoldingRangeKind.Comment:
          return languages.FoldingRangeKind.Comment;
        case types.FoldingRangeKind.Imports:
          return languages.FoldingRangeKind.Imports;
        case types.FoldingRangeKind.Region:
          return languages.FoldingRangeKind.Region;
      }
    }
    return void 0;
  }
  FoldingRangeKind2.from = from;
  function to(kind) {
    if (kind) {
      switch (kind.value) {
        case languages.FoldingRangeKind.Comment.value:
          return types.FoldingRangeKind.Comment;
        case languages.FoldingRangeKind.Imports.value:
          return types.FoldingRangeKind.Imports;
        case languages.FoldingRangeKind.Region.value:
          return types.FoldingRangeKind.Region;
      }
    }
    return void 0;
  }
  FoldingRangeKind2.to = to;
})(FoldingRangeKind || (FoldingRangeKind = {}));
var TextEditorOpenOptions;
((TextEditorOpenOptions2) => {
  function from(options) {
    if (options) {
      return {
        pinned: typeof options.preview === "boolean" ? !options.preview : void 0,
        inactive: options.background,
        preserveFocus: options.preserveFocus,
        selection: typeof options.selection === "object" ? Range.from(options.selection) : void 0,
        override: typeof options.override === "boolean" ? DEFAULT_EDITOR_ASSOCIATION.id : void 0
      };
    }
    return void 0;
  }
  TextEditorOpenOptions2.from = from;
})(TextEditorOpenOptions || (TextEditorOpenOptions = {}));
var GlobPattern;
((GlobPattern2) => {
  function from(pattern) {
    if (pattern instanceof types.RelativePattern) {
      return pattern.toJSON();
    }
    if (typeof pattern === "string") {
      return pattern;
    }
    if (isRelativePatternShape(pattern) || isLegacyRelativePatternShape(pattern)) {
      return new types.RelativePattern(pattern.baseUri ?? pattern.base, pattern.pattern).toJSON();
    }
    return pattern;
  }
  GlobPattern2.from = from;
  function isRelativePatternShape(obj) {
    const rp = obj;
    if (!rp) {
      return false;
    }
    return URI.isUri(rp.baseUri) && typeof rp.pattern === "string";
  }
  function isLegacyRelativePatternShape(obj) {
    const rp = obj;
    if (!rp) {
      return false;
    }
    return typeof rp.base === "string" && typeof rp.pattern === "string";
  }
  function to(pattern) {
    if (typeof pattern === "string") {
      return pattern;
    }
    return new types.RelativePattern(URI.revive(pattern.baseUri), pattern.pattern);
  }
  GlobPattern2.to = to;
})(GlobPattern || (GlobPattern = {}));
var LanguageSelector;
((LanguageSelector2) => {
  function from(selector) {
    if (!selector) {
      return void 0;
    } else if (Array.isArray(selector)) {
      return selector.map(from);
    } else if (typeof selector === "string") {
      return selector;
    } else {
      const filter = selector;
      return {
        language: filter.language,
        scheme: filter.scheme,
        pattern: GlobPattern.from(filter.pattern) ?? void 0,
        exclusive: filter.exclusive,
        notebookType: filter.notebookType
      };
    }
  }
  LanguageSelector2.from = from;
})(LanguageSelector || (LanguageSelector = {}));
var NotebookRange;
((NotebookRange2) => {
  function from(range) {
    return { start: range.start, end: range.end };
  }
  NotebookRange2.from = from;
  function to(range) {
    return new types.NotebookRange(range.start, range.end);
  }
  NotebookRange2.to = to;
})(NotebookRange || (NotebookRange = {}));
var NotebookCellExecutionSummary;
((NotebookCellExecutionSummary2) => {
  function to(data) {
    return {
      timing: typeof data.runStartTime === "number" && typeof data.runEndTime === "number" ? { startTime: data.runStartTime, endTime: data.runEndTime } : void 0,
      executionOrder: data.executionOrder,
      success: data.lastRunSuccess
    };
  }
  NotebookCellExecutionSummary2.to = to;
  function from(data) {
    return {
      lastRunSuccess: data.success,
      runStartTime: data.timing?.startTime,
      runEndTime: data.timing?.endTime,
      executionOrder: data.executionOrder
    };
  }
  NotebookCellExecutionSummary2.from = from;
})(NotebookCellExecutionSummary || (NotebookCellExecutionSummary = {}));
var NotebookCellKind;
((NotebookCellKind2) => {
  function from(data) {
    switch (data) {
      case types.NotebookCellKind.Markup:
        return notebooks.CellKind.Markup;
      case types.NotebookCellKind.Code:
      default:
        return notebooks.CellKind.Code;
    }
  }
  NotebookCellKind2.from = from;
  function to(data) {
    switch (data) {
      case notebooks.CellKind.Markup:
        return types.NotebookCellKind.Markup;
      case notebooks.CellKind.Code:
      default:
        return types.NotebookCellKind.Code;
    }
  }
  NotebookCellKind2.to = to;
})(NotebookCellKind || (NotebookCellKind = {}));
var NotebookData;
((NotebookData2) => {
  function from(data) {
    const res = {
      metadata: data.metadata ?? /* @__PURE__ */ Object.create(null),
      cells: []
    };
    for (const cell of data.cells) {
      types.NotebookCellData.validate(cell);
      res.cells.push(NotebookCellData.from(cell));
    }
    return res;
  }
  NotebookData2.from = from;
  function to(data) {
    const res = new types.NotebookData(
      data.cells.map(NotebookCellData.to)
    );
    if (!isEmptyObject(data.metadata)) {
      res.metadata = data.metadata;
    }
    return res;
  }
  NotebookData2.to = to;
})(NotebookData || (NotebookData = {}));
var NotebookCellData;
((NotebookCellData2) => {
  function from(data) {
    return {
      cellKind: NotebookCellKind.from(data.kind),
      language: data.languageId,
      mime: data.mime,
      source: data.value,
      metadata: data.metadata,
      internalMetadata: NotebookCellExecutionSummary.from(data.executionSummary ?? {}),
      outputs: data.outputs ? data.outputs.map(NotebookCellOutput.from) : []
    };
  }
  NotebookCellData2.from = from;
  function to(data) {
    return new types.NotebookCellData(
      NotebookCellKind.to(data.cellKind),
      data.source,
      data.language,
      data.mime,
      data.outputs ? data.outputs.map(NotebookCellOutput.to) : void 0,
      data.metadata,
      data.internalMetadata ? NotebookCellExecutionSummary.to(data.internalMetadata) : void 0
    );
  }
  NotebookCellData2.to = to;
})(NotebookCellData || (NotebookCellData = {}));
var NotebookCellOutputItem;
((NotebookCellOutputItem2) => {
  function from(item) {
    return {
      mime: item.mime,
      valueBytes: VSBuffer.wrap(item.data)
    };
  }
  NotebookCellOutputItem2.from = from;
  function to(item) {
    return new types.NotebookCellOutputItem(item.valueBytes.buffer, item.mime);
  }
  NotebookCellOutputItem2.to = to;
})(NotebookCellOutputItem || (NotebookCellOutputItem = {}));
var NotebookCellOutput;
((NotebookCellOutput2) => {
  function from(output) {
    return {
      outputId: output.id,
      items: output.items.map(NotebookCellOutputItem.from),
      metadata: output.metadata
    };
  }
  NotebookCellOutput2.from = from;
  function to(output) {
    const items = output.items.map(NotebookCellOutputItem.to);
    return new types.NotebookCellOutput(items, output.outputId, output.metadata);
  }
  NotebookCellOutput2.to = to;
})(NotebookCellOutput || (NotebookCellOutput = {}));
var NotebookExclusiveDocumentPattern;
((NotebookExclusiveDocumentPattern2) => {
  function from(pattern) {
    if (isExclusivePattern(pattern)) {
      return {
        include: GlobPattern.from(pattern.include) ?? void 0,
        exclude: GlobPattern.from(pattern.exclude) ?? void 0
      };
    }
    return GlobPattern.from(pattern) ?? void 0;
  }
  NotebookExclusiveDocumentPattern2.from = from;
  function to(pattern) {
    if (isExclusivePattern(pattern)) {
      return {
        include: GlobPattern.to(pattern.include),
        exclude: GlobPattern.to(pattern.exclude)
      };
    }
    return GlobPattern.to(pattern);
  }
  NotebookExclusiveDocumentPattern2.to = to;
  function isExclusivePattern(obj) {
    const ep = obj;
    if (!ep) {
      return false;
    }
    return !isUndefinedOrNull(ep.include) && !isUndefinedOrNull(ep.exclude);
  }
})(NotebookExclusiveDocumentPattern || (NotebookExclusiveDocumentPattern = {}));
var NotebookStatusBarItem;
((NotebookStatusBarItem2) => {
  function from(item, commandsConverter, disposables) {
    const command = typeof item.command === "string" ? { title: "", command: item.command } : item.command;
    return {
      alignment: item.alignment === types.NotebookCellStatusBarAlignment.Left ? notebooks.CellStatusbarAlignment.Left : notebooks.CellStatusbarAlignment.Right,
      command: commandsConverter.toInternal(command, disposables),
      // TODO@roblou
      text: item.text,
      tooltip: item.tooltip,
      accessibilityInformation: item.accessibilityInformation,
      priority: item.priority
    };
  }
  NotebookStatusBarItem2.from = from;
})(NotebookStatusBarItem || (NotebookStatusBarItem = {}));
var NotebookKernelSourceAction;
((NotebookKernelSourceAction2) => {
  function from(item, commandsConverter, disposables) {
    const command = typeof item.command === "string" ? { title: "", command: item.command } : item.command;
    return {
      command: commandsConverter.toInternal(command, disposables),
      label: item.label,
      description: item.description,
      detail: item.detail,
      documentation: item.documentation
    };
  }
  NotebookKernelSourceAction2.from = from;
})(NotebookKernelSourceAction || (NotebookKernelSourceAction = {}));
var NotebookDocumentContentOptions;
((NotebookDocumentContentOptions2) => {
  function from(options) {
    return {
      transientOutputs: options?.transientOutputs ?? false,
      transientCellMetadata: options?.transientCellMetadata ?? {},
      transientDocumentMetadata: options?.transientDocumentMetadata ?? {},
      cellContentMetadata: options?.cellContentMetadata ?? {}
    };
  }
  NotebookDocumentContentOptions2.from = from;
})(NotebookDocumentContentOptions || (NotebookDocumentContentOptions = {}));
var NotebookRendererScript;
((NotebookRendererScript2) => {
  function from(preload) {
    return {
      uri: preload.uri,
      provides: preload.provides
    };
  }
  NotebookRendererScript2.from = from;
  function to(preload) {
    return new types.NotebookRendererScript(URI.revive(preload.uri), preload.provides);
  }
  NotebookRendererScript2.to = to;
})(NotebookRendererScript || (NotebookRendererScript = {}));
var TestMessage;
((TestMessage2) => {
  function from(message) {
    return {
      message: MarkdownString.fromStrict(message.message) || "",
      type: TestMessageType.Error,
      expected: message.expectedOutput,
      actual: message.actualOutput,
      contextValue: message.contextValue,
      location: message.location && { range: Range.from(message.location.range), uri: message.location.uri },
      stackTrace: message.stackTrace?.map((s) => ({
        label: s.label,
        position: s.position && Position.from(s.position),
        uri: s.uri && URI.revive(s.uri).toJSON()
      }))
    };
  }
  TestMessage2.from = from;
  function to(item) {
    const message = new types.TestMessage(typeof item.message === "string" ? item.message : MarkdownString.to(item.message));
    message.actualOutput = item.actual;
    message.expectedOutput = item.expected;
    message.contextValue = item.contextValue;
    message.location = item.location ? location.to(item.location) : void 0;
    return message;
  }
  TestMessage2.to = to;
})(TestMessage || (TestMessage = {}));
var TestTag;
((TestTag2) => {
  TestTag2.namespace = namespaceTestTag;
  TestTag2.denamespace = denamespaceTestTag;
})(TestTag || (TestTag = {}));
var TestRunProfile;
((TestRunProfile2) => {
  function from(item) {
    return {
      controllerId: item.controllerId,
      profileId: item.profileId,
      group: TestRunProfileKind.from(item.kind)
    };
  }
  TestRunProfile2.from = from;
})(TestRunProfile || (TestRunProfile = {}));
var TestRunProfileKind;
((TestRunProfileKind2) => {
  const profileGroupToBitset = {
    [types.TestRunProfileKind.Coverage]: TestRunProfileBitset.Coverage,
    [types.TestRunProfileKind.Debug]: TestRunProfileBitset.Debug,
    [types.TestRunProfileKind.Run]: TestRunProfileBitset.Run
  };
  function from(kind) {
    return profileGroupToBitset.hasOwnProperty(kind) ? profileGroupToBitset[kind] : TestRunProfileBitset.Run;
  }
  TestRunProfileKind2.from = from;
})(TestRunProfileKind || (TestRunProfileKind = {}));
var TestItem;
((TestItem2) => {
  function from(item) {
    const ctrlId = getPrivateApiFor(item).controllerId;
    return {
      extId: TestId.fromExtHostTestItem(item, ctrlId).toString(),
      label: item.label,
      uri: URI.revive(item.uri),
      busy: item.busy,
      tags: item.tags.map((t) => TestTag.namespace(ctrlId, t.id)),
      range: editorRange.Range.lift(Range.from(item.range)),
      description: item.description || null,
      sortText: item.sortText || null,
      error: item.error ? MarkdownString.fromStrict(item.error) || null : null
    };
  }
  TestItem2.from = from;
  function toPlain(item) {
    return {
      parent: void 0,
      error: void 0,
      id: TestId.fromString(item.extId).localId,
      label: item.label,
      uri: URI.revive(item.uri),
      tags: (item.tags || []).map((t) => {
        const { tagId } = TestTag.denamespace(t);
        return new types.TestTag(tagId);
      }),
      children: {
        add: () => {
        },
        delete: () => {
        },
        forEach: () => {
        },
        *[Symbol.iterator]() {
        },
        get: () => void 0,
        replace: () => {
        },
        size: 0
      },
      range: Range.to(item.range || void 0),
      canResolveChildren: false,
      busy: item.busy,
      description: item.description || void 0,
      sortText: item.sortText || void 0
    };
  }
  TestItem2.toPlain = toPlain;
})(TestItem || (TestItem = {}));
((TestTag2) => {
  function from(tag) {
    return { id: tag.id };
  }
  TestTag2.from = from;
  function to(tag) {
    return new types.TestTag(tag.id);
  }
  TestTag2.to = to;
})(TestTag || (TestTag = {}));
var TestResults;
((TestResults2) => {
  const convertTestResultItem = (node, parent) => {
    const item = node.value;
    if (!item) {
      return void 0;
    }
    const snapshot = {
      ...TestItem.toPlain(item.item),
      parent,
      taskStates: item.tasks.map((t) => ({
        state: t.state,
        duration: t.duration,
        messages: t.messages.filter((m) => m.type === TestMessageType.Error).map(TestMessage.to)
      })),
      children: []
    };
    if (node.children) {
      for (const child of node.children.values()) {
        const c = convertTestResultItem(child, snapshot);
        if (c) {
          snapshot.children.push(c);
        }
      }
    }
    return snapshot;
  };
  function to(serialized) {
    const tree = new WellDefinedPrefixTree();
    for (const item of serialized.items) {
      tree.insert(TestId.fromString(item.item.extId).path, item);
    }
    const queue = [tree.nodes];
    const roots = [];
    while (queue.length) {
      for (const node of queue.pop()) {
        if (node.value) {
          roots.push(node);
        } else if (node.children) {
          queue.push(node.children.values());
        }
      }
    }
    return {
      completedAt: serialized.completedAt,
      results: roots.map((r) => convertTestResultItem(r)).filter(isDefined)
    };
  }
  TestResults2.to = to;
})(TestResults || (TestResults = {}));
var TestCoverage;
((TestCoverage2) => {
  function fromCoverageCount(count) {
    return { covered: count.covered, total: count.total };
  }
  function fromLocation(location2) {
    return "line" in location2 ? Position.from(location2) : Range.from(location2);
  }
  function toLocation(location2) {
    if (!location2) {
      return void 0;
    }
    return "endLineNumber" in location2 ? Range.to(location2) : Position.to(location2);
  }
  function to(serialized) {
    if (serialized.type === DetailType.Statement) {
      const branches = [];
      if (serialized.branches) {
        for (const branch of serialized.branches) {
          branches.push({
            executed: branch.count,
            location: toLocation(branch.location),
            label: branch.label
          });
        }
      }
      return new types.StatementCoverage(
        serialized.count,
        toLocation(serialized.location),
        serialized.branches?.map((b) => new types.BranchCoverage(
          b.count,
          toLocation(b.location),
          b.label
        ))
      );
    } else {
      return new types.DeclarationCoverage(
        serialized.name,
        serialized.count,
        toLocation(serialized.location)
      );
    }
  }
  TestCoverage2.to = to;
  function fromDetails(coverage) {
    if (typeof coverage.executed === "number" && coverage.executed < 0) {
      throw new Error(`Invalid coverage count ${coverage.executed}`);
    }
    if ("branches" in coverage) {
      return {
        count: coverage.executed,
        location: fromLocation(coverage.location),
        type: DetailType.Statement,
        branches: coverage.branches.length ? coverage.branches.map((b) => ({ count: b.executed, location: b.location && fromLocation(b.location), label: b.label })) : void 0
      };
    } else {
      return {
        type: DetailType.Declaration,
        name: coverage.name,
        count: coverage.executed,
        location: fromLocation(coverage.location)
      };
    }
  }
  TestCoverage2.fromDetails = fromDetails;
  function fromFile(controllerId, id, coverage) {
    types.validateTestCoverageCount(coverage.statementCoverage);
    types.validateTestCoverageCount(coverage.branchCoverage);
    types.validateTestCoverageCount(coverage.declarationCoverage);
    return {
      id,
      uri: coverage.uri,
      statement: fromCoverageCount(coverage.statementCoverage),
      branch: coverage.branchCoverage && fromCoverageCount(coverage.branchCoverage),
      declaration: coverage.declarationCoverage && fromCoverageCount(coverage.declarationCoverage),
      testIds: coverage instanceof types.FileCoverage && coverage.includesTests.length ? coverage.includesTests.map((t) => TestId.fromExtHostTestItem(t, controllerId).toString()) : void 0
    };
  }
  TestCoverage2.fromFile = fromFile;
})(TestCoverage || (TestCoverage = {}));
var CodeActionTriggerKind;
((CodeActionTriggerKind2) => {
  function to(value) {
    switch (value) {
      case languages.CodeActionTriggerType.Invoke:
        return types.CodeActionTriggerKind.Invoke;
      case languages.CodeActionTriggerType.Auto:
        return types.CodeActionTriggerKind.Automatic;
    }
  }
  CodeActionTriggerKind2.to = to;
})(CodeActionTriggerKind || (CodeActionTriggerKind = {}));
var TypeHierarchyItem;
((TypeHierarchyItem2) => {
  function to(item) {
    const result = new types.TypeHierarchyItem(
      SymbolKind.to(item.kind),
      item.name,
      item.detail || "",
      URI.revive(item.uri),
      Range.to(item.range),
      Range.to(item.selectionRange)
    );
    result._sessionId = item._sessionId;
    result._itemId = item._itemId;
    return result;
  }
  TypeHierarchyItem2.to = to;
  function from(item, sessionId, itemId) {
    sessionId = sessionId ?? item._sessionId;
    itemId = itemId ?? item._itemId;
    if (sessionId === void 0 || itemId === void 0) {
      throw new Error("invalid item");
    }
    return {
      _sessionId: sessionId,
      _itemId: itemId,
      kind: SymbolKind.from(item.kind),
      name: item.name,
      detail: item.detail ?? "",
      uri: item.uri,
      range: Range.from(item.range),
      selectionRange: Range.from(item.selectionRange),
      tags: item.tags?.map(SymbolTag.from)
    };
  }
  TypeHierarchyItem2.from = from;
})(TypeHierarchyItem || (TypeHierarchyItem = {}));
var ViewBadge;
((ViewBadge2) => {
  function from(badge) {
    if (!badge) {
      return void 0;
    }
    return {
      value: badge.value,
      tooltip: badge.tooltip
    };
  }
  ViewBadge2.from = from;
})(ViewBadge || (ViewBadge = {}));
var DataTransferItem;
((DataTransferItem2) => {
  function to(mime, item, resolveFileData) {
    const file = item.fileData;
    if (file) {
      return new types.InternalFileDataTransferItem(
        new types.DataTransferFile(file.name, URI.revive(file.uri), file.id, createSingleCallFunction(() => resolveFileData(file.id)))
      );
    }
    if (mime === Mimes.uriList && item.uriListData) {
      return new types.InternalDataTransferItem(reviveUriList(item.uriListData));
    }
    return new types.InternalDataTransferItem(item.asString);
  }
  DataTransferItem2.to = to;
  async function from(mime, item, id = generateUuid()) {
    const stringValue = await item.asString();
    if (mime === Mimes.uriList) {
      return {
        id,
        asString: stringValue,
        fileData: void 0,
        uriListData: serializeUriList(stringValue)
      };
    }
    const fileValue = item.asFile();
    return {
      id,
      asString: stringValue,
      fileData: fileValue ? {
        name: fileValue.name,
        uri: fileValue.uri,
        id: fileValue._itemId ?? fileValue.id
      } : void 0
    };
  }
  DataTransferItem2.from = from;
  function serializeUriList(stringValue) {
    return UriList.split(stringValue).map((part) => {
      if (part.startsWith("#")) {
        return part;
      }
      try {
        return URI.parse(part);
      } catch {
      }
      return part;
    });
  }
  function reviveUriList(parts) {
    return UriList.create(parts.map((part) => {
      return typeof part === "string" ? part : URI.revive(part);
    }));
  }
})(DataTransferItem || (DataTransferItem = {}));
var DataTransfer;
((DataTransfer2) => {
  function toDataTransfer(value, resolveFileData) {
    const init = value.items.map(([type, item]) => {
      return [type, DataTransferItem.to(type, item, resolveFileData)];
    });
    return new types.DataTransfer(init);
  }
  DataTransfer2.toDataTransfer = toDataTransfer;
  async function from(dataTransfer) {
    const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
      return [mime, await DataTransferItem.from(mime, value)];
    }));
    return { items };
  }
  DataTransfer2.from = from;
  async function fromList(dataTransfer) {
    const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
      return [mime, await DataTransferItem.from(mime, value, value.id)];
    }));
    return { items };
  }
  DataTransfer2.fromList = fromList;
})(DataTransfer || (DataTransfer = {}));
var ChatFollowup;
((ChatFollowup2) => {
  function from(followup, request) {
    return {
      kind: "reply",
      agentId: followup.participant ?? request?.agentId ?? "",
      subCommand: followup.command ?? request?.command,
      message: followup.prompt,
      title: followup.label
    };
  }
  ChatFollowup2.from = from;
  function to(followup) {
    return {
      prompt: followup.message,
      label: followup.title,
      participant: followup.agentId,
      command: followup.subCommand
    };
  }
  ChatFollowup2.to = to;
})(ChatFollowup || (ChatFollowup = {}));
var LanguageModelChatMessageRole;
((LanguageModelChatMessageRole2) => {
  function to(role) {
    switch (role) {
      case chatProvider.ChatMessageRole.System:
        return types.LanguageModelChatMessageRole.System;
      case chatProvider.ChatMessageRole.User:
        return types.LanguageModelChatMessageRole.User;
      case chatProvider.ChatMessageRole.Assistant:
        return types.LanguageModelChatMessageRole.Assistant;
    }
  }
  LanguageModelChatMessageRole2.to = to;
  function from(role) {
    switch (role) {
      case types.LanguageModelChatMessageRole.System:
        return chatProvider.ChatMessageRole.System;
      case types.LanguageModelChatMessageRole.User:
        return chatProvider.ChatMessageRole.User;
      case types.LanguageModelChatMessageRole.Assistant:
        return chatProvider.ChatMessageRole.Assistant;
    }
    return chatProvider.ChatMessageRole.User;
  }
  LanguageModelChatMessageRole2.from = from;
})(LanguageModelChatMessageRole || (LanguageModelChatMessageRole = {}));
var LanguageModelChatMessage;
((LanguageModelChatMessage3) => {
  function to(message) {
    const content = message.content.map((c) => {
      if (c.type === "text") {
        return new LanguageModelTextPart(c.value, c.audience);
      } else if (c.type === "tool_result") {
        const content2 = coalesce(c.value.map((part) => {
          if (part.type === "text") {
            return new types.LanguageModelTextPart(part.value, part.audience);
          } else if (part.type === "data") {
            return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
          } else if (part.type === "prompt_tsx") {
            return new types.LanguageModelPromptTsxPart(part.value);
          } else {
            return void 0;
          }
        }));
        return new types.LanguageModelToolResultPart(c.toolCallId, content2, c.isError);
      } else if (c.type === "image_url") {
        return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
      } else if (c.type === "data") {
        return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
      } else if (c.type === "tool_use") {
        return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
      }
      return void 0;
    }).filter((c) => c !== void 0);
    const role = LanguageModelChatMessageRole.to(message.role);
    const result = new types.LanguageModelChatMessage(role, content, message.name);
    return result;
  }
  LanguageModelChatMessage3.to = to;
  function from(message) {
    const role = LanguageModelChatMessageRole.from(message.role);
    const name = message.name;
    let messageContent = message.content;
    if (typeof messageContent === "string") {
      messageContent = [new types.LanguageModelTextPart(messageContent)];
    }
    const content = messageContent.map((c) => {
      if (c instanceof types.LanguageModelToolResultPart) {
        return {
          type: "tool_result",
          toolCallId: c.callId,
          value: coalesce(c.content.map((part) => {
            if (part instanceof types.LanguageModelTextPart) {
              return {
                type: "text",
                value: part.value,
                audience: part.audience
              };
            } else if (part instanceof types.LanguageModelPromptTsxPart) {
              return {
                type: "prompt_tsx",
                value: part.value
              };
            } else if (part instanceof types.LanguageModelDataPart) {
              return {
                type: "data",
                mimeType: part.mimeType,
                data: VSBuffer.wrap(part.data),
                audience: part.audience
              };
            } else {
              return void 0;
            }
          })),
          isError: c.isError
        };
      } else if (c instanceof types.LanguageModelDataPart) {
        if (isImageDataPart(c)) {
          const value = {
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data)
          };
          return {
            type: "image_url",
            value
          };
        } else {
          return {
            type: "data",
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data),
            audience: c.audience
          };
        }
      } else if (c instanceof types.LanguageModelToolCallPart) {
        return {
          type: "tool_use",
          toolCallId: c.callId,
          name: c.name,
          parameters: c.input
        };
      } else if (c instanceof types.LanguageModelTextPart) {
        return {
          type: "text",
          value: c.value
        };
      } else {
        if (typeof c !== "string") {
          throw new Error("Unexpected chat message content type");
        }
        return {
          type: "text",
          value: c
        };
      }
    });
    return {
      role,
      name,
      content
    };
  }
  LanguageModelChatMessage3.from = from;
})(LanguageModelChatMessage || (LanguageModelChatMessage = {}));
var LanguageModelChatMessage2;
((LanguageModelChatMessage22) => {
  function to(message) {
    const content = message.content.map((c) => {
      if (c.type === "text") {
        return new LanguageModelTextPart(c.value, c.audience);
      } else if (c.type === "tool_result") {
        const content2 = c.value.map((part) => {
          if (part.type === "text") {
            return new types.LanguageModelTextPart(part.value, part.audience);
          } else if (part.type === "data") {
            return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
          } else {
            return new types.LanguageModelPromptTsxPart(part.value);
          }
        });
        return new types.LanguageModelToolResultPart(c.toolCallId, content2, c.isError);
      } else if (c.type === "image_url") {
        return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
      } else if (c.type === "data") {
        return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
      } else if (c.type === "thinking") {
        return new types.LanguageModelThinkingPart(c.value, c.id, c.metadata);
      } else {
        return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
      }
    });
    const role = LanguageModelChatMessageRole.to(message.role);
    const result = new types.LanguageModelChatMessage2(role, content, message.name);
    return result;
  }
  LanguageModelChatMessage22.to = to;
  function from(message) {
    const role = LanguageModelChatMessageRole.from(message.role);
    const name = message.name;
    let messageContent = message.content;
    if (typeof messageContent === "string") {
      messageContent = [new types.LanguageModelTextPart(messageContent)];
    }
    const content = messageContent.map((c) => {
      if (c instanceof types.LanguageModelToolResultPart) {
        return {
          type: "tool_result",
          toolCallId: c.callId,
          value: coalesce(c.content.map((part) => {
            if (part instanceof types.LanguageModelTextPart) {
              return {
                type: "text",
                value: part.value,
                audience: part.audience
              };
            } else if (part instanceof types.LanguageModelPromptTsxPart) {
              return {
                type: "prompt_tsx",
                value: part.value
              };
            } else if (part instanceof types.LanguageModelDataPart) {
              return {
                type: "data",
                mimeType: part.mimeType,
                data: VSBuffer.wrap(part.data),
                audience: part.audience
              };
            } else {
              return void 0;
            }
          })),
          isError: c.isError
        };
      } else if (c instanceof types.LanguageModelDataPart) {
        if (isImageDataPart(c)) {
          const value = {
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data)
          };
          return {
            type: "image_url",
            value
          };
        } else {
          return {
            type: "data",
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data),
            audience: c.audience
          };
        }
      } else if (c instanceof types.LanguageModelToolCallPart) {
        return {
          type: "tool_use",
          toolCallId: c.callId,
          name: c.name,
          parameters: c.input
        };
      } else if (c instanceof types.LanguageModelTextPart) {
        return {
          type: "text",
          value: c.value
        };
      } else if (c instanceof types.LanguageModelThinkingPart) {
        return {
          type: "thinking",
          value: c.value,
          id: c.id,
          metadata: c.metadata
        };
      } else {
        if (typeof c !== "string") {
          throw new Error("Unexpected chat message content type llm 2");
        }
        return {
          type: "text",
          value: c
        };
      }
    });
    return {
      role,
      name,
      content
    };
  }
  LanguageModelChatMessage22.from = from;
})(LanguageModelChatMessage2 || (LanguageModelChatMessage2 = {}));
function isImageDataPart(part) {
  const mime = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : "";
  switch (mime) {
    case "image/png":
    case "image/jpeg":
    case "image/jpg":
    case "image/gif":
    case "image/webp":
    case "image/bmp":
      return true;
    default:
      return false;
  }
}
var ChatResponseMarkdownPart;
((ChatResponseMarkdownPart2) => {
  function from(part) {
    return {
      kind: "markdownContent",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseMarkdownPart2.from = from;
  function to(part) {
    return new types.ChatResponseMarkdownPart(MarkdownString.to(part.content));
  }
  ChatResponseMarkdownPart2.to = to;
})(ChatResponseMarkdownPart || (ChatResponseMarkdownPart = {}));
var ChatResponseCodeblockUriPart;
((ChatResponseCodeblockUriPart2) => {
  function from(part) {
    return {
      kind: "codeblockUri",
      uri: part.value,
      isEdit: part.isEdit,
      undoStopId: part.undoStopId
    };
  }
  ChatResponseCodeblockUriPart2.from = from;
  function to(part) {
    return new types.ChatResponseCodeblockUriPart(URI.revive(part.uri), part.isEdit, part.undoStopId);
  }
  ChatResponseCodeblockUriPart2.to = to;
})(ChatResponseCodeblockUriPart || (ChatResponseCodeblockUriPart = {}));
var ChatResponseMarkdownWithVulnerabilitiesPart;
((ChatResponseMarkdownWithVulnerabilitiesPart2) => {
  function from(part) {
    return {
      kind: "markdownVuln",
      content: MarkdownString.from(part.value),
      vulnerabilities: part.vulnerabilities
    };
  }
  ChatResponseMarkdownWithVulnerabilitiesPart2.from = from;
  function to(part) {
    return new types.ChatResponseMarkdownWithVulnerabilitiesPart(MarkdownString.to(part.content), part.vulnerabilities);
  }
  ChatResponseMarkdownWithVulnerabilitiesPart2.to = to;
})(ChatResponseMarkdownWithVulnerabilitiesPart || (ChatResponseMarkdownWithVulnerabilitiesPart = {}));
var ChatResponseConfirmationPart;
((ChatResponseConfirmationPart2) => {
  function from(part) {
    return {
      kind: "confirmation",
      title: part.title,
      message: MarkdownString.from(part.message),
      data: part.data,
      buttons: part.buttons
    };
  }
  ChatResponseConfirmationPart2.from = from;
})(ChatResponseConfirmationPart || (ChatResponseConfirmationPart = {}));
var ChatResponseQuestionCarouselPart;
((ChatResponseQuestionCarouselPart2) => {
  function questionTypeToString(type) {
    switch (type) {
      case types.ChatQuestionType.Text:
        return "text";
      case types.ChatQuestionType.SingleSelect:
        return "singleSelect";
      case types.ChatQuestionType.MultiSelect:
        return "multiSelect";
      default:
        return "text";
    }
  }
  function stringToQuestionType(type) {
    switch (type) {
      case "text":
        return types.ChatQuestionType.Text;
      case "singleSelect":
        return types.ChatQuestionType.SingleSelect;
      case "multiSelect":
        return types.ChatQuestionType.MultiSelect;
      default:
        return types.ChatQuestionType.Text;
    }
  }
  function from(part) {
    return {
      kind: "questionCarousel",
      questions: part.questions.map((q) => ({
        id: q.id,
        type: questionTypeToString(q.type),
        title: q.title,
        message: q.message ? MarkdownString.from(q.message) : void 0,
        options: q.options?.map((opt) => ({ id: opt.id, label: opt.label, value: String(opt.value) })),
        defaultValue: q.defaultValue,
        allowFreeformInput: q.allowFreeformInput
      })),
      allowSkip: part.allowSkip
    };
  }
  ChatResponseQuestionCarouselPart2.from = from;
  function to(part) {
    const questions = part.questions.map((q) => new types.ChatQuestion(
      q.id,
      stringToQuestionType(q.type),
      q.title,
      {
        message: q.message ? typeof q.message === "string" ? new types.MarkdownString(q.message) : MarkdownString.to(q.message) : void 0,
        options: q.options?.map((opt) => ({
          id: opt.id,
          label: opt.label,
          value: opt.value
        })),
        defaultValue: q.defaultValue,
        allowFreeformInput: q.allowFreeformInput
      }
    ));
    return new types.ChatResponseQuestionCarouselPart(questions, part.allowSkip);
  }
  ChatResponseQuestionCarouselPart2.to = to;
})(ChatResponseQuestionCarouselPart || (ChatResponseQuestionCarouselPart = {}));
var ChatResponseFilesPart;
((ChatResponseFilesPart2) => {
  function from(part) {
    const { value, baseUri } = part;
    function convert(items, baseUri2) {
      return items.map((item) => {
        const myUri = URI.joinPath(baseUri2, item.name);
        return {
          label: item.name,
          uri: myUri,
          children: item.children && convert(item.children, myUri)
        };
      });
    }
    return {
      kind: "treeData",
      treeData: {
        label: basename(baseUri),
        uri: baseUri,
        children: convert(value, baseUri)
      }
    };
  }
  ChatResponseFilesPart2.from = from;
  function to(part) {
    const treeData = revive(part.treeData);
    function convert(items2) {
      return items2.map((item) => {
        return {
          name: item.label,
          children: item.children && convert(item.children)
        };
      });
    }
    const baseUri = treeData.uri;
    const items = treeData.children ? convert(treeData.children) : [];
    return new types.ChatResponseFileTreePart(items, baseUri);
  }
  ChatResponseFilesPart2.to = to;
})(ChatResponseFilesPart || (ChatResponseFilesPart = {}));
var ChatResponseMultiDiffPart;
((ChatResponseMultiDiffPart2) => {
  function from(part) {
    return {
      kind: "multiDiffData",
      multiDiffData: {
        title: part.title,
        resources: part.value.map((entry) => ({
          originalUri: entry.originalUri,
          modifiedUri: entry.modifiedUri,
          goToFileUri: entry.goToFileUri,
          added: entry.added,
          removed: entry.removed
        }))
      },
      readOnly: part.readOnly
    };
  }
  ChatResponseMultiDiffPart2.from = from;
  function to(part) {
    const resources = part.multiDiffData.resources.map((resource) => ({
      originalUri: resource.originalUri ? URI.revive(resource.originalUri) : void 0,
      modifiedUri: resource.modifiedUri ? URI.revive(resource.modifiedUri) : void 0,
      goToFileUri: resource.goToFileUri ? URI.revive(resource.goToFileUri) : void 0,
      added: resource.added,
      removed: resource.removed
    }));
    return new types.ChatResponseMultiDiffPart(resources, part.multiDiffData.title, part.readOnly);
  }
  ChatResponseMultiDiffPart2.to = to;
})(ChatResponseMultiDiffPart || (ChatResponseMultiDiffPart = {}));
var ChatResponseAnchorPart;
((ChatResponseAnchorPart2) => {
  function from(part) {
    const isUri = (thing) => URI.isUri(thing);
    const isSymbolInformation = (thing) => "name" in thing;
    return {
      kind: "inlineReference",
      name: part.title,
      inlineReference: isUri(part.value) ? part.value : isSymbolInformation(part.value) ? WorkspaceSymbol.from(part.value) : Location.from(part.value)
    };
  }
  ChatResponseAnchorPart2.from = from;
  function to(part) {
    const value = revive(part);
    return new types.ChatResponseAnchorPart(
      URI.isUri(value.inlineReference) ? value.inlineReference : "location" in value.inlineReference ? WorkspaceSymbol.to(value.inlineReference) : Location.to(value.inlineReference),
      part.name
    );
  }
  ChatResponseAnchorPart2.to = to;
})(ChatResponseAnchorPart || (ChatResponseAnchorPart = {}));
var ChatResponseProgressPart;
((ChatResponseProgressPart2) => {
  function from(part) {
    return {
      kind: "progressMessage",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseProgressPart2.from = from;
  function to(part) {
    return new types.ChatResponseProgressPart(part.content.value);
  }
  ChatResponseProgressPart2.to = to;
})(ChatResponseProgressPart || (ChatResponseProgressPart = {}));
var ChatResponseThinkingProgressPart;
((ChatResponseThinkingProgressPart2) => {
  function from(part) {
    return {
      kind: "thinking",
      value: part.value,
      id: part.id,
      metadata: part.metadata
    };
  }
  ChatResponseThinkingProgressPart2.from = from;
  function to(part) {
    return new types.ChatResponseThinkingProgressPart(part.value ?? "", part.id, part.metadata);
  }
  ChatResponseThinkingProgressPart2.to = to;
})(ChatResponseThinkingProgressPart || (ChatResponseThinkingProgressPart = {}));
var ChatResponseHookPart;
((ChatResponseHookPart2) => {
  function from(part) {
    return {
      kind: "hook",
      hookType: part.hookType,
      stopReason: part.stopReason,
      systemMessage: part.systemMessage,
      metadata: part.metadata
    };
  }
  ChatResponseHookPart2.from = from;
  function to(part) {
    return new types.ChatResponseHookPart(part.hookType, part.stopReason, part.systemMessage, part.metadata);
  }
  ChatResponseHookPart2.to = to;
})(ChatResponseHookPart || (ChatResponseHookPart = {}));
var ChatResponseVoiceProgressPart;
((ChatResponseVoiceProgressPart2) => {
  function from(part) {
    return {
      kind: "voiceProgress",
      id: part.id,
      value: part.value
    };
  }
  ChatResponseVoiceProgressPart2.from = from;
})(ChatResponseVoiceProgressPart || (ChatResponseVoiceProgressPart = {}));
var ChatResponseAutoModeResolutionPart;
((ChatResponseAutoModeResolutionPart2) => {
  const validLabels = /* @__PURE__ */ new Set(["needs_reasoning", "no_reasoning", "fallback"]);
  function from(part) {
    const label = validLabels.has(part.predictedLabel) ? part.predictedLabel : "fallback";
    return {
      kind: "autoModeResolution",
      resolvedModel: part.resolvedModel,
      resolvedModelName: part.resolvedModelName,
      predictedLabel: label,
      confidence: Math.max(0, Math.min(1, part.confidence))
    };
  }
  ChatResponseAutoModeResolutionPart2.from = from;
  function to(part) {
    return new types.ChatResponseAutoModeResolutionPart(part.resolvedModel, part.resolvedModelName, part.predictedLabel, part.confidence);
  }
  ChatResponseAutoModeResolutionPart2.to = to;
})(ChatResponseAutoModeResolutionPart || (ChatResponseAutoModeResolutionPart = {}));
var ChatResponseWarningPart;
((ChatResponseWarningPart2) => {
  function from(part) {
    return {
      kind: "warning",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseWarningPart2.from = from;
  function to(part) {
    return new types.ChatResponseWarningPart(part.content.value);
  }
  ChatResponseWarningPart2.to = to;
})(ChatResponseWarningPart || (ChatResponseWarningPart = {}));
var ChatResponseInfoPart;
((ChatResponseInfoPart2) => {
  function from(part) {
    return {
      kind: "info",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseInfoPart2.from = from;
  function to(part) {
    return new types.ChatResponseInfoPart(part.content.value);
  }
  ChatResponseInfoPart2.to = to;
})(ChatResponseInfoPart || (ChatResponseInfoPart = {}));
var ChatResponseExtensionsPart;
((ChatResponseExtensionsPart2) => {
  function from(part) {
    return {
      kind: "extensions",
      extensions: part.extensions
    };
  }
  ChatResponseExtensionsPart2.from = from;
})(ChatResponseExtensionsPart || (ChatResponseExtensionsPart = {}));
var ChatResponsePullRequestPart;
((ChatResponsePullRequestPart2) => {
  function from(part, commandsConverter, commandDisposables) {
    let command;
    if (!part.command) {
      if (!part.uri) {
        throw new Error("Pull request part must have a command if URI is provided");
      }
      command = {
        title: "Open Pull Request",
        id: "vscode.open",
        arguments: [part.uri]
      };
    } else {
      command = commandsConverter.toInternal(part.command, commandDisposables);
    }
    return {
      kind: "pullRequest",
      author: part.author,
      title: part.title,
      description: part.description,
      uri: part.uri,
      linkTag: part.linkTag,
      command
    };
  }
  ChatResponsePullRequestPart2.from = from;
})(ChatResponsePullRequestPart || (ChatResponsePullRequestPart = {}));
var ChatResponseMovePart;
((ChatResponseMovePart2) => {
  function from(part) {
    return {
      kind: "move",
      uri: part.uri,
      range: Range.from(part.range)
    };
  }
  ChatResponseMovePart2.from = from;
  function to(part) {
    return new types.ChatResponseMovePart(URI.revive(part.uri), Range.to(part.range));
  }
  ChatResponseMovePart2.to = to;
})(ChatResponseMovePart || (ChatResponseMovePart = {}));
var ChatToolInvocationPart;
((ChatToolInvocationPart2) => {
  function from(part) {
    let resultDetails;
    let toolSpecificData;
    if (part.toolSpecificData && isChatMcpToolInvocationData(part.toolSpecificData)) {
      resultDetails = convertMcpToResultDetails(part.toolSpecificData, part.isError);
      toolSpecificData = void 0;
    } else {
      toolSpecificData = part.toolSpecificData ? convertToolSpecificData(part.toolSpecificData) : void 0;
    }
    const presentation = part.presentation === "hidden" ? ToolInvocationPresentation.Hidden : part.presentation === "hiddenAfterComplete" ? ToolInvocationPresentation.HiddenAfterComplete : void 0;
    if (part.enablePartialUpdate) {
      return {
        kind: "externalToolInvocationUpdate",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        isComplete: !!part.isComplete,
        invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : void 0,
        pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : void 0,
        toolSpecificData,
        subagentInvocationId: part.subAgentInvocationId,
        resultDetails
      };
    }
    return {
      kind: "toolInvocationSerialized",
      toolCallId: part.toolCallId,
      toolId: part.toolName,
      invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : part.toolName,
      originMessage: part.originMessage ? MarkdownString.from(part.originMessage) : void 0,
      pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : void 0,
      isConfirmed: part.isConfirmed,
      isComplete: true,
      source: ToolDataSource.External,
      // isError: part.isError ?? false,
      toolSpecificData,
      resultDetails,
      presentation,
      subAgentInvocationId: part.subAgentInvocationId
    };
  }
  ChatToolInvocationPart2.from = from;
  function isChatMcpToolInvocationData(data) {
    return data !== null && typeof data === "object" && "input" in data && typeof data.input === "string" && "output" in data && Array.isArray(data.output);
  }
  function convertMcpToResultDetails(data, isError) {
    return {
      input: data.input,
      output: data.output.map((o) => {
        const isText = o.mimeType.startsWith("text/");
        return {
          type: "embed",
          mimeType: o.mimeType,
          value: isText ? VSBuffer.wrap(o.data).toString() : encodeBase64(VSBuffer.wrap(o.data)),
          isText
        };
      }),
      isError: isError ?? false
    };
  }
  function convertToolSpecificData(data) {
    if ("command" in data && "language" in data) {
      return {
        kind: "terminal",
        command: data.command,
        language: data.language
      };
    } else if ("commandLine" in data && "language" in data) {
      const presentationOverrides = data.presentationOverrides && typeof data.presentationOverrides.commandLine === "string" ? {
        commandLine: data.presentationOverrides.commandLine,
        language: data.presentationOverrides.language
      } : void 0;
      const result = {
        kind: "terminal",
        presentationOverrides,
        commandLine: data.commandLine,
        language: data.language,
        terminalCommandOutput: typeof data.output?.text === "string" ? {
          text: data.output.text
        } : void 0,
        terminalCommandState: data.state ? {
          exitCode: data.state.exitCode,
          duration: data.state.duration
        } : void 0
      };
      return result;
    } else if ("todoList" in data && Array.isArray(data.todoList)) {
      return {
        kind: "todoList",
        todoList: data.todoList.map((todo) => ({
          id: String(todo.id),
          title: todo.title,
          status: todoStatusEnumToString(todo.status)
        }))
      };
    } else if ("input" in data && "output" in data && !Array.isArray(data.output)) {
      return {
        kind: "simpleToolInvocation",
        input: typeof data.input === "string" ? data.input : "",
        output: typeof data.output === "string" ? data.output : ""
      };
    } else if (data && "values" in data && Array.isArray(data.values)) {
      return {
        kind: "resources",
        values: data.values.map((v) => {
          if (v instanceof types.Location) {
            return Location.from(v);
          } else {
            return URI.revive(v);
          }
        })
      };
    } else if (data instanceof types.ChatSubagentToolInvocationData) {
      return {
        kind: "subagent",
        description: data.description,
        agentName: data.agentName,
        prompt: data.prompt,
        result: data.result,
        modelName: data.modelName
      };
    }
    return data;
  }
  function todoStatusEnumToString(status) {
    switch (status) {
      case types.ChatTodoStatus.NotStarted:
        return "not-started";
      case types.ChatTodoStatus.InProgress:
        return "in-progress";
      case types.ChatTodoStatus.Completed:
        return "completed";
      default:
        return "not-started";
    }
  }
  function todoStatusStringToEnum(status) {
    switch (status) {
      case "not-started":
        return types.ChatTodoStatus.NotStarted;
      case "in-progress":
        return types.ChatTodoStatus.InProgress;
      case "completed":
        return types.ChatTodoStatus.Completed;
      default:
        return types.ChatTodoStatus.NotStarted;
    }
  }
  function to(part) {
    const toolInvocation = new types.ChatToolInvocationPart(
      part.toolId || part.toolName,
      part.toolCallId,
      part.errorMessage
    );
    if (part.invocationMessage) {
      toolInvocation.invocationMessage = part.invocationMessage;
    }
    if (part.originMessage) {
      toolInvocation.originMessage = part.originMessage;
    }
    if (part.pastTenseMessage) {
      toolInvocation.pastTenseMessage = part.pastTenseMessage;
    }
    if (part.isConfirmed !== void 0) {
      toolInvocation.isConfirmed = part.isConfirmed;
    }
    if (part.isComplete !== void 0) {
      toolInvocation.isComplete = part.isComplete;
    }
    if (part.toolSpecificData) {
      toolInvocation.toolSpecificData = convertFromInternalToolSpecificData(part.toolSpecificData);
    }
    toolInvocation.subAgentInvocationId = part.subAgentInvocationId;
    toolInvocation.subAgentName = part.subAgentName;
    return toolInvocation;
  }
  ChatToolInvocationPart2.to = to;
  function convertFromInternalToolSpecificData(data) {
    if (data.kind === "terminal") {
      if (data.commandLine) {
        const result = {
          commandLine: data.commandLine,
          language: data.language
        };
        if (data.terminalCommandOutput) {
          result.output = {
            text: data.terminalCommandOutput.text,
            truncated: data.terminalCommandOutput.truncated,
            lineCount: data.terminalCommandOutput.lineCount
          };
        }
        if (data.terminalCommandState) {
          result.state = {
            exitCode: data.terminalCommandState.exitCode,
            duration: data.terminalCommandState.duration
          };
        }
        return result;
      } else {
        return {
          command: data.command,
          language: data.language
        };
      }
    } else if (data.kind === "terminal2") {
      return {
        commandLine: data.commandLine,
        language: data.language
      };
    } else if (data.kind === "todoList") {
      return {
        todoList: data.todoList.map((todo, index) => {
          const parsed = Number(todo.id);
          const id = Number.isFinite(parsed) ? parsed : index;
          return {
            id,
            title: todo.title,
            status: todoStatusStringToEnum(todo.status)
          };
        })
      };
    }
    return data;
  }
})(ChatToolInvocationPart || (ChatToolInvocationPart = {}));
var ChatTask;
((ChatTask2) => {
  function from(part) {
    return {
      kind: "progressTask",
      content: MarkdownString.from(part.value)
    };
  }
  ChatTask2.from = from;
})(ChatTask || (ChatTask = {}));
var ChatTaskResult;
((ChatTaskResult2) => {
  function from(part) {
    return {
      kind: "progressTaskResult",
      content: typeof part === "string" ? MarkdownString.from(part) : void 0
    };
  }
  ChatTaskResult2.from = from;
})(ChatTaskResult || (ChatTaskResult = {}));
var ChatResponseCommandButtonPart;
((ChatResponseCommandButtonPart2) => {
  function from(part, commandsConverter, commandDisposables) {
    const command = commandsConverter.toInternal(part.value, commandDisposables) ?? { command: part.value.command, title: part.value.title };
    return {
      kind: "command",
      command
    };
  }
  ChatResponseCommandButtonPart2.from = from;
  function to(part, commandsConverter) {
    return new types.ChatResponseCommandButtonPart(commandsConverter.fromInternal(part.command) ?? { command: part.command.id, title: part.command.title });
  }
  ChatResponseCommandButtonPart2.to = to;
})(ChatResponseCommandButtonPart || (ChatResponseCommandButtonPart = {}));
var ChatResponseTextEditPart;
((ChatResponseTextEditPart2) => {
  function from(part) {
    return {
      kind: "textEdit",
      uri: part.uri,
      edits: part.edits.map((e) => TextEdit.from(e)),
      done: part.isDone
    };
  }
  ChatResponseTextEditPart2.from = from;
  function to(part) {
    const result = new types.ChatResponseTextEditPart(URI.revive(part.uri), part.edits.map((e) => TextEdit.to(e)));
    result.isDone = part.done;
    return result;
  }
  ChatResponseTextEditPart2.to = to;
})(ChatResponseTextEditPart || (ChatResponseTextEditPart = {}));
var NotebookEdit;
((NotebookEdit2) => {
  function from(edit) {
    if (edit.newCellMetadata) {
      return {
        editType: CellEditType.Metadata,
        index: edit.range.start,
        metadata: edit.newCellMetadata
      };
    } else if (edit.newNotebookMetadata) {
      return {
        editType: CellEditType.DocumentMetadata,
        metadata: edit.newNotebookMetadata
      };
    } else {
      return {
        editType: CellEditType.Replace,
        index: edit.range.start,
        count: edit.range.end - edit.range.start,
        cells: edit.newCells.map(NotebookCellData.from)
      };
    }
  }
  NotebookEdit2.from = from;
})(NotebookEdit || (NotebookEdit = {}));
var ChatResponseNotebookEditPart;
((ChatResponseNotebookEditPart2) => {
  function from(part) {
    return {
      kind: "notebookEdit",
      uri: part.uri,
      edits: part.edits.map(NotebookEdit.from),
      done: part.isDone
    };
  }
  ChatResponseNotebookEditPart2.from = from;
})(ChatResponseNotebookEditPart || (ChatResponseNotebookEditPart = {}));
var ChatResponseWorkspaceEditPart;
((ChatResponseWorkspaceEditPart2) => {
  function from(part) {
    return {
      kind: "workspaceEdit",
      edits: part.edits.map((e) => ({
        oldResource: e.oldResource,
        newResource: e.newResource
      }))
    };
  }
  ChatResponseWorkspaceEditPart2.from = from;
})(ChatResponseWorkspaceEditPart || (ChatResponseWorkspaceEditPart = {}));
var ChatResponseReferencePart;
((ChatResponseReferencePart2) => {
  function from(part) {
    const iconPath = ThemeIcon.isThemeIcon(part.iconPath) ? part.iconPath : URI.isUri(part.iconPath) ? { light: URI.revive(part.iconPath) } : part.iconPath && "light" in part.iconPath && "dark" in part.iconPath && URI.isUri(part.iconPath.light) && URI.isUri(part.iconPath.dark) ? { light: URI.revive(part.iconPath.light), dark: URI.revive(part.iconPath.dark) } : void 0;
    if (typeof part.value === "object" && "variableName" in part.value) {
      return {
        kind: "reference",
        reference: {
          variableName: part.value.variableName,
          value: URI.isUri(part.value.value) || !part.value.value ? part.value.value : Location.from(part.value.value)
        },
        iconPath,
        options: part.options
      };
    }
    return {
      kind: "reference",
      reference: URI.isUri(part.value) || typeof part.value === "string" ? part.value : Location.from(part.value),
      iconPath,
      options: part.options
    };
  }
  ChatResponseReferencePart2.from = from;
  function to(part) {
    const value = revive(part);
    const mapValue = (value2) => URI.isUri(value2) ? value2 : Location.to(value2);
    return new types.ChatResponseReferencePart(
      typeof value.reference === "string" ? value.reference : "variableName" in value.reference ? {
        variableName: value.reference.variableName,
        value: value.reference.value && mapValue(value.reference.value)
      } : mapValue(value.reference)
    );
  }
  ChatResponseReferencePart2.to = to;
})(ChatResponseReferencePart || (ChatResponseReferencePart = {}));
var ChatResponseCodeCitationPart;
((ChatResponseCodeCitationPart2) => {
  function from(part) {
    return {
      kind: "codeCitation",
      value: part.value,
      license: part.license,
      snippet: part.snippet
    };
  }
  ChatResponseCodeCitationPart2.from = from;
})(ChatResponseCodeCitationPart || (ChatResponseCodeCitationPart = {}));
var ChatResponsePart;
((ChatResponsePart2) => {
  function from(part, commandsConverter, commandDisposables) {
    if (part instanceof types.ChatResponseMarkdownPart) {
      return ChatResponseMarkdownPart.from(part);
    } else if (part instanceof types.ChatResponseAnchorPart) {
      return ChatResponseAnchorPart.from(part);
    } else if (part instanceof types.ChatResponseReferencePart) {
      return ChatResponseReferencePart.from(part);
    } else if (part instanceof types.ChatResponseProgressPart) {
      return ChatResponseProgressPart.from(part);
    } else if (part instanceof types.ChatResponseThinkingProgressPart) {
      return ChatResponseThinkingProgressPart.from(part);
    } else if (part instanceof types.ChatResponseHookPart) {
      return ChatResponseHookPart.from(part);
    } else if (part instanceof types.ChatResponseVoiceProgressPart) {
      return ChatResponseVoiceProgressPart.from(part);
    } else if (part instanceof types.ChatResponseFileTreePart) {
      return ChatResponseFilesPart.from(part);
    } else if (part instanceof types.ChatResponseMultiDiffPart) {
      return ChatResponseMultiDiffPart.from(part);
    } else if (part instanceof types.ChatResponseCommandButtonPart) {
      return ChatResponseCommandButtonPart.from(part, commandsConverter, commandDisposables);
    } else if (part instanceof types.ChatResponseTextEditPart) {
      return ChatResponseTextEditPart.from(part);
    } else if (part instanceof types.ChatResponseNotebookEditPart) {
      return ChatResponseNotebookEditPart.from(part);
    } else if (part instanceof types.ChatResponseMarkdownWithVulnerabilitiesPart) {
      return ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
    } else if (part instanceof types.ChatResponseCodeblockUriPart) {
      return ChatResponseCodeblockUriPart.from(part);
    } else if (part instanceof types.ChatResponseWarningPart) {
      return ChatResponseWarningPart.from(part);
    } else if (part instanceof types.ChatResponseInfoPart) {
      return ChatResponseInfoPart.from(part);
    } else if (part instanceof types.ChatResponseConfirmationPart) {
      return ChatResponseConfirmationPart.from(part);
    } else if (part instanceof types.ChatResponseQuestionCarouselPart) {
      return ChatResponseQuestionCarouselPart.from(part);
    } else if (part instanceof types.ChatResponseCodeCitationPart) {
      return ChatResponseCodeCitationPart.from(part);
    } else if (part instanceof types.ChatResponseMovePart) {
      return ChatResponseMovePart.from(part);
    } else if (part instanceof types.ChatResponseExtensionsPart) {
      return ChatResponseExtensionsPart.from(part);
    } else if (part instanceof types.ChatResponsePullRequestPart) {
      return ChatResponsePullRequestPart.from(part, commandsConverter, commandDisposables);
    } else if (part instanceof types.ChatToolInvocationPart) {
      return ChatToolInvocationPart.from(part);
    } else if (part instanceof types.ChatResponseWorkspaceEditPart) {
      return ChatResponseWorkspaceEditPart.from(part);
    } else if (part instanceof types.ChatResponseAutoModeResolutionPart) {
      return ChatResponseAutoModeResolutionPart.from(part);
    }
    return {
      kind: "markdownContent",
      content: MarkdownString.from("")
    };
  }
  ChatResponsePart2.from = from;
  function to(part, commandsConverter) {
    switch (part.kind) {
      case "reference":
        return ChatResponseReferencePart.to(part);
      case "markdownContent":
      case "inlineReference":
      case "progressMessage":
      case "treeData":
      case "command":
        return toContent(part, commandsConverter);
    }
    return void 0;
  }
  ChatResponsePart2.to = to;
  function toContent(part, commandsConverter) {
    switch (part.kind) {
      case "markdownContent":
        return ChatResponseMarkdownPart.to(part);
      case "inlineReference":
        return ChatResponseAnchorPart.to(part);
      case "progressMessage":
        return void 0;
      case "treeData":
        return ChatResponseFilesPart.to(part);
      case "command":
        return ChatResponseCommandButtonPart.to(part, commandsConverter);
    }
    return void 0;
  }
  ChatResponsePart2.toContent = toContent;
})(ChatResponsePart || (ChatResponsePart = {}));
var ChatAgentRequest;
((ChatAgentRequest2) => {
  function to(request, location2, model, modelConfiguration, diagnostics, tools, extension, logService) {
    const toolReferences = [];
    const variableReferences = [];
    for (const v of request.variables.variables) {
      if (v.kind === "tool") {
        toolReferences.push(v);
      } else if (v.kind === "toolset") {
        toolReferences.push(...v.value);
      } else {
        variableReferences.push(v);
      }
    }
    const sessionId = LocalChatSessionUri.parseLocalSessionId(request.sessionResource) ?? request.sessionResource.toString();
    const requestWithAllProps = {
      id: request.requestId,
      prompt: request.message,
      command: request.command,
      attempt: request.attempt ?? 0,
      enableCommandDetection: request.enableCommandDetection ?? true,
      isParticipantDetected: request.isParticipantDetected ?? false,
      isVoiceModeInput: request.isVoiceModeInput,
      sessionId,
      sessionResource: request.sessionResource,
      references: variableReferences.flatMap((v) => ChatPromptReference.toReferences(v, diagnostics, logService)),
      toolReferences: toolReferences.map(ChatLanguageModelToolReference.to),
      location: ChatLocation.to(request.location),
      acceptedConfirmationData: request.acceptedConfirmationData,
      rejectedConfirmationData: request.rejectedConfirmationData,
      location2,
      toolInvocationToken: Object.freeze({ sessionResource: request.sessionResource, workingDirectory: URI.revive(request.workingDirectory) }),
      tools,
      model,
      modelConfiguration,
      editedFileEvents: request.editedFileEvents,
      modeInstructions: request.modeInstructions?.content,
      modeInstructions2: ChatRequestModeInstructions.to(request.modeInstructions),
      permissionLevel: request.permissionLevel,
      subAgentInvocationId: request.subAgentInvocationId,
      subAgentName: request.subAgentName,
      parentRequestId: request.parentRequestId,
      hasHooksEnabled: request.hasHooksEnabled ?? false,
      hooks: request.hooks ? ChatRequestHooksConverter.to(request.hooks) : void 0,
      isSystemInitiated: request.isSystemInitiated
    };
    if (!isProposedApiEnabled(extension, "chatParticipantPrivate")) {
      delete requestWithAllProps.id;
      delete requestWithAllProps.attempt;
      delete requestWithAllProps.enableCommandDetection;
      delete requestWithAllProps.isParticipantDetected;
      delete requestWithAllProps.isVoiceModeInput;
      delete requestWithAllProps.location;
      delete requestWithAllProps.location2;
      delete requestWithAllProps.editedFileEvents;
      delete requestWithAllProps.sessionId;
      delete requestWithAllProps.subAgentInvocationId;
      delete requestWithAllProps.subAgentName;
      delete requestWithAllProps.parentRequestId;
      delete requestWithAllProps.hasHooksEnabled;
      delete requestWithAllProps.hooks;
    }
    if (!isProposedApiEnabled(extension, "chatParticipantAdditions")) {
      delete requestWithAllProps.acceptedConfirmationData;
      delete requestWithAllProps.rejectedConfirmationData;
      delete requestWithAllProps.tools;
    }
    return requestWithAllProps;
  }
  ChatAgentRequest2.to = to;
})(ChatAgentRequest || (ChatAgentRequest = {}));
var ChatLocation;
((ChatLocation2) => {
  function to(loc) {
    switch (loc) {
      case ChatAgentLocation.Notebook:
        return types.ChatLocation.Notebook;
      case ChatAgentLocation.Terminal:
        return types.ChatLocation.Terminal;
      case ChatAgentLocation.Chat:
        return types.ChatLocation.Panel;
      case ChatAgentLocation.EditorInline:
        return types.ChatLocation.Editor;
    }
  }
  ChatLocation2.to = to;
  function from(loc) {
    switch (loc) {
      case types.ChatLocation.Notebook:
        return ChatAgentLocation.Notebook;
      case types.ChatLocation.Terminal:
        return ChatAgentLocation.Terminal;
      case types.ChatLocation.Panel:
        return ChatAgentLocation.Chat;
      case types.ChatLocation.Editor:
        return ChatAgentLocation.EditorInline;
    }
  }
  ChatLocation2.from = from;
})(ChatLocation || (ChatLocation = {}));
var ChatSessionCustomizationType;
((ChatSessionCustomizationType2) => {
  function from(type) {
    return type.id;
  }
  ChatSessionCustomizationType2.from = from;
  function to(id) {
    switch (id) {
      case "agent":
        return types.ChatSessionCustomizationType.Agent;
      case "skill":
        return types.ChatSessionCustomizationType.Skill;
      case "instructions":
        return types.ChatSessionCustomizationType.Instructions;
      case "prompt":
        return types.ChatSessionCustomizationType.Prompt;
      case "hook":
        return types.ChatSessionCustomizationType.Hook;
      case "plugins":
        return types.ChatSessionCustomizationType.Plugins;
      default:
        return new types.ChatSessionCustomizationType(id);
    }
  }
  ChatSessionCustomizationType2.to = to;
})(ChatSessionCustomizationType || (ChatSessionCustomizationType = {}));
var ChatPromptReference;
((ChatPromptReference2) => {
  function toReferences(variable, diagnostics, logService) {
    const reference = to(variable, diagnostics, logService);
    if (!reference) {
      return [];
    }
    const element = isElementVariableEntry(variable) ? variable : void 0;
    if (!element) {
      return [reference];
    }
    const imageData = coerceImageBuffer(element.imageData);
    if (!imageData) {
      return [reference];
    }
    return [
      reference,
      {
        id: `${variable.id}-screenshot`,
        name: `${variable.name} screenshot`,
        value: new types.ChatReferenceBinaryData(
          element.imageMimeType ?? "image/png",
          () => Promise.resolve(imageData)
        )
      }
    ];
  }
  ChatPromptReference2.toReferences = toReferences;
  function to(variable, diagnostics, logService) {
    let value = variable.value;
    if (!value) {
      let varStr;
      try {
        varStr = JSON.stringify(variable);
      } catch {
        varStr = `kind=${variable.kind}, id=${variable.id}, name=${variable.name}`;
      }
      logService.error(`[ChatPromptReference] Ignoring invalid reference in variable: ${varStr}`);
      return void 0;
    }
    if (isUriComponents(value)) {
      value = URI.revive(value);
    } else if (value && typeof value === "object" && "uri" in value && "range" in value && isUriComponents(value.uri)) {
      value = Location.to(revive(value));
    } else if (isImageVariableEntry(variable)) {
      const ref = variable.references?.[0]?.reference;
      value = new types.ChatReferenceBinaryData(
        variable.mimeType ?? "image/png",
        () => Promise.resolve(new Uint8Array(Object.values(variable.value))),
        ref && URI.isUri(ref) ? ref : void 0,
        variable.isPasted,
        variable.isURL
      );
    } else if (variable.kind === "diagnostic") {
      const filterSeverity = variable.filterSeverity && DiagnosticSeverity.to(variable.filterSeverity);
      const filterUri = variable.filterUri && URI.revive(variable.filterUri).toString();
      value = new types.ChatReferenceDiagnostic(diagnostics.map(([uri, d]) => {
        if (variable.filterUri && uri.toString() !== filterUri) {
          return [uri, []];
        }
        return [uri, d.filter((d2) => {
          if (filterSeverity && d2.severity > filterSeverity) {
            return false;
          }
          if (variable.filterRange && !editorRange.Range.areIntersectingOrTouching(variable.filterRange, Range.from(d2.range))) {
            return false;
          }
          return true;
        })];
      }).filter(([, d]) => d.length > 0));
    }
    let toolReferences;
    if (isPromptFileVariableEntry(variable) || isPromptTextVariableEntry(variable)) {
      if (variable.toolReferences) {
        toolReferences = ChatLanguageModelToolReferences.to(variable.toolReferences);
      }
    }
    return {
      id: variable.id,
      name: variable.name,
      range: variable.range && [variable.range.start, variable.range.endExclusive],
      toolReferences,
      value,
      modelDescription: variable.modelDescription
    };
  }
  ChatPromptReference2.to = to;
})(ChatPromptReference || (ChatPromptReference = {}));
var ChatLanguageModelToolReference;
((ChatLanguageModelToolReference2) => {
  function to(variable) {
    const value = variable.value;
    if (value) {
      throw new Error("Invalid tool reference");
    }
    return {
      name: variable.id,
      range: variable.range && [variable.range.start, variable.range.endExclusive]
    };
  }
  ChatLanguageModelToolReference2.to = to;
})(ChatLanguageModelToolReference || (ChatLanguageModelToolReference = {}));
var ChatLanguageModelToolReferences;
((ChatLanguageModelToolReferences2) => {
  function to(variables) {
    const toolReferences = [];
    for (const v of variables) {
      if (v.kind === "tool") {
        toolReferences.push(ChatLanguageModelToolReference.to(v));
      } else if (v.kind === "toolset") {
        toolReferences.push(...v.value.map(ChatLanguageModelToolReference.to));
      } else {
        throw new Error("Invalid tool reference in prompt variables");
      }
    }
    return toolReferences;
  }
  ChatLanguageModelToolReferences2.to = to;
})(ChatLanguageModelToolReferences || (ChatLanguageModelToolReferences = {}));
var ChatRequestModeInstructions;
((ChatRequestModeInstructions2) => {
  function to(mode) {
    if (mode) {
      return {
        uri: URI.revive(mode.uri),
        name: mode.name,
        content: mode.content,
        toolReferences: ChatLanguageModelToolReferences.to(revive(mode.toolReferences)),
        allowedSubagents: mode.allowedSubagents,
        metadata: mode.metadata,
        isBuiltin: mode.isBuiltin
      };
    }
    return void 0;
  }
  ChatRequestModeInstructions2.to = to;
  function from(mode) {
    if (mode) {
      return {
        uri: mode.uri,
        name: mode.name,
        content: mode.content,
        toolReferences: mode.toolReferences?.map((ref) => ({
          kind: "tool",
          id: ref.name,
          name: ref.name,
          value: void 0,
          range: ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : void 0
        })) ?? [],
        allowedSubagents: mode.allowedSubagents,
        metadata: mode.metadata,
        isBuiltin: mode.isBuiltin
      };
    }
    return void 0;
  }
  ChatRequestModeInstructions2.from = from;
})(ChatRequestModeInstructions || (ChatRequestModeInstructions = {}));
var ChatAgentCompletionItem;
((ChatAgentCompletionItem2) => {
  function from(item, commandsConverter, disposables) {
    return {
      id: item.id,
      label: item.label,
      fullName: item.fullName,
      icon: item.icon?.id,
      value: item.values[0].value,
      insertText: item.insertText,
      detail: item.detail,
      documentation: item.documentation,
      command: commandsConverter.toInternal(item.command, disposables)
    };
  }
  ChatAgentCompletionItem2.from = from;
})(ChatAgentCompletionItem || (ChatAgentCompletionItem = {}));
var ChatAgentResult;
((ChatAgentResult2) => {
  function to(result) {
    return {
      errorDetails: result.errorDetails,
      metadata: reviveMetadata(result.metadata),
      nextQuestion: result.nextQuestion,
      details: result.details
    };
  }
  ChatAgentResult2.to = to;
  function from(result) {
    return {
      errorDetails: result.errorDetails,
      metadata: result.metadata,
      nextQuestion: result.nextQuestion,
      details: result.details
    };
  }
  ChatAgentResult2.from = from;
  function reviveMetadata(metadata) {
    return cloneAndChange(metadata, (value) => {
      if (value.$mid === MarshalledId.LanguageModelToolResult) {
        return new types.LanguageModelToolResult(cloneAndChange(value.content, reviveMetadata));
      } else if (value.$mid === MarshalledId.LanguageModelTextPart) {
        return new types.LanguageModelTextPart(value.value);
      } else if (value.$mid === MarshalledId.LanguageModelThinkingPart) {
        return new types.LanguageModelThinkingPart(value.value, value.id, value.metadata);
      } else if (value.$mid === MarshalledId.LanguageModelPromptTsxPart) {
        return new types.LanguageModelPromptTsxPart(value.value);
      } else if (value.$mid === MarshalledId.LanguageModelDataPart) {
        let buffer;
        if (value.data && typeof value.data === "object" && value.data.type === "Buffer" && Array.isArray(value.data.data)) {
          buffer = new Uint8Array(value.data.data);
        } else if (typeof value.data === "string") {
          try {
            buffer = decodeBase64(value.data).buffer;
          } catch {
            buffer = new Uint8Array(0);
          }
        } else {
          buffer = new Uint8Array(0);
        }
        return new types.LanguageModelDataPart(buffer, value.mimeType, value.audience);
      }
      return void 0;
    });
  }
})(ChatAgentResult || (ChatAgentResult = {}));
var ChatAgentUserActionEvent;
((ChatAgentUserActionEvent2) => {
  function to(result, event, commandsConverter) {
    if (event.action.kind === "vote") {
      return;
    }
    const ehResult = ChatAgentResult.to(result);
    if (event.action.kind === "command") {
      const command = event.action.commandButton.command;
      const commandButton = {
        command: commandsConverter.fromInternal(command) ?? { command: command.id, title: command.title }
      };
      const commandAction = { kind: "command", commandButton };
      return { action: commandAction, result: ehResult };
    } else if (event.action.kind === "followUp") {
      const followupAction = { kind: "followUp", followup: ChatFollowup.to(event.action.followup) };
      return { action: followupAction, result: ehResult };
    } else if (event.action.kind === "inlineChat") {
      return { action: { kind: "editor", accepted: event.action.action === "accepted" }, result: ehResult };
    } else if (event.action.kind === "chatEditingSessionAction") {
      const outcomes = /* @__PURE__ */ new Map([
        ["accepted", types.ChatEditingSessionActionOutcome.Accepted],
        ["rejected", types.ChatEditingSessionActionOutcome.Rejected],
        ["saved", types.ChatEditingSessionActionOutcome.Saved]
      ]);
      return {
        action: {
          kind: "chatEditingSessionAction",
          outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
          uri: URI.revive(event.action.uri),
          hasRemainingEdits: event.action.hasRemainingEdits
        },
        result: ehResult
      };
    } else if (event.action.kind === "chatEditingHunkAction") {
      const outcomes = /* @__PURE__ */ new Map([
        ["accepted", types.ChatEditingSessionActionOutcome.Accepted],
        ["rejected", types.ChatEditingSessionActionOutcome.Rejected]
      ]);
      return {
        action: {
          kind: "chatEditingHunkAction",
          outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
          uri: URI.revive(event.action.uri),
          hasRemainingEdits: event.action.hasRemainingEdits,
          lineCount: event.action.lineCount,
          linesAdded: event.action.linesAdded,
          linesRemoved: event.action.linesRemoved
        },
        result: ehResult
      };
    } else {
      return { action: event.action, result: ehResult };
    }
  }
  ChatAgentUserActionEvent2.to = to;
})(ChatAgentUserActionEvent || (ChatAgentUserActionEvent = {}));
var TerminalQuickFix;
((TerminalQuickFix2) => {
  function from(quickFix, converter, disposables) {
    if ("terminalCommand" in quickFix) {
      return { terminalCommand: quickFix.terminalCommand, shouldExecute: quickFix.shouldExecute };
    }
    if ("uri" in quickFix) {
      return { uri: quickFix.uri };
    }
    return converter.toInternal(quickFix, disposables);
  }
  TerminalQuickFix2.from = from;
})(TerminalQuickFix || (TerminalQuickFix = {}));
var TerminalCompletionItemDto;
((TerminalCompletionItemDto2) => {
  function from(item) {
    return {
      ...item,
      documentation: MarkdownString.fromStrict(item.documentation)
    };
  }
  TerminalCompletionItemDto2.from = from;
})(TerminalCompletionItemDto || (TerminalCompletionItemDto = {}));
var TerminalCompletionList;
((TerminalCompletionList2) => {
  function from(completions, pathSeparator) {
    if (Array.isArray(completions)) {
      return {
        items: completions.map((i) => TerminalCompletionItemDto.from(i))
      };
    }
    return {
      items: completions.items.map((i) => TerminalCompletionItemDto.from(i)),
      resourceOptions: completions.resourceOptions ? TerminalCompletionResourceOptions.from(completions.resourceOptions, pathSeparator) : void 0
    };
  }
  TerminalCompletionList2.from = from;
})(TerminalCompletionList || (TerminalCompletionList = {}));
var TerminalCompletionResourceOptions;
((TerminalCompletionResourceOptions2) => {
  function from(resourceOptions, pathSeparator) {
    return {
      ...resourceOptions,
      pathSeparator,
      cwd: resourceOptions.cwd,
      globPattern: GlobPattern.from(resourceOptions.globPattern) ?? void 0
    };
  }
  TerminalCompletionResourceOptions2.from = from;
})(TerminalCompletionResourceOptions || (TerminalCompletionResourceOptions = {}));
var PartialAcceptInfo;
((PartialAcceptInfo2) => {
  function to(info) {
    return {
      kind: PartialAcceptTriggerKind.to(info.kind),
      acceptedLength: info.acceptedLength
    };
  }
  PartialAcceptInfo2.to = to;
})(PartialAcceptInfo || (PartialAcceptInfo = {}));
var PartialAcceptTriggerKind;
((PartialAcceptTriggerKind2) => {
  function to(kind) {
    switch (kind) {
      case languages.PartialAcceptTriggerKind.Word:
        return types.PartialAcceptTriggerKind.Word;
      case languages.PartialAcceptTriggerKind.Line:
        return types.PartialAcceptTriggerKind.Line;
      case languages.PartialAcceptTriggerKind.Suggest:
        return types.PartialAcceptTriggerKind.Suggest;
      default:
        return types.PartialAcceptTriggerKind.Unknown;
    }
  }
  PartialAcceptTriggerKind2.to = to;
})(PartialAcceptTriggerKind || (PartialAcceptTriggerKind = {}));
var InlineCompletionEndOfLifeReason;
((InlineCompletionEndOfLifeReason2) => {
  function to(reason, convertFn) {
    if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
      const supersededBy = reason.supersededBy ? convertFn(reason.supersededBy) : void 0;
      return {
        kind: types.InlineCompletionEndOfLifeReasonKind.Ignored,
        supersededBy,
        userTypingDisagreed: reason.userTypingDisagreed
      };
    } else if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
      return {
        kind: types.InlineCompletionEndOfLifeReasonKind.Accepted
      };
    }
    return {
      kind: types.InlineCompletionEndOfLifeReasonKind.Rejected
    };
  }
  InlineCompletionEndOfLifeReason2.to = to;
})(InlineCompletionEndOfLifeReason || (InlineCompletionEndOfLifeReason = {}));
var InlineCompletionHintStyle;
((InlineCompletionHintStyle2) => {
  function from(value) {
    if (value === types.InlineCompletionDisplayLocationKind.Label) {
      return languages.InlineCompletionHintStyle.Label;
    } else {
      return languages.InlineCompletionHintStyle.Code;
    }
  }
  InlineCompletionHintStyle2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.InlineCompletionHintStyle.Label:
        return types.InlineCompletionDisplayLocationKind.Label;
      default:
        return types.InlineCompletionDisplayLocationKind.Code;
    }
  }
  InlineCompletionHintStyle2.to = to;
})(InlineCompletionHintStyle || (InlineCompletionHintStyle = {}));
var DebugTreeItem;
((DebugTreeItem2) => {
  function from(item, id) {
    return {
      id,
      label: item.label,
      description: item.description,
      canEdit: item.canEdit,
      collapsibleState: item.collapsibleState || DebugTreeItemCollapsibleState.None,
      contextValue: item.contextValue
    };
  }
  DebugTreeItem2.from = from;
})(DebugTreeItem || (DebugTreeItem = {}));
var LanguageModelToolSource;
((LanguageModelToolSource2) => {
  function to(source) {
    if (source.type === "mcp") {
      return new types.LanguageModelToolMCPSource(source.label, source.serverLabel || source.label, source.instructions);
    } else if (source.type === "extension") {
      return new types.LanguageModelToolExtensionSource(source.extensionId.value, source.label);
    } else {
      return void 0;
    }
  }
  LanguageModelToolSource2.to = to;
})(LanguageModelToolSource || (LanguageModelToolSource = {}));
var LanguageModelToolResult;
((LanguageModelToolResult2) => {
  function to(result) {
    const toolResult = new types.LanguageModelToolResult(result.content.map((item) => {
      if (item.kind === "text") {
        return new types.LanguageModelTextPart(item.value, item.audience);
      } else if (item.kind === "data") {
        return new types.LanguageModelDataPart(item.value.data.buffer, item.value.mimeType, item.audience);
      } else {
        return new types.LanguageModelPromptTsxPart(item.value);
      }
    }));
    if (result.toolMetadata !== void 0) {
      toolResult.toolMetadata = result.toolMetadata;
    }
    if (result.toolResultError) {
      toolResult.hasError = !!result.toolResultError;
    }
    return toolResult;
  }
  LanguageModelToolResult2.to = to;
  function from(result, extension) {
    if (result.toolResultMessage) {
      checkProposedApiEnabled(extension, "chatParticipantPrivate");
    }
    const checkAudienceApi = (item) => {
      if (item.audience) {
        checkProposedApiEnabled(extension, "languageModelToolResultAudience");
      }
    };
    let hasBuffers = false;
    let detailsDto = void 0;
    if (Array.isArray(result.toolResultDetails)) {
      detailsDto = result.toolResultDetails?.map((detail) => {
        return URI.isUri(detail) ? detail : Location.from(detail);
      });
    } else {
      if (result.toolResultDetails2) {
        detailsDto = {
          output: {
            type: "data",
            mimeType: result.toolResultDetails2.mime,
            value: VSBuffer.wrap(result.toolResultDetails2.value)
          }
        };
        hasBuffers = true;
      }
    }
    const dto = {
      content: result.content.map((item) => {
        if (item instanceof types.LanguageModelTextPart) {
          checkAudienceApi(item);
          return {
            kind: "text",
            value: item.value,
            audience: item.audience
          };
        } else if (item instanceof types.LanguageModelPromptTsxPart) {
          return {
            kind: "promptTsx",
            value: item.value
          };
        } else if (item instanceof types.LanguageModelDataPart) {
          checkAudienceApi(item);
          hasBuffers = true;
          return {
            kind: "data",
            value: {
              mimeType: item.mimeType,
              data: VSBuffer.wrap(item.data)
            },
            audience: item.audience
          };
        } else {
          throw new Error("Unknown LanguageModelToolResult part type");
        }
      }),
      toolResultMessage: MarkdownString.fromStrict(result.toolResultMessage),
      toolResultDetails: detailsDto,
      toolMetadata: result.toolMetadata,
      toolResultError: result.hasError
    };
    return hasBuffers ? new SerializableObjectWithBuffers(dto) : dto;
  }
  LanguageModelToolResult2.from = from;
})(LanguageModelToolResult || (LanguageModelToolResult = {}));
var IconPath;
((IconPath2) => {
  function fromThemeIcon(iconPath) {
    return iconPath;
  }
  IconPath2.fromThemeIcon = fromThemeIcon;
  function from(value) {
    if (!value) {
      return void 0;
    } else if (ThemeIcon.isThemeIcon(value)) {
      return value;
    } else if (URI.isUri(value)) {
      return value;
    } else if (typeof value === "string") {
      return URI.file(value);
    } else if (typeof value === "object" && value !== null && "dark" in value) {
      const dark = typeof value.dark === "string" ? URI.file(value.dark) : value.dark;
      const light = typeof value.light === "string" ? URI.file(value.light) : value.light;
      return !dark ? void 0 : { dark, light: light ?? dark };
    } else {
      return void 0;
    }
  }
  IconPath2.from = from;
  function to(value) {
    if (!value) {
      return void 0;
    } else if (ThemeIcon.isThemeIcon(value)) {
      return value;
    } else if (isUriComponents(value)) {
      return URI.revive(value);
    } else {
      const icon = value;
      return {
        light: URI.revive(icon.light),
        dark: URI.revive(icon.dark)
      };
    }
  }
  IconPath2.to = to;
})(IconPath || (IconPath = {}));
var AiSettingsSearch;
((AiSettingsSearch2) => {
  function fromSettingsSearchResult(result) {
    return {
      query: result.query,
      kind: fromSettingsSearchResultKind(result.kind),
      settings: result.settings
    };
  }
  AiSettingsSearch2.fromSettingsSearchResult = fromSettingsSearchResult;
  function fromSettingsSearchResultKind(kind) {
    switch (kind) {
      case AiSettingsSearchResultKind.EMBEDDED:
        return AiSettingsSearchResultKind.EMBEDDED;
      case AiSettingsSearchResultKind.LLM_RANKED:
        return AiSettingsSearchResultKind.LLM_RANKED;
      case AiSettingsSearchResultKind.CANCELED:
        return AiSettingsSearchResultKind.CANCELED;
      default:
        throw new Error("Unknown AiSettingsSearchResultKind");
    }
  }
})(AiSettingsSearch || (AiSettingsSearch = {}));
var McpServerDefinition;
((McpServerDefinition2) => {
  function isHttpConfig(candidate) {
    return !!candidate.uri;
  }
  function from(item) {
    return McpServerLaunch.toSerialized(
      isHttpConfig(item) ? {
        type: McpServerTransportType.HTTP,
        uri: item.uri,
        headers: Object.entries(item.headers),
        authentication: item.authentication ? {
          providerId: item.authentication.providerId,
          scopes: item.authentication.scopes
        } : void 0
      } : {
        type: McpServerTransportType.Stdio,
        cwd: item.cwd?.fsPath,
        args: item.args,
        command: item.command,
        env: item.env,
        envFile: void 0,
        sandbox: void 0
      }
    );
  }
  McpServerDefinition2.from = from;
  function to(dto) {
    const launch = McpServerLaunch.fromSerialized(dto.launch);
    if (launch.type === McpServerTransportType.HTTP) {
      return new types.McpHttpServerDefinition(
        dto.label,
        launch.uri,
        Object.fromEntries(launch.headers),
        dto.cacheNonce === "$$NONE" ? void 0 : dto.cacheNonce
      );
    } else {
      const result = new types.McpStdioServerDefinition(
        dto.label,
        launch.command,
        [...launch.args],
        Object.fromEntries(Object.entries(launch.env).map(([key, value]) => [key, value === null ? null : String(value)])),
        dto.cacheNonce === "$$NONE" ? void 0 : dto.cacheNonce
      );
      if (launch.cwd) {
        result.cwd = URI.file(launch.cwd);
      }
      return result;
    }
  }
  McpServerDefinition2.to = to;
})(McpServerDefinition || (McpServerDefinition = {}));
var SourceControlInputBoxValidationType;
((SourceControlInputBoxValidationType2) => {
  function from(type) {
    switch (type) {
      case types.SourceControlInputBoxValidationType.Error:
        return InputValidationType.Error;
      case types.SourceControlInputBoxValidationType.Warning:
        return InputValidationType.Warning;
      case types.SourceControlInputBoxValidationType.Information:
        return InputValidationType.Information;
      default:
        throw new Error("Unknown SourceControlInputBoxValidationType");
    }
  }
  SourceControlInputBoxValidationType2.from = from;
})(SourceControlInputBoxValidationType || (SourceControlInputBoxValidationType = {}));
var ChatRequestHooksConverter;
((ChatRequestHooksConverter2) => {
  function to(hooks) {
    const result = {};
    for (const [hookType, commands] of Object.entries(hooks)) {
      if (!commands || commands.length === 0) {
        continue;
      }
      const converted = [];
      for (const cmd of commands) {
        const resolved = ChatHookCommand.to(cmd);
        if (resolved) {
          converted.push(resolved);
        }
      }
      if (converted.length > 0) {
        result[hookType] = converted;
      }
    }
    return result;
  }
  ChatRequestHooksConverter2.to = to;
})(ChatRequestHooksConverter || (ChatRequestHooksConverter = {}));
var ChatHookCommand;
((ChatHookCommand2) => {
  function to(hook) {
    const command = resolveEffectiveCommand(hook, OS);
    if (!command) {
      return void 0;
    }
    return {
      command,
      cwd: hook.cwd,
      env: hook.env,
      timeout: hook.timeout
    };
  }
  ChatHookCommand2.to = to;
})(ChatHookCommand || (ChatHookCommand = {}));
var ChatSessionItem;
((ChatSessionItem2) => {
  function convertStatus(status) {
    if (status === void 0) {
      return void 0;
    }
    switch (status) {
      case 0:
        return ChatSessionStatus.Failed;
      case 1:
        return ChatSessionStatus.Completed;
      case 2:
        return ChatSessionStatus.InProgress;
      case 3:
        return ChatSessionStatus.NeedsInput;
      default:
        return void 0;
    }
  }
  function from(sessionContent) {
    const timing = sessionContent.timing;
    const created = timing?.created ?? timing?.startTime ?? 0;
    const lastRequestStarted = timing?.lastRequestStarted ?? timing?.startTime;
    const lastRequestEnded = timing?.lastRequestEnded ?? timing?.endTime;
    return {
      resource: sessionContent.resource,
      label: sessionContent.label,
      description: sessionContent.description ? MarkdownString.from(sessionContent.description) : void 0,
      badge: sessionContent.badge ? MarkdownString.from(sessionContent.badge) : void 0,
      status: convertStatus(sessionContent.status),
      archived: sessionContent.archived,
      tooltip: MarkdownString.fromStrict(sessionContent.tooltip),
      timing: {
        created,
        lastRequestStarted,
        lastRequestEnded
      },
      changes: sessionContent.changes instanceof Array ? sessionContent.changes : void 0,
      metadata: sessionContent.metadata,
      legacyResource: sessionContent.legacyResource
    };
  }
  ChatSessionItem2.from = from;
})(ChatSessionItem || (ChatSessionItem = {}));
export {
  AiSettingsSearch,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  ChatAgentCompletionItem,
  ChatAgentRequest,
  ChatAgentResult,
  ChatAgentUserActionEvent,
  ChatFollowup,
  ChatHookCommand,
  ChatLanguageModelToolReference,
  ChatLocation,
  ChatPromptReference,
  ChatRequestHooksConverter,
  ChatRequestModeInstructions,
  ChatResponseAnchorPart,
  ChatResponseAutoModeResolutionPart,
  ChatResponseCodeCitationPart,
  ChatResponseCodeblockUriPart,
  ChatResponseCommandButtonPart,
  ChatResponseConfirmationPart,
  ChatResponseExtensionsPart,
  ChatResponseFilesPart,
  ChatResponseHookPart,
  ChatResponseInfoPart,
  ChatResponseMarkdownPart,
  ChatResponseMarkdownWithVulnerabilitiesPart,
  ChatResponseMovePart,
  ChatResponseMultiDiffPart,
  ChatResponseNotebookEditPart,
  ChatResponsePart,
  ChatResponseProgressPart,
  ChatResponsePullRequestPart,
  ChatResponseQuestionCarouselPart,
  ChatResponseReferencePart,
  ChatResponseTextEditPart,
  ChatResponseThinkingProgressPart,
  ChatResponseVoiceProgressPart,
  ChatResponseWarningPart,
  ChatResponseWorkspaceEditPart,
  ChatSessionCustomizationType,
  ChatSessionItem,
  ChatTask,
  ChatTaskResult,
  ChatToolInvocationPart,
  CodeActionTriggerKind,
  Color,
  ColorPresentation,
  CompletionCommand,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionTriggerKind,
  DataTransfer,
  DataTransferItem,
  DebugTreeItem,
  DecorationRangeBehavior,
  DecorationRenderOptions,
  DefinitionLink,
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentHighlight,
  DocumentLink,
  DocumentSelector,
  DocumentSymbol,
  EndOfLine,
  EvaluatableExpression,
  FoldingRange,
  FoldingRangeKind,
  GlobPattern,
  Hover,
  IconPath,
  InlayHint,
  InlayHintKind,
  InlayHintLabelPart,
  InlineCompletionEndOfLifeReason,
  InlineCompletionHintStyle,
  InlineValue,
  InlineValueContext,
  LanguageModelChatMessage,
  LanguageModelChatMessage2,
  LanguageModelChatMessageRole,
  LanguageModelToolResult,
  LanguageModelToolSource,
  LanguageSelector,
  Location,
  MarkdownString,
  McpServerDefinition,
  MultiDocumentHighlight,
  NotebookCellData,
  NotebookCellExecutionSummary,
  NotebookCellKind,
  NotebookCellOutput,
  NotebookCellOutputItem,
  NotebookData,
  NotebookDocumentContentOptions,
  NotebookEdit,
  NotebookExclusiveDocumentPattern,
  NotebookKernelSourceAction,
  NotebookRange,
  NotebookRendererScript,
  NotebookStatusBarItem,
  ParameterInformation,
  PartialAcceptInfo,
  PartialAcceptTriggerKind,
  Position,
  ProgressLocation,
  Range,
  Selection,
  SelectionRange,
  SignatureHelp,
  SignatureInformation,
  SourceControlInputBoxValidationType,
  SymbolKind,
  SymbolTag,
  TabSelector,
  TerminalCompletionItemDto,
  TerminalCompletionList,
  TerminalCompletionResourceOptions,
  TerminalQuickFix,
  TestCoverage,
  TestItem,
  TestMessage,
  TestResults,
  TestRunProfile,
  TestRunProfileKind,
  TestTag,
  TextDocumentSaveReason,
  TextEdit,
  TextEditorLineNumbersStyle,
  TextEditorOpenOptions,
  ThemableDecorationAttachmentRenderOptions,
  ThemableDecorationRenderOptions,
  TokenType,
  TypeHierarchyItem,
  ViewBadge,
  ViewColumn,
  WorkspaceEdit,
  WorkspaceSymbol,
  fromRangeOrRangeWithMessage,
  isDecorationOptionsArr,
  location,
  pathOrURIToURI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlQ29udmVydGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBhc0FycmF5LCBjb2FsZXNjZSwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBkZWNvZGVCYXNlNjQsIGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElEYXRhVHJhbnNmZXJGaWxlLCBJRGF0YVRyYW5zZmVySXRlbSwgVXJpTGlzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCAqIGFzIGh0bWxDb250ZW50IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0ICogYXMgbWFya2VkIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgcGFyc2UsIHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBjbG9uZUFuZENoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUHJlZml4VHJlZU5vZGUsIFdlbGxEZWZpbmVkUHJlZml4VHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3ByZWZpeFRyZWUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCwgaXNFbXB0eU9iamVjdCwgaXNOdW1iZXIsIGlzU3RyaW5nLCBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cywgaXNVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFJlbmRlckxpbmVOdW1iZXJzVHlwZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvclJhbmdlIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGVudERlY29yYXRpb25SZW5kZXJPcHRpb25zLCBJRGVjb3JhdGlvbk9wdGlvbnMsIElEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucywgSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyBlbmNvZGVkVG9rZW5BdHRyaWJ1dGVzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZVNlbGVjdG9yIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VTZWxlY3Rvci5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSVJlbGF0ZWRJbmZvcm1hdGlvbiwgTWFya2VyU2V2ZXJpdHksIE1hcmtlclRhZyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NMb2NhdGlvbiBhcyBNYWluUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVZpZXdCYWRnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eSwgSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0LCBJQ2hhdENvZGVDaXRhdGlvbiwgSUNoYXRDb21tYW5kQnV0dG9uLCBJQ2hhdENvbmZpcm1hdGlvbiwgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlLCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UsIElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQsIElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSwgSUNoYXRGb2xsb3d1cCwgSUNoYXRIb29rUGFydCwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0TW92ZU1lc3NhZ2UsIElDaGF0TXVsdGlEaWZmRGF0YVNlcmlhbGl6ZWQsIElDaGF0UHJvZ3Jlc3NNZXNzYWdlLCBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCwgSUNoYXRRdWVzdGlvbkNhcm91c2VsLCBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCwgSUNoYXRUYXNrRHRvLCBJQ2hhdFRhc2tSZXN1bHQsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VGV4dEVkaXQsIElDaGF0VGhpbmtpbmdQYXJ0LCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgSUNoYXRUcmVlRGF0YSwgSUNoYXRVc2VyQWN0aW9uRXZlbnQsIElDaGF0Vm9pY2VQcm9ncmVzc1BhcnQsIElDaGF0V2FybmluZ01lc3NhZ2UsIElDaGF0SW5mb01lc3NhZ2UsIElDaGF0V29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeSwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgaXNFbGVtZW50VmFyaWFibGVFbnRyeSwgaXNJbWFnZVZhcmlhYmxlRW50cnksIGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnksIGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgY29lcmNlSW1hZ2VCdWZmZXIgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRJbWFnZUV4dHJhY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbkl0ZW0gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdEhvb2tzLCByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgdHlwZSBJUGFyc2VkSG9va0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgSVRvb2xJbnZvY2F0aW9uQ29udGV4dCwgSVRvb2xSZXN1bHQsIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBJVG9vbFJlc3VsdE91dHB1dERldGFpbHMsIFRvb2xEYXRhU291cmNlLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBjaGF0UHJvdmlkZXIgZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1lc3NhZ2VEYXRhUGFydCwgSUNoYXRSZXNwb25zZURhdGFQYXJ0LCBJQ2hhdFJlc3BvbnNlUHJvbXB0VHN4UGFydCwgSUNoYXRSZXNwb25zZVRleHRQYXJ0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1RyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSwgSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyRGVmaW5pdGlvbiBhcyBNY3BTZXJ2ZXJEZWZpbml0aW9uVHlwZSwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5vdGVib29rcyBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBJbnB1dFZhbGlkYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgKiBhcyBzZWFyY2ggZnJvbSAnLi4vLi4vY29udHJpYi9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBDb3ZlcmFnZURldGFpbHMsIERldGFpbFR5cGUsIElDb3ZlcmFnZUNvdW50LCBJRmlsZUNvdmVyYWdlLCBJU2VyaWFsaXplZFRlc3RSZXN1bHRzLCBJVGVzdEVycm9yTWVzc2FnZSwgSVRlc3RJdGVtLCBJVGVzdFJ1blByb2ZpbGVSZWZlcmVuY2UsIElUZXN0VGFnLCBUZXN0TWVzc2FnZVR5cGUsIFRlc3RSZXN1bHRJdGVtLCBUZXN0UnVuUHJvZmlsZUJpdHNldCwgZGVuYW1lc3BhY2VUZXN0VGFnLCBuYW1lc3BhY2VUZXN0VGFnIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgQWlTZXR0aW5nc1NlYXJjaFJlc3VsdCwgQWlTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9haVNldHRpbmdzU2VhcmNoL2NvbW1vbi9haVNldHRpbmdzU2VhcmNoLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBEdG8sIFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNDb252ZXJ0ZXIgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRQcml2YXRlQXBpRm9yIH0gZnJvbSAnLi9leHRIb3N0VGVzdGluZ1ByaXZhdGVBcGkuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0LCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCwgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuXG5leHBvcnQgbmFtZXNwYWNlIENvbW1hbmQge1xuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRzQ29udmVydGVyIHtcblx0XHRmcm9tSW50ZXJuYWwoY29tbWFuZDogZXh0SG9zdFByb3RvY29sLklDb21tYW5kRHRvKTogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQ7XG5cdFx0dG9JbnRlcm5hbChjb21tYW5kOiB2c2NvZGUuQ29tbWFuZCB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byB8IHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvc2l0aW9uTGlrZSB7XG5cdGxpbmU6IG51bWJlcjtcblx0Y2hhcmFjdGVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmFuZ2VMaWtlIHtcblx0c3RhcnQ6IFBvc2l0aW9uTGlrZTtcblx0ZW5kOiBQb3NpdGlvbkxpa2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uTGlrZSBleHRlbmRzIFJhbmdlTGlrZSB7XG5cdGFuY2hvcjogUG9zaXRpb25MaWtlO1xuXHRhY3RpdmU6IFBvc2l0aW9uTGlrZTtcbn1cbmV4cG9ydCBuYW1lc3BhY2UgU2VsZWN0aW9uIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oc2VsZWN0aW9uOiBJU2VsZWN0aW9uKTogdHlwZXMuU2VsZWN0aW9uIHtcblx0XHRjb25zdCB7IHNlbGVjdGlvblN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uU3RhcnRDb2x1bW4sIHBvc2l0aW9uTGluZU51bWJlciwgcG9zaXRpb25Db2x1bW4gfSA9IHNlbGVjdGlvbjtcblx0XHRjb25zdCBzdGFydCA9IG5ldyB0eXBlcy5Qb3NpdGlvbihzZWxlY3Rpb25TdGFydExpbmVOdW1iZXIgLSAxLCBzZWxlY3Rpb25TdGFydENvbHVtbiAtIDEpO1xuXHRcdGNvbnN0IGVuZCA9IG5ldyB0eXBlcy5Qb3NpdGlvbihwb3NpdGlvbkxpbmVOdW1iZXIgLSAxLCBwb3NpdGlvbkNvbHVtbiAtIDEpO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuU2VsZWN0aW9uKHN0YXJ0LCBlbmQpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oc2VsZWN0aW9uOiBTZWxlY3Rpb25MaWtlKTogSVNlbGVjdGlvbiB7XG5cdFx0Y29uc3QgeyBhbmNob3IsIGFjdGl2ZSB9ID0gc2VsZWN0aW9uO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IGFuY2hvci5saW5lICsgMSxcblx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBhbmNob3IuY2hhcmFjdGVyICsgMSxcblx0XHRcdHBvc2l0aW9uTGluZU51bWJlcjogYWN0aXZlLmxpbmUgKyAxLFxuXHRcdFx0cG9zaXRpb25Db2x1bW46IGFjdGl2ZS5jaGFyYWN0ZXIgKyAxXG5cdFx0fTtcblx0fVxufVxuZXhwb3J0IG5hbWVzcGFjZSBSYW5nZSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmFuZ2U6IHVuZGVmaW5lZCk6IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmFuZ2U6IFJhbmdlTGlrZSk6IGVkaXRvclJhbmdlLklSYW5nZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmFuZ2U6IFJhbmdlTGlrZSB8IHVuZGVmaW5lZCk6IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmFuZ2U6IFJhbmdlTGlrZSB8IHVuZGVmaW5lZCk6IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyBzdGFydCwgZW5kIH0gPSByYW5nZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydC5saW5lICsgMSxcblx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydC5jaGFyYWN0ZXIgKyAxLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogZW5kLmxpbmUgKyAxLFxuXHRcdFx0ZW5kQ29sdW1uOiBlbmQuY2hhcmFjdGVyICsgMVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmFuZ2U6IHVuZGVmaW5lZCk6IHR5cGVzLlJhbmdlO1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmFuZ2U6IGVkaXRvclJhbmdlLklSYW5nZSk6IHR5cGVzLlJhbmdlO1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmFuZ2U6IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZCk6IHR5cGVzLlJhbmdlIHwgdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmFuZ2U6IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZCk6IHR5cGVzLlJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiB9ID0gcmFuZ2U7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5SYW5nZShzdGFydExpbmVOdW1iZXIgLSAxLCBzdGFydENvbHVtbiAtIDEsIGVuZExpbmVOdW1iZXIgLSAxLCBlbmRDb2x1bW4gLSAxKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExvY2F0aW9uIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShsb2NhdGlvbjogdnNjb2RlLkxvY2F0aW9uKTogRHRvPGxhbmd1YWdlcy5Mb2NhdGlvbj4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IGxvY2F0aW9uLnVyaSxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGxvY2F0aW9uLnJhbmdlKVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8obG9jYXRpb246IER0bzxsYW5ndWFnZXMuTG9jYXRpb24+KTogdnNjb2RlLkxvY2F0aW9uIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5yZXZpdmUobG9jYXRpb24udXJpKSwgUmFuZ2UudG8obG9jYXRpb24ucmFuZ2UpKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRva2VuVHlwZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh0eXBlOiBlbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLlN0YW5kYXJkVG9rZW5UeXBlKTogdHlwZXMuU3RhbmRhcmRUb2tlblR5cGUge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBlbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLlN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQ6IHJldHVybiB0eXBlcy5TdGFuZGFyZFRva2VuVHlwZS5Db21tZW50O1xuXHRcdFx0Y2FzZSBlbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLlN0YW5kYXJkVG9rZW5UeXBlLk90aGVyOiByZXR1cm4gdHlwZXMuU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI7XG5cdFx0XHRjYXNlIGVuY29kZWRUb2tlbkF0dHJpYnV0ZXMuU3RhbmRhcmRUb2tlblR5cGUuUmVnRXg6IHJldHVybiB0eXBlcy5TdGFuZGFyZFRva2VuVHlwZS5SZWdFeDtcblx0XHRcdGNhc2UgZW5jb2RlZFRva2VuQXR0cmlidXRlcy5TdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc6IHJldHVybiB0eXBlcy5TdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUG9zaXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocG9zaXRpb246IElQb3NpdGlvbik6IHR5cGVzLlBvc2l0aW9uIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLlBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIgLSAxLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwb3NpdGlvbjogdHlwZXMuUG9zaXRpb24gfCB2c2NvZGUuUG9zaXRpb24pOiBJUG9zaXRpb24ge1xuXHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmUgKyAxLCBjb2x1bW46IHBvc2l0aW9uLmNoYXJhY3RlciArIDEgfTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERvY3VtZW50U2VsZWN0b3Ige1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgdXJpVHJhbnNmb3JtZXI/OiBJVVJJVHJhbnNmb3JtZXIsIGV4dGVuc2lvbj86IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnRGaWx0ZXJEdG9bXSB7XG5cdFx0cmV0dXJuIGNvYWxlc2NlKGFzQXJyYXkodmFsdWUpLm1hcChzZWwgPT4gX2RvVHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWwsIHVyaVRyYW5zZm9ybWVyLCBleHRlbnNpb24pKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBfZG9UcmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yOiBzdHJpbmcgfCB2c2NvZGUuRG9jdW1lbnRGaWx0ZXIsIHVyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCB1bmRlZmluZWQsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkKTogZXh0SG9zdFByb3RvY29sLklEb2N1bWVudEZpbHRlckR0byB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdCRzZXJpYWxpemVkOiB0cnVlLFxuXHRcdFx0XHRsYW5ndWFnZTogc2VsZWN0b3IsXG5cdFx0XHRcdGlzQnVpbHRpbjogZXh0ZW5zaW9uPy5pc0J1aWx0aW4sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0JHNlcmlhbGl6ZWQ6IHRydWUsXG5cdFx0XHRcdGxhbmd1YWdlOiBzZWxlY3Rvci5sYW5ndWFnZSxcblx0XHRcdFx0c2NoZW1lOiBfdHJhbnNmb3JtU2NoZW1lKHNlbGVjdG9yLnNjaGVtZSwgdXJpVHJhbnNmb3JtZXIpLFxuXHRcdFx0XHRwYXR0ZXJuOiBHbG9iUGF0dGVybi5mcm9tKHNlbGVjdG9yLnBhdHRlcm4pID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXhjbHVzaXZlOiBzZWxlY3Rvci5leGNsdXNpdmUsXG5cdFx0XHRcdG5vdGVib29rVHlwZTogc2VsZWN0b3Iubm90ZWJvb2tUeXBlLFxuXHRcdFx0XHRpc0J1aWx0aW46IGV4dGVuc2lvbj8uaXNCdWlsdGluXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBfdHJhbnNmb3JtU2NoZW1lKHNjaGVtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodXJpVHJhbnNmb3JtZXIgJiYgdHlwZW9mIHNjaGVtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1cmlUcmFuc2Zvcm1lci50cmFuc2Zvcm1PdXRnb2luZ1NjaGVtZShzY2hlbWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NoZW1lO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFiU2VsZWN0b3Ige1xuXG5cdGZ1bmN0aW9uIGlzVmlld1R5cGVTZWxlY3Rvcih2YWx1ZTogdnNjb2RlLlRhYlNlbGVjdG9yKTogdmFsdWUgaXMgeyB2aWV3VHlwZTogc3RyaW5nIH0ge1xuXHRcdHJldHVybiAodmFsdWUgYXMgeyB2aWV3VHlwZT86IHN0cmluZyB9KS52aWV3VHlwZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5UYWJTZWxlY3RvciwgdXJpVHJhbnNmb3JtZXI/OiBJVVJJVHJhbnNmb3JtZXIsIGV4dGVuc2lvbj86IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IGV4dEhvc3RQcm90b2NvbC5JVGFiU2VsZWN0b3JEdG8ge1xuXHRcdGlmIChpc1ZpZXdUeXBlU2VsZWN0b3IodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4geyB2aWV3VHlwZTogdmFsdWUudmlld1R5cGUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdXJpOiBEb2N1bWVudFNlbGVjdG9yLmZyb20odmFsdWUudXJpLCB1cmlUcmFuc2Zvcm1lciwgZXh0ZW5zaW9uKSB9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGlhZ25vc3RpY1RhZyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuRGlhZ25vc3RpY1RhZyk6IE1hcmtlclRhZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSB0eXBlcy5EaWFnbm9zdGljVGFnLlVubmVjZXNzYXJ5OlxuXHRcdFx0XHRyZXR1cm4gTWFya2VyVGFnLlVubmVjZXNzYXJ5O1xuXHRcdFx0Y2FzZSB0eXBlcy5EaWFnbm9zdGljVGFnLkRlcHJlY2F0ZWQ6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJUYWcuRGVwcmVjYXRlZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IE1hcmtlclRhZyk6IHZzY29kZS5EaWFnbm9zdGljVGFnIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlIE1hcmtlclRhZy5Vbm5lY2Vzc2FyeTpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNUYWcuVW5uZWNlc3Nhcnk7XG5cdFx0XHRjYXNlIE1hcmtlclRhZy5EZXByZWNhdGVkOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuRGlhZ25vc3RpY1RhZy5EZXByZWNhdGVkO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEaWFnbm9zdGljIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5EaWFnbm9zdGljKTogSU1hcmtlckRhdGEge1xuXHRcdGxldCBjb2RlOiBzdHJpbmcgfCB7IHZhbHVlOiBzdHJpbmc7IHRhcmdldDogVVJJIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodmFsdWUuY29kZSkge1xuXHRcdFx0aWYgKGlzU3RyaW5nKHZhbHVlLmNvZGUpIHx8IGlzTnVtYmVyKHZhbHVlLmNvZGUpKSB7XG5cdFx0XHRcdGNvZGUgPSBTdHJpbmcodmFsdWUuY29kZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2RlID0ge1xuXHRcdFx0XHRcdHZhbHVlOiBTdHJpbmcodmFsdWUuY29kZS52YWx1ZSksXG5cdFx0XHRcdFx0dGFyZ2V0OiB2YWx1ZS5jb2RlLnRhcmdldCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uUmFuZ2UuZnJvbSh2YWx1ZS5yYW5nZSksXG5cdFx0XHRtZXNzYWdlOiB2YWx1ZS5tZXNzYWdlLFxuXHRcdFx0c291cmNlOiB2YWx1ZS5zb3VyY2UsXG5cdFx0XHRjb2RlLFxuXHRcdFx0c2V2ZXJpdHk6IERpYWdub3N0aWNTZXZlcml0eS5mcm9tKHZhbHVlLnNldmVyaXR5KSxcblx0XHRcdHJlbGF0ZWRJbmZvcm1hdGlvbjogdmFsdWUucmVsYXRlZEluZm9ybWF0aW9uICYmIHZhbHVlLnJlbGF0ZWRJbmZvcm1hdGlvbi5tYXAoRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbi5mcm9tKSxcblx0XHRcdHRhZ3M6IEFycmF5LmlzQXJyYXkodmFsdWUudGFncykgPyBjb2FsZXNjZSh2YWx1ZS50YWdzLm1hcChEaWFnbm9zdGljVGFnLmZyb20pKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJTWFya2VyRGF0YSk6IHZzY29kZS5EaWFnbm9zdGljIHtcblx0XHRjb25zdCByZXMgPSBuZXcgdHlwZXMuRGlhZ25vc3RpYyhSYW5nZS50byh2YWx1ZSksIHZhbHVlLm1lc3NhZ2UsIERpYWdub3N0aWNTZXZlcml0eS50byh2YWx1ZS5zZXZlcml0eSkpO1xuXHRcdHJlcy5zb3VyY2UgPSB2YWx1ZS5zb3VyY2U7XG5cdFx0cmVzLmNvZGUgPSBpc1N0cmluZyh2YWx1ZS5jb2RlKSA/IHZhbHVlLmNvZGUgOiB2YWx1ZS5jb2RlPy52YWx1ZTtcblx0XHRyZXMucmVsYXRlZEluZm9ybWF0aW9uID0gdmFsdWUucmVsYXRlZEluZm9ybWF0aW9uICYmIHZhbHVlLnJlbGF0ZWRJbmZvcm1hdGlvbi5tYXAoRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbi50byk7XG5cdFx0cmVzLnRhZ3MgPSB2YWx1ZS50YWdzICYmIGNvYWxlc2NlKHZhbHVlLnRhZ3MubWFwKERpYWdub3N0aWNUYWcudG8pKTtcblx0XHRyZXR1cm4gcmVzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbik6IElSZWxhdGVkSW5mb3JtYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5SYW5nZS5mcm9tKHZhbHVlLmxvY2F0aW9uLnJhbmdlKSxcblx0XHRcdG1lc3NhZ2U6IHZhbHVlLm1lc3NhZ2UsXG5cdFx0XHRyZXNvdXJjZTogdmFsdWUubG9jYXRpb24udXJpXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElSZWxhdGVkSW5mb3JtYXRpb24pOiB0eXBlcy5EaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkRpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24obmV3IHR5cGVzLkxvY2F0aW9uKHZhbHVlLnJlc291cmNlLCBSYW5nZS50byh2YWx1ZSkpLCB2YWx1ZS5tZXNzYWdlKTtcblx0fVxufVxuZXhwb3J0IG5hbWVzcGFjZSBEaWFnbm9zdGljU2V2ZXJpdHkge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBudW1iZXIpOiBNYXJrZXJTZXZlcml0eSB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuRXJyb3I6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5FcnJvcjtcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nO1xuXHRcdFx0Y2FzZSB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuSW5mb3JtYXRpb246XG5cdFx0XHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5JbmZvO1xuXHRcdFx0Y2FzZSB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuSGludDpcblx0XHRcdFx0cmV0dXJuIE1hcmtlclNldmVyaXR5LkhpbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5FcnJvcjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogTWFya2VyU2V2ZXJpdHkpOiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuSW5mbzpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5JbmZvcm1hdGlvbjtcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuV2FybmluZzpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5XYXJuaW5nO1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5FcnJvcjpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5FcnJvcjtcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuSGludDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5IaW50O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5FcnJvcjtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBWaWV3Q29sdW1uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oY29sdW1uPzogdnNjb2RlLlZpZXdDb2x1bW4pOiBFZGl0b3JHcm91cENvbHVtbiB7XG5cdFx0aWYgKHR5cGVvZiBjb2x1bW4gPT09ICdudW1iZXInICYmIGNvbHVtbiA+PSB0eXBlcy5WaWV3Q29sdW1uLk9uZSkge1xuXHRcdFx0cmV0dXJuIGNvbHVtbiAtIDE7IC8vIGFkanVzdCB6ZXJvIGluZGV4IChWaWV3Q29sdW1uLk9ORSA9PiAwKVxuXHRcdH1cblxuXHRcdGlmIChjb2x1bW4gPT09IHR5cGVzLlZpZXdDb2x1bW4uQmVzaWRlKSB7XG5cdFx0XHRyZXR1cm4gU0lERV9HUk9VUDtcblx0XHR9XG5cblx0XHRyZXR1cm4gQUNUSVZFX0dST1VQOyAvLyBkZWZhdWx0IGlzIGFsd2F5cyB0aGUgYWN0aXZlIGdyb3VwXG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocG9zaXRpb246IEVkaXRvckdyb3VwQ29sdW1uKTogdnNjb2RlLlZpZXdDb2x1bW4ge1xuXHRcdGlmICh0eXBlb2YgcG9zaXRpb24gPT09ICdudW1iZXInICYmIHBvc2l0aW9uID49IDApIHtcblx0XHRcdHJldHVybiBwb3NpdGlvbiArIDE7IC8vIGFkanVzdCB0byBpbmRleCAoVmlld0NvbHVtbi5PTkUgPT4gMSlcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYGludmFsaWQgJ0VkaXRvckdyb3VwQ29sdW1uJ2ApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzRGVjb3JhdGlvbk9wdGlvbnMoc29tZXRoaW5nOiBhbnkpOiBzb21ldGhpbmcgaXMgdnNjb2RlLkRlY29yYXRpb25PcHRpb25zIHtcblx0cmV0dXJuICh0eXBlb2Ygc29tZXRoaW5nLnJhbmdlICE9PSAndW5kZWZpbmVkJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RlY29yYXRpb25PcHRpb25zQXJyKHNvbWV0aGluZzogdnNjb2RlLlJhbmdlW10gfCB2c2NvZGUuRGVjb3JhdGlvbk9wdGlvbnNbXSk6IHNvbWV0aGluZyBpcyB2c2NvZGUuRGVjb3JhdGlvbk9wdGlvbnNbXSB7XG5cdGlmIChzb21ldGhpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGlzRGVjb3JhdGlvbk9wdGlvbnMoc29tZXRoaW5nWzBdKSA/IHRydWUgOiBmYWxzZTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBNYXJrZG93blN0cmluZyB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21NYW55KG1hcmt1cDogKHZzY29kZS5NYXJrZG93blN0cmluZyB8IHZzY29kZS5NYXJrZWRTdHJpbmcpW10pOiBodG1sQ29udGVudC5JTWFya2Rvd25TdHJpbmdbXSB7XG5cdFx0cmV0dXJuIG1hcmt1cC5tYXAoTWFya2Rvd25TdHJpbmcuZnJvbSk7XG5cdH1cblxuXHRpbnRlcmZhY2UgQ29kZWJsb2NrIHtcblx0XHRsYW5ndWFnZTogc3RyaW5nO1xuXHRcdHZhbHVlOiBzdHJpbmc7XG5cdH1cblxuXHRmdW5jdGlvbiBpc0NvZGVibG9jayh0aGluZzogYW55KTogdGhpbmcgaXMgQ29kZWJsb2NrIHtcblx0XHRyZXR1cm4gdGhpbmcgJiYgdHlwZW9mIHRoaW5nID09PSAnb2JqZWN0J1xuXHRcdFx0JiYgdHlwZW9mICg8Q29kZWJsb2NrPnRoaW5nKS5sYW5ndWFnZSA9PT0gJ3N0cmluZydcblx0XHRcdCYmIHR5cGVvZiAoPENvZGVibG9jaz50aGluZykudmFsdWUgPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obWFya3VwOiB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nKTogaHRtbENvbnRlbnQuSU1hcmtkb3duU3RyaW5nIHtcblx0XHRsZXQgcmVzOiBodG1sQ29udGVudC5JTWFya2Rvd25TdHJpbmc7XG5cdFx0aWYgKGlzQ29kZWJsb2NrKG1hcmt1cCkpIHtcblx0XHRcdGNvbnN0IHsgbGFuZ3VhZ2UsIHZhbHVlIH0gPSBtYXJrdXA7XG5cdFx0XHRyZXMgPSB7IHZhbHVlOiAnYGBgJyArIGxhbmd1YWdlICsgJ1xcbicgKyB2YWx1ZSArICdcXG5gYGBcXG4nIH07XG5cdFx0fSBlbHNlIGlmICh0eXBlcy5NYXJrZG93blN0cmluZy5pc01hcmtkb3duU3RyaW5nKG1hcmt1cCkpIHtcblx0XHRcdHJlcyA9IHsgdmFsdWU6IG1hcmt1cC52YWx1ZSwgaXNUcnVzdGVkOiBtYXJrdXAuaXNUcnVzdGVkLCBzdXBwb3J0VGhlbWVJY29uczogbWFya3VwLnN1cHBvcnRUaGVtZUljb25zLCBzdXBwb3J0SHRtbDogbWFya3VwLnN1cHBvcnRIdG1sLCBzdXBwb3J0QWxlcnRTeW50YXg6IG1hcmt1cC5zdXBwb3J0QWxlcnRTeW50YXgsIGJhc2VVcmk6IG1hcmt1cC5iYXNlVXJpIH07XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgbWFya3VwID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmVzID0geyB2YWx1ZTogbWFya3VwIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcyA9IHsgdmFsdWU6ICcnIH07XG5cdFx0fVxuXG5cdFx0Ly8gZXh0cmFjdCB1cmlzIGludG8gYSBzZXBhcmF0ZSBvYmplY3Rcblx0XHRjb25zdCByZXNVcmlzOiB7IFtocmVmOiBzdHJpbmddOiBVcmlDb21wb25lbnRzIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHJlcy51cmlzID0gcmVzVXJpcztcblxuXHRcdGNvbnN0IGNvbGxlY3RVcmkgPSAoeyBocmVmIH06IHsgaHJlZjogc3RyaW5nIH0pOiBzdHJpbmcgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IHVyaSA9IFVSSS5wYXJzZShocmVmLCB0cnVlKTtcblx0XHRcdFx0dXJpID0gdXJpLndpdGgoeyBxdWVyeTogX3VyaU1hc3NhZ2UodXJpLnF1ZXJ5LCByZXNVcmlzKSB9KTtcblx0XHRcdFx0cmVzVXJpc1tocmVmXSA9IHVyaTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fTtcblxuXHRcdG1hcmtlZC5tYXJrZWQud2Fsa1Rva2VucyhtYXJrZWQubWFya2VkLmxleGVyKHJlcy52YWx1ZSksIHRva2VuID0+IHtcblx0XHRcdGlmICh0b2tlbi50eXBlID09PSAnbGluaycpIHtcblx0XHRcdFx0Y29sbGVjdFVyaSh7IGhyZWY6IHRva2VuLmhyZWYgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuLnR5cGUgPT09ICdpbWFnZScpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiB0b2tlbi5ocmVmID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbGxlY3RVcmkoaHRtbENvbnRlbnQucGFyc2VIcmVmQW5kRGltZW5zaW9ucyh0b2tlbi5ocmVmKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRmdW5jdGlvbiBfdXJpTWFzc2FnZShwYXJ0OiBzdHJpbmcsIGJ1Y2tldDogeyBbbjogc3RyaW5nXTogVXJpQ29tcG9uZW50cyB9KTogc3RyaW5nIHtcblx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblx0XHRsZXQgZGF0YTogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0ZGF0YSA9IHBhcnNlKHBhcnQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGRhdGEgPSBjbG9uZUFuZENoYW5nZShkYXRhLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKHZhbHVlKSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBgX191cmlfJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDE2KS5zbGljZSgyLCA4KX1gO1xuXHRcdFx0XHRidWNrZXRba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIGtleTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWNoYW5nZWQpIHtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShkYXRhKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogaHRtbENvbnRlbnQuSU1hcmtkb3duU3RyaW5nKTogdnNjb2RlLk1hcmtkb3duU3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuTWFya2Rvd25TdHJpbmcodmFsdWUudmFsdWUsIHZhbHVlLnN1cHBvcnRUaGVtZUljb25zKTtcblx0XHRyZXN1bHQuaXNUcnVzdGVkID0gdmFsdWUuaXNUcnVzdGVkO1xuXHRcdHJlc3VsdC5zdXBwb3J0SHRtbCA9IHZhbHVlLnN1cHBvcnRIdG1sO1xuXHRcdHJlc3VsdC5zdXBwb3J0QWxlcnRTeW50YXggPSB2YWx1ZS5zdXBwb3J0QWxlcnRTeW50YXg7XG5cdFx0cmVzdWx0LmJhc2VVcmkgPSB2YWx1ZS5iYXNlVXJpID8gVVJJLmZyb20odmFsdWUuYmFzZVVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaWN0KHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsKTogdW5kZWZpbmVkIHwgc3RyaW5nIHwgaHRtbENvbnRlbnQuSU1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogTWFya2Rvd25TdHJpbmcuZnJvbSh2YWx1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZyb21SYW5nZU9yUmFuZ2VXaXRoTWVzc2FnZShyYW5nZXM6IHZzY29kZS5SYW5nZVtdIHwgdnNjb2RlLkRlY29yYXRpb25PcHRpb25zW10pOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSB7XG5cdGlmIChpc0RlY29yYXRpb25PcHRpb25zQXJyKHJhbmdlcykpIHtcblx0XHRyZXR1cm4gcmFuZ2VzLm1hcCgocik6IElEZWNvcmF0aW9uT3B0aW9ucyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShyLnJhbmdlKSxcblx0XHRcdFx0aG92ZXJNZXNzYWdlOiBBcnJheS5pc0FycmF5KHIuaG92ZXJNZXNzYWdlKVxuXHRcdFx0XHRcdD8gTWFya2Rvd25TdHJpbmcuZnJvbU1hbnkoci5ob3Zlck1lc3NhZ2UpXG5cdFx0XHRcdFx0OiAoci5ob3Zlck1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHIuaG92ZXJNZXNzYWdlKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRyZW5kZXJPcHRpb25zOiA8YW55PiAvKiBVUkkgdnMgVXJpICovci5yZW5kZXJPcHRpb25zXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiByYW5nZXMubWFwKChyKTogSURlY29yYXRpb25PcHRpb25zID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKHIpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXRoT3JVUklUb1VSSSh2YWx1ZTogc3RyaW5nIHwgVVJJKTogVVJJIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gVVJJLmZpbGUodmFsdWUpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRoZW1hYmxlRGVjb3JhdGlvbkF0dGFjaG1lbnRSZW5kZXJPcHRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3B0aW9uczogdnNjb2RlLlRoZW1hYmxlRGVjb3JhdGlvbkF0dGFjaG1lbnRSZW5kZXJPcHRpb25zKTogSUNvbnRlbnREZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnM7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50VGV4dDogb3B0aW9ucy5jb250ZW50VGV4dCxcblx0XHRcdGNvbnRlbnRJY29uUGF0aDogb3B0aW9ucy5jb250ZW50SWNvblBhdGggPyBwYXRoT3JVUklUb1VSSShvcHRpb25zLmNvbnRlbnRJY29uUGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRib3JkZXI6IG9wdGlvbnMuYm9yZGVyLFxuXHRcdFx0Ym9yZGVyQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuYm9yZGVyQ29sb3IsXG5cdFx0XHRmb250U3R5bGU6IG9wdGlvbnMuZm9udFN0eWxlLFxuXHRcdFx0Zm9udFdlaWdodDogb3B0aW9ucy5mb250V2VpZ2h0LFxuXHRcdFx0dGV4dERlY29yYXRpb246IG9wdGlvbnMudGV4dERlY29yYXRpb24sXG5cdFx0XHRjb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5jb2xvcixcblx0XHRcdGJhY2tncm91bmRDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3IsXG5cdFx0XHRtYXJnaW46IG9wdGlvbnMubWFyZ2luLFxuXHRcdFx0d2lkdGg6IG9wdGlvbnMud2lkdGgsXG5cdFx0XHRoZWlnaHQ6IG9wdGlvbnMuaGVpZ2h0LFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUaGVtYWJsZURlY29yYXRpb25SZW5kZXJPcHRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3B0aW9uczogdnNjb2RlLlRoZW1hYmxlRGVjb3JhdGlvblJlbmRlck9wdGlvbnMpOiBJVGhlbWVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnM7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuYmFja2dyb3VuZENvbG9yLFxuXHRcdFx0b3V0bGluZTogb3B0aW9ucy5vdXRsaW5lLFxuXHRcdFx0b3V0bGluZUNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLm91dGxpbmVDb2xvcixcblx0XHRcdG91dGxpbmVTdHlsZTogb3B0aW9ucy5vdXRsaW5lU3R5bGUsXG5cdFx0XHRvdXRsaW5lV2lkdGg6IG9wdGlvbnMub3V0bGluZVdpZHRoLFxuXHRcdFx0Ym9yZGVyOiBvcHRpb25zLmJvcmRlcixcblx0XHRcdGJvcmRlckNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmJvcmRlckNvbG9yLFxuXHRcdFx0Ym9yZGVyUmFkaXVzOiBvcHRpb25zLmJvcmRlclJhZGl1cyxcblx0XHRcdGJvcmRlclNwYWNpbmc6IG9wdGlvbnMuYm9yZGVyU3BhY2luZyxcblx0XHRcdGJvcmRlclN0eWxlOiBvcHRpb25zLmJvcmRlclN0eWxlLFxuXHRcdFx0Ym9yZGVyV2lkdGg6IG9wdGlvbnMuYm9yZGVyV2lkdGgsXG5cdFx0XHRmb250U3R5bGU6IG9wdGlvbnMuZm9udFN0eWxlLFxuXHRcdFx0Zm9udFdlaWdodDogb3B0aW9ucy5mb250V2VpZ2h0LFxuXHRcdFx0dGV4dERlY29yYXRpb246IG9wdGlvbnMudGV4dERlY29yYXRpb24sXG5cdFx0XHRjdXJzb3I6IG9wdGlvbnMuY3Vyc29yLFxuXHRcdFx0Y29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuY29sb3IsXG5cdFx0XHRvcGFjaXR5OiBvcHRpb25zLm9wYWNpdHksXG5cdFx0XHRsZXR0ZXJTcGFjaW5nOiBvcHRpb25zLmxldHRlclNwYWNpbmcsXG5cdFx0XHRndXR0ZXJJY29uUGF0aDogb3B0aW9ucy5ndXR0ZXJJY29uUGF0aCA/IHBhdGhPclVSSVRvVVJJKG9wdGlvbnMuZ3V0dGVySWNvblBhdGgpIDogdW5kZWZpbmVkLFxuXHRcdFx0Z3V0dGVySWNvblNpemU6IG9wdGlvbnMuZ3V0dGVySWNvblNpemUsXG5cdFx0XHRvdmVydmlld1J1bGVyQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMub3ZlcnZpZXdSdWxlckNvbG9yLFxuXHRcdFx0YmVmb3JlOiBvcHRpb25zLmJlZm9yZSA/IFRoZW1hYmxlRGVjb3JhdGlvbkF0dGFjaG1lbnRSZW5kZXJPcHRpb25zLmZyb20ob3B0aW9ucy5iZWZvcmUpIDogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXI6IG9wdGlvbnMuYWZ0ZXIgPyBUaGVtYWJsZURlY29yYXRpb25BdHRhY2htZW50UmVuZGVyT3B0aW9ucy5mcm9tKG9wdGlvbnMuYWZ0ZXIpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEZWNvcmF0aW9uUmFuZ2VCZWhhdmlvciB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB0eXBlcy5EZWNvcmF0aW9uUmFuZ2VCZWhhdmlvcik6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3Mge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgdHlwZXMuRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IuT3Blbk9wZW46XG5cdFx0XHRcdHJldHVybiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXM7XG5cdFx0XHRjYXNlIHR5cGVzLkRlY29yYXRpb25SYW5nZUJlaGF2aW9yLkNsb3NlZENsb3NlZDpcblx0XHRcdFx0cmV0dXJuIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzO1xuXHRcdFx0Y2FzZSB0eXBlcy5EZWNvcmF0aW9uUmFuZ2VCZWhhdmlvci5PcGVuQ2xvc2VkOlxuXHRcdFx0XHRyZXR1cm4gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlO1xuXHRcdFx0Y2FzZSB0eXBlcy5EZWNvcmF0aW9uUmFuZ2VCZWhhdmlvci5DbG9zZWRPcGVuOlxuXHRcdFx0XHRyZXR1cm4gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXI7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGVjb3JhdGlvblJlbmRlck9wdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShvcHRpb25zOiB2c2NvZGUuRGVjb3JhdGlvblJlbmRlck9wdGlvbnMpOiBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc1dob2xlTGluZTogb3B0aW9ucy5pc1dob2xlTGluZSxcblx0XHRcdHJhbmdlQmVoYXZpb3I6IG9wdGlvbnMucmFuZ2VCZWhhdmlvciA/IERlY29yYXRpb25SYW5nZUJlaGF2aW9yLmZyb20ob3B0aW9ucy5yYW5nZUJlaGF2aW9yKSA6IHVuZGVmaW5lZCxcblx0XHRcdG92ZXJ2aWV3UnVsZXJMYW5lOiBvcHRpb25zLm92ZXJ2aWV3UnVsZXJMYW5lLFxuXHRcdFx0bGlnaHQ6IG9wdGlvbnMubGlnaHQgPyBUaGVtYWJsZURlY29yYXRpb25SZW5kZXJPcHRpb25zLmZyb20ob3B0aW9ucy5saWdodCkgOiB1bmRlZmluZWQsXG5cdFx0XHRkYXJrOiBvcHRpb25zLmRhcmsgPyBUaGVtYWJsZURlY29yYXRpb25SZW5kZXJPcHRpb25zLmZyb20ob3B0aW9ucy5kYXJrKSA6IHVuZGVmaW5lZCxcblxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmJhY2tncm91bmRDb2xvcixcblx0XHRcdG91dGxpbmU6IG9wdGlvbnMub3V0bGluZSxcblx0XHRcdG91dGxpbmVDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5vdXRsaW5lQ29sb3IsXG5cdFx0XHRvdXRsaW5lU3R5bGU6IG9wdGlvbnMub3V0bGluZVN0eWxlLFxuXHRcdFx0b3V0bGluZVdpZHRoOiBvcHRpb25zLm91dGxpbmVXaWR0aCxcblx0XHRcdGJvcmRlcjogb3B0aW9ucy5ib3JkZXIsXG5cdFx0XHRib3JkZXJDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5ib3JkZXJDb2xvcixcblx0XHRcdGJvcmRlclJhZGl1czogb3B0aW9ucy5ib3JkZXJSYWRpdXMsXG5cdFx0XHRib3JkZXJTcGFjaW5nOiBvcHRpb25zLmJvcmRlclNwYWNpbmcsXG5cdFx0XHRib3JkZXJTdHlsZTogb3B0aW9ucy5ib3JkZXJTdHlsZSxcblx0XHRcdGJvcmRlcldpZHRoOiBvcHRpb25zLmJvcmRlcldpZHRoLFxuXHRcdFx0Zm9udFN0eWxlOiBvcHRpb25zLmZvbnRTdHlsZSxcblx0XHRcdGZvbnRXZWlnaHQ6IG9wdGlvbnMuZm9udFdlaWdodCxcblx0XHRcdHRleHREZWNvcmF0aW9uOiBvcHRpb25zLnRleHREZWNvcmF0aW9uLFxuXHRcdFx0Y3Vyc29yOiBvcHRpb25zLmN1cnNvcixcblx0XHRcdGNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmNvbG9yLFxuXHRcdFx0b3BhY2l0eTogb3B0aW9ucy5vcGFjaXR5LFxuXHRcdFx0bGV0dGVyU3BhY2luZzogb3B0aW9ucy5sZXR0ZXJTcGFjaW5nLFxuXHRcdFx0Z3V0dGVySWNvblBhdGg6IG9wdGlvbnMuZ3V0dGVySWNvblBhdGggPyBwYXRoT3JVUklUb1VSSShvcHRpb25zLmd1dHRlckljb25QYXRoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGd1dHRlckljb25TaXplOiBvcHRpb25zLmd1dHRlckljb25TaXplLFxuXHRcdFx0b3ZlcnZpZXdSdWxlckNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLm92ZXJ2aWV3UnVsZXJDb2xvcixcblx0XHRcdGJlZm9yZTogb3B0aW9ucy5iZWZvcmUgPyBUaGVtYWJsZURlY29yYXRpb25BdHRhY2htZW50UmVuZGVyT3B0aW9ucy5mcm9tKG9wdGlvbnMuYmVmb3JlKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyOiBvcHRpb25zLmFmdGVyID8gVGhlbWFibGVEZWNvcmF0aW9uQXR0YWNobWVudFJlbmRlck9wdGlvbnMuZnJvbShvcHRpb25zLmFmdGVyKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGV4dEVkaXQge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGVkaXQ6IHZzY29kZS5UZXh0RWRpdCk6IGxhbmd1YWdlcy5UZXh0RWRpdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6IGVkaXQubmV3VGV4dCxcblx0XHRcdGVvbDogZWRpdC5uZXdFb2wgJiYgRW5kT2ZMaW5lLmZyb20oZWRpdC5uZXdFb2wpLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oZWRpdC5yYW5nZSlcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGVkaXQ6IGxhbmd1YWdlcy5UZXh0RWRpdCk6IHR5cGVzLlRleHRFZGl0IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuVGV4dEVkaXQoUmFuZ2UudG8oZWRpdC5yYW5nZSksIGVkaXQudGV4dCk7XG5cdFx0cmVzdWx0Lm5ld0VvbCA9ICh0eXBlb2YgZWRpdC5lb2wgPT09ICd1bmRlZmluZWQnID8gdW5kZWZpbmVkIDogRW5kT2ZMaW5lLnRvKGVkaXQuZW9sKSkhO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBXb3Jrc3BhY2VFZGl0IHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElWZXJzaW9uSW5mb3JtYXRpb25Qcm92aWRlciB7XG5cdFx0Z2V0VGV4dERvY3VtZW50VmVyc2lvbih1cmk6IFVSSSk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRnZXROb3RlYm9va0RvY3VtZW50VmVyc2lvbih1cmk6IFVSSSk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuV29ya3NwYWNlRWRpdCwgdmVyc2lvbkluZm8/OiBJVmVyc2lvbkluZm9ybWF0aW9uUHJvdmlkZXIpOiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8ge1xuXHRcdGNvbnN0IHJlc3VsdDogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvID0ge1xuXHRcdFx0ZWRpdHM6IFtdXG5cdFx0fTtcblxuXHRcdGlmICh2YWx1ZSBpbnN0YW5jZW9mIHR5cGVzLldvcmtzcGFjZUVkaXQpIHtcblxuXHRcdFx0Ly8gY29sbGVjdCBhbGwgZmlsZXMgdGhhdCBhcmUgdG8gYmUgY3JlYXRlZCBzbyB0aGF0IHRoZWlyIHZlcnNpb25cblx0XHRcdC8vIGluZm9ybWF0aW9uIChpbiBjYXNlIHRoZXkgZXhpc3QgYXMgdGV4dCBtb2RlbCBhbHJlYWR5KSBjYW4gYmUgaWdub3JlZFxuXHRcdFx0Y29uc3QgdG9DcmVhdGUgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdmFsdWUuX2FsbEVudHJpZXMoKSkge1xuXHRcdFx0XHRpZiAoZW50cnkuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5GaWxlICYmIFVSSS5pc1VyaShlbnRyeS50bykgJiYgZW50cnkuZnJvbSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dG9DcmVhdGUuYWRkKGVudHJ5LnRvKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHZhbHVlLl9hbGxFbnRyaWVzKCkpIHtcblxuXHRcdFx0XHRpZiAoZW50cnkuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5GaWxlKSB7XG5cdFx0XHRcdFx0bGV0IGNvbnRlbnRzOiB7IHR5cGU6ICdiYXNlNjQnOyB2YWx1ZTogc3RyaW5nIH0gfCB7IHR5cGU6ICdkYXRhVHJhbnNmZXJJdGVtJzsgaWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChlbnRyeS5vcHRpb25zPy5jb250ZW50cykge1xuXHRcdFx0XHRcdFx0aWYgKEFycmF5QnVmZmVyLmlzVmlldyhlbnRyeS5vcHRpb25zLmNvbnRlbnRzKSkge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50cyA9IHsgdHlwZTogJ2Jhc2U2NCcsIHZhbHVlOiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChlbnRyeS5vcHRpb25zLmNvbnRlbnRzKSkgfTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRzID0geyB0eXBlOiAnZGF0YVRyYW5zZmVySXRlbScsIGlkOiAoZW50cnkub3B0aW9ucy5jb250ZW50cyBhcyB0eXBlcy5EYXRhVHJhbnNmZXJGaWxlKS5faXRlbUlkIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gZmlsZSBvcGVyYXRpb25cblx0XHRcdFx0XHRyZXN1bHQuZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRvbGRSZXNvdXJjZTogZW50cnkuZnJvbSxcblx0XHRcdFx0XHRcdG5ld1Jlc291cmNlOiBlbnRyeS50byxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgLi4uZW50cnkub3B0aW9ucywgY29udGVudHMgfSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBlbnRyeS5tZXRhZGF0YVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZW50cnkuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5UZXh0KSB7XG5cdFx0XHRcdFx0Ly8gdGV4dCBlZGl0c1xuXHRcdFx0XHRcdHJlc3VsdC5lZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBlbnRyeS51cmksXG5cdFx0XHRcdFx0XHR0ZXh0RWRpdDogVGV4dEVkaXQuZnJvbShlbnRyeS5lZGl0KSxcblx0XHRcdFx0XHRcdHZlcnNpb25JZDogIXRvQ3JlYXRlLmhhcyhlbnRyeS51cmkpID8gdmVyc2lvbkluZm8/LmdldFRleHREb2N1bWVudFZlcnNpb24oZW50cnkudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBlbnRyeS5tZXRhZGF0YVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGVudHJ5Ll90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuU25pcHBldCkge1xuXHRcdFx0XHRcdHJlc3VsdC5lZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBlbnRyeS51cmksXG5cdFx0XHRcdFx0XHR0ZXh0RWRpdDoge1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShlbnRyeS5yYW5nZSksXG5cdFx0XHRcdFx0XHRcdHRleHQ6IGVudHJ5LmVkaXQudmFsdWUsXG5cdFx0XHRcdFx0XHRcdGluc2VydEFzU25pcHBldDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0a2VlcFdoaXRlc3BhY2U6IGVudHJ5LmtlZXBXaGl0ZXNwYWNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dmVyc2lvbklkOiAhdG9DcmVhdGUuaGFzKGVudHJ5LnVyaSkgPyB2ZXJzaW9uSW5mbz8uZ2V0VGV4dERvY3VtZW50VmVyc2lvbihlbnRyeS51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGVudHJ5Lm1ldGFkYXRhXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChlbnRyeS5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLkNlbGwpIHtcblx0XHRcdFx0XHQvLyBjZWxsIGVkaXRcblx0XHRcdFx0XHRyZXN1bHQuZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogZW50cnkubWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZW50cnkudXJpLFxuXHRcdFx0XHRcdFx0Y2VsbEVkaXQ6IGVudHJ5LmVkaXQsXG5cdFx0XHRcdFx0XHRub3RlYm9va1ZlcnNpb25JZDogdmVyc2lvbkluZm8/LmdldE5vdGVib29rRG9jdW1lbnRWZXJzaW9uKGVudHJ5LnVyaSlcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGVudHJ5Ll90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuQ2VsbFJlcGxhY2UpIHtcblx0XHRcdFx0XHQvLyBjZWxsIHJlcGxhY2Vcblx0XHRcdFx0XHRyZXN1bHQuZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogZW50cnkubWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZW50cnkudXJpLFxuXHRcdFx0XHRcdFx0bm90ZWJvb2tWZXJzaW9uSWQ6IHZlcnNpb25JbmZvPy5nZXROb3RlYm9va0RvY3VtZW50VmVyc2lvbihlbnRyeS51cmkpLFxuXHRcdFx0XHRcdFx0Y2VsbEVkaXQ6IHtcblx0XHRcdFx0XHRcdFx0ZWRpdFR5cGU6IG5vdGVib29rcy5DZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRcdFx0aW5kZXg6IGVudHJ5LmluZGV4LFxuXHRcdFx0XHRcdFx0XHRjb3VudDogZW50cnkuY291bnQsXG5cdFx0XHRcdFx0XHRcdGNlbGxzOiBlbnRyeS5jZWxscy5tYXAoTm90ZWJvb2tDZWxsRGF0YS5mcm9tKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0bykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0Y29uc3QgZWRpdHMgPSBuZXcgUmVzb3VyY2VNYXA8KHR5cGVzLlRleHRFZGl0IHwgdHlwZXMuU25pcHBldFRleHRFZGl0KVtdPigpO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB2YWx1ZS5lZGl0cykge1xuXHRcdFx0aWYgKCg8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VUZXh0RWRpdER0bz5lZGl0KS50ZXh0RWRpdCkge1xuXG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSA8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VUZXh0RWRpdER0bz5lZGl0O1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKGl0ZW0ucmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IFJhbmdlLnRvKGl0ZW0udGV4dEVkaXQucmFuZ2UpO1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gaXRlbS50ZXh0RWRpdC50ZXh0O1xuXHRcdFx0XHRjb25zdCBpc1NuaXBwZXQgPSBpdGVtLnRleHRFZGl0Lmluc2VydEFzU25pcHBldDtcblxuXHRcdFx0XHRsZXQgZWRpdE9yU25pcHBldFRlc3Q6IHR5cGVzLlRleHRFZGl0IHwgdHlwZXMuU25pcHBldFRleHRFZGl0O1xuXHRcdFx0XHRpZiAoaXNTbmlwcGV0KSB7XG5cdFx0XHRcdFx0ZWRpdE9yU25pcHBldFRlc3QgPSB0eXBlcy5TbmlwcGV0VGV4dEVkaXQucmVwbGFjZShyYW5nZSwgbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcodGV4dCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRPclNuaXBwZXRUZXN0ID0gdHlwZXMuVGV4dEVkaXQucmVwbGFjZShyYW5nZSwgdGV4dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhcnJheSA9IGVkaXRzLmdldCh1cmkpO1xuXHRcdFx0XHRpZiAoIWFycmF5KSB7XG5cdFx0XHRcdFx0ZWRpdHMuc2V0KHVyaSwgW2VkaXRPclNuaXBwZXRUZXN0XSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXJyYXkucHVzaChlZGl0T3JTbmlwcGV0VGVzdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnJlbmFtZUZpbGUoXG5cdFx0XHRcdFx0VVJJLnJldml2ZSgoPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRmlsZUVkaXREdG8+ZWRpdCkub2xkUmVzb3VyY2UhKSxcblx0XHRcdFx0XHRVUkkucmV2aXZlKCg8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VGaWxlRWRpdER0bz5lZGl0KS5uZXdSZXNvdXJjZSEpLFxuXHRcdFx0XHRcdCg8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VGaWxlRWRpdER0bz5lZGl0KS5vcHRpb25zXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbdXJpLCBhcnJheV0gb2YgZWRpdHMpIHtcblx0XHRcdHJlc3VsdC5zZXQodXJpLCBhcnJheSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuXG5leHBvcnQgbmFtZXNwYWNlIFN5bWJvbEtpbmQge1xuXG5cdGNvbnN0IF9mcm9tTWFwcGluZzogeyBba2luZDogbnVtYmVyXTogbGFuZ3VhZ2VzLlN5bWJvbEtpbmQgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkZpbGVdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRmlsZTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuTW9kdWxlXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk1vZHVsZTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuTmFtZXNwYWNlXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk5hbWVzcGFjZTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuUGFja2FnZV0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5QYWNrYWdlO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5DbGFzc10gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5DbGFzcztcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuTWV0aG9kXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk1ldGhvZDtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuUHJvcGVydHldID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuUHJvcGVydHk7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkZpZWxkXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkZpZWxkO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5Db25zdHJ1Y3Rvcl0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5Db25zdHJ1Y3Rvcjtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuRW51bV0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5FbnVtO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5JbnRlcmZhY2VdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuSW50ZXJmYWNlO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5GdW5jdGlvbl0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5GdW5jdGlvbjtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuVmFyaWFibGVdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuVmFyaWFibGU7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkNvbnN0YW50O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5TdHJpbmddID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuU3RyaW5nO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5OdW1iZXJdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuTnVtYmVyO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5Cb29sZWFuXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkJvb2xlYW47XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkFycmF5XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkFycmF5O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5PYmplY3RdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuT2JqZWN0O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5LZXldID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuS2V5O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5OdWxsXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk51bGw7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkVudW1NZW1iZXJdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRW51bU1lbWJlcjtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuU3RydWN0XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlN0cnVjdDtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuRXZlbnRdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRXZlbnQ7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLk9wZXJhdG9yXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk9wZXJhdG9yO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5UeXBlUGFyYW1ldGVyXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlR5cGVQYXJhbWV0ZXI7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdnNjb2RlLlN5bWJvbEtpbmQpOiBsYW5ndWFnZXMuU3ltYm9sS2luZCB7XG5cdFx0cmV0dXJuIHR5cGVvZiBfZnJvbU1hcHBpbmdba2luZF0gPT09ICdudW1iZXInID8gX2Zyb21NYXBwaW5nW2tpbmRdIDogbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuUHJvcGVydHk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLlN5bWJvbEtpbmQpOiB2c2NvZGUuU3ltYm9sS2luZCB7XG5cdFx0Zm9yIChjb25zdCBrIGluIF9mcm9tTWFwcGluZykge1xuXHRcdFx0aWYgKF9mcm9tTWFwcGluZ1trXSA9PT0ga2luZCkge1xuXHRcdFx0XHRyZXR1cm4gTnVtYmVyKGspO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZXMuU3ltYm9sS2luZC5Qcm9wZXJ0eTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFN5bWJvbFRhZyB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdHlwZXMuU3ltYm9sVGFnKTogbGFuZ3VhZ2VzLlN5bWJvbFRhZyB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIHR5cGVzLlN5bWJvbFRhZy5EZXByZWNhdGVkOiByZXR1cm4gbGFuZ3VhZ2VzLlN5bWJvbFRhZy5EZXByZWNhdGVkO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhraW5kOiBsYW5ndWFnZXMuU3ltYm9sVGFnKTogdHlwZXMuU3ltYm9sVGFnIHtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLlN5bWJvbFRhZy5EZXByZWNhdGVkOiByZXR1cm4gdHlwZXMuU3ltYm9sVGFnLkRlcHJlY2F0ZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgV29ya3NwYWNlU3ltYm9sIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5mbzogdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uKTogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2wge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBpbmZvLm5hbWUsXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kLmZyb20oaW5mby5raW5kKSxcblx0XHRcdHRhZ3M6IGluZm8udGFncyAmJiBpbmZvLnRhZ3MubWFwKFN5bWJvbFRhZy5mcm9tKSxcblx0XHRcdGNvbnRhaW5lck5hbWU6IGluZm8uY29udGFpbmVyTmFtZSxcblx0XHRcdGxvY2F0aW9uOiBsb2NhdGlvbi5mcm9tKGluZm8ubG9jYXRpb24pXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2wpOiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKFxuXHRcdFx0aW5mby5uYW1lLFxuXHRcdFx0U3ltYm9sS2luZC50byhpbmZvLmtpbmQpLFxuXHRcdFx0aW5mby5jb250YWluZXJOYW1lLFxuXHRcdFx0bG9jYXRpb24udG8oaW5mby5sb2NhdGlvbilcblx0XHQpO1xuXHRcdHJlc3VsdC50YWdzID0gaW5mby50YWdzICYmIGluZm8udGFncy5tYXAoU3ltYm9sVGFnLnRvKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRG9jdW1lbnRTeW1ib2wge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpbmZvOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2wpOiBsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2wge1xuXHRcdGNvbnN0IHJlc3VsdDogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sID0ge1xuXHRcdFx0bmFtZTogaW5mby5uYW1lIHx8ICchIU1JU1NJTkc6IG5hbWUhIScsXG5cdFx0XHRkZXRhaWw6IGluZm8uZGV0YWlsLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oaW5mby5yYW5nZSksXG5cdFx0XHRzZWxlY3Rpb25SYW5nZTogUmFuZ2UuZnJvbShpbmZvLnNlbGVjdGlvblJhbmdlKSxcblx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuZnJvbShpbmZvLmtpbmQpLFxuXHRcdFx0dGFnczogaW5mby50YWdzPy5tYXAoU3ltYm9sVGFnLmZyb20pID8/IFtdXG5cdFx0fTtcblx0XHRpZiAoaW5mby5jaGlsZHJlbikge1xuXHRcdFx0cmVzdWx0LmNoaWxkcmVuID0gaW5mby5jaGlsZHJlbi5tYXAoZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGluZm86IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbCk6IHZzY29kZS5Eb2N1bWVudFN5bWJvbCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLkRvY3VtZW50U3ltYm9sKFxuXHRcdFx0aW5mby5uYW1lLFxuXHRcdFx0aW5mby5kZXRhaWwsXG5cdFx0XHRTeW1ib2xLaW5kLnRvKGluZm8ua2luZCksXG5cdFx0XHRSYW5nZS50byhpbmZvLnJhbmdlKSxcblx0XHRcdFJhbmdlLnRvKGluZm8uc2VsZWN0aW9uUmFuZ2UpLFxuXHRcdCk7XG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShpbmZvLnRhZ3MpKSB7XG5cdFx0XHRyZXN1bHQudGFncyA9IGluZm8udGFncy5tYXAoU3ltYm9sVGFnLnRvKTtcblx0XHR9XG5cdFx0aWYgKGluZm8uY2hpbGRyZW4pIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmVzdWx0LmNoaWxkcmVuID0gaW5mby5jaGlsZHJlbi5tYXAodG8pIGFzIGFueTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENhbGxIaWVyYXJjaHlJdGVtIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogZXh0SG9zdFByb3RvY29sLklDYWxsSGllcmFyY2h5SXRlbUR0byk6IHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW0oXG5cdFx0XHRTeW1ib2xLaW5kLnRvKGl0ZW0ua2luZCksXG5cdFx0XHRpdGVtLm5hbWUsXG5cdFx0XHRpdGVtLmRldGFpbCB8fCAnJyxcblx0XHRcdFVSSS5yZXZpdmUoaXRlbS51cmkpLFxuXHRcdFx0UmFuZ2UudG8oaXRlbS5yYW5nZSksXG5cdFx0XHRSYW5nZS50byhpdGVtLnNlbGVjdGlvblJhbmdlKVxuXHRcdCk7XG5cblx0XHRyZXN1bHQuX3Nlc3Npb25JZCA9IGl0ZW0uX3Nlc3Npb25JZDtcblx0XHRyZXN1bHQuX2l0ZW1JZCA9IGl0ZW0uX2l0ZW1JZDtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0sIHNlc3Npb25JZD86IHN0cmluZywgaXRlbUlkPzogc3RyaW5nKTogZXh0SG9zdFByb3RvY29sLklDYWxsSGllcmFyY2h5SXRlbUR0byB7XG5cblx0XHRzZXNzaW9uSWQgPSBzZXNzaW9uSWQgPz8gKDx0eXBlcy5DYWxsSGllcmFyY2h5SXRlbT5pdGVtKS5fc2Vzc2lvbklkO1xuXHRcdGl0ZW1JZCA9IGl0ZW1JZCA/PyAoPHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtPml0ZW0pLl9pdGVtSWQ7XG5cblx0XHRpZiAoc2Vzc2lvbklkID09PSB1bmRlZmluZWQgfHwgaXRlbUlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpdGVtJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdF9pdGVtSWQ6IGl0ZW1JZCxcblx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdGRldGFpbDogaXRlbS5kZXRhaWwsXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kLmZyb20oaXRlbS5raW5kKSxcblx0XHRcdHVyaTogaXRlbS51cmksXG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShpdGVtLnJhbmdlKSxcblx0XHRcdHNlbGVjdGlvblJhbmdlOiBSYW5nZS5mcm9tKGl0ZW0uc2VsZWN0aW9uUmFuZ2UpLFxuXHRcdFx0dGFnczogaXRlbS50YWdzPy5tYXAoU3ltYm9sVGFnLmZyb20pXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpdGVtOiBleHRIb3N0UHJvdG9jb2wuSUluY29taW5nQ2FsbER0byk6IHR5cGVzLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbChcblx0XHRcdENhbGxIaWVyYXJjaHlJdGVtLnRvKGl0ZW0uZnJvbSksXG5cdFx0XHRpdGVtLmZyb21SYW5nZXMubWFwKHIgPT4gUmFuZ2UudG8ocikpXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpdGVtOiBleHRIb3N0UHJvdG9jb2wuSU91dGdvaW5nQ2FsbER0byk6IHR5cGVzLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2FsbEhpZXJhcmNoeU91dGdvaW5nQ2FsbChcblx0XHRcdENhbGxIaWVyYXJjaHlJdGVtLnRvKGl0ZW0udG8pLFxuXHRcdFx0aXRlbS5mcm9tUmFuZ2VzLm1hcChyID0+IFJhbmdlLnRvKHIpKVxuXHRcdCk7XG5cdH1cbn1cblxuXG5leHBvcnQgbmFtZXNwYWNlIGxvY2F0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5Mb2NhdGlvbik6IGxhbmd1YWdlcy5Mb2NhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiB2YWx1ZS5yYW5nZSAmJiBSYW5nZS5mcm9tKHZhbHVlLnJhbmdlKSxcblx0XHRcdHVyaTogdmFsdWUudXJpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogZXh0SG9zdFByb3RvY29sLklMb2NhdGlvbkR0byk6IHR5cGVzLkxvY2F0aW9uIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5yZXZpdmUodmFsdWUudXJpKSwgUmFuZ2UudG8odmFsdWUucmFuZ2UpKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERlZmluaXRpb25MaW5rIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5EZWZpbml0aW9uTGluayk6IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmsge1xuXHRcdGNvbnN0IGRlZmluaXRpb25MaW5rID0gPHZzY29kZS5EZWZpbml0aW9uTGluaz52YWx1ZTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IDx2c2NvZGUuTG9jYXRpb24+dmFsdWU7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpblNlbGVjdGlvblJhbmdlOiBkZWZpbml0aW9uTGluay5vcmlnaW5TZWxlY3Rpb25SYW5nZVxuXHRcdFx0XHQ/IFJhbmdlLmZyb20oZGVmaW5pdGlvbkxpbmsub3JpZ2luU2VsZWN0aW9uUmFuZ2UpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0dXJpOiBkZWZpbml0aW9uTGluay50YXJnZXRVcmkgPyBkZWZpbml0aW9uTGluay50YXJnZXRVcmkgOiBsb2NhdGlvbi51cmksXG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShkZWZpbml0aW9uTGluay50YXJnZXRSYW5nZSA/IGRlZmluaXRpb25MaW5rLnRhcmdldFJhbmdlIDogbG9jYXRpb24ucmFuZ2UpLFxuXHRcdFx0dGFyZ2V0U2VsZWN0aW9uUmFuZ2U6IGRlZmluaXRpb25MaW5rLnRhcmdldFNlbGVjdGlvblJhbmdlXG5cdFx0XHRcdD8gUmFuZ2UuZnJvbShkZWZpbml0aW9uTGluay50YXJnZXRTZWxlY3Rpb25SYW5nZSlcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGV4dEhvc3RQcm90b2NvbC5JTG9jYXRpb25MaW5rRHRvKTogdnNjb2RlLkxvY2F0aW9uTGluayB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhcmdldFVyaTogVVJJLnJldml2ZSh2YWx1ZS51cmkpLFxuXHRcdFx0dGFyZ2V0UmFuZ2U6IFJhbmdlLnRvKHZhbHVlLnJhbmdlKSxcblx0XHRcdHRhcmdldFNlbGVjdGlvblJhbmdlOiB2YWx1ZS50YXJnZXRTZWxlY3Rpb25SYW5nZVxuXHRcdFx0XHQ/IFJhbmdlLnRvKHZhbHVlLnRhcmdldFNlbGVjdGlvblJhbmdlKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdG9yaWdpblNlbGVjdGlvblJhbmdlOiB2YWx1ZS5vcmlnaW5TZWxlY3Rpb25SYW5nZVxuXHRcdFx0XHQ/IFJhbmdlLnRvKHZhbHVlLm9yaWdpblNlbGVjdGlvblJhbmdlKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBIb3ZlciB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGhvdmVyOiB2c2NvZGUuVmVyYm9zZUhvdmVyKTogbGFuZ3VhZ2VzLkhvdmVyIHtcblx0XHRjb25zdCBjb252ZXJ0ZWRIb3ZlcjogbGFuZ3VhZ2VzLkhvdmVyID0ge1xuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oaG92ZXIucmFuZ2UpLFxuXHRcdFx0Y29udGVudHM6IE1hcmtkb3duU3RyaW5nLmZyb21NYW55KGhvdmVyLmNvbnRlbnRzKSxcblx0XHRcdGNhbkluY3JlYXNlVmVyYm9zaXR5OiBob3Zlci5jYW5JbmNyZWFzZVZlcmJvc2l0eSxcblx0XHRcdGNhbkRlY3JlYXNlVmVyYm9zaXR5OiBob3Zlci5jYW5EZWNyZWFzZVZlcmJvc2l0eSxcblx0XHR9O1xuXHRcdHJldHVybiBjb252ZXJ0ZWRIb3Zlcjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmZvOiBsYW5ndWFnZXMuSG92ZXIpOiB0eXBlcy5WZXJib3NlSG92ZXIge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gaW5mby5jb250ZW50cy5tYXAoTWFya2Rvd25TdHJpbmcudG8pO1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UudG8oaW5mby5yYW5nZSk7XG5cdFx0Y29uc3QgY2FuSW5jcmVhc2VWZXJib3NpdHkgPSBpbmZvLmNhbkluY3JlYXNlVmVyYm9zaXR5O1xuXHRcdGNvbnN0IGNhbkRlY3JlYXNlVmVyYm9zaXR5ID0gaW5mby5jYW5EZWNyZWFzZVZlcmJvc2l0eTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLlZlcmJvc2VIb3Zlcihjb250ZW50cywgcmFuZ2UsIGNhbkluY3JlYXNlVmVyYm9zaXR5LCBjYW5EZWNyZWFzZVZlcmJvc2l0eSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFdmFsdWF0YWJsZUV4cHJlc3Npb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShleHByZXNzaW9uOiB2c2NvZGUuRXZhbHVhdGFibGVFeHByZXNzaW9uKTogbGFuZ3VhZ2VzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGV4cHJlc3Npb24ucmFuZ2UpLFxuXHRcdFx0ZXhwcmVzc2lvbjogZXhwcmVzc2lvbi5leHByZXNzaW9uXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmZvOiBsYW5ndWFnZXMuRXZhbHVhdGFibGVFeHByZXNzaW9uKTogdHlwZXMuRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbihSYW5nZS50byhpbmZvLnJhbmdlKSwgaW5mby5leHByZXNzaW9uKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGluZVZhbHVlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5saW5lVmFsdWU6IHZzY29kZS5JbmxpbmVWYWx1ZSk6IGxhbmd1YWdlcy5JbmxpbmVWYWx1ZSB7XG5cdFx0aWYgKGlubGluZVZhbHVlIGluc3RhbmNlb2YgdHlwZXMuSW5saW5lVmFsdWVUZXh0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGlubGluZVZhbHVlLnJhbmdlKSxcblx0XHRcdFx0dGV4dDogaW5saW5lVmFsdWUudGV4dFxuXHRcdFx0fSBzYXRpc2ZpZXMgbGFuZ3VhZ2VzLklubGluZVZhbHVlVGV4dDtcblx0XHR9IGVsc2UgaWYgKGlubGluZVZhbHVlIGluc3RhbmNlb2YgdHlwZXMuSW5saW5lVmFsdWVWYXJpYWJsZUxvb2t1cCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3ZhcmlhYmxlJyxcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oaW5saW5lVmFsdWUucmFuZ2UpLFxuXHRcdFx0XHR2YXJpYWJsZU5hbWU6IGlubGluZVZhbHVlLnZhcmlhYmxlTmFtZSxcblx0XHRcdFx0Y2FzZVNlbnNpdGl2ZUxvb2t1cDogaW5saW5lVmFsdWUuY2FzZVNlbnNpdGl2ZUxvb2t1cFxuXHRcdFx0fSBzYXRpc2ZpZXMgbGFuZ3VhZ2VzLklubGluZVZhbHVlVmFyaWFibGVMb29rdXA7XG5cdFx0fSBlbHNlIGlmIChpbmxpbmVWYWx1ZSBpbnN0YW5jZW9mIHR5cGVzLklubGluZVZhbHVlRXZhbHVhdGFibGVFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnZXhwcmVzc2lvbicsXG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGlubGluZVZhbHVlLnJhbmdlKSxcblx0XHRcdFx0ZXhwcmVzc2lvbjogaW5saW5lVmFsdWUuZXhwcmVzc2lvblxuXHRcdFx0fSBzYXRpc2ZpZXMgbGFuZ3VhZ2VzLklubGluZVZhbHVlRXhwcmVzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duICdJbmxpbmVWYWx1ZScgdHlwZWApO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmxpbmVWYWx1ZTogbGFuZ3VhZ2VzLklubGluZVZhbHVlKTogdnNjb2RlLklubGluZVZhbHVlIHtcblx0XHRzd2l0Y2ggKGlubGluZVZhbHVlLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlOiBSYW5nZS50byhpbmxpbmVWYWx1ZS5yYW5nZSksXG5cdFx0XHRcdFx0dGV4dDogaW5saW5lVmFsdWUudGV4dFxuXHRcdFx0XHR9IHNhdGlzZmllcyB2c2NvZGUuSW5saW5lVmFsdWVUZXh0O1xuXHRcdFx0Y2FzZSAndmFyaWFibGUnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlOiBSYW5nZS50byhpbmxpbmVWYWx1ZS5yYW5nZSksXG5cdFx0XHRcdFx0dmFyaWFibGVOYW1lOiBpbmxpbmVWYWx1ZS52YXJpYWJsZU5hbWUsXG5cdFx0XHRcdFx0Y2FzZVNlbnNpdGl2ZUxvb2t1cDogaW5saW5lVmFsdWUuY2FzZVNlbnNpdGl2ZUxvb2t1cFxuXHRcdFx0XHR9IHNhdGlzZmllcyB2c2NvZGUuSW5saW5lVmFsdWVWYXJpYWJsZUxvb2t1cDtcblx0XHRcdGNhc2UgJ2V4cHJlc3Npb24nOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlOiBSYW5nZS50byhpbmxpbmVWYWx1ZS5yYW5nZSksXG5cdFx0XHRcdFx0ZXhwcmVzc2lvbjogaW5saW5lVmFsdWUuZXhwcmVzc2lvblxuXHRcdFx0XHR9IHNhdGlzZmllcyB2c2NvZGUuSW5saW5lVmFsdWVFdmFsdWF0YWJsZUV4cHJlc3Npb247XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5saW5lVmFsdWVDb250ZXh0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5saW5lVmFsdWVDb250ZXh0OiB2c2NvZGUuSW5saW5lVmFsdWVDb250ZXh0KTogZXh0SG9zdFByb3RvY29sLklJbmxpbmVWYWx1ZUNvbnRleHREdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRmcmFtZUlkOiBpbmxpbmVWYWx1ZUNvbnRleHQuZnJhbWVJZCxcblx0XHRcdHN0b3BwZWRMb2NhdGlvbjogUmFuZ2UuZnJvbShpbmxpbmVWYWx1ZUNvbnRleHQuc3RvcHBlZExvY2F0aW9uKVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5saW5lVmFsdWVDb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSUlubGluZVZhbHVlQ29udGV4dER0byk6IHR5cGVzLklubGluZVZhbHVlQ29udGV4dCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5JbmxpbmVWYWx1ZUNvbnRleHQoaW5saW5lVmFsdWVDb250ZXh0LmZyYW1lSWQsIFJhbmdlLnRvKGlubGluZVZhbHVlQ29udGV4dC5zdG9wcGVkTG9jYXRpb24pKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERvY3VtZW50SGlnaGxpZ2h0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZG9jdW1lbnRIaWdobGlnaHQ6IHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodCk6IGxhbmd1YWdlcy5Eb2N1bWVudEhpZ2hsaWdodCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGRvY3VtZW50SGlnaGxpZ2h0LnJhbmdlKSxcblx0XHRcdGtpbmQ6IGRvY3VtZW50SGlnaGxpZ2h0LmtpbmRcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhvY2N1cnJlbmNlOiBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHQpOiB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodChSYW5nZS50byhvY2N1cnJlbmNlLnJhbmdlKSwgb2NjdXJyZW5jZS5raW5kKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE11bHRpRG9jdW1lbnRIaWdobGlnaHQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShtdWx0aURvY3VtZW50SGlnaGxpZ2h0OiB2c2NvZGUuTXVsdGlEb2N1bWVudEhpZ2hsaWdodCk6IGxhbmd1YWdlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBtdWx0aURvY3VtZW50SGlnaGxpZ2h0LnVyaSxcblx0XHRcdGhpZ2hsaWdodHM6IG11bHRpRG9jdW1lbnRIaWdobGlnaHQuaGlnaGxpZ2h0cy5tYXAoRG9jdW1lbnRIaWdobGlnaHQuZnJvbSlcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKG11bHRpRG9jdW1lbnRIaWdobGlnaHQ6IGxhbmd1YWdlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0KTogdHlwZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0KFVSSS5yZXZpdmUobXVsdGlEb2N1bWVudEhpZ2hsaWdodC51cmkpLCBtdWx0aURvY3VtZW50SGlnaGxpZ2h0LmhpZ2hsaWdodHMubWFwKERvY3VtZW50SGlnaGxpZ2h0LnRvKSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb21wbGV0aW9uVHJpZ2dlcktpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25UcmlnZ2VyS2luZCkge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXI6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcjtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkNvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyRm9ySW5jb21wbGV0ZUNvbXBsZXRpb25zOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJGb3JJbmNvbXBsZXRlQ29tcGxldGlvbnM7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkNvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2U7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tcGxldGlvbkNvbnRleHQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oY29udGV4dDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25Db250ZXh0KTogdHlwZXMuQ29tcGxldGlvbkNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLnRvKGNvbnRleHQudHJpZ2dlcktpbmQpLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcjogY29udGV4dC50cmlnZ2VyQ2hhcmFjdGVyXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbXBsZXRpb25JdGVtVGFnIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShraW5kOiB0eXBlcy5Db21wbGV0aW9uSXRlbVRhZyk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVRhZyB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkNvbXBsZXRpb25JdGVtVGFnLkRlcHJlY2F0ZWQ6IHJldHVybiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1UYWcuRGVwcmVjYXRlZDtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtVGFnKTogdHlwZXMuQ29tcGxldGlvbkl0ZW1UYWcge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1UYWcuRGVwcmVjYXRlZDogcmV0dXJuIHR5cGVzLkNvbXBsZXRpb25JdGVtVGFnLkRlcHJlY2F0ZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tcGxldGlvbkNvbW1hbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjOiB2c2NvZGUuQ29tbWFuZCB8IHsgY29tbWFuZDogdnNjb2RlLkNvbW1hbmQ7IGljb246IHZzY29kZS5UaGVtZUljb24gfSwgY29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHsgY29tbWFuZDogZXh0SG9zdFByb3RvY29sLklDb21tYW5kRHRvOyBpY29uPzogbGFuZ3VhZ2VzLkljb25QYXRoIH0ge1xuXHRcdGlmICgnaWNvbicgaW4gYyAmJiAnY29tbWFuZCcgaW4gYykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29tbWFuZDogY29udmVydGVyLnRvSW50ZXJuYWwoYy5jb21tYW5kLCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdGljb246IEljb25QYXRoLmZyb21UaGVtZUljb24oYy5pY29uKVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgY29tbWFuZDogY29udmVydGVyLnRvSW50ZXJuYWwoYywgZGlzcG9zYWJsZXMpIH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb21wbGV0aW9uSXRlbUtpbmQge1xuXG5cdGNvbnN0IF9mcm9tID0gbmV3IE1hcDx0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KFtcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2RdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb24sIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb25dLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3IsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3JdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmllbGQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmllbGRdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVmFyaWFibGUsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVmFyaWFibGVdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ2xhc3MsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ2xhc3NdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuSW50ZXJmYWNlLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkludGVyZmFjZV0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5TdHJ1Y3QsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU3RydWN0XSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLk1vZHVsZSwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGVdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHldLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVW5pdCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Vbml0XSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50LCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50XSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW0sIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bV0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtTWVtYmVyLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW1NZW1iZXJdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5UZXh0LCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlRleHRdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29sb3IsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29sb3JdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmlsZSwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5GaWxlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlJlZmVyZW5jZSwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2VdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcl0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5FdmVudCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5FdmVudF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5PcGVyYXRvciwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5PcGVyYXRvcl0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5UeXBlUGFyYW1ldGVyLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlR5cGVQYXJhbWV0ZXJdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuSXNzdWUsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuSXNzdWVdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVXNlciwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Vc2VyXSxcblx0XSk7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kKTogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZCB7XG5cdFx0cmV0dXJuIF9mcm9tLmdldChraW5kKSA/PyBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5O1xuXHR9XG5cblx0Y29uc3QgX3RvID0gbmV3IE1hcDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KFtcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2QsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2RdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZ1bmN0aW9uLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb25dLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0cnVjdG9yLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3JdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmllbGRdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVmFyaWFibGVdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ2xhc3NdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkludGVyZmFjZSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkludGVyZmFjZV0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU3RydWN0LCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuU3RydWN0XSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGUsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGVdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHldLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlVuaXQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Vbml0XSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdGFudCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50XSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bV0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bU1lbWJlciwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW1NZW1iZXJdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLktleXdvcmQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlRleHRdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29sb3JdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5GaWxlXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2UsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2VdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcl0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRXZlbnQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5FdmVudF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuT3BlcmF0b3IsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5PcGVyYXRvcl0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVHlwZVBhcmFtZXRlciwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlR5cGVQYXJhbWV0ZXJdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXIsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Vc2VyXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Jc3N1ZSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLklzc3VlXSxcblx0XSk7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQpOiB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQge1xuXHRcdHJldHVybiBfdG8uZ2V0KGtpbmQpID8/IHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbXBsZXRpb25JdGVtIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oc3VnZ2VzdGlvbjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtLCBjb252ZXJ0ZXI/OiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlcik6IHR5cGVzLkNvbXBsZXRpb25JdGVtIHtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbShzdWdnZXN0aW9uLmxhYmVsKTtcblx0XHRyZXN1bHQuaW5zZXJ0VGV4dCA9IHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dDtcblx0XHRyZXN1bHQua2luZCA9IENvbXBsZXRpb25JdGVtS2luZC50byhzdWdnZXN0aW9uLmtpbmQpO1xuXHRcdHJlc3VsdC50YWdzID0gc3VnZ2VzdGlvbi50YWdzPy5tYXAoQ29tcGxldGlvbkl0ZW1UYWcudG8pO1xuXHRcdHJlc3VsdC5kZXRhaWwgPSBzdWdnZXN0aW9uLmRldGFpbDtcblx0XHRyZXN1bHQuZG9jdW1lbnRhdGlvbiA9IGh0bWxDb250ZW50LmlzTWFya2Rvd25TdHJpbmcoc3VnZ2VzdGlvbi5kb2N1bWVudGF0aW9uKSA/IE1hcmtkb3duU3RyaW5nLnRvKHN1Z2dlc3Rpb24uZG9jdW1lbnRhdGlvbikgOiBzdWdnZXN0aW9uLmRvY3VtZW50YXRpb247XG5cdFx0cmVzdWx0LnNvcnRUZXh0ID0gc3VnZ2VzdGlvbi5zb3J0VGV4dDtcblx0XHRyZXN1bHQuZmlsdGVyVGV4dCA9IHN1Z2dlc3Rpb24uZmlsdGVyVGV4dDtcblx0XHRyZXN1bHQucHJlc2VsZWN0ID0gc3VnZ2VzdGlvbi5wcmVzZWxlY3Q7XG5cdFx0cmVzdWx0LmNvbW1pdENoYXJhY3RlcnMgPSBzdWdnZXN0aW9uLmNvbW1pdENoYXJhY3RlcnM7XG5cblx0XHQvLyByYW5nZVxuXHRcdGlmIChlZGl0b3JSYW5nZS5SYW5nZS5pc0lSYW5nZShzdWdnZXN0aW9uLnJhbmdlKSkge1xuXHRcdFx0cmVzdWx0LnJhbmdlID0gUmFuZ2UudG8oc3VnZ2VzdGlvbi5yYW5nZSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygc3VnZ2VzdGlvbi5yYW5nZSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHJlc3VsdC5yYW5nZSA9IHsgaW5zZXJ0aW5nOiBSYW5nZS50byhzdWdnZXN0aW9uLnJhbmdlLmluc2VydCksIHJlcGxhY2luZzogUmFuZ2UudG8oc3VnZ2VzdGlvbi5yYW5nZS5yZXBsYWNlKSB9O1xuXHRcdH1cblxuXHRcdHJlc3VsdC5rZWVwV2hpdGVzcGFjZSA9IHR5cGVvZiBzdWdnZXN0aW9uLmluc2VydFRleHRSdWxlcyA9PT0gJ3VuZGVmaW5lZCcgPyBmYWxzZSA6IEJvb2xlYW4oc3VnZ2VzdGlvbi5pbnNlcnRUZXh0UnVsZXMgJiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5LZWVwV2hpdGVzcGFjZSk7XG5cdFx0Ly8gJ2luc2VydFRleHQnLWxvZ2ljXG5cdFx0aWYgKHR5cGVvZiBzdWdnZXN0aW9uLmluc2VydFRleHRSdWxlcyAhPT0gJ3VuZGVmaW5lZCcgJiYgc3VnZ2VzdGlvbi5pbnNlcnRUZXh0UnVsZXMgJiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQpIHtcblx0XHRcdHJlc3VsdC5pbnNlcnRUZXh0ID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoc3VnZ2VzdGlvbi5pbnNlcnRUZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0Lmluc2VydFRleHQgPSBzdWdnZXN0aW9uLmluc2VydFRleHQ7XG5cdFx0XHRyZXN1bHQudGV4dEVkaXQgPSByZXN1bHQucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSA/IG5ldyB0eXBlcy5UZXh0RWRpdChyZXN1bHQucmFuZ2UsIHJlc3VsdC5pbnNlcnRUZXh0KSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHN1Z2dlc3Rpb24uYWRkaXRpb25hbFRleHRFZGl0cyAmJiBzdWdnZXN0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdWx0LmFkZGl0aW9uYWxUZXh0RWRpdHMgPSBzdWdnZXN0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMubWFwKGUgPT4gVGV4dEVkaXQudG8oZSBhcyBsYW5ndWFnZXMuVGV4dEVkaXQpKTtcblx0XHR9XG5cdFx0cmVzdWx0LmNvbW1hbmQgPSBjb252ZXJ0ZXIgJiYgc3VnZ2VzdGlvbi5jb21tYW5kID8gY29udmVydGVyLmZyb21JbnRlcm5hbChzdWdnZXN0aW9uLmNvbW1hbmQpIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFBhcmFtZXRlckluZm9ybWF0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5mbzogdHlwZXMuUGFyYW1ldGVySW5mb3JtYXRpb24pOiBsYW5ndWFnZXMuUGFyYW1ldGVySW5mb3JtYXRpb24ge1xuXHRcdGlmICh0eXBlb2YgaW5mby5sYWJlbCAhPT0gJ3N0cmluZycgJiYgIUFycmF5LmlzQXJyYXkoaW5mby5sYWJlbCkpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgbGFiZWwnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGluZm8ubGFiZWwsXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGluZm8uZG9jdW1lbnRhdGlvbilcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmZvOiBsYW5ndWFnZXMuUGFyYW1ldGVySW5mb3JtYXRpb24pOiB0eXBlcy5QYXJhbWV0ZXJJbmZvcm1hdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBpbmZvLmxhYmVsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogaHRtbENvbnRlbnQuaXNNYXJrZG93blN0cmluZyhpbmZvLmRvY3VtZW50YXRpb24pID8gTWFya2Rvd25TdHJpbmcudG8oaW5mby5kb2N1bWVudGF0aW9uKSA6IGluZm8uZG9jdW1lbnRhdGlvblxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTaWduYXR1cmVJbmZvcm1hdGlvbiB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5mbzogdHlwZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24pOiBsYW5ndWFnZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogaW5mby5sYWJlbCxcblx0XHRcdGRvY3VtZW50YXRpb246IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoaW5mby5kb2N1bWVudGF0aW9uKSxcblx0XHRcdHBhcmFtZXRlcnM6IEFycmF5LmlzQXJyYXkoaW5mby5wYXJhbWV0ZXJzKSA/IGluZm8ucGFyYW1ldGVycy5tYXAoUGFyYW1ldGVySW5mb3JtYXRpb24uZnJvbSkgOiBbXSxcblx0XHRcdGFjdGl2ZVBhcmFtZXRlcjogaW5mby5hY3RpdmVQYXJhbWV0ZXIsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmZvOiBsYW5ndWFnZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24pOiB0eXBlcy5TaWduYXR1cmVJbmZvcm1hdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBpbmZvLmxhYmVsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogaHRtbENvbnRlbnQuaXNNYXJrZG93blN0cmluZyhpbmZvLmRvY3VtZW50YXRpb24pID8gTWFya2Rvd25TdHJpbmcudG8oaW5mby5kb2N1bWVudGF0aW9uKSA6IGluZm8uZG9jdW1lbnRhdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IEFycmF5LmlzQXJyYXkoaW5mby5wYXJhbWV0ZXJzKSA/IGluZm8ucGFyYW1ldGVycy5tYXAoUGFyYW1ldGVySW5mb3JtYXRpb24udG8pIDogW10sXG5cdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IGluZm8uYWN0aXZlUGFyYW1ldGVyLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTaWduYXR1cmVIZWxwIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShoZWxwOiB0eXBlcy5TaWduYXR1cmVIZWxwKTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHAge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY3RpdmVTaWduYXR1cmU6IGhlbHAuYWN0aXZlU2lnbmF0dXJlLFxuXHRcdFx0YWN0aXZlUGFyYW1ldGVyOiBoZWxwLmFjdGl2ZVBhcmFtZXRlcixcblx0XHRcdHNpZ25hdHVyZXM6IEFycmF5LmlzQXJyYXkoaGVscC5zaWduYXR1cmVzKSA/IGhlbHAuc2lnbmF0dXJlcy5tYXAoU2lnbmF0dXJlSW5mb3JtYXRpb24uZnJvbSkgOiBbXSxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGhlbHA6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwKTogdHlwZXMuU2lnbmF0dXJlSGVscCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGl2ZVNpZ25hdHVyZTogaGVscC5hY3RpdmVTaWduYXR1cmUsXG5cdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IGhlbHAuYWN0aXZlUGFyYW1ldGVyLFxuXHRcdFx0c2lnbmF0dXJlczogQXJyYXkuaXNBcnJheShoZWxwLnNpZ25hdHVyZXMpID8gaGVscC5zaWduYXR1cmVzLm1hcChTaWduYXR1cmVJbmZvcm1hdGlvbi50bykgOiBbXSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5sYXlIaW50IHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oY29udmVydGVyOiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlciwgaGludDogbGFuZ3VhZ2VzLklubGF5SGludCk6IHZzY29kZS5JbmxheUhpbnQge1xuXHRcdGNvbnN0IHJlcyA9IG5ldyB0eXBlcy5JbmxheUhpbnQoXG5cdFx0XHRQb3NpdGlvbi50byhoaW50LnBvc2l0aW9uKSxcblx0XHRcdHR5cGVvZiBoaW50LmxhYmVsID09PSAnc3RyaW5nJyA/IGhpbnQubGFiZWwgOiBoaW50LmxhYmVsLm1hcChJbmxheUhpbnRMYWJlbFBhcnQudG8uYmluZCh1bmRlZmluZWQsIGNvbnZlcnRlcikpLFxuXHRcdFx0aGludC5raW5kICYmIElubGF5SGludEtpbmQudG8oaGludC5raW5kKVxuXHRcdCk7XG5cdFx0cmVzLnRleHRFZGl0cyA9IGhpbnQudGV4dEVkaXRzICYmIGhpbnQudGV4dEVkaXRzLm1hcChUZXh0RWRpdC50byk7XG5cdFx0cmVzLnRvb2x0aXAgPSBodG1sQ29udGVudC5pc01hcmtkb3duU3RyaW5nKGhpbnQudG9vbHRpcCkgPyBNYXJrZG93blN0cmluZy50byhoaW50LnRvb2x0aXApIDogaGludC50b29sdGlwO1xuXHRcdHJlcy5wYWRkaW5nTGVmdCA9IGhpbnQucGFkZGluZ0xlZnQ7XG5cdFx0cmVzLnBhZGRpbmdSaWdodCA9IGhpbnQucGFkZGluZ1JpZ2h0O1xuXHRcdHJldHVybiByZXM7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJbmxheUhpbnRMYWJlbFBhcnQge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhjb252ZXJ0ZXI6IENvbW1hbmQuSUNvbW1hbmRzQ29udmVydGVyLCBwYXJ0OiBsYW5ndWFnZXMuSW5sYXlIaW50TGFiZWxQYXJ0KTogdHlwZXMuSW5sYXlIaW50TGFiZWxQYXJ0IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuSW5sYXlIaW50TGFiZWxQYXJ0KHBhcnQubGFiZWwpO1xuXHRcdHJlc3VsdC50b29sdGlwID0gaHRtbENvbnRlbnQuaXNNYXJrZG93blN0cmluZyhwYXJ0LnRvb2x0aXApXG5cdFx0XHQ/IE1hcmtkb3duU3RyaW5nLnRvKHBhcnQudG9vbHRpcClcblx0XHRcdDogcGFydC50b29sdGlwO1xuXHRcdGlmIChsYW5ndWFnZXMuQ29tbWFuZC5pcyhwYXJ0LmNvbW1hbmQpKSB7XG5cdFx0XHRyZXN1bHQuY29tbWFuZCA9IGNvbnZlcnRlci5mcm9tSW50ZXJuYWwocGFydC5jb21tYW5kKTtcblx0XHR9XG5cdFx0aWYgKHBhcnQubG9jYXRpb24pIHtcblx0XHRcdHJlc3VsdC5sb2NhdGlvbiA9IGxvY2F0aW9uLnRvKHBhcnQubG9jYXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5sYXlIaW50S2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHZzY29kZS5JbmxheUhpbnRLaW5kKTogbGFuZ3VhZ2VzLklubGF5SGludEtpbmQge1xuXHRcdHJldHVybiBraW5kO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhraW5kOiBsYW5ndWFnZXMuSW5sYXlIaW50S2luZCk6IHZzY29kZS5JbmxheUhpbnRLaW5kIHtcblx0XHRyZXR1cm4ga2luZDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERvY3VtZW50TGluayB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obGluazogdnNjb2RlLkRvY3VtZW50TGluayk6IGxhbmd1YWdlcy5JTGluayB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGxpbmsucmFuZ2UpLFxuXHRcdFx0dXJsOiBsaW5rLnRhcmdldCxcblx0XHRcdHRvb2x0aXA6IGxpbmsudG9vbHRpcFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8obGluazogbGFuZ3VhZ2VzLklMaW5rKTogdnNjb2RlLkRvY3VtZW50TGluayB7XG5cdFx0bGV0IHRhcmdldDogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChsaW5rLnVybCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGFyZ2V0ID0gdHlwZW9mIGxpbmsudXJsID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShsaW5rLnVybCwgdHJ1ZSkgOiBVUkkucmV2aXZlKGxpbmsudXJsKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLkRvY3VtZW50TGluayhSYW5nZS50byhsaW5rLnJhbmdlKSwgdGFyZ2V0KTtcblx0XHRyZXN1bHQudG9vbHRpcCA9IGxpbmsudG9vbHRpcDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29sb3JQcmVzZW50YXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oY29sb3JQcmVzZW50YXRpb246IGxhbmd1YWdlcy5JQ29sb3JQcmVzZW50YXRpb24pOiB0eXBlcy5Db2xvclByZXNlbnRhdGlvbiB7XG5cdFx0Y29uc3QgY3AgPSBuZXcgdHlwZXMuQ29sb3JQcmVzZW50YXRpb24oY29sb3JQcmVzZW50YXRpb24ubGFiZWwpO1xuXHRcdGlmIChjb2xvclByZXNlbnRhdGlvbi50ZXh0RWRpdCkge1xuXHRcdFx0Y3AudGV4dEVkaXQgPSBUZXh0RWRpdC50byhjb2xvclByZXNlbnRhdGlvbi50ZXh0RWRpdCk7XG5cdFx0fVxuXHRcdGlmIChjb2xvclByZXNlbnRhdGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzKSB7XG5cdFx0XHRjcC5hZGRpdGlvbmFsVGV4dEVkaXRzID0gY29sb3JQcmVzZW50YXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAodmFsdWUgPT4gVGV4dEVkaXQudG8odmFsdWUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNwO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oY29sb3JQcmVzZW50YXRpb246IHZzY29kZS5Db2xvclByZXNlbnRhdGlvbik6IGxhbmd1YWdlcy5JQ29sb3JQcmVzZW50YXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogY29sb3JQcmVzZW50YXRpb24ubGFiZWwsXG5cdFx0XHR0ZXh0RWRpdDogY29sb3JQcmVzZW50YXRpb24udGV4dEVkaXQgPyBUZXh0RWRpdC5mcm9tKGNvbG9yUHJlc2VudGF0aW9uLnRleHRFZGl0KSA6IHVuZGVmaW5lZCxcblx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IGNvbG9yUHJlc2VudGF0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMgPyBjb2xvclByZXNlbnRhdGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcCh2YWx1ZSA9PiBUZXh0RWRpdC5mcm9tKHZhbHVlKSkgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29sb3Ige1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oYzogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0pOiB0eXBlcy5Db2xvciB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Db2xvcihjWzBdLCBjWzFdLCBjWzJdLCBjWzNdKTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjb2xvcjogdHlwZXMuQ29sb3IpOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG5cdFx0cmV0dXJuIFtjb2xvci5yZWQsIGNvbG9yLmdyZWVuLCBjb2xvci5ibHVlLCBjb2xvci5hbHBoYV07XG5cdH1cbn1cblxuXG5leHBvcnQgbmFtZXNwYWNlIFNlbGVjdGlvblJhbmdlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob2JqOiB2c2NvZGUuU2VsZWN0aW9uUmFuZ2UpOiBsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2Uge1xuXHRcdHJldHVybiB7IHJhbmdlOiBSYW5nZS5mcm9tKG9iai5yYW5nZSkgfTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhvYmo6IGxhbmd1YWdlcy5TZWxlY3Rpb25SYW5nZSk6IHZzY29kZS5TZWxlY3Rpb25SYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShSYW5nZS50byhvYmoucmFuZ2UpKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRleHREb2N1bWVudFNhdmVSZWFzb24ge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhyZWFzb246IFNhdmVSZWFzb24pOiB2c2NvZGUuVGV4dERvY3VtZW50U2F2ZVJlYXNvbiB7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgU2F2ZVJlYXNvbi5BVVRPOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuVGV4dERvY3VtZW50U2F2ZVJlYXNvbi5BZnRlckRlbGF5O1xuXHRcdFx0Y2FzZSBTYXZlUmVhc29uLkVYUExJQ0lUOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuVGV4dERvY3VtZW50U2F2ZVJlYXNvbi5NYW51YWw7XG5cdFx0XHRjYXNlIFNhdmVSZWFzb24uRk9DVVNfQ0hBTkdFOlxuXHRcdFx0Y2FzZSBTYXZlUmVhc29uLldJTkRPV19DSEFOR0U6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5UZXh0RG9jdW1lbnRTYXZlUmVhc29uLkZvY3VzT3V0O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oc3R5bGU6IHZzY29kZS5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSk6IFJlbmRlckxpbmVOdW1iZXJzVHlwZSB7XG5cdFx0c3dpdGNoIChzdHlsZSkge1xuXHRcdFx0Y2FzZSB0eXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5PZmY6XG5cdFx0XHRcdHJldHVybiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmO1xuXHRcdFx0Y2FzZSB0eXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5SZWxhdGl2ZTpcblx0XHRcdFx0cmV0dXJuIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZTtcblx0XHRcdGNhc2UgdHlwZXMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuSW50ZXJ2YWw6XG5cdFx0XHRcdHJldHVybiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuSW50ZXJ2YWw7XG5cdFx0XHRjYXNlIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9uOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5Pbjtcblx0XHR9XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHN0eWxlOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUpOiB2c2NvZGUuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUge1xuXHRcdHN3aXRjaCAoc3R5bGUpIHtcblx0XHRcdGNhc2UgUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZjpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9mZjtcblx0XHRcdGNhc2UgUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuUmVsYXRpdmU7XG5cdFx0XHRjYXNlIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5JbnRlcnZhbDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLkludGVydmFsO1xuXHRcdFx0Y2FzZSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT246XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuT247XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRW5kT2ZMaW5lIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShlb2w6IHZzY29kZS5FbmRPZkxpbmUpOiBFbmRPZkxpbmVTZXF1ZW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVvbCA9PT0gdHlwZXMuRW5kT2ZMaW5lLkNSTEYpIHtcblx0XHRcdHJldHVybiBFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGO1xuXHRcdH0gZWxzZSBpZiAoZW9sID09PSB0eXBlcy5FbmRPZkxpbmUuTEYpIHtcblx0XHRcdHJldHVybiBFbmRPZkxpbmVTZXF1ZW5jZS5MRjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhlb2w6IEVuZE9mTGluZVNlcXVlbmNlKTogdnNjb2RlLkVuZE9mTGluZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVvbCA9PT0gRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRikge1xuXHRcdFx0cmV0dXJuIHR5cGVzLkVuZE9mTGluZS5DUkxGO1xuXHRcdH0gZWxzZSBpZiAoZW9sID09PSBFbmRPZkxpbmVTZXF1ZW5jZS5MRikge1xuXHRcdFx0cmV0dXJuIHR5cGVzLkVuZE9mTGluZS5MRjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFByb2dyZXNzTG9jYXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShsb2M6IHZzY29kZS5Qcm9ncmVzc0xvY2F0aW9uIHwgeyB2aWV3SWQ6IHN0cmluZyB9KTogTWFpblByb2dyZXNzTG9jYXRpb24gfCBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgbG9jID09PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGxvYy52aWV3SWQ7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChsb2MpIHtcblx0XHRcdGNhc2UgdHlwZXMuUHJvZ3Jlc3NMb2NhdGlvbi5Tb3VyY2VDb250cm9sOiByZXR1cm4gTWFpblByb2dyZXNzTG9jYXRpb24uU2NtO1xuXHRcdFx0Y2FzZSB0eXBlcy5Qcm9ncmVzc0xvY2F0aW9uLldpbmRvdzogcmV0dXJuIE1haW5Qcm9ncmVzc0xvY2F0aW9uLldpbmRvdztcblx0XHRcdGNhc2UgdHlwZXMuUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb246IHJldHVybiBNYWluUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb247XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biAnUHJvZ3Jlc3NMb2NhdGlvbidgKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEZvbGRpbmdSYW5nZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHI6IHZzY29kZS5Gb2xkaW5nUmFuZ2UpOiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlIHtcblx0XHRjb25zdCByYW5nZTogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZSA9IHsgc3RhcnQ6IHIuc3RhcnQgKyAxLCBlbmQ6IHIuZW5kICsgMSB9O1xuXHRcdGlmIChyLmtpbmQpIHtcblx0XHRcdHJhbmdlLmtpbmQgPSBGb2xkaW5nUmFuZ2VLaW5kLmZyb20oci5raW5kKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhyOiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlKTogdnNjb2RlLkZvbGRpbmdSYW5nZSB7XG5cdFx0Y29uc3QgcmFuZ2U6IHZzY29kZS5Gb2xkaW5nUmFuZ2UgPSB7IHN0YXJ0OiByLnN0YXJ0IC0gMSwgZW5kOiByLmVuZCAtIDEgfTtcblx0XHRpZiAoci5raW5kKSB7XG5cdFx0XHRyYW5nZS5raW5kID0gRm9sZGluZ1JhbmdlS2luZC50byhyLmtpbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2U7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBGb2xkaW5nUmFuZ2VLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdnNjb2RlLkZvbGRpbmdSYW5nZUtpbmQgfCB1bmRlZmluZWQpOiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGtpbmQpIHtcblx0XHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0XHRjYXNlIHR5cGVzLkZvbGRpbmdSYW5nZUtpbmQuQ29tbWVudDpcblx0XHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQuQ29tbWVudDtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLkltcG9ydHM6XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLkltcG9ydHM7XG5cdFx0XHRcdGNhc2UgdHlwZXMuRm9sZGluZ1JhbmdlS2luZC5SZWdpb246XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLlJlZ2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQgfCB1bmRlZmluZWQpOiB2c2NvZGUuRm9sZGluZ1JhbmdlS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGtpbmQpIHtcblx0XHRcdHN3aXRjaCAoa2luZC52YWx1ZSkge1xuXHRcdFx0XHRjYXNlIGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQudmFsdWU6XG5cdFx0XHRcdFx0cmV0dXJuIHR5cGVzLkZvbGRpbmdSYW5nZUtpbmQuQ29tbWVudDtcblx0XHRcdFx0Y2FzZSBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzLnZhbHVlOlxuXHRcdFx0XHRcdHJldHVybiB0eXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLkltcG9ydHM7XG5cdFx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQuUmVnaW9uLnZhbHVlOlxuXHRcdFx0XHRcdHJldHVybiB0eXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLlJlZ2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRFZGl0b3JPcGVuT3B0aW9ucyBleHRlbmRzIHZzY29kZS5UZXh0RG9jdW1lbnRTaG93T3B0aW9ucyB7XG5cdGJhY2tncm91bmQ/OiBib29sZWFuO1xuXHRvdmVycmlkZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGV4dEVkaXRvck9wZW5PcHRpb25zIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShvcHRpb25zPzogVGV4dEVkaXRvck9wZW5PcHRpb25zKTogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGlubmVkOiB0eXBlb2Ygb3B0aW9ucy5wcmV2aWV3ID09PSAnYm9vbGVhbicgPyAhb3B0aW9ucy5wcmV2aWV3IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbmFjdGl2ZTogb3B0aW9ucy5iYWNrZ3JvdW5kLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBvcHRpb25zLnByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdHNlbGVjdGlvbjogdHlwZW9mIG9wdGlvbnMuc2VsZWN0aW9uID09PSAnb2JqZWN0JyA/IFJhbmdlLmZyb20ob3B0aW9ucy5zZWxlY3Rpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvdmVycmlkZTogdHlwZW9mIG9wdGlvbnMub3ZlcnJpZGUgPT09ICdib29sZWFuJyA/IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEdsb2JQYXR0ZXJuIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB2c2NvZGUuR2xvYlBhdHRlcm4pOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0bztcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogdW5kZWZpbmVkKTogdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiBudWxsKTogbnVsbDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIHwgbnVsbCB7XG5cdFx0aWYgKHBhdHRlcm4gaW5zdGFuY2VvZiB0eXBlcy5SZWxhdGl2ZVBhdHRlcm4pIHtcblx0XHRcdHJldHVybiBwYXR0ZXJuLnRvSlNPTigpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBwYXR0ZXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgaXMgc2xpZ2h0bHkgYm9ndXMgYmVjYXVzZSB3ZSBkZWNsYXJlIHRoaXMgbWV0aG9kIHRvIGFjY2VwdFxuXHRcdC8vIGB2c2NvZGUuR2xvYlBhdHRlcm5gIHdoaWNoIGNhbiBiZSBgdnNjb2RlLlJlbGF0aXZlUGF0dGVybmAgY2xhc3MsXG5cdFx0Ly8gYnV0IGdpdmVuIHdlIGNhbm5vdCBlbmZvcmNlIGNsYXNzZXMgZnJvbSBvdXIgdnNjb2RlLmQudHMsIHdlIGhhdmVcblx0XHQvLyB0byBwcm9iZSBmb3Igb2JqZWN0cyB0b29cblx0XHQvLyBSZWZzOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQwNzcxXG5cdFx0aWYgKGlzUmVsYXRpdmVQYXR0ZXJuU2hhcGUocGF0dGVybikgfHwgaXNMZWdhY3lSZWxhdGl2ZVBhdHRlcm5TaGFwZShwYXR0ZXJuKSkge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5SZWxhdGl2ZVBhdHRlcm4ocGF0dGVybi5iYXNlVXJpID8/IHBhdHRlcm4uYmFzZSwgcGF0dGVybi5wYXR0ZXJuKS50b0pTT04oKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0dGVybjsgLy8gcHJlc2VydmUgYHVuZGVmaW5lZGAgYW5kIGBudWxsYFxuXHR9XG5cblx0ZnVuY3Rpb24gaXNSZWxhdGl2ZVBhdHRlcm5TaGFwZShvYmo6IHVua25vd24pOiBvYmogaXMgeyBiYXNlOiBzdHJpbmc7IGJhc2VVcmk6IFVSSTsgcGF0dGVybjogc3RyaW5nIH0ge1xuXHRcdGNvbnN0IHJwID0gb2JqIGFzIHsgYmFzZTogc3RyaW5nOyBiYXNlVXJpOiBVUkk7IHBhdHRlcm46IHN0cmluZyB9IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRpZiAoIXJwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFVSSS5pc1VyaShycC5iYXNlVXJpKSAmJiB0eXBlb2YgcnAucGF0dGVybiA9PT0gJ3N0cmluZyc7XG5cdH1cblxuXHRmdW5jdGlvbiBpc0xlZ2FjeVJlbGF0aXZlUGF0dGVyblNoYXBlKG9iajogdW5rbm93bik6IG9iaiBpcyB7IGJhc2U6IHN0cmluZzsgcGF0dGVybjogc3RyaW5nIH0ge1xuXG5cdFx0Ly8gQmVmb3JlIDEuNjQueCwgYFJlbGF0aXZlUGF0dGVybmAgZGlkIG5vdCBoYXZlIGFueSBgYmFzZVVyaTogVXJpYFxuXHRcdC8vIHByb3BlcnR5LiBUbyBwcmVzZXJ2ZSBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB3aXRoIG9sZGVyIGV4dGVuc2lvbnNcblx0XHQvLyB3ZSBhbGxvdyB0aGlzIG9sZCBmb3JtYXQgd2hlbiBjcmVhdGluZyB0aGUgYHZzY29kZS5SZWxhdGl2ZVBhdHRlcm5gLlxuXG5cdFx0Y29uc3QgcnAgPSBvYmogYXMgeyBiYXNlOiBzdHJpbmc7IHBhdHRlcm46IHN0cmluZyB9IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRpZiAoIXJwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHR5cGVvZiBycC5iYXNlID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcnAucGF0dGVybiA9PT0gJ3N0cmluZyc7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGF0dGVybjogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8pOiB2c2NvZGUuR2xvYlBhdHRlcm4ge1xuXHRcdGlmICh0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBwYXR0ZXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgdHlwZXMuUmVsYXRpdmVQYXR0ZXJuKFVSSS5yZXZpdmUocGF0dGVybi5iYXNlVXJpKSwgcGF0dGVybi5wYXR0ZXJuKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlU2VsZWN0b3Ige1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHNlbGVjdG9yOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3Rvcik6IGxhbmd1YWdlU2VsZWN0b3IuTGFuZ3VhZ2VTZWxlY3Rvcjtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yIHwgdW5kZWZpbmVkKTogbGFuZ3VhZ2VTZWxlY3Rvci5MYW5ndWFnZVNlbGVjdG9yIHwgdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IgfCB1bmRlZmluZWQpOiBsYW5ndWFnZVNlbGVjdG9yLkxhbmd1YWdlU2VsZWN0b3IgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc2VsZWN0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNlbGVjdG9yKSkge1xuXHRcdFx0cmV0dXJuIDxsYW5ndWFnZVNlbGVjdG9yLkxhbmd1YWdlU2VsZWN0b3I+c2VsZWN0b3IubWFwKGZyb20pO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHNlbGVjdG9yID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHNlbGVjdG9yO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBzZWxlY3RvciBhcyB2c2NvZGUuRG9jdW1lbnRGaWx0ZXI7IC8vIFRPRE86IG1pY3Jvc29mdC9UeXBlU2NyaXB0IzQyNzY4XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYW5ndWFnZTogZmlsdGVyLmxhbmd1YWdlLFxuXHRcdFx0XHRzY2hlbWU6IGZpbHRlci5zY2hlbWUsXG5cdFx0XHRcdHBhdHRlcm46IEdsb2JQYXR0ZXJuLmZyb20oZmlsdGVyLnBhdHRlcm4pID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXhjbHVzaXZlOiBmaWx0ZXIuZXhjbHVzaXZlLFxuXHRcdFx0XHRub3RlYm9va1R5cGU6IGZpbHRlci5ub3RlYm9va1R5cGVcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tSYW5nZSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmFuZ2U6IHZzY29kZS5Ob3RlYm9va1JhbmdlKTogSUNlbGxSYW5nZSB7XG5cdFx0cmV0dXJuIHsgc3RhcnQ6IHJhbmdlLnN0YXJ0LCBlbmQ6IHJhbmdlLmVuZCB9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJhbmdlOiBJQ2VsbFJhbmdlKTogdHlwZXMuTm90ZWJvb2tSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Ob3RlYm9va1JhbmdlKHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhkYXRhOiBub3RlYm9va3MuTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSk6IHZzY29kZS5Ob3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGltaW5nOiB0eXBlb2YgZGF0YS5ydW5TdGFydFRpbWUgPT09ICdudW1iZXInICYmIHR5cGVvZiBkYXRhLnJ1bkVuZFRpbWUgPT09ICdudW1iZXInID8geyBzdGFydFRpbWU6IGRhdGEucnVuU3RhcnRUaW1lLCBlbmRUaW1lOiBkYXRhLnJ1bkVuZFRpbWUgfSA6IHVuZGVmaW5lZCxcblx0XHRcdGV4ZWN1dGlvbk9yZGVyOiBkYXRhLmV4ZWN1dGlvbk9yZGVyLFxuXHRcdFx0c3VjY2VzczogZGF0YS5sYXN0UnVuU3VjY2Vzc1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShkYXRhOiB2c2NvZGUuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeSk6IFBhcnRpYWw8bm90ZWJvb2tzLk5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFzdFJ1blN1Y2Nlc3M6IGRhdGEuc3VjY2Vzcyxcblx0XHRcdHJ1blN0YXJ0VGltZTogZGF0YS50aW1pbmc/LnN0YXJ0VGltZSxcblx0XHRcdHJ1bkVuZFRpbWU6IGRhdGEudGltaW5nPy5lbmRUaW1lLFxuXHRcdFx0ZXhlY3V0aW9uT3JkZXI6IGRhdGEuZXhlY3V0aW9uT3JkZXJcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tDZWxsS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGRhdGE6IHZzY29kZS5Ob3RlYm9va0NlbGxLaW5kKTogbm90ZWJvb2tzLkNlbGxLaW5kIHtcblx0XHRzd2l0Y2ggKGRhdGEpIHtcblx0XHRcdGNhc2UgdHlwZXMuTm90ZWJvb2tDZWxsS2luZC5NYXJrdXA6XG5cdFx0XHRcdHJldHVybiBub3RlYm9va3MuQ2VsbEtpbmQuTWFya3VwO1xuXHRcdFx0Y2FzZSB0eXBlcy5Ob3RlYm9va0NlbGxLaW5kLkNvZGU6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbm90ZWJvb2tzLkNlbGxLaW5kLkNvZGU7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGRhdGE6IG5vdGVib29rcy5DZWxsS2luZCk6IHZzY29kZS5Ob3RlYm9va0NlbGxLaW5kIHtcblx0XHRzd2l0Y2ggKGRhdGEpIHtcblx0XHRcdGNhc2Ugbm90ZWJvb2tzLkNlbGxLaW5kLk1hcmt1cDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLk5vdGVib29rQ2VsbEtpbmQuTWFya3VwO1xuXHRcdFx0Y2FzZSBub3RlYm9va3MuQ2VsbEtpbmQuQ29kZTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5Ob3RlYm9va0NlbGxLaW5kLkNvZGU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tEYXRhIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShkYXRhOiB2c2NvZGUuTm90ZWJvb2tEYXRhKTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rRGF0YUR0byB7XG5cdFx0Y29uc3QgcmVzOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tEYXRhRHRvID0ge1xuXHRcdFx0bWV0YWRhdGE6IGRhdGEubWV0YWRhdGEgPz8gT2JqZWN0LmNyZWF0ZShudWxsKSxcblx0XHRcdGNlbGxzOiBbXSxcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBkYXRhLmNlbGxzKSB7XG5cdFx0XHR0eXBlcy5Ob3RlYm9va0NlbGxEYXRhLnZhbGlkYXRlKGNlbGwpO1xuXHRcdFx0cmVzLmNlbGxzLnB1c2goTm90ZWJvb2tDZWxsRGF0YS5mcm9tKGNlbGwpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhkYXRhOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tEYXRhRHRvKTogdnNjb2RlLk5vdGVib29rRGF0YSB7XG5cdFx0Y29uc3QgcmVzID0gbmV3IHR5cGVzLk5vdGVib29rRGF0YShcblx0XHRcdGRhdGEuY2VsbHMubWFwKE5vdGVib29rQ2VsbERhdGEudG8pLFxuXHRcdCk7XG5cdFx0aWYgKCFpc0VtcHR5T2JqZWN0KGRhdGEubWV0YWRhdGEpKSB7XG5cdFx0XHRyZXMubWV0YWRhdGEgPSBkYXRhLm1ldGFkYXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tDZWxsRGF0YSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZGF0YTogdnNjb2RlLk5vdGVib29rQ2VsbERhdGEpOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tDZWxsRGF0YUR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNlbGxLaW5kOiBOb3RlYm9va0NlbGxLaW5kLmZyb20oZGF0YS5raW5kKSxcblx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlSWQsXG5cdFx0XHRtaW1lOiBkYXRhLm1pbWUsXG5cdFx0XHRzb3VyY2U6IGRhdGEudmFsdWUsXG5cdFx0XHRtZXRhZGF0YTogZGF0YS5tZXRhZGF0YSxcblx0XHRcdGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN1bW1hcnkuZnJvbShkYXRhLmV4ZWN1dGlvblN1bW1hcnkgPz8ge30pLFxuXHRcdFx0b3V0cHV0czogZGF0YS5vdXRwdXRzID8gZGF0YS5vdXRwdXRzLm1hcChOb3RlYm9va0NlbGxPdXRwdXQuZnJvbSkgOiBbXVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oZGF0YTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbERhdGFEdG8pOiB2c2NvZGUuTm90ZWJvb2tDZWxsRGF0YSB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Ob3RlYm9va0NlbGxEYXRhKFxuXHRcdFx0Tm90ZWJvb2tDZWxsS2luZC50byhkYXRhLmNlbGxLaW5kKSxcblx0XHRcdGRhdGEuc291cmNlLFxuXHRcdFx0ZGF0YS5sYW5ndWFnZSxcblx0XHRcdGRhdGEubWltZSxcblx0XHRcdGRhdGEub3V0cHV0cyA/IGRhdGEub3V0cHV0cy5tYXAoTm90ZWJvb2tDZWxsT3V0cHV0LnRvKSA6IHVuZGVmaW5lZCxcblx0XHRcdGRhdGEubWV0YWRhdGEsXG5cdFx0XHRkYXRhLmludGVybmFsTWV0YWRhdGEgPyBOb3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5LnRvKGRhdGEuaW50ZXJuYWxNZXRhZGF0YSkgOiB1bmRlZmluZWRcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tDZWxsT3V0cHV0SXRlbSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0pOiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tPdXRwdXRJdGVtRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWltZTogaXRlbS5taW1lLFxuXHRcdFx0dmFsdWVCeXRlczogVlNCdWZmZXIud3JhcChpdGVtLmRhdGEpLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rT3V0cHV0SXRlbUR0byk6IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0ge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbShpdGVtLnZhbHVlQnl0ZXMuYnVmZmVyLCBpdGVtLm1pbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tDZWxsT3V0cHV0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3V0cHV0OiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0KTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rT3V0cHV0RHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3V0cHV0SWQ6IG91dHB1dC5pZCxcblx0XHRcdGl0ZW1zOiBvdXRwdXQuaXRlbXMubWFwKE5vdGVib29rQ2VsbE91dHB1dEl0ZW0uZnJvbSksXG5cdFx0XHRtZXRhZGF0YTogb3V0cHV0Lm1ldGFkYXRhXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhvdXRwdXQ6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dER0byk6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXQge1xuXHRcdGNvbnN0IGl0ZW1zID0gb3V0cHV0Lml0ZW1zLm1hcChOb3RlYm9va0NlbGxPdXRwdXRJdGVtLnRvKTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dChpdGVtcywgb3V0cHV0Lm91dHB1dElkLCBvdXRwdXQubWV0YWRhdGEpO1xuXHR9XG59XG5cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50UGF0dGVybiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHsgaW5jbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkOyBleGNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm4gfCB1bmRlZmluZWQgfSk6IHsgaW5jbHVkZTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB1bmRlZmluZWQ7IGV4Y2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIH07XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHZzY29kZS5HbG9iUGF0dGVybik6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHsgaW5jbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIHwgbnVsbDsgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIH0gfCB2c2NvZGUuR2xvYlBhdHRlcm4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHsgaW5jbHVkZTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB1bmRlZmluZWQ7IGV4Y2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHsgaW5jbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIHwgbnVsbDsgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIH0gfCB2c2NvZGUuR2xvYlBhdHRlcm4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHsgaW5jbHVkZTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB1bmRlZmluZWQ7IGV4Y2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc0V4Y2x1c2l2ZVBhdHRlcm4ocGF0dGVybikpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluY2x1ZGU6IEdsb2JQYXR0ZXJuLmZyb20ocGF0dGVybi5pbmNsdWRlKSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGV4Y2x1ZGU6IEdsb2JQYXR0ZXJuLmZyb20ocGF0dGVybi5leGNsdWRlKSA/PyB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBHbG9iUGF0dGVybi5mcm9tKHBhdHRlcm4pID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXR0ZXJuOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHsgaW5jbHVkZTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG87IGV4Y2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIH0pOiB7IGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybjsgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIH0gfCB2c2NvZGUuR2xvYlBhdHRlcm4ge1xuXHRcdGlmIChpc0V4Y2x1c2l2ZVBhdHRlcm4ocGF0dGVybikpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluY2x1ZGU6IEdsb2JQYXR0ZXJuLnRvKHBhdHRlcm4uaW5jbHVkZSksXG5cdFx0XHRcdGV4Y2x1ZGU6IEdsb2JQYXR0ZXJuLnRvKHBhdHRlcm4uZXhjbHVkZSlcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEdsb2JQYXR0ZXJuLnRvKHBhdHRlcm4pO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNFeGNsdXNpdmVQYXR0ZXJuPFQ+KG9iajogYW55KTogb2JqIGlzIHsgaW5jbHVkZT86IFQ7IGV4Y2x1ZGU/OiBUIH0ge1xuXHRcdGNvbnN0IGVwID0gb2JqIGFzIHsgaW5jbHVkZT86IFQ7IGV4Y2x1ZGU/OiBUIH0gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRcdGlmICghZXApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICFpc1VuZGVmaW5lZE9yTnVsbChlcC5pbmNsdWRlKSAmJiAhaXNVbmRlZmluZWRPck51bGwoZXAuZXhjbHVkZSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va1N0YXR1c0Jhckl0ZW0ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmQuSUNvbW1hbmRzQ29udmVydGVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogbm90ZWJvb2tzLklOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtIHtcblx0XHRjb25zdCBjb21tYW5kID0gdHlwZW9mIGl0ZW0uY29tbWFuZCA9PT0gJ3N0cmluZycgPyB7IHRpdGxlOiAnJywgY29tbWFuZDogaXRlbS5jb21tYW5kIH0gOiBpdGVtLmNvbW1hbmQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFsaWdubWVudDogaXRlbS5hbGlnbm1lbnQgPT09IHR5cGVzLk5vdGVib29rQ2VsbFN0YXR1c0JhckFsaWdubWVudC5MZWZ0ID8gbm90ZWJvb2tzLkNlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCA6IG5vdGVib29rcy5DZWxsU3RhdHVzYmFyQWxpZ25tZW50LlJpZ2h0LFxuXHRcdFx0Y29tbWFuZDogY29tbWFuZHNDb252ZXJ0ZXIudG9JbnRlcm5hbChjb21tYW5kLCBkaXNwb3NhYmxlcyksIC8vIFRPRE9Acm9ibG91XG5cdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHR0b29sdGlwOiBpdGVtLnRvb2x0aXAsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb246IGl0ZW0uYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uLFxuXHRcdFx0cHJpb3JpdHk6IGl0ZW0ucHJpb3JpdHlcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24sIGNvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IG5vdGVib29rcy5JTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb24ge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB0eXBlb2YgaXRlbS5jb21tYW5kID09PSAnc3RyaW5nJyA/IHsgdGl0bGU6ICcnLCBjb21tYW5kOiBpdGVtLmNvbW1hbmQgfSA6IGl0ZW0uY29tbWFuZDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb21tYW5kOiBjb21tYW5kc0NvbnZlcnRlci50b0ludGVybmFsKGNvbW1hbmQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRkZXRhaWw6IGl0ZW0uZGV0YWlsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogaXRlbS5kb2N1bWVudGF0aW9uXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG9wdGlvbnM6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMgfCB1bmRlZmluZWQpOiBub3RlYm9va3MuVHJhbnNpZW50T3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRyYW5zaWVudE91dHB1dHM6IG9wdGlvbnM/LnRyYW5zaWVudE91dHB1dHMgPz8gZmFsc2UsXG5cdFx0XHR0cmFuc2llbnRDZWxsTWV0YWRhdGE6IG9wdGlvbnM/LnRyYW5zaWVudENlbGxNZXRhZGF0YSA/PyB7fSxcblx0XHRcdHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IG9wdGlvbnM/LnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEgPz8ge30sXG5cdFx0XHRjZWxsQ29udGVudE1ldGFkYXRhOiBvcHRpb25zPy5jZWxsQ29udGVudE1ldGFkYXRhID8/IHt9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rUmVuZGVyZXJTY3JpcHQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwcmVsb2FkOiB2c2NvZGUuTm90ZWJvb2tSZW5kZXJlclNjcmlwdCk6IHsgdXJpOiBVcmlDb21wb25lbnRzOyBwcm92aWRlczogcmVhZG9ubHkgc3RyaW5nW10gfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogcHJlbG9hZC51cmksXG5cdFx0XHRwcm92aWRlczogcHJlbG9hZC5wcm92aWRlc1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocHJlbG9hZDogeyB1cmk6IFVyaUNvbXBvbmVudHM7IHByb3ZpZGVzOiByZWFkb25seSBzdHJpbmdbXSB9KTogdnNjb2RlLk5vdGVib29rUmVuZGVyZXJTY3JpcHQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuTm90ZWJvb2tSZW5kZXJlclNjcmlwdChVUkkucmV2aXZlKHByZWxvYWQudXJpKSwgcHJlbG9hZC5wcm92aWRlcyk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0TWVzc2FnZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG1lc3NhZ2U6IHZzY29kZS5UZXN0TWVzc2FnZSk6IElUZXN0RXJyb3JNZXNzYWdlLlNlcmlhbGl6ZWQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRtZXNzYWdlOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KG1lc3NhZ2UubWVzc2FnZSkgfHwgJycsXG5cdFx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsXG5cdFx0XHRleHBlY3RlZDogbWVzc2FnZS5leHBlY3RlZE91dHB1dCxcblx0XHRcdGFjdHVhbDogbWVzc2FnZS5hY3R1YWxPdXRwdXQsXG5cdFx0XHRjb250ZXh0VmFsdWU6IG1lc3NhZ2UuY29udGV4dFZhbHVlLFxuXHRcdFx0bG9jYXRpb246IG1lc3NhZ2UubG9jYXRpb24gJiYgKHsgcmFuZ2U6IFJhbmdlLmZyb20obWVzc2FnZS5sb2NhdGlvbi5yYW5nZSksIHVyaTogbWVzc2FnZS5sb2NhdGlvbi51cmkgfSksXG5cdFx0XHRzdGFja1RyYWNlOiBtZXNzYWdlLnN0YWNrVHJhY2U/Lm1hcChzID0+ICh7XG5cdFx0XHRcdGxhYmVsOiBzLmxhYmVsLFxuXHRcdFx0XHRwb3NpdGlvbjogcy5wb3NpdGlvbiAmJiBQb3NpdGlvbi5mcm9tKHMucG9zaXRpb24pLFxuXHRcdFx0XHR1cmk6IHMudXJpICYmIFVSSS5yZXZpdmUocy51cmkpLnRvSlNPTigpLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogSVRlc3RFcnJvck1lc3NhZ2UuU2VyaWFsaXplZCk6IHZzY29kZS5UZXN0TWVzc2FnZSB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IG5ldyB0eXBlcy5UZXN0TWVzc2FnZSh0eXBlb2YgaXRlbS5tZXNzYWdlID09PSAnc3RyaW5nJyA/IGl0ZW0ubWVzc2FnZSA6IE1hcmtkb3duU3RyaW5nLnRvKGl0ZW0ubWVzc2FnZSkpO1xuXHRcdG1lc3NhZ2UuYWN0dWFsT3V0cHV0ID0gaXRlbS5hY3R1YWw7XG5cdFx0bWVzc2FnZS5leHBlY3RlZE91dHB1dCA9IGl0ZW0uZXhwZWN0ZWQ7XG5cdFx0bWVzc2FnZS5jb250ZXh0VmFsdWUgPSBpdGVtLmNvbnRleHRWYWx1ZTtcblx0XHRtZXNzYWdlLmxvY2F0aW9uID0gaXRlbS5sb2NhdGlvbiA/IGxvY2F0aW9uLnRvKGl0ZW0ubG9jYXRpb24pIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBtZXNzYWdlO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdFRhZyB7XG5cdGV4cG9ydCBjb25zdCBuYW1lc3BhY2UgPSBuYW1lc3BhY2VUZXN0VGFnO1xuXG5cdGV4cG9ydCBjb25zdCBkZW5hbWVzcGFjZSA9IGRlbmFtZXNwYWNlVGVzdFRhZztcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0UnVuUHJvZmlsZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHR5cGVzLlRlc3RSdW5Qcm9maWxlQmFzZSk6IElUZXN0UnVuUHJvZmlsZVJlZmVyZW5jZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRyb2xsZXJJZDogaXRlbS5jb250cm9sbGVySWQsXG5cdFx0XHRwcm9maWxlSWQ6IGl0ZW0ucHJvZmlsZUlkLFxuXHRcdFx0Z3JvdXA6IFRlc3RSdW5Qcm9maWxlS2luZC5mcm9tKGl0ZW0ua2luZCksXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RSdW5Qcm9maWxlS2luZCB7XG5cdGNvbnN0IHByb2ZpbGVHcm91cFRvQml0c2V0OiB7IFtLIGluIHZzY29kZS5UZXN0UnVuUHJvZmlsZUtpbmRdOiBUZXN0UnVuUHJvZmlsZUJpdHNldCB9ID0ge1xuXHRcdFt0eXBlcy5UZXN0UnVuUHJvZmlsZUtpbmQuQ292ZXJhZ2VdOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSxcblx0XHRbdHlwZXMuVGVzdFJ1blByb2ZpbGVLaW5kLkRlYnVnXTogVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsXG5cdFx0W3R5cGVzLlRlc3RSdW5Qcm9maWxlS2luZC5SdW5dOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sXG5cdH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdHlwZXMuVGVzdFJ1blByb2ZpbGVLaW5kKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQge1xuXHRcdHJldHVybiBwcm9maWxlR3JvdXBUb0JpdHNldC5oYXNPd25Qcm9wZXJ0eShraW5kKSA/IHByb2ZpbGVHcm91cFRvQml0c2V0W2tpbmRdIDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdEl0ZW0ge1xuXHRleHBvcnQgdHlwZSBSYXcgPSB2c2NvZGUuVGVzdEl0ZW07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLlRlc3RJdGVtKTogSVRlc3RJdGVtIHtcblx0XHRjb25zdCBjdHJsSWQgPSBnZXRQcml2YXRlQXBpRm9yKGl0ZW0pLmNvbnRyb2xsZXJJZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXh0SWQ6IFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKGl0ZW0sIGN0cmxJZCkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGl0ZW0udXJpKSxcblx0XHRcdGJ1c3k6IGl0ZW0uYnVzeSxcblx0XHRcdHRhZ3M6IGl0ZW0udGFncy5tYXAodCA9PiBUZXN0VGFnLm5hbWVzcGFjZShjdHJsSWQsIHQuaWQpKSxcblx0XHRcdHJhbmdlOiBlZGl0b3JSYW5nZS5SYW5nZS5saWZ0KFJhbmdlLmZyb20oaXRlbS5yYW5nZSkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24gfHwgbnVsbCxcblx0XHRcdHNvcnRUZXh0OiBpdGVtLnNvcnRUZXh0IHx8IG51bGwsXG5cdFx0XHRlcnJvcjogaXRlbS5lcnJvciA/IChNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGl0ZW0uZXJyb3IpIHx8IG51bGwpIDogbnVsbCxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvUGxhaW4oaXRlbTogSVRlc3RJdGVtLlNlcmlhbGl6ZWQpOiB2c2NvZGUuVGVzdEl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRpZDogVGVzdElkLmZyb21TdHJpbmcoaXRlbS5leHRJZCkubG9jYWxJZCxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGl0ZW0udXJpKSxcblx0XHRcdHRhZ3M6IChpdGVtLnRhZ3MgfHwgW10pLm1hcCh0ID0+IHtcblx0XHRcdFx0Y29uc3QgeyB0YWdJZCB9ID0gVGVzdFRhZy5kZW5hbWVzcGFjZSh0KTtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5UZXN0VGFnKHRhZ0lkKTtcblx0XHRcdH0pLFxuXHRcdFx0Y2hpbGRyZW46IHtcblx0XHRcdFx0YWRkOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRmb3JFYWNoOiAoKSA9PiB7IH0sXG5cdFx0XHRcdCpbU3ltYm9sLml0ZXJhdG9yXSgpIHsgfSxcblx0XHRcdFx0Z2V0OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcGxhY2U6ICgpID0+IHsgfSxcblx0XHRcdFx0c2l6ZTogMCxcblx0XHRcdH0sXG5cdFx0XHRyYW5nZTogUmFuZ2UudG8oaXRlbS5yYW5nZSB8fCB1bmRlZmluZWQpLFxuXHRcdFx0Y2FuUmVzb2x2ZUNoaWxkcmVuOiBmYWxzZSxcblx0XHRcdGJ1c3k6IGl0ZW0uYnVzeSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uIHx8IHVuZGVmaW5lZCxcblx0XHRcdHNvcnRUZXh0OiBpdGVtLnNvcnRUZXh0IHx8IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdFRhZyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRhZzogdnNjb2RlLlRlc3RUYWcpOiBJVGVzdFRhZyB7XG5cdFx0cmV0dXJuIHsgaWQ6IHRhZy5pZCB9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHRhZzogSVRlc3RUYWcpOiB2c2NvZGUuVGVzdFRhZyB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5UZXN0VGFnKHRhZy5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0UmVzdWx0cyB7XG5cdGNvbnN0IGNvbnZlcnRUZXN0UmVzdWx0SXRlbSA9IChub2RlOiBJUHJlZml4VHJlZU5vZGU8VGVzdFJlc3VsdEl0ZW0uU2VyaWFsaXplZD4sIHBhcmVudD86IHZzY29kZS5UZXN0UmVzdWx0U25hcHNob3QpOiB2c2NvZGUuVGVzdFJlc3VsdFNuYXBzaG90IHwgdW5kZWZpbmVkID0+IHtcblx0XHRjb25zdCBpdGVtID0gbm9kZS52YWx1ZTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHNob3VsZCBiZSB1bnJlYWNoYWJsZVxuXHRcdH1cblxuXHRcdGNvbnN0IHNuYXBzaG90OiB2c2NvZGUuVGVzdFJlc3VsdFNuYXBzaG90ID0gKHtcblx0XHRcdC4uLlRlc3RJdGVtLnRvUGxhaW4oaXRlbS5pdGVtKSxcblx0XHRcdHBhcmVudCxcblx0XHRcdHRhc2tTdGF0ZXM6IGl0ZW0udGFza3MubWFwKHQgPT4gKHtcblx0XHRcdFx0c3RhdGU6IHQuc3RhdGUgYXMgbnVtYmVyIGFzIHR5cGVzLlRlc3RSZXN1bHRTdGF0ZSxcblx0XHRcdFx0ZHVyYXRpb246IHQuZHVyYXRpb24sXG5cdFx0XHRcdG1lc3NhZ2VzOiB0Lm1lc3NhZ2VzXG5cdFx0XHRcdFx0LmZpbHRlcigobSk6IG0gaXMgSVRlc3RFcnJvck1lc3NhZ2UuU2VyaWFsaXplZCA9PiBtLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvcilcblx0XHRcdFx0XHQubWFwKFRlc3RNZXNzYWdlLnRvKSxcblx0XHRcdH0pKSxcblx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHR9KTtcblxuXHRcdGlmIChub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRcdFx0Y29uc3QgYyA9IGNvbnZlcnRUZXN0UmVzdWx0SXRlbShjaGlsZCwgc25hcHNob3QpO1xuXHRcdFx0XHRpZiAoYykge1xuXHRcdFx0XHRcdHNuYXBzaG90LmNoaWxkcmVuLnB1c2goYyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc25hcHNob3Q7XG5cdH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMpOiB2c2NvZGUuVGVzdFJ1blJlc3VsdCB7XG5cdFx0Y29uc3QgdHJlZSA9IG5ldyBXZWxsRGVmaW5lZFByZWZpeFRyZWU8VGVzdFJlc3VsdEl0ZW0uU2VyaWFsaXplZD4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc2VyaWFsaXplZC5pdGVtcykge1xuXHRcdFx0dHJlZS5pbnNlcnQoVGVzdElkLmZyb21TdHJpbmcoaXRlbS5pdGVtLmV4dElkKS5wYXRoLCBpdGVtKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIGZpcnN0IG5vZGUgd2l0aCBhIHZhbHVlIGluIGVhY2ggc3VidHJlZSBvZiBJRHMuXG5cdFx0Y29uc3QgcXVldWUgPSBbdHJlZS5ub2Rlc107XG5cdFx0Y29uc3Qgcm9vdHM6IElQcmVmaXhUcmVlTm9kZTxUZXN0UmVzdWx0SXRlbS5TZXJpYWxpemVkPltdID0gW107XG5cdFx0d2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHF1ZXVlLnBvcCgpISkge1xuXHRcdFx0XHRpZiAobm9kZS52YWx1ZSkge1xuXHRcdFx0XHRcdHJvb3RzLnB1c2gobm9kZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdHF1ZXVlLnB1c2gobm9kZS5jaGlsZHJlbi52YWx1ZXMoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tcGxldGVkQXQ6IHNlcmlhbGl6ZWQuY29tcGxldGVkQXQsXG5cdFx0XHRyZXN1bHRzOiByb290cy5tYXAociA9PiBjb252ZXJ0VGVzdFJlc3VsdEl0ZW0ocikpLmZpbHRlcihpc0RlZmluZWQpLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0Q292ZXJhZ2Uge1xuXHRmdW5jdGlvbiBmcm9tQ292ZXJhZ2VDb3VudChjb3VudDogdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50KTogSUNvdmVyYWdlQ291bnQge1xuXHRcdHJldHVybiB7IGNvdmVyZWQ6IGNvdW50LmNvdmVyZWQsIHRvdGFsOiBjb3VudC50b3RhbCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZnJvbUxvY2F0aW9uKGxvY2F0aW9uOiB2c2NvZGUuUmFuZ2UgfCB2c2NvZGUuUG9zaXRpb24pIHtcblx0XHRyZXR1cm4gJ2xpbmUnIGluIGxvY2F0aW9uID8gUG9zaXRpb24uZnJvbShsb2NhdGlvbikgOiBSYW5nZS5mcm9tKGxvY2F0aW9uKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvTG9jYXRpb24obG9jYXRpb246IElQb3NpdGlvbiB8IGVkaXRvclJhbmdlLklSYW5nZSk6IHR5cGVzLlBvc2l0aW9uIHwgdHlwZXMuUmFuZ2U7XG5cdGZ1bmN0aW9uIHRvTG9jYXRpb24obG9jYXRpb246IElQb3NpdGlvbiB8IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZCk6IHR5cGVzLlBvc2l0aW9uIHwgdHlwZXMuUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdGZ1bmN0aW9uIHRvTG9jYXRpb24obG9jYXRpb246IElQb3NpdGlvbiB8IGVkaXRvclJhbmdlLklSYW5nZSB8IHVuZGVmaW5lZCk6IHR5cGVzLlBvc2l0aW9uIHwgdHlwZXMuUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICghbG9jYXRpb24pIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdHJldHVybiAnZW5kTGluZU51bWJlcicgaW4gbG9jYXRpb24gPyBSYW5nZS50byhsb2NhdGlvbikgOiBQb3NpdGlvbi50byhsb2NhdGlvbik7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oc2VyaWFsaXplZDogQ292ZXJhZ2VEZXRhaWxzLlNlcmlhbGl6ZWQpOiB2c2NvZGUuRmlsZUNvdmVyYWdlRGV0YWlsIHtcblx0XHRpZiAoc2VyaWFsaXplZC50eXBlID09PSBEZXRhaWxUeXBlLlN0YXRlbWVudCkge1xuXHRcdFx0Y29uc3QgYnJhbmNoZXM6IHZzY29kZS5CcmFuY2hDb3ZlcmFnZVtdID0gW107XG5cdFx0XHRpZiAoc2VyaWFsaXplZC5icmFuY2hlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGJyYW5jaCBvZiBzZXJpYWxpemVkLmJyYW5jaGVzKSB7XG5cdFx0XHRcdFx0YnJhbmNoZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRleGVjdXRlZDogYnJhbmNoLmNvdW50LFxuXHRcdFx0XHRcdFx0bG9jYXRpb246IHRvTG9jYXRpb24oYnJhbmNoLmxvY2F0aW9uKSxcblx0XHRcdFx0XHRcdGxhYmVsOiBicmFuY2gubGFiZWxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5TdGF0ZW1lbnRDb3ZlcmFnZShcblx0XHRcdFx0c2VyaWFsaXplZC5jb3VudCxcblx0XHRcdFx0dG9Mb2NhdGlvbihzZXJpYWxpemVkLmxvY2F0aW9uKSxcblx0XHRcdFx0c2VyaWFsaXplZC5icmFuY2hlcz8ubWFwKGIgPT4gbmV3IHR5cGVzLkJyYW5jaENvdmVyYWdlKFxuXHRcdFx0XHRcdGIuY291bnQsXG5cdFx0XHRcdFx0dG9Mb2NhdGlvbihiLmxvY2F0aW9uKSEsXG5cdFx0XHRcdFx0Yi5sYWJlbCxcblx0XHRcdFx0KSlcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuRGVjbGFyYXRpb25Db3ZlcmFnZShcblx0XHRcdFx0c2VyaWFsaXplZC5uYW1lLFxuXHRcdFx0XHRzZXJpYWxpemVkLmNvdW50LFxuXHRcdFx0XHR0b0xvY2F0aW9uKHNlcmlhbGl6ZWQubG9jYXRpb24pLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbURldGFpbHMoY292ZXJhZ2U6IHZzY29kZS5GaWxlQ292ZXJhZ2VEZXRhaWwpOiBDb3ZlcmFnZURldGFpbHMuU2VyaWFsaXplZCB7XG5cdFx0aWYgKHR5cGVvZiBjb3ZlcmFnZS5leGVjdXRlZCA9PT0gJ251bWJlcicgJiYgY292ZXJhZ2UuZXhlY3V0ZWQgPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgY292ZXJhZ2UgY291bnQgJHtjb3ZlcmFnZS5leGVjdXRlZH1gKTtcblx0XHR9XG5cblx0XHRpZiAoJ2JyYW5jaGVzJyBpbiBjb3ZlcmFnZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y291bnQ6IGNvdmVyYWdlLmV4ZWN1dGVkLFxuXHRcdFx0XHRsb2NhdGlvbjogZnJvbUxvY2F0aW9uKGNvdmVyYWdlLmxvY2F0aW9uKSxcblx0XHRcdFx0dHlwZTogRGV0YWlsVHlwZS5TdGF0ZW1lbnQsXG5cdFx0XHRcdGJyYW5jaGVzOiBjb3ZlcmFnZS5icmFuY2hlcy5sZW5ndGhcblx0XHRcdFx0XHQ/IGNvdmVyYWdlLmJyYW5jaGVzLm1hcChiID0+ICh7IGNvdW50OiBiLmV4ZWN1dGVkLCBsb2NhdGlvbjogYi5sb2NhdGlvbiAmJiBmcm9tTG9jYXRpb24oYi5sb2NhdGlvbiksIGxhYmVsOiBiLmxhYmVsIH0pKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogRGV0YWlsVHlwZS5EZWNsYXJhdGlvbixcblx0XHRcdFx0bmFtZTogY292ZXJhZ2UubmFtZSxcblx0XHRcdFx0Y291bnQ6IGNvdmVyYWdlLmV4ZWN1dGVkLFxuXHRcdFx0XHRsb2NhdGlvbjogZnJvbUxvY2F0aW9uKGNvdmVyYWdlLmxvY2F0aW9uKSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21GaWxlKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBpZDogc3RyaW5nLCBjb3ZlcmFnZTogdnNjb2RlLkZpbGVDb3ZlcmFnZSk6IElGaWxlQ292ZXJhZ2UuU2VyaWFsaXplZCB7XG5cdFx0dHlwZXMudmFsaWRhdGVUZXN0Q292ZXJhZ2VDb3VudChjb3ZlcmFnZS5zdGF0ZW1lbnRDb3ZlcmFnZSk7XG5cdFx0dHlwZXMudmFsaWRhdGVUZXN0Q292ZXJhZ2VDb3VudChjb3ZlcmFnZS5icmFuY2hDb3ZlcmFnZSk7XG5cdFx0dHlwZXMudmFsaWRhdGVUZXN0Q292ZXJhZ2VDb3VudChjb3ZlcmFnZS5kZWNsYXJhdGlvbkNvdmVyYWdlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdHVyaTogY292ZXJhZ2UudXJpLFxuXHRcdFx0c3RhdGVtZW50OiBmcm9tQ292ZXJhZ2VDb3VudChjb3ZlcmFnZS5zdGF0ZW1lbnRDb3ZlcmFnZSksXG5cdFx0XHRicmFuY2g6IGNvdmVyYWdlLmJyYW5jaENvdmVyYWdlICYmIGZyb21Db3ZlcmFnZUNvdW50KGNvdmVyYWdlLmJyYW5jaENvdmVyYWdlKSxcblx0XHRcdGRlY2xhcmF0aW9uOiBjb3ZlcmFnZS5kZWNsYXJhdGlvbkNvdmVyYWdlICYmIGZyb21Db3ZlcmFnZUNvdW50KGNvdmVyYWdlLmRlY2xhcmF0aW9uQ292ZXJhZ2UpLFxuXHRcdFx0dGVzdElkczogY292ZXJhZ2UgaW5zdGFuY2VvZiB0eXBlcy5GaWxlQ292ZXJhZ2UgJiYgY292ZXJhZ2UuaW5jbHVkZXNUZXN0cy5sZW5ndGggP1xuXHRcdFx0XHRjb3ZlcmFnZS5pbmNsdWRlc1Rlc3RzLm1hcCh0ID0+IFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHQsIGNvbnRyb2xsZXJJZCkudG9TdHJpbmcoKSkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvZGVBY3Rpb25UcmlnZ2VyS2luZCB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlKTogdHlwZXMuQ29kZUFjdGlvblRyaWdnZXJLaW5kIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ29kZUFjdGlvblRyaWdnZXJLaW5kLkludm9rZTtcblxuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG86XG5cdFx0XHRcdHJldHVybiB0eXBlcy5Db2RlQWN0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFR5cGVIaWVyYXJjaHlJdGVtIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0byk6IHR5cGVzLlR5cGVIaWVyYXJjaHlJdGVtIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW0oXG5cdFx0XHRTeW1ib2xLaW5kLnRvKGl0ZW0ua2luZCksXG5cdFx0XHRpdGVtLm5hbWUsXG5cdFx0XHRpdGVtLmRldGFpbCB8fCAnJyxcblx0XHRcdFVSSS5yZXZpdmUoaXRlbS51cmkpLFxuXHRcdFx0UmFuZ2UudG8oaXRlbS5yYW5nZSksXG5cdFx0XHRSYW5nZS50byhpdGVtLnNlbGVjdGlvblJhbmdlKVxuXHRcdCk7XG5cblx0XHRyZXN1bHQuX3Nlc3Npb25JZCA9IGl0ZW0uX3Nlc3Npb25JZDtcblx0XHRyZXN1bHQuX2l0ZW1JZCA9IGl0ZW0uX2l0ZW1JZDtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW0sIHNlc3Npb25JZD86IHN0cmluZywgaXRlbUlkPzogc3RyaW5nKTogZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0byB7XG5cblx0XHRzZXNzaW9uSWQgPSBzZXNzaW9uSWQgPz8gKDx0eXBlcy5UeXBlSGllcmFyY2h5SXRlbT5pdGVtKS5fc2Vzc2lvbklkO1xuXHRcdGl0ZW1JZCA9IGl0ZW1JZCA/PyAoPHR5cGVzLlR5cGVIaWVyYXJjaHlJdGVtPml0ZW0pLl9pdGVtSWQ7XG5cblx0XHRpZiAoc2Vzc2lvbklkID09PSB1bmRlZmluZWQgfHwgaXRlbUlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpdGVtJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdF9pdGVtSWQ6IGl0ZW1JZCxcblx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuZnJvbShpdGVtLmtpbmQpLFxuXHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0ZGV0YWlsOiBpdGVtLmRldGFpbCA/PyAnJyxcblx0XHRcdHVyaTogaXRlbS51cmksXG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShpdGVtLnJhbmdlKSxcblx0XHRcdHNlbGVjdGlvblJhbmdlOiBSYW5nZS5mcm9tKGl0ZW0uc2VsZWN0aW9uUmFuZ2UpLFxuXHRcdFx0dGFnczogaXRlbS50YWdzPy5tYXAoU3ltYm9sVGFnLmZyb20pXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFZpZXdCYWRnZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGJhZGdlOiB2c2NvZGUuVmlld0JhZGdlIHwgdW5kZWZpbmVkKTogSVZpZXdCYWRnZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFiYWRnZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dmFsdWU6IGJhZGdlLnZhbHVlLFxuXHRcdFx0dG9vbHRpcDogYmFkZ2UudG9vbHRpcFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEYXRhVHJhbnNmZXJJdGVtIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKG1pbWU6IHN0cmluZywgaXRlbTogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2Zlckl0ZW1EVE8sIHJlc29sdmVGaWxlRGF0YTogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8VWludDhBcnJheT4pOiB0eXBlcy5EYXRhVHJhbnNmZXJJdGVtIHtcblx0XHRjb25zdCBmaWxlID0gaXRlbS5maWxlRGF0YTtcblx0XHRpZiAoZmlsZSkge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5JbnRlcm5hbEZpbGVEYXRhVHJhbnNmZXJJdGVtKFxuXHRcdFx0XHRuZXcgdHlwZXMuRGF0YVRyYW5zZmVyRmlsZShmaWxlLm5hbWUsIFVSSS5yZXZpdmUoZmlsZS51cmkpLCBmaWxlLmlkLCBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4gcmVzb2x2ZUZpbGVEYXRhKGZpbGUuaWQpKSkpO1xuXHRcdH1cblxuXHRcdGlmIChtaW1lID09PSBNaW1lcy51cmlMaXN0ICYmIGl0ZW0udXJpTGlzdERhdGEpIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuSW50ZXJuYWxEYXRhVHJhbnNmZXJJdGVtKHJldml2ZVVyaUxpc3QoaXRlbS51cmlMaXN0RGF0YSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgdHlwZXMuSW50ZXJuYWxEYXRhVHJhbnNmZXJJdGVtKGl0ZW0uYXNTdHJpbmcpO1xuXHR9XG5cblx0ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZyb20obWltZTogc3RyaW5nLCBpdGVtOiB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbSB8IElEYXRhVHJhbnNmZXJJdGVtLCBpZDogc3RyaW5nID0gZ2VuZXJhdGVVdWlkKCkpOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJJdGVtRFRPPiB7XG5cdFx0Y29uc3Qgc3RyaW5nVmFsdWUgPSBhd2FpdCBpdGVtLmFzU3RyaW5nKCk7XG5cblx0XHRpZiAobWltZSA9PT0gTWltZXMudXJpTGlzdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGFzU3RyaW5nOiBzdHJpbmdWYWx1ZSxcblx0XHRcdFx0ZmlsZURhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXJpTGlzdERhdGE6IHNlcmlhbGl6ZVVyaUxpc3Qoc3RyaW5nVmFsdWUpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlVmFsdWUgPSBpdGVtLmFzRmlsZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdGFzU3RyaW5nOiBzdHJpbmdWYWx1ZSxcblx0XHRcdGZpbGVEYXRhOiBmaWxlVmFsdWUgPyB7XG5cdFx0XHRcdG5hbWU6IGZpbGVWYWx1ZS5uYW1lLFxuXHRcdFx0XHR1cmk6IGZpbGVWYWx1ZS51cmksXG5cdFx0XHRcdGlkOiAoZmlsZVZhbHVlIGFzIHR5cGVzLkRhdGFUcmFuc2ZlckZpbGUpLl9pdGVtSWQgPz8gKGZpbGVWYWx1ZSBhcyBJRGF0YVRyYW5zZmVyRmlsZSkuaWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXJpYWxpemVVcmlMaXN0KHN0cmluZ1ZhbHVlOiBzdHJpbmcpOiBSZWFkb25seUFycmF5PHN0cmluZyB8IFVSST4ge1xuXHRcdHJldHVybiBVcmlMaXN0LnNwbGl0KHN0cmluZ1ZhbHVlKS5tYXAocGFydCA9PiB7XG5cdFx0XHRpZiAocGFydC5zdGFydHNXaXRoKCcjJykpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBVUkkucGFyc2UocGFydCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJldml2ZVVyaUxpc3QocGFydHM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nIHwgVXJpQ29tcG9uZW50cz4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBVcmlMaXN0LmNyZWF0ZShwYXJ0cy5tYXAocGFydCA9PiB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHBhcnQgPT09ICdzdHJpbmcnID8gcGFydCA6IFVSSS5yZXZpdmUocGFydCk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGF0YVRyYW5zZmVyIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvRGF0YVRyYW5zZmVyKHZhbHVlOiBleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPLCByZXNvbHZlRmlsZURhdGE6IChpdGVtSWQ6IHN0cmluZykgPT4gUHJvbWlzZTxVaW50OEFycmF5Pik6IHR5cGVzLkRhdGFUcmFuc2ZlciB7XG5cdFx0Y29uc3QgaW5pdCA9IHZhbHVlLml0ZW1zLm1hcCgoW3R5cGUsIGl0ZW1dKSA9PiB7XG5cdFx0XHRyZXR1cm4gW3R5cGUsIERhdGFUcmFuc2Zlckl0ZW0udG8odHlwZSwgaXRlbSwgcmVzb2x2ZUZpbGVEYXRhKV0gYXMgY29uc3Q7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5EYXRhVHJhbnNmZXIoaW5pdCk7XG5cdH1cblxuXHRleHBvcnQgYXN5bmMgZnVuY3Rpb24gZnJvbShkYXRhVHJhbnNmZXI6IHZzY29kZS5EYXRhVHJhbnNmZXIpOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8+IHtcblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20oZGF0YVRyYW5zZmVyLCBhc3luYyAoW21pbWUsIHZhbHVlXSkgPT4ge1xuXHRcdFx0cmV0dXJuIFttaW1lLCBhd2FpdCBEYXRhVHJhbnNmZXJJdGVtLmZyb20obWltZSwgdmFsdWUpXSBhcyBjb25zdDtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBpdGVtcyB9O1xuXHR9XG5cblx0ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZyb21MaXN0KGRhdGFUcmFuc2ZlcjogSXRlcmFibGU8cmVhZG9ubHkgW3N0cmluZywgSURhdGFUcmFuc2Zlckl0ZW1dPik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTz4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbShkYXRhVHJhbnNmZXIsIGFzeW5jIChbbWltZSwgdmFsdWVdKSA9PiB7XG5cdFx0XHRyZXR1cm4gW21pbWUsIGF3YWl0IERhdGFUcmFuc2Zlckl0ZW0uZnJvbShtaW1lLCB2YWx1ZSwgdmFsdWUuaWQpXSBhcyBjb25zdDtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBpdGVtcyB9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEZvbGxvd3VwIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZm9sbG93dXA6IHZzY29kZS5DaGF0Rm9sbG93dXAsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0IHwgdW5kZWZpbmVkKTogSUNoYXRGb2xsb3d1cCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdyZXBseScsXG5cdFx0XHRhZ2VudElkOiBmb2xsb3d1cC5wYXJ0aWNpcGFudCA/PyByZXF1ZXN0Py5hZ2VudElkID8/ICcnLFxuXHRcdFx0c3ViQ29tbWFuZDogZm9sbG93dXAuY29tbWFuZCA/PyByZXF1ZXN0Py5jb21tYW5kLFxuXHRcdFx0bWVzc2FnZTogZm9sbG93dXAucHJvbXB0LFxuXHRcdFx0dGl0bGU6IGZvbGxvd3VwLmxhYmVsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhmb2xsb3d1cDogSUNoYXRGb2xsb3d1cCk6IHZzY29kZS5DaGF0Rm9sbG93dXAge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm9tcHQ6IGZvbGxvd3VwLm1lc3NhZ2UsXG5cdFx0XHRsYWJlbDogZm9sbG93dXAudGl0bGUsXG5cdFx0XHRwYXJ0aWNpcGFudDogZm9sbG93dXAuYWdlbnRJZCxcblx0XHRcdGNvbW1hbmQ6IGZvbGxvd3VwLnN1YkNvbW1hbmQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocm9sZTogY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZSk6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlIHtcblx0XHRzd2l0Y2ggKHJvbGUpIHtcblx0XHRcdGNhc2UgY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZS5TeXN0ZW06IHJldHVybiB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbTtcblx0XHRcdGNhc2UgY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZS5Vc2VyOiByZXR1cm4gdHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5Vc2VyO1xuXHRcdFx0Y2FzZSBjaGF0UHJvdmlkZXIuQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudDogcmV0dXJuIHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJvbGU6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlKTogY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZSB7XG5cdFx0c3dpdGNoIChyb2xlKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuU3lzdGVtOiByZXR1cm4gY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZS5TeXN0ZW07XG5cdFx0XHRjYXNlIHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuVXNlcjogcmV0dXJuIGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUuVXNlcjtcblx0XHRcdGNhc2UgdHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQ6IHJldHVybiBjaGF0UHJvdmlkZXIuQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudDtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUuVXNlcjtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKG1lc3NhZ2U6IGNoYXRQcm92aWRlci5JQ2hhdE1lc3NhZ2UpOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlIHtcblx0XHRjb25zdCBjb250ZW50ID0gbWVzc2FnZS5jb250ZW50Lm1hcChjID0+IHtcblx0XHRcdGlmIChjLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxUZXh0UGFydChjLnZhbHVlLCBjLmF1ZGllbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAoYy50eXBlID09PSAndG9vbF9yZXN1bHQnKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSA9IGNvYWxlc2NlKGMudmFsdWUubWFwKHBhcnQgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQocGFydC52YWx1ZSwgcGFydC5hdWRpZW5jZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQocGFydC5kYXRhLmJ1ZmZlciwgcGFydC5taW1lVHlwZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICdwcm9tcHRfdHN4Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydChwYXJ0LnZhbHVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gU3RyaXAgdW5rbm93biBwYXJ0c1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydChjLnRvb2xDYWxsSWQsIGNvbnRlbnQsIGMuaXNFcnJvcik7XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ2ltYWdlX3VybCcpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQoYy52YWx1ZS5kYXRhLmJ1ZmZlciwgYy52YWx1ZS5taW1lVHlwZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGMuZGF0YS5idWZmZXIsIGMubWltZVR5cGUpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICd0b29sX3VzZScpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0KGMudG9vbENhbGxJZCwgYy5uYW1lLCBjLnBhcmFtZXRlcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pLmZpbHRlcihjID0+IGMgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByb2xlID0gTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS50byhtZXNzYWdlLnJvbGUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2Uocm9sZSwgY29udGVudCwgbWVzc2FnZS5uYW1lKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obWVzc2FnZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSk6IGNoYXRQcm92aWRlci5JQ2hhdE1lc3NhZ2Uge1xuXG5cdFx0Y29uc3Qgcm9sZSA9IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuZnJvbShtZXNzYWdlLnJvbGUpO1xuXHRcdGNvbnN0IG5hbWUgPSBtZXNzYWdlLm5hbWU7XG5cblx0XHRsZXQgbWVzc2FnZUNvbnRlbnQgPSBtZXNzYWdlLmNvbnRlbnQ7XG5cdFx0aWYgKHR5cGVvZiBtZXNzYWdlQ29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1lc3NhZ2VDb250ZW50ID0gW25ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQobWVzc2FnZUNvbnRlbnQpXTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50ID0gbWVzc2FnZUNvbnRlbnQubWFwKChjKTogY2hhdFByb3ZpZGVyLklDaGF0TWVzc2FnZVBhcnQgPT4ge1xuXHRcdFx0aWYgKGMgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbF9yZXN1bHQnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGMuY2FsbElkLFxuXHRcdFx0XHRcdHZhbHVlOiBjb2FsZXNjZShjLmNvbnRlbnQubWFwKHBhcnQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQudmFsdWUsXG5cdFx0XHRcdFx0XHRcdFx0YXVkaWVuY2U6IHBhcnQuYXVkaWVuY2UsXG5cdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0UmVzcG9uc2VUZXh0UGFydDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3Byb21wdF90c3gnLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlc3BvbnNlUHJvbXB0VHN4UGFydDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRcdFx0XHRtaW1lVHlwZTogcGFydC5taW1lVHlwZSxcblx0XHRcdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKHBhcnQuZGF0YSksXG5cdFx0XHRcdFx0XHRcdFx0YXVkaWVuY2U6IHBhcnQuYXVkaWVuY2Vcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRSZXNwb25zZURhdGFQYXJ0O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gU3RyaXAgdW5rbm93biBwYXJ0c1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRpc0Vycm9yOiBjLmlzRXJyb3Jcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCkge1xuXHRcdFx0XHRpZiAoaXNJbWFnZURhdGFQYXJ0KGMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWU6IGNoYXRQcm92aWRlci5JQ2hhdEltYWdlVVJMUGFydCA9IHtcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBjLm1pbWVUeXBlIGFzIGNoYXRQcm92aWRlci5DaGF0SW1hZ2VNaW1lVHlwZSxcblx0XHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLndyYXAoYy5kYXRhKSxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdpbWFnZV91cmwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHZhbHVlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6IGMubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKGMuZGF0YSksXG5cdFx0XHRcdFx0XHRhdWRpZW5jZTogYy5hdWRpZW5jZVxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TWVzc2FnZURhdGFQYXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGMgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2xfdXNlJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBjLmNhbGxJZCxcblx0XHRcdFx0XHRuYW1lOiBjLm5hbWUsXG5cdFx0XHRcdFx0cGFyYW1ldGVyczogYy5pbnB1dFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBjLnZhbHVlXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodHlwZW9mIGMgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXQgbWVzc2FnZSBjb250ZW50IHR5cGUnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBjXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cm9sZSxcblx0XHRcdG5hbWUsXG5cdFx0XHRjb250ZW50XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhtZXNzYWdlOiBjaGF0UHJvdmlkZXIuSUNoYXRNZXNzYWdlKTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBtZXNzYWdlLmNvbnRlbnQubWFwKGMgPT4ge1xuXHRcdFx0aWYgKGMudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KGMudmFsdWUsIGMuYXVkaWVuY2UpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICd0b29sX3Jlc3VsdCcpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudDogKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdID0gYy52YWx1ZS5tYXAocGFydCA9PiB7XG5cdFx0XHRcdFx0aWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydChwYXJ0LnZhbHVlLCBwYXJ0LmF1ZGllbmNlKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQudHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChwYXJ0LmRhdGEuYnVmZmVyLCBwYXJ0Lm1pbWVUeXBlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydChwYXJ0LnZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydChjLnRvb2xDYWxsSWQsIGNvbnRlbnQsIGMuaXNFcnJvcik7XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ2ltYWdlX3VybCcpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQoYy52YWx1ZS5kYXRhLmJ1ZmZlciwgYy52YWx1ZS5taW1lVHlwZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGMuZGF0YS5idWZmZXIsIGMubWltZVR5cGUpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICd0aGlua2luZycpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KGMudmFsdWUsIGMuaWQsIGMubWV0YWRhdGEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0KGMudG9vbENhbGxJZCwgYy5uYW1lLCBjLnBhcmFtZXRlcnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHJvbGUgPSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLnRvKG1lc3NhZ2Uucm9sZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIocm9sZSwgY29udGVudCwgbWVzc2FnZS5uYW1lKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obWVzc2FnZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIpOiBjaGF0UHJvdmlkZXIuSUNoYXRNZXNzYWdlIHtcblxuXHRcdGNvbnN0IHJvbGUgPSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLmZyb20obWVzc2FnZS5yb2xlKTtcblx0XHRjb25zdCBuYW1lID0gbWVzc2FnZS5uYW1lO1xuXG5cdFx0bGV0IG1lc3NhZ2VDb250ZW50ID0gbWVzc2FnZS5jb250ZW50O1xuXHRcdGlmICh0eXBlb2YgbWVzc2FnZUNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRtZXNzYWdlQ29udGVudCA9IFtuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KG1lc3NhZ2VDb250ZW50KV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9IG1lc3NhZ2VDb250ZW50Lm1hcCgoYyk6IGNoYXRQcm92aWRlci5JQ2hhdE1lc3NhZ2VQYXJ0ID0+IHtcblx0XHRcdGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2xfcmVzdWx0Jyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBjLmNhbGxJZCxcblx0XHRcdFx0XHR2YWx1ZTogY29hbGVzY2UoYy5jb250ZW50Lm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRcdGF1ZGllbmNlOiBwYXJ0LmF1ZGllbmNlLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlc3BvbnNlVGV4dFBhcnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdwcm9tcHRfdHN4Jyxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRSZXNwb25zZVByb21wdFRzeFBhcnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnZGF0YScsXG5cdFx0XHRcdFx0XHRcdFx0bWltZVR5cGU6IHBhcnQubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChwYXJ0LmRhdGEpLFxuXHRcdFx0XHRcdFx0XHRcdGF1ZGllbmNlOiBwYXJ0LmF1ZGllbmNlXG5cdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0UmVzcG9uc2VEYXRhUGFydDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIFN0cmlwIHVua25vd24gcGFydHNcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0aXNFcnJvcjogYy5pc0Vycm9yXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKGMgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0aWYgKGlzSW1hZ2VEYXRhUGFydChjKSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlOiBjaGF0UHJvdmlkZXIuSUNoYXRJbWFnZVVSTFBhcnQgPSB7XG5cdFx0XHRcdFx0XHRtaW1lVHlwZTogYy5taW1lVHlwZSBhcyBjaGF0UHJvdmlkZXIuQ2hhdEltYWdlTWltZVR5cGUsXG5cdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKGMuZGF0YSksXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnaW1hZ2VfdXJsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiB2YWx1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBjLm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChjLmRhdGEpLFxuXHRcdFx0XHRcdFx0YXVkaWVuY2U6IGMuYXVkaWVuY2Vcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdE1lc3NhZ2VEYXRhUGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sX3VzZScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogYy5jYWxsSWQsXG5cdFx0XHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IGMuaW5wdXRcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogYy52YWx1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0aGlua2luZycsXG5cdFx0XHRcdFx0dmFsdWU6IGMudmFsdWUsXG5cdFx0XHRcdFx0aWQ6IGMuaWQsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IGMubWV0YWRhdGFcblx0XHRcdFx0fTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjaGF0IG1lc3NhZ2UgY29udGVudCB0eXBlIGxsbSAyJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogY1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvbGUsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y29udGVudFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNJbWFnZURhdGFQYXJ0KHBhcnQ6IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCk6IGJvb2xlYW4ge1xuXHRjb25zdCBtaW1lID0gdHlwZW9mIHBhcnQubWltZVR5cGUgPT09ICdzdHJpbmcnID8gcGFydC5taW1lVHlwZS50b0xvd2VyQ2FzZSgpIDogJyc7XG5cdHN3aXRjaCAobWltZSkge1xuXHRcdGNhc2UgJ2ltYWdlL3BuZyc6XG5cdFx0Y2FzZSAnaW1hZ2UvanBlZyc6XG5cdFx0Y2FzZSAnaW1hZ2UvanBnJzpcblx0XHRjYXNlICdpbWFnZS9naWYnOlxuXHRcdGNhc2UgJ2ltYWdlL3dlYnAnOlxuXHRcdGNhc2UgJ2ltYWdlL2JtcCc6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZU1hcmtkb3duUGFydCk6IER0bzxJQ2hhdE1hcmtkb3duQ29udGVudD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC52YWx1ZSlcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRNYXJrZG93bkNvbnRlbnQ+KTogdnNjb2RlLkNoYXRSZXNwb25zZU1hcmtkb3duUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQoTWFya2Rvd25TdHJpbmcudG8ocGFydC5jb250ZW50KSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQpOiBEdG88SUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2NvZGVibG9ja1VyaScsXG5cdFx0XHR1cmk6IHBhcnQudmFsdWUsXG5cdFx0XHRpc0VkaXQ6IHBhcnQuaXNFZGl0LFxuXHRcdFx0dW5kb1N0b3BJZDogcGFydC51bmRvU3RvcElkXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0Pik6IHZzY29kZS5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQoVVJJLnJldml2ZShwYXJ0LnVyaSksIHBhcnQuaXNFZGl0LCBwYXJ0LnVuZG9TdG9wSWQpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0KTogRHRvPElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25WdWxuJyxcblx0XHRcdGNvbnRlbnQ6IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC52YWx1ZSksXG5cdFx0XHR2dWxuZXJhYmlsaXRpZXM6IHBhcnQudnVsbmVyYWJpbGl0aWVzLFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdEFnZW50TWFya2Rvd25Db250ZW50V2l0aFZ1bG5lcmFiaWxpdHk+KTogdnNjb2RlLkNoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydChNYXJrZG93blN0cmluZy50byhwYXJ0LmNvbnRlbnQpLCBwYXJ0LnZ1bG5lcmFiaWxpdGllcyk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQpOiBEdG88SUNoYXRDb25maXJtYXRpb24+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHR0aXRsZTogcGFydC50aXRsZSxcblx0XHRcdG1lc3NhZ2U6IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC5tZXNzYWdlKSxcblx0XHRcdGRhdGE6IHBhcnQuZGF0YSxcblx0XHRcdGJ1dHRvbnM6IHBhcnQuYnV0dG9uc1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCB7XG5cdGZ1bmN0aW9uIHF1ZXN0aW9uVHlwZVRvU3RyaW5nKHR5cGU6IHZzY29kZS5DaGF0UXVlc3Rpb25UeXBlKTogJ3RleHQnIHwgJ3NpbmdsZVNlbGVjdCcgfCAnbXVsdGlTZWxlY3QnIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5UZXh0OiByZXR1cm4gJ3RleHQnO1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0UXVlc3Rpb25UeXBlLlNpbmdsZVNlbGVjdDogcmV0dXJuICdzaW5nbGVTZWxlY3QnO1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0UXVlc3Rpb25UeXBlLk11bHRpU2VsZWN0OiByZXR1cm4gJ211bHRpU2VsZWN0Jztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAndGV4dCc7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc3RyaW5nVG9RdWVzdGlvblR5cGUodHlwZTogJ3RleHQnIHwgJ3NpbmdsZVNlbGVjdCcgfCAnbXVsdGlTZWxlY3QnKTogdnNjb2RlLkNoYXRRdWVzdGlvblR5cGUge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6IHJldHVybiB0eXBlcy5DaGF0UXVlc3Rpb25UeXBlLlRleHQ7XG5cdFx0XHRjYXNlICdzaW5nbGVTZWxlY3QnOiByZXR1cm4gdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5TaW5nbGVTZWxlY3Q7XG5cdFx0XHRjYXNlICdtdWx0aVNlbGVjdCc6IHJldHVybiB0eXBlcy5DaGF0UXVlc3Rpb25UeXBlLk11bHRpU2VsZWN0O1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHR5cGVzLkNoYXRRdWVzdGlvblR5cGUuVGV4dDtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQpOiBEdG88SUNoYXRRdWVzdGlvbkNhcm91c2VsPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdHF1ZXN0aW9uczogcGFydC5xdWVzdGlvbnMubWFwKHEgPT4gKHtcblx0XHRcdFx0aWQ6IHEuaWQsXG5cdFx0XHRcdHR5cGU6IHF1ZXN0aW9uVHlwZVRvU3RyaW5nKHEudHlwZSksXG5cdFx0XHRcdHRpdGxlOiBxLnRpdGxlLFxuXHRcdFx0XHRtZXNzYWdlOiBxLm1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHEubWVzc2FnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9wdGlvbnM6IHEub3B0aW9ucz8ubWFwKG9wdCA9PiAoeyBpZDogb3B0LmlkLCBsYWJlbDogb3B0LmxhYmVsLCB2YWx1ZTogU3RyaW5nKG9wdC52YWx1ZSkgfSkpLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IHEuZGVmYXVsdFZhbHVlLFxuXHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHEuYWxsb3dGcmVlZm9ybUlucHV0XG5cdFx0XHR9KSksXG5cdFx0XHRhbGxvd1NraXA6IHBhcnQuYWxsb3dTa2lwXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRRdWVzdGlvbkNhcm91c2VsPik6IHZzY29kZS5DaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zID0gcGFydC5xdWVzdGlvbnMubWFwKHEgPT4gbmV3IHR5cGVzLkNoYXRRdWVzdGlvbihcblx0XHRcdHEuaWQsXG5cdFx0XHRzdHJpbmdUb1F1ZXN0aW9uVHlwZShxLnR5cGUpLFxuXHRcdFx0cS50aXRsZSxcblx0XHRcdHtcblx0XHRcdFx0bWVzc2FnZTogcS5tZXNzYWdlID8gKHR5cGVvZiBxLm1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbmV3IHR5cGVzLk1hcmtkb3duU3RyaW5nKHEubWVzc2FnZSkgOiBNYXJrZG93blN0cmluZy50byhxLm1lc3NhZ2UpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3B0aW9uczogcS5vcHRpb25zPy5tYXAob3B0ID0+ICh7XG5cdFx0XHRcdFx0aWQ6IG9wdC5pZCxcblx0XHRcdFx0XHRsYWJlbDogb3B0LmxhYmVsLFxuXHRcdFx0XHRcdHZhbHVlOiBvcHQudmFsdWVcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IHEuZGVmYXVsdFZhbHVlLFxuXHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHEuYWxsb3dGcmVlZm9ybUlucHV0XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydChxdWVzdGlvbnMsIHBhcnQuYWxsb3dTa2lwKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZUZpbGVzUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQpOiBJQ2hhdFRyZWVEYXRhIHtcblx0XHRjb25zdCB7IHZhbHVlLCBiYXNlVXJpIH0gPSBwYXJ0O1xuXHRcdGZ1bmN0aW9uIGNvbnZlcnQoaXRlbXM6IHZzY29kZS5DaGF0UmVzcG9uc2VGaWxlVHJlZVtdLCBiYXNlVXJpOiBVUkkpOiBleHRIb3N0UHJvdG9jb2wuSUNoYXRSZXNwb25zZVByb2dyZXNzRmlsZVRyZWVEYXRhW10ge1xuXHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0Y29uc3QgbXlVcmkgPSBVUkkuam9pblBhdGgoYmFzZVVyaSwgaXRlbS5uYW1lKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogaXRlbS5uYW1lLFxuXHRcdFx0XHRcdHVyaTogbXlVcmksXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGl0ZW0uY2hpbGRyZW4gJiYgY29udmVydChpdGVtLmNoaWxkcmVuLCBteVVyaSlcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3RyZWVEYXRhJyxcblx0XHRcdHRyZWVEYXRhOiB7XG5cdFx0XHRcdGxhYmVsOiBiYXNlbmFtZShiYXNlVXJpKSxcblx0XHRcdFx0dXJpOiBiYXNlVXJpLFxuXHRcdFx0XHRjaGlsZHJlbjogY29udmVydCh2YWx1ZSwgYmFzZVVyaSlcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRUcmVlRGF0YT4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0IHtcblx0XHRjb25zdCB0cmVlRGF0YSA9IHJldml2ZTxleHRIb3N0UHJvdG9jb2wuSUNoYXRSZXNwb25zZVByb2dyZXNzRmlsZVRyZWVEYXRhPihwYXJ0LnRyZWVEYXRhKTtcblx0XHRmdW5jdGlvbiBjb252ZXJ0KGl0ZW1zOiBleHRIb3N0UHJvdG9jb2wuSUNoYXRSZXNwb25zZVByb2dyZXNzRmlsZVRyZWVEYXRhW10pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVbXSB7XG5cdFx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGl0ZW0uY2hpbGRyZW4gJiYgY29udmVydChpdGVtLmNoaWxkcmVuKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZVVyaSA9IHRyZWVEYXRhLnVyaTtcblx0XHRjb25zdCBpdGVtcyA9IHRyZWVEYXRhLmNoaWxkcmVuID8gY29udmVydCh0cmVlRGF0YS5jaGlsZHJlbikgOiBbXTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUZpbGVUcmVlUGFydChpdGVtcywgYmFzZVVyaSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQpOiBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ211bHRpRGlmZkRhdGEnLFxuXHRcdFx0bXVsdGlEaWZmRGF0YToge1xuXHRcdFx0XHR0aXRsZTogcGFydC50aXRsZSxcblx0XHRcdFx0cmVzb3VyY2VzOiBwYXJ0LnZhbHVlLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0XHRcdG9yaWdpbmFsVXJpOiBlbnRyeS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRtb2RpZmllZFVyaTogZW50cnkubW9kaWZpZWRVcmksXG5cdFx0XHRcdFx0Z29Ub0ZpbGVVcmk6IGVudHJ5LmdvVG9GaWxlVXJpLFxuXHRcdFx0XHRcdGFkZGVkOiBlbnRyeS5hZGRlZCxcblx0XHRcdFx0XHRyZW1vdmVkOiBlbnRyeS5yZW1vdmVkLFxuXHRcdFx0XHR9KSlcblx0XHRcdH0sXG5cdFx0XHRyZWFkT25seTogcGFydC5yZWFkT25seVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IElDaGF0TXVsdGlEaWZmRGF0YVNlcmlhbGl6ZWQpOiB2c2NvZGUuQ2hhdFJlc3BvbnNlTXVsdGlEaWZmUGFydCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gcGFydC5tdWx0aURpZmZEYXRhLnJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gKHtcblx0XHRcdG9yaWdpbmFsVXJpOiByZXNvdXJjZS5vcmlnaW5hbFVyaSA/IFVSSS5yZXZpdmUocmVzb3VyY2Uub3JpZ2luYWxVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kaWZpZWRVcmk6IHJlc291cmNlLm1vZGlmaWVkVXJpID8gVVJJLnJldml2ZShyZXNvdXJjZS5tb2RpZmllZFVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRnb1RvRmlsZVVyaTogcmVzb3VyY2UuZ29Ub0ZpbGVVcmkgPyBVUkkucmV2aXZlKHJlc291cmNlLmdvVG9GaWxlVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFkZGVkOiByZXNvdXJjZS5hZGRlZCxcblx0XHRcdHJlbW92ZWQ6IHJlc291cmNlLnJlbW92ZWQsXG5cdFx0fSkpO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlTXVsdGlEaWZmUGFydChyZXNvdXJjZXMsIHBhcnQubXVsdGlEaWZmRGF0YS50aXRsZSwgcGFydC5yZWFkT25seSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VBbmNob3JQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZUFuY2hvclBhcnQpOiBEdG88SUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlPiB7XG5cdFx0Ly8gV29yayBhcm91bmQgdHlwZS1uYXJyb3dpbmcgY29uZnVzaW9uIGJldHdlZW4gdnNjb2RlLlVyaSBhbmQgVVJJXG5cdFx0Y29uc3QgaXNVcmkgPSAodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyB2c2NvZGUuVXJpID0+IFVSSS5pc1VyaSh0aGluZyk7XG5cdFx0Y29uc3QgaXNTeW1ib2xJbmZvcm1hdGlvbiA9ICh0aGluZzogb2JqZWN0KTogdGhpbmcgaXMgdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uID0+ICduYW1lJyBpbiB0aGluZztcblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdG5hbWU6IHBhcnQudGl0bGUsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IGlzVXJpKHBhcnQudmFsdWUpXG5cdFx0XHRcdD8gcGFydC52YWx1ZVxuXHRcdFx0XHQ6IGlzU3ltYm9sSW5mb3JtYXRpb24ocGFydC52YWx1ZSlcblx0XHRcdFx0XHQ/IFdvcmtzcGFjZVN5bWJvbC5mcm9tKHBhcnQudmFsdWUpXG5cdFx0XHRcdFx0OiBMb2NhdGlvbi5mcm9tKHBhcnQudmFsdWUpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlPik6IHZzY29kZS5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0IHtcblx0XHRjb25zdCB2YWx1ZSA9IHJldml2ZTxJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+KHBhcnQpO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydChcblx0XHRcdFVSSS5pc1VyaSh2YWx1ZS5pbmxpbmVSZWZlcmVuY2UpXG5cdFx0XHRcdD8gdmFsdWUuaW5saW5lUmVmZXJlbmNlXG5cdFx0XHRcdDogJ2xvY2F0aW9uJyBpbiB2YWx1ZS5pbmxpbmVSZWZlcmVuY2Vcblx0XHRcdFx0XHQ/IFdvcmtzcGFjZVN5bWJvbC50byh2YWx1ZS5pbmxpbmVSZWZlcmVuY2UpIGFzIHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvblxuXHRcdFx0XHRcdDogTG9jYXRpb24udG8odmFsdWUuaW5saW5lUmVmZXJlbmNlKSxcblx0XHRcdHBhcnQubmFtZVxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0KTogRHRvPElDaGF0UHJvZ3Jlc3NNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0Y29udGVudDogTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0LnZhbHVlKVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdFByb2dyZXNzTWVzc2FnZT4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQpOiBEdG88SUNoYXRUaGlua2luZ1BhcnQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3RoaW5raW5nJyxcblx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0aWQ6IHBhcnQuaWQsXG5cdFx0XHRtZXRhZGF0YTogcGFydC5tZXRhZGF0YVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdFRoaW5raW5nUGFydD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQocGFydC52YWx1ZSA/PyAnJywgcGFydC5pZCwgcGFydC5tZXRhZGF0YSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VIb29rUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VIb29rUGFydCk6IER0bzxJQ2hhdEhvb2tQYXJ0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdGhvb2tUeXBlOiBwYXJ0Lmhvb2tUeXBlLFxuXHRcdFx0c3RvcFJlYXNvbjogcGFydC5zdG9wUmVhc29uLFxuXHRcdFx0c3lzdGVtTWVzc2FnZTogcGFydC5zeXN0ZW1NZXNzYWdlLFxuXHRcdFx0bWV0YWRhdGE6IHBhcnQubWV0YWRhdGFcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRIb29rUGFydD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlSG9va1BhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlSG9va1BhcnQocGFydC5ob29rVHlwZSwgcGFydC5zdG9wUmVhc29uLCBwYXJ0LnN5c3RlbU1lc3NhZ2UsIHBhcnQubWV0YWRhdGEpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQpOiBEdG88SUNoYXRWb2ljZVByb2dyZXNzUGFydD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAndm9pY2VQcm9ncmVzcycsXG5cdFx0XHRpZDogcGFydC5pZCxcblx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHtcblx0Y29uc3QgdmFsaWRMYWJlbHMgPSBuZXcgU2V0PElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydFsncHJlZGljdGVkTGFiZWwnXT4oWyduZWVkc19yZWFzb25pbmcnLCAnbm9fcmVhc29uaW5nJywgJ2ZhbGxiYWNrJ10pO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0KTogRHRvPElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydD4ge1xuXHRcdGNvbnN0IGxhYmVsID0gdmFsaWRMYWJlbHMuaGFzKHBhcnQucHJlZGljdGVkTGFiZWwgYXMgSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0WydwcmVkaWN0ZWRMYWJlbCddKVxuXHRcdFx0PyBwYXJ0LnByZWRpY3RlZExhYmVsIGFzIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydFsncHJlZGljdGVkTGFiZWwnXVxuXHRcdFx0OiAnZmFsbGJhY2snO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnYXV0b01vZGVSZXNvbHV0aW9uJyxcblx0XHRcdHJlc29sdmVkTW9kZWw6IHBhcnQucmVzb2x2ZWRNb2RlbCxcblx0XHRcdHJlc29sdmVkTW9kZWxOYW1lOiBwYXJ0LnJlc29sdmVkTW9kZWxOYW1lLFxuXHRcdFx0cHJlZGljdGVkTGFiZWw6IGxhYmVsLFxuXHRcdFx0Y29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgcGFydC5jb25maWRlbmNlKSksXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0KHBhcnQucmVzb2x2ZWRNb2RlbCwgcGFydC5yZXNvbHZlZE1vZGVsTmFtZSwgcGFydC5wcmVkaWN0ZWRMYWJlbCwgcGFydC5jb25maWRlbmNlKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVdhcm5pbmdQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0KTogRHRvPElDaGF0V2FybmluZ01lc3NhZ2U+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3dhcm5pbmcnLFxuXHRcdFx0Y29udGVudDogTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0LnZhbHVlKVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdFdhcm5pbmdNZXNzYWdlPik6IHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlSW5mb1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlSW5mb1BhcnQpOiBEdG88SUNoYXRJbmZvTWVzc2FnZT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnaW5mbycsXG5cdFx0XHRjb250ZW50OiBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQudmFsdWUpXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0SW5mb01lc3NhZ2U+KTogdnNjb2RlLkNoYXRSZXNwb25zZUluZm9QYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUluZm9QYXJ0KHBhcnQuY29udGVudC52YWx1ZSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCk6IER0bzxJQ2hhdEV4dGVuc2lvbnNDb250ZW50PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdleHRlbnNpb25zJyxcblx0XHRcdGV4dGVuc2lvbnM6IHBhcnQuZXh0ZW5zaW9uc1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiBPbWl0PHZzY29kZS5DaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQsICdjb21tYW5kJz4gJiB7IGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZCB9LCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsIGNvbW1hbmREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogRHRvPElDaGF0UHVsbFJlcXVlc3RDb250ZW50PiB7XG5cdFx0Ly8gSWYgdGhlIGNvbW1hbmQgaXNuJ3QgaW4gdGhlIGNvbnZlcnRlciwgdGhlbiB0aGlzIHNlc3Npb24gbWF5IGhhdmUgYmVlbiByZXN0b3JlZCwgYW5kIHRoZSBjb21tYW5kIGFyZ3MgZG9uJ3QgZXhpc3QgYW55bW9yZVxuXHRcdGxldCBjb21tYW5kOiBleHRIb3N0UHJvdG9jb2wuSUNvbW1hbmREdG87XG5cdFx0aWYgKCFwYXJ0LmNvbW1hbmQpIHtcblx0XHRcdGlmICghcGFydC51cmkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQdWxsIHJlcXVlc3QgcGFydCBtdXN0IGhhdmUgYSBjb21tYW5kIGlmIFVSSSBpcyBwcm92aWRlZCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29tbWFuZCA9IHtcblx0XHRcdFx0dGl0bGU6ICdPcGVuIFB1bGwgUmVxdWVzdCcsXG5cdFx0XHRcdGlkOiAndnNjb2RlLm9wZW4nLFxuXHRcdFx0XHRhcmd1bWVudHM6IFtwYXJ0LnVyaV1cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbW1hbmQgPSBjb21tYW5kc0NvbnZlcnRlci50b0ludGVybmFsKHBhcnQuY29tbWFuZCwgY29tbWFuZERpc3Bvc2FibGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHRhdXRob3I6IHBhcnQuYXV0aG9yLFxuXHRcdFx0dGl0bGU6IHBhcnQudGl0bGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogcGFydC5kZXNjcmlwdGlvbixcblx0XHRcdHVyaTogcGFydC51cmksXG5cdFx0XHRsaW5rVGFnOiBwYXJ0LmxpbmtUYWcsXG5cdFx0XHRjb21tYW5kXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZU1vdmVQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZU1vdmVQYXJ0KTogRHRvPElDaGF0TW92ZU1lc3NhZ2U+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ21vdmUnLFxuXHRcdFx0dXJpOiBwYXJ0LnVyaSxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKHBhcnQucmFuZ2UpLFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdE1vdmVNZXNzYWdlPik6IHZzY29kZS5DaGF0UmVzcG9uc2VNb3ZlUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VNb3ZlUGFydChVUkkucmV2aXZlKHBhcnQudXJpKSwgUmFuZ2UudG8ocGFydC5yYW5nZSkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0VG9vbEludm9jYXRpb25QYXJ0KTogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgfCBJQ2hhdEV4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUge1xuXHRcdC8vIENoZWNrIGlmIHRvb2xTcGVjaWZpY0RhdGEgaXMgQ2hhdE1jcFRvb2xJbnZvY2F0aW9uRGF0YSAoaGFzIGlucHV0IGFuZCBvdXRwdXQpXG5cdFx0Ly8gSWYgc28sIGNvbnZlcnQgdG8gcmVzdWx0RGV0YWlscyBmb3IgcmVuZGVyaW5nIHZpYSBDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydFxuXHRcdGxldCByZXN1bHREZXRhaWxzOiBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdG9vbFNwZWNpZmljRGF0YTogYW55O1xuXG5cdFx0aWYgKHBhcnQudG9vbFNwZWNpZmljRGF0YSAmJiBpc0NoYXRNY3BUb29sSW52b2NhdGlvbkRhdGEocGFydC50b29sU3BlY2lmaWNEYXRhKSkge1xuXHRcdFx0Ly8gQ29udmVydCBDaGF0TWNwVG9vbEludm9jYXRpb25EYXRhIHRvIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzXG5cdFx0XHRyZXN1bHREZXRhaWxzID0gY29udmVydE1jcFRvUmVzdWx0RGV0YWlscyhwYXJ0LnRvb2xTcGVjaWZpY0RhdGEsIHBhcnQuaXNFcnJvcik7XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0gdW5kZWZpbmVkOyAvLyBNQ1AgZGF0YSBnb2VzIHRvIHJlc3VsdERldGFpbHMsIG5vdCB0b29sU3BlY2lmaWNEYXRhXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSBwYXJ0LnRvb2xTcGVjaWZpY0RhdGEgPyBjb252ZXJ0VG9vbFNwZWNpZmljRGF0YShwYXJ0LnRvb2xTcGVjaWZpY0RhdGEpIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IHBhcnQucHJlc2VudGF0aW9uID09PSAnaGlkZGVuJ1xuXHRcdFx0PyBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5cblx0XHRcdDogcGFydC5wcmVzZW50YXRpb24gPT09ICdoaWRkZW5BZnRlckNvbXBsZXRlJ1xuXHRcdFx0XHQ/IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGVcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHQvLyBXaGVuIGlzQ29tcGxldGUgaXMgZXhwbGljaXRseSBzZXQgKG5vdCB1bmRlZmluZWQpLCB1c2UgdGhlIHVwZGF0ZSBEVE8gdG8gZW5hYmxlXG5cdFx0Ly8gbGl2ZSB0b29sIGludm9jYXRpb24gdXBkYXRlcy4gRXh0ZW5zaW9ucyBjYW4gcHVzaCB3aXRoIGlzQ29tcGxldGU6IGZhbHNlIHRvIHN0YXJ0XG5cdFx0Ly8gYW4gaW4tcHJvZ3Jlc3MgaW52b2NhdGlvbiwgdGhlbiBwdXNoIGFnYWluIHdpdGggaXNDb21wbGV0ZTogdHJ1ZSB0byBjb21wbGV0ZSBpdC5cblx0XHRpZiAocGFydC5lbmFibGVQYXJ0aWFsVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbE5hbWUsXG5cdFx0XHRcdGlzQ29tcGxldGU6ICEhcGFydC5pc0NvbXBsZXRlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC5pbnZvY2F0aW9uTWVzc2FnZSA/IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC5pbnZvY2F0aW9uTWVzc2FnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcnQucGFzdFRlbnNlTWVzc2FnZSA/IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC5wYXN0VGVuc2VNZXNzYWdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdHJlc3VsdERldGFpbHNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQ29udmVydCBleHRlbnNpb24gQVBJIENoYXRUb29sSW52b2NhdGlvblBhcnQgdG8gaW50ZXJuYWwgc2VyaWFsaXplZCBmb3JtYXQgKGxlZ2FjeSBwYXRoKVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGxJZCxcblx0XHRcdHRvb2xJZDogcGFydC50b29sTmFtZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwYXJ0Lmludm9jYXRpb25NZXNzYWdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0Lmludm9jYXRpb25NZXNzYWdlKSA6IHBhcnQudG9vbE5hbWUsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiBwYXJ0Lm9yaWdpbk1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQub3JpZ2luTWVzc2FnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQucGFzdFRlbnNlTWVzc2FnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbmZpcm1lZDogcGFydC5pc0NvbmZpcm1lZCxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0Ly8gaXNFcnJvcjogcGFydC5pc0Vycm9yID8/IGZhbHNlLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdHJlc3VsdERldGFpbHMsXG5cdFx0XHRwcmVzZW50YXRpb24sXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogcGFydC5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBpc0NoYXRNY3BUb29sSW52b2NhdGlvbkRhdGEoZGF0YTogYW55KTogZGF0YSBpcyB2c2NvZGUuQ2hhdE1jcFRvb2xJbnZvY2F0aW9uRGF0YSB7XG5cdFx0cmV0dXJuIGRhdGEgIT09IG51bGwgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmXG5cdFx0XHQnaW5wdXQnIGluIGRhdGEgJiYgdHlwZW9mIGRhdGEuaW5wdXQgPT09ICdzdHJpbmcnICYmXG5cdFx0XHQnb3V0cHV0JyBpbiBkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5vdXRwdXQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29udmVydE1jcFRvUmVzdWx0RGV0YWlscyhkYXRhOiB2c2NvZGUuQ2hhdE1jcFRvb2xJbnZvY2F0aW9uRGF0YSwgaXNFcnJvcj86IGJvb2xlYW4pOiBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlucHV0OiBkYXRhLmlucHV0LFxuXHRcdFx0b3V0cHV0OiBkYXRhLm91dHB1dC5tYXAoKG8pID0+IHtcblx0XHRcdFx0Y29uc3QgaXNUZXh0ID0gby5taW1lVHlwZS5zdGFydHNXaXRoKCd0ZXh0LycpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdlbWJlZCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0bWltZVR5cGU6IG8ubWltZVR5cGUsXG5cdFx0XHRcdFx0dmFsdWU6IGlzVGV4dCA/IFZTQnVmZmVyLndyYXAoby5kYXRhKS50b1N0cmluZygpIDogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAoby5kYXRhKSksXG5cdFx0XHRcdFx0aXNUZXh0OiBpc1RleHQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KSxcblx0XHRcdGlzRXJyb3I6IGlzRXJyb3IgPz8gZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRUb29sU3BlY2lmaWNEYXRhKGRhdGE6IGFueSk6IGFueSB7XG5cdFx0Ly8gQ29udmVydCBleHRlbnNpb24gQVBJIHRlcm1pbmFsIHRvb2wgZGF0YSB0byBpbnRlcm5hbCBmb3JtYXRcblx0XHRpZiAoJ2NvbW1hbmQnIGluIGRhdGEgJiYgJ2xhbmd1YWdlJyBpbiBkYXRhKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kOiBkYXRhLmNvbW1hbmQsXG5cdFx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoJ2NvbW1hbmRMaW5lJyBpbiBkYXRhICYmICdsYW5ndWFnZScgaW4gZGF0YSkge1xuXHRcdFx0Y29uc3QgcHJlc2VudGF0aW9uT3ZlcnJpZGVzID0gZGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXMgJiYgdHlwZW9mIGRhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzLmNvbW1hbmRMaW5lID09PSAnc3RyaW5nJyA/IHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IGRhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRsYW5ndWFnZTogZGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXMubGFuZ3VhZ2Vcblx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdHByZXNlbnRhdGlvbk92ZXJyaWRlcyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IGRhdGEuY29tbWFuZExpbmUsXG5cdFx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlLFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRPdXRwdXQ6IHR5cGVvZiBkYXRhLm91dHB1dD8udGV4dCA9PT0gJ3N0cmluZycgPyB7XG5cdFx0XHRcdFx0dGV4dDogZGF0YS5vdXRwdXQudGV4dCxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IGRhdGEuc3RhdGUgPyB7XG5cdFx0XHRcdFx0ZXhpdENvZGU6IGRhdGEuc3RhdGUuZXhpdENvZGUsXG5cdFx0XHRcdFx0ZHVyYXRpb246IGRhdGEuc3RhdGUuZHVyYXRpb24sXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSBpZiAoJ3RvZG9MaXN0JyBpbiBkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS50b2RvTGlzdCkpIHtcblx0XHRcdC8vIENvbnZlcnQgZXh0ZW5zaW9uIEFQSSB0b2RvIHRvb2wgZGF0YSB0byBpbnRlcm5hbCBmb3JtYXRcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICd0b2RvTGlzdCcsXG5cdFx0XHRcdHRvZG9MaXN0OiBkYXRhLnRvZG9MaXN0Lm1hcCgodG9kbzogYW55KSA9PiAoe1xuXHRcdFx0XHRcdGlkOiBTdHJpbmcodG9kby5pZCksXG5cdFx0XHRcdFx0dGl0bGU6IHRvZG8udGl0bGUsXG5cdFx0XHRcdFx0c3RhdHVzOiB0b2RvU3RhdHVzRW51bVRvU3RyaW5nKHRvZG8uc3RhdHVzKVxuXHRcdFx0XHR9KSlcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmICgnaW5wdXQnIGluIGRhdGEgJiYgJ291dHB1dCcgaW4gZGF0YSAmJiAhQXJyYXkuaXNBcnJheShkYXRhLm91dHB1dCkpIHtcblx0XHRcdC8vIENvbnZlcnQgZXh0ZW5zaW9uIEFQSSBzaW1wbGUgdG9vbCBpbnZvY2F0aW9uIGRhdGEgdG8gaW50ZXJuYWwgZm9ybWF0XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnc2ltcGxlVG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRpbnB1dDogdHlwZW9mIGRhdGEuaW5wdXQgPT09ICdzdHJpbmcnID8gZGF0YS5pbnB1dCA6ICcnLFxuXHRcdFx0XHRvdXRwdXQ6IHR5cGVvZiBkYXRhLm91dHB1dCA9PT0gJ3N0cmluZycgPyBkYXRhLm91dHB1dCA6ICcnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZGF0YSAmJiAndmFsdWVzJyBpbiBkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS52YWx1ZXMpKSB7XG5cdFx0XHQvLyBDb252ZXJ0IGV4dGVuc2lvbiBBUEkgcmVzb3VyY2VzIHRvb2wgZGF0YSB0byBpbnRlcm5hbCBmb3JtYXRcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvdXJjZXMnLFxuXHRcdFx0XHR2YWx1ZXM6IGRhdGEudmFsdWVzLm1hcCgodjogYW55KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHYgaW5zdGFuY2VvZiB0eXBlcy5Mb2NhdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIExvY2F0aW9uLmZyb20odik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBVUkkucmV2aXZlKHYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChkYXRhIGluc3RhbmNlb2YgdHlwZXMuQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhKSB7XG5cdFx0XHQvLyBDb252ZXJ0IGV4dGVuc2lvbiBBUEkgc3ViYWdlbnQgdG9vbCBkYXRhIHRvIGludGVybmFsIGZvcm1hdFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGRhdGEuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogZGF0YS5hZ2VudE5hbWUsXG5cdFx0XHRcdHByb21wdDogZGF0YS5wcm9tcHQsXG5cdFx0XHRcdHJlc3VsdDogZGF0YS5yZXN1bHQsXG5cdFx0XHRcdG1vZGVsTmFtZTogZGF0YS5tb2RlbE5hbWUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvZG9TdGF0dXNFbnVtVG9TdHJpbmcoc3RhdHVzOiB0eXBlcy5DaGF0VG9kb1N0YXR1cyB8IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gSGFuZGxlIGVudW0gdmFsdWVzXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdFRvZG9TdGF0dXMuTm90U3RhcnRlZDpcblx0XHRcdFx0cmV0dXJuICdub3Qtc3RhcnRlZCc7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRUb2RvU3RhdHVzLkluUHJvZ3Jlc3M6XG5cdFx0XHRcdHJldHVybiAnaW4tcHJvZ3Jlc3MnO1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0VG9kb1N0YXR1cy5Db21wbGV0ZWQ6XG5cdFx0XHRcdHJldHVybiAnY29tcGxldGVkJztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiAnbm90LXN0YXJ0ZWQnO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHRvZG9TdGF0dXNTdHJpbmdUb0VudW0oc3RhdHVzOiBzdHJpbmcpOiB0eXBlcy5DaGF0VG9kb1N0YXR1cyB7XG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgJ25vdC1zdGFydGVkJzpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkNoYXRUb2RvU3RhdHVzLk5vdFN0YXJ0ZWQ7XG5cdFx0XHRjYXNlICdpbi1wcm9ncmVzcyc6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5DaGF0VG9kb1N0YXR1cy5JblByb2dyZXNzO1xuXHRcdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkNoYXRUb2RvU3RhdHVzLkNvbXBsZXRlZDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5DaGF0VG9kb1N0YXR1cy5Ob3RTdGFydGVkO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBhbnkpOiB2c2NvZGUuQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBuZXcgdHlwZXMuQ2hhdFRvb2xJbnZvY2F0aW9uUGFydChcblx0XHRcdHBhcnQudG9vbElkIHx8IHBhcnQudG9vbE5hbWUsXG5cdFx0XHRwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHRwYXJ0LmVycm9yTWVzc2FnZVxuXHRcdCk7XG5cblx0XHRpZiAocGFydC5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0dG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBwYXJ0Lmludm9jYXRpb25NZXNzYWdlO1xuXHRcdH1cblx0XHRpZiAocGFydC5vcmlnaW5NZXNzYWdlKSB7XG5cdFx0XHR0b29sSW52b2NhdGlvbi5vcmlnaW5NZXNzYWdlID0gcGFydC5vcmlnaW5NZXNzYWdlO1xuXHRcdH1cblx0XHRpZiAocGFydC5wYXN0VGVuc2VNZXNzYWdlKSB7XG5cdFx0XHR0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID0gcGFydC5wYXN0VGVuc2VNZXNzYWdlO1xuXHRcdH1cblx0XHRpZiAocGFydC5pc0NvbmZpcm1lZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0b29sSW52b2NhdGlvbi5pc0NvbmZpcm1lZCA9IHBhcnQuaXNDb25maXJtZWQ7XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmlzQ29tcGxldGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSA9IHBhcnQuaXNDb21wbGV0ZTtcblx0XHR9XG5cdFx0aWYgKHBhcnQudG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0dG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IGNvbnZlcnRGcm9tSW50ZXJuYWxUb29sU3BlY2lmaWNEYXRhKHBhcnQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0fVxuXHRcdHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkID0gcGFydC5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHR0b29sSW52b2NhdGlvbi5zdWJBZ2VudE5hbWUgPSBwYXJ0LnN1YkFnZW50TmFtZTtcblxuXHRcdHJldHVybiB0b29sSW52b2NhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRGcm9tSW50ZXJuYWxUb29sU3BlY2lmaWNEYXRhKGRhdGE6IGFueSk6IGFueSB7XG5cdFx0Ly8gQ29udmVydCBpbnRlcm5hbCB0ZXJtaW5hbCB0b29sIGRhdGEgdG8gZXh0ZW5zaW9uIEFQSSBmb3JtYXRcblx0XHRpZiAoZGF0YS5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRpZiAoZGF0YS5jb21tYW5kTGluZSkge1xuXHRcdFx0XHQvLyBOZXcgZm9ybWF0IHdpdGggY29tbWFuZExpbmVcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBhbnkgPSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IGRhdGEuY29tbWFuZExpbmUsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6IGRhdGEubGFuZ3VhZ2Vcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBNYXAgaW50ZXJuYWwgJ3Rlcm1pbmFsQ29tbWFuZE91dHB1dCcgLT4gZXh0ZW5zaW9uICdvdXRwdXQnXG5cdFx0XHRcdGlmIChkYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCkge1xuXHRcdFx0XHRcdHJlc3VsdC5vdXRwdXQgPSB7XG5cdFx0XHRcdFx0XHR0ZXh0OiBkYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dC50ZXh0LFxuXHRcdFx0XHRcdFx0dHJ1bmNhdGVkOiBkYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dC50cnVuY2F0ZWQsXG5cdFx0XHRcdFx0XHRsaW5lQ291bnQ6IGRhdGEudGVybWluYWxDb21tYW5kT3V0cHV0LmxpbmVDb3VudFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBNYXAgaW50ZXJuYWwgJ3Rlcm1pbmFsQ29tbWFuZFN0YXRlJyAtPiBleHRlbnNpb24gJ3N0YXRlJ1xuXHRcdFx0XHRpZiAoZGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5zdGF0ZSA9IHtcblx0XHRcdFx0XHRcdGV4aXRDb2RlOiBkYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlLmV4aXRDb2RlLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb246IGRhdGEudGVybWluYWxDb21tYW5kU3RhdGUuZHVyYXRpb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIExlZ2FjeSBmb3JtYXQgd2l0aCBjb21tYW5kXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogZGF0YS5jb21tYW5kLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChkYXRhLmtpbmQgPT09ICd0ZXJtaW5hbDInKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kTGluZTogZGF0YS5jb21tYW5kTGluZSxcblx0XHRcdFx0bGFuZ3VhZ2U6IGRhdGEubGFuZ3VhZ2Vcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChkYXRhLmtpbmQgPT09ICd0b2RvTGlzdCcpIHtcblx0XHRcdC8vIENvbnZlcnQgaW50ZXJuYWwgdG9kbyB0b29sIGRhdGEgdG8gZXh0ZW5zaW9uIEFQSSBmb3JtYXRcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvZG9MaXN0OiBkYXRhLnRvZG9MaXN0Lm1hcCgodG9kbzogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gTnVtYmVyKHRvZG8uaWQpO1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkgPyBwYXJzZWQgOiBpbmRleDtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdG9kby50aXRsZSxcblx0XHRcdFx0XHRcdHN0YXR1czogdG9kb1N0YXR1c1N0cmluZ1RvRW51bSh0b2RvLnN0YXR1cylcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0VGFzayB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyKTogSUNoYXRUYXNrRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Byb2dyZXNzVGFzaycsXG5cdFx0XHRjb250ZW50OiBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQudmFsdWUpLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0VGFza1Jlc3VsdCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHN0cmluZyB8IHZvaWQpOiBEdG88SUNoYXRUYXNrUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdwcm9ncmVzc1Rhc2tSZXN1bHQnLFxuXHRcdFx0Y29udGVudDogdHlwZW9mIHBhcnQgPT09ICdzdHJpbmcnID8gTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0KSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLCBjb21tYW5kRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IER0bzxJQ2hhdENvbW1hbmRCdXR0b24+IHtcblx0XHQvLyBJZiB0aGUgY29tbWFuZCBpc24ndCBpbiB0aGUgY29udmVydGVyLCB0aGVuIHRoaXMgc2Vzc2lvbiBtYXkgaGF2ZSBiZWVuIHJlc3RvcmVkLCBhbmQgdGhlIGNvbW1hbmQgYXJncyBkb24ndCBleGlzdCBhbnltb3JlXG5cdFx0Y29uc3QgY29tbWFuZCA9IGNvbW1hbmRzQ29udmVydGVyLnRvSW50ZXJuYWwocGFydC52YWx1ZSwgY29tbWFuZERpc3Bvc2FibGVzKSA/PyB7IGNvbW1hbmQ6IHBhcnQudmFsdWUuY29tbWFuZCwgdGl0bGU6IHBhcnQudmFsdWUudGl0bGUgfTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2NvbW1hbmQnLFxuXHRcdFx0Y29tbWFuZFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdENvbW1hbmRCdXR0b24+LCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpOiB2c2NvZGUuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQge1xuXHRcdC8vIElmIHRoZSBjb21tYW5kIGlzbid0IGluIHRoZSBjb252ZXJ0ZXIsIHRoZW4gdGhpcyBzZXNzaW9uIG1heSBoYXZlIGJlZW4gcmVzdG9yZWQsIGFuZCB0aGUgY29tbWFuZCBhcmdzIGRvbid0IGV4aXN0IGFueW1vcmVcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0KGNvbW1hbmRzQ29udmVydGVyLmZyb21JbnRlcm5hbChwYXJ0LmNvbW1hbmQpID8/IHsgY29tbWFuZDogcGFydC5jb21tYW5kLmlkLCB0aXRsZTogcGFydC5jb21tYW5kLnRpdGxlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVRleHRFZGl0UGFydCk6IER0bzxJQ2hhdFRleHRFZGl0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmk6IHBhcnQudXJpLFxuXHRcdFx0ZWRpdHM6IHBhcnQuZWRpdHMubWFwKGUgPT4gVGV4dEVkaXQuZnJvbShlKSksXG5cdFx0XHRkb25lOiBwYXJ0LmlzRG9uZVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdFRleHRFZGl0Pik6IHZzY29kZS5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQoVVJJLnJldml2ZShwYXJ0LnVyaSksIHBhcnQuZWRpdHMubWFwKGUgPT4gVGV4dEVkaXQudG8oZSkpKTtcblx0XHRyZXN1bHQuaXNEb25lID0gcGFydC5kb25lO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rRWRpdCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGVkaXQ6IHZzY29kZS5Ob3RlYm9va0VkaXQpOiBleHRIb3N0UHJvdG9jb2wuSUNlbGxFZGl0T3BlcmF0aW9uRHRvIHtcblx0XHRpZiAoZWRpdC5uZXdDZWxsTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsXG5cdFx0XHRcdGluZGV4OiBlZGl0LnJhbmdlLnN0YXJ0LFxuXHRcdFx0XHRtZXRhZGF0YTogZWRpdC5uZXdDZWxsTWV0YWRhdGFcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChlZGl0Lm5ld05vdGVib29rTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuRG9jdW1lbnRNZXRhZGF0YSxcblx0XHRcdFx0bWV0YWRhdGE6IGVkaXQubmV3Tm90ZWJvb2tNZXRhZGF0YVxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRpbmRleDogZWRpdC5yYW5nZS5zdGFydCxcblx0XHRcdFx0Y291bnQ6IGVkaXQucmFuZ2UuZW5kIC0gZWRpdC5yYW5nZS5zdGFydCxcblx0XHRcdFx0Y2VsbHM6IGVkaXQubmV3Q2VsbHMubWFwKE5vdGVib29rQ2VsbERhdGEuZnJvbSlcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQpOiBleHRIb3N0UHJvdG9jb2wuSUNoYXROb3RlYm9va0VkaXREdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbm90ZWJvb2tFZGl0Jyxcblx0XHRcdHVyaTogcGFydC51cmksXG5cdFx0XHRlZGl0czogcGFydC5lZGl0cy5tYXAoTm90ZWJvb2tFZGl0LmZyb20pLFxuXHRcdFx0ZG9uZTogcGFydC5pc0RvbmVcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQpOiBJQ2hhdFdvcmtzcGFjZUVkaXQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlRWRpdCcsXG5cdFx0XHRlZGl0czogcGFydC5lZGl0cy5tYXAoZSA9PiAoe1xuXHRcdFx0XHRvbGRSZXNvdXJjZTogZS5vbGRSZXNvdXJjZSxcblx0XHRcdFx0bmV3UmVzb3VyY2U6IGUubmV3UmVzb3VyY2UsXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB0eXBlcy5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0KTogRHRvPElDaGF0Q29udGVudFJlZmVyZW5jZT4ge1xuXHRcdGNvbnN0IGljb25QYXRoID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKHBhcnQuaWNvblBhdGgpID8gcGFydC5pY29uUGF0aFxuXHRcdFx0OiBVUkkuaXNVcmkocGFydC5pY29uUGF0aCkgPyB7IGxpZ2h0OiBVUkkucmV2aXZlKHBhcnQuaWNvblBhdGgpIH1cblx0XHRcdFx0OiAocGFydC5pY29uUGF0aCAmJiAnbGlnaHQnIGluIHBhcnQuaWNvblBhdGggJiYgJ2RhcmsnIGluIHBhcnQuaWNvblBhdGggJiYgVVJJLmlzVXJpKHBhcnQuaWNvblBhdGgubGlnaHQpICYmIFVSSS5pc1VyaShwYXJ0Lmljb25QYXRoLmRhcmspID8geyBsaWdodDogVVJJLnJldml2ZShwYXJ0Lmljb25QYXRoLmxpZ2h0KSwgZGFyazogVVJJLnJldml2ZShwYXJ0Lmljb25QYXRoLmRhcmspIH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCk7XG5cblx0XHRpZiAodHlwZW9mIHBhcnQudmFsdWUgPT09ICdvYmplY3QnICYmICd2YXJpYWJsZU5hbWUnIGluIHBhcnQudmFsdWUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdyZWZlcmVuY2UnLFxuXHRcdFx0XHRyZWZlcmVuY2U6IHtcblx0XHRcdFx0XHR2YXJpYWJsZU5hbWU6IHBhcnQudmFsdWUudmFyaWFibGVOYW1lLFxuXHRcdFx0XHRcdHZhbHVlOiBVUkkuaXNVcmkocGFydC52YWx1ZS52YWx1ZSkgfHwgIXBhcnQudmFsdWUudmFsdWUgP1xuXHRcdFx0XHRcdFx0cGFydC52YWx1ZS52YWx1ZSA6XG5cdFx0XHRcdFx0XHRMb2NhdGlvbi5mcm9tKHBhcnQudmFsdWUudmFsdWUgYXMgdnNjb2RlLkxvY2F0aW9uKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uUGF0aCxcblx0XHRcdFx0b3B0aW9uczogcGFydC5vcHRpb25zXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncmVmZXJlbmNlJyxcblx0XHRcdHJlZmVyZW5jZTogVVJJLmlzVXJpKHBhcnQudmFsdWUpIHx8IHR5cGVvZiBwYXJ0LnZhbHVlID09PSAnc3RyaW5nJyA/XG5cdFx0XHRcdHBhcnQudmFsdWUgOlxuXHRcdFx0XHRMb2NhdGlvbi5mcm9tKDx2c2NvZGUuTG9jYXRpb24+cGFydC52YWx1ZSksXG5cdFx0XHRpY29uUGF0aCxcblx0XHRcdG9wdGlvbnM6IHBhcnQub3B0aW9uc1xuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+KTogdnNjb2RlLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQge1xuXHRcdGNvbnN0IHZhbHVlID0gcmV2aXZlPElDaGF0Q29udGVudFJlZmVyZW5jZT4ocGFydCk7XG5cblx0XHRjb25zdCBtYXBWYWx1ZSA9ICh2YWx1ZTogVVJJIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uKTogdnNjb2RlLlVyaSB8IHZzY29kZS5Mb2NhdGlvbiA9PiBVUkkuaXNVcmkodmFsdWUpID9cblx0XHRcdHZhbHVlIDpcblx0XHRcdExvY2F0aW9uLnRvKHZhbHVlKTtcblxuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydChcblx0XHRcdHR5cGVvZiB2YWx1ZS5yZWZlcmVuY2UgPT09ICdzdHJpbmcnID8gdmFsdWUucmVmZXJlbmNlIDogJ3ZhcmlhYmxlTmFtZScgaW4gdmFsdWUucmVmZXJlbmNlID8ge1xuXHRcdFx0XHR2YXJpYWJsZU5hbWU6IHZhbHVlLnJlZmVyZW5jZS52YXJpYWJsZU5hbWUsXG5cdFx0XHRcdHZhbHVlOiB2YWx1ZS5yZWZlcmVuY2UudmFsdWUgJiYgbWFwVmFsdWUodmFsdWUucmVmZXJlbmNlLnZhbHVlKVxuXHRcdFx0fSA6XG5cdFx0XHRcdG1hcFZhbHVlKHZhbHVlLnJlZmVyZW5jZSlcblx0XHQpIGFzIHZzY29kZS5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0OyAvLyAndmFsdWUnIGlzIGV4dGVuZGVkIHdpdGggdmFyaWFibGVOYW1lXG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQpOiBEdG88SUNoYXRDb2RlQ2l0YXRpb24+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2NvZGVDaXRhdGlvbicsXG5cdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHRcdGxpY2Vuc2U6IHBhcnQubGljZW5zZSxcblx0XHRcdHNuaXBwZXQ6IHBhcnQuc25pcHBldFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VQYXJ0IHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuRXh0ZW5kZWRDaGF0UmVzcG9uc2VQYXJ0LCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsIGNvbW1hbmREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogZXh0SG9zdFByb3RvY29sLklDaGF0UHJvZ3Jlc3NEdG8ge1xuXHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUFuY2hvclBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVByb2dyZXNzUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VIb29rUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUhvb2tQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUZpbGVUcmVlUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUZpbGVzUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydC5mcm9tKHBhcnQsIGNvbW1hbmRzQ29udmVydGVyLCBjb21tYW5kRGlzcG9zYWJsZXMpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVRleHRFZGl0UGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVRleHRFZGl0UGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VJbmZvUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUluZm9QYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VNb3ZlUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZU1vdmVQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVB1bGxSZXF1ZXN0UGFydC5mcm9tKHBhcnQsIGNvbW1hbmRzQ29udmVydGVyLCBjb21tYW5kRGlzcG9zYWJsZXMpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRUb29sSW52b2NhdGlvblBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0VG9vbEludm9jYXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogTWFya2Rvd25TdHJpbmcuZnJvbSgnJylcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IGV4dEhvc3RQcm90b2NvbC5JQ2hhdFByb2dyZXNzRHRvLCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpOiB2c2NvZGUuQ2hhdFJlc3BvbnNlUGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChwYXJ0LmtpbmQpIHtcblx0XHRcdGNhc2UgJ3JlZmVyZW5jZSc6IHJldHVybiBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0LnRvKHBhcnQpO1xuXHRcdFx0Y2FzZSAnbWFya2Rvd25Db250ZW50Jzpcblx0XHRcdGNhc2UgJ2lubGluZVJlZmVyZW5jZSc6XG5cdFx0XHRjYXNlICdwcm9ncmVzc01lc3NhZ2UnOlxuXHRcdFx0Y2FzZSAndHJlZURhdGEnOlxuXHRcdFx0Y2FzZSAnY29tbWFuZCc6XG5cdFx0XHRcdHJldHVybiB0b0NvbnRlbnQocGFydCwgY29tbWFuZHNDb252ZXJ0ZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvQ29udGVudChwYXJ0OiBleHRIb3N0UHJvdG9jb2wuSUNoYXRDb250ZW50UHJvZ3Jlc3NEdG8sIGNvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlcik6IHZzY29kZS5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQgfCB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0IHwgdnNjb2RlLkNoYXRSZXNwb25zZUFuY2hvclBhcnQgfCB2c2NvZGUuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAocGFydC5raW5kKSB7XG5cdFx0XHRjYXNlICdtYXJrZG93bkNvbnRlbnQnOiByZXR1cm4gQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0LnRvKHBhcnQpO1xuXHRcdFx0Y2FzZSAnaW5saW5lUmVmZXJlbmNlJzogcmV0dXJuIENoYXRSZXNwb25zZUFuY2hvclBhcnQudG8ocGFydCk7XG5cdFx0XHRjYXNlICdwcm9ncmVzc01lc3NhZ2UnOiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0Y2FzZSAndHJlZURhdGEnOiByZXR1cm4gQ2hhdFJlc3BvbnNlRmlsZXNQYXJ0LnRvKHBhcnQpO1xuXHRcdFx0Y2FzZSAnY29tbWFuZCc6IHJldHVybiBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydC50byhwYXJ0LCBjb21tYW5kc0NvbnZlcnRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRBZ2VudFJlcXVlc3Qge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGxvY2F0aW9uMjogdnNjb2RlLkNoYXRSZXF1ZXN0RWRpdG9yRGF0YSB8IHZzY29kZS5DaGF0UmVxdWVzdE5vdGVib29rRGF0YSB8IHVuZGVmaW5lZCwgbW9kZWw6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCwgbW9kZWxDb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCwgZGlhZ25vc3RpY3M6IHJlYWRvbmx5IFt2c2NvZGUuVXJpLCByZWFkb25seSB2c2NvZGUuRGlhZ25vc3RpY1tdXVtdLCB0b29sczogTWFwPHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uLCBib29sZWFuPiwgZXh0ZW5zaW9uOiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHZzY29kZS5DaGF0UmVxdWVzdCB7XG5cblx0XHRjb25zdCB0b29sUmVmZXJlbmNlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgdmFyaWFibGVSZWZlcmVuY2VzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgcmVxdWVzdC52YXJpYWJsZXMudmFyaWFibGVzKSB7XG5cdFx0XHRpZiAodi5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXMucHVzaCh2KTtcblx0XHRcdH0gZWxzZSBpZiAodi5raW5kID09PSAndG9vbHNldCcpIHtcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXMucHVzaCguLi52LnZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhcmlhYmxlUmVmZXJlbmNlcy5wdXNoKHYpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSkgPz8gcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCByZXF1ZXN0V2l0aEFsbFByb3BzOiB2c2NvZGUuQ2hhdFJlcXVlc3QgPSB7XG5cdFx0XHRpZDogcmVxdWVzdC5yZXF1ZXN0SWQsXG5cdFx0XHRwcm9tcHQ6IHJlcXVlc3QubWVzc2FnZSxcblx0XHRcdGNvbW1hbmQ6IHJlcXVlc3QuY29tbWFuZCxcblx0XHRcdGF0dGVtcHQ6IHJlcXVlc3QuYXR0ZW1wdCA/PyAwLFxuXHRcdFx0ZW5hYmxlQ29tbWFuZERldGVjdGlvbjogcmVxdWVzdC5lbmFibGVDb21tYW5kRGV0ZWN0aW9uID8/IHRydWUsXG5cdFx0XHRpc1BhcnRpY2lwYW50RGV0ZWN0ZWQ6IHJlcXVlc3QuaXNQYXJ0aWNpcGFudERldGVjdGVkID8/IGZhbHNlLFxuXHRcdFx0aXNWb2ljZU1vZGVJbnB1dDogcmVxdWVzdC5pc1ZvaWNlTW9kZUlucHV0LFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHJlZmVyZW5jZXM6IHZhcmlhYmxlUmVmZXJlbmNlc1xuXHRcdFx0XHQuZmxhdE1hcCh2ID0+IENoYXRQcm9tcHRSZWZlcmVuY2UudG9SZWZlcmVuY2VzKHYsIGRpYWdub3N0aWNzLCBsb2dTZXJ2aWNlKSksXG5cdFx0XHR0b29sUmVmZXJlbmNlczogdG9vbFJlZmVyZW5jZXMubWFwKENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZS50byksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdExvY2F0aW9uLnRvKHJlcXVlc3QubG9jYXRpb24pLFxuXHRcdFx0YWNjZXB0ZWRDb25maXJtYXRpb25EYXRhOiByZXF1ZXN0LmFjY2VwdGVkQ29uZmlybWF0aW9uRGF0YSxcblx0XHRcdHJlamVjdGVkQ29uZmlybWF0aW9uRGF0YTogcmVxdWVzdC5yZWplY3RlZENvbmZpcm1hdGlvbkRhdGEsXG5cdFx0XHRsb2NhdGlvbjIsXG5cdFx0XHR0b29sSW52b2NhdGlvblRva2VuOiBPYmplY3QuZnJlZXplPElUb29sSW52b2NhdGlvbkNvbnRleHQ+KHsgc2Vzc2lvblJlc291cmNlOiByZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSwgd29ya2luZ0RpcmVjdG9yeTogVVJJLnJldml2ZShyZXF1ZXN0LndvcmtpbmdEaXJlY3RvcnkpIH0pIGFzIG5ldmVyLFxuXHRcdFx0dG9vbHMsXG5cdFx0XHRtb2RlbCxcblx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbixcblx0XHRcdGVkaXRlZEZpbGVFdmVudHM6IHJlcXVlc3QuZWRpdGVkRmlsZUV2ZW50cyxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHJlcXVlc3QubW9kZUluc3RydWN0aW9ucz8uY29udGVudCxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnMyOiBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMudG8ocmVxdWVzdC5tb2RlSW5zdHJ1Y3Rpb25zKSxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogcmVxdWVzdC5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogcmVxdWVzdC5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdHN1YkFnZW50TmFtZTogcmVxdWVzdC5zdWJBZ2VudE5hbWUsXG5cdFx0XHRwYXJlbnRSZXF1ZXN0SWQ6IHJlcXVlc3QucGFyZW50UmVxdWVzdElkLFxuXHRcdFx0aGFzSG9va3NFbmFibGVkOiByZXF1ZXN0Lmhhc0hvb2tzRW5hYmxlZCA/PyBmYWxzZSxcblx0XHRcdGhvb2tzOiByZXF1ZXN0Lmhvb2tzID8gQ2hhdFJlcXVlc3RIb29rc0NvbnZlcnRlci50byhyZXF1ZXN0Lmhvb2tzKSA6IHVuZGVmaW5lZCxcblx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiByZXF1ZXN0LmlzU3lzdGVtSW5pdGlhdGVkLFxuXHRcdH07XG5cblx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5pZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuYXR0ZW1wdDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuZW5hYmxlQ29tbWFuZERldGVjdGlvbjtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuaXNQYXJ0aWNpcGFudERldGVjdGVkO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5pc1ZvaWNlTW9kZUlucHV0O1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5sb2NhdGlvbjtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkubG9jYXRpb24yO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5lZGl0ZWRGaWxlRXZlbnRzO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5zZXNzaW9uSWQ7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLnN1YkFnZW50SW52b2NhdGlvbklkO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5zdWJBZ2VudE5hbWU7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLnBhcmVudFJlcXVlc3RJZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuaGFzSG9va3NFbmFibGVkO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5ob29rcztcblx0XHR9XG5cblx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpKSB7XG5cdFx0XHRkZWxldGUgcmVxdWVzdFdpdGhBbGxQcm9wcy5hY2NlcHRlZENvbmZpcm1hdGlvbkRhdGE7XG5cdFx0XHRkZWxldGUgcmVxdWVzdFdpdGhBbGxQcm9wcy5yZWplY3RlZENvbmZpcm1hdGlvbkRhdGE7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLnRvb2xzO1xuXHRcdH1cblxuXG5cdFx0cmV0dXJuIHJlcXVlc3RXaXRoQWxsUHJvcHM7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0TG9jYXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8obG9jOiBDaGF0QWdlbnRMb2NhdGlvbik6IHR5cGVzLkNoYXRMb2NhdGlvbiB7XG5cdFx0c3dpdGNoIChsb2MpIHtcblx0XHRcdGNhc2UgQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2s6IHJldHVybiB0eXBlcy5DaGF0TG9jYXRpb24uTm90ZWJvb2s7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsOiByZXR1cm4gdHlwZXMuQ2hhdExvY2F0aW9uLlRlcm1pbmFsO1xuXHRcdFx0Y2FzZSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0OiByZXR1cm4gdHlwZXMuQ2hhdExvY2F0aW9uLlBhbmVsO1xuXHRcdFx0Y2FzZSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmU6IHJldHVybiB0eXBlcy5DaGF0TG9jYXRpb24uRWRpdG9yO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGxvYzogdHlwZXMuQ2hhdExvY2F0aW9uKTogQ2hhdEFnZW50TG9jYXRpb24ge1xuXHRcdHN3aXRjaCAobG9jKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRMb2NhdGlvbi5Ob3RlYm9vazogcmV0dXJuIENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rO1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0TG9jYXRpb24uVGVybWluYWw6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbDtcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdExvY2F0aW9uLlBhbmVsOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdExvY2F0aW9uLkVkaXRvcjogcmV0dXJuIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odHlwZTogdHlwZXMuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHR5cGUuaWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaWQ6IHN0cmluZyk6IHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUge1xuXHRcdHN3aXRjaCAoaWQpIHtcblx0XHRcdGNhc2UgJ2FnZW50JzogcmV0dXJuIHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuQWdlbnQ7XG5cdFx0XHRjYXNlICdza2lsbCc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLlNraWxsO1xuXHRcdFx0Y2FzZSAnaW5zdHJ1Y3Rpb25zJzogcmV0dXJuIHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuSW5zdHJ1Y3Rpb25zO1xuXHRcdFx0Y2FzZSAncHJvbXB0JzogcmV0dXJuIHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuUHJvbXB0O1xuXHRcdFx0Y2FzZSAnaG9vayc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLkhvb2s7XG5cdFx0XHRjYXNlICdwbHVnaW5zJzogcmV0dXJuIHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuUGx1Z2lucztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBuZXcgdHlwZXMuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZShpZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFByb21wdFJlZmVyZW5jZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b1JlZmVyZW5jZXModmFyaWFibGU6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGRpYWdub3N0aWNzOiByZWFkb25seSBbdnNjb2RlLlVyaSwgcmVhZG9ubHkgdnNjb2RlLkRpYWdub3N0aWNbXV1bXSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiB2c2NvZGUuQ2hhdFByb21wdFJlZmVyZW5jZVtdIHtcblx0XHRjb25zdCByZWZlcmVuY2UgPSB0byh2YXJpYWJsZSwgZGlhZ25vc3RpY3MsIGxvZ1NlcnZpY2UpO1xuXHRcdGlmICghcmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGlzRWxlbWVudFZhcmlhYmxlRW50cnkodmFyaWFibGUpID8gdmFyaWFibGUgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gW3JlZmVyZW5jZV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW1hZ2VEYXRhID0gY29lcmNlSW1hZ2VCdWZmZXIoZWxlbWVudC5pbWFnZURhdGEpO1xuXHRcdGlmICghaW1hZ2VEYXRhKSB7XG5cdFx0XHRyZXR1cm4gW3JlZmVyZW5jZV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdHJlZmVyZW5jZSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGAke3ZhcmlhYmxlLmlkfS1zY3JlZW5zaG90YCxcblx0XHRcdFx0bmFtZTogYCR7dmFyaWFibGUubmFtZX0gc2NyZWVuc2hvdGAsXG5cdFx0XHRcdHZhbHVlOiBuZXcgdHlwZXMuQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEoXG5cdFx0XHRcdFx0ZWxlbWVudC5pbWFnZU1pbWVUeXBlID8/ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZShpbWFnZURhdGEpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fVxuXHRcdF07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFyaWFibGU6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGRpYWdub3N0aWNzOiByZWFkb25seSBbdnNjb2RlLlVyaSwgcmVhZG9ubHkgdnNjb2RlLkRpYWdub3N0aWNbXV1bXSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiB2c2NvZGUuQ2hhdFByb21wdFJlZmVyZW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHZhbHVlOiB2c2NvZGUuQ2hhdFByb21wdFJlZmVyZW5jZVsndmFsdWUnXSA9IHZhcmlhYmxlLnZhbHVlO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdGxldCB2YXJTdHI6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHZhclN0ciA9IEpTT04uc3RyaW5naWZ5KHZhcmlhYmxlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR2YXJTdHIgPSBga2luZD0ke3ZhcmlhYmxlLmtpbmR9LCBpZD0ke3ZhcmlhYmxlLmlkfSwgbmFtZT0ke3ZhcmlhYmxlLm5hbWV9YDtcblx0XHRcdH1cblxuXHRcdFx0bG9nU2VydmljZS5lcnJvcihgW0NoYXRQcm9tcHRSZWZlcmVuY2VdIElnbm9yaW5nIGludmFsaWQgcmVmZXJlbmNlIGluIHZhcmlhYmxlOiAke3ZhclN0cn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVXJpQ29tcG9uZW50cyh2YWx1ZSkpIHtcblx0XHRcdHZhbHVlID0gVVJJLnJldml2ZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICd1cmknIGluIHZhbHVlICYmICdyYW5nZScgaW4gdmFsdWUgJiYgaXNVcmlDb21wb25lbnRzKHZhbHVlLnVyaSkpIHtcblx0XHRcdHZhbHVlID0gTG9jYXRpb24udG8ocmV2aXZlKHZhbHVlKSk7XG5cdFx0fSBlbHNlIGlmIChpc0ltYWdlVmFyaWFibGVFbnRyeSh2YXJpYWJsZSkpIHtcblx0XHRcdGNvbnN0IHJlZiA9IHZhcmlhYmxlLnJlZmVyZW5jZXM/LlswXT8ucmVmZXJlbmNlO1xuXHRcdFx0dmFsdWUgPSBuZXcgdHlwZXMuQ2hhdFJlZmVyZW5jZUJpbmFyeURhdGEoXG5cdFx0XHRcdHZhcmlhYmxlLm1pbWVUeXBlID8/ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUobmV3IFVpbnQ4QXJyYXkoT2JqZWN0LnZhbHVlcyh2YXJpYWJsZS52YWx1ZSBhcyBudW1iZXJbXSkpKSxcblx0XHRcdFx0cmVmICYmIFVSSS5pc1VyaShyZWYpID8gcmVmIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR2YXJpYWJsZS5pc1Bhc3RlZCxcblx0XHRcdFx0dmFyaWFibGUuaXNVUkxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmICh2YXJpYWJsZS5raW5kID09PSAnZGlhZ25vc3RpYycpIHtcblx0XHRcdGNvbnN0IGZpbHRlclNldmVyaXR5ID0gdmFyaWFibGUuZmlsdGVyU2V2ZXJpdHkgJiYgRGlhZ25vc3RpY1NldmVyaXR5LnRvKHZhcmlhYmxlLmZpbHRlclNldmVyaXR5KTtcblx0XHRcdGNvbnN0IGZpbHRlclVyaSA9IHZhcmlhYmxlLmZpbHRlclVyaSAmJiBVUkkucmV2aXZlKHZhcmlhYmxlLmZpbHRlclVyaSkudG9TdHJpbmcoKTtcblx0XHRcdHZhbHVlID0gbmV3IHR5cGVzLkNoYXRSZWZlcmVuY2VEaWFnbm9zdGljKGRpYWdub3N0aWNzLm1hcCgoW3VyaSwgZF0pOiBbdnNjb2RlLlVyaSwgdnNjb2RlLkRpYWdub3N0aWNbXV0gPT4ge1xuXHRcdFx0XHRpZiAodmFyaWFibGUuZmlsdGVyVXJpICYmIHVyaS50b1N0cmluZygpICE9PSBmaWx0ZXJVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gW3VyaSwgW11dO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFt1cmksIGQuZmlsdGVyKGQgPT4ge1xuXHRcdFx0XHRcdGlmIChmaWx0ZXJTZXZlcml0eSAmJiBkLnNldmVyaXR5ID4gZmlsdGVyU2V2ZXJpdHkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHZhcmlhYmxlLmZpbHRlclJhbmdlICYmICFlZGl0b3JSYW5nZS5SYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHZhcmlhYmxlLmZpbHRlclJhbmdlLCBSYW5nZS5mcm9tKGQucmFuZ2UpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KV07XG5cdFx0XHR9KS5maWx0ZXIoKFssIGRdKSA9PiBkLmxlbmd0aCA+IDApKTtcblx0XHR9XG5cdFx0bGV0IHRvb2xSZWZlcmVuY2VzO1xuXHRcdGlmIChpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSB8fCBpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSkge1xuXHRcdFx0aWYgKHZhcmlhYmxlLnRvb2xSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzID0gQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlcy50byh2YXJpYWJsZS50b29sUmVmZXJlbmNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB2YXJpYWJsZS5pZCxcblx0XHRcdG5hbWU6IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHRyYW5nZTogdmFyaWFibGUucmFuZ2UgJiYgW3ZhcmlhYmxlLnJhbmdlLnN0YXJ0LCB2YXJpYWJsZS5yYW5nZS5lbmRFeGNsdXNpdmVdLFxuXHRcdFx0dG9vbFJlZmVyZW5jZXMsXG5cdFx0XHR2YWx1ZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHZhcmlhYmxlLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YXJpYWJsZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IHZzY29kZS5DaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2Uge1xuXHRcdGNvbnN0IHZhbHVlID0gdmFyaWFibGUudmFsdWU7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9vbCByZWZlcmVuY2UnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdmFyaWFibGUuaWQsXG5cdFx0XHRyYW5nZTogdmFyaWFibGUucmFuZ2UgJiYgW3ZhcmlhYmxlLnJhbmdlLnN0YXJ0LCB2YXJpYWJsZS5yYW5nZS5lbmRFeGNsdXNpdmVdLFxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZXMge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFyaWFibGVzOiByZWFkb25seSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdKTogdnNjb2RlLkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZVtdIHtcblx0XHRjb25zdCB0b29sUmVmZXJlbmNlcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgdiBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmICh2LmtpbmQgPT09ICd0b29sJykge1xuXHRcdFx0XHR0b29sUmVmZXJlbmNlcy5wdXNoKENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZS50byh2KSk7XG5cdFx0XHR9IGVsc2UgaWYgKHYua2luZCA9PT0gJ3Rvb2xzZXQnKSB7XG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzLnB1c2goLi4udi52YWx1ZS5tYXAoQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlLnRvKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9vbCByZWZlcmVuY2UgaW4gcHJvbXB0IHZhcmlhYmxlcycpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdG9vbFJlZmVyZW5jZXM7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8obW9kZTogSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB8IER0bzxJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zPiB8IHVuZGVmaW5lZCk6IHZzY29kZS5DaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmIChtb2RlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUobW9kZS51cmkpLFxuXHRcdFx0XHRuYW1lOiBtb2RlLm5hbWUsXG5cdFx0XHRcdGNvbnRlbnQ6IG1vZGUuY29udGVudCxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZXMudG8ocmV2aXZlKG1vZGUudG9vbFJlZmVyZW5jZXMpKSxcblx0XHRcdFx0YWxsb3dlZFN1YmFnZW50czogbW9kZS5hbGxvd2VkU3ViYWdlbnRzLFxuXHRcdFx0XHRtZXRhZGF0YTogbW9kZS5tZXRhZGF0YSxcblx0XHRcdFx0aXNCdWlsdGluOiBtb2RlLmlzQnVpbHRpbixcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShtb2RlOiB2c2NvZGUuQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkKTogSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG1vZGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogbW9kZS51cmksXG5cdFx0XHRcdG5hbWU6IG1vZGUubmFtZSxcblx0XHRcdFx0Y29udGVudDogbW9kZS5jb250ZW50LFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogbW9kZS50b29sUmVmZXJlbmNlcz8ubWFwKHJlZiA9PiAoe1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sJyBhcyBjb25zdCxcblx0XHRcdFx0XHRpZDogcmVmLm5hbWUsXG5cdFx0XHRcdFx0bmFtZTogcmVmLm5hbWUsXG5cdFx0XHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyYW5nZTogcmVmLnJhbmdlID8geyBzdGFydDogcmVmLnJhbmdlWzBdLCBlbmRFeGNsdXNpdmU6IHJlZi5yYW5nZVsxXSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KSkgPz8gW10sXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IG1vZGUuYWxsb3dlZFN1YmFnZW50cyxcblx0XHRcdFx0bWV0YWRhdGE6IG1vZGUubWV0YWRhdGEsXG5cdFx0XHRcdGlzQnVpbHRpbjogbW9kZS5pc0J1aWx0aW4sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEFnZW50Q29tcGxldGlvbkl0ZW0ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuQ2hhdENvbXBsZXRpb25JdGVtLCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBleHRIb3N0UHJvdG9jb2wuSUNoYXRBZ2VudENvbXBsZXRpb25JdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGZ1bGxOYW1lOiBpdGVtLmZ1bGxOYW1lLFxuXHRcdFx0aWNvbjogaXRlbS5pY29uPy5pZCxcblx0XHRcdHZhbHVlOiBpdGVtLnZhbHVlc1swXS52YWx1ZSxcblx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdGRldGFpbDogaXRlbS5kZXRhaWwsXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBpdGVtLmRvY3VtZW50YXRpb24sXG5cdFx0XHRjb21tYW5kOiBjb21tYW5kc0NvbnZlcnRlci50b0ludGVybmFsKGl0ZW0uY29tbWFuZCwgZGlzcG9zYWJsZXMpLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0QWdlbnRSZXN1bHQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0KTogdnNjb2RlLkNoYXRSZXN1bHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlcnJvckRldGFpbHM6IHJlc3VsdC5lcnJvckRldGFpbHMsXG5cdFx0XHRtZXRhZGF0YTogcmV2aXZlTWV0YWRhdGEocmVzdWx0Lm1ldGFkYXRhKSxcblx0XHRcdG5leHRRdWVzdGlvbjogcmVzdWx0Lm5leHRRdWVzdGlvbixcblx0XHRcdGRldGFpbHM6IHJlc3VsdC5kZXRhaWxzLFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmVzdWx0OiB2c2NvZGUuQ2hhdFJlc3VsdCk6IER0bzxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVycm9yRGV0YWlsczogcmVzdWx0LmVycm9yRGV0YWlscyxcblx0XHRcdG1ldGFkYXRhOiByZXN1bHQubWV0YWRhdGEsXG5cdFx0XHRuZXh0UXVlc3Rpb246IHJlc3VsdC5uZXh0UXVlc3Rpb24sXG5cdFx0XHRkZXRhaWxzOiByZXN1bHQuZGV0YWlscyxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmV2aXZlTWV0YWRhdGEobWV0YWRhdGE6IElDaGF0QWdlbnRSZXN1bHRbJ21ldGFkYXRhJ10pIHtcblx0XHRyZXR1cm4gY2xvbmVBbmRDaGFuZ2UobWV0YWRhdGEsIHZhbHVlID0+IHtcblx0XHRcdGlmICh2YWx1ZS4kbWlkID09PSBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdChjbG9uZUFuZENoYW5nZSh2YWx1ZS5jb250ZW50LCByZXZpdmVNZXRhZGF0YSkpO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZS4kbWlkID09PSBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KHZhbHVlLnZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KHZhbHVlLnZhbHVlLCB2YWx1ZS5pZCwgdmFsdWUubWV0YWRhdGEpO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZS4kbWlkID09PSBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCh2YWx1ZS52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0bGV0IGJ1ZmZlcjogVWludDhBcnJheTtcblx0XHRcdFx0Ly8gY29ycmVjdGlvbiBmb3Igb2xkIGRhdGEgc2VyaWFsaXplZCBwcmUtMzAzMTUxXG5cdFx0XHRcdGlmICh2YWx1ZS5kYXRhICYmIHR5cGVvZiB2YWx1ZS5kYXRhID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5kYXRhLnR5cGUgPT09ICdCdWZmZXInICYmIEFycmF5LmlzQXJyYXkodmFsdWUuZGF0YS5kYXRhKSkge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KHZhbHVlLmRhdGEuZGF0YSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlLmRhdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGJ1ZmZlciA9IGRlY29kZUJhc2U2NCh2YWx1ZS5kYXRhKS5idWZmZXI7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheSgwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChidWZmZXIsIHZhbHVlLm1pbWVUeXBlLCB2YWx1ZS5hdWRpZW5jZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0QWdlbnRVc2VyQWN0aW9uRXZlbnQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0LCBldmVudDogSUNoYXRVc2VyQWN0aW9uRXZlbnQsIGNvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlcik6IHZzY29kZS5DaGF0VXNlckFjdGlvbkV2ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXZlbnQuYWN0aW9uLmtpbmQgPT09ICd2b3RlJykge1xuXHRcdFx0Ly8gSXMgdGhlIFwiZmVlZGJhY2tcIiB0eXBlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWhSZXN1bHQgPSBDaGF0QWdlbnRSZXN1bHQudG8ocmVzdWx0KTtcblx0XHRpZiAoZXZlbnQuYWN0aW9uLmtpbmQgPT09ICdjb21tYW5kJykge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGV2ZW50LmFjdGlvbi5jb21tYW5kQnV0dG9uLmNvbW1hbmQ7XG5cdFx0XHRjb25zdCBjb21tYW5kQnV0dG9uID0ge1xuXHRcdFx0XHRjb21tYW5kOiBjb21tYW5kc0NvbnZlcnRlci5mcm9tSW50ZXJuYWwoY29tbWFuZCkgPz8geyBjb21tYW5kOiBjb21tYW5kLmlkLCB0aXRsZTogY29tbWFuZC50aXRsZSB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvbW1hbmRBY3Rpb246IHZzY29kZS5DaGF0Q29tbWFuZEFjdGlvbiA9IHsga2luZDogJ2NvbW1hbmQnLCBjb21tYW5kQnV0dG9uIH07XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246IGNvbW1hbmRBY3Rpb24sIHJlc3VsdDogZWhSZXN1bHQgfTtcblx0XHR9IGVsc2UgaWYgKGV2ZW50LmFjdGlvbi5raW5kID09PSAnZm9sbG93VXAnKSB7XG5cdFx0XHRjb25zdCBmb2xsb3d1cEFjdGlvbjogdnNjb2RlLkNoYXRGb2xsb3d1cEFjdGlvbiA9IHsga2luZDogJ2ZvbGxvd1VwJywgZm9sbG93dXA6IENoYXRGb2xsb3d1cC50byhldmVudC5hY3Rpb24uZm9sbG93dXApIH07XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246IGZvbGxvd3VwQWN0aW9uLCByZXN1bHQ6IGVoUmVzdWx0IH07XG5cdFx0fSBlbHNlIGlmIChldmVudC5hY3Rpb24ua2luZCA9PT0gJ2lubGluZUNoYXQnKSB7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246IHsga2luZDogJ2VkaXRvcicsIGFjY2VwdGVkOiBldmVudC5hY3Rpb24uYWN0aW9uID09PSAnYWNjZXB0ZWQnIH0sIHJlc3VsdDogZWhSZXN1bHQgfTtcblx0XHR9IGVsc2UgaWYgKGV2ZW50LmFjdGlvbi5raW5kID09PSAnY2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uJykge1xuXG5cdFx0XHRjb25zdCBvdXRjb21lcyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FjY2VwdGVkJywgdHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZS5BY2NlcHRlZF0sXG5cdFx0XHRcdFsncmVqZWN0ZWQnLCB0eXBlcy5DaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lLlJlamVjdGVkXSxcblx0XHRcdFx0WydzYXZlZCcsIHR5cGVzLkNoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUuU2F2ZWRdLFxuXHRcdFx0XSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdGtpbmQ6ICdjaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb24nLFxuXHRcdFx0XHRcdG91dGNvbWU6IG91dGNvbWVzLmdldChldmVudC5hY3Rpb24ub3V0Y29tZSkgPz8gdHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZS5SZWplY3RlZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUoZXZlbnQuYWN0aW9uLnVyaSksXG5cdFx0XHRcdFx0aGFzUmVtYWluaW5nRWRpdHM6IGV2ZW50LmFjdGlvbi5oYXNSZW1haW5pbmdFZGl0c1xuXHRcdFx0XHR9LCByZXN1bHQ6IGVoUmVzdWx0XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQuYWN0aW9uLmtpbmQgPT09ICdjaGF0RWRpdGluZ0h1bmtBY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBvdXRjb21lcyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FjY2VwdGVkJywgdHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZS5BY2NlcHRlZF0sXG5cdFx0XHRcdFsncmVqZWN0ZWQnLCB0eXBlcy5DaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lLlJlamVjdGVkXSxcblx0XHRcdF0pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRraW5kOiAnY2hhdEVkaXRpbmdIdW5rQWN0aW9uJyxcblx0XHRcdFx0XHRvdXRjb21lOiBvdXRjb21lcy5nZXQoZXZlbnQuYWN0aW9uLm91dGNvbWUpID8/IHR5cGVzLkNoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUuUmVqZWN0ZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkucmV2aXZlKGV2ZW50LmFjdGlvbi51cmkpLFxuXHRcdFx0XHRcdGhhc1JlbWFpbmluZ0VkaXRzOiBldmVudC5hY3Rpb24uaGFzUmVtYWluaW5nRWRpdHMsXG5cdFx0XHRcdFx0bGluZUNvdW50OiBldmVudC5hY3Rpb24ubGluZUNvdW50LFxuXHRcdFx0XHRcdGxpbmVzQWRkZWQ6IGV2ZW50LmFjdGlvbi5saW5lc0FkZGVkLFxuXHRcdFx0XHRcdGxpbmVzUmVtb3ZlZDogZXZlbnQuYWN0aW9uLmxpbmVzUmVtb3ZlZFxuXHRcdFx0XHR9LCByZXN1bHQ6IGVoUmVzdWx0XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246IGV2ZW50LmFjdGlvbiwgcmVzdWx0OiBlaFJlc3VsdCB9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlcm1pbmFsUXVpY2tGaXgge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShxdWlja0ZpeDogdnNjb2RlLlRlcm1pbmFsUXVpY2tGaXhUZXJtaW5hbENvbW1hbmQgfCB2c2NvZGUuVGVybWluYWxRdWlja0ZpeE9wZW5lciB8IHZzY29kZS5Db21tYW5kLCBjb252ZXJ0ZXI6IENvbW1hbmQuSUNvbW1hbmRzQ29udmVydGVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogZXh0SG9zdFByb3RvY29sLklUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kRHRvIHwgZXh0SG9zdFByb3RvY29sLklUZXJtaW5hbFF1aWNrRml4T3BlbmVyRHRvIHwgZXh0SG9zdFByb3RvY29sLklDb21tYW5kRHRvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoJ3Rlcm1pbmFsQ29tbWFuZCcgaW4gcXVpY2tGaXgpIHtcblx0XHRcdHJldHVybiB7IHRlcm1pbmFsQ29tbWFuZDogcXVpY2tGaXgudGVybWluYWxDb21tYW5kLCBzaG91bGRFeGVjdXRlOiBxdWlja0ZpeC5zaG91bGRFeGVjdXRlIH07XG5cdFx0fVxuXHRcdGlmICgndXJpJyBpbiBxdWlja0ZpeCkge1xuXHRcdFx0cmV0dXJuIHsgdXJpOiBxdWlja0ZpeC51cmkgfTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnZlcnRlci50b0ludGVybmFsKHF1aWNrRml4LCBkaXNwb3NhYmxlcyk7XG5cdH1cbn1cbmV4cG9ydCBuYW1lc3BhY2UgVGVybWluYWxDb21wbGV0aW9uSXRlbUR0byB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25JdGVtKTogZXh0SG9zdFByb3RvY29sLklUZXJtaW5hbENvbXBsZXRpb25JdGVtRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uaXRlbSxcblx0XHRcdGRvY3VtZW50YXRpb246IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoaXRlbS5kb2N1bWVudGF0aW9uKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVybWluYWxDb21wbGV0aW9uTGlzdCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGNvbXBsZXRpb25zOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uTGlzdCB8IHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25JdGVtW10sIHBhdGhTZXBhcmF0b3I6IHN0cmluZyk6IGV4dEhvc3RQcm90b2NvbC5UZXJtaW5hbENvbXBsZXRpb25MaXN0RHRvIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShjb21wbGV0aW9ucykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGl0ZW1zOiBjb21wbGV0aW9ucy5tYXAoaSA9PiBUZXJtaW5hbENvbXBsZXRpb25JdGVtRHRvLmZyb20oaSkpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW1zOiBjb21wbGV0aW9ucy5pdGVtcy5tYXAoaSA9PiBUZXJtaW5hbENvbXBsZXRpb25JdGVtRHRvLmZyb20oaSkpLFxuXHRcdFx0cmVzb3VyY2VPcHRpb25zOiBjb21wbGV0aW9ucy5yZXNvdXJjZU9wdGlvbnMgPyBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMuZnJvbShjb21wbGV0aW9ucy5yZXNvdXJjZU9wdGlvbnMsIHBhdGhTZXBhcmF0b3IpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShyZXNvdXJjZU9wdGlvbnM6IHZzY29kZS5UZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMsIHBhdGhTZXBhcmF0b3I6IHN0cmluZyk6IGV4dEhvc3RQcm90b2NvbC5UZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnNEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5yZXNvdXJjZU9wdGlvbnMsXG5cdFx0XHRwYXRoU2VwYXJhdG9yLFxuXHRcdFx0Y3dkOiByZXNvdXJjZU9wdGlvbnMuY3dkLFxuXHRcdFx0Z2xvYlBhdHRlcm46IEdsb2JQYXR0ZXJuLmZyb20ocmVzb3VyY2VPcHRpb25zLmdsb2JQYXR0ZXJuKSA/PyB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUGFydGlhbEFjY2VwdEluZm8ge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRJbmZvKTogdHlwZXMuUGFydGlhbEFjY2VwdEluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQudG8oaW5mby5raW5kKSxcblx0XHRcdGFjY2VwdGVkTGVuZ3RoOiBpbmZvLmFjY2VwdGVkTGVuZ3RoLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCk6IHR5cGVzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQuV29yZDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5Xb3JkO1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLkxpbmU6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQuTGluZTtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5TdWdnZXN0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLlN1Z2dlc3Q7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLlVua25vd247XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0bzxUPihyZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uPFQ+LCBjb252ZXJ0Rm46IChpdGVtOiBUKSA9PiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQpOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbiB7XG5cdFx0aWYgKHJlYXNvbi5raW5kID09PSBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuSWdub3JlZCkge1xuXHRcdFx0Y29uc3Qgc3VwZXJzZWRlZEJ5ID0gcmVhc29uLnN1cGVyc2VkZWRCeSA/IGNvbnZlcnRGbihyZWFzb24uc3VwZXJzZWRlZEJ5KSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IHR5cGVzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQsXG5cdFx0XHRcdHN1cGVyc2VkZWRCeTogc3VwZXJzZWRlZEJ5LFxuXHRcdFx0XHR1c2VyVHlwaW5nRGlzYWdyZWVkOiByZWFzb24udXNlclR5cGluZ0Rpc2FncmVlZCxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLkFjY2VwdGVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiB0eXBlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5BY2NlcHRlZCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiB0eXBlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5SZWplY3RlZCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQpOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZSB7XG5cdFx0aWYgKHZhbHVlID09PSB0eXBlcy5JbmxpbmVDb21wbGV0aW9uRGlzcGxheUxvY2F0aW9uS2luZC5MYWJlbCkge1xuXHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLkxhYmVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25IaW50U3R5bGUuQ29kZTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25IaW50U3R5bGUpOiB0eXBlcy5JbmxpbmVDb21wbGV0aW9uRGlzcGxheUxvY2F0aW9uS2luZCB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLkxhYmVsOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQuTGFiZWw7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQuQ29kZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEZWJ1Z1RyZWVJdGVtIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLkRlYnVnVHJlZUl0ZW0sIGlkOiBudW1iZXIpOiBJRGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRjYW5FZGl0OiBpdGVtLmNhbkVkaXQsXG5cdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiAoaXRlbS5jb2xsYXBzaWJsZVN0YXRlIHx8IERlYnVnVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUpIGFzIERlYnVnVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLFxuXHRcdFx0Y29udGV4dFZhbHVlOiBpdGVtLmNvbnRleHRWYWx1ZSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTGFuZ3VhZ2VNb2RlbFRvb2xTb3VyY2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oc291cmNlOiBEdG88VG9vbERhdGFTb3VyY2U+KTogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW5mb3JtYXRpb25bJ3NvdXJjZSddIHtcblx0XHRpZiAoc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sTUNQU291cmNlKHNvdXJjZS5sYWJlbCwgc291cmNlLnNlcnZlckxhYmVsIHx8IHNvdXJjZS5sYWJlbCwgc291cmNlLmluc3RydWN0aW9ucyk7XG5cdFx0fSBlbHNlIGlmIChzb3VyY2UudHlwZSA9PT0gJ2V4dGVuc2lvbicpIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xFeHRlbnNpb25Tb3VyY2Uoc291cmNlLmV4dGVuc2lvbklkLnZhbHVlLCBzb3VyY2UubGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlTW9kZWxUb29sUmVzdWx0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJlc3VsdDogSVRvb2xSZXN1bHQpOiB2c2NvZGUuRXh0ZW5kZWRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCB7XG5cdFx0Y29uc3QgdG9vbFJlc3VsdCA9IG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdChyZXN1bHQuY29udGVudC5tYXAoaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXRlbS5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQoaXRlbS52YWx1ZSwgaXRlbS5hdWRpZW5jZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGl0ZW0udmFsdWUuZGF0YS5idWZmZXIsIGl0ZW0udmFsdWUubWltZVR5cGUsIGl0ZW0uYXVkaWVuY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydChpdGVtLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSkgYXMgdnNjb2RlLkV4dGVuZGVkTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQ7XG5cdFx0aWYgKHJlc3VsdC50b29sTWV0YWRhdGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9vbFJlc3VsdC50b29sTWV0YWRhdGEgPSByZXN1bHQudG9vbE1ldGFkYXRhO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LnRvb2xSZXN1bHRFcnJvcikge1xuXHRcdFx0dG9vbFJlc3VsdC5oYXNFcnJvciA9ICEhcmVzdWx0LnRvb2xSZXN1bHRFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRvb2xSZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShyZXN1bHQ6IHZzY29kZS5FeHRlbmRlZExhbmd1YWdlTW9kZWxUb29sUmVzdWx0MiwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBEdG88SVRvb2xSZXN1bHQ+IHwgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8RHRvPElUb29sUmVzdWx0Pj4ge1xuXHRcdGlmIChyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UpIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGVja0F1ZGllbmNlQXBpID0gKGl0ZW06IExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydCkgPT4ge1xuXHRcdFx0aWYgKGl0ZW0uYXVkaWVuY2UpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRBdWRpZW5jZScpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgaGFzQnVmZmVycyA9IGZhbHNlO1xuXHRcdGxldCBkZXRhaWxzRHRvOiBEdG88QXJyYXk8VVJJIHwgdHlwZXMuTG9jYXRpb24+IHwgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMgfCBJVG9vbFJlc3VsdE91dHB1dERldGFpbHMgfCB1bmRlZmluZWQ+ID0gdW5kZWZpbmVkO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscykpIHtcblx0XHRcdGRldGFpbHNEdG8gPSByZXN1bHQudG9vbFJlc3VsdERldGFpbHM/Lm1hcChkZXRhaWwgPT4ge1xuXHRcdFx0XHRyZXR1cm4gVVJJLmlzVXJpKGRldGFpbCkgPyBkZXRhaWwgOiBMb2NhdGlvbi5mcm9tKGRldGFpbCBhcyB2c2NvZGUuTG9jYXRpb24pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMyKSB7XG5cdFx0XHRcdGRldGFpbHNEdG8gPSB7XG5cdFx0XHRcdFx0b3V0cHV0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZGF0YScsXG5cdFx0XHRcdFx0XHRtaW1lVHlwZTogKHJlc3VsdC50b29sUmVzdWx0RGV0YWlsczIgYXMgdnNjb2RlLlRvb2xSZXN1bHREYXRhT3V0cHV0KS5taW1lLFxuXHRcdFx0XHRcdFx0dmFsdWU6IFZTQnVmZmVyLndyYXAoKHJlc3VsdC50b29sUmVzdWx0RGV0YWlsczIgYXMgdnNjb2RlLlRvb2xSZXN1bHREYXRhT3V0cHV0KS52YWx1ZSksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHM7XG5cdFx0XHRcdGhhc0J1ZmZlcnMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGR0bzogRHRvPElUb29sUmVzdWx0PiA9IHtcblx0XHRcdGNvbnRlbnQ6IHJlc3VsdC5jb250ZW50Lm1hcChpdGVtID0+IHtcblx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQpIHtcblx0XHRcdFx0XHRjaGVja0F1ZGllbmNlQXBpKGl0ZW0pO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogaXRlbS52YWx1ZSxcblx0XHRcdFx0XHRcdGF1ZGllbmNlOiBpdGVtLmF1ZGllbmNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChpdGVtIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3Byb21wdFRzeCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogaXRlbS52YWx1ZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0gaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0XHRjaGVja0F1ZGllbmNlQXBpKGl0ZW0pO1xuXHRcdFx0XHRcdGhhc0J1ZmZlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRtaW1lVHlwZTogaXRlbS5taW1lVHlwZSxcblx0XHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChpdGVtLmRhdGEpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0YXVkaWVuY2U6IGl0ZW0uYXVkaWVuY2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCBwYXJ0IHR5cGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UpLFxuXHRcdFx0dG9vbFJlc3VsdERldGFpbHM6IGRldGFpbHNEdG8sXG5cdFx0XHR0b29sTWV0YWRhdGE6IHJlc3VsdC50b29sTWV0YWRhdGEsXG5cdFx0XHR0b29sUmVzdWx0RXJyb3I6IHJlc3VsdC5oYXNFcnJvcixcblx0XHR9O1xuXG5cdFx0cmV0dXJuIGhhc0J1ZmZlcnMgPyBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoZHRvKSA6IGR0bztcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEljb25QYXRoIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21UaGVtZUljb24oaWNvblBhdGg6IHZzY29kZS5UaGVtZUljb24pOiBsYW5ndWFnZXMuSWNvblBhdGgge1xuXHRcdHJldHVybiBpY29uUGF0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHtAbGluayB2c2NvZGUuSWNvblBhdGh9IHRvIGFuIHtAbGluayBleHRIb3N0UHJvdG9jb2wuSWNvblBhdGhEdG99LlxuXHQgKiBAbm90ZSBUaGlzIGZ1bmN0aW9uIHdpbGwgdG9sZXJhdGUgc3RyaW5ncyBzcGVjaWZpZWQgaW5zdGVhZCBvZiBVUklzIGluIEljb25QYXRoIGZvciBoaXN0b3JpY2FsIHJlYXNvbnMuXG5cdCAqIFN1Y2ggc3RyaW5ncyBhcmUgdHJlYXRlZCBhcyBmaWxlIHBhdGhzIGFuZCBjb252ZXJ0ZWQgdXNpbmcge0BsaW5rIFVSSS5maWxlfSBmdW5jdGlvbiwgbm90IHtAbGluayBVUkkuZnJvbX0uXG5cdCAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTEwNDMyI2lzc3VlY29tbWVudC03MjYxNDQ1NTYgZm9yIGNvbnRleHQuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdW5kZWZpbmVkKTogdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkljb25QYXRoKTogZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkljb25QYXRoIHwgdW5kZWZpbmVkKTogZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvIHwgdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkljb25QYXRoIHwgdW5kZWZpbmVkKTogZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0gZWxzZSBpZiAoVVJJLmlzVXJpKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIFVSSS5maWxlKHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgJ2RhcmsnIGluIHZhbHVlKSB7XG5cdFx0XHRjb25zdCBkYXJrID0gdHlwZW9mIHZhbHVlLmRhcmsgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUodmFsdWUuZGFyaykgOiB2YWx1ZS5kYXJrO1xuXHRcdFx0Y29uc3QgbGlnaHQgPSB0eXBlb2YgdmFsdWUubGlnaHQgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUodmFsdWUubGlnaHQpIDogdmFsdWUubGlnaHQ7XG5cdFx0XHRyZXR1cm4gIWRhcmsgPyB1bmRlZmluZWQgOiB7IGRhcmssIGxpZ2h0OiBsaWdodCA/PyBkYXJrIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEge0BsaW5rIGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0b30gdG8gYSB7QGxpbmsgdnNjb2RlLkljb25QYXRofS5cblx0ICogQG5vdGUgVGhpcyBpcyBhIHN0cmljdCBjb252ZXJzaW9uIGFuZCB3ZSBhc3N1bWUgdHlwZXMgYXJlIGNvcnJlY3QgaW4gdGhpcyBjYXNlLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvKTogdnNjb2RlLkljb25QYXRoO1xuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0byB8IHVuZGVmaW5lZCk6IHZzY29kZS5JY29uUGF0aCB8IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBleHRIb3N0UHJvdG9jb2wuSWNvblBhdGhEdG8gfCB1bmRlZmluZWQpOiB2c2NvZGUuSWNvblBhdGggfCB1bmRlZmluZWQge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24odmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSBlbHNlIGlmIChpc1VyaUNvbXBvbmVudHModmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnJldml2ZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGljb24gPSB2YWx1ZSBhcyB7IGxpZ2h0OiBVcmlDb21wb25lbnRzOyBkYXJrOiBVcmlDb21wb25lbnRzIH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsaWdodDogVVJJLnJldml2ZShpY29uLmxpZ2h0KSxcblx0XHRcdFx0ZGFyazogVVJJLnJldml2ZShpY29uLmRhcmspXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEFpU2V0dGluZ3NTZWFyY2gge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVNldHRpbmdzU2VhcmNoUmVzdWx0KHJlc3VsdDogdnNjb2RlLlNldHRpbmdzU2VhcmNoUmVzdWx0KTogQWlTZXR0aW5nc1NlYXJjaFJlc3VsdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHF1ZXJ5OiByZXN1bHQucXVlcnksXG5cdFx0XHRraW5kOiBmcm9tU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kKHJlc3VsdC5raW5kKSxcblx0XHRcdHNldHRpbmdzOiByZXN1bHQuc2V0dGluZ3Ncblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZnJvbVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZChraW5kOiBudW1iZXIpOiBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZCB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kLkVNQkVEREVEOlxuXHRcdFx0XHRyZXR1cm4gQWlTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQuRU1CRURERUQ7XG5cdFx0XHRjYXNlIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kLkxMTV9SQU5LRUQ6XG5cdFx0XHRcdHJldHVybiBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZC5MTE1fUkFOS0VEO1xuXHRcdFx0Y2FzZSBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZC5DQU5DRUxFRDpcblx0XHRcdFx0cmV0dXJuIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kLkNBTkNFTEVEO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTWNwU2VydmVyRGVmaW5pdGlvbiB7XG5cdGZ1bmN0aW9uIGlzSHR0cENvbmZpZyhjYW5kaWRhdGU6IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uKTogY2FuZGlkYXRlIGlzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbiB7XG5cdFx0cmV0dXJuICEhKGNhbmRpZGF0ZSBhcyB2c2NvZGUuTWNwSHR0cFNlcnZlckRlZmluaXRpb24pLnVyaTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uKTogTWNwU2VydmVyTGF1bmNoLlNlcmlhbGl6ZWQge1xuXHRcdHJldHVybiBNY3BTZXJ2ZXJMYXVuY2gudG9TZXJpYWxpemVkKFxuXHRcdFx0aXNIdHRwQ29uZmlnKGl0ZW0pXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCxcblx0XHRcdFx0XHR1cmk6IGl0ZW0udXJpLFxuXHRcdFx0XHRcdGhlYWRlcnM6IE9iamVjdC5lbnRyaWVzKGl0ZW0uaGVhZGVycyksXG5cdFx0XHRcdFx0YXV0aGVudGljYXRpb246IChpdGVtIGFzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbjIpLmF1dGhlbnRpY2F0aW9uID8ge1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJJZDogKGl0ZW0gYXMgdnNjb2RlLk1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uMikuYXV0aGVudGljYXRpb24hLnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0XHRzY29wZXM6IChpdGVtIGFzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbjIpLmF1dGhlbnRpY2F0aW9uIS5zY29wZXNcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHRcdDoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdFx0Y3dkOiBpdGVtLmN3ZD8uZnNQYXRoLFxuXHRcdFx0XHRcdGFyZ3M6IGl0ZW0uYXJncyxcblx0XHRcdFx0XHRjb21tYW5kOiBpdGVtLmNvbW1hbmQsXG5cdFx0XHRcdFx0ZW52OiBpdGVtLmVudixcblx0XHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0LyoqIENvbnZlcnRzIGZyb20gdGhlIElQQyBEVE8gdG8gdGhlIEFQSSB0eXBlLiAqL1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oZHRvOiBNY3BTZXJ2ZXJEZWZpbml0aW9uVHlwZS5TZXJpYWxpemVkKTogdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRcdGNvbnN0IGxhdW5jaCA9IE1jcFNlcnZlckxhdW5jaC5mcm9tU2VyaWFsaXplZChkdG8ubGF1bmNoKTtcblx0XHRpZiAobGF1bmNoLnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCkge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbihcblx0XHRcdFx0ZHRvLmxhYmVsLFxuXHRcdFx0XHRsYXVuY2gudXJpLFxuXHRcdFx0XHRPYmplY3QuZnJvbUVudHJpZXMobGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0XHRkdG8uY2FjaGVOb25jZSA9PT0gJyQkTk9ORScgPyB1bmRlZmluZWQgOiBkdG8uY2FjaGVOb25jZSxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5NY3BTdGRpb1NlcnZlckRlZmluaXRpb24oXG5cdFx0XHRcdGR0by5sYWJlbCxcblx0XHRcdFx0bGF1bmNoLmNvbW1hbmQsXG5cdFx0XHRcdFsuLi5sYXVuY2guYXJnc10sXG5cdFx0XHRcdE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhsYXVuY2guZW52KS5tYXAoKFtrZXksIHZhbHVlXSkgPT4gW2tleSwgdmFsdWUgPT09IG51bGwgPyBudWxsIDogU3RyaW5nKHZhbHVlKV0pKSxcblx0XHRcdFx0ZHRvLmNhY2hlTm9uY2UgPT09ICckJE5PTkUnID8gdW5kZWZpbmVkIDogZHRvLmNhY2hlTm9uY2UsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGxhdW5jaC5jd2QpIHtcblx0XHRcdFx0cmVzdWx0LmN3ZCA9IFVSSS5maWxlKGxhdW5jaC5jd2QpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHR5cGU6IG51bWJlcik6IElucHV0VmFsaWRhdGlvblR5cGUge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSB0eXBlcy5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZS5FcnJvcjpcblx0XHRcdFx0cmV0dXJuIElucHV0VmFsaWRhdGlvblR5cGUuRXJyb3I7XG5cdFx0XHRjYXNlIHR5cGVzLlNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlLldhcm5pbmc6XG5cdFx0XHRcdHJldHVybiBJbnB1dFZhbGlkYXRpb25UeXBlLldhcm5pbmc7XG5cdFx0XHRjYXNlIHR5cGVzLlNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlLkluZm9ybWF0aW9uOlxuXHRcdFx0XHRyZXR1cm4gSW5wdXRWYWxpZGF0aW9uVHlwZS5JbmZvcm1hdGlvbjtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBTb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZScpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXF1ZXN0SG9va3NDb252ZXJ0ZXIge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oaG9va3M6IENoYXRSZXF1ZXN0SG9va3MpOiB2c2NvZGUuQ2hhdFJlcXVlc3RIb29rcyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB2c2NvZGUuQ2hhdEhvb2tDb21tYW5kW10+ID0ge307XG5cdFx0Zm9yIChjb25zdCBbaG9va1R5cGUsIGNvbW1hbmRzXSBvZiBPYmplY3QuZW50cmllcyhob29rcykpIHtcblx0XHRcdGlmICghY29tbWFuZHMgfHwgY29tbWFuZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udmVydGVkOiB2c2NvZGUuQ2hhdEhvb2tDb21tYW5kW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gQ2hhdEhvb2tDb21tYW5kLnRvKGNtZCk7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRcdGNvbnZlcnRlZC5wdXNoKHJlc29sdmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnZlcnRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdFtob29rVHlwZV0gPSBjb252ZXJ0ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0SG9va0NvbW1hbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oaG9vazogSVBhcnNlZEhvb2tDb21tYW5kKTogdnNjb2RlLkNoYXRIb29rQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9TKTtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0Y3dkOiBob29rLmN3ZCxcblx0XHRcdGVudjogaG9vay5lbnYsXG5cdFx0XHR0aW1lb3V0OiBob29rLnRpbWVvdXQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRTZXNzaW9uSXRlbSB7XG5cblx0ZnVuY3Rpb24gY29udmVydFN0YXR1cyhzdGF0dXM6IHZzY29kZS5DaGF0U2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCk6IENoYXRTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RhdHVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgMDogLy8gdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZFxuXHRcdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkO1xuXHRcdFx0Y2FzZSAxOiAvLyB2c2NvZGUuQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkXG5cdFx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ7XG5cdFx0XHRjYXNlIDI6IC8vIHZzY29kZS5DaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzXG5cdFx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzO1xuXHRcdFx0Y2FzZSAzOiAvLyB2c2NvZGUuQ2hhdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dFxuXHRcdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oc2Vzc2lvbkNvbnRlbnQ6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0pOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4ge1xuXHRcdC8vIFN1cHBvcnQgYm90aCBuZXcgKGNyZWF0ZWQsIGxhc3RSZXF1ZXN0U3RhcnRlZCwgbGFzdFJlcXVlc3RFbmRlZCkgYW5kIG9sZCAoc3RhcnRUaW1lLCBlbmRUaW1lKSB0aW1pbmcgcHJvcGVydGllc1xuXHRcdGNvbnN0IHRpbWluZyA9IHNlc3Npb25Db250ZW50LnRpbWluZztcblx0XHRjb25zdCBjcmVhdGVkID0gdGltaW5nPy5jcmVhdGVkID8/IHRpbWluZz8uc3RhcnRUaW1lID8/IDA7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3RTdGFydGVkID0gdGltaW5nPy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gdGltaW5nPy5zdGFydFRpbWU7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3RFbmRlZCA9IHRpbWluZz8ubGFzdFJlcXVlc3RFbmRlZCA/PyB0aW1pbmc/LmVuZFRpbWU7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb25Db250ZW50LnJlc291cmNlLFxuXHRcdFx0bGFiZWw6IHNlc3Npb25Db250ZW50LmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNlc3Npb25Db250ZW50LmRlc2NyaXB0aW9uID8gTWFya2Rvd25TdHJpbmcuZnJvbShzZXNzaW9uQ29udGVudC5kZXNjcmlwdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRiYWRnZTogc2Vzc2lvbkNvbnRlbnQuYmFkZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHNlc3Npb25Db250ZW50LmJhZGdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1czogY29udmVydFN0YXR1cyhzZXNzaW9uQ29udGVudC5zdGF0dXMpLFxuXHRcdFx0YXJjaGl2ZWQ6IHNlc3Npb25Db250ZW50LmFyY2hpdmVkLFxuXHRcdFx0dG9vbHRpcDogTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChzZXNzaW9uQ29udGVudC50b29sdGlwKSxcblx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRjcmVhdGVkLFxuXHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogc2Vzc2lvbkNvbnRlbnQuY2hhbmdlcyBpbnN0YW5jZW9mIEFycmF5ID8gc2Vzc2lvbkNvbnRlbnQuY2hhbmdlcyA6IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiBzZXNzaW9uQ29udGVudC5tZXRhZGF0YSxcblx0XHRcdGxlZ2FjeVJlc291cmNlOiBzZXNzaW9uQ29udGVudC5sZWdhY3lSZXNvdXJjZSxcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFNBQVMsVUFBVSx1QkFBdUI7QUFDbkQsU0FBUyxVQUFVLGNBQWMsb0JBQW9CO0FBRXJELFNBQStDLGVBQWU7QUFDOUQsU0FBUyxnQ0FBZ0M7QUFDekMsWUFBWSxpQkFBaUI7QUFFN0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxZQUFZLFlBQVk7QUFDeEIsU0FBUyxPQUFPLGNBQWM7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVTtBQUNuQixTQUEwQiw2QkFBNkI7QUFDdkQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXLGVBQWUsVUFBVSxVQUFVLHlCQUF5QjtBQUNoRixTQUFTLEtBQW9CLHVCQUF1QjtBQUVwRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUV0QyxZQUFZLGlCQUFpQjtBQUc3QixZQUFZLDRCQUE0QjtBQUV4QyxZQUFZLGVBQWU7QUFDM0IsU0FBUyxtQkFBbUIsOEJBQThCO0FBSTFELFNBQTJDLGdCQUFnQixpQkFBaUI7QUFDNUUsU0FBUyxvQkFBb0IsNEJBQTRCO0FBQ3pELFNBQVMsNEJBQTRCLGtCQUFrQjtBQUt2RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFtRSx3QkFBd0Isc0JBQXNCLDJCQUEyQixpQ0FBaUM7QUFDN0ssU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBMkM7QUFDcEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBMkIsK0JBQStCO0FBRTFELFNBQXVHLGdCQUFnQixrQ0FBa0M7QUFDekosWUFBWSxrQkFBa0I7QUFFOUIsU0FBUyxxQ0FBa0U7QUFDM0UsU0FBeUQsaUJBQWlCLDhCQUE4QjtBQUN4RyxZQUFZLGVBQWU7QUFDM0IsU0FBUyxvQkFBb0I7QUFF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LGNBQWMsZUFBZSxNQUFNO0FBQUEsTUFDM0MsVUFBVSxlQUFlO0FBQUEsTUFDekIsU0FBUyxlQUFlLFdBQVcsZUFBZSxPQUFPO0FBQUEsTUFDekQsUUFBUTtBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsZUFBZSxtQkFBbUIsUUFBUSxlQUFlLFVBQVU7QUFBQSxNQUM1RSxVQUFVLGVBQWU7QUFBQSxNQUN6QixnQkFBZ0IsZUFBZTtBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQXhCTyxFQUFBQSxpQkFBUztBQUFBLEdBckJBOyIsCiAgIm5hbWVzIjogWyJTZWxlY3Rpb24iLCAiUmFuZ2UiLCAiTG9jYXRpb24iLCAibG9jYXRpb24iLCAiVG9rZW5UeXBlIiwgIlBvc2l0aW9uIiwgIkRvY3VtZW50U2VsZWN0b3IiLCAiVGFiU2VsZWN0b3IiLCAiRGlhZ25vc3RpY1RhZyIsICJEaWFnbm9zdGljIiwgIkRpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24iLCAiRGlhZ25vc3RpY1NldmVyaXR5IiwgIlZpZXdDb2x1bW4iLCAiTWFya2Rvd25TdHJpbmciLCAiVGhlbWFibGVEZWNvcmF0aW9uQXR0YWNobWVudFJlbmRlck9wdGlvbnMiLCAiVGhlbWFibGVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyIsICJEZWNvcmF0aW9uUmFuZ2VCZWhhdmlvciIsICJEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyIsICJUZXh0RWRpdCIsICJXb3Jrc3BhY2VFZGl0IiwgIlN5bWJvbEtpbmQiLCAiU3ltYm9sVGFnIiwgIldvcmtzcGFjZVN5bWJvbCIsICJEb2N1bWVudFN5bWJvbCIsICJDYWxsSGllcmFyY2h5SXRlbSIsICJDYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsIiwgIkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwiLCAiRGVmaW5pdGlvbkxpbmsiLCAiSG92ZXIiLCAiRXZhbHVhdGFibGVFeHByZXNzaW9uIiwgIklubGluZVZhbHVlIiwgIklubGluZVZhbHVlQ29udGV4dCIsICJEb2N1bWVudEhpZ2hsaWdodCIsICJNdWx0aURvY3VtZW50SGlnaGxpZ2h0IiwgIkNvbXBsZXRpb25UcmlnZ2VyS2luZCIsICJDb21wbGV0aW9uQ29udGV4dCIsICJDb21wbGV0aW9uSXRlbVRhZyIsICJDb21wbGV0aW9uQ29tbWFuZCIsICJDb21wbGV0aW9uSXRlbUtpbmQiLCAiQ29tcGxldGlvbkl0ZW0iLCAiUGFyYW1ldGVySW5mb3JtYXRpb24iLCAiU2lnbmF0dXJlSW5mb3JtYXRpb24iLCAiU2lnbmF0dXJlSGVscCIsICJJbmxheUhpbnQiLCAiSW5sYXlIaW50TGFiZWxQYXJ0IiwgIklubGF5SGludEtpbmQiLCAiRG9jdW1lbnRMaW5rIiwgIkNvbG9yUHJlc2VudGF0aW9uIiwgIkNvbG9yIiwgIlNlbGVjdGlvblJhbmdlIiwgIlRleHREb2N1bWVudFNhdmVSZWFzb24iLCAiVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUiLCAiRW5kT2ZMaW5lIiwgIlByb2dyZXNzTG9jYXRpb24iLCAiRm9sZGluZ1JhbmdlIiwgIkZvbGRpbmdSYW5nZUtpbmQiLCAiVGV4dEVkaXRvck9wZW5PcHRpb25zIiwgIkdsb2JQYXR0ZXJuIiwgIkxhbmd1YWdlU2VsZWN0b3IiLCAiTm90ZWJvb2tSYW5nZSIsICJOb3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5IiwgIk5vdGVib29rQ2VsbEtpbmQiLCAiTm90ZWJvb2tEYXRhIiwgIk5vdGVib29rQ2VsbERhdGEiLCAiTm90ZWJvb2tDZWxsT3V0cHV0SXRlbSIsICJOb3RlYm9va0NlbGxPdXRwdXQiLCAiTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudFBhdHRlcm4iLCAiTm90ZWJvb2tTdGF0dXNCYXJJdGVtIiwgIk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIiwgIk5vdGVib29rRG9jdW1lbnRDb250ZW50T3B0aW9ucyIsICJOb3RlYm9va1JlbmRlcmVyU2NyaXB0IiwgIlRlc3RNZXNzYWdlIiwgIlRlc3RUYWciLCAiVGVzdFJ1blByb2ZpbGUiLCAiVGVzdFJ1blByb2ZpbGVLaW5kIiwgIlRlc3RJdGVtIiwgIlRlc3RSZXN1bHRzIiwgIlRlc3RDb3ZlcmFnZSIsICJDb2RlQWN0aW9uVHJpZ2dlcktpbmQiLCAiVHlwZUhpZXJhcmNoeUl0ZW0iLCAiVmlld0JhZGdlIiwgIkRhdGFUcmFuc2Zlckl0ZW0iLCAiRGF0YVRyYW5zZmVyIiwgIkNoYXRGb2xsb3d1cCIsICJMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlIiwgIkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSIsICJjb250ZW50IiwgIkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIiLCAiQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0IiwgIkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQiLCAiQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCIsICJDaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0IiwgIkNoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0IiwgIkNoYXRSZXNwb25zZUZpbGVzUGFydCIsICJiYXNlVXJpIiwgIml0ZW1zIiwgIkNoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQiLCAiQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCIsICJDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQiLCAiQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQiLCAiQ2hhdFJlc3BvbnNlSG9va1BhcnQiLCAiQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQiLCAiQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCIsICJDaGF0UmVzcG9uc2VXYXJuaW5nUGFydCIsICJDaGF0UmVzcG9uc2VJbmZvUGFydCIsICJDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCIsICJDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQiLCAiQ2hhdFJlc3BvbnNlTW92ZVBhcnQiLCAiQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCIsICJDaGF0VGFzayIsICJDaGF0VGFza1Jlc3VsdCIsICJDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydCIsICJDaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQiLCAiTm90ZWJvb2tFZGl0IiwgIkNoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQiLCAiQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQiLCAiQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCIsICJ2YWx1ZSIsICJDaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0IiwgIkNoYXRSZXNwb25zZVBhcnQiLCAiQ2hhdEFnZW50UmVxdWVzdCIsICJDaGF0TG9jYXRpb24iLCAiQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSIsICJDaGF0UHJvbXB0UmVmZXJlbmNlIiwgImQiLCAiQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlIiwgIkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZXMiLCAiQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIiwgIkNoYXRBZ2VudENvbXBsZXRpb25JdGVtIiwgIkNoYXRBZ2VudFJlc3VsdCIsICJDaGF0QWdlbnRVc2VyQWN0aW9uRXZlbnQiLCAiVGVybWluYWxRdWlja0ZpeCIsICJUZXJtaW5hbENvbXBsZXRpb25JdGVtRHRvIiwgIlRlcm1pbmFsQ29tcGxldGlvbkxpc3QiLCAiVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zIiwgIlBhcnRpYWxBY2NlcHRJbmZvIiwgIlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCIsICJJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uIiwgIklubGluZUNvbXBsZXRpb25IaW50U3R5bGUiLCAiRGVidWdUcmVlSXRlbSIsICJMYW5ndWFnZU1vZGVsVG9vbFNvdXJjZSIsICJMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCIsICJJY29uUGF0aCIsICJBaVNldHRpbmdzU2VhcmNoIiwgIk1jcFNlcnZlckRlZmluaXRpb24iLCAiU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUiLCAiQ2hhdFJlcXVlc3RIb29rc0NvbnZlcnRlciIsICJDaGF0SG9va0NvbW1hbmQiLCAiQ2hhdFNlc3Npb25JdGVtIl0KfQo=
