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
import "../common/walkThroughUtils.js";
import "./media/walkThroughPart.css";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import * as strings from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { dispose, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { WalkThroughInput } from "./walkThroughInput.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { localize } from "../../../../nls.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { RawContextKey, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isObject } from "../../../../base/common/types.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { OS, OperatingSystem } from "../../../../base/common/platform.js";
import { deepClone } from "../../../../base/common/objects.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { addDisposableListener, isHTMLAnchorElement, isHTMLButtonElement, isHTMLElement, size } from "../../../../base/browser/dom.js";
import * as domSanitize from "../../../../base/browser/domSanitize.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
const WALK_THROUGH_FOCUS = new RawContextKey("interactivePlaygroundFocus", false);
const UNBOUND_COMMAND = localize("walkThrough.unboundCommand", "unbound");
const WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY = "walkThroughEditorViewState";
let WalkThroughPart = class extends EditorPane {
  constructor(group, telemetryService, themeService, textResourceConfigurationService, instantiationService, openerService, keybindingService, storageService, contextKeyService, configurationService, notificationService, extensionService, editorGroupService) {
    super(WalkThroughPart.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.keybindingService = keybindingService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.disposables = new DisposableStore();
    this.contentDisposables = [];
    this.editorFocus = WALK_THROUGH_FOCUS.bindTo(this.contextKeyService);
    this.editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, WALK_THROUGH_EDITOR_VIEW_STATE_PREFERENCE_KEY);
  }
  createEditor(container) {
    this.content = document.createElement("div");
    this.content.classList.add("welcomePageFocusElement");
    this.content.tabIndex = 0;
    this.content.style.outlineStyle = "none";
    this.scrollbar = new DomScrollableElement(this.content, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Auto
    });
    this.disposables.add(this.scrollbar);
    container.appendChild(this.scrollbar.getDomNode());
    this.registerFocusHandlers();
    this.registerClickHandler();
    this.disposables.add(this.scrollbar.onScroll((e) => this.updatedScrollPosition()));
  }
  updatedScrollPosition() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    const scrollHeight = scrollDimensions.scrollHeight;
    if (scrollHeight && this.input instanceof WalkThroughInput) {
      const scrollTop = scrollPosition.scrollTop;
      const height = scrollDimensions.height;
      this.input.relativeScrollPosition(scrollTop / scrollHeight, (scrollTop + height) / scrollHeight);
    }
  }
  onTouchChange(event) {
    event.preventDefault();
    event.stopPropagation();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - event.translationY });
  }
  addEventListener(element, type, listener, useCapture) {
    element.addEventListener(type, listener, useCapture);
    return toDisposable(() => {
      element.removeEventListener(type, listener, useCapture);
    });
  }
  registerFocusHandlers() {
    this.disposables.add(this.addEventListener(this.content, "mousedown", (e) => {
      this.focus();
    }));
    this.disposables.add(this.addEventListener(this.content, "focus", (e) => {
      this.editorFocus.set(true);
    }));
    this.disposables.add(this.addEventListener(this.content, "blur", (e) => {
      this.editorFocus.reset();
    }));
    this.disposables.add(this.addEventListener(this.content, "focusin", (e) => {
      if (isHTMLElement(e.target) && e.target.classList.contains("zone-widget-container")) {
        const scrollPosition = this.scrollbar.getScrollPosition();
        this.content.scrollTop = scrollPosition.scrollTop;
        this.content.scrollLeft = scrollPosition.scrollLeft;
      }
      if (isHTMLElement(e.target)) {
        this.lastFocus = e.target;
      }
    }));
  }
  registerClickHandler() {
    this.disposables.add(this.addEventListener(this.content, "click", (event) => {
      for (let node = event.target; node; node = node.parentNode) {
        if (isHTMLAnchorElement(node) && node.href) {
          const baseElement = node.ownerDocument.getElementsByTagName("base")[0] || this.window.location;
          if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {
            const scrollTarget = this.content.querySelector(node.hash);
            const innerContent = this.content.firstElementChild;
            if (scrollTarget && innerContent) {
              const targetTop = scrollTarget.getBoundingClientRect().top - 20;
              const containerTop = innerContent.getBoundingClientRect().top;
              this.scrollbar.setScrollPosition({ scrollTop: targetTop - containerTop });
            }
          } else {
            this.open(URI.parse(node.href));
          }
          event.preventDefault();
          break;
        } else if (isHTMLButtonElement(node)) {
          const href = node.getAttribute("data-href");
          if (href) {
            this.open(URI.parse(href));
          }
          break;
        } else if (node === event.currentTarget) {
          break;
        }
      }
    }));
  }
  open(uri) {
    if (uri.scheme === "command" && uri.path === "git.clone" && !CommandsRegistry.getCommand("git.clone")) {
      this.notificationService.info(localize("walkThrough.gitNotFound", "It looks like Git is not installed on your system."));
      return;
    }
    this.openerService.open(this.addFrom(uri), { allowCommands: true });
  }
  addFrom(uri) {
    if (uri.scheme !== "command" || !(this.input instanceof WalkThroughInput)) {
      return uri;
    }
    const query = uri.query ? JSON.parse(uri.query) : {};
    query.from = this.input.getTelemetryFrom();
    return uri.with({ query: JSON.stringify(query) });
  }
  layout(dimension) {
    this.size = dimension;
    size(this.content, dimension.width, dimension.height);
    this.updateSizeClasses();
    this.contentDisposables.forEach((disposable) => {
      if (disposable instanceof CodeEditorWidget) {
        disposable.layout();
      }
    });
    const walkthroughInput = this.input instanceof WalkThroughInput && this.input;
    if (walkthroughInput && walkthroughInput.layout) {
      walkthroughInput.layout(dimension);
    }
    this.scrollbar.scanDomNode();
  }
  updateSizeClasses() {
    const innerContent = this.content.firstElementChild;
    if (this.size && innerContent) {
      innerContent.classList.toggle("max-height-685px", this.size.height <= 685);
    }
  }
  focus() {
    super.focus();
    let active = this.content.ownerDocument.activeElement;
    while (active && active !== this.content) {
      active = active.parentElement;
    }
    if (!active) {
      (this.lastFocus || this.content).focus();
    }
    this.editorFocus.set(true);
  }
  arrowUp() {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - this.getArrowScrollHeight() });
  }
  arrowDown() {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + this.getArrowScrollHeight() });
  }
  getArrowScrollHeight() {
    let fontSize = this.configurationService.getValue("editor.fontSize");
    if (typeof fontSize !== "number" || fontSize < 1) {
      fontSize = 12;
    }
    return 3 * fontSize;
  }
  pageUp() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop - scrollDimensions.height });
  }
  pageDown() {
    const scrollDimensions = this.scrollbar.getScrollDimensions();
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.scrollbar.setScrollPosition({ scrollTop: scrollPosition.scrollTop + scrollDimensions.height });
  }
  setInput(input, options, context, token) {
    const store = new DisposableStore();
    this.contentDisposables.push(store);
    this.content.innerText = "";
    return super.setInput(input, options, context, token).then(async () => {
      if (input.resource.path.endsWith(".md")) {
        await this.extensionService.whenInstalledExtensionsRegistered();
      }
      return input.resolve();
    }).then((model) => {
      if (token.isCancellationRequested) {
        return;
      }
      const content = model.main;
      if (!input.resource.path.endsWith(".md")) {
        this.safeSetInnerHtml(this.content, content);
        this.updateSizeClasses();
        this.decorateContent();
        this.contentDisposables.push(this.keybindingService.onDidUpdateKeybindings(() => this.decorateContent()));
        input.onReady?.(this.content.firstElementChild, store);
        this.scrollbar.scanDomNode();
        this.loadTextEditorViewState(input);
        this.updatedScrollPosition();
        return;
      }
      const innerContent = document.createElement("div");
      innerContent.classList.add("walkThroughContent");
      const markdown = this.expandMacros(content);
      this.safeSetInnerHtml(innerContent, markdown);
      this.content.appendChild(innerContent);
      model.snippets.forEach((snippet, i) => {
        const model2 = snippet.textEditorModel;
        if (!model2) {
          return;
        }
        const id = `snippet-${model2.uri.fragment}`;
        const div = innerContent.querySelector(`#${id.replace(/[\\.]/g, "\\$&")}`);
        const options2 = this.getEditorOptions(model2.getLanguageId());
        const telemetryData = {
          target: this.input instanceof WalkThroughInput ? this.input.getTelemetryFrom() : void 0,
          snippet: i
        };
        const editor = this.instantiationService.createInstance(CodeEditorWidget, div, options2, {
          telemetryData
        });
        editor.setModel(model2);
        this.contentDisposables.push(editor);
        const updateHeight = (initial) => {
          const position = editor.getPosition();
          const lineHeight = position ? editor.getLineHeightForPosition(position) : editor.getOption(EditorOption.lineHeight);
          const height = `${Math.max(model2.getLineCount() + 1, 4) * lineHeight}px`;
          if (div.style.height !== height) {
            div.style.height = height;
            editor.layout();
            if (!initial) {
              this.scrollbar.scanDomNode();
            }
          }
        };
        updateHeight(true);
        this.contentDisposables.push(editor.onDidChangeModelContent(() => updateHeight(false)));
        this.contentDisposables.push(editor.onDidChangeCursorPosition((e) => {
          const innerContent2 = this.content.firstElementChild;
          if (innerContent2) {
            const targetTop = div.getBoundingClientRect().top;
            const containerTop = innerContent2.getBoundingClientRect().top;
            const lineHeight = editor.getLineHeightForPosition(e.position);
            const lineTop = targetTop + (e.position.lineNumber - 1) * lineHeight - containerTop;
            const lineBottom = lineTop + lineHeight;
            const scrollDimensions = this.scrollbar.getScrollDimensions();
            const scrollPosition = this.scrollbar.getScrollPosition();
            const scrollTop = scrollPosition.scrollTop;
            const height = scrollDimensions.height;
            if (scrollTop > lineTop) {
              this.scrollbar.setScrollPosition({ scrollTop: lineTop });
            } else if (scrollTop < lineBottom - height) {
              this.scrollbar.setScrollPosition({ scrollTop: lineBottom - height });
            }
          }
        }));
        this.contentDisposables.push(this.configurationService.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration("editor") && snippet.textEditorModel) {
            editor.updateOptions(this.getEditorOptions(snippet.textEditorModel.getLanguageId()));
          }
        }));
      });
      this.updateSizeClasses();
      this.multiCursorModifier();
      this.contentDisposables.push(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("editor.multiCursorModifier")) {
          this.multiCursorModifier();
        }
      }));
      input.onReady?.(innerContent, store);
      this.scrollbar.scanDomNode();
      this.loadTextEditorViewState(input);
      this.updatedScrollPosition();
      this.contentDisposables.push(Gesture.addTarget(innerContent));
      this.contentDisposables.push(addDisposableListener(innerContent, TouchEventType.Change, (e) => this.onTouchChange(e)));
    });
  }
  safeSetInnerHtml(node, content) {
    domSanitize.safeSetInnerHtml(node, content, {
      allowedAttributes: {
        augment: [
          "id",
          "class",
          "style",
          "data-command",
          "data-href"
        ]
      }
    });
  }
  getEditorOptions(language) {
    const config = deepClone(this.configurationService.getValue("editor", { overrideIdentifier: language }));
    return {
      ...isObject(config) ? config : /* @__PURE__ */ Object.create(null),
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false
      },
      overviewRulerLanes: 3,
      fixedOverflowWidgets: false,
      lineNumbersMinChars: 1,
      minimap: { enabled: false }
    };
  }
  expandMacros(input) {
    return input.replace(/kb\(([a-z.\d\-]+)\)/gi, (match, kb) => {
      const keybinding = this.keybindingService.lookupKeybinding(kb);
      const shortcut = keybinding ? keybinding.getLabel() || "" : UNBOUND_COMMAND;
      return `<span class="shortcut">${strings.escape(shortcut)}</span>`;
    });
  }
  decorateContent() {
    const keys = this.content.querySelectorAll(".shortcut[data-command]");
    Array.prototype.forEach.call(keys, (key) => {
      const command = key.getAttribute("data-command");
      const keybinding = command && this.keybindingService.lookupKeybinding(command);
      const label = keybinding ? keybinding.getLabel() || "" : UNBOUND_COMMAND;
      while (key.firstChild) {
        key.firstChild.remove();
      }
      key.appendChild(document.createTextNode(label));
    });
    const ifkeys = this.content.querySelectorAll(".if_shortcut[data-command]");
    Array.prototype.forEach.call(ifkeys, (key) => {
      const command = key.getAttribute("data-command");
      const keybinding = command && this.keybindingService.lookupKeybinding(command);
      key.style.display = !keybinding ? "none" : "";
    });
  }
  multiCursorModifier() {
    const labels = UILabelProvider.modifierLabels[OS];
    const value = this.configurationService.getValue("editor.multiCursorModifier");
    const modifier = labels[value === "ctrlCmd" ? OS === OperatingSystem.Macintosh ? "metaKey" : "ctrlKey" : "altKey"];
    const keys = this.content.querySelectorAll(".multi-cursor-modifier");
    Array.prototype.forEach.call(keys, (key) => {
      while (key.firstChild) {
        key.firstChild.remove();
      }
      key.appendChild(document.createTextNode(modifier));
    });
  }
  saveTextEditorViewState(input) {
    const scrollPosition = this.scrollbar.getScrollPosition();
    this.editorMemento.saveEditorState(this.group, input, {
      viewState: {
        scrollTop: scrollPosition.scrollTop,
        scrollLeft: scrollPosition.scrollLeft
      }
    });
  }
  loadTextEditorViewState(input) {
    const state = this.editorMemento.loadEditorState(this.group, input);
    if (state) {
      this.scrollbar.setScrollPosition(state.viewState);
    }
  }
  clearInput() {
    if (this.input instanceof WalkThroughInput) {
      this.saveTextEditorViewState(this.input);
    }
    this.contentDisposables = dispose(this.contentDisposables);
    super.clearInput();
  }
  saveState() {
    if (this.input instanceof WalkThroughInput) {
      this.saveTextEditorViewState(this.input);
    }
    super.saveState();
  }
  dispose() {
    this.editorFocus.reset();
    this.contentDisposables = dispose(this.contentDisposables);
    this.disposables.dispose();
    super.dispose();
  }
};
WalkThroughPart.ID = "workbench.editor.walkThroughPart";
WalkThroughPart = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ITextResourceConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IExtensionService),
  __decorateParam(12, IEditorGroupsService)
], WalkThroughPart);
export {
  WALK_THROUGH_FOCUS,
  WalkThroughPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVXYWxrdGhyb3VnaC9icm93c2VyL3dhbGtUaHJvdWdoUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vY29tbW9uL3dhbGtUaHJvdWdoVXRpbHMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3dhbGtUaHJvdWdoUGFydC5jc3MnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZUV2ZW50LCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JNZW1lbnRvLCBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgV2Fsa1Rocm91Z2hJbnB1dCB9IGZyb20gJy4vd2Fsa1Rocm91Z2hJbnB1dC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5LCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIElFZGl0b3JPcHRpb25zIGFzIElDb2RlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVUlMYWJlbFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ0xhYmVscy5qcyc7XG5pbXBvcnQgeyBPUywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRGltZW5zaW9uLCBpc0hUTUxBbmNob3JFbGVtZW50LCBpc0hUTUxCdXR0b25FbGVtZW50LCBpc0hUTUxFbGVtZW50LCBzaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TYW5pdGl6ZSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5cbmV4cG9ydCBjb25zdCBXQUxLX1RIUk9VR0hfRk9DVVMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaW50ZXJhY3RpdmVQbGF5Z3JvdW5kRm9jdXMnLCBmYWxzZSk7XG5cbmNvbnN0IFVOQk9VTkRfQ09NTUFORCA9IGxvY2FsaXplKCd3YWxrVGhyb3VnaC51bmJvdW5kQ29tbWFuZCcsIFwidW5ib3VuZFwiKTtcbmNvbnN0IFdBTEtfVEhST1VHSF9FRElUT1JfVklFV19TVEFURV9QUkVGRVJFTkNFX0tFWSA9ICd3YWxrVGhyb3VnaEVkaXRvclZpZXdTdGF0ZSc7XG5cbmludGVyZmFjZSBJVmlld1N0YXRlIHtcblx0c2Nyb2xsVG9wOiBudW1iZXI7XG5cdHNjcm9sbExlZnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElXYWxrVGhyb3VnaEVkaXRvclZpZXdTdGF0ZSB7XG5cdHZpZXdTdGF0ZTogSVZpZXdTdGF0ZTtcbn1cblxuZXhwb3J0IGNsYXNzIFdhbGtUaHJvdWdoUGFydCBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ3dvcmtiZW5jaC5lZGl0b3Iud2Fsa1Rocm91Z2hQYXJ0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGNvbnRlbnREaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIGNvbnRlbnQhOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSBzY3JvbGxiYXIhOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGFzdEZvY3VzOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzaXplOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yTWVtZW50bzogSUVkaXRvck1lbWVudG88SVdhbGtUaHJvdWdoRWRpdG9yVmlld1N0YXRlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoV2Fsa1Rocm91Z2hQYXJ0LklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JGb2N1cyA9IFdBTEtfVEhST1VHSF9GT0NVUy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0b3JNZW1lbnRvID0gdGhpcy5nZXRFZGl0b3JNZW1lbnRvPElXYWxrVGhyb3VnaEVkaXRvclZpZXdTdGF0ZT4oZWRpdG9yR3JvdXBTZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgV0FMS19USFJPVUdIX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuY29udGVudC5jbGFzc0xpc3QuYWRkKCd3ZWxjb21lUGFnZUZvY3VzRWxlbWVudCcpO1xuXHRcdHRoaXMuY29udGVudC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5jb250ZW50LnN0eWxlLm91dGxpbmVTdHlsZSA9ICdub25lJztcblxuXHRcdHRoaXMuc2Nyb2xsYmFyID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuY29udGVudCwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0b1xuXHRcdH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Nyb2xsYmFyKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJGb2N1c0hhbmRsZXJzKCk7XG5cdFx0dGhpcy5yZWdpc3RlckNsaWNrSGFuZGxlcigpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5zY3JvbGxiYXIub25TY3JvbGwoZSA9PiB0aGlzLnVwZGF0ZWRTY3JvbGxQb3NpdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZWRTY3JvbGxQb3NpdGlvbigpIHtcblx0XHRjb25zdCBzY3JvbGxEaW1lbnNpb25zID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSBzY3JvbGxEaW1lbnNpb25zLnNjcm9sbEhlaWdodDtcblx0XHRpZiAoc2Nyb2xsSGVpZ2h0ICYmIHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0KSB7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3A7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBzY3JvbGxEaW1lbnNpb25zLmhlaWdodDtcblx0XHRcdHRoaXMuaW5wdXQucmVsYXRpdmVTY3JvbGxQb3NpdGlvbihzY3JvbGxUb3AgLyBzY3JvbGxIZWlnaHQsIChzY3JvbGxUb3AgKyBoZWlnaHQpIC8gc2Nyb2xsSGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVG91Y2hDaGFuZ2UoZXZlbnQ6IEdlc3R1cmVFdmVudCkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCAtIGV2ZW50LnRyYW5zbGF0aW9uWSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcjxLIGV4dGVuZHMga2V5b2YgSFRNTEVsZW1lbnRFdmVudE1hcCwgRSBleHRlbmRzIEhUTUxFbGVtZW50PihlbGVtZW50OiBFLCB0eXBlOiBLLCBsaXN0ZW5lcjogKHRoaXM6IEUsIGV2OiBIVE1MRWxlbWVudEV2ZW50TWFwW0tdKSA9PiBhbnksIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcjxFIGV4dGVuZHMgSFRNTEVsZW1lbnQ+KGVsZW1lbnQ6IEUsIHR5cGU6IHN0cmluZywgbGlzdGVuZXI6IEV2ZW50TGlzdGVuZXJPckV2ZW50TGlzdGVuZXJPYmplY3QsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcjxFIGV4dGVuZHMgSFRNTEVsZW1lbnQ+KGVsZW1lbnQ6IEUsIHR5cGU6IHN0cmluZywgbGlzdGVuZXI6IEV2ZW50TGlzdGVuZXJPckV2ZW50TGlzdGVuZXJPYmplY3QsIHVzZUNhcHR1cmU/OiBib29sZWFuKTogSURpc3Bvc2FibGUge1xuXHRcdGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckZvY3VzSGFuZGxlcnMoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5hZGRFdmVudExpc3RlbmVyKHRoaXMuY29udGVudCwgJ21vdXNlZG93bicsIGUgPT4ge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5jb250ZW50LCAnZm9jdXMnLCBlID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yRm9jdXMuc2V0KHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5jb250ZW50LCAnYmx1cicsIGUgPT4ge1xuXHRcdFx0dGhpcy5lZGl0b3JGb2N1cy5yZXNldCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5jb250ZW50LCAnZm9jdXNpbicsIChlOiBGb2N1c0V2ZW50KSA9PiB7XG5cdFx0XHQvLyBXb3JrIGFyb3VuZCBzY3JvbGxpbmcgYXMgc2lkZS1lZmZlY3Qgb2Ygc2V0dGluZyBmb2N1cyBvbiB0aGUgb2Zmc2NyZWVuIHpvbmUgd2lkZ2V0ICgjMTg5MjkpXG5cdFx0XHRpZiAoaXNIVE1MRWxlbWVudChlLnRhcmdldCkgJiYgZS50YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCd6b25lLXdpZGdldC1jb250YWluZXInKSkge1xuXHRcdFx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRcdHRoaXMuY29udGVudC5zY3JvbGxUb3AgPSBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3A7XG5cdFx0XHRcdHRoaXMuY29udGVudC5zY3JvbGxMZWZ0ID0gc2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdDtcblx0XHRcdH1cblx0XHRcdGlmIChpc0hUTUxFbGVtZW50KGUudGFyZ2V0KSkge1xuXHRcdFx0XHR0aGlzLmxhc3RGb2N1cyA9IGUudGFyZ2V0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDbGlja0hhbmRsZXIoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5hZGRFdmVudExpc3RlbmVyKHRoaXMuY29udGVudCwgJ2NsaWNrJywgZXZlbnQgPT4ge1xuXHRcdFx0Zm9yIChsZXQgbm9kZSA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDsgbm9kZTsgbm9kZSA9IG5vZGUucGFyZW50Tm9kZSBhcyBIVE1MRWxlbWVudCkge1xuXHRcdFx0XHRpZiAoaXNIVE1MQW5jaG9yRWxlbWVudChub2RlKSAmJiBub2RlLmhyZWYpIHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRjb25zdCBiYXNlRWxlbWVudCA9IG5vZGUub3duZXJEb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYmFzZScpWzBdIHx8IHRoaXMud2luZG93LmxvY2F0aW9uO1xuXHRcdFx0XHRcdGlmIChiYXNlRWxlbWVudCAmJiBub2RlLmhyZWYuaW5kZXhPZihiYXNlRWxlbWVudC5ocmVmKSA+PSAwICYmIG5vZGUuaGFzaCkge1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxUYXJnZXQgPSB0aGlzLmNvbnRlbnQucXVlcnlTZWxlY3Rvcihub2RlLmhhc2gpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5uZXJDb250ZW50ID0gdGhpcy5jb250ZW50LmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdFx0XHRcdFx0aWYgKHNjcm9sbFRhcmdldCAmJiBpbm5lckNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0VG9wID0gc2Nyb2xsVGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCAtIDIwO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb250YWluZXJUb3AgPSBpbm5lckNvbnRlbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogdGFyZ2V0VG9wIC0gY29udGFpbmVyVG9wIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW4oVVJJLnBhcnNlKG5vZGUuaHJlZikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzSFRNTEJ1dHRvbkVsZW1lbnQobm9kZSkpIHtcblx0XHRcdFx0XHRjb25zdCBocmVmID0gbm9kZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtaHJlZicpO1xuXHRcdFx0XHRcdGlmIChocmVmKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW4oVVJJLnBhcnNlKGhyZWYpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobm9kZSA9PT0gZXZlbnQuY3VycmVudFRhcmdldCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuKHVyaTogVVJJKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09ICdjb21tYW5kJyAmJiB1cmkucGF0aCA9PT0gJ2dpdC5jbG9uZScgJiYgIUNvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnZ2l0LmNsb25lJykpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCd3YWxrVGhyb3VnaC5naXROb3RGb3VuZCcsIFwiSXQgbG9va3MgbGlrZSBHaXQgaXMgbm90IGluc3RhbGxlZCBvbiB5b3VyIHN5c3RlbS5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih0aGlzLmFkZEZyb20odXJpKSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRGcm9tKHVyaTogVVJJKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09ICdjb21tYW5kJyB8fCAhKHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0Y29uc3QgcXVlcnkgPSB1cmkucXVlcnkgPyBKU09OLnBhcnNlKHVyaS5xdWVyeSkgOiB7fTtcblx0XHRxdWVyeS5mcm9tID0gdGhpcy5pbnB1dC5nZXRUZWxlbWV0cnlGcm9tKCk7XG5cdFx0cmV0dXJuIHVyaS53aXRoKHsgcXVlcnk6IEpTT04uc3RyaW5naWZ5KHF1ZXJ5KSB9KTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuc2l6ZSA9IGRpbWVuc2lvbjtcblx0XHRzaXplKHRoaXMuY29udGVudCwgZGltZW5zaW9uLndpZHRoLCBkaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR0aGlzLnVwZGF0ZVNpemVDbGFzc2VzKCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NhYmxlID0+IHtcblx0XHRcdGlmIChkaXNwb3NhYmxlIGluc3RhbmNlb2YgQ29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHdhbGt0aHJvdWdoSW5wdXQgPSB0aGlzLmlucHV0IGluc3RhbmNlb2YgV2Fsa1Rocm91Z2hJbnB1dCAmJiB0aGlzLmlucHV0O1xuXHRcdGlmICh3YWxrdGhyb3VnaElucHV0ICYmIHdhbGt0aHJvdWdoSW5wdXQubGF5b3V0KSB7XG5cdFx0XHR3YWxrdGhyb3VnaElucHV0LmxheW91dChkaW1lbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTaXplQ2xhc3NlcygpIHtcblx0XHRjb25zdCBpbm5lckNvbnRlbnQgPSB0aGlzLmNvbnRlbnQuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0aWYgKHRoaXMuc2l6ZSAmJiBpbm5lckNvbnRlbnQpIHtcblx0XHRcdGlubmVyQ29udGVudC5jbGFzc0xpc3QudG9nZ2xlKCdtYXgtaGVpZ2h0LTY4NXB4JywgdGhpcy5zaXplLmhlaWdodCA8PSA2ODUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHRsZXQgYWN0aXZlID0gdGhpcy5jb250ZW50Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHR3aGlsZSAoYWN0aXZlICYmIGFjdGl2ZSAhPT0gdGhpcy5jb250ZW50KSB7XG5cdFx0XHRhY3RpdmUgPSBhY3RpdmUucGFyZW50RWxlbWVudDtcblx0XHR9XG5cdFx0aWYgKCFhY3RpdmUpIHtcblx0XHRcdCh0aGlzLmxhc3RGb2N1cyB8fCB0aGlzLmNvbnRlbnQpLmZvY3VzKCk7XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9yRm9jdXMuc2V0KHRydWUpO1xuXHR9XG5cblx0YXJyb3dVcCgpIHtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCAtIHRoaXMuZ2V0QXJyb3dTY3JvbGxIZWlnaHQoKSB9KTtcblx0fVxuXG5cdGFycm93RG93bigpIHtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCArIHRoaXMuZ2V0QXJyb3dTY3JvbGxIZWlnaHQoKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXJyb3dTY3JvbGxIZWlnaHQoKSB7XG5cdFx0bGV0IGZvbnRTaXplID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0aWYgKHR5cGVvZiBmb250U2l6ZSAhPT0gJ251bWJlcicgfHwgZm9udFNpemUgPCAxKSB7XG5cdFx0XHRmb250U2l6ZSA9IDEyO1xuXHRcdH1cblx0XHRyZXR1cm4gMyAqIChmb250U2l6ZSBhcyBudW1iZXIpO1xuXHR9XG5cblx0cGFnZVVwKCkge1xuXHRcdGNvbnN0IHNjcm9sbERpbWVuc2lvbnMgPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgLSBzY3JvbGxEaW1lbnNpb25zLmhlaWdodCB9KTtcblx0fVxuXG5cdHBhZ2VEb3duKCkge1xuXHRcdGNvbnN0IHNjcm9sbERpbWVuc2lvbnMgPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgKyBzY3JvbGxEaW1lbnNpb25zLmhlaWdodCB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldElucHV0KGlucHV0OiBXYWxrVGhyb3VnaElucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKHN0b3JlKTtcblxuXHRcdHRoaXMuY29udGVudC5pbm5lclRleHQgPSAnJztcblxuXHRcdHJldHVybiBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pXG5cdFx0XHQudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChpbnB1dC5yZXNvdXJjZS5wYXRoLmVuZHNXaXRoKCcubWQnKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaW5wdXQucmVzb2x2ZSgpO1xuXHRcdFx0fSlcblx0XHRcdC50aGVuKG1vZGVsID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29udGVudCA9IG1vZGVsLm1haW47XG5cdFx0XHRcdGlmICghaW5wdXQucmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnLm1kJykpIHtcblx0XHRcdFx0XHR0aGlzLnNhZmVTZXRJbm5lckh0bWwodGhpcy5jb250ZW50LCBjb250ZW50KTtcblxuXHRcdFx0XHRcdHRoaXMudXBkYXRlU2l6ZUNsYXNzZXMoKTtcblx0XHRcdFx0XHR0aGlzLmRlY29yYXRlQ29udGVudCgpO1xuXHRcdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2godGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHRoaXMuZGVjb3JhdGVDb250ZW50KCkpKTtcblx0XHRcdFx0XHRpbnB1dC5vblJlYWR5Py4odGhpcy5jb250ZW50LmZpcnN0RWxlbWVudENoaWxkIGFzIEhUTUxFbGVtZW50LCBzdG9yZSk7XG5cdFx0XHRcdFx0dGhpcy5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0XHR0aGlzLmxvYWRUZXh0RWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZWRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlubmVyQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRpbm5lckNvbnRlbnQuY2xhc3NMaXN0LmFkZCgnd2Fsa1Rocm91Z2hDb250ZW50Jyk7IC8vIG9ubHkgZm9yIG1hcmtkb3duIGZpbGVzXG5cdFx0XHRcdGNvbnN0IG1hcmtkb3duID0gdGhpcy5leHBhbmRNYWNyb3MoY29udGVudCk7XG5cdFx0XHRcdHRoaXMuc2FmZVNldElubmVySHRtbChpbm5lckNvbnRlbnQsIG1hcmtkb3duKTtcblx0XHRcdFx0dGhpcy5jb250ZW50LmFwcGVuZENoaWxkKGlubmVyQ29udGVudCk7XG5cblx0XHRcdFx0bW9kZWwuc25pcHBldHMuZm9yRWFjaCgoc25pcHBldCwgaSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gc25pcHBldC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpZCA9IGBzbmlwcGV0LSR7bW9kZWwudXJpLmZyYWdtZW50fWA7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdFx0Y29uc3QgZGl2ID0gaW5uZXJDb250ZW50LnF1ZXJ5U2VsZWN0b3IoYCMke2lkLnJlcGxhY2UoL1tcXFxcLl0vZywgJ1xcXFwkJicpfWApIGFzIEhUTUxFbGVtZW50O1xuXG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ2V0RWRpdG9yT3B0aW9ucyhtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdFx0XHRcdGNvbnN0IHRlbGVtZXRyeURhdGEgPSB7XG5cdFx0XHRcdFx0XHR0YXJnZXQ6IHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBXYWxrVGhyb3VnaElucHV0ID8gdGhpcy5pbnB1dC5nZXRUZWxlbWV0cnlGcm9tKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzbmlwcGV0OiBpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIGRpdiwgb3B0aW9ucywge1xuXHRcdFx0XHRcdFx0dGVsZW1ldHJ5RGF0YTogdGVsZW1ldHJ5RGF0YVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGVkaXRvci5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMucHVzaChlZGl0b3IpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdXBkYXRlSGVpZ2h0ID0gKGluaXRpYWw6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gcG9zaXRpb24gPyBlZGl0b3IuZ2V0TGluZUhlaWdodEZvclBvc2l0aW9uKHBvc2l0aW9uKSA6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gYCR7TWF0aC5tYXgobW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxLCA0KSAqIGxpbmVIZWlnaHR9cHhgO1xuXHRcdFx0XHRcdFx0aWYgKGRpdi5zdHlsZS5oZWlnaHQgIT09IGhlaWdodCkge1xuXHRcdFx0XHRcdFx0XHRkaXYuc3R5bGUuaGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0XHRcdFx0XHRlZGl0b3IubGF5b3V0KCk7XG5cdFx0XHRcdFx0XHRcdGlmICghaW5pdGlhbCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHVwZGF0ZUhlaWdodCh0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB1cGRhdGVIZWlnaHQoZmFsc2UpKSk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMucHVzaChlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGlubmVyQ29udGVudCA9IHRoaXMuY29udGVudC5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRcdFx0XHRcdGlmIChpbm5lckNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0VG9wID0gZGl2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyVG9wID0gaW5uZXJDb250ZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IGVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24oZS5wb3NpdGlvbik7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVUb3AgPSAodGFyZ2V0VG9wICsgKGUucG9zaXRpb24ubGluZU51bWJlciAtIDEpICogbGluZUhlaWdodCkgLSBjb250YWluZXJUb3A7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVCb3R0b20gPSBsaW5lVG9wICsgbGluZUhlaWdodDtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsRGltZW5zaW9ucyA9IHRoaXMuc2Nyb2xsYmFyLmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzY3JvbGxUb3AgPSBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3A7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhlaWdodCA9IHNjcm9sbERpbWVuc2lvbnMuaGVpZ2h0O1xuXHRcdFx0XHRcdFx0XHRpZiAoc2Nyb2xsVG9wID4gbGluZVRvcCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBsaW5lVG9wIH0pO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHNjcm9sbFRvcCA8IGxpbmVCb3R0b20gLSBoZWlnaHQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogbGluZUJvdHRvbSAtIGhlaWdodCB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2godGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yJykgJiYgc25pcHBldC50ZXh0RWRpdG9yTW9kZWwpIHtcblx0XHRcdFx0XHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnModGhpcy5nZXRFZGl0b3JPcHRpb25zKHNuaXBwZXQudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2l6ZUNsYXNzZXMoKTtcblx0XHRcdFx0dGhpcy5tdWx0aUN1cnNvck1vZGlmaWVyKCk7XG5cdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLnB1c2godGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5tdWx0aUN1cnNvck1vZGlmaWVyJykpIHtcblx0XHRcdFx0XHRcdHRoaXMubXVsdGlDdXJzb3JNb2RpZmllcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRpbnB1dC5vblJlYWR5Py4oaW5uZXJDb250ZW50LCBzdG9yZSk7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRcdHRoaXMubG9hZFRleHRFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZWRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKEdlc3R1cmUuYWRkVGFyZ2V0KGlubmVyQ29udGVudCkpO1xuXHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5wdXNoKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbm5lckNvbnRlbnQsIFRvdWNoRXZlbnRUeXBlLkNoYW5nZSwgZSA9PiB0aGlzLm9uVG91Y2hDaGFuZ2UoZSBhcyBHZXN0dXJlRXZlbnQpKSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2FmZVNldElubmVySHRtbChub2RlOiBIVE1MRWxlbWVudCwgY29udGVudDogc3RyaW5nKSB7XG5cdFx0ZG9tU2FuaXRpemUuc2FmZVNldElubmVySHRtbChub2RlLCBjb250ZW50LCB7XG5cdFx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0XHRhdWdtZW50OiBbXG5cdFx0XHRcdFx0J2lkJyxcblx0XHRcdFx0XHQnY2xhc3MnLFxuXHRcdFx0XHRcdCdzdHlsZScsXG5cdFx0XHRcdFx0J2RhdGEtY29tbWFuZCcsXG5cdFx0XHRcdFx0J2RhdGEtaHJlZicsXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdG9yT3B0aW9ucyhsYW5ndWFnZTogc3RyaW5nKTogSUNvZGVFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCBjb25maWcgPSBkZWVwQ2xvbmUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9KSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmlzT2JqZWN0KGNvbmZpZykgPyBjb25maWcgOiBPYmplY3QuY3JlYXRlKG51bGwpLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogMTQsXG5cdFx0XHRcdGhvcml6b250YWw6ICdhdXRvJyxcblx0XHRcdFx0dXNlU2hhZG93czogdHJ1ZSxcblx0XHRcdFx0dmVydGljYWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0b3ZlcnZpZXdSdWxlckxhbmVzOiAzLFxuXHRcdFx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMSxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBleHBhbmRNYWNyb3MoaW5wdXQ6IHN0cmluZykge1xuXHRcdHJldHVybiBpbnB1dC5yZXBsYWNlKC9rYlxcKChbYS16LlxcZFxcLV0rKVxcKS9naSwgKG1hdGNoOiBzdHJpbmcsIGtiOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoa2IpO1xuXHRcdFx0Y29uc3Qgc2hvcnRjdXQgPSBrZXliaW5kaW5nID8ga2V5YmluZGluZy5nZXRMYWJlbCgpIHx8ICcnIDogVU5CT1VORF9DT01NQU5EO1xuXHRcdFx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cInNob3J0Y3V0XCI+JHtzdHJpbmdzLmVzY2FwZShzaG9ydGN1dCl9PC9zcGFuPmA7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRlY29yYXRlQ29udGVudCgpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBrZXlzID0gdGhpcy5jb250ZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5zaG9ydGN1dFtkYXRhLWNvbW1hbmRdJyk7XG5cdFx0QXJyYXkucHJvdG90eXBlLmZvckVhY2guY2FsbChrZXlzLCAoa2V5OiBFbGVtZW50KSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kID0ga2V5LmdldEF0dHJpYnV0ZSgnZGF0YS1jb21tYW5kJyk7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gY29tbWFuZCAmJiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZCk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgfHwgJycgOiBVTkJPVU5EX0NPTU1BTkQ7XG5cdFx0XHR3aGlsZSAoa2V5LmZpcnN0Q2hpbGQpIHtcblx0XHRcdFx0a2V5LmZpcnN0Q2hpbGQucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0XHRrZXkuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobGFiZWwpKTtcblx0XHR9KTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpZmtleXMgPSB0aGlzLmNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLmlmX3Nob3J0Y3V0W2RhdGEtY29tbWFuZF0nKTtcblx0XHRBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGlma2V5cywgKGtleTogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBrZXkuZ2V0QXR0cmlidXRlKCdkYXRhLWNvbW1hbmQnKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBjb21tYW5kICYmIHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kKTtcblx0XHRcdGtleS5zdHlsZS5kaXNwbGF5ID0gIWtleWJpbmRpbmcgPyAnbm9uZScgOiAnJztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbXVsdGlDdXJzb3JNb2RpZmllcigpIHtcblx0XHRjb25zdCBsYWJlbHMgPSBVSUxhYmVsUHJvdmlkZXIubW9kaWZpZXJMYWJlbHNbT1NdO1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXInKTtcblx0XHRjb25zdCBtb2RpZmllciA9IGxhYmVsc1t2YWx1ZSA9PT0gJ2N0cmxDbWQnID8gKE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gJ21ldGFLZXknIDogJ2N0cmxLZXknKSA6ICdhbHRLZXknXTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBrZXlzID0gdGhpcy5jb250ZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tdWx0aS1jdXJzb3ItbW9kaWZpZXInKTtcblx0XHRBcnJheS5wcm90b3R5cGUuZm9yRWFjaC5jYWxsKGtleXMsIChrZXk6IEVsZW1lbnQpID0+IHtcblx0XHRcdHdoaWxlIChrZXkuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHRrZXkuZmlyc3RDaGlsZC5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHRcdGtleS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShtb2RpZmllcikpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlVGV4dEVkaXRvclZpZXdTdGF0ZShpbnB1dDogV2Fsa1Rocm91Z2hJbnB1dCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblxuXHRcdHRoaXMuZWRpdG9yTWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQsIHtcblx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRzY3JvbGxUb3A6IHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCxcblx0XHRcdFx0c2Nyb2xsTGVmdDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVGV4dEVkaXRvclZpZXdTdGF0ZShpbnB1dDogV2Fsa1Rocm91Z2hJbnB1dCkge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5lZGl0b3JNZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dCk7XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbihzdGF0ZS52aWV3U3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlucHV0IGluc3RhbmNlb2YgV2Fsa1Rocm91Z2hJbnB1dCkge1xuXHRcdFx0dGhpcy5zYXZlVGV4dEVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHR9XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlucHV0IGluc3RhbmNlb2YgV2Fsa1Rocm91Z2hJbnB1dCkge1xuXHRcdFx0dGhpcy5zYXZlVGV4dEVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHR9XG5cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JGb2N1cy5yZXNldCgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLmNvbnRlbnREaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGFBQWEsZ0JBQThCLGVBQWU7QUFDbkUsU0FBUywyQkFBMkI7QUFDcEMsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFzQixTQUFTLGNBQWMsdUJBQXVCO0FBRXBFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBNEIsMEJBQTBCO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQTBEO0FBQ25FLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsSUFBSSx1QkFBdUI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBa0MscUJBQXFCLHFCQUFx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RUFBRTtBQUNoRCxVQUFNLFFBQVEsS0FBSyxxQkFBcUIsU0FBUyw0QkFBNEI7QUFDN0UsVUFBTSxXQUFXLE9BQU8sVUFBVSxZQUFhLE9BQU8sZ0JBQWdCLFlBQVksWUFBWSxZQUFhLFFBQVE7QUFFbkgsVUFBTSxPQUFPLEtBQUssUUFBUSxpQkFBaUIsd0JBQXdCO0FBQ25FLFVBQU0sVUFBVSxRQUFRLEtBQUssTUFBTSxDQUFDLFFBQWlCO0FBQ3BELGFBQU8sSUFBSSxZQUFZO0FBQ3RCLFlBQUksV0FBVyxPQUFPO0FBQUEsTUFDdkI7QUFDQSxVQUFJLFlBQVksU0FBUyxlQUFlLFFBQVEsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx3QkFBd0IsT0FBK0I7QUFDOUQsVUFBTSxpQkFBaUIsS0FBSyxVQUFVLGtCQUFrQjtBQUV4RCxTQUFLLGNBQWMsZ0JBQWdCLEtBQUssT0FBTyxPQUFPO0FBQUEsTUFDckQsV0FBVztBQUFBLFFBQ1YsV0FBVyxlQUFlO0FBQUEsUUFDMUIsWUFBWSxlQUFlO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx3QkFBd0IsT0FBeUI7QUFDeEQsVUFBTSxRQUFRLEtBQUssY0FBYyxnQkFBZ0IsS0FBSyxPQUFPLEtBQUs7QUFDbEUsUUFBSSxPQUFPO0FBQ1YsV0FBSyxVQUFVLGtCQUFrQixNQUFNLFNBQVM7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixhQUFtQjtBQUNsQyxRQUFJLEtBQUssaUJBQWlCLGtCQUFrQjtBQUMzQyxXQUFLLHdCQUF3QixLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUNBLFNBQUsscUJBQXFCLFFBQVEsS0FBSyxrQkFBa0I7QUFDekQsVUFBTSxXQUFXO0FBQUEsRUFDbEI7QUFBQSxFQUVtQixZQUFrQjtBQUNwQyxRQUFJLEtBQUssaUJBQWlCLGtCQUFrQjtBQUMzQyxXQUFLLHdCQUF3QixLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUVBLFVBQU0sVUFBVTtBQUFBLEVBQ2pCO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLFlBQVksTUFBTTtBQUN2QixTQUFLLHFCQUFxQixRQUFRLEtBQUssa0JBQWtCO0FBQ3pELFNBQUssWUFBWSxRQUFRO0FBQ3pCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQWhjYSxnQkFFSSxLQUFhO0FBRmpCLGtCQUFOO0FBQUEsRUFlSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExQlU7IiwKICAibmFtZXMiOiBbIm1vZGVsIiwgIm9wdGlvbnMiLCAiaW5uZXJDb250ZW50Il0KfQo=
