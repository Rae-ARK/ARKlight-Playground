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
import { Emitter, DebounceEmitter } from "../../../../base/common/event.js";
import { IDecorationsService } from "../common/decorations.js";
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isThenable } from "../../../../base/common/async.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { createStyleSheet, createCSSRule, removeCSSRulesContainingSelector } from "../../../../base/browser/domStylesheets.js";
import * as cssValue from "../../../../base/browser/cssValue.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { hash } from "../../../../base/common/hash.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { asArray, distinct } from "../../../../base/common/arrays.js";
import { asCssVariable, asCssVariableWithDefault } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
const _DecorationRule = class _DecorationRule {
  constructor(themeService, data, key) {
    this.themeService = themeService;
    this._refCounter = 0;
    this.data = data;
    const suffix = hash(key).toString(36);
    this.itemColorClassName = `${_DecorationRule._classNamesPrefix}-itemColor-${suffix}`;
    this.itemBadgeClassName = `${_DecorationRule._classNamesPrefix}-itemBadge-${suffix}`;
    this.bubbleBadgeClassName = `${_DecorationRule._classNamesPrefix}-bubbleBadge-${suffix}`;
    this.iconBadgeClassName = `${_DecorationRule._classNamesPrefix}-iconBadge-${suffix}`;
  }
  static keyOf(data) {
    if (Array.isArray(data)) {
      return data.map(_DecorationRule.keyOf).join(",");
    } else {
      const { color, letter } = data;
      if (ThemeIcon.isThemeIcon(letter)) {
        return `${color}+${letter.id}`;
      } else {
        return `${color}/${letter}`;
      }
    }
  }
  acquire() {
    this._refCounter += 1;
  }
  release() {
    return --this._refCounter === 0;
  }
  appendCSSRules(element) {
    if (!Array.isArray(this.data)) {
      this._appendForOne(this.data, element);
    } else {
      this._appendForMany(this.data, element);
    }
  }
  _appendForOne(data, element) {
    const { color, letter } = data;
    createCSSRule(`.${this.itemColorClassName}`, `color: ${getColor(color)};`, element);
    if (ThemeIcon.isThemeIcon(letter)) {
      this._createIconCSSRule(letter, getColor(color), element);
    } else if (letter) {
      createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letter}"; color: ${getColor(color)};`, element);
    }
  }
  _appendForMany(data, element) {
    const color = data.reduceRight((fallback, decoration) => decoration.color ? asCssVariableWithDefault(decoration.color, fallback) : fallback, "inherit");
    createCSSRule(`.${this.itemColorClassName}`, `color: ${color};`, element);
    const letters = [];
    let icon;
    for (const d of data) {
      if (ThemeIcon.isThemeIcon(d.letter)) {
        icon = d.letter;
        break;
      } else if (d.letter) {
        letters.push(d.letter);
      }
    }
    if (icon) {
      this._createIconCSSRule(icon, color, element);
    } else {
      if (letters.length) {
        createCSSRule(`.${this.itemBadgeClassName}::after`, `content: "${letters.join(", ")}"; color: ${color};`, element);
      }
      createCSSRule(
        `.${this.bubbleBadgeClassName}::after`,
        `content: "\uEA71"; color: ${color}; font-family: codicon; font-size: 14px; margin-right: 14px; opacity: 0.4;`,
        element
      );
    }
  }
  _createIconCSSRule(icon, color, element) {
    const modifier = ThemeIcon.getModifier(icon);
    if (modifier) {
      icon = ThemeIcon.modify(icon, void 0);
    }
    const iconContribution = getIconRegistry().getIcon(icon.id);
    if (!iconContribution) {
      return;
    }
    const definition = this.themeService.getProductIconTheme().getIcon(iconContribution);
    if (!definition) {
      return;
    }
    createCSSRule(
      `.${this.iconBadgeClassName}::after`,
      `content: '${definition.fontCharacter}';
			color: ${icon.color ? getColor(icon.color.id) : color};
			font-family: ${cssValue.stringValue(definition.font?.id ?? "codicon")};
			font-size: 16px;
			margin-right: 14px;
			font-weight: normal;
			${modifier === "spin" ? "animation: codicon-spin 1.5s steps(30) infinite; font-style: normal !important; transform-origin: center center;" : ""};
			`,
      element
    );
  }
  removeCSSRules(element) {
    removeCSSRulesContainingSelector(this.itemColorClassName, element);
    removeCSSRulesContainingSelector(this.itemBadgeClassName, element);
    removeCSSRulesContainingSelector(this.bubbleBadgeClassName, element);
    removeCSSRulesContainingSelector(this.iconBadgeClassName, element);
  }
};
_DecorationRule._classNamesPrefix = "monaco-decoration";
let DecorationRule = _DecorationRule;
class DecorationStyles {
  constructor(_themeService) {
    this._themeService = _themeService;
    this._dispoables = new DisposableStore();
    this._styleElement = createStyleSheet(void 0, void 0, this._dispoables);
    this._decorationRules = /* @__PURE__ */ new Map();
  }
  dispose() {
    this._dispoables.dispose();
  }
  asDecoration(data, onlyChildren) {
    data.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const key = DecorationRule.keyOf(data);
    let rule = this._decorationRules.get(key);
    if (!rule) {
      rule = new DecorationRule(this._themeService, data, key);
      this._decorationRules.set(key, rule);
      rule.appendCSSRules(this._styleElement);
    }
    rule.acquire();
    const labelClassName = rule.itemColorClassName;
    let badgeClassName = rule.itemBadgeClassName;
    const iconClassName = rule.iconBadgeClassName;
    let tooltip = distinct(data.filter((d) => !isFalsyOrWhitespace(d.tooltip)).map((d) => d.tooltip)).join(" \u2022 ");
    const strikethrough = data.some((d) => d.strikethrough);
    if (onlyChildren) {
      badgeClassName = rule.bubbleBadgeClassName;
      tooltip = localize("bubbleTitle", "Contains emphasized items");
    }
    return {
      labelClassName,
      badgeClassName,
      iconClassName,
      strikethrough,
      tooltip,
      dispose: () => {
        if (rule?.release()) {
          this._decorationRules.delete(key);
          rule.removeCSSRules(this._styleElement);
          rule = void 0;
        }
      }
    };
  }
}
class FileDecorationChangeEvent {
  // events ignore all path casings
  constructor(all) {
    this._data = TernarySearchTree.forUris((_uri) => true);
    this._data.fill(true, asArray(all));
  }
  affectsResource(uri) {
    return this._data.hasElementOrSubtree(uri);
  }
}
class DecorationDataRequest {
  constructor(source, thenable) {
    this.source = source;
    this.thenable = thenable;
  }
}
function getColor(color) {
  return color ? asCssVariable(color) : "inherit";
}
let DecorationsService = class {
  constructor(uriIdentityService, themeService) {
    this._store = new DisposableStore();
    this._onDidChangeDecorationsDelayed = this._store.add(new DebounceEmitter({ merge: (all) => all.flat() }));
    this._onDidChangeDecorations = this._store.add(new Emitter());
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._provider = new LinkedList();
    this._decorationStyles = this._store.add(new DecorationStyles(themeService));
    this._data = TernarySearchTree.forUris((key) => uriIdentityService.extUri.ignorePathCasing(key));
    this._store.add(this._onDidChangeDecorationsDelayed.event((event) => {
      this._onDidChangeDecorations.fire(new FileDecorationChangeEvent(event));
    }));
  }
  dispose() {
    this._store.dispose();
    this._data.clear();
  }
  registerDecorationsProvider(provider) {
    const rm = this._provider.unshift(provider);
    this._onDidChangeDecorations.fire({
      // everything might have changed
      affectsResource() {
        return true;
      }
    });
    const removeAll = () => {
      const uris = [];
      for (const [uri, map] of this._data) {
        if (map.delete(provider)) {
          uris.push(uri);
        }
      }
      if (uris.length > 0) {
        this._onDidChangeDecorationsDelayed.fire(uris);
      }
    };
    const listener = provider.onDidChange((uris) => {
      if (!uris) {
        removeAll();
      } else {
        for (const uri of uris) {
          const map = this._ensureEntry(uri);
          this._fetchData(map, uri, provider);
        }
      }
    });
    return toDisposable(() => {
      rm();
      listener.dispose();
      removeAll();
    });
  }
  _ensureEntry(uri) {
    let map = this._data.get(uri);
    if (!map) {
      map = /* @__PURE__ */ new Map();
      this._data.set(uri, map);
    }
    return map;
  }
  getDecoration(uri, includeChildren) {
    const all = [];
    let containsChildren = false;
    const map = this._ensureEntry(uri);
    for (const provider of this._provider) {
      let data = map.get(provider);
      if (data === void 0) {
        data = this._fetchData(map, uri, provider);
      }
      if (data && !(data instanceof DecorationDataRequest)) {
        all.push(data);
      }
    }
    if (includeChildren) {
      const iter = this._data.findSuperstr(uri);
      if (iter) {
        for (const tuple of iter) {
          for (const data of tuple[1].values()) {
            if (data && !(data instanceof DecorationDataRequest)) {
              if (data.bubble) {
                all.push(data);
                containsChildren = true;
              }
            }
          }
        }
      }
    }
    return all.length === 0 ? void 0 : this._decorationStyles.asDecoration(all, containsChildren);
  }
  _fetchData(map, uri, provider) {
    const pendingRequest = map.get(provider);
    if (pendingRequest instanceof DecorationDataRequest) {
      pendingRequest.source.cancel();
      map.delete(provider);
    }
    const cts = new CancellationTokenSource();
    const dataOrThenable = provider.provideDecorations(uri, cts.token);
    if (!isThenable(dataOrThenable)) {
      cts.dispose();
      return this._keepItem(map, provider, uri, dataOrThenable);
    } else {
      const request = new DecorationDataRequest(cts, Promise.resolve(dataOrThenable).then((data) => {
        if (map.get(provider) === request) {
          this._keepItem(map, provider, uri, data);
        }
      }).catch((err) => {
        if (!isCancellationError(err) && map.get(provider) === request) {
          map.delete(provider);
        }
      }).finally(() => {
        cts.dispose();
      }));
      map.set(provider, request);
      return null;
    }
  }
  _keepItem(map, provider, uri, data) {
    const deco = data ? data : null;
    const old = map.get(provider);
    map.set(provider, deco);
    if (deco || old) {
      this._onDidChangeDecorationsDelayed.fire(uri);
    }
    return deco;
  }
};
DecorationsService = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, IThemeService)
], DecorationsService);
registerSingleton(IDecorationsService, DecorationsService, InstantiationType.Delayed);
export {
  DecorationsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9icm93c2VyL2RlY29yYXRpb25zU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBEZWJvdW5jZUVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zU2VydmljZSwgSURlY29yYXRpb24sIElSZXNvdXJjZURlY29yYXRpb25DaGFuZ2VFdmVudCwgSURlY29yYXRpb25zUHJvdmlkZXIsIElEZWNvcmF0aW9uRGF0YSB9IGZyb20gJy4uL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1RoZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCwgY3JlYXRlQ1NTUnVsZSwgcmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0ICogYXMgY3NzVmFsdWUgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBhc0FycmF5LCBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBhc0Nzc1ZhcmlhYmxlV2l0aERlZmF1bHQsIENvbG9ySWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldEljb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuXG5jbGFzcyBEZWNvcmF0aW9uUnVsZSB7XG5cblx0c3RhdGljIGtleU9mKGRhdGE6IElEZWNvcmF0aW9uRGF0YSB8IElEZWNvcmF0aW9uRGF0YVtdKTogc3RyaW5nIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdFx0cmV0dXJuIGRhdGEubWFwKERlY29yYXRpb25SdWxlLmtleU9mKS5qb2luKCcsJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHsgY29sb3IsIGxldHRlciB9ID0gZGF0YTtcblx0XHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24obGV0dGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gYCR7Y29sb3J9KyR7bGV0dGVyLmlkfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYCR7Y29sb3J9LyR7bGV0dGVyfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2NsYXNzTmFtZXNQcmVmaXggPSAnbW9uYWNvLWRlY29yYXRpb24nO1xuXG5cdHJlYWRvbmx5IGRhdGE6IElEZWNvcmF0aW9uRGF0YSB8IElEZWNvcmF0aW9uRGF0YVtdO1xuXHRyZWFkb25seSBpdGVtQ29sb3JDbGFzc05hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaXRlbUJhZGdlQ2xhc3NOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb25CYWRnZUNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBidWJibGVCYWRnZUNsYXNzTmFtZTogc3RyaW5nO1xuXG5cdHByaXZhdGUgX3JlZkNvdW50ZXI6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLCBkYXRhOiBJRGVjb3JhdGlvbkRhdGEgfCBJRGVjb3JhdGlvbkRhdGFbXSwga2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdGNvbnN0IHN1ZmZpeCA9IGhhc2goa2V5KS50b1N0cmluZygzNik7XG5cdFx0dGhpcy5pdGVtQ29sb3JDbGFzc05hbWUgPSBgJHtEZWNvcmF0aW9uUnVsZS5fY2xhc3NOYW1lc1ByZWZpeH0taXRlbUNvbG9yLSR7c3VmZml4fWA7XG5cdFx0dGhpcy5pdGVtQmFkZ2VDbGFzc05hbWUgPSBgJHtEZWNvcmF0aW9uUnVsZS5fY2xhc3NOYW1lc1ByZWZpeH0taXRlbUJhZGdlLSR7c3VmZml4fWA7XG5cdFx0dGhpcy5idWJibGVCYWRnZUNsYXNzTmFtZSA9IGAke0RlY29yYXRpb25SdWxlLl9jbGFzc05hbWVzUHJlZml4fS1idWJibGVCYWRnZS0ke3N1ZmZpeH1gO1xuXHRcdHRoaXMuaWNvbkJhZGdlQ2xhc3NOYW1lID0gYCR7RGVjb3JhdGlvblJ1bGUuX2NsYXNzTmFtZXNQcmVmaXh9LWljb25CYWRnZS0ke3N1ZmZpeH1gO1xuXHR9XG5cblx0YWNxdWlyZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZDb3VudGVyICs9IDE7XG5cdH1cblxuXHRyZWxlYXNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAtLXRoaXMuX3JlZkNvdW50ZXIgPT09IDA7XG5cdH1cblxuXHRhcHBlbmRDU1NSdWxlcyhlbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHRoaXMuZGF0YSkpIHtcblx0XHRcdHRoaXMuX2FwcGVuZEZvck9uZSh0aGlzLmRhdGEsIGVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hcHBlbmRGb3JNYW55KHRoaXMuZGF0YSwgZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kRm9yT25lKGRhdGE6IElEZWNvcmF0aW9uRGF0YSwgZWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29sb3IsIGxldHRlciB9ID0gZGF0YTtcblx0XHQvLyBsYWJlbFxuXHRcdGNyZWF0ZUNTU1J1bGUoYC4ke3RoaXMuaXRlbUNvbG9yQ2xhc3NOYW1lfWAsIGBjb2xvcjogJHtnZXRDb2xvcihjb2xvcil9O2AsIGVsZW1lbnQpO1xuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24obGV0dGVyKSkge1xuXHRcdFx0dGhpcy5fY3JlYXRlSWNvbkNTU1J1bGUobGV0dGVyLCBnZXRDb2xvcihjb2xvciksIGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAobGV0dGVyKSB7XG5cdFx0XHRjcmVhdGVDU1NSdWxlKGAuJHt0aGlzLml0ZW1CYWRnZUNsYXNzTmFtZX06OmFmdGVyYCwgYGNvbnRlbnQ6IFwiJHtsZXR0ZXJ9XCI7IGNvbG9yOiAke2dldENvbG9yKGNvbG9yKX07YCwgZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kRm9yTWFueShkYXRhOiBJRGVjb3JhdGlvbkRhdGFbXSwgZWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIGxhYmVsXG5cdFx0Y29uc3QgY29sb3IgPSBkYXRhLnJlZHVjZVJpZ2h0KChmYWxsYmFjaywgZGVjb3JhdGlvbikgPT4gZGVjb3JhdGlvbi5jb2xvciA/IGFzQ3NzVmFyaWFibGVXaXRoRGVmYXVsdChkZWNvcmF0aW9uLmNvbG9yLCBmYWxsYmFjaykgOiBmYWxsYmFjaywgJ2luaGVyaXQnKTtcblx0XHRjcmVhdGVDU1NSdWxlKGAuJHt0aGlzLml0ZW1Db2xvckNsYXNzTmFtZX1gLCBgY29sb3I6ICR7Y29sb3J9O2AsIGVsZW1lbnQpO1xuXG5cdFx0Ly8gYmFkZ2Ugb3IgaWNvblxuXHRcdGNvbnN0IGxldHRlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgZCBvZiBkYXRhKSB7XG5cdFx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGQubGV0dGVyKSkge1xuXHRcdFx0XHRpY29uID0gZC5sZXR0ZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChkLmxldHRlcikge1xuXHRcdFx0XHRsZXR0ZXJzLnB1c2goZC5sZXR0ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpY29uKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVJY29uQ1NTUnVsZShpY29uLCBjb2xvciwgZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChsZXR0ZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRjcmVhdGVDU1NSdWxlKGAuJHt0aGlzLml0ZW1CYWRnZUNsYXNzTmFtZX06OmFmdGVyYCwgYGNvbnRlbnQ6IFwiJHtsZXR0ZXJzLmpvaW4oJywgJyl9XCI7IGNvbG9yOiAke2NvbG9yfTtgLCBlbGVtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYnViYmxlIGJhZGdlXG5cdFx0XHQvLyBUT0RPIEBtaXNvbG9yaSB1cGRhdGUgYnViYmxlIGJhZGdlIHRvIGFkb3B0IGxldHRlcjogVGhlbWVJY29uIGluc3RlYWQgb2YgdW5pY29kZVxuXHRcdFx0Y3JlYXRlQ1NTUnVsZShcblx0XHRcdFx0YC4ke3RoaXMuYnViYmxlQmFkZ2VDbGFzc05hbWV9OjphZnRlcmAsXG5cdFx0XHRcdGBjb250ZW50OiBcIlxcdWVhNzFcIjsgY29sb3I6ICR7Y29sb3J9OyBmb250LWZhbWlseTogY29kaWNvbjsgZm9udC1zaXplOiAxNHB4OyBtYXJnaW4tcmlnaHQ6IDE0cHg7IG9wYWNpdHk6IDAuNDtgLFxuXHRcdFx0XHRlbGVtZW50XG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUljb25DU1NSdWxlKGljb246IFRoZW1lSWNvbiwgY29sb3I6IHN0cmluZywgZWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCkge1xuXG5cdFx0Y29uc3QgbW9kaWZpZXIgPSBUaGVtZUljb24uZ2V0TW9kaWZpZXIoaWNvbik7XG5cdFx0aWYgKG1vZGlmaWVyKSB7XG5cdFx0XHRpY29uID0gVGhlbWVJY29uLm1vZGlmeShpY29uLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRjb25zdCBpY29uQ29udHJpYnV0aW9uID0gZ2V0SWNvblJlZ2lzdHJ5KCkuZ2V0SWNvbihpY29uLmlkKTtcblx0XHRpZiAoIWljb25Db250cmlidXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVmaW5pdGlvbiA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldFByb2R1Y3RJY29uVGhlbWUoKS5nZXRJY29uKGljb25Db250cmlidXRpb24pO1xuXHRcdGlmICghZGVmaW5pdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjcmVhdGVDU1NSdWxlKFxuXHRcdFx0YC4ke3RoaXMuaWNvbkJhZGdlQ2xhc3NOYW1lfTo6YWZ0ZXJgLFxuXHRcdFx0YGNvbnRlbnQ6ICcke2RlZmluaXRpb24uZm9udENoYXJhY3Rlcn0nO1xuXHRcdFx0Y29sb3I6ICR7aWNvbi5jb2xvciA/IGdldENvbG9yKGljb24uY29sb3IuaWQpIDogY29sb3J9O1xuXHRcdFx0Zm9udC1mYW1pbHk6ICR7Y3NzVmFsdWUuc3RyaW5nVmFsdWUoZGVmaW5pdGlvbi5mb250Py5pZCA/PyAnY29kaWNvbicpfTtcblx0XHRcdGZvbnQtc2l6ZTogMTZweDtcblx0XHRcdG1hcmdpbi1yaWdodDogMTRweDtcblx0XHRcdGZvbnQtd2VpZ2h0OiBub3JtYWw7XG5cdFx0XHQke21vZGlmaWVyID09PSAnc3BpbicgPyAnYW5pbWF0aW9uOiBjb2RpY29uLXNwaW4gMS41cyBzdGVwcygzMCkgaW5maW5pdGU7IGZvbnQtc3R5bGU6IG5vcm1hbCAhaW1wb3J0YW50OyB0cmFuc2Zvcm0tb3JpZ2luOiBjZW50ZXIgY2VudGVyOycgOiAnJ307XG5cdFx0XHRgLFxuXHRcdFx0ZWxlbWVudFxuXHRcdCk7XG5cdH1cblxuXHRyZW1vdmVDU1NSdWxlcyhlbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50KTogdm9pZCB7XG5cdFx0cmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IodGhpcy5pdGVtQ29sb3JDbGFzc05hbWUsIGVsZW1lbnQpO1xuXHRcdHJlbW92ZUNTU1J1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHRoaXMuaXRlbUJhZGdlQ2xhc3NOYW1lLCBlbGVtZW50KTtcblx0XHRyZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLmJ1YmJsZUJhZGdlQ2xhc3NOYW1lLCBlbGVtZW50KTtcblx0XHRyZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLmljb25CYWRnZUNsYXNzTmFtZSwgZWxlbWVudCk7XG5cdH1cbn1cblxuY2xhc3MgRGVjb3JhdGlvblN0eWxlcyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9hYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3R5bGVFbGVtZW50ID0gY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fZGlzcG9hYmxlcyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25SdWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBEZWNvcmF0aW9uUnVsZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UpIHtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc0RlY29yYXRpb24oZGF0YTogSURlY29yYXRpb25EYXRhW10sIG9ubHlDaGlsZHJlbjogYm9vbGVhbik6IElEZWNvcmF0aW9uIHtcblxuXHRcdC8vIHNvcnQgYnkgd2VpZ2h0XG5cdFx0ZGF0YS5zb3J0KChhLCBiKSA9PiAoYi53ZWlnaHQgfHwgMCkgLSAoYS53ZWlnaHQgfHwgMCkpO1xuXG5cdFx0Y29uc3Qga2V5ID0gRGVjb3JhdGlvblJ1bGUua2V5T2YoZGF0YSk7XG5cdFx0bGV0IHJ1bGUgPSB0aGlzLl9kZWNvcmF0aW9uUnVsZXMuZ2V0KGtleSk7XG5cblx0XHRpZiAoIXJ1bGUpIHtcblx0XHRcdC8vIG5ldyBjc3MgcnVsZVxuXHRcdFx0cnVsZSA9IG5ldyBEZWNvcmF0aW9uUnVsZSh0aGlzLl90aGVtZVNlcnZpY2UsIGRhdGEsIGtleSk7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uUnVsZXMuc2V0KGtleSwgcnVsZSk7XG5cdFx0XHRydWxlLmFwcGVuZENTU1J1bGVzKHRoaXMuX3N0eWxlRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0cnVsZS5hY3F1aXJlKCk7XG5cblx0XHRjb25zdCBsYWJlbENsYXNzTmFtZSA9IHJ1bGUuaXRlbUNvbG9yQ2xhc3NOYW1lO1xuXHRcdGxldCBiYWRnZUNsYXNzTmFtZSA9IHJ1bGUuaXRlbUJhZGdlQ2xhc3NOYW1lO1xuXHRcdGNvbnN0IGljb25DbGFzc05hbWUgPSBydWxlLmljb25CYWRnZUNsYXNzTmFtZTtcblx0XHRsZXQgdG9vbHRpcCA9IGRpc3RpbmN0KGRhdGEuZmlsdGVyKGQgPT4gIWlzRmFsc3lPcldoaXRlc3BhY2UoZC50b29sdGlwKSkubWFwKGQgPT4gZC50b29sdGlwKSkuam9pbignIFx1MjAyMiAnKTtcblx0XHRjb25zdCBzdHJpa2V0aHJvdWdoID0gZGF0YS5zb21lKGQgPT4gZC5zdHJpa2V0aHJvdWdoKTtcblxuXHRcdGlmIChvbmx5Q2hpbGRyZW4pIHtcblx0XHRcdC8vIHNob3cgaXRlbXMgZnJvbSBpdHMgY2hpbGRyZW4gb25seVxuXHRcdFx0YmFkZ2VDbGFzc05hbWUgPSBydWxlLmJ1YmJsZUJhZGdlQ2xhc3NOYW1lO1xuXHRcdFx0dG9vbHRpcCA9IGxvY2FsaXplKCdidWJibGVUaXRsZScsIFwiQ29udGFpbnMgZW1waGFzaXplZCBpdGVtc1wiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWxDbGFzc05hbWUsXG5cdFx0XHRiYWRnZUNsYXNzTmFtZSxcblx0XHRcdGljb25DbGFzc05hbWUsXG5cdFx0XHRzdHJpa2V0aHJvdWdoLFxuXHRcdFx0dG9vbHRpcCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKHJ1bGU/LnJlbGVhc2UoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2RlY29yYXRpb25SdWxlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHRydWxlLnJlbW92ZUNTU1J1bGVzKHRoaXMuX3N0eWxlRWxlbWVudCk7XG5cdFx0XHRcdFx0cnVsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgRmlsZURlY29yYXRpb25DaGFuZ2VFdmVudCBpbXBsZW1lbnRzIElSZXNvdXJjZURlY29yYXRpb25DaGFuZ2VFdmVudCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8dHJ1ZT4oX3VyaSA9PiB0cnVlKTsgLy8gZXZlbnRzIGlnbm9yZSBhbGwgcGF0aCBjYXNpbmdzXG5cblx0Y29uc3RydWN0b3IoYWxsOiBVUkkgfCBVUklbXSkge1xuXHRcdHRoaXMuX2RhdGEuZmlsbCh0cnVlLCBhc0FycmF5KGFsbCkpO1xuXHR9XG5cblx0YWZmZWN0c1Jlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGEuaGFzRWxlbWVudE9yU3VidHJlZSh1cmkpO1xuXHR9XG59XG5cbmNsYXNzIERlY29yYXRpb25EYXRhUmVxdWVzdCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UsXG5cdFx0cmVhZG9ubHkgdGhlbmFibGU6IFByb21pc2U8dm9pZD4sXG5cdCkgeyB9XG59XG5cbmZ1bmN0aW9uIGdldENvbG9yKGNvbG9yOiBDb2xvcklkZW50aWZpZXIgfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIGNvbG9yID8gYXNDc3NWYXJpYWJsZShjb2xvcikgOiAnaW5oZXJpdCc7XG59XG5cbnR5cGUgRGVjb3JhdGlvbkVudHJ5ID0gTWFwPElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBEZWNvcmF0aW9uRGF0YVJlcXVlc3QgfCBJRGVjb3JhdGlvbkRhdGEgfCBudWxsPjtcblxuZXhwb3J0IGNsYXNzIERlY29yYXRpb25zU2VydmljZSBpbXBsZW1lbnRzIElEZWNvcmF0aW9uc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlY29yYXRpb25zRGVsYXllZCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGVib3VuY2VFbWl0dGVyPFVSSSB8IFVSSVtdPih7IG1lcmdlOiBhbGwgPT4gYWxsLmZsYXQoKSB9KSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50PigpKTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zOiBFdmVudDxJUmVzb3VyY2VEZWNvcmF0aW9uQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlciA9IG5ldyBMaW5rZWRMaXN0PElEZWNvcmF0aW9uc1Byb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uU3R5bGVzOiBEZWNvcmF0aW9uU3R5bGVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhOiBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIERlY29yYXRpb25FbnRyeT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblN0eWxlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGVjb3JhdGlvblN0eWxlcyh0aGVtZVNlcnZpY2UpKTtcblx0XHR0aGlzLl9kYXRhID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpcyhrZXkgPT4gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pZ25vcmVQYXRoQ2FzaW5nKGtleSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnNEZWxheWVkLmV2ZW50KGV2ZW50ID0+IHsgdGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKG5ldyBGaWxlRGVjb3JhdGlvbkNoYW5nZUV2ZW50KGV2ZW50KSk7IH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RhdGEuY2xlYXIoKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcjogSURlY29yYXRpb25zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgcm0gPSB0aGlzLl9wcm92aWRlci51bnNoaWZ0KHByb3ZpZGVyKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZmlyZSh7XG5cdFx0XHQvLyBldmVyeXRoaW5nIG1pZ2h0IGhhdmUgY2hhbmdlZFxuXHRcdFx0YWZmZWN0c1Jlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdH0pO1xuXG5cdFx0Ly8gcmVtb3ZlIGV2ZXJ5dGhpbmcgd2hhdCBjYW1lIGZyb20gdGhpcyBwcm92aWRlclxuXHRcdGNvbnN0IHJlbW92ZUFsbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaXM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFt1cmksIG1hcF0gb2YgdGhpcy5fZGF0YSkge1xuXHRcdFx0XHRpZiAobWFwLmRlbGV0ZShwcm92aWRlcikpIHtcblx0XHRcdFx0XHR1cmlzLnB1c2godXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHVyaXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zRGVsYXllZC5maXJlKHVyaXMpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVyaXMgPT4ge1xuXHRcdFx0aWYgKCF1cmlzKSB7XG5cdFx0XHRcdC8vIGZsdXNoIGV2ZW50IC0+IGRyb3AgYWxsIGRhdGEsIGNhbiBhZmZlY3QgZXZlcnl0aGluZ1xuXHRcdFx0XHRyZW1vdmVBbGwoKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gc2VsZWN0aXZlIGNoYW5nZXMgLT4gZHJvcCBmb3IgcmVzb3VyY2UsIGZldGNoIGFnYWluLCBzZW5kIGV2ZW50XG5cdFx0XHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdFx0XHRjb25zdCBtYXAgPSB0aGlzLl9lbnN1cmVFbnRyeSh1cmkpO1xuXHRcdFx0XHRcdHRoaXMuX2ZldGNoRGF0YShtYXAsIHVyaSwgcHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHJtKCk7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRyZW1vdmVBbGwoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUVudHJ5KHVyaTogVVJJKTogRGVjb3JhdGlvbkVudHJ5IHtcblx0XHRsZXQgbWFwID0gdGhpcy5fZGF0YS5nZXQodXJpKTtcblx0XHRpZiAoIW1hcCkge1xuXHRcdFx0Ly8gbm90aGluZyBrbm93biBhYm91dCB0aGlzIHVyaVxuXHRcdFx0bWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0dGhpcy5fZGF0YS5zZXQodXJpLCBtYXApO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFwO1xuXHR9XG5cblx0Z2V0RGVjb3JhdGlvbih1cmk6IFVSSSwgaW5jbHVkZUNoaWxkcmVuOiBib29sZWFuKTogSURlY29yYXRpb24gfCB1bmRlZmluZWQge1xuXG5cdFx0Y29uc3QgYWxsOiBJRGVjb3JhdGlvbkRhdGFbXSA9IFtdO1xuXHRcdGxldCBjb250YWluc0NoaWxkcmVuOiBib29sZWFuID0gZmFsc2U7XG5cblx0XHRjb25zdCBtYXAgPSB0aGlzLl9lbnN1cmVFbnRyeSh1cmkpO1xuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcikge1xuXG5cdFx0XHRsZXQgZGF0YSA9IG1hcC5nZXQocHJvdmlkZXIpO1xuXHRcdFx0aWYgKGRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBzZXRzIGRhdGEgaWYgZmV0Y2ggaXMgc3luY1xuXHRcdFx0XHRkYXRhID0gdGhpcy5fZmV0Y2hEYXRhKG1hcCwgdXJpLCBwcm92aWRlcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkYXRhICYmICEoZGF0YSBpbnN0YW5jZW9mIERlY29yYXRpb25EYXRhUmVxdWVzdCkpIHtcblx0XHRcdFx0Ly8gaGF2aW5nIGRhdGFcblx0XHRcdFx0YWxsLnB1c2goZGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGluY2x1ZGVDaGlsZHJlbikge1xuXHRcdFx0Ly8gKHJlc29sdmVkKSBjaGlsZHJlblxuXHRcdFx0Y29uc3QgaXRlciA9IHRoaXMuX2RhdGEuZmluZFN1cGVyc3RyKHVyaSk7XG5cdFx0XHRpZiAoaXRlcikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHR1cGxlIG9mIGl0ZXIpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgdHVwbGVbMV0udmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdGlmIChkYXRhICYmICEoZGF0YSBpbnN0YW5jZW9mIERlY29yYXRpb25EYXRhUmVxdWVzdCkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGRhdGEuYnViYmxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0YWxsLnB1c2goZGF0YSk7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGFpbnNDaGlsZHJlbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYWxsLmxlbmd0aCA9PT0gMFxuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogdGhpcy5fZGVjb3JhdGlvblN0eWxlcy5hc0RlY29yYXRpb24oYWxsLCBjb250YWluc0NoaWxkcmVuKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZldGNoRGF0YShtYXA6IERlY29yYXRpb25FbnRyeSwgdXJpOiBVUkksIHByb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlcik6IElEZWNvcmF0aW9uRGF0YSB8IG51bGwge1xuXG5cdFx0Ly8gY2hlY2sgZm9yIHBlbmRpbmcgcmVxdWVzdCBhbmQgY2FuY2VsIGl0XG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSBtYXAuZ2V0KHByb3ZpZGVyKTtcblx0XHRpZiAocGVuZGluZ1JlcXVlc3QgaW5zdGFuY2VvZiBEZWNvcmF0aW9uRGF0YVJlcXVlc3QpIHtcblx0XHRcdHBlbmRpbmdSZXF1ZXN0LnNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdG1hcC5kZWxldGUocHJvdmlkZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGRhdGFPclRoZW5hYmxlID0gcHJvdmlkZXIucHJvdmlkZURlY29yYXRpb25zKHVyaSwgY3RzLnRva2VuKTtcblx0XHRpZiAoIWlzVGhlbmFibGU8SURlY29yYXRpb25EYXRhIHwgUHJvbWlzZTxJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkPihkYXRhT3JUaGVuYWJsZSkpIHtcblx0XHRcdC8vIHN5bmMgLT4gd2UgaGF2ZSBhIHJlc3VsdCBub3dcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fa2VlcEl0ZW0obWFwLCBwcm92aWRlciwgdXJpLCBkYXRhT3JUaGVuYWJsZSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gYXN5bmMgLT4gd2UgaGF2ZSBhIHJlc3VsdCBzb29uXG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IERlY29yYXRpb25EYXRhUmVxdWVzdChjdHMsIFByb21pc2UucmVzb2x2ZShkYXRhT3JUaGVuYWJsZSkudGhlbihkYXRhID0+IHtcblx0XHRcdFx0aWYgKG1hcC5nZXQocHJvdmlkZXIpID09PSByZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5fa2VlcEl0ZW0obWFwLCBwcm92aWRlciwgdXJpLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikgJiYgbWFwLmdldChwcm92aWRlcikgPT09IHJlcXVlc3QpIHtcblx0XHRcdFx0XHRtYXAuZGVsZXRlKHByb3ZpZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdG1hcC5zZXQocHJvdmlkZXIsIHJlcXVlc3QpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfa2VlcEl0ZW0obWFwOiBEZWNvcmF0aW9uRW50cnksIHByb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlciwgdXJpOiBVUkksIGRhdGE6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCk6IElEZWNvcmF0aW9uRGF0YSB8IG51bGwge1xuXHRcdGNvbnN0IGRlY28gPSBkYXRhID8gZGF0YSA6IG51bGw7XG5cdFx0Y29uc3Qgb2xkID0gbWFwLmdldChwcm92aWRlcik7XG5cdFx0bWFwLnNldChwcm92aWRlciwgZGVjbyk7XG5cdFx0aWYgKGRlY28gfHwgb2xkKSB7XG5cdFx0XHQvLyBvbmx5IGZpcmUgZXZlbnQgd2hlbiBzb21ldGhpbmcgY2hhbmdlZFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0RlbGF5ZWQuZmlyZSh1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVjbztcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJRGVjb3JhdGlvbnNTZXJ2aWNlLCBEZWNvcmF0aW9uc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFNBQVMsdUJBQThCO0FBQ2hELFNBQVMsMkJBQStHO0FBQ3hILFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLGNBQWMsdUJBQXVCO0FBQzNELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCLGVBQWUsd0NBQXdDO0FBQ2xGLFlBQVksY0FB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
