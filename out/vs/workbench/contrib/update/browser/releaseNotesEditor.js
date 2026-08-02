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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { escapeMarkdownSyntaxTokens } from "../../../../base/common/htmlContent.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { escape } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import * as nls from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asTextOrError, IRequestService } from "../../../../platform/request/common/request.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewWorkbenchService } from "../../webviewPanel/browser/webviewWorkbenchService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { getTelemetryLevel, supportsTelemetry } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { SimpleSettingRenderer } from "../../markdown/browser/markdownSettingRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../../base/common/network.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { dirname } from "../../../../base/common/resources.js";
import { asWebviewUri } from "../../webview/common/webview.js";
let ReleaseNotesManager = class extends Disposable {
  constructor(_environmentService, _keybindingService, _languageService, _openerService, _requestService, _configurationService, _editorService, _editorGroupService, _codeEditorService, _webviewWorkbenchService, _extensionService, _productService, _instantiationService) {
    super();
    this._environmentService = _environmentService;
    this._keybindingService = _keybindingService;
    this._languageService = _languageService;
    this._openerService = _openerService;
    this._requestService = _requestService;
    this._configurationService = _configurationService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._codeEditorService = _codeEditorService;
    this._webviewWorkbenchService = _webviewWorkbenchService;
    this._extensionService = _extensionService;
    this._productService = _productService;
    this._instantiationService = _instantiationService;
    this._releaseNotesCache = /* @__PURE__ */ new Map();
    this._currentReleaseNotes = void 0;
    this._register(TokenizationRegistry.onDidChange(() => {
      return this.updateHtml();
    }));
    this._register(_configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
    this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor((e) => this.onDidChangeActiveWebviewEditor(e)));
    this._simpleSettingRenderer = this._instantiationService.createInstance(SimpleSettingRenderer);
  }
  async updateHtml() {
    if (!this._currentReleaseNotes || !this._lastMeta) {
      return;
    }
    const html = await this.renderBody(this._lastMeta);
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.webview.setHtml(html);
    }
  }
  async getBase(useCurrentFile) {
    if (useCurrentFile) {
      const currentFileUri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
      if (currentFileUri) {
        return dirname(currentFileUri);
      }
    }
    return URI.parse("https://code.visualstudio.com/raw");
  }
  async show(version, useCurrentFile) {
    const releaseNoteText = await this.loadReleaseNotes(version, useCurrentFile);
    const base = await this.getBase(useCurrentFile);
    this._lastMeta = { text: releaseNoteText, base };
    const html = await this.renderBody(this._lastMeta);
    const title = nls.localize("releaseNotesInputName", "Release Notes: {0}", version);
    const activeEditorPane = this._editorService.activeEditorPane;
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.setWebviewTitle(title);
      this._currentReleaseNotes.webview.setHtml(html);
      this._webviewWorkbenchService.revealWebview(this._currentReleaseNotes, activeEditorPane ? activeEditorPane.group : this._editorGroupService.activeGroup, false);
    } else {
      this._currentReleaseNotes = this._webviewWorkbenchService.openWebview(
        {
          title,
          options: {
            tryRestoreScrollPosition: true,
            enableFindWidget: true,
            disableServiceWorker: useCurrentFile ? false : true
          },
          contentOptions: {
            localResourceRoots: useCurrentFile ? [base] : [],
            allowScripts: true
          },
          extension: void 0
        },
        "releaseNotes",
        title,
        Codicon.vscode,
        { group: ACTIVE_GROUP, preserveFocus: false }
      );
      const disposables = new DisposableStore();
      disposables.add(this._currentReleaseNotes.webview.onDidClickLink((uri) => this.onDidClickLink(URI.parse(uri))));
      disposables.add(this._currentReleaseNotes.webview.onMessage((e) => {
        if (e.message.type === "showReleaseNotes") {
          this._configurationService.updateValue("update.showReleaseNotes", e.message.value);
        } else if (e.message.type === "clickSetting") {
          const x = this._currentReleaseNotes?.webview.container.offsetLeft + e.message.value.x;
          const y = this._currentReleaseNotes?.webview.container.offsetTop + e.message.value.y;
          this._simpleSettingRenderer.updateSetting(URI.parse(e.message.value.uri), x, y);
        }
      }));
      disposables.add(this._currentReleaseNotes.onWillDispose(() => {
        disposables.dispose();
        this._currentReleaseNotes = void 0;
      }));
      this._currentReleaseNotes.webview.setHtml(html);
    }
    return true;
  }
  async loadReleaseNotes(version, useCurrentFile) {
    const match = /^(\d+\.\d+)\./.exec(version);
    if (!match) {
      throw new Error("not found");
    }
    const versionLabel = match[1].replace(/\./g, "_");
    const baseUrl = "https://code.visualstudio.com/raw";
    const url = `${baseUrl}/v${versionLabel}.md`;
    const unassigned = nls.localize("unassigned", "unassigned");
    const escapeMdHtml = (text) => {
      return escape(text).replace(/\\/g, "\\\\");
    };
    const patchKeybindings = (text) => {
      const kb = (match2, kb2) => {
        const keybinding = this._keybindingService.lookupKeybinding(kb2);
        if (!keybinding) {
          return kb2;
        }
        return keybinding.getLabel() || kb2;
      };
      const kbstyle = (match2, kb2) => {
        const keybinding = KeybindingParser.parseKeybinding(kb2);
        if (!keybinding) {
          return unassigned;
        }
        const resolvedKeybindings = this._keybindingService.resolveKeybinding(keybinding);
        if (resolvedKeybindings.length === 0) {
          return unassigned;
        }
        return resolvedKeybindings[0].getLabel() || unassigned;
      };
      const kbCode = (match2, binding) => {
        const resolved = kb(match2, binding);
        return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
      };
      const kbstyleCode = (match2, binding) => {
        const resolved = kbstyle(match2, binding);
        return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
      };
      return text.replace(/`kb\(([a-z.\d\-]+)\)`/gi, kbCode).replace(/`kbstyle\(([^\)]+)\)`/gi, kbstyleCode).replace(/kb\(([a-z.\d\-]+)\)/gi, (match2, binding) => escapeMarkdownSyntaxTokens(kb(match2, binding))).replace(/kbstyle\(([^\)]+)\)/gi, (match2, binding) => escapeMarkdownSyntaxTokens(kbstyle(match2, binding)));
    };
    const fetchReleaseNotes = async () => {
      let text;
      try {
        if (useCurrentFile) {
          const file = this._codeEditorService.getActiveCodeEditor()?.getModel()?.getValue();
          text = file ? file.substring(file.indexOf("#")) : void 0;
        } else {
          text = await asTextOrError(await this._requestService.request({ url, callSite: "releaseNotesEditor.fetchReleaseNotes" }, CancellationToken.None));
        }
      } catch {
        throw new Error("Failed to fetch release notes");
      }
      if (!text || !/^#\s/.test(text) && !useCurrentFile) {
        throw new Error("Invalid release notes");
      }
      return patchKeybindings(text);
    };
    if (useCurrentFile) {
      return fetchReleaseNotes();
    }
    if (!this._releaseNotesCache.has(version)) {
      this._releaseNotesCache.set(version, (async () => {
        try {
          return await fetchReleaseNotes();
        } catch (err) {
          this._releaseNotesCache.delete(version);
          throw err;
        }
      })());
    }
    return this._releaseNotesCache.get(version);
  }
  async onDidClickLink(uri) {
    if (uri.scheme === Schemas.codeSetting) {
    } else {
      this.addGAParameters(uri, "ReleaseNotes").then((updated) => this._openerService.open(updated, { allowCommands: ["workbench.action.openSettings", "summarize.release.notes"] })).then(void 0, onUnexpectedError);
    }
  }
  async addGAParameters(uri, origin, experiment = "1") {
    if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === TelemetryLevel.USAGE) {
      if (uri.scheme === "https" && uri.authority === "code.visualstudio.com") {
        return uri.with({ query: `${uri.query ? uri.query + "&" : ""}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_content=${encodeURIComponent(experiment)}` });
      }
    }
    return uri;
  }
  async renderBody(fileContent) {
    const nonce = generateUuid();
    const processedContent = await renderReleaseNotesMarkdown(fileContent.text, this._extensionService, this._languageService, this._simpleSettingRenderer, this._productService.quality);
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    const showReleaseNotes = Boolean(this._configurationService.getValue("update.showReleaseNotes"));
    return `<!DOCTYPE html>
		<html>
			<head>
				<base href="${asWebviewUri(fileContent.base).toString(true)}/" >
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'nonce-${nonce}' https://code.visualstudio.com; script-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}

					/* codesetting */

					code:has(.codesetting) {
						background-color: var(--vscode-textPreformat-background);
						color: var(--vscode-textPreformat-foreground);
						padding-left: 1px;
						margin-right: 3px;
						padding-right: 0px;
					}

					code:has(.codesetting):focus {
						border: 1px solid var(--vscode-button-border, transparent);
					}

					.codesetting {
						color: var(--vscode-textPreformat-foreground);
						padding: 0px 1px 1px 0px;
						font-size: 0px;
						overflow: hidden;
						text-overflow: ellipsis;
						outline-offset: 2px !important;
						box-sizing: border-box;
						text-align: center;
						cursor: pointer;
						display: inline;
						margin-right: 3px;
					}
					.codesetting svg {
						font-size: 12px;
						text-align: center;
						cursor: pointer;
						border: 1px solid var(--vscode-button-secondaryBorder, transparent);
						outline: 1px solid transparent;
						line-height: 9px;
						margin-bottom: -5px;
						padding-left: 0px;
						padding-top: 2px;
						padding-bottom: 2px;
						padding-right: 2px;
						display: inline-block;
						text-decoration: none;
						text-rendering: auto;
						text-transform: none;
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
						user-select: none;
						-webkit-user-select: none;
					}
					.codesetting .setting-name {
						font-size: 13px;
						padding-left: 2px;
						padding-right: 3px;
						padding-top: 1px;
						padding-bottom: 1px;
						margin-top: -3px;
					}
					.codesetting:hover {
						color: var(--vscode-textPreformat-foreground) !important;
						text-decoration: none !important;
					}
					code:has(.codesetting):hover {
						filter: brightness(140%);
						text-decoration: none !important;
					}
					.codesetting:focus {
						outline: 0 !important;
						text-decoration: none !important;
						color: var(--vscode-button-hoverForeground) !important;
					}
					.codesetting .separator {
						width: 1px;
						height: 14px;
						margin-bottom: -3px;
						display: inline-block;
						background-color: var(--vscode-editor-background);
						font-size: 12px;
						margin-right: 4px;
					}

					header { display: flex; align-items: center; padding-top: 1em; }

					/* Release notes enhancements from vscode-docs */
					html {
						font-size: 10px;
						height: 100%;
						overscroll-behavior: none;
					}

					body {
						margin: 0 auto;
						max-width: 980px;
						height: auto;
						overflow-y: auto;
						overscroll-behavior: none;
					}

					/* Scroll to top button */
					#scroll-to-top {
						position: fixed;
						width: 40px;
						height: 40px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-background, #444);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-hoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-foreground);
						/* Chevron up icon */
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}

					/* Header styling */
					h2 {
						margin-top: 1.2em;
						scroll-margin-top: 1.2em;
					}

					h2:not(:first-of-type) {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h3 {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h2 + h3 {
						margin-top: 0;
					}

					/* Highlights table styling */
					.highlights-table {
						border-collapse: collapse;
						border: none;
					}

					.highlights-table th {
						vertical-align: top;
						border: none;
						padding-top: 2em;
						font-weight: bold;
					}

					.highlights-table td {
						vertical-align: top;
						border: none;
					}

					.highlights-table tr:nth-child(2) td {
						padding-bottom: 1em;
					}

					/* Main content layout */
					.toc-nav-layout {
						display: flex;
						align-items: flex-start;
					}

					/* TOC Navigation */
					#toc-nav {
						position: sticky;
						top: 20px;
						width: 10vw;
						min-width: 120px;
						margin-right: 32px;
						margin-top: 2em;
					}

					#toc-nav > div {
						font-weight: bold;
						font-size: 1em;
						margin-bottom: 1em;
						text-transform: uppercase;
					}

					#toc-nav ul {
						list-style: none;
						padding: 0;
						margin: 0;
					}

					#toc-nav ul li {
						margin-bottom: 0.5em;
					}

					#toc-nav a {
						color: var(--vscode-editor-foreground, #ccc);
						text-decoration: none !important;
						transition: background-color 0.2s, color 0.2s;
						padding: 4px 6px;
						margin: -4px -6px;
						border-radius: 4px;
						display: block;
						outline: none;
					}

					#toc-nav a:hover {
						background-color: var(--vscode-button-secondaryHoverBackground, #1177bb);
						color: var(--vscode-button-secondaryForeground, #ffffff);
						cursor: pointer;
						text-decoration: none !important;
					}

					/* Main content area */
					.notes-main {
						flex: 1;
						min-width: 0;
					}

					/* Responsive breakpoint - Hide TOC on smaller screens */
					@media (max-width: 576px) {
						#toc-nav {
							display: none;
						}

						.toc-nav-layout {
							flex-direction: column;
						}

						.notes-main {
							margin-left: 0;
						}
					}

				</style>
			</head>
			<body>
				${processedContent}
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					const container = document.createElement('p');
					container.style.display = 'flex';
					container.style.alignItems = 'center';

					const input = document.createElement('input');
					input.type = 'checkbox';
					input.id = 'showReleaseNotes';
					input.checked = ${showReleaseNotes};
					container.appendChild(input);

					const label = document.createElement('label');
					label.htmlFor = 'showReleaseNotes';
					label.textContent = '${nls.localize("showOnUpdate", "Show release notes after an update")}';
					container.appendChild(label);

					const beforeElement = document.querySelector("body > h1")?.nextElementSibling;
					if (beforeElement) {
						document.body.insertBefore(container, beforeElement);
					} else {
						document.body.appendChild(container);
					}

					window.addEventListener('message', event => {
						if (event.data.type === 'showReleaseNotes') {
							input.checked = event.data.value;
						}
					});

					window.addEventListener('click', event => {
						const href = event.target.href ?? event.target.parentElement?.href ?? event.target.parentElement?.parentElement?.href;
						if (href && (href.startsWith('${Schemas.codeSetting}'))) {
							vscode.postMessage({ type: 'clickSetting', value: { uri: href, x: event.clientX, y: event.clientY }});
						}
					});

					window.addEventListener('keypress', event => {
						if (event.keyCode === 13) {
							if (event.target.children.length > 0 && event.target.children[0].href) {
								const clientRect = event.target.getBoundingClientRect();
								vscode.postMessage({ type: 'clickSetting', value: { uri: event.target.children[0].href, x: clientRect.right , y: clientRect.bottom }});
							}
						}
					});

					input.addEventListener('change', event => {
						vscode.postMessage({ type: 'showReleaseNotes', value: input.checked }, '*');
					});
				<\/script>
			</body>
		</html>`;
  }
  onDidChangeConfiguration(e) {
    if (e.affectsConfiguration("update.showReleaseNotes")) {
      this.updateCheckboxWebview();
    }
  }
  onDidChangeActiveWebviewEditor(input) {
    if (input && input === this._currentReleaseNotes) {
      this.updateCheckboxWebview();
    }
  }
  updateCheckboxWebview() {
    if (this._currentReleaseNotes) {
      this._currentReleaseNotes.webview.postMessage({
        type: "showReleaseNotes",
        value: this._configurationService.getValue("update.showReleaseNotes")
      });
    }
  }
};
ReleaseNotesManager = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IRequestService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, ICodeEditorService),
  __decorateParam(9, IWebviewWorkbenchService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IInstantiationService)
], ReleaseNotesManager);
function processConditionalBlocks(text, activeConditions) {
  return text.replace(
    /<!--\s*%IF\s+(\w+)\s*%([\s\S]*?)%ENDIF\s*%\s*-->/gi,
    (_match, condition, content) => {
      if (activeConditions.has(condition.toUpperCase())) {
        return content;
      }
      return "";
    }
  );
}
async function renderReleaseNotesMarkdown(text, extensionService, languageService, simpleSettingRenderer, quality) {
  text = text.toString().replace(/<!--\s*TOC\s*/gi, "").replace(/\s*Navigation End\s*-->/gi, "");
  const activeConditions = /* @__PURE__ */ new Set(["IN_PRODUCT"]);
  if (quality === "stable") {
    activeConditions.add("STABLE");
  } else if (quality === "insider") {
    activeConditions.add("INSIDERS");
  }
  text = processConditionalBlocks(text, activeConditions);
  return renderMarkdownDocument(text, extensionService, languageService, {
    sanitizerConfig: {
      allowRelativeMediaPaths: true,
      allowedLinkProtocols: {
        override: [Schemas.http, Schemas.https, Schemas.command, Schemas.codeSetting]
      },
      allowedTags: { augment: ["nav", "svg", "path"] },
      allowedAttributes: { augment: ["aria-role", "viewBox", "fill", "xmlns", "d"] }
    },
    markedExtensions: [{
      renderer: {
        html: simpleSettingRenderer.getHtmlRenderer(),
        codespan: simpleSettingRenderer.getCodeSpanRenderer()
      }
    }]
  });
}
export {
  ReleaseNotesManager,
  processConditionalBlocks,
  renderReleaseNotesMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3JlbGVhc2VOb3Rlc0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nUGFyc2VyLmpzJztcbmltcG9ydCB7IGVzY2FwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzVGV4dE9yRXJyb3IsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9NQVJLRE9XTl9TVFlMRVMsIHJlbmRlck1hcmtkb3duRG9jdW1lbnQgfSBmcm9tICcuLi8uLi9tYXJrZG93bi9icm93c2VyL21hcmtkb3duRG9jdW1lbnRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3SW5wdXQgfSBmcm9tICcuLi8uLi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZ2V0VGVsZW1ldHJ5TGV2ZWwsIHN1cHBvcnRzVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNpbXBsZVNldHRpbmdSZW5kZXJlciB9IGZyb20gJy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25TZXR0aW5nUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzV2Vidmlld1VyaSB9IGZyb20gJy4uLy4uL3dlYnZpZXcvY29tbW9uL3dlYnZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVsZWFzZU5vdGVzTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaW1wbGVTZXR0aW5nUmVuZGVyZXI6IFNpbXBsZVNldHRpbmdSZW5kZXJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVsZWFzZU5vdGVzQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmc+PigpO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRSZWxlYXNlTm90ZXM6IFdlYnZpZXdJbnB1dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdE1ldGE6IHsgdGV4dDogc3RyaW5nOyBiYXNlOiBVUkkgfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2Vidmlld1dvcmtiZW5jaFNlcnZpY2U6IElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFRva2VuaXphdGlvblJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLnVwZGF0ZUh0bWwoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihfY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB0aGlzLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF93ZWJ2aWV3V29ya2JlbmNoU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVdlYnZpZXdFZGl0b3IoKGUpID0+IHRoaXMub25EaWRDaGFuZ2VBY3RpdmVXZWJ2aWV3RWRpdG9yKGUpKSk7XG5cdFx0dGhpcy5fc2ltcGxlU2V0dGluZ1JlbmRlcmVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlU2V0dGluZ1JlbmRlcmVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlSHRtbCgpIHtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMgfHwgIXRoaXMuX2xhc3RNZXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGh0bWwgPSBhd2FpdCB0aGlzLnJlbmRlckJvZHkodGhpcy5fbGFzdE1ldGEpO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLndlYnZpZXcuc2V0SHRtbChodG1sKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEJhc2UodXNlQ3VycmVudEZpbGU6IGJvb2xlYW4pIHtcblx0XHRpZiAodXNlQ3VycmVudEZpbGUpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRGaWxlVXJpID0gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpPy5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRpZiAoY3VycmVudEZpbGVVcmkpIHtcblx0XHRcdFx0cmV0dXJuIGRpcm5hbWUoY3VycmVudEZpbGVVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVVJJLnBhcnNlKCdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9yYXcnKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzaG93KHZlcnNpb246IHN0cmluZywgdXNlQ3VycmVudEZpbGU6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZWxlYXNlTm90ZVRleHQgPSBhd2FpdCB0aGlzLmxvYWRSZWxlYXNlTm90ZXModmVyc2lvbiwgdXNlQ3VycmVudEZpbGUpO1xuXHRcdGNvbnN0IGJhc2UgPSBhd2FpdCB0aGlzLmdldEJhc2UodXNlQ3VycmVudEZpbGUpO1xuXHRcdHRoaXMuX2xhc3RNZXRhID0geyB0ZXh0OiByZWxlYXNlTm90ZVRleHQsIGJhc2UgfTtcblx0XHRjb25zdCBodG1sID0gYXdhaXQgdGhpcy5yZW5kZXJCb2R5KHRoaXMuX2xhc3RNZXRhKTtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgncmVsZWFzZU5vdGVzSW5wdXROYW1lJywgXCJSZWxlYXNlIE5vdGVzOiB7MH1cIiwgdmVyc2lvbik7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLnNldFdlYnZpZXdUaXRsZSh0aXRsZSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzLndlYnZpZXcuc2V0SHRtbChodG1sKTtcblx0XHRcdHRoaXMuX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLnJldmVhbFdlYnZpZXcodGhpcy5fY3VycmVudFJlbGVhc2VOb3RlcywgYWN0aXZlRWRpdG9yUGFuZSA/IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAgOiB0aGlzLl9lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAsIGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY3VycmVudFJlbGVhc2VOb3RlcyA9IHRoaXMuX3dlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLm9wZW5XZWJ2aWV3KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0dHJ5UmVzdG9yZVNjcm9sbFBvc2l0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZW5hYmxlRmluZFdpZGdldDogdHJ1ZSxcblx0XHRcdFx0XHRcdGRpc2FibGVTZXJ2aWNlV29ya2VyOiB1c2VDdXJyZW50RmlsZSA/IGZhbHNlIDogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRsb2NhbFJlc291cmNlUm9vdHM6IHVzZUN1cnJlbnRGaWxlID8gW2Jhc2VdIDogW10sXG5cdFx0XHRcdFx0XHRhbGxvd1NjcmlwdHM6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGV4dGVuc2lvbjogdW5kZWZpbmVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdyZWxlYXNlTm90ZXMnLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0Q29kaWNvbi52c2NvZGUsXG5cdFx0XHRcdHsgZ3JvdXA6IEFDVElWRV9HUk9VUCwgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcy53ZWJ2aWV3Lm9uRGlkQ2xpY2tMaW5rKHVyaSA9PiB0aGlzLm9uRGlkQ2xpY2tMaW5rKFVSSS5wYXJzZSh1cmkpKSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcy53ZWJ2aWV3Lm9uTWVzc2FnZShlID0+IHtcblx0XHRcdFx0aWYgKGUubWVzc2FnZS50eXBlID09PSAnc2hvd1JlbGVhc2VOb3RlcycpIHtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgndXBkYXRlLnNob3dSZWxlYXNlTm90ZXMnLCBlLm1lc3NhZ2UudmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUubWVzc2FnZS50eXBlID09PSAnY2xpY2tTZXR0aW5nJykge1xuXHRcdFx0XHRcdGNvbnN0IHggPSB0aGlzLl9jdXJyZW50UmVsZWFzZU5vdGVzPy53ZWJ2aWV3LmNvbnRhaW5lci5vZmZzZXRMZWZ0ICsgZS5tZXNzYWdlLnZhbHVlLng7XG5cdFx0XHRcdFx0Y29uc3QgeSA9IHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXM/LndlYnZpZXcuY29udGFpbmVyLm9mZnNldFRvcCArIGUubWVzc2FnZS52YWx1ZS55O1xuXHRcdFx0XHRcdHRoaXMuX3NpbXBsZVNldHRpbmdSZW5kZXJlci51cGRhdGVTZXR0aW5nKFVSSS5wYXJzZShlLm1lc3NhZ2UudmFsdWUudXJpKSwgeCwgeSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFJlbGVhc2VOb3RlcyA9IHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fY3VycmVudFJlbGVhc2VOb3Rlcy53ZWJ2aWV3LnNldEh0bWwoaHRtbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRSZWxlYXNlTm90ZXModmVyc2lvbjogc3RyaW5nLCB1c2VDdXJyZW50RmlsZTogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXihcXGQrXFwuXFxkKylcXC4vLmV4ZWModmVyc2lvbik7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uTGFiZWwgPSBtYXRjaFsxXS5yZXBsYWNlKC9cXC4vZywgJ18nKTtcblx0XHRjb25zdCBiYXNlVXJsID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL3Jhdyc7XG5cdFx0Y29uc3QgdXJsID0gYCR7YmFzZVVybH0vdiR7dmVyc2lvbkxhYmVsfS5tZGA7XG5cdFx0Y29uc3QgdW5hc3NpZ25lZCA9IG5scy5sb2NhbGl6ZSgndW5hc3NpZ25lZCcsIFwidW5hc3NpZ25lZFwiKTtcblxuXHRcdGNvbnN0IGVzY2FwZU1kSHRtbCA9ICh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuXHRcdFx0cmV0dXJuIGVzY2FwZSh0ZXh0KS5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpO1xuXHRcdH07XG5cblx0XHRjb25zdCBwYXRjaEtleWJpbmRpbmdzID0gKHRleHQ6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBrYiA9IChtYXRjaDogc3RyaW5nLCBrYjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGtiKTtcblxuXHRcdFx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4ga2I7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ga2V5YmluZGluZy5nZXRMYWJlbCgpIHx8IGtiO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qga2JzdHlsZSA9IChtYXRjaDogc3RyaW5nLCBrYjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBLZXliaW5kaW5nUGFyc2VyLnBhcnNlS2V5YmluZGluZyhrYik7XG5cblx0XHRcdFx0aWYgKCFrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuYXNzaWduZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UucmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZyk7XG5cblx0XHRcdFx0aWYgKHJlc29sdmVkS2V5YmluZGluZ3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuYXNzaWduZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRLZXliaW5kaW5nc1swXS5nZXRMYWJlbCgpIHx8IHVuYXNzaWduZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBrYkNvZGUgPSAobWF0Y2g6IHN0cmluZywgYmluZGluZzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0ga2IobWF0Y2gsIGJpbmRpbmcpO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQgPyBgPGNvZGUgdGl0bGU9XCIke2JpbmRpbmd9XCI+JHtlc2NhcGVNZEh0bWwocmVzb2x2ZWQpfTwvY29kZT5gIDogcmVzb2x2ZWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBrYnN0eWxlQ29kZSA9IChtYXRjaDogc3RyaW5nLCBiaW5kaW5nOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBrYnN0eWxlKG1hdGNoLCBiaW5kaW5nKTtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkID8gYDxjb2RlIHRpdGxlPVwiJHtiaW5kaW5nfVwiPiR7ZXNjYXBlTWRIdG1sKHJlc29sdmVkKX08L2NvZGU+YCA6IHJlc29sdmVkO1xuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHRleHRcblx0XHRcdFx0LnJlcGxhY2UoL2BrYlxcKChbYS16LlxcZFxcLV0rKVxcKWAvZ2ksIGtiQ29kZSlcblx0XHRcdFx0LnJlcGxhY2UoL2BrYnN0eWxlXFwoKFteXFwpXSspXFwpYC9naSwga2JzdHlsZUNvZGUpXG5cdFx0XHRcdC5yZXBsYWNlKC9rYlxcKChbYS16LlxcZFxcLV0rKVxcKS9naSwgKG1hdGNoLCBiaW5kaW5nKSA9PiBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhrYihtYXRjaCwgYmluZGluZykpKVxuXHRcdFx0XHQucmVwbGFjZSgva2JzdHlsZVxcKChbXlxcKV0rKVxcKS9naSwgKG1hdGNoLCBiaW5kaW5nKSA9PiBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhrYnN0eWxlKG1hdGNoLCBiaW5kaW5nKSkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBmZXRjaFJlbGVhc2VOb3RlcyA9IGFzeW5jICgpID0+IHtcblx0XHRcdGxldCB0ZXh0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHVzZUN1cnJlbnRGaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZSA9IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKT8uZ2V0TW9kZWwoKT8uZ2V0VmFsdWUoKTtcblx0XHRcdFx0XHR0ZXh0ID0gZmlsZSA/IGZpbGUuc3Vic3RyaW5nKGZpbGUuaW5kZXhPZignIycpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihhd2FpdCB0aGlzLl9yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHsgdXJsLCBjYWxsU2l0ZTogJ3JlbGVhc2VOb3Rlc0VkaXRvci5mZXRjaFJlbGVhc2VOb3RlcycgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggcmVsZWFzZSBub3RlcycpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRleHQgfHwgKCEvXiNcXHMvLnRlc3QodGV4dCkgJiYgIXVzZUN1cnJlbnRGaWxlKSkgeyAvLyByZWxlYXNlIG5vdGVzIGFsd2F5cyBzdGFydHMgd2l0aCBgI2AgZm9sbG93ZWQgYnkgd2hpdGVzcGFjZSwgZXhjZXB0IHdoZW4gdXNpbmcgdGhlIGN1cnJlbnQgZmlsZVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcmVsZWFzZSBub3RlcycpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGF0Y2hLZXliaW5kaW5ncyh0ZXh0KTtcblx0XHR9O1xuXG5cdFx0Ly8gRG9uJ3QgY2FjaGUgdGhlIGN1cnJlbnQgZmlsZVxuXHRcdGlmICh1c2VDdXJyZW50RmlsZSkge1xuXHRcdFx0cmV0dXJuIGZldGNoUmVsZWFzZU5vdGVzKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcmVsZWFzZU5vdGVzQ2FjaGUuaGFzKHZlcnNpb24pKSB7XG5cdFx0XHR0aGlzLl9yZWxlYXNlTm90ZXNDYWNoZS5zZXQodmVyc2lvbiwgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgZmV0Y2hSZWxlYXNlTm90ZXMoKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVsZWFzZU5vdGVzQ2FjaGUuZGVsZXRlKHZlcnNpb24pO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlbGVhc2VOb3Rlc0NhY2hlLmdldCh2ZXJzaW9uKSE7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQ2xpY2tMaW5rKHVyaTogVVJJKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuY29kZVNldHRpbmcpIHtcblx0XHRcdC8vIGhhbmRsZWQgaW4gcmVjZWl2ZSBtZXNzYWdlXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWRkR0FQYXJhbWV0ZXJzKHVyaSwgJ1JlbGVhc2VOb3RlcycpXG5cdFx0XHRcdC50aGVuKHVwZGF0ZWQgPT4gdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHVwZGF0ZWQsIHsgYWxsb3dDb21tYW5kczogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsICdzdW1tYXJpemUucmVsZWFzZS5ub3RlcyddIH0pKVxuXHRcdFx0XHQudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZEdBUGFyYW1ldGVycyh1cmk6IFVSSSwgb3JpZ2luOiBzdHJpbmcsIGV4cGVyaW1lbnQgPSAnMScpOiBQcm9taXNlPFVSST4ge1xuXHRcdGlmIChzdXBwb3J0c1RlbGVtZXRyeSh0aGlzLl9wcm9kdWN0U2VydmljZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKSAmJiBnZXRUZWxlbWV0cnlMZXZlbCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFRlbGVtZXRyeUxldmVsLlVTQUdFKSB7XG5cdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2h0dHBzJyAmJiB1cmkuYXV0aG9yaXR5ID09PSAnY29kZS52aXN1YWxzdHVkaW8uY29tJykge1xuXHRcdFx0XHRyZXR1cm4gdXJpLndpdGgoeyBxdWVyeTogYCR7dXJpLnF1ZXJ5ID8gdXJpLnF1ZXJ5ICsgJyYnIDogJyd9dXRtX3NvdXJjZT1Wc0NvZGUmdXRtX21lZGl1bT0ke2VuY29kZVVSSUNvbXBvbmVudChvcmlnaW4pfSZ1dG1fY29udGVudD0ke2VuY29kZVVSSUNvbXBvbmVudChleHBlcmltZW50KX1gIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJCb2R5KGZpbGVDb250ZW50OiB7IHRleHQ6IHN0cmluZzsgYmFzZTogVVJJIH0pIHtcblx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0Y29uc3QgcHJvY2Vzc2VkQ29udGVudCA9IGF3YWl0IHJlbmRlclJlbGVhc2VOb3Rlc01hcmtkb3duKGZpbGVDb250ZW50LnRleHQsIHRoaXMuX2V4dGVuc2lvblNlcnZpY2UsIHRoaXMuX2xhbmd1YWdlU2VydmljZSwgdGhpcy5fc2ltcGxlU2V0dGluZ1JlbmRlcmVyLCB0aGlzLl9wcm9kdWN0U2VydmljZS5xdWFsaXR5KTtcblxuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblx0XHRjb25zdCBjc3MgPSBjb2xvck1hcCA/IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApIDogJyc7XG5cdFx0Y29uc3Qgc2hvd1JlbGVhc2VOb3RlcyA9IEJvb2xlYW4odGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3VwZGF0ZS5zaG93UmVsZWFzZU5vdGVzJykpO1xuXG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cblx0XHQ8aHRtbD5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8YmFzZSBocmVmPVwiJHthc1dlYnZpZXdVcmkoZmlsZUNvbnRlbnQuYmFzZSkudG9TdHJpbmcodHJ1ZSl9L1wiID5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtdHlwZVwiIGNvbnRlbnQ9XCJ0ZXh0L2h0bWw7Y2hhcnNldD1VVEYtOFwiPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiZGVmYXVsdC1zcmMgJ25vbmUnOyBpbWctc3JjIGh0dHBzOiBkYXRhOjsgbWVkaWEtc3JjIGh0dHBzOjsgc3R5bGUtc3JjICdub25jZS0ke25vbmNlfScgaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb207IHNjcmlwdC1zcmMgJ25vbmNlLSR7bm9uY2V9JztcIj5cblx0XHRcdFx0PHN0eWxlIG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0XHQke0RFRkFVTFRfTUFSS0RPV05fU1RZTEVTfVxuXHRcdFx0XHRcdCR7Y3NzfVxuXG5cdFx0XHRcdFx0LyogY29kZXNldHRpbmcgKi9cblxuXHRcdFx0XHRcdGNvZGU6aGFzKC5jb2Rlc2V0dGluZykge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLXRleHRQcmVmb3JtYXQtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLXRleHRQcmVmb3JtYXQtZm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWxlZnQ6IDFweDtcblx0XHRcdFx0XHRcdG1hcmdpbi1yaWdodDogM3B4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogMHB4O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvZGU6aGFzKC5jb2Rlc2V0dGluZyk6Zm9jdXMge1xuXHRcdFx0XHRcdFx0Ym9yZGVyOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLWJ1dHRvbi1ib3JkZXIsIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQuY29kZXNldHRpbmcge1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS10ZXh0UHJlZm9ybWF0LWZvcmVncm91bmQpO1xuXHRcdFx0XHRcdFx0cGFkZGluZzogMHB4IDFweCAxcHggMHB4O1xuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiAwcHg7XG5cdFx0XHRcdFx0XHRvdmVyZmxvdzogaGlkZGVuO1xuXHRcdFx0XHRcdFx0dGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG5cdFx0XHRcdFx0XHRvdXRsaW5lLW9mZnNldDogMnB4ICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0XHRcdFx0dGV4dC1hbGlnbjogY2VudGVyO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogaW5saW5lO1xuXHRcdFx0XHRcdFx0bWFyZ2luLXJpZ2h0OiAzcHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC5jb2Rlc2V0dGluZyBzdmcge1xuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiAxMnB4O1xuXHRcdFx0XHRcdFx0dGV4dC1hbGlnbjogY2VudGVyO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdFx0Ym9yZGVyOiAxcHggc29saWQgdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCb3JkZXIsIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0XHRcdG91dGxpbmU6IDFweCBzb2xpZCB0cmFuc3BhcmVudDtcblx0XHRcdFx0XHRcdGxpbmUtaGVpZ2h0OiA5cHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tYm90dG9tOiAtNXB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1sZWZ0OiAwcHg7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXRvcDogMnB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDJweDtcblx0XHRcdFx0XHRcdHBhZGRpbmctcmlnaHQ6IDJweDtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGlubGluZS1ibG9jaztcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZTtcblx0XHRcdFx0XHRcdHRleHQtcmVuZGVyaW5nOiBhdXRvO1xuXHRcdFx0XHRcdFx0dGV4dC10cmFuc2Zvcm06IG5vbmU7XG5cdFx0XHRcdFx0XHQtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBhbnRpYWxpYXNlZDtcblx0XHRcdFx0XHRcdC1tb3otb3N4LWZvbnQtc21vb3RoaW5nOiBncmF5c2NhbGU7XG5cdFx0XHRcdFx0XHR1c2VyLXNlbGVjdDogbm9uZTtcblx0XHRcdFx0XHRcdC13ZWJraXQtdXNlci1zZWxlY3Q6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC5jb2Rlc2V0dGluZyAuc2V0dGluZy1uYW1lIHtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMTNweDtcblx0XHRcdFx0XHRcdHBhZGRpbmctbGVmdDogMnB4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogM3B4O1xuXHRcdFx0XHRcdFx0cGFkZGluZy10b3A6IDFweDtcblx0XHRcdFx0XHRcdHBhZGRpbmctYm90dG9tOiAxcHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiAtM3B4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQuY29kZXNldHRpbmc6aG92ZXIge1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS10ZXh0UHJlZm9ybWF0LWZvcmVncm91bmQpICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0XHR0ZXh0LWRlY29yYXRpb246IG5vbmUgIWltcG9ydGFudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29kZTpoYXMoLmNvZGVzZXR0aW5nKTpob3ZlciB7XG5cdFx0XHRcdFx0XHRmaWx0ZXI6IGJyaWdodG5lc3MoMTQwJSk7XG5cdFx0XHRcdFx0XHR0ZXh0LWRlY29yYXRpb246IG5vbmUgIWltcG9ydGFudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0LmNvZGVzZXR0aW5nOmZvY3VzIHtcblx0XHRcdFx0XHRcdG91dGxpbmU6IDAgIWltcG9ydGFudDtcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1idXR0b24taG92ZXJGb3JlZ3JvdW5kKSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQuY29kZXNldHRpbmcgLnNlcGFyYXRvciB7XG5cdFx0XHRcdFx0XHR3aWR0aDogMXB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxNHB4O1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJvdHRvbTogLTNweDtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGlubGluZS1ibG9jaztcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDEycHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tcmlnaHQ6IDRweDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRoZWFkZXIgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBwYWRkaW5nLXRvcDogMWVtOyB9XG5cblx0XHRcdFx0XHQvKiBSZWxlYXNlIG5vdGVzIGVuaGFuY2VtZW50cyBmcm9tIHZzY29kZS1kb2NzICovXG5cdFx0XHRcdFx0aHRtbCB7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDEwcHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDEwMCU7XG5cdFx0XHRcdFx0XHRvdmVyc2Nyb2xsLWJlaGF2aW9yOiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJvZHkge1xuXHRcdFx0XHRcdFx0bWFyZ2luOiAwIGF1dG87XG5cdFx0XHRcdFx0XHRtYXgtd2lkdGg6IDk4MHB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiBhdXRvO1xuXHRcdFx0XHRcdFx0b3ZlcmZsb3cteTogYXV0bztcblx0XHRcdFx0XHRcdG92ZXJzY3JvbGwtYmVoYXZpb3I6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LyogU2Nyb2xsIHRvIHRvcCBidXR0b24gKi9cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdFx0XHR3aWR0aDogNDBweDtcblx0XHRcdFx0XHRcdGhlaWdodDogNDBweDtcblx0XHRcdFx0XHRcdHJpZ2h0OiAyNXB4O1xuXHRcdFx0XHRcdFx0Ym90dG9tOiAyNXB4O1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1iYWNrZ3JvdW5kLCAjNDQ0KTtcblx0XHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1ib3JkZXIpO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXJhZGl1czogNTAlO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMXB4IDFweCAxcHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdFx0b3V0bGluZTogbm9uZTtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0XHRcdGFsaWduLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3A6aG92ZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1ob3ZlckJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMnB4IDJweCAycHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJvZHkudnNjb2RlLWhpZ2gtY29udHJhc3QgI3Njcm9sbC10by10b3Age1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXdpZHRoOiAycHg7XG5cdFx0XHRcdFx0XHRib3JkZXItc3R5bGU6IHNvbGlkO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCBzcGFuLmljb246OmJlZm9yZSB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBcIlwiO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiB2YXIoLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQpO1xuXHRcdFx0XHRcdFx0LyogQ2hldnJvbiB1cCBpY29uICovXG5cdFx0XHRcdFx0XHQtd2Via2l0LW1hc2staW1hZ2U6IHVybCgnZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQRDk0Yld3Z2RtVnljMmx2YmowaU1TNHdJaUJsYm1OdlpHbHVaejBpZFhSbUxUZ2lQejRLUENFdExTQkhaVzVsY21GMGIzSTZJRUZrYjJKbElFbHNiSFZ6ZEhKaGRHOXlJREU1TGpJdU1Dd2dVMVpISUVWNGNHOXlkQ0JRYkhWbkxVbHVJQzRnVTFaSElGWmxjbk5wYjI0NklEWXVNREFnUW5WcGJHUWdNQ2tnSUMwdFBnbzhjM1puSUhabGNuTnBiMjQ5SWpFdU1TSWdhV1E5SWt4aGVXVnlYekVpSUhodGJHNXpQU0pvZEhSd09pOHZkM2QzTG5jekxtOXlaeTh5TURBd0wzTjJaeUlnZUcxc2JuTTZlR3hwYm1zOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6RTVPVGt2ZUd4cGJtc2lJSGc5SWpCd2VDSWdlVDBpTUhCNElnb0pJSFpwWlhkQ2IzZzlJakFnTUNBeE5pQXhOaUlnYzNSNWJHVTlJbVZ1WVdKc1pTMWlZV05yWjNKdmRXNWtPbTVsZHlBd0lEQWdNVFlnTVRZN0lpQjRiV3c2YzNCaFkyVTlJbkJ5WlhObGNuWmxJajRLUEhOMGVXeGxJSFI1Y0dVOUluUmxlSFF2WTNOeklqNEtDUzV6ZERCN1ptbHNiRG9qUmtaR1JrWkdPMzBLQ1M1emRERjdabWxzYkRwdWIyNWxPMzBLUEM5emRIbHNaVDRLUEhScGRHeGxQblZ3WTJobGRuSnZiand2ZEdsMGJHVStDanh3WVhSb0lHTnNZWE56UFNKemREQWlJR1E5SWswNExEVXVNV3d0Tnk0ekxEY3VNMHd3TERFeExqWnNPQzA0YkRnc09Hd3RNQzQzTERBdU4wdzRMRFV1TVhvaUx6NEtQSEpsWTNRZ1kyeGhjM005SW5OME1TSWdkMmxrZEdnOUlqRTJJaUJvWldsbmFIUTlJakUySWk4K0Nqd3ZjM1puUGdvPScpO1xuXHRcdFx0XHRcdFx0bWFzay1pbWFnZTogdXJsKCdkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBEOTRiV3dnZG1WeWMybHZiajBpTVM0d0lpQmxibU52WkdsdVp6MGlkWFJtTFRnaVB6NEtQQ0V0TFNCSFpXNWxjbUYwYjNJNklFRmtiMkpsSUVsc2JIVnpkSEpoZEc5eUlERTVMakl1TUN3Z1UxWkhJRVY0Y0c5eWRDQlFiSFZuTFVsdUlDNGdVMVpISUZabGNuTnBiMjQ2SURZdU1EQWdRblZwYkdRZ01Da2dJQzB0UGdvOGMzWm5JSFpsY25OcGIyNDlJakV1TVNJZ2FXUTlJa3hoZVdWeVh6RWlJSGh0Ykc1elBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHlNREF3TDNOMlp5SWdlRzFzYm5NNmVHeHBibXM5SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpFNU9Ua3ZlR3hwYm1zaUlIZzlJakJ3ZUNJZ2VUMGlNSEI0SWdvSklIWnBaWGRDYjNnOUlqQWdNQ0F4TmlBeE5pSWdjM1I1YkdVOUltVnVZV0pzWlMxaVlXTnJaM0p2ZFc1a09tNWxkeUF3SURBZ01UWWdNVFk3SWlCNGJXdzZjM0JoWTJVOUluQnlaWE5sY25abElqNEtQSE4wZVd4bElIUjVjR1U5SW5SbGVIUXZZM056SWo0S0NTNXpkREI3Wm1sc2JEb2pSa1pHUmtaR08zMEtDUzV6ZERGN1ptbHNiRHB1YjI1bE8zMEtQQzl6ZEhsc1pUNEtQSFJwZEd4bFBuVndZMmhsZG5KdmJqd3ZkR2wwYkdVK0NqeHdZWFJvSUdOc1lYTnpQU0p6ZERBaUlHUTlJazA0TERVdU1Xd3ROeTR6TERjdU0wd3dMREV4TGpac09DMDRiRGdzT0d3dE1DNDNMREF1TjB3NExEVXVNWG9pTHo0S1BISmxZM1FnWTJ4aGMzTTlJbk4wTVNJZ2QybGtkR2c5SWpFMklpQm9aV2xuYUhROUlqRTJJaTgrQ2p3dmMzWm5QZ289Jyk7XG5cdFx0XHRcdFx0XHR3aWR0aDogMTZweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMTZweDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBIZWFkZXIgc3R5bGluZyAqL1xuXHRcdFx0XHRcdGgyIHtcblx0XHRcdFx0XHRcdG1hcmdpbi10b3A6IDEuMmVtO1xuXHRcdFx0XHRcdFx0c2Nyb2xsLW1hcmdpbi10b3A6IDEuMmVtO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGgyOm5vdCg6Zmlyc3Qtb2YtdHlwZSkge1xuXHRcdFx0XHRcdFx0bWFyZ2luLXRvcDogNGVtO1xuXHRcdFx0XHRcdFx0c2Nyb2xsLW1hcmdpbi10b3A6IDFlbTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRoMyB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiA0ZW07XG5cdFx0XHRcdFx0XHRzY3JvbGwtbWFyZ2luLXRvcDogMWVtO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGgyICsgaDMge1xuXHRcdFx0XHRcdFx0bWFyZ2luLXRvcDogMDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBIaWdobGlnaHRzIHRhYmxlIHN0eWxpbmcgKi9cblx0XHRcdFx0XHQuaGlnaGxpZ2h0cy10YWJsZSB7XG5cdFx0XHRcdFx0XHRib3JkZXItY29sbGFwc2U6IGNvbGxhcHNlO1xuXHRcdFx0XHRcdFx0Ym9yZGVyOiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC5oaWdobGlnaHRzLXRhYmxlIHRoIHtcblx0XHRcdFx0XHRcdHZlcnRpY2FsLWFsaWduOiB0b3A7XG5cdFx0XHRcdFx0XHRib3JkZXI6IG5vbmU7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXRvcDogMmVtO1xuXHRcdFx0XHRcdFx0Zm9udC13ZWlnaHQ6IGJvbGQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LmhpZ2hsaWdodHMtdGFibGUgdGQge1xuXHRcdFx0XHRcdFx0dmVydGljYWwtYWxpZ246IHRvcDtcblx0XHRcdFx0XHRcdGJvcmRlcjogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQuaGlnaGxpZ2h0cy10YWJsZSB0cjpudGgtY2hpbGQoMikgdGQge1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDFlbTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBNYWluIGNvbnRlbnQgbGF5b3V0ICovXG5cdFx0XHRcdFx0LnRvYy1uYXYtbGF5b3V0IHtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRhbGlnbi1pdGVtczogZmxleC1zdGFydDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBUT0MgTmF2aWdhdGlvbiAqL1xuXHRcdFx0XHRcdCN0b2MtbmF2IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBzdGlja3k7XG5cdFx0XHRcdFx0XHR0b3A6IDIwcHg7XG5cdFx0XHRcdFx0XHR3aWR0aDogMTB2dztcblx0XHRcdFx0XHRcdG1pbi13aWR0aDogMTIwcHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tcmlnaHQ6IDMycHg7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiAyZW07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3RvYy1uYXYgPiBkaXYge1xuXHRcdFx0XHRcdFx0Zm9udC13ZWlnaHQ6IGJvbGQ7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDFlbTtcblx0XHRcdFx0XHRcdG1hcmdpbi1ib3R0b206IDFlbTtcblx0XHRcdFx0XHRcdHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3RvYy1uYXYgdWwge1xuXHRcdFx0XHRcdFx0bGlzdC1zdHlsZTogbm9uZTtcblx0XHRcdFx0XHRcdHBhZGRpbmc6IDA7XG5cdFx0XHRcdFx0XHRtYXJnaW46IDA7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3RvYy1uYXYgdWwgbGkge1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJvdHRvbTogMC41ZW07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3RvYy1uYXYgYSB7XG5cdFx0XHRcdFx0XHRjb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1mb3JlZ3JvdW5kLCAjY2NjKTtcblx0XHRcdFx0XHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZSAhaW1wb3J0YW50O1xuXHRcdFx0XHRcdFx0dHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjJzLCBjb2xvciAwLjJzO1xuXHRcdFx0XHRcdFx0cGFkZGluZzogNHB4IDZweDtcblx0XHRcdFx0XHRcdG1hcmdpbjogLTRweCAtNnB4O1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXJhZGl1czogNHB4O1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0XHRvdXRsaW5lOiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCN0b2MtbmF2IGE6aG92ZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQsICMxMTc3YmIpO1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5Rm9yZWdyb3VuZCwgI2ZmZmZmZik7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdFx0XHR0ZXh0LWRlY29yYXRpb246IG5vbmUgIWltcG9ydGFudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvKiBNYWluIGNvbnRlbnQgYXJlYSAqL1xuXHRcdFx0XHRcdC5ub3Rlcy1tYWluIHtcblx0XHRcdFx0XHRcdGZsZXg6IDE7XG5cdFx0XHRcdFx0XHRtaW4td2lkdGg6IDA7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LyogUmVzcG9uc2l2ZSBicmVha3BvaW50IC0gSGlkZSBUT0Mgb24gc21hbGxlciBzY3JlZW5zICovXG5cdFx0XHRcdFx0QG1lZGlhIChtYXgtd2lkdGg6IDU3NnB4KSB7XG5cdFx0XHRcdFx0XHQjdG9jLW5hdiB7XG5cdFx0XHRcdFx0XHRcdGRpc3BsYXk6IG5vbmU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC50b2MtbmF2LWxheW91dCB7XG5cdFx0XHRcdFx0XHRcdGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC5ub3Rlcy1tYWluIHtcblx0XHRcdFx0XHRcdFx0bWFyZ2luLWxlZnQ6IDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdDwvc3R5bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0JHtwcm9jZXNzZWRDb250ZW50fVxuXHRcdFx0XHQ8c2NyaXB0IG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0XHRjb25zdCB2c2NvZGUgPSBhY3F1aXJlVnNDb2RlQXBpKCk7XG5cdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG5cdFx0XHRcdFx0aW5wdXQudHlwZSA9ICdjaGVja2JveCc7XG5cdFx0XHRcdFx0aW5wdXQuaWQgPSAnc2hvd1JlbGVhc2VOb3Rlcyc7XG5cdFx0XHRcdFx0aW5wdXQuY2hlY2tlZCA9ICR7c2hvd1JlbGVhc2VOb3Rlc307XG5cdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGlucHV0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGFiZWwnKTtcblx0XHRcdFx0XHRsYWJlbC5odG1sRm9yID0gJ3Nob3dSZWxlYXNlTm90ZXMnO1xuXHRcdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gJyR7bmxzLmxvY2FsaXplKCdzaG93T25VcGRhdGUnLCBcIlNob3cgcmVsZWFzZSBub3RlcyBhZnRlciBhbiB1cGRhdGVcIil9Jztcblx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0XHRcdFx0Y29uc3QgYmVmb3JlRWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJib2R5ID4gaDFcIik/Lm5leHRFbGVtZW50U2libGluZztcblx0XHRcdFx0XHRpZiAoYmVmb3JlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuYm9keS5pbnNlcnRCZWZvcmUoY29udGFpbmVyLCBiZWZvcmVFbGVtZW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ3Nob3dSZWxlYXNlTm90ZXMnKSB7XG5cdFx0XHRcdFx0XHRcdGlucHV0LmNoZWNrZWQgPSBldmVudC5kYXRhLnZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaHJlZiA9IGV2ZW50LnRhcmdldC5ocmVmID8/IGV2ZW50LnRhcmdldC5wYXJlbnRFbGVtZW50Py5ocmVmID8/IGV2ZW50LnRhcmdldC5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50Py5ocmVmO1xuXHRcdFx0XHRcdFx0aWYgKGhyZWYgJiYgKGhyZWYuc3RhcnRzV2l0aCgnJHtTY2hlbWFzLmNvZGVTZXR0aW5nfScpKSkge1xuXHRcdFx0XHRcdFx0XHR2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAnY2xpY2tTZXR0aW5nJywgdmFsdWU6IHsgdXJpOiBocmVmLCB4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZIH19KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGV2ZW50ID0+IHtcblx0XHRcdFx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSAxMykge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXZlbnQudGFyZ2V0LmNoaWxkcmVuLmxlbmd0aCA+IDAgJiYgZXZlbnQudGFyZ2V0LmNoaWxkcmVuWzBdLmhyZWYpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjbGllbnRSZWN0ID0gZXZlbnQudGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdFx0XHRcdHZzY29kZS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdjbGlja1NldHRpbmcnLCB2YWx1ZTogeyB1cmk6IGV2ZW50LnRhcmdldC5jaGlsZHJlblswXS5ocmVmLCB4OiBjbGllbnRSZWN0LnJpZ2h0ICwgeTogY2xpZW50UmVjdC5ib3R0b20gfX0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldmVudCA9PiB7XG5cdFx0XHRcdFx0XHR2c2NvZGUucG9zdE1lc3NhZ2UoeyB0eXBlOiAnc2hvd1JlbGVhc2VOb3RlcycsIHZhbHVlOiBpbnB1dC5jaGVja2VkIH0sICcqJyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdDwvc2NyaXB0PlxuXHRcdFx0PC9ib2R5PlxuXHRcdDwvaHRtbD5gO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd1cGRhdGUuc2hvd1JlbGVhc2VOb3RlcycpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoZWNrYm94V2VidmlldygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VBY3RpdmVXZWJ2aWV3RWRpdG9yKGlucHV0OiBXZWJ2aWV3SW5wdXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoaW5wdXQgJiYgaW5wdXQgPT09IHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hXZWJ2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGVja2JveFdlYnZpZXcoKSB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZWxlYXNlTm90ZXMud2Vidmlldy5wb3N0TWVzc2FnZSh7XG5cdFx0XHRcdHR5cGU6ICdzaG93UmVsZWFzZU5vdGVzJyxcblx0XHRcdFx0dmFsdWU6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd1cGRhdGUuc2hvd1JlbGVhc2VOb3RlcycpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBQcm9jZXNzZXMgY29uZGl0aW9uYWwgYmxvY2tzIGluIHRoZSByZWxlYXNlIG5vdGVzIG1hcmtkb3duLlxuICpcbiAqIENvbmRpdGlvbmFsIGJsb2NrcyB1c2UgYSBzaW5nbGUgSFRNTCBjb21tZW50IHdpdGggdGhlIGZvcm1hdDpcbiAqIGBgYFxuICogPCEtLSAlSUYgQ09ORElUSU9OICVcbiAqIENvbnRlbnQgb25seSB2aXNpYmxlIHdoZW4gQ09ORElUSU9OIGlzIGFjdGl2ZS5cbiAqICVFTkRJRiAlIC0tPlxuICogYGBgXG4gKlxuICogU3VwcG9ydGVkIGNvbmRpdGlvbnM6XG4gKiAtIGBJTl9QUk9EVUNUYCAtIENvbnRlbnQgc2hvd24gaW4gVlMgQ29kZSAoYm90aCBTdGFibGUgYW5kIEluc2lkZXJzKVxuICogLSBgV0VCYCAtIENvbnRlbnQgc2hvd24gb24gdGhlIHdlYnNpdGUgb25seVxuICogLSBgU1RBQkxFYCAtIENvbnRlbnQgc2hvd24gaW4gVlMgQ29kZSBTdGFibGUgb25seVxuICogLSBgSU5TSURFUlNgIC0gQ29udGVudCBzaG93biBpbiBWUyBDb2RlIEluc2lkZXJzIG9ubHlcbiAqXG4gKiBPbiB0aGUgd2Vic2l0ZSwgdGhlIGVudGlyZSBibG9jayBpcyBhIHNpbmdsZSBIVE1MIGNvbW1lbnQsIHNvIHRoZVxuICogY29udGVudCBpcyBoaWRkZW4gYnkgZGVmYXVsdC4gVGhlIHdlYnNpdGUgcmVuZGVyZXIgd291bGQgYWN0aXZhdGVcbiAqIGBXRUJgIGJsb2NrcyBieSBzdHJpcHBpbmcgdGhlIGNvbW1lbnQgbWFya2Vycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NDb25kaXRpb25hbEJsb2Nrcyh0ZXh0OiBzdHJpbmcsIGFjdGl2ZUNvbmRpdGlvbnM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBzdHJpbmcge1xuXHRyZXR1cm4gdGV4dC5yZXBsYWNlKFxuXHRcdC88IS0tXFxzKiVJRlxccysoXFx3KylcXHMqJShbXFxzXFxTXSo/KSVFTkRJRlxccyolXFxzKi0tPi9naSxcblx0XHQoX21hdGNoLCBjb25kaXRpb246IHN0cmluZywgY29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoYWN0aXZlQ29uZGl0aW9ucy5oYXMoY29uZGl0aW9uLnRvVXBwZXJDYXNlKCkpKSB7XG5cdFx0XHRcdC8vIFN0cmlwIGNvbW1lbnQgbWFya2VycywgcmV2ZWFsIGNvbnRlbnRcblx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZW1vdmUgdGhlIGVudGlyZSBibG9ja1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbmRlclJlbGVhc2VOb3Rlc01hcmtkb3duKFxuXHR0ZXh0OiBzdHJpbmcsXG5cdGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdHNpbXBsZVNldHRpbmdSZW5kZXJlcjogU2ltcGxlU2V0dGluZ1JlbmRlcmVyLFxuXHRxdWFsaXR5Pzogc3RyaW5nLFxuKTogUHJvbWlzZTxUcnVzdGVkSFRNTD4ge1xuXHQvLyBSZW1vdmUgSFRNTCBjb21tZW50IG1hcmtlcnMgYXJvdW5kIHRhYmxlIG9mIGNvbnRlbnRzIG5hdmlnYXRpb25cblx0dGV4dCA9IHRleHRcblx0XHQudG9TdHJpbmcoKVxuXHRcdC5yZXBsYWNlKC88IS0tXFxzKlRPQ1xccyovZ2ksICcnKVxuXHRcdC5yZXBsYWNlKC9cXHMqTmF2aWdhdGlvbiBFbmRcXHMqLS0+L2dpLCAnJyk7XG5cblx0Ly8gUHJvY2VzcyBjb25kaXRpb25hbCBibG9ja3MgYmFzZWQgb24gYWN0aXZlIGNvbmRpdGlvbnNcblx0Y29uc3QgYWN0aXZlQ29uZGl0aW9ucyA9IG5ldyBTZXQ8c3RyaW5nPihbJ0lOX1BST0RVQ1QnXSk7XG5cdGlmIChxdWFsaXR5ID09PSAnc3RhYmxlJykge1xuXHRcdGFjdGl2ZUNvbmRpdGlvbnMuYWRkKCdTVEFCTEUnKTtcblx0fSBlbHNlIGlmIChxdWFsaXR5ID09PSAnaW5zaWRlcicpIHtcblx0XHRhY3RpdmVDb25kaXRpb25zLmFkZCgnSU5TSURFUlMnKTtcblx0fVxuXHR0ZXh0ID0gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQsIGFjdGl2ZUNvbmRpdGlvbnMpO1xuXG5cdHJldHVybiByZW5kZXJNYXJrZG93bkRvY3VtZW50KHRleHQsIGV4dGVuc2lvblNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwge1xuXHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0YWxsb3dSZWxhdGl2ZU1lZGlhUGF0aHM6IHRydWUsXG5cdFx0XHRhbGxvd2VkTGlua1Byb3RvY29sczoge1xuXHRcdFx0XHRvdmVycmlkZTogW1NjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwcywgU2NoZW1hcy5jb21tYW5kLCBTY2hlbWFzLmNvZGVTZXR0aW5nXVxuXHRcdFx0fSxcblx0XHRcdGFsbG93ZWRUYWdzOiB7IGF1Z21lbnQ6IFsnbmF2JywgJ3N2ZycsICdwYXRoJ10gfSxcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7IGF1Z21lbnQ6IFsnYXJpYS1yb2xlJywgJ3ZpZXdCb3gnLCAnZmlsbCcsICd4bWxucycsICdkJ10gfVxuXHRcdH0sXG5cdFx0bWFya2VkRXh0ZW5zaW9uczogW3tcblx0XHRcdHJlbmRlcmVyOiB7XG5cdFx0XHRcdGh0bWw6IHNpbXBsZVNldHRpbmdSZW5kZXJlci5nZXRIdG1sUmVuZGVyZXIoKSxcblx0XHRcdFx0Y29kZXNwYW46IHNpbXBsZVNldHRpbmdSZW5kZXJlci5nZXRDb2RlU3BhblJlbmRlcmVyKCksXG5cdFx0XHR9XG5cdFx0fV1cblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsd0JBQXdCO0FBQ2pDLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWUsdUJBQXVCO0FBQy9DLFNBQVMseUJBQXlCLDhCQUE4QjtBQUVoRSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQWMsc0JBQXNCO0FBQzdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFvQyw2QkFBNkI7QUFDakUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBRXRCLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFB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QUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQStQSixnQkFBZ0I7QUFBQSxxQkFDRCxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHVCQVNILGdCQUFnQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsNEJBS1gsSUFBSSxTQUFTLGdCQUFnQixvQ0FBb0MsQ0FBQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQ0FrQnhELFFBQVEsV0FBVztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFvQnhEO0FBQUEsRUFFUSx5QkFBeUIsR0FBb0M7QUFDcEUsUUFBSSxFQUFFLHFCQUFxQix5QkFBeUIsR0FBRztBQUN0RCxXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUFBLEVBRVEsK0JBQStCLE9BQXVDO0FBQzdFLFFBQUksU0FBUyxVQUFVLEtBQUssc0JBQXNCO0FBQ2pELFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0I7QUFDL0IsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QixXQUFLLHFCQUFxQixRQUFRLFlBQVk7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixPQUFPLEtBQUssc0JBQXNCLFNBQWtCLHlCQUF5QjtBQUFBLE1BQzlFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBN2pCYSxzQkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCVTtBQW1sQk4sU0FBUyx5QkFBeUIsTUFBYyxrQkFBK0M7QUFDckcsU0FBTyxLQUFLO0FBQUEsSUFDWDtBQUFBLElBQ0EsQ0FBQyxRQUFRLFdBQW1CLFlBQW9CO0FBQy9DLFVBQUksaUJBQWlCLElBQUksVUFBVSxZQUFZLENBQUMsR0FBRztBQUVsRCxlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBRUEsZUFBc0IsMkJBQ3JCLE1BQ0Esa0JBQ0EsaUJBQ0EsdUJBQ0EsU0FDdUI7QUFFdkIsU0FBTyxLQUNMLFNBQVMsRUFDVCxRQUFRLG1CQUFtQixFQUFFLEVBQzdCLFFBQVEsNkJBQTZCLEVBQUU7QUFHekMsUUFBTSxtQkFBbUIsb0JBQUksSUFBWSxDQUFDLFlBQVksQ0FBQztBQUN2RCxNQUFJLFlBQVksVUFBVTtBQUN6QixxQkFBaUIsSUFBSSxRQUFRO0FBQUEsRUFDOUIsV0FBVyxZQUFZLFdBQVc7QUFDakMscUJBQWlCLElBQUksVUFBVTtBQUFBLEVBQ2hDO0FBQ0EsU0FBTyx5QkFBeUIsTUFBTSxnQkFBZ0I7QUFFdEQsU0FBTyx1QkFBdUIsTUFBTSxrQkFBa0IsaUJBQWlCO0FBQUEsSUFDdEUsaUJBQWlCO0FBQUEsTUFDaEIseUJBQXlCO0FBQUEsTUFDekIsc0JBQXNCO0FBQUEsUUFDckIsVUFBVSxDQUFDLFFBQVEsTUFBTSxRQUFRLE9BQU8sUUFBUSxTQUFTLFFBQVEsV0FBVztBQUFBLE1BQzdFO0FBQUEsTUFDQSxhQUFhLEVBQUUsU0FBUyxDQUFDLE9BQU8sT0FBTyxNQUFNLEVBQUU7QUFBQSxNQUMvQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsYUFBYSxXQUFXLFFBQVEsU0FBUyxHQUFHLEVBQUU7QUFBQSxJQUM5RTtBQUFBLElBQ0Esa0JBQWtCLENBQUM7QUFBQSxNQUNsQixVQUFVO0FBQUEsUUFDVCxNQUFNLHNCQUFzQixnQkFBZ0I7QUFBQSxRQUM1QyxVQUFVLHNCQUFzQixvQkFBb0I7QUFBQSxNQUNyRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGOyIsCiAgIm5hbWVzIjogWyJtYXRjaCIsICJrYiJdCn0K
