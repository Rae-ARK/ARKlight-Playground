import { htmlAttributeEncodeValue } from "../../../../base/common/strings.js";
const mathInlineRegExp = /(?<![a-zA-Z0-9])(?<dollars>\${1,2})(?!\.|\(["'])((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\k<dollars>(?![a-zA-Z0-9])/;
const katexContainerClassName = "vscode-katex-container";
const katexContainerLatexAttributeName = "data-latex";
const inlineRule = new RegExp("^" + mathInlineRegExp.source);
var MarkedKatexExtension;
((MarkedKatexExtension2) => {
  const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;
  function extension(katex, options = {}) {
    return {
      extensions: [
        inlineKatex(options, createRenderer(katex, options, false)),
        blockKatex(options, createRenderer(katex, options, true))
      ]
    };
  }
  MarkedKatexExtension2.extension = extension;
  function createRenderer(katex, options, isBlock) {
    return (token) => {
      let out;
      try {
        const html = katex.renderToString(token.text, {
          ...options,
          throwOnError: true,
          displayMode: token.displayMode
        });
        out = `<span class="${katexContainerClassName}" ${katexContainerLatexAttributeName}="${htmlAttributeEncodeValue(token.text)}">${html}</span>`;
      } catch {
        out = token.raw;
      }
      return out + (isBlock ? "\n" : "");
    };
  }
  function inlineKatex(options, renderer) {
    const ruleReg = inlineRule;
    return {
      name: "inlineKatex",
      level: "inline",
      start(src) {
        let index;
        let indexSrc = src;
        while (indexSrc) {
          index = indexSrc.indexOf("$");
          if (index === -1) {
            return;
          }
          const possibleKatex = indexSrc.substring(index);
          if (possibleKatex.match(ruleReg)) {
            return index;
          }
          indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, "");
        }
        return;
      },
      tokenizer(src, tokens) {
        const match = src.match(ruleReg);
        if (match) {
          return {
            type: "inlineKatex",
            raw: match[0],
            text: match[2].trim(),
            displayMode: match[1].length === 2
          };
        }
        return;
      },
      renderer
    };
  }
  function blockKatex(options, renderer) {
    return {
      name: "blockKatex",
      level: "block",
      start(src) {
        return src.match(new RegExp(blockRule.source, "m"))?.index;
      },
      tokenizer(src, tokens) {
        const match = src.match(blockRule);
        if (match) {
          return {
            type: "blockKatex",
            raw: match[0],
            text: match[2].trim(),
            displayMode: match[1].length === 2
          };
        }
        return;
      },
      renderer
    };
  }
})(MarkedKatexExtension || (MarkedKatexExtension = {}));
export {
  MarkedKatexExtension,
  katexContainerClassName,
  katexContainerLatexAttributeName,
  mathInlineRegExp
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL2NvbW1vbi9tYXJrZWRLYXRleEV4dGVuc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgdHlwZSAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IGh0bWxBdHRyaWJ1dGVFbmNvZGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuXG5leHBvcnQgY29uc3QgbWF0aElubGluZVJlZ0V4cCA9IC8oPzwhW2EtekEtWjAtOV0pKD88ZG9sbGFycz5cXCR7MSwyfSkoPyFcXC58XFwoW1wiJ10pKCg/OlxcXFwufFteXFxcXFxcbl0pKj8oPzpcXFxcLnxbXlxcXFxcXG5cXCRdKSlcXGs8ZG9sbGFycz4oPyFbYS16QS1aMC05XSkvOyAvLyBOb24tc3RhbmRhcmQsIGJ1dCBlbnN1cmUgb3BlbmluZyAkIGlzIG5vdCBwcmVjZWRlZCBhbmQgY2xvc2luZyAkIGlzIG5vdCBmb2xsb3dlZCBieSB3b3JkL251bWJlciBjaGFyYWN0ZXJzLCBvcGVuaW5nICQgbm90IGZvbGxvd2VkIGJ5IC4sIChcIiwgKCdcbmV4cG9ydCBjb25zdCBrYXRleENvbnRhaW5lckNsYXNzTmFtZSA9ICd2c2NvZGUta2F0ZXgtY29udGFpbmVyJztcbmV4cG9ydCBjb25zdCBrYXRleENvbnRhaW5lckxhdGV4QXR0cmlidXRlTmFtZSA9ICdkYXRhLWxhdGV4JztcblxuY29uc3QgaW5saW5lUnVsZSA9IG5ldyBSZWdFeHAoJ14nICsgbWF0aElubGluZVJlZ0V4cC5zb3VyY2UpO1xuXG5leHBvcnQgbmFtZXNwYWNlIE1hcmtlZEthdGV4RXh0ZW5zaW9uIHtcblx0dHlwZSBLYXRleE9wdGlvbnMgPSBpbXBvcnQoJ2thdGV4JykuS2F0ZXhPcHRpb25zO1xuXG5cdC8vIEZyb20gaHR0cHM6Ly9naXRodWIuY29tL1V6aVRlY2gvbWFya2VkLWthdGV4LWV4dGVuc2lvbi9ibG9iL21haW4vc3JjL2luZGV4LmpzXG5cdC8vIEZyb20gaHR0cHM6Ly9naXRodWIuY29tL1V6aVRlY2gvbWFya2VkLWthdGV4LWV4dGVuc2lvbi9ibG9iL21haW4vc3JjL2luZGV4LmpzXG5cdGV4cG9ydCBpbnRlcmZhY2UgTWFya2VkS2F0ZXhPcHRpb25zIGV4dGVuZHMgS2F0ZXhPcHRpb25zIHsgfVxuXG5cdGNvbnN0IGJsb2NrUnVsZSA9IC9eKFxcJHsxLDJ9KVxcbigoPzpcXFxcW15dfFteXFxcXF0pKz8pXFxuXFwxKD86XFxufCQpLztcblxuXHRleHBvcnQgZnVuY3Rpb24gZXh0ZW5zaW9uKGthdGV4OiB0eXBlb2YgaW1wb3J0KCdrYXRleCcpLmRlZmF1bHQsIG9wdGlvbnM6IE1hcmtlZEthdGV4T3B0aW9ucyA9IHt9KTogbWFya2VkLk1hcmtlZEV4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dGVuc2lvbnM6IFtcblx0XHRcdFx0aW5saW5lS2F0ZXgob3B0aW9ucywgY3JlYXRlUmVuZGVyZXIoa2F0ZXgsIG9wdGlvbnMsIGZhbHNlKSksXG5cdFx0XHRcdGJsb2NrS2F0ZXgob3B0aW9ucywgY3JlYXRlUmVuZGVyZXIoa2F0ZXgsIG9wdGlvbnMsIHRydWUpKSxcblx0XHRcdF0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlbmRlcmVyKGthdGV4OiB0eXBlb2YgaW1wb3J0KCdrYXRleCcpLmRlZmF1bHQsIG9wdGlvbnM6IE1hcmtlZEthdGV4T3B0aW9ucywgaXNCbG9jazogYm9vbGVhbik6IG1hcmtlZC5SZW5kZXJlckV4dGVuc2lvbkZ1bmN0aW9uIHtcblx0XHRyZXR1cm4gKHRva2VuOiBtYXJrZWQuVG9rZW5zLkdlbmVyaWMpID0+IHtcblx0XHRcdGxldCBvdXQ6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGh0bWwgPSBrYXRleC5yZW5kZXJUb1N0cmluZyh0b2tlbi50ZXh0LCB7XG5cdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHR0aHJvd09uRXJyb3I6IHRydWUsXG5cdFx0XHRcdFx0ZGlzcGxheU1vZGU6IHRva2VuLmRpc3BsYXlNb2RlLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBXcmFwIGluIGEgY29udGFpbmVyIHdpdGggYXR0cmlidXRlIGFzIGEgZmFsbGJhY2sgZm9yIGV4dHJhY3RpbmcgdGhlIG9yaWdpbmFsIExhVGVYIHNvdXJjZVxuXHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgd2UgY2FuIGFsd2F5cyByZXRyaWV2ZSB0aGUgc291cmNlIGV2ZW4gaWYgdGhlIGFubm90YXRpb24gZWxlbWVudCBpcyBub3QgcHJlc2VudFxuXHRcdFx0XHRvdXQgPSBgPHNwYW4gY2xhc3M9XCIke2thdGV4Q29udGFpbmVyQ2xhc3NOYW1lfVwiICR7a2F0ZXhDb250YWluZXJMYXRleEF0dHJpYnV0ZU5hbWV9PVwiJHtodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUodG9rZW4udGV4dCl9XCI+JHtodG1sfTwvc3Bhbj5gO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIE9uIGZhaWx1cmUsIGp1c3QgdXNlIHRoZSBvcmlnaW5hbCB0ZXh0IGluY2x1ZGluZyB0aGUgd3JhcHBpbmcgJCBvciAkJFxuXHRcdFx0XHRvdXQgPSB0b2tlbi5yYXc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3V0ICsgKGlzQmxvY2sgPyAnXFxuJyA6ICcnKTtcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gaW5saW5lS2F0ZXgob3B0aW9uczogTWFya2VkS2F0ZXhPcHRpb25zLCByZW5kZXJlcjogbWFya2VkLlJlbmRlcmVyRXh0ZW5zaW9uRnVuY3Rpb24pOiBtYXJrZWQuVG9rZW5pemVyQW5kUmVuZGVyZXJFeHRlbnNpb24ge1xuXHRcdGNvbnN0IHJ1bGVSZWcgPSBpbmxpbmVSdWxlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiAnaW5saW5lS2F0ZXgnLFxuXHRcdFx0bGV2ZWw6ICdpbmxpbmUnLFxuXHRcdFx0c3RhcnQoc3JjOiBzdHJpbmcpIHtcblx0XHRcdFx0bGV0IGluZGV4O1xuXHRcdFx0XHRsZXQgaW5kZXhTcmMgPSBzcmM7XG5cblx0XHRcdFx0d2hpbGUgKGluZGV4U3JjKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBpbmRleFNyYy5pbmRleE9mKCckJyk7XG5cdFx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHBvc3NpYmxlS2F0ZXggPSBpbmRleFNyYy5zdWJzdHJpbmcoaW5kZXgpO1xuXHRcdFx0XHRcdGlmIChwb3NzaWJsZUthdGV4Lm1hdGNoKHJ1bGVSZWcpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aW5kZXhTcmMgPSBpbmRleFNyYy5zdWJzdHJpbmcoaW5kZXggKyAxKS5yZXBsYWNlKC9eXFwkKy8sICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9LFxuXHRcdFx0dG9rZW5pemVyKHNyYzogc3RyaW5nLCB0b2tlbnM6IG1hcmtlZC5Ub2tlbltdKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gc3JjLm1hdGNoKHJ1bGVSZWcpO1xuXHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2lubGluZUthdGV4Jyxcblx0XHRcdFx0XHRcdHJhdzogbWF0Y2hbMF0sXG5cdFx0XHRcdFx0XHR0ZXh0OiBtYXRjaFsyXS50cmltKCksXG5cdFx0XHRcdFx0XHRkaXNwbGF5TW9kZTogbWF0Y2hbMV0ubGVuZ3RoID09PSAyLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBibG9ja0thdGV4KG9wdGlvbnM6IE1hcmtlZEthdGV4T3B0aW9ucywgcmVuZGVyZXI6IG1hcmtlZC5SZW5kZXJlckV4dGVuc2lvbkZ1bmN0aW9uKTogbWFya2VkLlRva2VuaXplckFuZFJlbmRlcmVyRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ2Jsb2NrS2F0ZXgnLFxuXHRcdFx0bGV2ZWw6ICdibG9jaycsXG5cdFx0XHRzdGFydChzcmM6IHN0cmluZykge1xuXHRcdFx0XHRyZXR1cm4gc3JjLm1hdGNoKG5ldyBSZWdFeHAoYmxvY2tSdWxlLnNvdXJjZSwgJ20nKSk/LmluZGV4O1xuXHRcdFx0fSxcblx0XHRcdHRva2VuaXplcihzcmM6IHN0cmluZywgdG9rZW5zOiBtYXJrZWQuVG9rZW5bXSkge1xuXHRcdFx0XHRjb25zdCBtYXRjaCA9IHNyYy5tYXRjaChibG9ja1J1bGUpO1xuXHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jsb2NrS2F0ZXgnLFxuXHRcdFx0XHRcdFx0cmF3OiBtYXRjaFswXSxcblx0XHRcdFx0XHRcdHRleHQ6IG1hdGNoWzJdLnRyaW0oKSxcblx0XHRcdFx0XHRcdGRpc3BsYXlNb2RlOiBtYXRjaFsxXS5sZW5ndGggPT09IDIsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQ0FBZ0M7QUFFbEMsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSwwQkFBMEI7QUFDaEMsTUFBTSxtQ0FBbUM7QUFFaEQsTUFBTSxhQUFhLElBQUksT0FBTyxNQUFNLGlCQUFpQixNQUFNO0FBRXBELElBQVU7QUFBQSxDQUFWLENBQVVBLDBCQUFWO0FBT04sUUFBTSxZQUFZO0FBRVgsV0FBUyxVQUFVLE9BQXVDLFVBQThCLENBQUMsR0FBMkI7QUFDMUgsV0FBTztBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsWUFBWSxTQUFTLGVBQWUsT0FBTyxTQUFTLEtBQUssQ0FBQztBQUFBLFFBQzFELFdBQVcsU0FBUyxlQUFlLE9BQU8sU0FBUyxJQUFJLENBQUM7QUFBQSxNQUN6RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBUE8sRUFBQUEsc0JBQVM7QUFTaEIsV0FBUyxlQUFlLE9BQXVDLFNBQTZCLFNBQW9EO0FBQy9JLFdBQU8sQ0FBQyxVQUFpQztBQUN4QyxVQUFJO0FBQ0osVUFBSTtBQUNILGNBQU0sT0FBTyxNQUFNLGVBQWUsTUFBTSxNQUFNO0FBQUEsVUFDN0MsR0FBRztBQUFBLFVBQ0gsY0FBYztBQUFBLFVBQ2QsYUFBYSxNQUFNO0FBQUEsUUFDcEIsQ0FBQztBQUlELGNBQU0sZ0JBQWdCLHVCQUF1QixLQUFLLGdDQUFnQyxLQUFLLHlCQUF5QixNQUFNLElBQUksQ0FBQyxLQUFLLElBQUk7QUFBQSxNQUNySSxRQUFRO0FBRVAsY0FBTSxNQUFNO0FBQUEsTUFDYjtBQUNBLGFBQU8sT0FBTyxVQUFVLE9BQU87QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFFQSxXQUFTLFlBQVksU0FBNkIsVUFBa0Y7QUFDbkksVUFBTSxVQUFVO0FBQ2hCLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxNQUNQLE1BQU0sS0FBYTtBQUNsQixZQUFJO0FBQ0osWUFBSSxXQUFXO0FBRWYsZUFBTyxVQUFVO0FBQ2hCLGtCQUFRLFNBQVMsUUFBUSxHQUFHO0FBQzVCLGNBQUksVUFBVSxJQUFJO0FBQ2pCO0FBQUEsVUFDRDtBQUVBLGdCQUFNLGdCQUFnQixTQUFTLFVBQVUsS0FBSztBQUM5QyxjQUFJLGNBQWMsTUFBTSxPQUFPLEdBQUc7QUFDakMsbUJBQU87QUFBQSxVQUNSO0FBRUEscUJBQVcsU0FBUyxVQUFVLFFBQVEsQ0FBQyxFQUFFLFFBQVEsUUFBUSxFQUFFO0FBQUEsUUFDNUQ7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFVBQVUsS0FBYSxRQUF3QjtBQUM5QyxjQUFNLFFBQVEsSUFBSSxNQUFNLE9BQU87QUFDL0IsWUFBSSxPQUFPO0FBQ1YsaUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLEtBQUssTUFBTSxDQUFDO0FBQUEsWUFDWixNQUFNLE1BQU0sQ0FBQyxFQUFFLEtBQUs7QUFBQSxZQUNwQixhQUFhLE1BQU0sQ0FBQyxFQUFFLFdBQVc7QUFBQSxVQUNsQztBQUFBLFFBQ0Q7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxXQUFTLFdBQVcsU0FBNkIsVUFBa0Y7QUFDbEksV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsTUFBTSxLQUFhO0FBQ2xCLGVBQU8sSUFBSSxNQUFNLElBQUksT0FBTyxVQUFVLFFBQVEsR0FBRyxDQUFDLEdBQUc7QUFBQSxNQUN0RDtBQUFBLE1BQ0EsVUFBVSxLQUFhLFFBQXdCO0FBQzlDLGNBQU0sUUFBUSxJQUFJLE1BQU0sU0FBUztBQUNqQyxZQUFJLE9BQU87QUFDVixpQkFBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sS0FBSyxNQUFNLENBQUM7QUFBQSxZQUNaLE1BQU0sTUFBTSxDQUFDLEVBQUUsS0FBSztBQUFBLFlBQ3BCLGFBQWEsTUFBTSxDQUFDLEVBQUUsV0FBVztBQUFBLFVBQ2xDO0FBQUEsUUFDRDtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEdBcEdnQjsiLAogICJuYW1lcyI6IFsiTWFya2VkS2F0ZXhFeHRlbnNpb24iXQp9Cg==
