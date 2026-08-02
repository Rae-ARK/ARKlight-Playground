import { onUnexpectedError } from "../common/errors.js";
import { escapeDoubleQuotes, parseHrefAndDimensions, removeMarkdownEscapes } from "../common/htmlContent.js";
import { markdownEscapeEscapedIcons } from "../common/iconLabels.js";
import { defaultGenerator } from "../common/idGenerator.js";
import { KeyCode } from "../common/keyCodes.js";
import { DisposableStore } from "../common/lifecycle.js";
import * as marked from "../common/marked/marked.js";
import { parse } from "../common/marshalling.js";
import { FileAccess, Schemas } from "../common/network.js";
import { cloneAndChange } from "../common/objects.js";
import { basename as pathBasename } from "../common/path.js";
import { basename, dirname, resolvePath } from "../common/resources.js";
import { escape } from "../common/strings.js";
import { URI } from "../common/uri.js";
import * as DOM from "./dom.js";
import * as domSanitize from "./domSanitize.js";
import { convertTagToPlaintext } from "./domSanitize.js";
import { StandardKeyboardEvent } from "./keyboardEvent.js";
import { StandardMouseEvent } from "./mouseEvent.js";
import { renderIcon, renderLabelWithIcons } from "./ui/iconLabel/iconLabels.js";
function getLinkTitle(href) {
  try {
    const parsed = URI.parse(href);
    if (parsed.scheme === Schemas.file) {
      const path = parsed.fsPath;
      const fragment = parsed.fragment;
      return escapeDoubleQuotes(fragment ? `${path}#${fragment}` : path);
    }
  } catch {
  }
  return "";
}
function renderImage({ href, title, text }, transformUri) {
  let dimensions = [];
  let attributes = [];
  if (href) {
    ({ href, dimensions } = parseHrefAndDimensions(href));
    href = transformUri?.(href) ?? href;
    attributes.push(`src="${escapeDoubleQuotes(href)}"`);
  }
  if (text) {
    attributes.push(`alt="${escapeDoubleQuotes(text)}"`);
  }
  if (title) {
    attributes.push(`title="${escapeDoubleQuotes(title)}"`);
  }
  if (dimensions.length) {
    attributes = attributes.concat(dimensions);
  }
  return "<img " + attributes.join(" ") + ">";
}
const defaultMarkedRenderers = Object.freeze({
  image: renderImage,
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>`;
  },
  link({ href, title, tokens }) {
    let text = this.parser.parseInline(tokens);
    if (typeof href !== "string") {
      return "";
    }
    if (href === text) {
      text = removeMarkdownEscapes(text);
    }
    title = typeof title === "string" ? escapeDoubleQuotes(removeMarkdownEscapes(title)) : "";
    href = removeMarkdownEscapes(href);
    if (!title && href.startsWith(`${Schemas.file}:`)) {
      title = getLinkTitle(href);
    }
    const isCommandUri = href.startsWith(`${Schemas.command}:`);
    href = href.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const effectiveTitle = title || (isCommandUri ? "" : href);
    return `<a href="${href}" title="${effectiveTitle}" draggable="false">${text}</a>`;
  }
});
function createAlertBlockquoteRenderer(fallbackRenderer) {
  return function(token) {
    const { tokens } = token;
    const firstToken = tokens[0];
    if (firstToken?.type !== "paragraph") {
      return fallbackRenderer.call(this, token);
    }
    const paragraphTokens = firstToken.tokens;
    if (!paragraphTokens || paragraphTokens.length === 0) {
      return fallbackRenderer.call(this, token);
    }
    const firstTextToken = paragraphTokens[0];
    if (firstTextToken?.type !== "text") {
      return fallbackRenderer.call(this, token);
    }
    const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*?\n*/i;
    const match = firstTextToken.raw.match(pattern);
    if (!match) {
      return fallbackRenderer.call(this, token);
    }
    firstTextToken.raw = firstTextToken.raw.replace(pattern, "");
    firstTextToken.text = firstTextToken.text.replace(pattern, "");
    const alertIcons = {
      "note": "info",
      "tip": "light-bulb",
      "important": "comment",
      "warning": "alert",
      "caution": "stop"
    };
    const type = match[1];
    const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    const severity = type.toLowerCase();
    const iconHtml = renderIcon({ id: alertIcons[severity] }).outerHTML;
    const content = this.parser.parse(tokens);
    return `<blockquote data-severity="${severity}"><p><span>${iconHtml}${typeCapitalized}</span>${content.substring(3)}</blockquote>
`;
  };
}
function renderMarkdown(markdown, options = {}, target) {
  const disposables = new DisposableStore();
  let isDisposed = false;
  const markedInstance = new marked.Marked(...options.markedExtensions ?? []);
  const { renderer, codeBlocks, syncCodeBlocks } = createMarkdownRenderer(markedInstance, options, markdown);
  const value = preprocessMarkdownString(markdown);
  let renderedMarkdown;
  if (options.fillInIncompleteTokens) {
    const opts = {
      ...markedInstance.defaults,
      ...options.markedOptions,
      renderer
    };
    const tokens = markedInstance.lexer(value, opts);
    const newTokens = fillInIncompleteTokens(tokens);
    renderedMarkdown = markedInstance.parser(newTokens, opts);
  } else {
    renderedMarkdown = markedInstance.parse(value, { ...options?.markedOptions, renderer, async: false });
  }
  if (markdown.supportThemeIcons) {
    const elements = renderLabelWithIcons(renderedMarkdown);
    renderedMarkdown = elements.map((e) => typeof e === "string" ? e : e.outerHTML).join("");
  }
  const renderedContent = document.createElement("div");
  const sanitizerConfig = getDomSanitizerConfig(markdown, options.sanitizerConfig ?? {});
  domSanitize.safeSetInnerHtml(renderedContent, renderedMarkdown, sanitizerConfig);
  rewriteRenderedLinks(markdown, options, renderedContent);
  let outElement;
  if (target) {
    outElement = target;
    DOM.reset(target, ...renderedContent.childNodes);
  } else {
    outElement = renderedContent;
  }
  if (codeBlocks.length > 0) {
    Promise.all(codeBlocks).then((tuples) => {
      if (isDisposed) {
        return;
      }
      const renderedElements = new Map(tuples);
      const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
      for (const placeholderElement of placeholderElements) {
        const renderedElement = renderedElements.get(placeholderElement.dataset["code"] ?? "");
        if (renderedElement) {
          DOM.reset(placeholderElement, renderedElement);
        }
      }
      options.asyncRenderCallback?.();
    });
  } else if (syncCodeBlocks.length > 0) {
    const renderedElements = new Map(syncCodeBlocks);
    const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
    for (const placeholderElement of placeholderElements) {
      const renderedElement = renderedElements.get(placeholderElement.dataset["code"] ?? "");
      if (renderedElement) {
        DOM.reset(placeholderElement, renderedElement);
      }
    }
  }
  if (options.asyncRenderCallback) {
    for (const img of outElement.getElementsByTagName("img")) {
      const listener = disposables.add(DOM.addDisposableListener(img, "load", () => {
        listener.dispose();
        options.asyncRenderCallback();
      }));
    }
  }
  if (options.actionHandler) {
    const clickCb = (e) => {
      const mouseEvent = new StandardMouseEvent(DOM.getWindow(outElement), e);
      if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
        return;
      }
      activateLink(markdown, options, mouseEvent);
    };
    disposables.add(DOM.addDisposableListener(outElement, "click", clickCb));
    disposables.add(DOM.addDisposableListener(outElement, "auxclick", clickCb));
    disposables.add(DOM.addDisposableListener(outElement, "keydown", (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (!keyboardEvent.equals(KeyCode.Space) && !keyboardEvent.equals(KeyCode.Enter)) {
        return;
      }
      activateLink(markdown, options, keyboardEvent);
    }));
  }
  for (const input of [...outElement.getElementsByTagName("input")]) {
    if (input.attributes.getNamedItem("type")?.value === "checkbox") {
      input.setAttribute("disabled", "");
    } else {
      if (options.sanitizerConfig?.replaceWithPlaintext) {
        const replacement = convertTagToPlaintext(input);
        if (replacement) {
          input.parentElement?.replaceChild(replacement, input);
        } else {
          input.remove();
        }
      } else {
        input.remove();
      }
    }
  }
  return {
    element: outElement,
    dispose: () => {
      isDisposed = true;
      disposables.dispose();
    }
  };
}
function rewriteRenderedLinks(markdown, options, root) {
  for (const el of root.querySelectorAll("img, audio, video, source")) {
    const src = el.getAttribute("src");
    if (src) {
      let href = src;
      try {
        if (markdown.baseUri) {
          href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
        }
      } catch (err) {
      }
      el.setAttribute("src", massageHref(markdown, href, true));
      if (options.sanitizerConfig?.remoteImageIsAllowed) {
        const uri = URI.parse(href);
        if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.sanitizerConfig.remoteImageIsAllowed(uri)) {
          el.replaceWith(DOM.$("", void 0, el.outerHTML));
        }
      }
    }
  }
  for (const el of root.querySelectorAll("a")) {
    const href = el.getAttribute("href");
    el.setAttribute("href", "");
    if (!href || /^data:|javascript:/i.test(href) || /^command:/i.test(href) && !markdown.isTrusted || /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)) {
      el.replaceWith(...el.childNodes);
    } else {
      let resolvedHref = massageHref(markdown, href, false);
      if (markdown.baseUri) {
        resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
      }
      el.dataset.href = resolvedHref;
    }
  }
}
function createMarkdownRenderer(marked2, options, markdown) {
  const renderer = new marked2.Renderer(options.markedOptions);
  renderer.image = (token) => renderImage(token, (href) => options.transformUri?.(href, "image") ?? href);
  renderer.link = (token) => defaultMarkedRenderers.link.call(renderer, {
    ...token,
    href: options.transformUri?.(token.href, "link") ?? token.href
  });
  renderer.paragraph = defaultMarkedRenderers.paragraph;
  if (markdown.supportAlertSyntax) {
    renderer.blockquote = createAlertBlockquoteRenderer(renderer.blockquote);
  }
  const codeBlocks = [];
  const syncCodeBlocks = [];
  if (options.codeBlockRendererSync) {
    renderer.code = ({ text, lang, raw }) => {
      const id = defaultGenerator.nextId();
      const value = options.codeBlockRendererSync(postProcessCodeBlockLanguageId(lang), text, raw);
      syncCodeBlocks.push([id, value]);
      return `<div class="code" data-code="${id}">${escape(text)}</div>`;
    };
  } else if (options.codeBlockRenderer) {
    renderer.code = ({ text, lang }) => {
      const id = defaultGenerator.nextId();
      const value = options.codeBlockRenderer(postProcessCodeBlockLanguageId(lang), text);
      codeBlocks.push(value.then((element) => [id, element]));
      return `<div class="code" data-code="${id}">${escape(text)}</div>`;
    };
  }
  if (!markdown.supportHtml) {
    renderer.html = ({ text }) => {
      if (options.sanitizerConfig?.replaceWithPlaintext) {
        return escape(text);
      }
      const match = markdown.isTrusted ? text.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : void 0;
      return match ? text : "";
    };
  }
  return { renderer, codeBlocks, syncCodeBlocks };
}
function preprocessMarkdownString(markdown) {
  let value = markdown.value;
  if (value.length > 1e5) {
    value = `${value.substr(0, 1e5)}\u2026`;
  }
  if (markdown.supportThemeIcons) {
    value = markdownEscapeEscapedIcons(value);
  }
  return value;
}
function activateLink(mdStr, options, event) {
  const target = event.target.closest("a[data-href]");
  if (!DOM.isHTMLElement(target)) {
    return;
  }
  try {
    let href = target.dataset["href"];
    if (href) {
      if (mdStr.baseUri) {
        href = resolveWithBaseUri(URI.from(mdStr.baseUri), href);
      }
      options.actionHandler?.(href, mdStr);
    }
  } catch (err) {
    onUnexpectedError(err);
  } finally {
    event.preventDefault();
    event.stopPropagation();
  }
}
function uriMassage(markdown, part) {
  let data;
  try {
    data = parse(decodeURIComponent(part));
  } catch (e) {
  }
  if (!data) {
    return part;
  }
  data = cloneAndChange(data, (value) => {
    if (markdown.uris && markdown.uris[value]) {
      return URI.revive(markdown.uris[value]);
    } else {
      return void 0;
    }
  });
  return encodeURIComponent(JSON.stringify(data));
}
function massageHref(markdown, href, isDomUri) {
  const data = markdown.uris && markdown.uris[href];
  let uri = URI.revive(data);
  if (isDomUri) {
    if (href.startsWith(Schemas.data + ":")) {
      return href;
    }
    if (!uri) {
      uri = URI.parse(href);
    }
    return FileAccess.uriToBrowserUri(uri).toString(true);
  }
  if (!uri) {
    return href;
  }
  if (URI.parse(href).toString() === uri.toString()) {
    return href;
  }
  if (uri.query) {
    uri = uri.with({ query: uriMassage(markdown, uri.query) });
  }
  return uri.toString();
}
function postProcessCodeBlockLanguageId(lang) {
  if (!lang) {
    return "";
  }
  const parts = lang.split(/[\s+|:|,|\{|\?]/, 1);
  if (parts.length) {
    return parts[0];
  }
  return lang;
}
function resolveWithBaseUri(baseUri, href) {
  const hasScheme = /^\w[\w\d+.-]*:/.test(href);
  if (hasScheme) {
    return href;
  }
  if (baseUri.path.endsWith("/")) {
    return resolvePath(baseUri, href).toString();
  } else {
    return resolvePath(dirname(baseUri), href).toString();
  }
}
function sanitizeRenderedMarkdown(renderedMarkdown, originalMdStrConfig, options = {}) {
  const sanitizerConfig = getDomSanitizerConfig(originalMdStrConfig, options);
  return domSanitize.sanitizeHtml(renderedMarkdown, sanitizerConfig);
}
const allowedMarkdownHtmlTags = Object.freeze([
  ...domSanitize.basicMarkupHtmlTags,
  "input"
  // Allow inputs for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);
const allowedMarkdownHtmlAttributes = Object.freeze([
  "align",
  "autoplay",
  "alt",
  "colspan",
  "controls",
  "draggable",
  "height",
  "href",
  "loop",
  "muted",
  "playsinline",
  "poster",
  "rowspan",
  "src",
  "target",
  "title",
  "type",
  "width",
  "start",
  // Input (For disabled inputs)
  "checked",
  "disabled",
  "value",
  // Custom markdown attributes
  "data-code",
  "data-href",
  "data-severity",
  // Only allow very specific styles
  {
    attributeName: "style",
    shouldKeep: (element, data) => {
      if (element.tagName === "SPAN") {
        if (data.attrName === "style") {
          return /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/.test(data.attrValue);
        }
      }
      return false;
    }
  },
  // Only allow codicons for classes
  {
    attributeName: "class",
    shouldKeep: (element, data) => {
      if (element.tagName === "SPAN") {
        if (data.attrName === "class") {
          return /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(data.attrValue);
        }
      }
      return false;
    }
  }
]);
function getDomSanitizerConfig(mdStrConfig, options) {
  const isTrusted = mdStrConfig.isTrusted ?? false;
  const allowedLinkSchemes = [
    Schemas.http,
    Schemas.https,
    Schemas.mailto,
    Schemas.file,
    Schemas.vscodeFileResource,
    Schemas.vscodeRemote,
    Schemas.vscodeRemoteResource,
    Schemas.vscodeNotebookCell,
    // For links that are handled entirely by the action handler
    Schemas.internal
  ];
  if (isTrusted) {
    allowedLinkSchemes.push(Schemas.command);
  }
  if (options.allowedLinkSchemes?.augment) {
    allowedLinkSchemes.push(...options.allowedLinkSchemes.augment);
  }
  return {
    // allowedTags should included everything that markdown renders to.
    // Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
    // HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
    // HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
    allowedTags: {
      override: options.allowedTags?.override ?? allowedMarkdownHtmlTags
    },
    allowedAttributes: {
      override: options.allowedAttributes?.override ?? allowedMarkdownHtmlAttributes
    },
    allowedLinkProtocols: {
      override: allowedLinkSchemes
    },
    allowRelativeLinkPaths: !!mdStrConfig.baseUri,
    allowedMediaProtocols: {
      override: [
        Schemas.http,
        Schemas.https,
        Schemas.data,
        Schemas.file,
        Schemas.vscodeFileResource,
        Schemas.vscodeRemote,
        Schemas.vscodeRemoteResource
      ]
    },
    allowRelativeMediaPaths: !!mdStrConfig.baseUri,
    replaceWithPlaintext: options.replaceWithPlaintext
  };
}
function renderAsPlaintext(str, options) {
  if (typeof str === "string") {
    return str;
  }
  let value = str.value ?? "";
  if (value.length > 1e5) {
    value = `${value.substr(0, 1e5)}\u2026`;
  }
  const renderer = createPlainTextRenderer();
  if (options?.includeCodeBlocksFences) {
    renderer.code = codeBlockFences;
  }
  if (options?.useLinkFormatter) {
    renderer.link = linkFormatter;
  }
  const html = marked.parse(value, { async: false, renderer });
  return sanitizeRenderedMarkdown(html, { isTrusted: false }, {}).toString().replace(/&(#\d+|[a-zA-Z]+);/g, (m) => unescapeInfo.get(m) ?? m).trim();
}
const unescapeInfo = /* @__PURE__ */ new Map([
  ["&quot;", '"'],
  ["&nbsp;", " "],
  ["&amp;", "&"],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"]
]);
function createPlainTextRenderer() {
  const renderer = new marked.Renderer();
  renderer.code = ({ text }) => {
    return escape(text);
  };
  renderer.blockquote = ({ text }) => {
    return text + "\n";
  };
  renderer.html = (_) => {
    return "";
  };
  renderer.heading = function({ tokens }) {
    return this.parser.parseInline(tokens) + "\n";
  };
  renderer.hr = () => {
    return "";
  };
  renderer.list = function({ items }) {
    return items.map((x) => this.listitem(x)).join("\n") + "\n";
  };
  renderer.listitem = ({ text }) => {
    return text + "\n";
  };
  renderer.paragraph = function({ tokens }) {
    return this.parser.parseInline(tokens) + "\n";
  };
  renderer.table = function({ header, rows }) {
    return header.map((cell) => this.tablecell(cell)).join(" ") + "\n" + rows.map((cells) => cells.map((cell) => this.tablecell(cell)).join(" ")).join("\n") + "\n";
  };
  renderer.tablerow = ({ text }) => {
    return text;
  };
  renderer.tablecell = function({ tokens }) {
    return this.parser.parseInline(tokens);
  };
  renderer.strong = ({ text }) => {
    return text;
  };
  renderer.em = ({ text }) => {
    return text;
  };
  renderer.codespan = ({ text }) => {
    return text;
  };
  renderer.br = (_) => {
    return "\n";
  };
  renderer.del = ({ text }) => {
    return text;
  };
  renderer.image = (_) => {
    return "";
  };
  renderer.text = ({ text }) => {
    return text;
  };
  renderer.link = ({ text }) => {
    return text;
  };
  return renderer;
}
const codeBlockFences = ({ text }) => {
  return `
\`\`\`
${escape(text)}
\`\`\`
`;
};
const linkFormatter = ({ text, href }) => {
  try {
    if (href) {
      const uri = URI.parse(href);
      return text.trim() || basename(uri);
    }
  } catch (e) {
    return text.trim() || pathBasename(href);
  }
  return text;
};
function mergeRawTokenText(tokens) {
  let mergedTokenText = "";
  tokens.forEach((token) => {
    mergedTokenText += token.raw;
  });
  return mergedTokenText;
}
function completeSingleLinePattern(token) {
  if (!token.tokens) {
    return void 0;
  }
  for (let i = token.tokens.length - 1; i >= 0; i--) {
    const subtoken = token.tokens[i];
    if (subtoken.type === "text") {
      const lines = subtoken.raw.split("\n");
      const lastLine = lines[lines.length - 1];
      if (
        // Text with start of link target
        hasLinkTextAndStartOfLinkTarget(lastLine) || // This token doesn't have the link text, eg if it contains other markdown constructs that are in other subtokens.
        // But some preceding token does have an unbalanced [ at least
        hasStartOfLinkTargetAndNoLinkText(lastLine) && token.tokens.slice(0, i).some((t) => t.type === "text" && t.raw.match(/\[[^\]]*$/))
      ) {
        const nextTwoSubTokens = token.tokens.slice(i + 1);
        if (
          // If the link was parsed as a link, then look for a link token and a text token with a quote
          nextTwoSubTokens[0]?.type === "link" && nextTwoSubTokens[1]?.type === "text" && nextTwoSubTokens[1].raw.match(/^ *"[^"]*$/) || // And if the link was not parsed as a link (eg command link), just look for a single quote in this token
          lastLine.match(/^[^"]* +"[^"]*$/)
        ) {
          return completeLinkTargetArg(token);
        }
        return completeLinkTarget(token);
      } else if (lastLine.includes("`")) {
        return completeCodespan(token);
      } else if (lastLine.includes("**")) {
        return completeDoublestar(token);
      } else if (lastLine.match(/\*\w/)) {
        return completeStar(token);
      } else if (lastLine.match(/(^|\s)__\w/)) {
        return completeDoubleUnderscore(token);
      } else if (lastLine.match(/(^|\s)_\w/)) {
        return completeUnderscore(token);
      } else if (lastLine.match(/(^|\s)\[\w*[^\]]*$/)) {
        return completeLinkText(token);
      }
    }
  }
  return void 0;
}
function hasLinkTextAndStartOfLinkTarget(str) {
  return !!str.match(/(?:^|[\s(*_~])\[.*\]\(\w*/);
}
function hasStartOfLinkTargetAndNoLinkText(str) {
  return !!str.match(/^[^\[]*\]\([^\)]*$/);
}
function completeBlockquotePattern(blockquote, links) {
  let lastInterestingIndex = blockquote.tokens.length - 1;
  while (lastInterestingIndex >= 0 && blockquote.tokens[lastInterestingIndex].type === "space") {
    lastInterestingIndex--;
  }
  const lastToken = blockquote.tokens[lastInterestingIndex];
  if (lastToken?.type !== "paragraph") {
    return void 0;
  }
  const completedToken = completeSingleLinePattern(lastToken);
  if (!completedToken) {
    return void 0;
  }
  const completion = completedToken.raw.slice(lastToken.raw.trimEnd().length);
  const trailingQuoteOnlyLines = blockquote.raw.match(/(?:\n[ \t]*>[ \t]*(?=\n|$))+\n?$/)?.[0] ?? "";
  const insertionIndex = blockquote.raw.length - trailingQuoteOnlyLines.length;
  const completedRaw = blockquote.raw.slice(0, insertionIndex) + completion + trailingQuoteOnlyLines;
  const lexer = new marked.Lexer();
  lexer.tokens.links = links;
  const completedBlockquote = lexer.lex(completedRaw)[0];
  if (completedBlockquote.type === "blockquote") {
    return completedBlockquote;
  }
  return void 0;
}
function completeListItemPattern(list) {
  const lastListItem = list.items[list.items.length - 1];
  const lastListSubToken = lastListItem.tokens ? lastListItem.tokens[lastListItem.tokens.length - 1] : void 0;
  const listEndsInHeading = (list2) => {
    const lastItem = list2.items.at(-1);
    const lastToken = lastItem?.tokens.at(-1);
    return lastToken?.type === "heading" || lastToken?.type === "list" && listEndsInHeading(lastToken);
  };
  let newToken;
  if (lastListSubToken?.type === "text" && !("inRawBlock" in lastListItem)) {
    newToken = completeSingleLinePattern(lastListSubToken);
  } else if (listEndsInHeading(list)) {
    const newList2 = marked.lexer(list.raw.trim() + " &nbsp;")[0];
    if (newList2.type !== "list") {
      return;
    }
    return newList2;
  }
  if (!newToken || newToken.type !== "paragraph") {
    return;
  }
  const previousListItemsText = mergeRawTokenText(list.items.slice(0, -1));
  const lastListItemLead = lastListItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
  if (!lastListItemLead) {
    return;
  }
  const newListItemText = lastListItemLead + mergeRawTokenText(lastListItem.tokens.slice(0, -1)) + newToken.raw;
  const newList = marked.lexer(previousListItemsText + newListItemText)[0];
  if (newList.type !== "list") {
    return;
  }
  return newList;
}
function completeHeading(token, fullRawText) {
  if (token.raw.match(/-\s*$/)) {
    return marked.lexer(fullRawText + " &nbsp;");
  }
}
const maxIncompleteTokensFixRounds = 3;
function fillInIncompleteTokens(tokens) {
  for (let i = 0; i < maxIncompleteTokensFixRounds; i++) {
    const newTokens = fillInIncompleteTokensOnce(tokens);
    if (newTokens) {
      tokens = newTokens;
    } else {
      break;
    }
  }
  return tokens;
}
function fillInIncompleteTokensOnce(tokens) {
  let i;
  let newTokens;
  for (i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "paragraph" && token.raw.match(/(\n|^)\|/)) {
      newTokens = completeTable(tokens.slice(i));
      break;
    }
  }
  let lastInterestingIdx = tokens.length - 1;
  while (lastInterestingIdx >= 0 && (tokens[lastInterestingIdx].type === "space" || tokens[lastInterestingIdx].type === "html")) {
    lastInterestingIdx--;
  }
  const lastInterestingToken = lastInterestingIdx >= 0 ? tokens[lastInterestingIdx] : void 0;
  const trailingTokens = tokens.slice(lastInterestingIdx + 1);
  if (!newTokens && lastInterestingToken?.type === "list") {
    const newListToken = completeListItemPattern(lastInterestingToken);
    if (newListToken) {
      newTokens = [newListToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (!newTokens && lastInterestingToken?.type === "blockquote") {
    const newBlockquoteToken = completeBlockquotePattern(lastInterestingToken, tokens.links);
    if (newBlockquoteToken) {
      newTokens = [newBlockquoteToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (!newTokens && lastInterestingToken?.type === "paragraph") {
    const newToken = completeSingleLinePattern(lastInterestingToken);
    if (newToken) {
      newTokens = [newToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (newTokens) {
    const newTokensList = [
      ...tokens.slice(0, i),
      ...newTokens
    ];
    newTokensList.links = tokens.links;
    return newTokensList;
  }
  const lastToken = tokens.at(-1);
  if (lastToken?.type === "heading") {
    const completeTokens = completeHeading(lastToken, mergeRawTokenText(tokens));
    if (completeTokens) {
      return completeTokens;
    }
  }
  return null;
}
function completeCodespan(token) {
  return completeWithString(token, "`");
}
function completeStar(tokens) {
  return completeWithString(tokens, "*");
}
function completeUnderscore(tokens) {
  return completeWithString(tokens, "_");
}
function completeLinkTarget(tokens) {
  return completeWithString(tokens, ")", false);
}
function completeLinkTargetArg(tokens) {
  return completeWithString(tokens, '")', false);
}
function completeLinkText(tokens) {
  return completeWithString(tokens, "](https://microsoft.com)", false);
}
function completeDoublestar(tokens) {
  return completeWithString(tokens, "**");
}
function completeDoubleUnderscore(tokens) {
  return completeWithString(tokens, "__");
}
function completeWithString(tokens, closingString, shouldTrim = true) {
  const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);
  const trimmedRawText = shouldTrim ? mergedRawText.trimEnd() : mergedRawText;
  return marked.lexer(trimmedRawText + closingString)[0];
}
function completeTable(tokens) {
  const mergedRawText = mergeRawTokenText(tokens);
  const lines = mergedRawText.split("\n");
  let numCols;
  let hasSeparatorRow = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (typeof numCols === "undefined" && line.match(/^\s*\|/)) {
      const line1Matches = line.match(/(\|[^\|]+)(?=\||$)/g);
      if (line1Matches) {
        numCols = line1Matches.length;
      }
    } else if (typeof numCols === "number") {
      if (line.match(/^\s*\|/)) {
        if (i !== lines.length - 1) {
          return void 0;
        }
        hasSeparatorRow = true;
      } else {
        return void 0;
      }
    }
  }
  if (typeof numCols === "number" && numCols > 0) {
    const prefixText = hasSeparatorRow ? lines.slice(0, -1).join("\n") : mergedRawText;
    const line1EndsInPipe = !!prefixText.match(/\|\s*$/);
    const newRawText = prefixText + (line1EndsInPipe ? "" : "|") + `
|${" --- |".repeat(numCols)}`;
    return marked.lexer(newRawText);
  }
  return void 0;
}
export {
  allowedMarkdownHtmlAttributes,
  allowedMarkdownHtmlTags,
  fillInIncompleteTokens,
  renderAsPlaintext,
  renderMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGVzY2FwZURvdWJsZVF1b3RlcywgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZ1RydXN0ZWRPcHRpb25zLCBwYXJzZUhyZWZBbmREaW1lbnNpb25zLCByZW1vdmVNYXJrZG93bkVzY2FwZXMgfSBmcm9tICcuLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbWFya2Rvd25Fc2NhcGVFc2NhcGVkSWNvbnMgfSBmcm9tICcuLi9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0R2VuZXJhdG9yIH0gZnJvbSAnLi4vY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbWFya2VkIGZyb20gJy4uL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBjbG9uZUFuZENoYW5nZSB9IGZyb20gJy4uL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIGFzIHBhdGhCYXNlbmFtZSB9IGZyb20gJy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCByZXNvbHZlUGF0aCB9IGZyb20gJy4uL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlIH0gZnJvbSAnLi4vY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU2FuaXRpemUgZnJvbSAnLi9kb21TYW5pdGl6ZS5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0VGFnVG9QbGFpbnRleHQgfSBmcm9tICcuL2RvbVNhbml0aXplLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4va2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiwgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcblxuZXhwb3J0IHR5cGUgTWFya2Rvd25BY3Rpb25IYW5kbGVyID0gKGxpbmtDb250ZW50OiBzdHJpbmcsIG1kU3RyOiBJTWFya2Rvd25TdHJpbmcpID0+IHZvaWQ7XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgdGhlIHJlbmRlcmluZyBvZiBtYXJrZG93biB3aXRoIHtAbGluayByZW5kZXJNYXJrZG93bn0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWFya2Rvd25SZW5kZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgY29kZUJsb2NrUmVuZGVyZXI/OiAobGFuZ3VhZ2VJZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA9PiBQcm9taXNlPEhUTUxFbGVtZW50Pjtcblx0cmVhZG9ubHkgY29kZUJsb2NrUmVuZGVyZXJTeW5jPzogKGxhbmd1YWdlSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZywgcmF3Pzogc3RyaW5nKSA9PiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYXN5bmNSZW5kZXJDYWxsYmFjaz86ICgpID0+IHZvaWQ7XG5cblx0cmVhZG9ubHkgYWN0aW9uSGFuZGxlcj86IE1hcmtkb3duQWN0aW9uSGFuZGxlcjtcblxuXHQvKiogUmV3cml0ZXMgcGFyc2VkIE1hcmtkb3duIGxpbmsgYW5kIGltYWdlIGRlc3RpbmF0aW9ucyBiZWZvcmUgc2FuaXRpemF0aW9uLiAqL1xuXHRyZWFkb25seSB0cmFuc2Zvcm1Vcmk/OiAoaHJlZjogc3RyaW5nLCBraW5kOiAnbGluaycgfCAnaW1hZ2UnKSA9PiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgZmlsbEluSW5jb21wbGV0ZVRva2Vucz86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgc2FuaXRpemVyQ29uZmlnPzogTWFya2Rvd25TYW5pdGl6ZXJDb25maWc7XG5cblx0cmVhZG9ubHkgbWFya2VkT3B0aW9ucz86IE1hcmtkb3duUmVuZGVyZXJNYXJrZWRPcHRpb25zO1xuXHRyZWFkb25seSBtYXJrZWRFeHRlbnNpb25zPzogbWFya2VkLk1hcmtlZEV4dGVuc2lvbltdO1xufVxuXG4vKipcbiAqIFN1YnNldCBvZiBvcHRpb25zIHBhc3NlZCB0byBgTWFya2VkYCBmb3IgcmVuZGVyaW5nIG1hcmtkb3duLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duUmVuZGVyZXJNYXJrZWRPcHRpb25zIHtcblx0cmVhZG9ubHkgZ2ZtPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYnJlYWtzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNYXJrZG93blNhbml0aXplckNvbmZpZyB7XG5cdHJlYWRvbmx5IHJlcGxhY2VXaXRoUGxhaW50ZXh0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWxsb3dlZFRhZ3M/OiB7XG5cdFx0cmVhZG9ubHkgb3ZlcnJpZGU6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR9O1xuXHRyZWFkb25seSBhbGxvd2VkQXR0cmlidXRlcz86IHtcblx0XHRyZWFkb25seSBvdmVycmlkZTogUmVhZG9ubHlBcnJheTxzdHJpbmcgfCBkb21TYW5pdGl6ZS5TYW5pdGl6ZUF0dHJpYnV0ZVJ1bGU+O1xuXHR9O1xuXHRyZWFkb25seSBhbGxvd2VkTGlua1NjaGVtZXM/OiB7XG5cdFx0cmVhZG9ubHkgYXVnbWVudDogcmVhZG9ubHkgc3RyaW5nW107XG5cdH07XG5cdHJlYWRvbmx5IHJlbW90ZUltYWdlSXNBbGxvd2VkPzogKHVyaTogVVJJKSA9PiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBodW1hbi1yZWFkYWJsZSB0b29sdGlwIHN0cmluZyBmb3IgYSBsaW5rIGhyZWYuXG4gKiBGb3IgZmlsZTovLyBVUklzLCBjb252ZXJ0cyB0byBhIGRlY29kZWQgT1MgZmlsZSBzeXN0ZW0gcGF0aCB0byBhdm9pZFxuICogc2hvd2luZyByYXcgVVJMLWVuY29kZWQgcGF0aHMgKGUuZy4gXCJDOlxcVXNlcnNcXC4uLlwiIGluc3RlYWQgb2YgXCJmaWxlOi8vL2MlM0EvVXNlcnMvLi4uXCIpLlxuICovXG5mdW5jdGlvbiBnZXRMaW5rVGl0bGUoaHJlZjogc3RyaW5nKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0aWYgKHBhcnNlZC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0Y29uc3QgcGF0aCA9IHBhcnNlZC5mc1BhdGg7XG5cdFx0XHRjb25zdCBmcmFnbWVudCA9IHBhcnNlZC5mcmFnbWVudDtcblx0XHRcdHJldHVybiBlc2NhcGVEb3VibGVRdW90ZXMoZnJhZ21lbnQgPyBgJHtwYXRofSMke2ZyYWdtZW50fWAgOiBwYXRoKTtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGZhbGwgdGhyb3VnaFxuXHR9XG5cdHJldHVybiAnJztcbn1cblxuZnVuY3Rpb24gcmVuZGVySW1hZ2UoeyBocmVmLCB0aXRsZSwgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkltYWdlLCB0cmFuc2Zvcm1Vcmk/OiAoaHJlZjogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgZGltZW5zaW9uczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGF0dHJpYnV0ZXM6IHN0cmluZ1tdID0gW107XG5cdGlmIChocmVmKSB7XG5cdFx0KHsgaHJlZiwgZGltZW5zaW9ucyB9ID0gcGFyc2VIcmVmQW5kRGltZW5zaW9ucyhocmVmKSk7XG5cdFx0aHJlZiA9IHRyYW5zZm9ybVVyaT8uKGhyZWYpID8/IGhyZWY7XG5cdFx0YXR0cmlidXRlcy5wdXNoKGBzcmM9XCIke2VzY2FwZURvdWJsZVF1b3RlcyhocmVmKX1cImApO1xuXHR9XG5cdGlmICh0ZXh0KSB7XG5cdFx0YXR0cmlidXRlcy5wdXNoKGBhbHQ9XCIke2VzY2FwZURvdWJsZVF1b3Rlcyh0ZXh0KX1cImApO1xuXHR9XG5cdGlmICh0aXRsZSkge1xuXHRcdGF0dHJpYnV0ZXMucHVzaChgdGl0bGU9XCIke2VzY2FwZURvdWJsZVF1b3Rlcyh0aXRsZSl9XCJgKTtcblx0fVxuXHRpZiAoZGltZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRhdHRyaWJ1dGVzID0gYXR0cmlidXRlcy5jb25jYXQoZGltZW5zaW9ucyk7XG5cdH1cblx0cmV0dXJuICc8aW1nICcgKyBhdHRyaWJ1dGVzLmpvaW4oJyAnKSArICc+Jztcbn1cblxuY29uc3QgZGVmYXVsdE1hcmtlZFJlbmRlcmVycyA9IE9iamVjdC5mcmVlemUoe1xuXHRpbWFnZTogcmVuZGVySW1hZ2UsXG5cdHBhcmFncmFwaCh0aGlzOiBtYXJrZWQuUmVuZGVyZXIsIHsgdG9rZW5zIH06IG1hcmtlZC5Ub2tlbnMuUGFyYWdyYXBoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYDxwPiR7dGhpcy5wYXJzZXIucGFyc2VJbmxpbmUodG9rZW5zKX08L3A+YDtcblx0fSxcblxuXHRsaW5rKHRoaXM6IG1hcmtlZC5SZW5kZXJlciwgeyBocmVmLCB0aXRsZSwgdG9rZW5zIH06IG1hcmtlZC5Ub2tlbnMuTGluayk6IHN0cmluZyB7XG5cdFx0bGV0IHRleHQgPSB0aGlzLnBhcnNlci5wYXJzZUlubGluZSh0b2tlbnMpO1xuXHRcdGlmICh0eXBlb2YgaHJlZiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgbWFya2Rvd24gZXNjYXBlcy4gV29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL2NoamovbWFya2VkL2lzc3Vlcy84Mjlcblx0XHRpZiAoaHJlZiA9PT0gdGV4dCkgeyAvLyByYXcgbGluayBjYXNlXG5cdFx0XHR0ZXh0ID0gcmVtb3ZlTWFya2Rvd25Fc2NhcGVzKHRleHQpO1xuXHRcdH1cblxuXHRcdHRpdGxlID0gdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IGVzY2FwZURvdWJsZVF1b3RlcyhyZW1vdmVNYXJrZG93bkVzY2FwZXModGl0bGUpKSA6ICcnO1xuXHRcdGhyZWYgPSByZW1vdmVNYXJrZG93bkVzY2FwZXMoaHJlZik7XG5cblx0XHQvLyBGb3IgZmlsZTovLyBVUklzIHdpdGhvdXQgYW4gZXhwbGljaXQgdGl0bGUsIHNob3cgdGhlIGRlY29kZWQgT1MgcGF0aCBpbnN0ZWFkIG9mXG5cdFx0Ly8gdGhlIHJhdyBVUkwtZW5jb2RlZCBVUkkgKGUuZy4gZGlzcGxheSBcIkM6XFxVc2Vyc1xcLi4uXCIgaW5zdGVhZCBvZiBcImZpbGU6Ly8vYyUzQS9Vc2Vycy8uLi5cIilcblx0XHRpZiAoIXRpdGxlICYmIGhyZWYuc3RhcnRzV2l0aChgJHtTY2hlbWFzLmZpbGV9OmApKSB7XG5cdFx0XHR0aXRsZSA9IGdldExpbmtUaXRsZShocmVmKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgY29tbWFuZDogVVJJcyB3aXRob3V0IGFuIGV4cGxpY2l0IHRpdGxlLCBhdm9pZCBleHBvc2luZyB0aGUgcmF3XG5cdFx0Ly8gY29tbWFuZCBzdHJpbmcgYXMgYSB0aXRsZS90b29sdGlwIFx1MjAxNCBzY3JlZW4gcmVhZGVycyBhbm5vdW5jZSBpdCBhc1xuXHRcdC8vIHJlZHVuZGFudCB0ZWNobmljYWwgaW5mb3JtYXRpb24gKHNlZSAjMzIxNDE2KS5cblx0XHRjb25zdCBpc0NvbW1hbmRVcmkgPSBocmVmLnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy5jb21tYW5kfTpgKTtcblxuXHRcdC8vIEhUTUwgRW5jb2RlIGhyZWZcblx0XHRocmVmID0gaHJlZi5yZXBsYWNlKC8mL2csICcmYW1wOycpXG5cdFx0XHQucmVwbGFjZSgvPC9nLCAnJmx0OycpXG5cdFx0XHQucmVwbGFjZSgvPi9nLCAnJmd0OycpXG5cdFx0XHQucmVwbGFjZSgvXCIvZywgJyZxdW90OycpXG5cdFx0XHQucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcblxuXHRcdGNvbnN0IGVmZmVjdGl2ZVRpdGxlID0gdGl0bGUgfHwgKGlzQ29tbWFuZFVyaSA/ICcnIDogaHJlZik7XG5cdFx0cmV0dXJuIGA8YSBocmVmPVwiJHtocmVmfVwiIHRpdGxlPVwiJHtlZmZlY3RpdmVUaXRsZX1cIiBkcmFnZ2FibGU9XCJmYWxzZVwiPiR7dGV4dH08L2E+YDtcblx0fSxcbn0pO1xuXG4vKipcbiAqIEJsb2NrcXVvdGUgcmVuZGVyZXIgdGhhdCBwcm9jZXNzZXMgR2l0SHViLXN0eWxlIGFsZXJ0IHN5bnRheC5cbiAqIFRyYW5zZm9ybXMgYmxvY2txdW90ZXMgbGlrZSBcIj4gWyFOT1RFXVwiIGludG8gc3RydWN0dXJlZCBhbGVydCBtYXJrdXAgd2l0aCBpY29ucy5cbiAqXG4gKiBCYXNlZCBvbiBHaXRIdWIncyBhbGVydCBzeW50YXg6IGh0dHBzOi8vZG9jcy5naXRodWIuY29tL2VuL2dldC1zdGFydGVkL3dyaXRpbmctb24tZ2l0aHViL2dldHRpbmctc3RhcnRlZC13aXRoLXdyaXRpbmctYW5kLWZvcm1hdHRpbmctb24tZ2l0aHViL2Jhc2ljLXdyaXRpbmctYW5kLWZvcm1hdHRpbmctc3ludGF4I2FsZXJ0c1xuICovXG5mdW5jdGlvbiBjcmVhdGVBbGVydEJsb2NrcXVvdGVSZW5kZXJlcihmYWxsYmFja1JlbmRlcmVyOiAodGhpczogbWFya2VkLlJlbmRlcmVyLCB0b2tlbjogbWFya2VkLlRva2Vucy5CbG9ja3F1b3RlKSA9PiBzdHJpbmcpIHtcblx0cmV0dXJuIGZ1bmN0aW9uICh0aGlzOiBtYXJrZWQuUmVuZGVyZXIsIHRva2VuOiBtYXJrZWQuVG9rZW5zLkJsb2NrcXVvdGUpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHsgdG9rZW5zIH0gPSB0b2tlbjtcblx0XHQvLyBDaGVjayBpZiB0aGlzIGJsb2NrcXVvdGUgc3RhcnRzIHdpdGggYWxlcnQgc3ludGF4IFshVFlQRV1cblx0XHRjb25zdCBmaXJzdFRva2VuID0gdG9rZW5zWzBdO1xuXHRcdGlmIChmaXJzdFRva2VuPy50eXBlICE9PSAncGFyYWdyYXBoJykge1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrUmVuZGVyZXIuY2FsbCh0aGlzLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyYWdyYXBoVG9rZW5zID0gZmlyc3RUb2tlbi50b2tlbnM7XG5cdFx0aWYgKCFwYXJhZ3JhcGhUb2tlbnMgfHwgcGFyYWdyYXBoVG9rZW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrUmVuZGVyZXIuY2FsbCh0aGlzLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RUZXh0VG9rZW4gPSBwYXJhZ3JhcGhUb2tlbnNbMF07XG5cdFx0aWYgKGZpcnN0VGV4dFRva2VuPy50eXBlICE9PSAndGV4dCcpIHtcblx0XHRcdHJldHVybiBmYWxsYmFja1JlbmRlcmVyLmNhbGwodGhpcywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdHRlcm4gPSAvXlxccypcXFshKE5PVEV8VElQfElNUE9SVEFOVHxXQVJOSU5HfENBVVRJT04pXFxdXFxzKj9cXG4qL2k7XG5cdFx0Y29uc3QgbWF0Y2ggPSBmaXJzdFRleHRUb2tlbi5yYXcubWF0Y2gocGF0dGVybik7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrUmVuZGVyZXIuY2FsbCh0aGlzLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBhbGVydCBtYXJrZXIgZnJvbSB0aGUgdG9rZW5cblx0XHRmaXJzdFRleHRUb2tlbi5yYXcgPSBmaXJzdFRleHRUb2tlbi5yYXcucmVwbGFjZShwYXR0ZXJuLCAnJyk7XG5cdFx0Zmlyc3RUZXh0VG9rZW4udGV4dCA9IGZpcnN0VGV4dFRva2VuLnRleHQucmVwbGFjZShwYXR0ZXJuLCAnJyk7XG5cblx0XHRjb25zdCBhbGVydEljb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0J25vdGUnOiAnaW5mbycsXG5cdFx0XHQndGlwJzogJ2xpZ2h0LWJ1bGInLFxuXHRcdFx0J2ltcG9ydGFudCc6ICdjb21tZW50Jyxcblx0XHRcdCd3YXJuaW5nJzogJ2FsZXJ0Jyxcblx0XHRcdCdjYXV0aW9uJzogJ3N0b3AnXG5cdFx0fTtcblxuXHRcdGNvbnN0IHR5cGUgPSBtYXRjaFsxXTtcblx0XHRjb25zdCB0eXBlQ2FwaXRhbGl6ZWQgPSB0eXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHNldmVyaXR5ID0gdHlwZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGljb25IdG1sID0gcmVuZGVySWNvbih7IGlkOiBhbGVydEljb25zW3NldmVyaXR5XSB9KS5vdXRlckhUTUw7XG5cblx0XHQvLyBSZW5kZXIgdGhlIHJlbWFpbmluZyBjb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMucGFyc2VyLnBhcnNlKHRva2Vucyk7XG5cblx0XHQvLyBSZXR1cm4gYWxlcnQgbWFya3VwIHdpdGggaWNvbiBhbmQgc2V2ZXJpdHkgKHNraXBwaW5nIHRoZSBmaXJzdCAzIGNoYXJhY3RlcnM6IGA8cD5gKVxuXHRcdHJldHVybiBgPGJsb2NrcXVvdGUgZGF0YS1zZXZlcml0eT1cIiR7c2V2ZXJpdHl9XCI+PHA+PHNwYW4+JHtpY29uSHRtbH0ke3R5cGVDYXBpdGFsaXplZH08L3NwYW4+JHtjb250ZW50LnN1YnN0cmluZygzKX08L2Jsb2NrcXVvdGU+XFxuYDtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVuZGVyZWRNYXJrZG93biBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG59XG5cbi8qKlxuICogTG93LWxldmVsIHdheSBjcmVhdGUgYSBodG1sIGVsZW1lbnQgZnJvbSBhIG1hcmtkb3duIHN0cmluZy5cbiAqXG4gKiAqKk5vdGUqKiB0aGF0IGZvciBtb3N0IGNhc2VzIHlvdSBzaG91bGQgYmUgdXNpbmcge0BsaW5rIGltcG9ydCgnLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L21hcmtkb3duUmVuZGVyZXIvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJykuTWFya2Rvd25SZW5kZXJlciBNYXJrZG93blJlbmRlcmVyfVxuICogd2hpY2ggY29tZXMgd2l0aCBzdXBwb3J0IGZvciBwcmV0dHkgY29kZSBibG9jayByZW5kZXJpbmcgYW5kIHdoaWNoIHVzZXMgdGhlIGRlZmF1bHQgd2F5IG9mIGhhbmRsaW5nIGxpbmtzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyTWFya2Rvd24obWFya2Rvd246IElNYXJrZG93blN0cmluZywgb3B0aW9uczogTWFya2Rvd25SZW5kZXJPcHRpb25zID0ge30sIHRhcmdldD86IEhUTUxFbGVtZW50KTogSVJlbmRlcmVkTWFya2Rvd24ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdCBtYXJrZWRJbnN0YW5jZSA9IG5ldyBtYXJrZWQuTWFya2VkKC4uLihvcHRpb25zLm1hcmtlZEV4dGVuc2lvbnMgPz8gW10pKTtcblx0Y29uc3QgeyByZW5kZXJlciwgY29kZUJsb2Nrcywgc3luY0NvZGVCbG9ja3MgfSA9IGNyZWF0ZU1hcmtkb3duUmVuZGVyZXIobWFya2VkSW5zdGFuY2UsIG9wdGlvbnMsIG1hcmtkb3duKTtcblx0Y29uc3QgdmFsdWUgPSBwcmVwcm9jZXNzTWFya2Rvd25TdHJpbmcobWFya2Rvd24pO1xuXG5cdGxldCByZW5kZXJlZE1hcmtkb3duOiBzdHJpbmc7XG5cdGlmIChvcHRpb25zLmZpbGxJbkluY29tcGxldGVUb2tlbnMpIHtcblx0XHQvLyBUaGUgZGVmYXVsdHMgYXJlIGFwcGxpZWQgYnkgcGFyc2UgYnV0IG5vdCBsZXhlcigpL3BhcnNlcigpLCBhbmQgdGhleSBuZWVkIHRvIGJlIHByZXNlbnRcblx0XHRjb25zdCBvcHRzOiBtYXJrZWQuTWFya2VkT3B0aW9ucyA9IHtcblx0XHRcdC4uLm1hcmtlZEluc3RhbmNlLmRlZmF1bHRzLFxuXHRcdFx0Li4ub3B0aW9ucy5tYXJrZWRPcHRpb25zLFxuXHRcdFx0cmVuZGVyZXJcblx0XHR9O1xuXHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZEluc3RhbmNlLmxleGVyKHZhbHVlLCBvcHRzKTtcblx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0cmVuZGVyZWRNYXJrZG93biA9IG1hcmtlZEluc3RhbmNlLnBhcnNlcihuZXdUb2tlbnMsIG9wdHMpO1xuXHR9IGVsc2Uge1xuXHRcdHJlbmRlcmVkTWFya2Rvd24gPSBtYXJrZWRJbnN0YW5jZS5wYXJzZSh2YWx1ZSwgeyAuLi5vcHRpb25zPy5tYXJrZWRPcHRpb25zLCByZW5kZXJlciwgYXN5bmM6IGZhbHNlIH0pO1xuXHR9XG5cblx0Ly8gUmV3cml0ZSB0aGVtZSBpY29uc1xuXHRpZiAobWFya2Rvd24uc3VwcG9ydFRoZW1lSWNvbnMpIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IHJlbmRlckxhYmVsV2l0aEljb25zKHJlbmRlcmVkTWFya2Rvd24pO1xuXHRcdHJlbmRlcmVkTWFya2Rvd24gPSBlbGVtZW50cy5tYXAoZSA9PiB0eXBlb2YgZSA9PT0gJ3N0cmluZycgPyBlIDogZS5vdXRlckhUTUwpLmpvaW4oJycpO1xuXHR9XG5cblx0Y29uc3QgcmVuZGVyZWRDb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGNvbnN0IHNhbml0aXplckNvbmZpZyA9IGdldERvbVNhbml0aXplckNvbmZpZyhtYXJrZG93biwgb3B0aW9ucy5zYW5pdGl6ZXJDb25maWcgPz8ge30pO1xuXHRkb21TYW5pdGl6ZS5zYWZlU2V0SW5uZXJIdG1sKHJlbmRlcmVkQ29udGVudCwgcmVuZGVyZWRNYXJrZG93biwgc2FuaXRpemVyQ29uZmlnKTtcblxuXHQvLyBSZXdyaXRlIGxpbmtzIGFuZCBpbWFnZXMgYmVmb3JlIHBvdGVudGlhbGx5IGluc2VydGluZyB0aGVtIGludG8gdGhlIHJlYWwgZG9tXG5cdHJld3JpdGVSZW5kZXJlZExpbmtzKG1hcmtkb3duLCBvcHRpb25zLCByZW5kZXJlZENvbnRlbnQpO1xuXG5cdGxldCBvdXRFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0aWYgKHRhcmdldCkge1xuXHRcdG91dEVsZW1lbnQgPSB0YXJnZXQ7XG5cdFx0RE9NLnJlc2V0KHRhcmdldCwgLi4ucmVuZGVyZWRDb250ZW50LmNoaWxkTm9kZXMpO1xuXHR9IGVsc2Uge1xuXHRcdG91dEVsZW1lbnQgPSByZW5kZXJlZENvbnRlbnQ7XG5cdH1cblxuXHRpZiAoY29kZUJsb2Nrcy5sZW5ndGggPiAwKSB7XG5cdFx0UHJvbWlzZS5hbGwoY29kZUJsb2NrcykudGhlbigodHVwbGVzKSA9PiB7XG5cdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW5kZXJlZEVsZW1lbnRzID0gbmV3IE1hcCh0dXBsZXMpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBwbGFjZWhvbGRlckVsZW1lbnRzID0gb3V0RWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxEaXZFbGVtZW50PihgZGl2W2RhdGEtY29kZV1gKTtcblx0XHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXJFbGVtZW50IG9mIHBsYWNlaG9sZGVyRWxlbWVudHMpIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRFbGVtZW50ID0gcmVuZGVyZWRFbGVtZW50cy5nZXQocGxhY2Vob2xkZXJFbGVtZW50LmRhdGFzZXRbJ2NvZGUnXSA/PyAnJyk7XG5cdFx0XHRcdGlmIChyZW5kZXJlZEVsZW1lbnQpIHtcblx0XHRcdFx0XHRET00ucmVzZXQocGxhY2Vob2xkZXJFbGVtZW50LCByZW5kZXJlZEVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLmFzeW5jUmVuZGVyQ2FsbGJhY2s/LigpO1xuXHRcdH0pO1xuXHR9IGVsc2UgaWYgKHN5bmNDb2RlQmxvY2tzLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCByZW5kZXJlZEVsZW1lbnRzID0gbmV3IE1hcChzeW5jQ29kZUJsb2Nrcyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJFbGVtZW50cyA9IG91dEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRGl2RWxlbWVudD4oYGRpdltkYXRhLWNvZGVdYCk7XG5cdFx0Zm9yIChjb25zdCBwbGFjZWhvbGRlckVsZW1lbnQgb2YgcGxhY2Vob2xkZXJFbGVtZW50cykge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRFbGVtZW50ID0gcmVuZGVyZWRFbGVtZW50cy5nZXQocGxhY2Vob2xkZXJFbGVtZW50LmRhdGFzZXRbJ2NvZGUnXSA/PyAnJyk7XG5cdFx0XHRpZiAocmVuZGVyZWRFbGVtZW50KSB7XG5cdFx0XHRcdERPTS5yZXNldChwbGFjZWhvbGRlckVsZW1lbnQsIHJlbmRlcmVkRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gU2lnbmFsIHNpemUgY2hhbmdlcyBmb3IgaW1hZ2UgdGFnc1xuXHRpZiAob3B0aW9ucy5hc3luY1JlbmRlckNhbGxiYWNrKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Zm9yIChjb25zdCBpbWcgb2Ygb3V0RWxlbWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaW1nJykpIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaW1nLCAnbG9hZCcsICgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRvcHRpb25zLmFzeW5jUmVuZGVyQ2FsbGJhY2shKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkIGV2ZW50IGxpc3RlbmVycyBmb3IgbGlua3Ncblx0aWYgKG9wdGlvbnMuYWN0aW9uSGFuZGxlcikge1xuXHRcdGNvbnN0IGNsaWNrQ2IgPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBtb3VzZUV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChET00uZ2V0V2luZG93KG91dEVsZW1lbnQpLCBlKTtcblx0XHRcdGlmICghbW91c2VFdmVudC5sZWZ0QnV0dG9uICYmICFtb3VzZUV2ZW50Lm1pZGRsZUJ1dHRvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhY3RpdmF0ZUxpbmsobWFya2Rvd24sIG9wdGlvbnMsIG1vdXNlRXZlbnQpO1xuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIob3V0RWxlbWVudCwgJ2NsaWNrJywgY2xpY2tDYikpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG91dEVsZW1lbnQsICdhdXhjbGljaycsIGNsaWNrQ2IpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG91dEVsZW1lbnQsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKCFrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSAmJiAha2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWN0aXZhdGVMaW5rKG1hcmtkb3duLCBvcHRpb25zLCBrZXlib2FyZEV2ZW50KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyBSZW1vdmUvZGlzYWJsZSBpbnB1dHNcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGZvciAoY29uc3QgaW5wdXQgb2YgWy4uLm91dEVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2lucHV0JyldKSB7XG5cdFx0aWYgKGlucHV0LmF0dHJpYnV0ZXMuZ2V0TmFtZWRJdGVtKCd0eXBlJyk/LnZhbHVlID09PSAnY2hlY2tib3gnKSB7XG5cdFx0XHRpbnB1dC5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAob3B0aW9ucy5zYW5pdGl6ZXJDb25maWc/LnJlcGxhY2VXaXRoUGxhaW50ZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gY29udmVydFRhZ1RvUGxhaW50ZXh0KGlucHV0KTtcblx0XHRcdFx0aWYgKHJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0aW5wdXQucGFyZW50RWxlbWVudD8ucmVwbGFjZUNoaWxkKHJlcGxhY2VtZW50LCBpbnB1dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXQucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlucHV0LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogb3V0RWxlbWVudCxcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRpc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJld3JpdGVSZW5kZXJlZExpbmtzKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgcm9vdDogSFRNTEVsZW1lbnQpIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGZvciAoY29uc3QgZWwgb2Ygcm9vdC5xdWVyeVNlbGVjdG9yQWxsKCdpbWcsIGF1ZGlvLCB2aWRlbywgc291cmNlJykpIHtcblx0XHRjb25zdCBzcmMgPSBlbC5nZXRBdHRyaWJ1dGUoJ3NyYycpOyAvLyBHZXQgdGhlIHJhdyAnc3JjJyBhdHRyaWJ1dGUgdmFsdWUgYXMgdGV4dCwgbm90IHRoZSByZXNvbHZlZCAnc3JjJ1xuXHRcdGlmIChzcmMpIHtcblx0XHRcdGxldCBocmVmID0gc3JjO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKG1hcmtkb3duLmJhc2VVcmkpIHsgLy8gYWJzb2x1dGUgb3IgcmVsYXRpdmUgbG9jYWwgcGF0aCwgb3IgZmlsZTogdXJpXG5cdFx0XHRcdFx0aHJlZiA9IHJlc29sdmVXaXRoQmFzZVVyaShVUkkuZnJvbShtYXJrZG93bi5iYXNlVXJpKSwgaHJlZik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikgeyB9XG5cblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnc3JjJywgbWFzc2FnZUhyZWYobWFya2Rvd24sIGhyZWYsIHRydWUpKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuc2FuaXRpemVyQ29uZmlnPy5yZW1vdGVJbWFnZUlzQWxsb3dlZCkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0XHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5kYXRhICYmICFvcHRpb25zLnNhbml0aXplckNvbmZpZy5yZW1vdGVJbWFnZUlzQWxsb3dlZCh1cmkpKSB7XG5cdFx0XHRcdFx0ZWwucmVwbGFjZVdpdGgoRE9NLiQoJycsIHVuZGVmaW5lZCwgZWwub3V0ZXJIVE1MKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0Zm9yIChjb25zdCBlbCBvZiByb290LnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKSkge1xuXHRcdGNvbnN0IGhyZWYgPSBlbC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKTsgLy8gR2V0IHRoZSByYXcgJ2hyZWYnIGF0dHJpYnV0ZSB2YWx1ZSBhcyB0ZXh0LCBub3QgdGhlIHJlc29sdmVkICdocmVmJ1xuXHRcdGVsLnNldEF0dHJpYnV0ZSgnaHJlZicsICcnKTsgLy8gQ2xlYXIgb3V0IGhyZWYuIFdlIHVzZSB0aGUgYGRhdGEtaHJlZmAgZm9yIGhhbmRsaW5nIGNsaWNrcyBpbnN0ZWFkXG5cdFx0aWYgKCFocmVmXG5cdFx0XHR8fCAvXmRhdGE6fGphdmFzY3JpcHQ6L2kudGVzdChocmVmKVxuXHRcdFx0fHwgKC9eY29tbWFuZDovaS50ZXN0KGhyZWYpICYmICFtYXJrZG93bi5pc1RydXN0ZWQpXG5cdFx0XHR8fCAvXmNvbW1hbmQ6KFxcL1xcL1xcLyk/X3dvcmtiZW5jaFxcLmRvd25sb2FkUmVzb3VyY2UvaS50ZXN0KGhyZWYpKSB7XG5cdFx0XHQvLyBkcm9wIHRoZSBsaW5rXG5cdFx0XHRlbC5yZXBsYWNlV2l0aCguLi5lbC5jaGlsZE5vZGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlc29sdmVkSHJlZiA9IG1hc3NhZ2VIcmVmKG1hcmtkb3duLCBocmVmLCBmYWxzZSk7XG5cdFx0XHRpZiAobWFya2Rvd24uYmFzZVVyaSkge1xuXHRcdFx0XHRyZXNvbHZlZEhyZWYgPSByZXNvbHZlV2l0aEJhc2VVcmkoVVJJLmZyb20obWFya2Rvd24uYmFzZVVyaSksIGhyZWYpO1xuXHRcdFx0fVxuXHRcdFx0ZWwuZGF0YXNldC5ocmVmID0gcmVzb2x2ZWRIcmVmO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVNYXJrZG93blJlbmRlcmVyKG1hcmtlZDogbWFya2VkLk1hcmtlZCwgb3B0aW9uczogTWFya2Rvd25SZW5kZXJPcHRpb25zLCBtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nKTogeyByZW5kZXJlcjogbWFya2VkLlJlbmRlcmVyOyBjb2RlQmxvY2tzOiBQcm9taXNlPFtzdHJpbmcsIEhUTUxFbGVtZW50XT5bXTsgc3luY0NvZGVCbG9ja3M6IFtzdHJpbmcsIEhUTUxFbGVtZW50XVtdIH0ge1xuXHRjb25zdCByZW5kZXJlciA9IG5ldyBtYXJrZWQuUmVuZGVyZXIob3B0aW9ucy5tYXJrZWRPcHRpb25zKTtcblx0cmVuZGVyZXIuaW1hZ2UgPSB0b2tlbiA9PiByZW5kZXJJbWFnZSh0b2tlbiwgaHJlZiA9PiBvcHRpb25zLnRyYW5zZm9ybVVyaT8uKGhyZWYsICdpbWFnZScpID8/IGhyZWYpO1xuXHRyZW5kZXJlci5saW5rID0gdG9rZW4gPT4gZGVmYXVsdE1hcmtlZFJlbmRlcmVycy5saW5rLmNhbGwocmVuZGVyZXIsIHtcblx0XHQuLi50b2tlbixcblx0XHRocmVmOiBvcHRpb25zLnRyYW5zZm9ybVVyaT8uKHRva2VuLmhyZWYsICdsaW5rJykgPz8gdG9rZW4uaHJlZixcblx0fSk7XG5cdHJlbmRlcmVyLnBhcmFncmFwaCA9IGRlZmF1bHRNYXJrZWRSZW5kZXJlcnMucGFyYWdyYXBoO1xuXG5cdGlmIChtYXJrZG93bi5zdXBwb3J0QWxlcnRTeW50YXgpIHtcblx0XHRyZW5kZXJlci5ibG9ja3F1b3RlID0gY3JlYXRlQWxlcnRCbG9ja3F1b3RlUmVuZGVyZXIocmVuZGVyZXIuYmxvY2txdW90ZSk7XG5cdH1cblxuXHQvLyBXaWxsIGNvbGxlY3QgW2lkLCByZW5kZXJlZEVsZW1lbnRdIHR1cGxlc1xuXHRjb25zdCBjb2RlQmxvY2tzOiBQcm9taXNlPFtzdHJpbmcsIEhUTUxFbGVtZW50XT5bXSA9IFtdO1xuXHRjb25zdCBzeW5jQ29kZUJsb2NrczogW3N0cmluZywgSFRNTEVsZW1lbnRdW10gPSBbXTtcblxuXHRpZiAob3B0aW9ucy5jb2RlQmxvY2tSZW5kZXJlclN5bmMpIHtcblx0XHRyZW5kZXJlci5jb2RlID0gKHsgdGV4dCwgbGFuZywgcmF3IH06IG1hcmtlZC5Ub2tlbnMuQ29kZSkgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBkZWZhdWx0R2VuZXJhdG9yLm5leHRJZCgpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBvcHRpb25zLmNvZGVCbG9ja1JlbmRlcmVyU3luYyEocG9zdFByb2Nlc3NDb2RlQmxvY2tMYW5ndWFnZUlkKGxhbmcpLCB0ZXh0LCByYXcpO1xuXHRcdFx0c3luY0NvZGVCbG9ja3MucHVzaChbaWQsIHZhbHVlXSk7XG5cdFx0XHRyZXR1cm4gYDxkaXYgY2xhc3M9XCJjb2RlXCIgZGF0YS1jb2RlPVwiJHtpZH1cIj4ke2VzY2FwZSh0ZXh0KX08L2Rpdj5gO1xuXHRcdH07XG5cdH0gZWxzZSBpZiAob3B0aW9ucy5jb2RlQmxvY2tSZW5kZXJlcikge1xuXHRcdHJlbmRlcmVyLmNvZGUgPSAoeyB0ZXh0LCBsYW5nIH06IG1hcmtlZC5Ub2tlbnMuQ29kZSkgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBkZWZhdWx0R2VuZXJhdG9yLm5leHRJZCgpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBvcHRpb25zLmNvZGVCbG9ja1JlbmRlcmVyIShwb3N0UHJvY2Vzc0NvZGVCbG9ja0xhbmd1YWdlSWQobGFuZyksIHRleHQpO1xuXHRcdFx0Y29kZUJsb2Nrcy5wdXNoKHZhbHVlLnRoZW4oZWxlbWVudCA9PiBbaWQsIGVsZW1lbnRdKSk7XG5cdFx0XHRyZXR1cm4gYDxkaXYgY2xhc3M9XCJjb2RlXCIgZGF0YS1jb2RlPVwiJHtpZH1cIj4ke2VzY2FwZSh0ZXh0KX08L2Rpdj5gO1xuXHRcdH07XG5cdH1cblxuXHRpZiAoIW1hcmtkb3duLnN1cHBvcnRIdG1sKSB7XG5cdFx0Ly8gTm90ZTogd2UgYWx3YXlzIHBhc3MgdGhlIG91dHB1dCB0aHJvdWdoIGRvbXB1cmlmeSBhZnRlciB0aGlzIHNvIHRoYXQgd2UgZG9uJ3QgcmVseSBvblxuXHRcdC8vIG1hcmtlZCBmb3IgcmVhbCBzYW5pdGl6YXRpb24uXG5cdFx0cmVuZGVyZXIuaHRtbCA9ICh7IHRleHQgfSkgPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnMuc2FuaXRpemVyQ29uZmlnPy5yZXBsYWNlV2l0aFBsYWludGV4dCkge1xuXHRcdFx0XHRyZXR1cm4gZXNjYXBlKHRleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXRjaCA9IG1hcmtkb3duLmlzVHJ1c3RlZCA/IHRleHQubWF0Y2goL14oPHNwYW5bXj5dKz4pfCg8XFwvXFxzKnNwYW4+KSQvKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBtYXRjaCA/IHRleHQgOiAnJztcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7IHJlbmRlcmVyLCBjb2RlQmxvY2tzLCBzeW5jQ29kZUJsb2NrcyB9O1xufVxuXG5mdW5jdGlvbiBwcmVwcm9jZXNzTWFya2Rvd25TdHJpbmcobWFya2Rvd246IElNYXJrZG93blN0cmluZykge1xuXHRsZXQgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblxuXHQvLyB2YWx1ZXMgdGhhdCBhcmUgdG9vIGxvbmcgd2lsbCBmcmVlemUgdGhlIFVJXG5cdGlmICh2YWx1ZS5sZW5ndGggPiAxMDBfMDAwKSB7XG5cdFx0dmFsdWUgPSBgJHt2YWx1ZS5zdWJzdHIoMCwgMTAwXzAwMCl9XHUyMDI2YDtcblx0fVxuXG5cdC8vIGVzY2FwZSB0aGVtZSBpY29uc1xuXHRpZiAobWFya2Rvd24uc3VwcG9ydFRoZW1lSWNvbnMpIHtcblx0XHR2YWx1ZSA9IG1hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zKHZhbHVlKTtcblx0fVxuXG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gYWN0aXZhdGVMaW5rKG1kU3RyOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgZXZlbnQ6IFN0YW5kYXJkTW91c2VFdmVudCB8IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQuY2xvc2VzdCgnYVtkYXRhLWhyZWZdJyk7XG5cdGlmICghRE9NLmlzSFRNTEVsZW1lbnQodGFyZ2V0KSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHRyeSB7XG5cdFx0bGV0IGhyZWYgPSB0YXJnZXQuZGF0YXNldFsnaHJlZiddO1xuXHRcdGlmIChocmVmKSB7XG5cdFx0XHRpZiAobWRTdHIuYmFzZVVyaSkge1xuXHRcdFx0XHRocmVmID0gcmVzb2x2ZVdpdGhCYXNlVXJpKFVSSS5mcm9tKG1kU3RyLmJhc2VVcmkpLCBocmVmKTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMuYWN0aW9uSGFuZGxlcj8uKGhyZWYsIG1kU3RyKTtcblx0XHR9XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdH0gZmluYWxseSB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0fVxufVxuXG5mdW5jdGlvbiB1cmlNYXNzYWdlKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIHBhcnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBkYXRhOiB1bmtub3duO1xuXHR0cnkge1xuXHRcdGRhdGEgPSBwYXJzZShkZWNvZGVVUklDb21wb25lbnQocGFydCkpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0Ly8gaWdub3JlXG5cdH1cblx0aWYgKCFkYXRhKSB7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblx0ZGF0YSA9IGNsb25lQW5kQ2hhbmdlKGRhdGEsIHZhbHVlID0+IHtcblx0XHRpZiAobWFya2Rvd24udXJpcyAmJiBtYXJrZG93bi51cmlzW3ZhbHVlXSkge1xuXHRcdFx0cmV0dXJuIFVSSS5yZXZpdmUobWFya2Rvd24udXJpc1t2YWx1ZV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xufVxuXG5mdW5jdGlvbiBtYXNzYWdlSHJlZihtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nLCBocmVmOiBzdHJpbmcsIGlzRG9tVXJpOiBib29sZWFuKTogc3RyaW5nIHtcblx0Y29uc3QgZGF0YSA9IG1hcmtkb3duLnVyaXMgJiYgbWFya2Rvd24udXJpc1tocmVmXTtcblx0bGV0IHVyaSA9IFVSSS5yZXZpdmUoZGF0YSk7XG5cdGlmIChpc0RvbVVyaSkge1xuXHRcdGlmIChocmVmLnN0YXJ0c1dpdGgoU2NoZW1hcy5kYXRhICsgJzonKSkge1xuXHRcdFx0cmV0dXJuIGhyZWY7XG5cdFx0fVxuXHRcdGlmICghdXJpKSB7XG5cdFx0XHR1cmkgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0fVxuXHRcdC8vIHRoaXMgVVJJIHdpbGwgZW5kIHVwIGFzIFwic3JjXCItYXR0cmlidXRlIG9mIGEgZG9tIG5vZGVcblx0XHQvLyBhbmQgYmVjYXVzZSBvZiB0aGF0IHNwZWNpYWwgcmV3cml0aW5nIG5lZWRzIHRvIGJlIGRvbmVcblx0XHQvLyBzbyB0aGF0IHRoZSBVUkkgdXNlcyBhIHByb3RvY29sIHRoYXQncyB1bmRlcnN0b29kIGJ5XG5cdFx0Ly8gYnJvd3NlcnMgKGxpa2UgaHR0cCBvciBodHRwcylcblx0XHRyZXR1cm4gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkodXJpKS50b1N0cmluZyh0cnVlKTtcblx0fVxuXHRpZiAoIXVyaSkge1xuXHRcdHJldHVybiBocmVmO1xuXHR9XG5cdGlmIChVUkkucGFyc2UoaHJlZikudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpIHtcblx0XHRyZXR1cm4gaHJlZjsgLy8gbm8gdHJhbnNmb3JtYXRpb24gcGVyZm9ybWVkXG5cdH1cblx0aWYgKHVyaS5xdWVyeSkge1xuXHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IHVyaU1hc3NhZ2UobWFya2Rvd24sIHVyaS5xdWVyeSkgfSk7XG5cdH1cblx0cmV0dXJuIHVyaS50b1N0cmluZygpO1xufVxuXG5mdW5jdGlvbiBwb3N0UHJvY2Vzc0NvZGVCbG9ja0xhbmd1YWdlSWQobGFuZzogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCFsYW5nKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0Y29uc3QgcGFydHMgPSBsYW5nLnNwbGl0KC9bXFxzK3w6fCx8XFx7fFxcP10vLCAxKTtcblx0aWYgKHBhcnRzLmxlbmd0aCkge1xuXHRcdHJldHVybiBwYXJ0c1swXTtcblx0fVxuXHRyZXR1cm4gbGFuZztcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVdpdGhCYXNlVXJpKGJhc2VVcmk6IFVSSSwgaHJlZjogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgaGFzU2NoZW1lID0gL15cXHdbXFx3XFxkKy4tXSo6Ly50ZXN0KGhyZWYpO1xuXHRpZiAoaGFzU2NoZW1lKSB7XG5cdFx0cmV0dXJuIGhyZWY7XG5cdH1cblxuXHRpZiAoYmFzZVVyaS5wYXRoLmVuZHNXaXRoKCcvJykpIHtcblx0XHRyZXR1cm4gcmVzb2x2ZVBhdGgoYmFzZVVyaSwgaHJlZikudG9TdHJpbmcoKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gcmVzb2x2ZVBhdGgoZGlybmFtZShiYXNlVXJpKSwgaHJlZikudG9TdHJpbmcoKTtcblx0fVxufVxuXG50eXBlIE1kU3RyQ29uZmlnID0ge1xuXHRyZWFkb25seSBpc1RydXN0ZWQ/OiBib29sZWFuIHwgTWFya2Rvd25TdHJpbmdUcnVzdGVkT3B0aW9ucztcblx0cmVhZG9ubHkgYmFzZVVyaT86IFVyaUNvbXBvbmVudHM7XG59O1xuXG5mdW5jdGlvbiBzYW5pdGl6ZVJlbmRlcmVkTWFya2Rvd24oXG5cdHJlbmRlcmVkTWFya2Rvd246IHN0cmluZyxcblx0b3JpZ2luYWxNZFN0ckNvbmZpZzogTWRTdHJDb25maWcsXG5cdG9wdGlvbnM6IE1hcmtkb3duU2FuaXRpemVyQ29uZmlnID0ge30sXG4pOiBUcnVzdGVkSFRNTCB7XG5cdGNvbnN0IHNhbml0aXplckNvbmZpZyA9IGdldERvbVNhbml0aXplckNvbmZpZyhvcmlnaW5hbE1kU3RyQ29uZmlnLCBvcHRpb25zKTtcblx0cmV0dXJuIGRvbVNhbml0aXplLnNhbml0aXplSHRtbChyZW5kZXJlZE1hcmtkb3duLCBzYW5pdGl6ZXJDb25maWcpO1xufVxuXG5leHBvcnQgY29uc3QgYWxsb3dlZE1hcmtkb3duSHRtbFRhZ3MgPSBPYmplY3QuZnJlZXplKFtcblx0Li4uZG9tU2FuaXRpemUuYmFzaWNNYXJrdXBIdG1sVGFncyxcblx0J2lucHV0JywgLy8gQWxsb3cgaW5wdXRzIGZvciByZW5kZXJpbmcgY2hlY2tib3hlcy4gT3RoZXIgdHlwZXMgb2YgaW5wdXRzIGFyZSByZW1vdmVkIGFuZCB0aGUgaW5wdXRzIGFyZSBhbHdheXMgZGlzYWJsZWRcbl0pO1xuXG5leHBvcnQgY29uc3QgYWxsb3dlZE1hcmtkb3duSHRtbEF0dHJpYnV0ZXMgPSBPYmplY3QuZnJlZXplPEFycmF5PHN0cmluZyB8IGRvbVNhbml0aXplLlNhbml0aXplQXR0cmlidXRlUnVsZT4+KFtcblx0J2FsaWduJyxcblx0J2F1dG9wbGF5Jyxcblx0J2FsdCcsXG5cdCdjb2xzcGFuJyxcblx0J2NvbnRyb2xzJyxcblx0J2RyYWdnYWJsZScsXG5cdCdoZWlnaHQnLFxuXHQnaHJlZicsXG5cdCdsb29wJyxcblx0J211dGVkJyxcblx0J3BsYXlzaW5saW5lJyxcblx0J3Bvc3RlcicsXG5cdCdyb3dzcGFuJyxcblx0J3NyYycsXG5cdCd0YXJnZXQnLFxuXHQndGl0bGUnLFxuXHQndHlwZScsXG5cdCd3aWR0aCcsXG5cdCdzdGFydCcsXG5cblx0Ly8gSW5wdXQgKEZvciBkaXNhYmxlZCBpbnB1dHMpXG5cdCdjaGVja2VkJyxcblx0J2Rpc2FibGVkJyxcblx0J3ZhbHVlJyxcblxuXHQvLyBDdXN0b20gbWFya2Rvd24gYXR0cmlidXRlc1xuXHQnZGF0YS1jb2RlJyxcblx0J2RhdGEtaHJlZicsXG5cdCdkYXRhLXNldmVyaXR5JyxcblxuXHQvLyBPbmx5IGFsbG93IHZlcnkgc3BlY2lmaWMgc3R5bGVzXG5cdHtcblx0XHRhdHRyaWJ1dGVOYW1lOiAnc3R5bGUnLFxuXHRcdHNob3VsZEtlZXA6IChlbGVtZW50LCBkYXRhKSA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudC50YWdOYW1lID09PSAnU1BBTicpIHtcblx0XHRcdFx0aWYgKGRhdGEuYXR0ck5hbWUgPT09ICdzdHlsZScpIHtcblx0XHRcdFx0XHRyZXR1cm4gL14oY29sb3JcXDooI1swLTlhLWZBLUZdK3x2YXJcXCgtLXZzY29kZSgtW2EtekEtWjAtOV0rKStcXCkpOyk/KGJhY2tncm91bmQtY29sb3JcXDooI1swLTlhLWZBLUZdK3x2YXJcXCgtLXZzY29kZSgtW2EtekEtWjAtOV0rKStcXCkpOyk/KGJvcmRlci1yYWRpdXM6WzAtOV0rcHg7KT8kLy50ZXN0KGRhdGEuYXR0clZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fSxcblxuXHQvLyBPbmx5IGFsbG93IGNvZGljb25zIGZvciBjbGFzc2VzXG5cdHtcblx0XHRhdHRyaWJ1dGVOYW1lOiAnY2xhc3MnLFxuXHRcdHNob3VsZEtlZXA6IChlbGVtZW50LCBkYXRhKSA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudC50YWdOYW1lID09PSAnU1BBTicpIHtcblx0XHRcdFx0aWYgKGRhdGEuYXR0ck5hbWUgPT09ICdjbGFzcycpIHtcblx0XHRcdFx0XHRyZXR1cm4gL15jb2RpY29uIGNvZGljb24tW2EtelxcLV0rKCBjb2RpY29uLW1vZGlmaWVyLVthLXpcXC1dKyk/JC8udGVzdChkYXRhLmF0dHJWYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9LFxuXHR9LFxuXSk7XG5cbmZ1bmN0aW9uIGdldERvbVNhbml0aXplckNvbmZpZyhtZFN0ckNvbmZpZzogTWRTdHJDb25maWcsIG9wdGlvbnM6IE1hcmtkb3duU2FuaXRpemVyQ29uZmlnKTogZG9tU2FuaXRpemUuRG9tU2FuaXRpemVyQ29uZmlnIHtcblx0Y29uc3QgaXNUcnVzdGVkID0gbWRTdHJDb25maWcuaXNUcnVzdGVkID8/IGZhbHNlO1xuXHRjb25zdCBhbGxvd2VkTGlua1NjaGVtZXMgPSBbXG5cdFx0U2NoZW1hcy5odHRwLFxuXHRcdFNjaGVtYXMuaHR0cHMsXG5cdFx0U2NoZW1hcy5tYWlsdG8sXG5cdFx0U2NoZW1hcy5maWxlLFxuXHRcdFNjaGVtYXMudnNjb2RlRmlsZVJlc291cmNlLFxuXHRcdFNjaGVtYXMudnNjb2RlUmVtb3RlLFxuXHRcdFNjaGVtYXMudnNjb2RlUmVtb3RlUmVzb3VyY2UsXG5cdFx0U2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwsXG5cdFx0Ly8gRm9yIGxpbmtzIHRoYXQgYXJlIGhhbmRsZWQgZW50aXJlbHkgYnkgdGhlIGFjdGlvbiBoYW5kbGVyXG5cdFx0U2NoZW1hcy5pbnRlcm5hbCxcblx0XTtcblxuXHRpZiAoaXNUcnVzdGVkKSB7XG5cdFx0YWxsb3dlZExpbmtTY2hlbWVzLnB1c2goU2NoZW1hcy5jb21tYW5kKTtcblx0fVxuXG5cdGlmIChvcHRpb25zLmFsbG93ZWRMaW5rU2NoZW1lcz8uYXVnbWVudCkge1xuXHRcdGFsbG93ZWRMaW5rU2NoZW1lcy5wdXNoKC4uLm9wdGlvbnMuYWxsb3dlZExpbmtTY2hlbWVzLmF1Z21lbnQpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHQvLyBhbGxvd2VkVGFncyBzaG91bGQgaW5jbHVkZWQgZXZlcnl0aGluZyB0aGF0IG1hcmtkb3duIHJlbmRlcnMgdG8uXG5cdFx0Ly8gU2luY2Ugd2UgaGF2ZSBvdXIgb3duIHNhbml0aXplIGZ1bmN0aW9uIGZvciBtYXJrZWQsIGl0J3MgcG9zc2libGUgd2UgbWlzc2VkIHNvbWUgdGFnIHNvIGxldCBkb21wdXJpZnkgbWFrZSBzdXJlLlxuXHRcdC8vIEhUTUwgdGFncyB0aGF0IGNhbiByZXN1bHQgZnJvbSBtYXJrZG93biBhcmUgZnJvbSByZWFkaW5nIGh0dHBzOi8vc3BlYy5jb21tb25tYXJrLm9yZy8wLjI5L1xuXHRcdC8vIEhUTUwgdGFibGUgdGFncyB0aGF0IGNhbiByZXN1bHQgZnJvbSBtYXJrZG93biBhcmUgZnJvbSBodHRwczovL2dpdGh1Yi5naXRodWIuY29tL2dmbS8jdGFibGVzLWV4dGVuc2lvbi1cblx0XHRhbGxvd2VkVGFnczoge1xuXHRcdFx0b3ZlcnJpZGU6IG9wdGlvbnMuYWxsb3dlZFRhZ3M/Lm92ZXJyaWRlID8/IGFsbG93ZWRNYXJrZG93bkh0bWxUYWdzXG5cdFx0fSxcblx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0b3ZlcnJpZGU6IG9wdGlvbnMuYWxsb3dlZEF0dHJpYnV0ZXM/Lm92ZXJyaWRlID8/IGFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzLFxuXHRcdH0sXG5cdFx0YWxsb3dlZExpbmtQcm90b2NvbHM6IHtcblx0XHRcdG92ZXJyaWRlOiBhbGxvd2VkTGlua1NjaGVtZXMsXG5cdFx0fSxcblx0XHRhbGxvd1JlbGF0aXZlTGlua1BhdGhzOiAhIW1kU3RyQ29uZmlnLmJhc2VVcmksXG5cdFx0YWxsb3dlZE1lZGlhUHJvdG9jb2xzOiB7XG5cdFx0XHRvdmVycmlkZTogW1xuXHRcdFx0XHRTY2hlbWFzLmh0dHAsXG5cdFx0XHRcdFNjaGVtYXMuaHR0cHMsXG5cdFx0XHRcdFNjaGVtYXMuZGF0YSxcblx0XHRcdFx0U2NoZW1hcy5maWxlLFxuXHRcdFx0XHRTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZSxcblx0XHRcdFx0U2NoZW1hcy52c2NvZGVSZW1vdGUsXG5cdFx0XHRcdFNjaGVtYXMudnNjb2RlUmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRhbGxvd1JlbGF0aXZlTWVkaWFQYXRoczogISFtZFN0ckNvbmZpZy5iYXNlVXJpLFxuXHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiBvcHRpb25zLnJlcGxhY2VXaXRoUGxhaW50ZXh0LFxuXHR9O1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYHN0cmAgYXMgcGxhaW50ZXh0LCBzdHJpcHBpbmcgb3V0IE1hcmtkb3duIHN5bnRheCBpZiBpdCdzIGEge0BsaW5rIElNYXJrZG93blN0cmluZ30uXG4gKlxuICogRm9yIGV4YW1wbGUgYCMgSGVhZGVyYCB3b3VsZCBiZSBvdXRwdXQgYXMgYEhlYWRlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJBc1BsYWludGV4dChzdHI6IElNYXJrZG93blN0cmluZyB8IHN0cmluZywgb3B0aW9ucz86IHtcblx0LyoqIENvbnRyb2xzIGlmIHRoZSBgYGAgb2YgY29kZSBibG9ja3Mgc2hvdWxkIGJlIHByZXNlcnZlZCBpbiB0aGUgb3V0cHV0IG9yIG5vdCAqL1xuXHRyZWFkb25seSBpbmNsdWRlQ29kZUJsb2Nrc0ZlbmNlcz86IGJvb2xlYW47XG5cdC8qKiBDb250cm9scyBpZiB3ZSB3YW50IHRvIGZvcm1hdCBlbXB0eSBsaW5rcyBmcm9tIFwiTGluayBbXShmaWxlKVwiIHRvIFwiTGluayBmaWxlXCIgKi9cblx0cmVhZG9ubHkgdXNlTGlua0Zvcm1hdHRlcj86IGJvb2xlYW47XG59KSB7XG5cdGlmICh0eXBlb2Ygc3RyID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHQvLyB2YWx1ZXMgdGhhdCBhcmUgdG9vIGxvbmcgd2lsbCBmcmVlemUgdGhlIFVJXG5cdGxldCB2YWx1ZSA9IHN0ci52YWx1ZSA/PyAnJztcblx0aWYgKHZhbHVlLmxlbmd0aCA+IDEwMF8wMDApIHtcblx0XHR2YWx1ZSA9IGAke3ZhbHVlLnN1YnN0cigwLCAxMDBfMDAwKX1cdTIwMjZgO1xuXHR9XG5cblx0Y29uc3QgcmVuZGVyZXIgPSBjcmVhdGVQbGFpblRleHRSZW5kZXJlcigpO1xuXHRpZiAob3B0aW9ucz8uaW5jbHVkZUNvZGVCbG9ja3NGZW5jZXMpIHtcblx0XHRyZW5kZXJlci5jb2RlID0gY29kZUJsb2NrRmVuY2VzO1xuXHR9XG5cdGlmIChvcHRpb25zPy51c2VMaW5rRm9ybWF0dGVyKSB7XG5cdFx0cmVuZGVyZXIubGluayA9IGxpbmtGb3JtYXR0ZXI7XG5cdH1cblxuXHRjb25zdCBodG1sID0gbWFya2VkLnBhcnNlKHZhbHVlLCB7IGFzeW5jOiBmYWxzZSwgcmVuZGVyZXIgfSk7XG5cdHJldHVybiBzYW5pdGl6ZVJlbmRlcmVkTWFya2Rvd24oaHRtbCwgeyBpc1RydXN0ZWQ6IGZhbHNlIH0sIHt9KVxuXHRcdC50b1N0cmluZygpXG5cdFx0LnJlcGxhY2UoLyYoI1xcZCt8W2EtekEtWl0rKTsvZywgbSA9PiB1bmVzY2FwZUluZm8uZ2V0KG0pID8/IG0pXG5cdFx0LnRyaW0oKTtcbn1cblxuY29uc3QgdW5lc2NhcGVJbmZvID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oW1xuXHRbJyZxdW90OycsICdcIiddLFxuXHRbJyZuYnNwOycsICcgJ10sXG5cdFsnJmFtcDsnLCAnJiddLFxuXHRbJyYjMzk7JywgJ1xcJyddLFxuXHRbJyZsdDsnLCAnPCddLFxuXHRbJyZndDsnLCAnPiddLFxuXSk7XG5cbmZ1bmN0aW9uIGNyZWF0ZVBsYWluVGV4dFJlbmRlcmVyKCk6IG1hcmtlZC5SZW5kZXJlciB7XG5cdGNvbnN0IHJlbmRlcmVyID0gbmV3IG1hcmtlZC5SZW5kZXJlcigpO1xuXG5cdHJlbmRlcmVyLmNvZGUgPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuQ29kZSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIGVzY2FwZSh0ZXh0KTtcblx0fTtcblx0cmVuZGVyZXIuYmxvY2txdW90ZSA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5CbG9ja3F1b3RlKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gdGV4dCArICdcXG4nO1xuXHR9O1xuXHRyZW5kZXJlci5odG1sID0gKF86IG1hcmtlZC5Ub2tlbnMuSFRNTCk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuICcnO1xuXHR9O1xuXHRyZW5kZXJlci5oZWFkaW5nID0gZnVuY3Rpb24gKHsgdG9rZW5zIH06IG1hcmtlZC5Ub2tlbnMuSGVhZGluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VyLnBhcnNlSW5saW5lKHRva2VucykgKyAnXFxuJztcblx0fTtcblx0cmVuZGVyZXIuaHIgPSAoKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gJyc7XG5cdH07XG5cdHJlbmRlcmVyLmxpc3QgPSBmdW5jdGlvbiAoeyBpdGVtcyB9OiBtYXJrZWQuVG9rZW5zLkxpc3QpOiBzdHJpbmcge1xuXHRcdHJldHVybiBpdGVtcy5tYXAoeCA9PiB0aGlzLmxpc3RpdGVtKHgpKS5qb2luKCdcXG4nKSArICdcXG4nO1xuXHR9O1xuXHRyZW5kZXJlci5saXN0aXRlbSA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5MaXN0SXRlbSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQgKyAnXFxuJztcblx0fTtcblx0cmVuZGVyZXIucGFyYWdyYXBoID0gZnVuY3Rpb24gKHsgdG9rZW5zIH06IG1hcmtlZC5Ub2tlbnMuUGFyYWdyYXBoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJzZXIucGFyc2VJbmxpbmUodG9rZW5zKSArICdcXG4nO1xuXHR9O1xuXHRyZW5kZXJlci50YWJsZSA9IGZ1bmN0aW9uICh7IGhlYWRlciwgcm93cyB9OiBtYXJrZWQuVG9rZW5zLlRhYmxlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaGVhZGVyLm1hcChjZWxsID0+IHRoaXMudGFibGVjZWxsKGNlbGwpKS5qb2luKCcgJykgKyAnXFxuJyArIHJvd3MubWFwKGNlbGxzID0+IGNlbGxzLm1hcChjZWxsID0+IHRoaXMudGFibGVjZWxsKGNlbGwpKS5qb2luKCcgJykpLmpvaW4oJ1xcbicpICsgJ1xcbic7XG5cdH07XG5cdHJlbmRlcmVyLnRhYmxlcm93ID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLlRhYmxlUm93KTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fTtcblx0cmVuZGVyZXIudGFibGVjZWxsID0gZnVuY3Rpb24gKHsgdG9rZW5zIH06IG1hcmtlZC5Ub2tlbnMuVGFibGVDZWxsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJzZXIucGFyc2VJbmxpbmUodG9rZW5zKTtcblx0fTtcblx0cmVuZGVyZXIuc3Ryb25nID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLlN0cm9uZyk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH07XG5cdHJlbmRlcmVyLmVtID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkVtKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fTtcblx0cmVuZGVyZXIuY29kZXNwYW4gPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuQ29kZXNwYW4pOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9O1xuXHRyZW5kZXJlci5iciA9IChfOiBtYXJrZWQuVG9rZW5zLkJyKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gJ1xcbic7XG5cdH07XG5cdHJlbmRlcmVyLmRlbCA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5EZWwpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9O1xuXHRyZW5kZXJlci5pbWFnZSA9IChfOiBtYXJrZWQuVG9rZW5zLkltYWdlKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gJyc7XG5cdH07XG5cdHJlbmRlcmVyLnRleHQgPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuVGV4dCk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH07XG5cdHJlbmRlcmVyLmxpbmsgPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuTGluayk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH07XG5cdHJldHVybiByZW5kZXJlcjtcbn1cblxuY29uc3QgY29kZUJsb2NrRmVuY2VzID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkNvZGUpOiBzdHJpbmcgPT4ge1xuXHRyZXR1cm4gYFxcblxcYFxcYFxcYFxcbiR7ZXNjYXBlKHRleHQpfVxcblxcYFxcYFxcYFxcbmA7XG59O1xuXG5jb25zdCBsaW5rRm9ybWF0dGVyID0gKHsgdGV4dCwgaHJlZiB9OiBtYXJrZWQuVG9rZW5zLkxpbmspOiBzdHJpbmcgPT4ge1xuXHR0cnkge1xuXHRcdGlmIChocmVmKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0XHRyZXR1cm4gdGV4dC50cmltKCkgfHwgYmFzZW5hbWUodXJpKTtcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRyZXR1cm4gdGV4dC50cmltKCkgfHwgcGF0aEJhc2VuYW1lKGhyZWYpO1xuXHR9XG5cdHJldHVybiB0ZXh0O1xufTtcblxuZnVuY3Rpb24gbWVyZ2VSYXdUb2tlblRleHQodG9rZW5zOiBtYXJrZWQuVG9rZW5bXSk6IHN0cmluZyB7XG5cdGxldCBtZXJnZWRUb2tlblRleHQgPSAnJztcblx0dG9rZW5zLmZvckVhY2godG9rZW4gPT4ge1xuXHRcdG1lcmdlZFRva2VuVGV4dCArPSB0b2tlbi5yYXc7XG5cdH0pO1xuXHRyZXR1cm4gbWVyZ2VkVG9rZW5UZXh0O1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZVNpbmdsZUxpbmVQYXR0ZXJuKHRva2VuOiBtYXJrZWQuVG9rZW5zLlRleHQgfCBtYXJrZWQuVG9rZW5zLlBhcmFncmFwaCk6IG1hcmtlZC5Ub2tlbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghdG9rZW4udG9rZW5zKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZvciAobGV0IGkgPSB0b2tlbi50b2tlbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRjb25zdCBzdWJ0b2tlbiA9IHRva2VuLnRva2Vuc1tpXTtcblx0XHRpZiAoc3VidG9rZW4udHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IHN1YnRva2VuLnJhdy5zcGxpdCgnXFxuJyk7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdO1xuXG5cdFx0XHQvLyBBbiBpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IG11c3QgYmUgY29tcGxldGVkIGJlZm9yZSBlbXBoYXNpcy9jb2Rlc3Bhbi4gVGhlIGxpbmsgaXMgdGhlXG5cdFx0XHQvLyBpbm5lcm1vc3QgdW5maW5pc2hlZCBjb25zdHJ1Y3QsIHNvIGFueSBlbXBoYXNpcyBtYXJrZXIgKGUuZy4gdGhlIGAqKmAgaW4gYCoqW3RleHRdKGh0dGApXG5cdFx0XHQvLyBiZWxvbmdzIHRvIGFuIGVuY2xvc2luZyBzcGFuLiBDb21wbGV0aW5nIHRoZSBlbXBoYXNpcyBmaXJzdCB3b3VsZCBsZWF2ZSB0aGUgbGluayBicm9rZW4uXG5cdFx0XHRpZiAoXG5cdFx0XHRcdC8vIFRleHQgd2l0aCBzdGFydCBvZiBsaW5rIHRhcmdldFxuXHRcdFx0XHRoYXNMaW5rVGV4dEFuZFN0YXJ0T2ZMaW5rVGFyZ2V0KGxhc3RMaW5lKSB8fFxuXHRcdFx0XHQvLyBUaGlzIHRva2VuIGRvZXNuJ3QgaGF2ZSB0aGUgbGluayB0ZXh0LCBlZyBpZiBpdCBjb250YWlucyBvdGhlciBtYXJrZG93biBjb25zdHJ1Y3RzIHRoYXQgYXJlIGluIG90aGVyIHN1YnRva2Vucy5cblx0XHRcdFx0Ly8gQnV0IHNvbWUgcHJlY2VkaW5nIHRva2VuIGRvZXMgaGF2ZSBhbiB1bmJhbGFuY2VkIFsgYXQgbGVhc3Rcblx0XHRcdFx0aGFzU3RhcnRPZkxpbmtUYXJnZXRBbmROb0xpbmtUZXh0KGxhc3RMaW5lKSAmJiB0b2tlbi50b2tlbnMuc2xpY2UoMCwgaSkuc29tZSh0ID0+IHQudHlwZSA9PT0gJ3RleHQnICYmIHQucmF3Lm1hdGNoKC9cXFtbXlxcXV0qJC8pKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IG5leHRUd29TdWJUb2tlbnMgPSB0b2tlbi50b2tlbnMuc2xpY2UoaSArIDEpO1xuXG5cdFx0XHRcdC8vIEEgbWFya2Rvd24gbGluayBjYW4gbG9vayBsaWtlXG5cdFx0XHRcdC8vIFtsaW5rIHRleHRdKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSBcIm1vcmUgdGV4dFwiKVxuXHRcdFx0XHQvLyBXaGVyZSBcIm1vcmUgdGV4dFwiIGlzIGEgdGl0bGUgZm9yIHRoZSBsaW5rIG9yIGFuIGFyZ3VtZW50IHRvIGEgdnNjb2RlIGNvbW1hbmQgbGlua1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGxpbmsgd2FzIHBhcnNlZCBhcyBhIGxpbmssIHRoZW4gbG9vayBmb3IgYSBsaW5rIHRva2VuIGFuZCBhIHRleHQgdG9rZW4gd2l0aCBhIHF1b3RlXG5cdFx0XHRcdFx0bmV4dFR3b1N1YlRva2Vuc1swXT8udHlwZSA9PT0gJ2xpbmsnICYmIG5leHRUd29TdWJUb2tlbnNbMV0/LnR5cGUgPT09ICd0ZXh0JyAmJiBuZXh0VHdvU3ViVG9rZW5zWzFdLnJhdy5tYXRjaCgvXiAqXCJbXlwiXSokLykgfHxcblx0XHRcdFx0XHQvLyBBbmQgaWYgdGhlIGxpbmsgd2FzIG5vdCBwYXJzZWQgYXMgYSBsaW5rIChlZyBjb21tYW5kIGxpbmspLCBqdXN0IGxvb2sgZm9yIGEgc2luZ2xlIHF1b3RlIGluIHRoaXMgdG9rZW5cblx0XHRcdFx0XHRsYXN0TGluZS5tYXRjaCgvXlteXCJdKiArXCJbXlwiXSokLylcblx0XHRcdFx0KSB7XG5cblx0XHRcdFx0XHRyZXR1cm4gY29tcGxldGVMaW5rVGFyZ2V0QXJnKHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29tcGxldGVMaW5rVGFyZ2V0KHRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxzZSBpZiAobGFzdExpbmUuaW5jbHVkZXMoJ2AnKSkge1xuXHRcdFx0XHRyZXR1cm4gY29tcGxldGVDb2Rlc3Bhbih0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKGxhc3RMaW5lLmluY2x1ZGVzKCcqKicpKSB7XG5cdFx0XHRcdHJldHVybiBjb21wbGV0ZURvdWJsZXN0YXIodG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIGlmIChsYXN0TGluZS5tYXRjaCgvXFwqXFx3LykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlU3Rhcih0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKGxhc3RMaW5lLm1hdGNoKC8oXnxcXHMpX19cXHcvKSkge1xuXHRcdFx0XHRyZXR1cm4gY29tcGxldGVEb3VibGVVbmRlcnNjb3JlKHRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxzZSBpZiAobGFzdExpbmUubWF0Y2goLyhefFxccylfXFx3LykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlVW5kZXJzY29yZSh0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnRhaW5zIHRoZSBzdGFydCBvZiBsaW5rIHRleHQsIGFuZCBubyBmb2xsb3dpbmcgdG9rZW5zIGNvbnRhaW4gdGhlIGxpbmsgdGFyZ2V0XG5cdFx0XHRlbHNlIGlmIChsYXN0TGluZS5tYXRjaCgvKF58XFxzKVxcW1xcdypbXlxcXV0qJC8pKSB7XG5cdFx0XHRcdHJldHVybiBjb21wbGV0ZUxpbmtUZXh0KHRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBoYXNMaW5rVGV4dEFuZFN0YXJ0T2ZMaW5rVGFyZ2V0KHN0cjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdC8vIEFsbG93IGxpbmtzIGFmdGVyIG9wZW5pbmcgcGFyZW50aGVzZXMgYW5kIGVtcGhhc2lzL3N0cmlrZXRocm91Z2ggbWFya2Vycywgc3VjaCBhcyBgKipbdGV4dF0oaHR0YC5cblx0cmV0dXJuICEhc3RyLm1hdGNoKC8oPzpefFtcXHMoKl9+XSlcXFsuKlxcXVxcKFxcdyovKTtcbn1cblxuZnVuY3Rpb24gaGFzU3RhcnRPZkxpbmtUYXJnZXRBbmROb0xpbmtUZXh0KHN0cjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIXN0ci5tYXRjaCgvXlteXFxbXSpcXF1cXChbXlxcKV0qJC8pO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZUJsb2NrcXVvdGVQYXR0ZXJuKGJsb2NrcXVvdGU6IG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZSwgbGlua3M6IG1hcmtlZC5MaW5rcyk6IG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZSB8IHVuZGVmaW5lZCB7XG5cdGxldCBsYXN0SW50ZXJlc3RpbmdJbmRleCA9IGJsb2NrcXVvdGUudG9rZW5zLmxlbmd0aCAtIDE7XG5cdHdoaWxlIChsYXN0SW50ZXJlc3RpbmdJbmRleCA+PSAwICYmIGJsb2NrcXVvdGUudG9rZW5zW2xhc3RJbnRlcmVzdGluZ0luZGV4XS50eXBlID09PSAnc3BhY2UnKSB7XG5cdFx0bGFzdEludGVyZXN0aW5nSW5kZXgtLTtcblx0fVxuXG5cdGNvbnN0IGxhc3RUb2tlbiA9IGJsb2NrcXVvdGUudG9rZW5zW2xhc3RJbnRlcmVzdGluZ0luZGV4XTtcblx0aWYgKGxhc3RUb2tlbj8udHlwZSAhPT0gJ3BhcmFncmFwaCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgY29tcGxldGVkVG9rZW4gPSBjb21wbGV0ZVNpbmdsZUxpbmVQYXR0ZXJuKGxhc3RUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLlBhcmFncmFwaCk7XG5cdGlmICghY29tcGxldGVkVG9rZW4pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgY29tcGxldGlvbiA9IGNvbXBsZXRlZFRva2VuLnJhdy5zbGljZShsYXN0VG9rZW4ucmF3LnRyaW1FbmQoKS5sZW5ndGgpO1xuXHRjb25zdCB0cmFpbGluZ1F1b3RlT25seUxpbmVzID0gYmxvY2txdW90ZS5yYXcubWF0Y2goLyg/OlxcblsgXFx0XSo+WyBcXHRdKig/PVxcbnwkKSkrXFxuPyQvKT8uWzBdID8/ICcnO1xuXHRjb25zdCBpbnNlcnRpb25JbmRleCA9IGJsb2NrcXVvdGUucmF3Lmxlbmd0aCAtIHRyYWlsaW5nUXVvdGVPbmx5TGluZXMubGVuZ3RoO1xuXHRjb25zdCBjb21wbGV0ZWRSYXcgPSBibG9ja3F1b3RlLnJhdy5zbGljZSgwLCBpbnNlcnRpb25JbmRleCkgKyBjb21wbGV0aW9uICsgdHJhaWxpbmdRdW90ZU9ubHlMaW5lcztcblx0Y29uc3QgbGV4ZXIgPSBuZXcgbWFya2VkLkxleGVyKCk7XG5cdGxleGVyLnRva2Vucy5saW5rcyA9IGxpbmtzO1xuXHRjb25zdCBjb21wbGV0ZWRCbG9ja3F1b3RlID0gbGV4ZXIubGV4KGNvbXBsZXRlZFJhdylbMF07XG5cdGlmIChjb21wbGV0ZWRCbG9ja3F1b3RlLnR5cGUgPT09ICdibG9ja3F1b3RlJykge1xuXHRcdHJldHVybiBjb21wbGV0ZWRCbG9ja3F1b3RlIGFzIG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlTGlzdEl0ZW1QYXR0ZXJuKGxpc3Q6IG1hcmtlZC5Ub2tlbnMuTGlzdCk6IG1hcmtlZC5Ub2tlbnMuTGlzdCB8IHVuZGVmaW5lZCB7XG5cdC8vIFBhdGNoIHVwIHRoaXMgb25lIGxpc3QgaXRlbVxuXHRjb25zdCBsYXN0TGlzdEl0ZW0gPSBsaXN0Lml0ZW1zW2xpc3QuaXRlbXMubGVuZ3RoIC0gMV07XG5cdGNvbnN0IGxhc3RMaXN0U3ViVG9rZW4gPSBsYXN0TGlzdEl0ZW0udG9rZW5zID8gbGFzdExpc3RJdGVtLnRva2Vuc1tsYXN0TGlzdEl0ZW0udG9rZW5zLmxlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xuXG5cdC8qXG5cdEV4YW1wbGUgbGlzdCB0b2tlbiBzdHJ1Y3R1cmVzOlxuXG5cdGxpc3Rcblx0XHRsaXN0X2l0ZW1cblx0XHRcdHRleHRcblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRjb2Rlc3BhblxuXHRcdFx0XHRsaW5rXG5cdFx0bGlzdF9pdGVtXG5cdFx0XHR0ZXh0XG5cdFx0XHRjb2RlIC8vIENvbXBsZXRlIGluZGVudGVkIGNvZGVibG9ja1xuXHRcdGxpc3RfaXRlbVxuXHRcdFx0dGV4dFxuXHRcdFx0c3BhY2Vcblx0XHRcdHRleHRcblx0XHRcdFx0dGV4dCAvLyBJbmNvbXBsZXRlIGluZGVudGVkIGNvZGVibG9ja1xuXHRcdGxpc3RfaXRlbVxuXHRcdFx0dGV4dFxuXHRcdFx0bGlzdCAvLyBOZXN0ZWQgbGlzdFxuXHRcdFx0XHRsaXN0X2l0ZW1cblx0XHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0XHR0ZXh0XG5cblx0Q29udHJhc3Qgd2l0aCBwYXJhZ3JhcGg6XG5cdHBhcmFncmFwaFxuXHRcdHRleHRcblx0XHRjb2Rlc3BhblxuXHQqL1xuXG5cdGNvbnN0IGxpc3RFbmRzSW5IZWFkaW5nID0gKGxpc3Q6IG1hcmtlZC5Ub2tlbnMuTGlzdCk6IGJvb2xlYW4gPT4ge1xuXHRcdC8vIEEgbGlzdCBpdGVtIGNhbiBiZSByZW5kZXJlZCBhcyBhIGhlYWRpbmcgZm9yIHNvbWUgcmVhc29uIHdoZW4gaXQgaGFzIGEgc3ViaXRlbSB3aGVyZSB3ZSBoYXZlbid0IHJlbmRlcmVkIHRoZSB0ZXh0IHlldCBsaWtlIHRoaXM6XG5cdFx0Ly8gMS4gbGlzdCBpdGVtXG5cdFx0Ly8gICAgLVxuXHRcdGNvbnN0IGxhc3RJdGVtID0gbGlzdC5pdGVtcy5hdCgtMSk7XG5cdFx0Y29uc3QgbGFzdFRva2VuID0gbGFzdEl0ZW0/LnRva2Vucy5hdCgtMSk7XG5cdFx0cmV0dXJuIGxhc3RUb2tlbj8udHlwZSA9PT0gJ2hlYWRpbmcnIHx8IGxhc3RUb2tlbj8udHlwZSA9PT0gJ2xpc3QnICYmIGxpc3RFbmRzSW5IZWFkaW5nKGxhc3RUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLkxpc3QpO1xuXHR9O1xuXG5cdGxldCBuZXdUb2tlbjogbWFya2VkLlRva2VuIHwgdW5kZWZpbmVkO1xuXHRpZiAobGFzdExpc3RTdWJUb2tlbj8udHlwZSA9PT0gJ3RleHQnICYmICEoJ2luUmF3QmxvY2snIGluIGxhc3RMaXN0SXRlbSkpIHsgLy8gV2h5IGRvZXMgVGFnIGhhdmUgYSB0eXBlIG9mICd0ZXh0J1xuXHRcdG5ld1Rva2VuID0gY29tcGxldGVTaW5nbGVMaW5lUGF0dGVybihsYXN0TGlzdFN1YlRva2VuIGFzIG1hcmtlZC5Ub2tlbnMuVGV4dCk7XG5cdH0gZWxzZSBpZiAobGlzdEVuZHNJbkhlYWRpbmcobGlzdCkpIHtcblx0XHRjb25zdCBuZXdMaXN0ID0gbWFya2VkLmxleGVyKGxpc3QucmF3LnRyaW0oKSArICcgJm5ic3A7JylbMF0gYXMgbWFya2VkLlRva2Vucy5MaXN0O1xuXHRcdGlmIChuZXdMaXN0LnR5cGUgIT09ICdsaXN0Jykge1xuXHRcdFx0Ly8gU29tZXRoaW5nIHdlbnQgd3Jvbmdcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld0xpc3Q7XG5cdH1cblxuXHRpZiAoIW5ld1Rva2VuIHx8IG5ld1Rva2VuLnR5cGUgIT09ICdwYXJhZ3JhcGgnKSB7IC8vICd0ZXh0JyBpdGVtIGluc2lkZSB0aGUgbGlzdCBpdGVtIHR1cm5zIGludG8gcGFyYWdyYXBoXG5cdFx0Ly8gTm90aGluZyB0byBmaXgsIG9yIG5vdCBhIHBhdHRlcm4gd2Ugd2VyZSBleHBlY3Rpbmdcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBwcmV2aW91c0xpc3RJdGVtc1RleHQgPSBtZXJnZVJhd1Rva2VuVGV4dChsaXN0Lml0ZW1zLnNsaWNlKDAsIC0xKSk7XG5cblx0Ly8gR3JhYmJpbmcgdGhlIGAtIGAgb3IgYDEuIGAgb3IgYCogYCBvZmYgdGhlIGxpc3QgaXRlbSBiZWNhdXNlIEkgY2FuJ3QgZmluZCBhIGJldHRlciB3YXkgdG8gZG8gdGhpc1xuXHRjb25zdCBsYXN0TGlzdEl0ZW1MZWFkID0gbGFzdExpc3RJdGVtLnJhdy5tYXRjaCgvXihcXHMqKC18XFxkK1xcLnxcXCopICspLyk/LlswXTtcblx0aWYgKCFsYXN0TGlzdEl0ZW1MZWFkKSB7XG5cdFx0Ly8gSXMgYmFkbHkgZm9ybWF0dGVkXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgbmV3TGlzdEl0ZW1UZXh0ID0gbGFzdExpc3RJdGVtTGVhZCArXG5cdFx0bWVyZ2VSYXdUb2tlblRleHQobGFzdExpc3RJdGVtLnRva2Vucy5zbGljZSgwLCAtMSkpICtcblx0XHRuZXdUb2tlbi5yYXc7XG5cblx0Y29uc3QgbmV3TGlzdCA9IG1hcmtlZC5sZXhlcihwcmV2aW91c0xpc3RJdGVtc1RleHQgKyBuZXdMaXN0SXRlbVRleHQpWzBdIGFzIG1hcmtlZC5Ub2tlbnMuTGlzdDtcblx0aWYgKG5ld0xpc3QudHlwZSAhPT0gJ2xpc3QnKSB7XG5cdFx0Ly8gU29tZXRoaW5nIHdlbnQgd3Jvbmdcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4gbmV3TGlzdDtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVIZWFkaW5nKHRva2VuOiBtYXJrZWQuVG9rZW5zLkhlYWRpbmcsIGZ1bGxSYXdUZXh0OiBzdHJpbmcpOiBtYXJrZWQuVG9rZW5zTGlzdCB8IHZvaWQge1xuXHRpZiAodG9rZW4ucmF3Lm1hdGNoKC8tXFxzKiQvKSkge1xuXHRcdHJldHVybiBtYXJrZWQubGV4ZXIoZnVsbFJhd1RleHQgKyAnICZuYnNwOycpO1xuXHR9XG59XG5cbmNvbnN0IG1heEluY29tcGxldGVUb2tlbnNGaXhSb3VuZHMgPSAzO1xuZXhwb3J0IGZ1bmN0aW9uIGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zOiBtYXJrZWQuVG9rZW5zTGlzdCk6IG1hcmtlZC5Ub2tlbnNMaXN0IHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXhJbmNvbXBsZXRlVG9rZW5zRml4Um91bmRzOyBpKyspIHtcblx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zT25jZSh0b2tlbnMpO1xuXHRcdGlmIChuZXdUb2tlbnMpIHtcblx0XHRcdHRva2VucyA9IG5ld1Rva2Vucztcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRva2Vucztcbn1cblxuZnVuY3Rpb24gZmlsbEluSW5jb21wbGV0ZVRva2Vuc09uY2UodG9rZW5zOiBtYXJrZWQuVG9rZW5zTGlzdCk6IG1hcmtlZC5Ub2tlbnNMaXN0IHwgbnVsbCB7XG5cdGxldCBpOiBudW1iZXI7XG5cdGxldCBuZXdUb2tlbnM6IG1hcmtlZC5Ub2tlbltdIHwgdW5kZWZpbmVkO1xuXHRmb3IgKGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cblx0XHRpZiAodG9rZW4udHlwZSA9PT0gJ3BhcmFncmFwaCcgJiYgdG9rZW4ucmF3Lm1hdGNoKC8oXFxufF4pXFx8LykpIHtcblx0XHRcdG5ld1Rva2VucyA9IGNvbXBsZXRlVGFibGUodG9rZW5zLnNsaWNlKGkpKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8vIEZpbmQgdGhlIGxhc3QgXCJpbnRlcmVzdGluZ1wiIHRva2VuLCBza2lwcGluZyB0cmFpbGluZyBgc3BhY2VgIGFuZCBgaHRtbGBcblx0Ly8gdG9rZW5zLiBDYWxsZXJzIGxpa2UgdGhlIGNoYXQgY29udGVudCByZW5kZXJlciB3cmFwIG1hcmtkb3duIGluXG5cdC8vIGA8Ym9keT4uLi48L2JvZHk+YCAoc28gZG9tcHVyaWZ5IGtlZXBzIGxlYWRpbmcgY29tbWVudHMpLCB3aGljaCBsZWF2ZXNcblx0Ly8gYDwvYm9keT5gIGFzIHRoZSBsaXRlcmFsIGxhc3QgdG9rZW4gXHUyMDE0IHdpdGhvdXQgdGhpcyBza2lwLCB0aGVcblx0Ly8gcGFyYWdyYXBoIC8gbGlzdCBmaXh1cHMgbmV2ZXIgZmlyZSBmb3IgdGhhdCBjb250ZW50LlxuXHRsZXQgbGFzdEludGVyZXN0aW5nSWR4ID0gdG9rZW5zLmxlbmd0aCAtIDE7XG5cdHdoaWxlIChsYXN0SW50ZXJlc3RpbmdJZHggPj0gMCAmJiAodG9rZW5zW2xhc3RJbnRlcmVzdGluZ0lkeF0udHlwZSA9PT0gJ3NwYWNlJyB8fCB0b2tlbnNbbGFzdEludGVyZXN0aW5nSWR4XS50eXBlID09PSAnaHRtbCcpKSB7XG5cdFx0bGFzdEludGVyZXN0aW5nSWR4LS07XG5cdH1cblx0Y29uc3QgbGFzdEludGVyZXN0aW5nVG9rZW4gPSBsYXN0SW50ZXJlc3RpbmdJZHggPj0gMCA/IHRva2Vuc1tsYXN0SW50ZXJlc3RpbmdJZHhdIDogdW5kZWZpbmVkO1xuXHRjb25zdCB0cmFpbGluZ1Rva2VucyA9IHRva2Vucy5zbGljZShsYXN0SW50ZXJlc3RpbmdJZHggKyAxKTtcblxuXHRpZiAoIW5ld1Rva2VucyAmJiBsYXN0SW50ZXJlc3RpbmdUb2tlbj8udHlwZSA9PT0gJ2xpc3QnKSB7XG5cdFx0Y29uc3QgbmV3TGlzdFRva2VuID0gY29tcGxldGVMaXN0SXRlbVBhdHRlcm4obGFzdEludGVyZXN0aW5nVG9rZW4gYXMgbWFya2VkLlRva2Vucy5MaXN0KTtcblx0XHRpZiAobmV3TGlzdFRva2VuKSB7XG5cdFx0XHRuZXdUb2tlbnMgPSBbbmV3TGlzdFRva2VuLCAuLi50cmFpbGluZ1Rva2Vuc107XG5cdFx0XHRpID0gbGFzdEludGVyZXN0aW5nSWR4O1xuXHRcdH1cblx0fVxuXG5cdGlmICghbmV3VG9rZW5zICYmIGxhc3RJbnRlcmVzdGluZ1Rva2VuPy50eXBlID09PSAnYmxvY2txdW90ZScpIHtcblx0XHRjb25zdCBuZXdCbG9ja3F1b3RlVG9rZW4gPSBjb21wbGV0ZUJsb2NrcXVvdGVQYXR0ZXJuKGxhc3RJbnRlcmVzdGluZ1Rva2VuIGFzIG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZSwgdG9rZW5zLmxpbmtzKTtcblx0XHRpZiAobmV3QmxvY2txdW90ZVRva2VuKSB7XG5cdFx0XHRuZXdUb2tlbnMgPSBbbmV3QmxvY2txdW90ZVRva2VuLCAuLi50cmFpbGluZ1Rva2Vuc107XG5cdFx0XHRpID0gbGFzdEludGVyZXN0aW5nSWR4O1xuXHRcdH1cblx0fVxuXG5cdGlmICghbmV3VG9rZW5zICYmIGxhc3RJbnRlcmVzdGluZ1Rva2VuPy50eXBlID09PSAncGFyYWdyYXBoJykge1xuXHRcdC8vIE9ubHkgb3BlcmF0ZXMgb24gYSBzaW5nbGUgdG9rZW4sIGJlY2F1c2UgYW55IG5ld2xpbmUgdGhhdCBmb2xsb3dzIHRoaXMgc2hvdWxkIGJyZWFrIHRoZXNlIHBhdHRlcm5zXG5cdFx0Y29uc3QgbmV3VG9rZW4gPSBjb21wbGV0ZVNpbmdsZUxpbmVQYXR0ZXJuKGxhc3RJbnRlcmVzdGluZ1Rva2VuIGFzIG1hcmtlZC5Ub2tlbnMuUGFyYWdyYXBoKTtcblx0XHRpZiAobmV3VG9rZW4pIHtcblx0XHRcdG5ld1Rva2VucyA9IFtuZXdUb2tlbiwgLi4udHJhaWxpbmdUb2tlbnNdO1xuXHRcdFx0aSA9IGxhc3RJbnRlcmVzdGluZ0lkeDtcblx0XHR9XG5cdH1cblxuXHRpZiAobmV3VG9rZW5zKSB7XG5cdFx0Y29uc3QgbmV3VG9rZW5zTGlzdCA9IFtcblx0XHRcdC4uLnRva2Vucy5zbGljZSgwLCBpKSxcblx0XHRcdC4uLm5ld1Rva2Vuc1xuXHRcdF07XG5cdFx0KG5ld1Rva2Vuc0xpc3QgYXMgbWFya2VkLlRva2Vuc0xpc3QpLmxpbmtzID0gdG9rZW5zLmxpbmtzO1xuXHRcdHJldHVybiBuZXdUb2tlbnNMaXN0IGFzIG1hcmtlZC5Ub2tlbnNMaXN0O1xuXHR9XG5cblx0Y29uc3QgbGFzdFRva2VuID0gdG9rZW5zLmF0KC0xKTtcblx0aWYgKGxhc3RUb2tlbj8udHlwZSA9PT0gJ2hlYWRpbmcnKSB7XG5cdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBjb21wbGV0ZUhlYWRpbmcobGFzdFRva2VuIGFzIG1hcmtlZC5Ub2tlbnMuSGVhZGluZywgbWVyZ2VSYXdUb2tlblRleHQodG9rZW5zKSk7XG5cdFx0aWYgKGNvbXBsZXRlVG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gY29tcGxldGVUb2tlbnM7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cblxuZnVuY3Rpb24gY29tcGxldGVDb2Rlc3Bhbih0b2tlbjogbWFya2VkLlRva2VuKTogbWFya2VkLlRva2VuIHtcblx0cmV0dXJuIGNvbXBsZXRlV2l0aFN0cmluZyh0b2tlbiwgJ2AnKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVTdGFyKHRva2VuczogbWFya2VkLlRva2VuKTogbWFya2VkLlRva2VuIHtcblx0cmV0dXJuIGNvbXBsZXRlV2l0aFN0cmluZyh0b2tlbnMsICcqJyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlVW5kZXJzY29yZSh0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnXycpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZUxpbmtUYXJnZXQodG9rZW5zOiBtYXJrZWQuVG9rZW4pOiBtYXJrZWQuVG9rZW4ge1xuXHRyZXR1cm4gY29tcGxldGVXaXRoU3RyaW5nKHRva2VucywgJyknLCBmYWxzZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlTGlua1RhcmdldEFyZyh0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnXCIpJywgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZUxpbmtUZXh0KHRva2VuczogbWFya2VkLlRva2VuKTogbWFya2VkLlRva2VuIHtcblx0cmV0dXJuIGNvbXBsZXRlV2l0aFN0cmluZyh0b2tlbnMsICddKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknLCBmYWxzZSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlRG91Ymxlc3Rhcih0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnKionKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVEb3VibGVVbmRlcnNjb3JlKHRva2VuczogbWFya2VkLlRva2VuKTogbWFya2VkLlRva2VuIHtcblx0cmV0dXJuIGNvbXBsZXRlV2l0aFN0cmluZyh0b2tlbnMsICdfXycpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zOiBtYXJrZWQuVG9rZW5bXSB8IG1hcmtlZC5Ub2tlbiwgY2xvc2luZ1N0cmluZzogc3RyaW5nLCBzaG91bGRUcmltID0gdHJ1ZSk6IG1hcmtlZC5Ub2tlbiB7XG5cdGNvbnN0IG1lcmdlZFJhd1RleHQgPSBtZXJnZVJhd1Rva2VuVGV4dChBcnJheS5pc0FycmF5KHRva2VucykgPyB0b2tlbnMgOiBbdG9rZW5zXSk7XG5cblx0Ly8gSWYgaXQgd2FzIGNvbXBsZXRlZCBjb3JyZWN0bHksIHRoaXMgc2hvdWxkIGJlIGEgc2luZ2xlIHRva2VuLlxuXHQvLyBFeHBlY3RpbmcgZWl0aGVyIGEgUGFyYWdyYXBoIG9yIGEgTGlzdFxuXHRjb25zdCB0cmltbWVkUmF3VGV4dCA9IHNob3VsZFRyaW0gPyBtZXJnZWRSYXdUZXh0LnRyaW1FbmQoKSA6IG1lcmdlZFJhd1RleHQ7XG5cdHJldHVybiBtYXJrZWQubGV4ZXIodHJpbW1lZFJhd1RleHQgKyBjbG9zaW5nU3RyaW5nKVswXTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVUYWJsZSh0b2tlbnM6IG1hcmtlZC5Ub2tlbltdKTogbWFya2VkLlRva2VuW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXJnZWRSYXdUZXh0ID0gbWVyZ2VSYXdUb2tlblRleHQodG9rZW5zKTtcblx0Y29uc3QgbGluZXMgPSBtZXJnZWRSYXdUZXh0LnNwbGl0KCdcXG4nKTtcblxuXHRsZXQgbnVtQ29sczogbnVtYmVyIHwgdW5kZWZpbmVkOyAvLyBUaGUgbnVtYmVyIG9mIGxpbmUxIGNvbCBoZWFkZXJzXG5cdGxldCBoYXNTZXBhcmF0b3JSb3cgPSBmYWxzZTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXS50cmltKCk7XG5cdFx0aWYgKHR5cGVvZiBudW1Db2xzID09PSAndW5kZWZpbmVkJyAmJiBsaW5lLm1hdGNoKC9eXFxzKlxcfC8pKSB7XG5cdFx0XHRjb25zdCBsaW5lMU1hdGNoZXMgPSBsaW5lLm1hdGNoKC8oXFx8W15cXHxdKykoPz1cXHx8JCkvZyk7XG5cdFx0XHRpZiAobGluZTFNYXRjaGVzKSB7XG5cdFx0XHRcdG51bUNvbHMgPSBsaW5lMU1hdGNoZXMubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodHlwZW9mIG51bUNvbHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAobGluZS5tYXRjaCgvXlxccypcXHwvKSkge1xuXHRcdFx0XHRpZiAoaSAhPT0gbGluZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdC8vIFdlIGdvdCB0aGUgbGluZTEgaGVhZGVyIHJvdywgYW5kIHRoZSBsaW5lMiBzZXBhcmF0b3Igcm93LCBidXQgdGhlcmUgYXJlIG1vcmUgbGluZXMsIGFuZCBpdCB3YXNuJ3QgcGFyc2VkIGFzIGEgdGFibGUhXG5cdFx0XHRcdFx0Ly8gVGhhdCdzIHN0cmFuZ2UgYW5kIG1lYW5zIHRoYXQgdGhlIHRhYmxlIGlzIHByb2JhYmx5IG1hbGZvcm1lZCBpbiB0aGUgc291cmNlLCBzbyBJIHdvbid0IHRyeSB0byBwYXRjaCBpdCB1cC5cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gR290IGEgbGluZTIgc2VwYXJhdG9yIHJvdy0gcGFydGlhbCBvciBjb21wbGV0ZSwgZG9lc24ndCBtYXR0ZXIsIHdlJ2xsIHJlcGxhY2UgaXQgd2l0aCBhIGNvcnJlY3Qgb25lXG5cdFx0XHRcdGhhc1NlcGFyYXRvclJvdyA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGUgbGluZSBhZnRlciB0aGUgaGVhZGVyIHJvdyBpc24ndCBhIHZhbGlkIHNlcGFyYXRvciByb3csIHNvIHRoZSB0YWJsZSBpcyBtYWxmb3JtZWQsIGRvbid0IGZpeCBpdCB1cFxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmICh0eXBlb2YgbnVtQ29scyA9PT0gJ251bWJlcicgJiYgbnVtQ29scyA+IDApIHtcblx0XHRjb25zdCBwcmVmaXhUZXh0ID0gaGFzU2VwYXJhdG9yUm93ID8gbGluZXMuc2xpY2UoMCwgLTEpLmpvaW4oJ1xcbicpIDogbWVyZ2VkUmF3VGV4dDtcblx0XHRjb25zdCBsaW5lMUVuZHNJblBpcGUgPSAhIXByZWZpeFRleHQubWF0Y2goL1xcfFxccyokLyk7XG5cdFx0Y29uc3QgbmV3UmF3VGV4dCA9IHByZWZpeFRleHQgKyAobGluZTFFbmRzSW5QaXBlID8gJycgOiAnfCcpICsgYFxcbnwkeycgLS0tIHwnLnJlcGVhdChudW1Db2xzKX1gO1xuXHRcdHJldHVybiBtYXJrZWQubGV4ZXIobmV3UmF3VGV4dCk7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBbUUsd0JBQXdCLDZCQUE2QjtBQUNqSSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBb0M7QUFDN0MsWUFBWSxZ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QUssS0FBSztBQUM3QztBQUVBLFNBQVMsc0JBQXNCLFFBQW9DO0FBQ2xFLFNBQU8sbUJBQW1CLFFBQVEsTUFBTSxLQUFLO0FBQzlDO0FBRUEsU0FBUyxpQkFBaUIsUUFBb0M7QUFDN0QsU0FBTyxtQkFBbUIsUUFBUSw0QkFBNEIsS0FBSztBQUNwRTtBQUVBLFNBQVMsbUJBQW1CLFFBQW9DO0FBQy9ELFNBQU8sbUJBQW1CLFFBQVEsSUFBSTtBQUN2QztBQUVBLFNBQVMseUJBQXlCLFFBQW9DO0FBQ3JFLFNBQU8sbUJBQW1CLFFBQVEsSUFBSTtBQUN2QztBQUVBLFNBQVMsbUJBQW1CLFFBQXVDLGVBQXVCLGFBQWEsTUFBb0I7QUFDMUgsUUFBTSxnQkFBZ0Isa0JBQWtCLE1BQU0sUUFBUSxNQUFNLElBQUksU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUlqRixRQUFNLGlCQUFpQixhQUFhLGNBQWMsUUFBUSxJQUFJO0FBQzlELFNBQU8sT0FBTyxNQUFNLGlCQUFpQixhQUFhLEVBQUUsQ0FBQztBQUN0RDtBQUVBLFNBQVMsY0FBYyxRQUFvRDtBQUMxRSxRQUFNLGdCQUFnQixrQkFBa0IsTUFBTTtBQUM5QyxRQUFNLFFBQVEsY0FBYyxNQUFNLElBQUk7QUFFdEMsTUFBSTtBQUNKLE1BQUksa0JBQWtCO0FBQ3RCLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUs7QUFDdEMsVUFBTSxPQUFPLE1BQU0sQ0FBQyxFQUFFLEtBQUs7QUFDM0IsUUFBSSxPQUFPLFlBQVksZUFBZSxLQUFLLE1BQU0sUUFBUSxHQUFHO0FBQzNELFlBQU0sZUFBZSxLQUFLLE1BQU0scUJBQXFCO0FBQ3JELFVBQUksY0FBYztBQUNqQixrQkFBVSxhQUFhO0FBQUEsTUFDeEI7QUFBQSxJQUNELFdBQVcsT0FBTyxZQUFZLFVBQVU7QUFDdkMsVUFBSSxLQUFLLE1BQU0sUUFBUSxHQUFHO0FBQ3pCLFlBQUksTUFBTSxNQUFNLFNBQVMsR0FBRztBQUczQixpQkFBTztBQUFBLFFBQ1I7QUFHQSwwQkFBa0I7QUFBQSxNQUNuQixPQUFPO0FBRU4sZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLE1BQUksT0FBTyxZQUFZLFlBQVksVUFBVSxHQUFHO0FBQy9DLFVBQU0sYUFBYSxrQkFBa0IsTUFBTSxNQUFNLEdBQUcsRUFBRSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQ3JFLFVBQU0sa0JBQWtCLENBQUMsQ0FBQyxXQUFXLE1BQU0sUUFBUTtBQUNuRCxVQUFNLGFBQWEsY0FBYyxrQkFBa0IsS0FBSyxPQUFPO0FBQUEsR0FBTSxTQUFTLE9BQU8sT0FBTyxDQUFDO0FBQzdGLFdBQU8sT0FBTyxNQUFNLFVBQVU7QUFBQSxFQUMvQjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsibWFya2VkIiwgImxpc3QiLCAibmV3TGlzdCJdCn0K
