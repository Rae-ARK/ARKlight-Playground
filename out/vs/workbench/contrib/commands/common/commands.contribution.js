import { safeStringify } from "../../../../base/common/objects.js";
import * as nls from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
class RunCommands extends Action2 {
  constructor() {
    super({
      id: "runCommands",
      title: nls.localize2("runCommands", "Run Commands"),
      f1: false,
      metadata: {
        description: nls.localize("runCommands.description", "Run several commands"),
        args: [
          {
            name: "args",
            schema: {
              type: "object",
              required: ["commands"],
              properties: {
                commands: {
                  type: "array",
                  description: nls.localize("runCommands.commands", "Commands to run"),
                  items: {
                    anyOf: [
                      {
                        $ref: "vscode://schemas/keybindings#/definitions/commandNames"
                      },
                      {
                        type: "string"
                      },
                      {
                        type: "object",
                        required: ["command"],
                        properties: {
                          command: {
                            "anyOf": [
                              {
                                $ref: "vscode://schemas/keybindings#/definitions/commandNames"
                              },
                              {
                                type: "string"
                              }
                            ]
                          }
                        },
                        $ref: "vscode://schemas/keybindings#/definitions/commandsSchemas"
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  // dev decisions:
  // - this command takes a single argument-object because
  //	- keybinding definitions don't allow running commands with several arguments
  //  - and we want to be able to take on different other arguments in future, e.g., `runMode : 'serial' | 'concurrent'`
  async run(accessor, args) {
    const notificationService = accessor.get(INotificationService);
    if (!this._isCommandArgs(args)) {
      notificationService.error(nls.localize("runCommands.invalidArgs", "'runCommands' has received an argument with incorrect type. Please, review the argument passed to the command."));
      return;
    }
    if (args.commands.length === 0) {
      notificationService.warn(nls.localize("runCommands.noCommandsToRun", "'runCommands' has not received commands to run. Did you forget to pass commands in the 'runCommands' argument?"));
      return;
    }
    const commandService = accessor.get(ICommandService);
    const logService = accessor.get(ILogService);
    let i = 0;
    try {
      for (; i < args.commands.length; ++i) {
        const cmd = args.commands[i];
        logService.debug(`runCommands: executing ${i}-th command: ${safeStringify(cmd)}`);
        await this._runCommand(commandService, cmd);
        logService.debug(`runCommands: executed ${i}-th command`);
      }
    } catch (err) {
      logService.debug(`runCommands: executing ${i}-th command resulted in an error: ${err instanceof Error ? err.message : safeStringify(err)}`);
      notificationService.error(err);
    }
  }
  _isCommandArgs(args) {
    if (!args || typeof args !== "object") {
      return false;
    }
    if (!("commands" in args) || !Array.isArray(args.commands)) {
      return false;
    }
    for (const cmd of args.commands) {
      if (typeof cmd === "string") {
        continue;
      }
      if (typeof cmd === "object" && typeof cmd.command === "string") {
        continue;
      }
      return false;
    }
    return true;
  }
  _runCommand(commandService, cmd) {
    let commandID, commandArgs;
    if (typeof cmd === "string") {
      commandID = cmd;
    } else {
      commandID = cmd.command;
      commandArgs = cmd.args;
    }
    if (commandArgs === void 0) {
      return commandService.executeCommand(commandID);
    } else {
      if (Array.isArray(commandArgs)) {
        return commandService.executeCommand(commandID, ...commandArgs);
      } else {
        return commandService.executeCommand(commandID, commandArgs);
      }
    }
  }
}
registerAction2(RunCommands);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzYWZlU3RyaW5naWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5cbnR5cGUgUnVubmFibGVDb21tYW5kID0gc3RyaW5nIHwgeyBjb21tYW5kOiBzdHJpbmc7IGFyZ3M6IGFueVtdIH07XG5cbnR5cGUgQ29tbWFuZEFyZ3MgPSB7XG5cdGNvbW1hbmRzOiBSdW5uYWJsZUNvbW1hbmRbXTtcbn07XG5cbi8qKiBSdW5zIHNldmVyYWwgY29tbWFuZHMgcGFzc2VkIHRvIGl0IGFzIGFuIGFyZ3VtZW50ICovXG5jbGFzcyBSdW5Db21tYW5kcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncnVuQ29tbWFuZHMnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3J1bkNvbW1hbmRzJywgXCJSdW4gQ29tbWFuZHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdydW5Db21tYW5kcy5kZXNjcmlwdGlvbicsIFwiUnVuIHNldmVyYWwgY29tbWFuZHNcIiksXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmRzJ10sXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3J1bkNvbW1hbmRzLmNvbW1hbmRzJywgXCJDb21tYW5kcyB0byBydW5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCRyZWY6ICd2c2NvZGU6Ly9zY2hlbWFzL2tleWJpbmRpbmdzIy9kZWZpbml0aW9ucy9jb21tYW5kTmFtZXMnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQkcmVmOiAndnNjb2RlOi8vc2NoZW1hcy9rZXliaW5kaW5ncyMvZGVmaW5pdGlvbnMvY29tbWFuZE5hbWVzJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0JHJlZjogJ3ZzY29kZTovL3NjaGVtYXMva2V5YmluZGluZ3MjL2RlZmluaXRpb25zL2NvbW1hbmRzU2NoZW1hcydcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vIGRldiBkZWNpc2lvbnM6XG5cdC8vIC0gdGhpcyBjb21tYW5kIHRha2VzIGEgc2luZ2xlIGFyZ3VtZW50LW9iamVjdCBiZWNhdXNlXG5cdC8vXHQtIGtleWJpbmRpbmcgZGVmaW5pdGlvbnMgZG9uJ3QgYWxsb3cgcnVubmluZyBjb21tYW5kcyB3aXRoIHNldmVyYWwgYXJndW1lbnRzXG5cdC8vICAtIGFuZCB3ZSB3YW50IHRvIGJlIGFibGUgdG8gdGFrZSBvbiBkaWZmZXJlbnQgb3RoZXIgYXJndW1lbnRzIGluIGZ1dHVyZSwgZS5nLiwgYHJ1bk1vZGUgOiAnc2VyaWFsJyB8ICdjb25jdXJyZW50J2Bcblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKSB7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGlmICghdGhpcy5faXNDb21tYW5kQXJncyhhcmdzKSkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ3J1bkNvbW1hbmRzLmludmFsaWRBcmdzJywgXCIncnVuQ29tbWFuZHMnIGhhcyByZWNlaXZlZCBhbiBhcmd1bWVudCB3aXRoIGluY29ycmVjdCB0eXBlLiBQbGVhc2UsIHJldmlldyB0aGUgYXJndW1lbnQgcGFzc2VkIHRvIHRoZSBjb21tYW5kLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGFyZ3MuY29tbWFuZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdydW5Db21tYW5kcy5ub0NvbW1hbmRzVG9SdW4nLCBcIidydW5Db21tYW5kcycgaGFzIG5vdCByZWNlaXZlZCBjb21tYW5kcyB0byBydW4uIERpZCB5b3UgZm9yZ2V0IHRvIHBhc3MgY29tbWFuZHMgaW4gdGhlICdydW5Db21tYW5kcycgYXJndW1lbnQ/XCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0bGV0IGkgPSAwO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKDsgaSA8IGFyZ3MuY29tbWFuZHMubGVuZ3RoOyArK2kpIHtcblxuXHRcdFx0XHRjb25zdCBjbWQgPSBhcmdzLmNvbW1hbmRzW2ldO1xuXG5cdFx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoYHJ1bkNvbW1hbmRzOiBleGVjdXRpbmcgJHtpfS10aCBjb21tYW5kOiAke3NhZmVTdHJpbmdpZnkoY21kKX1gKTtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLl9ydW5Db21tYW5kKGNvbW1hbmRTZXJ2aWNlLCBjbWQpO1xuXG5cdFx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoYHJ1bkNvbW1hbmRzOiBleGVjdXRlZCAke2l9LXRoIGNvbW1hbmRgKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoYHJ1bkNvbW1hbmRzOiBleGVjdXRpbmcgJHtpfS10aCBjb21tYW5kIHJlc3VsdGVkIGluIGFuIGVycm9yOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBzYWZlU3RyaW5naWZ5KGVycil9YCk7XG5cblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0NvbW1hbmRBcmdzKGFyZ3M6IHVua25vd24pOiBhcmdzIGlzIENvbW1hbmRBcmdzIHtcblx0XHRpZiAoIWFyZ3MgfHwgdHlwZW9mIGFyZ3MgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghKCdjb21tYW5kcycgaW4gYXJncykgfHwgIUFycmF5LmlzQXJyYXkoYXJncy5jb21tYW5kcykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjbWQgb2YgYXJncy5jb21tYW5kcykge1xuXHRcdFx0aWYgKHR5cGVvZiBjbWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBjbWQgPT09ICdvYmplY3QnICYmIHR5cGVvZiBjbWQuY29tbWFuZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuQ29tbWFuZChjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLCBjbWQ6IFJ1bm5hYmxlQ29tbWFuZCkge1xuXHRcdGxldCBjb21tYW5kSUQ6IHN0cmluZywgY29tbWFuZEFyZ3M7XG5cblx0XHRpZiAodHlwZW9mIGNtZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbW1hbmRJRCA9IGNtZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29tbWFuZElEID0gY21kLmNvbW1hbmQ7XG5cdFx0XHRjb21tYW5kQXJncyA9IGNtZC5hcmdzO1xuXHRcdH1cblxuXHRcdGlmIChjb21tYW5kQXJncyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElEKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY29tbWFuZEFyZ3MpKSB7XG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSUQsIC4uLmNvbW1hbmRBcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSUQsIGNvbW1hbmRBcmdzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFJ1bkNvbW1hbmRzKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksU0FBUztBQUNyQixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBU3JDLE1BQU0sb0JBQW9CLFFBQVE7QUFBQSxFQUVqQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsZUFBZSxjQUFjO0FBQUEsTUFDbEQsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLFFBQ1QsYUFBYSxJQUFJLFNBQVMsMkJBQTJCLHNCQUFzQjtBQUFBLFFBQzNFLE1BQU07QUFBQSxVQUNMO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixRQUFRO0FBQUEsY0FDUCxNQUFNO0FBQUEsY0FDTixVQUFVLENBQUMsVUFBVTtBQUFBLGNBQ3JCLFlBQVk7QUFBQSxnQkFDWCxVQUFVO0FBQUEsa0JBQ1QsTUFBTTtBQUFBLGtCQUNOLGFBQWEsSUFBSSxTQUFTLHdCQUF3QixpQkFBaUI7QUFBQSxrQkFDbkUsT0FBTztBQUFBLG9CQUNOLE9BQU87QUFBQSxzQkFDTjtBQUFBLHdCQUNDLE1BQU07QUFBQSxzQkFDUDtBQUFBLHNCQUNBO0FBQUEsd0JBQ0MsTUFBTTtBQUFBLHNCQUNQO0FBQUEsc0JBQ0E7QUFBQSx3QkFDQyxNQUFNO0FBQUEsd0JBQ04sVUFBVSxDQUFDLFNBQVM7QUFBQSx3QkFDcEIsWUFBWTtBQUFBLDBCQUNYLFNBQVM7QUFBQSw0QkFDUixTQUFTO0FBQUEsOEJBQ1I7QUFBQSxnQ0FDQyxNQUFNO0FBQUEsOEJBQ1A7QUFBQSw4QkFDQTtBQUFBLGdDQUNDLE1BQU07QUFBQSw4QkFDUDtBQUFBLDRCQUNEO0FBQUEsMEJBQ0Q7QUFBQSx3QkFDRDtBQUFBLHdCQUNBLE1BQU07QUFBQSxzQkFDUDtBQUFBLG9CQUNEO0FBQUEsa0JBQ0Q7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLElBQUksVUFBNEIsTUFBZTtBQUVwRCxVQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBRTdELFFBQUksQ0FBQyxLQUFLLGVBQWUsSUFBSSxHQUFHO0FBQy9CLDBCQUFvQixNQUFNLElBQUksU0FBUywyQkFBMkIsZ0hBQWdILENBQUM7QUFDbkw7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLFNBQVMsV0FBVyxHQUFHO0FBQy9CLDBCQUFvQixLQUFLLElBQUksU0FBUywrQkFBK0IsZ0hBQWdILENBQUM7QUFDdEw7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSxhQUFhLFNBQVMsSUFBSSxXQUFXO0FBRTNDLFFBQUksSUFBSTtBQUNSLFFBQUk7QUFDSCxhQUFPLElBQUksS0FBSyxTQUFTLFFBQVEsRUFBRSxHQUFHO0FBRXJDLGNBQU0sTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUUzQixtQkFBVyxNQUFNLDBCQUEwQixDQUFDLGdCQUFnQixjQUFjLEdBQUcsQ0FBQyxFQUFFO0FBRWhGLGNBQU0sS0FBSyxZQUFZLGdCQUFnQixHQUFHO0FBRTFDLG1CQUFXLE1BQU0seUJBQXlCLENBQUMsYUFBYTtBQUFBLE1BQ3pEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixpQkFBVyxNQUFNLDBCQUEwQixDQUFDLHFDQUFxQyxlQUFlLFFBQVEsSUFBSSxVQUFVLGNBQWMsR0FBRyxDQUFDLEVBQUU7QUFFMUksMEJBQW9CLE1BQU0sR0FBRztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxNQUFvQztBQUMxRCxRQUFJLENBQUMsUUFBUSxPQUFPLFNBQVMsVUFBVTtBQUN0QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksRUFBRSxjQUFjLFNBQVMsQ0FBQyxNQUFNLFFBQVEsS0FBSyxRQUFRLEdBQUc7QUFDM0QsYUFBTztBQUFBLElBQ1I7QUFDQSxlQUFXLE9BQU8sS0FBSyxVQUFVO0FBQ2hDLFVBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxPQUFPLFFBQVEsWUFBWSxPQUFPLElBQUksWUFBWSxVQUFVO0FBQy9EO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFlBQVksZ0JBQWlDLEtBQXNCO0FBQzFFLFFBQUksV0FBbUI7QUFFdkIsUUFBSSxPQUFPLFFBQVEsVUFBVTtBQUM1QixrQkFBWTtBQUFBLElBQ2IsT0FBTztBQUNOLGtCQUFZLElBQUk7QUFDaEIsb0JBQWMsSUFBSTtBQUFBLElBQ25CO0FBRUEsUUFBSSxnQkFBZ0IsUUFBVztBQUM5QixhQUFPLGVBQWUsZUFBZSxTQUFTO0FBQUEsSUFDL0MsT0FBTztBQUNOLFVBQUksTUFBTSxRQUFRLFdBQVcsR0FBRztBQUMvQixlQUFPLGVBQWUsZUFBZSxXQUFXLEdBQUcsV0FBVztBQUFBLE1BQy9ELE9BQU87QUFDTixlQUFPLGVBQWUsZUFBZSxXQUFXLFdBQVc7QUFBQSxNQUM1RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxnQkFBZ0IsV0FBVzsiLAogICJuYW1lcyI6IFtdCn0K
