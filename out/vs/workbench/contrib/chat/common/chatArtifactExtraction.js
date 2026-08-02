import { match as globMatch } from "../../../../base/common/glob.js";
import { getExtensionForMimeType } from "../../../../base/common/mime.js";
import { basename as pathBasename } from "../../../../base/common/path.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IChatToolInvocation } from "./chatService/chatService.js";
import { ChatResponseResource } from "./model/chatModel.js";
import { isToolResultInputOutputDetails } from "./tools/languageModelToolsService.js";
const CHAT_MEMORY_FILE_SCHEME = "chat-memory-file";
const MEMORY_TOOL_ID = "copilot_memory";
var ChatMemoryFileResource;
((ChatMemoryFileResource2) => {
  function createUri(memoryPath, sessionResource) {
    return URI.from({
      scheme: CHAT_MEMORY_FILE_SCHEME,
      path: memoryPath,
      query: sessionResource.toString()
    });
  }
  ChatMemoryFileResource2.createUri = createUri;
  function isChatMemoryFileUri(uri) {
    return uri.scheme === CHAT_MEMORY_FILE_SCHEME;
  }
  ChatMemoryFileResource2.isChatMemoryFileUri = isChatMemoryFileUri;
  function parse(uri) {
    return {
      memoryPath: uri.path,
      sessionResource: uri.query
    };
  }
  ChatMemoryFileResource2.parse = parse;
})(ChatMemoryFileResource || (ChatMemoryFileResource = {}));
function matchMimeType(pattern, mimeType) {
  if (pattern === mimeType) {
    return true;
  }
  const [patternType, patternSubtype] = pattern.split("/");
  const [type] = mimeType.split("/");
  return patternSubtype === "*" && patternType === type;
}
function findFilePathRule(filePath, byFilePath) {
  const fileBasename = pathBasename(filePath);
  for (const [pattern, config] of Object.entries(byFilePath)) {
    if (globMatch(pattern, filePath) || globMatch(pattern, fileBasename)) {
      return config;
    }
  }
  return void 0;
}
function findMimeTypeRule(mimeType, byMimeType) {
  for (const [pattern, config] of Object.entries(byMimeType)) {
    if (matchMimeType(pattern, mimeType)) {
      return config;
    }
  }
  return void 0;
}
function isToolResultOutputDetailsSerialized(obj) {
  return typeof obj === "object" && obj !== null && "output" in obj && typeof obj.output === "object" && obj.output?.type === "data" && typeof obj.output?.mimeType === "string";
}
function getMemoryPathFromParams(params) {
  if (typeof params !== "object" || params === null) {
    return void 0;
  }
  const path = params["path"];
  return typeof path === "string" ? path : void 0;
}
const memoryWriteCommands = /* @__PURE__ */ new Set(["create", "str_replace", "insert"]);
function isMemoryWriteCommand(params) {
  if (typeof params !== "object" || params === null) {
    return false;
  }
  const command = params["command"];
  return typeof command === "string" && memoryWriteCommands.has(command);
}
function extractArtifactsFromResponse(response, sessionResource, byMimeType, byFilePath, byMemoryFilePath = {}) {
  const artifacts = [];
  const seenUris = /* @__PURE__ */ new Set();
  for (const part of response.value) {
    if (part.kind === "codeblockUri") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if (part.kind === "textEditGroup") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if (part.kind === "workspaceEdit") {
      for (const edit of part.edits) {
        const uri = edit.newResource ?? edit.oldResource;
        if (!uri) {
          continue;
        }
        const uriStr = uri.toString();
        if (seenUris.has(uriStr)) {
          continue;
        }
        const rule = findFilePathRule(uri.path, byFilePath);
        if (rule) {
          seenUris.add(uriStr);
          artifacts.push({
            label: basename(uri),
            uri: uriStr,
            type: "plan",
            groupName: rule.groupName,
            onlyShowGroup: rule.onlyShowGroup
          });
        }
      }
    }
    if (part.kind === "externalEdit") {
      const uri = part.uri;
      const uriStr = uri.toString();
      if (seenUris.has(uriStr)) {
        continue;
      }
      const rule = findFilePathRule(uri.path, byFilePath);
      if (rule) {
        seenUris.add(uriStr);
        artifacts.push({
          label: basename(uri),
          uri: uriStr,
          type: "plan",
          groupName: rule.groupName,
          onlyShowGroup: rule.onlyShowGroup
        });
      }
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolId === MEMORY_TOOL_ID) {
      const params = IChatToolInvocation.getParameters(part);
      const memoryPath = getMemoryPathFromParams(params);
      if (memoryPath && isMemoryWriteCommand(params)) {
        const rule = findFilePathRule(memoryPath, byMemoryFilePath);
        if (rule) {
          const key = `memory:${part.toolCallId}:${memoryPath}`;
          if (!seenUris.has(key)) {
            seenUris.add(key);
            artifacts.push({
              label: pathBasename(memoryPath),
              uri: ChatMemoryFileResource.createUri(memoryPath, sessionResource).toString(),
              type: "plan",
              groupName: rule.groupName,
              onlyShowGroup: rule.onlyShowGroup
            });
          }
        }
      }
    }
    if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
      const details = IChatToolInvocation.resultDetails(part);
      if (!details) {
        continue;
      }
      if (isToolResultInputOutputDetails(details)) {
        for (let i = 0; i < details.output.length; i++) {
          const outputPart = details.output[i];
          if (outputPart.type === "embed" && !outputPart.isText && outputPart.mimeType) {
            const rule = findMimeTypeRule(outputPart.mimeType, byMimeType);
            if (rule) {
              const key = `${part.toolCallId}:${i}`;
              if (!seenUris.has(key)) {
                seenUris.add(key);
                const ext = getExtensionForMimeType(outputPart.mimeType);
                const permalinkBasename = ext ? `file${ext}` : "file.bin";
                const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, i, permalinkBasename);
                artifacts.push({
                  label: outputPart.uri?.path.split("/").pop() ?? `${rule.groupName} ${i + 1}`,
                  uri: artifactUri.toString(),
                  toolCallId: part.toolCallId,
                  dataPartIndex: i,
                  type: "screenshot",
                  groupName: rule.groupName,
                  onlyShowGroup: rule.onlyShowGroup
                });
              }
            }
          }
        }
      }
      if (isToolResultOutputDetailsSerialized(details)) {
        const rule = findMimeTypeRule(details.output.mimeType, byMimeType);
        if (rule) {
          const key = `${part.toolCallId}:0`;
          if (!seenUris.has(key)) {
            seenUris.add(key);
            const ext = getExtensionForMimeType(details.output.mimeType);
            const permalinkBasename = ext ? `file${ext}` : "file.bin";
            const artifactUri = ChatResponseResource.createUri(sessionResource, part.toolCallId, 0, permalinkBasename);
            artifacts.push({
              label: `${rule.groupName}`,
              uri: artifactUri.toString(),
              toolCallId: part.toolCallId,
              dataPartIndex: 0,
              type: "screenshot",
              groupName: rule.groupName,
              onlyShowGroup: rule.onlyShowGroup
            });
          }
        }
      }
    }
  }
  return artifacts;
}
export {
  ChatMemoryFileResource,
  extractArtifactsFromResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRBcnRpZmFjdEV4dHJhY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYXRjaCBhcyBnbG9iTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkZvck1pbWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSBhcyBwYXRoQmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIH0gZnJvbSAnLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZSwgSVJlc3BvbnNlIH0gZnJvbSAnLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUFydGlmYWN0R3JvdXBDb25maWcsIElDaGF0QXJ0aWZhY3QgfSBmcm9tICcuL3Rvb2xzL2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB9IGZyb20gJy4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5cbmNvbnN0IENIQVRfTUVNT1JZX0ZJTEVfU0NIRU1FID0gJ2NoYXQtbWVtb3J5LWZpbGUnO1xuY29uc3QgTUVNT1JZX1RPT0xfSUQgPSAnY29waWxvdF9tZW1vcnknO1xuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRNZW1vcnlGaWxlUmVzb3VyY2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlVXJpKG1lbW9yeVBhdGg6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IENIQVRfTUVNT1JZX0ZJTEVfU0NIRU1FLFxuXHRcdFx0cGF0aDogbWVtb3J5UGF0aCxcblx0XHRcdHF1ZXJ5OiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0NoYXRNZW1vcnlGaWxlVXJpKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IENIQVRfTUVNT1JZX0ZJTEVfU0NIRU1FO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKHVyaTogVVJJKTogeyBtZW1vcnlQYXRoOiBzdHJpbmc7IHNlc3Npb25SZXNvdXJjZTogc3RyaW5nIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRtZW1vcnlQYXRoOiB1cmkucGF0aCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLnF1ZXJ5LFxuXHRcdH07XG5cdH1cbn1cblxuLyoqXG4gKiBNYXRjaGVzIGEgTUlNRSB0eXBlIGFnYWluc3QgYSBwYXR0ZXJuIHN1cHBvcnRpbmcgd2lsZGNhcmRzLlxuICogRS5nLiBgaW1hZ2UvKmAgbWF0Y2hlcyBgaW1hZ2UvcG5nYCwgYGltYWdlL2pwZWdgLCBldGMuXG4gKi9cbmZ1bmN0aW9uIG1hdGNoTWltZVR5cGUocGF0dGVybjogc3RyaW5nLCBtaW1lVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChwYXR0ZXJuID09PSBtaW1lVHlwZSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IFtwYXR0ZXJuVHlwZSwgcGF0dGVyblN1YnR5cGVdID0gcGF0dGVybi5zcGxpdCgnLycpO1xuXHRjb25zdCBbdHlwZV0gPSBtaW1lVHlwZS5zcGxpdCgnLycpO1xuXHRyZXR1cm4gcGF0dGVyblN1YnR5cGUgPT09ICcqJyAmJiBwYXR0ZXJuVHlwZSA9PT0gdHlwZTtcbn1cblxuLyoqXG4gKiBGaW5kcyB0aGUgZmlyc3QgbWF0Y2hpbmcgcnVsZSBmb3IgYSBmaWxlIHBhdGggZnJvbSBieUZpbGVQYXRoIHJ1bGVzLlxuICovXG5mdW5jdGlvbiBmaW5kRmlsZVBhdGhSdWxlKFxuXHRmaWxlUGF0aDogc3RyaW5nLFxuXHRieUZpbGVQYXRoOiBSZWNvcmQ8c3RyaW5nLCBJQXJ0aWZhY3RHcm91cENvbmZpZz5cbik6IElBcnRpZmFjdEdyb3VwQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZmlsZUJhc2VuYW1lID0gcGF0aEJhc2VuYW1lKGZpbGVQYXRoKTtcblx0Zm9yIChjb25zdCBbcGF0dGVybiwgY29uZmlnXSBvZiBPYmplY3QuZW50cmllcyhieUZpbGVQYXRoKSkge1xuXHRcdGlmIChnbG9iTWF0Y2gocGF0dGVybiwgZmlsZVBhdGgpIHx8IGdsb2JNYXRjaChwYXR0ZXJuLCBmaWxlQmFzZW5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEZpbmRzIHRoZSBmaXJzdCBtYXRjaGluZyBydWxlIGZvciBhIE1JTUUgdHlwZSBmcm9tIGJ5TWltZVR5cGUgcnVsZXMuXG4gKi9cbmZ1bmN0aW9uIGZpbmRNaW1lVHlwZVJ1bGUoXG5cdG1pbWVUeXBlOiBzdHJpbmcsXG5cdGJ5TWltZVR5cGU6IFJlY29yZDxzdHJpbmcsIElBcnRpZmFjdEdyb3VwQ29uZmlnPlxuKTogSUFydGlmYWN0R3JvdXBDb25maWcgfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IFtwYXR0ZXJuLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKGJ5TWltZVR5cGUpKSB7XG5cdFx0aWYgKG1hdGNoTWltZVR5cGUocGF0dGVybiwgbWltZVR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1Rvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZChvYmo6IHVua25vd24pOiBvYmogaXMgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCB7XG5cdHJldHVybiB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJiBvYmogIT09IG51bGxcblx0XHQmJiAnb3V0cHV0JyBpbiBvYmogJiYgdHlwZW9mIChvYmogYXMgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCkub3V0cHV0ID09PSAnb2JqZWN0J1xuXHRcdCYmIChvYmogYXMgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCkub3V0cHV0Py50eXBlID09PSAnZGF0YSdcblx0XHQmJiB0eXBlb2YgKG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQ/Lm1pbWVUeXBlID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gZ2V0TWVtb3J5UGF0aEZyb21QYXJhbXMocGFyYW1zOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBwYXJhbXMgIT09ICdvYmplY3QnIHx8IHBhcmFtcyA9PT0gbnVsbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcGF0aCA9IChwYXJhbXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydwYXRoJ107XG5cdHJldHVybiB0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycgPyBwYXRoIDogdW5kZWZpbmVkO1xufVxuXG5jb25zdCBtZW1vcnlXcml0ZUNvbW1hbmRzID0gbmV3IFNldChbJ2NyZWF0ZScsICdzdHJfcmVwbGFjZScsICdpbnNlcnQnXSk7XG5cbmZ1bmN0aW9uIGlzTWVtb3J5V3JpdGVDb21tYW5kKHBhcmFtczogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRpZiAodHlwZW9mIHBhcmFtcyAhPT0gJ29iamVjdCcgfHwgcGFyYW1zID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNvbW1hbmQgPSAocGFyYW1zIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsnY29tbWFuZCddO1xuXHRyZXR1cm4gdHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnICYmIG1lbW9yeVdyaXRlQ29tbWFuZHMuaGFzKGNvbW1hbmQpO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGFydGlmYWN0cyBmcm9tIGEgc2luZ2xlIHJlc3BvbnNlJ3MgY29udGVudCBwYXJ0cywgYXBwbHlpbmcgdGhlIGdpdmVuIHJ1bGVzLlxuICogUHVyZSBmdW5jdGlvbiwgbm8gc2lkZSBlZmZlY3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdEFydGlmYWN0c0Zyb21SZXNwb25zZShcblx0cmVzcG9uc2U6IElSZXNwb25zZSxcblx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdGJ5TWltZVR5cGU6IFJlY29yZDxzdHJpbmcsIElBcnRpZmFjdEdyb3VwQ29uZmlnPixcblx0YnlGaWxlUGF0aDogUmVjb3JkPHN0cmluZywgSUFydGlmYWN0R3JvdXBDb25maWc+LFxuXHRieU1lbW9yeUZpbGVQYXRoOiBSZWNvcmQ8c3RyaW5nLCBJQXJ0aWZhY3RHcm91cENvbmZpZz4gPSB7fSxcbik6IElDaGF0QXJ0aWZhY3RbXSB7XG5cdGNvbnN0IGFydGlmYWN0czogSUNoYXRBcnRpZmFjdFtdID0gW107XG5cdGNvbnN0IHNlZW5VcmlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0Ly8gRmlsZSB3cml0ZXM6IGNvZGVibG9ja1VyaVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdjb2RlYmxvY2tVcmknKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBwYXJ0LnVyaTtcblx0XHRcdGNvbnN0IHVyaVN0ciA9IHVyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKHNlZW5VcmlzLmhhcyh1cmlTdHIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRGaWxlUGF0aFJ1bGUodXJpLnBhdGgsIGJ5RmlsZVBhdGgpO1xuXHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0c2VlblVyaXMuYWRkKHVyaVN0cik7XG5cdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHR1cmk6IHVyaVN0cixcblx0XHRcdFx0XHR0eXBlOiAncGxhbicsXG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBydWxlLm9ubHlTaG93R3JvdXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbGUgd3JpdGVzOiB0ZXh0RWRpdEdyb3VwXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBwYXJ0LnVyaTtcblx0XHRcdGNvbnN0IHVyaVN0ciA9IHVyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKHNlZW5VcmlzLmhhcyh1cmlTdHIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRGaWxlUGF0aFJ1bGUodXJpLnBhdGgsIGJ5RmlsZVBhdGgpO1xuXHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0c2VlblVyaXMuYWRkKHVyaVN0cik7XG5cdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHR1cmk6IHVyaVN0cixcblx0XHRcdFx0XHR0eXBlOiAncGxhbicsXG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBydWxlLm9ubHlTaG93R3JvdXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbGUgd3JpdGVzOiB3b3Jrc3BhY2VFZGl0XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3dvcmtzcGFjZUVkaXQnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgcGFydC5lZGl0cykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBlZGl0Lm5ld1Jlc291cmNlID8/IGVkaXQub2xkUmVzb3VyY2U7XG5cdFx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChzZWVuVXJpcy5oYXModXJpU3RyKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJ1bGUgPSBmaW5kRmlsZVBhdGhSdWxlKHVyaS5wYXRoLCBieUZpbGVQYXRoKTtcblx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRzZWVuVXJpcy5hZGQodXJpU3RyKTtcblx0XHRcdFx0XHRhcnRpZmFjdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHRcdHVyaTogdXJpU3RyLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3BsYW4nLFxuXHRcdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbGUgd3JpdGVzOiBleHRlcm5hbEVkaXQgKGZyb20gYWdlbnQgaG9zdCBmaWxlIGVkaXRzKVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdleHRlcm5hbEVkaXQnKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBwYXJ0LnVyaTtcblx0XHRcdGNvbnN0IHVyaVN0ciA9IHVyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKHNlZW5VcmlzLmhhcyh1cmlTdHIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRGaWxlUGF0aFJ1bGUodXJpLnBhdGgsIGJ5RmlsZVBhdGgpO1xuXHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0c2VlblVyaXMuYWRkKHVyaVN0cik7XG5cdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHR1cmk6IHVyaVN0cixcblx0XHRcdFx0XHR0eXBlOiAncGxhbicsXG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiBydWxlLmdyb3VwTmFtZSxcblx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBydWxlLm9ubHlTaG93R3JvdXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1lbW9yeSB0b29sIGludm9jYXRpb25zXG5cdFx0aWYgKChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgcGFydC50b29sSWQgPT09IE1FTU9SWV9UT09MX0lEKSB7XG5cdFx0XHRjb25zdCBwYXJhbXMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmdldFBhcmFtZXRlcnMocGFydCk7XG5cdFx0XHRjb25zdCBtZW1vcnlQYXRoID0gZ2V0TWVtb3J5UGF0aEZyb21QYXJhbXMocGFyYW1zKTtcblx0XHRcdGlmIChtZW1vcnlQYXRoICYmIGlzTWVtb3J5V3JpdGVDb21tYW5kKHBhcmFtcykpIHtcblx0XHRcdFx0Y29uc3QgcnVsZSA9IGZpbmRGaWxlUGF0aFJ1bGUobWVtb3J5UGF0aCwgYnlNZW1vcnlGaWxlUGF0aCk7XG5cdFx0XHRcdGlmIChydWxlKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gYG1lbW9yeToke3BhcnQudG9vbENhbGxJZH06JHttZW1vcnlQYXRofWA7XG5cdFx0XHRcdFx0aWYgKCFzZWVuVXJpcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0c2VlblVyaXMuYWRkKGtleSk7XG5cdFx0XHRcdFx0XHRhcnRpZmFjdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBwYXRoQmFzZW5hbWUobWVtb3J5UGF0aCksXG5cdFx0XHRcdFx0XHRcdHVyaTogQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZS5jcmVhdGVVcmkobWVtb3J5UGF0aCwgc2Vzc2lvblJlc291cmNlKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAncGxhbicsXG5cdFx0XHRcdFx0XHRcdGdyb3VwTmFtZTogcnVsZS5ncm91cE5hbWUsXG5cdFx0XHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEltYWdlIHJlc3VsdHMgZnJvbSB0b29sIGludm9jYXRpb25zXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKHBhcnQpO1xuXHRcdFx0aWYgKCFkZXRhaWxzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyBcdTIwMTQgaGFzIG91dHB1dCBhcnJheSB3aXRoIGVtYmVkZGVkIGRhdGEgcGFydHNcblx0XHRcdGlmIChpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMoZGV0YWlscykpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkZXRhaWxzLm91dHB1dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IG91dHB1dFBhcnQgPSBkZXRhaWxzLm91dHB1dFtpXTtcblx0XHRcdFx0XHRpZiAob3V0cHV0UGFydC50eXBlID09PSAnZW1iZWQnICYmICFvdXRwdXRQYXJ0LmlzVGV4dCAmJiBvdXRwdXRQYXJ0Lm1pbWVUeXBlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBydWxlID0gZmluZE1pbWVUeXBlUnVsZShvdXRwdXRQYXJ0Lm1pbWVUeXBlLCBieU1pbWVUeXBlKTtcblx0XHRcdFx0XHRcdGlmIChydWxlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGtleSA9IGAke3BhcnQudG9vbENhbGxJZH06JHtpfWA7XG5cdFx0XHRcdFx0XHRcdGlmICghc2VlblVyaXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdFx0XHRzZWVuVXJpcy5hZGQoa2V5KTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBleHQgPSBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShvdXRwdXRQYXJ0Lm1pbWVUeXBlKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwZXJtYWxpbmtCYXNlbmFtZSA9IGV4dCA/IGBmaWxlJHtleHR9YCA6ICdmaWxlLmJpbic7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgYXJ0aWZhY3RVcmkgPSBDaGF0UmVzcG9uc2VSZXNvdXJjZS5jcmVhdGVVcmkoc2Vzc2lvblJlc291cmNlLCBwYXJ0LnRvb2xDYWxsSWQsIGksIHBlcm1hbGlua0Jhc2VuYW1lKTtcblx0XHRcdFx0XHRcdFx0XHRhcnRpZmFjdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogb3V0cHV0UGFydC51cmk/LnBhdGguc3BsaXQoJy8nKS5wb3AoKSA/PyBgJHtydWxlLmdyb3VwTmFtZX0gJHtpICsgMX1gLFxuXHRcdFx0XHRcdFx0XHRcdFx0dXJpOiBhcnRpZmFjdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogcGFydC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGF0YVBhcnRJbmRleDogaSxcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzY3JlZW5zaG90Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGdyb3VwTmFtZTogcnVsZS5ncm91cE5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiBydWxlLm9ubHlTaG93R3JvdXAsXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCBcdTIwMTQgc2luZ2xlIG91dHB1dCB3aXRoIG1pbWVUeXBlICsgYmFzZTY0RGF0YVxuXHRcdFx0aWYgKGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKGRldGFpbHMpKSB7XG5cdFx0XHRcdGNvbnN0IHJ1bGUgPSBmaW5kTWltZVR5cGVSdWxlKGRldGFpbHMub3V0cHV0Lm1pbWVUeXBlLCBieU1pbWVUeXBlKTtcblx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRjb25zdCBrZXkgPSBgJHtwYXJ0LnRvb2xDYWxsSWR9OjBgO1xuXHRcdFx0XHRcdGlmICghc2VlblVyaXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdHNlZW5VcmlzLmFkZChrZXkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZXh0ID0gZ2V0RXh0ZW5zaW9uRm9yTWltZVR5cGUoZGV0YWlscy5vdXRwdXQubWltZVR5cGUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGVybWFsaW5rQmFzZW5hbWUgPSBleHQgPyBgZmlsZSR7ZXh0fWAgOiAnZmlsZS5iaW4nO1xuXHRcdFx0XHRcdFx0Y29uc3QgYXJ0aWZhY3RVcmkgPSBDaGF0UmVzcG9uc2VSZXNvdXJjZS5jcmVhdGVVcmkoc2Vzc2lvblJlc291cmNlLCBwYXJ0LnRvb2xDYWxsSWQsIDAsIHBlcm1hbGlua0Jhc2VuYW1lKTtcblx0XHRcdFx0XHRcdGFydGlmYWN0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGAke3J1bGUuZ3JvdXBOYW1lfWAsXG5cdFx0XHRcdFx0XHRcdHVyaTogYXJ0aWZhY3RVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogcGFydC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHRkYXRhUGFydEluZGV4OiAwLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2NyZWVuc2hvdCcsXG5cdFx0XHRcdFx0XHRcdGdyb3VwTmFtZTogcnVsZS5ncm91cE5hbWUsXG5cdFx0XHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHJ1bGUub25seVNob3dHcm91cCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBhcnRpZmFjdHM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsaUJBQWlCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQStEO0FBQ3hFLFNBQVMsNEJBQXVDO0FBRWhELFNBQVMsc0NBQXNDO0FBRS9DLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0saUJBQWlCO0FBRWhCLElBQVU7QUFBQSxDQUFWLENBQVVBLDRCQUFWO0FBQ0MsV0FBUyxVQUFVLFlBQW9CLGlCQUEyQjtBQUN4RSxXQUFPLElBQUksS0FBSztBQUFBLE1BQ2YsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sT0FBTyxnQkFBZ0IsU0FBUztBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGO0FBTk8sRUFBQUEsd0JBQVM7QUFRVCxXQUFTLG9CQUFvQixLQUFtQjtBQUN0RCxXQUFPLElBQUksV0FBVztBQUFBLEVBQ3ZCO0FBRk8sRUFBQUEsd0JBQVM7QUFJVCxXQUFTLE1BQU0sS0FBMkQ7QUFDaEYsV0FBTztBQUFBLE1BQ04sWUFBWSxJQUFJO0FBQUEsTUFDaEIsaUJBQWlCLElBQUk7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSx3QkFBUztBQUFBLEdBYkE7QUF5QmpCLFNBQVMsY0FBYyxTQUFpQixVQUEyQjtBQUNsRSxNQUFJLFlBQVksVUFBVTtBQUN6QixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sQ0FBQyxhQUFhLGNBQWMsSUFBSSxRQUFRLE1BQU0sR0FBRztBQUN2RCxRQUFNLENBQUMsSUFBSSxJQUFJLFNBQVMsTUFBTSxHQUFHO0FBQ2pDLFNBQU8sbUJBQW1CLE9BQU8sZ0JBQWdCO0FBQ2xEO0FBS0EsU0FBUyxpQkFDUixVQUNBLFlBQ21DO0FBQ25DLFFBQU0sZUFBZSxhQUFhLFFBQVE7QUFDMUMsYUFBVyxDQUFDLFNBQVMsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFDM0QsUUFBSSxVQUFVLFNBQVMsUUFBUSxLQUFLLFVBQVUsU0FBUyxZQUFZLEdBQUc7QUFDckUsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBS0EsU0FBUyxpQkFDUixVQUNBLFlBQ21DO0FBQ25DLGFBQVcsQ0FBQyxTQUFTLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQzNELFFBQUksY0FBYyxTQUFTLFFBQVEsR0FBRztBQUNyQyxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLG9DQUFvQyxLQUF5RDtBQUNyRyxTQUFPLE9BQU8sUUFBUSxZQUFZLFFBQVEsUUFDdEMsWUFBWSxPQUFPLE9BQVEsSUFBMkMsV0FBVyxZQUNoRixJQUEyQyxRQUFRLFNBQVMsVUFDN0QsT0FBUSxJQUEyQyxRQUFRLGFBQWE7QUFDN0U7QUFFQSxTQUFTLHdCQUF3QixRQUFxQztBQUNyRSxNQUFJLE9BQU8sV0FBVyxZQUFZLFdBQVcsTUFBTTtBQUNsRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sT0FBUSxPQUFtQyxNQUFNO0FBQ3ZELFNBQU8sT0FBTyxTQUFTLFdBQVcsT0FBTztBQUMxQztBQUVBLE1BQU0sc0JBQXNCLG9CQUFJLElBQUksQ0FBQyxVQUFVLGVBQWUsUUFBUSxDQUFDO0FBRXZFLFNBQVMscUJBQXFCLFFBQTBCO0FBQ3ZELE1BQUksT0FBTyxXQUFXLFlBQVksV0FBVyxNQUFNO0FBQ2xELFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxVQUFXLE9BQW1DLFNBQVM7QUFDN0QsU0FBTyxPQUFPLFlBQVksWUFBWSxvQkFBb0IsSUFBSSxPQUFPO0FBQ3RFO0FBTU8sU0FBUyw2QkFDZixVQUNBLGlCQUNBLFlBQ0EsWUFDQSxtQkFBeUQsQ0FBQyxHQUN4QztBQUNsQixRQUFNLFlBQTZCLENBQUM7QUFDcEMsUUFBTSxXQUFXLG9CQUFJLElBQVk7QUFFakMsYUFBVyxRQUFRLFNBQVMsT0FBTztBQUVsQyxRQUFJLEtBQUssU0FBUyxnQkFBZ0I7QUFDakMsWUFBTSxNQUFNLEtBQUs7QUFDakIsWUFBTSxTQUFTLElBQUksU0FBUztBQUM1QixVQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDekI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxPQUFPLGlCQUFpQixJQUFJLE1BQU0sVUFBVTtBQUNsRCxVQUFJLE1BQU07QUFDVCxpQkFBUyxJQUFJLE1BQU07QUFDbkIsa0JBQVUsS0FBSztBQUFBLFVBQ2QsT0FBTyxTQUFTLEdBQUc7QUFBQSxVQUNuQixLQUFLO0FBQUEsVUFDTCxNQUFNO0FBQUEsVUFDTixXQUFXLEtBQUs7QUFBQSxVQUNoQixlQUFlLEtBQUs7QUFBQSxRQUNyQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssU0FBUyxpQkFBaUI7QUFDbEMsWUFBTSxNQUFNLEtBQUs7QUFDakIsWUFBTSxTQUFTLElBQUksU0FBUztBQUM1QixVQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDekI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxPQUFPLGlCQUFpQixJQUFJLE1BQU0sVUFBVTtBQUNsRCxVQUFJLE1BQU07QUFDVCxpQkFBUyxJQUFJLE1BQU07QUFDbkIsa0JBQVUsS0FBSztBQUFBLFVBQ2QsT0FBTyxTQUFTLEdBQUc7QUFBQSxVQUNuQixLQUFLO0FBQUEsVUFDTCxNQUFNO0FBQUEsVUFDTixXQUFXLEtBQUs7QUFBQSxVQUNoQixlQUFlLEtBQUs7QUFBQSxRQUNyQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssU0FBUyxpQkFBaUI7QUFDbEMsaUJBQVcsUUFBUSxLQUFLLE9BQU87QUFDOUIsY0FBTSxNQUFNLEtBQUssZUFBZSxLQUFLO0FBQ3JDLFlBQUksQ0FBQyxLQUFLO0FBQ1Q7QUFBQSxRQUNEO0FBQ0EsY0FBTSxTQUFTLElBQUksU0FBUztBQUM1QixZQUFJLFNBQVMsSUFBSSxNQUFNLEdBQUc7QUFDekI7QUFBQSxRQUNEO0FBQ0EsY0FBTSxPQUFPLGlCQUFpQixJQUFJLE1BQU0sVUFBVTtBQUNsRCxZQUFJLE1BQU07QUFDVCxtQkFBUyxJQUFJLE1BQU07QUFDbkIsb0JBQVUsS0FBSztBQUFBLFlBQ2QsT0FBTyxTQUFTLEdBQUc7QUFBQSxZQUNuQixLQUFLO0FBQUEsWUFDTCxNQUFNO0FBQUEsWUFDTixXQUFXLEtBQUs7QUFBQSxZQUNoQixlQUFlLEtBQUs7QUFBQSxVQUNyQixDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pDLFlBQU0sTUFBTSxLQUFLO0FBQ2pCLFlBQU0sU0FBUyxJQUFJLFNBQVM7QUFDNUIsVUFBSSxTQUFTLElBQUksTUFBTSxHQUFHO0FBQ3pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sT0FBTyxpQkFBaUIsSUFBSSxNQUFNLFVBQVU7QUFDbEQsVUFBSSxNQUFNO0FBQ1QsaUJBQVMsSUFBSSxNQUFNO0FBQ25CLGtCQUFVLEtBQUs7QUFBQSxVQUNkLE9BQU8sU0FBUyxHQUFHO0FBQUEsVUFDbkIsS0FBSztBQUFBLFVBQ0wsTUFBTTtBQUFBLFVBQ04sV0FBVyxLQUFLO0FBQUEsVUFDaEIsZUFBZSxLQUFLO0FBQUEsUUFDckIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBR0EsU0FBSyxLQUFLLFNBQVMsb0JBQW9CLEtBQUssU0FBUywrQkFBK0IsS0FBSyxXQUFXLGdCQUFnQjtBQUNuSCxZQUFNLFNBQVMsb0JBQW9CLGNBQWMsSUFBSTtBQUNyRCxZQUFNLGFBQWEsd0JBQXdCLE1BQU07QUFDakQsVUFBSSxjQUFjLHFCQUFxQixNQUFNLEdBQUc7QUFDL0MsY0FBTSxPQUFPLGlCQUFpQixZQUFZLGdCQUFnQjtBQUMxRCxZQUFJLE1BQU07QUFDVCxnQkFBTSxNQUFNLFVBQVUsS0FBSyxVQUFVLElBQUksVUFBVTtBQUNuRCxjQUFJLENBQUMsU0FBUyxJQUFJLEdBQUcsR0FBRztBQUN2QixxQkFBUyxJQUFJLEdBQUc7QUFDaEIsc0JBQVUsS0FBSztBQUFBLGNBQ2QsT0FBTyxhQUFhLFVBQVU7QUFBQSxjQUM5QixLQUFLLHVCQUF1QixVQUFVLFlBQVksZUFBZSxFQUFFLFNBQVM7QUFBQSxjQUM1RSxNQUFNO0FBQUEsY0FDTixXQUFXLEtBQUs7QUFBQSxjQUNoQixlQUFlLEtBQUs7QUFBQSxZQUNyQixDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxTQUFTLG9CQUFvQixLQUFLLFNBQVMsNEJBQTRCO0FBQy9FLFlBQU0sVUFBVSxvQkFBb0IsY0FBYyxJQUFJO0FBQ3RELFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxNQUNEO0FBR0EsVUFBSSwrQkFBK0IsT0FBTyxHQUFHO0FBQzVDLGlCQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsT0FBTyxRQUFRLEtBQUs7QUFDL0MsZ0JBQU0sYUFBYSxRQUFRLE9BQU8sQ0FBQztBQUNuQyxjQUFJLFdBQVcsU0FBUyxXQUFXLENBQUMsV0FBVyxVQUFVLFdBQVcsVUFBVTtBQUM3RSxrQkFBTSxPQUFPLGlCQUFpQixXQUFXLFVBQVUsVUFBVTtBQUM3RCxnQkFBSSxNQUFNO0FBQ1Qsb0JBQU0sTUFBTSxHQUFHLEtBQUssVUFBVSxJQUFJLENBQUM7QUFDbkMsa0JBQUksQ0FBQyxTQUFTLElBQUksR0FBRyxHQUFHO0FBQ3ZCLHlCQUFTLElBQUksR0FBRztBQUNoQixzQkFBTSxNQUFNLHdCQUF3QixXQUFXLFFBQVE7QUFDdkQsc0JBQU0sb0JBQW9CLE1BQU0sT0FBTyxHQUFHLEtBQUs7QUFDL0Msc0JBQU0sY0FBYyxxQkFBcUIsVUFBVSxpQkFBaUIsS0FBSyxZQUFZLEdBQUcsaUJBQWlCO0FBQ3pHLDBCQUFVLEtBQUs7QUFBQSxrQkFDZCxPQUFPLFdBQVcsS0FBSyxLQUFLLE1BQU0sR0FBRyxFQUFFLElBQUksS0FBSyxHQUFHLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQztBQUFBLGtCQUMxRSxLQUFLLFlBQVksU0FBUztBQUFBLGtCQUMxQixZQUFZLEtBQUs7QUFBQSxrQkFDakIsZUFBZTtBQUFBLGtCQUNmLE1BQU07QUFBQSxrQkFDTixXQUFXLEtBQUs7QUFBQSxrQkFDaEIsZUFBZSxLQUFLO0FBQUEsZ0JBQ3JCLENBQUM7QUFBQSxjQUNGO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFVBQUksb0NBQW9DLE9BQU8sR0FBRztBQUNqRCxjQUFNLE9BQU8saUJBQWlCLFFBQVEsT0FBTyxVQUFVLFVBQVU7QUFDakUsWUFBSSxNQUFNO0FBQ1QsZ0JBQU0sTUFBTSxHQUFHLEtBQUssVUFBVTtBQUM5QixjQUFJLENBQUMsU0FBUyxJQUFJLEdBQUcsR0FBRztBQUN2QixxQkFBUyxJQUFJLEdBQUc7QUFDaEIsa0JBQU0sTUFBTSx3QkFBd0IsUUFBUSxPQUFPLFFBQVE7QUFDM0Qsa0JBQU0sb0JBQW9CLE1BQU0sT0FBTyxHQUFHLEtBQUs7QUFDL0Msa0JBQU0sY0FBYyxxQkFBcUIsVUFBVSxpQkFBaUIsS0FBSyxZQUFZLEdBQUcsaUJBQWlCO0FBQ3pHLHNCQUFVLEtBQUs7QUFBQSxjQUNkLE9BQU8sR0FBRyxLQUFLLFNBQVM7QUFBQSxjQUN4QixLQUFLLFlBQVksU0FBUztBQUFBLGNBQzFCLFlBQVksS0FBSztBQUFBLGNBQ2pCLGVBQWU7QUFBQSxjQUNmLE1BQU07QUFBQSxjQUNOLFdBQVcsS0FBSztBQUFBLGNBQ2hCLGVBQWUsS0FBSztBQUFBLFlBQ3JCLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiQ2hhdE1lbW9yeUZpbGVSZXNvdXJjZSJdCn0K
