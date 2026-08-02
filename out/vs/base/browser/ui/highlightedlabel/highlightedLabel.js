import * as dom from "../../dom.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../iconLabel/iconLabels.js";
import { Disposable } from "../../../common/lifecycle.js";
import * as objects from "../../../common/objects.js";
class HighlightedLabel extends Disposable {
  /**
   * Create a new {@link HighlightedLabel}.
   *
   * @param container The parent container to append to.
   */
  constructor(container, options) {
    super();
    this.options = options;
    this.text = "";
    this.title = "";
    this.highlights = [];
    this.didEverRender = false;
    this.domNode = dom.append(container, dom.$("span.monaco-highlighted-label"));
  }
  /**
   * The label's DOM node.
   */
  get element() {
    return this.domNode;
  }
  /**
   * Set the label and highlights.
   *
   * @param text The label to display.
   * @param highlights The ranges to highlight.
   * @param title An optional title for the hover tooltip.
   * @param escapeNewLines Whether to escape new lines.
   * @returns
   */
  set(text, highlights = [], title = "", escapeNewLines, supportIcons) {
    if (!text) {
      text = "";
    }
    if (escapeNewLines) {
      text = HighlightedLabel.escapeNewLines(text, highlights);
    }
    if (this.didEverRender && this.text === text && this.title === title && objects.equals(this.highlights, highlights)) {
      return;
    }
    this.text = text;
    this.title = title;
    this.highlights = highlights;
    this.render(supportIcons);
  }
  render(supportIcons) {
    const children = [];
    let pos = 0;
    for (const highlight of this.highlights) {
      if (highlight.end === highlight.start) {
        continue;
      }
      if (pos < highlight.start) {
        const substring2 = this.text.substring(pos, highlight.start);
        if (supportIcons) {
          children.push(...renderLabelWithIcons(substring2, true));
        } else {
          children.push(substring2);
        }
        pos = highlight.start;
      }
      const substring = this.text.substring(pos, highlight.end);
      const element = dom.$("span.highlight", void 0, ...supportIcons ? renderLabelWithIcons(substring, true) : [substring]);
      if (highlight.extraClasses) {
        element.classList.add(...highlight.extraClasses);
      }
      children.push(element);
      pos = highlight.end;
    }
    if (pos < this.text.length) {
      const substring = this.text.substring(pos);
      if (supportIcons) {
        children.push(...renderLabelWithIcons(substring, true));
      } else {
        children.push(substring);
      }
    }
    dom.reset(this.domNode, ...children);
    if (!this.customHover && this.title !== "") {
      const hoverDelegate = this.options?.hoverDelegate ?? getDefaultHoverDelegate("mouse");
      this.customHover = this._register(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.domNode, this.title));
    } else if (this.customHover) {
      this.customHover.update(this.title);
    }
    this.didEverRender = true;
  }
  static escapeNewLines(text, highlights) {
    let total = 0;
    let extra = 0;
    return text.replace(/\r\n|\r|\n/g, (match, offset) => {
      extra = match === "\r\n" ? -1 : 0;
      offset += total;
      for (const highlight of highlights) {
        if (highlight.end <= offset) {
          continue;
        }
        if (highlight.start >= offset) {
          highlight.start += extra;
        }
        if (highlight.end >= offset) {
          highlight.end += extra;
        }
      }
      total += extra;
      return "\u23CE";
    });
  }
}
export {
  HighlightedLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL29iamVjdHMuanMnO1xuXG4vKipcbiAqIEEgcmFuZ2UgdG8gYmUgaGlnaGxpZ2h0ZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUhpZ2hsaWdodCB7XG5cdHN0YXJ0OiBudW1iZXI7XG5cdGVuZDogbnVtYmVyO1xuXHRyZWFkb25seSBleHRyYUNsYXNzZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSGlnaGxpZ2h0ZWRMYWJlbE9wdGlvbnMge1xuXHRyZWFkb25seSBob3ZlckRlbGVnYXRlPzogSUhvdmVyRGVsZWdhdGU7XG59XG5cbi8qKlxuICogQSB3aWRnZXQgd2hpY2ggY2FuIHJlbmRlciBhIGxhYmVsIHdpdGggc3Vic3RyaW5nIGhpZ2hsaWdodHMsIG9mdGVuXG4gKiBvcmlnaW5hdGluZyBmcm9tIGEgZmlsdGVyIGZ1bmN0aW9uIGxpa2UgdGhlIGZ1enp5IG1hdGNoZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBIaWdobGlnaHRlZExhYmVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0ZXh0OiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSB0aXRsZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgaGlnaGxpZ2h0czogcmVhZG9ubHkgSUhpZ2hsaWdodFtdID0gW107XG5cdHByaXZhdGUgZGlkRXZlclJlbmRlcjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGN1c3RvbUhvdmVyOiBJTWFuYWdlZEhvdmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcge0BsaW5rIEhpZ2hsaWdodGVkTGFiZWx9LlxuXHQgKlxuXHQgKiBAcGFyYW0gY29udGFpbmVyIFRoZSBwYXJlbnQgY29udGFpbmVyIHRvIGFwcGVuZCB0by5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9ucz86IElIaWdobGlnaHRlZExhYmVsT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ubW9uYWNvLWhpZ2hsaWdodGVkLWxhYmVsJykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBsYWJlbCdzIERPTSBub2RlLlxuXHQgKi9cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBsYWJlbCBhbmQgaGlnaGxpZ2h0cy5cblx0ICpcblx0ICogQHBhcmFtIHRleHQgVGhlIGxhYmVsIHRvIGRpc3BsYXkuXG5cdCAqIEBwYXJhbSBoaWdobGlnaHRzIFRoZSByYW5nZXMgdG8gaGlnaGxpZ2h0LlxuXHQgKiBAcGFyYW0gdGl0bGUgQW4gb3B0aW9uYWwgdGl0bGUgZm9yIHRoZSBob3ZlciB0b29sdGlwLlxuXHQgKiBAcGFyYW0gZXNjYXBlTmV3TGluZXMgV2hldGhlciB0byBlc2NhcGUgbmV3IGxpbmVzLlxuXHQgKiBAcmV0dXJuc1xuXHQgKi9cblx0c2V0KHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaGlnaGxpZ2h0czogcmVhZG9ubHkgSUhpZ2hsaWdodFtdID0gW10sIHRpdGxlOiBzdHJpbmcgPSAnJywgZXNjYXBlTmV3TGluZXM/OiBib29sZWFuLCBzdXBwb3J0SWNvbnM/OiBib29sZWFuKSB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0ZXh0ID0gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKGVzY2FwZU5ld0xpbmVzKSB7XG5cdFx0XHQvLyBhZGp1c3RzIGhpZ2hsaWdodHMgaW5wbGFjZVxuXHRcdFx0dGV4dCA9IEhpZ2hsaWdodGVkTGFiZWwuZXNjYXBlTmV3TGluZXModGV4dCwgaGlnaGxpZ2h0cyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGlkRXZlclJlbmRlciAmJiB0aGlzLnRleHQgPT09IHRleHQgJiYgdGhpcy50aXRsZSA9PT0gdGl0bGUgJiYgb2JqZWN0cy5lcXVhbHModGhpcy5oaWdobGlnaHRzLCBoaWdobGlnaHRzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGV4dCA9IHRleHQ7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMuaGlnaGxpZ2h0cyA9IGhpZ2hsaWdodHM7XG5cdFx0dGhpcy5yZW5kZXIoc3VwcG9ydEljb25zKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKHN1cHBvcnRJY29ucz86IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNoaWxkcmVuOiBBcnJheTxIVE1MU3BhbkVsZW1lbnQgfCBzdHJpbmc+ID0gW107XG5cdFx0bGV0IHBvcyA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGhpZ2hsaWdodCBvZiB0aGlzLmhpZ2hsaWdodHMpIHtcblx0XHRcdGlmIChoaWdobGlnaHQuZW5kID09PSBoaWdobGlnaHQuc3RhcnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwb3MgPCBoaWdobGlnaHQuc3RhcnQpIHtcblx0XHRcdFx0Y29uc3Qgc3Vic3RyaW5nID0gdGhpcy50ZXh0LnN1YnN0cmluZyhwb3MsIGhpZ2hsaWdodC5zdGFydCk7XG5cdFx0XHRcdGlmIChzdXBwb3J0SWNvbnMpIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKHN1YnN0cmluZywgdHJ1ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goc3Vic3RyaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwb3MgPSBoaWdobGlnaHQuc3RhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN1YnN0cmluZyA9IHRoaXMudGV4dC5zdWJzdHJpbmcocG9zLCBoaWdobGlnaHQuZW5kKTtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uJCgnc3Bhbi5oaWdobGlnaHQnLCB1bmRlZmluZWQsIC4uLnN1cHBvcnRJY29ucyA/IHJlbmRlckxhYmVsV2l0aEljb25zKHN1YnN0cmluZywgdHJ1ZSkgOiBbc3Vic3RyaW5nXSk7XG5cblx0XHRcdGlmIChoaWdobGlnaHQuZXh0cmFDbGFzc2VzKSB7XG5cdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5oaWdobGlnaHQuZXh0cmFDbGFzc2VzKTtcblx0XHRcdH1cblxuXHRcdFx0Y2hpbGRyZW4ucHVzaChlbGVtZW50KTtcblx0XHRcdHBvcyA9IGhpZ2hsaWdodC5lbmQ7XG5cdFx0fVxuXG5cdFx0aWYgKHBvcyA8IHRoaXMudGV4dC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHN1YnN0cmluZyA9IHRoaXMudGV4dC5zdWJzdHJpbmcocG9zLCk7XG5cdFx0XHRpZiAoc3VwcG9ydEljb25zKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoc3Vic3RyaW5nLCB0cnVlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHN1YnN0cmluZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZG9tLnJlc2V0KHRoaXMuZG9tTm9kZSwgLi4uY2hpbGRyZW4pO1xuXG5cdFx0aWYgKCF0aGlzLmN1c3RvbUhvdmVyICYmIHRoaXMudGl0bGUgIT09ICcnKSB7XG5cdFx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5vcHRpb25zPy5ob3ZlckRlbGVnYXRlID8/IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHRcdFx0dGhpcy5jdXN0b21Ib3ZlciA9IHRoaXMuX3JlZ2lzdGVyKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCB0aGlzLmRvbU5vZGUsIHRoaXMudGl0bGUpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY3VzdG9tSG92ZXIpIHtcblx0XHRcdHRoaXMuY3VzdG9tSG92ZXIudXBkYXRlKHRoaXMudGl0bGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlkRXZlclJlbmRlciA9IHRydWU7XG5cdH1cblxuXHRzdGF0aWMgZXNjYXBlTmV3TGluZXModGV4dDogc3RyaW5nLCBoaWdobGlnaHRzOiByZWFkb25seSBJSGlnaGxpZ2h0W10pOiBzdHJpbmcge1xuXHRcdGxldCB0b3RhbCA9IDA7XG5cdFx0bGV0IGV4dHJhID0gMDtcblxuXHRcdHJldHVybiB0ZXh0LnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIChtYXRjaCwgb2Zmc2V0KSA9PiB7XG5cdFx0XHRleHRyYSA9IG1hdGNoID09PSAnXFxyXFxuJyA/IC0xIDogMDtcblx0XHRcdG9mZnNldCArPSB0b3RhbDtcblxuXHRcdFx0Zm9yIChjb25zdCBoaWdobGlnaHQgb2YgaGlnaGxpZ2h0cykge1xuXHRcdFx0XHRpZiAoaGlnaGxpZ2h0LmVuZCA8PSBvZmZzZXQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGlnaGxpZ2h0LnN0YXJ0ID49IG9mZnNldCkge1xuXHRcdFx0XHRcdGhpZ2hsaWdodC5zdGFydCArPSBleHRyYTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGlnaGxpZ2h0LmVuZCA+PSBvZmZzZXQpIHtcblx0XHRcdFx0XHRoaWdobGlnaHQuZW5kICs9IGV4dHJhO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRvdGFsICs9IGV4dHJhO1xuXHRcdFx0cmV0dXJuICdcXHUyM0NFJztcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBR3JCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBQ3hD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
