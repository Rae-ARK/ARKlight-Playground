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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TerminalToolId } from "./toolIds.js";
const GetTerminalLastCommandToolData = {
  id: TerminalToolId.TerminalLastCommand,
  toolReferenceName: "terminalLastCommand",
  legacyToolReferenceFullNames: ["runCommands/terminalLastCommand"],
  displayName: localize("terminalLastCommandTool.displayName", "Get Terminal Last Command"),
  modelDescription: "Get the last command run in the active terminal.",
  source: ToolDataSource.Internal,
  icon: Codicon.terminal
};
let GetTerminalLastCommandTool = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
  }
  async prepareToolInvocation(context, token) {
    return {
      invocationMessage: localize("getTerminalLastCommand.progressive", "Getting last terminal command"),
      pastTenseMessage: localize("getTerminalLastCommand.past", "Got last terminal command")
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const activeInstance = this._terminalService.activeInstance;
    if (!activeInstance) {
      return {
        content: [{
          kind: "text",
          value: "No active terminal instance found."
        }]
      };
    }
    const commandDetection = activeInstance.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      return {
        content: [{
          kind: "text",
          value: "No command detection capability available in the active terminal."
        }]
      };
    }
    const executingCommand = commandDetection.executingCommand;
    if (executingCommand) {
      const userPrompt2 = [];
      userPrompt2.push("The following command is currently executing in the terminal:");
      userPrompt2.push(executingCommand);
      const cwd = commandDetection.cwd;
      if (cwd) {
        userPrompt2.push("It is running in the directory:");
        userPrompt2.push(cwd);
      }
      return {
        content: [{
          kind: "text",
          value: userPrompt2.join("\n")
        }]
      };
    }
    const commands = commandDetection.commands;
    if (!commands || commands.length === 0) {
      return {
        content: [{
          kind: "text",
          value: "No command has been run in the active terminal."
        }]
      };
    }
    const lastCommand = commands[commands.length - 1];
    const userPrompt = [];
    if (lastCommand.command) {
      userPrompt.push("The following is the last command run in the terminal:");
      userPrompt.push(lastCommand.command);
    }
    if (lastCommand.cwd) {
      userPrompt.push("It was run in the directory:");
      userPrompt.push(lastCommand.cwd);
    }
    if (lastCommand.exitCode !== void 0) {
      userPrompt.push(`It exited with code: ${lastCommand.exitCode}`);
    }
    if (lastCommand.hasOutput() && lastCommand.getOutput) {
      const output = lastCommand.getOutput();
      if (output && output.trim().length > 0) {
        userPrompt.push("It has the following output:");
        userPrompt.push(output);
      }
    }
    return {
      content: [{
        kind: "text",
        value: userPrompt.join("\n")
      }]
    };
  }
};
GetTerminalLastCommandTool = __decorateClass([
  __decorateParam(0, ITerminalService)
], GetTerminalLastCommandTool);
export {
  GetTerminalLastCommandTool,
  GetTerminalLastCommandToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2dldFRlcm1pbmFsTGFzdENvbW1hbmRUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbERhdGEsIHR5cGUgSVRvb2xJbXBsLCB0eXBlIElUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHR5cGUgSVRvb2xSZXN1bHQsIHR5cGUgQ291bnRUb2tlbnNDYWxsYmFjaywgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi90b29sSWRzLmpzJztcblxuZXhwb3J0IGNvbnN0IEdldFRlcm1pbmFsTGFzdENvbW1hbmRUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogVGVybWluYWxUb29sSWQuVGVybWluYWxMYXN0Q29tbWFuZCxcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0ZXJtaW5hbExhc3RDb21tYW5kJyxcblx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydydW5Db21tYW5kcy90ZXJtaW5hbExhc3RDb21tYW5kJ10sXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndGVybWluYWxMYXN0Q29tbWFuZFRvb2wuZGlzcGxheU5hbWUnLCAnR2V0IFRlcm1pbmFsIExhc3QgQ29tbWFuZCcpLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnR2V0IHRoZSBsYXN0IGNvbW1hbmQgcnVuIGluIHRoZSBhY3RpdmUgdGVybWluYWwuJyxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcbn07XG5cbmV4cG9ydCBjbGFzcyBHZXRUZXJtaW5hbExhc3RDb21tYW5kVG9vbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdnZXRUZXJtaW5hbExhc3RDb21tYW5kLnByb2dyZXNzaXZlJywgXCJHZXR0aW5nIGxhc3QgdGVybWluYWwgY29tbWFuZFwiKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdnZXRUZXJtaW5hbExhc3RDb21tYW5kLnBhc3QnLCBcIkdvdCBsYXN0IHRlcm1pbmFsIGNvbW1hbmRcIiksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoIWFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ05vIGFjdGl2ZSB0ZXJtaW5hbCBpbnN0YW5jZSBmb3VuZC4nXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSBhY3RpdmVJbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiAnTm8gY29tbWFuZCBkZXRlY3Rpb24gY2FwYWJpbGl0eSBhdmFpbGFibGUgaW4gdGhlIGFjdGl2ZSB0ZXJtaW5hbC4nXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGluZ0NvbW1hbmQgPSBjb21tYW5kRGV0ZWN0aW9uLmV4ZWN1dGluZ0NvbW1hbmQ7XG5cdFx0aWYgKGV4ZWN1dGluZ0NvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHVzZXJQcm9tcHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2goJ1RoZSBmb2xsb3dpbmcgY29tbWFuZCBpcyBjdXJyZW50bHkgZXhlY3V0aW5nIGluIHRoZSB0ZXJtaW5hbDonKTtcblx0XHRcdHVzZXJQcm9tcHQucHVzaChleGVjdXRpbmdDb21tYW5kKTtcblxuXHRcdFx0Y29uc3QgY3dkID0gY29tbWFuZERldGVjdGlvbi5jd2Q7XG5cdFx0XHRpZiAoY3dkKSB7XG5cdFx0XHRcdHVzZXJQcm9tcHQucHVzaCgnSXQgaXMgcnVubmluZyBpbiB0aGUgZGlyZWN0b3J5OicpO1xuXHRcdFx0XHR1c2VyUHJvbXB0LnB1c2goY3dkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IHVzZXJQcm9tcHQuam9pbignXFxuJylcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBjb21tYW5kRGV0ZWN0aW9uLmNvbW1hbmRzO1xuXHRcdGlmICghY29tbWFuZHMgfHwgY29tbWFuZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ05vIGNvbW1hbmQgaGFzIGJlZW4gcnVuIGluIHRoZSBhY3RpdmUgdGVybWluYWwuJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBsYXN0Q29tbWFuZCA9IGNvbW1hbmRzW2NvbW1hbmRzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IHVzZXJQcm9tcHQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAobGFzdENvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0dXNlclByb21wdC5wdXNoKCdUaGUgZm9sbG93aW5nIGlzIHRoZSBsYXN0IGNvbW1hbmQgcnVuIGluIHRoZSB0ZXJtaW5hbDonKTtcblx0XHRcdHVzZXJQcm9tcHQucHVzaChsYXN0Q29tbWFuZC5jb21tYW5kKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdENvbW1hbmQuY3dkKSB7XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2goJ0l0IHdhcyBydW4gaW4gdGhlIGRpcmVjdG9yeTonKTtcblx0XHRcdHVzZXJQcm9tcHQucHVzaChsYXN0Q29tbWFuZC5jd2QpO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0Q29tbWFuZC5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR1c2VyUHJvbXB0LnB1c2goYEl0IGV4aXRlZCB3aXRoIGNvZGU6ICR7bGFzdENvbW1hbmQuZXhpdENvZGV9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RDb21tYW5kLmhhc091dHB1dCgpICYmIGxhc3RDb21tYW5kLmdldE91dHB1dCkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gbGFzdENvbW1hbmQuZ2V0T3V0cHV0KCk7XG5cdFx0XHRpZiAob3V0cHV0ICYmIG91dHB1dC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR1c2VyUHJvbXB0LnB1c2goJ0l0IGhhcyB0aGUgZm9sbG93aW5nIG91dHB1dDonKTtcblx0XHRcdFx0dXNlclByb21wdC5wdXNoKG91dHB1dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0dmFsdWU6IHVzZXJQcm9tcHQuam9pbignXFxuJylcblx0XHRcdH1dXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSxpQ0FBNEM7QUFBQSxFQUN4RCxJQUFJLGVBQWU7QUFBQSxFQUNuQixtQkFBbUI7QUFBQSxFQUNuQiw4QkFBOEIsQ0FBQyxpQ0FBaUM7QUFBQSxFQUNoRSxhQUFhLFNBQVMsdUNBQXVDLDJCQUEyQjtBQUFBLEVBQ3hGLGtCQUFrQjtBQUFBLEVBQ2xCLFFBQVEsZUFBZTtBQUFBLEVBQ3ZCLE1BQU0sUUFBUTtBQUNmO0FBRU8sSUFBTSw2QkFBTixjQUF5QyxXQUFnQztBQUFBLEVBRS9FLFlBQ29DLGtCQUNsQztBQUNELFVBQU07QUFGNkI7QUFBQSxFQUdwQztBQUFBLEVBRUEsTUFBTSxzQkFBc0IsU0FBNEMsT0FBd0U7QUFDL0ksV0FBTztBQUFBLE1BQ04sbUJBQW1CLFNBQVMsc0NBQXNDLCtCQUErQjtBQUFBLE1BQ2pH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
