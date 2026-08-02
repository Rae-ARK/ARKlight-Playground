import { equalsIgnoreCase } from "../../../../base/common/strings.js";
import { State } from "./debug.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { deepClone } from "../../../../base/common/objects.js";
import { Schemas } from "../../../../base/common/network.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
const _formatPIIRegexp = /{([^}]+)}/g;
function formatPII(value, excludePII, args) {
  return value.replace(_formatPIIRegexp, function(match, group) {
    if (excludePII && group.length > 0 && group[0] !== "_") {
      return match;
    }
    return args && args.hasOwnProperty(group) ? args[group] : match;
  });
}
function filterExceptionsFromTelemetry(data) {
  const output = {};
  for (const key of Object.keys(data)) {
    if (!key.startsWith("!")) {
      output[key] = data[key];
    }
  }
  return output;
}
function isSessionAttach(session) {
  return session.configuration.request === "attach" && !getExtensionHostDebugSession(session) && (!session.parentSession || isSessionAttach(session.parentSession));
}
function getExtensionHostDebugSession(session) {
  let type = session.configuration.type;
  if (!type) {
    return;
  }
  if (type === "vslsShare") {
    type = session.configuration.adapterProxy?.configuration?.type || type;
  }
  if (equalsIgnoreCase(type, "extensionhost") || equalsIgnoreCase(type, "pwa-extensionhost")) {
    return session;
  }
  return session.parentSession ? getExtensionHostDebugSession(session.parentSession) : void 0;
}
function isDebuggerMainContribution(dbg) {
  return dbg.type && (dbg.label || dbg.program || dbg.runtime);
}
function getExactExpressionStartAndEnd(lineContent, looseStart, looseEnd) {
  let matchingExpression = void 0;
  let startOffset = 0;
  const expression = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
  let result = null;
  while (result = expression.exec(lineContent)) {
    const start = result.index + 1;
    const end = start + result[0].length;
    if (start <= looseStart && end >= looseEnd) {
      matchingExpression = result[0];
      startOffset = start;
      break;
    }
  }
  if (matchingExpression) {
    const spreadMatch = matchingExpression.match(/^\.\.\.(.+)/);
    if (spreadMatch) {
      matchingExpression = spreadMatch[1];
      startOffset += 3;
    }
  }
  if (matchingExpression) {
    const subExpression = /(\w|\p{L})+/gu;
    let subExpressionResult = null;
    while (subExpressionResult = subExpression.exec(matchingExpression)) {
      const subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
      if (subEnd >= looseEnd) {
        break;
      }
    }
    if (subExpressionResult) {
      matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
    }
  }
  return matchingExpression ? { start: startOffset, end: startOffset + matchingExpression.length - 1 } : { start: 0, end: 0 };
}
async function getEvaluatableExpressionAtPosition(languageFeaturesService, model, position, token) {
  if (languageFeaturesService.evaluatableExpressionProvider.has(model)) {
    const supports = languageFeaturesService.evaluatableExpressionProvider.ordered(model);
    const results = coalesce(await Promise.all(supports.map(async (support) => {
      try {
        return await support.provideEvaluatableExpression(model, position, token ?? CancellationToken.None);
      } catch (err) {
        return void 0;
      }
    })));
    if (results.length > 0) {
      let matchingExpression = results[0].expression;
      const range = results[0].range;
      if (!matchingExpression) {
        const lineContent = model.getLineContent(position.lineNumber);
        matchingExpression = lineContent.substring(range.startColumn - 1, range.endColumn - 1);
      }
      return { range, matchingExpression };
    }
  } else {
    const lineContent = model.getLineContent(position.lineNumber);
    const { start, end } = getExactExpressionStartAndEnd(lineContent, position.column, position.column);
    const matchingExpression = lineContent.substring(start - 1, end);
    return {
      matchingExpression,
      range: new Range(position.lineNumber, start, position.lineNumber, start + matchingExpression.length)
    };
  }
  return null;
}
const _schemePattern = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;
function isUriString(s) {
  return !!(s && s.match(_schemePattern));
}
function stringToUri(source) {
  if (typeof source.path === "string") {
    if (typeof source.sourceReference === "number" && source.sourceReference > 0) {
    } else {
      if (isUriString(source.path)) {
        return uri.parse(source.path);
      } else {
        if (isAbsolute(source.path)) {
          return uri.file(source.path);
        } else {
        }
      }
    }
  }
  return source.path;
}
function uriToString(source) {
  if (typeof source.path === "object") {
    const u = uri.revive(source.path);
    if (u) {
      if (u.scheme === Schemas.file) {
        return u.fsPath;
      } else {
        return u.toString();
      }
    }
  }
  return source.path;
}
function convertToDAPaths(message, toUri) {
  const fixPath = toUri ? stringToUri : uriToString;
  const msg = deepClone(message);
  convertPaths(msg, (toDA, source) => {
    if (toDA && source) {
      source.path = fixPath(source);
    }
  });
  return msg;
}
function convertToVSCPaths(message, toUri) {
  const fixPath = toUri ? stringToUri : uriToString;
  const msg = deepClone(message);
  convertPaths(msg, (toDA, source) => {
    if (!toDA && source) {
      source.path = fixPath(source);
    }
  });
  return msg;
}
function convertPaths(msg, fixSourcePath) {
  switch (msg.type) {
    case "event": {
      const event = msg;
      switch (event.event) {
        case "output":
          fixSourcePath(false, event.body.source);
          break;
        case "loadedSource":
          fixSourcePath(false, event.body.source);
          break;
        case "breakpoint":
          fixSourcePath(false, event.body.breakpoint.source);
          break;
        default:
          break;
      }
      break;
    }
    case "request": {
      const request = msg;
      switch (request.command) {
        case "setBreakpoints":
          fixSourcePath(true, request.arguments.source);
          break;
        case "breakpointLocations":
          fixSourcePath(true, request.arguments.source);
          break;
        case "source":
          fixSourcePath(true, request.arguments.source);
          break;
        case "gotoTargets":
          fixSourcePath(true, request.arguments.source);
          break;
        case "launchVSCode":
          request.arguments.args.forEach((arg) => fixSourcePath(false, arg));
          break;
        default:
          break;
      }
      break;
    }
    case "response": {
      const response = msg;
      if (response.success && response.body) {
        switch (response.command) {
          case "stackTrace":
            response.body.stackFrames.forEach((frame) => fixSourcePath(false, frame.source));
            break;
          case "loadedSources":
            response.body.sources.forEach((source) => fixSourcePath(false, source));
            break;
          case "scopes":
            response.body.scopes.forEach((scope) => fixSourcePath(false, scope.source));
            break;
          case "setFunctionBreakpoints":
            response.body.breakpoints.forEach((bp) => fixSourcePath(false, bp.source));
            break;
          case "setBreakpoints":
            response.body.breakpoints.forEach((bp) => fixSourcePath(false, bp.source));
            break;
          case "disassemble":
            {
              const di = response;
              di.body?.instructions.forEach((di2) => fixSourcePath(false, di2.location));
            }
            break;
          case "locations":
            fixSourcePath(false, response.body?.source);
            break;
          default:
            break;
        }
      }
      break;
    }
  }
}
function getVisibleAndSorted(array) {
  return array.filter((config) => !config.presentation?.hidden).sort((first, second) => {
    if (!first.presentation) {
      if (!second.presentation) {
        return 0;
      }
      return 1;
    }
    if (!second.presentation) {
      return -1;
    }
    if (!first.presentation.group) {
      if (!second.presentation.group) {
        return compareOrders(first.presentation.order, second.presentation.order);
      }
      return 1;
    }
    if (!second.presentation.group) {
      return -1;
    }
    if (first.presentation.group !== second.presentation.group) {
      return first.presentation.group.localeCompare(second.presentation.group);
    }
    return compareOrders(first.presentation.order, second.presentation.order);
  });
}
function compareOrders(first, second) {
  if (typeof first !== "number") {
    if (typeof second !== "number") {
      return 0;
    }
    return 1;
  }
  if (typeof second !== "number") {
    return -1;
  }
  return first - second;
}
async function saveAllBeforeDebugStart(configurationService, editorService) {
  const saveBeforeStartConfig = configurationService.getValue("debug.saveBeforeStart", { overrideIdentifier: editorService.activeTextEditorLanguageId });
  if (saveBeforeStartConfig !== "none") {
    await editorService.saveAll();
    if (saveBeforeStartConfig === "allEditorsInActiveGroup") {
      const activeEditor = editorService.activeEditorPane;
      if (activeEditor && activeEditor.input.resource?.scheme === Schemas.untitled) {
        await editorService.save({ editor: activeEditor.input, groupId: activeEditor.group.id });
      }
    }
  }
  await configurationService.reloadConfiguration();
}
const sourcesEqual = (a, b) => !a || !b ? a === b : a.name === b.name && a.path === b.path && a.sourceReference === b.sourceReference;
function resolveChildSession(session, allSessions) {
  const childSessions = allSessions.filter((s) => s.parentSession === session);
  if (childSessions.length > 0) {
    const stoppedChildSession = childSessions.find((s) => s.state === State.Stopped);
    if (stoppedChildSession) {
      return stoppedChildSession;
    } else {
      return childSessions[0];
    }
  }
  return session;
}
function getPlatformSpecificConfig(config, os) {
  switch (os) {
    case OperatingSystem.Windows:
      return config.windows;
    case OperatingSystem.Macintosh:
      return config.osx;
    case OperatingSystem.Linux:
      return config.linux;
  }
}
function getEffectiveConfigForPlatform(config, os = OS) {
  const platformConfig = getPlatformSpecificConfig(config, os);
  if (!platformConfig) {
    return config;
  }
  return {
    ...config,
    ...platformConfig,
    presentation: platformConfig.presentation ? { ...config.presentation, ...platformConfig.presentation } : config.presentation
  };
}
function getEffectivePresentationForConfig(config, os = OS) {
  return getEffectiveConfigForPlatform(config, os).presentation;
}
export {
  convertToDAPaths,
  convertToVSCPaths,
  filterExceptionsFromTelemetry,
  formatPII,
  getEffectiveConfigForPlatform,
  getEffectivePresentationForConfig,
  getEvaluatableExpressionAtPosition,
  getExactExpressionStartAndEnd,
  getExtensionHostDebugSession,
  getVisibleAndSorted,
  isDebuggerMainContribution,
  isSessionAttach,
  isUriString,
  resolveChildSession,
  saveAllBeforeDebugStart,
  sourcesEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z1V0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBJRGVidWdTZXNzaW9uLCBJQ29uZmlnLCBJQ29uZmlnUHJlc2VudGF0aW9uLCBTdGF0ZSB9IGZyb20gJy4vZGVidWcuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgX2Zvcm1hdFBJSVJlZ2V4cCA9IC97KFtefV0rKX0vZztcblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFBJSSh2YWx1ZTogc3RyaW5nLCBleGNsdWRlUElJOiBib29sZWFuLCBhcmdzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoX2Zvcm1hdFBJSVJlZ2V4cCwgZnVuY3Rpb24gKG1hdGNoLCBncm91cCkge1xuXHRcdGlmIChleGNsdWRlUElJICYmIGdyb3VwLmxlbmd0aCA+IDAgJiYgZ3JvdXBbMF0gIT09ICdfJykge1xuXHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdH1cblxuXHRcdHJldHVybiBhcmdzICYmIGFyZ3MuaGFzT3duUHJvcGVydHkoZ3JvdXApID9cblx0XHRcdGFyZ3NbZ3JvdXBdIDpcblx0XHRcdG1hdGNoO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBGaWx0ZXJzIGV4Y2VwdGlvbnMgKGtleXMgbWFya2VkIHdpdGggXCIhXCIpIGZyb20gdGhlIGdpdmVuIG9iamVjdC4gVXNlZCB0b1xuICogZW5zdXJlIGV4Y2VwdGlvbiBkYXRhIGlzIG5vdCBzZW50IG9uIHdlYiByZW1vdGVzLCBzZWUgIzk3NjI4LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyRXhjZXB0aW9uc0Zyb21UZWxlbWV0cnk8VCBleHRlbmRzIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9PihkYXRhOiBUKTogUGFydGlhbDxUPiB7XG5cdGNvbnN0IG91dHB1dDogUGFydGlhbDxUPiA9IHt9O1xuXHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhkYXRhKSBhcyAoa2V5b2YgVCAmIHN0cmluZylbXSkge1xuXHRcdGlmICgha2V5LnN0YXJ0c1dpdGgoJyEnKSkge1xuXHRcdFx0b3V0cHV0W2tleV0gPSBkYXRhW2tleV07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uQXR0YWNoKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBib29sZWFuIHtcblx0cmV0dXJuIHNlc3Npb24uY29uZmlndXJhdGlvbi5yZXF1ZXN0ID09PSAnYXR0YWNoJyAmJiAhZ2V0RXh0ZW5zaW9uSG9zdERlYnVnU2Vzc2lvbihzZXNzaW9uKSAmJiAoIXNlc3Npb24ucGFyZW50U2Vzc2lvbiB8fCBpc1Nlc3Npb25BdHRhY2goc2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgc2Vzc2lvbiBvciBhbnkgcGFyZW50IHdoaWNoIGlzIGFuIGV4dGVuc2lvbiBob3N0IGRlYnVnIHNlc3Npb24uXG4gKiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGVyZSdzIG5vbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFeHRlbnNpb25Ib3N0RGVidWdTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJRGVidWdTZXNzaW9uIHwgdm9pZCB7XG5cdGxldCB0eXBlID0gc2Vzc2lvbi5jb25maWd1cmF0aW9uLnR5cGU7XG5cdGlmICghdHlwZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmICh0eXBlID09PSAndnNsc1NoYXJlJykge1xuXHRcdHR5cGUgPSAoc2Vzc2lvbi5jb25maWd1cmF0aW9uIGFzIHsgYWRhcHRlclByb3h5PzogeyBjb25maWd1cmF0aW9uPzogeyB0eXBlPzogc3RyaW5nIH0gfSB9KS5hZGFwdGVyUHJveHk/LmNvbmZpZ3VyYXRpb24/LnR5cGUgfHwgdHlwZTtcblx0fVxuXG5cdGlmIChlcXVhbHNJZ25vcmVDYXNlKHR5cGUsICdleHRlbnNpb25ob3N0JykgfHwgZXF1YWxzSWdub3JlQ2FzZSh0eXBlLCAncHdhLWV4dGVuc2lvbmhvc3QnKSkge1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cmV0dXJuIHNlc3Npb24ucGFyZW50U2Vzc2lvbiA/IGdldEV4dGVuc2lvbkhvc3REZWJ1Z1Nlc3Npb24oc2Vzc2lvbi5wYXJlbnRTZXNzaW9uKSA6IHVuZGVmaW5lZDtcbn1cblxuLy8gb25seSBhIGRlYnVnZ2VyIGNvbnRyaWJ1dGlvbnMgd2l0aCBhIGxhYmVsLCBwcm9ncmFtLCBvciBydW50aW1lIGF0dHJpYnV0ZSBpcyBjb25zaWRlcmVkIGEgXCJkZWZpbmluZ1wiIG9yIFwibWFpblwiIGRlYnVnZ2VyIGNvbnRyaWJ1dGlvblxuZXhwb3J0IGZ1bmN0aW9uIGlzRGVidWdnZXJNYWluQ29udHJpYnV0aW9uKGRiZzogSURlYnVnZ2VyQ29udHJpYnV0aW9uKSB7XG5cdHJldHVybiBkYmcudHlwZSAmJiAoZGJnLmxhYmVsIHx8IGRiZy5wcm9ncmFtIHx8IGRiZy5ydW50aW1lKTtcbn1cblxuLyoqXG4gKiBOb3RlLSB1c2VzIDEtaW5kZXhlZCBudW1iZXJzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZChsaW5lQ29udGVudDogc3RyaW5nLCBsb29zZVN0YXJ0OiBudW1iZXIsIGxvb3NlRW5kOiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuXHRsZXQgbWF0Y2hpbmdFeHByZXNzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBzdGFydE9mZnNldCA9IDA7XG5cblx0Ly8gU29tZSBleGFtcGxlIHN1cHBvcnRlZCBleHByZXNzaW9uczogbXlWYXIucHJvcCwgYS5iLmMuZCwgbXlWYXI/LnByb3AsIG15VmFyLT5wcm9wLCBNeUNsYXNzOjpTdGF0aWNQcm9wLCAqbXlWYXIsIC4uLmZvb1xuXHQvLyBNYXRjaCBhbnkgY2hhcmFjdGVyIGV4Y2VwdCBhIHNldCBvZiBjaGFyYWN0ZXJzIHdoaWNoIG9mdGVuIGJyZWFrIGludGVyZXN0aW5nIHN1Yi1leHByZXNzaW9uc1xuXHRjb25zdCBleHByZXNzaW9uOiBSZWdFeHAgPSAvKFteKClcXFtcXF17fTw+XFxzK1xcLS8lfiNeOz18LGAhXXxcXC0+KSsvZztcblx0bGV0IHJlc3VsdDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cblx0Ly8gRmlyc3QgZmluZCB0aGUgZnVsbCBleHByZXNzaW9uIHVuZGVyIHRoZSBjdXJzb3Jcblx0d2hpbGUgKHJlc3VsdCA9IGV4cHJlc3Npb24uZXhlYyhsaW5lQ29udGVudCkpIHtcblx0XHRjb25zdCBzdGFydCA9IHJlc3VsdC5pbmRleCArIDE7XG5cdFx0Y29uc3QgZW5kID0gc3RhcnQgKyByZXN1bHRbMF0ubGVuZ3RoO1xuXG5cdFx0aWYgKHN0YXJ0IDw9IGxvb3NlU3RhcnQgJiYgZW5kID49IGxvb3NlRW5kKSB7XG5cdFx0XHRtYXRjaGluZ0V4cHJlc3Npb24gPSByZXN1bHRbMF07XG5cdFx0XHRzdGFydE9mZnNldCA9IHN0YXJ0O1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSGFuZGxlIHNwcmVhZCBzeW50YXg6IGlmIHRoZSBleHByZXNzaW9uIHN0YXJ0cyB3aXRoICcuLi4nLCBleHRyYWN0IGp1c3QgdGhlIGlkZW50aWZpZXJcblx0aWYgKG1hdGNoaW5nRXhwcmVzc2lvbikge1xuXHRcdGNvbnN0IHNwcmVhZE1hdGNoID0gbWF0Y2hpbmdFeHByZXNzaW9uLm1hdGNoKC9eXFwuXFwuXFwuKC4rKS8pO1xuXHRcdGlmIChzcHJlYWRNYXRjaCkge1xuXHRcdFx0bWF0Y2hpbmdFeHByZXNzaW9uID0gc3ByZWFkTWF0Y2hbMV07XG5cdFx0XHRzdGFydE9mZnNldCArPSAzOyAvLyBTa2lwIHRoZSAnLi4uJyBwcmVmaXhcblx0XHR9XG5cdH1cblxuXHQvLyBJZiB0aGVyZSBhcmUgbm9uLXdvcmQgY2hhcmFjdGVycyBhZnRlciB0aGUgY3Vyc29yLCB3ZSB3YW50IHRvIHRydW5jYXRlIHRoZSBleHByZXNzaW9uIHRoZW4uXG5cdC8vIEZvciBleGFtcGxlIGluIGV4cHJlc3Npb24gJ2EuYi5jLmQnLCBpZiB0aGUgZm9jdXMgd2FzIHVuZGVyICdiJywgJ2EuYicgd291bGQgYmUgZXZhbHVhdGVkLlxuXHRpZiAobWF0Y2hpbmdFeHByZXNzaW9uKSB7XG5cdFx0Y29uc3Qgc3ViRXhwcmVzc2lvbjogUmVnRXhwID0gLyhcXHd8XFxwe0x9KSsvZ3U7XG5cdFx0bGV0IHN1YkV4cHJlc3Npb25SZXN1bHQ6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXHRcdHdoaWxlIChzdWJFeHByZXNzaW9uUmVzdWx0ID0gc3ViRXhwcmVzc2lvbi5leGVjKG1hdGNoaW5nRXhwcmVzc2lvbikpIHtcblx0XHRcdGNvbnN0IHN1YkVuZCA9IHN1YkV4cHJlc3Npb25SZXN1bHQuaW5kZXggKyAxICsgc3RhcnRPZmZzZXQgKyBzdWJFeHByZXNzaW9uUmVzdWx0WzBdLmxlbmd0aDtcblx0XHRcdGlmIChzdWJFbmQgPj0gbG9vc2VFbmQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN1YkV4cHJlc3Npb25SZXN1bHQpIHtcblx0XHRcdG1hdGNoaW5nRXhwcmVzc2lvbiA9IG1hdGNoaW5nRXhwcmVzc2lvbi5zdWJzdHJpbmcoMCwgc3ViRXhwcmVzc2lvbi5sYXN0SW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBtYXRjaGluZ0V4cHJlc3Npb24gP1xuXHRcdHsgc3RhcnQ6IHN0YXJ0T2Zmc2V0LCBlbmQ6IHN0YXJ0T2Zmc2V0ICsgbWF0Y2hpbmdFeHByZXNzaW9uLmxlbmd0aCAtIDEgfSA6XG5cdFx0eyBzdGFydDogMCwgZW5kOiAwIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRFdmFsdWF0YWJsZUV4cHJlc3Npb25BdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgcmFuZ2U6IElSYW5nZTsgbWF0Y2hpbmdFeHByZXNzaW9uOiBzdHJpbmcgfSB8IG51bGw+IHtcblx0aWYgKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRjb25zdCBzdXBwb3J0cyA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyLm9yZGVyZWQobW9kZWwpO1xuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IGNvYWxlc2NlKGF3YWl0IFByb21pc2UuYWxsKHN1cHBvcnRzLm1hcChhc3luYyBzdXBwb3J0ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBzdXBwb3J0LnByb3ZpZGVFdmFsdWF0YWJsZUV4cHJlc3Npb24obW9kZWwsIHBvc2l0aW9uLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgbWF0Y2hpbmdFeHByZXNzaW9uID0gcmVzdWx0c1swXS5leHByZXNzaW9uO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSByZXN1bHRzWzBdLnJhbmdlO1xuXG5cdFx0XHRpZiAoIW1hdGNoaW5nRXhwcmVzc2lvbikge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRtYXRjaGluZ0V4cHJlc3Npb24gPSBsaW5lQ29udGVudC5zdWJzdHJpbmcocmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgcmFuZ2UsIG1hdGNoaW5nRXhwcmVzc2lvbiB9O1xuXHRcdH1cblx0fSBlbHNlIHsgLy8gb2xkIG9uZS1zaXplLWZpdHMtYWxsIHN0cmF0ZWd5XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCB7IHN0YXJ0LCBlbmQgfSA9IGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKGxpbmVDb250ZW50LCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmNvbHVtbik7XG5cblx0XHQvLyB1c2UgcmVnZXggdG8gZXh0cmFjdCB0aGUgc3ViLWV4cHJlc3Npb24gIzk4MjFcblx0XHRjb25zdCBtYXRjaGluZ0V4cHJlc3Npb24gPSBsaW5lQ29udGVudC5zdWJzdHJpbmcoc3RhcnQgLSAxLCBlbmQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRtYXRjaGluZ0V4cHJlc3Npb24sXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0LCBwb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydCArIG1hdGNoaW5nRXhwcmVzc2lvbi5sZW5ndGgpXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG4vLyBSRkMgMjM5NiwgQXBwZW5kaXggQTogaHR0cHM6Ly93d3cuaWV0Zi5vcmcvcmZjL3JmYzIzOTYudHh0XG5jb25zdCBfc2NoZW1lUGF0dGVybiA9IC9eW2EtekEtWl1bYS16QS1aMC05XFwrXFwtXFwuXSs6LztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVXJpU3RyaW5nKHM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHQvLyBoZXVyaXN0aWNzOiBhIHZhbGlkIHVyaSBzdGFydHMgd2l0aCBhIHNjaGVtZSBhbmRcblx0Ly8gdGhlIHNjaGVtZSBoYXMgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHNvIHRoYXQgaXQgZG9lc24ndCBsb29rIGxpa2UgYSBkcml2ZSBsZXR0ZXIuXG5cdHJldHVybiAhIShzICYmIHMubWF0Y2goX3NjaGVtZVBhdHRlcm4pKTtcbn1cblxuZnVuY3Rpb24gc3RyaW5nVG9Vcmkoc291cmNlOiBQYXRoQ29udGFpbmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBzb3VyY2UucGF0aCA9PT0gJ3N0cmluZycpIHtcblx0XHRpZiAodHlwZW9mIHNvdXJjZS5zb3VyY2VSZWZlcmVuY2UgPT09ICdudW1iZXInICYmIHNvdXJjZS5zb3VyY2VSZWZlcmVuY2UgPiAwKSB7XG5cdFx0XHQvLyBpZiB0aGVyZSBpcyBhIHNvdXJjZSByZWZlcmVuY2UsIGRvbid0IHRvdWNoIHBhdGhcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGlzVXJpU3RyaW5nKHNvdXJjZS5wYXRoKSkge1xuXHRcdFx0XHRyZXR1cm4gPHN0cmluZz48dW5rbm93bj51cmkucGFyc2Uoc291cmNlLnBhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gYXNzdW1lIHBhdGhcblx0XHRcdFx0aWYgKGlzQWJzb2x1dGUoc291cmNlLnBhdGgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDxzdHJpbmc+PHVua25vd24+dXJpLmZpbGUoc291cmNlLnBhdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGxlYXZlIHJlbGF0aXZlIHBhdGggYXMgaXNcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gc291cmNlLnBhdGg7XG59XG5cbmZ1bmN0aW9uIHVyaVRvU3RyaW5nKHNvdXJjZTogUGF0aENvbnRhaW5lcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2Ygc291cmNlLnBhdGggPT09ICdvYmplY3QnKSB7XG5cdFx0Y29uc3QgdSA9IHVyaS5yZXZpdmUoc291cmNlLnBhdGgpO1xuXHRcdGlmICh1KSB7XG5cdFx0XHRpZiAodS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gdS5mc1BhdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdS50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gc291cmNlLnBhdGg7XG59XG5cbi8vIHBhdGggaG9va3MgaGVscGVyc1xuXG5pbnRlcmZhY2UgUGF0aENvbnRhaW5lciB7XG5cdHBhdGg/OiBzdHJpbmc7XG5cdHNvdXJjZVJlZmVyZW5jZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRUb0RBUGF0aHMobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UsIHRvVXJpOiBib29sZWFuKTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2Uge1xuXG5cdGNvbnN0IGZpeFBhdGggPSB0b1VyaSA/IHN0cmluZ1RvVXJpIDogdXJpVG9TdHJpbmc7XG5cblx0Ly8gc2luY2Ugd2UgbW9kaWZ5IFNvdXJjZS5wYXRocyBpbiB0aGUgbWVzc2FnZSBpbiBwbGFjZSwgd2UgbmVlZCB0byBtYWtlIGEgY29weSBvZiBpdCAoc2VlICM2MTEyOSlcblx0Y29uc3QgbXNnID0gZGVlcENsb25lKG1lc3NhZ2UpO1xuXG5cdGNvbnZlcnRQYXRocyhtc2csICh0b0RBOiBib29sZWFuLCBzb3VyY2U6IFBhdGhDb250YWluZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRpZiAodG9EQSAmJiBzb3VyY2UpIHtcblx0XHRcdHNvdXJjZS5wYXRoID0gZml4UGF0aChzb3VyY2UpO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBtc2c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0VG9WU0NQYXRocyhtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSwgdG9Vcmk6IGJvb2xlYW4pOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSB7XG5cblx0Y29uc3QgZml4UGF0aCA9IHRvVXJpID8gc3RyaW5nVG9VcmkgOiB1cmlUb1N0cmluZztcblxuXHQvLyBzaW5jZSB3ZSBtb2RpZnkgU291cmNlLnBhdGhzIGluIHRoZSBtZXNzYWdlIGluIHBsYWNlLCB3ZSBuZWVkIHRvIG1ha2UgYSBjb3B5IG9mIGl0IChzZWUgIzYxMTI5KVxuXHRjb25zdCBtc2cgPSBkZWVwQ2xvbmUobWVzc2FnZSk7XG5cblx0Y29udmVydFBhdGhzKG1zZywgKHRvREE6IGJvb2xlYW4sIHNvdXJjZTogUGF0aENvbnRhaW5lciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdGlmICghdG9EQSAmJiBzb3VyY2UpIHtcblx0XHRcdHNvdXJjZS5wYXRoID0gZml4UGF0aChzb3VyY2UpO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBtc2c7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQYXRocyhtc2c6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlLCBmaXhTb3VyY2VQYXRoOiAodG9EQTogYm9vbGVhbiwgc291cmNlOiBQYXRoQ29udGFpbmVyIHwgdW5kZWZpbmVkKSA9PiB2b2lkKTogdm9pZCB7XG5cblx0c3dpdGNoIChtc2cudHlwZSkge1xuXHRcdGNhc2UgJ2V2ZW50Jzoge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSA8RGVidWdQcm90b2NvbC5FdmVudD5tc2c7XG5cdFx0XHRzd2l0Y2ggKGV2ZW50LmV2ZW50KSB7XG5cdFx0XHRcdGNhc2UgJ291dHB1dCc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aChmYWxzZSwgKDxEZWJ1Z1Byb3RvY29sLk91dHB1dEV2ZW50PmV2ZW50KS5ib2R5LnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xvYWRlZFNvdXJjZSc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aChmYWxzZSwgKDxEZWJ1Z1Byb3RvY29sLkxvYWRlZFNvdXJjZUV2ZW50PmV2ZW50KS5ib2R5LnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2JyZWFrcG9pbnQnOlxuXHRcdFx0XHRcdGZpeFNvdXJjZVBhdGgoZmFsc2UsICg8RGVidWdQcm90b2NvbC5CcmVha3BvaW50RXZlbnQ+ZXZlbnQpLmJvZHkuYnJlYWtwb2ludC5zb3VyY2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3JlcXVlc3QnOiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gPERlYnVnUHJvdG9jb2wuUmVxdWVzdD5tc2c7XG5cdFx0XHRzd2l0Y2ggKHJlcXVlc3QuY29tbWFuZCkge1xuXHRcdFx0XHRjYXNlICdzZXRCcmVha3BvaW50cyc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aCh0cnVlLCAoPERlYnVnUHJvdG9jb2wuU2V0QnJlYWtwb2ludHNBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpLnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2JyZWFrcG9pbnRMb2NhdGlvbnMnOlxuXHRcdFx0XHRcdGZpeFNvdXJjZVBhdGgodHJ1ZSwgKDxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRMb2NhdGlvbnNBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpLnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3NvdXJjZSc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aCh0cnVlLCAoPERlYnVnUHJvdG9jb2wuU291cmNlQXJndW1lbnRzPnJlcXVlc3QuYXJndW1lbnRzKS5zb3VyY2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdnb3RvVGFyZ2V0cyc6XG5cdFx0XHRcdFx0Zml4U291cmNlUGF0aCh0cnVlLCAoPERlYnVnUHJvdG9jb2wuR290b1RhcmdldHNBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpLnNvdXJjZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xhdW5jaFZTQ29kZSc6XG5cdFx0XHRcdFx0cmVxdWVzdC5hcmd1bWVudHMuYXJncy5mb3JFYWNoKChhcmc6IFBhdGhDb250YWluZXIgfCB1bmRlZmluZWQpID0+IGZpeFNvdXJjZVBhdGgoZmFsc2UsIGFyZykpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ3Jlc3BvbnNlJzoge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSA8RGVidWdQcm90b2NvbC5SZXNwb25zZT5tc2c7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3VjY2VzcyAmJiByZXNwb25zZS5ib2R5KSB7XG5cdFx0XHRcdHN3aXRjaCAocmVzcG9uc2UuY29tbWFuZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3N0YWNrVHJhY2UnOlxuXHRcdFx0XHRcdFx0KDxEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VSZXNwb25zZT5yZXNwb25zZSkuYm9keS5zdGFja0ZyYW1lcy5mb3JFYWNoKGZyYW1lID0+IGZpeFNvdXJjZVBhdGgoZmFsc2UsIGZyYW1lLnNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbG9hZGVkU291cmNlcyc6XG5cdFx0XHRcdFx0XHQoPERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlc1Jlc3BvbnNlPnJlc3BvbnNlKS5ib2R5LnNvdXJjZXMuZm9yRWFjaChzb3VyY2UgPT4gZml4U291cmNlUGF0aChmYWxzZSwgc291cmNlKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzY29wZXMnOlxuXHRcdFx0XHRcdFx0KDxEZWJ1Z1Byb3RvY29sLlNjb3Blc1Jlc3BvbnNlPnJlc3BvbnNlKS5ib2R5LnNjb3Blcy5mb3JFYWNoKHNjb3BlID0+IGZpeFNvdXJjZVBhdGgoZmFsc2UsIHNjb3BlLnNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2V0RnVuY3Rpb25CcmVha3BvaW50cyc6XG5cdFx0XHRcdFx0XHQoPERlYnVnUHJvdG9jb2wuU2V0RnVuY3Rpb25CcmVha3BvaW50c1Jlc3BvbnNlPnJlc3BvbnNlKS5ib2R5LmJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gZml4U291cmNlUGF0aChmYWxzZSwgYnAuc291cmNlKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzZXRCcmVha3BvaW50cyc6XG5cdFx0XHRcdFx0XHQoPERlYnVnUHJvdG9jb2wuU2V0QnJlYWtwb2ludHNSZXNwb25zZT5yZXNwb25zZSkuYm9keS5icmVha3BvaW50cy5mb3JFYWNoKGJwID0+IGZpeFNvdXJjZVBhdGgoZmFsc2UsIGJwLnNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZGlzYXNzZW1ibGUnOlxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkaSA9IDxEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlUmVzcG9uc2U+cmVzcG9uc2U7XG5cdFx0XHRcdFx0XHRcdGRpLmJvZHk/Lmluc3RydWN0aW9ucy5mb3JFYWNoKGRpID0+IGZpeFNvdXJjZVBhdGgoZmFsc2UsIGRpLmxvY2F0aW9uKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdsb2NhdGlvbnMnOlxuXHRcdFx0XHRcdFx0Zml4U291cmNlUGF0aChmYWxzZSwgKDxEZWJ1Z1Byb3RvY29sLkxvY2F0aW9uc1Jlc3BvbnNlPnJlc3BvbnNlKS5ib2R5Py5zb3VyY2UpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRWaXNpYmxlQW5kU29ydGVkPFQgZXh0ZW5kcyB7IHByZXNlbnRhdGlvbj86IElDb25maWdQcmVzZW50YXRpb24gfT4oYXJyYXk6IFRbXSk6IFRbXSB7XG5cdHJldHVybiBhcnJheS5maWx0ZXIoY29uZmlnID0+ICFjb25maWcucHJlc2VudGF0aW9uPy5oaWRkZW4pLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IHtcblx0XHRpZiAoIWZpcnN0LnByZXNlbnRhdGlvbikge1xuXHRcdFx0aWYgKCFzZWNvbmQucHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGlmICghc2Vjb25kLnByZXNlbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoIWZpcnN0LnByZXNlbnRhdGlvbi5ncm91cCkge1xuXHRcdFx0aWYgKCFzZWNvbmQucHJlc2VudGF0aW9uLmdyb3VwKSB7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlT3JkZXJzKGZpcnN0LnByZXNlbnRhdGlvbi5vcmRlciwgc2Vjb25kLnByZXNlbnRhdGlvbi5vcmRlcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0aWYgKCFzZWNvbmQucHJlc2VudGF0aW9uLmdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmIChmaXJzdC5wcmVzZW50YXRpb24uZ3JvdXAgIT09IHNlY29uZC5wcmVzZW50YXRpb24uZ3JvdXApIHtcblx0XHRcdHJldHVybiBmaXJzdC5wcmVzZW50YXRpb24uZ3JvdXAubG9jYWxlQ29tcGFyZShzZWNvbmQucHJlc2VudGF0aW9uLmdyb3VwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcGFyZU9yZGVycyhmaXJzdC5wcmVzZW50YXRpb24ub3JkZXIsIHNlY29uZC5wcmVzZW50YXRpb24ub3JkZXIpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZU9yZGVycyhmaXJzdDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzZWNvbmQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdGlmICh0eXBlb2YgZmlyc3QgIT09ICdudW1iZXInKSB7XG5cdFx0aWYgKHR5cGVvZiBzZWNvbmQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gMTtcblx0fVxuXHRpZiAodHlwZW9mIHNlY29uZCAhPT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRyZXR1cm4gZmlyc3QgLSBzZWNvbmQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlQWxsQmVmb3JlRGVidWdTdGFydChjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzYXZlQmVmb3JlU3RhcnRDb25maWc6IHN0cmluZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdkZWJ1Zy5zYXZlQmVmb3JlU3RhcnQnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCB9KTtcblx0aWYgKHNhdmVCZWZvcmVTdGFydENvbmZpZyAhPT0gJ25vbmUnKSB7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlQWxsKCk7XG5cdFx0aWYgKHNhdmVCZWZvcmVTdGFydENvbmZpZyA9PT0gJ2FsbEVkaXRvcnNJbkFjdGl2ZUdyb3VwJykge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvciAmJiBhY3RpdmVFZGl0b3IuaW5wdXQucmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gc2F2ZSB0aGUgYWN0aXZlIGVkaXRvciBpbiBjYXNlIGl0IGlzIGluIHVudGl0bGVkIGZpbGUgaXQgd29udCBiZSBzYXZlZCBhcyBwYXJ0IG9mIHNhdmVBbGwgIzExMTg1MFxuXHRcdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLnNhdmUoeyBlZGl0b3I6IGFjdGl2ZUVkaXRvci5pbnB1dCwgZ3JvdXBJZDogYWN0aXZlRWRpdG9yLmdyb3VwLmlkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5yZWxvYWRDb25maWd1cmF0aW9uKCk7XG59XG5cbmV4cG9ydCBjb25zdCBzb3VyY2VzRXF1YWwgPSAoYTogRGVidWdQcm90b2NvbC5Tb3VyY2UgfCB1bmRlZmluZWQsIGI6IERlYnVnUHJvdG9jb2wuU291cmNlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiA9PlxuXHQhYSB8fCAhYiA/IGEgPT09IGIgOiBhLm5hbWUgPT09IGIubmFtZSAmJiBhLnBhdGggPT09IGIucGF0aCAmJiBhLnNvdXJjZVJlZmVyZW5jZSA9PT0gYi5zb3VyY2VSZWZlcmVuY2U7XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGJlc3QgY2hpbGQgc2Vzc2lvbiB0byBmb2N1cyB3aGVuIGEgcGFyZW50IHNlc3Npb24gaXMgc2VsZWN0ZWQuXG4gKiBBbHdheXMgcHJlZmVyIGNoaWxkIHNlc3Npb25zIG92ZXIgcGFyZW50IHdyYXBwZXIgc2Vzc2lvbnMgdG8gZW5zdXJlIGNvbnNvbGUgcmVzcG9uc2l2ZW5lc3MuXG4gKiBGaXhlcyBpc3N1ZSAjMTUyNDA3OiBVc2luZyBkZWJ1ZyBjb25zb2xlIHBpY2tlciB3aGVuIG5vdCBwYXVzZWQgbGVhdmVzIGNvbnNvbGUgdW5yZXNwb25zaXZlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoaWxkU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBhbGxTZXNzaW9uczogcmVhZG9ubHkgSURlYnVnU2Vzc2lvbltdKTogSURlYnVnU2Vzc2lvbiB7XG5cdC8vIEFsd2F5cyBmb2N1cyBjaGlsZCBzZXNzaW9uIGluc3RlYWQgb2YgcGFyZW50IHdyYXBwZXIgc2Vzc2lvbiAjMTUyNDA3XG5cdGNvbnN0IGNoaWxkU2Vzc2lvbnMgPSBhbGxTZXNzaW9ucy5maWx0ZXIocyA9PiBzLnBhcmVudFNlc3Npb24gPT09IHNlc3Npb24pO1xuXHRpZiAoY2hpbGRTZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0Ly8gUHJlZmVyIHN0b3BwZWQgY2hpbGQgc2Vzc2lvbiBpZiBhdmFpbGFibGUgIzExMjU5NVxuXHRcdGNvbnN0IHN0b3BwZWRDaGlsZFNlc3Npb24gPSBjaGlsZFNlc3Npb25zLmZpbmQocyA9PiBzLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkKTtcblx0XHRpZiAoc3RvcHBlZENoaWxkU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHN0b3BwZWRDaGlsZFNlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIElmIG5vIHN0b3BwZWQgY2hpbGQsIGZvY3VzIHRoZSBmaXJzdCBhdmFpbGFibGUgY2hpbGQgc2Vzc2lvblxuXHRcdFx0cmV0dXJuIGNoaWxkU2Vzc2lvbnNbMF07XG5cdFx0fVxuXHR9XG5cdC8vIFJldHVybiB0aGUgb3JpZ2luYWwgc2Vzc2lvbiBpZiBpdCBoYXMgbm8gY2hpbGRyZW5cblx0cmV0dXJuIHNlc3Npb247XG59XG5cbnR5cGUgSVBsYXRmb3JtU3BlY2lmaWNDb25maWcgPSBOb25OdWxsYWJsZTxJQ29uZmlnWyd3aW5kb3dzJ10+O1xuXG5mdW5jdGlvbiBnZXRQbGF0Zm9ybVNwZWNpZmljQ29uZmlnKGNvbmZpZzogSUNvbmZpZywgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IElQbGF0Zm9ybVNwZWNpZmljQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChvcykge1xuXHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRyZXR1cm4gY29uZmlnLndpbmRvd3M7XG5cdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0cmV0dXJuIGNvbmZpZy5vc3g7XG5cdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRyZXR1cm4gY29uZmlnLmxpbnV4O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZmZlY3RpdmVDb25maWdGb3JQbGF0Zm9ybShjb25maWc6IElDb25maWcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0gPSBPUyk6IElDb25maWcge1xuXHRjb25zdCBwbGF0Zm9ybUNvbmZpZyA9IGdldFBsYXRmb3JtU3BlY2lmaWNDb25maWcoY29uZmlnLCBvcyk7XG5cdGlmICghcGxhdGZvcm1Db25maWcpIHtcblx0XHRyZXR1cm4gY29uZmlnO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHQuLi5jb25maWcsXG5cdFx0Li4ucGxhdGZvcm1Db25maWcsXG5cdFx0cHJlc2VudGF0aW9uOiBwbGF0Zm9ybUNvbmZpZy5wcmVzZW50YXRpb24gPyB7IC4uLmNvbmZpZy5wcmVzZW50YXRpb24sIC4uLnBsYXRmb3JtQ29uZmlnLnByZXNlbnRhdGlvbiB9IDogY29uZmlnLnByZXNlbnRhdGlvbixcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVmZmVjdGl2ZVByZXNlbnRhdGlvbkZvckNvbmZpZyhjb25maWc6IElDb25maWcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0gPSBPUyk6IElDb25maWdQcmVzZW50YXRpb24gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0RWZmZWN0aXZlQ29uZmlnRm9yUGxhdGZvcm0oY29uZmlnLCBvcykucHJlc2VudGF0aW9uO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBNkUsYUFBYTtBQUMxRixTQUFTLE9BQU8sV0FBVztBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFLeEIsU0FBaUIsYUFBYTtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGlCQUFpQixVQUFVO0FBRXBDLE1BQU0sbUJBQW1CO0FBRWxCLFNBQVMsVUFBVSxPQUFlLFlBQXFCLE1BQXFEO0FBQ2xILFNBQU8sTUFBTSxRQUFRLGtCQUFrQixTQUFVLE9BQU8sT0FBTztBQUM5RCxRQUFJLGNBQWMsTUFBTSxTQUFTLEtBQUssTUFBTSxDQUFDLE1BQU0sS0FBSztBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sUUFBUSxLQUFLLGVBQWUsS0FBSyxJQUN2QyxLQUFLLEtBQUssSUFDVjtBQUFBLEVBQ0YsQ0FBQztBQUNGO0FBTU8sU0FBUyw4QkFBb0UsTUFBcUI7QUFDeEcsUUFBTSxTQUFxQixDQUFDO0FBQzVCLGFBQVcsT0FBTyxPQUFPLEtBQUssSUFBSSxHQUEyQjtBQUM1RCxRQUFJLENBQUMsSUFBSSxXQUFXLEdBQUcsR0FBRztBQUN6QixhQUFPLEdBQUcsSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFHTyxTQUFTLGdCQUFnQixTQUFpQztBQUNoRSxTQUFPLFFBQVEsY0FBYyxZQUFZLFlBQVksQ0FBQyw2QkFBNkIsT0FBTyxNQUFNLENBQUMsUUFBUSxpQkFBaUIsZ0JBQWdCLFFBQVEsYUFBYTtBQUNoSztBQU1PLFNBQVMsNkJBQTZCLFNBQThDO0FBQzFGLE1BQUksT0FBTyxRQUFRLGNBQWM7QUFDakMsTUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLEVBQ0Q7QUFFQSxNQUFJLFNBQVMsYUFBYTtBQUN6QixXQUFRLFFBQVEsY0FBMkUsY0FBYyxlQUFlLFFBQVE7QUFBQSxFQUNqSTtBQUVBLE1BQUksaUJBQWlCLE1BQU0sZUFBZSxLQUFLLGlCQUFpQixNQUFNLG1CQUFtQixHQUFHO0FBQzNGLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxRQUFRLGdCQUFnQiw2QkFBNkIsUUFBUSxhQUFhLElBQUk7QUFDdEY7QUFHTyxTQUFTLDJCQUEyQixLQUE0QjtBQUN0RSxTQUFPLElBQUksU0FBUyxJQUFJLFNBQVMsSUFBSSxXQUFXLElBQUk7QUFDckQ7QUFLTyxTQUFTLDhCQUE4QixhQUFxQixZQUFvQixVQUFrRDtBQUN4SSxNQUFJLHFCQUF5QztBQUM3QyxNQUFJLGNBQWM7QUFJbEIsUUFBTSxhQUFxQjtBQUMzQixNQUFJLFNBQWlDO0FBR3JDLFNBQU8sU0FBUyxXQUFXLEtBQUssV0FBVyxHQUFHO0FBQzdDLFVBQU0sUUFBUSxPQUFPLFFBQVE7QUFDN0IsVUFBTSxNQUFNLFFBQVEsT0FBTyxDQUFDLEVBQUU7QUFFOUIsUUFBSSxTQUFTLGNBQWMsT0FBTyxVQUFVO0FBQzNDLDJCQUFxQixPQUFPLENBQUM7QUFDN0Isb0JBQWM7QUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBR0EsTUFBSSxvQkFBb0I7QUFDdkIsVUFBTSxjQUFjLG1CQUFtQixNQUFNLGFBQWE7QUFDMUQsUUFBSSxhQUFhO0FBQ2hCLDJCQUFxQixZQUFZLENBQUM7QUFDbEMscUJBQWU7QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFJQSxNQUFJLG9CQUFvQjtBQUN2QixVQUFNLGdCQUF3QjtBQUM5QixRQUFJLHNCQUE4QztBQUNsRCxXQUFPLHNCQUFzQixjQUFjLEtBQUssa0JBQWtCLEdBQUc7QUFDcEUsWUFBTSxTQUFTLG9CQUFvQixRQUFRLElBQUksY0FBYyxvQkFBb0IsQ0FBQyxFQUFFO0FBQ3BGLFVBQUksVUFBVSxVQUFVO0FBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLHFCQUFxQjtBQUN4QiwyQkFBcUIsbUJBQW1CLFVBQVUsR0FBRyxjQUFjLFNBQVM7QUFBQSxJQUM3RTtBQUFBLEVBQ0Q7QUFFQSxTQUFPLHFCQUNOLEVBQUUsT0FBTyxhQUFhLEtBQUssY0FBYyxtQkFBbUIsU0FBUyxFQUFFLElBQ3ZFLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRTtBQUNyQjtBQUVBLGVBQXNCLG1DQUFtQyx5QkFBbUQsT0FBbUIsVUFBb0IsT0FBMEY7QUFDNU8sTUFBSSx3QkFBd0IsOEJBQThCLElBQUksS0FBSyxHQUFHO0FBQ3JFLFVBQU0sV0FBVyx3QkFBd0IsOEJBQThCLFFBQVEsS0FBSztBQUVwRixVQUFNLFVBQVUsU0FBUyxNQUFNLFFBQVEsSUFBSSxTQUFTLElBQUksT0FBTSxZQUFXO0FBQ3hFLFVBQUk7QUFDSCxlQUFPLE1BQU0sUUFBUSw2QkFBNkIsT0FBTyxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFBQSxNQUNuRyxTQUFTLEtBQUs7QUFDYixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQyxDQUFDLENBQUM7QUFFSCxRQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLFVBQUkscUJBQXFCLFFBQVEsQ0FBQyxFQUFFO0FBQ3BDLFlBQU0sUUFBUSxRQUFRLENBQUMsRUFBRTtBQUV6QixVQUFJLENBQUMsb0JBQW9CO0FBQ3hCLGNBQU0sY0FBYyxNQUFNLGVBQWUsU0FBUyxVQUFVO0FBQzVELDZCQUFxQixZQUFZLFVBQVUsTUFBTSxjQUFjLEdBQUcsTUFBTSxZQUFZLENBQUM7QUFBQSxNQUN0RjtBQUVBLGFBQU8sRUFBRSxPQUFPLG1CQUFtQjtBQUFBLElBQ3BDO0FBQUEsRUFDRCxPQUFPO0FBQ04sVUFBTSxjQUFjLE1BQU0sZUFBZSxTQUFTLFVBQVU7QUFDNUQsVUFBTSxFQUFFLE9BQU8sSUFBSSxJQUFJLDhCQUE4QixhQUFhLFNBQVMsUUFBUSxTQUFTLE1BQU07QUFHbEcsVUFBTSxxQkFBcUIsWUFBWSxVQUFVLFFBQVEsR0FBRyxHQUFHO0FBQy9ELFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxPQUFPLElBQUksTUFBTSxTQUFTLFlBQVksT0FBTyxTQUFTLFlBQVksUUFBUSxtQkFBbUIsTUFBTTtBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUdBLE1BQU0saUJBQWlCO0FBRWhCLFNBQVMsWUFBWSxHQUFnQztBQUczRCxTQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxjQUFjO0FBQ3RDO0FBRUEsU0FBUyxZQUFZLFFBQTJDO0FBQy9ELE1BQUksT0FBTyxPQUFPLFNBQVMsVUFBVTtBQUNwQyxRQUFJLE9BQU8sT0FBTyxvQkFBb0IsWUFBWSxPQUFPLGtCQUFrQixHQUFHO0FBQUEsSUFFOUUsT0FBTztBQUNOLFVBQUksWUFBWSxPQUFPLElBQUksR0FBRztBQUM3QixlQUF3QixJQUFJLE1BQU0sT0FBTyxJQUFJO0FBQUEsTUFDOUMsT0FBTztBQUVOLFlBQUksV0FBVyxPQUFPLElBQUksR0FBRztBQUM1QixpQkFBd0IsSUFBSSxLQUFLLE9BQU8sSUFBSTtBQUFBLFFBQzdDLE9BQU87QUFBQSxRQUVQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTyxPQUFPO0FBQ2Y7QUFFQSxTQUFTLFlBQVksUUFBMkM7QUFDL0QsTUFBSSxPQUFPLE9BQU8sU0FBUyxVQUFVO0FBQ3BDLFVBQU0sSUFBSSxJQUFJLE9BQU8sT0FBTyxJQUFJO0FBQ2hDLFFBQUksR0FBRztBQUNOLFVBQUksRUFBRSxXQUFXLFFBQVEsTUFBTTtBQUM5QixlQUFPLEVBQUU7QUFBQSxNQUNWLE9BQU87QUFDTixlQUFPLEVBQUUsU0FBUztBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPLE9BQU87QUFDZjtBQVNPLFNBQVMsaUJBQWlCLFNBQXdDLE9BQStDO0FBRXZILFFBQU0sVUFBVSxRQUFRLGNBQWM7QUFHdEMsUUFBTSxNQUFNLFVBQVUsT0FBTztBQUU3QixlQUFhLEtBQUssQ0FBQyxNQUFlLFdBQXNDO0FBQ3ZFLFFBQUksUUFBUSxRQUFRO0FBQ25CLGFBQU8sT0FBTyxRQUFRLE1BQU07QUFBQSxJQUM3QjtBQUFBLEVBQ0QsQ0FBQztBQUNELFNBQU87QUFDUjtBQUVPLFNBQVMsa0JBQWtCLFNBQXdDLE9BQStDO0FBRXhILFFBQU0sVUFBVSxRQUFRLGNBQWM7QUFHdEMsUUFBTSxNQUFNLFVBQVUsT0FBTztBQUU3QixlQUFhLEtBQUssQ0FBQyxNQUFlLFdBQXNDO0FBQ3ZFLFFBQUksQ0FBQyxRQUFRLFFBQVE7QUFDcEIsYUFBTyxPQUFPLFFBQVEsTUFBTTtBQUFBLElBQzdCO0FBQUEsRUFDRCxDQUFDO0FBQ0QsU0FBTztBQUNSO0FBRUEsU0FBUyxhQUFhLEtBQW9DLGVBQWlGO0FBRTFJLFVBQVEsSUFBSSxNQUFNO0FBQUEsSUFDakIsS0FBSyxTQUFTO0FBQ2IsWUFBTSxRQUE2QjtBQUNuQyxjQUFRLE1BQU0sT0FBTztBQUFBLFFBQ3BCLEtBQUs7QUFDSix3QkFBYyxPQUFtQyxNQUFPLEtBQUssTUFBTTtBQUNuRTtBQUFBLFFBQ0QsS0FBSztBQUNKLHdCQUFjLE9BQXlDLE1BQU8sS0FBSyxNQUFNO0FBQ3pFO0FBQUEsUUFDRCxLQUFLO0FBQ0osd0JBQWMsT0FBdUMsTUFBTyxLQUFLLFdBQVcsTUFBTTtBQUNsRjtBQUFBLFFBQ0Q7QUFDQztBQUFBLE1BQ0Y7QUFDQTtBQUFBLElBQ0Q7QUFBQSxJQUNBLEtBQUssV0FBVztBQUNmLFlBQU0sVUFBaUM7QUFDdkMsY0FBUSxRQUFRLFNBQVM7QUFBQSxRQUN4QixLQUFLO0FBQ0osd0JBQWMsTUFBOEMsUUFBUSxVQUFXLE1BQU07QUFDckY7QUFBQSxRQUNELEtBQUs7QUFDSix3QkFBYyxNQUFtRCxRQUFRLFVBQVcsTUFBTTtBQUMxRjtBQUFBLFFBQ0QsS0FBSztBQUNKLHdCQUFjLE1BQXNDLFFBQVEsVUFBVyxNQUFNO0FBQzdFO0FBQUEsUUFDRCxLQUFLO0FBQ0osd0JBQWMsTUFBMkMsUUFBUSxVQUFXLE1BQU07QUFDbEY7QUFBQSxRQUNELEtBQUs7QUFDSixrQkFBUSxVQUFVLEtBQUssUUFBUSxDQUFDLFFBQW1DLGNBQWMsT0FBTyxHQUFHLENBQUM7QUFDNUY7QUFBQSxRQUNEO0FBQ0M7QUFBQSxNQUNGO0FBQ0E7QUFBQSxJQUNEO0FBQUEsSUFDQSxLQUFLLFlBQVk7QUFDaEIsWUFBTSxXQUFtQztBQUN6QyxVQUFJLFNBQVMsV0FBVyxTQUFTLE1BQU07QUFDdEMsZ0JBQVEsU0FBUyxTQUFTO0FBQUEsVUFDekIsS0FBSztBQUNKLFlBQW1DLFNBQVUsS0FBSyxZQUFZLFFBQVEsV0FBUyxjQUFjLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFDakg7QUFBQSxVQUNELEtBQUs7QUFDSixZQUFzQyxTQUFVLEtBQUssUUFBUSxRQUFRLFlBQVUsY0FBYyxPQUFPLE1BQU0sQ0FBQztBQUMzRztBQUFBLFVBQ0QsS0FBSztBQUNKLFlBQStCLFNBQVUsS0FBSyxPQUFPLFFBQVEsV0FBUyxjQUFjLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFDeEc7QUFBQSxVQUNELEtBQUs7QUFDSixZQUErQyxTQUFVLEtBQUssWUFBWSxRQUFRLFFBQU0sY0FBYyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3ZIO0FBQUEsVUFDRCxLQUFLO0FBQ0osWUFBdUMsU0FBVSxLQUFLLFlBQVksUUFBUSxRQUFNLGNBQWMsT0FBTyxHQUFHLE1BQU0sQ0FBQztBQUMvRztBQUFBLFVBQ0QsS0FBSztBQUNKO0FBQ0Msb0JBQU0sS0FBd0M7QUFDOUMsaUJBQUcsTUFBTSxhQUFhLFFBQVEsQ0FBQUEsUUFBTSxjQUFjLE9BQU9BLElBQUcsUUFBUSxDQUFDO0FBQUEsWUFDdEU7QUFDQTtBQUFBLFVBQ0QsS0FBSztBQUNKLDBCQUFjLE9BQXlDLFNBQVUsTUFBTSxNQUFNO0FBQzdFO0FBQUEsVUFDRDtBQUNDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFDTyxTQUFTLG9CQUFzRSxPQUFpQjtBQUN0RyxTQUFPLE1BQU0sT0FBTyxZQUFVLENBQUMsT0FBTyxjQUFjLE1BQU0sRUFBRSxLQUFLLENBQUMsT0FBTyxXQUFXO0FBQ25GLFFBQUksQ0FBQyxNQUFNLGNBQWM7QUFDeEIsVUFBSSxDQUFDLE9BQU8sY0FBYztBQUN6QixlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLE9BQU8sY0FBYztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxNQUFNLGFBQWEsT0FBTztBQUM5QixVQUFJLENBQUMsT0FBTyxhQUFhLE9BQU87QUFDL0IsZUFBTyxjQUFjLE1BQU0sYUFBYSxPQUFPLE9BQU8sYUFBYSxLQUFLO0FBQUEsTUFDekU7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxPQUFPLGFBQWEsT0FBTztBQUMvQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksTUFBTSxhQUFhLFVBQVUsT0FBTyxhQUFhLE9BQU87QUFDM0QsYUFBTyxNQUFNLGFBQWEsTUFBTSxjQUFjLE9BQU8sYUFBYSxLQUFLO0FBQUEsSUFDeEU7QUFFQSxXQUFPLGNBQWMsTUFBTSxhQUFhLE9BQU8sT0FBTyxhQUFhLEtBQUs7QUFBQSxFQUN6RSxDQUFDO0FBQ0Y7QUFFQSxTQUFTLGNBQWMsT0FBMkIsUUFBb0M7QUFDckYsTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixRQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxRQUFRO0FBQ2hCO0FBRUEsZUFBc0Isd0JBQXdCLHNCQUE2QyxlQUE4QztBQUN4SSxRQUFNLHdCQUFnQyxxQkFBcUIsU0FBUyx5QkFBeUIsRUFBRSxvQkFBb0IsY0FBYywyQkFBMkIsQ0FBQztBQUM3SixNQUFJLDBCQUEwQixRQUFRO0FBQ3JDLFVBQU0sY0FBYyxRQUFRO0FBQzVCLFFBQUksMEJBQTBCLDJCQUEyQjtBQUN4RCxZQUFNLGVBQWUsY0FBYztBQUNuQyxVQUFJLGdCQUFnQixhQUFhLE1BQU0sVUFBVSxXQUFXLFFBQVEsVUFBVTtBQUU3RSxjQUFNLGNBQWMsS0FBSyxFQUFFLFFBQVEsYUFBYSxPQUFPLFNBQVMsYUFBYSxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQ3hGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLHFCQUFxQixvQkFBb0I7QUFDaEQ7QUFFTyxNQUFNLGVBQWUsQ0FBQyxHQUFxQyxNQUNqRSxDQUFDLEtBQUssQ0FBQyxJQUFJLE1BQU0sSUFBSSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxvQkFBb0IsRUFBRTtBQU9qRixTQUFTLG9CQUFvQixTQUF3QixhQUFzRDtBQUVqSCxRQUFNLGdCQUFnQixZQUFZLE9BQU8sT0FBSyxFQUFFLGtCQUFrQixPQUFPO0FBQ3pFLE1BQUksY0FBYyxTQUFTLEdBQUc7QUFFN0IsVUFBTSxzQkFBc0IsY0FBYyxLQUFLLE9BQUssRUFBRSxVQUFVLE1BQU0sT0FBTztBQUM3RSxRQUFJLHFCQUFxQjtBQUN4QixhQUFPO0FBQUEsSUFDUixPQUFPO0FBRU4sYUFBTyxjQUFjLENBQUM7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFJQSxTQUFTLDBCQUEwQixRQUFpQixJQUEwRDtBQUM3RyxVQUFRLElBQUk7QUFBQSxJQUNYLEtBQUssZ0JBQWdCO0FBQ3BCLGFBQU8sT0FBTztBQUFBLElBQ2YsS0FBSyxnQkFBZ0I7QUFDcEIsYUFBTyxPQUFPO0FBQUEsSUFDZixLQUFLLGdCQUFnQjtBQUNwQixhQUFPLE9BQU87QUFBQSxFQUNoQjtBQUNEO0FBRU8sU0FBUyw4QkFBOEIsUUFBaUIsS0FBc0IsSUFBYTtBQUNqRyxRQUFNLGlCQUFpQiwwQkFBMEIsUUFBUSxFQUFFO0FBQzNELE1BQUksQ0FBQyxnQkFBZ0I7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQUEsSUFDTixHQUFHO0FBQUEsSUFDSCxHQUFHO0FBQUEsSUFDSCxjQUFjLGVBQWUsZUFBZSxFQUFFLEdBQUcsT0FBTyxjQUFjLEdBQUcsZUFBZSxhQUFhLElBQUksT0FBTztBQUFBLEVBQ2pIO0FBQ0Q7QUFFTyxTQUFTLGtDQUFrQyxRQUFpQixLQUFzQixJQUFxQztBQUM3SCxTQUFPLDhCQUE4QixRQUFRLEVBQUUsRUFBRTtBQUNsRDsiLAogICJuYW1lcyI6IFsiZGkiXQp9Cg==
