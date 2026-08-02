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
import * as arrays from "../../../../base/common/arrays.js";
import * as collections from "../../../../base/common/collections.js";
import * as glob from "../../../../base/common/glob.js";
import { untildify } from "../../../../base/common/labels.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { isEqual, basename, relativePath, isAbsolutePath } from "../../../../base/common/resources.js";
import * as strings from "../../../../base/common/strings.js";
import { assertReturnsDefined, isDefined } from "../../../../base/common/types.js";
import { URI, URI as uri } from "../../../../base/common/uri.js";
import { isMultilineRegexSource } from "../../../../editor/common/model/textModelSearch.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, toWorkspaceFolder, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { IPathService } from "../../path/common/pathService.js";
import { getExcludes, pathIncludedInQuery, QueryType } from "./search.js";
function isISearchPatternBuilder(object) {
  return typeof object === "object" && "uri" in object && "pattern" in object;
}
function globPatternToISearchPatternBuilder(globPattern) {
  if (typeof globPattern === "string") {
    return {
      pattern: globPattern
    };
  }
  return {
    pattern: globPattern.pattern,
    uri: globPattern.baseUri
  };
}
let QueryBuilder = class {
  constructor(configurationService, workspaceContextService, editorGroupsService, logService, pathService, uriIdentityService) {
    this.configurationService = configurationService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupsService = editorGroupsService;
    this.logService = logService;
    this.pathService = pathService;
    this.uriIdentityService = uriIdentityService;
  }
  aiText(contentPattern, folderResources, options = {}) {
    const commonQuery = this.commonQuery(folderResources?.map(toWorkspaceFolder), options);
    return {
      ...commonQuery,
      type: QueryType.aiText,
      contentPattern
    };
  }
  text(contentPattern, folderResources, options = {}) {
    contentPattern = this.getContentPattern(contentPattern, options);
    const commonQuery = this.commonQuery(folderResources?.map(toWorkspaceFolder), options);
    return {
      ...commonQuery,
      type: QueryType.Text,
      contentPattern,
      previewOptions: options.previewOptions,
      maxFileSize: options.maxFileSize,
      surroundingContext: options.surroundingContext,
      userDisabledExcludesAndIgnoreFiles: options.disregardExcludeSettings && options.disregardIgnoreFiles
    };
  }
  /**
   * Adjusts input pattern for config
   */
  getContentPattern(inputPattern, options) {
    const searchConfig = this.configurationService.getValue();
    if (inputPattern.isRegExp) {
      inputPattern.pattern = inputPattern.pattern.replace(/\r?\n/g, "\\n");
    }
    const newPattern = {
      ...inputPattern,
      wordSeparators: searchConfig.editor.wordSeparators
    };
    if (this.isCaseSensitive(inputPattern, options)) {
      newPattern.isCaseSensitive = true;
    }
    if (this.isMultiline(inputPattern)) {
      newPattern.isMultiline = true;
    }
    if (options.notebookSearchConfig?.includeMarkupInput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookMarkdownInput = options.notebookSearchConfig.includeMarkupInput;
    }
    if (options.notebookSearchConfig?.includeMarkupPreview) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookMarkdownPreview = options.notebookSearchConfig.includeMarkupPreview;
    }
    if (options.notebookSearchConfig?.includeCodeInput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookCellInput = options.notebookSearchConfig.includeCodeInput;
    }
    if (options.notebookSearchConfig?.includeOutput) {
      if (!newPattern.notebookInfo) {
        newPattern.notebookInfo = {};
      }
      newPattern.notebookInfo.isInNotebookCellOutput = options.notebookSearchConfig.includeOutput;
    }
    return newPattern;
  }
  file(folders, options = {}) {
    const commonQuery = this.commonQuery(folders, options);
    return {
      ...commonQuery,
      type: QueryType.File,
      filePattern: options.filePattern ? options.filePattern.trim() : options.filePattern,
      exists: options.exists,
      sortByScore: options.sortByScore,
      cacheKey: options.cacheKey,
      shouldGlobMatchFilePattern: options.shouldGlobSearch
    };
  }
  handleIncludeExclude(pattern, expandPatterns) {
    if (!pattern) {
      return {};
    }
    if (Array.isArray(pattern)) {
      pattern = pattern.filter((p) => p.length > 0).map(normalizeSlashes);
      if (!pattern.length) {
        return {};
      }
    } else {
      pattern = normalizeSlashes(pattern);
    }
    return expandPatterns ? this.parseSearchPaths(pattern) : { pattern: patternListToIExpression(...Array.isArray(pattern) ? pattern : [pattern]) };
  }
  commonQuery(folderResources = [], options = {}) {
    let excludePatterns = Array.isArray(options.excludePattern) ? options.excludePattern.map((p) => p.pattern).flat() : options.excludePattern;
    excludePatterns = excludePatterns?.length === 1 ? excludePatterns[0] : excludePatterns;
    const includeSearchPathsInfo = this.handleIncludeExclude(options.includePattern, options.expandPatterns);
    const excludeSearchPathsInfo = this.handleIncludeExclude(excludePatterns, options.expandPatterns);
    const includeFolderName = folderResources.length > 1;
    const folderQueries = (includeSearchPathsInfo.searchPaths && includeSearchPathsInfo.searchPaths.length ? includeSearchPathsInfo.searchPaths.map((searchPath) => this.getFolderQueryForSearchPath(searchPath, options, excludeSearchPathsInfo)) : folderResources.map((folder) => this.getFolderQueryForRoot(folder, options, excludeSearchPathsInfo, includeFolderName))).filter((query) => !!query);
    const queryProps = {
      _reason: options._reason,
      folderQueries,
      usingSearchPaths: !!(includeSearchPathsInfo.searchPaths && includeSearchPathsInfo.searchPaths.length),
      extraFileResources: options.extraFileResources,
      excludePattern: excludeSearchPathsInfo.pattern,
      includePattern: includeSearchPathsInfo.pattern,
      ignoreGlobCase: options.ignoreGlobCase,
      onlyOpenEditors: options.onlyOpenEditors,
      maxResults: options.maxResults,
      onlyFileScheme: options.onlyFileScheme
    };
    if (options.onlyOpenEditors) {
      const openEditors = arrays.coalesce(this.editorGroupsService.groups.flatMap((group) => group.editors.map((editor) => editor.resource)));
      this.logService.trace("QueryBuilder#commonQuery - openEditor URIs", JSON.stringify(openEditors));
      const openEditorsInQuery = openEditors.filter((editor) => pathIncludedInQuery(queryProps, editor.fsPath));
      const openEditorsQueryProps = this.commonQueryFromFileList(openEditorsInQuery);
      this.logService.trace("QueryBuilder#commonQuery - openEditor Query", JSON.stringify(openEditorsQueryProps));
      return { ...queryProps, ...openEditorsQueryProps };
    }
    if (options.changedFileUris !== void 0) {
      const changedFilesInQuery = options.changedFileUris.filter((uri2) => pathIncludedInQuery(queryProps, uri2.fsPath));
      const changedFilesQueryProps = this.commonQueryFromFileList(changedFilesInQuery);
      this.logService.trace("QueryBuilder#commonQuery - changedFile Query", JSON.stringify(changedFilesQueryProps));
      return { ...queryProps, ...changedFilesQueryProps };
    }
    const extraFileResources = options.extraFileResources && options.extraFileResources.filter((extraFile) => pathIncludedInQuery(queryProps, extraFile.fsPath));
    queryProps.extraFileResources = extraFileResources && extraFileResources.length ? extraFileResources : void 0;
    return queryProps;
  }
  commonQueryFromFileList(files) {
    const folderQueries = [];
    const foldersToSearch = new ResourceMap();
    const includePattern = {};
    let hasIncludedFile = false;
    files.forEach((file) => {
      if (file.scheme === Schemas.walkThrough) {
        return;
      }
      const providerExists = isAbsolutePath(file);
      if (providerExists) {
        const searchRoot = this.workspaceContextService.getWorkspaceFolder(file)?.uri ?? this.uriIdentityService.extUri.dirname(file);
        let folderQuery = foldersToSearch.get(searchRoot);
        if (!folderQuery) {
          hasIncludedFile = true;
          folderQuery = { folder: searchRoot, includePattern: {} };
          folderQueries.push(folderQuery);
          foldersToSearch.set(searchRoot, folderQuery);
        }
        const relPath = path.relative(searchRoot.fsPath, file.fsPath);
        assertReturnsDefined(folderQuery.includePattern)[escapeGlobPattern(relPath.replace(/\\/g, "/"))] = true;
      } else {
        if (file.fsPath) {
          hasIncludedFile = true;
          includePattern[escapeGlobPattern(file.fsPath)] = true;
        }
      }
    });
    return {
      folderQueries,
      includePattern,
      usingSearchPaths: true,
      excludePattern: hasIncludedFile ? void 0 : { "**/*": true }
    };
  }
  /**
   * Resolve isCaseSensitive flag based on the query and the isSmartCase flag, for search providers that don't support smart case natively.
   */
  isCaseSensitive(contentPattern, options) {
    if (options.isSmartCase) {
      if (contentPattern.isRegExp) {
        if (strings.containsUppercaseCharacter(contentPattern.pattern, true)) {
          return true;
        }
      } else if (strings.containsUppercaseCharacter(contentPattern.pattern)) {
        return true;
      }
    }
    return !!contentPattern.isCaseSensitive;
  }
  isMultiline(contentPattern) {
    if (contentPattern.isMultiline) {
      return true;
    }
    if (contentPattern.isRegExp && isMultilineRegexSource(contentPattern.pattern)) {
      return true;
    }
    if (contentPattern.pattern.indexOf("\n") >= 0) {
      return true;
    }
    return !!contentPattern.isMultiline;
  }
  /**
   * Take the includePattern as seen in the search viewlet, and split into components that look like searchPaths, and
   * glob patterns. Glob patterns are expanded from 'foo/bar' to '{foo/bar/**, **\/foo/bar}.
   *
   * Public for test.
   */
  parseSearchPaths(pattern) {
    const isSearchPath = (segment) => {
      return path.isAbsolute(segment) || /^\.\.?([\/\\]|$)/.test(segment);
    };
    const patterns = Array.isArray(pattern) ? pattern : splitGlobPattern(pattern);
    const segments = patterns.map((segment) => {
      const userHome = this.pathService.resolvedUserHome;
      if (userHome) {
        return untildify(segment, userHome.scheme === Schemas.file ? userHome.fsPath : userHome.path);
      }
      return segment;
    });
    const groups = collections.groupBy(
      segments,
      (segment) => isSearchPath(segment) ? "searchPaths" : "exprSegments"
    );
    const expandedExprSegments = (groups.exprSegments || []).map((s) => strings.rtrim(s, "/")).map((s) => strings.rtrim(s, "\\")).map((p) => {
      if (p[0] === ".") {
        p = "*" + p;
      }
      return expandGlobalGlob(p);
    });
    const result = {};
    const searchPaths = this.expandSearchPathPatterns(groups.searchPaths || []);
    if (searchPaths && searchPaths.length) {
      result.searchPaths = searchPaths;
    }
    const exprSegments = expandedExprSegments.flat();
    const includePattern = patternListToIExpression(...exprSegments);
    if (includePattern) {
      result.pattern = includePattern;
    }
    return result;
  }
  getExcludesForFolder(folderConfig, options) {
    return options.disregardExcludeSettings ? void 0 : getExcludes(folderConfig, !options.disregardSearchExcludeSettings);
  }
  /**
   * Split search paths (./ or ../ or absolute paths in the includePatterns) into absolute paths and globs applied to those paths
   */
  expandSearchPathPatterns(searchPaths) {
    if (!searchPaths || !searchPaths.length) {
      return [];
    }
    const expandedSearchPaths = searchPaths.flatMap((searchPath) => {
      let { pathPortion, globPortion } = splitGlobFromPath(searchPath);
      if (globPortion) {
        globPortion = normalizeGlobPattern(globPortion);
      }
      const oneExpanded = this.expandOneSearchPath(pathPortion);
      return oneExpanded.flatMap((oneExpandedResult) => this.resolveOneSearchPathPattern(oneExpandedResult, globPortion));
    });
    const searchPathPatternMap = /* @__PURE__ */ new Map();
    expandedSearchPaths.forEach((oneSearchPathPattern) => {
      const key = oneSearchPathPattern.searchPath.toString();
      const existing = searchPathPatternMap.get(key);
      if (existing) {
        if (oneSearchPathPattern.pattern) {
          existing.pattern = existing.pattern || {};
          existing.pattern[oneSearchPathPattern.pattern] = true;
        }
      } else {
        searchPathPatternMap.set(key, {
          searchPath: oneSearchPathPattern.searchPath,
          pattern: oneSearchPathPattern.pattern ? patternListToIExpression(oneSearchPathPattern.pattern) : void 0
        });
      }
    });
    return Array.from(searchPathPatternMap.values());
  }
  /**
   * Takes a searchPath like `./a/foo` or `../a/foo` and expands it to absolute paths for all the workspaces it matches.
   */
  expandOneSearchPath(searchPath) {
    if (path.isAbsolute(searchPath)) {
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders[0] && workspaceFolders[0].uri.scheme !== Schemas.file) {
        return [{
          searchPath: workspaceFolders[0].uri.with({ path: searchPath })
        }];
      }
      return [{
        searchPath: uri.file(path.normalize(searchPath))
      }];
    }
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceUri = this.workspaceContextService.getWorkspace().folders[0].uri;
      searchPath = normalizeSlashes(searchPath);
      if (searchPath.startsWith("../") || searchPath === "..") {
        const resolvedPath = path.posix.resolve(workspaceUri.path, searchPath);
        return [{
          searchPath: workspaceUri.with({ path: resolvedPath })
        }];
      }
      const cleanedPattern = normalizeGlobPattern(searchPath);
      return [{
        searchPath: workspaceUri,
        pattern: cleanedPattern
      }];
    } else if (searchPath === "./" || searchPath === ".\\") {
      return [];
    } else {
      const searchPathWithoutDotSlash = searchPath.replace(/^\.[\/\\]/, "");
      const folders = this.workspaceContextService.getWorkspace().folders;
      const folderMatches = folders.map((folder) => {
        const match = searchPathWithoutDotSlash.match(new RegExp(`^${strings.escapeRegExpCharacters(folder.name)}(?:/(.*)|$)`));
        return match ? {
          match,
          folder
        } : null;
      }).filter(isDefined);
      if (folderMatches.length) {
        return folderMatches.map((match) => {
          const patternMatch = match.match[1];
          return {
            searchPath: match.folder.uri,
            pattern: patternMatch && normalizeGlobPattern(patternMatch)
          };
        });
      } else {
        const probableWorkspaceFolderNameMatch = searchPath.match(/\.[\/\\](.+)[\/\\]?/);
        const probableWorkspaceFolderName = probableWorkspaceFolderNameMatch ? probableWorkspaceFolderNameMatch[1] : searchPath;
        const searchPathNotFoundError = nls.localize("search.noWorkspaceWithName", "Workspace folder does not exist: {0}", probableWorkspaceFolderName);
        throw new Error(searchPathNotFoundError);
      }
    }
  }
  resolveOneSearchPathPattern(oneExpandedResult, globPortion) {
    const pattern = oneExpandedResult.pattern && globPortion ? `${oneExpandedResult.pattern}/${globPortion}` : oneExpandedResult.pattern || globPortion;
    const results = [
      {
        searchPath: oneExpandedResult.searchPath,
        pattern
      }
    ];
    if (pattern && !pattern.endsWith("**")) {
      results.push({
        searchPath: oneExpandedResult.searchPath,
        pattern: pattern + "/**"
      });
    }
    return results;
  }
  getFolderQueryForSearchPath(searchPath, options, searchPathExcludes) {
    const rootConfig = this.getFolderQueryForRoot(toWorkspaceFolder(searchPath.searchPath), options, searchPathExcludes, false);
    if (!rootConfig) {
      return null;
    }
    return {
      ...rootConfig,
      ...{
        includePattern: searchPath.pattern
      }
    };
  }
  getFolderQueryForRoot(folder, options, searchPathExcludes, includeFolderName) {
    let thisFolderExcludeSearchPathPattern;
    const folderUri = URI.isUri(folder) ? folder : folder.uri;
    let excludeFolderRoots = options.excludePattern?.map((excludePattern2) => {
      const excludeRoot = options.excludePattern && isISearchPatternBuilder(excludePattern2) ? excludePattern2.uri : void 0;
      const shouldUseExcludeRoot = !excludeRoot || !(URI.isUri(folder) && this.uriIdentityService.extUri.isEqual(folder, excludeRoot));
      return shouldUseExcludeRoot ? excludeRoot : void 0;
    });
    if (!excludeFolderRoots?.length) {
      excludeFolderRoots = [void 0];
    }
    if (searchPathExcludes.searchPaths) {
      const thisFolderExcludeSearchPath = searchPathExcludes.searchPaths.filter((sp) => isEqual(sp.searchPath, folderUri))[0];
      if (thisFolderExcludeSearchPath && !thisFolderExcludeSearchPath.pattern) {
        return null;
      } else if (thisFolderExcludeSearchPath) {
        thisFolderExcludeSearchPathPattern = thisFolderExcludeSearchPath.pattern;
      }
    }
    const folderConfig = this.configurationService.getValue({ resource: folderUri });
    const settingExcludes = this.getExcludesForFolder(folderConfig, options);
    const excludePattern = {
      ...settingExcludes || {},
      ...thisFolderExcludeSearchPathPattern || {}
    };
    const folderName = URI.isUri(folder) ? basename(folder) : folder.name;
    const excludePatternRet = excludeFolderRoots.map((excludeFolderRoot) => {
      return Object.keys(excludePattern).length > 0 ? {
        folder: excludeFolderRoot,
        pattern: excludePattern
      } : void 0;
    }).filter((e) => e);
    return {
      folder: folderUri,
      folderName: includeFolderName ? folderName : void 0,
      excludePattern: excludePatternRet,
      fileEncoding: folderConfig.files && folderConfig.files.encoding,
      disregardIgnoreFiles: typeof options.disregardIgnoreFiles === "boolean" ? options.disregardIgnoreFiles : !folderConfig.search?.useIgnoreFiles,
      disregardGlobalIgnoreFiles: typeof options.disregardGlobalIgnoreFiles === "boolean" ? options.disregardGlobalIgnoreFiles : !folderConfig.search?.useGlobalIgnoreFiles,
      disregardParentIgnoreFiles: typeof options.disregardParentIgnoreFiles === "boolean" ? options.disregardParentIgnoreFiles : !folderConfig.search?.useParentIgnoreFiles,
      ignoreSymlinks: typeof options.ignoreSymlinks === "boolean" ? options.ignoreSymlinks : !folderConfig.search?.followSymlinks,
      ignoreGlobCase: options.ignoreGlobCase
    };
  }
};
QueryBuilder = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IEditorGroupsService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IPathService),
  __decorateParam(5, IUriIdentityService)
], QueryBuilder);
function splitGlobFromPath(searchPath) {
  const globCharMatch = searchPath.match(/[\*\{\}\(\)\[\]\?]/);
  if (globCharMatch) {
    const globCharIdx = globCharMatch.index;
    const lastSlashMatch = searchPath.substr(0, globCharIdx).match(/[/|\\][^/\\]*$/);
    if (lastSlashMatch) {
      let pathPortion = searchPath.substr(0, lastSlashMatch.index);
      if (!pathPortion.match(/[/\\]/)) {
        pathPortion += "/";
      }
      return {
        pathPortion,
        globPortion: searchPath.substr((lastSlashMatch.index || 0) + 1)
      };
    }
  }
  return {
    pathPortion: searchPath
  };
}
function patternListToIExpression(...patterns) {
  return patterns.length ? patterns.reduce((glob2, cur) => {
    glob2[cur] = true;
    return glob2;
  }, /* @__PURE__ */ Object.create(null)) : void 0;
}
function splitGlobPattern(pattern) {
  return glob.splitGlobAware(pattern, ",").map((s) => s.trim()).filter((s) => !!s.length);
}
function expandGlobalGlob(pattern) {
  const patterns = [
    `**/${pattern}/**`,
    `**/${pattern}`
  ];
  return patterns.map((p) => p.replace(/\*\*\/\*\*/g, "**"));
}
function normalizeSlashes(pattern) {
  return pattern.replace(/\\/g, "/");
}
function normalizeGlobPattern(pattern) {
  return normalizeSlashes(pattern).replace(/^\.\//, "").replace(/\/+$/g, "");
}
function escapeGlobPattern(path2) {
  return path2.replace(/([?*[\]])/g, "[$1]");
}
function resolveResourcesForSearchIncludes(resources, contextService) {
  resources = arrays.distinct(resources, (resource) => resource.toString());
  const folderPaths = [];
  const workspace = contextService.getWorkspace();
  if (resources) {
    resources.forEach((resource) => {
      let folderPath;
      if (contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
        folderPath = relativePath(workspace.folders[0].uri, resource);
        if (folderPath && folderPath !== ".") {
          folderPath = "./" + folderPath;
        }
      } else {
        const owningFolder = contextService.getWorkspaceFolder(resource);
        if (owningFolder) {
          const owningRootName = owningFolder.name;
          const isUniqueFolder = workspace.folders.filter((folder) => folder.name === owningRootName).length === 1;
          if (isUniqueFolder) {
            const relPath = relativePath(owningFolder.uri, resource);
            if (relPath === "") {
              folderPath = `./${owningFolder.name}`;
            } else {
              folderPath = `./${owningFolder.name}/${relPath}`;
            }
          } else {
            folderPath = resource.fsPath;
          }
        }
      }
      if (folderPath) {
        folderPaths.push(escapeGlobPattern(folderPath));
      }
    });
  }
  return folderPaths;
}
export {
  QueryBuilder,
  escapeGlobPattern,
  globPatternToISearchPatternBuilder,
  isISearchPatternBuilder,
  resolveResourcesForSearchIncludes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3F1ZXJ5QnVpbGRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0ICogYXMgY29sbGVjdGlvbnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IHVudGlsZGlmeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgYmFzZW5hbWUsIHJlbGF0aXZlUGF0aCwgaXNBYnNvbHV0ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkLCBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVSSSBhcyB1cmksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNNdWx0aWxpbmVSZWdleFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyRGF0YSwgdG9Xb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXhjbHVkZUdsb2JQYXR0ZXJuLCBnZXRFeGNsdWRlcywgSUFJVGV4dFF1ZXJ5LCBJQ29tbW9uUXVlcnlQcm9wcywgSUZpbGVRdWVyeSwgSUZvbGRlclF1ZXJ5LCBJUGF0dGVybkluZm8sIElTZWFyY2hDb25maWd1cmF0aW9uLCBJVGV4dFF1ZXJ5LCBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zLCBwYXRoSW5jbHVkZWRJblF1ZXJ5LCBRdWVyeVR5cGUgfSBmcm9tICcuL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBHbG9iUGF0dGVybiB9IGZyb20gJy4vc2VhcmNoRXh0VHlwZXMuanMnO1xuXG4vKipcbiAqIE9uZSBmb2xkZXIgdG8gc2VhcmNoIGFuZCBhIGdsb2IgZXhwcmVzc2lvbiB0aGF0IHNob3VsZCBiZSBhcHBsaWVkLlxuICovXG5pbnRlcmZhY2UgSU9uZVNlYXJjaFBhdGhQYXR0ZXJuIHtcblx0c2VhcmNoUGF0aDogdXJpO1xuXHRwYXR0ZXJuPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIE9uZSBmb2xkZXIgdG8gc2VhcmNoIGFuZCBhIHNldCBvZiBnbG9iIGV4cHJlc3Npb25zIHRoYXQgc2hvdWxkIGJlIGFwcGxpZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFBhdGhQYXR0ZXJuIHtcblx0c2VhcmNoUGF0aDogdXJpO1xuXHRwYXR0ZXJuPzogZ2xvYi5JRXhwcmVzc2lvbjtcbn1cblxudHlwZSBJU2VhcmNoUGF0aFBhdHRlcm5CdWlsZGVyID0gc3RyaW5nIHwgc3RyaW5nW107XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPiB7XG5cdHVyaT86IFU7XG5cdHBhdHRlcm46IElTZWFyY2hQYXRoUGF0dGVybkJ1aWxkZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0lTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cz4ob2JqZWN0OiBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VT4gfCBJU2VhcmNoUGF0aFBhdHRlcm5CdWlsZGVyKTogb2JqZWN0IGlzIElTZWFyY2hQYXR0ZXJuQnVpbGRlcjxVPiB7XG5cdHJldHVybiAodHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgJ3VyaScgaW4gb2JqZWN0ICYmICdwYXR0ZXJuJyBpbiBvYmplY3QpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2xvYlBhdHRlcm5Ub0lTZWFyY2hQYXR0ZXJuQnVpbGRlcihnbG9iUGF0dGVybjogR2xvYlBhdHRlcm4pOiBJU2VhcmNoUGF0dGVybkJ1aWxkZXI8VVJJPiB7XG5cblx0aWYgKHR5cGVvZiBnbG9iUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGF0dGVybjogZ2xvYlBhdHRlcm5cblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRwYXR0ZXJuOiBnbG9iUGF0dGVybi5wYXR0ZXJuLFxuXHRcdHVyaTogZ2xvYlBhdHRlcm4uYmFzZVVyaVxuXHR9O1xufVxuXG4vKipcbiAqIEEgc2V0IG9mIHNlYXJjaCBwYXRocyBhbmQgYSBzZXQgb2YgZ2xvYiBleHByZXNzaW9ucyB0aGF0IHNob3VsZCBiZSBhcHBsaWVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hQYXRoc0luZm8ge1xuXHRzZWFyY2hQYXRocz86IElTZWFyY2hQYXRoUGF0dGVybltdO1xuXHRwYXR0ZXJuPzogZ2xvYi5JRXhwcmVzc2lvbjtcbn1cblxuaW50ZXJmYWNlIElDb21tb25RdWVyeUJ1aWxkZXJPcHRpb25zPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiB7XG5cdF9yZWFzb24/OiBzdHJpbmc7XG5cdGV4Y2x1ZGVQYXR0ZXJuPzogSVNlYXJjaFBhdHRlcm5CdWlsZGVyPFU+W107XG5cdGluY2x1ZGVQYXR0ZXJuPzogSVNlYXJjaFBhdGhQYXR0ZXJuQnVpbGRlcjtcblx0ZXh0cmFGaWxlUmVzb3VyY2VzPzogVVtdO1xuXG5cdC8qKiBQYXJzZSB0aGUgc3BlY2lhbCAuLyBzeW50YXggc3VwcG9ydGVkIGJ5IHRoZSBzZWFyY2h2aWV3LCBhbmQgZXhwYW5kIGZvbyB0byAqKiAvZm9vICovXG5cdGV4cGFuZFBhdHRlcm5zPzogYm9vbGVhbjtcblxuXHRtYXhSZXN1bHRzPzogbnVtYmVyO1xuXHRtYXhGaWxlU2l6ZT86IG51bWJlcjtcblx0ZGlzcmVnYXJkSWdub3JlRmlsZXM/OiBib29sZWFuO1xuXHRkaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlcz86IGJvb2xlYW47XG5cdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0ZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzPzogYm9vbGVhbjtcblx0ZGlzcmVnYXJkU2VhcmNoRXhjbHVkZVNldHRpbmdzPzogYm9vbGVhbjtcblx0aWdub3JlU3ltbGlua3M/OiBib29sZWFuO1xuXHRpZ25vcmVHbG9iQ2FzZT86IGJvb2xlYW47XG5cdG9ubHlPcGVuRWRpdG9ycz86IGJvb2xlYW47XG5cdGNoYW5nZWRGaWxlVXJpcz86IFVSSVtdO1xuXHRvbmx5RmlsZVNjaGVtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiBleHRlbmRzIElDb21tb25RdWVyeUJ1aWxkZXJPcHRpb25zPFU+IHtcblx0ZmlsZVBhdHRlcm4/OiBzdHJpbmc7XG5cdGV4aXN0cz86IGJvb2xlYW47XG5cdHNvcnRCeVNjb3JlPzogYm9vbGVhbjtcblx0Y2FjaGVLZXk/OiBzdHJpbmc7XG5cdHNob3VsZEdsb2JTZWFyY2g/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0UXVlcnlCdWlsZGVyT3B0aW9uczxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cyA9IFVSST4gZXh0ZW5kcyBJQ29tbW9uUXVlcnlCdWlsZGVyT3B0aW9uczxVPiB7XG5cdHByZXZpZXdPcHRpb25zPzogSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucztcblx0ZmlsZUVuY29kaW5nPzogc3RyaW5nO1xuXHRzdXJyb3VuZGluZ0NvbnRleHQ/OiBudW1iZXI7XG5cdGlzU21hcnRDYXNlPzogYm9vbGVhbjtcblx0bm90ZWJvb2tTZWFyY2hDb25maWc/OiB7XG5cdFx0aW5jbHVkZU1hcmt1cElucHV0OiBib29sZWFuO1xuXHRcdGluY2x1ZGVNYXJrdXBQcmV2aWV3OiBib29sZWFuO1xuXHRcdGluY2x1ZGVDb2RlSW5wdXQ6IGJvb2xlYW47XG5cdFx0aW5jbHVkZU91dHB1dDogYm9vbGVhbjtcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIFF1ZXJ5QnVpbGRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRhaVRleHQoY29udGVudFBhdHRlcm46IHN0cmluZywgZm9sZGVyUmVzb3VyY2VzPzogdXJpW10sIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyA9IHt9KTogSUFJVGV4dFF1ZXJ5IHtcblx0XHRjb25zdCBjb21tb25RdWVyeSA9IHRoaXMuY29tbW9uUXVlcnkoZm9sZGVyUmVzb3VyY2VzPy5tYXAodG9Xb3Jrc3BhY2VGb2xkZXIpLCBvcHRpb25zKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uUXVlcnksXG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuYWlUZXh0LFxuXHRcdFx0Y29udGVudFBhdHRlcm4sXG5cdFx0fTtcblx0fVxuXG5cdHRleHQoY29udGVudFBhdHRlcm46IElQYXR0ZXJuSW5mbywgZm9sZGVyUmVzb3VyY2VzPzogdXJpW10sIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyA9IHt9KTogSVRleHRRdWVyeSB7XG5cdFx0Y29udGVudFBhdHRlcm4gPSB0aGlzLmdldENvbnRlbnRQYXR0ZXJuKGNvbnRlbnRQYXR0ZXJuLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IGNvbW1vblF1ZXJ5ID0gdGhpcy5jb21tb25RdWVyeShmb2xkZXJSZXNvdXJjZXM/Lm1hcCh0b1dvcmtzcGFjZUZvbGRlciksIG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb25RdWVyeSxcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0Y29udGVudFBhdHRlcm4sXG5cdFx0XHRwcmV2aWV3T3B0aW9uczogb3B0aW9ucy5wcmV2aWV3T3B0aW9ucyxcblx0XHRcdG1heEZpbGVTaXplOiBvcHRpb25zLm1heEZpbGVTaXplLFxuXHRcdFx0c3Vycm91bmRpbmdDb250ZXh0OiBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCxcblx0XHRcdHVzZXJEaXNhYmxlZEV4Y2x1ZGVzQW5kSWdub3JlRmlsZXM6IG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzICYmIG9wdGlvbnMuZGlzcmVnYXJkSWdub3JlRmlsZXMsXG5cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkanVzdHMgaW5wdXQgcGF0dGVybiBmb3IgY29uZmlnXG5cdCAqL1xuXHRwcml2YXRlIGdldENvbnRlbnRQYXR0ZXJuKGlucHV0UGF0dGVybjogSVBhdHRlcm5JbmZvLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMpOiBJUGF0dGVybkluZm8ge1xuXHRcdGNvbnN0IHNlYXJjaENvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KCk7XG5cblx0XHRpZiAoaW5wdXRQYXR0ZXJuLmlzUmVnRXhwKSB7XG5cdFx0XHRpbnB1dFBhdHRlcm4ucGF0dGVybiA9IGlucHV0UGF0dGVybi5wYXR0ZXJuLnJlcGxhY2UoL1xccj9cXG4vZywgJ1xcXFxuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3UGF0dGVybiA9IHtcblx0XHRcdC4uLmlucHV0UGF0dGVybixcblx0XHRcdHdvcmRTZXBhcmF0b3JzOiBzZWFyY2hDb25maWcuZWRpdG9yLndvcmRTZXBhcmF0b3JzXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLmlzQ2FzZVNlbnNpdGl2ZShpbnB1dFBhdHRlcm4sIG9wdGlvbnMpKSB7XG5cdFx0XHRuZXdQYXR0ZXJuLmlzQ2FzZVNlbnNpdGl2ZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNNdWx0aWxpbmUoaW5wdXRQYXR0ZXJuKSkge1xuXHRcdFx0bmV3UGF0dGVybi5pc011bHRpbGluZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubm90ZWJvb2tTZWFyY2hDb25maWc/LmluY2x1ZGVNYXJrdXBJbnB1dCkge1xuXHRcdFx0aWYgKCFuZXdQYXR0ZXJuLm5vdGVib29rSW5mbykge1xuXHRcdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mbyA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0bmV3UGF0dGVybi5ub3RlYm9va0luZm8uaXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCA9IG9wdGlvbnMubm90ZWJvb2tTZWFyY2hDb25maWcuaW5jbHVkZU1hcmt1cElucHV0O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnPy5pbmNsdWRlTWFya3VwUHJldmlldykge1xuXHRcdFx0aWYgKCFuZXdQYXR0ZXJuLm5vdGVib29rSW5mbykge1xuXHRcdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mbyA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0bmV3UGF0dGVybi5ub3RlYm9va0luZm8uaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3ID0gb3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlTWFya3VwUHJldmlldztcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZz8uaW5jbHVkZUNvZGVJbnB1dCkge1xuXHRcdFx0aWYgKCFuZXdQYXR0ZXJuLm5vdGVib29rSW5mbykge1xuXHRcdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mbyA9IHt9O1xuXHRcdFx0fVxuXHRcdFx0bmV3UGF0dGVybi5ub3RlYm9va0luZm8uaXNJbk5vdGVib29rQ2VsbElucHV0ID0gb3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlQ29kZUlucHV0O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm5vdGVib29rU2VhcmNoQ29uZmlnPy5pbmNsdWRlT3V0cHV0KSB7XG5cdFx0XHRpZiAoIW5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvKSB7XG5cdFx0XHRcdG5ld1BhdHRlcm4ubm90ZWJvb2tJbmZvID0ge307XG5cdFx0XHR9XG5cdFx0XHRuZXdQYXR0ZXJuLm5vdGVib29rSW5mby5pc0luTm90ZWJvb2tDZWxsT3V0cHV0ID0gb3B0aW9ucy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlT3V0cHV0O1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXdQYXR0ZXJuO1xuXHR9XG5cblx0ZmlsZShmb2xkZXJzOiAoSVdvcmtzcGFjZUZvbGRlckRhdGEgfCBVUkkpW10sIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucyA9IHt9KTogSUZpbGVRdWVyeSB7XG5cdFx0Y29uc3QgY29tbW9uUXVlcnkgPSB0aGlzLmNvbW1vblF1ZXJ5KGZvbGRlcnMsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb25RdWVyeSxcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0ZmlsZVBhdHRlcm46IG9wdGlvbnMuZmlsZVBhdHRlcm5cblx0XHRcdFx0PyBvcHRpb25zLmZpbGVQYXR0ZXJuLnRyaW0oKVxuXHRcdFx0XHQ6IG9wdGlvbnMuZmlsZVBhdHRlcm4sXG5cdFx0XHRleGlzdHM6IG9wdGlvbnMuZXhpc3RzLFxuXHRcdFx0c29ydEJ5U2NvcmU6IG9wdGlvbnMuc29ydEJ5U2NvcmUsXG5cdFx0XHRjYWNoZUtleTogb3B0aW9ucy5jYWNoZUtleSxcblx0XHRcdHNob3VsZEdsb2JNYXRjaEZpbGVQYXR0ZXJuOiBvcHRpb25zLnNob3VsZEdsb2JTZWFyY2hcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVJbmNsdWRlRXhjbHVkZShwYXR0ZXJuOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZXhwYW5kUGF0dGVybnM6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBJU2VhcmNoUGF0aHNJbmZvIHtcblx0XHRpZiAoIXBhdHRlcm4pIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXR0ZXJuKSkge1xuXHRcdFx0cGF0dGVybiA9IHBhdHRlcm4uZmlsdGVyKHAgPT4gcC5sZW5ndGggPiAwKS5tYXAobm9ybWFsaXplU2xhc2hlcyk7XG5cdFx0XHRpZiAoIXBhdHRlcm4ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cGF0dGVybiA9IG5vcm1hbGl6ZVNsYXNoZXMocGF0dGVybik7XG5cdFx0fVxuXHRcdHJldHVybiBleHBhbmRQYXR0ZXJuc1xuXHRcdFx0PyB0aGlzLnBhcnNlU2VhcmNoUGF0aHMocGF0dGVybilcblx0XHRcdDogeyBwYXR0ZXJuOiBwYXR0ZXJuTGlzdFRvSUV4cHJlc3Npb24oLi4uKEFycmF5LmlzQXJyYXkocGF0dGVybikgPyBwYXR0ZXJuIDogW3BhdHRlcm5dKSkgfTtcblx0fVxuXG5cdHByaXZhdGUgY29tbW9uUXVlcnkoZm9sZGVyUmVzb3VyY2VzOiAoSVdvcmtzcGFjZUZvbGRlckRhdGEgfCBVUkkpW10gPSBbXSwgb3B0aW9uczogSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnMgPSB7fSk6IElDb21tb25RdWVyeVByb3BzPHVyaT4ge1xuXG5cdFx0bGV0IGV4Y2x1ZGVQYXR0ZXJuczogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQgPSBBcnJheS5pc0FycmF5KG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4pID8gb3B0aW9ucy5leGNsdWRlUGF0dGVybi5tYXAocCA9PiBwLnBhdHRlcm4pLmZsYXQoKSA6IG9wdGlvbnMuZXhjbHVkZVBhdHRlcm47XG5cdFx0ZXhjbHVkZVBhdHRlcm5zID0gZXhjbHVkZVBhdHRlcm5zPy5sZW5ndGggPT09IDEgPyBleGNsdWRlUGF0dGVybnNbMF0gOiBleGNsdWRlUGF0dGVybnM7XG5cdFx0Y29uc3QgaW5jbHVkZVNlYXJjaFBhdGhzSW5mbzogSVNlYXJjaFBhdGhzSW5mbyA9IHRoaXMuaGFuZGxlSW5jbHVkZUV4Y2x1ZGUob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgb3B0aW9ucy5leHBhbmRQYXR0ZXJucyk7XG5cdFx0Y29uc3QgZXhjbHVkZVNlYXJjaFBhdGhzSW5mbzogSVNlYXJjaFBhdGhzSW5mbyA9IHRoaXMuaGFuZGxlSW5jbHVkZUV4Y2x1ZGUoZXhjbHVkZVBhdHRlcm5zLCBvcHRpb25zLmV4cGFuZFBhdHRlcm5zKTtcblxuXHRcdC8vIEJ1aWxkIGZvbGRlclF1ZXJpZXMgZnJvbSBzZWFyY2hQYXRocywgaWYgZ2l2ZW4sIG90aGVyd2lzZSBmb2xkZXJSZXNvdXJjZXNcblx0XHRjb25zdCBpbmNsdWRlRm9sZGVyTmFtZSA9IGZvbGRlclJlc291cmNlcy5sZW5ndGggPiAxO1xuXHRcdGNvbnN0IGZvbGRlclF1ZXJpZXMgPSAoaW5jbHVkZVNlYXJjaFBhdGhzSW5mby5zZWFyY2hQYXRocyAmJiBpbmNsdWRlU2VhcmNoUGF0aHNJbmZvLnNlYXJjaFBhdGhzLmxlbmd0aCA/XG5cdFx0XHRpbmNsdWRlU2VhcmNoUGF0aHNJbmZvLnNlYXJjaFBhdGhzLm1hcChzZWFyY2hQYXRoID0+IHRoaXMuZ2V0Rm9sZGVyUXVlcnlGb3JTZWFyY2hQYXRoKHNlYXJjaFBhdGgsIG9wdGlvbnMsIGV4Y2x1ZGVTZWFyY2hQYXRoc0luZm8pKSA6XG5cdFx0XHRmb2xkZXJSZXNvdXJjZXMubWFwKGZvbGRlciA9PiB0aGlzLmdldEZvbGRlclF1ZXJ5Rm9yUm9vdChmb2xkZXIsIG9wdGlvbnMsIGV4Y2x1ZGVTZWFyY2hQYXRoc0luZm8sIGluY2x1ZGVGb2xkZXJOYW1lKSkpXG5cdFx0XHQuZmlsdGVyKHF1ZXJ5ID0+ICEhcXVlcnkpIGFzIElGb2xkZXJRdWVyeVtdO1xuXG5cdFx0Y29uc3QgcXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8dXJpPiA9IHtcblx0XHRcdF9yZWFzb246IG9wdGlvbnMuX3JlYXNvbixcblx0XHRcdGZvbGRlclF1ZXJpZXMsXG5cdFx0XHR1c2luZ1NlYXJjaFBhdGhzOiAhIShpbmNsdWRlU2VhcmNoUGF0aHNJbmZvLnNlYXJjaFBhdGhzICYmIGluY2x1ZGVTZWFyY2hQYXRoc0luZm8uc2VhcmNoUGF0aHMubGVuZ3RoKSxcblx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogb3B0aW9ucy5leHRyYUZpbGVSZXNvdXJjZXMsXG5cblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBleGNsdWRlU2VhcmNoUGF0aHNJbmZvLnBhdHRlcm4sXG5cdFx0XHRpbmNsdWRlUGF0dGVybjogaW5jbHVkZVNlYXJjaFBhdGhzSW5mby5wYXR0ZXJuLFxuXHRcdFx0aWdub3JlR2xvYkNhc2U6IG9wdGlvbnMuaWdub3JlR2xvYkNhc2UsXG5cdFx0XHRvbmx5T3BlbkVkaXRvcnM6IG9wdGlvbnMub25seU9wZW5FZGl0b3JzLFxuXHRcdFx0bWF4UmVzdWx0czogb3B0aW9ucy5tYXhSZXN1bHRzLFxuXHRcdFx0b25seUZpbGVTY2hlbWU6IG9wdGlvbnMub25seUZpbGVTY2hlbWVcblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMub25seU9wZW5FZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9ycyA9IGFycmF5cy5jb2FsZXNjZSh0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzLmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZWRpdG9ycy5tYXAoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSkpKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUXVlcnlCdWlsZGVyI2NvbW1vblF1ZXJ5IC0gb3BlbkVkaXRvciBVUklzJywgSlNPTi5zdHJpbmdpZnkob3BlbkVkaXRvcnMpKTtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzSW5RdWVyeSA9IG9wZW5FZGl0b3JzLmZpbHRlcihlZGl0b3IgPT4gcGF0aEluY2x1ZGVkSW5RdWVyeShxdWVyeVByb3BzLCBlZGl0b3IuZnNQYXRoKSk7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yc1F1ZXJ5UHJvcHMgPSB0aGlzLmNvbW1vblF1ZXJ5RnJvbUZpbGVMaXN0KG9wZW5FZGl0b3JzSW5RdWVyeSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1F1ZXJ5QnVpbGRlciNjb21tb25RdWVyeSAtIG9wZW5FZGl0b3IgUXVlcnknLCBKU09OLnN0cmluZ2lmeShvcGVuRWRpdG9yc1F1ZXJ5UHJvcHMpKTtcblx0XHRcdHJldHVybiB7IC4uLnF1ZXJ5UHJvcHMsIC4uLm9wZW5FZGl0b3JzUXVlcnlQcm9wcyB9O1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmNoYW5nZWRGaWxlVXJpcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkRmlsZXNJblF1ZXJ5ID0gb3B0aW9ucy5jaGFuZ2VkRmlsZVVyaXMuZmlsdGVyKHVyaSA9PiBwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHMsIHVyaS5mc1BhdGgpKTtcblx0XHRcdGNvbnN0IGNoYW5nZWRGaWxlc1F1ZXJ5UHJvcHMgPSB0aGlzLmNvbW1vblF1ZXJ5RnJvbUZpbGVMaXN0KGNoYW5nZWRGaWxlc0luUXVlcnkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdRdWVyeUJ1aWxkZXIjY29tbW9uUXVlcnkgLSBjaGFuZ2VkRmlsZSBRdWVyeScsIEpTT04uc3RyaW5naWZ5KGNoYW5nZWRGaWxlc1F1ZXJ5UHJvcHMpKTtcblx0XHRcdHJldHVybiB7IC4uLnF1ZXJ5UHJvcHMsIC4uLmNoYW5nZWRGaWxlc1F1ZXJ5UHJvcHMgfTtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgZXh0cmFGaWxlUmVzb3VyY2VzIGFnYWluc3QgZ2xvYmFsIGluY2x1ZGUvZXhjbHVkZSBwYXR0ZXJucyAtIHRoZXkgYXJlIGFscmVhZHkgZXhwZWN0ZWQgdG8gbm90IGJlbG9uZyB0byBhIHdvcmtzcGFjZVxuXHRcdGNvbnN0IGV4dHJhRmlsZVJlc291cmNlcyA9IG9wdGlvbnMuZXh0cmFGaWxlUmVzb3VyY2VzICYmIG9wdGlvbnMuZXh0cmFGaWxlUmVzb3VyY2VzLmZpbHRlcihleHRyYUZpbGUgPT4gcGF0aEluY2x1ZGVkSW5RdWVyeShxdWVyeVByb3BzLCBleHRyYUZpbGUuZnNQYXRoKSk7XG5cdFx0cXVlcnlQcm9wcy5leHRyYUZpbGVSZXNvdXJjZXMgPSBleHRyYUZpbGVSZXNvdXJjZXMgJiYgZXh0cmFGaWxlUmVzb3VyY2VzLmxlbmd0aCA/IGV4dHJhRmlsZVJlc291cmNlcyA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiBxdWVyeVByb3BzO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21tb25RdWVyeUZyb21GaWxlTGlzdChmaWxlczogVVJJW10pOiBJQ29tbW9uUXVlcnlQcm9wczxVUkk+IHtcblx0XHRjb25zdCBmb2xkZXJRdWVyaWVzOiBJRm9sZGVyUXVlcnlbXSA9IFtdO1xuXHRcdGNvbnN0IGZvbGRlcnNUb1NlYXJjaDogUmVzb3VyY2VNYXA8SUZvbGRlclF1ZXJ5PiA9IG5ldyBSZXNvdXJjZU1hcCgpO1xuXHRcdGNvbnN0IGluY2x1ZGVQYXR0ZXJuOiBnbG9iLklFeHByZXNzaW9uID0ge307XG5cdFx0bGV0IGhhc0luY2x1ZGVkRmlsZSA9IGZhbHNlO1xuXHRcdGZpbGVzLmZvckVhY2goZmlsZSA9PiB7XG5cdFx0XHRpZiAoZmlsZS5zY2hlbWUgPT09IFNjaGVtYXMud2Fsa1Rocm91Z2gpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyRXhpc3RzID0gaXNBYnNvbHV0ZVBhdGgoZmlsZSk7XG5cdFx0XHQvLyBTcGVjaWFsIGNhc2UgdXNlcmRhdGEgYXMgd2UgZG9uJ3QgaGF2ZSBhIHNlYXJjaCBwcm92aWRlciBmb3IgaXQsIGJ1dCBpdCBjYW4gYmUgc2VhcmNoZWQuXG5cdFx0XHRpZiAocHJvdmlkZXJFeGlzdHMpIHtcblxuXHRcdFx0XHRjb25zdCBzZWFyY2hSb290ID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoZmlsZSk/LnVyaSA/PyB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShmaWxlKTtcblxuXHRcdFx0XHRsZXQgZm9sZGVyUXVlcnkgPSBmb2xkZXJzVG9TZWFyY2guZ2V0KHNlYXJjaFJvb3QpO1xuXHRcdFx0XHRpZiAoIWZvbGRlclF1ZXJ5KSB7XG5cdFx0XHRcdFx0aGFzSW5jbHVkZWRGaWxlID0gdHJ1ZTtcblx0XHRcdFx0XHRmb2xkZXJRdWVyeSA9IHsgZm9sZGVyOiBzZWFyY2hSb290LCBpbmNsdWRlUGF0dGVybjoge30gfTtcblx0XHRcdFx0XHRmb2xkZXJRdWVyaWVzLnB1c2goZm9sZGVyUXVlcnkpO1xuXHRcdFx0XHRcdGZvbGRlcnNUb1NlYXJjaC5zZXQoc2VhcmNoUm9vdCwgZm9sZGVyUXVlcnkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVsUGF0aCA9IHBhdGgucmVsYXRpdmUoc2VhcmNoUm9vdC5mc1BhdGgsIGZpbGUuZnNQYXRoKTtcblx0XHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQoZm9sZGVyUXVlcnkuaW5jbHVkZVBhdHRlcm4pW2VzY2FwZUdsb2JQYXR0ZXJuKHJlbFBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpKV0gPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGZpbGUuZnNQYXRoKSB7XG5cdFx0XHRcdFx0aGFzSW5jbHVkZWRGaWxlID0gdHJ1ZTtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybltlc2NhcGVHbG9iUGF0dGVybihmaWxlLmZzUGF0aCldID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGZvbGRlclF1ZXJpZXMsXG5cdFx0XHRpbmNsdWRlUGF0dGVybixcblx0XHRcdHVzaW5nU2VhcmNoUGF0aHM6IHRydWUsXG5cdFx0XHRleGNsdWRlUGF0dGVybjogaGFzSW5jbHVkZWRGaWxlID8gdW5kZWZpbmVkIDogeyAnKiovKic6IHRydWUgfVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBpc0Nhc2VTZW5zaXRpdmUgZmxhZyBiYXNlZCBvbiB0aGUgcXVlcnkgYW5kIHRoZSBpc1NtYXJ0Q2FzZSBmbGFnLCBmb3Igc2VhcmNoIHByb3ZpZGVycyB0aGF0IGRvbid0IHN1cHBvcnQgc21hcnQgY2FzZSBuYXRpdmVseS5cblx0ICovXG5cdHByaXZhdGUgaXNDYXNlU2Vuc2l0aXZlKGNvbnRlbnRQYXR0ZXJuOiBJUGF0dGVybkluZm8sIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmIChvcHRpb25zLmlzU21hcnRDYXNlKSB7XG5cdFx0XHRpZiAoY29udGVudFBhdHRlcm4uaXNSZWdFeHApIHtcblx0XHRcdFx0Ly8gQ29uc2lkZXIgaXQgY2FzZSBzZW5zaXRpdmUgaWYgaXQgY29udGFpbnMgYW4gdW5lc2NhcGVkIGNhcGl0YWwgbGV0dGVyXG5cdFx0XHRcdGlmIChzdHJpbmdzLmNvbnRhaW5zVXBwZXJjYXNlQ2hhcmFjdGVyKGNvbnRlbnRQYXR0ZXJuLnBhdHRlcm4sIHRydWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc3RyaW5ncy5jb250YWluc1VwcGVyY2FzZUNoYXJhY3Rlcihjb250ZW50UGF0dGVybi5wYXR0ZXJuKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gISFjb250ZW50UGF0dGVybi5pc0Nhc2VTZW5zaXRpdmU7XG5cdH1cblxuXHRwcml2YXRlIGlzTXVsdGlsaW5lKGNvbnRlbnRQYXR0ZXJuOiBJUGF0dGVybkluZm8pOiBib29sZWFuIHtcblx0XHRpZiAoY29udGVudFBhdHRlcm4uaXNNdWx0aWxpbmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZW50UGF0dGVybi5pc1JlZ0V4cCAmJiBpc011bHRpbGluZVJlZ2V4U291cmNlKGNvbnRlbnRQYXR0ZXJuLnBhdHRlcm4pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoY29udGVudFBhdHRlcm4ucGF0dGVybi5pbmRleE9mKCdcXG4nKSA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISFjb250ZW50UGF0dGVybi5pc011bHRpbGluZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUYWtlIHRoZSBpbmNsdWRlUGF0dGVybiBhcyBzZWVuIGluIHRoZSBzZWFyY2ggdmlld2xldCwgYW5kIHNwbGl0IGludG8gY29tcG9uZW50cyB0aGF0IGxvb2sgbGlrZSBzZWFyY2hQYXRocywgYW5kXG5cdCAqIGdsb2IgcGF0dGVybnMuIEdsb2IgcGF0dGVybnMgYXJlIGV4cGFuZGVkIGZyb20gJ2Zvby9iYXInIHRvICd7Zm9vL2Jhci8qKiwgKipcXC9mb28vYmFyfS5cblx0ICpcblx0ICogUHVibGljIGZvciB0ZXN0LlxuXHQgKi9cblx0cGFyc2VTZWFyY2hQYXRocyhwYXR0ZXJuOiBzdHJpbmcgfCBzdHJpbmdbXSk6IElTZWFyY2hQYXRoc0luZm8ge1xuXHRcdGNvbnN0IGlzU2VhcmNoUGF0aCA9IChzZWdtZW50OiBzdHJpbmcpID0+IHtcblx0XHRcdC8vIEEgc2VnbWVudCBpcyBhIHNlYXJjaCBwYXRoIGlmIGl0IGlzIGFuIGFic29sdXRlIHBhdGggb3Igc3RhcnRzIHdpdGggLi8sIC4uLywgLlxcLCBvciAuLlxcXG5cdFx0XHRyZXR1cm4gcGF0aC5pc0Fic29sdXRlKHNlZ21lbnQpIHx8IC9eXFwuXFwuPyhbXFwvXFxcXF18JCkvLnRlc3Qoc2VnbWVudCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhdHRlcm5zID0gQXJyYXkuaXNBcnJheShwYXR0ZXJuKSA/IHBhdHRlcm4gOiBzcGxpdEdsb2JQYXR0ZXJuKHBhdHRlcm4pO1xuXHRcdGNvbnN0IHNlZ21lbnRzID0gcGF0dGVybnNcblx0XHRcdC5tYXAoc2VnbWVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IHVzZXJIb21lID0gdGhpcy5wYXRoU2VydmljZS5yZXNvbHZlZFVzZXJIb21lO1xuXHRcdFx0XHRpZiAodXNlckhvbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW50aWxkaWZ5KHNlZ21lbnQsIHVzZXJIb21lLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gdXNlckhvbWUuZnNQYXRoIDogdXNlckhvbWUucGF0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc2VnbWVudDtcblx0XHRcdH0pO1xuXHRcdGNvbnN0IGdyb3VwcyA9IGNvbGxlY3Rpb25zLmdyb3VwQnkoc2VnbWVudHMsXG5cdFx0XHRzZWdtZW50ID0+IGlzU2VhcmNoUGF0aChzZWdtZW50KSA/ICdzZWFyY2hQYXRocycgOiAnZXhwclNlZ21lbnRzJyk7XG5cblx0XHRjb25zdCBleHBhbmRlZEV4cHJTZWdtZW50cyA9IChncm91cHMuZXhwclNlZ21lbnRzIHx8IFtdKVxuXHRcdFx0Lm1hcChzID0+IHN0cmluZ3MucnRyaW0ocywgJy8nKSlcblx0XHRcdC5tYXAocyA9PiBzdHJpbmdzLnJ0cmltKHMsICdcXFxcJykpXG5cdFx0XHQubWFwKHAgPT4ge1xuXHRcdFx0XHRpZiAocFswXSA9PT0gJy4nKSB7XG5cdFx0XHRcdFx0cCA9ICcqJyArIHA7IC8vIGNvbnZlcnQgXCIuanNcIiB0byBcIiouanNcIlxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGV4cGFuZEdsb2JhbEdsb2IocCk7XG5cdFx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVNlYXJjaFBhdGhzSW5mbyA9IHt9O1xuXHRcdGNvbnN0IHNlYXJjaFBhdGhzID0gdGhpcy5leHBhbmRTZWFyY2hQYXRoUGF0dGVybnMoZ3JvdXBzLnNlYXJjaFBhdGhzIHx8IFtdKTtcblx0XHRpZiAoc2VhcmNoUGF0aHMgJiYgc2VhcmNoUGF0aHMubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHQuc2VhcmNoUGF0aHMgPSBzZWFyY2hQYXRocztcblx0XHR9XG5cblx0XHRjb25zdCBleHByU2VnbWVudHMgPSBleHBhbmRlZEV4cHJTZWdtZW50cy5mbGF0KCk7XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm4gPSBwYXR0ZXJuTGlzdFRvSUV4cHJlc3Npb24oLi4uZXhwclNlZ21lbnRzKTtcblx0XHRpZiAoaW5jbHVkZVBhdHRlcm4pIHtcblx0XHRcdHJlc3VsdC5wYXR0ZXJuID0gaW5jbHVkZVBhdHRlcm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXhjbHVkZXNGb3JGb2xkZXIoZm9sZGVyQ29uZmlnOiBJU2VhcmNoQ29uZmlndXJhdGlvbiwgb3B0aW9uczogSUNvbW1vblF1ZXJ5QnVpbGRlck9wdGlvbnMpOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MgP1xuXHRcdFx0dW5kZWZpbmVkIDpcblx0XHRcdGdldEV4Y2x1ZGVzKGZvbGRlckNvbmZpZywgIW9wdGlvbnMuZGlzcmVnYXJkU2VhcmNoRXhjbHVkZVNldHRpbmdzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTcGxpdCBzZWFyY2ggcGF0aHMgKC4vIG9yIC4uLyBvciBhYnNvbHV0ZSBwYXRocyBpbiB0aGUgaW5jbHVkZVBhdHRlcm5zKSBpbnRvIGFic29sdXRlIHBhdGhzIGFuZCBnbG9icyBhcHBsaWVkIHRvIHRob3NlIHBhdGhzXG5cdCAqL1xuXHRwcml2YXRlIGV4cGFuZFNlYXJjaFBhdGhQYXR0ZXJucyhzZWFyY2hQYXRoczogc3RyaW5nW10pOiBJU2VhcmNoUGF0aFBhdHRlcm5bXSB7XG5cdFx0aWYgKCFzZWFyY2hQYXRocyB8fCAhc2VhcmNoUGF0aHMubGVuZ3RoKSB7XG5cdFx0XHQvLyBObyB3b3Jrc3BhY2UgPT4gaWdub3JlIHNlYXJjaCBwYXRoc1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGFuZGVkU2VhcmNoUGF0aHMgPSBzZWFyY2hQYXRocy5mbGF0TWFwKHNlYXJjaFBhdGggPT4ge1xuXHRcdFx0Ly8gMSBvcGVuIGZvbGRlciA9PiBqdXN0IHJlc29sdmUgdGhlIHNlYXJjaCBwYXRocyB0byBhYnNvbHV0ZSBwYXRoc1xuXHRcdFx0bGV0IHsgcGF0aFBvcnRpb24sIGdsb2JQb3J0aW9uIH0gPSBzcGxpdEdsb2JGcm9tUGF0aChzZWFyY2hQYXRoKTtcblxuXHRcdFx0aWYgKGdsb2JQb3J0aW9uKSB7XG5cdFx0XHRcdGdsb2JQb3J0aW9uID0gbm9ybWFsaXplR2xvYlBhdHRlcm4oZ2xvYlBvcnRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmUgcGF0aFBvcnRpb24gdG8gbXVsdGlwbGUgZXhwYW5kZWQgc2VhcmNoIHBhdGhzIChlLmcuIGR1cGxpY2F0ZSBtYXRjaGluZyB3b3Jrc3BhY2UgZm9sZGVycylcblx0XHRcdGNvbnN0IG9uZUV4cGFuZGVkID0gdGhpcy5leHBhbmRPbmVTZWFyY2hQYXRoKHBhdGhQb3J0aW9uKTtcblxuXHRcdFx0Ly8gRXhwYW5kZWQgc2VhcmNoIHBhdGhzIHRvIG11bHRpcGxlIHJlc29sdmVkIHBhdHRlcm5zICh3aXRoICoqIGFuZCB3aXRob3V0KVxuXHRcdFx0cmV0dXJuIG9uZUV4cGFuZGVkLmZsYXRNYXAob25lRXhwYW5kZWRSZXN1bHQgPT4gdGhpcy5yZXNvbHZlT25lU2VhcmNoUGF0aFBhdHRlcm4ob25lRXhwYW5kZWRSZXN1bHQsIGdsb2JQb3J0aW9uKSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXRoUGF0dGVybk1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJU2VhcmNoUGF0aFBhdHRlcm4+KCk7XG5cdFx0ZXhwYW5kZWRTZWFyY2hQYXRocy5mb3JFYWNoKG9uZVNlYXJjaFBhdGhQYXR0ZXJuID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IG9uZVNlYXJjaFBhdGhQYXR0ZXJuLnNlYXJjaFBhdGgudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc2VhcmNoUGF0aFBhdHRlcm5NYXAuZ2V0KGtleSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0aWYgKG9uZVNlYXJjaFBhdGhQYXR0ZXJuLnBhdHRlcm4pIHtcblx0XHRcdFx0XHRleGlzdGluZy5wYXR0ZXJuID0gZXhpc3RpbmcucGF0dGVybiB8fCB7fTtcblx0XHRcdFx0XHRleGlzdGluZy5wYXR0ZXJuW29uZVNlYXJjaFBhdGhQYXR0ZXJuLnBhdHRlcm5dID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VhcmNoUGF0aFBhdHRlcm5NYXAuc2V0KGtleSwge1xuXHRcdFx0XHRcdHNlYXJjaFBhdGg6IG9uZVNlYXJjaFBhdGhQYXR0ZXJuLnNlYXJjaFBhdGgsXG5cdFx0XHRcdFx0cGF0dGVybjogb25lU2VhcmNoUGF0aFBhdHRlcm4ucGF0dGVybiA/IHBhdHRlcm5MaXN0VG9JRXhwcmVzc2lvbihvbmVTZWFyY2hQYXRoUGF0dGVybi5wYXR0ZXJuKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBBcnJheS5mcm9tKHNlYXJjaFBhdGhQYXR0ZXJuTWFwLnZhbHVlcygpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUYWtlcyBhIHNlYXJjaFBhdGggbGlrZSBgLi9hL2Zvb2Agb3IgYC4uL2EvZm9vYCBhbmQgZXhwYW5kcyBpdCB0byBhYnNvbHV0ZSBwYXRocyBmb3IgYWxsIHRoZSB3b3Jrc3BhY2VzIGl0IG1hdGNoZXMuXG5cdCAqL1xuXHRwcml2YXRlIGV4cGFuZE9uZVNlYXJjaFBhdGgoc2VhcmNoUGF0aDogc3RyaW5nKTogSU9uZVNlYXJjaFBhdGhQYXR0ZXJuW10ge1xuXHRcdGlmIChwYXRoLmlzQWJzb2x1dGUoc2VhcmNoUGF0aCkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyc1swXSAmJiB3b3Jrc3BhY2VGb2xkZXJzWzBdLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRzZWFyY2hQYXRoOiB3b3Jrc3BhY2VGb2xkZXJzWzBdLnVyaS53aXRoKHsgcGF0aDogc2VhcmNoUGF0aCB9KVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3VycmVudGx5IG9ubHkgbG9jYWwgcmVzb3VyY2VzIGNhbiBiZSBzZWFyY2hlZCBmb3Igd2l0aCBhYnNvbHV0ZSBzZWFyY2ggcGF0aHMuXG5cdFx0XHQvLyBUT0RPIGNvbnZlcnQgdGhpcyB0byBhIHdvcmtzcGFjZSBmb2xkZXIgKyBwYXR0ZXJuLCBzbyBleGNsdWRlcyB3aWxsIGJlIHJlc29sdmVkIHByb3Blcmx5IGZvciBhbiBhYnNvbHV0ZSBwYXRoIGluc2lkZSBhIHdvcmtzcGFjZSBmb2xkZXJcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRzZWFyY2hQYXRoOiB1cmkuZmlsZShwYXRoLm5vcm1hbGl6ZShzZWFyY2hQYXRoKSlcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdLnVyaTtcblxuXHRcdFx0c2VhcmNoUGF0aCA9IG5vcm1hbGl6ZVNsYXNoZXMoc2VhcmNoUGF0aCk7XG5cdFx0XHRpZiAoc2VhcmNoUGF0aC5zdGFydHNXaXRoKCcuLi8nKSB8fCBzZWFyY2hQYXRoID09PSAnLi4nKSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkUGF0aCA9IHBhdGgucG9zaXgucmVzb2x2ZSh3b3Jrc3BhY2VVcmkucGF0aCwgc2VhcmNoUGF0aCk7XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdHNlYXJjaFBhdGg6IHdvcmtzcGFjZVVyaS53aXRoKHsgcGF0aDogcmVzb2x2ZWRQYXRoIH0pXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGVhbmVkUGF0dGVybiA9IG5vcm1hbGl6ZUdsb2JQYXR0ZXJuKHNlYXJjaFBhdGgpO1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHNlYXJjaFBhdGg6IHdvcmtzcGFjZVVyaSxcblx0XHRcdFx0cGF0dGVybjogY2xlYW5lZFBhdHRlcm5cblx0XHRcdH1dO1xuXHRcdH0gZWxzZSBpZiAoc2VhcmNoUGF0aCA9PT0gJy4vJyB8fCBzZWFyY2hQYXRoID09PSAnLlxcXFwnKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIC4vIG9yIC4vKiovZm9vIG1ha2VzIHNlbnNlIGZvciBzaW5nbGUtZm9sZGVyIGJ1dCBub3QgbXVsdGktZm9sZGVyIHdvcmtzcGFjZXNcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2VhcmNoUGF0aFdpdGhvdXREb3RTbGFzaCA9IHNlYXJjaFBhdGgucmVwbGFjZSgvXlxcLltcXC9cXFxcXS8sICcnKTtcblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRjb25zdCBmb2xkZXJNYXRjaGVzID0gZm9sZGVycy5tYXAoZm9sZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBzZWFyY2hQYXRoV2l0aG91dERvdFNsYXNoLm1hdGNoKG5ldyBSZWdFeHAoYF4ke3N0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhmb2xkZXIubmFtZSl9KD86LyguKil8JClgKSk7XG5cdFx0XHRcdHJldHVybiBtYXRjaCA/IHtcblx0XHRcdFx0XHRtYXRjaCxcblx0XHRcdFx0XHRmb2xkZXJcblx0XHRcdFx0fSA6IG51bGw7XG5cdFx0XHR9KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdFx0aWYgKGZvbGRlck1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBmb2xkZXJNYXRjaGVzLm1hcChtYXRjaCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGF0dGVybk1hdGNoID0gbWF0Y2gubWF0Y2hbMV07XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IG1hdGNoLmZvbGRlci51cmksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuTWF0Y2ggJiYgbm9ybWFsaXplR2xvYlBhdHRlcm4ocGF0dGVybk1hdGNoKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcHJvYmFibGVXb3Jrc3BhY2VGb2xkZXJOYW1lTWF0Y2ggPSBzZWFyY2hQYXRoLm1hdGNoKC9cXC5bXFwvXFxcXF0oLispW1xcL1xcXFxdPy8pO1xuXHRcdFx0XHRjb25zdCBwcm9iYWJsZVdvcmtzcGFjZUZvbGRlck5hbWUgPSBwcm9iYWJsZVdvcmtzcGFjZUZvbGRlck5hbWVNYXRjaCA/IHByb2JhYmxlV29ya3NwYWNlRm9sZGVyTmFtZU1hdGNoWzFdIDogc2VhcmNoUGF0aDtcblxuXHRcdFx0XHQvLyBObyByb290IGZvbGRlciB3aXRoIG5hbWVcblx0XHRcdFx0Y29uc3Qgc2VhcmNoUGF0aE5vdEZvdW5kRXJyb3IgPSBubHMubG9jYWxpemUoJ3NlYXJjaC5ub1dvcmtzcGFjZVdpdGhOYW1lJywgXCJXb3Jrc3BhY2UgZm9sZGVyIGRvZXMgbm90IGV4aXN0OiB7MH1cIiwgcHJvYmFibGVXb3Jrc3BhY2VGb2xkZXJOYW1lKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKHNlYXJjaFBhdGhOb3RGb3VuZEVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVPbmVTZWFyY2hQYXRoUGF0dGVybihvbmVFeHBhbmRlZFJlc3VsdDogSU9uZVNlYXJjaFBhdGhQYXR0ZXJuLCBnbG9iUG9ydGlvbj86IHN0cmluZyk6IElPbmVTZWFyY2hQYXRoUGF0dGVybltdIHtcblx0XHRjb25zdCBwYXR0ZXJuID0gb25lRXhwYW5kZWRSZXN1bHQucGF0dGVybiAmJiBnbG9iUG9ydGlvbiA/XG5cdFx0XHRgJHtvbmVFeHBhbmRlZFJlc3VsdC5wYXR0ZXJufS8ke2dsb2JQb3J0aW9ufWAgOlxuXHRcdFx0b25lRXhwYW5kZWRSZXN1bHQucGF0dGVybiB8fCBnbG9iUG9ydGlvbjtcblxuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHNlYXJjaFBhdGg6IG9uZUV4cGFuZGVkUmVzdWx0LnNlYXJjaFBhdGgsXG5cdFx0XHRcdHBhdHRlcm5cblx0XHRcdH1dO1xuXG5cdFx0aWYgKHBhdHRlcm4gJiYgIXBhdHRlcm4uZW5kc1dpdGgoJyoqJykpIHtcblx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdHNlYXJjaFBhdGg6IG9uZUV4cGFuZGVkUmVzdWx0LnNlYXJjaFBhdGgsXG5cdFx0XHRcdHBhdHRlcm46IHBhdHRlcm4gKyAnLyoqJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRwcml2YXRlIGdldEZvbGRlclF1ZXJ5Rm9yU2VhcmNoUGF0aChzZWFyY2hQYXRoOiBJU2VhcmNoUGF0aFBhdHRlcm4sIG9wdGlvbnM6IElDb21tb25RdWVyeUJ1aWxkZXJPcHRpb25zLCBzZWFyY2hQYXRoRXhjbHVkZXM6IElTZWFyY2hQYXRoc0luZm8pOiBJRm9sZGVyUXVlcnkgfCBudWxsIHtcblx0XHRjb25zdCByb290Q29uZmlnID0gdGhpcy5nZXRGb2xkZXJRdWVyeUZvclJvb3QodG9Xb3Jrc3BhY2VGb2xkZXIoc2VhcmNoUGF0aC5zZWFyY2hQYXRoKSwgb3B0aW9ucywgc2VhcmNoUGF0aEV4Y2x1ZGVzLCBmYWxzZSk7XG5cdFx0aWYgKCFyb290Q29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucm9vdENvbmZpZyxcblx0XHRcdC4uLntcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHNlYXJjaFBhdGgucGF0dGVyblxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEZvbGRlclF1ZXJ5Rm9yUm9vdChmb2xkZXI6IChJV29ya3NwYWNlRm9sZGVyRGF0YSB8IFVSSSksIG9wdGlvbnM6IElDb21tb25RdWVyeUJ1aWxkZXJPcHRpb25zLCBzZWFyY2hQYXRoRXhjbHVkZXM6IElTZWFyY2hQYXRoc0luZm8sIGluY2x1ZGVGb2xkZXJOYW1lOiBib29sZWFuKTogSUZvbGRlclF1ZXJ5IHwgbnVsbCB7XG5cdFx0bGV0IHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aFBhdHRlcm46IGdsb2IuSUV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmlzVXJpKGZvbGRlcikgPyBmb2xkZXIgOiBmb2xkZXIudXJpO1xuXG5cdFx0Ly8gb25seSB1c2UgZXhjbHVkZSByb290IGlmIGl0IGlzIGRpZmZlcmVudCBmcm9tIHRoZSBmb2xkZXIgcm9vdFxuXHRcdGxldCBleGNsdWRlRm9sZGVyUm9vdHMgPSBvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuPy5tYXAoZXhjbHVkZVBhdHRlcm4gPT4ge1xuXHRcdFx0Y29uc3QgZXhjbHVkZVJvb3QgPSBvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuICYmIGlzSVNlYXJjaFBhdHRlcm5CdWlsZGVyKGV4Y2x1ZGVQYXR0ZXJuKSA/IGV4Y2x1ZGVQYXR0ZXJuLnVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNob3VsZFVzZUV4Y2x1ZGVSb290ID0gKCFleGNsdWRlUm9vdCB8fCAhKFVSSS5pc1VyaShmb2xkZXIpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZvbGRlciwgZXhjbHVkZVJvb3QpKSk7XG5cdFx0XHRyZXR1cm4gc2hvdWxkVXNlRXhjbHVkZVJvb3QgPyBleGNsdWRlUm9vdCA6IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdGlmICghZXhjbHVkZUZvbGRlclJvb3RzPy5sZW5ndGgpIHtcblx0XHRcdGV4Y2x1ZGVGb2xkZXJSb290cyA9IFt1bmRlZmluZWRdO1xuXHRcdH1cblxuXHRcdGlmIChzZWFyY2hQYXRoRXhjbHVkZXMuc2VhcmNoUGF0aHMpIHtcblx0XHRcdGNvbnN0IHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aCA9IHNlYXJjaFBhdGhFeGNsdWRlcy5zZWFyY2hQYXRocy5maWx0ZXIoc3AgPT4gaXNFcXVhbChzcC5zZWFyY2hQYXRoLCBmb2xkZXJVcmkpKVswXTtcblx0XHRcdGlmICh0aGlzRm9sZGVyRXhjbHVkZVNlYXJjaFBhdGggJiYgIXRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aC5wYXR0ZXJuKSB7XG5cdFx0XHRcdC8vIGVudGlyZSBmb2xkZXIgaXMgZXhjbHVkZWRcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aCkge1xuXHRcdFx0XHR0aGlzRm9sZGVyRXhjbHVkZVNlYXJjaFBhdGhQYXR0ZXJuID0gdGhpc0ZvbGRlckV4Y2x1ZGVTZWFyY2hQYXRoLnBhdHRlcm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9sZGVyQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogZm9sZGVyVXJpIH0pO1xuXHRcdGNvbnN0IHNldHRpbmdFeGNsdWRlcyA9IHRoaXMuZ2V0RXhjbHVkZXNGb3JGb2xkZXIoZm9sZGVyQ29uZmlnLCBvcHRpb25zKTtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybjogZ2xvYi5JRXhwcmVzc2lvbiA9IHtcblx0XHRcdC4uLihzZXR0aW5nRXhjbHVkZXMgfHwge30pLFxuXHRcdFx0Li4uKHRoaXNGb2xkZXJFeGNsdWRlU2VhcmNoUGF0aFBhdHRlcm4gfHwge30pXG5cdFx0fTtcblxuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBVUkkuaXNVcmkoZm9sZGVyKSA/IGJhc2VuYW1lKGZvbGRlcikgOiBmb2xkZXIubmFtZTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuUmV0OiBFeGNsdWRlR2xvYlBhdHRlcm5bXSA9IGV4Y2x1ZGVGb2xkZXJSb290cy5tYXAoZXhjbHVkZUZvbGRlclJvb3QgPT4ge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKGV4Y2x1ZGVQYXR0ZXJuKS5sZW5ndGggPiAwID8ge1xuXHRcdFx0XHRmb2xkZXI6IGV4Y2x1ZGVGb2xkZXJSb290LFxuXHRcdFx0XHRwYXR0ZXJuOiBleGNsdWRlUGF0dGVyblxuXHRcdFx0fSBzYXRpc2ZpZXMgRXhjbHVkZUdsb2JQYXR0ZXJuIDogdW5kZWZpbmVkO1xuXHRcdH0pLmZpbHRlcigoZSkgPT4gZSkgYXMgRXhjbHVkZUdsb2JQYXR0ZXJuW107XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9sZGVyOiBmb2xkZXJVcmksXG5cdFx0XHRmb2xkZXJOYW1lOiBpbmNsdWRlRm9sZGVyTmFtZSA/IGZvbGRlck5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRleGNsdWRlUGF0dGVybjogZXhjbHVkZVBhdHRlcm5SZXQsXG5cdFx0XHRmaWxlRW5jb2Rpbmc6IGZvbGRlckNvbmZpZy5maWxlcyAmJiBmb2xkZXJDb25maWcuZmlsZXMuZW5jb2RpbmcsXG5cdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMuZGlzcmVnYXJkSWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/IG9wdGlvbnMuZGlzcmVnYXJkSWdub3JlRmlsZXMgOiAhZm9sZGVyQ29uZmlnLnNlYXJjaD8udXNlSWdub3JlRmlsZXMsXG5cdFx0XHRkaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMuZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/IG9wdGlvbnMuZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXMgOiAhZm9sZGVyQ29uZmlnLnNlYXJjaD8udXNlR2xvYmFsSWdub3JlRmlsZXMsXG5cdFx0XHRkaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlczogdHlwZW9mIG9wdGlvbnMuZGlzcmVnYXJkUGFyZW50SWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/IG9wdGlvbnMuZGlzcmVnYXJkUGFyZW50SWdub3JlRmlsZXMgOiAhZm9sZGVyQ29uZmlnLnNlYXJjaD8udXNlUGFyZW50SWdub3JlRmlsZXMsXG5cdFx0XHRpZ25vcmVTeW1saW5rczogdHlwZW9mIG9wdGlvbnMuaWdub3JlU3ltbGlua3MgPT09ICdib29sZWFuJyA/IG9wdGlvbnMuaWdub3JlU3ltbGlua3MgOiAhZm9sZGVyQ29uZmlnLnNlYXJjaD8uZm9sbG93U3ltbGlua3MsXG5cdFx0XHRpZ25vcmVHbG9iQ2FzZTogb3B0aW9ucy5pZ25vcmVHbG9iQ2FzZSxcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNwbGl0R2xvYkZyb21QYXRoKHNlYXJjaFBhdGg6IHN0cmluZyk6IHsgcGF0aFBvcnRpb246IHN0cmluZzsgZ2xvYlBvcnRpb24/OiBzdHJpbmcgfSB7XG5cdGNvbnN0IGdsb2JDaGFyTWF0Y2ggPSBzZWFyY2hQYXRoLm1hdGNoKC9bXFwqXFx7XFx9XFwoXFwpXFxbXFxdXFw/XS8pO1xuXHRpZiAoZ2xvYkNoYXJNYXRjaCkge1xuXHRcdGNvbnN0IGdsb2JDaGFySWR4ID0gZ2xvYkNoYXJNYXRjaC5pbmRleDtcblx0XHRjb25zdCBsYXN0U2xhc2hNYXRjaCA9IHNlYXJjaFBhdGguc3Vic3RyKDAsIGdsb2JDaGFySWR4KS5tYXRjaCgvWy98XFxcXF1bXi9cXFxcXSokLyk7XG5cdFx0aWYgKGxhc3RTbGFzaE1hdGNoKSB7XG5cdFx0XHRsZXQgcGF0aFBvcnRpb24gPSBzZWFyY2hQYXRoLnN1YnN0cigwLCBsYXN0U2xhc2hNYXRjaC5pbmRleCk7XG5cdFx0XHRpZiAoIXBhdGhQb3J0aW9uLm1hdGNoKC9bL1xcXFxdLykpIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGxhc3Qgc2xhc2ggd2FzIHRoZSBvbmx5IHNsYXNoLCB0aGVuIHdlIG5vdyBoYXZlICcnIG9yICdDOicgb3IgJy4nLiBBcHBlbmQgYSBzbGFzaC5cblx0XHRcdFx0cGF0aFBvcnRpb24gKz0gJy8nO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwYXRoUG9ydGlvbixcblx0XHRcdFx0Z2xvYlBvcnRpb246IHNlYXJjaFBhdGguc3Vic3RyKChsYXN0U2xhc2hNYXRjaC5pbmRleCB8fCAwKSArIDEpXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdC8vIE5vIGdsb2IgY2hhciwgb3IgbWFsZm9ybWVkXG5cdHJldHVybiB7XG5cdFx0cGF0aFBvcnRpb246IHNlYXJjaFBhdGhcblx0fTtcbn1cblxuZnVuY3Rpb24gcGF0dGVybkxpc3RUb0lFeHByZXNzaW9uKC4uLnBhdHRlcm5zOiBzdHJpbmdbXSk6IGdsb2IuSUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcGF0dGVybnMubGVuZ3RoID9cblx0XHRwYXR0ZXJucy5yZWR1Y2UoKGdsb2IsIGN1cikgPT4geyBnbG9iW2N1cl0gPSB0cnVlOyByZXR1cm4gZ2xvYjsgfSwgT2JqZWN0LmNyZWF0ZShudWxsKSkgOlxuXHRcdHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc3BsaXRHbG9iUGF0dGVybihwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBnbG9iLnNwbGl0R2xvYkF3YXJlKHBhdHRlcm4sICcsJylcblx0XHQubWFwKHMgPT4gcy50cmltKCkpXG5cdFx0LmZpbHRlcihzID0+ICEhcy5sZW5ndGgpO1xufVxuXG4vKipcbiAqIE5vdGUgLSB3ZSB1c2VkIHt9IGhlcmUgcHJldmlvdXNseSBidXQgcmlwZ3JlcCBjYW4ndCBoYW5kbGUgbmVzdGVkIHt9IHBhdHRlcm5zLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyNzYxXG4gKi9cbmZ1bmN0aW9uIGV4cGFuZEdsb2JhbEdsb2IocGF0dGVybjogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBwYXR0ZXJucyA9IFtcblx0XHRgKiovJHtwYXR0ZXJufS8qKmAsXG5cdFx0YCoqLyR7cGF0dGVybn1gXG5cdF07XG5cblx0cmV0dXJuIHBhdHRlcm5zLm1hcChwID0+IHAucmVwbGFjZSgvXFwqXFwqXFwvXFwqXFwqL2csICcqKicpKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU2xhc2hlcyhwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcGF0dGVybi5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG59XG5cbi8qKlxuICogTm9ybWFsaXplIHNsYXNoZXMsIHJlbW92ZSBgLi9gIGFuZCB0cmFpbGluZyBzbGFzaGVzXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUdsb2JQYXR0ZXJuKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBub3JtYWxpemVTbGFzaGVzKHBhdHRlcm4pXG5cdFx0LnJlcGxhY2UoL15cXC5cXC8vLCAnJylcblx0XHQucmVwbGFjZSgvXFwvKyQvZywgJycpO1xufVxuXG4vKipcbiAqIEVzY2FwZXMgYSBwYXRoIGZvciB1c2UgYXMgYSBnbG9iIHBhdHRlcm4gdGhhdCB3b3VsZCBtYXRjaCB0aGUgaW5wdXQgcHJlY2lzZWx5LlxuICogQ2hhcmFjdGVycyAnPycsICcqJywgJ1snLCBhbmQgJ10nIGFyZSBlc2NhcGVkIGludG8gY2hhcmFjdGVyIHJhbmdlIGdsb2Igc3ludGF4XG4gKiAoZm9yIGV4YW1wbGUsICc/JyBiZWNvbWVzICdbP10nKS5cbiAqIE5PVEU6IFRoaXMgaW1wbGVtZW50YXRpb24gbWFrZXMgbm8gc3BlY2lhbCBjYXNlcyBmb3IgVU5DIHBhdGhzLiBGb3IgZXhhbXBsZSxcbiAqIGdpdmVuIHRoZSBpbnB1dCBcIi8vPy9DOi9BPy50eHRcIiwgdGhpcyB3b3VsZCBwcm9kdWNlIG91dHB1dCAnLy9bP10vQzovQVs/XS50eHQnLFxuICogd2hpY2ggbWF5IG5vdCBiZSBkZXNpcmFibGUgaW4gc29tZSBjYXNlcy4gVXNlIHdpdGggY2F1dGlvbiBpZiBVTkMgcGF0aHMgY291bGQgYmUgZXhwZWN0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlc2NhcGVHbG9iUGF0dGVybihwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcGF0aC5yZXBsYWNlKC8oWz8qW1xcXV0pL2csICdbJDFdJyk7XG59XG5cbi8qKlxuICogQ29uc3RydWN0IGFuIGluY2x1ZGUgcGF0dGVybiBmcm9tIGEgbGlzdCBvZiBmb2xkZXJzIHVyaXMgdG8gc2VhcmNoIGluLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVJlc291cmNlc0ZvclNlYXJjaEluY2x1ZGVzKHJlc291cmNlczogVVJJW10sIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpOiBzdHJpbmdbXSB7XG5cdHJlc291cmNlcyA9IGFycmF5cy5kaXN0aW5jdChyZXNvdXJjZXMsIHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdGNvbnN0IGZvbGRlclBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblxuXHRpZiAocmVzb3VyY2VzKSB7XG5cdFx0cmVzb3VyY2VzLmZvckVhY2gocmVzb3VyY2UgPT4ge1xuXHRcdFx0bGV0IGZvbGRlclBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0Ly8gU2hvdyByZWxhdGl2ZSBwYXRoIGZyb20gdGhlIHJvb3QgZm9yIHNpbmdsZS1yb290IG1vZGVcblx0XHRcdFx0Zm9sZGVyUGF0aCA9IHJlbGF0aXZlUGF0aCh3b3Jrc3BhY2UuZm9sZGVyc1swXS51cmksIHJlc291cmNlKTsgLy8gYWx3YXlzIHVzZXMgZm9yd2FyZCBzbGFzaGVzXG5cdFx0XHRcdGlmIChmb2xkZXJQYXRoICYmIGZvbGRlclBhdGggIT09ICcuJykge1xuXHRcdFx0XHRcdGZvbGRlclBhdGggPSAnLi8nICsgZm9sZGVyUGF0aDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgb3duaW5nRm9sZGVyID0gY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKG93bmluZ0ZvbGRlcikge1xuXHRcdFx0XHRcdGNvbnN0IG93bmluZ1Jvb3ROYW1lID0gb3duaW5nRm9sZGVyLm5hbWU7XG5cdFx0XHRcdFx0Ly8gSWYgdGhpcyByb290IGlzIHRoZSBvbmx5IG9uZSB3aXRoIGl0cyBiYXNlbmFtZSwgdXNlIGEgcmVsYXRpdmUgLi8gcGF0aC4gSWYgdGhlcmUgaXMgYW5vdGhlciwgdXNlIGFuIGFic29sdXRlIHBhdGhcblx0XHRcdFx0XHRjb25zdCBpc1VuaXF1ZUZvbGRlciA9IHdvcmtzcGFjZS5mb2xkZXJzLmZpbHRlcihmb2xkZXIgPT4gZm9sZGVyLm5hbWUgPT09IG93bmluZ1Jvb3ROYW1lKS5sZW5ndGggPT09IDE7XG5cdFx0XHRcdFx0aWYgKGlzVW5pcXVlRm9sZGVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZWxQYXRoID0gcmVsYXRpdmVQYXRoKG93bmluZ0ZvbGRlci51cmksIHJlc291cmNlKTsgLy8gYWx3YXlzIHVzZXMgZm9yd2FyZCBzbGFzaGVzXG5cdFx0XHRcdFx0XHRpZiAocmVsUGF0aCA9PT0gJycpIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVyUGF0aCA9IGAuLyR7b3duaW5nRm9sZGVyLm5hbWV9YDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlclBhdGggPSBgLi8ke293bmluZ0ZvbGRlci5uYW1lfS8ke3JlbFBhdGh9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Zm9sZGVyUGF0aCA9IHJlc291cmNlLmZzUGF0aDsgLy8gVE9ETyByb2I6IGhhbmRsZSBub24tZmlsZSBVUklzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb2xkZXJQYXRoKSB7XG5cdFx0XHRcdGZvbGRlclBhdGhzLnB1c2goZXNjYXBlR2xvYlBhdHRlcm4oZm9sZGVyUGF0aCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiBmb2xkZXJQYXRocztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxZQUFZO0FBQ3hCLFlBQVksaUJBQWlCO0FBQzdCLFlBQVksVUFBVTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsU0FBUyxVQUFVLGNBQWMsc0JBQXNCO0FBQ2hFLFlBQVksYUFBYTtBQUN6QixTQUFTLHNCQUFzQixpQkFBaUI7QUFDaEQsU0FBUyxLQUFLLE9BQU8sV0FBMEI7QUFDL0MsU0FBUyw4QkFBOEI7QUFDdkMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQWdELG1CQUFtQixzQkFBc0I7QUFDbEcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBNkIsYUFBbUoscUJBQXFCLGlCQUFpQjtBQTBCL00sU0FBUyx3QkFBaUQsUUFBa0c7QUFDbEssU0FBUSxPQUFPLFdBQVcsWUFBWSxTQUFTLFVBQVUsYUFBYTtBQUN2RTtBQUVPLFNBQVMsbUNBQW1DLGFBQXNEO0FBRXhHLE1BQUksT0FBTyxnQkFBZ0IsVUFBVTtBQUNwQyxXQUFPO0FBQUEsTUFDTixTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTLFlBQVk7QUFBQSxJQUNyQixLQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUNEO0FBc0RPLElBQU0sZUFBTixNQUFtQjtBQUFBLEVBRXpCLFlBQ3lDLHNCQUNHLHlCQUNKLHFCQUNULFlBQ0MsYUFDTyxvQkFDckM7QUFOdUM7QUFDRztBQUNKO0FBQ1Q7QUFDQztBQUNPO0FBQUEsRUFFdkM7QUFBQSxFQUVBLE9BQU8sZ0JBQXdCLGlCQUF5QixVQUFvQyxDQUFDLEdB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QUssQ0FBQyxFQUNqQixPQUFPLE9BQUssQ0FBQyxDQUFDLEVBQUUsTUFBTTtBQUN6QjtBQUtBLFNBQVMsaUJBQWlCLFNBQTJCO0FBQ3BELFFBQU0sV0FBVztBQUFBLElBQ2hCLE1BQU0sT0FBTztBQUFBLElBQ2IsTUFBTSxPQUFPO0FBQUEsRUFDZDtBQUVBLFNBQU8sU0FBUyxJQUFJLE9BQUssRUFBRSxRQUFRLGVBQWUsSUFBSSxDQUFDO0FBQ3hEO0FBRUEsU0FBUyxpQkFBaUIsU0FBeUI7QUFDbEQsU0FBTyxRQUFRLFFBQVEsT0FBTyxHQUFHO0FBQ2xDO0FBS0EsU0FBUyxxQkFBcUIsU0FBeUI7QUFDdEQsU0FBTyxpQkFBaUIsT0FBTyxFQUM3QixRQUFRLFNBQVMsRUFBRSxFQUNuQixRQUFRLFNBQVMsRUFBRTtBQUN0QjtBQVVPLFNBQVMsa0JBQWtCQyxPQUFzQjtBQUN2RCxTQUFPQSxNQUFLLFFBQVEsY0FBYyxNQUFNO0FBQ3pDO0FBS08sU0FBUyxrQ0FBa0MsV0FBa0IsZ0JBQW9EO0FBQ3ZILGNBQVksT0FBTyxTQUFTLFdBQVcsY0FBWSxTQUFTLFNBQVMsQ0FBQztBQUV0RSxRQUFNLGNBQXdCLENBQUM7QUFDL0IsUUFBTSxZQUFZLGVBQWUsYUFBYTtBQUU5QyxNQUFJLFdBQVc7QUFDZCxjQUFVLFFBQVEsY0FBWTtBQUM3QixVQUFJO0FBQ0osVUFBSSxlQUFlLGtCQUFrQixNQUFNLGVBQWUsUUFBUTtBQUVqRSxxQkFBYSxhQUFhLFVBQVUsUUFBUSxDQUFDLEVBQUUsS0FBSyxRQUFRO0FBQzVELFlBQUksY0FBYyxlQUFlLEtBQUs7QUFDckMsdUJBQWEsT0FBTztBQUFBLFFBQ3JCO0FBQUEsTUFDRCxPQUFPO0FBQ04sY0FBTSxlQUFlLGVBQWUsbUJBQW1CLFFBQVE7QUFDL0QsWUFBSSxjQUFjO0FBQ2pCLGdCQUFNLGlCQUFpQixhQUFhO0FBRXBDLGdCQUFNLGlCQUFpQixVQUFVLFFBQVEsT0FBTyxZQUFVLE9BQU8sU0FBUyxjQUFjLEVBQUUsV0FBVztBQUNyRyxjQUFJLGdCQUFnQjtBQUNuQixrQkFBTSxVQUFVLGFBQWEsYUFBYSxLQUFLLFFBQVE7QUFDdkQsZ0JBQUksWUFBWSxJQUFJO0FBQ25CLDJCQUFhLEtBQUssYUFBYSxJQUFJO0FBQUEsWUFDcEMsT0FBTztBQUNOLDJCQUFhLEtBQUssYUFBYSxJQUFJLElBQUksT0FBTztBQUFBLFlBQy9DO0FBQUEsVUFDRCxPQUFPO0FBQ04seUJBQWEsU0FBUztBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFlBQVk7QUFDZixvQkFBWSxLQUFLLGtCQUFrQixVQUFVLENBQUM7QUFBQSxNQUMvQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbInVyaSIsICJleGNsdWRlUGF0dGVybiIsICJnbG9iIiwgInBhdGgiXQp9Cg==
