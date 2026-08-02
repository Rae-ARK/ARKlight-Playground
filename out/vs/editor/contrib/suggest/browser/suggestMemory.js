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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { CompletionItemKinds } from "../../../common/languages.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
class Memory {
  constructor(name) {
    this.name = name;
  }
  select(model, pos, items) {
    if (items.length === 0) {
      return 0;
    }
    const topScore = items[0].score[0];
    for (let i = 0; i < items.length; i++) {
      const { score, completion: suggestion } = items[i];
      if (score[0] !== topScore) {
        break;
      }
      if (suggestion.preselect) {
        return i;
      }
    }
    return 0;
  }
}
class NoMemory extends Memory {
  constructor() {
    super("first");
  }
  memorize(model, pos, item) {
  }
  toJSON() {
    return void 0;
  }
  fromJSON() {
  }
}
class LRUMemory extends Memory {
  constructor() {
    super("recentlyUsed");
    this._cache = new LRUCache(300, 0.66);
    this._seq = 0;
  }
  memorize(model, pos, item) {
    const key = `${model.getLanguageId()}/${item.textLabel}`;
    this._cache.set(key, {
      touch: this._seq++,
      type: item.completion.kind,
      insertText: item.completion.insertText
    });
  }
  select(model, pos, items) {
    if (items.length === 0) {
      return 0;
    }
    const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1);
    if (/\s$/.test(lineSuffix)) {
      return super.select(model, pos, items);
    }
    const topScore = items[0].score[0];
    let indexPreselect = -1;
    let indexRecency = -1;
    let seq = -1;
    for (let i = 0; i < items.length; i++) {
      if (items[i].score[0] !== topScore) {
        break;
      }
      const key = `${model.getLanguageId()}/${items[i].textLabel}`;
      const item = this._cache.peek(key);
      if (item && item.touch > seq && item.type === items[i].completion.kind && item.insertText === items[i].completion.insertText) {
        seq = item.touch;
        indexRecency = i;
      }
      if (items[i].completion.preselect && indexPreselect === -1) {
        return indexPreselect = i;
      }
    }
    if (indexRecency !== -1) {
      return indexRecency;
    } else if (indexPreselect !== -1) {
      return indexPreselect;
    } else {
      return 0;
    }
  }
  toJSON() {
    return this._cache.toJSON();
  }
  fromJSON(data) {
    this._cache.clear();
    const seq = 0;
    for (const [key, value] of data) {
      value.touch = seq;
      value.type = typeof value.type === "number" ? value.type : CompletionItemKinds.fromString(value.type);
      this._cache.set(key, value);
    }
    this._seq = this._cache.size;
  }
}
class PrefixMemory extends Memory {
  constructor() {
    super("recentlyUsedByPrefix");
    this._trie = TernarySearchTree.forStrings();
    this._seq = 0;
  }
  memorize(model, pos, item) {
    const { word } = model.getWordUntilPosition(pos);
    const key = `${model.getLanguageId()}/${word}`;
    this._trie.set(key, {
      type: item.completion.kind,
      insertText: item.completion.insertText,
      touch: this._seq++
    });
  }
  select(model, pos, items) {
    const { word } = model.getWordUntilPosition(pos);
    if (!word) {
      return super.select(model, pos, items);
    }
    const key = `${model.getLanguageId()}/${word}`;
    let item = this._trie.get(key);
    if (!item) {
      item = this._trie.findSubstr(key);
    }
    if (item) {
      for (let i = 0; i < items.length; i++) {
        const { kind, insertText } = items[i].completion;
        if (kind === item.type && insertText === item.insertText) {
          return i;
        }
      }
    }
    return super.select(model, pos, items);
  }
  toJSON() {
    const entries = [];
    this._trie.forEach((value, key) => entries.push([key, value]));
    entries.sort((a, b) => -(a[1].touch - b[1].touch)).forEach((value, i) => value[1].touch = i);
    return entries.slice(0, 200);
  }
  fromJSON(data) {
    this._trie.clear();
    if (data.length > 0) {
      this._seq = data[0][1].touch + 1;
      for (const [key, value] of data) {
        value.type = typeof value.type === "number" ? value.type : CompletionItemKinds.fromString(value.type);
        this._trie.set(key, value);
      }
    }
  }
}
let SuggestMemoryService = class {
  constructor(_storageService, _configService) {
    this._storageService = _storageService;
    this._configService = _configService;
    this._disposables = new DisposableStore();
    this._persistSoon = new RunOnceScheduler(() => this._saveState(), 500);
    this._disposables.add(_storageService.onWillSaveState((e) => {
      if (e.reason === WillSaveStateReason.SHUTDOWN) {
        this._saveState();
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    this._persistSoon.dispose();
  }
  memorize(model, pos, item) {
    this._withStrategy(model, pos).memorize(model, pos, item);
    this._persistSoon.schedule();
  }
  select(model, pos, items) {
    return this._withStrategy(model, pos).select(model, pos, items);
  }
  _withStrategy(model, pos) {
    const mode = this._configService.getValue("editor.suggestSelection", {
      overrideIdentifier: model.getLanguageIdAtPosition(pos.lineNumber, pos.column),
      resource: model.uri
    });
    if (this._strategy?.name !== mode) {
      this._saveState();
      const ctor = SuggestMemoryService._strategyCtors.get(mode) || NoMemory;
      this._strategy = new ctor();
      try {
        const share = this._configService.getValue("editor.suggest.shareSuggestSelections");
        const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
        const raw = this._storageService.get(`${SuggestMemoryService._storagePrefix}/${mode}`, scope);
        if (raw) {
          this._strategy.fromJSON(JSON.parse(raw));
        }
      } catch (e) {
      }
    }
    return this._strategy;
  }
  _saveState() {
    if (this._strategy) {
      const share = this._configService.getValue("editor.suggest.shareSuggestSelections");
      const scope = share ? StorageScope.PROFILE : StorageScope.WORKSPACE;
      const raw = JSON.stringify(this._strategy);
      this._storageService.store(`${SuggestMemoryService._storagePrefix}/${this._strategy.name}`, raw, scope, StorageTarget.MACHINE);
    }
  }
};
SuggestMemoryService._strategyCtors = /* @__PURE__ */ new Map([
  ["recentlyUsedByPrefix", PrefixMemory],
  ["recentlyUsed", LRUMemory],
  ["first", NoMemory]
]);
SuggestMemoryService._storagePrefix = "suggest/memories";
SuggestMemoryService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IConfigurationService)
], SuggestMemoryService);
const ISuggestMemoryService = createDecorator("ISuggestMemories");
registerSingleton(ISuggestMemoryService, SuggestMemoryService, InstantiationType.Delayed);
export {
  ISuggestMemoryService,
  LRUMemory,
  Memory,
  NoMemory,
  PrefixMemory,
  SuggestMemoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0TWVtb3J5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtS2luZHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtIH0gZnJvbSAnLi9zdWdnZXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0LCBXaWxsU2F2ZVN0YXRlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNZW1vcnkge1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IG5hbWU6IE1lbU1vZGUpIHsgfVxuXG5cdHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyIHtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgdG9wU2NvcmUgPSBpdGVtc1swXS5zY29yZVswXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB7IHNjb3JlLCBjb21wbGV0aW9uOiBzdWdnZXN0aW9uIH0gPSBpdGVtc1tpXTtcblx0XHRcdGlmIChzY29yZVswXSAhPT0gdG9wU2NvcmUpIHtcblx0XHRcdFx0Ly8gc3RvcCB3aGVuIGxlYXZpbmcgdGhlIGdyb3VwIG9mIHRvcCBtYXRjaGVzXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN1Z2dlc3Rpb24ucHJlc2VsZWN0KSB7XG5cdFx0XHRcdC8vIHN0b3Agd2hlbiBzZWVpbmcgYW4gYXV0by1zZWxlY3QtaXRlbVxuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRhYnN0cmFjdCBtZW1vcml6ZShtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW06IENvbXBsZXRpb25JdGVtKTogdm9pZDtcblxuXHRhYnN0cmFjdCB0b0pTT04oKTogb2JqZWN0IHwgdW5kZWZpbmVkO1xuXG5cdGFic3RyYWN0IGZyb21KU09OKGRhdGE6IG9iamVjdCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBOb01lbW9yeSBleHRlbmRzIE1lbW9yeSB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ2ZpcnN0Jyk7XG5cdH1cblxuXHRtZW1vcml6ZShtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW06IENvbXBsZXRpb25JdGVtKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZnJvbUpTT04oKSB7XG5cdFx0Ly9cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1lbUl0ZW0ge1xuXHR0eXBlOiBzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUtpbmQ7XG5cdGluc2VydFRleHQ6IHN0cmluZztcblx0dG91Y2g6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIExSVU1lbW9yeSBleHRlbmRzIE1lbW9yeSB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ3JlY2VudGx5VXNlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBNZW1JdGVtPigzMDAsIDAuNjYpO1xuXHRwcml2YXRlIF9zZXEgPSAwO1xuXG5cdG1lbW9yaXplKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBgJHttb2RlbC5nZXRMYW5ndWFnZUlkKCl9LyR7aXRlbS50ZXh0TGFiZWx9YDtcblx0XHR0aGlzLl9jYWNoZS5zZXQoa2V5LCB7XG5cdFx0XHR0b3VjaDogdGhpcy5fc2VxKyssXG5cdFx0XHR0eXBlOiBpdGVtLmNvbXBsZXRpb24ua2luZCxcblx0XHRcdGluc2VydFRleHQ6IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZWxlY3QobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uLCBpdGVtczogQ29tcGxldGlvbkl0ZW1bXSk6IG51bWJlciB7XG5cblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lU3VmZml4ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zLmxpbmVOdW1iZXIpLnN1YnN0cihwb3MuY29sdW1uIC0gMTAsIHBvcy5jb2x1bW4gLSAxKTtcblx0XHRpZiAoL1xccyQvLnRlc3QobGluZVN1ZmZpeCkpIHtcblx0XHRcdHJldHVybiBzdXBlci5zZWxlY3QobW9kZWwsIHBvcywgaXRlbXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvcFNjb3JlID0gaXRlbXNbMF0uc2NvcmVbMF07XG5cdFx0bGV0IGluZGV4UHJlc2VsZWN0ID0gLTE7XG5cdFx0bGV0IGluZGV4UmVjZW5jeSA9IC0xO1xuXHRcdGxldCBzZXEgPSAtMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaXRlbXNbaV0uc2NvcmVbMF0gIT09IHRvcFNjb3JlKSB7XG5cdFx0XHRcdC8vIGNvbnNpZGVyIG9ubHkgdG9wIGl0ZW1zXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5ID0gYCR7bW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpfS8ke2l0ZW1zW2ldLnRleHRMYWJlbH1gO1xuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2NhY2hlLnBlZWsoa2V5KTtcblx0XHRcdGlmIChpdGVtICYmIGl0ZW0udG91Y2ggPiBzZXEgJiYgaXRlbS50eXBlID09PSBpdGVtc1tpXS5jb21wbGV0aW9uLmtpbmQgJiYgaXRlbS5pbnNlcnRUZXh0ID09PSBpdGVtc1tpXS5jb21wbGV0aW9uLmluc2VydFRleHQpIHtcblx0XHRcdFx0c2VxID0gaXRlbS50b3VjaDtcblx0XHRcdFx0aW5kZXhSZWNlbmN5ID0gaTtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtc1tpXS5jb21wbGV0aW9uLnByZXNlbGVjdCAmJiBpbmRleFByZXNlbGVjdCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gc3RvcCB3aGVuIHNlZWluZyBhbiBhdXRvLXNlbGVjdC1pdGVtXG5cdFx0XHRcdHJldHVybiBpbmRleFByZXNlbGVjdCA9IGk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpbmRleFJlY2VuY3kgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gaW5kZXhSZWNlbmN5O1xuXHRcdH0gZWxzZSBpZiAoaW5kZXhQcmVzZWxlY3QgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gaW5kZXhQcmVzZWxlY3Q7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdHRvSlNPTigpOiBvYmplY3Qge1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZS50b0pTT04oKTtcblx0fVxuXG5cdGZyb21KU09OKGRhdGE6IFtzdHJpbmcsIE1lbUl0ZW1dW10pOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZS5jbGVhcigpO1xuXHRcdGNvbnN0IHNlcSA9IDA7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZGF0YSkge1xuXHRcdFx0dmFsdWUudG91Y2ggPSBzZXE7XG5cdFx0XHR2YWx1ZS50eXBlID0gdHlwZW9mIHZhbHVlLnR5cGUgPT09ICdudW1iZXInID8gdmFsdWUudHlwZSA6IENvbXBsZXRpb25JdGVtS2luZHMuZnJvbVN0cmluZyh2YWx1ZS50eXBlKTtcblx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5fc2VxID0gdGhpcy5fY2FjaGUuc2l6ZTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBQcmVmaXhNZW1vcnkgZXh0ZW5kcyBNZW1vcnkge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCdyZWNlbnRseVVzZWRCeVByZWZpeCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8TWVtSXRlbT4oKTtcblx0cHJpdmF0ZSBfc2VxID0gMDtcblxuXHRtZW1vcml6ZShtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW06IENvbXBsZXRpb25JdGVtKTogdm9pZCB7XG5cdFx0Y29uc3QgeyB3b3JkIH0gPSBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3MpO1xuXHRcdGNvbnN0IGtleSA9IGAke21vZGVsLmdldExhbmd1YWdlSWQoKX0vJHt3b3JkfWA7XG5cdFx0dGhpcy5fdHJpZS5zZXQoa2V5LCB7XG5cdFx0XHR0eXBlOiBpdGVtLmNvbXBsZXRpb24ua2luZCxcblx0XHRcdGluc2VydFRleHQ6IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0LFxuXHRcdFx0dG91Y2g6IHRoaXMuX3NlcSsrXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZWxlY3QobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uLCBpdGVtczogQ29tcGxldGlvbkl0ZW1bXSk6IG51bWJlciB7XG5cdFx0Y29uc3QgeyB3b3JkIH0gPSBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3MpO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnNlbGVjdChtb2RlbCwgcG9zLCBpdGVtcyk7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IGAke21vZGVsLmdldExhbmd1YWdlSWQoKX0vJHt3b3JkfWA7XG5cdFx0bGV0IGl0ZW0gPSB0aGlzLl90cmllLmdldChrZXkpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0aXRlbSA9IHRoaXMuX3RyaWUuZmluZFN1YnN0cihrZXkpO1xuXHRcdH1cblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCB7IGtpbmQsIGluc2VydFRleHQgfSA9IGl0ZW1zW2ldLmNvbXBsZXRpb247XG5cdFx0XHRcdGlmIChraW5kID09PSBpdGVtLnR5cGUgJiYgaW5zZXJ0VGV4dCA9PT0gaXRlbS5pbnNlcnRUZXh0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLnNlbGVjdChtb2RlbCwgcG9zLCBpdGVtcyk7XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblxuXHRcdGNvbnN0IGVudHJpZXM6IFtzdHJpbmcsIE1lbUl0ZW1dW10gPSBbXTtcblx0XHR0aGlzLl90cmllLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IGVudHJpZXMucHVzaChba2V5LCB2YWx1ZV0pKTtcblxuXHRcdC8vIHNvcnQgYnkgbGFzdCByZWNlbnRseSB1c2VkICh0b3VjaCksIHRoZW5cblx0XHQvLyB0YWtlIHRoZSB0b3AgMjAwIGl0ZW0gYW5kIG5vcm1hbGl6ZSB0aGVpclxuXHRcdC8vIHRvdWNoXG5cdFx0ZW50cmllc1xuXHRcdFx0LnNvcnQoKGEsIGIpID0+IC0oYVsxXS50b3VjaCAtIGJbMV0udG91Y2gpKVxuXHRcdFx0LmZvckVhY2goKHZhbHVlLCBpKSA9PiB2YWx1ZVsxXS50b3VjaCA9IGkpO1xuXG5cdFx0cmV0dXJuIGVudHJpZXMuc2xpY2UoMCwgMjAwKTtcblx0fVxuXG5cdGZyb21KU09OKGRhdGE6IFtzdHJpbmcsIE1lbUl0ZW1dW10pOiB2b2lkIHtcblx0XHR0aGlzLl90cmllLmNsZWFyKCk7XG5cdFx0aWYgKGRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fc2VxID0gZGF0YVswXVsxXS50b3VjaCArIDE7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBkYXRhKSB7XG5cdFx0XHRcdHZhbHVlLnR5cGUgPSB0eXBlb2YgdmFsdWUudHlwZSA9PT0gJ251bWJlcicgPyB2YWx1ZS50eXBlIDogQ29tcGxldGlvbkl0ZW1LaW5kcy5mcm9tU3RyaW5nKHZhbHVlLnR5cGUpO1xuXHRcdFx0XHR0aGlzLl90cmllLnNldChrZXksIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgTWVtTW9kZSA9ICdmaXJzdCcgfCAncmVjZW50bHlVc2VkJyB8ICdyZWNlbnRseVVzZWRCeVByZWZpeCc7XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0TWVtb3J5U2VydmljZSBpbXBsZW1lbnRzIElTdWdnZXN0TWVtb3J5U2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3N0cmF0ZWd5Q3RvcnMgPSBuZXcgTWFwPE1lbU1vZGUsIHsgbmV3KCk6IE1lbW9yeSB9PihbXG5cdFx0WydyZWNlbnRseVVzZWRCeVByZWZpeCcsIFByZWZpeE1lbW9yeV0sXG5cdFx0WydyZWNlbnRseVVzZWQnLCBMUlVNZW1vcnldLFxuXHRcdFsnZmlyc3QnLCBOb01lbW9yeV1cblx0XSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3N0b3JhZ2VQcmVmaXggPSAnc3VnZ2VzdC9tZW1vcmllcyc7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVyc2lzdFNvb246IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgX3N0cmF0ZWd5PzogTWVtb3J5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcGVyc2lzdFNvb24gPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9zYXZlU3RhdGUoKSwgNTAwKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoX3N0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZShlID0+IHtcblx0XHRcdGlmIChlLnJlYXNvbiA9PT0gV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTikge1xuXHRcdFx0XHR0aGlzLl9zYXZlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZXJzaXN0U29vbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRtZW1vcml6ZShtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW06IENvbXBsZXRpb25JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aFN0cmF0ZWd5KG1vZGVsLCBwb3MpLm1lbW9yaXplKG1vZGVsLCBwb3MsIGl0ZW0pO1xuXHRcdHRoaXMuX3BlcnNpc3RTb29uLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRzZWxlY3QobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uLCBpdGVtczogQ29tcGxldGlvbkl0ZW1bXSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhTdHJhdGVneShtb2RlbCwgcG9zKS5zZWxlY3QobW9kZWwsIHBvcywgaXRlbXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aFN0cmF0ZWd5KG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbik6IE1lbW9yeSB7XG5cblx0XHRjb25zdCBtb2RlID0gdGhpcy5fY29uZmlnU2VydmljZS5nZXRWYWx1ZTxNZW1Nb2RlPignZWRpdG9yLnN1Z2dlc3RTZWxlY3Rpb24nLCB7XG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uKSxcblx0XHRcdHJlc291cmNlOiBtb2RlbC51cmlcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9zdHJhdGVneT8ubmFtZSAhPT0gbW9kZSkge1xuXG5cdFx0XHR0aGlzLl9zYXZlU3RhdGUoKTtcblx0XHRcdGNvbnN0IGN0b3IgPSBTdWdnZXN0TWVtb3J5U2VydmljZS5fc3RyYXRlZ3lDdG9ycy5nZXQobW9kZSkgfHwgTm9NZW1vcnk7XG5cdFx0XHR0aGlzLl9zdHJhdGVneSA9IG5ldyBjdG9yKCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNoYXJlID0gdGhpcy5fY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLnN1Z2dlc3Quc2hhcmVTdWdnZXN0U2VsZWN0aW9ucycpO1xuXHRcdFx0XHRjb25zdCBzY29wZSA9IHNoYXJlID8gU3RvcmFnZVNjb3BlLlBST0ZJTEUgOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFO1xuXHRcdFx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoYCR7U3VnZ2VzdE1lbW9yeVNlcnZpY2UuX3N0b3JhZ2VQcmVmaXh9LyR7bW9kZX1gLCBzY29wZSk7XG5cdFx0XHRcdGlmIChyYXcpIHtcblx0XHRcdFx0XHR0aGlzLl9zdHJhdGVneS5mcm9tSlNPTihKU09OLnBhcnNlKHJhdykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIHRoaW5ncyBjYW4gZ28gd3Jvbmcgd2l0aCBKU09OLi4uXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3N0cmF0ZWd5O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVN0YXRlKCkge1xuXHRcdGlmICh0aGlzLl9zdHJhdGVneSkge1xuXHRcdFx0Y29uc3Qgc2hhcmUgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3Iuc3VnZ2VzdC5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zJyk7XG5cdFx0XHRjb25zdCBzY29wZSA9IHNoYXJlID8gU3RvcmFnZVNjb3BlLlBST0ZJTEUgOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFO1xuXHRcdFx0Y29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkodGhpcy5fc3RyYXRlZ3kpO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYCR7U3VnZ2VzdE1lbW9yeVNlcnZpY2UuX3N0b3JhZ2VQcmVmaXh9LyR7dGhpcy5fc3RyYXRlZ3kubmFtZX1gLCByYXcsIHNjb3BlLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxufVxuXG5cbmV4cG9ydCBjb25zdCBJU3VnZ2VzdE1lbW9yeVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVN1Z2dlc3RNZW1vcnlTZXJ2aWNlPignSVN1Z2dlc3RNZW1vcmllcycpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdWdnZXN0TWVtb3J5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0bWVtb3JpemUobW9kZWw6IElUZXh0TW9kZWwsIHBvczogSVBvc2l0aW9uLCBpdGVtOiBDb21wbGV0aW9uSXRlbSk6IHZvaWQ7XG5cdHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyO1xufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJU3VnZ2VzdE1lbW9yeVNlcnZpY2UsIFN1Z2dlc3RNZW1vcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFHbEMsU0FBNkIsMkJBQTJCO0FBRXhELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixjQUFjLGVBQWUsMkJBQTJCO0FBRTNFLE1BQWUsT0FBTztBQUFBLEVBRTVCLFlBQXFCLE1BQWU7QUFBZjtBQUFBLEVBQWlCO0FBQUEsRUFFdEMsT0FBTyxPQUFtQixLQUFnQixPQUFpQztBQUMxRSxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUNqQyxhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3RDLFlBQU0sRUFBRSxPQUFPLFlBQVksV0FBVyxJQUFJLE1BQU0sQ0FBQztBQUNqRCxVQUFJLE1BQU0sQ0FBQyxNQUFNLFVBQVU7QUFFMUI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxXQUFXLFdBQVc7QUFFekIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFPRDtBQUVPLE1BQU0saUJBQWlCLE9BQU87QUFBQSxFQUVwQyxjQUFjO0FBQ2IsVUFBTSxPQUFPO0FB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
