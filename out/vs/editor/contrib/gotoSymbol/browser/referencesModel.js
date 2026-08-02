import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { defaultGenerator } from "../../../../base/common/idGenerator.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { basename, extUri } from "../../../../base/common/resources.js";
import * as strings from "../../../../base/common/strings.js";
import { Constants } from "../../../../base/common/uint.js";
import { Range } from "../../../common/core/range.js";
import { localize } from "../../../../nls.js";
class OneReference {
  constructor(isProviderFirst, parent, link, _rangeCallback) {
    this.isProviderFirst = isProviderFirst;
    this.parent = parent;
    this.link = link;
    this._rangeCallback = _rangeCallback;
    this.id = defaultGenerator.nextId();
  }
  get uri() {
    return this.link.uri;
  }
  get range() {
    return this._range ?? this.link.targetSelectionRange ?? this.link.range;
  }
  set range(value) {
    this._range = value;
    this._rangeCallback(this);
  }
  get ariaMessage() {
    const preview = this.parent.getPreview(this)?.preview(this.range);
    if (!preview) {
      return localize(
        "aria.oneReference",
        "in {0} on line {1} at column {2}",
        basename(this.uri),
        this.range.startLineNumber,
        this.range.startColumn
      );
    } else {
      return localize(
        { key: "aria.oneReference.preview", comment: ["Placeholders are: 0: filename, 1:line number, 2: column number, 3: preview snippet of source code"] },
        "{0} in {1} on line {2} at column {3}",
        preview.value,
        basename(this.uri),
        this.range.startLineNumber,
        this.range.startColumn
      );
    }
  }
}
class FilePreview {
  constructor(_modelReference) {
    this._modelReference = _modelReference;
  }
  dispose() {
    this._modelReference.dispose();
  }
  preview(range, n = 8) {
    const model = this._modelReference.object.textEditorModel;
    if (!model) {
      return void 0;
    }
    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    const word = model.getWordUntilPosition({ lineNumber: startLineNumber, column: startColumn - n });
    const beforeRange = new Range(startLineNumber, word.startColumn, startLineNumber, startColumn);
    const afterRange = new Range(endLineNumber, endColumn, endLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
    const before = model.getValueInRange(beforeRange).replace(/^\s+/, "");
    const inside = model.getValueInRange(range);
    const after = model.getValueInRange(afterRange).replace(/\s+$/, "");
    return {
      value: before + inside + after,
      highlight: { start: before.length, end: before.length + inside.length }
    };
  }
}
class FileReferences {
  constructor(parent, uri) {
    this.parent = parent;
    this.uri = uri;
    this.children = [];
    this._previews = new ResourceMap();
  }
  dispose() {
    dispose(this._previews.values());
    this._previews.clear();
  }
  getPreview(child) {
    return this._previews.get(child.uri);
  }
  get ariaMessage() {
    const len = this.children.length;
    if (len === 1) {
      return localize("aria.fileReferences.1", "1 symbol in {0}, full path {1}", basename(this.uri), this.uri.fsPath);
    } else {
      return localize("aria.fileReferences.N", "{0} symbols in {1}, full path {2}", len, basename(this.uri), this.uri.fsPath);
    }
  }
  async resolve(textModelResolverService) {
    if (this._previews.size !== 0) {
      return this;
    }
    for (const child of this.children) {
      if (this._previews.has(child.uri)) {
        continue;
      }
      try {
        const ref = await textModelResolverService.createModelReference(child.uri);
        this._previews.set(child.uri, new FilePreview(ref));
      } catch (err) {
        onUnexpectedError(err);
      }
    }
    return this;
  }
}
class ReferencesModel {
  constructor(links, title) {
    this.groups = [];
    this.references = [];
    this._onDidChangeReferenceRange = new Emitter();
    this.onDidChangeReferenceRange = this._onDidChangeReferenceRange.event;
    this._links = links;
    this._title = title;
    const [providersFirst] = links;
    links.sort(ReferencesModel._compareReferences);
    let current;
    for (const link of links) {
      if (!current || !extUri.isEqual(current.uri, link.uri, true)) {
        current = new FileReferences(this, link.uri);
        this.groups.push(current);
      }
      if (current.children.length === 0 || ReferencesModel._compareReferences(link, current.children[current.children.length - 1]) !== 0) {
        const oneRef = new OneReference(
          providersFirst === link,
          current,
          link,
          (ref) => this._onDidChangeReferenceRange.fire(ref)
        );
        this.references.push(oneRef);
        current.children.push(oneRef);
      }
    }
  }
  dispose() {
    dispose(this.groups);
    this._onDidChangeReferenceRange.dispose();
    this.groups.length = 0;
  }
  clone() {
    return new ReferencesModel(this._links, this._title);
  }
  get title() {
    return this._title;
  }
  get isEmpty() {
    return this.groups.length === 0;
  }
  get ariaMessage() {
    if (this.isEmpty) {
      return localize("aria.result.0", "No results found");
    } else if (this.references.length === 1) {
      return localize("aria.result.1", "Found 1 symbol in {0}", this.references[0].uri.fsPath);
    } else if (this.groups.length === 1) {
      return localize("aria.result.n1", "Found {0} symbols in {1}", this.references.length, this.groups[0].uri.fsPath);
    } else {
      return localize("aria.result.nm", "Found {0} symbols in {1} files", this.references.length, this.groups.length);
    }
  }
  nextOrPreviousReference(reference, next) {
    const { parent } = reference;
    let idx = parent.children.indexOf(reference);
    const childCount = parent.children.length;
    const groupCount = parent.parent.groups.length;
    if (groupCount === 1 || next && idx + 1 < childCount || !next && idx > 0) {
      if (next) {
        idx = (idx + 1) % childCount;
      } else {
        idx = (idx + childCount - 1) % childCount;
      }
      return parent.children[idx];
    }
    idx = parent.parent.groups.indexOf(parent);
    if (next) {
      idx = (idx + 1) % groupCount;
      return parent.parent.groups[idx].children[0];
    } else {
      idx = (idx + groupCount - 1) % groupCount;
      return parent.parent.groups[idx].children[parent.parent.groups[idx].children.length - 1];
    }
  }
  nearestReference(resource, position) {
    const nearest = this.references.map((ref, idx) => {
      return {
        idx,
        prefixLen: strings.commonPrefixLength(ref.uri.toString(), resource.toString()),
        offsetDist: Math.abs(ref.range.startLineNumber - position.lineNumber) * 100 + Math.abs(ref.range.startColumn - position.column)
      };
    }).sort((a, b) => {
      if (a.prefixLen > b.prefixLen) {
        return -1;
      } else if (a.prefixLen < b.prefixLen) {
        return 1;
      } else if (a.offsetDist < b.offsetDist) {
        return -1;
      } else if (a.offsetDist > b.offsetDist) {
        return 1;
      } else {
        return 0;
      }
    })[0];
    if (nearest) {
      return this.references[nearest.idx];
    }
    return void 0;
  }
  referenceAt(resource, position) {
    for (const ref of this.references) {
      if (ref.uri.toString() === resource.toString()) {
        if (Range.containsPosition(ref.range, position)) {
          return ref;
        }
      }
    }
    return void 0;
  }
  firstReference() {
    for (const ref of this.references) {
      if (ref.isProviderFirst) {
        return ref;
      }
    }
    return this.references[0];
  }
  static _compareReferences(a, b) {
    return extUri.compare(a.uri, b.uri) || Range.compareRangesUsingStarts(a.range, b.range);
  }
}
export {
  FilePreview,
  FileReferences,
  OneReference,
  ReferencesModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9yZWZlcmVuY2VzTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExvY2F0aW9uLCBMb2NhdGlvbkxpbmsgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBPbmVSZWZlcmVuY2Uge1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgPSBkZWZhdWx0R2VuZXJhdG9yLm5leHRJZCgpO1xuXG5cdHByaXZhdGUgX3JhbmdlPzogSVJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlzUHJvdmlkZXJGaXJzdDogYm9vbGVhbixcblx0XHRyZWFkb25seSBwYXJlbnQ6IEZpbGVSZWZlcmVuY2VzLFxuXHRcdHJlYWRvbmx5IGxpbms6IExvY2F0aW9uTGluayxcblx0XHRwcml2YXRlIF9yYW5nZUNhbGxiYWNrOiAocmVmOiBPbmVSZWZlcmVuY2UpID0+IHZvaWRcblx0KSB7IH1cblxuXHRnZXQgdXJpKCkge1xuXHRcdHJldHVybiB0aGlzLmxpbmsudXJpO1xuXHR9XG5cblx0Z2V0IHJhbmdlKCk6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JhbmdlID8/IHRoaXMubGluay50YXJnZXRTZWxlY3Rpb25SYW5nZSA/PyB0aGlzLmxpbmsucmFuZ2U7XG5cdH1cblxuXHRzZXQgcmFuZ2UodmFsdWU6IElSYW5nZSkge1xuXHRcdHRoaXMuX3JhbmdlID0gdmFsdWU7XG5cdFx0dGhpcy5fcmFuZ2VDYWxsYmFjayh0aGlzKTtcblx0fVxuXG5cdGdldCBhcmlhTWVzc2FnZSgpOiBzdHJpbmcge1xuXG5cdFx0Y29uc3QgcHJldmlldyA9IHRoaXMucGFyZW50LmdldFByZXZpZXcodGhpcyk/LnByZXZpZXcodGhpcy5yYW5nZSk7XG5cblx0XHRpZiAoIXByZXZpZXcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdFx0J2FyaWEub25lUmVmZXJlbmNlJywgXCJpbiB7MH0gb24gbGluZSB7MX0gYXQgY29sdW1uIHsyfVwiLFxuXHRcdFx0XHRiYXNlbmFtZSh0aGlzLnVyaSksIHRoaXMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB0aGlzLnJhbmdlLnN0YXJ0Q29sdW1uXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdHsga2V5OiAnYXJpYS5vbmVSZWZlcmVuY2UucHJldmlldycsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXJzIGFyZTogMDogZmlsZW5hbWUsIDE6bGluZSBudW1iZXIsIDI6IGNvbHVtbiBudW1iZXIsIDM6IHByZXZpZXcgc25pcHBldCBvZiBzb3VyY2UgY29kZSddIH0sIFwiezB9IGluIHsxfSBvbiBsaW5lIHsyfSBhdCBjb2x1bW4gezN9XCIsXG5cdFx0XHRcdHByZXZpZXcudmFsdWUsIGJhc2VuYW1lKHRoaXMudXJpKSwgdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHRoaXMucmFuZ2Uuc3RhcnRDb2x1bW5cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlUHJldmlldyBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFJlZmVyZW5jZTogSVJlZmVyZW5jZTxJVGV4dEVkaXRvck1vZGVsPlxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxSZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJldmlldyhyYW5nZTogSVJhbmdlLCBuOiBudW1iZXIgPSA4KTogeyB2YWx1ZTogc3RyaW5nOyBoaWdobGlnaHQ6IElNYXRjaCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsUmVmZXJlbmNlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uIH0gPSByYW5nZTtcblx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0V29yZFVudGlsUG9zaXRpb24oeyBsaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsIGNvbHVtbjogc3RhcnRDb2x1bW4gLSBuIH0pO1xuXHRcdGNvbnN0IGJlZm9yZVJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbik7XG5cdFx0Y29uc3QgYWZ0ZXJSYW5nZSA9IG5ldyBSYW5nZShlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblxuXHRcdGNvbnN0IGJlZm9yZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShiZWZvcmVSYW5nZSkucmVwbGFjZSgvXlxccysvLCAnJyk7XG5cdFx0Y29uc3QgaW5zaWRlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKTtcblx0XHRjb25zdCBhZnRlciA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShhZnRlclJhbmdlKS5yZXBsYWNlKC9cXHMrJC8sICcnKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR2YWx1ZTogYmVmb3JlICsgaW5zaWRlICsgYWZ0ZXIsXG5cdFx0XHRoaWdobGlnaHQ6IHsgc3RhcnQ6IGJlZm9yZS5sZW5ndGgsIGVuZDogYmVmb3JlLmxlbmd0aCArIGluc2lkZS5sZW5ndGggfVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVSZWZlcmVuY2VzIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBPbmVSZWZlcmVuY2VbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3ByZXZpZXdzID0gbmV3IFJlc291cmNlTWFwPEZpbGVQcmV2aWV3PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHBhcmVudDogUmVmZXJlbmNlc01vZGVsLFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX3ByZXZpZXdzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9wcmV2aWV3cy5jbGVhcigpO1xuXHR9XG5cblx0Z2V0UHJldmlldyhjaGlsZDogT25lUmVmZXJlbmNlKTogRmlsZVByZXZpZXcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcmV2aWV3cy5nZXQoY2hpbGQudXJpKTtcblx0fVxuXG5cdGdldCBhcmlhTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdGlmIChsZW4gPT09IDEpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYS5maWxlUmVmZXJlbmNlcy4xJywgXCIxIHN5bWJvbCBpbiB7MH0sIGZ1bGwgcGF0aCB7MX1cIiwgYmFzZW5hbWUodGhpcy51cmkpLCB0aGlzLnVyaS5mc1BhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWEuZmlsZVJlZmVyZW5jZXMuTicsIFwiezB9IHN5bWJvbHMgaW4gezF9LCBmdWxsIHBhdGggezJ9XCIsIGxlbiwgYmFzZW5hbWUodGhpcy51cmkpLCB0aGlzLnVyaS5mc1BhdGgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmUodGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSk6IFByb21pc2U8RmlsZVJlZmVyZW5jZXM+IHtcblx0XHRpZiAodGhpcy5fcHJldmlld3Muc2l6ZSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0aWYgKHRoaXMuX3ByZXZpZXdzLmhhcyhjaGlsZC51cmkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoaWxkLnVyaSk7XG5cdFx0XHRcdHRoaXMuX3ByZXZpZXdzLnNldChjaGlsZC51cmksIG5ldyBGaWxlUHJldmlldyhyZWYpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVmZXJlbmNlc01vZGVsIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtzOiBMb2NhdGlvbkxpbmtbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGU6IHN0cmluZztcblxuXHRyZWFkb25seSBncm91cHM6IEZpbGVSZWZlcmVuY2VzW10gPSBbXTtcblx0cmVhZG9ubHkgcmVmZXJlbmNlczogT25lUmVmZXJlbmNlW10gPSBbXTtcblxuXHRyZWFkb25seSBfb25EaWRDaGFuZ2VSZWZlcmVuY2VSYW5nZSA9IG5ldyBFbWl0dGVyPE9uZVJlZmVyZW5jZT4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWZlcmVuY2VSYW5nZTogRXZlbnQ8T25lUmVmZXJlbmNlPiA9IHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlUmFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IobGlua3M6IExvY2F0aW9uTGlua1tdLCB0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbGlua3MgPSBsaW5rcztcblx0XHR0aGlzLl90aXRsZSA9IHRpdGxlO1xuXG5cdFx0Ly8gZ3JvdXBpbmcgYW5kIHNvcnRpbmdcblx0XHRjb25zdCBbcHJvdmlkZXJzRmlyc3RdID0gbGlua3M7XG5cdFx0bGlua3Muc29ydChSZWZlcmVuY2VzTW9kZWwuX2NvbXBhcmVSZWZlcmVuY2VzKTtcblxuXHRcdGxldCBjdXJyZW50OiBGaWxlUmVmZXJlbmNlcyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGxpbmsgb2YgbGlua3MpIHtcblx0XHRcdGlmICghY3VycmVudCB8fCAhZXh0VXJpLmlzRXF1YWwoY3VycmVudC51cmksIGxpbmsudXJpLCB0cnVlKSkge1xuXHRcdFx0XHQvLyBuZXcgZ3JvdXBcblx0XHRcdFx0Y3VycmVudCA9IG5ldyBGaWxlUmVmZXJlbmNlcyh0aGlzLCBsaW5rLnVyaSk7XG5cdFx0XHRcdHRoaXMuZ3JvdXBzLnB1c2goY3VycmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFwcGVuZCwgY2hlY2sgZm9yIGVxdWFsaXR5IGZpcnN0IVxuXHRcdFx0aWYgKGN1cnJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwIHx8IFJlZmVyZW5jZXNNb2RlbC5fY29tcGFyZVJlZmVyZW5jZXMobGluaywgY3VycmVudC5jaGlsZHJlbltjdXJyZW50LmNoaWxkcmVuLmxlbmd0aCAtIDFdKSAhPT0gMCkge1xuXG5cdFx0XHRcdGNvbnN0IG9uZVJlZiA9IG5ldyBPbmVSZWZlcmVuY2UoXG5cdFx0XHRcdFx0cHJvdmlkZXJzRmlyc3QgPT09IGxpbmssXG5cdFx0XHRcdFx0Y3VycmVudCxcblx0XHRcdFx0XHRsaW5rLFxuXHRcdFx0XHRcdHJlZiA9PiB0aGlzLl9vbkRpZENoYW5nZVJlZmVyZW5jZVJhbmdlLmZpcmUocmVmKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLnJlZmVyZW5jZXMucHVzaChvbmVSZWYpO1xuXHRcdFx0XHRjdXJyZW50LmNoaWxkcmVuLnB1c2gob25lUmVmKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5ncm91cHMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlUmFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZ3JvdXBzLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRjbG9uZSgpOiBSZWZlcmVuY2VzTW9kZWwge1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKHRoaXMuX2xpbmtzLCB0aGlzLl90aXRsZSk7XG5cdH1cblxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdGl0bGU7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncm91cHMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Z2V0IGFyaWFNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcmlhLnJlc3VsdC4wJywgXCJObyByZXN1bHRzIGZvdW5kXCIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5yZWZlcmVuY2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhcmlhLnJlc3VsdC4xJywgXCJGb3VuZCAxIHN5bWJvbCBpbiB7MH1cIiwgdGhpcy5yZWZlcmVuY2VzWzBdLnVyaS5mc1BhdGgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5ncm91cHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWEucmVzdWx0Lm4xJywgXCJGb3VuZCB7MH0gc3ltYm9scyBpbiB7MX1cIiwgdGhpcy5yZWZlcmVuY2VzLmxlbmd0aCwgdGhpcy5ncm91cHNbMF0udXJpLmZzUGF0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYS5yZXN1bHQubm0nLCBcIkZvdW5kIHswfSBzeW1ib2xzIGluIHsxfSBmaWxlc1wiLCB0aGlzLnJlZmVyZW5jZXMubGVuZ3RoLCB0aGlzLmdyb3Vwcy5sZW5ndGgpO1xuXHRcdH1cblx0fVxuXG5cdG5leHRPclByZXZpb3VzUmVmZXJlbmNlKHJlZmVyZW5jZTogT25lUmVmZXJlbmNlLCBuZXh0OiBib29sZWFuKTogT25lUmVmZXJlbmNlIHtcblxuXHRcdGNvbnN0IHsgcGFyZW50IH0gPSByZWZlcmVuY2U7XG5cblx0XHRsZXQgaWR4ID0gcGFyZW50LmNoaWxkcmVuLmluZGV4T2YocmVmZXJlbmNlKTtcblx0XHRjb25zdCBjaGlsZENvdW50ID0gcGFyZW50LmNoaWxkcmVuLmxlbmd0aDtcblx0XHRjb25zdCBncm91cENvdW50ID0gcGFyZW50LnBhcmVudC5ncm91cHMubGVuZ3RoO1xuXG5cdFx0aWYgKGdyb3VwQ291bnQgPT09IDEgfHwgbmV4dCAmJiBpZHggKyAxIDwgY2hpbGRDb3VudCB8fCAhbmV4dCAmJiBpZHggPiAwKSB7XG5cdFx0XHQvLyBjeWNsaW5nIHdpdGhpbiBvbmUgZmlsZVxuXHRcdFx0aWYgKG5leHQpIHtcblx0XHRcdFx0aWR4ID0gKGlkeCArIDEpICUgY2hpbGRDb3VudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlkeCA9IChpZHggKyBjaGlsZENvdW50IC0gMSkgJSBjaGlsZENvdW50O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcmVudC5jaGlsZHJlbltpZHhdO1xuXHRcdH1cblxuXHRcdGlkeCA9IHBhcmVudC5wYXJlbnQuZ3JvdXBzLmluZGV4T2YocGFyZW50KTtcblx0XHRpZiAobmV4dCkge1xuXHRcdFx0aWR4ID0gKGlkeCArIDEpICUgZ3JvdXBDb3VudDtcblx0XHRcdHJldHVybiBwYXJlbnQucGFyZW50Lmdyb3Vwc1tpZHhdLmNoaWxkcmVuWzBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZHggPSAoaWR4ICsgZ3JvdXBDb3VudCAtIDEpICUgZ3JvdXBDb3VudDtcblx0XHRcdHJldHVybiBwYXJlbnQucGFyZW50Lmdyb3Vwc1tpZHhdLmNoaWxkcmVuW3BhcmVudC5wYXJlbnQuZ3JvdXBzW2lkeF0uY2hpbGRyZW4ubGVuZ3RoIC0gMV07XG5cdFx0fVxuXHR9XG5cblx0bmVhcmVzdFJlZmVyZW5jZShyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogUG9zaXRpb24pOiBPbmVSZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXG5cdFx0Y29uc3QgbmVhcmVzdCA9IHRoaXMucmVmZXJlbmNlcy5tYXAoKHJlZiwgaWR4KSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZHgsXG5cdFx0XHRcdHByZWZpeExlbjogc3RyaW5ncy5jb21tb25QcmVmaXhMZW5ndGgocmVmLnVyaS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0b2Zmc2V0RGlzdDogTWF0aC5hYnMocmVmLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIHBvc2l0aW9uLmxpbmVOdW1iZXIpICogMTAwICsgTWF0aC5hYnMocmVmLnJhbmdlLnN0YXJ0Q29sdW1uIC0gcG9zaXRpb24uY29sdW1uKVxuXHRcdFx0fTtcblx0XHR9KS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5wcmVmaXhMZW4gPiBiLnByZWZpeExlbikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2UgaWYgKGEucHJlZml4TGVuIDwgYi5wcmVmaXhMZW4pIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGEub2Zmc2V0RGlzdCA8IGIub2Zmc2V0RGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2UgaWYgKGEub2Zmc2V0RGlzdCA+IGIub2Zmc2V0RGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdH0pWzBdO1xuXG5cdFx0aWYgKG5lYXJlc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlZmVyZW5jZXNbbmVhcmVzdC5pZHhdO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVmZXJlbmNlQXQocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IFBvc2l0aW9uKTogT25lUmVmZXJlbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLnJlZmVyZW5jZXMpIHtcblx0XHRcdGlmIChyZWYudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0aWYgKFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocmVmLnJhbmdlLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVmO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmaXJzdFJlZmVyZW5jZSgpOiBPbmVSZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMucmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKHJlZi5pc1Byb3ZpZGVyRmlyc3QpIHtcblx0XHRcdFx0cmV0dXJuIHJlZjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucmVmZXJlbmNlc1swXTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wYXJlUmVmZXJlbmNlcyhhOiBMb2NhdGlvbiwgYjogTG9jYXRpb24pOiBudW1iZXIge1xuXHRcdHJldHVybiBleHRVcmkuY29tcGFyZShhLnVyaSwgYi51cmkpIHx8IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUUvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQXdDO0FBQ2pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFlBQVksYUFBYTtBQUN6QixTQUFTLGlCQUFpQjtBQUcxQixTQUFpQixhQUFhO0FBRzlCLFNBQVMsZ0JBQWdCO0FBRWxCLE1BQU0sYUFBYTtBQUFBLEVBTXpCLFlBQ1UsaUJBQ0EsUUFDQSxNQUNELGdCQUNQO0FBSlE7QUFDQTtBQUNBO0FBQ0Q7QUFSVCxTQUFTLEtBQWEsaUJBQWlCLE9BQU87QUFBQSxFQVMxQztBQUFBLEVBRUosSUFBSSxNQUFNO0FBQ1QsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBLEVBRUEsSUFBSSxRQUFnQjtBQUNuQixXQUFPLEtBQUssVUFBVSxLQUFLLEtBQUssd0JBQXdCLEtBQUssS0FBSztBQUFBLEVBQ25FO0FBQUEsRUFFQSxJQUFJLE1BQU0sT0FBZTtBQUN4QixTQUFLLFNBQVM7QUFDZCxTQUFLLGVBQWUsSUFBSTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLGNBQXNCO0FBRXpCLFVBQU0sVUFBVSxLQUFLLE9BQU8sV0FBVyxJQUFJLEdBQUcsUUFBUSxLQUFLLEtBQUs7QUFFaEUsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQXFCO0FBQUEsUUFDckIsU0FBUyxLQUFLLEdBQUc7QUFB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
