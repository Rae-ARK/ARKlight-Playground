import * as glob from "../../../../base/common/glob.js";
import { startsWithIgnoreCase } from "../../../../base/common/strings.js";
class IgnoreFile {
  constructor(contents, location, parent, ignoreCase = false) {
    this.location = location;
    this.parent = parent;
    this.ignoreCase = ignoreCase;
    if (location[location.length - 1] === "\\") {
      throw Error("Unexpected path format, do not use trailing backslashes");
    }
    if (location[location.length - 1] !== "/") {
      location += "/";
    }
    this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
  }
  /**
   * Updates the contents of the ignore file. Preserving the location and parent
   * @param contents The new contents of the gitignore file
   */
  updateContents(contents) {
    this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
  }
  /**
   * Returns true if a path in a traversable directory has not been ignored.
   *
   * Note: For performance reasons this does not check if the parent directories have been ignored,
   * so it should always be used in tandem with `shouldTraverseDir` when walking a directory.
   *
   * In cases where a path must be tested in isolation, `isArbitraryPathIncluded` should be used.
   */
  isPathIncludedInTraversal(path, isDir) {
    if (path[0] !== "/" || path[path.length - 1] === "/") {
      throw Error("Unexpected path format, expected to begin with slash and end without. got:" + path);
    }
    const ignored = this.isPathIgnored(path, isDir);
    return !ignored;
  }
  /**
   * Returns true if an arbitrary path has not been ignored.
   * This is an expensive operation and should only be used outside of traversals.
   */
  isArbitraryPathIgnored(path, isDir) {
    if (path[0] !== "/" || path[path.length - 1] === "/") {
      throw Error("Unexpected path format, expected to begin with slash and end without. got:" + path);
    }
    const segments = path.split("/").filter((x) => x);
    let ignored = false;
    let walkingPath = "";
    for (let i = 0; i < segments.length; i++) {
      const isLast = i === segments.length - 1;
      const segment = segments[i];
      walkingPath = walkingPath + "/" + segment;
      if (!this.isPathIncludedInTraversal(walkingPath, isLast ? isDir : true)) {
        ignored = true;
        break;
      }
    }
    return ignored;
  }
  gitignoreLinesToExpression(lines, dirPath, trimForExclusions) {
    const includeLines = lines.map((line) => this.gitignoreLineToGlob(line, dirPath));
    const includeExpression = /* @__PURE__ */ Object.create(null);
    for (const line of includeLines) {
      includeExpression[line] = true;
    }
    return glob.parse(includeExpression, { trimForExclusions, ignoreCase: this.ignoreCase });
  }
  parseIgnoreFile(ignoreContents, dirPath, parent) {
    const contentLines = ignoreContents.split("\n").map((line) => line.trim()).filter((line) => line && line[0] !== "#");
    const fileLines = contentLines.filter((line) => !line.endsWith("/"));
    const fileIgnoreLines = fileLines.filter((line) => !line.includes("!"));
    const isFileIgnored = this.gitignoreLinesToExpression(fileIgnoreLines, dirPath, true);
    const fileIncludeLines = fileLines.filter((line) => line.includes("!")).map((line) => line.replace(/!/g, ""));
    const isFileIncluded = this.gitignoreLinesToExpression(fileIncludeLines, dirPath, false);
    const dirIgnoreLines = contentLines.filter((line) => !line.includes("!"));
    const isDirIgnored = this.gitignoreLinesToExpression(dirIgnoreLines, dirPath, true);
    const dirIncludeLines = contentLines.filter((line) => line.includes("!")).map((line) => line.replace(/!/g, ""));
    const isDirIncluded = this.gitignoreLinesToExpression(dirIncludeLines, dirPath, false);
    const isPathIgnored = (path, isDir) => {
      if (!(this.ignoreCase ? startsWithIgnoreCase(path, dirPath) : path.startsWith(dirPath))) {
        return false;
      }
      const dirIncluded = isDir && isDirIncluded(path);
      if (isDir && isDirIgnored(path) && !dirIncluded) {
        return true;
      }
      const fileIncluded = isFileIncluded(path);
      if (isFileIgnored(path) && !fileIncluded) {
        return true;
      }
      if (dirIncluded || fileIncluded) {
        return false;
      }
      if (parent) {
        return parent.isPathIgnored(path, isDir);
      }
      return false;
    };
    return isPathIgnored;
  }
  gitignoreLineToGlob(line, dirPath) {
    const firstSep = line.indexOf("/");
    if (firstSep === -1 || firstSep === line.length - 1) {
      line = "**/" + line;
    } else {
      if (firstSep === 0) {
        if (dirPath.slice(-1) === "/") {
          line = line.slice(1);
        }
      } else {
        if (dirPath.slice(-1) !== "/") {
          line = "/" + line;
        }
      }
      line = dirPath + line;
    }
    return line;
  }
}
export {
  IgnoreFile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL2lnbm9yZUZpbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgc3RhcnRzV2l0aElnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuZXhwb3J0IGNsYXNzIElnbm9yZUZpbGUge1xuXG5cdHByaXZhdGUgaXNQYXRoSWdub3JlZDogKHBhdGg6IHN0cmluZywgaXNEaXI6IGJvb2xlYW4sIHBhcmVudD86IElnbm9yZUZpbGUpID0+IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGVudHM6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9uOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnQ/OiBJZ25vcmVGaWxlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWdub3JlQ2FzZSA9IGZhbHNlKSB7XG5cdFx0aWYgKGxvY2F0aW9uW2xvY2F0aW9uLmxlbmd0aCAtIDFdID09PSAnXFxcXCcpIHtcblx0XHRcdHRocm93IEVycm9yKCdVbmV4cGVjdGVkIHBhdGggZm9ybWF0LCBkbyBub3QgdXNlIHRyYWlsaW5nIGJhY2tzbGFzaGVzJyk7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbltsb2NhdGlvbi5sZW5ndGggLSAxXSAhPT0gJy8nKSB7XG5cdFx0XHRsb2NhdGlvbiArPSAnLyc7XG5cdFx0fVxuXHRcdHRoaXMuaXNQYXRoSWdub3JlZCA9IHRoaXMucGFyc2VJZ25vcmVGaWxlKGNvbnRlbnRzLCB0aGlzLmxvY2F0aW9uLCB0aGlzLnBhcmVudCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgY29udGVudHMgb2YgdGhlIGlnbm9yZSBmaWxlLiBQcmVzZXJ2aW5nIHRoZSBsb2NhdGlvbiBhbmQgcGFyZW50XG5cdCAqIEBwYXJhbSBjb250ZW50cyBUaGUgbmV3IGNvbnRlbnRzIG9mIHRoZSBnaXRpZ25vcmUgZmlsZVxuXHQgKi9cblx0dXBkYXRlQ29udGVudHMoY29udGVudHM6IHN0cmluZykge1xuXHRcdHRoaXMuaXNQYXRoSWdub3JlZCA9IHRoaXMucGFyc2VJZ25vcmVGaWxlKGNvbnRlbnRzLCB0aGlzLmxvY2F0aW9uLCB0aGlzLnBhcmVudCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGEgcGF0aCBpbiBhIHRyYXZlcnNhYmxlIGRpcmVjdG9yeSBoYXMgbm90IGJlZW4gaWdub3JlZC5cblx0ICpcblx0ICogTm90ZTogRm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMgdGhpcyBkb2VzIG5vdCBjaGVjayBpZiB0aGUgcGFyZW50IGRpcmVjdG9yaWVzIGhhdmUgYmVlbiBpZ25vcmVkLFxuXHQgKiBzbyBpdCBzaG91bGQgYWx3YXlzIGJlIHVzZWQgaW4gdGFuZGVtIHdpdGggYHNob3VsZFRyYXZlcnNlRGlyYCB3aGVuIHdhbGtpbmcgYSBkaXJlY3RvcnkuXG5cdCAqXG5cdCAqIEluIGNhc2VzIHdoZXJlIGEgcGF0aCBtdXN0IGJlIHRlc3RlZCBpbiBpc29sYXRpb24sIGBpc0FyYml0cmFyeVBhdGhJbmNsdWRlZGAgc2hvdWxkIGJlIHVzZWQuXG5cdCAqL1xuXHRpc1BhdGhJbmNsdWRlZEluVHJhdmVyc2FsKHBhdGg6IHN0cmluZywgaXNEaXI6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAocGF0aFswXSAhPT0gJy8nIHx8IHBhdGhbcGF0aC5sZW5ndGggLSAxXSA9PT0gJy8nKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignVW5leHBlY3RlZCBwYXRoIGZvcm1hdCwgZXhwZWN0ZWQgdG8gYmVnaW4gd2l0aCBzbGFzaCBhbmQgZW5kIHdpdGhvdXQuIGdvdDonICsgcGF0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWdub3JlZCA9IHRoaXMuaXNQYXRoSWdub3JlZChwYXRoLCBpc0Rpcik7XG5cblx0XHRyZXR1cm4gIWlnbm9yZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGFuIGFyYml0cmFyeSBwYXRoIGhhcyBub3QgYmVlbiBpZ25vcmVkLlxuXHQgKiBUaGlzIGlzIGFuIGV4cGVuc2l2ZSBvcGVyYXRpb24gYW5kIHNob3VsZCBvbmx5IGJlIHVzZWQgb3V0c2lkZSBvZiB0cmF2ZXJzYWxzLlxuXHQgKi9cblx0aXNBcmJpdHJhcnlQYXRoSWdub3JlZChwYXRoOiBzdHJpbmcsIGlzRGlyOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKHBhdGhbMF0gIT09ICcvJyB8fCBwYXRoW3BhdGgubGVuZ3RoIC0gMV0gPT09ICcvJykge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ1VuZXhwZWN0ZWQgcGF0aCBmb3JtYXQsIGV4cGVjdGVkIHRvIGJlZ2luIHdpdGggc2xhc2ggYW5kIGVuZCB3aXRob3V0LiBnb3Q6JyArIHBhdGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlZ21lbnRzID0gcGF0aC5zcGxpdCgnLycpLmZpbHRlcih4ID0+IHgpO1xuXHRcdGxldCBpZ25vcmVkID0gZmFsc2U7XG5cblx0XHRsZXQgd2Fsa2luZ1BhdGggPSAnJztcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2VnbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGlzTGFzdCA9IGkgPT09IHNlZ21lbnRzLmxlbmd0aCAtIDE7XG5cdFx0XHRjb25zdCBzZWdtZW50ID0gc2VnbWVudHNbaV07XG5cblx0XHRcdHdhbGtpbmdQYXRoID0gd2Fsa2luZ1BhdGggKyAnLycgKyBzZWdtZW50O1xuXG5cdFx0XHRpZiAoIXRoaXMuaXNQYXRoSW5jbHVkZWRJblRyYXZlcnNhbCh3YWxraW5nUGF0aCwgaXNMYXN0ID8gaXNEaXIgOiB0cnVlKSkge1xuXHRcdFx0XHRpZ25vcmVkID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlnbm9yZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdpdGlnbm9yZUxpbmVzVG9FeHByZXNzaW9uKGxpbmVzOiBzdHJpbmdbXSwgZGlyUGF0aDogc3RyaW5nLCB0cmltRm9yRXhjbHVzaW9uczogYm9vbGVhbik6IGdsb2IuUGFyc2VkRXhwcmVzc2lvbiB7XG5cdFx0Y29uc3QgaW5jbHVkZUxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gdGhpcy5naXRpZ25vcmVMaW5lVG9HbG9iKGxpbmUsIGRpclBhdGgpKTtcblxuXHRcdGNvbnN0IGluY2x1ZGVFeHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgaW5jbHVkZUxpbmVzKSB7XG5cdFx0XHRpbmNsdWRlRXhwcmVzc2lvbltsaW5lXSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdsb2IucGFyc2UoaW5jbHVkZUV4cHJlc3Npb24sIHsgdHJpbUZvckV4Y2x1c2lvbnMsIGlnbm9yZUNhc2U6IHRoaXMuaWdub3JlQ2FzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VJZ25vcmVGaWxlKGlnbm9yZUNvbnRlbnRzOiBzdHJpbmcsIGRpclBhdGg6IHN0cmluZywgcGFyZW50OiBJZ25vcmVGaWxlIHwgdW5kZWZpbmVkKTogKHBhdGg6IHN0cmluZywgaXNEaXI6IGJvb2xlYW4pID0+IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbnRlbnRMaW5lcyA9IGlnbm9yZUNvbnRlbnRzXG5cdFx0XHQuc3BsaXQoJ1xcbicpXG5cdFx0XHQubWFwKGxpbmUgPT4gbGluZS50cmltKCkpXG5cdFx0XHQuZmlsdGVyKGxpbmUgPT4gbGluZSAmJiBsaW5lWzBdICE9PSAnIycpO1xuXG5cdFx0Ly8gUHVsbCBvdXQgYWxsIHRoZSBsaW5lcyB0aGF0IGVuZCB3aXRoIGAvYCwgdGhvc2Ugb25seSBhcHBseSB0byBkaXJlY3Rvcmllc1xuXHRcdGNvbnN0IGZpbGVMaW5lcyA9IGNvbnRlbnRMaW5lcy5maWx0ZXIobGluZSA9PiAhbGluZS5lbmRzV2l0aCgnLycpKTtcblxuXHRcdGNvbnN0IGZpbGVJZ25vcmVMaW5lcyA9IGZpbGVMaW5lcy5maWx0ZXIobGluZSA9PiAhbGluZS5pbmNsdWRlcygnIScpKTtcblx0XHRjb25zdCBpc0ZpbGVJZ25vcmVkID0gdGhpcy5naXRpZ25vcmVMaW5lc1RvRXhwcmVzc2lvbihmaWxlSWdub3JlTGluZXMsIGRpclBhdGgsIHRydWUpO1xuXG5cdFx0Ly8gVE9ETzogU2xpZ2h0IGhhY2suLi4gdGhpcyBuYWl2ZSBhcHByb2FjaCBtYXkgcmVpbnRyb2R1Y2UgdG9vIG1hbnkgZmlsZXMgaW4gY2FzZXMgb2Ygd2VpcmRseSBjb21wbGV4IC5naXRpZ25vcmVzXG5cdFx0Y29uc3QgZmlsZUluY2x1ZGVMaW5lcyA9IGZpbGVMaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lLmluY2x1ZGVzKCchJykpLm1hcChsaW5lID0+IGxpbmUucmVwbGFjZSgvIS9nLCAnJykpO1xuXHRcdGNvbnN0IGlzRmlsZUluY2x1ZGVkID0gdGhpcy5naXRpZ25vcmVMaW5lc1RvRXhwcmVzc2lvbihmaWxlSW5jbHVkZUxpbmVzLCBkaXJQYXRoLCBmYWxzZSk7XG5cblx0XHQvLyBXaGVuIGNoZWNraW5nIGlmIGEgZGlyIGlzIGlnbm9yZWQgd2UgY2FuIHVzZSBhbGwgbGluZXNcblx0XHRjb25zdCBkaXJJZ25vcmVMaW5lcyA9IGNvbnRlbnRMaW5lcy5maWx0ZXIobGluZSA9PiAhbGluZS5pbmNsdWRlcygnIScpKTtcblx0XHRjb25zdCBpc0Rpcklnbm9yZWQgPSB0aGlzLmdpdGlnbm9yZUxpbmVzVG9FeHByZXNzaW9uKGRpcklnbm9yZUxpbmVzLCBkaXJQYXRoLCB0cnVlKTtcblxuXHRcdC8vIFNhbWUgaGFjay5cblx0XHRjb25zdCBkaXJJbmNsdWRlTGluZXMgPSBjb250ZW50TGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZS5pbmNsdWRlcygnIScpKS5tYXAobGluZSA9PiBsaW5lLnJlcGxhY2UoLyEvZywgJycpKTtcblx0XHRjb25zdCBpc0RpckluY2x1ZGVkID0gdGhpcy5naXRpZ25vcmVMaW5lc1RvRXhwcmVzc2lvbihkaXJJbmNsdWRlTGluZXMsIGRpclBhdGgsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGlzUGF0aElnbm9yZWQgPSAocGF0aDogc3RyaW5nLCBpc0RpcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKCEodGhpcy5pZ25vcmVDYXNlID8gc3RhcnRzV2l0aElnbm9yZUNhc2UocGF0aCwgZGlyUGF0aCkgOiBwYXRoLnN0YXJ0c1dpdGgoZGlyUGF0aCkpKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0XHRjb25zdCBkaXJJbmNsdWRlZCA9IGlzRGlyICYmIGlzRGlySW5jbHVkZWQocGF0aCk7XG5cdFx0XHRpZiAoaXNEaXIgJiYgaXNEaXJJZ25vcmVkKHBhdGgpICYmICFkaXJJbmNsdWRlZCkgeyByZXR1cm4gdHJ1ZTsgfVxuXG5cdFx0XHRjb25zdCBmaWxlSW5jbHVkZWQgPSBpc0ZpbGVJbmNsdWRlZChwYXRoKTtcblx0XHRcdGlmIChpc0ZpbGVJZ25vcmVkKHBhdGgpICYmICFmaWxlSW5jbHVkZWQpIHsgcmV0dXJuIHRydWU7IH1cblxuXHRcdFx0Ly8gSWYgdGhpcyBmaWxlIGV4cGxpY2l0bHkgdW4taWdub3JlcyBhIHBhdGggdmlhIGEgbmVnYXRpb24gcGF0dGVyblxuXHRcdFx0Ly8gKGUuZy4sIGAhLm15Y29uZmlnL2ApLCBkbyBub3QgZGVsZWdhdGUgdG8gdGhlIHBhcmVudC4gSW4gZ2l0LCBhXG5cdFx0XHQvLyBuZWdhdGlvbiBpbiBhIGNoaWxkIC5naXRpZ25vcmUgb3ZlcnJpZGVzIGEgcG9zaXRpdmUgcGF0dGVybiBpbiBhXG5cdFx0XHQvLyBwYXJlbnQgb3IgZ2xvYmFsIC5naXRpZ25vcmUuXG5cdFx0XHRpZiAoZGlySW5jbHVkZWQgfHwgZmlsZUluY2x1ZGVkKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0XHRpZiAocGFyZW50KSB7IHJldHVybiBwYXJlbnQuaXNQYXRoSWdub3JlZChwYXRoLCBpc0Rpcik7IH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gaXNQYXRoSWdub3JlZDtcblx0fVxuXG5cdHByaXZhdGUgZ2l0aWdub3JlTGluZVRvR2xvYihsaW5lOiBzdHJpbmcsIGRpclBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZmlyc3RTZXAgPSBsaW5lLmluZGV4T2YoJy8nKTtcblx0XHRpZiAoZmlyc3RTZXAgPT09IC0xIHx8IGZpcnN0U2VwID09PSBsaW5lLmxlbmd0aCAtIDEpIHtcblx0XHRcdGxpbmUgPSAnKiovJyArIGxpbmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChmaXJzdFNlcCA9PT0gMCkge1xuXHRcdFx0XHRpZiAoZGlyUGF0aC5zbGljZSgtMSkgPT09ICcvJykge1xuXHRcdFx0XHRcdGxpbmUgPSBsaW5lLnNsaWNlKDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZGlyUGF0aC5zbGljZSgtMSkgIT09ICcvJykge1xuXHRcdFx0XHRcdGxpbmUgPSAnLycgKyBsaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsaW5lID0gZGlyUGF0aCArIGxpbmU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksVUFBVTtBQUN0QixTQUFTLDRCQUE0QjtBQUU5QixNQUFNLFdBQVc7QUFBQSxFQUl2QixZQUNDLFVBQ2lCLFVBQ0EsUUFDQSxhQUFhLE9BQU87QUFGcEI7QUFDQTtBQUNBO0FBQ2pCLFFBQUksU0FBUyxTQUFTLFNBQVMsQ0FBQyxNQUFNLE1BQU07QUFDM0MsWUFBTSxNQUFNLHlEQUF5RDtBQUFBLElBQ3RFO0FBQ0EsUUFBSSxTQUFTLFNBQVMsU0FBUyxDQUFDLE1BQU0sS0FBSztBQUMxQyxrQkFBWTtBQUFBLElBQ2I7QUFDQSxTQUFLLGdCQUFnQixLQUFLLGdCQUFnQixVQUFVLEtBQUssVUFBVSxLQUFLLE1BQU07QUFBQSxFQUMvRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxlQUFlLFVBQWtCO0FBQ2hDLFNBQUssZ0JBQWdCLEtBQUssZ0JBQWdCLFVBQVUsS0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLEVBQy9FO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsMEJBQTBCLE1BQWMsT0FBeUI7QUFDaEUsUUFBSSxLQUFLLENBQUMsTUFBTSxPQUFPLEtBQUssS0FBSyxTQUFTLENBQUMsTUFBTSxLQUFLO0FBQ3JELFlBQU0sTUFBTSwrRUFBK0UsSUFBSTtBQUFBLElBQ2hHO0FBRUEsVUFBTSxVQUFVLEtBQUssY0FBYyxNQUFNLEtBQUs7QUFFOUMsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSx1QkFBdUIsTUFBYyxPQUF5QjtBQUM3RCxRQUFJLEtBQUssQ0FBQyxNQUFNLE9BQU8sS0FBSyxLQUFLLFNB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
