import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext } from "./extHost.protocol.js";
import { toDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ThemeIcon, MarkdownString as MarkdownStringType } from "./extHostTypes.js";
import { MarkdownString } from "./extHostTypeConverters.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isString } from "../../../base/common/types.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const IExtHostTimeline = createDecorator("IExtHostTimeline");
class ExtHostTimeline {
  constructor(mainContext, commands) {
    this._providers = /* @__PURE__ */ new Map();
    this._itemsBySourceAndUriMap = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);
    commands.registerArgumentProcessor({
      processArgument: (arg, extension) => {
        if (arg && arg.$mid === MarshalledId.TimelineActionContext) {
          if (this._providers.get(arg.source) && extension && isProposedApiEnabled(extension, "timeline")) {
            const uri = arg.uri === void 0 ? void 0 : URI.revive(arg.uri);
            return this._itemsBySourceAndUriMap.get(arg.source)?.get(getUriKey(uri))?.get(arg.handle);
          } else {
            return void 0;
          }
        }
        return arg;
      }
    });
  }
  async $getTimeline(id, uri, options, token) {
    const item = this._providers.get(id);
    return item?.provider.provideTimeline(URI.revive(uri), options, token);
  }
  registerTimelineProvider(scheme, provider, extensionId, commandConverter) {
    const timelineDisposables = new DisposableStore();
    const convertTimelineItem = this.convertTimelineItem(provider.id, commandConverter, timelineDisposables).bind(this);
    let disposable;
    if (provider.onDidChange) {
      disposable = provider.onDidChange((e) => this._proxy.$emitTimelineChangeEvent({ uri: void 0, reset: true, ...e, id: provider.id }), this);
    }
    const itemsBySourceAndUriMap = this._itemsBySourceAndUriMap;
    return this.registerTimelineProviderCore({
      ...provider,
      scheme,
      onDidChange: void 0,
      async provideTimeline(uri, options, token) {
        if (options?.resetCache) {
          timelineDisposables.clear();
          itemsBySourceAndUriMap.get(provider.id)?.clear();
        }
        const result = await provider.provideTimeline(uri, options, token);
        if (result === void 0 || result === null) {
          return void 0;
        }
        const convertItem = convertTimelineItem(uri, options);
        return {
          ...result,
          source: provider.id,
          items: result.items.map(convertItem)
        };
      },
      dispose() {
        for (const sourceMap of itemsBySourceAndUriMap.values()) {
          sourceMap.get(provider.id)?.clear();
        }
        disposable?.dispose();
        timelineDisposables.dispose();
      }
    }, extensionId);
  }
  convertTimelineItem(source, commandConverter, disposables) {
    return (uri, options) => {
      let items;
      if (options?.cacheResults) {
        let itemsByUri = this._itemsBySourceAndUriMap.get(source);
        if (itemsByUri === void 0) {
          itemsByUri = /* @__PURE__ */ new Map();
          this._itemsBySourceAndUriMap.set(source, itemsByUri);
        }
        const uriKey = getUriKey(uri);
        items = itemsByUri.get(uriKey);
        if (items === void 0) {
          items = /* @__PURE__ */ new Map();
          itemsByUri.set(uriKey, items);
        }
      }
      return (item) => {
        const { iconPath, ...props } = item;
        const handle = `${source}|${item.id ?? item.timestamp}`;
        items?.set(handle, item);
        let icon;
        let iconDark;
        let themeIcon;
        if (item.iconPath) {
          if (iconPath instanceof ThemeIcon) {
            themeIcon = { id: iconPath.id, color: iconPath.color };
          } else if (URI.isUri(iconPath)) {
            icon = iconPath;
            iconDark = iconPath;
          } else {
            ({ light: icon, dark: iconDark } = iconPath);
          }
        }
        let tooltip;
        if (MarkdownStringType.isMarkdownString(props.tooltip)) {
          tooltip = MarkdownString.from(props.tooltip);
        } else if (isString(props.tooltip)) {
          tooltip = props.tooltip;
        } else if (MarkdownStringType.isMarkdownString(props.detail)) {
          console.warn("Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip");
          tooltip = MarkdownString.from(props.detail);
        } else if (isString(props.detail)) {
          console.warn("Using deprecated TimelineItem.detail, migrate to TimelineItem.tooltip");
          tooltip = props.detail;
        }
        return {
          ...props,
          id: props.id ?? void 0,
          handle,
          source,
          command: item.command ? commandConverter.toInternal(item.command, disposables) : void 0,
          icon,
          iconDark,
          themeIcon,
          tooltip,
          accessibilityInformation: item.accessibilityInformation
        };
      };
    };
  }
  registerTimelineProviderCore(provider, extension) {
    const existing = this._providers.get(provider.id);
    if (existing) {
      throw new Error(`Timeline Provider ${provider.id} already exists.`);
    }
    this._proxy.$registerTimelineProvider({
      id: provider.id,
      label: provider.label,
      scheme: provider.scheme
    });
    this._providers.set(provider.id, { provider, extension });
    return toDisposable(() => {
      for (const sourceMap of this._itemsBySourceAndUriMap.values()) {
        sourceMap.get(provider.id)?.clear();
      }
      this._providers.delete(provider.id);
      this._proxy.$unregisterTimelineProvider(provider.id);
      provider.dispose();
    });
  }
}
function getUriKey(uri) {
  return uri?.toString();
}
export {
  ExtHostTimeline,
  IExtHostTimeline
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUaW1lbGluZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRpbWVsaW5lU2hhcGUsIE1haW5UaHJlYWRUaW1lbGluZVNoYXBlLCBJTWFpbkNvbnRleHQsIE1haW5Db250ZXh0IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFRpbWVsaW5lLCBUaW1lbGluZUl0ZW0sIFRpbWVsaW5lT3B0aW9ucywgVGltZWxpbmVQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGltZWxpbmUvY29tbW9uL3RpbWVsaW5lLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc0NvbnZlcnRlciwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uLCBNYXJrZG93blN0cmluZyBhcyBNYXJrZG93blN0cmluZ1R5cGUgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdFRpbWVsaW5lIGV4dGVuZHMgRXh0SG9zdFRpbWVsaW5lU2hhcGUge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdCRnZXRUaW1lbGluZShpZDogc3RyaW5nLCB1cmk6IFVyaUNvbXBvbmVudHMsIG9wdGlvbnM6IHZzY29kZS5UaW1lbGluZU9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRpbWVsaW5lIHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0VGltZWxpbmUgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RUaW1lbGluZT4oJ0lFeHRIb3N0VGltZWxpbmUnKTtcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RUaW1lbGluZSBpbXBsZW1lbnRzIElFeHRIb3N0VGltZWxpbmUge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9wcm94eTogTWFpblRocmVhZFRpbWVsaW5lU2hhcGU7XG5cblx0cHJpdmF0ZSBfcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIHsgcHJvdmlkZXI6IFRpbWVsaW5lUHJvdmlkZXI7IGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciB9PigpO1xuXG5cdHByaXZhdGUgX2l0ZW1zQnlTb3VyY2VBbmRVcmlNYXAgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZyB8IHVuZGVmaW5lZCwgTWFwPHN0cmluZywgdnNjb2RlLlRpbWVsaW5lSXRlbT4+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0Y29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGltZWxpbmUpO1xuXG5cdFx0Y29tbWFuZHMucmVnaXN0ZXJBcmd1bWVudFByb2Nlc3Nvcih7XG5cdFx0XHRwcm9jZXNzQXJndW1lbnQ6IChhcmcsIGV4dGVuc2lvbikgPT4ge1xuXHRcdFx0XHRpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuVGltZWxpbmVBY3Rpb25Db250ZXh0KSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5nZXQoYXJnLnNvdXJjZSkgJiYgZXh0ZW5zaW9uICYmIGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RpbWVsaW5lJykpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IGFyZy51cmkgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IFVSSS5yZXZpdmUoYXJnLnVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faXRlbXNCeVNvdXJjZUFuZFVyaU1hcC5nZXQoYXJnLnNvdXJjZSk/LmdldChnZXRVcmlLZXkodXJpKSk/LmdldChhcmcuaGFuZGxlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRnZXRUaW1lbGluZShpZDogc3RyaW5nLCB1cmk6IFVyaUNvbXBvbmVudHMsIG9wdGlvbnM6IHZzY29kZS5UaW1lbGluZU9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRpbWVsaW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3Byb3ZpZGVycy5nZXQoaWQpO1xuXHRcdHJldHVybiBpdGVtPy5wcm92aWRlci5wcm92aWRlVGltZWxpbmUoVVJJLnJldml2ZSh1cmkpLCBvcHRpb25zLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3RlclRpbWVsaW5lUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcgfCBzdHJpbmdbXSwgcHJvdmlkZXI6IHZzY29kZS5UaW1lbGluZVByb3ZpZGVyLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgY29tbWFuZENvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdGltZWxpbmVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbnZlcnRUaW1lbGluZUl0ZW0gPSB0aGlzLmNvbnZlcnRUaW1lbGluZUl0ZW0ocHJvdmlkZXIuaWQsIGNvbW1hbmRDb252ZXJ0ZXIsIHRpbWVsaW5lRGlzcG9zYWJsZXMpLmJpbmQodGhpcyk7XG5cblx0XHRsZXQgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHRkaXNwb3NhYmxlID0gcHJvdmlkZXIub25EaWRDaGFuZ2UoZSA9PiB0aGlzLl9wcm94eS4kZW1pdFRpbWVsaW5lQ2hhbmdlRXZlbnQoeyB1cmk6IHVuZGVmaW5lZCwgcmVzZXQ6IHRydWUsIC4uLmUsIGlkOiBwcm92aWRlci5pZCB9KSwgdGhpcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXNCeVNvdXJjZUFuZFVyaU1hcCA9IHRoaXMuX2l0ZW1zQnlTb3VyY2VBbmRVcmlNYXA7XG5cdFx0cmV0dXJuIHRoaXMucmVnaXN0ZXJUaW1lbGluZVByb3ZpZGVyQ29yZSh7XG5cdFx0XHQuLi5wcm92aWRlcixcblx0XHRcdHNjaGVtZTogc2NoZW1lLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jIHByb3ZpZGVUaW1lbGluZSh1cmk6IFVSSSwgb3B0aW9uczogVGltZWxpbmVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0aWYgKG9wdGlvbnM/LnJlc2V0Q2FjaGUpIHtcblx0XHRcdFx0XHR0aW1lbGluZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdFx0XHQvLyBGb3Igbm93LCBvbmx5IGFsbG93IHRoZSBjYWNoaW5nIG9mIGEgc2luZ2xlIFVyaVxuXHRcdFx0XHRcdC8vIGl0ZW1zQnlTb3VyY2VBbmRVcmlNYXAuZ2V0KHByb3ZpZGVyLmlkKT8uZ2V0KGdldFVyaUtleSh1cmkpKT8uY2xlYXIoKTtcblx0XHRcdFx0XHRpdGVtc0J5U291cmNlQW5kVXJpTWFwLmdldChwcm92aWRlci5pZCk/LmNsZWFyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlVGltZWxpbmUodXJpLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCB8fCByZXN1bHQgPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVE9ETzogU2hvdWxkIHdlIGJvdGhlciBjb252ZXJ0aW5nIGFsbCB0aGUgZGF0YSBpZiB3ZSBhcmVuJ3QgY2FjaGluZz8gTWVhbmluZyBpdCBpcyBiZWluZyByZXF1ZXN0ZWQgYnkgYW4gZXh0ZW5zaW9uP1xuXG5cdFx0XHRcdGNvbnN0IGNvbnZlcnRJdGVtID0gY29udmVydFRpbWVsaW5lSXRlbSh1cmksIG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0XHRzb3VyY2U6IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRcdGl0ZW1zOiByZXN1bHQuaXRlbXMubWFwKGNvbnZlcnRJdGVtKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc291cmNlTWFwIG9mIGl0ZW1zQnlTb3VyY2VBbmRVcmlNYXAudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRzb3VyY2VNYXAuZ2V0KHByb3ZpZGVyLmlkKT8uY2xlYXIoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGltZWxpbmVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSwgZXh0ZW5zaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0VGltZWxpbmVJdGVtKHNvdXJjZTogc3RyaW5nLCBjb21tYW5kQ29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdHJldHVybiAodXJpOiBVUkksIG9wdGlvbnM/OiBUaW1lbGluZU9wdGlvbnMpID0+IHtcblx0XHRcdGxldCBpdGVtczogTWFwPHN0cmluZywgdnNjb2RlLlRpbWVsaW5lSXRlbT4gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAob3B0aW9ucz8uY2FjaGVSZXN1bHRzKSB7XG5cdFx0XHRcdGxldCBpdGVtc0J5VXJpID0gdGhpcy5faXRlbXNCeVNvdXJjZUFuZFVyaU1hcC5nZXQoc291cmNlKTtcblx0XHRcdFx0aWYgKGl0ZW1zQnlVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGl0ZW1zQnlVcmkgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdFx0dGhpcy5faXRlbXNCeVNvdXJjZUFuZFVyaU1hcC5zZXQoc291cmNlLCBpdGVtc0J5VXJpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVyaUtleSA9IGdldFVyaUtleSh1cmkpO1xuXHRcdFx0XHRpdGVtcyA9IGl0ZW1zQnlVcmkuZ2V0KHVyaUtleSk7XG5cdFx0XHRcdGlmIChpdGVtcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aXRlbXMgPSBuZXcgTWFwKCk7XG5cdFx0XHRcdFx0aXRlbXNCeVVyaS5zZXQodXJpS2V5LCBpdGVtcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIChpdGVtOiB2c2NvZGUuVGltZWxpbmVJdGVtKTogVGltZWxpbmVJdGVtID0+IHtcblx0XHRcdFx0Y29uc3QgeyBpY29uUGF0aCwgLi4ucHJvcHMgfSA9IGl0ZW07XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gYCR7c291cmNlfXwke2l0ZW0uaWQgPz8gaXRlbS50aW1lc3RhbXB9YDtcblx0XHRcdFx0aXRlbXM/LnNldChoYW5kbGUsIGl0ZW0pO1xuXG5cdFx0XHRcdGxldCBpY29uO1xuXHRcdFx0XHRsZXQgaWNvbkRhcms7XG5cdFx0XHRcdGxldCB0aGVtZUljb247XG5cdFx0XHRcdGlmIChpdGVtLmljb25QYXRoKSB7XG5cdFx0XHRcdFx0aWYgKGljb25QYXRoIGluc3RhbmNlb2YgVGhlbWVJY29uKSB7XG5cdFx0XHRcdFx0XHR0aGVtZUljb24gPSB7IGlkOiBpY29uUGF0aC5pZCwgY29sb3I6IGljb25QYXRoLmNvbG9yIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2UgaWYgKFVSSS5pc1VyaShpY29uUGF0aCkpIHtcblx0XHRcdFx0XHRcdGljb24gPSBpY29uUGF0aDtcblx0XHRcdFx0XHRcdGljb25EYXJrID0gaWNvblBhdGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0KHsgbGlnaHQ6IGljb24sIGRhcms6IGljb25EYXJrIH0gPSBpY29uUGF0aCBhcyB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgdG9vbHRpcDtcblx0XHRcdFx0aWYgKE1hcmtkb3duU3RyaW5nVHlwZS5pc01hcmtkb3duU3RyaW5nKHByb3BzLnRvb2x0aXApKSB7XG5cdFx0XHRcdFx0dG9vbHRpcCA9IE1hcmtkb3duU3RyaW5nLmZyb20ocHJvcHMudG9vbHRpcCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoaXNTdHJpbmcocHJvcHMudG9vbHRpcCkpIHtcblx0XHRcdFx0XHR0b29sdGlwID0gcHJvcHMudG9vbHRpcDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUT0RPIEBqa2VhcmwsIHJlbW92ZSBvbmNlIG1pZ3JhdGlvbiBjb21wbGV0ZS5cblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGVsc2UgaWYgKE1hcmtkb3duU3RyaW5nVHlwZS5pc01hcmtkb3duU3RyaW5nKChwcm9wcyBhcyBhbnkpLmRldGFpbCkpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ1VzaW5nIGRlcHJlY2F0ZWQgVGltZWxpbmVJdGVtLmRldGFpbCwgbWlncmF0ZSB0byBUaW1lbGluZUl0ZW0udG9vbHRpcCcpO1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdHRvb2x0aXAgPSBNYXJrZG93blN0cmluZy5mcm9tKChwcm9wcyBhcyBhbnkpLmRldGFpbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGVsc2UgaWYgKGlzU3RyaW5nKChwcm9wcyBhcyBhbnkpLmRldGFpbCkpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ1VzaW5nIGRlcHJlY2F0ZWQgVGltZWxpbmVJdGVtLmRldGFpbCwgbWlncmF0ZSB0byBUaW1lbGluZUl0ZW0udG9vbHRpcCcpO1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdHRvb2x0aXAgPSAocHJvcHMgYXMgYW55KS5kZXRhaWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnByb3BzLFxuXHRcdFx0XHRcdGlkOiBwcm9wcy5pZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aGFuZGxlOiBoYW5kbGUsXG5cdFx0XHRcdFx0c291cmNlOiBzb3VyY2UsXG5cdFx0XHRcdFx0Y29tbWFuZDogaXRlbS5jb21tYW5kID8gY29tbWFuZENvbnZlcnRlci50b0ludGVybmFsKGl0ZW0uY29tbWFuZCwgZGlzcG9zYWJsZXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGljb246IGljb24sXG5cdFx0XHRcdFx0aWNvbkRhcms6IGljb25EYXJrLFxuXHRcdFx0XHRcdHRoZW1lSWNvbjogdGhlbWVJY29uLFxuXHRcdFx0XHRcdHRvb2x0aXAsXG5cdFx0XHRcdFx0YWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uOiBpdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvblxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclRpbWVsaW5lUHJvdmlkZXJDb3JlKHByb3ZpZGVyOiBUaW1lbGluZVByb3ZpZGVyLCBleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gY29uc29sZS5sb2coYEV4dEhvc3RUaW1lbGluZSNyZWdpc3RlclRpbWVsaW5lUHJvdmlkZXI6IGlkPSR7cHJvdmlkZXIuaWR9YCk7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Byb3ZpZGVycy5nZXQocHJvdmlkZXIuaWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaW1lbGluZSBQcm92aWRlciAke3Byb3ZpZGVyLmlkfSBhbHJlYWR5IGV4aXN0cy5gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUaW1lbGluZVByb3ZpZGVyKHtcblx0XHRcdGlkOiBwcm92aWRlci5pZCxcblx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdHNjaGVtZTogcHJvdmlkZXIuc2NoZW1lXG5cdFx0fSk7XG5cdFx0dGhpcy5fcHJvdmlkZXJzLnNldChwcm92aWRlci5pZCwgeyBwcm92aWRlciwgZXh0ZW5zaW9uIH0pO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNvdXJjZU1hcCBvZiB0aGlzLl9pdGVtc0J5U291cmNlQW5kVXJpTWFwLnZhbHVlcygpKSB7XG5cdFx0XHRcdHNvdXJjZU1hcC5nZXQocHJvdmlkZXIuaWQpPy5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyLmlkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyVGltZWxpbmVQcm92aWRlcihwcm92aWRlci5pZCk7XG5cdFx0XHRwcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VXJpS2V5KHVyaTogVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHVyaT8udG9TdHJpbmcoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQXdCLFdBQVc7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBc0UsbUJBQW1CO0FBRXpGLFNBQXNCLGNBQWMsdUJBQXVCO0FBRzNELFNBQVMsV0FBVyxrQkFBa0IsMEJBQTBCO0FBQ2hFLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBTzlCLE1BQU0sbUJBQW1CLGdCQUFrQyxrQkFBa0I7QUFFN0UsTUFBTSxnQkFBNEM7QUFBQSxFQVN4RCxZQUNDLGFBQ0EsVUFDQztBQVBGLFNBQVEsYUFBYSxvQkFBSSxJQUE0RTtBQUVyRyxTQUFRLDBCQUEwQixvQkFBSSxJQUF1RTtBQU01RyxTQUFLLFNBQVMsWUFBWSxTQUFTLFlBQVksa0JBQWtCO0FBRWpFLGFBQVMsMEJBQTBCO0FBQUEsTUFDbEMsaUJBQWlCLENBQUMsS0FBSyxjQUFjO0FBQ3BDLFlBQUksT0FBTyxJQUFJLFNBQVMsYUFBYSx1QkFBdUI7QUFDM0QsY0FBSSxLQUFLLFdBQVcsSUFBSSxJQUFJLE1BQU0sS0FBSyxhQUFhLHFCQUFxQixXQUFXLFVBQVUsR0FBRztBQUNoRyxrQkFBTSxNQUFNLElBQUksUUFBUSxTQUFZLFNBQVksSUFBSSxPQUFPLElBQUksR0FBRztBQUNsRSxtQkFBTyxLQUFLLHdCQUF3QixJQUFJLElBQUksTUFBTSxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLElBQUksTUFBTTtBQUFBLFVBQ3pGLE9BQU87QUFDTixtQkFBTztBQUFBLFVB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
