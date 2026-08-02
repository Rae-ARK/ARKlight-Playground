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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { relativePath } from "../../../../base/common/resources.js";
import { linesDiffComputers } from "../../../../editor/common/diff/linesDiffComputers.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationError, FileOperationResult } from "../../../../platform/files/common/files.js";
import { detectEncodingFromBuffer } from "../../../services/textfile/common/encoding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { ISCMService } from "../../scm/common/scm.js";
import { IChatService } from "../common/chatService/chatService.js";
import { ChatConfiguration } from "../common/constants.js";
import * as nls from "../../../../nls.js";
const MAX_CHANGES = 100;
const MAX_DIFFS_SIZE_BYTES = 900 * 1024;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
function getRawRemotes(text) {
  const remotes = [];
  let match;
  while (match = RemoteMatcher.exec(text)) {
    remotes.push(match[1]);
  }
  return remotes;
}
function getRemoteHost(remoteUrl) {
  try {
    const url = new URL(remoteUrl);
    return url.hostname.toLowerCase();
  } catch {
    const atIndex = remoteUrl.lastIndexOf("@");
    const hostAndPath = atIndex !== -1 ? remoteUrl.slice(atIndex + 1) : remoteUrl;
    const colonIndex = hostAndPath.indexOf(":");
    if (colonIndex !== -1) {
      const host = hostAndPath.slice(0, colonIndex);
      return host ? host.toLowerCase() : void 0;
    }
    const slashIndex = hostAndPath.indexOf("/");
    if (slashIndex !== -1) {
      const host = hostAndPath.slice(0, slashIndex);
      return host ? host.toLowerCase() : void 0;
    }
    return void 0;
  }
}
function determineChangeType(resource, groupId) {
  const contextValue = resource.contextValue?.toLowerCase() ?? "";
  const groupIdLower = groupId.toLowerCase();
  if (contextValue.includes("untracked") || contextValue.includes("add")) {
    return "added";
  }
  if (contextValue.includes("delete")) {
    return "deleted";
  }
  if (contextValue.includes("rename")) {
    return "renamed";
  }
  if (groupIdLower.includes("untracked")) {
    return "added";
  }
  if (resource.decorations.strikeThrough) {
    return "deleted";
  }
  if (!resource.multiDiffEditorOriginalUri) {
    return "added";
  }
  return "modified";
}
async function generateUnifiedDiff(fileService, relPath, originalUri, modifiedUri, changeType) {
  try {
    let originalContent = "";
    let modifiedContent = "";
    if (originalUri && changeType !== "added") {
      try {
        const originalFile = await fileService.readFile(originalUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
        const detected = detectEncodingFromBuffer({ buffer: originalFile.value, bytesRead: originalFile.value.byteLength });
        if (detected.seemsBinary) {
          return void 0;
        }
        originalContent = originalFile.value.toString();
      } catch (e) {
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
          return void 0;
        }
        if (changeType === "modified") {
          return void 0;
        }
      }
    }
    if (changeType !== "deleted") {
      try {
        const modifiedFile = await fileService.readFile(modifiedUri, { limits: { size: MAX_FILE_SIZE_BYTES } });
        const detected = detectEncodingFromBuffer({ buffer: modifiedFile.value, bytesRead: modifiedFile.value.byteLength });
        if (detected.seemsBinary) {
          return void 0;
        }
        modifiedContent = modifiedFile.value.toString();
      } catch (e) {
        if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
          return void 0;
        }
        return void 0;
      }
    }
    const originalLines = originalContent.split("\n");
    const modifiedLines = modifiedContent.split("\n");
    const originalEndsWithNewline = originalContent.length > 0 && originalContent.endsWith("\n");
    const modifiedEndsWithNewline = modifiedContent.length > 0 && modifiedContent.endsWith("\n");
    if (originalEndsWithNewline && originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
      originalLines.pop();
    }
    if (modifiedEndsWithNewline && modifiedLines.length > 0 && modifiedLines[modifiedLines.length - 1] === "") {
      modifiedLines.pop();
    }
    const diffLines = [];
    const aPath = changeType === "added" ? "/dev/null" : `a/${relPath}`;
    const bPath = changeType === "deleted" ? "/dev/null" : `b/${relPath}`;
    diffLines.push(`--- ${aPath}`);
    diffLines.push(`+++ ${bPath}`);
    if (changeType === "added") {
      if (modifiedLines.length > 0) {
        diffLines.push(`@@ -0,0 +1,${modifiedLines.length} @@`);
        for (const line of modifiedLines) {
          diffLines.push(`+${line}`);
        }
        if (!modifiedEndsWithNewline) {
          diffLines.push("\\ No newline at end of file");
        }
      }
    } else if (changeType === "deleted") {
      if (originalLines.length > 0) {
        diffLines.push(`@@ -1,${originalLines.length} +0,0 @@`);
        for (const line of originalLines) {
          diffLines.push(`-${line}`);
        }
        if (!originalEndsWithNewline) {
          diffLines.push("\\ No newline at end of file");
        }
      }
    } else {
      const hunks = computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline);
      for (const hunk of hunks) {
        diffLines.push(hunk);
      }
    }
    return diffLines.join("\n");
  } catch {
    return void 0;
  }
}
function computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline) {
  const contextSize = 3;
  const result = [];
  const diffComputer = linesDiffComputers.getDefault();
  const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
    ignoreTrimWhitespace: false,
    maxComputationTimeMs: 1e3,
    computeMoves: false
  });
  if (diffResult.changes.length === 0) {
    return result;
  }
  const hunkGroups = [];
  let currentGroup = [];
  for (const change of diffResult.changes) {
    if (currentGroup.length === 0) {
      currentGroup.push(change);
    } else {
      const lastChange = currentGroup[currentGroup.length - 1];
      const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
      const currentContextStart = change.original.startLineNumber - contextSize;
      if (currentContextStart <= lastContextEnd + 1) {
        currentGroup.push(change);
      } else {
        hunkGroups.push(currentGroup);
        currentGroup = [change];
      }
    }
  }
  if (currentGroup.length > 0) {
    hunkGroups.push(currentGroup);
  }
  for (const group of hunkGroups) {
    const firstChange = group[0];
    const lastChange = group[group.length - 1];
    const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
    const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
    const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);
    const hunkLines = [];
    let lastOriginalLineIndex = -1;
    let lastModifiedLineIndex = -1;
    let origLineNum = hunkOrigStart;
    let origCount = 0;
    let modCount = 0;
    for (const change of group) {
      const origStart = change.original.startLineNumber;
      const origEnd = change.original.endLineNumberExclusive;
      const modStart = change.modified.startLineNumber;
      const modEnd = change.modified.endLineNumberExclusive;
      while (origLineNum < origStart) {
        const idx = hunkLines.length;
        hunkLines.push(` ${originalLines[origLineNum - 1]}`);
        if (origLineNum === originalLines.length) {
          lastOriginalLineIndex = idx;
        }
        const modLineNum = hunkModStart + modCount;
        if (modLineNum === modifiedLines.length) {
          lastModifiedLineIndex = idx;
        }
        origLineNum++;
        origCount++;
        modCount++;
      }
      for (let i = origStart; i < origEnd; i++) {
        const idx = hunkLines.length;
        hunkLines.push(`-${originalLines[i - 1]}`);
        if (i === originalLines.length) {
          lastOriginalLineIndex = idx;
        }
        origLineNum++;
        origCount++;
      }
      for (let i = modStart; i < modEnd; i++) {
        const idx = hunkLines.length;
        hunkLines.push(`+${modifiedLines[i - 1]}`);
        if (i === modifiedLines.length) {
          lastModifiedLineIndex = idx;
        }
        modCount++;
      }
    }
    while (origLineNum <= hunkOrigEnd) {
      const idx = hunkLines.length;
      hunkLines.push(` ${originalLines[origLineNum - 1]}`);
      if (origLineNum === originalLines.length) {
        lastOriginalLineIndex = idx;
      }
      const modLineNum = hunkModStart + modCount;
      if (modLineNum === modifiedLines.length) {
        lastModifiedLineIndex = idx;
      }
      origLineNum++;
      origCount++;
      modCount++;
    }
    result.push(`@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`);
    for (let i = 0; i < hunkLines.length; i++) {
      result.push(hunkLines[i]);
      const isLastOriginal = i === lastOriginalLineIndex;
      const isLastModified = i === lastModifiedLineIndex;
      if (isLastOriginal && isLastModified) {
        if (!originalEndsWithNewline || !modifiedEndsWithNewline) {
          result.push("\\ No newline at end of file");
        }
      } else if (isLastOriginal && !originalEndsWithNewline) {
        result.push("\\ No newline at end of file");
      } else if (isLastModified && !modifiedEndsWithNewline) {
        result.push("\\ No newline at end of file");
      }
    }
  }
  return result;
}
function captureRepoMetadata(scmService) {
  const repositories = [...scmService.repositories];
  if (repositories.length === 0) {
    return void 0;
  }
  const repository = repositories[0];
  const rootUri = repository.provider.rootUri;
  if (!rootUri) {
    return void 0;
  }
  let localBranch;
  let localHeadCommit;
  let remoteTrackingBranch;
  let remoteHeadCommit;
  let remoteBaseBranch;
  const historyProvider = repository.provider.historyProvider?.get();
  if (historyProvider) {
    const historyItemRef = historyProvider.historyItemRef.get();
    localBranch = historyItemRef?.name;
    localHeadCommit = historyItemRef?.revision;
    const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
    if (historyItemRemoteRef) {
      remoteTrackingBranch = historyItemRemoteRef.name;
      remoteHeadCommit = historyItemRemoteRef.revision;
    }
    const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
    if (historyItemBaseRef) {
      remoteBaseBranch = historyItemBaseRef.name;
    }
  }
  let workspaceType;
  let syncStatus;
  if (remoteTrackingBranch || remoteHeadCommit || remoteBaseBranch) {
    workspaceType = "remote-git";
    if (!remoteTrackingBranch) {
      syncStatus = "unpublished";
    } else if (localHeadCommit && remoteHeadCommit && localHeadCommit === remoteHeadCommit) {
      syncStatus = "synced";
    } else {
      syncStatus = "unpushed";
    }
  } else {
    workspaceType = "local-git";
    syncStatus = "local-only";
  }
  return {
    workspaceType,
    syncStatus,
    localBranch,
    remoteTrackingBranch,
    remoteBaseBranch,
    localHeadCommit,
    remoteHeadCommit,
    diffsStatus: "notCaptured"
  };
}
async function captureRepoInfo(scmService, fileService) {
  const repositories = [...scmService.repositories];
  if (repositories.length === 0) {
    return void 0;
  }
  const repository = repositories[0];
  const rootUri = repository.provider.rootUri;
  if (!rootUri) {
    return void 0;
  }
  let hasGit = false;
  try {
    const gitDirUri = rootUri.with({ path: `${rootUri.path}/.git` });
    hasGit = await fileService.exists(gitDirUri);
  } catch {
  }
  if (!hasGit) {
    return {
      workspaceType: "plain-folder",
      syncStatus: "no-git",
      diffs: void 0
    };
  }
  let remoteUrl;
  try {
    const gitConfigUri = rootUri.with({ path: `${rootUri.path}/.git/config` });
    const exists = await fileService.exists(gitConfigUri);
    if (exists) {
      const content = await fileService.readFile(gitConfigUri);
      const remotes = getRawRemotes(content.value.toString());
      remoteUrl = remotes[0];
    }
  } catch {
  }
  let localBranch;
  let localHeadCommit;
  let remoteTrackingBranch;
  let remoteHeadCommit;
  let remoteBaseBranch;
  const historyProvider = repository.provider.historyProvider?.get();
  if (historyProvider) {
    const historyItemRef = historyProvider.historyItemRef.get();
    localBranch = historyItemRef?.name;
    localHeadCommit = historyItemRef?.revision;
    const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
    if (historyItemRemoteRef) {
      remoteTrackingBranch = historyItemRemoteRef.name;
      remoteHeadCommit = historyItemRemoteRef.revision;
    }
    const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
    if (historyItemBaseRef) {
      remoteBaseBranch = historyItemBaseRef.name;
    }
  }
  let workspaceType;
  let syncStatus;
  if (!remoteUrl) {
    workspaceType = "local-git";
    syncStatus = "local-only";
  } else {
    workspaceType = "remote-git";
    if (!remoteTrackingBranch) {
      syncStatus = "unpublished";
    } else if (localHeadCommit === remoteHeadCommit) {
      syncStatus = "synced";
    } else {
      syncStatus = "unpushed";
    }
  }
  let remoteVendor;
  if (remoteUrl) {
    const host = getRemoteHost(remoteUrl);
    if (host === "github.com") {
      remoteVendor = "github";
    } else if (host === "dev.azure.com" || host && host.endsWith(".visualstudio.com")) {
      remoteVendor = "ado";
    } else {
      remoteVendor = "other";
    }
  }
  let totalChangeCount = 0;
  for (const group of repository.provider.groups) {
    totalChangeCount += group.resources.length;
  }
  const baseRepoData = {
    workspaceType,
    syncStatus,
    remoteUrl,
    remoteVendor,
    localBranch,
    remoteTrackingBranch,
    remoteBaseBranch,
    localHeadCommit,
    remoteHeadCommit
  };
  if (totalChangeCount === 0) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "noChanges",
      changedFileCount: 0
    };
  }
  if (totalChangeCount > MAX_CHANGES) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "tooManyChanges",
      changedFileCount: totalChangeCount
    };
  }
  const diffs = [];
  const diffPromises = [];
  for (const group of repository.provider.groups) {
    for (const resource of group.resources) {
      const relPath = relativePath(rootUri, resource.sourceUri) ?? resource.sourceUri.path;
      const changeType = determineChangeType(resource, group.id);
      const diffPromise = (async () => {
        const unifiedDiff = await generateUnifiedDiff(
          fileService,
          relPath,
          resource.multiDiffEditorOriginalUri,
          resource.sourceUri,
          changeType
        );
        return {
          relativePath: relPath,
          changeType,
          status: group.label || group.id,
          unifiedDiff
        };
      })();
      diffPromises.push(diffPromise);
    }
  }
  const generatedDiffs = await Promise.all(diffPromises);
  for (const diff of generatedDiffs) {
    if (diff) {
      diffs.push(diff);
    }
  }
  const diffsJson = JSON.stringify(diffs);
  const diffsSizeBytes = new TextEncoder().encode(diffsJson).length;
  if (diffsSizeBytes > MAX_DIFFS_SIZE_BYTES) {
    return {
      ...baseRepoData,
      diffs: void 0,
      diffsStatus: "tooLarge",
      changedFileCount: totalChangeCount
    };
  }
  return {
    ...baseRepoData,
    diffs,
    diffsStatus: "included",
    changedFileCount: totalChangeCount
  };
}
let ChatRepoInfoContribution = class extends Disposable {
  constructor(chatService, chatEntitlementService, scmService, logService, configurationService) {
    super();
    this.chatService = chatService;
    this.chatEntitlementService = chatEntitlementService;
    this.scmService = scmService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._configurationRegistered = false;
    this.registerConfigurationIfInternal();
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.registerConfigurationIfInternal();
    }));
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      const model = this.chatService.getSession(chatSessionResource);
      if (!model) {
        return;
      }
      this.captureAndSetRepoMetadata(model);
    }));
  }
  registerConfigurationIfInternal() {
    if (this._configurationRegistered) {
      return;
    }
    if (!this.chatEntitlementService.isInternal) {
      return;
    }
    const registry = Registry.as(ConfigurationExtensions.Configuration);
    registry.registerConfiguration({
      id: "chatRepoInfo",
      title: nls.localize("chatRepoInfoConfigurationTitle", "Chat Repository Info"),
      type: "object",
      properties: {
        [ChatConfiguration.RepoInfoEnabled]: {
          type: "boolean",
          description: nls.localize("chat.repoInfo.enabled", "Controls whether lightweight repository metadata (branch, commit, remotes) is captured when a chat request is submitted for internal diagnostics."),
          default: false
        }
      }
    });
    this._configurationRegistered = true;
    this.logService.debug("[ChatRepoInfo] Configuration registered for internal user");
  }
  /**
   * Captures lightweight metadata (branch, commit, remote refs) on first message.
   * Synchronous, no file I/O. Reads only from SCM provider observables.
   */
  captureAndSetRepoMetadata(model) {
    if (!this.chatEntitlementService.isInternal) {
      return;
    }
    if (!this.configurationService.getValue(ChatConfiguration.RepoInfoEnabled)) {
      return;
    }
    if (model.repoData) {
      return;
    }
    try {
      const metadata = captureRepoMetadata(this.scmService);
      if (metadata) {
        model.setRepoData(metadata);
        if (!metadata.localHeadCommit) {
          this.logService.warn("[ChatRepoInfo] Captured repo metadata without commit hash - git history may not be ready");
        }
      } else {
        this.logService.debug("[ChatRepoInfo] No SCM repository available for chat session");
      }
    } catch (error) {
      this.logService.warn("[ChatRepoInfo] Failed to capture repo metadata:", error);
    }
  }
};
ChatRepoInfoContribution.ID = "workbench.contrib.chatRepoInfo";
ChatRepoInfoContribution = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, ISCMService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IConfigurationService)
], ChatRepoInfoContribution);
export {
  ChatRepoInfoContribution,
  captureRepoInfo,
  captureRepoMetadata,
  generateUnifiedDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UmVwb0luZm8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbGluZXNEaWZmQ29tcHV0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU0NNU2VydmljZSwgSVNDTVJlc291cmNlIH0gZnJvbSAnLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJRXhwb3J0YWJsZVJlcG9EYXRhLCBJRXhwb3J0YWJsZVJlcG9EaWZmIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuY29uc3QgTUFYX0NIQU5HRVMgPSAxMDA7XG5jb25zdCBNQVhfRElGRlNfU0laRV9CWVRFUyA9IDkwMCAqIDEwMjQ7XG5jb25zdCBNQVhfRklMRV9TSVpFX0JZVEVTID0gMSAqIDEwMjQgKiAxMDI0OyAvLyAxIE1CIHBlciBmaWxlXG4vKipcbiAqIFJlZ2V4IHRvIG1hdGNoIGB1cmwgPSA8cmVtb3RlLXVybD5gIGxpbmVzIGluIGdpdCBjb25maWcuXG4gKi9cbmNvbnN0IFJlbW90ZU1hdGNoZXIgPSAvXlxccyp1cmxcXHMqPVxccyooLitcXFMpXFxzKiQvbWc7XG5cbi8qKlxuICogRXh0cmFjdHMgcmF3IHJlbW90ZSBVUkxzIGZyb20gZ2l0IGNvbmZpZyBjb250ZW50LlxuICovXG5mdW5jdGlvbiBnZXRSYXdSZW1vdGVzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVtb3Rlczogc3RyaW5nW10gPSBbXTtcblx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHR3aGlsZSAobWF0Y2ggPSBSZW1vdGVNYXRjaGVyLmV4ZWModGV4dCkpIHtcblx0XHRyZW1vdGVzLnB1c2gobWF0Y2hbMV0pO1xuXHR9XG5cdHJldHVybiByZW1vdGVzO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGEgaG9zdG5hbWUgZnJvbSBhIGdpdCByZW1vdGUgVVJMLlxuICpcbiAqIFN1cHBvcnRzOlxuICogLSBVUkwtbGlrZSByZW1vdGVzOiBodHRwczovL2dpdGh1Yi5jb20vLi4uLCBzc2g6Ly9naXRAZ2l0aHViLmNvbS8uLi4sIGdpdDovL2dpdGh1Yi5jb20vLi4uXG4gKiAtIFNDUC1saWtlIHJlbW90ZXM6IGdpdEBnaXRodWIuY29tOm93bmVyL3JlcG8uZ2l0XG4gKi9cbmZ1bmN0aW9uIGdldFJlbW90ZUhvc3QocmVtb3RlVXJsOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdC8vIFRyeSBzdGFuZGFyZCBVUkwgcGFyc2luZyBmaXJzdCAod29ya3MgZm9yIGh0dHBzOi8vLCBzc2g6Ly8sIGdpdDovLylcblx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKHJlbW90ZVVybCk7XG5cdFx0cmV0dXJuIHVybC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBGYWxsYmFjayBmb3IgU0NQLWxpa2Ugc3ludGF4OiBbdXNlckBdaG9zdDpwYXRoXG5cdFx0Y29uc3QgYXRJbmRleCA9IHJlbW90ZVVybC5sYXN0SW5kZXhPZignQCcpO1xuXHRcdGNvbnN0IGhvc3RBbmRQYXRoID0gYXRJbmRleCAhPT0gLTEgPyByZW1vdGVVcmwuc2xpY2UoYXRJbmRleCArIDEpIDogcmVtb3RlVXJsO1xuXHRcdGNvbnN0IGNvbG9uSW5kZXggPSBob3N0QW5kUGF0aC5pbmRleE9mKCc6Jyk7XG5cdFx0aWYgKGNvbG9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBob3N0ID0gaG9zdEFuZFBhdGguc2xpY2UoMCwgY29sb25JbmRleCk7XG5cdFx0XHRyZXR1cm4gaG9zdCA/IGhvc3QudG9Mb3dlckNhc2UoKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayBmb3IgaG9zdG5hbWUvcGF0aCBmb3JtYXQgd2l0aG91dCBzY2hlbWUgKGUuZy4sIGRldmRpdi52aXN1YWxzdHVkaW8uY29tLy4uLilcblx0XHRjb25zdCBzbGFzaEluZGV4ID0gaG9zdEFuZFBhdGguaW5kZXhPZignLycpO1xuXHRcdGlmIChzbGFzaEluZGV4ICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgaG9zdCA9IGhvc3RBbmRQYXRoLnNsaWNlKDAsIHNsYXNoSW5kZXgpO1xuXHRcdFx0cmV0dXJuIGhvc3QgPyBob3N0LnRvTG93ZXJDYXNlKCkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIERldGVybWluZXMgdGhlIGNoYW5nZSB0eXBlIGJhc2VkIG9uIFNDTSByZXNvdXJjZSBwcm9wZXJ0aWVzLlxuICovXG5mdW5jdGlvbiBkZXRlcm1pbmVDaGFuZ2VUeXBlKHJlc291cmNlOiBJU0NNUmVzb3VyY2UsIGdyb3VwSWQ6IHN0cmluZyk6ICdhZGRlZCcgfCAnbW9kaWZpZWQnIHwgJ2RlbGV0ZWQnIHwgJ3JlbmFtZWQnIHtcblx0Y29uc3QgY29udGV4dFZhbHVlID0gcmVzb3VyY2UuY29udGV4dFZhbHVlPy50b0xvd2VyQ2FzZSgpID8/ICcnO1xuXHRjb25zdCBncm91cElkTG93ZXIgPSBncm91cElkLnRvTG93ZXJDYXNlKCk7XG5cblx0aWYgKGNvbnRleHRWYWx1ZS5pbmNsdWRlcygndW50cmFja2VkJykgfHwgY29udGV4dFZhbHVlLmluY2x1ZGVzKCdhZGQnKSkge1xuXHRcdHJldHVybiAnYWRkZWQnO1xuXHR9XG5cdGlmIChjb250ZXh0VmFsdWUuaW5jbHVkZXMoJ2RlbGV0ZScpKSB7XG5cdFx0cmV0dXJuICdkZWxldGVkJztcblx0fVxuXHRpZiAoY29udGV4dFZhbHVlLmluY2x1ZGVzKCdyZW5hbWUnKSkge1xuXHRcdHJldHVybiAncmVuYW1lZCc7XG5cdH1cblx0aWYgKGdyb3VwSWRMb3dlci5pbmNsdWRlcygndW50cmFja2VkJykpIHtcblx0XHRyZXR1cm4gJ2FkZGVkJztcblx0fVxuXHRpZiAocmVzb3VyY2UuZGVjb3JhdGlvbnMuc3RyaWtlVGhyb3VnaCkge1xuXHRcdHJldHVybiAnZGVsZXRlZCc7XG5cdH1cblx0aWYgKCFyZXNvdXJjZS5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSkge1xuXHRcdHJldHVybiAnYWRkZWQnO1xuXHR9XG5cdHJldHVybiAnbW9kaWZpZWQnO1xufVxuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHVuaWZpZWQgZGlmZiBzdHJpbmcgY29tcGF0aWJsZSB3aXRoIGBnaXQgYXBwbHlgLlxuICpcbiAqIE5vdGU6IFRoaXMgaW1wbGVtZW50YXRpb24gaGFzIGEga25vd24gbGltaXRhdGlvbiAtIGlmIHRoZSBvbmx5IGNoYW5nZSBiZXR3ZWVuXG4gKiBmaWxlcyBpcyB0aGUgcHJlc2VuY2UvYWJzZW5jZSBvZiBhIHRyYWlsaW5nIG5ld2xpbmUgKGNvbnRlbnQgb3RoZXJ3aXNlIGlkZW50aWNhbCksXG4gKiBubyBkaWZmIHdpbGwgYmUgZ2VuZXJhdGVkIGJlY2F1c2UgVlMgQ29kZSdzIGRpZmYgYWxnb3JpdGhtIHRyZWF0cyB0aGUgbGluZXMgYXMgZXF1YWwuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVVuaWZpZWREaWZmKFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRyZWxQYXRoOiBzdHJpbmcsXG5cdG9yaWdpbmFsVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdG1vZGlmaWVkVXJpOiBVUkksXG5cdGNoYW5nZVR5cGU6ICdhZGRlZCcgfCAnbW9kaWZpZWQnIHwgJ2RlbGV0ZWQnIHwgJ3JlbmFtZWQnXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHR0cnkge1xuXHRcdGxldCBvcmlnaW5hbENvbnRlbnQgPSAnJztcblx0XHRsZXQgbW9kaWZpZWRDb250ZW50ID0gJyc7XG5cblx0XHRpZiAob3JpZ2luYWxVcmkgJiYgY2hhbmdlVHlwZSAhPT0gJ2FkZGVkJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxGaWxlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUob3JpZ2luYWxVcmksIHsgbGltaXRzOiB7IHNpemU6IE1BWF9GSUxFX1NJWkVfQllURVMgfSB9KTtcblx0XHRcdFx0Y29uc3QgZGV0ZWN0ZWQgPSBkZXRlY3RFbmNvZGluZ0Zyb21CdWZmZXIoeyBidWZmZXI6IG9yaWdpbmFsRmlsZS52YWx1ZSwgYnl0ZXNSZWFkOiBvcmlnaW5hbEZpbGUudmFsdWUuYnl0ZUxlbmd0aCB9KTtcblx0XHRcdFx0aWYgKGRldGVjdGVkLnNlZW1zQmluYXJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2tpcCBiaW5hcnkgZmlsZXNcblx0XHRcdFx0fVxuXHRcdFx0XHRvcmlnaW5hbENvbnRlbnQgPSBvcmlnaW5hbEZpbGUudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2tpcCBmaWxlcyBleGNlZWRpbmcgc2l6ZSBsaW1pdFxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaGFuZ2VUeXBlID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VUeXBlICE9PSAnZGVsZXRlZCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkRmlsZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1vZGlmaWVkVXJpLCB7IGxpbWl0czogeyBzaXplOiBNQVhfRklMRV9TSVpFX0JZVEVTIH0gfSk7XG5cdFx0XHRcdGNvbnN0IGRldGVjdGVkID0gZGV0ZWN0RW5jb2RpbmdGcm9tQnVmZmVyKHsgYnVmZmVyOiBtb2RpZmllZEZpbGUudmFsdWUsIGJ5dGVzUmVhZDogbW9kaWZpZWRGaWxlLnZhbHVlLmJ5dGVMZW5ndGggfSk7XG5cdFx0XHRcdGlmIChkZXRlY3RlZC5zZWVtc0JpbmFyeSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHNraXAgYmluYXJ5IGZpbGVzXG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kaWZpZWRDb250ZW50ID0gbW9kaWZpZWRGaWxlLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHNraXAgZmlsZXMgZXhjZWVkaW5nIHNpemUgbGltaXRcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbENvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBtb2RpZmllZENvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXG5cdFx0Ly8gVHJhY2sgd2hldGhlciBmaWxlcyBlbmQgd2l0aCBuZXdsaW5lIGZvciBnaXQgYXBwbHkgY29tcGF0aWJpbGl0eVxuXHRcdC8vIHNwbGl0KCdcXG4nKSBvbiBcImxpbmUxXFxubGluZTJcXG5cIiBnaXZlcyBbXCJsaW5lMVwiLCBcImxpbmUyXCIsIFwiXCJdXG5cdFx0Ly8gc3BsaXQoJ1xcbicpIG9uIFwibGluZTFcXG5saW5lMlwiIGdpdmVzIFtcImxpbmUxXCIsIFwibGluZTJcIl1cblx0XHRjb25zdCBvcmlnaW5hbEVuZHNXaXRoTmV3bGluZSA9IG9yaWdpbmFsQ29udGVudC5sZW5ndGggPiAwICYmIG9yaWdpbmFsQ29udGVudC5lbmRzV2l0aCgnXFxuJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRFbmRzV2l0aE5ld2xpbmUgPSBtb2RpZmllZENvbnRlbnQubGVuZ3RoID4gMCAmJiBtb2RpZmllZENvbnRlbnQuZW5kc1dpdGgoJ1xcbicpO1xuXG5cdFx0Ly8gUmVtb3ZlIHRyYWlsaW5nIGVtcHR5IGVsZW1lbnQgaWYgZmlsZSBlbmRzIHdpdGggbmV3bGluZVxuXHRcdGlmIChvcmlnaW5hbEVuZHNXaXRoTmV3bGluZSAmJiBvcmlnaW5hbExpbmVzLmxlbmd0aCA+IDAgJiYgb3JpZ2luYWxMaW5lc1tvcmlnaW5hbExpbmVzLmxlbmd0aCAtIDFdID09PSAnJykge1xuXHRcdFx0b3JpZ2luYWxMaW5lcy5wb3AoKTtcblx0XHR9XG5cdFx0aWYgKG1vZGlmaWVkRW5kc1dpdGhOZXdsaW5lICYmIG1vZGlmaWVkTGluZXMubGVuZ3RoID4gMCAmJiBtb2RpZmllZExpbmVzW21vZGlmaWVkTGluZXMubGVuZ3RoIC0gMV0gPT09ICcnKSB7XG5cdFx0XHRtb2RpZmllZExpbmVzLnBvcCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZMaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhUGF0aCA9IGNoYW5nZVR5cGUgPT09ICdhZGRlZCcgPyAnL2Rldi9udWxsJyA6IGBhLyR7cmVsUGF0aH1gO1xuXHRcdGNvbnN0IGJQYXRoID0gY2hhbmdlVHlwZSA9PT0gJ2RlbGV0ZWQnID8gJy9kZXYvbnVsbCcgOiBgYi8ke3JlbFBhdGh9YDtcblxuXHRcdGRpZmZMaW5lcy5wdXNoKGAtLS0gJHthUGF0aH1gKTtcblx0XHRkaWZmTGluZXMucHVzaChgKysrICR7YlBhdGh9YCk7XG5cblx0XHRpZiAoY2hhbmdlVHlwZSA9PT0gJ2FkZGVkJykge1xuXHRcdFx0aWYgKG1vZGlmaWVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkaWZmTGluZXMucHVzaChgQEAgLTAsMCArMSwke21vZGlmaWVkTGluZXMubGVuZ3RofSBAQGApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbW9kaWZpZWRMaW5lcykge1xuXHRcdFx0XHRcdGRpZmZMaW5lcy5wdXNoKGArJHtsaW5lfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbW9kaWZpZWRFbmRzV2l0aE5ld2xpbmUpIHtcblx0XHRcdFx0XHRkaWZmTGluZXMucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNoYW5nZVR5cGUgPT09ICdkZWxldGVkJykge1xuXHRcdFx0aWYgKG9yaWdpbmFsTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkaWZmTGluZXMucHVzaChgQEAgLTEsJHtvcmlnaW5hbExpbmVzLmxlbmd0aH0gKzAsMCBAQGApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3JpZ2luYWxMaW5lcykge1xuXHRcdFx0XHRcdGRpZmZMaW5lcy5wdXNoKGAtJHtsaW5lfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghb3JpZ2luYWxFbmRzV2l0aE5ld2xpbmUpIHtcblx0XHRcdFx0XHRkaWZmTGluZXMucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaHVua3MgPSBjb21wdXRlRGlmZkh1bmtzKG9yaWdpbmFsTGluZXMsIG1vZGlmaWVkTGluZXMsIG9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lLCBtb2RpZmllZEVuZHNXaXRoTmV3bGluZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGh1bmsgb2YgaHVua3MpIHtcblx0XHRcdFx0ZGlmZkxpbmVzLnB1c2goaHVuayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpZmZMaW5lcy5qb2luKCdcXG4nKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIENvbXB1dGVzIHVuaWZpZWQgZGlmZiBodW5rcyB1c2luZyBWUyBDb2RlJ3MgZGlmZiBhbGdvcml0aG0uXG4gKiBNZXJnZXMgYWRqYWNlbnQvb3ZlcmxhcHBpbmcgaHVua3MgdG8gcHJvZHVjZSBhIHZhbGlkIHBhdGNoLlxuICovXG5mdW5jdGlvbiBjb21wdXRlRGlmZkh1bmtzKFxuXHRvcmlnaW5hbExpbmVzOiBzdHJpbmdbXSxcblx0bW9kaWZpZWRMaW5lczogc3RyaW5nW10sXG5cdG9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lOiBib29sZWFuLFxuXHRtb2RpZmllZEVuZHNXaXRoTmV3bGluZTogYm9vbGVhblxuKTogc3RyaW5nW10ge1xuXHRjb25zdCBjb250ZXh0U2l6ZSA9IDM7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRjb25zdCBkaWZmQ29tcHV0ZXIgPSBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0RGVmYXVsdCgpO1xuXHRjb25zdCBkaWZmUmVzdWx0ID0gZGlmZkNvbXB1dGVyLmNvbXB1dGVEaWZmKG9yaWdpbmFsTGluZXMsIG1vZGlmaWVkTGluZXMsIHtcblx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsXG5cdFx0bWF4Q29tcHV0YXRpb25UaW1lTXM6IDEwMDAsXG5cdFx0Y29tcHV0ZU1vdmVzOiBmYWxzZVxuXHR9KTtcblxuXHRpZiAoZGlmZlJlc3VsdC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyBHcm91cCBjaGFuZ2VzIHRoYXQgc2hvdWxkIGJlIG1lcmdlZCBpbnRvIHRoZSBzYW1lIGh1bmtcblx0Ly8gQ2hhbmdlcyBhcmUgbWVyZ2VkIGlmIHRoZWlyIGNvbnRleHQgcmVnaW9ucyB3b3VsZCBvdmVybGFwXG5cdHR5cGUgQ2hhbmdlID0gdHlwZW9mIGRpZmZSZXN1bHQuY2hhbmdlc1tudW1iZXJdO1xuXHRjb25zdCBodW5rR3JvdXBzOiBDaGFuZ2VbXVtdID0gW107XG5cdGxldCBjdXJyZW50R3JvdXA6IENoYW5nZVtdID0gW107XG5cblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZGlmZlJlc3VsdC5jaGFuZ2VzKSB7XG5cdFx0aWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPT09IDApIHtcblx0XHRcdGN1cnJlbnRHcm91cC5wdXNoKGNoYW5nZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxhc3RDaGFuZ2UgPSBjdXJyZW50R3JvdXBbY3VycmVudEdyb3VwLmxlbmd0aCAtIDFdO1xuXHRcdFx0Y29uc3QgbGFzdENvbnRleHRFbmQgPSBsYXN0Q2hhbmdlLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxICsgY29udGV4dFNpemU7XG5cdFx0XHRjb25zdCBjdXJyZW50Q29udGV4dFN0YXJ0ID0gY2hhbmdlLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIGNvbnRleHRTaXplO1xuXG5cdFx0XHQvLyBNZXJnZSBpZiBjb250ZXh0IHJlZ2lvbnMgb3ZlcmxhcCBvciBhcmUgYWRqYWNlbnRcblx0XHRcdGlmIChjdXJyZW50Q29udGV4dFN0YXJ0IDw9IGxhc3RDb250ZXh0RW5kICsgMSkge1xuXHRcdFx0XHRjdXJyZW50R3JvdXAucHVzaChjaGFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aHVua0dyb3Vwcy5wdXNoKGN1cnJlbnRHcm91cCk7XG5cdFx0XHRcdGN1cnJlbnRHcm91cCA9IFtjaGFuZ2VdO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcblx0XHRodW5rR3JvdXBzLnB1c2goY3VycmVudEdyb3VwKTtcblx0fVxuXG5cdC8vIEdlbmVyYXRlIGEgc2luZ2xlIGh1bmsgZm9yIGVhY2ggZ3JvdXBcblx0Zm9yIChjb25zdCBncm91cCBvZiBodW5rR3JvdXBzKSB7XG5cdFx0Y29uc3QgZmlyc3RDaGFuZ2UgPSBncm91cFswXTtcblx0XHRjb25zdCBsYXN0Q2hhbmdlID0gZ3JvdXBbZ3JvdXAubGVuZ3RoIC0gMV07XG5cblx0XHRjb25zdCBodW5rT3JpZ1N0YXJ0ID0gTWF0aC5tYXgoMSwgZmlyc3RDaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyIC0gY29udGV4dFNpemUpO1xuXHRcdGNvbnN0IGh1bmtPcmlnRW5kID0gTWF0aC5taW4ob3JpZ2luYWxMaW5lcy5sZW5ndGgsIGxhc3RDaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEgKyBjb250ZXh0U2l6ZSk7XG5cdFx0Y29uc3QgaHVua01vZFN0YXJ0ID0gTWF0aC5tYXgoMSwgZmlyc3RDaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIC0gY29udGV4dFNpemUpO1xuXG5cdFx0Y29uc3QgaHVua0xpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdC8vIFRyYWNrIHdoaWNoIGxpbmUgaW4gaHVua0xpbmVzIGNvcnJlc3BvbmRzIHRvIHRoZSBsYXN0IGxpbmUgb2YgZWFjaCBmaWxlXG5cdFx0bGV0IGxhc3RPcmlnaW5hbExpbmVJbmRleCA9IC0xO1xuXHRcdGxldCBsYXN0TW9kaWZpZWRMaW5lSW5kZXggPSAtMTtcblxuXHRcdGxldCBvcmlnTGluZU51bSA9IGh1bmtPcmlnU3RhcnQ7XG5cdFx0bGV0IG9yaWdDb3VudCA9IDA7XG5cdFx0bGV0IG1vZENvdW50ID0gMDtcblxuXHRcdC8vIFByb2Nlc3MgZWFjaCBjaGFuZ2UgaW4gdGhlIGdyb3VwLCBlbWl0dGluZyBjb250ZXh0IGxpbmVzIGJldHdlZW4gdGhlbVxuXHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGdyb3VwKSB7XG5cdFx0XHRjb25zdCBvcmlnU3RhcnQgPSBjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgb3JpZ0VuZCA9IGNoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXHRcdFx0Y29uc3QgbW9kU3RhcnQgPSBjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgbW9kRW5kID0gY2hhbmdlLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cblx0XHRcdC8vIEVtaXQgY29udGV4dCBsaW5lcyBiZWZvcmUgdGhpcyBjaGFuZ2Vcblx0XHRcdHdoaWxlIChvcmlnTGluZU51bSA8IG9yaWdTdGFydCkge1xuXHRcdFx0XHRjb25zdCBpZHggPSBodW5rTGluZXMubGVuZ3RoO1xuXHRcdFx0XHRodW5rTGluZXMucHVzaChgICR7b3JpZ2luYWxMaW5lc1tvcmlnTGluZU51bSAtIDFdfWApO1xuXHRcdFx0XHQvLyBDb250ZXh0IGxpbmVzIGFyZSBpbiBib3RoIGZpbGVzXG5cdFx0XHRcdGlmIChvcmlnTGluZU51bSA9PT0gb3JpZ2luYWxMaW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRsYXN0T3JpZ2luYWxMaW5lSW5kZXggPSBpZHg7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kTGluZU51bSA9IGh1bmtNb2RTdGFydCArIG1vZENvdW50O1xuXHRcdFx0XHRpZiAobW9kTGluZU51bSA9PT0gbW9kaWZpZWRMaW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRsYXN0TW9kaWZpZWRMaW5lSW5kZXggPSBpZHg7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3JpZ0xpbmVOdW0rKztcblx0XHRcdFx0b3JpZ0NvdW50Kys7XG5cdFx0XHRcdG1vZENvdW50Kys7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVtaXQgZGVsZXRlZCBsaW5lc1xuXHRcdFx0Zm9yIChsZXQgaSA9IG9yaWdTdGFydDsgaSA8IG9yaWdFbmQ7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpZHggPSBodW5rTGluZXMubGVuZ3RoO1xuXHRcdFx0XHRodW5rTGluZXMucHVzaChgLSR7b3JpZ2luYWxMaW5lc1tpIC0gMV19YCk7XG5cdFx0XHRcdGlmIChpID09PSBvcmlnaW5hbExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGxhc3RPcmlnaW5hbExpbmVJbmRleCA9IGlkeDtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcmlnTGluZU51bSsrO1xuXHRcdFx0XHRvcmlnQ291bnQrKztcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1pdCBhZGRlZCBsaW5lc1xuXHRcdFx0Zm9yIChsZXQgaSA9IG1vZFN0YXJ0OyBpIDwgbW9kRW5kOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gaHVua0xpbmVzLmxlbmd0aDtcblx0XHRcdFx0aHVua0xpbmVzLnB1c2goYCske21vZGlmaWVkTGluZXNbaSAtIDFdfWApO1xuXHRcdFx0XHRpZiAoaSA9PT0gbW9kaWZpZWRMaW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRsYXN0TW9kaWZpZWRMaW5lSW5kZXggPSBpZHg7XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kQ291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbWl0IHRyYWlsaW5nIGNvbnRleHQgbGluZXNcblx0XHR3aGlsZSAob3JpZ0xpbmVOdW0gPD0gaHVua09yaWdFbmQpIHtcblx0XHRcdGNvbnN0IGlkeCA9IGh1bmtMaW5lcy5sZW5ndGg7XG5cdFx0XHRodW5rTGluZXMucHVzaChgICR7b3JpZ2luYWxMaW5lc1tvcmlnTGluZU51bSAtIDFdfWApO1xuXHRcdFx0Ly8gQ29udGV4dCBsaW5lcyBhcmUgaW4gYm90aCBmaWxlc1xuXHRcdFx0aWYgKG9yaWdMaW5lTnVtID09PSBvcmlnaW5hbExpbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRsYXN0T3JpZ2luYWxMaW5lSW5kZXggPSBpZHg7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RMaW5lTnVtID0gaHVua01vZFN0YXJ0ICsgbW9kQ291bnQ7XG5cdFx0XHRpZiAobW9kTGluZU51bSA9PT0gbW9kaWZpZWRMaW5lcy5sZW5ndGgpIHtcblx0XHRcdFx0bGFzdE1vZGlmaWVkTGluZUluZGV4ID0gaWR4O1xuXHRcdFx0fVxuXHRcdFx0b3JpZ0xpbmVOdW0rKztcblx0XHRcdG9yaWdDb3VudCsrO1xuXHRcdFx0bW9kQ291bnQrKztcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChgQEAgLSR7aHVua09yaWdTdGFydH0sJHtvcmlnQ291bnR9ICske2h1bmtNb2RTdGFydH0sJHttb2RDb3VudH0gQEBgKTtcblxuXHRcdC8vIEFkZCBcIk5vIG5ld2xpbmUgYXQgZW5kIG9mIGZpbGVcIiBtYXJrZXJzIGZvciBnaXQgYXBwbHkgY29tcGF0aWJpbGl0eVxuXHRcdC8vIFRoZSBtYXJrZXIgbXVzdCBhcHBlYXIgaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIGxpbmUgdGhhdCBsYWNrcyBhIG5ld2xpbmVcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGh1bmtMaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmVzdWx0LnB1c2goaHVua0xpbmVzW2ldKTtcblxuXHRcdFx0Y29uc3QgaXNMYXN0T3JpZ2luYWwgPSBpID09PSBsYXN0T3JpZ2luYWxMaW5lSW5kZXg7XG5cdFx0XHRjb25zdCBpc0xhc3RNb2RpZmllZCA9IGkgPT09IGxhc3RNb2RpZmllZExpbmVJbmRleDtcblxuXHRcdFx0aWYgKGlzTGFzdE9yaWdpbmFsICYmIGlzTGFzdE1vZGlmaWVkKSB7XG5cdFx0XHRcdC8vIENvbnRleHQgbGluZSBpcyB0aGUgbGFzdCBsaW5lIG9mIGJvdGggZmlsZXNcblx0XHRcdFx0Ly8gSWYgZWl0aGVyIGxhY2tzIG5ld2xpbmUsIHdlIG5lZWQgYSBtYXJrZXIgKGJ1dCBvbmx5IG9uZSlcblx0XHRcdFx0aWYgKCFvcmlnaW5hbEVuZHNXaXRoTmV3bGluZSB8fCAhbW9kaWZpZWRFbmRzV2l0aE5ld2xpbmUpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNMYXN0T3JpZ2luYWwgJiYgIW9yaWdpbmFsRW5kc1dpdGhOZXdsaW5lKSB7XG5cdFx0XHRcdC8vIERlbGV0aW9uIG9yIGNvbnRleHQgbGluZSB0aGF0J3Mgb25seSB0aGUgbGFzdCBvZiBvcmlnaW5hbFxuXHRcdFx0XHRyZXN1bHQucHVzaCgnXFxcXCBObyBuZXdsaW5lIGF0IGVuZCBvZiBmaWxlJyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTGFzdE1vZGlmaWVkICYmICFtb2RpZmllZEVuZHNXaXRoTmV3bGluZSkge1xuXHRcdFx0XHQvLyBBZGRpdGlvbiBvciBjb250ZXh0IGxpbmUgdGhhdCdzIG9ubHkgdGhlIGxhc3Qgb2YgbW9kaWZpZWRcblx0XHRcdFx0cmVzdWx0LnB1c2goJ1xcXFwgTm8gbmV3bGluZSBhdCBlbmQgb2YgZmlsZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ2FwdHVyZXMgbGlnaHR3ZWlnaHQgcmVwb3NpdG9yeSBtZXRhZGF0YSAoYnJhbmNoLCBjb21taXQsIHJlbW90ZSkgZnJvbSBTQ00gcHJvdmlkZXJzLlxuICogTm8gZmlsZSBJL08gb3IgZGlmZiBjb21wdXRhdGlvbiAtIHJlYWRzIG9ubHkgZnJvbSBhbHJlYWR5LWxvYWRlZCBTQ00gb2JzZXJ2YWJsZXMuXG4gKiBVc2VkIG9uIGNoYXQgbWVzc2FnZSBzdWJtaXNzaW9uIHRvIHJlY29yZCB0aGUgcG9pbnQtaW4tdGltZSBjb21taXQgc3RhdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYXB0dXJlUmVwb01ldGFkYXRhKHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlKTogSUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlcG9zaXRvcmllcyA9IFsuLi5zY21TZXJ2aWNlLnJlcG9zaXRvcmllc107XG5cdGlmIChyZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHJlcG9zaXRvcnkgPSByZXBvc2l0b3JpZXNbMF07XG5cdGNvbnN0IHJvb3RVcmkgPSByZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmk7XG5cdGlmICghcm9vdFVyaSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgbG9jYWxCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGxvY2FsSGVhZENvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmVtb3RlVHJhY2tpbmdCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJlbW90ZUhlYWRDb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJlbW90ZUJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlcj8uZ2V0KCk7XG5cdGlmIChoaXN0b3J5UHJvdmlkZXIpIHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlZi5nZXQoKTtcblx0XHRsb2NhbEJyYW5jaCA9IGhpc3RvcnlJdGVtUmVmPy5uYW1lO1xuXHRcdGxvY2FsSGVhZENvbW1pdCA9IGhpc3RvcnlJdGVtUmVmPy5yZXZpc2lvbjtcblxuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpO1xuXHRcdGlmIChoaXN0b3J5SXRlbVJlbW90ZVJlZikge1xuXHRcdFx0cmVtb3RlVHJhY2tpbmdCcmFuY2ggPSBoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lO1xuXHRcdFx0cmVtb3RlSGVhZENvbW1pdCA9IGhpc3RvcnlJdGVtUmVtb3RlUmVmLnJldmlzaW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhpc3RvcnlJdGVtQmFzZVJlZiA9IGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbUJhc2VSZWYuZ2V0KCk7XG5cdFx0aWYgKGhpc3RvcnlJdGVtQmFzZVJlZikge1xuXHRcdFx0cmVtb3RlQmFzZUJyYW5jaCA9IGhpc3RvcnlJdGVtQmFzZVJlZi5uYW1lO1xuXHRcdH1cblx0fVxuXG5cdC8vIERldGVybWluZSB3b3Jrc3BhY2UgdHlwZSBhbmQgc3luYyBzdGF0dXMgd2l0aG91dCBmaWxlIEkvTy5cblx0Ly8gQ2Fubm90IGRldGVybWluZSByZW1vdGVVcmwvcmVtb3RlVmVuZG9yIG9yIGRldGVjdCBwbGFpbi1mb2xkZXIgaGVyZSAocmVxdWlyZXMgcmVhZGluZyAuZ2l0L2NvbmZpZykuXG5cdC8vIFRoZSBmdWxsIGNhcHR1cmVSZXBvSW5mbyBhdCBleHBvcnQgdGltZSB3aWxsIHByb2R1Y2UgYWNjdXJhdGUgY2xhc3NpZmljYXRpb24uXG5cdGxldCB3b3Jrc3BhY2VUeXBlOiBJRXhwb3J0YWJsZVJlcG9EYXRhWyd3b3Jrc3BhY2VUeXBlJ107XG5cdGxldCBzeW5jU3RhdHVzOiBJRXhwb3J0YWJsZVJlcG9EYXRhWydzeW5jU3RhdHVzJ107XG5cblx0aWYgKHJlbW90ZVRyYWNraW5nQnJhbmNoIHx8IHJlbW90ZUhlYWRDb21taXQgfHwgcmVtb3RlQmFzZUJyYW5jaCkge1xuXHRcdHdvcmtzcGFjZVR5cGUgPSAncmVtb3RlLWdpdCc7XG5cblx0XHRpZiAoIXJlbW90ZVRyYWNraW5nQnJhbmNoKSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3VucHVibGlzaGVkJztcblx0XHR9IGVsc2UgaWYgKGxvY2FsSGVhZENvbW1pdCAmJiByZW1vdGVIZWFkQ29tbWl0ICYmIGxvY2FsSGVhZENvbW1pdCA9PT0gcmVtb3RlSGVhZENvbW1pdCkge1xuXHRcdFx0c3luY1N0YXR1cyA9ICdzeW5jZWQnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3VucHVzaGVkJztcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gTm8gcmVtb3RlIHJlZnMgYXZhaWxhYmxlOyBjb25zZXJ2YXRpdmVseSBjbGFzc2lmeSBhcyBsb2NhbC1naXRcblx0XHR3b3Jrc3BhY2VUeXBlID0gJ2xvY2FsLWdpdCc7XG5cdFx0c3luY1N0YXR1cyA9ICdsb2NhbC1vbmx5Jztcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0d29ya3NwYWNlVHlwZSxcblx0XHRzeW5jU3RhdHVzLFxuXHRcdGxvY2FsQnJhbmNoLFxuXHRcdHJlbW90ZVRyYWNraW5nQnJhbmNoLFxuXHRcdHJlbW90ZUJhc2VCcmFuY2gsXG5cdFx0bG9jYWxIZWFkQ29tbWl0LFxuXHRcdHJlbW90ZUhlYWRDb21taXQsXG5cdFx0ZGlmZnNTdGF0dXM6ICdub3RDYXB0dXJlZCcsXG5cdH07XG59XG5cbi8qKlxuICogQ2FwdHVyZXMgZnVsbCByZXBvc2l0b3J5IHN0YXRlIGluY2x1ZGluZyB3b3JraW5nIHRyZWUgZGlmZnMuXG4gKiBQZXJmb3JtcyBmaWxlIEkvTyBhbmQgZGlmZiBjb21wdXRhdGlvbiAtIHNob3VsZCBvbmx5IGJlIGNhbGxlZCBvbiBleHBsaWNpdCB1c2VyIGFjdGlvbiAoZS5nLiwgZXhwb3J0KS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNhcHR1cmVSZXBvSW5mbyhzY21TZXJ2aWNlOiBJU0NNU2VydmljZSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8SUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCByZXBvc2l0b3JpZXMgPSBbLi4uc2NtU2VydmljZS5yZXBvc2l0b3JpZXNdO1xuXHRpZiAocmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCByZXBvc2l0b3J5ID0gcmVwb3NpdG9yaWVzWzBdO1xuXHRjb25zdCByb290VXJpID0gcmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpO1xuXHRpZiAoIXJvb3RVcmkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IGhhc0dpdCA9IGZhbHNlO1xuXHR0cnkge1xuXHRcdGNvbnN0IGdpdERpclVyaSA9IHJvb3RVcmkud2l0aCh7IHBhdGg6IGAke3Jvb3RVcmkucGF0aH0vLmdpdGAgfSk7XG5cdFx0aGFzR2l0ID0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGdpdERpclVyaSk7XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGlnbm9yZVxuXHR9XG5cblx0aWYgKCFoYXNHaXQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29ya3NwYWNlVHlwZTogJ3BsYWluLWZvbGRlcicsXG5cdFx0XHRzeW5jU3RhdHVzOiAnbm8tZ2l0Jyxcblx0XHRcdGRpZmZzOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0bGV0IHJlbW90ZVVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdC8vIFRPRE86IEhhbmRsZSBnaXQgd29ya3RyZWVzIHdoZXJlIC5naXQgaXMgYSBmaWxlIHBvaW50aW5nIHRvIHRoZSBhY3R1YWwgZ2l0IGRpcmVjdG9yeVxuXHRcdGNvbnN0IGdpdENvbmZpZ1VyaSA9IHJvb3RVcmkud2l0aCh7IHBhdGg6IGAke3Jvb3RVcmkucGF0aH0vLmdpdC9jb25maWdgIH0pO1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhnaXRDb25maWdVcmkpO1xuXHRcdGlmIChleGlzdHMpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShnaXRDb25maWdVcmkpO1xuXHRcdFx0Y29uc3QgcmVtb3RlcyA9IGdldFJhd1JlbW90ZXMoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdHJlbW90ZVVybCA9IHJlbW90ZXNbMF07XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHQvLyBpZ25vcmVcblx0fVxuXG5cdGxldCBsb2NhbEJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgbG9jYWxIZWFkQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCByZW1vdGVUcmFja2luZ0JyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmVtb3RlSGVhZENvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmVtb3RlQmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyPy5nZXQoKTtcblx0aWYgKGhpc3RvcnlQcm92aWRlcikge1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdGxvY2FsQnJhbmNoID0gaGlzdG9yeUl0ZW1SZWY/Lm5hbWU7XG5cdFx0bG9jYWxIZWFkQ29tbWl0ID0gaGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uO1xuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSBoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCk7XG5cdFx0aWYgKGhpc3RvcnlJdGVtUmVtb3RlUmVmKSB7XG5cdFx0XHRyZW1vdGVUcmFja2luZ0JyYW5jaCA9IGhpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWU7XG5cdFx0XHRyZW1vdGVIZWFkQ29tbWl0ID0gaGlzdG9yeUl0ZW1SZW1vdGVSZWYucmV2aXNpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1CYXNlUmVmID0gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKTtcblx0XHRpZiAoaGlzdG9yeUl0ZW1CYXNlUmVmKSB7XG5cdFx0XHRyZW1vdGVCYXNlQnJhbmNoID0gaGlzdG9yeUl0ZW1CYXNlUmVmLm5hbWU7XG5cdFx0fVxuXHR9XG5cblx0bGV0IHdvcmtzcGFjZVR5cGU6IElFeHBvcnRhYmxlUmVwb0RhdGFbJ3dvcmtzcGFjZVR5cGUnXTtcblx0bGV0IHN5bmNTdGF0dXM6IElFeHBvcnRhYmxlUmVwb0RhdGFbJ3N5bmNTdGF0dXMnXTtcblxuXHRpZiAoIXJlbW90ZVVybCkge1xuXHRcdHdvcmtzcGFjZVR5cGUgPSAnbG9jYWwtZ2l0Jztcblx0XHRzeW5jU3RhdHVzID0gJ2xvY2FsLW9ubHknO1xuXHR9IGVsc2Uge1xuXHRcdHdvcmtzcGFjZVR5cGUgPSAncmVtb3RlLWdpdCc7XG5cblx0XHRpZiAoIXJlbW90ZVRyYWNraW5nQnJhbmNoKSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3VucHVibGlzaGVkJztcblx0XHR9IGVsc2UgaWYgKGxvY2FsSGVhZENvbW1pdCA9PT0gcmVtb3RlSGVhZENvbW1pdCkge1xuXHRcdFx0c3luY1N0YXR1cyA9ICdzeW5jZWQnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzeW5jU3RhdHVzID0gJ3VucHVzaGVkJztcblx0XHR9XG5cdH1cblxuXHRsZXQgcmVtb3RlVmVuZG9yOiBJRXhwb3J0YWJsZVJlcG9EYXRhWydyZW1vdGVWZW5kb3InXTtcblx0aWYgKHJlbW90ZVVybCkge1xuXHRcdGNvbnN0IGhvc3QgPSBnZXRSZW1vdGVIb3N0KHJlbW90ZVVybCk7XG5cdFx0aWYgKGhvc3QgPT09ICdnaXRodWIuY29tJykge1xuXHRcdFx0cmVtb3RlVmVuZG9yID0gJ2dpdGh1Yic7XG5cdFx0fSBlbHNlIGlmIChob3N0ID09PSAnZGV2LmF6dXJlLmNvbScgfHwgKGhvc3QgJiYgaG9zdC5lbmRzV2l0aCgnLnZpc3VhbHN0dWRpby5jb20nKSkpIHtcblx0XHRcdHJlbW90ZVZlbmRvciA9ICdhZG8nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW1vdGVWZW5kb3IgPSAnb3RoZXInO1xuXHRcdH1cblx0fVxuXG5cdGxldCB0b3RhbENoYW5nZUNvdW50ID0gMDtcblx0Zm9yIChjb25zdCBncm91cCBvZiByZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcykge1xuXHRcdHRvdGFsQ2hhbmdlQ291bnQgKz0gZ3JvdXAucmVzb3VyY2VzLmxlbmd0aDtcblx0fVxuXG5cdGNvbnN0IGJhc2VSZXBvRGF0YTogT21pdDxJRXhwb3J0YWJsZVJlcG9EYXRhLCAnZGlmZnMnIHwgJ2RpZmZzU3RhdHVzJyB8ICdjaGFuZ2VkRmlsZUNvdW50Jz4gPSB7XG5cdFx0d29ya3NwYWNlVHlwZSxcblx0XHRzeW5jU3RhdHVzLFxuXHRcdHJlbW90ZVVybCxcblx0XHRyZW1vdGVWZW5kb3IsXG5cdFx0bG9jYWxCcmFuY2gsXG5cdFx0cmVtb3RlVHJhY2tpbmdCcmFuY2gsXG5cdFx0cmVtb3RlQmFzZUJyYW5jaCxcblx0XHRsb2NhbEhlYWRDb21taXQsXG5cdFx0cmVtb3RlSGVhZENvbW1pdCxcblx0fTtcblxuXHRpZiAodG90YWxDaGFuZ2VDb3VudCA9PT0gMCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5iYXNlUmVwb0RhdGEsXG5cdFx0XHRkaWZmczogdW5kZWZpbmVkLFxuXHRcdFx0ZGlmZnNTdGF0dXM6ICdub0NoYW5nZXMnLFxuXHRcdFx0Y2hhbmdlZEZpbGVDb3VudDogMFxuXHRcdH07XG5cdH1cblxuXHRpZiAodG90YWxDaGFuZ2VDb3VudCA+IE1BWF9DSEFOR0VTKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJhc2VSZXBvRGF0YSxcblx0XHRcdGRpZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRkaWZmc1N0YXR1czogJ3Rvb01hbnlDaGFuZ2VzJyxcblx0XHRcdGNoYW5nZWRGaWxlQ291bnQ6IHRvdGFsQ2hhbmdlQ291bnRcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgZGlmZnM6IElFeHBvcnRhYmxlUmVwb0RpZmZbXSA9IFtdO1xuXHRjb25zdCBkaWZmUHJvbWlzZXM6IFByb21pc2U8SUV4cG9ydGFibGVSZXBvRGlmZiB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgZ3JvdXAgb2YgcmVwb3NpdG9yeS5wcm92aWRlci5ncm91cHMpIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGdyb3VwLnJlc291cmNlcykge1xuXHRcdFx0Y29uc3QgcmVsUGF0aCA9IHJlbGF0aXZlUGF0aChyb290VXJpLCByZXNvdXJjZS5zb3VyY2VVcmkpID8/IHJlc291cmNlLnNvdXJjZVVyaS5wYXRoO1xuXHRcdFx0Y29uc3QgY2hhbmdlVHlwZSA9IGRldGVybWluZUNoYW5nZVR5cGUocmVzb3VyY2UsIGdyb3VwLmlkKTtcblxuXHRcdFx0Y29uc3QgZGlmZlByb21pc2UgPSAoYXN5bmMgKCk6IFByb21pc2U8SUV4cG9ydGFibGVSZXBvRGlmZiB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCB1bmlmaWVkRGlmZiA9IGF3YWl0IGdlbmVyYXRlVW5pZmllZERpZmYoXG5cdFx0XHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRcdFx0cmVsUGF0aCxcblx0XHRcdFx0XHRyZXNvdXJjZS5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSxcblx0XHRcdFx0XHRyZXNvdXJjZS5zb3VyY2VVcmksXG5cdFx0XHRcdFx0Y2hhbmdlVHlwZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVsYXRpdmVQYXRoOiByZWxQYXRoLFxuXHRcdFx0XHRcdGNoYW5nZVR5cGUsXG5cdFx0XHRcdFx0c3RhdHVzOiBncm91cC5sYWJlbCB8fCBncm91cC5pZCxcblx0XHRcdFx0XHR1bmlmaWVkRGlmZlxuXHRcdFx0XHR9O1xuXHRcdFx0fSkoKTtcblxuXHRcdFx0ZGlmZlByb21pc2VzLnB1c2goZGlmZlByb21pc2UpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGdlbmVyYXRlZERpZmZzID0gYXdhaXQgUHJvbWlzZS5hbGwoZGlmZlByb21pc2VzKTtcblx0Zm9yIChjb25zdCBkaWZmIG9mIGdlbmVyYXRlZERpZmZzKSB7XG5cdFx0aWYgKGRpZmYpIHtcblx0XHRcdGRpZmZzLnB1c2goZGlmZik7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZGlmZnNKc29uID0gSlNPTi5zdHJpbmdpZnkoZGlmZnMpO1xuXHRjb25zdCBkaWZmc1NpemVCeXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShkaWZmc0pzb24pLmxlbmd0aDtcblxuXHRpZiAoZGlmZnNTaXplQnl0ZXMgPiBNQVhfRElGRlNfU0laRV9CWVRFUykge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5iYXNlUmVwb0RhdGEsXG5cdFx0XHRkaWZmczogdW5kZWZpbmVkLFxuXHRcdFx0ZGlmZnNTdGF0dXM6ICd0b29MYXJnZScsXG5cdFx0XHRjaGFuZ2VkRmlsZUNvdW50OiB0b3RhbENoYW5nZUNvdW50XG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0Li4uYmFzZVJlcG9EYXRhLFxuXHRcdGRpZmZzLFxuXHRcdGRpZmZzU3RhdHVzOiAnaW5jbHVkZWQnLFxuXHRcdGNoYW5nZWRGaWxlQ291bnQ6IHRvdGFsQ2hhbmdlQ291bnRcblx0fTtcbn1cblxuLyoqXG4gKiBDYXB0dXJlcyBsaWdodHdlaWdodCByZXBvc2l0b3J5IG1ldGFkYXRhIGZvciBjaGF0IHNlc3Npb25zIG9uIGZpcnN0IG1lc3NhZ2UuXG4gKiBPbmx5IHJlYWRzIGZyb20gYWxyZWFkeS1sb2FkZWQgU0NNIHByb3ZpZGVyIG9ic2VydmFibGVzLCBubyBmaWxlIEkvTy5cbiAqIEZ1bGwgZGlmZiBjYXB0dXJlIGlzIGRlZmVycmVkIHRvIGV4cG9ydCB0aW1lIChzZWUgY2hhdEV4cG9ydFppcC50cykuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0UmVwb0luZm9Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRSZXBvSW5mbyc7XG5cblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvblJlZ2lzdGVyZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ29uZmlndXJhdGlvbklmSW50ZXJuYWwoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyQ29uZmlndXJhdGlvbklmSW50ZXJuYWwoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdCgoeyBjaGF0U2Vzc2lvblJlc291cmNlIH0pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNhcHR1cmVBbmRTZXRSZXBvTWV0YWRhdGEobW9kZWwpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb25maWd1cmF0aW9uSWZJbnRlcm5hbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblJlZ2lzdGVyZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5pc0ludGVybmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0aWQ6ICdjaGF0UmVwb0luZm8nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdFJlcG9JbmZvQ29uZmlndXJhdGlvblRpdGxlJywgXCJDaGF0IFJlcG9zaXRvcnkgSW5mb1wiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUmVwb0luZm9FbmFibGVkXToge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlcG9JbmZvLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGlnaHR3ZWlnaHQgcmVwb3NpdG9yeSBtZXRhZGF0YSAoYnJhbmNoLCBjb21taXQsIHJlbW90ZXMpIGlzIGNhcHR1cmVkIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgc3VibWl0dGVkIGZvciBpbnRlcm5hbCBkaWFnbm9zdGljcy5cIiksXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tDaGF0UmVwb0luZm9dIENvbmZpZ3VyYXRpb24gcmVnaXN0ZXJlZCBmb3IgaW50ZXJuYWwgdXNlcicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhcHR1cmVzIGxpZ2h0d2VpZ2h0IG1ldGFkYXRhIChicmFuY2gsIGNvbW1pdCwgcmVtb3RlIHJlZnMpIG9uIGZpcnN0IG1lc3NhZ2UuXG5cdCAqIFN5bmNocm9ub3VzLCBubyBmaWxlIEkvTy4gUmVhZHMgb25seSBmcm9tIFNDTSBwcm92aWRlciBvYnNlcnZhYmxlcy5cblx0ICovXG5cdHByaXZhdGUgY2FwdHVyZUFuZFNldFJlcG9NZXRhZGF0YShtb2RlbDogSUNoYXRNb2RlbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmlzSW50ZXJuYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUmVwb0luZm9FbmFibGVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbC5yZXBvRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGNhcHR1cmVSZXBvTWV0YWRhdGEodGhpcy5zY21TZXJ2aWNlKTtcblx0XHRcdGlmIChtZXRhZGF0YSkge1xuXHRcdFx0XHRtb2RlbC5zZXRSZXBvRGF0YShtZXRhZGF0YSk7XG5cdFx0XHRcdGlmICghbWV0YWRhdGEubG9jYWxIZWFkQ29tbWl0KSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tDaGF0UmVwb0luZm9dIENhcHR1cmVkIHJlcG8gbWV0YWRhdGEgd2l0aG91dCBjb21taXQgaGFzaCAtIGdpdCBoaXN0b3J5IG1heSBub3QgYmUgcmVhZHknKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbQ2hhdFJlcG9JbmZvXSBObyBTQ00gcmVwb3NpdG9yeSBhdmFpbGFibGUgZm9yIGNoYXQgc2Vzc2lvbicpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0NoYXRSZXBvSW5mb10gRmFpbGVkIHRvIGNhcHR1cmUgcmVwbyBtZXRhZGF0YTonLCBlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYywrQkFBdUQ7QUFDOUUsU0FBdUIsb0JBQW9CLDJCQUEyQjtBQUN0RSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFpQztBQUMxQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUVsQyxZQUFZLFNBQVM7QUFFckIsTUFBTSxjQUFjO0FBQ3BC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
