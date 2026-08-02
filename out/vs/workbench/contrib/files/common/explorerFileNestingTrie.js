class ExplorerFileNestingTrie {
  constructor(config) {
    this.root = new PreTrie();
    for (const [parentPattern, childPatterns] of config) {
      for (const childPattern of childPatterns) {
        this.root.add(parentPattern, childPattern);
      }
    }
  }
  toString() {
    return this.root.toString();
  }
  getAttributes(filename, dirname) {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot < 1) {
      return {
        dirname,
        basename: filename,
        extname: ""
      };
    } else {
      return {
        dirname,
        basename: filename.substring(0, lastDot),
        extname: filename.substring(lastDot + 1)
      };
    }
  }
  nest(files, dirname) {
    const parentFinder = new PreTrie();
    for (const potentialParent of files) {
      const attributes = this.getAttributes(potentialParent, dirname);
      const children = this.root.get(potentialParent, attributes);
      for (const child of children) {
        parentFinder.add(child, potentialParent);
      }
    }
    const findAllRootAncestors = (file, seen = /* @__PURE__ */ new Set()) => {
      if (seen.has(file)) {
        return [];
      }
      seen.add(file);
      const attributes = this.getAttributes(file, dirname);
      const ancestors = parentFinder.get(file, attributes);
      if (ancestors.length === 0) {
        return [file];
      }
      if (ancestors.length === 1 && ancestors[0] === file) {
        return [file];
      }
      return ancestors.flatMap((a) => findAllRootAncestors(a, seen));
    };
    const result = /* @__PURE__ */ new Map();
    for (const file of files) {
      let ancestors = findAllRootAncestors(file);
      if (ancestors.length === 0) {
        ancestors = [file];
      }
      for (const ancestor of ancestors) {
        let existing = result.get(ancestor);
        if (!existing) {
          result.set(ancestor, existing = /* @__PURE__ */ new Set());
        }
        if (file !== ancestor) {
          existing.add(file);
        }
      }
    }
    return result;
  }
}
class PreTrie {
  constructor() {
    this.value = new SufTrie();
    this.map = /* @__PURE__ */ new Map();
  }
  add(key, value) {
    if (key === "") {
      this.value.add(key, value);
    } else if (key[0] === "*") {
      this.value.add(key, value);
    } else {
      const head = key[0];
      const rest = key.slice(1);
      let existing = this.map.get(head);
      if (!existing) {
        this.map.set(head, existing = new PreTrie());
      }
      existing.add(rest, value);
    }
  }
  get(key, attributes) {
    const results = [];
    results.push(...this.value.get(key, attributes));
    const head = key[0];
    const rest = key.slice(1);
    const existing = this.map.get(head);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }
    return results;
  }
  toString(indentation = "") {
    const lines = [];
    if (this.value.hasItems) {
      lines.push("* => \n" + this.value.toString(indentation + "  "));
    }
    [...this.map.entries()].map(([key, trie]) => lines.push("^" + key + " => \n" + trie.toString(indentation + "  ")));
    return lines.map((l) => indentation + l).join("\n");
  }
}
class SufTrie {
  constructor() {
    this.star = [];
    this.epsilon = [];
    this.map = /* @__PURE__ */ new Map();
    this.hasItems = false;
  }
  add(key, value) {
    this.hasItems = true;
    if (key === "*") {
      this.star.push(new SubstitutionString(value));
    } else if (key === "") {
      this.epsilon.push(new SubstitutionString(value));
    } else {
      const tail = key[key.length - 1];
      const rest = key.slice(0, key.length - 1);
      if (tail === "*") {
        throw Error("Unexpected star in SufTrie key: " + key);
      } else {
        let existing = this.map.get(tail);
        if (!existing) {
          this.map.set(tail, existing = new SufTrie());
        }
        existing.add(rest, value);
      }
    }
  }
  get(key, attributes) {
    const results = [];
    if (key === "") {
      results.push(...this.epsilon.map((ss) => ss.substitute(attributes)));
    }
    if (this.star.length) {
      results.push(...this.star.map((ss) => ss.substitute(attributes, key)));
    }
    const tail = key[key.length - 1];
    const rest = key.slice(0, key.length - 1);
    const existing = this.map.get(tail);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }
    return results;
  }
  toString(indentation = "") {
    const lines = [];
    if (this.star.length) {
      lines.push("* => " + this.star.join("; "));
    }
    if (this.epsilon.length) {
      lines.push("\u03B5 => " + this.epsilon.join("; "));
    }
    [...this.map.entries()].map(([key, trie]) => lines.push(key + "$ => \n" + trie.toString(indentation + "  ")));
    return lines.map((l) => indentation + l).join("\n");
  }
}
var SubstitutionType = /* @__PURE__ */ ((SubstitutionType2) => {
  SubstitutionType2["capture"] = "capture";
  SubstitutionType2["basename"] = "basename";
  SubstitutionType2["dirname"] = "dirname";
  SubstitutionType2["extname"] = "extname";
  return SubstitutionType2;
})(SubstitutionType || {});
const substitutionStringTokenizer = /\$[({](capture|basename|dirname|extname)[)}]/g;
class SubstitutionString {
  constructor(pattern) {
    this.tokens = [];
    substitutionStringTokenizer.lastIndex = 0;
    let token;
    let lastIndex = 0;
    while (token = substitutionStringTokenizer.exec(pattern)) {
      const prefix = pattern.slice(lastIndex, token.index);
      this.tokens.push(prefix);
      const type = token[1];
      switch (type) {
        case "basename" /* basename */:
        case "dirname" /* dirname */:
        case "extname" /* extname */:
        case "capture" /* capture */:
          this.tokens.push({ capture: type });
          break;
        default:
          throw Error("unknown substitution type: " + type);
      }
      lastIndex = token.index + token[0].length;
    }
    if (lastIndex !== pattern.length) {
      const suffix = pattern.slice(lastIndex, pattern.length);
      this.tokens.push(suffix);
    }
  }
  substitute(attributes, capture) {
    return this.tokens.map((t) => {
      if (typeof t === "string") {
        return t;
      }
      switch (t.capture) {
        case "basename" /* basename */:
          return attributes.basename;
        case "dirname" /* dirname */:
          return attributes.dirname;
        case "extname" /* extname */:
          return attributes.extname;
        case "capture" /* capture */:
          return capture || "";
      }
    }).join("");
  }
}
export {
  ExplorerFileNestingTrie,
  PreTrie,
  SufTrie
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2NvbW1vbi9leHBsb3JlckZpbGVOZXN0aW5nVHJpZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbnR5cGUgRmlsZW5hbWVBdHRyaWJ1dGVzID0ge1xuXHQvLyBpbmRleC50ZXN0IGluIGluZGV4LnRlc3QuanNvblxuXHRiYXNlbmFtZTogc3RyaW5nO1xuXHQvLyBqc29uIGluIGluZGV4LnRlc3QuanNvblxuXHRleHRuYW1lOiBzdHJpbmc7XG5cdC8vIG15LWZvbGRlciBpbiBteS1mb2xkZXIvaW5kZXgudGVzdC5qc29uXG5cdGRpcm5hbWU6IHN0cmluZztcbn07XG5cbi8qKlxuICogQSBzb3J0IG9mIGRvdWJsZS1lbmRlZCB0cmllLCB1c2VkIHRvIGVmZmljaWVudGx5IHF1ZXJ5IGZvciBtYXRjaGVzIHRvIFwic3RhclwiIHBhdHRlcm5zLCB3aGVyZVxuICogYSBnaXZlbiBrZXkgcmVwcmVzZW50cyBhIHBhcmVudCBhbmQgbWF5IGNvbnRhaW4gYSBjYXB0dXJpbmcgZ3JvdXAgKFwiKlwiKSwgd2hpY2ggY2FuIHRoZW4gYmVcbiAqIHJlZmVyZW5jZWQgdmlhIHRoZSB0b2tlbiBcIiQoY2FwdHVyZSlcIiBpbiBhc3NvY2lhdGVkIGNoaWxkIHBhdHRlcm5zLlxuICpcbiAqIFRoZSBnZW5lcmF0ZWQgdHJlZSB3aWxsIGhhdmUgYXQgbW9zdCB0d28gbGV2ZWxzLCBhcyBzdWJ0cmVlcyBhcmUgZmxhdHRlbmVkIHJhdGhlciB0aGFuIG5lc3RlZC5cbiAqXG4gKiBFeGFtcGxlOlxuICogVGhlIGNvbmZpZzogW1xuICogWyAqLnRzICwgWyAkKGNhcHR1cmUpLioudHMgOyAkKGNhcHR1cmUpLmpzIF0gXVxuICogWyAqLmpzICwgWyAkKGNhcHR1cmUpLm1pbi5qcyBdIF0gXVxuICogTmVzdHMgdGhlIGZpbGVzOiBbIGEudHMgOyBhLmQudHMgOyBhLmpzIDsgYS5taW4uanMgOyBiLnRzIDsgYi5taW4uanMgXVxuICogQXM6XG4gKiAtIGEudHMgPT4gWyBhLmQudHMgOyBhLmpzIDsgYS5taW4uanMgXVxuICogLSBiLnRzID0+IFsgXVxuICogLSBiLm1pbi50cyA9PiBbIF1cbiAqL1xuZXhwb3J0IGNsYXNzIEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllIHtcblx0cHJpdmF0ZSByb290ID0gbmV3IFByZVRyaWUoKTtcblxuXHRjb25zdHJ1Y3Rvcihjb25maWc6IFtzdHJpbmcsIHN0cmluZ1tdXVtdKSB7XG5cdFx0Zm9yIChjb25zdCBbcGFyZW50UGF0dGVybiwgY2hpbGRQYXR0ZXJuc10gb2YgY29uZmlnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkUGF0dGVybiBvZiBjaGlsZFBhdHRlcm5zKSB7XG5cdFx0XHRcdHRoaXMucm9vdC5hZGQocGFyZW50UGF0dGVybiwgY2hpbGRQYXR0ZXJuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gdGhpcy5yb290LnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEF0dHJpYnV0ZXMoZmlsZW5hbWU6IHN0cmluZywgZGlybmFtZTogc3RyaW5nKTogRmlsZW5hbWVBdHRyaWJ1dGVzIHtcblx0XHRjb25zdCBsYXN0RG90ID0gZmlsZW5hbWUubGFzdEluZGV4T2YoJy4nKTtcblx0XHRpZiAobGFzdERvdCA8IDEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpcm5hbWUsXG5cdFx0XHRcdGJhc2VuYW1lOiBmaWxlbmFtZSxcblx0XHRcdFx0ZXh0bmFtZTogJydcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpcm5hbWUsXG5cdFx0XHRcdGJhc2VuYW1lOiBmaWxlbmFtZS5zdWJzdHJpbmcoMCwgbGFzdERvdCksXG5cdFx0XHRcdGV4dG5hbWU6IGZpbGVuYW1lLnN1YnN0cmluZyhsYXN0RG90ICsgMSlcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0bmVzdChmaWxlczogc3RyaW5nW10sIGRpcm5hbWU6IHN0cmluZyk6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PiB7XG5cdFx0Y29uc3QgcGFyZW50RmluZGVyID0gbmV3IFByZVRyaWUoKTtcblxuXHRcdGZvciAoY29uc3QgcG90ZW50aWFsUGFyZW50IG9mIGZpbGVzKSB7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gdGhpcy5nZXRBdHRyaWJ1dGVzKHBvdGVudGlhbFBhcmVudCwgZGlybmFtZSk7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IHRoaXMucm9vdC5nZXQocG90ZW50aWFsUGFyZW50LCBhdHRyaWJ1dGVzKTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0cGFyZW50RmluZGVyLmFkZChjaGlsZCwgcG90ZW50aWFsUGFyZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmaW5kQWxsUm9vdEFuY2VzdG9ycyA9IChmaWxlOiBzdHJpbmcsIHNlZW46IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpKTogc3RyaW5nW10gPT4ge1xuXHRcdFx0aWYgKHNlZW4uaGFzKGZpbGUpKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0c2Vlbi5hZGQoZmlsZSk7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gdGhpcy5nZXRBdHRyaWJ1dGVzKGZpbGUsIGRpcm5hbWUpO1xuXHRcdFx0Y29uc3QgYW5jZXN0b3JzID0gcGFyZW50RmluZGVyLmdldChmaWxlLCBhdHRyaWJ1dGVzKTtcblx0XHRcdGlmIChhbmNlc3RvcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBbZmlsZV07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhbmNlc3RvcnMubGVuZ3RoID09PSAxICYmIGFuY2VzdG9yc1swXSA9PT0gZmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gW2ZpbGVdO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYW5jZXN0b3JzLmZsYXRNYXAoYSA9PiBmaW5kQWxsUm9vdEFuY2VzdG9ycyhhLCBzZWVuKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdGxldCBhbmNlc3RvcnMgPSBmaW5kQWxsUm9vdEFuY2VzdG9ycyhmaWxlKTtcblx0XHRcdGlmIChhbmNlc3RvcnMubGVuZ3RoID09PSAwKSB7IGFuY2VzdG9ycyA9IFtmaWxlXTsgfVxuXHRcdFx0Zm9yIChjb25zdCBhbmNlc3RvciBvZiBhbmNlc3RvcnMpIHtcblx0XHRcdFx0bGV0IGV4aXN0aW5nID0gcmVzdWx0LmdldChhbmNlc3Rvcik7XG5cdFx0XHRcdGlmICghZXhpc3RpbmcpIHsgcmVzdWx0LnNldChhbmNlc3RvciwgZXhpc3RpbmcgPSBuZXcgU2V0KCkpOyB9XG5cdFx0XHRcdGlmIChmaWxlICE9PSBhbmNlc3Rvcikge1xuXHRcdFx0XHRcdGV4aXN0aW5nLmFkZChmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8qKiBFeHBvcnQgZm9yIHRlc3Qgb25seS4gKi9cbmV4cG9ydCBjbGFzcyBQcmVUcmllIHtcblx0cHJpdmF0ZSB2YWx1ZTogU3VmVHJpZSA9IG5ldyBTdWZUcmllKCk7XG5cblx0cHJpdmF0ZSBtYXA6IE1hcDxzdHJpbmcsIFByZVRyaWU+ID0gbmV3IE1hcCgpO1xuXG5cdGFkZChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykge1xuXHRcdGlmIChrZXkgPT09ICcnKSB7XG5cdFx0XHR0aGlzLnZhbHVlLmFkZChrZXksIHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKGtleVswXSA9PT0gJyonKSB7XG5cdFx0XHR0aGlzLnZhbHVlLmFkZChrZXksIHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaGVhZCA9IGtleVswXTtcblx0XHRcdGNvbnN0IHJlc3QgPSBrZXkuc2xpY2UoMSk7XG5cdFx0XHRsZXQgZXhpc3RpbmcgPSB0aGlzLm1hcC5nZXQoaGVhZCk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHRoaXMubWFwLnNldChoZWFkLCBleGlzdGluZyA9IG5ldyBQcmVUcmllKCkpO1xuXHRcdFx0fVxuXHRcdFx0ZXhpc3RpbmcuYWRkKHJlc3QsIHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRnZXQoa2V5OiBzdHJpbmcsIGF0dHJpYnV0ZXM6IEZpbGVuYW1lQXR0cmlidXRlcyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHJlc3VsdHMucHVzaCguLi50aGlzLnZhbHVlLmdldChrZXksIGF0dHJpYnV0ZXMpKTtcblxuXHRcdGNvbnN0IGhlYWQgPSBrZXlbMF07XG5cdFx0Y29uc3QgcmVzdCA9IGtleS5zbGljZSgxKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMubWFwLmdldChoZWFkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJlc3VsdHMucHVzaCguLi5leGlzdGluZy5nZXQocmVzdCwgYXR0cmlidXRlcykpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9XG5cblx0dG9TdHJpbmcoaW5kZW50YXRpb24gPSAnJyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXTtcblx0XHRpZiAodGhpcy52YWx1ZS5oYXNJdGVtcykge1xuXHRcdFx0bGluZXMucHVzaCgnKiA9PiBcXG4nICsgdGhpcy52YWx1ZS50b1N0cmluZyhpbmRlbnRhdGlvbiArICcgICcpKTtcblx0XHR9XG5cdFx0Wy4uLnRoaXMubWFwLmVudHJpZXMoKV0ubWFwKChba2V5LCB0cmllXSkgPT5cblx0XHRcdGxpbmVzLnB1c2goJ14nICsga2V5ICsgJyA9PiBcXG4nICsgdHJpZS50b1N0cmluZyhpbmRlbnRhdGlvbiArICcgICcpKSk7XG5cdFx0cmV0dXJuIGxpbmVzLm1hcChsID0+IGluZGVudGF0aW9uICsgbCkuam9pbignXFxuJyk7XG5cdH1cbn1cblxuLyoqIEV4cG9ydCBmb3IgdGVzdCBvbmx5LiAqL1xuZXhwb3J0IGNsYXNzIFN1ZlRyaWUge1xuXHRwcml2YXRlIHN0YXI6IFN1YnN0aXR1dGlvblN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgZXBzaWxvbjogU3Vic3RpdHV0aW9uU3RyaW5nW10gPSBbXTtcblxuXHRwcml2YXRlIG1hcDogTWFwPHN0cmluZywgU3VmVHJpZT4gPSBuZXcgTWFwKCk7XG5cdGhhc0l0ZW1zOiBib29sZWFuID0gZmFsc2U7XG5cblx0YWRkKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5oYXNJdGVtcyA9IHRydWU7XG5cdFx0aWYgKGtleSA9PT0gJyonKSB7XG5cdFx0XHR0aGlzLnN0YXIucHVzaChuZXcgU3Vic3RpdHV0aW9uU3RyaW5nKHZhbHVlKSk7XG5cdFx0fSBlbHNlIGlmIChrZXkgPT09ICcnKSB7XG5cdFx0XHR0aGlzLmVwc2lsb24ucHVzaChuZXcgU3Vic3RpdHV0aW9uU3RyaW5nKHZhbHVlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRhaWwgPSBrZXlba2V5Lmxlbmd0aCAtIDFdO1xuXHRcdFx0Y29uc3QgcmVzdCA9IGtleS5zbGljZSgwLCBrZXkubGVuZ3RoIC0gMSk7XG5cdFx0XHRpZiAodGFpbCA9PT0gJyonKSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdVbmV4cGVjdGVkIHN0YXIgaW4gU3VmVHJpZSBrZXk6ICcgKyBrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGV4aXN0aW5nID0gdGhpcy5tYXAuZ2V0KHRhaWwpO1xuXHRcdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5tYXAuc2V0KHRhaWwsIGV4aXN0aW5nID0gbmV3IFN1ZlRyaWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXhpc3RpbmcuYWRkKHJlc3QsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXQoa2V5OiBzdHJpbmcsIGF0dHJpYnV0ZXM6IEZpbGVuYW1lQXR0cmlidXRlcyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChrZXkgPT09ICcnKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goLi4udGhpcy5lcHNpbG9uLm1hcChzcyA9PiBzcy5zdWJzdGl0dXRlKGF0dHJpYnV0ZXMpKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0YXIubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goLi4udGhpcy5zdGFyLm1hcChzcyA9PiBzcy5zdWJzdGl0dXRlKGF0dHJpYnV0ZXMsIGtleSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0YWlsID0ga2V5W2tleS5sZW5ndGggLSAxXTtcblx0XHRjb25zdCByZXN0ID0ga2V5LnNsaWNlKDAsIGtleS5sZW5ndGggLSAxKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMubWFwLmdldCh0YWlsKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJlc3VsdHMucHVzaCguLi5leGlzdGluZy5nZXQocmVzdCwgYXR0cmlidXRlcykpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9XG5cblx0dG9TdHJpbmcoaW5kZW50YXRpb24gPSAnJyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXMgPSBbXTtcblx0XHRpZiAodGhpcy5zdGFyLmxlbmd0aCkge1xuXHRcdFx0bGluZXMucHVzaCgnKiA9PiAnICsgdGhpcy5zdGFyLmpvaW4oJzsgJykpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVwc2lsb24ubGVuZ3RoKSB7XG5cdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdGxpbmVzLnB1c2goJ1x1MDNCNSA9PiAnICsgdGhpcy5lcHNpbG9uLmpvaW4oJzsgJykpO1xuXHRcdH1cblxuXHRcdFsuLi50aGlzLm1hcC5lbnRyaWVzKCldLm1hcCgoW2tleSwgdHJpZV0pID0+XG5cdFx0XHRsaW5lcy5wdXNoKGtleSArICckJyArICcgPT4gXFxuJyArIHRyaWUudG9TdHJpbmcoaW5kZW50YXRpb24gKyAnICAnKSkpO1xuXG5cdFx0cmV0dXJuIGxpbmVzLm1hcChsID0+IGluZGVudGF0aW9uICsgbCkuam9pbignXFxuJyk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBTdWJzdGl0dXRpb25UeXBlIHtcblx0Y2FwdHVyZSA9ICdjYXB0dXJlJyxcblx0YmFzZW5hbWUgPSAnYmFzZW5hbWUnLFxuXHRkaXJuYW1lID0gJ2Rpcm5hbWUnLFxuXHRleHRuYW1lID0gJ2V4dG5hbWUnLFxufVxuXG5jb25zdCBzdWJzdGl0dXRpb25TdHJpbmdUb2tlbml6ZXIgPSAvXFwkWyh7XShjYXB0dXJlfGJhc2VuYW1lfGRpcm5hbWV8ZXh0bmFtZSlbKX1dL2c7XG5cbmNsYXNzIFN1YnN0aXR1dGlvblN0cmluZyB7XG5cblx0cHJpdmF0ZSB0b2tlbnM6IChzdHJpbmcgfCB7IGNhcHR1cmU6IFN1YnN0aXR1dGlvblR5cGUgfSlbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHBhdHRlcm46IHN0cmluZykge1xuXHRcdHN1YnN0aXR1dGlvblN0cmluZ1Rva2VuaXplci5sYXN0SW5kZXggPSAwO1xuXHRcdGxldCB0b2tlbjtcblx0XHRsZXQgbGFzdEluZGV4ID0gMDtcblx0XHR3aGlsZSAodG9rZW4gPSBzdWJzdGl0dXRpb25TdHJpbmdUb2tlbml6ZXIuZXhlYyhwYXR0ZXJuKSkge1xuXHRcdFx0Y29uc3QgcHJlZml4ID0gcGF0dGVybi5zbGljZShsYXN0SW5kZXgsIHRva2VuLmluZGV4KTtcblx0XHRcdHRoaXMudG9rZW5zLnB1c2gocHJlZml4KTtcblxuXHRcdFx0Y29uc3QgdHlwZSA9IHRva2VuWzFdO1xuXHRcdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRcdGNhc2UgU3Vic3RpdHV0aW9uVHlwZS5iYXNlbmFtZTpcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmRpcm5hbWU6XG5cdFx0XHRcdGNhc2UgU3Vic3RpdHV0aW9uVHlwZS5leHRuYW1lOlxuXHRcdFx0XHRjYXNlIFN1YnN0aXR1dGlvblR5cGUuY2FwdHVyZTpcblx0XHRcdFx0XHR0aGlzLnRva2Vucy5wdXNoKHsgY2FwdHVyZTogdHlwZSB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDogdGhyb3cgRXJyb3IoJ3Vua25vd24gc3Vic3RpdHV0aW9uIHR5cGU6ICcgKyB0eXBlKTtcblx0XHRcdH1cblx0XHRcdGxhc3RJbmRleCA9IHRva2VuLmluZGV4ICsgdG9rZW5bMF0ubGVuZ3RoO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0SW5kZXggIT09IHBhdHRlcm4ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBzdWZmaXggPSBwYXR0ZXJuLnNsaWNlKGxhc3RJbmRleCwgcGF0dGVybi5sZW5ndGgpO1xuXHRcdFx0dGhpcy50b2tlbnMucHVzaChzdWZmaXgpO1xuXHRcdH1cblx0fVxuXG5cdHN1YnN0aXR1dGUoYXR0cmlidXRlczogRmlsZW5hbWVBdHRyaWJ1dGVzLCBjYXB0dXJlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy50b2tlbnMubWFwKHQgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB0ID09PSAnc3RyaW5nJykgeyByZXR1cm4gdDsgfVxuXHRcdFx0c3dpdGNoICh0LmNhcHR1cmUpIHtcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmJhc2VuYW1lOiByZXR1cm4gYXR0cmlidXRlcy5iYXNlbmFtZTtcblx0XHRcdFx0Y2FzZSBTdWJzdGl0dXRpb25UeXBlLmRpcm5hbWU6IHJldHVybiBhdHRyaWJ1dGVzLmRpcm5hbWU7XG5cdFx0XHRcdGNhc2UgU3Vic3RpdHV0aW9uVHlwZS5leHRuYW1lOiByZXR1cm4gYXR0cmlidXRlcy5leHRuYW1lO1xuXHRcdFx0XHRjYXNlIFN1YnN0aXR1dGlvblR5cGUuY2FwdHVyZTogcmV0dXJuIGNhcHR1cmUgfHwgJyc7XG5cdFx0XHR9XG5cdFx0fSkuam9pbignJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQStCTyxNQUFNLHdCQUF3QjtBQUFBLEVBR3BDLFlBQVksUUFBOEI7QUFGMUMsU0FBUSxPQUFPLElBQUksUUFBUTtBQUcxQixlQUFXLENBQUMsZUFBZSxhQUFhLEtBQUssUUFBUTtBQUNwRCxpQkFBVyxnQkFBZ0IsZUFBZTtBQUN6QyxhQUFLLEtBQUssSUFBSSxlQUFlLFlBQVk7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxXQUFXO0FBQ1YsV0FBTyxLQUFLLEtBQUssU0FBUztBQUFBLEVBQzNCO0FBQUEsRUFFUSxjQUFjLFVBQWtCLFNBQXFDO0FBQzVFLFVBQU0sVUFBVSxTQUFTLFlBQVksR0FBRztBQUN4QyxRQUFJLFVBQVUsR0FBRztBQUNoQixhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVTtBQUFBLFFBQ1YsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELE9BQU87QUFDTixhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVSxTQUFTLFVBQVUsR0FBRyxPQUFP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LG1CQUFYLGtCQUFXQSxzQkFBWDtBQUNDLEVBQUFBLGtCQUFBLGFBQVU7QUFDVixFQUFBQSxrQkFBQSxjQUFXO0FBQ1gsRUFBQUEsa0JBQUEsYUFBVTtBQUNWLEVBQUFBLGtCQUFBLGFBQVU7QUFKQSxTQUFBQTtBQUFBLEdBQUE7QUFPWCxNQUFNLDhCQUE4QjtBQUVwQyxNQUFNLG1CQUFtQjtBQUFBLEVBSXhCLFlBQVksU0FBaUI7QUFGN0IsU0FBUSxTQUFxRCxDQUFDO0FBRzdELGdDQUE0QixZQUFZO0FBQ3hDLFFBQUk7QUFDSixRQUFJLFlBQVk7QUFDaEIsV0FBTyxRQUFRLDRCQUE0QixLQUFLLE9BQU8sR0FBRztBQUN6RCxZQUFNLFNBQVMsUUFBUSxNQUFNLFdBQVcsTUFBTSxLQUFLO0FBQ25ELFdBQUssT0FBTyxLQUFLLE1BQU07QUFFdkIsWUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixjQUFRLE1BQU07QUFBQSxRQUNiLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFDSixlQUFLLE9BQU8sS0FBSyxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ2xDO0FBQUEsUUFDRDtBQUFTLGdCQUFNLE1BQU0sZ0NBQWdDLElBQUk7QUFBQSxNQUMxRDtBQUNBLGtCQUFZLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRTtBQUFBLElBQ3BDO0FBRUEsUUFBSSxjQUFjLFFBQVEsUUFBUTtBQUNqQyxZQUFNLFNBQVMsUUFBUSxNQUFNLFdBQVcsUUFBUSxNQUFNO0FBQ3RELFdBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFdBQVcsWUFBZ0MsU0FBMEI7QUFDcEUsV0FBTyxLQUFLLE9BQU8sSUFBSSxPQUFLO0FBQzNCLFVBQUksT0FBTyxNQUFNLFVBQVU7QUFBRSxlQUFPO0FBQUEsTUFBRztBQUN2QyxjQUFRLEVBQUUsU0FBUztBQUFBLFFBQ2xCLEtBQUs7QUFBMkIsaUJBQU8sV0FBVztBQUFBLFFBQ2xELEtBQUs7QUFBMEIsaUJBQU8sV0FBVztBQUFBLFFBQ2pELEtBQUs7QUFBMEIsaUJBQU8sV0FBVztBQUFBLFFBQ2pELEtBQUs7QUFBMEIsaUJBQU8sV0FBVztBQUFBLE1BQ2xEO0FBQUEsSUFDRCxDQUFDLEVBQUUsS0FBSyxFQUFFO0FBQUEsRUFDWDtBQUNEOyIsCiAgIm5hbWVzIjogWyJTdWJzdGl0dXRpb25UeXBlIl0KfQo=
