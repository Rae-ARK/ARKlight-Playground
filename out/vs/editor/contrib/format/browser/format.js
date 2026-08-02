import { asArray, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource, TextModelCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { isCodeEditor } from "../../../browser/editorBrowser.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { FormattingEdit } from "./formattingEdit.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { ExtensionIdentifierSet } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
function getRealAndSyntheticDocumentFormattersOrdered(documentFormattingEditProvider, documentRangeFormattingEditProvider, model) {
  const result = [];
  const seen = new ExtensionIdentifierSet();
  const docFormatter = documentFormattingEditProvider.ordered(model);
  for (const formatter of docFormatter) {
    result.push(formatter);
    if (formatter.extensionId) {
      seen.add(formatter.extensionId);
    }
  }
  const rangeFormatter = documentRangeFormattingEditProvider.ordered(model);
  for (const formatter of rangeFormatter) {
    if (formatter.extensionId) {
      if (seen.has(formatter.extensionId)) {
        continue;
      }
      seen.add(formatter.extensionId);
    }
    result.push({
      displayName: formatter.displayName,
      extensionId: formatter.extensionId,
      provideDocumentFormattingEdits(model2, options, token) {
        return formatter.provideDocumentRangeFormattingEdits(model2, model2.getFullModelRange(), options, token);
      }
    });
  }
  return result;
}
var FormattingKind = /* @__PURE__ */ ((FormattingKind2) => {
  FormattingKind2[FormattingKind2["File"] = 1] = "File";
  FormattingKind2[FormattingKind2["Selection"] = 2] = "Selection";
  return FormattingKind2;
})(FormattingKind || {});
var FormattingMode = /* @__PURE__ */ ((FormattingMode2) => {
  FormattingMode2[FormattingMode2["Explicit"] = 1] = "Explicit";
  FormattingMode2[FormattingMode2["Silent"] = 2] = "Silent";
  return FormattingMode2;
})(FormattingMode || {});
const _FormattingConflicts = class _FormattingConflicts {
  static setFormatterSelector(selector) {
    const remove = _FormattingConflicts._selectors.unshift(selector);
    return { dispose: remove };
  }
  static async select(formatter, document, mode, kind) {
    if (formatter.length === 0) {
      return void 0;
    }
    const selector = Iterable.first(_FormattingConflicts._selectors);
    if (selector) {
      return await selector(formatter, document, mode, kind);
    }
    return void 0;
  }
};
_FormattingConflicts._selectors = new LinkedList();
let FormattingConflicts = _FormattingConflicts;
async function formatDocumentRangesWithSelectedProvider(accessor, editorOrModel, rangeOrRanges, mode, progress, token, userGesture) {
  const instaService = accessor.get(IInstantiationService);
  const { documentRangeFormattingEditProvider: documentRangeFormattingEditProviderRegistry } = accessor.get(ILanguageFeaturesService);
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = documentRangeFormattingEditProviderRegistry.ordered(model);
  const selected = await FormattingConflicts.select(provider, model, mode, 2 /* Selection */);
  if (selected) {
    progress.report(selected);
    await instaService.invokeFunction(formatDocumentRangesWithProvider, selected, editorOrModel, rangeOrRanges, token, userGesture);
  }
}
async function formatDocumentRangesWithProvider(accessor, provider, editorOrModel, rangeOrRanges, token, userGesture) {
  const workerService = accessor.get(IEditorWorkerService);
  const logService = accessor.get(ILogService);
  const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
  let model;
  let cts;
  if (isCodeEditor(editorOrModel)) {
    model = editorOrModel.getModel();
    cts = new EditorStateCancellationTokenSource(editorOrModel, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position, void 0, token);
  } else {
    model = editorOrModel;
    cts = new TextModelCancellationTokenSource(editorOrModel, token);
  }
  const ranges = [];
  let len = 0;
  for (const range of asArray(rangeOrRanges).sort(Range.compareRangesUsingStarts)) {
    if (len > 0 && Range.areIntersectingOrTouching(ranges[len - 1], range)) {
      ranges[len - 1] = Range.fromPositions(ranges[len - 1].getStartPosition(), range.getEndPosition());
    } else {
      len = ranges.push(range);
    }
  }
  const computeEdits = async (range) => {
    logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, range);
    const result = await provider.provideDocumentRangeFormattingEdits(
      model,
      range,
      model.getFormattingOptions(),
      cts.token
    ) || [];
    logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
    return result;
  };
  const hasIntersectingEdit = (a, b) => {
    if (!a.length || !b.length) {
      return false;
    }
    const mergedA = a.reduce((acc, val) => {
      return Range.plusRange(acc, val.range);
    }, a[0].range);
    if (!b.some((x) => {
      return Range.intersectRanges(mergedA, x.range);
    })) {
      return false;
    }
    for (const edit of a) {
      for (const otherEdit of b) {
        if (Range.intersectRanges(edit.range, otherEdit.range)) {
          return true;
        }
      }
    }
    return false;
  };
  const allEdits = [];
  const rawEditsList = [];
  try {
    if (typeof provider.provideDocumentRangesFormattingEdits === "function") {
      logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, ranges);
      const result = await provider.provideDocumentRangesFormattingEdits(
        model,
        ranges,
        model.getFormattingOptions(),
        cts.token
      ) || [];
      logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
      rawEditsList.push(result);
    } else {
      for (const range of ranges) {
        if (cts.token.isCancellationRequested) {
          return true;
        }
        rawEditsList.push(await computeEdits(range));
      }
      for (let i = 0; i < ranges.length; ++i) {
        for (let j = i + 1; j < ranges.length; ++j) {
          if (cts.token.isCancellationRequested) {
            return true;
          }
          if (hasIntersectingEdit(rawEditsList[i], rawEditsList[j])) {
            const mergedRange = Range.plusRange(ranges[i], ranges[j]);
            const edits = await computeEdits(mergedRange);
            ranges.splice(j, 1);
            ranges.splice(i, 1);
            ranges.push(mergedRange);
            rawEditsList.splice(j, 1);
            rawEditsList.splice(i, 1);
            rawEditsList.push(edits);
            i = 0;
            j = 0;
          }
        }
      }
    }
    for (const rawEdits of rawEditsList) {
      if (cts.token.isCancellationRequested) {
        return true;
      }
      const minimalEdits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
      if (minimalEdits) {
        allEdits.push(...minimalEdits);
      }
    }
    if (cts.token.isCancellationRequested) {
      return true;
    }
  } finally {
    cts.dispose();
  }
  if (allEdits.length === 0) {
    return false;
  }
  if (isCodeEditor(editorOrModel)) {
    FormattingEdit.execute(editorOrModel, allEdits, true);
    editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), ScrollType.Immediate);
  } else {
    const [{ range }] = allEdits;
    const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
    model.pushEditOperations([initialSelection], allEdits.map((edit) => {
      return {
        text: edit.text,
        range: Range.lift(edit.range),
        forceMoveMarkers: true
      };
    }), (undoEdits) => {
      for (const { range: range2 } of undoEdits) {
        if (Range.areIntersectingOrTouching(range2, initialSelection)) {
          return [new Selection(range2.startLineNumber, range2.startColumn, range2.endLineNumber, range2.endColumn)];
        }
      }
      return null;
    });
  }
  accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
  return true;
}
async function formatDocumentWithSelectedProvider(accessor, editorOrModel, mode, progress, token, userGesture) {
  const instaService = accessor.get(IInstantiationService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  const selected = await FormattingConflicts.select(provider, model, mode, 1 /* File */);
  if (selected) {
    progress.report(selected);
    await instaService.invokeFunction(formatDocumentWithProvider, selected, editorOrModel, mode, token, userGesture);
  }
}
async function formatDocumentWithProvider(accessor, provider, editorOrModel, mode, token, userGesture) {
  const workerService = accessor.get(IEditorWorkerService);
  const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
  let model;
  let cts;
  if (isCodeEditor(editorOrModel)) {
    model = editorOrModel.getModel();
    cts = new EditorStateCancellationTokenSource(editorOrModel, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position, void 0, token);
  } else {
    model = editorOrModel;
    cts = new TextModelCancellationTokenSource(editorOrModel, token);
  }
  let edits;
  try {
    const rawEdits = await provider.provideDocumentFormattingEdits(
      model,
      model.getFormattingOptions(),
      cts.token
    );
    edits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    if (cts.token.isCancellationRequested) {
      return true;
    }
  } finally {
    cts.dispose();
  }
  if (!edits || edits.length === 0) {
    return false;
  }
  if (isCodeEditor(editorOrModel)) {
    FormattingEdit.execute(editorOrModel, edits, mode !== 2 /* Silent */);
    if (mode !== 2 /* Silent */) {
      editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), ScrollType.Immediate);
    }
  } else {
    const [{ range }] = edits;
    const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
    model.pushEditOperations([initialSelection], edits.map((edit) => {
      return {
        text: edit.text,
        range: Range.lift(edit.range),
        forceMoveMarkers: true
      };
    }), (undoEdits) => {
      for (const { range: range2 } of undoEdits) {
        if (Range.areIntersectingOrTouching(range2, initialSelection)) {
          return [new Selection(range2.startLineNumber, range2.startColumn, range2.endLineNumber, range2.endColumn)];
        }
      }
      return null;
    });
  }
  accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
  return true;
}
async function getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, model, range, options, token) {
  const providers = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
  for (const provider of providers) {
    const rawEdits = await Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token)).catch(onUnexpectedExternalError);
    if (isNonEmptyArray(rawEdits)) {
      return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    }
  }
  return void 0;
}
async function getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, model, options, token) {
  const providers = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  for (const provider of providers) {
    const rawEdits = await Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token)).catch(onUnexpectedExternalError);
    if (isNonEmptyArray(rawEdits)) {
      return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    }
  }
  return void 0;
}
async function getDocumentFormattingEditsWithSelectedProvider(workerService, languageFeaturesService, editorOrModel, mode, token) {
  const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
  const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
  const selected = await FormattingConflicts.select(provider, model, mode, 1 /* File */);
  if (selected) {
    const rawEdits = await Promise.resolve(selected.provideDocumentFormattingEdits(model, model.getOptions(), token)).catch(onUnexpectedExternalError);
    return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
  }
  return void 0;
}
function getOnTypeFormattingEdits(workerService, languageFeaturesService, model, position, ch, options, token) {
  const providers = languageFeaturesService.onTypeFormattingEditProvider.ordered(model);
  if (providers.length === 0) {
    return Promise.resolve(void 0);
  }
  if (providers[0].autoFormatTriggerCharacters.indexOf(ch) < 0) {
    return Promise.resolve(void 0);
  }
  return Promise.resolve(providers[0].provideOnTypeFormattingEdits(model, position, ch, options, token)).catch(onUnexpectedExternalError).then((edits) => {
    return workerService.computeMoreMinimalEdits(model.uri, edits);
  });
}
function isFormattingOptions(obj) {
  const candidate = obj;
  return !!candidate && typeof candidate === "object" && typeof candidate.tabSize === "number" && typeof candidate.insertSpaces === "boolean";
}
CommandsRegistry.registerCommand("_executeFormatRangeProvider", async function(accessor, ...args) {
  const [resource, range, options] = args;
  assertType(URI.isUri(resource));
  assertType(Range.isIRange(range));
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, Range.lift(range), ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
CommandsRegistry.registerCommand("_executeFormatDocumentProvider", async function(accessor, ...args) {
  const [resource, options] = args;
  assertType(URI.isUri(resource));
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
CommandsRegistry.registerCommand("_executeFormatOnTypeProvider", async function(accessor, ...args) {
  const [resource, position, ch, options] = args;
  assertType(URI.isUri(resource));
  assertType(Position.isIPosition(position));
  assertType(typeof ch === "string");
  const resolverService = accessor.get(ITextModelService);
  const workerService = accessor.get(IEditorWorkerService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const reference = await resolverService.createModelReference(resource);
  try {
    return getOnTypeFormattingEdits(workerService, languageFeaturesService, reference.object.textEditorModel, Position.lift(position), ch, ensureFormattingOptions(options, reference), CancellationToken.None);
  } finally {
    reference.dispose();
  }
});
function ensureFormattingOptions(options, reference) {
  let validatedOptions;
  if (isFormattingOptions(options)) {
    validatedOptions = options;
  } else {
    const modelOptions = reference.object.textEditorModel.getOptions();
    validatedOptions = {
      tabSize: modelOptions.tabSize,
      insertSpaces: modelOptions.insertSpaces
    };
  }
  return validatedOptions;
}
export {
  FormattingConflicts,
  FormattingKind,
  FormattingMode,
  formatDocumentRangesWithProvider,
  formatDocumentRangesWithSelectedProvider,
  formatDocumentWithProvider,
  formatDocumentWithSelectedProvider,
  getDocumentFormattingEditsUntilResult,
  getDocumentFormattingEditsWithSelectedProvider,
  getDocumentRangeFormattingEditsUntilResult,
  getOnTypeFormattingEdits,
  getRealAndSyntheticDocumentFormattersOrdered
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQXJyYXksIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclN0YXRlRmxhZywgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSwgVGV4dE1vZGVsQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi9lZGl0b3JTdGF0ZS9icm93c2VyL2VkaXRvclN0YXRlLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciwgRm9ybWF0dGluZ09wdGlvbnMsIFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRm9ybWF0dGluZ0VkaXQgfSBmcm9tICcuL2Zvcm1hdHRpbmdFZGl0LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllclNldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVhbEFuZFN5bnRoZXRpY0RvY3VtZW50Rm9ybWF0dGVyc09yZGVyZWQoXG5cdGRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcjogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8RG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyPixcblx0ZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyPixcblx0bW9kZWw6IElUZXh0TW9kZWxcbik6IERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcltdIHtcblx0Y29uc3QgcmVzdWx0OiBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXJbXSA9IFtdO1xuXHRjb25zdCBzZWVuID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQoKTtcblxuXHQvLyAoMSkgYWRkIGFsbCBkb2N1bWVudCBmb3JtYXR0ZXJcblx0Y29uc3QgZG9jRm9ybWF0dGVyID0gZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9yZGVyZWQobW9kZWwpO1xuXHRmb3IgKGNvbnN0IGZvcm1hdHRlciBvZiBkb2NGb3JtYXR0ZXIpIHtcblx0XHRyZXN1bHQucHVzaChmb3JtYXR0ZXIpO1xuXHRcdGlmIChmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHNlZW4uYWRkKGZvcm1hdHRlci5leHRlbnNpb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gKDIpIGFkZCBhbGwgcmFuZ2UgZm9ybWF0dGVyIGFzIGRvY3VtZW50IGZvcm1hdHRlciAodW5sZXNzIHRoZSBzYW1lIGV4dGVuc2lvbiBhbHJlYWR5IGRpZCB0aGF0KVxuXHRjb25zdCByYW5nZUZvcm1hdHRlciA9IGRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9yZGVyZWQobW9kZWwpO1xuXHRmb3IgKGNvbnN0IGZvcm1hdHRlciBvZiByYW5nZUZvcm1hdHRlcikge1xuXHRcdGlmIChmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdGlmIChzZWVuLmhhcyhmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5hZGQoZm9ybWF0dGVyLmV4dGVuc2lvbklkKTtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0ZGlzcGxheU5hbWU6IGZvcm1hdHRlci5kaXNwbGF5TmFtZSxcblx0XHRcdGV4dGVuc2lvbklkOiBmb3JtYXR0ZXIuZXh0ZW5zaW9uSWQsXG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMobW9kZWwsIG9wdGlvbnMsIHRva2VuKSB7XG5cdFx0XHRcdHJldHVybiBmb3JtYXR0ZXIucHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMobW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBGb3JtYXR0aW5nS2luZCB7XG5cdEZpbGUgPSAxLFxuXHRTZWxlY3Rpb24gPSAyXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZvcm1hdHRpbmdNb2RlIHtcblx0RXhwbGljaXQgPSAxLFxuXHRTaWxlbnQgPSAyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvcm1hdHRpbmdFZGl0UHJvdmlkZXJTZWxlY3RvciB7XG5cdDxUIGV4dGVuZHMgKERvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB8IERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKT4oZm9ybWF0dGVyOiBUW10sIGRvY3VtZW50OiBJVGV4dE1vZGVsLCBtb2RlOiBGb3JtYXR0aW5nTW9kZSwga2luZDogRm9ybWF0dGluZ0tpbmQpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRm9ybWF0dGluZ0NvbmZsaWN0cyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3NlbGVjdG9ycyA9IG5ldyBMaW5rZWRMaXN0PElGb3JtYXR0aW5nRWRpdFByb3ZpZGVyU2VsZWN0b3I+KCk7XG5cblx0c3RhdGljIHNldEZvcm1hdHRlclNlbGVjdG9yKHNlbGVjdG9yOiBJRm9ybWF0dGluZ0VkaXRQcm92aWRlclNlbGVjdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IEZvcm1hdHRpbmdDb25mbGljdHMuX3NlbGVjdG9ycy51bnNoaWZ0KHNlbGVjdG9yKTtcblx0XHRyZXR1cm4geyBkaXNwb3NlOiByZW1vdmUgfTtcblx0fVxuXG5cdHN0YXRpYyBhc3luYyBzZWxlY3Q8VCBleHRlbmRzIChEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIgfCBEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcik+KGZvcm1hdHRlcjogVFtdLCBkb2N1bWVudDogSVRleHRNb2RlbCwgbW9kZTogRm9ybWF0dGluZ01vZGUsIGtpbmQ6IEZvcm1hdHRpbmdLaW5kKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGZvcm1hdHRlci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdG9yID0gSXRlcmFibGUuZmlyc3QoRm9ybWF0dGluZ0NvbmZsaWN0cy5fc2VsZWN0b3JzKTtcblx0XHRpZiAoc2VsZWN0b3IpIHtcblx0XHRcdHJldHVybiBhd2FpdCBzZWxlY3Rvcihmb3JtYXR0ZXIsIGRvY3VtZW50LCBtb2RlLCBraW5kKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZm9ybWF0RG9jdW1lbnRSYW5nZXNXaXRoU2VsZWN0ZWRQcm92aWRlcihcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdGVkaXRvck9yTW9kZWw6IElUZXh0TW9kZWwgfCBJQWN0aXZlQ29kZUVkaXRvcixcblx0cmFuZ2VPclJhbmdlczogUmFuZ2UgfCBSYW5nZVtdLFxuXHRtb2RlOiBGb3JtYXR0aW5nTW9kZSxcblx0cHJvZ3Jlc3M6IElQcm9ncmVzczxEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcj4sXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0dXNlckdlc3R1cmU6IGJvb2xlYW5cbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRjb25zdCB7IGRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyOiBkb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlclJlZ2lzdHJ5IH0gPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWwgPSBpc0NvZGVFZGl0b3IoZWRpdG9yT3JNb2RlbCkgPyBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCkgOiBlZGl0b3JPck1vZGVsO1xuXHRjb25zdCBwcm92aWRlciA9IGRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyUmVnaXN0cnkub3JkZXJlZChtb2RlbCk7XG5cdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgRm9ybWF0dGluZ0NvbmZsaWN0cy5zZWxlY3QocHJvdmlkZXIsIG1vZGVsLCBtb2RlLCBGb3JtYXR0aW5nS2luZC5TZWxlY3Rpb24pO1xuXHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRwcm9ncmVzcy5yZXBvcnQoc2VsZWN0ZWQpO1xuXHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFJhbmdlc1dpdGhQcm92aWRlciwgc2VsZWN0ZWQsIGVkaXRvck9yTW9kZWwsIHJhbmdlT3JSYW5nZXMsIHRva2VuLCB1c2VyR2VzdHVyZSk7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZvcm1hdERvY3VtZW50UmFuZ2VzV2l0aFByb3ZpZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0cHJvdmlkZXI6IERvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLFxuXHRlZGl0b3JPck1vZGVsOiBJVGV4dE1vZGVsIHwgSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdHJhbmdlT3JSYW5nZXM6IFJhbmdlIHwgUmFuZ2VbXSxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHR1c2VyR2VzdHVyZTogYm9vbGVhblxuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGNvbnN0IHdvcmtlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0Y29uc3QgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblxuXHRsZXQgbW9kZWw6IElUZXh0TW9kZWw7XG5cdGxldCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpKSB7XG5cdFx0bW9kZWwgPSBlZGl0b3JPck1vZGVsLmdldE1vZGVsKCk7XG5cdFx0Y3RzID0gbmV3IEVkaXRvclN0YXRlQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yT3JNb2RlbCwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSB8IENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24sIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9IGVsc2Uge1xuXHRcdG1vZGVsID0gZWRpdG9yT3JNb2RlbDtcblx0XHRjdHMgPSBuZXcgVGV4dE1vZGVsQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoZWRpdG9yT3JNb2RlbCwgdG9rZW4pO1xuXHR9XG5cblx0Ly8gbWFrZSBzdXJlIHRoYXQgcmFuZ2VzIGRvbid0IG92ZXJsYXAgbm9yIHRvdWNoIGVhY2ggb3RoZXJcblx0Y29uc3QgcmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdGxldCBsZW4gPSAwO1xuXHRmb3IgKGNvbnN0IHJhbmdlIG9mIGFzQXJyYXkocmFuZ2VPclJhbmdlcykuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpKSB7XG5cdFx0aWYgKGxlbiA+IDAgJiYgUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhyYW5nZXNbbGVuIC0gMV0sIHJhbmdlKSkge1xuXHRcdFx0cmFuZ2VzW2xlbiAtIDFdID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhyYW5nZXNbbGVuIC0gMV0uZ2V0U3RhcnRQb3NpdGlvbigpLCByYW5nZS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGVuID0gcmFuZ2VzLnB1c2gocmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGNvbXB1dGVFZGl0cyA9IGFzeW5jIChyYW5nZTogUmFuZ2UpID0+IHtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbZm9ybWF0XVtwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c10gKHJlcXVlc3QpYCwgcHJvdmlkZXIuZXh0ZW5zaW9uSWQ/LnZhbHVlLCByYW5nZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSAoYXdhaXQgcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMoXG5cdFx0XHRtb2RlbCxcblx0XHRcdHJhbmdlLFxuXHRcdFx0bW9kZWwuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKSxcblx0XHRcdGN0cy50b2tlblxuXHRcdCkpIHx8IFtdO1xuXG5cdFx0bG9nU2VydmljZS50cmFjZShgW2Zvcm1hdF1bcHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHNdIChyZXNwb25zZSlgLCBwcm92aWRlci5leHRlbnNpb25JZD8udmFsdWUsIHJlc3VsdCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9O1xuXG5cdGNvbnN0IGhhc0ludGVyc2VjdGluZ0VkaXQgPSAoYTogVGV4dEVkaXRbXSwgYjogVGV4dEVkaXRbXSkgPT4ge1xuXHRcdGlmICghYS5sZW5ndGggfHwgIWIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIHF1aWNrIGV4aXQgaWYgdGhlIGxpc3Qgb2YgcmFuZ2VzIGFyZSBjb21wbGV0ZWx5IHVucmVsYXRlZCBbTyhuKV1cblx0XHRjb25zdCBtZXJnZWRBID0gYS5yZWR1Y2UoKGFjYywgdmFsKSA9PiB7IHJldHVybiBSYW5nZS5wbHVzUmFuZ2UoYWNjLCB2YWwucmFuZ2UpOyB9LCBhWzBdLnJhbmdlKTtcblx0XHRpZiAoIWIuc29tZSh4ID0+IHsgcmV0dXJuIFJhbmdlLmludGVyc2VjdFJhbmdlcyhtZXJnZWRBLCB4LnJhbmdlKTsgfSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gZmFsbGJhY2sgdG8gYSBjb21wbGV0ZSBjaGVjayBbTyhuXjIpXVxuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBhKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG90aGVyRWRpdCBvZiBiKSB7XG5cdFx0XHRcdGlmIChSYW5nZS5pbnRlcnNlY3RSYW5nZXMoZWRpdC5yYW5nZSwgb3RoZXJFZGl0LnJhbmdlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblxuXHRjb25zdCBhbGxFZGl0czogVGV4dEVkaXRbXSA9IFtdO1xuXHRjb25zdCByYXdFZGl0c0xpc3Q6IFRleHRFZGl0W11bXSA9IFtdO1xuXHR0cnkge1xuXHRcdGlmICh0eXBlb2YgcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbZm9ybWF0XVtwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c10gKHJlcXVlc3QpYCwgcHJvdmlkZXIuZXh0ZW5zaW9uSWQ/LnZhbHVlLCByYW5nZXMpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gKGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyhcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdHJhbmdlcyxcblx0XHRcdFx0bW9kZWwuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKSxcblx0XHRcdFx0Y3RzLnRva2VuXG5cdFx0XHQpKSB8fCBbXTtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYFtmb3JtYXRdW3Byb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzXSAocmVzcG9uc2UpYCwgcHJvdmlkZXIuZXh0ZW5zaW9uSWQ/LnZhbHVlLCByZXN1bHQpO1xuXHRcdFx0cmF3RWRpdHNMaXN0LnB1c2gocmVzdWx0KTtcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmF3RWRpdHNMaXN0LnB1c2goYXdhaXQgY29tcHV0ZUVkaXRzKHJhbmdlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgKytpKSB7XG5cdFx0XHRcdGZvciAobGV0IGogPSBpICsgMTsgaiA8IHJhbmdlcy5sZW5ndGg7ICsraikge1xuXHRcdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaGFzSW50ZXJzZWN0aW5nRWRpdChyYXdFZGl0c0xpc3RbaV0sIHJhd0VkaXRzTGlzdFtqXSkpIHtcblx0XHRcdFx0XHRcdC8vIE1lcmdlIHJhbmdlcyBpIGFuZCBqIGludG8gYSBzaW5nbGUgcmFuZ2UsIHJlY29tcHV0ZSB0aGUgYXNzb2NpYXRlZCBlZGl0c1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVyZ2VkUmFuZ2UgPSBSYW5nZS5wbHVzUmFuZ2UocmFuZ2VzW2ldLCByYW5nZXNbal0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBjb21wdXRlRWRpdHMobWVyZ2VkUmFuZ2UpO1xuXHRcdFx0XHRcdFx0cmFuZ2VzLnNwbGljZShqLCAxKTtcblx0XHRcdFx0XHRcdHJhbmdlcy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyYW5nZXMucHVzaChtZXJnZWRSYW5nZSk7XG5cdFx0XHRcdFx0XHRyYXdFZGl0c0xpc3Quc3BsaWNlKGosIDEpO1xuXHRcdFx0XHRcdFx0cmF3RWRpdHNMaXN0LnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRcdHJhd0VkaXRzTGlzdC5wdXNoKGVkaXRzKTtcblx0XHRcdFx0XHRcdC8vIFJlc3RhcnQgc2Nhbm5pbmdcblx0XHRcdFx0XHRcdGkgPSAwO1xuXHRcdFx0XHRcdFx0aiA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByYXdFZGl0cyBvZiByYXdFZGl0c0xpc3QpIHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtaW5pbWFsRWRpdHMgPSBhd2FpdCB3b3JrZXJTZXJ2aWNlLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaSwgcmF3RWRpdHMpO1xuXHRcdFx0aWYgKG1pbmltYWxFZGl0cykge1xuXHRcdFx0XHRhbGxFZGl0cy5wdXNoKC4uLm1pbmltYWxFZGl0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH1cblxuXHRpZiAoYWxsRWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGlzQ29kZUVkaXRvcihlZGl0b3JPck1vZGVsKSkge1xuXHRcdC8vIHVzZSBlZGl0b3IgdG8gYXBwbHkgZWRpdHNcblx0XHRGb3JtYXR0aW5nRWRpdC5leGVjdXRlKGVkaXRvck9yTW9kZWwsIGFsbEVkaXRzLCB0cnVlKTtcblx0XHRlZGl0b3JPck1vZGVsLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChlZGl0b3JPck1vZGVsLmdldFBvc2l0aW9uKCksIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblxuXHR9IGVsc2Uge1xuXHRcdC8vIHVzZSBtb2RlbCB0byBhcHBseSBlZGl0c1xuXHRcdGNvbnN0IFt7IHJhbmdlIH1dID0gYWxsRWRpdHM7XG5cdFx0Y29uc3QgaW5pdGlhbFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW2luaXRpYWxTZWxlY3Rpb25dLCBhbGxFZGl0cy5tYXAoZWRpdCA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBlZGl0LnRleHQsXG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH0pLCB1bmRvRWRpdHMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IHJhbmdlIH0gb2YgdW5kb0VkaXRzKSB7XG5cdFx0XHRcdGlmIChSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHJhbmdlLCBpbml0aWFsU2VsZWN0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IFNlbGVjdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSk7XG5cdH1cblx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmZvcm1hdCwgeyB1c2VyR2VzdHVyZSB9KTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmb3JtYXREb2N1bWVudFdpdGhTZWxlY3RlZFByb3ZpZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0ZWRpdG9yT3JNb2RlbDogSVRleHRNb2RlbCB8IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRtb2RlOiBGb3JtYXR0aW5nTW9kZSxcblx0cHJvZ3Jlc3M6IElQcm9ncmVzczxEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI+LFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdHVzZXJHZXN0dXJlPzogYm9vbGVhblxuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGNvbnN0IG1vZGVsID0gaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpID8gZWRpdG9yT3JNb2RlbC5nZXRNb2RlbCgpIDogZWRpdG9yT3JNb2RlbDtcblx0Y29uc3QgcHJvdmlkZXIgPSBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBtb2RlbCk7XG5cdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgRm9ybWF0dGluZ0NvbmZsaWN0cy5zZWxlY3QocHJvdmlkZXIsIG1vZGVsLCBtb2RlLCBGb3JtYXR0aW5nS2luZC5GaWxlKTtcblx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHNlbGVjdGVkKTtcblx0XHRhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZm9ybWF0RG9jdW1lbnRXaXRoUHJvdmlkZXIsIHNlbGVjdGVkLCBlZGl0b3JPck1vZGVsLCBtb2RlLCB0b2tlbiwgdXNlckdlc3R1cmUpO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmb3JtYXREb2N1bWVudFdpdGhQcm92aWRlcihcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdHByb3ZpZGVyOiBEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsXG5cdGVkaXRvck9yTW9kZWw6IElUZXh0TW9kZWwgfCBJQWN0aXZlQ29kZUVkaXRvcixcblx0bW9kZTogRm9ybWF0dGluZ01vZGUsXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0dXNlckdlc3R1cmU/OiBib29sZWFuXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3Qgd29ya2VyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yV29ya2VyU2VydmljZSk7XG5cdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cblx0bGV0IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRsZXQgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0aWYgKGlzQ29kZUVkaXRvcihlZGl0b3JPck1vZGVsKSkge1xuXHRcdG1vZGVsID0gZWRpdG9yT3JNb2RlbC5nZXRNb2RlbCgpO1xuXHRcdGN0cyA9IG5ldyBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlKGVkaXRvck9yTW9kZWwsIENvZGVFZGl0b3JTdGF0ZUZsYWcuVmFsdWUgfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlBvc2l0aW9uLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fSBlbHNlIHtcblx0XHRtb2RlbCA9IGVkaXRvck9yTW9kZWw7XG5cdFx0Y3RzID0gbmV3IFRleHRNb2RlbENhbmNlbGxhdGlvblRva2VuU291cmNlKGVkaXRvck9yTW9kZWwsIHRva2VuKTtcblx0fVxuXG5cdGxldCBlZGl0czogVGV4dEVkaXRbXSB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRjb25zdCByYXdFZGl0cyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhcblx0XHRcdG1vZGVsLFxuXHRcdFx0bW9kZWwuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKSxcblx0XHRcdGN0cy50b2tlblxuXHRcdCk7XG5cblx0XHRlZGl0cyA9IGF3YWl0IHdvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLCByYXdFZGl0cyk7XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0fSBmaW5hbGx5IHtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9XG5cblx0aWYgKCFlZGl0cyB8fCBlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpKSB7XG5cdFx0Ly8gdXNlIGVkaXRvciB0byBhcHBseSBlZGl0c1xuXHRcdEZvcm1hdHRpbmdFZGl0LmV4ZWN1dGUoZWRpdG9yT3JNb2RlbCwgZWRpdHMsIG1vZGUgIT09IEZvcm1hdHRpbmdNb2RlLlNpbGVudCk7XG5cblx0XHRpZiAobW9kZSAhPT0gRm9ybWF0dGluZ01vZGUuU2lsZW50KSB7XG5cdFx0XHRlZGl0b3JPck1vZGVsLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChlZGl0b3JPck1vZGVsLmdldFBvc2l0aW9uKCksIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR9XG5cblx0fSBlbHNlIHtcblx0XHQvLyB1c2UgbW9kZWwgdG8gYXBwbHkgZWRpdHNcblx0XHRjb25zdCBbeyByYW5nZSB9XSA9IGVkaXRzO1xuXHRcdGNvbnN0IGluaXRpYWxTZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtpbml0aWFsU2VsZWN0aW9uXSwgZWRpdHMubWFwKGVkaXQgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogZWRpdC50ZXh0LFxuXHRcdFx0XHRyYW5nZTogUmFuZ2UubGlmdChlZGl0LnJhbmdlKSxcblx0XHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9KSwgdW5kb0VkaXRzID0+IHtcblx0XHRcdGZvciAoY29uc3QgeyByYW5nZSB9IG9mIHVuZG9FZGl0cykge1xuXHRcdFx0XHRpZiAoUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhyYW5nZSwgaW5pdGlhbFNlbGVjdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0pO1xuXHR9XG5cdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5mb3JtYXQsIHsgdXNlckdlc3R1cmUgfSk7XG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KFxuXHR3b3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdHJhbmdlOiBSYW5nZSxcblx0b3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMsXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuKTogUHJvbWlzZTxUZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cblx0Y29uc3QgcHJvdmlkZXJzID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG5cdFx0Y29uc3QgcmF3RWRpdHMgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMobW9kZWwsIHJhbmdlLCBvcHRpb25zLCB0b2tlbikpLmNhdGNoKG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkocmF3RWRpdHMpKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgd29ya2VyU2VydmljZS5jb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmksIHJhd0VkaXRzKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoXG5cdHdvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRtb2RlbDogSVRleHRNb2RlbCxcblx0b3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMsXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuKTogUHJvbWlzZTxUZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cblx0Y29uc3QgcHJvdmlkZXJzID0gZ2V0UmVhbEFuZFN5bnRoZXRpY0RvY3VtZW50Rm9ybWF0dGVyc09yZGVyZWQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciwgbW9kZWwpO1xuXHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdGNvbnN0IHJhd0VkaXRzID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cyhtb2RlbCwgb3B0aW9ucywgdG9rZW4pKS5jYXRjaChvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KHJhd0VkaXRzKSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHdvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLCByYXdFZGl0cyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1dpdGhTZWxlY3RlZFByb3ZpZGVyKFxuXHR3b3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0ZWRpdG9yT3JNb2RlbDogSVRleHRNb2RlbCB8IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRtb2RlOiBGb3JtYXR0aW5nTW9kZSxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuKTogUHJvbWlzZTxUZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IG1vZGVsID0gaXNDb2RlRWRpdG9yKGVkaXRvck9yTW9kZWwpID8gZWRpdG9yT3JNb2RlbC5nZXRNb2RlbCgpIDogZWRpdG9yT3JNb2RlbDtcblx0Y29uc3QgcHJvdmlkZXIgPSBnZXRSZWFsQW5kU3ludGhldGljRG9jdW1lbnRGb3JtYXR0ZXJzT3JkZXJlZChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLCBtb2RlbCk7XG5cdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgRm9ybWF0dGluZ0NvbmZsaWN0cy5zZWxlY3QocHJvdmlkZXIsIG1vZGVsLCBtb2RlLCBGb3JtYXR0aW5nS2luZC5GaWxlKTtcblx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0Y29uc3QgcmF3RWRpdHMgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoc2VsZWN0ZWQucHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKG1vZGVsLCBtb2RlbC5nZXRPcHRpb25zKCksIHRva2VuKSkuY2F0Y2gob25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcik7XG5cdFx0cmV0dXJuIGF3YWl0IHdvcmtlclNlcnZpY2UuY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLCByYXdFZGl0cyk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9uVHlwZUZvcm1hdHRpbmdFZGl0cyhcblx0d29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdGNoOiBzdHJpbmcsXG5cdG9wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zLFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cbik6IFByb21pc2U8VGV4dEVkaXRbXSB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblxuXHRjb25zdCBwcm92aWRlcnMgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5vblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLm9yZGVyZWQobW9kZWwpO1xuXG5cdGlmIChwcm92aWRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0aWYgKHByb3ZpZGVyc1swXS5hdXRvRm9ybWF0VHJpZ2dlckNoYXJhY3RlcnMuaW5kZXhPZihjaCkgPCAwKSB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm92aWRlcnNbMF0ucHJvdmlkZU9uVHlwZUZvcm1hdHRpbmdFZGl0cyhtb2RlbCwgcG9zaXRpb24sIGNoLCBvcHRpb25zLCB0b2tlbikpLmNhdGNoKG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpLnRoZW4oZWRpdHMgPT4ge1xuXHRcdHJldHVybiB3b3JrZXJTZXJ2aWNlLmNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaSwgZWRpdHMpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gaXNGb3JtYXR0aW5nT3B0aW9ucyhvYmo6IHVua25vd24pOiBvYmogaXMgRm9ybWF0dGluZ09wdGlvbnMge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgRm9ybWF0dGluZ09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBjYW5kaWRhdGUudGFiU2l6ZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGNhbmRpZGF0ZS5pbnNlcnRTcGFjZXMgPT09ICdib29sZWFuJztcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leGVjdXRlRm9ybWF0UmFuZ2VQcm92aWRlcicsIGFzeW5jIGZ1bmN0aW9uIChhY2Nlc3NvciwgLi4uYXJncykge1xuXHRjb25zdCBbcmVzb3VyY2UsIHJhbmdlLCBvcHRpb25zXSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUoVVJJLmlzVXJpKHJlc291cmNlKSk7XG5cdGFzc2VydFR5cGUoUmFuZ2UuaXNJUmFuZ2UocmFuZ2UpKTtcblxuXHRjb25zdCByZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRjb25zdCB3b3JrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgcmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZ2V0RG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KHdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgUmFuZ2UubGlmdChyYW5nZSksIGVuc3VyZUZvcm1hdHRpbmdPcHRpb25zKG9wdGlvbnMsIHJlZmVyZW5jZSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2V4ZWN1dGVGb3JtYXREb2N1bWVudFByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdGNvbnN0IFtyZXNvdXJjZSwgb3B0aW9uc10gPSBhcmdzO1xuXHRhc3NlcnRUeXBlKFVSSS5pc1VyaShyZXNvdXJjZSkpO1xuXG5cdGNvbnN0IHJlc29sdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdGNvbnN0IHdvcmtlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCByZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHR0cnkge1xuXHRcdHJldHVybiBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KHdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgZW5zdXJlRm9ybWF0dGluZ09wdGlvbnMob3B0aW9ucywgcmVmZXJlbmNlKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH0gZmluYWxseSB7XG5cdFx0cmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXhlY3V0ZUZvcm1hdE9uVHlwZVByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdGNvbnN0IFtyZXNvdXJjZSwgcG9zaXRpb24sIGNoLCBvcHRpb25zXSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUoVVJJLmlzVXJpKHJlc291cmNlKSk7XG5cdGFzc2VydFR5cGUoUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zaXRpb24pKTtcblx0YXNzZXJ0VHlwZSh0eXBlb2YgY2ggPT09ICdzdHJpbmcnKTtcblxuXHRjb25zdCByZXNvbHZlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRjb25zdCB3b3JrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgcmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZ2V0T25UeXBlRm9ybWF0dGluZ0VkaXRzKHdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgUG9zaXRpb24ubGlmdChwb3NpdGlvbiksIGNoLCBlbnN1cmVGb3JtYXR0aW5nT3B0aW9ucyhvcHRpb25zLCByZWZlcmVuY2UpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fSBmaW5hbGx5IHtcblx0XHRyZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHR9XG59KTtcbmZ1bmN0aW9uIGVuc3VyZUZvcm1hdHRpbmdPcHRpb25zKG9wdGlvbnM6IHVua25vd24sIHJlZmVyZW5jZTogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+KTogRm9ybWF0dGluZ09wdGlvbnMge1xuXHRsZXQgdmFsaWRhdGVkT3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnM7XG5cdGlmIChpc0Zvcm1hdHRpbmdPcHRpb25zKG9wdGlvbnMpKSB7XG5cdFx0dmFsaWRhdGVkT3B0aW9ucyA9IG9wdGlvbnM7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgbW9kZWxPcHRpb25zID0gcmVmZXJlbmNlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdHZhbGlkYXRlZE9wdGlvbnMgPSB7XG5cdFx0XHR0YWJTaXplOiBtb2RlbE9wdGlvbnMudGFiU2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogbW9kZWxPcHRpb25zLmluc2VydFNwYWNlc1xuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gdmFsaWRhdGVkT3B0aW9ucztcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLHlCQUFrRDtBQUMzRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUIsb0NBQW9DLHdDQUF3QztBQUMxRyxTQUE0QixvQkFBb0I7QUFFaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBRzNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQixtQ0FBbUM7QUFFMUQsU0FBUyw2Q0FDZixnQ0FDQSxxQ0FDQSxPQUNtQztBQUNuQyxRQUFN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QVcsT0FBTyxPQUFPLFFBQVE7QUFFakMsUUFBTSxrQkFBa0IsU0FBUyxJQUFJLGlCQUFpQjtBQUN0RCxRQUFNLGdCQUFnQixTQUFTLElBQUksb0JBQW9CO0FBQ3ZELFFBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFDckUsUUFBTSxZQUFZLE1BQU0sZ0JBQWdCLHFCQUFxQixRQUFRO0FBQ3JFLE1BQUk7QUFDSCxXQUFPLHlCQUF5QixlQUFlLHlCQUF5QixVQUFVLE9BQU8saUJBQWlCLFNBQVMsS0FBSyxRQUFRLEdBQUcsSUFBSSx3QkFBd0IsU0FBUyxTQUFTLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxFQUMzTSxVQUFFO0FBQ0QsY0FBVSxRQUFRO0FBQUEsRUFDbkI7QUFDRCxDQUFDO0FBQ0QsU0FBUyx3QkFBd0IsU0FBa0IsV0FBb0U7QUFDdEgsTUFBSTtBQUNKLE1BQUksb0JBQW9CLE9BQU8sR0FBRztBQUNqQyx1QkFBbUI7QUFBQSxFQUNwQixPQUFPO0FBQ04sVUFBTSxlQUFlLFVBQVUsT0FBTyxnQkFBZ0IsV0FBVztBQUNqRSx1QkFBbUI7QUFBQSxNQUNsQixTQUFTLGFBQWE7QUFBQSxNQUN0QixjQUFjLGFBQWE7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIm1vZGVsIiwgIkZvcm1hdHRpbmdLaW5kIiwgIkZvcm1hdHRpbmdNb2RlIiwgInJhbmdlIl0KfQo=
