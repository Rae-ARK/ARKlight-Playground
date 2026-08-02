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
import { addDisposableListener, getWindow, isHTMLElement, reset } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Schemas } from "../../../../base/common/network.js";
import * as osPath from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITunnelService } from "../../../../platform/tunnel/common/tunnel.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { Iterable } from "../../../../base/common/iterator.js";
const CONTROL_CODES = "\\u0000-\\u0020\\u007f-\\u009f";
const WEB_LINK_REGEX = new RegExp("(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s" + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + `"')}\\],:;.!?]`, "ug");
const WIN_ABSOLUTE_PATH = /(?:[a-zA-Z]:(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_RELATIVE_PATH = /(?:(?:\~|\.+)(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /((?:\~|\.+)?(?:\/[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const LINE_COLUMN = /(?::(?:line\s+)?([\d]+))?(?::([\d]+))?/;
const PATH_LINK_REGEX = new RegExp(`${platform.isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, "g");
const LINE_COLUMN_REGEX = /:(?:line\s+)?([\d]+)(?::([\d]+))?$/;
const MAX_LENGTH = 2e3;
var DebugLinkHoverBehavior = /* @__PURE__ */ ((DebugLinkHoverBehavior2) => {
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["Rich"] = 0] = "Rich";
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["Basic"] = 1] = "Basic";
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["None"] = 2] = "None";
  return DebugLinkHoverBehavior2;
})(DebugLinkHoverBehavior || {});
let LinkDetector = class {
  constructor(editorService, fileService, openerService, pathService, tunnelService, environmentService, configurationService, hoverService) {
    this.editorService = editorService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.pathService = pathService;
    this.tunnelService = tunnelService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
  }
  /**
   * Matches and handles web urls, absolute and relative file links in the string provided.
   * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
   * 'onclick' event is attached to all anchored links that opens them in the editor.
   * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
   * and added as a child of the returned <span>.
   * The `hoverBehavior` is required and manages the lifecycle of event listeners.
   */
  linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) {
    return this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights);
  }
  _linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, defaultRef) {
    if (splitLines) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        lines[i] = lines[i] + "\n";
      }
      if (!lines[lines.length - 1]) {
        lines.pop();
      }
      const elements = lines.map((line) => this._linkify(line, hoverBehavior, false, workspaceFolder, includeFulltext, highlights, defaultRef));
      if (elements.length === 1) {
        return elements[0];
      }
      const container2 = document.createElement("span");
      elements.forEach((e) => container2.appendChild(e));
      return container2;
    }
    const container = document.createElement("span");
    for (const part of this.detectLinks(text)) {
      try {
        let node;
        switch (part.kind) {
          case "text":
            node = defaultRef ? this.linkifyLocation(part.value, defaultRef.locationReference, defaultRef.session, hoverBehavior) : document.createTextNode(part.value);
            break;
          case "web":
            node = this.createWebLink(includeFulltext ? text : void 0, part.value, hoverBehavior);
            break;
          case "path": {
            const path = part.captures[0];
            const lineNumber = part.captures[1] ? Number(part.captures[1]) : 0;
            const columnNumber = part.captures[2] ? Number(part.captures[2]) : 0;
            node = this.createPathLink(includeFulltext ? text : void 0, part.value, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior);
            break;
          }
          default:
            node = document.createTextNode(part.value);
        }
        container.append(...this.applyHighlights(node, part.index, part.value.length, highlights));
      } catch (e) {
        container.appendChild(document.createTextNode(part.value));
      }
    }
    return container;
  }
  applyHighlights(node, startIndex, length, highlights) {
    const children = [];
    let currentIndex = startIndex;
    const endIndex = startIndex + length;
    for (const highlight of highlights || []) {
      if (highlight.end <= currentIndex || highlight.start >= endIndex) {
        continue;
      }
      if (highlight.start > currentIndex) {
        children.push(node.textContent.substring(currentIndex - startIndex, highlight.start - startIndex));
        currentIndex = highlight.start;
      }
      const highlightEnd = Math.min(highlight.end, endIndex);
      const highlightedText = node.textContent.substring(currentIndex - startIndex, highlightEnd - startIndex);
      const highlightSpan = document.createElement("span");
      highlightSpan.classList.add("highlight");
      if (highlight.extraClasses) {
        highlightSpan.classList.add(...highlight.extraClasses);
      }
      highlightSpan.textContent = highlightedText;
      children.push(highlightSpan);
      currentIndex = highlightEnd;
    }
    if (currentIndex === startIndex) {
      return Iterable.single(node);
    }
    if (currentIndex < endIndex) {
      children.push(node.textContent.substring(currentIndex - startIndex));
    }
    if (isHTMLElement(node)) {
      reset(node, ...children);
      return Iterable.single(node);
    }
    return children;
  }
  /**
   * Linkifies a location reference.
   */
  linkifyLocation(text, locationReference, session, hoverBehavior) {
    const link = this.createLink(text);
    this.decorateLink(link, void 0, text, hoverBehavior, async (preserveFocus) => {
      const location = await session.resolveLocationReference(locationReference);
      await location.source.openInEditor(this.editorService, {
        startLineNumber: location.line,
        startColumn: location.column,
        endLineNumber: location.endLine ?? location.line,
        endColumn: location.endColumn ?? location.column
      }, preserveFocus);
    });
    return link;
  }
  /**
   * Makes an {@link ILinkDetector} that links everything in the output to the
   * reference if they don't have other explicit links.
   */
  makeReferencedLinkDetector(locationReference, session) {
    return {
      linkify: (text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) => this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, { locationReference, session }),
      linkifyLocation: this.linkifyLocation.bind(this)
    };
  }
  createWebLink(fulltext, url, hoverBehavior) {
    const link = this.createLink(url);
    let uri = URI.parse(url);
    const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
    if (lineCol) {
      uri = uri.with({
        path: uri.path.slice(0, lineCol.index),
        fragment: `L${lineCol[0].slice(1)}`
      });
    }
    this.decorateLink(link, uri, fulltext, hoverBehavior, async () => {
      if (uri.scheme === Schemas.file) {
        const fsPath = uri.fsPath;
        const path = await this.pathService.path;
        const fileUrl = osPath.normalize(path.sep === osPath.posix.sep && platform.isWindows ? fsPath.replace(/\\/g, osPath.posix.sep) : fsPath);
        const fileUri = URI.parse(fileUrl);
        const exists = await this.fileService.exists(fileUri);
        if (!exists) {
          return;
        }
        await this.editorService.openEditor({
          resource: fileUri,
          options: {
            pinned: true,
            selection: lineCol ? { startLineNumber: +lineCol[1], startColumn: lineCol[2] ? +lineCol[2] : 1 } : void 0
          }
        });
        return;
      }
      this.openerService.open(url, { allowTunneling: !!this.environmentService.remoteAuthority && this.configurationService.getValue("remote.forwardOnOpen") });
    });
    return link;
  }
  createPathLink(fulltext, text, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior) {
    if (path[0] === "/" && path[1] === "/") {
      return document.createTextNode(text);
    }
    const options = lineNumber > 0 ? { selection: { startLineNumber: lineNumber, startColumn: columnNumber > 0 ? columnNumber : 1 } } : {};
    if (path[0] === ".") {
      if (!workspaceFolder) {
        return document.createTextNode(text);
      }
      const uri2 = workspaceFolder.toResource(path);
      const link2 = this.createLink(text);
      this.decorateLink(link2, uri2, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri2, options: { ...options, preserveFocus } }));
      return link2;
    }
    if (path[0] === "~") {
      const userHome = this.pathService.resolvedUserHome;
      if (userHome) {
        path = osPath.join(userHome.fsPath, path.substring(1));
      }
    }
    const link = this.createLink(text);
    link.tabIndex = 0;
    const uri = URI.file(osPath.normalize(path));
    this.fileService.stat(uri).then((stat) => {
      if (stat.isDirectory) {
        return;
      }
      this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
    }).catch(() => {
    });
    return link;
  }
  createLink(text) {
    const link = document.createElement("a");
    link.textContent = text;
    return link;
  }
  decorateLink(link, uri, fulltext, hoverBehavior, onClick) {
    if (hoverBehavior.store.isDisposed) {
      return;
    }
    link.classList.add("link");
    const followLink = uri && this.tunnelService.canTunnel(uri) ? localize("followForwardedLink", "follow link using forwarded port") : localize("followLink", "follow link");
    const title = link.ariaLabel = fulltext ? platform.isMacintosh ? localize("fileLinkWithPathMac", "Cmd + click to {0}\n{1}", followLink, fulltext) : localize("fileLinkWithPath", "Ctrl + click to {0}\n{1}", followLink, fulltext) : platform.isMacintosh ? localize("fileLinkMac", "Cmd + click to {0}", followLink) : localize("fileLink", "Ctrl + click to {0}", followLink);
    if (hoverBehavior.type === 0 /* Rich */) {
      hoverBehavior.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), link, title));
    } else if (hoverBehavior.type !== 2 /* None */) {
      link.title = title;
    }
    hoverBehavior.store.add(addDisposableListener(link, "mousemove", (event) => {
      link.classList.toggle("pointer", platform.isMacintosh ? event.metaKey : event.ctrlKey);
    }));
    hoverBehavior.store.add(addDisposableListener(link, "mouseleave", () => {
      link.classList.remove("pointer");
    }));
    hoverBehavior.store.add(addDisposableListener(link, "click", (event) => {
      const selection = getWindow(link).getSelection();
      if (!selection || selection.type === "Range") {
        return;
      }
      if (!(platform.isMacintosh ? event.metaKey : event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onClick(false);
    }));
    hoverBehavior.store.add(addDisposableListener(link, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
        event.preventDefault();
        event.stopPropagation();
        onClick(event.keyCode === KeyCode.Space);
      }
    }));
  }
  detectLinks(text) {
    if (text.length > MAX_LENGTH) {
      return [{ kind: "text", value: text, captures: [], index: 0 }];
    }
    const regexes = [WEB_LINK_REGEX, PATH_LINK_REGEX];
    const kinds = ["web", "path"];
    const result = [];
    const splitOne = (text2, regexIndex, baseIndex) => {
      if (regexIndex >= regexes.length) {
        result.push({ value: text2, kind: "text", captures: [], index: baseIndex });
        return;
      }
      const regex = regexes[regexIndex];
      let currentIndex = 0;
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(text2)) !== null) {
        const stringBeforeMatch = text2.substring(currentIndex, match.index);
        if (stringBeforeMatch) {
          splitOne(stringBeforeMatch, regexIndex + 1, baseIndex + currentIndex);
        }
        const value = match[0];
        result.push({
          value,
          kind: kinds[regexIndex],
          captures: match.slice(1),
          index: baseIndex + match.index
        });
        currentIndex = match.index + value.length;
      }
      const stringAfterMatches = text2.substring(currentIndex);
      if (stringAfterMatches) {
        splitOne(stringAfterMatches, regexIndex + 1, baseIndex + currentIndex);
      }
    };
    splitOne(text, 0, 0);
    return result;
  }
};
LinkDetector = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IPathService),
  __decorateParam(4, ITunnelService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IHoverService)
], LinkDetector);
export {
  DebugLinkHoverBehavior,
  LinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvbGlua0RldGVjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIG9zUGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUdW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElEZWJ1Z1Nlc3Npb24gfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhpZ2hsaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5cbmNvbnN0IENPTlRST0xfQ09ERVMgPSAnXFxcXHUwMDAwLVxcXFx1MDAyMFxcXFx1MDA3Zi1cXFxcdTAwOWYnO1xuY29uc3QgV0VCX0xJTktfUkVHRVggPSBuZXcgUmVnRXhwKCcoPzpbYS16QS1aXVthLXpBLVowLTkrLi1dezIsfTpcXFxcL1xcXFwvfGRhdGE6fHd3d1xcXFwuKVteXFxcXHMnICsgQ09OVFJPTF9DT0RFUyArICdcIl17Mix9W15cXFxccycgKyBDT05UUk9MX0NPREVTICsgJ1wiXFwnKX1cXFxcXSw6Oy4hP10nLCAndWcnKTtcblxuY29uc3QgV0lOX0FCU09MVVRFX1BBVEggPSAvKD86W2EtekEtWl06KD86KD86XFxcXHxcXC8pW1xcd1xcc1xcLkBcXC1cXChcXClcXFtcXF17fSEjJCVeJidgfis9XSspKykvO1xuY29uc3QgV0lOX1JFTEFUSVZFX1BBVEggPSAvKD86KD86XFx+fFxcLispKD86KD86XFxcXHxcXC8pW1xcd1xcc1xcLkBcXC1cXChcXClcXFtcXF17fSEjJCVeJidgfis9XSspKykvO1xuY29uc3QgV0lOX1BBVEggPSBuZXcgUmVnRXhwKGAoJHtXSU5fQUJTT0xVVEVfUEFUSC5zb3VyY2V9fCR7V0lOX1JFTEFUSVZFX1BBVEguc291cmNlfSlgKTtcbmNvbnN0IFBPU0lYX1BBVEggPSAvKCg/OlxcfnxcXC4rKT8oPzpcXC9bXFx3XFxzXFwuQFxcLVxcKFxcKVxcW1xcXXt9ISMkJV4mJ2B+Kz1dKykrKS87XG4vLyBTdXBwb3J0IGJvdGggXCI6bGluZSAxMjNcIiBhbmQgXCI6MTIzOjQ1XCIgZm9ybWF0cyBmb3IgbGluZS9jb2x1bW4gbnVtYmVyc1xuY29uc3QgTElORV9DT0xVTU4gPSAvKD86Oig/OmxpbmVcXHMrKT8oW1xcZF0rKSk/KD86OihbXFxkXSspKT8vO1xuY29uc3QgUEFUSF9MSU5LX1JFR0VYID0gbmV3IFJlZ0V4cChgJHtwbGF0Zm9ybS5pc1dpbmRvd3MgPyBXSU5fUEFUSC5zb3VyY2UgOiBQT1NJWF9QQVRILnNvdXJjZX0ke0xJTkVfQ09MVU1OLnNvdXJjZX1gLCAnZycpO1xuY29uc3QgTElORV9DT0xVTU5fUkVHRVggPSAvOig/OmxpbmVcXHMrKT8oW1xcZF0rKSg/OjooW1xcZF0rKSk/JC87XG5cbmNvbnN0IE1BWF9MRU5HVEggPSAyMDAwO1xuXG50eXBlIExpbmtLaW5kID0gJ3dlYicgfCAncGF0aCcgfCAndGV4dCc7XG50eXBlIExpbmtQYXJ0ID0ge1xuXHRraW5kOiBMaW5rS2luZDtcblx0dmFsdWU6IHN0cmluZztcblx0Y2FwdHVyZXM6IHN0cmluZ1tdO1xuXHRpbmRleDogbnVtYmVyO1xufTtcblxuZXhwb3J0IGNvbnN0IGVudW0gRGVidWdMaW5rSG92ZXJCZWhhdmlvciB7XG5cdC8qKiBBIG5pY2Ugd29ya2JlbmNoIGhvdmVyICovXG5cdFJpY2gsXG5cdC8qKlxuXHQgKiBCYXNpYyBicm93c2VyIGhvdmVyXG5cdCAqIEBkZXByZWNhdGVkIENvbnN1bWVycyBzaG91bGQgYWRvcHQgYHJpY2hgIGJ5IHByb3BhZ2F0aW5nIGRpc3Bvc2FibGVzIGFwcHJvcHJpYXRlbHlcblx0ICovXG5cdEJhc2ljLFxuXHQvKiogTm8gaG92ZXIgKi9cblx0Tm9uZVxufVxuXG4vKiogU3RvcmUgaW1wbGllcyBIb3ZlckJlaGF2aW9yPXJpY2ggKi9cbmV4cG9ydCB0eXBlIERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSA9XG5cdHwgeyB0eXBlOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLk5vbmU7IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfVxuXHR8IHsgdHlwZTogRGVidWdMaW5rSG92ZXJCZWhhdmlvci5CYXNpYzsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9XG5cdHwgeyB0eXBlOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLlJpY2g7IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfTtcblxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmtEZXRlY3RvciB7XG5cdGxpbmtpZnkodGV4dDogc3RyaW5nLCBob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEsIHNwbGl0TGluZXM/OiBib29sZWFuLCB3b3Jrc3BhY2VGb2xkZXI/OiBJV29ya3NwYWNlRm9sZGVyLCBpbmNsdWRlRnVsbHRleHQ/OiBib29sZWFuLCBoaWdobGlnaHRzPzogSUhpZ2hsaWdodFtdKTogSFRNTEVsZW1lbnQ7XG5cdGxpbmtpZnlMb2NhdGlvbih0ZXh0OiBzdHJpbmcsIGxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXIsIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSk6IEhUTUxFbGVtZW50O1xufVxuXG5leHBvcnQgY2xhc3MgTGlua0RldGVjdG9yIGltcGxlbWVudHMgSUxpbmtEZXRlY3RvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHQvKipcblx0ICogTWF0Y2hlcyBhbmQgaGFuZGxlcyB3ZWIgdXJscywgYWJzb2x1dGUgYW5kIHJlbGF0aXZlIGZpbGUgbGlua3MgaW4gdGhlIHN0cmluZyBwcm92aWRlZC5cblx0ICogUmV0dXJucyA8c3Bhbi8+IGVsZW1lbnQgdGhhdCB3cmFwcyB0aGUgcHJvY2Vzc2VkIHN0cmluZywgd2hlcmUgbWF0Y2hlZCBsaW5rcyBhcmUgcmVwbGFjZWQgYnkgPGEvPi5cblx0ICogJ29uY2xpY2snIGV2ZW50IGlzIGF0dGFjaGVkIHRvIGFsbCBhbmNob3JlZCBsaW5rcyB0aGF0IG9wZW5zIHRoZW0gaW4gdGhlIGVkaXRvci5cblx0ICogV2hlbiBzcGxpdExpbmVzIGlzIHRydWUsIGVhY2ggbGluZSBvZiB0aGUgdGV4dCwgZXZlbiBpZiBpdCBjb250YWlucyBubyBsaW5rcywgaXMgd3JhcHBlZCBpbiBhIDxzcGFuPlxuXHQgKiBhbmQgYWRkZWQgYXMgYSBjaGlsZCBvZiB0aGUgcmV0dXJuZWQgPHNwYW4+LlxuXHQgKiBUaGUgYGhvdmVyQmVoYXZpb3JgIGlzIHJlcXVpcmVkIGFuZCBtYW5hZ2VzIHRoZSBsaWZlY3ljbGUgb2YgZXZlbnQgbGlzdGVuZXJzLlxuXHQgKi9cblx0bGlua2lmeSh0ZXh0OiBzdHJpbmcsIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSwgc3BsaXRMaW5lcz86IGJvb2xlYW4sIHdvcmtzcGFjZUZvbGRlcj86IElXb3Jrc3BhY2VGb2xkZXIsIGluY2x1ZGVGdWxsdGV4dD86IGJvb2xlYW4sIGhpZ2hsaWdodHM/OiBJSGlnaGxpZ2h0W10pOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmtpZnkodGV4dCwgaG92ZXJCZWhhdmlvciwgc3BsaXRMaW5lcywgd29ya3NwYWNlRm9sZGVyLCBpbmNsdWRlRnVsbHRleHQsIGhpZ2hsaWdodHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGlua2lmeSh0ZXh0OiBzdHJpbmcsIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSwgc3BsaXRMaW5lcz86IGJvb2xlYW4sIHdvcmtzcGFjZUZvbGRlcj86IElXb3Jrc3BhY2VGb2xkZXIsIGluY2x1ZGVGdWxsdGV4dD86IGJvb2xlYW4sIGhpZ2hsaWdodHM/OiBJSGlnaGxpZ2h0W10sIGRlZmF1bHRSZWY/OiB7IGxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXI7IHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfSk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAoc3BsaXRMaW5lcykge1xuXHRcdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoIC0gMTsgaSsrKSB7XG5cdFx0XHRcdGxpbmVzW2ldID0gbGluZXNbaV0gKyAnXFxuJztcblx0XHRcdH1cblx0XHRcdGlmICghbGluZXNbbGluZXMubGVuZ3RoIC0gMV0pIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBsYXN0IGVsZW1lbnQgKCcnKSB0aGF0IHNwbGl0IGFkZGVkLlxuXHRcdFx0XHRsaW5lcy5wb3AoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVsZW1lbnRzID0gbGluZXMubWFwKGxpbmUgPT4gdGhpcy5fbGlua2lmeShsaW5lLCBob3ZlckJlaGF2aW9yLCBmYWxzZSwgd29ya3NwYWNlRm9sZGVyLCBpbmNsdWRlRnVsbHRleHQsIGhpZ2hsaWdodHMsIGRlZmF1bHRSZWYpKTtcblx0XHRcdGlmIChlbGVtZW50cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gRG8gbm90IHdyYXAgc2luZ2xlIGxpbmUgd2l0aCBleHRyYSBzcGFuLlxuXHRcdFx0XHRyZXR1cm4gZWxlbWVudHNbMF07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRlbGVtZW50cy5mb3JFYWNoKGUgPT4gY29udGFpbmVyLmFwcGVuZENoaWxkKGUpKTtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLmRldGVjdExpbmtzKHRleHQpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgbm9kZTogTm9kZTtcblx0XHRcdFx0c3dpdGNoIChwYXJ0LmtpbmQpIHtcblx0XHRcdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0XHRcdG5vZGUgPSBkZWZhdWx0UmVmID8gdGhpcy5saW5raWZ5TG9jYXRpb24ocGFydC52YWx1ZSwgZGVmYXVsdFJlZi5sb2NhdGlvblJlZmVyZW5jZSwgZGVmYXVsdFJlZi5zZXNzaW9uLCBob3ZlckJlaGF2aW9yKSA6IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHBhcnQudmFsdWUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnd2ViJzpcblx0XHRcdFx0XHRcdG5vZGUgPSB0aGlzLmNyZWF0ZVdlYkxpbmsoaW5jbHVkZUZ1bGx0ZXh0ID8gdGV4dCA6IHVuZGVmaW5lZCwgcGFydC52YWx1ZSwgaG92ZXJCZWhhdmlvcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdwYXRoJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGF0aCA9IHBhcnQuY2FwdHVyZXNbMF07XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcGFydC5jYXB0dXJlc1sxXSA/IE51bWJlcihwYXJ0LmNhcHR1cmVzWzFdKSA6IDA7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2x1bW5OdW1iZXIgPSBwYXJ0LmNhcHR1cmVzWzJdID8gTnVtYmVyKHBhcnQuY2FwdHVyZXNbMl0pIDogMDtcblx0XHRcdFx0XHRcdG5vZGUgPSB0aGlzLmNyZWF0ZVBhdGhMaW5rKGluY2x1ZGVGdWxsdGV4dCA/IHRleHQgOiB1bmRlZmluZWQsIHBhcnQudmFsdWUsIHBhdGgsIGxpbmVOdW1iZXIsIGNvbHVtbk51bWJlciwgd29ya3NwYWNlRm9sZGVyLCBob3ZlckJlaGF2aW9yKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0bm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHBhcnQudmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZCguLi50aGlzLmFwcGx5SGlnaGxpZ2h0cyhub2RlLCBwYXJ0LmluZGV4LCBwYXJ0LnZhbHVlLmxlbmd0aCwgaGlnaGxpZ2h0cykpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocGFydC52YWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUhpZ2hsaWdodHMobm9kZTogTm9kZSwgc3RhcnRJbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgaGlnaGxpZ2h0czogSUhpZ2hsaWdodFtdIHwgdW5kZWZpbmVkKTogSXRlcmFibGU8Tm9kZSB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IGNoaWxkcmVuOiAoTm9kZSB8IHN0cmluZylbXSA9IFtdO1xuXHRcdGxldCBjdXJyZW50SW5kZXggPSBzdGFydEluZGV4O1xuXHRcdGNvbnN0IGVuZEluZGV4ID0gc3RhcnRJbmRleCArIGxlbmd0aDtcblxuXHRcdGZvciAoY29uc3QgaGlnaGxpZ2h0IG9mIGhpZ2hsaWdodHMgfHwgW10pIHtcblx0XHRcdGlmIChoaWdobGlnaHQuZW5kIDw9IGN1cnJlbnRJbmRleCB8fCBoaWdobGlnaHQuc3RhcnQgPj0gZW5kSW5kZXgpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoaWdobGlnaHQuc3RhcnQgPiBjdXJyZW50SW5kZXgpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaChub2RlLnRleHRDb250ZW50IS5zdWJzdHJpbmcoY3VycmVudEluZGV4IC0gc3RhcnRJbmRleCwgaGlnaGxpZ2h0LnN0YXJ0IC0gc3RhcnRJbmRleCkpO1xuXHRcdFx0XHRjdXJyZW50SW5kZXggPSBoaWdobGlnaHQuc3RhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhpZ2hsaWdodEVuZCA9IE1hdGgubWluKGhpZ2hsaWdodC5lbmQsIGVuZEluZGV4KTtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodGVkVGV4dCA9IG5vZGUudGV4dENvbnRlbnQhLnN1YnN0cmluZyhjdXJyZW50SW5kZXggLSBzdGFydEluZGV4LCBoaWdobGlnaHRFbmQgLSBzdGFydEluZGV4KTtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodFNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRoaWdobGlnaHRTcGFuLmNsYXNzTGlzdC5hZGQoJ2hpZ2hsaWdodCcpO1xuXHRcdFx0aWYgKGhpZ2hsaWdodC5leHRyYUNsYXNzZXMpIHtcblx0XHRcdFx0aGlnaGxpZ2h0U3Bhbi5jbGFzc0xpc3QuYWRkKC4uLmhpZ2hsaWdodC5leHRyYUNsYXNzZXMpO1xuXHRcdFx0fVxuXHRcdFx0aGlnaGxpZ2h0U3Bhbi50ZXh0Q29udGVudCA9IGhpZ2hsaWdodGVkVGV4dDtcblx0XHRcdGNoaWxkcmVuLnB1c2goaGlnaGxpZ2h0U3Bhbik7XG5cdFx0XHRjdXJyZW50SW5kZXggPSBoaWdobGlnaHRFbmQ7XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gc3RhcnRJbmRleCkge1xuXHRcdFx0cmV0dXJuIEl0ZXJhYmxlLnNpbmdsZShub2RlKTsgLy8gbm8gY2hhbmdlcyBtYWRlXG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRJbmRleCA8IGVuZEluZGV4KSB7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUudGV4dENvbnRlbnQhLnN1YnN0cmluZyhjdXJyZW50SW5kZXggLSBzdGFydEluZGV4KSk7XG5cdFx0fVxuXG5cdFx0Ly8gcmV1c2UgdGhlIGVsZW1lbnQgaWYgaXQncyBhIGxpbmtcblx0XHRpZiAoaXNIVE1MRWxlbWVudChub2RlKSkge1xuXHRcdFx0cmVzZXQobm9kZSwgLi4uY2hpbGRyZW4pO1xuXHRcdFx0cmV0dXJuIEl0ZXJhYmxlLnNpbmdsZShub2RlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cblxuXHQvKipcblx0ICogTGlua2lmaWVzIGEgbG9jYXRpb24gcmVmZXJlbmNlLlxuXHQgKi9cblx0bGlua2lmeUxvY2F0aW9uKHRleHQ6IHN0cmluZywgbG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciwgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhKSB7XG5cdFx0Y29uc3QgbGluayA9IHRoaXMuY3JlYXRlTGluayh0ZXh0KTtcblx0XHR0aGlzLmRlY29yYXRlTGluayhsaW5rLCB1bmRlZmluZWQsIHRleHQsIGhvdmVyQmVoYXZpb3IsIGFzeW5jIChwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IGF3YWl0IHNlc3Npb24ucmVzb2x2ZUxvY2F0aW9uUmVmZXJlbmNlKGxvY2F0aW9uUmVmZXJlbmNlKTtcblx0XHRcdGF3YWl0IGxvY2F0aW9uLnNvdXJjZS5vcGVuSW5FZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLCB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbG9jYXRpb24ubGluZSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IGxvY2F0aW9uLmNvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogbG9jYXRpb24uZW5kTGluZSA/PyBsb2NhdGlvbi5saW5lLFxuXHRcdFx0XHRlbmRDb2x1bW46IGxvY2F0aW9uLmVuZENvbHVtbiA/PyBsb2NhdGlvbi5jb2x1bW4sXG5cdFx0XHR9LCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1ha2VzIGFuIHtAbGluayBJTGlua0RldGVjdG9yfSB0aGF0IGxpbmtzIGV2ZXJ5dGhpbmcgaW4gdGhlIG91dHB1dCB0byB0aGVcblx0ICogcmVmZXJlbmNlIGlmIHRoZXkgZG9uJ3QgaGF2ZSBvdGhlciBleHBsaWNpdCBsaW5rcy5cblx0ICovXG5cdG1ha2VSZWZlcmVuY2VkTGlua0RldGVjdG9yKGxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXIsIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJTGlua0RldGVjdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlua2lmeTogKHRleHQsIGhvdmVyQmVoYXZpb3IsIHNwbGl0TGluZXMsIHdvcmtzcGFjZUZvbGRlciwgaW5jbHVkZUZ1bGx0ZXh0LCBoaWdobGlnaHRzKSA9PlxuXHRcdFx0XHR0aGlzLl9saW5raWZ5KHRleHQsIGhvdmVyQmVoYXZpb3IsIHNwbGl0TGluZXMsIHdvcmtzcGFjZUZvbGRlciwgaW5jbHVkZUZ1bGx0ZXh0LCBoaWdobGlnaHRzLCB7IGxvY2F0aW9uUmVmZXJlbmNlLCBzZXNzaW9uIH0pLFxuXHRcdFx0bGlua2lmeUxvY2F0aW9uOiB0aGlzLmxpbmtpZnlMb2NhdGlvbi5iaW5kKHRoaXMpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdlYkxpbmsoZnVsbHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcsIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSk6IE5vZGUge1xuXHRcdGNvbnN0IGxpbmsgPSB0aGlzLmNyZWF0ZUxpbmsodXJsKTtcblxuXHRcdGxldCB1cmkgPSBVUkkucGFyc2UodXJsKTtcblx0XHQvLyBpZiB0aGUgVVJJIGVuZHMgd2l0aCBzb21ldGhpbmcgbGlrZSBgZm9vLmpzOjEyOjNgLCBwYXJzZVxuXHRcdC8vIHRoYXQgaW50byBhIGZyYWdtZW50IHRvIHJldmVhbCB0aGF0IGxvY2F0aW9uICgjMTUwNzAyKVxuXHRcdGNvbnN0IGxpbmVDb2wgPSBMSU5FX0NPTFVNTl9SRUdFWC5leGVjKHVyaS5wYXRoKTtcblx0XHRpZiAobGluZUNvbCkge1xuXHRcdFx0dXJpID0gdXJpLndpdGgoe1xuXHRcdFx0XHRwYXRoOiB1cmkucGF0aC5zbGljZSgwLCBsaW5lQ29sLmluZGV4KSxcblx0XHRcdFx0ZnJhZ21lbnQ6IGBMJHtsaW5lQ29sWzBdLnNsaWNlKDEpfWBcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuZGVjb3JhdGVMaW5rKGxpbmssIHVyaSwgZnVsbHRleHQsIGhvdmVyQmVoYXZpb3IsIGFzeW5jICgpID0+IHtcblxuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHQvLyBKdXN0IHVzaW5nIGZzUGF0aCBoZXJlIGlzIHVuc2FmZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwOTA3NlxuXHRcdFx0XHRjb25zdCBmc1BhdGggPSB1cmkuZnNQYXRoO1xuXHRcdFx0XHRjb25zdCBwYXRoID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS5wYXRoO1xuXHRcdFx0XHRjb25zdCBmaWxlVXJsID0gb3NQYXRoLm5vcm1hbGl6ZSgoKHBhdGguc2VwID09PSBvc1BhdGgucG9zaXguc2VwKSAmJiBwbGF0Zm9ybS5pc1dpbmRvd3MpID8gZnNQYXRoLnJlcGxhY2UoL1xcXFwvZywgb3NQYXRoLnBvc2l4LnNlcCkgOiBmc1BhdGgpO1xuXG5cdFx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkucGFyc2UoZmlsZVVybCk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGZpbGVVcmkpO1xuXHRcdFx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogZmlsZVVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IGxpbmVDb2wgPyB7IHN0YXJ0TGluZU51bWJlcjogK2xpbmVDb2xbMV0sIHN0YXJ0Q29sdW1uOiBsaW5lQ29sWzJdID8gK2xpbmVDb2xbMl0gOiAxIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJsLCB7IGFsbG93VHVubmVsaW5nOiAoISF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncmVtb3RlLmZvcndhcmRPbk9wZW4nKSkgfSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGF0aExpbmsoZnVsbHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdGV4dDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uTnVtYmVyOiBudW1iZXIsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhKTogTm9kZSB7XG5cdFx0aWYgKHBhdGhbMF0gPT09ICcvJyAmJiBwYXRoWzFdID09PSAnLycpIHtcblx0XHRcdC8vIE1vc3QgbGlrZWx5IGEgdXJsIHBhcnQgd2hpY2ggZGlkIG5vdCBtYXRjaCwgZm9yIGV4YW1wbGUgZnRwOi8vcGF0aC5cblx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNldCBzZWxlY3Rpb24gaWYgd2UgaGF2ZSBhIHZhbGlkIGxpbmUgbnVtYmVyIChncmVhdGVyIHRoYW4gMClcblx0XHRjb25zdCBvcHRpb25zID0gbGluZU51bWJlciA+IDBcblx0XHRcdD8geyBzZWxlY3Rpb246IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogY29sdW1uTnVtYmVyID4gMCA/IGNvbHVtbk51bWJlciA6IDEgfSB9XG5cdFx0XHQ6IHt9O1xuXG5cdFx0aWYgKHBhdGhbMF0gPT09ICcuJykge1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXJpID0gd29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UocGF0aCk7XG5cdFx0XHRjb25zdCBsaW5rID0gdGhpcy5jcmVhdGVMaW5rKHRleHQpO1xuXHRcdFx0dGhpcy5kZWNvcmF0ZUxpbmsobGluaywgdXJpLCBmdWxsdGV4dCwgaG92ZXJCZWhhdmlvciwgKHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pID0+IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyAuLi5vcHRpb25zLCBwcmVzZXJ2ZUZvY3VzIH0gfSkpO1xuXHRcdFx0cmV0dXJuIGxpbms7XG5cdFx0fVxuXG5cdFx0aWYgKHBhdGhbMF0gPT09ICd+Jykge1xuXHRcdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLnJlc29sdmVkVXNlckhvbWU7XG5cdFx0XHRpZiAodXNlckhvbWUpIHtcblx0XHRcdFx0cGF0aCA9IG9zUGF0aC5qb2luKHVzZXJIb21lLmZzUGF0aCwgcGF0aC5zdWJzdHJpbmcoMSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmsgPSB0aGlzLmNyZWF0ZUxpbmsodGV4dCk7XG5cdFx0bGluay50YWJJbmRleCA9IDA7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUob3NQYXRoLm5vcm1hbGl6ZShwYXRoKSk7XG5cdFx0dGhpcy5maWxlU2VydmljZS5zdGF0KHVyaSkudGhlbihzdGF0ID0+IHtcblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGVjb3JhdGVMaW5rKGxpbmssIHVyaSwgZnVsbHRleHQsIGhvdmVyQmVoYXZpb3IsIChwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKSA9PiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgLi4ub3B0aW9ucywgcHJlc2VydmVGb2N1cyB9IH0pKTtcblx0XHR9KS5jYXRjaCgoKSA9PiB7XG5cdFx0XHQvLyBJZiB0aGUgdXJpIGNhbiBub3QgYmUgcmVzb2x2ZWQgd2Ugc2hvdWxkIG5vdCBzcGFtIHRoZSBjb25zb2xlIHdpdGggZXJyb3IsIHJlbWFpbiBxdWl0ZSAjODY1ODdcblx0XHR9KTtcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTGluayh0ZXh0OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRsaW5rLnRleHRDb250ZW50ID0gdGV4dDtcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdHByaXZhdGUgZGVjb3JhdGVMaW5rKGxpbms6IEhUTUxFbGVtZW50LCB1cmk6IFVSSSB8IHVuZGVmaW5lZCwgZnVsbHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhLCBvbkNsaWNrOiAocHJlc2VydmVGb2N1czogYm9vbGVhbikgPT4gdm9pZCkge1xuXHRcdGlmIChob3ZlckJlaGF2aW9yLnN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGluay5jbGFzc0xpc3QuYWRkKCdsaW5rJyk7XG5cdFx0Y29uc3QgZm9sbG93TGluayA9IHVyaSAmJiB0aGlzLnR1bm5lbFNlcnZpY2UuY2FuVHVubmVsKHVyaSkgPyBsb2NhbGl6ZSgnZm9sbG93Rm9yd2FyZGVkTGluaycsIFwiZm9sbG93IGxpbmsgdXNpbmcgZm9yd2FyZGVkIHBvcnRcIikgOiBsb2NhbGl6ZSgnZm9sbG93TGluaycsIFwiZm9sbG93IGxpbmtcIik7XG5cdFx0Y29uc3QgdGl0bGUgPSBsaW5rLmFyaWFMYWJlbCA9IGZ1bGx0ZXh0XG5cdFx0XHQ/IChwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGxvY2FsaXplKCdmaWxlTGlua1dpdGhQYXRoTWFjJywgXCJDbWQgKyBjbGljayB0byB7MH1cXG57MX1cIiwgZm9sbG93TGluaywgZnVsbHRleHQpIDogbG9jYWxpemUoJ2ZpbGVMaW5rV2l0aFBhdGgnLCBcIkN0cmwgKyBjbGljayB0byB7MH1cXG57MX1cIiwgZm9sbG93TGluaywgZnVsbHRleHQpKVxuXHRcdFx0OiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBsb2NhbGl6ZSgnZmlsZUxpbmtNYWMnLCBcIkNtZCArIGNsaWNrIHRvIHswfVwiLCBmb2xsb3dMaW5rKSA6IGxvY2FsaXplKCdmaWxlTGluaycsIFwiQ3RybCArIGNsaWNrIHRvIHswfVwiLCBmb2xsb3dMaW5rKSk7XG5cblx0XHRpZiAoaG92ZXJCZWhhdmlvci50eXBlID09PSBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLlJpY2gpIHtcblx0XHRcdGhvdmVyQmVoYXZpb3Iuc3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIGxpbmssIHRpdGxlKSk7XG5cdFx0fSBlbHNlIGlmIChob3ZlckJlaGF2aW9yLnR5cGUgIT09IERlYnVnTGlua0hvdmVyQmVoYXZpb3IuTm9uZSkge1xuXHRcdFx0bGluay50aXRsZSA9IHRpdGxlO1xuXHRcdH1cblxuXHRcdGhvdmVyQmVoYXZpb3Iuc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAnbW91c2Vtb3ZlJywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRsaW5rLmNsYXNzTGlzdC50b2dnbGUoJ3BvaW50ZXInLCBwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5KTtcblx0XHR9KSk7XG5cblx0XHRob3ZlckJlaGF2aW9yLnN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRsaW5rLmNsYXNzTGlzdC5yZW1vdmUoJ3BvaW50ZXInKTtcblx0XHR9KSk7XG5cblx0XHRob3ZlckJlaGF2aW9yLnN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgJ2NsaWNrJywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBnZXRXaW5kb3cobGluaykuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24udHlwZSA9PT0gJ1JhbmdlJykge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBuYXZpZ2F0ZSB3aGVuIHVzZXIgaXMgc2VsZWN0aW5nXG5cdFx0XHR9XG5cdFx0XHRpZiAoIShwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdG9uQ2xpY2soZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdGhvdmVyQmVoYXZpb3Iuc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRvbkNsaWNrKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZGV0ZWN0TGlua3ModGV4dDogc3RyaW5nKTogTGlua1BhcnRbXSB7XG5cdFx0aWYgKHRleHQubGVuZ3RoID4gTUFYX0xFTkdUSCkge1xuXHRcdFx0cmV0dXJuIFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IHRleHQsIGNhcHR1cmVzOiBbXSwgaW5kZXg6IDAgfV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnZXhlczogUmVnRXhwW10gPSBbV0VCX0xJTktfUkVHRVgsIFBBVEhfTElOS19SRUdFWF07XG5cdFx0Y29uc3Qga2luZHM6IExpbmtLaW5kW10gPSBbJ3dlYicsICdwYXRoJ107XG5cdFx0Y29uc3QgcmVzdWx0OiBMaW5rUGFydFtdID0gW107XG5cblx0XHRjb25zdCBzcGxpdE9uZSA9ICh0ZXh0OiBzdHJpbmcsIHJlZ2V4SW5kZXg6IG51bWJlciwgYmFzZUluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChyZWdleEluZGV4ID49IHJlZ2V4ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdmFsdWU6IHRleHQsIGtpbmQ6ICd0ZXh0JywgY2FwdHVyZXM6IFtdLCBpbmRleDogYmFzZUluZGV4IH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWdleCA9IHJlZ2V4ZXNbcmVnZXhJbmRleF07XG5cdFx0XHRsZXQgY3VycmVudEluZGV4ID0gMDtcblx0XHRcdGxldCBtYXRjaDtcblx0XHRcdHJlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdFx0XHR3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyh0ZXh0KSkgIT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3Qgc3RyaW5nQmVmb3JlTWF0Y2ggPSB0ZXh0LnN1YnN0cmluZyhjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KTtcblx0XHRcdFx0aWYgKHN0cmluZ0JlZm9yZU1hdGNoKSB7XG5cdFx0XHRcdFx0c3BsaXRPbmUoc3RyaW5nQmVmb3JlTWF0Y2gsIHJlZ2V4SW5kZXggKyAxLCBiYXNlSW5kZXggKyBjdXJyZW50SW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gbWF0Y2hbMF07XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHR2YWx1ZTogdmFsdWUsXG5cdFx0XHRcdFx0a2luZDoga2luZHNbcmVnZXhJbmRleF0sXG5cdFx0XHRcdFx0Y2FwdHVyZXM6IG1hdGNoLnNsaWNlKDEpLFxuXHRcdFx0XHRcdGluZGV4OiBiYXNlSW5kZXggKyBtYXRjaC5pbmRleFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyB2YWx1ZS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdHJpbmdBZnRlck1hdGNoZXMgPSB0ZXh0LnN1YnN0cmluZyhjdXJyZW50SW5kZXgpO1xuXHRcdFx0aWYgKHN0cmluZ0FmdGVyTWF0Y2hlcykge1xuXHRcdFx0XHRzcGxpdE9uZShzdHJpbmdBZnRlck1hdGNoZXMsIHJlZ2V4SW5kZXggKyAxLCBiYXNlSW5kZXggKyBjdXJyZW50SW5kZXgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzcGxpdE9uZSh0ZXh0LCAwLCAwKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCLFdBQVcsZUFBZSxhQUFhO0FBQ3ZFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsWUFBWSxZQUFZO0FBQ3hCLFlBQVksY0FBYztBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0I7QUFFekIsTUFBTSxnQkFBZ0I7QUFDdEIsTUFBTSxpQkFBaUIsSUFBSSxPQUFPLDREQUE0RCxnQkFBZ0IsZ0JBQWdCLGdCQUFnQixrQkFBbUIsSUFBSTtBQUVySyxNQUFNLG9CQUFvQjtB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QUFNLG9CQUFvQkEsTUFBSyxVQUFVLGNBQWMsTUFBTSxLQUFLO0FBQ2xFLFlBQUksbUJBQW1CO0FBQ3RCLG1CQUFTLG1CQUFtQixhQUFhLEdBQUcsWUFBWSxZQUFZO0FBQUEsUUFDckU7QUFDQSxjQUFNLFFBQVEsTUFBTSxDQUFDO0FBQ3JCLGVBQU8sS0FBSztBQUFBLFVBQ1g7QUFBQSxVQUNBLE1BQU0sTUFBTSxVQUFVO0FBQUEsVUFDdEIsVUFBVSxNQUFNLE1BQU0sQ0FBQztBQUFBLFVBQ3ZCLE9BQU8sWUFBWSxNQUFNO0FBQUEsUUFDMUIsQ0FBQztBQUNELHVCQUFlLE1BQU0sUUFBUSxNQUFNO0FBQUEsTUFDcEM7QUFDQSxZQUFNLHFCQUFxQkEsTUFBSyxVQUFVLFlBQVk7QUFDdEQsVUFBSSxvQkFBb0I7QUFDdkIsaUJBQVMsb0JBQW9CLGFBQWEsR0FBRyxZQUFZLFlBQVk7QUFBQSxNQUN0RTtBQUFBLElBQ0Q7QUFFQSxhQUFTLE1BQU0sR0FBRyxDQUFDO0FBQ25CLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUEzVWEsZUFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFsiRGVidWdMaW5rSG92ZXJCZWhhdmlvciIsICJjb250YWluZXIiLCAidXJpIiwgImxpbmsiLCAidGV4dCJdCn0K
