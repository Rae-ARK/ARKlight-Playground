import { localize } from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import * as Strings from "../../../../base/common/strings.js";
import * as Assert from "../../../../base/common/assert.js";
import { join, normalize } from "../../../../base/common/path.js";
import * as Types from "../../../../base/common/types.js";
import * as UUID from "../../../../base/common/uuid.js";
import * as Platform from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { ValidationStatus, ValidationState, Parser } from "../../../../base/common/parsers.js";
import { asArray } from "../../../../base/common/arrays.js";
import { Schemas as NetworkSchemas } from "../../../../base/common/network.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { Emitter } from "../../../../base/common/event.js";
import { FileType } from "../../../../platform/files/common/files.js";
var FileLocationKind = /* @__PURE__ */ ((FileLocationKind2) => {
  FileLocationKind2[FileLocationKind2["Default"] = 0] = "Default";
  FileLocationKind2[FileLocationKind2["Relative"] = 1] = "Relative";
  FileLocationKind2[FileLocationKind2["Absolute"] = 2] = "Absolute";
  FileLocationKind2[FileLocationKind2["AutoDetect"] = 3] = "AutoDetect";
  FileLocationKind2[FileLocationKind2["Search"] = 4] = "Search";
  return FileLocationKind2;
})(FileLocationKind || {});
((FileLocationKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "absolute") {
      return 2 /* Absolute */;
    } else if (value === "relative") {
      return 1 /* Relative */;
    } else if (value === "autodetect") {
      return 3 /* AutoDetect */;
    } else if (value === "search") {
      return 4 /* Search */;
    } else {
      return void 0;
    }
  }
  FileLocationKind2.fromString = fromString;
})(FileLocationKind || (FileLocationKind = {}));
var ProblemLocationKind = /* @__PURE__ */ ((ProblemLocationKind2) => {
  ProblemLocationKind2[ProblemLocationKind2["File"] = 0] = "File";
  ProblemLocationKind2[ProblemLocationKind2["Location"] = 1] = "Location";
  return ProblemLocationKind2;
})(ProblemLocationKind || {});
((ProblemLocationKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "file") {
      return 0 /* File */;
    } else if (value === "location") {
      return 1 /* Location */;
    } else {
      return void 0;
    }
  }
  ProblemLocationKind2.fromString = fromString;
})(ProblemLocationKind || (ProblemLocationKind = {}));
var ApplyToKind = /* @__PURE__ */ ((ApplyToKind2) => {
  ApplyToKind2[ApplyToKind2["allDocuments"] = 0] = "allDocuments";
  ApplyToKind2[ApplyToKind2["openDocuments"] = 1] = "openDocuments";
  ApplyToKind2[ApplyToKind2["closedDocuments"] = 2] = "closedDocuments";
  return ApplyToKind2;
})(ApplyToKind || {});
((ApplyToKind2) => {
  function fromString(value) {
    value = value.toLowerCase();
    if (value === "alldocuments") {
      return 0 /* allDocuments */;
    } else if (value === "opendocuments") {
      return 1 /* openDocuments */;
    } else if (value === "closeddocuments") {
      return 2 /* closedDocuments */;
    } else {
      return void 0;
    }
  }
  ApplyToKind2.fromString = fromString;
})(ApplyToKind || (ApplyToKind = {}));
function isNamedProblemMatcher(value) {
  return value && Types.isString(value.name) ? true : false;
}
async function getResource(filename, matcher, fileService) {
  const kind = matcher.fileLocation;
  let fullPath;
  if (kind === 2 /* Absolute */) {
    fullPath = filename;
  } else if (kind === 1 /* Relative */ && matcher.filePrefix && Types.isString(matcher.filePrefix)) {
    fullPath = join(matcher.filePrefix, filename);
  } else if (kind === 3 /* AutoDetect */) {
    const matcherClone = Objects.deepClone(matcher);
    matcherClone.fileLocation = 1 /* Relative */;
    if (fileService) {
      const relative = await getResource(filename, matcherClone);
      let stat = void 0;
      try {
        stat = await fileService.stat(relative);
      } catch (ex) {
      }
      if (stat) {
        return relative;
      }
    }
    matcherClone.fileLocation = 2 /* Absolute */;
    return getResource(filename, matcherClone);
  } else if (kind === 4 /* Search */ && fileService) {
    const fsProvider = fileService.getProvider(NetworkSchemas.file);
    if (fsProvider) {
      const uri = await searchForFileLocation(filename, fsProvider, matcher.filePrefix);
      fullPath = uri?.path;
    }
    if (!fullPath) {
      const absoluteMatcher = Objects.deepClone(matcher);
      absoluteMatcher.fileLocation = 2 /* Absolute */;
      return getResource(filename, absoluteMatcher);
    }
  }
  if (fullPath === void 0) {
    throw new Error("FileLocationKind is not actionable. Does the matcher have a filePrefix? This should never happen.");
  }
  fullPath = normalize(fullPath);
  fullPath = fullPath.replace(/\\/g, "/");
  if (fullPath[0] !== "/") {
    fullPath = "/" + fullPath;
  }
  if (matcher.uriProvider !== void 0) {
    return matcher.uriProvider(fullPath);
  } else {
    return URI.file(fullPath);
  }
}
async function searchForFileLocation(filename, fsProvider, args) {
  const exclusions = new Set(asArray(args.exclude || []).map((x) => URI.file(x).path));
  async function search(dir) {
    if (exclusions.has(dir.path)) {
      return void 0;
    }
    const entries = await fsProvider.readdir(dir);
    const subdirs = [];
    for (const [name, fileType] of entries) {
      if (fileType === FileType.Directory) {
        subdirs.push(URI.joinPath(dir, name));
        continue;
      }
      if (fileType === FileType.File) {
        const fullUri = URI.joinPath(dir, name);
        if (fullUri.path.endsWith(filename)) {
          return fullUri;
        }
      }
    }
    for (const subdir of subdirs) {
      const result = await search(subdir);
      if (result) {
        return result;
      }
    }
    return void 0;
  }
  for (const dir of asArray(args.include || [])) {
    const hit = await search(URI.file(dir));
    if (hit) {
      return hit;
    }
  }
  return void 0;
}
function createLineMatcher(matcher, fileService, logService) {
  const pattern = matcher.pattern;
  if (Array.isArray(pattern)) {
    return new MultiLineMatcher(matcher, fileService, logService);
  } else {
    return new SingleLineMatcher(matcher, fileService, logService);
  }
}
const endOfLine = Platform.OS === Platform.OperatingSystem.Windows ? "\r\n" : "\n";
class AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    this.matcher = matcher;
    this.fileService = fileService;
    this.logService = logService;
  }
  handle(lines, start = 0) {
    return { match: null, continue: false };
  }
  next(line) {
    return null;
  }
  regexpExec(regexp, line) {
    const start = Date.now();
    const result = regexp.exec(line);
    const elapsed = Date.now() - start;
    if (elapsed > 5) {
      this.logService?.trace(`ProblemMatcher: slow regexp took ${elapsed}ms to execute`, regexp.source);
    }
    return result;
  }
  fillProblemData(data, pattern, matches) {
    if (data) {
      this.fillProperty(data, "file", pattern, matches, true);
      this.appendProperty(data, "message", pattern, matches, true);
      this.fillProperty(data, "code", pattern, matches, true);
      this.fillProperty(data, "severity", pattern, matches, true);
      this.fillProperty(data, "location", pattern, matches, true);
      this.fillProperty(data, "line", pattern, matches);
      this.fillProperty(data, "character", pattern, matches);
      this.fillProperty(data, "endLine", pattern, matches);
      this.fillProperty(data, "endCharacter", pattern, matches);
      return true;
    } else {
      return false;
    }
  }
  appendProperty(data, property, pattern, matches, trim = false) {
    const patternProperty = pattern[property];
    if (Types.isUndefined(data[property])) {
      this.fillProperty(data, property, pattern, matches, trim);
    } else if (!Types.isUndefined(patternProperty) && patternProperty < matches.length) {
      let value = matches[patternProperty];
      if (trim) {
        value = Strings.trim(value);
      }
      data[property] = data[property] + endOfLine + value;
    }
  }
  fillProperty(data, property, pattern, matches, trim = false) {
    const patternAtProperty = pattern[property];
    if (Types.isUndefined(data[property]) && !Types.isUndefined(patternAtProperty) && patternAtProperty < matches.length) {
      let value = matches[patternAtProperty];
      if (value !== void 0) {
        if (trim) {
          value = Strings.trim(value);
        }
        data[property] = value;
      }
    }
  }
  getMarkerMatch(data) {
    try {
      const location = this.getLocation(data);
      if (data.file && location && data.message) {
        const marker = {
          severity: this.getSeverity(data),
          startLineNumber: location.startLineNumber,
          startColumn: location.startCharacter,
          endLineNumber: location.endLineNumber,
          endColumn: location.endCharacter,
          message: data.message
        };
        if (data.code !== void 0) {
          marker.code = data.code;
        }
        if (this.matcher.source !== void 0) {
          marker.source = this.matcher.source;
        }
        return {
          description: this.matcher,
          resource: this.getResource(data.file),
          marker
        };
      }
    } catch (err) {
      console.error(`Failed to convert problem data into match: ${JSON.stringify(data)}`);
    }
    return void 0;
  }
  getResource(filename) {
    return getResource(filename, this.matcher, this.fileService);
  }
  getLocation(data) {
    if (data.kind === 0 /* File */) {
      return this.createLocation(0, 0, 0, 0);
    }
    if (data.location) {
      return this.parseLocationInfo(data.location);
    }
    if (!data.line) {
      return null;
    }
    const startLine = parseInt(data.line);
    const startColumn = data.character ? parseInt(data.character) : void 0;
    const endLine = data.endLine ? parseInt(data.endLine) : void 0;
    const endColumn = data.endCharacter ? parseInt(data.endCharacter) : void 0;
    return this.createLocation(startLine, startColumn, endLine, endColumn);
  }
  parseLocationInfo(value) {
    if (!value || !value.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
      return null;
    }
    const parts = value.split(",");
    const startLine = parseInt(parts[0]);
    const startColumn = parts.length > 1 ? parseInt(parts[1]) : void 0;
    if (parts.length > 3) {
      return this.createLocation(startLine, startColumn, parseInt(parts[2]), parseInt(parts[3]));
    } else {
      return this.createLocation(startLine, startColumn, void 0, void 0);
    }
  }
  createLocation(startLine, startColumn, endLine, endColumn) {
    if (startColumn !== void 0 && endColumn !== void 0) {
      return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: endLine || startLine, endCharacter: endColumn };
    }
    if (startColumn !== void 0) {
      return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: startLine, endCharacter: startColumn };
    }
    return { startLineNumber: startLine, startCharacter: 1, endLineNumber: startLine, endCharacter: 2 ** 31 - 1 };
  }
  getSeverity(data) {
    let result = null;
    if (data.severity) {
      const value = data.severity;
      if (value) {
        result = Severity.fromValue(value);
        if (result === Severity.Ignore) {
          if (value === "E") {
            result = Severity.Error;
          } else if (value === "W") {
            result = Severity.Warning;
          } else if (value === "I") {
            result = Severity.Info;
          } else if (Strings.equalsIgnoreCase(value, "hint")) {
            result = Severity.Info;
          } else if (Strings.equalsIgnoreCase(value, "note")) {
            result = Severity.Info;
          }
        }
      }
    }
    if (result === null || result === Severity.Ignore) {
      result = this.matcher.severity || Severity.Error;
    }
    return MarkerSeverity.fromSeverity(result);
  }
}
class SingleLineMatcher extends AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    super(matcher, fileService, logService);
    this.pattern = matcher.pattern;
  }
  get matchLength() {
    return 1;
  }
  handle(lines, start = 0) {
    Assert.ok(lines.length - start === 1);
    const data = /* @__PURE__ */ Object.create(null);
    if (this.pattern.kind !== void 0) {
      data.kind = this.pattern.kind;
    }
    const matches = this.regexpExec(this.pattern.regexp, lines[start]);
    if (matches) {
      this.fillProblemData(data, this.pattern, matches);
      if (data.kind === 1 /* Location */ && !data.location && !data.line && data.file) {
        data.kind = 0 /* File */;
      }
      const match = this.getMarkerMatch(data);
      if (match) {
        return { match, continue: false };
      }
    }
    return { match: null, continue: false };
  }
  next(line) {
    return null;
  }
}
class MultiLineMatcher extends AbstractLineMatcher {
  constructor(matcher, fileService, logService) {
    super(matcher, fileService, logService);
    this.patterns = matcher.pattern;
  }
  get matchLength() {
    return this.patterns.length;
  }
  handle(lines, start = 0) {
    Assert.ok(lines.length - start === this.patterns.length);
    this.data = /* @__PURE__ */ Object.create(null);
    let data = this.data;
    data.kind = this.patterns[0].kind;
    for (let i = 0; i < this.patterns.length; i++) {
      const pattern = this.patterns[i];
      const matches = this.regexpExec(pattern.regexp, lines[i + start]);
      if (!matches) {
        return { match: null, continue: false };
      } else {
        if (pattern.loop && i === this.patterns.length - 1) {
          data = Objects.deepClone(data);
        }
        this.fillProblemData(data, pattern, matches);
      }
    }
    const loop = !!this.patterns[this.patterns.length - 1].loop;
    if (!loop) {
      this.data = void 0;
    }
    const markerMatch = data ? this.getMarkerMatch(data) : null;
    return { match: markerMatch ? markerMatch : null, continue: loop };
  }
  next(line) {
    const pattern = this.patterns[this.patterns.length - 1];
    Assert.ok(pattern.loop === true && this.data !== null);
    const matches = this.regexpExec(pattern.regexp, line);
    if (!matches) {
      this.data = void 0;
      return null;
    }
    const data = Objects.deepClone(this.data);
    let problemMatch;
    if (this.fillProblemData(data, pattern, matches)) {
      problemMatch = this.getMarkerMatch(data);
    }
    return problemMatch ? problemMatch : null;
  }
}
var Config;
((Config2) => {
  let CheckedProblemPattern;
  ((CheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.regexp);
    }
    CheckedProblemPattern2.is = is;
  })(CheckedProblemPattern = Config2.CheckedProblemPattern || (Config2.CheckedProblemPattern = {}));
  let NamedProblemPattern;
  ((NamedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.name);
    }
    NamedProblemPattern2.is = is;
  })(NamedProblemPattern = Config2.NamedProblemPattern || (Config2.NamedProblemPattern = {}));
  let NamedCheckedProblemPattern;
  ((NamedCheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && NamedProblemPattern.is(candidate) && Types.isString(candidate.regexp);
    }
    NamedCheckedProblemPattern2.is = is;
  })(NamedCheckedProblemPattern = Config2.NamedCheckedProblemPattern || (Config2.NamedCheckedProblemPattern = {}));
  let MultiLineProblemPattern;
  ((MultiLineProblemPattern2) => {
    function is(value) {
      return Array.isArray(value);
    }
    MultiLineProblemPattern2.is = is;
  })(MultiLineProblemPattern = Config2.MultiLineProblemPattern || (Config2.MultiLineProblemPattern = {}));
  let MultiLineCheckedProblemPattern;
  ((MultiLineCheckedProblemPattern2) => {
    function is(value) {
      if (!MultiLineProblemPattern.is(value)) {
        return false;
      }
      for (const element of value) {
        if (!Config2.CheckedProblemPattern.is(element)) {
          return false;
        }
      }
      return true;
    }
    MultiLineCheckedProblemPattern2.is = is;
  })(MultiLineCheckedProblemPattern = Config2.MultiLineCheckedProblemPattern || (Config2.MultiLineCheckedProblemPattern = {}));
  let NamedMultiLineCheckedProblemPattern;
  ((NamedMultiLineCheckedProblemPattern2) => {
    function is(value) {
      const candidate = value;
      return candidate && Types.isString(candidate.name) && Array.isArray(candidate.patterns) && MultiLineCheckedProblemPattern.is(candidate.patterns);
    }
    NamedMultiLineCheckedProblemPattern2.is = is;
  })(NamedMultiLineCheckedProblemPattern = Config2.NamedMultiLineCheckedProblemPattern || (Config2.NamedMultiLineCheckedProblemPattern = {}));
  function isNamedProblemMatcher2(value) {
    return Types.isString(value.name);
  }
  Config2.isNamedProblemMatcher = isNamedProblemMatcher2;
})(Config || (Config = {}));
class ProblemPatternParser extends Parser {
  constructor(logger) {
    super(logger);
  }
  parse(value) {
    if (Config.NamedMultiLineCheckedProblemPattern.is(value)) {
      return this.createNamedMultiLineProblemPattern(value);
    } else if (Config.MultiLineCheckedProblemPattern.is(value)) {
      return this.createMultiLineProblemPattern(value);
    } else if (Config.NamedCheckedProblemPattern.is(value)) {
      const result = this.createSingleProblemPattern(value);
      result.name = value.name;
      return result;
    } else if (Config.CheckedProblemPattern.is(value)) {
      return this.createSingleProblemPattern(value);
    } else {
      this.error(localize("ProblemPatternParser.problemPattern.missingRegExp", "The problem pattern is missing a regular expression."));
      return null;
    }
  }
  createSingleProblemPattern(value) {
    const result = this.doCreateSingleProblemPattern(value, true);
    if (result === void 0) {
      return null;
    } else if (result.kind === void 0) {
      result.kind = 1 /* Location */;
    }
    return this.validateProblemPattern([result]) ? result : null;
  }
  createNamedMultiLineProblemPattern(value) {
    const validPatterns = this.createMultiLineProblemPattern(value.patterns);
    if (!validPatterns) {
      return null;
    }
    const result = {
      name: value.name,
      label: value.label ? value.label : value.name,
      patterns: validPatterns
    };
    return result;
  }
  createMultiLineProblemPattern(values) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
      const pattern = this.doCreateSingleProblemPattern(values[i], false);
      if (pattern === void 0) {
        return null;
      }
      if (i < values.length - 1) {
        if (!Types.isUndefined(pattern.loop) && pattern.loop) {
          pattern.loop = false;
          this.error(localize("ProblemPatternParser.loopProperty.notLast", "The loop property is only supported on the last line matcher."));
        }
      }
      result.push(pattern);
    }
    if (!result || result.length === 0) {
      this.error(localize("ProblemPatternParser.problemPattern.emptyPattern", "The problem pattern is invalid. It must contain at least one pattern."));
      return null;
    }
    if (result[0].kind === void 0) {
      result[0].kind = 1 /* Location */;
    }
    return this.validateProblemPattern(result) ? result : null;
  }
  doCreateSingleProblemPattern(value, setDefaults) {
    const regexp = this.createRegularExpression(value.regexp);
    if (regexp === void 0) {
      return void 0;
    }
    let result = { regexp };
    if (value.kind) {
      result.kind = ProblemLocationKind.fromString(value.kind);
    }
    function copyProperty(result2, source, resultKey, sourceKey) {
      const value2 = source[sourceKey];
      if (typeof value2 === "number") {
        result2[resultKey] = value2;
      }
    }
    copyProperty(result, value, "file", "file");
    copyProperty(result, value, "location", "location");
    copyProperty(result, value, "line", "line");
    copyProperty(result, value, "character", "column");
    copyProperty(result, value, "endLine", "endLine");
    copyProperty(result, value, "endCharacter", "endColumn");
    copyProperty(result, value, "severity", "severity");
    copyProperty(result, value, "code", "code");
    copyProperty(result, value, "message", "message");
    if (value.loop === true || value.loop === false) {
      result.loop = value.loop;
    }
    if (setDefaults) {
      if (result.location || result.kind === 0 /* File */) {
        const defaultValue = {
          file: 1,
          message: 0
        };
        result = Objects.mixin(result, defaultValue, false);
      } else {
        const defaultValue = {
          file: 1,
          line: 2,
          character: 3,
          message: 0
        };
        result = Objects.mixin(result, defaultValue, false);
      }
    }
    return result;
  }
  validateProblemPattern(values) {
    if (!values || values.length === 0) {
      this.error(localize("ProblemPatternParser.problemPattern.emptyPattern", "The problem pattern is invalid. It must contain at least one pattern."));
      return false;
    }
    let file = false, message = false, location = false, line = false;
    const locationKind = values[0].kind === void 0 ? 1 /* Location */ : values[0].kind;
    values.forEach((pattern, i) => {
      if (i !== 0 && pattern.kind) {
        this.error(localize("ProblemPatternParser.problemPattern.kindProperty.notFirst", "The problem pattern is invalid. The kind property must be provided only in the first element"));
      }
      file = file || !Types.isUndefined(pattern.file);
      message = message || !Types.isUndefined(pattern.message);
      location = location || !Types.isUndefined(pattern.location);
      line = line || !Types.isUndefined(pattern.line);
    });
    if (!(file && message)) {
      this.error(localize("ProblemPatternParser.problemPattern.missingProperty", "The problem pattern is invalid. It must have at least have a file and a message."));
      return false;
    }
    if (locationKind === 1 /* Location */ && !(location || line)) {
      this.error(localize("ProblemPatternParser.problemPattern.missingLocation", 'The problem pattern is invalid. It must either have kind: "file" or have a line or location match group.'));
      return false;
    }
    return true;
  }
  createRegularExpression(value) {
    let result;
    try {
      result = new RegExp(value);
    } catch (err) {
      this.error(localize("ProblemPatternParser.invalidRegexp", "Error: The string {0} is not a valid regular expression.\n", value));
    }
    return result;
  }
}
class ExtensionRegistryReporter {
  constructor(_collector, _validationStatus = new ValidationStatus()) {
    this._collector = _collector;
    this._validationStatus = _validationStatus;
  }
  info(message) {
    this._validationStatus.state = ValidationState.Info;
    this._collector.info(message);
  }
  warn(message) {
    this._validationStatus.state = ValidationState.Warning;
    this._collector.warn(message);
  }
  error(message) {
    this._validationStatus.state = ValidationState.Error;
    this._collector.error(message);
  }
  fatal(message) {
    this._validationStatus.state = ValidationState.Fatal;
    this._collector.error(message);
  }
  get status() {
    return this._validationStatus;
  }
}
var Schemas;
((Schemas2) => {
  Schemas2.ProblemPattern = {
    default: {
      regexp: "^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$",
      file: 1,
      location: 2,
      message: 3
    },
    type: "object",
    additionalProperties: false,
    properties: {
      regexp: {
        type: "string",
        description: localize("ProblemPatternSchema.regexp", "The regular expression to find an error, warning or info in the output.")
      },
      kind: {
        type: "string",
        description: localize("ProblemPatternSchema.kind", "whether the pattern matches a location (file and line) or only a file.")
      },
      file: {
        type: "integer",
        description: localize("ProblemPatternSchema.file", "The match group index of the filename. If omitted 1 is used.")
      },
      location: {
        type: "integer",
        description: localize("ProblemPatternSchema.location", "The match group index of the problem's location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.")
      },
      line: {
        type: "integer",
        description: localize("ProblemPatternSchema.line", "The match group index of the problem's line. Defaults to 2")
      },
      column: {
        type: "integer",
        description: localize("ProblemPatternSchema.column", "The match group index of the problem's line character. Defaults to 3")
      },
      endLine: {
        type: "integer",
        description: localize("ProblemPatternSchema.endLine", "The match group index of the problem's end line. Defaults to undefined")
      },
      endColumn: {
        type: "integer",
        description: localize("ProblemPatternSchema.endColumn", "The match group index of the problem's end line character. Defaults to undefined")
      },
      severity: {
        type: "integer",
        description: localize("ProblemPatternSchema.severity", "The match group index of the problem's severity. Defaults to undefined")
      },
      code: {
        type: "integer",
        description: localize("ProblemPatternSchema.code", "The match group index of the problem's code. Defaults to undefined")
      },
      message: {
        type: "integer",
        description: localize("ProblemPatternSchema.message", "The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.")
      },
      loop: {
        type: "boolean",
        description: localize("ProblemPatternSchema.loop", "In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.")
      }
    }
  };
  Schemas2.NamedProblemPattern = Objects.deepClone(Schemas2.ProblemPattern);
  Schemas2.NamedProblemPattern.properties = Objects.deepClone(Schemas2.NamedProblemPattern.properties) || {};
  Schemas2.NamedProblemPattern.properties["name"] = {
    type: "string",
    description: localize("NamedProblemPatternSchema.name", "The name of the problem pattern.")
  };
  Schemas2.MultiLineProblemPattern = {
    type: "array",
    items: Schemas2.ProblemPattern
  };
  Schemas2.NamedMultiLineProblemPattern = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
        description: localize("NamedMultiLineProblemPatternSchema.name", "The name of the problem multi line problem pattern.")
      },
      patterns: {
        type: "array",
        description: localize("NamedMultiLineProblemPatternSchema.patterns", "The actual patterns."),
        items: Schemas2.ProblemPattern
      }
    }
  };
  Schemas2.WatchingPattern = {
    type: "object",
    additionalProperties: false,
    properties: {
      regexp: {
        type: "string",
        description: localize("WatchingPatternSchema.regexp", "The regular expression to detect the begin or end of a background task.")
      },
      file: {
        type: "integer",
        description: localize("WatchingPatternSchema.file", "The match group index of the filename. Can be omitted.")
      }
    }
  };
  Schemas2.PatternType = {
    anyOf: [
      {
        type: "string",
        description: localize("PatternTypeSchema.name", "The name of a contributed or predefined pattern")
      },
      Schemas2.ProblemPattern,
      Schemas2.MultiLineProblemPattern
    ],
    description: localize("PatternTypeSchema.description", "A problem pattern or the name of a contributed or predefined problem pattern. Can be omitted if base is specified.")
  };
  Schemas2.ProblemMatcher = {
    type: "object",
    additionalProperties: false,
    properties: {
      base: {
        type: "string",
        description: localize("ProblemMatcherSchema.base", "The name of a base problem matcher to use.")
      },
      owner: {
        type: "string",
        description: localize("ProblemMatcherSchema.owner", "The owner of the problem inside Code. Can be omitted if base is specified. Defaults to 'external' if omitted and base is not specified.")
      },
      source: {
        type: "string",
        description: localize("ProblemMatcherSchema.source", "A human-readable string describing the source of this diagnostic, e.g. 'typescript' or 'super lint'.")
      },
      severity: {
        type: "string",
        enum: ["error", "warning", "info"],
        description: localize("ProblemMatcherSchema.severity", "The default severity for captures problems. Is used if the pattern doesn't define a match group for severity.")
      },
      applyTo: {
        type: "string",
        enum: ["allDocuments", "openDocuments", "closedDocuments"],
        description: localize("ProblemMatcherSchema.applyTo", "Controls if a problem reported on a text document is applied only to open, closed or all documents.")
      },
      pattern: Schemas2.PatternType,
      fileLocation: {
        oneOf: [
          {
            type: "string",
            enum: ["absolute", "relative", "autoDetect", "search"]
          },
          {
            type: "array",
            prefixItems: [
              {
                type: "string",
                enum: ["absolute", "relative", "autoDetect", "search"]
              }
            ],
            minItems: 1,
            maxItems: 1,
            additionalItems: false
          },
          {
            type: "array",
            prefixItems: [
              { type: "string", enum: ["relative", "autoDetect"] },
              { type: "string" }
            ],
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
            examples: [
              ["relative", "${workspaceFolder}"],
              ["autoDetect", "${workspaceFolder}"]
            ]
          },
          {
            type: "array",
            prefixItems: [
              { type: "string", enum: ["search"] },
              {
                type: "object",
                properties: {
                  "include": {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } }
                    ]
                  },
                  "exclude": {
                    oneOf: [
                      { type: "string" },
                      { type: "array", items: { type: "string" } }
                    ]
                  }
                },
                required: ["include"]
              }
            ],
            minItems: 2,
            maxItems: 2,
            additionalItems: false,
            examples: [
              ["search", { "include": ["${workspaceFolder}"] }],
              ["search", { "include": ["${workspaceFolder}"], "exclude": [] }]
            ]
          }
        ],
        description: localize("ProblemMatcherSchema.fileLocation", "Defines how file names reported in a problem pattern should be interpreted. A relative fileLocation may be an array, where the second element of the array is the path of the relative file location. The search fileLocation mode, performs a deep (and, possibly, heavy) file system search within the directories specified by the include/exclude properties of the second element (or the current workspace directory if not specified).")
      },
      background: {
        type: "object",
        additionalProperties: false,
        description: localize("ProblemMatcherSchema.background", "Patterns to track the begin and end of a matcher active on a background task."),
        properties: {
          activeOnStart: {
            type: "boolean",
            description: localize("ProblemMatcherSchema.background.activeOnStart", "If set to true the background monitor starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.")
          },
          beginsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.background.beginsPattern", "If matched in the output the start of a background task is signaled.")
          },
          endsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.background.endsPattern", "If matched in the output the end of a background task is signaled.")
          }
        }
      },
      watching: {
        type: "object",
        additionalProperties: false,
        deprecationMessage: localize("ProblemMatcherSchema.watching.deprecated", "The watching property is deprecated. Use background instead."),
        description: localize("ProblemMatcherSchema.watching", "Patterns to track the begin and end of a watching matcher."),
        properties: {
          activeOnStart: {
            type: "boolean",
            description: localize("ProblemMatcherSchema.watching.activeOnStart", "If set to true the watcher starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.")
          },
          beginsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.watching.beginsPattern", "If matched in the output the start of a watching task is signaled.")
          },
          endsPattern: {
            oneOf: [
              {
                type: "string"
              },
              Schemas2.WatchingPattern
            ],
            description: localize("ProblemMatcherSchema.watching.endsPattern", "If matched in the output the end of a watching task is signaled.")
          }
        }
      }
    }
  };
  Schemas2.LegacyProblemMatcher = Objects.deepClone(Schemas2.ProblemMatcher);
  Schemas2.LegacyProblemMatcher.properties = Objects.deepClone(Schemas2.LegacyProblemMatcher.properties) || {};
  Schemas2.LegacyProblemMatcher.properties["watchedTaskBeginsRegExp"] = {
    type: "string",
    deprecationMessage: localize("LegacyProblemMatcherSchema.watchedBegin.deprecated", "This property is deprecated. Use the watching property instead."),
    description: localize("LegacyProblemMatcherSchema.watchedBegin", "A regular expression signaling that a watched tasks begins executing triggered through file watching.")
  };
  Schemas2.LegacyProblemMatcher.properties["watchedTaskEndsRegExp"] = {
    type: "string",
    deprecationMessage: localize("LegacyProblemMatcherSchema.watchedEnd.deprecated", "This property is deprecated. Use the watching property instead."),
    description: localize("LegacyProblemMatcherSchema.watchedEnd", "A regular expression signaling that a watched tasks ends executing.")
  };
  Schemas2.NamedProblemMatcher = Objects.deepClone(Schemas2.ProblemMatcher);
  Schemas2.NamedProblemMatcher.properties = Objects.deepClone(Schemas2.NamedProblemMatcher.properties) || {};
  Schemas2.NamedProblemMatcher.properties.name = {
    type: "string",
    description: localize("NamedProblemMatcherSchema.name", "The name of the problem matcher used to refer to it.")
  };
  Schemas2.NamedProblemMatcher.properties.label = {
    type: "string",
    description: localize("NamedProblemMatcherSchema.label", "A human readable label of the problem matcher.")
  };
})(Schemas || (Schemas = {}));
const problemPatternExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "problemPatterns",
  jsonSchema: {
    description: localize("ProblemPatternExtPoint", "Contributes problem patterns"),
    type: "array",
    items: {
      anyOf: [
        Schemas.NamedProblemPattern,
        Schemas.NamedMultiLineProblemPattern
      ]
    }
  }
});
class ProblemPatternRegistryImpl {
  constructor() {
    this.patterns = /* @__PURE__ */ Object.create(null);
    this.fillDefaults();
    this.readyPromise = new Promise((resolve, reject) => {
      problemPatternExtPoint.setHandler((extensions, delta) => {
        try {
          delta.removed.forEach((extension) => {
            const problemPatterns = extension.value;
            for (const pattern of problemPatterns) {
              if (this.patterns[pattern.name]) {
                delete this.patterns[pattern.name];
              }
            }
          });
          delta.added.forEach((extension) => {
            const problemPatterns = extension.value;
            const parser = new ProblemPatternParser(new ExtensionRegistryReporter(extension.collector));
            for (const pattern of problemPatterns) {
              if (Config.NamedMultiLineCheckedProblemPattern.is(pattern)) {
                const result = parser.parse(pattern);
                if (parser.problemReporter.status.state < ValidationState.Error) {
                  this.add(result.name, result.patterns);
                } else {
                  extension.collector.error(localize("ProblemPatternRegistry.error", "Invalid problem pattern. The pattern will be ignored."));
                  extension.collector.error(JSON.stringify(pattern, void 0, 4));
                }
              } else if (Config.NamedProblemPattern.is(pattern)) {
                const result = parser.parse(pattern);
                if (parser.problemReporter.status.state < ValidationState.Error) {
                  this.add(pattern.name, result);
                } else {
                  extension.collector.error(localize("ProblemPatternRegistry.error", "Invalid problem pattern. The pattern will be ignored."));
                  extension.collector.error(JSON.stringify(pattern, void 0, 4));
                }
              }
              parser.reset();
            }
          });
        } catch (error) {
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    return this.readyPromise;
  }
  add(key, value) {
    this.patterns[key] = value;
  }
  get(key) {
    return this.patterns[key];
  }
  fillDefaults() {
    this.add("msCompile", {
      regexp: /^\s*(?:\s*\d+>)?(\S.*?)(?:\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\))?\s*:\s+(?:(\S+)\s+)?((?:fatal +)?error|warning|info)\s+(\w+\d+)?\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 4,
      code: 5,
      message: 6
    });
    this.add("gulp-tsc", {
      regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      code: 3,
      message: 4
    });
    this.add("cpp", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(C\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("csc", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(CS\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("vb", {
      regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(BC\d+)\s*:\s*(.*)$/,
      kind: 1 /* Location */,
      file: 1,
      location: 2,
      severity: 3,
      code: 4,
      message: 5
    });
    this.add("lessCompile", {
      regexp: /^\s*(.*) in file (.*) line no. (\d+)$/,
      kind: 1 /* Location */,
      message: 1,
      file: 2,
      line: 3
    });
    this.add("jshint", {
      regexp: /^(.*):\s+line\s+(\d+),\s+col\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
      kind: 1 /* Location */,
      file: 1,
      line: 2,
      character: 3,
      message: 4,
      severity: 5,
      code: 6
    });
    this.add("jshint-stylish", [
      {
        regexp: /^(.+)$/,
        kind: 1 /* Location */,
        file: 1
      },
      {
        regexp: /^\s+line\s+(\d+)\s+col\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
        line: 1,
        character: 2,
        message: 3,
        severity: 4,
        code: 5,
        loop: true
      }
    ]);
    this.add("eslint-compact", {
      regexp: /^(.+):\sline\s(\d+),\scol\s(\d+),\s(Error|Warning|Info)\s-\s(.+)\s\((.+)\)$/,
      file: 1,
      kind: 1 /* Location */,
      line: 2,
      character: 3,
      severity: 4,
      message: 5,
      code: 6
    });
    this.add("eslint-stylish", [
      {
        regexp: /^((?:[a-zA-Z]:)*[./\\]+.*?)$/,
        kind: 1 /* Location */,
        file: 1
      },
      {
        regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)(?:\s\s+(.*))?$/,
        line: 1,
        character: 2,
        severity: 3,
        message: 4,
        code: 5,
        loop: true
      }
    ]);
    this.add("go", {
      regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
      kind: 1 /* Location */,
      file: 2,
      line: 4,
      character: 6,
      message: 7
    });
  }
}
const ProblemPatternRegistry = new ProblemPatternRegistryImpl();
class ProblemMatcherParser extends Parser {
  constructor(logger) {
    super(logger);
  }
  parse(json) {
    const result = this.createProblemMatcher(json);
    if (!this.checkProblemMatcherValid(json, result)) {
      return void 0;
    }
    this.addWatchingMatcher(json, result);
    return result;
  }
  checkProblemMatcherValid(externalProblemMatcher, problemMatcher) {
    if (!problemMatcher) {
      this.error(localize("ProblemMatcherParser.noProblemMatcher", "Error: the description can't be converted into a problem matcher:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (!problemMatcher.pattern) {
      this.error(localize("ProblemMatcherParser.noProblemPattern", "Error: the description doesn't define a valid problem pattern:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (!problemMatcher.owner) {
      this.error(localize("ProblemMatcherParser.noOwner", "Error: the description doesn't define an owner:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    if (Types.isUndefined(problemMatcher.fileLocation)) {
      this.error(localize("ProblemMatcherParser.noFileLocation", "Error: the description doesn't define a file location:\n{0}\n", JSON.stringify(externalProblemMatcher, null, 4)));
      return false;
    }
    return true;
  }
  createProblemMatcher(description) {
    let result = null;
    const owner = Types.isString(description.owner) ? description.owner : UUID.generateUuid();
    const source = Types.isString(description.source) ? description.source : void 0;
    let applyTo = Types.isString(description.applyTo) ? ApplyToKind.fromString(description.applyTo) : 0 /* allDocuments */;
    if (!applyTo) {
      applyTo = 0 /* allDocuments */;
    }
    let fileLocation = void 0;
    let filePrefix = void 0;
    let kind;
    if (Types.isUndefined(description.fileLocation)) {
      fileLocation = 1 /* Relative */;
      filePrefix = "${workspaceFolder}";
    } else if (Types.isString(description.fileLocation)) {
      kind = FileLocationKind.fromString(description.fileLocation);
      if (kind) {
        fileLocation = kind;
        if (kind === 1 /* Relative */ || kind === 3 /* AutoDetect */) {
          filePrefix = "${workspaceFolder}";
        } else if (kind === 4 /* Search */) {
          filePrefix = { include: ["${workspaceFolder}"] };
        }
      }
    } else if (Types.isStringArray(description.fileLocation)) {
      const values = description.fileLocation;
      if (values.length > 0) {
        kind = FileLocationKind.fromString(values[0]);
        if (values.length === 1 && kind === 2 /* Absolute */) {
          fileLocation = kind;
        } else if (values.length === 2 && (kind === 1 /* Relative */ || kind === 3 /* AutoDetect */) && values[1]) {
          fileLocation = kind;
          filePrefix = values[1];
        }
      }
    } else if (Array.isArray(description.fileLocation)) {
      const kind2 = FileLocationKind.fromString(description.fileLocation[0]);
      if (kind2 === 4 /* Search */) {
        fileLocation = 4 /* Search */;
        filePrefix = description.fileLocation[1] ?? { include: ["${workspaceFolder}"] };
      }
    }
    const pattern = description.pattern ? this.createProblemPattern(description.pattern) : void 0;
    let severity = description.severity ? Severity.fromValue(description.severity) : void 0;
    if (severity === Severity.Ignore) {
      this.info(localize("ProblemMatcherParser.unknownSeverity", "Info: unknown severity {0}. Valid values are error, warning and info.\n", description.severity));
      severity = Severity.Error;
    }
    if (Types.isString(description.base)) {
      const variableName = description.base;
      if (variableName.length > 1 && variableName[0] === "$") {
        const base = ProblemMatcherRegistry.get(variableName.substring(1));
        if (base) {
          result = Objects.deepClone(base);
          if (description.owner !== void 0 && owner !== void 0) {
            result.owner = owner;
          }
          if (description.source !== void 0 && source !== void 0) {
            result.source = source;
          }
          if (description.fileLocation !== void 0 && fileLocation !== void 0) {
            result.fileLocation = fileLocation;
            result.filePrefix = filePrefix;
          }
          if (description.pattern !== void 0 && pattern !== void 0 && pattern !== null) {
            result.pattern = pattern;
          }
          if (description.severity !== void 0 && severity !== void 0) {
            result.severity = severity;
          }
          if (description.applyTo !== void 0 && applyTo !== void 0) {
            result.applyTo = applyTo;
          }
        }
      }
    } else if (fileLocation && pattern) {
      result = {
        owner,
        applyTo,
        fileLocation,
        pattern
      };
      if (source) {
        result.source = source;
      }
      if (filePrefix) {
        result.filePrefix = filePrefix;
      }
      if (severity) {
        result.severity = severity;
      }
    }
    if (Config.isNamedProblemMatcher(description)) {
      result.name = description.name;
      result.label = Types.isString(description.label) ? description.label : description.name;
    }
    return result;
  }
  createProblemPattern(value) {
    if (Types.isString(value)) {
      const variableName = value;
      if (variableName.length > 1 && variableName[0] === "$") {
        const result = ProblemPatternRegistry.get(variableName.substring(1));
        if (!result) {
          this.error(localize("ProblemMatcherParser.noDefinedPatter", "Error: the pattern with the identifier {0} doesn't exist.", variableName));
        }
        return result;
      } else {
        if (variableName.length === 0) {
          this.error(localize("ProblemMatcherParser.noIdentifier", "Error: the pattern property refers to an empty identifier."));
        } else {
          this.error(localize("ProblemMatcherParser.noValidIdentifier", "Error: the pattern property {0} is not a valid pattern variable name.", variableName));
        }
      }
    } else if (value) {
      const problemPatternParser = new ProblemPatternParser(this.problemReporter);
      if (Array.isArray(value)) {
        return problemPatternParser.parse(value);
      } else {
        return problemPatternParser.parse(value);
      }
    }
    return null;
  }
  addWatchingMatcher(external, internal) {
    const oldBegins = this.createRegularExpression(external.watchedTaskBeginsRegExp);
    const oldEnds = this.createRegularExpression(external.watchedTaskEndsRegExp);
    if (oldBegins && oldEnds) {
      internal.watching = {
        activeOnStart: false,
        beginsPattern: { regexp: oldBegins },
        endsPattern: { regexp: oldEnds }
      };
      return;
    }
    const backgroundMonitor = external.background || external.watching;
    if (Types.isUndefinedOrNull(backgroundMonitor)) {
      return;
    }
    const begins = this.createWatchingPattern(backgroundMonitor.beginsPattern);
    const ends = this.createWatchingPattern(backgroundMonitor.endsPattern);
    if (begins && ends) {
      internal.watching = {
        activeOnStart: Types.isBoolean(backgroundMonitor.activeOnStart) ? backgroundMonitor.activeOnStart : false,
        beginsPattern: begins,
        endsPattern: ends
      };
      return;
    }
    if (begins || ends) {
      this.error(localize("ProblemMatcherParser.problemPattern.watchingMatcher", "A problem matcher must define both a begin pattern and an end pattern for watching."));
    }
  }
  createWatchingPattern(external) {
    if (Types.isUndefinedOrNull(external)) {
      return null;
    }
    let regexp;
    let file;
    if (Types.isString(external)) {
      regexp = this.createRegularExpression(external);
    } else {
      regexp = this.createRegularExpression(external.regexp);
      if (Types.isNumber(external.file)) {
        file = external.file;
      }
    }
    if (!regexp) {
      return null;
    }
    return file ? { regexp, file } : { regexp, file: 1 };
  }
  createRegularExpression(value) {
    let result = null;
    if (!value) {
      return result;
    }
    try {
      result = new RegExp(value);
    } catch (err) {
      this.error(localize("ProblemMatcherParser.invalidRegexp", "Error: The string {0} is not a valid regular expression.\n", value));
    }
    return result;
  }
}
const problemMatchersExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "problemMatchers",
  deps: [problemPatternExtPoint],
  jsonSchema: {
    description: localize("ProblemMatcherExtPoint", "Contributes problem matchers"),
    type: "array",
    items: Schemas.NamedProblemMatcher
  }
});
class ProblemMatcherRegistryImpl {
  constructor() {
    this._onMatchersChanged = new Emitter();
    this.onMatcherChanged = this._onMatchersChanged.event;
    this.matchers = /* @__PURE__ */ Object.create(null);
    this.fillDefaults();
    this.readyPromise = new Promise((resolve, reject) => {
      problemMatchersExtPoint.setHandler((extensions, delta) => {
        try {
          delta.removed.forEach((extension) => {
            const problemMatchers = extension.value;
            for (const matcher2 of problemMatchers) {
              if (this.matchers[matcher2.name]) {
                delete this.matchers[matcher2.name];
              }
            }
          });
          delta.added.forEach((extension) => {
            const problemMatchers = extension.value;
            const parser = new ProblemMatcherParser(new ExtensionRegistryReporter(extension.collector));
            for (const matcher2 of problemMatchers) {
              const result = parser.parse(matcher2);
              if (result && isNamedProblemMatcher(result)) {
                this.add(result);
              }
            }
          });
          if (delta.removed.length > 0 || delta.added.length > 0) {
            this._onMatchersChanged.fire();
          }
        } catch (error) {
        }
        const matcher = this.get("tsc-watch");
        if (matcher) {
          matcher.tscWatch = true;
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    ProblemPatternRegistry.onReady();
    return this.readyPromise;
  }
  add(matcher) {
    this.matchers[matcher.name] = matcher;
  }
  get(name) {
    return this.matchers[name];
  }
  keys() {
    return Object.keys(this.matchers);
  }
  fillDefaults() {
    this.add({
      name: "msCompile",
      label: localize("msCompile", "Microsoft compiler problems"),
      owner: "msCompile",
      source: "cpp",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("msCompile")
    });
    this.add({
      name: "lessCompile",
      label: localize("lessCompile", "Less problems"),
      deprecated: true,
      owner: "lessCompile",
      source: "less",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("lessCompile"),
      severity: Severity.Error
    });
    this.add({
      name: "gulp-tsc",
      label: localize("gulp-tsc", "Gulp TSC Problems"),
      owner: "typescript",
      source: "ts",
      applyTo: 2 /* closedDocuments */,
      fileLocation: 1 /* Relative */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("gulp-tsc")
    });
    this.add({
      name: "jshint",
      label: localize("jshint", "JSHint problems"),
      owner: "jshint",
      source: "jshint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("jshint")
    });
    this.add({
      name: "jshint-stylish",
      label: localize("jshint-stylish", "JSHint stylish problems"),
      owner: "jshint",
      source: "jshint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("jshint-stylish")
    });
    this.add({
      name: "eslint-compact",
      label: localize("eslint-compact", "ESLint compact problems"),
      owner: "eslint",
      source: "eslint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("eslint-compact")
    });
    this.add({
      name: "eslint-stylish",
      label: localize("eslint-stylish", "ESLint stylish problems"),
      owner: "eslint",
      source: "eslint",
      applyTo: 0 /* allDocuments */,
      fileLocation: 2 /* Absolute */,
      pattern: ProblemPatternRegistry.get("eslint-stylish")
    });
    this.add({
      name: "go",
      label: localize("go", "Go problems"),
      owner: "go",
      source: "go",
      applyTo: 0 /* allDocuments */,
      fileLocation: 1 /* Relative */,
      filePrefix: "${workspaceFolder}",
      pattern: ProblemPatternRegistry.get("go")
    });
  }
}
const ProblemMatcherRegistry = new ProblemMatcherRegistryImpl();
export {
  ApplyToKind,
  Config,
  ExtensionRegistryReporter,
  FileLocationKind,
  ProblemLocationKind,
  ProblemMatcherParser,
  ProblemMatcherRegistry,
  ProblemPatternParser,
  ProblemPatternRegistry,
  Schemas,
  createLineMatcher,
  getResource,
  isNamedProblemMatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9wcm9ibGVtTWF0Y2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0ICogYXMgT2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIFN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgKiBhcyBBc3NlcnQgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IGpvaW4sIG5vcm1hbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgVVVJRCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCAqIGFzIFBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IFZhbGlkYXRpb25TdGF0dXMsIFZhbGlkYXRpb25TdGF0ZSwgSVByb2JsZW1SZXBvcnRlciwgUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyBhcyBOZXR3b3JrU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSwgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZpbGVUeXBlLCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEsIElGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBlbnVtIEZpbGVMb2NhdGlvbktpbmQge1xuXHREZWZhdWx0LFxuXHRSZWxhdGl2ZSxcblx0QWJzb2x1dGUsXG5cdEF1dG9EZXRlY3QsXG5cdFNlYXJjaFxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEZpbGVMb2NhdGlvbktpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nKTogRmlsZUxvY2F0aW9uS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0dmFsdWUgPSB2YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2Fic29sdXRlJykge1xuXHRcdFx0cmV0dXJuIEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGU7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ3JlbGF0aXZlJykge1xuXHRcdFx0cmV0dXJuIEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmU7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2F1dG9kZXRlY3QnKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUxvY2F0aW9uS2luZC5BdXRvRGV0ZWN0O1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdzZWFyY2gnKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUxvY2F0aW9uS2luZC5TZWFyY2g7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFByb2JsZW1Mb2NhdGlvbktpbmQge1xuXHRGaWxlLFxuXHRMb2NhdGlvblxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFByb2JsZW1Mb2NhdGlvbktpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nKTogUHJvYmxlbUxvY2F0aW9uS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0dmFsdWUgPSB2YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRyZXR1cm4gUHJvYmxlbUxvY2F0aW9uS2luZC5GaWxlO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdsb2NhdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtUGF0dGVybiB7XG5cdHJlZ2V4cDogUmVnRXhwO1xuXG5cdGtpbmQ/OiBQcm9ibGVtTG9jYXRpb25LaW5kO1xuXG5cdGZpbGU/OiBudW1iZXI7XG5cblx0bWVzc2FnZT86IG51bWJlcjtcblxuXHRsb2NhdGlvbj86IG51bWJlcjtcblxuXHRsaW5lPzogbnVtYmVyO1xuXG5cdGNoYXJhY3Rlcj86IG51bWJlcjtcblxuXHRlbmRMaW5lPzogbnVtYmVyO1xuXG5cdGVuZENoYXJhY3Rlcj86IG51bWJlcjtcblxuXHRjb2RlPzogbnVtYmVyO1xuXG5cdHNldmVyaXR5PzogbnVtYmVyO1xuXG5cdGxvb3A/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOYW1lZFByb2JsZW1QYXR0ZXJuIGV4dGVuZHMgSVByb2JsZW1QYXR0ZXJuIHtcblx0bmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IElQcm9ibGVtUGF0dGVybltdO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXYXRjaGluZ1BhdHRlcm4ge1xuXHRyZWdleHA6IFJlZ0V4cDtcblx0ZmlsZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2F0Y2hpbmdNYXRjaGVyIHtcblx0YWN0aXZlT25TdGFydDogYm9vbGVhbjtcblx0YmVnaW5zUGF0dGVybjogSVdhdGNoaW5nUGF0dGVybjtcblx0ZW5kc1BhdHRlcm46IElXYXRjaGluZ1BhdHRlcm47XG59XG5cbmV4cG9ydCBlbnVtIEFwcGx5VG9LaW5kIHtcblx0YWxsRG9jdW1lbnRzLFxuXHRvcGVuRG9jdW1lbnRzLFxuXHRjbG9zZWREb2N1bWVudHNcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBBcHBseVRvS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBBcHBseVRvS2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0dmFsdWUgPSB2YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2FsbGRvY3VtZW50cycpIHtcblx0XHRcdHJldHVybiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHM7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ29wZW5kb2N1bWVudHMnKSB7XG5cdFx0XHRyZXR1cm4gQXBwbHlUb0tpbmQub3BlbkRvY3VtZW50cztcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSAnY2xvc2VkZG9jdW1lbnRzJykge1xuXHRcdFx0cmV0dXJuIEFwcGx5VG9LaW5kLmNsb3NlZERvY3VtZW50cztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9ibGVtTWF0Y2hlciB7XG5cdG93bmVyOiBzdHJpbmc7XG5cdHNvdXJjZT86IHN0cmluZztcblx0YXBwbHlUbzogQXBwbHlUb0tpbmQ7XG5cdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZDtcblx0ZmlsZVByZWZpeD86IHN0cmluZyB8IENvbmZpZy5TZWFyY2hGaWxlTG9jYXRpb25BcmdzO1xuXHRwYXR0ZXJuOiBUeXBlcy5TaW5nbGVPck1hbnk8SVByb2JsZW1QYXR0ZXJuPjtcblx0c2V2ZXJpdHk/OiBTZXZlcml0eTtcblx0d2F0Y2hpbmc/OiBJV2F0Y2hpbmdNYXRjaGVyO1xuXHR1cmlQcm92aWRlcj86IChwYXRoOiBzdHJpbmcpID0+IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTmFtZWRQcm9ibGVtTWF0Y2hlciBleHRlbmRzIFByb2JsZW1NYXRjaGVyIHtcblx0bmFtZTogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRkZXByZWNhdGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiB7XG5cdG5hbWU6IHN0cmluZztcblx0bGFiZWw6IHN0cmluZztcblx0cGF0dGVybnM6IE11bHRpTGluZVByb2JsZW1QYXR0ZXJuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOYW1lZFByb2JsZW1NYXRjaGVyKHZhbHVlOiBQcm9ibGVtTWF0Y2hlciB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIElOYW1lZFByb2JsZW1NYXRjaGVyIHtcblx0cmV0dXJuIHZhbHVlICYmIFR5cGVzLmlzU3RyaW5nKCg8SU5hbWVkUHJvYmxlbU1hdGNoZXI+dmFsdWUpLm5hbWUpID8gdHJ1ZSA6IGZhbHNlO1xufVxuXG5pbnRlcmZhY2UgSUxvY2F0aW9uIHtcblx0c3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHN0YXJ0Q2hhcmFjdGVyOiBudW1iZXI7XG5cdGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZW5kQ2hhcmFjdGVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJUHJvYmxlbURhdGEge1xuXHRraW5kPzogUHJvYmxlbUxvY2F0aW9uS2luZDtcblx0ZmlsZT86IHN0cmluZztcblx0bG9jYXRpb24/OiBzdHJpbmc7XG5cdGxpbmU/OiBzdHJpbmc7XG5cdGNoYXJhY3Rlcj86IHN0cmluZztcblx0ZW5kTGluZT86IHN0cmluZztcblx0ZW5kQ2hhcmFjdGVyPzogc3RyaW5nO1xuXHRtZXNzYWdlPzogc3RyaW5nO1xuXHRzZXZlcml0eT86IHN0cmluZztcblx0Y29kZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvYmxlbU1hdGNoIHtcblx0cmVzb3VyY2U6IFByb21pc2U8VVJJPjtcblx0bWFya2VyOiBJTWFya2VyRGF0YTtcblx0ZGVzY3JpcHRpb246IFByb2JsZW1NYXRjaGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElIYW5kbGVSZXN1bHQge1xuXHRtYXRjaDogSVByb2JsZW1NYXRjaCB8IG51bGw7XG5cdGNvbnRpbnVlOiBib29sZWFuO1xufVxuXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRSZXNvdXJjZShmaWxlbmFtZTogc3RyaW5nLCBtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPFVSST4ge1xuXHRjb25zdCBraW5kID0gbWF0Y2hlci5maWxlTG9jYXRpb247XG5cdGxldCBmdWxsUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpZiAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSkge1xuXHRcdGZ1bGxQYXRoID0gZmlsZW5hbWU7XG5cdH0gZWxzZSBpZiAoKGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmUpICYmIG1hdGNoZXIuZmlsZVByZWZpeCAmJiBUeXBlcy5pc1N0cmluZyhtYXRjaGVyLmZpbGVQcmVmaXgpKSB7XG5cdFx0ZnVsbFBhdGggPSBqb2luKG1hdGNoZXIuZmlsZVByZWZpeCwgZmlsZW5hbWUpO1xuXHR9IGVsc2UgaWYgKGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuQXV0b0RldGVjdCkge1xuXHRcdGNvbnN0IG1hdGNoZXJDbG9uZSA9IE9iamVjdHMuZGVlcENsb25lKG1hdGNoZXIpO1xuXHRcdG1hdGNoZXJDbG9uZS5maWxlTG9jYXRpb24gPSBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlO1xuXHRcdGlmIChmaWxlU2VydmljZSkge1xuXHRcdFx0Y29uc3QgcmVsYXRpdmUgPSBhd2FpdCBnZXRSZXNvdXJjZShmaWxlbmFtZSwgbWF0Y2hlckNsb25lKTtcblx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnN0YXQocmVsYXRpdmUpO1xuXHRcdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdFx0Ly8gRG8gbm90aGluZywgd2UganVzdCBuZWVkIHRvIGNhdGNoIGZpbGUgcmVzb2x1dGlvbiBlcnJvcnMuXG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVsYXRpdmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bWF0Y2hlckNsb25lLmZpbGVMb2NhdGlvbiA9IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGU7XG5cdFx0cmV0dXJuIGdldFJlc291cmNlKGZpbGVuYW1lLCBtYXRjaGVyQ2xvbmUpO1xuXHR9IGVsc2UgaWYgKGtpbmQgPT09IEZpbGVMb2NhdGlvbktpbmQuU2VhcmNoICYmIGZpbGVTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgZnNQcm92aWRlciA9IGZpbGVTZXJ2aWNlLmdldFByb3ZpZGVyKE5ldHdvcmtTY2hlbWFzLmZpbGUpO1xuXHRcdGlmIChmc1Byb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWFyY2hGb3JGaWxlTG9jYXRpb24oZmlsZW5hbWUsIGZzUHJvdmlkZXIsIG1hdGNoZXIuZmlsZVByZWZpeCBhcyBDb25maWcuU2VhcmNoRmlsZUxvY2F0aW9uQXJncyk7XG5cdFx0XHRmdWxsUGF0aCA9IHVyaT8ucGF0aDtcblx0XHR9XG5cblx0XHRpZiAoIWZ1bGxQYXRoKSB7XG5cdFx0XHRjb25zdCBhYnNvbHV0ZU1hdGNoZXIgPSBPYmplY3RzLmRlZXBDbG9uZShtYXRjaGVyKTtcblx0XHRcdGFic29sdXRlTWF0Y2hlci5maWxlTG9jYXRpb24gPSBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlO1xuXHRcdFx0cmV0dXJuIGdldFJlc291cmNlKGZpbGVuYW1lLCBhYnNvbHV0ZU1hdGNoZXIpO1xuXHRcdH1cblx0fVxuXHRpZiAoZnVsbFBhdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignRmlsZUxvY2F0aW9uS2luZCBpcyBub3QgYWN0aW9uYWJsZS4gRG9lcyB0aGUgbWF0Y2hlciBoYXZlIGEgZmlsZVByZWZpeD8gVGhpcyBzaG91bGQgbmV2ZXIgaGFwcGVuLicpO1xuXHR9XG5cdGZ1bGxQYXRoID0gbm9ybWFsaXplKGZ1bGxQYXRoKTtcblx0ZnVsbFBhdGggPSBmdWxsUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cdGlmIChmdWxsUGF0aFswXSAhPT0gJy8nKSB7XG5cdFx0ZnVsbFBhdGggPSAnLycgKyBmdWxsUGF0aDtcblx0fVxuXHRpZiAobWF0Y2hlci51cmlQcm92aWRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXIudXJpUHJvdmlkZXIoZnVsbFBhdGgpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBVUkkuZmlsZShmdWxsUGF0aCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VhcmNoRm9yRmlsZUxvY2F0aW9uKGZpbGVuYW1lOiBzdHJpbmcsIGZzUHJvdmlkZXI6IElGaWxlU3lzdGVtUHJvdmlkZXIsIGFyZ3M6IENvbmZpZy5TZWFyY2hGaWxlTG9jYXRpb25BcmdzKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgZXhjbHVzaW9ucyA9IG5ldyBTZXQoYXNBcnJheShhcmdzLmV4Y2x1ZGUgfHwgW10pLm1hcCh4ID0+IFVSSS5maWxlKHgpLnBhdGgpKTtcblx0YXN5bmMgZnVuY3Rpb24gc2VhcmNoKGRpcjogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZXhjbHVzaW9ucy5oYXMoZGlyLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmc1Byb3ZpZGVyLnJlYWRkaXIoZGlyKTtcblx0XHRjb25zdCBzdWJkaXJzOiBVUklbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbbmFtZSwgZmlsZVR5cGVdIG9mIGVudHJpZXMpIHtcblx0XHRcdGlmIChmaWxlVHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHN1YmRpcnMucHVzaChVUkkuam9pblBhdGgoZGlyLCBuYW1lKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZmlsZVR5cGUgPT09IEZpbGVUeXBlLkZpbGUpIHtcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIE5vdGUgdGhhdCBzb21ldGltZXMgdGhlIGdpdmVuIGBmaWxlbmFtZWAgY291bGQgYmUgYSByZWxhdGl2ZVxuXHRcdFx0XHQgKiBwYXRoIChub3QganVzdCB0aGUgXCJuYW1lLmV4dFwiIHBhcnQpLiBGb3IgZXhhbXBsZSwgdGhlXG5cdFx0XHRcdCAqIGBmaWxlbmFtZWAgY2FuIGJlIFwiL3N1YmRpci9uYW1lLmV4dFwiLiBTbywganVzdCBjb21wYXJpbmdcblx0XHRcdFx0ICogYG5hbWVgIGFzIGBmaWxlbmFtZWAgaXMgbm90IHN1ZmZpY2llbnQuIFRoZSB3b3JrYXJvdW5kIGhlcmVcblx0XHRcdFx0ICogaXMgdG8gZm9ybSB0aGUgVVJJIHdpdGggYGRpcmAgYW5kIGBuYW1lYCBhbmQgY2hlY2sgaWYgaXQgZW5kc1xuXHRcdFx0XHQgKiB3aXRoIHRoZSBnaXZlbiBgZmlsZW5hbWVgLlxuXHRcdFx0XHQgKi9cblx0XHRcdFx0Y29uc3QgZnVsbFVyaSA9IFVSSS5qb2luUGF0aChkaXIsIG5hbWUpO1xuXHRcdFx0XHRpZiAoZnVsbFVyaS5wYXRoLmVuZHNXaXRoKGZpbGVuYW1lKSkge1xuXHRcdFx0XHRcdHJldHVybiBmdWxsVXJpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzdWJkaXIgb2Ygc3ViZGlycykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VhcmNoKHN1YmRpcik7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmb3IgKGNvbnN0IGRpciBvZiBhc0FycmF5KGFyZ3MuaW5jbHVkZSB8fCBbXSkpIHtcblx0XHRjb25zdCBoaXQgPSBhd2FpdCBzZWFyY2goVVJJLmZpbGUoZGlyKSk7XG5cdFx0aWYgKGhpdCkge1xuXHRcdFx0cmV0dXJuIGhpdDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGluZU1hdGNoZXIge1xuXHRtYXRjaExlbmd0aDogbnVtYmVyO1xuXHRuZXh0KGxpbmU6IHN0cmluZyk6IElQcm9ibGVtTWF0Y2ggfCBudWxsO1xuXHRoYW5kbGUobGluZXM6IHN0cmluZ1tdLCBzdGFydD86IG51bWJlcik6IElIYW5kbGVSZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMaW5lTWF0Y2hlcihtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSk6IElMaW5lTWF0Y2hlciB7XG5cdGNvbnN0IHBhdHRlcm4gPSBtYXRjaGVyLnBhdHRlcm47XG5cdGlmIChBcnJheS5pc0FycmF5KHBhdHRlcm4pKSB7XG5cdFx0cmV0dXJuIG5ldyBNdWx0aUxpbmVNYXRjaGVyKG1hdGNoZXIsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbmV3IFNpbmdsZUxpbmVNYXRjaGVyKG1hdGNoZXIsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fVxufVxuXG5jb25zdCBlbmRPZkxpbmU6IHN0cmluZyA9IFBsYXRmb3JtLk9TID09PSBQbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/ICdcXHJcXG4nIDogJ1xcbic7XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0TGluZU1hdGNoZXIgaW1wbGVtZW50cyBJTGluZU1hdGNoZXIge1xuXHRwcml2YXRlIG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyO1xuXHRwcml2YXRlIGZpbGVTZXJ2aWNlPzogSUZpbGVTZXJ2aWNlO1xuXHRwcml2YXRlIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZTtcblxuXHRjb25zdHJ1Y3RvcihtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSkge1xuXHRcdHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG5cdFx0dGhpcy5maWxlU2VydmljZSA9IGZpbGVTZXJ2aWNlO1xuXHRcdHRoaXMubG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlKGxpbmVzOiBzdHJpbmdbXSwgc3RhcnQ6IG51bWJlciA9IDApOiBJSGFuZGxlUmVzdWx0IHtcblx0XHRyZXR1cm4geyBtYXRjaDogbnVsbCwgY29udGludWU6IGZhbHNlIH07XG5cdH1cblxuXHRwdWJsaWMgbmV4dChsaW5lOiBzdHJpbmcpOiBJUHJvYmxlbU1hdGNoIHwgbnVsbCB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgZ2V0IG1hdGNoTGVuZ3RoKCk6IG51bWJlcjtcblxuXHRwcm90ZWN0ZWQgcmVnZXhwRXhlYyhyZWdleHA6IFJlZ0V4cCwgbGluZTogc3RyaW5nKTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlZ2V4cC5leGVjKGxpbmUpO1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gc3RhcnQ7XG5cdFx0aWYgKGVsYXBzZWQgPiA1KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2U/LnRyYWNlKGBQcm9ibGVtTWF0Y2hlcjogc2xvdyByZWdleHAgdG9vayAke2VsYXBzZWR9bXMgdG8gZXhlY3V0ZWAsIHJlZ2V4cC5zb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGZpbGxQcm9ibGVtRGF0YShkYXRhOiBJUHJvYmxlbURhdGEgfCB1bmRlZmluZWQsIHBhdHRlcm46IElQcm9ibGVtUGF0dGVybiwgbWF0Y2hlczogUmVnRXhwRXhlY0FycmF5KTogZGF0YSBpcyBJUHJvYmxlbURhdGEge1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnZmlsZScsIHBhdHRlcm4sIG1hdGNoZXMsIHRydWUpO1xuXHRcdFx0dGhpcy5hcHBlbmRQcm9wZXJ0eShkYXRhLCAnbWVzc2FnZScsIHBhdHRlcm4sIG1hdGNoZXMsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ2NvZGUnLCBwYXR0ZXJuLCBtYXRjaGVzLCB0cnVlKTtcblx0XHRcdHRoaXMuZmlsbFByb3BlcnR5KGRhdGEsICdzZXZlcml0eScsIHBhdHRlcm4sIG1hdGNoZXMsIHRydWUpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ2xvY2F0aW9uJywgcGF0dGVybiwgbWF0Y2hlcywgdHJ1ZSk7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCAnbGluZScsIHBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ2NoYXJhY3RlcicsIHBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0dGhpcy5maWxsUHJvcGVydHkoZGF0YSwgJ2VuZExpbmUnLCBwYXR0ZXJuLCBtYXRjaGVzKTtcblx0XHRcdHRoaXMuZmlsbFByb3BlcnR5KGRhdGEsICdlbmRDaGFyYWN0ZXInLCBwYXR0ZXJuLCBtYXRjaGVzKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRQcm9wZXJ0eShkYXRhOiBJUHJvYmxlbURhdGEsIHByb3BlcnR5OiBrZXlvZiBJUHJvYmxlbURhdGEsIHBhdHRlcm46IElQcm9ibGVtUGF0dGVybiwgbWF0Y2hlczogUmVnRXhwRXhlY0FycmF5LCB0cmltOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCBwYXR0ZXJuUHJvcGVydHkgPSBwYXR0ZXJuW3Byb3BlcnR5XTtcblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWQoZGF0YVtwcm9wZXJ0eV0pKSB7XG5cdFx0XHR0aGlzLmZpbGxQcm9wZXJ0eShkYXRhLCBwcm9wZXJ0eSwgcGF0dGVybiwgbWF0Y2hlcywgdHJpbSk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKCFUeXBlcy5pc1VuZGVmaW5lZChwYXR0ZXJuUHJvcGVydHkpICYmIHBhdHRlcm5Qcm9wZXJ0eSA8IG1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSBtYXRjaGVzW3BhdHRlcm5Qcm9wZXJ0eV07XG5cdFx0XHRpZiAodHJpbSkge1xuXHRcdFx0XHR2YWx1ZSA9IFN0cmluZ3MudHJpbSh2YWx1ZSkhO1xuXHRcdFx0fVxuXHRcdFx0KGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPilbcHJvcGVydHldID0gZGF0YVtwcm9wZXJ0eV0hICsgZW5kT2ZMaW5lICsgdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWxsUHJvcGVydHkoZGF0YTogSVByb2JsZW1EYXRhLCBwcm9wZXJ0eToga2V5b2YgSVByb2JsZW1EYXRhLCBwYXR0ZXJuOiBJUHJvYmxlbVBhdHRlcm4sIG1hdGNoZXM6IFJlZ0V4cEV4ZWNBcnJheSwgdHJpbTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgcGF0dGVybkF0UHJvcGVydHkgPSBwYXR0ZXJuW3Byb3BlcnR5XTtcblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWQoZGF0YVtwcm9wZXJ0eV0pICYmICFUeXBlcy5pc1VuZGVmaW5lZChwYXR0ZXJuQXRQcm9wZXJ0eSkgJiYgcGF0dGVybkF0UHJvcGVydHkgPCBtYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0bGV0IHZhbHVlID0gbWF0Y2hlc1twYXR0ZXJuQXRQcm9wZXJ0eV07XG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAodHJpbSkge1xuXHRcdFx0XHRcdHZhbHVlID0gU3RyaW5ncy50cmltKHZhbHVlKSE7XG5cdFx0XHRcdH1cblx0XHRcdFx0KGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPilbcHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldE1hcmtlck1hdGNoKGRhdGE6IElQcm9ibGVtRGF0YSk6IElQcm9ibGVtTWF0Y2ggfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0TG9jYXRpb24oZGF0YSk7XG5cdFx0XHRpZiAoZGF0YS5maWxlICYmIGxvY2F0aW9uICYmIGRhdGEubWVzc2FnZSkge1xuXHRcdFx0XHRjb25zdCBtYXJrZXI6IElNYXJrZXJEYXRhID0ge1xuXHRcdFx0XHRcdHNldmVyaXR5OiB0aGlzLmdldFNldmVyaXR5KGRhdGEpLFxuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbG9jYXRpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBsb2NhdGlvbi5zdGFydENoYXJhY3Rlcixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBsb2NhdGlvbi5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogbG9jYXRpb24uZW5kQ2hhcmFjdGVyLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGRhdGEubWVzc2FnZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoZGF0YS5jb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRtYXJrZXIuY29kZSA9IGRhdGEuY29kZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5tYXRjaGVyLnNvdXJjZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bWFya2VyLnNvdXJjZSA9IHRoaXMubWF0Y2hlci5zb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5tYXRjaGVyLFxuXHRcdFx0XHRcdHJlc291cmNlOiB0aGlzLmdldFJlc291cmNlKGRhdGEuZmlsZSksXG5cdFx0XHRcdFx0bWFya2VyOiBtYXJrZXJcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBjb252ZXJ0IHByb2JsZW0gZGF0YSBpbnRvIG1hdGNoOiAke0pTT04uc3RyaW5naWZ5KGRhdGEpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFJlc291cmNlKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiBnZXRSZXNvdXJjZShmaWxlbmFtZSwgdGhpcy5tYXRjaGVyLCB0aGlzLmZpbGVTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TG9jYXRpb24oZGF0YTogSVByb2JsZW1EYXRhKTogSUxvY2F0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKGRhdGEua2luZCA9PT0gUHJvYmxlbUxvY2F0aW9uS2luZC5GaWxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVMb2NhdGlvbigwLCAwLCAwLCAwKTtcblx0XHR9XG5cdFx0aWYgKGRhdGEubG9jYXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlTG9jYXRpb25JbmZvKGRhdGEubG9jYXRpb24pO1xuXHRcdH1cblx0XHRpZiAoIWRhdGEubGluZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHBhcnNlSW50KGRhdGEubGluZSk7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBkYXRhLmNoYXJhY3RlciA/IHBhcnNlSW50KGRhdGEuY2hhcmFjdGVyKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBlbmRMaW5lID0gZGF0YS5lbmRMaW5lID8gcGFyc2VJbnQoZGF0YS5lbmRMaW5lKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBkYXRhLmVuZENoYXJhY3RlciA/IHBhcnNlSW50KGRhdGEuZW5kQ2hhcmFjdGVyKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVMb2NhdGlvbihzdGFydExpbmUsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUxvY2F0aW9uSW5mbyh2YWx1ZTogc3RyaW5nKTogSUxvY2F0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF2YWx1ZSB8fCAhdmFsdWUubWF0Y2goLyhcXGQrfFxcZCssXFxkK3xcXGQrLFxcZCssXFxkKyxcXGQrKS8pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcGFydHMgPSB2YWx1ZS5zcGxpdCgnLCcpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHBhcnNlSW50KHBhcnRzWzBdKTtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJzZUludChwYXJ0c1sxXSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHBhcnRzLmxlbmd0aCA+IDMpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUxvY2F0aW9uKHN0YXJ0TGluZSwgc3RhcnRDb2x1bW4sIHBhcnNlSW50KHBhcnRzWzJdKSwgcGFyc2VJbnQocGFydHNbM10pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlTG9jYXRpb24oc3RhcnRMaW5lLCBzdGFydENvbHVtbiwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTG9jYXRpb24oc3RhcnRMaW5lOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQsIGVuZExpbmU6IG51bWJlciB8IHVuZGVmaW5lZCwgZW5kQ29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQpOiBJTG9jYXRpb24ge1xuXHRcdGlmIChzdGFydENvbHVtbiAhPT0gdW5kZWZpbmVkICYmIGVuZENvbHVtbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyBzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZSwgc3RhcnRDaGFyYWN0ZXI6IHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBlbmRMaW5lIHx8IHN0YXJ0TGluZSwgZW5kQ2hhcmFjdGVyOiBlbmRDb2x1bW4gfTtcblx0XHR9XG5cdFx0aWYgKHN0YXJ0Q29sdW1uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lLCBzdGFydENoYXJhY3Rlcjogc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IHN0YXJ0TGluZSwgZW5kQ2hhcmFjdGVyOiBzdGFydENvbHVtbiB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZSwgc3RhcnRDaGFyYWN0ZXI6IDEsIGVuZExpbmVOdW1iZXI6IHN0YXJ0TGluZSwgZW5kQ2hhcmFjdGVyOiAyICoqIDMxIC0gMSB9OyAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzgwMjg4I2lzc3VlY29tbWVudC02NTA2MzY0NDIgZm9yIGRpc2N1c3Npb25cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2V2ZXJpdHkoZGF0YTogSVByb2JsZW1EYXRhKTogTWFya2VyU2V2ZXJpdHkge1xuXHRcdGxldCByZXN1bHQ6IFNldmVyaXR5IHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKGRhdGEuc2V2ZXJpdHkpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gZGF0YS5zZXZlcml0eTtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5mcm9tVmFsdWUodmFsdWUpO1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSBTZXZlcml0eS5JZ25vcmUpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUgPT09ICdFJykge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ1cnKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBTZXZlcml0eS5XYXJuaW5nO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09ICdJJykge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gU2V2ZXJpdHkuSW5mbztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKFN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh2YWx1ZSwgJ2hpbnQnKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gU2V2ZXJpdHkuSW5mbztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKFN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSh2YWx1ZSwgJ25vdGUnKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gU2V2ZXJpdHkuSW5mbztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc3VsdCA9PT0gbnVsbCB8fCByZXN1bHQgPT09IFNldmVyaXR5Lklnbm9yZSkge1xuXHRcdFx0cmVzdWx0ID0gdGhpcy5tYXRjaGVyLnNldmVyaXR5IHx8IFNldmVyaXR5LkVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gTWFya2VyU2V2ZXJpdHkuZnJvbVNldmVyaXR5KHJlc3VsdCk7XG5cdH1cbn1cblxuY2xhc3MgU2luZ2xlTGluZU1hdGNoZXIgZXh0ZW5kcyBBYnN0cmFjdExpbmVNYXRjaGVyIHtcblxuXHRwcml2YXRlIHBhdHRlcm46IElQcm9ibGVtUGF0dGVybjtcblxuXHRjb25zdHJ1Y3RvcihtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKG1hdGNoZXIsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLnBhdHRlcm4gPSA8SVByb2JsZW1QYXR0ZXJuPm1hdGNoZXIucGF0dGVybjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWF0Y2hMZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBoYW5kbGUobGluZXM6IHN0cmluZ1tdLCBzdGFydDogbnVtYmVyID0gMCk6IElIYW5kbGVSZXN1bHQge1xuXHRcdEFzc2VydC5vayhsaW5lcy5sZW5ndGggLSBzdGFydCA9PT0gMSk7XG5cdFx0Y29uc3QgZGF0YTogSVByb2JsZW1EYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRpZiAodGhpcy5wYXR0ZXJuLmtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGF0YS5raW5kID0gdGhpcy5wYXR0ZXJuLmtpbmQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLnJlZ2V4cEV4ZWModGhpcy5wYXR0ZXJuLnJlZ2V4cCwgbGluZXNbc3RhcnRdKTtcblx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0dGhpcy5maWxsUHJvYmxlbURhdGEoZGF0YSwgdGhpcy5wYXR0ZXJuLCBtYXRjaGVzKTtcblx0XHRcdGlmIChkYXRhLmtpbmQgPT09IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24gJiYgIWRhdGEubG9jYXRpb24gJiYgIWRhdGEubGluZSAmJiBkYXRhLmZpbGUpIHtcblx0XHRcdFx0ZGF0YS5raW5kID0gUHJvYmxlbUxvY2F0aW9uS2luZC5GaWxlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLmdldE1hcmtlck1hdGNoKGRhdGEpO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiB7IG1hdGNoOiBtYXRjaCwgY29udGludWU6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IG1hdGNoOiBudWxsLCBjb250aW51ZTogZmFsc2UgfTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBuZXh0KGxpbmU6IHN0cmluZyk6IElQcm9ibGVtTWF0Y2ggfCBudWxsIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5jbGFzcyBNdWx0aUxpbmVNYXRjaGVyIGV4dGVuZHMgQWJzdHJhY3RMaW5lTWF0Y2hlciB7XG5cblx0cHJpdmF0ZSBwYXR0ZXJuczogSVByb2JsZW1QYXR0ZXJuW107XG5cdHByaXZhdGUgZGF0YTogSVByb2JsZW1EYXRhIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIobWF0Y2hlciwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMucGF0dGVybnMgPSA8SVByb2JsZW1QYXR0ZXJuW10+bWF0Y2hlci5wYXR0ZXJuO1xuXHR9XG5cblx0cHVibGljIGdldCBtYXRjaExlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnBhdHRlcm5zLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBoYW5kbGUobGluZXM6IHN0cmluZ1tdLCBzdGFydDogbnVtYmVyID0gMCk6IElIYW5kbGVSZXN1bHQge1xuXHRcdEFzc2VydC5vayhsaW5lcy5sZW5ndGggLSBzdGFydCA9PT0gdGhpcy5wYXR0ZXJucy5sZW5ndGgpO1xuXHRcdHRoaXMuZGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0bGV0IGRhdGEgPSB0aGlzLmRhdGEhO1xuXHRcdGRhdGEua2luZCA9IHRoaXMucGF0dGVybnNbMF0ua2luZDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGF0dGVybnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSB0aGlzLnBhdHRlcm5zW2ldO1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMucmVnZXhwRXhlYyhwYXR0ZXJuLnJlZ2V4cCwgbGluZXNbaSArIHN0YXJ0XSk7XG5cdFx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWF0Y2g6IG51bGwsIGNvbnRpbnVlOiBmYWxzZSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gT25seSB0aGUgbGFzdCBwYXR0ZXJuIGNhbiBsb29wXG5cdFx0XHRcdGlmIChwYXR0ZXJuLmxvb3AgJiYgaSA9PT0gdGhpcy5wYXR0ZXJucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0ZGF0YSA9IE9iamVjdHMuZGVlcENsb25lKGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZmlsbFByb2JsZW1EYXRhKGRhdGEsIHBhdHRlcm4sIG1hdGNoZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBsb29wID0gISF0aGlzLnBhdHRlcm5zW3RoaXMucGF0dGVybnMubGVuZ3RoIC0gMV0ubG9vcDtcblx0XHRpZiAoIWxvb3ApIHtcblx0XHRcdHRoaXMuZGF0YSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2VyTWF0Y2ggPSBkYXRhID8gdGhpcy5nZXRNYXJrZXJNYXRjaChkYXRhKSA6IG51bGw7XG5cdFx0cmV0dXJuIHsgbWF0Y2g6IG1hcmtlck1hdGNoID8gbWFya2VyTWF0Y2ggOiBudWxsLCBjb250aW51ZTogbG9vcCB9O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG5leHQobGluZTogc3RyaW5nKTogSVByb2JsZW1NYXRjaCB8IG51bGwge1xuXHRcdGNvbnN0IHBhdHRlcm4gPSB0aGlzLnBhdHRlcm5zW3RoaXMucGF0dGVybnMubGVuZ3RoIC0gMV07XG5cdFx0QXNzZXJ0Lm9rKHBhdHRlcm4ubG9vcCA9PT0gdHJ1ZSAmJiB0aGlzLmRhdGEgIT09IG51bGwpO1xuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLnJlZ2V4cEV4ZWMocGF0dGVybi5yZWdleHAsIGxpbmUpO1xuXHRcdGlmICghbWF0Y2hlcykge1xuXHRcdFx0dGhpcy5kYXRhID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSBPYmplY3RzLmRlZXBDbG9uZSh0aGlzLmRhdGEpO1xuXHRcdGxldCBwcm9ibGVtTWF0Y2g6IElQcm9ibGVtTWF0Y2ggfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZmlsbFByb2JsZW1EYXRhKGRhdGEsIHBhdHRlcm4sIG1hdGNoZXMpKSB7XG5cdFx0XHRwcm9ibGVtTWF0Y2ggPSB0aGlzLmdldE1hcmtlck1hdGNoKGRhdGEpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvYmxlbU1hdGNoID8gcHJvYmxlbU1hdGNoIDogbnVsbDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbmZpZyB7XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJUHJvYmxlbVBhdHRlcm4ge1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgcmVndWxhciBleHByZXNzaW9uIHRvIGZpbmQgYSBwcm9ibGVtIGluIHRoZSBjb25zb2xlIG91dHB1dCBvZiBhblxuXHRcdCogZXhlY3V0ZWQgdGFzay5cblx0XHQqL1xuXHRcdHJlZ2V4cD86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogV2hldGhlciB0aGUgcGF0dGVybiBtYXRjaGVzIGEgd2hvbGUgZmlsZSwgb3IgYSBsb2NhdGlvbiAoZmlsZS9saW5lKVxuXHRcdCpcblx0XHQqIFRoZSBkZWZhdWx0IGlzIHRvIG1hdGNoIGZvciBhIGxvY2F0aW9uLiBPbmx5IHZhbGlkIG9uIHRoZVxuXHRcdCogZmlyc3QgcHJvYmxlbSBwYXR0ZXJuIGluIGEgbXVsdGkgbGluZSBwcm9ibGVtIG1hdGNoZXIuXG5cdFx0Ki9cblx0XHRraW5kPzogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIGZpbGVuYW1lLlxuXHRcdCogSWYgb21pdHRlZCAxIGlzIHVzZWQuXG5cdFx0Ki9cblx0XHRmaWxlPzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW0ncyBsb2NhdGlvbi4gVmFsaWQgbG9jYXRpb25cblx0XHQqIHBhdHRlcm5zIGFyZTogKGxpbmUpLCAobGluZSxjb2x1bW4pIGFuZCAoc3RhcnRMaW5lLHN0YXJ0Q29sdW1uLGVuZExpbmUsZW5kQ29sdW1uKS5cblx0XHQqIElmIG9taXR0ZWQgdGhlIGxpbmUgYW5kIGNvbHVtbiBwcm9wZXJ0aWVzIGFyZSB1c2VkLlxuXHRcdCovXG5cdFx0bG9jYXRpb24/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbSdzIGxpbmUgaW4gdGhlIHNvdXJjZSBmaWxlLlxuXHRcdCpcblx0XHQqIERlZmF1bHRzIHRvIDIuXG5cdFx0Ki9cblx0XHRsaW5lPzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW0ncyBjb2x1bW4gaW4gdGhlIHNvdXJjZSBmaWxlLlxuXHRcdCpcblx0XHQqIERlZmF1bHRzIHRvIDMuXG5cdFx0Ki9cblx0XHRjb2x1bW4/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbSdzIGVuZCBsaW5lIGluIHRoZSBzb3VyY2UgZmlsZS5cblx0XHQqXG5cdFx0KiBEZWZhdWx0cyB0byB1bmRlZmluZWQuIE5vIGVuZCBsaW5lIGlzIGNhcHR1cmVkLlxuXHRcdCovXG5cdFx0ZW5kTGluZT86IG51bWJlcjtcblxuXHRcdC8qKlxuXHRcdCogVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtJ3MgZW5kIGNvbHVtbiBpbiB0aGUgc291cmNlIGZpbGUuXG5cdFx0KlxuXHRcdCogRGVmYXVsdHMgdG8gdW5kZWZpbmVkLiBObyBlbmQgY29sdW1uIGlzIGNhcHR1cmVkLlxuXHRcdCovXG5cdFx0ZW5kQ29sdW1uPzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW0ncyBzZXZlcml0eS5cblx0XHQqXG5cdFx0KiBEZWZhdWx0cyB0byB1bmRlZmluZWQuIEluIHRoaXMgY2FzZSB0aGUgcHJvYmxlbSBtYXRjaGVyJ3Mgc2V2ZXJpdHlcblx0XHQqIGlzIHVzZWQuXG5cdFx0Ki9cblx0XHRzZXZlcml0eT86IG51bWJlcjtcblxuXHRcdC8qKlxuXHRcdCogVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtJ3MgY29kZS5cblx0XHQqXG5cdFx0KiBEZWZhdWx0cyB0byB1bmRlZmluZWQuIE5vIGNvZGUgaXMgY2FwdHVyZWQuXG5cdFx0Ki9cblx0XHRjb2RlPzogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0KiBUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIG1lc3NhZ2UuIElmIG9taXR0ZWQgaXQgZGVmYXVsdHNcblx0XHQqIHRvIDQgaWYgbG9jYXRpb24gaXMgc3BlY2lmaWVkLiBPdGhlcndpc2UgaXQgZGVmYXVsdHMgdG8gNS5cblx0XHQqL1xuXHRcdG1lc3NhZ2U/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIFNwZWNpZmllcyBpZiB0aGUgbGFzdCBwYXR0ZXJuIGluIGEgbXVsdGkgbGluZSBwcm9ibGVtIG1hdGNoZXIgc2hvdWxkXG5cdFx0KiBsb29wIGFzIGxvbmcgYXMgaXQgZG9lcyBtYXRjaCBhIGxpbmUgY29uc2VxdWVudGx5LiBPbmx5IHZhbGlkIG9uIHRoZVxuXHRcdCogbGFzdCBwcm9ibGVtIHBhdHRlcm4gaW4gYSBtdWx0aSBsaW5lIHByb2JsZW0gbWF0Y2hlci5cblx0XHQqL1xuXHRcdGxvb3A/OiBib29sZWFuO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIGV4dGVuZHMgSVByb2JsZW1QYXR0ZXJuIHtcblx0XHQvKipcblx0XHQqIFRoZSByZWd1bGFyIGV4cHJlc3Npb24gdG8gZmluZCBhIHByb2JsZW0gaW4gdGhlIGNvbnNvbGUgb3V0cHV0IG9mIGFuXG5cdFx0KiBleGVjdXRlZCB0YXNrLlxuXHRcdCovXG5cdFx0cmVnZXhwOiBzdHJpbmc7XG5cdH1cblxuXHRleHBvcnQgbmFtZXNwYWNlIENoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGU6IElQcm9ibGVtUGF0dGVybiA9IHZhbHVlIGFzIElQcm9ibGVtUGF0dGVybjtcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgVHlwZXMuaXNTdHJpbmcoY2FuZGlkYXRlLnJlZ2V4cCk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJTmFtZWRQcm9ibGVtUGF0dGVybiBleHRlbmRzIElQcm9ibGVtUGF0dGVybiB7XG5cdFx0LyoqXG5cdFx0ICogVGhlIG5hbWUgb2YgdGhlIHByb2JsZW0gcGF0dGVybi5cblx0XHQgKi9cblx0XHRuYW1lOiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBBIGh1bWFuIHJlYWRhYmxlIGxhYmVsXG5cdFx0ICovXG5cdFx0bGFiZWw/OiBzdHJpbmc7XG5cdH1cblxuXHRleHBvcnQgbmFtZXNwYWNlIE5hbWVkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElOYW1lZFByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZTogSU5hbWVkUHJvYmxlbVBhdHRlcm4gPSB2YWx1ZSBhcyBJTmFtZWRQcm9ibGVtUGF0dGVybjtcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgVHlwZXMuaXNTdHJpbmcoY2FuZGlkYXRlLm5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSU5hbWVkQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIGV4dGVuZHMgSU5hbWVkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdC8qKlxuXHRcdCogVGhlIHJlZ3VsYXIgZXhwcmVzc2lvbiB0byBmaW5kIGEgcHJvYmxlbSBpbiB0aGUgY29uc29sZSBvdXRwdXQgb2YgYW5cblx0XHQqIGV4ZWN1dGVkIHRhc2suXG5cdFx0Ki9cblx0XHRyZWdleHA6IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBuYW1lc3BhY2UgTmFtZWRDaGVja2VkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElOYW1lZENoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGU6IElOYW1lZFByb2JsZW1QYXR0ZXJuID0gdmFsdWUgYXMgSU5hbWVkUHJvYmxlbVBhdHRlcm47XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlICYmIE5hbWVkUHJvYmxlbVBhdHRlcm4uaXMoY2FuZGlkYXRlKSAmJiBUeXBlcy5pc1N0cmluZyhjYW5kaWRhdGUucmVnZXhwKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IElQcm9ibGVtUGF0dGVybltdO1xuXG5cdGV4cG9ydCBuYW1lc3BhY2UgTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4ge1xuXHRcdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIE11bHRpTGluZVByb2JsZW1QYXR0ZXJuIHtcblx0XHRcdHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4gPSBJQ2hlY2tlZFByb2JsZW1QYXR0ZXJuW107XG5cblx0ZXhwb3J0IG5hbWVzcGFjZSBNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0XHRpZiAoIU11bHRpTGluZVByb2JsZW1QYXR0ZXJuLmlzKHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdmFsdWUpIHtcblx0XHRcdFx0aWYgKCFDb25maWcuQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIElOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0LyoqXG5cdFx0ICogVGhlIG5hbWUgb2YgdGhlIHByb2JsZW0gcGF0dGVybi5cblx0XHQgKi9cblx0XHRuYW1lOiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBBIGh1bWFuIHJlYWRhYmxlIGxhYmVsXG5cdFx0ICovXG5cdFx0bGFiZWw/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgYWN0dWFsIHBhdHRlcm5zXG5cdFx0ICovXG5cdFx0cGF0dGVybnM6IE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybjtcblx0fVxuXG5cdGV4cG9ydCBuYW1lc3BhY2UgTmFtZWRNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4ge1xuXHRcdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyBJTmFtZWRNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm47XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlICYmIFR5cGVzLmlzU3RyaW5nKGNhbmRpZGF0ZS5uYW1lKSAmJiBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5wYXR0ZXJucykgJiYgTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLmlzKGNhbmRpZGF0ZS5wYXR0ZXJucyk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IHR5cGUgTmFtZWRQcm9ibGVtUGF0dGVybnMgPSAoQ29uZmlnLklOYW1lZFByb2JsZW1QYXR0ZXJuIHwgQ29uZmlnLklOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybilbXTtcblxuXHQvKipcblx0KiBBIHdhdGNoaW5nIHBhdHRlcm5cblx0Ki9cblx0ZXhwb3J0IGludGVyZmFjZSBJV2F0Y2hpbmdQYXR0ZXJuIHtcblx0XHQvKipcblx0XHQqIFRoZSBhY3R1YWwgcmVndWxhciBleHByZXNzaW9uXG5cdFx0Ki9cblx0XHRyZWdleHA/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIFRoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgZmlsZW5hbWUuIElmIHByb3ZpZGVkIHRoZSBleHByZXNzaW9uXG5cdFx0KiBpcyBtYXRjaGVkIGZvciB0aGF0IGZpbGUgb25seS5cblx0XHQqL1xuXHRcdGZpbGU/OiBudW1iZXI7XG5cdH1cblxuXHQvKipcblx0KiBBIGRlc2NyaXB0aW9uIHRvIHRyYWNrIHRoZSBzdGFydCBhbmQgZW5kIG9mIGEgd2F0Y2hpbmcgdGFzay5cblx0Ki9cblx0ZXhwb3J0IGludGVyZmFjZSBJQmFja2dyb3VuZE1vbml0b3Ige1xuXG5cdFx0LyoqXG5cdFx0KiBJZiBzZXQgdG8gdHJ1ZSB0aGUgd2F0Y2hlciBzdGFydHMgaW4gYWN0aXZlIG1vZGUuIFRoaXMgaXMgdGhlXG5cdFx0KiBzYW1lIGFzIG91dHB1dHRpbmcgYSBsaW5lIHRoYXQgbWF0Y2hlcyBiZWdpbnNQYXR0ZXJuIHdoZW4gdGhlXG5cdFx0KiB0YXNrIHN0YXJ0cy5cblx0XHQqL1xuXHRcdGFjdGl2ZU9uU3RhcnQ/OiBib29sZWFuO1xuXG5cdFx0LyoqXG5cdFx0KiBJZiBtYXRjaGVkIGluIHRoZSBvdXRwdXQgdGhlIHN0YXJ0IG9mIGEgd2F0Y2hpbmcgdGFzayBpcyBzaWduYWxlZC5cblx0XHQqL1xuXHRcdGJlZ2luc1BhdHRlcm4/OiBzdHJpbmcgfCBJV2F0Y2hpbmdQYXR0ZXJuO1xuXG5cdFx0LyoqXG5cdFx0KiBJZiBtYXRjaGVkIGluIHRoZSBvdXRwdXQgdGhlIGVuZCBvZiBhIHdhdGNoaW5nIHRhc2sgaXMgc2lnbmFsZWQuXG5cdFx0Ki9cblx0XHRlbmRzUGF0dGVybj86IHN0cmluZyB8IElXYXRjaGluZ1BhdHRlcm47XG5cdH1cblxuXHQvKipcblx0KiBBIGRlc2NyaXB0aW9uIG9mIGEgcHJvYmxlbSBtYXRjaGVyIHRoYXQgZGV0ZWN0cyBwcm9ibGVtc1xuXHQqIGluIGJ1aWxkIG91dHB1dC5cblx0Ki9cblx0ZXhwb3J0IGludGVyZmFjZSBQcm9ibGVtTWF0Y2hlciB7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgbmFtZSBvZiBhIGJhc2UgcHJvYmxlbSBtYXRjaGVyIHRvIHVzZS4gSWYgc3BlY2lmaWVkIHRoZVxuXHRcdCAqIGJhc2UgcHJvYmxlbSBtYXRjaGVyIHdpbGwgYmUgdXNlZCBhcyBhIHRlbXBsYXRlIGFuZCBwcm9wZXJ0aWVzXG5cdFx0ICogc3BlY2lmaWVkIGhlcmUgd2lsbCByZXBsYWNlIHByb3BlcnRpZXMgb2YgdGhlIGJhc2UgcHJvYmxlbVxuXHRcdCAqIG1hdGNoZXJcblx0XHQgKi9cblx0XHRiYXNlPzogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIG93bmVyIG9mIHRoZSBwcm9kdWNlZCBWU0NvZGUgcHJvYmxlbS4gVGhpcyBpcyB0eXBpY2FsbHlcblx0XHQgKiB0aGUgaWRlbnRpZmllciBvZiBhIFZTQ29kZSBsYW5ndWFnZSBzZXJ2aWNlIGlmIHRoZSBwcm9ibGVtcyBhcmVcblx0XHQgKiB0byBiZSBtZXJnZWQgd2l0aCB0aGUgb25lIHByb2R1Y2VkIGJ5IHRoZSBsYW5ndWFnZSBzZXJ2aWNlXG5cdFx0ICogb3IgYSBnZW5lcmF0ZWQgaW50ZXJuYWwgaWQuIERlZmF1bHRzIHRvIHRoZSBnZW5lcmF0ZWQgaW50ZXJuYWwgaWQuXG5cdFx0ICovXG5cdFx0b3duZXI/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQgKiBBIGh1bWFuLXJlYWRhYmxlIHN0cmluZyBkZXNjcmliaW5nIHRoZSBzb3VyY2Ugb2YgdGhpcyBwcm9ibGVtLlxuXHRcdCAqIEUuZy4gJ3R5cGVzY3JpcHQnIG9yICdzdXBlciBsaW50Jy5cblx0XHQgKi9cblx0XHRzb3VyY2U/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIFNwZWNpZmllcyB0byB3aGljaCBraW5kIG9mIGRvY3VtZW50cyB0aGUgcHJvYmxlbXMgZm91bmQgYnkgdGhpc1xuXHRcdCogbWF0Y2hlciBhcmUgYXBwbGllZC4gVmFsaWQgdmFsdWVzIGFyZTpcblx0XHQqXG5cdFx0KiAgIFwiYWxsRG9jdW1lbnRzXCI6IHByb2JsZW1zIGZvdW5kIGluIGFsbCBkb2N1bWVudHMgYXJlIGFwcGxpZWQuXG5cdFx0KiAgIFwib3BlbkRvY3VtZW50c1wiOiBwcm9ibGVtcyBmb3VuZCBpbiBkb2N1bWVudHMgdGhhdCBhcmUgb3BlblxuXHRcdCogICBhcmUgYXBwbGllZC5cblx0XHQqICAgXCJjbG9zZWREb2N1bWVudHNcIjogcHJvYmxlbXMgZm91bmQgaW4gY2xvc2VkIGRvY3VtZW50cyBhcmVcblx0XHQqICAgYXBwbGllZC5cblx0XHQqL1xuXHRcdGFwcGx5VG8/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIFRoZSBzZXZlcml0eSBvZiB0aGUgVlNDb2RlIHByb2JsZW0gcHJvZHVjZWQgYnkgdGhpcyBwcm9ibGVtIG1hdGNoZXIuXG5cdFx0KlxuXHRcdCogVmFsaWQgdmFsdWVzIGFyZTpcblx0XHQqICAgXCJlcnJvclwiOiB0byBwcm9kdWNlIGVycm9ycy5cblx0XHQqICAgXCJ3YXJuaW5nXCI6IHRvIHByb2R1Y2Ugd2FybmluZ3MuXG5cdFx0KiAgIFwiaW5mb1wiOiB0byBwcm9kdWNlIGluZm9zLlxuXHRcdCpcblx0XHQqIFRoZSB2YWx1ZSBpcyB1c2VkIGlmIGEgcGF0dGVybiBkb2Vzbid0IHNwZWNpZnkgYSBzZXZlcml0eSBtYXRjaCBncm91cC5cblx0XHQqIERlZmF1bHRzIHRvIFwiZXJyb3JcIiBpZiBvbWl0dGVkLlxuXHRcdCovXG5cdFx0c2V2ZXJpdHk/OiBzdHJpbmc7XG5cblx0XHQvKipcblx0XHQqIERlZmluZXMgaG93IGZpbGVuYW1lIHJlcG9ydGVkIGluIGEgcHJvYmxlbSBwYXR0ZXJuXG5cdFx0KiBzaG91bGQgYmUgcmVhZC4gVmFsaWQgdmFsdWVzIGFyZTpcblx0XHQqICAtIFwiYWJzb2x1dGVcIjogdGhlIGZpbGVuYW1lIGlzIGFsd2F5cyB0cmVhdGVkIGFic29sdXRlLlxuXHRcdCogIC0gXCJyZWxhdGl2ZVwiOiB0aGUgZmlsZW5hbWUgaXMgYWx3YXlzIHRyZWF0ZWQgcmVsYXRpdmUgdG9cblx0XHQqICAgIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LiBUaGlzIGlzIHRoZSBkZWZhdWx0LlxuXHRcdCogIC0gW1wicmVsYXRpdmVcIiwgXCJwYXRoIHZhbHVlXCJdOiB0aGUgZmlsZW5hbWUgaXMgYWx3YXlzXG5cdFx0KiAgICB0cmVhdGVkIHJlbGF0aXZlIHRvIHRoZSBnaXZlbiBwYXRoIHZhbHVlLlxuXHRcdCogIC0gXCJhdXRvZGV0ZWN0XCI6IHRoZSBmaWxlbmFtZSBpcyB0cmVhdGVkIHJlbGF0aXZlIHRvXG5cdFx0KiAgICB0aGUgY3VycmVudCB3b3Jrc3BhY2UgZGlyZWN0b3J5LCBhbmQgaWYgdGhlIGZpbGVcblx0XHQqICAgIGRvZXMgbm90IGV4aXN0LCBpdCBpcyB0cmVhdGVkIGFzIGFic29sdXRlLlxuXHRcdCogIC0gW1wiYXV0b2RldGVjdFwiLCBcInBhdGggdmFsdWVcIl06IHRoZSBmaWxlbmFtZSBpcyB0cmVhdGVkXG5cdFx0KiAgICByZWxhdGl2ZSB0byB0aGUgZ2l2ZW4gcGF0aCB2YWx1ZSwgYW5kIGlmIGl0IGRvZXMgbm90XG5cdFx0KiAgICBleGlzdCwgaXQgaXMgdHJlYXRlZCBhcyBhYnNvbHV0ZS5cblx0XHQqICAtIFtcInNlYXJjaFwiLCB7IGluY2x1ZGU/OiBcIlwiIHwgW107IGV4Y2x1ZGU/OiBcIlwiIHwgW10gfV06IFRoZSBmaWxlbmFtZVxuXHRcdCogICAgbmVlZHMgdG8gYmUgc2VhcmNoZWQgdW5kZXIgdGhlIGRpcmVjdG9yaWVzIG5hbWVkIGJ5IHRoZSBcImluY2x1ZGVcIlxuXHRcdCogICAgcHJvcGVydHkgYW5kIHRoZWlyIG5lc3RlZCBzdWJkaXJlY3Rvcmllcy4gV2l0aCBcImV4Y2x1ZGVcIiBwcm9wZXJ0eVxuXHRcdCogICAgcHJlc2VudCwgdGhlIGRpcmVjdG9yaWVzIHNob3VsZCBiZSByZW1vdmVkIGZyb20gdGhlIHNlYXJjaC4gV2hlblxuXHRcdCogICAgYGluY2x1ZGVgIGlzIG5vdCB1bnByb3ZpZGVkLCB0aGUgY3VycmVudCB3b3Jrc3BhY2UgZGlyZWN0b3J5IHNob3VsZFxuXHRcdCogICAgYmUgdXNlZCBhcyB0aGUgZGVmYXVsdC5cblx0XHQqL1xuXHRcdGZpbGVMb2NhdGlvbj86IFR5cGVzLlNpbmdsZU9yTWFueTxzdHJpbmc+IHwgWydzZWFyY2gnLCBTZWFyY2hGaWxlTG9jYXRpb25BcmdzXTtcblxuXHRcdC8qKlxuXHRcdCogVGhlIG5hbWUgb2YgYSBwcmVkZWZpbmVkIHByb2JsZW0gcGF0dGVybiwgdGhlIGlubGluZSBkZWZpbml0aW9uXG5cdFx0KiBvZiBhIHByb2JsZW0gcGF0dGVybiBvciBhbiBhcnJheSBvZiBwcm9ibGVtIHBhdHRlcm5zIHRvIG1hdGNoXG5cdFx0KiBwcm9ibGVtcyBzcHJlYWQgb3ZlciBtdWx0aXBsZSBsaW5lcy5cblx0XHQqL1xuXHRcdHBhdHRlcm4/OiBzdHJpbmcgfCBUeXBlcy5TaW5nbGVPck1hbnk8SVByb2JsZW1QYXR0ZXJuPjtcblxuXHRcdC8qKlxuXHRcdCogQSByZWd1bGFyIGV4cHJlc3Npb24gc2lnbmFsaW5nIHRoYXQgYSB3YXRjaGVkIHRhc2tzIGJlZ2lucyBleGVjdXRpbmdcblx0XHQqIHRyaWdnZXJlZCB0aHJvdWdoIGZpbGUgd2F0Y2hpbmcuXG5cdFx0Ki9cblx0XHR3YXRjaGVkVGFza0JlZ2luc1JlZ0V4cD86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogQSByZWd1bGFyIGV4cHJlc3Npb24gc2lnbmFsaW5nIHRoYXQgYSB3YXRjaGVkIHRhc2tzIGVuZHMgZXhlY3V0aW5nLlxuXHRcdCovXG5cdFx0d2F0Y2hlZFRhc2tFbmRzUmVnRXhwPzogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0ICogQGRlcHJlY2F0ZWQgVXNlIGJhY2tncm91bmQgaW5zdGVhZC5cblx0XHQgKi9cblx0XHR3YXRjaGluZz86IElCYWNrZ3JvdW5kTW9uaXRvcjtcblx0XHRiYWNrZ3JvdW5kPzogSUJhY2tncm91bmRNb25pdG9yO1xuXHR9XG5cblx0ZXhwb3J0IHR5cGUgU2VhcmNoRmlsZUxvY2F0aW9uQXJncyA9IHtcblx0XHRpbmNsdWRlPzogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz47XG5cdFx0ZXhjbHVkZT86IFR5cGVzLlNpbmdsZU9yTWFueTxzdHJpbmc+O1xuXHR9O1xuXG5cdGV4cG9ydCB0eXBlIFByb2JsZW1NYXRjaGVyVHlwZSA9IHN0cmluZyB8IFByb2JsZW1NYXRjaGVyIHwgQXJyYXk8c3RyaW5nIHwgUHJvYmxlbU1hdGNoZXI+O1xuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSU5hbWVkUHJvYmxlbU1hdGNoZXIgZXh0ZW5kcyBQcm9ibGVtTWF0Y2hlciB7XG5cdFx0LyoqXG5cdFx0KiBUaGlzIG5hbWUgY2FuIGJlIHVzZWQgdG8gcmVmZXIgdG8gdGhlXG5cdFx0KiBwcm9ibGVtIG1hdGNoZXIgZnJvbSB3aXRoaW4gYSB0YXNrLlxuXHRcdCovXG5cdFx0bmFtZTogc3RyaW5nO1xuXG5cdFx0LyoqXG5cdFx0ICogQSBodW1hbiByZWFkYWJsZSBsYWJlbC5cblx0XHQgKi9cblx0XHRsYWJlbD86IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc05hbWVkUHJvYmxlbU1hdGNoZXIodmFsdWU6IFByb2JsZW1NYXRjaGVyKTogdmFsdWUgaXMgSU5hbWVkUHJvYmxlbU1hdGNoZXIge1xuXHRcdHJldHVybiBUeXBlcy5pc1N0cmluZygoPElOYW1lZFByb2JsZW1NYXRjaGVyPnZhbHVlKS5uYW1lKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHJvYmxlbVBhdHRlcm5QYXJzZXIgZXh0ZW5kcyBQYXJzZXIge1xuXG5cdGNvbnN0cnVjdG9yKGxvZ2dlcjogSVByb2JsZW1SZXBvcnRlcikge1xuXHRcdHN1cGVyKGxvZ2dlcik7XG5cdH1cblxuXHRwdWJsaWMgcGFyc2UodmFsdWU6IENvbmZpZy5JUHJvYmxlbVBhdHRlcm4pOiBJUHJvYmxlbVBhdHRlcm47XG5cdHB1YmxpYyBwYXJzZSh2YWx1ZTogQ29uZmlnLk11bHRpTGluZVByb2JsZW1QYXR0ZXJuKTogTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm47XG5cdHB1YmxpYyBwYXJzZSh2YWx1ZTogQ29uZmlnLklOYW1lZFByb2JsZW1QYXR0ZXJuKTogSU5hbWVkUHJvYmxlbVBhdHRlcm47XG5cdHB1YmxpYyBwYXJzZSh2YWx1ZTogQ29uZmlnLklOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybik6IElOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuO1xuXHRwdWJsaWMgcGFyc2UodmFsdWU6IENvbmZpZy5JUHJvYmxlbVBhdHRlcm4gfCBDb25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gfCBDb25maWcuSU5hbWVkUHJvYmxlbVBhdHRlcm4gfCBDb25maWcuSU5hbWVkTXVsdGlMaW5lQ2hlY2tlZFByb2JsZW1QYXR0ZXJuKTogSVByb2JsZW1QYXR0ZXJuIHwgTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gfCBJTmFtZWRQcm9ibGVtUGF0dGVybiB8IElOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuIHwgbnVsbCB7XG5cdFx0aWYgKENvbmZpZy5OYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybi5pcyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU5hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4odmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoQ29uZmlnLk11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybi5pcyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU11bHRpTGluZVByb2JsZW1QYXR0ZXJuKHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKENvbmZpZy5OYW1lZENoZWNrZWRQcm9ibGVtUGF0dGVybi5pcyh2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY3JlYXRlU2luZ2xlUHJvYmxlbVBhdHRlcm4odmFsdWUpIGFzIElOYW1lZFByb2JsZW1QYXR0ZXJuO1xuXHRcdFx0cmVzdWx0Lm5hbWUgPSB2YWx1ZS5uYW1lO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKENvbmZpZy5DaGVja2VkUHJvYmxlbVBhdHRlcm4uaXModmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTaW5nbGVQcm9ibGVtUGF0dGVybih2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLnByb2JsZW1QYXR0ZXJuLm1pc3NpbmdSZWdFeHAnLCAnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBtaXNzaW5nIGEgcmVndWxhciBleHByZXNzaW9uLicpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2luZ2xlUHJvYmxlbVBhdHRlcm4odmFsdWU6IENvbmZpZy5JQ2hlY2tlZFByb2JsZW1QYXR0ZXJuKTogSVByb2JsZW1QYXR0ZXJuIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5kb0NyZWF0ZVNpbmdsZVByb2JsZW1QYXR0ZXJuKHZhbHVlLCB0cnVlKTtcblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSBpZiAocmVzdWx0LmtpbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LmtpbmQgPSBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy52YWxpZGF0ZVByb2JsZW1QYXR0ZXJuKFtyZXN1bHRdKSA/IHJlc3VsdCA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4odmFsdWU6IENvbmZpZy5JTmFtZWRNdWx0aUxpbmVDaGVja2VkUHJvYmxlbVBhdHRlcm4pOiBJTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiB8IG51bGwge1xuXHRcdGNvbnN0IHZhbGlkUGF0dGVybnMgPSB0aGlzLmNyZWF0ZU11bHRpTGluZVByb2JsZW1QYXR0ZXJuKHZhbHVlLnBhdHRlcm5zKTtcblx0XHRpZiAoIXZhbGlkUGF0dGVybnMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRuYW1lOiB2YWx1ZS5uYW1lLFxuXHRcdFx0bGFiZWw6IHZhbHVlLmxhYmVsID8gdmFsdWUubGFiZWwgOiB2YWx1ZS5uYW1lLFxuXHRcdFx0cGF0dGVybnM6IHZhbGlkUGF0dGVybnNcblx0XHR9O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU11bHRpTGluZVByb2JsZW1QYXR0ZXJuKHZhbHVlczogQ29uZmlnLk11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybik6IE11bHRpTGluZVByb2JsZW1QYXR0ZXJuIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBNdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gdGhpcy5kb0NyZWF0ZVNpbmdsZVByb2JsZW1QYXR0ZXJuKHZhbHVlc1tpXSwgZmFsc2UpO1xuXHRcdFx0aWYgKHBhdHRlcm4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChpIDwgdmFsdWVzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0aWYgKCFUeXBlcy5pc1VuZGVmaW5lZChwYXR0ZXJuLmxvb3ApICYmIHBhdHRlcm4ubG9vcCkge1xuXHRcdFx0XHRcdHBhdHRlcm4ubG9vcCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLmxvb3BQcm9wZXJ0eS5ub3RMYXN0JywgJ1RoZSBsb29wIHByb3BlcnR5IGlzIG9ubHkgc3VwcG9ydGVkIG9uIHRoZSBsYXN0IGxpbmUgbWF0Y2hlci4nKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHBhdHRlcm4pO1xuXHRcdH1cblx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblBhcnNlci5wcm9ibGVtUGF0dGVybi5lbXB0eVBhdHRlcm4nLCAnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBpbnZhbGlkLiBJdCBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIHBhdHRlcm4uJykpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHRbMF0ua2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHRbMF0ua2luZCA9IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZhbGlkYXRlUHJvYmxlbVBhdHRlcm4ocmVzdWx0KSA/IHJlc3VsdCA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGRvQ3JlYXRlU2luZ2xlUHJvYmxlbVBhdHRlcm4odmFsdWU6IENvbmZpZy5JQ2hlY2tlZFByb2JsZW1QYXR0ZXJuLCBzZXREZWZhdWx0czogYm9vbGVhbik6IElQcm9ibGVtUGF0dGVybiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVnZXhwID0gdGhpcy5jcmVhdGVSZWd1bGFyRXhwcmVzc2lvbih2YWx1ZS5yZWdleHApO1xuXHRcdGlmIChyZWdleHAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdDogSVByb2JsZW1QYXR0ZXJuID0geyByZWdleHAgfTtcblx0XHRpZiAodmFsdWUua2luZCkge1xuXHRcdFx0cmVzdWx0LmtpbmQgPSBQcm9ibGVtTG9jYXRpb25LaW5kLmZyb21TdHJpbmcodmFsdWUua2luZCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY29weVByb3BlcnR5KHJlc3VsdDogSVByb2JsZW1QYXR0ZXJuLCBzb3VyY2U6IENvbmZpZy5JUHJvYmxlbVBhdHRlcm4sIHJlc3VsdEtleToga2V5b2YgSVByb2JsZW1QYXR0ZXJuLCBzb3VyY2VLZXk6IGtleW9mIENvbmZpZy5JUHJvYmxlbVBhdHRlcm4pIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gc291cmNlW3NvdXJjZUtleV07XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHQocmVzdWx0IGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Jlc3VsdEtleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29weVByb3BlcnR5KHJlc3VsdCwgdmFsdWUsICdmaWxlJywgJ2ZpbGUnKTtcblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2xvY2F0aW9uJywgJ2xvY2F0aW9uJyk7XG5cdFx0Y29weVByb3BlcnR5KHJlc3VsdCwgdmFsdWUsICdsaW5lJywgJ2xpbmUnKTtcblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2NoYXJhY3RlcicsICdjb2x1bW4nKTtcblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2VuZExpbmUnLCAnZW5kTGluZScpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnZW5kQ2hhcmFjdGVyJywgJ2VuZENvbHVtbicpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnc2V2ZXJpdHknLCAnc2V2ZXJpdHknKTtcblx0XHRjb3B5UHJvcGVydHkocmVzdWx0LCB2YWx1ZSwgJ2NvZGUnLCAnY29kZScpO1xuXHRcdGNvcHlQcm9wZXJ0eShyZXN1bHQsIHZhbHVlLCAnbWVzc2FnZScsICdtZXNzYWdlJyk7XG5cdFx0aWYgKHZhbHVlLmxvb3AgPT09IHRydWUgfHwgdmFsdWUubG9vcCA9PT0gZmFsc2UpIHtcblx0XHRcdHJlc3VsdC5sb29wID0gdmFsdWUubG9vcDtcblx0XHR9XG5cdFx0aWYgKHNldERlZmF1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0LmxvY2F0aW9uIHx8IHJlc3VsdC5raW5kID09PSBQcm9ibGVtTG9jYXRpb25LaW5kLkZpbGUpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlOiBQYXJ0aWFsPElQcm9ibGVtUGF0dGVybj4gPSB7XG5cdFx0XHRcdFx0ZmlsZTogMSxcblx0XHRcdFx0XHRtZXNzYWdlOiAwXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJlc3VsdCA9IE9iamVjdHMubWl4aW4ocmVzdWx0LCBkZWZhdWx0VmFsdWUsIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZTogUGFydGlhbDxJUHJvYmxlbVBhdHRlcm4+ID0ge1xuXHRcdFx0XHRcdGZpbGU6IDEsXG5cdFx0XHRcdFx0bGluZTogMixcblx0XHRcdFx0XHRjaGFyYWN0ZXI6IDMsXG5cdFx0XHRcdFx0bWVzc2FnZTogMFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXN1bHQgPSBPYmplY3RzLm1peGluKHJlc3VsdCwgZGVmYXVsdFZhbHVlLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlUHJvYmxlbVBhdHRlcm4odmFsdWVzOiBJUHJvYmxlbVBhdHRlcm5bXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdmFsdWVzIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLnByb2JsZW1QYXR0ZXJuLmVtcHR5UGF0dGVybicsICdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgcGF0dGVybi4nKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCBmaWxlOiBib29sZWFuID0gZmFsc2UsIG1lc3NhZ2U6IGJvb2xlYW4gPSBmYWxzZSwgbG9jYXRpb246IGJvb2xlYW4gPSBmYWxzZSwgbGluZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGxvY2F0aW9uS2luZCA9ICh2YWx1ZXNbMF0ua2luZCA9PT0gdW5kZWZpbmVkKSA/IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24gOiB2YWx1ZXNbMF0ua2luZDtcblxuXHRcdHZhbHVlcy5mb3JFYWNoKChwYXR0ZXJuLCBpKSA9PiB7XG5cdFx0XHRpZiAoaSAhPT0gMCAmJiBwYXR0ZXJuLmtpbmQpIHtcblx0XHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIucHJvYmxlbVBhdHRlcm4ua2luZFByb3BlcnR5Lm5vdEZpcnN0JywgJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gVGhlIGtpbmQgcHJvcGVydHkgbXVzdCBiZSBwcm92aWRlZCBvbmx5IGluIHRoZSBmaXJzdCBlbGVtZW50JykpO1xuXHRcdFx0fVxuXHRcdFx0ZmlsZSA9IGZpbGUgfHwgIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm4uZmlsZSk7XG5cdFx0XHRtZXNzYWdlID0gbWVzc2FnZSB8fCAhVHlwZXMuaXNVbmRlZmluZWQocGF0dGVybi5tZXNzYWdlKTtcblx0XHRcdGxvY2F0aW9uID0gbG9jYXRpb24gfHwgIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm4ubG9jYXRpb24pO1xuXHRcdFx0bGluZSA9IGxpbmUgfHwgIVR5cGVzLmlzVW5kZWZpbmVkKHBhdHRlcm4ubGluZSk7XG5cdFx0fSk7XG5cdFx0aWYgKCEoZmlsZSAmJiBtZXNzYWdlKSkge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXIucHJvYmxlbVBhdHRlcm4ubWlzc2luZ1Byb3BlcnR5JywgJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gSXQgbXVzdCBoYXZlIGF0IGxlYXN0IGhhdmUgYSBmaWxlIGFuZCBhIG1lc3NhZ2UuJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAobG9jYXRpb25LaW5kID09PSBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uICYmICEobG9jYXRpb24gfHwgbGluZSkpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLnByb2JsZW1QYXR0ZXJuLm1pc3NpbmdMb2NhdGlvbicsICdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgZWl0aGVyIGhhdmUga2luZDogXCJmaWxlXCIgb3IgaGF2ZSBhIGxpbmUgb3IgbG9jYXRpb24gbWF0Y2ggZ3JvdXAuJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVndWxhckV4cHJlc3Npb24odmFsdWU6IHN0cmluZyk6IFJlZ0V4cCB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdDogUmVnRXhwIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBuZXcgUmVnRXhwKHZhbHVlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUGFyc2VyLmludmFsaWRSZWdleHAnLCAnRXJyb3I6IFRoZSBzdHJpbmcgezB9IGlzIG5vdCBhIHZhbGlkIHJlZ3VsYXIgZXhwcmVzc2lvbi5cXG4nLCB2YWx1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SZWdpc3RyeVJlcG9ydGVyIGltcGxlbWVudHMgSVByb2JsZW1SZXBvcnRlciB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX2NvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgcHJpdmF0ZSBfdmFsaWRhdGlvblN0YXR1czogVmFsaWRhdGlvblN0YXR1cyA9IG5ldyBWYWxpZGF0aW9uU3RhdHVzKCkpIHtcblx0fVxuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuSW5mbztcblx0XHR0aGlzLl9jb2xsZWN0b3IuaW5mbyhtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyB3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuV2FybmluZztcblx0XHR0aGlzLl9jb2xsZWN0b3Iud2FybihtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBlcnJvcihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLkVycm9yO1xuXHRcdHRoaXMuX2NvbGxlY3Rvci5lcnJvcihtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBmYXRhbChtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLkZhdGFsO1xuXHRcdHRoaXMuX2NvbGxlY3Rvci5lcnJvcihtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3RhdHVzKCk6IFZhbGlkYXRpb25TdGF0dXMge1xuXHRcdHJldHVybiB0aGlzLl92YWxpZGF0aW9uU3RhdHVzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2NoZW1hcyB7XG5cblx0ZXhwb3J0IGNvbnN0IFByb2JsZW1QYXR0ZXJuOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRkZWZhdWx0OiB7XG5cdFx0XHRyZWdleHA6ICdeKFteXFxcXFxcXFxzXS4qKVxcXFxcXFxcKChcXFxcXFxcXGQrLFxcXFxcXFxcZCspXFxcXFxcXFwpOlxcXFxcXFxccyooLiopJCcsXG5cdFx0XHRmaWxlOiAxLFxuXHRcdFx0bG9jYXRpb246IDIsXG5cdFx0XHRtZXNzYWdlOiAzXG5cdFx0fSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0cmVnZXhwOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLnJlZ2V4cCcsICdUaGUgcmVndWxhciBleHByZXNzaW9uIHRvIGZpbmQgYW4gZXJyb3IsIHdhcm5pbmcgb3IgaW5mbyBpbiB0aGUgb3V0cHV0LicpXG5cdFx0XHR9LFxuXHRcdFx0a2luZDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5raW5kJywgJ3doZXRoZXIgdGhlIHBhdHRlcm4gbWF0Y2hlcyBhIGxvY2F0aW9uIChmaWxlIGFuZCBsaW5lKSBvciBvbmx5IGEgZmlsZS4nKVxuXHRcdFx0fSxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmZpbGUnLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBmaWxlbmFtZS4gSWYgb21pdHRlZCAxIGlzIHVzZWQuJylcblx0XHRcdH0sXG5cdFx0XHRsb2NhdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEubG9jYXRpb24nLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtXFwncyBsb2NhdGlvbi4gVmFsaWQgbG9jYXRpb24gcGF0dGVybnMgYXJlOiAobGluZSksIChsaW5lLGNvbHVtbikgYW5kIChzdGFydExpbmUsc3RhcnRDb2x1bW4sZW5kTGluZSxlbmRDb2x1bW4pLiBJZiBvbWl0dGVkIChsaW5lLGNvbHVtbikgaXMgYXNzdW1lZC4nKVxuXHRcdFx0fSxcblx0XHRcdGxpbmU6IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmxpbmUnLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtXFwncyBsaW5lLiBEZWZhdWx0cyB0byAyJylcblx0XHRcdH0sXG5cdFx0XHRjb2x1bW46IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLmNvbHVtbicsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW1cXCdzIGxpbmUgY2hhcmFjdGVyLiBEZWZhdWx0cyB0byAzJylcblx0XHRcdH0sXG5cdFx0XHRlbmRMaW5lOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5lbmRMaW5lJywgJ1RoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbVxcJ3MgZW5kIGxpbmUuIERlZmF1bHRzIHRvIHVuZGVmaW5lZCcpXG5cdFx0XHR9LFxuXHRcdFx0ZW5kQ29sdW1uOiB7XG5cdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblNjaGVtYS5lbmRDb2x1bW4nLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBwcm9ibGVtXFwncyBlbmQgbGluZSBjaGFyYWN0ZXIuIERlZmF1bHRzIHRvIHVuZGVmaW5lZCcpXG5cdFx0XHR9LFxuXHRcdFx0c2V2ZXJpdHk6IHtcblx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuU2NoZW1hLnNldmVyaXR5JywgJ1RoZSBtYXRjaCBncm91cCBpbmRleCBvZiB0aGUgcHJvYmxlbVxcJ3Mgc2V2ZXJpdHkuIERlZmF1bHRzIHRvIHVuZGVmaW5lZCcpXG5cdFx0XHR9LFxuXHRcdFx0Y29kZToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEuY29kZScsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIHByb2JsZW1cXCdzIGNvZGUuIERlZmF1bHRzIHRvIHVuZGVmaW5lZCcpXG5cdFx0XHR9LFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEubWVzc2FnZScsICdUaGUgbWF0Y2ggZ3JvdXAgaW5kZXggb2YgdGhlIG1lc3NhZ2UuIElmIG9taXR0ZWQgaXQgZGVmYXVsdHMgdG8gNCBpZiBsb2NhdGlvbiBpcyBzcGVjaWZpZWQuIE90aGVyd2lzZSBpdCBkZWZhdWx0cyB0byA1LicpXG5cdFx0XHR9LFxuXHRcdFx0bG9vcDoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbVBhdHRlcm5TY2hlbWEubG9vcCcsICdJbiBhIG11bHRpIGxpbmUgbWF0Y2hlciBsb29wIGluZGljYXRlZCB3aGV0aGVyIHRoaXMgcGF0dGVybiBpcyBleGVjdXRlZCBpbiBhIGxvb3AgYXMgbG9uZyBhcyBpdCBtYXRjaGVzLiBDYW4gb25seSBzcGVjaWZpZWQgb24gYSBsYXN0IHBhdHRlcm4gaW4gYSBtdWx0aSBsaW5lIHBhdHRlcm4uJylcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IE5hbWVkUHJvYmxlbVBhdHRlcm46IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUoUHJvYmxlbVBhdHRlcm4pO1xuXHROYW1lZFByb2JsZW1QYXR0ZXJuLnByb3BlcnRpZXMgPSBPYmplY3RzLmRlZXBDbG9uZShOYW1lZFByb2JsZW1QYXR0ZXJuLnByb3BlcnRpZXMpIHx8IHt9O1xuXHROYW1lZFByb2JsZW1QYXR0ZXJuLnByb3BlcnRpZXNbJ25hbWUnXSA9IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ05hbWVkUHJvYmxlbVBhdHRlcm5TY2hlbWEubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcHJvYmxlbSBwYXR0ZXJuLicpXG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IE11bHRpTGluZVByb2JsZW1QYXR0ZXJuOiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiBQcm9ibGVtUGF0dGVyblxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuOiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0bmFtZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdOYW1lZE11bHRpTGluZVByb2JsZW1QYXR0ZXJuU2NoZW1hLm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIHByb2JsZW0gbXVsdGkgbGluZSBwcm9ibGVtIHBhdHRlcm4uJylcblx0XHRcdH0sXG5cdFx0XHRwYXR0ZXJuczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ05hbWVkTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm5TY2hlbWEucGF0dGVybnMnLCAnVGhlIGFjdHVhbCBwYXR0ZXJucy4nKSxcblx0XHRcdFx0aXRlbXM6IFByb2JsZW1QYXR0ZXJuXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBXYXRjaGluZ1BhdHRlcm46IElKU09OU2NoZW1hID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRyZWdleHA6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnV2F0Y2hpbmdQYXR0ZXJuU2NoZW1hLnJlZ2V4cCcsICdUaGUgcmVndWxhciBleHByZXNzaW9uIHRvIGRldGVjdCB0aGUgYmVnaW4gb3IgZW5kIG9mIGEgYmFja2dyb3VuZCB0YXNrLicpXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZToge1xuXHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnV2F0Y2hpbmdQYXR0ZXJuU2NoZW1hLmZpbGUnLCAnVGhlIG1hdGNoIGdyb3VwIGluZGV4IG9mIHRoZSBmaWxlbmFtZS4gQ2FuIGJlIG9taXR0ZWQuJylcblx0XHRcdH0sXG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBQYXR0ZXJuVHlwZTogSUpTT05TY2hlbWEgPSB7XG5cdFx0YW55T2Y6IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUGF0dGVyblR5cGVTY2hlbWEubmFtZScsICdUaGUgbmFtZSBvZiBhIGNvbnRyaWJ1dGVkIG9yIHByZWRlZmluZWQgcGF0dGVybicpXG5cdFx0XHR9LFxuXHRcdFx0U2NoZW1hcy5Qcm9ibGVtUGF0dGVybixcblx0XHRcdFNjaGVtYXMuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm5cblx0XHRdLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUGF0dGVyblR5cGVTY2hlbWEuZGVzY3JpcHRpb24nLCAnQSBwcm9ibGVtIHBhdHRlcm4gb3IgdGhlIG5hbWUgb2YgYSBjb250cmlidXRlZCBvciBwcmVkZWZpbmVkIHByb2JsZW0gcGF0dGVybi4gQ2FuIGJlIG9taXR0ZWQgaWYgYmFzZSBpcyBzcGVjaWZpZWQuJylcblx0fTtcblxuXHRleHBvcnQgY29uc3QgUHJvYmxlbU1hdGNoZXI6IElKU09OU2NoZW1hID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRiYXNlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLmJhc2UnLCAnVGhlIG5hbWUgb2YgYSBiYXNlIHByb2JsZW0gbWF0Y2hlciB0byB1c2UuJylcblx0XHRcdH0sXG5cdFx0XHRvd25lcjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5vd25lcicsICdUaGUgb3duZXIgb2YgdGhlIHByb2JsZW0gaW5zaWRlIENvZGUuIENhbiBiZSBvbWl0dGVkIGlmIGJhc2UgaXMgc3BlY2lmaWVkLiBEZWZhdWx0cyB0byBcXCdleHRlcm5hbFxcJyBpZiBvbWl0dGVkIGFuZCBiYXNlIGlzIG5vdCBzcGVjaWZpZWQuJylcblx0XHRcdH0sXG5cdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuc291cmNlJywgJ0EgaHVtYW4tcmVhZGFibGUgc3RyaW5nIGRlc2NyaWJpbmcgdGhlIHNvdXJjZSBvZiB0aGlzIGRpYWdub3N0aWMsIGUuZy4gXFwndHlwZXNjcmlwdFxcJyBvciBcXCdzdXBlciBsaW50XFwnLicpXG5cdFx0XHR9LFxuXHRcdFx0c2V2ZXJpdHk6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnZXJyb3InLCAnd2FybmluZycsICdpbmZvJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuc2V2ZXJpdHknLCAnVGhlIGRlZmF1bHQgc2V2ZXJpdHkgZm9yIGNhcHR1cmVzIHByb2JsZW1zLiBJcyB1c2VkIGlmIHRoZSBwYXR0ZXJuIGRvZXNuXFwndCBkZWZpbmUgYSBtYXRjaCBncm91cCBmb3Igc2V2ZXJpdHkuJylcblx0XHRcdH0sXG5cdFx0XHRhcHBseVRvOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2FsbERvY3VtZW50cycsICdvcGVuRG9jdW1lbnRzJywgJ2Nsb3NlZERvY3VtZW50cyddLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLmFwcGx5VG8nLCAnQ29udHJvbHMgaWYgYSBwcm9ibGVtIHJlcG9ydGVkIG9uIGEgdGV4dCBkb2N1bWVudCBpcyBhcHBsaWVkIG9ubHkgdG8gb3BlbiwgY2xvc2VkIG9yIGFsbCBkb2N1bWVudHMuJylcblx0XHRcdH0sXG5cdFx0XHRwYXR0ZXJuOiBQYXR0ZXJuVHlwZSxcblx0XHRcdGZpbGVMb2NhdGlvbjoge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZW51bTogWydhYnNvbHV0ZScsICdyZWxhdGl2ZScsICdhdXRvRGV0ZWN0JywgJ3NlYXJjaCddXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0cHJlZml4SXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnYWJzb2x1dGUnLCAncmVsYXRpdmUnLCAnYXV0b0RldGVjdCcsICdzZWFyY2gnXVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdG1pbkl0ZW1zOiAxLFxuXHRcdFx0XHRcdFx0bWF4SXRlbXM6IDEsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsSXRlbXM6IGZhbHNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0cHJlZml4SXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydyZWxhdGl2ZScsICdhdXRvRGV0ZWN0J10gfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdG1pbkl0ZW1zOiAyLFxuXHRcdFx0XHRcdFx0bWF4SXRlbXM6IDIsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsSXRlbXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0XHRcdFx0WydyZWxhdGl2ZScsICcke3dvcmtzcGFjZUZvbGRlcn0nXSxcblx0XHRcdFx0XHRcdFx0WydhdXRvRGV0ZWN0JywgJyR7d29ya3NwYWNlRm9sZGVyfSddLFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdHByZWZpeEl0ZW1zOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnc2VhcmNoJ10gfSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCdpbmNsdWRlJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0J2V4Y2x1ZGUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydpbmNsdWRlJ11cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdG1pbkl0ZW1zOiAyLFxuXHRcdFx0XHRcdFx0bWF4SXRlbXM6IDIsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsSXRlbXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0XHRcdFx0WydzZWFyY2gnLCB7ICdpbmNsdWRlJzogWycke3dvcmtzcGFjZUZvbGRlcn0nXSB9XSxcblx0XHRcdFx0XHRcdFx0WydzZWFyY2gnLCB7ICdpbmNsdWRlJzogWycke3dvcmtzcGFjZUZvbGRlcn0nXSwgJ2V4Y2x1ZGUnOiBbXSB9XVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuZmlsZUxvY2F0aW9uJywgJ0RlZmluZXMgaG93IGZpbGUgbmFtZXMgcmVwb3J0ZWQgaW4gYSBwcm9ibGVtIHBhdHRlcm4gc2hvdWxkIGJlIGludGVycHJldGVkLiBBIHJlbGF0aXZlIGZpbGVMb2NhdGlvbiBtYXkgYmUgYW4gYXJyYXksIHdoZXJlIHRoZSBzZWNvbmQgZWxlbWVudCBvZiB0aGUgYXJyYXkgaXMgdGhlIHBhdGggb2YgdGhlIHJlbGF0aXZlIGZpbGUgbG9jYXRpb24uIFRoZSBzZWFyY2ggZmlsZUxvY2F0aW9uIG1vZGUsIHBlcmZvcm1zIGEgZGVlcCAoYW5kLCBwb3NzaWJseSwgaGVhdnkpIGZpbGUgc3lzdGVtIHNlYXJjaCB3aXRoaW4gdGhlIGRpcmVjdG9yaWVzIHNwZWNpZmllZCBieSB0aGUgaW5jbHVkZS9leGNsdWRlIHByb3BlcnRpZXMgb2YgdGhlIHNlY29uZCBlbGVtZW50IChvciB0aGUgY3VycmVudCB3b3Jrc3BhY2UgZGlyZWN0b3J5IGlmIG5vdCBzcGVjaWZpZWQpLicpXG5cdFx0XHR9LFxuXHRcdFx0YmFja2dyb3VuZDoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLmJhY2tncm91bmQnLCAnUGF0dGVybnMgdG8gdHJhY2sgdGhlIGJlZ2luIGFuZCBlbmQgb2YgYSBtYXRjaGVyIGFjdGl2ZSBvbiBhIGJhY2tncm91bmQgdGFzay4nKSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFjdGl2ZU9uU3RhcnQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEuYmFja2dyb3VuZC5hY3RpdmVPblN0YXJ0JywgJ0lmIHNldCB0byB0cnVlIHRoZSBiYWNrZ3JvdW5kIG1vbml0b3Igc3RhcnRzIGluIGFjdGl2ZSBtb2RlLiBUaGlzIGlzIHRoZSBzYW1lIGFzIG91dHB1dHRpbmcgYSBsaW5lIHRoYXQgbWF0Y2hlcyBiZWdpbnNQYXR0ZXJuIHdoZW4gdGhlIHRhc2sgc3RhcnRzLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRiZWdpbnNQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0U2NoZW1hcy5XYXRjaGluZ1BhdHRlcm5cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLmJhY2tncm91bmQuYmVnaW5zUGF0dGVybicsICdJZiBtYXRjaGVkIGluIHRoZSBvdXRwdXQgdGhlIHN0YXJ0IG9mIGEgYmFja2dyb3VuZCB0YXNrIGlzIHNpZ25hbGVkLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlbmRzUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFNjaGVtYXMuV2F0Y2hpbmdQYXR0ZXJuXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS5iYWNrZ3JvdW5kLmVuZHNQYXR0ZXJuJywgJ0lmIG1hdGNoZWQgaW4gdGhlIG91dHB1dCB0aGUgZW5kIG9mIGEgYmFja2dyb3VuZCB0YXNrIGlzIHNpZ25hbGVkLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0d2F0Y2hpbmc6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJTY2hlbWEud2F0Y2hpbmcuZGVwcmVjYXRlZCcsICdUaGUgd2F0Y2hpbmcgcHJvcGVydHkgaXMgZGVwcmVjYXRlZC4gVXNlIGJhY2tncm91bmQgaW5zdGVhZC4nKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGluZycsICdQYXR0ZXJucyB0byB0cmFjayB0aGUgYmVnaW4gYW5kIGVuZCBvZiBhIHdhdGNoaW5nIG1hdGNoZXIuJyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhY3RpdmVPblN0YXJ0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoaW5nLmFjdGl2ZU9uU3RhcnQnLCAnSWYgc2V0IHRvIHRydWUgdGhlIHdhdGNoZXIgc3RhcnRzIGluIGFjdGl2ZSBtb2RlLiBUaGlzIGlzIHRoZSBzYW1lIGFzIG91dHB1dHRpbmcgYSBsaW5lIHRoYXQgbWF0Y2hlcyBiZWdpbnNQYXR0ZXJuIHdoZW4gdGhlIHRhc2sgc3RhcnRzLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRiZWdpbnNQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0U2NoZW1hcy5XYXRjaGluZ1BhdHRlcm5cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoaW5nLmJlZ2luc1BhdHRlcm4nLCAnSWYgbWF0Y2hlZCBpbiB0aGUgb3V0cHV0IHRoZSBzdGFydCBvZiBhIHdhdGNoaW5nIHRhc2sgaXMgc2lnbmFsZWQuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVuZHNQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0U2NoZW1hcy5XYXRjaGluZ1BhdHRlcm5cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyU2NoZW1hLndhdGNoaW5nLmVuZHNQYXR0ZXJuJywgJ0lmIG1hdGNoZWQgaW4gdGhlIG91dHB1dCB0aGUgZW5kIG9mIGEgd2F0Y2hpbmcgdGFzayBpcyBzaWduYWxlZC4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRleHBvcnQgY29uc3QgTGVnYWN5UHJvYmxlbU1hdGNoZXI6IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUoUHJvYmxlbU1hdGNoZXIpO1xuXHRMZWdhY3lQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzID0gT2JqZWN0cy5kZWVwQ2xvbmUoTGVnYWN5UHJvYmxlbU1hdGNoZXIucHJvcGVydGllcykgfHwge307XG5cdExlZ2FjeVByb2JsZW1NYXRjaGVyLnByb3BlcnRpZXNbJ3dhdGNoZWRUYXNrQmVnaW5zUmVnRXhwJ10gPSB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnTGVnYWN5UHJvYmxlbU1hdGNoZXJTY2hlbWEud2F0Y2hlZEJlZ2luLmRlcHJlY2F0ZWQnLCAnVGhpcyBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIHdhdGNoaW5nIHByb3BlcnR5IGluc3RlYWQuJyksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdMZWdhY3lQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGVkQmVnaW4nLCAnQSByZWd1bGFyIGV4cHJlc3Npb24gc2lnbmFsaW5nIHRoYXQgYSB3YXRjaGVkIHRhc2tzIGJlZ2lucyBleGVjdXRpbmcgdHJpZ2dlcmVkIHRocm91Z2ggZmlsZSB3YXRjaGluZy4nKVxuXHR9O1xuXHRMZWdhY3lQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzWyd3YXRjaGVkVGFza0VuZHNSZWdFeHAnXSA9IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdMZWdhY3lQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGVkRW5kLmRlcHJlY2F0ZWQnLCAnVGhpcyBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIHdhdGNoaW5nIHByb3BlcnR5IGluc3RlYWQuJyksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdMZWdhY3lQcm9ibGVtTWF0Y2hlclNjaGVtYS53YXRjaGVkRW5kJywgJ0EgcmVndWxhciBleHByZXNzaW9uIHNpZ25hbGluZyB0aGF0IGEgd2F0Y2hlZCB0YXNrcyBlbmRzIGV4ZWN1dGluZy4nKVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBOYW1lZFByb2JsZW1NYXRjaGVyOiBJSlNPTlNjaGVtYSA9IE9iamVjdHMuZGVlcENsb25lKFByb2JsZW1NYXRjaGVyKTtcblx0TmFtZWRQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzID0gT2JqZWN0cy5kZWVwQ2xvbmUoTmFtZWRQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzKSB8fCB7fTtcblx0TmFtZWRQcm9ibGVtTWF0Y2hlci5wcm9wZXJ0aWVzLm5hbWUgPSB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdOYW1lZFByb2JsZW1NYXRjaGVyU2NoZW1hLm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIHByb2JsZW0gbWF0Y2hlciB1c2VkIHRvIHJlZmVyIHRvIGl0LicpXG5cdH07XG5cdE5hbWVkUHJvYmxlbU1hdGNoZXIucHJvcGVydGllcy5sYWJlbCA9IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ05hbWVkUHJvYmxlbU1hdGNoZXJTY2hlbWEubGFiZWwnLCAnQSBodW1hbiByZWFkYWJsZSBsYWJlbCBvZiB0aGUgcHJvYmxlbSBtYXRjaGVyLicpXG5cdH07XG59XG5cbmNvbnN0IHByb2JsZW1QYXR0ZXJuRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxDb25maWcuTmFtZWRQcm9ibGVtUGF0dGVybnM+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdwcm9ibGVtUGF0dGVybnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtUGF0dGVybkV4dFBvaW50JywgJ0NvbnRyaWJ1dGVzIHByb2JsZW0gcGF0dGVybnMnKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRTY2hlbWFzLk5hbWVkUHJvYmxlbVBhdHRlcm4sXG5cdFx0XHRcdFNjaGVtYXMuTmFtZWRNdWx0aUxpbmVQcm9ibGVtUGF0dGVyblxuXHRcdFx0XVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2JsZW1QYXR0ZXJuUmVnaXN0cnkge1xuXHRvblJlYWR5KCk6IFByb21pc2U8dm9pZD47XG5cblx0Z2V0KGtleTogc3RyaW5nKTogSVByb2JsZW1QYXR0ZXJuIHwgTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm47XG59XG5cbmNsYXNzIFByb2JsZW1QYXR0ZXJuUmVnaXN0cnlJbXBsIGltcGxlbWVudHMgSVByb2JsZW1QYXR0ZXJuUmVnaXN0cnkge1xuXG5cdHByaXZhdGUgcGF0dGVybnM6IElTdHJpbmdEaWN0aW9uYXJ5PFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+Pjtcblx0cHJpdmF0ZSByZWFkeVByb21pc2U6IFByb21pc2U8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5wYXR0ZXJucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5maWxsRGVmYXVsdHMoKTtcblx0XHR0aGlzLnJlYWR5UHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHByb2JsZW1QYXR0ZXJuRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdFx0Ly8gV2UgZ2V0IGFsbCBzdGF0aWNhbGx5IGtub3cgZXh0ZW5zaW9uIGR1cmluZyBzdGFydHVwIGluIG9uZSBiYXRjaFxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGRlbHRhLnJlbW92ZWQuZm9yRWFjaChleHRlbnNpb24gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm5zID0gZXh0ZW5zaW9uLnZhbHVlIGFzIENvbmZpZy5OYW1lZFByb2JsZW1QYXR0ZXJucztcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwcm9ibGVtUGF0dGVybnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMucGF0dGVybnNbcGF0dGVybi5uYW1lXSkge1xuXHRcdFx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLnBhdHRlcm5zW3BhdHRlcm4ubmFtZV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRkZWx0YS5hZGRlZC5mb3JFYWNoKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9ibGVtUGF0dGVybnMgPSBleHRlbnNpb24udmFsdWUgYXMgQ29uZmlnLk5hbWVkUHJvYmxlbVBhdHRlcm5zO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VyID0gbmV3IFByb2JsZW1QYXR0ZXJuUGFyc2VyKG5ldyBFeHRlbnNpb25SZWdpc3RyeVJlcG9ydGVyKGV4dGVuc2lvbi5jb2xsZWN0b3IpKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwcm9ibGVtUGF0dGVybnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKENvbmZpZy5OYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybi5pcyhwYXR0ZXJuKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlci5wYXJzZShwYXR0ZXJuKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VyLnByb2JsZW1SZXBvcnRlci5zdGF0dXMuc3RhdGUgPCBWYWxpZGF0aW9uU3RhdGUuRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWRkKHJlc3VsdC5uYW1lLCByZXN1bHQucGF0dGVybnMpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmVycm9yJywgJ0ludmFsaWQgcHJvYmxlbSBwYXR0ZXJuLiBUaGUgcGF0dGVybiB3aWxsIGJlIGlnbm9yZWQuJykpO1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihKU09OLnN0cmluZ2lmeShwYXR0ZXJuLCB1bmRlZmluZWQsIDQpKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0ZWxzZSBpZiAoQ29uZmlnLk5hbWVkUHJvYmxlbVBhdHRlcm4uaXMocGF0dGVybikpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2UocGF0dGVybik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHBhcnNlci5wcm9ibGVtUmVwb3J0ZXIuc3RhdHVzLnN0YXRlIDwgVmFsaWRhdGlvblN0YXRlLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmFkZChwYXR0ZXJuLm5hbWUsIHJlc3VsdCk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZXJyb3InLCAnSW52YWxpZCBwcm9ibGVtIHBhdHRlcm4uIFRoZSBwYXR0ZXJuIHdpbGwgYmUgaWdub3JlZC4nKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKEpTT04uc3RyaW5naWZ5KHBhdHRlcm4sIHVuZGVmaW5lZCwgNCkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwYXJzZXIucmVzZXQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBEbyBub3RoaW5nXG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb25SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWFkeVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgYWRkKGtleTogc3RyaW5nLCB2YWx1ZTogVHlwZXMuU2luZ2xlT3JNYW55PElQcm9ibGVtUGF0dGVybj4pOiB2b2lkIHtcblx0XHR0aGlzLnBhdHRlcm5zW2tleV0gPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoa2V5OiBzdHJpbmcpOiBUeXBlcy5TaW5nbGVPck1hbnk8SVByb2JsZW1QYXR0ZXJuPiB7XG5cdFx0cmV0dXJuIHRoaXMucGF0dGVybnNba2V5XTtcblx0fVxuXG5cdHByaXZhdGUgZmlsbERlZmF1bHRzKCk6IHZvaWQge1xuXHRcdHRoaXMuYWRkKCdtc0NvbXBpbGUnLCB7XG5cdFx0XHRyZWdleHA6IC9eXFxzKig/OlxccypcXGQrPik/KFxcUy4qPykoPzpcXCgoXFxkK3xcXGQrLFxcZCt8XFxkKyxcXGQrLFxcZCssXFxkKylcXCkpP1xccyo6XFxzKyg/OihcXFMrKVxccyspPygoPzpmYXRhbCArKT9lcnJvcnx3YXJuaW5nfGluZm8pXFxzKyhcXHcrXFxkKyk/XFxzKjpcXHMqKC4qKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdHNldmVyaXR5OiA0LFxuXHRcdFx0Y29kZTogNSxcblx0XHRcdG1lc3NhZ2U6IDZcblx0XHR9KTtcblx0XHR0aGlzLmFkZCgnZ3VscC10c2MnLCB7XG5cdFx0XHRyZWdleHA6IC9eKFteXFxzXS4qKVxcKChcXGQrfFxcZCssXFxkK3xcXGQrLFxcZCssXFxkKyxcXGQrKVxcKTpcXHMrKFxcZCspXFxzKyguKikkLyxcblx0XHRcdGtpbmQ6IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRmaWxlOiAxLFxuXHRcdFx0bG9jYXRpb246IDIsXG5cdFx0XHRjb2RlOiAzLFxuXHRcdFx0bWVzc2FnZTogNFxuXHRcdH0pO1xuXHRcdHRoaXMuYWRkKCdjcHAnLCB7XG5cdFx0XHRyZWdleHA6IC9eKFxcUy4qKVxcKChcXGQrfFxcZCssXFxkK3xcXGQrLFxcZCssXFxkKyxcXGQrKVxcKTpcXHMrKGVycm9yfHdhcm5pbmd8aW5mbylcXHMrKENcXGQrKVxccyo6XFxzKiguKikkLyxcblx0XHRcdGtpbmQ6IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRmaWxlOiAxLFxuXHRcdFx0bG9jYXRpb246IDIsXG5cdFx0XHRzZXZlcml0eTogMyxcblx0XHRcdGNvZGU6IDQsXG5cdFx0XHRtZXNzYWdlOiA1XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ2NzYycsIHtcblx0XHRcdHJlZ2V4cDogL14oXFxTLiopXFwoKFxcZCt8XFxkKyxcXGQrfFxcZCssXFxkKyxcXGQrLFxcZCspXFwpOlxccysoZXJyb3J8d2FybmluZ3xpbmZvKVxccysoQ1NcXGQrKVxccyo6XFxzKiguKikkLyxcblx0XHRcdGtpbmQ6IFByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRmaWxlOiAxLFxuXHRcdFx0bG9jYXRpb246IDIsXG5cdFx0XHRzZXZlcml0eTogMyxcblx0XHRcdGNvZGU6IDQsXG5cdFx0XHRtZXNzYWdlOiA1XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ3ZiJywge1xuXHRcdFx0cmVnZXhwOiAvXihcXFMuKilcXCgoXFxkK3xcXGQrLFxcZCt8XFxkKyxcXGQrLFxcZCssXFxkKylcXCk6XFxzKyhlcnJvcnx3YXJuaW5nfGluZm8pXFxzKyhCQ1xcZCspXFxzKjpcXHMqKC4qKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsb2NhdGlvbjogMixcblx0XHRcdHNldmVyaXR5OiAzLFxuXHRcdFx0Y29kZTogNCxcblx0XHRcdG1lc3NhZ2U6IDVcblx0XHR9KTtcblx0XHR0aGlzLmFkZCgnbGVzc0NvbXBpbGUnLCB7XG5cdFx0XHRyZWdleHA6IC9eXFxzKiguKikgaW4gZmlsZSAoLiopIGxpbmUgbm8uIChcXGQrKSQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdG1lc3NhZ2U6IDEsXG5cdFx0XHRmaWxlOiAyLFxuXHRcdFx0bGluZTogM1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkKCdqc2hpbnQnLCB7XG5cdFx0XHRyZWdleHA6IC9eKC4qKTpcXHMrbGluZVxccysoXFxkKyksXFxzK2NvbFxccysoXFxkKyksXFxzKC4rPykoPzpcXHMrXFwoKFxcdykoXFxkKylcXCkpPyQvLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRsaW5lOiAyLFxuXHRcdFx0Y2hhcmFjdGVyOiAzLFxuXHRcdFx0bWVzc2FnZTogNCxcblx0XHRcdHNldmVyaXR5OiA1LFxuXHRcdFx0Y29kZTogNlxuXHRcdH0pO1xuXHRcdHRoaXMuYWRkKCdqc2hpbnQtc3R5bGlzaCcsIFtcblx0XHRcdHtcblx0XHRcdFx0cmVnZXhwOiAvXiguKykkLyxcblx0XHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdFx0ZmlsZTogMVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cmVnZXhwOiAvXlxccytsaW5lXFxzKyhcXGQrKVxccytjb2xcXHMrKFxcZCspXFxzKyguKz8pKD86XFxzK1xcKChcXHcpKFxcZCspXFwpKT8kLyxcblx0XHRcdFx0bGluZTogMSxcblx0XHRcdFx0Y2hhcmFjdGVyOiAyLFxuXHRcdFx0XHRtZXNzYWdlOiAzLFxuXHRcdFx0XHRzZXZlcml0eTogNCxcblx0XHRcdFx0Y29kZTogNSxcblx0XHRcdFx0bG9vcDogdHJ1ZVxuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdHRoaXMuYWRkKCdlc2xpbnQtY29tcGFjdCcsIHtcblx0XHRcdHJlZ2V4cDogL14oLispOlxcc2xpbmVcXHMoXFxkKyksXFxzY29sXFxzKFxcZCspLFxccyhFcnJvcnxXYXJuaW5nfEluZm8pXFxzLVxccyguKylcXHNcXCgoLispXFwpJC8sXG5cdFx0XHRmaWxlOiAxLFxuXHRcdFx0a2luZDogUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbixcblx0XHRcdGxpbmU6IDIsXG5cdFx0XHRjaGFyYWN0ZXI6IDMsXG5cdFx0XHRzZXZlcml0eTogNCxcblx0XHRcdG1lc3NhZ2U6IDUsXG5cdFx0XHRjb2RlOiA2XG5cdFx0fSk7XG5cdFx0dGhpcy5hZGQoJ2VzbGludC1zdHlsaXNoJywgW1xuXHRcdFx0e1xuXHRcdFx0XHRyZWdleHA6IC9eKCg/OlthLXpBLVpdOikqWy4vXFxcXF0rLio/KSQvLFxuXHRcdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0XHRmaWxlOiAxXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZWdleHA6IC9eXFxzKyhcXGQrKTooXFxkKylcXHMrKGVycm9yfHdhcm5pbmd8aW5mbylcXHMrKC4rPykoPzpcXHNcXHMrKC4qKSk/JC8sXG5cdFx0XHRcdGxpbmU6IDEsXG5cdFx0XHRcdGNoYXJhY3RlcjogMixcblx0XHRcdFx0c2V2ZXJpdHk6IDMsXG5cdFx0XHRcdG1lc3NhZ2U6IDQsXG5cdFx0XHRcdGNvZGU6IDUsXG5cdFx0XHRcdGxvb3A6IHRydWVcblx0XHRcdH1cblx0XHRdKTtcblx0XHR0aGlzLmFkZCgnZ28nLCB7XG5cdFx0XHRyZWdleHA6IC9eKFteOl0qOiApPygoLjopP1teOl0qKTooXFxkKykoOihcXGQrKSk/OiAoLiopJC8sXG5cdFx0XHRraW5kOiBQcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0ZmlsZTogMixcblx0XHRcdGxpbmU6IDQsXG5cdFx0XHRjaGFyYWN0ZXI6IDYsXG5cdFx0XHRtZXNzYWdlOiA3XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnk6IElQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5ID0gbmV3IFByb2JsZW1QYXR0ZXJuUmVnaXN0cnlJbXBsKCk7XG5cbmV4cG9ydCBjbGFzcyBQcm9ibGVtTWF0Y2hlclBhcnNlciBleHRlbmRzIFBhcnNlciB7XG5cblx0Y29uc3RydWN0b3IobG9nZ2VyOiBJUHJvYmxlbVJlcG9ydGVyKSB7XG5cdFx0c3VwZXIobG9nZ2VyKTtcblx0fVxuXG5cdHB1YmxpYyBwYXJzZShqc29uOiBDb25maWcuUHJvYmxlbU1hdGNoZXIpOiBQcm9ibGVtTWF0Y2hlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jcmVhdGVQcm9ibGVtTWF0Y2hlcihqc29uKTtcblx0XHRpZiAoIXRoaXMuY2hlY2tQcm9ibGVtTWF0Y2hlclZhbGlkKGpzb24sIHJlc3VsdCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuYWRkV2F0Y2hpbmdNYXRjaGVyKGpzb24sIHJlc3VsdCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja1Byb2JsZW1NYXRjaGVyVmFsaWQoZXh0ZXJuYWxQcm9ibGVtTWF0Y2hlcjogQ29uZmlnLlByb2JsZW1NYXRjaGVyLCBwcm9ibGVtTWF0Y2hlcjogUHJvYmxlbU1hdGNoZXIgfCBudWxsKTogcHJvYmxlbU1hdGNoZXIgaXMgUHJvYmxlbU1hdGNoZXIge1xuXHRcdGlmICghcHJvYmxlbU1hdGNoZXIpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLm5vUHJvYmxlbU1hdGNoZXInLCAnRXJyb3I6IHRoZSBkZXNjcmlwdGlvbiBjYW5cXCd0IGJlIGNvbnZlcnRlZCBpbnRvIGEgcHJvYmxlbSBtYXRjaGVyOlxcbnswfVxcbicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsUHJvYmxlbU1hdGNoZXIsIG51bGwsIDQpKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghcHJvYmxlbU1hdGNoZXIucGF0dGVybikge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIubm9Qcm9ibGVtUGF0dGVybicsICdFcnJvcjogdGhlIGRlc2NyaXB0aW9uIGRvZXNuXFwndCBkZWZpbmUgYSB2YWxpZCBwcm9ibGVtIHBhdHRlcm46XFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWxQcm9ibGVtTWF0Y2hlciwgbnVsbCwgNCkpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFwcm9ibGVtTWF0Y2hlci5vd25lcikge1xuXHRcdFx0dGhpcy5lcnJvcihsb2NhbGl6ZSgnUHJvYmxlbU1hdGNoZXJQYXJzZXIubm9Pd25lcicsICdFcnJvcjogdGhlIGRlc2NyaXB0aW9uIGRvZXNuXFwndCBkZWZpbmUgYW4gb3duZXI6XFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWxQcm9ibGVtTWF0Y2hlciwgbnVsbCwgNCkpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKFR5cGVzLmlzVW5kZWZpbmVkKHByb2JsZW1NYXRjaGVyLmZpbGVMb2NhdGlvbikpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLm5vRmlsZUxvY2F0aW9uJywgJ0Vycm9yOiB0aGUgZGVzY3JpcHRpb24gZG9lc25cXCd0IGRlZmluZSBhIGZpbGUgbG9jYXRpb246XFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWxQcm9ibGVtTWF0Y2hlciwgbnVsbCwgNCkpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByb2JsZW1NYXRjaGVyKGRlc2NyaXB0aW9uOiBDb25maWcuUHJvYmxlbU1hdGNoZXIpOiBQcm9ibGVtTWF0Y2hlciB8IG51bGwge1xuXHRcdGxldCByZXN1bHQ6IFByb2JsZW1NYXRjaGVyIHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBvd25lciA9IFR5cGVzLmlzU3RyaW5nKGRlc2NyaXB0aW9uLm93bmVyKSA/IGRlc2NyaXB0aW9uLm93bmVyIDogVVVJRC5nZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBzb3VyY2UgPSBUeXBlcy5pc1N0cmluZyhkZXNjcmlwdGlvbi5zb3VyY2UpID8gZGVzY3JpcHRpb24uc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdGxldCBhcHBseVRvID0gVHlwZXMuaXNTdHJpbmcoZGVzY3JpcHRpb24uYXBwbHlUbykgPyBBcHBseVRvS2luZC5mcm9tU3RyaW5nKGRlc2NyaXB0aW9uLmFwcGx5VG8pIDogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzO1xuXHRcdGlmICghYXBwbHlUbykge1xuXHRcdFx0YXBwbHlUbyA9IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cztcblx0XHR9XG5cdFx0bGV0IGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZmlsZVByZWZpeDogc3RyaW5nIHwgQ29uZmlnLlNlYXJjaEZpbGVMb2NhdGlvbkFyZ3MgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRsZXQga2luZDogRmlsZUxvY2F0aW9uS2luZCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoVHlwZXMuaXNVbmRlZmluZWQoZGVzY3JpcHRpb24uZmlsZUxvY2F0aW9uKSkge1xuXHRcdFx0ZmlsZUxvY2F0aW9uID0gRmlsZUxvY2F0aW9uS2luZC5SZWxhdGl2ZTtcblx0XHRcdGZpbGVQcmVmaXggPSAnJHt3b3Jrc3BhY2VGb2xkZXJ9Jztcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nKGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvbikpIHtcblx0XHRcdGtpbmQgPSBGaWxlTG9jYXRpb25LaW5kLmZyb21TdHJpbmcoPHN0cmluZz5kZXNjcmlwdGlvbi5maWxlTG9jYXRpb24pO1xuXHRcdFx0aWYgKGtpbmQpIHtcblx0XHRcdFx0ZmlsZUxvY2F0aW9uID0ga2luZDtcblx0XHRcdFx0aWYgKChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlKSB8fCAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5BdXRvRGV0ZWN0KSkge1xuXHRcdFx0XHRcdGZpbGVQcmVmaXggPSAnJHt3b3Jrc3BhY2VGb2xkZXJ9Jztcblx0XHRcdFx0fSBlbHNlIGlmIChraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLlNlYXJjaCkge1xuXHRcdFx0XHRcdGZpbGVQcmVmaXggPSB7IGluY2x1ZGU6IFsnJHt3b3Jrc3BhY2VGb2xkZXJ9J10gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNTdHJpbmdBcnJheShkZXNjcmlwdGlvbi5maWxlTG9jYXRpb24pKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSA8c3RyaW5nW10+ZGVzY3JpcHRpb24uZmlsZUxvY2F0aW9uO1xuXHRcdFx0aWYgKHZhbHVlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGtpbmQgPSBGaWxlTG9jYXRpb25LaW5kLmZyb21TdHJpbmcodmFsdWVzWzBdKTtcblx0XHRcdFx0aWYgKHZhbHVlcy5sZW5ndGggPT09IDEgJiYga2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSkge1xuXHRcdFx0XHRcdGZpbGVMb2NhdGlvbiA9IGtpbmQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWVzLmxlbmd0aCA9PT0gMiAmJiAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5SZWxhdGl2ZSB8fCBraW5kID09PSBGaWxlTG9jYXRpb25LaW5kLkF1dG9EZXRlY3QpICYmIHZhbHVlc1sxXSkge1xuXHRcdFx0XHRcdGZpbGVMb2NhdGlvbiA9IGtpbmQ7XG5cdFx0XHRcdFx0ZmlsZVByZWZpeCA9IHZhbHVlc1sxXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkZXNjcmlwdGlvbi5maWxlTG9jYXRpb24pKSB7XG5cdFx0XHRjb25zdCBraW5kID0gRmlsZUxvY2F0aW9uS2luZC5mcm9tU3RyaW5nKGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvblswXSk7XG5cdFx0XHRpZiAoa2luZCA9PT0gRmlsZUxvY2F0aW9uS2luZC5TZWFyY2gpIHtcblx0XHRcdFx0ZmlsZUxvY2F0aW9uID0gRmlsZUxvY2F0aW9uS2luZC5TZWFyY2g7XG5cdFx0XHRcdGZpbGVQcmVmaXggPSBkZXNjcmlwdGlvbi5maWxlTG9jYXRpb25bMV0gPz8geyBpbmNsdWRlOiBbJyR7d29ya3NwYWNlRm9sZGVyfSddIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0dGVybiA9IGRlc2NyaXB0aW9uLnBhdHRlcm4gPyB0aGlzLmNyZWF0ZVByb2JsZW1QYXR0ZXJuKGRlc2NyaXB0aW9uLnBhdHRlcm4pIDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IHNldmVyaXR5ID0gZGVzY3JpcHRpb24uc2V2ZXJpdHkgPyBTZXZlcml0eS5mcm9tVmFsdWUoZGVzY3JpcHRpb24uc2V2ZXJpdHkpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzZXZlcml0eSA9PT0gU2V2ZXJpdHkuSWdub3JlKSB7XG5cdFx0XHR0aGlzLmluZm8obG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLnVua25vd25TZXZlcml0eScsICdJbmZvOiB1bmtub3duIHNldmVyaXR5IHswfS4gVmFsaWQgdmFsdWVzIGFyZSBlcnJvciwgd2FybmluZyBhbmQgaW5mby5cXG4nLCBkZXNjcmlwdGlvbi5zZXZlcml0eSkpO1xuXHRcdFx0c2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHR9XG5cblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZGVzY3JpcHRpb24uYmFzZSkpIHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlTmFtZSA9IDxzdHJpbmc+ZGVzY3JpcHRpb24uYmFzZTtcblx0XHRcdGlmICh2YXJpYWJsZU5hbWUubGVuZ3RoID4gMSAmJiB2YXJpYWJsZU5hbWVbMF0gPT09ICckJykge1xuXHRcdFx0XHRjb25zdCBiYXNlID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFyaWFibGVOYW1lLnN1YnN0cmluZygxKSk7XG5cdFx0XHRcdGlmIChiYXNlKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gT2JqZWN0cy5kZWVwQ2xvbmUoYmFzZSk7XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uLm93bmVyICE9PSB1bmRlZmluZWQgJiYgb3duZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0Lm93bmVyID0gb3duZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbi5zb3VyY2UgIT09IHVuZGVmaW5lZCAmJiBzb3VyY2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnNvdXJjZSA9IHNvdXJjZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uLmZpbGVMb2NhdGlvbiAhPT0gdW5kZWZpbmVkICYmIGZpbGVMb2NhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuZmlsZUxvY2F0aW9uID0gZmlsZUxvY2F0aW9uO1xuXHRcdFx0XHRcdFx0cmVzdWx0LmZpbGVQcmVmaXggPSBmaWxlUHJlZml4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRpb24ucGF0dGVybiAhPT0gdW5kZWZpbmVkICYmIHBhdHRlcm4gIT09IHVuZGVmaW5lZCAmJiBwYXR0ZXJuICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucGF0dGVybiA9IHBhdHRlcm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbi5zZXZlcml0eSAhPT0gdW5kZWZpbmVkICYmIHNldmVyaXR5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zZXZlcml0eSA9IHNldmVyaXR5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRpb24uYXBwbHlUbyAhPT0gdW5kZWZpbmVkICYmIGFwcGx5VG8gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LmFwcGx5VG8gPSBhcHBseVRvO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZmlsZUxvY2F0aW9uICYmIHBhdHRlcm4pIHtcblx0XHRcdHJlc3VsdCA9IHtcblx0XHRcdFx0b3duZXI6IG93bmVyLFxuXHRcdFx0XHRhcHBseVRvOiBhcHBseVRvLFxuXHRcdFx0XHRmaWxlTG9jYXRpb246IGZpbGVMb2NhdGlvbixcblx0XHRcdFx0cGF0dGVybjogcGF0dGVybixcblx0XHRcdH07XG5cdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdHJlc3VsdC5zb3VyY2UgPSBzb3VyY2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlsZVByZWZpeCkge1xuXHRcdFx0XHRyZXN1bHQuZmlsZVByZWZpeCA9IGZpbGVQcmVmaXg7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2V2ZXJpdHkpIHtcblx0XHRcdFx0cmVzdWx0LnNldmVyaXR5ID0gc2V2ZXJpdHk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChDb25maWcuaXNOYW1lZFByb2JsZW1NYXRjaGVyKGRlc2NyaXB0aW9uKSkge1xuXHRcdFx0KHJlc3VsdCBhcyBJTmFtZWRQcm9ibGVtTWF0Y2hlcikubmFtZSA9IGRlc2NyaXB0aW9uLm5hbWU7XG5cdFx0XHQocmVzdWx0IGFzIElOYW1lZFByb2JsZW1NYXRjaGVyKS5sYWJlbCA9IFR5cGVzLmlzU3RyaW5nKGRlc2NyaXB0aW9uLmxhYmVsKSA/IGRlc2NyaXB0aW9uLmxhYmVsIDogZGVzY3JpcHRpb24ubmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUHJvYmxlbVBhdHRlcm4odmFsdWU6IHN0cmluZyB8IENvbmZpZy5JUHJvYmxlbVBhdHRlcm4gfCBDb25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4pOiBUeXBlcy5TaW5nbGVPck1hbnk8SVByb2JsZW1QYXR0ZXJuPiB8IG51bGwge1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlTmFtZTogc3RyaW5nID0gPHN0cmluZz52YWx1ZTtcblx0XHRcdGlmICh2YXJpYWJsZU5hbWUubGVuZ3RoID4gMSAmJiB2YXJpYWJsZU5hbWVbMF0gPT09ICckJykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCh2YXJpYWJsZU5hbWUuc3Vic3RyaW5nKDEpKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5ub0RlZmluZWRQYXR0ZXInLCAnRXJyb3I6IHRoZSBwYXR0ZXJuIHdpdGggdGhlIGlkZW50aWZpZXIgezB9IGRvZXNuXFwndCBleGlzdC4nLCB2YXJpYWJsZU5hbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHZhcmlhYmxlTmFtZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5ub0lkZW50aWZpZXInLCAnRXJyb3I6IHRoZSBwYXR0ZXJuIHByb3BlcnR5IHJlZmVycyB0byBhbiBlbXB0eSBpZGVudGlmaWVyLicpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5ub1ZhbGlkSWRlbnRpZmllcicsICdFcnJvcjogdGhlIHBhdHRlcm4gcHJvcGVydHkgezB9IGlzIG5vdCBhIHZhbGlkIHBhdHRlcm4gdmFyaWFibGUgbmFtZS4nLCB2YXJpYWJsZU5hbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodmFsdWUpIHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuUGFyc2VyID0gbmV3IFByb2JsZW1QYXR0ZXJuUGFyc2VyKHRoaXMucHJvYmxlbVJlcG9ydGVyKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gcHJvYmxlbVBhdHRlcm5QYXJzZXIucGFyc2UodmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHByb2JsZW1QYXR0ZXJuUGFyc2VyLnBhcnNlKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFkZFdhdGNoaW5nTWF0Y2hlcihleHRlcm5hbDogQ29uZmlnLlByb2JsZW1NYXRjaGVyLCBpbnRlcm5hbDogUHJvYmxlbU1hdGNoZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRCZWdpbnMgPSB0aGlzLmNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKGV4dGVybmFsLndhdGNoZWRUYXNrQmVnaW5zUmVnRXhwKTtcblx0XHRjb25zdCBvbGRFbmRzID0gdGhpcy5jcmVhdGVSZWd1bGFyRXhwcmVzc2lvbihleHRlcm5hbC53YXRjaGVkVGFza0VuZHNSZWdFeHApO1xuXHRcdGlmIChvbGRCZWdpbnMgJiYgb2xkRW5kcykge1xuXHRcdFx0aW50ZXJuYWwud2F0Y2hpbmcgPSB7XG5cdFx0XHRcdGFjdGl2ZU9uU3RhcnQ6IGZhbHNlLFxuXHRcdFx0XHRiZWdpbnNQYXR0ZXJuOiB7IHJlZ2V4cDogb2xkQmVnaW5zIH0sXG5cdFx0XHRcdGVuZHNQYXR0ZXJuOiB7IHJlZ2V4cDogb2xkRW5kcyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYWNrZ3JvdW5kTW9uaXRvciA9IGV4dGVybmFsLmJhY2tncm91bmQgfHwgZXh0ZXJuYWwud2F0Y2hpbmc7XG5cdFx0aWYgKFR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKGJhY2tncm91bmRNb25pdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiZWdpbnM6IElXYXRjaGluZ1BhdHRlcm4gfCBudWxsID0gdGhpcy5jcmVhdGVXYXRjaGluZ1BhdHRlcm4oYmFja2dyb3VuZE1vbml0b3IuYmVnaW5zUGF0dGVybik7XG5cdFx0Y29uc3QgZW5kczogSVdhdGNoaW5nUGF0dGVybiB8IG51bGwgPSB0aGlzLmNyZWF0ZVdhdGNoaW5nUGF0dGVybihiYWNrZ3JvdW5kTW9uaXRvci5lbmRzUGF0dGVybik7XG5cdFx0aWYgKGJlZ2lucyAmJiBlbmRzKSB7XG5cdFx0XHRpbnRlcm5hbC53YXRjaGluZyA9IHtcblx0XHRcdFx0YWN0aXZlT25TdGFydDogVHlwZXMuaXNCb29sZWFuKGJhY2tncm91bmRNb25pdG9yLmFjdGl2ZU9uU3RhcnQpID8gYmFja2dyb3VuZE1vbml0b3IuYWN0aXZlT25TdGFydCA6IGZhbHNlLFxuXHRcdFx0XHRiZWdpbnNQYXR0ZXJuOiBiZWdpbnMsXG5cdFx0XHRcdGVuZHNQYXR0ZXJuOiBlbmRzXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYmVnaW5zIHx8IGVuZHMpIHtcblx0XHRcdHRoaXMuZXJyb3IobG9jYWxpemUoJ1Byb2JsZW1NYXRjaGVyUGFyc2VyLnByb2JsZW1QYXR0ZXJuLndhdGNoaW5nTWF0Y2hlcicsICdBIHByb2JsZW0gbWF0Y2hlciBtdXN0IGRlZmluZSBib3RoIGEgYmVnaW4gcGF0dGVybiBhbmQgYW4gZW5kIHBhdHRlcm4gZm9yIHdhdGNoaW5nLicpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdhdGNoaW5nUGF0dGVybihleHRlcm5hbDogc3RyaW5nIHwgQ29uZmlnLklXYXRjaGluZ1BhdHRlcm4gfCB1bmRlZmluZWQpOiBJV2F0Y2hpbmdQYXR0ZXJuIHwgbnVsbCB7XG5cdFx0aWYgKFR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKGV4dGVybmFsKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByZWdleHA6IFJlZ0V4cCB8IG51bGw7XG5cdFx0bGV0IGZpbGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwpKSB7XG5cdFx0XHRyZWdleHAgPSB0aGlzLmNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKGV4dGVybmFsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVnZXhwID0gdGhpcy5jcmVhdGVSZWd1bGFyRXhwcmVzc2lvbihleHRlcm5hbC5yZWdleHApO1xuXHRcdFx0aWYgKFR5cGVzLmlzTnVtYmVyKGV4dGVybmFsLmZpbGUpKSB7XG5cdFx0XHRcdGZpbGUgPSBleHRlcm5hbC5maWxlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXJlZ2V4cCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBmaWxlID8geyByZWdleHAsIGZpbGUgfSA6IHsgcmVnZXhwLCBmaWxlOiAxIH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlZ3VsYXJFeHByZXNzaW9uKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBSZWdFeHAgfCBudWxsIHtcblx0XHRsZXQgcmVzdWx0OiBSZWdFeHAgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gbmV3IFJlZ0V4cCh2YWx1ZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmVycm9yKGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlclBhcnNlci5pbnZhbGlkUmVnZXhwJywgJ0Vycm9yOiBUaGUgc3RyaW5nIHswfSBpcyBub3QgYSB2YWxpZCByZWd1bGFyIGV4cHJlc3Npb24uXFxuJywgdmFsdWUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jb25zdCBwcm9ibGVtTWF0Y2hlcnNFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PENvbmZpZy5JTmFtZWRQcm9ibGVtTWF0Y2hlcltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAncHJvYmxlbU1hdGNoZXJzJyxcblx0ZGVwczogW3Byb2JsZW1QYXR0ZXJuRXh0UG9pbnRdLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdQcm9ibGVtTWF0Y2hlckV4dFBvaW50JywgJ0NvbnRyaWJ1dGVzIHByb2JsZW0gbWF0Y2hlcnMnKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiBTY2hlbWFzLk5hbWVkUHJvYmxlbU1hdGNoZXJcblx0fVxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2JsZW1NYXRjaGVyUmVnaXN0cnkge1xuXHRvblJlYWR5KCk6IFByb21pc2U8dm9pZD47XG5cdGdldChuYW1lOiBzdHJpbmcpOiBJTmFtZWRQcm9ibGVtTWF0Y2hlcjtcblx0a2V5cygpOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgb25NYXRjaGVyQ2hhbmdlZDogRXZlbnQ8dm9pZD47XG59XG5cbmNsYXNzIFByb2JsZW1NYXRjaGVyUmVnaXN0cnlJbXBsIGltcGxlbWVudHMgSVByb2JsZW1NYXRjaGVyUmVnaXN0cnkge1xuXG5cdHByaXZhdGUgbWF0Y2hlcnM6IElTdHJpbmdEaWN0aW9uYXJ5PElOYW1lZFByb2JsZW1NYXRjaGVyPjtcblx0cHJpdmF0ZSByZWFkeVByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWF0Y2hlcnNDaGFuZ2VkOiBFbWl0dGVyPHZvaWQ+ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTWF0Y2hlckNoYW5nZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25NYXRjaGVyc0NoYW5nZWQuZXZlbnQ7XG5cblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLm1hdGNoZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmZpbGxEZWZhdWx0cygpO1xuXHRcdHRoaXMucmVhZHlQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0cHJvYmxlbU1hdGNoZXJzRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkZWx0YS5yZW1vdmVkLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb2JsZW1NYXRjaGVycyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbWF0Y2hlciBvZiBwcm9ibGVtTWF0Y2hlcnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMubWF0Y2hlcnNbbWF0Y2hlci5uYW1lXSkge1xuXHRcdFx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLm1hdGNoZXJzW21hdGNoZXIubmFtZV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRkZWx0YS5hZGRlZC5mb3JFYWNoKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9ibGVtTWF0Y2hlcnMgPSBleHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJzZXIgPSBuZXcgUHJvYmxlbU1hdGNoZXJQYXJzZXIobmV3IEV4dGVuc2lvblJlZ2lzdHJ5UmVwb3J0ZXIoZXh0ZW5zaW9uLmNvbGxlY3RvcikpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtYXRjaGVyIG9mIHByb2JsZW1NYXRjaGVycykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZXIucGFyc2UobWF0Y2hlcik7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXN1bHQgJiYgaXNOYW1lZFByb2JsZW1NYXRjaGVyKHJlc3VsdCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmFkZChyZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKChkZWx0YS5yZW1vdmVkLmxlbmd0aCA+IDApIHx8IChkZWx0YS5hZGRlZC5sZW5ndGggPiAwKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25NYXRjaGVyc0NoYW5nZWQuZmlyZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtYXRjaGVyID0gdGhpcy5nZXQoJ3RzYy13YXRjaCcpO1xuXHRcdFx0XHRpZiAobWF0Y2hlcikge1xuXHRcdFx0XHRcdChtYXRjaGVyIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnRzY1dhdGNoID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvblJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFByb2JsZW1QYXR0ZXJuUmVnaXN0cnkub25SZWFkeSgpO1xuXHRcdHJldHVybiB0aGlzLnJlYWR5UHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBhZGQobWF0Y2hlcjogSU5hbWVkUHJvYmxlbU1hdGNoZXIpOiB2b2lkIHtcblx0XHR0aGlzLm1hdGNoZXJzW21hdGNoZXIubmFtZV0gPSBtYXRjaGVyO1xuXHR9XG5cblx0cHVibGljIGdldChuYW1lOiBzdHJpbmcpOiBJTmFtZWRQcm9ibGVtTWF0Y2hlciB7XG5cdFx0cmV0dXJuIHRoaXMubWF0Y2hlcnNbbmFtZV07XG5cdH1cblxuXHRwdWJsaWMga2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRoaXMubWF0Y2hlcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxsRGVmYXVsdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ21zQ29tcGlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21zQ29tcGlsZScsICdNaWNyb3NvZnQgY29tcGlsZXIgcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnbXNDb21waWxlJyxcblx0XHRcdHNvdXJjZTogJ2NwcCcsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbXNDb21waWxlJylcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkKHtcblx0XHRcdG5hbWU6ICdsZXNzQ29tcGlsZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlc3NDb21waWxlJywgJ0xlc3MgcHJvYmxlbXMnKSxcblx0XHRcdGRlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHRvd25lcjogJ2xlc3NDb21waWxlJyxcblx0XHRcdHNvdXJjZTogJ2xlc3MnLFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0cGF0dGVybjogUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5nZXQoJ2xlc3NDb21waWxlJyksXG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3Jcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkKHtcblx0XHRcdG5hbWU6ICdndWxwLXRzYycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2d1bHAtdHNjJywgJ0d1bHAgVFNDIFByb2JsZW1zJyksXG5cdFx0XHRvd25lcjogJ3R5cGVzY3JpcHQnLFxuXHRcdFx0c291cmNlOiAndHMnLFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuY2xvc2VkRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlLFxuXHRcdFx0ZmlsZVByZWZpeDogJyR7d29ya3NwYWNlRm9sZGVyfScsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnZ3VscC10c2MnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2pzaGludCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2pzaGludCcsICdKU0hpbnQgcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnanNoaW50Jyxcblx0XHRcdHNvdXJjZTogJ2pzaGludCcsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnanNoaW50Jylcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkKHtcblx0XHRcdG5hbWU6ICdqc2hpbnQtc3R5bGlzaCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2pzaGludC1zdHlsaXNoJywgJ0pTSGludCBzdHlsaXNoIHByb2JsZW1zJyksXG5cdFx0XHRvd25lcjogJ2pzaGludCcsXG5cdFx0XHRzb3VyY2U6ICdqc2hpbnQnLFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0cGF0dGVybjogUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5nZXQoJ2pzaGludC1zdHlsaXNoJylcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkKHtcblx0XHRcdG5hbWU6ICdlc2xpbnQtY29tcGFjdCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2VzbGludC1jb21wYWN0JywgJ0VTTGludCBjb21wYWN0IHByb2JsZW1zJyksXG5cdFx0XHRvd25lcjogJ2VzbGludCcsXG5cdFx0XHRzb3VyY2U6ICdlc2xpbnQnLFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0ZmlsZVByZWZpeDogJyR7d29ya3NwYWNlRm9sZGVyfScsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnZXNsaW50LWNvbXBhY3QnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2VzbGludC1zdHlsaXNoJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXNsaW50LXN0eWxpc2gnLCAnRVNMaW50IHN0eWxpc2ggcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnZXNsaW50Jyxcblx0XHRcdHNvdXJjZTogJ2VzbGludCcsXG5cdFx0XHRhcHBseVRvOiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnZXNsaW50LXN0eWxpc2gnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGQoe1xuXHRcdFx0bmFtZTogJ2dvJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ28nLCAnR28gcHJvYmxlbXMnKSxcblx0XHRcdG93bmVyOiAnZ28nLFxuXHRcdFx0c291cmNlOiAnZ28nLFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBGaWxlTG9jYXRpb25LaW5kLlJlbGF0aXZlLFxuXHRcdFx0ZmlsZVByZWZpeDogJyR7d29ya3NwYWNlRm9sZGVyfScsXG5cdFx0XHRwYXR0ZXJuOiBQcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnZ28nKVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5OiBJUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSA9IG5ldyBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5SW1wbCgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsWUFBWSxhQUFhO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxNQUFNLGlCQUFpQjtBQUNoQyxZQUFZLFdBQVc7QUFDdkIsWUFBWSxVQUFVO0FBQ3RCLFlBQVksY0FBYztB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QUEsSUFDckQsQ0FBQztBQUVELFNBQUssSUFBSTtBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sT0FBTyxTQUFTLGtCQUFrQix5QkFBeUI7QUFBQSxNQUMzRCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixTQUFTLHVCQUF1QixJQUFJLGdCQUFnQjtBQUFBLElBQ3JELENBQUM7QUFFRCxTQUFLLElBQUk7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLE9BQU8sU0FBUyxrQkFBa0IseUJBQXlCO0FBQUEsTUFDM0QsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsY0FBYztBQUFBLE1BQ2QsU0FBUyx1QkFBdUIsSUFBSSxnQkFBZ0I7QUFBQSxJQUNyRCxDQUFDO0FBRUQsU0FBSyxJQUFJO0FBQUEsTUFDUixNQUFNO0FBQUEsTUFDTixPQUFPLFNBQVMsTUFBTSxhQUFhO0FBQUEsTUFDbkMsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsY0FBYztBQUFBLE1BQ2QsWUFBWTtBQUFBLE1BQ1osU0FBUyx1QkFBdUIsSUFBSSxJQUFJO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQUVPLE1BQU0seUJBQWtELElBQUksMkJBQTJCOyIsCiAgIm5hbWVzIjogWyJGaWxlTG9jYXRpb25LaW5kIiwgIlByb2JsZW1Mb2NhdGlvbktpbmQiLCAiQXBwbHlUb0tpbmQiLCAiQ29uZmlnIiwgIkNoZWNrZWRQcm9ibGVtUGF0dGVybiIsICJOYW1lZFByb2JsZW1QYXR0ZXJuIiwgIk5hbWVkQ2hlY2tlZFByb2JsZW1QYXR0ZXJuIiwgIk11bHRpTGluZVByb2JsZW1QYXR0ZXJuIiwgIk11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiIsICJOYW1lZE11bHRpTGluZUNoZWNrZWRQcm9ibGVtUGF0dGVybiIsICJpc05hbWVkUHJvYmxlbU1hdGNoZXIiLCAicmVzdWx0IiwgInZhbHVlIiwgIlNjaGVtYXMiLCAia2luZCIsICJtYXRjaGVyIl0KfQo=
