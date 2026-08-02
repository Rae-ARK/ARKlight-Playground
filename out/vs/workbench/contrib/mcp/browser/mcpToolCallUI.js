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
import { Gesture } from "../../../../base/browser/touch.js";
import { decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableFromEvent } from "../../../../base/common/observable.js";
import { isMobile, isWeb, locale } from "../../../../base/common/platform.js";
import { hasKey } from "../../../../base/common/types.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { McpServer } from "../common/mcpServer.js";
import { IMcpService, IMcpSamplingService, McpToolVisibility } from "../common/mcpTypes.js";
import { findMcpServer, startServerAndWaitForLiveTools, translateMcpLogMessage } from "../common/mcpTypesUtils.js";
function readResourceContentToHtml(contents) {
  if (!contents || contents.length === 0) {
    throw new Error("UI resource not found on server");
  }
  const content = contents[0];
  let html;
  const mimeType = content.mimeType || "text/html";
  if (hasKey(content, { text: true })) {
    html = content.text;
  } else if (hasKey(content, { blob: true })) {
    html = decodeBase64(content.blob).toString();
  } else {
    throw new Error("UI resource has no content");
  }
  const meta = content._meta?.ui;
  return {
    ...meta,
    html,
    mimeType
  };
}
let LocalMcpAppCallTransport = class extends Disposable {
  constructor(_uiData, _mcpService, _samplingService) {
    super();
    this._uiData = _uiData;
    this._mcpService = _mcpService;
    this._samplingService = _samplingService;
    this._onNotification = this._register(new Emitter());
    this.onNotification = this._onNotification.event;
  }
  async _getServer(token) {
    return findMcpServer(
      this._mcpService,
      (s) => s.definition.id === this._uiData.serverDefinitionId && s.collection.id === this._uiData.collectionId,
      token
    );
  }
  async log(params) {
    const server = await this._getServer(CancellationToken.None);
    if (server) {
      translateMcpLogMessage(server.logger, params, `[App UI]`);
    }
  }
  async loadResource(token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for UI resource");
    }
    const resourceResult = await McpServer.callOn(server, (h) => h.readResource({ uri: this._uiData.resourceUri }, token), token);
    return readResourceContentToHtml(resourceResult.contents);
  }
  async callTool(name, params, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for tool call");
    }
    await startServerAndWaitForLiveTools(server, void 0, token);
    const tool = server.tools.get().find((t) => t.definition.name === name);
    if (!tool || !(tool.visibility & McpToolVisibility.App)) {
      throw new Error(`Tool not found on server: ${name}`);
    }
    const res = await tool.call(params, void 0, token);
    return {
      content: res.content,
      isError: res.isError,
      _meta: res._meta,
      structuredContent: res.structuredContent
    };
  }
  async readResource(uri, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found");
    }
    return await McpServer.callOn(server, (h) => h.readResource({ uri }, token), token);
  }
  async sampling(params, token) {
    const server = await this._getServer(token);
    if (!server) {
      throw new Error("MCP server not found for sampling");
    }
    const { sample } = await this._samplingService.sample({
      server,
      isDuringToolCall: true,
      params
    }, token);
    return sample;
  }
};
LocalMcpAppCallTransport = __decorateClass([
  __decorateParam(1, IMcpService),
  __decorateParam(2, IMcpSamplingService)
], LocalMcpAppCallTransport);
let AhpMcpAppCallTransport = class extends Disposable {
  constructor(_uiData, _channel, _agentHostService) {
    super();
    this._uiData = _uiData;
    this._channel = _channel;
    this._agentHostService = _agentHostService;
    this._onNotification = this._register(new Emitter());
    this.onNotification = this._onNotification.event;
    this._register(this._agentHostService.onMcpNotification((n) => {
      if (n.channel === this._channel) {
        this._onNotification.fire({ method: n.method, params: n.params });
      }
    }));
  }
  async log(params) {
    try {
      await this._agentHostService.handleMcpRequest(this._channel, "notifications/message", params);
    } catch {
    }
  }
  async loadResource(_token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "resources/read", { uri: this._uiData.resourceUri });
    return readResourceContentToHtml(result.contents);
  }
  async callTool(name, params, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "tools/call", { name, arguments: params });
    return result;
  }
  async readResource(uri, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "resources/read", { uri });
    return result;
  }
  async sampling(params, _token) {
    const result = await this._agentHostService.handleMcpRequest(this._channel, "sampling/createMessage", params);
    return result;
  }
};
AhpMcpAppCallTransport = __decorateClass([
  __decorateParam(2, IAgentHostService)
], AhpMcpAppCallTransport);
let McpToolCallUI = class extends Disposable {
  constructor(_uiData, instantiationService, themeService) {
    super();
    this._uiData = _uiData;
    this._transport = this._register(
      _uiData.kind === "agentHost" ? instantiationService.createInstance(AhpMcpAppCallTransport, _uiData, _uiData.channel) : instantiationService.createInstance(LocalMcpAppCallTransport, _uiData)
    );
    this.onNotification = this._transport.onNotification;
    const colorTheme = observableFromEvent(
      themeService.onDidColorThemeChange,
      () => {
        const type = themeService.getColorTheme().type;
        return type === ColorScheme.DARK || type === ColorScheme.HIGH_CONTRAST_DARK ? "dark" : "light";
      }
    );
    this.hostContext = derived((reader) => {
      return {
        theme: colorTheme.read(reader),
        styles: {
          variables: {
            "--color-background-primary": "var(--vscode-editor-background)",
            "--color-background-secondary": "var(--vscode-sideBar-background)",
            "--color-background-tertiary": "var(--vscode-activityBar-background)",
            "--color-background-inverse": "var(--vscode-editor-foreground)",
            "--color-background-ghost": "transparent",
            "--color-background-info": "var(--vscode-inputValidation-infoBackground)",
            "--color-background-danger": "var(--vscode-inputValidation-errorBackground)",
            "--color-background-success": "var(--vscode-diffEditor-insertedTextBackground)",
            "--color-background-warning": "var(--vscode-inputValidation-warningBackground)",
            "--color-background-disabled": "var(--vscode-editor-inactiveSelectionBackground)",
            "--color-text-primary": "var(--vscode-foreground)",
            "--color-text-secondary": "var(--vscode-descriptionForeground)",
            "--color-text-tertiary": "var(--vscode-disabledForeground)",
            "--color-text-inverse": "var(--vscode-editor-background)",
            "--color-text-info": "var(--vscode-textLink-foreground)",
            "--color-text-danger": "var(--vscode-errorForeground)",
            "--color-text-success": "var(--vscode-testing-iconPassed)",
            "--color-text-warning": "var(--vscode-editorWarning-foreground)",
            "--color-text-disabled": "var(--vscode-disabledForeground)",
            "--color-text-ghost": "var(--vscode-descriptionForeground)",
            "--color-border-primary": "var(--vscode-widget-border)",
            "--color-border-secondary": "var(--vscode-editorWidget-border)",
            "--color-border-tertiary": "var(--vscode-panel-border)",
            "--color-border-inverse": "var(--vscode-foreground)",
            "--color-border-ghost": "transparent",
            "--color-border-info": "var(--vscode-inputValidation-infoBorder)",
            "--color-border-danger": "var(--vscode-inputValidation-errorBorder)",
            "--color-border-success": "var(--vscode-testing-iconPassed)",
            "--color-border-warning": "var(--vscode-inputValidation-warningBorder)",
            "--color-border-disabled": "var(--vscode-disabledForeground)",
            "--color-ring-primary": "var(--vscode-focusBorder)",
            "--color-ring-secondary": "var(--vscode-focusBorder)",
            "--color-ring-inverse": "var(--vscode-focusBorder)",
            "--color-ring-info": "var(--vscode-inputValidation-infoBorder)",
            "--color-ring-danger": "var(--vscode-inputValidation-errorBorder)",
            "--color-ring-success": "var(--vscode-testing-iconPassed)",
            "--color-ring-warning": "var(--vscode-inputValidation-warningBorder)",
            "--font-sans": "var(--vscode-font-family)",
            "--font-mono": "var(--vscode-editor-font-family)",
            "--font-weight-normal": "normal",
            "--font-weight-medium": "500",
            "--font-weight-semibold": "600",
            "--font-weight-bold": "bold",
            "--font-text-xs-size": "10px",
            "--font-text-sm-size": "11px",
            "--font-text-md-size": "13px",
            "--font-text-lg-size": "14px",
            "--font-heading-xs-size": "16px",
            "--font-heading-sm-size": "18px",
            "--font-heading-md-size": "20px",
            "--font-heading-lg-size": "24px",
            "--font-heading-xl-size": "32px",
            "--font-heading-2xl-size": "40px",
            "--font-heading-3xl-size": "48px",
            "--border-radius-xs": "2px",
            "--border-radius-sm": "3px",
            "--border-radius-md": "4px",
            "--border-radius-lg": "6px",
            "--border-radius-xl": "8px",
            "--border-radius-full": "9999px",
            "--border-width-regular": "1px",
            "--font-text-xs-line-height": "1.5",
            "--font-text-sm-line-height": "1.5",
            "--font-text-md-line-height": "1.5",
            "--font-text-lg-line-height": "1.5",
            "--font-heading-xs-line-height": "1.25",
            "--font-heading-sm-line-height": "1.25",
            "--font-heading-md-line-height": "1.25",
            "--font-heading-lg-line-height": "1.25",
            "--font-heading-xl-line-height": "1.25",
            "--font-heading-2xl-line-height": "1.25",
            "--font-heading-3xl-line-height": "1.25",
            "--shadow-hairline": "0 0 0 1px var(--vscode-widget-shadow)",
            "--shadow-sm": "0 1px 2px 0 var(--vscode-widget-shadow)",
            "--shadow-md": "0 4px 6px -1px var(--vscode-widget-shadow)",
            "--shadow-lg": "0 10px 15px -3px var(--vscode-widget-shadow)"
          }
        },
        displayMode: "inline",
        availableDisplayModes: ["inline"],
        locale,
        platform: isWeb ? "web" : isMobile ? "mobile" : "desktop",
        deviceCapabilities: {
          touch: Gesture.isTouchDevice(),
          hover: Gesture.isHoverDevice()
        }
      };
    });
  }
  /**
   * Gets the underlying UI data.
   */
  get uiData() {
    return this._uiData;
  }
  /**
   * Logs a message to the MCP server's logger.
   */
  log(log) {
    return this._transport.log(log);
  }
  /**
   * Loads the UI resource from the MCP server.
   * @param token Cancellation token
   * @returns The HTML content and CSP configuration
   */
  loadResource(token) {
    return this._transport.loadResource(token);
  }
  /**
   * Calls a tool on the MCP server.
   * @param name Tool name
   * @param params Tool parameters
   * @param token Cancellation token
   * @returns The tool call result
   */
  callTool(name, params, token) {
    return this._transport.callTool(name, params, token);
  }
  /**
   * Reads a resource from the MCP server.
   * @param uri Resource URI
   * @param token Cancellation token
   * @returns The resource content
   */
  readResource(uri, token) {
    return this._transport.readResource(uri, token);
  }
  /**
   * Issues a `sampling/createMessage` request against the MCP server's
   * host-side sampling implementation. Only supported when the App
   * server runs inside an agent host that has opted into sampling.
   */
  sampling(params, token) {
    return this._transport.sampling(params, token);
  }
};
McpToolCallUI = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService)
], McpToolCallUI);
export {
  McpToolCallUI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFRvb2xDYWxsVUkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc01vYmlsZSwgaXNXZWIsIGxvY2FsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXIgfSBmcm9tICcuLi9jb21tb24vbWNwU2VydmVyLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXIsIElNY3BTZXJ2aWNlLCBJTWNwU2FtcGxpbmdTZXJ2aWNlLCBJTWNwVG9vbENhbGxVSURhdGEsIE1jcFRvb2xWaXNpYmlsaXR5IH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IGZpbmRNY3BTZXJ2ZXIsIHN0YXJ0U2VydmVyQW5kV2FpdEZvckxpdmVUb29scywgdHJhbnNsYXRlTWNwTG9nTWVzc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlc1V0aWxzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNY3BBcHBzIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sQXBwcy5qcyc7XG5cbi8qKlxuICogUmVzdWx0IGZyb20gbG9hZGluZyBhbiBNQ1AgQXBwIFVJIHJlc291cmNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNY3BBcHBSZXNvdXJjZUNvbnRlbnQgZXh0ZW5kcyBNY3BBcHBzLk1jcFVpUmVzb3VyY2VNZXRhIHtcblx0LyoqIFRoZSBIVE1MIGNvbnRlbnQgb2YgdGhlIFVJIHJlc291cmNlICovXG5cdHJlYWRvbmx5IGh0bWw6IHN0cmluZztcblx0LyoqIE1JTUUgdHlwZSBvZiB0aGUgY29udGVudCAqL1xuXHRyZWFkb25seSBtaW1lVHlwZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRyYW5zcG9ydCBhYnN0cmFjdGlvbiBmb3IgdGhlIGNvbnN0cmFpbmVkIHN1YnNldCBvZiBNQ1AgcmVxdWVzdHMgYW4gTUNQXG4gKiBBcHAncyB3ZWJ2aWV3IG1ha2VzIGJhY2sgdG8gdGhlIGhvc3QuIFR3byBpbXBsZW1lbnRhdGlvbnMgZXhpc3Q6IG9uZVxuICogcm91dGVzIHRocm91Z2gge0BsaW5rIElNY3BTZXJ2aWNlfSAobG9jYWwgc2VydmVycyksIHRoZSBvdGhlciB0aHJvdWdoXG4gKiB7QGxpbmsgSUFnZW50SG9zdFNlcnZpY2UuaGFuZGxlTWNwUmVxdWVzdH0gb24gYW4gYG1jcDovL2AgQUhQIHNpZGVcbiAqIGNoYW5uZWwgKGFnZW50LWhvc3QtcmVzaWRlbnQgc2VydmVycykuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcEFwcENhbGxUcmFuc3BvcnQgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdC8qKiBGb3J3YXJkZWQgTUNQIHNlcnZlciBub3RpZmljYXRpb25zIChgbm90aWZpY2F0aW9ucy8qYCkgZm9yIHRoaXMgc2VydmVyLiAqL1xuXHRyZWFkb25seSBvbk5vdGlmaWNhdGlvbjogRXZlbnQ8eyByZWFkb25seSBtZXRob2Q6IHN0cmluZzsgcmVhZG9ubHkgcGFyYW1zPzogdW5rbm93biB9PjtcblxuXHRsb2FkUmVzb3VyY2UodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwQXBwUmVzb3VyY2VDb250ZW50Pjtcblx0Y2FsbFRvb2wobmFtZTogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD47XG5cdHJlYWRSZXNvdXJjZSh1cmk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVhZFJlc291cmNlUmVzdWx0Pjtcblx0c2FtcGxpbmcocGFyYW1zOiBNQ1AuQ3JlYXRlTWVzc2FnZVJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DcmVhdGVNZXNzYWdlUmVzdWx0Pjtcblx0bG9nKHBhcmFtczogTUNQLkxvZ2dpbmdNZXNzYWdlTm90aWZpY2F0aW9uUGFyYW1zKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZnVuY3Rpb24gcmVhZFJlc291cmNlQ29udGVudFRvSHRtbChjb250ZW50czogcmVhZG9ubHkgKE1DUC5UZXh0UmVzb3VyY2VDb250ZW50cyB8IE1DUC5CbG9iUmVzb3VyY2VDb250ZW50cylbXSk6IElNY3BBcHBSZXNvdXJjZUNvbnRlbnQge1xuXHRpZiAoIWNvbnRlbnRzIHx8IGNvbnRlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVUkgcmVzb3VyY2Ugbm90IGZvdW5kIG9uIHNlcnZlcicpO1xuXHR9XG5cblx0Y29uc3QgY29udGVudCA9IGNvbnRlbnRzWzBdO1xuXHRsZXQgaHRtbDogc3RyaW5nO1xuXHRjb25zdCBtaW1lVHlwZSA9IGNvbnRlbnQubWltZVR5cGUgfHwgJ3RleHQvaHRtbCc7XG5cblx0aWYgKGhhc0tleShjb250ZW50LCB7IHRleHQ6IHRydWUgfSkpIHtcblx0XHRodG1sID0gY29udGVudC50ZXh0O1xuXHR9IGVsc2UgaWYgKGhhc0tleShjb250ZW50LCB7IGJsb2I6IHRydWUgfSkpIHtcblx0XHRodG1sID0gZGVjb2RlQmFzZTY0KGNvbnRlbnQuYmxvYikudG9TdHJpbmcoKTtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VJIHJlc291cmNlIGhhcyBubyBjb250ZW50Jyk7XG5cdH1cblxuXHRjb25zdCBtZXRhID0gY29udGVudC5fbWV0YT8udWkgYXMgTWNwQXBwcy5NY3BVaVJlc291cmNlTWV0YSB8IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHQuLi5tZXRhLFxuXHRcdGh0bWwsXG5cdFx0bWltZVR5cGUsXG5cdH07XG59XG5cbi8qKlxuICogTG9jYWwgdHJhbnNwb3J0OiByZXNvbHZlcyB0aGUgTUNQIHNlcnZlciB2aWEge0BsaW5rIElNY3BTZXJ2aWNlfSBhbmRcbiAqIHByb3hpZXMgcmVxdWVzdHMgdGhyb3VnaCB7QGxpbmsgSU1jcFNlcnZlcn0uIFVzZWQgZm9yIGxvY2FsbHktY29uZmlndXJlZFxuICogTUNQIHNlcnZlcnMgd2hvc2Ugc3RhdGUgbGl2ZXMgaW4gdGhlIHdvcmtiZW5jaC5cbiAqL1xuY2xhc3MgTG9jYWxNY3BBcHBDYWxsVHJhbnNwb3J0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BBcHBDYWxsVHJhbnNwb3J0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Ob3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+KCkpO1xuXHRyZWFkb25seSBvbk5vdGlmaWNhdGlvbjogRXZlbnQ8eyByZWFkb25seSBtZXRob2Q6IHN0cmluZzsgcmVhZG9ubHkgcGFyYW1zPzogdW5rbm93biB9PiA9IHRoaXMuX29uTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VpRGF0YTogRXh0cmFjdDxJTWNwVG9vbENhbGxVSURhdGEsIHsga2luZDogJ2xvY2FsJyB9Pixcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElNY3BTYW1wbGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2FtcGxpbmdTZXJ2aWNlOiBJTWNwU2FtcGxpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2VydmVyKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1jcFNlcnZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBmaW5kTWNwU2VydmVyKHRoaXMuX21jcFNlcnZpY2UsIHMgPT5cblx0XHRcdHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5fdWlEYXRhLnNlcnZlckRlZmluaXRpb25JZCAmJlxuXHRcdFx0cy5jb2xsZWN0aW9uLmlkID09PSB0aGlzLl91aURhdGEuY29sbGVjdGlvbklkLFxuXHRcdFx0dG9rZW5cblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgbG9nKHBhcmFtczogTUNQLkxvZ2dpbmdNZXNzYWdlTm90aWZpY2F0aW9uUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgdGhpcy5fZ2V0U2VydmVyKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdHRyYW5zbGF0ZU1jcExvZ01lc3NhZ2UoKHNlcnZlciBhcyBNY3BTZXJ2ZXIpLmxvZ2dlciwgcGFyYW1zLCBgW0FwcCBVSV1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkUmVzb3VyY2UodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwQXBwUmVzb3VyY2VDb250ZW50PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgdGhpcy5fZ2V0U2VydmVyKHRva2VuKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNQ1Agc2VydmVyIG5vdCBmb3VuZCBmb3IgVUkgcmVzb3VyY2UnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZVJlc3VsdCA9IGF3YWl0IE1jcFNlcnZlci5jYWxsT24oc2VydmVyLCBoID0+IGgucmVhZFJlc291cmNlKHsgdXJpOiB0aGlzLl91aURhdGEucmVzb3VyY2VVcmkgfSwgdG9rZW4pLCB0b2tlbik7XG5cdFx0cmV0dXJuIHJlYWRSZXNvdXJjZUNvbnRlbnRUb0h0bWwocmVzb3VyY2VSZXN1bHQuY29udGVudHMpO1xuXHR9XG5cblx0YXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuX2dldFNlcnZlcih0b2tlbik7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTUNQIHNlcnZlciBub3QgZm91bmQgZm9yIHRvb2wgY2FsbCcpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHN0YXJ0U2VydmVyQW5kV2FpdEZvckxpdmVUb29scyhzZXJ2ZXIsIHVuZGVmaW5lZCwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IHNlcnZlci50b29scy5nZXQoKS5maW5kKHQgPT4gdC5kZWZpbml0aW9uLm5hbWUgPT09IG5hbWUpO1xuXHRcdGlmICghdG9vbCB8fCAhKHRvb2wudmlzaWJpbGl0eSAmIE1jcFRvb2xWaXNpYmlsaXR5LkFwcCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbCBub3QgZm91bmQgb24gc2VydmVyOiAke25hbWV9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdG9vbC5jYWxsKHBhcmFtcywgdW5kZWZpbmVkLCB0b2tlbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IHJlcy5jb250ZW50LFxuXHRcdFx0aXNFcnJvcjogcmVzLmlzRXJyb3IsXG5cdFx0XHRfbWV0YTogcmVzLl9tZXRhLFxuXHRcdFx0c3RydWN0dXJlZENvbnRlbnQ6IHJlcy5zdHJ1Y3R1cmVkQ29udGVudCxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVhZFJlc291cmNlKHVyaTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBhd2FpdCB0aGlzLl9nZXRTZXJ2ZXIodG9rZW4pO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01DUCBzZXJ2ZXIgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IE1jcFNlcnZlci5jYWxsT24oc2VydmVyLCBoID0+IGgucmVhZFJlc291cmNlKHsgdXJpIH0sIHRva2VuKSwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgc2FtcGxpbmcocGFyYW1zOiBNQ1AuQ3JlYXRlTWVzc2FnZVJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DcmVhdGVNZXNzYWdlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgdGhpcy5fZ2V0U2VydmVyKHRva2VuKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNQ1Agc2VydmVyIG5vdCBmb3VuZCBmb3Igc2FtcGxpbmcnKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBzYW1wbGUgfSA9IGF3YWl0IHRoaXMuX3NhbXBsaW5nU2VydmljZS5zYW1wbGUoe1xuXHRcdFx0c2VydmVyLFxuXHRcdFx0aXNEdXJpbmdUb29sQ2FsbDogdHJ1ZSxcblx0XHRcdHBhcmFtcyxcblx0XHR9LCB0b2tlbik7XG5cdFx0cmV0dXJuIHNhbXBsZTtcblx0fVxufVxuXG4vKipcbiAqIEFIUCB0cmFuc3BvcnQ6IHJvdXRlcyByZXF1ZXN0cyBvdmVyIHRoZSBgbWNwOi8vYCBzaWRlIGNoYW5uZWwgdmlhXG4gKiB7QGxpbmsgSUFnZW50SG9zdFNlcnZpY2UuaGFuZGxlTWNwUmVxdWVzdH0sIGFuZCBmaWx0ZXJzXG4gKiB7QGxpbmsgSUFnZW50SG9zdFNlcnZpY2Uub25NY3BOb3RpZmljYXRpb259IGRvd24gdG8gdGhpcyBjaGFubmVsLlxuICpcbiAqIFVzZWQgZm9yIE1DUCBzZXJ2ZXJzIG93bmVkIGJ5IGFuIGFnZW50IGhvc3QgKGUuZy4gQ29waWxvdCBDTEkpLlxuICovXG5jbGFzcyBBaHBNY3BBcHBDYWxsVHJhbnNwb3J0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BBcHBDYWxsVHJhbnNwb3J0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Ob3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXJhbXM/OiB1bmtub3duIH0+KCkpO1xuXHRyZWFkb25seSBvbk5vdGlmaWNhdGlvbjogRXZlbnQ8eyByZWFkb25seSBtZXRob2Q6IHN0cmluZzsgcmVhZG9ubHkgcGFyYW1zPzogdW5rbm93biB9PiA9IHRoaXMuX29uTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VpRGF0YTogRXh0cmFjdDxJTWNwVG9vbENhbGxVSURhdGEsIHsga2luZDogJ2FnZW50SG9zdCcgfT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhbm5lbDogc3RyaW5nLFxuXHRcdEBJQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RTZXJ2aWNlOiBJQWdlbnRIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uub25NY3BOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAobi5jaGFubmVsID09PSB0aGlzLl9jaGFubmVsKSB7XG5cdFx0XHRcdHRoaXMuX29uTm90aWZpY2F0aW9uLmZpcmUoeyBtZXRob2Q6IG4ubWV0aG9kLCBwYXJhbXM6IG4ucGFyYW1zIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGxvZyhwYXJhbXM6IE1DUC5Mb2dnaW5nTWVzc2FnZU5vdGlmaWNhdGlvblBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vdGlmaWNhdGlvbnMgYXJlIG9uZS13YXk7IHRoZSBBSFAgYG1jcDovL2AgY2hhbm5lbCBhY2NlcHRzXG5cdFx0Ly8gYG5vdGlmaWNhdGlvbnMvbWVzc2FnZWAgZnJvbSB0aGUgY2xpZW50LiBXZSB1c2UgdGhlIHJlcXVlc3Rcblx0XHQvLyBwYXRoIGhlcmUgZm9yIHN5bW1ldHJ5ICh0aGUgaG9zdCB0cmVhdHMgYG5vdGlmaWNhdGlvbnMvbWVzc2FnZWBcblx0XHQvLyB0aGUgc2FtZSByZWdhcmRsZXNzIG9mIGhvdyBpdCBhcnJpdmVkKS4gRmFpbHVyZXMgYXJlIHN3YWxsb3dlZFxuXHRcdC8vIHRvIGF2b2lkIHN1cmZhY2luZyBsb2ctcGlwZSBlcnJvcnMgdG8gdGhlIEFwcC5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0KHRoaXMuX2NoYW5uZWwsICdub3RpZmljYXRpb25zL21lc3NhZ2UnLCBwYXJhbXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBuby1vcFxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxvYWRSZXNvdXJjZShfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwQXBwUmVzb3VyY2VDb250ZW50PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0KHRoaXMuX2NoYW5uZWwsICdyZXNvdXJjZXMvcmVhZCcsIHsgdXJpOiB0aGlzLl91aURhdGEucmVzb3VyY2VVcmkgfSkgYXMgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdDtcblx0XHRyZXR1cm4gcmVhZFJlc291cmNlQ29udGVudFRvSHRtbChyZXN1bHQuY29udGVudHMpO1xuXHR9XG5cblx0YXN5bmMgY2FsbFRvb2wobmFtZTogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QodGhpcy5fY2hhbm5lbCwgJ3Rvb2xzL2NhbGwnLCB7IG5hbWUsIGFyZ3VtZW50czogcGFyYW1zIH0pIGFzIE1DUC5DYWxsVG9vbFJlc3VsdDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVhZFJlc291cmNlKHVyaTogc3RyaW5nLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVhZFJlc291cmNlUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0KHRoaXMuX2NoYW5uZWwsICdyZXNvdXJjZXMvcmVhZCcsIHsgdXJpIH0pIGFzIE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHNhbXBsaW5nKHBhcmFtczogTUNQLkNyZWF0ZU1lc3NhZ2VSZXF1ZXN0WydwYXJhbXMnXSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QodGhpcy5fY2hhbm5lbCwgJ3NhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UnLCBwYXJhbXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgYXMgTUNQLkNyZWF0ZU1lc3NhZ2VSZXN1bHQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG4vKipcbiAqIFdyYXBwZXIgY2xhc3MgdGhhdCBcInVwZ3JhZGVzXCIgc2VyaWFsaXphYmxlIElNY3BUb29sQ2FsbFVJRGF0YSBpbnRvIGEgZnVuY3Rpb25hbFxuICogb2JqZWN0IHRoYXQgY2FuIGxvYWQgVUkgcmVzb3VyY2VzIGFuZCBwcm94eSB0b29sL3Jlc291cmNlIGNhbGxzIGJhY2sgdG8gdGhlIE1DUCBzZXJ2ZXIuXG4gKlxuICogU2VsZWN0cyB0aGUgdW5kZXJseWluZyB0cmFuc3BvcnQgYmFzZWQgb24gd2hldGhlciB0aGUgcmVuZGVyZXIgd2FzIGdpdmVuXG4gKiBhbiBBSFAgYG1jcDovL2AgY2hhbm5lbCBcdTIwMTQgYWdlbnQtaG9zdC1yZXNpZGVudCBzZXJ2ZXJzIHJvdXRlIHRocm91Z2hcbiAqIHtAbGluayBJQWdlbnRIb3N0U2VydmljZX0sIGV2ZXJ5dGhpbmcgZWxzZSB1c2VzIHRoZSBsb2NhbCB7QGxpbmsgSU1jcFNlcnZpY2V9LlxuICovXG5leHBvcnQgY2xhc3MgTWNwVG9vbENhbGxVSSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHQvKipcblx0ICogQmFzaWMgaG9zdCBjb250ZXh0IHJlZmxlY3RpbmcgdGhlIGN1cnJlbnQgVUkgYW5kIHRoZW1lLiBOb3RhYmx5IGxhY2tzXG5cdCAqIHRoZSBgdG9vbEluZm9gIG9yIGB2aWV3cG9ydGAgc2l6ZXMuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgaG9zdENvbnRleHQ6IElPYnNlcnZhYmxlPE1jcEFwcHMuTWNwVWlIb3N0Q29udGV4dD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNwb3J0OiBJTWNwQXBwQ2FsbFRyYW5zcG9ydDtcblxuXHQvKiogRm9yd2FyZGVkIE1DUCBzZXJ2ZXIgbm90aWZpY2F0aW9ucyBzY29wZWQgdG8gdGhpcyBBcHAncyBzZXJ2ZXIuICovXG5cdHB1YmxpYyByZWFkb25seSBvbk5vdGlmaWNhdGlvbjogRXZlbnQ8eyByZWFkb25seSBtZXRob2Q6IHN0cmluZzsgcmVhZG9ubHkgcGFyYW1zPzogdW5rbm93biB9PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91aURhdGE6IElNY3BUb29sQ2FsbFVJRGF0YSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdHJhbnNwb3J0ID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRfdWlEYXRhLmtpbmQgPT09ICdhZ2VudEhvc3QnXG5cdFx0XHRcdD8gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWhwTWNwQXBwQ2FsbFRyYW5zcG9ydCwgX3VpRGF0YSwgX3VpRGF0YS5jaGFubmVsKVxuXHRcdFx0XHQ6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsTWNwQXBwQ2FsbFRyYW5zcG9ydCwgX3VpRGF0YSlcblx0XHQpO1xuXHRcdHRoaXMub25Ob3RpZmljYXRpb24gPSB0aGlzLl90cmFuc3BvcnQub25Ob3RpZmljYXRpb247XG5cblx0XHRjb25zdCBjb2xvclRoZW1lID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGU7XG5cdFx0XHRcdHJldHVybiB0eXBlID09PSBDb2xvclNjaGVtZS5EQVJLIHx8IHR5cGUgPT09IENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfREFSSyA/ICdkYXJrJyA6ICdsaWdodCc7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuaG9zdENvbnRleHQgPSBkZXJpdmVkKChyZWFkZXIpOiBNY3BBcHBzLk1jcFVpSG9zdENvbnRleHQgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGhlbWU6IGNvbG9yVGhlbWUucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRzdHlsZXM6IHtcblx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtcHJpbWFyeSc6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtc2Vjb25kYXJ5JzogJ3ZhcigtLXZzY29kZS1zaWRlQmFyLWJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtdGVydGlhcnknOiAndmFyKC0tdnNjb2RlLWFjdGl2aXR5QmFyLWJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtaW52ZXJzZSc6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtZ2hvc3QnOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC1pbmZvJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24taW5mb0JhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtZGFuZ2VyJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24tZXJyb3JCYWNrZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1iYWNrZ3JvdW5kLXN1Y2Nlc3MnOiAndmFyKC0tdnNjb2RlLWRpZmZFZGl0b3ItaW5zZXJ0ZWRUZXh0QmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYmFja2dyb3VuZC13YXJuaW5nJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24td2FybmluZ0JhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJhY2tncm91bmQtZGlzYWJsZWQnOiAndmFyKC0tdnNjb2RlLWVkaXRvci1pbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpJyxcblxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1wcmltYXJ5JzogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LXNlY29uZGFyeSc6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LXRlcnRpYXJ5JzogJ3ZhcigtLXZzY29kZS1kaXNhYmxlZEZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtaW52ZXJzZSc6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtaW5mbyc6ICd2YXIoLS12c2NvZGUtdGV4dExpbmstZm9yZWdyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1kYW5nZXInOiAndmFyKC0tdnNjb2RlLWVycm9yRm9yZWdyb3VuZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItdGV4dC1zdWNjZXNzJzogJ3ZhcigtLXZzY29kZS10ZXN0aW5nLWljb25QYXNzZWQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtd2FybmluZyc6ICd2YXIoLS12c2NvZGUtZWRpdG9yV2FybmluZy1mb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci10ZXh0LWRpc2FibGVkJzogJ3ZhcigtLXZzY29kZS1kaXNhYmxlZEZvcmVncm91bmQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLXRleHQtZ2hvc3QnOiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknLFxuXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItcHJpbWFyeSc6ICd2YXIoLS12c2NvZGUtd2lkZ2V0LWJvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLXNlY29uZGFyeSc6ICd2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLXRlcnRpYXJ5JzogJ3ZhcigtLXZzY29kZS1wYW5lbC1ib3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci1pbnZlcnNlJzogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItZ2hvc3QnOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLWluZm8nOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1pbmZvQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1ib3JkZXItZGFuZ2VyJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24tZXJyb3JCb3JkZXIpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci1zdWNjZXNzJzogJ3ZhcigtLXZzY29kZS10ZXN0aW5nLWljb25QYXNzZWQpJyxcblx0XHRcdFx0XHRcdCctLWNvbG9yLWJvcmRlci13YXJuaW5nJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24td2FybmluZ0JvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItYm9yZGVyLWRpc2FibGVkJzogJ3ZhcigtLXZzY29kZS1kaXNhYmxlZEZvcmVncm91bmQpJyxcblxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItcmluZy1wcmltYXJ5JzogJ3ZhcigtLXZzY29kZS1mb2N1c0JvcmRlciknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItcmluZy1zZWNvbmRhcnknOiAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLWludmVyc2UnOiAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLWluZm8nOiAndmFyKC0tdnNjb2RlLWlucHV0VmFsaWRhdGlvbi1pbmZvQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLWRhbmdlcic6ICd2YXIoLS12c2NvZGUtaW5wdXRWYWxpZGF0aW9uLWVycm9yQm9yZGVyKScsXG5cdFx0XHRcdFx0XHQnLS1jb2xvci1yaW5nLXN1Y2Nlc3MnOiAndmFyKC0tdnNjb2RlLXRlc3RpbmctaWNvblBhc3NlZCknLFxuXHRcdFx0XHRcdFx0Jy0tY29sb3ItcmluZy13YXJuaW5nJzogJ3ZhcigtLXZzY29kZS1pbnB1dFZhbGlkYXRpb24td2FybmluZ0JvcmRlciknLFxuXG5cdFx0XHRcdFx0XHQnLS1mb250LXNhbnMnOiAndmFyKC0tdnNjb2RlLWZvbnQtZmFtaWx5KScsXG5cdFx0XHRcdFx0XHQnLS1mb250LW1vbm8nOiAndmFyKC0tdnNjb2RlLWVkaXRvci1mb250LWZhbWlseSknLFxuXG5cdFx0XHRcdFx0XHQnLS1mb250LXdlaWdodC1ub3JtYWwnOiAnbm9ybWFsJyxcblx0XHRcdFx0XHRcdCctLWZvbnQtd2VpZ2h0LW1lZGl1bSc6ICc1MDAnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC13ZWlnaHQtc2VtaWJvbGQnOiAnNjAwJyxcblx0XHRcdFx0XHRcdCctLWZvbnQtd2VpZ2h0LWJvbGQnOiAnYm9sZCcsXG5cblx0XHRcdFx0XHRcdCctLWZvbnQtdGV4dC14cy1zaXplJzogJzEwcHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LXNtLXNpemUnOiAnMTFweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LXRleHQtbWQtc2l6ZSc6ICcxM3B4Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtdGV4dC1sZy1zaXplJzogJzE0cHgnLFxuXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmcteHMtc2l6ZSc6ICcxNnB4Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy1zbS1zaXplJzogJzE4cHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLW1kLXNpemUnOiAnMjBweCcsXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmctbGctc2l6ZSc6ICcyNHB4Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy14bC1zaXplJzogJzMycHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLTJ4bC1zaXplJzogJzQwcHgnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC1oZWFkaW5nLTN4bC1zaXplJzogJzQ4cHgnLFxuXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLXhzJzogJzJweCcsXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLXNtJzogJzNweCcsXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLW1kJzogJzRweCcsXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLWxnJzogJzZweCcsXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLXhsJzogJzhweCcsXG5cdFx0XHRcdFx0XHQnLS1ib3JkZXItcmFkaXVzLWZ1bGwnOiAnOTk5OXB4JyxcblxuXHRcdFx0XHRcdFx0Jy0tYm9yZGVyLXdpZHRoLXJlZ3VsYXInOiAnMXB4JyxcblxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LXhzLWxpbmUtaGVpZ2h0JzogJzEuNScsXG5cdFx0XHRcdFx0XHQnLS1mb250LXRleHQtc20tbGluZS1oZWlnaHQnOiAnMS41Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtdGV4dC1tZC1saW5lLWhlaWdodCc6ICcxLjUnLFxuXHRcdFx0XHRcdFx0Jy0tZm9udC10ZXh0LWxnLWxpbmUtaGVpZ2h0JzogJzEuNScsXG5cblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy14cy1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy1zbS1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy1tZC1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy1sZy1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy14bC1saW5lLWhlaWdodCc6ICcxLjI1Jyxcblx0XHRcdFx0XHRcdCctLWZvbnQtaGVhZGluZy0yeGwtbGluZS1oZWlnaHQnOiAnMS4yNScsXG5cdFx0XHRcdFx0XHQnLS1mb250LWhlYWRpbmctM3hsLWxpbmUtaGVpZ2h0JzogJzEuMjUnLFxuXG5cdFx0XHRcdFx0XHQnLS1zaGFkb3ctaGFpcmxpbmUnOiAnMCAwIDAgMXB4IHZhcigtLXZzY29kZS13aWRnZXQtc2hhZG93KScsXG5cdFx0XHRcdFx0XHQnLS1zaGFkb3ctc20nOiAnMCAxcHggMnB4IDAgdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3cpJyxcblx0XHRcdFx0XHRcdCctLXNoYWRvdy1tZCc6ICcwIDRweCA2cHggLTFweCB2YXIoLS12c2NvZGUtd2lkZ2V0LXNoYWRvdyknLFxuXHRcdFx0XHRcdFx0Jy0tc2hhZG93LWxnJzogJzAgMTBweCAxNXB4IC0zcHggdmFyKC0tdnNjb2RlLXdpZGdldC1zaGFkb3cpJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc3BsYXlNb2RlOiAnaW5saW5lJyxcblx0XHRcdFx0YXZhaWxhYmxlRGlzcGxheU1vZGVzOiBbJ2lubGluZSddLFxuXHRcdFx0XHRsb2NhbGU6IGxvY2FsZSxcblx0XHRcdFx0cGxhdGZvcm06IGlzV2ViID8gJ3dlYicgOiBpc01vYmlsZSA/ICdtb2JpbGUnIDogJ2Rlc2t0b3AnLFxuXHRcdFx0XHRkZXZpY2VDYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHR0b3VjaDogR2VzdHVyZS5pc1RvdWNoRGV2aWNlKCksXG5cdFx0XHRcdFx0aG92ZXI6IEdlc3R1cmUuaXNIb3ZlckRldmljZSgpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB1bmRlcmx5aW5nIFVJIGRhdGEuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHVpRGF0YSgpOiBJTWNwVG9vbENhbGxVSURhdGEge1xuXHRcdHJldHVybiB0aGlzLl91aURhdGE7XG5cdH1cblxuXHQvKipcblx0ICogTG9ncyBhIG1lc3NhZ2UgdG8gdGhlIE1DUCBzZXJ2ZXIncyBsb2dnZXIuXG5cdCAqL1xuXHRwdWJsaWMgbG9nKGxvZzogTUNQLkxvZ2dpbmdNZXNzYWdlTm90aWZpY2F0aW9uUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYW5zcG9ydC5sb2cobG9nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2FkcyB0aGUgVUkgcmVzb3VyY2UgZnJvbSB0aGUgTUNQIHNlcnZlci5cblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcmV0dXJucyBUaGUgSFRNTCBjb250ZW50IGFuZCBDU1AgY29uZmlndXJhdGlvblxuXHQgKi9cblx0cHVibGljIGxvYWRSZXNvdXJjZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNY3BBcHBSZXNvdXJjZUNvbnRlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0LmxvYWRSZXNvdXJjZSh0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbHMgYSB0b29sIG9uIHRoZSBNQ1Agc2VydmVyLlxuXHQgKiBAcGFyYW0gbmFtZSBUb29sIG5hbWVcblx0ICogQHBhcmFtIHBhcmFtcyBUb29sIHBhcmFtZXRlcnNcblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcmV0dXJucyBUaGUgdG9vbCBjYWxsIHJlc3VsdFxuXHQgKi9cblx0cHVibGljIGNhbGxUb29sKG5hbWU6IHN0cmluZywgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0LmNhbGxUb29sKG5hbWUsIHBhcmFtcywgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIGEgcmVzb3VyY2UgZnJvbSB0aGUgTUNQIHNlcnZlci5cblx0ICogQHBhcmFtIHVyaSBSZXNvdXJjZSBVUklcblx0ICogQHBhcmFtIHRva2VuIENhbmNlbGxhdGlvbiB0b2tlblxuXHQgKiBAcmV0dXJucyBUaGUgcmVzb3VyY2UgY29udGVudFxuXHQgKi9cblx0cHVibGljIHJlYWRSZXNvdXJjZSh1cmk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVhZFJlc291cmNlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYW5zcG9ydC5yZWFkUmVzb3VyY2UodXJpLCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogSXNzdWVzIGEgYHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2VgIHJlcXVlc3QgYWdhaW5zdCB0aGUgTUNQIHNlcnZlcidzXG5cdCAqIGhvc3Qtc2lkZSBzYW1wbGluZyBpbXBsZW1lbnRhdGlvbi4gT25seSBzdXBwb3J0ZWQgd2hlbiB0aGUgQXBwXG5cdCAqIHNlcnZlciBydW5zIGluc2lkZSBhbiBhZ2VudCBob3N0IHRoYXQgaGFzIG9wdGVkIGludG8gc2FtcGxpbmcuXG5cdCAqL1xuXHRwdWJsaWMgc2FtcGxpbmcocGFyYW1zOiBNQ1AuQ3JlYXRlTWVzc2FnZVJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DcmVhdGVNZXNzYWdlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRo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Qix3QkFBd0I7QUFBQSxZQUN4Qix1QkFBdUI7QUFBQSxZQUN2Qix5QkFBeUI7QUFBQSxZQUN6QiwwQkFBMEI7QUFBQSxZQUMxQiwwQkFBMEI7QUFBQSxZQUMxQiwyQkFBMkI7QUFBQSxZQUUzQix3QkFBd0I7QUFBQSxZQUN4QiwwQkFBMEI7QUFBQSxZQUMxQix3QkFBd0I7QUFBQSxZQUN4QixxQkFBcUI7QUFBQSxZQUNyQix1QkFBdUI7QUFBQSxZQUN2Qix3QkFBd0I7QUFBQSxZQUN4Qix3QkFBd0I7QUFBQSxZQUV4QixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFFZix3QkFBd0I7QUFBQSxZQUN4Qix3QkFBd0I7QUFBQSxZQUN4QiwwQkFBMEI7QUFBQSxZQUMxQixzQkFBc0I7QUFBQSxZQUV0Qix1QkFBdUI7QUFBQSxZQUN2Qix1QkFBdUI7QUFBQSxZQUN2Qix1QkFBdUI7QUFBQSxZQUN2Qix1QkFBdUI7QUFBQSxZQUV2QiwwQkFBMEI7QUFBQSxZQUMxQiwwQkFBMEI7QUFBQSxZQUMxQiwwQkFBMEI7QUFBQSxZQUMxQiwwQkFBMEI7QUFBQSxZQUMxQiwwQkFBMEI7QUFBQSxZQUMxQiwyQkFBMkI7QUFBQSxZQUMzQiwyQkFBMkI7QUFBQSxZQUUzQixzQkFBc0I7QUFBQSxZQUN0QixzQkFBc0I7QUFBQSxZQUN0QixzQkFBc0I7QUFBQSxZQUN0QixzQkFBc0I7QUFBQSxZQUN0QixzQkFBc0I7QUFBQSxZQUN0Qix3QkFBd0I7QUFBQSxZQUV4QiwwQkFBMEI7QUFBQSxZQUUxQiw4QkFBOEI7QUFBQSxZQUM5Qiw4QkFBOEI7QUFBQSxZQUM5Qiw4QkFBOEI7QUFBQSxZQUM5Qiw4QkFBOEI7QUFBQSxZQUU5QixpQ0FBaUM7QUFBQSxZQUNqQyxpQ0FBaUM7QUFBQSxZQUNqQyxpQ0FBaUM7QUFBQSxZQUNqQyxpQ0FBaUM7QUFBQSxZQUNqQyxpQ0FBaUM7QUFBQSxZQUNqQyxrQ0FBa0M7QUFBQSxZQUNsQyxrQ0FBa0M7QUFBQSxZQUVsQyxxQkFBcUI7QUFBQSxZQUNyQixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsVUFDaEI7QUFBQSxRQUNEO0FBQUEsUUFDQSxhQUFhO0FBQUEsUUFDYix1QkFBdUIsQ0FBQyxRQUFRO0FBQUEsUUFDaEM7QUFBQSxRQUNBLFVBQVUsUUFBUSxRQUFRLFdBQVcsV0FBVztBQUFBLFFBQ2hELG9CQUFvQjtBQUFBLFVBQ25CLE9BQU8sUUFBUSxjQUFjO0FBQUEsVUFDN0IsT0FBTyxRQUFRLGNBQWM7QUFBQSxRQUM5QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLFNBQTZCO0FBQ3ZDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLElBQUksS0FBMEQ7QUFDcEUsV0FBTyxLQUFLLFdBQVcsSUFBSSxHQUFHO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTyxhQUFhLE9BQTJEO0FBQzlFLFdBQU8sS0FBSyxXQUFXLGFBQWEsS0FBSztBQUFBLEVBQzFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNPLFNBQVMsTUFBYyxRQUFpQyxPQUF1RDtBQUNySCxXQUFPLEtBQUssV0FBVyxTQUFTLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDcEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFPLGFBQWEsS0FBYSxPQUEyRDtBQUMzRixXQUFPLEtBQUssV0FBVyxhQUFhLEtBQUssS0FBSztBQUFBLEVBQy9DO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT08sU0FBUyxRQUE0QyxPQUE0RDtBQUN2SCxXQUFPLEtBQUssV0FBVyxTQUFTLFFBQVEsS0FBSztBQUFBLEVBQzlDO0FBQ0Q7QUFqTWEsZ0JBQU47QUFBQSxFQWNKO0FBQUEsRUFDQTtBQUFBLEdBZlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
