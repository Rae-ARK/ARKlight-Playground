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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { OutlineElement, OutlineGroup, OutlineModel } from "../../documentSymbols/browser/outlineModel.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { FoldingController, RangesLimitReporter } from "../../folding/browser/folding.js";
import { SyntaxRangeProvider } from "../../folding/browser/syntaxRangeProvider.js";
import { IndentRangeProvider } from "../../folding/browser/indentRangeProvider.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { StickyElement, StickyModel, StickyRange } from "./stickyScrollElement.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
var ModelProvider = /* @__PURE__ */ ((ModelProvider2) => {
  ModelProvider2["OUTLINE_MODEL"] = "outlineModel";
  ModelProvider2["FOLDING_PROVIDER_MODEL"] = "foldingProviderModel";
  ModelProvider2["INDENTATION_MODEL"] = "indentationModel";
  return ModelProvider2;
})(ModelProvider || {});
var Status = /* @__PURE__ */ ((Status2) => {
  Status2[Status2["VALID"] = 0] = "VALID";
  Status2[Status2["INVALID"] = 1] = "INVALID";
  Status2[Status2["CANCELED"] = 2] = "CANCELED";
  return Status2;
})(Status || {});
let StickyModelProvider = class extends Disposable {
  constructor(_editor, onProviderUpdate, _languageConfigurationService, _languageFeaturesService) {
    super();
    this._editor = _editor;
    this._modelProviders = [];
    this._modelPromise = null;
    this._updateScheduler = this._register(new Delayer(300));
    this._updateOperation = this._register(new DisposableStore());
    switch (this._editor.getOption(EditorOption.stickyScroll).defaultModel) {
      case "outlineModel" /* OUTLINE_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateOutlineProvider(this._editor, _languageFeaturesService));
      // fall through
      case "foldingProviderModel" /* FOLDING_PROVIDER_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, onProviderUpdate, _languageFeaturesService));
      // fall through
      case "indentationModel" /* INDENTATION_MODEL */:
        this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
        break;
    }
  }
  dispose() {
    this._modelProviders.forEach((provider) => provider.dispose());
    this._updateOperation.clear();
    this._cancelModelPromise();
    super.dispose();
  }
  _cancelModelPromise() {
    if (this._modelPromise) {
      this._modelPromise.cancel();
      this._modelPromise = null;
    }
  }
  async update(token) {
    this._updateOperation.clear();
    this._updateOperation.add({
      dispose: () => {
        this._cancelModelPromise();
        this._updateScheduler.cancel();
      }
    });
    this._cancelModelPromise();
    return await this._updateScheduler.trigger(async () => {
      for (const modelProvider of this._modelProviders) {
        const { statusPromise, modelPromise } = modelProvider.computeStickyModel(token);
        this._modelPromise = modelPromise;
        const status = await statusPromise;
        if (this._modelPromise !== modelPromise) {
          return null;
        }
        switch (status) {
          case 2 /* CANCELED */:
            this._updateOperation.clear();
            return null;
          case 0 /* VALID */:
            return modelProvider.stickyModel;
        }
      }
      return null;
    }).catch((error) => {
      onUnexpectedError(error);
      return null;
    });
  }
};
StickyModelProvider = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILanguageFeaturesService)
], StickyModelProvider);
class StickyModelCandidateProvider extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    this._stickyModel = null;
  }
  get stickyModel() {
    return this._stickyModel;
  }
  _invalid() {
    this._stickyModel = null;
    return 1 /* INVALID */;
  }
  computeStickyModel(token) {
    if (token.isCancellationRequested || !this.isProviderValid()) {
      return { statusPromise: this._invalid(), modelPromise: null };
    }
    const providerModelPromise = createCancelablePromise((token2) => this.createModelFromProvider(token2));
    return {
      statusPromise: providerModelPromise.then((providerModel) => {
        if (!this.isModelValid(providerModel)) {
          return this._invalid();
        }
        if (token.isCancellationRequested) {
          return 2 /* CANCELED */;
        }
        this._stickyModel = this.createStickyModel(token, providerModel);
        return 0 /* VALID */;
      }).then(void 0, (err) => {
        onUnexpectedError(err);
        return 2 /* CANCELED */;
      }),
      modelPromise: providerModelPromise
    };
  }
  /**
   * Method which checks whether the model returned by the provider is valid and can be used to compute a sticky model.
   * This method by default returns true.
   * @param model model returned by the provider
   * @returns boolean indicating whether the model is valid
   */
  isModelValid(model) {
    return true;
  }
  /**
   * Method which checks whether the provider is valid before applying it to find the provider model.
   * This method by default returns true.
   * @returns boolean indicating whether the provider is valid
   */
  isProviderValid() {
    return true;
  }
}
let StickyModelFromCandidateOutlineProvider = class extends StickyModelCandidateProvider {
  constructor(_editor, _languageFeaturesService) {
    super(_editor);
    this._languageFeaturesService = _languageFeaturesService;
  }
  createModelFromProvider(token) {
    return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, this._editor.getModel(), token);
  }
  createStickyModel(token, model) {
    const { stickyOutlineElement, providerID } = this._stickyModelFromOutlineModel(model, this._stickyModel?.outlineProviderId);
    const textModel = this._editor.getModel();
    return new StickyModel(textModel.uri, textModel.getVersionId(), stickyOutlineElement, providerID);
  }
  isModelValid(model) {
    return model && model.children.size > 0;
  }
  _stickyModelFromOutlineModel(outlineModel, preferredProvider) {
    let outlineElements;
    if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
      const provider = Iterable.find(outlineModel.children.values(), (outlineGroupOfModel) => outlineGroupOfModel.id === preferredProvider);
      if (provider) {
        outlineElements = provider.children;
      } else {
        let tempID = "";
        let maxTotalSumOfRanges = -1;
        let optimalOutlineGroup = void 0;
        for (const [_key, outlineGroup] of outlineModel.children.entries()) {
          const totalSumRanges = this._findSumOfRangesOfGroup(outlineGroup);
          if (totalSumRanges > maxTotalSumOfRanges) {
            optimalOutlineGroup = outlineGroup;
            maxTotalSumOfRanges = totalSumRanges;
            tempID = outlineGroup.id;
          }
        }
        preferredProvider = tempID;
        outlineElements = optimalOutlineGroup.children;
      }
    } else {
      outlineElements = outlineModel.children;
    }
    const stickyChildren = [];
    const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
      const range1 = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
      const range2 = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
      return this._comparator(range1, range2);
    });
    for (const outlineElement of outlineElementsArray) {
      stickyChildren.push(this._stickyModelFromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
    }
    const stickyOutlineElement = new StickyElement(void 0, stickyChildren, void 0);
    return {
      stickyOutlineElement,
      providerID: preferredProvider
    };
  }
  _stickyModelFromOutlineElement(outlineElement, previousStartLine) {
    const children = [];
    for (const child of outlineElement.children.values()) {
      if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
        if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
          children.push(this._stickyModelFromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
        } else {
          for (const subchild of child.children.values()) {
            children.push(this._stickyModelFromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
          }
        }
      }
    }
    children.sort((child1, child2) => this._comparator(child1.range, child2.range));
    const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
    return new StickyElement(range, children, void 0);
  }
  _comparator(range1, range2) {
    if (range1.startLineNumber !== range2.startLineNumber) {
      return range1.startLineNumber - range2.startLineNumber;
    } else {
      return range2.endLineNumber - range1.endLineNumber;
    }
  }
  _findSumOfRangesOfGroup(outline) {
    let res = 0;
    for (const child of outline.children.values()) {
      res += this._findSumOfRangesOfGroup(child);
    }
    if (outline instanceof OutlineElement) {
      return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
    } else {
      return res;
    }
  }
};
StickyModelFromCandidateOutlineProvider = __decorateClass([
  __decorateParam(1, ILanguageFeaturesService)
], StickyModelFromCandidateOutlineProvider);
class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider {
  constructor(editor) {
    super(editor);
    this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
  }
  createStickyModel(token, model) {
    const foldingElement = this._fromFoldingRegions(model);
    const textModel = this._editor.getModel();
    return new StickyModel(textModel.uri, textModel.getVersionId(), foldingElement, void 0);
  }
  isModelValid(model) {
    return model !== null;
  }
  _fromFoldingRegions(foldingRegions) {
    const length = foldingRegions.length;
    const orderedStickyElements = [];
    const stickyOutlineElement = new StickyElement(
      void 0,
      [],
      void 0
    );
    for (let i = 0; i < length; i++) {
      const parentIndex = foldingRegions.getParentIndex(i);
      let parentNode;
      if (parentIndex !== -1) {
        parentNode = orderedStickyElements[parentIndex];
      } else {
        parentNode = stickyOutlineElement;
      }
      const child = new StickyElement(
        new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1),
        [],
        parentNode
      );
      parentNode.children.push(child);
      orderedStickyElements.push(child);
    }
    return stickyOutlineElement;
  }
}
let StickyModelFromCandidateIndentationFoldingProvider = class extends StickyModelFromCandidateFoldingProvider {
  constructor(editor, _languageConfigurationService) {
    super(editor);
    this._languageConfigurationService = _languageConfigurationService;
    this.provider = this._register(new IndentRangeProvider(editor.getModel(), this._languageConfigurationService, this._foldingLimitReporter));
  }
  async createModelFromProvider(token) {
    return this.provider.compute(token);
  }
};
StickyModelFromCandidateIndentationFoldingProvider = __decorateClass([
  __decorateParam(1, ILanguageConfigurationService)
], StickyModelFromCandidateIndentationFoldingProvider);
let StickyModelFromCandidateSyntaxFoldingProvider = class extends StickyModelFromCandidateFoldingProvider {
  constructor(editor, onProviderUpdate, _languageFeaturesService) {
    super(editor);
    this._languageFeaturesService = _languageFeaturesService;
    this.provider = this._register(new MutableDisposable());
    this._register(this._languageFeaturesService.foldingRangeProvider.onDidChange(() => {
      this._updateProvider(editor, onProviderUpdate);
    }));
    this._updateProvider(editor, onProviderUpdate);
  }
  _updateProvider(editor, onProviderUpdate) {
    const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, editor.getModel());
    if (selectedProviders.length === 0) {
      return;
    }
    this.provider.value = new SyntaxRangeProvider(editor.getModel(), selectedProviders, onProviderUpdate, this._foldingLimitReporter, void 0);
  }
  isProviderValid() {
    return this.provider !== void 0;
  }
  async createModelFromProvider(token) {
    return this.provider.value?.compute(token) ?? null;
  }
};
StickyModelFromCandidateSyntaxFoldingProvider = __decorateClass([
  __decorateParam(2, ILanguageFeaturesService)
], StickyModelFromCandidateSyntaxFoldingProvider);
export {
  StickyModelProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbE1vZGVsUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lRWxlbWVudCwgT3V0bGluZUdyb3VwLCBPdXRsaW5lTW9kZWwgfSBmcm9tICcuLi8uLi9kb2N1bWVudFN5bWJvbHMvYnJvd3Nlci9vdXRsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0NvbnRyb2xsZXIsIFJhbmdlc0xpbWl0UmVwb3J0ZXIgfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBTeW50YXhSYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL3N5bnRheFJhbmdlUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSW5kZW50UmFuZ2VQcm92aWRlciB9IGZyb20gJy4uLy4uL2ZvbGRpbmcvYnJvd3Nlci9pbmRlbnRSYW5nZVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9ucyB9IGZyb20gJy4uLy4uL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nUmFuZ2VzLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFN0aWNreUVsZW1lbnQsIFN0aWNreU1vZGVsLCBTdGlja3lSYW5nZSB9IGZyb20gJy4vc3RpY2t5U2Nyb2xsRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcblxuZW51bSBNb2RlbFByb3ZpZGVyIHtcblx0T1VUTElORV9NT0RFTCA9ICdvdXRsaW5lTW9kZWwnLFxuXHRGT0xESU5HX1BST1ZJREVSX01PREVMID0gJ2ZvbGRpbmdQcm92aWRlck1vZGVsJyxcblx0SU5ERU5UQVRJT05fTU9ERUwgPSAnaW5kZW50YXRpb25Nb2RlbCdcbn1cblxuZW51bSBTdGF0dXMge1xuXHRWQUxJRCxcblx0SU5WQUxJRCxcblx0Q0FOQ0VMRURcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RpY2t5TW9kZWxQcm92aWRlciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogTWV0aG9kIHdoaWNoIHVwZGF0ZXMgdGhlIHN0aWNreSBtb2RlbFxuXHQgKiBAcGFyYW0gdG9rZW4gY2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIHRoZSBzdGlja3kgbW9kZWxcblx0ICovXG5cdHVwZGF0ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFN0aWNreU1vZGVsIHwgbnVsbD47XG59XG5cbmV4cG9ydCBjbGFzcyBTdGlja3lNb2RlbFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdGlja3lNb2RlbFByb3ZpZGVyIHtcblxuXHRwcml2YXRlIF9tb2RlbFByb3ZpZGVyczogSVN0aWNreU1vZGVsQ2FuZGlkYXRlUHJvdmlkZXI8YW55PltdID0gW107XG5cdHByaXZhdGUgX21vZGVsUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8YW55IHwgbnVsbD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfdXBkYXRlU2NoZWR1bGVyOiBEZWxheWVyPFN0aWNreU1vZGVsIHwgbnVsbD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjxTdGlja3lNb2RlbCB8IG51bGw+KDMwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVPcGVyYXRpb246IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRvblByb3ZpZGVyVXBkYXRlOiAoKSA9PiB2b2lkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRzd2l0Y2ggKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkuZGVmYXVsdE1vZGVsKSB7XG5cdFx0XHRjYXNlIE1vZGVsUHJvdmlkZXIuT1VUTElORV9NT0RFTDpcblx0XHRcdFx0dGhpcy5fbW9kZWxQcm92aWRlcnMucHVzaChuZXcgU3RpY2t5TW9kZWxGcm9tQ2FuZGlkYXRlT3V0bGluZVByb3ZpZGVyKHRoaXMuX2VkaXRvciwgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKSk7XG5cdFx0XHQvLyBmYWxsIHRocm91Z2hcblx0XHRcdGNhc2UgTW9kZWxQcm92aWRlci5GT0xESU5HX1BST1ZJREVSX01PREVMOlxuXHRcdFx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5wdXNoKG5ldyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVTeW50YXhGb2xkaW5nUHJvdmlkZXIodGhpcy5fZWRpdG9yLCBvblByb3ZpZGVyVXBkYXRlLCBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpKTtcblx0XHRcdC8vIGZhbGwgdGhyb3VnaFxuXHRcdFx0Y2FzZSBNb2RlbFByb3ZpZGVyLklOREVOVEFUSU9OX01PREVMOlxuXHRcdFx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5wdXNoKG5ldyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVJbmRlbnRhdGlvbkZvbGRpbmdQcm92aWRlcih0aGlzLl9lZGl0b3IsIF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsUHJvdmlkZXJzLmZvckVhY2gocHJvdmlkZXIgPT4gcHJvdmlkZXIuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9jYW5jZWxNb2RlbFByb21pc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxNb2RlbFByb21pc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vZGVsUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fbW9kZWxQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fbW9kZWxQcm9taXNlID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U3RpY2t5TW9kZWwgfCBudWxsPiB7XG5cblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY2FuY2VsTW9kZWxQcm9taXNlKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9jYW5jZWxNb2RlbFByb21pc2UoKTtcblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLl91cGRhdGVTY2hlZHVsZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cblx0XHRcdGZvciAoY29uc3QgbW9kZWxQcm92aWRlciBvZiB0aGlzLl9tb2RlbFByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCB7IHN0YXR1c1Byb21pc2UsIG1vZGVsUHJvbWlzZSB9ID0gbW9kZWxQcm92aWRlci5jb21wdXRlU3RpY2t5TW9kZWwodG9rZW4pO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSBtb2RlbFByb21pc2U7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHN0YXR1c1Byb21pc2U7XG5cdFx0XHRcdGlmICh0aGlzLl9tb2RlbFByb21pc2UgIT09IG1vZGVsUHJvbWlzZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRcdFx0Y2FzZSBTdGF0dXMuQ0FOQ0VMRUQ6XG5cdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdGNhc2UgU3RhdHVzLlZBTElEOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsUHJvdmlkZXIuc3RpY2t5TW9kZWw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0pLmNhdGNoKChlcnJvcikgPT4ge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTdGlja3lNb2RlbENhbmRpZGF0ZVByb3ZpZGVyPFQ+IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRnZXQgc3RpY2t5TW9kZWwoKTogU3RpY2t5TW9kZWwgfCBudWxsO1xuXG5cdC8qKlxuXHQgKiBNZXRob2Qgd2hpY2ggY29tcHV0ZXMgdGhlIHN0aWNreSBtb2RlbCBhbmQgcmV0dXJucyBhIHN0YXR1cyB0byBzaWduYWwgd2hldGhlciB0aGUgc3RpY2t5IG1vZGVsIGhhcyBiZWVuIHN1Y2Nlc3NmdWxseSBmb3VuZFxuXHQgKiBAcGFyYW0gdG9rZW4gY2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHN0YXR1cyBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIHN0aWNreSBtb2RlbCBoYXMgYmVlbiBzdWNjZXNzZnVsbHkgZm91bmQgYXMgd2VsbCBhcyB0aGUgbW9kZWwgcHJvbWlzZVxuXHQgKi9cblx0Y29tcHV0ZVN0aWNreU1vZGVsKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHsgc3RhdHVzUHJvbWlzZTogUHJvbWlzZTxTdGF0dXM+IHwgU3RhdHVzOyBtb2RlbFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPFQgfCBudWxsPiB8IG51bGwgfTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgU3RpY2t5TW9kZWxDYW5kaWRhdGVQcm92aWRlcjxUPiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3RpY2t5TW9kZWxDYW5kaWRhdGVQcm92aWRlcjxUPiB7XG5cblx0cHJvdGVjdGVkIF9zdGlja3lNb2RlbDogU3RpY2t5TW9kZWwgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0IHN0aWNreU1vZGVsKCk6IFN0aWNreU1vZGVsIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0aWNreU1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZCgpOiBTdGF0dXMge1xuXHRcdHRoaXMuX3N0aWNreU1vZGVsID0gbnVsbDtcblx0XHRyZXR1cm4gU3RhdHVzLklOVkFMSUQ7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZVN0aWNreU1vZGVsKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHsgc3RhdHVzUHJvbWlzZTogUHJvbWlzZTxTdGF0dXM+IHwgU3RhdHVzOyBtb2RlbFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPFQgfCBudWxsPiB8IG51bGwgfSB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLmlzUHJvdmlkZXJWYWxpZCgpKSB7XG5cdFx0XHRyZXR1cm4geyBzdGF0dXNQcm9taXNlOiB0aGlzLl9pbnZhbGlkKCksIG1vZGVsUHJvbWlzZTogbnVsbCB9O1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlck1vZGVsUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHRoaXMuY3JlYXRlTW9kZWxGcm9tUHJvdmlkZXIodG9rZW4pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0dXNQcm9taXNlOiBwcm92aWRlck1vZGVsUHJvbWlzZS50aGVuKHByb3ZpZGVyTW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNNb2RlbFZhbGlkKHByb3ZpZGVyTW9kZWwpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2ludmFsaWQoKTtcblxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBTdGF0dXMuQ0FOQ0VMRUQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3RpY2t5TW9kZWwgPSB0aGlzLmNyZWF0ZVN0aWNreU1vZGVsKHRva2VuLCBwcm92aWRlck1vZGVsKTtcblx0XHRcdFx0cmV0dXJuIFN0YXR1cy5WQUxJRDtcblx0XHRcdH0pLnRoZW4odW5kZWZpbmVkLCAoZXJyKSA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdHJldHVybiBTdGF0dXMuQ0FOQ0VMRUQ7XG5cdFx0XHR9KSxcblx0XHRcdG1vZGVsUHJvbWlzZTogcHJvdmlkZXJNb2RlbFByb21pc2Vcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE1ldGhvZCB3aGljaCBjaGVja3Mgd2hldGhlciB0aGUgbW9kZWwgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyIGlzIHZhbGlkIGFuZCBjYW4gYmUgdXNlZCB0byBjb21wdXRlIGEgc3RpY2t5IG1vZGVsLlxuXHQgKiBUaGlzIG1ldGhvZCBieSBkZWZhdWx0IHJldHVybnMgdHJ1ZS5cblx0ICogQHBhcmFtIG1vZGVsIG1vZGVsIHJldHVybmVkIGJ5IHRoZSBwcm92aWRlclxuXHQgKiBAcmV0dXJucyBib29sZWFuIGluZGljYXRpbmcgd2hldGhlciB0aGUgbW9kZWwgaXMgdmFsaWRcblx0ICovXG5cdHByb3RlY3RlZCBpc01vZGVsVmFsaWQobW9kZWw6IFQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNZXRob2Qgd2hpY2ggY2hlY2tzIHdoZXRoZXIgdGhlIHByb3ZpZGVyIGlzIHZhbGlkIGJlZm9yZSBhcHBseWluZyBpdCB0byBmaW5kIHRoZSBwcm92aWRlciBtb2RlbC5cblx0ICogVGhpcyBtZXRob2QgYnkgZGVmYXVsdCByZXR1cm5zIHRydWUuXG5cdCAqIEByZXR1cm5zIGJvb2xlYW4gaW5kaWNhdGluZyB3aGV0aGVyIHRoZSBwcm92aWRlciBpcyB2YWxpZFxuXHQgKi9cblx0cHJvdGVjdGVkIGlzUHJvdmlkZXJWYWxpZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBYnN0cmFjdCBtZXRob2Qgd2hpY2ggY3JlYXRlcyB0aGUgbW9kZWwgZnJvbSB0aGUgcHJvdmlkZXIgYW5kIHJldHVybnMgdGhlIHByb3ZpZGVyIG1vZGVsXG5cdCAqIEBwYXJhbSB0b2tlbiBjYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHJldHVybnMgdGhlIG1vZGVsIHJldHVybmVkIGJ5IHRoZSBwcm92aWRlclxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGNyZWF0ZU1vZGVsRnJvbVByb3ZpZGVyKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD47XG5cblx0LyoqXG5cdCAqIEFic3RyYWN0IG1ldGhvZCB3aGljaCBjb21wdXRlcyB0aGUgc3RpY2t5IG1vZGVsIGZyb20gdGhlIG1vZGVsIHJldHVybmVkIGJ5IHRoZSBwcm92aWRlciBhbmQgcmV0dXJucyB0aGUgc3RpY2t5IG1vZGVsXG5cdCAqIEBwYXJhbSB0b2tlbiBjYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHBhcmFtIG1vZGVsIG1vZGVsIHJldHVybmVkIGJ5IHRoZSBwcm92aWRlclxuXHQgKiBAcmV0dXJucyB0aGUgc3RpY2t5IG1vZGVsXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgY3JlYXRlU3RpY2t5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbDogVCk6IFN0aWNreU1vZGVsO1xufVxuXG5jbGFzcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVPdXRsaW5lUHJvdmlkZXIgZXh0ZW5kcyBTdGlja3lNb2RlbENhbmRpZGF0ZVByb3ZpZGVyPE91dGxpbmVNb2RlbD4ge1xuXG5cdGNvbnN0cnVjdG9yKF9lZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCBASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpIHtcblx0XHRzdXBlcihfZWRpdG9yKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVNb2RlbEZyb21Qcm92aWRlcih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE91dGxpbmVNb2RlbD4ge1xuXHRcdHJldHVybiBPdXRsaW5lTW9kZWwuY3JlYXRlKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLCB0b2tlbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlU3RpY2t5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbDogT3V0bGluZU1vZGVsKTogU3RpY2t5TW9kZWwge1xuXHRcdGNvbnN0IHsgc3RpY2t5T3V0bGluZUVsZW1lbnQsIHByb3ZpZGVySUQgfSA9IHRoaXMuX3N0aWNreU1vZGVsRnJvbU91dGxpbmVNb2RlbChtb2RlbCwgdGhpcy5fc3RpY2t5TW9kZWw/Lm91dGxpbmVQcm92aWRlcklkKTtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRyZXR1cm4gbmV3IFN0aWNreU1vZGVsKHRleHRNb2RlbC51cmksIHRleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSwgc3RpY2t5T3V0bGluZUVsZW1lbnQsIHByb3ZpZGVySUQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzTW9kZWxWYWxpZChtb2RlbDogT3V0bGluZU1vZGVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG1vZGVsICYmIG1vZGVsLmNoaWxkcmVuLnNpemUgPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RpY2t5TW9kZWxGcm9tT3V0bGluZU1vZGVsKG91dGxpbmVNb2RlbDogT3V0bGluZU1vZGVsLCBwcmVmZXJyZWRQcm92aWRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyBzdGlja3lPdXRsaW5lRWxlbWVudDogU3RpY2t5RWxlbWVudDsgcHJvdmlkZXJJRDogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXG5cdFx0bGV0IG91dGxpbmVFbGVtZW50czogTWFwPHN0cmluZywgT3V0bGluZUVsZW1lbnQ+O1xuXHRcdC8vIFdoZW4gc2V2ZXJhbCBwb3NzaWJsZSBvdXRsaW5lIHByb3ZpZGVyc1xuXHRcdGlmIChJdGVyYWJsZS5maXJzdChvdXRsaW5lTW9kZWwuY2hpbGRyZW4udmFsdWVzKCkpIGluc3RhbmNlb2YgT3V0bGluZUdyb3VwKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IEl0ZXJhYmxlLmZpbmQob3V0bGluZU1vZGVsLmNoaWxkcmVuLnZhbHVlcygpLCBvdXRsaW5lR3JvdXBPZk1vZGVsID0+IG91dGxpbmVHcm91cE9mTW9kZWwuaWQgPT09IHByZWZlcnJlZFByb3ZpZGVyKTtcblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRvdXRsaW5lRWxlbWVudHMgPSBwcm92aWRlci5jaGlsZHJlbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCB0ZW1wSUQgPSAnJztcblx0XHRcdFx0bGV0IG1heFRvdGFsU3VtT2ZSYW5nZXMgPSAtMTtcblx0XHRcdFx0bGV0IG9wdGltYWxPdXRsaW5lR3JvdXA6IE91dGxpbmVHcm91cCB8IE91dGxpbmVFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtfa2V5LCBvdXRsaW5lR3JvdXBdIG9mIG91dGxpbmVNb2RlbC5jaGlsZHJlbi5lbnRyaWVzKCkpIHtcblx0XHRcdFx0XHRjb25zdCB0b3RhbFN1bVJhbmdlcyA9IHRoaXMuX2ZpbmRTdW1PZlJhbmdlc09mR3JvdXAob3V0bGluZUdyb3VwKTtcblx0XHRcdFx0XHRpZiAodG90YWxTdW1SYW5nZXMgPiBtYXhUb3RhbFN1bU9mUmFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRvcHRpbWFsT3V0bGluZUdyb3VwID0gb3V0bGluZUdyb3VwO1xuXHRcdFx0XHRcdFx0bWF4VG90YWxTdW1PZlJhbmdlcyA9IHRvdGFsU3VtUmFuZ2VzO1xuXHRcdFx0XHRcdFx0dGVtcElEID0gb3V0bGluZUdyb3VwLmlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRwcmVmZXJyZWRQcm92aWRlciA9IHRlbXBJRDtcblx0XHRcdFx0b3V0bGluZUVsZW1lbnRzID0gb3B0aW1hbE91dGxpbmVHcm91cCEuY2hpbGRyZW47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dGxpbmVFbGVtZW50cyA9IG91dGxpbmVNb2RlbC5jaGlsZHJlbiBhcyBNYXA8c3RyaW5nLCBPdXRsaW5lRWxlbWVudD47XG5cdFx0fVxuXHRcdGNvbnN0IHN0aWNreUNoaWxkcmVuOiBTdGlja3lFbGVtZW50W10gPSBbXTtcblx0XHRjb25zdCBvdXRsaW5lRWxlbWVudHNBcnJheSA9IEFycmF5LmZyb20ob3V0bGluZUVsZW1lbnRzLnZhbHVlcygpKS5zb3J0KChlbGVtZW50MSwgZWxlbWVudDIpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlMTogU3RpY2t5UmFuZ2UgPSBuZXcgU3RpY2t5UmFuZ2UoZWxlbWVudDEuc3ltYm9sLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZWxlbWVudDEuc3ltYm9sLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgcmFuZ2UyOiBTdGlja3lSYW5nZSA9IG5ldyBTdGlja3lSYW5nZShlbGVtZW50Mi5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlbGVtZW50Mi5zeW1ib2wucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tcGFyYXRvcihyYW5nZTEsIHJhbmdlMik7XG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBvdXRsaW5lRWxlbWVudCBvZiBvdXRsaW5lRWxlbWVudHNBcnJheSkge1xuXHRcdFx0c3RpY2t5Q2hpbGRyZW4ucHVzaCh0aGlzLl9zdGlja3lNb2RlbEZyb21PdXRsaW5lRWxlbWVudChvdXRsaW5lRWxlbWVudCwgb3V0bGluZUVsZW1lbnQuc3ltYm9sLnNlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlcikpO1xuXHRcdH1cblx0XHRjb25zdCBzdGlja3lPdXRsaW5lRWxlbWVudCA9IG5ldyBTdGlja3lFbGVtZW50KHVuZGVmaW5lZCwgc3RpY2t5Q2hpbGRyZW4sIHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RpY2t5T3V0bGluZUVsZW1lbnQ6IHN0aWNreU91dGxpbmVFbGVtZW50LFxuXHRcdFx0cHJvdmlkZXJJRDogcHJlZmVycmVkUHJvdmlkZXJcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RpY2t5TW9kZWxGcm9tT3V0bGluZUVsZW1lbnQob3V0bGluZUVsZW1lbnQ6IE91dGxpbmVFbGVtZW50LCBwcmV2aW91c1N0YXJ0TGluZTogbnVtYmVyKTogU3RpY2t5RWxlbWVudCB7XG5cdFx0Y29uc3QgY2hpbGRyZW46IFN0aWNreUVsZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygb3V0bGluZUVsZW1lbnQuY2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRcdGlmIChjaGlsZC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBjaGlsZC5zeW1ib2wucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRpZiAoY2hpbGQuc3ltYm9sLnNlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gcHJldmlvdXNTdGFydExpbmUpIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHRoaXMuX3N0aWNreU1vZGVsRnJvbU91dGxpbmVFbGVtZW50KGNoaWxkLCBjaGlsZC5zeW1ib2wuc2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzdWJjaGlsZCBvZiBjaGlsZC5jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh0aGlzLl9zdGlja3lNb2RlbEZyb21PdXRsaW5lRWxlbWVudChzdWJjaGlsZCwgY2hpbGQuc3ltYm9sLnNlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjaGlsZHJlbi5zb3J0KChjaGlsZDEsIGNoaWxkMikgPT4gdGhpcy5fY29tcGFyYXRvcihjaGlsZDEucmFuZ2UhLCBjaGlsZDIucmFuZ2UhKSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgU3RpY2t5UmFuZ2Uob3V0bGluZUVsZW1lbnQuc3ltYm9sLnNlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3V0bGluZUVsZW1lbnQuc3ltYm9sLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdHJldHVybiBuZXcgU3RpY2t5RWxlbWVudChyYW5nZSwgY2hpbGRyZW4sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wYXJhdG9yKHJhbmdlMTogU3RpY2t5UmFuZ2UsIHJhbmdlMjogU3RpY2t5UmFuZ2UpOiBudW1iZXIge1xuXHRcdGlmIChyYW5nZTEuc3RhcnRMaW5lTnVtYmVyICE9PSByYW5nZTIuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gcmFuZ2UxLnN0YXJ0TGluZU51bWJlciAtIHJhbmdlMi5zdGFydExpbmVOdW1iZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiByYW5nZTIuZW5kTGluZU51bWJlciAtIHJhbmdlMS5lbmRMaW5lTnVtYmVyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRTdW1PZlJhbmdlc09mR3JvdXAob3V0bGluZTogT3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGxldCByZXMgPSAwO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygb3V0bGluZS5jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0cmVzICs9IHRoaXMuX2ZpbmRTdW1PZlJhbmdlc09mR3JvdXAoY2hpbGQpO1xuXHRcdH1cblx0XHRpZiAob3V0bGluZSBpbnN0YW5jZW9mIE91dGxpbmVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gcmVzICsgb3V0bGluZS5zeW1ib2wucmFuZ2UuZW5kTGluZU51bWJlciAtIG91dGxpbmUuc3ltYm9sLnNlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgU3RpY2t5TW9kZWxGcm9tQ2FuZGlkYXRlRm9sZGluZ1Byb3ZpZGVyIGV4dGVuZHMgU3RpY2t5TW9kZWxDYW5kaWRhdGVQcm92aWRlcjxGb2xkaW5nUmVnaW9ucyB8IG51bGw+IHtcblxuXHRwcm90ZWN0ZWQgX2ZvbGRpbmdMaW1pdFJlcG9ydGVyOiBSYW5nZXNMaW1pdFJlcG9ydGVyO1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX2ZvbGRpbmdMaW1pdFJlcG9ydGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJhbmdlc0xpbWl0UmVwb3J0ZXIoZWRpdG9yKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlU3RpY2t5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbDogRm9sZGluZ1JlZ2lvbnMpOiBTdGlja3lNb2RlbCB7XG5cdFx0Y29uc3QgZm9sZGluZ0VsZW1lbnQgPSB0aGlzLl9mcm9tRm9sZGluZ1JlZ2lvbnMobW9kZWwpO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHJldHVybiBuZXcgU3RpY2t5TW9kZWwodGV4dE1vZGVsLnVyaSwgdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCBmb2xkaW5nRWxlbWVudCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc01vZGVsVmFsaWQobW9kZWw6IEZvbGRpbmdSZWdpb25zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG1vZGVsICE9PSBudWxsO1xuXHR9XG5cblxuXHRwcml2YXRlIF9mcm9tRm9sZGluZ1JlZ2lvbnMoZm9sZGluZ1JlZ2lvbnM6IEZvbGRpbmdSZWdpb25zKTogU3RpY2t5RWxlbWVudCB7XG5cdFx0Y29uc3QgbGVuZ3RoID0gZm9sZGluZ1JlZ2lvbnMubGVuZ3RoO1xuXHRcdGNvbnN0IG9yZGVyZWRTdGlja3lFbGVtZW50czogU3RpY2t5RWxlbWVudFtdID0gW107XG5cblx0XHQvLyBUaGUgcm9vdCBzdGlja3kgb3V0bGluZSBlbGVtZW50XG5cdFx0Y29uc3Qgc3RpY2t5T3V0bGluZUVsZW1lbnQgPSBuZXcgU3RpY2t5RWxlbWVudChcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtdLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdC8vIEZpbmRpbmcgdGhlIHBhcmVudCBpbmRleCBvZiB0aGUgY3VycmVudCByYW5nZVxuXHRcdFx0Y29uc3QgcGFyZW50SW5kZXggPSBmb2xkaW5nUmVnaW9ucy5nZXRQYXJlbnRJbmRleChpKTtcblxuXHRcdFx0bGV0IHBhcmVudE5vZGU7XG5cdFx0XHRpZiAocGFyZW50SW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdC8vIEFjY2VzcyB0aGUgcmVmZXJlbmNlIG9mIHRoZSBwYXJlbnQgbm9kZVxuXHRcdFx0XHRwYXJlbnROb2RlID0gb3JkZXJlZFN0aWNreUVsZW1lbnRzW3BhcmVudEluZGV4XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEluIHRoYXQgY2FzZSB0aGUgcGFyZW50IG5vZGUgaXMgdGhlIHJvb3Qgbm9kZVxuXHRcdFx0XHRwYXJlbnROb2RlID0gc3RpY2t5T3V0bGluZUVsZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gbmV3IFN0aWNreUVsZW1lbnQoXG5cdFx0XHRcdG5ldyBTdGlja3lSYW5nZShmb2xkaW5nUmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaSksIGZvbGRpbmdSZWdpb25zLmdldEVuZExpbmVOdW1iZXIoaSkgKyAxKSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdHBhcmVudE5vZGVcblx0XHRcdCk7XG5cdFx0XHRwYXJlbnROb2RlLmNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0b3JkZXJlZFN0aWNreUVsZW1lbnRzLnB1c2goY2hpbGQpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RpY2t5T3V0bGluZUVsZW1lbnQ7XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5TW9kZWxGcm9tQ2FuZGlkYXRlSW5kZW50YXRpb25Gb2xkaW5nUHJvdmlkZXIgZXh0ZW5kcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVGb2xkaW5nUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXI6IEluZGVudFJhbmdlUHJvdmlkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXG5cdFx0dGhpcy5wcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbmRlbnRSYW5nZVByb3ZpZGVyKGVkaXRvci5nZXRNb2RlbCgpLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9mb2xkaW5nTGltaXRSZXBvcnRlcikpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU1vZGVsRnJvbVByb3ZpZGVyKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Rm9sZGluZ1JlZ2lvbnM+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlci5jb21wdXRlKHRva2VuKTtcblx0fVxufVxuXG5jbGFzcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVTeW50YXhGb2xkaW5nUHJvdmlkZXIgZXh0ZW5kcyBTdGlja3lNb2RlbEZyb21DYW5kaWRhdGVGb2xkaW5nUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXI6IE11dGFibGVEaXNwb3NhYmxlPFN5bnRheFJhbmdlUHJvdmlkZXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFN5bnRheFJhbmdlUHJvdmlkZXI+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsXG5cdFx0b25Qcm92aWRlclVwZGF0ZTogKCkgPT4gdm9pZCxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5mb2xkaW5nUmFuZ2VQcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVQcm92aWRlcihlZGl0b3IsIG9uUHJvdmlkZXJVcGRhdGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl91cGRhdGVQcm92aWRlcihlZGl0b3IsIG9uUHJvdmlkZXJVcGRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUHJvdmlkZXIoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvciwgb25Qcm92aWRlclVwZGF0ZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkUHJvdmlkZXJzID0gRm9sZGluZ0NvbnRyb2xsZXIuZ2V0Rm9sZGluZ1JhbmdlUHJvdmlkZXJzKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBlZGl0b3IuZ2V0TW9kZWwoKSk7XG5cdFx0aWYgKHNlbGVjdGVkUHJvdmlkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnByb3ZpZGVyLnZhbHVlID0gbmV3IFN5bnRheFJhbmdlUHJvdmlkZXIoZWRpdG9yLmdldE1vZGVsKCksIHNlbGVjdGVkUHJvdmlkZXJzLCBvblByb3ZpZGVyVXBkYXRlLCB0aGlzLl9mb2xkaW5nTGltaXRSZXBvcnRlciwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc1Byb3ZpZGVyVmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvdmlkZXIgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBjcmVhdGVNb2RlbEZyb21Qcm92aWRlcih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEZvbGRpbmdSZWdpb25zIHwgbnVsbD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVyLnZhbHVlPy5jb21wdXRlKHRva2VuKSA/PyBudWxsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBRTVFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCLGNBQWMsb0JBQW9CO0FBRTNELFNBQTRCLHlCQUF5QixlQUFlO0FBQ3BFLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWUsYUFBYSxtQkFBbUI7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFFN0IsSUFBSyxnQkFBTCxrQkFBS0EsbUJBQUw7QUFDQyxFQUFBQSxlQUFBLG1CQUFnQjtBQUNoQixFQUFBQSxlQUFBLDRCQUF5QjtBQUN6QixFQUFBQSxlQUFBLHVCQUFvQjtBQUhoQixTQUFBQTtBQUFBLEdBQUE7QUFNTCxJQUFLLFNBQUwsa0JBQUtDLFlBQUw7QUFDQyxFQUFBQSxnQkFBQTtBQUNBLEVBQUFBLGdCQUFBO0FBQ0EsRUFBQUEsZ0JBQUE7QUFISSxTQUFBQTtBQUFBLEdBQUE7QUFnQkUsSUFBTSxzQkFBTixjQUFrQyxXQUEyQztBQUFBLEVBT25GLFlBQ2tCLFNBQ2pCLGtCQUN1QiwrQkFDRywwQkFDekI7QUFDRCxVQUFNO0FBTFc7QUFObEIsU0FBUSxrQkFBd0QsQ0FBQztBQUNqRSxT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
