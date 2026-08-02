import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "../../../../base/common/path.js";
import { StringDecoder } from "string_decoder";
import * as arrays from "../../../../base/common/arrays.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import * as glob from "../../../../base/common/glob.js";
import * as normalization from "../../../../base/common/normalization.js";
import { isEqualOrParent } from "../../../../base/common/extpath.js";
import * as platform from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import * as strings from "../../../../base/common/strings.js";
import * as types from "../../../../base/common/types.js";
import { Promises } from "../../../../base/node/pfs.js";
import { isFilePatternMatch, hasSiblingFn } from "../common/search.js";
import { spawnRipgrepCmd } from "./ripgrepFileSearch.js";
import { prepareQuery } from "../../../../base/common/fuzzyScorer.js";
const killCmds = /* @__PURE__ */ new Set();
process.on("exit", () => {
  killCmds.forEach((cmd) => cmd());
});
class FileWalker {
  constructor(config) {
    this.normalizedFilePatternLowercase = null;
    this.maxFilesize = null;
    this.isCanceled = false;
    this.fileWalkSW = null;
    this.cmdSW = null;
    this.cmdResultCount = 0;
    this.config = config;
    this.filePattern = config.filePattern || "";
    const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : void 0;
    this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
    this.maxResults = config.maxResults || null;
    this.exists = !!config.exists;
    this.walkedPaths = /* @__PURE__ */ Object.create(null);
    this.resultCount = 0;
    this.isLimitHit = false;
    this.directoriesWalked = 0;
    this.filesWalked = 0;
    this.errors = [];
    if (this.filePattern) {
      this.normalizedFilePatternLowercase = config.shouldGlobMatchFilePattern ? null : prepareQuery(this.filePattern).normalizedLowercase;
    }
    this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern, globOptions);
    this.folderExcludePatterns = /* @__PURE__ */ new Map();
    config.folderQueries.forEach((folderQuery) => {
      const folderExcludeExpression = {};
      folderQuery.excludePattern?.forEach((excludePattern) => {
        Object.assign(folderExcludeExpression, excludePattern.pattern || {}, this.config.excludePattern || {});
      });
      if (!folderQuery.excludePattern?.length) {
        Object.assign(folderExcludeExpression, this.config.excludePattern || {});
      }
      const fqPath = folderQuery.folder.fsPath;
      config.folderQueries.map((rootFolderQuery) => rootFolderQuery.folder.fsPath).filter((rootFolder) => rootFolder !== fqPath).forEach((otherRootFolder) => {
        if (isEqualOrParent(otherRootFolder, fqPath, config.ignoreGlobCase)) {
          folderExcludeExpression[path.relative(fqPath, otherRootFolder)] = true;
        }
      });
      this.folderExcludePatterns.set(fqPath, new AbsoluteAndRelativeParsedExpression(folderExcludeExpression, fqPath, config.ignoreGlobCase));
    });
  }
  cancel() {
    this.isCanceled = true;
    killCmds.forEach((cmd) => cmd());
  }
  walk(folderQueries, extraFiles, numThreads, onResult, onMessage, done) {
    this.fileWalkSW = StopWatch.create(false);
    if (this.isCanceled) {
      return done(null, this.isLimitHit);
    }
    extraFiles.forEach((extraFilePath) => {
      const basename = path.basename(extraFilePath.fsPath);
      if (this.globalExcludePattern && this.globalExcludePattern(extraFilePath.fsPath, basename)) {
        return;
      }
      this.matchFile(onResult, { relativePath: extraFilePath.fsPath, searchPath: void 0 });
    });
    this.cmdSW = StopWatch.create(false);
    this.parallel(folderQueries, (folderQuery, rootFolderDone) => {
      this.call(this.cmdTraversal, this, folderQuery, numThreads, onResult, onMessage, (err) => {
        if (err) {
          const errorMessage = toErrorMessage(err);
          console.error(errorMessage);
          this.errors.push(errorMessage);
          rootFolderDone(err, void 0);
        } else {
          rootFolderDone(null, void 0);
        }
      });
    }, (errors, _result) => {
      this.fileWalkSW.stop();
      const err = errors ? arrays.coalesce(errors)[0] : null;
      done(err, this.isLimitHit);
    });
  }
  parallel(list, fn, callback) {
    const results = new Array(list.length);
    const errors = new Array(list.length);
    let didErrorOccur = false;
    let doneCount = 0;
    if (list.length === 0) {
      return callback(null, []);
    }
    list.forEach((item, index) => {
      fn(item, (error, result) => {
        if (error) {
          didErrorOccur = true;
          results[index] = null;
          errors[index] = error;
        } else {
          results[index] = result;
          errors[index] = null;
        }
        if (++doneCount === list.length) {
          return callback(didErrorOccur ? errors : null, results);
        }
      });
    });
  }
  call(fun, that, ...args) {
    try {
      fun.apply(that, args);
    } catch (e) {
      args[args.length - 1](e);
    }
  }
  async cmdTraversal(folderQuery, numThreads, onResult, onMessage, cb) {
    const rootFolder = folderQuery.folder.fsPath;
    const isMac = platform.isMacintosh;
    const killCmd = () => cmd && cmd.kill();
    killCmds.add(killCmd);
    let done = (err) => {
      killCmds.delete(killCmd);
      done = () => {
      };
      cb(err);
    };
    let leftover = "";
    const tree = this.initDirectoryTree();
    let ripgrep;
    try {
      ripgrep = await spawnRipgrepCmd(this.config, folderQuery, this.config.includePattern, this.folderExcludePatterns.get(folderQuery.folder.fsPath).expression, numThreads);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const cmd = ripgrep.cmd;
    const noSiblingsClauses = !Object.keys(ripgrep.siblingClauses).length;
    const escapedArgs = ripgrep.rgArgs.args.map((arg) => arg.match(/^-/) ? arg : `'${arg}'`).join(" ");
    let rgCmd = `${ripgrep.rgDiskPath} ${escapedArgs}
 - cwd: ${ripgrep.cwd}`;
    if (ripgrep.rgArgs.siblingClauses) {
      rgCmd += `
 - Sibling clauses: ${JSON.stringify(ripgrep.rgArgs.siblingClauses)}`;
    }
    onMessage({ message: rgCmd });
    this.cmdResultCount = 0;
    this.collectStdout(cmd, "utf8", onMessage, (err, stdout, last) => {
      if (err) {
        done(err);
        return;
      }
      if (this.isLimitHit) {
        done();
        return;
      }
      const normalized = leftover + (isMac ? normalization.normalizeNFC(stdout || "") : stdout);
      const relativeFiles = normalized.split("\n");
      if (last) {
        const n = relativeFiles.length;
        relativeFiles[n - 1] = relativeFiles[n - 1].trim();
        if (!relativeFiles[n - 1]) {
          relativeFiles.pop();
        }
      } else {
        leftover = relativeFiles.pop() || "";
      }
      if (relativeFiles.length && relativeFiles[0].indexOf("\n") !== -1) {
        done(new Error("Splitting up files failed"));
        return;
      }
      this.cmdResultCount += relativeFiles.length;
      if (noSiblingsClauses) {
        for (const relativePath of relativeFiles) {
          this.matchFile(onResult, { base: rootFolder, relativePath, searchPath: this.getSearchPath(folderQuery, relativePath) });
          if (this.isLimitHit) {
            killCmd();
            break;
          }
        }
        if (last || this.isLimitHit) {
          done();
        }
        return;
      }
      this.addDirectoryEntries(folderQuery, tree, rootFolder, relativeFiles, onResult);
      if (last) {
        this.matchDirectoryTree(tree, rootFolder, onResult);
        done();
      }
    });
  }
  /**
   * Public for testing.
   */
  spawnFindCmd(folderQuery) {
    const excludePattern = this.folderExcludePatterns.get(folderQuery.folder.fsPath);
    const basenames = excludePattern.getBasenameTerms();
    const pathTerms = excludePattern.getPathTerms();
    const args = ["-L", "."];
    if (basenames.length || pathTerms.length) {
      args.push("-not", "(", "(");
      for (const basename of basenames) {
        args.push("-name", basename);
        args.push("-o");
      }
      for (const path2 of pathTerms) {
        args.push("-path", path2);
        args.push("-o");
      }
      args.pop();
      args.push(")", "-prune", ")");
    }
    args.push("-type", "f");
    return childProcess.spawn("find", args, { cwd: folderQuery.folder.fsPath });
  }
  /**
   * Public for testing.
   */
  readStdout(cmd, encoding, cb) {
    let all = "";
    this.collectStdout(cmd, encoding, () => {
    }, (err, stdout, last) => {
      if (err) {
        cb(err);
        return;
      }
      all += stdout;
      if (last) {
        cb(null, all);
      }
    });
  }
  collectStdout(cmd, encoding, onMessage, cb) {
    let onData = (err, stdout, last) => {
      if (err || last) {
        onData = () => {
        };
        this.cmdSW?.stop();
      }
      cb(err, stdout, last);
    };
    let gotData = false;
    if (cmd.stdout) {
      this.forwardData(cmd.stdout, encoding, onData);
      cmd.stdout.once("data", () => gotData = true);
    } else {
      onMessage({ message: "stdout is null" });
    }
    let stderr;
    if (cmd.stderr) {
      stderr = this.collectData(cmd.stderr);
    } else {
      onMessage({ message: "stderr is null" });
    }
    cmd.on("error", (err) => {
      onData(err);
    });
    cmd.on("close", (code) => {
      let stderrText;
      if (!gotData && (stderrText = this.decodeData(stderr, encoding)) && rgErrorMsgForDisplay(stderrText)) {
        onData(new Error(`command failed with error code ${code}: ${this.decodeData(stderr, encoding)}`));
      } else {
        if (this.exists && code === 0) {
          this.isLimitHit = true;
        }
        onData(null, "", true);
      }
    });
  }
  forwardData(stream, encoding, cb) {
    const decoder = new StringDecoder(encoding);
    stream.on("data", (data) => {
      cb(null, decoder.write(data));
    });
    return decoder;
  }
  collectData(stream) {
    const buffers = [];
    stream.on("data", (data) => {
      buffers.push(data);
    });
    return buffers;
  }
  decodeData(buffers, encoding) {
    const decoder = new StringDecoder(encoding);
    return buffers.map((buffer) => decoder.write(buffer)).join("");
  }
  initDirectoryTree() {
    const tree = {
      rootEntries: [],
      pathToEntries: /* @__PURE__ */ Object.create(null)
    };
    tree.pathToEntries["."] = tree.rootEntries;
    return tree;
  }
  addDirectoryEntries(folderQuery, { pathToEntries }, base, relativeFiles, onResult) {
    const filePatternMatch = this.filePattern && relativeFiles.find((f) => strings.equals(f, this.filePattern, this.config.ignoreGlobCase));
    if (filePatternMatch) {
      this.matchFile(onResult, {
        base,
        relativePath: filePatternMatch,
        searchPath: this.getSearchPath(folderQuery, filePatternMatch)
      });
    }
    const add = (relativePath) => {
      const basename = path.basename(relativePath);
      const dirname = path.dirname(relativePath);
      let entries = pathToEntries[dirname];
      if (!entries) {
        entries = pathToEntries[dirname] = [];
        add(dirname);
      }
      entries.push({
        base,
        relativePath,
        basename,
        searchPath: this.getSearchPath(folderQuery, relativePath)
      });
    };
    relativeFiles.forEach(add);
  }
  matchDirectoryTree({ rootEntries, pathToEntries }, rootFolder, onResult) {
    const self = this;
    const excludePattern = this.folderExcludePatterns.get(rootFolder);
    const filePattern = this.filePattern;
    const ignoreGlobCase = this.config.ignoreGlobCase;
    function matchDirectory(entries) {
      self.directoriesWalked++;
      const hasSibling = hasSiblingFn(() => entries.map((entry) => entry.basename));
      for (let i = 0, n = entries.length; i < n; i++) {
        const entry = entries[i];
        const { relativePath, basename } = entry;
        if (excludePattern.test(relativePath, basename, !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : void 0)) {
          continue;
        }
        const sub = pathToEntries[relativePath];
        if (sub) {
          matchDirectory(sub);
        } else {
          self.filesWalked++;
          if (strings.equals(relativePath, filePattern, ignoreGlobCase)) {
            continue;
          }
          self.matchFile(onResult, entry);
        }
        if (self.isLimitHit) {
          break;
        }
      }
    }
    matchDirectory(rootEntries);
  }
  getStats() {
    return {
      cmdTime: this.cmdSW.elapsed(),
      fileWalkTime: this.fileWalkSW.elapsed(),
      directoriesWalked: this.directoriesWalked,
      filesWalked: this.filesWalked,
      cmdResultCount: this.cmdResultCount
    };
  }
  doWalk(folderQuery, relativeParentPath, files, onResult, done) {
    const rootFolder = folderQuery.folder;
    const hasSibling = hasSiblingFn(() => files);
    this.parallel(files, (file, clb) => {
      if (this.isCanceled || this.isLimitHit) {
        return clb(null);
      }
      const currentRelativePath = relativeParentPath ? [relativeParentPath, file].join(path.sep) : file;
      if (this.folderExcludePatterns.get(folderQuery.folder.fsPath).test(currentRelativePath, file, !strings.equals(this.config.filePattern, file, this.config.ignoreGlobCase) ? hasSibling : void 0)) {
        return clb(null);
      }
      const currentAbsolutePath = [rootFolder.fsPath, currentRelativePath].join(path.sep);
      fs.lstat(currentAbsolutePath, (error, lstat) => {
        if (error || this.isCanceled || this.isLimitHit) {
          return clb(null);
        }
        this.statLinkIfNeeded(currentAbsolutePath, lstat, (error2, stat) => {
          if (error2 || this.isCanceled || this.isLimitHit) {
            return clb(null);
          }
          if (stat.isDirectory()) {
            this.directoriesWalked++;
            return this.realPathIfNeeded(currentAbsolutePath, lstat, (error3, realpath) => {
              if (error3 || this.isCanceled || this.isLimitHit) {
                return clb(null);
              }
              realpath = realpath || "";
              if (this.walkedPaths[realpath]) {
                return clb(null);
              }
              this.walkedPaths[realpath] = true;
              return Promises.readdir(currentAbsolutePath).then((children) => {
                if (this.isCanceled || this.isLimitHit) {
                  return clb(null);
                }
                this.doWalk(folderQuery, currentRelativePath, children, onResult, (err) => clb(err || null));
              }, (error4) => {
                clb(null);
              });
            });
          } else {
            this.filesWalked++;
            if (strings.equals(currentRelativePath, this.filePattern, this.config.ignoreGlobCase)) {
              return clb(null, void 0);
            }
            if (this.maxFilesize && types.isNumber(stat.size) && stat.size > this.maxFilesize) {
              return clb(null, void 0);
            }
            this.matchFile(onResult, {
              base: rootFolder.fsPath,
              relativePath: currentRelativePath,
              searchPath: this.getSearchPath(folderQuery, currentRelativePath)
            });
          }
          return clb(null, void 0);
        });
      });
    }, (error) => {
      const filteredErrors = error ? arrays.coalesce(error) : error;
      return done(filteredErrors && filteredErrors.length > 0 ? filteredErrors[0] : void 0);
    });
  }
  matchFile(onResult, candidate) {
    if (this.isFileMatch(candidate) && (!this.includePattern || this.includePattern(candidate.relativePath, path.basename(candidate.relativePath)))) {
      this.resultCount++;
      if (this.exists || this.maxResults && this.resultCount > this.maxResults) {
        this.isLimitHit = true;
      }
      if (!this.isLimitHit) {
        onResult(candidate);
      }
    }
  }
  isFileMatch(candidate) {
    if (this.filePattern) {
      if (this.filePattern === "*") {
        return true;
      }
      if (this.normalizedFilePatternLowercase) {
        return isFilePatternMatch(candidate, this.normalizedFilePatternLowercase);
      } else if (this.filePattern) {
        return isFilePatternMatch(candidate, this.filePattern, false, this.config.ignoreGlobCase);
      }
    }
    return true;
  }
  statLinkIfNeeded(path2, lstat, clb) {
    if (lstat.isSymbolicLink()) {
      return fs.stat(path2, clb);
    }
    return clb(null, lstat);
  }
  realPathIfNeeded(path2, lstat, clb) {
    if (lstat.isSymbolicLink()) {
      return fs.realpath(path2, (error, realpath) => {
        if (error) {
          return clb(error);
        }
        return clb(null, realpath);
      });
    }
    return clb(null, path2);
  }
  /**
   * If we're searching for files in multiple workspace folders, then better prepend the
   * name of the workspace folder to the path of the file. This way we'll be able to
   * better filter files that are all on the top of a workspace folder and have all the
   * same name. A typical example are `package.json` or `README.md` files.
   */
  getSearchPath(folderQuery, relativePath) {
    if (folderQuery.folderName) {
      return path.join(folderQuery.folderName, relativePath);
    }
    return relativePath;
  }
}
class Engine {
  constructor(config, numThreads) {
    this.folderQueries = config.folderQueries;
    this.extraFiles = config.extraFileResources || [];
    this.numThreads = numThreads;
    this.walker = new FileWalker(config);
  }
  search(onResult, onProgress, done) {
    this.walker.walk(this.folderQueries, this.extraFiles, this.numThreads, onResult, onProgress, (err, isLimitHit) => {
      done(err, {
        limitHit: isLimitHit,
        stats: this.walker.getStats(),
        messages: []
      });
    });
  }
  cancel() {
    this.walker.cancel();
  }
}
class AbsoluteAndRelativeParsedExpression {
  constructor(expression, root, ignoreCase) {
    this.expression = expression;
    this.root = root;
    this.ignoreCase = ignoreCase;
    this.init(expression);
  }
  /**
   * Split the IExpression into its absolute and relative components, and glob.parse them separately.
   */
  init(expr) {
    let absoluteGlobExpr;
    let relativeGlobExpr;
    Object.keys(expr).filter((key) => expr[key]).forEach((key) => {
      if (path.isAbsolute(key)) {
        absoluteGlobExpr = absoluteGlobExpr || glob.getEmptyExpression();
        absoluteGlobExpr[key] = expr[key];
      } else {
        relativeGlobExpr = relativeGlobExpr || glob.getEmptyExpression();
        relativeGlobExpr[key] = expr[key];
      }
    });
    const globOptions = { trimForExclusions: true, ignoreCase: this.ignoreCase };
    this.absoluteParsedExpr = absoluteGlobExpr && glob.parse(absoluteGlobExpr, globOptions);
    this.relativeParsedExpr = relativeGlobExpr && glob.parse(relativeGlobExpr, globOptions);
  }
  test(_path, basename, hasSibling) {
    return this.relativeParsedExpr && this.relativeParsedExpr(_path, basename, hasSibling) || this.absoluteParsedExpr && this.absoluteParsedExpr(path.join(this.root, _path), basename, hasSibling);
  }
  getBasenameTerms() {
    const basenameTerms = [];
    if (this.absoluteParsedExpr) {
      basenameTerms.push(...glob.getBasenameTerms(this.absoluteParsedExpr));
    }
    if (this.relativeParsedExpr) {
      basenameTerms.push(...glob.getBasenameTerms(this.relativeParsedExpr));
    }
    return basenameTerms;
  }
  getPathTerms() {
    const pathTerms = [];
    if (this.absoluteParsedExpr) {
      pathTerms.push(...glob.getPathTerms(this.absoluteParsedExpr));
    }
    if (this.relativeParsedExpr) {
      pathTerms.push(...glob.getPathTerms(this.relativeParsedExpr));
    }
    return pathTerms;
  }
}
function rgErrorMsgForDisplay(msg) {
  const lines = msg.trim().split("\n");
  const firstLine = lines[0].trim();
  if (firstLine.startsWith("Error parsing regex")) {
    return firstLine;
  }
  if (firstLine.startsWith("regex parse error")) {
    return strings.uppercaseFirstLetter(lines[lines.length - 1].trim());
  }
  if (firstLine.startsWith("error parsing glob") || firstLine.startsWith("unsupported encoding")) {
    return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
  }
  if (firstLine === `Literal '\\n' not allowed.`) {
    return `Literal '\\n' currently not supported`;
  }
  if (firstLine.startsWith("Literal ")) {
    return firstLine;
  }
  return void 0;
}
export {
  Engine,
  FileWalker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9maWxlU2VhcmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY2hpbGRQcm9jZXNzIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFJlYWRhYmxlIH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCB7IFN0cmluZ0RlY29kZXIgfSBmcm9tICdzdHJpbmdfZGVjb2Rlcic7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgKiBhcyBub3JtYWxpemF0aW9uIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25vcm1hbGl6YXRpb24uanMnO1xuaW1wb3J0IHsgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSUZpbGVRdWVyeSwgSUZvbGRlclF1ZXJ5LCBJUHJvZ3Jlc3NNZXNzYWdlLCBJU2VhcmNoRW5naW5lU3RhdHMsIElSYXdGaWxlTWF0Y2gsIElTZWFyY2hFbmdpbmUsIElTZWFyY2hFbmdpbmVTdWNjZXNzLCBpc0ZpbGVQYXR0ZXJuTWF0Y2gsIGhhc1NpYmxpbmdGbiB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgc3Bhd25SaXBncmVwQ21kIH0gZnJvbSAnLi9yaXBncmVwRmlsZVNlYXJjaC5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlUXVlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5cbmludGVyZmFjZSBJRGlyZWN0b3J5RW50cnkgZXh0ZW5kcyBJUmF3RmlsZU1hdGNoIHtcblx0YmFzZTogc3RyaW5nO1xuXHRiYXNlbmFtZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSURpcmVjdG9yeVRyZWUge1xuXHRyb290RW50cmllczogSURpcmVjdG9yeUVudHJ5W107XG5cdHBhdGhUb0VudHJpZXM6IHsgW3JlbGF0aXZlUGF0aDogc3RyaW5nXTogSURpcmVjdG9yeUVudHJ5W10gfTtcbn1cblxuY29uc3Qga2lsbENtZHMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5wcm9jZXNzLm9uKCdleGl0JywgKCkgPT4ge1xuXHRraWxsQ21kcy5mb3JFYWNoKGNtZCA9PiBjbWQoKSk7XG59KTtcblxuZXhwb3J0IGNsYXNzIEZpbGVXYWxrZXIge1xuXHRwcml2YXRlIGNvbmZpZzogSUZpbGVRdWVyeTtcblx0cHJpdmF0ZSBmaWxlUGF0dGVybjogc3RyaW5nO1xuXHRwcml2YXRlIG5vcm1hbGl6ZWRGaWxlUGF0dGVybkxvd2VyY2FzZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaW5jbHVkZVBhdHRlcm46IGdsb2IuUGFyc2VkRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtYXhSZXN1bHRzOiBudW1iZXIgfCBudWxsO1xuXHRwcml2YXRlIGV4aXN0czogYm9vbGVhbjtcblx0cHJpdmF0ZSBtYXhGaWxlc2l6ZTogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaXNMaW1pdEhpdDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZXN1bHRDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIGlzQ2FuY2VsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBmaWxlV2Fsa1NXOiBTdG9wV2F0Y2ggfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBkaXJlY3Rvcmllc1dhbGtlZDogbnVtYmVyO1xuXHRwcml2YXRlIGZpbGVzV2Fsa2VkOiBudW1iZXI7XG5cdHByaXZhdGUgZXJyb3JzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBjbWRTVzogU3RvcFdhdGNoIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY21kUmVzdWx0Q291bnQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBmb2xkZXJFeGNsdWRlUGF0dGVybnM6IE1hcDxzdHJpbmcsIEFic29sdXRlQW5kUmVsYXRpdmVQYXJzZWRFeHByZXNzaW9uPjtcblx0cHJpdmF0ZSBnbG9iYWxFeGNsdWRlUGF0dGVybjogZ2xvYi5QYXJzZWRFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgd2Fsa2VkUGF0aHM6IHsgW3BhdGg6IHN0cmluZ106IGJvb2xlYW4gfTtcblxuXHRjb25zdHJ1Y3Rvcihjb25maWc6IElGaWxlUXVlcnkpIHtcblx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZztcblx0XHR0aGlzLmZpbGVQYXR0ZXJuID0gY29uZmlnLmZpbGVQYXR0ZXJuIHx8ICcnO1xuXHRcdGNvbnN0IGdsb2JPcHRpb25zID0gY29uZmlnLmlnbm9yZUdsb2JDYXNlID8geyBpZ25vcmVDYXNlOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pbmNsdWRlUGF0dGVybiA9IGNvbmZpZy5pbmNsdWRlUGF0dGVybiAmJiBnbG9iLnBhcnNlKGNvbmZpZy5pbmNsdWRlUGF0dGVybiwgZ2xvYk9wdGlvbnMpO1xuXHRcdHRoaXMubWF4UmVzdWx0cyA9IGNvbmZpZy5tYXhSZXN1bHRzIHx8IG51bGw7XG5cdFx0dGhpcy5leGlzdHMgPSAhIWNvbmZpZy5leGlzdHM7XG5cdFx0dGhpcy53YWxrZWRQYXRocyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5yZXN1bHRDb3VudCA9IDA7XG5cdFx0dGhpcy5pc0xpbWl0SGl0ID0gZmFsc2U7XG5cdFx0dGhpcy5kaXJlY3Rvcmllc1dhbGtlZCA9IDA7XG5cdFx0dGhpcy5maWxlc1dhbGtlZCA9IDA7XG5cdFx0dGhpcy5lcnJvcnMgPSBbXTtcblxuXHRcdGlmICh0aGlzLmZpbGVQYXR0ZXJuKSB7XG5cdFx0XHR0aGlzLm5vcm1hbGl6ZWRGaWxlUGF0dGVybkxvd2VyY2FzZSA9IGNvbmZpZy5zaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybiA/IG51bGwgOiBwcmVwYXJlUXVlcnkodGhpcy5maWxlUGF0dGVybikubm9ybWFsaXplZExvd2VyY2FzZTtcblx0XHR9XG5cblx0XHR0aGlzLmdsb2JhbEV4Y2x1ZGVQYXR0ZXJuID0gY29uZmlnLmV4Y2x1ZGVQYXR0ZXJuICYmIGdsb2IucGFyc2UoY29uZmlnLmV4Y2x1ZGVQYXR0ZXJuLCBnbG9iT3B0aW9ucyk7XG5cdFx0dGhpcy5mb2xkZXJFeGNsdWRlUGF0dGVybnMgPSBuZXcgTWFwPHN0cmluZywgQWJzb2x1dGVBbmRSZWxhdGl2ZVBhcnNlZEV4cHJlc3Npb24+KCk7XG5cblx0XHRjb25maWcuZm9sZGVyUXVlcmllcy5mb3JFYWNoKGZvbGRlclF1ZXJ5ID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlckV4Y2x1ZGVFeHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uID0ge307IC8vIHRvZG86IGNvbnNpZGVyIGV4Y2x1ZGUgYmFzZVVSSVxuXG5cdFx0XHRmb2xkZXJRdWVyeS5leGNsdWRlUGF0dGVybj8uZm9yRWFjaChleGNsdWRlUGF0dGVybiA9PiB7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24oZm9sZGVyRXhjbHVkZUV4cHJlc3Npb24sIGV4Y2x1ZGVQYXR0ZXJuLnBhdHRlcm4gfHwge30sIHRoaXMuY29uZmlnLmV4Y2x1ZGVQYXR0ZXJuIHx8IHt9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuPy5sZW5ndGgpIHtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbihmb2xkZXJFeGNsdWRlRXhwcmVzc2lvbiwgdGhpcy5jb25maWcuZXhjbHVkZVBhdHRlcm4gfHwge30pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgZXhjbHVkZXMgZm9yIG90aGVyIHJvb3QgZm9sZGVyc1xuXHRcdFx0Y29uc3QgZnFQYXRoID0gZm9sZGVyUXVlcnkuZm9sZGVyLmZzUGF0aDtcblx0XHRcdGNvbmZpZy5mb2xkZXJRdWVyaWVzXG5cdFx0XHRcdC5tYXAocm9vdEZvbGRlclF1ZXJ5ID0+IHJvb3RGb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoKVxuXHRcdFx0XHQuZmlsdGVyKHJvb3RGb2xkZXIgPT4gcm9vdEZvbGRlciAhPT0gZnFQYXRoKVxuXHRcdFx0XHQuZm9yRWFjaChvdGhlclJvb3RGb2xkZXIgPT4ge1xuXHRcdFx0XHRcdC8vIEV4Y2x1ZGUgbmVzdGVkIHJvb3QgZm9sZGVyc1xuXHRcdFx0XHRcdGlmIChpc0VxdWFsT3JQYXJlbnQob3RoZXJSb290Rm9sZGVyLCBmcVBhdGgsIGNvbmZpZy5pZ25vcmVHbG9iQ2FzZSkpIHtcblx0XHRcdFx0XHRcdGZvbGRlckV4Y2x1ZGVFeHByZXNzaW9uW3BhdGgucmVsYXRpdmUoZnFQYXRoLCBvdGhlclJvb3RGb2xkZXIpXSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5mb2xkZXJFeGNsdWRlUGF0dGVybnMuc2V0KGZxUGF0aCwgbmV3IEFic29sdXRlQW5kUmVsYXRpdmVQYXJzZWRFeHByZXNzaW9uKGZvbGRlckV4Y2x1ZGVFeHByZXNzaW9uLCBmcVBhdGgsIGNvbmZpZy5pZ25vcmVHbG9iQ2FzZSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNDYW5jZWxlZCA9IHRydWU7XG5cdFx0a2lsbENtZHMuZm9yRWFjaChjbWQgPT4gY21kKCkpO1xuXHR9XG5cblx0d2Fsayhmb2xkZXJRdWVyaWVzOiBJRm9sZGVyUXVlcnlbXSwgZXh0cmFGaWxlczogVVJJW10sIG51bVRocmVhZHM6IG51bWJlciB8IHVuZGVmaW5lZCwgb25SZXN1bHQ6IChyZXN1bHQ6IElSYXdGaWxlTWF0Y2gpID0+IHZvaWQsIG9uTWVzc2FnZTogKG1lc3NhZ2U6IElQcm9ncmVzc01lc3NhZ2UpID0+IHZvaWQsIGRvbmU6IChlcnJvcjogRXJyb3IgfCBudWxsLCBpc0xpbWl0SGl0OiBib29sZWFuKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5maWxlV2Fsa1NXID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHQvLyBTdXBwb3J0IHRoYXQgdGhlIGZpbGUgcGF0dGVybiBpcyBhIGZ1bGwgcGF0aCB0byBhIGZpbGUgdGhhdCBleGlzdHNcblx0XHRpZiAodGhpcy5pc0NhbmNlbGVkKSB7XG5cdFx0XHRyZXR1cm4gZG9uZShudWxsLCB0aGlzLmlzTGltaXRIaXQpO1xuXHRcdH1cblxuXHRcdC8vIEZvciBlYWNoIGV4dHJhIGZpbGVcblx0XHRleHRyYUZpbGVzLmZvckVhY2goZXh0cmFGaWxlUGF0aCA9PiB7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUoZXh0cmFGaWxlUGF0aC5mc1BhdGgpO1xuXHRcdFx0aWYgKHRoaXMuZ2xvYmFsRXhjbHVkZVBhdHRlcm4gJiYgdGhpcy5nbG9iYWxFeGNsdWRlUGF0dGVybihleHRyYUZpbGVQYXRoLmZzUGF0aCwgYmFzZW5hbWUpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gZXhjbHVkZWRcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsZTogQ2hlY2sgZm9yIG1hdGNoIG9uIGZpbGUgcGF0dGVybiBhbmQgaW5jbHVkZSBwYXR0ZXJuXG5cdFx0XHR0aGlzLm1hdGNoRmlsZShvblJlc3VsdCwgeyByZWxhdGl2ZVBhdGg6IGV4dHJhRmlsZVBhdGguZnNQYXRoIC8qIG5vIHdvcmtzcGFjZSByZWxhdGl2ZSBwYXRoICovLCBzZWFyY2hQYXRoOiB1bmRlZmluZWQgfSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmNtZFNXID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHQvLyBGb3IgZWFjaCByb290IGZvbGRlclxuXHRcdHRoaXMucGFyYWxsZWw8SUZvbGRlclF1ZXJ5LCB2b2lkPihmb2xkZXJRdWVyaWVzLCAoZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeSwgcm9vdEZvbGRlckRvbmU6IChlcnI6IEVycm9yIHwgbnVsbCwgcmVzdWx0OiB2b2lkKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHR0aGlzLmNhbGwodGhpcy5jbWRUcmF2ZXJzYWwsIHRoaXMsIGZvbGRlclF1ZXJ5LCBudW1UaHJlYWRzLCBvblJlc3VsdCwgb25NZXNzYWdlLCAoZXJyPzogRXJyb3IpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IHRvRXJyb3JNZXNzYWdlKGVycik7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnJvck1lc3NhZ2UpO1xuXHRcdFx0XHRcdHRoaXMuZXJyb3JzLnB1c2goZXJyb3JNZXNzYWdlKTtcblx0XHRcdFx0XHRyb290Rm9sZGVyRG9uZShlcnIsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cm9vdEZvbGRlckRvbmUobnVsbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSwgKGVycm9ycywgX3Jlc3VsdCkgPT4ge1xuXHRcdFx0dGhpcy5maWxlV2Fsa1NXIS5zdG9wKCk7XG5cdFx0XHRjb25zdCBlcnIgPSBlcnJvcnMgPyBhcnJheXMuY29hbGVzY2UoZXJyb3JzKVswXSA6IG51bGw7XG5cdFx0XHRkb25lKGVyciwgdGhpcy5pc0xpbWl0SGl0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcGFyYWxsZWw8VCwgRT4obGlzdDogVFtdLCBmbjogKGl0ZW06IFQsIGNhbGxiYWNrOiAoZXJyOiBFcnJvciB8IG51bGwsIHJlc3VsdDogRSB8IG51bGwpID0+IHZvaWQpID0+IHZvaWQsIGNhbGxiYWNrOiAoZXJyOiBBcnJheTxFcnJvciB8IG51bGw+IHwgbnVsbCwgcmVzdWx0OiBFW10pID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCByZXN1bHRzID0gbmV3IEFycmF5KGxpc3QubGVuZ3RoKTtcblx0XHRjb25zdCBlcnJvcnMgPSBuZXcgQXJyYXk8RXJyb3IgfCBudWxsPihsaXN0Lmxlbmd0aCk7XG5cdFx0bGV0IGRpZEVycm9yT2NjdXIgPSBmYWxzZTtcblx0XHRsZXQgZG9uZUNvdW50ID0gMDtcblxuXHRcdGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwsIFtdKTtcblx0XHR9XG5cblx0XHRsaXN0LmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0XHRmbihpdGVtLCAoZXJyb3IsIHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRkaWRFcnJvck9jY3VyID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXN1bHRzW2luZGV4XSA9IG51bGw7XG5cdFx0XHRcdFx0ZXJyb3JzW2luZGV4XSA9IGVycm9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdHNbaW5kZXhdID0gcmVzdWx0O1xuXHRcdFx0XHRcdGVycm9yc1tpbmRleF0gPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCsrZG9uZUNvdW50ID09PSBsaXN0Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBjYWxsYmFjayhkaWRFcnJvck9jY3VyID8gZXJyb3JzIDogbnVsbCwgcmVzdWx0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxsPEYgZXh0ZW5kcyBGdW5jdGlvbj4oZnVuOiBGLCB0aGF0OiBhbnksIC4uLmFyZ3M6IGFueVtdKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGZ1bi5hcHBseSh0aGF0LCBhcmdzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhcmdzW2FyZ3MubGVuZ3RoIC0gMV0oZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbWRUcmF2ZXJzYWwoZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeSwgbnVtVGhyZWFkczogbnVtYmVyIHwgdW5kZWZpbmVkLCBvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCwgb25NZXNzYWdlOiAobWVzc2FnZTogSVByb2dyZXNzTWVzc2FnZSkgPT4gdm9pZCwgY2I6IChlcnI/OiBFcnJvcikgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJvb3RGb2xkZXIgPSBmb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoO1xuXHRcdGNvbnN0IGlzTWFjID0gcGxhdGZvcm0uaXNNYWNpbnRvc2g7XG5cblx0XHRjb25zdCBraWxsQ21kID0gKCkgPT4gY21kICYmIGNtZC5raWxsKCk7XG5cdFx0a2lsbENtZHMuYWRkKGtpbGxDbWQpO1xuXG5cdFx0bGV0IGRvbmUgPSAoZXJyPzogRXJyb3IpID0+IHtcblx0XHRcdGtpbGxDbWRzLmRlbGV0ZShraWxsQ21kKTtcblx0XHRcdGRvbmUgPSAoKSA9PiB7IH07XG5cdFx0XHRjYihlcnIpO1xuXHRcdH07XG5cdFx0bGV0IGxlZnRvdmVyID0gJyc7XG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMuaW5pdERpcmVjdG9yeVRyZWUoKTtcblxuXHRcdGxldCByaXBncmVwO1xuXHRcdHRyeSB7XG5cdFx0XHRyaXBncmVwID0gYXdhaXQgc3Bhd25SaXBncmVwQ21kKHRoaXMuY29uZmlnLCBmb2xkZXJRdWVyeSwgdGhpcy5jb25maWcuaW5jbHVkZVBhdHRlcm4sIHRoaXMuZm9sZGVyRXhjbHVkZVBhdHRlcm5zLmdldChmb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoKSEuZXhwcmVzc2lvbiwgbnVtVGhyZWFkcyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRkb25lKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogbmV3IEVycm9yKFN0cmluZyhlcnIpKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNtZCA9IHJpcGdyZXAuY21kO1xuXHRcdGNvbnN0IG5vU2libGluZ3NDbGF1c2VzID0gIU9iamVjdC5rZXlzKHJpcGdyZXAuc2libGluZ0NsYXVzZXMpLmxlbmd0aDtcblxuXHRcdGNvbnN0IGVzY2FwZWRBcmdzID0gcmlwZ3JlcC5yZ0FyZ3MuYXJnc1xuXHRcdFx0Lm1hcChhcmcgPT4gYXJnLm1hdGNoKC9eLS8pID8gYXJnIDogYCcke2FyZ30nYClcblx0XHRcdC5qb2luKCcgJyk7XG5cblx0XHRsZXQgcmdDbWQgPSBgJHtyaXBncmVwLnJnRGlza1BhdGh9ICR7ZXNjYXBlZEFyZ3N9XFxuIC0gY3dkOiAke3JpcGdyZXAuY3dkfWA7XG5cdFx0aWYgKHJpcGdyZXAucmdBcmdzLnNpYmxpbmdDbGF1c2VzKSB7XG5cdFx0XHRyZ0NtZCArPSBgXFxuIC0gU2libGluZyBjbGF1c2VzOiAke0pTT04uc3RyaW5naWZ5KHJpcGdyZXAucmdBcmdzLnNpYmxpbmdDbGF1c2VzKX1gO1xuXHRcdH1cblx0XHRvbk1lc3NhZ2UoeyBtZXNzYWdlOiByZ0NtZCB9KTtcblxuXHRcdHRoaXMuY21kUmVzdWx0Q291bnQgPSAwO1xuXHRcdHRoaXMuY29sbGVjdFN0ZG91dChjbWQsICd1dGY4Jywgb25NZXNzYWdlLCAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dD86IHN0cmluZywgbGFzdD86IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0ZG9uZShlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWM6IHVzZXMgTkZEIHVuaWNvZGUgZm9ybSBvbiBkaXNrLCBidXQgd2Ugd2FudCBORkNcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBsZWZ0b3ZlciArIChpc01hYyA/IG5vcm1hbGl6YXRpb24ubm9ybWFsaXplTkZDKHN0ZG91dCB8fCAnJykgOiBzdGRvdXQpO1xuXHRcdFx0Y29uc3QgcmVsYXRpdmVGaWxlcyA9IG5vcm1hbGl6ZWQuc3BsaXQoJ1xcbicpO1xuXG5cdFx0XHRpZiAobGFzdCkge1xuXHRcdFx0XHRjb25zdCBuID0gcmVsYXRpdmVGaWxlcy5sZW5ndGg7XG5cdFx0XHRcdHJlbGF0aXZlRmlsZXNbbiAtIDFdID0gcmVsYXRpdmVGaWxlc1tuIC0gMV0udHJpbSgpO1xuXHRcdFx0XHRpZiAoIXJlbGF0aXZlRmlsZXNbbiAtIDFdKSB7XG5cdFx0XHRcdFx0cmVsYXRpdmVGaWxlcy5wb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGVmdG92ZXIgPSByZWxhdGl2ZUZpbGVzLnBvcCgpIHx8ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVsYXRpdmVGaWxlcy5sZW5ndGggJiYgcmVsYXRpdmVGaWxlc1swXS5pbmRleE9mKCdcXG4nKSAhPT0gLTEpIHtcblx0XHRcdFx0ZG9uZShuZXcgRXJyb3IoJ1NwbGl0dGluZyB1cCBmaWxlcyBmYWlsZWQnKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jbWRSZXN1bHRDb3VudCArPSByZWxhdGl2ZUZpbGVzLmxlbmd0aDtcblxuXHRcdFx0aWYgKG5vU2libGluZ3NDbGF1c2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVsYXRpdmVQYXRoIG9mIHJlbGF0aXZlRmlsZXMpIHtcblx0XHRcdFx0XHR0aGlzLm1hdGNoRmlsZShvblJlc3VsdCwgeyBiYXNlOiByb290Rm9sZGVyLCByZWxhdGl2ZVBhdGgsIHNlYXJjaFBhdGg6IHRoaXMuZ2V0U2VhcmNoUGF0aChmb2xkZXJRdWVyeSwgcmVsYXRpdmVQYXRoKSB9KTtcblx0XHRcdFx0XHRpZiAodGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0XHRraWxsQ21kKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxhc3QgfHwgdGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPOiBPcHRpbWl6ZSBzaWJsaW5ncyBjbGF1c2VzIHdpdGggcmlwZ3JlcCBoZXJlLlxuXHRcdFx0dGhpcy5hZGREaXJlY3RvcnlFbnRyaWVzKGZvbGRlclF1ZXJ5LCB0cmVlLCByb290Rm9sZGVyLCByZWxhdGl2ZUZpbGVzLCBvblJlc3VsdCk7XG5cblx0XHRcdGlmIChsYXN0KSB7XG5cdFx0XHRcdHRoaXMubWF0Y2hEaXJlY3RvcnlUcmVlKHRyZWUsIHJvb3RGb2xkZXIsIG9uUmVzdWx0KTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1YmxpYyBmb3IgdGVzdGluZy5cblx0ICovXG5cdHNwYXduRmluZENtZChmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5KSB7XG5cdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm4gPSB0aGlzLmZvbGRlckV4Y2x1ZGVQYXR0ZXJucy5nZXQoZm9sZGVyUXVlcnkuZm9sZGVyLmZzUGF0aCkhO1xuXHRcdGNvbnN0IGJhc2VuYW1lcyA9IGV4Y2x1ZGVQYXR0ZXJuLmdldEJhc2VuYW1lVGVybXMoKTtcblx0XHRjb25zdCBwYXRoVGVybXMgPSBleGNsdWRlUGF0dGVybi5nZXRQYXRoVGVybXMoKTtcblx0XHRjb25zdCBhcmdzID0gWyctTCcsICcuJ107XG5cdFx0aWYgKGJhc2VuYW1lcy5sZW5ndGggfHwgcGF0aFRlcm1zLmxlbmd0aCkge1xuXHRcdFx0YXJncy5wdXNoKCctbm90JywgJygnLCAnKCcpO1xuXHRcdFx0Zm9yIChjb25zdCBiYXNlbmFtZSBvZiBiYXNlbmFtZXMpIHtcblx0XHRcdFx0YXJncy5wdXNoKCctbmFtZScsIGJhc2VuYW1lKTtcblx0XHRcdFx0YXJncy5wdXNoKCctbycpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhUZXJtcykge1xuXHRcdFx0XHRhcmdzLnB1c2goJy1wYXRoJywgcGF0aCk7XG5cdFx0XHRcdGFyZ3MucHVzaCgnLW8nKTtcblx0XHRcdH1cblx0XHRcdGFyZ3MucG9wKCk7XG5cdFx0XHRhcmdzLnB1c2goJyknLCAnLXBydW5lJywgJyknKTtcblx0XHR9XG5cdFx0YXJncy5wdXNoKCctdHlwZScsICdmJyk7XG5cdFx0cmV0dXJuIGNoaWxkUHJvY2Vzcy5zcGF3bignZmluZCcsIGFyZ3MsIHsgY3dkOiBmb2xkZXJRdWVyeS5mb2xkZXIuZnNQYXRoIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1YmxpYyBmb3IgdGVzdGluZy5cblx0ICovXG5cdHJlYWRTdGRvdXQoY21kOiBjaGlsZFByb2Nlc3MuQ2hpbGRQcm9jZXNzLCBlbmNvZGluZzogQnVmZmVyRW5jb2RpbmcsIGNiOiAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dD86IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGxldCBhbGwgPSAnJztcblx0XHR0aGlzLmNvbGxlY3RTdGRvdXQoY21kLCBlbmNvZGluZywgKCkgPT4geyB9LCAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dD86IHN0cmluZywgbGFzdD86IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0Y2IoZXJyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhbGwgKz0gc3Rkb3V0O1xuXHRcdFx0aWYgKGxhc3QpIHtcblx0XHRcdFx0Y2IobnVsbCwgYWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdFN0ZG91dChjbWQ6IGNoaWxkUHJvY2Vzcy5DaGlsZFByb2Nlc3MsIGVuY29kaW5nOiBCdWZmZXJFbmNvZGluZywgb25NZXNzYWdlOiAobWVzc2FnZTogSVByb2dyZXNzTWVzc2FnZSkgPT4gdm9pZCwgY2I6IChlcnI6IEVycm9yIHwgbnVsbCwgc3Rkb3V0Pzogc3RyaW5nLCBsYXN0PzogYm9vbGVhbikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGxldCBvbkRhdGEgPSAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dD86IHN0cmluZywgbGFzdD86IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChlcnIgfHwgbGFzdCkge1xuXHRcdFx0XHRvbkRhdGEgPSAoKSA9PiB7IH07XG5cblx0XHRcdFx0dGhpcy5jbWRTVz8uc3RvcCgpO1xuXHRcdFx0fVxuXHRcdFx0Y2IoZXJyLCBzdGRvdXQsIGxhc3QpO1xuXHRcdH07XG5cblx0XHRsZXQgZ290RGF0YSA9IGZhbHNlO1xuXHRcdGlmIChjbWQuc3Rkb3V0KSB7XG5cdFx0XHQvLyBTaG91bGQgYmUgbm9uLW51bGwsIGJ1dCAjMzgxOTVcblx0XHRcdHRoaXMuZm9yd2FyZERhdGEoY21kLnN0ZG91dCwgZW5jb2RpbmcsIG9uRGF0YSk7XG5cdFx0XHRjbWQuc3Rkb3V0Lm9uY2UoJ2RhdGEnLCAoKSA9PiBnb3REYXRhID0gdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9uTWVzc2FnZSh7IG1lc3NhZ2U6ICdzdGRvdXQgaXMgbnVsbCcgfSk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0ZGVycjogQnVmZmVyW107XG5cdFx0aWYgKGNtZC5zdGRlcnIpIHtcblx0XHRcdC8vIFNob3VsZCBiZSBub24tbnVsbCwgYnV0ICMzODE5NVxuXHRcdFx0c3RkZXJyID0gdGhpcy5jb2xsZWN0RGF0YShjbWQuc3RkZXJyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b25NZXNzYWdlKHsgbWVzc2FnZTogJ3N0ZGVyciBpcyBudWxsJyB9KTtcblx0XHR9XG5cblx0XHRjbWQub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcblx0XHRcdG9uRGF0YShlcnIpO1xuXHRcdH0pO1xuXG5cdFx0Y21kLm9uKCdjbG9zZScsIChjb2RlOiBudW1iZXIpID0+IHtcblx0XHRcdC8vIHJpcGdyZXAgcmV0dXJucyBjb2RlPTEgd2hlbiBubyByZXN1bHRzIGFyZSBmb3VuZFxuXHRcdFx0bGV0IHN0ZGVyclRleHQ6IHN0cmluZztcblx0XHRcdGlmICghZ290RGF0YSAmJiAoc3RkZXJyVGV4dCA9IHRoaXMuZGVjb2RlRGF0YShzdGRlcnIsIGVuY29kaW5nKSkgJiYgcmdFcnJvck1zZ0ZvckRpc3BsYXkoc3RkZXJyVGV4dCkpIHtcblx0XHRcdFx0b25EYXRhKG5ldyBFcnJvcihgY29tbWFuZCBmYWlsZWQgd2l0aCBlcnJvciBjb2RlICR7Y29kZX06ICR7dGhpcy5kZWNvZGVEYXRhKHN0ZGVyciwgZW5jb2RpbmcpfWApKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4aXN0cyAmJiBjb2RlID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5pc0xpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbkRhdGEobnVsbCwgJycsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3J3YXJkRGF0YShzdHJlYW06IFJlYWRhYmxlLCBlbmNvZGluZzogQnVmZmVyRW5jb2RpbmcsIGNiOiAoZXJyOiBFcnJvciB8IG51bGwsIHN0ZG91dD86IHN0cmluZykgPT4gdm9pZCk6IFN0cmluZ0RlY29kZXIge1xuXHRcdGNvbnN0IGRlY29kZXIgPSBuZXcgU3RyaW5nRGVjb2RlcihlbmNvZGluZyk7XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0Y2IobnVsbCwgZGVjb2Rlci53cml0ZShkYXRhKSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRlY29kZXI7XG5cdH1cblxuXHRwcml2YXRlIGNvbGxlY3REYXRhKHN0cmVhbTogUmVhZGFibGUpOiBCdWZmZXJbXSB7XG5cdFx0Y29uc3QgYnVmZmVyczogQnVmZmVyW10gPSBbXTtcblx0XHRzdHJlYW0ub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHRidWZmZXJzLnB1c2goZGF0YSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGJ1ZmZlcnM7XG5cdH1cblxuXHRwcml2YXRlIGRlY29kZURhdGEoYnVmZmVyczogQnVmZmVyW10sIGVuY29kaW5nOiBCdWZmZXJFbmNvZGluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBTdHJpbmdEZWNvZGVyKGVuY29kaW5nKTtcblx0XHRyZXR1cm4gYnVmZmVycy5tYXAoYnVmZmVyID0+IGRlY29kZXIud3JpdGUoYnVmZmVyKSkuam9pbignJyk7XG5cdH1cblxuXHRwcml2YXRlIGluaXREaXJlY3RvcnlUcmVlKCk6IElEaXJlY3RvcnlUcmVlIHtcblx0XHRjb25zdCB0cmVlOiBJRGlyZWN0b3J5VHJlZSA9IHtcblx0XHRcdHJvb3RFbnRyaWVzOiBbXSxcblx0XHRcdHBhdGhUb0VudHJpZXM6IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHR9O1xuXHRcdHRyZWUucGF0aFRvRW50cmllc1snLiddID0gdHJlZS5yb290RW50cmllcztcblx0XHRyZXR1cm4gdHJlZTtcblx0fVxuXG5cdHByaXZhdGUgYWRkRGlyZWN0b3J5RW50cmllcyhmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5LCB7IHBhdGhUb0VudHJpZXMgfTogSURpcmVjdG9yeVRyZWUsIGJhc2U6IHN0cmluZywgcmVsYXRpdmVGaWxlczogc3RyaW5nW10sIG9uUmVzdWx0OiAocmVzdWx0OiBJUmF3RmlsZU1hdGNoKSA9PiB2b2lkKSB7XG5cdFx0Ly8gU3VwcG9ydCByZWxhdGl2ZSBwYXRocyB0byBmaWxlcyBmcm9tIGEgcm9vdCByZXNvdXJjZSAoaWdub3JlcyBleGNsdWRlcylcblx0XHRjb25zdCBmaWxlUGF0dGVybk1hdGNoID0gdGhpcy5maWxlUGF0dGVybiAmJiByZWxhdGl2ZUZpbGVzLmZpbmQoZiA9PiBzdHJpbmdzLmVxdWFscyhmLCB0aGlzLmZpbGVQYXR0ZXJuLCB0aGlzLmNvbmZpZy5pZ25vcmVHbG9iQ2FzZSkpO1xuXHRcdGlmIChmaWxlUGF0dGVybk1hdGNoKSB7XG5cdFx0XHR0aGlzLm1hdGNoRmlsZShvblJlc3VsdCwge1xuXHRcdFx0XHRiYXNlLFxuXHRcdFx0XHRyZWxhdGl2ZVBhdGg6IGZpbGVQYXR0ZXJuTWF0Y2gsXG5cdFx0XHRcdHNlYXJjaFBhdGg6IHRoaXMuZ2V0U2VhcmNoUGF0aChmb2xkZXJRdWVyeSwgZmlsZVBhdHRlcm5NYXRjaClcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZCA9IChyZWxhdGl2ZVBhdGg6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRjb25zdCBkaXJuYW1lID0gcGF0aC5kaXJuYW1lKHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRsZXQgZW50cmllcyA9IHBhdGhUb0VudHJpZXNbZGlybmFtZV07XG5cdFx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdFx0ZW50cmllcyA9IHBhdGhUb0VudHJpZXNbZGlybmFtZV0gPSBbXTtcblx0XHRcdFx0YWRkKGRpcm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0YmFzZSxcblx0XHRcdFx0cmVsYXRpdmVQYXRoLFxuXHRcdFx0XHRiYXNlbmFtZSxcblx0XHRcdFx0c2VhcmNoUGF0aDogdGhpcy5nZXRTZWFyY2hQYXRoKGZvbGRlclF1ZXJ5LCByZWxhdGl2ZVBhdGgpLFxuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRyZWxhdGl2ZUZpbGVzLmZvckVhY2goYWRkKTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hEaXJlY3RvcnlUcmVlKHsgcm9vdEVudHJpZXMsIHBhdGhUb0VudHJpZXMgfTogSURpcmVjdG9yeVRyZWUsIHJvb3RGb2xkZXI6IHN0cmluZywgb25SZXN1bHQ6IChyZXN1bHQ6IElSYXdGaWxlTWF0Y2gpID0+IHZvaWQpIHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IHRoaXMuZm9sZGVyRXhjbHVkZVBhdHRlcm5zLmdldChyb290Rm9sZGVyKSE7XG5cdFx0Y29uc3QgZmlsZVBhdHRlcm4gPSB0aGlzLmZpbGVQYXR0ZXJuO1xuXHRcdGNvbnN0IGlnbm9yZUdsb2JDYXNlID0gdGhpcy5jb25maWcuaWdub3JlR2xvYkNhc2U7XG5cdFx0ZnVuY3Rpb24gbWF0Y2hEaXJlY3RvcnkoZW50cmllczogSURpcmVjdG9yeUVudHJ5W10pIHtcblx0XHRcdHNlbGYuZGlyZWN0b3JpZXNXYWxrZWQrKztcblx0XHRcdGNvbnN0IGhhc1NpYmxpbmcgPSBoYXNTaWJsaW5nRm4oKCkgPT4gZW50cmllcy5tYXAoZW50cnkgPT4gZW50cnkuYmFzZW5hbWUpKTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBuID0gZW50cmllcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xuXHRcdFx0XHRjb25zdCB7IHJlbGF0aXZlUGF0aCwgYmFzZW5hbWUgfSA9IGVudHJ5O1xuXG5cdFx0XHRcdC8vIENoZWNrIGV4Y2x1ZGUgcGF0dGVyblxuXHRcdFx0XHQvLyBJZiB0aGUgdXNlciBzZWFyY2hlcyBmb3IgdGhlIGV4YWN0IGZpbGUgbmFtZSwgd2UgYWRqdXN0IHRoZSBnbG9iIG1hdGNoaW5nXG5cdFx0XHRcdC8vIHRvIGlnbm9yZSBmaWx0ZXJpbmcgYnkgc2libGluZ3MgYmVjYXVzZSB0aGUgdXNlciBzZWVtcyB0byBrbm93IHdoYXQgdGhleVxuXHRcdFx0XHQvLyBhcmUgc2VhcmNoaW5nIGZvciBhbmQgd2Ugd2FudCB0byBpbmNsdWRlIHRoZSByZXN1bHQgaW4gdGhhdCBjYXNlIGFueXdheVxuXHRcdFx0XHRpZiAoZXhjbHVkZVBhdHRlcm4udGVzdChyZWxhdGl2ZVBhdGgsIGJhc2VuYW1lLCAhc3RyaW5ncy5lcXVhbHMoZmlsZVBhdHRlcm4sIGJhc2VuYW1lLCBpZ25vcmVHbG9iQ2FzZSkgPyBoYXNTaWJsaW5nIDogdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3ViID0gcGF0aFRvRW50cmllc1tyZWxhdGl2ZVBhdGhdO1xuXHRcdFx0XHRpZiAoc3ViKSB7XG5cdFx0XHRcdFx0bWF0Y2hEaXJlY3Rvcnkoc3ViKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWxmLmZpbGVzV2Fsa2VkKys7XG5cdFx0XHRcdFx0aWYgKHN0cmluZ3MuZXF1YWxzKHJlbGF0aXZlUGF0aCwgZmlsZVBhdHRlcm4sIGlnbm9yZUdsb2JDYXNlKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIGlnbm9yZSBmaWxlIGlmIGl0cyBwYXRoIG1hdGNoZXMgd2l0aCB0aGUgZmlsZSBwYXR0ZXJuIGJlY2F1c2UgdGhhdCBpcyBhbHJlYWR5IG1hdGNoZWQgYWJvdmVcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzZWxmLm1hdGNoRmlsZShvblJlc3VsdCwgZW50cnkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNlbGYuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG1hdGNoRGlyZWN0b3J5KHJvb3RFbnRyaWVzKTtcblx0fVxuXG5cdGdldFN0YXRzKCk6IElTZWFyY2hFbmdpbmVTdGF0cyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNtZFRpbWU6IHRoaXMuY21kU1chLmVsYXBzZWQoKSxcblx0XHRcdGZpbGVXYWxrVGltZTogdGhpcy5maWxlV2Fsa1NXIS5lbGFwc2VkKCksXG5cdFx0XHRkaXJlY3Rvcmllc1dhbGtlZDogdGhpcy5kaXJlY3Rvcmllc1dhbGtlZCxcblx0XHRcdGZpbGVzV2Fsa2VkOiB0aGlzLmZpbGVzV2Fsa2VkLFxuXHRcdFx0Y21kUmVzdWx0Q291bnQ6IHRoaXMuY21kUmVzdWx0Q291bnRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkb1dhbGsoZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeSwgcmVsYXRpdmVQYXJlbnRQYXRoOiBzdHJpbmcsIGZpbGVzOiBzdHJpbmdbXSwgb25SZXN1bHQ6IChyZXN1bHQ6IElSYXdGaWxlTWF0Y2gpID0+IHZvaWQsIGRvbmU6IChlcnJvcj86IEVycm9yKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGZvbGRlclF1ZXJ5LmZvbGRlcjtcblxuXHRcdC8vIEV4ZWN1dGUgdGFza3Mgb24gZWFjaCBmaWxlIGluIHBhcmFsbGVsIHRvIG9wdGltaXplIHRocm91Z2hwdXRcblx0XHRjb25zdCBoYXNTaWJsaW5nID0gaGFzU2libGluZ0ZuKCgpID0+IGZpbGVzKTtcblx0XHR0aGlzLnBhcmFsbGVsKGZpbGVzLCAoZmlsZTogc3RyaW5nLCBjbGI6IChlcnJvcjogRXJyb3IgfCBudWxsLCBfPzogYW55KSA9PiB2b2lkKTogdm9pZCA9PiB7XG5cblx0XHRcdC8vIENoZWNrIGNhbmNlbGVkXG5cdFx0XHRpZiAodGhpcy5pc0NhbmNlbGVkIHx8IHRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRyZXR1cm4gY2xiKG51bGwpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBleGNsdWRlIHBhdHRlcm5cblx0XHRcdC8vIElmIHRoZSB1c2VyIHNlYXJjaGVzIGZvciB0aGUgZXhhY3QgZmlsZSBuYW1lLCB3ZSBhZGp1c3QgdGhlIGdsb2IgbWF0Y2hpbmdcblx0XHRcdC8vIHRvIGlnbm9yZSBmaWx0ZXJpbmcgYnkgc2libGluZ3MgYmVjYXVzZSB0aGUgdXNlciBzZWVtcyB0byBrbm93IHdoYXQgdGhleVxuXHRcdFx0Ly8gYXJlIHNlYXJjaGluZyBmb3IgYW5kIHdlIHdhbnQgdG8gaW5jbHVkZSB0aGUgcmVzdWx0IGluIHRoYXQgY2FzZSBhbnl3YXlcblx0XHRcdGNvbnN0IGN1cnJlbnRSZWxhdGl2ZVBhdGggPSByZWxhdGl2ZVBhcmVudFBhdGggPyBbcmVsYXRpdmVQYXJlbnRQYXRoLCBmaWxlXS5qb2luKHBhdGguc2VwKSA6IGZpbGU7XG5cdFx0XHRpZiAodGhpcy5mb2xkZXJFeGNsdWRlUGF0dGVybnMuZ2V0KGZvbGRlclF1ZXJ5LmZvbGRlci5mc1BhdGgpIS50ZXN0KGN1cnJlbnRSZWxhdGl2ZVBhdGgsIGZpbGUsICFzdHJpbmdzLmVxdWFscyh0aGlzLmNvbmZpZy5maWxlUGF0dGVybiwgZmlsZSwgdGhpcy5jb25maWcuaWdub3JlR2xvYkNhc2UpID8gaGFzU2libGluZyA6IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0cmV0dXJuIGNsYihudWxsKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXNlIGxzdGF0IHRvIGRldGVjdCBsaW5rc1xuXHRcdFx0Y29uc3QgY3VycmVudEFic29sdXRlUGF0aCA9IFtyb290Rm9sZGVyLmZzUGF0aCwgY3VycmVudFJlbGF0aXZlUGF0aF0uam9pbihwYXRoLnNlcCk7XG5cdFx0XHRmcy5sc3RhdChjdXJyZW50QWJzb2x1dGVQYXRoLCAoZXJyb3IsIGxzdGF0KSA9PiB7XG5cdFx0XHRcdGlmIChlcnJvciB8fCB0aGlzLmlzQ2FuY2VsZWQgfHwgdGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNsYihudWxsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHRoZSBwYXRoIGlzIGEgbGluaywgd2UgbXVzdCBpbnN0ZWFkIHVzZSBmcy5zdGF0KCkgdG8gZmluZCBvdXQgaWYgdGhlXG5cdFx0XHRcdC8vIGxpbmsgaXMgYSBkaXJlY3Rvcnkgb3Igbm90IGJlY2F1c2UgbHN0YXQgd2lsbCBhbHdheXMgcmV0dXJuIHRoZSBzdGF0IG9mXG5cdFx0XHRcdC8vIHRoZSBsaW5rIHdoaWNoIGlzIGFsd2F5cyBhIGZpbGUuXG5cdFx0XHRcdHRoaXMuc3RhdExpbmtJZk5lZWRlZChjdXJyZW50QWJzb2x1dGVQYXRoLCBsc3RhdCwgKGVycm9yLCBzdGF0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGVycm9yIHx8IHRoaXMuaXNDYW5jZWxlZCB8fCB0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRGlyZWN0b3J5OiBGb2xsb3cgZGlyZWN0b3JpZXNcblx0XHRcdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRpcmVjdG9yaWVzV2Fsa2VkKys7XG5cblx0XHRcdFx0XHRcdC8vIHRvIHJlYWxseSBwcmV2ZW50IGxvb3BzIHdpdGggbGlua3Mgd2UgbmVlZCB0byByZXNvbHZlIHRoZSByZWFsIHBhdGggb2YgdGhlbVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMucmVhbFBhdGhJZk5lZWRlZChjdXJyZW50QWJzb2x1dGVQYXRoLCBsc3RhdCwgKGVycm9yLCByZWFscGF0aCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXJyb3IgfHwgdGhpcy5pc0NhbmNlbGVkIHx8IHRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZWFscGF0aCA9IHJlYWxwYXRoIHx8ICcnO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy53YWxrZWRQYXRoc1tyZWFscGF0aF0pIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gY2xiKG51bGwpOyAvLyBlc2NhcGUgd2hlbiB0aGVyZSBhcmUgY3ljbGVzIChjYW4gaGFwcGVuIHdpdGggc3ltbGlua3MpXG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR0aGlzLndhbGtlZFBhdGhzW3JlYWxwYXRoXSA9IHRydWU7IC8vIHJlbWVtYmVyIGFzIHdhbGtlZFxuXG5cdFx0XHRcdFx0XHRcdC8vIENvbnRpbnVlIHdhbGtpbmdcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2VzLnJlYWRkaXIoY3VycmVudEFic29sdXRlUGF0aCkudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuaXNDYW5jZWxlZCB8fCB0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBjbGIobnVsbCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5kb1dhbGsoZm9sZGVyUXVlcnksIGN1cnJlbnRSZWxhdGl2ZVBhdGgsIGNoaWxkcmVuLCBvblJlc3VsdCwgZXJyID0+IGNsYihlcnIgfHwgbnVsbCkpO1xuXHRcdFx0XHRcdFx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xiKG51bGwpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZpbGU6IENoZWNrIGZvciBtYXRjaCBvbiBmaWxlIHBhdHRlcm4gYW5kIGluY2x1ZGUgcGF0dGVyblxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5maWxlc1dhbGtlZCsrO1xuXHRcdFx0XHRcdFx0aWYgKHN0cmluZ3MuZXF1YWxzKGN1cnJlbnRSZWxhdGl2ZVBhdGgsIHRoaXMuZmlsZVBhdHRlcm4sIHRoaXMuY29uZmlnLmlnbm9yZUdsb2JDYXNlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY2xiKG51bGwsIHVuZGVmaW5lZCk7IC8vIGlnbm9yZSBmaWxlIGlmIGl0cyBwYXRoIG1hdGNoZXMgd2l0aCB0aGUgZmlsZSBwYXR0ZXJuIGJlY2F1c2UgY2hlY2tGaWxlUGF0dGVyblJlbGF0aXZlTWF0Y2goKSB0YWtlcyBjYXJlIG9mIHRob3NlXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLm1heEZpbGVzaXplICYmIHR5cGVzLmlzTnVtYmVyKHN0YXQuc2l6ZSkgJiYgc3RhdC5zaXplID4gdGhpcy5tYXhGaWxlc2l6ZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY2xiKG51bGwsIHVuZGVmaW5lZCk7IC8vIGlnbm9yZSBmaWxlIGlmIG1heCBmaWxlIHNpemUgaXMgaGl0XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMubWF0Y2hGaWxlKG9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0XHRcdGJhc2U6IHJvb3RGb2xkZXIuZnNQYXRoLFxuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZVBhdGg6IGN1cnJlbnRSZWxhdGl2ZVBhdGgsXG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IHRoaXMuZ2V0U2VhcmNoUGF0aChmb2xkZXJRdWVyeSwgY3VycmVudFJlbGF0aXZlUGF0aCksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBVbndpbmRcblx0XHRcdFx0XHRyZXR1cm4gY2xiKG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSwgKGVycm9yOiBBcnJheTxFcnJvciB8IG51bGw+IHwgbnVsbCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgZmlsdGVyZWRFcnJvcnMgPSBlcnJvciA/IGFycmF5cy5jb2FsZXNjZShlcnJvcikgOiBlcnJvcjsgLy8gZmluZCBhbnkgZXJyb3IgYnkgcmVtb3ZpbmcgbnVsbCB2YWx1ZXMgZmlyc3Rcblx0XHRcdHJldHVybiBkb25lKGZpbHRlcmVkRXJyb3JzICYmIGZpbHRlcmVkRXJyb3JzLmxlbmd0aCA+IDAgPyBmaWx0ZXJlZEVycm9yc1swXSA6IHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoRmlsZShvblJlc3VsdDogKHJlc3VsdDogSVJhd0ZpbGVNYXRjaCkgPT4gdm9pZCwgY2FuZGlkYXRlOiBJUmF3RmlsZU1hdGNoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNGaWxlTWF0Y2goY2FuZGlkYXRlKSAmJiAoIXRoaXMuaW5jbHVkZVBhdHRlcm4gfHwgdGhpcy5pbmNsdWRlUGF0dGVybihjYW5kaWRhdGUucmVsYXRpdmVQYXRoLCBwYXRoLmJhc2VuYW1lKGNhbmRpZGF0ZS5yZWxhdGl2ZVBhdGgpKSkpIHtcblx0XHRcdHRoaXMucmVzdWx0Q291bnQrKztcblxuXHRcdFx0aWYgKHRoaXMuZXhpc3RzIHx8ICh0aGlzLm1heFJlc3VsdHMgJiYgdGhpcy5yZXN1bHRDb3VudCA+IHRoaXMubWF4UmVzdWx0cykpIHtcblx0XHRcdFx0dGhpcy5pc0xpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmlzTGltaXRIaXQpIHtcblx0XHRcdFx0b25SZXN1bHQoY2FuZGlkYXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzRmlsZU1hdGNoKGNhbmRpZGF0ZTogSVJhd0ZpbGVNYXRjaCk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIGZvciBzZWFyY2ggcGF0dGVyblxuXHRcdGlmICh0aGlzLmZpbGVQYXR0ZXJuKSB7XG5cdFx0XHRpZiAodGhpcy5maWxlUGF0dGVybiA9PT0gJyonKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBzdXBwb3J0IHRoZSBhbGwtbWF0Y2hpbmcgd2lsZGNhcmRcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubm9ybWFsaXplZEZpbGVQYXR0ZXJuTG93ZXJjYXNlKSB7XG5cdFx0XHRcdHJldHVybiBpc0ZpbGVQYXR0ZXJuTWF0Y2goY2FuZGlkYXRlLCB0aGlzLm5vcm1hbGl6ZWRGaWxlUGF0dGVybkxvd2VyY2FzZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZmlsZVBhdHRlcm4pIHtcblx0XHRcdFx0cmV0dXJuIGlzRmlsZVBhdHRlcm5NYXRjaChjYW5kaWRhdGUsIHRoaXMuZmlsZVBhdHRlcm4sIGZhbHNlLCB0aGlzLmNvbmZpZy5pZ25vcmVHbG9iQ2FzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm8gcGF0dGVybnMgbWVhbnMgd2UgbWF0Y2ggYWxsXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRMaW5rSWZOZWVkZWQocGF0aDogc3RyaW5nLCBsc3RhdDogZnMuU3RhdHMsIGNsYjogKGVycm9yOiBFcnJvciB8IG51bGwsIHN0YXQ6IGZzLlN0YXRzKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKGxzdGF0LmlzU3ltYm9saWNMaW5rKCkpIHtcblx0XHRcdHJldHVybiBmcy5zdGF0KHBhdGgsIGNsYik7IC8vIHN0YXQgdGhlIHRhcmdldCB0aGUgbGluayBwb2ludHMgdG9cblx0XHR9XG5cblx0XHRyZXR1cm4gY2xiKG51bGwsIGxzdGF0KTsgLy8gbm90IGEgbGluaywgc28gdGhlIHN0YXQgaXMgYWxyZWFkeSBvayBmb3IgdXNcblx0fVxuXG5cdHByaXZhdGUgcmVhbFBhdGhJZk5lZWRlZChwYXRoOiBzdHJpbmcsIGxzdGF0OiBmcy5TdGF0cywgY2xiOiAoZXJyb3I6IEVycm9yIHwgbnVsbCwgcmVhbHBhdGg/OiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAobHN0YXQuaXNTeW1ib2xpY0xpbmsoKSkge1xuXHRcdFx0cmV0dXJuIGZzLnJlYWxwYXRoKHBhdGgsIChlcnJvciwgcmVhbHBhdGgpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNsYihlcnJvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY2xiKG51bGwsIHJlYWxwYXRoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjbGIobnVsbCwgcGF0aCk7XG5cdH1cblxuXHQvKipcblx0ICogSWYgd2UncmUgc2VhcmNoaW5nIGZvciBmaWxlcyBpbiBtdWx0aXBsZSB3b3Jrc3BhY2UgZm9sZGVycywgdGhlbiBiZXR0ZXIgcHJlcGVuZCB0aGVcblx0ICogbmFtZSBvZiB0aGUgd29ya3NwYWNlIGZvbGRlciB0byB0aGUgcGF0aCBvZiB0aGUgZmlsZS4gVGhpcyB3YXkgd2UnbGwgYmUgYWJsZSB0b1xuXHQgKiBiZXR0ZXIgZmlsdGVyIGZpbGVzIHRoYXQgYXJlIGFsbCBvbiB0aGUgdG9wIG9mIGEgd29ya3NwYWNlIGZvbGRlciBhbmQgaGF2ZSBhbGwgdGhlXG5cdCAqIHNhbWUgbmFtZS4gQSB0eXBpY2FsIGV4YW1wbGUgYXJlIGBwYWNrYWdlLmpzb25gIG9yIGBSRUFETUUubWRgIGZpbGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRTZWFyY2hQYXRoKGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnksIHJlbGF0aXZlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoZm9sZGVyUXVlcnkuZm9sZGVyTmFtZSkge1xuXHRcdFx0cmV0dXJuIHBhdGguam9pbihmb2xkZXJRdWVyeS5mb2xkZXJOYW1lLCByZWxhdGl2ZVBhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVsYXRpdmVQYXRoO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmdpbmUgaW1wbGVtZW50cyBJU2VhcmNoRW5naW5lPElSYXdGaWxlTWF0Y2g+IHtcblx0cHJpdmF0ZSBmb2xkZXJRdWVyaWVzOiBJRm9sZGVyUXVlcnlbXTtcblx0cHJpdmF0ZSBleHRyYUZpbGVzOiBVUklbXTtcblx0cHJpdmF0ZSB3YWxrZXI6IEZpbGVXYWxrZXI7XG5cdHByaXZhdGUgbnVtVGhyZWFkcz86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihjb25maWc6IElGaWxlUXVlcnksIG51bVRocmVhZHM/OiBudW1iZXIpIHtcblx0XHR0aGlzLmZvbGRlclF1ZXJpZXMgPSBjb25maWcuZm9sZGVyUXVlcmllcztcblx0XHR0aGlzLmV4dHJhRmlsZXMgPSBjb25maWcuZXh0cmFGaWxlUmVzb3VyY2VzIHx8IFtdO1xuXHRcdHRoaXMubnVtVGhyZWFkcyA9IG51bVRocmVhZHM7XG5cblx0XHR0aGlzLndhbGtlciA9IG5ldyBGaWxlV2Fsa2VyKGNvbmZpZyk7XG5cdH1cblxuXHRzZWFyY2gob25SZXN1bHQ6IChyZXN1bHQ6IElSYXdGaWxlTWF0Y2gpID0+IHZvaWQsIG9uUHJvZ3Jlc3M6IChwcm9ncmVzczogSVByb2dyZXNzTWVzc2FnZSkgPT4gdm9pZCwgZG9uZTogKGVycm9yOiBFcnJvciB8IG51bGwsIGNvbXBsZXRlOiBJU2VhcmNoRW5naW5lU3VjY2VzcykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMud2Fsa2VyLndhbGsodGhpcy5mb2xkZXJRdWVyaWVzLCB0aGlzLmV4dHJhRmlsZXMsIHRoaXMubnVtVGhyZWFkcywgb25SZXN1bHQsIG9uUHJvZ3Jlc3MsIChlcnI6IEVycm9yIHwgbnVsbCwgaXNMaW1pdEhpdDogYm9vbGVhbikgPT4ge1xuXHRcdFx0ZG9uZShlcnIsIHtcblx0XHRcdFx0bGltaXRIaXQ6IGlzTGltaXRIaXQsXG5cdFx0XHRcdHN0YXRzOiB0aGlzLndhbGtlci5nZXRTdGF0cygpLFxuXHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLndhbGtlci5jYW5jZWwoKTtcblx0fVxufVxuXG4vKipcbiAqIFRoaXMgY2xhc3MgZXhpc3RzIHRvIHByb3ZpZGUgb25lIGludGVyZmFjZSBvbiB0b3Agb2YgdHdvIFBhcnNlZEV4cHJlc3Npb25zLCBvbmUgZm9yIGFic29sdXRlIGV4cHJlc3Npb25zIGFuZCBvbmUgZm9yIHJlbGF0aXZlIGV4cHJlc3Npb25zLlxuICogVGhlIGFic29sdXRlIGFuZCByZWxhdGl2ZSBleHByZXNzaW9ucyBkb24ndCBcImhhdmVcIiB0byBiZSBrZXB0IHNlcGFyYXRlLCBidXQgdGhpcyBrZWVwcyB1cyBmcm9tIGhhdmluZyB0byBwYXRoLmpvaW4gZXZlcnkgc2luZ2xlXG4gKiBmaWxlIHNlYXJjaGVkLCBpdCdzIG9ubHkgdXNlZCBmb3IgYSB0ZXh0IHNlYXJjaCB3aXRoIGEgc2VhcmNoUGF0aFxuICovXG5jbGFzcyBBYnNvbHV0ZUFuZFJlbGF0aXZlUGFyc2VkRXhwcmVzc2lvbiB7XG5cdHByaXZhdGUgYWJzb2x1dGVQYXJzZWRFeHByOiBnbG9iLlBhcnNlZEV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVsYXRpdmVQYXJzZWRFeHByOiBnbG9iLlBhcnNlZEV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHVibGljIGV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24sIHByaXZhdGUgcm9vdDogc3RyaW5nLCBwcml2YXRlIGlnbm9yZUNhc2U/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5pbml0KGV4cHJlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNwbGl0IHRoZSBJRXhwcmVzc2lvbiBpbnRvIGl0cyBhYnNvbHV0ZSBhbmQgcmVsYXRpdmUgY29tcG9uZW50cywgYW5kIGdsb2IucGFyc2UgdGhlbSBzZXBhcmF0ZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBpbml0KGV4cHI6IGdsb2IuSUV4cHJlc3Npb24pOiB2b2lkIHtcblx0XHRsZXQgYWJzb2x1dGVHbG9iRXhwcjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVsYXRpdmVHbG9iRXhwcjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRPYmplY3Qua2V5cyhleHByKVxuXHRcdFx0LmZpbHRlcihrZXkgPT4gZXhwcltrZXldKVxuXHRcdFx0LmZvckVhY2goa2V5ID0+IHtcblx0XHRcdFx0aWYgKHBhdGguaXNBYnNvbHV0ZShrZXkpKSB7XG5cdFx0XHRcdFx0YWJzb2x1dGVHbG9iRXhwciA9IGFic29sdXRlR2xvYkV4cHIgfHwgZ2xvYi5nZXRFbXB0eUV4cHJlc3Npb24oKTtcblx0XHRcdFx0XHRhYnNvbHV0ZUdsb2JFeHByW2tleV0gPSBleHByW2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVsYXRpdmVHbG9iRXhwciA9IHJlbGF0aXZlR2xvYkV4cHIgfHwgZ2xvYi5nZXRFbXB0eUV4cHJlc3Npb24oKTtcblx0XHRcdFx0XHRyZWxhdGl2ZUdsb2JFeHByW2tleV0gPSBleHByW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0Y29uc3QgZ2xvYk9wdGlvbnMgPSB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlLCBpZ25vcmVDYXNlOiB0aGlzLmlnbm9yZUNhc2UgfTtcblx0XHR0aGlzLmFic29sdXRlUGFyc2VkRXhwciA9IGFic29sdXRlR2xvYkV4cHIgJiYgZ2xvYi5wYXJzZShhYnNvbHV0ZUdsb2JFeHByLCBnbG9iT3B0aW9ucyk7XG5cdFx0dGhpcy5yZWxhdGl2ZVBhcnNlZEV4cHIgPSByZWxhdGl2ZUdsb2JFeHByICYmIGdsb2IucGFyc2UocmVsYXRpdmVHbG9iRXhwciwgZ2xvYk9wdGlvbnMpO1xuXHR9XG5cblx0dGVzdChfcGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZywgaGFzU2libGluZz86IChuYW1lOiBzdHJpbmcpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KTogc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB8IHVuZGVmaW5lZCB8IG51bGwge1xuXHRcdHJldHVybiAodGhpcy5yZWxhdGl2ZVBhcnNlZEV4cHIgJiYgdGhpcy5yZWxhdGl2ZVBhcnNlZEV4cHIoX3BhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSkgfHxcblx0XHRcdCh0aGlzLmFic29sdXRlUGFyc2VkRXhwciAmJiB0aGlzLmFic29sdXRlUGFyc2VkRXhwcihwYXRoLmpvaW4odGhpcy5yb290LCBfcGF0aCksIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSk7XG5cdH1cblxuXHRnZXRCYXNlbmFtZVRlcm1zKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBiYXNlbmFtZVRlcm1zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICh0aGlzLmFic29sdXRlUGFyc2VkRXhwcikge1xuXHRcdFx0YmFzZW5hbWVUZXJtcy5wdXNoKC4uLmdsb2IuZ2V0QmFzZW5hbWVUZXJtcyh0aGlzLmFic29sdXRlUGFyc2VkRXhwcikpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlbGF0aXZlUGFyc2VkRXhwcikge1xuXHRcdFx0YmFzZW5hbWVUZXJtcy5wdXNoKC4uLmdsb2IuZ2V0QmFzZW5hbWVUZXJtcyh0aGlzLnJlbGF0aXZlUGFyc2VkRXhwcikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBiYXNlbmFtZVRlcm1zO1xuXHR9XG5cblx0Z2V0UGF0aFRlcm1zKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBwYXRoVGVybXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRoaXMuYWJzb2x1dGVQYXJzZWRFeHByKSB7XG5cdFx0XHRwYXRoVGVybXMucHVzaCguLi5nbG9iLmdldFBhdGhUZXJtcyh0aGlzLmFic29sdXRlUGFyc2VkRXhwcikpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlbGF0aXZlUGFyc2VkRXhwcikge1xuXHRcdFx0cGF0aFRlcm1zLnB1c2goLi4uZ2xvYi5nZXRQYXRoVGVybXModGhpcy5yZWxhdGl2ZVBhcnNlZEV4cHIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aFRlcm1zO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJnRXJyb3JNc2dGb3JEaXNwbGF5KG1zZzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbGluZXMgPSBtc2cudHJpbSgpLnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgZmlyc3RMaW5lID0gbGluZXNbMF0udHJpbSgpO1xuXG5cdGlmIChmaXJzdExpbmUuc3RhcnRzV2l0aCgnRXJyb3IgcGFyc2luZyByZWdleCcpKSB7XG5cdFx0cmV0dXJuIGZpcnN0TGluZTtcblx0fVxuXG5cdGlmIChmaXJzdExpbmUuc3RhcnRzV2l0aCgncmVnZXggcGFyc2UgZXJyb3InKSkge1xuXHRcdHJldHVybiBzdHJpbmdzLnVwcGVyY2FzZUZpcnN0TGV0dGVyKGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdLnRyaW0oKSk7XG5cdH1cblxuXHRpZiAoZmlyc3RMaW5lLnN0YXJ0c1dpdGgoJ2Vycm9yIHBhcnNpbmcgZ2xvYicpIHx8XG5cdFx0Zmlyc3RMaW5lLnN0YXJ0c1dpdGgoJ3Vuc3VwcG9ydGVkIGVuY29kaW5nJykpIHtcblx0XHQvLyBVcHBlcmNhc2UgZmlyc3QgbGV0dGVyXG5cdFx0cmV0dXJuIGZpcnN0TGluZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGZpcnN0TGluZS5zdWJzdHIoMSk7XG5cdH1cblxuXHRpZiAoZmlyc3RMaW5lID09PSBgTGl0ZXJhbCAnXFxcXG4nIG5vdCBhbGxvd2VkLmApIHtcblx0XHQvLyBJIHdvbid0IGxvY2FsaXplIHRoaXMgYmVjYXVzZSBub25lIG9mIHRoZSBSaXBncmVwIGVycm9yIG1lc3NhZ2VzIGFyZSBsb2NhbGl6ZWRcblx0XHRyZXR1cm4gYExpdGVyYWwgJ1xcXFxuJyBjdXJyZW50bHkgbm90IHN1cHBvcnRlZGA7XG5cdH1cblxuXHRpZiAoZmlyc3RMaW5lLnN0YXJ0c1dpdGgoJ0xpdGVyYWwgJykpIHtcblx0XHQvLyBPdGhlciB1bnN1cHBvcnRlZCBjaGFyc1xuXHRcdHJldHVybiBmaXJzdExpbmU7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxrQkFBa0I7QUFDOUIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksVUFBVTtBQUV0QixTQUFTLHFCQUFxQjtBQUM5QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxVQUFVO0FBQ3RCLFlBQVksbUJBQW1CO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksY0FBYztBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixZQUFZLGFBQWE7QUFDekIsWUFBWSxXQUFXO0FBRXZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTZILG9CQUFvQixvQkFBb0I7QUFDckssU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFZN0IsTUFBTSxXQUFXLG9CQUFJLElBQWdCO0FBQ3JDLFFBQVEsR0FBRyxRQUFRLE1BQU07QUFDeEIsV0FBUyxRQUFRLFNBQU8sSUFBSSxDQUFDO0FBQzlCLENBQUM7QUFFTSxNQUFNLFdBQVc7QUFBQSxFQXVCdkIsWUFBWSxRQUFvQjtBQXBCaEMsU0FBUSxpQ0FBZ0Q7QUFJeEQsU0FBUSxjQUE2QjtBQUdyQyxTQUFRLGFBQWE7QUFDckIsU0FBUSxhQUErQjtBQUl2QyxTQUFRLFFBQTBCO0FBQ2xDLFNBQVEsaUJBQXlCO0FBUWhDLFNBQUssU0FBUztBQUNkLFNBQUssY0FBYyxPQUFPLGVBQWU7QUFDekMsVUFBTSxjQUFjLE9BQU8saUJBQWlCLEVBQUUsWUFBWSxLQUFLLElBQUk7QUFDbkUsU0FBSyxpQkFBaUIsT0FBTyxrQkFBa0IsS0FBSyxNQUFNLE9BQU8sZ0JBQWdCLFdBQVc7QUFDNUYsU0FBSyxhQUFhLE9BQU8sY0FBYztBQUN2QyxTQUFLLFNBQVMsQ0FBQyxDQUFDLE9BQU87QUFDdkIsU0FBSyxjQUFjLHVC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QixNQUFNLFlBQVksS0FBSyxXQUFXO0FBQzNFLFNBQUsscUJBQXFCLG9CQUFvQixLQUFLLE1BQU0sa0JBQWtCLFdBQVc7QUFDdEYsU0FBSyxxQkFBcUIsb0JBQW9CLEtBQUssTUFBTSxrQkFBa0IsV0FBVztBQUFBLEVBQ3ZGO0FBQUEsRUFFQSxLQUFLLE9BQWUsVUFBbUIsWUFBK0c7QUFDckosV0FBUSxLQUFLLHNCQUFzQixLQUFLLG1CQUFtQixPQUFPLFVBQVUsVUFBVSxLQUNwRixLQUFLLHNCQUFzQixLQUFLLG1CQUFtQixLQUFLLEtBQUssS0FBSyxNQUFNLEtBQUssR0FBRyxVQUFVLFVBQVU7QUFBQSxFQUN2RztBQUFBLEVBRUEsbUJBQTZCO0FBQzVCLFVBQU0sZ0JBQTBCLENBQUM7QUFDakMsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixvQkFBYyxLQUFLLEdBQUcsS0FBSyxpQkFBaUIsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQ3JFO0FBRUEsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixvQkFBYyxLQUFLLEdBQUcsS0FBSyxpQkFBaUIsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQ3JFO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGVBQXlCO0FBQ3hCLFVBQU0sWUFBc0IsQ0FBQztBQUM3QixRQUFJLEtBQUssb0JBQW9CO0FBQzVCLGdCQUFVLEtBQUssR0FBRyxLQUFLLGFBQWEsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQzdEO0FBRUEsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixnQkFBVSxLQUFLLEdBQUcsS0FBSyxhQUFhLEtBQUssa0JBQWtCLENBQUM7QUFBQSxJQUM3RDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLHFCQUFxQixLQUFpQztBQUM5RCxRQUFNLFFBQVEsSUFBSSxLQUFLLEVBQUUsTUFBTSxJQUFJO0FBQ25DLFFBQU0sWUFBWSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBRWhDLE1BQUksVUFBVSxXQUFXLHFCQUFxQixHQUFHO0FBQ2hELFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxVQUFVLFdBQVcsbUJBQW1CLEdBQUc7QUFDOUMsV0FBTyxRQUFRLHFCQUFxQixNQUFNLE1BQU0sU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDO0FBQUEsRUFDbkU7QUFFQSxNQUFJLFVBQVUsV0FBVyxvQkFBb0IsS0FDNUMsVUFBVSxXQUFXLHNCQUFzQixHQUFHO0FBRTlDLFdBQU8sVUFBVSxPQUFPLENBQUMsRUFBRSxZQUFZLElBQUksVUFBVSxPQUFPLENBQUM7QUFBQSxFQUM5RDtBQUVBLE1BQUksY0FBYyw4QkFBOEI7QUFFL0MsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLFVBQVUsV0FBVyxVQUFVLEdBQUc7QUFFckMsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbInBhdGgiLCAiZXJyb3IiXQp9Cg==
