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
import { Codicon } from "../../../../base/common/codicons.js";
import { truncate } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { BrowserViewUri } from "../../../../platform/browserView/common/browserViewUri.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "./browserView.js";
import { EditorInputCapabilities, Verbosity } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TAB_ACTIVE_FOREGROUND } from "../../../common/theme.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { hasKey } from "../../../../base/common/types.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logBrowserOpen } from "../../../../platform/browserView/common/browserViewTelemetry.js";
import { LRUCachedFunction } from "../../../../base/common/cache.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
const LOADING_SPINNER_SVG = (color) => `
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
		<path d="M8 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" fill="${color}" opacity="0.3"/>
		<path d="M8 1a7 7 0 0 1 7 7h-1.5A5.5 5.5 0 0 0 8 2.5V1z" fill="${color}">
			<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" values="0 8 8;360 8 8"/>
		</path>
	</svg>
`;
const MAX_TITLE_LENGTH = 30;
function stripUrlFragment(url) {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}
function stripUrlQueryAndFragment(url) {
  const stripped = stripUrlFragment(url);
  const query = stripped.indexOf("?");
  return query === -1 ? stripped : stripped.slice(0, query);
}
let BrowserEditorInput = class extends EditorInput {
  constructor(options, _resolveModel, themeService, instantiationService, telemetryService, browserViewWorkbenchService) {
    super();
    this._resolveModel = _resolveModel;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.telemetryService = telemetryService;
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this._modelStore = this._register(new DisposableStore());
    this._onBeforeDispose = this._register(new Emitter());
    this.onBeforeDispose = this._onBeforeDispose.event;
    this._onDidResolveModel = this._register(new Emitter());
    this.onDidResolveModel = this._onDidResolveModel.event;
    this.getURLTitles = new LRUCachedFunction((url) => {
      let _short = void 0;
      let _medium = void 0;
      let _long = void 0;
      return {
        // Host only. Derived via the WHATWG URL parser so it matches the
        // host shown by the navbar's raw URL (e.g. punycode for IDNs).
        get [Verbosity.SHORT]() {
          if (_short === void 0) {
            const parsed = URL.parse(url);
            _short = parsed ? parsed.host : stripUrlQueryAndFragment(url);
          }
          return _short;
        },
        // Raw URL without the query/fragment. Computed by string slicing
        // (not a URI round-trip) so the displayed text stays byte-for-byte
        // consistent with the canonical URL shown in the navbar.
        get [Verbosity.MEDIUM]() {
          if (_medium === void 0) {
            _medium = stripUrlQueryAndFragment(url);
          }
          return _medium;
        },
        // Raw URL without the fragment, sliced from the canonical string for
        // the same consistency reason as the medium form.
        get [Verbosity.LONG]() {
          if (_long === void 0) {
            _long = stripUrlFragment(url);
          }
          return _long;
        }
      };
    });
    this._id = options.id;
    this._initialData = options;
  }
  get model() {
    return this._model;
  }
  set model(model) {
    if (this._model === model) {
      return;
    }
    this._modelStore.clear();
    this._model = model;
    this._modelStore.add(this._model.onWillDispose(() => {
      this._modelStore.clear();
      this._model = void 0;
    }));
    this._modelStore.add(this._model.onDidClose(() => {
      this.dispose(true);
    }));
    this._modelStore.add(this._model.onDidChangeTitle(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidChangeFavicon(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidChangeLoadingState(() => this._onDidChangeLabel.fire()));
    this._modelStore.add(this._model.onDidNavigate(() => this._onDidChangeLabel.fire()));
    this._onDidChangeLabel.fire();
    this._onDidResolveModel.fire(model);
  }
  onceModelResolves(cb) {
    if (this._model) {
      cb(this._model);
      return Disposable.None;
    } else {
      return Event.once(this.onDidResolveModel)(cb);
    }
  }
  get id() {
    return this._id;
  }
  get url() {
    return this._model ? this._model.url : this._initialData.url;
  }
  get title() {
    return this._model ? this._model.title : this._initialData.title;
  }
  get favicon() {
    return this._model ? this._model.favicon : this._initialData.favicon;
  }
  /**
   * Whether this editor was opened via a default localhost link open (setting
   * not explicitly configured by the user). Transient — not serialized.
   */
  get isDefaultLinkOpen() {
    return !!this._initialData.isDefaultLinkOpen;
  }
  get isSharingAvailable() {
    return this._model ? this._model.sharingState !== BrowserViewSharingState.Unavailable : this.browserViewWorkbenchService.isSharingAvailable;
  }
  navigate(url, options) {
    const destination = url.trim();
    if (this._model) {
      void this._model.loadURL(destination, options);
    } else {
      this._initialData = {
        id: this._id,
        url: destination
      };
      this._onDidChangeLabel.fire();
    }
  }
  async resolve() {
    if (!this._model && !this._modelPromise) {
      this._modelPromise = (async () => {
        this._model = await this._resolveModel();
        this._modelPromise = void 0;
        return this._model;
      })();
    }
    return this._model || this._modelPromise;
  }
  get typeId() {
    return BrowserEditorInput.ID;
  }
  get editorId() {
    return BrowserEditorInput.EDITOR_ID;
  }
  get capabilities() {
    return EditorInputCapabilities.ForceReveal | EditorInputCapabilities.Readonly;
  }
  get resource() {
    return BrowserViewUri.forId(this._id);
  }
  getIcon() {
    if (this._model) {
      if (this._model.loading) {
        const color = this.themeService.getColorTheme().getColor(TAB_ACTIVE_FOREGROUND);
        return URI.parse("data:image/svg+xml;utf8," + encodeURIComponent(LOADING_SPINNER_SVG(color?.toString())));
      }
      if (this._model.favicon) {
        return URI.parse(this._model.favicon);
      }
      return Codicon.globe;
    }
    if (this._initialData.favicon) {
      return URI.parse(this._initialData.favicon);
    }
    return Codicon.globe;
  }
  getName() {
    const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
    const name = hasTitle ? this.title : this.getDescription(Verbosity.SHORT) || BrowserEditorInput.DEFAULT_LABEL;
    return truncate(name, MAX_TITLE_LENGTH);
  }
  getTitle(verbosity = Verbosity.MEDIUM) {
    const hasTitle = this._model ? !!this._model.title : !!this._initialData.title;
    const description = this.getDescription(verbosity);
    const title = hasTitle ? `${this.title} (${description})` : description;
    return title || BrowserEditorInput.DEFAULT_LABEL;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    return this.url && this.getURLTitles.get(this.url)[verbosity];
  }
  canReopen() {
    return true;
  }
  matches(otherInput) {
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof BrowserEditorInput) {
      return this._id === otherInput._id;
    }
    if (hasKey(otherInput, { resource: true }) && otherInput.resource?.scheme === BrowserViewUri.scheme) {
      const parsed = BrowserViewUri.parse(otherInput.resource);
      if (parsed) {
        return this._id === parsed.id;
      }
    }
    return false;
  }
  /**
   * Creates a copy of this browser editor input with a new unique ID, creating an independent browser view with no linked state.
   * This is used during Copy into New Window.
   */
  copy() {
    logBrowserOpen(this.telemetryService, "copyToNewWindow");
    return this.instantiationService.invokeFunction((accessor) => {
      const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
      return browserViewWorkbenchService.getOrCreateLazy(generateUuid(), {
        url: this.url,
        title: this.title,
        favicon: this.favicon
      });
    });
  }
  toUntyped() {
    const viewState = {
      url: this.url,
      title: this.title,
      favicon: this.favicon
    };
    return {
      resource: this.resource,
      options: {
        override: BrowserEditorInput.EDITOR_ID,
        viewState
      }
    };
  }
  dispose(force) {
    if (!force) {
      let vetoed = false;
      this._onBeforeDispose.fire({ veto: () => {
        vetoed = true;
      } });
      if (vetoed) {
        return;
      }
    }
    super.dispose();
    if (this._model) {
      this._initialData = {
        id: this._id,
        url: this._model.url,
        title: this._model.title,
        favicon: this._model.favicon
      };
      this._model.dispose();
      this._model = void 0;
    }
  }
  serialize() {
    return {
      id: this._id,
      url: this.url,
      title: this.title,
      favicon: this.favicon
    };
  }
};
BrowserEditorInput.ID = "workbench.editorinputs.browser";
BrowserEditorInput.EDITOR_ID = "workbench.editor.browser";
BrowserEditorInput.DEFAULT_LABEL = localize("browser.editorLabel", "Browser");
BrowserEditorInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IBrowserViewWorkbenchService)
], BrowserEditorInput);
class BrowserEditorSerializer {
  canSerialize(editorInput) {
    return editorInput instanceof BrowserEditorInput;
  }
  serialize(editorInput) {
    if (!this.canSerialize(editorInput)) {
      return void 0;
    }
    return JSON.stringify(editorInput.serialize());
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const data = JSON.parse(serializedEditor);
      return instantiationService.invokeFunction((accessor) => {
        const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
        return browserViewWorkbenchService.getOrCreateLazy(data.id, data);
      });
    } catch {
      return void 0;
    }
  }
}
export {
  BrowserEditorInput,
  BrowserEditorSerializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdHJ1bmNhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1VyaSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1VyaS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZSwgSU5hdmlnYXRlT3B0aW9ucywgSUJyb3dzZXJFZGl0b3JWaWV3U3RhdGUsIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJRWRpdG9yU2VyaWFsaXplciwgSVVudHlwZWRFZGl0b3JJbnB1dCwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVEFCX0FDVElWRV9GT1JFR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3TW9kZWwgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBsb2dCcm93c2VyT3BlbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlld1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZWRGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhY2hlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbmNvbnN0IExPQURJTkdfU1BJTk5FUl9TVkcgPSAoY29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gYFxuXHQ8c3ZnIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCI+XG5cdFx0PHBhdGggZD1cIk04IDFhNyA3IDAgMSAwIDAgMTQgNyA3IDAgMCAwIDAtMTR6bTAgMS41YTUuNSA1LjUgMCAxIDEgMCAxMSA1LjUgNS41IDAgMCAxIDAtMTF6XCIgZmlsbD1cIiR7Y29sb3J9XCIgb3BhY2l0eT1cIjAuM1wiLz5cblx0XHQ8cGF0aCBkPVwiTTggMWE3IDcgMCAwIDEgNyA3aC0xLjVBNS41IDUuNSAwIDAgMCA4IDIuNVYxelwiIGZpbGw9XCIke2NvbG9yfVwiPlxuXHRcdFx0PGFuaW1hdGVUcmFuc2Zvcm0gYXR0cmlidXRlTmFtZT1cInRyYW5zZm9ybVwiIHR5cGU9XCJyb3RhdGVcIiBkdXI9XCIxc1wiIHJlcGVhdENvdW50PVwiaW5kZWZpbml0ZVwiIHZhbHVlcz1cIjAgOCA4OzM2MCA4IDhcIi8+XG5cdFx0PC9wYXRoPlxuXHQ8L3N2Zz5cbmA7XG5cbi8qKlxuICogTWF4aW11bSBsZW5ndGggZm9yIGJyb3dzZXIgcGFnZSB0aXRsZXMgYmVmb3JlIHRydW5jYXRpb25cbiAqL1xuY29uc3QgTUFYX1RJVExFX0xFTkdUSCA9IDMwO1xuXG4vKipcbiAqIEpTT04tc2VyaWFsaXphYmxlIHR5cGUgdXNlZCBkdXJpbmcgYnJvd3NlciBzdGF0ZSBzZXJpYWxpemF0aW9uL2Rlc2VyaWFsaXphdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyRWRpdG9ySW5wdXREYXRhIGV4dGVuZHMgSUJyb3dzZXJFZGl0b3JWaWV3U3RhdGUge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEZpcmVkIGJlZm9yZSBhIHtAbGluayBCcm93c2VyRWRpdG9ySW5wdXR9IGlzIGRpc3Bvc2VkLiBMaXN0ZW5lcnMgbWF5IGNhbGxcbiAqIHtAbGluayB2ZXRvfSB0byBwcmV2ZW50IGRpc3Bvc2FsIGFuZCBrZWVwIHRoZSBpbnB1dCBhbmQgaXRzIG1vZGVsIGFsaXZlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCZWZvcmVEaXNwb3NlQnJvd3NlckVkaXRvckV2ZW50IHtcblx0dmV0bygpOiB2b2lkO1xufVxuXG4vKipcbiAqIFNsaWNlIHRoZSBmcmFnbWVudCBvZmYgYSByYXcgVVJMLiBBIGxpdGVyYWwgYCNgIGFsd2F5cyBzdGFydHMgdGhlIGZyYWdtZW50LFxuICogc28gYSBwbGFpbiBzdWJzdHJpbmcga2VlcHMgdGhlIHJlc3Qgb2YgdGhlIFVSTCBieXRlLWZvci1ieXRlIGludGFjdCAobm9cbiAqIHJlLWVuY29kaW5nKSwgbWF0Y2hpbmcgd2hhdCB0aGUgbmF2YmFyIGRpc3BsYXlzLlxuICovXG5mdW5jdGlvbiBzdHJpcFVybEZyYWdtZW50KHVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgaGFzaCA9IHVybC5pbmRleE9mKCcjJyk7XG5cdHJldHVybiBoYXNoID09PSAtMSA/IHVybCA6IHVybC5zbGljZSgwLCBoYXNoKTtcbn1cblxuLyoqXG4gKiBTbGljZSBib3RoIHRoZSBxdWVyeSBhbmQgZnJhZ21lbnQgb2ZmIGEgcmF3IFVSTCwgcHJlc2VydmluZyB0aGUgZXhhY3RcbiAqIGVuY29kaW5nIG9mIHRoZSByZW1haW5pbmcgc2NoZW1lL2F1dGhvcml0eS9wYXRoLlxuICovXG5mdW5jdGlvbiBzdHJpcFVybFF1ZXJ5QW5kRnJhZ21lbnQodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzdHJpcHBlZCA9IHN0cmlwVXJsRnJhZ21lbnQodXJsKTtcblx0Y29uc3QgcXVlcnkgPSBzdHJpcHBlZC5pbmRleE9mKCc/Jyk7XG5cdHJldHVybiBxdWVyeSA9PT0gLTEgPyBzdHJpcHBlZCA6IHN0cmlwcGVkLnNsaWNlKDAsIHF1ZXJ5KTtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5lZGl0b3JpbnB1dHMuYnJvd3Nlcic7XG5cdHN0YXRpYyByZWFkb25seSBFRElUT1JfSUQgPSAnd29ya2JlbmNoLmVkaXRvci5icm93c2VyJztcblx0c3RhdGljIHJlYWRvbmx5IERFRkFVTFRfTEFCRUwgPSBsb2NhbGl6ZSgnYnJvd3Nlci5lZGl0b3JMYWJlbCcsIFwiQnJvd3NlclwiKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nO1xuXHRwcml2YXRlIF9pbml0aWFsRGF0YTogSUJyb3dzZXJFZGl0b3JJbnB1dERhdGE7XG5cblx0cHJpdmF0ZSBfbW9kZWw6IElCcm93c2VyVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbFByb21pc2U6IFByb21pc2U8SUJyb3dzZXJWaWV3TW9kZWw+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZURpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQmVmb3JlRGlzcG9zZUJyb3dzZXJFZGl0b3JFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlRGlzcG9zZTogRXZlbnQ8SUJlZm9yZURpc3Bvc2VCcm93c2VyRWRpdG9yRXZlbnQ+ID0gdGhpcy5fb25CZWZvcmVEaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzb2x2ZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3TW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmVNb2RlbDogRXZlbnQ8SUJyb3dzZXJWaWV3TW9kZWw+ID0gdGhpcy5fb25EaWRSZXNvbHZlTW9kZWwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSUJyb3dzZXJFZGl0b3JJbnB1dERhdGEsXG5cdFx0cHJpdmF0ZSBfcmVzb2x2ZU1vZGVsOiAoKSA9PiBQcm9taXNlPElCcm93c2VyVmlld01vZGVsPixcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZTogSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pZCA9IG9wdGlvbnMuaWQ7XG5cdFx0dGhpcy5faW5pdGlhbERhdGEgPSBvcHRpb25zO1xuXHR9XG5cblx0Z2V0IG1vZGVsKCk6IElCcm93c2VyVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWw7XG5cdH1cblxuXHRzZXQgbW9kZWwobW9kZWw6IElCcm93c2VyVmlld01vZGVsKSB7XG5cdFx0aWYgKHRoaXMuX21vZGVsID09PSBtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21vZGVsU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXG5cdFx0Ly8gU2V0IHVwIGNsZWFudXAgd2hlbiB0aGUgbW9kZWwgaXMgZGlzcG9zZWRcblx0XHR0aGlzLl9tb2RlbFN0b3JlLmFkZCh0aGlzLl9tb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX21vZGVsU3RvcmUuY2xlYXIoKTtcblx0XHRcdHRoaXMuX21vZGVsID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tY2xvc2UgZWRpdG9yIHdoZW4gd2ViY29udGVudHMgY2xvc2VzXG5cdFx0dGhpcy5fbW9kZWxTdG9yZS5hZGQodGhpcy5fbW9kZWwub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBsYWJlbC1yZWxldmFudCBjaGFuZ2VzIHRvIGZpcmUgb25EaWRDaGFuZ2VMYWJlbFxuXHRcdHRoaXMuX21vZGVsU3RvcmUuYWRkKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlVGl0bGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCkpKTtcblx0XHR0aGlzLl9tb2RlbFN0b3JlLmFkZCh0aGlzLl9tb2RlbC5vbkRpZENoYW5nZUZhdmljb24oKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCkpKTtcblx0XHR0aGlzLl9tb2RlbFN0b3JlLmFkZCh0aGlzLl9tb2RlbC5vbkRpZENoYW5nZUxvYWRpbmdTdGF0ZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKSkpO1xuXHRcdHRoaXMuX21vZGVsU3RvcmUuYWRkKHRoaXMuX21vZGVsLm9uRGlkTmF2aWdhdGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCkpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVzb2x2ZU1vZGVsLmZpcmUobW9kZWwpO1xuXHR9XG5cblx0b25jZU1vZGVsUmVzb2x2ZXMoY2I6IChtb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHRjYih0aGlzLl9tb2RlbCk7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gRXZlbnQub25jZSh0aGlzLm9uRGlkUmVzb2x2ZU1vZGVsKShjYik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlkKCkge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldCB1cmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBVc2UgbW9kZWwgVVJMIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC51cmwgOiB0aGlzLl9pbml0aWFsRGF0YS51cmw7XG5cdH1cblxuXHRnZXQgdGl0bGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBVc2UgbW9kZWwgdGl0bGUgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGluaXRpYWwgZGF0YVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbCA/IHRoaXMuX21vZGVsLnRpdGxlIDogdGhpcy5faW5pdGlhbERhdGEudGl0bGU7XG5cdH1cblxuXHRnZXQgZmF2aWNvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFVzZSBtb2RlbCBmYXZpY29uIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC5mYXZpY29uIDogdGhpcy5faW5pdGlhbERhdGEuZmF2aWNvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgZWRpdG9yIHdhcyBvcGVuZWQgdmlhIGEgZGVmYXVsdCBsb2NhbGhvc3QgbGluayBvcGVuIChzZXR0aW5nXG5cdCAqIG5vdCBleHBsaWNpdGx5IGNvbmZpZ3VyZWQgYnkgdGhlIHVzZXIpLiBUcmFuc2llbnQgXHUyMDE0IG5vdCBzZXJpYWxpemVkLlxuXHQgKi9cblx0Z2V0IGlzRGVmYXVsdExpbmtPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2luaXRpYWxEYXRhLmlzRGVmYXVsdExpbmtPcGVuO1xuXHR9XG5cblx0Z2V0IGlzU2hhcmluZ0F2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwgPyB0aGlzLl9tb2RlbC5zaGFyaW5nU3RhdGUgIT09IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlVuYXZhaWxhYmxlIDogdGhpcy5icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuaXNTaGFyaW5nQXZhaWxhYmxlO1xuXHR9XG5cblx0bmF2aWdhdGUodXJsOiBzdHJpbmcsIG9wdGlvbnM/OiBJTmF2aWdhdGVPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSB1cmwudHJpbSgpO1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dm9pZCB0aGlzLl9tb2RlbC5sb2FkVVJMKGRlc3RpbmF0aW9uLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgdGhlIG1vZGVsIGlzbid0IGNyZWF0ZWQgeWV0LCB1cGRhdGUgdGhlIGluaXRpYWwgZGF0YSBzbyB0aGF0IHRoZSBVUkwgaXMgY29ycmVjdCB3aGVuIHRoZSBtb2RlbCBpcyBjcmVhdGVkXG5cdFx0XHR0aGlzLl9pbml0aWFsRGF0YSA9IHtcblx0XHRcdFx0aWQ6IHRoaXMuX2lkLFxuXHRcdFx0XHR1cmw6IGRlc3RpbmF0aW9uXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPElCcm93c2VyVmlld01vZGVsPiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbCAmJiAhdGhpcy5fbW9kZWxQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9tb2RlbCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNb2RlbCgpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFByb21pc2UgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsIHx8IHRoaXMuX21vZGVsUHJvbWlzZSE7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEJyb3dzZXJFZGl0b3JJbnB1dC5JRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkZvcmNlUmV2ZWFsIHwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgcmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gQnJvd3NlclZpZXdVcmkuZm9ySWQodGhpcy5faWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdC8vIFVzZSBtb2RlbCBkYXRhIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBpbml0aWFsIGRhdGFcblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdGlmICh0aGlzLl9tb2RlbC5sb2FkaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKFRBQl9BQ1RJVkVfRk9SRUdST1VORCk7XG5cdFx0XHRcdHJldHVybiBVUkkucGFyc2UoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDt1dGY4LCcgKyBlbmNvZGVVUklDb21wb25lbnQoTE9BRElOR19TUElOTkVSX1NWRyhjb2xvcj8udG9TdHJpbmcoKSkpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9tb2RlbC5mYXZpY29uKSB7XG5cdFx0XHRcdHJldHVybiBVUkkucGFyc2UodGhpcy5fbW9kZWwuZmF2aWNvbik7XG5cdFx0XHR9XG5cdFx0XHQvLyBNb2RlbCBleGlzdHMgYnV0IG5vIGZhdmljb24geWV0LCB1c2UgZGVmYXVsdFxuXHRcdFx0cmV0dXJuIENvZGljb24uZ2xvYmU7XG5cdFx0fVxuXHRcdC8vIE1vZGVsIG5vdCBjcmVhdGVkIHlldCwgdXNlIGluaXRpYWwgZGF0YSBpZiBhdmFpbGFibGVcblx0XHRpZiAodGhpcy5faW5pdGlhbERhdGEuZmF2aWNvbikge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZSh0aGlzLl9pbml0aWFsRGF0YS5mYXZpY29uKTtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGljb24uZ2xvYmU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaGFzVGl0bGUgPSB0aGlzLl9tb2RlbCA/ICEhdGhpcy5fbW9kZWwudGl0bGUgOiAhIXRoaXMuX2luaXRpYWxEYXRhLnRpdGxlO1xuXHRcdGNvbnN0IG5hbWUgPSBoYXNUaXRsZSA/IHRoaXMudGl0bGUhIDogdGhpcy5nZXREZXNjcmlwdGlvbihWZXJib3NpdHkuU0hPUlQpIHx8IEJyb3dzZXJFZGl0b3JJbnB1dC5ERUZBVUxUX0xBQkVMO1xuXHRcdHJldHVybiB0cnVuY2F0ZShuYW1lLCBNQVhfVElUTEVfTEVOR1RIKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKHZlcmJvc2l0eSA9IFZlcmJvc2l0eS5NRURJVU0pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGhhc1RpdGxlID0gdGhpcy5fbW9kZWwgPyAhIXRoaXMuX21vZGVsLnRpdGxlIDogISF0aGlzLl9pbml0aWFsRGF0YS50aXRsZTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5KTtcblx0XHRjb25zdCB0aXRsZSA9IGhhc1RpdGxlID8gYCR7dGhpcy50aXRsZX0gKCR7ZGVzY3JpcHRpb259KWAgOiBkZXNjcmlwdGlvbjtcblx0XHRyZXR1cm4gdGl0bGUgfHwgQnJvd3NlckVkaXRvcklucHV0LkRFRkFVTFRfTEFCRUw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbih2ZXJib3NpdHkgPSBWZXJib3NpdHkuTUVESVVNKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy51cmwgJiYgdGhpcy5nZXRVUkxUaXRsZXMuZ2V0KHRoaXMudXJsKVt2ZXJib3NpdHldO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBnZXRVUkxUaXRsZXMgPSBuZXcgTFJVQ2FjaGVkRnVuY3Rpb24oKHVybDogc3RyaW5nKSA9PiB7XG5cdFx0bGV0IF9zaG9ydDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBfbWVkaXVtOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IF9sb25nOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC8vIEhvc3Qgb25seS4gRGVyaXZlZCB2aWEgdGhlIFdIQVRXRyBVUkwgcGFyc2VyIHNvIGl0IG1hdGNoZXMgdGhlXG5cdFx0XHQvLyBob3N0IHNob3duIGJ5IHRoZSBuYXZiYXIncyByYXcgVVJMIChlLmcuIHB1bnljb2RlIGZvciBJRE5zKS5cblx0XHRcdGdldCBbVmVyYm9zaXR5LlNIT1JUXSgpIHtcblx0XHRcdFx0aWYgKF9zaG9ydCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gVVJMLnBhcnNlKHVybCk7XG5cdFx0XHRcdFx0X3Nob3J0ID0gcGFyc2VkID8gcGFyc2VkLmhvc3QgOiBzdHJpcFVybFF1ZXJ5QW5kRnJhZ21lbnQodXJsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gX3Nob3J0O1xuXHRcdFx0fSxcblx0XHRcdC8vIFJhdyBVUkwgd2l0aG91dCB0aGUgcXVlcnkvZnJhZ21lbnQuIENvbXB1dGVkIGJ5IHN0cmluZyBzbGljaW5nXG5cdFx0XHQvLyAobm90IGEgVVJJIHJvdW5kLXRyaXApIHNvIHRoZSBkaXNwbGF5ZWQgdGV4dCBzdGF5cyBieXRlLWZvci1ieXRlXG5cdFx0XHQvLyBjb25zaXN0ZW50IHdpdGggdGhlIGNhbm9uaWNhbCBVUkwgc2hvd24gaW4gdGhlIG5hdmJhci5cblx0XHRcdGdldCBbVmVyYm9zaXR5Lk1FRElVTV0oKSB7XG5cdFx0XHRcdGlmIChfbWVkaXVtID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRfbWVkaXVtID0gc3RyaXBVcmxRdWVyeUFuZEZyYWdtZW50KHVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIF9tZWRpdW07XG5cdFx0XHR9LFxuXHRcdFx0Ly8gUmF3IFVSTCB3aXRob3V0IHRoZSBmcmFnbWVudCwgc2xpY2VkIGZyb20gdGhlIGNhbm9uaWNhbCBzdHJpbmcgZm9yXG5cdFx0XHQvLyB0aGUgc2FtZSBjb25zaXN0ZW5jeSByZWFzb24gYXMgdGhlIG1lZGl1bSBmb3JtLlxuXHRcdFx0Z2V0IFtWZXJib3NpdHkuTE9OR10oKSB7XG5cdFx0XHRcdGlmIChfbG9uZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0X2xvbmcgPSBzdHJpcFVybEZyYWdtZW50KHVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIF9sb25nO1xuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xuXG5cdG92ZXJyaWRlIGNhblJlb3BlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHN1cGVyLm1hdGNoZXMob3RoZXJJbnB1dCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlcklucHV0IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faWQgPT09IG90aGVySW5wdXQuX2lkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGl0J3MgYW4gdW50eXBlZCBpbnB1dCB3aXRoIGEgYnJvd3NlciB2aWV3IHJlc291cmNlXG5cdFx0aWYgKGhhc0tleShvdGhlcklucHV0LCB7IHJlc291cmNlOiB0cnVlIH0pICYmIG90aGVySW5wdXQucmVzb3VyY2U/LnNjaGVtZSA9PT0gQnJvd3NlclZpZXdVcmkuc2NoZW1lKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBCcm93c2VyVmlld1VyaS5wYXJzZShvdGhlcklucHV0LnJlc291cmNlKTtcblx0XHRcdGlmIChwYXJzZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2lkID09PSBwYXJzZWQuaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBjb3B5IG9mIHRoaXMgYnJvd3NlciBlZGl0b3IgaW5wdXQgd2l0aCBhIG5ldyB1bmlxdWUgSUQsIGNyZWF0aW5nIGFuIGluZGVwZW5kZW50IGJyb3dzZXIgdmlldyB3aXRoIG5vIGxpbmtlZCBzdGF0ZS5cblx0ICogVGhpcyBpcyB1c2VkIGR1cmluZyBDb3B5IGludG8gTmV3IFdpbmRvdy5cblx0ICovXG5cdG92ZXJyaWRlIGNvcHkoKTogRWRpdG9ySW5wdXQge1xuXHRcdGxvZ0Jyb3dzZXJPcGVuKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgJ2NvcHlUb05ld1dpbmRvdycpO1xuXG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmdldE9yQ3JlYXRlTGF6eShnZW5lcmF0ZVV1aWQoKSwge1xuXHRcdFx0XHR1cmw6IHRoaXMudXJsLFxuXHRcdFx0XHR0aXRsZTogdGhpcy50aXRsZSxcblx0XHRcdFx0ZmF2aWNvbjogdGhpcy5mYXZpY29uXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvVW50eXBlZCgpOiBJVW50eXBlZEVkaXRvcklucHV0IHtcblx0XHRjb25zdCB2aWV3U3RhdGU6IElCcm93c2VyRWRpdG9yVmlld1N0YXRlID0ge1xuXHRcdFx0dXJsOiB0aGlzLnVybCxcblx0XHRcdHRpdGxlOiB0aGlzLnRpdGxlLFxuXHRcdFx0ZmF2aWNvbjogdGhpcy5mYXZpY29uXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMucmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lELFxuXHRcdFx0XHR2aWV3U3RhdGVcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZShmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWZvcmNlKSB7XG5cdFx0XHRsZXQgdmV0b2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vbkJlZm9yZURpc3Bvc2UuZmlyZSh7IHZldG86ICgpID0+IHsgdmV0b2VkID0gdHJ1ZTsgfSB9KTtcblx0XHRcdGlmICh2ZXRvZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTsgLy8gRW1pdCBgb25XaWxsRGlzcG9zZWAgZXZlbnQgZmlyc3QsIHRoZW4gY2xlYW4gdXAgdGhlIG1vZGVsLlxuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0Ly8gYHRvVW50eXBlZCgpYCBpcyBjYWxsZWQgYWZ0ZXIgZGlzcG9zYWwuIFN0b3JlIHRoZSBsYXRlc3QgZGF0YSBpbiBgX2luaXRpYWxEYXRhYCBzbyB3ZSBjYW4gc3RpbGwgZ2V0IHRoZW0gdGhlcmUuXG5cdFx0XHR0aGlzLl9pbml0aWFsRGF0YSA9IHtcblx0XHRcdFx0aWQ6IHRoaXMuX2lkLFxuXHRcdFx0XHR1cmw6IHRoaXMuX21vZGVsLnVybCxcblx0XHRcdFx0dGl0bGU6IHRoaXMuX21vZGVsLnRpdGxlLFxuXHRcdFx0XHRmYXZpY29uOiB0aGlzLl9tb2RlbC5mYXZpY29uXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fbW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0c2VyaWFsaXplKCk6IElCcm93c2VyRWRpdG9ySW5wdXREYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRoaXMuX2lkLFxuXHRcdFx0dXJsOiB0aGlzLnVybCxcblx0XHRcdHRpdGxlOiB0aGlzLnRpdGxlLFxuXHRcdFx0ZmF2aWNvbjogdGhpcy5mYXZpY29uXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlckVkaXRvclNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cdGNhblNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBlZGl0b3JJbnB1dCBpcyBCcm93c2VyRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBlZGl0b3JJbnB1dCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dDtcblx0fVxuXG5cdHNlcmlhbGl6ZShlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5jYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShlZGl0b3JJbnB1dC5zZXJpYWxpemUoKSk7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9yOiBzdHJpbmcpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGE6IElCcm93c2VyRWRpdG9ySW5wdXREYXRhID0gSlNPTi5wYXJzZShzZXJpYWxpemVkRWRpdG9yKTtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmdldE9yQ3JlYXRlTGF6eShkYXRhLmlkLCBkYXRhKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FB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
