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
import { generateUuid } from "../../../../base/common/uuid.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { language } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { asWebviewUri } from "../../webview/common/webview.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { gettingStartedContentRegistry } from "../common/gettingStartedContent.js";
let GettingStartedDetailsRenderer = class {
  constructor(fileService, notificationService, extensionService, languageService) {
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.languageService = languageService;
    this.mdCache = new ResourceMap();
    this.svgCache = new ResourceMap();
  }
  async renderMarkdown(path, base) {
    const content = await this.readAndCacheStepMarkdown(path, base);
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    const inDev = document.location.protocol === "http:";
    const imgSrcCsp = inDev ? "img-src https: data: http:" : "img-src https: data:";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${imgSrcCsp}; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					body > img {
						align-self: flex-start;
					}
					body > img[centered] {
						align-self: center;
					}
					body {
						display: flex;
						flex-direction: column;
						padding: 0;
						height: inherit;
					}
					.theme-picker-row {
						display: flex;
						justify-content: center;
						gap: 32px;
					}
					checklist {
						display: flex;
						gap: 32px;
						flex-direction: column;
					}
					checkbox {
						display: flex;
						flex-direction: column;
						align-items: center;
						margin: 5px;
						cursor: pointer;
					}
					checkbox > img {
						margin-bottom: 8px !important;
					}
					checkbox.checked > img {
						box-sizing: border-box;
					}
					checkbox.checked > img {
						outline: 2px solid var(--vscode-focusBorder);
						outline-offset: 4px;
						border-radius: 4px;
					}
					.theme-picker-link {
						margin-top: 16px;
						color: var(--vscode-textLink-foreground);
					}
					blockquote > p:first-child {
						margin-top: 0;
					}
					body > * {
						margin-block-end: 0.25em;
						margin-block-start: 0.25em;
					}
					vertically-centered {
						padding-top: 5px;
						padding-bottom: 5px;
						display: flex;
						justify-content: center;
						flex-direction: column;
					}
					html {
						height: 100%;
						padding-right: 32px;
					}
					h1 {
						font-size: 19.5px;
					}
					h2 {
						font-size: 18.5px;
					}
				</style>
			</head>
			<body>
				<vertically-centered>
					${content}
				</vertically-centered>
			</body>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();

				document.querySelectorAll('[when-checked]').forEach(el => {
					el.addEventListener('click', () => {
						vscode.postMessage(el.getAttribute('when-checked'));
					});
				});

				let ongoingLayout = undefined;
				const doLayout = () => {
					document.querySelectorAll('vertically-centered').forEach(element => {
						element.style.marginTop = Math.max((document.body.clientHeight - element.scrollHeight) * 3/10, 0) + 'px';
					});
					ongoingLayout = undefined;
				};

				const layout = () => {
					if (ongoingLayout) {
						clearTimeout(ongoingLayout);
					}
					ongoingLayout = setTimeout(doLayout, 0);
				};

				layout();

				document.querySelectorAll('img').forEach(element => {
					element.onload = layout;
				})

				window.addEventListener('message', event => {
					if (event.data.layoutMeNow) {
						layout();
					}
					if (event.data.enabledContextKeys) {
						document.querySelectorAll('.checked').forEach(element => element.classList.remove('checked'))
						for (const key of event.data.enabledContextKeys) {
							document.querySelectorAll('[checked-on="' + key + '"]').forEach(element => element.classList.add('checked'))
						}
					}
				});
		<\/script>
		</html>`;
  }
  async renderSVG(path) {
    const content = await this.readAndCacheSVGFile(path);
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}
					svg {
						position: fixed;
						height: 100%;
						width: 80%;
						left: 50%;
						top: 50%;
						max-width: 530px;
						min-width: 350px;
						transform: translate(-50%,-50%);
					}
				</style>
			</head>
			<body>
				${content}
			</body>
		</html>`;
  }
  async renderVideo(path, poster, description) {
    const nonce = generateUuid();
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; media-src https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					video {
						max-width: 100%;
						max-height: 100%;
						object-fit: cover;
					}
				</style>
			</head>
			<body>
				<video controls autoplay ${poster ? `poster="${poster.toString(true)}"` : ""} muted ${description ? `aria-label="${description}"` : ""}>
					<source src="${path.toString(true)}" type="video/mp4">
				</video>
			</body>
		</html>`;
  }
  async readAndCacheSVGFile(path) {
    if (!this.svgCache.has(path)) {
      const contents = await this.readContentsOfPath(path, false);
      this.svgCache.set(path, contents);
    }
    return assertReturnsDefined(this.svgCache.get(path));
  }
  async readAndCacheStepMarkdown(path, base) {
    if (!this.mdCache.has(path)) {
      const contents = await this.readContentsOfPath(path);
      const markdownContents = await renderMarkdownDocument(transformUris(contents, base), this.extensionService, this.languageService, {
        sanitizerConfig: {
          allowedLinkProtocols: {
            override: "*"
          },
          allowedTags: {
            augment: [
              "select",
              "checkbox",
              "checklist"
            ]
          },
          allowedAttributes: {
            augment: [
              "x-dispatch",
              "data-command",
              "when-checked",
              "checked-on",
              "checked"
            ]
          }
        }
      });
      this.mdCache.set(path, markdownContents);
    }
    return assertReturnsDefined(this.mdCache.get(path));
  }
  async readContentsOfPath(path, useModuleId = true) {
    try {
      const moduleId = JSON.parse(path.query).moduleId;
      if (useModuleId && moduleId) {
        const contents = await new Promise((resolve, reject) => {
          const provider = gettingStartedContentRegistry.getProvider(moduleId);
          if (!provider) {
            reject(`Getting started: no provider registered for ${moduleId}`);
          } else {
            resolve(provider());
          }
        });
        return contents;
      }
    } catch {
    }
    try {
      const localizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${language}.md`) });
      const generalizedLocale = language?.replace(/-.*$/, "");
      const generalizedLocalizedPath = path.with({ path: path.path.replace(/\.md$/, `.nls.${generalizedLocale}.md`) });
      const fileExists = (file) => this.fileService.stat(file).then((stat) => !!stat.size).catch(() => false);
      const [localizedFileExists, generalizedLocalizedFileExists] = await Promise.all([
        fileExists(localizedPath),
        fileExists(generalizedLocalizedPath)
      ]);
      const bytes = await this.fileService.readFile(
        localizedFileExists ? localizedPath : generalizedLocalizedFileExists ? generalizedLocalizedPath : path
      );
      return bytes.value.toString();
    } catch (e) {
      this.notificationService.error("Error reading markdown document at `" + path + "`: " + e);
      return "";
    }
  }
};
GettingStartedDetailsRenderer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ILanguageService)
], GettingStartedDetailsRenderer);
const transformUri = (src, base) => {
  const path = joinPath(base, src);
  return asWebviewUri(path).toString(true);
};
const transformUris = (content, base) => content.replace(/src="([^"]*)"/g, (_, src) => {
  if (src.startsWith("https://")) {
    return `src="${src}"`;
  }
  return `src="${transformUri(src, base)}"`;
}).replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, title, src) => {
  if (src.startsWith("https://")) {
    return `![${title}](${src})`;
  }
  return `![${title}](${transformUri(src, base)})`;
});
export {
  GettingStartedDetailsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkRGV0YWlsc1JlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9NQVJLRE9XTl9TVFlMRVMsIHJlbmRlck1hcmtkb3duRG9jdW1lbnQgfSBmcm9tICcuLi8uLi9tYXJrZG93bi9icm93c2VyL21hcmtkb3duRG9jdW1lbnRSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGFzV2Vidmlld1VyaSB9IGZyb20gJy4uLy4uL3dlYnZpZXcvY29tbW9uL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBnZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9nZXR0aW5nU3RhcnRlZENvbnRlbnQuanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBHZXR0aW5nU3RhcnRlZERldGFpbHNSZW5kZXJlciB7XG5cdHByaXZhdGUgbWRDYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDxUcnVzdGVkSFRNTD4oKTtcblx0cHJpdmF0ZSBzdmdDYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcmVuZGVyTWFya2Rvd24ocGF0aDogVVJJLCBiYXNlOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlYWRBbmRDYWNoZVN0ZXBNYXJrZG93bihwYXRoLCBiYXNlKTtcblx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblxuXHRcdGNvbnN0IGNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblxuXHRcdGNvbnN0IGluRGV2ID0gZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wgPT09ICdodHRwOic7XG5cdFx0Y29uc3QgaW1nU3JjQ3NwID0gaW5EZXYgPyAnaW1nLXNyYyBodHRwczogZGF0YTogaHR0cDonIDogJ2ltZy1zcmMgaHR0cHM6IGRhdGE6JztcblxuXHRcdHJldHVybiBgPCFET0NUWVBFIGh0bWw+XG5cdFx0PGh0bWw+XG5cdFx0XHQ8aGVhZD5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtdHlwZVwiIGNvbnRlbnQ9XCJ0ZXh0L2h0bWw7Y2hhcnNldD1VVEYtOFwiPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiZGVmYXVsdC1zcmMgJ25vbmUnOyAke2ltZ1NyY0NzcH07IG1lZGlhLXNyYyBodHRwczo7IHNjcmlwdC1zcmMgJ25vbmNlLSR7bm9uY2V9Jzsgc3R5bGUtc3JjICdub25jZS0ke25vbmNlfSc7XCI+XG5cdFx0XHRcdDxzdHlsZSBub25jZT1cIiR7bm9uY2V9XCI+XG5cdFx0XHRcdFx0JHtERUZBVUxUX01BUktET1dOX1NUWUxFU31cblx0XHRcdFx0XHQke2Nzc31cblx0XHRcdFx0XHRib2R5ID4gaW1nIHtcblx0XHRcdFx0XHRcdGFsaWduLXNlbGY6IGZsZXgtc3RhcnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJvZHkgPiBpbWdbY2VudGVyZWRdIHtcblx0XHRcdFx0XHRcdGFsaWduLXNlbGY6IGNlbnRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ym9keSB7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBmbGV4O1xuXHRcdFx0XHRcdFx0ZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcblx0XHRcdFx0XHRcdHBhZGRpbmc6IDA7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IGluaGVyaXQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC50aGVtZS1waWNrZXItcm93IHtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0XHRcdGdhcDogMzJweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hlY2tsaXN0IHtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRnYXA6IDMycHg7XG5cdFx0XHRcdFx0XHRmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGVja2JveCB7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBmbGV4O1xuXHRcdFx0XHRcdFx0ZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcblx0XHRcdFx0XHRcdGFsaWduLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRtYXJnaW46IDVweDtcblx0XHRcdFx0XHRcdGN1cnNvcjogcG9pbnRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hlY2tib3ggPiBpbWcge1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJvdHRvbTogOHB4ICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPiBpbWcge1xuXHRcdFx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA+IGltZyB7XG5cdFx0XHRcdFx0XHRvdXRsaW5lOiAycHggc29saWQgdmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKTtcblx0XHRcdFx0XHRcdG91dGxpbmUtb2Zmc2V0OiA0cHg7XG5cdFx0XHRcdFx0XHRib3JkZXItcmFkaXVzOiA0cHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC50aGVtZS1waWNrZXItbGluayB7XG5cdFx0XHRcdFx0XHRtYXJnaW4tdG9wOiAxNnB4O1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS10ZXh0TGluay1mb3JlZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YmxvY2txdW90ZSA+IHA6Zmlyc3QtY2hpbGQge1xuXHRcdFx0XHRcdFx0bWFyZ2luLXRvcDogMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ym9keSA+ICoge1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJsb2NrLWVuZDogMC4yNWVtO1xuXHRcdFx0XHRcdFx0bWFyZ2luLWJsb2NrLXN0YXJ0OiAwLjI1ZW07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHZlcnRpY2FsbHktY2VudGVyZWQge1xuXHRcdFx0XHRcdFx0cGFkZGluZy10b3A6IDVweDtcblx0XHRcdFx0XHRcdHBhZGRpbmctYm90dG9tOiA1cHg7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBmbGV4O1xuXHRcdFx0XHRcdFx0anVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRodG1sIHtcblx0XHRcdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0XHRcdHBhZGRpbmctcmlnaHQ6IDMycHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGgxIHtcblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogMTkuNXB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRoMiB7XG5cdFx0XHRcdFx0XHRmb250LXNpemU6IDE4LjVweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdDwvc3R5bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0PHZlcnRpY2FsbHktY2VudGVyZWQ+XG5cdFx0XHRcdFx0JHtjb250ZW50fVxuXHRcdFx0XHQ8L3ZlcnRpY2FsbHktY2VudGVyZWQ+XG5cdFx0XHQ8L2JvZHk+XG5cdFx0XHQ8c2NyaXB0IG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0Y29uc3QgdnNjb2RlID0gYWNxdWlyZVZzQ29kZUFwaSgpO1xuXG5cdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1t3aGVuLWNoZWNrZWRdJykuZm9yRWFjaChlbCA9PiB7XG5cdFx0XHRcdFx0ZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHR2c2NvZGUucG9zdE1lc3NhZ2UoZWwuZ2V0QXR0cmlidXRlKCd3aGVuLWNoZWNrZWQnKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGxldCBvbmdvaW5nTGF5b3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBkb0xheW91dCA9ICgpID0+IHtcblx0XHRcdFx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd2ZXJ0aWNhbGx5LWNlbnRlcmVkJykuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRcdFx0XHRcdGVsZW1lbnQuc3R5bGUubWFyZ2luVG9wID0gTWF0aC5tYXgoKGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0IC0gZWxlbWVudC5zY3JvbGxIZWlnaHQpICogMy8xMCwgMCkgKyAncHgnO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdG9uZ29pbmdMYXlvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvbmdvaW5nTGF5b3V0KSB7XG5cdFx0XHRcdFx0XHRjbGVhclRpbWVvdXQob25nb2luZ0xheW91dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG9uZ29pbmdMYXlvdXQgPSBzZXRUaW1lb3V0KGRvTGF5b3V0LCAwKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRsYXlvdXQoKTtcblxuXHRcdFx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbWcnKS5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGVsZW1lbnQub25sb2FkID0gbGF5b3V0O1xuXHRcdFx0XHR9KVxuXG5cdFx0XHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdGlmIChldmVudC5kYXRhLmxheW91dE1lTm93KSB7XG5cdFx0XHRcdFx0XHRsYXlvdXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGV2ZW50LmRhdGEuZW5hYmxlZENvbnRleHRLZXlzKSB7XG5cdFx0XHRcdFx0XHRkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuY2hlY2tlZCcpLmZvckVhY2goZWxlbWVudCA9PiBlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NoZWNrZWQnKSlcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGV2ZW50LmRhdGEuZW5hYmxlZENvbnRleHRLZXlzKSB7XG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tjaGVja2VkLW9uPVwiJyArIGtleSArICdcIl0nKS5mb3JFYWNoKGVsZW1lbnQgPT4gZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGVja2VkJykpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHQ8L3NjcmlwdD5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdGFzeW5jIHJlbmRlclNWRyhwYXRoOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlYWRBbmRDYWNoZVNWR0ZpbGUocGF0aCk7XG5cdFx0Y29uc3Qgbm9uY2UgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cblx0XHRjb25zdCBjc3MgPSBjb2xvck1hcCA/IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApIDogJyc7XG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cblx0XHQ8aHRtbD5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC10eXBlXCIgY29udGVudD1cInRleHQvaHRtbDtjaGFyc2V0PVVURi04XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7IGltZy1zcmMgZGF0YTo7IHN0eWxlLXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuXHRcdFx0XHQ8c3R5bGUgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdCR7REVGQVVMVF9NQVJLRE9XTl9TVFlMRVN9XG5cdFx0XHRcdFx0JHtjc3N9XG5cdFx0XHRcdFx0c3ZnIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDtcblx0XHRcdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0XHRcdHdpZHRoOiA4MCU7XG5cdFx0XHRcdFx0XHRsZWZ0OiA1MCU7XG5cdFx0XHRcdFx0XHR0b3A6IDUwJTtcblx0XHRcdFx0XHRcdG1heC13aWR0aDogNTMwcHg7XG5cdFx0XHRcdFx0XHRtaW4td2lkdGg6IDM1MHB4O1xuXHRcdFx0XHRcdFx0dHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwtNTAlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdDwvc3R5bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0JHtjb250ZW50fVxuXHRcdFx0PC9ib2R5PlxuXHRcdDwvaHRtbD5gO1xuXHR9XG5cblx0YXN5bmMgcmVuZGVyVmlkZW8ocGF0aDogVVJJLCBwb3N0ZXI/OiBVUkksIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cblx0XHQ8aHRtbD5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC10eXBlXCIgY29udGVudD1cInRleHQvaHRtbDtjaGFyc2V0PVVURi04XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7IGltZy1zcmMgaHR0cHM6OyBtZWRpYS1zcmMgaHR0cHM6OyBzY3JpcHQtc3JjICdub25jZS0ke25vbmNlfSc7IHN0eWxlLXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuXHRcdFx0XHQ8c3R5bGUgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdHZpZGVvIHtcblx0XHRcdFx0XHRcdG1heC13aWR0aDogMTAwJTtcblx0XHRcdFx0XHRcdG1heC1oZWlnaHQ6IDEwMCU7XG5cdFx0XHRcdFx0XHRvYmplY3QtZml0OiBjb3Zlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdDwvc3R5bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0PHZpZGVvIGNvbnRyb2xzIGF1dG9wbGF5ICR7cG9zdGVyID8gYHBvc3Rlcj1cIiR7cG9zdGVyLnRvU3RyaW5nKHRydWUpfVwiYCA6ICcnfSBtdXRlZCAke2Rlc2NyaXB0aW9uID8gYGFyaWEtbGFiZWw9XCIke2Rlc2NyaXB0aW9ufVwiYCA6ICcnfT5cblx0XHRcdFx0XHQ8c291cmNlIHNyYz1cIiR7cGF0aC50b1N0cmluZyh0cnVlKX1cIiB0eXBlPVwidmlkZW8vbXA0XCI+XG5cdFx0XHRcdDwvdmlkZW8+XG5cdFx0XHQ8L2JvZHk+XG5cdFx0PC9odG1sPmA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRBbmRDYWNoZVNWR0ZpbGUocGF0aDogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuc3ZnQ2FjaGUuaGFzKHBhdGgpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMucmVhZENvbnRlbnRzT2ZQYXRoKHBhdGgsIGZhbHNlKTtcblx0XHRcdHRoaXMuc3ZnQ2FjaGUuc2V0KHBhdGgsIGNvbnRlbnRzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuc3ZnQ2FjaGUuZ2V0KHBhdGgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZEFuZENhY2hlU3RlcE1hcmtkb3duKHBhdGg6IFVSSSwgYmFzZTogVVJJKTogUHJvbWlzZTxUcnVzdGVkSFRNTD4ge1xuXHRcdGlmICghdGhpcy5tZENhY2hlLmhhcyhwYXRoKSkge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLnJlYWRDb250ZW50c09mUGF0aChwYXRoKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGVudHMgPSBhd2FpdCByZW5kZXJNYXJrZG93bkRvY3VtZW50KHRyYW5zZm9ybVVyaXMoY29udGVudHMsIGJhc2UpLCB0aGlzLmV4dGVuc2lvblNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0XHRcdGFsbG93ZWRMaW5rUHJvdG9jb2xzOiB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZTogJyonXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxvd2VkVGFnczoge1xuXHRcdFx0XHRcdFx0YXVnbWVudDogW1xuXHRcdFx0XHRcdFx0XHQnc2VsZWN0Jyxcblx0XHRcdFx0XHRcdFx0J2NoZWNrYm94Jyxcblx0XHRcdFx0XHRcdFx0J2NoZWNrbGlzdCcsXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0XHRcdFx0YXVnbWVudDogW1xuXHRcdFx0XHRcdFx0XHQneC1kaXNwYXRjaCcsXG5cdFx0XHRcdFx0XHRcdCdkYXRhLWNvbW1hbmQnLFxuXHRcdFx0XHRcdFx0XHQnd2hlbi1jaGVja2VkJyxcblx0XHRcdFx0XHRcdFx0J2NoZWNrZWQtb24nLFxuXHRcdFx0XHRcdFx0XHQnY2hlY2tlZCcsXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLm1kQ2FjaGUuc2V0KHBhdGgsIG1hcmtkb3duQ29udGVudHMpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5tZENhY2hlLmdldChwYXRoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRDb250ZW50c09mUGF0aChwYXRoOiBVUkksIHVzZU1vZHVsZUlkID0gdHJ1ZSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZHVsZUlkID0gSlNPTi5wYXJzZShwYXRoLnF1ZXJ5KS5tb2R1bGVJZDtcblx0XHRcdGlmICh1c2VNb2R1bGVJZCAmJiBtb2R1bGVJZCkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkuZ2V0UHJvdmlkZXIobW9kdWxlSWQpO1xuXHRcdFx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdHJlamVjdChgR2V0dGluZyBzdGFydGVkOiBubyBwcm92aWRlciByZWdpc3RlcmVkIGZvciAke21vZHVsZUlkfWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHByb3ZpZGVyKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjb250ZW50cztcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgfVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2FsaXplZFBhdGggPSBwYXRoLndpdGgoeyBwYXRoOiBwYXRoLnBhdGgucmVwbGFjZSgvXFwubWQkLywgYC5ubHMuJHtsYW5ndWFnZX0ubWRgKSB9KTtcblxuXHRcdFx0Y29uc3QgZ2VuZXJhbGl6ZWRMb2NhbGUgPSBsYW5ndWFnZT8ucmVwbGFjZSgvLS4qJC8sICcnKTtcblx0XHRcdGNvbnN0IGdlbmVyYWxpemVkTG9jYWxpemVkUGF0aCA9IHBhdGgud2l0aCh7IHBhdGg6IHBhdGgucGF0aC5yZXBsYWNlKC9cXC5tZCQvLCBgLm5scy4ke2dlbmVyYWxpemVkTG9jYWxlfS5tZGApIH0pO1xuXG5cdFx0XHRjb25zdCBmaWxlRXhpc3RzID0gKGZpbGU6IFVSSSkgPT4gdGhpcy5maWxlU2VydmljZVxuXHRcdFx0XHQuc3RhdChmaWxlKVxuXHRcdFx0XHQudGhlbigoc3RhdCkgPT4gISFzdGF0LnNpemUpIC8vIERvdWJsZSBjaGVjayB0aGUgZmlsZSBhY3R1YWxseSBoYXMgY29udGVudCBmb3IgZmlsZVN5c3RlbVByb3ZpZGVycyB0aGF0IGZha2UgYHN0YXRgLiAjMTMxODA5XG5cdFx0XHRcdC5jYXRjaCgoKSA9PiBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IFtsb2NhbGl6ZWRGaWxlRXhpc3RzLCBnZW5lcmFsaXplZExvY2FsaXplZEZpbGVFeGlzdHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRmaWxlRXhpc3RzKGxvY2FsaXplZFBhdGgpLFxuXHRcdFx0XHRmaWxlRXhpc3RzKGdlbmVyYWxpemVkTG9jYWxpemVkUGF0aCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYnl0ZXMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKFxuXHRcdFx0XHRsb2NhbGl6ZWRGaWxlRXhpc3RzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZWRQYXRoXG5cdFx0XHRcdFx0OiBnZW5lcmFsaXplZExvY2FsaXplZEZpbGVFeGlzdHNcblx0XHRcdFx0XHRcdD8gZ2VuZXJhbGl6ZWRMb2NhbGl6ZWRQYXRoXG5cdFx0XHRcdFx0XHQ6IHBhdGgpO1xuXG5cdFx0XHRyZXR1cm4gYnl0ZXMudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoJ0Vycm9yIHJlYWRpbmcgbWFya2Rvd24gZG9jdW1lbnQgYXQgYCcgKyBwYXRoICsgJ2A6ICcgKyBlKTtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgdHJhbnNmb3JtVXJpID0gKHNyYzogc3RyaW5nLCBiYXNlOiBVUkkpID0+IHtcblx0Y29uc3QgcGF0aCA9IGpvaW5QYXRoKGJhc2UsIHNyYyk7XG5cdHJldHVybiBhc1dlYnZpZXdVcmkocGF0aCkudG9TdHJpbmcodHJ1ZSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1VcmlzID0gKGNvbnRlbnQ6IHN0cmluZywgYmFzZTogVVJJKTogc3RyaW5nID0+IGNvbnRlbnRcblx0LnJlcGxhY2UoL3NyYz1cIihbXlwiXSopXCIvZywgKF8sIHNyYzogc3RyaW5nKSA9PiB7XG5cdFx0aWYgKHNyYy5zdGFydHNXaXRoKCdodHRwczovLycpKSB7IHJldHVybiBgc3JjPVwiJHtzcmN9XCJgOyB9XG5cdFx0cmV0dXJuIGBzcmM9XCIke3RyYW5zZm9ybVVyaShzcmMsIGJhc2UpfVwiYDtcblx0fSlcblx0LnJlcGxhY2UoLyFcXFsoW15cXF1dKilcXF1cXCgoW14pXSopXFwpL2csIChfLCB0aXRsZTogc3RyaW5nLCBzcmM6IHN0cmluZykgPT4ge1xuXHRcdGlmIChzcmMuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkgeyByZXR1cm4gYCFbJHt0aXRsZX1dKCR7c3JjfSlgOyB9XG5cdFx0cmV0dXJuIGAhWyR7dGl0bGV9XSgke3RyYW5zZm9ybVVyaShzcmMsIGJhc2UpfSlgO1xuXHR9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUIsOEJBQThCO0FBRWhFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBR3ZDLElBQU0sZ0NBQU4sTUFBb0M7QUFBQSxFQUkxQyxZQUNnQyxhQUNRLHFCQUNILGtCQUNELGlCQUNsQztBQUo4QjtBQUNRO0FBQ0g7QUFDRDtBQVBwQyxTQUFRLFVBQVUsSUFBSSxZQUF5QjtBQUMvQyxTQUFRLFdBQVcsSUFBSSxZQUFvQjtBQUFBLEVBT3ZDO0FBQUEsRUFFSixNQUFNLGVBQWUsTUFB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
