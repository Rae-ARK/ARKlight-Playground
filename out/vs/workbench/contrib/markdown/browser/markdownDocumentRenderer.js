import { sanitizeHtml } from "../../../../base/browser/domSanitize.js";
import { allowedMarkdownHtmlAttributes, allowedMarkdownHtmlTags } from "../../../../base/browser/markdownRenderer.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import * as marked from "../../../../base/common/marked/marked.js";
import { Schemas } from "../../../../base/common/network.js";
import { escape } from "../../../../base/common/strings.js";
import { tokenizeToString } from "../../../../editor/common/languages/textToHtmlTokenizer.js";
import { markedGfmHeadingIdPlugin } from "./markedGfmHeadingIdPlugin.js";
const DEFAULT_MARKDOWN_STYLES = `
body {
	padding: 10px 20px;
	line-height: 22px;
	max-width: 882px;
	margin: 0 auto;
}

body *:last-child {
	margin-bottom: 0;
}

img {
	max-width: 100%;
	max-height: 100%;
}

a {
	text-decoration: var(--text-link-decoration);
}

a:hover {
	text-decoration: underline;
}

a:focus,
input:focus,
select:focus,
textarea:focus {
	outline: 1px solid -webkit-focus-ring-color;
	outline-offset: -1px;
}

hr {
	border: 0;
	height: 2px;
	border-bottom: 2px solid;
}

h1 {
	padding-bottom: 0.3em;
	line-height: 1.2;
	border-bottom-width: 1px;
	border-bottom-style: solid;
}

h1, h2, h3 {
	font-weight: normal;
}

table {
	border-collapse: collapse;
}

th {
	text-align: left;
	border-bottom: 1px solid;
}

th,
td {
	padding: 5px 10px;
}

table > tbody > tr + tr > td {
	border-top-width: 1px;
	border-top-style: solid;
}

blockquote {
	margin: 0 7px 0 5px;
	padding: 0 16px 0 10px;
	border-left-width: 5px;
	border-left-style: solid;
}

code {
	font-family: "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace;
}

pre {
	padding: 16px;
	border-radius: 3px;
	overflow: auto;
}

pre code {
	font-family: var(--vscode-editor-font-family);
	font-weight: var(--vscode-editor-font-weight);
	font-size: var(--vscode-editor-font-size);
	line-height: 1.5;
	color: var(--vscode-editor-foreground);
	tab-size: 4;
}

.monaco-tokenized-source {
	white-space: pre;
}

/** Theming */

.pre {
	background-color: var(--vscode-textCodeBlock-background);
}

.vscode-high-contrast h1 {
	border-color: rgb(0, 0, 0);
}

.vscode-light th {
	border-color: rgba(0, 0, 0, 0.69);
}

.vscode-dark th {
	border-color: rgba(255, 255, 255, 0.69);
}

.vscode-light h1,
.vscode-light hr,
.vscode-light td {
	border-color: rgba(0, 0, 0, 0.18);
}

.vscode-dark h1,
.vscode-dark hr,
.vscode-dark td {
	border-color: rgba(255, 255, 255, 0.18);
}

@media (forced-colors: active) and (prefers-color-scheme: light){
	body {
		forced-color-adjust: none;
	}
}

@media (forced-colors: active) and (prefers-color-scheme: dark){
	body {
		forced-color-adjust: none;
	}
}
`;
const defaultAllowedLinkProtocols = Object.freeze([
  Schemas.http,
  Schemas.https
]);
function sanitize(documentContent, sanitizerConfig) {
  return sanitizeHtml(documentContent, {
    allowedLinkProtocols: {
      override: sanitizerConfig?.allowedLinkProtocols?.override ?? defaultAllowedLinkProtocols
    },
    allowRelativeLinkPaths: sanitizerConfig?.allowRelativeLinkPaths,
    allowedMediaProtocols: sanitizerConfig?.allowedMediaProtocols,
    allowRelativeMediaPaths: sanitizerConfig?.allowRelativeMediaPaths,
    allowedTags: {
      override: allowedMarkdownHtmlTags,
      augment: sanitizerConfig?.allowedTags?.augment
    },
    allowedAttributes: {
      override: [
        ...allowedMarkdownHtmlAttributes,
        "name",
        "id",
        "class",
        "role",
        "tabindex",
        "placeholder"
      ],
      augment: sanitizerConfig?.allowedAttributes?.augment ?? []
    }
  });
}
async function renderMarkdownDocument(text, extensionService, languageService, options, token = CancellationToken.None) {
  const m = new marked.Marked(
    MarkedHighlight.markedHighlight({
      async: true,
      async highlight(code, lang) {
        if (typeof lang !== "string") {
          return escape(code);
        }
        await extensionService.whenInstalledExtensionsRegistered();
        if (token?.isCancellationRequested) {
          return "";
        }
        const languageId = languageService.getLanguageIdByLanguageName(lang) ?? languageService.getLanguageIdByLanguageName(lang.split(/\s+|:|,|(?!^)\{|\?]/, 1)[0]);
        return tokenizeToString(languageService, code, languageId);
      }
    }),
    markedGfmHeadingIdPlugin(),
    ...options?.markedExtensions ?? []
  );
  const raw = await raceCancellationError(m.parse(text, { async: true }), token ?? CancellationToken.None);
  return sanitize(raw, options?.sanitizerConfig);
}
var MarkedHighlight;
((MarkedHighlight2) => {
  function markedHighlight(options) {
    if (typeof options === "function") {
      options = {
        highlight: options
      };
    }
    if (!options || typeof options.highlight !== "function") {
      throw new Error("Must provide highlight function");
    }
    return {
      async: !!options.async,
      walkTokens(token) {
        if (token.type !== "code") {
          return;
        }
        if (options.async) {
          return Promise.resolve(options.highlight(token.text, token.lang)).then(updateToken(token));
        }
        const code = options.highlight(token.text, token.lang);
        if (code instanceof Promise) {
          throw new Error("markedHighlight is not set to async but the highlight function is async. Set the async option to true on markedHighlight to await the async highlight function.");
        }
        updateToken(token)(code);
      },
      renderer: {
        code({ text, lang, escaped }) {
          const classAttr = lang ? ` class="language-${escape2(lang)}"` : "";
          text = text.replace(/\n$/, "");
          return `<pre><code${classAttr}>${escaped ? text : escape2(text, true)}
</code></pre>`;
        }
      }
    };
  }
  MarkedHighlight2.markedHighlight = markedHighlight;
  function updateToken(token) {
    return (code) => {
      if (typeof code === "string" && code !== token.text) {
        token.escaped = true;
        token.text = code;
      }
    };
  }
  const escapeTest = /[&<>"']/;
  const escapeReplace = new RegExp(escapeTest.source, "g");
  const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
  const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
  const escapeReplacement = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    [`'`]: "&#39;"
  };
  const getEscapeReplacement = (ch) => escapeReplacement[ch];
  function escape2(html, encode) {
    if (encode) {
      if (escapeTest.test(html)) {
        return html.replace(escapeReplace, getEscapeReplacement);
      }
    } else {
      if (escapeTestNoEncode.test(html)) {
        return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
      }
    }
    return html;
  }
})(MarkedHighlight || (MarkedHighlight = {}));
export {
  DEFAULT_MARKDOWN_STYLES,
  renderMarkdownDocument
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc2FuaXRpemVIdG1sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVNhbml0aXplLmpzJztcbmltcG9ydCB7IGFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzLCBhbGxvd2VkTWFya2Rvd25IdG1sVGFncyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGVzY2FwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IHRva2VuaXplVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy90ZXh0VG9IdG1sVG9rZW5pemVyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBtYXJrZWRHZm1IZWFkaW5nSWRQbHVnaW4gfSBmcm9tICcuL21hcmtlZEdmbUhlYWRpbmdJZFBsdWdpbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX01BUktET1dOX1NUWUxFUyA9IGBcbmJvZHkge1xuXHRwYWRkaW5nOiAxMHB4IDIwcHg7XG5cdGxpbmUtaGVpZ2h0OiAyMnB4O1xuXHRtYXgtd2lkdGg6IDg4MnB4O1xuXHRtYXJnaW46IDAgYXV0bztcbn1cblxuYm9keSAqOmxhc3QtY2hpbGQge1xuXHRtYXJnaW4tYm90dG9tOiAwO1xufVxuXG5pbWcge1xuXHRtYXgtd2lkdGg6IDEwMCU7XG5cdG1heC1oZWlnaHQ6IDEwMCU7XG59XG5cbmEge1xuXHR0ZXh0LWRlY29yYXRpb246IHZhcigtLXRleHQtbGluay1kZWNvcmF0aW9uKTtcbn1cblxuYTpob3ZlciB7XG5cdHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xufVxuXG5hOmZvY3VzLFxuaW5wdXQ6Zm9jdXMsXG5zZWxlY3Q6Zm9jdXMsXG50ZXh0YXJlYTpmb2N1cyB7XG5cdG91dGxpbmU6IDFweCBzb2xpZCAtd2Via2l0LWZvY3VzLXJpbmctY29sb3I7XG5cdG91dGxpbmUtb2Zmc2V0OiAtMXB4O1xufVxuXG5ociB7XG5cdGJvcmRlcjogMDtcblx0aGVpZ2h0OiAycHg7XG5cdGJvcmRlci1ib3R0b206IDJweCBzb2xpZDtcbn1cblxuaDEge1xuXHRwYWRkaW5nLWJvdHRvbTogMC4zZW07XG5cdGxpbmUtaGVpZ2h0OiAxLjI7XG5cdGJvcmRlci1ib3R0b20td2lkdGg6IDFweDtcblx0Ym9yZGVyLWJvdHRvbS1zdHlsZTogc29saWQ7XG59XG5cbmgxLCBoMiwgaDMge1xuXHRmb250LXdlaWdodDogbm9ybWFsO1xufVxuXG50YWJsZSB7XG5cdGJvcmRlci1jb2xsYXBzZTogY29sbGFwc2U7XG59XG5cbnRoIHtcblx0dGV4dC1hbGlnbjogbGVmdDtcblx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkO1xufVxuXG50aCxcbnRkIHtcblx0cGFkZGluZzogNXB4IDEwcHg7XG59XG5cbnRhYmxlID4gdGJvZHkgPiB0ciArIHRyID4gdGQge1xuXHRib3JkZXItdG9wLXdpZHRoOiAxcHg7XG5cdGJvcmRlci10b3Atc3R5bGU6IHNvbGlkO1xufVxuXG5ibG9ja3F1b3RlIHtcblx0bWFyZ2luOiAwIDdweCAwIDVweDtcblx0cGFkZGluZzogMCAxNnB4IDAgMTBweDtcblx0Ym9yZGVyLWxlZnQtd2lkdGg6IDVweDtcblx0Ym9yZGVyLWxlZnQtc3R5bGU6IHNvbGlkO1xufVxuXG5jb2RlIHtcblx0Zm9udC1mYW1pbHk6IFwiU0YgTW9ub1wiLCBNb25hY28sIE1lbmxvLCBDb25zb2xhcywgXCJVYnVudHUgTW9ub1wiLCBcIkxpYmVyYXRpb24gTW9ub1wiLCBcIkRlamFWdSBTYW5zIE1vbm9cIiwgXCJDb3VyaWVyIE5ld1wiLCBtb25vc3BhY2U7XG59XG5cbnByZSB7XG5cdHBhZGRpbmc6IDE2cHg7XG5cdGJvcmRlci1yYWRpdXM6IDNweDtcblx0b3ZlcmZsb3c6IGF1dG87XG59XG5cbnByZSBjb2RlIHtcblx0Zm9udC1mYW1pbHk6IHZhcigtLXZzY29kZS1lZGl0b3ItZm9udC1mYW1pbHkpO1xuXHRmb250LXdlaWdodDogdmFyKC0tdnNjb2RlLWVkaXRvci1mb250LXdlaWdodCk7XG5cdGZvbnQtc2l6ZTogdmFyKC0tdnNjb2RlLWVkaXRvci1mb250LXNpemUpO1xuXHRsaW5lLWhlaWdodDogMS41O1xuXHRjb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1mb3JlZ3JvdW5kKTtcblx0dGFiLXNpemU6IDQ7XG59XG5cbi5tb25hY28tdG9rZW5pemVkLXNvdXJjZSB7XG5cdHdoaXRlLXNwYWNlOiBwcmU7XG59XG5cbi8qKiBUaGVtaW5nICovXG5cbi5wcmUge1xuXHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtdGV4dENvZGVCbG9jay1iYWNrZ3JvdW5kKTtcbn1cblxuLnZzY29kZS1oaWdoLWNvbnRyYXN0IGgxIHtcblx0Ym9yZGVyLWNvbG9yOiByZ2IoMCwgMCwgMCk7XG59XG5cbi52c2NvZGUtbGlnaHQgdGgge1xuXHRib3JkZXItY29sb3I6IHJnYmEoMCwgMCwgMCwgMC42OSk7XG59XG5cbi52c2NvZGUtZGFyayB0aCB7XG5cdGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjY5KTtcbn1cblxuLnZzY29kZS1saWdodCBoMSxcbi52c2NvZGUtbGlnaHQgaHIsXG4udnNjb2RlLWxpZ2h0IHRkIHtcblx0Ym9yZGVyLWNvbG9yOiByZ2JhKDAsIDAsIDAsIDAuMTgpO1xufVxuXG4udnNjb2RlLWRhcmsgaDEsXG4udnNjb2RlLWRhcmsgaHIsXG4udnNjb2RlLWRhcmsgdGQge1xuXHRib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xOCk7XG59XG5cbkBtZWRpYSAoZm9yY2VkLWNvbG9yczogYWN0aXZlKSBhbmQgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBsaWdodCl7XG5cdGJvZHkge1xuXHRcdGZvcmNlZC1jb2xvci1hZGp1c3Q6IG5vbmU7XG5cdH1cbn1cblxuQG1lZGlhIChmb3JjZWQtY29sb3JzOiBhY3RpdmUpIGFuZCAocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspe1xuXHRib2R5IHtcblx0XHRmb3JjZWQtY29sb3ItYWRqdXN0OiBub25lO1xuXHR9XG59XG5gO1xuXG5jb25zdCBkZWZhdWx0QWxsb3dlZExpbmtQcm90b2NvbHMgPSBPYmplY3QuZnJlZXplKFtcblx0U2NoZW1hcy5odHRwLFxuXHRTY2hlbWFzLmh0dHBzLFxuXSk7XG5cbmZ1bmN0aW9uIHNhbml0aXplKGRvY3VtZW50Q29udGVudDogc3RyaW5nLCBzYW5pdGl6ZXJDb25maWc6IE1hcmtkb3duRG9jdW1lbnRTYW5pdGl6ZXJDb25maWcgfCB1bmRlZmluZWQpOiBUcnVzdGVkSFRNTCB7XG5cdHJldHVybiBzYW5pdGl6ZUh0bWwoZG9jdW1lbnRDb250ZW50LCB7XG5cdFx0YWxsb3dlZExpbmtQcm90b2NvbHM6IHtcblx0XHRcdG92ZXJyaWRlOiBzYW5pdGl6ZXJDb25maWc/LmFsbG93ZWRMaW5rUHJvdG9jb2xzPy5vdmVycmlkZSA/PyBkZWZhdWx0QWxsb3dlZExpbmtQcm90b2NvbHMsXG5cdFx0fSxcblx0XHRhbGxvd1JlbGF0aXZlTGlua1BhdGhzOiBzYW5pdGl6ZXJDb25maWc/LmFsbG93UmVsYXRpdmVMaW5rUGF0aHMsXG5cdFx0YWxsb3dlZE1lZGlhUHJvdG9jb2xzOiBzYW5pdGl6ZXJDb25maWc/LmFsbG93ZWRNZWRpYVByb3RvY29scyxcblx0XHRhbGxvd1JlbGF0aXZlTWVkaWFQYXRoczogc2FuaXRpemVyQ29uZmlnPy5hbGxvd1JlbGF0aXZlTWVkaWFQYXRocyxcblx0XHRhbGxvd2VkVGFnczoge1xuXHRcdFx0b3ZlcnJpZGU6IGFsbG93ZWRNYXJrZG93bkh0bWxUYWdzLFxuXHRcdFx0YXVnbWVudDogc2FuaXRpemVyQ29uZmlnPy5hbGxvd2VkVGFncz8uYXVnbWVudFxuXHRcdH0sXG5cdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHtcblx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdC4uLmFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzLFxuXHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdCdpZCcsXG5cdFx0XHRcdCdjbGFzcycsXG5cdFx0XHRcdCdyb2xlJyxcblx0XHRcdFx0J3RhYmluZGV4Jyxcblx0XHRcdFx0J3BsYWNlaG9sZGVyJyxcblx0XHRcdF0sXG5cdFx0XHRhdWdtZW50OiBzYW5pdGl6ZXJDb25maWc/LmFsbG93ZWRBdHRyaWJ1dGVzPy5hdWdtZW50ID8/IFtdLFxuXHRcdH1cblx0fSk7XG59XG5cbmludGVyZmFjZSBNYXJrZG93bkRvY3VtZW50U2FuaXRpemVyQ29uZmlnIHtcblx0cmVhZG9ubHkgYWxsb3dlZExpbmtQcm90b2NvbHM/OiB7XG5cdFx0cmVhZG9ubHkgb3ZlcnJpZGU6IHJlYWRvbmx5IHN0cmluZ1tdIHwgJyonO1xuXHR9O1xuXHRyZWFkb25seSBhbGxvd1JlbGF0aXZlTGlua1BhdGhzPzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBhbGxvd2VkTWVkaWFQcm90b2NvbHM/OiB7XG5cdFx0cmVhZG9ubHkgb3ZlcnJpZGU6IHJlYWRvbmx5IHN0cmluZ1tdIHwgJyonO1xuXHR9O1xuXHRyZWFkb25seSBhbGxvd1JlbGF0aXZlTWVkaWFQYXRocz86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgYWxsb3dlZFRhZ3M/OiB7XG5cdFx0cmVhZG9ubHkgYXVnbWVudDogcmVhZG9ubHkgc3RyaW5nW107XG5cdH07XG5cblx0cmVhZG9ubHkgYWxsb3dlZEF0dHJpYnV0ZXM/OiB7XG5cdFx0cmVhZG9ubHkgYXVnbWVudDogcmVhZG9ubHkgc3RyaW5nW107XG5cdH07XG59XG5cbmludGVyZmFjZSBJUmVuZGVyTWFya2Rvd25Eb2N1bWVudE9wdGlvbnMge1xuXHRyZWFkb25seSBzYW5pdGl6ZXJDb25maWc/OiBNYXJrZG93bkRvY3VtZW50U2FuaXRpemVyQ29uZmlnO1xuXHRyZWFkb25seSBtYXJrZWRFeHRlbnNpb25zPzogcmVhZG9ubHkgbWFya2VkLk1hcmtlZEV4dGVuc2lvbltdO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYSBzdHJpbmcgb2YgbWFya2Rvd24gZm9yIHVzZSBpbiBhbiBleHRlcm5hbCBkb2N1bWVudCBjb250ZXh0LlxuICpcbiAqIFVzZXMgVlMgQ29kZSdzIHN5bnRheCBoaWdobGlnaHRpbmcgY29kZSBibG9ja3MuIEFsc28gZG9lcyBub3QgYXR0YWNoIGFsbCB0aGUgaG9va3MgYW5kIGN1c3RvbWl6YXRpb24gdGhhdCBub3JtYWxcbiAqIG1hcmtkb3duIHJlbmRlcmVyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuZGVyTWFya2Rvd25Eb2N1bWVudChcblx0dGV4dDogc3RyaW5nLFxuXHRleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0bGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRvcHRpb25zPzogSVJlbmRlck1hcmtkb3duRG9jdW1lbnRPcHRpb25zLFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuKTogUHJvbWlzZTxUcnVzdGVkSFRNTD4ge1xuXHRjb25zdCBtID0gbmV3IG1hcmtlZC5NYXJrZWQoXG5cdFx0TWFya2VkSGlnaGxpZ2h0Lm1hcmtlZEhpZ2hsaWdodCh7XG5cdFx0XHRhc3luYzogdHJ1ZSxcblx0XHRcdGFzeW5jIGhpZ2hsaWdodChjb2RlOiBzdHJpbmcsIGxhbmc6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbGFuZyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXNjYXBlKGNvZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRcdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKGxhbmcpID8/IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUobGFuZy5zcGxpdCgvXFxzK3w6fCx8KD8hXilcXHt8XFw/XS8sIDEpWzBdKTtcblx0XHRcdFx0cmV0dXJuIHRva2VuaXplVG9TdHJpbmcobGFuZ3VhZ2VTZXJ2aWNlLCBjb2RlLCBsYW5ndWFnZUlkKTtcblx0XHRcdH1cblx0XHR9KSxcblx0XHRtYXJrZWRHZm1IZWFkaW5nSWRQbHVnaW4oKSxcblx0XHQuLi4ob3B0aW9ucz8ubWFya2VkRXh0ZW5zaW9ucyA/PyBbXSksXG5cdCk7XG5cblx0Y29uc3QgcmF3ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKG0ucGFyc2UodGV4dCwgeyBhc3luYzogdHJ1ZSB9KSwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdHJldHVybiBzYW5pdGl6ZShyYXcsIG9wdGlvbnM/LnNhbml0aXplckNvbmZpZyk7XG59XG5cbm5hbWVzcGFjZSBNYXJrZWRIaWdobGlnaHQge1xuXHQvLyBDb3BpZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWFya2VkanMvbWFya2VkLWhpZ2hsaWdodC9ibG9iL21haW4vc3JjL2luZGV4LmpzXG5cblx0ZXhwb3J0IGZ1bmN0aW9uIG1hcmtlZEhpZ2hsaWdodChvcHRpb25zOiBtYXJrZWQuTWFya2VkT3B0aW9ucyAmIHsgaGlnaGxpZ2h0OiAoY29kZTogc3RyaW5nLCBsYW5nOiBzdHJpbmcpID0+IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPiB9KTogbWFya2VkLk1hcmtlZEV4dGVuc2lvbiB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRvcHRpb25zID0ge1xuXHRcdFx0XHRoaWdobGlnaHQ6IG9wdGlvbnMsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucyB8fCB0eXBlb2Ygb3B0aW9ucy5oaWdobGlnaHQgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTXVzdCBwcm92aWRlIGhpZ2hsaWdodCBmdW5jdGlvbicpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRhc3luYzogISFvcHRpb25zLmFzeW5jLFxuXHRcdFx0d2Fsa1Rva2Vucyh0b2tlbjogbWFya2VkLlRva2VuKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdFx0XHRpZiAodG9rZW4udHlwZSAhPT0gJ2NvZGUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnMuYXN5bmMpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG9wdGlvbnMuaGlnaGxpZ2h0KHRva2VuLnRleHQsIHRva2VuLmxhbmcpKS50aGVuKHVwZGF0ZVRva2VuKHRva2VuKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb2RlID0gb3B0aW9ucy5oaWdobGlnaHQodG9rZW4udGV4dCwgdG9rZW4ubGFuZyk7XG5cdFx0XHRcdGlmIChjb2RlIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbWFya2VkSGlnaGxpZ2h0IGlzIG5vdCBzZXQgdG8gYXN5bmMgYnV0IHRoZSBoaWdobGlnaHQgZnVuY3Rpb24gaXMgYXN5bmMuIFNldCB0aGUgYXN5bmMgb3B0aW9uIHRvIHRydWUgb24gbWFya2VkSGlnaGxpZ2h0IHRvIGF3YWl0IHRoZSBhc3luYyBoaWdobGlnaHQgZnVuY3Rpb24uJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dXBkYXRlVG9rZW4odG9rZW4pKGNvZGUpO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlcmVyOiB7XG5cdFx0XHRcdGNvZGUoeyB0ZXh0LCBsYW5nLCBlc2NhcGVkIH06IG1hcmtlZC5Ub2tlbnMuQ29kZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNsYXNzQXR0ciA9IGxhbmdcblx0XHRcdFx0XHRcdD8gYCBjbGFzcz1cImxhbmd1YWdlLSR7ZXNjYXBlKGxhbmcpfVwiYFxuXHRcdFx0XHRcdFx0OiAnJztcblx0XHRcdFx0XHR0ZXh0ID0gdGV4dC5yZXBsYWNlKC9cXG4kLywgJycpO1xuXHRcdFx0XHRcdHJldHVybiBgPHByZT48Y29kZSR7Y2xhc3NBdHRyfT4ke2VzY2FwZWQgPyB0ZXh0IDogZXNjYXBlKHRleHQsIHRydWUpfVxcbjwvY29kZT48L3ByZT5gO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdXBkYXRlVG9rZW4odG9rZW46IGFueSkge1xuXHRcdHJldHVybiAoY29kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGNvZGUgPT09ICdzdHJpbmcnICYmIGNvZGUgIT09IHRva2VuLnRleHQpIHtcblx0XHRcdFx0dG9rZW4uZXNjYXBlZCA9IHRydWU7XG5cdFx0XHRcdHRva2VuLnRleHQgPSBjb2RlO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBjb3BpZWQgZnJvbSBtYXJrZWQgaGVscGVyc1xuXHRjb25zdCBlc2NhcGVUZXN0ID0gL1smPD5cIiddLztcblx0Y29uc3QgZXNjYXBlUmVwbGFjZSA9IG5ldyBSZWdFeHAoZXNjYXBlVGVzdC5zb3VyY2UsICdnJyk7XG5cdGNvbnN0IGVzY2FwZVRlc3ROb0VuY29kZSA9IC9bPD5cIiddfCYoPyEoI1xcZHsxLDd9fCNbWHhdW2EtZkEtRjAtOV17MSw2fXxcXHcrKTspLztcblx0Y29uc3QgZXNjYXBlUmVwbGFjZU5vRW5jb2RlID0gbmV3IFJlZ0V4cChlc2NhcGVUZXN0Tm9FbmNvZGUuc291cmNlLCAnZycpO1xuXHRjb25zdCBlc2NhcGVSZXBsYWNlbWVudDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHQnJic6ICcmYW1wOycsXG5cdFx0JzwnOiAnJmx0OycsXG5cdFx0Jz4nOiAnJmd0OycsXG5cdFx0J1wiJzogJyZxdW90OycsXG5cdFx0W2AnYF06ICcmIzM5OycsXG5cdH07XG5cdGNvbnN0IGdldEVzY2FwZVJlcGxhY2VtZW50ID0gKGNoOiBzdHJpbmcpID0+IGVzY2FwZVJlcGxhY2VtZW50W2NoXTtcblx0ZnVuY3Rpb24gZXNjYXBlKGh0bWw6IHN0cmluZywgZW5jb2RlPzogYm9vbGVhbikge1xuXHRcdGlmIChlbmNvZGUpIHtcblx0XHRcdGlmIChlc2NhcGVUZXN0LnRlc3QoaHRtbCkpIHtcblx0XHRcdFx0cmV0dXJuIGh0bWwucmVwbGFjZShlc2NhcGVSZXBsYWNlLCBnZXRFc2NhcGVSZXBsYWNlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChlc2NhcGVUZXN0Tm9FbmNvZGUudGVzdChodG1sKSkge1xuXHRcdFx0XHRyZXR1cm4gaHRtbC5yZXBsYWNlKGVzY2FwZVJlcGxhY2VOb0VuY29kZSwgZ2V0RXNjYXBlUmVwbGFjZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBodG1sO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtCQUErQiwrQkFBK0I7QUFDdkUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFFdkIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxnQ0FBZ0M7QUFFbEMsTUFBTSwwQkFBMEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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QVEsR0FBRztBQUN2RCxRQUFNLHFCQUFxQjtBQUMzQixRQUFNLHdCQUF3QixJQUFJLE9BQU8sbUJBQW1CLFFBQVEsR0FBRztBQUN2RSxRQUFNLG9CQUE0QztBQUFBLElBQ2pELEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLENBQUMsR0FBRyxHQUFHO0FBQUEsRUFDUjtBQUNBLFFBQU0sdUJBQXVCLENBQUMsT0FBZSxrQkFBa0IsRUFBRTtBQUNqRSxXQUFTQyxRQUFPLE1BQWMsUUFBa0I7QUFDL0MsUUFBSSxRQUFRO0FBQ1gsVUFBSSxXQUFXLEtBQUssSUFBSSxHQUFHO0FBQzFCLGVBQU8sS0FBSyxRQUFRLGVBQWUsb0JBQW9CO0FBQUEsTUFDeEQ7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLG1CQUFtQixLQUFLLElBQUksR0FBRztBQUNsQyxlQUFPLEtBQUssUUFBUSx1QkFBdUIsb0JBQW9CO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxHQTdFUzsiLAogICJuYW1lcyI6IFsiTWFya2VkSGlnaGxpZ2h0IiwgImVzY2FwZSJdCn0K
