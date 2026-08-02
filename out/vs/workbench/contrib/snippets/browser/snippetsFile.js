import { parse as jsonParse, getNodeType } from "../../../../base/common/json.js";
import { localize } from "../../../../nls.js";
import { extname, basename } from "../../../../base/common/path.js";
import { SnippetParser, Variable, Placeholder, Text } from "../../../../editor/contrib/snippet/browser/snippetParser.js";
import { KnownSnippetVariableNames } from "../../../../editor/contrib/snippet/browser/snippetVariables.js";
import { relativePath } from "../../../../base/common/resources.js";
import { isObject } from "../../../../base/common/types.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { WindowIdleValue, getActiveWindow } from "../../../../base/browser/dom.js";
import { match as matchGlob } from "../../../../base/common/glob.js";
import { Schemas } from "../../../../base/common/network.js";
class SnippetBodyInsights {
  constructor(body) {
    this.isBogous = false;
    this.isTrivial = false;
    this.usesClipboardVariable = false;
    this.usesSelectionVariable = false;
    this.codeSnippet = body;
    const textmateSnippet = new SnippetParser().parse(body, false);
    const placeholders = /* @__PURE__ */ new Map();
    let placeholderMax = 0;
    for (const placeholder of textmateSnippet.placeholders) {
      placeholderMax = Math.max(placeholderMax, placeholder.index);
    }
    if (textmateSnippet.placeholders.length === 0) {
      this.isTrivial = true;
    } else if (placeholderMax === 0) {
      const last = textmateSnippet.children.at(-1);
      this.isTrivial = last instanceof Placeholder && last.isFinalTabstop;
    }
    const stack = [...textmateSnippet.children];
    while (stack.length > 0) {
      const marker = stack.shift();
      if (marker instanceof Variable) {
        if (marker.children.length === 0 && !KnownSnippetVariableNames[marker.name]) {
          const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
          placeholders.set(marker.name, index);
          const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
          textmateSnippet.replace(marker, [synthetic]);
          this.isBogous = true;
        }
        switch (marker.name) {
          case "CLIPBOARD":
            this.usesClipboardVariable = true;
            break;
          case "SELECTION":
          case "TM_SELECTED_TEXT":
            this.usesSelectionVariable = true;
            break;
        }
      } else {
        stack.push(...marker.children);
      }
    }
    if (this.isBogous) {
      this.codeSnippet = textmateSnippet.toTextmateString();
    }
  }
}
class Snippet {
  constructor(isFileTemplate, scopes, name, prefix, description, body, source, snippetSource, snippetIdentifier, include, exclude, extensionId) {
    this.isFileTemplate = isFileTemplate;
    this.scopes = scopes;
    this.name = name;
    this.prefix = prefix;
    this.description = description;
    this.body = body;
    this.source = source;
    this.snippetSource = snippetSource;
    this.snippetIdentifier = snippetIdentifier;
    this.include = include;
    this.exclude = exclude;
    this.extensionId = extensionId;
    this.prefixLow = prefix.toLowerCase();
    this._bodyInsights = new WindowIdleValue(getActiveWindow(), () => new SnippetBodyInsights(this.body));
  }
  get codeSnippet() {
    return this._bodyInsights.value.codeSnippet;
  }
  get isBogous() {
    return this._bodyInsights.value.isBogous;
  }
  get isTrivial() {
    return this._bodyInsights.value.isTrivial;
  }
  get needsClipboard() {
    return this._bodyInsights.value.usesClipboardVariable;
  }
  get usesSelection() {
    return this._bodyInsights.value.usesSelectionVariable;
  }
  isFileIncluded(resourceUri) {
    const uriPath = resourceUri.scheme === Schemas.file ? resourceUri.fsPath : resourceUri.path;
    const fileName = basename(uriPath);
    const getMatchTarget = (pattern) => {
      return pattern.includes("/") ? uriPath : fileName;
    };
    if (this.exclude) {
      for (const pattern of this.exclude.filter(Boolean)) {
        if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
          return false;
        }
      }
    }
    if (this.include) {
      for (const pattern of this.include.filter(Boolean)) {
        if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
          return true;
        }
      }
      return false;
    }
    return true;
  }
}
function isJsonSerializedSnippet(thing) {
  return isObject(thing) && Boolean(thing.body);
}
var SnippetSource = /* @__PURE__ */ ((SnippetSource2) => {
  SnippetSource2[SnippetSource2["User"] = 1] = "User";
  SnippetSource2[SnippetSource2["Workspace"] = 2] = "Workspace";
  SnippetSource2[SnippetSource2["Extension"] = 3] = "Extension";
  return SnippetSource2;
})(SnippetSource || {});
class SnippetFile {
  constructor(source, location, defaultScopes, _extension, _fileService, _extensionResourceLoaderService) {
    this.source = source;
    this.location = location;
    this.defaultScopes = defaultScopes;
    this._extension = _extension;
    this._fileService = _fileService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this.data = [];
    this.isGlobalSnippets = extname(location.path) === ".code-snippets";
    this.isUserSnippets = !this._extension;
  }
  select(selector, bucket) {
    if (this.isGlobalSnippets || !this.isUserSnippets) {
      this._scopeSelect(selector, bucket);
    } else {
      this._filepathSelect(selector, bucket);
    }
  }
  _filepathSelect(selector, bucket) {
    if (selector + ".json" === basename(this.location.path)) {
      bucket.push(...this.data);
    }
  }
  _scopeSelect(selector, bucket) {
    for (const snippet of this.data) {
      const len = snippet.scopes.length;
      if (len === 0) {
        bucket.push(snippet);
      } else {
        for (let i = 0; i < len; i++) {
          if (snippet.scopes[i] === selector) {
            bucket.push(snippet);
            break;
          }
        }
      }
    }
    const idx = selector.lastIndexOf(".");
    if (idx >= 0) {
      this._scopeSelect(selector.substring(0, idx), bucket);
    }
  }
  async _load() {
    if (this._extension) {
      return this._extensionResourceLoaderService.readExtensionResource(this.location);
    } else {
      const content = await this._fileService.readFile(this.location);
      return content.value.toString();
    }
  }
  load() {
    if (!this._loadPromise) {
      this._loadPromise = Promise.resolve(this._load()).then((content) => {
        const data = jsonParse(content);
        if (getNodeType(data) === "object") {
          for (const [name, scopeOrTemplate] of Object.entries(data)) {
            if (isJsonSerializedSnippet(scopeOrTemplate)) {
              this._parseSnippet(name, scopeOrTemplate, this.data);
            } else {
              for (const [name2, template] of Object.entries(scopeOrTemplate)) {
                this._parseSnippet(name2, template, this.data);
              }
            }
          }
        }
        return this;
      });
    }
    return this._loadPromise;
  }
  reset() {
    this._loadPromise = void 0;
    this.data.length = 0;
  }
  _parseSnippet(name, snippet, bucket) {
    let { isFileTemplate, prefix, body, description } = snippet;
    if (!prefix) {
      prefix = "";
    }
    if (Array.isArray(body)) {
      body = body.join("\n");
    }
    if (typeof body !== "string") {
      return;
    }
    if (Array.isArray(description)) {
      description = description.join("\n");
    }
    let scopes;
    if (this.defaultScopes) {
      scopes = this.defaultScopes;
    } else if (typeof snippet.scope === "string") {
      scopes = snippet.scope.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      scopes = [];
    }
    let include;
    if (snippet.include) {
      if (Array.isArray(snippet.include)) {
        include = snippet.include;
      } else if (typeof snippet.include === "string") {
        include = [snippet.include];
      }
    }
    let exclude;
    if (snippet.exclude) {
      if (Array.isArray(snippet.exclude)) {
        exclude = snippet.exclude;
      } else if (typeof snippet.exclude === "string") {
        exclude = [snippet.exclude];
      }
    }
    let source;
    if (this._extension) {
      source = this._extension.displayName || this._extension.name;
    } else if (this.source === 2 /* Workspace */) {
      source = localize("source.workspaceSnippetGlobal", "Workspace Snippet");
    } else {
      if (this.isGlobalSnippets) {
        source = localize("source.userSnippetGlobal", "Global User Snippet");
      } else {
        source = localize("source.userSnippet", "User Snippet");
      }
    }
    for (const _prefix of Iterable.wrap(prefix)) {
      bucket.push(new Snippet(
        Boolean(isFileTemplate),
        scopes,
        name,
        _prefix,
        description,
        body,
        source,
        this.source,
        this._extension ? `${relativePath(this._extension.extensionLocation, this.location)}/${name}` : `${basename(this.location.path)}/${name}`,
        include,
        exclude,
        this._extension?.identifier
      ));
    }
  }
}
export {
  Snippet,
  SnippetFile,
  SnippetSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvc25pcHBldHNGaWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcGFyc2UgYXMganNvblBhcnNlLCBnZXROb2RlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIsIFZhcmlhYmxlLCBQbGFjZWhvbGRlciwgVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IEtub3duU25pcHBldFZhcmlhYmxlTmFtZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlc291cmNlTG9hZGVyL2NvbW1vbi9leHRlbnNpb25SZXNvdXJjZUxvYWRlci5qcyc7XG5pbXBvcnQgeyByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IFdpbmRvd0lkbGVWYWx1ZSwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYXRjaCBhcyBtYXRjaEdsb2IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuY2xhc3MgU25pcHBldEJvZHlJbnNpZ2h0cyB7XG5cblx0cmVhZG9ubHkgY29kZVNuaXBwZXQ6IHN0cmluZztcblxuXHQvKiogVGhlIHNuaXBwZXQgdXNlcyBiYWQgcGxhY2Vob2xkZXJzIHdoaWNoIGNvbGxpZGUgd2l0aCB2YXJpYWJsZSBuYW1lcyAqL1xuXHRyZWFkb25seSBpc0JvZ291czogYm9vbGVhbjtcblxuXHQvKiogVGhlIHNuaXBwZXQgaGFzIG5vIHBsYWNlaG9sZGVyIG9mIHRoZSBmaW5hbCBwbGFjZWhvbGRlciBpcyBhdCB0aGUgZW5kICovXG5cdHJlYWRvbmx5IGlzVHJpdmlhbDogYm9vbGVhbjtcblxuXHRyZWFkb25seSB1c2VzQ2xpcGJvYXJkVmFyaWFibGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZXNTZWxlY3Rpb25WYXJpYWJsZTogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihib2R5OiBzdHJpbmcpIHtcblxuXHRcdC8vIGluaXQgd2l0aCBkZWZhdWx0c1xuXHRcdHRoaXMuaXNCb2dvdXMgPSBmYWxzZTtcblx0XHR0aGlzLmlzVHJpdmlhbCA9IGZhbHNlO1xuXHRcdHRoaXMudXNlc0NsaXBib2FyZFZhcmlhYmxlID0gZmFsc2U7XG5cdFx0dGhpcy51c2VzU2VsZWN0aW9uVmFyaWFibGUgPSBmYWxzZTtcblx0XHR0aGlzLmNvZGVTbmlwcGV0ID0gYm9keTtcblxuXHRcdC8vIGNoZWNrIHNuaXBwZXQuLi5cblx0XHRjb25zdCB0ZXh0bWF0ZVNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGJvZHksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bGV0IHBsYWNlaG9sZGVyTWF4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyIG9mIHRleHRtYXRlU25pcHBldC5wbGFjZWhvbGRlcnMpIHtcblx0XHRcdHBsYWNlaG9sZGVyTWF4ID0gTWF0aC5tYXgocGxhY2Vob2xkZXJNYXgsIHBsYWNlaG9sZGVyLmluZGV4KTtcblx0XHR9XG5cblx0XHQvLyBtYXJrIHNuaXBwZXQgYXMgdHJpdmlhbCB3aGVuIHRoZXJlIGlzIG5vIHBsYWNlaG9sZGVycyBvciB3aGVuIHRoZSBvbmx5XG5cdFx0Ly8gcGxhY2Vob2xkZXIgaXMgdGhlIGZpbmFsIHRhYnN0b3AgYW5kIGl0IGlzIGF0IHRoZSB2ZXJ5IGVuZC5cblx0XHRpZiAodGV4dG1hdGVTbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuaXNUcml2aWFsID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHBsYWNlaG9sZGVyTWF4ID09PSAwKSB7XG5cdFx0XHRjb25zdCBsYXN0ID0gdGV4dG1hdGVTbmlwcGV0LmNoaWxkcmVuLmF0KC0xKTtcblx0XHRcdHRoaXMuaXNUcml2aWFsID0gbGFzdCBpbnN0YW5jZW9mIFBsYWNlaG9sZGVyICYmIGxhc3QuaXNGaW5hbFRhYnN0b3A7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhY2sgPSBbLi4udGV4dG1hdGVTbmlwcGV0LmNoaWxkcmVuXTtcblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgbWFya2VyID0gc3RhY2suc2hpZnQoKSE7XG5cdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblxuXHRcdFx0XHRpZiAobWFya2VyLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCAmJiAhS25vd25TbmlwcGV0VmFyaWFibGVOYW1lc1ttYXJrZXIubmFtZV0pIHtcblx0XHRcdFx0XHQvLyBhICd2YXJpYWJsZScgd2l0aG91dCBhIGRlZmF1bHQgdmFsdWUgYW5kIG5vdCBiZWluZyBvbmUgb2Ygb3VyIHN1cHBvcnRlZFxuXHRcdFx0XHRcdC8vIHZhcmlhYmxlcyBpcyBhdXRvbWF0aWNhbGx5IHR1cm5lZCBpbnRvIGEgcGxhY2Vob2xkZXIuIFRoaXMgaXMgdG8gcmVzdG9yZVxuXHRcdFx0XHRcdC8vIGEgYnVnIHdlIGhhZCBiZWZvcmUuIFNvIGAke2Zvb31gIGJlY29tZXMgYCR7Tjpmb299YFxuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gcGxhY2Vob2xkZXJzLmhhcyhtYXJrZXIubmFtZSkgPyBwbGFjZWhvbGRlcnMuZ2V0KG1hcmtlci5uYW1lKSEgOiArK3BsYWNlaG9sZGVyTWF4O1xuXHRcdFx0XHRcdHBsYWNlaG9sZGVycy5zZXQobWFya2VyLm5hbWUsIGluZGV4KTtcblxuXHRcdFx0XHRcdGNvbnN0IHN5bnRoZXRpYyA9IG5ldyBQbGFjZWhvbGRlcihpbmRleCkuYXBwZW5kQ2hpbGQobmV3IFRleHQobWFya2VyLm5hbWUpKTtcblx0XHRcdFx0XHR0ZXh0bWF0ZVNuaXBwZXQucmVwbGFjZShtYXJrZXIsIFtzeW50aGV0aWNdKTtcblx0XHRcdFx0XHR0aGlzLmlzQm9nb3VzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN3aXRjaCAobWFya2VyLm5hbWUpIHtcblx0XHRcdFx0XHRjYXNlICdDTElQQk9BUkQnOlxuXHRcdFx0XHRcdFx0dGhpcy51c2VzQ2xpcGJvYXJkVmFyaWFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnU0VMRUNUSU9OJzpcblx0XHRcdFx0XHRjYXNlICdUTV9TRUxFQ1RFRF9URVhUJzpcblx0XHRcdFx0XHRcdHRoaXMudXNlc1NlbGVjdGlvblZhcmlhYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHJlY3Vyc2Vcblx0XHRcdFx0c3RhY2sucHVzaCguLi5tYXJrZXIuY2hpbGRyZW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzQm9nb3VzKSB7XG5cdFx0XHR0aGlzLmNvZGVTbmlwcGV0ID0gdGV4dG1hdGVTbmlwcGV0LnRvVGV4dG1hdGVTdHJpbmcoKTtcblx0XHR9XG5cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYm9keUluc2lnaHRzOiBXaW5kb3dJZGxlVmFsdWU8U25pcHBldEJvZHlJbnNpZ2h0cz47XG5cblx0cmVhZG9ubHkgcHJlZml4TG93OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaXNGaWxlVGVtcGxhdGU6IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgc2NvcGVzOiBzdHJpbmdbXSxcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgcHJlZml4OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRyZWFkb25seSBib2R5OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgc291cmNlOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgc25pcHBldFNvdXJjZTogU25pcHBldFNvdXJjZSxcblx0XHRyZWFkb25seSBzbmlwcGV0SWRlbnRpZmllcjogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGluY2x1ZGU/OiBzdHJpbmdbXSxcblx0XHRyZWFkb25seSBleGNsdWRlPzogc3RyaW5nW10sXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ/OiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHQpIHtcblx0XHR0aGlzLnByZWZpeExvdyA9IHByZWZpeC50b0xvd2VyQ2FzZSgpO1xuXHRcdHRoaXMuX2JvZHlJbnNpZ2h0cyA9IG5ldyBXaW5kb3dJZGxlVmFsdWUoZ2V0QWN0aXZlV2luZG93KCksICgpID0+IG5ldyBTbmlwcGV0Qm9keUluc2lnaHRzKHRoaXMuYm9keSkpO1xuXHR9XG5cblx0Z2V0IGNvZGVTbmlwcGV0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2JvZHlJbnNpZ2h0cy52YWx1ZS5jb2RlU25pcHBldDtcblx0fVxuXG5cdGdldCBpc0JvZ291cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYm9keUluc2lnaHRzLnZhbHVlLmlzQm9nb3VzO1xuXHR9XG5cblx0Z2V0IGlzVHJpdmlhbCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYm9keUluc2lnaHRzLnZhbHVlLmlzVHJpdmlhbDtcblx0fVxuXG5cdGdldCBuZWVkc0NsaXBib2FyZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYm9keUluc2lnaHRzLnZhbHVlLnVzZXNDbGlwYm9hcmRWYXJpYWJsZTtcblx0fVxuXG5cdGdldCB1c2VzU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ib2R5SW5zaWdodHMudmFsdWUudXNlc1NlbGVjdGlvblZhcmlhYmxlO1xuXHR9XG5cblx0aXNGaWxlSW5jbHVkZWQocmVzb3VyY2VVcmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHVyaVBhdGggPSByZXNvdXJjZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHJlc291cmNlVXJpLmZzUGF0aCA6IHJlc291cmNlVXJpLnBhdGg7XG5cdFx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZSh1cmlQYXRoKTtcblxuXHRcdGNvbnN0IGdldE1hdGNoVGFyZ2V0ID0gKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRyZXR1cm4gcGF0dGVybi5pbmNsdWRlcygnLycpID8gdXJpUGF0aCA6IGZpbGVOYW1lO1xuXHRcdH07XG5cblx0XHRpZiAodGhpcy5leGNsdWRlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgdGhpcy5leGNsdWRlLmZpbHRlcihCb29sZWFuKSkge1xuXHRcdFx0XHRpZiAobWF0Y2hHbG9iKHBhdHRlcm4sIGdldE1hdGNoVGFyZ2V0KHBhdHRlcm4pLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbmNsdWRlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgdGhpcy5pbmNsdWRlLmZpbHRlcihCb29sZWFuKSkge1xuXHRcdFx0XHRpZiAobWF0Y2hHbG9iKHBhdHRlcm4sIGdldE1hdGNoVGFyZ2V0KHBhdHRlcm4pLCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cblxuaW50ZXJmYWNlIEpzb25TZXJpYWxpemVkU25pcHBldCB7XG5cdGlzRmlsZVRlbXBsYXRlPzogYm9vbGVhbjtcblx0Ym9keTogc3RyaW5nIHwgc3RyaW5nW107XG5cdHNjb3BlPzogc3RyaW5nO1xuXHRwcmVmaXg6IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRpbmNsdWRlPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdGV4Y2x1ZGU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gaXNKc29uU2VyaWFsaXplZFNuaXBwZXQodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBKc29uU2VyaWFsaXplZFNuaXBwZXQge1xuXHRyZXR1cm4gaXNPYmplY3QodGhpbmcpICYmIEJvb2xlYW4oKDxKc29uU2VyaWFsaXplZFNuaXBwZXQ+dGhpbmcpLmJvZHkpO1xufVxuXG5pbnRlcmZhY2UgSnNvblNlcmlhbGl6ZWRTbmlwcGV0cyB7XG5cdFtuYW1lOiBzdHJpbmddOiBKc29uU2VyaWFsaXplZFNuaXBwZXQgfCB7IFtuYW1lOiBzdHJpbmddOiBKc29uU2VyaWFsaXplZFNuaXBwZXQgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU25pcHBldFNvdXJjZSB7XG5cdFVzZXIgPSAxLFxuXHRXb3Jrc3BhY2UgPSAyLFxuXHRFeHRlbnNpb24gPSAzLFxufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldEZpbGUge1xuXG5cdHJlYWRvbmx5IGRhdGE6IFNuaXBwZXRbXSA9IFtdO1xuXHRyZWFkb25seSBpc0dsb2JhbFNuaXBwZXRzOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1VzZXJTbmlwcGV0czogYm9vbGVhbjtcblxuXHRwcml2YXRlIF9sb2FkUHJvbWlzZT86IFByb21pc2U8dGhpcz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc291cmNlOiBTbmlwcGV0U291cmNlLFxuXHRcdHJlYWRvbmx5IGxvY2F0aW9uOiBVUkksXG5cdFx0cHVibGljIGRlZmF1bHRTY29wZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmlzR2xvYmFsU25pcHBldHMgPSBleHRuYW1lKGxvY2F0aW9uLnBhdGgpID09PSAnLmNvZGUtc25pcHBldHMnO1xuXHRcdHRoaXMuaXNVc2VyU25pcHBldHMgPSAhdGhpcy5fZXh0ZW5zaW9uO1xuXHR9XG5cblx0c2VsZWN0KHNlbGVjdG9yOiBzdHJpbmcsIGJ1Y2tldDogU25pcHBldFtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNHbG9iYWxTbmlwcGV0cyB8fCAhdGhpcy5pc1VzZXJTbmlwcGV0cykge1xuXHRcdFx0dGhpcy5fc2NvcGVTZWxlY3Qoc2VsZWN0b3IsIGJ1Y2tldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2ZpbGVwYXRoU2VsZWN0KHNlbGVjdG9yLCBidWNrZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbGVwYXRoU2VsZWN0KHNlbGVjdG9yOiBzdHJpbmcsIGJ1Y2tldDogU25pcHBldFtdKTogdm9pZCB7XG5cdFx0Ly8gZm9yIGBmb29MYW5nLmpzb25gIGZpbGVzIGFwcGx5IGluY2x1c2lvbi9leGNsdXNpb24gcnVsZXMgb25seVxuXHRcdGlmIChzZWxlY3RvciArICcuanNvbicgPT09IGJhc2VuYW1lKHRoaXMubG9jYXRpb24ucGF0aCkpIHtcblx0XHRcdGJ1Y2tldC5wdXNoKC4uLnRoaXMuZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NvcGVTZWxlY3Qoc2VsZWN0b3I6IHN0cmluZywgYnVja2V0OiBTbmlwcGV0W10pOiB2b2lkIHtcblx0XHQvLyBmb3IgYG15LmNvZGUtc25pcHBldHNgIGZpbGVzIHdlIG5lZWQgdG8gbG9vayBhdCBlYWNoIHNuaXBwZXRcblx0XHRmb3IgKGNvbnN0IHNuaXBwZXQgb2YgdGhpcy5kYXRhKSB7XG5cdFx0XHRjb25zdCBsZW4gPSBzbmlwcGV0LnNjb3Blcy5sZW5ndGg7XG5cdFx0XHRpZiAobGVuID09PSAwKSB7XG5cdFx0XHRcdC8vIGFsd2F5cyBhY2NlcHRcblx0XHRcdFx0YnVja2V0LnB1c2goc25pcHBldCk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHQvLyBtYXRjaFxuXHRcdFx0XHRcdGlmIChzbmlwcGV0LnNjb3Blc1tpXSA9PT0gc2VsZWN0b3IpIHtcblx0XHRcdFx0XHRcdGJ1Y2tldC5wdXNoKHNuaXBwZXQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7IC8vIG1hdGNoIG9ubHkgb25jZSFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpZHggPSBzZWxlY3Rvci5sYXN0SW5kZXhPZignLicpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0dGhpcy5fc2NvcGVTZWxlY3Qoc2VsZWN0b3Iuc3Vic3RyaW5nKDAsIGlkeCksIGJ1Y2tldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHRoaXMubG9jYXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5sb2NhdGlvbik7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0fVxuXG5cdGxvYWQoKTogUHJvbWlzZTx0aGlzPiB7XG5cdFx0aWYgKCF0aGlzLl9sb2FkUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fbG9hZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUodGhpcy5fbG9hZCgpKS50aGVuKGNvbnRlbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gPEpzb25TZXJpYWxpemVkU25pcHBldHM+anNvblBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0XHRpZiAoZ2V0Tm9kZVR5cGUoZGF0YSkgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgc2NvcGVPclRlbXBsYXRlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuXHRcdFx0XHRcdFx0aWYgKGlzSnNvblNlcmlhbGl6ZWRTbmlwcGV0KHNjb3BlT3JUZW1wbGF0ZSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcGFyc2VTbmlwcGV0KG5hbWUsIHNjb3BlT3JUZW1wbGF0ZSwgdGhpcy5kYXRhKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgW25hbWUsIHRlbXBsYXRlXSBvZiBPYmplY3QuZW50cmllcyhzY29wZU9yVGVtcGxhdGUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fcGFyc2VTbmlwcGV0KG5hbWUsIHRlbXBsYXRlLCB0aGlzLmRhdGEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sb2FkUHJvbWlzZTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvYWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGF0YS5sZW5ndGggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VTbmlwcGV0KG5hbWU6IHN0cmluZywgc25pcHBldDogSnNvblNlcmlhbGl6ZWRTbmlwcGV0LCBidWNrZXQ6IFNuaXBwZXRbXSk6IHZvaWQge1xuXG5cdFx0bGV0IHsgaXNGaWxlVGVtcGxhdGUsIHByZWZpeCwgYm9keSwgZGVzY3JpcHRpb24gfSA9IHNuaXBwZXQ7XG5cblx0XHRpZiAoIXByZWZpeCkge1xuXHRcdFx0cHJlZml4ID0gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoYm9keSkpIHtcblx0XHRcdGJvZHkgPSBib2R5LmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGJvZHkgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZGVzY3JpcHRpb24pKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uLmpvaW4oJ1xcbicpO1xuXHRcdH1cblxuXHRcdGxldCBzY29wZXM6IHN0cmluZ1tdO1xuXHRcdGlmICh0aGlzLmRlZmF1bHRTY29wZXMpIHtcblx0XHRcdHNjb3BlcyA9IHRoaXMuZGVmYXVsdFNjb3Blcztcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzbmlwcGV0LnNjb3BlID09PSAnc3RyaW5nJykge1xuXHRcdFx0c2NvcGVzID0gc25pcHBldC5zY29wZS5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNjb3BlcyA9IFtdO1xuXHRcdH1cblxuXHRcdGxldCBpbmNsdWRlOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc25pcHBldC5pbmNsdWRlKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0LmluY2x1ZGUpKSB7XG5cdFx0XHRcdGluY2x1ZGUgPSBzbmlwcGV0LmluY2x1ZGU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzbmlwcGV0LmluY2x1ZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGluY2x1ZGUgPSBbc25pcHBldC5pbmNsdWRlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZXhjbHVkZTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHNuaXBwZXQuZXhjbHVkZSkge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc25pcHBldC5leGNsdWRlKSkge1xuXHRcdFx0XHRleGNsdWRlID0gc25pcHBldC5leGNsdWRlO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygc25pcHBldC5leGNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRleGNsdWRlID0gW3NuaXBwZXQuZXhjbHVkZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHNvdXJjZTogc3RyaW5nO1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb24pIHtcblx0XHRcdC8vIGV4dGVuc2lvbiBzbmlwcGV0IC0+IHNob3cgdGhlIG5hbWUgb2YgdGhlIGV4dGVuc2lvblxuXHRcdFx0c291cmNlID0gdGhpcy5fZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuX2V4dGVuc2lvbi5uYW1lO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLnNvdXJjZSA9PT0gU25pcHBldFNvdXJjZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdC8vIHdvcmtzcGFjZSAtPiBvbmx5ICouY29kZS1zbmlwcGV0cyBmaWxlc1xuXHRcdFx0c291cmNlID0gbG9jYWxpemUoJ3NvdXJjZS53b3Jrc3BhY2VTbmlwcGV0R2xvYmFsJywgXCJXb3Jrc3BhY2UgU25pcHBldFwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdXNlciAtPiBnbG9iYWwgKCouY29kZS1zbmlwcGV0cykgYW5kIGxhbmd1YWdlIHNuaXBwZXRzXG5cdFx0XHRpZiAodGhpcy5pc0dsb2JhbFNuaXBwZXRzKSB7XG5cdFx0XHRcdHNvdXJjZSA9IGxvY2FsaXplKCdzb3VyY2UudXNlclNuaXBwZXRHbG9iYWwnLCBcIkdsb2JhbCBVc2VyIFNuaXBwZXRcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzb3VyY2UgPSBsb2NhbGl6ZSgnc291cmNlLnVzZXJTbmlwcGV0JywgXCJVc2VyIFNuaXBwZXRcIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBfcHJlZml4IG9mIEl0ZXJhYmxlLndyYXAocHJlZml4KSkge1xuXHRcdFx0YnVja2V0LnB1c2gobmV3IFNuaXBwZXQoXG5cdFx0XHRcdEJvb2xlYW4oaXNGaWxlVGVtcGxhdGUpLFxuXHRcdFx0XHRzY29wZXMsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdF9wcmVmaXgsXG5cdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRib2R5LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHRoaXMuc291cmNlLFxuXHRcdFx0XHR0aGlzLl9leHRlbnNpb24gPyBgJHtyZWxhdGl2ZVBhdGgodGhpcy5fZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uLCB0aGlzLmxvY2F0aW9uKX0vJHtuYW1lfWAgOiBgJHtiYXNlbmFtZSh0aGlzLmxvY2F0aW9uLnBhdGgpfS8ke25hbWV9YCxcblx0XHRcdFx0aW5jbHVkZSxcblx0XHRcdFx0ZXhjbHVkZSxcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uPy5pZGVudGlmaWVyLFxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsV0FBVyxtQkFBbUI7QUFDaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLGVBQWUsVUFBVSxhQUFhLFlBQVk7QUFDM0QsU0FBUyxpQ0FBaUM7QUFLMUMsU0FBUyxvQkFB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QUFVO0FBQzdDLGVBQVMsUUFBUSxNQUFNLE1BQU0sR0FBRyxFQUFFLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3BFLE9BQU87QUFDTixlQUFTLENBQUM7QUFBQSxJQUNYO0FBRUEsUUFBSTtBQUNKLFFBQUksUUFBUSxTQUFTO0FBQ3BCLFVBQUksTUFBTSxRQUFRLFFBQVEsT0FBTyxHQUFHO0FBQ25DLGtCQUFVLFFBQVE7QUFBQSxNQUNuQixXQUFXLE9BQU8sUUFBUSxZQUFZLFVBQVU7QUFDL0Msa0JBQVUsQ0FBQyxRQUFRLE9BQU87QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0osUUFBSSxRQUFRLFNBQVM7QUFDcEIsVUFBSSxNQUFNLFFBQVEsUUFBUSxPQUFPLEdBQUc7QUFDbkMsa0JBQVUsUUFBUTtBQUFBLE1BQ25CLFdBQVcsT0FBTyxRQUFRLFlBQVksVUFBVTtBQUMvQyxrQkFBVSxDQUFDLFFBQVEsT0FBTztBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixRQUFJLEtBQUssWUFBWTtBQUVwQixlQUFTLEtBQUssV0FBVyxlQUFlLEtBQUssV0FBVztBQUFBLElBRXpELFdBQVcsS0FBSyxXQUFXLG1CQUF5QjtBQUVuRCxlQUFTLFNBQVMsaUNBQWlDLG1CQUFtQjtBQUFBLElBQ3ZFLE9BQU87QUFFTixVQUFJLEtBQUssa0JBQWtCO0FBQzFCLGlCQUFTLFNBQVMsNEJBQTRCLHFCQUFxQjtBQUFBLE1BQ3BFLE9BQU87QUFDTixpQkFBUyxTQUFTLHNCQUFzQixjQUFjO0FBQUEsTUFDdkQ7QUFBQSxJQUNEO0FBRUEsZUFBVyxXQUFXLFNBQVMsS0FBSyxNQUFNLEdBQUc7QUFDNUMsYUFBTyxLQUFLLElBQUk7QUFBQSxRQUNmLFFBQVEsY0FBYztBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLEtBQUssYUFBYSxHQUFHLGFBQWEsS0FBSyxXQUFXLG1CQUFtQixLQUFLLFFBQVEsQ0FBQyxJQUFJLElBQUksS0FBSyxHQUFHLFNBQVMsS0FBSyxTQUFTLElBQUksQ0FBQyxJQUFJLElBQUk7QUFBQSxRQUN2STtBQUFBLFFBQ0E7QUFBQSxRQUNBLEtBQUssWUFBWTtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJTbmlwcGV0U291cmNlIiwgIm5hbWUiXQp9Cg==
