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
import { LazyStatefulPromise, raceTimeout } from "../../../../base/common/async.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Event, ValueWithChangeEvent } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas } from "../../../../base/common/network.js";
import { deepClone } from "../../../../base/common/objects.js";
import { ObservableLazyPromise, ValueWithChangeEventFromObservable, autorun, constObservable, derived, mapObservableArrayCached, observableFromEvent, observableFromValueWithChangeEvent, observableValue, recomputeInitiallyAndOnChange } from "../../../../base/common/observable.js";
import { isDefined, isObject } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { RefCounted } from "../../../../editor/browser/widget/diffEditor/utils.js";
import { MultiDiffEditorViewModel } from "../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { ConfirmResult } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { MultiDiffEditorIcon } from "./icons.contribution.js";
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from "./multiDiffSourceResolverService.js";
let MultiDiffEditorInput = class extends EditorInput {
  constructor(multiDiffSource, label, initialResources, isTransient = false, _textModelService, _textResourceConfigurationService, _instantiationService, _multiDiffSourceResolverService, _textFileService) {
    super();
    this.multiDiffSource = multiDiffSource;
    this.label = label;
    this.initialResources = initialResources;
    this.isTransient = isTransient;
    this._textModelService = _textModelService;
    this._textResourceConfigurationService = _textResourceConfigurationService;
    this._instantiationService = _instantiationService;
    this._multiDiffSourceResolverService = _multiDiffSourceResolverService;
    this._textFileService = _textFileService;
    this._name = "";
    this._viewModel = new LazyStatefulPromise(async () => {
      const model = await this._createModel();
      this._register(model);
      const vm = new MultiDiffEditorViewModel(model, this._instantiationService);
      this._register(vm);
      await raceTimeout(vm.waitForDiffOr1s(), 1e3);
      return vm;
    });
    this._resolvedSource = new ObservableLazyPromise(async () => {
      const source = this.initialResources ? { resources: ValueWithChangeEvent.const(this.initialResources) } : await this._multiDiffSourceResolverService.resolve(this.multiDiffSource);
      return {
        source,
        resources: source ? observableFromValueWithChangeEvent(this, source.resources) : constObservable([])
      };
    });
    this.resources = derived(this, (reader) => this._resolvedSource.cachedPromiseResult.read(reader)?.data?.resources.read(reader));
    this.textFileServiceOnDidChange = new FastEventDispatcher(
      this._textFileService.files.onDidChangeDirty,
      (item) => item.resource.toString(),
      (uri) => uri.toString()
    );
    this._isDirtyObservables = mapObservableArrayCached(this, this.resources.map((r) => r ?? []), (res) => {
      const isModifiedDirty = res.modifiedUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.modifiedUri) : constObservable(false);
      const isOriginalDirty = res.originalUri ? isUriDirty(this.textFileServiceOnDidChange, this._textFileService, res.originalUri) : constObservable(false);
      return derived((reader) => (
        /** @description modifiedDirty||originalDirty */
        isModifiedDirty.read(reader) || isOriginalDirty.read(reader)
      ));
    }, (i) => i.getKey());
    this._isDirtyObservable = derived(this, (reader) => this._isDirtyObservables.read(reader).some((isDirty) => isDirty.read(reader))).keepObserved(this._store);
    this.onDidChangeDirty = Event.fromObservableLight(this._isDirtyObservable);
    this.closeHandler = {
      // This is a workaround for not having a better way
      // to figure out if the editors this input wraps
      // around are opened or not
      async confirm() {
        return ConfirmResult.DONT_SAVE;
      },
      showConfirm() {
        return false;
      }
    };
    this._register(autorun((reader) => {
      const resources = this.resources.read(reader);
      const label2 = this.label ?? localize("name", "Multi Diff Editor");
      if (resources && resources.length === 1) {
        this._name = localize({ key: "nameWithOneFile", comment: ["{0} is the name of the editor"] }, "{0} (1 file)", label2);
      } else if (resources) {
        this._name = localize({ key: "nameWithFiles", comment: ["{0} is the name of the editor", "{1} is the number of files being shown"] }, "{0} ({1} files)", label2, resources.length);
      } else {
        this._name = label2;
      }
      this._onDidChangeLabel.fire();
    }));
  }
  static fromResourceMultiDiffEditorInput(input, instantiationService) {
    if (!input.multiDiffSource && !input.resources) {
      throw new BugIndicatingError("MultiDiffEditorInput requires either multiDiffSource or resources");
    }
    const multiDiffSource = input.multiDiffSource ?? URI.parse(`multi-diff-editor:${(/* @__PURE__ */ new Date()).getMilliseconds().toString() + Math.random().toString()}`);
    return instantiationService.createInstance(
      MultiDiffEditorInput,
      multiDiffSource,
      input.label,
      input.resources?.map((resource) => {
        return new MultiDiffEditorItem(
          resource.original.resource,
          resource.modified.resource,
          resource.goToFileResource
        );
      }),
      input.isTransient ?? false
    );
  }
  static fromSerialized(data, instantiationService) {
    return instantiationService.createInstance(
      MultiDiffEditorInput,
      URI.parse(data.multiDiffSourceUri),
      data.label,
      data.resources?.map((resource) => new MultiDiffEditorItem(
        resource.originalUri ? URI.parse(resource.originalUri) : void 0,
        resource.modifiedUri ? URI.parse(resource.modifiedUri) : void 0,
        resource.goToFileUri ? URI.parse(resource.goToFileUri) : void 0
      )),
      false
    );
  }
  get resource() {
    return this.multiDiffSource;
  }
  get capabilities() {
    return EditorInputCapabilities.Readonly;
  }
  get typeId() {
    return MultiDiffEditorInput.ID;
  }
  getName() {
    return this._name;
  }
  get editorId() {
    return DEFAULT_EDITOR_ASSOCIATION.id;
  }
  getIcon() {
    return MultiDiffEditorIcon;
  }
  serialize() {
    return {
      label: this.label,
      multiDiffSourceUri: this.multiDiffSource.toString(),
      resources: this.initialResources?.map((resource) => ({
        originalUri: resource.originalUri?.toString(),
        modifiedUri: resource.modifiedUri?.toString(),
        goToFileUri: resource.goToFileUri?.toString()
      }))
    };
  }
  setLanguageId(languageId, source) {
    const activeDiffItem = this._viewModel.requireValue().activeDiffItem.get();
    const value = activeDiffItem?.documentDiffItem;
    if (!value) {
      return;
    }
    const target = value.modified ?? value.original;
    if (!target) {
      return;
    }
    target.setLanguage(languageId, source);
  }
  async getViewModel() {
    return this._viewModel.getPromise();
  }
  async _createModel() {
    const source = await this._resolvedSource.getPromise();
    const textResourceConfigurationService = this._textResourceConfigurationService;
    const documentsWithPromises = mapObservableArrayCached(this, source.resources, async (r, store) => {
      let original;
      let modified;
      const multiDiffItemStore = new DisposableStore();
      const createModelReference = async (resource) => resource ? this._textModelService.createModelReference(resource) : void 0;
      const [originalResult, modifiedResult] = await Promise.allSettled([
        createModelReference(r.originalUri),
        createModelReference(r.modifiedUri)
      ]);
      if (originalResult.status === "fulfilled") {
        original = originalResult.value;
        if (original) {
          multiDiffItemStore.add(original);
        }
      }
      if (modifiedResult.status === "fulfilled") {
        modified = modifiedResult.value;
        if (modified) {
          multiDiffItemStore.add(modified);
        }
      }
      if (store.isDisposed) {
        multiDiffItemStore.dispose();
        return void 0;
      }
      let errorResult;
      if (originalResult.status === "rejected") {
        errorResult = originalResult;
      } else if (modifiedResult.status === "rejected") {
        errorResult = modifiedResult;
      }
      if (errorResult) {
        multiDiffItemStore.dispose();
        console.error(errorResult.reason);
        onUnexpectedError(errorResult.reason);
        return void 0;
      }
      const uri = r.modifiedUri ?? r.originalUri;
      const result2 = {
        multiDiffEditorItem: r,
        original: original?.object.textEditorModel,
        modified: modified?.object.textEditorModel,
        contextKeys: r.contextKeys,
        get options() {
          return {
            ...getReadonlyConfiguration(modified?.object.isReadonly() ?? true),
            ...computeOptions(textResourceConfigurationService.getValue(uri))
          };
        },
        onOptionsDidChange: (h) => this._textResourceConfigurationService.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration(uri, "editor") || e.affectsConfiguration(uri, "diffEditor")) {
            h();
          }
        })
      };
      return store.add(RefCounted.createOfNonDisposable(result2, multiDiffItemStore, this));
    }, (i) => JSON.stringify([i.modifiedUri?.toString(), i.originalUri?.toString()]));
    const documents = observableValue("documents", "loading");
    const updateDocuments = derived(async (reader) => {
      const docsPromises = documentsWithPromises.read(reader);
      const docs = await Promise.all(docsPromises);
      const newDocuments = docs.filter(isDefined);
      documents.set(newDocuments, void 0);
    });
    const a = recomputeInitiallyAndOnChange(updateDocuments);
    await updateDocuments.get();
    const result = {
      dispose: () => a.dispose(),
      documents: new ValueWithChangeEventFromObservable(documents),
      contextKeys: source.source?.contextKeys
    };
    return result;
  }
  matches(otherInput) {
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof MultiDiffEditorInput) {
      return this.multiDiffSource.toString() === otherInput.multiDiffSource.toString();
    }
    return false;
  }
  isDirty() {
    return this._isDirtyObservable.get();
  }
  async save(group, options) {
    await this.doSaveOrRevert("save", group, options);
    return this;
  }
  revert(group, options) {
    return this.doSaveOrRevert("revert", group, options);
  }
  async doSaveOrRevert(mode, group, options) {
    const items = this._viewModel.currentValue?.items.get();
    if (items) {
      await Promise.all(items.map(async (item) => {
        const model = item.diffEditorViewModel.model;
        const handleOriginal = model.original.uri.scheme !== Schemas.untitled && this._textFileService.isDirty(model.original.uri);
        await Promise.all([
          handleOriginal ? mode === "save" ? this._textFileService.save(model.original.uri, options) : this._textFileService.revert(model.original.uri, options) : Promise.resolve(),
          mode === "save" ? this._textFileService.save(model.modified.uri, options) : this._textFileService.revert(model.modified.uri, options)
        ]);
      }));
    }
    return void 0;
  }
};
MultiDiffEditorInput.ID = "workbench.input.multiDiffEditor";
MultiDiffEditorInput = __decorateClass([
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ITextResourceConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IMultiDiffSourceResolverService),
  __decorateParam(8, ITextFileService)
], MultiDiffEditorInput);
class FastEventDispatcher {
  constructor(_event, _getEventArgsKey, _keyToString) {
    this._event = _event;
    this._getEventArgsKey = _getEventArgsKey;
    this._keyToString = _keyToString;
    this._count = 0;
    this._buckets = /* @__PURE__ */ new Map();
    this._handleEventChange = (e) => {
      const key = this._getEventArgsKey(e);
      const bucket = this._buckets.get(key);
      if (bucket) {
        for (const listener of bucket) {
          listener(e);
        }
      }
    };
  }
  filteredEvent(filter) {
    return (listener) => {
      const key = this._keyToString(filter);
      let bucket = this._buckets.get(key);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Set();
        this._buckets.set(key, bucket);
      }
      bucket.add(listener);
      this._count++;
      if (this._count === 1) {
        this._eventSubscription = this._event(this._handleEventChange);
      }
      return {
        dispose: () => {
          bucket.delete(listener);
          if (bucket.size === 0) {
            this._buckets.delete(key);
          }
          this._count--;
          if (this._count === 0) {
            this._eventSubscription?.dispose();
            this._eventSubscription = void 0;
          }
        }
      };
    };
  }
}
function isUriDirty(onDidChangeDirty, textFileService, uri) {
  return observableFromEvent(onDidChangeDirty.filteredEvent(uri), () => textFileService.isDirty(uri));
}
function getReadonlyConfiguration(isReadonly) {
  return {
    readOnly: !!isReadonly,
    readOnlyMessage: typeof isReadonly !== "boolean" ? isReadonly : void 0
  };
}
function computeOptions(configuration) {
  const editorConfiguration = deepClone(configuration.editor);
  if (isObject(configuration.diffEditor)) {
    const diffEditorConfiguration = deepClone(configuration.diffEditor);
    diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
    delete diffEditorConfiguration.codeLens;
    diffEditorConfiguration.diffWordWrap = diffEditorConfiguration.wordWrap;
    delete diffEditorConfiguration.wordWrap;
    Object.assign(editorConfiguration, diffEditorConfiguration);
  }
  return editorConfiguration;
}
let MultiDiffEditorResolverContribution = class extends Disposable {
  constructor(editorResolverService, instantiationService) {
    super();
    this._register(editorResolverService.registerEditor(
      `*`,
      {
        id: DEFAULT_EDITOR_ASSOCIATION.id,
        label: DEFAULT_EDITOR_ASSOCIATION.displayName,
        detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createMultiDiffEditorInput: (multiDiffEditor) => {
          return {
            editor: MultiDiffEditorInput.fromResourceMultiDiffEditorInput(multiDiffEditor, instantiationService)
          };
        }
      }
    ));
  }
};
MultiDiffEditorResolverContribution.ID = "workbench.contrib.multiDiffEditorResolver";
MultiDiffEditorResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService),
  __decorateParam(1, IInstantiationService)
], MultiDiffEditorResolverContribution);
class MultiDiffEditorSerializer {
  canSerialize(editor) {
    return editor instanceof MultiDiffEditorInput && !editor.isTransient;
  }
  serialize(editor) {
    if (!this.canSerialize(editor)) {
      return void 0;
    }
    return JSON.stringify(editor.serialize());
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const data = parse(serializedEditor);
      return MultiDiffEditorInput.fromSerialized(data, instantiationService);
    } catch (err) {
      onUnexpectedError(err);
      return void 0;
    }
  }
}
export {
  MultiDiffEditorInput,
  MultiDiffEditorResolverContribution,
  MultiDiffEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTGF6eVN0YXRlZnVsUHJvbWlzZSwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVMYXp5UHJvbWlzZSwgVmFsdWVXaXRoQ2hhbmdlRXZlbnRGcm9tT2JzZXJ2YWJsZSwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVGcm9tVmFsdWVXaXRoQ2hhbmdlRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgcmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJlZkNvdW50ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci91dGlscy5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmSXRlbSwgSU11bHRpRGlmZkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRFZGl0b3IuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBHcm91cElkZW50aWZpZXIsIElFZGl0b3JTZXJpYWxpemVyLCBJUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQsIElFZGl0b3JDbG9zZUhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVN1cHBvcnQsIElUZXh0RmlsZUVkaXRvck1vZGVsLCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJY29uIH0gZnJvbSAnLi9pY29ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSwgSVJlc29sdmVkTXVsdGlEaWZmU291cmNlLCBNdWx0aURpZmZFZGl0b3JJdGVtIH0gZnJvbSAnLi9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgTXVsdGlEaWZmRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElMYW5ndWFnZVN1cHBvcnQge1xuXHRwdWJsaWMgc3RhdGljIGZyb21SZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0KGlucHV0OiBJUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IE11bHRpRGlmZkVkaXRvcklucHV0IHtcblx0XHRpZiAoIWlucHV0Lm11bHRpRGlmZlNvdXJjZSAmJiAhaW5wdXQucmVzb3VyY2VzKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdNdWx0aURpZmZFZGl0b3JJbnB1dCByZXF1aXJlcyBlaXRoZXIgbXVsdGlEaWZmU291cmNlIG9yIHJlc291cmNlcycpO1xuXHRcdH1cblx0XHRjb25zdCBtdWx0aURpZmZTb3VyY2UgPSBpbnB1dC5tdWx0aURpZmZTb3VyY2UgPz8gVVJJLnBhcnNlKGBtdWx0aS1kaWZmLWVkaXRvcjoke25ldyBEYXRlKCkuZ2V0TWlsbGlzZWNvbmRzKCkudG9TdHJpbmcoKSArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoKX1gKTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNdWx0aURpZmZFZGl0b3JJbnB1dCxcblx0XHRcdG11bHRpRGlmZlNvdXJjZSxcblx0XHRcdGlucHV0LmxhYmVsLFxuXHRcdFx0aW5wdXQucmVzb3VyY2VzPy5tYXAocmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0cmVzb3VyY2Uub3JpZ2luYWwucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2UubW9kaWZpZWQucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2UuZ29Ub0ZpbGVSZXNvdXJjZSxcblx0XHRcdFx0KTtcblx0XHRcdH0pLFxuXHRcdFx0aW5wdXQuaXNUcmFuc2llbnQgPz8gZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tU2VyaWFsaXplZChkYXRhOiBJU2VyaWFsaXplZE11bHRpRGlmZkVkaXRvcklucHV0LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogTXVsdGlEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0VVJJLnBhcnNlKGRhdGEubXVsdGlEaWZmU291cmNlVXJpKSxcblx0XHRcdGRhdGEubGFiZWwsXG5cdFx0XHRkYXRhLnJlc291cmNlcz8ubWFwKHJlc291cmNlID0+IG5ldyBNdWx0aURpZmZFZGl0b3JJdGVtKFxuXHRcdFx0XHRyZXNvdXJjZS5vcmlnaW5hbFVyaSA/IFVSSS5wYXJzZShyZXNvdXJjZS5vcmlnaW5hbFVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc291cmNlLm1vZGlmaWVkVXJpID8gVVJJLnBhcnNlKHJlc291cmNlLm1vZGlmaWVkVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb3VyY2UuZ29Ub0ZpbGVVcmkgPyBVUkkucGFyc2UocmVzb3VyY2UuZ29Ub0ZpbGVVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0KSksXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guaW5wdXQubXVsdGlEaWZmRWRpdG9yJztcblxuXHRnZXQgcmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMubXVsdGlEaWZmU291cmNlOyB9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7IHJldHVybiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTsgfVxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7IHJldHVybiBNdWx0aURpZmZFZGl0b3JJbnB1dC5JRDsgfVxuXG5cdHByaXZhdGUgX25hbWU6IHN0cmluZztcblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fbmFtZTsgfVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcgeyByZXR1cm4gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQ7IH1cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24geyByZXR1cm4gTXVsdGlEaWZmRWRpdG9ySWNvbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtdWx0aURpZmZTb3VyY2U6IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5pdGlhbFJlc291cmNlczogcmVhZG9ubHkgTXVsdGlEaWZmRWRpdG9ySXRlbVtdIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc1RyYW5zaWVudDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZTogSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbmFtZSA9ICcnO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IG5ldyBMYXp5U3RhdGVmdWxQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fY3JlYXRlTW9kZWwoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsKTtcblx0XHRcdGNvbnN0IHZtID0gbmV3IE11bHRpRGlmZkVkaXRvclZpZXdNb2RlbChtb2RlbCwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodm0pO1xuXHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQodm0ud2FpdEZvckRpZmZPcjFzKCksIDEwMDApO1xuXHRcdFx0cmV0dXJuIHZtO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3Jlc29sdmVkU291cmNlID0gbmV3IE9ic2VydmFibGVMYXp5UHJvbWlzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2U6IElSZXNvbHZlZE11bHRpRGlmZlNvdXJjZSB8IHVuZGVmaW5lZCA9IHRoaXMuaW5pdGlhbFJlc291cmNlc1xuXHRcdFx0XHQ/IHsgcmVzb3VyY2VzOiBWYWx1ZVdpdGhDaGFuZ2VFdmVudC5jb25zdCh0aGlzLmluaXRpYWxSZXNvdXJjZXMpIH1cblx0XHRcdFx0OiBhd2FpdCB0aGlzLl9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UucmVzb2x2ZSh0aGlzLm11bHRpRGlmZlNvdXJjZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlczogc291cmNlID8gb2JzZXJ2YWJsZUZyb21WYWx1ZVdpdGhDaGFuZ2VFdmVudCh0aGlzLCBzb3VyY2UucmVzb3VyY2VzKSA6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzb3VyY2VzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fcmVzb2x2ZWRTb3VyY2UuY2FjaGVkUHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik/LmRhdGE/LnJlc291cmNlcy5yZWFkKHJlYWRlcikpO1xuXHRcdHRoaXMudGV4dEZpbGVTZXJ2aWNlT25EaWRDaGFuZ2UgPSBuZXcgRmFzdEV2ZW50RGlzcGF0Y2hlcjxJVGV4dEZpbGVFZGl0b3JNb2RlbCwgVVJJPihcblx0XHRcdHRoaXMuX3RleHRGaWxlU2VydmljZS5maWxlcy5vbkRpZENoYW5nZURpcnR5LFxuXHRcdFx0aXRlbSA9PiBpdGVtLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR1cmkgPT4gdXJpLnRvU3RyaW5nKClcblx0XHQpO1xuXHRcdHRoaXMuX2lzRGlydHlPYnNlcnZhYmxlcyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCB0aGlzLnJlc291cmNlcy5tYXAociA9PiByID8/IFtdKSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGlzTW9kaWZpZWREaXJ0eSA9IHJlcy5tb2RpZmllZFVyaSA/IGlzVXJpRGlydHkodGhpcy50ZXh0RmlsZVNlcnZpY2VPbkRpZENoYW5nZSwgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLCByZXMubW9kaWZpZWRVcmkpIDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRcdGNvbnN0IGlzT3JpZ2luYWxEaXJ0eSA9IHJlcy5vcmlnaW5hbFVyaSA/IGlzVXJpRGlydHkodGhpcy50ZXh0RmlsZVNlcnZpY2VPbkRpZENoYW5nZSwgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLCByZXMub3JpZ2luYWxVcmkpIDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIG1vZGlmaWVkRGlydHl8fG9yaWdpbmFsRGlydHkgKi8gaXNNb2RpZmllZERpcnR5LnJlYWQocmVhZGVyKSB8fCBpc09yaWdpbmFsRGlydHkucmVhZChyZWFkZXIpKTtcblx0XHR9LCBpID0+IGkuZ2V0S2V5KCkpO1xuXHRcdHRoaXMuX2lzRGlydHlPYnNlcnZhYmxlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5faXNEaXJ0eU9ic2VydmFibGVzLnJlYWQocmVhZGVyKS5zb21lKGlzRGlydHkgPT4gaXNEaXJ0eS5yZWFkKHJlYWRlcikpKVxuXHRcdFx0LmtlZXBPYnNlcnZlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZURpcnR5ID0gRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodCh0aGlzLl9pc0RpcnR5T2JzZXJ2YWJsZSk7XG5cdFx0dGhpcy5jbG9zZUhhbmRsZXIgPSB7XG5cblx0XHRcdC8vIFRoaXMgaXMgYSB3b3JrYXJvdW5kIGZvciBub3QgaGF2aW5nIGEgYmV0dGVyIHdheVxuXHRcdFx0Ly8gdG8gZmlndXJlIG91dCBpZiB0aGUgZWRpdG9ycyB0aGlzIGlucHV0IHdyYXBzXG5cdFx0XHQvLyBhcm91bmQgYXJlIG9wZW5lZCBvciBub3RcblxuXHRcdFx0YXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFO1xuXHRcdFx0fSxcblx0XHRcdHNob3dDb25maXJtKCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGVzIG5hbWUgKi9cblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IHRoaXMucmVzb3VyY2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5sYWJlbCA/PyBsb2NhbGl6ZSgnbmFtZScsIFwiTXVsdGkgRGlmZiBFZGl0b3JcIik7XG5cdFx0XHRpZiAocmVzb3VyY2VzICYmIHJlc291cmNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5fbmFtZSA9IGxvY2FsaXplKHsga2V5OiAnbmFtZVdpdGhPbmVGaWxlJywgY29tbWVudDogWyd7MH0gaXMgdGhlIG5hbWUgb2YgdGhlIGVkaXRvciddIH0sIFwiezB9ICgxIGZpbGUpXCIsIGxhYmVsKTtcblx0XHRcdH0gZWxzZSBpZiAocmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX25hbWUgPSBsb2NhbGl6ZSh7IGtleTogJ25hbWVXaXRoRmlsZXMnLCBjb21tZW50OiBbJ3swfSBpcyB0aGUgbmFtZSBvZiB0aGUgZWRpdG9yJywgJ3sxfSBpcyB0aGUgbnVtYmVyIG9mIGZpbGVzIGJlaW5nIHNob3duJ10gfSwgXCJ7MH0gKHsxfSBmaWxlcylcIiwgbGFiZWwsIHJlc291cmNlcy5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbmFtZSA9IGxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZE11bHRpRGlmZkVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHRtdWx0aURpZmZTb3VyY2VVcmk6IHRoaXMubXVsdGlEaWZmU291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvdXJjZXM6IHRoaXMuaW5pdGlhbFJlc291cmNlcz8ubWFwKHJlc291cmNlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsVXJpOiByZXNvdXJjZS5vcmlnaW5hbFVyaT8udG9TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRVcmk6IHJlc291cmNlLm1vZGlmaWVkVXJpPy50b1N0cmluZygpLFxuXHRcdFx0XHRnb1RvRmlsZVVyaTogcmVzb3VyY2UuZ29Ub0ZpbGVVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlRGlmZkl0ZW0gPSB0aGlzLl92aWV3TW9kZWwucmVxdWlyZVZhbHVlKCkuYWN0aXZlRGlmZkl0ZW0uZ2V0KCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhY3RpdmVEaWZmSXRlbT8uZG9jdW1lbnREaWZmSXRlbTtcblx0XHRpZiAoIXZhbHVlKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IHRhcmdldCA9IHZhbHVlLm1vZGlmaWVkID8/IHZhbHVlLm9yaWdpbmFsO1xuXHRcdGlmICghdGFyZ2V0KSB7IHJldHVybjsgfVxuXHRcdHRhcmdldC5zZXRMYW5ndWFnZShsYW5ndWFnZUlkLCBzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFZpZXdNb2RlbCgpOiBQcm9taXNlPE11bHRpRGlmZkVkaXRvclZpZXdNb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3TW9kZWwuZ2V0UHJvbWlzZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGVsO1xuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZU1vZGVsKCk6IFByb21pc2U8SU11bHRpRGlmZkVkaXRvck1vZGVsICYgSURpc3Bvc2FibGU+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLl9yZXNvbHZlZFNvdXJjZS5nZXRQcm9taXNlKCk7XG5cdFx0Y29uc3QgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgPSB0aGlzLl90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRcdGNvbnN0IGRvY3VtZW50c1dpdGhQcm9taXNlcyA9IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCBzb3VyY2UucmVzb3VyY2VzLCBhc3luYyAociwgc3RvcmUpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gZG9jdW1lbnRzV2l0aFByb21pc2VzICovXG5cdFx0XHRsZXQgb3JpZ2luYWw6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPiB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBtb2RpZmllZDogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBtdWx0aURpZmZJdGVtU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBjcmVhdGVNb2RlbFJlZmVyZW5jZSA9IGFzeW5jIChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKSA9PiByZXNvdXJjZSA/IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBbb3JpZ2luYWxSZXN1bHQsIG1vZGlmaWVkUmVzdWx0XSA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHIub3JpZ2luYWxVcmkpLFxuXHRcdFx0XHRjcmVhdGVNb2RlbFJlZmVyZW5jZShyLm1vZGlmaWVkVXJpKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAob3JpZ2luYWxSZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHRvcmlnaW5hbCA9IG9yaWdpbmFsUmVzdWx0LnZhbHVlO1xuXHRcdFx0XHRpZiAob3JpZ2luYWwpIHsgbXVsdGlEaWZmSXRlbVN0b3JlLmFkZChvcmlnaW5hbCk7IH1cblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZFJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdG1vZGlmaWVkID0gbW9kaWZpZWRSZXN1bHQudmFsdWU7XG5cdFx0XHRcdGlmIChtb2RpZmllZCkgeyBtdWx0aURpZmZJdGVtU3RvcmUuYWRkKG1vZGlmaWVkKTsgfVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRtdWx0aURpZmZJdGVtU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZXJyb3JSZXN1bHQ6IFByb21pc2VSZWplY3RlZFJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChvcmlnaW5hbFJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0ZXJyb3JSZXN1bHQgPSBvcmlnaW5hbFJlc3VsdDtcblx0XHRcdH0gZWxzZSBpZiAobW9kaWZpZWRSZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdGVycm9yUmVzdWx0ID0gbW9kaWZpZWRSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXJyb3JSZXN1bHQpIHtcblx0XHRcdFx0bXVsdGlEaWZmSXRlbVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0Ly8gZS5nLiBcIkZpbGUgc2VlbXMgdG8gYmUgYmluYXJ5IGFuZCBjYW5ub3QgYmUgb3BlbmVkIGFzIHRleHRcIlxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGVycm9yUmVzdWx0LnJlYXNvbik7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yUmVzdWx0LnJlYXNvbik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVyaSA9IChyLm1vZGlmaWVkVXJpID8/IHIub3JpZ2luYWxVcmkpITtcblx0XHRcdGNvbnN0IHJlc3VsdDogSURvY3VtZW50RGlmZkl0ZW1XaXRoTXVsdGlEaWZmRWRpdG9ySXRlbSA9IHtcblx0XHRcdFx0bXVsdGlEaWZmRWRpdG9ySXRlbTogcixcblx0XHRcdFx0b3JpZ2luYWw6IG9yaWdpbmFsPy5vYmplY3QudGV4dEVkaXRvck1vZGVsLFxuXHRcdFx0XHRtb2RpZmllZDogbW9kaWZpZWQ/Lm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRcdGNvbnRleHRLZXlzOiByLmNvbnRleHRLZXlzLFxuXHRcdFx0XHRnZXQgb3B0aW9ucygpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4uZ2V0UmVhZG9ubHlDb25maWd1cmF0aW9uKG1vZGlmaWVkPy5vYmplY3QuaXNSZWFkb25seSgpID8/IHRydWUpLFxuXHRcdFx0XHRcdFx0Li4uY29tcHV0ZU9wdGlvbnModGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodXJpKSksXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSURpZmZFZGl0b3JPcHRpb25zO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbk9wdGlvbnNEaWRDaGFuZ2U6IGggPT4gdGhpcy5fdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHVyaSwgJ2VkaXRvcicpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24odXJpLCAnZGlmZkVkaXRvcicpKSB7XG5cdFx0XHRcdFx0XHRoKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gc3RvcmUuYWRkKFJlZkNvdW50ZWQuY3JlYXRlT2ZOb25EaXNwb3NhYmxlKHJlc3VsdCwgbXVsdGlEaWZmSXRlbVN0b3JlLCB0aGlzKSk7XG5cdFx0fSwgaSA9PiBKU09OLnN0cmluZ2lmeShbaS5tb2RpZmllZFVyaT8udG9TdHJpbmcoKSwgaS5vcmlnaW5hbFVyaT8udG9TdHJpbmcoKV0pKTtcblxuXHRcdGNvbnN0IGRvY3VtZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBSZWZDb3VudGVkPElEb2N1bWVudERpZmZJdGVtPltdIHwgJ2xvYWRpbmcnPignZG9jdW1lbnRzJywgJ2xvYWRpbmcnKTtcblxuXHRcdGNvbnN0IHVwZGF0ZURvY3VtZW50cyA9IGRlcml2ZWQoYXN5bmMgcmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGRvY3VtZW50cyAqL1xuXHRcdFx0Y29uc3QgZG9jc1Byb21pc2VzID0gZG9jdW1lbnRzV2l0aFByb21pc2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRvY3MgPSBhd2FpdCBQcm9taXNlLmFsbChkb2NzUHJvbWlzZXMpO1xuXHRcdFx0Y29uc3QgbmV3RG9jdW1lbnRzID0gZG9jcy5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHRcdGRvY3VtZW50cy5zZXQobmV3RG9jdW1lbnRzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYSA9IHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHVwZGF0ZURvY3VtZW50cyk7XG5cdFx0YXdhaXQgdXBkYXRlRG9jdW1lbnRzLmdldCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJTXVsdGlEaWZmRWRpdG9yTW9kZWwgJiBJRGlzcG9zYWJsZSA9IHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGEuZGlzcG9zZSgpLFxuXHRcdFx0ZG9jdW1lbnRzOiBuZXcgVmFsdWVXaXRoQ2hhbmdlRXZlbnRGcm9tT2JzZXJ2YWJsZShkb2N1bWVudHMpLFxuXHRcdFx0Y29udGV4dEtleXM6IHNvdXJjZS5zb3VyY2U/LmNvbnRleHRLZXlzLFxuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVkU291cmNlO1xuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHN1cGVyLm1hdGNoZXMob3RoZXJJbnB1dCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlcklucHV0IGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiB0aGlzLm11bHRpRGlmZlNvdXJjZS50b1N0cmluZygpID09PSBvdGhlcklucHV0Lm11bHRpRGlmZlNvdXJjZS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSByZXNvdXJjZXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2VPbkRpZENoYW5nZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0RpcnR5T2JzZXJ2YWJsZXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzRGlydHlPYnNlcnZhYmxlO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHk7XG5cdG92ZXJyaWRlIGlzRGlydHkoKSB7IHJldHVybiB0aGlzLl9pc0RpcnR5T2JzZXJ2YWJsZS5nZXQoKTsgfVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXA6IG51bWJlciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8RWRpdG9ySW5wdXQ+IHtcblx0XHRhd2FpdCB0aGlzLmRvU2F2ZU9yUmV2ZXJ0KCdzYXZlJywgZ3JvdXAsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmV2ZXJ0KGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmRvU2F2ZU9yUmV2ZXJ0KCdyZXZlcnQnLCBncm91cCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZU9yUmV2ZXJ0KG1vZGU6ICdzYXZlJywgZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlT3JSZXZlcnQobW9kZTogJ3JldmVydCcsIGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlT3JSZXZlcnQobW9kZTogJ3NhdmUnIHwgJ3JldmVydCcsIGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMgfCBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fdmlld01vZGVsLmN1cnJlbnRWYWx1ZT8uaXRlbXMuZ2V0KCk7XG5cdFx0aWYgKGl0ZW1zKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpdGVtcy5tYXAoYXN5bmMgaXRlbSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gaXRlbS5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsO1xuXHRcdFx0XHRjb25zdCBoYW5kbGVPcmlnaW5hbCA9IG1vZGVsLm9yaWdpbmFsLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQgJiYgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkobW9kZWwub3JpZ2luYWwudXJpKTsgLy8gbWF0Y2ggZGlmZiBlZGl0b3IgYmVoYXZpb3VyXG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdGhhbmRsZU9yaWdpbmFsID8gbW9kZSA9PT0gJ3NhdmUnID8gdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLnNhdmUobW9kZWwub3JpZ2luYWwudXJpLCBvcHRpb25zKSA6IHRoaXMuX3RleHRGaWxlU2VydmljZS5yZXZlcnQobW9kZWwub3JpZ2luYWwudXJpLCBvcHRpb25zKSA6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRcdG1vZGUgPT09ICdzYXZlJyA/IHRoaXMuX3RleHRGaWxlU2VydmljZS5zYXZlKG1vZGVsLm1vZGlmaWVkLnVyaSwgb3B0aW9ucykgOiB0aGlzLl90ZXh0RmlsZVNlcnZpY2UucmV2ZXJ0KG1vZGVsLm1vZGlmaWVkLnVyaSwgb3B0aW9ucyksXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2xvc2VIYW5kbGVyOiBJRWRpdG9yQ2xvc2VIYW5kbGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEb2N1bWVudERpZmZJdGVtV2l0aE11bHRpRGlmZkVkaXRvckl0ZW0gZXh0ZW5kcyBJRG9jdW1lbnREaWZmSXRlbSB7XG5cdG11bHRpRGlmZkVkaXRvckl0ZW06IE11bHRpRGlmZkVkaXRvckl0ZW07XG59XG5cbi8qKlxuICogVXNlcyBhIG1hcCB0byBlZmZpY2llbnRseSBkaXNwYXRjaCBldmVudHMgdG8gbGlzdGVuZXJzIHRoYXQgYXJlIGludGVyZXN0ZWQgaW4gYSBzcGVjaWZpYyBrZXkuXG4qL1xuY2xhc3MgRmFzdEV2ZW50RGlzcGF0Y2hlcjxULCBUS2V5PiB7XG5cdHByaXZhdGUgX2NvdW50ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8KHZhbHVlOiBUKSA9PiB2b2lkPj4oKTtcblxuXHRwcml2YXRlIF9ldmVudFN1YnNjcmlwdGlvbjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnQ6IEV2ZW50PFQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEV2ZW50QXJnc0tleTogKGl0ZW06IFQpID0+IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXlUb1N0cmluZzogKGtleTogVEtleSkgPT4gc3RyaW5nLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBmaWx0ZXJlZEV2ZW50KGZpbHRlcjogVEtleSk6IChsaXN0ZW5lcjogKGU6IFQpID0+IHVua25vd24pID0+IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gbGlzdGVuZXIgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5VG9TdHJpbmcoZmlsdGVyKTtcblx0XHRcdGxldCBidWNrZXQgPSB0aGlzLl9idWNrZXRzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdFx0YnVja2V0ID0gbmV3IFNldCgpO1xuXHRcdFx0XHR0aGlzLl9idWNrZXRzLnNldChrZXksIGJ1Y2tldCk7XG5cdFx0XHR9XG5cdFx0XHRidWNrZXQuYWRkKGxpc3RlbmVyKTtcblxuXHRcdFx0dGhpcy5fY291bnQrKztcblx0XHRcdGlmICh0aGlzLl9jb3VudCA9PT0gMSkge1xuXHRcdFx0XHR0aGlzLl9ldmVudFN1YnNjcmlwdGlvbiA9IHRoaXMuX2V2ZW50KHRoaXMuX2hhbmRsZUV2ZW50Q2hhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdGJ1Y2tldCEuZGVsZXRlKGxpc3RlbmVyKTtcblx0XHRcdFx0XHRpZiAoYnVja2V0IS5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9idWNrZXRzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9jb3VudC0tO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9ldmVudFN1YnNjcmlwdGlvbj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fZXZlbnRTdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVFdmVudENoYW5nZSA9IChlOiBUKSA9PiB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0RXZlbnRBcmdzS2V5KGUpO1xuXHRcdGNvbnN0IGJ1Y2tldCA9IHRoaXMuX2J1Y2tldHMuZ2V0KGtleSk7XG5cdFx0aWYgKGJ1Y2tldCkge1xuXHRcdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBidWNrZXQpIHtcblx0XHRcdFx0bGlzdGVuZXIoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBpc1VyaURpcnR5KG9uRGlkQ2hhbmdlRGlydHk6IEZhc3RFdmVudERpc3BhdGNoZXI8SVRleHRGaWxlRWRpdG9yTW9kZWwsIFVSST4sIHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSwgdXJpOiBVUkkpIHtcblx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQob25EaWRDaGFuZ2VEaXJ0eS5maWx0ZXJlZEV2ZW50KHVyaSksICgpID0+IHRleHRGaWxlU2VydmljZS5pc0RpcnR5KHVyaSkpO1xufVxuXG5mdW5jdGlvbiBnZXRSZWFkb25seUNvbmZpZ3VyYXRpb24oaXNSZWFkb25seTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IHsgcmVhZE9ubHk6IGJvb2xlYW47IHJlYWRPbmx5TWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRyZXR1cm4ge1xuXHRcdHJlYWRPbmx5OiAhIWlzUmVhZG9ubHksXG5cdFx0cmVhZE9ubHlNZXNzYWdlOiB0eXBlb2YgaXNSZWFkb25seSAhPT0gJ2Jvb2xlYW4nID8gaXNSZWFkb25seSA6IHVuZGVmaW5lZFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlT3B0aW9ucyhjb25maWd1cmF0aW9uOiBJRWRpdG9yQ29uZmlndXJhdGlvbik6IElEaWZmRWRpdG9yT3B0aW9ucyB7XG5cdGNvbnN0IGVkaXRvckNvbmZpZ3VyYXRpb24gPSBkZWVwQ2xvbmUoY29uZmlndXJhdGlvbi5lZGl0b3IpO1xuXG5cdC8vIEhhbmRsZSBkaWZmIGVkaXRvciBzcGVjaWFsbHkgYnkgbWVyZ2luZyBpbiBkaWZmRWRpdG9yIGNvbmZpZ3VyYXRpb25cblx0aWYgKGlzT2JqZWN0KGNvbmZpZ3VyYXRpb24uZGlmZkVkaXRvcikpIHtcblx0XHRjb25zdCBkaWZmRWRpdG9yQ29uZmlndXJhdGlvbjogSURpZmZFZGl0b3JPcHRpb25zID0gZGVlcENsb25lKGNvbmZpZ3VyYXRpb24uZGlmZkVkaXRvcik7XG5cblx0XHQvLyBVc2VyIHNldHRpbmdzIGRlZmluZXMgYGRpZmZFZGl0b3IuY29kZUxlbnNgLCBidXQgaGVyZSB3ZSByZW5hbWUgdGhhdCB0byBgZGlmZkVkaXRvci5kaWZmQ29kZUxlbnNgIHRvIGF2b2lkIGNvbGxpc2lvbnMgd2l0aCBgZWRpdG9yLmNvZGVMZW5zYC5cblx0XHRkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5kaWZmQ29kZUxlbnMgPSBkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5jb2RlTGVucztcblx0XHRkZWxldGUgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24uY29kZUxlbnM7XG5cblx0XHQvLyBVc2VyIHNldHRpbmdzIGRlZmluZXMgYGRpZmZFZGl0b3Iud29yZFdyYXBgLCBidXQgaGVyZSB3ZSByZW5hbWUgdGhhdCB0byBgZGlmZkVkaXRvci5kaWZmV29yZFdyYXBgIHRvIGF2b2lkIGNvbGxpc2lvbnMgd2l0aCBgZWRpdG9yLndvcmRXcmFwYC5cblx0XHRkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi5kaWZmV29yZFdyYXAgPSA8J29mZicgfCAnb24nIHwgJ2luaGVyaXQnIHwgdW5kZWZpbmVkPmRpZmZFZGl0b3JDb25maWd1cmF0aW9uLndvcmRXcmFwO1xuXHRcdGRlbGV0ZSBkaWZmRWRpdG9yQ29uZmlndXJhdGlvbi53b3JkV3JhcDtcblxuXHRcdE9iamVjdC5hc3NpZ24oZWRpdG9yQ29uZmlndXJhdGlvbiwgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cdHJldHVybiBlZGl0b3JDb25maWd1cmF0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgTXVsdGlEaWZmRWRpdG9yUmVzb2x2ZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubXVsdGlEaWZmRWRpdG9yUmVzb2x2ZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHRgKmAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCxcblx0XHRcdFx0bGFiZWw6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRkZXRhaWw6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLnByb3ZpZGVyRGlzcGxheU5hbWUsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVNdWx0aURpZmZFZGl0b3JJbnB1dDogKG11bHRpRGlmZkVkaXRvcjogSVJlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dFdpdGhPcHRpb25zID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBNdWx0aURpZmZFZGl0b3JJbnB1dC5mcm9tUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dChtdWx0aURpZmZFZGl0b3IsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZE11bHRpRGlmZkVkaXRvcklucHV0IHtcblx0bXVsdGlEaWZmU291cmNlVXJpOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlc291cmNlczoge1xuXHRcdG9yaWdpbmFsVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bW9kaWZpZWRVcmk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRnb1RvRmlsZVVyaTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR9W10gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aURpZmZFZGl0b3JTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXG5cdGNhblNlcmlhbGl6ZShlZGl0b3I6IEVkaXRvcklucHV0KTogZWRpdG9yIGlzIE11bHRpRGlmZkVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gZWRpdG9yIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9ySW5wdXQgJiYgIWVkaXRvci5pc1RyYW5zaWVudDtcblx0fVxuXG5cdHNlcmlhbGl6ZShlZGl0b3I6IE11bHRpRGlmZkVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuY2FuU2VyaWFsaXplKGVkaXRvcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGVkaXRvci5zZXJpYWxpemUoKSk7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9yOiBzdHJpbmcpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBwYXJzZShzZXJpYWxpemVkRWRpdG9yKSBhcyBJU2VyaWFsaXplZE11bHRpRGlmZkVkaXRvcklucHV0O1xuXHRcdFx0cmV0dXJuIE11bHRpRGlmZkVkaXRvcklucHV0LmZyb21TZXJpYWxpemVkKGRhdGEsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQixtQkFBbUI7QUFDakQsU0FBUyxvQkFBb0IseUJBQXlCO0FBQ3RELFNBQVMsT0FBTyw0QkFBNEI7QUFFNUMsU0FBUyxZQUFZLHVC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
