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
import { getCommandOutputSnapshot } from "../../../../terminal/browser/chatTerminalCommandMirror.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
let TerminalCommandArtifactCollector = class {
  constructor(_logService) {
    this._logService = _logService;
  }
  async capture(toolSpecificData, instance, commandId) {
    if (commandId) {
      try {
        toolSpecificData.terminalCommandUri = this._createTerminalCommandUri(instance, commandId);
      } catch (error) {
        this._logService.warn(`RunInTerminalTool: Failed to create terminal command URI for ${commandId}`, error);
      }
      const command = await this._tryGetCommand(instance, commandId);
      if (command) {
        toolSpecificData.terminalCommandState = {
          exitCode: command.exitCode,
          timestamp: command.timestamp,
          duration: command.duration
        };
        const snapshot = await this._captureCommandOutput(instance, command);
        if (snapshot) {
          toolSpecificData.terminalCommandOutput = snapshot;
        }
        this._applyTheme(toolSpecificData, instance);
        return;
      }
      const partialSnapshot = await this._capturePartialCommandOutput(instance, commandId);
      if (partialSnapshot) {
        toolSpecificData.terminalCommandOutput = partialSnapshot;
        this._logService.debug(`RunInTerminalTool: Captured partial command output for ${commandId}`);
      }
    }
    this._applyTheme(toolSpecificData, instance);
  }
  async _captureCommandOutput(instance, command) {
    try {
      await instance.xtermReadyPromise;
    } catch {
      return void 0;
    }
    const xterm = instance.xterm;
    if (!xterm) {
      return void 0;
    }
    return getCommandOutputSnapshot(xterm, command, (reason, error) => {
      const suffix = reason === "fallback" ? " (fallback)" : "";
      this._logService.debug(`RunInTerminalTool: Failed to snapshot command output${suffix}`, error);
    });
  }
  /**
   * Captures output from a partial/current command that hasn't finished yet.
   * This is used when the command is cancelled mid-execution.
   */
  async _capturePartialCommandOutput(instance, commandId) {
    try {
      await instance.xtermReadyPromise;
    } catch {
      return void 0;
    }
    const xterm = instance.xterm;
    if (!xterm) {
      return void 0;
    }
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    const currentCommand = commandDetection?.currentCommand;
    if (currentCommand && currentCommand.id === commandId) {
      const executedMarker = currentCommand.commandExecutedMarker;
      if (executedMarker && !executedMarker.isDisposed) {
        try {
          const raw = xterm.raw;
          const buffer = raw.buffer.active;
          const endLine = buffer.baseY + buffer.cursorY;
          const startLine = executedMarker.line;
          const lineCount = Math.max(endLine - startLine, 0);
          if (lineCount > 0) {
            const text = await xterm.getRangeAsVT(executedMarker, void 0, true);
            if (text) {
              return { text, lineCount };
            }
          }
        } catch (error) {
          this._logService.debug(`RunInTerminalTool: Failed to capture partial command output`, error);
        }
      }
    }
    return void 0;
  }
  _applyTheme(toolSpecificData, instance) {
    const theme = instance.xterm?.getXtermTheme();
    if (theme) {
      toolSpecificData.terminalTheme = { background: theme.background, foreground: theme.foreground };
    }
  }
  _createTerminalCommandUri(instance, commandId) {
    const params = new URLSearchParams(instance.resource.query);
    params.set("command", commandId);
    return instance.resource.with({ query: params.toString() });
  }
  async _tryGetCommand(instance, commandId) {
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    return commandDetection?.commands.find((c) => c.id === commandId);
  }
};
TerminalCommandArtifactCollector = __decorateClass([
  __decorateParam(0, ITerminalLogService)
], TerminalCommandArtifactCollector);
export {
  TerminalCommandArtifactCollector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3Rlcm1pbmFsQ29tbWFuZEFydGlmYWN0Q29sbGVjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZ2V0Q29tbWFuZE91dHB1dFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci9jaGF0VGVybWluYWxDb21tYW5kTWlycm9yLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSwgdHlwZSBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3RvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgY2FwdHVyZShcblx0XHR0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLFxuXHRcdGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRjb21tYW5kSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbW1hbmRJZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkgPSB0aGlzLl9jcmVhdGVUZXJtaW5hbENvbW1hbmRVcmkoaW5zdGFuY2UsIGNvbW1hbmRJZCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gY3JlYXRlIHRlcm1pbmFsIGNvbW1hbmQgVVJJIGZvciAke2NvbW1hbmRJZH1gLCBlcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBhd2FpdCB0aGlzLl90cnlHZXRDb21tYW5kKGluc3RhbmNlLCBjb21tYW5kSWQpO1xuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA9IHtcblx0XHRcdFx0XHRleGl0Q29kZTogY29tbWFuZC5leGl0Q29kZSxcblx0XHRcdFx0XHR0aW1lc3RhbXA6IGNvbW1hbmQudGltZXN0YW1wLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiBjb21tYW5kLmR1cmF0aW9uXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fY2FwdHVyZUNvbW1hbmRPdXRwdXQoaW5zdGFuY2UsIGNvbW1hbmQpO1xuXHRcdFx0XHRpZiAoc25hcHNob3QpIHtcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCA9IHNuYXBzaG90O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FwcGx5VGhlbWUodG9vbFNwZWNpZmljRGF0YSwgaW5zdGFuY2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbW1hbmQgbm90IGZvdW5kIGluIGZpbmlzaGVkIGNvbW1hbmRzIC0gdHJ5IHRvIGNhcHR1cmUgY3VycmVudC9wYXJ0aWFsIGNvbW1hbmQgb3V0cHV0XG5cdFx0XHRjb25zdCBwYXJ0aWFsU25hcHNob3QgPSBhd2FpdCB0aGlzLl9jYXB0dXJlUGFydGlhbENvbW1hbmRPdXRwdXQoaW5zdGFuY2UsIGNvbW1hbmRJZCk7XG5cdFx0XHRpZiAocGFydGlhbFNuYXBzaG90KSB7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kT3V0cHV0ID0gcGFydGlhbFNuYXBzaG90O1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQ2FwdHVyZWQgcGFydGlhbCBjb21tYW5kIG91dHB1dCBmb3IgJHtjb21tYW5kSWR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXBwbHlUaGVtZSh0b29sU3BlY2lmaWNEYXRhLCBpbnN0YW5jZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlQ29tbWFuZE91dHB1dChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQpOiBQcm9taXNlPElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZE91dHB1dCddIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGluc3RhbmNlLnh0ZXJtUmVhZHlQcm9taXNlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeHRlcm0gPSBpbnN0YW5jZS54dGVybTtcblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXRDb21tYW5kT3V0cHV0U25hcHNob3QoeHRlcm0sIGNvbW1hbmQsIChyZWFzb24sIGVycm9yKSA9PiB7XG5cdFx0XHRjb25zdCBzdWZmaXggPSByZWFzb24gPT09ICdmYWxsYmFjaycgPyAnIChmYWxsYmFjayknIDogJyc7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIHNuYXBzaG90IGNvbW1hbmQgb3V0cHV0JHtzdWZmaXh9YCwgZXJyb3IpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhcHR1cmVzIG91dHB1dCBmcm9tIGEgcGFydGlhbC9jdXJyZW50IGNvbW1hbmQgdGhhdCBoYXNuJ3QgZmluaXNoZWQgeWV0LlxuXHQgKiBUaGlzIGlzIHVzZWQgd2hlbiB0aGUgY29tbWFuZCBpcyBjYW5jZWxsZWQgbWlkLWV4ZWN1dGlvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NhcHR1cmVQYXJ0aWFsQ29tbWFuZE91dHB1dChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHh0ZXJtID0gaW5zdGFuY2UueHRlcm07XG5cdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gZmluZCB0aGUgY3VycmVudC9wYXJ0aWFsIGNvbW1hbmRcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29uc3QgY3VycmVudENvbW1hbmQgPSBjb21tYW5kRGV0ZWN0aW9uPy5jdXJyZW50Q29tbWFuZDtcblx0XHRpZiAoY3VycmVudENvbW1hbmQgJiYgKGN1cnJlbnRDb21tYW5kIGFzIHsgaWQ/OiBzdHJpbmcgfSkuaWQgPT09IGNvbW1hbmRJZCkge1xuXHRcdFx0Ly8gVXNlIGNvbW1hbmRFeGVjdXRlZE1hcmtlciBmcm9tIHBhcnRpYWwgY29tbWFuZFxuXHRcdFx0Y29uc3QgZXhlY3V0ZWRNYXJrZXIgPSBjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXI7XG5cdFx0XHRpZiAoZXhlY3V0ZWRNYXJrZXIgJiYgIWV4ZWN1dGVkTWFya2VyLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBHZXQgdGV4dCBmcm9tIGV4ZWN1dGVkIG1hcmtlciB0byBjdXJyZW50IGN1cnNvciBwb3NpdGlvblxuXHRcdFx0XHRcdGNvbnN0IHJhdyA9IHh0ZXJtLnJhdztcblx0XHRcdFx0XHRjb25zdCBidWZmZXIgPSByYXcuYnVmZmVyLmFjdGl2ZTtcblx0XHRcdFx0XHRjb25zdCBlbmRMaW5lID0gYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRMaW5lID0gZXhlY3V0ZWRNYXJrZXIubGluZTtcblx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBNYXRoLm1heChlbmRMaW5lIC0gc3RhcnRMaW5lLCAwKTtcblxuXHRcdFx0XHRcdGlmIChsaW5lQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgeHRlcm0uZ2V0UmFuZ2VBc1ZUKGV4ZWN1dGVkTWFya2VyLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0aWYgKHRleHQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdGV4dCwgbGluZUNvdW50IH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gY2FwdHVyZSBwYXJ0aWFsIGNvbW1hbmQgb3V0cHV0YCwgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGhlbWUodG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhlbWUgPSBpbnN0YW5jZS54dGVybT8uZ2V0WHRlcm1UaGVtZSgpO1xuXHRcdGlmICh0aGVtZSkge1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbFRoZW1lID0geyBiYWNrZ3JvdW5kOiB0aGVtZS5iYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kOiB0aGVtZS5mb3JlZ3JvdW5kIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGVybWluYWxDb21tYW5kVXJpKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgY29tbWFuZElkOiBzdHJpbmcpOiBVUkkge1xuXHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5zdGFuY2UucmVzb3VyY2UucXVlcnkpO1xuXHRcdHBhcmFtcy5zZXQoJ2NvbW1hbmQnLCBjb21tYW5kSWQpO1xuXHRcdHJldHVybiBpbnN0YW5jZS5yZXNvdXJjZS53aXRoKHsgcXVlcnk6IHBhcmFtcy50b1N0cmluZygpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ5R2V0Q29tbWFuZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmRJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdHJldHVybiBjb21tYW5kRGV0ZWN0aW9uPy5jb21tYW5kcy5maW5kKGMgPT4gYy5pZCA9PT0gY29tbWFuZElkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFRQSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUFpRDtBQUMxRCxTQUFTLDJCQUEyQjtBQUU3QixJQUFNLG1DQUFOLE1BQXVDO0FBQUEsRUFDN0MsWUFDdUMsYUFDckM7QUFEcUM7QUFBQSxFQUNuQztBQUFBLEVBRUosTUFBTSxRQUNMLGtCQUNBLFVBQ0EsV0FDZ0I7QUFDaEIsUUFBSSxXQUFXO0FBQ2QsVUFBSTtBQUNILHlCQUFpQixxQkFBcUIsS0FBSywwQkFBMEIsVUFBVSxTQUFTO0FBQUEsTUFDekYsU0FBUyxPQUFPO0FBQ2YsYUFBSyxZQUFZLEtBQUssZ0VBQWdFLFNBQVMsSUFBSSxLQUFLO0FBQUEsTUFDekc7QUFFQSxZQUFNLFVBQVUsTUFBTSxLQUFLLGVBQWUsVUFBVSxTQUFTO0FBQzdELFVBQUksU0FBUztBQUNaLHlCQUFpQix1QkFBdUI7QUFBQSxVQUN2QyxVQUFVLFFBQVE7QUFBQSxVQUNsQixXQUFXLFFBQVE7QUFBQSxVQUNuQixVQUFVLFFBQVE7QUFBQSxRQUNuQjtBQUNBLGNBQU0sV0FBVyxNQUFNLEtBQUssc0JBQXNCLFVBQVUsT0FBTztBQUNuRSxZQUFJLFVBQVU7QUFDYiwyQkFBaUIsd0JBQXdCO0FBQUEsUUFDMUM7QUFDQSxhQUFLLFlBQVksa0JBQWtCLFFBQVE7QUFDM0M7QUFBQSxNQUNEO0FBR0EsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLDZCQUE2QixVQUFVLFNBQVM7QUFDbkYsVUFBSSxpQkFBaUI7QUFDcEIseUJBQWlCLHdCQUF3QjtBQUN6QyxhQUFLLFlBQVksTUFBTSwwREFBMEQsU0FBUyxFQUFFO0FBQUEsTUFDN0Y7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZLGtCQUFrQixRQUFRO0FBQUEsRUFDNUM7QUFBQSxFQUVBLE1BQWMsc0JBQXNCLFVBQTZCLFNBQTBHO0FBQzFLLFFBQUk7QUFDSCxZQUFNLFNBQVM7QUFBQSxJQUNoQixRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsU0FBUztBQUN2QixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyx5QkFBeUIsT0FBTyxTQUFTLENBQUMsUUFBUSxVQUFVO0FBQ2xFLFlBQU0sU0FBUyxXQUFXLGFBQWEsZ0JBQWdCO0FBQ3ZELFdBQUssWUFBWSxNQUFNLHVEQUF1RCxNQUFNLElBQUksS0FBSztBQUFBLElBQzlGLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsNkJBQTZCLFVBQTZCLFdBQWtHO0FBQ3pLLFFBQUk7QUFDSCxZQUFNLFNBQVM7QUFBQSxJQUNoQixRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsU0FBUztBQUN2QixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxtQkFBbUIsU0FBUyxhQUFhLElBQUksbUJBQW1CLGdCQUFnQjtBQUN0RixVQUFNLGlCQUFpQixrQkFBa0I7QUFDekMsUUFBSSxrQkFBbUIsZUFBbUMsT0FBTyxXQUFXO0FBRTNFLFlBQU0saUJBQWlCLGVBQWU7QUFDdEMsVUFBSSxrQkFBa0IsQ0FBQyxlQUFlLFlBQVk7QUFDakQsWUFBSTtBQUVILGdCQUFNLE1BQU0sTUFBTTtBQUNsQixnQkFBTSxTQUFTLElBQUksT0FBTztBQUMxQixnQkFBTSxVQUFVLE9BQU8sUUFBUSxPQUFPO0FBQ3RDLGdCQUFNLFlBQVksZUFBZTtBQUNqQyxnQkFBTSxZQUFZLEtBQUssSUFBSSxVQUFVLFdBQVcsQ0FBQztBQUVqRCxjQUFJLFlBQVksR0FBRztBQUNsQixrQkFBTSxPQUFPLE1BQU0sTUFBTSxhQUFhLGdCQUFnQixRQUFXLElBQUk7QUFDckUsZ0JBQUksTUFBTTtBQUNULHFCQUFPLEVBQUUsTUFBTSxVQUFVO0FBQUEsWUFDMUI7QUFBQSxVQUNEO0FBQUEsUUFDRCxTQUFTLE9BQU87QUFDZixlQUFLLFlBQVksTUFBTSwrREFBK0QsS0FBSztBQUFBLFFBQzVGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxrQkFBbUQsVUFBbUM7QUFDekcsVUFBTSxRQUFRLFNBQVMsT0FBTyxjQUFjO0FBQzVDLFFBQUksT0FBTztBQUNWLHVCQUFpQixnQkFBZ0IsRUFBRSxZQUFZLE1BQU0sWUFBWSxZQUFZLE1BQU0sV0FBVztBQUFBLElBQy9GO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQTBCLFVBQTZCLFdBQXdCO0FBQ3RGLFVBQU0sU0FBUyxJQUFJLGdCQUFnQixTQUFTLFNBQVMsS0FBSztBQUMxRCxXQUFPLElBQUksV0FBVyxTQUFTO0FBQy9CLFdBQU8sU0FBUyxTQUFTLEtBQUssRUFBRSxPQUFPLE9BQU8sU0FBUyxFQUFFLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRUEsTUFBYyxlQUFlLFVBQTZCLFdBQW1CO0FBQzVFLFVBQU0sbUJBQW1CLFNBQVMsYUFBYSxJQUFJLG1CQUFtQixnQkFBZ0I7QUFDdEYsV0FBTyxrQkFBa0IsU0FBUyxLQUFLLE9BQUssRUFBRSxPQUFPLFNBQVM7QUFBQSxFQUMvRDtBQUNEO0FBMUhhLG1DQUFOO0FBQUEsRUFFSjtBQUFBLEdBRlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
