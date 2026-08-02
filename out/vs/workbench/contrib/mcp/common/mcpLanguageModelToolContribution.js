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
import { decodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { equals } from "../../../../base/common/objects.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IImageResizeService } from "../../../../platform/imageResize/common/imageResizeService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { mcpAppsEnabledConfig } from "../../../../platform/mcp/common/mcpManagement.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { isContributionEnabled } from "../../chat/common/enablement.js";
import { ChatResponseResource, getAttachableImageExtension } from "../../chat/common/model/chatModel.js";
import { LanguageModelPartAudience } from "../../chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { IMcpService, McpResourceURI, McpToolResourceLinkMimeType, McpToolVisibility } from "./mcpTypes.js";
import { mcpServerToSourceData } from "./mcpTypesUtils.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { McpServer } from "./mcpServer.js";
let McpLanguageModelToolContribution = class extends Disposable {
  constructor(_toolsService, mcpService, _instantiationService, _mcpRegistry, lifecycleService) {
    super();
    this._toolsService = _toolsService;
    this._instantiationService = _instantiationService;
    this._mcpRegistry = _mcpRegistry;
    this.lifecycleService = lifecycleService;
    const previous = this._register(new DisposableMap());
    this._register(autorun((reader) => {
      const servers = mcpService.servers.read(reader);
      const toDelete = new Set(previous.keys());
      for (const server of servers) {
        if (!isContributionEnabled(server.enablement.read(reader))) {
          continue;
        }
        const previousRec = previous.get(server);
        if (previousRec) {
          toDelete.delete(server);
          if (!previousRec.source || equals(previousRec.source, mcpServerToSourceData(server, reader))) {
            continue;
          }
          previousRec.dispose();
        }
        const store = new DisposableStore();
        const rec = { dispose: () => store.dispose() };
        const toolSet = new Lazy(() => {
          const source = rec.source = mcpServerToSourceData(server);
          const referenceName = server.definition.label.toLowerCase().replace(/\s+/g, "-");
          const toolSet2 = store.add(this._toolsService.createToolSet(
            source,
            server.definition.id,
            referenceName,
            {
              icon: Codicon.mcp,
              description: localize("mcp.toolset", "{0}: All Tools", server.definition.label),
              deprecated: true
            }
          ));
          return { toolSet: toolSet2, source };
        });
        this._syncTools(server, toolSet, store);
        previous.set(server, rec);
      }
      for (const key of toDelete) {
        previous.deleteAndDispose(key);
      }
    }));
  }
  _syncTools(server, collectionData, store) {
    const tools = /* @__PURE__ */ new Map();
    const collectionObservable = this._mcpRegistry.collections.map((collections) => collections.find((c) => c.id === server.collection.id));
    store.add(autorun((reader) => {
      const toDelete = new Set(tools.keys());
      const toRegister = [];
      const registerTool = (tool, toolData, store2) => {
        store2.add(this._toolsService.registerTool(toolData, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
        store2.add(collectionData.value.toolSet.addTool(toolData));
      };
      if (this.lifecycleService.willShutdown) {
        return;
      }
      const collection = collectionObservable.read(reader);
      if (!collection) {
        tools.forEach((t) => t.store.dispose());
        tools.clear();
        return;
      }
      for (const tool of server.tools.read(reader)) {
        if (!(tool.visibility & McpToolVisibility.Model)) {
          continue;
        }
        const existing = tools.get(tool.id);
        const icons = tool.icons.getUrl(22);
        const toolData = {
          id: tool.id,
          source: collectionData.value.source,
          icon: icons || Codicon.tools,
          // duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
          displayName: tool.definition.annotations?.title || tool.definition.title || tool.definition.name,
          toolReferenceName: tool.referenceName,
          modelDescription: tool.definition.description ?? "",
          userDescription: tool.definition.description ?? "",
          inputSchema: tool.definition.inputSchema,
          canBeReferencedInPrompt: true,
          alwaysDisplayInputOutput: true,
          canRequestPreApproval: !tool.definition.annotations?.readOnlyHint,
          canRequestPostApproval: !!tool.definition.annotations?.openWorldHint,
          runsInWorkspace: collection?.scope === StorageScope.WORKSPACE || !!collection?.remoteAuthority,
          tags: ["mcp"]
        };
        if (existing) {
          if (!equals(existing.toolData, toolData)) {
            existing.toolData = toolData;
            existing.store.clear();
            registerTool(tool, toolData, existing.store);
          }
          toDelete.delete(tool.id);
        } else {
          const store2 = new DisposableStore();
          toRegister.push(() => registerTool(tool, toolData, store2));
          tools.set(tool.id, { toolData, store: store2 });
        }
      }
      for (const id of toDelete) {
        const tool = tools.get(id);
        if (tool) {
          tool.store.dispose();
          tools.delete(id);
        }
      }
      for (const fn of toRegister) {
        fn();
      }
      this._toolsService.flushToolUpdates();
    }));
    store.add(toDisposable(() => {
      for (const tool of tools.values()) {
        tool.store.dispose();
      }
    }));
  }
};
McpLanguageModelToolContribution.ID = "workbench.contrib.mcp.languageModelTools";
McpLanguageModelToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMcpRegistry),
  __decorateParam(4, ILifecycleService)
], McpLanguageModelToolContribution);
let McpToolImplementation = class {
  constructor(_tool, _server, _configurationService, _productService, _fileService, _imageResizeService) {
    this._tool = _tool;
    this._server = _server;
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._fileService = _fileService;
    this._imageResizeService = _imageResizeService;
  }
  async prepareToolInvocation(context) {
    const tool = this._tool;
    const server = this._server;
    const sandboxEnabled = await McpServer.callOn(server, async (_handler, connection) => {
      return connection.definition.sandboxEnabled;
    });
    const isSandboxedServer = sandboxEnabled === true;
    const mcpToolWarning = localize(
      "mcp.tool.warning",
      "Note that MCP servers or malicious conversation content may attempt to misuse '{0}' through tools.",
      this._productService.nameShort
    );
    const title = tool.definition.annotations?.title || tool.definition.title || "`" + tool.definition.name + "`";
    let confirm;
    if (!isSandboxedServer) {
      confirm = {};
      if (!tool.definition.annotations?.readOnlyHint) {
        confirm.title = new MarkdownString(localize("msg.title", "Run {0}", title));
        confirm.message = new MarkdownString(tool.definition.description, { supportThemeIcons: true });
        confirm.disclaimer = mcpToolWarning;
        confirm.allowAutoConfirm = true;
      }
      if (tool.definition.annotations?.openWorldHint) {
        confirm.confirmResults = true;
      }
    }
    const mcpUiEnabled = this._configurationService.getValue(mcpAppsEnabledConfig);
    return {
      confirmationMessages: confirm,
      invocationMessage: new MarkdownString(localize("msg.run", "Running {0}", title)),
      pastTenseMessage: new MarkdownString(localize("msg.ran", "Ran {0} ", title)),
      originMessage: localize("msg.subtitle", "{0} (MCP Server)", server.definition.label),
      toolSpecificData: {
        kind: "input",
        rawInput: context.parameters,
        mcpAppData: mcpUiEnabled && tool.uiResourceUri ? {
          kind: "local",
          resourceUri: tool.uiResourceUri,
          serverDefinitionId: server.definition.id,
          collectionId: server.collection.id
        } : void 0
      }
    };
  }
  async invoke(invocation, _countTokens, progress, token) {
    const result = {
      content: []
    };
    const callResult = await this._tool.callWithProgress(invocation.parameters, progress, {
      chatRequestId: invocation.chatRequestId,
      chatSessionResource: invocation.context?.sessionResource,
      traceparent: invocation.traceparent,
      tracestate: invocation.tracestate
    }, token);
    const details = {
      input: JSON.stringify(invocation.parameters, void 0, 2),
      output: [],
      isError: callResult.isError === true
    };
    for (const item of callResult.content) {
      const audience = item.annotations?.audience?.map((a) => {
        if (a === "assistant") {
          return LanguageModelPartAudience.Assistant;
        } else if (a === "user") {
          return LanguageModelPartAudience.User;
        } else {
          return void 0;
        }
      }).filter(isDefined);
      if (audience?.includes(LanguageModelPartAudience.User)) {
        if (item.type === "text") {
          progress.report({ message: item.text });
        }
      }
      const addAsInlineData = async (mimeType, value, uri) => {
        details.output.push({ type: "embed", mimeType, value, uri, audience });
        if (isForModel) {
          let finalData;
          try {
            const resized = await this._imageResizeService.resizeImage(decodeBase64(value).buffer, mimeType);
            finalData = VSBuffer.wrap(resized);
          } catch {
            finalData = decodeBase64(value);
          }
          result.content.push({ kind: "data", value: { mimeType, data: finalData }, audience });
        }
      };
      const addAsLinkedResource = (uri, mimeType) => {
        const json = { uri, underlyingMimeType: mimeType };
        result.content.push({
          kind: "data",
          audience,
          value: {
            mimeType: McpToolResourceLinkMimeType,
            data: VSBuffer.fromString(JSON.stringify(json))
          }
        });
      };
      const isForModel = !audience || audience.includes(LanguageModelPartAudience.Assistant);
      if (item.type === "text") {
        details.output.push({ type: "embed", isText: true, value: item.text });
        if (isForModel && !callResult.structuredContent) {
          result.content.push({
            kind: "text",
            audience,
            value: item.text
          });
        }
      } else if (item.type === "image" || item.type === "audio") {
        await addAsInlineData(item.mimeType || "image/png", item.data);
      } else if (item.type === "resource_link") {
        const uri = McpResourceURI.fromServer(this._server.definition, item.uri);
        details.output.push({
          type: "ref",
          uri,
          audience,
          mimeType: item.mimeType
        });
        if (isForModel) {
          if (item.mimeType && getAttachableImageExtension(item.mimeType)) {
            result.content.push({
              kind: "data",
              audience,
              value: {
                mimeType: item.mimeType,
                data: await this._fileService.readFile(uri).then((f) => f.value).catch(() => VSBuffer.alloc(0))
              }
            });
          } else {
            addAsLinkedResource(uri, item.mimeType);
          }
        }
      } else if (item.type === "resource") {
        const uri = McpResourceURI.fromServer(this._server.definition, item.resource.uri);
        if (item.resource.mimeType && getAttachableImageExtension(item.resource.mimeType) && "blob" in item.resource) {
          await addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
        } else {
          details.output.push({
            type: "embed",
            uri,
            isText: "text" in item.resource,
            mimeType: item.resource.mimeType,
            value: "blob" in item.resource ? item.resource.blob : item.resource.text,
            audience,
            asResource: true
          });
          if (isForModel) {
            const permalink = invocation.context && ChatResponseResource.createUri(invocation.context.sessionResource, invocation.chatStreamToolCallId || invocation.callId, result.content.length, basename(uri));
            addAsLinkedResource(permalink || uri, item.resource.mimeType);
          }
        }
      }
    }
    if (callResult.structuredContent) {
      details.output.push({ type: "embed", isText: true, value: JSON.stringify(callResult.structuredContent, null, 2), audience: [LanguageModelPartAudience.Assistant] });
      result.content.push({ kind: "text", value: JSON.stringify(callResult.structuredContent), audience: [LanguageModelPartAudience.Assistant] });
    }
    if (this._tool.uiResourceUri) {
      details.mcpOutput = callResult;
    }
    result.toolResultDetails = details;
    return result;
  }
};
McpToolImplementation = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IImageResizeService)
], McpToolImplementation);
export {
  McpLanguageModelToolContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwTGFuZ3VhZ2VNb2RlbFRvb2xDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCwgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUltYWdlUmVzaXplU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ltYWdlUmVzaXplL2NvbW1vbi9pbWFnZVJlc2l6ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1jcEFwcHNFbmFibGVkQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlUmVzb3VyY2UsIGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ291bnRUb2tlbnNDYWxsYmFjaywgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcywgVG9vbFNldCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXIsIElNY3BTZXJ2aWNlLCBJTWNwVG9vbCwgSU1jcFRvb2xSZXNvdXJjZUxpbmtDb250ZW50cywgTWNwUmVzb3VyY2VVUkksIE1jcFRvb2xSZXNvdXJjZUxpbmtNaW1lVHlwZSwgTWNwVG9vbFZpc2liaWxpdHkgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IG1jcFNlcnZlclRvU291cmNlRGF0YSB9IGZyb20gJy4vbWNwVHlwZXNVdGlscy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlciB9IGZyb20gJy4vbWNwU2VydmVyLmpzJztcblxuaW50ZXJmYWNlIElTeW5jZWRUb29sRGF0YSB7XG5cdHRvb2xEYXRhOiBJVG9vbERhdGE7XG5cdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BMYW5ndWFnZU1vZGVsVG9vbENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm1jcC5sYW5ndWFnZU1vZGVsVG9vbHMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNY3BSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF9tY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dHlwZSBSZWMgPSB7IHNvdXJjZT86IFRvb2xEYXRhU291cmNlIH0gJiBJRGlzcG9zYWJsZTtcblxuXHRcdC8vIEtlZXAgdG9vbHMgaW4gc3luYyB3aXRoIHRoZSB0b29scyBzZXJ2aWNlLlxuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SU1jcFNlcnZlciwgUmVjPigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gbWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgdG9EZWxldGUgPSBuZXcgU2V0KHByZXZpb3VzLmtleXMoKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRcdC8vIFNraXAgZGlzYWJsZWQgc2VydmVycyBcdTIwMTQgZG9uJ3QgcmVnaXN0ZXIgdGhlaXIgdG9vbHMuXG5cdFx0XHRcdGlmICghaXNDb250cmlidXRpb25FbmFibGVkKHNlcnZlci5lbmFibGVtZW50LnJlYWQocmVhZGVyKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzUmVjID0gcHJldmlvdXMuZ2V0KHNlcnZlcik7XG5cdFx0XHRcdGlmIChwcmV2aW91c1JlYykge1xuXHRcdFx0XHRcdHRvRGVsZXRlLmRlbGV0ZShzZXJ2ZXIpO1xuXHRcdFx0XHRcdGlmICghcHJldmlvdXNSZWMuc291cmNlIHx8IGVxdWFscyhwcmV2aW91c1JlYy5zb3VyY2UsIG1jcFNlcnZlclRvU291cmNlRGF0YShzZXJ2ZXIsIHJlYWRlcikpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2FtZSBkZWZpbml0aW9uLCBubyBuZWVkIHRvIHVwZGF0ZVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHByZXZpb3VzUmVjLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCByZWM6IFJlYyA9IHsgZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpIH07XG5cdFx0XHRcdGNvbnN0IHRvb2xTZXQgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gcmVjLnNvdXJjZSA9IG1jcFNlcnZlclRvU291cmNlRGF0YShzZXJ2ZXIpO1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZU5hbWUgPSBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbC50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xccysvZywgJy0nKTsgLy8gc2VlIGlzc3VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzgxNTJcblx0XHRcdFx0XHRjb25zdCB0b29sU2V0ID0gc3RvcmUuYWRkKHRoaXMuX3Rvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRcdFx0c2VydmVyLmRlZmluaXRpb24uaWQsXG5cdFx0XHRcdFx0XHRyZWZlcmVuY2VOYW1lLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLm1jcCxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AudG9vbHNldCcsIFwiezB9OiBBbGwgVG9vbHNcIiwgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRcdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgdG9vbFNldCwgc291cmNlIH07XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuX3N5bmNUb29scyhzZXJ2ZXIsIHRvb2xTZXQsIHN0b3JlKTtcblx0XHRcdFx0cHJldmlvdXMuc2V0KHNlcnZlciwgcmVjKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgdG9EZWxldGUpIHtcblx0XHRcdFx0cHJldmlvdXMuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNUb29scyhzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGNvbGxlY3Rpb25EYXRhOiBMYXp5PHsgdG9vbFNldDogVG9vbFNldDsgc291cmNlOiBUb29sRGF0YVNvdXJjZSB9Piwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdGNvbnN0IHRvb2xzID0gbmV3IE1hcDwvKiB0b29sIElEICovc3RyaW5nLCBJU3luY2VkVG9vbERhdGE+KCk7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uT2JzZXJ2YWJsZSA9IHRoaXMuX21jcFJlZ2lzdHJ5LmNvbGxlY3Rpb25zLm1hcChjb2xsZWN0aW9ucyA9PlxuXHRcdFx0Y29sbGVjdGlvbnMuZmluZChjID0+IGMuaWQgPT09IHNlcnZlci5jb2xsZWN0aW9uLmlkKSk7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG9EZWxldGUgPSBuZXcgU2V0KHRvb2xzLmtleXMoKSk7XG5cblx0XHRcdC8vIHRvUmVnaXN0ZXIgaXMgZGVmZXJyZWQgdW50aWwgZGVsZXRpbmcgdG9vbHMgdGhhdCBtb3ZpbmcgYSB0b29sIGJldHdlZW5cblx0XHRcdC8vIHNlcnZlcnMgKG9yIGRlbGV0aW5nIG9uZSBpbnN0YW5jZSBvZiBhIG11bHRpLWluc3RhbmNlIHNlcnZlcikgZG9lc24ndCBjYXVzZSBhbiBlcnJvci5cblx0XHRcdGNvbnN0IHRvUmVnaXN0ZXI6ICgoKSA9PiB2b2lkKVtdID0gW107XG5cdFx0XHRjb25zdCByZWdpc3RlclRvb2wgPSAodG9vbDogSU1jcFRvb2wsIHRvb2xEYXRhOiBJVG9vbERhdGEsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpID0+IHtcblx0XHRcdFx0c3RvcmUuYWRkKHRoaXMuX3Rvb2xzU2VydmljZS5yZWdpc3RlclRvb2wodG9vbERhdGEsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFRvb2xJbXBsZW1lbnRhdGlvbiwgdG9vbCwgc2VydmVyKSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoY29sbGVjdGlvbkRhdGEudmFsdWUudG9vbFNldC5hZGRUb29sKHRvb2xEYXRhKSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBEb24ndCBib3RoZXIgY2xlYW5pbmcgdXAgdG9vbHMgaW50ZXJuYWxseSBkdXJpbmcgc2h1dGRvd24uIFRoaXMganVzdCBjb3N0cyB0aW1lIGZvciBubyBiZW5lZml0LlxuXHRcdFx0aWYgKHRoaXMubGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uID0gY29sbGVjdGlvbk9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRcdHRvb2xzLmZvckVhY2godCA9PiB0LnN0b3JlLmRpc3Bvc2UoKSk7XG5cdFx0XHRcdHRvb2xzLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHNlcnZlci50b29scy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Ly8gU2tpcCBhcHAtb25seSB0b29scyAtIHRoZXkgc2hvdWxkIG5vdCBiZSByZWdpc3RlcmVkIHdpdGggdGhlIGxhbmd1YWdlIG1vZGVsIHRvb2xzIHNlcnZpY2Vcblx0XHRcdFx0aWYgKCEodG9vbC52aXNpYmlsaXR5ICYgTWNwVG9vbFZpc2liaWxpdHkuTW9kZWwpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleGlzdGluZyA9IHRvb2xzLmdldCh0b29sLmlkKTtcblx0XHRcdFx0Y29uc3QgaWNvbnMgPSB0b29sLmljb25zLmdldFVybCgyMik7XG5cdFx0XHRcdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdFx0aWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0c291cmNlOiBjb2xsZWN0aW9uRGF0YS52YWx1ZS5zb3VyY2UsXG5cdFx0XHRcdFx0aWNvbjogaWNvbnMgfHwgQ29kaWNvbi50b29scyxcblx0XHRcdFx0XHQvLyBkdXBsaWNhdGl2ZTogaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL21vZGVsY29udGV4dHByb3RvY29sL3B1bGwvODEzXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IHRvb2wuZGVmaW5pdGlvbi5hbm5vdGF0aW9ucz8udGl0bGUgfHwgdG9vbC5kZWZpbml0aW9uLnRpdGxlIHx8IHRvb2wuZGVmaW5pdGlvbi5uYW1lLFxuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiB0b29sLnJlZmVyZW5jZU5hbWUsXG5cdFx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogdG9vbC5kZWZpbml0aW9uLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdHVzZXJEZXNjcmlwdGlvbjogdG9vbC5kZWZpbml0aW9uLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdGlucHV0U2NoZW1hOiB0b29sLmRlZmluaXRpb24uaW5wdXRTY2hlbWEsXG5cdFx0XHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRcdFx0YWx3YXlzRGlzcGxheUlucHV0T3V0cHV0OiB0cnVlLFxuXHRcdFx0XHRcdGNhblJlcXVlc3RQcmVBcHByb3ZhbDogIXRvb2wuZGVmaW5pdGlvbi5hbm5vdGF0aW9ucz8ucmVhZE9ubHlIaW50LFxuXHRcdFx0XHRcdGNhblJlcXVlc3RQb3N0QXBwcm92YWw6ICEhdG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy5vcGVuV29ybGRIaW50LFxuXHRcdFx0XHRcdHJ1bnNJbldvcmtzcGFjZTogY29sbGVjdGlvbj8uc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UgfHwgISFjb2xsZWN0aW9uPy5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0dGFnczogWydtY3AnXSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRpZiAoIWVxdWFscyhleGlzdGluZy50b29sRGF0YSwgdG9vbERhdGEpKSB7XG5cdFx0XHRcdFx0XHRleGlzdGluZy50b29sRGF0YSA9IHRvb2xEYXRhO1xuXHRcdFx0XHRcdFx0ZXhpc3Rpbmcuc3RvcmUuY2xlYXIoKTtcblx0XHRcdFx0XHRcdC8vIFdlIG5lZWQgdG8gcmUtcmVnaXN0ZXIgYm90aCB0aGUgZGF0YSBhbmQgaW1wbGVtZW50YXRpb24sIGFzIHRoZVxuXHRcdFx0XHRcdFx0Ly8gaW1wbGVtZW50YXRpb24gaXMgZGlzY2FyZGVkIHdoZW4gdGhlIGRhdGEgaXMgcmVtb3ZlZCAoIzI0NTkyMSlcblx0XHRcdFx0XHRcdHJlZ2lzdGVyVG9vbCh0b29sLCB0b29sRGF0YSwgZXhpc3Rpbmcuc3RvcmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b0RlbGV0ZS5kZWxldGUodG9vbC5pZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0dG9SZWdpc3Rlci5wdXNoKCgpID0+IHJlZ2lzdGVyVG9vbCh0b29sLCB0b29sRGF0YSwgc3RvcmUpKTtcblx0XHRcdFx0XHR0b29scy5zZXQodG9vbC5pZCwgeyB0b29sRGF0YSwgc3RvcmUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiB0b0RlbGV0ZSkge1xuXHRcdFx0XHRjb25zdCB0b29sID0gdG9vbHMuZ2V0KGlkKTtcblx0XHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0XHR0b29sLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0b29scy5kZWxldGUoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZm4gb2YgdG9SZWdpc3Rlcikge1xuXHRcdFx0XHRmbigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbXBvcnRhbnQ6IGZsdXNoIHRvb2wgdXBkYXRlcyB3aGVuIHRoZSBzZXJ2ZXIgaXMgZnVsbHkgcmVnaXN0ZXJlZCBzbyB0aGF0XG5cdFx0XHQvLyBhbnkgY29uc3VtaW5nIChlLmcuIGF1dG9zdGFydGluZykgcmVxdWVzdHMgaGF2ZSB0aGUgdG9vbHMgYXZhaWxhYmxlIGltbWVkaWF0ZWx5LlxuXHRcdFx0dGhpcy5fdG9vbHNTZXJ2aWNlLmZsdXNoVG9vbFVwZGF0ZXMoKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29scy52YWx1ZXMoKSkge1xuXHRcdFx0XHR0b29sLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgTWNwVG9vbEltcGxlbWVudGF0aW9uIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9vbDogSU1jcFRvb2wsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVyOiBJTWNwU2VydmVyLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW1hZ2VSZXNpemVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ltYWdlUmVzaXplU2VydmljZTogSUltYWdlUmVzaXplU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0KTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbj4ge1xuXHRcdGNvbnN0IHRvb2wgPSB0aGlzLl90b29sO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3NlcnZlcjtcblx0XHQvLyBUb0RPOiBuZWVkIHRvIGJlIHJldmlzaXRlZCBhcyB0aGUgZmlyc3QgdG9vbCBpbnZvY2F0aW9uIGRvZXNudCBoYXZlIHNhbmRib3ggaW5mbyBhbmQgd2UgYXJlIG9wdGltaXN0aWNhbGx5IGFzc3VtaW5nIGl0IGlzIG5vdCBzYW5kYm94ZWQuIFdlIHNob3VsZCBpZGVhbGx5IGhhdmUgdGhlIHNhbmRib3ggaW5mby5cblx0XHRjb25zdCBzYW5kYm94RW5hYmxlZCA9IGF3YWl0IE1jcFNlcnZlci5jYWxsT24oc2VydmVyLCBhc3luYyAoX2hhbmRsZXIsIGNvbm5lY3Rpb24pID0+IHtcblx0XHRcdHJldHVybiBjb25uZWN0aW9uLmRlZmluaXRpb24uc2FuZGJveEVuYWJsZWQ7XG5cdFx0fSk7XG5cdFx0Y29uc3QgaXNTYW5kYm94ZWRTZXJ2ZXIgPSBzYW5kYm94RW5hYmxlZCA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IG1jcFRvb2xXYXJuaW5nID0gbG9jYWxpemUoXG5cdFx0XHQnbWNwLnRvb2wud2FybmluZycsXG5cdFx0XHRcIk5vdGUgdGhhdCBNQ1Agc2VydmVycyBvciBtYWxpY2lvdXMgY29udmVyc2F0aW9uIGNvbnRlbnQgbWF5IGF0dGVtcHQgdG8gbWlzdXNlICd7MH0nIHRocm91Z2ggdG9vbHMuXCIsXG5cdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lU2hvcnRcblx0XHQpO1xuXG5cdFx0Ly8gZHVwbGljYXRpdmU6IGh0dHBzOi8vZ2l0aHViLmNvbS9tb2RlbGNvbnRleHRwcm90b2NvbC9tb2RlbGNvbnRleHRwcm90b2NvbC9wdWxsLzgxM1xuXHRcdGNvbnN0IHRpdGxlID0gdG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy50aXRsZSB8fCB0b29sLmRlZmluaXRpb24udGl0bGUgfHwgKCdgJyArIHRvb2wuZGVmaW5pdGlvbi5uYW1lICsgJ2AnKTtcblxuXHRcdGxldCBjb25maXJtOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghaXNTYW5kYm94ZWRTZXJ2ZXIpIHtcblx0XHRcdGNvbmZpcm0gPSB7fTtcblx0XHRcdGlmICghdG9vbC5kZWZpbml0aW9uLmFubm90YXRpb25zPy5yZWFkT25seUhpbnQpIHtcblx0XHRcdFx0Y29uZmlybS50aXRsZSA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbXNnLnRpdGxlJywgXCJSdW4gezB9XCIsIHRpdGxlKSk7XG5cdFx0XHRcdGNvbmZpcm0ubWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyh0b29sLmRlZmluaXRpb24uZGVzY3JpcHRpb24sIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdGNvbmZpcm0uZGlzY2xhaW1lciA9IG1jcFRvb2xXYXJuaW5nO1xuXHRcdFx0XHRjb25maXJtLmFsbG93QXV0b0NvbmZpcm0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvb2wuZGVmaW5pdGlvbi5hbm5vdGF0aW9ucz8ub3BlbldvcmxkSGludCkge1xuXHRcdFx0XHRjb25maXJtLmNvbmZpcm1SZXN1bHRzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtY3BVaUVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihtY3BBcHBzRW5hYmxlZENvbmZpZyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IGNvbmZpcm0sXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdtc2cucnVuJywgXCJSdW5uaW5nIHswfVwiLCB0aXRsZSkpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdtc2cucmFuJywgXCJSYW4gezB9IFwiLCB0aXRsZSkpLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogbG9jYWxpemUoJ21zZy5zdWJ0aXRsZScsIFwiezB9IChNQ1AgU2VydmVyKVwiLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdHJhd0lucHV0OiBjb250ZXh0LnBhcmFtZXRlcnMsXG5cdFx0XHRcdG1jcEFwcERhdGE6IG1jcFVpRW5hYmxlZCAmJiB0b29sLnVpUmVzb3VyY2VVcmkgPyB7XG5cdFx0XHRcdFx0a2luZDogJ2xvY2FsJyxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogdG9vbC51aVJlc291cmNlVXJpLFxuXHRcdFx0XHRcdHNlcnZlckRlZmluaXRpb25JZDogc2VydmVyLmRlZmluaXRpb24uaWQsXG5cdFx0XHRcdFx0Y29sbGVjdGlvbklkOiBzZXJ2ZXIuY29sbGVjdGlvbi5pZCxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblxuXHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRjb250ZW50OiBbXVxuXHRcdH07XG5cblx0XHRjb25zdCBjYWxsUmVzdWx0ID0gYXdhaXQgdGhpcy5fdG9vbC5jYWxsV2l0aFByb2dyZXNzKGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvZ3Jlc3MsIHtcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IGludm9jYXRpb24uY2hhdFJlcXVlc3RJZCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dHJhY2VwYXJlbnQ6IGludm9jYXRpb24udHJhY2VwYXJlbnQsXG5cdFx0XHR0cmFjZXN0YXRlOiBpbnZvY2F0aW9uLnRyYWNlc3RhdGUsXG5cdFx0fSwgdG9rZW4pO1xuXHRcdGNvbnN0IGRldGFpbHM6IE11dGFibGU8SVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHM+ID0ge1xuXHRcdFx0aW5wdXQ6IEpTT04uc3RyaW5naWZ5KGludm9jYXRpb24ucGFyYW1ldGVycywgdW5kZWZpbmVkLCAyKSxcblx0XHRcdG91dHB1dDogW10sXG5cdFx0XHRpc0Vycm9yOiBjYWxsUmVzdWx0LmlzRXJyb3IgPT09IHRydWUsXG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjYWxsUmVzdWx0LmNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGF1ZGllbmNlID0gaXRlbS5hbm5vdGF0aW9ucz8uYXVkaWVuY2U/Lm1hcChhID0+IHtcblx0XHRcdFx0aWYgKGEgPT09ICdhc3Npc3RhbnQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UuQXNzaXN0YW50O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGEgPT09ICd1c2VyJykge1xuXHRcdFx0XHRcdHJldHVybiBMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLlVzZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRcdC8vIEV4cGxpY2l0IHVzZXIgcGFydHMgZ2V0IHB1c2hlZCB0byBwcm9ncmVzcyB0byBzaG93IGluIHRoZSBzdGF0dXMgVUlcblx0XHRcdGlmIChhdWRpZW5jZT8uaW5jbHVkZXMoTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZS5Vc2VyKSkge1xuXHRcdFx0XHRpZiAoaXRlbS50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBpdGVtLnRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmV3cml0ZSBpbWFnZSByZXNvdXJjZXMgdG8gaW1hZ2VzIHNvIHRoZXkgYXJlIGlubGluZWQgbmljZWx5XG5cdFx0XHRjb25zdCBhZGRBc0lubGluZURhdGEgPSBhc3luYyAobWltZVR5cGU6IHN0cmluZywgdmFsdWU6IHN0cmluZywgdXJpPzogVVJJKTogUHJvbWlzZTxWU0J1ZmZlciB8IHZvaWQ+ID0+IHtcblx0XHRcdFx0ZGV0YWlscy5vdXRwdXQucHVzaCh7IHR5cGU6ICdlbWJlZCcsIG1pbWVUeXBlLCB2YWx1ZSwgdXJpLCBhdWRpZW5jZSB9KTtcblx0XHRcdFx0aWYgKGlzRm9yTW9kZWwpIHtcblx0XHRcdFx0XHRsZXQgZmluYWxEYXRhOiBWU0J1ZmZlcjtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzaXplZCA9IGF3YWl0IHRoaXMuX2ltYWdlUmVzaXplU2VydmljZS5yZXNpemVJbWFnZShkZWNvZGVCYXNlNjQodmFsdWUpLmJ1ZmZlciwgbWltZVR5cGUpO1xuXHRcdFx0XHRcdFx0ZmluYWxEYXRhID0gVlNCdWZmZXIud3JhcChyZXNpemVkKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdGZpbmFsRGF0YSA9IGRlY29kZUJhc2U2NCh2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdC5jb250ZW50LnB1c2goeyBraW5kOiAnZGF0YScsIHZhbHVlOiB7IG1pbWVUeXBlLCBkYXRhOiBmaW5hbERhdGEgfSwgYXVkaWVuY2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFkZEFzTGlua2VkUmVzb3VyY2UgPSAodXJpOiBVUkksIG1pbWVUeXBlPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb246IElNY3BUb29sUmVzb3VyY2VMaW5rQ29udGVudHMgPSB7IHVyaSwgdW5kZXJseWluZ01pbWVUeXBlOiBtaW1lVHlwZSB9O1xuXHRcdFx0XHRyZXN1bHQuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0YXVkaWVuY2UsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBNY3BUb29sUmVzb3VyY2VMaW5rTWltZVR5cGUsXG5cdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGpzb24pKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGlzRm9yTW9kZWwgPSAhYXVkaWVuY2UgfHwgYXVkaWVuY2UuaW5jbHVkZXMoTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZS5Bc3Npc3RhbnQpO1xuXHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdGRldGFpbHMub3V0cHV0LnB1c2goeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBpdGVtLnRleHQgfSk7XG5cdFx0XHRcdC8vIHN0cnVjdHVyZWQgY29udGVudCAncmVwcmVzZW50cyB0aGUgcmVzdWx0IG9mIHRoZSB0b29sIGNhbGwnLCBzbyB0YWtlXG5cdFx0XHRcdC8vIHRoYXQgaW4gcGxhY2Ugb2YgYW55IHRleHR1YWwgZGVzY3JpcHRpb24gd2hlbiBwcmVzZW50LlxuXHRcdFx0XHRpZiAoaXNGb3JNb2RlbCAmJiAhY2FsbFJlc3VsdC5zdHJ1Y3R1cmVkQ29udGVudCkge1xuXHRcdFx0XHRcdHJlc3VsdC5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0YXVkaWVuY2UsXG5cdFx0XHRcdFx0XHR2YWx1ZTogaXRlbS50ZXh0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAnaW1hZ2UnIHx8IGl0ZW0udHlwZSA9PT0gJ2F1ZGlvJykge1xuXHRcdFx0XHQvLyBkZWZhdWx0IHRvIHNvbWUgaW1hZ2UgdHlwZSBpZiBub3QgZ2l2ZW4gdG8gaGludFxuXHRcdFx0XHRhd2FpdCBhZGRBc0lubGluZURhdGEoaXRlbS5taW1lVHlwZSB8fCAnaW1hZ2UvcG5nJywgaXRlbS5kYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAncmVzb3VyY2VfbGluaycpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcih0aGlzLl9zZXJ2ZXIuZGVmaW5pdGlvbiwgaXRlbS51cmkpO1xuXHRcdFx0XHRkZXRhaWxzLm91dHB1dC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAncmVmJyxcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0YXVkaWVuY2UsXG5cdFx0XHRcdFx0bWltZVR5cGU6IGl0ZW0ubWltZVR5cGUsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChpc0Zvck1vZGVsKSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0ubWltZVR5cGUgJiYgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uKGl0ZW0ubWltZVR5cGUpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0XHRhdWRpZW5jZSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0XHRtaW1lVHlwZTogaXRlbS5taW1lVHlwZSxcblx0XHRcdFx0XHRcdFx0XHRkYXRhOiBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpLnRoZW4oZiA9PiBmLnZhbHVlKS5jYXRjaCgoKSA9PiBWU0J1ZmZlci5hbGxvYygwKSksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhZGRBc0xpbmtlZFJlc291cmNlKHVyaSwgaXRlbS5taW1lVHlwZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGl0ZW0udHlwZSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHRoaXMuX3NlcnZlci5kZWZpbml0aW9uLCBpdGVtLnJlc291cmNlLnVyaSk7XG5cdFx0XHRcdGlmIChpdGVtLnJlc291cmNlLm1pbWVUeXBlICYmIGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbihpdGVtLnJlc291cmNlLm1pbWVUeXBlKSAmJiAnYmxvYicgaW4gaXRlbS5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdGF3YWl0IGFkZEFzSW5saW5lRGF0YShpdGVtLnJlc291cmNlLm1pbWVUeXBlLCBpdGVtLnJlc291cmNlLmJsb2IsIHVyaSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGV0YWlscy5vdXRwdXQucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZW1iZWQnLFxuXHRcdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdFx0aXNUZXh0OiAndGV4dCcgaW4gaXRlbS5yZXNvdXJjZSxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBpdGVtLnJlc291cmNlLm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdibG9iJyBpbiBpdGVtLnJlc291cmNlID8gaXRlbS5yZXNvdXJjZS5ibG9iIDogaXRlbS5yZXNvdXJjZS50ZXh0LFxuXHRcdFx0XHRcdFx0YXVkaWVuY2UsXG5cdFx0XHRcdFx0XHRhc1Jlc291cmNlOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGlzRm9yTW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBlcm1hbGluayA9IGludm9jYXRpb24uY29udGV4dCAmJiBDaGF0UmVzcG9uc2VSZXNvdXJjZS5jcmVhdGVVcmkoaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSwgaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCB8fCBpbnZvY2F0aW9uLmNhbGxJZCwgcmVzdWx0LmNvbnRlbnQubGVuZ3RoLCBiYXNlbmFtZSh1cmkpKTtcblx0XHRcdFx0XHRcdGFkZEFzTGlua2VkUmVzb3VyY2UocGVybWFsaW5rIHx8IHVyaSwgaXRlbS5yZXNvdXJjZS5taW1lVHlwZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNhbGxSZXN1bHQuc3RydWN0dXJlZENvbnRlbnQpIHtcblx0XHRcdGRldGFpbHMub3V0cHV0LnB1c2goeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBKU09OLnN0cmluZ2lmeShjYWxsUmVzdWx0LnN0cnVjdHVyZWRDb250ZW50LCBudWxsLCAyKSwgYXVkaWVuY2U6IFtMYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlLkFzc2lzdGFudF0gfSk7XG5cdFx0XHRyZXN1bHQuY29udGVudC5wdXNoKHsga2luZDogJ3RleHQnLCB2YWx1ZTogSlNPTi5zdHJpbmdpZnkoY2FsbFJlc3VsdC5zdHJ1Y3R1cmVkQ29udGVudCksIGF1ZGllbmNlOiBbTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZS5Bc3Npc3RhbnRdIH0pO1xuXHRcdH1cblxuXHRcdC8vIEFkZCByYXcgTUNQIG91dHB1dCBmb3IgTUNQIEFwcCBVSSByZW5kZXJpbmcgaWYgdGhpcyB0b29sIGhhcyBVSVxuXHRcdGlmICh0aGlzLl90b29sLnVpUmVzb3VyY2VVcmkpIHtcblx0XHRcdGRldGFpbHMubWNwT3V0cHV0ID0gY2FsbFJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXN1bHQudG9vbFJlc3VsdERldGFpbHMgPSBkZXRhaWxzO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWMsZ0JBQWdCO0FBRXZDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG9CQUFvQjtBQUN0RixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQTBCO0FBRW5DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLG1DQUFtQztBQUNsRSxTQUFTLGlDQUFpQztBQUMxQyxTQUE4QixrQ0FBbVA7QUFDalIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBcUIsYUFBcUQsZ0JBQWdCLDZCQUE2Qix5QkFBeUI7QUFDaEosU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFPbkIsSUFBTSxtQ0FBTixjQUErQyxXQUE2QztBQUFBLEVBSWxHLFlBQzhDLGVBQ2hDLFlBQzJCLHVCQUNULGNBQ0ssa0JBQ25DO0FBQ0QsVUFBTTtBQU51QztBQUVMO0FBQ1Q7QUFDSztBQU9wQyxVQUFNLFdBQVcsS0FBSyxVQUFVLElBQUksY0FBK0IsQ0FBQztBQUNwRSxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sVUFBVSxXQUFXLFFBQVEsS0FBSyxNQUFNO0FBRTlDLFlB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O0FBQUEsTUFDRCxXQUFXLEtBQUssU0FBUyxZQUFZO0FBQ3BDLGNBQU0sTUFBTSxlQUFlLFdBQVcsS0FBSyxRQUFRLFlBQVksS0FBSyxTQUFTLEdBQUc7QUFDaEYsWUFBSSxLQUFLLFNBQVMsWUFBWSw0QkFBNEIsS0FBSyxTQUFTLFFBQVEsS0FBSyxVQUFVLEtBQUssVUFBVTtBQUM3RyxnQkFBTSxnQkFBZ0IsS0FBSyxTQUFTLFVBQVUsS0FBSyxTQUFTLE1BQU0sR0FBRztBQUFBLFFBQ3RFLE9BQU87QUFDTixrQkFBUSxPQUFPLEtBQUs7QUFBQSxZQUNuQixNQUFNO0FBQUEsWUFDTjtBQUFBLFlBQ0EsUUFBUSxVQUFVLEtBQUs7QUFBQSxZQUN2QixVQUFVLEtBQUssU0FBUztBQUFBLFlBQ3hCLE9BQU8sVUFBVSxLQUFLLFdBQVcsS0FBSyxTQUFTLE9BQU8sS0FBSyxTQUFTO0FBQUEsWUFDcEU7QUFBQSxZQUNBLFlBQVk7QUFBQSxVQUNiLENBQUM7QUFFRCxjQUFJLFlBQVk7QUFDZixrQkFBTSxZQUFZLFdBQVcsV0FBVyxxQkFBcUIsVUFBVSxXQUFXLFFBQVEsaUJBQWlCLFdBQVcsd0JBQXdCLFdBQVcsUUFBUSxPQUFPLFFBQVEsUUFBUSxTQUFTLEdBQUcsQ0FBQztBQUNyTSxnQ0FBb0IsYUFBYSxLQUFLLEtBQUssU0FBUyxRQUFRO0FBQUEsVUFDN0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVcsbUJBQW1CO0FBQ2pDLGNBQVEsT0FBTyxLQUFLLEVBQUUsTUFBTSxTQUFTLFFBQVEsTUFBTSxPQUFPLEtBQUssVUFBVSxXQUFXLG1CQUFtQixNQUFNLENBQUMsR0FBRyxVQUFVLENBQUMsMEJBQTBCLFNBQVMsRUFBRSxDQUFDO0FBQ2xLLGFBQU8sUUFBUSxLQUFLLEVBQUUsTUFBTSxRQUFRLE9BQU8sS0FBSyxVQUFVLFdBQVcsaUJBQWlCLEdBQUcsVUFBVSxDQUFDLDBCQUEwQixTQUFTLEVBQUUsQ0FBQztBQUFBLElBQzNJO0FBR0EsUUFBSSxLQUFLLE1BQU0sZUFBZTtBQUM3QixjQUFRLFlBQVk7QUFBQSxJQUNyQjtBQUVBLFdBQU8sb0JBQW9CO0FBQzNCLFdBQU87QUFBQSxFQUNSO0FBRUQ7QUF4TU0sd0JBQU47QUFBQSxFQUlHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQRzsiLAogICJuYW1lcyI6IFsidG9vbFNldCIsICJzdG9yZSJdCn0K
