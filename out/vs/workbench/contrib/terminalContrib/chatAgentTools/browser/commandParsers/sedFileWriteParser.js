class SedFileWriteParser {
  constructor() {
    this.commandName = "sed";
  }
  canHandle(commandText) {
    if (!commandText.match(/^sed\s+/)) {
      return false;
    }
    const inPlaceRegex = /(?:^|\s)(-[a-zA-Z]*[iI][a-zA-Z]*\S*|--in-place(?:=\S*)?|(-i|-I)\s*'[^']*'|(-i|-I)\s*"[^"]*")(?:\s|$)/;
    return inPlaceRegex.test(commandText);
  }
  extractFileWrites(commandText) {
    const tokens = this._tokenizeCommand(commandText);
    return this._extractFileTargets(tokens);
  }
  /**
   * Tokenizes a command into individual arguments, handling quotes and escapes.
   */
  _tokenizeCommand(commandText) {
    const tokens = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    for (let i = 0; i < commandText.length; i++) {
      const char = commandText[i];
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\" && !inSingleQuote) {
        escaped = true;
        current += char;
        continue;
      }
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }
      if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }
    if (current) {
      tokens.push(current);
    }
    return tokens;
  }
  /**
   * Extracts file targets from tokenized sed command arguments.
   * Files are generally the last non-option, non-script arguments.
   */
  _extractFileTargets(tokens) {
    if (tokens.length === 0 || tokens[0] !== "sed") {
      return [];
    }
    const files = [];
    let i = 1;
    let foundScript = false;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.startsWith("--")) {
        if (token === "--in-place" || token.startsWith("--in-place=")) {
          i++;
          continue;
        }
        if (token === "--expression" || token === "--file") {
          i += 2;
          foundScript = true;
          continue;
        }
        if (token.startsWith("--expression=") || token.startsWith("--file=")) {
          i++;
          foundScript = true;
          continue;
        }
        i++;
        continue;
      }
      if (token.startsWith("-") && token.length > 1 && token[1] !== "-") {
        const flags = token.slice(1);
        const iIndex = flags.indexOf("i");
        const IIndex = flags.indexOf("I");
        const inPlaceIndex = iIndex >= 0 ? iIndex : IIndex;
        if (inPlaceIndex >= 0 && inPlaceIndex < flags.length - 1) {
          i++;
          continue;
        }
        if ((flags.endsWith("i") || flags.endsWith("I")) && i + 1 < tokens.length) {
          const nextToken = tokens[i + 1];
          if (nextToken === "''" || nextToken === '""') {
            i += 2;
            continue;
          }
          if (nextToken.startsWith("'") && nextToken.endsWith("'") || nextToken.startsWith('"') && nextToken.endsWith('"')) {
            const unquoted = nextToken.slice(1, -1);
            if (unquoted.startsWith(".") && unquoted.length <= 10 && !unquoted.includes("/")) {
              i += 2;
              continue;
            }
          }
        }
        if (flags.includes("e") || flags.includes("f")) {
          const eIndex = flags.indexOf("e");
          const fIndex = flags.indexOf("f");
          const optIndex = eIndex >= 0 ? eIndex : fIndex;
          if (optIndex < flags.length - 1) {
            foundScript = true;
            i++;
            continue;
          }
          foundScript = true;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (!foundScript) {
        foundScript = true;
        i++;
        continue;
      }
      let file = token;
      if (file.startsWith("'") && file.endsWith("'") || file.startsWith('"') && file.endsWith('"')) {
        file = file.slice(1, -1);
      }
      files.push(file);
      i++;
    }
    return files;
  }
}
export {
  SedFileWriteParser
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL2NvbW1hbmRQYXJzZXJzL3NlZEZpbGVXcml0ZVBhcnNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDb21tYW5kRmlsZVdyaXRlUGFyc2VyIH0gZnJvbSAnLi9jb21tYW5kRmlsZVdyaXRlUGFyc2VyLmpzJztcblxuLyoqXG4gKiBQYXJzZXIgZm9yIGRldGVjdGluZyBmaWxlIHdyaXRlcyBmcm9tIGBzZWRgIGNvbW1hbmRzIHVzaW5nIGluLXBsYWNlIGVkaXRpbmcuXG4gKlxuICogSGFuZGxlczpcbiAqIC0gYHNlZCAtaSAncy9mb28vYmFyLycgZmlsZS50eHRgIChHTlUpXG4gKiAtIGBzZWQgLWkuYmFrICdzL2Zvby9iYXIvJyBmaWxlLnR4dGAgKEdOVSB3aXRoIGJhY2t1cCBzdWZmaXgpXG4gKiAtIGBzZWQgLWkgJycgJ3MvZm9vL2Jhci8nIGZpbGUudHh0YCAobWFjT1MvQlNEIHdpdGggZW1wdHkgYmFja3VwIHN1ZmZpeClcbiAqIC0gYHNlZCAtLWluLXBsYWNlICdzL2Zvby9iYXIvJyBmaWxlLnR4dGAgKEdOVSBsb25nIGZvcm0pXG4gKiAtIGBzZWQgLS1pbi1wbGFjZT0uYmFrICdzL2Zvby9iYXIvJyBmaWxlLnR4dGAgKEdOVSBsb25nIGZvcm0gd2l0aCBiYWNrdXApXG4gKiAtIGBzZWQgLUkgJ3MvZm9vL2Jhci8nIGZpbGUudHh0YCAoQlNEIGNhc2UtaW5zZW5zaXRpdmUgdmFyaWFudClcbiAqL1xuZXhwb3J0IGNsYXNzIFNlZEZpbGVXcml0ZVBhcnNlciBpbXBsZW1lbnRzIElDb21tYW5kRmlsZVdyaXRlUGFyc2VyIHtcblx0cmVhZG9ubHkgY29tbWFuZE5hbWUgPSAnc2VkJztcblxuXHRjYW5IYW5kbGUoY29tbWFuZFRleHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSBzZWQgY29tbWFuZFxuXHRcdGlmICghY29tbWFuZFRleHQubWF0Y2goL15zZWRcXHMrLykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgLWksIC1JLCBvciAtLWluLXBsYWNlIGZsYWdcblx0XHRjb25zdCBpblBsYWNlUmVnZXggPSAvKD86XnxcXHMpKC1bYS16QS1aXSpbaUldW2EtekEtWl0qXFxTKnwtLWluLXBsYWNlKD86PVxcUyopP3woLWl8LUkpXFxzKidbXiddKid8KC1pfC1JKVxccypcIlteXCJdKlwiKSg/Olxcc3wkKS87XG5cdFx0cmV0dXJuIGluUGxhY2VSZWdleC50ZXN0KGNvbW1hbmRUZXh0KTtcblx0fVxuXG5cdGV4dHJhY3RGaWxlV3JpdGVzKGNvbW1hbmRUZXh0OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9rZW5pemVDb21tYW5kKGNvbW1hbmRUZXh0KTtcblx0XHRyZXR1cm4gdGhpcy5fZXh0cmFjdEZpbGVUYXJnZXRzKHRva2Vucyk7XG5cdH1cblxuXHQvKipcblx0ICogVG9rZW5pemVzIGEgY29tbWFuZCBpbnRvIGluZGl2aWR1YWwgYXJndW1lbnRzLCBoYW5kbGluZyBxdW90ZXMgYW5kIGVzY2FwZXMuXG5cdCAqL1xuXHRwcml2YXRlIF90b2tlbml6ZUNvbW1hbmQoY29tbWFuZFRleHQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB0b2tlbnM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGN1cnJlbnQgPSAnJztcblx0XHRsZXQgaW5TaW5nbGVRdW90ZSA9IGZhbHNlO1xuXHRcdGxldCBpbkRvdWJsZVF1b3RlID0gZmFsc2U7XG5cdFx0bGV0IGVzY2FwZWQgPSBmYWxzZTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29tbWFuZFRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNoYXIgPSBjb21tYW5kVGV4dFtpXTtcblxuXHRcdFx0aWYgKGVzY2FwZWQpIHtcblx0XHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdFx0XHRlc2NhcGVkID0gZmFsc2U7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhciA9PT0gJ1xcXFwnICYmICFpblNpbmdsZVF1b3RlKSB7XG5cdFx0XHRcdGVzY2FwZWQgPSB0cnVlO1xuXHRcdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhciA9PT0gJ1xcJycgJiYgIWluRG91YmxlUXVvdGUpIHtcblx0XHRcdFx0aW5TaW5nbGVRdW90ZSA9ICFpblNpbmdsZVF1b3RlO1xuXHRcdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhciA9PT0gJ1wiJyAmJiAhaW5TaW5nbGVRdW90ZSkge1xuXHRcdFx0XHRpbkRvdWJsZVF1b3RlID0gIWluRG91YmxlUXVvdGU7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICgvXFxzLy50ZXN0KGNoYXIpICYmICFpblNpbmdsZVF1b3RlICYmICFpbkRvdWJsZVF1b3RlKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50KSB7XG5cdFx0XHRcdFx0dG9rZW5zLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0Y3VycmVudCA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjdXJyZW50ICs9IGNoYXI7XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdHRva2Vucy5wdXNoKGN1cnJlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b2tlbnM7XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgZmlsZSB0YXJnZXRzIGZyb20gdG9rZW5pemVkIHNlZCBjb21tYW5kIGFyZ3VtZW50cy5cblx0ICogRmlsZXMgYXJlIGdlbmVyYWxseSB0aGUgbGFzdCBub24tb3B0aW9uLCBub24tc2NyaXB0IGFyZ3VtZW50cy5cblx0ICovXG5cdHByaXZhdGUgX2V4dHJhY3RGaWxlVGFyZ2V0cyh0b2tlbnM6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRcdGlmICh0b2tlbnMubGVuZ3RoID09PSAwIHx8IHRva2Vuc1swXSAhPT0gJ3NlZCcpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaSA9IDE7IC8vIFNraXAgJ3NlZCdcblx0XHRsZXQgZm91bmRTY3JpcHQgPSBmYWxzZTtcblxuXHRcdHdoaWxlIChpIDwgdG9rZW5zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cblx0XHRcdC8vIExvbmcgb3B0aW9uc1xuXHRcdFx0aWYgKHRva2VuLnN0YXJ0c1dpdGgoJy0tJykpIHtcblx0XHRcdFx0aWYgKHRva2VuID09PSAnLS1pbi1wbGFjZScgfHwgdG9rZW4uc3RhcnRzV2l0aCgnLS1pbi1wbGFjZT0nKSkge1xuXHRcdFx0XHRcdC8vIEluLXBsYWNlIGZsYWcgKGFscmVhZHkgdmVyaWZpZWQgd2UgaGF2ZSBvbmUpXG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbiA9PT0gJy0tZXhwcmVzc2lvbicgfHwgdG9rZW4gPT09ICctLWZpbGUnKSB7XG5cdFx0XHRcdFx0Ly8gU2tpcCB0aGUgb3B0aW9uIGFuZCBpdHMgYXJndW1lbnRcblx0XHRcdFx0XHRpICs9IDI7XG5cdFx0XHRcdFx0Zm91bmRTY3JpcHQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbi5zdGFydHNXaXRoKCctLWV4cHJlc3Npb249JykgfHwgdG9rZW4uc3RhcnRzV2l0aCgnLS1maWxlPScpKSB7XG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdGZvdW5kU2NyaXB0ID0gdHJ1ZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBPdGhlciBsb25nIG9wdGlvbnMgbGlrZSAtLXNhbmRib3gsIC0tZGVidWcsIGV0Yy5cblx0XHRcdFx0aSsrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvcnQgb3B0aW9uc1xuXHRcdFx0aWYgKHRva2VuLnN0YXJ0c1dpdGgoJy0nKSAmJiB0b2tlbi5sZW5ndGggPiAxICYmIHRva2VuWzFdICE9PSAnLScpIHtcblx0XHRcdFx0Ly8gQ291bGQgYmUgY29tYmluZWQgZmxhZ3MgbGlrZSAtbmkgb3IgLWkuYmFrXG5cdFx0XHRcdGNvbnN0IGZsYWdzID0gdG9rZW4uc2xpY2UoMSk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyAtaSB3aXRoIGJhY2t1cCBzdWZmaXggYXR0YWNoZWQgKGUuZy4sIC1pLmJhaylcblx0XHRcdFx0Y29uc3QgaUluZGV4ID0gZmxhZ3MuaW5kZXhPZignaScpO1xuXHRcdFx0XHRjb25zdCBJSW5kZXggPSBmbGFncy5pbmRleE9mKCdJJyk7XG5cdFx0XHRcdGNvbnN0IGluUGxhY2VJbmRleCA9IGlJbmRleCA+PSAwID8gaUluZGV4IDogSUluZGV4O1xuXG5cdFx0XHRcdGlmIChpblBsYWNlSW5kZXggPj0gMCAmJiBpblBsYWNlSW5kZXggPCBmbGFncy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0Ly8gLWkuYmFrIHN0eWxlIC0gYmFja3VwIHN1ZmZpeCBpcyBhdHRhY2hlZFxuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoZWNrIGlmIC1pIG9yIC1JIGlzIHRoZSBsYXN0IGZsYWcgYW5kIG5leHQgdG9rZW4gY291bGQgYmUgYmFja3VwIHN1ZmZpeFxuXHRcdFx0XHRpZiAoKGZsYWdzLmVuZHNXaXRoKCdpJykgfHwgZmxhZ3MuZW5kc1dpdGgoJ0knKSkgJiYgaSArIDEgPCB0b2tlbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dFRva2VuID0gdG9rZW5zW2kgKyAxXTtcblx0XHRcdFx0XHQvLyBtYWNPUy9CU0Qgc3R5bGU6IC1pICcnIG9yIC1pIFwiXCIgKGVtcHR5IHN0cmluZyBiYWNrdXAgc3VmZml4KVxuXHRcdFx0XHRcdC8vIE9ubHkgdHJlYXQgaXQgYXMgYSBiYWNrdXAgc3VmZml4IGlmIGl0J3MgZW1wdHkgb3IgbG9va3MgbGlrZSBhIGJhY2t1cFxuXHRcdFx0XHRcdC8vIGV4dGVuc2lvbiAoc3RhcnRzIHdpdGggJy4nIGFuZCBpcyBzaG9ydCkuIERvbid0IG1hdGNoIHNlZCBzY3JpcHRzIGxpa2UgJ3MvZm9vL2Jhci8nLlxuXHRcdFx0XHRcdGlmIChuZXh0VG9rZW4gPT09ICdcXCdcXCcnIHx8IG5leHRUb2tlbiA9PT0gJ1wiXCInKSB7XG5cdFx0XHRcdFx0XHRpICs9IDI7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHF1b3RlZCBiYWNrdXAgc3VmZml4ZXMgbGlrZSAnLmJhaycgb3IgXCIuYmFja3VwXCJcblx0XHRcdFx0XHRpZiAoKG5leHRUb2tlbi5zdGFydHNXaXRoKCdcXCcnKSAmJiBuZXh0VG9rZW4uZW5kc1dpdGgoJ1xcJycpKSB8fCAobmV4dFRva2VuLnN0YXJ0c1dpdGgoJ1wiJykgJiYgbmV4dFRva2VuLmVuZHNXaXRoKCdcIicpKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdW5xdW90ZWQgPSBuZXh0VG9rZW4uc2xpY2UoMSwgLTEpO1xuXHRcdFx0XHRcdFx0Ly8gQmFja3VwIHN1ZmZpeGVzIHR5cGljYWxseSBzdGFydCB3aXRoICcuJyBhbmQgYXJlIHNob3J0IGV4dGVuc2lvbnNcblx0XHRcdFx0XHRcdGlmICh1bnF1b3RlZC5zdGFydHNXaXRoKCcuJykgJiYgdW5xdW90ZWQubGVuZ3RoIDw9IDEwICYmICF1bnF1b3RlZC5pbmNsdWRlcygnLycpKSB7XG5cdFx0XHRcdFx0XHRcdGkgKz0gMjtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIC1lIG9yIC1mIHdoaWNoIHRha2UgYXJndW1lbnRzXG5cdFx0XHRcdGlmIChmbGFncy5pbmNsdWRlcygnZScpIHx8IGZsYWdzLmluY2x1ZGVzKCdmJykpIHtcblx0XHRcdFx0XHRjb25zdCBlSW5kZXggPSBmbGFncy5pbmRleE9mKCdlJyk7XG5cdFx0XHRcdFx0Y29uc3QgZkluZGV4ID0gZmxhZ3MuaW5kZXhPZignZicpO1xuXHRcdFx0XHRcdGNvbnN0IG9wdEluZGV4ID0gZUluZGV4ID49IDAgPyBlSW5kZXggOiBmSW5kZXg7XG5cblx0XHRcdFx0XHQvLyBJZiAtZSBvciAtZiBpcyBub3QgdGhlIGxhc3QgY2hhcmFjdGVyLCB0aGUgcmVzdCBvZiB0aGUgdG9rZW4gaXMgdGhlIGFyZ3VtZW50XG5cdFx0XHRcdFx0aWYgKG9wdEluZGV4IDwgZmxhZ3MubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0Zm91bmRTY3JpcHQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCB0aGUgbmV4dCB0b2tlbiBpcyB0aGUgYXJndW1lbnRcblx0XHRcdFx0XHRmb3VuZFNjcmlwdCA9IHRydWU7XG5cdFx0XHRcdFx0aSArPSAyO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aSsrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTm9uLW9wdGlvbiBhcmd1bWVudFxuXHRcdFx0aWYgKCFmb3VuZFNjcmlwdCkge1xuXHRcdFx0XHQvLyBGaXJzdCBub24tb3B0aW9uIGlzIHRoZSBzY3JpcHQgKHVubGVzcyAtZS8tZiB3YXMgdXNlZClcblx0XHRcdFx0Zm91bmRTY3JpcHQgPSB0cnVlO1xuXHRcdFx0XHRpKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdWJzZXF1ZW50IG5vbi1vcHRpb24gYXJndW1lbnRzIGFyZSBmaWxlc1xuXHRcdFx0Ly8gU3RyaXAgc3Vycm91bmRpbmcgcXVvdGVzIGZyb20gZmlsZSBwYXRoXG5cdFx0XHRsZXQgZmlsZSA9IHRva2VuO1xuXHRcdFx0aWYgKChmaWxlLnN0YXJ0c1dpdGgoJ1xcJycpICYmIGZpbGUuZW5kc1dpdGgoJ1xcJycpKSB8fCAoZmlsZS5zdGFydHNXaXRoKCdcIicpICYmIGZpbGUuZW5kc1dpdGgoJ1wiJykpKSB7XG5cdFx0XHRcdGZpbGUgPSBmaWxlLnNsaWNlKDEsIC0xKTtcblx0XHRcdH1cblx0XHRcdGZpbGVzLnB1c2goZmlsZSk7XG5cdFx0XHRpKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFrQk8sTUFBTSxtQkFB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
